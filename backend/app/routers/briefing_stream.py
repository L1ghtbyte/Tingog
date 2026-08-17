import json

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.agent.briefing_agent import run_briefing_stream
from app.database import SessionLocal

router = APIRouter(prefix="/api", tags=["briefing"])


async def _event_stream(question: str | None, conversation_id: str | None):
    # The DB session is opened and closed inside this generator, not injected via
    # Depends(get_db) — FastAPI closes Depends() resources when the route function
    # *returns*, which for a StreamingResponse happens immediately after constructing
    # it, well before this generator is actually consumed. Managing the session's
    # lifetime here (same pattern scheduled_briefing_loop already uses) keeps it open
    # for the whole stream instead of closing out from under it mid-run.
    db: Session = SessionLocal()
    try:
        async for event in run_briefing_stream(db, question=question, conversation_id=conversation_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"
    finally:
        db.close()


@router.get("/briefing/stream")
async def get_briefing_stream(
    question: str | None = Query(default=None),
    conversation_id: str | None = Query(default=None),
):
    """Live, step-by-step version of GET /api/briefing (coordinator-query mode only —
    the scheduled loop has no live viewer and calls run_briefing() directly, unaffected
    by this). Strictly additive: /api/briefing stays exactly as it was, unmodified, as a
    fallback if this streaming path ever misbehaves."""
    return StreamingResponse(
        _event_stream(question, conversation_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
