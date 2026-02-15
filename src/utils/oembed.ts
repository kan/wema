/**
 * Convert a service URL to its embeddable iframe URL (synchronous).
 * Returns the converted embed URL, or the original URL if no conversion is known.
 */
export function toEmbedUrl(url: string): string {
  for (const rule of EMBED_RULES) {
    const match = url.match(rule.pattern);
    if (match) return rule.toEmbed(match);
  }
  return url;
}

/** Bluesky handle-based URL pattern */
const BSKY_HANDLE_RE = /^https?:\/\/bsky\.app\/profile\/([^/]+)\/post\/([a-zA-Z0-9]+)/;

/**
 * Convert a service URL to its embeddable iframe URL (async).
 * Handles services that require API resolution (e.g. Bluesky handle → DID).
 */
export async function toEmbedUrlAsync(url: string): Promise<string> {
  // Try sync rules first
  const sync = toEmbedUrl(url);
  if (sync !== url) return sync;

  // Bluesky: resolve handle to DID via public API
  const bskyMatch = url.match(BSKY_HANDLE_RE);
  if (bskyMatch && !bskyMatch[1].startsWith('did:')) {
    try {
      const res = await fetch(
        `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(bskyMatch[1])}`,
      );
      if (res.ok) {
        const data = await res.json() as { did: string };
        return `https://embed.bsky.app/embed/${data.did}/app.bsky.feed.post/${bskyMatch[2]}`;
      }
    } catch { /* fall through to original URL */ }
  }

  return url;
}

interface EmbedRule {
  pattern: RegExp;
  toEmbed: (match: RegExpMatchArray) => string;
}

const EMBED_RULES: EmbedRule[] = [
  // YouTube: watch?v=ID
  {
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/,
    toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  // YouTube: shorts/ID
  {
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
    toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  // YouTube: youtu.be/ID
  {
    pattern: /^https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
    toEmbed: (m) => `https://www.youtube.com/embed/${m[1]}`,
  },
  // YouTube: already embed URL — pass through
  {
    pattern: /^https?:\/\/(?:www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
    toEmbed: (m) => m[0],
  },
  // Vimeo: vimeo.com/ID
  {
    pattern: /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/,
    toEmbed: (m) => `https://player.vimeo.com/video/${m[1]}`,
  },
  // Vimeo: already player URL — pass through
  {
    pattern: /^https?:\/\/player\.vimeo\.com\/video\/\d+/,
    toEmbed: (m) => m[0],
  },
  // Spotify: track/album/playlist/episode
  {
    pattern: /^https?:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/,
    toEmbed: (m) => `https://open.spotify.com/embed/${m[1]}/${m[2]}`,
  },
  // Google Slides
  {
    pattern: /^https?:\/\/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/,
    toEmbed: (m) => `https://docs.google.com/presentation/d/${m[1]}/embed`,
  },
  // Google Maps
  {
    pattern: /^https?:\/\/(?:www\.)?google\.[a-z.]+\/maps\/.+/,
    toEmbed: (m) => `https://maps.google.com/maps?output=embed&q=${encodeURIComponent(m[0])}`,
  },
  // Twitter/X: tweet → embed using platform.twitter.com (no JS needed)
  {
    pattern: /^https?:\/\/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/,
    toEmbed: (m) => `https://platform.twitter.com/embed/Tweet.html?id=${m[2]}`,
  },
  // Bluesky: bsky.app/profile/did:xxx/post/RKEY (DID already present)
  {
    pattern: /^https?:\/\/bsky\.app\/profile\/(did:[^/]+)\/post\/([a-zA-Z0-9]+)/,
    toEmbed: (m) => `https://embed.bsky.app/embed/${m[1]}/app.bsky.feed.post/${m[2]}`,
  },
];
