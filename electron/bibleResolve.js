// Pure reference parsing/matching for the Scripture quick jump.
//
// Kept out of main.js so it can be unit-tested without Electron. This is
// what makes "1 peter", "2 chronicles 7" and "1 john 3:16" resolvable —
// the old regex was ^([a-zA-Z ]+?)… (letters and spaces ONLY), so every
// numbered book (1–2 Samuel, 1–3 Chronicles, 1–3 John, 1–2 Peter, …)
// could never parse and the renderer never even tried: its pre-filter
// routed anything starting with a digit into the full-text keyword
// search, which finds nothing for the literal words "1 peter".

/**
 * Parse a typed reference into its parts.
 * Accepts: "john", "john 3", "john3:16", "psalm 23", "1 peter",
 * "1peter", "1 john 3:16", "2 chronicles 7", "song of solomon 1:1".
 * Returns { bookNum, namePart, chapter, verse } or null when the input
 * cannot be a reference (pure keyword phrases, "3:16", "23 reasons", …).
 */
export function parseReference(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  //   1      2                                3:4 chapter:verse     5 chapter only (":" tolerated)
  const m = /^([1-3])?\s*([a-zA-Z][a-zA-Z ]*?)\s*(?:(\d+)\s*:\s*(\d+)|(\d+)\s*:?)?$/.exec(s);
  if (!m) return null;
  const namePart = (m[2] || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!namePart) return null;
  return {
    bookNum: m[1] || null,
    namePart,
    chapter: m[3] != null ? Number(m[3]) : (m[5] != null ? Number(m[5]) : null),
    verse: m[4] != null ? Number(m[4]) : null,
  };
}

/**
 * Does this book (given its possible display names) match the parsed
 * reference? names = [localized name, translation name, canonical name].
 *
 * With a leading book number the number is REQUIRED to match — "1 john"
 * must never resolve to the plain book of John. Without one, plain
 * prefix matching is kept ("gen" → Genesis) plus a word-boundary suffix
 * match so "peter" / "chronicles" / "corinthians" reach their numbered
 * books (first in canonical order = the "1" book).
 */
export function matchBook(names, parsed) {
  const list = (Array.isArray(names) ? names : [])
    .map(n => String(n || '').trim().toLowerCase())
    .filter(Boolean);
  if (!list.length || !parsed) return false;
  const np = parsed.namePart;

  if (parsed.bookNum) {
    const ROMAN = { 1: 'i', 2: 'ii', 3: 'iii' };
    const cands = [`${parsed.bookNum} ${np}`];
    if (ROMAN[parsed.bookNum]) cands.push(`${ROMAN[parsed.bookNum]} ${np}`);
    const tight = (s) => s.replace(/\s+/g, '');
    return list.some(s => cands.some(c =>
      s === c || s.startsWith(c) || tight(s) === tight(c) || tight(s).startsWith(tight(c))));
  }

  return list.some(s =>
    s === np || s.startsWith(np) || (np.length >= 3 && s.includes(` ${np}`)));
}
