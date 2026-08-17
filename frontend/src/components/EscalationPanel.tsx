import { useState } from "react";

import { useTingog } from "../context/TingogContext";
import { EscalationLog } from "./EscalationLog";
import { PurokRoster } from "./PurokRoster";

// Split out from AISitRep so the deterministic alerts feed (event-triggered, never
// touches the Briefing Agent — see ARCHITECTURE.md) has its own panel, structurally
// separate from the AI chatbot above it, not sharing one scroll container with it.
//
// Two tabs, not two panels — screen space is already fully committed to three panels;
// a purok's current state was previously only visible one click at a time via its map
// marker popup, with no at-a-glance list anywhere. Reusing this panel's existing space
// avoids a layout change right before the pitch while still closing that real gap.
export function EscalationPanel() {
    const { escalations, puroks } = useTingog();
    const [now] = useState(() => Date.now());
    const [activeTab, setActiveTab] = useState<"log" | "roster">("log");

    return (
        <aside className="h-full w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container/90 shadow-2xl backdrop-blur-md flex flex-col">
            <div className="border-b border-outline-variant flex">
                <button
                    type="button"
                    onClick={() => setActiveTab("log")}
                    aria-pressed={activeTab === "log"}
                    className={`flex-1 p-3 text-headline-md font-headline-md tracking-tight uppercase text-center border-b-2 transition-colors ${
                        activeTab === "log" ? "text-primary border-primary" : "text-on-surface-variant border-transparent hover:text-on-surface"
                    }`}
                >
                    LOG
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("roster")}
                    aria-pressed={activeTab === "roster"}
                    className={`flex-1 p-3 text-headline-md font-headline-md tracking-tight uppercase text-center border-b-2 transition-colors ${
                        activeTab === "roster" ? "text-primary border-primary" : "text-on-surface-variant border-transparent hover:text-on-surface"
                    }`}
                >
                    PUROKS
                </button>
            </div>
            {activeTab === "log" ? <EscalationLog escalations={escalations} now={now} /> : <PurokRoster puroks={puroks} />}
        </aside>
    );
}
