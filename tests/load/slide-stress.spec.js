// @ts-check
// Console load test: boots the real Electron app, opens a song, and fires
// slides as fast as an operator slamming ArrowRight on low-end hardware.
// Verdict comes from the renderer itself — rAF frame gaps + longtask entries
// recorded in-page during the burst — so a ~1s UI stall fails loudly instead
// of hiding behind a green "it didn't crash".
//
//   npm run test:load
//   LOAD_FIRES=25 LOAD_GAP_MS=120 LOAD_MAX_LONGTASK_MS=1500 LOAD_P95_FRAME_MS=1000 npm run test:load
//
// Requires: vite (auto-started by the load config), Electron, and seeded
// songs in the local app DB. Do NOT run while presenting — it fires slides.
import { test, expect, _electron as electron } from '@playwright/test';

const FIRES = Number(process.env.LOAD_FIRES || 25);
const GAP_MS = Number(process.env.LOAD_GAP_MS || 120);
const MAX_LONGTASK_MS = Number(process.env.LOAD_MAX_LONGTASK_MS || 1500);
const P95_FRAME_MS = Number(process.env.LOAD_P95_FRAME_MS || 1000);
// Frame gaps above this are environment noise (alt-tab, devtools pause), not
// app jank — counted separately so they can't fail the run.
const NOISE_FLOOR_MS = 5000;

const fmt = (n) => Math.round(n * 10) / 10;
const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

let app;
let win;

test.beforeAll(async () => {
  app = await electron.launch({
    args: ['.'],
    env: { ...process.env, ELECTRON_START_URL: 'http://localhost:5173' },
  });
  win = await app.firstWindow();
  // Cold boot under vite can take 30s+ on weak hardware: splash covers the
  // console for ~5s AFTER React mounts, and buttons only exist once it lifts.
  await win.waitForFunction(() => document.querySelectorAll('button').length > 5, null, { timeout: 180000 });
  await win.waitForTimeout(2000);
});

test.afterAll(async () => {
  await app?.close();
});

async function openFirstSong() {
  // Console boots to Shows dock → Service Order panel; the library lives
  // behind the Songs sub-tab (UUI tab role, badge count rides the name).
  const songsTab = win.getByRole('tab', { name: 'Songs' });
  await expect(songsTab, 'Songs sub-tab missing — is the Shows dock the default view?').toBeVisible({ timeout: 30000 });
  await songsTab.click();
  const rows = win.locator('[title^="Click to open this song"]');
  await expect(rows.first(), 'no song rows — seed songs in the local app DB first').toBeVisible({ timeout: 30000 });
  await rows.first().click();
  // "Grid Density" only renders once a song's slide grid is up (CenterWorkspace).
  await expect(win.getByText('Grid Density'), 'slide grid did not open after clicking the song').toBeVisible({ timeout: 15000 });
}

async function startMeter() {
  await win.evaluate(() => {
    window.__load = { frames: [], longs: [] };
    window.__loadLast = performance.now();
    const tick = (t) => {
      window.__load.frames.push(t - window.__loadLast);
      window.__loadLast = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__load.longs.push(e.duration);
    }).observe({ entryTypes: ['longtask'] });
  });
}

async function readMeter() {
  return win.evaluate(() => ({ frames: window.__load?.frames || [], longs: window.__load?.longs || [] }));
}

test.describe('console load', () => {
  test('slide stress: rapid keypress firing stays responsive', async () => {
    await openFirstSong();
    await win.locator('body').click().catch(() => {});
    await startMeter();
    for (let i = 0; i < FIRES; i++) {
      await win.keyboard.press('ArrowRight');
      await win.waitForTimeout(GAP_MS);
    }
    await win.waitForTimeout(1500); // let trailing work settle
    const { frames, longs } = await readMeter();
    const noisy = frames.filter((g) => g >= NOISE_FLOOR_MS).length;
    const gaps = frames.filter((g) => g < NOISE_FLOOR_MS);
    const stats = {
      fires: FIRES,
      frames: gaps.length,
      droppedNoise: noisy,
      p50frame: fmt(pct(gaps, 50)),
      p95frame: fmt(pct(gaps, 95)),
      maxFrame: fmt(Math.max(...gaps, 0)),
      longtasks: longs.length,
      over200ms: longs.filter((d) => d > 200).length,
      maxLongtask: fmt(Math.max(...longs, 0)),
    };
    console.log(`[load] frame-gap/longtask ms: ${JSON.stringify(stats)}`);
    expect(stats.maxLongtask, `one task blocked the console ${stats.maxLongtask}ms (budget ${MAX_LONGTASK_MS}ms)`).toBeLessThan(MAX_LONGTASK_MS);
    expect(stats.p95frame, `p95 frame gap ${stats.p95frame}ms (budget ${P95_FRAME_MS}ms)`).toBeLessThan(P95_FRAME_MS);
    // Still alive afterwards: frames must be flowing, not just the process.
    await win.keyboard.press('ArrowLeft');
    const ping = await win.evaluate(
      () => new Promise((res) => { const t = performance.now(); requestAnimationFrame(() => res(performance.now() - t)); })
    );
    expect(ping, 'console stopped producing frames after the burst').toBeLessThan(1000);
  });

  test('video backgrounds keep advancing while sliding', async () => {
    // Find a song with a live (playing) video background — first of the top 3
    // rows that yields one. Same window as the stress test, serial order.
    // The Songs sub-tab stays put once openFirstSong selects it.
    const rows = win.locator('[title^="Click to open this song"]');
    const total = Math.min(await rows.count(), 3);
    let probed = { n: 0, moved: [] };
    for (let j = 0; j < total; j++) {
      await rows.nth(j).click();
      await win.waitForTimeout(1200);
      probed = await win.evaluate(() => {
        const vids = [...document.querySelectorAll('video')].filter((v) => !v.paused && !v.ended && v.readyState >= 2);
        return { n: vids.length, ids: vids.map((v) => v.currentSrc || v.src) };
      });
      if (probed.n > 0) break;
    }
    if (probed.n === 0) test.skip(true, 'no playing video background in the first songs — open a video-bg song to exercise this');
    console.log(`[load] probing ${probed.n} playing video(s) while firing slides`);
    // Start the 2s probe WITHOUT awaiting, fire slides during its window,
    // then collect — otherwise the slides land after the measurement.
    const probe = win.evaluate(() => {
      const vids = [...document.querySelectorAll('video')].filter((v) => !v.paused && !v.ended && v.readyState >= 2);
      const t0 = vids.map((v) => v.currentTime);
      return new Promise((res) => setTimeout(() => res(vids.map((v, i) => Math.round((v.currentTime - t0[i]) * 10) / 10)), 2000));
    });
    for (let i = 0; i < 5; i++) {
      await win.keyboard.press('ArrowRight');
      await win.waitForTimeout(300);
    }
    const moved = (await probe.catch(() => null)) ?? [];
    console.log(`[load] video advance over 2s while sliding: ${JSON.stringify(moved)}s`);
    for (const [i, m] of moved.entries()) {
      expect(m, `video #${i} froze (advanced ${m}s in 2s) while sliding`).toBeGreaterThan(0.05);
    }
  });
});
