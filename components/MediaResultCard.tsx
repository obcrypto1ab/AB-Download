"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { AnalysisResponse, DownloadState } from "@/lib/types";
import {
  canStartDownload,
  downloadReducer,
  humanDownloadError,
  initialDownloadState,
  isAbort,
  performDownload
} from "@/lib/download-client";
import { sanitizeFileName } from "@/lib/file-validation";
import { aspectRatio, formatBytes, formatDuration, formatSpeed, resolutionLabel } from "@/lib/format";
import { QualitySelector } from "./QualitySelector";
import { DownloadProgress } from "./DownloadProgress";
import { AlertIcon, CheckIcon, DownloadIcon, ExternalIcon, EyeIcon, FileVideoIcon, PlayIcon, RefreshIcon, ShieldIcon, XIcon } from "./Icons";

interface Props {
  result: AnalysisResponse;
  onRetry: () => void;
}

const STATUS_BADGES: Record<string, { cls: string; label: string }> = {
  downloadable: { cls: "badge-ok", label: "Ready to download" },
  "preview-only": { cls: "badge-warn", label: "Preview only" },
  "web-page": { cls: "badge-info", label: "Web page — not media" },
  unsupported: { cls: "badge-bad", label: "Unsupported source" }
};

function ExtensionPreviewFallback({ title }: { title: string }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 rounded-2xl bg-gradient-to-br from-brand/25 via-electric/20 to-accent/15 text-center">
      <FileVideoIcon className="h-10 w-10 text-white/70" />
      <p className="max-w-[80%] text-xs leading-relaxed text-white/80">
        {title}
        <br />
        <span className="text-white/60">
          This host doesn&apos;t allow in-page playback, but the download still works.
        </span>
      </p>
    </div>
  );
}

