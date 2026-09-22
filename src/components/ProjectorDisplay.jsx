import React, { useState, useEffect } from 'react';
import { renderLyricsLayout } from '../lib/lyrics';
import { cssSpeed } from '../lib/constants';
import PresentationSlide from './PresentationSlide';
import { AnimatePresence, motion } from 'motion/react';

export default function ProjectorDisplay({ currentSlide, C, aspect }) {
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });

  useEffect(() => {
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

  // 1:1 projection: the 1280x720 design canvas (background + lyrics together)
  // is scaled uniformly to CONTAIN the window and centered. Letterbox bars fall
  // OUTSIDE the canvas, so text/box/background proportions always match the
  // editor canvas regardless of the physical display resolution or aspect.
  const s = Math.min(win.w / 1280, win.h / 720);
  const cw = 1280 * s;
  const ch = 720 * s;
  const cx = (win.w - cw) / 2;
  const cy = (win.h - ch) / 2;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      width: '100vw',
      height: '100vh',
      margin: 0,
      padding: 0,
      overflow: 'hidden',
      background: '#000',
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

      {/* Fullscreen background: fills the entire window (no letterbox/border).
          Content stays on a centered 16:9 canvas so text proportions match the editor. */}
      <AnimatePresence>
        <motion.div
          key={bgKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: bgFade }}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }}
        >
          {slideStyle.backgroundType === 'image' && (
            <div style={{ position: 'absolute', inset: 0, background: `url(${slideStyle.backgroundValue}) center/cover no-repeat` }} />
          )}
          {slideStyle.backgroundType === 'video' && (
            <video src={slideStyle.backgroundValue} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
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
          <div key={currentSlide.timestamp} style={{ width: '100%', height: '100%', position: 'relative', ...animStyle }}>
            {currentSlide.presentation && currentSlide.presentation.slide ? (
              <PresentationSlide slide={currentSlide.presentation.slide} />
            ) : currentSlide.text ? (
              (() => {
                const isTitleSlide = currentSlide.label === 'Song Title';
                const st = slideStyle.lyric || { font: slideStyle.fontFamily || 'system-ui, sans-serif', size: 110, lineHeight: 1.05, align: slideStyle.textAlign || 'center', color: slideStyle.fontColor || '#ffffff', caseMode: 'none', isTitle: isTitleSlide };
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
        </div>
      </div>
    </div>
  );
}