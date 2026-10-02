/** Versioned so an old schema can be dropped without touching the others. */
export const STORAGE_KEYS = {
  settings: 'pomodoro:settings:v1',
  timer: 'pomodoro:timer:v1',
  stats: 'pomodoro:stats:v1',
  spotify: 'pomodoro:spotify:v1',
} as const;
