/**
 * Minimal typings for the Spotify Web Playback SDK, written from the official reference:
 * https://developer.spotify.com/documentation/web-playback-sdk/reference
 * Only what this app uses; `duration` is marked optional because the reference
 * does not list it on WebPlaybackState.
 */
export {};

declare global {
  namespace Spotify {
    interface PlayerInit {
      name: string;
      getOAuthToken: (cb: (accessToken: string) => void) => void;
      volume?: number;
      enableMediaSession?: boolean;
    }

    interface Image {
      url: string;
      height?: number | null;
      width?: number | null;
    }

    interface Track {
      uri: string;
      id: string | null;
      type: 'track' | 'episode' | 'ad';
      media_type: 'audio' | 'video';
      name: string;
      is_playable: boolean;
      album: { uri: string; name: string; images: Image[] };
      artists: { uri: string; name: string }[];
    }

    interface PlaybackState {
      context: { uri: string | null; metadata: Record<string, unknown> | null };
      disallows: Partial<Record<string, boolean>>;
      paused: boolean;
      position: number;
      duration?: number;
      repeat_mode: 0 | 1 | 2;
      shuffle: boolean;
      track_window: {
        current_track: Track;
        previous_tracks: Track[];
        next_tracks: Track[];
      };
    }

    interface WebPlaybackInstance {
      device_id: string;
    }

    interface PlaybackError {
      message: string;
    }

    type ErrorEventName = 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error';

    class Player {
      constructor(options: PlayerInit);
      connect(): Promise<boolean>;
      disconnect(): void;
      addListener(event: 'ready' | 'not_ready', cb: (instance: WebPlaybackInstance) => void): boolean;
      addListener(event: 'player_state_changed', cb: (state: PlaybackState | null) => void): boolean;
      addListener(event: 'autoplay_failed', cb: () => void): boolean;
      addListener(event: ErrorEventName, cb: (error: PlaybackError) => void): boolean;
      removeListener(event: string): boolean;
      getCurrentState(): Promise<PlaybackState | null>;
      setName(name: string): Promise<void>;
      getVolume(): Promise<number>;
      setVolume(volume: number): Promise<void>;
      pause(): Promise<void>;
      resume(): Promise<void>;
      togglePlay(): Promise<void>;
      seek(positionMs: number): Promise<void>;
      previousTrack(): Promise<void>;
      nextTrack(): Promise<void>;
      activateElement(): Promise<void>;
    }
  }

  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: typeof Spotify;
  }
}
