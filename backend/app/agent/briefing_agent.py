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

from sqlalchemy.orm import Session

from app import config
from app.agent import tools as agent_tools
from app.agent.figure_checker import CheckResult, check
from app.agent.llm_client import AllModelsFailedError, call_llm_with_fallback
from app.agent.prompts import build_continued_messages, build_initial_messages, build_retry_messages, parse_final_answer
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


async def _run_tool_calling_session(db: Session, messages: list[dict]) -> tuple[dict, dict, list[dict]]:
    """Returns (parsed final answer, tool_results gathered, full message history) —
    the message history is what gets persisted for conversation continuity."""
    tool_results: dict = {}
    for _ in range(MAX_TOOL_ITERATIONS):
        message = await call_llm_with_fallback(messages, tools=agent_tools.TOOL_SCHEMAS)
        messages.append(message)

        tool_calls = message.get("tool_calls")
        if not tool_calls:
            return parse_final_answer(message.get("content")), tool_results, messages

        for tc in tool_calls:
            name = tc.get("function", {}).get("name", "")
            try:
                args = json.loads(tc.get("function", {}).get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = agent_tools.call_tool(db, name, args)
            _record_tool_result(tool_results, name, args, result)
            messages.append(
                {"role": "tool", "tool_call_id": tc.get("id", name), "content": json.dumps(result, default=str)}
            )

    logger.warning("Tool-calling session hit MAX_TOOL_ITERATIONS=%d without a final answer", MAX_TOOL_ITERATIONS)
    return {"claims": [], "narrative": ""}, tool_results, messages


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


async def run_briefing(db: Session, question: str | None = None, conversation_id: str | None = None) -> BriefingResponse:
    """question=None generates a general briefing; a real coordinator question routes
    the same tool-calling session toward answering it specifically. Passing back a
    conversation_id from a prior response continues that thread (the agent sees the
    earlier exchange); omitting it starts fresh. A conversation_id is always returned so
    a caller can opt into continuity later even if it didn't ask for it up front."""
    try:
        existing = get_conversation(db, conversation_id) if conversation_id else None
        if existing is not None and existing.messages:
            messages = build_continued_messages(existing.messages, question or "Continue with a general update.")
        else:
            messages = build_initial_messages(question)
        conversation_id = conversation_id or _new_conversation_id()

        llm_output, tool_results, final_messages = await _run_tool_calling_session(db, messages)

        if "clarifying_question" in llm_output:
            save_conversation(db, conversation_id, final_messages)
            return BriefingResponse(
                mode="clarifying", clarifying_question=llm_output["clarifying_question"],
                tool_results={}, conversation_id=conversation_id,
            )

        result = check(llm_output, tool_results)
        if result.passed:
            save_briefing_record(db, llm_output["narrative"], llm_output["claims"])
            save_conversation(db, conversation_id, final_messages)
            return BriefingResponse(
                mode="briefed", claims=llm_output["claims"], narrative=llm_output["narrative"],
                tool_results=tool_results, conversation_id=conversation_id,
            )
        _log_check_failure("first", llm_output, result)

        retry_output, retry_tool_results, retry_messages = await _run_tool_calling_session(
            db, build_retry_messages(question, result)
        )
        if "clarifying_question" in retry_output:
            save_conversation(db, conversation_id, retry_messages)
            return BriefingResponse(
                mode="clarifying", clarifying_question=retry_output["clarifying_question"],
                tool_results={}, conversation_id=conversation_id,
            )

        result2 = check(retry_output, retry_tool_results)
        if result2.passed:
            save_briefing_record(db, retry_output["narrative"], retry_output["claims"])
            save_conversation(db, conversation_id, retry_messages)
            return BriefingResponse(
                mode="briefed", claims=retry_output["claims"], narrative=retry_output["narrative"],
                tool_results=retry_tool_results, conversation_id=conversation_id,
            )
        _log_check_failure("retry", retry_output, result2)
    except AllModelsFailedError:
        conversation_id = conversation_id or _new_conversation_id()

    return BriefingResponse(mode="raw", tool_results=await _full_raw_dump(db), conversation_id=conversation_id)


async def scheduled_briefing_loop() -> None:
    """Scheduled mode — periodic on its own timer, independent of anyone asking. Reuses
    the exact same pipeline as on-demand; the only difference is what triggers it.
    Never uses a conversation_id — there's no coordinator present to continue a thread
    with, and each scheduled run should be a self-contained snapshot."""
    while True:
        await asyncio.sleep(config.SCHEDULED_BRIEFING_INTERVAL_SECONDS)
        try:
            with SessionLocal() as db:
                await run_briefing(db)
        except Exception:
            logger.exception("Scheduled briefing failed")
