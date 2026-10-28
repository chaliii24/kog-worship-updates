import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Minus, Music, Play, Plus, Smartphone, Square, Volume2, VolumeX } from 'lucide-react';
import { stripMarkup } from '../../lib/lyrics';
import { stubTap } from '../../lib/anim';
import { fmtClock, LAYOUT_PRESETS } from '../../lib/stageLayout';
import { transposeChart, toNashville, keyOffset } from '../../lib/chords';
import { clampBpm, normalizeTimeSignature, meterLabel, TIME_SIGNATURE_OPTIONS, pushTap, computeTapTempo } from '../../lib/metronome';
import { useMetronomeEngine } from '../../lib/useMetronomeEngine';
import { unlockClick, playClick } from '../../lib/clickTrack';

// Drummer surface palette: the gold stage accent against pure black.
const GOLD = '#FFC72C';

// Shared skin for the drummer's control buttons (steppers, TAP, meter). One
// object keeps the row visually a single unit — dark plate, hairline border,
// gold when it's a tempo function.
const CTL_BASE = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  background: '#131316', border: '1px solid #232327', color: '#f5f5f7',
  borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
  touchAction: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent',
  fontWeight: 900, fontSize: 'clamp(12px, 1.7vh, 15px)', letterSpacing: '0.1em',
};

