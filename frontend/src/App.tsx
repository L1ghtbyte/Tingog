import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { KPIStrip } from './components/KPIStrip';
import { AISitRep } from './components/AISitRep';
import { EscalationPanel } from './components/EscalationPanel';
import { TacticalMap, type MapFilter } from './components/TacticalMap';
import { PacketStream } from './components/PacketStream';
import { ReliabilityPanel } from './components/ReliabilityPanel';

import { TingogProvider, useTingog } from './context/TingogContext';

function Dashboard() {
    const [isBriefingMinimized, setIsBriefingMinimized] = useState(false);
    const [isReportsMinimized, setIsReportsMinimized] = useState(false);
    const [isReliabilityOpen, setIsReliabilityOpen] = useState(false);
    const [mapFilter, setMapFilter] = useState<MapFilter>('ALL');
    const [seenEscalationCount, setSeenEscalationCount] = useState(0);
    const [seenEventIds, setSeenEventIds] = useState<number[]>([]);
    const { escalations, recentEvents, isSimulating, earthquakeError } = useTingog();
    // Escalation Log now lives in the same right-side panel as Incoming Reports (moved
    // there so the AI chatbot on the left isn't sharing space with a passive feed) — its
    // "new" indicator moved with it.
    const hasNewEscalations = escalations.length > seenEscalationCount;
    const hasReportUpdates = recentEvents.some((event) => !seenEventIds.includes(event.id)) || hasNewEscalations;

    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                return savedTheme === 'dark';
            }
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true;
    });

    const [mapStyle, setMapStyle] = useState<'humanitarian' | 'minimal'>('humanitarian');
    const [isFocusMode, setIsFocusMode] = useState(false);

    useEffect(() => {
        const html = document.documentElement;
        if (isDarkMode) {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode((prev) => !prev);
    const toggleMapStyle = () => setMapStyle((prev) => (prev === 'humanitarian' ? 'minimal' : 'humanitarian'));

    const openBriefing = () => {
        setIsBriefingMinimized(false);
    };
    const openReports = () => {
        setSeenEventIds(recentEvents.map((event) => event.id));
        setSeenEscalationCount(escalations.length);
        setIsReportsMinimized(false);
    };
    const resetMap = () => {
        const mapWindow = window as Window & { resetMapView?: () => void };
        mapWindow.resetMapView?.();
    };

    return (
        <div className="relative h-dvh w-full overflow-hidden bg-background text-on-surface font-body-md select-none">
            <TacticalMap filter={mapFilter} onFilterChange={setMapFilter} isDarkMode={isDarkMode} mapStyle={mapStyle} />

            {/* The command tools float over the geographic picture instead of competing with it for layout space. */}
            <div className="pointer-events-none absolute inset-0 z-50 overflow-hidden">
                <div
                    className={`pointer-events-auto absolute left-3 right-3 z-30 lg:left-4 lg:right-4 transition-all duration-500 ease-in-out ${isFocusMode ? '-top-20 opacity-0 pointer-events-none' : 'top-3 lg:top-4 opacity-100'}`}
                >
                    <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} toggleMapStyle={toggleMapStyle} mapStyle={mapStyle} />
                </div>

                <div
                    className={`pointer-events-auto absolute left-3 right-3 z-20 lg:left-1/2 lg:right-auto lg:w-[min(58rem,calc(100vw-43rem))] transition-all duration-500 ease-in-out lg:-translate-x-1/2 ${isFocusMode ? 'top-3 lg:top-4' : 'top-[5.25rem]'}`}
                >
                    <KPIStrip filter={mapFilter} onFilterChange={setMapFilter} />
                </div>

                {/* Real, checkable disclosure that a demo sequence is injecting
                    is_simulated data through the live pipeline — never silent. Per-item
                    [SIMULATED] badges were removed from the map/packet stream UI (is_simulated
                    stays real in the DB/API; disclosed verbally when presenting instead — see
                    ARCHITECTURE.md §8), but this session-level banner is a separate mechanism
                    and stays. */}
                {!isFocusMode && (isSimulating || earthquakeError) && (
                    <div className="pointer-events-none absolute left-1/2 top-[7.25rem] z-30 -translate-x-1/2 lg:top-[7rem]">
                        <div
                            className={`rounded-sm border px-3 py-1 text-[10px] font-bold tracking-widest shadow-lg backdrop-blur-md ${
                                isSimulating
                                    ? 'border-red-500/50 bg-red-500/10 text-red-400'
                                    : 'border-amber-500/50 bg-amber-500/10 text-amber-400'
                            }`}
                        >
                            {isSimulating ? 'DEMO SEQUENCE RUNNING — puroks are receiving real, simulated presses' : earthquakeError}
                        </div>
                    </div>
                )}

                <div
                    className={`pointer-events-auto absolute bottom-3 left-3 top-[11.75rem] z-20 w-[calc(50%-0.5rem)] transition-transform duration-300 ease-out lg:bottom-4 lg:left-4 lg:top-[11.5rem] lg:w-[19rem] ${(isBriefingMinimized || isFocusMode) ? '-translate-x-[calc(100%+1rem)]' : 'translate-x-0'}`}
                >
                    <AISitRep />
                    <button
                        type="button"
                        onClick={() => setIsBriefingMinimized((value) => !value)}
                        aria-label="Minimize situation briefing"
                        aria-expanded="true"
                        className="absolute right-0 top-0 z-30 flex h-[46px] w-11 items-center justify-center border border-y-0 border-r-0 border-outline-variant bg-surface-container/80 text-on-surface backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_left</span>
                    </button>
                </div>

                {!isFocusMode && isBriefingMinimized && (
                    <button
                        type="button"
                        onClick={openBriefing}
                        aria-label="Expand situation briefing"
                        aria-expanded="false"
                        className="pointer-events-auto absolute left-0 top-[11.75rem] z-30 flex h-[46px] w-11 items-center justify-center border border-l-0 border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary lg:top-[11.5rem]"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                    </button>
                )}

                <div
                    className={`pointer-events-auto absolute bottom-3 right-3 top-[11.75rem] z-20 w-[calc(50%-0.5rem)] transition-transform duration-300 ease-out lg:bottom-4 lg:right-4 lg:top-[11.5rem] lg:w-[24rem] ${(isReportsMinimized || isFocusMode) ? 'translate-x-[calc(100%+1rem)]' : 'translate-x-0'}`}
                >
                    <div className="flex flex-col h-full gap-2">
                        <div className="flex-1 min-h-0">
                            <PacketStream />
                        </div>
                        <div className="flex-1 min-h-0">
                            <EscalationPanel />
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsReportsMinimized((value) => !value)}
                        aria-label="Minimize incoming reports"
                        aria-expanded="true"
                        className="absolute right-0 top-0 z-30 flex h-[46px] w-11 items-center justify-center border border-y-0 border-r-0 border-outline-variant bg-surface-container/80 text-on-surface backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                        {hasReportUpdates && (
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-container bg-red-500" aria-hidden="true"></span>
                        )}
                    </button>
                </div>

                {!isFocusMode && isReportsMinimized && (
                    <button
                        type="button"
                        onClick={openReports}
                        aria-label="Expand incoming reports"
                        aria-expanded="false"
                        className="pointer-events-auto absolute right-0 top-[11.75rem] z-30 flex h-[46px] w-11 items-center justify-center border border-r-0 border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary lg:top-[11.5rem]"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_left</span>
                        {hasReportUpdates && (
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-container bg-red-500" aria-hidden="true"></span>
                        )}
                    </button>
                )}

                {/* GPS Button — its own always-visible floating control, not nested inside
                    the collapsible reports panel (it used to disappear along with that
                    panel when minimized). */}
                <div
                    className={`pointer-events-auto absolute bottom-4 z-50 transition-all duration-300 ease-out ${(isReportsMinimized || isFocusMode) ? 'right-4' : 'right-4 lg:right-[calc(24rem+2rem)]'}`}
                >
                    <button
                        type="button"
                        onClick={resetMap}
                        aria-label="Reset map view"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-lg">my_location</span>
                    </button>
                </div>

                {/* Reliability Check — runs the real agent pipeline live, N times, and shows
                    each real pass/fail result in-app (see ReliabilityPanel.tsx). Not a
                    presentation element; a verification tool left reachable at all times. */}
                <div className="pointer-events-auto absolute bottom-4 left-4 z-50">
                    <button
                        type="button"
                        onClick={() => setIsReliabilityOpen(true)}
                        aria-label="Open AI reliability check"
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-lg">monitor_heart</span>
                    </button>
                </div>

                {/* Focus Mode Toggle */}
                <div className="pointer-events-auto absolute bottom-4 left-1/2 z-50 -translate-x-1/2">
                    <button
                        type="button"
                        onClick={() => setIsFocusMode((v) => !v)}
                        aria-label="Toggle Focus Mode"
                        className="flex h-10 items-center justify-center gap-2 rounded-full border border-outline-variant bg-surface-container/90 px-4 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary font-label-caps text-[11px] font-bold tracking-widest"
                    >
                        <span className="material-symbols-outlined text-[18px]">
                            {isFocusMode ? 'fullscreen_exit' : 'fullscreen'}
                        </span>
                        <span className="hidden sm:inline">FOCUS</span>
                    </button>
                </div>
            </div>

            {isReliabilityOpen && <ReliabilityPanel onClose={() => setIsReliabilityOpen(false)} />}
        </div>
    );
}

function App() {
    return (
        <TingogProvider>
            <Dashboard />
        </TingogProvider>
    );
}

export default App;
