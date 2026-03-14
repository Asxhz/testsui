"""Actuarial engine -- pricing, risk scoring, and pool health computations."""

from __future__ import annotations

from typing import Any

try:
    from actuaryai.logger import get_logger
except ImportError:
    import logging

    def get_logger(name: str) -> logging.Logger:
        logger = logging.getLogger(name)
        if not logger.handlers:
            logger.setLevel(logging.DEBUG)
            handler = logging.StreamHandler()
            handler.setFormatter(
                logging.Formatter("%(asctime)s | %(name)s | %(levelname)s | %(message)s")
            )
            logger.addHandler(handler)
            logger.propagate = False
        return logger

from actuaryos.models import ActuarialAssessment, Pool

logger = get_logger("actuaryos.engine")


class ActuarialEngine:
    """Core actuarial computation engine.

    Transforms Polymarket odds, bundle metadata and pool state into
    insurance-grade pricing and solvency metrics.
    """

    # Configurable load factors
    RISK_LOAD_FACTOR: float = 0.25
    EXPENSE_LOAD_FACTOR: float = 0.10
    BUFFER_LOAD_FACTOR: float = 0.05
    RESERVE_RATIO_TARGET: float = 1.50

    # ------------------------------------------------------------------
    # Primary assessment
    # ------------------------------------------------------------------

    def assess_scenario(
        self,
        concern: str,
        bundle_data: dict[str, Any],
        market_odds: list[float],
        coverage_amount: float | None = None,
        available_reserves: float = 0.0,
    ) -> ActuarialAssessment:
        """Produce a full actuarial assessment for a scenario.

        Parameters
        ----------
        concern:
            Natural-language description of what the user wants to insure.
        bundle_data:
            Dict containing hedge-bundle metadata (bets, allocations, etc.).
        market_odds:
            List of probability values (0-1) from Polymarket markets in the bundle.
        coverage_amount:
            The face-value coverage the user is requesting.  Falls back to the
            bundle's ``total_allocated`` if not provided.
        available_reserves:
            Current free reserves in the backing pool.
        """
        if not market_odds:
            logger.warning("assess_scenario called with empty market_odds; defaulting to 0.5")
            market_odds = [0.5]

        # --- probability of trigger (weighted average) ---
        weights = self._derive_weights(bundle_data, len(market_odds))
        probability_of_trigger = sum(
            w * p for w, p in zip(weights, market_odds)
        )
        probability_of_trigger = max(0.0, min(1.0, probability_of_trigger))

        # --- coverage amount ---
        if coverage_amount is None:
            coverage_amount = float(bundle_data.get("total_allocated", 1000.0))

        # --- core actuarial computations ---
        expected_payout = coverage_amount * probability_of_trigger
        expected_loss = probability_of_trigger * expected_payout
        risk_load = expected_loss * self.RISK_LOAD_FACTOR
        expense_load = expected_loss * self.EXPENSE_LOAD_FACTOR
        buffer_load = expected_loss * self.BUFFER_LOAD_FACTOR
        premium = expected_loss + risk_load + expense_load + buffer_load
        reserve_requirement = expected_payout * self.RESERVE_RATIO_TARGET
        solvency_impact = reserve_requirement / max(available_reserves, 1.0)

        # --- concentration risk ---
        concentration_risk = self._compute_concentration_risk(bundle_data, market_odds)

        # --- confidence level (proxy from market liquidity) ---
        confidence_level = self._compute_confidence(bundle_data, market_odds)

        # --- classification ---
        classification = self._classify(probability_of_trigger)
        viable = classification != "hedge_only"

        assessment = ActuarialAssessment(
            probability_of_trigger=round(probability_of_trigger, 6),
            expected_payout=round(expected_payout, 2),
            expected_loss=round(expected_loss, 2),
            risk_load=round(risk_load, 2),
            expense_load=round(expense_load, 2),
            buffer_load=round(buffer_load, 2),
            premium=round(premium, 2),
            reserve_requirement=round(reserve_requirement, 2),
            solvency_impact=round(solvency_impact, 4),
            concentration_risk=round(concentration_risk, 4),
            confidence_level=round(confidence_level, 4),
            classification=classification,
            viable=viable,
        )

        logger.info(
            "Assessment for '%s': prob=%.4f, premium=%.2f, class=%s",
            concern,
            probability_of_trigger,
            premium,
            classification,
        )
        return assessment

    # ------------------------------------------------------------------
    # Pool health
    # ------------------------------------------------------------------

    def compute_pool_health(self, pool: Pool) -> dict[str, Any]:
        """Return health metrics for a pool.

        Returns a dict with:
        - reserve_ratio: reserves / liabilities (inf-safe)
        - solvency_score: 0-1 normalised score
        - utilization: liabilities / reserves
        - health_status: "healthy" | "warning" | "critical"
        """
        liabilities = max(pool.committed_liabilities, 0.0)
        reserves = max(pool.reserve_balance, 0.0)

        if liabilities == 0:
            reserve_ratio = float("inf") if reserves > 0 else 0.0
            utilization = 0.0
        else:
            reserve_ratio = reserves / liabilities
            utilization = liabilities / max(reserves, 1.0)

        # Solvency score: 1.0 when ratio >= target, degrades linearly below
        target = pool.reserve_target_ratio
        if target <= 0:
            solvency_score = 1.0
        else:
            solvency_score = min(reserve_ratio / target, 1.0)

        # Health status
        if solvency_score >= 0.8:
            health_status = "healthy"
        elif solvency_score >= 0.5:
            health_status = "warning"
        else:
            health_status = "critical"

        return {
            "reserve_ratio": round(reserve_ratio, 4) if reserve_ratio != float("inf") else None,
            "solvency_score": round(solvency_score, 4),
            "utilization": round(utilization, 4),
            "health_status": health_status,
        }

    # ------------------------------------------------------------------
    # Policy pricing
    # ------------------------------------------------------------------

    def price_policy(
        self,
        assessment: ActuarialAssessment,
        coverage_amount: float,
    ) -> dict[str, Any]:
        """Price a policy based on a prior assessment and requested coverage.

        Returns a dict with premium, expected_payout, and reserve_impact.
        """
        scale = coverage_amount / max(assessment.expected_payout, 1.0)
        premium = assessment.premium * scale
        expected_payout = assessment.expected_payout * scale
        reserve_impact = assessment.reserve_requirement * scale

        return {
            "premium": round(premium, 2),
            "expected_payout": round(expected_payout, 2),
            "reserve_impact": round(reserve_impact, 2),
        }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _derive_weights(bundle_data: dict[str, Any], n: int) -> list[float]:
        """Derive normalised weights from bundle allocation data."""
        bets = bundle_data.get("bets", [])
        if bets and len(bets) == n:
            raw = [float(b.get("allocation_percent", b.get("allocation", 1))) for b in bets]
        else:
            raw = [1.0] * n

        total = sum(raw) or 1.0
        return [w / total for w in raw]

    @staticmethod
    def _compute_concentration_risk(
        bundle_data: dict[str, Any],
        market_odds: list[float],
    ) -> float:
        """Herfindahl-style concentration metric (0 = diversified, 1 = single bet)."""
        bets = bundle_data.get("bets", [])
        if not bets:
            return 1.0 if len(market_odds) <= 1 else 0.5

        allocations = [float(b.get("allocation_percent", b.get("allocation", 1))) for b in bets]
        total = sum(allocations) or 1.0
        shares = [a / total for a in allocations]
        hhi = sum(s * s for s in shares)
        return round(min(hhi, 1.0), 4)

    @staticmethod
    def _compute_confidence(
        bundle_data: dict[str, Any],
        market_odds: list[float],
    ) -> float:
        """Estimate confidence from market liquidity signals."""
        bets = bundle_data.get("bets", [])
        if not bets:
            return 0.5

        # Use liquidity / volume if available on nested market objects
        liquidities: list[float] = []
        for bet in bets:
            market = bet.get("market", {})
            if isinstance(market, dict):
                liq = market.get("liquidity", 0)
            else:
                liq = getattr(market, "liquidity", 0) if hasattr(market, "liquidity") else 0
            liquidities.append(float(liq))

        if not any(liquidities):
            # Fallback: more markets -> higher confidence
            return min(0.5 + 0.1 * len(market_odds), 0.95)

        avg_liquidity = sum(liquidities) / len(liquidities)
        # Rough mapping: $100k+ liquidity -> 0.95 confidence
        confidence = min(avg_liquidity / 100_000, 0.95)
        return max(confidence, 0.1)

    @staticmethod
    def _classify(
        probability: float,
    ) -> str:
        """Classify scenario into hedge_only, protection_candidate, or hybrid."""
        if probability <= 0.1 or probability >= 0.9:
            return "hedge_only"
        elif 0.1 < probability < 0.9:
            return "protection_candidate"
        else:
            return "hybrid"
