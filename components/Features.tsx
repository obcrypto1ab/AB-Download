import { BoltIcon, DownloadIcon, EyeIcon, GaugeIcon, ShieldIcon, SparkleIcon } from "./Icons";

const FEATURES = [
  {
    icon: BoltIcon,
    title: "Fast media analysis",
    body: "Paste any link and get verified metadata in seconds — title, source, duration where available, file type and size, all from official or header-level data.",
    accent: "from-brand/30 to-electric/20"
  },
  {
    icon: GaugeIcon,
    title: "Verified quality selection",
    body: "Only formats the source actually provides appear as options — labeled “Verified”. No invented 8K buttons, no fake menus.",
    accent: "from-accent/30 to-brand/20"
  },
  {
    icon: DownloadIcon,
    title: "Authorized file downloads",
    body: "Direct media files stream through a validated, size-capped proxy with honest error handling for expired links and CORS limits.",
    accent: "from-magenta/30 to-brand/20"
  },
  {
    icon: SparkleIcon,
    title: "Live progress & cancel",
    body: "Real byte-accurate progress with transfer speed. Cancel anytime — the upstream request is aborted, not left running.",
    accent: "from-gold/30 to-magenta/20"
  },
  {
    icon: ShieldIcon,
    title: "Secure URL handling",
    body: "Protocol checks, private-network blocking, per-redirect revalidation and strict content-type gates protect both you and the service.",
    accent: "from-electric/30 to-accent/20"
  },
  {
    icon: EyeIcon,
    title: "Honest by design",
    body: "When a source supports only preview — like standard YouTube links — AB Download says exactly that instead of pretending to download.",
    accent: "from-brand/30 to-magenta/20"
  }
];

export function Features() {
  return (
    <section id="features" className="container-x py-24 sm:py-28">
      <div className="max-w-3xl">
        <p className="section-kicker">
          <SparkleIcon className="h-4 w-4" />
          Features
        </p>
        <h2 className="section-title">
          A premium utility, <span className="text-gradient">built on honesty</span>
        </h2>
        <p className="section-sub">
          Every control you see does real work. Every number you see comes from
          a verified source. That is the whole product philosophy.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="feature-card">
            <div className="relative">
              <span
                className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${feature.accent} text-ink ring-1 ring-white/10`}
              >
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-bold">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
