import React, { useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Film, Infinity as InfinityIcon, Palette, Trash2, LayoutGrid, List, Upload, FolderOpen, Link2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { ANIMATED_GRADIENTS } from './CountdownFace';
import AnimatedBg from './AnimatedBg';
import { VirtualMediaGrid, VirtualMediaList, MediaPoster } from '../lib/virtualMediaGrid';
import { pickAndImportMedia, relinkMediaSource, revealMediaSource } from '../lib/mediaImport';
import { toast } from '../untitledui/components/ui/toast';

// Center media browser (Media dock tab): filter chips with live counts,
// Newest/Name sort, grid/list views, uploads, and the built-in loop +
// gradient packs. Every visual asset in the app lives here; audio stays
// under the Audio tab (see the hint when audio files exist).
const FILTERS = [
  { id: 'all', label: 'All', icon: null },
  { id: 'image', label: 'Images', icon: ImageIcon },
  { id: 'video', label: 'Videos', icon: Film },
  { id: 'loop', label: 'Loops', icon: InfinityIcon },
  { id: 'gradient', label: 'Gradients', icon: Palette },
];

const fileNameOf = (url) => {
  try { return decodeURIComponent(String(url || '').split('/').pop().split('?')[0]) || url; }
  catch { return url; }
};

export default function MediaBrowser() {
  const {
    C, ACCENT, mediaLibrary, activeSong, applyMediaToActiveSong,
    removeMediaAsset, importMediaAsset, fetchMediaLibrary,
  } = useApp();
  const fileRef = useRef(null);
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('recent');
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('kog-media-view') || 'grid'; } catch { return 'grid'; }
  });
  const setViewPersist = (v) => {
    setView(v);
    try { localStorage.setItem('kog-media-view', v); } catch {}
  };

  // Recently used first (the DB orders by last_used_at). The library is
  // uncapped, so nothing is trimmed here: the virtualized grid below mounts
  // only the tiles on screen, whether the list holds ten files or ten thousand.
  const uploads = useMemo(() => {
    const pics = [];
    const vids = [];
    for (const a of mediaLibrary || []) {
      if (a.kind === 'video') vids.push(a);
      else if (a.kind === 'image') pics.push(a);
    }
    return [...pics, ...vids];
  }, [mediaLibrary]);
  const audioCount = useMemo(() => (mediaLibrary || []).filter((a) => a.kind === 'audio').length, [mediaLibrary]);

  const items = useMemo(() => {
    const list = [
      ...uploads.map((a) => ({
        key: `u:${a.url}`, kind: a.kind, name: a.name || fileNameOf(a.url),
        url: a.url, builtin: false, createdAt: a.createdAt || null, lastUsedAt: a.lastUsedAt || null, asset: a,
        missing: !!a.missing, sourcePath: a.sourcePath || null,
      })),
      ...ANIMATED_GRADIENTS.map((g) => ({
        key: `loop:${g.id}`, kind: 'loop', name: g.name,
        animId: g.id, builtin: true, createdAt: null,
      })),
      ...GRADIENT_PACK.map((g) => ({
        key: `grad:${g.id}`, kind: 'gradient', name: g.name,
        css: g.css, builtin: true, createdAt: null,
      })),
    ];
    const shown = filter === 'all' ? list : list.filter((it) => it.kind === (filter === 'loop' ? 'loop' : filter === 'gradient' ? 'gradient' : filter));
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''));
    if (sort === 'name') return shown.sort(byName);
    // Recently used first (last_used_at, else upload time). Built-ins carry
    // neither and sink to the bottom.
    const when = (it) => {
      const t = Date.parse(it.lastUsedAt || it.createdAt || '');
      return Number.isFinite(t) ? t : 0;
    };
    return shown.sort((a, b) => {
      const ta = when(a);
      const tb = when(b);
      if (ta || tb) return tb - ta;
      return byName(a, b);
    });
  }, [uploads, filter, sort]);

  const counts = useMemo(() => ({
    all: uploads.length + ANIMATED_GRADIENTS.length + GRADIENT_PACK.length,
    image: uploads.filter((a) => a.kind === 'image').length,
    video: uploads.filter((a) => a.kind === 'video').length,
    loop: ANIMATED_GRADIENTS.length,
    gradient: GRADIENT_PACK.length,
  }), [uploads]);

  const applyBg = (it) => {
    if (!activeSong) return;
    if (it.kind === 'loop') applyMediaToActiveSong('animated', `anim:${it.animId}`);
    else if (it.kind === 'gradient') applyMediaToActiveSong('gradient', it.css);
    else applyMediaToActiveSong(it.kind, it.url);
  };

  // A tile whose source file is gone cannot be applied — the wall would just
  // go black. Offer the relink picker first, then apply if the file is back.
  const useItem = async (it) => {
    if (!it || it.builtin || !it.missing || !it.url) { applyBg(it); return; }
    const res = await relinkMediaSource(it.url);
    if (!res || !res.ok) return;
    try { await fetchMediaLibrary(); } catch {}
    applyBg(it);
  };

  const relink = async (it) => {
    if (!it || !it.url) return;
    const res = await relinkMediaSource(it.url);
    if (res && res.canceled) return;
    if (!res || !res.ok) {
      try { toast.add({ type: 'error', title: 'Could not relink', description: (res && res.error) || 'That file could not be used.', duration: 5000 }); } catch {}
      return;
    }
    try { toast.add({ type: 'success', title: 'Source relinked', description: 'Every song using this file works again.', duration: 3500 }); } catch {}
    try { await fetchMediaLibrary(); } catch {}
  };

  const reveal = async (it) => {
    const res = await revealMediaSource(it.url);
    if (res && res.ok) return;
    try { toast.add({ type: 'error', title: 'Source not available', description: (res && res.error) || 'That folder could not be opened.', duration: 5000 }); } catch {}
  };

  // STATIC STILLS ONLY. A video tile draws the poster the main-process pipeline
  // extracted (or borrows ONE element from the app-wide video budget until the
  // still lands) — never a decode per card. Three hundred clips are three
  // hundred small JPEGs, so mounting the tab costs no media pipelines at all.
  const thumb = (it) => {
    if (it.kind === 'loop') {
      return (
        <div style={{ width: '100%', height: '100%', background: '#000', position: 'relative', overflow: 'hidden' }}>
          <AnimatedBg value={`anim:${it.animId}`} k={0.25} />
          <span style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InfinityIcon size={13} color="#c084fc" />
          </span>
        </div>
      );
    }
    if (it.kind === 'gradient') return <div style={{ width: '100%', height: '100%', background: it.css }} />;
    return <MediaPoster asset={it.asset || { url: it.url, kind: it.kind }} />;
  };

  // Native OS picker → straight into SQLite; the library refetch keeps every
  // other panel in step. The DOM input stays as the non-Electron fallback.
  const importNative = async () => {
    if (!window.require) { if (fileRef.current) fileRef.current.click(); return; }
    const assets = await pickAndImportMedia({ kind: 'all' });
    if (assets.length) { try { await fetchMediaLibrary(); } catch {} }
  };

  const actions = (it) => (
    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {activeSong && (
        <button onClick={(e) => { e.stopPropagation(); useItem(it); }} title="Set as the open song's background" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: '#36C982', borderRadius: 6, fontSize: 10, fontWeight: 800, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Use</button>
      )}
      {!it.builtin && it.missing && (
        <button onClick={(e) => { e.stopPropagation(); relink(it); }} title="Find this file on this computer" style={{ background: 'rgba(255,69,69,0.14)', border: '1px solid rgba(255,69,69,0.55)', color: '#FF6B6B', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px 6px' }}><Link2 size={12} /></button>
      )}
      {!it.builtin && it.sourcePath && (
        <button onClick={(e) => { e.stopPropagation(); reveal(it); }} title={`Show in folder\n${it.sourcePath}`} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex', padding: 4 }}><FolderOpen size={12} /></button>
      )}
      {!it.builtin && (
        <button onClick={(e) => { e.stopPropagation(); removeMediaAsset(it.asset); }} title="Remove from library" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex', padding: 4 }}><Trash2 size={12} /></button>
      )}
    </span>
  );

  return (
    <motion.div key="media" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      <div style={{ padding: '12px 18px 10px 18px', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {FILTERS.map((f) => {
            const on = filter === f.id;
            const Icon = f.icon;
            const n = counts[f.id === 'all' ? 'all' : f.id] ?? 0;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: on ? ACCENT : C.elevated2, border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'), color: on ? '#1C1C1E' : C.muted, borderRadius: 999, padding: '6px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: on ? '0 0 0 1px rgba(255,184,0,0.5), 0 6px 20px rgba(255,184,0,0.35)' : 'none' }}
              >
                {Icon ? <Icon size={12} /> : null}{f.label}
                <span style={{ fontSize: 10, fontWeight: 800, opacity: on ? 0.85 : 0.6 }}>{n}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={importNative} title="Add images and videos from this computer" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '6px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <Upload size={12} /> Upload
        </button>
        <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple style={{ display: 'none' }} onChange={(e) => {
          const files = Array.from(e.target.files || []);
          files.forEach((f) => importMediaAsset({ target: { files: [f] } }, f.type.startsWith('video') ? 'video' : 'image'));
          e.target.value = '';
        }} />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          title="Sort order"
          style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 700, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
        >
          <option value="recent">Recently used</option>
          <option value="name">Name A–Z</option>
        </select>
        <div style={{ display: 'flex', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: 2, gap: 2 }}>
          {[['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']].map(([v, Icon, tip]) => (
            <button key={v} onClick={() => setViewPersist(v)} title={tip} style={{ background: view === v ? ACCENT : 'transparent', border: 'none', color: view === v ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', boxShadow: view === v ? '0 0 12px rgba(255,184,0,0.45)' : 'none' }}><Icon size={14} /></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '2px 18px 8px 18px' }}>
        {!activeSong && (
          <div style={{ fontSize: 11, color: C.faint2, marginBottom: 8, flexShrink: 0 }}>Open a song to apply a background from here.</div>
        )}
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 20, textAlign: 'center', lineHeight: 1.6 }}>
            Nothing here yet — upload an image or video above.
          </div>
        ) : view === 'grid' ? (
          // Virtualized: only the rows on screen exist in the DOM. A 300-file
          // library scrolls at the cost of one row's worth of elements.
          <VirtualMediaGrid
            items={items}
            minColWidth={180}
            gap={12}
            rowHeight={176}
            overscanRows={2}
            style={{ flex: 1 }}
            renderItem={(it) => (
              <div key={it.key} style={{ background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ height: 104, flexShrink: 0, position: 'relative' }}>
                  {thumb(it)}
                  {it.missing && (
                    <span title="The source file is not on this computer right now" style={{ position: 'absolute', left: 6, top: 6, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,69,69,0.7)', color: '#FF6B6B', borderRadius: 6, padding: '2px 6px', fontSize: 9, fontWeight: 800, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
                      <AlertTriangle size={10} /> SOURCE MISSING
                    </span>
                  )}
                </div>
                <div style={{ padding: '7px 10px 8px 10px', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div title={it.sourcePath ? `${it.name}\n${it.sourcePath}` : it.name} style={{ fontSize: 12, fontWeight: 800, color: it.missing ? C.muted : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 4 }}>
                    {it.builtin
                      ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#36C982' }}>BUILT-IN</span>
                      : <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: C.faint, textTransform: 'uppercase' }}>{it.kind}</span>}
                    {actions(it)}
                  </div>
                </div>
              </div>
            )}
          />
        ) : (
          <VirtualMediaList
            items={items}
            rowHeight={64}
            gap={6}
            style={{ flex: 1 }}
            renderItem={(it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: 8, height: '100%', boxSizing: 'border-box' }}>
                <div style={{ width: 84, height: 47, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>{thumb(it)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div title={it.sourcePath || undefined} style={{ fontSize: 12.5, fontWeight: 800, color: it.missing ? C.muted : C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: it.missing ? '#FF6B6B' : C.faint, marginTop: 2 }}>{it.builtin ? 'BUILT-IN' : it.kind.toUpperCase()}{it.missing ? ' · SOURCE MISSING' : ''}</div>
                </div>
                {actions(it)}
              </div>
            )}
          />
        )}
      </div>

      <div style={{ padding: '6px 18px 10px 18px', fontSize: 10.5, color: C.faint2, flexShrink: 0 }}>
        {items.length} file{items.length === 1 ? '' : 's'}{audioCount > 0 ? ` · ${audioCount} audio file${audioCount === 1 ? '' : 's'} live under the Audio tab` : ''}
      </div>
    </motion.div>
  );
}
