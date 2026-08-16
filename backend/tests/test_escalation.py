import asyncio
from datetime import timedelta

from app.crud import get_or_create_real_purok, insert_event_idempotent
from app.escalation import deliver_webhook, detect_new_clusters, recompute_and_detect_escalations
from app.models import EscalationRecord, Purok
from app.timeutil import utcnow


def _make_high_severity_purok(db):
    purok = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(
        db, "1", 1, "TABANG", None, "hold", None, purok.id, is_simulated=False, received_at=utcnow() - timedelta(hours=14)
    )
    return purok


def test_escalation_fires_on_transition_to_high(db):
    purok = _make_high_severity_purok(db)
    records = recompute_and_detect_escalations(db, purok)
    kinds = {r.kind for r in records}
    assert "high_severity" in kinds
    assert purok.severity == "high"
    assert db.query(EscalationRecord).filter_by(kind="high_severity").count() == 1


def test_escalation_does_not_refire_when_already_high(db):
    # Regression-shaped test: a purok that STAYS high across repeated sweeps must not
    # re-alert every sweep — only the transition into high should fire.
    purok = _make_high_severity_purok(db)
    first = recompute_and_detect_escalations(db, purok)
    second = recompute_and_detect_escalations(db, purok)
    assert any(r.kind == "high_severity" for r in first)
    assert not any(r.kind == "high_severity" for r in second)
    assert db.query(EscalationRecord).filter_by(kind="high_severity").count() == 1


def test_escalation_does_not_fire_for_low_severity(db):
    purok = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(
        db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False, received_at=utcnow() - timedelta(minutes=5)
    )
    records = recompute_and_detect_escalations(db, purok)
    assert records == []


def test_de_escalation_fires_when_severity_drops_from_high(db):
    purok = _make_high_severity_purok(db)
    recompute_and_detect_escalations(db, purok)  # first press -> high
    assert purok.severity == "high"

    # A recent LUWAS resets hours-since-last-event to ~0, clearing the silence rules
    # and the held-TABANG rule (last press is now LUWAS, not TABANG) -> severity drops.
    insert_event_idempotent(db, "1", 2, "LUWAS", None, "single", None, purok.id, is_simulated=False, received_at=utcnow())
    records = recompute_and_detect_escalations(db, purok)

    assert purok.severity != "high"
    assert any(r.kind == "de_escalation" for r in records)


def test_panic_press_fires_independent_of_overall_severity(db):
    # Three distinct buttons pressed rapidly, all recent (so silence rules don't also
    # fire) -> panic-press threshold crossed, but the resulting score (40, from the
    # panic rule alone) lands at "medium", not "high". The panic_press escalation must
    # still fire even though high_severity does not.
    purok = get_or_create_real_purok(db, device_id="1")
    now = utcnow()
    for i, button in enumerate(["TABANG", "TUBIG", "TAMBAL"]):
        insert_event_idempotent(
            db, "1", i + 1, button, None, "single", None, purok.id, is_simulated=False, received_at=now - timedelta(minutes=i)
        )
    records = recompute_and_detect_escalations(db, purok)

    assert purok.severity != "high"
    assert any(r.kind == "panic_press" for r in records)


def test_deliver_webhook_is_noop_without_url_configured(db):
    purok = _make_high_severity_purok(db)
    records = recompute_and_detect_escalations(db, purok)
    record = next(r for r in records if r.kind == "high_severity")
    assert record.webhook_delivered is False

    asyncio.run(deliver_webhook(db, record))  # config.ESCALATION_WEBHOOK_URL unset by default

    assert record.webhook_delivered is False


def _make_purok(db, device_id: str, name: str) -> Purok:
    purok = Purok(
        device_id=device_id, name=name, barangay="Test", latitude=0.0, longitude=0.0,
        is_simulated=True, active_needs=[], distinct_buttons_15min=0, status="unknown",
        severity="low", severity_reasons=[],
    )
    db.add(purok)
    db.commit()
    db.refresh(purok)
    return purok


def test_new_cluster_fires_once_then_does_not_refire(db):
    p1 = _make_purok(db, "101", "Purok 1")
    p2 = _make_purok(db, "102", "Purok 2")
    now = utcnow()
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, p1.id, is_simulated=True, received_at=now)
    insert_event_idempotent(
        db, "102", 1, "TUBIG", None, "single", None, p2.id, is_simulated=True, received_at=now - timedelta(minutes=10)
    )

    first = detect_new_clusters(db)
    assert len(first) == 1
    assert first[0].kind == "new_cluster"
    assert first[0].purok_id is None  # spans multiple puroks, no single FK target

    second = detect_new_clusters(db)  # same cluster, nothing changed
    assert second == []


def test_no_cluster_detected_for_single_purok(db):
    p1 = _make_purok(db, "101", "Purok 1")
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, p1.id, is_simulated=True, received_at=utcnow())

    assert detect_new_clusters(db) == []
