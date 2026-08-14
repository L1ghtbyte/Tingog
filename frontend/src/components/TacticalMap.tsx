import { useState } from 'react';
import { useTingog, type Purok } from '../context/TingogContext';

type MapFilter = 'ALL' | 'CRITICAL' | 'NEEDS' | 'SILENT';

export function TacticalMap() {
    const { puroks, dispatchResponse } = useTingog();
    const [filter, setFilter] = useState<MapFilter>('ALL');
    const [selectedPurokId, setSelectedPurokId] = useState<string | null>(null);

    const filteredPuroks = puroks.filter(p => {
        if (filter === 'ALL') return true;
        if (filter === 'CRITICAL') return p.active_needs.includes('TABANG');
        if (filter === 'NEEDS') return p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n)) && !p.active_needs.includes('TABANG');
        if (filter === 'SILENT') return p.status === 'unknown' || p.hours_since_heartbeat > 6;
        return true;
    });

    const getPinStyle = (p: Purok) => {
        if (p.active_needs.includes('TABANG')) return 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)] border-white';
        if (p.active_needs.length > 0) return 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.5)] border-white';
        if (p.status === 'unknown' || p.hours_since_heartbeat > 6) return 'bg-[#64748B] shadow-[0_0_10px_rgba(100,116,139,0.5)] border-[#334155]';
        return 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] border-white';
    };

    const getPinTextColor = (p: Purok) => {
        if (p.active_needs.includes('TABANG')) return 'text-red-400';
        if (p.active_needs.length > 0) return 'text-amber-400';
        if (p.status === 'unknown' || p.hours_since_heartbeat > 6) return 'text-[#64748B]';
        return 'text-green-400';
    };

    const getNeedLabel = (p: Purok) => {
        if (p.active_needs.includes('TABANG')) return <><span className="text-red-500 font-bold">TABANG (CRITICAL)</span></>;
        if (p.active_needs.length > 0) return <span className="text-amber-500 font-bold">{p.active_needs.join(', ')}</span>;
        if (p.status === 'unknown' || p.hours_since_heartbeat > 6) return <span className="text-[#64748B] font-bold">SILENT {p.hours_since_heartbeat}h</span>;
        return <span className="text-green-500 font-bold">LUWAS</span>;
    };

    const formatTime = (date: Date) => {
        const diffMs = Date.now() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;
        return `${diffHrs}h ${remMins}m ago`;
    };

    const handlePinClick = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedPurokId(id === selectedPurokId ? null : id);
    };

    return (
        <main className="flex-1 bg-surface-container border border-outline-variant rounded-sm relative flex flex-col overflow-hidden" onClick={() => setSelectedPurokId(null)}>
            <div className="absolute top-3 left-3 z-10 flex gap-2">
                <button onClick={() => setFilter('ALL')} className={`bg-surface-container/90 border px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors ${filter === 'ALL' ? 'border-primary text-primary' : 'border-outline-variant text-on-surface-variant hover:text-white'}`}>ALL</button>
                <button onClick={() => setFilter('CRITICAL')} className={`bg-surface-container/90 border px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors ${filter === 'CRITICAL' ? 'border-red-500 text-red-500' : 'border-outline-variant text-on-surface-variant hover:text-white'}`}>CRITICAL</button>
                <button onClick={() => setFilter('NEEDS')} className={`bg-surface-container/90 border px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors ${filter === 'NEEDS' ? 'border-amber-500 text-amber-500' : 'border-outline-variant text-on-surface-variant hover:text-white'}`}>NEEDS</button>
                <button onClick={() => setFilter('SILENT')} className={`bg-surface-container/90 border px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors ${filter === 'SILENT' ? 'border-[#64748B] text-[#64748B]' : 'border-outline-variant text-on-surface-variant hover:text-white'}`}>SILENT</button>
            </div>

            <div className="absolute inset-0 z-0 bg-background" style={{ backgroundImage: "radial-gradient(#334155 1px, transparent 1px)", backgroundSize: "24px 24px", opacity: 0.3 }}></div>
            <div className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen z-0 grayscale" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAkCQbXPMsVBQJxDssNyKnJukItvzocrJBwsMoV39ktms3K-nvSMAB3uoJXpc_oPJLYAiZfvH3XXbXGGZZiSsj0lOhJy3JkLsZhpXw-rDyp6Kuw-bAUDuoEOMm_Ms5VD8pi5Ifr0DmTyj4yZXHierqvtZvKLI-hSByXIkrtII4BHiJeeg3_-fczPDp8uPKGokfekb0thtpsN54wufHcGPRRIhks1s_C4oU6bQJToC_f5EgUAPMofvM6')" }}></div>

            <div className="absolute inset-0 z-10">
                {filteredPuroks.map(p => {
                    const isSelected = p.id === selectedPurokId;
                    const isCritical = p.active_needs.includes('TABANG');
                    
                    return (
                        <div key={p.id} className="absolute group" style={{ top: `${p.coordinates.y}%`, left: `${p.coordinates.x}%`, transform: 'translate(-50%, -50%)' }}>
                            <div 
                                onClick={(e) => handlePinClick(p.id, e)}
                                className={`relative w-4 h-4 rotate-45 border cursor-pointer z-20 hover:scale-125 transition-transform ${getPinStyle(p)}`}
                            >
                                {isCritical && <div className="absolute inset-0 rounded-full border border-red-500 pulse-ring"></div>}
                            </div>

                            {isSelected && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-surface-container-high/95 border border-outline-variant backdrop-blur-md p-3 opacity-100 z-30 shadow-xl" onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-label-caps font-label-caps text-white font-bold">{p.device_id}: {p.name}</span>
                                        <span className={`text-label-caps font-label-caps ${getPinTextColor(p)} ${isCritical ? 'animate-pulse' : ''}`}>{formatTime(p.last_event_at)}</span>
                                    </div>
                                    <div className="text-data-tabular font-data-tabular text-on-surface space-y-1 mb-3">
                                        <div><span className="text-on-surface-variant">Status:</span> {getNeedLabel(p)}</div>
                                        <div><span className="text-on-surface-variant">Vuln HH:</span> {p.baseline_vulnerable_count} / {p.baseline_household_count}</div>
                                        <div><span className="text-on-surface-variant">Batt:</span> {p.battery_pct}%</div>
                                    </div>
                                    {p.active_needs.length > 0 && (
                                        <button 
                                            onClick={() => {
                                                dispatchResponse(p.id);
                                                setSelectedPurokId(null);
                                            }}
                                            className="w-full bg-primary-container text-black font-bold text-label-caps font-label-caps py-2 hover:bg-primary transition-colors">
                                            {isCritical ? 'DISPATCH RESPONSE' : 'MARK RESOLVED'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm"><span className="material-symbols-outlined text-sm">add</span></button>
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm"><span className="material-symbols-outlined text-sm">remove</span></button>
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm mt-2"><span className="material-symbols-outlined text-sm">my_location</span></button>
            </div>
        </main>
    );
}
