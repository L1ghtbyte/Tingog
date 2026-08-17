"""
The Briefing Agent's tools — the original 6 from 04_agent_tools_spec.md plus
get_previous_briefing (memory). There is no mutating tool here — structurally, not just
by prompt instruction (CLAUDE.md hard constraint #1: no ranking or dispatch of aid).

Each function is paired with a schema dict (name/description/parameters) in TOOL_SCHEMAS,
wrapped as OpenAI's function-calling shape ({"type": "function", "function": {...}}) so
they can be passed directly as the `tools` param on a chat completion request. Real
multi-turn tool-calling — the model decides which tools it needs and calls them itself,
via TOOL_FUNCTIONS below, rather than being handed everything pre-fetched.
"""

import logging
from datetime import timedelta

from sqlalchemy.orm import Session

from app import config
from app.crud import get_latest_briefing_record, get_purok_by_id, get_purok_events, list_purok_deliveries
from app.inference import (
    compute_neighboring_silent,
    compute_severity,
    count_distinct_buttons,
    get_hours_since_last_event,
    get_last_press_info,
)
from app.models import Event, Purok
from app.clustering import get_active_clusters as _get_active_clusters
from app.anomaly import get_anomalies as _get_anomalies
from app.timeutil import utcnow

logger = logging.getLogger("tanaw.agent_tools")

NEED_TYPES = ["TABANG", "TUBIG", "TAMBAL", "PAGKAON"]


def get_unaccounted_puroks(db: Session) -> list[dict]:
    """Puroks that HAVE had contact before but have gone quiet beyond the silence
    threshold. Puroks that have never made contact at all are surfaced via
    GET /api/puroks (status=unknown) rather than this tool, which is framed around
    "used to hear from them, now don't" — a scoping choice, not a spec-literal split."""
    results = []
    for purok in db.query(Purok).all():
        hours = get_hours_since_last_event(db, purok)
        if hours is None or hours <= config.SILENCE_HOURS_WARN:
            continue
        neighboring_silent = compute_neighboring_silent(db, purok)
        last_press_type, last_press_buttons, _ = get_last_press_info(db, purok)
        distinct = count_distinct_buttons(db, purok, config.PANIC_PRESS_WINDOW_MINUTES)
        score, _severity, reasons = compute_severity(
            hours, neighboring_silent, last_press_type, last_press_buttons, distinct
        )
        results.append(
            {
                "purok_id": purok.id,
                "purok_name": purok.name,
                "hours_since_contact": round(hours, 1),
                "silence_score": score,
                "reason": reasons[0] if reasons else "no contact in over 6h",
            }
        )
    return results


def get_active_clusters(db: Session) -> list[dict]:
    return _get_active_clusters(db)


def get_high_severity(db: Session) -> list[dict]:
    return [
        {"purok_id": p.id, "purok_name": p.name, "severity": p.severity, "reasons": p.severity_reasons}
        for p in db.query(Purok).filter(Purok.severity == "high").all()
    ]


def get_anomalies(db: Session) -> list[dict]:
    return _get_anomalies(db)


def get_recent_activity(db: Session, minutes: int) -> dict:
    # Found live 2026-08-17: a model call arrived with minutes="30" (a JSON string, not
    # a number) — timedelta() raises TypeError on a str, crashing the whole stream
    # instead of degrading gracefully. Coerced here since this is the one call site
    # that actually needs a real numeric type; call_tool's try/except (below) is the
    # general safety net for anything this doesn't catch.
    minutes = float(minutes)
    since = utcnow() - timedelta(minutes=minutes)
    events = db.query(Event).filter(Event.received_at >= since).all()

    by_need_type = {need: 0 for need in NEED_TYPES}
    puroks_reporting: set[int] = set()
    for event in events:
        puroks_reporting.add(event.purok_id)
        buttons = event.combo_buttons if event.button == "COMBO" else [event.button]
        for button in buttons or []:
            if button in by_need_type:
                by_need_type[button] += 1

    return {
        "total_events": len(events),
        "by_need_type": by_need_type,
        "puroks_reporting": len(puroks_reporting),
    }


def get_purok(db: Session, purok_id: int) -> dict | None:
    purok = get_purok_by_id(db, purok_id)
    if purok is None:
        return None
    events = get_purok_events(db, purok_id)
    deliveries = list_purok_deliveries(db, purok_id)
    return {
        "purok_id": purok.id,
        "purok_name": purok.name,
        "status": purok.status,
        "severity": purok.severity,
        "event_history": [
            {
                "button": e.button,
                "press_type": e.press_type,
                "received_at": e.received_at.isoformat() + "Z",
            }
            for e in events
        ],
        # Read-only, same as everything else the agent sees — it can cite a delivery
        # already logged, it can never log one itself (that's a coordinator-only write,
        # POST /api/puroks/{id}/deliveries, not a tool).
        "deliveries": [
            {
                "items": d.items,
                "delivered_by": d.delivered_by,
                "note": d.note,
                "delivered_at": d.delivered_at.isoformat() + "Z",
            }
            for d in deliveries
        ],
    }


