import { useEffect, useState } from 'react';
import { Header } from './components/Header';
import { KPIStrip } from './components/KPIStrip';
import { AISitRep } from './components/AISitRep';
import { TacticalMap, type MapFilter } from './components/TacticalMap';
import { PacketStream } from './components/PacketStream';

import { TingogProvider, useTingog } from './context/TingogContext';

function Dashboard() {
    const [isBriefingMinimized, setIsBriefingMinimized] = useState(false);
    const [isReportsMinimized, setIsReportsMinimized] = useState(false);
    const [mapFilter, setMapFilter] = useState<MapFilter>('ALL');
    const [seenEscalationCount, setSeenEscalationCount] = useState(0);
    const [seenEventIds, setSeenEventIds] = useState<number[]>([]);
    const { escalations, recentEvents, isSimulating, earthquakeError } = useTingog();
    const hasBriefingUpdates = escalations.length > seenEscalationCount;
    const hasReportUpdates = recentEvents.some((event) => !seenEventIds.includes(event.id));

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
    const openBriefing = () => {
        setSeenEscalationCount(escalations.length);
        setIsBriefingMinimized(false);
    };
    const openReports = () => {
        setSeenEventIds(recentEvents.map((event) => event.id));
        setIsReportsMinimized(false);
    };
    const resetMap = () => {
        const mapWindow = window as Window & { resetMapView?: () => void };
        mapWindow.resetMapView?.();
    };

    return (
        <div className="relative h-dvh w-full overflow-hidden bg-background text-on-surface font-body-md select-none">
            <TacticalMap filter={mapFilter} />

            {/* The command tools float over the geographic picture instead of competing with it for layout space. */}
            <div className="pointer-events-none absolute inset-0 z-50">
                <div className="pointer-events-auto absolute left-3 right-3 top-3 z-30 lg:left-4 lg:right-4 lg:top-4">
                    <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
                </div>

                <div className="pointer-events-auto absolute left-3 right-3 top-[4.25rem] z-20 lg:left-1/2 lg:right-auto lg:top-[4.25rem] lg:w-[min(58rem,calc(100vw-43rem))] lg:-translate-x-1/2">
                    <KPIStrip filter={mapFilter} onFilterChange={setMapFilter} />
                </div>

                {/* Real, checkable disclosure that a demo sequence is injecting
                    is_simulated data through the live pipeline — never silent, on top of
                    the [SIMULATED] badges already required everywhere else. */}
                {(isSimulating || earthquakeError) && (
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
                    className={`pointer-events-auto absolute bottom-3 left-3 top-[10.75rem] z-20 w-[calc(50%-0.5rem)] transition-transform duration-300 ease-out lg:bottom-4 lg:left-4 lg:top-[10.5rem] lg:w-[19rem] ${isBriefingMinimized ? '-translate-x-[calc(100%+1rem)]' : 'translate-x-0'}`}
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
                        {hasBriefingUpdates && (
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-container bg-red-500" aria-hidden="true"></span>
                        )}
                    </button>
                </div>

                {isBriefingMinimized && (
                    <button
                        type="button"
                        onClick={openBriefing}
                        aria-label="Expand situation briefing"
                        aria-expanded="false"
                        className="pointer-events-auto absolute left-0 top-[10.75rem] z-30 flex h-[46px] w-11 items-center justify-center border border-l-0 border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary lg:top-[10.5rem]"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_right</span>
                        {hasBriefingUpdates && (
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-container bg-red-500" aria-hidden="true"></span>
                        )}
                    </button>
                )}

                <div
                    className={`pointer-events-auto absolute bottom-3 right-3 top-[10.75rem] z-20 w-[calc(50%-0.5rem)] transition-transform duration-300 ease-out lg:bottom-4 lg:right-4 lg:top-[10.5rem] lg:w-[21rem] ${isReportsMinimized ? 'translate-x-[calc(100%+1rem)]' : 'translate-x-0'}`}
                >
                    <PacketStream />
                    <button
                        type="button"
                        onClick={resetMap}
                        aria-label="Reset map view"
                        className="absolute bottom-4 right-full z-30 mr-4 flex h-10 w-10 items-center justify-center rounded-full border border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary"
                    >
                        <span className="material-symbols-outlined text-lg">my_location</span>
                    </button>
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

                {isReportsMinimized && (
                    <button
                        type="button"
                        onClick={openReports}
                        aria-label="Expand incoming reports"
                        aria-expanded="false"
                        className="pointer-events-auto absolute right-0 top-[10.75rem] z-30 flex h-[46px] w-11 items-center justify-center border border-r-0 border-outline-variant bg-surface-container/90 text-on-surface shadow-lg backdrop-blur-md transition-colors hover:border-primary hover:text-primary lg:top-[10.5rem]"
                    >
                        <span className="material-symbols-outlined text-xl">chevron_left</span>
                        {hasReportUpdates && (
                            <span className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full border border-surface-container bg-red-500" aria-hidden="true"></span>
                        )}
                    </button>
                )}
            </div>
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
