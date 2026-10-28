import React from 'react';
import { Plus, Search, Download, Upload, Edit3, Image as ImageIcon, Video, ChevronDown, ChevronLeft, ChevronRight, HelpCircle, CornerUpLeft, BookOpen, Music, Folder, Lightbulb, FolderOpen, Highlighter, LayoutGrid } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { mediaLabel } from '../lib/backgrounds';
import FontPicker from './FontPicker';
import { FONT_OPTIONS } from '../lib/constants';
import PresentationWorkspace from './PresentationWorkspace';
import CountdownPanel from './CountdownPanel';
import MediaBrowser from './MediaBrowser';
import SermonPanel from './SermonPanel';
import AudioPanel from './AudioPanel';
import StagePanel from './StagePanel';
import VideoPanel from './VideoPanel';
import { LazyVideo } from '../lib/lazyVideo';

export default function CenterWorkspace() {
  const app = useApp();
  const {
    C,
    PINK,
    ACCENT,
    songs,
    activeSong,
    activeCue,
    bibleTrans,
    dockTab,
    mediaLibrary,
    bibleLib,
    bibleSel,
    bibleChapter,
    bibleDL,
    bibleLibQuery,
    setBibleLibQuery,
    bibleLibLoading,
    bibleTransOpen,
    setBibleTransOpen,
    bibleHelpOpen,
    setBibleHelpOpen,
    bibleMedia,
    setBibleMedia,
    scriptureBgLibrary,
    bibleMediaOpen,
    setBibleMediaOpen,
    setScripturePicker,
    bibleTestament,
    setBibleTestament,
    bibleBookQuery,
    setBibleBookQuery,
    bibleRef,
    setBibleRef,
    bibleSearchQuery,
    setBibleSearchQuery,
    bibleSearchResults,
    setBibleSearchResults,
    bibleSelVerses,
    setBibleSelVerses,
    bibleFocusedVerse,
    setBibleFocusedVerse,
    bibleFmt,
    setBibleFmt,
    setIsEditorOpen,
    setEditorMode,
    setRawPasteText,
    setEditingSong,
    openEditorOn,
    bibleLastVerseRef,
    selectBibleMedia,
    importBibleMedia,
    scriptureDefault,
    scriptureDefaultOptions,
    fireCueLive,
    fireTitleLive,
    fireMedleySlideAt,
    arrangementStatus,
    clearWorkspace,
    activeSlideIndex,
    slideGrid,
    renderSlideFace,
    outputAspect,
    gridDensity, setGridDensity,
    formatBibleVerse,
    queueBibleSelection,
    requestBibleQueue,
    loadBibleChapter,
    selectBibleBook,
    selectBibleChapter,
    handleBibleVerseClick,
    resetBibleToBooks,
    resetBibleToBook,
    openBibleTranslation,
    downloadBible,
    deleteBibleTranslation,
    resolveBibleReference,
    searchBibleKeywords,
    bibleActiveEntry,
    bibleLibFiltered,
    bibleAllBooks,
    bibleOtCount,
    bibleNtCount,
    bibleFilteredBooks,
    bibleStep,
    setViewTab,
    setLeftOpen,
    setDockTab
  } = app;
  // Latest-wins workspace switching: clicking three tabs in a row must paint
  // the LAST one, not queue the two heavy panels in between. The nav highlight
  // follows dockTab instantly; only this center stage is deferred, so a slow
  // panel can never lock the railway while it mounts.
  const workspaceTab = React.useDeferredValue(dockTab);
  // The picker only hands back a URL, so resolve the assigned default back to
  // its option for the thumbnail and the label.
  const defaultOpt = (scriptureDefaultOptions || []).find(o => o.value === (scriptureDefault && scriptureDefault.value)) || null;
  // What the button should advertise: the session override if there is one,
  // otherwise the assigned default — both mean "scripture has a background".
  const bgShow = bibleMedia || defaultOpt;

  const verseContainerRef = React.useRef(null);
  // Slide grid follow-scroll: when the live slide advances past the visible
  // area, bring it back into view (medley / arrangement / library order all
  // share the same slideGrid positions activeSlideIndex counts).
  const gridScrollRef = React.useRef(null);
  React.useEffect(() => {
    if (activeSlideIndex == null || activeSlideIndex < 0) return;
    const root = gridScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-grid-pos="${activeSlideIndex}"]`);
    // 'nearest' = no-op while the live tile is already on screen, so manual
    // browsing is never yanked; instant (not smooth) so arrow-spam can't
    // queue a laggy chase behind the actual output.
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }, [activeSlideIndex]);

  // Global arrow-key navigation for verse viewer
  React.useEffect(() => {
    if (dockTab !== 'scripture' || bibleStep !== 'verses' || !bibleChapter?.verses?.length) return;
    const handler = (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      // Only handle if focus is inside the verse container (not in lyrics/slide grid)
      if (!verseContainerRef.current?.contains(e.target)) return;
      // Only handle if focus is in the verse area (not in an input)
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      e.preventDefault();
      const verses = bibleChapter.verses;
      const current = bibleFocusedVerse;
      let idx = current != null ? verses.findIndex(v => v.verse === current) : -1;
      if (idx < 0) idx = 0; // default to first verse
      const nextIdx = e.key === 'ArrowRight' ? Math.min(idx + 1, verses.length - 1) : Math.max(idx - 1, 0);
      const nextVerse = verses[nextIdx];
      if (nextVerse) {
        setBibleFocusedVerse(nextVerse.verse);
        // Shift+Arrow EXTENDS a multi-select (Ctrl+Click-built ranges survive);
        // plain arrows move a lone caret as before.
        if (e.shiftKey) {
          const anchor = (bibleLastVerseRef.current != null && (bibleSelVerses || []).includes(bibleLastVerseRef.current))
            ? bibleLastVerseRef.current
            : current;
          const a = verses.findIndex(v => v.verse === anchor);
          const lo = Math.min(a < 0 ? nextIdx : a, nextIdx);
          const hi = Math.max(a < 0 ? nextIdx : a, nextIdx);
          setBibleSelVerses(verses.slice(lo, hi + 1).map(v => v.verse));
        } else {
          setBibleSelVerses([nextVerse.verse]);
        }
        bibleLastVerseRef.current = nextVerse.verse;
        // focus the next verse element
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-verse="${nextVerse.verse}"]`);
          el?.focus();
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dockTab, bibleStep, bibleChapter, bibleFocusedVerse]);

  // Grid selection is a WORKSPACE concern only: it brightens the tile the
  // operator is looking at and drives the pagination. It never fires a slide.
  // The live slide remains activeSlideIndex, owned by App.
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  React.useEffect(() => {
    setSelectedIdx(activeSlideIndex >= 0 ? activeSlideIndex : 0);
  }, [activeSlideIndex, activeSong?.id]);
  React.useEffect(() => {
    setSelectedIdx((i) => (slideGrid.length ? Math.min(i, slideGrid.length - 1) : 0));
  }, [slideGrid.length]);

  const revealSlide = (i) => {
    const root = gridScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-grid-pos="${i}"]`);
    if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  };
  const selectSlide = (i) => {
    setSelectedIdx(i);
    revealSlide(i);
  };

  // Compact page list: first/last anchors with a window around the current
  // slide. Every number is a real slide button; only the ellipsis is inert.
  const pagerItems = (total, current) => {
    if (total <= 9) return Array.from({ length: total }, (_, i) => i);
    const out = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total - 2, current + 2);
    out.push(0);
    if (start === 2) out.push(1);
    else if (start > 2) out.push('start-ellipsis');
    for (let i = start; i <= end; i++) out.push(i);
    if (end === total - 3) out.push(total - 2);
    else if (end < total - 2) out.push('end-ellipsis');
    out.push(total - 1);
    return out;
  };

  return (
<div className="kog-workspace">
  <div key={workspaceTab} className="kog-workspace-swap">
  {workspaceTab === 'scripture' ? (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-elev)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setBibleTransOpen(o => !o)} title="Select translation" style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(255,184,0,0.15)', border: '1px solid rgba(255,184,0,0.45)', color: '#FFB800', padding: '7px 11px', borderRadius: 10, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {(bibleActiveEntry?.code || bibleTrans || 'BIBLE').toUpperCase()}
              <ChevronDown size={13} />
            </button>
            {bibleTransOpen && (
              <>
                <div onClick={() => setBibleTransOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 430, zIndex: 61, display: 'flex', flexDirection: 'column', background: 'var(--ui-elev)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid var(--ui-border)', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid var(--ui-border)', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <Search size={12} color="var(--ui-faint)" />
                    <input autoFocus value={bibleLibQuery} onChange={(e) => setBibleLibQuery(e.target.value)} placeholder={`Search ${bibleLib.length} versions…`} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--ui-text)', fontSize: 12, outline: 'none' }} />
                    {bibleLibLoading && <span style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>Loading…</span>}
                  </div>
                  <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 8, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                    {!bibleLibLoading && bibleLibFiltered.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--ui-faint)', padding: '6px 4px' }}>No versions match "{bibleLibQuery}".</div>}
                    {[...bibleLibFiltered].sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0) || a.name.localeCompare(b.name)).map(b => {
                      const isInstalled = b.installed;
                      const isActive = bibleTrans === b.abbrev;
                      const downloading = bibleDL.running && bibleDL.abbrev === b.abbrev;
                      const pct = downloading ? Math.round((bibleDL.progress || 0) * 100) : 0;
                      return (
                        <div key={b.abbrev} style={{ minWidth: 0, display: 'grid', gap: 6, background: isActive ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.03)', border: isActive ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '9px 11px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ui-text)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{b.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 600, color: isInstalled ? '#FFB800' : 'var(--ui-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isInstalled ? `Installed · ${b.books} books` : downloading ? `Downloading… ${pct}%` : `${b.size || ''}${b.lang ? ` · ${b.lang}` : ''}`.replace(/^\W+/, '') || (b.code || b.abbrev).toUpperCase()}</span>
                            {isInstalled ? (
                              <button onClick={() => { setBibleTransOpen(false); if (!isActive) openBibleTranslation(b.abbrev); }} style={{ flexShrink: 0, background: isActive ? '#FFB800' : 'rgba(255,255,255,0.06)', border: '1px solid var(--ui-border)', color: isActive ? '#1C1C1E' : 'var(--ui-text2)', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{isActive ? 'Active' : 'Open'}</button>
                            ) : (
                              <button onClick={() => downloadBible(b.abbrev)} disabled={downloading} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: downloading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{downloading ? `${pct}%` : 'Download'}</button>
                            )}
                          </div>
                          {downloading && (
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#FFB800', borderRadius: 999, transition: 'width 0.2s' }} />
                            </div>
                          )}
                          {isInstalled && b.abbrev !== 'kjv' && <button onClick={() => deleteBibleTranslation(b.abbrev)} style={{ justifySelf: 'start', background: 'transparent', border: 'none', color: '#FF4545', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Delete from device</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, minWidth: 0 }}>
            <button onClick={resetBibleToBooks} style={{ background: 'transparent', border: 'none', padding: 0, color: bibleSel.bookIndex ? 'var(--ui-faint)' : '#FFB800', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Books</button>
            {bibleSel.bookIndex ? (
              <>
                <span style={{ color: '#334155' }}>›</span>
                <button onClick={resetBibleToBook} style={{ background: 'transparent', border: 'none', padding: 0, color: bibleSel.chapter ? 'var(--ui-faint)' : '#FFB800', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{bibleSel.bookName}</button>
              </>
            ) : null}
            {bibleSel.chapter ? (
              <>
                <span style={{ color: '#334155' }}>›</span>
                <span style={{ color: '#FFB800', fontWeight: 700, whiteSpace: 'nowrap' }}>Ch. {bibleSel.chapter}</span>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '5px 6px 5px 10px', flex: 1, maxWidth: 300, minWidth: 150 }}>
            <Search size={12} color="var(--ui-faint)" />
            <input value={bibleRef} onChange={(e) => setBibleRef(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') resolveBibleReference(); }} placeholder="Quick jump: John 3:16" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--ui-text)', fontSize: 12, outline: 'none', minWidth: 0 }} />
            <motion.button {...stubTap} onClick={resolveBibleReference} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Go</motion.button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {bibleSearchResults ? (
            <button onClick={() => setBibleSearchResults(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', padding: '7px 12px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}><CornerUpLeft size={12} /> Back</button>
          ) : null}
          {bibleSelVerses.length ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#FFB800', whiteSpace: 'nowrap' }}>{bibleSelVerses.length} selected</span> : null}
          <motion.button {...stubTap} onClick={requestBibleQueue} title="Add the selected verses to the plan — pick the section they belong to" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--ui-border2)', color: 'var(--ui-text2)', padding: '7px 13px', borderRadius: 10, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}><Plus size={12} /> Add to Playlist</motion.button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-elev)' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: 3 }}>
          {['number', 'plain', 'sentence'].map(l => (
            <motion.button {...stubTap} key={l} onClick={() => setBibleFmt(f => ({ ...f, layout: l }))} title={l === 'number' ? 'Show verse numbers' : l === 'plain' ? 'Plain verses, no numbers' : 'Sentence-case flow'} style={{ background: bibleFmt.layout === l ? 'rgba(255,184,0,0.18)' : 'transparent', border: 'none', borderRadius: 7, color: bibleFmt.layout === l ? '#FFB800' : 'var(--ui-faint)', padding: '4px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{l === 'number' ? 'Vv.' : l === 'plain' ? 'Plain' : 'Flow'}</motion.button>
          ))}
        </div>
        <motion.button {...stubTap} onClick={() => setBibleFmt(f => ({ ...f, bold: !f.bold }))} title="Toggle bold" style={{ background: bibleFmt.bold ? 'rgba(255,184,0,0.18)' : 'rgba(255,255,255,0.04)', border: bibleFmt.bold ? '1px solid #FFB800' : '1px solid var(--ui-border)', color: bibleFmt.bold ? '#FFB800' : 'var(--ui-faint)', borderRadius: 9, padding: '6px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>B</motion.button>
        <motion.button {...stubTap} onClick={() => setBibleFmt(f => ({ ...f, caps: !f.caps }))} title="Uppercase" style={{ background: bibleFmt.caps ? 'rgba(255,184,0,0.18)' : 'rgba(255,255,255,0.04)', border: bibleFmt.caps ? '1px solid #FFB800' : '1px solid var(--ui-border)', color: bibleFmt.caps ? '#FFB800' : 'var(--ui-faint)', borderRadius: 9, padding: '6px 11px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>Aa</motion.button>
        {/* Scripture typeface: operator font, live on the wall like the rest. */}
        <div title="Scripture font (Default = stage style)" style={{ width: 150, flexShrink: 0 }}>
          <FontPicker value={bibleFmt.font || ''} choices={[{ label: 'Default font', value: '' }, ...FONT_OPTIONS]} onChange={(v) => setBibleFmt(f => ({ ...f, font: v || null }))} C={C} />
        </div>
        {/* Scripture text colour. */}
        <div title="Scripture text colour" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '4px 7px' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: bibleFmt.color ? '#FFB800' : 'var(--ui-faint)' }}>A</span>
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(bibleFmt.color || '') ? bibleFmt.color : '#ffffff'} onChange={(e) => setBibleFmt(f => ({ ...f, color: e.target.value }))} title="Pick the scripture text colour" style={{ width: 26, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} />
          {bibleFmt.color && <button onClick={() => setBibleFmt(f => ({ ...f, color: null }))} title="Back to the stage style colour" style={{ background: 'transparent', border: 'none', color: 'var(--ui-faint)', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>✕</button>}
        </div>
        {/* Marker-pen highlight for the ticked verses. */}
        <motion.button {...stubTap} onClick={() => setBibleFmt(f => ({ ...f, mark: f.mark ? null : (f.mark || '#FDE047') }))} title={bibleFmt.mark ? 'Highlighter on — pick words on the live list' : 'Switch the highlighter on'} style={{ background: bibleFmt.mark ? 'rgba(255,184,0,0.18)' : 'rgba(255,255,255,0.04)', border: bibleFmt.mark ? '1px solid #FFB800' : '1px solid var(--ui-border)', color: bibleFmt.mark ? '#FFB800' : 'var(--ui-faint)', borderRadius: 9, padding: '6px 10px', cursor: 'pointer', display: 'flex' }}><Highlighter size={13} /></motion.button>
        {bibleFmt.mark && (
          <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(bibleFmt.mark || '') ? bibleFmt.mark : '#FDE047'} onChange={(e) => setBibleFmt(f => ({ ...f, mark: e.target.value }))} title="Highlight colour" style={{ width: 30, height: 26, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, cursor: 'pointer', padding: 2 }} />
        )}
        <div style={{ position: 'relative' }}>
          <motion.button {...stubTap} onClick={() => setBibleMediaOpen(o => !o)} title="Background media for scripture slides" style={{ display: 'flex', alignItems: 'center', gap: 6, background: bgShow ? 'rgba(255,184,0,0.18)' : 'rgba(255,255,255,0.04)', border: bgShow ? '1px solid #FFB800' : '1px solid var(--ui-border)', color: bgShow ? '#FFB800' : 'var(--ui-faint)', borderRadius: 9, padding: '6px 11px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
            {bgShow && bgShow.type === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
            <span style={{ maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bgShow ? (bgShow.type === 'color' ? bgShow.value : (bgShow.name ? mediaLabel(bgShow.name, bgShow.type) : 'Background')) : 'Background'}</span>
            <ChevronDown size={12} />
          </motion.button>
          {bibleMediaOpen && (
            <>
              <div onClick={() => setBibleMediaOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 320, maxWidth: 'calc(100vw - 24px)', maxHeight: 400, zIndex: 61, display: 'flex', flexDirection: 'column', background: 'var(--ui-elev)', border: '1px solid var(--ui-border)', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                <div style={{ padding: '9px 11px', borderBottom: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--ui-muted)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Scripture Background</span>
                  <motion.button {...stubTap} onClick={() => { selectBibleMedia(null, null, null); setBibleMediaOpen(false); }} title="Drop this session's background and fall back to the default" style={{ background: 'transparent', border: 'none', color: bibleMedia ? '#FF4545' : 'var(--ui-faint)', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</motion.button>
                </div>
                <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'grid', gap: 10 }}>
                  <motion.button {...stubTap} onClick={() => { setScripturePicker('session'); setBibleMediaOpen(false); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,184,0,0.12)', border: '1px dashed rgba(255,184,0,0.5)', color: '#FFC72C', borderRadius: 10, padding: '10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    <FolderOpen size={12} /> Choose image or video…
                  </motion.button>
                  <motion.label {...stubTap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-faint)', borderRadius: 10, padding: '7px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                    <Upload size={11} /> Upload a file instead
                    <input type="file" accept="image/*,video/*" onChange={importBibleMedia} style={{ display: 'none' }} />
                  </motion.label>
                  {/* Replaces the old "Your Uploads" grid: browsing a wall of
                      thumbnails every visit was the noise. One assigned
                      default does the job in a single row — and it is exactly
                      what scripture added to a section carries with it. */}
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1.2 }}>Default for new scripture</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {defaultOpt && (
                      <div style={{ width: 58, height: 33, flexShrink: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--ui-border)', background: '#000' }}>
                        {defaultOpt.type === 'video'
                          ? <LazyVideo src={defaultOpt.value} autoPlay loop muted playsInline preload="metadata" rootMargin="150px" style={{ width: '100%', height: '100%' }} />
                          : <img src={defaultOpt.value} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                      </div>
                    )}
                    <motion.button {...stubTap} onClick={() => { setScripturePicker('default'); setBibleMediaOpen(false); }} title="Background attached to every scripture you add to a section" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'var(--ui-elev2)', border: '1px solid var(--ui-border)', color: 'var(--ui-text)', borderRadius: 8, padding: '7px 10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{defaultOpt ? defaultOpt.label : 'Choose…'}</span>
                      <FolderOpen size={12} style={{ flexShrink: 0, color: 'var(--ui-faint)' }} />
                    </motion.button>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', lineHeight: 1.5 }}>
                    {defaultOpt
                      ? 'Attached to every scripture you add to the service plan — no background to pick each time.'
                      : 'Choose a background so scripture is never added blank.'}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '5px 6px 5px 10px', minWidth: 180, maxWidth: 340, flex: 1 }}>
          <Search size={12} color="var(--ui-faint)" />
          <input value={bibleSearchQuery} onChange={(e) => setBibleSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchBibleKeywords(); }} placeholder="Search keywords in this translation…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: 'var(--ui-text)', fontSize: 12, outline: 'none' }} />
          <button onClick={searchBibleKeywords} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Search</button>
        </div>
      </div>

      <div key={bibleStep} className="bible-step" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', background: 'var(--ui-bg)' }}>
        {/* STEP 1 — BOOK SELECTOR */}
        {bibleStep === 'books' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-elev)', flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 320 }}>
                <Search size={12} color="var(--ui-faint)" style={{ position: 'absolute', left: 11, top: 9 }} />
                <input value={bibleBookQuery} onChange={(e) => setBibleBookQuery(e.target.value)} placeholder="Filter books…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', borderRadius: 9, padding: '8px 10px 8px 30px', color: 'var(--ui-text)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'all', label: `All ${bibleAllBooks.length}` }, { k: 'ot', label: `OT ${bibleOtCount}` }, { k: 'nt', label: `NT ${bibleNtCount}` }].map(p => (
                  <button key={p.k} onClick={() => setBibleTestament(p.k)} title={p.k === 'all' ? 'All 66 books' : p.k === 'ot' ? 'Old Testament (39)' : 'New Testament (27)'} style={{ background: bibleTestament === p.k ? '#FFB800' : 'rgba(58,58,60,0.5)', border: bibleTestament === p.k ? '1px solid #FFB800' : '1px solid var(--ui-border2)', color: bibleTestament === p.k ? '#1C1C1E' : 'var(--ui-muted)', borderRadius: 8, padding: '6px 12px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{p.label}</button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: 'var(--ui-faint)', fontWeight: 600, whiteSpace: 'nowrap' }}>Step 1 · Choose a book</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              {bibleFilteredBooks.length ? (
                (() => {
                  const groups = bibleTestament === 'all'
                    ? [{ key: 'ot', title: 'Old Testament', list: bibleFilteredBooks.filter(b => b.testament === 'ot') }, { key: 'nt', title: 'New Testament', list: bibleFilteredBooks.filter(b => b.testament === 'nt') }]
                    : [{ key: 'one', title: bibleTestament === 'ot' ? 'Old Testament' : 'New Testament', list: bibleFilteredBooks }];
                  return groups.filter(g => g.list.length).map(group => (
                    <div key={group.key} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--ui-faint)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>{group.title} · {group.list.length}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        {group.list.map((b, i) => {
                          const active = bibleSel.bookIndex === b.nr;
                          return (
                            <button key={b.nr} className="bible-item" onClick={() => selectBibleBook(b)} title={`${b.name} — ${b.chapters} chapters`} style={{ animationDelay: `${Math.min(i * 12, 240)}ms`, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, background: active ? 'rgba(255,184,0,0.18)' : 'var(--ui-elev2)', border: active ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border)', borderRadius: 10, padding: '11px 12px', color: active ? '#FFB800' : 'var(--ui-text2)', cursor: 'pointer' }}>
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%' }}>
                                <span style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: active ? '#FFB800' : 'var(--ui-faint)', background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>{b.abbr}</span>
                              </span>
                              <span style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>{b.chapters} chapters</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              ) : (
                <div style={{ fontSize: 12, color: 'var(--ui-faint)', lineHeight: 1.6, padding: 4 }}>{bibleAllBooks.length ? 'No books match your filter.' : 'Install a Bible version to browse books.'}</div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 — CHAPTER SELECTOR */}
        {bibleStep === 'chapters' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-elev)', flexShrink: 0 }}>
              <button onClick={resetBibleToBooks} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={13} /> Books</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ui-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bibleSel.bookName}</div>
                <div style={{ fontSize: 10.5, color: 'var(--ui-faint)' }}>{bibleSel.totalChapters} chapters · Step 2 · Choose a chapter</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
                {Array.from({ length: bibleSel.totalChapters || 0 }, (_, i) => i + 1).map((ch, i) => {
                  const active = bibleChapter && bibleChapter.book === bibleSel.bookName && bibleChapter.chapter === ch;
                  return (
                    <button key={ch} className="bible-item" onClick={() => selectBibleChapter(ch)} title={`${bibleSel.bookName} ${ch}`} style={{ animationDelay: `${Math.min(i * 8, 260)}ms`, background: active ? '#FFB800' : 'var(--ui-elev2)', border: active ? '1px solid #FFB800' : '1px solid var(--ui-border)', color: active ? '#1C1C1E' : 'var(--ui-muted)', borderRadius: 9, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{ch}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — PASSAGE / VERSE VIEWER */}
        {bibleStep === 'verses' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--ui-border)', background: 'var(--ui-elev)', flexShrink: 0, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {!bibleSearchResults && (
                  <button onClick={resetBibleToBook} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: 'var(--ui-text2)', borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={13} /> {bibleSel.bookName || 'Chapters'}</button>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--ui-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bibleSearchResults ? 'Search results' : bibleChapter ? `${bibleChapter.book} ${bibleChapter.chapter}`.toUpperCase() : 'Verses'}</div>
                  {!bibleSearchResults && bibleChapter ? <div style={{ fontSize: 10.5, color: 'var(--ui-faint)', marginTop: 2 }}>{bibleChapter.verses.length} verses · {(bibleActiveEntry?.code || bibleTrans).toUpperCase()}</div> : null}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ position: 'relative' }} onMouseEnter={() => setBibleHelpOpen(true)} onMouseLeave={() => setBibleHelpOpen(false)}>
                  <HelpCircle size={14} color="var(--ui-faint)" style={{ cursor: 'help', display: 'block' }} />
                  <span style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, background: 'var(--ui-elev)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '8px 10px', fontSize: 10.5, lineHeight: 1.6, color: 'var(--ui-text2)', boxShadow: '0 16px 40px rgba(0,0,0,0.6)', zIndex: 20, opacity: bibleHelpOpen ? 1 : 0, pointerEvents: 'none', transition: 'opacity 0.12s' }}>
                    <b style={{ color: 'var(--ui-text)' }}>Click</b> = select one<br />
                    <b style={{ color: 'var(--ui-text)' }}>Ctrl + Click</b> = multi-select<br />
                    <b style={{ color: 'var(--ui-text)' }}>Shift + Click</b> = select range<br />
                    <span style={{ color: 'var(--ui-muted)' }}>Push via Live Output → Push to Display</span>
                  </span>
                </div>
                {bibleChapter ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => selectBibleChapter(Math.max(1, bibleChapter.chapter - 1))} disabled={bibleChapter.chapter <= 1} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: bibleChapter.chapter <= 1 ? 'var(--ui-faint)' : 'var(--ui-text2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: bibleChapter.chapter <= 1 ? 'default' : 'pointer' }}>‹</button>
                    <button onClick={() => selectBibleChapter(Math.min(bibleChapter.totalChapters, bibleChapter.chapter + 1))} disabled={bibleChapter.chapter >= bibleChapter.totalChapters} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--ui-border)', color: bibleChapter.chapter >= bibleChapter.totalChapters ? 'var(--ui-faint)' : 'var(--ui-text2)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: bibleChapter.chapter >= bibleChapter.totalChapters ? 'default' : 'pointer' }}>›</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              <div style={{ maxWidth: 920, margin: '0 auto' }}>
                {bibleSearchResults ? (
                  bibleSearchResults.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--ui-faint)', padding: '12px 2px' }}>No matches found.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {bibleSearchResults.map((r, i) => (
                        <button key={i} className="bible-item" onClick={async () => { setBibleSearchResults(null); const res = await loadBibleChapter(bibleTrans, r.bookIndex, r.chapter); if (res && res.bookIndex) { setBibleSelVerses([r.verse]); bibleLastVerseRef.current = r.verse; } }} style={{ animationDelay: `${Math.min(i * 10, 220)}ms`, textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--ui-border)', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#FFB800', marginBottom: 3 }}>{r.book} {r.chapter}:{r.verse}</div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--ui-text2)' }}>{r.text}</div>
                        </button>
                      ))}
                    </div>
                  )
                ) : bibleChapter ? (
                  <div ref={verseContainerRef} style={{ display: 'grid', gap: 4 }}>
                    {bibleChapter.verses && bibleChapter.verses.map((v, i) => {
                      const selected = bibleSelVerses.includes(v.verse);
                      const focused = bibleFocusedVerse === v.verse;
                      return (
                        <div
                          key={`${bibleChapter.chapter}:${v.verse}`}
                          data-verse={v.verse}
                          className="bible-item"
                          onClick={(e) => { handleBibleVerseClick(e, v); setBibleFocusedVerse(v.verse); }}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBibleVerseClick(e, v); setBibleFocusedVerse(v.verse); } }}
                          tabIndex={0}
                          title="Click = select · Ctrl+Click = multi-select · Shift+Click = select range · Push via Live Output"
                          style={{
                            animationDelay: `${Math.min(i * 6, 200)}ms`,
                            display: 'flex',
                            gap: 10,
                            cursor: 'pointer',
                            background: focused ? 'rgba(255,184,0,0.18)' : selected ? 'rgba(255,184,0,0.16)' : 'transparent',
                            border: focused ? '1px solid #FFB800' : '1px solid transparent',
                            borderLeft: '1px solid ' + (selected ? '#FFB800' : focused ? '#FFB800' : 'transparent'),
                            borderRadius: 8,
                            padding: '7px 9px',
                            outline: focused ? 'none' : undefined,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#FFB800', width: 22, flexShrink: 0, paddingTop: 2 }}>{v.verse}</span>
                          <span style={{ fontSize: 13, lineHeight: 1.6, color: bibleFmt.bold ? 'var(--ui-text)' : 'var(--ui-text2)' }}>{formatBibleVerse(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
                    <div style={{ textAlign: 'center', maxWidth: 360, display: 'grid', gap: 8, justifyItems: 'center' }}>
                      <div style={{ width: 54, height: 54, borderRadius: 16, background: 'radial-gradient(140% 140% at 30% 20%, #3A3A3C, #1C1C1E)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BookOpen size={26} color="#FFB800" /></div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ui-text2)' }}>Pick a book, then a chapter</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ui-faint)', lineHeight: 1.6 }}>Click a verse to send it live instantly. Use Ctrl+Click to multi-select or Shift+Click to grab a range, then Add to Playlist.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : (workspaceTab === 'sermon') ? (
  <PresentationWorkspace />
  ) : (workspaceTab === 'presentations') ? (
  <SermonPanel />
  ) : (workspaceTab === 'countdown') ? (
  <CountdownPanel />
  ) : (workspaceTab === 'stage') ? (
  <StagePanel />
  ) : (workspaceTab === 'audio') ? (
  <AudioPanel />
  ) : (workspaceTab === 'videos') ? (
  <VideoPanel />
  ) : (workspaceTab === 'media') ? (
  <MediaBrowser />
  ) : (
  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
  {/* WORKSPACE TOOLBAR — title, position, browsing and edit actions. Browsing
      here is selection only; the live output changes when a tile is clicked or
      the transport shortcuts are used, never from these controls. */}
  <div className="kog-workspace-toolbar">
    <div style={{ minWidth: 0, flex: 1 }}>
      <h2 className="kog-workspace-title" title={slideGrid[0]?.medTitle ? `${slideGrid[0].medTitle} — Medley` : (activeSong?.title || 'No service plan loaded')}>
        {slideGrid[0]?.medTitle ? `${slideGrid[0].medTitle} · Medley` : (activeSong?.title || 'No service plan loaded')}
      </h2>
      <p className="kog-workspace-sub">
        {activeSong ? (
          <>
            {activeSong.artist ? <span>{activeSong.artist}</span> : null}
            {activeSong.artist ? <span aria-hidden="true">·</span> : null}
            <b>{slideGrid.length}</b> slide{slideGrid.length === 1 ? '' : 's'}
            {arrangementStatus && !slideGrid[0]?.medTitle ? (
              <>
                <span aria-hidden="true">·</span>
                <span title="Custom play order from the service row">Arrangement {arrangementStatus.pos != null ? `${arrangementStatus.pos}/${arrangementStatus.total}` : `${arrangementStatus.total} steps`}</span>
              </>
            ) : null}
            {activeCue && activeCue.id !== 'clear' && activeSlideIndex >= 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span style={{ color: 'var(--kog-success)' }}>Live on slide {activeSlideIndex + 1}</span>
              </>
            ) : null}
          </>
        ) : (
          'Build a set from the song library, then project every lyric and verse with confidence.'
        )}
      </p>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <button
        type="button"
        className="kog-icon-btn"
        onClick={() => selectSlide(Math.max(0, selectedIdx - 1))}
        disabled={ !slideGrid.length || selectedIdx <= 0 }
        title="Previous slide (browse only — does not change the live output)"
        aria-label="Previous slide"
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ minWidth: 62, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--ui-muted)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }} title="Selected slide (browsing position)">
        {slideGrid.length ? `${selectedIdx + 1} / ${slideGrid.length}` : '0 / 0'}
      </span>
      <button
        type="button"
        className="kog-icon-btn"
        onClick={() => selectSlide(Math.min(slideGrid.length - 1, selectedIdx + 1))}
        disabled={ !slideGrid.length || selectedIdx >= slideGrid.length - 1 }
        title="Next slide (browse only — does not change the live output)"
        aria-label="Next slide"
      >
        <ChevronRight size={14} />
      </button>
      {activeSong && (
        <>
          <span style={{ width: 1, height: 18, background: 'var(--ui-border2)', margin: '0 3px' }} aria-hidden="true" />
          <motion.button {...stubTap} onClick={() => { if (activeSong) openEditorOn(activeSong, 'manual'); }} className="kog-icon-btn" title="Edit this song">
            <Edit3 size={13} /> Edit
          </motion.button>
          <button
            type="button"
            className="kog-icon-btn"
            onClick={() => clearWorkspace()}
            title="Clear the workspace — unload this song. The live output is untouched."
          >
            Clear Canvas
          </button>
        </>
      )}
    </div>
  </div>

  {/* GRID HEADER — count, selected state and density. */}
  <div className="kog-grid-header">
    <LayoutGrid size={13} color="var(--ui-faint)" aria-hidden="true" />
    <span className="kog-grid-caption">Slides</span>
    <span style={{ fontSize: 11, color: 'var(--ui-faint)', fontVariantNumeric: 'tabular-nums' }}>
      {slideGrid.length ? `${slideGrid.length} total` : 'Empty'}
    </span>
    <span style={{ flex: 1 }} />
    {slideGrid.length ? (
      <span className="kog-grid-caption kog-header-hide-sm" title="Selected slide, then the slide currently on air">
        Selected {selectedIdx + 1}
        {activeCue && activeCue.id !== 'clear' && activeSlideIndex >= 0 ? ` · Live ${activeSlideIndex + 1}` : ' · Nothing live'}
      </span>
    ) : null}
    <div className="kog-segmented" role="group" aria-label="Grid density">
      {[1, 2, 3, 4].map(d => (
        <button
          key={d}
          type="button"
          className="kog-seg-btn"
          data-active={gridDensity === d ? '1' : '0'}
          onClick={() => setGridDensity(d)}
          title={`${d} column${d === 1 ? '' : 's'}`}
          aria-pressed={gridDensity === d}
        >
          {d}
        </button>
      ))}
    </div>
  </div>

  <div ref={gridScrollRef} className="kog-grid-scroll">
    {activeSong ? (
      <div className="kog-slide-grid" style={{ gridTemplateColumns: `repeat(${gridDensity}, minmax(0, 1fr))` }}>
        {slideGrid.map((tile, i) => {
          const live = activeCue != null && activeCue.id !== 'clear' && activeSlideIndex === i;
          const selected = selectedIdx === i;
          const cueLabel = tile.isTitle ? 'Title' : (tile.cue?.label || 'Slide');
          const bgType = String(tile.cue?.bg_type || '').toLowerCase();
          const rawLabel = String(cueLabel).toLowerCase();
          const kind = tile.isTitle ? 'TITLE'
            : rawLabel.includes('verse') ? 'VERSE'
              : rawLabel.includes('pre') ? 'PRE-CHORUS'
                : rawLabel.includes('chorus') ? 'CHORUS'
                  : rawLabel.includes('bridge') ? 'BRIDGE'
                    : bgType === 'video' ? 'VIDEO'
                      : bgType === 'image' ? 'IMAGE'
                        : rawLabel === 'slide' || rawLabel === 'blank' ? 'SLIDE'
                          : cueLabel.toUpperCase().slice(0, 16);
          return (
            <React.Fragment key={tile.medIdx != null ? `med-${tile.medIdx}` : (tile.arrIdx != null ? `arr-${tile.arrIdx}` : (tile.isTitle ? 'title' : (tile.cue?.id ?? `cue-${i}`)))}>
              {/* Song Title Divider: full-width header where the flow crosses
                  into another song (skipped before the very first tile). */}
              {tile.medFirstOfSong && tile.medIdx > 0 && (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--ui-border2)' }} />
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ui-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{tile.medSong?.title || 'Next song'}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--ui-border2)' }} />
                </div>
              )}
              <div
                data-grid-pos={i}
                className="kog-slide-tile"
                data-selected={selected ? '1' : '0'}
                data-live={live ? '1' : '0'}
                onClick={() => { selectSlide(i); if (tile.medIdx != null) fireMedleySlideAt(tile.medIdx); else if (tile.isTitle) fireTitleLive(); else fireCueLive(tile.cue); }}
                title={`${kind}${tile.isTitle ? '' : ` · ${tile.cue?.label || 'Slide'}`} — click to send live`}
                style={{ display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, height: 16 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: selected ? 'var(--kog-accent)' : 'var(--ui-faint)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--ui-muted)', flexShrink: 0 }}>{kind}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--ui-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tile.isTitle ? (tile.medSong?.title || activeSong?.title || 'Song title') : (tile.cue?.label || 'Slide')}
                  </span>
                  {live ? <span className="kog-live-chip">LIVE</span> : null}
                </div>
                <div className="kog-slide-face" style={{ position: 'relative', padding: 0, lineHeight: 0 }}>
                  {renderSlideFace(tile, { aspect: (outputAspect || '16:9').replace(':', ' / '), radius: '6px', showLiveBadge: false })}
                </div>
                {tile.medSong ? (
                  <span style={{ fontSize: 9.5, color: 'var(--ui-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tile.medSong.title || 'Song'}</span>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    ) : (
      <div style={{ minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px 0' }}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          style={{ width: '100%', maxWidth: 560, border: '1px solid var(--ui-border2)', background: 'var(--ui-elev)', borderRadius: 8, padding: '34px 30px 28px', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}
        >
          <div style={{ width: 44, height: 44, borderRadius: 8, border: '1px solid var(--ui-border2)', background: 'var(--ui-elev2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
            <Music size={20} color="var(--ui-muted)" strokeWidth={1.6} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 600, color: 'var(--ui-text)', letterSpacing: '-0.01em' }}>No slides loaded</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ui-muted)', marginTop: 8, maxWidth: 400 }}>
            Open a saved service or add a song from the library. Everything you add appears here as real, output-accurate thumbnails.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => { setDockTab('shows'); setViewTab('songs'); setLeftOpen(true); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', border: '1px solid var(--kog-accent)', borderRadius: 5, background: 'var(--kog-accent-bg)', color: 'var(--kog-accent-hover)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Music size={13} /> Open song library
            </button>
            <button
              type="button"
              onClick={() => { setDockTab('shows'); setViewTab('shows'); setLeftOpen(true); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', border: '1px solid var(--ui-border2)', borderRadius: 5, background: 'var(--ui-elev)', color: 'var(--ui-text2)', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
            >
              <Folder size={13} /> Open saved shows
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderTop: '1px solid var(--ui-border)', marginTop: 24, paddingTop: 14, textAlign: 'left' }}>
            <Lightbulb size={13} color="var(--ui-faint)" style={{ flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 11, lineHeight: 1.55, color: 'var(--ui-faint)' }}>Assign a display in the top bar, then send a slide live. The Live Output panel previews exactly what the room sees.</span>
          </div>
        </motion.div>
      </div>
    )}
  </div>

  {/* NUMBERED PAGINATION — browsing only. Never fires the live output. */}
  <nav className="kog-pagination" aria-label="Slide navigation">
    <button
      type="button"
      className="kog-page-btn"
      data-nav="1"
      onClick={() => selectSlide(Math.max(0, selectedIdx - 1))}
      disabled={!slideGrid.length || selectedIdx <= 0}
      title="Previous slide (browse only)"
      aria-label="Previous slide"
    >
      <ChevronLeft size={13} />
    </button>
    {slideGrid.length === 0 ? (
      <span style={{ fontSize: 10.5, color: 'var(--ui-faint)', padding: '0 4px' }}>No slides</span>
    ) : pagerItems(slideGrid.length, selectedIdx).map((item) => (
      typeof item === 'number' ? (
        <button
          key={item}
          type="button"
          className="kog-page-btn"
          data-active={selectedIdx === item ? '1' : '0'}
          data-live={activeCue != null && activeCue.id !== 'clear' && activeSlideIndex === item ? '1' : '0'}
          onClick={() => selectSlide(item)}
          title={`Select slide ${item + 1}${activeSlideIndex === item ? ' (live)' : ''}`}
          aria-label={`Slide ${item + 1}`}
          aria-current={selectedIdx === item ? 'true' : undefined}
        >
          {item + 1}
        </button>
      ) : (
        <span key={item} className="kog-page-ellipsis" aria-hidden="true">…</span>
      )
    ))}
    <button
      type="button"
      className="kog-page-btn"
      data-nav="1"
      onClick={() => selectSlide(Math.min(slideGrid.length - 1, selectedIdx + 1))}
      disabled={!slideGrid.length || selectedIdx >= slideGrid.length - 1}
      title="Next slide (browse only)"
      aria-label="Next slide"
    >
      <ChevronRight size={13} />
    </button>
    {slideGrid.length ? (
      <span className="kog-pagination-meta">
        {selectedIdx + 1} of {slideGrid.length}
        {activeCue && activeCue.id !== 'clear' && activeSlideIndex >= 0 ? ` · Live ${activeSlideIndex + 1}` : ' · Standby'}
      </span>
    ) : null}
  </nav>
  </div>
  )}
  </div>
</div>
  );
}
