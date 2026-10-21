/**
 * Astro ⇄ vite-plugin-pwa integration, vendored and trimmed from @vite-pwa/astro
 * (https://github.com/vite-pwa/astro, src/index.ts — MIT, © 2022-present Anthony Fu).
 *
 * Kept: the `generateSW` path for a static build, which is all LocalKit uses.
 * Dropped: `output: 'server'`, `injectManifest`, `pwaAssets` and the experimental
 * trailing-slash handler — reinstate from upstream if any of those are ever needed.
 *
 * It drives vite-plugin-pwa through its `api` object and internal plugin names; if a
 * vite-plugin-pwa upgrade renames those, the build fails loudly here (see below) rather
 * than silently shipping without a service worker.
 */
import type { AstroConfig, AstroIntegration } from 'astro';
import type { VitePluginPWAAPI, VitePWAOptions } from 'vite-plugin-pwa';
import { VitePWA } from 'vite-plugin-pwa';

// vite and workbox-build are only transitive dependencies, so take their types from vite-plugin-pwa
type Plugin = ReturnType<typeof VitePWA>[number];
type ManifestTransform = NonNullable<NonNullable<VitePWAOptions['workbox']>['manifestTransforms']>[number];

interface Ctx {
  api?: VitePluginPWAAPI;
  previewOrSync: boolean;
  doBuild: boolean;
  scope: string;
  useDirectoryFormat: boolean;
  trailingSlash: AstroConfig['trailingSlash'];
}

export default function pwa(options: Partial<VitePWAOptions> = {}): AstroIntegration {
  const ctx: Ctx = { previewOrSync: false, doBuild: false, scope: '/', useDirectoryFormat: true, trailingSlash: 'ignore' };

  return {
    name: 'localkit-pwa',
    hooks: {
      'astro:config:setup': ({ command, config, updateConfig }) => {
        if (command === 'preview' || command === 'sync') {
          ctx.previewOrSync = true;
          return;
        }
        if (config.output === 'server') throw new Error('integrations/pwa.ts only supports static output');

        ctx.scope = config.base ?? '/';
        ctx.trailingSlash = config.trailingSlash;
        ctx.useDirectoryFormat = config.build.format === 'directory';

        // Astro generates the service worker after its own build (astro:build:done), so drop
        // vite-plugin-pwa's build plugin (and the dev SW plugin when building) and drive its api instead
        let plugins = vitePWAPlugins(config, options, ctx).filter(p => p.name !== 'vite-plugin-pwa:build');
        if (command === 'build') {
          plugins = plugins.filter(p => p.name !== 'vite-plugin-pwa:dev-sw');
          plugins.push({
            name: 'localkit-pwa:build',
            // Vite environment API: only the client build should produce the manifest / registerSW
            applyToEnvironment: env => env.name === 'client',
            configResolved(resolved) {
              if (!resolved.build.ssr)
                ctx.api = resolved.plugins.find(p => p.name === 'vite-plugin-pwa')?.api as VitePluginPWAAPI | undefined;
            },
            generateBundle(_, bundle) {
              // Vite bundles with rolldown; vite-plugin-pwa's api is still typed against rollup's
              // (structurally compatible at runtime — upstream @vite-pwa/astro also suppresses this)
              type GenerateBundle = Parameters<VitePluginPWAAPI['generateBundle']>;
              ctx.api?.generateBundle(bundle as unknown as GenerateBundle[0], this as unknown as GenerateBundle[1]);
            },
          } satisfies Plugin);
        }

        updateConfig({ vite: { plugins } });
      },
      'astro:build:done': async () => {
        if (ctx.previewOrSync) return;
        ctx.doBuild = true;
        if (!ctx.api)
          throw new Error('vite-plugin-pwa api not found — its internals changed; update integrations/pwa.ts against upstream @vite-pwa/astro');
        if (!ctx.api.disabled) await ctx.api.generateSW();
      },
    },
  };
}

function vitePWAPlugins(config: AstroConfig, options: Partial<VitePWAOptions>, ctx: Ctx): Plugin[] {
  // Manifest icons are copied by Astro from public/, not by the plugin
  const { registerType = 'prompt', injectRegister, workbox = {}, ...rest } = { ...options, includeManifestIcons: false };

  let assets = config.build.assets ?? '_astro';
  assets = assets.replace(/^\/+|\/+$/g, '') + '/';

  const wb = { ...workbox };
  // Offline fallback to the site root unless explicitly configured (or disabled)
  if (!('navigateFallback' in wb)) wb.navigateFallback = config.base ?? '/';
  if (ctx.useDirectoryFormat) wb.directoryIndex = 'index.html';
  // Astro's hashed assets don't need Workbox's cache-busting revision
  if (!('dontCacheBustURLsMatching' in wb)) wb.dontCacheBustURLsMatching = new RegExp(assets);
  wb.manifestTransforms ??= [htmlToRouteTransform(ctx)];

  return VitePWA({ ...rest, strategies: 'generateSW', registerType, injectRegister, workbox: wb });
}

/** Precache pages under the URLs they're served at (`pdf/merge`) rather than file paths (`pdf/merge/index.html`) */
function htmlToRouteTransform(ctx: Ctx): ManifestTransform {
  return async (entries) => {
    if (!ctx.doBuild) return { manifest: entries, warnings: [] };
    for (const e of entries) {
      if (!e.url.endsWith('.html')) continue;
      const url = e.url.replace(/^\//, '');
      if (url === 'index.html') { e.url = ctx.scope; continue; }
      const parts = url.replace(/\.html$/, '').split('/');
      e.url = ctx.useDirectoryFormat
        ? (parts.length > 1 ? parts.slice(0, -1) : parts).join('/')
        : parts.join('/');
      if (ctx.trailingSlash === 'always') e.url += '/';
    }
    return { manifest: entries, warnings: [] };
  };
}
