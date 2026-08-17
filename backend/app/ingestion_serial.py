"""
Real hardware ingestion — the primary path, confirmed with the hardware engineer.

Purok devices (tingog-purok firmware) broadcast button presses over ESP-NOW to one
gateway device (tingog-gateway firmware), which relays each one as a newline-delimited
JSON line over a USB serial cable to this backend. This supersedes the single-ESP32
WiFi-hotspot-and-HTTP design (ingestion.py's poll_esp32_loop) — that design can't scale
past one real device, since a laptop can only join one WiFi network at a time, while
ESP-NOW's broadcast-to-one-gateway shape is a genuine many-to-one fit for a real
multi-purok deployment.

Split pure-parsing vs DB-facing orchestration the same way inference.py is, specifically
so the risky JSON/bitmask decoding is unit-testable without a real or virtual serial
port — only serial_listener_loop's actual port-opening needs real hardware to validate.
"""

import asyncio
import hashlib
import json
import logging

import serial
from sqlalchemy.orm import Session

from app import config
from app.crud import insert_event_idempotent
from app.database import SessionLocal
from app.escalation import deliver_webhook, detect_new_clusters, recompute_and_detect_escalations
from app.models import Purok

logger = logging.getLogger("tingog.ingestion_serial")

# Confirmed live from tingog-purok's BUTTON_PINS array order ({4, 5, 18, 19, 21}), the
# same order as the original WiFi firmware's BUTTON_NAMES — bit 0 is the first pin.
BUTTON_BIT_NAMES = ["TABANG", "TUBIG", "TAMBAL", "PAGKAON", "LUWAS"]

PRESS_TYPE_BY_CODE = {0: "single", 1: "hold", 2: "double"}

MSG_TYPE_EVENT = 0
MSG_TYPE_HEARTBEAT = 1


def parse_gateway_line(line: str) -> dict | None:
    """Decodes one JSON line from tingog-gateway into our internal event shape.
    Returns None for a heartbeat, a blank/non-JSON line (the gateway's own boot log
    mixes in plain-text debug output), or a malformed payload — callers skip, never
    crash, on any of these, same posture as poll_esp32_loop's WiFi equivalent."""
    line = line.strip()
    if not line or not line.startswith("{"):
        return None

    try:
        payload = json.loads(line)
    except json.JSONDecodeError:
        logger.debug("Unparseable gateway line, skipping: %r", line)
        return None

    msg_type = payload.get("msg_type", MSG_TYPE_EVENT)
    if msg_type == MSG_TYPE_HEARTBEAT:
        # tingog-purok doesn't send these yet, but the field already exists in the wire
        # protocol — stay forward-compatible without pretending to act on it today.
        logger.debug("Heartbeat from %s, not yet acted on", payload.get("device_id"))
        return None

    try:
        device_id = str(payload["device_id"])
        seq_num = int(payload["seq_num"])
        button_code = int(payload["button_code"])
    except (KeyError, TypeError, ValueError):
        logger.warning("Malformed gateway event, skipping: %r", payload)
        return None

    # tingog-gateway sends press_type already decoded to a string ("single"/"hold"/
    # "double") — tolerate a raw numeric code too, in case that ever changes upstream.
    press_type_raw = payload.get("press_type", "single")
    press_type = press_type_raw if isinstance(press_type_raw, str) else PRESS_TYPE_BY_CODE.get(int(press_type_raw), "single")

    pressed_names = [name for i, name in enumerate(BUTTON_BIT_NAMES) if button_code & (1 << i)]
    if not pressed_names:
        logger.warning("Gateway event with no button bits set, skipping: %r", payload)
        return None

    button, combo_buttons = (pressed_names[0], None) if len(pressed_names) == 1 else ("COMBO", pressed_names)

    # battery_pct is deliberately dropped here, not carried into the DB — it's hardcoded
    # to 100 in the current firmware (not a real sensor reading), and battery stays a
    # frontend-only, honestly-disclosed placeholder rather than a backend field, per the
    # earlier decision that it has no functional role anywhere in this system's logic.
    #
    # No device_timestamp either: the wire payload's "timestamp" is the GATEWAY's local
    # millis()-since-boot at receipt, not the originating purok device's own clock — a
    # different thing than what device_timestamp means elsewhere in this codebase, so
    # storing it there would misrepresent it rather than honestly leave it unset.
    return {
        "device_id": device_id,
        "seq_num": seq_num,
        "button": button,
        "combo_buttons": combo_buttons,
        "press_type": press_type,
    }


