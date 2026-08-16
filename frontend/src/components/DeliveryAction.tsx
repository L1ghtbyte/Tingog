import { useState } from "react";

import { useTingog } from "../context/TingogContext";
import type { PurokOut } from "../api/types";

interface DeliveryActionProps {
    purok: PurokOut;
    onDone?: () => void;
}

// Shared by the map popup and the packet stream — logging a delivery is a real POST to
// POST /api/puroks/{id}/deliveries, not a client-side clear. Deliberately logs ALL of
// the purok's currently active_needs in one call rather than per-item granularity —
// matches the original single-button UX, and per-item delivery logging is a real but
// separate future step (see JUDGE_QA.md / ARCHITECTURE.md §5.2), not built this pass.
export function DeliveryAction({ purok, onDone }: DeliveryActionProps) {
    const { logDelivery } = useTingog();
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (purok.active_needs.length === 0) return null;

    const isCritical = purok.active_needs.includes("TABANG");

    const handleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsSubmitting(true);
        try {
            await logDelivery(purok.id, purok.active_needs);
            onDone?.();
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <button
            onClick={handleClick}
            disabled={isSubmitting}
            className="w-full bg-primary-container text-black font-bold text-label-caps font-label-caps py-2 hover:bg-primary transition-colors disabled:opacity-50 transform skew-x-[12deg]"
        >
            <span className="inline-block transform -skew-x-[12deg] tracking-widest">
                {isSubmitting ? "LOGGING..." : isCritical ? "LOG RESPONSE DELIVERED" : "LOG DELIVERY"}
            </span>
        </button>
    );
}
