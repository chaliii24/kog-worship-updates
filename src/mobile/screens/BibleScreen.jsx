import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Search, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { C, T, TXT, TOUCH } from '../theme.js';
import { Screen, Card, Row, Pill, Dot, Btn, Field, Segmented, EmptyState, IconBtn } from '../ui.jsx';

// Scriptures & Search tab: browse installed Bible translations (book →
// chapter → verses), keyword-search them, and fire passages to the live
// output — plus show search + the active service project.
// The desktop answers through bibleRemote in the snapshot (catalog, books,
// passage, results); firing reuses the desktop scripture builder, so the
// wall looks exactly like a desktop-fired verse.
export default function BibleScreen({ C: theme, ACCENT, state, send }) {
  const ui = theme || C;
  const panel = state?.bible || null;
  const [mode, setMode] = useState('browse'); // browse | search
  const [refText, setRefText] = useState('');
  const [bookQ, setBookQ] = useState('');
  const [testament, setTestament] = useState('all');
  const [showQ, setShowQ] = useState('');
  // Browse is a three-step drill-down (books → chapter grid → reader), the
  // way the YouVersion app reads: pick a book, pick a chapter, read.
  const [view, setView] = useState('books'); // books | chapters | reader
  const [bookPick, setBookPick] = useState(null);
  // Set only for the request whose answer should open the reader — a
  // translation swap refreshes books and must never re-open a stale chapter.
  const wantReaderRef = useRef(false);
  const booksForRef = useRef('');

  // Ask once per mount until the desktop answers (reconnects re-push state,
  // so no polling — a missing panel after 1s means "not answered yet").
  useEffect(() => {
    if (!state?.bible) send('bibleCatalog');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const catalog = panel?.catalog || [];
  const abbrev = panel?.abbrev || '';
  const pickTrans = (a) => {
    setView('books');
    setBookPick(null);
    wantReaderRef.current = false;
    if (a === abbrev && panel?.books) return;
    send('bibleBooks', { abbrev: a });
  };

  const books = (panel?.books || []).filter((b) => {
    if (testament !== 'all' && b.testament !== testament) return false;
    const q = bookQ.trim().toLowerCase();
    if (q && !`${b.name} ${b.abbr || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  // Old/New Testament groups with their own headers, so the list reads like a
  // Bible's table of contents instead of one undifferentiated wall of books.
  const bookGroups = testament === 'all'
    ? [
      { key: 'ot', title: 'Old Testament', rows: books.filter((b) => b.testament === 'ot') },
      { key: 'nt', title: 'New Testament', rows: books.filter((b) => b.testament === 'nt') },
    ].filter((g) => g.rows.length)
    : [{ key: testament, title: testament === 'ot' ? 'Old Testament' : 'New Testament', rows: books }];
  const chapterCount = Math.max(0, Math.floor(Number(
    (bookPick && (books.find((b) => b.nr === bookPick.nr) || bookPick).chapters) || 0,
  )) || 0);

  // The book list powers Browse even when the first passage arrived from a
  // reference jump, so load it once per translation.
  useEffect(() => {
    if (!abbrev) return;
    if ((panel?.books || []).length) return;
    if (booksForRef.current === abbrev) return;
    booksForRef.current = abbrev;
    send('bibleBooks', { abbrev });
  }, [abbrev, panel?.books]); // eslint-disable-line react-hooks/exhaustive-deps

  // A chapter we asked for (book tap, chapter grid, arrow, Go, search hit)
  // opens the reader once its answer lands.
  useEffect(() => {
    const p = panel?.passage;
    if (!p || !wantReaderRef.current) return;
    wantReaderRef.current = false;
    setBookPick({ nr: p.bookIndex, name: p.book, chapters: p.totalChapters || 0 });
    setView('reader');
  }, [panel?.stamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const openBook = (b) => { setBookPick(b); setView('chapters'); };
  const openChapter = (book, chapter) => {
    const n = Math.max(1, Math.floor(Number(chapter) || 1));
    wantReaderRef.current = true;
    send('bibleChapter', { abbrev, book, chapter: n });
  };

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
    if (!r) return;
    wantReaderRef.current = true;
    send('bibleGo', { abbrev, ref: r });
  };

  // Shows search + active project (snapshot-local: no new commands — the
  // Lyrics tab's serviceGo/serviceStop do the work).
  const sections = state?.service?.sections || [];
  const items = sections.flatMap((s) => (s.items || []).map((i) => ({ ...i, section: s.title })));
  const q = showQ.trim().toLowerCase();
  const showHits = q ? items.filter((i) => `${i.title || ''} ${i.subtitle || ''} ${i.section || ''}`.toLowerCase().includes(q)).slice(0, 30) : [];
  const liveItem = items.find((i) => i.live) || null;

  return (
    <Screen>
      {/* ── TRANSLATION + LOOKUP ─────────────────────────────────────────── */}
      <Card pad={14}>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Row gap={7}>
            <BookOpen size={14} color={T.ACCENT} />
            <span style={{ ...TXT.label }}>Scripture</span>
          </Row>
          {abbrev ? <Pill tone="neutral">{abbrev.toUpperCase()}</Pill> : null}
        </Row>

        {catalog.length === 0 ? (
          <div style={{ fontSize: 12.5, color: ui.faint, lineHeight: 1.6 }}>
            {panel ? (panel.error || 'No Bibles installed — download one on the computer first.') : 'Asking the computer for Bibles…'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {catalog.map((t) => {
              const on = t.abbrev === abbrev;
              return (
                <button
                  key={t.abbrev}
                  type="button"
                  onClick={() => pickTrans(t.abbrev)}
                  style={{
                    flex: '0 0 auto', height: 38, padding: '0 13px', borderRadius: 10,
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800,
                    background: on ? T.ACCENT : ui.elevated2,
                    border: `1px solid ${on ? T.ACCENT : ui.border2}`,
                    color: on ? T.ON_ACCENT : ui.muted,
                  }}
                >{t.code || t.abbrev}</button>
              );
            })}
          </div>
        )}

        {panel?.error && catalog.length > 0 ? (
          <div style={{ fontSize: 12, color: T.ERROR, marginTop: 8 }}>{panel.error}</div>
        ) : null}

        {/* Reference jump: John 3:16, Psalm 23, 1 Peter 1:5 … */}
        <Row gap={6} style={{ marginTop: 10 }}>
          <Field
            value={refText}
            onChange={(e) => setRefText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') goRef(); }}
            placeholder="John 3:16"
            style={{ flex: 1, fontSize: 15 }}
          />
          <Btn variant="primary" onClick={goRef} style={{ minWidth: 58 }}>Go</Btn>
        </Row>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[['browse', 'Browse'], ['search', 'Search']]}
          style={{ marginTop: 10 }}
        />
      </Card>

      {mode === 'browse' ? (
        view === 'reader' && passage ? (
          <Card pad={14}>
            <Row gap={8} style={{ marginBottom: 10 }}>
              <IconBtn label="All chapters" size={38} variant="ghost" onClick={() => setView('chapters')}>
                <ChevronLeft size={17} />
              </IconBtn>
              <span style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16.5, fontWeight: 900, color: ui.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {passage.book} {passage.chapter}
                </span>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: ui.faint, marginTop: 1 }}>
                  {sel.length ? `${sel.length} selected` : 'Tap verses to select'}
                </span>
              </span>
              <Pill tone="neutral">{String(abbrev || '').toUpperCase()}</Pill>
            </Row>

            {/* Chapter pager — arrows walk the book, the middle shows where
                you are, exactly like a Bible app's chapter strip. */}
            <Row gap={6} style={{ marginBottom: 10 }}>
              <Btn
                size="sm"
                variant="quiet"
                disabled={passage.prev == null}
                onClick={() => openChapter(passage.bookIndex, passage.prev)}
                style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
              >{passage.prev == null ? '—' : `Ch. ${passage.prev}`}</Btn>
              <span style={{ ...TXT.meta, fontSize: 10.5, minWidth: 56, textAlign: 'center' }}>
                {passage.chapter} / {passage.totalChapters || '?'}
              </span>
              <Btn
                size="sm"
                variant="quiet"
                disabled={passage.next == null}
                onClick={() => openChapter(passage.bookIndex, passage.next)}
                style={{ flex: 1, minWidth: 0, fontSize: 11.5 }}
              >{passage.next == null ? '—' : `Ch. ${passage.next}`}</Btn>
            </Row>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '46dvh', overflowY: 'auto', paddingRight: 2 }}>
              {(passage.verses || []).map((v) => {
                const on = sel.includes(Number(v.verse));
                return (
                  <button
                    key={v.verse}
                    type="button"
                    onClick={() => toggleVerse(Number(v.verse))}
                    style={{
                      textAlign: 'left', borderRadius: 10, padding: '9px 10px', fontSize: 15,
                      lineHeight: 1.65, cursor: 'pointer', fontFamily: 'inherit',
                      background: on ? T.ACCENT_SOFT : 'transparent',
                      border: `1px solid ${on ? T.ACCENT_LINE : 'transparent'}`,
                      color: on ? ui.text : ui.text2,
                    }}
                  >
                    <b style={{ color: on ? T.ACCENT : ui.faint, marginRight: 7, fontVariantNumeric: 'tabular-nums' }}>{v.verse}</b>{v.text}
                  </button>
                );
              })}
            </div>

            <Row gap={8} style={{ marginTop: 12 }}>
              <Btn variant="primary" size="lg" icon={<Play size={16} />} onClick={fireSelected} disabled={!sel.length} style={{ flex: 1.5, fontWeight: 900 }}>
                Fire{sel.length ? ` ${sel.length} verse${sel.length > 1 ? 's' : ''}` : ''}
              </Btn>
              <Btn variant="ghost" size="lg" onClick={() => setView('chapters')} style={{ flex: 1 }}>
                Chapters
              </Btn>
            </Row>
          </Card>
        ) : view === 'chapters' && bookPick ? (
          <Card pad={14}>
            <Row gap={8} style={{ marginBottom: 10 }}>
              <IconBtn label="All books" size={38} variant="ghost" onClick={() => { setView('books'); setBookPick(null); }}>
                <ChevronLeft size={17} />
              </IconBtn>
              <span style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16.5, fontWeight: 900, color: ui.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {bookPick.name}
                </span>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', color: ui.faint, marginTop: 1 }}>
                  {chapterCount || '—'} chapters · {String(abbrev || '').toUpperCase()}
                </span>
              </span>
              <span style={{ width: 38, flexShrink: 0 }} />
            </Row>
            {chapterCount ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 8, maxHeight: '52dvh', overflowY: 'auto', paddingRight: 2 }}>
                {Array.from({ length: chapterCount }, (_, i) => i + 1).map((n) => {
                  const on = !!passage && passage.bookIndex === bookPick.nr && Number(passage.chapter) === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => openChapter(bookPick.nr, n)}
                      style={{
                        minHeight: TOUCH, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                        background: on ? T.ACCENT : ui.elevated2,
                        border: `1px solid ${on ? T.ACCENT : ui.border2}`,
                        color: on ? T.ON_ACCENT : ui.text2,
                      }}
                    >{n}</button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 12.5, color: ui.faint }}>Chapter list unavailable — pick a chapter below.</div>
            )}
          </Card>
        ) : (
          <Card pad={14}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
              <Row gap={7}>
                <BookOpen size={14} color={T.ACCENT} />
                <span style={{ ...TXT.label }}>Books</span>
              </Row>
              <span style={{ ...TXT.meta, fontSize: 10.5 }}>{books.length} shown</span>
            </Row>
            <Field value={bookQ} onChange={(e) => setBookQ(e.target.value)} placeholder="Find a book…" style={{ fontSize: 15 }} />
            <Segmented
              value={testament}
              onChange={setTestament}
              options={[['all', 'All'], ['ot', 'Old Testament'], ['nt', 'New Testament']]}
              style={{ marginTop: 8, marginBottom: 8 }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '56dvh', overflowY: 'auto', paddingRight: 2 }}>
              {bookGroups.map((g) => (
                <div key={g.key}>
                  <div style={{ ...TXT.label, position: 'sticky', top: 0, zIndex: 1, background: ui.elevated, padding: '10px 2px 6px' }}>
                    {g.title} · {g.rows.length}
                  </div>
                  {g.rows.map((b) => (
                    <button
                      key={b.nr}
                      type="button"
                      onClick={() => openBook(b)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                        minHeight: TOUCH + 4, padding: '8px 10px', marginBottom: 4, borderRadius: 11,
                        background: ui.elevated2, border: `1px solid ${ui.border2}`,
                        color: ui.text, fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.name}</span>
                        <span style={{ display: 'block', fontSize: 10.5, color: ui.faint, fontWeight: 700, marginTop: 1 }}>
                          {b.abbr ? `${b.abbr} · ` : ''}{b.chapters} chapters
                        </span>
                      </span>
                      <ChevronRight size={16} color={ui.faint} />
                    </button>
                  ))}
                </div>
              ))}
              {books.length === 0 ? (
                <div style={{ fontSize: 12.5, color: ui.faint, padding: '10px 2px' }}>
                  {panel?.books ? 'No books match.' : 'Loading books…'}
                </div>
              ) : null}
            </div>
          </Card>
        )
      ) : (
        <Card pad={14}>
          <Row gap={7} style={{ marginBottom: 10 }}>
            <Search size={14} color={T.ACCENT} />
            <span style={{ ...TXT.label }}>Search this Bible</span>
          </Row>
          <Row gap={6}>
            <Field
              value={refText}
              onChange={(e) => setRefText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && refText.trim().length >= 2) send('bibleSearch', { abbrev, q: refText.trim() }); }}
              placeholder="grace, Macedonia, still waters…"
              style={{ flex: 1, fontSize: 15 }}
            />
            <Btn
              variant="primary"
              onClick={() => { if (refText.trim().length >= 2) send('bibleSearch', { abbrev, q: refText.trim() }); }}
              style={{ width: 52, padding: 0 }}
              aria-label="Search"
            ><Search size={17} /></Btn>
          </Row>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: '48dvh', overflowY: 'auto' }}>
            {(panel?.results || []).map((r, i) => (
              <button
                key={`${r.ref}-${i}`}
                type="button"
                onClick={() => { wantReaderRef.current = true; send('bibleGo', { abbrev, ref: r.ref }); }}
                style={{
                  textAlign: 'left', borderRadius: 11, padding: '10px 11px', cursor: 'pointer',
                  fontFamily: 'inherit', background: ui.elevated2, border: `1px solid ${ui.border2}`,
                  color: ui.text,
                }}
              >
                <span style={{ display: 'block', fontSize: 11, fontWeight: 900, letterSpacing: 0.6, color: T.ACCENT }}>{r.ref}</span>
                <span style={{ display: 'block', fontSize: 12.5, lineHeight: 1.5, color: ui.text2, marginTop: 3 }}>{r.text}</span>
              </button>
            ))}
          </div>
          {panel?.results && panel.results.length === 0 ? (
            <EmptyState icon={Search} title="No matches" hint="Try fewer or different words." style={{ padding: '18px 0 6px' }} />
          ) : null}
        </Card>
      )}

      {/* ── ACTIVE PROJECT ───────────────────────────────────────────────── */}
      <Card pad={14} live={!!liveItem} tone="live">
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Row gap={7}>
            <Play size={13} color={liveItem ? T.SUCCESS : ui.faint} />
            <span style={{ ...TXT.label }}>Active project</span>
          </Row>
          {liveItem ? <Pill tone="live"><Dot tone="success" size={6} pulse /> Live</Pill> : null}
        </Row>
        {liveItem ? (
          <Row gap={9}>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, color: ui.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{liveItem.title}</span>
            <Btn size="sm" variant="danger" onClick={() => send('serviceStop', { id: liveItem.id })}>Stop</Btn>
          </Row>
        ) : (
          <div style={{ fontSize: 12.5, color: ui.faint }}>Nothing live from the service order right now.</div>
        )}
        <Field value={showQ} onChange={(e) => setShowQ(e.target.value)} placeholder="Search shows…" style={{ marginTop: 10, fontSize: 14 }} />
        {q ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {showHits.length === 0 ? <div style={{ fontSize: 12.5, color: ui.faint }}>No shows match.</div> : null}
            {showHits.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9, minHeight: 54, padding: '7px 10px',
                  borderRadius: 11,
                  background: item.live ? T.SUCCESS_SOFT : ui.elevated2,
                  border: `1px solid ${item.live ? T.SUCCESS_LINE : ui.border2}`,
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: ui.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                  <span style={{ display: 'block', fontSize: 10.5, color: ui.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.section || ''}{item.subtitle ? ` · ${item.subtitle}` : ''}
                  </span>
                </span>
                <Btn
                  size="sm"
                  variant={item.live ? 'danger' : 'primary'}
                  onClick={() => send(item.live ? 'serviceStop' : 'serviceGo', { id: item.id })}
                  style={{ minWidth: 58 }}
                >{item.live ? 'Stop' : 'Go'}</Btn>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </Screen>
  );
}
