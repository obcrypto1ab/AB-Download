/**
 * Shared application types (safe for client and server).
 */

export type ProviderId = "direct-media" | "youtube" | "vimeo" | null;

export type AnalysisStatus =
  /** The source provides a verified, downloadable media file. */
  | "downloadable"
  /** The source supports preview/metadata only — no authorized file download. */
  | "preview-only"
  /** The URL serves a web page, not a media file. */
  | "web-page"
  /** The source is recognized but not supported. */
  | "unsupported";

export interface QualityOption {
  id: string;
  /** Human label, e.g. "Original · MP4". */
  label: string;
  container?: string;
  codec?: string;
  sizeBytes?: number;
  hasAudio: boolean;
  /** Only ever "original" — this app never fabricates upscaled qualities. */
  kind: "original";
  downloadable: boolean;
  /** The verified source URL this option downloads from. */
  url?: string;
  note?: string;
}

export interface MediaPreview {
  /** Official embedded player (YouTube/Vimeo). */
  embedUrl?: string;
  /** Direct media URL that the browser <video> element may be able to play. */
  directUrl?: string;
}

export interface AnalysisResult {
  ok: true;
  status: AnalysisStatus;
  providerId: ProviderId;
  providerName: string;
  domain: string;
  title?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  contentType?: string;
  fileName?: string;
  qualities: QualityOption[];
  preview?: MediaPreview;
  /** Honest explanation shown to the user (why download is/isn't available). */
  notice?: string;
  openOnSourceUrl?: string;
  meta?: Record<string, unknown>;
}

export interface AnalysisError {
  ok: false;
  code:
    | "invalid-url"
    | "blocked-url"
    | "unsupported"
    | "upstream-error"
    | "timeout"
    | "rate-limited"
    | "internal-error";
  message: string;
  retryable: boolean;
}

export type AnalysisResponse = AnalysisResult | AnalysisError;

export type DownloadStatus =
  | "idle"
  | "starting"
  | "downloading"
  | "complete"
  | "failed"
  | "canceled";

export interface DownloadState {
  status: DownloadStatus;
  receivedBytes: number;
  totalBytes?: number;
  fileName?: string;
  error?: string;
}

export type DownloadAction =
  | { type: "start"; fileName: string; totalBytes?: number }
  | { type: "progress"; receivedBytes: number; totalBytes?: number }
  | { type: "complete" }
  | { type: "fail"; error: string }
  | { type: "cancel" }
  | { type: "reset" };
