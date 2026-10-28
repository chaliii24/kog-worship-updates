import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Film, Infinity as InfinityIcon, Palette, Trash2, LayoutGrid, List, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { ANIMATED_GRADIENTS } from './CountdownFace';
import AnimatedBg from './AnimatedBg';
import { LazyVideo } from '../lib/lazyVideo';

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
    removeMediaAsset, importMediaAsset,
  } = useApp();
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(() => {
    try { return localStorage.getItem('kog-media-view') || 'grid'; } catch { return 'grid'; }
  });
  const setViewPersist = (v) => {
    setView(v);
    try { localStorage.setItem('kog-media-view', v); } catch {}
  };

  const uploads = useMemo(() => (mediaLibrary || []).filter((a) => a.kind === 'image' || a.kind === 'video'), [mediaLibrary]);
  const audioCount = useMemo(() => (mediaLibrary || []).filter((a) => a.kind === 'audio').length, [mediaLibrary]);

  const items = useMemo(() => {
    const list = [
      ...uploads.map((a) => ({
        key: `u:${a.url}`, kind: a.kind, name: fileNameOf(a.url),
        url: a.url, builtin: false, createdAt: a.createdAt || null, asset: a,
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
    // Newest first (uploads carry created_at; built-ins have none and sink).
    return shown.sort((a, b) => {
      if (a.createdAt && b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
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

  const thumb = (it, h) => {
    const box = { width: '100%', height: h, background: '#000', position: 'relative', overflow: 'hidden', display: 'block' };
    if (it.kind === 'loop') {
      return (
        <div style={box}>
          <AnimatedBg value={`anim:${it.animId}`} k={0.25} />
          <span style={{ position: 'absolute', top: 6, left: 6, width: 22, height: 22, borderRadius: 6, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <InfinityIcon size={13} color="#c084fc" />
          </span>
        </div>
      );
    }
    if (it.kind === 'gradient') {
      return <div style={{ ...box, background: it.css }} />;
    }
    if (it.kind === 'video') {
      return <LazyVideo src={it.url} preload="metadata" playsInline muted style={box} />;
    }
    return <img src={it.url} alt="" loading="lazy" draggable={false} style={{ ...box, objectFit: 'cover' }} />;
  };

  const actions = (it) => (
    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {activeSong && (
        <button onClick={(e) => { e.stopPropagation(); applyBg(it); }} title="Set as the open song's background" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: '#36C982', borderRadius: 6, fontSize: 10, fontWeight: 800, padding: '4px 9px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Use</button>
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
        <label style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '6px 11px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
          <Upload size={12} /> Upload
          <input type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple style={{ display: 'none' }} onChange={(e) => {
            const files = Array.from(e.target.files || []);
            files.forEach((f) => importMediaAsset({ target: { files: [f] } }, f.type.startsWith('video') ? 'video' : 'image'));
            e.target.value = '';
          }} />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          title="Sort order"
          style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 700, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
        >
          <option value="newest">Newest</option>
          <option value="name">Name A–Z</option>
        </select>
        <div style={{ display: 'flex', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: 2, gap: 2 }}>
          {[['grid', LayoutGrid, 'Grid view'], ['list', List, 'List view']].map(([v, Icon, tip]) => (
            <button key={v} onClick={() => setViewPersist(v)} title={tip} style={{ background: view === v ? ACCENT : 'transparent', border: 'none', color: view === v ? '#1C1C1E' : C.muted, borderRadius: 6, padding: '5px 8px', cursor: 'pointer', display: 'flex', boxShadow: view === v ? '0 0 12px rgba(255,184,0,0.45)' : 'none' }}><Icon size={14} /></button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '2px 18px 8px 18px', minHeight: 0 }}>
        {!activeSong && (
          <div style={{ fontSize: 11, color: C.faint2, marginBottom: 8 }}>Open a song to apply a background from here.</div>
        )}
        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: C.faint2, border: '1px dashed var(--ui-border2)', borderRadius: 10, padding: 20, textAlign: 'center', lineHeight: 1.6 }}>
            Nothing here yet — upload an image or video above.
          </div>
        ) : view === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, alignContent: 'start' }}>
            {items.map((it) => (
              <div key={it.key} style={{ background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ aspectRatio: '16 / 10' }}>{thumb(it, '100%')}</div>
                <div style={{ padding: '8px 10px 9px 10px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3 }}>
                    {it.builtin
                      ? <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: '#36C982' }}>BUILT-IN</span>
                      : <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, color: C.faint, textTransform: 'uppercase' }}>{it.kind}</span>}
                    {actions(it)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignContent: 'start' }}>
            {items.map((it) => (
              <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: 8 }}>
                <div style={{ width: 96, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>{thumb(it, 54)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: C.faint, marginTop: 2 }}>{it.builtin ? 'BUILT-IN' : it.kind.toUpperCase()}</div>
                </div>
                {actions(it)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ padding: '6px 18px 10px 18px', fontSize: 10.5, color: C.faint2, flexShrink: 0 }}>
        {items.length} file{items.length === 1 ? '' : 's'}{audioCount > 0 ? ` · ${audioCount} audio file${audioCount === 1 ? '' : 's'} live under the Audio tab` : ''}
      </div>
    </motion.div>
  );
}
