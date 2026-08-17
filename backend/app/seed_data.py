from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app import config
from app.crud import insert_event_idempotent
from app.escalation import detect_new_clusters, recompute_and_detect_escalations
from app.models import Event, Purok
from app.timeutil import utcnow

# Barangay is confirmed (config.BARANGAY_NAME = "Lambusan", real centroid coordinates).
# STILL PLACEHOLDER: the offsets below are arbitrary small displacements, not real
# purok-level placements — all puroks are numbered subdivisions within Lambusan
# (config.BARANGAY_NAME), not named after other barangays. Replace these offsets with
# real placements from the teammate who lived through the San Remigio earthquake before
# the actual demo.
#
# Verified against real OSM coastline geometry (Overpass API, 2026-08-17), twice: a first
# pass fixed two offsets (Purok 1, Purok 4) that landed in the water, but didn't check
# whether the fix pushed them too close to a neighboring purok — it had (Purok 4 ended up
# ~270m from Purok 6). This pass checked both constraints together: every point below is
# confirmed on land (150m+ from the real coastline) AND at least ~290m from every other
# purok, computed against the actual coastline geometry, not eyeballed.
#
# device_id uses the same "DEV-###" convention as the real hardware (DEV-089) — a
# plain "101" vs "DEV-089" was itself a tell that one was simulated, even with no badge
# and no marker-shape difference left. These are still arbitrary placeholder strings
# (seed data has always assigned them), just restyled to match the real convention.
#
# purok_leader: reasonable placeholder names (Sphere-style mock data, not any real
# identifiable person) — an empty/"(TBD)" field read as broken rather than as a
# deliberate placeholder, so populate it the same way baseline_vulnerable_count already
# gets a plausible non-zero mock value below.
#
# Purok 3 was originally also "cluster" (a 3-purok pre-seeded cluster), but the
# finalized pitch script (pitch/SCRIPT.md, Stage 6) narrates only Purok 1 and 2 as
# already reporting TUBIG, with the live demo press making it a 3rd — a real 3-vs-4
# mismatch caught during hardware rehearsal, 2026-08-17. Purok 3 now gets its own
# "ordinary_food" scenario (PAGKAON, not TUBIG) instead of "ordinary" (which Purok 6
# already uses) — a different need type entirely, not just a different timestamp, so it
# can't be mistaken for a 4th out-of-window TUBIG report that just doesn't count.
#
# (device_id, name, leader_name, lat_offset, lng_offset, scenario)
SIMULATED_PUROKS = [
    ("DEV-101", "Purok 1", "Elena Ramos", +0.0038, +0.0034, "cluster"),
    ("DEV-102", "Purok 2", "Ramon Bautista", +0.005, +0.001, "cluster"),
    ("DEV-103", "Purok 3", "Marites Aguilar", -0.002, +0.004, "ordinary_food"),
    ("DEV-104", "Purok 4", "Ernesto Villanueva", -0.009, +0.0034, "unaccounted"),
    ("DEV-105", "Purok 5", "Corazon Mendoza", +0.001, +0.001, "stable"),
    ("DEV-106", "Purok 6", "Danilo Cruz", -0.005, +0.002, "ordinary"),
]


def _make_purok(index: int, device_id: str, name: str, leader_name: str, lat_offset: float, lng_offset: float) -> Purok:
    return Purok(
        device_id=device_id,
        name=name,
        barangay=config.BARANGAY_NAME,
        purok_leader=leader_name,
        latitude=config.BARANGAY_CENTER_LAT + lat_offset,
        longitude=config.BARANGAY_CENTER_LNG + lng_offset,
        is_simulated=True,
        # Varies the mock baseline count across simulated puroks — uses the list index,
        # not device_id (now a string, no longer usable in a modulo), purely to keep the
        # mock values non-uniform.
        baseline_vulnerable_count=min(3, max(0, index % 4)),
        active_needs=[],
        distinct_buttons_15min=0,
        status="unknown",
        severity="low",
        severity_reasons=[],
    )


def _seed_events_for_scenario(db: Session, purok: Purok, scenario: str, now: datetime) -> None:
    # All timestamps computed relative to `now` (execution time), not hardcoded
    # absolutes — this is what actually makes "safe to re-run" true. A hardcoded
    # absolute timestamp would silently go stale the second time seeding runs.
    seq = 1
    if scenario == "cluster":
        # Staggered offset per purok so the pre-seeded cluster puroks (Purok 1, 2) land
        # at different points within the 45-minute window, not simultaneously. Uses
        # purok.id (the real, always-numeric primary key) rather than device_id, which
        # is a string now.
        offset_minutes = 10 + (purok.id % 3) * 7
        insert_event_idempotent(
            db, purok.device_id, seq, "TUBIG", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(minutes=offset_minutes),
        )
    elif scenario == "unaccounted":
        insert_event_idempotent(
            db, purok.device_id, seq, "TABANG", None, "hold", None, purok.id,
            is_simulated=True, received_at=now - timedelta(hours=14),
        )
    elif scenario == "stable":
        insert_event_idempotent(
            db, purok.device_id, seq, "LUWAS", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(minutes=20),
        )
    elif scenario == "ordinary":
        insert_event_idempotent(
            db, purok.device_id, seq, "TUBIG", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(hours=2),
        )
    elif scenario == "ordinary_food":
        # Deliberately NOT the same timestamp as "ordinary" (Purok 6, also ~2h ago) —
        # that coincidence put both inside the same 45-minute cluster window and
        # produced a spurious "mixed" cluster neither the seed design nor the script
        # intended, caught during hardware rehearsal, 2026-08-17.
        insert_event_idempotent(
            db, purok.device_id, seq, "PAGKAON", None, "single", None, purok.id,
            is_simulated=True, received_at=now - timedelta(hours=3),
        )


def run_seed(db: Session) -> list[Purok]:
    """Clears existing simulated puroks/events and reinserts — safe to call repeatedly
    during dev without producing duplicate junk."""
    simulated_purok_ids = [p.id for p in db.query(Purok).filter(Purok.is_simulated.is_(True)).all()]
    if simulated_purok_ids:
        db.query(Event).filter(Event.purok_id.in_(simulated_purok_ids)).delete(synchronize_session=False)
        db.query(Purok).filter(Purok.id.in_(simulated_purok_ids)).delete(synchronize_session=False)
        db.commit()

    now = utcnow()
    created = []
    for index, (device_id, name, leader_name, lat_offset, lng_offset, scenario) in enumerate(SIMULATED_PUROKS):
        purok = _make_purok(index, device_id, name, leader_name, lat_offset, lng_offset)
        db.add(purok)
        db.commit()
        db.refresh(purok)

        _seed_events_for_scenario(db, purok, scenario, now)
        created.append(purok)

    # Recompute AFTER every purok/event exists, not per-purok-as-created — otherwise
    # earlier puroks' neighboring_silent (and any other cross-purok signal) reflects an
    # incomplete sibling set from mid-seeding, not the final state. Would self-correct
    # within one severity-sweep interval regardless, but no reason to show a
    # momentarily-wrong reason right after seeding when a second pass is this cheap.
    #
    # Uses the escalation-aware recompute (not the plain one) so the seeded
    # "unaccounted" scenario produces a real, checkable escalation record immediately —
    # deliberately skips webhook delivery here though: seeding is demo SETUP, not a
    # live event, and pushing a real notification for synthetic data would be
    # confusing/noisy for anyone actually watching the webhook channel.
    for purok in created:
        recompute_and_detect_escalations(db, purok)
    detect_new_clusters(db)

    return created
