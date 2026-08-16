import asyncio
import json

from app.ingestion_serial import (
    get_or_create_gateway_purok,
    handle_gateway_payload,
    parse_gateway_line,
)
from app.models import Event, Purok


def _line(**overrides) -> str:
    payload = {
        "device_id": "DEV-089",
        "seq_num": 1,
        "msg_type": 0,
        "button_code": 1,  # bit 0 = TABANG
        "press_type": "single",
        "timestamp": 12345,
        "battery_pct": 100,
    }
    payload.update(overrides)
    return json.dumps(payload)


def test_parse_single_button_event():
    result = parse_gateway_line(_line())
    assert result == {
        "device_id": "DEV-089",
        "seq_num": 1,
        "button": "TABANG",
        "combo_buttons": None,
        "press_type": "single",
    }


def test_parse_combo_event():
    # bit0 (TABANG) + bit1 (TUBIG) = 0b11 = 3
    result = parse_gateway_line(_line(button_code=3))
    assert result["button"] == "COMBO"
    assert set(result["combo_buttons"]) == {"TABANG", "TUBIG"}


def test_parse_all_five_buttons_bit_order():
    for bit, name in enumerate(["TABANG", "TUBIG", "TAMBAL", "PAGKAON", "LUWAS"]):
        result = parse_gateway_line(_line(button_code=1 << bit))
        assert result["button"] == name


def test_parse_hold_and_double_press_types():
    assert parse_gateway_line(_line(press_type="hold"))["press_type"] == "hold"
    assert parse_gateway_line(_line(press_type="double"))["press_type"] == "double"


def test_battery_pct_is_dropped_not_stored():
    result = parse_gateway_line(_line(battery_pct=42))
    assert "battery_pct" not in result


def test_heartbeat_returns_none():
    assert parse_gateway_line(_line(msg_type=1)) is None


def test_blank_line_returns_none():
    assert parse_gateway_line("") is None
    assert parse_gateway_line("   \r\n") is None


def test_non_json_boot_log_line_returns_none():
    assert parse_gateway_line("Initializing Gateway Receiver...") is None


def test_malformed_json_returns_none():
    assert parse_gateway_line("{not valid json") is None


def test_missing_required_field_returns_none():
    payload = json.loads(_line())
    del payload["seq_num"]
    assert parse_gateway_line(json.dumps(payload)) is None


def test_zero_button_code_returns_none():
    assert parse_gateway_line(_line(button_code=0)) is None


def test_get_or_create_gateway_purok_is_idempotent(db):
    first = get_or_create_gateway_purok(db, "DEV-089")
    second = get_or_create_gateway_purok(db, "DEV-089")
    assert first.id == second.id
    assert db.query(Purok).filter(Purok.device_id == "DEV-089").count() == 1


def test_get_or_create_gateway_purok_deterministic_position(db):
    # Same device_id must land at the same spot every time (not Python's randomized
    # hash()) — delete and re-create to simulate a fresh backend restart.
    first = get_or_create_gateway_purok(db, "DEV-089")
    lat, lng = first.latitude, first.longitude
    db.delete(first)
    db.commit()

    second = get_or_create_gateway_purok(db, "DEV-089")
    assert (second.latitude, second.longitude) == (lat, lng)


def test_get_or_create_gateway_purok_uses_known_position(db, monkeypatch):
    from app import config

    monkeypatch.setitem(config.KNOWN_DEVICE_POSITIONS, "DEV-001", (11.5, 124.5))
    purok = get_or_create_gateway_purok(db, "DEV-001")
    assert (purok.latitude, purok.longitude) == (11.5, 124.5)


def test_handle_gateway_payload_inserts_real_event(db):
    payload = parse_gateway_line(_line())
    asyncio.run(handle_gateway_payload(db, payload))

    purok = db.query(Purok).filter(Purok.device_id == "DEV-089").first()
    assert purok is not None
    assert purok.active_needs == ["TABANG"]
    events = db.query(Event).filter(Event.purok_id == purok.id).all()
    assert len(events) == 1
    assert events[0].is_simulated is False


def test_handle_gateway_payload_duplicate_seq_num_is_noop(db):
    payload = parse_gateway_line(_line())
    asyncio.run(handle_gateway_payload(db, payload))
    asyncio.run(handle_gateway_payload(db, payload))  # same seq_num again

    purok = db.query(Purok).filter(Purok.device_id == "DEV-089").first()
    assert db.query(Event).filter(Event.purok_id == purok.id).count() == 1
