// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  canStartDownload,
  downloadReducer,
  DownloadError,
  humanDownloadError,
  initialDownloadState,
  performDownload
} from "@/lib/download-client";
import { CLIENT_BLOB_LIMIT } from "@/lib/file-validation";
import type { DownloadState } from "@/lib/types";

function mediaResponse(chunks: number[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) {
        controller.enqueue(new Uint8Array(size).fill(1));
      }
      controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "video/mp4", ...headers } });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadReducer state machine", () => {
  it("starts from a settled state", () => {
    const started = downloadReducer(initialDownloadState, {
      type: "start",
      fileName: "clip.mp4",
      totalBytes: 1000
    });
    expect(started.status).toBe("starting");
    expect(started.fileName).toBe("clip.mp4");
    expect(started.totalBytes).toBe(1000);
  });

  it("ignores a second start while downloading (duplicate prevention)", () => {
    let state: DownloadState = downloadReducer(initialDownloadState, {
      type: "start",
      fileName: "a.mp4"
    });
    state = downloadReducer(state, { type: "progress", receivedBytes: 100 });
    const reStarted = downloadReducer(state, { type: "start", fileName: "b.mp4" });
    expect(reStarted).toBe(state); // same object — the duplicate start was a no-op
    expect(reStarted.fileName).toBe("a.mp4");
  });

  it("ignores progress outside an active download", () => {
    const idle = downloadReducer(initialDownloadState, { type: "progress", receivedBytes: 50 });
    expect(idle).toBe(initialDownloadState);

    const canceled = downloadReducer(
      downloadReducer(initialDownloadState, { type: "start", fileName: "a.mp4" }),
      { type: "cancel" }
    );
    const afterCancel = downloadReducer(canceled, { type: "progress", receivedBytes: 99 });
    expect(afterCancel.receivedBytes).toBe(0);
    expect(afterCancel.status).toBe("canceled");
  });

  it("moves through downloading → complete", () => {
    let state = downloadReducer(initialDownloadState, { type: "start", fileName: "a.mp4" });
    state = downloadReducer(state, { type: "progress", receivedBytes: 10, totalBytes: 20 });
    expect(state.status).toBe("downloading");
    state = downloadReducer(state, { type: "complete" });
    expect(state.status).toBe("complete");
  });

  it("records failures and cancellations only while active", () => {
    let state = downloadReducer(initialDownloadState, { type: "start", fileName: "a.mp4" });
    state = downloadReducer(state, { type: "fail", error: "network died" });
    expect(state.status).toBe("failed");
    expect(state.error).toBe("network died");

    // a failed download can start again
    expect(canStartDownload(state)).toBe(true);
    // and cancel is ignored once settled
    expect(downloadReducer(state, { type: "cancel" })).toBe(state);
  });

  it("canStartDownload blocks while starting or downloading", () => {
    const starting = downloadReducer(initialDownloadState, { type: "start", fileName: "x" });
    expect(canStartDownload(starting)).toBe(false);
    const downloading = downloadReducer(starting, { type: "progress", receivedBytes: 1 });
    expect(canStartDownload(downloading)).toBe(false);
    expect(canStartDownload(initialDownloadState)).toBe(true);
    expect(canStartDownload({ ...initialDownloadState, status: "complete" })).toBe(true);
  });
});

describe("humanDownloadError", () => {
  it("maps known codes to actionable messages", () => {
    expect(humanDownloadError(new DownloadError("too-large", "x"))).toMatch(/too large/i);
    expect(humanDownloadError(new DownloadError("http-error", "x"))).toMatch(/expired|rejected/i);
    expect(humanDownloadError(new DownloadError("network", "x"))).toMatch(/connection/i);
  });

  it("maps abort exceptions to a cancel message", () => {
    expect(humanDownloadError(new DOMException("Aborted", "AbortError"))).toMatch(/cancel/i);
  });
});

describe("performDownload (blob path, no File System Access API)", () => {
  it("streams with byte-accurate progress and triggers a save", async () => {
    const createObjectURL = vi.fn(() => "blob:mock");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mediaResponse([300, 500, 200], { "content-length": "1000" }))
    );

    const progress: number[] = [];
    const result = await performDownload({
      url: "/api/download?u=x",
      fileName: "clip.mp4",
      signal: new AbortController().signal,
      onProgress: (received) => progress.push(received)
    });

    expect(result.savedTo).toBe("downloads-folder");
    expect(progress).toEqual([300, 800, 1000]);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).not.toHaveBeenCalled(); // revoked on a delayed timer
  });

  it("fails early when the declared size exceeds the blob limit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      performDownload({
        url: "/api/download?u=x",
        fileName: "big.mp4",
        expectedTotal: CLIENT_BLOB_LIMIT + 1,
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: "too-large" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts mid-stream when a size-less response exceeds the blob limit", async () => {
    const bigChunks = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(130 * 1024 * 1024).fill(0));
        controller.enqueue(new Uint8Array(130 * 1024 * 1024).fill(0));
        controller.close();
      }
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(bigChunks, { status: 200, headers: { "content-type": "video/mp4" } })
      )
    );

    await expect(
      performDownload({
        url: "/api/download?u=x",
        fileName: "huge.mp4",
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: "too-large" });
  });

  it("propagates cancellation through the stream", async () => {
    const controller = new AbortController();

    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3]));
        // never enqueues again; abort errors the stream like a real fetch would
        controller.signal.addEventListener("abort", () => {
          c.error(new DOMException("Aborted", "AbortError"));
        });
      }
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        init?.signal?.addEventListener("abort", () => controller.abort(), { once: true });
        return new Response(stream, { status: 200, headers: { "content-type": "video/mp4" } });
      })
    );

    const progress: number[] = [];
    const pending = performDownload({
      url: "/api/download?u=x",
      fileName: "clip.mp4",
      signal: controller.signal,
      onProgress: (received) => {
        progress.push(received);
        if (progress.length === 1) controller.abort();
      }
    });

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(progress).toEqual([3]);
  });

  it("surfaces HTTP errors from the proxy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: false, code: "not-media" }), { status: 415 })
      )
    );
    await expect(
      performDownload({
        url: "/api/download?u=x",
        fileName: "clip.mp4",
        signal: new AbortController().signal
      })
    ).rejects.toMatchObject({ code: "not-media" });
  });
});
