import React from 'react';
import {
  normalizeFx,
  normalizeBgFx,
  bgFxFilter,
  bgFxTransform,
  textFxStyle,
  GRAIN_TEXTURE,
  NOISE_TEXTURE,
  GRUNGE_TEXTURE,
} from '../lib/cinematic';

/**
 * CINEMATIC BACKDROP — grades the photo/video UNDER the words.
 *
 * It never owns the media itself: children (image / video / gradient / animated
 * background) stay mounted exactly as before, and only the filter + zoom of
 * this wrapper change. That is what keeps a background video playing across
 * lyric changes — the <video> is not remounted by an effect tweak.
 */
export function CinematicBackdrop({ bgFx, children, style }) {
  const b = normalizeBgFx(bgFx);
  const hasTint = b.tintOpacity > 0;
  const hasVignette = b.vignette > 0;
  const hasOverlay = b.overlay !== 'none';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: bgFxFilter(b),
          transform: bgFxTransform(b),
          transformOrigin: 'center center',
          willChange: b.zoom !== 100 || bgFxFilter(b) !== 'none' ? 'transform, filter' : undefined,
        }}
      >
        {children}
      </div>
      {hasOverlay && <TextureOverlay type={b.overlay} opacity={b.overlayOpacity / 100} />}
      {hasTint && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: b.tint,
            opacity: b.tintOpacity / 100,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
      )}
      {hasVignette && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 28%, rgba(0,0,0,0.92) 100%)',
            opacity: (b.vignette / 100) * 0.9,
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  );
}

