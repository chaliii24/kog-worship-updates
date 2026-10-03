// Shared song-block parser used by BOTH the Electron main process (the
// non-AI failsafe inside the 'ai-parse-chord-chart' handler) and the
// renderer fallback in src/App.jsx, so the two can never drift apart.
//
// Keep this file isomorphic and dependency-free (no node / DOM APIs):
// main.js imports it directly, Vite bundles it into the renderer too.
//
// Handles THREE input shapes — not just chord charts:
//   1. Chord charts, with or without [Verse]/"Chorus:" headers.
//   2. Plain lyrics WITH section markers.
//   3. Plain lyrics with NO markers at all (the typical lyrics-site paste):
//      split by blank-line stanzas → Verse 1..N, and a stanza that repeats
//      is labelled Chorus. A single wall of text with no blank lines is
//      chunked linesPerSlide lines at a time.
//
// WIDENED SCOPE (offline-regex pass 2): shorthand headers (V1/C/Br/PC),
// ordinals (1st/first/II/End/Final Chorus), headers with inline content
// ("Chorus: …"), title blocks ("Artist - Title"), metadata (CCLI/Album/Genre,
// tabbed-by/subscribe/Key-change/capo-fret/Title:/Artist:), trailing LRC
// timestamps, count-in digit lines, (Repeat)/speaker roles (All:/Men:),
// instrument solos, wider number separators (No 2, Verse.1, Chorus – 2),
// and walls of text split at a repeated anchor line into Verse/Chorus via
// the normal stanza machinery.
//
// Chord stripping is GATED on the text actually looking like a chart
// (standalone chord rows / inline chord pairs), so pure lyrics are never
// corrupted — the old parser always ran its chord filter and silently
// deleted lyric words such as "A" and "am", and dropped whole lines that
// happened to be half chord-shaped. Every new rule above follows the same
// discipline: ambiguous patterns fall through as plain lyrics rather than
// being dropped or rewritten.

// Chord token: C, C#m, F#m/B, Asus4, G7, Bb, Cadd9, Em7b5, G7sus4,
// C(maj7), Cmaj7#11 … written the way chords actually are — UPPERCASE
// root. Deliberately case-sensitive: an /i test also matches lyric words
// like "am"/"As". "N.C." (no chord) counts as a chart token too.
const CHORD_ALT = 'm|min|maj|dim|aug|sus|add';
const CHORD_BODY =
  '[A-G][#b]?' +                       // root + accidental
  '(?:' + CHORD_ALT + ')?' +           // quality          Cm · F#sus
  '[0-9]*' +                           // extension        C7 · Em7
  '(?:(' + CHORD_ALT + ')[0-9]*)?' +    // quality AFTER digits  G7sus4
  '(?:\\((?:' + CHORD_ALT + ')[0-9]*\\))?' + // parenthesised  C(maj7)
  '(?:[#b][0-9]+)*' +                  // alterations      Em7b5 · C7#9
  '(?:\\/[A-G][#b]?)?';                // slash bass       D/F#
const CHORD_RE = new RegExp('^(?:N\\.?C\\.?|' + CHORD_BODY + ')$');
const BRACKET_CHORD_RE = new RegExp('\\[' + CHORD_BODY + '\\]', 'g');
const PAREN_CHORD_RE = new RegExp('\\(' + CHORD_BODY + '\\)', 'g');

// Metadata / site chrome that must be DROPPED — never a slide label,
// never lyrics. Every branch is anchored and tight so lyric lines that
// merely START with these words ("Key to my heart", "Chords of love")
// fall through untouched: value-shaped branches require a real chord/
// number after the keyword, and bare keywords only match the whole line.
const META_RE = new RegExp('^(?:' + [
  'capo(?:\\s*[:=]?\\s*\\d{1,2}(?:st|nd|rd|th)?)?\\s*(?:fret)?\\s*(?:\\(.*\\))?$', // Capo 2 · Capo: 2 · Capo 3rd fret
  '(?:original\\s+)?key\\s*(?:of|:|=)\\s*[a-g][#b]?(?:\\s*(?:m|min|minor|maj|major))?(?:\\s*[/,;-].*)?', // Key: G · Key of F#m
  '(?:tempo|speed)(?:\\s*bpm)?\\s*[:.=]?\\s*\\d{1,3}\\b.*', // Tempo: 120
  '\\d{2,3}\\s*(?:b\\.?p\\.?m\\.?)\\b.*',                   // 120 BPM
  '(?:time\\s*(?:signature)?|sig(?:nature)?)\\s*[:=]\\s*\\d+\\s*/\\s*\\d+.*', // Time: 4/4
  '\\d+\\s*/\\s*\\d+\\s*(?:time|signature)?',                // 4/4
  'tuning\\s*[:=].*',                                       // Tuning: Standard
  'key\\s+change.*', 'modulat.*',                           // Key change up · Modulate to A
  '(?:written|composed|arranged|lyrics?|chords?|words?(?:\\s*&\\s*music)?|music)\\s+by\\s+.*',
  '(?:artist|title|song)\\s*[:=]\\s*.+',                    // Artist: Sinach · Title: Way Maker
  'ccli\\s*#?\\s*[\\w-]+.*',                                // CCLI #12345
  '(?:album|genre|year|released|writer|producer|label|recorded|tabbed\\s+by|requested\\s+by|dmca|subscribe|like\\s+.*subscribe|follow\\s+(?:us|me|for\\s+more)).*',
  '(?:©|℗).*', 'copyright\\b.*', 'all\\s+rights\\s+reserved.*',
  '(?:made\\s+popular\\s+by|originally\\s+(?:by|performed\\s+by)).*',
  // whole-line site chrome / panel titles, with or without a trailing colon
  '(?:lyrics?|chords?|tabs?|embed(?:\\s+this)?|transpose|tempo|bpm|capo|tuning' +
  '|see\\s+(?:more|less)|report\\s+(?:incorrect|a\\s+(?:problem|error))|submit\\s+(?:correction|lyrics))\\s*[:=]?$',
].join('|') + ')$', 'i');

