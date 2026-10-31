import React, { useState, useEffect, useRef } from 'react';
import { DEFAULT_LYRIC_SIZE, SlideTextLayers } from '../lib/lyrics';
import { aspectFrameInViewport, designCanvasFilled } from '../lib/slideGeometry';
import { cssSpeed } from '../lib/constants';
import PresentationSlide from './PresentationSlide';
import { TimerFace } from './CountdownFace';
import AnimatedBg from './AnimatedBg';
import { BackgroundVideo, LiveVideo, OverlayFace, overlayOnAir } from '../lib/perf';
import { DrawOverlay } from './DrawOverlay.jsx';
import ScriptureRef from './ScriptureRef.jsx';
import TitleCardChrome from './TitleCardChrome.jsx';
import { stripScriptureRef, scriptureRefPos } from '../lib/scriptureTemplates';
import { bgFitCss } from '../lib/backgrounds';
import { titleCardIsClassic } from '../lib/titleCardTemplates';
import { CinematicBackdrop, CinematicOverlay } from './CinematicLayer';
import { AnimatePresence, motion } from 'motion/react';

// Development-only perf HUD: enable with localStorage kog_perf=1 in the
// output window (DevTools → Application → Local Storage). Off by default and
// invisible otherwise. Tracks FPS (rAF), slides rendered, commit→paint per
// slide, render IPC count, JS heap, playing-video state and GPU flags —
// everything the stability spec asks to watch, with zero cost when disabled
// (no rAF loop, no polling, not even mounted).
function OutputPerfHud({ slideKey, fit }) {
  const [fps, setFps] = useState(0);
  const [stats, setStats] = useState({ slides: 0, lastMs: 0, maxMs: 0, ipc: 0, mem: 0, video: '—', gpu: '' });
  const sRef = useRef({ frames: 0, last: 0, slides: 0, maxMs: 0, ipc: 0 });
  // FIT DIAGNOSTICS — one line describing exactly how this output scales the
  // design right now (measured viewport → aspect frame → scale → band), plus
  // the environment values that can desync a measurement from what is actually
  // painted (device pixel ratio, window zoom, visualViewport scale). With the
  // numbers in hand, "the wall cuts the design" is answerable from a paste
  // instead of a guess: band > viewport = a stale/oversized measurement;
  // band ≤ viewport with visible cuts = the window extends past the physical
  // screen (resolution preset / LED region bigger than the display).
  const fitLine = fit
    ? `fit ${Math.round(fit.vw)}x${Math.round(fit.vh)} → frame ${Math.round(fit.fw)}x${Math.round(fit.fh)} → s ${fit.s.toFixed(4)} band ${Math.round(fit.cw)}x${Math.round(fit.ch)} @ ${Math.round(fit.cx)},${Math.round(fit.cy)}\n`
    : '';
  const envLine = typeof window !== 'undefined'
    ? `env dpr ${window.devicePixelRatio} outer ${window.outerWidth} inner ${window.innerWidth} visual ${window.visualViewport ? window.visualViewport.scale : '-'} screen ${window.screen ? `${window.screen.width}x${window.screen.height}` : '-'}\n`
    : '';
  // Slide commit → first painted frame. slideKey changes once per fired
  // slide, so this runs once per transition — never a standing loop.
  useEffect(() => {
    const s = sRef.current;
    s.slides += 1;
    s.ipc += 1;
    const t0 = performance.now();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const ms = performance.now() - t0;
        s.maxMs = Math.max(s.maxMs, ms);
        setStats((p) => ({ ...p, slides: s.slides, lastMs: ms, maxMs: s.maxMs, ipc: s.ipc }));
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [slideKey]);
  useEffect(() => {
    const s = sRef.current;
    s.last = performance.now();
    let alive = true;
    let raf = 0;
    const loop = () => {
      if (!alive) return;
      s.frames += 1;
      const now = performance.now();
      if (now - s.last >= 1000) {
        let mem = 0;
        try { mem = Math.round((performance.memory?.usedJSHeapSize || 0) / 1048576); } catch {}
        const v = document.querySelector('video');
        setFps(Math.round((s.frames * 1000) / Math.max(1, now - s.last)));
        setStats((p) => ({
          ...p,
          mem,
          video: v ? `rs${v.readyState} ${(v.currentSrc || v.src || '').split('/').pop()}` : 'no-video',
        }));
        s.frames = 0;
        s.last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    let gpuTimer = 0;
    const pollGpu = async () => {
      try {
        if (!window.require) return;
        const g = await window.require('electron').ipcRenderer.invoke('output-gpu-status');
        if (alive && g && !g.error) setStats((p) => ({ ...p, gpu: `gpu:${g.gpu_compositing || '?'} vid:${g.video_decode || '?'}` }));
      } catch {}
    };
    pollGpu();
    gpuTimer = setInterval(pollGpu, 5000);
    return () => { alive = false; cancelAnimationFrame(raf); clearInterval(gpuTimer); };
  }, []);
  return (
    <div style={{ position: 'fixed', left: 8, top: 8, zIndex: 9999, pointerEvents: 'none', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5, color: '#00ff88', background: 'rgba(0,0,0,0.65)', padding: '6px 8px', borderRadius: 6, whiteSpace: 'pre' }}>
      {`${fitLine}${envLine}fps ${fps}  slides ${stats.slides}\ncommit→paint ${stats.lastMs.toFixed(1)}ms max ${stats.maxMs.toFixed(1)}ms\nipc~${stats.ipc}  mem ${stats.mem}MB\n${stats.video}\n${stats.gpu}`}
    </div>
  );
}

export default function ProjectorDisplay({ currentSlide, C, aspect, config, overlay = null, draw = null, lift = 0, framed = false, frameAspect = '16:9', surface = null }) {
  const rootRef = useRef(null);
  const [win, setWin] = useState(() => ({ w: framed ? 0 : window.innerWidth, h: framed ? 0 : window.innerHeight }));
  // The wall must never throw: a null/undefined slide (boot race, corrupt
  // payload) renders black and stays alive instead of killing the window.
  const cs = currentSlide || {};
  // AUDIO OWNERSHIP: a framed ProjectorDisplay is a PICTURE of the wall (the
  // console's Live Output card, the right-sidebar preview, the Show Builder),
  // never the wall itself. It must stay silent — otherwise the same countdown
  // video plays here AND in the real output window, slightly offset, and the
  // room hears the song twice (echo / flanging). Only the real wall passes
  // `main` through to the countdown surface.
  const timerSurface = surface || (framed ? 'preview' : 'main');

  // FRAMED = this component is being used as a PICTURE of the wall (the
  // console's Live Output card, the Show Builder preview) rather than as the
  // wall itself. Same component, same frame math, same text boxes — so the
  // card can never drift from what the projector draws. The only difference
  // is the surface it measures: its own box instead of the window.
  useEffect(() => {
    if (!framed) {
      let raf = 0;
      const read = () => {
        const de = typeof document !== 'undefined' ? document.documentElement : null;
        // innerWidth/innerHeight are the real wall viewport in CSS pixels — the
        // same unit as the root's 100vw/100vh box, so the design canvas maps
        // 1:1 onto it. Do NOT multiply by devicePixelRatio here: the design
        // math is ratio-based, and scaling by DPR would make the canvas larger
        // than the CSS viewport, clipping it into the top-left corner.
        const iw = Math.round(Number(window.innerWidth) || 0);
        const ih = Math.round(Number(window.innerHeight) || 0);
        const cw = de ? Math.round(Number(de.clientWidth) || 0) : 0;
        const ch = de ? Math.round(Number(de.clientHeight) || 0) : 0;
        // innerWidth/Height are the real wall viewport; clientWidth/Height are
        // only a boot-race fallback (a zero-size frame must never become NaN).
        const w = iw > 0 ? iw : (cw > 0 ? cw : 1920);
        const h = ih > 0 ? ih : (ch > 0 ? ch : 1080);
        setWin(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      };
      const onResize = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          read();
        });
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      const vv = window.visualViewport;
      if (vv) vv.addEventListener('resize', onResize);
      // First paint can happen BEFORE Chromium settles the fullscreen / DPI /
      // taskbar geometry of the display it landed on. Sample a few times, then
      // keep a cheap 1.5s watch so a monitor mode change that never fires
      // `resize` still re-fits the wall instead of leaving black bars.
      const timers = [0, 120, 400, 1000, 2500].map((ms) => setTimeout(read, ms));
      const poll = setInterval(read, 1500);
      read();
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        if (vv) vv.removeEventListener('resize', onResize);
        timers.forEach((t) => clearTimeout(t));
        clearInterval(poll);
        if (raf) cancelAnimationFrame(raf);
      };
    }
    const el = rootRef.current;
    if (!el) return undefined;
    let raf = 0;
    const measure = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = el.getBoundingClientRect();
        setWin(prev => (Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5 ? prev : { w: r.width, h: r.height }));
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [framed]);

  // Next-slide media warm-up (see main's output-preload fan-out): the console
  // announces the coming background while the current slide is still live.
  // Images decode into the cache; video is fetch-warmed only — a hidden
  // preloading decoder would steal cycles from the video actually playing.
  // Warmed URLs are tracked so rapid cueing can't pile up duplicate preload
  // links (each used to linger 30s).
  const warmedRef = useRef(null);
  if (!warmedRef.current) warmedRef.current = new Set();
  useEffect(() => {
    if (framed || !window.require) return undefined;
    const { ipcRenderer } = window.require('electron');
    const onPreload = (_e, p) => {
      try {
        if (!p || !p.url || warmedRef.current.has(p.url)) return;
        warmedRef.current.add(p.url);
        if (p.type === 'image') {
          const im = new Image();
          im.src = p.url;
        } else if (p.type === 'video') {
          const l = document.createElement('link');
          l.rel = 'preload';
          l.as = 'video';
          l.href = p.url;
          document.head.appendChild(l);
          setTimeout(() => { l.remove(); warmedRef.current.delete(p.url); }, 30000);
        } else {
          warmedRef.current.delete(p.url);
        }
      } catch {}
    };
    ipcRenderer.on('output-preload', onPreload);
    return () => ipcRenderer.removeListener('output-preload', onPreload);
  }, []);

  const slideStyle = cs.style || {};
  const transitionSpeed = cssSpeed(slideStyle.speed);
  const msNum = parseInt(transitionSpeed) || 400;
  const trans = slideStyle.transition || 'none';

  const transitionMap = {
    'fade': `fadeIn ${transitionSpeed} ease-in-out`,
    'slide-up': `slideUp ${transitionSpeed} ease-out`,
    'slide-down': `slideDown ${transitionSpeed} ease-out`,
    'slide-left': `slideLeft ${transitionSpeed} ease-out`,
    'slide-right': `slideRight ${transitionSpeed} ease-out`,
    'zoom-in': `zoomIn ${transitionSpeed} ease-out`,
    'zoom-out': `zoomOut ${transitionSpeed} ease-out`,
    'word-fade': `wordFade ${transitionSpeed} ease-in-out`,
    'word-rise': `wordRise ${transitionSpeed} ease-out`,
    'line-reveal': `lineReveal ${transitionSpeed} ease-out`,
    'type-on': `typeOn ${transitionSpeed} steps(${Math.max(4, Math.round(msNum / 40))})`,
    'char-cascade': `charCascade ${transitionSpeed} ease-out`,
    'pulse': `pulse ${transitionSpeed} ease-in-out`,
    'shimmer': `shimmer ${transitionSpeed} ease-in-out`,
    'blur-in': `blurIn ${transitionSpeed} ease-out`,
    'flip': `flipIn ${transitionSpeed} ease-out`,
    'bounce': `bounceIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
    'drop': `dropIn ${transitionSpeed} cubic-bezier(.34,1.56,.64,1)`,
    'sway': `swayIn ${transitionSpeed} ease-out`,
    'split': `splitIn ${transitionSpeed} ease-in-out`,
    'wipe-up': `wipeUp ${transitionSpeed} ease-out`,
    'spin': `spinIn ${transitionSpeed} ease-out`,
    'neon': `neonFlash ${transitionSpeed} linear`,
    'crossfade': `crossfadeIn ${transitionSpeed} ease-in-out`,
    'glitch': `glitchIn ${transitionSpeed} steps(12)`,
    'distort': `distortIn ${transitionSpeed} ease-out`,
    'zoom-blur': `zoomBlurIn ${transitionSpeed} ease-out`,
    'whip': `whipIn ${transitionSpeed} cubic-bezier(.52,.02,.24,1)`,
  };

  // Keyframe animation OR CSS transition on transform/opacity — never both.
  // Running them together double-drives the same properties and looks glitchy.
  let animStyle = { transition: `opacity ${transitionSpeed} ease-in-out, transform ${transitionSpeed} ease-in-out`, willChange: 'transform, opacity' };
  if (transitionMap[trans]) {
    animStyle = { animation: transitionMap[trans], willChange: 'transform, opacity' };
  }
  const bgType = slideStyle.backgroundType || 'color';
  const bgValue = slideStyle.backgroundValue || '#000';
  const bgKey = `${bgType}:${bgValue}`;
  const bgFade = 0.6;
  // Standby / clear: the incoming slide has no lyrics and no deck on it.
  const blankSlide = !cs.text && !cs.presentation;

  // Dev HUD flag: read once, never subscribed — enabling it takes an output
  // restart, which is exactly right for a wall (no surprise overlays live).
  const [perfOn] = useState(() => {
    try { return typeof localStorage !== 'undefined' && localStorage.getItem('kog_perf') === '1'; } catch { return false; }
  });

  // 1:1 projection: the 1280x720 design canvas — the exact picture the song
  // editor draws — is scaled uniformly to CONTAIN the frame and centred (see
  // VIEW SHAPE below). The BACKGROUND is a separate layer that covers the
  // whole viewport, cover-fit, so it fills every margin the contained design
  // leaves behind. Text and box proportions therefore always match the editor
  // canvas regardless of the physical display resolution or aspect: aspect
  // and resolution only resize the picture, never re-form it.
  //
  // Screen hardware (`config`, pushed per output window by main): 90°/270°
  // rotation swaps the LOGICAL viewport and rotates it back into the physical
  // window — vertical side-screens and ceiling-mounted monitors get the whole
  // frame, sideways, with no letterboxing.
  const cfg = config || {};
  const nrot = Number(cfg.rotation);
  const rot = nrot === 90 || nrot === 180 || nrot === 270 ? nrot : 0;
  const swap = rot === 90 || rot === 270;
  const pw = win.w;
  const ph = win.h;
  const vw = swap ? ph : pw;
  const vh = swap ? pw : ph;

  // FRAME: the projection is the SELECTED RATIO, fitted to the output window
  // and centered — nothing else shrinks it. The window itself is either
  // fullscreen (Native) or the exact pixel preset / LED region the operator
  // picked; either way the frame follows the real surface. Fill = edge to
  // edge on any surface; every named ratio is exact, whatever its shape is.
  // (A sized window on a bigger display has a black underlay in main, so the
  // desktop never shows around the picture.)
  const ratioOf = (v) => {
    // Accepts both shapes the app uses: "16:9" (an output aspect) and
    // "1900 / 1080" (a physical wall resolution, from wallAspect).
    const m = String(v || '').match(/^(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)$/);
    return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : 0;
  };
  const rawAspect = String(framed ? (frameAspect || '16:9') : (cfg.aspect || aspect) || '').toLowerCase();
  // AUTO = this window IS the frame: it takes the whole physical screen, so a
  // 4:3 projector, a 16:10 secondary monitor, a 21:9 LED wall and a rotated
  // portrait screen all get their full surface. A named ratio builds a frame
  // of exactly that shape — the picture's bounding box, NOT a visible letterbox:
  // the background still covers the whole window, so no bars can appear.
  // Either way this only decides the SIZE of the frame — never what is drawn
  // inside it (see VIEW SHAPE).
  const fill = !framed && (rawAspect === 'fill' || rawAspect === 'auto' || rawAspect === 'native' || rawAspect === '');
  const ar = ratioOf(framed ? (frameAspect || '16:9') : (cfg.aspect || aspect)) || 16 / 9;
  // THE FRAME — one helper owns the SIZE of the stage (aspectFrameInViewport):
  // Fill / Auto / Native takes the whole viewport, a named ratio (16:9, 4:3,
  // 21:9 …) becomes a centred bounding box of exactly that shape. This decides
  // how LARGE the picture gets and NOTHING else — what is drawn inside never
  // changes with it (see VIEW SHAPE), and on the real output the background
  // ignores the frame entirely and covers the viewport, so no aspect or
  // resolution setting can produce black bars around the picture.
  const { fw, fh, fx, fy } = aspectFrameInViewport(vw, vh, ar, fill);

  // VIEW SHAPE — ONE 1280x720 DESIGN CANVAS, ALWAYS. This is the exact picture
  // the song editor's canvas draws: same boxes, same fonts, same rules. The
  // frame may only SCALE that design and, on a screen wider than 16:9, widen
  // the space it is laid out in — the type is never stretched and nothing is
  // ever cropped. designCanvasInFrame stays the editor stage's fit
  // (LyricsCanvasEditor calls it verbatim), so the canvas is the 16:9
  // reference and the wall is that reference filling the whole screen.
  //
  // The wrapper below is an aspect-ratio BOUNDING BOX (cw x ch — the design's
  // own 16:9, sized in px and scaled with transform: scale) placed inside the
  // frame. Because the fit CONTAINS the frame and the frame never exceeds the
  // viewport (band ⊆ frame ⊆ viewport, locked by unit tests), the text layer
  // always fits entirely on screen — it can never be cropped by the screen at
  // any aspect ratio or resolution, only scaled and centred.
  //
  // Changing the output aspect ratio or the screen resolution therefore
  // changes the size of that picture and NOTHING else — no box is widened, no
  // rule moves, no font size is re-solved, no inner CSS is rewritten.
  //
  // It did not used to be this way: on any frame wider than 16:9 the canvas
  // was stretched sideways (kx) and every text box was widened with it. That
  // mutated the very numbers the font fitter runs on, so a cue in Fill resize
  // mode came out a fifth bigger on the wall than on the canvas, while the
  // title-card rules — fixed design px — never moved and no longer lined up
  // with the right-anchored slots beside them. The editor canvas is the
  // reference, so the canvas is now fixed and only `s` moves.
  //
  // Unmeasured framed cards (0x0 until ResizeObserver fires) come back with a
  // zero scale, so the card is empty for one frame — never NaN dimensions,
  // which React rejects in `width`.
  //
  // FILL, NOT LETTERBOX: on a frame wider than 16:9 the design SPACE widens
  // (designCanvasFilled → `stretch`) and every box spreads with it, so the
  // picture covers the whole screen — no hard bars at the sides, nothing
  // cropped off the corners of a title card, and no distorted letters. At 16:9
  // or narrower, stretch is exactly 1 and this is the same contain fit the
  // song editor's canvas uses, so the two surfaces still match 1:1.
  const { s, cw, ch, cx, cy, stretch } = designCanvasFilled(fw, fh, fx, fy);

  // Edge blending for multi-projector / LED walls: per-edge soft feather
  // (alpha ramp into the seam), per-edge overlap darkening (kills the hot
  // line where two projectors double up), and a gamma curve. All three are
  // off unless the operator enables them — with no blend config there is no
  // filter, no mask, no overlay at all, so the low-end boxes pay nothing.
  const blend = cfg.blend && cfg.blend.enabled ? cfg.blend : null;
  const feather = (blend && blend.feather) || {};
  const overlap = (blend && blend.overlap) || {};
  const gamma = blend ? (Number(blend.gamma) || 1) : 1;

  const featherBox = (edge, direction) => {
    const px = Number(feather[edge]) || 0;
    if (!blend || px <= 0) return { position: 'absolute', inset: 0 };
    const g = `linear-gradient(${direction}, rgba(0,0,0,0) 0px, rgba(0,0,0,1) ${px}px)`;
    return { position: 'absolute', inset: 0, maskImage: g, WebkitMaskImage: g };
  };
  const fL = featherBox('l', 'to right');
  const fR = featherBox('r', 'to left');
  const fT = featherBox('t', 'to bottom');
  const fB = featherBox('b', 'to top');

  const seamBox = (edge, style, background) => {
    const px = Number(overlap[edge]) || 0;
    if (!blend || px <= 0) return null;
    return <div key={`seam-${edge}`} style={{ ...style, background, pointerEvents: 'none' }} />;
  };
  const seams = [
    seamBox('l', { left: 0, top: 0, bottom: 0, width: Number(overlap.l) || 0 }, 'linear-gradient(to right, rgba(0,0,0,0.55), rgba(0,0,0,0))'),
    seamBox('r', { right: 0, top: 0, bottom: 0, width: Number(overlap.r) || 0 }, 'linear-gradient(to left, rgba(0,0,0,0.55), rgba(0,0,0,0))'),
    seamBox('t', { top: 0, left: 0, right: 0, height: Number(overlap.t) || 0 }, 'linear-gradient(to bottom, rgba(0,0,0,0.55), rgba(0,0,0,0))'),
    seamBox('b', { bottom: 0, left: 0, right: 0, height: Number(overlap.b) || 0 }, 'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))')
  ];

  return (
    <div
      data-kog-output=""
      ref={rootRef}
      style={{
        // FRAMED: a picture of the wall inside a card (the console's Live
        // Output card). Unframed: the wall itself, owning its whole window.
        position: framed ? 'relative' : 'absolute',
        ...(framed ? { width: '100%', height: '100%' } : { inset: 0, width: '100vw', height: '100vh' }),
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        background: '#000',
        // Live output never shows the mouse: the cursor over a projection is a
        // classic focus/cursor leak during a service.
        cursor: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Only the REAL output becomes a size container (its cqi/cqb media
        // layers need it). A framed preview card must NOT be size-contained —
        // size containment would let it collapse and letterbox.
        ...(framed ? {} : { containerType: 'size' }),
        textRendering: 'optimizeLegibility',
        WebkitFontSmoothing: 'antialiased'
      }}
    >
      {!framed && perfOn && <OutputPerfHud slideKey={cs.timestamp} fit={{ vw, vh, fw, fh, s, cw, ch, cx, cy }} />}
      {/* Reset root margins & hide window scrollbars — the WALL's own
          document. Never emitted in framed mode, or the card's rules would
          reach up into the console's own layout. */}
      {!framed && (
      <style>{`
        html, body, #root { 
          margin: 0 !important; 
          padding: 0 !important; 
          width: 100vw !important; 
          height: 100vh !important; 
          overflow: hidden !important; 
          background: #000 !important; 
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translateY(-30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideLeft { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideRight { from { opacity: 0; transform: translateX(-40px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }
        @keyframes zoomOut { from { opacity: 0; transform: scale(1.2); } to { opacity: 1; transform: scale(1); } }
        @keyframes wordFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes wordRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes lineReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
        @keyframes typeOn { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0% 0 0); } }
        @keyframes charCascade { 0% { opacity: 0; transform: translateY(8px) scale(0.9); } 100% { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes blurIn { from { opacity: 0; filter: blur(12px); } to { opacity: 1; filter: blur(0); } }
        @keyframes flipIn { from { opacity: 0; transform: perspective(700px) rotateX(85deg); } to { opacity: 1; transform: perspective(700px) rotateX(0); } }
        @keyframes bounceIn { 0% { opacity: 0; transform: scale(0.3); } 50% { opacity: 1; transform: scale(1.08); } 70% { transform: scale(0.94); } 100% { opacity: 1; transform: scale(1); } }
        @keyframes dropIn { 0% { opacity: 0; transform: translateY(-70px); } 60% { opacity: 1; transform: translateY(10px); } 80% { transform: translateY(-4px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes swayIn { 0% { opacity: 0; transform: translateX(-36px) rotate(-3deg); } 50% { opacity: 1; transform: translateX(10px) rotate(2deg); } 100% { opacity: 1; transform: translateX(0) rotate(0); } }
        @keyframes splitIn { 0% { opacity: 0; clip-path: inset(50% 0 50% 0); } 100% { opacity: 1; clip-path: inset(0 0 0 0); } }
        @keyframes wipeUp { 0% { clip-path: inset(100% 0 0 0); } 100% { clip-path: inset(0 0 0 0); } }
        @keyframes spinIn { 0% { opacity: 0; transform: rotate(-180deg) scale(0.5); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
        @keyframes neonFlash { 0% { opacity: 0; } 8% { opacity: 1; } 14% { opacity: 0.15; } 20% { opacity: 1; } 28% { opacity: 0.35; } 36% { opacity: 1; } 100% { opacity: 1; } }
      `}</style>
      )}

      {/* SONG BACKGROUND AUDIO (loops until the next slide changes it). The
          framed card must NOT play it — the wall carries the sound. */}
      {!framed && cs.audio ? (
        <audio key={cs.audio} src={cs.audio} autoPlay loop style={{ display: 'none' }} />
      ) : null}

      {/* Rotation stage: the logical viewport (swapped for 90°/270°) rotated
          into the physical window. With no rotation config this is an inert
          full-size box at inset 0 — pixel-identical to the flat layout. */}
      <div style={{
        position: 'absolute',
        width: vw,
        height: vh,
        left: (pw - vw) / 2,
        top: (ph - vh) / 2,
        transform: rot ? `rotate(${rot}deg)` : undefined,
        transformOrigin: 'center center',
        filter: gamma !== 1 ? 'url(#kogOutGamma)' : undefined
      }}>
        {/* Soft-edge feathering: one wrapper per edge, nested so edges
            intersect. No feather set = no mask applied = no cost. */}
        <div style={fL}><div style={fR}><div style={fT}><div style={fB}>
          {/* BACKGROUND — on the WALL this covers the ENTIRE logical viewport,
          never just the aspect frame: object-fit: cover by default (bgFitCss;
          an explicit per-slide fit still wins), so the media bleeds edge to
          edge and fills whatever margin the contained design leaves behind —
          a 16:9 selection on a 21:9 LED wall, Fill on an odd-shaped screen.
          Black bars are impossible around the live picture; only the DESIGN
          below letterboxes. A FRAMED card is different: it is a letterboxed
          PICTURE of the wall inside the console, so its background stays in
          the picture's frame (the card keeps its own chrome outside it). */}
      <AnimatePresence>
        <motion.div
          key={bgKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: bgFade }}
          style={{
            position: 'absolute',
            ...(framed ? { left: fx, top: fy, width: fw, height: fh } : { inset: 0 }),
            overflow: 'hidden',
            zIndex: 0
          }}
        >
          {/* The background media stays MOUNTED inside this wrapper: grading
              (mono / contrast / blur / zoom / tint) only changes the wrapper's
              CSS, so a looping background video is never restarted by a cue. */}
          <CinematicBackdrop bgFx={slideStyle.bg_fx}>
            {/* bgFit / bgDim come from the slide's media drawer in the song
                editor. Absent fields fall back to the historic look (cover,
                no wash), so old songs render exactly as before. */}
            {slideStyle.backgroundType === 'image' && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', background: `url("${String(slideStyle.backgroundValue || '').replace(/"/g, '%22')}") center / ${bgFitCss(slideStyle.bgFit)} no-repeat`, backgroundColor: '#000' }} />
            )}
            {slideStyle.backgroundType === 'video' && (
              <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', transform: 'translateZ(0)' }}>
                <BackgroundVideo
                  src={slideStyle.backgroundValue}
                  loop={slideStyle.bgLoop !== false}
                  muted={slideStyle.bgMuted !== false}
                  rate={Number(slideStyle.bgRate) || 1}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: bgFitCss(slideStyle.bgFit) }}
                />
              </div>
            )}
            {slideStyle.backgroundType === 'gradient' && !!slideStyle.backgroundValue && (
              <div style={{ position: 'absolute', inset: 0, background: slideStyle.backgroundValue }} />
            )}
            {slideStyle.backgroundType === 'animated' && (
              <AnimatedBg value={slideStyle.backgroundValue} k={1} />
            )}
            {slideStyle.backgroundType === 'color' && (
              <div style={{ position: 'absolute', inset: 0, background: slideStyle.backgroundValue || '#000' }} />
            )}
            {/* Dimmer sits ABOVE the graded media and BELOW the lyrics — it
                darkens the picture only, never the words. */}
            {Number(slideStyle.bgDim) > 0 && (
              <div style={{ position: 'absolute', inset: 0, background: '#000', opacity: Math.min(1, Number(slideStyle.bgDim) / 100), pointerEvents: 'none' }} />
            )}
          </CinematicBackdrop>
        </motion.div>
      </AnimatePresence>

      {/* The design canvas, scaled to FILL the frame — the same picture, the
          same proportions and the same box geometry the song editor's canvas
          draws, with the layout space widened (never the type) when the screen
          is wider than 16:9, so the picture reaches the screen edges with no
          bars and no crop. Scale lives on the OUTER div; transition animation
          on the INNER div. Keyframes that animate `transform` must not share an
          element with the viewport scale, or every transition wipes the scale
          mid-flight. */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: cw, height: ch, zIndex: 1, overflow: 'hidden' }}>
        <div style={{
          // 1280 x stretch: the design space the boxes are laid out in. On a
          // 16:9 or narrower screen stretch is 1 and this is the plain 1280
          // canvas; on a wider screen the boxes get the extra width as spread,
          // never as bigger type.
          width: 1280 * stretch,
          height: 720,
          position: 'relative',
          transform: `scale(${s})`,
          transformOrigin: 'top left'
        }}>
          {/* Lyrics/deck/timer layer. Dissolve the outgoing layer ONLY when the
              incoming slide carries no text (Service Order standby, clear) —
              that's what turns a song switch into a crossfade instead of a
              hard cut. When new text is coming in the old layer leaves at
              once, so cue-to-cue stays crisp with no two layouts ghosting
              over each other. The exit lives on this motion wrapper while
              animStyle (CSS keyframes) stays on the inner div, so nothing
              drives opacity twice on the same element. */}
          <AnimatePresence custom={blankSlide} initial={false}>
            <motion.div
              key={cs.timestamp}
              exit="out"
              variants={{ out: (fadeOut) => ({ opacity: 0, transition: { duration: fadeOut ? 0.6 : 0 } }) }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <div style={{ width: '100%', height: '100%', position: 'relative', ...(cs.presentation ? animStyle : null) }}>
                {!cs.timer && cs.video && cs.video.url && cs.video.action !== 'stop' ? (
                  // Booth video live: same aspect-frame fill as the countdown
                  // (edge-to-edge on ultrawide, identity on 16:9), muted —
                  // the booth carries the sound.
                  <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', overflow: 'hidden', background: '#000', transform: 'translateZ(0)' }}>
                    <LiveVideo video={cs.video} />
                  </div>
                ) : cs.presentation && cs.presentation.slide ? (
                  // A deck is a 1280x720 document of its own — on a widened
                  // wall it stays centred at its own size instead of being
                  // dragged to the left edge of the extra space.
                  <div style={{ position: 'absolute', left: (1280 * (stretch - 1)) / 2, top: 0, width: 1280, height: 720 }}>
                    <PresentationSlide slide={cs.presentation.slide} keepAlive />
                  </div>
                ) : (cs.text || (slideStyle.texts && slideStyle.texts.length)) ? (
                  (() => {
                    const isTitleSlide = cs.label === 'Song Title';
                    const st = slideStyle.lyric || { font: slideStyle.fontFamily || 'system-ui, sans-serif', size: DEFAULT_LYRIC_SIZE, lineHeight: 1.05, align: slideStyle.textAlign || 'center', color: slideStyle.fontColor || '#ffffff', caseMode: 'none', isTitle: isTitleSlide };
                    st.isTitle = isTitleSlide;
                    // SCRIPTURE: templates that put the reference in a corner
                    // draw it as its OWN element (ScriptureRef), so it comes
                    // back OUT of the text here. Default keeps it inline, and
                    // payloads from older builds — which always carried it as
                    // the first line — strip cleanly too via cs.title.
                    const isBible = !!(cs.meta && cs.meta.kind === 'bible');
                    const refPos = isBible ? scriptureRefPos(cs.meta && cs.meta.template) : null;
                    const body = isBible && refPos !== 'inline'
                      ? stripScriptureRef(cs.text, (cs.meta && cs.meta.ref) || cs.title)
                      : cs.text;
                    // LED-WALL LIFT: the operator can raise every lyric box at
                    // once so a band standing in front of the bottom of the wall
                    // never covers the words (default 0 = the wall sits exactly
                    // where the editor canvas puts it). SlideTextLayers applies
                    // it, on top of the box's own y — there is no second box
                    // computed here, so the wall and the canvas read the SAME
                    // rectangle off the SAME style.
                    const artist = cs.artist || '';
                    return (
                      <>
                        {/* TITLE CARD FIRST — the chosen card's rules and
                            artist/event/venue lines are drawn UNDER the words,
                            exactly where the song editor's canvas puts them (a
                            rule crossing a headline must read as a rule behind
                            it, never a line struck through it). Classic has no
                            chrome, so it keeps the legacy "Song By" corner line
                            exactly as it always looked. */}
                        {isTitleSlide && (
                          <>
                            <TitleCardChrome card={st.card} artist={artist} event={st.cardEvent} venue={st.cardVenue} stretch={stretch} />
                            {titleCardIsClassic(st.card) && artist && (
                              <div style={{ position: 'absolute', bottom: 20, right: 24 * stretch, fontFamily: st.font, fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.03em', textShadow: '0 2px 8px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
                                Song By: {artist}
                              </div>
                            )}
                          </>
                        )}
                        {/* The slide's text: the main lyric box plus every
                            extra text box on it — ONE renderer, at the SAME
                            box coordinates the editor canvas uses (no aspect
                            stretch, see VIEW SHAPE), so the wall is a true
                            picture of the canvas. */}
                        <SlideTextLayers style={slideStyle} text={body} st={st} lift={lift} stretch={stretch} animate animKey={cs.timestamp} />
                        {isBible && (
                          <ScriptureRef meta={cs.meta} title={cs.title} color={st.color} font={st.font} templateId={cs.meta && cs.meta.template} stretch={stretch} />
                        )}
                      </>
                    );
                  })()
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
          {/* CINEMATIC PASS: grain / static / scanlines / glitch bands / flicker
              / scratches / vignette, above the words but below message overlay
              and remote ink. Pointer-transparent and CSS-only. */}
          <CinematicOverlay fx={slideStyle.fx} zIndex={2} />
          {/* MESSAGE OVERLAY: audience text above everything in the design
              canvas (sermon deck included) � own lifecycle, own fade, never
              remounted by slide pushes. */}
          <AnimatePresence>
            {overlayOnAir(overlay) ? (
              <motion.div key={overlay.stamp || 'overlay'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <OverlayFace overlay={overlay} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>

          {/* COUNTDOWN: fills the physical wall edge to edge (the same shape
              the countdown preview box takes), so the timer never sits inside
              a letterboxed ratio frame — matching the wall is what the timer
              is for. What is outside it is the root's black, never the Windows
              desktop. Type is sized by viewport height, identical on 16:9. */}
          <AnimatePresence>
            {cs.timer && (
              <motion.div key="countdown-live" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.6 }} style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: '#000', zIndex: 1 }}>
                <TimerFace timer={cs.timer} scale={vh / 720} surface={timerSurface} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* REMOTE DRAW OVERLAY: phone highlighter strokes above every content
              layer (lyrics + countdown), below nothing — pointer-transparent,
              stretched to any wall. Cleared by Clear All. */}
          {Array.isArray(draw) && draw.length > 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none' }}>
              <DrawOverlay strokes={draw} />
            </div>
          )}

          {/* Seam overlap: a darkening band where two projectors' images
              double up on a blended wall (the feather handles the fade;
              this kills the hot line at the seam). */}
          {seams}
        </div></div></div></div>
      </div>

      {/* Gamma curve correction (feFuncR/G/B, sRGB): 1.00 = off. Rendered
          only when a blend sets it — no filter, no per-frame shader cost. */}
      {gamma !== 1 && (
        <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }}>
          <defs>
            <filter id="kogOutGamma" colorInterpolationFilters="sRGB">
              <feComponentTransfer>
                <feFuncR type="gamma" amplitude="1" exponent={gamma} offset="0" />
                <feFuncG type="gamma" amplitude="1" exponent={gamma} offset="0" />
                <feFuncB type="gamma" amplitude="1" exponent={gamma} offset="0" />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
      )}
    </div>
  );
}
