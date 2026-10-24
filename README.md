# AB Download

**Your Media. Your Quality. Your Control.**

AB Download is a premium, cinematic web application for previewing media links,
inspecting verified metadata, and downloading **authorized** media files
reliably. It is honest by design: it shows exactly what each source permits —
and says so clearly when a source supports only preview.

- **Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS**
- Tested with **Vitest** (111 tests) · Lint-clean · Type-clean · Production build verified

---

## What it does (really)

| Source | Metadata | Preview | Download |
| --- | --- | --- | --- |
| Direct media files (MP4, WebM, MOV, MKV, MP3, M4A, OGG, FLAC, …) | ✅ verified from HTTP response headers | ✅ in-page playback when the host allows | ✅ **full** streamed download with progress + cancel |
| YouTube (watch / youtu.be / shorts / embed / live) | ✅ official oEmbed; +Data API stats if a key is configured | ✅ official embedded player | ⚠️ only if the creator supplies an authorized direct file URL (paste that URL) |
| Vimeo (public videos) | ✅ official oEmbed | ✅ official player | ❌ none |
| Any other web page | ❌ | ❌ | ❌ honestly reported as "a web page, not a media file" |

This table is generated from the same capability registry the analyzer runs
(`lib/source-registry.ts`) — the UI cannot claim an integration that does not
exist.

### Honest-handling guarantees

- No quality option is ever shown unless the source actually provides it.
  A direct MP4 shows one **"Original · MP4"** option, verified against the
  host's response headers — never a fake 360p→8K menu.
- YouTube links are **never** presented as downloadable. The app shows the
  official preview and explains the lawful options instead.
- Nothing is ever marked "complete" before the last byte arrives.
- Failed/canceled downloads are reported truthfully with retry support.

---

## Quick start

Requirements: **Node.js ≥ 18.17** (Node 20+ recommended), npm.

```bash
npm install
npm run dev          # http://localhost:3000
```

Other commands:

```bash
npm run test         # vitest run (111 tests)
npm run test:watch
npm run lint         # next lint (ESLint)
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm start            # serve the production build
```

### Environment variables

Copy `.env.example` to `.env.local`. All variables are optional — the app
starts and fully works for direct media files without any keys.

| Variable | Required | Purpose |
| --- | --- | --- |
| `YOUTUBE_API_KEY` | No | Official YouTube Data API v3 key. Enables duration, channel name, view counts and higher-res thumbnails for YouTube links. Without it, YouTube links still show oEmbed metadata + official preview with a clear notice. |

The key is **server-only** (never prefixed with `NEXT_PUBLIC_`) and is never
exposed to the browser. Missing keys never produce fake API responses — only a
clear configuration notice.

---

## Architecture

```
app/
  page.tsx                 Home (hero + analyzer + sections)
  layout.tsx               Fonts, theme bootstrap, metadata
  globals.css              Design system (tokens, glass, aurora, animations)
  privacy/page.tsx         Privacy policy
  terms/page.tsx           Terms of use
  api/analyze/route.ts     POST — URL analysis pipeline
  api/download/route.ts    GET  — validated streaming download proxy
components/
  Navbar / Hero / UrlAnalyzer / MediaResultCard / QualitySelector /
  DownloadProgress / Features / HowItWorks / SupportedSources / FAQ /
  Footer / Logo / Icons / ThemeToggle
lib/
  url-validation.ts        Shared URL parsing (protocol/credential/port rules)
  source-registry.ts       Provider capability registry + YouTube/Vimeo detection
  file-validation.ts       Content-type allowlist, filename sanitization, size caps
  ssrf.ts                  SERVER-ONLY: DNS/private-IP checks, safeFetch with
                           per-redirect revalidation
  metadata-service.ts      YouTube (oEmbed + optional Data API), Vimeo oEmbed,
                           direct-media header probing, orchestrator
  download-client.ts       Client download engine (reducer + streaming)
  rate-limit.ts            Best-effort fixed-window limiter
  format.ts / errors.ts / types.ts
tests/                     Vitest unit + component tests
```

### Data flow

