"use client";

import type { DownloadState } from "@/lib/types";
import { formatBytes, formatSpeed } from "@/lib/format";
import { SpinnerIcon, XIcon } from "./Icons";

interface Props {
  state: DownloadState;
  speed?: number | null;
  onCancel: () => void;
}

/** Animated download progress with live transfer stats and cancel control. */
export function DownloadProgress({ state, speed, onCancel }: Props) {
  const total = state.totalBytes;
  const percent =
    total && total > 0 ? Math.min(100, Math.round((state.receivedBytes / total) * 100)) : null;

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent/[0.05] p-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-ink">
          <SpinnerIcon className="h-4 w-4 text-accent" />
          {state.status === "starting" ? "Starting download…" : "Downloading"}
          {state.fileName && (
            <span className="max-w-[220px] truncate font-normal text-muted">
              {state.fileName}
            </span>
          )}
        </div>
        <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={onCancel}>
          <XIcon className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>

      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-label="Download progress"
      >
        <div
          className="progress-stripes h-full rounded-full bg-gradient-to-r from-accent via-electric to-brand transition-[width] duration-200"
          style={{ width: percent === null ? "100%" : `${percent}%`, opacity: percent === null ? 0.4 : 1 }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted">
        <span className="font-semibold text-accent">
          {percent === null ? "Streaming…" : `${percent}%`}
        </span>
        <span>
          {formatBytes(state.receivedBytes)}
          {total ? ` of ${formatBytes(total)}` : ""}
        </span>
        {speed !== null && <span>{formatSpeed(speed)}</span>}
      </div>
    </div>
  );
}
