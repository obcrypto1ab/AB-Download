import { parseHttpUrl, displayDomain } from "./url-validation";
import { classifyUrl, detectVimeoVideoId, detectYouTubeVideoId } from "./source-registry";
import {
  fileNameFromUrlPath,
  isAllowedMediaContentType,
  isStreamingManifest,
  MAX_ANALYZE_BYTES,
  pickFileNameFromDisposition
} from "./file-validation";
import { publicUserAgent, safeFetch } from "./ssrf";
import {
  NetworkError,
  TimeoutError,
  UpstreamError,
  BlockedUrlError
} from "./errors";
import type { AnalysisError, AnalysisResult, QualityOption } from "./types";

/**
 * Server-side metadata & capability analysis.
 *
 * Principles:
 * - Only officially provided data is used (public oEmbed endpoints, the
 *   optional official YouTube Data API, and plain HTTP response headers).
 * - Never fabricate qualities, sizes or durations.
 * - Direct media URLs are *verified* via headers before being offered
 *   as downloadable; HTML responses are honestly reported as web pages.
 */

const OEMBED_TIMEOUT_MS = 8_000;
const PROBE_TIMEOUT_MS = 12_000;

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      headers: { "user-agent": publicUserAgent(), accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new TimeoutError("The provider took too long to respond.");
    }
    throw new NetworkError("Could not reach the provider.");
  }
  if (!response.ok) {
    throw new UpstreamError(
      `Provider responded with HTTP ${response.status}.`,
      response.status
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError("The provider returned an unexpected response.", response.status);
  }
}

function errorResult(code: AnalysisError["code"], message: string, retryable: boolean): AnalysisError {
  return { ok: false, code, message, retryable };
}

/** Map a thrown error to a client-safe AnalysisError. */
export function toAnalysisError(error: unknown): AnalysisError {
  if (error instanceof UpstreamError) {
    const retryable = (error.httpStatus ?? 500) >= 500;
    return errorResult("upstream-error", error.message, retryable);
  }
  if (error instanceof TimeoutError) {
    return errorResult("timeout", error.message, true);
  }
  if (error instanceof NetworkError) {
    return errorResult("upstream-error", error.message, true);
  }
  if (error instanceof BlockedUrlError) {
    return errorResult("blocked-url", error.message, false);
  }
  return errorResult(
    "internal-error",
    "Something went wrong while analyzing that URL. Please try again.",
    true
  );
}

/** ───────────────────────────── YouTube ───────────────────────────── */

interface OEmbedResponse {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
}

interface DataApiVideo {
  snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string; width?: number; height?: number }> };
  contentDetails?: { duration?: string; definition?: string };
  statistics?: { viewCount?: string };
  status?: { embeddable?: boolean; privacyStatus?: string };
}

/** Parse ISO-8601 duration (PT#H#M#S) into seconds, or null. */
export function parseIsoDuration(value?: string): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  const [, h, m, s] = match;
  const seconds = (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
  return seconds > 0 ? seconds : null;
}

