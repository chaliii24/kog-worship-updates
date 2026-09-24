import React from 'react';
import { resolveRects, visibleElements } from '../lib/backgrounds';

// Renders a single 16:9 presentation slide. Shared by the editor preview and the
// live projector output (ProjectorDisplay), so what you build is what shows.
// Every text element is absolutely positioned from resolveRects(slide), which
// merges the layout defaults with the user's draggable slide.pos overrides.
export default function PresentationSlide({ slide, width = 1280, height = 720 }) {
  if (!slide) return null;
  const s = slide;
  const bg = s.bg || {};
  const bgType = bg.type || 'color';
  const bgValue = bg.value || '#0B0F19';
  const textColor = s.textColor || '#FFFFFF';
  const align = s.align || 'left';
  const font = s.font || "'CMG Sans', system-ui, sans-serif";
  const bullets = (Array.isArray(s.bullets) ? s.bullets : []).filter(b => String(b).trim() !== '');
  const rects = resolveRects(s);

  const animName = s.transition === 'slide' ? 'psSlideUp' : s.transition === 'zoom' ? 'psZoom' : s.transition === 'none' ? 'none' : 'psFade';
  const anim = animName === 'none' ? {} : { animation: `${animName} 0.5s ease both` };

  const bgStyle = bgType === 'gradient'
    ? { backgroundImage: bgValue }
    : { background: bgValue };

  const image = s.image
    ? <img src={s.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    : null;

  return (
    <div style={{ position: 'relative', width, height, overflow: 'hidden', background: '#000', fontFamily: font }}>
      <style>{`
        @keyframes psFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes psSlideUp { from { opacity: 0; transform: translateY(34px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes psZoom { from { opacity: 0; transform: scale(1.06); } to { opacity: 1; transform: scale(1); } }
      `}</style>

      {/* Background */}
      <div style={{ position: 'absolute', inset: 0, ...bgStyle }}>
        {bgType === 'image' && bgValue && (
          <img src={bgValue} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {bgType === 'video' && bgValue && (
          <video src={bgValue} autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      {/* Layout image (not a background) */}
      {s.layout === 'full-image' && (
        <div style={{ position: 'absolute', inset: 0 }}>
          {image}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.15) 45%, rgba(0,0,0,0) 70%)' }} />
        </div>
      )}
      {(s.layout === 'image-left' || s.layout === 'image-right') && (
        <div style={{ position: 'absolute', top: 0, [s.layout === 'image-left' ? 'left' : 'right']: 0, width: '46%', height: '100%' }}>
          {image || <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.06)' }} />}
        </div>
      )}

      {/* Text boxes (keyed so the transition replays per slide) */}
      <div key={s.id || s.title} style={{ position: 'absolute', inset: 0, ...anim }}>
        {visibleElements(s).map(key => (
          <Box key={key} rect={rects[key]} align={(rects[key] && rects[key].align) || align}>
            {renderElement(key, { s, bullets, textColor, align: (rects[key] && rects[key].align) || align })}
          </Box>
        ))}
      </div>
    </div>
  );
}

function Box({ rect, align, children }) {
  const justify = rect.v === 'center' ? 'center' : 'flex-start';
  return (
    <div style={{
      position: 'absolute',
      left: rect.x,
      top: rect.y,
      width: rect.w,
      height: rect.h,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: justify,
      overflow: 'hidden'
    }}>
      <div style={{ width: '100%', textAlign: align }}>{children}</div>
    </div>
  );
}

function Bullets({ bullets, textColor, bodySize, align }) {
  const justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: Math.max(8, bodySize * 0.45) }}>
      {bullets.map((b, i) => (
        <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: justify, color: textColor, fontSize: bodySize, lineHeight: 1.3, textAlign: align }}>
          <span style={{ opacity: 0.85, flexShrink: 0 }}>•</span>
          <span>{b}</span>
        </li>
      ))}
    </ul>
  );
}

function renderElement(key, { s, bullets, textColor, align }) {
  const titleSize = s.titleSize || 42;
  const bodySize = s.bodySize || 24;
  if (key === 'title') {
    return <div style={{ fontSize: titleSize, fontWeight: 800, color: textColor, lineHeight: 1.12, letterSpacing: 0.2 }}>{s.title}</div>;
  }
  if (key === 'subtitle') {
    return <div style={{ fontSize: Math.max(16, bodySize * 0.85), color: textColor, opacity: 0.85, lineHeight: 1.3 }}>{s.subtitle}</div>;
  }
  if (key === 'bullets') {
    return <Bullets bullets={bullets} textColor={textColor} bodySize={bodySize} align={align} />;
  }
  const bodyText = s.body || (s.layout === 'quote' ? s.title : '');
  const quote = s.layout === 'quote';
  return <div style={{ fontSize: quote ? titleSize : bodySize, fontStyle: quote ? 'italic' : 'normal', color: textColor, lineHeight: 1.35 }}>{bodyText}</div>;
}
