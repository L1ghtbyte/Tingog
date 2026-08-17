import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Without this, only WARNING-and-above log calls reach the console (Python's logging
# module attaches no real handler otherwise) — so ingestion_serial.py's INFO-level
# "Gateway serial listener connected" confirmation would silently never appear,
# leaving no positive signal that a real gateway connection actually succeeded.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

from app import config
from app.agent.briefing_agent import scheduled_briefing_loop
from app.crud import get_or_create_real_purok
from app.database import SessionLocal, init_db
from app.ingestion import poll_esp32_loop, severity_sweep_loop
from app.ingestion_serial import serial_listener_loop
from app.routers import admin, briefing, briefing_stream, clusters, escalations, events, puroks

REAL_DEVICE_ID = "1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    background_tasks = [asyncio.create_task(severity_sweep_loop()), asyncio.create_task(scheduled_briefing_loop())]

    # Primary real-hardware path, confirmed with the hardware engineer: purok devices
    # broadcast over ESP-NOW to one gateway, relayed here over USB serial — see
    # ingestion_serial.py. The single-ESP32 WiFi-hotspot-and-HTTP path is superseded but
    # kept available, opt-in, in case that direction is ever revisited.
    if config.ENABLE_GATEWAY_SERIAL_INGESTION:
        background_tasks.append(asyncio.create_task(serial_listener_loop()))

    if config.ENABLE_LEGACY_WIFI_INGESTION:
        # This device's purok row is created here, not lazily on first successful poll —
        # so its "LIVE" card exists immediately in status=unknown, rather than appearing
        # out of nowhere mid-pitch once the device happens to connect.
        with SessionLocal() as db:
            get_or_create_real_purok(db, device_id=REAL_DEVICE_ID)
        background_tasks.append(asyncio.create_task(poll_esp32_loop()))

    try:
        yield
    finally:
        for task in background_tasks:
            task.cancel()


app = FastAPI(title="Tingog Backend", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(puroks.router)
app.include_router(briefing.router)
app.include_router(briefing_stream.router)
app.include_router(admin.router)
app.include_router(escalations.router)
app.include_router(clusters.router)
app.include_router(events.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
