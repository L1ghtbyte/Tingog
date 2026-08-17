"""
Reliability check for the Briefing Agent — runs the exact real pipeline
(run_briefing_stream, the same function the live "Ask" button uses) N times in a row and
streams a pass/fail verdict for each run to the browser, live, as it happens.

Exists because "trust me, I ran it 5 times and it passed most of the time" is not
something a demo-day stakeholder should have to take on faith — this makes the same test
observable directly in the running app, not just reported secondhand. persist=False is
passed through so these test runs never touch the dashboard's real "last briefing" state
or conversation history (see run_briefing_stream's docstring in briefing_agent.py).
"""

import json
import time

from fastapi import APIRouter, Query
from sqlalchemy.orm import Session
from starlette.responses import StreamingResponse

from app.agent.briefing_agent import run_briefing_stream
from app.database import SessionLocal

router = APIRouter(prefix="/api", tags=["diagnostics"])

MAX_RUNS = 10


async def _run_once(question: str | None) -> dict:
    db: Session = SessionLocal()
    started = time.monotonic()
    mode = "unknown"
    check_failed_count = 0
    error_message: str | None = None
    try:
        async for event in run_briefing_stream(db, question=question, conversation_id=None, persist=False):
            if event["type"] == "check_failed":
                check_failed_count += 1
            elif event["type"] == "error":
                error_message = event["message"]
            elif event["type"] == "final":
                mode = event["mode"]
            elif event["type"] == "clarifying":
                mode = "clarifying"
    except Exception as exc:  # noqa: BLE001 — a crash here IS a result worth reporting, not a 500.
        mode = "crashed"
        error_message = str(exc)
    finally:
        db.close()
    return {
        "mode": mode,
        "elapsed_seconds": round(time.monotonic() - started, 1),
        "check_failed_count": check_failed_count,
        "error": error_message,
    }


async def _reliability_stream(runs: int, question: str | None):
    results = []
    for i in range(1, runs + 1):
        yield f"data: {json.dumps({'type': 'run_start', 'run': i, 'total': runs})}\n\n"
        result = await _run_once(question)
        results.append(result)
        yield f"data: {json.dumps({'type': 'run_result', 'run': i, 'total': runs, **result})}\n\n"

    briefed = sum(1 for r in results if r["mode"] == "briefed")
    raw = sum(1 for r in results if r["mode"] == "raw")
    other = len(results) - briefed - raw
    avg_seconds = round(sum(r["elapsed_seconds"] for r in results) / len(results), 1) if results else 0
    yield (
        "data: "
        + json.dumps(
            {
                "type": "summary", "total": len(results), "briefed": briefed,
                "raw": raw, "other": other, "avg_seconds": avg_seconds,
            }
        )
        + "\n\n"
    )


@router.get("/diagnostics/briefing-reliability")
async def briefing_reliability(
    runs: int = Query(default=5, ge=1, le=MAX_RUNS),
    question: str | None = Query(default=None),
):
    """Streams run_start/run_result events for each of `runs` sequential, real calls to
    the live agent pipeline (question=None matches the general demo briefing), then a
    final summary event. Sequential, not parallel — this must reflect the same
    one-coordinator-at-a-time latency the live demo will actually experience, not an
    artificially fast concurrent burst."""
    return StreamingResponse(
        _reliability_stream(runs, question),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
