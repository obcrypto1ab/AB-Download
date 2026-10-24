import { PROVIDER_INFO } from "@/lib/source-registry";
import { CheckIcon, EyeIcon, XIcon, DownloadIcon, ExternalIcon } from "./Icons";

function Capability({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        ok ? "text-accent" : "text-muted/60"
      }`}
    >
      {ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XIcon className="h-3.5 w-3.5" />}
      {label}
    </span>
  );
}

function DownloadCapability({ level }: { level: "full" | "authorized-only" | "none" }) {
  if (level === "full") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent">
        <DownloadIcon className="h-3.5 w-3.5" />
        Full download support
      </span>
    );
  }
  if (level === "authorized-only") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold">
        <DownloadIcon className="h-3.5 w-3.5" />
        With an authorized file URL
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted/60">
      <XIcon className="h-3.5 w-3.5" />
      No file download
    </span>
  );
}

/** Rendered from the same registry the analyzer uses — the UI can never
 *  claim an integration that does not exist. */
export function SupportedSources() {
  return (
    <section id="sources" className="container-x py-24 sm:py-28">
      <div className="max-w-3xl">
        <p className="section-kicker">
          <EyeIcon className="h-4 w-4" />
          Supported Sources
        </p>
        <h2 className="section-title">
          Honest about what works — <span className="text-gradient">and what doesn&apos;t</span>
        </h2>
        <p className="section-sub">
          This list is generated from AB Download&apos;s internal capability
          registry, the same code the analyzer runs. If a capability is not
          listed here, it is not implemented — and the app will tell you so.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-2">
        {PROVIDER_INFO.map((provider) => (
          <article key={provider.id} className="feature-card">
            <div className="relative">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-lg font-bold">{provider.name}</h3>
                <DownloadCapability level={provider.capabilities.download} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{provider.summary}</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4">
                <Capability ok={provider.capabilities.metadata} label="Metadata" />
                <Capability ok={provider.capabilities.preview} label="Preview" />
              </div>
              <p className="mt-3 truncate text-xs text-muted/70">
                <span className="font-semibold text-muted">Example:</span>{" "}
                <code className="rounded bg-white/5 px-1.5 py-0.5">{provider.example}</code>
              </p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-8 flex items-start gap-2 text-sm leading-relaxed text-muted">
        <ExternalIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        For sources without download permission, AB Download explains why and
        offers to open the original website — it never fakes a successful
        download or invents quality options.
      </p>
    </section>
  );
}
