# Run all ML inference in-browser; no external ML APIs

Features like background removal and OCR could be implemented by calling external APIs (Remove.bg, Google Vision, etc.) which would give better accuracy and smaller bundle sizes. These are rejected because they require sending user files to third-party servers, which violates the core privacy constraint. All ML inference runs locally using in-browser runtimes: ONNX (via `@imgly/background-removal`) for image segmentation, and `scribe.js-ocr` for text recognition. Model weights are bundled or fetched once and cached by the service worker.

## Considered Options

- **External ML APIs** (Remove.bg, Google Vision, etc.) — better accuracy, no bundle cost, but files leave the device
- **In-browser ONNX / WASM (chosen)** — larger initial load, potentially lower accuracy, but fully private and offline-capable
