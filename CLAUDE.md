# CLAUDE.md — LocalKit

Privacy-first browser-based utilities. 100% client-side — no uploads, no servers.

## Stack

| Layer | Tech |
|---|---|
| Framework | Astro 6 (static + React islands) |
| UI | React 19 + shadcn/ui (Base UI + Tailwind v4) |
| State | Zustand 5 (global), use-immer (local) |
| PDF | @cantoo/pdf-lib + pdfjs-dist |
| Video/Audio | @ffmpeg/ffmpeg (WASM) |
| Image | Canvas API + @imgly/background-removal (ONNX) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| PWA | @vite-pwa/astro + Workbox |
| Package mgr | pnpm |
| TypeScript | 6.0 strict mode |

## Commands

```bash
pnpm dev             # dev server with HMR
pnpm build           # static output → dist/
pnpm preview         # preview production build
pnpm generate-og     # regenerate OG images in public/og/ — re-run when tools change
pnpm typecheck       # tsc --noEmit over src/ (CI gate)
pnpm test            # Vitest — unit tests for src/lib pure functions
pnpm test:e2e        # Playwright — full upload → process → verify flow in a real browser
```

No env vars needed — fully client-side.

## Structure

```
src/
  pages/          # Astro routes (index, pdf/*, image/*, video/*, audio/*, dev/*, calculators/*)
  layouts/        # BaseLayout.astro, ToolLayout.astro
  components/
    ui/           # shadcn/ui primitives
    layout/       # Header, Footer, ThemeToggle, PWAInstallPrompt
    shared/       # DropZone, OutputFiles, ProgressBar, FileList
    pdf/          # 10 PDF tool components
    image/        # 5 image tool components
    video/        # 4 video tool components
    audio/        # 3 audio tool components
    dev/          # developer tool components
    calculators/  # general-audience computation tool components
  lib/            # Pure processing functions (no React) per category
  data/tools.ts   # Tool registry — single source of truth for metadata/SEO
  stores/
    uiStore.ts    # Zustand: toasts/notifications only
  styles/
    global.css    # Tailwind v4 theme vars and design tokens
```

## Key Conventions

**Tool registry** (`src/data/tools.ts`): Add all tool metadata here (name, route, description, icon, SEO). Don't hardcode elsewhere.

**Astro islands**: Pages are static `.astro` files. Interactive tool components use `client:load`. Keep as much static as possible.

**Lib functions**: Processing logic lives in `src/lib/<category>/` as pure functions. They take `File` objects, return `{ blob, name, ... }`. No React imports in lib files.

**State**:
- Zustand (`uiStore`) for cross-component transient UI state only
- `useState` / `useImmer` for component-local state
- No prop drilling — tools are self-contained

**Hooks**: Use `@mantine/hooks` before writing custom hooks. e.g. `useTimeout` not `setTimeout`, `useClipboard` for text copy, `useDisclosure` for toggle state, etc.

**Styling**:
- Brand color: `--color-brand-*` (emerald `#10b981`) — dark-first design
- Dark mode: dark by default, light available via toggle stored in localStorage
- Use `cn()` (`src/lib/utils/`) for all Tailwind class merging
- No custom component CSS — use shadcn/ui components: `<Button variant>`, `<Card>`, `<Input>`, `<Label>`, etc.
- Icons: `@phosphor-icons/react` (use `Icon` suffix names e.g. `XIcon`, `CheckIcon`)

**File utilities** (`src/lib/utils/`): `formatFileSize`, `generateId` (nanoid), `stripExtension`, `getExtension`.

**Progressive processing**: Pass `setProgress` callbacks into lib functions so UI updates during long operations. Don't block UI.

**Object URLs**: Always call `URL.revokeObjectURL()` on cleanup for image previews.

**FFmpeg**: Lazy-load on first video/audio use (~30MB WASM, cached by service worker). Don't eagerly import.

## Testing

- **Unit tests** (Vitest, `src/**/*.test.ts`): pure logic only — extract algorithm-y pieces of DOM/canvas-bound lib functions (see `src/lib/pdf/wordToPdf.ts`'s `chunkByHeight`/`computeRenderScale`) so they're testable without a browser.
- **E2E tests** (Playwright, `e2e/*.spec.ts`): drive the real upload → process → output flow in an actual browser — required for anything touching canvas, ffmpeg-wasm, or File/Blob APIs that jsdom can't fake. Assert structurally (page/frame count, valid header bytes, dimensions, non-trivial file size) rather than golden-file byte matches, which break across library version bumps.
- No production error telemetry — 100% client-side means no server to report to, and adding any would conflict with the privacy promise. Real-world breakage surfaces via GitHub issues.
- `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` all gate CI (`.github/workflows/ci-cd.yml`) before build/deploy.

## Deployment

GitHub Pages via `.github/workflows/ci-cd.yml`. Pushes to `main` trigger build + deploy. Node 24, pnpm 10.

## Adding a New Tool

1. Add entry to `src/data/tools.ts`
2. Create `src/pages/<category>/<tool-name>.astro` using `ToolLayout`
3. Create `src/components/<category>/<ToolName>Tool.tsx`
4. Add processing logic in `src/lib/<category>/`
5. Use `DropZone` + `OutputFiles` shared components
6. Add tests: Vitest unit tests (`*.test.ts` next to the lib file) for any pure logic in `src/lib/<category>/`; a Playwright spec in `e2e/` that drives the full upload → process → output flow in a real browser. Both run in CI and gate merges.
7. Manually verify in Chrome, Firefox, and Safari (desktop + one mobile browser) with an empty file, a corrupt file, and an oversized file before merging.
