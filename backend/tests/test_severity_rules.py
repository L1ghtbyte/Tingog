from app.crud import get_or_create_real_purok
from app.inference import compute_severity, compute_status, recompute_purok


def test_compute_severity_thresholds():
    score, severity, reasons = compute_severity(
        hours_since_last_event=13,
        neighboring_silent=False,
        last_press_type="single",
        last_press_buttons=["TUBIG"],
        distinct_buttons_15min=1,
    )
    assert score == 60  # >6h (30) + >12h (30)
    assert severity == "high"
    assert "no contact in over 6h" in reasons
    assert "no contact in over 12h" in reasons


def test_compute_severity_low_when_no_rules_fire():
    score, severity, reasons = compute_severity(
        hours_since_last_event=1,
        neighboring_silent=False,
        last_press_type="single",
        last_press_buttons=["TUBIG"],
        distinct_buttons_15min=1,
    )
    assert score == 0
    assert severity == "low"
    assert reasons == []


def test_compute_severity_panic_press_rule():
    score, severity, reasons = compute_severity(
        hours_since_last_event=0.1,
        neighboring_silent=False,
        last_press_type="single",
        last_press_buttons=["LUWAS"],
        distinct_buttons_15min=3,
    )
    assert score == 40
    assert severity == "medium"
    assert "multiple different buttons pressed rapidly" in reasons


def test_compute_status_recent_luwas_is_stable():
    assert compute_status(15, "LUWAS", "low") == "stable"


def test_compute_status_stale_luwas_becomes_unknown_not_attention():
    # Regression test (review round 3): a single LUWAS press long ago must not
    # permanently block this purok from reaching "unknown" once silence exceeds
    # STATUS_UNKNOWN_HOURS — the original "no LUWAS ever recorded" spec wording would
    # have capped this at "attention" forever.
    assert compute_status(30, "LUWAS", "high") == "unknown"


def test_compute_status_no_events_ever_is_unknown():
    assert compute_status(None, None, "low") == "unknown"


def test_recompute_purok_with_zero_events_does_not_raise(db):
    # Regression test (review round 3): the severity sweep must not crash comparing
    # None > int when a purok has no events yet (e.g. the real device's row, created
    # eagerly at startup before the ESP32 is ever plugged in).
    purok = get_or_create_real_purok(db, device_id="1")
    recompute_purok(db, purok)  # must not raise
    assert purok.status == "unknown"
    assert purok.severity == "low"
