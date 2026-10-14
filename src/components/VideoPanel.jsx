import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Play, Pause, Square, SkipBack, SkipForward, Volume2, VolumeX, Clapperboard, Upload, Maximize, Repeat, Film, MonitorUp } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { audioEngine } from '../lib/audioEngine';
import { ACCEPT, saveVideoList, clearVideoList } from './VideoLibrarySidebar';

function fmt(s) {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}

export default function VideoPanel() {
  const { C, persistMediaFile, fireVideoLive, displays, videoList: list, setVideoList: setList, videoIdx: idx, setVideoIdx: setIdx } = useApp();
  const videoRef = useRef(null);
  const stageRef = useRef(null);
  const fileRef = useRef(null);
  const ctlTimer = useRef(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [vol, setVol] = useState(1);
  const [muted, setMuted] = useState(false);
  const [loop, setLoop] = useState(false);
  const [duckBgm, setDuckBgm] = useState(true);
  const [res, setRes] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showCtl, setShowCtl] = useState(true);
  const [, setTick] = useState(0);

  const s = audioEngine.snapshot();
  useEffect(() => audioEngine.sub(() => setTick((t) => t + 1)), []);

  const cur = list[Math.min(idx, Math.max(0, list.length - 1))] || null;

  // What the main projector is actually showing — the LIVE badge, the red
  // border and every wall push gate on THIS, not on booth state. Firing
  // lyrics over a live video flips it back to cued all by itself.
  const wallContent = (displays || []).find((d) => d.id === 1)?.content || null;
  const wallShowsUs = !!(cur && wallContent && wallContent.video && wallContent.video.url === cur.url && wallContent.video.action !== 'stop');
  const liveRef = useRef(false);
  liveRef.current = wallShowsUs;
  const fireRef = useRef(null);
  fireRef.current = fireVideoLive;
  const seekPushAt = useRef(0);
  const airRef = useRef({ stamp: 0, url: null });
  const syncTimers = useRef({ to: 0, iv: 0 });

  useEffect(() => {
    saveVideoList(list);
  }, [list]);

  // Sidebar (or queue) cues land here as a url change: reset the booth clocks
  // and show the controls — the remounted element starts paused at 0.
  useEffect(() => {
    setTime(0);
    setDur(0);
    setRes('');
    setShowCtl(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur && cur.url]);

  // Hardware output routing + volume/mute/loop follow the operator's Audio
  // tab choices, so house speakers behave the same as pads and BGM.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try { v.volume = vol; } catch {}
    try { v.muted = muted; } catch {}
    try { v.loop = loop; } catch {}
    if (s.sinkId && typeof v.setSinkId === 'function') v.setSinkId(s.sinkId).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.sinkId, vol, muted, loop, cur && cur.url]);

  // Booth is the transport master; the wall mirrors. Every push carries the
  // booth's position so the projector re-syncs instead of drifting. `fresh`
  // mints a new air stamp (clean remount) — only Send-to-Live and live
  // auto-advance pass it; pause/seek/loop/sync reuse the stamp and land
  // without a flash.
  const pushLive = (action, position, loopFlag, fresh) => {
    if (!fireRef.current) return;
    try {
      if (action !== 'stop' && cur) {
        if (fresh || !airRef.current.stamp || airRef.current.url !== cur.url) {
          airRef.current = { stamp: Date.now(), url: cur.url };
        }
        fireRef.current({ url: cur.url, name: cur.name, action, position, loop: loopFlag !== undefined ? loopFlag : loop, stamp: airRef.current.stamp });
      } else {
        airRef.current = { stamp: 0, url: null };
        fireRef.current(null);
      }
    } catch {}
  };
  const pushRef = useRef(null);
  pushRef.current = pushLive;

  // Drift guard: independent decoders start frames apart and can wander on
  // long files, so the booth publishes a master clock (localStorage
  // `kog-video-clock`, 4x/s) while live - followers chase it with rate nudges
  // instead of jumps, costing zero re-renders on either side. The one-second
  // catch-up push stays: it re-affirms late mounters that missed the opening
  // command. Runs only while the wall actually shows us.
  const clearSync = () => {
    if (syncTimers.current.to) { try { clearTimeout(syncTimers.current.to); } catch {} syncTimers.current.to = 0; }
    if (syncTimers.current.iv) { try { clearInterval(syncTimers.current.iv); } catch {} syncTimers.current.iv = 0; }
  };
  const scheduleSync = () => {
    clearSync();
    const tick = () => {
      const v = videoRef.current;
      if (!v || v.paused || !liveRef.current) return;
      try { pushRef.current && pushRef.current('play', v.currentTime || 0); } catch {}
    };
    const clockTick = () => {
      const v = videoRef.current;
      const air = airRef.current;
      if (!v || v.paused || !liveRef.current || !air.url) return;
      try {
        // The booth may be previewing another clip while this one is live �
        // only the live file's clock may publish.
        if (v.getAttribute('src') !== air.url) return;
        localStorage.setItem('kog-video-clock', JSON.stringify({ url: air.url, position: v.currentTime || 0, ts: Date.now() }));
      } catch {}
    };
    try {
      syncTimers.current.to = setTimeout(() => {
        tick();
        syncTimers.current.iv = setInterval(clockTick, 250);
      }, 1000);
    } catch {}
  };

  // Leaving the tab unmounts the booth element (playback dies with it) — the
  // wall must not freeze on the last frame. Quitting wipes the playlist too:
  // the next launch opens a fresh panel. (Hot-reloads don't fire
  // beforeunload, so dev edits keep the list.) StrictMode-safe: the ref
  // starts false, so the dev double-mount cleanup pushes nothing.
  useEffect(() => {
    const wipe = () => clearVideoList();
    window.addEventListener('beforeunload', wipe);
    return () => {
      window.removeEventListener('beforeunload', wipe);
      clearSync();
      if (ctlTimer.current) { try { clearTimeout(ctlTimer.current); } catch {} }
      if (liveRef.current && fireRef.current) {
        try { fireRef.current(null); } catch {}
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selections and live auto-advance play through this (a click is a user
  // gesture, so playback with sound is allowed). Cueing never autoplays.
  useEffect(() => {
    if (!autoPlay) return;
    setAutoPlay(false);
    const v = videoRef.current;
    if (v && cur) {
      v.play().catch(() => {});
      pushLive('play', 0, undefined, true);
      scheduleSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur && cur.url]);

  const pokeControls = () => {
    setShowCtl(true);
    if (ctlTimer.current) { try { clearTimeout(ctlTimer.current); } catch {} ctlTimer.current = 0; }
    const v = videoRef.current;
    if (v && !v.paused && cur) {
      ctlTimer.current = setTimeout(() => setShowCtl(false), 2500);
    }
  };

  // ---- transport: booth-first, wall only when live --------------------------
  const toggle = () => {
    const v = videoRef.current;
    if (!v || !cur) return;
    if (v.paused) {
      if (duckBgm && audioEngine.bgmPlaying) audioEngine.bgmPause();
      v.play().catch(() => {});
      if (liveRef.current) { pushLive('play', v.currentTime || 0); scheduleSync(); }
    } else {
      v.pause();
      if (liveRef.current) pushLive('pause', v.currentTime || 0);
      clearSync();
    }
  };

  // The explicit gate: booth starts (or continues) from its position and the
  // wall joins it fresh. Re-pressing while live re-syncs the wall.
  const sendLive = () => {
    const v = videoRef.current;
    if (!v || !cur) return;
    if (duckBgm && audioEngine.bgmPlaying) audioEngine.bgmPause();
    v.play().catch(() => {});
    pushLive('play', v.currentTime || 0, undefined, true);
    scheduleSync();
  };

  // Booth stop: freeze the booth and, only if the wall is ours, take it back
  // to black — never black out lyrics or countdown sitting on the wall.
  const stopAll = () => {
    const v = videoRef.current;
    try { if (v) v.pause(); } catch {}
    try { if (v) v.currentTime = 0; } catch {}
    setTime(0);
    clearSync();
    if (liveRef.current) pushLive('stop');
  };

  // Click = cue (load paused, wall untouched — cueing the next clip must
  // never disturb what is live). Send to Live is the only way on air. Clock
  // resets ride the url-change effect above (sidebar cues land there too).
  const cueAt = (i) => {
    if (i < 0 || i >= list.length) return;
    if (list[i] && cur && list[i].url === cur.url) { setShowCtl(true); return; }
    setIdx(i);
  };

  const stepCue = (d) => {
    if (!list.length) return;
    cueAt((idx + d + list.length) % list.length);
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    const v = videoRef.current;
    if (cur && v && liveRef.current) pushLive(!v.paused ? 'play' : 'pause', v.currentTime || 0, next);
  };

  // Scrub pushes are throttled (a slider drag would otherwise spray a wall
  // remount per tick); pointer/keys-up always flushes the final position —
  // and only when live, so preview scrubbing never touches the wall.
  const pushSeek = (t, force) => {
    const now = Date.now();
    if (!force && now - seekPushAt.current < 250) return;
    seekPushAt.current = now;
    const v = videoRef.current;
    if (liveRef.current) pushLive(v && !v.paused ? 'play' : 'pause', t);
  };
  const scrubTo = (t, force) => {
    const v = videoRef.current;
    if (v) { try { v.currentTime = t; } catch {} }
    setTime(t);
    pushSeek(t, force);
  };

  const addFiles = async (files) => {
    const vids = [...(files || [])].filter((f) => f && /\.(mp4|webm|mov)$/i.test(f.name || ''));
    if (!vids.length || busy) return;
    setBusy(true);
    try {
      const fresh = [];
      for (const f of vids) {
        try {
          const url = await persistMediaFile(f);
          if (url) fresh.push({ url, name: String(f.name || 'video').replace(/\.[^.]+$/, '') });
        } catch {}
      }
      if (fresh.length) {
        setList((prev) => {
          const have = new Set(prev.map((v) => v.url));
          return [...prev, ...fresh.filter((v) => !have.has(v.url))];
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleFull = () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } catch {}
  };

  const borderLive = '2px solid #ef4444';
  const borderCued = '2px solid #22c55e';
  const stageBorder = !cur ? '1px solid var(--ui-border2)' : wallShowsUs ? borderLive : borderCued;
  const stageShadow = wallShowsUs
    ? '0 0 0 1px rgba(239,68,68,0.55), 0 0 28px rgba(239,68,68,0.28)'
    : (cur ? '0 0 0 1px rgba(34,197,94,0.4), 0 0 22px rgba(34,197,94,0.16)' : 'none');
  const progress = dur > 0 ? Math.min(1, time / dur) : 0;

  const scrub = (
    <input
      type="range" min={0} max={Math.max(0, dur)} step={0.1} value={Math.min(time, dur)}
      onChange={(e) => scrubTo(Number(e.target.value) || 0, false)}
      onPointerUp={(e) => scrubTo(Number(e.target.value) || 0, true)}
      onKeyUp={(e) => scrubTo(Number(e.target.value) || 0, true)}
      title="Seek — the projector follows when live"
      style={{ flex: 1, minWidth: 0, accentColor: '#fff', cursor: 'pointer' }}
    />
  );

  return (
    <motion.div key="videos" initial={{ opacity: 0, x: 26 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -26 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--ui-stage)', minHeight: 0 }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={(e) => { if (e.target === e.currentTarget) setDragOver(false); }}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer && e.dataTransfer.files); }}
    >
      <div style={{ padding: '12px 18px 8px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <Clapperboard size={16} color={C.faint} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Video Player</h2>
        <span style={{ flex: 1 }} />
        <label title="Pause the BGM playlist when a video starts, so music never talks over it" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: C.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" checked={duckBgm} onChange={(e) => setDuckBgm(e.target.checked)} />
          Pause BGM on play
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, padding: '6px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          <Upload size={12} /> Add
          <input ref={fileRef} type="file" accept={ACCEPT} multiple style={{ display: 'none' }} onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
        </label>
      </div>

      {/* ============ STICKY PLAYER (top ~half, never scrolls away) ============ */}
      <div style={{ flexShrink: 0, padding: '0 18px 10px 18px' }}>
        <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 12, padding: 12 }}>
          {/* Width-capped column: the stage keeps a strict 16:9 at any window
              size (width, never height, is the constraint — clamping height
              is what broke the ratio and shrunk the picture into pillarbox).
              The Send button spans exactly the video width below it. */}
          <div style={{ width: 'min(100%, 80vh)', margin: '0 auto' }}>
          <div
            ref={stageRef}
            onMouseMove={pokeControls}
            onMouseLeave={() => { if (playing) setShowCtl(false); }}
            className="aspect-video w-full"
            style={{ background: '#000', borderRadius: 9, overflow: 'hidden', border: stageBorder, boxShadow: stageShadow, position: 'relative' }}
          >
            {cur ? (
              <video
                key={cur.url}
                ref={videoRef}
                src={cur.url}
                preload="auto"
                playsInline
                onClick={toggle}
                onPlay={() => { setPlaying(true); pokeControls(); }}
                onPause={() => { setPlaying(false); setShowCtl(true); if (ctlTimer.current) { try { clearTimeout(ctlTimer.current); } catch {} ctlTimer.current = 0; } }}
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime || 0)}
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  setDur(v.duration || 0);
                  setTime(0);
                  setRes(v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '');
                }}
                onEnded={() => {
                  if (loop) return;
                  // Live rolls on to the next clip by itself; a booth preview
                  // just advances the cue and waits.
                  if (idx + 1 < list.length) {
                    const nxt = idx + 1;
                    setIdx(nxt);
                    if (wallShowsUs) setAutoPlay(true);
                  } else if (wallShowsUs) { pushLive('stop'); clearSync(); }
                }}
                // Straight file playback: no canvas, no filters, no transcode —
                // the pixels on screen are the pixels in the file, with sound.
                // Sizing is Tailwind (w-full h-full object-contain): full-bleed
                // inside the strict 16:9 stage, never distorted.
                className="w-full h-full object-contain"
                style={{ display: 'block', background: '#000', cursor: 'pointer' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, textAlign: 'center', padding: 16 }}>
                <Film size={30} />
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>No video cued</div>
                <div style={{ fontSize: 11, lineHeight: 1.6 }}>Pick one below — MP4 / WebM / MOV, original quality, with sound.</div>
              </div>
            )}

            {/* status chip: cued (green, ready) vs live (red, on the wall) */}
            {cur && (
              <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.62)', border: `1px solid ${wallShowsUs ? 'rgba(239,68,68,0.7)' : 'rgba(34,197,94,0.6)'}`, color: wallShowsUs ? '#f87171' : '#4ade80', borderRadius: 999, padding: '3px 10px', fontSize: 10, fontWeight: 900, letterSpacing: 1 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: wallShowsUs ? '#ef4444' : '#22c55e', boxShadow: wallShowsUs ? '0 0 8px #ef4444' : '0 0 8px #22c55e' }} />
                {wallShowsUs ? 'LIVE' : 'CUED'}
              </div>
            )}
            {res && cur && (
              <div title="Native file resolution — played 1:1, never re-encoded" style={{ position: 'absolute', top: 8, right: 8, fontSize: 10, fontWeight: 800, color: C.muted, background: 'rgba(0,0,0,0.62)', border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '3px 8px' }}>{res} · 1:1</div>
            )}

            {/* overlay controls: fade while playing, always up when paused */}
            {cur && (
              <div
                style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 10px 8px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.78))', display: 'flex', alignItems: 'center', gap: 8, opacity: showCtl ? 1 : 0, transition: 'opacity 0.35s', pointerEvents: showCtl ? 'auto' : 'none' }}
              >
                <button onClick={toggle} title={playing ? 'Pause' : 'Play'} style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 999, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>{playing ? <Pause size={14} /> : <Play size={14} />}</button>
                <span style={{ fontSize: 11, color: '#e4e4e7', width: 38, fontVariantNumeric: 'tabular-nums' }}>{fmt(time)}</span>
                {scrub}
                <span style={{ fontSize: 11, color: '#a1a1aa', width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>-{fmt(Math.max(0, dur - time))}</span>
                <button onClick={toggleLoop} title={loop ? 'Looping — click to play through' : 'Repeat this video'} style={{ background: loop ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.1)', border: '1px solid ' + (loop ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.2)'), color: loop ? '#d8b4fe' : '#d4d4d8', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Repeat size={13} /></button>
                <button onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute (booth)' : 'Mute (booth)'} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#d4d4d8', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}>{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
                <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : vol} onChange={(e) => { const v = Number(e.target.value); setVol(v); if (v > 0) setMuted(false); }} title="Booth volume" style={{ width: 64, flexShrink: 0, accentColor: '#fff', cursor: 'pointer' }} />
                <button onClick={toggleFull} title="Fullscreen" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#d4d4d8', borderRadius: 7, padding: '5px 8px', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Maximize size={13} /></button>
              </div>
            )}
          </div>

          {cur && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>{cur.name || 'video'}</span>
            </div>
          )}

          {/* Send to Live: the one explicit gate onto the wall. Re-pressing
              while live re-syncs the projector to the booth position. */}
          <motion.button
            {...stubTap}
            onClick={sendLive}
            disabled={!cur}
            title={cur ? (wallShowsUs ? 'Wall is showing this video — press to re-sync it to the booth' : 'Play this video in the booth and on the projector wall') : 'Cue a video first'}
            style={{
              width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: !cur ? C.elevated2 : wallShowsUs ? 'rgba(239,68,68,0.14)' : 'linear-gradient(180deg, #dc2626, #b91c1c)',
              border: !cur ? '1px solid var(--ui-border2)' : wallShowsUs ? '1px solid rgba(239,68,68,0.55)' : 'none',
              color: !cur ? C.faint : wallShowsUs ? '#f87171' : '#fff',
              borderRadius: 10, padding: '11px 0', fontSize: 13, fontWeight: 900, letterSpacing: 0.4,
              cursor: !cur ? 'default' : 'pointer', opacity: !cur ? 0.6 : 1,
              boxShadow: !cur || wallShowsUs ? 'none' : '0 8px 24px rgba(220,38,38,0.35)',
            }}
          >
            <MonitorUp size={15} /> {wallShowsUs ? 'Live on wall — tap to re-sync' : 'Send to Live'}
          </motion.button>
          </div>{/* end width-capped stage + Send column */}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
            <button onClick={() => stepCue(-1)} title="Cue previous" style={{ width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '7px 0', cursor: 'pointer' }}><SkipBack size={14} /></button>
            <button onClick={() => stepCue(1)} title="Cue next" style={{ width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text2, borderRadius: 8, padding: '7px 0', cursor: 'pointer' }}><SkipForward size={14} /></button>
            <button onClick={stopAll} title="Stop booth and, if live, clear the projector" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '7px 11px', cursor: 'pointer' }}><Square size={13} /></button>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>Click a row to cue · Send to Live puts it on the wall</span>
          </div>
        </div>
      </div>

    </motion.div>
  );
}
