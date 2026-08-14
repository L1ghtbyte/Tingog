export function AISitRep() {
    return (
        <aside className="w-[320px] bg-surface-container border border-outline-variant flex flex-col rounded-sm shrink-0">
            <div className="p-3 border-b border-outline-variant flex items-center justify-between">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>emergency</span>
                    AI SitRep
                </h2>
                <span className="text-label-caps font-label-caps text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-sm border border-outline-variant">LIVE</span>
            </div>
            
            <div className="p-3 flex flex-col gap-3 overflow-y-auto">
                <div className="bg-surface-container-high border border-red-500/50 rounded-sm p-3 relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                    <div className="flex items-start gap-2 mb-2 pl-2">
                        <span className="material-symbols-outlined text-red-500 text-sm mt-0.5">warning</span>
                        <h3 className="text-label-caps font-label-caps text-red-400">🚨 CLUSTER ANOMALY DETECTED</h3>
                    </div>
                    <p className="text-data-tabular font-data-tabular text-on-surface mb-3 pl-2 leading-relaxed">
                        14 households pressed <span className="text-amber-400 font-bold">TUBIG</span> in Sitio Looc. Probable water line failure.
                    </p>
                    <button className="ml-2 bg-background border border-outline-variant hover:border-primary text-on-surface text-label-caps font-label-caps px-3 py-1.5 transition-colors w-full flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                        VIEW 14 HOUSEHOLDS
                    </button>
                </div>

                <div className="bg-surface-container-high border border-amber-500/50 rounded-sm p-3 relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500"></div>
                    <div className="flex items-start gap-2 mb-2 pl-2">
                        <span className="material-symbols-outlined text-amber-500 text-sm mt-0.5">sensors_off</span>
                        <h3 className="text-label-caps font-label-caps text-amber-400">⚠️ SILENCE ANOMALY</h3>
                    </div>
                    <p className="text-data-tabular font-data-tabular text-on-surface mb-3 pl-2 leading-relaxed">
                        HH-042 and 5 adjacent nodes silent {">"} 9h. Potential relay failure.
                    </p>
                    <button className="ml-2 bg-background border border-outline-variant hover:border-amber-500 text-on-surface text-label-caps font-label-caps px-3 py-1.5 transition-colors w-full flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">campaign</span>
                        ALERT BARANGAY TANOD
                    </button>
                </div>
            </div>
        </aside>
    );
}
