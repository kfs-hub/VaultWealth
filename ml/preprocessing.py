"""
VaultWealth — Machine Learning Data Preprocessing Module
Phase 11: Machine Learning Expense Prediction
"""

import csv
from datetime import datetime
from collections import defaultdict


def load_data(filepath):
    """
    Reads a transaction CSV file and returns a list of dictionaries.
    Compatible with Supabase exported CSV or VaultWealth export format.
    """
    records = []
    with open(filepath, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records


def clean_data(records):
    """
    Cleans raw transaction records:
    - Filters only 'expense' records
    - Ensures amount is a positive float
    - Validates date format (YYYY-MM-DD)
    """
    cleaned = []
    for r in records:
        try:
            tx_type = r.get('type', '').strip().lower()
            if tx_type != 'expense':
                continue

            amount = float(r.get('amount', 0))
            if amount <= 0:
                continue

            date_str = r.get('date', r.get('transaction_date', '')).strip()
            # Validate format
            datetime.strptime(date_str, '%Y-%m-%d')

            cleaned.append({
                'date': date_str,
                'amount': amount,
                'category': r.get('category', 'Other').strip(),
                'description': r.get('description', '').strip()
            })
        except (ValueError, TypeError):
            continue

    # Sort chronologically by date
    cleaned.sort(key=lambda x: x['date'])
    return cleaned


def aggregate_monthly(expenses):
    """
    Aggregates expenses by month ('YYYY-MM').
    Returns an ordered dictionary { '2025-10': 14200.0, '2025-11': 15650.0, ... }
    """
    monthly_totals = defaultdict(float)
    for tx in expenses:
        month_key = tx['date'][:7]  # YYYY-MM
        monthly_totals[month_key] += tx['amount']

    # Sort chronological keys
    sorted_keys = sorted(monthly_totals.keys())
    return {k: round(monthly_totals[k], 2) for k in sorted_keys}


def extract_features(monthly_series):
    """
    Transforms monthly aggregated series into feature matrix X and target y.
    X: Continuous time step indices [ [1], [2], ..., [N] ]
    y: Monthly expenditure values [ E1, E2, ..., EN ]
    labels: Human-readable month names ['Oct 2025', 'Nov 2025', ...]
    """
    months = list(monthly_series.keys())
    X = [[i + 1] for i in range(len(months))]
    y = [monthly_series[m] for m in months]

    # Convert YYYY-MM to readable labels
    labels = []
    for m in months:
        dt = datetime.strptime(m, '%Y-%m')
        labels.append(dt.strftime('%b %Y'))

    return X, y, labels


def get_summary_statistics(monthly_series):
    """
    Computes explainable statistical metrics on historical monthly expenditures.
    """
    amounts = list(monthly_series.values())
    if not amounts:
        return {}

    n = len(amounts)
    mean_val = sum(amounts) / n
    variance = sum((x - mean_val) ** 2 for x in amounts) / n
    std_dev = variance ** 0.5

    growth_rates = []
    for i in range(1, n):
        prev = amounts[i - 1]
        curr = amounts[i]
        if prev > 0:
            growth_rates.append(((curr - prev) / prev) * 100)

    avg_monthly_growth = sum(growth_rates) / len(growth_rates) if growth_rates else 0.0

    return {
        'total_months': n,
        'mean_monthly_expense': round(mean_val, 2),
        'std_deviation': round(std_dev, 2),
        'min_month_expense': round(min(amounts), 2),
        'max_month_expense': round(max(amounts), 2),
        'average_monthly_growth_pct': round(avg_monthly_growth, 2)
    }
