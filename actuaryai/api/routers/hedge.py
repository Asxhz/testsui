"""Hedge recommendation endpoints."""

import json
from fastapi import APIRouter, HTTPException, Depends
from sse_starlette.sse import EventSourceResponse

from actuaryai.api.schemas.request import HedgeRequest
from actuaryai.api.schemas.response import HedgeResponse
from actuaryai.api.services.hedge_service import HedgeService
from actuaryai.config import Settings, get_settings
from actuaryai.logger import get_logger

logger = get_logger(__name__)
router = APIRouter()


def get_hedge_service(settings: Settings = Depends(get_settings)) -> HedgeService:
    """Dependency to get HedgeService instance."""
    return HedgeService(settings)


@router.post("/", response_model=HedgeResponse)
async def create_hedge(
    request: HedgeRequest, service: HedgeService = Depends(get_hedge_service)
):
    """
    Create hedge recommendations for a user's concern.

    - **concern**: User's primary concern or risk
    - **budget**: Budget for hedging (default: $100)
    - **num_markets**: Number of markets to search (default: 500)
    """
    try:
        logger.info(f"Received hedge request: concern='{request.concern[:50]}...'")

        result = service.generate_hedge(
            concern=request.concern,
            budget=request.budget,
            num_markets=request.num_markets,
            max_per_bundle=request.max_per_bundle,
        )

        logger.info("Hedge request completed successfully")
        return result

    except ValueError as e:
        logger.error(f"Validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error generating hedge: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/stream")
async def create_hedge_stream(
    request: HedgeRequest, service: HedgeService = Depends(get_hedge_service)
):
    """
    Create hedge recommendations with real-time progress updates via SSE.

    Returns Server-Sent Events (SSE) with progress updates:
    - **started**: Initial event with request details
    - **progress**: Progress update with current step
    - **context_complete**: Web context gathering complete
    - **search_complete**: Market search complete
    - **filter_complete**: Market filtering complete
    - **bundles_complete**: Bundle generation complete
    - **complete**: Final event with full results
    - **error**: Error event if something goes wrong
    """
    logger.info(f"Received streaming hedge request: concern='{request.concern[:50]}...'")

    async def event_generator():
        try:
            async for event in service.generate_hedge_stream(
                concern=request.concern,
                budget=request.budget,
                num_markets=request.num_markets,
                max_per_bundle=request.max_per_bundle,
            ):
                yield {"event": event["type"], "data": json.dumps(event["data"])}

        except Exception as e:
            logger.error(f"Error in streaming: {e}", exc_info=True)
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())


@router.post("/followup")
async def hedge_followup(body: dict):
    """Answer a follow-up question about a hedge strategy using Claude."""
    try:
        import anthropic
        from actuaryai.config import get_settings

        settings = get_settings()
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        question = body.get("question", "")
        concern = body.get("concern", "")
        bundles_summary = body.get("bundles_summary", "")

        prompt = f"""You are ActuaryAI, a risk analysis advisor. The user asked you to analyze this concern:

CONCERN: {concern}

STRATEGY SUMMARY:
{bundles_summary}

The user now asks: {question}

Answer concisely (2-4 sentences). Be specific about the markets and allocations in their strategy. If they ask about risk, reference specific probabilities. If they ask about changes, suggest specific adjustments."""

        response = client.messages.create(
            model=settings.model,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}]
        )

        answer = response.content[0].text if response.content else "Unable to generate response."

        return {"status": "success", "answer": answer}
    except Exception as e:
        logger.error(f"Followup error: {e}", exc_info=True)
        return {"status": "error", "answer": f"Could not process question: {str(e)}"}
