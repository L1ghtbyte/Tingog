import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// --- DATA TYPES ---
export type NeedType = 'TABANG' | 'TUBIG' | 'TAMBAL' | 'PAGKAON' | 'LUWAS';
export type Severity = 'unknown' | 'attention' | 'stable';

export interface Purok {
    id: string;
    device_id: string;
    name: string;
    barangay: string;
    baseline_household_count: number;
    baseline_vulnerable_count: number;
    active_needs: NeedType[];
    status: Severity;
    battery_pct: number;
    last_event_at: Date;
    hours_since_heartbeat: number;
    coordinates: { x: number, y: number }; // Percentage 0-100 for map placement
}

export interface Packet {
    id: string;
    device_id: string;
    purok_name: string;
    need_type: NeedType;
    is_double_press: boolean;
    timestamp: Date;
    acked: boolean;
}

export interface Anomaly {
    id: string;
    type: 'CLUSTER' | 'SILENCE' | 'PATTERN' | 'ESCALATION';
    title: string;
    description: string;
    related_purok_ids: string[];
    severity: 'red' | 'amber';
}

interface TingogContextType {
    puroks: Purok[];
    packets: Packet[];
    anomalies: Anomaly[];
    ackPacket: (id: string) => void;
    dispatchResponse: (purokId: string) => void;
}

const TingogContext = createContext<TingogContextType | undefined>(undefined);

// ==========================================
// ⚠️ MOCK DATA ENGINE BELOW ⚠️
// ==========================================
// This section simulates the Data Layer and Inference Layer described in the PDF.
// In a real application, this state would be driven by websockets or polling a real backend.

const MOCK_PUROKS: Purok[] = [
    { id: 'p-1', device_id: 'DEV-001', name: 'Purok 1', barangay: 'Bogo', baseline_household_count: 45, baseline_vulnerable_count: 5, active_needs: [], status: 'stable', battery_pct: 92, last_event_at: new Date(Date.now() - 1000 * 60 * 30), hours_since_heartbeat: 0.5, coordinates: { x: 30, y: 40 } },
    { id: 'p-2', device_id: 'DEV-002', name: 'Purok 2', barangay: 'Bogo', baseline_household_count: 62, baseline_vulnerable_count: 12, active_needs: [], status: 'stable', battery_pct: 85, last_event_at: new Date(Date.now() - 1000 * 60 * 120), hours_since_heartbeat: 2, coordinates: { x: 35, y: 35 } },
    { id: 'p-3', device_id: 'DEV-003', name: 'Purok 3', barangay: 'Bogo', baseline_household_count: 38, baseline_vulnerable_count: 3, active_needs: ['TUBIG'], status: 'attention', battery_pct: 78, last_event_at: new Date(Date.now() - 1000 * 60 * 45), hours_since_heartbeat: 1, coordinates: { x: 60, y: 40 } },
    { id: 'p-5', device_id: 'DEV-005', name: 'Purok 5', barangay: 'Bogo', baseline_household_count: 55, baseline_vulnerable_count: 8, active_needs: ['TUBIG'], status: 'attention', battery_pct: 88, last_event_at: new Date(Date.now() - 1000 * 60 * 40), hours_since_heartbeat: 1, coordinates: { x: 63, y: 42 } },
    { id: 'p-7', device_id: 'DEV-007', name: 'Purok 7', barangay: 'Bogo', baseline_household_count: 41, baseline_vulnerable_count: 4, active_needs: ['TUBIG'], status: 'attention', battery_pct: 91, last_event_at: new Date(Date.now() - 1000 * 60 * 35), hours_since_heartbeat: 0.5, coordinates: { x: 58, y: 45 } },
    { id: 'p-9', device_id: 'DEV-009', name: 'Purok 9', barangay: 'Bogo', baseline_household_count: 50, baseline_vulnerable_count: 10, active_needs: [], status: 'unknown', battery_pct: 12, last_event_at: new Date(Date.now() - 1000 * 60 * 60 * 9), hours_since_heartbeat: 9, coordinates: { x: 80, y: 20 } },
    { id: 'p-89', device_id: 'DEV-089', name: 'Purok Santos', barangay: 'Bogo', baseline_household_count: 22, baseline_vulnerable_count: 3, active_needs: ['TABANG'], status: 'attention', battery_pct: 88, last_event_at: new Date(Date.now() - 1000 * 60 * 2), hours_since_heartbeat: 0, coordinates: { x: 35, y: 55 } },
    { id: 'p-214', device_id: 'DEV-214', name: 'Purok Mendoza', barangay: 'Bogo', baseline_household_count: 31, baseline_vulnerable_count: 2, active_needs: ['TUBIG'], status: 'attention', battery_pct: 75, last_event_at: new Date(Date.now() - 1000 * 60 * 12), hours_since_heartbeat: 0, coordinates: { x: 45, y: 65 } },
];

