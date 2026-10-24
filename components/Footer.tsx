import { Logo } from "./Logo";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/5">
      <div className="container-x flex flex-col items-center justify-between gap-6 py-10 sm:flex-row">
        <div className="flex flex-col items-center gap-2 sm:items-start">
          <Logo />
          <p className="text-xs text-muted">Your Media. Your Quality. Your Control.</p>
        </div>

        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted" aria-label="Legal">
          <a href="/privacy" className="transition-colors hover:text-ink">
            Privacy
          </a>
          <a href="/terms" className="transition-colors hover:text-ink">
            Terms
          </a>
          <a href="#sources" className="transition-colors hover:text-ink">
            Supported Sources
          </a>
        </nav>

        <p className="text-xs text-muted/70">© {year} AB Download. All rights reserved.</p>
      </div>
    </footer>
  );
}
