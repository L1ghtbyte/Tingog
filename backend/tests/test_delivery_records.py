from datetime import timedelta

from app.crud import create_delivery_record, get_or_create_real_purok, insert_event_idempotent
from app.inference import recompute_purok
from app.timeutil import utcnow


def test_delivery_clears_only_its_own_item(db):
    purok = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False)
    insert_event_idempotent(db, "1", 2, "PAGKAON", None, "single", None, purok.id, is_simulated=False)
    recompute_purok(db, purok)
    assert purok.active_needs == ["PAGKAON", "TUBIG"]

    create_delivery_record(db, purok.id, ["TUBIG"], delivered_by="Coordinator A")
    recompute_purok(db, purok)

    assert purok.active_needs == ["PAGKAON"]


def test_delivery_before_a_later_press_does_not_clear_it(db):
    # A need pressed AFTER a delivery for that same item must stay active — the
    # delivery only clears what existed up to that point in time, not future presses.
    purok = get_or_create_real_purok(db, device_id="1")
    now = utcnow()
    insert_event_idempotent(
        db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False, received_at=now - timedelta(hours=2)
    )
    create_delivery_record(db, purok.id, ["TUBIG"], delivered_at=now - timedelta(hours=1))
    insert_event_idempotent(
        db, "1", 2, "TUBIG", None, "single", None, purok.id, is_simulated=False, received_at=now
    )
    recompute_purok(db, purok)

    assert purok.active_needs == ["TUBIG"]


def test_luwas_still_clears_everything_deliveries_or_not(db):
    purok = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(db, "1", 1, "TUBIG", None, "single", None, purok.id, is_simulated=False)
    insert_event_idempotent(db, "1", 2, "LUWAS", None, "single", None, purok.id, is_simulated=False)
    recompute_purok(db, purok)

    assert purok.active_needs == []


def test_delivery_endpoint_rejects_invalid_item(db):
    from fastapi import HTTPException
    import pytest

    from app.routers.puroks import log_delivery
    from app.schemas import DeliveryCreateIn

    purok = get_or_create_real_purok(db, device_id="1")
    with pytest.raises(HTTPException) as exc_info:
        log_delivery(purok.id, DeliveryCreateIn(items=["NOT_A_BUTTON"]), db)
    assert exc_info.value.status_code == 422


def test_delivery_endpoint_updates_purok_detail_immediately(db):
    from app.routers.puroks import log_delivery
    from app.schemas import DeliveryCreateIn

    purok = get_or_create_real_purok(db, device_id="1")
    insert_event_idempotent(db, "1", 1, "TAMBAL", None, "single", None, purok.id, is_simulated=False)
    recompute_purok(db, purok)
    assert purok.active_needs == ["TAMBAL"]

    detail = log_delivery(purok.id, DeliveryCreateIn(items=["TAMBAL"], delivered_by="Coordinator A"), db)

    assert detail.active_needs == []
    assert len(detail.deliveries) == 1
    assert detail.deliveries[0].items == ["TAMBAL"]
    assert detail.deliveries[0].delivered_by == "Coordinator A"
