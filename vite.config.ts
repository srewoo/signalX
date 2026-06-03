import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const root = __dirname;

const ICON_SIZES = [16, 32, 48, 128] as const;

/**
 * Emits a dist/manifest.json with the background service_worker path rewritten
 * to the hashed build output. Without this the manifest would still point at the
 * TypeScript source path, which Chrome cannot load.
 */
function manifestPlugin(): Plugin {
  return {
    name: 'signalx-manifest',
    generateBundle(_options, bundle) {
      let swFile = 'background.js';
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry && chunk.name === 'background') {
          swFile = fileName;
          break;
        }
      }
      // Source manifest is deliberately named manifest.src.json so the repo root
      // can never be mistaken for a loadable extension — only dist/ is loadable.
      const raw = readFileSync(resolve(root, 'manifest.src.json'), 'utf8');
      const manifest = JSON.parse(raw) as {
        background: { service_worker: string; type: string };
        side_panel: { default_path: string };
      };
      manifest.background.service_worker = swFile;
      manifest.side_panel.default_path = 'src/panel/panel.html';
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest, null, 2),
      });

      // Copy extension icons into dist/icons/ at the stable paths the manifest
      // references. Emitting as bytes keeps them unhashed so manifest paths
      // resolve without rewriting.
      for (const size of ICON_SIZES) {
        const src = resolve(root, `icons/icon${size}.png`);
        if (!existsSync(src)) continue;
        this.emitFile({
          type: 'asset',
          fileName: `icons/icon${size}.png`,
          source: readFileSync(src),
        });
      }
    },
  };
}

/** Rollup HTML inputs that exist on disk (static pages authored by the UI agent). */
function pageInputs(): Record<string, string> {
  const inputs: Record<string, string> = {
    panel: resolve(root, 'src/panel/panel.html'),
    background: resolve(root, 'src/background/index.ts'),
  };
  const pages: Record<string, string> = {
    help: resolve(root, 'src/panel/pages/help.html'),
    privacy: resolve(root, 'src/panel/pages/privacy.html'),
  };
  for (const [name, path] of Object.entries(pages)) {
    if (existsSync(path)) inputs[name] = path;
  }
  return inputs;
}

export default defineConfig({
  root,
  publicDir: false,
  plugins: [manifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    modulePreload: false,
    rollupOptions: {
      input: pageInputs(),
      output: {
        format: 'es',
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
