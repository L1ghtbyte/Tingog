from app.crud import get_or_create_real_purok, insert_event_idempotent
from app.models import Event


def test_duplicate_event_is_noop(db):
    purok = get_or_create_real_purok(db, device_id="1")

    first = insert_event_idempotent(db, "1", 5, "TUBIG", None, "single", 1000, purok.id, is_simulated=False)
    second = insert_event_idempotent(db, "1", 5, "TUBIG", None, "single", 1000, purok.id, is_simulated=False)

    assert first is not None
    assert second is None
    assert db.query(Event).filter_by(device_id="1", seq_num=5).count() == 1
