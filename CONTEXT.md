# LocalKit

A collection of file-processing utilities that run entirely in the user's browser. No files are uploaded to any server; all processing happens client-side using browser APIs, WebAssembly, and the Canvas API. Deployed as a static site to GitHub Pages — no paid infrastructure, ever.

**Hard constraint**: Any tool is in scope as long as it processes files locally. Any feature that requires a server or external API is permanently out of scope — no exceptions.

## Language

**Privacy-first**: Files never leave the user's device. No uploads, no runtime network requests after page load, no telemetry. The app is PWA-installable and fully functional air-gap (offline) after first visit.
_Avoid_: "client-side", "serverless", "secure"

**Tool**: A single file-processing function exposed to the user as a page (e.g. Merge PDFs, Compress Image). Each tool is self-contained — it owns its UI state and calls one or more lib functions.
_Avoid_: feature, utility, widget

**Category**: A group of related tools sharing a route prefix and index page (e.g. `/pdf`, `/image`, `/video`, `/audio`, `/dev`).
_Avoid_: section, module, namespace

**Tool Registry**: The single source of truth for all tool and category metadata (name, route, description, SEO fields). Lives in `src/data/tools.ts`. Used both at build-time (Astro pages pull SEO tags) and at runtime (Header/Footer nav). No tool metadata is hardcoded outside this file.
_Avoid_: tool config, metadata store

**Lib function**: A pure TypeScript function in `src/lib/<category>/` that accepts `File` objects and returns a result blob. No React imports. No side effects beyond the returned value.
_Avoid_: helper, service, processor

**User Preferences**: Small settings persisted to localStorage across browser sessions — theme, per-tool defaults, recently used tools. Never includes file content.
_Avoid_: user profile, account, settings sync

**File Session**: The set of input files a user is currently working with within a category. Persists across tool navigation within that category. Cleared when the user removes all files or leaves the category. Never shared across categories.
_Avoid_: workspace, project, upload session

**Processing**: The act of transforming a user-supplied file using browser APIs. Processing runs on the main thread or in a Web Worker (FFmpeg), never on a server.
_Avoid_: upload, server-side processing, backend operation

**Visual identity**: Dark-first developer tool. Default theme is dark. Accent is emerald green (`#10b981` family). Typeface is Geist Sans + Geist Mono. Border radius is 4px. Cards use `1px` borders on layered dark backgrounds — no shadows.
_Avoid_: sky blue, rounded/bubbly shapes, light-default

**PDF Renderer**: The library used to display PDF page thumbnails, render pages to images, and feed OCR. Always `pdfjs-dist` — the only MIT-licensed browser library that renders PDF pages to canvas.
_Avoid_: pdf-lib for rendering

**PDF Mutator**: The library used to read and write PDF structure (merge, split, rotate, watermark, metadata, forms). Always `@cantoo/pdf-lib` — the only actively maintained MIT fork of `pdf-lib` with real `ignoreEncryption` support for owner-locked PDFs. Original `pdf-lib` unmaintained since 2021; `mupdf` is AGPL-licensed.
_Avoid_: original pdf-lib, mupdf