const MOCK_PACKETS: Packet[] = [
    { id: 'pkt-1', device_id: 'DEV-089', purok_name: 'Purok Santos', need_type: 'TABANG', is_double_press: true, timestamp: new Date(Date.now() - 1000 * 60 * 2), acked: false },
    { id: 'pkt-2', device_id: 'DEV-214', purok_name: 'Purok Mendoza', need_type: 'TUBIG', is_double_press: false, timestamp: new Date(Date.now() - 1000 * 60 * 12), acked: false },
    { id: 'pkt-3', device_id: 'DEV-001', purok_name: 'Purok 1', need_type: 'LUWAS', is_double_press: false, timestamp: new Date(Date.now() - 1000 * 60 * 30), acked: true },
    { id: 'pkt-4', device_id: 'DEV-007', purok_name: 'Purok 7', need_type: 'TUBIG', is_double_press: false, timestamp: new Date(Date.now() - 1000 * 60 * 35), acked: true },
    { id: 'pkt-5', device_id: 'DEV-005', purok_name: 'Purok 5', need_type: 'TUBIG', is_double_press: false, timestamp: new Date(Date.now() - 1000 * 60 * 40), acked: true },
    { id: 'pkt-6', device_id: 'DEV-003', purok_name: 'Purok 3', need_type: 'TUBIG', is_double_press: false, timestamp: new Date(Date.now() - 1000 * 60 * 45), acked: true },
];

const MOCK_ANOMALIES: Anomaly[] = [
    {
        id: 'anm-1',
        type: 'CLUSTER',
        title: 'CLUSTER ANOMALY DETECTED',
        description: '3 neighboring puroks pressed TUBIG within 45 minutes. Probable water line failure.',
        related_purok_ids: ['p-3', 'p-5', 'p-7'],
        severity: 'red'
    },
    {
        id: 'anm-2',
        type: 'SILENCE',
        title: 'SILENCE ANOMALY',
        description: 'Purok 9 has not sent a heartbeat in 9 hours; the last press before that was a held TABANG.',
        related_purok_ids: ['p-9'],
        severity: 'amber'
    },
    {
        id: 'anm-3',
        type: 'ESCALATION',
        title: 'SEVERITY ESCALATION',
        description: 'Purok Mendoza (baseline vulnerability > 0) has reported TUBIG for over 24 hours with no dispatch.',
        related_purok_ids: ['p-214'],
        severity: 'red'
    }
];

export function TingogProvider({ children }: { children: ReactNode }) {
    const [puroks, setPuroks] = useState<Purok[]>(MOCK_PUROKS);
    const [packets, setPackets] = useState<Packet[]>(MOCK_PACKETS);
    const [anomalies, setAnomalies] = useState<Anomaly[]>(MOCK_ANOMALIES);

    const ackPacket = (id: string) => {
        setPackets(prev => prev.map(p => p.id === id ? { ...p, acked: true } : p));
    };

    const dispatchResponse = (purokId: string) => {
        // Clear active needs and set to stable
        setPuroks(prev => prev.map(p => {
            if (p.id === purokId) {
                return { ...p, active_needs: [], status: 'stable' };
            }
            return p;
        }));
    };

    // Simulate incoming data over time
    useEffect(() => {
        const interval = setInterval(() => {
            // Randomly generate a LUWAS heartbeat for a random stable purok occasionally
            if (Math.random() > 0.8) {
                const stablePuroks = puroks.filter(p => p.status === 'stable');
                if (stablePuroks.length > 0) {
                    const randomPurok = stablePuroks[Math.floor(Math.random() * stablePuroks.length)];
                    const newPacket: Packet = {
                        id: `pkt-${Date.now()}`,
                        device_id: randomPurok.device_id,
                        purok_name: randomPurok.name,
                        need_type: 'LUWAS',
                        is_double_press: false,
                        timestamp: new Date(),
                        acked: false
                    };

                    setPackets(prev => [newPacket, ...prev]);
                    setPuroks(prev => prev.map(p => {
                        if (p.id === randomPurok.id) {
                            return { ...p, last_event_at: new Date(), hours_since_heartbeat: 0 };
                        }
                        return p;
                    }));
                }
            }
        }, 15000); // Check every 15s

        return () => clearInterval(interval);
    }, [puroks]);

    return (
        <TingogContext.Provider value={{ puroks, packets, anomalies, ackPacket, dispatchResponse }}>
            {children}
        </TingogContext.Provider>
    );
}

export function useTingog() {
    const context = useContext(TingogContext);
    if (context === undefined) {
        throw new Error('useTingog must be used within a TingogProvider');
    }
    return context;
}
