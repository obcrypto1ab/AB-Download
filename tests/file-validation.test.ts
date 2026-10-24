import { describe, expect, it } from "vitest";

import {
  fileNameFromUrlPath,
  isAllowedMediaContentType,
  isStreamingManifest,
  MAX_DOWNLOAD_BYTES,
  CLIENT_BLOB_LIMIT,
  pickFileNameFromDisposition,
  sanitizeFileName
} from "@/lib/file-validation";

describe("isAllowedMediaContentType", () => {
  it("accepts video and audio types", () => {
    expect(isAllowedMediaContentType("video/mp4")).toBe(true);
    expect(isAllowedMediaContentType("video/webm; charset=binary")).toBe(true);
    expect(isAllowedMediaContentType("VIDEO/MP4")).toBe(true);
    expect(isAllowedMediaContentType("audio/mpeg")).toBe(true);
    expect(isAllowedMediaContentType("audio/ogg; codecs=opus")).toBe(true);
  });

  it("accepts generic binary types CDNs use for media", () => {
    expect(isAllowedMediaContentType("application/octet-stream")).toBe(true);
    expect(isAllowedMediaContentType("application/ogg")).toBe(true);
    expect(isAllowedMediaContentType("application/x-matroska")).toBe(true);
  });

  it("rejects non-media types", () => {
    expect(isAllowedMediaContentType("text/html")).toBe(false);
    expect(isAllowedMediaContentType("application/json")).toBe(false);
    expect(isAllowedMediaContentType("image/jpeg")).toBe(false);
    expect(isAllowedMediaContentType("application/pdf")).toBe(false);
    expect(isAllowedMediaContentType("")).toBe(false);
    expect(isAllowedMediaContentType(null)).toBe(false);
    expect(isAllowedMediaContentType(undefined)).toBe(false);
  });
});

describe("isStreamingManifest", () => {
  it("detects HLS and DASH manifests", () => {
    expect(isStreamingManifest("application/vnd.apple.mpegurl")).toBe(true);
    expect(isStreamingManifest("application/dash+xml")).toBe(true);
    expect(isStreamingManifest("video/mp4")).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it("removes path traversal (separators become underscores)", () => {
    // "../..//etc/passwd" → ".._.._etc_passwd" → leading dots stripped
    expect(sanitizeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(sanitizeFileName("..\\..\\windows\\system32\\evil.exe")).toBe(
      "_.._windows_system32_evil.exe"
    );
    // No path separators can survive sanitization.
    expect(sanitizeFileName("../../etc/passwd")).not.toMatch(/[/\\]/);
  });

  it("strips leading dots to prevent hidden/traversal names", () => {
    const result = sanitizeFileName("../../../etc/passwd");
    expect(result.startsWith(".")).toBe(false);
    expect(result).not.toMatch(/(^|[\\/])\.\./);
  });

  it("replaces filesystem-unsafe characters", () => {
    expect(sanitizeFileName('video: final <cut>? "take".mp4')).toBe(
      "video_ final _cut__ _take_.mp4"
    );
  });

  it("preserves Unicode names (NFC)", () => {
    expect(sanitizeFileName("视频 视频.mp4")).toBe("视频 视频.mp4");
    expect(sanitizeFileName("café — naïve.mkv")).toBe("café — naïve.mkv");
  });

  it("neutralizes Windows reserved device names", () => {
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("con.mp4")).toBe("_con.mp4");
    expect(sanitizeFileName("COM1.wav")).toBe("_COM1.wav");
    expect(sanitizeFileName("LPT9.txt")).toBe("_LPT9.txt");
  });

  it("caps length while preserving the extension", () => {
    const long = `${"a".repeat(300)}.mp4`;
    const result = sanitizeFileName(long);
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result.endsWith(".mp4")).toBe(true);
  });

  it("strips control characters", () => {
    expect(sanitizeFileName("bad\u0000name\u0007.mp4")).toBe("badname.mp4");
  });

  it("falls back for empty input", () => {
    expect(sanitizeFileName("")).toBe("download");
    expect(sanitizeFileName("...")).toBe("download");
    expect(sanitizeFileName("", "clip.mp4")).toBe("clip.mp4");
  });

  it("removes trailing dots and spaces (Windows)", () => {
    expect(sanitizeFileName("my video. .mp4. ")).toBe("my video. .mp4");
  });
});

describe("pickFileNameFromDisposition", () => {
  it("prefers RFC 5987 filename* and decodes UTF-8", () => {
    expect(
      pickFileNameFromDisposition("attachment; filename=\"fallback.mp4\"; filename*=UTF-8''Na%C3%AFve%20film.mp4")
    ).toBe("Naïve film.mp4");
  });

  it("reads plain quoted filename", () => {
    expect(pickFileNameFromDisposition("attachment; filename=\"clip.mp4\"")).toBe("clip.mp4");
  });

  it("reads unquoted filename", () => {
    expect(pickFileNameFromDisposition("attachment; filename=clip.mp4")).toBe("clip.mp4");
  });

  it("returns null when absent", () => {
    expect(pickFileNameFromDisposition(null)).toBeNull();
    expect(pickFileNameFromDisposition("inline")).toBeNull();
  });
});

describe("fileNameFromUrlPath", () => {
  it("extracts a basename with extension", () => {
    expect(fileNameFromUrlPath("/videos/Big%20Buck%20Bunny.mp4")).toBe("Big Buck Bunny.mp4");
  });

  it("returns null without an extension", () => {
    expect(fileNameFromUrlPath("/videos/")).toBeNull();
  });
});

describe("size limits", () => {
  it("server cap is 2 GiB and blob limit is 256 MiB", () => {
    expect(MAX_DOWNLOAD_BYTES).toBe(2 * 1024 * 1024 * 1024);
    expect(CLIENT_BLOB_LIMIT).toBe(256 * 1024 * 1024);
    expect(CLIENT_BLOB_LIMIT).toBeLessThan(MAX_DOWNLOAD_BYTES);
  });
});
