'use client';

import { useEffect } from 'react';
import { useSpotifyStore } from '@/stores/spotifyStore';
import { CloseIcon } from './Icons';

const AUTO_DISMISS_MS = 7000;

/** Music-panel notices. Spotify problems surface here and never touch the timer. */
export function Toast() {
  const toast = useSpotifyStore((s) => s.toast);
  const dismiss = useSpotifyStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [toast, dismiss]);

  return (
    <div role="status" aria-live="polite" className="empty:hidden">
      {toast && (
        <div
          className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.tone === 'error' ? 'border-[var(--focus)]/40 bg-[var(--focus)]/10' : 'border-line bg-bg'
          }`}
        >
          <p className="flex-1">{toast.message}</p>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="-m-1 rounded-full p-1 text-muted hover:text-ink"
            aria-label="Dismiss message"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
