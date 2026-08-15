import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  deps: { neverBundle: ['electron'] },
  sourcemap: false,
  clean: true,
  dts: false,
})
