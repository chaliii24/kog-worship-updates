import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Film, Plus, Search, Upload, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';

// Video-domain shared bits: the system left sidebar (library browser) and
// the Videos center workspace (player + Up Next) both run off the playlist
// state lifted into App context (`videoList` / `videoIdx`), and both need
// these helpers — one home so the two can never drift apart.

export const ACCEPT = '.mp4,.webm,.mov';
const LS_KEY = 'kog-video-playlist';
const LS_VIEW = 'kog-video-view';

export function loadVideoList() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    return (Array.isArray(raw) ? raw : []).filter((v) => v && typeof v.url === 'string' && v.url);
  } catch { return []; }
}

export function saveVideoList(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {}
}

export function clearVideoList() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

// Real filename for library rows (same <timestamp>-<rand>-<name> scheme the
// importer writes); playlist rows carry their own name already.
export function libName(a) {
  try {
    if (a && a.name) return String(a.name).replace(/\.[^.]+$/, '');
    const base = decodeURIComponent(String((a && a.url) || '').split('/').pop().split('?')[0] || '');
    const m = base.match(/^\d+-[a-z0-9]+-(.+)$/i);
    return ((m ? m[1] : base).replace(/\.[^.]+$/, '') || 'video');
  } catch { return 'video'; }
}

export function extOf(url) {
  const m = /\.([a-z0-9]+)(?:\?.*)?$/i.exec(String(url || ''));
  return (m ? m[1] : '').toLowerCase();
}

