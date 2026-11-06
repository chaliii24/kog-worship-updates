import React, { useState } from 'react';
import { Plus, Search, Trash2, Video, LayoutGrid, ChevronDown, ChevronLeft, ChevronRight, Music, FileText, Image as ImageIcon, ListMusic, Layers, Clock, Calendar, Settings2, BookOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { formatCountdown } from '../lib/constants';
import { stripMarkup } from '../lib/lyrics';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { LazyVideo } from '../lib/lazyVideo';
import { arrangedSongSlideTotal, arrangedSongCues, sequenceToFlow, summarizeFlow } from '../lib/arrangement';

// The asset kinds the palette offers. Song and Scripture read from the library
// and the offline Bible; Media covers images/videos already in the app, so a
// service can be laid out before its artwork exists.
const ASSET_TABS = [
  { id: 'song', label: 'Song' },
  { id: 'scripture', label: 'Scripture' },
  { id: 'media', label: 'Media' },
];

export default function ShowBuilderModal() {
  const app = useApp();
  const {
    ACCENT,
    ACCENT_SOFT,
    ACCENT_SOFT_2,
    PINK,
    PINK_SOFT,
    C,
    songs,
    bibleBooks,
    bibleTrans,
    showBuilder,
    setShowBuilder,
    builderSrcSongQuery,
    setBuilderSrcSongQuery,
    builderSheet,
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
    openArrangementForBuilderItem,
    closeShowModal,
    addSongToSection,
    addScriptureToBuilderSection,
    updateShowItem,
    removeShowItem,
    addShowSection,
    renameShowSection,
    removeShowSection,
    showTotalSeconds,
    createShow,
    selectBuilderItem,
    builderGoLive,
    builderAdvance,
    addShowBuilderMedia,
    addShowBuilderExistingMedia,
    renderOutputPreview,
    mediaLibrary,
    fetchMediaLibrary
  } = app;

  // Palette tab, the metadata popover and the scripture picker are
  // builder-local: the service-order sidebar has its own pickers and this modal
  // sits on top of it, so sharing one flag would leave the other one open
  // behind the modal.
  const [assetTab, setAssetTab] = useState('song');
  const [metaOpen, setMetaOpen] = useState(false);
  const [scBook, setScBook] = useState('');
  const [scChapter, setScChapter] = useState('');
  const [scVerses, setScVerses] = useState('');
  const [scBusy, setScBusy] = useState(false);
  const [scMsg, setScMsg] = useState(null);

const songOf = (item) => (item?.songId ? (builderSongDetails[item.songId] || songs.find(x => x.id === item.songId)) : null);
// A scripture item carries the finished Service Order payload; its raw verses
// are what make one tile per verse, exactly like the passage will play.
const scriptureVerses = (item) => {
  const src = (item?.scripture && item.scripture.meta && item.scripture.meta.source) || {};
  const list = Array.isArray(src.verses) ? src.verses.filter(v => v && (v.text || v.verse != null)) : [];
  return list.length ? list : [{ verse: null, text: item?.content || '' }];
};
const slideCount = (item) => {
  if (item?.scripture) return 1 + scriptureVerses(item).length;
  if (item?.songId) { const s = songOf(item); return s ? arrangedSongSlideTotal(s, item.arrangement) : 1; }
  return 1;
};
// What this item will actually play, and where that order comes from. A
// builder item can carry its own arrangement now — until Create Show turns it
// into a service row's meta.arrangement — so the tile strip, the counter and
// Go all read the same source.
const orderOf = (item) => {
  const overridden = !!(item?.arrangement && ((item.arrangement.flow || []).length || (item.arrangement.order || []).length));
  const song = songOf(item);
  if (!song) return { summary: '', overridden, hasSong: false };
  const flow = overridden ? (item.arrangement.flow || []) : sequenceToFlow(song);
  return { summary: flow.length ? summarizeFlow(flow) : '', overridden, hasSong: true };
};
const flat = []; let running = 0;
(showBuilder.sections || []).forEach((sec, si) => {
  sec.items.forEach((item, ii) => {
    const c = slideCount(item); flat.push({ si, ii, sec, item, start: running, c }); running += c;
  });
});
const total = flat.length > 0 ? flat.reduce((a, x) => a + x.c, 0) : 0;
const cur = flat.find(e => e.si === builderSheet?.secIdx && e.ii === builderSheet?.itemIdx);
// Clamped: switching from a 10-slide song to a 1-slide announcement left the
// old tile index behind — Up Next, the counter and the highlight then read an
// out-of-range slide.
const tileIdx = cur ? Math.max(0, Math.min(builderTileIdx, cur.c - 1)) : 0;
const globalIdx = cur ? cur.start + tileIdx : 0;
const upNext = cur ? (tileIdx + 1 < cur.c ? { entry: cur, idx: tileIdx + 1 } : (flat.indexOf(cur) < flat.length - 1 ? { entry: flat[flat.indexOf(cur) + 1], idx: 0 } : null)) : null;
const sections = showBuilder.sections || [];
const targetSecId = builderTargetSectionId || sections[0]?.id || '';
const targetTitle = sections.find(s => s.id === targetSecId)?.title || 'No section';

const itemSlides = (it) => {
  if (it?.scripture) {
    const src = (it.scripture.meta && it.scripture.meta.source) || {};
    const trans = String(src.translation || bibleTrans || '').toUpperCase();
    return [
      { type: 'title', text: it.scripture.title || it.title || '', sub: trans ? `Scripture · ${trans}` : 'Scripture' },
      ...scriptureVerses(it).map(v => ({
        type: 'cue',
        cue: { label: v.verse != null ? 'V' + v.verse : 'TEXT' },
        num: v.verse,
        text: v.text || '',
        sub: v.verse != null ? 'Verse ' + v.verse : 'Text',
      })),
    ];
  }
  if (it?.songId) {
    const s = builderActiveSong?.id === it.songId ? builderActiveSong : (builderSongDetails[it.songId] || songs.find(x => x.id === it.songId));
    if (!s) return [];
    // Order-first: the item's own arrangement when it has one, else the Song
    // Editor's sequence — never raw library order, so the grid, the count and
    // Go agree.
    return [{ type: 'title', text: s.title || '', sub: s.artist || '' }, ...arrangedSongCues(s, it.arrangement).map((c, i) => ({ type: 'cue', cue: c, num: i + 1, text: stripMarkup(c.text || ''), sub: c.label || '' }))];
  }
  if (it?.media_url) return [{ type: 'media', text: it.title || 'Media', sub: it.media_type || 'image', url: it.media_url, dur: it.duration }];
  return [{ type: 'slide', text: it?.content || '', sub: it?.title || 'Slide', dur: it?.duration }];
};

const slides = cur ? itemSlides(cur.item) : [];
const density = builderDensity;
const songMatches = (() => {
  const q = builderSrcSongQuery.trim().toLowerCase();
  return songs.filter(s => !q || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q));
})();
const mediaAssets = (mediaLibrary || []).filter(a => a.kind === 'image' || a.kind === 'video');
const chip = (active) => ({
  fontSize: 10, fontWeight: 700, cursor: 'pointer', borderRadius: 5,
  padding: '4px 2px', textAlign: 'center',
  background: active ? ACCENT_SOFT : 'transparent',
  border: '1px solid ' + (active ? ACCENT_SOFT_2 : 'transparent'),
  color: active ? ACCENT : C.muted,
});

// Scripture picker — the same book → chapter → verses flow the Service Order
// uses, so a verse is added the same way in both places.
const bookList = (bibleBooks && bibleBooks.books) || [];
const scBookObj = bookList.find(b => String(b.nr) === String(scBook));
const field = {
  width: '100%', boxSizing: 'border-box', background: C.elevated,
  border: '1px solid ' + C.border2, borderRadius: 6, padding: '5px 7px',
  color: C.text, fontSize: 11, outline: 'none', cursor: 'pointer'
};
const addScriptureNow = async () => {
  if (scBusy) return;
  if (!scBookObj) { setScMsg({ err: 'Choose a book.' }); return; }
  if (!scChapter) { setScMsg({ err: 'Choose a chapter.' }); return; }
  if (!targetSecId) { setScMsg({ err: 'Add a section first.' }); return; }
  setScBusy(true);
  setScMsg(null);
  try {
    const res = await addScriptureToBuilderSection({
      sectionId: targetSecId,
      bookIndex: scBookObj.nr,
      bookName: scBookObj.name,
      chapter: Number(scChapter),
      verseRange: scVerses,
    });
    if (res && res.ok) {
      setScMsg({ ok: `${res.ref} · ${res.count} verse${res.count === 1 ? '' : 's'} → ${res.target || 'section'}` });
      setScVerses('');
    } else {
      setScMsg({ err: (res && res.error) || 'Could not add that passage.' });
    }
  } finally {
    setScBusy(false);
  }
};

const iconBtn = { background: 'transparent', border: '1px solid transparent', color: C.faint, borderRadius: 4, padding: 2, cursor: 'pointer', display: 'flex', flexShrink: 0 };

return (
  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} key="show-builder-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', zIndex: 9999, flexDirection: 'column' }}>
    {/* TOP BAR — identity, metadata pill, plan totals, mode, commit */}
    <div style={{ height: 54, background: C.panel, borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0 }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: ACCENT, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <LayoutGrid size={14} color={C.bg} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.heading, whiteSpace: 'nowrap' }}>KOG</span>
        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', color: ACCENT, background: ACCENT_SOFT, border: '1px solid ' + ACCENT_SOFT_2, borderRadius: 999, padding: '1px 6px' }}>Builder</span>
      </div>

      <input type="text" value={showBuilder.name} onChange={(e) => setShowBuilder({ ...showBuilder, name: e.target.value })} placeholder="Show Name" style={{ flex: 1, maxWidth: 230, minWidth: 110, background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 7, padding: '7px 10px', color: C.text, fontSize: 13, fontWeight: 700, outline: 'none' }} />

      {/* Metadata pill — date • category • ratio behind one control, opened to
          edit. The popover is opaque: it sits over the canvas, and a
          see-through panel made the date fields unreadable. */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <button onClick={() => setMetaOpen(v => !v)} title="Show date, category and aspect ratio" style={{ display: 'flex', alignItems: 'center', gap: 7, background: C.elevated, border: '1px solid ' + (metaOpen ? ACCENT : C.border2), borderRadius: 999, padding: '5px 11px', color: C.text2, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Calendar size={11} color={C.faint} />
          <span style={{ color: C.text, fontWeight: 700 }}>{showBuilder.date || 'No date'}</span>
          <span style={{ color: C.faint2 }}>•</span>
          <span>{showBuilder.category || 'Worship'}</span>
          <span style={{ color: C.faint2 }}>•</span>
          <span>{showBuilder.ratio || '16:9'}</span>
          <Settings2 size={11} color={metaOpen ? ACCENT : C.faint} />
        </button>
        {metaOpen && (
          <div style={{ position: 'absolute', top: 34, right: 0, zIndex: 6, width: 232, background: C.panel, border: '1px solid ' + C.border2, borderRadius: 10, padding: 10, boxShadow: '0 18px 44px rgba(0,0,0,0.55)', display: 'grid', gap: 8 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Show metadata</span>
            <label style={{ display: 'grid', gap: 3 }}>
              <span style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.7 }}>Date</span>
              <input type="date" value={showBuilder.date} onChange={(e) => setShowBuilder({ ...showBuilder, date: e.target.value })} style={{ background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
            </label>
            <label style={{ display: 'grid', gap: 3 }}>
              <span style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.7 }}>Category</span>
              <select value={showBuilder.category} onChange={(e) => setShowBuilder({ ...showBuilder, category: e.target.value })} style={{ background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px', color: C.text, fontSize: 12, outline: 'none' }}>
                {['Worship', 'Sermon', 'Hymn', 'Announcement', 'Offering', 'Closing'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 3 }}>
              <span style={{ fontSize: 9, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.7 }}>Aspect ratio</span>
              <select value={showBuilder.ratio} onChange={(e) => setShowBuilder({ ...showBuilder, ratio: e.target.value })} style={{ background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px', color: C.text, fontSize: 12, outline: 'none' }}>
                {['16:9', '16:10', '4:3', '9:16'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
          <Clock size={11} color={ACCENT} /> Planned:
          <b style={{ color: showTotalSeconds > 0 ? PINK : C.muted, fontFamily: 'monospace' }}>{formatCountdown(showTotalSeconds)}</b>
        </span>
        <span style={{ width: 1, height: 14, background: C.border }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>
          <Layers size={11} color={C.faint} /> Items:
          <b style={{ color: C.text, fontFamily: 'monospace' }}>{flat.length}</b>
        </span>
      </div>

      {/* Creation works on the plan; Rehearsal / Live drives the output. One
          switch instead of a stray ON/OFF badge buried in the preview pane. */}
      <div style={{ display: 'flex', gap: 2, background: C.elevated2, border: '1px solid ' + C.border2, borderRadius: 8, padding: 2, flexShrink: 0 }}>
        <button onClick={() => setBuilderRehearse(false)} title="Build the show" style={{ fontSize: 10.5, fontWeight: 700, border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', background: builderRehearse ? 'transparent' : ACCENT, color: builderRehearse ? C.muted : C.bg }}>Creation</button>
        <button onClick={() => setBuilderRehearse(true)} title="Drive the live output while you build" style={{ fontSize: 10.5, fontWeight: 700, border: 'none', borderRadius: 6, padding: '4px 9px', cursor: 'pointer', background: builderRehearse ? ACCENT : 'transparent', color: builderRehearse ? C.bg : C.muted }}>Rehearsal / Live</button>
      </div>

      <motion.button {...stubTap} onClick={closeShowModal} style={{ background: C.elevated2, border: 'none', color: C.text, padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Cancel</motion.button>
      <motion.button {...stubTap} onClick={createShow} style={{ background: PINK, border: 'none', color: C.panel, padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}>Create Show</motion.button>
    </div>

    {/* 3-Pane Body */}
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '300px 1fr 300px', overflow: 'hidden' }}>

      {/* LEFT PANEL — asset palette, then the order being built */}
      <div style={{ background: C.panel, borderRight: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* LIBRARY ASSETS — one palette instead of four buttons that each
            opened their own menu; the target section is always named here. */}
        <div style={{ padding: '8px 10px', borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Library Assets</span>
            <span title={`New items go into "${targetTitle}"`} style={{ fontSize: 9.5, fontWeight: 700, color: ACCENT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Target: {targetTitle}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, background: C.elevated2, border: '1px solid ' + C.border2, borderRadius: 7, padding: 2 }}>
            {ASSET_TABS.map(t => (
              <button key={t.id} onClick={() => { setAssetTab(t.id); if (t.id === 'media') fetchMediaLibrary(); }} style={chip(assetTab === t.id)}>{t.label}</button>
            ))}
          </div>

          {assetTab === 'song' && (
            <div style={{ position: 'relative', marginTop: 6 }}>
              <Search size={11} color={C.faint} style={{ position: 'absolute', left: 7, top: 7, pointerEvents: 'none' }} />
              <input type="text" value={builderSrcSongQuery} onChange={(e) => setBuilderSrcSongQuery(e.target.value)} placeholder="Search songs..." style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: '1px solid ' + C.border2, borderRadius: 6, padding: '5px 8px 5px 22px', color: C.text, fontSize: 11, outline: 'none' }} />
            </div>
          )}

          <div style={{ marginTop: 6, maxHeight: 168, overflowY: 'auto', display: 'grid', gap: 3, alignContent: 'start' }}>
            {assetTab === 'song' && songMatches.map(s => (
              <button key={s.id} onClick={() => { if (targetSecId) { addSongToSection(targetSecId, s); setBuilderSrcSongQuery(''); } }} title={`Add "${s.title}" to ${targetTitle}`} style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left', background: C.elevated2, border: '1px solid ' + C.border2, color: C.text, padding: '5px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>
                <Plus size={10} color={ACCENT} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</span>
                <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>{s.artist || 'Unknown'}</span>
              </button>
            ))}
            {assetTab === 'song' && songs.length === 0 && <div style={{ fontSize: 10.5, color: C.faint2, padding: 4 }}>No songs in library yet.</div>}
            {assetTab === 'song' && songs.length > 0 && songMatches.length === 0 && <div style={{ fontSize: 10.5, color: C.faint2, padding: 4 }}>No matches for “{builderSrcSongQuery}”.</div>}

            {/* SCRIPTURE — same book/chapter/verses flow as the Service Order.
                The passage lands as a real scripture row when the show is
                created, not as a text slide. */}
            {assetTab === 'scripture' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  <BookOpen size={10} color={ACCENT} /> {bibleTrans ? bibleTrans.toUpperCase() : 'Bible'}
                </div>
                {!bibleBooks ? (
                  <div style={{ fontSize: 10.5, color: C.faint2, padding: 2 }}>Loading books…</div>
                ) : (
                  <>
                    <select value={scBook} onChange={(e) => { setScBook(e.target.value); setScChapter(''); setScMsg(null); }} title="Book" style={field}>
                      <option value="">Choose a book…</option>
                      {bookList.map(b => <option key={b.nr} value={b.nr}>{b.name}</option>)}
                    </select>
                    {scBookObj && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 4 }}>
                          <select value={scChapter} onChange={(e) => { setScChapter(e.target.value); setScMsg(null); }} title="Chapter" style={field}>
                            <option value="">Ch.</option>
                            {Array.from({ length: scBookObj.chapters || 0 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                          </select>
                          <input value={scVerses} onChange={(e) => { setScVerses(e.target.value); setScMsg(null); }} placeholder="Verses 16-18" title="Leave blank to add the whole chapter" style={{ ...field, cursor: 'text' }} />
                        </div>
                        <button onClick={addScriptureNow} disabled={scBusy} title={`Add this passage to ${targetTitle}`} style={{ background: ACCENT, border: 'none', color: C.bg, padding: '6px 8px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, cursor: scBusy ? 'default' : 'pointer', opacity: scBusy ? 0.7 : 1 }}>
                          {scBusy ? 'Reading…' : `Add to ${targetTitle}`}
                        </button>
                      </>
                    )}
                  </>
                )}
                {scMsg?.err && <div style={{ fontSize: 10, color: '#FF4545', lineHeight: 1.45 }}>{scMsg.err}</div>}
                {scMsg?.ok && <div style={{ fontSize: 10, color: PINK, lineHeight: 1.45 }}>{scMsg.ok}</div>}
                <div style={{ fontSize: 9.5, color: C.faint2, lineHeight: 1.45 }}>Blank verses = whole chapter, one tile per verse.</div>
              </>
            )}

            {assetTab === 'media' && (
              <>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => document.getElementById('show-media-input-builder')?.click()} style={{ flex: 1, minWidth: 0, fontSize: 10, fontWeight: 700, background: C.elevated2, color: C.text2, border: '1px solid ' + C.border2, borderRadius: 5, padding: '4px 7px', cursor: 'pointer' }}>+ Upload</button>
                  <span style={{ fontSize: 9, color: C.faint, alignSelf: 'center' }}>or pick below</span>
                </div>
                <input type="file" id="show-media-input-builder" accept="image/*,video/*" style={{ display: 'none' }} onChange={addShowBuilderMedia} />
                {mediaAssets.length === 0 ? (
                  <div style={{ fontSize: 10, color: C.faint2, border: '1px dashed ' + C.border2, borderRadius: 7, padding: '8px', textAlign: 'center', lineHeight: 1.5 }}>
                    No images/videos in the app yet — use + Upload.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                    {mediaAssets.map((asset, i) => {
                      const label = asset.name || (() => { try { return decodeURIComponent(asset.url.split('/').pop().split('?')[0]); } catch (_) { return 'Media'; } })();
                      return (
                        <button key={asset.url + i} onClick={() => addShowBuilderExistingMedia(asset)} title={`Add "${label}" — already in the app, no upload`} style={{ position: 'relative', padding: 0, height: 44, borderRadius: 7, overflow: 'hidden', border: '1px solid ' + C.border2, background: C.input, cursor: 'pointer' }}>
                          {asset.kind === 'image'
                            ? <img src={asset.url} alt={label} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <LazyVideo src={asset.url} muted playsInline preload="metadata" rootMargin="200px" style={{ width: '100%', height: '100%' }} />}
                          <span style={{ position: 'absolute', right: 3, bottom: 3, display: 'flex', alignItems: 'center', gap: 2, background: 'rgba(0,0,0,0.72)', borderRadius: 3, padding: '1px 3px', color: '#fff' }}>{asset.kind === 'video' ? <Video size={8} /> : <ImageIcon size={8} />}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* SERVICE ORDER */}
        <div style={{ padding: '8px 10px 6px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: C.heading, textTransform: 'uppercase', letterSpacing: 1 }}>Service Order</span>
          <span style={{ fontSize: 9, background: C.elevated2, color: C.muted, borderRadius: 999, padding: '2px 7px' }}>{flat.length} items</span>
        </div>
        <div style={{ padding: '6px 8px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>Add to</span>
          <select value={targetSecId} onChange={(e) => setBuilderTargetSecId(e.target.value)} title="Section that new songs, scripture and media go into" style={{ flex: 1, minWidth: 0, background: C.elevated, border: '1px solid ' + ACCENT, borderRadius: 5, padding: '4px 6px', color: ACCENT, fontSize: 10.5, fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
            {sections.map(s => <option key={s.id} value={s.id}>{s.title || 'Untitled'} ({s.items.length})</option>)}
          </select>
        </div>

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
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer', background: isTarget ? ACCENT_SOFT : secSelected ? PINK_SOFT : 'transparent', borderBottom: isTarget ? '1px solid ' + ACCENT_SOFT_2 : 'none' }}
                >
                  <span style={{ color: isTarget ? ACCENT : C.muted }}>{collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</span>
                  <input type="text" value={sec.title} onChange={(e) => renameShowSection(sec.id, e.target.value)} onClick={(e) => e.stopPropagation()} style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px dashed ' + C.border2, color: isTarget ? ACCENT : C.heading, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1, outline: 'none', padding: '2px 0' }} />
                  {isTarget && <span style={{ fontSize: 8, fontWeight: 800, color: ACCENT, border: '1px solid ' + ACCENT, borderRadius: 4, padding: '0 4px' }}>ADD TO</span>}
                  <span style={{ fontSize: 9, color: C.muted, background: C.elevated2, borderRadius: 999, padding: '1px 5px' }}>{sec.items.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeShowSection(sec.id); }} title={`Delete the ${sec.title} section`} style={iconBtn}><Trash2 size={11} /></button>
                </div>
                {!collapsed && sec.items.map((it, ii) => {
                  const isSelected = builderSheet?.secIdx === si && builderSheet?.itemIdx === ii;
                  let globalNum = 0;
                  for (let x = 0; x < si; x++) globalNum += showBuilder.sections[x].items.length;
                  globalNum += ii + 1;
                  const ItemIcon = it.scripture ? BookOpen : it.songId ? Music : it.media_url ? ImageIcon : FileText;
                  const order = it.songId ? orderOf(it) : null;
                  const scTrans = it.scripture && it.scripture.meta && it.scripture.meta.source && it.scripture.meta.source.translation;
                  return (
                    <div key={ii} onClick={() => { selectBuilderItem(si, ii); setBuilderTargetSecId(sec.id); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 20px', cursor: 'pointer', background: isSelected ? PINK_SOFT : 'transparent', borderLeft: isSelected ? '3px solid ' + PINK : '3px solid transparent', fontSize: 11, transition: 'background 0.15s' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: isSelected ? PINK : C.faint, minWidth: 18 }}>{globalNum}</span>
                      <span style={{ fontSize: 10, color: C.muted, display: 'flex' }}><ItemIcon size={10} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: isSelected ? 700 : 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                        {scTrans && (
                          <div style={{ fontSize: 8.5, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Scripture · {String(scTrans).toUpperCase()} · {scriptureVerses(it).length} verse{scriptureVerses(it).length === 1 ? '' : 's'}</div>
                        )}
                        {order && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 1, minWidth: 0 }}>
                            <span
                              title={order.overridden ? 'This item has its own play order' : 'This item follows the song’s order'}
                              style={{ fontSize: 8, fontWeight: 800, letterSpacing: 0.4, borderRadius: 3, padding: '0 4px', whiteSpace: 'nowrap', flexShrink: 0, color: order.overridden ? ACCENT : C.faint, background: order.overridden ? ACCENT_SOFT : 'transparent', border: '1px solid ' + (order.overridden ? ACCENT_SOFT_2 : C.border2) }}
                            >{order.overridden ? 'ROW ORDER' : 'SONG ORDER'}</span>
                            <span style={{ fontSize: 9, color: C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.summary || 'slide order'}</span>
                          </div>
                        )}
                      </div>
                      {it.songId && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openArrangementForBuilderItem(si, ii); }}
                          title={`Play order for this item — ${order?.summary || 'song order'}`}
                          style={{ background: order?.overridden ? ACCENT_SOFT : 'transparent', border: '1px solid ' + (order?.overridden ? ACCENT_SOFT_2 : C.border2), color: order?.overridden ? ACCENT : C.faint, borderRadius: 4, padding: 2, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
                        ><ListMusic size={10} /></button>
                      )}
                      <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>{slideCount(it)}s</span>
                      {/* One click removes the item from this section — the
                          section header's own bin used to be the only delete,
                          which took the whole section with it. */}
                      <button
                        onClick={(e) => { e.stopPropagation(); removeShowItem(sec.id, ii); }}
                        title={`Remove "${it.title}" from ${sec.title}`}
                        style={{ ...iconBtn, border: '1px solid ' + C.border2 }}
                      ><Trash2 size={10} /></button>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <button onClick={addShowSection} style={{ width: '100%', background: 'transparent', border: '1px dashed ' + C.border2, color: C.faint, padding: '8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 4 }}><Plus size={12} /> Add Section</button>
        </div>
      </div>

      {/* CENTER PANEL — canvas header, then the selected item's slides */}
      <div style={{ display: 'flex', flexDirection: 'column', background: C.bg, overflow: 'hidden' }}>
        {/* CANVAS HEADER — section badge, item title, slide count, density */}
        <div style={{ padding: '8px 14px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span title={cur ? cur.sec.title : 'No section'} style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, color: ACCENT, background: ACCENT_SOFT, border: '1px solid ' + ACCENT_SOFT_2, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur ? cur.sec.title : 'NO SECTION'}</span>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cur ? cur.item.title : 'Select an item to view its slides'}</span>
          <span style={{ color: C.faint2, flexShrink: 0 }}>•</span>
          <span style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap', flexShrink: 0 }}>{slides.length} {slides.length === 1 ? 'slide' : 'slides'}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <span style={{ fontSize: 8.5, fontWeight: 800, color: C.faint, letterSpacing: 0.8 }}>GRID</span>
            {[1, 2, 3, 4].map(d => (
              <button key={d} onClick={() => setBuilderDensity(d)} title={`${d} per row`} style={{ width: 24, height: 21, borderRadius: 4, background: builderDensity === d ? ACCENT : C.elevated2, color: builderDensity === d ? C.bg : C.muted, border: '1px solid ' + C.border2, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{d}</button>
            ))}
          </div>
        </div>

        {/* Scripture is already a finished passage — editing its text here
            would drift from the payload the row is created from, so this bar
            only reports what will land in the order. */}
        {cur && cur.item.scripture && (
          <div style={{ padding: '7px 14px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, background: C.panel, flexShrink: 0 }}>
            <BookOpen size={12} color={ACCENT} />
            <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text }}>{cur.item.scripture.title}</span>
            {cur.item.scripture.meta?.source?.translation && (
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.4, color: ACCENT, background: ACCENT_SOFT, border: '1px solid ' + ACCENT_SOFT_2, borderRadius: 3, padding: '1px 5px' }}>{String(cur.item.scripture.meta.source.translation).toUpperCase()}</span>
            )}
            <span style={{ fontSize: 10, color: C.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {scriptureVerses(cur.item).length} verse{scriptureVerses(cur.item).length === 1 ? '' : 's'} · becomes a scripture row in the Service Order
            </span>
          </div>
        )}

        {/* Item Editor (custom slide / media) */}
        {cur && !cur.item.songId && !cur.item.scripture && (
          <div style={{ padding: '8px 14px', borderBottom: '1px solid ' + C.border, display: 'grid', gridTemplateColumns: '1.1fr 1.6fr 80px', gap: 8, alignItems: 'center', background: C.panel }}>
            <input type="text" value={cur.item.title || ''} onChange={(e) => updateShowItem(cur.sec.id, cur.ii, { title: e.target.value })} placeholder="Slide title" style={{ background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
            {cur.item.media_url ? (
              <span style={{ fontSize: 10, color: C.accLine, fontWeight: 700 }}>{cur.item.media_type === 'video' ? 'Video' : 'Image'} background set</span>
            ) : (
              <input type="text" value={cur.item.content || ''} onChange={(e) => updateShowItem(cur.sec.id, cur.ii, { content: e.target.value })} placeholder="Text / lyrics" style={{ background: C.elevated, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px 8px', color: C.text, fontSize: 12, outline: 'none' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input key={`dur-${cur.sec.id}-${cur.ii}-${cur.item.duration || 0}`} type="number" min="0" max="7200" defaultValue={cur.item.duration || 0} onBlur={(e) => updateShowItem(cur.sec.id, cur.ii, { duration: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} title="Seconds on screen" style={{ width: 52, background: C.elevated, color: C.text, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px', fontSize: 12, textAlign: 'center', outline: 'none' }} />
              <span style={{ fontSize: 9, color: C.faint }}>s</span>
            </div>
          </div>
        )}

        {/* ORDER BAR — where this item's running order comes from, and the one
            click that changes it. Sits with the tiles because that is what it
            describes. */}
        {cur && cur.item.songId && (() => {
          const o = orderOf(cur.item);
          return (
            <div style={{ padding: '6px 14px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 8, background: C.panel, flexShrink: 0 }}>
              <ListMusic size={12} color={o.overridden ? ACCENT : C.faint} />
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5, borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap', color: o.overridden ? ACCENT : C.faint, background: o.overridden ? ACCENT_SOFT : 'transparent', border: '1px solid ' + (o.overridden ? ACCENT_SOFT_2 : C.border2) }}>
                {o.overridden ? 'ROW ORDER' : 'SONG ORDER'}
              </span>
              <span style={{ fontSize: 10.5, color: o.summary ? C.text2 : C.faint, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: o.summary ? 700 : 400 }} title={o.summary}>
                {o.summary || 'Follows the slide order'}
              </span>
              <button
                onClick={() => openArrangementForBuilderItem(cur.si, cur.ii)}
                title="Open the section-flow editor for this item"
                style={{ background: o.overridden ? ACCENT_SOFT : C.elevated2, border: '1px solid ' + (o.overridden ? ACCENT_SOFT_2 : C.border2), color: o.overridden ? ACCENT : C.text2, borderRadius: 6, padding: '3px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
              >Edit order</button>
            </div>
          );
        })()}

        {/* Tile Grid */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
          {slides.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${density}, 1fr)`, gap: 8 }}>
              {slides.map((sl, ti) => {
                const isActive = tileIdx === ti && cur;
                return (
                  <div key={ti} onClick={() => { if (cur) builderGoLive(cur, ti); }} style={{ position: 'relative', height: density <= 2 ? 130 : density === 3 ? 110 : 90, borderRadius: 8, overflow: 'hidden', background: sl.type === 'media' ? C.input : C.elevated2, border: isActive ? '2px solid ' + PINK : '1px solid ' + C.border2, cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: 8, boxSizing: 'border-box', transition: 'border 0.15s', boxShadow: isActive ? '0 0 12px ' + PINK_SOFT : 'none' }}>
                    {sl.type === 'media' && sl.url && (sl.sub === 'video' ? <LazyVideo src={sl.url} muted playsInline preload="metadata" rootMargin="200px" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }} /> : <img src={sl.url} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5 }} />)}
                    <div style={{ position: 'absolute', top: 4, left: 6, fontSize: 9, fontWeight: 800, color: isActive ? PINK : C.faint, zIndex: 2 }}>#{ti + 1}</div>
                    <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 8, fontWeight: 800, background: isActive ? PINK_SOFT : C.elevated, color: isActive ? PINK : C.muted, borderRadius: 4, padding: '1px 5px', zIndex: 2 }}>{sl.type === 'title' ? 'TITLE' : sl.type === 'cue' ? (sl.cue?.label || 'LYRIC') : sl.type === 'media' ? 'MEDIA' : 'SLIDE'}</div>
                    <p style={{ margin: 0, fontSize: density <= 2 ? 13 : 11, fontWeight: 700, color: C.text, textAlign: 'center', lineHeight: 1.3, whiteSpace: 'pre-line', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', zIndex: 2 }}>{sl.text || '—'}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: C.faint2, fontSize: 12, padding: '40px 20px' }}>{cur ? 'No slides for this item.' : 'Select a service order item to view its slides.'}</div>
          )}
        </div>

        {/* Bottom Counter */}
        <div style={{ padding: '8px 14px', borderTop: '1px solid ' + C.border, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: C.panel }}>
          <span style={{ fontSize: 10.5, color: C.muted }}>{cur ? `Showing slide ${tileIdx + 1} of ${cur.c}` : 'Nothing selected'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => builderAdvance(-1)} disabled={!cur} style={{ background: C.elevated2, border: '1px solid ' + C.border2, color: cur ? C.text : C.faint, borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 700, cursor: cur ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}><ChevronLeft size={13} /></button>
            <span style={{ fontSize: 12.5, fontWeight: 800, fontFamily: 'monospace', color: C.text }}>{globalIdx + 1} <span style={{ color: C.muted }}>/</span> {total}</span>
            <button onClick={() => builderAdvance(1)} disabled={!cur} style={{ background: C.elevated2, border: '1px solid ' + C.border2, color: cur ? C.text : C.faint, borderRadius: 6, padding: '4px 9px', fontSize: 12, fontWeight: 700, cursor: cur ? 'pointer' : 'default', display: 'flex', alignItems: 'center' }}><ChevronRight size={13} /></button>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL — Live Preview & Monitoring */}
      <div style={{ background: C.panel, borderLeft: '1px solid ' + C.border, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Live Monitor */}
        <div style={{ padding: '8px 10px 4px', borderBottom: '1px solid ' + C.border, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: builderRehearse ? PINK : C.faint2, boxShadow: builderRehearse ? '0 0 6px ' + PINK : 'none' }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Live Output</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => { builderAdvance(-1); }} style={{ background: C.elevated2, border: '1px solid ' + C.border2, color: C.muted, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={12} /></button>
          <button onClick={() => { builderAdvance(1); }} style={{ background: C.elevated2, border: '1px solid ' + C.border2, color: C.muted, borderRadius: 4, padding: '2px 5px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={12} /></button>
        </div>
        <div style={{ padding: 8, flexShrink: 0 }}>
          {renderOutputPreview()}
        </div>
        {/* UP NEXT */}
        <div style={{ padding: '6px 10px', borderBottom: '1px solid ' + C.border }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Up Next</span>
          {upNext ? (
            <div style={{ marginTop: 4, background: C.elevated2, border: '1px solid ' + C.border2, borderRadius: 6, padding: '6px 8px' }}>
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
              const ItemIcon = entry.item.scripture ? BookOpen : entry.item.songId ? Music : entry.item.media_url ? ImageIcon : FileText;
              return (
                <div key={fi} onClick={() => selectBuilderItem(entry.si, entry.ii)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 4, background: isActive ? PINK_SOFT : 'transparent', cursor: 'pointer' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: isActive ? PINK : C.faint, minWidth: 16 }}>{fi + 1}</span>
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
