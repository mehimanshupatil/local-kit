# Persist preferences in localStorage; never persist files

LocalKit has no server and no user accounts. Local persistence is limited to two layers:

- **In-memory (Zustand)**: input File Session per category — lives only while the tab is open
- **localStorage**: small user preferences — theme, per-tool defaults (last compression quality, last output format), recently used tools list

File content is never written to IndexedDB or any persistent storage. Files already exist on the user's disk; caching blobs in the browser creates a stale-data problem (the on-disk file may change while the cached blob is stale) and consumes significant storage quota for no meaningful gain. Users re-supply files by dragging them in — the File Session within a category reduces that friction within a single working session.
