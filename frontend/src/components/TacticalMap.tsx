import { useEffect, useState } from 'react';
import { useTingog, type Purok } from '../context/TingogContext';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapFilter = 'ALL' | 'CRITICAL' | 'NEEDS' | 'SILENT' | 'LUWAS';

interface TacticalMapProps {
    filter: MapFilter;
    isDarkMode: boolean;
    mapStyle: 'humanitarian' | 'minimal';
}

type MapWindow = Window & { resetMapView?: () => void };

function MapController() {
    const map = useMap();

    useEffect(() => {
        const mapWindow = window as MapWindow;
        const resetMapView = () => map.setView([11.0500, 124.0040], 15);

        mapWindow.resetMapView = resetMapView;
        return () => {
            if (mapWindow.resetMapView === resetMapView) {
                delete mapWindow.resetMapView;
            }
        };
    }, [map]);

    return null;
}

export function TacticalMap({ filter, isDarkMode, mapStyle }: TacticalMapProps) {
    const { puroks, dispatchResponse } = useTingog();

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
        if (filter === 'LUWAS') return p.active_needs.length === 0 && p.status !== 'unknown' && p.hours_since_heartbeat <= 6;
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

    const getMapUrl = () => {
        if (mapStyle === 'humanitarian') {
            return "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
        }
        return isDarkMode 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    };

    const getMapAttribution = () => {
        if (mapStyle === 'humanitarian') {
            return '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OpenStreetMap France';
        }
        return '&copy; <a href="https://carto.com/attributions">CARTO</a>';
    };

    const getMapClass = () => {
        if (mapStyle === 'minimal') {
            return isDarkMode ? "map-dark-minimal" : "map-light";
        }
        return isDarkMode ? "map-dark" : "map-light";
    };

    return (
        <main className="absolute inset-0 z-0 isolate overflow-hidden bg-surface-container select-none cursor-default">
            <MapContainer 
                center={[11.0500, 124.0040]} // Centered around Bogo, Cebu
                zoom={15} 
                style={{ width: '100%', height: '100%' }}
                zoomControl={false} // We will use our custom zoom controls if needed or none
                attributionControl={false} // Hide the leaflet watermark/attribution for cleaner UI
            >
                <TileLayer
                    key={`${mapStyle}-${isDarkMode ? 'dark' : 'light'}`}
                    url={getMapUrl()}
                    attribution={getMapAttribution()}
                    className={getMapClass()}
                />
                <MapController />

                {filteredPuroks.map(p => {
                    const isCritical = p.active_needs.includes('TABANG');
                    
                    return (
                        <Marker 
                            key={p.id} 
                            position={[p.coordinates.lat, p.coordinates.lng]}
                            icon={createCustomIcon(p)}
                        >
                            {/* We use Popup for the details instead of absolute divs */}
                            <Popup 
                                closeButton={false} 
                                className="custom-popup" 
                                offset={[0, -10]}
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
        </main>
    );
}