export async function analyzeYouTube(
  videoId: string,
  apiKey?: string | null
): Promise<AnalysisResult | AnalysisError> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

  let oembed: OEmbedResponse | null = null;
  try {
    oembed = await fetchJson<OEmbedResponse>(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      OEMBED_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof UpstreamError && error.httpStatus && error.httpStatus < 500) {
      // 401/403/404 → private, deleted or non-embeddable video.
      return errorResult(
        "upstream-error",
        "YouTube reports this video as unavailable, private, or restricted. Nothing can be analyzed for this link.",
        false
      );
    }
    return toAnalysisError(error);
  }

  let dataApi: DataApiVideo | null = null;
  let apiErrorNotice: string | null = null;
  if (apiKey) {
    try {
      const payload = await fetchJson<{ items?: DataApiVideo[] }>(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${videoId}&key=${encodeURIComponent(apiKey)}`,
        OEMBED_TIMEOUT_MS
      );
      dataApi = payload.items?.[0] ?? null;
      if (!dataApi) {
        apiErrorNotice = "The YouTube Data API returned no details for this video.";
      }
    } catch (error) {
      apiErrorNotice =
        error instanceof UpstreamError && error.httpStatus === 403
          ? "The configured YouTube Data API key was rejected (quota or permissions)."
          : "Extended YouTube details are temporarily unavailable.";
      dataApi = null;
    }
  }

  const title = dataApi?.snippet?.title ?? oembed.title ?? "YouTube video";
  const channel = dataApi?.snippet?.channelTitle ?? oembed.author_name;
  const thumbnail =
    dataApi?.snippet?.thumbnails?.maxres?.url ??
    dataApi?.snippet?.thumbnails?.high?.url ??
    oembed.thumbnail_url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  const duration = parseIsoDuration(dataApi?.contentDetails?.duration);

  const noticeParts = [
    "YouTube does not offer official direct-file downloads to third-party apps, so AB Download shows the official preview instead of fake quality options.",
    "If the creator publishes an authorized download of this video, paste that direct file URL here and it can be downloaded.",
    channel ? `Channel: ${channel}.` : null,
    !apiKey
      ? "Tip: configure YOUTUBE_API_KEY (see .env.example) to also show duration, channel and view statistics."
      : null,
    apiErrorNotice
  ].filter(Boolean) as string[];

  return {
    ok: true,
    status: "preview-only",
    providerId: "youtube",
    providerName: "YouTube",
    domain: "youtube.com",
    title,
    thumbnailUrl: thumbnail,
    durationSeconds: duration ?? undefined,
    qualities: [],
    preview: {
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`
    },
    notice: noticeParts.join(" "),
    openOnSourceUrl: watchUrl,
    meta: {
      videoId,
      hasApiKey: Boolean(apiKey),
      embeddable: dataApi?.status?.embeddable,
      viewCount: dataApi?.statistics?.viewCount
        ? Number(dataApi.statistics.viewCount)
        : undefined,
      definition: dataApi?.contentDetails?.definition
    }
  };
}

/** ────────────────────────────── Vimeo ────────────────────────────── */

interface VimeoOEmbed {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
  duration?: number;
  width?: number;
  height?: number;
}

export async function analyzeVimeo(rawUrl: string): Promise<AnalysisResult | AnalysisError> {
  const videoId = detectVimeoVideoId(parseHttpUrl(rawUrl));
  if (!videoId) {
    return errorResult("unsupported", "That Vimeo link format is not supported.", false);
  }

  let data: VimeoOEmbed;
  try {
    data = await fetchJson<VimeoOEmbed>(
      `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(`https://vimeo.com/${videoId}`)}&width=1280`,
      OEMBED_TIMEOUT_MS
    );
  } catch (error) {
    if (error instanceof UpstreamError && error.httpStatus && error.httpStatus < 500) {
      return errorResult(
        "upstream-error",
        "Vimeo reports this video as unavailable or private.",
        false
      );
    }
    return toAnalysisError(error);
  }

  return {
    ok: true,
    status: "preview-only",
    providerId: "vimeo",
    providerName: "Vimeo",
    domain: "vimeo.com",
    title: data.title ?? "Vimeo video",
    thumbnailUrl: data.thumbnail_url,
    durationSeconds: data.duration && data.duration > 0 ? data.duration : undefined,
    width: data.width,
    height: data.height,
    qualities: [],
    preview: {
      embedUrl: `https://player.vimeo.com/video/${videoId}`
    },
    notice:
      "Vimeo provides official metadata and an official player preview, but no authorized direct-file download for standard links. If you own this video, Vimeo's own download options are available on the video page.",
    openOnSourceUrl: `https://vimeo.com/${videoId}`,
    meta: { videoId }
  };
}

/** ─────────────────────── Direct media probing ─────────────────────── */

export interface DirectProbe {
  ok: true;
  contentType: string;
  sizeBytes?: number;
  fileName?: string;
  acceptRanges: boolean;
  finalUrl: string;
}

export type DirectProbeError =
  | { ok: false; code: "not-found" | "forbidden" | "not-media" | "streaming-manifest" | "http-error" | "blocked" | "timeout" | "network"; message: string; httpStatus?: number };

