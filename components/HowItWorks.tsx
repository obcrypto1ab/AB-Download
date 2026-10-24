import { ArrowRightIcon, DownloadIcon, GaugeIcon, LinkIcon } from "./Icons";

const STEPS = [
  {
    icon: LinkIcon,
    title: "Paste the URL",
    body: "Drop in any direct media file URL or a supported provider link — YouTube, Vimeo or a public video file."
  },
  {
    icon: GaugeIcon,
    title: "Analyze the media",
    body: "AB Download validates the URL, identifies the source and fetches only officially available metadata."
  },
  {
    icon: ArrowRightIcon,
    title: "Choose a verified format",
    body: "Pick from the quality options the source actually provides — each one verified against real response headers."
  },
  {
    icon: DownloadIcon,
    title: "Download the authorized file",
    body: "Stream the file with live progress, cancel anytime, and get honest errors if something changes mid-transfer."
  }
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative container-x py-24 sm:py-28">
      <div className="max-w-3xl">
        <p className="section-kicker">
          <GaugeIcon className="h-4 w-4" />
          How It Works
        </p>
        <h2 className="section-title">
          Four steps. <span className="text-gradient">Zero guesswork.</span>
        </h2>
      </div>

      <ol className="relative mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {/* connecting line (desktop) */}
        <div
          className="pointer-none divider-gradient absolute left-[6%] right-[6%] top-6 hidden lg:block deco"
          aria-hidden="true"
        />
        {STEPS.map((step, index) => (
          <li key={step.title} className="relative">
            <div className="flex items-center gap-4 lg:flex-col lg:items-start">
              <span className="glass relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-accent">
                <step.icon className="h-5 w-5" />
              </span>
              <span className="font-display text-sm font-bold text-muted/60 lg:hidden">
                Step {index + 1}
              </span>
            </div>
            <h3 className="mt-5 font-display text-base font-bold">
              <span className="mr-2 text-gradient-gold">{String(index + 1).padStart(2, "0")}</span>
              {step.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
