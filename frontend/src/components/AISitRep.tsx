import { useEffect, useState } from "react";

import { getBriefing, getLastBriefing } from "../api/client";
import type { BriefingResponse, EscalationKind, EscalationOut, PurokOut } from "../api/types";
import { useTingog } from "../context/TingogContext";

const KIND_STYLE: Record<EscalationKind, { bar: string; text: string; label: string }> = {
    high_severity: { bar: "bg-red-500", text: "text-red-400", label: "HIGH SEVERITY" },
    panic_press: { bar: "bg-red-500", text: "text-red-400", label: "PANIC PRESS" },
    de_escalation: { bar: "bg-green-500", text: "text-green-400", label: "DE-ESCALATION" },
    new_cluster: { bar: "bg-amber-500", text: "text-amber-400", label: "NEW CLUSTER" },
};

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
function extractReferencedPurokIds(claims: Record<string, unknown>[] | null, puroks: PurokOut[]): { id: number; name: string }[] {
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

function EscalationCard({ escalation, now }: { escalation: EscalationOut; now: number }) {
    const { setFocusedPurokId } = useTingog();
    const style = KIND_STYLE[escalation.kind];

    return (
        <div className="flex flex-col gap-2 border-l-2 border-outline-variant pl-3 relative">
            <div className={`absolute -left-[2px] top-0 bottom-0 w-[2px] ${style.bar}`} />
            <div className="flex items-start justify-between gap-2">
                <span className={`text-[11px] font-bold ${style.text} tracking-[0.1em]`}>
                    [{style.label}] {escalation.purok_name.toUpperCase()}
                </span>
                <span className="text-[10px] text-on-surface-variant shrink-0">{formatTime(escalation.created_at, now)}</span>
            </div>
            <p className="text-on-surface leading-tight text-xs">{escalation.message}</p>
            {escalation.purok_id !== null && (
                <button
                    onClick={() => setFocusedPurokId(escalation.purok_id)}
                    className="mt-1 bg-surface-container-highest hover:bg-surface-dim border border-outline-variant px-4 py-2 transition-colors w-full flex items-center justify-center transform skew-x-[12deg] mx-1"
                >
                    <span className="inline-block transform -skew-x-[12deg] text-on-surface text-[10px] font-bold tracking-widest">
                        VIEW ON MAP
                    </span>
                </button>
            )}
        </div>
    );
}

export function AISitRep() {
    const { escalations, puroks, setFocusedPurokId } = useTingog();
    const [question, setQuestion] = useState("");
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [response, setResponse] = useState<BriefingResponse | null>(null);
    const [lastBriefingAt, setLastBriefingAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [now] = useState(() => Date.now());

    // Passive load on mount — the last saved briefing, no agent run. Lets the panel
    // show something real immediately instead of empty, without forcing a fresh
    // (slower, LLM-backed) request the moment the page opens.
    useEffect(() => {
        getLastBriefing()
            .then((last) => {
                if (!last) return;
                setResponse({
                    mode: "briefed",
                    claims: last.claims,
                    narrative: last.narrative,
                    clarifying_question: null,
                    tool_results: {},
                    conversation_id: null,
                });
                setLastBriefingAt(last.created_at);
            })
            .catch(() => {
                // No saved briefing yet, or backend briefly unreachable at mount —
                // the ASK button still works either way, so fail silently here.
            });
    }, []);

    const handleAsk = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await getBriefing(question.trim() || undefined, conversationId);
            setResponse(result);
            setLastBriefingAt(null); // fresh, on-demand result — not the passive last-saved one
            if (result.conversation_id) setConversationId(result.conversation_id);
            setQuestion("");
        } catch {
            setError("Couldn't reach the briefing agent — the backend may be unreachable.");
        } finally {
            setIsLoading(false);
        }
    };

    const referencedPuroks = response?.mode === "briefed" ? extractReferencedPurokIds(response.claims, puroks) : [];

    return (
        <aside className="h-full w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container/90 shadow-2xl backdrop-blur-md flex flex-col">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2 tracking-tight uppercase">
                    SITUATION BRIEFING
                </h2>
            </div>

            <div className="p-3 border-b border-outline-variant flex flex-col gap-2">
                <div className="flex gap-2">
                    <input
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !isLoading && handleAsk()}
                        placeholder="Ask a question, or leave blank for a general briefing..."
                        className="flex-1 bg-surface-container-high border border-outline-variant px-2 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant outline-none focus:border-primary"
                    />
                    <button
                        onClick={handleAsk}
                        disabled={isLoading}
                        className="bg-primary-container text-black font-bold text-label-caps font-label-caps px-3 disabled:opacity-50 transform skew-x-[12deg]"
                    >
                        <span className="inline-block transform -skew-x-[12deg]">{isLoading ? "..." : "ASK"}</span>
                    </button>
                </div>
                {isLoading && (
                    <p className="text-[10px] text-on-surface-variant">
                        Checking against real data — this can take anywhere from a few seconds to over a minute.
                    </p>
                )}
                {error && <p className="text-[10px] text-red-400">{error}</p>}

                {response?.mode === "clarifying" && (
                    <div className="text-xs text-amber-400 border-l-2 border-amber-500 pl-2">{response.clarifying_question}</div>
                )}
                {response?.mode === "briefed" && (
                    <div className="flex flex-col gap-2">
                        {lastBriefingAt && (
                            <p className="text-[10px] text-on-surface-variant italic">
                                Last generated {formatTime(lastBriefingAt, now)} — ask a question for a fresh check.
                            </p>
                        )}
                        <p className="text-xs text-on-surface leading-relaxed">{response.narrative}</p>
                        {referencedPuroks.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                                <span className="text-[10px] text-on-surface-variant">Referenced:</span>
                                {referencedPuroks.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => setFocusedPurokId(p.id)}
                                        className="text-[10px] text-primary underline hover:text-on-surface"
                                    >
                                        [{p.name}]
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {response?.mode === "raw" && (
                    <div className="text-[10px] text-on-surface-variant">
                        The AI's answer couldn't be verified against real data twice in a row, so here's the real data
                        directly instead of an unchecked summary.
                    </div>
                )}
            </div>

            <div className="flex-1 min-h-0 p-4 flex flex-col gap-5 overflow-y-auto font-mono text-sm">
                {escalations.length === 0 && (
                    <p className="text-xs text-on-surface-variant">No event-triggered alerts yet.</p>
                )}
                {escalations.map((escalation) => (
                    <EscalationCard key={escalation.id} escalation={escalation} now={now} />
                ))}
            </div>
        </aside>
    );
}
