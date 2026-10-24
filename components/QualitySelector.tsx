"use client";

import type { QualityOption } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { CheckIcon, DownloadIcon, MusicIcon } from "./Icons";

interface Props {
  options: QualityOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

/**
 * Verified-quality selector. Renders ONLY options the analysis actually
 * verified — never a hardcoded list of resolutions.
 */
export function QualitySelector({ options, selectedId, onSelect, disabled }: Props) {
  if (options.length === 0) return null;

  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
        Verified quality options
      </legend>
      <div
        role="radiogroup"
        aria-label="Quality"
        className="mt-3 grid gap-2.5 sm:grid-cols-2"
      >
        {options.map((option) => {
          const isSelected = option.id === selectedId;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.id)}
              className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition-all duration-200 ${
                isSelected
                  ? "border-accent/60 bg-accent/[0.08] shadow-glow-accent"
                  : "border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]"
              } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
            >
              {isSelected && (
                <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-base">
                  <CheckIcon className="h-3 w-3" />
                </span>
              )}
              <div className="flex items-center gap-2 pr-6">
                <DownloadIcon className="h-4 w-4 shrink-0 text-accent" />
                <span className="font-semibold text-ink">{option.label}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                {option.sizeBytes !== undefined && <span>{formatBytes(option.sizeBytes)}</span>}
                {option.container && <span className="uppercase">{option.container}</span>}
                {option.codec && <span>{option.codec}</span>}
                <span className="inline-flex items-center gap-1">
                  <MusicIcon className="h-3 w-3" />
                  {option.hasAudio ? "Audio included" : "No audio"}
                </span>
                <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
                  Verified
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
