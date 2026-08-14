import { useEffect, useState } from 'react';

interface HeaderProps {
    toggleTheme: () => void;
    isDarkMode: boolean;
}

export function Header({ toggleTheme, isDarkMode }: HeaderProps) {
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
        <header className="grid grid-cols-3 items-center p-3 bg-surface border-b border-outline-variant shrink-0 gap-2">
            {/* Left: Time and Date */}
            <div className="flex flex-col items-start justify-center">
                <span className="text-data-tabular font-data-tabular font-bold text-on-surface tracking-widest">{timeString}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant">{dateString}</span>
            </div>

            {/* Center: Title */}
            <div className="flex flex-col items-center justify-center text-center">
                <h1 className="text-headline-lg font-headline-lg font-bold text-primary tracking-tighter leading-none">TINGOG</h1>
                <span className="hidden sm:block text-label-caps font-label-caps text-on-surface-variant leading-none mt-1">DISASTER RESPONSE SYSTEM</span>
            </div>
            
            {/* Right: Theme Toggle only */}
            <div className="flex justify-end items-center">
                <button 
                    onClick={toggleTheme}
                    className="p-2 hover:bg-surface-container-highest transition-colors duration-75 rounded-sm flex items-center justify-center">
                    <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                        {isDarkMode ? 'light_mode' : 'dark_mode'}
                    </span>
                </button>
            </div>
        </header>
    );
}
