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
// WIDENED SCOPE (offline-regex pass): chart metadata ([Capo 2], "Key: G",
// "120 BPM", © lines, site chrome like a lone "Lyrics"/"Embed") is dropped
// instead of becoming slide labels; lyrics-site junk is pre-cleaned
// (timestamps [00:12.34], "1." list numbers, markdown ##/** wrappers,
// "(x2)" notes); section types Rap/Spoken/Build/Vamp/Break were added;
// chord shapes grew (Em7b5, G7sus4, C(maj7), Cmaj7#11, N.C.); and the
// headerless chorus heuristic now compares stanzas LOOSELY (punctuation,
// annotations, trailing vocables) and scores repeats by frequency, then
// brevity, then non-opening position — fixing the identical-verse swap
// where V C V C labelled the verse as Chorus.
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
  'capo(?:\\s*[:=]?\\s*\\d{1,2})?\\s*(?:\\(.*\\))?',        // Capo 2 · Capo: 2
  '(?:original\\s+)?key\\s*(?:of|:|=)\\s*[a-g][#b]?(?:\\s*(?:m|min|minor|maj|major))?(?:\\s*[/,;-].*)?', // Key: G · Key of F#m
  '(?:tempo|speed)(?:\\s*bpm)?\\s*[:.=]?\\s*\\d{1,3}\\b.*', // Tempo: 120
  '\\d{2,3}\\s*(?:b\\.?p\\.?m\\.?)\\b.*',                   // 120 BPM
  '(?:time\\s*(?:signature)?|sig(?:nature)?)\\s*[:=]\\s*\\d+\\s*/\\s*\\d+.*', // Time: 4/4
  '\\d+\\s*/\\s*\\d+\\s*(?:time|signature)?',                // 4/4
  'tuning\\s*[:=].*',                                       // Tuning: Standard
  '(?:written|composed|arranged|lyrics|chords)\\s+by\\s+.*',
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
  intro: 'Intro', outro: 'Outro', ending: 'Ending', interlude: 'Interlude',
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
const SECTION_RE = /^(verse|chorus|pre[-\s]?chorus|post[-\s]?chorus|refrain|bridge|hook|tag|intro|outro|ending|interlude|instrumental|breakdown|break|solo|turnaround|link|coda|ad[-\s]?lib|rap|spoken|build|vamp)(.*)$/i;
const WORD_NUM = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6' };

/**
 * "Verse 1" / "[Chorus]" / "pre chorus:" / "Bridge (x2)" → canonical label.
 * Returns null for anything that is not a section (crucially, ordinary
 * lyric lines like "Bridge over troubled water" must NOT become headers).
 */
