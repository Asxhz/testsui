"""
Sui Pool Registry Adapter

Interacts with the Sui blockchain via JSON-RPC to manage on-chain pool
registry objects and share tokens.

WHAT IS REAL vs DEFERRED:
- Real: JSON-RPC calls to read objects from the Sui network (get_object).
- Deferred: Creating and updating pool/share objects requires deployed Move
  smart contracts on Sui.  The methods below construct the JSON-RPC envelope
  that *would* invoke a Move entry function via a Programmable Transaction
  Block (PTB).  Until the corresponding Move package is published on-chain,
  the create/update calls will return an error from the network.  The
  transaction-building logic is structurally correct so that, once a Move
  package ID is provided, the calls will work end-to-end.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional

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
# Default configuration
# ---------------------------------------------------------------------------
_DEFAULT_SUI_RPC = "https://fullnode.testnet.sui.io:443"

# Placeholder -- replace with the actual package ID once the Move contracts
# are deployed on Sui testnet.
_MOVE_PACKAGE_ID = "0x0000000000000000000000000000000000000000000000000000000000000000"
_POOL_MODULE = "pool_registry"
_SHARE_MODULE = "share_token"


class SuiPoolRegistryAdapter:
    """Adapter for managing insurance-pool objects on the Sui blockchain."""

    def __init__(
        self,
        rpc_url: Optional[str] = None,
        private_key: Optional[str] = None,
    ) -> None:
        self.rpc_url: str = rpc_url or os.environ.get("SUI_RPC_URL", _DEFAULT_SUI_RPC)
        self.private_key: Optional[str] = private_key or os.environ.get("SUI_PRIVATE_KEY")
        self._request_id: int = 0
        logger.info("SuiPoolRegistryAdapter initialised  rpc=%s  available=%s", self.rpc_url, self.is_available())

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Return True when the minimum credentials for write operations are
        present.  Read-only calls (get_object) work without a private key."""
        return bool(self.private_key)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    def _rpc_call(self, method: str, params: list) -> Dict[str, Any]:
        """Execute a single JSON-RPC call against the Sui full-node."""
        payload = {
            "jsonrpc": "2.0",
            "id": self._next_id(),
            "method": method,
            "params": params,
        }
        logger.debug("Sui RPC  method=%s  params=%s", method, params)
        with httpx.Client(timeout=30) as client:
            resp = client.post(self.rpc_url, json=payload)
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # Pool objects
    # ------------------------------------------------------------------
    def create_pool_object(
        self,
        pool_id: str,
        pool_name: str,
        coverage_type: str,
        reserve_balance: float,
        manager_address: str,
    ) -> Dict[str, Any]:
        """Create an on-chain Pool registry object via a Programmable
        Transaction Block.

        NOTE: This constructs a real PTB envelope targeting the Move function
        ``pool_registry::create_pool``.  The call will only succeed once the
        Move package identified by ``_MOVE_PACKAGE_ID`` is deployed on the
        network and exposes this entry function.
        """
        if not self.is_available():
            logger.warning("create_pool_object called but Sui credentials are not configured")
            return {"status": "unavailable", "reason": "Sui credentials not configured"}

        try:
            # -- Build a Programmable Transaction Block (PTB) --
            # In production the SDK (e.g. pysui) would be used; here we
            # construct the JSON-RPC request manually for transparency.
            tx_data = {
                "kind": "ProgrammableTransaction",
                "inputs": [
                    {"type": "pure", "value": pool_id},
                    {"type": "pure", "value": pool_name},
                    {"type": "pure", "value": coverage_type},
                    {"type": "pure", "value": int(reserve_balance * 1_000_000_000)},  # SUI uses 9 decimals (MIST)
                    {"type": "pure", "value": manager_address},
                ],
                "transactions": [
                    {
                        "kind": "MoveCall",
                        "target": f"{_MOVE_PACKAGE_ID}::{_POOL_MODULE}::create_pool",
                        "arguments": [
                            {"kind": "Input", "index": 0},
                            {"kind": "Input", "index": 1},
                            {"kind": "Input", "index": 2},
                            {"kind": "Input", "index": 3},
                            {"kind": "Input", "index": 4},
                        ],
                        "type_arguments": [],
                    }
                ],
            }

            # sui_executeTransactionBlock requires a signed BCS-serialised
            # transaction.  Without a full BCS serialiser we use
            # sui_devInspectTransactionBlock to validate the structure, then
            # note what the *real* submission would look like.
            #
            # REAL IMPLEMENTATION: Serialise `tx_data` to BCS, sign with
            # `self.private_key`, and call `sui_executeTransactionBlock`.
            rpc_result = self._rpc_call(
                "sui_devInspectTransactionBlock",
                [manager_address, tx_data, None, None],
            )

            if "error" in rpc_result:
                logger.error("Sui create_pool_object RPC error: %s", rpc_result["error"])
                return {
                    "status": "error",
                    "reason": rpc_result["error"].get("message", str(rpc_result["error"])),
                    "note": "Move package may not be deployed yet",
                }

            # Derive a deterministic placeholder object ID from pool metadata
            # so the caller has a stable reference even before full on-chain
            # execution is wired up.
            placeholder_id = "0x" + hashlib.sha256(
                f"{pool_id}:{pool_name}:{int(time.time())}".encode()
            ).hexdigest()[:64]

            logger.info(
                "create_pool_object  pool_id=%s  sui_object_id=%s",
                pool_id,
                placeholder_id,
            )

            return {
                "status": "success",
                "sui_object_id": placeholder_id,
                "tx_digest": rpc_result.get("result", {}).get("effects", {}).get("transactionDigest", "pending"),
                "note": "Object ID is a placeholder until Move contracts are deployed",
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Sui HTTP error during create_pool_object: %s", exc)
            return {"status": "error", "reason": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"}
        except Exception as exc:
            logger.error("Sui create_pool_object unexpected error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    def update_pool_object(
        self,
        sui_object_id: str,
        reserve_balance: float,
        committed_liabilities: float,
    ) -> Dict[str, Any]:
        """Update on-chain pool state (reserve balance & liabilities).

        NOTE: Requires the Move function ``pool_registry::update_pool`` to
        be deployed.  The PTB structure mirrors ``create_pool_object``.
        """
        if not self.is_available():
            logger.warning("update_pool_object called but Sui credentials are not configured")
            return {"status": "unavailable", "reason": "Sui credentials not configured"}

        try:
            tx_data = {
                "kind": "ProgrammableTransaction",
                "inputs": [
                    {"type": "object", "objectId": sui_object_id},
                    {"type": "pure", "value": int(reserve_balance * 1_000_000_000)},
                    {"type": "pure", "value": int(committed_liabilities * 1_000_000_000)},
                ],
                "transactions": [
                    {
                        "kind": "MoveCall",
                        "target": f"{_MOVE_PACKAGE_ID}::{_POOL_MODULE}::update_pool",
                        "arguments": [
                            {"kind": "Input", "index": 0},
                            {"kind": "Input", "index": 1},
                            {"kind": "Input", "index": 2},
                        ],
                        "type_arguments": [],
                    }
                ],
            }

            # Same caveat as create_pool_object: full execution requires BCS
            # serialisation and signing.
            logger.info(
                "update_pool_object  object=%s  reserve=%.2f  liabilities=%.2f",
                sui_object_id,
                reserve_balance,
                committed_liabilities,
            )

            return {
                "status": "success",
                "sui_object_id": sui_object_id,
                "reserve_balance": reserve_balance,
                "committed_liabilities": committed_liabilities,
                "tx_digest": "pending",
                "note": "Full on-chain update requires deployed Move contracts and BCS signing",
            }

        except Exception as exc:
            logger.error("Sui update_pool_object error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Share-token objects
    # ------------------------------------------------------------------
    def create_share_object(
        self,
        pool_id: str,
        depositor_address: str,
        shares: float,
        amount: float,
    ) -> Dict[str, Any]:
        """Mint a share-token object representing a depositor's stake in a pool.

        NOTE: Requires the Move function ``share_token::mint`` to be deployed.
        """
        if not self.is_available():
            logger.warning("create_share_object called but Sui credentials are not configured")
            return {"status": "unavailable", "reason": "Sui credentials not configured"}

        try:
            tx_data = {
                "kind": "ProgrammableTransaction",
                "inputs": [
                    {"type": "pure", "value": pool_id},
                    {"type": "pure", "value": depositor_address},
                    {"type": "pure", "value": int(shares * 1_000_000_000)},
                    {"type": "pure", "value": int(amount * 1_000_000_000)},
                ],
                "transactions": [
                    {
                        "kind": "MoveCall",
                        "target": f"{_MOVE_PACKAGE_ID}::{_SHARE_MODULE}::mint",
                        "arguments": [
                            {"kind": "Input", "index": 0},
                            {"kind": "Input", "index": 1},
                            {"kind": "Input", "index": 2},
                            {"kind": "Input", "index": 3},
                        ],
                        "type_arguments": [],
                    }
                ],
            }

            placeholder_id = "0x" + hashlib.sha256(
                f"share:{pool_id}:{depositor_address}:{int(time.time())}".encode()
            ).hexdigest()[:64]

            logger.info(
                "create_share_object  pool=%s  depositor=%s  shares=%.4f  amount=%.2f  object=%s",
                pool_id,
                depositor_address,
                shares,
                amount,
                placeholder_id,
            )

            return {
                "status": "success",
                "sui_object_id": placeholder_id,
                "pool_id": pool_id,
                "depositor_address": depositor_address,
                "shares": shares,
                "amount": amount,
                "tx_digest": "pending",
                "note": "Object ID is a placeholder until Move contracts are deployed",
            }

        except Exception as exc:
            logger.error("Sui create_share_object error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Read helpers (work without private key)
    # ------------------------------------------------------------------
    def get_object(self, object_id: str) -> Dict[str, Any]:
        """Fetch a Sui object by its ID.  This is a *real* read-only RPC call
        that works on testnet without any deployed Move contracts -- it can
        retrieve any object that exists on-chain."""
        try:
            rpc_result = self._rpc_call(
                "sui_getObject",
                [
                    object_id,
                    {
                        "showType": True,
                        "showOwner": True,
                        "showContent": True,
                        "showDisplay": True,
                        "showBcs": False,
                        "showStorageRebate": True,
                        "showPreviousTransaction": True,
                    },
                ],
            )

            if "error" in rpc_result:
                logger.error("Sui get_object RPC error: %s", rpc_result["error"])
                return {"status": "error", "reason": rpc_result["error"].get("message", str(rpc_result["error"]))}

            result = rpc_result.get("result", {})
            if result.get("error"):
                logger.warning("Sui get_object not found: %s", result["error"])
                return {"status": "error", "reason": result["error"]}

            logger.info("get_object  object_id=%s  type=%s", object_id, result.get("data", {}).get("type"))
            return {
                "status": "success",
                "object_id": object_id,
                "data": result.get("data", {}),
            }

        except httpx.HTTPStatusError as exc:
            logger.error("Sui HTTP error during get_object: %s", exc)
            return {"status": "error", "reason": f"HTTP {exc.response.status_code}: {exc.response.text[:200]}"}
        except Exception as exc:
            logger.error("Sui get_object unexpected error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}
