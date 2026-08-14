export function PacketStream() {
    return (
        <aside className="w-[360px] bg-surface-container border border-outline-variant flex flex-col rounded-sm shrink-0">
            <div className="p-3 border-b border-outline-variant flex justify-between items-center">
                <h2 className="text-headline-md font-headline-md text-primary flex items-center gap-2">
                    <span className="material-symbols-outlined text-xl">settings_input_antenna</span>
                    Packet Stream
                </h2>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="text-data-tabular font-data-tabular text-on-surface-variant text-xs">RX: 1.2Kbps</span>
                </div>
            </div>
            
            <div className="flex-1 p-2 overflow-y-auto flex flex-col gap-2 bg-background">
                <div className="bg-surface-container-high border border-red-500 p-2 flex flex-col gap-2">
                    <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                        <span className="text-data-tabular font-data-tabular text-white font-bold">HH-089 (Santos)</span>
                        <span className="text-data-tabular font-data-tabular text-red-400">2m ago</span>
                    </div>
                    <div className="text-data-tabular font-data-tabular text-red-500 font-bold bg-red-500/10 p-1 pl-2 border-l-2 border-red-500">
                        TABANG - DOUBLE PRESS
                    </div>
                    <div className="flex gap-2 mt-1">
                        <button className="flex-1 bg-primary-container text-black text-label-caps font-label-caps py-1 font-bold">DISPATCH</button>
                        <button className="flex-1 bg-transparent border border-primary text-primary text-label-caps font-label-caps py-1 hover:bg-primary/10">ACK</button>
                    </div>
                </div>

                <div className="bg-surface-container-high border border-outline-variant hover:border-amber-500/50 p-2 flex flex-col gap-2 transition-colors">
                    <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                        <span className="text-data-tabular font-data-tabular text-on-surface">HH-214 (Mendoza)</span>
                        <span className="text-data-tabular font-data-tabular text-on-surface-variant">12m ago</span>
                    </div>
                    <div className="text-data-tabular font-data-tabular text-amber-400 pl-2 border-l-2 border-amber-500">
                        TUBIG (Water)
                    </div>
                </div>

                <div className="bg-surface-container-high border border-outline-variant hover:border-green-500/50 p-2 flex flex-col gap-2 transition-colors opacity-70">
                    <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                        <span className="text-data-tabular font-data-tabular text-on-surface">HH-401 (Reyes)</span>
                        <span className="text-data-tabular font-data-tabular text-on-surface-variant">45m ago</span>
                    </div>
                    <div className="text-data-tabular font-data-tabular text-green-400 pl-2 border-l-2 border-green-500">
                        LUWAS (Safe)
                    </div>
                </div>

                <div className="bg-surface-container-high border border-outline-variant p-2 flex flex-col gap-2 opacity-50">
                    <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                        <span className="text-data-tabular font-data-tabular text-on-surface">HH-112 (Cruz)</span>
                        <span className="text-data-tabular font-data-tabular text-on-surface-variant">1h 12m ago</span>
                    </div>
                    <div className="text-data-tabular font-data-tabular text-green-400 pl-2 border-l-2 border-green-500">
                        LUWAS (Safe)
                    </div>
                </div>

                <div className="bg-surface-container-high border border-outline-variant p-2 flex flex-col gap-2 opacity-30">
                    <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                        <span className="text-data-tabular font-data-tabular text-on-surface">HH-055 (Gomez)</span>
                        <span className="text-data-tabular font-data-tabular text-on-surface-variant">1h 45m ago</span>
                    </div>
                    <div className="text-data-tabular font-data-tabular text-green-400 pl-2 border-l-2 border-green-500">
                        LUWAS (Safe)
                    </div>
                </div>
            </div>
        </aside>
    );
}
