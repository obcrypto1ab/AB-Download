import { ArrowRightIcon, DownloadIcon, PlayIcon } from "./Icons";

/**
 * Decorative cinematic hero visual: floating media tiles, an animated
 * progress ring and aurora lighting. Pure CSS animation, pointer-events
 * disabled, and fully disabled under prefers-reduced-motion.
 */
export function HeroVisual() {
  return (
    <div className="pointer-none relative mx-auto aspect-square w-full max-w-[520px] select-none deco" aria-hidden="true">
      {/* aurora lighting */}
      <div className="aurora left-[-12%] top-[6%] h-64 w-64 bg-brand/50" />
      <div className="aurora bottom-[4%] right-[-8%] h-56 w-56 bg-accent/40" style={{ animationDelay: "-6s" }} />
      <div className="aurora right-[22%] top-[-6%] h-40 w-40 bg-magenta/40" style={{ animationDelay: "-11s" }} />

      {/* main media preview card */}
      <div className="glass-strong float-a absolute left-1/2 top-1/2 w-[68%] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-4 shadow-card">
        <div className="relative overflow-hidden rounded-2xl">
          <div
            className="aspect-video w-full"
            style={{
              background:
                "linear-gradient(135deg, rgba(139,92,246,0.85), rgba(59,130,246,0.75) 45%, rgba(34,211,238,0.7))"
            }}
          >
            <div className="flex h-full w-full items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/30">
                <PlayIcon className="ml-0.5 h-6 w-6 text-white" />
              </span>
            </div>
          </div>
          {/* fake timeline */}
          <div className="absolute bottom-2 left-2 right-2 h-1.5 rounded-full bg-black/40">
            <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-accent to-brand" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between px-1 pb-1">
          <div>
            <div className="h-2.5 w-28 rounded-full bg-white/25" />
            <div className="mt-2 h-2 w-16 rounded-full bg-white/15" />
          </div>
          <span className="badge-ok">1080p</span>
        </div>
      </div>

      {/* download tile with animated progress ring */}
      <div className="glass float-b absolute -left-2 top-[16%] flex items-center gap-3 rounded-2xl px-4 py-3 shadow-card">
        <span className="relative inline-flex h-11 w-11 items-center justify-center">
          <svg viewBox="0 0 64 64" className="h-11 w-11 -rotate-90">
            <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="6" />
            <circle
              cx="32" cy="32" r="28" fill="none" stroke="#22D3EE" strokeWidth="6" strokeLinecap="round"
              strokeDasharray="176"
              style={{ strokeDashoffset: 60, animation: "ring-loop 4.2s cubic-bezier(0.65,0,0.35,1) infinite" }}
            />
          </svg>
          <DownloadIcon className="absolute h-4 w-4 text-accent" />
        </span>
        <div>
          <div className="text-xs font-semibold text-ink">Saving…</div>
          <div className="text-[11px] text-muted">8.4 MB/s</div>
        </div>
      </div>

      {/* quality chip tile */}
      <div className="glass float-c absolute -right-1 top-[38%] rounded-2xl px-4 py-3 shadow-card">
        <div className="text-[11px] font-medium text-muted">Quality</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent pulse-dot" />
          <span className="text-sm font-bold text-ink">Original · MP4</span>
        </div>
      </div>

      {/* audio tile */}
      <div className="glass float-a absolute bottom-[8%] left-[14%] flex items-center gap-3 rounded-2xl px-4 py-3 shadow-card" style={{ animationDelay: "-2.5s" }}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-magenta/20 text-magenta">
          <DownloadIcon className="h-4 w-4" />
        </span>
        <div className="text-[11px] leading-tight text-muted">
          Verified source<br />
          <span className="font-semibold text-ink">Ready to download</span>
        </div>
      </div>

      {/* connecting gradient line */}
      <div className="divider-gradient absolute left-[8%] right-[8%] top-[50%] -rotate-6 opacity-60" />
    </div>
  );
}

export function HeroCopy() {
  return (
    <div className="flex flex-col items-start">
      <span className="fade-up chip">
        <span className="h-1.5 w-1.5 rounded-full bg-accent pulse-dot" />
        Your Media. Your Quality. Your Control.
      </span>
      <h1 className="fade-up d1 mt-6 font-display text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
        Download Better.
        <br />
        <span className="text-gradient">Experience More.</span>
      </h1>
      <p className="fade-up d2 mt-6 max-w-xl text-lg leading-relaxed text-muted">
        Preview your media, explore available quality options, and save authorized
        videos with a clean, effortless workflow.
      </p>
    </div>
  );
}

export function ExploreFeaturesCta() {
  return (
    <a href="#features" className="btn-secondary fade-up d4">
      Explore Features
      <ArrowRightIcon className="h-4 w-4" />
    </a>
  );
}
