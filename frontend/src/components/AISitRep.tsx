import { useTingog } from '../context/TingogContext';

export function AISitRep() {
    const { anomalies } = useTingog();

    const getAnomalyIcon = (type: string) => {
        switch (type) {
            case 'CLUSTER': return 'warning';
            case 'SILENCE': return 'sensors_off';
            default: return 'info';
        }
    };

    const getAnomalyColor = (severity: string) => {
        return severity === 'red' ? 'text-red-500' : 'text-amber-500';
    };

    const getAnomalyBorder = (severity: string) => {
        return severity === 'red' ? 'border-red-500/50' : 'border-amber-500/50';
    };
    
    const getAnomalyBg = (severity: string) => {
        return severity === 'red' ? 'bg-red-500' : 'bg-amber-500';
    };
    
    const getAnomalyHeaderColor = (severity: string) => {
        return severity === 'red' ? 'text-red-400' : 'text-amber-400';
    };

    return (
        <aside className="w-full lg:w-[320px] max-h-[300px] lg:max-h-none bg-surface-container border border-outline-variant flex flex-col shrink-0">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2 tracking-tight uppercase">
                    SITUATION BRIEFING
                </h2>
            </div>
            
            <div className="p-4 flex flex-col gap-5 overflow-y-auto font-mono text-sm">
                {anomalies.map(anm => (
                    <div key={anm.id} className="flex flex-col gap-2 border-l-2 border-outline-variant pl-3 relative">
                        <div className={`absolute -left-[2px] top-0 bottom-0 w-[2px] ${getAnomalyBg(anm.severity)}`}></div>
                        
                        <div className="flex items-start justify-between">
                            <span className={`text-[11px] font-bold ${getAnomalyHeaderColor(anm.severity)} tracking-[0.1em]`}>
                                [{anm.type}] {anm.title.toUpperCase()}
                            </span>
                        </div>
                        
                        <p className="text-on-surface leading-tight text-xs">
                            {anm.description}
                        </p>
                        
                        <button className="mt-3 bg-surface-container-highest hover:bg-surface-dim border border-outline-variant px-4 py-2.5 transition-colors w-full flex items-center justify-center transform skew-x-[12deg] mx-1">
                            <span className="inline-block transform -skew-x-[12deg] text-on-surface text-[10px] font-bold tracking-widest">
                                {anm.type === 'CLUSTER' ? 'VIEW AFFECTED PUROKS' : anm.type === 'ESCALATION' ? 'DISPATCH IMMEDIATE RELIEF' : 'ALERT BARANGAY TANOD'}
                            </span>
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
