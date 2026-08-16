import { useTingog } from '../context/TingogContext';
import type { MapFilter } from './TacticalMap';

interface KPIStripProps {
    filter: MapFilter;
    onFilterChange: (filter: MapFilter) => void;
}

export function KPIStrip({ filter, onFilterChange }: KPIStripProps) {
    const { puroks } = useTingog();

    const totalHH = puroks.reduce((acc, p) => acc + p.baseline_household_count, 0);
    const criticalCount = puroks.filter(p => p.active_needs.includes('TABANG')).length;
    const resourceNeeds = puroks.reduce((acc, p) => {
        const hasResourceNeed = p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n));
        return acc + (hasResourceNeed ? 1 : 0);
    }, 0);
    const silentCount = puroks.filter(p => p.status === 'unknown' || p.hours_since_heartbeat > 6).length;

    const metrics = [
        { filter: 'ALL' as const, label: 'HOUSEHOLDS', value: totalHH, tone: 'text-on-surface', border: 'border-outline-variant' },
        { filter: 'CRITICAL' as const, label: 'CRITICAL', value: criticalCount, tone: 'text-red-400', border: 'border-red-500/50', pulse: criticalCount > 0 },
        { filter: 'NEEDS' as const, label: 'NEEDS', value: resourceNeeds, tone: 'text-amber-400', border: 'border-amber-500/50' },
        { filter: 'SILENT' as const, label: 'SILENT', value: silentCount, tone: 'text-[#64748B]', border: 'border-[#64748B]/50' },
    ];

    return (
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {metrics.map(metric => (
                <button
                    key={metric.label}
                    type="button"
                    onClick={() => onFilterChange(metric.filter)}
                    aria-pressed={filter === metric.filter}
                    className={`flex min-h-11 items-center justify-between gap-3 border ${metric.border} bg-surface-container/75 px-2.5 py-1.5 shadow-md backdrop-blur-md transition-colors hover:border-primary ${filter === metric.filter ? 'ring-1 ring-primary/70' : 'opacity-80 hover:opacity-100'}`}
                >
                    <span className="text-[10px] font-label-caps font-semibold tracking-[0.08em] text-on-surface-variant">{metric.label}</span>
                    <span className={`text-lg leading-none font-data-tabular font-bold ${metric.tone} ${metric.pulse ? 'animate-pulse' : ''}`}>{metric.value}</span>
                </button>
            ))}
        </div>
    );
}
