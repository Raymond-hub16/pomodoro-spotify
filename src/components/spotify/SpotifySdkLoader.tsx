'use client';

import Script from 'next/script';
import { sdkFailedToLoad } from '@/lib/spotify/player';

/**
 * Importing the player module defines `window.onSpotifyWebPlaybackSDKReady`
 * before this script runs. Only rendered for accounts that may be Premium:
 * a known Free account never loads the SDK.
 */
export function SpotifySdkLoader() {
  return <Script id="spotify-sdk" src="https://sdk.scdn.co/spotify-player.js" strategy="afterInteractive" onError={sdkFailedToLoad} />;
}
