"""
XRPL Settlement Adapter

Submits RLUSD (and XRP) payment transactions to the XRP Ledger testnet for
claim settlements and inter-pool transfers.

WHAT IS REAL vs FALLBACK:
- Real (preferred): Uses the ``xrpl-py`` SDK for wallet derivation, transaction
  construction, signing, and submission.  This is the most reliable path.
- Fallback: If ``xrpl-py`` is not installed, the adapter falls back to raw
  JSON-RPC calls via ``httpx``.  Transaction signing in fallback mode requires
  manual hash computation, which is only partially implemented -- the adapter
  will return an explicit error explaining that ``xrpl-py`` is needed for
  signing.
- Read-only calls (get_transaction, get_balance, create_testnet_wallet) work
  fully in both modes.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any, Dict, List, Optional

import httpx

# Load .env so we can read XRPL_SEED etc.
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
# Try to import xrpl-py; set a flag so methods can branch.
# ---------------------------------------------------------------------------
try:
    import xrpl
    from xrpl.clients import JsonRpcClient
    from xrpl.models.transactions import Payment, Memo
    from xrpl.models.amounts import IssuedCurrencyAmount
    from xrpl.transaction import submit_and_wait, autofill
    from xrpl.asyncio.transaction import submit_and_wait as async_submit_and_wait, autofill as async_autofill
    from xrpl.asyncio.clients import AsyncJsonRpcClient
    from xrpl.wallet import Wallet
    from xrpl.utils import xrp_to_drops

    _HAS_XRPL_PY = True
    logger.info("xrpl-py is available -- using SDK mode")
except ImportError:
    _HAS_XRPL_PY = False
    logger.info("xrpl-py is NOT installed -- using raw httpx JSON-RPC fallback")

# ---------------------------------------------------------------------------
_DEFAULT_XRPL_RPC = "https://s.altnet.rippletest.net:51234"
_TESTNET_EXPLORER = "https://testnet.xrpl.org/transactions"
_TESTNET_FAUCET = "https://faucet.altnet.rippletest.net/accounts"


class XrplSettlementAdapter:
    """Adapter for submitting settlement payments on the XRP Ledger."""

    def __init__(
        self,
        rpc_url: Optional[str] = None,
        seed: Optional[str] = None,
        destination: Optional[str] = None,
    ) -> None:
        self.rpc_url: str = rpc_url or os.environ.get("XRPL_RPC_URL", _DEFAULT_XRPL_RPC)
        self.seed: Optional[str] = seed or os.environ.get("XRPL_SEED")
        self.default_destination: Optional[str] = destination or os.environ.get("XRPL_DESTINATION")

        # SDK client (lazy)
        self._sdk_client: Optional[Any] = None

        logger.info(
            "XrplSettlementAdapter initialised  rpc=%s  sdk=%s  available=%s",
            self.rpc_url,
            _HAS_XRPL_PY,
            self.is_available(),
        )

    # ------------------------------------------------------------------
    # Availability
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Return True when an XRPL seed is configured, enabling payment
        signing and submission."""
        return bool(self.seed)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------
    def _get_sdk_client(self) -> Any:
        """Return a reusable xrpl-py ``JsonRpcClient``."""
        if self._sdk_client is None and _HAS_XRPL_PY:
            self._sdk_client = JsonRpcClient(self.rpc_url)
        return self._sdk_client

    def _raw_rpc(self, method: str, params: Optional[list] = None) -> Dict[str, Any]:
        """Execute a raw JSON-RPC call via httpx (fallback mode)."""
        payload: Dict[str, Any] = {"method": method}
        if params is not None:
            payload["params"] = params
        else:
            payload["params"] = [{}]

        logger.debug("XRPL raw RPC  method=%s", method)
        with httpx.Client(timeout=30) as client:
            resp = client.post(self.rpc_url, json=payload)
            resp.raise_for_status()
            return resp.json()

    # ------------------------------------------------------------------
    # Payments
    # ------------------------------------------------------------------
    def send_payment(
        self,
        destination: str,
        amount: float,
        currency: str = "RLUSD",
        memo: str = "",
    ) -> Dict[str, Any]:
        """Construct, sign, and submit a Payment transaction to the XRPL
        testnet.

        For ``currency="XRP"`` the amount is specified in XRP (converted to
        drops internally).  For issued currencies such as ``RLUSD`` the
        amount is sent as an ``IssuedCurrencyAmount``.

        If ``xrpl-py`` is installed the full sign-and-submit flow is used.
        Otherwise the adapter falls back to building the JSON-RPC request
        manually; signing in fallback mode is *not* fully implemented (the
        XRPL signing algorithm is non-trivial) so an explicit error is
        returned directing the caller to install ``xrpl-py``.
        """
        if not self.is_available():
            logger.warning("send_payment called but XRPL credentials are not configured")
            return {"status": "unavailable", "reason": "XRPL credentials not configured"}

        destination = destination or self.default_destination
        if not destination:
            return {"status": "error", "reason": "No destination address provided"}

        # ---- SDK path (preferred) ----
        if _HAS_XRPL_PY:
            return self._send_payment_sdk(destination, amount, currency, memo)

        # ---- Raw JSON-RPC fallback ----
        return self._send_payment_raw(destination, amount, currency, memo)

    def _send_payment_sdk(
        self, destination: str, amount: float, currency: str, memo: str
    ) -> Dict[str, Any]:
        """Send payment using ``xrpl-py`` SDK -- the real, fully-functional
        path."""
        try:
            wallet = Wallet.from_seed(self.seed)
            client = self._get_sdk_client()

            # Build the Amount field
            if currency.upper() == "XRP":
                from decimal import Decimal
                tx_amount = xrp_to_drops(Decimal(amount))
            else:
                # For issued currencies, an issuer address is required.
                # RLUSD on testnet does not have a canonical issuer yet;
                # the caller or environment should provide one.
                issuer = os.environ.get("RLUSD_ISSUER", wallet.address)
                tx_amount = IssuedCurrencyAmount(
                    currency=currency.upper(),
                    issuer=issuer,
                    value=str(amount),
                )

            # Build memos list
            memos: List[Memo] = []
            if memo:
                memos.append(
                    Memo(
                        memo_data=memo.encode("utf-8").hex(),
                        memo_type="746578742f706c61696e",  # "text/plain" in hex
                    )
                )

            payment = Payment(
                account=wallet.address,
                destination=destination,
                amount=tx_amount,
                memos=memos if memos else None,
            )

            logger.info(
                "XRPL send_payment (SDK)  from=%s  to=%s  amount=%s %s",
                wallet.address,
                destination,
                amount,
                currency,
            )

            # Run in a thread to avoid asyncio.run() conflict inside FastAPI
            import concurrent.futures
            def _sync_send():
                c = JsonRpcClient(self.rpc_url)
                p = autofill(payment, c)
                return submit_and_wait(p, c, wallet)
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(_sync_send)
                response = future.result(timeout=30)

            tx_hash = response.result.get("hash", "unknown")
            engine_result = response.result.get("meta", {}).get("TransactionResult", "unknown")
            explorer_url = f"{_TESTNET_EXPLORER}/{tx_hash}"

            status = "success" if engine_result == "tesSUCCESS" else "error"

            logger.info(
                "XRPL payment result  tx_hash=%s  engine_result=%s  explorer=%s",
                tx_hash,
                engine_result,
                explorer_url,
            )

            return {
                "status": status,
                "tx_hash": tx_hash,
                "engine_result": engine_result,
                "explorer_url": explorer_url,
                "sender": wallet.address,
                "destination": destination,
                "amount": amount,
                "currency": currency,
            }

        except Exception as exc:
            logger.error("XRPL send_payment SDK error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    def _send_payment_raw(
        self, destination: str, amount: float, currency: str, memo: str
    ) -> Dict[str, Any]:
        """Attempt payment via raw JSON-RPC.  Signing is NOT implemented in
        this fallback -- install ``xrpl-py`` for full functionality."""
        try:
            # We can construct the unsigned transaction to show the caller
            # exactly what *would* be submitted.
            if currency.upper() == "XRP":
                tx_amount = str(int(amount * 1_000_000))  # drops
            else:
                issuer = os.environ.get("RLUSD_ISSUER", "rUnspecifiedIssuer")
                tx_amount = {
                    "currency": currency.upper(),
                    "issuer": issuer,
                    "value": str(amount),
                }

            unsigned_tx: Dict[str, Any] = {
                "TransactionType": "Payment",
                "Destination": destination,
                "Amount": tx_amount,
            }

            if memo:
                unsigned_tx["Memos"] = [
                    {
                        "Memo": {
                            "MemoData": memo.encode("utf-8").hex(),
                            "MemoType": "746578742f706c61696e",
                        }
                    }
                ]

            logger.warning(
                "XRPL fallback mode: transaction built but signing requires xrpl-py"
            )

            return {
                "status": "error",
                "reason": (
                    "Raw JSON-RPC fallback cannot sign transactions. "
                    "Install xrpl-py (`pip install xrpl-py`) for full send_payment support."
                ),
                "unsigned_tx": unsigned_tx,
            }

        except Exception as exc:
            logger.error("XRPL send_payment raw fallback error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Read helpers (work in both SDK and fallback modes)
    # ------------------------------------------------------------------
    def get_transaction(self, tx_hash: str) -> Dict[str, Any]:
        """Fetch a transaction from the ledger by its hash.

        This is a real, fully-functional read-only call that works on testnet
        regardless of whether ``xrpl-py`` is installed."""
        try:
            if _HAS_XRPL_PY:
                from xrpl.models.requests import Tx

                client = self._get_sdk_client()
                response = client.request(Tx(transaction=tx_hash))
                if response.is_successful():
                    return {
                        "status": "success",
                        "tx_hash": tx_hash,
                        "data": response.result,
                        "explorer_url": f"{_TESTNET_EXPLORER}/{tx_hash}",
                    }
                return {"status": "error", "reason": str(response.result)}

            # Fallback
            result = self._raw_rpc("tx", [{"transaction": tx_hash, "binary": False}])
            rpc_result = result.get("result", {})
            if rpc_result.get("status") == "success" or "Account" in rpc_result:
                return {
                    "status": "success",
                    "tx_hash": tx_hash,
                    "data": rpc_result,
                    "explorer_url": f"{_TESTNET_EXPLORER}/{tx_hash}",
                }
            return {
                "status": "error",
                "reason": rpc_result.get("error_message", rpc_result.get("error", "Unknown error")),
            }

        except Exception as exc:
            logger.error("XRPL get_transaction error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    def get_balance(self, address: Optional[str] = None) -> Dict[str, Any]:
        """Return the XRP balance (and trust-line balances) for an account.

        This is a real, fully-functional read-only call."""
        try:
            if address is None:
                if not self.is_available():
                    return {"status": "unavailable", "reason": "No address provided and XRPL credentials not configured"}
                if _HAS_XRPL_PY:
                    address = Wallet.from_seed(self.seed).address
                else:
                    return {"status": "error", "reason": "Cannot derive address without xrpl-py; provide address explicitly"}

            # Use raw RPC to avoid asyncio conflicts in FastAPI
            # Fallback
            result = self._raw_rpc("account_info", [{"account": address, "ledger_index": "validated"}])
            rpc_result = result.get("result", {})
            if rpc_result.get("status") == "success" or "account_data" in rpc_result:
                account_data = rpc_result.get("account_data", {})
                balance_drops = int(account_data.get("Balance", "0"))
                return {
                    "status": "success",
                    "address": address,
                    "balance_xrp": balance_drops / 1_000_000,
                    "balance_drops": balance_drops,
                    "account_data": account_data,
                }
            return {
                "status": "error",
                "reason": rpc_result.get("error_message", rpc_result.get("error", "Unknown error")),
            }

        except Exception as exc:
            logger.error("XRPL get_balance error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    def create_testnet_wallet(self) -> Dict[str, Any]:
        """Request a funded wallet from the XRPL testnet faucet.

        This is a real call to the public faucet and returns a usable
        testnet address + seed."""
        try:
            logger.info("Requesting new testnet wallet from faucet")
            with httpx.Client(timeout=30) as client:
                resp = client.post(_TESTNET_FAUCET)
                resp.raise_for_status()
                data = resp.json()

            account = data.get("account", {})
            address = account.get("address") or account.get("classicAddress", "")
            seed = account.get("secret") or account.get("seed", "")

            logger.info("Testnet wallet created  address=%s", address)

            return {
                "status": "success",
                "address": address,
                "seed": seed,
                "balance": account.get("balance", account.get("amount", 0)),
                "faucet_response": data,
            }

        except httpx.HTTPStatusError as exc:
            logger.error("XRPL faucet HTTP error: %s", exc)
            return {"status": "error", "reason": f"Faucet HTTP {exc.response.status_code}: {exc.response.text[:200]}"}
        except Exception as exc:
            logger.error("XRPL create_testnet_wallet error: %s", exc, exc_info=True)
            return {"status": "error", "reason": str(exc)}

    # ------------------------------------------------------------------
    # Escrow
    # ------------------------------------------------------------------
    def create_escrow(self, amount: str, duration_seconds: int = 86400, memo: str = "") -> Dict[str, Any]:
        """Create a real XRPL escrow that locks XRP for a duration.

        This is a REAL XRPL feature - the XRP is locked on-ledger and cannot
        be touched until the finish_after time passes.
        """
        if not self.is_available():
            return {"status": "unavailable", "reason": "XRPL not configured"}
        if not _HAS_XRPL_PY:
            return {"status": "error", "reason": "xrpl-py required for escrow"}

        try:
            import concurrent.futures
            from decimal import Decimal
            from xrpl.models.transactions import EscrowCreate
            import datetime

            wallet = Wallet.from_seed(self.seed)
            destination = self.default_destination or wallet.address

            finish_after = int(time.time()) + duration_seconds
            # XRPL uses Ripple Epoch (seconds since 2000-01-01)
            ripple_epoch_offset = 946684800
            ripple_finish = finish_after - ripple_epoch_offset

            # Build escrow transaction
            escrow_tx = EscrowCreate(
                account=wallet.address,
                destination=destination,
                amount=xrp_to_drops(Decimal(amount)),
                finish_after=ripple_finish,
            )

            # Add memo if provided
            if memo:
                escrow_tx = EscrowCreate(
                    account=wallet.address,
                    destination=destination,
                    amount=xrp_to_drops(Decimal(amount)),
                    finish_after=ripple_finish,
                    memos=[Memo(
                        memo_data=memo.encode('utf-8').hex(),
                        memo_type="746578742f706c61696e".encode() if isinstance("746578742f706c61696e", str) else "746578742f706c61696e",
                    )],
                )

            def _sync_escrow():
                c = JsonRpcClient(self.rpc_url)
                p = autofill(escrow_tx, c)
                return submit_and_wait(p, c, wallet)

            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(_sync_escrow)
                response = future.result(timeout=30)

            tx_hash = response.result.get("hash", "unknown")
            engine_result = response.result.get("meta", {}).get("TransactionResult", "unknown")

            # Extract the escrow sequence for later cancellation/finish
            sequence = response.result.get("Sequence", 0)

            release_time = datetime.datetime.utcfromtimestamp(finish_after).isoformat() + "Z"

            explorer_url = f"{_TESTNET_EXPLORER}/{tx_hash}"

            logger.info("XRPL escrow created: tx=%s amount=%s release=%s", tx_hash, amount, release_time)

            return {
                "status": "success" if engine_result == "tesSUCCESS" else "error",
                "tx_hash": tx_hash,
                "explorer_url": explorer_url,
                "escrow_sequence": sequence,
                "amount_xrp": float(amount),
                "release_time": release_time,
                "duration_seconds": duration_seconds,
                "engine_result": engine_result,
                "owner": wallet.address,
                "destination": destination,
            }
        except Exception as e:
            logger.error("XRPL escrow creation failed: %s", e, exc_info=True)
            return {"status": "error", "reason": str(e)}
