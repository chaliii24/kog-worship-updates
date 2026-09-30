import React, { useRef } from 'react';
import { Square, Type, SkipBack, SkipForward, Image as ImageIcon, Video, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { TimerReadout } from '../lib/perf';
import { stubTap, iconBtnTap } from '../lib/anim';
import Dropdown from './Dropdown';
// Untitled UI — migration phase 3 (tabs): RAC-backed Tabs for the Groups/Media
// switcher (mirror layout + `@/` alias documented in NewSongPrompt.jsx).
import { Tabs, TabList, Tab, TabPanel } from '../untitledui/components/application/tabs/tabs';

export default function LiveOutputPanel({
  C,
  PINK,
  activeSlideIndex,
  slideCount,
  renderOutputPreview,
  outputDisplays,
  selectedOutputDisplay,
  selectOutputDisplay,
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
  importBibleMedia,
  scriptureDefault,
  scriptureDefaultOptions = [],
  assignScriptureDefault,
  dockTab,
  fireBibleSelectionLive,
  bibleSelCount = 0,
}) {
  const isLive = activeCue != null && activeCue?.id !== 'clear';
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
  // The assigned default, resolved back to its option so the thumbnail and
  // label stay right even though the picker only hands back a URL.
  const defaultOpt = scriptureDefaultOptions.find(o => o.value === (scriptureDefault && scriptureDefault.value)) || null;
  return (
    // No entrance animation: the console subtree remounts every time the song
    // editor closes (and on boot), so the old slide+fade-in with its 0.3s
    // delay flashed a dark ghost of this panel over its own slot on every
    // load. It renders instantly at full opacity.
    <div className="right-panel-shell" style={{ flex: '0 1 340px', minWidth: 280, maxWidth: '35vw', background: C.panel, borderLeft: '1px solid var(--ui-border)', flexDirection: 'column', display: 'flex' }}>
      <div style={{ padding: '12px 12px 6px 12px', borderBottom: '1px solid ' + C.border, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.heading, textTransform: 'uppercase', letterSpacing: 1.5 }}>Live Output</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>{activeSlideIndex >= 0 ? `${activeSlideIndex}/${slideCount - 1}` : '—'}</span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4 }}>Output Display</div>
          <select
            value={selectedOutputDisplay ?? ''}
            onChange={(e) => selectOutputDisplay(e.target.value === '' ? null : Number(e.target.value))}
            disabled={!outputDisplays || outputDisplays.length === 0}
            title="Choose which display or projector the live output appears on"
            style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: (outputDisplays && outputDisplays.length > 0) ? 'pointer' : 'not-allowed', outline: 'none' }}
          >
            {(!outputDisplays || outputDisplays.length === 0) ? (
              <option value="">No external display detected</option>
            ) : (
              <>
                <option value="">Off — no output window</option>
                {outputDisplays.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.label}{d.primary ? ' (Primary)' : ''} · {d.width}×{d.height}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>
        {/* LIVE OUTPUT PREVIEW */}
        <div style={{ marginBottom: 8 }}>
          {renderOutputPreview()}
        </div>
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
            <motion.label {...stubTap} style={{ background: C.elevated, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ImageIcon size={10} /> Image<input type="file" accept="image/*" onChange={(e) => { importBibleMedia(e); e.target.value = ''; }} style={{ display: 'none' }} /></motion.label>
            <motion.label {...stubTap} style={{ background: C.elevated, color: C.text2, border: '1px solid var(--ui-border2)', padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Video size={10} /> Video<input type="file" accept="video/mp4,video/webm" onChange={(e) => { importBibleMedia(e); e.target.value = ''; }} style={{ display: 'none' }} /></motion.label>
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
              <Dropdown
                tone="quiet"
                style={{ flex: 1, minWidth: 0 }}
                value={(scriptureDefault && scriptureDefault.value) || ''}
                onChange={assignScriptureDefault}
                options={scriptureDefaultOptions}
                placeholder="Pick from existing media…"
                title="Background attached to every scripture you add to a section"
                maxHeight={240}
              />
            </div>
          </div>
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>{bibleMedia
            ? `Live override: ${bibleMedia.type === 'color' ? bibleMedia.value : (bibleMedia.name ? String(bibleMedia.name).replace(/\.[^.]+$/, '') : bibleMedia.type)} · new scripture still uses the default`
            : defaultOpt ? `No override — scripture runs on “${defaultOpt.label}”.` : 'Assign a default so scripture is never added blank.'}</div>
        </div>
        )}
      </div>

      {/* GROUPS & MEDIA — Untitled UI Tabs (migration phase 3). Their TabList
          adds real tab semantics + RAC keyboard nav (arrows / Home / End) and
          brand chip states; state keys and the panel content are unchanged. */}
      <Tabs selectedKey={rightTab} onSelectionChange={setRightTab} className="min-h-0 flex-1">
        <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, background: C.panel, flexShrink: 0 }}>
          <TabList type="button-brand" size="sm" fullWidth>
            <Tab id="groups" label="Groups" />
            <Tab id="media" label="Media" />
          </TabList>
        </div>
        <TabPanel id="groups" className="box-border flex-1 overflow-y-auto p-2.5">
          {groupLabels.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Quick Jump</div>
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groupLabels.map(label => {
                  // Highlight by BASE label too: a live "Chorus (Part 2)" must
                  // light the Chorus chip, not leave every chip dark.
                  const liveBase = String(activeCue?.label || '').replace(/\s*\(Part\s+\d+\)\s*$/i, '');
                  const on = liveBase === label;
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
        <TabPanel id="media" className="box-border flex-1 overflow-y-auto p-2.5">
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
    </div>
  );
}
