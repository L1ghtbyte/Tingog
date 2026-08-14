import { useTingog } from '../context/TingogContext';

export function KPIStrip() {
    const { puroks } = useTingog();

    const totalHH = puroks.reduce((acc, p) => acc + p.baseline_household_count, 0);
    const criticalCount = puroks.filter(p => p.active_needs.includes('TABANG')).length;
    
    // Count distinct resource needs across puroks (TUBIG, TAMBAL, PAGKAON)
    const resourceNeeds = puroks.reduce((acc, p) => {
        const hasResourceNeed = p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n));
        return acc + (hasResourceNeed ? 1 : 0);
    }, 0);

    const silentCount = puroks.filter(p => p.status === 'unknown' || p.hours_since_heartbeat > 6).length;

    return (
        <div className="grid grid-cols-2 lg:flex gap-2 p-2 bg-background shrink-0 border-b border-outline-variant">
            <div className="flex-1 bg-surface-container border border-outline-variant rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-on-surface-variant">TOTAL REGISTERED HH</span>
                <span className="text-display-telemetry font-display-telemetry text-on-surface">{totalHH.toString().padStart(3, '0')}</span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-red-500/50 rounded-sm p-3 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>
                <span className="text-label-caps font-label-caps text-red-400">CRITICAL EMERGENCY (TABANG)</span>
                <span className={`text-display-telemetry font-display-telemetry text-[#EF4444] ${criticalCount > 0 ? 'animate-pulse' : ''}`}>
                    {criticalCount.toString().padStart(2, '0')}
                </span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-amber-500/50 rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-amber-400">PENDING RESOURCE NEEDS</span>
                <span className="text-display-telemetry font-display-telemetry text-[#F59E0B]">
                    {resourceNeeds.toString().padStart(2, '0')}
                </span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-[#64748B]/50 rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-[#64748B]">UNREACHABLE / SILENT HH ({">"}6H)</span>
                <span className="text-display-telemetry font-display-telemetry text-[#64748B]">
                    {silentCount.toString().padStart(2, '0')}
                </span>
            </div>
        </div>
    );
}
