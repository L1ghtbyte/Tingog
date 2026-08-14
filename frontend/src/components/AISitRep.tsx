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
        <aside className="w-full lg:w-[320px] max-h-[300px] lg:max-h-none bg-surface-container border border-outline-variant flex flex-col rounded-sm shrink-0">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
                    AI SitRep
                </h2>
                <span className="text-label-caps font-label-caps text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-sm border border-outline-variant">LIVE</span>
            </div>
            
            <div className="p-3 flex flex-col gap-3 overflow-y-auto">
                {anomalies.map(anm => (
                    <div key={anm.id} className={`bg-surface-container-high border ${getAnomalyBorder(anm.severity)} rounded-sm p-3 relative`}>
                        <div className={`absolute left-0 top-0 bottom-0 w-1 ${getAnomalyBg(anm.severity)}`}></div>
                        <div className="flex items-start gap-2 mb-2 pl-2">
                            <span className={`material-symbols-outlined ${getAnomalyColor(anm.severity)} text-sm mt-0.5`}>{getAnomalyIcon(anm.type)}</span>
                            <h3 className={`text-label-caps font-label-caps ${getAnomalyHeaderColor(anm.severity)}`}>{anm.title}</h3>
                        </div>
                        <p className="text-data-tabular font-data-tabular text-on-surface mb-3 pl-2 leading-relaxed">
                            {anm.description}
                        </p>
                        <button className={`ml-2 bg-background border border-outline-variant hover:border-${anm.severity === 'red' ? 'primary' : 'amber-500'} text-on-surface text-label-caps font-label-caps px-3 py-1.5 transition-colors w-full flex items-center justify-center gap-2`}>
                            <span className="material-symbols-outlined text-[16px]">{anm.type === 'CLUSTER' ? 'visibility' : 'campaign'}</span>
                            {anm.type === 'CLUSTER' ? `VIEW AFFECTED PUROKS` : 'ALERT BARANGAY TANOD'}
                        </button>
                    </div>
                ))}
            </div>
        </aside>
    );
}
