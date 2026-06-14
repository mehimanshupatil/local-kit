# Redesign visual identity as a dark-first developer tool

The default shadcn/ui + sky blue palette looks identical to dozens of generic SaaS tools. LocalKit processes files with WebAssembly — it is closer to a developer utility than a consumer web app. The visual design should signal that.

Decisions made:

- **Dark first** — dark background is the default on first visit. Users toggle to light if preferred. Dark backgrounds make processed output (PDFs, images) stand out more, and match developer tool expectations.
- **Emerald accent** (`#10b981` family) replaces sky blue. Green semantically reinforces the privacy-first message (safe, local, secure) and differentiates from the blue-heavy PDF-tools market.
- **Geist Sans + Geist Mono** replaces Inter + JetBrains Mono. Purpose-built for developer tool dark UIs; the Sans/Mono pairing is pre-tuned.
- **4px border radius** replaces 12px. Borders, no shadows. Cards defined by `1px` border on layered dark backgrounds. The shift from rounded to sharp is the single biggest visual signal separating "generic SaaS" from "serious tool."
- **Full app scope** — home page, category pages, tool pages, Header/Footer all updated. Changing only the shell while leaving tool interiors generic breaks the trust signal.

## Considered Options

- **Consumer-friendly redesign** (warm whites, illustrations) — rejected; doesn't match the product's technical nature
- **Bold editorial** (Vercel/Stripe-style) — valid alternative; dev-tool chosen because it better reflects the WASM/utility character
- **Light-first** — rejected; dark is the dominant convention for developer tools and makes output previews pop
- **Keep Inter** — rejected in favour of Geist which is purpose-designed for this exact context
- **Partial scope** (shell only) — rejected; the token system means full-app propagation costs little more than shell-only
