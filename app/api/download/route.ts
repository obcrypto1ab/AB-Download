import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  isAllowedMediaContentType,
  isStreamingManifest,
  MAX_DOWNLOAD_BYTES,
  pickFileNameFromDisposition,
  sanitizeFileName
} from "@/lib/file-validation";
import { checkRateLimit, clientKeyFromHeaders } from "@/lib/rate-limit";
import { assertPublicHttpUrl, safeFetch } from "@/lib/ssrf";
import { BlockedUrlError, InvalidUrlError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Streaming downloads are long-running; on Vercel this is capped by the
// plan's function duration (documented in DEPLOYMENT.md).
export const maxDuration = 300;

const QuerySchema = z.object({
  u: z.string().min(1).max(2048)
});

const RANGE_RE = /^bytes=\d+-\d*$/;

function jsonError(status: number, code: string, message: string) {
  return NextResponse.json(
    { ok: false, code, message },
    { status, headers: { "cache-control": "no-store" } }
  );
}

/**
 * Validated streaming download proxy.
 *
 * Security model:
 * - the target URL is re-validated server-side (protocol, port, DNS, private
 *   ranges) and every redirect hop is re-validated before being followed,
 * - only verified media content types are proxied,
 * - total transfer size is hard-capped (MAX_DOWNLOAD_BYTES),
 * - client disconnects abort the upstream request (cancellation),
 * - responses never leak upstream headers beyond a small allowlist.
 *
 * NOTE: this proxies ONLY media files that the analysis flow has verified.
 * It is not an open proxy: arbitrary URLs are rejected (content-type gate).
 */
export async function GET(request: NextRequest) {
  const rate = checkRateLimit(`download:${clientKeyFromHeaders(request.headers)}`, 12, 60_000);
  if (!rate.allowed) {
    return jsonError(429, "rate-limited", `Too many downloads. Retry in ${rate.retryAfterSeconds}s.`);
  }

  const query = QuerySchema.safeParse({ u: request.nextUrl.searchParams.get("u") ?? "" });
  if (!query.success) {
    return jsonError(400, "invalid-url", "Missing or malformed download target.");
  }

  let target: URL;
  try {
    target = await assertPublicHttpUrl(query.data.u);
  } catch (error) {
    if (error instanceof InvalidUrlError || error instanceof BlockedUrlError) {
      return jsonError(400, "blocked-url", error.message);
    }
    return jsonError(400, "blocked-url", "That download target is not allowed.");
  }

  const rawRange = request.headers.get("range");
  const range = rawRange && RANGE_RE.test(rawRange) ? rawRange : undefined;

  try {
    const { response, finalUrl } = await safeFetch(target, {
      method: "GET",
      headers: range ? { range } : undefined,
      timeoutMs: 30_000, // time-to-headers; the body itself streams without this cap
      maxRedirects: 5,
      signal: request.signal
    });

    if (!response.ok || (response.status !== 200 && response.status !== 206)) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status === 404 || response.status === 410) {
        return jsonError(404, "not-found", "The media host says this file no longer exists. Analyze the link again for a fresh source.");
      }
      if (response.status === 403 || response.status === 401) {
        return jsonError(403, "forbidden", "The media host refused this download. The link may require direct access or may have expired.");
      }
      return jsonError(502, "upstream-error", `The media host responded with HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (isStreamingManifest(contentType) || !isAllowedMediaContentType(contentType)) {
      void response.body?.cancel().catch(() => undefined);
      return jsonError(415, "not-media", "The target did not return a media file, so it was not downloaded.");
    }

    const contentLength = Number(response.headers.get("content-length")) || undefined;
    if (contentLength && contentLength > MAX_DOWNLOAD_BYTES) {
      void response.body?.cancel().catch(() => undefined);
      return jsonError(413, "size-cap", "This file exceeds the download size limit (2 GiB).");
    }

    // Filename: Content-Disposition → URL basename → generic.
    const suggested =
      pickFileNameFromDisposition(response.headers.get("content-disposition")) ??
      decodeURIComponent(finalUrl.split("/").filter(Boolean).pop() ?? "") ??
      "";
    const fileName = sanitizeFileName(suggested || "media-download", "media-download");

    // Size-cap enforcement while streaming (defense in depth for responses
    // without Content-Length, e.g. chunked transfers).
    let sent = 0;
    const upstreamController = new AbortController();
    request.signal.addEventListener("abort", () => upstreamController.abort(), { once: true });

    let stream: ReadableStream<Uint8Array> | null = null;
    if (response.body) {
      stream = response.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            sent += chunk.byteLength;
            if (sent > MAX_DOWNLOAD_BYTES) {
              upstreamController.abort();
              controller.error(new Error("size-cap"));
              return;
            }
            controller.enqueue(chunk);
          }
        })
      );
    }

    const headers = new Headers();
    headers.set("content-type", contentType.split(";")[0].trim().toLowerCase());
    if (contentLength) headers.set("content-length", String(contentLength));
    headers.set(
      "content-disposition",
      `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
    );
    const acceptRanges = response.headers.get("accept-ranges");
    if (acceptRanges) headers.set("accept-ranges", acceptRanges);
    const contentRange = response.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);
    headers.set("cache-control", "no-store");
    headers.set("x-content-type-options", "nosniff");

    return new Response(stream, { status: response.status, headers });
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      return jsonError(400, "blocked-url", error.message);
    }
    if (error instanceof InvalidUrlError) {
      return jsonError(400, "invalid-url", error.message);
    }
    if (request.signal.aborted) {
      // Client cancelled — nothing to report.
      return new Response(null, { status: 499 });
    }
    return jsonError(502, "upstream-error", "The media host could not be reached.");
  }
}
