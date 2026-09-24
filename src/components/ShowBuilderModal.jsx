import React from 'react';
import { Plus, Search, Trash2, Video, Monitor, LayoutGrid, ChevronDown, ChevronLeft, ChevronRight, Music, FileText, Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCountdown } from '../lib/constants';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';

export default function ShowBuilderModal() {
  const app = useApp();
  const {
    ACCENT,
    C,
    songs,
    showBuilder,
    setShowBuilder,
    builderSrcSongQuery,
    setBuilderSrcSongQuery,
    builderSheet,
    setBuilderSheet,
    builderTargetSecId,
    setBuilderTargetSecId,
    builderTargetSectionId,
    builderDensity,
    setBuilderDensity,
    builderTileIdx,
    builderCollapsed,
    setBuilderCollapsed,
    builderRehearse,
    setBuilderRehearse,
    builderActiveSong,
    builderSongDetails,
    serviceAddMenu,
    setServiceAddMenu,
    closeShowModal,
    addSongToSection,
    addSlideToSection,
    updateShowItem,
    addShowSection,
    renameShowSection,
    removeShowSection,
    showTotalSeconds,
    createShow,
    selectBuilderItem,
    builderGoLive,
    builderAdvance,
    addShowBuilderMedia,
    addShowBuilderPlaceholder,
    renderOutputPreview
  } = app;

const slideCount = (item) => {
  if (item?.songId) { const s = builderSongDetails[item.songId] || songs.find(x => x.id === item.songId); return s ? (s.cues || []).length + 1 : 1; }
  return 1;
};
const flat = []; let running = 0;
(showBuilder.sections || []).forEach((sec, si) => {
  sec.items.forEach((item, ii) => {
    const c = slideCount(item); flat.push({ si, ii, sec, item, start: running, c }); running += c;
  });
});
const total = flat.length > 0 ? flat.reduce((a, x) => a + x.c, 0) : 0;
const cur = flat.find(e => e.si === builderSheet?.secIdx && e.ii === builderSheet?.itemIdx);
const globalIdx = cur ? cur.start + builderTileIdx : 0;
const upNext = cur ? (builderTileIdx + 1 < cur.c ? { entry: cur, idx: builderTileIdx + 1 } : (flat.indexOf(cur) < flat.length - 1 ? { entry: flat[flat.indexOf(cur) + 1], idx: 0 } : null)) : null;
const sections = showBuilder.sections || [];
const targetSecId = builderTargetSectionId || sections[0]?.id || '';

const itemSlides = (it) => {
  if (it?.songId) {
    const s = builderActiveSong?.id === it.songId ? builderActiveSong : (builderSongDetails[it.songId] || songs.find(x => x.id === it.songId));
    if (!s) return [];
    return [{ type: 'title', text: s.title || '', sub: s.artist || '' }, ...(s.cues || []).map((c, i) => ({ type: 'cue', cue: c, num: i + 1, text: c.text || '', sub: c.label || '' }))];
  }
  if (it?.media_url) return [{ type: 'media', text: it.title || 'Media', sub: it.media_type || 'image', url: it.media_url, dur: it.duration }];
  return [{ type: 'slide', text: it?.content || '', sub: it?.title || 'Slide', dur: it?.duration }];
};

const slides = cur ? itemSlides(cur.item) : [];
const density = builderDensity;

return (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} key="show-builder-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', zIndex: 9999, flexDirection: 'column' }}>
    {/* TOP BAR */}
    <div style={{ height: 52, background: C.panel, borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
      <LayoutGrid size={18} color="#22c55e" />
      <input type="text" value={showBuilder.name} onChange={(e) => setShowBuilder({ ...showBuilder, name: e.target.value })} placeholder="Show Name" style={{ flex: 1, maxWidth: 220, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, fontWeight: 700, outline: 'none' }} />
      <input type="date" value={showBuilder.date} onChange={(e) => setShowBuilder({ ...showBuilder, date: e.target.value })} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
      <select value={showBuilder.category} onChange={(e) => setShowBuilder({ ...showBuilder, category: e.target.value })} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px', color: C.text, fontSize: 12, outline: 'none' }}>
        {['Worship', 'Sermon', 'Hymn', 'Announcement', 'Offering', 'Closing'].map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select value={showBuilder.ratio} onChange={(e) => setShowBuilder({ ...showBuilder, ratio: e.target.value })} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px', color: C.text, fontSize: 12, outline: 'none' }}>
        {['16:9', '16:10', '4:3', '9:16'].map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <span style={{ marginLeft: 'auto', fontSize: 12, color: C.muted }}>Planned: <b style={{ color: showTotalSeconds > 0 ? '#4ade80' : C.muted, fontFamily: 'monospace' }}>{formatCountdown(showTotalSeconds)}</b></span>
      <motion.button {...stubTap} onClick={closeShowModal} style={{ background: C.border, border: 'none', color: C.text, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Cancel</motion.button>
      <motion.button {...stubTap} onClick={createShow} style={{ background: '#22c55e', border: 'none', color: '#000', padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Create Show</motion.button>
    </div>

    {/* 3-Pane Body */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '260px 1fr 300px', overflow: 'hidden' }}>

      {/* LEFT PANEL — Service Order */}
      <div style={{ background: C.panel, borderRight: '1px solid var(--ui-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px 6px', borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.heading, textTransform: 'uppercase', letterSpacing: 1 }}>Service Order</span>
          <span style={{ fontSize: 10, background: C.elevated2, color: C.muted, borderRadius: 999, padding: '2px 7px' }}>{flat.length} items</span>
        </div>
        {/* Target section picker — all Add* actions go here */}
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--ui-border)', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Add to</span>
            <select
              value={targetSecId}
              onChange={(e) => setBuilderTargetSecId(e.target.value)}
              style={{ flex: 1, minWidth: 0, background: C.elevated2, border: '1px solid #4338ca', borderRadius: 5, padding: '4px 6px', color: C.accLine, fontSize: 10.5, fontWeight: 700, outline: 'none', cursor: 'pointer' }}
            >
              {sections.map(s => <option key={s.id} value={s.id}>{s.title || 'Untitled'} ({s.items.length})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            <button onClick={() => setServiceAddMenu(serviceAddMenu === 'builder-song' ? null : 'builder-song')} style={{ fontSize: 10, fontWeight: 700, background: '#1e1b4b', color: C.accLine, border: '1px solid #4338ca', borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>Add Song</button>
            <button onClick={() => { if (targetSecId) addSlideToSection(targetSecId); }} style={{ fontSize: 10, fontWeight: 700, background: C.elevated2, color: C.text2, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>Add Slide</button>
            <button onClick={() => document.getElementById('show-media-input-builder')?.click()} style={{ fontSize: 10, fontWeight: 700, background: C.elevated2, color: C.text2, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>Add Media</button>
            <input type="file" id="show-media-input-builder" accept="image/*,video/*" style={{ display: 'none' }} onChange={addShowBuilderMedia} />
            <button onClick={() => addShowBuilderPlaceholder('Announcement')} style={{ fontSize: 10, fontWeight: 700, background: C.elevated2, color: C.text2, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>Announcement</button>
          </div>
        </div>
        {/* Song Search Dropdown */}
        {serviceAddMenu === 'builder-song' && (
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--ui-border)' }}>
            <input type="text" autoFocus value={builderSrcSongQuery} onChange={(e) => setBuilderSrcSongQuery(e.target.value)} placeholder="Search songs..." style={{ width: '100%', background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 11, outline: 'none' }} />
            {builderSrcSongQuery.trim() && (
              <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 4 }}>
                {songs.filter(s => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(builderSrcSongQuery.toLowerCase())).slice(0, 6).map(s => (
                  <button key={s.id} onClick={() => { if (targetSecId) { addSongToSection(targetSecId, s); setBuilderSrcSongQuery(''); setServiceAddMenu(null); } }} style={{ width: '100%', textAlign: 'left', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '5px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', marginBottom: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 700 }}>{s.title}</span>
                    <span style={{ fontSize: 10, color: C.accLine }}>+Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Sections List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {(showBuilder.sections || []).map((sec, si) => {
            const collapsed = builderCollapsed.includes(sec.id);
            const secSelected = builderSheet?.secIdx === si;
            const isTarget = targetSecId === sec.id;
            return (
              <div key={sec.id}>
                <div
                  onClick={() => {
                    setBuilderTargetSecId(sec.id);
                    setBuilderCollapsed(prev => collapsed ? prev.filter(x => x !== sec.id) : [...prev, sec.id]);
                  }}
                  title={isTarget ? 'Target section for new items — click to collapse/expand' : 'Click to make this the target section and collapse/expand'}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer', background: isTarget ? 'rgba(59,130,246,0.10)' : secSelected ? 'rgba(34,197,94,0.06)' : 'transparent', borderBottom: isTarget ? '1px solid rgba(59,130,246,0.35)' : 'none' }}
                >
                  <span style={{ color: isTarget ? '#3B82F6' : C.muted }}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
                  <input type="text" value={sec.title} onChange={(e) => renameShowSection(sec.id, e.target.value)} onClick={(e) => e.stopPropagation()} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed var(--ui-border2)', color: isTarget ? '#93C5FD' : C.heading, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, outline: 'none', padding: '2px 0' }} />
                  {isTarget && <span style={{ fontSize: 8, fontWeight: 800, color: '#3B82F6', border: '1px solid rgba(59,130,246,0.5)', borderRadius: 4, padding: '0 4px' }}>ADD TO</span>}
                  <span style={{ fontSize: 9, color: C.muted, background: C.elevated2, borderRadius: 999, padding: '1px 5px' }}>{sec.items.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeShowSection(sec.id); }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex', padding: 1 }}><Trash2 size={11} /></button>
                </div>
                {!collapsed && sec.items.map((it, ii) => {
                  const isSelected = builderSheet?.secIdx === si && builderSheet?.itemIdx === ii;
                  let globalNum = 0;
                  for (let x = 0; x < si; x++) globalNum += showBuilder.sections[x].items.length;
                  globalNum += ii + 1;
                  const ItemIcon = it.songId ? Music : it.media_url ? ImageIcon : FileText;
                  return (
                    <div key={ii} onClick={() => { selectBuilderItem(si, ii); setBuilderTargetSecId(sec.id); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px 5px 28px', cursor: 'pointer', background: isSelected ? 'rgba(34,197,94,0.12)' : 'transparent', borderLeft: isSelected ? '3px solid #22c55e' : '3px solid transparent', fontSize: 11, transition: 'background 0.15s' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isSelected ? '#22c55e' : C.faint, minWidth: 18 }}>{globalNum}</span>
                      <span style={{ fontSize: 10, color: C.muted, display: 'flex' }}><ItemIcon size={10} /></span>
                      <span style={{ flex: 1, fontWeight: isSelected ? 700 : 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</span>
                      <span style={{ fontSize: 9, color: C.muted }}>{slideCount(it)}s</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <button onClick={addShowSection} style={{ width: '100%', background: 'transparent', border: '1px dashed var(--ui-border2)', color: C.faint, padding: '8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}><Plus size={12} /> Add Section</button>
        </div>
      </div>

      {/* CENTER PANEL — Slide Grid Canvas */}
      <div style={{ display: 'flex', flexDirection: 'column', background: C.body, overflow: 'hidden' }}>
        {/* Grid Controls */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Grid Density</span>
          {[1, 2, 3, 4].map(d => (
            <button key={d} onClick={() => setBuilderDensity(d)} style={{ width: 26, height: 22, borderRadius: 4, background: builderDensity === d ? ACCENT : C.elevated2, color: builderDensity === d ? '#fff' : C.muted, border: '1px solid var(--ui-border2)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>{d}</button>
          ))}
          {cur && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: C.text }}>{cur.sec.title} — {cur.item.title}</span>}
        </div>
        {/* Item Editor (non-song) */}
        {cur && !cur.item.songId && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--ui-border)', display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 80px', gap: 8, alignItems: 'center', background: C.panel }}>
            <input type="text" value={cur.item.title || ''} onChange={(e) => updateShowItem(cur.sec.id, cur.ii, { title: e.target.value })} placeholder="Slide title" style={{ background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
            {cur.item.media_url && cur.item.media_url ? (
              <span style={{ fontSize: 10, color: C.accLine, fontWeight: 700 }}>{cur.item.media_type === 'video' ? 'Video' : 'Image'} background set</span>
            ) : (
              <input type="text" value={cur.item.content || ''} onChange={(e) => updateShowItem(cur.sec.id, cur.ii, { content: e.target.value })} placeholder="Text / lyrics" style={{ background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="number" min="0" max="7200" value={cur.item.duration || 0} onChange={(e) => updateShowItem(cur.sec.id, cur.ii, { duration: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} title="Seconds on screen" style={{ width: 52, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
              <span style={{ fontSize: 9, color: C.faint }}>s</span>
            </div>
          </div>
        )}
        {/* Tile Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {slides.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${density}, 1fr)`, gap: 8 }}>
              {slides.map((sl, ti) => {
                const isActive = builderTileIdx === ti && cur;
                return (
                  <div key={ti} onClick={() => { if (cur) builderGoLive(cur, ti); }} style={{ position: 'relative', height: density <= 2 ? 130 : density === 3 ? 110 : 90, borderRadius: 8, overflow: 'hidden', background: sl.type === 'media' ? '#111' : C.input, border: isActive ? '2px solid #22c55e' : '1px solid var(--ui-border2)', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 8, boxSizing: 'border-box', transition: 'border 0.15s', boxShadow: isActive ? '0 0 12px rgba(34,197,94,0.25)' : 'none' }}>
                    {sl.type === 'media' && sl.url && (sl.sub === 'video' ? <video src={sl.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} muted /> : <img src={sl.url} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />)}
                    <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: 800, color: isActive ? '#22c55e' : C.faint, zIndex: 2 }}>#{ti + 1}</div>
                    <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 8, fontWeight: 800, background: isActive ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.08)', color: isActive ? '#22c55e' : C.muted, borderRadius: 4, padding: '1px 5px', zIndex: 2 }}>{sl.type === 'title' ? 'TITLE' : sl.type === 'cue' ? (sl.cue?.label || 'LYRIC') : sl.type === 'media' ? 'MEDIA' : 'SLIDE'}</div>
                    <p style={{ margin: 0, fontSize: density <= 2 ? 13 : 11, fontWeight: 700, color: C.text, textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', zIndex: 2, textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>{sl.text || '—'}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.faint2, fontSize: 12, padding: '40px 20px' }}>{cur ? 'No slides for this item.' : 'Select a service order item to view its slides.'}</div>
          )}
        </div>
        {/* Bottom Counter */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, background: C.panel }}>
          <button onClick={() => builderAdvance(-1)} disabled={!cur} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: cur ? C.text : C.faint, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: cur ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}><ChevronLeft size={14} /></button>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: 'monospace', color: C.text }}>{globalIdx + 1} <span style={{ color: C.muted }}>/</span> {total}</span>
          <button onClick={() => builderAdvance(1)} disabled={!cur} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: cur ? C.text : C.faint, borderRadius: 6, padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: cur ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {/* RIGHT PANEL — Live Preview & Monitoring */}
      <div style={{ background: C.panel, borderLeft: '1px solid var(--ui-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Live Monitor */}
        <div style={{ padding: '8px 10px 4px', borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Live Output</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => { builderAdvance(-1); }} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={12} /></button>
          <button onClick={() => { builderAdvance(1); }} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={12} /></button>
          <button onClick={() => setBuilderRehearse(v => !v)} style={{ background: builderRehearse ? 'rgba(234,179,8,0.2)' : C.elevated2, border: builderRehearse ? '1px solid rgba(234,179,8,0.5)' : '1px solid var(--ui-border2)', color: builderRehearse ? '#eab308' : C.muted, borderRadius: 4, padding: '2px 6px', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>{builderRehearse ? 'ON' : 'OFF'}</button>
        </div>
        <div style={{ padding: 8, flexShrink: 0 }}>
          {renderOutputPreview()}
        </div>
        {/* UP NEXT */}
        <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--ui-border)' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Up Next</span>
          {upNext ? (
            <div style={{ marginTop: 4, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px 8px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.accLine }}>{upNext.entry.sec.title} — {upNext.entry.item.title}</span>
              <p style={{ margin: '2px 0 0', fontSize: 10, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemSlides(upNext.entry.item)?.[upNext.idx]?.text || '—'}</p>
            </div>
          ) : (
            <p style={{ margin: '4px 0 0', fontSize: 10, color: C.faint2 }}>End of show</p>
          )}
        </div>
        {/* SERVICE FLOW */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 10px' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Service Flow</span>
          <div style={{ marginTop: 4, display: 'grid', gap: 3 }}>
            {flat.map((entry, fi) => {
              const isActive = cur && entry.si === cur.si && entry.ii === cur.ii;
              const ItemIcon = entry.item.songId ? Music : entry.item.media_url ? ImageIcon : FileText;
              return (
                <div key={fi} onClick={() => selectBuilderItem(entry.si, entry.ii)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, background: isActive ? 'rgba(34,197,94,0.1)' : 'transparent', cursor: 'pointer' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: isActive ? '#22c55e' : C.faint, minWidth: 16 }}>{fi + 1}</span>
                  <span style={{ fontSize: 9, color: C.muted, display: 'flex' }}><ItemIcon size={9} /></span>
                  <span style={{ flex: 1, fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? C.text : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.item.title}</span>
                  <span style={{ fontSize: 9, color: C.faint }}>{entry.c}s</span>
                </div>
              );
})}
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);
}
