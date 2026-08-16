from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    button: str
    combo_buttons: list[str] | None
    press_type: str
    device_timestamp: int | None
    received_at: datetime
    is_simulated: bool


class PurokOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    device_id: str
    name: str
    barangay: str
    purok_leader: str | None
    latitude: float
    longitude: float
    is_simulated: bool
    baseline_vulnerable_count: int
    last_event_at: datetime | None
    active_needs: list[str]
    distinct_buttons_15min: int
    status: str
    severity: str
    severity_reasons: list[str]


class DeliveryRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    items: list[str]
    delivered_by: str | None
    note: str | None
    delivered_at: datetime


class DeliveryCreateIn(BaseModel):
    """items must be a non-empty subset of the four need-buttons (TABANG/TUBIG/TAMBAL/
    PAGKAON) — validated in the router against inference.NEED_BUTTONS, not re-declared
    as a Literal here so there's one source of truth for the valid set."""

    items: list[str]
    delivered_by: str | None = None
    note: str | None = None


class PurokDetailOut(PurokOut):
    event_history: list[EventOut]
    deliveries: list[DeliveryRecordOut]


class BriefingResponse(BaseModel):
    """
    mode == "briefed": claims + narrative populated, checked against tool_results by the
    Figure Checker before delivery.
    mode == "raw": claims/narrative are None (both attempts failed the check) —
    tool_results still carries everything the dashboard needs to show *something*
    without fabricated prose.
    mode == "clarifying": the agent judged the question genuinely ambiguous and is
    asking back rather than guessing an interpretation — claims/narrative/tool_results
    are empty, `clarifying_question` is populated instead. Never produced for a general
    (question=None) briefing — there's nobody to answer a clarifying question in that
    context, only ever for a specific coordinator question.
    conversation_id: present whenever multi-turn continuity is in play — pass it back on
    the next question to continue the same thread instead of starting fresh.
    """

    mode: Literal["briefed", "raw", "clarifying"]
    claims: list[dict[str, Any]] | None = None
    narrative: str | None = None
    clarifying_question: str | None = None
    tool_results: dict[str, Any]
    conversation_id: str | None = None


class ClusterOut(BaseModel):
    """Dashboard-facing exposure of clustering.get_active_clusters() — previously only
    available to the Briefing Agent's internal tools, needed as a real public endpoint
    for the map's cluster overlay (dashboard_map_requirement.md: driven by real
    inference output, not on-screen pixel distance)."""

    cluster_id: int
    need_type: str
    puroks: list[str]  # purok names, not ids — matches clustering.py's existing shape
    window_minutes: float
    confidence: int


class RecentEventOut(BaseModel):
    """Flattened event feed across ALL puroks, with purok context attached — distinct
    from EventOut (which is scoped to one purok's own history) and from
    tools.get_recent_activity (which aggregates counts only, for the Briefing Agent)."""

    id: int
    purok_id: int
    purok_name: str
    device_id: str
    button: str
    combo_buttons: list[str] | None
    press_type: str
    received_at: datetime
    is_simulated: bool


class EscalationOut(BaseModel):
    """Event-triggered mode's record — see app/escalation.py."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    kind: str
    purok_id: int | None
    purok_name: str
    reasons: list[str]
    message: str
    webhook_delivered: bool
