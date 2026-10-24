# AB Download — Test Report

Date: 2026-10-24 · Node v25.9.0 · Windows (win32) · npm 11.12.1

---

## 1. Automated checks

| Check | Command | Result |
| --- | --- | --- |
| Unit + component tests | `npm run test` (vitest) | ✅ **111 / 111 passed** (7 files) |
| Linting | `npm run lint` | ✅ No ESLint warnings or errors |
| Type checking | `npm run typecheck` | ✅ Clean |
| Production build | `npm run build` | ✅ Compiled, 7 routes generated |

Build output:

```
Route (app)                    Size     First Load JS
○ /                            10.7 kB    97.9 kB
○ /_not-found                  873 B      88.1 kB
ƒ /api/analyze                 0 B
ƒ /api/download                0 B
○ /icon.svg
○ /privacy                     2.39 kB    98.3 kB
○ /terms                       2.39 kB    98.3 kB
```

---

## 2. Coverage by required scenario

### URL handling
| Scenario | Tests |
| --- | --- |
| URL parsing & normalization (whitespace, trailing junk, length, ports, credentials) | `tests/url-validation.test.ts` (13) |
| YouTube recognition: watch / youtu.be / shorts / embed / live / music hosts, extra params, playlist & channel rejection, malformed ids | `tests/source-registry.test.ts` (17) |
| Invalid URL rejection (client + server, incl. `javascript:` / `data:` / `file:` / `ftp:`) | url-validation + components tests |
| Dangerous protocol rejection | ✅ (parse-level, unit + UI preflight tests) |
| Unsupported provider handling (ordinary pages → honest `web-page` verdict; playlists; non-media types; HLS manifests) | metadata-service tests |
| Metadata API failures (oEmbed 404 → honest unavailable; Data API 403 → graceful degradation) | ✅ |
| Missing API keys (works key-free; notice shown; `hasApiKey:false`) | ✅ |

### Security
| Scenario | Tests |
| --- | --- |
| Private/loopback/link-local/CGNAT/multicast IPv4 + IPv6 + mapped-v4 blocking | `tests/ssrf.test.ts` |
| DNS resolution checks (private A-record blocked, public allowed, NXDOMAIN handled) | ✅ (mocked DNS) |
| Redirect validation: public redirect followed; **redirect to 127.0.0.1 blocked before request**; non-HTTP redirect blocked; redirect loops; redirect without location | ✅ |
| Timeouts and connection errors mapped to retryable errors | ✅ |
| Downloadable-file validation (content-type allowlist; HTML refused; `application/octet-stream` accepted; HLS/DASH refused) | ✅ |
| HTTP errors (404/403/5xx) mapped to honest, retryable-where-appropriate errors | ✅ |

### Download engine
| Scenario | Tests |
| --- | --- |
| Filename sanitization (traversal, Unicode NFC, Windows reserved names, control chars, 180-char cap, Content-Disposition RFC 5987) | `tests/file-validation.test.ts` (20) |
| Size limits (2 GiB server cap; 256 MiB blob cap; early rejection before fetch; mid-stream over-limit abort) | ✅ |
| Download progress state (byte-accurate, reducer transitions, total-less indeterminate) | ✅ |
| Cancellation (abort propagates through the stream; state → canceled; UI cancel button) | ✅ |
| Duplicate-request prevention (reducer ignores `start` while active; analyzer aborts superseded requests) | ✅ |
| Proxy HTTP errors surfaced with actionable messages | ✅ |

### UI
| Scenario | Tests |
| --- | --- |
| Loading state (Analyzing…, disabled button) | `tests/components/components.test.tsx` |
| Error messages + retry affordance | ✅ |
| Result card (verified quality options, download button) | ✅ |
| QualitySelector (verified-only options, selection, disabled state, empty → null) | ✅ |
| DownloadProgress (percent, bytes, speed, indeterminate, cancel) | ✅ |

### Responsive layout & browser-only behaviors
Not unit-testable in jsdom; see §3.

---

## 3. Live end-to-end smoke test (production build, real network)

`next start` on localhost; real HTTP requests:

| Request | Result |
| --- | --- |
| `GET /`, `/privacy`, `/terms` | ✅ 200, hero & sections render |
| Analyze real direct MP4 (`w3schools.com/html/mov_bbb.mp4`) | ✅ `downloadable`, `video/mp4`, 788,493 B, filename extracted |
| Analyze YouTube (`youtu.be/aqz-KE-bpKQ`) | ✅ `preview-only`, real oEmbed title, official `youtube-nocookie` embed, honest notice, zero quality options |
| Analyze `javascript:alert(1)` | ✅ 400 `invalid-url` |
| Analyze `http://192.168.1.1/admin` | ✅ `blocked-url` (private network) |
| Analyze `https://example.com/` | ✅ honest `web-page` verdict |
| Analyze Vimeo video unavailable in this region | ✅ honest `upstream-error` — no fake data |
| **Real download via proxy** | ✅ 200, `content-disposition: attachment; filename*=UTF-8''mov_bbb.mp4`, 788,493 bytes received, verified as ISO Media MP4 by `file` |
| Range request `bytes=0-1023` | ✅ 206 with `content-range: bytes 0-1023/788493` |
| Proxy download of an HTML page | ✅ 415 `not-media` |
| Proxy download of loopback URL | ✅ blocked before any request |

---

## 4. Requires real-browser testing (cannot be automated here)

These were verified by code review and the jsdom component tests, but final
visual/interactive acceptance needs a human in a browser:

- Cinematic animations, glass visuals, light/dark theme toggle persistence, `prefers-reduced-motion` behavior.
- Mobile responsive layout (hamburger nav, grid collapse) at real device widths.
- `<video>` in-page playback preview + client-side duration/resolution probe on a real host.
- File System Access API save-to-disk flow (Chrome/Edge) and the Blob download flow in Firefox/Safari.
- YouTube/Vimeo embed interactions inside the result card.
- Keyboard navigation and screen-reader announcements on the live site.

## 5. Known limitations (by design, not bugs)

- Vimeo download: no authorized direct-file path exists for standard links — preview/metadata only.
- In-memory (Blob) downloads capped at 256 MiB in non-Chromium browsers — by explicit, surfaced limit.
- Serverless function time limits (60 s Hobby / 300 s Pro) bound how much can stream through `/api/download` per request; very large files need the documented dedicated-backend architecture.
- Rate limiting is per-instance on serverless (documented; swappable for Redis/KV).
