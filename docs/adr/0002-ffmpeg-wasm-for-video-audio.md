# Use FFmpeg WASM for video and audio processing

Video and audio transformation (trim, compress, convert, extract audio) requires FFmpeg. A server-side approach would be faster and produce a smaller initial bundle, but violates the core privacy constraint — files must never leave the user's device. FFmpeg compiled to WebAssembly (~30MB) runs entirely in the browser via a Web Worker. The load cost is accepted as a one-time penalty; the bundle is cached by the service worker on first load so subsequent visits pay nothing.

## Considered Options

- **Server-side FFmpeg** — fast, small client bundle, but requires infrastructure and file uploads
- **FFmpeg WASM (chosen)** — ~30MB first-load cost, zero server, files stay local, cached by PWA service worker after first use
