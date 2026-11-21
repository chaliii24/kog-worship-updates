import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Upload, LayoutGrid, List as ListIcon } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VirtualMediaGrid, VirtualMediaList, MediaPoster } from '../lib/virtualMediaGrid';
import { pickAndImportMedia } from '../lib/mediaImport';

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
// A row preview is a STILL, not a video element. The main process extracts one
// frame per clip into the thumbs folder during background indexing and caches
// it in SQLite, so a 300-clip library mounts 300 small <img> tags instead of 300
// media pipelines. Until a clip's still exists the tile borrows ONE element from
// the app-wide video budget (lib/videoSlots.js) and swaps to the image the
// moment the pipeline reports it — never blank, and never a decoder per card.
export function VideoThumb({ url, asset, h = 64, rounded = 7 }) {
  return (
    <MediaPoster
      asset={asset || { url, kind: 'video' }}
      rounded={rounded}
      style={{ height: h }}
      imgStyle={{ borderRadius: rounded }}
    />
  );
}

// The Videos tab's library, living in the SYSTEM left sidebar (same shell as
// Service Order / Songs) instead of inside the center workspace. Click cues
// into the booth player (wall untouched — cueing must never disturb what is
// live); + Queue appends to Up Next. The player resets its own clocks when
// the cued url changes, so this side never reaches into transport state.
export default function VideoLibrarySidebar() {
  const {
    C, mediaLibrary, persistMediaFile, fetchMediaLibrary, displays,
    videoList: list, setVideoList: setList, videoIdx: idx, setVideoIdx: setIdx,
  } = useApp();
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

  const appendFresh = (fresh) => {
    if (!fresh.length) return;
    setList((prev) => {
      const have = new Set(prev.map((v) => v.url));
      return [...prev, ...fresh.filter((v) => !have.has(v.url))];
    });
  };

  // Drag & drop / legacy File path — unchanged.
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
      appendFresh(fresh);
    } finally {
      setBusy(false);
    }
  };

  // Native picker path: the OS dialog returns real paths, main copies and
  // registers them in SQLite, and the whole library — not just this queue —
  // picks up the new clips.
  const addNative = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const assets = await pickAndImportMedia({ kind: 'video' });
      appendFresh(assets.map((a) => ({ url: a.url, name: String(a.name || 'video').replace(/\.[^.]+$/, '') })));
      if (assets.length) { try { await fetchMediaLibrary(); } catch {} }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer && e.dataTransfer.files); }}
      style={{ flex: 1, minHeight: 0, height: '100%', display: 'flex', flexDirection: 'column', background: dragOver ? 'rgba(255,184,0,0.08)' : 'transparent' }}
    >
      <div style={{ flexShrink: 0, padding: '10px 12px 8px 12px', borderBottom: '1px solid var(--ui-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Library{libVids.length ? ` · ${libVids.length}` : ''}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={addNative} title="Add videos from this computer (MP4 / WebM / MOV)" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>
            <Upload size={13} />
          </button>
          <button onClick={() => setView((x) => (x === 'grid' ? 'list' : 'grid'))} title={view === 'grid' ? 'Compact list view' : 'Thumbnail grid view'} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}>{view === 'grid' ? <ListIcon size={13} /> : <LayoutGrid size={13} />}</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '5px 9px', marginTop: 8 }}>
          <Search size={12} color={C.faint} style={{ flexShrink: 0 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search videos…" style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 11.5, width: '100%', minWidth: 0 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
          {[['all', 'All'], ['mp4', 'MP4'], ['webm', 'WebM'], ['mov', 'MOV']].map(([v, lbl]) => (
            <button key={v} onClick={() => setTypeFilter(v)} style={{ borderRadius: 999, padding: '3px 11px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', background: typeFilter === v ? 'rgba(255,184,0,0.16)' : 'transparent', border: typeFilter === v ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border2)', color: typeFilter === v ? '#FFC72C' : C.muted }}>{lbl}</button>
          ))}
          <span style={{ flex: 1 }} />
          <select value={sort} onChange={(e) => setSort(e.target.value)} title="Sort order" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, color: C.muted, fontSize: 10.5, fontWeight: 700, padding: '4px 6px', cursor: 'pointer', outline: 'none' }}>
            <option value="recent">Recent first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
        {busy && <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginTop: 6, textAlign: 'center' }}>Copying into the library…</div>}
        {dragOver && <div style={{ fontSize: 11, fontWeight: 800, color: '#FFC72C', marginTop: 6, textAlign: 'center' }}>Drop to add to the library</div>}
      </div>

      {libVids.length === 0 ? (
        <div style={{ fontSize: 12, color: C.faint, textAlign: 'center', padding: 18, lineHeight: 1.7 }}>
          {query || typeFilter !== 'all' ? 'Nothing matches — clear the search or filter.' : 'No videos yet — drop files here or use Add above.'}
        </div>
      ) : view === 'grid' ? (
        <VirtualMediaGrid
          items={libVids}
          minColWidth={128}
          gap={8}
          rowHeight={158}
          overscanRows={2}
          style={{ flex: 1, minHeight: 0, padding: 10 }}
          renderItem={(a) => {
            const queued = list.some((v) => v.url === a.url);
            const isLive = liveUrl === a.url;
            const isCued = cur && cur.url === a.url;
            return (
              <div key={a.url} style={{ background: C.elevated2, border: '1px solid ' + (isLive ? 'rgba(255,69,69,0.6)' : isCued ? 'rgba(54,201,130,0.45)' : 'var(--ui-border2)'), borderRadius: 9, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ display: 'block', width: '100%', height: 76, flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <VideoThumb url={a.url} asset={a} h={76} rounded={0} />
                </button>
                <div style={{ padding: '5px 7px 6px 7px', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div title={libName(a)} style={{ fontSize: 10.5, fontWeight: 700, color: isLive ? '#FF4545' : isCued ? '#36C982' : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{libName(a)}</div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    <button onClick={() => queue(a)} style={{ flex: 1, background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 6, padding: '3px 0', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Cue</button>
                    <button onClick={() => queueOnly(a)} title="Add to Up Next without cueing" style={{ flex: 1, background: queued ? 'rgba(255,184,0,0.16)' : 'transparent', border: '1px solid ' + (queued ? 'rgba(255,184,0,0.5)' : 'var(--ui-border2)'), color: queued ? '#FFC72C' : C.muted, borderRadius: 6, padding: '3px 0', fontSize: 10, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}><Plus size={9} /> Queue</button>
                  </div>
                </div>
              </div>
            );
          }}
        />
      ) : (
        <VirtualMediaList
          items={libVids}
          rowHeight={52}
          gap={6}
          overscan={8}
          style={{ flex: 1, minHeight: 0, padding: 10 }}
          renderItem={(a) => {
            const queued = list.some((v) => v.url === a.url);
            const isLive = liveUrl === a.url;
            const isCued = cur && cur.url === a.url;
            return (
              <div key={a.url} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated2, border: '1px solid ' + (isLive ? 'rgba(255,69,69,0.6)' : isCued ? 'rgba(54,201,130,0.45)' : 'var(--ui-border2)'), borderRadius: 9, padding: '5px 8px 5px 5px', minWidth: 0, height: '100%', boxSizing: 'border-box' }}>
                <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ width: 68, height: 40, flexShrink: 0, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
                  <VideoThumb url={a.url} asset={a} h={40} />
                </button>
                <button onClick={() => queue(a)} title={`Cue ${libName(a)}`} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: isLive ? '#FF4545' : isCued ? '#36C982' : C.text2, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{libName(a)}</button>
                <button onClick={() => queueOnly(a)} title="Add to Up Next without cueing" style={{ background: queued ? 'rgba(255,184,0,0.16)' : 'transparent', border: '1px solid ' + (queued ? 'rgba(255,184,0,0.5)' : 'var(--ui-border2)'), color: queued ? '#FFC72C' : C.muted, borderRadius: 6, padding: '4px 7px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}><Plus size={10} /></button>
              </div>
            );
          }}
        />
      )}
    </div>
  );
}
