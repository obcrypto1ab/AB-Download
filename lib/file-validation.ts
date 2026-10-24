/**
 * Shared file-name and content-type validation (client + server safe).
 */

/** Content types we accept as downloadable media. */
export function isAllowedMediaContentType(contentType?: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  if (!ct) return false;
  if (ct.startsWith("video/") || ct.startsWith("audio/")) return true;
  const allowedExact = new Set([
    "application/octet-stream",
    "binary/octet-stream",
    "application/ogg",
    "application/x-ogg",
    "application/mp4",
    "application/x-matroska",
    "application/x-msvideo",
    "application/x-ms-wmv"
  ]);
  return allowedExact.has(ct);
}

/** True when the host served a streaming manifest (not downloadable as one file). */
export function isStreamingManifest(contentType?: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.split(";")[0].trim().toLowerCase();
  return ct.includes("mpegurl") || ct.includes("dash+xml");
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_FILENAME_LENGTH = 180;

function extensionOf(name: string): string | null {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(name);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Sanitize an arbitrary filename (from Content-Disposition, a URL path, or
 * a quality label) into something safe for all major filesystems while
 * preserving Unicode characters.
 */
export function sanitizeFileName(raw: string, fallback = "download"): string {
  let name = String(raw ?? "").normalize("NFC");

  // Strip control characters.
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\u0000-\u001f\u007f]/g, "");
  // Replace filesystem-unsafe characters.
  name = name.replace(/[\\/:*?"<>|]/g, "_");
  // Collapse whitespace and trim.
  name = name.replace(/\s+/g, " ").trim();
  // Leading/trailing dots and spaces are problematic on Windows.
  name = name.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");

  if (!name) name = fallback;

  const ext = extensionOf(name);
  let base = ext && name.length > ext.length + 1
    ? name.slice(0, name.length - ext.length - 1)
    : name;

  if (WINDOWS_RESERVED.test(base)) base = `_${base}`;

  // Cap length, preserving the extension.
  const maxBase = MAX_FILENAME_LENGTH - (ext ? ext.length + 1 : 0);
  if (base.length > maxBase) base = base.slice(0, maxBase).trimEnd();

  return ext ? `${base}.${ext}` : base;
}

/**
 * Extract a filename from a Content-Disposition header, preferring
 * RFC 5987 filename* (UTF-8) over the plain filename parameter.
 */
export function pickFileNameFromDisposition(
  header: string | null | undefined
): string | null {
  if (!header) return null;

  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"+$/g, ""));
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/.exec(header) ?? /filename\s*=\s*([^;]+)/.exec(header);
  if (plain) {
    const value = plain[1].trim();
    if (value) return value;
  }
  return null;
}

/** Derive a filename from a URL path (basename), or null. */
export function fileNameFromUrlPath(pathname: string): string | null {
  try {
    const base = decodeURIComponent(new URL(pathname, "https://x.invalid").pathname)
      .split("/")
      .filter(Boolean)
      .pop();
    return base && base.includes(".") ? base : null;
  } catch {
    return null;
  }
}

/** ── Size limits (documented in README; all values are intentional) ── */

/** Server-side hard cap on proxied downloads: 2 GiB. */
export const MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Client-side cap for in-memory (blob) downloads: 256 MiB.
 * Larger files use the File System Access API (Chrome/Edge) or the
 * direct-link fallback — never silent buffering.
 */
export const CLIENT_BLOB_LIMIT = 256 * 1024 * 1024;

/** Sanity cap for analysis probes (refuse absurd declared sizes up front). */
export const MAX_ANALYZE_BYTES = 50 * 1024 * 1024 * 1024;
