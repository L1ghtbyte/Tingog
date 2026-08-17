"""
Prompt for the Briefing Agent — a real, bounded, multi-turn tool-calling (ReAct-style)
session (see briefing_agent.py). The model decides which tools it needs, calls them
itself, reads results, and either calls more tools, asks a clarifying question, or
produces a final answer.
"""

import json

from app import config
from app.agent.figure_checker import CheckResult

BASE_PROMPT = """You are a briefing assistant for disaster response coordinators, \
covering puroks (community areas) reporting through a button-based system.

You have tools available to look up current data — unaccounted-for puroks, active \
clusters of similar reports, high-severity puroks, anomalies, recent activity, the \
narrative from the last briefing (if any), and full detail on one specific purok. Call \
whichever tools are relevant to what you're being asked. You do not have to call all \
of them, and you do not have to call them in any fixed order — decide based on what \
you actually need. You may call get_purok to drill into a specific purok already \
surfaced by another tool.

Rules you must follow:
- Do not invent data. Every specific number or named purok in your response must come \
from a tool result you actually received.
- Never rank puroks by which should receive aid first. You may describe patterns (e.g. \
"several puroks reporting the same need") and severity levels, but the decision of \
where to go is the coordinator's, not yours.
- If a purok has had no contact, say so as "unknown" or "unaccounted for" — never \
describe silence as "safe" or "fine."
- Write for someone who has been away from the dashboard and needs to know what \
changed and what needs attention, in plain language. Avoid technical jargon (don't say \
"cluster," say "several puroks reporting the same thing at once").
- If, while gathering data to answer what you were actually asked, you notice something \
else clearly urgent (e.g. a different purok newly high severity), you may briefly \
mention it as an additional claim — but don't let it distract from directly answering \
what was asked.

Once you have gathered what you need (usually a handful of tool calls, rarely more), \
stop calling tools and respond with a JSON object with these keys:
- "claims": a list of objects. Each MUST include "source_tool" (the tool that returned \
the fact) and "source_field" (a path into that tool's result, e.g. "total_events", \
"[0].hours_since_contact", "[2].need_type" — the tools return bare lists or dicts \
directly, there is no wrapping object to name). Include whatever other fields describe \
the fact being claimed (e.g. "value", or "purok"/"hours", or "puroks"/"need_type"/\
"window_minutes").
- get_purok is different from every other tool: its result is a dict KEYED BY PUROK ID \
(e.g. {"4": {"status": "unknown", "severity": "high", ...}}), not one flat record. \
source_field for anything from get_purok MUST include which purok_id, e.g. \
"[4].status" or "[4].severity" — never just "status" on its own, since that would be \
ambiguous about which purok you mean.
- "narrative": a short paragraph built ONLY from the claims above. Every number \
appearing in the narrative must also appear in a claim.
Respond with ONLY that JSON object once you're done calling tools — no extra text \
around it."""

ASSESSMENT_ADDENDUM = """

Also include a third key, "assessment": one short paragraph of genuine interpretation, \
built ONLY from the claims and narrative you already wrote. Never introduce a new fact, \
a new number, or a named purok that wasn't already in your narrative — this is not a \
new classification, it's an interpretation of the one you already made and verified. \
Explain why the pattern you found actually matters and what's worth the coordinator's \
attention — not just restating what already happened. Frame it as an observation or a \
consideration, never as a decision or a ranking of who should get help first — that \
stays the coordinator's call, always. For example, instead of repeating "Purok 4 has \
been silent 14 hours," explain what that combination of facts (silence plus a held \
TABANG) suggests is worth checking on, without inventing any new specifics."""

CLARIFYING_QUESTION_ADDENDUM = """

If the coordinator's question is genuinely ambiguous — you can't tell which purok, \
need, or time range they mean, and guessing wrong would waste their time — you may \
instead respond with ONLY a JSON object with one key: "clarifying_question", a short \
question asking exactly what's unclear. Use this rarely — only when a reasonable \
guess would likely be wrong, not just because a question is broad. A general request \
like "what's the situation" is NOT ambiguous — that means the general briefing."""


