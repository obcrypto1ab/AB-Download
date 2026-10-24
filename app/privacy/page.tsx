import type { Metadata } from "next";
import Link from "next/link";

import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Privacy — AB Download",
  description: "How AB Download handles data, URLs and security."
};

const SECTIONS: Array<{ heading: string; body: string[] }> = [
  {
    heading: "No accounts, no tracking",
    body: [
      "AB Download does not require an account, does not set advertising or analytics cookies, and does not build profiles. There is no sign-in, no history and no stored library of your activity."
    ]
  },
  {
    heading: "URLs you analyze",
    body: [
      "When you analyze a URL, it is sent to the AB Download server to fetch officially available metadata (such as response headers or public oEmbed data) and to verify what the source provides.",
      "URLs are processed for the duration of your request and are not persisted to a database. Server logs, if any are produced by the hosting platform, are governed by that platform's retention policy."
    ]
  },
  {
    heading: "Downloads",
    body: [
      "Downloaded files stream through AB Download's validated proxy to your browser and are not stored on the server. In Chrome or Edge, files can be saved directly to disk via the browser's File System Access API, in which case the file never passes through browser memory.",
      "Downloaded files are never modified, inspected beyond content-type verification, or shared."
    ]
  },
  {
    heading: "API keys",
    body: [
      "If the operator configures a YouTube Data API key, it is stored server-side as an environment variable. It is never sent to the browser and never appears in client-side code."
    ]
  },
  {
    heading: "Security measures",
    body: [
      "Server-side fetching is restricted to public http/https addresses on standard ports. Private, loopback, link-local and cloud-metadata addresses are blocked — including on every redirect hop. Downloads are content-type gated and size-capped, and responses are streamed rather than buffered where possible."
    ]
  },
  {
    heading: "Third-party content",
    body: [
      "Embedded players (YouTube, Vimeo) are official embeds governed by the respective platform's own terms and privacy policies, which apply when you interact with them."
    ]
  }
];

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="container-x max-w-3xl pb-24 pt-36">
        <p className="section-kicker">Legal</p>
        <h1 className="section-title">Privacy</h1>
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
          Questions about this policy? See the{" "}
          <Link href="/#faq" className="text-accent hover:underline">
            FAQ
          </Link>{" "}
          or the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            Terms
          </Link>
          .
        </div>
      </main>
      <Footer />
    </>
  );
}
