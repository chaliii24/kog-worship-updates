// ---------------------------------------------------------------------------
// REAL-REACT REGRESSION TEST FOR THE VIDEO-SLOT HOOK
//
// The pool itself is covered by videoSlots.test.mjs, but the bug that emptied
// every slide card lived in the HOOK's effect lifecycle: React StrictMode runs
// effects mount → cleanup → mount, and an effect that kept a slot it already
// owned returned no cleanup — so unmount had nothing left to release it. One
// leaked slot per song switch; after ~16 the budget was gone and every card
// past the cap rendered a black placeholder for the rest of the session.
//
// That class of bug only exists against a real React runtime, so this test
// bundles the actual hook (tests/browser/slotHarness.jsx) and drives it inside
// Chromium under <StrictMode>.
// ---------------------------------------------------------------------------
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { chromium } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');

// Development build on purpose: StrictMode's double-invoked effects (the exact
// behaviour that used to leak) only exist outside production React.
const bundle = buildSync({
  entryPoints: [path.join(root, 'tests', 'browser', 'slotHarness.jsx')],
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  loader: { '.jsx': 'jsx' },
  define: { 'process.env.NODE_ENV': '"development"' },
  logLevel: 'silent',
}).outputFiles[0].text;

let browser;
let page;

const settle = () => page.evaluate(() => window.__settle());
const stats = () => page.evaluate(() => window.__stats());
const states = () => page.evaluate(() => window.__states);

// One "song" of grid tiles: every tile key changes per song, exactly like the
// slide grid does when a different song is loaded (all keys change, so React
// unmounts the whole old grid and mounts the new one in a single commit).
const song = (name, n = 23, priority = false) =>
  Array.from({ length: n }, (_, i) => ({ key: `${name}-${i}`, enabled: true, priority }));

const reset = () => page.evaluate(() => { window.__states = {}; window.__mount(); });

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
  // addScriptTag injects the bundle as text, so a "</script>" inside React's
  // own strings can never terminate the tag.
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => typeof window.__mount === 'function');
});

after(async () => { if (browser) await browser.close(); });

test('a StrictMode mount hands its slot back on unmount', async () => {
  await reset();
  await page.evaluate(() => window.__setItems([{ key: 'a', enabled: true, priority: false }]));
  await settle();
  assert.deepEqual(await stats(), { active: 1, waiting: 0 }, 'the tile owns exactly one slot');

  await page.evaluate(() => window.__unmount());
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 }, 'unmount gives the slot back');
});

test('repeated song switches never exhaust the budget', async () => {
  await reset();

  // Load eight songs in a row — the exact pattern that used to leak one slot
  // per switch and left every later card black.
  for (let s = 0; s < 8; s++) {
    await page.evaluate((items) => window.__setItems(items), song(`song${s}`));
    await settle();
  }
  const mid = await stats();
  assert.equal(mid.active <= 16, true, `budget respected while a song is open (active ${mid.active})`);

  // Clear the grid: everything checked out must come back.
  await page.evaluate(() => window.__setItems([]));
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 }, 'every slot returns when the grid clears');

  // THE user-visible assertion: after all that churn a freshly loaded song
  // still gets its videos instead of rendering black placeholders.
  await page.evaluate((items) => window.__setItems(items), song('fresh', 3));
  await settle();
  const st = await states();
  assert.equal(st['fresh-0'] && st['fresh-1'] && st['fresh-2'], true, 'new tiles are granted after many song switches');

  await page.evaluate(() => window.__unmount());
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 });
});

test('a tile over the cap waits, then fills in as slots free up', async () => {
  await reset();
  await page.evaluate((items) => window.__setItems(items), song('big', 20));
  await settle();

  const full = await stats();
  assert.deepEqual(full, { active: 16, waiting: 4 }, 'the cap holds and the overflow queues');

  // Exactly the cap may render — a queued tile must never claim a grant.
  const granted = Object.values(await states()).filter(Boolean).length;
  assert.equal(granted, 16, 'exactly 16 tiles report granted while 4 wait');

  // Four tiles scroll away (their key changes, like a re-render of the grid).
  const shrunk = song('big', 16).concat(
    Array.from({ length: 4 }, (_, i) => ({ key: `big-x${i}`, enabled: false, priority: false }))
  );
  await page.evaluate((items) => window.__setItems(items), shrunk);
  await settle();
  const after = await stats();
  assert.equal(after.waiting <= 2, true, `queued work drains once slots free (waiting ${after.waiting})`);

  await page.evaluate(() => window.__setItems([]));
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 });
});

test('enabled flickering off and on never leaks', async () => {
  await reset();
  const tile = (enabled) => [{ key: 'f', enabled, priority: false }];
  await page.evaluate((items) => window.__setItems(items), tile(true));
  await settle();

  for (let i = 0; i < 5; i++) {
    await page.evaluate((items) => window.__setItems(items), tile(false));
    await settle();
    await page.evaluate((items) => window.__setItems(items), tile(true));
    await settle();
  }
  assert.deepEqual(await stats(), { active: 1, waiting: 0 }, 'one flickering tile owns exactly one slot');

  await page.evaluate(() => window.__unmount());
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 });
});

test('the priority waiter (Up Next) wins the next freed slot', async () => {
  await reset();
  const grid = (n) => Array.from({ length: n }, (_, i) => ({ key: `p${i}`, enabled: true, priority: false }));

  await page.evaluate((items) => window.__setItems(items), grid(16));
  await settle();
  assert.deepEqual(await stats(), { active: 16, waiting: 0 });

  // A normal tile and the Up Next face both queue behind a full budget.
  await page.evaluate((items) => window.__setItems(items), grid(16).concat([
    { key: 'normal', enabled: true, priority: false },
    { key: 'upnext', enabled: true, priority: true },
  ]));
  await settle();
  assert.deepEqual(await stats(), { active: 16, waiting: 2 });

  // One grid tile unmounts and frees its slot.
  await page.evaluate((items) => window.__setItems(items), grid(15).concat([
    { key: 'normal', enabled: true, priority: false },
    { key: 'upnext', enabled: true, priority: true },
  ]));
  await settle();

  const st = await states();
  assert.equal(st.upnext, true, 'the Up Next face took the freed slot');
  assert.equal(st.normal, false, 'the ordinary tile is still queued behind it');

  await page.evaluate(() => window.__setItems([]));
  await settle();
  assert.deepEqual(await stats(), { active: 0, waiting: 0 });
});
