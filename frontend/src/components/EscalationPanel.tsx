import { useState } from "react";

import { useTingog } from "../context/TingogContext";
import { EscalationLog } from "./EscalationLog";

// Split out from AISitRep so the deterministic alerts feed (event-triggered, never
// touches the Briefing Agent — see ARCHITECTURE.md) has its own panel, structurally
// separate from the AI chatbot above it, not sharing one scroll container with it.
export function EscalationPanel() {
    const { escalations } = useTingog();
    const [now] = useState(() => Date.now());

    return (
        <aside className="h-full w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container/90 shadow-2xl backdrop-blur-md flex flex-col">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2 tracking-tight uppercase">
                    ESCALATION LOG
                </h2>
            </div>
            <EscalationLog escalations={escalations} now={now} />
        </aside>
    );
}
