// The "Recent" strip in Slide Setup used to be `mediaLibrary.slice(0, 5)` —
// i.e. the five newest uploads, frozen for the life of the session. It never
// changed when you applied a background, because nothing recorded what you
// applied. This keeps a small most-recently-used list instead, so the strip
// answers "what did I just use?" and updates the moment a background lands.
//
// Stored in localStorage (per machine, like the other operator preferences),
// newest first, de-duplicated by URL, capped so it stays a strip.

const KEY = 'kog_recent_bg_media';
const EVENT = 'kog-recent-media';
const MAX = 12;

let cache = null;

const read = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r) => r && typeof r.url === 'string' && (r.kind === 'image' || r.kind === 'video'))
      .slice(0, MAX);
  } catch {
    return [];
  }
};

export const readRecentMedia = () => {
  if (cache === null) cache = read();
  return cache;
};

// Called wherever a media background is actually applied (this slide, the
// whole song, or from the Media tab). Colours, gradients and motion loops are
// not remembered: they are one click away and would crowd out the photos.
export const rememberRecentMedia = (kind, url) => {
  if (!url || (kind !== 'image' && kind !== 'video')) return readRecentMedia();
  const next = [{ kind, url }, ...readRecentMedia().filter((r) => r.url !== url)].slice(0, MAX);
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch {}
  return next;
};

// Keeps a component's copy live: remember{} fires the event, the subscriber
// re-reads the cache (so two panels never drift apart).
export const subscribeRecentMedia = (fn) => {
  const handler = () => { cache = null; fn(readRecentMedia()); };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
};

// What the strip renders: the operator's own history first, then the newest
// library uploads so a fresh install still shows something to click.
export const recentMediaList = (library, limit = 6) => {
  const byUrl = new Map(((library || []).filter((a) => a && a.url)).map((a) => [a.url, a]));
  const out = [];
  const seen = new Set();
  for (const r of readRecentMedia()) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    const hit = byUrl.get(r.url);
    out.push({ url: r.url, kind: r.kind, name: hit?.name || '' });
    if (out.length >= limit) return out;
  }
  for (const a of library || []) {
    if (a.kind !== 'image' && a.kind !== 'video') continue;
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    out.push({ url: a.url, kind: a.kind, name: a.name || '' });
    if (out.length >= limit) break;
  }
  return out;
};
