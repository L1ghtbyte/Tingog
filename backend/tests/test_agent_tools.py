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


def test_tool_schemas_are_valid_openai_function_shape():
    for entry in TOOL_SCHEMAS:
        assert entry["type"] == "function"
        assert "name" in entry["function"]
        assert "parameters" in entry["function"]
