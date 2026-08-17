import asyncio
import json
from unittest.mock import AsyncMock

from app.agent import briefing_agent
from app.agent.prompts import DEFAULT_GENERAL_BRIEFING_TEXT


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


def test_reconstruct_conversation_turns_replays_real_exchange_across_a_retry():
    # A retry's correction is a SECOND consecutive "user" message injected by
    # build_retry_messages (prompts.py) — it must not overwrite the real question that
    # preceded it, and must not itself surface as if a coordinator typed it. Also covers
    # the real tool_call/tool_result trace: the raw messages already carry it (that's
    # the agent's own memory), so a replayed turn must show the same steps a live view
    # would have shown — not just the final narrative.
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "What about Purok 4?"},
        {"role": "user", "content": "IMPORTANT — your previous attempt had a claim that didn't match..."},
        {"role": "assistant", "content": None, "tool_calls": [{"id": "1", "function": {"name": "get_purok", "arguments": '{"purok_id": 4}'}}]},
        {"role": "tool", "tool_call_id": "1", "content": json.dumps({"status": "unknown"})},
        {"role": "assistant", "content": json.dumps({"claims": [], "narrative": "Purok 4 is stable."})},
        {"role": "user", "content": "And Purok 5?"},
        {"role": "assistant", "content": json.dumps({"clarifying_question": "Do you mean TUBIG or TAMBAL for Purok 5?"})},
    ]

    turns = briefing_agent.reconstruct_conversation_turns(messages)

    assert turns == [
        {
            "question": "What about Purok 4?", "mode": "briefed", "narrative": "Purok 4 is stable.", "claims": [],
            "assessment": None, "clarifying_question": None,
            "steps": [
                {"type": "tool_call", "tool": "get_purok", "args": {"purok_id": 4}},
                {"type": "tool_result", "tool": "get_purok", "result": {"status": "unknown"}},
            ],
        },
        {
            "question": "And Purok 5?", "mode": "clarifying", "narrative": None, "claims": None,
            "clarifying_question": "Do you mean TUBIG or TAMBAL for Purok 5?", "steps": [],
        },
    ]


def test_reconstruct_conversation_turns_maps_default_general_text_to_null_question():
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": DEFAULT_GENERAL_BRIEFING_TEXT},
        {"role": "assistant", "content": json.dumps({"claims": [], "narrative": "All quiet."})},
    ]

    turns = briefing_agent.reconstruct_conversation_turns(messages)

    assert turns == [
        {"question": None, "mode": "briefed", "narrative": "All quiet.", "claims": [], "assessment": None, "clarifying_question": None, "steps": []}
    ]
