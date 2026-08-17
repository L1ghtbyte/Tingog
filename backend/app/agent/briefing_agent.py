"""
The Briefing Agent: a real, bounded, multi-turn tool-calling (ReAct-style) session — the
model decides which tools it needs, calls them itself, reads results, and either calls
more tools, asks a clarifying question, or produces a final answer. Figure Checker
validates the final claims+narrative output against the real tool data gathered before
delivery — deterministic, never a second LLM call (CLAUDE.md hard constraint #2). On
failure, retry once as a fresh bounded session with the specific correction folded in;
on a second failure, deliver the real gathered data with no fabricated narrative.

Three ways this runs, matching disaster-response coordination's actual working modes:
  - on-demand   -- a coordinator asks (GET /api/briefing, optionally ?question=...,
                   optionally continuing a prior ?conversation_id= for a follow-up)
  - scheduled   -- scheduled_briefing_loop() below, a periodic re-check independent of
                   anyone asking (shift-handoff cadence) — catches slow-accumulating
                   patterns that never cross a single hard threshold, and removes the
                   burden of remembering to check
  - event-triggered -- app/escalation.py, fired the instant the DETERMINISTIC engine
                   (not this agent) detects a purok crossing a watched threshold
"""

import asyncio
import json
import logging
import secrets
from collections.abc import AsyncIterator

from sqlalchemy.orm import Session

from app import config
from app.agent import tools as agent_tools
from app.agent.figure_checker import CheckResult, check
from app.agent.llm_client import AllModelsFailedError, call_llm_with_fallback
from app.agent.prompts import (
    DEFAULT_CONTINUATION_TEXT,
    DEFAULT_GENERAL_BRIEFING_TEXT,
    RETRY_CORRECTION_PREFIX,
    build_continued_messages,
    build_initial_messages,
    build_retry_messages,
    parse_final_answer,
)
from app.crud import get_conversation, save_briefing_record, save_conversation
from app.database import SessionLocal
from app.models import Purok
from app.schemas import BriefingResponse

logger = logging.getLogger("tanaw.briefing_agent")

MAX_TOOL_ITERATIONS = 6


def _new_conversation_id() -> str:
    return secrets.token_urlsafe(8)


def _record_tool_result(tool_results: dict, name: str, args: dict, result: object) -> None:
    if name == "get_purok":
        # Accumulate across multiple calls (the model may drill into several puroks in
        # one session) rather than overwrite — string-keyed, since json.dumps silently
        # stringifies int dict keys before the model ever sees them.
        tool_results.setdefault("get_purok", {})[str(args.get("purok_id"))] = result
    else:
        tool_results[name] = result


def _record_tool_arg_numbers(tool_arg_numbers: set[float], args: dict) -> None:
    # A number the model itself chose as a tool argument (e.g. minutes=30 for "how far
    # back to look") isn't a fact from the data — it can't appear in any tool RESULT,
    # only in the call — but it's still a real, known-legitimate number the narrative
    # should be allowed to mention (e.g. "in the last 30 minutes") without that being
    # treated as an unbacked hallucination. Found live 2026-08-17: this was previously
    # rejected every time, since Figure Checker only ever looked at tool results.
    for v in args.values():
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            tool_arg_numbers.add(float(v))


