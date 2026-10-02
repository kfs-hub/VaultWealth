"""
VaultWealth — Machine Learning Expense Forecasting Pipeline
Phase 11: End-to-End Prediction Script

Usage:
    python ml/prediction.py
    python ml/prediction.py --data path/to/transactions.csv
"""

import sys
import os
import json
import argparse

# Enable UTF-8 encoding for Windows terminal stdout if supported
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add parent directory to path for imports
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

from preprocessing import load_data, clean_data, aggregate_monthly, extract_features, get_summary_statistics
from model import ExpensePredictionModel


def format_inr(amount):
    """Safe formatting helper for terminal display"""
    return f"Rs. {amount:,.2f}"


def run_pipeline(csv_path=None, output_json_path=None):
    if not csv_path:
        csv_path = os.path.join(current_dir, 'data', 'sample_historical_data.csv')

    print("=" * 65)
    print("       VAULTWEALTH -- AI/ML EXPENSE FORECASTING ENGINE        ")
    print("=" * 65)
    print(f"[1/4] Loading historical transactions from: {csv_path}")

    if not os.path.exists(csv_path):
        print(f"Error: Dataset not found at {csv_path}")
        return None

    raw_data = load_data(csv_path)
    cleaned = clean_data(raw_data)
    print(f"      Loaded {len(raw_data)} total records -> Cleaned {len(cleaned)} expense records.")

    # [2/4] Aggregation & Feature Extraction
    monthly_series = aggregate_monthly(cleaned)
    X, y, labels = extract_features(monthly_series)
    stats = get_summary_statistics(monthly_series)

    print(f"\n[2/4] Historical Monthly Expense Timeline ({len(monthly_series)} months):")
    for month_label, amt in zip(labels, y):
        bar = "#" * max(1, int(amt / 1000))
        print(f"      * {month_label:8s}: {format_inr(amt):>14s}  {bar}")

    print(f"\n      Mean Monthly Spend: {format_inr(stats['mean_monthly_expense'])}")
    print(f"      Avg Monthly Growth: {stats['average_monthly_growth_pct']:+.2f}%")

    # [3/4] Model Training
    print("\n[3/4] Training Ordinary Least Squares (OLS) Linear Regression Model...")
    model = ExpensePredictionModel()
    model.fit(X, y)
    summary = model.get_summary()

    print(f"      Model Equation  : Forecast = {format_inr(summary['intercept_beta0'])} + ({format_inr(summary['slope_beta1'])} x Month_t)")
    print(f"      Trend Direction : {summary['trend_direction']} ({format_inr(summary['slope_beta1'])} / month)")
    print(f"      Model Fit (R2)  : {summary['r2_score']} ({summary['accuracy_percentage']}% variance explained)")
    print(f"      Mean Abs Error  : {format_inr(summary['mae'])}")

    # [4/4] Generating Next-Month Forecast
    next_step = len(X) + 1
    forecast = model.predict(next_step)
    lower_bound, upper_bound = model.get_confidence_interval(forecast)

    print("\n[4/4] Forecast for Subsequent Month:")
    print("+" + "-" * 52 + "+")
    print(f"|  [*] Expected Total Expense : {format_inr(forecast):>18s}     |")
    print(f"|  [*] 95% Confidence Range   : {format_inr(lower_bound)} - {format_inr(upper_bound)} |")
    print(f"|  [*] Monthly Slope          : +{format_inr(summary['slope_beta1'])} / month  |")
    print("+" + "-" * 52 + "+")

    result = {
        'timestamp': os.path.getmtime(csv_path),
        'historical_months_count': len(X),
        'historical_data': [{'month': m, 'amount': a} for m, a in zip(labels, y)],
        'forecast_next_month': {
            'predicted_amount': forecast,
            'confidence_lower': lower_bound,
            'confidence_upper': upper_bound,
            'trend_slope': summary['slope_beta1'],
            'trend_direction': summary['trend_direction'],
            'r2_accuracy_score': summary['r2_score'],
            'mae_error': summary['mae'],
            'insight_text': f"Based on your {len(X)}-month spending trajectory, expenses are trending {summary['trend_direction'].lower()} by ~Rs. {abs(summary['slope_beta1']):,.0f} per month. We forecast next month's total spending at ~Rs. {forecast:,.0f} (range: Rs. {lower_bound:,.0f} - Rs. {upper_bound:,.0f})."
        }
    }

    # Save to JSON
    if not output_json_path:
        output_json_path = os.path.join(current_dir, 'prediction_result.json')

    with open(output_json_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, indent=2)

    print(f"\n[OK] Results exported to: {output_json_path}\n")
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="VaultWealth Expense Forecasting")
    parser.add_argument('--data', help="Path to input transactions CSV", default=None)
    parser.add_argument('--out', help="Path to save forecast JSON", default=None)
    args = parser.parse_args()

    run_pipeline(args.data, args.out)
