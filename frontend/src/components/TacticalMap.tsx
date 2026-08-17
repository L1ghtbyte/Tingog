import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Polyline, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";

import { getPurokDetail } from "../api/client";
import type { PurokDetailOut, PurokOut } from "../api/types";
import { useTingog } from "../context/TingogContext";
import { DeliveryAction } from "./DeliveryAction";

// "OK" is the UI-facing name for the fifth button. The wire protocol and backend
// still use "LUWAS" (matches the real hardware silkscreen/firmware) — this filter
// key is purely a frontend UI concept with no backend coupling, so it's safe to
// rename independently. See ARCHITECTURE.md §4 for why the display name changed.
export type MapFilter = "ALL" | "CRITICAL" | "NEEDS" | "SILENT" | "OK";

interface TacticalMapProps {
    filter: MapFilter;
    onFilterChange: (filter: MapFilter) => void;
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

// status and severity are two different fields answering two different questions
// ("have we heard from them" vs. "how urgent is what they're reporting") — shown as
// separate labeled lines below, each with its own color, instead of one "STATUS:"
// line jamming both together as "STABLE / low", which read ambiguously as if "low"
// were qualifying stability itself rather than naming a separate field.
const SEVERITY_TEXT_COLOR: Record<PurokOut["severity"], string> = {
    low: "text-green-400",
    medium: "text-amber-400",
    high: "text-red-400",
};

function createMarkerIcon(purok: PurokOut, isRecentlyPressed: boolean): L.DivIcon {
    const isCritical = purok.active_needs.includes("TABANG");
    // Uniform marker shape regardless of is_simulated — the simulated/real distinction
    // (both the text badge and this shape split) was deliberately removed from the UI;
    // is_simulated stays real in the DB/API, just no longer surfaced visually here.
    //
    // Two independent rings, deliberately different in size/color so they're never
    // confused: the red ring means "TABANG is currently an active need" (persists as
    // long as that's true). The larger amber ring means "a new event just landed on
    // this purok" (fades after a few seconds) — this is the guaranteed, filter- and
    // popup-independent signal that something happened here, requested directly:
    // relying solely on the popup opening wasn't a reliable enough "this is active".
    const html = `
        <div class="relative w-4 h-4 rounded-full border-2 ${STATUS_COLOR[purok.status]}">
            ${isCritical ? '<div class="absolute inset-0 rounded-full border-2 border-red-500 animate-ping opacity-75"></div>' : ""}
            ${isRecentlyPressed ? '<div class="absolute -inset-2.5 rounded-full border-[3px] border-amber-300 animate-ping opacity-90"></div>' : ""}
        </div>
    `;
    return L.divIcon({ html, className: "tingog-marker-icon", iconSize: [16, 16], iconAnchor: [8, 8] });
}

// English gloss shown alongside each Bisaya need-button name — local relevance
// without asking judges (or coordinators) to already know Bisaya.
const NEED_TRANSLATIONS: Record<string, string> = {
    TABANG: "Help",
    TUBIG: "Water",
    TAMBAL: "Medicine",
    PAGKAON: "Food",
};

function formatNeed(need: string): string {
    const translation = NEED_TRANSLATIONS[need];
    return translation ? `${need} (${translation})` : need;
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
//
// Focus is a one-shot command, not a persistent "keep this centered" state: nothing
// ever cleared focusedPurokId after use, and `puroks` gets a new array reference on
// every ~5s poll — so this effect was re-running (and re-flying) on every single poll
// tick for as long as a purok had ever been focused, fighting any manual panning in
// between. Resetting focusedPurokId back to null right after firing makes it fire
// exactly once per click.
const FOCUS_ZOOM = 16;
// Leaflet popups open upward from their marker — centering the marker dead-center in
// the viewport pushes the popup's top edge under the header/KPI strip. Instead of
// flying to the marker's real coordinate, fly to a point offset north of it by this
// many screen pixels, so the marker (and its popup, opening above it) end up lower on
// screen with real headroom above.
const POPUP_HEADROOM_PX = 160;

// Single consolidated handler for EVERY way a purok can get focused — a marker click,
// "VIEW ON MAP" on an escalation card, AISitRep's referenced-purok chips, or a fresh
// live event. All of them just call setFocusedPurokId; this is the one place that
// turns that into "fly there, make sure it's not hidden by a filter, open its popup" —
// previously only the fresh-event path did the filter-reset-and-popup-open part, which
// is why "VIEW ON MAP" flew to the purok but never actually opened its card.
function FocusController({
    puroks, markerRefs, filter, onFilterChange,
}: {
    puroks: PurokOut[];
    markerRefs: React.MutableRefObject<Record<number, L.Marker>>;
    filter: MapFilter;
    onFilterChange: (filter: MapFilter) => void;
}) {
    const map = useMap();
    const { focusedPurokId, setFocusedPurokId } = useTingog();
    const pendingPopupIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (focusedPurokId === null) return;
        const purok = puroks.find((p) => p.id === focusedPurokId);
        if (purok) {
            const markerPoint = map.project([purok.latitude, purok.longitude], FOCUS_ZOOM);
            const offsetTarget = map.unproject(markerPoint.subtract([0, POPUP_HEADROOM_PX]), FOCUS_ZOOM);
            map.flyTo(offsetTarget, FOCUS_ZOOM, { duration: 0.75 });
            pendingPopupIdRef.current = focusedPurokId;
            // A filtered-out purok has no rendered marker yet, so its ref won't exist
            // this render — reset to "ALL" so one appears, and let the effect below
            // catch it once it does (may be the next render, not this one).
            if (filter !== "ALL") onFilterChange("ALL");
        }
        setFocusedPurokId(null);
    }, [focusedPurokId, puroks, map, setFocusedPurokId, filter, onFilterChange]);

