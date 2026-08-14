import { useTingog } from '../context/TingogContext';
import { useEffect, useState } from 'react';

type ModalTab = 'TOTAL' | 'CRITICAL' | 'NEEDS' | 'SILENT' | null;

interface StatisticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeTab: ModalTab;
}

export function StatisticsModal({ isOpen, onClose, activeTab }: StatisticsModalProps) {
    const { puroks } = useTingog();
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!isOpen) return;
        const timer = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(timer);
    }, [isOpen]);

    if (!isOpen || !activeTab) return null;

    const formatTime = (date: Date) => {
        const diffMs = now - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHrs = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;
        return `${diffHrs}h ${remMins}m ago`;
    };

    // Calculate metrics
    const totalHH = puroks.reduce((acc, p) => acc + p.baseline_household_count, 0);
    const totalVuln = puroks.reduce((acc, p) => acc + p.baseline_vulnerable_count, 0);
    
    const criticalPuroks = puroks.filter(p => p.active_needs.includes('TABANG'));
    
    const silentPuroks = puroks.filter(p => p.status === 'unknown' || p.hours_since_heartbeat > 6);
    
    // Aggregate Needs
    const needsCount = { TUBIG: 0, TAMBAL: 0, PAGKAON: 0 };
    puroks.forEach(p => {
        if (p.active_needs.includes('TUBIG')) needsCount.TUBIG++;
        if (p.active_needs.includes('TAMBAL')) needsCount.TAMBAL++;
        if (p.active_needs.includes('PAGKAON')) needsCount.PAGKAON++;
    });
    const maxNeed = Math.max(needsCount.TUBIG, needsCount.TAMBAL, needsCount.PAGKAON, 1);

    const renderContent = () => {
        switch (activeTab) {
            case 'TOTAL':
                return (
                    <div className="flex flex-col gap-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-surface-container-high border border-outline-variant p-4">
                                <div className="text-label-caps font-label-caps text-on-surface-variant mb-2">VULNERABLE HH</div>
                                <div className="text-display-telemetry font-display-telemetry text-amber-500">{totalVuln}</div>
                                <div className="text-sm font-mono text-on-surface mt-1">{(totalVuln / totalHH * 100).toFixed(1)}% of total</div>
                            </div>
                            <div className="bg-surface-container-high border border-outline-variant p-4">
                                <div className="text-label-caps font-label-caps text-on-surface-variant mb-2">NETWORK HEALTH</div>
                                <div className="text-display-telemetry font-display-telemetry text-green-500">{((puroks.length - silentPuroks.length) / puroks.length * 100).toFixed(0)}%</div>
                                <div className="text-sm font-mono text-on-surface mt-1">Nodes Active</div>
                            </div>
                        </div>
                    </div>
                );
            case 'CRITICAL':
                if (criticalPuroks.length === 0) return <div className="font-mono text-on-surface-variant p-4 border border-dashed border-outline-variant">No critical events currently active.</div>;
                return (
                    <div className="flex flex-col gap-3">
                        {criticalPuroks.map(p => (
                            <div key={p.id} className="bg-red-500/10 border border-red-500/50 p-4 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-red-400 font-mono text-lg">{p.device_id} ({p.name})</div>
                                    <div className="text-on-surface font-mono text-sm mt-1">Vuln HH: {p.baseline_vulnerable_count} | Batt: {p.battery_pct}%</div>
                                </div>
                                <div className="text-red-500 font-bold font-mono animate-pulse">{formatTime(p.last_event_at)}</div>
                            </div>
                        ))}
                    </div>
                );
            case 'NEEDS':
                return (
                    <div className="flex flex-col gap-6">
                        {(Object.entries(needsCount) as [keyof typeof needsCount, number][]).map(([need, count]) => (
                            <div key={need} className="flex flex-col gap-2">
                                <div className="flex justify-between font-mono text-amber-500 font-bold">
                                    <span>{need}</span>
                                    <span>{count} Requests</span>
                                </div>
                                <div className="w-full bg-surface-container-high h-4 border border-outline-variant overflow-hidden">
                                    <div 
                                        className="h-full bg-amber-500 transition-all duration-1000 ease-out relative overflow-hidden" 
                                        style={{ width: `${(count / maxNeed) * 100}%` }}
                                    >
                                        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 10px, #000 10px, #000 20px)' }}></div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                );
            case 'SILENT':
                if (silentPuroks.length === 0) return <div className="font-mono text-on-surface-variant p-4 border border-dashed border-outline-variant">All nodes are reporting perfectly.</div>;
                return (
                    <div className="flex flex-col gap-3">
                        {silentPuroks.map(p => (
                            <div key={p.id} className="bg-[#64748B]/10 border border-[#64748B]/50 p-4 flex justify-between items-center">
                                <div>
                                    <div className="font-bold text-[#64748B] font-mono text-lg">{p.device_id} ({p.name})</div>
                                    <div className="text-on-surface-variant font-mono text-sm mt-1">Last seen {p.hours_since_heartbeat} hours ago</div>
                                </div>
                                <div className="text-[#64748B] font-bold font-mono bg-surface-container px-3 py-1 border border-[#334155]">UNREACHABLE</div>
                            </div>
                        ))}
                    </div>
                );
        }
    };

    const getTitleColor = () => {
        if (activeTab === 'CRITICAL') return 'text-red-500';
        if (activeTab === 'NEEDS') return 'text-amber-500';
        if (activeTab === 'SILENT') return 'text-[#64748B]';
        return 'text-primary';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
            
            {/* Modal Box */}
            <div className="relative w-full max-w-2xl bg-surface border border-outline-variant shadow-2xl flex flex-col transform transition-all">
                {/* Header */}
                <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                    <h2 className={`text-headline-md font-headline-md uppercase tracking-widest ${getTitleColor()}`}>
                        {activeTab} STATISTICS DEEP DIVE
                    </h2>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center border border-outline-variant hover:bg-surface-container-highest transition-colors">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
                
                {/* Content */}
                <div className="p-6 bg-background max-h-[70vh] overflow-y-auto">
                    {renderContent()}
                </div>
                
                {/* Footer Deco */}
                <div className="h-2 bg-surface-container-low flex">
                    <div className={`h-full flex-1 ${activeTab === 'CRITICAL' ? 'bg-red-500' : activeTab === 'NEEDS' ? 'bg-amber-500' : activeTab === 'SILENT' ? 'bg-[#64748B]' : 'bg-primary'}`}></div>
                </div>
            </div>
        </div>
    );
}
