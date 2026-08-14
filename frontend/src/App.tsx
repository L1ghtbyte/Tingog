import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { KPIStrip } from './components/KPIStrip';
import { AISitRep } from './components/AISitRep';
import { TacticalMap } from './components/TacticalMap';
import { PacketStream } from './components/PacketStream';

import { TingogProvider } from './context/TingogContext';

function App() {
    const [isDarkMode, setIsDarkMode] = useState(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme) {
                return savedTheme === 'dark';
            }
            return window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        return true; 
    });

    useEffect(() => {
        const html = document.documentElement;
        if (isDarkMode) {
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            html.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [isDarkMode]);

    const toggleTheme = () => setIsDarkMode(prev => !prev);

    return (
        <TingogProvider>
            <div className="bg-background text-on-surface min-h-screen lg:h-screen w-full flex flex-col font-body-md select-none overflow-x-hidden">
                <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
                <KPIStrip />
                <div className="flex-1 flex flex-col lg:flex-row gap-2 p-2 overflow-y-auto lg:overflow-hidden bg-background">
                    <AISitRep />
                    <TacticalMap />
                    <PacketStream />
                </div>
            </div>
        </TingogProvider>
    );
}

export default App;
