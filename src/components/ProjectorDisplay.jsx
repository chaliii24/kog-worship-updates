import React, { useState, useEffect } from 'react';
import { renderLyricsLayout, DEFAULT_LYRIC_SIZE } from '../lib/lyrics';
import { cssSpeed } from '../lib/constants';
import PresentationSlide from './PresentationSlide';
import { BackgroundVideo } from '../lib/perf';
import { AnimatePresence, motion } from 'motion/react';

export default function ProjectorDisplay({ currentSlide, C, aspect, config }) {
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });

  // rAF-throttled: while a windowed output is dragged, resize fires ~60x/s and
  // each one re-ran the whole lyrics layout. On an i3 that is a visible stutter
  // for the duration of the drag; collapsing to one measurement per frame costs
  // nothing visually (the scale updates on the next paint anyway).
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setWin({ w: window.innerWidth, h: window.innerHeight });
      });
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const slideStyle = currentSlide.style || {};
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
  };

  // Keyframe animation OR CSS transition on transform/opacity — never both.
  // Running them together double-drives the same properties and looks glitchy.
  let animStyle = { transition: `opacity ${transitionSpeed} ease-in-out, transform ${transitionSpeed} ease-in-out` };
  if (transitionMap[trans]) {
    animStyle = { animation: transitionMap[trans] };
  }
  const bgType = slideStyle.backgroundType || 'color';
  const bgValue = slideStyle.backgroundValue || '#000';
  const bgKey = `${bgType}:${bgValue}`;
  const bgFade = 0.6;
  // Standby / clear: the incoming slide has no lyrics and no deck on it.
  const blankSlide = !currentSlide.text && !currentSlide.presentation;

  // 1:1 projection: the 1280x720 design canvas (background + lyrics together)
  // is scaled uniformly to CONTAIN the aspect frame (see VIEW SHAPE below)
  // and centered. Letterbox bars fall OUTSIDE the canvas, so text/box/
  // background proportions always match the editor canvas regardless of the
  // physical display resolution or aspect.
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

  // VIEW SHAPE: the output composes inside a frame of the selected aspect
  // ratio, centered in the window — so changing the ratio on the console
  // visibly changes the PHYSICAL projection (the bars are the root's black,
  // exactly like the preview's aspect wrapper). Per-output config wins over
  // the global setting; a window whose own ratio already matches within 2%
  // snaps to full-bleed, so a 16:9 projector never shows a hairline seam.
  const ratioOf = (v) => {
    const m = String(v || '').match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    return m && Number(m[2]) ? Number(m[1]) / Number(m[2]) : 0;
  };
  const ar = ratioOf(cfg.aspect) || ratioOf(aspect) || 16 / 9;
  // 16:9 is FIT-TO-SCREEN: it always fills the window edge to edge. A panel
  // whose reported ratio drifts (16:10 laptop, EDID rounding, DPI division)
  // must NEVER show a letterbox while the operator has 16:9 selected — the
  // background simply runs to all four edges, exactly as it did before the
  // aspect frame existed. Every OTHER ratio is an explicit shape request and
  // letterboxes on purpose (that is what the control is for).
  const isFit = Math.abs(ar - 16 / 9) < 0.01;
  const snap = isFit || Math.abs(vw / vh - ar) / ar <= 0.02;
  const fw = snap ? vw : Math.min(vw, vh * ar);
  const fh = snap ? vh : Math.min(vh, vw / ar);
  const fx = (vw - fw) / 2;
  const fy = (vh - fh) / 2;

  const s = Math.min(fw / 1280, fh / 720);
  const cw = 1280 * s;
  const ch = 720 * s;
  const cx = fx + (fw - cw) / 2;
  const cy = fy + (fh - ch) / 2;

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
    <div data-kog-output="" style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      background: '#000',
      // Live output never shows the mouse: the cursor over a projection is a
      // classic focus/cursor leak during a service.
      cursor: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Reset root margins & hide window scrollbars */}
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

      {/* SONG BACKGROUND AUDIO (loops until the next slide changes it) */}
      {currentSlide?.audio ? (
        <audio key={currentSlide.audio} src={currentSlide.audio} autoPlay loop style={{ display: 'none' }} />
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
          {/* Background: fills the ASPECT FRAME (fx/fy/fw/fh), not the raw
          window — a 4:3 projection on a 16:9 display gets black pillarbox
          bars, mirroring the preview's aspect wrapper 1:1. */}
      <AnimatePresence>
        <motion.div
          key={bgKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: bgFade }}
          style={{ position: 'absolute', left: fx, top: fy, width: fw, height: fh, overflow: 'hidden', zIndex: 0 }}
        >
          {slideStyle.backgroundType === 'image' && (
            <div style={{ position: 'absolute', inset: 0, background: `url(${slideStyle.backgroundValue}) center/cover no-repeat` }} />
          )}
          {slideStyle.backgroundType === 'video' && (
            <BackgroundVideo src={slideStyle.backgroundValue} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
          {slideStyle.backgroundType === 'color' && (
            <div style={{ position: 'absolute', inset: 0, background: slideStyle.backgroundValue || '#000' }} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Design canvas scaled to CONTAIN the window — text stays uncropped.
          Scale lives on the OUTER div; transition animation on the INNER div.
          Keyframes that animate `transform` must not share an element with
          the viewport scale, or every transition wipes the scale mid-flight. */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: cw, height: ch, zIndex: 1, overflow: 'hidden' }}>
        <div style={{
          width: 1280,
          height: 720,
          position: 'relative',
          transform: `scale(${s})`,
          transformOrigin: 'top left'
        }}>
          {/* Lyrics/deck layer. Dissolve the outgoing layer ONLY when the
              incoming slide carries no text (Service Order standby, clear) —
              that's what turns a song switch into a crossfade instead of a
              hard cut. When new text is coming in the old layer leaves at
              once, so cue-to-cue stays crisp with no two layouts ghosting
              over each other. The exit lives on this motion wrapper while
              animStyle (CSS keyframes) stays on the inner div, so nothing
              drives opacity twice on the same element. */}
          <AnimatePresence custom={blankSlide} initial={false}>
            <motion.div
              key={currentSlide.timestamp}
              exit="out"
              variants={{ out: (fadeOut) => ({ opacity: 0, transition: { duration: fadeOut ? 0.6 : 0 } }) }}
              style={{ position: 'absolute', inset: 0 }}
            >
              <div style={{ width: '100%', height: '100%', position: 'relative', ...animStyle }}>
                {currentSlide.presentation && currentSlide.presentation.slide ? (
                  <PresentationSlide slide={currentSlide.presentation.slide} keepAlive />
                ) : currentSlide.text ? (
                  (() => {
                    const isTitleSlide = currentSlide.label === 'Song Title';
                    const st = slideStyle.lyric || { font: slideStyle.fontFamily || 'system-ui, sans-serif', size: DEFAULT_LYRIC_SIZE, lineHeight: 1.05, align: slideStyle.textAlign || 'center', color: slideStyle.fontColor || '#ffffff', caseMode: 'none', isTitle: isTitleSlide };
                    st.isTitle = isTitleSlide;
                    const box = st.box || { x: 80, y: isTitleSlide ? 140 : 100, w: 1120, h: isTitleSlide ? 440 : 480 };
                    const artist = currentSlide.artist || '';
                    return (
                      <>
                        <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, transform: box.angle ? `rotate(${box.angle}deg)` : undefined, transformOrigin: 'center center' }}>
                          {renderLyricsLayout(currentSlide.text, st, box)}
                        </div>
                        {isTitleSlide && artist && (
                          <div style={{ position: 'absolute', bottom: 20, right: 24, fontFamily: st.font, fontSize: 24, fontWeight: 600, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.03em', textShadow: '0 2px 8px rgba(0,0,0,0.8)', whiteSpace: 'nowrap' }}>
                            Song By: {artist}
                          </div>
                        )}
                      </>
                    );
                  })()
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

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