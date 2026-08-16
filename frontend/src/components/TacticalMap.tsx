import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import { getPurokDetail } from "../api/client";
import type { PurokDetailOut, PurokOut } from "../api/types";
import { useTingog } from "../context/TingogContext";
import { DeliveryAction } from "./DeliveryAction";

export type MapFilter = "ALL" | "CRITICAL" | "NEEDS" | "SILENT" | "LUWAS";

interface TacticalMapProps {
    filter: MapFilter;
    isDarkMode: boolean;
    mapStyle: "humanitarian" | "minimal";
}

const STATUS_COLOR: Record<PurokOut["status"], string> = {
    unknown: "bg-[#64748B] border-[#334155]",
    attention: "bg-amber-500 border-white",
    stable: "bg-green-500 border-white",
};

const STATUS_TEXT_COLOR: Record<PurokOut["status"], string> = {
    unknown: "text-[#64748B]",
    attention: "text-amber-400",
    stable: "text-green-400",
};

function createMarkerIcon(purok: PurokOut): L.DivIcon {
    const isCritical = purok.active_needs.includes("TABANG");
    // Real devices render as a diamond, simulated ones as a circle — a second,
    // shape-based signal on top of the [SIMULATED] text badge in the popup, so it's
    // legible even before a marker is clicked (same hard requirement as the card badge).
    const shapeClass = purok.is_simulated ? "rounded-full" : "rotate-45";
    const html = `
        <div class="relative w-4 h-4 ${shapeClass} border-2 ${STATUS_COLOR[purok.status]}">
            ${isCritical ? '<div class="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></div>' : ""}
        </div>
    `;
    return L.divIcon({ html, className: "tingog-marker-icon", iconSize: [16, 16], iconAnchor: [8, 8] });
}

function formatTime(iso: string | null, now: number): string {
    if (!iso) return "no contact yet";
    const diffMs = now - new Date(iso).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    return `${diffHrs}h ${diffMins % 60}m ago`;
}

// Watches context's focusedPurokId (set by AISitRep's escalation list / claim chips)
// and pans/zooms the map to it — only usable inside <MapContainer>, hence a sub-component.
function FocusController({ puroks }: { puroks: PurokOut[] }) {
    const map = useMap();
    const { focusedPurokId } = useTingog();

    useEffect(() => {
        if (focusedPurokId === null) return;
        const purok = puroks.find((p) => p.id === focusedPurokId);
        if (purok) map.flyTo([purok.latitude, purok.longitude], 16, { duration: 0.75 });
    }, [focusedPurokId, puroks, map]);

    return null;
}

function fitToPuroks(map: L.Map, puroks: PurokOut[]) {
    if (puroks.length === 0) return;
    const bounds = L.latLngBounds(puroks.map((p) => [p.latitude, p.longitude] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50] });
}

function FitBoundsOnce({ puroks }: { puroks: PurokOut[] }) {
    const map = useMap();
    const hasFit = useRef(false);

    useEffect(() => {
        if (hasFit.current || puroks.length === 0) return;
        fitToPuroks(map, puroks);
        hasFit.current = true;
    }, [puroks, map]);

    return null;
}

// App.tsx's floating panel has its own "reset view" button (it can't call useMap()
// directly since it's outside the map tree) — expose the real fit-to-puroks behavior as
// a window global it can call, same pattern as the reference dashboard redesign.
type MapWindow = Window & { resetMapView?: () => void };

function ResetViewBinding({ puroks }: { puroks: PurokOut[] }) {
    const map = useMap();

    useEffect(() => {
        const mapWindow = window as MapWindow;
        const resetMapView = () => fitToPuroks(map, puroks);
        mapWindow.resetMapView = resetMapView;
        return () => {
            if (mapWindow.resetMapView === resetMapView) delete mapWindow.resetMapView;
        };
    }, [map, puroks]);

    return null;
}

