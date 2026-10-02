import { expect, test } from '@playwright/test';
import { stubNotifications, stubSpotifyLoggedOut } from './helpers';

// The single end-to-end happy path from the spec:
// open without login → set focus to 5 seconds → start → transition → notification + short break.
test('a 5-second focus session ends with a notification and a short break', async ({ page }) => {
  await stubNotifications(page);
  await stubSpotifyLoggedOut(page);

  await page.goto('/');
  await expect(page.getByTestId('active-phase')).toHaveText('Focus');
  await expect(page.getByRole('link', { name: 'Log in with Spotify' })).toBeVisible();

  // 0.0834 min rounds to 5 s.
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await dialog.getByRole('spinbutton', { name: 'Focus' }).fill('0.0834');
  await dialog.getByRole('button', { name: 'Save settings' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('timer')).toContainText('00:05');

  await page.getByTestId('primary-control').click();
  await expect(page.getByTestId('primary-control')).toHaveText(/Pause/);

  await expect(page.getByTestId('active-phase')).toHaveText('Short break', { timeout: 10_000 });
  await expect(page.getByTestId('stats-today')).toContainText('1 session');

  const notifications = await page.evaluate(() => window.__notifications);
  expect(notifications).toEqual([{ title: 'Focus session done', body: 'Take a 5-minute break.' }]);
});
