from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.crud import list_recent_escalations
from app.routers.puroks import get_db
from app.schemas import EscalationOut

router = APIRouter(prefix="/api", tags=["escalations"])


@router.get("/escalations", response_model=list[EscalationOut])
def get_escalations(db: Session = Depends(get_db)):
    """Event-triggered mode's log — every time a purok newly crossed into high
    severity. See app/escalation.py."""
    return list_recent_escalations(db)
