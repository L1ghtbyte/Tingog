from app.agent.tools import TOOL_SCHEMAS, call_tool
from app.crud import get_or_create_real_purok


def test_call_tool_unknown_name_returns_error_not_raise(db):
    result = call_tool(db, "get_nonexistent_tool", {})
    assert result == {"error": "unknown tool: get_nonexistent_tool"}


def test_call_tool_dispatches_no_arg_tool(db):
    get_or_create_real_purok(db, device_id="1")
    result = call_tool(db, "get_high_severity", {})
    assert result == []  # no high-severity puroks yet, but a real call, not an error


def test_call_tool_dispatches_get_purok_with_args(db):
    purok = get_or_create_real_purok(db, device_id="1")
    result = call_tool(db, "get_purok", {"purok_id": purok.id})
    assert result["purok_id"] == purok.id


def test_recent_activity_coerces_string_minutes_argument(db):
    # Regression test: found live 2026-08-17 — a real model tool call arrived with
    # minutes="30" (a JSON string, not a number). timedelta() raises TypeError on a
    # str, which crashed the entire SSE stream instead of degrading gracefully.
    result = call_tool(db, "get_recent_activity", {"minutes": "30"})
    assert "error" not in result
    assert result["total_events"] == 0


def test_call_tool_catches_unexpected_exception_instead_of_crashing(db):
    # The general safety net: even an argument shape no specific tool happens to guard
    # against should degrade to a model-visible {"error": ...}, not propagate up and
    # take down the whole request — same resilience already guaranteed for a
    # hallucinated tool NAME, now also guaranteed for a malformed argument VALUE.
    result = call_tool(db, "get_recent_activity", {"minutes": "not-a-number"})
    assert "error" in result
    assert "get_recent_activity" in result["error"]


def test_tool_schemas_are_valid_openai_function_shape():
    for entry in TOOL_SCHEMAS:
        assert entry["type"] == "function"
        assert "name" in entry["function"]
        assert "parameters" in entry["function"]
