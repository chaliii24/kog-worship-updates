// Title-card end-to-end test — drives the REAL Electron app (operator window +
// the actual projector output window), not a component harness.
//
//   npm run dev OR npx vite --port 5173 --strictPort     # dev server
//   node test-title-card-ui.mjs
//
// The test boots Electron with a THROWAWAY appData folder (see
// tests/title-card-main.cjs), so it can never touch the operator's real song
// library. It creates a song, applies every card, fires the title on the wall
// and reads the output window's DOM + screenshots.
import { _electron as electron } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

const URL = process.env.APP_URL || 'http://localhost:5173';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : `  ${extra}`}`);
};

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'kog-title-card-test-'));
fs.mkdirSync('test-results', { recursive: true });

const app = await electron.launch({
  args: [path.resolve('tests/title-card-main.cjs')],
  cwd: process.cwd(),
  env: { ...process.env, ELECTRON_START_URL: URL, KOG_TEST_APPDATA: userData },
});

const errors = [];
const watch = (w, tag) => {
  w.on('console', (m) => { if (m.type() === 'error') errors.push(`${tag} console: ${m.text()}`); });
  w.on('pageerror', (e) => errors.push(`${tag} pageerror: ${e.message}`));
};

const page = await app.firstWindow();
watch(page, 'operator');

try {
  await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 25000 });
  await page.getByRole('button', { name: 'Start Blank' }).click();
  await page.waitForTimeout(1800);

  // ---- create a song ------------------------------------------------------
  await page.getByRole('button', { name: 'Open song library' }).click();
  await page.waitForTimeout(400);
  await page.locator('button[title="New song"]').click();
  await page.getByRole('button', { name: /Manual Builder/ }).click();
  await page.getByPlaceholder('Song title').waitFor({ timeout: 10000 });
  await page.getByPlaceholder('Song title').fill('Who Else');
  await page.getByPlaceholder('Artist').fill('KOG Worship');

  const gotoTitle = async () => {
    const counter = page.locator('span', { hasText: /^1 of \d+$/ }).first();
    await counter.waitFor({ timeout: 5000 });
    await counter.locator('xpath=preceding-sibling::button[1]').click();
    await page.getByText('Title Slide', { exact: true }).first().waitFor({ timeout: 5000 });
  };
  await gotoTitle();

  // ---- picker present only on the title slide -----------------------------
  await page.locator('[data-testid="title-card-editorial"]').waitFor({ timeout: 5000 });
  ok('title card picker offered on the title slide',
    (await page.locator('[data-testid^="title-card-"]').count()) === 4);

  await page.locator('[data-testid="title-card-editorial"]').click();
  await page.waitForTimeout(350);
  await page.getByPlaceholder('e.g. PASSION 2025').fill('LIVE FROM PASSION 2025');
  await page.getByPlaceholder('e.g. Atlanta, Georgia, USA').fill('Atlanta, Georgia, USA');
  await page.waitForTimeout(600);

  // editor canvas: the chrome and both card lines are drawn under the words
  const editorChrome = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div[aria-hidden="true"]'))
      .find((n) => n.textContent.includes('Who Else') || n.textContent.includes('Atlanta, Georgia, USA'));
    return el ? el.textContent : '';
  });
  ok('editor canvas draws artist / event / venue', 
    /KOG Worship/i.test(editorChrome) && /LIVE FROM PASSION 2025/i.test(editorChrome) && /Atlanta, Georgia, USA/i.test(editorChrome),
    JSON.stringify(editorChrome));
  ok('event caption is de-duplicated on the canvas',
    (editorChrome.match(/LIVE FROM/gi) || []).length === 1, JSON.stringify(editorChrome));
  await page.screenshot({ path: 'test-results/title-card-editor.png' });

  // picker disappears on a lyric slide
  await page.locator('span', { hasText: /^Title Slide$/ }).first().locator('xpath=following-sibling::button[1]').click();
  await page.waitForTimeout(400);
  ok('picker hidden on a lyric slide', (await page.locator('[data-testid^="title-card-"]').count()) === 0);
  await gotoTitle();

  // ---- save (new songs keep the editor open once) and start the wall ------
  const saveAndClose = async () => {
    await page.getByRole('button', { name: 'Save Song' }).click();
    await page.waitForTimeout(1600);
    if (await page.getByRole('button', { name: 'Save Song' }).count()) {
      await page.getByRole('button', { name: 'Save Song' }).click();
      await page.waitForTimeout(1600);
    }
  };
  await saveAndClose();
  ok('song saved and editor closed', (await page.getByRole('button', { name: 'Save Song' }).count()) === 0);

  // the console's title tile must be a picture of the wall (same chrome)
  await page.waitForTimeout(800);
  const tile = await page.evaluate(() => {
    const face = document.querySelector('.kog-slide-grid .kog-slide-face');
    if (!face) return null;
    const chrome = Array.from(face.querySelectorAll('div[aria-hidden="true"]'))
      .find((n) => n.textContent.includes('LIVE FROM'));
    if (!chrome) return { found: false, text: face.innerText };
    const fr = face.getBoundingClientRect();
    const inside = Array.from(chrome.children).every((k) => {
      const r = k.getBoundingClientRect();
      return r.left >= fr.left - 2 && r.right <= fr.right + 2 && r.top >= fr.top - 2 && r.bottom <= fr.bottom + 2;
    });
    return { found: true, inside, text: chrome.textContent };
  });
  ok('console title tile draws the card framing', !!tile && tile.found, JSON.stringify(tile));
  ok('console tile card framing is not clipped', !!tile && tile.inside, JSON.stringify(tile));

  await page.locator('button[title="Projector output is stopped — click to start it"]').click();
  await page.waitForTimeout(2500);
  const wall = app.windows().find((w) => w.url().includes('/output/'));
  ok('projector output window opened', !!wall, app.windows().map((w) => w.url()).join(', '));
  if (!wall) throw new Error('no projector output window');
  watch(wall, 'wall');
  await wall.waitForTimeout(1200);

  const fireTitle = async () => {
    await page.getByText('Who Else', { exact: true }).first().click();
    await page.waitForTimeout(900);
    await page.locator('.kog-slide-grid > div').first().click();
    await wall.waitForTimeout(1600);
  };

  const readWall = () => wall.evaluate(() => {
    const chrome = Array.from(document.querySelectorAll('div[aria-hidden="true"]'))
      .find((n) => n.textContent.trim().length > 0) || null;
    const rules = chrome
      ? Array.from(chrome.children).filter((c) => !c.textContent.trim()).map((c) => c.getBoundingClientRect())
      : [];
    return {
      body: document.body.innerText,
      chrome: chrome ? chrome.textContent : '',
      rules: rules.length,
      rulesInside: rules.every((r) => r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1),
      size: [window.innerWidth, window.innerHeight],
    };
  });

  await fireTitle();
  let w = await readWall();
  ok('wall: editorial title', /Who Else/.test(w.body));
  ok('wall: editorial artist', /KOG Worship/i.test(w.body));
  ok('wall: editorial event', /LIVE FROM PASSION 2025/i.test(w.body));
  ok('wall: editorial venue', /Atlanta, Georgia, USA/i.test(w.body));
  ok('wall: event caption not repeated', (w.body.match(/LIVE FROM/g) || []).length === 1, w.body.replace(/\n/g, ' | '));
  ok('wall: editorial draws 2 rules inside the frame', w.rules === 2 && w.rulesInside, JSON.stringify(w));
  await wall.screenshot({ path: 'test-results/title-card-wall-editorial.png' });

  // ---- the other cards ---------------------------------------------------
  const applyCard = async (id) => {
    await page.locator('button[title="Edit this song"]').click();
    await page.getByPlaceholder('Song title').waitFor({ timeout: 8000 });
    await gotoTitle();
    await page.locator(`[data-testid="title-card-${id}"]`).click();
    await page.waitForTimeout(350);
    await saveAndClose();
    await fireTitle();
    return readWall();
  };

  w = await applyCard('lower-third');
  ok('wall: lower-third title + rules', /Who Else/.test(w.body) && w.rules === 1 && w.rulesInside, JSON.stringify(w));
  await wall.screenshot({ path: 'test-results/title-card-wall-lower-third.png' });

  w = await applyCard('spotlight');
  ok('wall: spotlight title + rule', /Who Else/.test(w.body) && w.rules === 1 && w.rulesInside, JSON.stringify(w));
  await wall.screenshot({ path: 'test-results/title-card-wall-spotlight.png' });

  w = await applyCard('classic');
  ok('wall: classic keeps the legacy artist line', /Song By:\s*KOG Worship/i.test(w.body) && w.rules === 0, JSON.stringify(w));
  await wall.screenshot({ path: 'test-results/title-card-wall-classic.png' });

  // ---- a lyric slide must never inherit the card framing -----------------
  await page.locator('.kog-slide-grid > div').nth(1).click();
  await wall.waitForTimeout(1500);
  w = await readWall();
  ok('wall: no card chrome on a lyric slide', !/LIVE FROM PASSION 2025/.test(w.body) && w.rules === 0, JSON.stringify(w));

  // ---- the two new bundled fonts actually load ---------------------------
  const fonts = await page.evaluate(async () => {
    const want = ['Cormorant Garamond', 'Reenie Beanie'];
    return Promise.all(want.map(async (f) => {
      try { await document.fonts.load(`16px "${f}"`); } catch { /* ignore */ }
      return { f, loaded: document.fonts.check(`16px "${f}"`) };
    }));
  });
  for (const f of fonts) ok(`font available in the console: ${f.f}`, f.loaded);

  // ---- new font + Regular/Italic controls reach the wall -----------------
  await page.locator('button[title="Edit this song"]').click();
  await page.getByPlaceholder('Song title').waitFor({ timeout: 8000 });
  await gotoTitle();

  await page.locator('button', { hasText: 'CMG Sans Wide (Default)' }).first().click();
  await page.getByPlaceholder('Search fonts…').fill('Cormorant');
  const fontRow = page.getByText('Cormorant Garamond', { exact: true });
  await fontRow.scrollIntoViewIfNeeded().catch(() => {});
  const fontBox = await fontRow.boundingBox();
  // A real pointer press on the row. The old rows were defined inside the
  // picker, so hovering remounted them and this mousedown landed on a
  // detached node (the click was silently lost) — see FontPicker's FontRow.
  await page.mouse.click(fontBox.x + fontBox.width / 2, fontBox.y + fontBox.height / 2);
  await page.waitForTimeout(500);

  const titleFont = () => page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('*')).find((n) => n.children.length === 0
      && n.textContent.trim() === 'Who Else'
      && parseFloat(getComputedStyle(n).fontSize) > 40);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { family: cs.fontFamily, style: cs.fontStyle };
  });

  let tf = await titleFont();
  ok('Cormorant Garamond applied on the editing canvas', !!tf && /Cormorant Garamond/i.test(tf.family), JSON.stringify(tf));

  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await page.waitForTimeout(300);
  tf = await titleFont();
  ok('Italic button italicises the canvas', !!tf && tf.style === 'italic', JSON.stringify(tf));

  await page.getByRole('button', { name: 'Regular', exact: true }).click();
  await page.waitForTimeout(300);
  tf = await titleFont();
  ok('Regular button straightens the canvas', !!tf && tf.style !== 'italic', JSON.stringify(tf));

  await page.getByRole('button', { name: 'Italic', exact: true }).click();
  await page.waitForTimeout(300);
  await saveAndClose();
  await fireTitle();
  const wallFont = await wall.evaluate(() => {
    const hits = Array.from(document.querySelectorAll('*'))
      .filter((n) => n.children.length === 0 && /Who Else/.test(n.textContent) && getComputedStyle(n).fontFamily.includes('Cormorant'))
      .map((n) => ({ text: n.textContent.trim(), family: getComputedStyle(n).fontFamily, style: getComputedStyle(n).fontStyle }));
    return hits;
  });
  ok('wall draws the title in Cormorant Garamond, true italic',
    wallFont.length > 0 && wallFont.every((h) => h.style === 'italic'),
    JSON.stringify(wallFont));
  await wall.screenshot({ path: 'test-results/title-card-wall-cormorant.png' });

  await page.screenshot({ path: 'test-results/title-card-operator.png' });
} finally {
  await app.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (errors.length) {
  console.log('\nconsole/page errors:');
  errors.forEach((e) => console.log('  ' + e));
}
process.exit(failed.length || errors.length ? 1 : 0);
