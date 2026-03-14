'use client';

interface Props {
    steps: string[];
}

export function ProgressTracker({ steps }: Props) {
    if (steps.length === 0) return null;

    return (
        <div className="font-mono text-xs space-y-1.5">
            {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                    <span className="text-emerald-500 shrink-0">&gt;</span>
                    <span className="text-zinc-400">{step}</span>
                </div>
            ))}
            <div className="flex items-center gap-2">
                <span className="text-emerald-500">&gt;</span>
                <span className="inline-block w-1.5 h-3.5 bg-emerald-400 cursor-blink" />
            </div>
        </div>
    );
}
