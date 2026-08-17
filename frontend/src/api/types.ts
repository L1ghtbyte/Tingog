// Mirrors backend/app/schemas.py field-for-field. The backend drives this contract —
// never the other way around. `button`/`combo_buttons`/`press_type` are typed loosely
// (string, not a strict union) to match the backend's own "stored as-given, not
// strictly validated" looseness rather than fighting it.

export type Status = "unknown" | "attention" | "stable";
export type Severity = "low" | "medium" | "high";
export type NeedButton = "TABANG" | "TUBIG" | "TAMBAL" | "PAGKAON";
export type EscalationKind = "high_severity" | "de_escalation" | "panic_press" | "new_cluster";
export type BriefingMode = "briefed" | "raw" | "clarifying";

export interface EventOut {
    id: number;
    button: string; // TABANG/TUBIG/TAMBAL/PAGKAON/LUWAS/COMBO
    combo_buttons: string[] | null;
    press_type: string; // single/hold/double
    device_timestamp: number | null;
    received_at: string; // ISO
    is_simulated: boolean;
}

export interface DeliveryRecordOut {
    id: number;
    items: NeedButton[];
    delivered_by: string | null;
    note: string | null;
    delivered_at: string;
}

export interface PurokOut {
    id: number;
    device_id: string;
    name: string;
    barangay: string;
    purok_leader: string | null;
    latitude: number;
    longitude: number;
    is_simulated: boolean;
    baseline_vulnerable_count: number;
    last_event_at: string | null;
    active_needs: NeedButton[];
    distinct_buttons_15min: number;
    status: Status;
    severity: Severity;
    severity_reasons: string[];
}

export interface PurokDetailOut extends PurokOut {
    event_history: EventOut[];
    deliveries: DeliveryRecordOut[];
}

export interface ClusterOut {
    cluster_id: number;
    need_type: string; // a NeedButton, or "mixed"
    puroks: string[]; // purok NAMES, not ids
    window_minutes: number;
    confidence: number;
}

export interface RecentEventOut {
    id: number;
    purok_id: number;
    purok_name: string;
    device_id: string;
    button: string;
    combo_buttons: string[] | null;
    press_type: string;
    received_at: string;
    is_simulated: boolean;
}

export interface EscalationOut {
    id: number;
    created_at: string;
    kind: EscalationKind;
    purok_id: number | null;
    purok_name: string;
    reasons: string[];
    message: string;
    webhook_delivered: boolean;
}

// Which of the three real invocation modes (see ARCHITECTURE.md) produced a briefing.
// Event-triggered never appears here — it never touches the Briefing Agent at all.
export type TriggerSource = "coordinator_query" | "scheduled";

export interface BriefingResponse {
    mode: BriefingMode;
    claims: Record<string, unknown>[] | null;
    narrative: string | null;
    clarifying_question: string | null;
    tool_results: Record<string, unknown>;
    trigger_source: TriggerSource | null;
    conversation_id: string | null;
}

// The last successfully saved briefing (mode="briefed" only) — for passive
// display on load without forcing a fresh, LLM-backed run.
export interface LastBriefingOut {
    narrative: string;
    claims: Record<string, unknown>[];
    trigger_source: TriggerSource;
    created_at: string;
}

// One step from GET /api/briefing/stream (SSE), in the order they're emitted. Mirrors
// backend/app/agent/briefing_agent.py's run_briefing_stream() event shapes exactly.
export type StreamEvent =
    | { type: "tool_call"; tool: string; args: Record<string, unknown> | null }
    | { type: "tool_result"; tool: string; result: unknown }
    | { type: "checking" }
    | { type: "check_failed"; reason: string | null }
    | { type: "retrying" }
    | { type: "clarifying"; clarifying_question: string; conversation_id: string }
    | {
          type: "final";
          mode: "briefed" | "raw";
          claims?: Record<string, unknown>[];
          narrative?: string;
          tool_results: Record<string, unknown>;
          trigger_source: TriggerSource;
          conversation_id: string;
      }
    | { type: "error"; message: string };

// One event from GET /api/diagnostics/briefing-reliability (SSE). Mirrors
// backend/app/routers/diagnostics.py's _reliability_stream() event shapes exactly.
export type ReliabilityRunMode = "briefed" | "raw" | "clarifying" | "crashed" | "unknown";

export type ReliabilityEvent =
    | { type: "run_start"; run: number; total: number }
    | {
          type: "run_result";
          run: number;
          total: number;
          mode: ReliabilityRunMode;
          elapsed_seconds: number;
          check_failed_count: number;
          error: string | null;
      }
    | { type: "summary"; total: number; briefed: number; raw: number; other: number; avg_seconds: number };

export interface DeliveryCreateIn {
    items: NeedButton[];
    delivered_by?: string;
    note?: string;
}
