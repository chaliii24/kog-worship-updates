import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// Resolve paths against this file. `__dirname` is unreliable here because the
// config is loaded as ESM (package.json has "type": "module"), and a raw
// `new URL(...).pathname` comes back as "/C:/..." on Windows.
const from = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  // tailwindcss — Untitled UI migration (phase 1): tokens + utilities
  // layers only (see the header of src/index.css). Phase 1: real components
  // now live under src/untitledui/ and NewSongPrompt.jsx uses them.
  resolve: {
    // Untitled UI's components import each other through a `@/` alias rooted
    // at their repo root — src/untitledui mirrors that layout so the files
    // stay copy-paste compatible with upstream. The regex only matches
    // `@/`, so npm scopes like `@untitledui/icons` pass through untouched.
    alias: [{ find: /^@\//, replacement: from('./src/untitledui/') }],
  },
  plugins: [react(), tailwindcss()],
  base: './',
  // `host: true` binds 0.0.0.0 instead of localhost — without it a phone on
  // the LAN cannot load the app during `npm run dev`. Production does not use
  // Vite for serving: Electron's LAN server hands out the built files.
  server: {
    host: true,
    port: 5173,
    strictPort: false,
    // electron-builder unpacks into `release\win-unpacked.tmp` and then renames
    // it into place. If the dev watcher follows that tree, its open directory
    // handles make the rename fail with EPERM on Windows, and every packaged
    // file that appears hot-reloads the running app. Build output is never
    // source. Vite merges this into its own ignore list (`.git`, node_modules,
    // cacheDir, outDir) rather than replacing it.
    watch: {
      ignored: ['**/release/**'],
    },
  },
  preview: {
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: from('./index.html'),
        mobile: from('./mobile.html'),
      },
    },
  },
})
