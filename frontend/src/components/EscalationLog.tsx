import type { EscalationKind, EscalationOut } from "../api/types";
import { useTingog } from "../context/TingogContext";

// Deliberately styled as a raw, instant, deterministic signal feed — the visual
// opposite of the AI panel above it. This list is never AI-touched (see
// ARCHITECTURE.md: "NEVER event-triggered") — escalation.py computes these purely
// from severity/status/cluster arithmetic, so the card language borrows from
// PacketStream's "Incoming Reports" feed (full border, monospace tabular header,
// exact timestamp) rather than a soft conversational card, to make that contrast
// visible, not just true underneath.
const KIND_STYLE: Record<EscalationKind, { border: string; text: string; label: string }> = {
    high_severity: { border: "border-red-500", text: "text-red-400", label: "HIGH SEVERITY" },
    panic_press: { border: "border-red-500", text: "text-red-400", label: "PANIC PRESS" },
    de_escalation: { border: "border-green-500/50", text: "text-green-400", label: "DE-ESCALATION" },
    new_cluster: { border: "border-amber-500/50", text: "text-amber-400", label: "NEW CLUSTER" },
};

function formatRelativeTime(iso: string, now: number): string {
    const diffMins = Math.floor((now - new Date(iso).getTime()) / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
}

// Exact HH:MM:SS, not just relative — precise timestamps read as "log," relative
// ones read as "conversation." Both are shown together.
function formatExactTime(iso: string): string {
    return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

// The backend message already starts "Tingog ALERT: "/"Tingog UPDATE: " — pure
// repetition here, since the colored [KIND] tag already says that. Display-only trim,
// the real stored message is untouched.
function trimMessagePrefix(message: string): string {
    return message.replace(/^Tingog (ALERT|UPDATE): /, "");
}

function EscalationCard({ escalation, now }: { escalation: EscalationOut; now: number }) {
    const { setFocusedPurokId } = useTingog();
    const style = KIND_STYLE[escalation.kind];

    return (
        <div className={`bg-surface-container-high border p-2 flex flex-col gap-1 shrink-0 transition-colors ${style.border}`}>
            <div className="flex justify-between items-start gap-2">
                <span className={`text-[11px] font-data-tabular font-bold leading-tight ${style.text}`}>
                    [{style.label}] {escalation.purok_name.toUpperCase()}
                </span>
                <span className="text-[9px] font-data-tabular shrink-0 text-on-surface-variant leading-tight">
                    {formatExactTime(escalation.created_at)}
                    <span className="ml-1 opacity-70">({formatRelativeTime(escalation.created_at, now)})</span>
                </span>
            </div>
            <div className="text-[11px] font-data-tabular text-on-surface leading-snug">
                {trimMessagePrefix(escalation.message)}
            </div>
            {escalation.purok_id !== null && (
                <button
                    onClick={() => setFocusedPurokId(escalation.purok_id)}
                    className="bg-transparent border border-primary text-primary py-1 hover:bg-primary/10 transition-colors transform skew-x-[12deg]"
                >
                    <span className="inline-block transform -skew-x-[12deg] text-[9px] font-label-caps font-bold tracking-widest">
                        VIEW ON MAP
                    </span>
                </button>
            )}
        </div>
    );
}

export function EscalationLog({ escalations, now }: { escalations: EscalationOut[]; now: number }) {
    return (
        <div className="flex-1 min-h-0 p-2 flex flex-col gap-1.5 overflow-y-auto bg-background">
            {escalations.length === 0 && (
                <p className="text-xs text-on-surface-variant">No event-triggered alerts yet.</p>
            )}
            {escalations.map((escalation) => (
                <EscalationCard key={escalation.id} escalation={escalation} now={now} />
            ))}
        </div>
    );
}
