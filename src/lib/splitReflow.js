// =====================================================================
// RE-FLOW — the Song Editor's Split button, as a pure function.
//
// WHY IT EXISTS AS ITS OWN MODULE
// Split used to live inside App.jsx and only ever CUT: paste at 1 line per
// block, set 4, press Split, nothing happened — every cue already held 4
// lines or fewer, so the count was a one-way door you could not go back
// through. Keeping the whole rule here, with the text measuring handed
// back in, makes it testable on its own (test-split-reflow.mjs).
//
// THE RULE
//   1. ADJACENT slides whose label is the same section (the "(Part n)"
//      suffix ignored) are parts of ONE section, so they are joined back
//      into a single block of lines.
//   2. That block is re-chunked to the new count through the PARSER's own
//      splitter (splitCuesByLines), so an editor Split is line-for-line
//      what Smart Paste would have produced at that number — including the
//      comma-phrase cut when the count is 1.
//   3. A section that already fits is left untouched: same box, same font,
//      same hand-dragged placement. Only its stale "(Part n)" suffix goes.
//   4. Anything whose text DID change is handed to `fit` (fitParsedCue in
//      the app) so its box grows to the new line count instead of the
//      lyrics being shrunk into the old one.
//
// A Chorus sitting between Verse 1 and Verse 2 keeps its place: only
// neighbours merge, never a section and its distant sibling.
// =====================================================================
import { splitCuesByLines } from '../../electron/songParse.js';

const PART_SUFFIX = /\s*\(Part\s+\d+\)\s*$/i;

export const baseLabelOf = (cue, i) =>
  String((cue && cue.label) || '').replace(PART_SUFFIX, '').trim() || `Verse ${i + 1}`;

/**
 * @param {Array} cues the song's current cues, in order
 * @param {number} linesPerSlide target lines per slide
 * @param {(cue: object) => object} fit box/text fitter for changed cues
 * @returns {Array} new cues (never mutates the input)
 */
export function reflowCuesToLines(cues, linesPerSlide, fit = (c) => c) {
  const n = Math.max(1, Math.floor(Number(linesPerSlide) || 4));
  const src = Array.isArray(cues) ? cues : [];

  // 1. group ADJACENT slides that are parts of the same section
  const groups = [];
  src.forEach((cue, i) => {
    if (!cue) return;
    const base = baseLabelOf(cue, i);
    const last = groups[groups.length - 1];
    if (last && last.base === base) last.cues.push(cue);
    else groups.push({ base, cues: [cue] });
  });

  // 2. rebuild each section as one block and re-chunk it
  const out = [];
  for (const g of groups) {
    // Blank lines are padding, not lyric lines — the parser drops them, so
    // the count here is the same one a fresh parse would count.
    const lines = g.cues
      .flatMap((c) => String(c.text || '').split('\n'))
      .filter((l) => l.trim() !== '');

    if (lines.length === 0) { out.push({ ...g.cues[0], label: g.base }); continue; }

    const merged = { ...g.cues[0], label: g.base, text: lines.join('\n') };
    const parts = splitCuesByLines([merged], n);

    // 3. already fits — keep the operator's box and edits as they were
    if (parts.length === 1 && parts[0].text === g.cues[0].text) {
      out.push(parts[0].label === g.cues[0].label ? g.cues[0] : { ...g.cues[0], label: parts[0].label });
      continue;
    }
    // 4. new text — fit the box to it
    for (const p of parts) out.push(fit(p));
  }
  return out;
}
