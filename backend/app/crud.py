from datetime import datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import config
from app.models import BriefingRecord, ConversationRecord, DeliveryRecord, EscalationRecord, Event, Purok
from app.timeutil import utcnow


def insert_event_idempotent(
    db: Session,
    device_id: str,
    seq_num: int,
    button: str,
    combo_buttons: list[str] | None,
    press_type: str,
    device_timestamp: int | None,
    purok_id: int,
    is_simulated: bool,
    received_at: datetime | None = None,
) -> Event | None:
    existing = db.query(Event).filter_by(device_id=device_id, seq_num=seq_num).first()
    if existing:
        return None

    event = Event(
        purok_id=purok_id,
        device_id=device_id,
        seq_num=seq_num,
        button=button,
        combo_buttons=combo_buttons,
        press_type=press_type,
        device_timestamp=device_timestamp,
        received_at=received_at or utcnow(),
        is_simulated=is_simulated,
    )
    db.add(event)
    try:
        db.commit()
    except IntegrityError:
        # Race-condition backstop: the UniqueConstraint caught a duplicate the query above missed.
        db.rollback()
        return None
    db.refresh(event)

    purok = db.query(Purok).filter(Purok.id == purok_id).first()
    if purok is not None:
        purok.last_event_at = event.received_at
        db.commit()

    return event


def get_or_create_real_purok(db: Session, device_id: str) -> Purok:
    purok = db.query(Purok).filter(Purok.device_id == device_id).first()
    if purok is not None:
        return purok

    purok = Purok(
        device_id=device_id,
        name="Live Device",
        barangay=config.BARANGAY_NAME,
        purok_leader="Purok Leader (TBD)",  # reasonable hackathon placeholder, not a fabricated identity
        latitude=config.REAL_DEVICE_LAT,
        longitude=config.REAL_DEVICE_LNG,
        is_simulated=False,
        # A bare 0 reads as "confirmed zero households," not "no roster data yet" — the
        # same reasoning get_or_create_gateway_purok's own comment gives (ingestion_serial.py).
        baseline_household_count=30,
        active_needs=[],
        distinct_buttons_15min=0,
        status="unknown",
        severity="low",
        severity_reasons=[],
    )
    db.add(purok)
    db.commit()
    db.refresh(purok)
    return purok


def list_puroks(db: Session) -> list[Purok]:
    return db.query(Purok).order_by(Purok.device_id).all()


def get_purok_by_id(db: Session, purok_id: int) -> Purok | None:
    return db.query(Purok).filter(Purok.id == purok_id).first()


def get_purok_events(db: Session, purok_id: int) -> list[Event]:
    return db.query(Event).filter(Event.purok_id == purok_id).order_by(Event.received_at.asc()).all()


def list_recent_events(db: Session, minutes: int) -> list[dict]:
    """Same time-window query as agent/tools.py's get_recent_activity, but returns raw
    event rows (with purok context attached) instead of aggregated counts — for the
    dashboard's own recent-activity feed, not the Briefing Agent."""
    since = utcnow() - timedelta(minutes=minutes)
    rows = (
        db.query(Event, Purok.name)
        .join(Purok, Purok.id == Event.purok_id)
        .filter(Event.received_at >= since)
        .order_by(Event.received_at.desc())
        .all()
    )
    return [
        {
            "id": event.id,
            "purok_id": event.purok_id,
            "purok_name": purok_name,
            "device_id": event.device_id,
            "button": event.button,
            "combo_buttons": event.combo_buttons,
            "press_type": event.press_type,
            "received_at": event.received_at,
            "is_simulated": event.is_simulated,
        }
        for event, purok_name in rows
    ]


def save_briefing_record(
    db: Session, narrative: str, claims: list[dict], trigger_source: str, assessment: str | None = None
) -> BriefingRecord:
    record = BriefingRecord(narrative=narrative, claims=claims, trigger_source=trigger_source, assessment=assessment)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_latest_briefing_record(db: Session) -> BriefingRecord | None:
    return db.query(BriefingRecord).order_by(BriefingRecord.created_at.desc()).first()


def create_escalation_record(
    db: Session,
    kind: str,
    message: str,
    purok_id: int | None = None,
    purok_name: str = "",
    reasons: list[str] | None = None,
    webhook_delivered: bool = False,
) -> EscalationRecord:
    record = EscalationRecord(
        kind=kind,
        purok_id=purok_id,
        purok_name=purok_name,
        reasons=reasons or [],
        message=message,
        webhook_delivered=webhook_delivered,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_recent_escalations(db: Session, limit: int = 20) -> list[EscalationRecord]:
    return db.query(EscalationRecord).order_by(EscalationRecord.created_at.desc()).limit(limit).all()


def create_delivery_record(
    db: Session,
    purok_id: int,
    items: list[str],
    delivered_by: str | None = None,
    note: str | None = None,
    delivered_at: datetime | None = None,
) -> DeliveryRecord:
    record = DeliveryRecord(
        purok_id=purok_id,
        items=items,
        delivered_by=delivered_by,
        note=note,
        delivered_at=delivered_at or utcnow(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_purok_deliveries(db: Session, purok_id: int) -> list[DeliveryRecord]:
    return (
        db.query(DeliveryRecord)
        .filter(DeliveryRecord.purok_id == purok_id)
        .order_by(DeliveryRecord.delivered_at.asc())
        .all()
    )


def get_conversation(db: Session, conversation_id: str) -> ConversationRecord | None:
    return db.query(ConversationRecord).filter(ConversationRecord.id == conversation_id).first()


def get_latest_conversation(db: Session) -> ConversationRecord | None:
    return db.query(ConversationRecord).order_by(ConversationRecord.updated_at.desc()).first()


def save_conversation(db: Session, conversation_id: str, messages: list[dict]) -> ConversationRecord:
    record = get_conversation(db, conversation_id)
    if record is None:
        record = ConversationRecord(id=conversation_id, messages=messages)
        db.add(record)
    else:
        record.messages = messages
    db.commit()
    db.refresh(record)
    return record
