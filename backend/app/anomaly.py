from datetime import timedelta

from sqlalchemy.orm import Session

from app import config
from app.models import Event, Purok
from app.timeutil import utcnow


def get_anomalies(db: Session) -> list[dict]:
    """
    Crude placeholder, exactly as specified: >5 events in 60 seconds -> "unusually
    frequent presses". Not the real fielded-system algorithm (that needs real
    historical-baseline comparison a few days of hackathon testing can't provide) —
    this exists so the tool returns *something*, not something sophisticated.

    Known interaction, not a bug: the panic-press demo beat (3 distinct buttons within
    15 min, the one rule this project calls genuinely live-demoable) can land inside
    this rule's 60-second window too, flagging the same presses as an anomaly alongside
    the intended severity escalation. Both rules are independently correct.
    """
    now = utcnow()
    since = now - timedelta(seconds=config.ANOMALY_WINDOW_SECONDS)
    anomalies = []

    for purok in db.query(Purok).all():
        count = db.query(Event).filter(Event.purok_id == purok.id, Event.received_at >= since).count()
        if count > config.ANOMALY_EVENT_COUNT:
            anomalies.append(
                {
                    "device_id": purok.device_id,
                    "purok_name": purok.name,
                    "anomaly_type": "unusually frequent presses",
                    "flagged_at": now.isoformat() + "Z",
                }
            )

    return anomalies
