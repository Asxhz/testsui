'use client';

import { ChatInterface } from '@/components/ChatInterface';

export default function Home() {
    return (
        <main className="min-h-screen flex flex-col bg-zinc-950 bg-dot-pattern">
            <div className="flex-1 w-full">
                <ChatInterface />
            </div>

            <footer className="py-6 text-center text-zinc-600 text-xs font-mono border-t border-zinc-900">
                <p>Powered by Polymarket &bull; ActuaryAI Risk Engine</p>
            </footer>
        </main>
    );
}
