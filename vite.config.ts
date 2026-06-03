import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const root = __dirname;

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
      const raw = readFileSync(resolve(root, 'manifest.json'), 'utf8');
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
    },
  };
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
      input: {
        panel: resolve(root, 'src/panel/panel.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
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
