from datetime import timedelta

from app.crud import get_or_create_real_purok, insert_event_idempotent
from app.routers.clusters import get_clusters
from app.routers.events import get_recent_events
from app.timeutil import utcnow


def _make_purok(db, device_id: str, name: str):
    purok = get_or_create_real_purok(db, device_id=device_id)
    purok.name = name
    db.commit()
    db.refresh(purok)
    return purok


def test_get_clusters_empty_by_default(db):
    assert get_clusters(db) == []


def test_get_clusters_returns_real_cluster(db):
    p1 = _make_purok(db, "101", "Purok 1")
    p2 = _make_purok(db, "102", "Purok 2")
    now = utcnow()
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, p1.id, is_simulated=True, received_at=now)
    insert_event_idempotent(
        db, "102", 1, "TUBIG", None, "single", None, p2.id, is_simulated=True, received_at=now - timedelta(minutes=10)
    )

    clusters = get_clusters(db)
    assert len(clusters) == 1
    assert clusters[0]["need_type"] == "TUBIG"
    assert set(clusters[0]["puroks"]) == {"Purok 1", "Purok 2"}


def test_get_recent_events_empty_by_default(db):
    assert get_recent_events(db, minutes=60) == []


def test_get_recent_events_returns_real_event_with_purok_context(db):
    purok = _make_purok(db, "1", "Live Device")
    insert_event_idempotent(db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False)

    events = get_recent_events(db, minutes=60)
    assert len(events) == 1
    assert events[0]["purok_name"] == "Live Device"
    assert events[0]["button"] == "TUBIG"
    assert events[0]["device_id"] == "1"


def test_get_recent_events_excludes_old_events(db):
    purok = _make_purok(db, "1", "Live Device")
    insert_event_idempotent(
        db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False,
        received_at=utcnow() - timedelta(hours=5),
    )

    assert get_recent_events(db, minutes=60) == []
