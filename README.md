# Ödemark — odemark.se

Static site. No framework, no build step, no third-party requests of any kind.
This repository *is* the site: `index.html` sits at the root and every asset
path is absolute from it.

```bash
python3 -m http.server 8811
```

## Structure

| Path | What |
|---|---|
| `index.html` | Swedish homepage (primary market) |
| `en/index.html` | English homepage |
| `allemansratten.html` · `en/allemansratten.html` | Plain-language explainer, main organic-search asset |
| `integritet.html` · `en/privacy.html` | Privacy policy |
| `press.html` | Press kit |
| `404.html` | Not-found page (wired via `not_found_handling`) |
| `css/main.css` | Full design system — palette, type scale, register shift, motion |
| `css/fonts.css` + `fonts/` | Self-hosted Schibsted Grotesk, Newsreader Italic, IBM Plex Mono (latin + latin-ext subsets, ~744 K total) |
| `js/terrain.js` | The map demo (see below) |
| `js/main.js` | Reveals, register shift, note demo, video facades, region form |
| `docs/motion-charter.md` | Website motion charter — deliverable 1, needs founder + branding-agency sign-off |

## Deployment

Cloudflare Workers static assets.

| File | Role |
|---|---|
| `wrangler.jsonc` | `assets.directory` is `"."` — the repo root. Change only if the site ever moves into a subfolder. |
| `.assetsignore` | Keeps repo-only files (this README, `docs/`, `wrangler.jsonc`) out of the deployed bundle. Add anything else that must not be public. |
| `_headers` | Cache lifetimes and security headers, applied at the edge. |

Dashboard settings: build command empty, deploy command `npx wrangler deploy`.

Two headers are load-bearing and easy to break:

- `Permissions-Policy` keeps `geolocation=(self)`. Remove it and the demo map's
  "Min position" button silently stops working.
- The `Content-Security-Policy` allows `'unsafe-inline'` for scripts and styles,
  required by the inline i18n block and the `--stagger` style attributes, and
  allows `frame-src https://www.youtube-nocookie.com` for the episode facades.
  Nothing else is permitted — that restriction is the privacy promise in
  enforceable form, so tighten it rather than loosen it.

Custom domains: `odemark.se` canonical, `ödemark.se` (`xn--demark-hva.se`)
301 to it. All `<link rel="canonical">` tags already point at the ASCII host.

## The map demo

`js/terrain.js` renders a deterministic synthetic terrain (seeded value-noise,
hillshade, contours, water) and runs the real pipeline shape: suitability
field from slope / wetness / water distance / edge margins → smoothing →
percentile threshold → boundary tracing → dashed zone outlines. Same town,
same zones, every time — determinism is the brand claim, so the demo honours it.

**Swapping in real data:** replace `buildFields()` with a fetch of
pre-computed elevation/suitability tiles for Stockholms län (the app's own
zone exports work). Keep everything from `computeZones()` down. When real
Lantmäteriet data ships, change the attribution string in both homepages from
"förenklad demoterräng …" to the licence line Lantmäteriet specifies
(*© Lantmäteriet* at minimum — confirm exact text with them).

## Deliberate decisions

- **Zero third-party requests.** Fonts self-hosted, no CDN, no analytics
  included. To add analytics use self-hosted Plausible only: one `<script>`
  per page, a `connect-src` entry in the CSP, and an update to the privacy
  pages, which currently say "if enabled".
- **No cookies → no banner.** The privacy section says so; keep it true.
- **Register shift.** `html.register-library` class (set by IntersectionObserver
  at `#library`) re-themes CSS custom properties over 1600 ms. Cool instrument
  → warm notebook. Per the motion charter, movement never exceeds 4 px anywhere.
- **`prefers-reduced-motion`** collapses every transition/animation to instant
  (end of `main.css`).
- **Dark is primary**, light mode responds to `prefers-color-scheme`.
- **The field-note demo** persists to `localStorage` only — that is the point;
  do not wire it to anything.

## To fill in before launch

- App Store / Google Play URLs (`#hamta` / `#get` sections) + smart-banner
  `apple-itunes-app` meta (commented in both heads).
- YouTube episode IDs: `data-yt` attributes on the `.thumb` buttons; remove
  `disabled` when set. Facade loads `youtube-nocookie.com` only on click.
- Region-list endpoint: `data-endpoint` on `#region-form` (expects a JSON
  POST `{email, lang}`). Buttondown, a worker, or the app backend.
- Org number in `integritet.html` / `en/privacy.html`.
- `press@odemark.se`, `hej@odemark.se` mailboxes.

## CMS note

The site is intentionally flat files — founder is an engineer; git is the CMS.
If a headless CMS is wanted later, the copy blocks are the only editable
surface; everything else is design system.
