import { useTingog } from '../context/TingogContext';

const Sparkline = ({ type, color }: { type: string, color: string }) => {
    let path = "";
    if (type === 'critical') path = "M0,30 L10,25 L15,35 L25,10 L30,40 L45,15 L55,30 L70,5 L80,35 L90,20 L100,30"; 
    else if (type === 'needs') path = "M0,35 L20,30 L40,32 L60,20 L80,25 L100,10"; 
    else if (type === 'silent') path = "M0,20 L20,18 L30,22 L40,20 L100,20"; 
    else return null;

    return (
        <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 100 40">
            <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            <path d={`${path} L100,40 L0,40 Z`} fill={color} opacity="0.15" />
        </svg>
    );
};

export function KPIStrip() {
    const { puroks } = useTingog();

    const totalHH = puroks.reduce((acc, p) => acc + p.baseline_household_count, 0);
    const criticalCount = puroks.filter(p => p.active_needs.includes('TABANG')).length;
    
    // Count distinct resource needs across puroks
    const resourceNeeds = puroks.reduce((acc, p) => {
        const hasResourceNeed = p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n));
        return acc + (hasResourceNeed ? 1 : 0);
    }, 0);

    const silentCount = puroks.filter(p => p.status === 'unknown' || p.hours_since_heartbeat > 6).length;

    return (
        <div className="grid grid-cols-2 lg:flex gap-3 p-4 bg-background shrink-0 border-b border-outline-variant">
            
            {/* Box 1: Total HH */}
            <div className="flex-1 relative min-h-[80px] bg-surface-container border border-outline-variant transform -skew-x-[12deg] hover:border-primary/50 transition-colors">
                <div className="transform skew-x-[12deg] h-full flex flex-col justify-between p-3 lg:px-6">
                    <span className="text-label-caps font-label-caps text-on-surface-variant relative z-10">TOTAL REGISTERED HH</span>
                    <span className="text-display-telemetry font-display-telemetry text-on-surface relative z-10">{totalHH.toString().padStart(3, '0')}</span>
                </div>
            </div>

            {/* Box 2: Critical */}
            <div className="flex-1 relative min-h-[80px] bg-surface-container border border-red-500/50 transform -skew-x-[12deg] overflow-hidden hover:border-red-500 transition-colors">
                <div className="absolute inset-0 bg-red-500/5"></div>
                <Sparkline type="critical" color="#EF4444" />
                <div className="transform skew-x-[12deg] h-full flex flex-col justify-between p-3 lg:px-8 relative z-10">
                    <span className="text-label-caps font-label-caps text-red-400">CRITICAL (TABANG)</span>
                    <span className={`text-display-telemetry font-display-telemetry text-[#EF4444] ${criticalCount > 0 ? 'animate-pulse' : ''}`}>
                        {criticalCount.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* Box 3: Needs */}
            <div className="flex-1 relative min-h-[80px] bg-surface-container border border-amber-500/50 transform -skew-x-[12deg] overflow-hidden hover:border-amber-500 transition-colors">
                <div className="absolute inset-0 bg-amber-500/5"></div>
                <Sparkline type="needs" color="#F59E0B" />
                <div className="transform skew-x-[12deg] h-full flex flex-col justify-between p-3 lg:px-8 relative z-10">
                    <span className="text-label-caps font-label-caps text-amber-400">PENDING RESOURCE</span>
                    <span className="text-display-telemetry font-display-telemetry text-[#F59E0B]">
                        {resourceNeeds.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

            {/* Box 4: Silent */}
            <div className="flex-1 relative min-h-[80px] bg-surface-container border border-[#64748B]/50 transform -skew-x-[12deg] overflow-hidden hover:border-[#64748B] transition-colors">
                <div className="absolute inset-0 bg-[#64748B]/5"></div>
                <Sparkline type="silent" color="#64748B" />
                <div className="transform skew-x-[12deg] h-full flex flex-col justify-between p-3 lg:px-8 relative z-10">
                    <span className="text-label-caps font-label-caps text-[#64748B]">UNREACHABLE ({">"}6H)</span>
                    <span className="text-display-telemetry font-display-telemetry text-[#64748B]">
                        {silentCount.toString().padStart(2, '0')}
                    </span>
                </div>
            </div>

        </div>
    );
}
