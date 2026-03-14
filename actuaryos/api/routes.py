"""
ActuaryOS API Routes

All endpoints for the insurance-grade risk pooling and policy engine.
Prefix: /api/os
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

logger = logging.getLogger("actuaryos.api.routes")

# ---------------------------------------------------------------------------
# Lazy helpers for services / adapters that may not exist yet
# ---------------------------------------------------------------------------


def _get_pool_service():
    """Lazy-import the pool service."""
    try:
        from actuaryos.services.pool_service import PoolService
        return PoolService()
    except Exception as exc:
        logger.warning("PoolService unavailable: %s", exc)
        return None


def _get_policy_service():
    try:
        from actuaryos.services.policy_service import PolicyService
        return PolicyService()
    except Exception as exc:
        logger.warning("PolicyService unavailable: %s", exc)
        return None


def _get_claims_service():
    try:
        from actuaryos.services.claim_service import ClaimService
        return ClaimService()
    except Exception as exc:
        logger.warning("ClaimService unavailable: %s", exc)
        return None


def _get_assessment_service():
    try:
        from actuaryos.engine import ActuarialEngine
        return ActuarialEngine()
    except Exception as exc:
        logger.warning("ActuarialEngine unavailable: %s", exc)
        return None


def _get_audit_service():
    try:
        from actuaryos.services.audit_service import AuditService
        return AuditService()
    except Exception as exc:
        logger.warning("AuditService unavailable: %s", exc)
        return None


def _get_sui_adapter():
    try:
        from actuaryos.adapters.sui_adapter import SuiPoolRegistryAdapter
        return SuiPoolRegistryAdapter()
    except Exception as exc:
        logger.warning("SuiPoolRegistryAdapter unavailable: %s", exc)
        return None


def _get_xrpl_adapter():
    try:
        from actuaryos.adapters.xrpl_adapter import XrplSettlementAdapter
        return XrplSettlementAdapter()
    except Exception as exc:
        logger.warning("XrplSettlementAdapter unavailable: %s", exc)
        return None


def _get_liquid_adapter():
    try:
        from actuaryos.adapters.liquid_adapter import LiquidReserveTerminalAdapter
        return LiquidReserveTerminalAdapter()
    except Exception as exc:
        logger.warning("LiquidReserveTerminalAdapter unavailable: %s", exc)
        return None


def _get_solana_adapter():
    try:
        from actuaryos.adapters.solana_adapter import SolanaAdapter
        return SolanaAdapter()
    except Exception as exc:
        logger.warning("SolanaAdapter unavailable: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AssessRequest(BaseModel):
    concern: str
    bundle_data: dict[str, Any]
    market_odds: list[float]
    coverage_amount: float = Field(gt=0)


class CreatePoolRequest(BaseModel):
    name: str
    coverage_type: str
    initial_reserve: float = Field(ge=0)


class CreateDepositRequest(BaseModel):
    depositor_address: str
    amount: float = Field(gt=0)


class CreatePolicyRequest(BaseModel):
    user_id: str
    pool_id: str
    source_bundle_id: Optional[str] = None
    policy_type: str
    trigger_definition: dict[str, Any] = Field(default_factory=dict)
    coverage_amount: float = Field(gt=0)
    premium: float = Field(gt=0)


class CreateClaimRequest(BaseModel):
    policy_id: str
    trigger_event_id: Optional[str] = None


class ApproveClaimRequest(BaseModel):
    payout_amount: float = Field(gt=0)


class TerminalQuoteRequest(BaseModel):
    pool_id: str
    pair: str
    side: Optional[str] = None
    action: Optional[str] = None
    amount: float = Field(gt=0)

    def get_side(self) -> str:
        """Return side from either 'side' or 'action' field."""
        return self.side or self.action or "buy"


class TerminalExecuteRequest(BaseModel):
    pool_id: str
    pair: str
    side: str
    amount: float = Field(gt=0)
    quote_id: str


class TerminalComputeRequest(BaseModel):
    pool_id: str
    deployment_amount: Optional[float] = Field(None, gt=0)
    amount: Optional[float] = Field(None, gt=0)
    pair: str = "BTC-USD"
    action: Optional[str] = None

    def get_deployment_amount(self) -> float:
        """Return the deployment amount from either field name."""
        val = self.deployment_amount or self.amount
        if val is None or val <= 0:
            raise ValueError("deployment_amount or amount must be provided and > 0")
        return val


class SuiRegisterPoolRequest(BaseModel):
    pool_id: str


class XrplSendRequest(BaseModel):
    destination: str
    amount: float = Field(gt=0)
    currency: str = "XRP"
    memo: Optional[str] = None


# ---------------------------------------------------------------------------
# Router
# ---------------------------------------------------------------------------

router = APIRouter(prefix="/api/os")

# ===== Assessment =====


@router.post("/assess")
async def assess(request: AssessRequest):
    """Run an actuarial assessment for a given concern and market data."""
    svc = _get_assessment_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Assessment service unavailable")
    try:
        logger.info("Running actuarial assessment for concern=%s", request.concern[:60])
        result = svc.assess_scenario(
            concern=request.concern,
            bundle_data=request.bundle_data,
            market_odds=request.market_odds,
            coverage_amount=request.coverage_amount,
        )
        logger.info("Assessment completed successfully")
        return result
    except ValueError as exc:
        logger.error("Assessment validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Assessment error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Assessment failed: {exc}")


# ===== Pools =====


@router.get("/pools")
async def list_pools():
    """List all risk pools."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Listing all pools")
        pools = svc.list_pools()
        result = []
        for pool in pools:
            pool_data = pool.model_dump(mode="json")
            pool_data["reserve_ratio"] = pool.reserve_balance / max(pool.committed_liabilities, 1)
            # Aliases used by the terminal frontend
            pool_data["total_reserves"] = pool.reserve_balance
            pool_data["locked_liabilities"] = pool.committed_liabilities
            result.append(pool_data)
        return result
    except Exception as exc:
        logger.error("Error listing pools: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/pools", status_code=201)
