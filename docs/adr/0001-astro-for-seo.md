# Use Astro as the app framework for SEO

LocalKit tools need to be discoverable via search engines — users search for "merge PDFs online" or "compress image free". A pure SPA (Vite + React or Next.js client-only) renders tool pages as blank shells until JS hydrates, which hurts SEO. Astro generates static HTML for every tool page at build time, with React mounted only as islands for the interactive tool components. This gives full SEO-indexable content with minimal JS on initial load.

## Considered Options

- **Vite + React SPA** — no SSR, tool pages not indexable
- **Next.js** — would work for SEO but adds server/edge runtime complexity that conflicts with the 100% static deployment goal (GitHub Pages)
- **Astro (chosen)** — static output, React islands for interactivity, zero server requirement, deploys to GitHub Pages as plain HTML
