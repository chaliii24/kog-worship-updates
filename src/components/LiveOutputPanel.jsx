import React, { useCallback, useState } from 'react';
import { Square, SkipBack, SkipForward, Image as ImageIcon, Video, Zap } from 'lucide-react';
import { motion } from 'motion/react';
import { TimerReadout } from '../lib/perf';
import { stubTap, iconBtnTap } from '../lib/anim';

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
  dockTab,
  fireBibleSelectionLive,
  bibleSelCount = 0,
}) {
  const isLive = activeCue?.id !== 'clear' && activeCue !== null;
  // Uploads whose file has been moved/deleted render as a black tile — drop
  // them from the grid entirely instead of showing a dead thumbnail.
  const [missingUploads, setMissingUploads] = useState(() => new Set());
  const markUploadMissing = useCallback((value) => {
    setMissingUploads(prev => (prev.has(value) ? prev : new Set(prev).add(value)));
  }, []);
  const visibleUploads = (scriptureBgLibrary || []).filter(a => !missingUploads.has(a.value));
  return (
    <motion.div className="right-panel-shell" initial={{ x: 64, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 28, delay: 0.3 }} style={{ flex: '0 1 340px', minWidth: 280, maxWidth: '35vw', background: C.panel, borderLeft: '1px solid #1F2937', flexDirection: 'column', display: 'flex' }}>
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
            style={{ width: '100%', background: C.elevated, border: '1px solid #2b2b44', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: (outputDisplays && outputDisplays.length > 0) ? 'pointer' : 'not-allowed', outline: 'none' }}
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
                background: 'linear-gradient(180deg, #3B82F6, #2563EB)',
                border: 'none',
                color: '#FFFFFF',
                padding: '9px 14px',
                borderRadius: 9,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                boxShadow: '0 0 0 1px rgba(37,99,235,0.5), 0 8px 24px rgba(37,99,235,0.3)',
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
        {/* SCRIPTURE BACKGROUND (shown when the Scripture dock button is active; applies only to scripture) */}
        {dockTab === 'scripture' && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Scripture Background</span>
            {bibleMedia ? (
              <motion.button {...stubTap} onClick={() => selectBibleMediaLive(null, null, null)} style={{ background: 'transparent', border: 'none', color: '#f87171', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Clear</motion.button>
            ) : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="color" value={bibleMedia && bibleMedia.type === 'color' ? bibleMedia.value : '#0a0a0a'} onChange={(e) => selectBibleMediaLive('color', e.target.value)} title="Scripture solid-color background" style={{ width: 30, height: 26, background: C.elevated, border: '1px solid #2b2b44', borderRadius: 5, cursor: 'pointer', padding: 0 }} />
            <motion.label {...stubTap} style={{ background: C.elevated, color: C.text2, border: '1px solid #2b2b44', padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><ImageIcon size={10} /> Image<input type="file" accept="image/*" onChange={(e) => { importBibleMedia(e); e.target.value = ''; }} style={{ display: 'none' }} /></motion.label>
            <motion.label {...stubTap} style={{ background: C.elevated, color: C.text2, border: '1px solid #2b2b44', padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Video size={10} /> Video<input type="file" accept="video/mp4,video/webm" onChange={(e) => { importBibleMedia(e); e.target.value = ''; }} style={{ display: 'none' }} /></motion.label>
          </div>
          {visibleUploads.length > 0 && (
            <div style={{ marginTop: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Your Uploads</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                {visibleUploads.map(a => {
                  const active = bibleMedia && bibleMedia.value === a.value;
                  return (
                    <motion.div key={a.value} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 26 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.92 }} onClick={() => selectBibleMediaLive(a.type, a.value, a.name)} title={a.name || a.type} style={{ position: 'relative', aspectRatio: '16 / 10', borderRadius: 5, overflow: 'hidden', cursor: 'pointer', border: active ? '2px solid #3B82F6' : '1px solid #2b2b44', background: '#000' }}>
                      {a.type === 'image'
                        ? <img src={a.value} alt="" onError={() => markUploadMissing(a.value)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <video src={a.value} autoPlay loop muted playsInline preload="metadata" onError={() => markUploadMissing(a.value)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
          <div style={{ fontSize: 9.5, color: C.faint, marginTop: 4 }}>{bibleMedia
            ? `Applied to scripture only · ${bibleMedia.type === 'color' ? bibleMedia.value : (bibleMedia.name ? String(bibleMedia.name).replace(/\.[^.]+$/, '') : bibleMedia.type)}`
            : 'Not set — scripture uses the global style.'}</div>
        </div>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexShrink: 0 }}>
          <motion.button {...stubTap} onClick={() => fireCueLive({ id: 'clear', label: 'Clear', text: '' })} style={{ flex: 1, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', padding: '7px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Square size={12} /> Clear All</motion.button>
          <motion.button {...iconBtnTap} onClick={handlePrevCue} style={{ width: 44, background: C.elevated, border: '1px solid #2b2b44', color: C.muted, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SkipBack size={14} /></motion.button>
          <motion.button {...iconBtnTap} onClick={handleNextCue} style={{ width: 44, background: C.elevated, border: '1px solid #2b2b44', color: C.muted, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SkipForward size={14} /></motion.button>
        </div>
      </div>

      {/* GROUPS & MEDIA */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid ' + C.border, display: 'flex', background: C.panel, gap: 4, flexShrink: 0 }}>
        {['Groups', 'Media'].map(t => (
          <motion.button key={t} {...stubTap} onClick={() => setRightTab(t === 'Groups' ? 'groups' : 'media')} style={{ flex: 1, background: rightTab === (t === 'Groups' ? 'groups' : 'media') ? PINK : 'transparent', color: rightTab === (t === 'Groups' ? 'groups' : 'media') ? C.text : C.muted, border: 'none', padding: '6px 0', borderRadius: 7, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{t}</motion.button>
        ))}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
        {rightTab === 'groups' ? (
          groupLabels.length > 0 ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 2 }}>Quick Jump</div>
<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {groupLabels.map(label => (
                  <motion.button {...stubTap} key={label} onClick={() => { const c = (activeSong?.cues || []).find(x => x.label === label); if (c) fireCueLive(c); }} style={{ background: C.elevated, border: activeCue?.label === label ? `1px solid ${PINK}` : '1px solid #2b2b44', color: activeCue?.label === label ? PINK : C.text2, borderRadius: 999, padding: '6px 13px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>{label}</motion.button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>Click a group to jump straight to its first slide on all outputs.</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.faint2, padding: 6 }}>Load a song to see its sections here.</div>
          )
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Slide Timer</div>
            <div style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted }}>{slideTimer.start ? 'Running' : 'Idle'}</span>
              <TimerReadout start={slideTimer.start} duration={slideTimer.duration} C={C} PINK={PINK} />
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Current Output Media</div>
            <div style={{ background: C.elevated, border: '1px solid #2b2b44', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: C.text2 }}>
              {activeSong ? (songHasBackground(activeSong) ? `Song background ${activeSong.bg_type === 'color' ? 'color' : activeSong.bg_type}` : 'Global background') : 'No song loaded'}
              {activeCue?.id === 'clear' && <span> — blackout</span>}
            </div>
            <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5, marginTop: 4 }}>Shortcuts</div>
            <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              <div><b style={{ color: C.text2 }}>Space</b> → next slide · <b style={{ color: C.text2 }}>←</b> → previous</div>
              <div><b style={{ color: C.text2 }}>B</b> → blackout · <b style={{ color: C.text2 }}>?</b> → hotkeys</div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
