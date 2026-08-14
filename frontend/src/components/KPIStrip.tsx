export function KPIStrip() {
    return (
        <div className="flex gap-2 p-2 bg-background shrink-0 border-b border-outline-variant">
            <div className="flex-1 bg-surface-container border border-outline-variant rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-on-surface-variant">TOTAL REGISTERED HH</span>
                <span className="text-display-telemetry font-display-telemetry text-white">412</span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-red-500/50 rounded-sm p-3 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute inset-0 bg-red-500/10 pointer-events-none"></div>
                <span className="text-label-caps font-label-caps text-red-400">CRITICAL EMERGENCY (TABANG)</span>
                <span className="text-display-telemetry font-display-telemetry text-[#EF4444] animate-pulse">04</span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-amber-500/50 rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-amber-400">PENDING RESOURCE NEEDS</span>
                <span className="text-display-telemetry font-display-telemetry text-[#F59E0B]">14</span>
            </div>
            
            <div className="flex-1 bg-surface-container border border-[#64748B]/50 rounded-sm p-3 flex flex-col justify-between">
                <span className="text-label-caps font-label-caps text-[#64748B]">UNREACHABLE / SILENT HH ({">"}6H)</span>
                <span className="text-display-telemetry font-display-telemetry text-[#64748B]">28</span>
            </div>
        </div>
    );
}
