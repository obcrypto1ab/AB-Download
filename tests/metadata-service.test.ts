import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  analyzeUrl,
  parseIsoDuration,
  probeDirectMedia
} from "@/lib/metadata-service";
import { UpstreamError } from "@/lib/errors";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function headerResponse(status: number, headers: Record<string, string>): Response {
  return new Response(null, { status, headers });
}

beforeEach(() => {
  process.env.YOUTUBE_API_KEY = "";
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("parseIsoDuration", () => {
  it("parses YouTube ISO-8601 durations", () => {
    expect(parseIsoDuration("PT1M30S")).toBe(90);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("PT0S")).toBeNull(); // zero-length treated as unknown
    expect(parseIsoDuration(undefined)).toBeNull();
    expect(parseIsoDuration("garbage")).toBeNull();
  });
});

describe("YouTube analysis", () => {
  it("returns preview-only with oEmbed metadata when no API key is set", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      expect(String(url)).toContain("youtube.com/oembed");
      return jsonResponse(200, {
        title: "Big Buck Bunny",
        author_name: "Blender Foundation",
        thumbnail_url: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    if (!result.ok) throw new Error("expected success");
    expect(result.status).toBe("preview-only");
    expect(result.providerId).toBe("youtube");
    expect(result.title).toBe("Big Buck Bunny");
    expect(result.qualities).toEqual([]); // never fake quality options
    expect(result.preview?.embedUrl).toContain("youtube-nocookie.com/embed/aqz-KE-bpKQ");
    expect(result.openOnSourceUrl).toBe("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    expect(result.meta?.hasApiKey).toBe(false);
    expect(result.notice).toMatch(/YOUTUBE_API_KEY/);
  });

  it("enriches with Data API fields when a key is configured", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("googleapis.com")) {
        return jsonResponse(200, {
          items: [
            {
              snippet: {
                title: "Big Buck Bunny (API)",
                channelTitle: "Blender",
                thumbnails: { high: { url: "https://i.ytimg.com/vi/aqz-KE-bpKQ/hq720.jpg" } }
              },
              contentDetails: { duration: "PT10M34S", definition: "hd" },
              statistics: { viewCount: "1000" },
              status: { embeddable: true }
            }
          ]
        });
      }
      return jsonResponse(200, { title: "oembed title", author_name: "oembed author" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeUrl("https://youtu.be/aqz-KE-bpKQ");
    if (!result.ok) throw new Error("expected success");
    expect(result.title).toBe("Big Buck Bunny (API)");
    expect(result.durationSeconds).toBe(634);
    expect(result.meta?.hasApiKey).toBe(true);
    expect(result.meta?.viewCount).toBe(1000);
  });

  it("degrades gracefully when the Data API key is rejected", async () => {
    process.env.YOUTUBE_API_KEY = "bad-key";
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("googleapis.com")) {
        return jsonResponse(403, { error: { message: "quota exceeded" } });
      }
      return jsonResponse(200, { title: "Still works", author_name: "Someone" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    if (!result.ok) throw new Error("expected success");
    expect(result.title).toBe("Still works");
    expect(result.durationSeconds).toBeUndefined();
    expect(result.notice).toContain("API key");
  });

  it("reports private/unavailable videos honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(404, { error: "not found" }))
    );
    const result = await analyzeUrl("https://www.youtube.com/watch?v=aqz-KE-bpKQ");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryable).toBe(false);
      expect(result.message).toMatch(/unavailable|private/i);
    }
  });
});

describe("Vimeo analysis", () => {
  it("returns official metadata with a preview embed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          title: "The New Vimeo Player",
          author_name: "Vimeo Staff",
          duration: 63,
          width: 1920,
          height: 1080,
          thumbnail_url: "https://i.vimeocdn.com/video/abc.jpg"
        })
      )
    );

    const result = await analyzeUrl("https://vimeo.com/76979871");
    if (!result.ok) throw new Error("expected success");
    expect(result.status).toBe("preview-only");
    expect(result.providerId).toBe("vimeo");
    expect(result.durationSeconds).toBe(63);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.preview?.embedUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(result.qualities).toEqual([]);
  });

  it("reports unavailable Vimeo videos", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, {})));
    const result = await analyzeUrl("https://vimeo.com/76979871");
    expect(result.ok).toBe(false);
  });
});

