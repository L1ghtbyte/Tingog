import { useTingog } from '../context/TingogContext';
import type { MapFilter } from './TacticalMap';

interface KPIStripProps {
    filter: MapFilter;
    onFilterChange: (filter: MapFilter) => void;
}

export function KPIStrip({ filter, onFilterChange }: KPIStripProps) {
    const { puroks } = useTingog();

    const totalPuroks = Math.max(1, puroks.length); // Avoid div by zero
    const totalHH = puroks.reduce((acc, p) => acc + p.baseline_household_count, 0);
    const criticalCount = puroks.filter(p => p.active_needs.includes('TABANG')).length;
    const resourceNeeds = puroks.reduce((acc, p) => {
        const hasResourceNeed = p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n));
        return acc + (hasResourceNeed ? 1 : 0);
    }, 0);
    const silentCount = puroks.filter(p => p.status === 'unknown' || p.hours_since_heartbeat > 6).length;
    const luwasCount = puroks.filter(p => p.active_needs.length === 0 && p.status !== 'unknown' && p.hours_since_heartbeat <= 6).length;

    const metrics = [
        { filter: 'ALL' as const, label: 'HOUSEHOLDS', value: totalHH, tone: 'text-on-surface', border: 'border-outline-variant', bgColor: 'rgba(255,255,255,0.05)', pct: 100 },
        { filter: 'CRITICAL' as const, label: 'CRITICAL', value: criticalCount, tone: 'text-red-400', border: 'border-red-500/50', pulse: criticalCount > 0, bgColor: 'rgba(239,68,68,0.25)', pct: (criticalCount / totalPuroks) * 100 },
        { filter: 'NEEDS' as const, label: 'NEEDS', value: resourceNeeds, tone: 'text-amber-400', border: 'border-amber-500/50', bgColor: 'rgba(245,158,11,0.25)', pct: (resourceNeeds / totalPuroks) * 100 },
        { filter: 'SILENT' as const, label: 'SILENT', value: silentCount, tone: 'text-[#64748B]', border: 'border-[#64748B]/50', bgColor: 'rgba(100,116,139,0.25)', pct: (silentCount / totalPuroks) * 100 },
        { filter: 'LUWAS' as const, label: 'LUWAS', value: luwasCount, tone: 'text-green-400', border: 'border-green-500/50', bgColor: 'rgba(34,197,94,0.25)', pct: (luwasCount / totalPuroks) * 100 },
    ];

    return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:gap-3 lg:px-4">
            {metrics.map((metric) => (
                <button
                    key={metric.label}
                    type="button"
                    onClick={() => onFilterChange(metric.filter)}
                    aria-pressed={filter === metric.filter}
                    className={`group relative overflow-hidden flex min-h-14 items-center justify-between border ${metric.border} bg-surface-container/75 shadow-md backdrop-blur-md transition-all duration-300 hover:border-primary -skew-x-12 ${filter === metric.filter ? 'ring-1 ring-primary/70 opacity-100 z-10 scale-[1.02]' : 'opacity-80 hover:opacity-100'}`}
                >
                    {/* Inline Sparkline Bar */}
                    <div 
                        className="absolute left-0 top-0 bottom-0 z-0 transition-all duration-1000 ease-out" 
                        style={{ width: `${metric.pct}%`, backgroundColor: metric.bgColor }}
                    />
                    
                    {/* Content (Unskewed) */}
                    <div className="relative z-10 flex w-full items-center justify-between gap-3 px-5 py-2 skew-x-12">
                        <span className="text-[11px] font-label-caps font-semibold tracking-[0.08em] text-on-surface-variant group-hover:text-primary transition-colors">{metric.label}</span>
                        <span className={`text-xl leading-none font-data-tabular font-bold ${metric.tone} ${metric.pulse ? 'animate-pulse' : ''}`}>{metric.value}</span>
                    </div>
                </button>
            ))}
        </div>
    );
}
