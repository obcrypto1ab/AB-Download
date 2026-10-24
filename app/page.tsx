import { Navbar } from "@/components/Navbar";
import { ExploreFeaturesCta, HeroCopy, HeroVisual } from "@/components/Hero";
import { UrlAnalyzer } from "@/components/UrlAnalyzer";
import { Features } from "@/components/Features";
import { HowItWorks } from "@/components/HowItWorks";
import { SupportedSources } from "@/components/SupportedSources";
import { FAQ } from "@/components/FAQ";
import { Footer } from "@/components/Footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <main>
        {/* ── Hero + analyzer ── */}
        <section id="home" className="relative overflow-hidden pt-36 pb-20 sm:pt-40">
          {/* decorative layers */}
          <div className="pointer-none absolute inset-0 deco" aria-hidden="true">
            <div className="aurora left-[-10%] top-[-10%] h-96 w-96 bg-brand/30" />
            <div className="aurora right-[-12%] top-[30%] h-80 w-80 bg-electric/25" style={{ animationDelay: "-8s" }} />
            <div
              className="absolute inset-0 opacity-[0.35]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
                backgroundSize: "56px 56px",
                maskImage: "radial-gradient(60rem 40rem at 50% 0%, black 30%, transparent 75%)",
                WebkitMaskImage: "radial-gradient(60rem 40rem at 50% 0%, black 30%, transparent 75%)"
              }}
            />
          </div>

          <div className="container-x relative">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div>
                <HeroCopy />

                <div className="mt-9">
                  <UrlAnalyzer />
                </div>

                <div className="fade-up d4 mt-6">
                  <ExploreFeaturesCta />
                </div>
              </div>

              <HeroVisual />
            </div>
          </div>
        </section>

        <Features />
        <HowItWorks />
        <SupportedSources />
        <FAQ />
      </main>
      <Footer />
    </>
  );
}
