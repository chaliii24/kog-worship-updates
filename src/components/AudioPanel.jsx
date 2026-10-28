import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Square, Pause, SkipBack, SkipForward, Volume2, Music, Waves, ListMusic, Upload, Plus, Trash2, MonitorSpeaker, SplitSquareHorizontal, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { audioEngine, PAD_KEYS, PAD_OCTAVES } from '../lib/audioEngine';

const TABS = [
  ['song', 'Song Audio', Music],
  ['pads', 'Pads', Waves],
  ['bgm', 'BGM Playlist', ListMusic],
];

function SectionTitle({ C, children }) {
  return <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4, margin: '2px 0 7px' }}>{children}</div>;
}

function fmt(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

// Display name: the library's stored original filename first (new imports
// keep it); legacy timestamp-rand copies fall back to URL parsing.
function displayNameOf(url, library) {
  try {
    const hit = (library || []).find((a) => a.url === url);
    if (hit && hit.name) return (String(hit.name).replace(/\.[^.]+$/, '') || 'track');
    const base = decodeURIComponent(String(url || '').split('/').pop().split('?')[0] || '');
    const m = base.match(/^\d+-[a-z0-9]+-(.+)$/i);
    const core = m ? m[1] : base;
    return (core.replace(/\.[^.]+$/, '') || 'track');
  } catch { return 'track'; }
}

export default function AudioPanel() {
  const { C, ACCENT, PINK, activeSong, mediaLibrary, importMediaAsset, applyMediaToActiveSong, removeMediaAsset, persistMediaFile } = useApp();
  const [tab, setTab] = useState('song');
  const [, setTick] = useState(0);
  const [devices, setDevices] = useState([]);
  const [peaks, setPeaks] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const s = audioEngine.snapshot();
  const audioAssets = (mediaLibrary || []).filter((a) => a.kind === 'audio');

  // Re-render on engine changes + a 500ms poll for playhead progress.
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    const off = audioEngine.sub(bump);
    const id = setInterval(bump, 500);
    return () => { off(); clearInterval(id); };
  }, []);

  useEffect(() => {
    let live = true;
    audioEngine.listOutputs().then((d) => { if (live) setDevices(d || []); });
    return () => { live = false; };
  }, []);

  // Keep the transport loaded with the active song's track.
  const attachedUrl = activeSong?.audio_url || null;
  useEffect(() => {
    if (attachedUrl) audioEngine.trackLoad(attachedUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedUrl]);

  // Waveform peaks for the loaded track (progress bar fallback on failure).
  useEffect(() => {
    let live = true;
    setPeaks(null);
    const url = audioEngine.trackUrl;
    if (!url) return undefined;
    audioEngine.getPeaks(url).then((p) => { if (live && p) setPeaks(p); });
    return () => { live = false; };
  }, [s.trackUrl]);

  const importBgmFiles = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    const urls = [];
    for (const f of list) {
      try {
        const url = await persistMediaFile(f);
        if (url) urls.push(url);
      } catch {}
    }
    if (urls.length) audioEngine.bgmAdd(urls);
  };

  const progress = s.trackDur > 0 ? Math.min(1, s.trackTime / s.trackDur) : 0;
  const remaining = Math.max(0, (s.trackDur || 0) - s.trackTime);
  const nowBgmUrl = s.bgmQueue[s.bgmIndex] || null;

  return (
    <motion.div key="audio" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)' }}>
      {/* Header: title + hardware output routing */}
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
        <Music size={16} color={C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Audio Tools</h2>
        <span style={{ flex: 1 }} />
        <MonitorSpeaker size={13} color={C.faint} />
        <select
          value={s.sinkId || ''}
          onChange={(e) => audioEngine.setSink(e.target.value)}
          title="Hardware output for pads, BGM and tracks (OS default when unset)"
          style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none', maxWidth: 300 }}
        >
          <option value="">System default output</option>
          {devices.map((d, i) => (
            <option key={d.deviceId || i} value={d.deviceId}>{d.label || `Output device ${i + 1}`}</option>
          ))}
        </select>
        <button
          onClick={() => { audioEngine.listOutputs().then((d) => setDevices(d || [])); }}
          title="Re-scan audio outputs"
          style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: 6, cursor: 'pointer', display: 'flex' }}
        ><RefreshCw size={13} /></button>
      </div>

      {/* Tab menu */}
      <div style={{ padding: '0 18px 10px 18px', display: 'flex', gap: 6, flexShrink: 0 }}>
        {TABS.map(([v, lbl, Icon]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 10, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', background: tab === v ? ACCENT : C.elevated2, border: `1px solid ${tab === v ? ACCENT : 'var(--ui-border2)'}`, color: tab === v ? '#1C1C1E' : C.muted }}
          ><Icon size={14} /> {lbl}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 16px 18px', minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ============ SONG AUDIO ============ */}
        {tab === 'song' && (
          <>
            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '12px 14px' }}>
              <SectionTitle C={C}>Active Song Audio</SectionTitle>
              {!activeSong ? (
                <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>Open a song first — its backing/click track attaches here and auto-plays on the output with the first slide.</div>
              ) : attachedUrl ? (
                <>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>{displayNameOf(attachedUrl, mediaLibrary)}</div>
                  {/* Waveform / progress */}
                  <div
                    onClick={(e) => {
                      const r = e.currentTarget.getBoundingClientRect();
                      const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
                      if (s.trackDur > 0) audioEngine.trackSeek(ratio * s.trackDur);
                    }}
                    title="Click to seek"
                    style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56, cursor: 'pointer', background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 10px', overflow: 'hidden' }}
                  >
                    {(peaks || new Array(96).fill(0.35)).map((p, i, arr) => {
                      const played = i / arr.length <= progress;
                      return <span key={i} style={{ flex: 1, minWidth: 0, height: `${Math.round((peaks ? p : 0.35 + 0.3 * Math.sin(i / 3)) * 100)}%`, minHeight: 3, borderRadius: 2, background: played ? ACCENT : C.faint2, opacity: played ? 1 : 0.55 }} />;
                    })}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fmt(s.trackTime)}</span>
                    <input
                      type="range" min={0} max={Math.max(1, s.trackDur || 0)} step={0.5} value={Math.min(s.trackTime, s.trackDur || 0)}
                      onChange={(e) => audioEngine.trackSeek(Number(e.target.value))}
                      style={{ flex: 1, accentColor: PINK }} title="Seek"
                    />
                    <span style={{ fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>-{fmt(remaining)} left</span>
                  </div>
                  {/* Transport */}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                    {s.trackPlaying ? (
                      <motion.button {...stubTap} onClick={() => audioEngine.trackPause()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,69,69,0.14)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}><Pause size={14} /> Pause</motion.button>
                    ) : (
                      <motion.button {...stubTap} onClick={() => audioEngine.trackPlay()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#36C982', border: 'none', color: '#fff', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}><Play size={14} /> Play</motion.button>
                    )}
                    <motion.button {...stubTap} onClick={() => audioEngine.trackStop()} title="Stop and rewind" style={{ width: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 9, padding: '9px 0', cursor: 'pointer' }}><Square size={14} /></motion.button>
                    <button
                      onClick={() => audioEngine.setTrackLoop(!s.trackLoop)}
                      title="Loop the track"
                      style={{ fontSize: 11, fontWeight: 800, borderRadius: 8, padding: '9px 12px', cursor: 'pointer', background: s.trackLoop ? 'rgba(255,184,0,0.16)' : C.elevated2, border: s.trackLoop ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border2)', color: s.trackLoop ? '#FFC72C' : C.muted }}
                    >Loop</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <Volume2 size={13} color={C.faint} />
                    <input type="range" min={0} max={1} step={0.01} value={s.trackVol} onChange={(e) => audioEngine.setTrackVolume(Number(e.target.value))} style={{ flex: 1, accentColor: PINK }} title="Track volume" />
                    <span style={{ fontSize: 11, color: C.muted, width: 36, textAlign: 'right' }}>{Math.round(s.trackVol * 100)}%</span>
                  </div>
                  {/* Split-track routing */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }} title="Split track: instruments Left, click Right">
                      <input type="checkbox" checked={audioEngine.isSplit(attachedUrl)} onChange={(e) => audioEngine.setSplit(attachedUrl, e.target.checked)} style={{ accentColor: PINK }} />
                      <SplitSquareHorizontal size={13} /> Split track mode
                    </label>
                    {audioEngine.isSplit(attachedUrl) && (
                      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
                        {[['both', 'House + Ears'], ['L', 'House (L)'], ['R', 'Ears (R)']].map(([v, lbl]) => (
                          <button key={v} onClick={() => audioEngine.setHouseSide(v)} style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 7, padding: '6px 10px', cursor: 'pointer', background: s.houseSide === v ? 'rgba(255,184,0,0.16)' : C.elevated2, border: s.houseSide === v ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border2)', color: s.houseSide === v ? '#FFC72C' : C.muted }}>{lbl}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {audioEngine.isSplit(attachedUrl) && s.splitUnsupported && (
                    <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>Channel split unavailable in this build — the track still plays in stereo.</div>
                  )}
                  <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>Auto-plays on the output with the song's first slide (loop follows the Loop toggle above).</div>
                </>
              ) : (
                <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.6 }}>No audio for "{activeSong.title}". Import a track below to loop it behind every slide of this song.</div>
              )}
              <label style={{ marginTop: 10, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '9px', borderRadius: 9, fontSize: 12, fontWeight: 700, cursor: activeSong ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: activeSong ? 1 : 0.5 }}>
                <Upload size={13} /> {activeSong ? `Import & attach track to "${activeSong.title}"` : 'Open a song to attach audio'}
                <input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.aac" onChange={(e) => importMediaAsset(e, 'audio')} disabled={!activeSong} style={{ display: 'none' }} />
              </label>
            </div>

            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <SectionTitle C={C}>Audio Assets</SectionTitle>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>{audioAssets.length} track{audioAssets.length === 1 ? '' : 's'}</span>
              </div>
              {audioAssets.length === 0 ? (
                <div style={{ fontSize: 12, color: C.faint }}>No audio imported yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {audioAssets.map((asset, i) => {
                    const attached = activeSong?.audio_url === asset.url;
                    const split = audioEngine.isSplit(asset.url);
                    return (
                      <div key={asset.url || i} style={{ background: C.elevated2, border: attached ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {displayNameOf(asset.url, mediaLibrary)}{split ? <span style={{ color: '#FFC72C', fontWeight: 800 }}> · SPLIT</span> : null}
                        </span>
                        <button onClick={() => { audioEngine.trackLoad(asset.url); audioEngine.trackPlay(); }} title="Preview" style={{ background: C.elevated, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Play</button>
                        {activeSong && !attached && <button onClick={() => applyMediaToActiveSong('audio', asset.url)} style={{ background: '#1b3b2a', border: '1px solid #36C982', color: '#36C982', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Attach</button>}
                        <button onClick={() => audioEngine.setSplit(asset.url, !split)} title="Toggle split-track mode" style={{ background: split ? 'rgba(255,184,0,0.16)' : 'transparent', border: '1px solid var(--ui-border2)', color: split ? '#FFC72C' : C.faint, borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>S</button>
                        <button onClick={() => removeMediaAsset(asset)} title="Remove" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex' }}><Trash2 size={12} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ============ PADS ============ */}
        {tab === 'pads' && (
          <>
            <div style={{ background: C.elevated, border: `1px solid ${s.padOn ? 'rgba(54,201,130,0.45)' : 'var(--ui-border2)'}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Pads</span>
                {s.padOn && s.padKey && <span style={{ fontSize: 11, fontWeight: 800, color: '#36C982' }}>· {s.padKey} droning</span>}
                <button
                  onClick={() => audioEngine.setPadEnabled(!s.padOn)}
                  style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, borderRadius: 999, padding: '7px 16px', cursor: 'pointer', background: s.padOn ? 'rgba(54,201,130,0.16)' : C.elevated2, border: s.padOn ? '1px solid rgba(54,201,130,0.5)' : '1px solid var(--ui-border2)', color: s.padOn ? '#36C982' : C.muted }}
                >{s.padOn ? 'ON' : 'OFF'}</button>
              </div>
              {/* Register — which octave the grid plays in. Sits above the keys
                  because it changes what every key below it means. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, flex: 1 }}>Octave</span>
                {PAD_OCTAVES.map((o) => {
                  const on = s.padOctave === o.id;
                  return (
                    <button
                      key={o.id}
                      onClick={() => audioEngine.setPadOctave(o.id)}
                      title={o.id === 0 ? 'C3 — low and deep, sits under speech' : o.id === 1 ? 'C4 — one octave up, airy and open' : 'C5 — two octaves up, high shimmer'}
                      style={{ borderRadius: 8, padding: '7px 15px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', background: on ? 'rgba(54,201,130,0.18)' : C.elevated2, border: on ? '1px solid rgba(54,201,130,0.55)' : '1px solid var(--ui-border2)', color: on ? '#36C982' : C.text2 }}
                    >{o.label}</button>
                  );
                })}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginTop: 10 }}>
                {PAD_KEYS.map(({ key }) => {
                  const on = s.padOn && s.padKey === key;
                  return (
                    <button
                      key={key}
                      onClick={() => audioEngine.padStart(key)}
                      style={{ borderRadius: 9, padding: '12px 0', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: on ? 'rgba(54,201,130,0.18)' : C.elevated2, border: on ? '1px solid rgba(54,201,130,0.55)' : '1px solid var(--ui-border2)', color: on ? '#36C982' : C.text2 }}
                    >{key}</button>
                  );
                })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                <Volume2 size={13} color={C.faint} />
                <input type="range" min={0} max={1} step={0.01} value={s.padVol} onChange={(e) => audioEngine.setPadVolume(Number(e.target.value))} style={{ flex: 1, accentColor: '#36C982' }} title="Pad master volume" />
                <span style={{ fontSize: 11, color: C.muted, width: 36, textAlign: 'right' }}>{Math.round(s.padVol * 100)}%</span>
              </div>
              <motion.button {...stubTap} onClick={() => audioEngine.padFadeOut()} style={{ width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,69,69,0.12)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', borderRadius: 9, padding: '10px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                <Square size={13} /> Fade Out / Stop
              </motion.button>
              <div style={{ fontSize: 11, color: C.faint, marginTop: 8, lineHeight: 1.6 }}>Switching keys or octave crossfades the drone — no silence between songs, prayers or transitions.</div>
            </div>
          </>
        )}

        {/* ============ BGM PLAYLIST ============ */}
        {tab === 'bgm' && (
          <>
            <div style={{ background: C.elevated, border: `1px solid ${s.bgmPlaying ? 'rgba(54,201,130,0.45)' : 'var(--ui-border2)'}`, borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{nowBgmUrl ? displayNameOf(nowBgmUrl, mediaLibrary) : 'Walk-in / walk-out music'}</span>
                {s.bgmPlaying && <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1, color: '#36C982', background: 'rgba(54,201,130,0.15)', border: '1px solid rgba(54,201,130,0.4)', padding: '2px 7px', borderRadius: 6 }}>PLAYING</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
                <button onClick={() => audioEngine.bgmPrev()} title="Previous" style={{ width: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 9, padding: '9px 0', cursor: 'pointer' }}><SkipBack size={15} /></button>
                {s.bgmPlaying ? (
                  <motion.button {...stubTap} onClick={() => audioEngine.bgmPause()} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(255,69,69,0.14)', border: '1px solid rgba(255,69,69,0.4)', color: '#FF4545', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}><Pause size={14} /> Pause</motion.button>
                ) : (
                  <motion.button {...stubTap} onClick={() => audioEngine.bgmPlay()} disabled={!s.bgmQueue.length} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: s.bgmQueue.length ? '#36C982' : C.elevated2, border: 'none', color: '#fff', borderRadius: 9, padding: '9px 0', fontSize: 12.5, fontWeight: 800, cursor: s.bgmQueue.length ? 'pointer' : 'default', opacity: s.bgmQueue.length ? 1 : 0.5 }}><Play size={14} /> Play</motion.button>
                )}
                <button onClick={() => audioEngine.bgmNext()} title="Next" style={{ width: 42, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 9, padding: '9px 0', cursor: 'pointer' }}><SkipForward size={15} /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <Volume2 size={13} color={C.faint} />
                <input type="range" min={0} max={1} step={0.01} value={s.bgmVol} onChange={(e) => audioEngine.setBgmVolume(Number(e.target.value))} style={{ flex: 1, accentColor: PINK }} title="BGM volume" />
                <span style={{ fontSize: 11, color: C.muted, width: 36, textAlign: 'right' }}>{Math.round(s.bgmVol * 100)}%</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12, fontWeight: 700, color: C.text2, cursor: 'pointer' }} title="Fade the playlist out when the first slide fires or the countdown goes live">
                <input type="checkbox" checked={s.bgmAutoFade} onChange={(e) => audioEngine.setBgmAutoFade(e.target.checked)} style={{ accentColor: PINK }} />
                Auto-fade when the service starts
              </label>
              {s.bgmAutoFade && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: C.faint }}>Fade over</span>
                  {[3, 4, 5].map((sec) => (
                    <button key={sec} onClick={() => audioEngine.setBgmFadeSec(sec)} style={{ fontSize: 11, fontWeight: 800, borderRadius: 7, padding: '5px 12px', cursor: 'pointer', background: s.bgmFadeSec === sec ? 'rgba(255,184,0,0.16)' : C.elevated2, border: s.bgmFadeSec === sec ? '1px solid rgba(255,184,0,0.5)' : '1px solid var(--ui-border2)', color: s.bgmFadeSec === sec ? '#FFC72C' : C.muted }}>{sec}s</button>
                  ))}
                </div>
              )}
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); importBgmFiles(e.dataTransfer?.files); }}
              style={{ background: dragOver ? 'rgba(255,184,0,0.12)' : C.elevated, border: `1px dashed ${dragOver ? 'rgba(255,184,0,0.6)' : 'var(--ui-border2)'}`, borderRadius: 12, padding: 14, textAlign: 'center' }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text2 }}>Drag & drop MP3 / WAV files here</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <label style={{ flex: 1, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '8px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Upload size={13} /> Import files
                  <input ref={fileRef} type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg,audio/aac,.mp3,.m4a,.wav,.ogg,.aac" multiple onChange={(e) => { importBgmFiles(e.target.files); e.target.value = ''; }} style={{ display: 'none' }} />
                </label>
                {s.bgmQueue.length > 0 && (
                  <button onClick={() => audioEngine.bgmClear()} title="Clear the playlist" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: '#FF4545', borderRadius: 8, padding: '0 12px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Clear</button>
                )}
              </div>
            </div>

            <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <SectionTitle C={C}>Queue</SectionTitle>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: C.faint }}>{s.bgmQueue.length} track{s.bgmQueue.length === 1 ? '' : 's'}</span>
              </div>
              {s.bgmQueue.length === 0 ? (
                <div style={{ fontSize: 12, color: C.faint }}>Empty — drop files above or add library tracks below.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {s.bgmQueue.map((url, i) => {
                    const current = i === s.bgmIndex && s.bgmPlaying;
                    return (
                      <div key={url + i} style={{ background: current ? 'rgba(54,201,130,0.08)' : C.elevated2, border: current ? '1px solid rgba(54,201,130,0.45)' : '1px solid var(--ui-border2)', borderRadius: 10, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => audioEngine.bgmPlay(i)} title="Play this track" style={{ background: 'transparent', border: 'none', color: current ? '#36C982' : C.muted, cursor: 'pointer', display: 'flex' }}>{current ? <Pause size={13} /> : <Play size={13} />}</button>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i + 1}. {displayNameOf(url, mediaLibrary)}</span>
                        <button onClick={() => audioEngine.bgmRemove(i)} title="Remove" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex' }}><Trash2 size={12} /></button>
                      </div>
                    );
                  })}
                </div>
              )}
              {audioAssets.filter((a) => !s.bgmQueue.includes(a.url)).length > 0 && (
                <>
                  <div style={{ marginTop: 10 }}><SectionTitle C={C}>Add from library</SectionTitle></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {audioAssets.filter((a) => !s.bgmQueue.includes(a.url)).map((a, i) => (
                      <div key={a.url || i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '7px 10px' }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayNameOf(a.url, mediaLibrary)}</span>
                        <button onClick={() => audioEngine.bgmAdd([a.url])} style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Plus size={11} /> Queue</button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
