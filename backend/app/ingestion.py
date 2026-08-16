import asyncio
import logging

import httpx
from sqlalchemy import func

from app import config
from app.crud import get_or_create_real_purok, insert_event_idempotent
from app.database import SessionLocal
from app.escalation import deliver_webhook, detect_new_clusters, recompute_and_detect_escalations
from app.models import Event, Purok

logger = logging.getLogger("tanaw.ingestion")

REAL_DEVICE_ID = "1"


async def poll_esp32_loop() -> None:
    """
    Background poller — every INGESTION_POLL_INTERVAL_SECONDS, pulls new events from
    the ESP32 and inserts them idempotently. Uses a synchronous SQLAlchemy session
    directly inside this async loop (no asyncio.to_thread wrapper) — a known, accepted
    tradeoff: every DB write here briefly blocks the event loop also serving the
    dashboard's own requests. At this scale (SQLite, a handful of rows, 1.5s poll
    interval) this is very unlikely to be visible, and a proper async DB layer isn't
    worth the time this week.
    """
    with SessionLocal() as db:
        last_seen_seq_num = db.query(func.max(Event.seq_num)).filter(Event.device_id == REAL_DEVICE_ID).scalar() or 0

    async with httpx.AsyncClient(timeout=5.0) as client:
        while True:
            try:
                resp = await client.get(f"{config.ESP32_BASE_URL}/events", params={"since": last_seen_seq_num})
                resp.raise_for_status()
                data = resp.json()

                with SessionLocal() as db:
                    # The WiFi firmware writes device_id as a bare JSON number (e.g. `1`),
                    # not a string — coerce here so it matches Purok.device_id's string type.
                    device_id = str(data["device_id"])
                    purok = get_or_create_real_purok(db, device_id)
                    got_events = False
                    for evt in data.get("events", []):
                        button = evt.get("button", "COMBO")
                        combo_buttons = evt.get("buttons")
                        insert_event_idempotent(
                            db,
                            device_id,
                            evt["seq_num"],
                            button,
                            combo_buttons,
                            evt["press_type"],
                            evt.get("timestamp"),
                            purok.id,
                            is_simulated=False,
                        )
                        last_seen_seq_num = max(last_seen_seq_num, evt["seq_num"])
                        got_events = True
                    if got_events:
                        escalations = recompute_and_detect_escalations(db, purok)
                        escalations += detect_new_clusters(db)
                        for escalation in escalations:
                            await deliver_webhook(db, escalation)
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                # ESP32 not connected yet during dev — expected, keep retrying, never crash.
                logger.debug("ESP32 poll failed (expected if not connected): %s", exc)

            await asyncio.sleep(config.INGESTION_POLL_INTERVAL_SECONDS)


async def severity_sweep_loop() -> None:
    """Periodic sweep across all puroks — catches time-based escalation for puroks
    that have gone quiet, since recompute_purok() otherwise only runs on new events.
    Also event-triggered mode's other detection point: a purok can newly cross into
    high severity (or de-escalate, or a cluster can newly form) from silence/time alone,
    not just from a fresh event."""
    while True:
        await asyncio.sleep(config.SEVERITY_SWEEP_INTERVAL_SECONDS)
        try:
            with SessionLocal() as db:
                escalations = []
                for purok in db.query(Purok).all():
                    escalations += recompute_and_detect_escalations(db, purok)
                escalations += detect_new_clusters(db)
                for escalation in escalations:
                    await deliver_webhook(db, escalation)
        except Exception:
            logger.exception("Severity sweep failed")