export async function probeDirectMedia(rawUrl: string): Promise<DirectProbe | DirectProbeError> {
  const fail = (code: DirectProbeError["code"], message: string, httpStatus?: number): DirectProbeError =>
    ({ ok: false, code, message, httpStatus });

  const parsed = parseHttpUrl(rawUrl);

  // Attempt 1: HEAD. Some hosts reject HEAD → attempt 2: ranged GET.
  let head: Awaited<ReturnType<typeof safeFetch>> | null = null;
  try {
    head = await safeFetch(parsed, { method: "HEAD", timeoutMs: PROBE_TIMEOUT_MS });
  } catch (error) {
    if (error instanceof TimeoutError) return fail("timeout", error.message);
    if (error instanceof BlockedUrlError) return fail("blocked", error.message);
    if (error instanceof NetworkError) return fail("network", error.message);
    // UpstreamError (e.g. redirect loop) → try the ranged GET before giving up.
  }

  let response = head?.response ?? null;
  let finalUrl = head?.finalUrl ?? rawUrl;

  const statusUsable = response && response.status >= 200 && response.status < 300;
  if (!response || !statusUsable) {
    // Ranged GET fallback (also handles 405/403-on-HEAD hosts and gives
    // us Content-Range totals when Content-Length is missing).
    try {
      const get = await safeFetch(parsed, {
        method: "GET",
        headers: { range: "bytes=0-0" },
        timeoutMs: PROBE_TIMEOUT_MS
      });
      void get.response.body?.cancel().catch(() => undefined);
      if (get.response.status === 200 || get.response.status === 206) {
        response = get.response;
        finalUrl = get.finalUrl;
      } else if (!response) {
        response = get.response;
      }
    } catch (error) {
      if (error instanceof TimeoutError) return fail("timeout", error.message);
      if (error instanceof BlockedUrlError) return fail("blocked", error.message);
      if (error instanceof NetworkError) return fail("network", error.message);
      if (error instanceof UpstreamError) {
        return fail("http-error", error.message, error.httpStatus);
      }
    }
  }

  if (!response) {
    return fail("network", "Could not reach that server.");
  }

  const status = response.status;
  if (status === 404 || status === 410) {
    return fail("not-found", "The media host says this file does not exist (HTTP 404).", status);
  }
  if (status === 401 || status === 403) {
    return fail(
      "forbidden",
      "The media host refused access to this file (HTTP " + status + "). If you have direct access to the file, open its URL directly in your browser first.",
      status
    );
  }
  if (status < 200 || status >= 300) {
    return fail("http-error", `The media host responded with HTTP ${status}.`, status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = Number(response.headers.get("content-length")) || undefined;
  const contentRange = response.headers.get("content-range");
  const rangeTotal = contentRange ? Number(/\/(\d+)$/.exec(contentRange)?.[1]) || undefined : undefined;
  const disposition = response.headers.get("content-disposition");

  if (isStreamingManifest(contentType)) {
    return fail(
      "streaming-manifest",
      "That URL is an HLS/DASH streaming manifest, not a single downloadable media file.",
      status
    );
  }

  if (!isAllowedMediaContentType(contentType)) {
    const isHtml = contentType.toLowerCase().includes("text/html") || contentType === "";
    return fail(
      "not-media",
      isHtml
        ? "That URL serves a web page, not a media file. AB Download verifies every URL's response headers before treating it as a download — this one is not a direct media link."
        : `That URL serves "${contentType.split(";")[0]}", which is not a supported media type.`,
      status
    );
  }

  const sizeBytes = contentLength && contentLength > 0 ? contentLength : rangeTotal;
  if (sizeBytes && sizeBytes > MAX_ANALYZE_BYTES) {
    return fail("not-media", "That file declares a size beyond analysis limits.", status);
  }

  const fileName =
    pickFileNameFromDisposition(disposition) ??
    fileNameFromUrlPath(new URL(finalUrl).pathname) ??
    undefined;

  return {
    ok: true,
    contentType: contentType.split(";")[0].trim().toLowerCase(),
    sizeBytes,
    fileName,
    acceptRanges: (response.headers.get("accept-ranges") ?? "").includes("bytes"),
    finalUrl
  };
}

/** ────────────────────────── Orchestrator ────────────────────────── */

const CONTAINER_LABELS: Record<string, string> = {
  "video/mp4": "MP4",
  "video/webm": "WebM",
  "video/quicktime": "MOV",
  "video/x-matroska": "MKV",
  "video/x-msvideo": "AVI",
  "audio/mpeg": "MP3",
  "audio/mp4": "M4A",
  "audio/ogg": "OGG",
  "audio/wav": "WAV",
  "audio/flac": "FLAC"
};

function containerLabel(contentType: string, fileName?: string): string {
  if (CONTAINER_LABELS[contentType]) return CONTAINER_LABELS[contentType];
  const ext = fileName?.split(".").pop();
  if (ext && ext.length <= 5) return ext.toUpperCase();
  return contentType.split("/").pop()?.toUpperCase() ?? "media";
}

export interface AnalyzeOptions {
  youtubeApiKey?: string | null;
}

/**
 * Full analysis pipeline for any URL. Always returns a client-safe result;
 * network/provider failures become AnalysisError objects.
 */
export async function analyzeUrl(
  rawUrl: string,
  opts: AnalyzeOptions = {}
): Promise<AnalysisResult | AnalysisError> {
  let parsed: URL;
  try {
    parsed = parseHttpUrl(rawUrl);
  } catch (error) {
    return errorResult(
      "invalid-url",
      error instanceof Error ? error.message : "That URL is invalid.",
      false
    );
  }

  const apiKey = opts.youtubeApiKey ?? process.env.YOUTUBE_API_KEY ?? null;
  const kind = classifyUrl(parsed);

  if (kind === "youtube") {
    return analyzeYouTube(detectYouTubeVideoId(parsed)!, apiKey);
  }
  if (kind === "vimeo") {
    return analyzeVimeo(parsed.toString());
  }

  // direct-media candidate or unknown → verify via response headers.
  const probe = await probeDirectMedia(parsed.toString());

  if (!probe.ok) {
    switch (probe.code) {
      case "not-media":
        // Honest "web page" outcome instead of an error card.
        return {
          ok: true,
          status: "web-page",
          providerId: null,
          providerName: displayDomain(parsed),
          domain: displayDomain(parsed),
          qualities: [],
          notice: probe.message,
          openOnSourceUrl: parsed.toString(),
          meta: { verifiedContentType: false }
        } satisfies AnalysisResult;
      case "streaming-manifest":
        return errorResult("unsupported", probe.message, false);
      case "not-found":
      case "forbidden":
      case "http-error":
        return errorResult("upstream-error", probe.message, probe.code === "http-error");
      case "timeout":
        return errorResult("timeout", probe.message, true);
      case "blocked":
        return errorResult("blocked-url", probe.message, false);
      case "network":
        return errorResult("upstream-error", probe.message, true);
    }
  }

  const verified = probe;
  const container = containerLabel(verified.contentType, verified.fileName);
  const isAudio = verified.contentType.startsWith("audio/");

  const quality: QualityOption = {
    id: "original",
    label: `Original · ${container}`,
    container: container.toLowerCase(),
    sizeBytes: verified.sizeBytes,
    hasAudio: true,
    kind: "original",
    downloadable: true,
    url: verified.finalUrl,
    note: `Verified via the source server's response headers (${verified.contentType}).`
  };

  return {
    ok: true,
    status: "downloadable",
    providerId: "direct-media",
    providerName: "Direct media file",
    domain: displayDomain(new URL(verified.finalUrl)),
    title: verified.fileName ?? `Media file from ${displayDomain(new URL(verified.finalUrl))}`,
    fileSizeBytes: verified.sizeBytes,
    contentType: verified.contentType,
    fileName: verified.fileName,
    qualities: [quality],
    preview: { directUrl: parsed.toString() },
    notice:
      "This is a verified direct media file. Duration and resolution are detected by your browser when the host allows playback preview; the download streams through a size-limited, validated proxy.",
    openOnSourceUrl: parsed.toString(),
    meta: {
      acceptRanges: verified.acceptRanges,
      finalUrl: verified.finalUrl,
      isAudio
    } as Record<string, unknown>
  };
}