export function sectionLabel(str) {
  let s = String(str || '').trim();
  if (!s) return null;
  // "[Verse 1]" → unwrap a fully-wrapped string; "Chorus (x2)" → drop only
  // the trailing repeat/annotation marker. Then trailing punctuation.
  if (/^[(\[][^\)\]]*[)\]]$/.test(s)) s = s.slice(1, -1).trim();
  else s = s.replace(/[(\[][^)\]]*[)\]]\s*$/, '').trim();
  s = s.replace(/[\s:：.\-]+$/, '').trim();
  if (!s) return null;
  const m = SECTION_RE.exec(s);
  if (!m) return null;
  let rest = (m[2] || '').trim();
  if (/^x\s*\d+$/i.test(rest)) rest = '';
  const label = SECTION_CANON[m[1].toLowerCase().replace(/\s+/g, '-')];
  if (!label) return null;
  if (!rest) return label;
  const num = /^[-\s]*(?:no\.?|#|part)?[-\s]*(\d+)$/.exec(rest);
  if (num) return `${label} ${num[1]}`;
  const word = /^[-\s]*(one|two|three|four|five|six)$/i.exec(rest);
  if (word) return `${label} ${WORD_NUM[word[1].toLowerCase()]}`;
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

// Headerless lyrics: stanzas become Verse 1..N in order of first
// appearance; a repeating stanza becomes the Chorus.
//
// Choosing the chorus among multiple repeating stanzas scores, in order:
//   1. most occurrences (a chorus repeats most),
//   2. FEWEST lines on average (a chorus is tighter than a verse) —
//      this is what fixes the identical-verse trap: in V C V C where the
//      verse text repeats VERBATIM, "first repeat wins" used to label the
//      VERSE as Chorus and the chorus as Verse 1,
//   3. a non-opening stanza (songs usually open with a verse; when
//      everything ties, prefer the later repeat),
//   4. earliest first appearance.
// If NOTHING repeats there is no chorus — plain Verse 1..N, as before.
function labelStanzas(stanzas) {
  const order = [];
  const counts = new Map();
  const totalLines = new Map();
  const keys = stanzas.map(lines => {
    const k = stanzaKey(lines);
    if (counts.has(k)) counts.set(k, counts.get(k) + 1);
    else { counts.set(k, 1); order.push(k); }
    totalLines.set(k, (totalLines.get(k) || 0) + lines.length);
    return k;
  });

  const repeated = order.filter(k => counts.get(k) > 1);
  let chorusKey = null;
  if (repeated.length === 1) {
    chorusKey = repeated[0];
  } else if (repeated.length > 1) {
    const opener = order[0];
    let best = null;
    for (const k of repeated) {
      if (best === null) { best = k; continue; }
      const nk = counts.get(k), nb = counts.get(best);
      if (nk !== nb) { if (nk > nb) best = k; continue; }
      const ak = totalLines.get(k) / nk, ab = totalLines.get(best) / nb;
      if (ak !== ab) { if (ak < ab) best = k; continue; }
      const ok = k === opener ? 0 : 1, ob = best === opener ? 0 : 1;
      if (ok > ob) best = k;
    }
    chorusKey = best;
  }

  // Number the rest Verse 1..N in order of first appearance, skipping the
  // chorus group so labels never start at "Verse 2".
  const labelOf = new Map();
  let verseN = 0;
  for (const k of order) {
    if (k === chorusKey) labelOf.set(k, 'Chorus');
    else { verseN += 1; labelOf.set(k, `Verse ${verseN}`); }
  }

  return stanzas.map((lines, i) => ({ label: labelOf.get(keys[i]), text: lines.join('\n') }));
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

  for (const raw of rawLines) {
    let line = raw.trim();
    if (!line) {
      if (items.length && items[items.length - 1].t !== 'blank') items.push({ t: 'blank' });
      continue;
    }

    // --- Pre-clean: junk that wraps or precedes real content on lyrics
    // sites. Timestamps ([00:12.34] / LRC), numbered-list verse markers
    // ("1. Amazing grace", "(2) Great are You", "[3] …"), markdown fences
    // ("## Verse 1") and bold wrappers ("**Chorus**"). A line that becomes
    // empty is dropped WITHOUT a blank marker so it never splits a stanza.
    line = line.replace(/^\s*[([]?\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]?\s*/, '');
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

    // --- Section markers: [Verse 1], (Chorus), CHORUS, Verse 1: ---
    const sq = line.startsWith('[') && line.endsWith(']');
    const pr = !sq && line.startsWith('(') && line.endsWith(')');
    if (sq || pr) {
      const inner = line.slice(1, -1).trim();
      const sec = sectionLabel(inner);
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
    } else {
      const sec = sectionLabel(line);
      if (sec) { sawHeader = true; items.push({ t: 'label', v: sec }); continue; }
      if (line.endsWith(':') && line.length < 25) {
        const lab = normalizeGeneric(line.replace(/[:：]+$/, ''));
        if (lab) { sawHeader = true; items.push({ t: 'label', v: lab }); continue; }
      }
    }

    // --- Noise: tab rhythm rows, decoration rules, repeat notes and
    // bare list markers ("1." / "(2)" lines with no text after them).
    if (/^[a-g]?[\|*]?[\s\-0-9\|]{4,}$/.test(line)) continue;
    if (/^[\s│|·•*_=+#~-]+$/.test(line)) continue;
    if (/^x\s*\d+$/i.test(line) || /^[([]\s*x\s*\d+\s*[)\]]$/i.test(line)) continue;
    if (/^[([]?\d{1,2}[.)][)\]]?$/.test(line)) continue;

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
