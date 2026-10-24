"use client";

import { useRef, useState } from "react";

import type { AnalysisResponse } from "@/lib/types";
import { MediaResultCard } from "./MediaResultCard";
import { AlertIcon, BoltIcon, LinkIcon, RefreshIcon, SpinnerIcon } from "./Icons";

type Phase = "idle" | "analyzing" | "error" | "result";

const EXAMPLES = [
  {
    label: "Direct MP4 file",
    url: "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
  },
  {
    label: "YouTube link (preview & metadata)",
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ"
  }
];

function clientPreflight(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Paste a video or media URL first.";
  if (!/^https?:\/\//i.test(trimmed)) {
    return "Include the full address starting with http:// or https://";
  }
  return null;
}

export function UrlAnalyzer() {
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultAnchorRef = useRef<HTMLDivElement | null>(null);
  const [analysisKey, setAnalysisKey] = useState(0);

  async function analyze(target?: string) {
    const candidate = (target ?? url).trim();
    if (!candidate) return;

    const preflight = clientPreflight(candidate);
    if (preflight) {
      setPhase("error");
      setResult(null);
      setError({ message: preflight, retryable: false });
      return;
    }
    if (candidate !== url) setUrl(candidate);

    // Cancel any in-flight analysis (also prevents duplicate requests).
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setPhase("analyzing");
    setError(null);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: candidate }),
        signal: ac.signal
      });
      const data = (await response.json()) as AnalysisResponse;

      if (!data.ok) {
        setPhase("error");
        setResult(null);
        setError({ message: data.message, retryable: data.retryable });
        return;
      }
      setPhase("result");
      setResult(data);
      setAnalysisKey((k) => k + 1);
      requestAnimationFrame(() => {
        // scrollIntoView is unavailable in some test/DOM environments
        if (typeof resultAnchorRef.current?.scrollIntoView === "function") {
          resultAnchorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    } catch (err) {
      if (ac.signal.aborted) return; // superseded by a newer request
      setPhase("error");
      setResult(null);
      setError({
        message: "Could not reach the AB Download service. Check your connection and try again.",
        retryable: true
      });
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
    }
  }

  const busy = phase === "analyzing";

  return (
    <div id="analyzer" className="w-full">
      <form
        className="fade-up d3 flex flex-col gap-3 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          void analyze();
        }}
      >
        <div className="relative flex-1">
          <LinkIcon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            className="input-premium pl-12 pr-4"
            placeholder="Paste a video or media URL here..."
            aria-label="Media URL"
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary shrink-0" disabled={busy}>
          {busy ? (
            <>
              <SpinnerIcon className="h-4 w-4" />
              Analyzing…
            </>
          ) : (
            <>
              <BoltIcon className="h-4 w-4" />
              Analyze Media
            </>
          )}
        </button>
      </form>

      <div className="fade-up d4 mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Try:</span>
        {EXAMPLES.map((example) => (
          <button
            key={example.url}
            type="button"
            className="chip chip-hover transition-colors"
            disabled={busy}
            onClick={() => {
              setUrl(example.url);
              void analyze(example.url);
            }}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* status line */}
      <div className="mt-4 min-h-[1.5rem]" role="status" aria-live="polite">
        {busy && (
          <p className="flex items-center gap-2 text-sm text-accent">
            <SpinnerIcon className="h-4 w-4" />
            Validating the URL and fetching permitted metadata…
          </p>
        )}
        {!busy && phase === "error" && error && (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p className="flex items-center gap-2 text-rose-300">
              <AlertIcon className="h-4 w-4 shrink-0" />
              {error.message}
            </p>
            {error.retryable && (
              <button type="button" className="btn-ghost !px-3 !py-1.5 text-xs" onClick={() => void analyze()}>
                <RefreshIcon className="h-3.5 w-3.5" />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* result */}
      <div ref={resultAnchorRef} className="scroll-mt-28">
        {phase === "result" && result && (
          <MediaResultCard
            key={analysisKey}
            result={result}
            onRetry={() => void analyze()}
          />
        )}
      </div>
    </div>
  );
}
