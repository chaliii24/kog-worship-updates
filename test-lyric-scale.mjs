// Verifies the inline per-line / per-word typography in src/lib/lyrics.jsx.
//   node test-lyric-scale.mjs
//
// The two things that actually matter here:
//   1. a cue with NO markers must render exactly as it did before the feature
//      (same font size, same DOM — no stray <span>s),
//   2. a cue WITH markers must be measured against its real per-line sizes so
//      the auto-fit never overflows the box.
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import ReactDOMServer from 'react-dom/server';

const { renderToStaticMarkup } = ReactDOMServer;

const here = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(here, 'node_modules', '.cache');
const outFile = path.join(cacheDir, 'kog-lyric-test.mjs');
mkdirSync(cacheDir, { recursive: true });

buildSync({
  entryPoints: [path.join(here, 'src', 'lib', 'lyrics.jsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: outFile,
  external: ['react'],
  jsx: 'transform',
  logLevel: 'silent',
});

const L = await import(pathToFileURL(outFile).href);
const { applyCaseTransform, computeLyricsFontSize, parseSegments, stripMarkup, renderLyricsLayout, lineIndexAt, lineSpanRange, ingestSpans, emitSpans, remapSpans, applySpanPatch, spanCovers, rangeAttrs, lineScales, restyleLineScales, LINE_SCALE_PRESETS } = L;

let pass = 0;
let fail = 0;
const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { pass += 1; console.log(`  ok    ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`); }
};
const ok = (name, cond) => eq(name, !!cond, true);

// ---------------------------------------------------------------------------
// The algorithm as it was BEFORE per-line scales existed. Used to prove that
// unmarked text still produces the identical number.
const legacyFontSize = (text, st, box) => {
  const lh = st.lineHeight || 1.05;
  const pad = st.fill ? 6 : Math.max(0, Number(st.pad ?? 10) || 0);
  const boxW = Math.max(200, (box.w || 1280) - pad * 2);
  const maxH = Math.max(40, Math.min((box.h || 640) - pad * 2, 700));
  const baseSize = Math.max(12, Math.min(Number(st.size) || 110, 720));
  const lines = applyCaseTransform(text || '', st.caseMode || 'none').split('\n');
  const totalHeight = (base) => lines.reduce((h, l) => {
    if (!l.trim()) return h + base * lh * 0.7;
    const cpl = Math.max(6, boxW / (base * 0.55));
    const wrapped = Math.max(1, Math.ceil(l.length / cpl));
    return h + wrapped * base * lh;
  }, 0);
  let fs = baseSize;
  if (st.fill) {
    const fillMax = Math.max(baseSize, Math.min(Number(st.fillMax) || 160, 720));
    const fillMin = Math.max(14, Math.min(Number(st.fillMin) || 18, fillMax));
    let lo = fillMin;
    let hi = fillMax;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (totalHeight(mid) <= maxH) lo = mid; else hi = mid;
    }
    fs = lo;
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(12, fs * (maxH / actual) * 0.97);
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const actual = totalHeight(fs);
      if (!actual || actual <= maxH) break;
      fs = Math.max(14, fs * (maxH / actual));
    }
  }
  return Math.round(fs);
};

const ST = {
  font: 'Inter, sans-serif', size: 200, lineHeight: 1.05, align: 'center',
  valign: 'middle', color: '#ffffff', caseMode: 'none', bold: true, pad: 10,
};
const TIGHT = { x: 0, y: 0, w: 1120, h: 300 }; // small enough that shrinking kicks in
const CRAMPED = { x: 0, y: 0, w: 1120, h: 200 }; // tall single line, no room to spare
const WIDE = { x: 0, y: 0, w: 1120, h: 480 };

const divSizes = (html) => (html.match(/<div[^>]*?font-size:\s*([\d.]+)px/g) || [])
  .map((tag) => parseFloat(tag.match(/font-size:\s*([\d.]+)px/)[1]));

// ---------------------------------------------------------------------------
console.log('\nparseSegments — markers become runs');

eq('plain line is one run',
  parseSegments('JESUS').map((s) => [s.t, s.scale, s.bold]),
  [['JESUS', 1, false]]);

eq('line scale',
  parseSegments('{size=0.55}ONLY YOU').map((s) => [s.t, s.scale]),
  [['ONLY YOU', 0.55]]);

