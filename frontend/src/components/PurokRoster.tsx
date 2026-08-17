import type { PurokOut, Status } from "../api/types";
import { useTingog } from "../context/TingogContext";

// "ALL PUROKS" tab of EscalationPanel — the map's marker popups are the only other
// place a purok's current state is visible, one click at a time. This is the
// at-a-glance alternative: every purok, current status/severity/needs, in one list,
// sorted so the ones actually needing attention surface first instead of alphabetical
// order. Reuses TacticalMap's own status color convention (STATUS_TEXT_COLOR) so a
// purok reads the same way here as it does on the map.
const STATUS_STYLE: Record<Status, { border: string; text: string; label: string }> = {
    unknown: { border: "border-[#64748B]/60", text: "text-[#64748B]", label: "UNACCOUNTED" },
    attention: { border: "border-amber-500/50", text: "text-amber-400", label: "ATTENTION" },
    stable: { border: "border-green-500/50", text: "text-green-400", label: "STABLE" },
};

// Higher = more worth a coordinator's attention. Not a severity RE-scoring (that stays
// entirely backend/deterministic, per ARCHITECTURE.md) — purely a display ORDER so the
// list itself functions as a triage view instead of requiring a separate sort step.
function urgencyScore(purok: PurokOut): number {
    return (purok.status === "unknown" ? 100 : 0)
        + (purok.severity === "high" ? 50 : purok.severity === "medium" ? 25 : 0)
        + (purok.active_needs.includes("TABANG") ? 10 : 0);
}

function PurokRosterRow({ purok }: { purok: PurokOut }) {
    const { setFocusedPurokId } = useTingog();
    const style = STATUS_STYLE[purok.status];

    return (
        <button
            type="button"
            onClick={() => setFocusedPurokId(purok.id)}
            className={`text-left bg-surface-container-high border p-2 flex flex-col gap-1 shrink-0 transition-colors hover:border-primary ${style.border}`}
        >
            <div className="flex justify-between items-center gap-2">
                <span className="text-[11px] font-data-tabular font-bold text-on-surface">
                    {purok.name}
                    <span className="ml-1.5 font-normal text-on-surface-variant">{purok.device_id}</span>
                </span>
                <span className={`text-[9px] font-data-tabular font-bold shrink-0 ${style.text}`}>{style.label}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[10px] text-on-surface-variant">
                <span>{purok.active_needs.length > 0 ? purok.active_needs.join(", ") : "no active needs"}</span>
                <span className="uppercase shrink-0">severity: {purok.severity}</span>
            </div>
        </button>
    );
}

export function PurokRoster({ puroks }: { puroks: PurokOut[] }) {
    const sorted = [...puroks].sort((a, b) => urgencyScore(b) - urgencyScore(a));

    return (
        <div className="flex-1 min-h-0 p-2 flex flex-col gap-1.5 overflow-y-auto bg-background">
            {sorted.length === 0 && <p className="text-xs text-on-surface-variant">No puroks registered yet.</p>}
            {sorted.map((purok) => (
                <PurokRosterRow key={purok.id} purok={purok} />
            ))}
        </div>
    );
}
