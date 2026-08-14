import { useTingog, type Packet } from '../context/TingogContext';
import { useEffect, useRef, useState } from 'react';

export function PacketStream() {
    const { packets, ackPacket } = useTingog();
    const scrollRef = useRef<HTMLDivElement>(null);

    // Live time for relative timestamps
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, []);

    // Auto-scroll to top when new packets arrive
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [packets]);

    const getPacketStyle = (p: Packet) => {
        if (p.acked) return "border-outline-variant opacity-50";
        switch (p.need_type) {
            case 'TABANG': return "border-red-500";
            case 'LUWAS': return "border-green-500/50 hover:border-green-500";
            default: return "border-amber-500/50 hover:border-amber-500";
        }
    };

    const getNeedsColor = (p: Packet) => {
        switch (p.need_type) {
            case 'TABANG': return "text-red-500 border-red-500";
            case 'LUWAS': return "text-green-400 border-green-500";
            default: return "text-amber-400 border-amber-500";
        }
    };

    const formatTime = (date: Date) => {
        const diffMs = now - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;
        return `${diffHrs}h ${remMins}m ago`;
    };

    return (
        <aside className="w-full lg:w-[360px] lg:h-full bg-surface-container border border-outline-variant flex flex-col rounded-sm shrink-0">
            <div className="p-3 border-b border-outline-variant flex justify-between items-center">
                <h2 className="text-headline-md font-headline-md text-primary tracking-tight uppercase">
                    INCOMING REPORTS
                </h2>
            </div>

            <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto flex flex-col gap-3 bg-background">
                {packets.map(p => (
                    <div key={p.id} className={`bg-surface-container-high border p-3 flex flex-col gap-2 shrink-0 transition-colors ${getPacketStyle(p)} ${p.acked ? 'opacity-50' : ''}`}>
                        <div className="flex justify-between items-start border-b border-outline-variant pb-1">
                            <span className={`text-data-tabular font-data-tabular ${p.acked ? 'text-on-surface-variant' : 'text-on-surface font-bold'}`}>
                                {p.device_id} ({p.purok_name.replace('Purok ', '')})
                            </span>
                            <span className={`text-data-tabular font-data-tabular ${p.need_type === 'TABANG' && !p.acked ? 'text-red-400' : 'text-on-surface-variant'}`}>
                                {formatTime(p.timestamp)}
                            </span>
                        </div>
                        <div className={`text-data-tabular font-data-tabular pl-2 border-l-2 ${p.acked ? 'text-on-surface-variant border-outline-variant' : getNeedsColor(p)} ${p.need_type === 'TABANG' && !p.acked ? 'bg-red-500/10 font-bold p-1' : ''}`}>
                            {p.need_type} {p.is_double_press ? '- DOUBLE PRESS' : ''}
                        </div>
                        {!p.acked && (
                            <div className="flex gap-3 mt-3 px-1">
                                {p.need_type === 'TABANG' && (
                                    <button className="flex-1 bg-primary-container text-black py-1.5 hover:bg-primary transition-colors transform skew-x-[12deg]">
                                        <span className="inline-block transform -skew-x-[12deg] text-label-caps font-label-caps font-bold">DISPATCH</span>
                                    </button>
                                )}
                                <button onClick={() => ackPacket(p.id)} className="flex-1 bg-transparent border border-primary text-primary py-1.5 hover:bg-primary/10 transition-colors transform skew-x-[12deg]">
                                    <span className="inline-block transform -skew-x-[12deg] text-label-caps font-label-caps font-bold">ACKNOWLEDGE</span>
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </aside>
    );
}
