import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { BookOpen, Search, Play, ChevronLeft, ChevronRight, Square } from 'lucide-react';
import { stubTap } from '../../lib/anim.js';

// Scriptures & Search tab: browse installed Bible translations (book →
// chapter → verses), keyword-search them, and fire passages to the live
// output — plus show search + the active service project, so one tab covers
// "what verse / what show is next".
// The desktop answers through bibleRemote in the snapshot (catalog, books,
// passage, results); firing reuses the desktop scripture builder, so the
// wall looks exactly like a desktop-fired verse.
export default function BibleScreen({ C, ACCENT, state, send }) {
  const panel = state?.bible || null;
  const [mode, setMode] = useState('browse'); // browse | search
  const [refText, setRefText] = useState('');
  const [bookQ, setBookQ] = useState('');
  const [testament, setTestament] = useState('all');
  const [showQ, setShowQ] = useState('');

  // Ask once per mount until the desktop answers (reconnects re-push state,
  // so no polling — a missing panel after 1s means "not answered yet").
  useEffect(() => {
    if (!state?.bible) send('bibleCatalog');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalog = panel?.catalog || [];
  const abbrev = panel?.abbrev || '';
  const pickTrans = (a) => {
    if (a === abbrev && panel?.books) return;
    send('bibleBooks', { abbrev: a });
  };

  const books = (panel?.books || []).filter((b) => {
    if (testament !== 'all' && b.testament !== testament) return false;
    const q = bookQ.trim().toLowerCase();
    if (q && !`${b.name} ${b.abbr || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const passage = panel?.passage || null;
  // Local multi-select, reseeded whenever a new passage arrives (Go /
  // chapter hop / search jump). Fire sends exactly what's ticked.
  const [sel, setSel] = useState([]);
  useEffect(() => {
    setSel(Array.isArray(passage?.select) ? passage.select.map(Number) : []);
  }, [panel?.stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleVerse = (n) => setSel((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));

  const fireSelected = () => {
    if (!passage || !sel.length) return;
    const byNo = new Map((passage.verses || []).map((v) => [Number(v.verse), v.text]));
    const verses = sel.filter((n) => byNo.has(n)).map((n) => ({ verse: n, text: byNo.get(n) }));
    if (!verses.length) return;
    send('bibleFire', { abbrev, book: passage.book, chapter: passage.chapter, verses });
  };

  const goRef = () => {
    const r = refText.trim();
    if (r) send('bibleGo', { abbrev, ref: r });
  };

  // Shows search + active project (snapshot-local: no new commands — the
  // Lyrics tab's serviceGo/serviceStop do the work).
  const sections = state?.service?.sections || [];
  const items = sections.flatMap((s) => (s.items || []).map((i) => ({ ...i, section: s.title })));
  const q = showQ.trim().toLowerCase();
  const showHits = q ? items.filter((i) => `${i.title || ''} ${i.subtitle || ''} ${i.section || ''}`.toLowerCase().includes(q)).slice(0, 30) : [];
  const liveItem = items.find((i) => i.live) || null;

  const card = (children, live) => (
    <div style={{ background: C.elevated, border: `1px solid ${live ? 'rgba(54,201,130,0.5)' : C.border2}`, borderRadius: 16, padding: 14, position: 'relative', overflow: 'hidden' }}>
      {live && <span style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 3, background: '#36C982' }} />}
      {children}
    </div>
  );
  const head = (Icon, title, right) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
      <Icon size={13} color={C.faint} />
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>{title}</span>
      {right}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* ── TRANSLATIONS ── */}
      {card(<>
        {head(BookOpen, 'Scripture', abbrev ? <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: C.muted }}>{abbrev.toUpperCase()}</span> : null)}
        {catalog.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.faint, lineHeight: 1.6 }}>
            {panel ? (panel.error || 'No Bibles installed — download one on the computer first.') : 'Asking the computer for Bibles…'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {catalog.map((t) => {
              const on = t.abbrev === abbrev;
              return (
                <button key={t.abbrev} onClick={() => pickTrans(t.abbrev)} style={{ flex: '0 0 auto', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: on ? ACCENT : C.elevated2, border: `1px solid ${on ? ACCENT : C.border2}`, color: on ? '#1C1C1E' : C.muted }}>
                  {t.code || t.abbrev}
                </button>
              );
            })}
          </div>
        )}
        {panel?.error && catalog.length > 0 && (
          <div style={{ fontSize: 12, color: '#FF4545', marginTop: 8 }}>{panel.error}</div>
        )}
        {/* Reference jump: John 3:16, Psalm 23, 1 Peter 1:5 … */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={refText} onChange={(e) => setRefText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goRef(); }} placeholder="John 3:16" style={{ flex: 1, minWidth: 0, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, fontSize: 13, fontWeight: 700, padding: '9px 10px', outline: 'none', fontFamily: 'inherit' }} />
          <button onClick={goRef} style={{ background: ACCENT, border: 'none', color: '#1C1C1E', borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Go</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {[['browse', 'Browse'], ['search', 'Search']].map(([v, lbl]) => (
            <button key={v} onClick={() => setMode(v)} style={{ flex: 1, borderRadius: 8, padding: '8px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: mode === v ? ACCENT : C.elevated2, border: `1px solid ${mode === v ? ACCENT : C.border2}`, color: mode === v ? '#1C1C1E' : C.muted }}>{lbl}</button>
          ))}
        </div>
      </>, false)}

      {mode === 'browse' ? (<>
        {/* ── BOOKS ── */}
        {(panel?.books || []).length > 0 && !passage && (
          card(<>
            {head(BookOpen, 'Books')}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input value={bookQ} onChange={(e) => setBookQ(e.target.value)} placeholder="Filter books…" style={{ flex: 1, minWidth: 0, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, fontSize: 12.5, fontWeight: 600, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }} />
              {[['all', 'All'], ['ot', 'OT'], ['nt', 'NT']].map(([v, lbl]) => (
                <button key={v} onClick={() => setTestament(v)} style={{ borderRadius: 8, padding: '8px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: testament === v ? ACCENT : C.elevated2, border: `1px solid ${testament === v ? ACCENT : C.border2}`, color: testament === v ? '#1C1C1E' : C.muted }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
              {books.map((b) => (
                <button key={b.nr} onClick={() => send('bibleChapter', { abbrev, book: b.nr, chapter: 1 })} style={{ borderRadius: 8, padding: '9px 6px', fontSize: 12, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {b.name}
                  <span style={{ display: 'block', fontSize: 10, color: C.faint, fontWeight: 700 }}>{b.chapters} ch</span>
                </button>
              ))}
            </div>
            {books.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No books match.</div>}
          </>, false)
        )}

        {/* ── PASSAGE ── */}
        {passage && (
          card(<>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <motion.button {...stubTap} onClick={() => send('bibleChapter', { abbrev, book: passage.bookIndex, chapter: Math.max(1, passage.chapter - 1) })} disabled={passage.prev == null} style={{ width: 34, height: 34, borderRadius: 8, background: C.elevated2, border: `1px solid ${C.border2}`, color: passage.prev == null ? C.faint2 : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: passage.prev == null ? 'default' : 'pointer', opacity: passage.prev == null ? 0.4 : 1 }}><ChevronLeft size={16} /></motion.button>
              <span style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 900 }}>{passage.book} {passage.chapter}</span>
              <motion.button {...stubTap} onClick={() => send('bibleChapter', { abbrev, book: passage.bookIndex, chapter: passage.chapter + 1 })} disabled={passage.next == null} style={{ width: 34, height: 34, borderRadius: 8, background: C.elevated2, border: `1px solid ${C.border2}`, color: passage.next == null ? C.faint2 : C.text, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: passage.next == null ? 'default' : 'pointer', opacity: passage.next == null ? 0.4 : 1 }}><ChevronRight size={16} /></motion.button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 340, overflowY: 'auto' }}>
              {(passage.verses || []).map((v) => {
                const on = sel.includes(Number(v.verse));
                return (
                  <button key={v.verse} onClick={() => toggleVerse(Number(v.verse))} style={{ textAlign: 'left', borderRadius: 9, padding: '8px 10px', fontSize: 13, lineHeight: 1.55, cursor: 'pointer', fontFamily: 'inherit', background: on ? 'rgba(255,184,0,0.16)' : 'transparent', border: `1px solid ${on ? ACCENT : 'transparent'}`, color: C.text }}>
                    <b style={{ color: on ? ACCENT : C.faint, marginRight: 7 }}>{v.verse}</b>{v.text}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <motion.button {...stubTap} onClick={fireSelected} disabled={!sel.length} style={{ flex: 1.4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: sel.length ? ACCENT : C.elevated2, border: `1px solid ${sel.length ? ACCENT : C.border2}`, color: sel.length ? '#1C1C1E' : C.muted, borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 900, cursor: sel.length ? 'pointer' : 'default', fontFamily: 'inherit', opacity: sel.length ? 1 : 0.6 }}>
                <Play size={15} /> Fire{sel.length ? ` (${sel.length})` : ''}
              </motion.button>
              <motion.button {...stubTap} onClick={() => send('bibleBooks', { abbrev })} style={{ flex: 1, background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text2, borderRadius: 10, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
                Books
              </motion.button>
            </div>
            <div style={{ fontSize: 11, color: C.faint, marginTop: 8 }}>Tap verses to select · Fire projects them exactly like the desktop.</div>
          </>, false)
        )}
      </>) : (<>
        {/* ── KEYWORD SEARCH ── */}
        {card(<>
          {head(Search, 'Search this Bible')}
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={refText} onChange={(e) => setRefText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && refText.trim().length >= 2) send('bibleSearch', { abbrev, q: refText.trim() }); }} placeholder="grace, Macedonia, still waters…" style={{ flex: 1, minWidth: 0, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, fontSize: 13, fontWeight: 600, padding: '9px 10px', outline: 'none', fontFamily: 'inherit' }} />
            <button onClick={() => { if (refText.trim().length >= 2) send('bibleSearch', { abbrev, q: refText.trim() }); }} style={{ background: ACCENT, border: 'none', color: '#1C1C1E', borderRadius: 8, padding: '0 16px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}><Search size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxHeight: 340, overflowY: 'auto' }}>
            {(panel?.results || []).map((r, i) => (
              <button key={`${r.ref}-${i}`} onClick={() => send('bibleGo', { abbrev, ref: r.ref })} style={{ textAlign: 'left', borderRadius: 9, padding: '9px 11px', cursor: 'pointer', fontFamily: 'inherit', background: C.elevated2, border: `1px solid ${C.border2}`, color: C.text }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 900, color: ACCENT }}>{r.ref}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: C.text2, marginTop: 2 }}>{r.text}</span>
              </button>
            ))}
          </div>
          {panel?.results && panel.results.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, marginTop: 8 }}>No matches — try fewer words.</div>}
        </>, false)}
      </>)}

      {/* ── ACTIVE PROJECT ── */}
      {card(<>
        {head(Play, `Active project${state?.service?.name ? ` · ${state.service.name}` : ''}`, liveItem ? <span style={{ marginLeft: 'auto', fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#36C982', background: 'rgba(54,201,130,0.15)', border: '1px solid rgba(54,201,130,0.4)', padding: '2px 7px', borderRadius: 6 }}>LIVE</span> : null)}
        {liveItem ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{liveItem.title}</span>
            <motion.button {...stubTap} onClick={() => send('serviceStop', { id: liveItem.id })} style={{ flexShrink: 0, borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', background: 'rgba(255,69,69,0.16)', border: '1px solid rgba(255,69,69,0.5)', color: '#FF4545' }}>Stop</motion.button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: C.faint }}>Nothing live from the service order right now.</div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input value={showQ} onChange={(e) => setShowQ(e.target.value)} placeholder="Search shows…" style={{ flex: 1, minWidth: 0, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 8, color: C.text, fontSize: 12.5, fontWeight: 600, padding: '8px 10px', outline: 'none', fontFamily: 'inherit' }} />
        </div>
        {q && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {showHits.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>No shows match.</div>}
            {showHits.map((item) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: item.live ? 'rgba(54,201,130,0.10)' : C.elevated2, border: `1px solid ${item.live ? 'rgba(54,201,130,0.5)' : C.border2}`, borderRadius: 11, padding: '9px 11px' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.section || ''}{item.subtitle ? ` · ${item.subtitle}` : ''}</span>
                </span>
                <motion.button {...stubTap} onClick={() => send(item.live ? 'serviceStop' : 'serviceGo', { id: item.id })} style={{ flexShrink: 0, borderRadius: 9, padding: '9px 15px', fontSize: 12.5, fontWeight: 900, cursor: 'pointer', fontFamily: 'inherit', background: item.live ? 'rgba(255,69,69,0.16)' : ACCENT, border: `1px solid ${item.live ? 'rgba(255,69,69,0.5)' : ACCENT}`, color: item.live ? '#FF4545' : '#1C1C1E' }}>{item.live ? 'Stop' : 'Go'}</motion.button>
              </div>
            ))}
          </div>
        )}
      </>, !!liveItem)}
    </div>
  );
}