export function MediaResultCard({ result, onRetry }: Props) {
  const [speed, setSpeed] = useState<number | null>(null);
  const [download, dispatch] = useReducer(downloadReducer, initialDownloadState);
  const abortRef = useRef<AbortController | null>(null);
  const speedSample = useRef<{ time: number; bytes: number }>({ time: 0, bytes: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Client-side probe: read duration/resolution from the <video> element
  // when the host permits metadata loading. Never fabricated — only shown
  // when the browser actually reports the values.
  const directUrl = result.ok && result.preview?.directUrl ? result.preview.directUrl : null;
  const [probe, setProbe] = useState<{
    duration?: number;
    width?: number;
    height?: number;
    playFailed: boolean;
  }>({ playFailed: false });

  useEffect(() => {
    setProbe({ playFailed: false });
    if (!directUrl) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const onMeta = () => {
      setProbe((prev) => ({
        ...prev,
        duration: Number.isFinite(video.duration) && video.duration > 0 ? video.duration : prev.duration,
        width: video.videoWidth || prev.width,
        height: video.videoHeight || prev.height
      }));
    };
    const onError = () => setProbe((prev) => ({ ...prev, playFailed: true }));
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.src = directUrl;
    video.load();
    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("error", onError);
      video.removeAttribute("src");
      video.load();
    };
  }, [directUrl]);

  const duration = result.ok ? (probe.duration ?? result.durationSeconds) : undefined;
  const width = result.ok ? (probe.width ?? result.width) : undefined;
  const height = result.ok ? (probe.height ?? result.height) : undefined;
  const ratio = useMemo(() => aspectRatio(width, height), [width, height]);
  const resolution = useMemo(() => resolutionLabel(height), [height]);

  if (!result.ok) {
    return (
      <article className="glass-strong fade-up mt-8 rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
            <AlertIcon className="h-6 w-6" />
          </span>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">Analysis failed</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted">{result.message}</p>
          </div>
          {result.retryable && (
            <button type="button" className="btn-secondary shrink-0" onClick={onRetry}>
              <RefreshIcon className="h-4 w-4" />
              Retry
            </button>
          )}
        </div>
      </article>
    );
  }

  const badge = STATUS_BADGES[result.status] ?? STATUS_BADGES.unsupported;
  const downloadable = result.qualities.filter((q) => q.downloadable && q.url);
  const selected = downloadable.find((q) => q.id === selectedId) ?? downloadable[0] ?? null;
  const busyDownload = download.status === "starting" || download.status === "downloading";

  const fileTitle = result.fileName ?? result.title ?? "media-download";
  const sizeFallback = result.fileSizeBytes;

  async function startDownload() {
    if (!selected?.url || !canStartDownload(download)) return;

    const extension = selected.container ? `.${selected.container}` : "";
    const baseName = fileTitle.includes(".") ? fileTitle : `${fileTitle}${extension}`;
    const fileName = sanitizeFileName(baseName);

    const ac = new AbortController();
    abortRef.current = ac;
    dispatch({
      type: "start",
      fileName,
      totalBytes: selected.sizeBytes ?? sizeFallback
    });
    setSpeed(null);
    speedSample.current = { time: performance.now(), bytes: 0 };

    try {
      await performDownload({
        url: `/api/download?u=${encodeURIComponent(selected.url)}`,
        fileName,
        expectedTotal: selected.sizeBytes ?? sizeFallback,
        signal: ac.signal,
        onProgress: (received, total) => {
          dispatch({ type: "progress", receivedBytes: received, totalBytes: total });
          const now = performance.now();
          const sample = speedSample.current;
          const elapsed = (now - sample.time) / 1000;
          if (elapsed > 0.4) {
            const instant = (received - sample.bytes) / elapsed;
            setSpeed((prev) => (prev === null ? instant : prev * 0.7 + instant * 0.3));
            sample.time = now;
            sample.bytes = received;
          }
        }
      });
      dispatch({ type: "complete" });
    } catch (error) {
      if (isAbort(error) || (error instanceof DOMException && error.name === "AbortError")) {
        dispatch({ type: "cancel" });
      } else {
        dispatch({ type: "fail", error: humanDownloadError(error) });
      }
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }

  function cancelDownload() {
    abortRef.current?.abort();
  }

  return (
    <article className="glass-strong fade-up mt-8 overflow-hidden rounded-3xl shadow-card">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* ── preview column ── */}
        <div>
          {result.preview?.embedUrl && (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <iframe
                src={result.preview.embedUrl}
                className="aspect-video w-full"
                title={result.title ?? "Media preview"}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          )}
          {!result.preview?.embedUrl && directUrl && !probe.playFailed && (
            <video
              className="aspect-video w-full rounded-2xl border border-white/10 bg-black/40"
              src={directUrl}
              controls
              preload="metadata"
              onError={() => setProbe((prev) => ({ ...prev, playFailed: true }))}
            />
          )}
          {!result.preview?.embedUrl && (!directUrl || probe.playFailed) && (
            <ExtensionPreviewFallback title={result.title ?? result.domain} />
          )}
        </div>

        {/* ── metadata column ── */}
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <span className={badge.cls}>{badge.label}</span>
            <span className="chip">{result.providerName}</span>
            <span className="chip">{result.domain}</span>
          </div>

          <h3 className="mt-3 font-display text-xl font-bold leading-snug">
            {result.title ?? "Analyzed media"}
          </h3>

          <dl className="meta-grid mt-4">
            {duration !== undefined && (
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(duration)}</dd>
              </div>
            )}
            {resolution && (
              <div>
                <dt>Resolution</dt>
                <dd>{resolution}</dd>
              </div>
            )}
            {ratio && (
              <div>
                <dt>Aspect ratio</dt>
                <dd>{ratio}</dd>
              </div>
            )}
            {result.contentType && (
              <div>
                <dt>File type</dt>
                <dd className="uppercase">{result.contentType.split("/")[1] ?? result.contentType}</dd>
              </div>
            )}
            {result.fileSizeBytes !== undefined && (
              <div>
                <dt>File size</dt>
                <dd>{formatBytes(result.fileSizeBytes)}</dd>
              </div>
            )}
            <div>
              <dt>Source status</dt>
              <dd className="flex items-center gap-1.5">
                <ShieldIcon className="h-3.5 w-3.5 text-accent" />
                {result.status === "downloadable" ? "Verified headers" : "Official metadata"}
              </dd>
            </div>
          </dl>

          {result.notice && (
            <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3.5 text-sm leading-relaxed text-muted">
              {result.notice}
            </p>
          )}

          {downloadable.length > 0 && (
            <div className="mt-5 border-t border-white/10 pt-5">
              <QualitySelector
                options={downloadable}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
                disabled={busyDownload}
              />

              <div className="mt-4">
                {busyDownload ? (
                  <DownloadProgress
                    state={download}
                    speed={speed}
                    onCancel={cancelDownload}
                  />
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <button type="button" className="btn-primary" onClick={() => void startDownload()}>
                      <DownloadIcon className="h-4 w-4" />
                      {download.status === "complete"
                        ? "Download again"
                        : download.status === "failed" || download.status === "canceled"
                          ? "Retry download"
                          : "Download"}
                    </button>
                    {selected && (
                      <span className="text-xs text-muted">
                        {selected.sizeBytes ? `${formatBytes(selected.sizeBytes)} · ` : ""}
                        {selected.note}
                      </span>
                    )}
                  </div>
                )}

                {download.status === "complete" && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-accent">
                    <CheckIcon className="h-4 w-4" />
                    Download complete — saved as “{download.fileName}”.
                  </p>
                )}
                {download.status === "canceled" && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-muted">
                    <XIcon className="h-4 w-4" />
                    Download canceled. You can retry at any time.
                  </p>
                )}
                {download.status === "failed" && (
                  <p className="mt-3 flex items-center gap-2 text-sm text-rose-300">
                    <AlertIcon className="h-4 w-4 shrink-0" />
                    {download.error}
                  </p>
                )}

                {result.openOnSourceUrl && (
                  <div className="mt-4 flex items-center gap-1.5 text-xs text-muted">
                    <EyeIcon className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Prefer the original host?{" "}
                      <a
                        href={result.openOnSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="font-medium text-accent hover:underline"
                      >
                        Open direct link
                        <ExternalIcon className="ml-1 inline h-3 w-3" />
                      </a>{" "}
                      (behavior depends on the host&apos;s own headers).
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {downloadable.length === 0 && result.openOnSourceUrl && (
            <div className="mt-5 border-t border-white/10 pt-5">
              <a
                href={result.openOnSourceUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-secondary"
              >
                <PlayIcon className="h-4 w-4" />
                Open on {result.providerName}
                <ExternalIcon className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