    // Runs after every render (deliberately no dependency array) — opens the queued
    // popup the moment its marker ref actually exists.
    useEffect(() => {
        const id = pendingPopupIdRef.current;
        if (id !== null && markerRefs.current[id]) {
            markerRefs.current[id].openPopup();
            pendingPopupIdRef.current = null;
        }
    });

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

const PULSE_DURATION_MS = 4000;

export function TacticalMap({ filter, onFilterChange, isDarkMode, mapStyle }: TacticalMapProps) {
    const { puroks, clusters, setFocusedPurokId } = useTingog();
    const [detailById, setDetailById] = useState<Record<number, PurokDetailOut>>({});
    const [now, setNow] = useState(() => Date.now());
    const [recentlyPressedIds, setRecentlyPressedIds] = useState<Set<number>>(new Set());
    const markerRefs = useRef<Record<number, L.Marker>>({});
    const lastEventAtRef = useRef<Record<number, string | null | undefined>>({});
    const hasLoadedOnceRef = useRef(false);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // A fresh press should feel exactly like clicking that marker — same fly-to, same
    // popup opening with full details — not a subtle color change someone has to notice
    // on their own. Detected by last_event_at actually changing since the previous poll.
    // The actual fly-to/filter-reset/popup-open behavior lives in FocusController now
    // (shared by every focus trigger, not just this one) — this effect only decides
    // *when* a fresh event happened and hands off to setFocusedPurokId, plus drives the
    // guaranteed pulse ring, which stays independent of focus entirely.
    //
    // Suppressing this on true initial page load (so every existing marker doesn't
    // flash open at once) has to be a ONE-TIME flag, not "have I seen this purok id
    // before" — a per-purok check also silently suppressed a brand-new purok's very
    // first-ever press (e.g. a real device registering mid-session for the first time),
    // since that purok's first sighting looks identical to "just loaded" either way.
    useEffect(() => {
        puroks.forEach((p) => {
            const previous = lastEventAtRef.current[p.id];
            const isFirstSightingOfThisPurok = previous === undefined;
            const hasFreshEvent = p.last_event_at !== null && p.last_event_at !== previous;
            const shouldFire = hasFreshEvent && (!isFirstSightingOfThisPurok || hasLoadedOnceRef.current);
            if (shouldFire) {
                // Guaranteed signal, independent of filters or whether the popup manages
                // to open: the marker itself pulses. This is the fix for "there should be
                // activity on the map tied to every event, not something subtle" — it
                // doesn't depend on the popup/filter machinery at all.
                setRecentlyPressedIds((prev) => new Set(prev).add(p.id));
                setTimeout(() => {
                    setRecentlyPressedIds((prev) => {
                        if (!prev.has(p.id)) return prev;
                        const next = new Set(prev);
                        next.delete(p.id);
                        return next;
                    });
                }, PULSE_DURATION_MS);

                setFocusedPurokId(p.id);
            }
            lastEventAtRef.current[p.id] = p.last_event_at;
        });
        hasLoadedOnceRef.current = true;
    }, [puroks, setFocusedPurokId]);

    const filteredPuroks = puroks.filter((p) => {
        if (filter === "ALL") return true;
        if (filter === "CRITICAL") return p.active_needs.includes("TABANG");
        if (filter === "NEEDS") return p.active_needs.some((n) => n !== "TABANG") && !p.active_needs.includes("TABANG");
        if (filter === "SILENT") return p.status === "unknown";
        // "All clear" — a real stable status with nothing currently reported, not a
        // client-side reconstruction of the LUWAS press itself (no hours_since_heartbeat
        // field exists to derive it from anyway).
        if (filter === "OK") return p.active_needs.length === 0 && p.status === "stable";
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
                <FocusController puroks={puroks} markerRefs={markerRefs} filter={filter} onFilterChange={onFilterChange} />
                <ResetViewBinding puroks={puroks} />

                {/* Label stays pinned to the cluster's actual map position (not a fixed
                    screen position) — moves/pans with the map, same as everything else
                    spatial here, just bigger and bolder than before for visibility. */}
                {clusterLines.map(({ cluster, points }) => (
                    <Polyline key={cluster.cluster_id} positions={points} pathOptions={{ color: "#F59E0B", weight: 4, dashArray: "8 6", opacity: 0.9 }}>
                        <Tooltip permanent direction="center" className="!bg-amber-500 !text-black !border-0 !text-[11px] !font-bold !px-2 !py-1">
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
                            icon={createMarkerIcon(p, recentlyPressedIds.has(p.id))}
                            ref={(instance) => {
                                if (instance) markerRefs.current[p.id] = instance;
                                else delete markerRefs.current[p.id];
                            }}
                            eventHandlers={{
                                click: () => setFocusedPurokId(p.id),
                                popupopen: () => handlePopupOpen(p),
                            }}
                        >
                            <Popup closeButton={false} className="tingog-popup" offset={[0, -10]}>
                                <div className="w-64 bg-surface-container-highest/95 border border-outline-variant backdrop-blur-md p-3 shadow-xl text-on-surface">
                                    <div className="flex justify-between items-start mb-2 border-b border-outline-variant pb-2 gap-2">
                                        <span className="text-label-caps font-label-caps font-bold tracking-widest">
                                            {p.name}
                                            <span className="ml-1 text-[9px] font-normal text-on-surface-variant">{p.device_id}</span>
                                        </span>
                                        <span className={`text-label-caps font-label-caps shrink-0 ${STATUS_TEXT_COLOR[p.status]}`}>
                                            {formatTime(p.last_event_at, now)}
                                        </span>
                                    </div>
                                    <div className="text-data-tabular font-data-tabular space-y-1 mb-2">
                                        <div>
                                            <span className="text-on-surface-variant">STATUS:</span>{" "}
                                            <span className={`font-bold ${STATUS_TEXT_COLOR[p.status]}`}>{p.status.toUpperCase()}</span>
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">SEVERITY:</span>{" "}
                                            <span className={`font-bold ${SEVERITY_TEXT_COLOR[p.severity]}`}>{p.severity.toUpperCase()}</span>
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">NEEDS:</span>{" "}
                                            {p.active_needs.length > 0 ? p.active_needs.map(formatNeed).join(", ") : "none reported"}
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">LEADER:</span> {p.purok_leader ?? "unset"}
                                        </div>
                                        <div>
                                            <span className="text-on-surface-variant">NO. OF HOUSEHOLDS:</span> {p.baseline_household_count}
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