// Section markers recognised as headers (bare, [bracketed], (parenthesised)
// or "Verse 1:" style), canonicalised for display.
const SECTION_CANON = {
  verse: 'Verse', chorus: 'Chorus',
  'pre-chorus': 'Pre-Chorus', prechorus: 'Pre-Chorus',
  'post-chorus': 'Post-Chorus', postchorus: 'Post-Chorus',
  refrain: 'Refrain', bridge: 'Bridge', hook: 'Hook', tag: 'Tag',
  intro: 'Intro', outro: 'Outro', ending: 'Ending', end: 'Ending',
  interlude: 'Interlude',
  instrumental: 'Instrumental', breakdown: 'Breakdown', solo: 'Solo',
  turnaround: 'Turnaround', link: 'Link', coda: 'Coda',
  'ad-lib': 'Ad-Lib', adlib: 'Ad-Lib',
  rap: 'Rap', spoken: 'Spoken', build: 'Build', vamp: 'Vamp', break: 'Break',
};
// "breakdown" MUST precede "break" (longest first) or "Breakdown" would
// match break + rest "down", fail the number check, and fall through as a
// lyric line. Everything after the keyword still has to be a number /
// word-number / single letter / (x2) — which is what keeps lyric lines
// like "Break every chain" or "Build me up" or "Rapunzel" safe.
const SECTION_RE = /^(verse|chorus|pre[-\s]?chorus|post[-\s]?chorus|refrain|bridge|hook|tag|intro|outro|end(?:ing)?|interlude|instrumental|breakdown|break|solo|turnaround|link|coda|ad[-\s]?lib|rap|spoken|build|vamp)(.*)$/i;
// Shorthand charts: V1, C2, V, C, Ch, Br, PC. A whole line that is ONLY one
// of these (plus optional number) is a header on every chord/lyric site —
// and no real lyric line is a lone "C".
const SHORT_CANON = { v: 'Verse', c: 'Chorus', ch: 'Chorus', br: 'Bridge', pc: 'Pre-Chorus' };
const SHORT_RE = /^(v|c|ch|br|pc)\s*(\d*)$/i;
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', first: '1', second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6' };
const ROMAN_NUM = { i: '1', ii: '2', iii: '3', iv: '4', v: '5', vi: '6' };
const NUM_SEP = '[-\\s:.–—]*';

/**
 * "Verse 1" / "[Chorus]" / "pre chorus:" / "Bridge (x2)" → canonical label.
 * Returns null for anything that is not a section (crucially, ordinary
 * lyric lines like "Bridge over troubled water" must NOT become headers).
 *
 * `allowBare` gates single-letter shorthand ("V" / "C" with no number): a
 * lone "C" is only a header when the paste proves it speaks that shorthand
 * (another section header elsewhere). Without context it stays a lyric line.
 */
export function sectionLabel(str, allowBare = false) {
  let s = String(str || '').trim();
  if (!s) return null;
  // "[Verse 1]" → unwrap a fully-wrapped string; "Chorus (x2)" → drop only
  // the trailing repeat/annotation marker. Then trailing punctuation.
  if (/^[(\[][^\)\]]*[)\]]$/.test(s)) s = s.slice(1, -1).trim();
  else s = s.replace(/[(\[][^)\]]*[)\]]\s*$/, '').trim();
  s = s.replace(/[\s:：.\-]+$/, '').trim();
  if (!s) return null;
  // "Final Chorus" / "Last Verse" — the modifier carries no numbering, drop it.
  s = s.replace(/^(?:final|last)\s+(?=[a-z])/i, '').trim();
  if (!s) return null;
  // Leading numbers ("1st Verse", "2 Chorus", "1. Verse"): the count belongs
  // to the header that follows. If the rest already carries its own number
  // ("1 Verse 2") the rest wins — it sits closer to the keyword. A bare
  // lyric that merely starts with digits ("1 Amazing grace") never parses
  // as a section, so it falls straight through.
  const lead = /^(\d+)(?:st|nd|rd|th)?[.)]?\s+(.+)$/.exec(s);
  if (lead) {
    const sec = sectionLabel(lead[2], allowBare);
    if (sec) return /\d$/.test(sec) ? sec : `${sec} ${lead[1]}`;
  }
  // Shorthand ("V1", "C", "Br2", "PC") before the full-word match.
  // Numbered shorthand is unambiguous anywhere; a BARE single letter needs
  // the caller to have seen section context (allowBare).
  const sh = SHORT_RE.exec(s);
  if (sh) {
    const sk = sh[1].toLowerCase();
    if (!sh[2] && (sk === 'v' || sk === 'c') && !allowBare) {
      // fall through: lyric until proven shorthand
    } else {
      const canon = SHORT_CANON[sk];
      return sh[2] ? `${canon} ${parseInt(sh[2], 10)}` : canon;
    }
  }
  // "Guitar Solo" — the instrument is decoration, the section is the Solo.
  s = s.replace(/^(?:guitar|piano|bass|drums?|strings?)\s+(?=solo$)/i, '').trim();
  if (!s) return null;
  const m = SECTION_RE.exec(s);
  if (!m) return null;
  let rest = (m[2] || '').trim();
  if (/^x\s*\d+$/i.test(rest)) rest = '';
  const label = SECTION_CANON[m[1].toLowerCase().replace(/\s+/g, '-')];
  if (!label) return null;
  if (!rest) return label;
  const num = new RegExp('^' + NUM_SEP + '(?:no\\.?|#|part)?' + NUM_SEP + '(\\d+)(?:st|nd|rd|th)?$').exec(rest);
  if (num) return `${label} ${num[1]}`;
  const word = new RegExp('^' + NUM_SEP + '(one|two|three|four|five|six|first|second|third|fourth|fifth|sixth)$', 'i').exec(rest);
  if (word) return `${label} ${WORD_NUM[word[1].toLowerCase()]}`;
  const roman = new RegExp('^' + NUM_SEP + '(i|ii|iii|iv|v|vi)$', 'i').exec(rest);
  if (roman) return `${label} ${ROMAN_NUM[roman[1].toLowerCase()]}`;
  if (/^[a-d]$/i.test(rest)) return `${label} ${rest.toUpperCase()}`;
  return null;
}

