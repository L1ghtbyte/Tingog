import { useState, useRef, useEffect } from 'react';
import { useTingog, type Purok } from '../context/TingogContext';

type MapFilter = 'ALL' | 'CRITICAL' | 'NEEDS' | 'SILENT';

export function TacticalMap() {
    const { puroks, dispatchResponse } = useTingog();
    const [filter, setFilter] = useState<MapFilter>('ALL');
    const [selectedPurokId, setSelectedPurokId] = useState<string | null>(null);

    // Pan & Zoom State
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const mapRef = useRef<HTMLDivElement>(null);
    
    // Live time for relative timestamps
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    const filteredPuroks = puroks.filter(p => {
        if (filter === 'ALL') return true;
        if (filter === 'CRITICAL') return p.active_needs.includes('TABANG');
        if (filter === 'NEEDS') return p.active_needs.some(n => ['TUBIG', 'TAMBAL', 'PAGKAON'].includes(n)) && !p.active_needs.includes('TABANG');
        if (filter === 'SILENT') return p.status === 'unknown' || p.hours_since_heartbeat > 6;
        return true;
    });

    const getPinStyle = (p: Purok) => {
        if (p.active_needs.includes('TABANG')) return 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] border-white';
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
        const diffMs = now - date.getTime();
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

    // Pan & Zoom Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return; // Only left click
        setIsDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) {
            setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
        }
    };

    const handleMouseUp = () => setIsDragging(false);

    const handleWheel = (e: WheelEvent) => {
        e.preventDefault();
        const zoomSensitivity = 0.001;
        setZoom(z => Math.max(0.5, Math.min(3, z - e.deltaY * zoomSensitivity)));
    };

    useEffect(() => {
        const mapEl = mapRef.current;
        if (mapEl) {
            mapEl.addEventListener('wheel', handleWheel, { passive: false });
            return () => mapEl.removeEventListener('wheel', handleWheel);
        }
    }, []);

    const resetView = () => {
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };

    const filterOptions: MapFilter[] = ['ALL', 'CRITICAL', 'NEEDS', 'SILENT'];

    return (
        <main 
            ref={mapRef}
            className="flex-1 min-h-[400px] lg:min-h-0 bg-surface-container border border-outline-variant rounded-sm relative flex flex-col overflow-hidden select-none cursor-default" 
            onClick={() => setSelectedPurokId(null)}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {/* Filters */}
            <div className="absolute top-3 left-3 z-30 flex flex-wrap gap-3 pointer-events-none">
                {filterOptions.map(f => (
                    <button 
                        key={f}
                        onClick={(e) => { e.stopPropagation(); setFilter(f); }} 
                        className={`pointer-events-auto bg-surface-container/90 border px-4 py-1.5 transition-colors transform skew-x-[12deg] ${filter === f ? (f === 'CRITICAL' ? 'border-red-500' : f === 'NEEDS' ? 'border-amber-500' : f === 'SILENT' ? 'border-[#64748B]' : 'border-primary') : 'border-outline-variant hover:border-on-surface-variant'}`}
                    >
                        <span className={`inline-block transform -skew-x-[12deg] text-label-caps font-label-caps font-bold tracking-widest ${filter === f ? (f === 'CRITICAL' ? 'text-red-500' : f === 'NEEDS' ? 'text-amber-500' : f === 'SILENT' ? 'text-[#64748B]' : 'text-primary') : 'text-on-surface-variant'}`}>
                            {f}
                        </span>
                    </button>
                ))}
            </div>

            {/* Map Canvas (Pans & Zooms) */}
            <div className="absolute inset-0 transition-transform duration-75 origin-center" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
                
                {/* Background Grid & Restored Map Image */}
                <div className="absolute inset-[-50%] tactical-grid"></div>
                <div className="absolute inset-[-50%] bg-cover bg-center opacity-25 grayscale dark:invert-0 invert pointer-events-none" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAkCQbXPMsVBQJxDssNyKnJukItvzocrJBwsMoV39ktms3K-nvSMAB3uoJXpc_oPJLYAiZfvH3XXbXGGZZiSsj0lOhJy3JkLsZhpXw-rDyp6Kuw-bAUDuoEOMm_Ms5VD8pi5Ifr0DmTyj4yZXHierqvtZvKLI-hSByXIkrtII4BHiJeeg3_-fczPDp8uPKGokfekb0thtpsN54wufHcGPRRIhks1s_C4oU6bQJToC_f5EgUAPMofvM6')" }}></div>
                
                {/* Connection Lines (Simulated Star Topology to center Gateway) */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                    {filteredPuroks.map(p => (
                        <line key={`line-${p.id}`} x1="50%" y1="50%" x2={`${p.coordinates.x}%`} y2={`${p.coordinates.y}%`} stroke="var(--color-primary)" strokeWidth="1" strokeDasharray="4 4" />
                    ))}
                    <circle cx="50%" cy="50%" r="4" fill="var(--color-primary)" />
                </svg>

                {/* Nodes */}
                {filteredPuroks.map(p => {
                    const isSelected = p.id === selectedPurokId;
                    const isCritical = p.active_needs.includes('TABANG');
                    
                    return (
                        <div key={p.id} className="absolute group" style={{ top: `${p.coordinates.y}%`, left: `${p.coordinates.x}%`, transform: 'translate(-50%, -50%)' }}>
                            <div 
                                onClick={(e) => handlePinClick(p.id, e)}
                                className={`relative w-4 h-4 rotate-45 border cursor-pointer z-20 hover:scale-125 transition-transform ${getPinStyle(p)}`}
                            >
                                {isCritical && <div className="absolute inset-0 rounded-full border border-red-500 animate-ping opacity-75"></div>}
                            </div>

                            {isSelected && (
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-surface-container-highest/95 border border-outline-variant backdrop-blur-md p-3 opacity-100 z-30 shadow-xl" style={{ transform: `scale(${1/zoom})`, transformOrigin: 'bottom center' }} onClick={e => e.stopPropagation()}>
                                    <div className="flex justify-between items-start mb-2 border-b border-outline-variant pb-2">
                                        <span className="text-label-caps font-label-caps text-on-surface font-bold tracking-widest">{p.device_id}: {p.name}</span>
                                        <span className={`text-label-caps font-label-caps ${getPinTextColor(p)} ${isCritical ? 'animate-pulse' : ''}`}>{formatTime(p.last_event_at)}</span>
                                    </div>
                                    <div className="text-data-tabular font-data-tabular text-on-surface space-y-1 mb-3">
                                        <div><span className="text-on-surface-variant">STATUS:</span> {getNeedLabel(p)}</div>
                                        <div><span className="text-on-surface-variant">VULN HH:</span> {p.baseline_vulnerable_count} / {p.baseline_household_count}</div>
                                        <div><span className="text-on-surface-variant">BATTERY:</span> {p.battery_pct}%</div>
                                    </div>
                                    {p.active_needs.length > 0 && (
                                        <button 
                                            onClick={() => {
                                                dispatchResponse(p.id);
                                                setSelectedPurokId(null);
                                            }}
                                            className="w-full bg-primary-container text-black font-bold text-label-caps font-label-caps py-2 hover:bg-primary transition-colors transform skew-x-[12deg]">
                                            <span className="inline-block transform -skew-x-[12deg] tracking-widest">{isCritical ? 'DISPATCH RESPONSE' : 'MARK RESOLVED'}</span>
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Zoom Controls */}
            <div className="absolute bottom-3 right-3 z-30 flex flex-col gap-2 pointer-events-none">
                <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(3, z + 0.5)); }} className="pointer-events-auto w-10 h-10 rounded-full bg-surface-container/90 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm transition-colors shadow-lg"><span className="font-bold text-lg leading-none">+</span></button>
                <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.5, z - 0.5)); }} className="pointer-events-auto w-10 h-10 rounded-full bg-surface-container/90 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm transition-colors shadow-lg"><span className="font-bold text-lg leading-none">-</span></button>
                <button onClick={(e) => { e.stopPropagation(); resetView(); }} className="pointer-events-auto mt-1 w-10 h-10 rounded-full bg-surface-container/90 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm transition-colors shadow-lg"><span className="material-symbols-outlined text-lg">my_location</span></button>
            </div>
        </main>
    );
}
