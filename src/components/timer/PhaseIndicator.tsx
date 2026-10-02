import { PHASE_LABEL, PHASES, type Phase } from '@/lib/timer/types';

interface Props {
  phase: Phase;
  focusDoneInCycle: number;
  longBreakEvery: number;
}

function cycleText(phase: Phase, done: number, every: number): string {
  if (phase === 'longBreak') return `Cycle of ${every} complete`;
  if (phase === 'focus') return `Session ${Math.min(done + 1, every)} of ${every}`;
  return `${Math.min(done, every)} of ${every} done`;
}

export function PhaseIndicator({ phase, focusDoneInCycle, longBreakEvery }: Props) {
  const every = Math.max(1, longBreakEvery);
  const done = phase === 'longBreak' ? every : Math.min(focusDoneInCycle, every);

  return (
    <div className="flex flex-col items-center gap-4">
      <ol className="flex rounded-full border border-line bg-surface p-1 text-sm" aria-label="Phases">
        {PHASES.map((p) => {
          const active = p === phase;
          return (
            <li
              key={p}
              aria-current={active ? 'step' : undefined}
              data-testid={active ? 'active-phase' : undefined}
              className={`rounded-full px-3 py-1.5 transition-colors sm:px-4 ${
                active ? 'bg-accent font-semibold text-on-accent' : 'text-muted'
              }`}
            >
              {PHASE_LABEL[p]}
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3">
        <span className="flex gap-1.5" aria-hidden="true">
          {Array.from({ length: every }, (_, i) => {
            const filled = i < done;
            const current = phase === 'focus' && i === done;
            return (
              <span
                key={i}
                className={`h-2.5 w-2.5 rounded-full border-2 ${
                  filled ? 'border-accent bg-accent' : current ? 'border-accent' : 'border-ink/20'
                }`}
              />
            );
          })}
        </span>
        <span className="text-sm text-muted">{cycleText(phase, focusDoneInCycle, every)}</span>
      </div>
    </div>
  );
}
