# Share input files within a category via a Zustand file store

Currently each tool mounts fresh with no memory of other tools. Users working across multiple PDF tools (e.g. merge → split → rotate) must re-upload the same files each time. A category-scoped file store in Zustand lets files persist when navigating between tools in the same category — upload once, use across all PDF tools.

Files are scoped per category (`pdf`, `image`, `video`, `audio`, `dev`). A new tool starts with the category's current file list; the user can add or remove files. Outputs and per-tool settings are never shared — only the raw input `File[]`. Files are not shared across categories (a PDF file does not appear in image tools).

## Considered Options

- **No shared state (current)** — simple but forces re-upload on every tool switch
- **Global file store** — files persist across all categories; too broad, confuses mental model
- **Category-scoped Zustand store (chosen)** — matches the user's mental model ("I'm working on PDFs"), leverages Zustand already in the stack, keeps cross-tool state minimal
