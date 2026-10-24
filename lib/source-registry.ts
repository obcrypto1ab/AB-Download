import type { ProviderId } from "./types";

/**
 * Source capability registry.
 *
 * Every provider declares exactly what it can do. The Supported Sources
 * section renders from this registry, so the UI can never claim an
 * integration that does not exist.
 */

export interface ProviderCapabilities {
  /** Structured metadata (title, author, thumbnails, …). */
  metadata: boolean;
  /** In-app preview (official embed or direct playback). */
  preview: boolean;
  /**
   * Download capability:
   * - "full"            — verified direct-file download implemented.
   * - "authorized-only" — download only when the creator supplies an
   *                       authorized direct file URL.
   * - "none"            — preview/metadata only.
   */
  download: "full" | "authorized-only" | "none";
}

export interface ProviderInfo {
  id: Exclude<ProviderId, null> | "other";
  name: string;
  capabilities: ProviderCapabilities;
  summary: string;
  example: string;
}

export const PROVIDER_INFO: ProviderInfo[] = [
  {
    id: "direct-media",
    name: "Direct media files",
    capabilities: { metadata: true, preview: true, download: "full" },
    summary:
      "Direct MP4, WebM, M4V, MOV, MKV, MP3, M4A, OGG, FLAC and other media-file URLs. Metadata is verified from the host's HTTP response headers and downloads stream through a size-limited, validated proxy.",
    example: "https://example.com/videos/clip.mp4"
  },
  {
    id: "youtube",
    name: "YouTube",
    capabilities: { metadata: true, preview: true, download: "authorized-only" },
    summary:
      "Watch, share, Shorts and embed URLs. Shows official oEmbed metadata, optional Data API statistics and the official embedded player. YouTube does not offer official direct-file downloads through third-party apps — if the creator publishes an authorized file, paste that direct URL to download it.",
    example: "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
  },
  {
    id: "vimeo",
    name: "Vimeo",
    capabilities: { metadata: true, preview: true, download: "none" },
    summary:
      "Public Vimeo video URLs via the official oEmbed API: title, author, duration, dimensions and thumbnail, plus the official player preview. No authorized direct-file download is available for standard Vimeo links.",
    example: "https://vimeo.com/76979871"
  },
  {
    id: "other",
    name: "Any other website",
    capabilities: { metadata: false, preview: false, download: "none" },
    summary:
      "Ordinary web pages are detected honestly: AB Download inspects response headers, sees the URL serves HTML rather than media, and explains what happened instead of pretending to download it.",
    example: "https://example.com/some/page"
  }
];

export type UrlKind = "youtube" | "vimeo" | "direct-media" | "unknown";

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "youtu.be"
]);

const YOUTUBE_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Recognize YouTube watch / share / shorts / embed / live URLs and return
 * the 11-character video id, or null. Playlist and channel URLs return null.
 */
export function detectYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return null;

  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/").filter(Boolean)[0] ?? null;
  } else {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "watch") {
      id = url.searchParams.get("v");
    } else if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
      id = parts[1] ?? null;
    }
  }
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

const VIMEO_ID_RE = /^\d{6,12}$/;

/** Recognize public Vimeo video URLs (vimeo.com/{id}, player.vimeo.com/video/{id}). */
export function detectVimeoVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "vimeo.com" && parts.length === 1) {
    return VIMEO_ID_RE.test(parts[0]) ? parts[0] : null;
  }
  if (host === "player.vimeo.com" && parts.length === 2 && parts[0] === "video") {
    return VIMEO_ID_RE.test(parts[1]) ? parts[1] : null;
  }
  return null;
}

const MEDIA_EXT_RE =
  /\.(mp4|m4v|webm|mov|mkv|avi|wmv|flv|ogv|mpg|mpeg|ts|3gp|mp3|m4a|aac|ogg|oga|opus|wav|flac)$/i;

/**
 * Classify a parsed URL. "direct-media" is a *candidate* only — the server
 * verifies via HTTP headers before anything is treated as downloadable.
 */
export function classifyUrl(url: URL): UrlKind {
  if (detectYouTubeVideoId(url)) return "youtube";
  if (detectVimeoVideoId(url)) return "vimeo";
  const path = url.pathname;
  if (MEDIA_EXT_RE.test(path)) return "direct-media";
  return "unknown";
}
