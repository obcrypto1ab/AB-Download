"use client";

import { useState } from "react";

import { ChevronDownIcon } from "./Icons";

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: "Why may a source not permit downloads?",
    answer:
      "Media platforms decide what access to grant. Downloading a video file is only possible when the rights holder or the platform explicitly provides the file — for example a direct MP4 link or an official download button. AB Download checks each source's actual capabilities and never bypasses access controls, DRM or authentication."
  },
  {
    question: "Why do some videos support preview only?",
    answer:
      "For platforms like YouTube, the official way to watch inside another app is the embedded player — which streams protected content, not a downloadable file. No third-party tool can offer an official direct-file download of those videos. AB Download shows the official preview plus real metadata, and says clearly that no file download is available."
  },
  {
    question: "Why is a quality option unavailable?",
    answer:
      "A quality option only exists when the source actually provides that file. The options shown in AB Download are verified against the source's real response headers — so a 158 MB MP4 shows one 'Original' option, not an invented menu of 360p through 8K. If a source offered several verified variants, each would be listed with its true size and format."
  },
  {
    question: "How do I use authorized media URLs?",
    answer:
      "Paste any direct media file URL — for example a link to your own hosted MP4, a CDN link you control, or a download link the creator explicitly shared. The analyzer verifies the host's response headers, then offers a streamed download with progress and cancellation."
  },
  {
    question: "How are privacy and security handled?",
    answer:
      "No accounts, no tracking, no stored history. Analyzed URLs are processed to fetch metadata and are not persisted. Server-side fetching is hardened: private/internal network addresses are blocked, every redirect is re-validated, protocols and ports are restricted, and downloads pass strict content-type and size gates. See the Privacy page for details."
  },
  {
    question: "What about very large files?",
    answer:
      "In Chrome or Edge, downloads stream straight to disk with no memory limit beyond the server's 2 GiB cap. In other browsers, in-memory downloads are honestly capped at 256 MiB — larger files get a clear message with alternatives instead of a frozen tab. Serverless hosting also imposes function time limits, documented in the deployment guide."
  }
];

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="container-x py-24 sm:py-28">
      <div className="mx-auto max-w-3xl">
        <p className="section-kicker text-center">FAQ</p>
        <h2 className="section-title text-center">
          Straight answers, <span className="text-gradient">no fine print</span>
        </h2>

        <div className="mt-12 space-y-3">
          {FAQ_ITEMS.map((item, index) => {
            const open = openIndex === index;
            return (
              <div key={item.question} className="glass overflow-hidden rounded-2xl">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                  aria-expanded={open}
                  onClick={() => setOpenIndex(open ? null : index)}
                >
                  <span className="font-semibold text-ink">{item.question}</span>
                  <ChevronDownIcon
                    className={`h-4 w-4 shrink-0 text-accent transition-transform duration-300 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <div className={`faq-panel ${open ? "open" : ""}`}>
                  <div>
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{item.answer}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