// Legacy behaviour for non-standard bracket labels ("[Spoken]"): sentence
// case, same as the old parser's capitalize-first-letter rule.
function normalizeGeneric(str) {
  const t = String(str || '')
    .replace(/[(\[][^)\]]*[)\]]\s*$/, '')
    .replace(/[\s:：.\-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

// Classify a single line for chord-chart detection.
//   'strong' — a standalone row of only chords: "C  G  Am  F", "[C] [G]"
//   'weak'   — a lone chord: "C" (needs four of these to call it a chart —
//              a single uppercase A–G letter is far more often a lyric word)
//   'inline' — a lyric line carrying 2+ chords: "Amazing C grace how G sweet"
//   'noise'  — only brackets/pipes left: "[C] [G]"
//   'lyric'  — everything else
function chordLineKind(raw) {
  const line = String(raw || '').trim();
  if (!line) return 'blank';
  const bare = line.replace(BRACKET_CHORD_RE, ' ').replace(PAREN_CHORD_RE, ' ');
  const tokens = bare.replace(/[|/\-_—–]+/g, ' ').split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    // "[C] [G]" left nothing but brackets → chord notation, i.e. chart
    // evidence. Pure decoration ("|---|") is not evidence of anything.
    return (line.match(BRACKET_CHORD_RE) || []).length >= 1 ? 'strong' : 'noise';
  }
  const chords = tokens.filter(t => CHORD_RE.test(t));
  if (chords.length === tokens.length) return tokens.length >= 2 ? 'strong' : 'weak';
  if (chords.length >= 2) return 'inline';
  if (/\|/.test(line) && chords.length / tokens.length >= 0.5) return 'strong';
  return 'lyric';
}

// Loose comparison key for headerless stanzas: punctuation and bracketed
// annotations are dropped, then up to two pure vocables are trimmed from
// the TAIL — so "Hallelujah (oh!)" and "Hallelujah, oh oh" both compare
// equal to "Hallelujah". Tail only: trimming LEADING words ("Oh Lord You
// are" vs "Lord You are") would merge two distinct stanzas into a phantom
// repeat and hand both a bogus Chorus label. GUARDS: at least two words
// must remain after each trim and an empty result reverts to the original
// — under-merging only costs a missed repeat, over-merging would hand out
// wrong labels.
function stanzaKey(lines) {
  const raw = lines.join('\n').toLowerCase();
  let k = raw
    .replace(/[(\[][^)\]]*[)\]]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const INTER = new Set(['oh', 'ooh', 'oooh', 'ah', 'yeah', 'ya', 'yea', 'whoa', 'woah', 'na', 'nah', 'la', 'hey', 'ay', 'huh', 'mmm', 'mm']);
  const w = k.split(' ').filter(Boolean);
  let removed = 0;
  while (removed < 2 && w.length - 1 >= 2 && INTER.has(w[w.length - 1])) {
    w.pop();
    removed += 1;
  }
  k = w.join(' ');
  return k || raw;
}

// Word-multiset similarity (Sørensen–Dice, 0..1): "My chains are gone /
// been set free" vs the same + "today" scores ~0.9, while two distinct
// verses sharing one refrain line score ~0.3. Multiset (not set) so
// repeated words ("holy holy") still count.
function stanzaSim(a, b) {
  const ta = String(a || '').split(' ').filter(Boolean);
  const tb = String(b || '').split(' ').filter(Boolean);
  if (!ta.length || !tb.length) return 0;
  const counts = new Map();
  for (const w of ta) counts.set(w, (counts.get(w) || 0) + 1);
  let inter = 0;
  for (const w of tb) {
    const c = counts.get(w) || 0;
    if (c > 0) { counts.set(w, c - 1); inter += 1; }
  }
  return (2 * inter) / (ta.length + tb.length);
}

