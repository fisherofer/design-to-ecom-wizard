# 31/07/2026, 21:00
import json
import logging
import numpy as np
import pandas as pd
import os
import joblib
from typing import Dict, Any, Tuple
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import brier_score_loss, roc_auc_score, accuracy_score
from pathlib import Path

logger = logging.getLogger(__name__)

class QuantPredictionEngine:
    def __init__(self, model_path: str = "user_data/quant_model.pkl"):
        self.model_path = Path(model_path)
        self.scaler = StandardScaler()
        base_model = LogisticRegression(class_weight='balanced', max_iter=2000)
        self.model = CalibratedClassifierCV(base_model, method='sigmoid', cv=3)

        self.history_df = pd.DataFrame(columns=[
            "rsi", "macd_hist", "volume_ratio", "vwap_distance_pct", "atr", "action", "outcome"
        ])
        
        self.is_fitted = False
        self._load_model_state()

    def _get_features(self, metrics: Dict[str, Any]) -> np.ndarray:
        return np.array([
            metrics.get("rsi", 50.0),
            metrics.get("macd_hist", 0.0),
            metrics.get("volume_ratio", 1.0),
            metrics.get("vwap_distance_pct", 0.0),
            metrics.get("atr", 1.0)
        ]).reshape(1, -1)

    def evaluate_signal(self, metrics: Dict[str, Any]) -> Tuple[str, float]:
        """
        Takes technical indicators and returns (Action, Calibrated Probability).
        If not fitted, relies on a heuristic fallback.
        """
        features = self._get_features(metrics)
        
        if not self.is_fitted:
            prob = self._heuristic_probability(metrics)
            action = "BUY" if prob > 0.55 else ("SELL" if prob < 0.45 else "HOLD")
            return action, prob
            
        features_scaled = self.scaler.transform(features)
        
        probs = self.model.predict_proba(features_scaled)[0]
        
        if probs.shape[0] > 1:
            buy_prob = float(probs[1])
        else:
            buy_prob = float(probs[0]) if self.model.classes_[0] == 1 else 0.0
            
        action = "BUY" if buy_prob >= 0.60 else ("SELL" if buy_prob <= 0.40 else "HOLD")
        confidence = max(buy_prob, 1.0 - buy_prob) if action != "HOLD" else 0.0
        
        return action, float(confidence)
        
    def _heuristic_probability(self, metrics: Dict[str, Any]) -> float:
        rsi = metrics.get("rsi", 50.0)
        vol = metrics.get("volume_ratio", 1.0)
        if rsi > 60 and vol > 1.5: return 0.65
        if rsi < 35 and vol > 1.5: return 0.70
        return 0.50

    def record_outcome(self, metrics: Dict[str, Any], action: str, outcome: int):
        """
        Records the true outcome of a trade (1 = win, 0 = loss).
        Periodically retrains the model.
        """
        if action not in ["BUY", "SELL"]:
            return
            
        new_row = pd.DataFrame([{
            "rsi": metrics.get("rsi", 50.0),
            "macd_hist": metrics.get("macd_hist", 0.0),
            "volume_ratio": metrics.get("volume_ratio", 1.0),
            "vwap_distance_pct": metrics.get("vwap_distance_pct", 0.0),
            "atr": metrics.get("atr", 1.0),
            "action": action,
            "outcome": outcome,
            "timestamp": pd.Timestamp.now()
        }])
        
        self.history_df = pd.concat([self.history_df, new_row], ignore_index=True)
        self._save_model_state()
        
        # Retrain if we have enough samples
        if len(self.history_df) >= 50 and len(self.history_df) % 10 == 0:
            self._train_model()

    def _train_model(self):
        if len(self.history_df) < 50:
            return
            
        X = self.history_df[["rsi", "macd_hist", "volume_ratio", "vwap_distance_pct", "atr"]].values
        y = self.history_df["outcome"].values.astype(int)
        
        if len(np.unique(y)) < 2:
            return
            
        # Walk-forward validation (Out-of-Sample)
        tscv = TimeSeriesSplit(n_splits=5)
        out_of_sample_probs = np.zeros_like(y, dtype=float)
        brier_scores = []
        auc_scores = []
        
        X_scaled = self.scaler.fit_transform(X)
        
        for train_idx, test_idx in tscv.split(X_scaled):
            X_train, X_test = X_scaled[train_idx], X_scaled[test_idx]
            y_train, y_test = y[train_idx], y[test_idx]
            
            if len(np.unique(y_train)) < 2:
                continue
                
            temp_model = CalibratedClassifierCV(LogisticRegression(class_weight='balanced', max_iter=2000), method='sigmoid', cv=2)
            temp_model.fit(X_train, y_train)
            
            probs = temp_model.predict_proba(X_test)[:, 1]
            out_of_sample_probs[test_idx] = probs
            
            brier_scores.append(brier_score_loss(y_test, probs))
            if len(np.unique(y_test)) >= 2:
                auc_scores.append(roc_auc_score(y_test, probs))
                
        # Final full fit
        self.model.fit(X_scaled, y)
        self.is_fitted = True
        
        mean_brier = np.mean(brier_scores) if brier_scores else 1.0
        mean_auc = np.mean(auc_scores) if auc_scores else 0.5
        
        logger.info(f"Quant Model Retrained (Out-of-Sample) | Samples: {len(y)} | Brier Score: {mean_brier:.4f} | AUC: {mean_auc:.4f}")
        self._save_model_state()
        
        # Log metrics to separate file for API
        metrics_file = self.model_path.parent / "quant_metrics.json"
        metrics_data = []
        if metrics_file.exists():
            try:
                with open(metrics_file, "r") as f:
                    metrics_data = json.load(f)
            except Exception:
                metrics_data = []
        
        metrics_data.append({
            "date": pd.Timestamp.now().isoformat(),
            "brierScore": float(mean_brier),
            "auc": float(mean_auc),
            "samples": len(y)
        })
        
        with open(metrics_file, "w") as f:
            json.dump(metrics_data[-30:], f) # Keep last 30 retrain cycles

    def check_safety_gate(self) -> Tuple[bool, str]:
        """
        Safety Gate before real trades.
        """
        if not self.is_fitted:
            return False, "Model not fitted yet."
            
        metrics_file = self.model_path.parent / "quant_metrics.json"
        if not metrics_file.exists():
            return False, "No metrics available to verify safety."
            
        try:
            with open(metrics_file, "r") as f:
                metrics_data = json.load(f)
            if not metrics_data:
                return False, "Empty metrics data."
                
            latest = metrics_data[-1]
            if latest["brierScore"] > 0.24:
                return False, f"Brier Score {latest['brierScore']:.3f} is too high (must be <= 0.24)."
            if latest["auc"] < 0.55:
                return False, f"AUC {latest['auc']:.3f} is too low (must be >= 0.55)."
                
            return True, "Model passed safety gates."
        except Exception as e:
            return False, f"Error checking safety gate: {e}"

    def _save_model_state(self):
        try:
            self.model_path.parent.mkdir(parents=True, exist_ok=True)
            state = {
                "model": self.model,
                "scaler": self.scaler,
                "history_df": self.history_df,
                "is_fitted": self.is_fitted
            }
            joblib.dump(state, self.model_path)
            logger.info("Model state saved successfully.")
        except Exception as e:
            logger.error(f"Failed to save model state: {e}")

    def _load_model_state(self):
        try:
            if self.model_path.exists():
                state = joblib.load(self.model_path)
                self.model = state.get("model", self.model)
                self.scaler = state.get("scaler", self.scaler)
                self.history_df = state.get("history_df", self.history_df)
                self.is_fitted = state.get("is_fitted", False)
                logger.info(f"Model state loaded successfully. Fitted: {self.is_fitted}, Samples: {len(self.history_df)}")
        except Exception as e:
            logger.error(f"Failed to load model state: {e}")

if __name__ == "__main__":
    engine = QuantPredictionEngine()
    test_metrics = {"rsi": 65, "macd_hist": 0.5, "volume_ratio": 2.0, "vwap_distance_pct": 1.5, "atr": 0.2}
    print("Test Output:", engine.evaluate_signal(test_metrics))
# END CODE | סך הכל שורות: 181
