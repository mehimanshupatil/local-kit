import { execSync } from 'node:child_process';

// dev-server.sh backgrounds an `astro dev` daemon that Playwright's own
// process-teardown doesn't reliably signal (Astro 7's dev CLI always forks
// off a detached server). Stop it explicitly so it never leaks into the next
// run and blocks port 4321.
export default function globalTeardown() {
  try {
    execSync('pnpm exec astro dev stop', { stdio: 'ignore' });
  } catch {
    // No server was running — nothing to clean up.
  }
}
