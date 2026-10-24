// Render check for the responsive scale rule — run with:
//   npx vite &            (or npm run dev)
//   node test-responsive-render.mjs
//
// Renders the console at the CSS viewport each real screen ends up with
// (see electron/uiScale.js) and reports anything that would be clipped at
// the edges of the window, which was the reported bug on 1366x728.
import { chromium } from 'playwright';
import { cssViewportFor } from './electron/uiScale.js';

const URL = process.env.APP_URL || 'http://localhost:5173';

// Real window sizes (DIP) -> the CSS viewport the fit rule produces.
const CASES = [
  ['1920x1080 reference', 1920, 1040],
  ['1366x728 small laptop', 1366, 728],
  ['1280x720 minimum useful', 1280, 720],
];

const browser = await chromium.launch();
let problems = 0;

for (const [label, w, h] of CASES) {
  const { zoom, width, height } = cssViewportFor({ width: w, height: h });
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(URL, { waitUntil: 'networkidle' });
  // Splash runs 5s; the check is about the CONSOLE, so get past it and the
  // welcome card to the real three-column workspace first.
  await page.getByRole('button', { name: 'Start Blank' }).waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Start Blank' }).click();
  await page.waitForTimeout(2500); // console mount / fonts / animations

  const report = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clipped = [];
    let hiddenByAncestor = 0;
    // An element parked outside an overflow-clipped ancestor is deliberately
    // off-canvas (the console parks several strips that way) — it is not a
    // component the operator lost. Only content that reaches the window edge
    // UNclipped is a real problem.
    const hiddenBy = (el, r) => {
      let p = el.parentElement;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        const clipX = cs.overflowX !== 'visible';
        const clipY = cs.overflowY !== 'visible';
        if (clipX || clipY) {
          const pr = p.getBoundingClientRect();
          if (clipX && (r.right > pr.right + 2 || r.left < pr.left - 2)) return true;
          if (clipY && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2)) return true;
        }
        p = p.parentElement;
      }
      return false;
    };
    const all = document.querySelectorAll('body *');
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      // Off the right or bottom edge of the window, or scrolled out of a
      // zero-height box: anything an operator cannot reach.
      if (r.right > vw + 2 || r.bottom > vh + 2) {
        if (hiddenBy(el, r)) { hiddenByAncestor += 1; continue; }
        clipped.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 40),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
          pos: cs.position,
          z: cs.zIndex,
          tf: (cs.transform || 'none').slice(0, 30),
          parent: (el.parentElement && el.parentElement.tagName.toLowerCase()) || '-',
          text: (el.textContent || '').trim().slice(0, 40),
        });
      }
    }
    return {
      vw,
      vh,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
      // The bottom-dock control only exists on the real console — guards the
      // check against silently measuring the splash or welcome card again.
      // (The control was renamed from "Projector outputs" to "Manage live
      // outputs and displays"; accept both so an older build still passes.)
      consoleMounted: !!document.querySelector('[title="Projector outputs"], [title="Manage live outputs and displays"]'),
      hiddenByAncestor,
      clipped: clipped.slice(0, 12),
      clippedCount: clipped.length,
    };
  });

  const shot = `test-results/scale-${w}x${h}.png`;
  await page.screenshot({ path: shot });

  console.log(`\n${label} -> window ${w}x${h} @ zoom ${zoom} -> viewport ${width}x${height}`);
  console.log(`  console mounted: ${report.consoleMounted}`);
  console.log(`  page scroll size: ${report.scrollW}x${report.scrollH} (viewport ${report.vw}x${report.vh})`);
  console.log(`  elements past the edge: ${report.clippedCount} (${report.hiddenByAncestor} parked off-canvas by an overflow-clipped parent)`);
  for (const c of report.clipped) console.log(`    ${c.tag}.${c.cls} right=${c.right} bottom=${c.bottom} pos=${c.pos} z=${c.z} tf=${c.tf} parent=${c.parent} "${c.text}"`);
  console.log(`  screenshot: ${shot}`);

  if (report.clippedCount > 0) problems += 1;
  if (!report.consoleMounted) problems += 1;
  await page.close();
}

await browser.close();
console.log(problems ? `\n${problems} viewport(s) with clipped content` : '\nno clipped content at any size');
process.exit(problems ? 1 : 0);