eq('bare number shorthand',
  parseSegments('{1.6}JESUS').map((s) => [s.t, s.scale]),
  [['JESUS', 1.6]]);

eq('scope runs to end of line',
  parseSegments('{size=0.5}A B').map((s) => [s.t, s.scale]),
  [['A B', 0.5]]);

eq('{/} closes the scope early',
  parseSegments('{size=0.5}A {/}B').map((s) => [s.t, s.scale]),
  [['A ', 0.5], ['B', 1]]);

eq('weight + tracking',
  parseSegments('{size=0.55,w=300,track=0.2}KICKER'),
  [{ bold: false, scale: 0.55, weight: 300, track: 0.2, t: 'KICKER' }]);

eq('font stack keeps its commas',
  parseSegments('{font=Inter|sans-serif}X')[0].font,
  'Inter, sans-serif');

eq('**bold** still works',
  parseSegments('a **b** c').map((s) => [s.t, s.bold]),
  [['a ', false], ['b', true], [' c', false]]);

eq('marker nested inside bold',
  parseSegments('**{size=2}JESUS**').map((s) => [s.t, s.scale, s.bold]),
  [['JESUS', 2, true]]);

eq('adjacent same-style runs merge',
  parseSegments('{size=2}A{size=2}B').map((s) => [s.t, s.scale]),
  [['AB', 2]]);

console.log('\nparseSegments — survives the case transform');

eq('upper case mode',
  parseSegments(applyCaseTransform('{size=0.55}only you', 'upper')).map((s) => [s.t, s.scale]),
  [['ONLY YOU', 0.55]]);

eq('title case mode',
  parseSegments(applyCaseTransform('{size=0.55}only you', 'title')).map((s) => [s.t, s.scale]),
  [['Only You', 0.55]]);

console.log('\nstripMarkup — raw-text surfaces must never see the markers');

eq('leading marker + marker-free line',
  stripMarkup('{size=0.55}ONLY YOU\nJESUS'),
  'ONLY YOU\nJESUS');

eq('leading marker that carries a space',
  stripMarkup('{size=0.55} ONLY YOU'),
  'ONLY YOU');

eq('bold markers are unwrapped (this was leaking ** as literals before)',
  stripMarkup('**JESUS**\nsave **us**'),
  'JESUS\nsave us');

eq('mid-line marker leaves its spacing alone',
  stripMarkup('a {/} b'),
  'a  b');

eq('empty / null safe',
  [stripMarkup(''), stripMarkup(null), stripMarkup(undefined)],
  ['', '', '']);

console.log('\ncomputeLyricsFontSize — unmarked text must be unchanged');

const UNMARKED = [
  'JESUS',
  'Amazing grace how sweet the sound',
  'VERSE 1\nand then a second line\n\nthird stanza',
  'long line that has to wrap because it keeps going and going well past the box width at this size',
];
for (const t of UNMARKED) {
  eq(`identical to legacy for: ${t.slice(0, 34)}`,
    computeLyricsFontSize(t, ST, TIGHT), legacyFontSize(t, ST, TIGHT));
  eq(`identical to legacy (fill): ${t.slice(0, 34)}`,
    computeLyricsFontSize(t, { ...ST, fill: true, fillMax: 160, fillMin: 18 }, TIGHT),
    legacyFontSize(t, { ...ST, fill: true, fillMax: 160, fillMin: 18 }, TIGHT));
}
// `**bold**` is now measured on the text that actually renders (the asterisks
// never did), so the estimate is truer than the old raw-length one — and it
// must never shrink the block MORE than before, or an existing song could
// suddenly fit differently.
ok('**bold** cue never shrinks more than it used to',
  computeLyricsFontSize('save **us** today', ST, TIGHT) >= legacyFontSize('save **us** today', ST, TIGHT));
console.log('\ncomputeLyricsFontSize — marked text is measured against real sizes');

const LEAD = '{size=0.55}ONLY YOU\nJESUS';
const flat = computeLyricsFontSize('ONLY YOU\nJESUS', ST, TIGHT);
const scaled = computeLyricsFontSize(LEAD, ST, TIGHT);
ok(`a 0.55x lead line frees height for a bigger base (${scaled} > ${flat})`, scaled > flat);

