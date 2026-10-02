import type { PersistStorage, StorageValue } from 'zustand/middleware';
import type { z } from 'zod';

/**
 * localStorage adapter for zustand `persist` that:
 * - stores the raw persisted value (no `{ state, version }` wrapper), so each key
 *   holds exactly the documented shape;
 * - validates on read with Zod and returns null (= use defaults) on corrupt JSON
 *   or a schema mismatch, never throwing;
 * - skips writes whose serialized value did not change, so a store that updates
 *   every tick only writes on real state transitions.
 */
export function createValidatedStorage<T>(schema: z.ZodType<T>): PersistStorage<T> {
  let lastWritten: string | null = null;

  const storage = (): Storage | null => {
    try {
      return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return null; // e.g. disabled storage in privacy mode
    }
  };

  return {
    getItem(name): StorageValue<T> | null {
      const ls = storage();
      if (!ls) return null;
      let raw: string | null;
      try {
        raw = ls.getItem(name);
      } catch {
        return null;
      }
      if (raw === null) return null;
      lastWritten = raw;
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        return null;
      }
      const parsed = schema.safeParse(json);
      return parsed.success ? { state: parsed.data, version: 0 } : null;
    },
    setItem(name, value) {
      const ls = storage();
      if (!ls) return;
      const raw = JSON.stringify(value.state);
      if (raw === lastWritten) return;
      try {
        ls.setItem(name, raw);
        lastWritten = raw;
      } catch {
        // Quota exceeded or storage disabled: the app keeps working in memory.
      }
    },
    removeItem(name) {
      lastWritten = null;
      try {
        storage()?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}