function TextureOverlay({ type, opacity }) {
  const base = {
    position: 'absolute',
    inset: 0,
    opacity,
    pointerEvents: 'none',
  };
  if (type === 'grunge') {
    return (
      <div
        aria-hidden="true"
        style={{
          ...base,
          backgroundImage: `${GRUNGE_TEXTURE}, radial-gradient(ellipse at 22% 18%, rgba(255,255,255,0.16), transparent 52%), radial-gradient(ellipse at 78% 82%, rgba(0,0,0,0.55), transparent 58%)`,
          backgroundSize: '420px 420px, 100% 100%, 100% 100%',
          mixBlendMode: 'overlay',
        }}
      />
    );
  }
  if (type === 'paper') {
    return (
      <div
        aria-hidden="true"
        style={{
          ...base,
          backgroundImage: `${GRAIN_TEXTURE}, linear-gradient(120deg, rgba(226,208,175,0.35), rgba(120,100,75,0.12))`,
          backgroundSize: '180px 180px, 100% 100%',
          mixBlendMode: 'soft-light',
        }}
      />
    );
  }
  if (type === 'dust') {
    return (
      <div
        aria-hidden="true"
        style={{
          ...base,
          backgroundImage: `${NOISE_TEXTURE}, radial-gradient(circle at 30% 40%, rgba(255,255,255,0.18), transparent 24%), radial-gradient(circle at 74% 62%, rgba(255,255,255,0.12), transparent 20%)`,
          backgroundSize: '140px 140px, 100% 100%, 100% 100%',
          mixBlendMode: 'screen',
        }}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      style={{
        ...base,
        backgroundImage: `${GRUNGE_TEXTURE}, radial-gradient(ellipse at center, rgba(0,0,0,0) 24%, rgba(0,0,0,0.96) 100%)`,
        backgroundSize: '420px 420px, 100% 100%',
        mixBlendMode: 'multiply',
      }}
    />
  );
}

/**
 * CINEMATIC OVERLAY — the full-frame texture pass (grain, static, scanlines,
 * glitch bands, flicker, scratches, vignette). Pure CSS, pointer-transparent,
 * and it renders NOTHING for a cue whose effects are all zero.
 */
export function CinematicOverlay({ fx, zIndex = 2, style }) {
  const f = normalizeFx(fx);
  const active = f.grain > 0 || f.noise > 0 || f.scanlines > 0 || f.rgbSplit > 0
    || f.glitch > 0 || f.flicker > 0 || f.scratches > 0 || f.vignette > 0;
  if (!active) return null;
  const sp = Math.max(0.2, f.speed);
  const grainDur = (0.9 / sp).toFixed(2);
  const noiseDur = (0.22 / sp).toFixed(2);
  const bandDur = (1.8 / sp).toFixed(2);
  return (
    <div
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, zIndex, pointerEvents: 'none', overflow: 'hidden', ...style }}
    >
      {f.grain > 0 && (
        <div
          style={{
            position: 'absolute', inset: '-15%',
            backgroundImage: GRAIN_TEXTURE,
            backgroundSize: '180px 180px',
            opacity: (f.grain / 100) * 0.5,
            mixBlendMode: 'overlay',
            animation: `kogGrain ${grainDur}s steps(6) infinite`,
            willChange: 'transform',
          }}
        />
      )}
      {f.noise > 0 && (
        <div
          style={{
            position: 'absolute', inset: '-8%',
            backgroundImage: NOISE_TEXTURE,
            backgroundSize: '140px 140px',
            opacity: (f.noise / 100) * 0.34,
            mixBlendMode: 'screen',
            animation: `kogNoise ${noiseDur}s steps(4) infinite`,
            willChange: 'background-position, transform',
          }}
        />
      )}
      {f.scanlines > 0 && (
        <div
          style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.55) 0px, rgba(0,0,0,0.55) 1px, rgba(255,255,255,0) 1px, rgba(255,255,255,0) 3px)',
            opacity: (f.scanlines / 100) * 0.4,
            mixBlendMode: 'multiply',
          }}
        />
      )}
      {f.rgbSplit > 0 && (
        <div
          style={{
            position: 'absolute', inset: 0,
            boxShadow: `inset ${(f.rgbSplit / 100) * 22}px 0 ${(f.rgbSplit / 100) * 60}px -${(f.rgbSplit / 100) * 30}px rgba(255,32,90,0.55), inset -${(f.rgbSplit / 100) * 22}px 0 ${(f.rgbSplit / 100) * 60}px -${(f.rgbSplit / 100) * 30}px rgba(40,225,255,0.55)`,
            mixBlendMode: 'screen',
          }}
        />
      )}
      {f.vignette > 0 && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0) 32%, rgba(0,0,0,0.9) 100%)',
            opacity: (f.vignette / 100) * 0.85,
          }}
        />
      )}
      {f.glitch > 0 && (
        <div style={{ position: 'absolute', inset: 0, opacity: f.glitch / 100 }}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: '-6%',
                width: '112%',
                top: `${8 + i * 24}%`,
                height: `${3 + (i % 2) * 4}%`,
                background: i % 2
                  ? 'linear-gradient(90deg, rgba(255,30,80,0.20), rgba(255,255,255,0.12), rgba(40,220,255,0.20))'
                  : 'linear-gradient(90deg, rgba(40,220,255,0.22), rgba(255,255,255,0.10), rgba(255,30,80,0.20))',
                mixBlendMode: 'screen',
                animation: `kogGlitchBand ${bandDur}s steps(4) infinite`,
                animationDelay: `${(i * 0.37).toFixed(2)}s`,
                willChange: 'transform, opacity',
              }}
            />
          ))}
        </div>
      )}
      {f.flicker > 0 && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: '#000',
            '--kog-flicker': `${((f.flicker / 100) * 0.55).toFixed(3)}`,
            animation: `kogFlicker ${(1.2 / sp).toFixed(2)}s steps(1) infinite`,
            willChange: 'opacity',
          }}
        />
      )}
      {f.scratches > 0 && (
        <div
          style={{
            position: 'absolute', inset: '-5%',
            backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0) 0px, rgba(255,255,255,0) 96%, rgba(255,255,255,0.22) 96%, rgba(255,255,255,0.22) 97%, rgba(255,255,255,0) 97%, rgba(255,255,255,0) 100%)',
            backgroundSize: '147px 100%',
            opacity: (f.scratches / 100) * 0.4,
            mixBlendMode: 'screen',
            animation: `kogScratch ${(5 / sp).toFixed(2)}s linear infinite`,
            willChange: 'transform',
          }}
        />
      )}
    </div>
  );
}

/**
 * CINEMATIC TEXT — the text wrapper that carries RGB split and jitter. Kept as
 * a sibling wrapper around the lyric layers so it never touches the shared
 * layout/caret tree inside LyricsBlock.
 */
export function CinematicText({ fx, children, style }) {
  return <div style={{ position: 'absolute', inset: 0, ...textFxStyle(fx), ...style }}>{children}</div>;
}
