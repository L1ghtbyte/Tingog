from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.crud import create_delivery_record, get_purok_by_id, get_purok_events, list_purok_deliveries, list_puroks
from app.database import SessionLocal
from app.inference import NEED_BUTTONS, recompute_purok
from app.schemas import DeliveryCreateIn, PurokDetailOut, PurokOut

router = APIRouter(prefix="/api/puroks", tags=["puroks"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _purok_detail(db: Session, purok) -> PurokDetailOut:
    events = get_purok_events(db, purok.id)
    deliveries = list_purok_deliveries(db, purok.id)
    return PurokDetailOut(
        **PurokOut.model_validate(purok).model_dump(), event_history=events, deliveries=deliveries
    )


@router.get("", response_model=list[PurokOut])
def get_puroks(db: Session = Depends(get_db)):
    return list_puroks(db)


@router.get("/{purok_id}", response_model=PurokDetailOut)
def get_purok_detail(purok_id: int, db: Session = Depends(get_db)):
    purok = get_purok_by_id(db, purok_id)
    if purok is None:
        raise HTTPException(status_code=404, detail="Purok not found")
    return _purok_detail(db, purok)


@router.post("/{purok_id}/deliveries", response_model=PurokDetailOut)
def log_delivery(purok_id: int, body: DeliveryCreateIn, db: Session = Depends(get_db)):
    """Coordinator-triggered write, confirming relief that was actually delivered.
    Never exposed as a Briefing Agent tool — the agent only reads deliveries (via
    get_purok), it can never create one itself."""
    purok = get_purok_by_id(db, purok_id)
    if purok is None:
        raise HTTPException(status_code=404, detail="Purok not found")
    if not body.items:
        raise HTTPException(status_code=422, detail="items must be non-empty")
    invalid = sorted(set(body.items) - NEED_BUTTONS)
    if invalid:
        raise HTTPException(status_code=422, detail=f"invalid items: {invalid}")

    create_delivery_record(db, purok_id, body.items, body.delivered_by, body.note)
    recompute_purok(db, purok)  # re-derive active_needs immediately, not on the next 60s sweep

    return _purok_detail(db, purok)
