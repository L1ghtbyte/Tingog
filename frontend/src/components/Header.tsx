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
        <header className="bg-surface border-b border-outline-variant h-[56px] flex justify-between items-center w-full px-gutter z-50 shrink-0">
            <div className="flex items-center gap-4">
                <img alt="Tingog Brand Logo" className="h-8 w-8 object-contain rounded-sm bg-surface-container p-1 border border-outline-variant" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDcGCT-IQenDWK_ePkDUKyMq961Wp4NVyEDd_PCLJeQwgbbpO0IMlmlfiaVD40MA5YPLVwSO8kDEt5R6LMqE3r0UzW-ZYYg4PkaU94xTnIbMv8Y-dgCcGozmS8UApwHilyqcJ47vQwmNaOuK-qP8dy44AlJpIibf3Gbgsb7G2nyUGq0LjhMoITPVZdVe3sxmeFFN3RWg267JFcGSCohmsyOVgry0p3Noad523Zk63JoyfHlFvfc-tsh" />
                <div>
                    <h1 className="text-headline-lg font-headline-lg font-bold text-primary tracking-tighter leading-none">TINGOG</h1>
                    <span className="text-label-caps font-label-caps text-on-surface-variant leading-none">HOUSEHOLD EMERGENCY RESPONSE SYSTEM</span>
                </div>
            </div>
            
            <div className="flex flex-col items-center">
                <span className="text-data-tabular font-data-tabular font-bold text-white tracking-widest">{timeString}</span>
                <span className="text-label-caps font-label-caps text-on-surface-variant">{dateString}</span>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-surface-container border border-outline-variant rounded-sm">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    <span className="text-label-caps font-label-caps text-on-surface">GATEWAY 01 (BOGO) - ONLINE | RSSI: -78dBm</span>
                </div>
                
                <div className="flex items-center gap-2">
                    <button className="p-2 hover:bg-surface-container-highest transition-colors duration-75 rounded-sm flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">schedule</span>
                    </button>
                    <button 
                        onClick={toggleTheme}
                        className="p-2 hover:bg-surface-container-highest transition-colors duration-75 rounded-sm flex items-center justify-center">
                        <span className="material-symbols-outlined text-on-surface-variant text-[20px]">
                            {isDarkMode ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>
                    <img alt="User Profile" className="w-8 h-8 rounded-sm object-cover border border-outline-variant" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAeUaiwDWVLFYw937ZLT2X2Fw8jGzgo7MpefjSPdyy34rxxI9waViEpdXbEDekqlsyXVjn-h2fHB84Skqec3PmlL5yZxUyV6urvOhnGZ7rFD8ObwH5eH9rLDacA5FMGSm7MLro2kuu4hIdj3hHN13dlMJnAlIynw4V9qLWYT3N6ZCSPBDqvzJdM1qwCWlgKdKOOveficQ8XKZ84Nk2Iybe1ky-NA61w_ueUgm9hOymSHNFaso9AsOxD" />
                </div>
            </div>
        </header>
    );
}