// ---- Static previews --------------------------------------------------------
// The video element itself, muted with metadata preloaded: Chromium paints
// the first frame without ever playing, so every row shows a real static
// preview of its file. Same pattern MediaBrowser's thumbs use. Deliberately
// NOT a canvas grab — drawing a media:// frame to canvas taints it and
// toDataURL throws, which is why rows used to fall back to the film icon.
// Anything unloadable still falls back to the icon; a thumb never breaks.
export function VideoThumb({ url, h = 64, rounded = 7 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [url]);
  if (!url || failed) {
    return (
      <div style={{ width: '100%', height: h, borderRadius: rounded, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b' }}>
        <Film size={Math.max(14, Math.min(26, h * 0.4))} />
      </div>
    );
  }
  return (
    <video
      src={url}
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      onError={() => setFailed(true)}
      style={{ width: '100%', height: h, objectFit: 'cover', display: 'block', borderRadius: rounded, background: '#000', pointerEvents: 'none' }}
    />
  );
}

// The Videos tab's library, living in the SYSTEM left sidebar (same shell as
// Service Order / Songs) instead of inside the center workspace. Click cues
// into the booth player (wall untouched — cueing must never disturb what is
// live); + Queue appends to Up Next. The player resets its own clocks when
// the cued url changes, so this side never reaches into transport state.
export default function VideoLibrarySidebar() {
  const { C, ACCENT, mediaLibrary, persistMediaFile, displays, videoList: list, setVideoList: setList, videoIdx: idx, setVideoIdx: setIdx } = useApp();
  const fileRef = useRef(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState(() => { try { return localStorage.getItem(LS_VIEW) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(LS_VIEW, view); } catch {}
  }, [view]);

  const cur = list[Math.min(idx, Math.max(0, list.length - 1))] || null;
  const wallContent = (displays || []).find((d) => d.id === 1)?.content || null;
  const liveUrl = wallContent && wallContent.video && wallContent.video.action !== 'stop' ? wallContent.video.url : null;

  const libVids = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = (mediaLibrary || []).filter((a) => a && a.kind === 'video' && a.url);
    if (q) rows = rows.filter((a) => libName(a).toLowerCase().includes(q));
    if (typeFilter !== 'all') rows = rows.filter((a) => extOf(a.url) === typeFilter);
    rows = [...rows].sort((a, b) => {
      if (sort === 'name') return libName(a).localeCompare(libName(b));
      const da = a.createdAt || '', db = b.createdAt || '';
      if (da && db && da !== db) return db < da ? -1 : 1;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return libName(a).localeCompare(libName(b));
    });
    return rows;
  }, [mediaLibrary, query, typeFilter, sort]);

  const cueAt = (i) => {
    if (i < 0 || i >= list.length) return;
    setIdx(i);
  };

  const queue = (a) => {
    if (!a || !a.url) return;
    const at = list.findIndex((v) => v.url === a.url);
    if (at >= 0) { setIdx(at); return; }
    setList((prev) => [...prev, { url: a.url, name: libName(a) }]);
    setIdx(list.length);
  };

  // Append-only twin for building the rundown while something else is cued —
  // the booth selection never moves.
  const queueOnly = (a) => {
    if (!a || !a.url) return;
    if (list.some((v) => v.url === a.url)) return;
    setList((prev) => [...prev, { url: a.url, name: libName(a) }]);
  };

  const addFiles = async (files) => {
    const vids = [...(files || [])].filter((f) => f && /\.(mp4|webm|mov)$/i.test(f.name || ''));
    if (!vids.length || busy) return;
    setBusy(true);
    try {
      const fresh = [];
      for (const f of vids) {
        try {
          const url = await persistMediaFile(f);
          if (url) fresh.push({ url, name: String(f.name || 'video').replace(/\.[^.]+$/, '') });
        } catch {}
      }
      if (fresh.length) {
        setList((prev) => {
          const have = new Set(prev.map((v) => v.url));
          return [...prev, ...fresh.filter((v) => !have.has(v.url))];
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer && e.dataTransfer.files); }}
      style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: dragOver ? 'rgba(139,92,246,0.08)' : 'transparent' }}
    >
      <div style={{ flexShrink: 0, padding: '10px 12px 8px 12px', borderBottom: '1px solid var(--ui-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Library{libVids.length ? ` · ${libVids.length}` : ''}</span>
          <span style={{ flex: 1 }} />
          <label title="Add videos (MP4 / WebM / MOV)" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <Upload size={13} />
            <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </label>
          <button onClick={() => setView((x) => (x === 'grid' ? 'list' : 'grid'))} title={view === 'grid' ? 'Compact list view' : 'Thumbnail grid view'} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>{view === 'grid' ? <ListIcon size={13} /> : <LayoutGrid size={13} />}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '5px 9px', marginTop: 8 }}>
          <Search size={12} color={C.faint} style={{ flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 11.5, width: '100%', minWidth: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['mp4', 'MP4'], ['webm', 'WebM'], ['mov', 'MOV']].map(([v, lbl]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{ borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', background: typeFilter === v ? 'rgba(139,92,246,0.16)' : 'transparent', border: typeFilter === v ? '1px solid rgba(139,92,246,0.5)' : '1px solid var(--ui-border2)', color: typeFilter === v ? '#C4B5FD' : C.muted }}>{lbl}</button>
          ))}
          <span style={{ flex: 1 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort order" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, color: C.muted, fontSize: 10.5, fontWeight: 700, padding: '4px 6px', cursor: 'pointer', outline: 'none' }}>
            <option value="recent">Recent first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        {busy && <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginTop: 6, textAlign: 'center' }}>Copying into the library…</div>}
        {dragOver && <div style={{ fontSize: 11, fontWeight: 800, color: '#C4B5FD', marginTop: 6, textAlign: 'center' }}>Drop to add to the library</div>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {libVids.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', padding: 18, lineHeight: 1.7 }}>
            {query || typeFilter !== 'all' ? 'Nothing matches — clear the search or filter.' : 'No videos yet — drop files here or use Add above.'}
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 gap-2">
            {libVids.map((a) => {
              const queued = list.some((v) => v.url === a.url);
              const isLive = liveUrl === a.url;
              const isCued = cur && cur.url === a.url;
              return (
                <div key={a.url} style={{ background: C.elevated2, border: '1px solid ' + (isLive ? 'rgba(239,68,68,0.6)' : isCued ? 'rgba(34,197,94,0.45)' : 'var(--ui-border2)'), borderRadius: 9, overflow: 'hidden' }}>
                  <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <VideoThumb url={a.url} h={72} rounded={0} />
                  </button>
                  <div style={{ padding: '6px 8px' }}>
                    <div title={libName(a)} style={{ fontSize: 11, fontWeight: 700, color: isLive ? '#f87171' : isCued ? '#4ade80' : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{libName(a)}</div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 5 }}>
                      <button onClick={() => queue(a)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 6, padding: '3px 0', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>Cue</button>
                      <button onClick={() => queueOnly(a)} title="Add to Up Next without cueing" style={{ flex: 1, background: queued ? 'rgba(139,92,246,0.16)' : 'transparent', border: '1px solid ' + (queued ? 'rgba(139,92,246,0.5)' : 'var(--ui-border2)'), color: queued ? '#C4B5FD' : C.muted, borderRadius: 6, padding: '3px 0', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Plus size={10} /> Queue</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {libVids.map((a) => {
              const queued = list.some((v) => v.url === a.url);
              const isLive = liveUrl === a.url;
              const isCued = cur && cur.url === a.url;
              return (
                <div key={a.url} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated2, border: '1px solid ' + (isLive ? 'rgba(239,68,68,0.6)' : isCued ? 'rgba(34,197,94,0.45)' : 'var(--ui-border2)'), borderRadius: 9, padding: '6px 8px 6px 6px', minWidth: 0 }}>
                  <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ width: 72, flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                    <VideoThumb url={a.url} h={42} />
                  </button>
                  <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: isLive ? '#f87171' : isCued ? '#4ade80' : C.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{libName(a)}</button>
                  <button onClick={() => queueOnly(a)} title="Add to Up Next without cueing" style={{ background: queued ? 'rgba(139,92,246,0.16)' : 'transparent', border: '1px solid ' + (queued ? 'rgba(139,92,246,0.5)' : 'var(--ui-border2)'), color: queued ? '#C4B5FD' : C.muted, borderRadius: 6, padding: '4px 7px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><Plus size={10} /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

