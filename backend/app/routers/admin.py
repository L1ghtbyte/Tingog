import asyncio
import random

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.crud import insert_event_idempotent
from app.database import SessionLocal
from app.escalation import deliver_webhook, detect_new_clusters, recompute_and_detect_escalations
from app.inference import recompute_purok
from app.models import Event, Purok
from app.routers.puroks import get_db
from app.schemas import PurokOut
from app.seed_data import run_seed

router = APIRouter(prefix="/api", tags=["admin"])


@router.post("/seed-simulated", response_model=list[PurokOut])
def seed_simulated(db: Session = Depends(get_db)):
    return run_seed(db)


# Demo-mode "simulate earthquake" — redesigned from a client-only fake-data version
# found on an unmerged branch (fabricated an entire blackout-then-recovery sequence in
# the browser with no on-screen disclosure it was fake). This version drip-feeds real
# synthetic presses through the exact same pipeline every other event goes through —
# every row it creates is a normal is_simulated=True Event, so the frontend needs no
# special case and the existing [SIMULATED] badge already covers disclosure.
NEED_POOL: list[list[str]] = [["LUWAS"], ["TABANG"], ["TUBIG", "PAGKAON"], ["TAMBAL"]]
EARTHQUAKE_STEPS = 6
EARTHQUAKE_STEP_SECONDS = 3

_current_earthquake_task: asyncio.Task | None = None  # keeps a strong reference so asyncio doesn't GC it mid-run


def _next_seq_num(db: Session, device_id: str) -> int:
    return (db.query(func.max(Event.seq_num)).filter(Event.device_id == device_id).scalar() or 0) + 1


async def _run_earthquake_sequence() -> None:
    for _ in range(EARTHQUAKE_STEPS):
        await asyncio.sleep(EARTHQUAKE_STEP_SECONDS)
        with SessionLocal() as db:
            silent = db.query(Purok).filter(Purok.is_simulated.is_(True), Purok.status == "unknown").all()
            if not silent:
                return  # everyone's already reported — sequence naturally ends early

            purok = random.choice(silent)
            # A TUBIG+PAGKAON pair becomes two separate single-button events, not one
            # COMBO — COMBO means one simultaneous physical press in the real gesture
            # model, and using it here would misrepresent what "happened."
            for need in random.choice(NEED_POOL):
                seq = _next_seq_num(db, purok.device_id)
                insert_event_idempotent(db, purok.device_id, seq, need, None, "single", None, purok.id, is_simulated=True)

            escalations = recompute_and_detect_escalations(db, purok)
            escalations += detect_new_clusters(db)
            for escalation in escalations:
                await deliver_webhook(db, escalation)


@router.post("/admin/simulate-earthquake")
async def simulate_earthquake(db: Session = Depends(get_db)):
    """Blacks out the simulated puroks (clears their events so they go genuinely
    silent/unknown, not a fabricated flag), then over ~18s drip-feeds real synthetic
    presses into random ones. The initial blackout uses plain recompute_purok, not the
    escalation-detecting wrapper — a demo reset dropping severity isn't a genuine
    de-escalation worth recording in the real escalation log."""
    global _current_earthquake_task

    simulated_puroks = db.query(Purok).filter(Purok.is_simulated.is_(True)).all()
    simulated_ids = [p.id for p in simulated_puroks]
    if simulated_ids:
        db.query(Event).filter(Event.purok_id.in_(simulated_ids)).delete(synchronize_session=False)
        db.commit()
        for purok in simulated_puroks:
            recompute_purok(db, purok)

    _current_earthquake_task = asyncio.create_task(_run_earthquake_sequence())
    return {"status": "started", "duration_seconds": EARTHQUAKE_STEPS * EARTHQUAKE_STEP_SECONDS}
