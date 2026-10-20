// Song Editor draft guard — run with:
//   npx vite &            (or npm run dev)
//   node test-editor-draft.mjs
//
// Covers the fix for "the Song Editor could silently destroy work":
//
//   1. DIRTY GUARD     — after any edit, Cancel must ask instead of closing.
//   2. STAY ON CANCEL  — "Keep Editing" must not close anything.
//   3. DRAFT MIRROR    — while dirty the draft is written to localStorage.
//   4. DISCARD CLEARS  — explicitly discarding drops both editor and draft.
//   5. CRASH RECOVERY  — reloading WITHOUT closing (a crash) and reopening the
//                        song must hand the work back, and because a recovery
//                        is unsaved work by definition it must land DIRTY — so
//                        "open it to look, then close" still asks.
//
// Runs in plain-browser mode (no window.require), so the DB-backed Save path is
// deliberately not exercised here — everything under test is pure renderer state.
import { chromium } from 'playwright';

const URL = process.env.APP_URL || 'http://localhost:5173';
const DRAFT_KEY = 'kog-song-draft';

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  PASS  ${msg}`);
  else { failures += 1; console.log(`  FAIL  ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
page.on('pageerror', (e) => { failures += 1; console.log(`  FAIL  page error: ${e.message}`); });

const readDraft = () => page.evaluate((k) => localStorage.getItem(k), DRAFT_KEY);
const titleInput = () => page.getByPlaceholder('Song title');
const saveBtn = () => page.getByRole('button', { name: 'Save Song' });
// Cancel is a sibling of Save Song in the footer row — scoped so it can never
// collide with a Cancel belonging to some other dialog still in the DOM.
const cancelBtn = () => saveBtn().locator('xpath=..').getByRole('button', { name: 'Cancel' });
const editorOpen = async () => await saveBtn().isVisible().catch(() => false);

// The command center starts COLLAPSED (width 0): the Songs tab still resolves
// and reports a box, but the center workspace paints over it, so a bare click
// gets intercepted. Expand the rail first — same reason the rail button exists.
async function goToSongs() {
  const rail = page.locator('[title="Open command center"]');
  if (await rail.isVisible().catch(() => false)) {
    await rail.click();
    await page.waitForTimeout(800);
  }
  await page.getByRole('tab', { name: /Songs/ }).click();
  await page.waitForTimeout(400);
}

// Cold start -> console -> Songs library -> New Song -> Manual Builder.
async function bootToEditor() {
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Start Blank' }).click();
  await page.waitForTimeout(2000);
  await goToSongs();
  await page.locator('[title="New song"]').click();
  await page.getByRole('button', { name: /Manual Builder/ }).click();
  await titleInput().waitFor({ timeout: 15000 });
  await page.waitForTimeout(400);
}

console.log('\nSong Editor draft guard\n');

// --- 1+3: a change is mirrored to localStorage -----------------------------
await bootToEditor();
ok(!(await readDraft()), 'opening a clean song writes no draft');

await titleInput().fill('Guard Test Song');
await page.waitForTimeout(1300); // debounce is 700ms
const draft1 = await readDraft();
ok(!!draft1, 'an edit is mirrored to localStorage (crash recovery)');
if (draft1) {
  const d = JSON.parse(draft1);
  ok(d.id === null, `draft records the song id (${JSON.stringify(d.id)})`);
  ok(d.song && d.song.title === 'Guard Test Song', `draft holds the edited title ("${d.song && d.song.title}")`);
  ok(Number.isFinite(d.at) && d.at > 0, 'draft records when it was written');
}

// --- 1+2: Cancel asks, and "Keep Editing" stays ----------------------------
await cancelBtn().click();
const confirmShown = await page.getByRole('button', { name: 'Discard Changes' }).isVisible().catch(() => false);
ok(confirmShown, 'Cancel on dirty work prompts instead of closing');
const stillOpenAfterPrompt = await editorOpen();
ok(stillOpenAfterPrompt, 'the editor is still open behind the prompt');

