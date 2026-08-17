import { useEffect, useRef, useState } from "react";

import { getBriefingStreamUrl, getLastBriefing, getLastConversation } from "../api/client";
import type { PurokOut, StreamEvent, TriggerSource } from "../api/types";
import { useTingog } from "../context/TingogContext";

function formatTime(iso: string, now: number): string {
    const diffMins = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
}

// Real purok references come from the AI's structured claims, not the free-text
// narrative — the backend prompt (agent/prompts.py) deliberately writes vague prose for
// clusters ("several puroks reporting...") rather than always naming individual puroks,
// so there's no reliable bracket/marker syntax in the text to parse. Claims are
// structured, so scanning their values against real purok names is the reliable path.
function extractReferencedPurokIds(claims: Record<string, unknown>[] | undefined, puroks: PurokOut[]): { id: number; name: string }[] {
    if (!claims) return [];
    const byName = new Map(puroks.map((p) => [p.name, p.id]));
    const found = new Map<number, string>();
    const consider = (value: unknown) => {
        if (typeof value === "string" && byName.has(value)) found.set(byName.get(value)!, value);
        else if (Array.isArray(value)) value.forEach(consider);
    };
    claims.forEach((claim) => Object.values(claim).forEach(consider));
    return Array.from(found.entries()).map(([id, name]) => ({ id, name }));
}