// With the old uniform maths the lead line would have been measured at full
// size, so the block would have been shrunk more than necessary.
ok('marked text still fits the box', computeLyricsFontSize(LEAD, { ...ST, fill: true, fillMax: 160, fillMin: 18 }, TIGHT) >= 14);

const big = computeLyricsFontSize('{size=1.6}JESUS', { ...ST, size: 120 }, CRAMPED);
ok(`a 1.6x line shrinks the base so the whole block still fits (${big} < 120)`, big < 120);
// ...and the container it lands on must be base x lineMax, so the keyword
// really is 1.6x the block size the auto-fit settled on.
const bigHtml = renderToStaticMarkup(renderLyricsLayout('{size=1.6}JESUS', { ...ST, size: 120 }, CRAMPED));
ok('oversized line container = base x lineMax', new RegExp(`font-size:\\s*${big * 1.6}px`).test(bigHtml));

console.log('\nrenderLyricsLayout — DOM');

const plainHtml = renderToStaticMarkup(renderLyricsLayout('JESUS', ST, WIDE));
const plainSize = computeLyricsFontSize('JESUS', ST, WIDE);
ok('unmarked line carries the computed size',
  new RegExp(`font-size:\\s*${plainSize}px`).test(plainHtml));
ok('unmarked line has no run <span> wrapper (DOM unchanged from before)',
  !/font-size:\s*[\d.]+em/.test(plainHtml));
ok('unmarked line renders the text bare',
  /<span>JESUS<\/span>/.test(plainHtml));

const leadHtml = renderToStaticMarkup(renderLyricsLayout(LEAD, ST, WIDE));
const leadSize = computeLyricsFontSize(LEAD, ST, WIDE);
const leadDivs = divSizes(leadHtml);
eq('two lines, each with its own font size', leadDivs.length, 2);
ok(`lead line div is 0.55x the block (${leadDivs[0]} vs ${leadSize})`,
  Math.abs(leadDivs[0] - leadSize * 0.55) < 0.01);
ok(`keyword line div is the full block size (${leadDivs[1]} vs ${leadSize})`,
  Math.abs(leadDivs[1] - leadSize) < 0.01);

const mixedHtml = renderToStaticMarkup(renderLyricsLayout('{size=0.55}ONLY {size=1.6}YOU', ST, WIDE));
ok('mixed line puts the big run on the container', /font-size:\s*[\d.]+px/.test(mixedHtml));
ok('small run scales down in em relative to the container',
  mixedHtml.includes(`font-size:${0.55 / 1.6}em`)); // 0.55 / 1.6
