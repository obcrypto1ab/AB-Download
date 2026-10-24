// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { QualitySelector } from "@/components/QualitySelector";
import { DownloadProgress } from "@/components/DownloadProgress";
import { UrlAnalyzer } from "@/components/UrlAnalyzer";
import type { AnalysisResult, DownloadState, QualityOption } from "@/lib/types";

const OPTIONS: QualityOption[] = [
  {
    id: "original",
    label: "Original · MP4",
    container: "mp4",
    sizeBytes: 1048576,
    hasAudio: true,
    kind: "original",
    downloadable: true,
    url: "https://cdn.example.com/a.mp4"
  },
  {
    id: "alt",
    label: "Original · WebM",
    container: "webm",
    hasAudio: true,
    kind: "original",
    downloadable: true,
    url: "https://cdn.example.com/a.webm"
  }
];

describe("QualitySelector", () => {
  it("renders only verified options with their real sizes", () => {
    render(
      <QualitySelector options={OPTIONS} selectedId="original" onSelect={() => undefined} />
    );
    expect(screen.getByText("Original · MP4")).toBeTruthy();
    expect(screen.getByText("1.0 MB")).toBeTruthy();
    expect(screen.getAllByText("Verified")).toHaveLength(OPTIONS.length);
  });

  it("selects an option and reports it", () => {
    const onSelect = vi.fn();
    render(<QualitySelector options={OPTIONS} selectedId="original" onSelect={onSelect} />);

    const second = screen.getByRole("radio", { name: /Original · WebM/ });
    expect(second.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(second);
    expect(onSelect).toHaveBeenCalledWith("alt");
  });

  it("disables interaction while a download is running", () => {
    render(
      <QualitySelector options={OPTIONS} selectedId="original" onSelect={() => undefined} disabled />
    );
    const first = screen.getByRole("radio", { name: /Original · MP4/ });
    const fieldset = first.closest("fieldset");
    expect(fieldset?.disabled).toBe(true);
  });

  it("renders nothing without options", () => {
    const { container } = render(
      <QualitySelector options={[]} selectedId={null} onSelect={() => undefined} />
    );
    expect(container.innerHTML).toBe("");
  });
});

describe("DownloadProgress", () => {
  it("shows percentage, bytes and cancel control while downloading", () => {
    const state: DownloadState = {
      status: "downloading",
      receivedBytes: 512 * 1024,
      totalBytes: 1024 * 1024,
      fileName: "clip.mp4"
    };
    render(<DownloadProgress state={state} speed={1024 * 100} onCancel={() => undefined} />);

    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.getByText(/512 KB of 1.0 MB/)).toBeTruthy();
    expect(screen.getByText("100 KB/s")).toBeTruthy();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50");
  });

  it("shows an indeterminate bar when the total size is unknown", () => {
    const state: DownloadState = { status: "downloading", receivedBytes: 1234 };
    render(<DownloadProgress state={state} speed={null} onCancel={() => undefined} />);
    expect(screen.getByText("Streaming…")).toBeTruthy();
  });
});

describe("UrlAnalyzer", () => {
  it("shows a friendly error for a malformed URL without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<UrlAnalyzer />);
    const input = screen.getByLabelText(/media url/i);
    fireEvent.change(input, { target: { value: "not a url" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/full address/i);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects dangerous protocols client-side", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<UrlAnalyzer />);
    const input = screen.getByLabelText(/media url/i);
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/full address/i);
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the analyzing state while the request is pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => undefined)) // never resolves
    );

    render(<UrlAnalyzer />);
    const input = screen.getByLabelText(/media url/i);
    fireEvent.change(input, { target: { value: "https://cdn.example.com/video.mp4" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText(/Validating the URL/i)).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: /analyzing/i }).hasAttribute("disabled")).toBe(true);
  });

  it("renders the media result card on success", async () => {
    const payload: AnalysisResult = {
      ok: true,
      status: "downloadable",
      providerId: "direct-media",
      providerName: "Direct media file",
      domain: "cdn.example.com",
      title: "clip.mp4",
      fileSizeBytes: 1048576,
      contentType: "video/mp4",
      fileName: "clip.mp4",
      qualities: [
        {
          id: "original",
          label: "Original · MP4",
          container: "mp4",
          sizeBytes: 1048576,
          hasAudio: true,
          kind: "original",
          downloadable: true,
          url: "https://cdn.example.com/clip.mp4"
        }
      ],
      preview: { directUrl: "https://cdn.example.com/clip.mp4" },
      notice: "Verified direct media file."
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), { status: 200 })
      )
    );

    render(<UrlAnalyzer />);
    const input = screen.getByLabelText(/media url/i);
    fireEvent.change(input, { target: { value: "https://cdn.example.com/clip.mp4" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText("Ready to download")).toBeTruthy();
    expect(screen.getByText("Verified quality options")).toBeTruthy();
    expect(screen.getByRole("button", { name: /download/i })).toBeTruthy();
  });

  it("shows the server error with retry for upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, code: "upstream-error", message: "Host refused.", retryable: true }),
          { status: 502 }
        )
      )
    );

    render(<UrlAnalyzer />);
    const input = screen.getByLabelText(/media url/i);
    fireEvent.change(input, { target: { value: "https://cdn.example.com/gone.mp4" } });
    fireEvent.submit(input.closest("form")!);

    expect(await screen.findByText(/Host refused\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });
});