// Per-line repeat key: case/punctuation-insensitive, with hyphens and
// apostrophes VANISHING (not spacing) — so "kasing-kasing" meets its
// "kasingkasing" spelling variant and "o Dios," meets "o Dios". Original
// text is always preserved; keys are only for matching.
function repeatKey(line) {
  return String(line || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

// All non-overlapping repeated contiguous runs (≥2 lines) in a wall.
// Single-line echoes ("Hallelujah" ×3) do NOT count — the legacy anchor
// logic owns those. Bounded (60-line windows) so pathological pastes stay
// instant.
function wallRepeats(lineKeys) {
  const n = lineKeys.length;
  const reps = [];
  const maxLen = Math.min(60, Math.floor(n / 2));
  for (let len = maxLen; len >= 2; len--) {
    const occ = new Map();
    for (let i = 0; i + len <= n; i++) {
      const k = lineKeys.slice(i, i + len).join('\n');
      if (!k.trim()) continue;
      if (!occ.has(k)) occ.set(k, []);
      occ.get(k).push(i);
    }
    for (const [k, ps] of occ) {
      const non = [];
      for (const p of ps) { if (!non.length || p >= non[non.length - 1] + len) non.push(p); }
      if (non.length >= 2) reps.push({ key: k, len, pos: non });
    }
  }
  return reps;
}

// One contiguous run (V V C): every occurrence starts where the previous
// ends. A repeat bunched like that is a verse reprise, never chorus material.
function isSingleRun(rep) {
  return rep.pos.every((p, i) => i === 0 || p === rep.pos[i - 1] + rep.len);
}

// Unsegmented wall WITH repeated multi-line spans: cut the wall at the
// winning repeat. The chorus is the best spread-out repeat (length ×
// occurrences, then longest, then latest) — verse-only bunches never
// qualify. Without a qualifying repeat the wall is segmented by its longest
// repeat as VERSE spans (still far better than anchor-chopping); with no
// multi-line repeat at all, null (caller keeps the legacy single-line path).
// Returns [{ label, text }] or null.
function segmentWallByRepeat(lines) {
  const n = lines.length;
  let reps = wallRepeats(lines.map(repeatKey));
  if (!reps.length) return null;
  // Shadow repeats: a longer span shadowed by a SHORTER repeat occurring
  // STRICTLY more often at aligned spots (chorus + verse-fragment glued by
  // a following chorus) always loses to it. Strictness matters: a repeat
  // whose shorter core occurs at exactly the same spots is NOT a shadow
  // (that reading would discard every repeat via its own prefixes).
  const shadows = new Set();
  for (const x of reps) {
    const xk = x.key.split('\n');
    for (const y of reps) {
      if (x === y || y.len >= x.len) continue;
      const yk = y.key.split('\n');
      let off = -1;
      for (let s = 0; s + yk.length <= xk.length; s++) {
        if (xk.slice(s, s + yk.length).join('\n') === y.key) { off = s; break; }
      }
      if (off < 0) continue;
      if (y.pos.length > x.pos.length && x.pos.every((p) => y.pos.some((q) => p - q === off))) shadows.add(x);
    }
  }
  reps = reps.filter((r) => !shadows.has(r));
  if (!reps.length) return null;
  // The chorus is the best spread-out repeat: length × occurrences first
  // (substance that returns), then tighter spans (short refrains beat long
  // verse parts on ties), then latest arrival (choruses come after verses).
  // Verse-only bunches (one contiguous run, e.g. V V C) never qualify.
  // Two-line spans are held to a stricter bar — NO adjacent occurrence pair
  // at all: a 2-line verse fragment restated back-to-back ([X,Y,X,Y] inside
  // a longer verse) must not pass, while spread restatements ([X,Y] … [X,Y]
  // around other material) do. Longer spans keep the looser single-run
  // rule, so [..., C, C] double-chorus endings still qualify.
  const noTouchingPair = (r) => r.pos.every((p, i) => i === 0 || p > r.pos[i - 1] + r.len);
  const qualifying = reps.filter((r) => (r.len >= 3 ? !isSingleRun(r) : noTouchingPair(r)));
  qualifying.sort((a, b) => (b.len * b.pos.length - a.len * a.pos.length) || (a.len - b.len) || (b.pos[0] - a.pos[0]));
  const chorus = qualifying[0] || null;
  const seg = chorus || reps.slice().sort((a, b) => (b.len - a.len) || (b.pos.length - a.pos.length) || (a.pos[0] - b.pos[0]))[0];
  const starts = new Set(seg.pos);
  const spans = [];
  let cur = [];
  let i = 0;
  while (i < lines.length) {
    if (starts.has(i)) {
      if (cur.length) { spans.push({ chorus: false, lines: cur }); cur = []; }
      spans.push({ chorus: !!chorus, lines: lines.slice(i, i + seg.len) });
      i += seg.len;
    } else { cur.push(lines[i]); i += 1; }
  }
  if (cur.length) spans.push({ chorus: false, lines: cur });
  if (spans.length < 2) return null;
  // Verse spans share numbers when near-identical (same line count, ≥85%
  // shared words); distinct spans number onward. Chorus spans unite.
  const verseGroups = [];
  let verseN = 0;
  return spans.map((b) => {
    if (b.chorus) return { label: 'Chorus', text: b.lines.join('\n') };
    const k = stanzaKey(b.lines);
    let g = verseGroups.find((gg) => gg.lines.length === b.lines.length && stanzaSim(gg.key, k) >= 0.85);
    if (!g) { verseN += 1; g = { key: k, lines: b.lines, n: verseN }; verseGroups.push(g); }
    return { label: `Verse ${g.n}`, text: b.lines.join('\n') };
  });
}

// Headerless lyrics: stanzas become Verse 1..N in order of first
// appearance; a repeating stanza becomes the Chorus.
//
// Near-identical stanzas (same line count, ≥85% shared words) are grouped
// FIRST — a chorus sung with slight variation ("…ransomed me" vs
// "…ransomed me today", ~0.97) is still one section, while verse pairs
// differing by a content word ("line one here" vs "line two here", 0.80)
// stay apart. The same-line-count guard keeps distinct verses apart
// (under-merging only costs a missed repeat; over-merging would hand out
// wrong labels — same discipline as stanzaKey). `allowFuzzy` is false for
// anchor-split walls: those blocks alternate chorus/verse bits BY
// CONSTRUCTION, so merging them back together would defeat the split.
//
// Choosing the chorus among repeating groups scores, in order:
//   1. an opening stanza that STRICTLY out-occurs every other repeat is a
//      verse reprise (V C V C V), never the chorus — excluded. Ties stay
//      eligible, because C V C V opens ON its chorus;
//   2. most occurrences (a chorus repeats most);
//   3. FEWEST lines on average (a chorus is tighter than a verse) —
//      this keeps the identical-verse trap fixed: in V C V C where the
//      verse repeats VERBATIM, the shorter chorus still wins the tie;
//   4. a non-opening stanza;
//   5. later first appearance (choruses arrive after verses).
// If NOTHING repeats there is no chorus — plain Verse 1..N, as before.
// (Exact ties on all five are genuinely ambiguous — e.g. V-C-B all twice
// at equal length — and fall to rule 5 by documented coin flip.)
function labelStanzas(stanzas, allowFuzzy = true) {
  const keys = stanzas.map(stanzaKey);
  const lineCounts = stanzas.map((s) => s.length);
  const groupOf = keys.map((_, i) => i);
  const find = (i) => {
    while (groupOf[i] !== i) { groupOf[i] = groupOf[groupOf[i]]; i = groupOf[i]; }
    return i;
  };
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      if (lineCounts[i] !== lineCounts[j]) continue;
      if (!allowFuzzy) continue;
      if (stanzaSim(keys[i], keys[j]) >= 0.85) {
        const ri = find(i), rj = find(j);
        if (ri !== rj) groupOf[Math.max(ri, rj)] = Math.min(ri, rj);
      }
    }
  }
  const groups = new Map(); // root -> { count, totalLines, firstIdx }
  keys.forEach((k, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, { count: 0, totalLines: 0, firstIdx: i });
    const g = groups.get(r);
    g.count += 1;
    g.totalLines += stanzas[i].length;
  });
  const openerRoot = keys.length ? find(0) : null;
  const repeated = [...groups.entries()].filter(([, g]) => g.count > 1);
  const maxOther = Math.max(0, ...repeated.filter(([r]) => r !== openerRoot).map(([, g]) => g.count));
  const openCount = (openerRoot !== null && groups.get(openerRoot)?.count) || 0;
  let chorusRoot = null;
  for (const [r, g] of repeated) {
    if (r === openerRoot && maxOther > 0 && openCount > maxOther) continue;
    if (chorusRoot === null) { chorusRoot = r; continue; }
    const gb = groups.get(chorusRoot);
    if (g.count !== gb.count) { if (g.count > gb.count) chorusRoot = r; continue; }
    const aAvg = g.totalLines / g.count, bAvg = gb.totalLines / gb.count;
    if (aAvg !== bAvg) { if (aAvg < bAvg) chorusRoot = r; continue; }
    const aOp = r === openerRoot ? 0 : 1, bOp = chorusRoot === openerRoot ? 0 : 1;
    if (aOp !== bOp) { if (aOp > bOp) chorusRoot = r; continue; }
    if (g.firstIdx !== gb.firstIdx && g.firstIdx > gb.firstIdx) chorusRoot = r;
  }

  // Number the rest Verse 1..N in order of first appearance, skipping the
  // chorus group so labels never start at "Verse 2".
  const labelOfRoot = new Map();
  let verseN = 0;
  [...groups.keys()]
    .sort((a, b) => groups.get(a).firstIdx - groups.get(b).firstIdx)
    .forEach((r) => {
      if (r === chorusRoot) labelOfRoot.set(r, 'Chorus');
      else { verseN += 1; labelOfRoot.set(r, `Verse ${verseN}`); }
    });

  return stanzas.map((lines, i) => ({ label: labelOfRoot.get(find(i)), text: lines.join('\n') }));
}