async def create_pool(request: CreatePoolRequest):
    """Create a new risk pool."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Creating pool name=%s coverage_type=%s", request.name, request.coverage_type)
        pool = svc.create_pool(
            name=request.name,
            coverage_type=request.coverage_type,
            initial_reserve=request.initial_reserve,
        )
        logger.info("Pool created id=%s", pool.get("id") if isinstance(pool, dict) else getattr(pool, "id", "?"))
        return pool
    except ValueError as exc:
        logger.error("Pool creation validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating pool: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pools/{pool_id}")
async def get_pool(pool_id: str):
    """Get pool detail with health metrics."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Getting pool id=%s", pool_id)
        pool = svc.get_pool(pool_id)
        if pool is None:
            raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
        pool_data = pool.model_dump(mode="json")
        pool_data["reserve_ratio"] = pool.reserve_balance / max(pool.committed_liabilities, 1)
        return pool_data
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting pool %s: %s", pool_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pools/{pool_id}/health")
async def get_pool_health(pool_id: str):
    """Get pool health metrics."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Getting health for pool id=%s", pool_id)
        health = svc.get_pool_health(pool_id)
        if health is None:
            raise HTTPException(status_code=404, detail=f"Pool {pool_id} not found")
        return health
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting pool health %s: %s", pool_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pools/{pool_id}/snapshots")
async def get_pool_snapshots(pool_id: str):
    """Get historical snapshots for a pool."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Getting snapshots for pool id=%s", pool_id)
        snapshots = svc.get_pool_snapshots(pool_id)
        return snapshots
    except Exception as exc:
        logger.error("Error getting pool snapshots %s: %s", pool_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Deposits =====


@router.post("/pools/{pool_id}/deposits", status_code=201)
async def create_deposit(pool_id: str, request: CreateDepositRequest):
    """Create a capital deposit into a pool."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Creating deposit pool_id=%s depositor=%s amount=%s", pool_id, request.depositor_address, request.amount)
        deposit = svc.create_deposit(
            pool_id=pool_id,
            depositor_address=request.depositor_address,
            amount=request.amount,
        )
        logger.info("Deposit created")
        return deposit
    except ValueError as exc:
        logger.error("Deposit validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating deposit: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/pools/{pool_id}/deposits")
async def list_deposits(pool_id: str):
    """List all deposits for a pool."""
    svc = _get_pool_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Pool service unavailable")
    try:
        logger.info("Listing deposits for pool_id=%s", pool_id)
        deposits = svc.list_deposits(pool_id)
        return deposits
    except Exception as exc:
        logger.error("Error listing deposits for pool %s: %s", pool_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Policies =====


@router.post("/policies", status_code=201)
async def create_policy(request: CreatePolicyRequest):
    """Create a new insurance-style policy backed by a pool."""
    svc = _get_policy_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Policy service unavailable")
    try:
        logger.info("Creating policy user_id=%s pool_id=%s type=%s", request.user_id, request.pool_id, request.policy_type)
        policy = svc.create_policy(
            user_id=request.user_id,
            pool_id=request.pool_id,
            source_bundle_id=request.source_bundle_id,
            policy_type=request.policy_type,
            trigger_definition=request.trigger_definition,
            coverage_amount=request.coverage_amount,
            premium=request.premium,
        )
        logger.info("Policy created")
        return policy
    except ValueError as exc:
        logger.error("Policy validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating policy: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/policies")
async def list_policies(
    pool_id: Optional[str] = Query(None, description="Filter by pool ID"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
):
    """List policies with optional filters."""
    svc = _get_policy_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Policy service unavailable")
    try:
        logger.info("Listing policies pool_id=%s user_id=%s", pool_id, user_id)
        policies = svc.list_policies(pool_id=pool_id, user_id=user_id)
        return policies
    except Exception as exc:
        logger.error("Error listing policies: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/policies/{policy_id}")
async def get_policy(policy_id: str):
    """Get policy detail."""
    svc = _get_policy_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Policy service unavailable")
    try:
        logger.info("Getting policy id=%s", policy_id)
        policy = svc.get_policy(policy_id)
        if policy is None:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")
        return policy
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting policy %s: %s", policy_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/policies/{policy_id}/activate")
async def activate_policy(policy_id: str):
    """Activate a pending policy."""
    svc = _get_policy_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Policy service unavailable")
    try:
        logger.info("Activating policy id=%s", policy_id)
        result = svc.activate_policy(policy_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Policy {policy_id} not found")
        logger.info("Policy %s activated", policy_id)
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        logger.error("Policy activation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error activating policy %s: %s", policy_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Claims =====


@router.post("/claims", status_code=201)
async def create_claim(request: CreateClaimRequest):
    """File a claim against a policy."""
    svc = _get_claims_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Claims service unavailable")
    try:
        logger.info("Creating claim policy_id=%s trigger_event_id=%s", request.policy_id, request.trigger_event_id)
        claim = svc.create_claim(
            policy_id=request.policy_id,
            trigger_event_id=request.trigger_event_id,
        )
        logger.info("Claim created")
        return claim
    except ValueError as exc:
        logger.error("Claim validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating claim: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/claims")
async def list_claims():
    """List all claims."""
    svc = _get_claims_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Claims service unavailable")
    try:
        logger.info("Listing all claims")
        claims = svc.list_claims()
        return claims
    except Exception as exc:
        logger.error("Error listing claims: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/claims/{claim_id}/approve")
async def approve_claim(claim_id: str, request: ApproveClaimRequest):
    """Approve a claim with a payout amount."""
    svc = _get_claims_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Claims service unavailable")
    try:
        logger.info("Approving claim id=%s payout_amount=%s", claim_id, request.payout_amount)
        result = svc.approve_claim(claim_id, payout_amount=request.payout_amount)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
        logger.info("Claim %s approved", claim_id)
        return result
    except HTTPException:
        raise
    except ValueError as exc:
        logger.error("Claim approval error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error approving claim %s: %s", claim_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/claims/{claim_id}/deny")
async def deny_claim(claim_id: str):
    """Deny a claim."""
    svc = _get_claims_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Claims service unavailable")
    try:
        logger.info("Denying claim id=%s", claim_id)
        result = svc.deny_claim(claim_id)
        if result is None:
            raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")
        logger.info("Claim %s denied", claim_id)
        return result
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error denying claim %s: %s", claim_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Trigger Events =====


@router.post("/triggers")
async def create_trigger(body: dict):
    """Create a trigger event."""
    try:
        from actuaryos.services.trigger_service import TriggerService
        svc = TriggerService()
        trigger = svc.create_trigger(
            event_type=body.get("event_type", "manual"),
            external_source=body.get("external_source", "operator"),
            raw_payload=body.get("payload", {}),
            outcome=body.get("outcome", "triggered")
        )
        return {"status": "success", "trigger": trigger.model_dump(mode="json")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/triggers")
async def list_triggers(limit: int = 50):
    """List trigger events."""
    try:
        from actuaryos.services.trigger_service import TriggerService
        svc = TriggerService()
        triggers = svc.list_triggers(limit=limit)
        return {"triggers": [t.model_dump(mode="json") for t in triggers]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/triggers/{trigger_id}/resolve")
async def resolve_trigger(trigger_id: str, body: dict):
    """Resolve a trigger event outcome."""
    try:
        from actuaryos.services.trigger_service import TriggerService
        svc = TriggerService()
        trigger = svc.resolve_trigger(trigger_id, body.get("outcome", "triggered"))
        if not trigger:
            raise HTTPException(status_code=404, detail="Trigger not found")
        return {"status": "success", "trigger": trigger.model_dump(mode="json")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===== Reserve Terminal =====


@router.post("/terminal/quote")
async def terminal_quote(request: TerminalQuoteRequest):
    """Get a quote from the Liquid reserve terminal."""
    adapter = _get_liquid_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Liquid reserve terminal unavailable")
    try:
        side = request.get_side()
        logger.info("Getting terminal quote pool_id=%s pair=%s side=%s amount=%s", request.pool_id, request.pair, side, request.amount)
        quote = adapter.get_quote(
            pair=request.pair,
            side=side,
            amount=request.amount,
        )
        logger.info("Quote received")
        return quote
    except ValueError as exc:
        logger.error("Terminal quote validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error getting terminal quote: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/terminal/execute")
async def terminal_execute(request: TerminalExecuteRequest):
    """Execute a trade on the Liquid reserve terminal."""
    adapter = _get_liquid_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Liquid reserve terminal unavailable")
    try:
        logger.info("Executing terminal trade pool_id=%s pair=%s side=%s amount=%s quote_id=%s", request.pool_id, request.pair, request.side, request.amount, request.quote_id)
        result = adapter.execute_order(
            pair=request.pair,
            side=request.side,
            amount=request.amount,
            quote_id=request.quote_id,
        )
        logger.info("Terminal trade executed")
        return result
    except ValueError as exc:
        logger.error("Terminal execute validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error executing terminal trade: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/terminal/history/{pool_id}")
async def terminal_history(pool_id: str):
    """Get reserve action history for a pool."""
    adapter = _get_liquid_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Liquid reserve terminal unavailable")
    try:
        logger.info("Getting terminal history for pool_id=%s", pool_id)
        history = adapter.get_history(pool_id)
        return history
    except Exception as exc:
        logger.error("Error getting terminal history for pool %s: %s", pool_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/terminal/compute")
async def terminal_compute(request: TerminalComputeRequest):
    """Compute the deployment impact of reserve capital."""
    adapter = _get_liquid_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Liquid reserve terminal unavailable")
    try:
        deploy_amount = request.get_deployment_amount()
        logger.info("Computing deployment impact pool_id=%s amount=%s pair=%s", request.pool_id, deploy_amount, request.pair)
        # Fetch pool data for reserve computation
        pool_svc = _get_pool_service()
        if pool_svc is None:
            raise HTTPException(status_code=503, detail="Pool service unavailable")
        pool = pool_svc.get_pool(request.pool_id)
        result = adapter.compute_reserve_deployment(
            pool_reserve_balance=pool.reserve_balance,
            locked_liabilities=pool.committed_liabilities,
            deployment_amount=deploy_amount,
            pair=request.pair,
        )
        return result
    except ValueError as exc:
        logger.error("Terminal compute validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error computing deployment impact: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Sui =====


@router.post("/sui/register-pool")
async def sui_register_pool(request: SuiRegisterPoolRequest):
    """Register a pool on the Sui blockchain."""
    adapter = _get_sui_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Sui adapter unavailable")
    try:
        logger.info("Registering pool on Sui pool_id=%s", request.pool_id)
        result = adapter.register_pool(pool_id=request.pool_id)
        logger.info("Pool registered on Sui")
        return result
    except ValueError as exc:
        logger.error("Sui registration validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error registering pool on Sui: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sui/object/{object_id}")
async def sui_get_object(object_id: str):
    """Get a Sui object by ID."""
    adapter = _get_sui_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Sui adapter unavailable")
    try:
        logger.info("Getting Sui object id=%s", object_id)
        obj = adapter.get_object(object_id)
        if obj is None:
            raise HTTPException(status_code=404, detail=f"Sui object {object_id} not found")
        return obj
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting Sui object %s: %s", object_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/sui/status")
async def sui_status():
    """Get Sui adapter connection status."""
    adapter = _get_sui_adapter()
    if adapter is None:
        return {"status": "unavailable", "detail": "Sui adapter not configured"}
    try:
        logger.info("Checking Sui adapter status")
        status = adapter.get_status()
        return status
    except Exception as exc:
        logger.error("Error checking Sui status: %s", exc, exc_info=True)
        return {"status": "error", "detail": str(exc)}


# ===== XRPL =====


@router.post("/xrpl/send")
async def xrpl_send(request: XrplSendRequest):
    """Send a payment on the XRP Ledger."""
    adapter = _get_xrpl_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="XRPL adapter unavailable")
    try:
        logger.info("Sending XRPL payment destination=%s amount=%s currency=%s", request.destination, request.amount, request.currency)
        result = adapter.send_payment(
            destination=request.destination,
            amount=request.amount,
            currency=request.currency,
            memo=request.memo,
        )
        logger.info("XRPL payment sent")
        return result
    except ValueError as exc:
        logger.error("XRPL send validation error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        logger.error("Error sending XRPL payment: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/xrpl/escrow")
async def xrpl_create_escrow(body: dict):
    """Create an XRPL escrow to lock hedge collateral."""
    adapter = _get_xrpl_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="XRPL adapter unavailable")
    try:
        amount = str(body.get("amount", "1"))
        duration = int(body.get("duration_seconds", 86400))
        memo = body.get("memo", "")
        result = adapter.create_escrow(amount=amount, duration_seconds=duration, memo=memo)
        return result
    except Exception as exc:
        logger.error("Escrow creation error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/xrpl/tx/{tx_hash}")
async def xrpl_get_transaction(tx_hash: str):
    """Get an XRPL transaction by hash."""
    adapter = _get_xrpl_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="XRPL adapter unavailable")
    try:
        logger.info("Getting XRPL transaction hash=%s", tx_hash)
        tx = adapter.get_transaction(tx_hash)
        if tx is None:
            raise HTTPException(status_code=404, detail=f"Transaction {tx_hash} not found")
        return tx
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error getting XRPL transaction %s: %s", tx_hash, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/xrpl/balance")
async def xrpl_balance():
    """Get XRPL wallet balance."""
    adapter = _get_xrpl_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="XRPL adapter unavailable")
    try:
        logger.info("Getting XRPL balance")
        balance = adapter.get_balance()
        return balance
    except Exception as exc:
        logger.error("Error getting XRPL balance: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/xrpl/status")
async def xrpl_status():
    """Get XRPL adapter connection status."""
    adapter = _get_xrpl_adapter()
    if adapter is None:
        return {"status": "unavailable", "detail": "XRPL adapter not configured"}
    try:
        logger.info("Checking XRPL adapter status")
        return {"status": "available" if adapter.is_available() else "unavailable", "rpc_url": adapter.rpc_url}
    except Exception as exc:
        logger.error("Error checking XRPL status: %s", exc, exc_info=True)
        return {"status": "error", "detail": str(exc)}


# ===== Solana =====


@router.get("/solana/status")
async def solana_status():
    adapter = _get_solana_adapter()
    if adapter is None:
        return {"status": "unavailable", "detail": "Solana adapter not loaded"}
    return {"status": "available" if adapter.is_available() else "unavailable", "rpc_url": adapter.rpc_url}

@router.get("/solana/balance")
async def solana_balance():
    adapter = _get_solana_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Solana adapter unavailable")
    return adapter.get_balance()

@router.post("/solana/record")
async def solana_record(body: dict):
    adapter = _get_solana_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Solana adapter unavailable")
    return adapter.record_event(body.get("event_type", "generic"), body.get("data", {}))

@router.post("/solana/wallet")
async def solana_create_wallet():
    adapter = _get_solana_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Solana adapter unavailable")
    return adapter.create_devnet_wallet()

@router.get("/solana/tx/{signature}")
async def solana_get_tx(signature: str):
    adapter = _get_solana_adapter()
    if adapter is None:
        raise HTTPException(status_code=503, detail="Solana adapter unavailable")
    return adapter.get_transaction(signature)


# ===== Audit =====


@router.get("/audit")
async def list_audit_logs(
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    entity_id: Optional[str] = Query(None, description="Filter by entity ID"),
    limit: int = Query(100, ge=1, le=1000, description="Max number of results"),
):
    """List audit log entries."""
    svc = _get_audit_service()
    if svc is None:
        raise HTTPException(status_code=503, detail="Audit service unavailable")
    try:
        logger.info("Listing audit logs entity_type=%s entity_id=%s limit=%s", entity_type, entity_id, limit)
        logs = svc.list_logs(entity_type=entity_type, entity_id=entity_id, limit=limit)
        result = []
        for log in logs:
            log_data = log.model_dump(mode="json")
            log_data["timestamp"] = log.created_at.isoformat()
            log_data["actor"] = f"{log.actor_type}/{log.actor_id}"
            log_data["entity"] = f"{log.entity_type}/{log.entity_id}"
            result.append(log_data)
        return result
    except Exception as exc:
        logger.error("Error listing audit logs: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


# ===== Integration Status =====


@router.get("/status")
async def integration_status():
    """Returns availability status of all adapter integrations."""
    logger.info("Checking integration status for all adapters")

    def _check_adapter(name: str, getter):
        adapter = getter()
        if adapter is None:
            return "unavailable"
        try:
            return "available" if adapter.is_available() else "unavailable"
        except Exception:
            return "unavailable"

    return {
        "sui": _check_adapter("sui", _get_sui_adapter),
        "xrpl": _check_adapter("xrpl", _get_xrpl_adapter),
        "liquid": _check_adapter("liquid", _get_liquid_adapter),
        "solana": _check_adapter("solana", _get_solana_adapter),
    }
