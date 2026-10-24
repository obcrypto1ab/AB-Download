import { InvalidUrlError } from "./errors";

/**
 * Client-safe URL parsing/normalization shared by the browser and the API.
 * Server-only network checks (DNS, private ranges) live in lib/ssrf.ts.
 */

const MAX_URL_LENGTH = 2048;

/** Trailing punctuation that usually comes from copy/paste, not from the URL. */
const TRAILING_JUNK = /[)\]}>'"]+$/;

export function parseHttpUrl(raw: string): URL {
  const trimmed = String(raw ?? "")
    .trim()
    .replace(TRAILING_JUNK, "");

  if (!trimmed) {
    throw new InvalidUrlError("Paste a URL first.");
  }
  if (trimmed.length > MAX_URL_LENGTH) {
    throw new InvalidUrlError("That URL is too long.");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(trimmed)) {
    throw new InvalidUrlError("URLs cannot contain whitespace or control characters.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new InvalidUrlError("That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    const scheme = url.protocol.replace(":", "");
    throw new InvalidUrlError(
      `Unsupported protocol "${scheme}" — only http and https links can be analyzed.`
    );
  }
  if (url.username || url.password) {
    throw new InvalidUrlError("URLs with embedded credentials (user:pass@) are not supported.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new InvalidUrlError("Only standard web ports (80 and 443) are supported.");
  }
  if (!url.hostname.includes(".") && !url.hostname.includes(":")) {
    throw new InvalidUrlError(
      "Enter a full public domain, e.g. https://example.com/video.mp4"
    );
  }
  return url;
}

/** Safely readable origin for display, e.g. "youtube.com". */
export function displayDomain(url: URL): string {
  return url.hostname.replace(/^www\./i, "").toLowerCase();
}
