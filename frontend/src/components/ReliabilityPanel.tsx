import { useEffect, useRef, useState } from "react";

import { getReliabilityCheckUrl } from "../api/client";
import type { ReliabilityEvent, ReliabilityRunMode } from "../api/types";

// Runs the SAME live agent pipeline the "Ask" button uses (run_briefing_stream,
// persist=False) N times in a row and shows each run's real pass/fail result directly
// in the app as it happens — built because "I ran it a few times and it mostly worked"
// isn't something to just take on the assistant's word for; the user needs to watch the
// actual test happen in the running app, not read a summary of one that already ran.

const MODE_META: Record<ReliabilityRunMode, { label: string; tone: string; icon: string }> = {
    briefed: { label: "AI BRIEFED", tone: "text-green-400 border-green-500/50", icon: "check_circle" },
    raw: { label: "RAW FALLBACK", tone: "text-amber-400 border-amber-500/50", icon: "warning" },
    clarifying: { label: "CLARIFYING", tone: "text-amber-400 border-amber-500/50", icon: "help" },
    crashed: { label: "CRASHED", tone: "text-red-400 border-red-500/50", icon: "error" },
    unknown: { label: "UNKNOWN", tone: "text-on-surface-variant border-outline-variant", icon: "help" },
};

interface RunRow {
    run: number;
    mode: ReliabilityRunMode | "pending";
    elapsedSeconds?: number;
    checkFailedCount?: number;
    error?: string | null;
}

interface Summary {
    total: number;
    briefed: number;
    raw: number;
    other: number;
    avgSeconds: number;
}

export function ReliabilityPanel({ onClose }: { onClose: () => void }) {
    const [runs, setRuns] = useState<RunRow[]>([]);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [runCount, setRunCount] = useState(5);
    const esRef = useRef<EventSource | null>(null);

    const start = () => {
        esRef.current?.close();
        setRuns([]);
        setSummary(null);
        setIsRunning(true);

        const es = new EventSource(getReliabilityCheckUrl(runCount));
        esRef.current = es;
        es.onmessage = (msg) => {
            const event: ReliabilityEvent = JSON.parse(msg.data);
            if (event.type === "run_start") {
                setRuns((prev) => [...prev, { run: event.run, mode: "pending" }]);
            } else if (event.type === "run_result") {
                setRuns((prev) =>
                    prev.map((row) =>
                        row.run === event.run
                            ? {
                                  run: event.run, mode: event.mode, elapsedSeconds: event.elapsed_seconds,
                                  checkFailedCount: event.check_failed_count, error: event.error,
                              }
                            : row
                    )
                );
            } else if (event.type === "summary") {
                setSummary({ total: event.total, briefed: event.briefed, raw: event.raw, other: event.other, avgSeconds: event.avg_seconds });
                setIsRunning(false);
                es.close();
            }
        };
        es.onerror = () => {
            setIsRunning(false);
            es.close();
        };
    };

    useEffect(() => () => esRef.current?.close(), []);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-sm border border-outline-variant bg-surface-container shadow-2xl flex flex-col max-h-[85vh]">
                <div className="p-3 border-b border-outline-variant flex items-center justify-between shrink-0">
                    <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2 tracking-tight uppercase">
                        <span className="material-symbols-outlined text-lg">monitor_heart</span>
                        AI RELIABILITY CHECK
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Close" className="text-on-surface-variant hover:text-on-surface">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                <div className="p-3 border-b border-outline-variant flex items-center gap-2 shrink-0">
                    <label className="text-[11px] text-on-surface-variant" htmlFor="reliability-run-count">
                        Runs
                    </label>
                    <input
                        id="reliability-run-count"
                        type="number"
                        min={1}
                        max={10}
                        value={runCount}
                        disabled={isRunning}
                        onChange={(e) => setRunCount(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
                        className="w-14 rounded-sm border border-outline-variant bg-surface-container-high px-2 py-1 text-xs text-on-surface"
                    />
                    <button
                        type="button"
                        onClick={start}
                        disabled={isRunning}
                        className="ml-auto rounded-sm border border-primary/60 bg-primary/10 px-3 py-1.5 text-[11px] font-bold tracking-widest text-primary hover:bg-primary/20 disabled:opacity-50"
                    >
                        {isRunning ? "RUNNING…" : "RUN LIVE TEST"}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
                    {runs.length === 0 && (
                        <p className="text-xs text-on-surface-variant">
                            Runs the real agent pipeline — the exact code path the "Ask" button uses — this many times in a row, right
                            now, against the live LLM providers. Every result below is a real outcome, not a simulation.
                        </p>
                    )}
                    {runs.map((row) => {
                        const meta = row.mode === "pending" ? null : MODE_META[row.mode];
                        return (
                            <div
                                key={row.run}
                                className={`flex items-center gap-2 rounded-sm border px-2.5 py-1.5 text-xs ${meta ? meta.tone : "border-outline-variant text-on-surface-variant"}`}
                            >
                                <span className={`material-symbols-outlined text-sm ${row.mode === "pending" ? "animate-spin" : ""}`}>
                                    {meta ? meta.icon : "progress_activity"}
                                </span>
                                <span className="font-mono">#{row.run}</span>
                                <span className="font-bold tracking-wide">{meta ? meta.label : "RUNNING…"}</span>
                                {row.elapsedSeconds !== undefined && (
                                    <span className="ml-auto font-mono text-[10px] text-on-surface-variant">
                                        {row.elapsedSeconds}s
                                        {row.checkFailedCount ? ` · ${row.checkFailedCount} retry` : ""}
                                    </span>
                                )}
                                {row.error && <span className="w-full text-[10px] opacity-80">{row.error}</span>}
                            </div>
                        );
                    })}
                </div>

                {summary && (
                    <div className="p-3 border-t border-outline-variant shrink-0 text-xs">
                        <p className="text-on-surface">
                            <span className="text-green-400 font-bold">{summary.briefed} briefed</span>
                            {" · "}
                            <span className="text-amber-400 font-bold">{summary.raw} raw</span>
                            {summary.other > 0 && (
                                <>
                                    {" · "}
                                    <span className="text-red-400 font-bold">{summary.other} other</span>
                                </>
                            )}
                            {" · "}
                            <span className="text-on-surface-variant">out of {summary.total}, avg {summary.avgSeconds}s</span>
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
