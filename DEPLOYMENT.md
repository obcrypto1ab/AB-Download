# AB Download — Vercel Deployment Guide

AB Download targets Vercel with the standard Next.js App Router architecture.
It deploys as-is with **no environment variables required**.

---

## 1. Deploy steps

### Option A — Vercel Dashboard (recommended)

1. Push this project to a Git repository (GitHub / GitLab / Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Framework preset: **Next.js** (auto-detected). Leave build settings at
   their defaults (`npm run build`, output handled by Next).
4. Environment variables: optionally add `YOUTUBE_API_KEY`
   (see §3). Nothing else is needed.
5. Click **Deploy**. First build typically takes 1–2 minutes.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

### Local build verification before deploying

```bash
npm run lint
npm run typecheck
npm run test
npm run build   # must complete without errors
```

---

## 2. What works on Vercel serverless (and what doesn't)

| Capability | On Vercel | Notes |
| --- | --- | --- |
| All UI pages | ✅ | Static prerender + edge CDN |
| `POST /api/analyze` | ✅ | Header probes are small and fast (≤ 30 s `maxDuration`) |
| Streaming downloads of small/medium files | ✅ with limits | Streams are piped, never buffered — but the **function time limit** applies (see below) |
| Multi-GB downloads through the proxy | ⚠️ not reliably | Serverless functions have hard wall-clock limits; a 2 GiB transfer at modest speed can exceed them. The app still *tries* (streams, doesn't buffer), and reports failure honestly if cut off |
| YouTube metadata + official preview | ✅ | oEmbed is key-free; Data API needs the key below |
| FFmpeg transcoding / A-V merging | ❌ not implemented | Requires a dedicated media backend (see §4) |

### Function limits to know

| Plan | Max function duration (default) |
| --- | --- |
| Hobby | 60 s per invocation |
| Pro | 300 s (`maxDuration` is declared as 300 for `/api/download`) |
| Enterprise | configurable |

`/api/analyze` declares `maxDuration = 30`.

**Honest deployment claim:** Vercel serverless functions are suitable for
metadata analysis and for streaming files that finish within the plan's
function time limit. They are **not** guaranteed to complete every large
video download. The in-browser paths (direct link / File System Access API)
are unaffected by server limits because they don't run on the server.

---

## 3. Environment variables

Set in **Project → Settings → Environment Variables** (or via `vercel env add`):

| Variable | Required | Value |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | No | Official YouTube Data API v3 key from [Google Cloud Console](https://console.cloud.google.com/apis/library/youtube.googleapis.com). Restrict it to the Data API; quota usage: 1 unit per video lookup. |

Without it: YouTube links show oEmbed metadata + official embed, with a clear
notice that extended stats need a key. The app never fakes API responses.

Never commit real keys; `.env*` files are git-ignored.

---

## 4. Features that require a separate backend

The following are **intentionally not implemented** in this codebase and need
dedicated infrastructure if you want them:

1. **Quality conversion / transcoding** (e.g. "convert to 720p") and
   **audio/video merging** — requires a long-running media worker with FFmpeg
   (license obligations apply), object storage (S3/R2) and a job queue.
   Serverless functions are unsuitable: file sizes, CPU time and
   cold-start binary size all exceed practical limits. The UI therefore never
   shows conversion controls — per the product principle: show it as
   unavailable rather than fake it.
2. **Very large file relay (> a few hundred MB / long transfers)** — a small
   always-on streaming service (Node + undici, or Cloudflare Workers with
   byte-range support) in front of object storage.
3. **Persistent download history / accounts** — would additionally require a
   database. AB Download currently stores nothing about your usage.
4. **Durable rate limiting across instances** — swap `lib/rate-limit.ts`
   for Upstash Redis / Vercel KV if per-instance limits are insufficient.

The integration points are clean: `lib/metadata-service.ts` (analysis) and
`app/api/download/route.ts` (transfer) are the only server touchpoints.

---

## 5. Post-deploy checklist

- [ ] Open the deployed URL — hero + analyzer render (dark theme).
- [ ] Analyze `https://www.w3schools.com/html/mov_bbb.mp4` → **Ready to download** with a verified size.
- [ ] Download it → progress reaches 100 %, file plays.
- [ ] Analyze a YouTube link → **Preview only**, official embed plays, honest notice shown.
- [ ] Analyze `https://example.com` → **Web page — not media** verdict.
- [ ] `/privacy` and `/terms` render.
