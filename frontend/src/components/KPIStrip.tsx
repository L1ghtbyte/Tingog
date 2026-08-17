import { useTingog } from '../context/TingogContext';
import type { MapFilter } from './TacticalMap';

interface KPIStripProps {
    filter: MapFilter;
    onFilterChange: (filter: MapFilter) => void;
}

export function KPIStrip({ filter, onFilterChange }: KPIStripProps) {
    const { puroks } = useTingog();

    const totalPuroksCount = puroks.length;
    const criticalCount = puroks.filter((p) => p.active_needs.includes('TABANG')).length;
    // Per-need breakdown, not just a merged total — the button taxonomy keeps TUBIG/
    // TAMBAL/PAGKAON as separate buttons specifically so a spike in ONE specific need
    // (the clustering signal) doesn't get hidden inside one undifferentiated count.
    // The top-level KPI strip shouldn't erase that signal the moment it's collapsed
    // into a single "NEEDS" number.
    const tubigCount = puroks.filter((p) => p.active_needs.includes('TUBIG')).length;
    const tambalCount = puroks.filter((p) => p.active_needs.includes('TAMBAL')).length;
    const pagkaonCount = puroks.filter((p) => p.active_needs.includes('PAGKAON')).length;
    const resourceNeeds = puroks.filter((p) =>
        p.active_needs.some((n) => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n))
    ).length;
    const needsBreakdown = [
        tubigCount > 0 ? `TUBIG ${tubigCount}` : null,
        tambalCount > 0 ? `TAMBAL ${tambalCount}` : null,
        pagkaonCount > 0 ? `PAGKAON ${pagkaonCount}` : null,
    ]
        .filter((s): s is string => s !== null)
        .join(' · ');
    // status === 'unknown' already IS the backend's real silence signal — no
    // client-side re-derivation, and no hours_since_heartbeat field to derive from anyway.
    const unaccountedCount = puroks.filter((p) => p.status === 'unknown').length;
    // "All clear" — a real stable status with nothing currently reported, not a
    // client-side reconstruction of the LUWAS press itself. Displayed as "LUWAS"
    // (reverted 2026-08-17 — the earlier "OK" relabeling was itself reverted).
    const luwasCount = puroks.filter((p) => p.active_needs.length === 0 && p.status === 'stable').length;

    const metrics = [
        { filter: 'ALL' as const, label: 'TOTAL PUROKS', value: totalPuroksCount, tone: 'text-on-surface', border: 'border-outline-variant' },
        { filter: 'CRITICAL' as const, label: 'CRITICAL', value: criticalCount, tone: 'text-red-400', border: 'border-red-500/50', pulse: criticalCount > 0 },
        { filter: 'NEEDS' as const, label: 'NEEDS', value: resourceNeeds, breakdown: needsBreakdown, tone: 'text-amber-400', border: 'border-amber-500/50' },
        { filter: 'SILENT' as const, label: 'UNACCOUNTED', value: unaccountedCount, tone: 'text-[#64748B]', border: 'border-[#64748B]/50' },
        { filter: 'LUWAS' as const, label: 'LUWAS', value: luwasCount, tone: 'text-green-400', border: 'border-green-500/50' },
    ];

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:gap-3 lg:px-4">
            {metrics.map((metric) => (
                <button
                    key={metric.label}
                    type="button"
                    onClick={() => onFilterChange(metric.filter)}
                    aria-pressed={filter === metric.filter}
                    className={`group relative overflow-hidden flex min-h-14 items-center border ${metric.border} bg-surface-container/75 shadow-md backdrop-blur-md transition-all duration-300 hover:border-primary -skew-x-12 ${filter === metric.filter ? 'ring-1 ring-primary/70 opacity-100 z-10 scale-[1.02]' : 'opacity-80 hover:opacity-100'}`}
                >
                    {/* Content (Unskewed) */}
                    <div className="relative z-10 flex w-full items-center justify-between gap-3 px-5 py-2 skew-x-12">
                        <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="text-[11px] font-label-caps font-semibold tracking-[0.08em] text-on-surface-variant group-hover:text-primary transition-colors">{metric.label}</span>
                            {metric.breakdown && (
                                <span className="text-[9px] text-on-surface-variant/70 tracking-tight whitespace-normal leading-tight">{metric.breakdown}</span>
                            )}
                        </div>
                        <span className={`text-xl leading-none font-data-tabular font-bold shrink-0 ${metric.tone} ${metric.pulse ? 'animate-pulse' : ''}`}>{metric.value}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}
