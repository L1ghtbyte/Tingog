/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import {
    getClusters,
    getEscalations,
    getPuroks,
    getRecentEvents,
    logDelivery as apiLogDelivery,
    simulateEarthquake as apiSimulateEarthquake,
} from "../api/client";
import type { ClusterOut, EscalationOut, NeedButton, PurokOut, RecentEventOut } from "../api/types";

// A UI refresh cadence — deliberately distinct from the backend's own ~1.5s
// device-ingestion poll (ARCHITECTURE.md §6 draws the same distinction). This is just
// "how often does the dashboard ask the backend for the current picture," unrelated to
// how the backend itself hears about a button press.
const POLL_INTERVAL_MS = 5000;

// Matches backend/app/routers/admin.py's EARTHQUAKE_STEPS * EARTHQUAKE_STEP_SECONDS —
// used only to size the local "DEMO SEQUENCE RUNNING" banner timer, not to control the
// actual sequence (that runs entirely server-side, through the real pipeline).
const EARTHQUAKE_DURATION_MS = 18000;

interface TingogContextType {
    puroks: PurokOut[];
    escalations: EscalationOut[];
    clusters: ClusterOut[];
    recentEvents: RecentEventOut[];
    lastUpdated: Date | null;
    isStale: boolean;
    logDelivery: (purokId: number, items: NeedButton[], deliveredBy?: string) => Promise<void>;
    isSimulating: boolean;
    triggerEarthquake: () => Promise<void>;
    earthquakeError: string | null;
    focusedPurokId: number | null;
    setFocusedPurokId: (id: number | null) => void;
}

const TingogContext = createContext<TingogContextType | undefined>(undefined);

export function TingogProvider({ children }: { children: ReactNode }) {
    const [puroks, setPuroks] = useState<PurokOut[]>([]);
    const [escalations, setEscalations] = useState<EscalationOut[]>([]);
    const [clusters, setClusters] = useState<ClusterOut[]>([]);
    const [recentEvents, setRecentEvents] = useState<RecentEventOut[]>([]);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [isStale, setIsStale] = useState(false);
    const [isSimulating, setIsSimulating] = useState(false);
    const [earthquakeError, setEarthquakeError] = useState<string | null>(null);
    const [focusedPurokId, setFocusedPurokId] = useState<number | null>(null);
    const earthquakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const poll = useCallback(async () => {
        try {
            const [nextPuroks, nextEscalations, nextClusters, nextRecentEvents] = await Promise.all([
                getPuroks(),
                getEscalations(),
                getClusters(),
                getRecentEvents(),
            ]);
            setPuroks(nextPuroks);
            setEscalations(nextEscalations);
            setClusters(nextClusters);
            setRecentEvents(nextRecentEvents);
            setLastUpdated(new Date());
            setIsStale(false);
        } catch {
            // Backend briefly unreachable — keep showing the last-known data instead of
            // blanking the screen; just flag it so the UI can say so.
            setIsStale(true);
        }
    }, []);

    useEffect(() => {
        // Fetch-on-mount-then-poll is a standard, valid effect pattern; poll()'s setState
        // calls happen after an await inside its own try/catch, not synchronously here.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        poll();
        const interval = setInterval(poll, POLL_INTERVAL_MS);
        return () => clearInterval(interval);
    }, [poll]);

    const logDelivery = useCallback(
        async (purokId: number, items: NeedButton[], deliveredBy?: string) => {
            await apiLogDelivery(purokId, { items, delivered_by: deliveredBy });
            await poll(); // reflect the real result immediately, not on the next 5s tick
        },
        [poll],
    );

    const triggerEarthquake = useCallback(async () => {
        setEarthquakeError(null);
        if (!puroks.some((p) => p.is_simulated)) {
            // The sequence only ever touches is_simulated puroks (real ones are never
            // faked) — with none seeded yet it would return 200 and visibly do nothing,
            // which is indistinguishable from a broken button. Catch that here instead.
            setEarthquakeError("No simulated puroks exist yet — seed demo data first (POST /api/seed-simulated).");
            return;
        }
        try {
            const result = await apiSimulateEarthquake();
            setIsSimulating(true);
            if (earthquakeTimerRef.current) clearTimeout(earthquakeTimerRef.current);
            earthquakeTimerRef.current = setTimeout(
                () => setIsSimulating(false),
                (result.duration_seconds ?? 18) * 1000 || EARTHQUAKE_DURATION_MS,
            );
        } catch {
            // A failed request must never look identical to "nothing happened" — always
            // surface it, same reasoning as poll()'s isStale flag.
            setEarthquakeError("Could not start the demo sequence — the backend may be unreachable.");
        }
    }, [puroks]);

    useEffect(() => {
        return () => {
            if (earthquakeTimerRef.current) clearTimeout(earthquakeTimerRef.current);
        };
    }, []);

    return (
        <TingogContext.Provider
            value={{
                puroks,
                escalations,
                clusters,
                recentEvents,
                lastUpdated,
                isStale,
                logDelivery,
                isSimulating,
                triggerEarthquake,
                earthquakeError,
                focusedPurokId,
                setFocusedPurokId,
            }}
        >
            {children}
        </TingogContext.Provider>
    );
}

export function useTingog() {
    const context = useContext(TingogContext);
    if (context === undefined) {
        throw new Error("useTingog must be used within a TingogProvider");
    }
    return context;
}
