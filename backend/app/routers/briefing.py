from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import crud
from app.agent.briefing_agent import reconstruct_conversation_turns, run_briefing
from app.routers.puroks import get_db
from app.schemas import BriefingResponse, ConversationHistoryOut, LastBriefingOut

router = APIRouter(prefix="/api", tags=["briefing"])


@router.get("/briefing/last", response_model=LastBriefingOut | None)
async def get_last_briefing(db: Session = Depends(get_db)):
    """Passive read of the most recently saved briefing — no agent run, no LLM call,
    just the last thing that was actually generated. Returns null if nothing has been
    generated yet this session. For a dashboard to show *something* on load without
    forcing a fresh (slower, LLM-backed) request the moment the page opens."""
    return crud.get_latest_briefing_record(db)


@router.get("/briefing/conversation/last", response_model=ConversationHistoryOut | None)
async def get_last_conversation(db: Session = Depends(get_db)):
    """The full replayable back-and-forth for the most recently active conversation —
    lets the dashboard chat panel show a coordinator's whole prior exchange again after
    a page reload or server restart, not just the single last saved narrative. Returns
    null if no conversation has been saved yet (matches get_last_briefing's shape)."""
    record = crud.get_latest_conversation(db)
    if record is None:
        return None
    return ConversationHistoryOut(
        conversation_id=record.id,
        turns=reconstruct_conversation_turns(record.messages),
        updated_at=record.updated_at,
    )


@router.get("/briefing", response_model=BriefingResponse)
async def get_briefing(
    db: Session = Depends(get_db),
    question: str | None = Query(
        default=None,
        description="A specific coordinator question (e.g. 'what's the water situation?'). "
        "Omit for a general briefing — either way the agent decides which tools are "
        "actually relevant. May come back as mode='clarifying' if the question is "
        "genuinely ambiguous.",
    ),
    conversation_id: str | None = Query(
        default=None,
        description="Pass back the conversation_id from a prior response to continue that "
        "thread (e.g. a follow-up question with the earlier exchange still in context). "
        "Omit to start fresh. The response always includes a conversation_id, whether or "
        "not one was passed in — save it if you might want to follow up later.",
    ),
):
    return await run_briefing(db, question=question, conversation_id=conversation_id)