async def _run_tool_calling_session_stream(db: Session, messages: list[dict]) -> AsyncIterator[dict]:
    """Same bounded ReAct loop as before, but yields a step event after every tool call
    and every tool result instead of only returning at the end — this is what lets the
    streaming endpoint show the agent's actual process as it happens, rather than a
    lossy after-the-fact summary. Always ends with a "type": "done" event carrying
    exactly what this function used to return as a tuple, so the non-streaming wrapper
    below can stay a trivial drain."""
    tool_results: dict = {}
    tool_arg_numbers: set[float] = set()
    for _ in range(MAX_TOOL_ITERATIONS):
        raw_message = await call_llm_with_fallback(messages, tools=agent_tools.TOOL_SCHEMAS)
        # Found live 2026-08-17: a reasoning-capable provider (NVIDIA's nemotron) returns
        # extra fields (e.g. "reasoning_content") alongside the standard OpenAI shape.
        # call_llm_with_fallback retries from the TOP of the provider chain on every loop
        # iteration, not just the one that succeeded last — so appending that raw message
        # verbatim poisons the conversation history for every later call, including ones
        # routed to a different, stricter provider. Confirmed live: Groq then rejects the
        # entire request with 400 "'messages.N': property 'reasoning_content' is
        # unsupported", turning one reasoning-model turn into an all-providers-failed
        # session. Keeping only the fields every provider's API actually expects fixes it
        # at the one place this dict re-enters shared history, not per-provider.
        message = {k: v for k, v in raw_message.items() if k in ("role", "content", "tool_calls")}
        messages.append(message)

        tool_calls = message.get("tool_calls")
        if not tool_calls:
            yield {
                "type": "done", "llm_output": parse_final_answer(message.get("content")),
                "tool_results": tool_results, "messages": messages, "tool_arg_numbers": tool_arg_numbers,
            }
            return

        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "")
            try:
                args = json.loads(tc.get("function", {}).get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            # A provider can legally return the literal JSON string "null" for a
            # no-parameter call — json.loads("null") is Python None, not {}. Guarding
            # here (not just in _record_tool_arg_numbers) protects every downstream
            # consumer of `args` (call_tool, _record_tool_result) with one fix, not one
            # per call site. Found live 2026-08-17 as a real crash, not a hypothetical.
            if not isinstance(args, dict):
                args = {}
            _record_tool_arg_numbers(tool_arg_numbers, args)
            yield {"type": "tool_call", "tool": name, "args": args}
            result = agent_tools.call_tool(db, name, args)
            _record_tool_result(tool_results, name, args, result)
            messages.append(
                {"role": "tool", "tool_call_id": tc.get("id", name), "content": json.dumps(result, default=str)}
            )
            yield {"type": "tool_result", "tool": name, "result": result}

    logger.warning("Tool-calling session hit MAX_TOOL_ITERATIONS=%d without a final answer", MAX_TOOL_ITERATIONS)
    yield {
        "type": "done", "llm_output": {"claims": [], "narrative": ""},
        "tool_results": tool_results, "messages": messages, "tool_arg_numbers": tool_arg_numbers,
    }


async def _run_tool_calling_session(db: Session, messages: list[dict]) -> tuple[dict, dict, list[dict], set[float]]:
    """Non-streaming wrapper over _run_tool_calling_session_stream — kept so run_briefing()
    (used by the scheduled loop and the blocking /api/briefing endpoint) is completely
    unaffected by the streaming path existing underneath it. Drains the generator and
    returns its final "done" event as the same (parsed answer, tool_results, messages,
    tool_arg_numbers) tuple this always returned."""
    async for event in _run_tool_calling_session_stream(db, messages):
        if event["type"] == "done":
            return event["llm_output"], event["tool_results"], event["messages"], event["tool_arg_numbers"]
    raise AssertionError("_run_tool_calling_session_stream ended without a 'done' event")


def _log_check_failure(stage: str, llm_output: dict, result: CheckResult) -> None:
    logger.warning(
        "Figure Checker rejected %s attempt: reason=%s failed_claim=%s actual_value=%s narrative=%r claims=%r",
        stage,
        result.failure_reason,
        result.failed_claim,
        result.actual_value,
        (llm_output.get("narrative") or "")[:300],
        llm_output.get("claims"),
    )


async def _full_raw_dump(db: Session) -> dict:
    """Deterministic, complete data gather — used only when the tool-calling session
    fails entirely (no LLM provider reachable at all). Guarantees the dashboard always
    has something full and real to show."""
    tool_results: dict = {
        "get_unaccounted_puroks": agent_tools.get_unaccounted_puroks(db),
        "get_active_clusters": agent_tools.get_active_clusters(db),
        "get_high_severity": agent_tools.get_high_severity(db),
        "get_anomalies": agent_tools.get_anomalies(db),
        "get_recent_activity": agent_tools.get_recent_activity(db, minutes=60),
        "get_previous_briefing": agent_tools.get_previous_briefing(db),
    }
    tool_results["get_purok"] = {str(p.id): agent_tools.get_purok(db, p.id) for p in db.query(Purok).all()}
    return tool_results


def reconstruct_conversation_turns(messages: list[dict]) -> list[dict]:
    """Replays a saved ConversationRecord's raw OpenAI-format message list into the same
    turn shape the dashboard renders live, INCLUDING each turn's real tool_call/
    tool_result trace — the raw messages already carry this (it's how the agent's own
    memory works), so a past reload can show the real process, not just the final
    narrative. A coordinator's whole back-and-forth is real, persisted data
    (save_conversation), not something that only exists in one browser tab's memory
    until it's refreshed away. Used by GET /api/briefing/conversation/last.

    Synthetic user turns (the default general-briefing/continuation text, and a retry's
    correction message) are recognized and excluded — a coordinator never typed those
    themselves. Note: if a turn needed a retry to pass the Figure Checker, only the
    attempt that actually succeeded is saved at all (build_retry_messages starts a fresh
    session, not a continuation) — so a replayed trace shows the tool calls behind the
    delivered answer, not an invisible failed first attempt, which matches what was ever
    actually persisted."""
    turns: list[dict] = []
    pending_question: str | None = None
    current_steps: list[dict] = []
    tool_call_names: dict[str, str] = {}

    for message in messages:
        role = message.get("role")
        if role == "user":
            content = (message.get("content") or "").strip()
            if content.startswith(RETRY_CORRECTION_PREFIX):
                continue
            pending_question = None if content in (DEFAULT_GENERAL_BRIEFING_TEXT, DEFAULT_CONTINUATION_TEXT) else content
        elif role == "assistant":
            tool_calls = message.get("tool_calls")
            if tool_calls:
                for tc in tool_calls:
                    name = tc.get("function", {}).get("name", "")
                    tc_id = tc.get("id", name)
                    try:
                        args = json.loads(tc.get("function", {}).get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    if not isinstance(args, dict):
                        args = {}
                    tool_call_names[tc_id] = name
                    current_steps.append({"type": "tool_call", "tool": name, "args": args})
            else:
                parsed = parse_final_answer(message.get("content"))
                if "clarifying_question" in parsed:
                    turns.append({
                        "question": pending_question, "mode": "clarifying", "steps": current_steps,
                        "narrative": None, "claims": None, "clarifying_question": parsed["clarifying_question"],
                    })
                else:
                    turns.append({
                        "question": pending_question, "mode": "briefed", "steps": current_steps,
                        "narrative": parsed.get("narrative"), "claims": parsed.get("claims"),
                        "assessment": parsed.get("assessment"), "clarifying_question": None,
                    })
                pending_question = None
                current_steps = []
        elif role == "tool":
            tc_id = message.get("tool_call_id", "")
            try:
                result = json.loads(message.get("content") or "null")
            except json.JSONDecodeError:
                result = message.get("content")
            current_steps.append({"type": "tool_result", "tool": tool_call_names.get(tc_id, ""), "result": result})
    return turns


async def run_briefing(
    db: Session,
    question: str | None = None,
    conversation_id: str | None = None,
    trigger_source: str = "coordinator_query",
) -> BriefingResponse:
    """question=None generates a general briefing; a real coordinator question routes
    the same tool-calling session toward answering it specifically. Passing back a
    conversation_id from a prior response continues that thread (the agent sees the
    earlier exchange); omitting it starts fresh. A conversation_id is always returned so
    a caller can opt into continuity later even if it didn't ask for it up front.
    trigger_source records which of the three real invocation modes produced this
    result — always "coordinator_query" except scheduled_briefing_loop's one call site,
    which overrides it to "scheduled"."""
    try:
        existing = get_conversation(db, conversation_id) if conversation_id else None
        if existing is not None and existing.messages:
            messages = build_continued_messages(existing.messages, question or DEFAULT_CONTINUATION_TEXT)
        else:
            messages = build_initial_messages(question)
        conversation_id = conversation_id or _new_conversation_id()

        llm_output, tool_results, final_messages, tool_arg_numbers = await _run_tool_calling_session(db, messages)

        if "clarifying_question" in llm_output:
            save_conversation(db, conversation_id, final_messages)
            return BriefingResponse(
                mode="clarifying", clarifying_question=llm_output["clarifying_question"],
                tool_results={}, conversation_id=conversation_id,
            )

        result = check(llm_output, tool_results, tool_arg_numbers)
        if result.passed:
            save_briefing_record(
                db, llm_output["narrative"], llm_output["claims"], trigger_source=trigger_source,
                assessment=llm_output.get("assessment"),
            )
            save_conversation(db, conversation_id, final_messages)
            return BriefingResponse(
                mode="briefed", claims=llm_output["claims"], narrative=llm_output["narrative"],
                assessment=llm_output.get("assessment"),
                tool_results=tool_results, trigger_source=trigger_source, conversation_id=conversation_id,
            )
        _log_check_failure("first", llm_output, result)

        retry_output, retry_tool_results, retry_messages, retry_tool_arg_numbers = await _run_tool_calling_session(
            db, build_retry_messages(question, result)
        )
        if "clarifying_question" in retry_output:
            save_conversation(db, conversation_id, retry_messages)
            return BriefingResponse(
                mode="clarifying", clarifying_question=retry_output["clarifying_question"],
                tool_results={}, conversation_id=conversation_id,
            )

        result2 = check(retry_output, retry_tool_results, retry_tool_arg_numbers)
        if result2.passed:
            save_briefing_record(
                db, retry_output["narrative"], retry_output["claims"], trigger_source=trigger_source,
                assessment=retry_output.get("assessment"),
            )
            save_conversation(db, conversation_id, retry_messages)
            return BriefingResponse(
                mode="briefed", claims=retry_output["claims"], narrative=retry_output["narrative"],
                assessment=retry_output.get("assessment"),
                tool_results=retry_tool_results, trigger_source=trigger_source, conversation_id=conversation_id,
            )
        _log_check_failure("retry", retry_output, result2)
    except AllModelsFailedError:
        conversation_id = conversation_id or _new_conversation_id()

    return BriefingResponse(
        mode="raw", tool_results=await _full_raw_dump(db),
        trigger_source=trigger_source, conversation_id=conversation_id,
    )


async def run_briefing_stream(
    db: Session, question: str | None = None, conversation_id: str | None = None, persist: bool = True,
) -> AsyncIterator[dict]:
    """Streaming counterpart to run_briefing() for the coordinator-query mode only — the
    scheduled loop has no live viewer to stream to and calls run_briefing() directly.
    Re-implements the same try -> Figure-Check -> retry-once -> raw-fallback policy as
    run_briefing(), but yields step/status events instead of returning one final
    BriefingResponse. Deliberately NOT sharing run_briefing()'s code path (only the
    underlying _run_tool_calling_session_stream primitive is shared) — this keeps a bug
    in this newer, higher-risk streaming path structurally unable to reach the blocking
    /api/briefing endpoint, which stays available as a fallback if streaming misbehaves.

    persist=False skips both save_briefing_record and save_conversation — used by the
    reliability-check diagnostic (routers/diagnostics.py), which calls this real pipeline
    repeatedly on demand and must not flood the dashboard's "last briefing" state or the
    conversation store with test runs."""
    try:
        existing = get_conversation(db, conversation_id) if conversation_id else None
        if existing is not None and existing.messages:
            messages = build_continued_messages(existing.messages, question or DEFAULT_CONTINUATION_TEXT)
        else:
            messages = build_initial_messages(question)
        conversation_id = conversation_id or _new_conversation_id()

        llm_output = tool_results = final_messages = tool_arg_numbers = None
        async for event in _run_tool_calling_session_stream(db, messages):
            if event["type"] != "done":
                yield event
                continue
            llm_output, tool_results, final_messages, tool_arg_numbers = (
                event["llm_output"], event["tool_results"], event["messages"], event["tool_arg_numbers"]
            )

        if "clarifying_question" in llm_output:
            if persist:
                save_conversation(db, conversation_id, final_messages)
            yield {
                "type": "clarifying", "clarifying_question": llm_output["clarifying_question"],
                "conversation_id": conversation_id,
            }
            return

        yield {"type": "checking"}
        result = check(llm_output, tool_results, tool_arg_numbers)
        if result.passed:
            if persist:
                save_briefing_record(
                    db, llm_output["narrative"], llm_output["claims"], trigger_source="coordinator_query",
                    assessment=llm_output.get("assessment"),
                )
                save_conversation(db, conversation_id, final_messages)
            yield {
                "type": "final", "mode": "briefed", "claims": llm_output["claims"],
                "narrative": llm_output["narrative"], "assessment": llm_output.get("assessment"),
                "tool_results": tool_results,
                "trigger_source": "coordinator_query", "conversation_id": conversation_id,
            }
            return
        _log_check_failure("first", llm_output, result)
        yield {"type": "check_failed", "reason": result.failure_reason}

        yield {"type": "retrying"}
        retry_output = retry_tool_results = retry_messages = retry_tool_arg_numbers = None
        async for event in _run_tool_calling_session_stream(db, build_retry_messages(question, result)):
            if event["type"] != "done":
                yield event
                continue
            retry_output = event["llm_output"]
            retry_tool_results = event["tool_results"]
            retry_messages = event["messages"]
            retry_tool_arg_numbers = event["tool_arg_numbers"]

        if "clarifying_question" in retry_output:
            if persist:
                save_conversation(db, conversation_id, retry_messages)
            yield {
                "type": "clarifying", "clarifying_question": retry_output["clarifying_question"],
                "conversation_id": conversation_id,
            }
            return

        yield {"type": "checking"}
        result2 = check(retry_output, retry_tool_results, retry_tool_arg_numbers)
        if result2.passed:
            if persist:
                save_briefing_record(
                    db, retry_output["narrative"], retry_output["claims"], trigger_source="coordinator_query",
                    assessment=retry_output.get("assessment"),
                )
                save_conversation(db, conversation_id, retry_messages)
            yield {
                "type": "final", "mode": "briefed", "claims": retry_output["claims"],
                "narrative": retry_output["narrative"], "assessment": retry_output.get("assessment"),
                "tool_results": retry_tool_results,
                "trigger_source": "coordinator_query", "conversation_id": conversation_id,
            }
            return
        _log_check_failure("retry", retry_output, result2)
    except AllModelsFailedError as exc:
        conversation_id = conversation_id or _new_conversation_id()
        yield {"type": "error", "message": str(exc)}

    yield {
        "type": "final", "mode": "raw", "tool_results": await _full_raw_dump(db),
        "trigger_source": "coordinator_query", "conversation_id": conversation_id,
    }


async def scheduled_briefing_loop() -> None:
    """Scheduled mode — periodic on its own timer, independent of anyone asking. Reuses
    the exact same pipeline as on-demand; the only difference is what triggers it.
    Never uses a conversation_id — there's no coordinator present to continue a thread
    with, and each scheduled run should be a self-contained snapshot."""
    while True:
        await asyncio.sleep(config.SCHEDULED_BRIEFING_INTERVAL_SECONDS)
        try:
            with SessionLocal() as db:
                await run_briefing(db, trigger_source="scheduled")
        except Exception:
            logger.exception("Scheduled briefing failed")
