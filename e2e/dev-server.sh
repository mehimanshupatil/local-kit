#!/bin/bash
# Astro 7's CLI always daemonizes `astro dev`/`astro preview` — the invoked
# process exits immediately after handing off to a background server, which
# Playwright's webServer (expects a long-lived foreground process) reads as a
# crash. This wrapper starts the daemon, then blocks on its log stream so
# Playwright has something to hold onto, and stops the daemon on teardown.
set -e
cleanup() { pnpm exec astro dev stop >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

pnpm exec astro dev stop >/dev/null 2>&1 || true
pnpm exec astro dev
pnpm exec astro dev logs --follow
