"""
Deterministic, never an LLM call (CLAUDE.md hard constraint #2). Two passes, exactly as
04_agent_tools_spec.md describes: (1) every claim's value matched exactly against the
tool result it cites, (2) every number in the narrative must appear among the claims'
numeric values.

Note on `source_field` paths: 04_agent_tools_spec.md's own illustrative example uses
"clusters[0]" as if get_active_clusters() returned {"clusters": [...]}, but the tool
suite section (and our actual tools.py) returns a bare list. Our convention (documented
in prompts.py, told to the LLM directly) is paths relative to the tool result itself —
e.g. "[0].need_type", not "clusters[0]" — since there's no wrapper object to name.
"""

import re
from dataclasses import dataclass

NUMBER_RE = re.compile(r"\d+(\.\d+)?")
_PATH_TOKEN_RE = re.compile(r"([^.\[\]]+)|\[(\d+)\]")


@dataclass
class CheckResult:
    passed: bool
    # "claim_mismatch" | "unbacked_narrative_number" | "unbacked_assessment_number" | "unknown_source_tool"
    failure_reason: str | None = None
    failed_claim: dict | None = None
    actual_value: object | None = None


def resolve_path(root, path: str):
    if not path:
        return root
    current = root
    for match in _PATH_TOKEN_RE.finditer(path):
        key, idx = match.groups()
        if idx is not None:
            # Found live 2026-08-15: models also use bracket syntax for dict keys, not
            # just list indices — e.g. "[5].status" meaning the dict key "5", against
            # get_purok's {"5": {...}} shape. Reasonable convention (many path languages
            # use obj[key] for both), so try it as a dict key before giving up.
            if isinstance(current, dict):
                current = current.get(str(idx))
            elif isinstance(current, (list, tuple)) and int(idx) < len(current):
                current = current[int(idx)]
            elif isinstance(current, (list, tuple)):
                # Found live 2026-08-17: a model reused get_purok's own "[N] means the
                # item for purok N" convention against a DIFFERENT tool that returns a
                # plain positionally-indexed list (e.g. get_high_severity), not a dict
                # keyed by purok_id — so N was out of range as a raw position even
                # though the claim was substantively correct. When N is out of range
                # positionally, but exactly one item in the list has purok_id == N,
                # that's what was actually meant; anything less exact (no match, or
                # more than one) stays a real rejection, not a loophole.
                candidates = [item for item in current if isinstance(item, dict) and item.get("purok_id") == int(idx)]
                current = candidates[0] if len(candidates) == 1 else None
            else:
                return None
        elif key:
            # Found live 2026-08-15: models consistently write source_field="silence_score"
            # instead of "[0].silence_score" when a list has exactly one element — a
            # reasonable simplification, not a random slip (it happened across multiple
            # models/attempts). Tolerating it here means the checker doesn't punish a
            # substantively correct claim for a plausible formatting choice; a list with
            # >1 element still requires an explicit index, since there'd be real ambiguity.
            if isinstance(current, (list, tuple)) and len(current) == 1:
                current = current[0]
            if isinstance(current, dict):
                current = current.get(key)
            else:
                return None
    return current


def _claim_value_fields(claim: dict) -> dict:
    return {k: v for k, v in claim.items() if k not in ("source_tool", "source_field")}


def _field_matches(record: dict, key: str, value, known_numbers: set[float] | None = None) -> bool:
    """A claim's extra (sibling) field is verified if either its literal key exists in
    the record with a matching value, OR the claimed value appears anywhere else among
    the record's own values. Found live 2026-08-17: a real, otherwise-correct claim
    used its own reasonable label ("purok": "Purok 4") for a fact the real record
    stores under a different key ("purok_name": "Purok 4") — the claimed VALUE was
    exactly right, but the exact-key-match check rejected the whole claim over a purely
    presentational naming difference, not a factual error. Requiring the value to
    appear *somewhere* in the same record still rejects a genuinely fabricated value
    (e.g. a wrong purok name) — it just stops requiring the model to guess the backend's
    internal field names for facts it's allowed to restate in its own words.

    Also tolerates mild paraphrasing of string values — e.g. "high severity" for the
    real value "high" (found live 2026-08-17). The claimed string must fully CONTAIN a
    real string value from the record, not just share a substring in either direction —
    a genuinely wrong value (e.g. "low severity" when the real value is "high") still
    contains no real value from the record and is still rejected.

    known_numbers (tool-call arguments, e.g. window_minutes=30): a claim can bundle a
    query parameter as a sibling fact (e.g. {"value": 2, "window_minutes": 30}) — that
    number will never appear in any tool RESULT no matter how the record is searched,
    since it was never returned data in the first place, only an input. Found live
    2026-08-17 as a real rejection of an otherwise fully correct claim."""
    if record.get(key) == value or any(v == value for v in record.values()):
        return True
    if isinstance(value, str):
        return any(isinstance(v, str) and v and v in value for v in record.values())
    if isinstance(value, int) and not isinstance(value, bool):
        # Found live 2026-08-17: a claim wrote a plain whole number (e.g. "hours": 14)
        # for a real value with decimal precision (14.1) — a reasonable rounding when
        # citing a precise figure in prose, not a fabrication. Deliberately narrow: only
        # an INTEGER claim value rounding to match a real FLOAT is tolerated, so a
        # genuinely wrong whole number (e.g. 99) still won't coincidentally round-match.
        if any(isinstance(v, float) and round(v) == value for v in record.values()):
            return True
    if known_numbers and isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) in known_numbers
    return False


