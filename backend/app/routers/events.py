from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.crud import list_recent_events
from app.routers.puroks import get_db
from app.schemas import RecentEventOut

router = APIRouter(prefix="/api", tags=["events"])


@router.get("/events/recent", response_model=list[RecentEventOut])
def get_recent_events(
    db: Session = Depends(get_db),
    minutes: int = Query(default=60, description="How far back to look, in minutes."),
):
    """Flattened event feed across all puroks, for the dashboard's own recent-activity
    view — distinct from GET /api/puroks/{id} (one purok's own history) and from the
    Briefing Agent's internal get_recent_activity tool (aggregated counts only)."""
    return list_recent_events(db, minutes)
