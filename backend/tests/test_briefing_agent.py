import asyncio
from unittest.mock import AsyncMock

from app.agent import briefing_agent


def test_provider_extra_fields_are_stripped_before_reentering_history(db, monkeypatch):
    # Regression test: found live 2026-08-17 — a reasoning-capable provider (NVIDIA's
    # nemotron) returns extra fields (e.g. "reasoning_content") alongside the standard
    # role/content/tool_calls shape. call_llm_with_fallback restarts from the TOP of the
    # provider chain on every loop iteration, so appending that raw message verbatim
    # poisoned the shared conversation history for later calls to a different, stricter
    # provider (Groq 400 "'messages.N': property 'reasoning_content' is unsupported"),
    # turning one reasoning-model turn into a whole-session failure.
    first_turn = {
        "role": "assistant",
        "content": None,
        "reasoning_content": "some internal reasoning the model included",
        "tool_calls": [
            {"id": "call_1", "function": {"name": "get_previous_briefing", "arguments": "{}"}}
        ],
    }
    second_turn = {"role": "assistant", "content": '{"claims": [], "narrative": "done"}'}

    mock_llm = AsyncMock(side_effect=[first_turn, second_turn])
    monkeypatch.setattr(briefing_agent, "call_llm_with_fallback", mock_llm)

    async def drain():
        events = []
        async for event in briefing_agent._run_tool_calling_session_stream(
            db, [{"role": "system", "content": "sys"}, {"role": "user", "content": "hi"}]
        ):
            events.append(event)
        return events

    events = asyncio.run(drain())
    done_event = next(e for e in events if e["type"] == "done")

    assistant_messages = [m for m in done_event["messages"] if m.get("role") == "assistant"]
    assert len(assistant_messages) == 2
    for message in assistant_messages:
        assert "reasoning_content" not in message
        assert set(message.keys()) <= {"role", "content", "tool_calls"}
