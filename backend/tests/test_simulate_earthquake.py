import asyncio

from app.crud import insert_event_idempotent
from app.inference import recompute_purok
from app.models import Event, Purok
from app.routers import admin
from app.timeutil import utcnow


def _make_simulated_purok(db, device_id: str, name: str) -> Purok:
    purok = Purok(
        device_id=device_id, name=name, barangay="Test", latitude=0.0, longitude=0.0,
        is_simulated=True, active_needs=[], distinct_buttons_15min=0, status="unknown",
        severity="low", severity_reasons=[],
    )
    db.add(purok)
    db.commit()
    db.refresh(purok)
    return purok


def test_simulate_earthquake_blacks_out_simulated_puroks(db):
    purok = _make_simulated_purok(db, "101", "Purok 1")
    insert_event_idempotent(db, "101", 1, "TUBIG", None, "single", None, purok.id, is_simulated=True)
    recompute_purok(db, purok)
    assert purok.active_needs == ["TUBIG"]

    result = asyncio.run(admin.simulate_earthquake(db))

    db.refresh(purok)
    assert result["status"] == "started"
    assert purok.active_needs == []
    assert purok.status == "unknown"
    assert db.query(Event).filter(Event.purok_id == purok.id).count() == 0


def test_simulate_earthquake_does_not_touch_real_puroks(db):
    from app.crud import get_or_create_real_purok

    real = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(db, "1", 1, "TUBIG", None, "single", None, real.id, is_simulated=False)
    recompute_purok(db, real)

    asyncio.run(admin.simulate_earthquake(db))

    db.refresh(real)
    assert real.active_needs == ["TUBIG"]  # untouched — only is_simulated=True puroks get blacked out
    assert db.query(Event).filter(Event.purok_id == real.id).count() == 1


# _run_earthquake_sequence itself isn't unit-tested here — like poll_esp32_loop and
# severity_sweep_loop, it opens its own SessionLocal() internally rather than accepting
# an injected session, so it can't see the test fixture's isolated in-memory DB. Same
# convention as those two: validated live (real server, real timing) instead of pytest.