// A phone-sized mirror of the physical stage display: same content, same
// visual language (black stage, status strip, hero lyric, next card), sized
// in vh so it scales correctly on any phone resolution. When the console
// pushes the stage feed (cfg + flow), the phone mirrors the monitor's clock,
// alert banner, flow tracker and high-contrast mode too.
//
// `lockedRole` comes from a URL provision (?role=drummer). It bypasses the
// role picker entirely; the drummer lock also hides every chrome element so
// the phone is nothing but the full-screen visual metronome.
export default function StageScreen({ C, state, status, onSwitchRole, lockedRole = null, send = () => false }) {
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const stage = state?.stage || null;
  const live = state?.live || null;
  const current = stage?.current || (live ? { title: live.title, label: live.label, text: live.text } : null);
  const next = stage?.next || null;
  const cleared = !(current && (current.text || current.title));

  // Stage config mirror (older consoles push nothing → legacy behavior).
  // ROLE: each phone picks its own view — 'follow' mirrors the monitor's
  // config exactly; a role preset overlays THAT role's module flags while
  // keeping everything shared (alert, clock format, traffic, play key, BPM).
  // Stored on the device, so every singer keeps their own choice.
  const baseCfg = stage?.cfg || null;
  const [role, setRole] = useState(() => {
    if (lockedRole) return lockedRole;
    try { return localStorage.getItem('kog_stage_role') || 'follow'; } catch { return 'follow'; }
  });
  const pickRole = (id) => {
    if (lockedRole) return;
    setRole(id);
    try { localStorage.setItem('kog_stage_role', id); } catch { /* private mode */ }
  };
  const cfg = useMemo(() => {
    if (!baseCfg) return null;
    if (role === 'follow') return baseCfg;
    const preset = LAYOUT_PRESETS[role];
    if (!preset) return baseCfg;
    const { label, ...flags } = preset;
    return { ...baseCfg, ...flags, layout: role };
  }, [baseCfg, role]);
  const flow = stage?.flow || null;
  const high = !!cfg && cfg.contrast !== 'standard';
  const bg = '#000000';
  const curColor = cfg?.contrast === 'high-white' ? '#ffffff' : cfg?.contrast === 'high-yellow' ? '#fde047' : C.text;
  const nextColor = cfg?.contrast === 'high-white' ? '#e9e9ec' : cfg?.contrast === 'high-yellow' ? '#fff7d6' : C.muted;
  const eyebrowColor = high ? (cfg?.contrast === 'high-white' ? '#ffffff' : '#fde047') : C.accLine;
  const faint = high ? 'rgba(255,255,255,0.55)' : C.faint;
  const hairline = high ? '#232327' : '#1e1e2a';

  // 1s tick for the mirrored clock + alert expiry.
  const [now, setNow] = useState(() => Date.now());
  const alertRaw = cfg && cfg.showAlert !== false && cfg.alert && cfg.alert.text ? cfg.alert : null;
  const alertActive = !!(alertRaw && (!alertRaw.until || now < alertRaw.until));
  useEffect(() => {
    if (!cfg?.clock && !alertActive) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cfg?.clock, alertActive]);

  const h = view.h || 800;
  const w = view.w || 400;
  // Landscape phones/tablets lose most of their viewport height, so sizing
  // off h alone renders at half size (and vh-set microcopy unreadably
  // small). Borrow from the abundant width instead: portrait is untouched
  // (u === h), landscape sizes up ~30-45% while budgets below still account
  // against real height, so nothing can overflow.
  const landscape = w > h;
  const u = landscape ? Math.max(h, Math.min(w * 0.62, h * 1.5)) : h;
  // Small-caps labels set in vh would drop to ~6px in landscape — floor them
  // off the same unit the lyric uses.
  const fz = (frac, min) => Math.max(min, u * frac);
  const fitSize = (base, floor, budget, lines) =>
    Math.max(u * floor, Math.min(u * base, (u * budget) / (Math.max(1, lines) * 1.3)));

  // Chord chart (Worship Leader role or operator toggle): transposed exactly
  // the way the monitor does it — same lib, same play key, Nashville switch.
  let chordText = '';
  if (cfg?.showChords && stage?.chord?.text) {
    const semis = keyOffset(stage.chord.key || 'C', cfg.playKey || 'C');
    const t = transposeChart(stage.chord.text, semis, { preferFlats: /b$/.test(cfg.playKey || '') });
    chordText = cfg.nashville ? toNashville(t, cfg.playKey || 'C') : t;
  }

  const nextLines = Math.max(1, String(next?.text || '').split('\n').length);
  const nextSize = fitSize(0.036, 0.019, 0.20, nextLines);
  const nextRatio = Math.min(0.40, 0.12 + 0.06 + (nextLines * nextSize * 1.3) / h);
  // Chords take their own slice (~16vh) — give the lyric that budget up
  // front so it never clips behind the chart.
  const curBudget = Math.max(0.26, 1 - 0.14 - 0.05 - nextRatio - (chordText ? 0.20 : 0));
  const curSize = fitSize(0.076, 0.030, curBudget, String(current?.text || '').split('\n').length) * (landscape ? 1.18 : 1);
  const heroText = cleared ? '' : stripMarkup(current?.text);

  // Measure-and-fit: bigger type must never clip. After every slide, text or
  // orientation change the hero restarts full-size; while its box overflows,
  // each pass steps down 8% (bounded at ~half, so at most a handful of
  // passes). Short lyrics stay big, long ones trim themselves to fit.
  const heroRef = useRef(null);
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => { setFitScale(1); }, [current?.text, curSize]);
  useLayoutEffect(() => {
    const el = heroRef.current;
    if (!el || !heroText || fitScale <= 0.55) return;
    if (el.scrollHeight > el.clientHeight + 2) {
      setFitScale((s) => Math.max(0.55, s - 0.08));
    }
  });
  const eyebrow = [current?.title, current?.label].filter(Boolean).join('  ·  ');

  // Drummer role: BPM + a JavaScript-timed beat light. The transport stays
  // local to THIS phone — the drummer, not the operator, decides when the
  // pulse runs — and on the drummer phone tempo/meter are TWO-WAY: every
  // change here is sent back as `metronomeSet`, which lands on the console's
  // own stageCfg (the config the desktop tempo panel edits), so the stage
  // beat-dot, the desk and every other phone converge on the drummer's numbers.
  const isDrummer = role === 'drummer';
  const metState = state?.metronome || null;

  // Echo-aware tempo: `echo` is a change this phone just made that the console
  // has not confirmed yet. The ring reacts on the tap instead of waiting a
  // round trip, then hands control back to the pushed value the moment it
  // matches (or after a grace period if the console never confirms — it moved
  // the room elsewhere, which wins). Offline the echo is kept: the drummer's
  // own numbers stay on screen while the link is down.
  const inBpm = clampBpm(metState?.bpm ?? cfg?.bpm);
  const inMeter = normalizeTimeSignature(metState?.timeSignature ?? cfg?.timeSignature);
  const [echo, setEcho] = useState(null); // { bpm?, timeSignature?, at }
  const patchEcho = (patch) => setEcho((prev) => {
    const next = { ...(prev || {}), ...patch, at: Date.now() };
    if (next.bpm == null && next.timeSignature == null) return null;
    return next;
  });
  const bpm = echo && echo.bpm != null ? clampBpm(echo.bpm, inBpm) : inBpm;
  const timeSignature = echo && echo.timeSignature != null ? normalizeTimeSignature(echo.timeSignature, inMeter) : inMeter;
  // The steppers build on what the screen SHOWS (including unconfirmed steps),
  // so holding + climbs instead of re-deriving the last pushed value.
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  useEffect(() => {
    if (!echo) return undefined;
    const confirmed = (echo.bpm == null || clampBpm(echo.bpm) === inBpm)
      && (echo.timeSignature == null || normalizeTimeSignature(echo.timeSignature) === inMeter);
    if (confirmed) { setEcho(null); return undefined; }
    if (status !== 'online') return undefined; // offline: the drummer keeps his numbers
    const id = setTimeout(() => setEcho(null), 2600); // never confirmed — follow the room again
    return () => clearTimeout(id);
  }, [echo, inBpm, inMeter, status]);

  const [transportOn, setTransportOn] = useState(false);
  // The flash decay is shorter than a beat at any allowed tempo, so the light
  // is dark between beats instead of blurring into a permanent glow.
  const flashMs = Math.max(70, Math.min(180, (60000 / bpm) * 0.32));
  const [flashOn, setFlashOn] = useState(false);
  const flashTimerRef = useRef(null);

  // Audible click track. It lives on THIS phone only — the console and every
  // other phone stay silent, because the tick belongs to the person holding
  // the sticks. On by default, remembered per device.
  const [clickOn, setClickOn] = useState(() => {
    try { return localStorage.getItem('kog_drummer_click') !== 'off'; } catch { return true; }
  });
  const toggleClick = () => {
    setClickOn((v) => {
      const next = !v;
      try { localStorage.setItem('kog_drummer_click', next ? 'on' : 'off'); } catch { /* private mode */ }
      // Resuming needs a user gesture: this tap IS one.
      if (next) unlockClick();
      return next;
    });
  };

  // Turn the light on in the SAME rAF tick that advances the beat, so the
  // flash is batched with the beat state instead of trailing it by a render.
  const onEngineBeat = (beatNo) => {
    setFlashOn(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashOn(false), flashMs);
    // The tick is scheduled on the Web Audio clock inside this same beat tick,
    // so ear and eye stay in step even when a frame is dropped. Beat 1 is
    // accented so the drummer hears the top of the bar.
    if (clickOn) playClick({ accent: beatNo === 1 });
  };
  const { beat: engineBeat, beats } = useMetronomeEngine({
    enabled: isDrummer && transportOn,
    bpm,
    timeSignature,
    onBeat: onEngineBeat,
  });
  // Stop instantly: no residual flash when transport is switched off.
  useEffect(() => {
    if (transportOn && isDrummer) return undefined;
    clearTimeout(flashTimerRef.current);
    setFlashOn(false);
    return undefined;
  }, [transportOn, isDrummer]);
  useEffect(() => () => clearTimeout(flashTimerRef.current), []);
  const downbeat = engineBeat === 1;
  const locked = !!lockedRole;
  const fullScreenDrummer = locked && isDrummer;

  // --- DRUMMER CONTROL: SERVICE-ORDER SONG PICK + TEMPO ---------------------
  // The set list comes down with the service snapshot (each row carries its
  // song id + saved BPM, or null when the song has no tempo of its own), so
  // the drummer picks from what is ACTUALLY on the order — no library search
  // mid-service. `picked` is this phone's own selection: its echo comes back
  // as state.song (the console loads the song too), and a song change FROM
  // the console (the operator fired the next one) takes the list back over,
  // so the desk and the phone always end up on the same row.
  const [sheet, setSheet] = useState(false);
  const [picked, setPicked] = useState(null); // { songId, title, at }
  const orderSongs = useMemo(() => {
    const out = [];
    ((state?.service?.sections) || []).forEach((sec) => {
      ((sec && sec.items) || []).forEach((it) => {
        if (!it || !it.songId) return; // non-song rows (slides, media, headers) aren't tempo
        out.push({
          rowId: it.id ?? `r${out.length}`,
          songId: String(it.songId),
          title: it.title || 'Song',
          subtitle: it.subtitle || '',
          bpm: it.bpm != null ? Number(it.bpm) : null,
          live: !!it.live,
        });
      });
    });
    return out;
  }, [state?.service]);

  const consoleSongId = state?.song?.id != null ? String(state.song.id) : null;
  const activeSongId = picked ? String(picked.songId) : consoleSongId;
  useEffect(() => {
    if (!picked || !consoleSongId) return;
    if (String(picked.songId) === consoleSongId) return; // our pick landed (or it was already current)
    if (Date.now() - picked.at < 2500) return;           // our pick is still travelling
    setPicked(null);                                     // the console moved on — follow it
  }, [consoleSongId, picked]);
  useEffect(() => {
    if (!sheet) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSheet(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  // One tempo change = one command. Same clamping as the desktop panel, and a
  // value the console already holds sends nothing.
  const setTempo = (raw) => {
    const v = clampBpm(raw, bpmRef.current);
    bpmRef.current = v;
    if (v === inBpm) { patchEcho({ bpm: undefined }); return; }
    patchEcho({ bpm: v });
    send('metronomeSet', { bpm: v });
  };
  const stepBpm = (delta) => setTempo(bpmRef.current + delta);

  // Tap tempo: the shared lib's rule — average of the last ≤4 taps, history
  // dropped when the drummer pauses (2.2s) so a fresh tap starts a new feel.
  const tapsRef = useRef([]);
  const tapTempo = () => {
    tapsRef.current = pushTap(tapsRef.current, Date.now());
    const t = computeTapTempo(tapsRef.current);
    if (t != null) setTempo(t);
  };

  // Meter cycles through the console's own list (2/4 … 7/4) — the beat engine
  // restarts on the downbeat, exactly like a meter change from the desk.
  const cycleMeter = () => {
    const last = TIME_SIGNATURE_OPTIONS[TIME_SIGNATURE_OPTIONS.length - 1];
    const at = TIME_SIGNATURE_OPTIONS.indexOf(timeSignature);
    const next = at === -1
      ? (timeSignature >= last ? TIME_SIGNATURE_OPTIONS[0] : timeSignature + 1)
      : TIME_SIGNATURE_OPTIONS[(at + 1) % TIME_SIGNATURE_OPTIONS.length];
    patchEcho({ timeSignature: next });
    send('metronomeSet', { timeSignature: next });
  };

  // Pick a song from the order: its saved tempo rides in with the pick; a song
  // with no tempo of its own keeps whatever is running (the console's own
  // rule — "songs without a saved tempo leave the metronome untouched"). The
  // console loads the song too (selectSong never touches the projection).
  const pickSong = (row) => {
    const next = row.bpm != null ? clampBpm(row.bpm, bpmRef.current) : clampBpm(bpmRef.current);
    bpmRef.current = next;
    setPicked({ songId: row.songId, title: row.title, at: Date.now() });
    patchEcho({ bpm: next });
    send('metronomeSet', { songId: row.songId, title: row.title, bpm: next });
    setSheet(false);
  };

  // Title: the drummer's picked song first (he's the one running tempo), then
  // the song the console actually LOADED. Deliberately not the on-air slide or
  // the boot placeholder ("KOG Worship"): the tempo follows a real song, so a
  // fresh launch with nothing loaded stays blank instead of showing the last
  // room tempo beside a placeholder title.
  const drumTitle = (picked && picked.title) || (state?.song && state.song.title) || '';
  // Tempo is meaningful once a song is loaded OR the drummer starts the
  // transport (a standalone click between songs is valid).
  const drumHasSong = !!drumTitle;
  const showTempo = drumHasSong || transportOn;

  const offline = status !== 'online';

  return (
    <div style={{
      minHeight: '100dvh',
      maxWidth: fullScreenDrummer ? 'none' : 880,
      width: '100%',
      margin: '0 auto',
      background: bg,
      color: curColor,
      display: 'flex',
      flexDirection: 'column',
      padding: fullScreenDrummer
        ? 'calc(10px + env(safe-area-inset-top)) 14px calc(10px + env(safe-area-inset-bottom))'
        : 'calc(14px + env(safe-area-inset-top)) 18px calc(14px + env(safe-area-inset-bottom))',
    }}>
      {/* STATUS STRIP: live dot · clock · control (hidden for the locked
          full-screen drummer provision). */}
      {!fullScreenDrummer && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: landscape ? '1vh' : '1.4vh', marginBottom: landscape ? '1vh' : '1.4vh', borderBottom: `1px solid ${hairline}`, flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cleared ? '#3f3f46' : '#36C982', boxShadow: cleared ? 'none' : '0 0 10px #36C982', flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, color: faint }}>{cleared ? 'CLEARED' : 'LIVE'}</span>
        <span style={{ flex: 1 }} />
        {cfg?.clock && (
          <span style={{ fontSize: 14, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: curColor, letterSpacing: 1 }}>
            {fmtClock(now, cfg.clockFormat)}
          </span>
        )}
        {!locked && (
          <button onClick={() => onSwitchRole('control')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: 'none', color: C.accLine, fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 6, fontFamily: 'inherit' }}>
            <Smartphone size={14} /> Control
          </button>
        )}
      </div>
      )}

      {/* ROLE PICKER: every phone chooses its own view (or Follow = mirror
          the stage monitor). Device-local — tapping it can't disturb the
          console or anyone else's screen. A URL-provisioned role hides it
          and locks the device to that view. */}
      {!locked && (
      <div style={{ display: 'flex', gap: 5, marginBottom: landscape ? '1vh' : '1.4vh', flexShrink: 0 }}>
        {[['follow', 'Follow'], ['pastor', 'Pastor'], ['worship', 'Worship'], ['drummer', 'Drummer']].map(([id, lbl]) => {
          const on = role === id;
          return (
            <button
              key={id}
              onClick={() => pickRole(id)}
              style={{ flex: 1, background: on ? eyebrowColor : 'transparent', border: `1px solid ${on ? eyebrowColor : hairline}`, color: on ? '#000000' : faint, borderRadius: 999, padding: '5px 0', fontSize: 9.5, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
      )}

      {/* Stage alert: same message the monitor shows (stage-only). The locked
          drummer screen stays pure metronome. */}
      {!fullScreenDrummer && alertActive && (
        <div style={{ marginBottom: landscape ? '1vh' : '1.4vh', borderRadius: 10, padding: '10px 12px', background: alertRaw.level === 'urgent' ? '#FF4545' : '#b45309', color: '#ffffff', fontSize: 15, fontWeight: 900, textAlign: 'center', flexShrink: 0 }}>
          {String(alertRaw.text)}
        </div>
      )}

      {/* Song flow tracker: current part filled (same as the monitor).
          Hidden for the drummer — that view is BPM only. */}
      {!isDrummer && cfg?.showFlow !== false && flow?.labels?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'nowrap', overflow: 'hidden', alignItems: 'center', gap: 5, marginBottom: landscape ? '1vh' : '1.4vh', flexShrink: 0 }}>
          {flow.labels.map((label, i) => (
            <React.Fragment key={`${label}-${i}`}>
              {i > 0 && <span style={{ color: faint, fontSize: 10, fontWeight: 900, flexShrink: 0 }}>›</span>}
              <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: 0.8, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, background: i === flow.index ? eyebrowColor : 'transparent', color: i === flow.index ? '#000000' : faint, border: `1px solid ${i === flow.index ? eyebrowColor : hairline}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                {label}
              </span>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* DRUMMER: full-screen visual metronome — song title, a glowing gold
          tempo ring, one pad per beat, and the transport. The pulse is
          scheduled by requestAnimationFrame on an absolute millisecond grid
          (useMetronomeEngine), so CSS animation duration never drifts against
          the tempo. The ring blooms on every beat; beat 1's pad flashes red,
          the remaining pads white. */}
      {isDrummer ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: 560, margin: '0 auto', minHeight: 0 }}>
          {/* Song title IS the picker: tapping it opens the service-order
              sheet, so the drummer can change song (and load its saved BPM)
              straight from the stage phone. */}
          <button
            onClick={() => setSheet(true)}
            aria-label="Choose a song from the service order"
            data-testid="drum-song-pick"
            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, maxWidth: '100%', background: 'transparent', border: 'none', color: GOLD, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 4px' }}
          >
            <Music size={15} style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 'clamp(15px, 3vh, 28px)', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.14em', maxWidth: '78vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {drumTitle || 'Pick song'}
            </span>
            <span aria-hidden="true" style={{ fontSize: '0.72em', transform: 'translateY(1px)' }}>▾</span>
          </button>

          {/* TEMPO RING + PADS sit as one cluster, centered in the space
              between the title and the transport, so taller phones grow the
              breathing room instead of separating the ring from its pads. */}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: landscape ? '1.4vh' : '2.2vh' }}>
            {/* TEMPO RING: thin outer halo around a thick gold ring with the BPM
                living inside it. The ring never goes dark — it only blooms
                brighter on the beat, so the drummer can always read tempo. */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ position: 'relative', width: landscape ? 'min(44vh, 46vw)' : 'min(48vh, 92vw)', height: landscape ? 'min(44vh, 46vw)' : 'min(48vh, 92vw)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Two blurred copies of the ring supply the neon bloom
                    without box-shadow (large box-shadow blurs rasterize as
                    square layer artifacts on some GPUs): a broad soft halo
                    and a tight bloom that hugs the ring. */}
                <div aria-hidden="true" style={{ position: 'absolute', inset: '5%', borderRadius: '50%', border: `clamp(5px, 2.2vw, 11px) solid ${GOLD}`, filter: 'blur(26px)', opacity: transportOn && flashOn ? 0.85 : 0.5, transition: transportOn && flashOn ? 'none' : `opacity ${flashMs}ms ease-out`, willChange: 'opacity' }} />
                <div aria-hidden="true" style={{ position: 'absolute', inset: '5%', borderRadius: '50%', border: `clamp(5px, 2.2vw, 11px) solid ${GOLD}`, filter: 'blur(9px)', opacity: transportOn && flashOn ? 1 : 0.7, transition: transportOn && flashOn ? 'none' : `opacity ${flashMs}ms ease-out`, willChange: 'opacity' }} />
                <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1.5px solid rgba(255,199,44,0.50)' }} />
                <div
                  data-testid="drum-ring"
                  style={{
                    position: 'absolute', inset: '5%', borderRadius: '50%',
                    border: `clamp(5px, 2.2vw, 11px) solid ${transportOn && flashOn ? '#fff1ad' : GOLD}`,
                    boxShadow: 'inset 0 0 30px rgba(255,214,10,0.14)',
                    transition: transportOn && flashOn ? 'none' : `border-color ${Math.max(150, flashMs * 1.4)}ms ease-out`,
                  }}
                />
                <div
                  data-testid="drum-light"
                  data-beat={engineBeat || 0}
                  data-downbeat={downbeat ? 'true' : 'false'}
                  aria-hidden="true"
                  style={{
                    position: 'absolute', inset: '6%', borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(255,214,10,0.20) 0%, rgba(255,214,10,0.07) 58%, transparent 74%)',
                    opacity: transportOn && flashOn ? 1 : 0.35,
                    transition: transportOn && flashOn ? 'none' : `opacity ${flashMs}ms ease-out`,
                    willChange: 'opacity',
                  }}
                />
                {showTempo ? (
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 'clamp(8px, 1.6vw, 18px)', lineHeight: 0.82, fontVariantNumeric: 'tabular-nums' }}>
                    <div data-testid="drum-bpm" style={{ fontSize: 'min(17vh, 40vw)', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em', textShadow: '0 0 28px rgba(255,214,10,0.22)' }}>{bpm}</div>
                    <div data-testid="drum-meter" style={{ fontSize: 'min(5.4vh, 12.5vw)', fontWeight: 900, fontStyle: 'italic', color: GOLD, letterSpacing: '-0.02em' }}>{meterLabel(timeSignature)}</div>
                  </div>
                ) : (
                  <div style={{ position: 'relative', textAlign: 'center', lineHeight: 1.4, padding: '0 8%' }}>
                    <div style={{ fontSize: 'clamp(13px, 2.2vh, 19px)', fontWeight: 900, color: faint, letterSpacing: 1.5, textTransform: 'uppercase' }}>No song loaded</div>
                    <div style={{ fontSize: 'clamp(10px, 1.7vh, 14px)', fontWeight: 700, color: faint, marginTop: '0.9vh' }}>Tempo and meter come from the console.</div>
                  </div>
                )}
              </div>
            </div>

            {/* BEAT PADS: one card per beat in the meter. The downbeat pad lights
                red, every other beat white — the same language as the ring. */}
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: fz(0.018, 11), fontWeight: 900, letterSpacing: 2, textTransform: 'uppercase', color: transportOn ? GOLD : faint, marginBottom: '0.9vh' }}>
                {transportOn ? (downbeat ? 'Downbeat · 1' : `Beat ${engineBeat || 1} of ${beats}`) : 'Stopped'}
              </div>
              <div aria-hidden="true" style={{ display: 'flex', gap: 'clamp(6px, 2.2vw, 12px)' }}>
                {Array.from({ length: beats }, (_, i) => i + 1).map((n) => {
                  const on = transportOn && engineBeat === n;
                  const first = n === 1;
                  return (
                    <div
                      key={n}
                      style={{
                        flex: 1, height: 'clamp(46px, 10.5vh, 118px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: 'clamp(10px, 2.6vw, 18px)',
                        background: on ? (first ? 'rgba(255,59,48,0.12)' : 'rgba(255,255,255,0.06)') : '#131316',
                        border: `1px solid ${on ? (first ? 'rgba(255,59,48,0.42)' : 'rgba(255,255,255,0.18)') : '#232327'}`,
                        boxShadow: on ? (first ? '0 0 28px rgba(255,59,48,0.32)' : '0 0 22px rgba(255,255,255,0.12)') : 'none',
                        transition: `background ${flashMs}ms linear, border-color ${flashMs}ms linear, box-shadow ${flashMs}ms linear`,
                      }}
                    >
                      <span style={{
                        display: 'block', width: '76%', height: 'clamp(7px, 1.7vh, 16px)', borderRadius: 999,
                        background: on ? (first ? '#FF3B30' : '#fff7e0') : (first ? 'rgba(255,59,48,0.30)' : 'rgba(255,255,255,0.16)'),
                        boxShadow: on
                          ? (first
                            ? '0 0 16px rgba(255,59,48,0.95), 0 0 48px rgba(255,59,48,0.55)'
                            : '0 0 14px rgba(255,247,224,0.85), 0 0 40px rgba(255,247,224,0.40)')
                          : 'none',
                        transition: `background ${flashMs}ms linear, box-shadow ${flashMs}ms linear`,
                      }} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* DRUMMER CONTROLS: tempo steppers + TAP + meter on the left (each
              publishes metronomeSet, so the console panel, stage beat-dot and
              every other phone follow), the device-local click toggle on the
              right. One row so the ring keeps the vertical budget. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: '1.4vh' }}>
            <button
              onClick={() => stepBpm(-1)}
              aria-label="Decrease tempo by 1 BPM"
              data-testid="drum-bpm-down"
              style={{ ...CTL_BASE, width: 'clamp(42px, 6.5vh, 54px)', height: 'clamp(42px, 6.5vh, 54px)' }}
            >
              <Minus size={16} />
            </button>
            <button
              onClick={tapTempo}
              aria-label="Tap tempo"
              title="Tap along to set the tempo — averages the last 4 taps"
              data-testid="drum-tap"
              style={{ ...CTL_BASE, flex: '0 0 auto', height: 'clamp(42px, 6.5vh, 54px)', padding: '0 13px', color: GOLD }}
            >
              TAP
            </button>
            <button
              onClick={() => stepBpm(1)}
              aria-label="Increase tempo by 1 BPM"
              data-testid="drum-bpm-up"
              style={{ ...CTL_BASE, width: 'clamp(42px, 6.5vh, 54px)', height: 'clamp(42px, 6.5vh, 54px)' }}
            >
              <Plus size={16} />
            </button>
            <button
              onClick={cycleMeter}
              aria-label="Change time signature"
              title="Cycle the meter (2/4 … 7/4) — the beat restarts on the downbeat"
              data-testid="drum-meter-cycle"
              style={{ ...CTL_BASE, height: 'clamp(42px, 6.5vh, 54px)', padding: '0 11px', color: GOLD, fontVariantNumeric: 'tabular-nums' }}
            >
              {meterLabel(timeSignature)}
            </button>
            <span style={{ flex: 1 }} />
            <button
              onClick={toggleClick}
              aria-pressed={clickOn}
              data-testid="drum-click"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                background: clickOn ? 'rgba(255,199,44,0.10)' : 'transparent',
                border: `1px solid ${clickOn ? GOLD : '#2a2a30'}`,
                color: clickOn ? GOLD : faint,
                borderRadius: 999, padding: '8px 14px', height: 'clamp(42px, 6.5vh, 54px)',
                fontSize: 'clamp(10px, 1.5vh, 13px)', fontWeight: 900,
                letterSpacing: '0.12em', textTransform: 'uppercase',
                cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
              }}
            >
              {clickOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {clickOn ? 'Click on' : 'Click off'}
            </button>
          </div>

          {/* Transport lives here, on the drummer's phone, so the drummer —
              not the operator — starts and stops the click. */}
          <motion.button
            {...stubTap}
            onClick={() => setTransportOn((v) => { const next = !v; if (next) unlockClick(); return next; })}
            aria-pressed={transportOn}
            aria-label={transportOn ? 'Stop the metronome' : 'Start the metronome'}
            data-testid="drum-transport"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              width: '100%', minHeight: 58, flexShrink: 0, marginTop: '1.8vh',
              background: transportOn ? 'rgba(255,59,48,0.06)' : GOLD,
              border: `1.5px solid ${transportOn ? 'rgba(255,59,48,0.60)' : GOLD}`,
              color: transportOn ? '#FF3B30' : '#0b0b0c',
              borderRadius: 999, padding: '14px 26px',
              fontSize: 'clamp(14px, 2.2vh, 20px)', fontWeight: 900,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
            }}
          >
            {transportOn ? <Square size={18} /> : <Play size={18} />}
            {transportOn ? 'Stop' : 'Start'}
          </motion.button>
        </div>
      ) : (
      <>
      {/* HERO: eyebrow + current lyric */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', minHeight: 0 }}>
        {cleared ? (
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: faint, letterSpacing: 0.5 }}>
            {status === 'online' ? 'Nothing on air' : 'Waiting for the computer…'}
          </p>
        ) : (
          <>
            {eyebrow && (
              <div style={{ fontSize: fz(0.019, 10.5), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: 2.5, marginBottom: stage?.wall ? '0.5vh' : (landscape ? '0.8vh' : '1.2vh'), maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {eyebrow}
              </div>
            )}
            {stage?.wall ? (
              <div title={stage.wall} style={{ fontSize: fz(0.015, 9.5), fontWeight: 700, color: faint, letterSpacing: 1.5, marginBottom: landscape ? '0.8vh' : '1.2vh', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ON WALL · {stage.wall}</div>
            ) : null}
            {heroText ? (
              <div ref={heroRef} style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' }}>
                <p style={{ margin: 0, fontSize: `${curSize * fitScale}px`, lineHeight: 1.28, fontWeight: 800, whiteSpace: 'pre-line', overflow: 'hidden', color: curColor, maxWidth: '100%' }}>
                  {heroText}
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Chord chart: portrait-friendly slice under the lyric — what the
          Worship Leader role actually asks for. */}
      {chordText && (
        <div style={{ flexShrink: 0, maxHeight: '16vh', overflow: 'hidden', borderTop: `1px solid ${hairline}`, paddingTop: landscape ? '0.9vh' : '1.2vh', marginTop: landscape ? '0.9vh' : '1.2vh', textAlign: 'center' }}>
          <div style={{ fontSize: fz(0.016, 9.5), fontWeight: 800, color: eyebrowColor, textTransform: 'uppercase', letterSpacing: 2, marginBottom: '0.7vh' }}>
            {cfg.nashville ? 'Nashville' : `Key of ${cfg.playKey || 'C'}`}
          </div>
          <pre style={{ margin: 0, display: 'inline-block', textAlign: 'left', fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap', color: curColor, overflow: 'hidden' }}>{chordText}</pre>
        </div>
      )}

      {/* NEXT card */}
      <div style={{ borderTop: `1px solid ${hairline}`, marginTop: landscape ? '1.1vh' : '1.6vh', paddingTop: landscape ? '1vh' : '1.4vh', minHeight: landscape ? '10vh' : '12vh', flexShrink: 0 }}>
        {next && (next.text || next.label) ? (
          <>
            <div style={{ fontSize: fz(0.017, 10), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: 2, marginBottom: '0.7vh', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Next&nbsp;&nbsp;▸&nbsp;&nbsp;<span style={{ color: nextColor }}>{next.title ? `${next.title}  ·  ` : ''}{next.label}</span>
            </div>
            {next.text ? (
              <p style={{ margin: 0, fontSize: `${nextSize}px`, lineHeight: 1.32, fontWeight: 700, whiteSpace: 'pre-line', color: nextColor, overflow: 'hidden' }}>{stripMarkup(next.text)}</p>
            ) : null}
          </>
        ) : (
          <div style={{ fontSize: fz(0.017, 10), fontWeight: 800, color: faint, textTransform: 'uppercase', letterSpacing: 2 }}>Next&nbsp;&nbsp;▸&nbsp;&nbsp;—</div>
        )}
      </div>
      </>
      )}

      {/* SONG PICKER SHEET: every song on the current service order, in
          order, each with its saved BPM. Picking one publishes metronomeSet
          with the song id — the console loads it (projection untouched) and
          its saved tempo drives the ring immediately. */}
      {sheet && (
        <div
          onClick={() => setSheet(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.74)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0d0d11', borderTop: '1px solid #2a2a30',
              borderRadius: '18px 18px 0 0',
              padding: '14px 14px calc(18px + env(safe-area-inset-bottom))',
              maxHeight: '72dvh', overflowY: 'auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Music size={15} color={GOLD} />
              <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f5f5f7' }}>
                Service order{orderSongs.length ? ` · ${orderSongs.length} song${orderSongs.length === 1 ? '' : 's'}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              <button
                onClick={() => setSheet(false)}
                aria-label="Close"
                style={{ background: 'transparent', border: 'none', color: faint, fontSize: 17, cursor: 'pointer', padding: '2px 6px', fontFamily: 'inherit', lineHeight: 1 }}
              >
                ✕
              </button>
            </div>
            {orderSongs.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {orderSongs.map((row) => {
                  const on = row.songId === activeSongId;
                  return (
                    <button
                      key={row.rowId}
                      onClick={() => pickSong(row)}
                      data-testid="drum-song-row"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                        background: on ? 'rgba(255,199,44,0.14)' : '#131316',
                        border: `1px solid ${on ? 'rgba(255,199,44,0.55)' : '#232327'}`,
                        color: '#f5f5f7', borderRadius: 12, padding: '11px 13px',
                        minHeight: 50, cursor: 'pointer', fontFamily: 'inherit',
                        touchAction: 'manipulation',
                      }}
                    >
                      {row.live && <span aria-label="On air" style={{ width: 7, height: 7, borderRadius: '50%', background: '#36C982', boxShadow: '0 0 8px #36C982', flexShrink: 0 }} />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</span>
                        {row.subtitle ? <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.subtitle}</span> : null}
                      </span>
                      <span style={{ fontSize: 12.5, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: row.bpm != null ? GOLD : faint, flexShrink: 0 }}>
                        {row.bpm != null ? `${row.bpm} BPM` : '—'}
                      </span>
                      {on && <Check size={16} color={GOLD} style={{ flexShrink: 0 }} />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 12.5, color: faint, lineHeight: 1.6 }}>
                No songs on the service order yet — add songs on the console and they will appear here.
              </p>
            )}
            <p style={{ margin: '12px 0 0 0', fontSize: 11, color: faint, lineHeight: 1.55 }}>
              Picking a song loads it on the console (the projection is untouched) and applies its saved tempo. Songs without a saved tempo keep the current BPM.
            </p>
          </div>
        </div>
      )}

      {offline && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 'calc(10px + env(safe-area-inset-bottom))', textAlign: 'center', fontSize: 12, fontWeight: 800, color: '#FF4545' }}
        >
          Connection lost — reconnecting…
        </motion.div>
      )}
    </div>
  );
}