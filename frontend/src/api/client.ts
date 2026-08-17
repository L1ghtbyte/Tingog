import type {
    BriefingResponse,
    ClusterOut,
    ConversationHistoryOut,
    DeliveryCreateIn,
    EscalationOut,
    LastBriefingOut,
    PurokDetailOut,
    PurokOut,
    RecentEventOut,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function apiGet<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
    return res.json() as Promise<T>;
}

export const getPuroks = () => apiGet<PurokOut[]>("/api/puroks");
export const getPurokDetail = (id: number) => apiGet<PurokDetailOut>(`/api/puroks/${id}`);
export const getEscalations = () => apiGet<EscalationOut[]>("/api/escalations");
export const getClusters = () => apiGet<ClusterOut[]>("/api/clusters");
export const getRecentEvents = (minutes = 120) => apiGet<RecentEventOut[]>(`/api/events/recent?minutes=${minutes}`);

export const getBriefing = (question?: string, conversationId?: string) => {
    const params = new URLSearchParams();
    if (question) params.set("question", question);
    if (conversationId) params.set("conversation_id", conversationId);
    const query = params.toString();
    return apiGet<BriefingResponse>(`/api/briefing${query ? `?${query}` : ""}`);
};

// Passive read — no agent run, no LLM call. Null if nothing's been generated yet.
export const getLastBriefing = () => apiGet<LastBriefingOut | null>("/api/briefing/last");

// The full replayable back-and-forth for the most recently active conversation — lets
// the dashboard show a coordinator's whole chat again after a reload/restart, not just
// the single last saved narrative. Null if no conversation has been saved yet.
export const getLastConversation = () => apiGet<ConversationHistoryOut | null>("/api/briefing/conversation/last");

// Not run through apiGet — EventSource wants a plain URL, not a fetch call, and it only
// supports GET, so this shares getBriefing's query-building but returns the URL itself.
export const getBriefingStreamUrl = (question?: string, conversationId?: string) => {
    const params = new URLSearchParams();
    if (question) params.set("question", question);
    if (conversationId) params.set("conversation_id", conversationId);
    const query = params.toString();
    return `${BASE_URL}/api/briefing/stream${query ? `?${query}` : ""}`;
};

export const logDelivery = (purokId: number, body: DeliveryCreateIn) =>
    apiPost<PurokDetailOut>(`/api/puroks/${purokId}/deliveries`, body);

export const simulateEarthquake = () => apiPost<{ status: string; duration_seconds: number }>("/api/admin/simulate-earthquake");
