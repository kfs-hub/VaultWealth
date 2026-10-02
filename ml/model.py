"""
VaultWealth — Machine Learning Forecasting Model
Phase 11: Explainable Time-Series Linear Regression Model
"""

class ExpensePredictionModel:
    """
    An explainable Ordinary Least Squares (OLS) Linear Regression model for
    forecasting personal expenditures based on historical time-series data.
    
    Model Equation:
        y_hat = beta_0 + beta_1 * X
        
    Where:
        X       = Time period sequence (e.g. Month 1, 2, ..., N)
        y_hat   = Forecasted expenditure (INR)
        beta_1  = Trend Slope (Monthly spending rate of change)
        beta_0  = Base Intercept
    """

    def __init__(self):
        self.slope = 0.0        # beta_1
        self.intercept = 0.0    # beta_0
        self.is_fitted = False
        self.mae = 0.0          # Mean Absolute Error
        self.r2_score = 0.0     # Coefficient of Determination (0 to 1)

    def fit(self, X, y):
        """
        Trains the Linear Regression model on feature matrix X and target vector y.
        X: List of lists [[1], [2], ..., [N]]
        y: List of floats [E1, E2, ..., EN]
        """
        n = len(X)
        if n < 2:
            raise ValueError("At least 2 historical data points are required to train a regression model.")

        x_vals = [row[0] for row in X]
        y_vals = list(y)

        # Means
        x_mean = sum(x_vals) / n
        y_mean = sum(y_vals) / n

        # Ordinary Least Squares calculation
        # beta_1 = sum((x_i - x_mean) * (y_i - y_mean)) / sum((x_i - x_mean)^2)
        numerator = sum((x_vals[i] - x_mean) * (y_vals[i] - y_mean) for i in range(n))
        denominator = sum((x_vals[i] - x_mean) ** 2 for i in range(n))

        if denominator == 0:
            self.slope = 0.0
        else:
            self.slope = numerator / denominator

        # beta_0 = y_mean - beta_1 * x_mean
        self.intercept = y_mean - (self.slope * x_mean)
        self.is_fitted = True

        # Model evaluation metrics
        self._evaluate(x_vals, y_vals, y_mean)
        return self

    def _evaluate(self, x_vals, y_vals, y_mean):
        """
        Computes Mean Absolute Error (MAE) and R-Squared (R²) score.
        """
        n = len(x_vals)
        predictions = [self.intercept + (self.slope * x) for x in x_vals]

        # 1. Mean Absolute Error (MAE)
        self.mae = sum(abs(y_vals[i] - predictions[i]) for i in range(n)) / n

        # 2. R² Score: 1 - (SS_res / SS_tot)
        ss_res = sum((y_vals[i] - predictions[i]) ** 2 for i in range(n))
        ss_tot = sum((y_vals[i] - y_mean) ** 2 for i in range(n))

        if ss_tot == 0:
            self.r2_score = 1.0
        else:
            self.r2_score = max(0.0, 1.0 - (ss_res / ss_tot))

    def predict(self, next_step):
        """
        Predicts expenditure for a future time step.
        e.g., if trained on months 1..12, next_step is 13.
        """
        if not self.is_fitted:
            raise RuntimeError("Model must be fitted before calling predict().")

        pred = self.intercept + (self.slope * next_step)
        # Expense cannot be negative
        return max(0.0, round(pred, 2))

    def get_confidence_interval(self, prediction, confidence_multiplier=1.96):
        """
        Estimates the 95% forecast confidence interval using residual MAE.
        """
        margin = self.mae * confidence_multiplier
        lower = max(0.0, round(prediction - margin, 2))
        upper = round(prediction + margin, 2)
        return lower, upper

    def get_summary(self):
        """
        Returns parameters and evaluation metrics for display/viva.
        """
        trend = "Increasing" if self.slope > 0 else ("Decreasing" if self.slope < 0 else "Stable")
        return {
            'slope_beta1': round(self.slope, 2),
            'intercept_beta0': round(self.intercept, 2),
            'trend_direction': trend,
            'mae': round(self.mae, 2),
            'r2_score': round(self.r2_score, 4),
            'accuracy_percentage': round(self.r2_score * 100, 2)
        }
