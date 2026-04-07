# LocalKit

**Privacy-first file tools — 100% in your browser. No uploads. No servers.**

LocalKit is a collection of PDF, image, video, and audio utilities that run entirely client-side using WebAssembly and browser APIs. Your files never leave your device.

---

## Tools

### 📄 PDF Tools
| Tool | Description |
|---|---|
| Merge PDFs | Combine multiple PDFs into one, drag to reorder |
| Split PDF | Extract pages or split into parts with visual cut points |
| Compress PDF | Reduce file size using pdf-lib stream optimization |
| Rotate PDF | Rotate individual or all pages by 90°/180°/270° |
| Reorder Pages | Drag-and-drop page reordering |
| Add Watermark | Stamp text on every page with custom opacity, color, angle |
| Unlock PDF | Remove password protection |
| Extract Images | Pull all embedded images as a ZIP |
| PDF to Images | Export each page as a PNG |
| Images to PDF | Combine JPG/PNG images into a single PDF |

### 🖼️ Image Tools
| Tool | Description |
|---|---|
| Compress Image | Reduce file size with quality control |
| Resize Image | Change dimensions with aspect-ratio lock and presets |
| Convert Format | Convert between JPEG, PNG, WebP, AVIF |
| Crop / Rotate / Flip | Interactive crop area, rotation and flip |
| Background Remover | AI-powered background removal (ONNX, runs locally) |

### 🎬 Video Tools
| Tool | Description |
|---|---|
| Compress Video | Re-encode with H.264 at custom quality |
| Convert Video | MP4, WebM, AVI, MOV, GIF |
| Trim Video | Set start/end with a visual range slider and live preview |
| Extract Audio | Save the audio track as MP3, AAC, WAV, or OGG |

### 🎵 Audio Tools
| Tool | Description |
|---|---|
| Convert Audio | Convert between MP3, AAC, WAV, OGG, FLAC |
| Trim Audio | Set start/end with a range slider and live preview |
| Compress Audio | Reduce file size by lowering bitrate (320k → 64k) |

### 🛠️ Developer Tools
| Tool | Description |
|---|---|
| CSS → Tailwind | Convert CSS properties to Tailwind utility classes |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Astro](https://astro.build) v6 (static site, React islands) |
| UI | React 19 + [shadcn/ui](https://ui.shadcn.com) (Radix primitives) + Tailwind CSS v4 |
| PDF processing | [pdf-lib](https://pdf-lib.js.org) (`@cantoo/pdf-lib`) + [PDF.js](https://mozilla.github.io/pdf.js/) |
| Video/Audio processing | [FFmpeg WASM](https://ffmpegwasm.netlify.app) (`@ffmpeg/ffmpeg`) |
| AI (background removal) | [@imgly/background-removal](https://github.com/imgly/background-removal-js) (ONNX) |
| Drag & drop | [dnd-kit](https://dndkit.com) |
| PWA | [@vite-pwa/astro](https://vite-pwa-org.netlify.app) + Workbox |
| State | React `useState` / [use-immer](https://github.com/immerjs/use-immer) |

---

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

> **Note:** Video and audio tools download ~30 MB of FFmpeg WASM on first use. This is cached by the service worker for subsequent visits.

---

## Project Structure

```
src/
├── components/
│   ├── audio/        # Audio tool React components
│   ├── image/        # Image tool React components
│   ├── layout/       # Header, Footer, ThemeToggle, PWAInstallPrompt
│   ├── pdf/          # PDF tool React components
│   ├── shared/       # DropZone, OutputFiles, ProgressBar, FileList
│   ├── ui/           # shadcn/ui primitives (Button, Slider, Card, …)
│   └── video/        # Video tool React components
├── data/
│   └── tools.ts      # Tool registry — names, routes, metadata
├── layouts/
│   ├── BaseLayout.astro
│   └── ToolLayout.astro
├── lib/
│   ├── audio/        # FFmpeg audio helpers
│   ├── image/        # Canvas API image helpers
│   ├── pdf/          # pdf-lib / PDF.js helpers
│   ├── utils/        # cn, fileUtils, downloadUtils
│   └── video/        # FFmpeg video helpers
└── pages/
    ├── audio/        # /audio/* routes
    ├── dev/          # /dev/* routes
    ├── image/        # /image/* routes
    ├── pdf/          # /pdf/* routes
    └── video/        # /video/* routes
```

---

## Privacy

All processing happens in your browser:

- **PDF tools** use pdf-lib and PDF.js — pure JavaScript, no network calls
- **Image tools** use the HTML5 Canvas API and `@imgly/background-removal` (ONNX model downloaded once, then cached)
- **Video/Audio tools** use FFmpeg compiled to WebAssembly — runs entirely in a Web Worker
- **No analytics, no tracking, no file uploads**

---

## License

MIT
