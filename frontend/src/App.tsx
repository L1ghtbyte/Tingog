import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { KPIStrip } from './components/KPIStrip';
import { AISitRep } from './components/AISitRep';
import { TacticalMap } from './components/TacticalMap';
import { PacketStream } from './components/PacketStream';

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
        <div className="bg-background text-on-surface h-screen w-screen overflow-hidden flex flex-col font-body-md select-none">
            <Header toggleTheme={toggleTheme} isDarkMode={isDarkMode} />
            <KPIStrip />
            <div className="flex-1 flex gap-2 p-2 overflow-hidden bg-background">
                <AISitRep />
                <TacticalMap />
                <PacketStream />
            </div>
        </div>
    );
}

export default App;