1. **Analyze** — `POST /api/analyze` validates the URL (shared parser), then:
   - YouTube → official oEmbed (+ optional Data API), status `preview-only`.
   - Vimeo → official oEmbed, status `preview-only`.
   - Direct media candidate / unknown → server-side header probe
     (HEAD, with a ranged-GET fallback). Media content types become
     `downloadable` with one verified quality; HTML responses become an
     honest `web-page` verdict.
2. **Download** — the browser streams from `GET /api/download?u=…`, which
   re-validates the target, revalidates every redirect, gates the
   content type, enforces the size cap, and pipes the upstream body straight
   to the client (no server-side buffering).
3. **Client engine** — chunks are written to disk via the File System Access
   API (Chrome/Edge) or accumulated to a Blob within the 256 MiB in-browser
   cap; progress is byte-accurate; cancellation aborts the upstream request.

### Download modes & limits

| Mode | Where | Limit |
| --- | --- | --- |
| Stream to disk (File System Access API) | Chrome/Edge desktop | Up to the server cap: **2 GiB** |
| In-memory Blob | Firefox/Safari | **256 MiB** — larger files get an honest message with alternatives |
| Direct link | All browsers | Depends on the media host's own headers |

---

## Security model

Every server-side fetch of a user-supplied URL is hardened (`lib/ssrf.ts`):

- **Protocols/ports**: http/https only, standard ports only. `javascript:`,
  `data:`, `file:` etc. are rejected at parse time.
- **Credentials**: URLs with embedded `user:pass@` are rejected.
- **Private-network blocking**: loopback, RFC1918, CGNAT, link-local
  (incl. cloud metadata `169.254.169.254`), unique-local and link-local IPv6,
  IPv4-mapped IPv6 — checked on literal IPs **and on every DNS result**.
- **Redirect safety**: redirects are followed manually; **every hop** is
  re-validated (protocol + DNS + private ranges). A redirect to a private
  address or non-HTTP protocol is blocked before being requested.
- **Content-type gate**: the download proxy serves only verified media types;
  HTML/JSON targets get `415`. HLS/DASH manifests are refused with an
  explanation.
- **Size caps**: 2 GiB server cap enforced on both `Content-Length` and the
  actual streamed byte count.
- **Timeouts / aborts**: overall deadlines per request; client disconnects
  abort the upstream transfer.
- **Rate limiting**: best-effort per-client fixed-window limits on both
  routes (per-instance on serverless).
- **No open proxy**: only URLs that pass the media verification are proxied.
- **No secrets in the client**: `YOUTUBE_API_KEY` stays server-side.
- **Response hygiene**: upstream headers are not forwarded except a small
  allowlist; strict `Content-Disposition` with sanitized filenames
  (Unicode-safe, Windows-reserved names neutralized, traversal-proof).
- **Security headers**: `nosniff`, `Referrer-Policy`, `X-Frame-Options`,
  `Permissions-Policy` via `next.config.mjs`.

Known residual risks (documented honestly):
- **DNS rebinding TOCTOU**: DNS is validated before the fetch, but a host
  could theoretically re-resolve between check and connect. Mitigating fully
  requires IP-pinned connections (custom undici agent) — a documented
  follow-up hardening step.
- The in-memory rate limiter is per-instance on serverless platforms.

There is no DRM circumvention, no protected-stream extraction and no
undocumented scraping anywhere in this codebase.

---

## Testing

`npm run test` runs 111 tests across 7 files, covering: URL parsing, YouTube
format recognition (watch/share/shorts/embed/live + invalid ids), invalid and
dangerous URL rejection, unsupported providers, metadata API failures, missing
API keys, direct-file verification (HEAD + ranged GET fallback), HTTP error
mapping, redirect validation (including blocked private redirects), filename
sanitization (Unicode, traversal, Windows reserved names), size limits,
download progress state machine, cancellation, duplicate-request prevention,
and UI loading/error states.

Mock external services are used in unit tests only — production code paths
contain no mock responses. See `TEST-REPORT.md` for the full matrix.

---

## Deployment

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for Vercel deployment steps, function
limits, and the documented list of features that need a dedicated backend
(very large files / transcoding / FFmpeg workflows).

## Legal

Use AB Download only with media you own or are authorized to download.
See `/privacy` and `/terms`.
