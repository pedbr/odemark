# Ödemark — Website Motion Charter v1.0

**Status:** draft for founder sign-off and branding-agency review (brief §9).
**Scope:** the marketing website only. The app remains governed by Brand Guidelines p.09.

## Principle

Motion on the website behaves like dusk, as in the app: things appear by getting
lighter, leave by getting darker. The web surface is allowed *longer* durations
than the app — never *bigger* movement. Nothing bounces, scales, rotates, or
parallaxes. The site never scrolls for you.

## Spec

| Property | App (p.09) | Website extension |
|---|---|---|
| Durations | 200–400 ms | 200–400 ms for UI; up to **1600 ms** for whole-surface crossfades (the register shift, hero arrival) |
| Easing | cubic-bezier(0.2, 0, 0, 1) | unchanged |
| Movement | opacity + ≤ 4 px drift | unchanged — 4 px is still the ceiling |
| Scale, rotation, parallax | never | never for interface content. **One exception, founder-approved (Aug 2026):** the hero's background media layer drifts scale 1.02→1.16 over 32 s (ease-in-out, alternate) as a footage surrogate — a drone-shot feel. Text, symbols and UI above the scrim never scale. Removed entirely under prefers-reduced-motion. |
| Scroll behaviour | — | native scroll only; no hijacking, no snap between sections |
| Ring draw-in | 400 ms, cold start only | 400 ms, once per page load, hero only |
| Zones (demo map) | fade in once, together | unchanged — a survey result, not a reveal |
| Stagger | — | reveals may stagger ≤ 80 ms per element, max 5 elements |
| The register shift | — | background/typography crossfade, 1600 ms, driven by scroll position crossing the library threshold; runs at most once per direction per visit |
| prefers-reduced-motion | everything instant | **absolute** — every transition and the ring draw-in become instant; the site must be complete without motion |

## What the extension buys

Two things only: the hero's slow arrival, and the register shift being felt
rather than seen. Everything else stays inside the app numbers.
