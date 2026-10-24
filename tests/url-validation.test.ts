import { describe, expect, it } from "vitest";

import { parseHttpUrl } from "@/lib/url-validation";
import { InvalidUrlError } from "@/lib/errors";

describe("parseHttpUrl", () => {
  it("parses a valid https URL", () => {
    const url = parseHttpUrl("https://example.com/video.mp4");
    expect(url.hostname).toBe("example.com");
    expect(url.protocol).toBe("https:");
  });

  it("parses a valid http URL", () => {
    const url = parseHttpUrl("http://example.com/file.webm");
    expect(url.protocol).toBe("http:");
  });

  it("trims surrounding whitespace", () => {
    expect(parseHttpUrl("  https://example.com/a.mp4  ").hostname).toBe("example.com");
  });

  it("strips trailing copy/paste punctuation but keeps .mp4", () => {
    const url = parseHttpUrl("https://example.com/a.mp4)");
    expect(url.pathname).toBe("/a.mp4");
  });

  it("rejects empty input", () => {
    expect(() => parseHttpUrl("")).toThrow(InvalidUrlError);
    expect(() => parseHttpUrl("   ")).toThrow(InvalidUrlError);
  });

  it("rejects input that is not a URL", () => {
    expect(() => parseHttpUrl("not a url at all")).toThrow(InvalidUrlError);
    expect(() => parseHttpUrl("example.com/video.mp4")).toThrow(InvalidUrlError);
  });

  it("rejects dangerous protocols", () => {
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "file:///C:/Windows/system32/config",
      "ftp://example.com/file.mp4",
      "vbscript:msgbox(1)"
    ]) {
      expect(() => parseHttpUrl(bad)).toThrow(InvalidUrlError);
      expect(() => parseHttpUrl(bad)).toThrow(/protocol/i);
    }
  });

  it("rejects URLs with embedded credentials", () => {
    expect(() => parseHttpUrl("https://user:pass@example.com/a.mp4")).toThrow(/credentials/i);
  });

  it("rejects non-standard ports", () => {
    expect(() => parseHttpUrl("https://example.com:8080/a.mp4")).toThrow(/ports/i);
    expect(() => parseHttpUrl("http://example.com:22/a.mp4")).toThrow(/ports/i);
  });

  it("accepts explicit default ports", () => {
    expect(parseHttpUrl("https://example.com:443/a.mp4").port).toBe("");
    expect(parseHttpUrl("http://example.com:80/a.mp4").port).toBe("");
  });

  it("rejects hosts without a dot", () => {
    expect(() => parseHttpUrl("https://localhost/a.mp4")).toThrow(/domain/i);
  });

  it("rejects URLs with whitespace or control characters", () => {
    expect(() => parseHttpUrl("https://example.com/a b.mp4")).toThrow(InvalidUrlError);
    expect(() => parseHttpUrl("https://exam\nple.com/a.mp4")).toThrow(InvalidUrlError);
  });

  it("rejects oversized URLs", () => {
    const long = `https://example.com/${"a".repeat(3000)}.mp4`;
    expect(() => parseHttpUrl(long)).toThrow(/too long/i);
  });
});
