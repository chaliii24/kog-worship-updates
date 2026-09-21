import React, { useState, useEffect } from 'react';
import { renderLyricsLayout } from '../lib/lyrics';
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
  const transitionSpeed = slideStyle.speed || '400ms';
  let animStyle = { transition: `opacity ${transitionSpeed} ease-in-out, transform ${transitionSpeed} ease-in-out` };
  if (slideStyle.transition === 'fade') animStyle = { ...animStyle, animation: `fadeIn ${transitionSpeed}` };
  if (slideStyle.transition === 'slide') animStyle = { ...animStyle, animation: `slideUp ${transitionSpeed}` };
  const bgType = slideStyle.backgroundType || 'color';
  const bgValue = slideStyle.backgroundValue || '#000';
  const bgKey = `${bgType}:${bgValue}`;
  const bgFade = 0.6;

  // Adaptive projection: the 1280x720 design canvas fills the chosen-aspect
  // region inside whatever window/display resolution it lands on (cover).
  const [aw, ah] = String(aspect || '16:9').split(':').map(Number);
  const A = aw / ah;
  let RW = win.h * A;
  let RH = win.h;
  if (RW > win.w) { RW = win.w; RH = win.w / A; }
  const rx = (win.w - RW) / 2;
  const ry = (win.h - RH) / 2;
  const s = Math.max(RW / 1280, RH / 720);
  const cw = 1280 * s;
  const ch = 720 * s;
  const cx = rx + (RW - cw) / 2;
  const cy = ry + (RH - ch) / 2;

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
      `}</style>

      {/* Background layer cross-fades whenever the background changes */}
      <AnimatePresence>
        <motion.div
          key={bgKey}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: bgFade }}
          style={{ position: 'absolute', inset: 0, zIndex: 0, overflow: 'hidden' }}
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

      {/* SONG BACKGROUND AUDIO (loops until the next slide changes it) */}
      {currentSlide?.audio ? (
        <audio key={currentSlide.audio} src={currentSlide.audio} autoPlay loop style={{ display: 'none' }} />
      ) : null}

      {/* Adaptive design canvas scaled to fill the aspect region */}
      <div style={{ position: 'absolute', left: cx, top: cy, width: cw, height: ch, zIndex: 1, overflow: 'hidden' }}>
        <div key={currentSlide.timestamp} style={{
          width: 1280,
          height: 720,
          position: 'relative',
          transform: `scale(${s})`,
          transformOrigin: 'top left',
          ...animStyle
        }}>
          {currentSlide.presentation && currentSlide.presentation.slide ? (
            <PresentationSlide slide={currentSlide.presentation.slide} />
          ) : currentSlide.text ? (
            (() => {
              const st = slideStyle.lyric || { font: slideStyle.fontFamily || 'system-ui, sans-serif', size: 110, lineHeight: 1.05, align: slideStyle.textAlign || 'center', color: slideStyle.fontColor || '#ffffff', caseMode: 'none' };
              const box = st.box || { x: 80, y: 100, w: 1120, h: 480 };
              const artist = currentSlide.artist || '';
              const isTitleSlide = currentSlide.label === 'Song Title';
              return (
                <>
                  <div style={{ position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h }}>
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
  );
}