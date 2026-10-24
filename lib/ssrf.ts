import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

import { parseHttpUrl } from "./url-validation";
import {
  BlockedUrlError,
  NetworkError,
  TimeoutError,
  UpstreamError
} from "./errors";

/**
 * Server-only network safety layer.
 *
 * Every outbound request to a user-supplied URL MUST go through
 * assertPublicHttpUrl() and safeFetch(). These enforce:
 *   - http/https only, standard ports only (via parseHttpUrl)
 *   - literal-IP and DNS resolution checks against private ranges
 *   - per-redirect revalidation (each Location hop is re-checked)
 *   - overall deadline + per-hop timeouts
 */

const PRIVATE_NET_MESSAGE =
  "For security reasons, AB Download only fetches public internet addresses. Private, local and internal network URLs are blocked.";

const PUBLIC_USER_AGENT =
  "Mozilla/5.0 (compatible; ABDownload/1.0; +media metadata analyzer)";

export function publicUserAgent(): string {
  return PUBLIC_USER_AGENT;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b, c] = parts;

  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // protocol assignments / TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, "");

  // IPv4-mapped (::ffff:a.b.c.d) — check the embedded v4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateIPv4(mapped[1]);

  if (ip === "::" || ip === "::1") return true; // unspecified, loopback
  if (/^f[cd]/.test(ip)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(ip)) return true; // fe80::/10 link-local
  if (/^ff/.test(ip)) return true; // multicast
  if (ip.startsWith("2001:db8:")) return true; // documentation
  return false;
}

export function isBlockedIpAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not an IP literal → unsafe default
}

/**
 * Validate that a URL is a well-formed public http(s) address:
 * parse rules, then resolve DNS and verify every resolved address is public.
 */
export async function assertPublicHttpUrl(raw: string | URL): Promise<URL> {
  const url = raw instanceof URL ? raw : parseHttpUrl(raw);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIP(host)) {
    if (isBlockedIpAddress(host)) throw new BlockedUrlError(PRIVATE_NET_MESSAGE);
    return url;
  }

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa")
  ) {
    throw new BlockedUrlError(PRIVATE_NET_MESSAGE);
  }

  let records;
  try {
    records = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new BlockedUrlError("That domain could not be resolved. Check the spelling.");
  }
  if (!records.length) {
    throw new BlockedUrlError("That domain could not be resolved.");
  }
  for (const record of records) {
    if (isBlockedIpAddress(record.address)) {
      throw new BlockedUrlError(PRIVATE_NET_MESSAGE);
    }
  }
  return url;
}

export interface SafeFetchOptions {
  method?: "GET" | "HEAD";
  headers?: Record<string, string>;
  /** Overall wall-clock budget for the whole request incl. redirects (ms). */
  timeoutMs?: number;
  maxRedirects?: number;
  /** External abort signal (e.g. the incoming request's signal). */
  signal?: AbortSignal;
}

export interface SafeFetchResult {
  response: Response;
  finalUrl: string;
  redirects: string[];
}

/**
 * fetch() with hardened redirect handling: every redirect hop is validated
 * with assertPublicHttpUrl() before being followed. Responses are never
 * auto-followed by the platform.
 */
export async function safeFetch(rawUrl: string | URL, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxRedirects = opts.maxRedirects ?? 5;
  const deadline = Date.now() + (opts.timeoutMs ?? 12_000);
  const initialMethod = opts.method ?? "GET";

  let current = await assertPublicHttpUrl(rawUrl);
  const redirects: string[] = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new TimeoutError("The server took too long to respond.");

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new DOMException("Timeout", "TimeoutError")), remaining);
    const onExternalAbort = () => ac.abort(opts.signal?.reason);
    if (opts.signal) {
      if (opts.signal.aborted) ac.abort(opts.signal.reason);
      else opts.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetch(current, {
        method: hop === 0 ? initialMethod : "GET",
        redirect: "manual",
        cache: "no-store",
        headers: {
          "user-agent": PUBLIC_USER_AGENT,
          accept: "*/*",
          "accept-encoding": "identity",
          ...(hop > 0 ? {} : opts.headers ?? {})
        },
        signal: ac.signal
      });
    } catch (error) {
      clearTimeout(timer);
      if (ac.signal.aborted) {
        if (opts.signal?.aborted) throw error; // caller cancelled — propagate
        throw new TimeoutError("The server took too long to respond.");
      }
      throw new NetworkError("Could not reach that server.");
    } finally {
      if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
    }

    clearTimeout(timer);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      void response.body?.cancel().catch(() => undefined);
      if (!location) {
        throw new UpstreamError("The server returned a redirect without a destination.", response.status);
      }
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new UpstreamError("The server returned an invalid redirect.", response.status);
      }
      if (next.protocol !== "http:" && next.protocol !== "https:") {
        throw new BlockedUrlError("A redirect to a non-HTTP protocol was blocked.");
      }
      redirects.push(next.toString());
      try {
        current = await assertPublicHttpUrl(next); // re-validate every hop
      } catch (error) {
        if (error instanceof BlockedUrlError) throw error;
        // Any other validation failure on a redirect target is still a blocked hop.
        throw new BlockedUrlError("A redirect to a disallowed destination was blocked.");
      }
      continue;
    }

    return { response, finalUrl: current.toString(), redirects };
  }

  throw new UpstreamError("Too many redirects (more than 5).");
}
