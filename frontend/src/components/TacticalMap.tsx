export function TacticalMap() {
    return (
        <main className="flex-1 bg-surface-container border border-outline-variant rounded-sm relative flex flex-col overflow-hidden">
            <div className="absolute top-3 left-3 z-10 flex gap-2">
                <button className="bg-surface-container/90 border border-primary text-primary px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm">ALL</button>
                <button className="bg-surface-container/90 border border-outline-variant text-on-surface-variant hover:text-white px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors">CRITICAL</button>
                <button className="bg-surface-container/90 border border-outline-variant text-on-surface-variant hover:text-white px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors">NEEDS</button>
                <button className="bg-surface-container/90 border border-outline-variant text-on-surface-variant hover:text-white px-3 py-1.5 text-label-caps font-label-caps backdrop-blur-sm transition-colors">SILENT</button>
            </div>

            <div className="absolute inset-0 z-0 bg-background" style={{ backgroundImage: "radial-gradient(#334155 1px, transparent 1px)", backgroundSize: "24px 24px", opacity: 0.3 }}></div>
            <div className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-screen z-0 grayscale" style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuAkCQbXPMsVBQJxDssNyKnJukItvzocrJBwsMoV39ktms3K-nvSMAB3uoJXpc_oPJLYAiZfvH3XXbXGGZZiSsj0lOhJy3JkLsZhpXw-rDyp6Kuw-bAUDuoEOMm_Ms5VD8pi5Ifr0DmTyj4yZXHierqvtZvKLI-hSByXIkrtII4BHiJeeg3_-fczPDp8uPKGokfekb0thtpsN54wufHcGPRRIhks1s_C4oU6bQJToC_f5EgUAPMofvM6')" }}></div>

            <div className="absolute inset-0 z-10">
                <div className="absolute top-[40%] left-[60%] flex items-center justify-center w-8 h-8 bg-amber-500/20 border border-amber-500 rounded-full text-amber-500 text-label-caps font-label-caps shadow-[0_0_15px_rgba(245,158,11,0.5)] cursor-pointer hover:bg-amber-500/40 transition-colors">
                    14
                </div>

                <div className="absolute top-[55%] left-[35%] group">
                    <div className="relative w-4 h-4 bg-red-500 rotate-45 border border-white shadow-[0_0_10px_rgba(239,68,68,0.8)] cursor-pointer z-20">
                        <div className="absolute inset-0 rounded-full border border-red-500 pulse-ring"></div>
                    </div>

                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-64 bg-surface-container-high/95 border border-outline-variant backdrop-blur-md p-3 opacity-100 transition-opacity z-30">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-label-caps font-label-caps text-white font-bold">HH-089: Santos Family</span>
                            <span className="text-label-caps font-label-caps text-red-400 animate-pulse">2m ago</span>
                        </div>
                        <div className="text-data-tabular font-data-tabular text-on-surface space-y-1 mb-3">
                            <div><span className="text-on-surface-variant">Need:</span> <span className="text-red-500 font-bold">TABANG (CRITICAL)</span></div>
                            <div><span className="text-on-surface-variant">Demo:</span> 2 Elderly, 1 Infant</div>
                            <div><span className="text-on-surface-variant">Batt:</span> 88%</div>
                        </div>
                        <button className="w-full bg-primary-container text-black font-bold text-label-caps font-label-caps py-2 hover:bg-primary transition-colors">
                            DISPATCH RESPONSE
                        </button>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1">
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm"><span className="material-symbols-outlined text-sm">add</span></button>
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm"><span className="material-symbols-outlined text-sm">remove</span></button>
                <button className="w-8 h-8 bg-surface-container/80 border border-outline-variant hover:border-primary flex items-center justify-center text-on-surface backdrop-blur-sm mt-2"><span className="material-symbols-outlined text-sm">my_location</span></button>
            </div>
        </main>
    );
}