ok('big run needs no wrapper of its own', />\s*YOU\s*<\//.test(mixedHtml) || mixedHtml.includes('>YOU</span>'));

const boldHtml = renderToStaticMarkup(renderLyricsLayout('**JESUS**', ST, WIDE));
ok('**bold** still renders as <b>', boldHtml.includes('<b>JESUS</b>'));

const gradHtml = renderToStaticMarkup(renderLyricsLayout('{color=#f0b429}JESUS', { ...ST, gradient: true, gradientAngle: 180, gradientColor1: '#fff', gradientColor2: '#93c5fd' }, WIDE));
ok('per-run colour survives a gradient',
  gradHtml.includes('#f0b429') && gradHtml.includes('-webkit-text-fill-color:#f0b429'));

const tickerHtml = renderToStaticMarkup(renderLyricsLayout('{size=0.55}a\nb', { ...ST, layoutMode: 'ticker', tickerSpeed: 18 }, WIDE));
ok('ticker path renders without throwing', tickerHtml.includes('kogTicker'));
ok('ticker sizes its strip to the biggest run', /font-size:\s*[\d.]+px/.test(tickerHtml));

console.log('\nspans — markers stay out of what the editor shows');

// THE BUG: the marker used to land in the textarea, so a volunteer typing a
// song saw `{SIZE=0.55}WAY LAING SIMBAHON` instead of their lyrics. The
// editor now edits the clean projection and splices the markers back.
const IN = ingestSpans('{size=0.55}ONLY YOU\nJESUS\n{size=1.6}JESUS!');
eq('ingest strips the marker from the text that gets typed into', IN.text, 'ONLY YOU\nJESUS\nJESUS!');
eq('  and hands back a span covering each marked line', IN.spans,
  [{ from: 0, to: 8, attrs: { scale: 0.55 } }, { from: 15, to: 21, attrs: { scale: 1.6 } }]);
eq('  so the editable text never contains a marker', IN.text.includes('{'), false);
eq('ingest of marker-free text is a no-op', ingestSpans('WAY LAING SIMBAHON'), { text: 'WAY LAING SIMBAHON', spans: [] });
eq('  for the empty string too', ingestSpans(''), { text: '', spans: [] });
eq('  and never throws on null', ingestSpans(null), { text: '', spans: [] });
eq('  or on a lone newline (empty first line)', ingestSpans('\nB'), { text: '\nB', spans: [] });

const OUT = emitSpans('ONLY YOU\nJESUS', [{ from: 0, to: 8, attrs: { scale: 0.55 } }]);
eq('emit puts the marker back, and only where one belongs', OUT, '{size=0.55}ONLY YOU\nJESUS');
eq('  no spans means no markers at all', emitSpans('A\nB', []), 'A\nB');
eq('  a missing span array is treated as all-normal', emitSpans('A', undefined), 'A');
eq('  and empty in is empty out', emitSpans('', []), '');
eq('  as is null', emitSpans(null, []), '');

// The round trip is what makes the split safe: whatever the editor commits has
// to render exactly as if the marker had never been touched.
const RT = ingestSpans('{size=0.55}ONLY YOU\n{size=1.6}JESUS');
eq('round trip emits what it was given', emitSpans(RT.text, RT.spans), '{size=0.55}ONLY YOU\n{size=1.6}JESUS');
eq('round trip renders byte-identically to the original',
  renderToStaticMarkup(renderLyricsLayout(emitSpans(RT.text, RT.spans), ST, WIDE)),
  renderToStaticMarkup(renderLyricsLayout('{size=0.55}ONLY YOU\n{size=1.6}JESUS', ST, WIDE)));
const PLAIN = ingestSpans('JESUS\namazing grace');
eq('an untouched song survives byte-identically', emitSpans(PLAIN.text, PLAIN.spans), 'JESUS\namazing grace');
const BOLDRT = ingestSpans('**JESUS**');
eq('bold written with ** survives the round trip as **',
  emitSpans(BOLDRT.text, BOLDRT.spans), '**JESUS**');
const MIXRT = ingestSpans('{size=0.55}**JESUS**');
eq('and a size + bold line comes back byte-identical too',
  emitSpans(MIXRT.text, MIXRT.spans), '{size=0.55}**JESUS**');

// Every marker belongs to the rendering, not to the textarea — including the
// ones that are not sizes. None of them may leak into what is typed into.
const KEEP = ingestSpans('{size=0.55,w=300}KICKER\n{color=#f0b429}gold');
eq('ingest hides the WHOLE marker from the text', KEEP.text, 'KICKER\ngold');
eq('  and keeps both keys as spans', KEEP.spans, [
  { from: 0, to: 6, attrs: { scale: 0.55, weight: 300 } },
  { from: 7, to: 11, attrs: { color: '#f0b429' } },
]);
eq('re-emitting that one is byte-stable', emitSpans(KEEP.text, KEEP.spans), '{size=0.55,w=300}KICKER\n{color=#f0b429}gold');
eq('re-emitting still renders the same runs as the hand-written original',
  parseSegments(emitSpans(KEEP.text, KEEP.spans)),
  parseSegments('{size=0.55,w=300}KICKER\n{color=#f0b429}gold'));

console.log('\nselection typography — style exactly what was highlighted');

// Highlight "SIMBAHON" in a plain line and size it down. The marker lands in
// cue.text; the volunteer only ever sees their own words.
const SEL = applySpanPatch([], 10, 18, { scale: 0.55 });
eq('a patch over a highlight becomes one span', SEL, [{ from: 10, to: 18, attrs: { scale: 0.55 } }]);
eq('the emitted line styles only the highlight', emitSpans('WAY LAING SIMBAHON', SEL), 'WAY LAING {size=0.55}SIMBAHON');
const SELRT = ingestSpans('WAY LAING {size=0.55}SIMBAHON');
eq('  which ingests back to exactly that span', SELRT.spans, [{ from: 10, to: 18, attrs: { scale: 0.55 } }]);
eq('  and the editor never sees the marker', SELRT.text, 'WAY LAING SIMBAHON');
eq('  re-emitting it is byte-stable', emitSpans(SELRT.text, SELRT.spans), 'WAY LAING {size=0.55}SIMBAHON');

const B = applySpanPatch([], 4, 9, { bold: true });
eq('bold over a highlight stays inside the highlight', emitSpans('WAY LAING SIMBAHON', B), 'WAY **LAING** SIMBAHON');
const U = applySpanPatch([], 4, 9, { underline: true });
eq('underline over a highlight closes itself afterwards', emitSpans('WAY LAING SIMBAHON', U), 'WAY {underline=1}LAING{/} SIMBAHON');
eq('  and that round trips byte-identically',
  (() => { const r = ingestSpans(emitSpans('WAY LAING SIMBAHON', U)); return emitSpans(r.text, r.spans); })(),
  'WAY {underline=1}LAING{/} SIMBAHON');

// A whole-line scale and an inline style live in the same array, so a line can
// be small AND have one bolded keyword.
const LINE_AND_RUN = applySpanPatch(applySpanPatch([], 0, 18, { scale: 0.55 }), 4, 9, { bold: true });
eq('a line scale plus an inline bold nests cleanly',
  emitSpans('WAY LAING SIMBAHON', LINE_AND_RUN), '{size=0.55}WAY **LAING** SIMBAHON');
const MIXED_SCALE = applySpanPatch(applySpanPatch([], 0, 18, { scale: 0.55 }), 4, 9, { scale: 1.5 });
eq('a patch inside a styled line replaces the size only there',
  rangeAttrs(MIXED_SCALE, 4, 9).scale, 1.5);
eq('  and the rest of the line keeps its own size',
  rangeAttrs(MIXED_SCALE, 0, 4).scale, 0.55);

// A highlight can run across a line break. Each line keeps the part it owns,
// because markers have never crossed a newline.
const CROSS_FULL = applySpanPatch([], 0, 18, { scale: 0.55 });
eq('a selection across a line break styles both lines',
  emitSpans('WAY LAING\nSIMBAHON', CROSS_FULL),
  '{size=0.55}WAY LAING\n{size=0.55}SIMBAHON');
const CROSS_PART = applySpanPatch([], 4, 14, { bold: true });
eq('  and one that stops mid-line only styles what it covers',
  emitSpans('WAY LAING\nSIMBAHON', CROSS_PART),
  'WAY **LAING**\n**SIMB**AHON');
eq('  which round trips back to the same rendering',
  (() => { const r = ingestSpans(emitSpans('WAY LAING\nSIMBAHON', CROSS_PART)); return emitSpans(r.text, r.spans); })(),
  'WAY **LAING**\n**SIMB**AHON');

eq('toggling the same flag off clears the span', applySpanPatch(B, 4, 9, { bold: false }), []);
eq('a patch that clears and sets at once does both',
  applySpanPatch(applySpanPatch([], 0, 10, { bold: true }), 4, 9, { underline: true }).length, 3);
eq('a patch outside any span still lands', applySpanPatch([], 0, 4, { strike: true }), [{ from: 0, to: 4, attrs: { strike: true } }]);

console.log('\nspanCovers / lineSpanRange — what a button lights up on');

eq('a flag over the whole range reads as on', spanCovers(B, 4, 9, 'bold'), true);
eq('  but not one character past its edge', spanCovers(B, 4, 10, 'bold'), false);
eq('  and not one before it', spanCovers(B, 3, 9, 'bold'), false);
eq('a caret sitting inside a styled run still reads as on', spanCovers(B, 5, 5, 'bold'), true);
eq('a caret on unstyled text reads as off', spanCovers(B, 0, 1, 'bold'), false);
eq('an unstyled range never reports a style', spanCovers([], 0, 5, 'bold'), false);

eq('range of line 0', lineSpanRange('AB\nCD', 0), [0, 2]);
eq('range of line 1', lineSpanRange('AB\nCD', 1), [3, 5]);
eq('an empty line is a zero-width range', lineSpanRange('AB\n\nCD', 1), [3, 3]);
eq('an out-of-range line clamps', lineSpanRange('AB', 9), [0, 2]);

console.log('\nremapSpans — styles follow their characters through an edit');

eq('typing inside a styled word keeps the whole word styled',
  remapSpans('SIMBAHON', 'SIMBXAHON', [{ from: 0, to: 8, attrs: { bold: true } }]),
  [{ from: 0, to: 9, attrs: { bold: true } }]);
eq('deleting inside a styled word keeps what is left styled',
  remapSpans('SIMBAHON', 'SIMAHON', [{ from: 0, to: 8, attrs: { bold: true } }]),
  [{ from: 0, to: 7, attrs: { bold: true } }]);
eq('splitting a line keeps the style on the line it came from',
  remapSpans('WAY LAING', 'WAY LAING\nMORE', [{ from: 0, to: 9, attrs: { scale: 0.55 } }]),
  [{ from: 0, to: 9, attrs: { scale: 0.55 } }]);
eq('deleting line 1 does NOT slide line 2 style onto the new line 1',
  remapSpans('A\nB\nC', 'B\nC', [
    { from: 0, to: 1, attrs: { scale: 0.55 } },
    { from: 2, to: 3, attrs: { scale: 1.6 } },
  ]),
  [{ from: 0, to: 1, attrs: { scale: 1.6 } }]);
eq('replacing text that was only PARTLY styled does not restyle the new words',
  remapSpans('SIMBAHON!', 'JESUS', [{ from: 0, to: 8, attrs: { bold: true } }]), []);
eq('replacing the WHOLE styled range keeps its style on the new words',
  remapSpans('SIMBAHON', 'JESUS', [{ from: 0, to: 8, attrs: { bold: true } }]),
  [{ from: 0, to: 5, attrs: { bold: true } }]);
eq('an unchanged string is a straight copy', remapSpans('AB', 'AB', [{ from: 0, to: 2, attrs: { bold: true } }]),
  [{ from: 0, to: 2, attrs: { bold: true } }]);
eq('with nothing to remap there is nothing to return', remapSpans('A', 'B', []), []);

console.log('\nanchors — a marker on an empty line is not thrown away');

const EMPTY = ingestSpans('{size=0.55}\nNEXT');
eq('the empty first line keeps its marker as a zero-length anchor',
  EMPTY.spans, [{ from: 0, to: 0, attrs: { scale: 0.55 } }]);
eq('  and the round trip puts it back', emitSpans(EMPTY.text, EMPTY.spans), '{size=0.55}\nNEXT');
const EMPTY_TYPED = remapSpans('\nNEXT', 'W\nNEXT', EMPTY.spans);
eq('typing into a styled empty line picks the style up',
  EMPTY_TYPED, [{ from: 0, to: 1, attrs: { scale: 0.55 } }]);
eq('  so the first commit already has the marker',
  emitSpans('W\nNEXT', EMPTY_TYPED), '{size=0.55}W\nNEXT');

console.log('\ninline flags — bold / underline / italic / strike parse and render');

eq('a bare {bold} turns bold on',
  parseSegments('A{bold}B'),
  [{ bold: false, scale: 1, t: 'A' }, { bold: true, scale: 1, t: 'B' }]);
eq('and a numeric value can turn it back off',
  parseSegments('{bold=1}A{bold=0}B'),
  [{ bold: true, scale: 1, t: 'A' }, { bold: false, scale: 1, t: 'B' }]);
eq('{underline=1} reaches the run',
  parseSegments('A{underline=1}B'),
  [{ bold: false, scale: 1, t: 'A' }, { bold: false, scale: 1, underline: true, t: 'B' }]);

const FLAG_HTML = renderToStaticMarkup(renderLyricsLayout('A{underline=1}B', ST, WIDE));
ok('a run-level underline reaches the DOM', FLAG_HTML.includes('text-decoration:underline'));
eq('  and only that run carries it', (FLAG_HTML.match(/text-decoration:underline/g) || []).length, 1);
ok('  wrapping exactly the marked word', /text-decoration:underline[^>]*>B</.test(FLAG_HTML));
const RUNBOLD_HTML = renderToStaticMarkup(renderLyricsLayout('A{bold=1}B', ST, WIDE));
ok('a run-level bold reaches the DOM', RUNBOLD_HTML.includes('<b>B</b>'));
const ITALIC_HTML = renderToStaticMarkup(renderLyricsLayout('A{italic=1}B', ST, WIDE));
ok('a run-level italic reaches the DOM', ITALIC_HTML.includes('font-style:italic'));

eq('stripMarkup hides the new flags from cue tiles too',
  stripMarkup('WAY {underline=1}LAING{/} SIMBAHON'), 'WAY LAING SIMBAHON');
eq('case transforms cannot break the flags (keys fold, values are numeric)',
  parseSegments(applyCaseTransform('a{underline=1}b', 'upper')),
  [{ bold: false, scale: 1, t: 'A' }, { bold: false, scale: 1, underline: true, t: 'B' }]);

console.log('\nlineIndexAt — the caret still knows its line');

eq('caret at the start is line 0', lineIndexAt('A\nB', 0), 0);
eq('a caret on the newline still belongs to line 0', lineIndexAt('A\nB', 1), 0);
eq('after a newline is line 1', lineIndexAt('A\nB', 2), 1);
eq('past the end clamps to the last line', lineIndexAt('A', 99), 0);

eq('the presets include a way back to normal', LINE_SCALE_PRESETS.includes(1), true);
ok('the presets span small to large', LINE_SCALE_PRESETS[0] < 1 && LINE_SCALE_PRESETS[LINE_SCALE_PRESETS.length - 1] > 1);

console.log('\nlineScales / restyleLineScales — Apply copies the sizes, never the words');

// The song editor's footer Apply reads the source's per-line sizes out of its
// markers and writes them onto other slides' lyrics. Both halves have to be
// right: the sizes must land line for line, and the target's own words and
// inline styles must come through untouched.
const SRC = '{size=0.55}WAY LAING\n{size=1.5}SIMBAHON';

eq('a scaled line reports its size', lineScales(SRC), [0.55, 1.5]);
eq('an unscaled line reports nothing', lineScales('HESUS'), [undefined]);
eq('a scale of 1 reads as normal', lineScales('{size=1}HESUS'), [undefined]);
eq('a one-word style inside a line is not the LINE size', lineScales('PLAIN {size=1.5}WORD'), [undefined]);
ok('reading the same text twice hands back the same array', lineScales(SRC) === lineScales(SRC));

const twoLine = restyleLineScales(SRC, 'IKAW LANG\nGNOO');
eq('a two-line target takes the source size line for line', lineScales(twoLine), [0.55, 1.5]);
eq('  and keeps every word of its own', stripMarkup(twoLine), 'IKAW LANG\nGNOO');
eq("the target's own old sizes are replaced, not stacked", lineScales(restyleLineScales(SRC, '{size=2}OLD\n{size=0.7}ONE')), [0.55, 1.5]);
eq("a single-line target takes the source's MAIN (last) size", lineScales(restyleLineScales(SRC, 'HESUS')), [1.5]);
eq('a line the source never reached takes the pattern too (spreads over the whole target)', lineScales(restyleLineScales('{size=0.55}A\n{size=1.5}B', 'X\nY\n{size=2}Z')), [0.55, 1.5, 1.5]);
eq('a blank line inherits a size to be typed into', lineScales(restyleLineScales(SRC, 'WORD\n')), [0.55, 1.5]);
eq('bold inside the target survives the size copy',
  parseSegments(restyleLineScales(SRC, 'SIMBAHON is **BOLD**')).some((s) => s.bold), true);
eq('an empty source changes nothing', restyleLineScales('', '{size=2}KEEP'), '{size=2}KEEP');
eq('the result reads back the same after a second pass', lineScales(restyleLineScales(SRC, twoLine)), [0.55, 1.5]);

// The shape an operator actually builds: ONE physical line whose two sizes
// WRAP into two visual lines on the projector (checked out of the shipped
// database — cue 0 of "Diyos Sa Tanan"). Per line it reports nothing, which
// is exactly why a whole-line copy used to make Apply do nothing at all.
const WORD_SRC = '{size=0.7}Way laing {/}{size=1.5}simbahon';
eq('a word-sized source has no LINE size to read', lineScales(WORD_SRC), [undefined]);

const wordCopy = restyleLineScales(WORD_SRC, 'Hangtud may gininhawa');
eq('so the pattern is mapped onto words instead', parseSegments(wordCopy).map((s) => [s.t, s.scale]),
  [['Hangtud may ', 0.7], ['gininhawa', 1.5]]);
eq('  and the target keeps every one of its own words', stripMarkup(wordCopy), 'Hangtud may gininhawa');
eq('a second pass over its own output is a no-op', restyleLineScales(WORD_SRC, wordCopy), wordCopy);

const wordCopy2 = restyleLineScales(WORD_SRC, 'Ikaw lang Ginoo');
eq('three words climb the same ladder', parseSegments(wordCopy2).map((s) => [s.t, s.scale]),
  [['Ikaw lang ', 0.7], ['Ginoo', 1.5]]);
eq('a one-word target grows into the KEYWORD size, not the lead-in', lineScales(restyleLineScales(WORD_SRC, 'HESUS')), [1.5]);
eq('a source with sizes on no character changes nothing', restyleLineScales('plain words', '{size=2}KEEP'), '{size=2}KEEP');
eq('the pattern survives a target that carries its own bold', parseSegments(restyleLineScales(WORD_SRC, 'Hesus is **LORD**')).some((s) => s.bold), true);

console.log('\nperf sanity — a full slide stays cheap');

// Neither clock on this box is trustworthy on its own, and finding that out
// was most of the work here:
//
//   * Wall-clock measured as one long loop is useless — the renderer, the dev
//     server and the editor share 4 cores, and the same loop measured 730ms
//     and 1716ms minutes apart.
//   * process.cpuUsage() removes the contention but not the clock — under
//     sustained load this box stops boosting and the same work costs ~2x more
//     CPU (890ms then, ~400ms when it can turbo), and HEAD's released renderer
//     measures exactly the same.
//   * process.cpuUsage() over a SHORT window is worse than useless: it read
//     0ms for 100 full slide renders (~16ms of real work) and 63ms for the
//     identical loop. A ratio built on those deltas swung 0.37x to 8.75x on
//     byte-identical code — that was this assertion going red by itself.
//
// So each number comes from the measurement it can survive: the absolute
// figure is CPU time aggregated over several long rounds (only that window
// behaves — 500 renders read 141-265ms every time), and the ratio is MEDIAN
// WALL TIME over many short chunks that ALTERNATE sides, so both sides are
// measured milliseconds apart inside the same second. A stall can poison one
// chunk; the median throws it away.
const plainSample = stripMarkup('{size=0.55}ONLY YOU\nJESUS\n{size=0.7}and another line\n**bold** tail');
const sample = '{size=0.55}ONLY YOU\nJESUS\n{size=0.7}and another line\n**bold** tail';
const timed = (s, n) => {
  const c0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  let b = 0;
  for (let i = 0; i < n; i++) b += renderToStaticMarkup(renderLyricsLayout(s, ST, WIDE)).length;
  const d = process.cpuUsage(c0);
  return { cpu: (d.user + d.system) / 1000, wall: Number(process.hrtime.bigint() - t0) / 1e6, b };
};

// --- catastrophe ceiling: CPU over long rounds, sides alternating each round
const CPU_ROUNDS = 3;
const CPU_N = 500;
let markCpu = 0;
let okSample = true;
for (let r = 0; r < CPU_ROUNDS; r++) {
  let p;
  let m;
  if (r % 2) { m = timed(sample, CPU_N); p = timed(plainSample, CPU_N); }
  else { p = timed(plainSample, CPU_N); m = timed(sample, CPU_N); }
  markCpu += m.cpu;
  okSample = okSample && m.b > 0 && p.b > 0;
}
const cpu = markCpu / CPU_ROUNDS;

// --- the check that guards this feature: markers vs the same slide without them
const CHUNKS = 16;
const CHUNK_N = 100;
const plainWall = [];
const markWall = [];
for (let i = 0; i < CHUNKS; i++) {
  if (i % 2) {
    markWall.push(timed(sample, CHUNK_N).wall);
    plainWall.push(timed(plainSample, CHUNK_N).wall);
  } else {
    plainWall.push(timed(plainSample, CHUNK_N).wall);
    markWall.push(timed(sample, CHUNK_N).wall);
  }
}
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const ratio = med(markWall) / med(plainWall);

ok(`${CPU_N} renders/round use ${cpu.toFixed(0)}ms CPU (ceiling < 1200ms)`, okSample && cpu < 1200);
ok(`markers cost no more than 1.8x the marker-free path (median wall ${ratio.toFixed(2)}x of ${CHUNKS} alternating chunks)`, ratio > 0 && ratio < 1.8);

rmSync(outFile, { force: true });

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