def get_previous_briefing(db: Session) -> dict:
    """Memory — lets the agent say "compared to last time" instead of re-describing the
    full current state fresh on every call. Addresses a real, named failure mode in
    disaster-response systems generally: institutional memory eroding between checks,
    not just a generic 'add memory' feature."""
    record = get_latest_briefing_record(db)
    if record is None:
        return {"has_previous": False}
    return {
        "has_previous": True,
        "narrative": record.narrative,
        "created_at": record.created_at.isoformat() + "Z",
    }


_RAW_SCHEMAS = {
    "get_unaccounted_puroks": {
        "name": "get_unaccounted_puroks",
        "description": "Puroks that have gone quiet beyond the silence threshold after prior contact.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "get_active_clusters": {
        "name": "get_active_clusters",
        "description": "Groups of puroks reporting the same (or mixed) need near-simultaneously.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "get_high_severity": {
        "name": "get_high_severity",
        "description": "Puroks currently scored as high severity, with their reasons.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "get_anomalies": {
        "name": "get_anomalies",
        "description": "Puroks flagged for unusually frequent presses (crude placeholder rule).",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    "get_recent_activity": {
        "name": "get_recent_activity",
        "description": "Aggregate event counts over the trailing N minutes.",
        "parameters": {
            "type": "object",
            "properties": {"minutes": {"type": "integer", "description": "How far back to look, in minutes."}},
            "required": ["minutes"],
        },
    },
    "get_purok": {
        "name": "get_purok",
        "description": "Full detail for one specific purok, including its event history. Call this "
        "to drill into a purok already surfaced by another tool (e.g. one named in "
        "get_high_severity or get_unaccounted_puroks) — not for every purok in bulk.",
        "parameters": {
            "type": "object",
            "properties": {"purok_id": {"type": "integer", "description": "The purok's id, from another tool's result."}},
            "required": ["purok_id"],
        },
    },
    "get_previous_briefing": {
        "name": "get_previous_briefing",
        "description": "The narrative from the last successfully delivered briefing, if any — "
        "use this to say what's changed since then instead of restating everything fresh.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
}

# OpenAI function-calling shape, ready to pass as the `tools` param on a chat completion.
TOOL_SCHEMAS = [{"type": "function", "function": schema} for schema in _RAW_SCHEMAS.values()]

# Dispatch table: tool name -> (db, args_dict) -> result. `args` comes from parsing the
# model's tool_call.function.arguments JSON string — untrusted shape, so callers use
# .get() with defaults rather than assuming required keys are always present.
TOOL_FUNCTIONS = {
    "get_unaccounted_puroks": lambda db, args: get_unaccounted_puroks(db),
    "get_active_clusters": lambda db, args: get_active_clusters(db),
    "get_high_severity": lambda db, args: get_high_severity(db),
    "get_anomalies": lambda db, args: get_anomalies(db),
    "get_recent_activity": lambda db, args: get_recent_activity(db, minutes=args.get("minutes", 60)),
    "get_purok": lambda db, args: get_purok(db, args.get("purok_id")),
    "get_previous_briefing": lambda db, args: get_previous_briefing(db),
}


def call_tool(db: Session, name: str, args: dict) -> object:
    """Executes one model-requested tool call. Returns a JSON-serializable result, or an
    {"error": ...} dict for an unknown tool name OR a malformed argument (e.g. a number
    passed as a quoted string that a specific tool didn't happen to coerce) — fed back
    to the model as the tool result either way, so it's self-correcting within the loop
    rather than crashing the whole stream. Found live 2026-08-17: a bad argument value
    reached an unguarded timedelta() call and took down the entire request — this is the
    general safety net for that whole class of failure, not just the one instance fixed
    directly in get_recent_activity."""
    fn = TOOL_FUNCTIONS.get(name)
    if fn is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return fn(db, args or {})
    except Exception as exc:  # noqa: BLE001 — deliberately broad: any tool-argument
        # shape mismatch should degrade to a model-visible error, never crash the stream.
        logger.warning("Tool call failed: name=%s args=%s error=%s", name, args, exc)
        return {"error": f"{name} call failed: {exc}"}
