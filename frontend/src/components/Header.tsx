import { useEffect, useState } from 'react';
import { useTingog } from '../context/TingogContext';

interface HeaderProps {
    toggleTheme: () => void;
    isDarkMode: boolean;
}

export function Header({ toggleTheme, isDarkMode }: HeaderProps) {
    const { simulateEarthquake, stopSimulation, isSimulating } = useTingog();
    const [timeString, setTimeString] = useState('');

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const time = now.toLocaleTimeString('en-GB', { hour12: false }) + ' PHT';
            setTimeString(time);
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    const dateString = new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).toUpperCase();

    return (
        <header className="grid grid-cols-3 items-center gap-2 border border-outline-variant/70 bg-surface-container/35 px-3 py-1.5 backdrop-blur-sm lg:px-4">
            {/* Left: Time and Date */}
            <div className="flex flex-col items-start justify-center">
                <span className="text-[11px] leading-4 font-data-tabular font-bold text-on-surface tracking-widest">{timeString}</span>
                <span className="hidden text-[10px] leading-3 font-label-caps text-on-surface-variant sm:block">{dateString}</span>
            </div>

            {/* Center: Title */}
            <div className="flex flex-col items-center justify-center text-center">
                <h1 className="text-base font-headline-lg font-bold text-primary tracking-tight leading-none">TINGOG</h1>
                <span className="hidden sm:block text-[10px] leading-3 font-label-caps text-on-surface-variant">DISASTER RESPONSE SYSTEM</span>
            </div>
            
            {/* Right: Actions and Theme Toggle */}
            <div className="flex justify-end items-center gap-3">
                {!isSimulating ? (
                    <button 
                        onClick={simulateEarthquake}
                        className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 rounded-sm transition-colors text-label-caps font-label-caps font-bold">
                        <span className="material-symbols-outlined text-[18px]">public</span>
                        SIMULATE EARTHQUAKE
                    </button>
                ) : (
                    <button 
                        onClick={stopSimulation}
                        className="hidden md:flex items-center gap-2 px-3 py-1 bg-surface-container-highest hover:bg-outline-variant border border-outline-variant text-on-surface rounded-sm transition-colors text-label-caps font-label-caps font-bold">
                        <span className="material-symbols-outlined text-[18px]">stop_circle</span>
                        STOP SIMULATION
                    </button>
                )}
                <button 
                    onClick={toggleTheme}
                    className="flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-75 hover:bg-surface-container-highest">
                    <span className="material-symbols-outlined text-on-surface-variant text-[17px]">
                        {isDarkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </div>
        </header>
    );
}
