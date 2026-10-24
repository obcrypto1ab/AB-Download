import type { DownloadAction, DownloadState } from "./types";
import { CLIENT_BLOB_LIMIT, MAX_DOWNLOAD_BYTES } from "./file-validation";

export const initialDownloadState: DownloadState = {
  status: "idle",
  receivedBytes: 0
};

/**
 * Pure reducer for the download lifecycle. Guards encode the invariants:
 * - a start is only accepted from a settled state (idle/complete/failed/canceled)
 *   → accidental duplicate requests are impossible,
 * - progress events are ignored outside "downloading".
 */
export function downloadReducer(state: DownloadState, action: DownloadAction): DownloadState {
  switch (action.type) {
    case "start": {
      if (state.status === "starting" || state.status === "downloading") return state;
      return {
        status: "starting",
        receivedBytes: 0,
        totalBytes: action.totalBytes,
        fileName: action.fileName,
        error: undefined
      };
    }
    case "progress": {
      if (state.status !== "starting" && state.status !== "downloading") return state;
      return {
        ...state,
        status: "downloading",
        receivedBytes: action.receivedBytes,
        totalBytes: action.totalBytes ?? state.totalBytes
      };
    }
    case "complete": {
      if (state.status !== "downloading" && state.status !== "starting") return state;
      return { ...state, status: "complete" };
    }
    case "fail": {
      if (state.status !== "downloading" && state.status !== "starting") return state;
      return { ...state, status: "failed", error: action.error };
    }
    case "cancel": {
      if (state.status !== "downloading" && state.status !== "starting") return state;
      return { ...state, status: "canceled" };
    }
    case "reset":
      return initialDownloadState;
    default:
      return state;
  }
}

/** A new download may only begin from a settled state (duplicate prevention). */
export function canStartDownload(state: DownloadState): boolean {
  return state.status !== "starting" && state.status !== "downloading";
}

/** ────────────────────────── download engine ────────────────────────── */

export class DownloadError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DownloadError";
  }
}

export function humanDownloadError(error: unknown): string {
  if (error instanceof DownloadError) {
    switch (error.code) {
      case "too-large":
        return "This file is too large for an in-browser download in this browser. Use Chrome or Edge (saves directly to disk), or open the direct link.";
      case "not-media":
        return "The server did not return a media file.";
      case "http-error":
        return "The media host rejected the download request. The link may have expired — try analyzing again.";
      case "network":
        return "The connection dropped during the download.";
      case "size-cap":
        return "The file exceeded the download size limit.";
      default:
        return error.message;
    }
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Download canceled.";
  }
  return "The download failed unexpectedly. Please try again.";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export interface PerformDownloadOptions {
  /** Proxy endpoint, e.g. /api/download?u=… */
  url: string;
  fileName: string;
  expectedTotal?: number;
  signal: AbortSignal;
  onProgress?: (receivedBytes: number, totalBytes?: number) => void;
}

export interface PerformDownloadResult {
  savedTo: "disk" | "downloads-folder";
}

/**
 * Runs a streamed download.
 *
 * - Chromium (File System Access API): streams straight to the chosen file —
 *   no memory buffering, works for any size up to the server cap.
 * - Other browsers: buffers to a Blob, ONLY if the transfer stays within
 *   CLIENT_BLOB_LIMIT; otherwise fails with an honest, actionable message.
 */
export async function performDownload(opts: PerformDownloadOptions): Promise<PerformDownloadResult> {
  const canStreamToDisk =
    typeof window !== "undefined" &&
    "showSaveFilePicker" in window &&
    typeof (window as { showSaveFilePicker?: unknown }).showSaveFilePicker === "function";

  if (canStreamToDisk) {
    return performDiskDownload(opts);
  }
  return performBlobDownload(opts);
}

async function openResponse(opts: PerformDownloadOptions): Promise<Response> {
  const response = await fetch(opts.url, { signal: opts.signal, cache: "no-store" });
  if (!response.ok) {
    let code = "http-error";
    try {
      const body = (await response.json()) as { code?: string };
      if (body?.code) code = body.code;
    } catch {
      /* non-JSON error body */
    }
    throw new DownloadError(code, `Download failed (HTTP ${response.status}).`);
  }
  return response;
}

async function performDiskDownload(opts: PerformDownloadOptions): Promise<PerformDownloadResult> {
  const picker = (
    window as unknown as {
      showSaveFilePicker: (o: unknown) => Promise<{
        createWritable: () => Promise<{
          write: (data: Uint8Array) => Promise<void>;
          close: () => Promise<void>;
          abort?: (reason?: unknown) => Promise<void>;
        }>;
      }>;
    }
  ).showSaveFilePicker;

  // Must run inside the user-gesture call stack.
  const handle = await picker({
    suggestedName: opts.fileName,
    types: [{ description: "Media file", accept: { "application/octet-stream": [".bin"] } }]
  });

  const response = await openResponse(opts);
  const total =
    Number(response.headers.get("content-length")) || opts.expectedTotal || undefined;
  const writable = await handle.createWritable();

  try {
    await pump(response, (received) => opts.onProgress?.(received, total), opts.signal);
    await writable.close();
  } catch (error) {
    try {
      await writable.abort?.();
    } catch {
      /* already closed */
    }
    throw error;
  }
  return { savedTo: "disk" };
}

async function performBlobDownload(opts: PerformDownloadOptions): Promise<PerformDownloadResult> {
  if (opts.expectedTotal && opts.expectedTotal > CLIENT_BLOB_LIMIT) {
    throw new DownloadError("too-large", "File too large for in-browser download.");
  }

  const response = await openResponse(opts);
  const declared =
    Number(response.headers.get("content-length")) || opts.expectedTotal || undefined;
  if (declared && declared > CLIENT_BLOB_LIMIT) {
    void response.body?.cancel().catch(() => undefined);
    throw new DownloadError("too-large", "File too large for in-browser download.");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    await pump(
      response,
      (bytes, chunk) => {
        received = bytes;
        chunks.push(chunk);
        if (received > CLIENT_BLOB_LIMIT) {
          throw new DownloadError("too-large", "File too large for in-browser download.");
        }
        opts.onProgress?.(received, declared);
      },
      opts.signal
    );
  } catch (error) {
    chunks.length = 0;
    throw error;
  }

  const blob = new Blob(chunks as BlobPart[]);
  chunks.length = 0;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = opts.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);

  return { savedTo: "downloads-folder" };
}

/** Shared chunk pump with size-cap counting and cooperative abort. */
async function pump(
  response: Response,
  onChunk: (received: number, chunk: Uint8Array) => void,
  signal: AbortSignal
): Promise<void> {
  if (!response.body) throw new DownloadError("network", "Empty response body.");

  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        received += value.byteLength;
        onChunk(received, value);
      }
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    if (error instanceof DownloadError) {
      // Stop the underlying transfer on size-cap violations.
      void reader.cancel().catch(() => undefined);
    }
    throw error;
  }
  return;
}

export { isAbort };
export { CLIENT_BLOB_LIMIT, MAX_DOWNLOAD_BYTES };