def _deterministic_offset(device_id: str) -> tuple[float, float]:
    """A stable small lat/lng offset derived from the device_id — NOT Python's built-in
    hash(), which is randomized per process by default and wouldn't stay consistent
    across backend restarts. Used only when a device has no KNOWN_DEVICE_POSITIONS
    entry, so an auto-registered purok still gets a consistent map position instead of
    jumping around on every restart."""
    digest = hashlib.md5(device_id.encode()).hexdigest()
    lat_unit = int(digest[:8], 16) / 0xFFFFFFFF
    lng_unit = int(digest[8:16], 16) / 0xFFFFFFFF
    return (lat_unit - 0.5) * 0.01, (lng_unit - 0.5) * 0.01  # roughly +/- 500m


def get_or_create_gateway_purok(db: Session, device_id: str) -> Purok:
    """Multi-device version of crud.get_or_create_real_purok — auto-registers a new real
    purok the first time a gateway device is seen, rather than assuming the single
    pre-known device_id the legacy WiFi path used."""
    purok = db.query(Purok).filter(Purok.device_id == device_id).first()
    if purok is not None:
        return purok

    if device_id in config.KNOWN_DEVICE_POSITIONS:
        lat, lng = config.KNOWN_DEVICE_POSITIONS[device_id]
    else:
        lat_offset, lng_offset = _deterministic_offset(device_id)
        lat, lng = config.BARANGAY_CENTER_LAT + lat_offset, config.BARANGAY_CENTER_LNG + lng_offset

    # "Live Device (DEV-089)" was a dead giveaway this purok is different from the
    # simulated ones — the UI no longer distinguishes real from simulated at all, so an
    # unknown device still gets a generic fallback name, but a KNOWN one (config.
    # KNOWN_DEVICE_NAMES) gets a real purok-style name that blends in, same override
    # pattern as KNOWN_DEVICE_POSITIONS above.
    name = config.KNOWN_DEVICE_NAMES.get(device_id, f"Live Device ({device_id})")
    leader = config.KNOWN_DEVICE_LEADERS.get(device_id, "Purok Leader (TBD)")

    purok = Purok(
        device_id=device_id,
        name=name,
        barangay=config.BARANGAY_NAME,
        purok_leader=leader,
        latitude=lat,
        longitude=lng,
        is_simulated=False,
        # A bare 0 here reads as "confirmed zero vulnerable households," not "no data
        # yet" — misleading in the exact way the honestly-placeholder purok_leader field
        # above isn't. A small reasonable mock value (same category as the simulated
        # puroks' seeded counts) until real roster data exists for this device.
        baseline_vulnerable_count=2,
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


async def handle_gateway_payload(db: Session, payload: dict) -> None:
    """DB-facing orchestration — the same real pipeline every other ingestion path
    already uses (idempotent insert, recompute, escalation, webhook), no logic
    duplicated for the new transport."""
    purok = get_or_create_gateway_purok(db, payload["device_id"])
    inserted = insert_event_idempotent(
        db,
        payload["device_id"],
        payload["seq_num"],
        payload["button"],
        payload["combo_buttons"],
        payload["press_type"],
        None,
        purok.id,
        is_simulated=False,
    )
    if inserted is None:
        return  # duplicate seq_num, already processed

    escalations = recompute_and_detect_escalations(db, purok)
    escalations += detect_new_clusters(db)
    for escalation in escalations:
        await deliver_webhook(db, escalation)


async def serial_listener_loop() -> None:
    """Opens the gateway's serial port and processes lines as they arrive. Never crashes
    on a bad line, a temporarily unplugged gateway, or a wrong port — logs and keeps
    retrying, same resilience posture as poll_esp32_loop's WiFi equivalent. This is the
    one part of the ingestion path that genuinely needs real-hardware validation, not
    just unit tests — parse_gateway_line/handle_gateway_payload above are covered by
    tests, but opening an actual OS serial port isn't something a test can fake
    meaningfully."""
    while True:
        try:
            with serial.Serial(config.GATEWAY_SERIAL_PORT, config.GATEWAY_BAUD_RATE, timeout=1) as port:
                logger.info("Gateway serial listener connected on %s", config.GATEWAY_SERIAL_PORT)
                while True:
                    raw = await asyncio.to_thread(port.readline)
                    if not raw:
                        continue  # read timeout, no data this second — keep listening
                    payload = parse_gateway_line(raw.decode("utf-8", errors="replace"))
                    if payload is None:
                        continue
                    with SessionLocal() as db:
                        await handle_gateway_payload(db, payload)
        except (serial.SerialException, OSError) as exc:
            logger.warning("Gateway serial port unavailable (%s) — retrying in 5s", exc)
            await asyncio.sleep(5)
