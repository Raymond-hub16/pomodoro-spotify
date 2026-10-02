import { formatClock } from '@/lib/timer/format';
import { PHASE_LABEL, type Phase, type TimerStatus } from '@/lib/timer/types';

interface Props {
  remainingSec: number;
  durationMs: number;
  phase: Phase;
  status: TimerStatus;
}

const SIZE = 300;
const C = SIZE / 2;
const R = 112;
const CIRC = 2 * Math.PI * R;
const TICKS = 60;

const STATUS_TEXT: Record<TimerStatus, string> = { idle: 'Ready', running: 'Running', paused: 'Paused' };

/** Kitchen-timer style dial: the colored arc is the time left, winding back toward twelve o'clock as it runs out. */
export function TimerRing({ remainingSec, durationMs, phase, status }: Props) {
  const total = Math.max(1, durationMs / 1000);
  const fraction = Math.min(1, Math.max(0, remainingSec / total));
  const litTicks = Math.ceil(fraction * TICKS);

  return (
    <div role="timer" aria-label={`${PHASE_LABEL[phase]} timer`} className="@container relative mx-auto aspect-square w-full max-w-[22rem]">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full" aria-hidden="true" focusable="false">
        {Array.from({ length: TICKS }, (_, i) => {
          const major = i % 5 === 0;
          const angle = (i / TICKS) * 2 * Math.PI - Math.PI / 2;
          const r1 = 146;
          const r2 = major ? 132 : 138;
          return (
            <line
              key={i}
              x1={C + r1 * Math.cos(angle)}
              y1={C + r1 * Math.sin(angle)}
              x2={C + r2 * Math.cos(angle)}
              y2={C + r2 * Math.sin(angle)}
              stroke="currentColor"
              strokeWidth={major ? 2.5 : 1.5}
              strokeLinecap="round"
              className={i < litTicks ? 'text-ink/45' : 'text-ink/12'}
            />
          );
        })}
        <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth={14} className="text-ink/8" />
        <circle
          cx={C}
          cy={C}
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - fraction)}
          transform={`rotate(-90 ${C} ${C})`}
          className="transition-[stroke-dashoffset,stroke] duration-1000 ease-linear motion-reduce:transition-none"
          opacity={fraction === 0 ? 0 : 1}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p
          className={`tabular font-dial leading-none font-semibold tracking-tight text-ink ${
            remainingSec >= 3600 ? 'text-[length:12cqw]' : 'text-[length:16cqw]'
          }`}
        >
          {formatClock(remainingSec)}
        </p>
        <p className="mt-3 text-sm text-muted">
          {PHASE_LABEL[phase]}
          <span className={status === 'paused' ? 'text-accent font-medium' : ''}>
            {status === 'running' ? '' : `, ${STATUS_TEXT[status].toLowerCase()}`}
          </span>
        </p>
      </div>
    </div>
  );
}