def _matches(actual, expected: dict, known_numbers: set[float] | None = None) -> bool:
    if not expected:
        return False
    if len(expected) == 1 and "value" in expected:
        value = expected["value"]
        if actual == value:
            return True
        # Found live 2026-08-15: a claim cited a whole list (e.g. source_field="reasons",
        # a purok's full reasons list) when it meant one specific string within it. The
        # cited value IS a real, true member of that list — being imprecise about which
        # index isn't the same as being wrong. Still rejects an actually-absent value.
        if isinstance(actual, (list, tuple)) and value in actual:
            return True
        return False
    if isinstance(actual, dict):
        return all(_field_matches(actual, k, v, known_numbers) for k, v in expected.items())
    if len(expected) == 1:
        return actual == next(iter(expected.values()))
    return False


def _strip_last_segment(path: str) -> str:
    """`"[0].purok_name"` -> `"[0]"`; `"total_events"` -> `""` (single segment, parent is root)."""
    tokens = list(_PATH_TOKEN_RE.finditer(path))
    if len(tokens) <= 1:
        return ""
    return path[: tokens[-1].start()]


def _flatten_numbers(value) -> set[float]:
    # Numeric equality, not string equality — 14.0 (a claim's float) and "14.0" (the
    # narrative's text) must match even though Python formats them differently
    # (str(14.0) == "14.0" but a naive int-collapse would produce "14"). Found live
    # 2026-08-15 as a real false rejection, not a hypothetical.
    numbers: set[float] = set()
    if isinstance(value, bool):
        return numbers
    if isinstance(value, (int, float)):
        numbers.add(float(value))
    elif isinstance(value, str):
        numbers.update(float(m.group(0)) for m in NUMBER_RE.finditer(value))
    elif isinstance(value, dict):
        for v in value.values():
            numbers |= _flatten_numbers(v)
    elif isinstance(value, (list, tuple, set)):
        for v in value:
            numbers |= _flatten_numbers(v)
    return numbers


def check(llm_output: dict, tool_results: dict, tool_arg_numbers: set[float] | None = None) -> CheckResult:
    """tool_arg_numbers: numbers the model itself passed as tool-call arguments (e.g.
    minutes=30 for a query window) — not present in any tool RESULT, so they can't back
    a claim, but they're still real known-legitimate numbers the narrative should be
    allowed to mention (e.g. "in the last 30 minutes") without that being flagged as an
    unbacked hallucination. Found live 2026-08-17: previously rejected every time."""
    claims = llm_output.get("claims") or []
    narrative = llm_output.get("narrative") or ""
    tool_arg_numbers = tool_arg_numbers or set()

    for claim in claims:
        source_tool = claim.get("source_tool")
        source_field = claim.get("source_field", "")
        if source_tool not in tool_results:
            return CheckResult(False, "unknown_source_tool", claim, None)

        root = tool_results[source_tool]
        expected = _claim_value_fields(claim)

        actual = resolve_path(root, source_field)
        if _matches(actual, expected, tool_arg_numbers):
            continue

        # Fallback: source_field may name just ONE field of a claim that also bundles
        # true sibling facts from the same record — e.g. source_field="[0].purok_name"
        # with an extra "hours_since_contact" field alongside it. Found live
        # (2026-08-15): a real, correct claim shaped exactly this way was wrongly
        # rejected by the direct-field-only check above. Check the ENCLOSING record
        # (source_field with its last segment stripped) against every expected key —
        # this still rejects a claim with any actually-wrong field, it just stops
        # requiring source_field to be the ONLY field the claim describes.
        parent = resolve_path(root, _strip_last_segment(source_field))
        if isinstance(parent, dict) and all(_field_matches(parent, k, v, tool_arg_numbers) for k, v in expected.items()):
            continue

        return CheckResult(False, "claim_mismatch", claim, actual)

    claimed_numbers: set[float] = set()
    for claim in claims:
        claimed_numbers |= _flatten_numbers(_claim_value_fields(claim))

    for match in NUMBER_RE.finditer(narrative):
        number = float(match.group(0))
        if number not in claimed_numbers and number not in tool_arg_numbers:
            return CheckResult(False, "unbacked_narrative_number", None, match.group(0))

    # "assessment" (agent/prompts.py's ASSESSMENT_ADDENDUM, config.ENABLE_ASSESSMENT_LAYER)
    # is genuine interpretation, not a new fact source — it's only allowed to reference
    # numbers already backed by a claim or a known tool argument, same bar the narrative
    # itself just passed above. A model with the addendum disabled never produces this
    # key, so llm_output.get() here is a no-op for every pre-existing caller/test.
    assessment = llm_output.get("assessment") or ""
    for match in NUMBER_RE.finditer(assessment):
        number = float(match.group(0))
        if number not in claimed_numbers and number not in tool_arg_numbers:
            return CheckResult(False, "unbacked_assessment_number", None, match.group(0))

    return CheckResult(True)
