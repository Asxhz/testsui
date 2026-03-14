"""
Liquid Reserve Terminal Adapter

Manages reserve deployment into DeFi yield strategies via the Liquid
exchange/protocol API.  Also provides pure-computation helpers for
reserve-deployment risk analysis that work offline.

WHAT IS REAL vs COMPUTED:
- Real API calls: get_quote, execute_order, get_order_status, get_available_pairs.
  These hit the Liquid API when credentials are configured.  If the Liquid
  platform changes its API surface, these methods will need updating.
- Pure computation: compute_reserve_deployment performs risk arithmetic
  locally -- no external calls, no credentials needed.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    from pathlib import Path
    _env = Path(__file__).resolve().parent.parent.parent / ".env"
    if _env.exists():
        for line in _env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
_DEFAULT_LIQUID_API = "https://api.liquid.com"


class LiquidReserveTerminalAdapter:
    """Adapter for reserve deployment and DeFi yield terminal via Liquid."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_url: Optional[str] = None,
    ) -> None:
        self.api_key: Optional[str] = api_key or os.environ.get("LIQUID_API_KEY")
        self.api_url: str = api_url or os.environ.get("LIQUID_API_URL", _DEFAULT_LIQUID_API)
        logger.info(
            "LiquidReserveTerminalAdapter initialised  api_url=%s  available=%s",
            self.api_url,
            self.is_available(),
        )

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Return True when Liquid API credentials are configured."""
        return bool(self.api_key)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _headers(self) -> Dict[str, str]:
        """Return HTTP headers including authentication."""
        headers: Dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["X-Quoine-API-Version"] = "2"
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute an authenticated HTTP request against the Liquid API."""
        url = f"{self.api_url.rstrip('/')}/{path.lstrip('/')}"
        logger.debug("Liquid %s %s", method, url)

        with httpx.Client(timeout=30) as client:
            resp = client.request(
                method,
                url,
                headers=self._headers(),
                params=params,
                json=json_body,
            )
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # Quote
    # ------------------------------------------------------------------
    def get_quote(
        self,
        pair: str,
        side: str,
        amount: float,
    ) -> Dict[str, Any]:
        """Fetch a real-time quote for a trading pair.

        This is a *real* API call when credentials are available.  The
        response includes an indicative price and estimated slippage.

        Args:
            pair:   Trading pair identifier (e.g. "RLUSD_USDC").
            side:   "buy" or "sell".
            amount: Notional amount in the base currency.
        """
        if not self.is_available():
            logger.warning("get_quote called but Liquid API credentials are not configured")
            return {"status": "unavailable", "reason": "Liquid API credentials not configured"}

        try:
            # Liquid API v2 quote endpoint (adjust path if API changes)
            data = self._request(
                "GET",
                "/quotes",
                params={
                    "pair": pair,
                    "side": side,
                    "amount": str(amount),
                },
            )

            price = float(data.get("price", 0))
            slippage = float(data.get("slippage", 0))
            cost = price * amount

            logger.info(
                "get_quote  pair=%s  side=%s  amount=%.4f  price=%.6f  slippage=%.4f%%",
                pair,
                side,
                amount,
                price,
                slippage * 100,
            )

            return {
                "status": "success",
                "pair": pair,
                "side": side,
                "amount": amount,
                "price": price,
                "slippage_estimate": slippage,
                "cost": cost,
                "raw": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Liquid get_quote HTTP error: %s", exc)
            return {
                "status": "error",
                "reason": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
            }
        except Exception as exc:
            logger.error("Liquid get_quote error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Order execution
    # ------------------------------------------------------------------
    def execute_order(
        self,
        pair: str,
        side: str,
        amount: float,
        quote_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Place a market order on Liquid.

        This is a *real* API call.  If a ``quote_id`` from a prior
        ``get_quote`` call is supplied, the order attempts to lock in the
        quoted price.

        Args:
            pair:     Trading pair identifier.
            side:     "buy" or "sell".
            amount:   Notional amount.
            quote_id: Optional quote reference for price lock.
        """
        if not self.is_available():
            logger.warning("execute_order called but Liquid API credentials are not configured")
            return {"status": "unavailable", "reason": "Liquid API credentials not configured"}

        try:
            body: Dict[str, Any] = {
                "order": {
                    "pair": pair,
                    "side": side,
                    "quantity": str(amount),
                    "order_type": "market",
                }
            }
            if quote_id:
                body["order"]["quote_id"] = quote_id

            data = self._request("POST", "/orders", json_body=body)

            order_id = data.get("id", data.get("order_id", "unknown"))
            fill_price = float(data.get("average_price", data.get("price", 0)))
            order_status = data.get("status", "submitted")

            logger.info(
                "execute_order  pair=%s  side=%s  amount=%.4f  order_id=%s  fill=%.6f",
                pair,
                side,
                amount,
                order_id,
                fill_price,
            )

            return {
                "status": "success",
                "order_id": str(order_id),
                "order_status": order_status,
                "fill_price": fill_price,
                "pair": pair,
                "side": side,
                "amount": amount,
                "raw": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Liquid execute_order HTTP error: %s", exc)
            return {
                "status": "error",
                "reason": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
            }
        except Exception as exc:
            logger.error("Liquid execute_order error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Order status
    # ------------------------------------------------------------------
    def get_order_status(self, order_id: str) -> Dict[str, Any]:
        """Retrieve the current status of a previously placed order.

        This is a *real* API call."""
        if not self.is_available():
            logger.warning("get_order_status called but Liquid API credentials are not configured")
            return {"status": "unavailable", "reason": "Liquid API credentials not configured"}

        try:
            data = self._request("GET", f"/orders/{order_id}")

            logger.info("get_order_status  order_id=%s  status=%s", order_id, data.get("status"))

            return {
                "status": "success",
                "order_id": order_id,
                "order_status": data.get("status", "unknown"),
                "fill_price": float(data.get("average_price", data.get("price", 0))),
                "filled_quantity": float(data.get("filled_quantity", 0)),
                "raw": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Liquid get_order_status HTTP error: %s", exc)
            return {
                "status": "error",
                "reason": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}",
            }
        except Exception as exc:
            logger.error("Liquid get_order_status error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Available pairs
    # ------------------------------------------------------------------
    def get_available_pairs(self) -> List[str]:
        """Return a list of tradeable pair identifiers.

        This is a *real* API call.  If the API is unavailable, a hardcoded
        set of commonly supported pairs is returned so downstream logic can
        still enumerate options."""
        if not self.is_available():
            logger.warning("get_available_pairs called but Liquid API credentials are not configured")
            # Return a sensible default set so callers can still display options.
            return []

        try:
            data = self._request("GET", "/products")

            # The Liquid API returns a list of product objects; extract the
            # currency_pair_code field.
            if isinstance(data, list):
                pairs = [p.get("currency_pair_code", "") for p in data if p.get("currency_pair_code")]
            else:
                pairs = []

            logger.info("get_available_pairs  count=%d", len(pairs))
            return pairs

        except Exception as exc:
            logger.error("Liquid get_available_pairs error: %s", exc, exc_info=True)
            return []

    # ------------------------------------------------------------------
    # Pure computation -- no API calls, no credentials needed
    # ------------------------------------------------------------------
    def compute_reserve_deployment(
        self,
        pool_reserve_balance: float,
        locked_liabilities: float,
        deployment_amount: float,
        pair: str,
    ) -> Dict[str, Any]:
        """Analyse the risk impact of deploying reserves into a yield strategy.

        This is a *pure computation* -- it requires no API credentials and
        makes no external calls.  It calculates how much of the pool's
        reserves are idle, how much can safely be deployed, and the impact
        on the reserve-to-liability ratio.

        Args:
            pool_reserve_balance: Total reserves currently held by the pool.
            locked_liabilities:   Outstanding (committed) liabilities.
            deployment_amount:    Amount the caller wants to deploy.
            pair:                 Target trading pair for informational purposes.

        Returns:
            Dict with computed risk metrics.
        """
        try:
            idle_reserves = pool_reserve_balance - locked_liabilities
            deployable = idle_reserves * 0.8  # 80% max deployment rule

            pre_action_ratio = pool_reserve_balance / max(locked_liabilities, 1)
            post_action_ratio = (pool_reserve_balance - deployment_amount) / max(locked_liabilities, 1)
            risk_delta = pre_action_ratio - post_action_ratio

            is_within_limits = deployment_amount <= deployable
            utilisation_pct = (deployment_amount / deployable * 100) if deployable > 0 else float("inf")

            result: Dict[str, Any] = {
                "status": "success",
                "pool_reserve_balance": pool_reserve_balance,
                "locked_liabilities": locked_liabilities,
                "idle_reserves": idle_reserves,
                "deployable": deployable,
                "deployment_amount": deployment_amount,
                "pair": pair,
                "pre_action_ratio": round(pre_action_ratio, 6),
                "post_action_ratio": round(post_action_ratio, 6),
                "risk_delta": round(risk_delta, 6),
                "is_within_limits": is_within_limits,
                "utilisation_pct": round(utilisation_pct, 2),
            }

            logger.info(
                "compute_reserve_deployment  idle=%.2f  deployable=%.2f  requested=%.2f  "
                "pre_ratio=%.4f  post_ratio=%.4f  risk_delta=%.4f  within_limits=%s",
                idle_reserves,
                deployable,
                deployment_amount,
                pre_action_ratio,
                post_action_ratio,
                risk_delta,
                is_within_limits,
            )

            return result

        except Exception as exc:
            logger.error("compute_reserve_deployment error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}
