import { useTingog } from "../context/TingogContext";

// Clustering is a real, live-computed signal (backend/app/clustering.py) — deserves to
// be impossible to miss the moment it's active, not just a small Leaflet tooltip tied
// to map pixel coordinates (pans/zooms away, easy to lose near the top of a busy map).
// This is a second, fixed-position surface for the exact same clusters array the map's
// polyline+tooltip already renders — not a separate mechanism, same real data.
export function ClusterBanner() {
    const { clusters } = useTingog();

    if (clusters.length === 0) return null;

    return (
        <div className="pointer-events-none flex flex-col items-center gap-1.5">
            {clusters.map((cluster) => (
                <div
                    key={cluster.cluster_id}
                    className="flex items-center gap-2 rounded-sm border border-amber-500/60 bg-amber-500/15 px-3 py-1.5 shadow-lg backdrop-blur-md"
                >
                    <span className="material-symbols-outlined text-amber-400 text-[16px]">hub</span>
                    <span className="text-[11px] font-bold tracking-widest text-amber-400 uppercase">{cluster.need_type} CLUSTER</span>
                    <span className="text-[11px] text-amber-200">
                        {cluster.puroks.join(", ")} · {cluster.confidence}% confidence
                    </span>
                </div>
            ))}
        </div>
    );
}
