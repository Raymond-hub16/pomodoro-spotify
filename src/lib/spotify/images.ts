import type { SpotifyImage } from './schema';

/** Smallest image at least `minWidth` wide; falls back to the largest one. Spotify lists images largest first. */
export function pickImage(images: SpotifyImage[] | null | undefined, minWidth: number): string | null {
  if (!images || images.length === 0) return null;
  const sized = images.filter((i) => typeof i.width === 'number' && i.width >= minWidth);
  sized.sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sized[0] ?? images[0])?.url ?? null;
}