DEFAULT_GENERAL_BRIEFING_TEXT = (
    "Write a briefing covering what a coordinator who's been away from the "
    "dashboard needs to know right now."
)
DEFAULT_CONTINUATION_TEXT = "Continue with a general update."
# Every build_retry_messages() correction starts with this — used by
# reconstruct_conversation_turns() to recognize and skip these synthetic "user" turns
# when replaying a saved conversation for display (a coordinator never typed them).
RETRY_CORRECTION_PREFIX = "IMPORTANT — your previous attempt"


def _system_prompt(question: str | None) -> str:
    prompt = BASE_PROMPT
    if config.ENABLE_ASSESSMENT_LAYER:
        prompt += ASSESSMENT_ADDENDUM
    # Clarifying questions are only offered when a real coordinator is actually there
    # to answer one — never for the default general briefing (question=None), which
    # may run unattended (scheduled mode).
    if question:
        prompt += CLARIFYING_QUESTION_ADDENDUM
    return prompt


def build_initial_messages(question: str | None = None) -> list[dict]:
    user_turn = question.strip() if question and question.strip() else DEFAULT_GENERAL_BRIEFING_TEXT
    return [
        {"role": "system", "content": _system_prompt(question)},
        {"role": "user", "content": user_turn},
    ]


def build_continued_messages(existing_messages: list[dict], question: str) -> list[dict]:
    """Multi-turn continuation — appends a new question onto an existing conversation's
    message history (system prompt, prior turns, prior tool calls all still present),
    so a follow-up like "what about Purok 4 specifically?" has the earlier exchange for
    context instead of starting a fresh, unrelated session."""
    return existing_messages + [{"role": "user", "content": question.strip()}]


def build_retry_messages(question: str | None, result: CheckResult) -> list[dict]:
    """A fresh conversation (not a continuation of the failed one) with the correction
    folded into the opening request — simpler and more bounded than trying to resume a
    partial tool-call history from a failed attempt."""
    if result.failure_reason == "claim_mismatch":
        correction = (
            f"IMPORTANT — your previous attempt at this had a claim that didn't match "
            f"the actual tool data. You claimed: {result.failed_claim}. The actual "
            f"value at that source is: {result.actual_value}. Call the tools again "
            f"yourself and verify each fact before claiming it this time."
        )
    elif result.failure_reason == "unbacked_narrative_number":
        correction = (
            f"IMPORTANT — your previous attempt's narrative mentioned the number "
            f"{result.actual_value} with no backing claim. Every number in the "
            f"narrative must appear in a claim. Call the tools again and be careful to "
            f"back every number this time."
        )
    elif result.failure_reason == "unbacked_assessment_number":
        correction = (
            f"IMPORTANT — your previous attempt's \"assessment\" mentioned the number "
            f"{result.actual_value}, which never appeared in your claims or narrative. "
            f"The assessment must interpret facts you already verified, never introduce "
            f"a new one. Call the tools again and keep the assessment to interpretation "
            f"only, no new specifics."
        )
    else:
        correction = (
            f"IMPORTANT — your previous attempt cited a tool that doesn't exist: "
            f"{result.failed_claim}. Only use the tools actually available to you."
        )

    messages = build_initial_messages(question)
    messages.append({"role": "user", "content": correction})
    return messages


def parse_final_answer(content: str | None) -> dict:
    """The model's final (no more tool_calls) turn should be either the claims+
    narrative JSON or a {"clarifying_question": ...} JSON. Tolerant of a model wrapping
    it in prose or a code fence despite being told not to — the Figure Checker
    downstream already has to tolerate imprecision regardless. Returns a dict with
    either ("claims", "narrative") or ("clarifying_question",) populated."""
    if not content:
        return {"claims": [], "narrative": ""}
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict) and "clarifying_question" in parsed:
            return {"clarifying_question": str(parsed["clarifying_question"])}
        if isinstance(parsed, dict) and "narrative" in parsed:
            return parsed
    except json.JSONDecodeError:
        pass
    return {"claims": [], "narrative": text}
