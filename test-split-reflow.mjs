// Re-split regression check — run with: node test-split-reflow.mjs
//
// The reported bug: paste lyrics at 1 line per block (Smart Paste), then set
// 4 in the Song Editor and press Split — nothing happened, because Split only
// ever cut and every cue already held ≤4 lines. It now merges a section's
// "(Part n)" slides back together before re-chunking, so the count is
// changeable in BOTH directions.
import { reflowCuesToLines } from './src/lib/splitReflow.js';

let failures = 0;
const fail = (msg) => { failures += 1; console.error(`  FAIL  ${msg}`); };
const cue = (label, text, extra = {}) => ({ label, text, ...extra });

// fit: marks a cue as "refit" so we can prove untouched slides keep their box
let fitted = [];
const fit = (c) => { fitted.push(c); return { ...c, refit: true }; };

const linesOf = (c) => String(c.text || '').split('\n').length;

// ---------------------------------------------------------------- 1
// The exact reported flow: 1 line per block, then re-split to 4.
{
  const verse = ['Way Lang', 'Ikaw Lang', 'Hesus', 'Pagabayawon', 'Diyos', 'Satanas', 'Amen', 'Hallelujah'];
  const start = verse.map((t, i) => cue(`Verse 1 (Part ${i + 1})`, t)); // what smart paste at 1 leaves
  fitted = [];
  const out = reflowCuesToLines(start, 4, fit);
  if (out.length !== 2) fail(`1 -> 4 expected 2 slides, got ${out.length}`);
  if (linesOf(out[0]) !== 4 || linesOf(out[1]) !== 4) fail(`1 -> 4 line counts wrong: ${out.map(linesOf)}`);
  if (out[0].label !== 'Verse 1 (Part 1)' || out[1].label !== 'Verse 1 (Part 2)') fail(`1 -> 4 labels wrong: ${out.map(c => c.label)}`);
  if (fitted.length !== 2) fail(`1 -> 4 should refit both new slides, refit ${fitted.length}`);
  console.log(`1 line/block -> 4 : ${start.length} slides become ${out.length} (${out.map(linesOf).join('+')} lines)`);
}

// ---------------------------------------------------------------- 2
// ...and back again: 4 -> 1 returns one slide per line.
{
  const start = [cue('Verse 1 (Part 1)', 'Way Lang\nIkaw Lang\nHesus\nPagabayawon'), cue('Verse 1 (Part 2)', 'Diyos\nSatanas\nAmen\nHallelujah')];
  const out = reflowCuesToLines(start, 1, fit);
  if (out.length !== 8) fail(`4 -> 1 expected 8 slides, got ${out.length}`);
  if (out.some((c) => linesOf(c) !== 1)) fail('4 -> 1 produced a slide with more than one line');
  console.log(`4 lines/slide -> 1 : ${start.length} slides become ${out.length}`);
}

// ---------------------------------------------------------------- 3
// Round trip must be lossless: 4 -> 1 -> 4 lands on the original blocks.
{
  const original = [cue('Verse 1 (Part 1)', 'Way Lang\nIkaw Lang\nHesus\nPagabayawon'), cue('Verse 1 (Part 2)', 'Diyos\nSatanas\nAmen\nHallelujah')];
  const once = reflowCuesToLines(reflowCuesToLines(original, 1, fit), 4, fit);
  if (once.map(c => c.text).join('|') !== original.map(c => c.text).join('|')) {
    fail(`round trip changed the lyrics: ${once.map(c => c.text).join(' | ')}`);
  }
  if (once.map(c => c.label).join('|') !== original.map(c => c.label).join('|')) {
    fail(`round trip changed the labels: ${once.map(c => c.label).join(' | ')}`);
  }
  console.log('round trip 4 -> 1 -> 4 : identical blocks and labels');
}

// ---------------------------------------------------------------- 4
// A Chorus between two verse parts must keep its place — only ADJACENT
// parts merge, a section never reaches across another one.
{
  const start = [
    cue('Verse 1 (Part 1)', 'Line A'),
    cue('Chorus', 'Chorus one\nChorus two'),
    cue('Verse 1 (Part 2)', 'Line B'),
  ];
  const out = reflowCuesToLines(start, 4, fit);
  const labels = out.map((c) => c.label);
  if (out.length !== 3) fail(`interleaved expected 3 slides, got ${out.length}`);
  if (labels[0] !== 'Verse 1' || labels[1] !== 'Chorus' || labels[2] !== 'Verse 1') fail(`interleaved order lost: ${labels.join(' | ')}`);
  if (out[0].text !== 'Line A') fail('interleaved: distant verse parts merged across the chorus');
  console.log('interleaved chorus : parts either side stay separate, order kept');
}

// ---------------------------------------------------------------- 5
// A section that already fits keeps the operator's box and edits untouched.
{
  const start = [cue('Bridge', 'Just one line', { box: { x: 1, y: 2, w: 3, h: 4 }, color: '#123456' })];
  fitted = [];
  const out = reflowCuesToLines(start, 4, fit);
  if (out[0] !== start[0]) fail('a fitting section was rebuilt instead of kept as-is');
  if (fitted.length !== 0) fail(`a fitting section was refit ${fitted.length} time(s)`);
  console.log('already-fitting section : kept verbatim, box and edits preserved');
}

// ---------------------------------------------------------------- 6
// Stale "(Part n)" suffix is cleared when the section fits in one slide again.
{
  const out = reflowCuesToLines([cue('Verse 1 (Part 3)', 'One line')], 4, fit);
  if (out[0].label !== 'Verse 1') fail(`stale part suffix survived: "${out[0].label}"`);
  console.log('stale part suffix : cleared');
}

// ---------------------------------------------------------------- 7
// Line accuracy: blank lines are padding, not lyric lines, so they never
// count toward the per-slide limit.
{
  const out = reflowCuesToLines([cue('Verse 1', 'A\n\nB\n\nC\n\nD')], 4, fit);
  if (out.length !== 1) fail(`blank lines inflated the count: ${out.length} slides`);
  if (linesOf(out[0]) !== 4) fail(`blank lines reached the slide: ${JSON.stringify(out[0].text)}`);
  console.log('blank lines : ignored by the count, 4 real lines on one slide');
}

// ---------------------------------------------------------------- 8
// Idempotent: pressing Split again at the same number changes nothing.
{
  const start = [cue('Verse 1', 'A\nB\nC\nD\nE\nF')];
  const once = reflowCuesToLines(start, 3, fit);
  const twice = reflowCuesToLines(once, 3, fit);
  if (JSON.stringify(once.map(c => [c.label, c.text])) !== JSON.stringify(twice.map(c => [c.label, c.text]))) {
    fail('second Split at the same number changed the blocks');
  }
  console.log('idempotent : a second Split at the same number is a no-op');
}

// ---------------------------------------------------------------- 9
// Speed: a full 60-slide song re-flows in one pass.
{
  const big = [];
  for (let v = 1; v <= 20; v++) for (let l = 1; l <= 3; l++) big.push(cue(`Verse ${v} (Part 1)`, `Line ${v}-${l}`));
  const t0 = process.hrtime.bigint();
  reflowCuesToLines(big, 4, fit);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (ms > 50) fail(`60-slide reflow took ${ms.toFixed(1)}ms`);
  console.log(`speed : 60 slides re-flowed in ${ms.toFixed(2)}ms`);
}

console.log('');
console.log(failures ? `${failures} failure(s)` : 'all checks passed');
process.exit(failures ? 1 : 0);
