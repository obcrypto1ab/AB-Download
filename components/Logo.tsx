/** Original AB Download brand mark — gradient "A" strokes with a download arrow. */

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="ab-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="0.55" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ab-logo-g)" opacity="0.14" />
      <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="url(#ab-logo-g)" strokeWidth="2.5" />
      <path
        d="M17 41 L27.5 18 L33.5 30.5 L37.5 22.5 L47 41"
        fill="none"
        stroke="url(#ab-logo-g)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M32 45 L32 55 M32 55 L26 49 M32 55 L38 49"
        fill="none"
        stroke="#22D3EE"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight">
          AB{" "}
          <span className="text-gradient">Download</span>
        </span>
      )}
    </span>
  );
}