/**
 * Parse raw song text into blocks: [{ label, text }].
 * Never returns an empty array. Does NOT apply the lines-per-slide split to
 * headered/stanza blocks (callers run splitCuesByLines for that) — it only
 * uses linesPerSlide to size chunks when a marker-less wall of text has to
 * be cut into slides.
 */
export function parseSongBlocks(rawText, linesPerSlide = 4) {
  const original = String(rawText || '').replace(/\r\n?/g, '\n');
  const rawLines = original.split('\n');
  const splitN = Math.max(1, Math.floor(Number(linesPerSlide) || 4));

  // Title block: many pastes open with "Artist - Title" (UG: "Sinach - Way
  // Maker") or "Title by Author" then a blank line. That opener is metadata
  // for the title field, not a lyric — but ONLY when short on both sides and
  // a blank line + more content follow. An ASCII hyphen additionally requires
  // Title Case both sides, so a lyric opener like "Hallelujah - my soul
  // sings" (lowercase tail) survives; en/em dashes are almost never lyric
  // pauses on line one. Same guards for the "by" form (author Title Cased).
  const skipIdx = new Set();
  {
    let i = 0;
    while (i < rawLines.length && !rawLines[i].trim()) i++;
    const first = (rawLines[i] || '').trim();
    const titleCased = (s) => {
      const toks = s.split(/\s+/).filter(Boolean);
      return toks.length > 0 && toks.every((t) => {
        const m = /[a-zA-Z]/.exec(t);
        return !m || m[0] === m[0].toUpperCase();
      });
    };
    const dm = /^(.*?)\s+([–—]|-)\s+(.*?)$/.exec(first);
    const bym = /^(.*?)\s+[Bb][Yy]\s+(.*?)$/.exec(first);
    let isTitle = false;
    if (dm) {
      const a = dm[1].trim(), b = dm[3].trim();
      if (a && b && a.length <= 60 && b.length <= 60
        && (dm[2] !== '-' || (titleCased(a) && titleCased(b)))) {
        let j = i + 1;
        while (j < rawLines.length && !rawLines[j].trim()) j++;
        if (j > i + 1 && j < rawLines.length) skipIdx.add(i);
      }
    }
    if (!skipIdx.has(i)) {
      // "Amazing Grace by John Newton": same guards, author Title Cased.
      const by = /^(.*?)\s+[Bb][Yy]\s+(.*?)$/.exec(first);
      if (by) {
        const w = by[1].trim(), au = by[2].trim();
        if (w && au && w.length <= 60 && au.length <= 40 && titleCased(au)) {
          let j = i + 1;
          while (j < rawLines.length && !rawLines[j].trim()) j++;
          if (j > i + 1 && j < rawLines.length) skipIdx.add(i);
        }
      }
    }
  }

  // Whole-paste shorthand context: a bare "V" / "C" line is only a header
  // when something else in the paste already speaks sections (full keyword
  // or numbered shorthand). Without that proof it stays lyric — this is the
  // file's core discipline (ambiguous falls through), applied to lone letters.
  const probeHeader = (ln) => {
    const t = String(ln || '').trim()
      .replace(/^#{1,6}\s+/, '')
      .replace(/^\s*[([]?\d{1,2}[.)][)\]]?\s+/, '');
    if (/^[(\[][^)\]]*[)\]]$/.test(t)) {
      const inner = t.slice(1, -1).trim();
      // Bracketed single chords ("[C]") are notation, never context.
      if (/^([A-G][#b]?(?:m|min|maj|dim|aug|sus|add)?[0-9]*)$/.test(inner)) return false;
      return sectionLabel(inner, false) !== null;
    }
    return sectionLabel(t, false) !== null;
  };
  const allowBare = rawLines.some(probeHeader);

  // Pass 1 — does this look like a chord chart? Only then do we risk
  // stripping chord-shaped WORDS out of the lyrics.
  let strong = 0, weak = 0, inline = 0;
  for (const raw of rawLines) {
    const kind = chordLineKind(raw);
    if (kind === 'strong') strong += 1;
    else if (kind === 'weak') weak += 1;
    else if (kind === 'inline') inline += 1;
  }
  const chordy = strong >= 1 || weak >= 4 || inline >= 2;

  // Pass 2 — classify every line.
  const items = []; // {t:'blank'} | {t:'label',v} | {t:'text',v}
  let sawHeader = false;

  for (let li = 0; li < rawLines.length; li++) {
    if (skipIdx.has(li)) continue;
    const raw = rawLines[li];
    let line = raw.trim();
    if (!line) {
      if (items.length && items[items.length - 1].t !== 'blank') items.push({ t: 'blank' });
      continue;
    }

    // --- Pre-clean: junk that wraps or precedes real content on lyrics
    // sites. Timestamps ([00:12.34] / LRC, leading or trailing), numbered-list
    // verse markers ("1. Amazing grace", "(2) Great are You", "[3] …"),
    // markdown fences ("## Verse 1") and bold wrappers ("**Chorus**"). A line
    // that becomes empty is dropped WITHOUT a blank marker so it never
    // splits a stanza.
    line = line.replace(/^\s*[([]?\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]?\s*/, '');
    line = line.replace(/\s*[([]\d{1,2}:\d{2}(?:[.:]\d{1,3})?[)\]]\s*$/, '');
    line = line.replace(/^\s*[([]?\d{1,2}[.)][)\]]?\s+(?=\S)/, '');
    line = line.replace(/^\s*\[\d{1,2}\]\s+/, '');
    if (!line) continue;
    line = line.replace(/^#{1,6}\s+/, '');
    const md = /^(\*{1,2}|_{1,2}|`)(.+?)\1$/.exec(line);
    if (md) line = md[2].trim();

    // --- Metadata / site chrome: drop outright — never a label, never a
    // lyric. Probe one unwrap layer so "[Capo 2]" and "Key: G" are both
    // caught; chord rows ("[C] [G]") can't match any branch.
    const probe = ((line.startsWith('[') && line.endsWith(']')) || (line.startsWith('(') && line.endsWith(')')))
      ? line.slice(1, -1).trim() : line;
    if (META_RE.test(probe)) continue;

    // --- (Repeat) / (Repeat Chorus): a direction, not a lyric. With a
    // section it opens that section; bare it is dropped outright.
    const rep = /^\(?\s*repeat\s*(?:(?:the\s+)?(chorus|verse|bridge|refrain)\s*)?\)?$/i.exec(line);
    if (rep) {
      if (rep[1]) { sawHeader = true; items.push({ t: 'label', v: SECTION_CANON[rep[1].toLowerCase()] }); }
      continue;
    }

    // --- Speaker roles ("All:", "Men:"): sheet directions. The tag is
    // dropped, the words stay a lyric line.
    const role = /^(all|men|women|choir|leader|everyone|congregation|soloist)\s*:\s*(.+)$/i.exec(line);
    if (role && role[2].trim()) line = role[2].trim();

    // --- Section markers: [Verse 1], (Chorus), CHORUS, Verse 1: ---
    // A bare "C" (or "[C]") in a chordy paste is the C chord — NEVER a
    // shorthand Chorus header. sectionLabel with allowBare reads bare "C"
    // as Chorus, which used to chop every verse into phantom Chorus blocks
    // at each lone C chord line (same for "V"; "B" is gated too so it can
    // only ever read as the chord, never Bridge). Numbered/multi-letter
    // shorthand (V1, C2, Ch, Br, PC) is deliberately NOT gated: it is either
    // not a valid chord token at all, or (C2) an established header form.
    // Full-word headers can never be single chord letters, so gating just
    // this case loses nothing: [Chorus], Verse 1, V1 all still parse. In
    // non-chordy pastes (pure lyrics) the gate stays off entirely.
    const debracket = line.replace(/^\[(.*)\]$/s, '$1').replace(/^\((.*)\)$/s, '$2');
    const bareChordLetter = chordy && /^[vcb]$/i.test(debracket.trim());
    const sq = line.startsWith('[') && line.endsWith(']');
    const pr = !sq && line.startsWith('(') && line.endsWith(')');
    if ((sq || pr) && !bareChordLetter) {
      const inner = line.slice(1, -1).trim();
      const sec = sectionLabel(inner, allowBare);
      if (sec) { sawHeader = true; items.push({ t: 'label', v: sec }); continue; }
      if (sq) {
        // Bracket-only chords ("[C] [G]") are notation, not a title — drop.
        if (line.replace(BRACKET_CHORD_RE, '').replace(/[\s[\]|]+/g, '') === '') continue;
        // Numeric markers — "[2]", "[x2]", "(3)" — are repeat/footnote
        // notes, not section names.
        if (/\d/.test(inner) && /^[x\d()\s.]*$/.test(inner)) continue;
        // Any other short bracket line keeps its historic meaning: a label.
        if (inner && inner.length < 40) { sawHeader = true; items.push({ t: 'label', v: normalizeGeneric(inner) }); continue; }
      }
      // Non-section "(…)" text falls through as an ordinary lyric line,
      // e.g. "(Oh no)" must never become a section called "Oh no".
    } else if (!bareChordLetter) {
      const sec = sectionLabel(line, allowBare);
      if (sec) { sawHeader = true; items.push({ t: 'label', v: sec }); continue; }
      if (line.endsWith(':') && line.length < 25) {
        const head = line.replace(/[:：]+$/, '').trim();
        // "B:" / "C:" / "Am:" in a chord chart are chord cues, not sections —
        // a head that is itself a chord token never opens a label here.
        // Full words ("Chorus:") can never be chord tokens, so they still do.
        if (!(chordy && CHORD_RE.test(head))) {
          const lab = normalizeGeneric(head);
          if (lab) { sawHeader = true; items.push({ t: 'label', v: lab }); continue; }
        }
      }
      // Inline header ("Chorus: Amazing grace", "Verse 1 - Hallelujah"): the
      // head parses as a section AND a colon/dash separates it from real
      // words, so split — the label opens the section, the tail stays lyric.
      // A lyric colon ("Amazing: grace how sweet") never splits because its
      // head is not a section.
      const inline = /^(.*?)\s*[:：]\s*(.+)$/.exec(line) || /^(.*?)\s+[–—-]\s*(.+)$/.exec(line);
      if (inline && inline[2].length > 3) {
        // Bare chord-letter heads ("C: …") stay chord cues in chordy pastes.
        const headRaw = inline[1].trim();
        const head = (chordy && /^[vcb]$/i.test(headRaw)) ? null : sectionLabel(headRaw, allowBare);
        if (head) {
          sawHeader = true;
          items.push({ t: 'label', v: head });
          // Continue below with the tail: it still gets noise/chord cleaning
          // like any lyric line (it just skips re-entering header checks).
          line = inline[2].trim();
        }
      }
    }

    // --- Noise: tab rhythm rows, decoration rules, repeat notes, count-ins
    // ("1 2 3 4", "1,2,3") and bare list markers ("1." / "(2)" lines with no
    // text after them). A whole line of only digits is a count-in on a chord
    // sheet, never a lyric.
    if (/^[a-g]?[\|*]?[\s\-0-9\|]{4,}$/.test(line)) continue;
    if (/^[\s│|·•*_=+#~-]+$/.test(line)) continue;
    if (/^x\s*\d+$/i.test(line) || /^[([]\s*x\s*\d+\s*[)\]]$/i.test(line)) continue;
    if (/^[([]?\d{1,2}[.)][)\]]?$/.test(line)) continue;
    if (/^\d[\d,\s/]*$/.test(line)) continue;

    // --- Chord rows only disappear inside a chart ---
    const kind = chordLineKind(line);
    if (chordy && (kind === 'strong' || kind === 'weak')) continue;

    let clean;
    if (chordy) {
      const words = line.replace(BRACKET_CHORD_RE, ' ').replace(PAREN_CHORD_RE, ' ').split(/\s+/).filter(Boolean);
      const kept = words.filter(w => !CHORD_RE.test(w));
      // A line that lost almost everything was a chord row in disguise.
      if (kept.length > 0 && words.length - kept.length > 3) continue;
      clean = kept.join(' ');
    } else {
      // Not a chart: keep every word, but inline [D] brackets are still
      // chord notation (section brackets were already consumed above).
      clean = line.replace(BRACKET_CHORD_RE, '');
    }
    clean = clean.replace(/\|/g, '').replace(/\s+/g, ' ').trim();
    if (clean) items.push({ t: 'text', v: clean });
  }

  // Pass 3 — build blocks.
  const whole = () => [{ label: 'Verse 1', text: original.trim() }];

  if (!sawHeader) {
    // No markers anywhere (the lyrics-site / plain-paste case):
    // stanza-split on blank lines.
    const stanzas = [];
    let cur = [];
    for (const it of items) {
      if (it.t === 'blank') { if (cur.length) { stanzas.push(cur); cur = []; } }
      else if (it.t === 'text') cur.push(it.v);
    }
    if (cur.length) stanzas.push(cur);

    if (stanzas.length === 0) return whole();
    if (stanzas.length === 1) {
      const lines = stanzas[0];
      // Unsegmented wall WITH repeated multi-line spans (the no-blank-lines
      // paste): the longest spread-out repeat is the chorus — e.g. a 7-line
      // chorus sung 3× around verse spans. Verse-only bunches never qualify
      // (V V C), and single-line echoes fall through to the legacy anchor
      // logic below. Verse spans stay whole (no recursion: inner repeats
      // would mislabel verse chunks as Chorus).
      const wall = segmentWallByRepeat(lines);
      if (wall) return wall;
      // A wall of text with a repeated line ("Hallelujah" ×3) is usually
      // verses around a chorus: split at each repeat and let the normal
      // stanza machinery (repeat → Chorus) label them, instead of blindly
      // chunking everything "Verse 1 (Part n)". Needs 2+ occurrences of a
      // substantial line; anything else falls through to chunking.
      const freq = new Map();
      for (const l of lines) {
        const k = l.trim().toLowerCase();
        if (k.length > 3) freq.set(k, (freq.get(k) || 0) + 1);
      }
      let anchor = null, best = 1;
      for (const [k, n] of freq) {
        if (n > best || (n === best && anchor === null)) { best = n; anchor = k; }
      }
      if (anchor) {
        const blocks = [];
        let cur = [];
        for (const l of lines) {
          if (l.trim().toLowerCase() === anchor && cur.length) { blocks.push(cur); cur = []; }
          cur.push(l);
        }
        if (cur.length) blocks.push(cur);
        if (blocks.length > 1) {
          // Hook-bunch chorus: tight anchor clusters (≤3 lines between
          // consecutive occurrences) backed by an anchor DESERT (≥3
          // anchor-less lines on either side) ARE the chorus — e.g. "Kanimo
          // Kanimo lang" at lines 2 and 4 with 12 verse lines after, or a
          // middle chorus with verse on both sides. Evenly spread anchors
          // ("Hallelujah" opening every stanza) fail the desert test and
          // keep the old numbering below.
          const isAnchor = (l) => l.trim().toLowerCase() === anchor;
          const occ = [];
          lines.forEach((l, i) => { if (isAnchor(l)) occ.push(i); });
          const bunches = [];
          let run = [];
          for (const p of occ) {
            // Gap ≤2 stays one section (hook restated inside it); gap ≥3 is
            // a structural boundary (a bridge between two choruses).
            if (run.length && p - run[run.length - 1] - 1 > 2) { bunches.push(run); run = []; }
            run.push(p);
          }
          if (run.length) bunches.push(run);
          const good = bunches.filter((b) => b.length >= 2 && (b[0] >= 3 || lines.length - 1 - b[b.length - 1] >= 3));
          if (good.length) {
            // Cut chorus spans (each extended back over a ≤2-line
            // anchor-free pickup — but only when the whole lead-in is that
            // short, so a verse tail is never eaten); the rest are verse
            // spans, grouped when near-identical.
            const spans = [];
            let pos = 0;
            const sorted = good.slice().sort((a, b) => a[0] - b[0]);
            for (const b of sorted) {
              let start = b[0];
              // Opening pickup only (pos === 0): a ≤2-line anchor-free
              // lead-in at the very top belongs to the chorus. Mid-song
              // short spans (bridges, tags) stand alone — never eaten.
              const lead = lines.slice(pos, start);
              if (pos === 0 && lead.length && lead.length <= 2 && !lead.some(isAnchor)) start = pos;
              if (start > pos) spans.push({ chorus: false, lines: lines.slice(pos, start) });
              spans.push({ chorus: true, lines: lines.slice(start, b[b.length - 1] + 1) });
              pos = b[b.length - 1] + 1;
            }
            if (pos < lines.length) spans.push({ chorus: false, lines: lines.slice(pos) });
            const verseGroups = [];
            let verseN = 0;
            const out = [];
            for (const s of spans) {
              if (!s.lines.length) continue;
              if (s.chorus) { out.push({ label: 'Chorus', text: s.lines.join('\n') }); continue; }
              const k = stanzaKey(s.lines);
              let g = verseGroups.find((gg) => gg.lines.length === s.lines.length && stanzaSim(gg.key, k) >= 0.85);
              if (!g) { verseN += 1; g = { key: k, lines: s.lines, n: verseN }; verseGroups.push(g); }
              out.push({ label: `Verse ${g.n}`, text: s.lines.join('\n') });
            }
            return out.length ? out : labelStanzas(blocks, false);
          }
          // No fuzzy here (see labelStanzas): anchor blocks alternate by
          // construction, so near-merging them would undo the split.
          const labeled = labelStanzas(blocks, false);
          // A trailing lone anchor ("…Hallelujah" alone at the end) is the
          // chorus restated, not a third verse — but only when the anchor is
          // substantial; a two-word tag ("oh oh") stays put.
          if (anchor.length >= 10) {
            const last = labeled[labeled.length - 1];
            if (last && last.text.trim().toLowerCase() === anchor) last.label = 'Chorus';
          }
          return labeled;
        }
      }
      const chunks = [];
      for (let i = 0; i < lines.length; i += splitN) chunks.push(lines.slice(i, i + splitN));
      if (chunks.length === 1) return [{ label: 'Verse 1', text: chunks[0].join('\n') }];
      return chunks.map((c, i) => ({ label: `Verse 1 (Part ${i + 1})`, text: c.join('\n') }));
    }
    return labelStanzas(stanzas);
  }

  // Marker-driven: headers open sections, everything else accumulates.
  const cues = [];
  let label = 'Verse 1';
  let buf = [];
  const flush = () => {
    const t = buf.join('\n').trim();
    if (t) cues.push({ label, text: t });
    buf = [];
  };
  for (const it of items) {
    if (it.t === 'label') { flush(); label = it.v || 'Verse'; }
    else if (it.t === 'text') buf.push(it.v);
  }
  flush();
  return cues.length ? cues : whole();
}

/**
 * Split blocks longer than linesPerSlide into "(Part n)" slides.
 * Preserves every other field on the cue (background, font…). Idempotent
 * for blocks that already fit.
 */
export function splitCuesByLines(cues, linesPerSlide) {
  const splitN = Math.max(1, Math.floor(Number(linesPerSlide) || 4));
  const out = [];
  for (const cue of Array.isArray(cues) ? cues : []) {
    if (!cue || typeof cue !== 'object') continue;
    const text = typeof cue.text === 'string' ? cue.text : '';
    if (!text.trim()) continue; // drop empty blocks
    const lines = text.split('\n').filter(l => l.trim() !== '');
    if (lines.length <= splitN) { out.push(cue); continue; }
    const baseLabel = (typeof cue.label === 'string' && cue.label.trim()) ? cue.label.trim() : 'Verse';
    for (let i = 0; i < lines.length; i += splitN) {
      const part = Math.floor(i / splitN) + 1;
      out.push({ ...cue, label: `${baseLabel} (Part ${part})`, text: lines.slice(i, i + splitN).join('\n') });
    }
  }
  return out;
}

/**
 * Normalise whatever the AI hands back into clean {label, text} blocks —
 * bare strings, missing labels or empty texts all get handled so the editor
 * can never receive a cue whose .text is undefined (which rendered as an
 * empty slide).
 */
export function sanitizeCues(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const t = item.trim();
      if (t) out.push({ label: `Verse ${out.length + 1}`, text: t });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const text = (typeof item.text === 'string' && item.text.trim())
      || (typeof item.lyrics === 'string' && item.lyrics.trim())
      || '';
    if (!text) continue;
    let label = (typeof item.label === 'string' && item.label.trim())
      || (typeof item.section === 'string' && item.section.trim())
      || '';
    if (!label) label = `Verse ${out.length + 1}`;
    out.push({ ...item, label, text: text.trim() });
  }
  return out;
}
