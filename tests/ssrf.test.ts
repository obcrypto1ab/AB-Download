import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assertPublicHttpUrl, isBlockedIpAddress, safeFetch } from "@/lib/ssrf";
import { BlockedUrlError, TimeoutError, UpstreamError } from "@/lib/errors";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn()
}));

import { lookup } from "node:dns/promises";
const mockLookup = vi.mocked(lookup);

const PUBLIC_IP = "93.184.216.34";

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

beforeEach(() => {
  mockLookup.mockReset();
  mockLookup.mockImplementation(async () => [{ address: PUBLIC_IP, family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isBlockedIpAddress", () => {
  it("blocks loopback and private IPv4 ranges", () => {
    for (const ip of [
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "0.0.0.0",
      "169.254.169.254", // cloud metadata
      "100.64.0.1", // CGNAT
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255"
    ]) {
      expect(isBlockedIpAddress(ip), `expected ${ip} blocked`).toBe(true);
    }
  });

  it("blocks private IPv6 ranges", () => {
    for (const ip of ["::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1"]) {
      expect(isBlockedIpAddress(ip), `expected ${ip} blocked`).toBe(true);
    }
  });

  it("blocks IPv4-mapped IPv6 addresses carrying a private v4", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:192.168.0.1")).toBe(true);
  });

  it("allows public addresses", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "1.1.1.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect(isBlockedIpAddress(ip), `expected ${ip} allowed`).toBe(false);
    }
  });

  it("treats malformed input as blocked", () => {
    expect(isBlockedIpAddress("not-an-ip")).toBe(true);
    expect(isBlockedIpAddress("999.1.1.1")).toBe(true);
  });
});

describe("assertPublicHttpUrl", () => {
  it("accepts a public literal IP", async () => {
    const url = await assertPublicHttpUrl("https://93.184.216.34/video.mp4");
    expect(url.hostname).toBe("93.184.216.34");
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("blocks literal private IPs", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1:80/x")).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      BlockedUrlError
    );
    await expect(assertPublicHttpUrl("http://[::1]/x")).rejects.toThrow(BlockedUrlError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("blocks localhost-style hostnames without DNS", async () => {
    // "localhost" has no dot, so parse-level validation rejects it first.
    await expect(assertPublicHttpUrl("https://localhost/x")).rejects.toThrow(/domain/i);
    await expect(assertPublicHttpUrl("https://api.localhost/x")).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicHttpUrl("https://server.internal/x")).rejects.toThrow(BlockedUrlError);
    await expect(assertPublicHttpUrl("https://box.home.arpa/x")).rejects.toThrow(BlockedUrlError);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("blocks hostnames that resolve to private addresses", async () => {
    mockLookup.mockImplementation(async () => [
      { address: "192.168.0.5", family: 4 },
      { address: PUBLIC_IP, family: 4 }
    ]);
    await expect(assertPublicHttpUrl("https://rebind.example.com/x")).rejects.toThrow(
      BlockedUrlError
    );
  });

  it("blocks DNS-resolution failures", async () => {
    mockLookup.mockImplementation(async () => {
      throw new Error("NXDOMAIN");
    });
    await expect(assertPublicHttpUrl("https://nope.example.com/x")).rejects.toThrow(
      BlockedUrlError
    );
  });

  it("accepts hostnames resolving to public addresses", async () => {
    const url = await assertPublicHttpUrl("https://cdn.example.com/video.mp4");
    expect(url.hostname).toBe("cdn.example.com");
    expect(mockLookup).toHaveBeenCalledWith("cdn.example.com", { all: true, verbatim: true });
  });
});

describe("safeFetch redirect hardening", () => {
  it("follows redirects to public hosts", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: "https://cdn.example.com/real.mp4" }))
      .mockResolvedValueOnce(
        new Response("data", { status: 200, headers: { "content-type": "video/mp4" } })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await safeFetch("https://start.example.com/file");
    expect(result.finalUrl).toBe("https://cdn.example.com/real.mp4");
    expect(result.redirects).toEqual(["https://cdn.example.com/real.mp4"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("blocks a redirect to a private address and does not follow it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(302, { location: "http://127.0.0.1:8080/steal" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://evil.example.com/open")).rejects.toThrow(BlockedUrlError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the redirect was never followed
  });

  it("blocks a redirect to a non-HTTP protocol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(jsonResponse(302, { location: "file:///etc/passwd" }))
    );
    await expect(safeFetch("https://evil.example.com/open")).rejects.toThrow(BlockedUrlError);
  });

  it("gives up after too many redirects", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      jsonResponse(302, { location: `https://hop${Math.random()}.example.com/next` })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(safeFetch("https://loop.example.com/a", { maxRedirects: 5 })).rejects.toThrow(
      UpstreamError
    );
    expect(fetchMock).toHaveBeenCalledTimes(6); // initial + 5 hops
  });

  it("rejects a redirect without a destination", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(jsonResponse(302)));
    await expect(safeFetch("https://odd.example.com/a")).rejects.toThrow(UpstreamError);
  });
});

describe("safeFetch failures", () => {
  it("times out when the server never responds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url, init) => {
        const signal = (init as RequestInit).signal as AbortSignal;
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        });
      })
    );

    await expect(safeFetch("https://slow.example.com/a", { timeoutMs: 60 })).rejects.toThrow(
      TimeoutError
    );
  });

  it("wraps connection errors as NetworkError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")));
    await expect(safeFetch("https://dead.example.com/a")).rejects.toThrow(/could not reach/i);
  });

  it("validates the initial URL before fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(safeFetch("http://10.0.0.5/admin")).rejects.toThrow(BlockedUrlError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
