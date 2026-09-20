import React from 'react';
import { Plus, Search, Download, Upload, Edit3, Image as ImageIcon, Video, ChevronDown, HelpCircle, ChevronLeft, CornerUpLeft, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import PresentationWorkspace from './PresentationWorkspace';

export default function CenterWorkspace() {
  const app = useApp();
  const {
    C,
    PINK,
    songs,
    activeSong,
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
    bibleLastVerseRef,
    selectBibleMedia,
    importBibleMedia,
    fireCueLive,
    fireTitleLive,
    activeSlideIndex,
    slideGrid,
    renderSlideFace,
    formatBibleVerse,
    fireBibleLive,
    fireBibleSelectionLive,
    queueBibleSelection,
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
    activePresentation
  } = app;

  const verseContainerRef = React.useRef(null);

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
        setBibleSelVerses([nextVerse.verse]);
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

  return (
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#050509' }}>
  <AnimatePresence mode="wait" initial={false}>
  {dockTab === 'scripture' ? (
    <motion.div key="scripture" initial={{ opacity: 0, x: -26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#090C10' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 16px', flexShrink: 0, borderBottom: '1px solid #1F2937', background: '#11161D' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button onClick={() => setBibleTransOpen(o => !o)} title="Select translation" style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(59,130,246,0.45)', color: '#3B82F6', padding: '7px 11px', borderRadius: 10, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {(bibleActiveEntry?.code || bibleTrans || 'BIBLE').toUpperCase()}
              <ChevronDown size={13} />
            </button>
            {bibleTransOpen && (
              <>
                <div onClick={() => setBibleTransOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
                <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 340, maxWidth: 'calc(100vw - 24px)', maxHeight: 430, zIndex: 61, display: 'flex', flexDirection: 'column', background: '#11161D', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', border: '1px solid #1F2937', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                  <div style={{ padding: 10, borderBottom: '1px solid #1F2937', display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}>
                    <Search size={12} color="#64748B" />
                    <input autoFocus value={bibleLibQuery} onChange={(e) => setBibleLibQuery(e.target.value)} placeholder={`Search ${bibleLib.length} versions…`} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: '#F8FAFC', fontSize: 12, outline: 'none' }} />
                    {bibleLibLoading && <span style={{ fontSize: 10.5, color: '#64748B' }}>Loading…</span>}
                  </div>
                  <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 8, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
                    {!bibleLibLoading && bibleLibFiltered.length === 0 && <div style={{ fontSize: 11.5, color: '#64748B', padding: '6px 4px' }}>No versions match "{bibleLibQuery}".</div>}
                    {[...bibleLibFiltered].sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0) || a.name.localeCompare(b.name)).map(b => {
                      const isInstalled = b.installed;
                      const isActive = bibleTrans === b.abbrev;
                      const downloading = bibleDL.running && bibleDL.abbrev === b.abbrev;
                      const pct = downloading ? Math.round((bibleDL.progress || 0) * 100) : 0;
                      return (
                        <div key={b.abbrev} style={{ minWidth: 0, display: 'grid', gap: 6, background: isActive ? 'rgba(37,99,235,0.15)' : 'rgba(255,255,255,0.03)', border: isActive ? '1px solid rgba(37,99,235,0.5)' : '1px solid #1F2937', borderRadius: 10, padding: '9px 11px' }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#F8FAFC', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{b.name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 600, color: isInstalled ? '#3B82F6' : '#94A3B8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isInstalled ? `Installed · ${b.books} books` : downloading ? `Downloading… ${pct}%` : `${b.size || ''}${b.lang ? ` · ${b.lang}` : ''}`.replace(/^\W+/, '') || (b.code || b.abbrev).toUpperCase()}</span>
                            {isInstalled ? (
                              <button onClick={() => { setBibleTransOpen(false); if (!isActive) openBibleTranslation(b.abbrev); }} style={{ flexShrink: 0, background: isActive ? '#2563EB' : 'rgba(255,255,255,0.06)', border: '1px solid #1F2937', color: isActive ? '#FFFFFF' : '#CBD5E1', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{isActive ? 'Active' : 'Open'}</button>
                            ) : (
                              <button onClick={() => downloadBible(b.abbrev)} disabled={downloading} style={{ flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid #1F2937', color: '#CBD5E1', padding: '5px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: downloading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{downloading ? `${pct}%` : 'Download'}</button>
                            )}
                          </div>
                          {downloading && (
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: '#2563EB', borderRadius: 999, transition: 'width 0.2s' }} />
                            </div>
                          )}
                          {isInstalled && b.abbrev !== 'kjv' && <button onClick={() => deleteBibleTranslation(b.abbrev)} style={{ justifySelf: 'start', background: 'transparent', border: 'none', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Delete from device</button>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, minWidth: 0 }}>
            <button onClick={resetBibleToBooks} style={{ background: 'transparent', border: 'none', padding: 0, color: bibleSel.bookIndex ? '#64748B' : '#3B82F6', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>Books</button>
            {bibleSel.bookIndex ? (
              <>
                <span style={{ color: '#334155' }}>›</span>
                <button onClick={resetBibleToBook} style={{ background: 'transparent', border: 'none', padding: 0, color: bibleSel.chapter ? '#64748B' : '#3B82F6', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>{bibleSel.bookName}</button>
              </>
            ) : null}
            {bibleSel.chapter ? (
              <>
                <span style={{ color: '#334155' }}>›</span>
                <span style={{ color: '#3B82F6', fontWeight: 700, whiteSpace: 'nowrap' }}>Ch. {bibleSel.chapter}</span>
              </>
            ) : null}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 10, padding: '5px 6px 5px 10px', flex: 1, maxWidth: 300, minWidth: 150 }}>
            <Search size={12} color="#64748B" />
            <input value={bibleRef} onChange={(e) => setBibleRef(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') resolveBibleReference(); }} placeholder="Quick jump: John 3:16" style={{ flex: 1, background: 'transparent', border: 'none', color: '#F8FAFC', fontSize: 12, outline: 'none', minWidth: 0 }} />
            <motion.button {...stubTap} onClick={resolveBibleReference} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #1F2937', color: '#CBD5E1', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Go</motion.button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {bibleSearchResults ? (
            <button onClick={() => setBibleSearchResults(null)} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #1F2937', color: '#CBD5E1', padding: '7px 12px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}><CornerUpLeft size={12} /> Back</button>
          ) : null}
          {bibleSelVerses.length ? <span style={{ fontSize: 10.5, fontWeight: 700, color: '#3B82F6', whiteSpace: 'nowrap' }}>{bibleSelVerses.length} selected</span> : null}
          <motion.button {...stubTap} onClick={queueBibleSelection} title="Add selected verses to the service plan" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid #334155', color: '#CBD5E1', padding: '7px 13px', borderRadius: 10, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}><Plus size={12} /> Add to Playlist</motion.button>
          <motion.button {...stubTap} onClick={fireBibleSelectionLive} title="Send selected verses to the live output" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(180deg, #3B82F6, #2563EB)', border: 'none', color: '#FFFFFF', padding: '8px 16px', borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 0 0 1px rgba(37,99,235,0.5), 0 8px 24px rgba(37,99,235,0.35)' }}><Zap size={13} /> Go Live</motion.button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', padding: '8px 16px', flexShrink: 0, borderBottom: '1px solid #1F2937', background: '#11161D' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 9, padding: 3 }}>
          {['number', 'plain', 'sentence'].map(l => (
            <motion.button {...stubTap} key={l} onClick={() => setBibleFmt(f => ({ ...f, layout: l }))} title={l === 'number' ? 'Show verse numbers' : l === 'plain' ? 'Plain verses, no numbers' : 'Sentence-case flow'} style={{ background: bibleFmt.layout === l ? 'rgba(37,99,235,0.18)' : 'transparent', border: 'none', borderRadius: 7, color: bibleFmt.layout === l ? '#3B82F6' : '#64748B', padding: '4px 10px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{l === 'number' ? 'Vv.' : l === 'plain' ? 'Plain' : 'Flow'}</motion.button>
          ))}
        </div>
        <motion.button {...stubTap} onClick={() => setBibleFmt(f => ({ ...f, bold: !f.bold }))} title="Toggle bold" style={{ background: bibleFmt.bold ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: bibleFmt.bold ? '1px solid #3B82F6' : '1px solid #1F2937', color: bibleFmt.bold ? '#3B82F6' : '#64748B', borderRadius: 9, padding: '6px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>B</motion.button>
        <motion.button {...stubTap} onClick={() => setBibleFmt(f => ({ ...f, caps: !f.caps }))} title="Uppercase" style={{ background: bibleFmt.caps ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: bibleFmt.caps ? '1px solid #3B82F6' : '1px solid #1F2937', color: bibleFmt.caps ? '#3B82F6' : '#64748B', borderRadius: 9, padding: '6px 11px', fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>Aa</motion.button>
        <div style={{ position: 'relative' }}>
          <motion.button {...stubTap} onClick={() => setBibleMediaOpen(o => !o)} title="Background media for scripture slides" style={{ display: 'flex', alignItems: 'center', gap: 6, background: bibleMedia ? 'rgba(37,99,235,0.18)' : 'rgba(255,255,255,0.04)', border: bibleMedia ? '1px solid #3B82F6' : '1px solid #1F2937', color: bibleMedia ? '#3B82F6' : '#64748B', borderRadius: 9, padding: '6px 11px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>
            {bibleMedia && bibleMedia.type === 'video' ? <Video size={12} /> : <ImageIcon size={12} />}
            <span style={{ maxWidth: 110, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bibleMedia ? (bibleMedia.name ? String(bibleMedia.name).replace(/\.[^.]+$/, '') : 'Background') : 'Background'}</span>
            <ChevronDown size={12} />
          </motion.button>
          {bibleMediaOpen && (
            <>
              <div onClick={() => setBibleMediaOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 8px)', left: 0, width: 320, maxWidth: 'calc(100vw - 24px)', maxHeight: 400, zIndex: 61, display: 'flex', flexDirection: 'column', background: '#11161D', border: '1px solid #1F2937', borderRadius: 12, boxShadow: '0 20px 50px rgba(0,0,0,0.6)', overflow: 'hidden' }}>
                <div style={{ padding: '9px 11px', borderBottom: '1px solid #1F2937', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1.2 }}>Scripture Background</span>
                  <motion.button {...stubTap} onClick={() => { selectBibleMedia(null, null, null); setBibleMediaOpen(false); }} style={{ background: 'transparent', border: 'none', color: bibleMedia ? '#f87171' : '#475569', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</motion.button>
                </div>
                <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: 10, display: 'grid', gap: 10 }}>
                  <motion.label {...stubTap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(37,99,235,0.12)', border: '1px dashed rgba(59,130,246,0.5)', color: '#93C5FD', borderRadius: 10, padding: '10px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
                    <Upload size={12} /> Upload image or video
                    <input type="file" accept="image/*,video/*" onChange={importBibleMedia} style={{ display: 'none' }} />
                  </motion.label>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.2 }}>Your Uploads</div>
                  {(scriptureBgLibrary || []).length === 0 ? (
                    <div style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.6 }}>Upload a background here to build your scripture list.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                      {(scriptureBgLibrary || []).map((asset, i) => {
                        const active = bibleMedia && bibleMedia.value === asset.value;
                        return (
                          <motion.button {...stubTap} key={i} onClick={() => { selectBibleMedia(asset.type, asset.value, asset.name); setBibleMediaOpen(false); }} title={asset.name || asset.type} style={{ position: 'relative', height: 58, padding: 0, borderRadius: 9, overflow: 'hidden', cursor: 'pointer', background: '#0B0E13', border: active ? '2px solid #3B82F6' : '1px solid #1F2937' }}>
                            {asset.type === 'video' ? (
                              <video src={asset.value} autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            ) : (
                              <img src={asset.value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            )}
                            {asset.type === 'video' && <span style={{ position: 'absolute', bottom: 3, right: 4, fontSize: 8, fontWeight: 800, background: 'rgba(0,0,0,0.7)', color: '#E2E8F0', borderRadius: 4, padding: '1px 4px' }}>VIDEO</span>}
                          </motion.button>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ fontSize: 10.5, color: '#64748B', lineHeight: 1.5 }}>Applied to verses you send live or add to the service plan.</div>
                </div>
              </div>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 9, padding: '5px 6px 5px 10px', minWidth: 180, maxWidth: 340, flex: 1 }}>
          <Search size={12} color="#64748B" />
          <input value={bibleSearchQuery} onChange={(e) => setBibleSearchQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchBibleKeywords(); }} placeholder="Search keywords in this translation…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: '#F8FAFC', fontSize: 12, outline: 'none' }} />
          <button onClick={searchBibleKeywords} style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid #1F2937', color: '#CBD5E1', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Search</button>
        </div>
      </div>

      <div key={bibleStep} className="bible-step" style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden', background: '#090C10' }}>
        {/* STEP 1 — BOOK SELECTOR */}
        {bibleStep === 'books' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid #1F2937', background: '#11161D', flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 160, maxWidth: 320 }}>
                <Search size={12} color="#64748B" style={{ position: 'absolute', left: 11, top: 9 }} />
                <input value={bibleBookQuery} onChange={(e) => setBibleBookQuery(e.target.value)} placeholder="Filter books…" style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', borderRadius: 9, padding: '8px 10px 8px 30px', color: '#F8FAFC', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[{ k: 'all', label: `All ${bibleAllBooks.length}` }, { k: 'ot', label: `OT ${bibleOtCount}` }, { k: 'nt', label: `NT ${bibleNtCount}` }].map(p => (
                  <button key={p.k} onClick={() => setBibleTestament(p.k)} title={p.k === 'all' ? 'All 66 books' : p.k === 'ot' ? 'Old Testament (39)' : 'New Testament (27)'} style={{ background: bibleTestament === p.k ? '#2563EB' : 'rgba(30,41,59,0.5)', border: bibleTestament === p.k ? '1px solid #2563EB' : '1px solid #334155', color: bibleTestament === p.k ? '#FFFFFF' : '#94A3B8', borderRadius: 8, padding: '6px 12px', fontSize: 10.5, fontWeight: 700, cursor: 'pointer' }}>{p.label}</button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: '#64748B', fontWeight: 600, whiteSpace: 'nowrap' }}>Step 1 · Choose a book</span>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              {bibleFilteredBooks.length ? (
                (() => {
                  const groups = bibleTestament === 'all'
                    ? [{ key: 'ot', title: 'Old Testament', list: bibleFilteredBooks.filter(b => b.testament === 'ot') }, { key: 'nt', title: 'New Testament', list: bibleFilteredBooks.filter(b => b.testament === 'nt') }]
                    : [{ key: 'one', title: bibleTestament === 'ot' ? 'Old Testament' : 'New Testament', list: bibleFilteredBooks }];
                  return groups.filter(g => g.list.length).map(group => (
                    <div key={group.key} style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>{group.title} · {group.list.length}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                        {group.list.map((b, i) => {
                          const active = bibleSel.bookIndex === b.nr;
                          return (
                            <button key={b.nr} className="bible-item" onClick={() => selectBibleBook(b)} title={`${b.name} — ${b.chapters} chapters`} style={{ animationDelay: `${Math.min(i * 12, 240)}ms`, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, background: active ? 'rgba(37,99,235,0.18)' : '#161B22', border: active ? '1px solid rgba(59,130,246,0.5)' : '1px solid #1F2937', borderRadius: 10, padding: '11px 12px', color: active ? '#3B82F6' : '#E2E8F0', cursor: 'pointer' }}>
                              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%' }}>
                                <span style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                                <span style={{ fontSize: 9, fontWeight: 800, color: active ? '#3B82F6' : '#64748B', background: 'rgba(255,255,255,0.05)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>{b.abbr}</span>
                              </span>
                              <span style={{ fontSize: 10.5, color: '#64748B' }}>{b.chapters} chapters</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ));
                })()
              ) : (
                <div style={{ fontSize: 12, color: '#64748B', lineHeight: 1.6, padding: 4 }}>{bibleAllBooks.length ? 'No books match your filter.' : 'Install a Bible version to browse books.'}</div>
              )}
            </div>
          </div>
        )}

        {/* STEP 2 — CHAPTER SELECTOR */}
        {bibleStep === 'chapters' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #1F2937', background: '#11161D', flexShrink: 0 }}>
              <button onClick={resetBibleToBooks} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={13} /> Books</button>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bibleSel.bookName}</div>
                <div style={{ fontSize: 10.5, color: '#64748B' }}>{bibleSel.totalChapters} chapters · Step 2 · Choose a chapter</div>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))', gap: 8 }}>
                {Array.from({ length: bibleSel.totalChapters || 0 }, (_, i) => i + 1).map((ch, i) => {
                  const active = bibleChapter && bibleChapter.book === bibleSel.bookName && bibleChapter.chapter === ch;
                  return (
                    <button key={ch} className="bible-item" onClick={() => selectBibleChapter(ch)} title={`${bibleSel.bookName} ${ch}`} style={{ animationDelay: `${Math.min(i * 8, 260)}ms`, background: active ? '#2563EB' : '#161B22', border: active ? '1px solid #2563EB' : '1px solid #30363D', color: active ? '#FFFFFF' : '#94A3B8', borderRadius: 9, padding: '12px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{ch}</button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — PASSAGE / VERSE VIEWER */}
        {bibleStep === 'verses' && (
          <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #1F2937', background: '#11161D', flexShrink: 0, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                {!bibleSearchResults && (
                  <button onClick={resetBibleToBook} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: '#CBD5E1', borderRadius: 8, padding: '6px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={13} /> {bibleSel.bookName || 'Chapters'}</button>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#F8FAFC', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{bibleSearchResults ? 'Search results' : bibleChapter ? `${bibleChapter.book} ${bibleChapter.chapter}`.toUpperCase() : 'Verses'}</div>
                  {!bibleSearchResults && bibleChapter ? <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2 }}>{bibleChapter.verses.length} verses · {(bibleActiveEntry?.code || bibleTrans).toUpperCase()}</div> : null}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ position: 'relative' }} onMouseEnter={() => setBibleHelpOpen(true)} onMouseLeave={() => setBibleHelpOpen(false)}>
                  <HelpCircle size={14} color="#64748B" style={{ cursor: 'help', display: 'block' }} />
                  <span style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 220, background: '#11161D', border: '1px solid #1F2937', borderRadius: 10, padding: '8px 10px', fontSize: 10.5, lineHeight: 1.6, color: '#CBD5E1', boxShadow: '0 16px 40px rgba(0,0,0,0.6)', zIndex: 20, opacity: bibleHelpOpen ? 1 : 0, pointerEvents: 'none', transition: 'opacity 0.12s' }}>
                    <b style={{ color: '#F8FAFC' }}>Click</b> = send live<br />
                    <b style={{ color: '#F8FAFC' }}>Ctrl + Click</b> = add / toggle multiple<br />
                    <b style={{ color: '#F8FAFC' }}>Shift + Click</b> = select a range
                  </span>
                </div>
                {bibleChapter ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => selectBibleChapter(Math.max(1, bibleChapter.chapter - 1))} disabled={bibleChapter.chapter <= 1} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: bibleChapter.chapter <= 1 ? '#475569' : '#CBD5E1', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: bibleChapter.chapter <= 1 ? 'default' : 'pointer' }}>‹</button>
                    <button onClick={() => selectBibleChapter(Math.min(bibleChapter.totalChapters, bibleChapter.chapter + 1))} disabled={bibleChapter.chapter >= bibleChapter.totalChapters} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid #1F2937', color: bibleChapter.chapter >= bibleChapter.totalChapters ? '#475569' : '#CBD5E1', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: bibleChapter.chapter >= bibleChapter.totalChapters ? 'default' : 'pointer' }}>›</button>
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 0 }}>
              <div style={{ maxWidth: 920, margin: '0 auto' }}>
                {bibleSearchResults ? (
                  bibleSearchResults.length === 0 ? (
                    <div style={{ fontSize: 12, color: '#64748B', padding: '12px 2px' }}>No matches found.</div>
                  ) : (
                    <div style={{ display: 'grid', gap: 6 }}>
                      {bibleSearchResults.map((r, i) => (
                        <button key={i} className="bible-item" onClick={async () => { setBibleSearchResults(null); const res = await loadBibleChapter(bibleTrans, r.bookIndex, r.chapter); if (res && res.bookIndex) { setBibleSelVerses([r.verse]); bibleLastVerseRef.current = r.verse; fireBibleLive({ book: res.book, chapter: res.chapter, verse: r.verse, text: formatBibleVerse({ verse: r.verse, text: r.text }) }); } }} style={{ animationDelay: `${Math.min(i * 10, 220)}ms`, textAlign: 'left', background: 'rgba(255,255,255,0.03)', border: '1px solid #1F2937', borderRadius: 10, padding: '9px 11px', cursor: 'pointer' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#3B82F6', marginBottom: 3 }}>{r.book} {r.chapter}:{r.verse}</div>
                          <div style={{ fontSize: 12, lineHeight: 1.6, color: '#CBD5E1' }}>{r.text}</div>
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
                          title="Click = send live · Ctrl+Click = add/toggle · Shift+Click = select range · Arrow keys = navigate"
                          style={{
                            animationDelay: `${Math.min(i * 6, 200)}ms`,
                            display: 'flex',
                            gap: 10,
                            cursor: 'pointer',
                            background: focused ? 'rgba(37,99,235,0.18)' : selected ? 'rgba(23,37,84,0.3)' : 'transparent',
                            border: focused ? '1px solid #3B82F6' : '1px solid transparent',
                            borderLeft: '1px solid ' + (selected ? '#3B82F6' : focused ? '#3B82F6' : 'transparent'),
                            borderRadius: 8,
                            padding: '7px 9px',
                            outline: focused ? 'none' : undefined,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#3B82F6', width: 22, flexShrink: 0, paddingTop: 2 }}>{v.verse}</span>
                          <span style={{ fontSize: 13, lineHeight: 1.6, color: bibleFmt.bold ? '#F8FAFC' : '#E2E8F0' }}>{formatBibleVerse(v)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: 40 }}>
                    <div style={{ textAlign: 'center', maxWidth: 360, display: 'grid', gap: 8, justifyItems: 'center' }}>
                      <div style={{ width: 54, height: 54, borderRadius: 16, background: 'radial-gradient(140% 140% at 30% 20%, #1e3a8a, #0d1b3e)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#3B82F6' }}>📖</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#CBD5E1' }}>Pick a book, then a chapter</div>
                      <div style={{ fontSize: 11.5, color: '#64748B', lineHeight: 1.6 }}>Click a verse to send it live instantly. Use Ctrl+Click to multi-select or Shift+Click to grab a range, then Add to Playlist or Go Live.</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  ) : (dockTab === 'presentations' || activePresentation) ? (
  <PresentationWorkspace />
  ) : (
  <motion.div key="other" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#050509' }}>
  <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexShrink: 0 }}>
    <div style={{ minWidth: 0 }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeSong?.title || 'Welcome to KOGWorship'}</h2>
      <p style={{ margin: '3px 0 0 0', fontSize: 11.5, color: C.faint }}>{activeSong?.artist ? `${activeSong.artist} • ` : ''}{activeSong?.cues ? `${activeSong.cues.length} slides` : 'Build your set, then project every lyric and verse with confidence.'}</p>
    </div>
    {activeSong && (
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, background: C.elevated2, border: '1px solid #2b2b44', borderRadius: 999, padding: '4px 10px' }}>{activeSlideIndex >= 0 ? `Slide ${activeSlideIndex}/${slideGrid.length - 1}` : `${slideGrid.length} slides`}</span>
        <motion.button {...stubTap} onClick={() => { setEditingSong(activeSong); setEditorMode('manual'); setRawPasteText(''); setIsEditorOpen(true); }} style={{ background: C.elevated2, border: '1px solid #2b2b44', color: C.text2, padding: '6px 12px', borderRadius: 8, fontSize: 11.5, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}><Edit3 size={12} /> Edit</motion.button>
      </div>
    )}
  </div>

  <div style={{ flex: 1, overflowY: 'auto', padding: '8px 18px 16px 18px' }}>
    {activeSong ? (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))', gap: 14, alignContent: 'start' }}>
        {slideGrid.map((tile, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 28, delay: Math.min(i * 0.03, 0.4) }} whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} onClick={() => tile.isTitle ? fireTitleLive() : fireCueLive(tile.cue)}>
            {renderSlideFace(tile, { height: '132px', fontSize: '14px' })}
          </motion.div>
        ))}
      </div>
    ) : (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: C.faint2, borderRadius: 14 }}>
        <div style={{ width: '100%', maxWidth: 720, aspectRatio: '16 / 9', background: '#000', border: '1px solid #1e1e2e', borderRadius: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <div style={{ width: 58, height: 58, borderRadius: 16, background: 'radial-gradient(140% 140% at 30% 20%, #3b1d6e, #1a0c30)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: PINK }}>♪</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Welcome to KOGWorship</div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 380, lineHeight: 1.5, color: C.faint2 }}>Add a song from the Songs tab, or open a saved service from the Shows tab to begin.</div>
          <div style={{ fontSize: 11.5, textAlign: 'center', maxWidth: 380, lineHeight: 1.5, color: C.faint2 }}>Tip: assign a display under Live Outputs, then press Start to project to your screens.</div>
        </div>
      </div>
    )}
  </div>
  </motion.div>
  )}
  </AnimatePresence>
</motion.div>
  );
}
