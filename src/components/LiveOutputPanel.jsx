import React, { useRef } from 'react';
import { Square, Type, SkipBack, SkipForward, Zap, FolderOpen } from 'lucide-react';
import { motion } from 'motion/react';
import { TimerReadout } from '../lib/perf';
import { stubTap, iconBtnTap } from '../lib/anim';
import { mediaLabel } from '../lib/backgrounds';
// Untitled UI — migration phase 3 (tabs): RAC-backed Tabs for the Groups/Media
// switcher (mirror layout + `@/` alias documented in NewSongPrompt.jsx).
import { Tabs, TabList, Tab, TabPanel } from '../untitledui/components/application/tabs/tabs';

export default function LiveOutputPanel({
  C,
  PINK,
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
  bibleUpNext,
  fireBibleUpNext,
  bibleFmt = { bold: false, caps: false, layout: 'number' },
  setBibleFmt,
}) {
  const isLive = activeCue != null && activeCue?.id !== 'clear';
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
  return (
    // No entrance animation: the console subtree remounts every time the song
    // editor closes (and on boot), so the old slide+fade-in with its 0.3s
    // delay flashed a dark ghost of this panel over its own slot on every
    // load. It renders instantly at full opacity.
    <div className="right-panel-shell" style={{ flex: '0 1 340px', minWidth: 280, maxWidth: '35vw', height: '100%', minHeight: 0, overflow: 'hidden', background: C.panel, borderLeft: '1px solid var(--ui-border)', flexDirection: 'column', display: 'flex' }}>
      <div style={{ padding: '12px 12px 6px 12px', borderBottom: '1px solid ' + C.border, flex: '0 1 auto', minHeight: 0, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.heading, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Output</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{activeSlideIndex >= 0 ? `${activeSlideIndex}/${slideCount - 1}` : '—'}</span>
        </div>
        <div style={{ marginBottom: 8 }}>
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
        {/* SCRIPTURE UP NEXT — the verse after the live selection, from the
            open chapter. Clicking fires that single verse. */}
        {bibleUpNext && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>
              Up Next — {bibleUpNext.ref}
            </div>
            <button
              onClick={() => fireBibleUpNext && fireBibleUpNext()}
              title={`Fire ${bibleUpNext.ref}`}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '9px 11px', fontSize: 12, lineHeight: 1.55, cursor: 'pointer' }}
            >
              {bibleUpNext.text}
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
        {/* SCRIPTURE BACKGROUND (shown when the Scripture dock button is active; applies only to scripture) */}
        {dockTab === 'scripture' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Scripture Background</span>
            {bibleMedia ? (
              <motion.button {...stubTap} onClick={() => selectBibleMediaLive(null, null, null)} title="Drop this session's background and fall back to the default" style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</motion.button>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="color" value={bibleMedia && bibleMedia.type === 'color' ? bibleMedia.value : '#0a0a0a'} onChange={(e) => pushBibleColor(e.target.value)} title="Scripture solid-color background" style={{ width: 30, height: 26, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
            <motion.button {...stubTap} onClick={() => setScripturePicker('session')} title="Pick a picture or video from your Bible media folder" style={{ flex: 1, background: C.elevated, color: C.text2, border: '1px solid var(--ui-border2)', padding: '5px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}><FolderOpen size={11} /> Choose…</motion.button>
          </div>
          {/* Replaces the old "Your Uploads" thumbnail grid. A grid asks the
              operator to browse every time; what is actually needed is ONE
              background assigned once, so scripture always arrives with art. */}
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
        )}
      </div>

      {/* While PowerPoint owns the wall (F2), song Groups & Media don't apply
          to anything on screen — show a pointer instead of dead controls.
          Lyrics controls return with F1. */}
      {sermon && sermon.loaded && sermon.passthrough ? (
        <div style={{ padding: '10px 12px', fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          PowerPoint is on the wall — song Groups & Media return when lyrics are back (F1).
        </div>
      ) : dockTab === 'scripture' ? (
      /* SCRIPTURE-ONLY OPTIONS. Groups & Media are song controls — sections
         to jump to, the song background, lyric shortcuts — and none of it
         means anything while a passage is up. The Scripture tab gets what
         actually drives scripture: text format (which re-renders the wall the
         moment it is toggled) and the read timer for pacing. */
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: '10px 12px' }}>
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
            </div>
            <div style={{ fontSize: 9.5, color: C.faint, marginTop: 6, lineHeight: 1.6 }}>
              Applies to scripture only — a passage already on the wall re-renders as you tap.
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 7 }}>Slide Timer</div>
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted }}>{slideTimer.start ? 'Running' : 'Idle'}</span>
              <TimerReadout start={slideTimer.start} duration={slideTimer.duration} C={C} PINK={PINK} />
            </div>
          </div>
        </div>
      </div>
      ) : (
      <>
      {/* GROUPS & MEDIA — Untitled UI Tabs (migration phase 3). Their TabList
          adds real tab semantics + RAC keyboard nav (arrows / Home / End) and
          brand chip states; state keys and the panel content are unchanged. */}
      <Tabs selectedKey={rightTab} onSelectionChange={setRightTab} className="min-h-0 flex-1 flex flex-col">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, background: C.panel, flexShrink: 0 }}>
          <TabList type="button-brand" size="sm" fullWidth>
            <Tab id="groups" label="Groups" />
            <Tab id="media" label="Media" />
          </TabList>
        </div>
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
        </TabPanel>
        <TabPanel id="media" className="box-border flex-1 min-h-0 overflow-y-auto p-2.5">
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Slide Timer</div>
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted }}>{slideTimer.start ? 'Running' : 'Idle'}</span>
              <TimerReadout start={slideTimer.start} duration={slideTimer.duration} C={C} PINK={PINK} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Current Output Media</div>
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.text2 }}>
              {activeSong ? (songHasBackground(activeSong) ? `Song background ${activeSong.bg_type === 'color' ? 'color' : activeSong.bg_type}` : 'Global background') : 'No song loaded'}
              {activeCue?.id === 'clear' && <span> — blackout</span>}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Shortcuts</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <div><b style={{ color: C.text2 }}>Space</b> → next slide · <b style={{ color: C.text2 }}>←</b> → previous</div>
              <div><b style={{ color: C.text2 }}>B</b> → blackout · <b style={{ color: C.text2 }}>?</b> → hotkeys</div>
            </div>
          </div>
        </TabPanel>
      </Tabs>
      </>
      )}
    </div>
  );
}
