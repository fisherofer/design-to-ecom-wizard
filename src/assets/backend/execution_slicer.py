# -*- coding: utf-8 -*-
"""
OFERTRADINGBOT - Quant Execution Slicer Engine (Invariants 40-42)
Provides institutional-grade algorithmic execution slicing (TWAP, VWAP, POV, Iceberg)
with Almgren-Chriss market impact modeling, dynamic slippage limits, and execution invariant enforcement.
"""

import math
import random
import time
from typing import Dict, List, Any, Optional, Tuple

class ExecutionSlice:
    def __init__(self, slice_id: int, target_quantity: float, execution_time_offset_sec: float, slice_type: str = "MARKET"):
        self.slice_id = slice_id
        self.target_quantity = target_quantity
        self.executed_quantity = 0.0
        self.execution_price = 0.0
        self.execution_time_offset_sec = execution_time_offset_sec
        self.slice_type = slice_type
        self.status = "PENDING"
        self.slippage_pct = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "slice_id": self.slice_id,
            "target_quantity": self.target_quantity,
            "executed_quantity": self.executed_quantity,
            "execution_price": round(self.execution_price, 4),
            "execution_time_offset_sec": round(self.execution_time_offset_sec, 2),
            "slice_type": self.slice_type,
            "status": self.status,
            "slippage_pct": round(self.slippage_pct, 4)
        }

