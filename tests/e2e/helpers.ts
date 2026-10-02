import type { Page } from '@playwright/test';

declare global {
  interface Window {
    __notifications?: { title: string; body: string | undefined }[];
  }
}

/** Records notifications instead of showing them, and reports permission as granted. */
export async function stubNotifications(page: Page) {
  await page.addInitScript(() => {
    const shown: { title: string; body: string | undefined }[] = [];
    window.__notifications = shown;
    class FakeNotification {
      static permission = 'granted';
      static requestPermission() {
        return Promise.resolve('granted');
      }
      constructor(title: string, options?: { body?: string }) {
        shown.push({ title, body: options?.body });
      }
    }
    Object.defineProperty(window, 'Notification', { value: FakeNotification, configurable: true, writable: true });
  });
}

/** No Spotify in these tests: the app sees a logged-out user and never reaches the real API. */
export async function stubSpotifyLoggedOut(page: Page) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { status: 'loggedOut' } }));
  await page.route('**/api/spotify/**', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'NO_SESSION', message: 'Belum login ke Spotify' } } }),
  );
}
