import { describe, expect, it } from "vitest";

import {
  classifyUrl,
  detectVimeoVideoId,
  detectYouTubeVideoId
} from "@/lib/source-registry";
import { parseHttpUrl } from "@/lib/url-validation";

function url(raw: string): URL {
  return parseHttpUrl(raw);
}

describe("YouTube URL recognition", () => {
  it("recognizes youtube.com/watch?v=VIDEO_ID", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/watch?v=aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
  });

  it("recognizes youtu.be/VIDEO_ID", () => {
    expect(detectYouTubeVideoId(url("https://youtu.be/aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
  });

  it("recognizes youtube.com/shorts/VIDEO_ID", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/shorts/aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
  });

  it("recognizes youtube.com/embed/VIDEO_ID", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/embed/aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
  });

  it("recognizes live and music hosts", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/live/aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
    expect(detectYouTubeVideoId(url("https://music.youtube.com/watch?v=aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
    expect(detectYouTubeVideoId(url("https://m.youtube.com/watch?v=aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
    expect(detectYouTubeVideoId(url("https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ"))).toBe("aqz-KE-bpKQ");
  });

  it("keeps extra query parameters out of the id", () => {
    expect(
      detectYouTubeVideoId(url("https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=42s&list=PL123"))
    ).toBe("aqz-KE-bpKQ");
  });

  it("rejects playlist URLs", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/playlist?list=PL1234567890"))).toBeNull();
  });

  it("rejects channel and user URLs", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/@somechannel"))).toBeNull();
    expect(detectYouTubeVideoId(url("https://www.youtube.com/channel/UCabc123"))).toBeNull();
  });

  it("rejects malformed video ids", () => {
    expect(detectYouTubeVideoId(url("https://www.youtube.com/watch?v=short"))).toBeNull();
    expect(detectYouTubeVideoId(url("https://www.youtube.com/watch?v=waytoolongvideoid123"))).toBeNull();
    expect(detectYouTubeVideoId(url("https://www.youtube.com/watch?v=bad~id~id!"))).toBeNull();
  });

  it("ignores non-YouTube hosts", () => {
    expect(detectYouTubeVideoId(url("https://notyoutube.com/watch?v=aqz-KE-bpKQ"))).toBeNull();
    expect(detectYouTubeVideoId(url("https://example.com/watch?v=aqz-KE-bpKQ"))).toBeNull();
  });
});

describe("Vimeo URL recognition", () => {
  it("recognizes vimeo.com/{id}", () => {
    expect(detectVimeoVideoId(url("https://vimeo.com/76979871"))).toBe("76979871");
    expect(detectVimeoVideoId(url("https://www.vimeo.com/76979871"))).toBe("76979871");
  });

  it("recognizes player.vimeo.com/video/{id}", () => {
    expect(detectVimeoVideoId(url("https://player.vimeo.com/video/76979871"))).toBe("76979871");
  });

  it("rejects albums, groups and non-numeric paths", () => {
    expect(detectVimeoVideoId(url("https://vimeo.com/album/123/somevideo"))).toBeNull();
    expect(detectVimeoVideoId(url("https://vimeo.com/groups/shortfilms"))).toBeNull();
    expect(detectVimeoVideoId(url("https://vimeo.com/notanumber"))).toBeNull();
  });
});

describe("classifyUrl", () => {
  it("classifies YouTube links", () => {
    expect(classifyUrl(url("https://youtu.be/aqz-KE-bpKQ"))).toBe("youtube");
  });

  it("classifies Vimeo links", () => {
    expect(classifyUrl(url("https://vimeo.com/76979871"))).toBe("vimeo");
  });

  it("classifies direct media candidates by extension", () => {
    expect(classifyUrl(url("https://cdn.example.com/videos/movie.mp4"))).toBe("direct-media");
    expect(classifyUrl(url("https://cdn.example.com/audio/song.flac"))).toBe("direct-media");
  });

  it("marks ordinary pages as unknown (server verifies later)", () => {
    expect(classifyUrl(url("https://example.com/some/page"))).toBe("unknown");
    expect(classifyUrl(url("https://example.com/"))).toBe("unknown");
  });
});