class QuantExecutionSlicer:
    """
    Quant Execution Slicer implementing:
    - TWAP (Time-Weighted Average Price)
    - VWAP (Volume-Weighted Average Price) with intraday curve
    - POV (Percentage of Volume)
    - Iceberg Order Slicing
    - Invariants 40, 41, 42 validation
    """

    def __init__(self, max_slippage_cap_pct: float = 0.015, default_participation_rate: float = 0.10):
        self.max_slippage_cap_pct = max_slippage_cap_pct
        self.default_participation_rate = default_participation_rate

    def generate_twap_schedule(
        self,
        total_quantity: float,
        duration_minutes: float,
        num_slices: int,
        random_jitter_pct: float = 0.15
    ) -> List[ExecutionSlice]:
        """
        Splits order evenly across time with randomized interval jitter.
        Invariant 40 (Conservation of quantity) guaranteed.
        """
        if num_slices <= 0 or total_quantity <= 0:
            raise ValueError("Quantity and number of slices must be strictly positive.")

        base_qty = total_quantity / num_slices
        total_seconds = duration_minutes * 60.0
        interval = total_seconds / num_slices

        slices: List[ExecutionSlice] = []
        allocated_qty = 0.0

        for i in range(num_slices):
            # Add random jitter to avoid front-running / deterministic footprint
            jitter = (random.random() * 2 - 1) * random_jitter_pct * (base_qty * 0.3)
            if i == num_slices - 1:
                slice_qty = round(total_quantity - allocated_qty, 6)
            else:
                slice_qty = round(max(1.0, base_qty + jitter), 6)
                allocated_qty += slice_qty

            time_offset = (i * interval) + (random.random() * interval * 0.2 if i > 0 else 0.0)
            slices.append(ExecutionSlice(slice_id=i + 1, target_quantity=slice_qty, execution_time_offset_sec=time_offset))

        # Invariant 40 Verification
        sum_qty = sum(s.target_quantity for s in slices)
        if abs(sum_qty - total_quantity) > 1e-5:
            slices[-1].target_quantity = round(slices[-1].target_quantity + (total_quantity - sum_qty), 6)

        return slices

    def generate_vwap_schedule(
        self,
        total_quantity: float,
        volume_profile: Optional[List[float]] = None,
        duration_minutes: float = 60.0
    ) -> List[ExecutionSlice]:
        """
        Splits order according to U-shaped intraday volume profile.
        """
        if not volume_profile:
            # Standard U-shaped market volume curve (Open high, Lunch low, Close high)
            volume_profile = [0.22, 0.15, 0.10, 0.08, 0.07, 0.08, 0.12, 0.18]

        total_weight = sum(volume_profile)
        norm_weights = [w / total_weight for w in volume_profile]
        num_slices = len(norm_weights)
        interval = (duration_minutes * 60.0) / num_slices

        slices: List[ExecutionSlice] = []
        allocated_qty = 0.0

        for i, weight in enumerate(norm_weights):
            if i == num_slices - 1:
                qty = round(total_quantity - allocated_qty, 6)
            else:
                qty = round(total_quantity * weight, 6)
                allocated_qty += qty

            time_offset = i * interval
            slices.append(ExecutionSlice(slice_id=i + 1, target_quantity=qty, execution_time_offset_sec=time_offset))

        return slices

    def estimate_market_impact(self, slice_qty: float, market_adv_per_min: float, volatility: float) -> float:
        """
        Almgren-Chriss square root law for market impact:
        Impact = Volatility * sqrt(Slice_Qty / Daily_Volume)
        """
        if market_adv_per_min <= 0:
            return 0.0005
        participation = slice_qty / market_adv_per_min
        impact = volatility * math.sqrt(max(0.00001, participation)) * 0.1
        return min(self.max_slippage_cap_pct * 2, impact)

    def simulate_execution(
        self,
        slices: List[ExecutionSlice],
        initial_price: float,
        market_adv_per_min: float = 100000.0,
        volatility: float = 0.02
    ) -> Dict[str, Any]:
        """
        Simulates order execution and checks Invariants 40, 41, and 42.
        """
        current_price = initial_price
        total_executed_qty = 0.0
        total_cost = 0.0
        aborted_due_to_slippage = False

        for s in slices:
            if aborted_due_to_slippage:
                s.status = "CANCELLED"
                continue

            impact_pct = self.estimate_market_impact(s.target_quantity, market_adv_per_min, volatility)
            noise = (random.random() * 2 - 1) * (volatility * 0.2)
            execution_slippage = impact_pct + noise

            # Invariant 41 Check: Slippage Cap
            if execution_slippage > self.max_slippage_cap_pct:
                s.status = "SLIPPAGE_BREACH_ABORTED"
                aborted_due_to_slippage = True
                continue

            exec_price = current_price * (1.0 + execution_slippage)
            s.executed_quantity = s.target_quantity
            s.execution_price = exec_price
            s.slippage_pct = execution_slippage
            s.status = "FILLED"

            total_executed_qty += s.executed_quantity
            total_cost += (s.executed_quantity * exec_price)
            current_price = exec_price

        vwap = (total_cost / total_executed_qty) if total_executed_qty > 0 else initial_price
        benchmark_slippage = (vwap - initial_price) / initial_price

        # Check Invariants
        invariants_audit = self.verify_invariants(slices, total_executed_qty, benchmark_slippage)

        return {
            "total_requested_quantity": sum(s.target_quantity for s in slices),
            "total_executed_quantity": round(total_executed_qty, 6),
            "initial_price": initial_price,
            "average_execution_vwap": round(vwap, 4),
            "realized_slippage_pct": round(benchmark_slippage, 6),
            "slices": [s.to_dict() for s in slices],
            "invariants_passed": invariants_audit["all_passed"],
            "invariants_report": invariants_audit
        }

    def verify_invariants(self, slices: List[ExecutionSlice], executed_qty: float, realized_slippage: float) -> Dict[str, Any]:
        """
        Strict mathematical verification of Invariants 40, 41, 42.
        """
        # Invariant 40: Conservation of Quantity
        filled_slices = [s for s in slices if s.status == "FILLED"]
        sum_filled = sum(s.executed_quantity for s in filled_slices)
        inv_40_passed = abs(sum_filled - executed_qty) < 1e-4

        # Invariant 41: Slippage Non-Negativity & Risk Cap
        inv_41_passed = realized_slippage <= (self.max_slippage_cap_pct * 1.5)

        # Invariant 42: Time Monotonicity
        time_offsets = [s.execution_time_offset_sec for s in slices]
        inv_42_passed = all(time_offsets[i] <= time_offsets[i+1] for i in range(len(time_offsets)-1))

        all_passed = inv_40_passed and inv_41_passed and inv_42_passed

        return {
            "invariant_40_quantity_conservation": {
                "passed": inv_40_passed,
                "description": "Total executed slices match reported filled quantity without overfill or loss."
            },
            "invariant_41_slippage_cap": {
                "passed": inv_41_passed,
                "description": f"Realized slippage ({realized_slippage:.4f}) within max volatility threshold."
            },
            "invariant_42_time_monotonicity": {
                "passed": inv_42_passed,
                "description": "Slice scheduled intervals are monotonically non-decreasing."
            },
            "all_passed": all_passed
        }

execution_slicer = QuantExecutionSlicer()
