import { z } from 'zod';
import type { DayStat, Settings, TimerSnapshot } from '@/lib/timer/types';

const seconds = z.number().int().min(1).max(4 * 60 * 60);

export const SettingsSchema = z.object({
  durations: z.object({ focus: seconds, shortBreak: seconds, longBreak: seconds }),
  longBreakEvery: z.number().int().min(1).max(12),
  autoStartBreak: z.boolean(),
  autoStartFocus: z.boolean(),
  soundEnabled: z.boolean(),
  notificationsEnabled: z.boolean(),
  pauseMusicOnBreak: z.boolean(),
}) satisfies z.ZodType<Settings>;

export const TimerSnapshotSchema = z.object({
  phase: z.enum(['focus', 'shortBreak', 'longBreak']),
  status: z.enum(['idle', 'running', 'paused']),
  endsAt: z.number().finite().nullable(),
  remainingMs: z.number().finite().min(0),
  durationMs: z.number().finite().min(1000),
  focusDoneInCycle: z.number().int().min(0),
}) satisfies z.ZodType<TimerSnapshot>;

export const DayStatsSchema = z.array(
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    focusCount: z.number().int().min(0),
    focusSeconds: z.number().int().min(0),
  }),
) satisfies z.ZodType<DayStat[]>;

export const PlaylistRefSchema = z
  .object({ playlistId: z.string().min(1), playlistName: z.string() })
  .nullable();

export type PlaylistRef = NonNullable<z.infer<typeof PlaylistRefSchema>>;
