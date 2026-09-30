// @ts-check
import { defineConfig } from '@playwright/test';

/**
 * Load / stress runs boot the REAL Electron app (not a browser) against the
 * local vite server, then hammer it the way an operator does on a low-end
 * machine: rapid slide firing while frame gaps + longtasks are recorded.
 *
 *   npm run test:load
 *
 * Budgets are env-overridable so the same file runs on weak and strong boxes:
 *   LOAD_FIRES=25 LOAD_GAP_MS=120 LOAD_MAX_LONGTASK_MS=1500 LOAD_P95_FRAME_MS=1000
 *
 * Needs seeded songs in the local app DB (%APPDATA%\kog-worship on Windows).
 * Kept in its own config/file so the default `npx playwright test` browser
 * run never picks these up (see testIgnore in playwright.config.js).
 */
export default defineConfig({
  testDir: './tests/load',
  timeout: 180000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