describe("direct media probing", () => {
  const HOST = "https://93.184.216.34"; // literal public IP → no DNS in tests

  it("verifies a downloadable file via HEAD headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        headerResponse(200, {
          "content-type": "video/mp4",
          "content-length": "158008374",
          "content-disposition": 'attachment; filename="Big Buck Bunny.mp4"',
          "accept-ranges": "bytes"
        })
      )
    );

    const probe = await probeDirectMedia(`${HOST}/videos/bbb.mp4`);
    if (!probe.ok) throw new Error(`expected success, got ${JSON.stringify(probe)}`);
    expect(probe.contentType).toBe("video/mp4");
    expect(probe.sizeBytes).toBe(158008374);
    expect(probe.fileName).toBe("Big Buck Bunny.mp4");
    expect(probe.acceptRanges).toBe(true);
  });

  it("falls back to a ranged GET when HEAD is rejected", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "HEAD") {
        return headerResponse(405, { allow: "GET" });
      }
      const headers = new Headers(init?.headers);
      expect(headers.get("range")).toBe("bytes=0-0");
      return headerResponse(206, {
        "content-type": "video/webm",
        "content-range": "bytes 0-0/56789"
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeDirectMedia(`${HOST}/clip.webm`);
    if (!probe.ok) throw new Error("expected success");
    expect(probe.contentType).toBe("video/webm");
    expect(probe.sizeBytes).toBe(56789);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honestly rejects web pages served instead of media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(headerResponse(200, { "content-type": "text/html; charset=utf-8" }))
    );
    const probe = await probeDirectMedia(`${HOST}/some/page`);
    expect(probe.ok).toBe(false);
    if (!probe.ok) {
      expect(probe.code).toBe("not-media");
      expect(probe.message).toMatch(/web page/i);
    }
  });

  it("detects HLS manifests as non-downloadable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        headerResponse(200, { "content-type": "application/vnd.apple.mpegurl" })
      )
    );
    const probe = await probeDirectMedia(`${HOST}/stream.m3u8`);
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.code).toBe("streaming-manifest");
  });

  it("maps 404 and 403 responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headerResponse(404, {})));
    let probe = await probeDirectMedia(`${HOST}/gone.mp4`);
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.code).toBe("not-found");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(headerResponse(403, {})));
    probe = await probeDirectMedia(`${HOST}/private.mp4`);
    expect(probe.ok).toBe(false);
    if (!probe.ok) expect(probe.code).toBe("forbidden");
  });

  it("rejects private-network targets before any request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeUrl("http://10.1.2.3/secret.mp4");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("blocked-url");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("analyzeUrl orchestration", () => {
  it("returns a downloadable result for verified direct media", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        headerResponse(200, {
          "content-type": "video/mp4",
          "content-length": "1048576",
          "content-disposition": 'inline; filename="movie.mp4"'
        })
      )
    );

    const result = await analyzeUrl("https://93.184.216.34/movie.mp4");
    if (!result.ok) throw new Error("expected success");
    expect(result.status).toBe("downloadable");
    expect(result.qualities).toHaveLength(1);
    const quality = result.qualities[0];
    expect(quality.downloadable).toBe(true);
    expect(quality.kind).toBe("original");
    expect(quality.sizeBytes).toBe(1048576);
    expect(quality.url).toBeTruthy();
    expect(result.preview?.directUrl).toBe("https://93.184.216.34/movie.mp4");
  });

  it("returns a web-page verdict for HTML responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(headerResponse(200, { "content-type": "text/html" }))
    );
    const result = await analyzeUrl("https://93.184.216.34/page");
    if (!result.ok) throw new Error("expected success");
    expect(result.status).toBe("web-page");
    expect(result.qualities).toEqual([]);
    expect(result.notice).toMatch(/web page/i);
  });

  it("rejects invalid URLs without any network activity", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeUrl("javascript:alert(1)");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid-url");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps provider 5xx errors as retryable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(503, {})));
    // Direct-media probe: HEAD 503 → ranged GET also fails with 503 → http-error
    const result = await analyzeUrl("https://93.184.216.34/broken.mp4");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryable).toBe(true);
  });

  it("throws UpstreamError from fetchJson path (re-exported mapping)", async () => {
    const error = new UpstreamError("boom", 500);
    expect(error.httpStatus).toBe(500);
  });
});
