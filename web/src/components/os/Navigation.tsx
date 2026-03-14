'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const items = [
    { label: 'Advisor', href: '/', active: pathname === '/' || pathname === '/results' },
    { label: 'Ledger', href: '/ledger', active: pathname === '/ledger' },
  ];

  return (
    <aside className="fixed top-0 left-0 h-screen w-48 bg-zinc-900/80 border-r border-zinc-800 flex flex-col z-30 backdrop-blur-sm">
      <div className="px-4 py-5 border-b border-zinc-800">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-2 w-2 rounded-full bg-emerald-400 group-hover:animate-pulse" />
          <span className="text-base font-bold tracking-tight text-zinc-50">
            Actuary<span className="text-emerald-400">AI</span>
          </span>
        </Link>
        <p className="text-[9px] font-mono text-zinc-600 mt-1 uppercase tracking-widest">
          Risk Intelligence
        </p>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md text-xs font-mono uppercase tracking-wider transition-colors ${
              item.active
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 border border-transparent'
            }`}
          >
            {item.label === 'Advisor' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
            {item.label === 'Ledger' && <span className="text-sm">☰</span>}
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-zinc-800 space-y-1">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[8px] font-mono text-zinc-600 uppercase">XRPL Testnet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          <span className="text-[8px] font-mono text-zinc-600 uppercase">Sui Testnet</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
          <span className="text-[8px] font-mono text-zinc-700 uppercase">Liquid</span>
        </div>
        <p className="text-[8px] font-mono text-zinc-700 uppercase tracking-widest mt-2">
          Powered by Polymarket
        </p>
      </div>
    </aside>
  );
}
