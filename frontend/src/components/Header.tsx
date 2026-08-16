import { useEffect, useState } from 'react';

import { useTingog } from '../context/TingogContext';

import iconDark from '../assets/icon-dark.png';
import iconLight from '../assets/icon-light.png';
import wordDark from '../assets/word-dark.png';
import wordLight from '../assets/word-light.png';

interface HeaderProps {
    toggleTheme: () => void;
    isDarkMode: boolean;
    toggleMapStyle: () => void;
    mapStyle: 'humanitarian' | 'minimal';
}

export function Header({ toggleTheme, isDarkMode, toggleMapStyle, mapStyle }: HeaderProps) {
    const { lastUpdated, isStale, isSimulating, triggerEarthquake } = useTingog();
    const [timeString, setTimeString] = useState('');
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const updateClock = () => {
            const time = new Date().toLocaleTimeString('en-GB', { hour12: false }) + ' PHT';
            setTimeString(time);
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    const dateString = new Date()
        .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        .toUpperCase();

    const secondsSinceUpdate = lastUpdated ? Math.floor((now - lastUpdated.getTime()) / 1000) : null;

    return (
        <header className="grid grid-cols-3 items-center gap-2 border border-outline-variant/70 bg-surface-container/35 px-3 py-1.5 backdrop-blur-sm lg:px-4">
            {/* Left: Icon, Time/Date, connection status */}
            <div className="flex items-center gap-3">
                <img src={isDarkMode ? iconLight : iconDark} alt="Tingog Logo" className="h-8 w-auto object-contain" />
                <div className="flex flex-col items-start justify-center">
                    <span className="text-[11px] leading-4 font-data-tabular font-bold text-on-surface tracking-widest">{timeString}</span>
                    <span className="hidden text-[10px] leading-3 font-label-caps text-on-surface-variant xl:block">{dateString}</span>
                    <span className={`text-[9px] font-mono ${isStale ? 'text-red-400' : 'text-green-500'}`}>
                        {isStale
                            ? 'BACKEND UNREACHABLE'
                            : secondsSinceUpdate !== null
                              ? `LIVE — ${secondsSinceUpdate}s ago`
                              : 'connecting...'}
                    </span>
                </div>
            </div>

            {/* Center: Title Wordmark */}
            <div className="flex items-center justify-center">
                <img src={isDarkMode ? wordLight : wordDark} alt="TINGOG" className="h-6 w-auto object-contain" />
            </div>

            {/* Right: Demo trigger, map style, and Theme Toggle */}
            <div className="flex justify-end items-center gap-2 lg:gap-3">
                <button
                    onClick={triggerEarthquake}
                    disabled={isSimulating}
                    className="hidden md:flex items-center gap-1.5 px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 text-red-500 rounded-sm transition-colors text-[10px] font-label-caps font-bold disabled:opacity-50">
                    <span className="material-symbols-outlined text-[16px]">public</span>
                    {isSimulating ? 'RUNNING...' : 'SIMULATE EARTHQUAKE'}
                </button>
                <button
                    onClick={toggleMapStyle}
                    title={mapStyle === 'humanitarian' ? 'Switch to Minimal Map' : 'Switch to Detailed Map'}
                    className="flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-75 hover:bg-surface-container-highest">
                    <span className="material-symbols-outlined text-on-surface-variant text-[17px]">
                        {mapStyle === 'humanitarian' ? 'map' : 'layers'}
                    </span>
                </button>
                <button
                    onClick={toggleTheme}
                    title="Toggle Dark/Light Mode"
                    className="flex h-7 w-7 items-center justify-center rounded-sm transition-colors duration-75 hover:bg-surface-container-highest">
                    <span className="material-symbols-outlined text-on-surface-variant text-[17px]">
                        {isDarkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </div>
        </header>
    );
}
