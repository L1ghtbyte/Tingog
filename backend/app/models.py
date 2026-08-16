from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint

from app.database import Base
from app.timeutil import utcnow


class Purok(Base):
    __tablename__ = "puroks"

    id = Column(Integer, primary_key=True)
    # Stable hardware identifier — a string, not a number, to match what real gateway-
    # registered devices actually send (e.g. "DEV-089"), not an int we'd have to
    # translate to/from. "1" = the legacy single-ESP32 WiFi device; "101"+ = simulated.
    device_id = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)  # e.g. "Purok 3" — a subdivision, not a barangay name
    barangay = Column(String, nullable=False)  # ONE real barangay within San Remigio, same for every purok this week
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    is_simulated = Column(Boolean, nullable=False)
    baseline_vulnerable_count = Column(Integer, default=0)
    last_event_at = Column(DateTime, nullable=True)

    # Stewardship, not access control — who's accountable for this device's physical
    # upkeep (maintenance, knowing where it is, point of contact if it breaks), not who's
    # "allowed" to press it (deliberately anyone, always). Maps to an existing barangay
    # governance role (purok leader), not a system-invented permission. Nullable/unset for
    # every purok right now — we don't have real roster data, and inventing a name here
    # would be fabricating a real person's identity, not an honest placeholder.
    purok_leader = Column(String, nullable=True)

    # Derived fields below are CACHED columns, always written by recompute_purok() — never hand-set elsewhere
    active_needs = Column(JSON, default=list)
    distinct_buttons_15min = Column(Integer, default=0)
    status = Column(String, default="unknown")
    severity = Column(String, default="low")
    severity_reasons = Column(JSON, default=list)


class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True)
    purok_id = Column(Integer, ForeignKey("puroks.id"), nullable=False, index=True)
    device_id = Column(String, nullable=False)
    seq_num = Column(Integer, nullable=False)
    button = Column(String, nullable=False)  # TABANG/TUBIG/TAMBAL/PAGKAON/LUWAS/COMBO
    combo_buttons = Column(JSON, nullable=True)  # populated only when button == COMBO
    press_type = Column(String, nullable=False)  # stored as-given, not strictly validated
    device_timestamp = Column(Integer, nullable=True)
    received_at = Column(DateTime, nullable=False, default=utcnow)  # authoritative clock
    is_simulated = Column(Boolean, nullable=False)

    __table_args__ = (UniqueConstraint("device_id", "seq_num", name="uq_device_seq"),)


class BriefingRecord(Base):
    """Memory for the Briefing Agent — lets get_previous_briefing() answer "what
    changed since last time" instead of every briefing being stateless. Only
    mode="briefed" results are meaningful to remember; mode="raw" ones aren't saved."""

    __tablename__ = "briefing_records"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    narrative = Column(String, nullable=False)
    claims = Column(JSON, nullable=False)


class EscalationRecord(Base):
    """Event-triggered mode: fired by the DETERMINISTIC engine the instant a watched
    condition changes — never an LLM decision (the decision of whether something is
    severe enough to escalate must be reproducible and explainable, same reasoning as
    severity scoring itself). The alert message is a plain deterministic template, not
    AI-generated — the critical-path notification must not depend on an LLM call
    succeeding.

    kind:
      "high_severity" — a purok newly crossed into severity="high"
      "de_escalation"  — a purok newly dropped OUT of severity="high"
      "panic_press"    — a purok newly crossed the panic-press threshold (distinct
                          buttons in the trailing window), independent of overall
                          severity — the spec calls this rule trustworthy on its own
      "new_cluster"    — a cluster of multiple independent puroks reporting the same
                          need newly appeared; purok_id is null (spans multiple puroks),
                          purok_name holds a summary instead
    """

    __tablename__ = "escalation_records"

    id = Column(Integer, primary_key=True)
    created_at = Column(DateTime, nullable=False, default=utcnow, index=True)
    kind = Column(String, nullable=False, default="high_severity")
    purok_id = Column(Integer, ForeignKey("puroks.id"), nullable=True, index=True)
    purok_name = Column(String, nullable=False)
    reasons = Column(JSON, nullable=False)
    message = Column(String, nullable=False)
    webhook_delivered = Column(Boolean, nullable=False, default=False)


class DeliveryRecord(Base):
    """A coordinator's confirmation that specific relief items were actually delivered to
    a purok — a human-triggered write, never something the Briefing Agent can create
    itself (it only reads deliveries, same as everything else it touches). Exists to give
    active_needs a targeted clear signal in addition to LUWAS's all-or-nothing one — see
    the comment in inference.compute_active_needs for how the two combine.

    Deliberately NOT a distribution-management system: no stock/inventory count, no
    routing, no allocation across puroks. Just a record that one delivery happened."""

    __tablename__ = "delivery_records"

    id = Column(Integer, primary_key=True)
    purok_id = Column(Integer, ForeignKey("puroks.id"), nullable=False, index=True)
    items = Column(JSON, nullable=False)  # subset of NEED_BUTTONS, e.g. ["TUBIG", "PAGKAON"]
    delivered_by = Column(String, nullable=True)  # free text, optional
    note = Column(String, nullable=True)
    delivered_at = Column(DateTime, nullable=False, default=utcnow)


class ConversationRecord(Base):
    """Multi-turn memory for on-demand mode — lets a coordinator ask a follow-up
    question ("what about Purok 4 specifically?") with the prior exchange still in
    context, instead of every question starting a fresh, unrelated session. `messages`
    is the raw OpenAI-format message list (system/user/assistant/tool turns) —
    opaque to everything except the Briefing Agent that reads and appends to it."""

    __tablename__ = "conversations"

    id = Column(String, primary_key=True)  # short random id, generated by the caller
    created_at = Column(DateTime, nullable=False, default=utcnow)
    updated_at = Column(DateTime, nullable=False, default=utcnow, onupdate=utcnow)
    messages = Column(JSON, nullable=False, default=list)
