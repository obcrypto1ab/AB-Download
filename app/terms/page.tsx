import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Terms — AB Download",
  description: "Terms of use for AB Download."
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: "Lawful use only",
    body: [
      "AB Download is a media preview and authorized-download utility. You may use it only to analyze and download media that you own or that you are otherwise legally authorized to download.",
      "You must not use AB Download to circumvent access controls, DRM, authentication, or technical protection measures of any platform — and the application contains no capability to do so."
  ]
  },
  {
    heading: "Your responsibility",
    body: [
      "You are responsible for ensuring you have the right to download and use any file you retrieve. A URL being publicly reachable does not by itself authorize downloading or redistributing its contents. Respect copyright, license terms and platform terms of service."
    ]
  },
  {
    heading: "What the service does and does not do",
    body: [
      "AB Download fetches only officially provided metadata and verifies sources via standard HTTP headers. It never extracts protected streams, never fabricates quality options, and never fakes a completed download.",
      "For sources without authorized downloads (such as standard YouTube links), the service shows an honest explanation and official preview instead."
    ]
  },
  {
    heading: "Availability",
    body: [
      "The service is provided \"as is\" without warranties of any kind. Media hosts may change their behavior at any time; downloads may fail for reasons outside AB Download's control, and the app will report those failures honestly."
    ]
  },
  {
    heading: "Acceptable use of the service",
    body: [
      "Do not attempt to overload, abuse or reverse the service, including using it as a general-purpose proxy. Automated abuse is rate-limited and blocked."
    ]
  }
];

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="container-x max-w-3xl pb-24 pt-36">
        <p className="section-kicker">Legal</p>
        <h1 className="section-title">Terms of Use</h1>
        <p className="section-sub">Last updated: October 2026</p>

        <div className="mt-12 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="font-display text-xl font-bold">{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index} className="mt-3 leading-relaxed text-muted">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-white/10 pt-6 text-sm text-muted">
          See also the{" "}
          <Link href="/privacy" className="text-accent hover:underline">
            Privacy policy
          </Link>
          .
        </div>
      </main>
      <Footer />
    </>
  );
}
