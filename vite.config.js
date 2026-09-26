import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Resolve paths against this file. `__dirname` is unreliable here because the
// config is loaded as ESM (package.json has "type": "module"), and a raw
// `new URL(...).pathname` comes back as "/C:/..." on Windows.
const from = (p) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: './',
  // `host: true` binds 0.0.0.0 instead of localhost — without it a phone on
  // the LAN cannot load the app during `npm run dev`. Production does not use
  // Vite for serving: Electron's LAN server hands out the built files.
  server: {
    host: true,
    port: 5173,
    strictPort: false,
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
