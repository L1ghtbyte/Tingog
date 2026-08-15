import { useState, useRef, useEffect } from 'react';
import { useTingog, type Purok } from '../context/TingogContext';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type MapFilter = 'ALL' | 'CRITICAL' | 'NEEDS' | 'SILENT';

export function TacticalMap() {
    const { puroks, dispatchResponse } = useTingog();
    const [filter, setFilter] = useState<MapFilter>('ALL');
    const [selectedPurokId, setSelectedPurokId] = useState<string | null>(null);

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

    const filterOptions: MapFilter[] = ['ALL', 'CRITICAL', 'NEEDS', 'SILENT'];

    // Create a custom icon for Leaflet using our div structure
    const createCustomIcon = (p: Purok) => {
        const isCritical = p.active_needs.includes('TABANG');
        const style = getPinStyle(p);
        
        const html = `
            <div class="relative w-4 h-4 rotate-45 border cursor-pointer z-20 hover:scale-125 transition-transform ${style}">
                ${isCritical ? '<div class="absolute inset-0 rounded-full border border-red-500 animate-ping opacity-75"></div>' : ''}
            </div>
        `;

        return L.divIcon({
            html,
            className: 'custom-leaflet-icon',
            iconSize: [16, 16],
            iconAnchor: [8, 8], // Center of the 16x16 div
        });
    };

    // Sub-component to handle map reset
    function MapController() {
        const map = useMap();
        
        useEffect(() => {
            // Expose a way to reset view if needed
            (window as any).resetMapView = () => {
                map.setView([11.0500, 124.0040], 15);
            };
        }, [map]);

        return null;
    }

    return (
        <main className="flex-1 min-h-[400px] lg:min-h-0 bg-surface-container border border-outline-variant rounded-sm relative flex flex-col overflow-hidden select-none cursor-default">
            {/* Filters */}
            <div className="absolute top-3 left-3 z-[1000] flex flex-wrap gap-3 pointer-events-none">
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

            <MapContainer 
                center={[11.0500, 124.0040]} // Centered around Bogo, Cebu
                zoom={15} 
                style={{ width: '100%', height: '100%' }}
                zoomControl={false} // We will use our custom zoom controls if needed or none
            >
                {/* Dark mode friendly map tiles (CartoDB Dark Matter) */}
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <MapController />

                {filteredPuroks.map(p => {
                    const isCritical = p.active_needs.includes('TABANG');
                    
                    return (
                        <Marker 
                            key={p.id} 
                            position={[p.coordinates.lat, p.coordinates.lng]}
                            icon={createCustomIcon(p)}
                            eventHandlers={{
                                click: () => setSelectedPurokId(p.id)
                            }}
                        >
                            {/* We use Popup for the details instead of absolute divs */}
                            <Popup 
                                closeButton={false} 
                                className="custom-popup" 
                                offset={[0, -10]}
                                onOpen={() => setSelectedPurokId(p.id)}
                                onClose={() => setSelectedPurokId(null)}
                            >
                                <div className="w-64 bg-surface-container-highest/95 border border-outline-variant backdrop-blur-md p-3 shadow-xl">
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
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                dispatchResponse(p.id);
                                                setSelectedPurokId(null);
                                            }}
                                            className="w-full bg-primary-container text-black font-bold text-label-caps font-label-caps py-2 hover:bg-primary transition-colors transform skew-x-[12deg]">
                                            <span className="inline-block transform -skew-x-[12deg] tracking-widest">{isCritical ? 'DISPATCH RESPONSE' : 'MARK RESOLVED'}</span>
                                        </button>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Custom Zoom Controls to match previous design */}
            <div className="absolute bottom-3 right-3 z-[1000] flex flex-col gap-2 pointer-events-none">
                <button onClick={(e) => { e.stopPropagation(); (window as any).resetMapView?.(); }} className="pointer-events-auto mt-1 w-10 h-10 rounded-full bg-surface-container/90 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm transition-colors shadow-lg"><span className="material-symbols-outlined text-lg">my_location</span></button>
            </div>
        </main>
    );
}