await page.getByRole('button', { name: 'Keep Editing' }).click();
await page.waitForTimeout(300);
ok(await editorOpen(), '"Keep Editing" leaves the editor open');
ok(!!(await readDraft()), 'the draft survives "Keep Editing"');

// --- 4: explicitly discarding drops editor AND draft -----------------------
await cancelBtn().click();
await page.getByRole('button', { name: 'Discard Changes' }).click();
await page.waitForTimeout(500);
ok(!(await editorOpen()), '"Discard Changes" closes the editor');
ok(!(await readDraft()), '"Discard Changes" clears the recovery draft');

// --- 5: crash recovery — reload without closing, then reopen ---------------
await goToSongs();
await page.locator('[title="New song"]').click();
await page.getByRole('button', { name: /Manual Builder/ }).click();
await titleInput().waitFor({ timeout: 15000 });
await titleInput().fill('Recovered Song');
await page.waitForTimeout(1300);
ok(!!(await readDraft()), 'a draft exists before the simulated crash');

await page.reload({ waitUntil: 'networkidle' }); // no clean close: this is the crash
await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
await page.getByRole('button', { name: 'Start Blank' }).click();
await page.waitForTimeout(2000);
await goToSongs();
await page.locator('[title="New song"]').click();
await page.getByRole('button', { name: /Manual Builder/ }).click();
await titleInput().waitFor({ timeout: 15000 });

const recovered = await titleInput().inputValue();
ok(recovered === 'Recovered Song', `reopening hands the work back (got "${recovered}")`);
const toastShown = await page.getByText(/recovered/i).first().isVisible().catch(() => false);
ok(toastShown, 'the operator is told the work was recovered');

// A recovery is UNSAVED work: a look-then-close must still ask, otherwise this
// very feature could destroy what it just rescued.
await cancelBtn().click();
const recoveryPrompt = await page.getByRole('button', { name: 'Discard Changes' }).isVisible().catch(() => false);
ok(recoveryPrompt, 'recovered work reads as dirty — closing it still asks');

await page.getByRole('button', { name: 'Discard Changes' }).click();
await page.waitForTimeout(500);
ok(!(await editorOpen()), 'discarding the recovery closes the editor');
ok(!(await readDraft()), 'discarding the recovery clears the draft');

// --- 6: Escape takes the same guarded path as Cancel -----------------------
await goToSongs();
await page.locator('[title="New song"]').click();
await page.getByRole('button', { name: /Manual Builder/ }).click();
await titleInput().waitFor({ timeout: 15000 });
await titleInput().fill('Escape Guard Song');
await page.waitForTimeout(300);
// Escape is deliberately IGNORED while a field has focus (a rename or a colour
// picker must be able to cancel itself), so leave the field first.
await page.getByRole('heading', { name: 'Add New Song' }).click();
await page.keyboard.press('Escape');
const escPrompt = await page.getByRole('button', { name: 'Discard Changes' }).isVisible().catch(() => false);
ok(escPrompt, 'Escape on dirty work opens the same discard prompt as Cancel');
const dialogCount = await page.getByRole('button', { name: 'Discard Changes' }).count();
ok(dialogCount === 1, `exactly one prompt is open (got ${dialogCount})`);
await page.keyboard.press('Escape'); // ConfirmModal owns Escape here and cancels
await page.waitForTimeout(400);
ok(await editorOpen(), 'Escape dismissed the prompt, not the editor behind it');
ok(!!(await readDraft()), 'the draft survives the dismissed prompt');
await cancelBtn().click();
await page.getByRole('button', { name: 'Discard Changes' }).click();
await page.waitForTimeout(500);
ok(!(await editorOpen()), 'cleanup: editor closed');
ok(!(await readDraft()), 'cleanup: no draft left behind');

await browser.close();
console.log('');
console.log(failures ? `${failures} failure(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
