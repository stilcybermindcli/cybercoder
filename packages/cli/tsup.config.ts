import { defineConfig } from 'tsup';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: false,
  splitting: false,
  shims: false,
  // Bundle only our workspace packages; leave every third-party dep as an
  // external import so Node resolves them from node_modules at runtime. This
  // avoids issues bundling packages that use dynamic require (e.g. whatwg-url
  // pulled in by @anthropic-ai/sdk via node-fetch).
  noExternal: [/^@cybermind\//],
  skipNodeModulesBundle: true,
  esbuildOptions(options) {
    options.resolveExtensions = ['.tsx', '.ts', '.jsx', '.js'];
    options.mainFields = ['module', 'main'];
    options.alias = {
      '@cybermind/shared': path.resolve(__dirname, '../shared/src/index.ts'),
      '@cybermind/core': path.resolve(__dirname, '../core/src/index.ts'),
      '@cybermind/config': path.resolve(__dirname, '../config/src/index.ts'),
      '@cybermind/providers': path.resolve(__dirname, '../providers/src/index.ts'),
      '@cybermind/skills': path.resolve(__dirname, '../skills/src/index.ts'),
      '@cybermind/telemetry': path.resolve(__dirname, '../telemetry/src/index.ts'),
      '@cybermind/tools': path.resolve(__dirname, '../tools/src/index.ts'),
    };
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
