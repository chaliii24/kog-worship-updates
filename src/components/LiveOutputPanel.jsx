import React, { useEffect, useRef, useState } from 'react';
import { Square, Type, SkipBack, SkipForward, Zap, FolderOpen, Megaphone, SlidersHorizontal, Highlighter } from 'lucide-react';
import { motion } from 'motion/react';
import { TimerReadout, overlayOnAir } from '../lib/perf';
import { stubTap, iconBtnTap } from '../lib/anim';
import { mediaLabel } from '../lib/backgrounds';
import FontPicker from './FontPicker';
import { FONT_OPTIONS } from '../lib/constants';
// Untitled UI — migration phase 3 (tabs): RAC-backed Tabs for the Groups/Media
// switcher (mirror layout + `@/` alias documented in NewSongPrompt.jsx).
import { Tabs, TabList, Tab, TabPanel } from '../untitledui/components/application/tabs/tabs';
import MessageStudioModal from './modals/MessageStudioModal';

export default function LiveOutputPanel({
  C,
  PINK,
  ACCENT,
  activeSlideIndex,
  slideCount,
  renderOutputPreview,
  activeCue,
  fireCueLive,
  clearLyrics,
  handlePrevCue,
  handleNextCue,
  rightTab,
  setRightTab,
  groupLabels,
  activeSong,
  slideTimer,
  songHasBackground,
  scriptureBgLibrary,
  bibleMedia,
  selectBibleMediaLive,
  setScripturePicker,
  scriptureDefault,
  scriptureDefaultOptions = [],
  dockTab,
  fireBibleSelectionLive,
  bibleSelCount = 0,
  sermon,
  sermonShots,
  sermonGoto,
  slideGrid,
  renderSlideFace,
  fireGridTile,
  liveBible,
  toggleLiveBibleWord,
  bibleFmt = { bold: false, caps: false, layout: 'number' },
  setBibleFmt,
  // Message overlay (audience text above the slide): push/clear fns plus
  // what is live now, for the composer below.
  fireOverlay,
  clearOverlay,
  liveOverlay = null,
  // True while the projector output runs (started from the dock). The card
  // glows red only while a wall can actually show the cue — killing the
  // output fades it back even mid-song.
  projectorOn = false,
  persistMediaFile,
  // Locked while the Countdown tab is active: the countdown owns the wall,
  // so the sidebar stays visible (preview keeps running) but nothing in it
  // can fire. Unlocks itself the moment the operator leaves that tab.
  locked = false,
}) {
  const isLive = activeCue != null && activeCue?.id !== 'clear';
  // Red only while a cue is on air AND the projector runs — starting the
  // output lights it, killing the output fades it (transitions above).
  const wallLive = isLive && projectorOn;
  // The wall follows the visible layer: F2 (PowerPoint passthrough) puts the
  // sermon on screen, so the preview + Up Next switch to sermon slides.
  // F1 (lyrics) keeps the lyrics preview plus the next lyric slide.
  const pptOnAir = !!(sermon && sermon.loaded && sermon.passthrough);
  const sermonIdx = sermon && sermon.loaded ? (sermon.index || 1) : 0;
  const sermonShot = sermonIdx ? sermonShots?.[sermonIdx] : undefined;
  // Next lyric slide by flow position (medley / arrangement / library order
  // all resolve through the same grid the tiles use). Hidden for bible,
  // media and standby (index -1) and while PowerPoint owns the wall.
  const lyricsNextTile = !pptOnAir && activeSlideIndex >= 0 && Array.isArray(slideGrid) ? slideGrid[activeSlideIndex + 1] : null;
  // Color drags fire onChange per mousemove: leading edge keeps the preview
  // instant, trailing edge lands the final value so a fast drag + close never
  // loses the last color. Without this every tick sprayed IPC + re-renders.
  const bibleColorTimer = useRef(null);
  const bibleColorPending = useRef(null);
  const pushBibleColor = (value) => {
    bibleColorPending.current = value;
    if (bibleColorTimer.current) return;
    bibleColorPending.current = null;
    selectBibleMediaLive('color', value);
    bibleColorTimer.current = setTimeout(() => {
      bibleColorTimer.current = null;
      if (bibleColorPending.current != null) {
        const v = bibleColorPending.current;
        bibleColorPending.current = null;
        selectBibleMediaLive('color', v);
      }
    }, 120);
  };
  // The assigned default. Resolved back to its option when it is in the
  // list; otherwise fall back to scriptureDefault itself so a picked folder
  // file (never in the dropdown) still shows a real thumb + label.
  const defaultOpt = scriptureDefaultOptions.find(o => o.value === (scriptureDefault && scriptureDefault.value))
    || (scriptureDefault && scriptureDefault.value
      ? { value: scriptureDefault.value, type: scriptureDefault.type, label: mediaLabel(scriptureDefault.name, scriptureDefault.type) }
      : null);
  // Message-overlay composer draft (remembered across visits so the Sunday
  // regulars are one tap away).
  const validMedia = (m) => (m && typeof m.url === 'string' && m.url ? { url: m.url.slice(0, 500), pos: ['tl', 'tr', 'bl', 'br'].includes(m.pos) ? m.pos : 'br' } : null);
  const [ovDraft, setOvDraft] = useState(() => {
    try {
      const d = JSON.parse(localStorage.getItem('kog-overlay-draft') || '{}');
      return {
        text: typeof d.text === 'string' ? d.text : '',
        style: d.style === 'center' || d.style === 'banner' ? d.style : 'lower',
        secs: [5, 10, 30, 0].includes(Number(d.secs)) ? Number(d.secs) : 10,
        media: validMedia(d.media),
      };
    } catch { return { text: '', style: 'lower', secs: 10, media: null }; }
  });
  useEffect(() => {
    try { localStorage.setItem('kog-overlay-draft', JSON.stringify(ovDraft)); } catch {}
  }, [ovDraft]);
  const overlayLive = overlayOnAir(liveOverlay) ? liveOverlay : null;
  const ovReady = !!(ovDraft.text.trim() || (ovDraft.media && ovDraft.media.url));
  const [studioOpen, setStudioOpen] = useState(false);
  // Scripture panel split: the live word list (highlight) and everything that
  // styles scripture (text format, backgrounds, timer) live on two tabs so the
  // preview never has to scroll and the controls are never squeezed out.
  const [scriptureTab, setScriptureTab] = useState(() => {
    try { return localStorage.getItem('kog-scripture-panel-tab') === 'settings' ? 'settings' : 'highlight'; } catch { return 'highlight'; }
  });
  const pickScriptureTab = (t) => { setScriptureTab(t); try { localStorage.setItem('kog-scripture-panel-tab', t); } catch {} };
  // Locked panels dim their firing controls. `inert` (not pointer-events)
  // does the blocking: clicks AND keyboard focus die, but the scroll
  // containers keep scrolling — a pointer-events overlay would eat the wheel
  // and trap the Groups list mid-scroll.
  const lockStyle = locked ? { opacity: 0.45, userSelect: 'none', filter: 'saturate(0.6)' } : undefined;
  const lockInert = locked ? true : undefined;
  return (
    // No entrance animation: the console subtree remounts every time the song
    // editor closes (and on boot), so the old slide+fade-in with its 0.3s
    // delay flashed a dark ghost of this panel over its own slot on every
    // load. It renders instantly at full opacity.
    <div className="right-panel-shell" style={{ flex: '0 1 340px', minWidth: 280, maxWidth: '35vw', height: '100%', minHeight: 0, overflow: 'hidden', background: C.panel, borderLeft: '1px solid var(--ui-border)', flexDirection: 'column', display: 'flex' }}>
      {/* Preview + transport only — this block is FIXED, never scrolls. The
          live word list and the scripture styling controls moved down into the
          Highlight / Settings tabs, which is what stopped the old preview
          half from growing until it squeezed the options to zero height. */}
      <div style={{ padding: '12px 12px 6px 12px', borderBottom: '1px solid ' + C.border, flex: '0 0 auto', minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.heading, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Output</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{activeSlideIndex >= 0 ? `${activeSlideIndex}/${slideCount - 1}` : '—'}</span>
        </div>
        <div style={{ marginBottom: 8, position: 'relative', borderRadius: 10, border: wallLive ? '2px solid #ef4444' : '1px solid transparent', boxShadow: wallLive ? '0 0 22px -6px rgba(239,68,68,0.6)' : 'none', transition: 'border-color 0.45s ease, box-shadow 0.45s ease', padding: wallLive ? 1 : 0 }}>
          <span style={{ position: 'absolute', top: 6, left: 6, zIndex: 5, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#fff', background: '#dc2626', borderRadius: 6, padding: '2px 8px', boxShadow: '0 2px 10px rgba(0,0,0,0.5)', opacity: wallLive ? 1 : 0, transition: 'opacity 0.45s ease', pointerEvents: 'none' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />LIVE
          </span>
          {pptOnAir ? (
            <div style={{ aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000', border: '1px solid var(--ui-border2)', position: 'relative' }}>
              {sermonShot ? (
                <img src={sermonShot} alt={`Slide ${sermonIdx}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
              ) : (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>
                  {sermonShot === null ? 'Preview unavailable' : 'Rendering…'}
                </span>
              )}
              {sermon.total ? (
                <span style={{ position: 'absolute', left: 6, bottom: 6, fontSize: 9.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 5, padding: '1px 7px' }}>
                  Slide {sermonIdx} of {sermon.total}
                </span>
              ) : null}
            </div>
          ) : renderOutputPreview()}
        </div>
        {/* Everything below the preview fires at the wall, so it all locks
            together while the Countdown tab owns the output. */}
        <div style={lockStyle} inert={lockInert} aria-disabled={locked || undefined}>
        {/* LYRICS UP NEXT — the slide that follows the live one in the flow.
            Clicking fires it, exactly like its grid tile. */}
        {lyricsNextTile && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
              Up Next{lyricsNextTile.isTitle ? ' — Title' : (lyricsNextTile.cue?.label ? ` — ${lyricsNextTile.cue.label}` : '')}
            </div>
            <button
              onClick={() => fireGridTile && fireGridTile(lyricsNextTile)}
              title={lyricsNextTile.isTitle ? 'Fire the title slide' : 'Fire this slide'}
              style={{ display: 'block', width: '100%', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--ui-border2)', cursor: 'pointer', padding: 0, background: 'transparent' }}
            >
              {renderSlideFace ? renderSlideFace(lyricsNextTile, { aspect: '16 / 9' }) : null}
            </button>
          </div>
        )}
        {/* SCRIPTURE: explicit push — verse clicks only select locally */}
        {dockTab === 'scripture' && (
          <div style={{ marginBottom: 8 }}>
            <motion.button
              {...stubTap}
              onClick={() => fireBibleSelectionLive?.()}
              title="Send the selected scripture verses to the projector"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                background: 'linear-gradient(180deg, #8b5cf6, #7c3aed)',
                border: 'none',
                color: '#FFFFFF',
                padding: '9px 14px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 0 1px rgba(139,92,246,0.5), 0 8px 24px rgba(139,92,246,0.3)',
              }}
            >
              <Zap size={13} />
              Push to Display
              {bibleSelCount > 0 ? ` (${bibleSelCount})` : ''}
            </motion.button>
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>
              {bibleSelCount > 0
                ? `${bibleSelCount} verse${bibleSelCount === 1 ? '' : 's'} selected — pushes as one slide`
                : 'Select verses, then push them to the output'}
            </div>
          </div>
        )}
        {/* OUTPUT CONTROLS sit directly under Push to Display on purpose: the
            Scripture Background block below used to carry a thumbnail grid of
            every upload, and on a short window it pushed Clear Lyrics / Clear
            All past the fold where they could not be reached at all. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexShrink: 0 }}>
          <motion.button {...stubTap} onClick={clearLyrics} title="Take the words off the screen and keep the background running" style={{ flex: 1, minWidth: 0, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.35)', color: '#c4b5fd', padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Type size={12} /> Clear Lyrics</motion.button>
          <motion.button {...stubTap} onClick={() => fireCueLive({ id: 'clear', label: 'Clear', text: '' })} title="Clear everything — words and background" style={{ flex: 1, minWidth: 0, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '7px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Square size={12} /> Clear All</motion.button>
          <motion.button {...iconBtnTap} onClick={handlePrevCue} style={{ width: 44, background: C.elevated, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SkipBack size={14} /></motion.button>
          <motion.button {...iconBtnTap} onClick={handleNextCue} style={{ width: 44, background: C.elevated, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SkipForward size={14} /></motion.button>
        </div>
        {studioOpen && (
          <MessageStudioModal
            C={C}
            ACCENT={ACCENT}
            ovDraft={ovDraft}
            setOvDraft={setOvDraft}
            overlayLive={overlayLive}
            fireOverlay={fireOverlay}
            clearOverlay={clearOverlay}
            persistMediaFile={persistMediaFile}
            onClose={() => setStudioOpen(false)}
          />
        )}
        {/* SERMON UP NEXT — what the projector will show after the current
            sermon slide. Only while PowerPoint owns the wall (F2); under
            lyrics (F1) it would advertise slides nobody can see. */}
        {sermon && sermon.loaded && sermon.passthrough && sermon.total && (sermon.index || 1) < sermon.total && (() => {
          const nextIdx = (sermon.index || 1) + 1;
          const shot = sermonShots?.[nextIdx];
          return (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
                Up Next — Slide {nextIdx} of {sermon.total}
              </div>
              <button
                onClick={() => sermonGoto && sermonGoto(nextIdx)}
                title={`Jump to slide ${nextIdx}`}
                style={{ display: 'block', width: '100%', aspectRatio: '16 / 9', borderRadius: 8, overflow: 'hidden', background: '#000', border: '1px solid var(--ui-border2)', cursor: 'pointer', padding: 0, position: 'relative' }}
              >
                {shot ? (
                  <img src={shot} alt={`Slide ${nextIdx}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                ) : (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.muted }}>
                    {shot === null ? 'Unavailable' : 'Rendering…'}
                  </span>
                )}
              </button>
            </div>
          );
        })()}
        </div>
      </div>

      {/* While PowerPoint owns the wall (F2), song Groups & Media don't apply
          to anything on screen — show a pointer instead of dead controls.
          Lyrics controls return with F1. */}
      {/* Same lock as above: the wrapper is a flex column so the Tabs'
          flex-1 sizing underneath is untouched. */}
      <div className="min-h-0 flex-1 flex flex-col" style={lockStyle} inert={lockInert} aria-disabled={locked || undefined}>
      {sermon && sermon.loaded && sermon.passthrough ? (
        <div style={{ padding: '10px 12px', fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          The slideshow is on the wall — song Groups & Media return when lyrics are back (F1).
        </div>
      ) : dockTab === 'scripture' ? (
      /* SCRIPTURE — TWO TABS under a fixed preview. Highlight carries the live
         passage word by word (tap = marker-pen on the wall) plus the read
         timer for pacing; Scripture Settings carries everything that styles
         scripture — text format, solid/picture/video backgrounds and the
         default attached to new scripture. Splitting them is what finally
         stopped the old preview half from growing until it squeezed the
         options to zero height: the preview and the transport above never
         scroll, and each tab scrolls on its own. */
      <div className="min-h-0 flex-1 flex flex-col" style={{ padding: '10px 12px 0 12px' }}>
        <div role="tablist" style={{ display: 'flex', gap: 4, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 3, marginBottom: 9, flexShrink: 0 }}>
          {[['highlight', 'Highlight'], ['settings', 'Scripture Settings']].map(([id, label]) => (
            <motion.button
              {...stubTap}
              key={id}
              role="tab"
              aria-selected={scriptureTab === id}
              data-testid={`scripture-tab-${id}`}
              onClick={() => pickScriptureTab(id)}
              title={id === 'highlight' ? 'The passage on the wall — tap words to highlight them' : 'Text format, backgrounds and the read timer'}
              style={{ flex: 1, minWidth: 0, background: scriptureTab === id ? 'rgba(139,92,246,0.18)' : 'transparent', border: 'none', borderRadius: 8, color: scriptureTab === id ? '#8b5cf6' : C.faint, padding: '6px 6px', fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            >
              {label}
              {id === 'highlight' && liveBible && liveBible.markWords.length > 0 ? (
                <span style={{ fontSize: 9, fontWeight: 900, background: bibleFmt.mark || '#FDE047', color: '#000', borderRadius: 8, padding: '0 5px', flexShrink: 0 }}>{liveBible.markWords.length}</span>
              ) : null}
            </motion.button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto" style={{ paddingRight: 2, paddingBottom: 10 }}>
        {scriptureTab === 'highlight' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* LIVE VERSES — the scripture on the wall right now, word by word.
              Tapping a word flips its marker-pen highlight in place (same
              slide id, so the service row keeps Stop). */}
          <div data-testid="liveverse-card">
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
              {liveBible && liveBible.verses.length > 0
                ? `On the wall — tap words to highlight${liveBible.book ? ` · ${liveBible.book}${liveBible.chapter ? ` ${liveBible.chapter}` : ''}` : ''}`
                : 'Tap words to highlight'}
            </div>
            {liveBible && liveBible.verses.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {liveBible.verses.map((v) => {
                  const words = String(v.text || '').split(/\s+/).filter(Boolean);
                  return (
                    <div key={v.verse} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px' }}>
                      <div style={{ fontSize: 10, fontWeight: 900, color: C.faint, marginBottom: 4 }}>Verse {v.verse}</div>
                      <div style={{ fontSize: 12.5, lineHeight: 2, color: C.text2 }}>
                        {words.map((w, k) => {
                          const key = `${v.verse}:${k}`;
                          const marked = liveBible.markWords.includes(key);
                          return (
                            <button
                              key={key}
                              data-testid={`liveword-${key}`}
                              onClick={() => toggleLiveBibleWord && toggleLiveBibleWord(key)}
                              title={marked ? `Unmark "${w}"` : `Highlight "${w}" on the wall`}
                              style={{
                                background: marked ? (bibleFmt.mark || '#FDE047') : 'transparent',
                                border: 'none',
                                borderRadius: 4,
                                color: marked ? '#000000' : C.text2,
                                fontSize: 12.5,
                                fontWeight: marked ? 800 : 400,
                                lineHeight: 2,
                                cursor: 'pointer',
                                padding: '0 3px',
                                marginRight: 1,
                                fontFamily: 'inherit',
                              }}
                            >{w}</button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ background: C.elevated, border: '1px dashed var(--ui-border2)', borderRadius: 8, padding: '12px 11px', fontSize: 11, color: C.faint, lineHeight: 1.6 }}>
                Nothing on the wall yet. Select verses in the chapter and press Push to Display — the passage then appears here word by word, ready to highlight.
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7 }}>Slide Timer</div>
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted }}>{slideTimer.start ? 'Running' : 'Idle'}</span>
              <TimerReadout start={slideTimer.start} duration={slideTimer.duration} C={C} PINK={PINK} />
            </div>
          </div>
        </div>
        ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7 }}>Scripture Text</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: 3 }}>
                {['number', 'plain', 'sentence'].map(l => (
                  <motion.button
                    {...stubTap}
                    key={l}
                    onClick={() => setBibleFmt && setBibleFmt(f => ({ ...f, layout: l }))}
                    title={l === 'number' ? 'Show verse numbers' : l === 'plain' ? 'Plain verses, no numbers' : 'Sentence-case flow'}
                    style={{ background: bibleFmt.layout === l ? 'rgba(139,92,246,0.18)' : 'transparent', border: 'none', borderRadius: 7, color: bibleFmt.layout === l ? '#8b5cf6' : C.faint, padding: '5px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                  >{l === 'number' ? 'Vv.' : l === 'plain' ? 'Plain' : 'Flow'}</motion.button>
                ))}
              </div>
              <motion.button {...stubTap} onClick={() => setBibleFmt && setBibleFmt(f => ({ ...f, bold: !f.bold }))} title="Toggle bold" style={{ background: bibleFmt.bold ? 'rgba(139,92,246,0.18)' : C.elevated, border: bibleFmt.bold ? '1px solid #8b5cf6' : '1px solid var(--ui-border2)', color: bibleFmt.bold ? '#8b5cf6' : C.faint, borderRadius: 9, padding: '7px 12px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>B</motion.button>
              <motion.button {...stubTap} onClick={() => setBibleFmt && setBibleFmt(f => ({ ...f, caps: !f.caps }))} title="Uppercase" style={{ background: bibleFmt.caps ? 'rgba(139,92,246,0.18)' : C.elevated, border: bibleFmt.caps ? '1px solid #8b5cf6' : '1px solid var(--ui-border2)', color: bibleFmt.caps ? '#8b5cf6' : C.faint, borderRadius: 9, padding: '7px 12px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, cursor: 'pointer' }}>Aa</motion.button>
              <div title="Scripture font (Default = stage style)" style={{ flex: '1 1 150px', minWidth: 130 }}>
                <FontPicker value={bibleFmt.font || ''} choices={[{ label: 'Default font', value: '' }, ...FONT_OPTIONS]} onChange={(v) => setBibleFmt && setBibleFmt(f => ({ ...f, font: v || null }))} C={C} />
              </div>
              <div title="Scripture text colour" style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '4px 7px' }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: bibleFmt.color ? '#8b5cf6' : C.faint }}>A</span>
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(bibleFmt.color || '') ? bibleFmt.color : '#ffffff'} onChange={(e) => setBibleFmt && setBibleFmt(f => ({ ...f, color: e.target.value }))} title="Pick the scripture text colour" style={{ width: 26, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} />
                {bibleFmt.color && <button onClick={() => setBibleFmt && setBibleFmt(f => ({ ...f, color: null }))} title="Back to the stage style colour" style={{ background: 'transparent', border: 'none', color: C.faint, fontSize: 11, cursor: 'pointer', padding: '0 2px' }}>✕</button>}
              </div>
              <motion.button {...stubTap} data-testid="bible-highlighter" onClick={() => { const on = !bibleFmt.mark; setBibleFmt && setBibleFmt(f => ({ ...f, mark: on ? (f.mark || '#FDE047') : null })); if (on) pickScriptureTab('highlight'); }} title={bibleFmt.mark ? 'Highlighter on — pick words on the Highlight tab' : 'Switch the highlighter on, then tap words on the Highlight tab'} style={{ background: bibleFmt.mark ? 'rgba(139,92,246,0.18)' : C.elevated, border: bibleFmt.mark ? '1px solid #8b5cf6' : '1px solid var(--ui-border2)', color: bibleFmt.mark ? '#8b5cf6' : C.faint, borderRadius: 9, padding: '7px 10px', cursor: 'pointer', display: 'flex' }}><Highlighter size={13} /></motion.button>
              {bibleFmt.mark && (
                <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(bibleFmt.mark || '') ? bibleFmt.mark : '#FDE047'} onChange={(e) => setBibleFmt && setBibleFmt(f => ({ ...f, mark: e.target.value }))} title="Highlight colour" style={{ width: 30, height: 26, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, cursor: 'pointer', padding: 2 }} />
              )}
            </div>
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
              Font, colour and highlight apply to scripture only — a passage already on the wall re-renders as you tap.
            </div>
          </div>
          {/* SCRIPTURE BACKGROUND — a solid colour for this session plus the
              default attached to every scripture added to a section. */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Scripture Background</span>
              {bibleMedia ? (
                <motion.button {...stubTap} onClick={() => selectBibleMediaLive(null, null, null)} title="Drop this session's background and fall back to the default" style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</motion.button>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="color" value={bibleMedia && bibleMedia.type === 'color' ? bibleMedia.value : '#0a0a0a'} onChange={(e) => pushBibleColor(e.target.value)} title="Scripture solid-color background" style={{ width: 30, height: 26, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
              <motion.button {...stubTap} onClick={() => setScripturePicker('session')} title="Pick a picture or video from your Bible media folder" style={{ flex: 1, background: C.elevated, color: C.text2, border: '1px solid var(--ui-border2)', padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><FolderOpen size={11} /> Choose…</motion.button>
            </div>
            {/* ONE background assigned once, so scripture always arrives with
                art — instead of a thumbnail grid the operator re-browses. */}
            <div style={{ marginTop: 7 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Default for new scripture</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {defaultOpt && (
                  <div style={{ width: 48, height: 27, flexShrink: 0, borderRadius: 5, overflow: 'hidden', border: '1px solid ' + C.border2, background: '#000' }}>
                    {defaultOpt.type === 'video'
                      ? <video src={defaultOpt.value} autoPlay loop muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <img src={defaultOpt.value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                  </div>
                )}
                <motion.button {...stubTap} onClick={() => setScripturePicker('default')} title="Background attached to every scripture you add to a section" style={{ flex: 1, minWidth: 0, textAlign: 'left', background: C.elevated, border: '1px solid ' + C.border2, color: C.text, borderRadius: 6, padding: '6px 9px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{defaultOpt ? defaultOpt.label : 'Choose…'}</span>
                  <FolderOpen size={11} style={{ flexShrink: 0, color: C.faint }} />
                </motion.button>
              </div>
            </div>
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>{bibleMedia
              ? `Live override: ${bibleMedia.type === 'color' ? bibleMedia.value : (bibleMedia.name ? mediaLabel(bibleMedia.name, bibleMedia.type) : bibleMedia.type)} · new scripture still uses the default`
              : defaultOpt ? `No override — scripture runs on “${defaultOpt.label}”.` : 'Assign a default so scripture is never added blank.'}</div>
          </div>
        </div>
        )}
        </div>
      </div>
      ) : (
      <>
      {/* GROUPS & OVERLAY — Untitled UI Tabs (migration phase 3). Their TabList
          adds real tab semantics + RAC keyboard nav (arrows / Home / End) and
          brand chip states; state keys and the panel content are unchanged.
          The old Media tab's glanceables (timer, output media, shortcuts)
          live as a slim footer inside Groups, so the list keeps full height. */}
      <Tabs selectedKey={rightTab} onSelectionChange={setRightTab} className="min-h-0 flex-1 flex flex-col">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, background: C.panel, flexShrink: 0 }}>
          <TabList type="button-brand" size="sm" fullWidth>
            <Tab id="overlay" label="Overlay" />
            <Tab id="groups" label="Groups" />
          </TabList>
        </div>
        <TabPanel id="overlay" className="box-border flex-1 min-h-0 overflow-y-auto p-2.5">
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Megaphone size={12} color={overlayLive ? '#4ade80' : C.faint} />
              <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2 }}>Message</span>
              <span style={{ flex: 1 }} />
              {overlayLive && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#4ade80' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 7px #22c55e' }} />LIVE
                </span>
              )}
            </div>
            <input
              value={ovDraft.text}
              onChange={(e) => setOvDraft((d) => ({ ...d, text: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter' && ovReady && fireOverlay) fireOverlay(ovDraft.text, { style: ovDraft.style, secs: ovDraft.secs, media: ovDraft.media || null }); }}
              placeholder="Welcome home! … (optional with a bug)"
              style={{ width: '100%', boxSizing: 'border-box', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '7px 9px', fontSize: 12, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 4 }}>
              {[['lower', 'Lower'], ['center', 'Center'], ['banner', 'Banner']].map(([v, lbl]) => (
                <button key={v} onClick={() => setOvDraft((d) => ({ ...d, style: v }))} title={v === 'lower' ? 'Lower-third bar' : v === 'center' ? 'Centered card' : 'Top banner'} style={{ flex: 1, background: ovDraft.style === v ? 'rgba(139,92,246,0.18)' : 'transparent', border: '1px solid ' + (ovDraft.style === v ? 'rgba(139,92,246,0.55)' : 'var(--ui-border2)'), color: ovDraft.style === v ? '#C4B5FD' : C.muted, borderRadius: 7, padding: '5px 0', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {[[5, '5s'], [10, '10s'], [30, '30s'], [0, 'Pinned']].map(([v, lbl]) => (
                <button key={lbl} onClick={() => setOvDraft((d) => ({ ...d, secs: v }))} title={v === 0 ? 'Stays until cleared' : `Auto-clears after ${v} seconds`} style={{ flex: 1, background: ovDraft.secs === v ? 'rgba(139,92,246,0.18)' : 'transparent', border: '1px solid ' + (ovDraft.secs === v ? 'rgba(139,92,246,0.55)' : 'var(--ui-border2)'), color: ovDraft.secs === v ? '#C4B5FD' : C.muted, borderRadius: 7, padding: '5px 0', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>{lbl}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {ovDraft.media && ovDraft.media.url ? (
                <>
                  <img src={ovDraft.media.url} alt="" style={{ width: 44, height: 25, objectFit: 'cover', borderRadius: 5, border: '1px solid var(--ui-border2)', background: '#000', flexShrink: 0 }} />
                  <div style={{ display: 'flex', gap: 3 }}>
                    {[['tl', '↖', 'Top left'], ['tr', '↗', 'Top right'], ['bl', '↙', 'Bottom left'], ['br', '↘', 'Bottom right']].map(([v, lbl, tip]) => (
                      <button key={v} onClick={() => setOvDraft((d) => ({ ...d, media: d.media ? { ...d.media, pos: v } : d.media }))} title={tip} style={{ width: 24, background: ovDraft.media.pos === v ? 'rgba(139,92,246,0.18)' : 'transparent', border: '1px solid ' + (ovDraft.media.pos === v ? 'rgba(139,92,246,0.55)' : 'var(--ui-border2)'), color: ovDraft.media.pos === v ? '#C4B5FD' : C.muted, borderRadius: 6, padding: '3px 0', fontSize: 11, fontWeight: 800, cursor: 'pointer', lineHeight: 1 }}>{lbl}</button>
                    ))}
                  </div>
                  <span style={{ flex: 1 }} />
                  <button onClick={() => setOvDraft((d) => ({ ...d, media: null }))} title="Remove the corner bug (keeps the text)" style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>Remove</button>
                </>
              ) : (
                <label title="Pin a logo or art image to a wall corner (PNG/JPG/GIF)" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '5px 10px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                  <FolderOpen size={11} /> Corner bug…
                  <input type="file" accept=".png,.jpg,.jpeg,.gif,.webp" style={{ display: 'none' }} onChange={(e) => {
                    const f = e.target.files && e.target.files[0];
                    if (e.target) e.target.value = '';
                    if (!f || !persistMediaFile) return;
                    persistMediaFile(f).then((url) => {
                      if (url) setOvDraft((d) => ({ ...d, media: { url, pos: (d.media && d.media.pos) || 'br' } }));
                    }).catch(() => {});
                  }} />
                </label>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <motion.button {...stubTap} onClick={() => { if (ovReady && fireOverlay) fireOverlay(ovDraft.text, { style: ovDraft.style, secs: ovDraft.secs, media: ovDraft.media || null }); }} title="Pin this message above the live slide" style={{ flex: 1, background: ovReady ? ACCENT : C.elevated2, border: '1px solid ' + (ovReady ? ACCENT : 'var(--ui-border2)'), color: '#fff', borderRadius: 7, padding: '7px 0', fontSize: 11.5, fontWeight: 800, cursor: ovReady ? 'pointer' : 'default', opacity: ovReady ? 1 : 0.55 }}>Show</motion.button>
              {overlayLive && (
                <motion.button {...stubTap} onClick={() => clearOverlay && clearOverlay()} title="Take the message down (the slide stays)" style={{ flex: 1, background: 'transparent', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171', borderRadius: 7, padding: '7px 0', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>Clear</motion.button>
              )}
              <button onClick={() => setStudioOpen(true)} title="Open the message studio (visual styles, templates)" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 7, padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}><SlidersHorizontal size={13} /></button>
            </div>
            <div style={{ fontSize: 9.5, color: C.faint, lineHeight: 1.5 }}>Sits above slides · M toggles · Enter sends · templates in Studio.</div>
          </div>
        </TabPanel>
        <TabPanel id="groups" className="box-border flex-1 min-h-0 overflow-y-auto p-2.5">
          {groupLabels.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Quick Jump</div>
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groupLabels.map(label => {
                  // Chips carry the cue's own label ("Chorus (Part 2)" included),
                  // so highlight on EXACT match first — that is what lights the
                  // parted slide you are standing on. The base-name fallback
                  // covers labels that arrive without their part suffix.
                  const liveLabel = activeCue?.label || '';
                  const liveBase = liveLabel.replace(/\s*\(Part\s+\d+\)\s*$/i, '');
                  const on = liveLabel === label || (liveBase !== '' && liveBase === label);
                  return (
                  <motion.button {...stubTap} key={label} onClick={() => {
                    // Labels here are BASE names ("Chorus") while split cues
                    // read "Chorus (Part 2)" — exact match found nothing and
                    // the chip silently no-opped on parted songs.
                    const cues = activeSong?.cues || [];
                    const c = cues.find(x => x.label === label)
                      || cues.find(x => (x.label || '').startsWith(label + ' (Part'));
                    if (c) fireCueLive(c);
                  }} style={{ background: C.elevated, border: on ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', color: on ? PINK : C.text2, borderRadius: 999, padding: '6px 13px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{label}</motion.button>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>Click a group to jump straight to its first slide on all outputs.</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.faint2, padding: 6 }}>Load a song to see its sections here.</div>
          )}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--ui-border2)', display: 'grid', gap: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2 }}>Slide Timer</span>
              <span style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, color: C.muted }}>{slideTimer.start ? 'Running' : 'Idle'}</span>
              <TimerReadout start={slideTimer.start} duration={slideTimer.duration} C={C} PINK={PINK} />
            </div>
            <div style={{ fontSize: 10.5, color: C.faint, lineHeight: 1.5 }}>
              {activeSong ? (songHasBackground(activeSong) ? `Song background ${activeSong.bg_type === 'color' ? 'color' : activeSong.bg_type}` : 'Global background') : 'No song loaded'}
              {activeCue?.id === 'clear' && <span> — blackout</span>}
            </div>
            <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.7 }}>
              <div><b style={{ color: C.text2 }}>Space</b> → next · <b style={{ color: C.text2 }}>←</b> → prev · <b style={{ color: C.text2 }}>B</b> → blackout · <b style={{ color: C.text2 }}>?</b> → hotkeys</div>
            </div>
          </div>
        </TabPanel>
      </Tabs>
      </>
      )}
      </div>
    </div>
  );
}