export function TacticalMap({ filter, isDarkMode, mapStyle }: TacticalMapProps) {
    const { puroks, clusters, setFocusedPurokId } = useTingog();
    const [detailById, setDetailById] = useState<Record<number, PurokDetailOut>>({});
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    const filteredPuroks = puroks.filter((p) => {
        if (filter === "ALL") return true;
        if (filter === "CRITICAL") return p.active_needs.includes("TABANG");
        if (filter === "NEEDS") return p.active_needs.some((n) => n !== "TABANG") && !p.active_needs.includes("TABANG");
        if (filter === "SILENT") return p.status === "unknown";
        // "All clear" — a real stable status with nothing currently reported, not a
        // client-side reconstruction of the LUWAS press itself (no hours_since_heartbeat
        // field exists to derive it from anyway).
        if (filter === "LUWAS") return p.active_needs.length === 0 && p.status === "stable";
        return true;
    });

    const handlePopupOpen = async (purok: PurokOut) => {
        if (detailById[purok.id]) return;
        try {
            const detail = await getPurokDetail(purok.id);
            setDetailById((prev) => ({ ...prev, [purok.id]: detail }));
        } catch {
            // Popup still renders with list-level data if the detail fetch fails.
        }
    };

    // Resolve each cluster's purok NAMES (the only thing get_active_clusters returns)
    // against the currently-fetched purok list to get real coordinates for the overlay.
    const clusterLines = useMemo(() => {
        const byName = new Map(puroks.map((p) => [p.name, p]));
        return clusters
            .map((cluster) => {
                const points = cluster.puroks
                    .map((name) => byName.get(name))
                    .filter((p): p is PurokOut => Boolean(p))
                    .map((p) => [p.latitude, p.longitude] as [number, number]);
                return { cluster, points };
            })
            .filter((c) => c.points.length >= 2);
    }, [clusters, puroks]);

    const initialCenter: [number, number] = puroks.length > 0 ? [puroks[0].latitude, puroks[0].longitude] : [10.999, 123.9311];

    // Humanitarian OSM tiles show real street/place detail; the "minimal" style uses
    // CSS filters over CartoDB's light/dark base tiles for a cleaner tactical look —
    // both are still real OpenStreetMap data underneath.
    const getMapUrl = () => {
        if (mapStyle === "humanitarian") {
            return "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png";
        }
        return isDarkMode
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    };

    const getMapAttribution = () => {
        if (mapStyle === "humanitarian") {
            return '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OpenStreetMap France';
        }
        return '&copy; <a href="https://carto.com/attributions">CARTO</a>';
    };

    const getMapClass = () => {
        if (mapStyle === "minimal") {
            return isDarkMode ? "map-dark-minimal" : "map-light";
        }
        return isDarkMode ? "map-dark" : "map-light";
    };

    return (
        <main className="absolute inset-0 z-0 isolate overflow-hidden bg-surface-container select-none cursor-default">
            <MapContainer
                center={initialCenter}
                zoom={14}
                style={{ width: "100%", height: "100%" }}
                zoomControl={false}
                attributionControl={false}
            >
                <TileLayer
                    key={`${mapStyle}-${isDarkMode ? "dark" : "light"}`}
                    url={getMapUrl()}
                    attribution={getMapAttribution()}
                    className={getMapClass()}
                />
                <FitBoundsOnce puroks={puroks} />
                <FocusController puroks={puroks} />
                <ResetViewBinding puroks={puroks} />

                {clusterLines.map(({ cluster, points }) => (
                    <Polyline key={cluster.cluster_id} positions={points} pathOptions={{ color: "#F59E0B", weight: 2, dashArray: "6 6", opacity: 0.7 }}>
                        <Tooltip permanent direction="center" className="!bg-amber-500/90 !text-black !border-0 !text-[10px] !font-bold">
                            {cluster.need_type} cluster — {cluster.puroks.length} puroks, {cluster.confidence}% confidence
                        </Tooltip>
                    </Polyline>
                ))}

                {filteredPuroks.map((p) => {
                    const detail = detailById[p.id];
                    return (
                        <Marker
                            key={p.id}
                            position={[p.latitude, p.longitude]}
                            icon={createMarkerIcon(p)}
                            eventHandlers={{
                                click: () => setFocusedPurokId(p.id),
                                popupopen: () => handlePopupOpen(p),
                            }}
                        >
                            <Popup closeButton={false} className="tingog-popup" offset={[0, -10]}>
                                <div className="w-64 bg-surface-container-highest/95 border border-outline-variant backdrop-blur-md p-3 shadow-xl text-on-surface">
                                    <div className="flex justify-between items-start mb-2 border-b border-outline-variant pb-2 gap-2">
                                        <span className="text-label-caps font-label-caps font-bold tracking-widest">
                                            {p.device_id}: {p.name}
                                            {p.is_simulated && <span className="ml-1 text-[9px] text-on-surface-variant">[SIMULATED]</span>}
                                        </span>
                                        <span className={`text-label-caps font-label-caps shrink-0 ${STATUS_TEXT_COLOR[p.status]}`}>
                                            {formatTime(p.last_event_at, now)}
                                        </span>
                                    </div>
                                    <div className="text-data-tabular font-data-tabular space-y-1 mb-2">
                                        <div>
                                            <span className="text-on-surface-variant">STATUS:</span>{" "}
                                            <span className={`font-bold ${STATUS_TEXT_COLOR[p.status]}`}>{p.status.toUpperCase()}</span> / {p.severity}
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">NEEDS:</span>{" "}
                                            {p.active_needs.length > 0 ? p.active_needs.join(", ") : "none reported"}
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">LEADER:</span> {p.purok_leader ?? "unset"}
                                        </div>
                                        {p.severity_reasons.length > 0 && (
                                            <div>
                                                <span className="text-on-surface-variant">WHY:</span> {p.severity_reasons.join("; ")}
                                            </div>
                                        )}
                                        {detail && detail.deliveries.length > 0 && (
                                            <div>
                                                <span className="text-on-surface-variant">LAST DELIVERY:</span>{" "}
                                                {detail.deliveries[detail.deliveries.length - 1].items.join(", ")} (
                                                {formatTime(detail.deliveries[detail.deliveries.length - 1].delivered_at, now)})
                                            </div>
                                        )}
                                    </div>
                                    <DeliveryAction purok={p} />
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>
        </main>
    );
}