function pluralize(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// Not a raw JSON dump — the full payload is already available via the terminal event's
// own tool_results for anyone who wants it. This stays legible: a process log, not a
// debugger console.
function summarizeToolResult(result: unknown): string {
    if (Array.isArray(result)) return `${result.length} result${result.length === 1 ? "" : "s"}`;
    if (result && typeof result === "object") {
        const keys = Object.keys(result as Record<string, unknown>);
        if (keys.length === 0) return "empty";
        return keys.length <= 3 ? keys.join(", ") : `${keys.slice(0, 3).join(", ")}, ...`;
    }
    return String(result);
}

// One entry per real tool (backend/app/agent/tools.py) — icon + a plain-language title
// for what it's doing, plus a summarizer that reads the ACTUAL result shape for that
// specific tool, not a generic "N results". Every subtitle below is real data, not
// invented detail — matches this project's standing rule against fabricated specificity.
interface ToolMeta {
    icon: string;
    title: string;
    summarize: (result: unknown) => string;
}

const TOOL_META: Record<string, ToolMeta> = {
    get_unaccounted_puroks: {
        icon: "notifications_off",
        title: "Checking for unaccounted puroks",
        summarize: (r) => {
            const list = r as { purok_name: string; hours_since_contact: number }[];
            if (!Array.isArray(list) || list.length === 0) return "None unaccounted for";
            if (list.length === 1) return `${list[0].purok_name} — ${list[0].hours_since_contact.toFixed(1)}h silent`;
            return `${pluralize(list.length, "purok")} unaccounted for`;
        },
    },
    get_high_severity: {
        icon: "priority_high",
        title: "Checking severity levels",
        summarize: (r) => {
            const list = r as { purok_name: string }[];
            if (!Array.isArray(list) || list.length === 0) return "None at high severity";
            if (list.length === 1) return `${list[0].purok_name} flagged high severity`;
            return `${pluralize(list.length, "purok")} flagged high severity`;
        },
    },
    get_active_clusters: {
        icon: "hub",
        title: "Looking for clustering patterns",
        summarize: (r) => {
            const list = r as { need_type: string; puroks: string[] }[];
            if (!Array.isArray(list) || list.length === 0) return "No active clusters";
            if (list.length === 1) return `${list[0].need_type} cluster — ${pluralize(list[0].puroks.length, "purok")}`;
            return `${pluralize(list.length, "active cluster")}`;
        },
    },
    get_anomalies: {
        icon: "troubleshoot",
        title: "Scanning for anomalies",
        summarize: (r) => {
            const list = r as unknown[];
            if (!Array.isArray(list) || list.length === 0) return "No anomalies detected";
            return `${pluralize(list.length, "anomaly")} detected`;
        },
    },
    get_recent_activity: {
        icon: "history",
        title: "Reviewing recent activity",
        summarize: (r) => {
            const activity = r as { total_events?: number; puroks_reporting?: number };
            if (!activity || typeof activity !== "object") return "No recent activity";
            return `${pluralize(activity.total_events ?? 0, "event")} across ${pluralize(activity.puroks_reporting ?? 0, "purok")}`;
        },
    },
    get_purok: {
        icon: "location_on",
        title: "Pulling purok details",
        summarize: (r) => {
            const count = r && typeof r === "object" ? Object.keys(r as object).length : 0;
            return `${pluralize(count, "purok")} pulled`;
        },
    },
    get_previous_briefing: {
        icon: "description",
        title: "Checking the previous briefing",
        summarize: (r) => {
            const prev = r as { has_previous?: boolean };
            return prev && prev.has_previous ? "Previous briefing found" : "No previous briefing on record";
        },
    },
};

function getToolMeta(tool: string): ToolMeta {
    return TOOL_META[tool] ?? { icon: "database", title: tool, summarize: summarizeToolResult };
}

const STEP_EVENT_TYPES = new Set(["tool_call", "tool_result", "checking", "check_failed", "retrying", "error"]);

// A tool_call and its matching tool_result arrived as two separate stream events, but
// showing them as two stacked lines doubles the visual length of the trace for no
// reason — the natural reading is one row per tool that updates in place from pending
// to done, same as any build log or CLI spinner. This merges them; every other event
// type stays its own row.
type DisplayStep =
    | { key: string; type: "tool"; tool: string; status: "pending" | "done"; result?: unknown }
    | { key: string; type: "checking" }
    | { key: string; type: "check_failed"; reason: string | null }
    | { key: string; type: "retrying" }
    | { key: string; type: "error"; message: string };

function toDisplaySteps(steps: StreamEvent[]): DisplayStep[] {
    const display: DisplayStep[] = [];
    steps.forEach((step, i) => {
        if (step.type === "tool_call") {
            display.push({ key: `${i}`, type: "tool", tool: step.tool, status: "pending" });
        } else if (step.type === "tool_result") {
            const pendingIdx = [...display].reverse().findIndex((d) => d.type === "tool" && d.tool === step.tool && d.status === "pending");
            if (pendingIdx !== -1) {
                const idx = display.length - 1 - pendingIdx;
                display[idx] = { key: display[idx].key, type: "tool", tool: step.tool, status: "done", result: step.result };
            }
        } else if (step.type === "checking") {
            display.push({ key: `${i}`, type: "checking" });
        } else if (step.type === "check_failed") {
            display.push({ key: `${i}`, type: "check_failed", reason: step.reason });
        } else if (step.type === "retrying") {
            display.push({ key: `${i}`, type: "retrying" });
        } else if (step.type === "error") {
            display.push({ key: `${i}`, type: "error", message: step.message });
        }
    });
    return display;
}

// Real vertical timeline (icon circles + connecting line), not a plain text log — each
// row shows a plain-language title and a real, tool-specific result summary once done,
// with a spinner on whichever row is actively in flight. No badges naming separate
// "systems" (unlike a multi-agency assistant) — every row is honestly the same single
// Tingog backend, just a different real tool call against it.
function TimelineRow({ step, isLast, isStreaming }: { step: DisplayStep; isLast: boolean; isStreaming: boolean }) {
    let icon: string;
    let title: React.ReactNode;
    let subtitle: React.ReactNode = null;
    let titleTone = "text-on-surface";
    let ringTone = "border-outline-variant text-on-surface-variant";
    let showSpinner = false;

    switch (step.type) {
        case "tool": {
            const meta = getToolMeta(step.tool);
            icon = meta.icon;
            title = meta.title;
            if (step.status === "pending") {
                showSpinner = true;
                subtitle = "Working...";
            } else {
                ringTone = "border-green-500/60 text-green-400";
                subtitle = meta.summarize(step.result);
            }
            break;
        }
        case "checking":
            icon = "fact_check";
            title = "Verifying claims against real data";
            if (isLast && isStreaming) showSpinner = true;
            else ringTone = "border-green-500/60 text-green-400";
            break;
        case "check_failed":
            icon = "error";
            title = "A claim didn't check out";
            subtitle = step.reason ?? undefined;
            titleTone = "text-amber-400";
            ringTone = "border-amber-400 text-amber-400";
            break;
        case "retrying":
            icon = "refresh";
            title = "Trying again";
            titleTone = "text-amber-400";
            ringTone = isLast && isStreaming ? "border-amber-400 text-amber-400" : "border-amber-400/60 text-amber-400";
            if (isLast && isStreaming) showSpinner = true;
            break;
        case "error":
            icon = "error";
            title = "Connection issue";
            subtitle = step.message;
            titleTone = "text-red-400";
            ringTone = "border-red-400 text-red-400";
            break;
        default:
            return null;
    }

    return (
        <div className="flex gap-2.5">
            <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full border-[1.5px] flex items-center justify-center shrink-0 bg-surface-container-high ${ringTone}`}>
                    <span className={`material-symbols-outlined text-[13px] ${showSpinner ? "animate-spin" : ""}`}>
                        {showSpinner ? "progress_activity" : icon}
                    </span>
                </div>
                {!isLast && <div className="w-px flex-1 min-h-[6px] bg-outline-variant" />}
            </div>
            <div className={`min-w-0 ${isLast ? "" : "pb-2.5"}`}>
                <div className={`text-[11px] font-bold leading-tight ${titleTone}`}>{title}</div>
                {subtitle && <div className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{subtitle}</div>}
            </div>
        </div>
    );
}

// One real back-and-forth turn. `question === null` marks the passively-loaded last
// saved briefing (shown on mount, not asked this session) — it has no step trace since
// it never had one, and no question bubble since nobody asked it this session.
interface ChatTurn {
    id: string;
    question: string | null;
    createdAt?: string;
    triggerSource?: TriggerSource;
    steps: StreamEvent[];
    terminalEvent: StreamEvent | null;
    isStreaming: boolean;
}

function ChatTurnBlock({
    turn, isExpanded, onToggleExpand, puroks, onFocusPurok, now,
}: {
    turn: ChatTurn;
    isExpanded: boolean;
    onToggleExpand: () => void;
    puroks: PurokOut[];
    onFocusPurok: (id: number) => void;
    now: number;
}) {
    const displaySteps = toDisplaySteps(turn.steps);
    const claims = turn.terminalEvent?.type === "final" ? turn.terminalEvent.claims : undefined;
    const referencedPuroks = extractReferencedPurokIds(claims, puroks);
    const toolCallCount = displaySteps.filter((s) => s.type === "tool").length;

    return (
        <div className="flex flex-col gap-1.5">
            {turn.question !== null ? (
                <div className="self-end max-w-[90%] bg-primary-container/15 border border-primary/40 px-2.5 py-1.5 text-xs text-on-surface">
                    {turn.question}
                </div>
            ) : (
                turn.createdAt && (
                    <p className="text-[10px] text-on-surface-variant italic">
                        {turn.triggerSource === "scheduled"
                            ? `From a scheduled check, ${formatTime(turn.createdAt, now)}`
                            : `Last generated ${formatTime(turn.createdAt, now)}`}
                    </p>
                )
            )}

            {/* Process trace — expandable/collapsible per turn, so a long back-and-forth
                doesn't force every past turn's full trace to stay on screen. */}
            {turn.steps.length > 0 && (
                <div className="flex flex-col bg-background/50 border border-outline-variant p-2.5">
                    <button
                        onClick={onToggleExpand}
                        className="flex items-center justify-between gap-2 text-[10px] font-label-caps font-semibold tracking-[0.08em] text-on-surface-variant w-full text-left"
                    >
                        <span>{turn.isStreaming ? "Working through the real data..." : `${pluralize(toolCallCount, "tool call")} — process`}</span>
                        <span className="material-symbols-outlined text-[14px] shrink-0">{isExpanded ? "expand_less" : "expand_more"}</span>
                    </button>
                    {isExpanded && (
                        <div className="mt-2">
                            {displaySteps.map((step, i) => (
                                <TimelineRow key={step.key} step={step} isLast={i === displaySteps.length - 1} isStreaming={turn.isStreaming} />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {turn.terminalEvent?.type === "clarifying" && (
                <div className="text-xs text-amber-400 border-l-2 border-amber-500 pl-2">{turn.terminalEvent.clarifying_question}</div>
            )}
            {turn.terminalEvent?.type === "final" && turn.terminalEvent.mode === "briefed" && (
                <div className="flex flex-col gap-2">
                    <p className="text-xs text-on-surface leading-relaxed">{turn.terminalEvent.narrative}</p>
                    {referencedPuroks.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-on-surface-variant">Referenced:</span>
                            {referencedPuroks.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => onFocusPurok(p.id)}
                                    className="text-[10px] text-primary underline hover:text-on-surface"
                                >
                                    [{p.name}]
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {turn.terminalEvent?.type === "final" && turn.terminalEvent.mode === "raw" && (
                <div className="text-[10px] text-on-surface-variant">
                    The AI's answer couldn't be verified against real data twice in a row, so here's the real data
                    directly instead of an unchecked summary.
                </div>
            )}
            {turn.terminalEvent?.type === "error" && (
                <div className="text-[10px] text-red-400">{turn.terminalEvent.message}</div>
            )}
        </div>
    );
}

// A chatbot a coordinator actively converses with and a passive, automatic alerts feed
// are different interaction models — they used to share one scrollable panel, which
// blurred that distinction. This is now chat-only; the escalation log lives in its own
// EscalationPanel, stacked separately in App.tsx.
export function AISitRep() {
    const { puroks, setFocusedPurokId } = useTingog();
    const [question, setQuestion] = useState("");
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [now] = useState(() => Date.now());

    const [turns, setTurns] = useState<ChatTurn[]>([]);
    const [expandedTurnIds, setExpandedTurnIds] = useState<Set<string>>(new Set());
    const eventSourceRef = useRef<EventSource | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Passive load on mount — replays the coordinator's WHOLE real conversation, not
    // just the single last saved narrative. A back-and-forth is real, persisted data
    // (backend save_conversation) — without this, a page reload or server restart wiped
    // every past question/answer from view even though the backend never lost it. No
    // step trace on replayed turns (none was ever persisted — never synthesize fake
    // steps for it), and conversationId is restored so a follow-up question continues
    // the SAME thread instead of silently starting a disconnected new one.
    useEffect(() => {
        getLastConversation()
            .then((history) => {
                if (!history || history.turns.length === 0) return false;
                setConversationId(history.conversation_id);
                setTurns(
                    history.turns.map((turn, i) => ({
                        id: `history-${i}`,
                        question: turn.question,
                        // Only the conversation's own updated_at is available (no
                        // per-turn timestamp is persisted) — real data, applied only to
                        // the general-briefing (question=null) turns that actually show
                        // it, same as the old single-narrative passive display did.
                        ...(turn.question === null ? { createdAt: history.updated_at, triggerSource: "coordinator_query" as const } : {}),
                        steps: [],
                        terminalEvent:
                            turn.mode === "clarifying"
                                ? { type: "clarifying", clarifying_question: turn.clarifying_question ?? "", conversation_id: history.conversation_id }
                                : {
                                      type: "final", mode: "briefed", claims: turn.claims ?? undefined, narrative: turn.narrative ?? undefined,
                                      tool_results: {}, trigger_source: "coordinator_query", conversation_id: history.conversation_id,
                                  },
                        isStreaming: false,
                    }))
                );
                return true;
            })
            .then((loadedConversation) => {
                if (loadedConversation) return;
                // No real conversation yet (fresh install, or only scheduled runs exist —
                // those never create a ConversationRecord) — fall back to the single last
                // saved narrative so a fresh page load still isn't empty.
                getLastBriefing().then((last) => {
                    if (!last) return;
                    setTurns([
                        {
                            id: "passive",
                            question: null,
                            createdAt: last.created_at,
                            triggerSource: last.trigger_source,
                            steps: [],
                            terminalEvent: {
                                type: "final", mode: "briefed", claims: last.claims, narrative: last.narrative,
                                tool_results: {}, trigger_source: last.trigger_source, conversation_id: "",
                            },
                            isStreaming: false,
                        },
                    ]);
                });
            })
            .catch(() => {
                // Backend briefly unreachable at mount — the ASK button still works once
                // it's up, so fail silently here rather than blocking the panel.
            });
    }, []);

    useEffect(() => () => eventSourceRef.current?.close(), []);

    // Keep the newest turn in view as the conversation grows.
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [turns]);

    const isStreaming = turns.some((t) => t.isStreaming);

    const handleAsk = () => {
        eventSourceRef.current?.close();
        const turnId = `turn-${Date.now()}`;
        const questionText = question.trim();

        setTurns((prev) => [
            ...prev,
            { id: turnId, question: questionText || "(general briefing)", steps: [], terminalEvent: null, isStreaming: true },
        ]);
        // Focus on the new turn — past ones auto-collapse (their text stays, just the
        // process trace tucks away) rather than piling up expanded on every ask.
        setExpandedTurnIds(new Set([turnId]));
        setQuestion("");

        const es = new EventSource(getBriefingStreamUrl(questionText || undefined, conversationId));
        eventSourceRef.current = es;

        es.onmessage = (raw) => {
            const event: StreamEvent = JSON.parse(raw.data);
            const isStep = STEP_EVENT_TYPES.has(event.type);
            setTurns((prev) =>
                prev.map((t) => {
                    if (t.id !== turnId) return t;
                    if (isStep) return { ...t, steps: [...t.steps, event] };
                    return { ...t, terminalEvent: event, isStreaming: false };
                })
            );
            if (!isStep) {
                if ("conversation_id" in event && event.conversation_id) setConversationId(event.conversation_id);
                es.close();
            }
        };

        es.onerror = () => {
            // EventSource retries transient hiccups on its own; only treat this as a real
            // failure once it's actually given up and closed the connection.
            if (es.readyState === EventSource.CLOSED) {
                setTurns((prev) =>
                    prev.map((t) => {
                        if (t.id !== turnId) return t;
                        if (t.terminalEvent) return { ...t, isStreaming: false };
                        return {
                            ...t,
                            isStreaming: false,
                            terminalEvent: { type: "error", message: "Lost connection to the briefing agent mid-stream." },
                        };
                    })
                );
                es.close();
            }
        };
    };

    const toggleExpand = (id: string) => {
        setExpandedTurnIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <aside className="h-full w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container/90 shadow-2xl backdrop-blur-md flex flex-col">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2 tracking-tight uppercase">
                    SITUATION BRIEFING
                </h2>
            </div>

            <div ref={scrollRef} className="p-3 flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
                {turns.length === 0 && <p className="text-xs text-on-surface-variant">Ask a question below to get started.</p>}
                {turns.map((turn) => (
                    <ChatTurnBlock
                        key={turn.id}
                        turn={turn}
                        isExpanded={expandedTurnIds.has(turn.id)}
                        onToggleExpand={() => toggleExpand(turn.id)}
                        puroks={puroks}
                        onFocusPurok={setFocusedPurokId}
                        now={now}
                    />
                ))}
            </div>

            <div className="p-3 border-t border-outline-variant flex gap-2">
                <input
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !isStreaming && handleAsk()}
                    placeholder="Ask Tingog..."
                    className="flex-1 bg-surface-container-high border border-outline-variant px-2 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
                />
                <button
                    onClick={handleAsk}
                    disabled={isStreaming}
                    className="bg-primary-container text-black font-bold text-label-caps font-label-caps px-3 disabled:opacity-50 transform skew-x-[12deg]"
                >
                    <span className="inline-block transform -skew-x-[12deg]">{isStreaming ? "..." : "ASK"}</span>
                </button>
            </div>
        </aside>
    );
}
