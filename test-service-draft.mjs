// Service-plan autosave — run with:
//   npx vite &            (or npm run dev)
//   node test-service-draft.mjs
//
// The plan used to be the only piece of live Sunday work with no safety net: a
// crash mid-drag took the whole running order with it, while the Song Editor
// kept a draft. This covers the guard that closes that hole:
//
//   1. MIRROR      — an unsaved edit is written to localStorage.
//   2. RECOVERY    — reloading WITHOUT saving (a crash) hands the order back
//                    and announces it.
//   3. STILL DIRTY — recovered work is unsaved by definition, so it keeps
//                    being mirrored: a second crash loses nothing more.
//   4. NO PHANTOM  — an order cleared on purpose is never offered back.
//
// Runs in plain-browser mode (no window.require), so db-save-service is not
// exercised here — everything under test is renderer state and localStorage.
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://localhost:5173';
const DRAFT_KEY = 'kog-service-draft';

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  PASS  ${msg}`);
  else { failures += 1; console.log(`  FAIL  ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => { failures += 1; console.log(`  FAIL  page error: ${e.message}`); });

const readDraft = () => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);

// Cold start -> the console itself. The command center starts COLLAPSED (the
// center workspace paints over it), so the rail button has to go first or the
// tab click gets intercepted.
async function bootToConsole() {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Start Blank' }).click();
  await page.waitForTimeout(1500);
  const rail = page.locator('[title="Open command center"]');
  if (await rail.isVisible().catch(() => false)) {
    await rail.click();
    await page.waitForTimeout(800);
  }
  await page.getByRole('tab', { name: /Service Order/ }).click();
  await page.waitForTimeout(400);
}
const addSection = () => page.locator('[title="+ New Section"]').click();
const orderShows = async (text) => await page.getByText(text, { exact: false }).first().isVisible().catch(() => false);

console.log('\nService-plan autosave\n');

// --- 1: an unsaved edit is mirrored -----------------------------------------
await bootToConsole();
ok(!(await readDraft()), 'a clean boot leaves no draft behind');

await addSection();
await page.waitForTimeout(1300); // debounce is 700ms
const draft1 = await readDraft();
ok(!!draft1, 'an unsaved plan edit is mirrored to localStorage');
if (draft1) {
  const d = JSON.parse(draft1);
  ok(Array.isArray(d.service) === false && Array.isArray(d.service.items) && d.service.items.length === 1, `draft holds the working order (${JSON.stringify((d.service.items || []).map((i) => i.title))})`);
  ok(Number.isFinite(d.at) && d.at > 0, 'draft records when it was written');
}

// --- 2: crash recovery ------------------------------------------------------
// Reload with nothing saved and nothing closed — exactly what a crash looks
// like from the renderer's side.
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Start Blank' }).click();
const toast = page.getByText('Service plan recovered');
await toast.waitFor({ timeout: 15000 }).catch(() => {});
ok(await toast.isVisible().catch(() => false), 'the console announces the recovered plan');
await page.waitForTimeout(500);

const rail = page.locator('[title="Open command center"]');
if (await rail.isVisible().catch(() => false)) {
  await rail.click();
  await page.waitForTimeout(800);
}
await page.getByRole('tab', { name: /Service Order/ }).click();
await page.waitForTimeout(400);
ok(await orderShows('New Section'), 'the lost section is back in the running order');

// --- 3: recovered work is still unsaved work --------------------------------
ok(!!(await readDraft()), 'the recovered plan is still mirrored — a second crash loses nothing more');

// --- 4: an order cleared on purpose is never offered back -------------------
await page.locator('[title="Clear order"]').click();
await page.getByRole('button', { name: 'Clear' }).click(); // the confirm
await page.waitForTimeout(1300);
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Start Blank' }).click();
await page.waitForTimeout(3500); // long enough for a phantom recovery to have shown
ok(!(await page.getByText('Service plan recovered').isVisible().catch(() => false)), 'an empty, deliberately-cleared order is never offered back');

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nRESULT: all passed');
process.exit(failures ? 1 : 0);
