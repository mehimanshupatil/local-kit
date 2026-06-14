# Static OG image generation with satori + resvg-js

Every page needs a distinct Open Graph image (1200×630 px) so link previews on Twitter/Slack/Discord show the specific tool or category rather than nothing. LocalKit is a 100% static site with no server, so images must be pre-generated and committed.

Decisions:
- **Two templates** — tool pages get a tool-focused card (name + description + category badge); category/home pages get a grid card showing all tool names as pills. Single template was rejected as less distinctive for per-tool sharing.
- **`satori` + `@resvg/resvg-js`** for generation — satori converts JSX-like objects to SVG; resvg-js (Rust WASM) converts SVG to PNG. Both are pure Node.js, no browser. Rejected Puppeteer/Chrome headless (2s/image × 53 pages = ~2 min, Chrome dependency) and `node-canvas` (verbose, no JSX).
- **Standalone script `pnpm generate-og`**, not integrated into `pnpm build` — OG images only change when a tool is added or the template changes. Committing generated PNGs to git is standard practice and keeps the build fast. Re-run manually and commit.
- **Static TTF fonts only** — satori's opentype.js parser does not support woff2 or variable fonts. Uses `Geist-Regular/Medium/Bold.ttf` from the already-installed `geist` npm package.
- **Dark brand template** — `#080808` background, per-category accent bar, Geist font. Matches the app's visual identity so preview cards look like they belong to the same product.

## Considered Options

- **Puppeteer screenshot** — rejected: slow, requires Chrome, fragile
- **`@vercel/og` (edge function)** — rejected: requires a server; LocalKit is static-only
- **Single template** — rejected: identical previews for 50+ tools are less shareable
- **Build-time generation** — rejected: adds ~10s to every build for images that rarely change
