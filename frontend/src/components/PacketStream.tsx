import { useEffect, useRef, useState } from "react";

import type { RecentEventOut } from "../api/types";
import { useTingog } from "../context/TingogContext";
import { DeliveryAction } from "./DeliveryAction";

function pressedButtons(event: RecentEventOut): string[] {
    return event.button === "COMBO" ? event.combo_buttons ?? [] : [event.button];
}

// Wire protocol always sends "LUWAS" (matches the real hardware/firmware) — only
// the text shown to a viewer changed to "OK", after finding LUWAS doesn't actually
// translate to "safe" (closer to "to go out/escape"). See ARCHITECTURE.md §4.
// English glosses on the need buttons are for local relevance — judges shouldn't
// need to already know Bisaya to read this panel.
const NEED_TRANSLATIONS: Record<string, string> = {
    TABANG: "Help",
    TUBIG: "Water",
    TAMBAL: "Medicine",
    PAGKAON: "Food",
};

function displayButtonName(button: string): string {
    if (button === "LUWAS") return "OK";
    const translation = NEED_TRANSLATIONS[button];
    return translation ? `${button} (${translation})` : button;
}

// Real single/hold/double/combo gesture taxonomy — replaces the old is_double_press
// boolean, which collapsed the backend's already-correct Event.press_type +
// Event.combo_buttons into a yes/no flag. Purely a frontend fix, no firmware/backend
// coordination needed (the backend always tracked this correctly).
function formatPressLabel(event: RecentEventOut): string {
    const buttons = pressedButtons(event).map(displayButtonName);
    if (event.button === "COMBO") return `COMBO: ${buttons.join(" + ")}`;
    if (event.press_type === "hold") return `${buttons[0]} — HELD`;
    if (event.press_type === "double") return `${buttons[0]} — DOUBLE PRESS`;
    return buttons[0];
}

function cardBorderClass(event: RecentEventOut, isDismissed: boolean): string {
    if (isDismissed) return "border-outline-variant opacity-50";
    const buttons = pressedButtons(event);
    if (buttons.includes("TABANG")) return "border-red-500";
    if (buttons.includes("LUWAS")) return "border-green-500/50 hover:border-green-500";
    return "border-amber-500/50 hover:border-amber-500";
}

function labelColorClass(event: RecentEventOut, isDismissed: boolean): string {
    if (isDismissed) return "text-on-surface-variant border-outline-variant";
    const buttons = pressedButtons(event);
    if (buttons.includes("TABANG")) return "text-red-500 border-red-500";
    if (buttons.includes("LUWAS")) return "text-green-400 border-green-500";
    return "text-amber-400 border-amber-500";
}

export function PacketStream() {
    const { recentEvents, puroks } = useTingog();
    const scrollRef = useRef<HTMLDivElement>(null);
    // Client-side-only dismiss/declutter state — the backend has no "acknowledged"
    // concept on Event, and adding one just for this UI convenience would misrepresent
    // it as a real persisted action. Resets on reload, deliberately.
    const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [recentEvents]);

    const formatTime = (iso: string) => {
        const diffMins = Math.floor((now - new Date(iso).getTime()) / 60000);
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
    };

    const dismiss = (id: number) => setDismissedIds((prev) => new Set(prev).add(id));

    return (
        <aside className="h-full w-full overflow-hidden rounded-sm border border-outline-variant bg-surface-container/90 shadow-2xl backdrop-blur-md flex flex-col">
            <div className="p-3 border-b border-outline-variant flex justify-between items-center">
                <h2 className="text-headline-md font-headline-md text-primary tracking-tight uppercase">INCOMING REPORTS</h2>
            </div>

            <div ref={scrollRef} className="flex-1 min-h-0 p-2 overflow-y-auto flex flex-col gap-1.5 bg-background">
                {recentEvents.length === 0 && <p className="text-xs text-on-surface-variant">No activity in the recent window.</p>}
                {recentEvents.map((event) => {
                    const isDismissed = dismissedIds.has(event.id);
                    const buttons = pressedButtons(event);
                    const isCritical = buttons.includes("TABANG") && !isDismissed;
                    const purok = puroks.find((p) => p.id === event.purok_id);

                    return (
                        <div
                            key={event.id}
                            className={`bg-surface-container-high border p-2 flex flex-col gap-1 shrink-0 transition-colors ${cardBorderClass(event, isDismissed)}`}
                        >
                            <div className="flex justify-between items-start gap-2">
                                <span className={`text-[11px] font-data-tabular leading-tight ${isDismissed ? "text-on-surface-variant" : "text-on-surface font-bold"}`}>
                                    {event.purok_name}
                                    <span className="ml-1 text-[9px] font-normal text-on-surface-variant">{event.device_id}</span>
                                </span>
                                <span className={`text-[9px] font-data-tabular shrink-0 leading-tight ${isCritical ? "text-red-400" : "text-on-surface-variant"}`}>
                                    {formatTime(event.received_at)}
                                </span>
                            </div>
                            <div className={`text-[11px] font-data-tabular pl-1.5 border-l-2 leading-snug ${labelColorClass(event, isDismissed)} ${isCritical ? "bg-red-500/10 font-bold p-1" : ""}`}>
                                {formatPressLabel(event)}
                            </div>
                            {!isDismissed && (
                                <div className="flex gap-1.5">
                                    {purok && <DeliveryAction purok={purok} />}
                                    <button
                                        onClick={() => dismiss(event.id)}
                                        className="flex-1 bg-transparent border border-primary text-primary py-1 hover:bg-primary/10 transition-colors transform skew-x-[12deg]"
                                    >
                                        <span className="inline-block transform -skew-x-[12deg] text-[9px] font-label-caps font-bold tracking-widest">DISMISS</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </aside>
    );
}
