/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, type ReactNode, useRef } from 'react';
import { io } from 'socket.io-client';

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
    coordinates: { lat: number, lng: number }; // Real GPS coordinates
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
    simulateEarthquake: () => void;
    stopSimulation: () => void;
    isSimulating: boolean;
}

const TingogContext = createContext<TingogContextType | undefined>(undefined);

// ==========================================
// 📖 DEVICE REGISTRY (Offline Database Simulation) 
// ==========================================
const REGISTERED_PUROKS: Purok[] = [
    { id: 'p-1', device_id: 'DEV-001', name: 'Purok 1', barangay: 'Bogo', baseline_household_count: 45, baseline_vulnerable_count: 5, active_needs: [], status: 'unknown', battery_pct: 100, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0506, lng: 124.0044 } },
    { id: 'p-2', device_id: 'DEV-002', name: 'Purok 2', barangay: 'Bogo', baseline_household_count: 62, baseline_vulnerable_count: 12, active_needs: [], status: 'unknown', battery_pct: 85, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0510, lng: 124.0020 } },
    { id: 'p-3', device_id: 'DEV-003', name: 'Purok 3', barangay: 'Bogo', baseline_household_count: 38, baseline_vulnerable_count: 3, active_needs: [], status: 'unknown', battery_pct: 78, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0490, lng: 124.0060 } },
    { id: 'p-5', device_id: 'DEV-005', name: 'Purok 5', barangay: 'Bogo', baseline_household_count: 55, baseline_vulnerable_count: 8, active_needs: [], status: 'unknown', battery_pct: 88, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0485, lng: 124.0070 } },
    { id: 'p-7', device_id: 'DEV-007', name: 'Purok 7', barangay: 'Bogo', baseline_household_count: 41, baseline_vulnerable_count: 4, active_needs: [], status: 'unknown', battery_pct: 91, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0520, lng: 124.0030 } },
    { id: 'p-89', device_id: 'DEV-089', name: 'Purok Santos (Physical)', barangay: 'Bogo', baseline_household_count: 22, baseline_vulnerable_count: 3, active_needs: [], status: 'unknown', battery_pct: 100, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0450, lng: 124.0100 } },
    { id: 'p-214', device_id: 'DEV-214', name: 'Purok Mendoza', barangay: 'Bogo', baseline_household_count: 31, baseline_vulnerable_count: 2, active_needs: [], status: 'unknown', battery_pct: 75, last_event_at: new Date(), hours_since_heartbeat: 0, coordinates: { lat: 11.0400, lng: 124.0150 } },
];

export function TingogProvider({ children }: { children: ReactNode }) {
    // Start completely empty!
    const [puroks, setPuroks] = useState<Purok[]>([]);
    const [packets, setPackets] = useState<Packet[]>([]);
    const [anomalies] = useState<Anomaly[]>([]);
    const [isSimulating, setIsSimulating] = useState(false);
    const simulationIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

    const stopSimulation = () => {
        if (simulationIntervalRef.current) {
            clearInterval(simulationIntervalRef.current);
            simulationIntervalRef.current = null;
        }
        setIsSimulating(false);
        setPuroks([]); // Clear everyone from map to reset
        setPackets([]);
    };

    const simulateEarthquake = () => {
        setIsSimulating(true);
        // 1. Initial State: Load everyone as UNKNOWN / SILENT
        setPuroks(REGISTERED_PUROKS.map(p => ({
            ...p,
            status: 'unknown',
            active_needs: [],
            last_event_at: new Date(Date.now() - 1000 * 60 * 60 * 24), // Set event to way in the past so they look completely silent
            hours_since_heartbeat: 24
        })));
        setPackets([]);
        
        // 2. Automated Mock Chaos
        let mockCounter = 0;
        simulationIntervalRef.current = setInterval(() => {
            setPuroks(prev => {
                // Find a mock purok that is still 'unknown' and is NOT our physical board DEV-089
                const silentMocks = prev.filter(p => p.status === 'unknown' && p.device_id !== 'DEV-089');
                
                if (silentMocks.length === 0) {
                    if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
                    setIsSimulating(false); // Stop when all mocks are done, but don't clear the map!
                    return prev;
                }

                // Pick a random silent mock purok
                const target = silentMocks[Math.floor(Math.random() * silentMocks.length)];
                
                // Assign a random need
                const possibleNeeds: NeedType[][] = [
                    ['LUWAS'], 
                    ['TABANG'], 
                    ['TUBIG', 'PAGKAON'], 
                    ['TAMBAL']
                ];
                const needs = possibleNeeds[Math.floor(Math.random() * possibleNeeds.length)];
                const isLuwas = needs.includes('LUWAS');

                // Generate packet
                setPackets(oldPackets => [{
                    id: `pkt-sim-${Date.now()}`,
                    device_id: target.device_id,
                    purok_name: target.name,
                    need_type: needs[0],
                    is_double_press: Math.random() > 0.8, // 20% chance of double press
                    timestamp: new Date(),
                    acked: false
                }, ...oldPackets]);

                return prev.map(p => {
                    if (p.id === target.id) {
                        return {
                            ...p,
                            active_needs: isLuwas ? [] : needs,
                            status: isLuwas ? 'stable' : 'attention',
                            last_event_at: new Date(),
                            hours_since_heartbeat: 0
                        };
                    }
                    return p;
                });
            });

            mockCounter++;
            if (mockCounter >= 6) { // Ensure it eventually stops if something goes wrong
                if (simulationIntervalRef.current) clearInterval(simulationIntervalRef.current);
                setIsSimulating(false);
            }
        }, 3000); // Wait 3 seconds between each random update
    };

    // Socket.io integration
    useEffect(() => {
        const socket = io('http://localhost:3001');

        socket.on('purok-update', (payload: any) => {
            const needs = payload.parsed_needs as NeedType[];
            const isLuwas = needs.includes('LUWAS');

            let purokName = 'Unknown Purok';

            setPuroks(prev => {
                const existingIndex = prev.findIndex(p => p.device_id === payload.device_id);
                
                if (existingIndex >= 0) {
                    // Update existing pin on the map
                    const updated = [...prev];
                    const p = updated[existingIndex];
                    purokName = p.name;
                    updated[existingIndex] = {
                        ...p,
                        active_needs: isLuwas ? [] : needs,
                        status: isLuwas ? 'stable' : 'attention',
                        last_event_at: new Date(),
                        hours_since_heartbeat: 0,
                    };
                    return updated;
                } else {
                    // It's the first time we've seen this device! Look it up in the registry to get its GPS coordinates
                    const registeredData = REGISTERED_PUROKS.find(r => r.device_id === payload.device_id);
                    if (registeredData) {
                        purokName = registeredData.name;
                        return [...prev, {
                            ...registeredData,
                            active_needs: isLuwas ? [] : needs,
                            status: isLuwas ? 'stable' : 'attention',
                            last_event_at: new Date(),
                            hours_since_heartbeat: 0,
                        }];
                    }
                    return prev;
                }
            });

            // Generate a packet for the stream
            if (needs.length > 0) {
                setPackets(prev => [{
                    id: `pkt-${Date.now()}`,
                    device_id: payload.device_id,
                    purok_name: purokName,
                    need_type: needs[0], // just take the first need for the packet stream
                    is_double_press: payload.press_type === 'double',
                    timestamp: new Date(),
                    acked: false
                }, ...prev]);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    return (
        <TingogContext.Provider value={{ puroks, packets, anomalies, ackPacket, dispatchResponse, simulateEarthquake, stopSimulation, isSimulating }}>
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
