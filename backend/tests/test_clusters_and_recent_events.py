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


def test_cluster_not_corrupted_to_mixed_by_one_puroks_second_unrelated_need(db):
    # Regression test: found live 2026-08-17 running the actual demo — pressing TAMBAL
    # then TUBIG on the real device (already inside a genuine 2-purok TUBIG cluster's
    # window) flipped the cluster's need_type to "mixed", even though only ONE purok
    # (the one that pressed twice) ever reported TAMBAL. A cluster must reflect which
    # need has multiple DISTINCT puroks behind it, not just "more than one need type
    # appeared somewhere in the window."
    p1 = _make_purok(db, "101", "Purok 1")
    p2 = _make_purok(db, "102", "Purok 2")
    p3 = _make_purok(db, "103", "Purok 3")
    now = utcnow()
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, p1.id, is_simulated=True, received_at=now - timedelta(minutes=20))
    insert_event_idempotent(db, "102", 1, "TUBIG", None, "single", None, p2.id, is_simulated=True, received_at=now - timedelta(minutes=10))
    # Purok 3 presses a DIFFERENT need shortly after its own TUBIG press — only Purok 3
    # itself ever reports TAMBAL, so it must not relabel the real TUBIG cluster.
    insert_event_idempotent(db, "103", 1, "TAMBAL", None, "single", None, p3.id, is_simulated=True, received_at=now - timedelta(minutes=2))
    insert_event_idempotent(db, "103", 2, "TUBIG", None, "single", None, p3.id, is_simulated=True, received_at=now)

    clusters = get_clusters(db)
    assert len(clusters) == 1
    assert clusters[0]["need_type"] == "TUBIG"
    assert set(clusters[0]["puroks"]) == {"Purok 1", "Purok 2", "Purok 3"}


def test_cluster_is_genuinely_mixed_when_two_needs_each_have_multiple_puroks(db):
    # The fix above must not eliminate real "mixed" clusters — when TWO DIFFERENT needs
    # each independently have 2+ distinct puroks reporting them in the same window,
    # "mixed" is still the correct, honest label.
    p1 = _make_purok(db, "101", "Purok 1")
    p2 = _make_purok(db, "102", "Purok 2")
    p3 = _make_purok(db, "103", "Purok 3")
    p4 = _make_purok(db, "104", "Purok 4")
    now = utcnow()
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, p1.id, is_simulated=True, received_at=now - timedelta(minutes=20))
    insert_event_idempotent(db, "102", 1, "TUBIG", None, "single", None, p2.id, is_simulated=True, received_at=now - timedelta(minutes=15))
    insert_event_idempotent(db, "103", 1, "TAMBAL", None, "single", None, p3.id, is_simulated=True, received_at=now - timedelta(minutes=10))
    insert_event_idempotent(db, "104", 1, "TAMBAL", None, "single", None, p4.id, is_simulated=True, received_at=now)

    clusters = get_clusters(db)
    assert len(clusters) == 1
    assert clusters[0]["need_type"] == "mixed"
    assert set(clusters[0]["puroks"]) == {"Purok 1", "Purok 2", "Purok 3", "Purok 4"}


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
