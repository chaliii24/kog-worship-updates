import React from 'react';
import { animatedPresetOf } from './CountdownFace';

// Shared animated-gradient background (the house set of 7): layered radial
// blobs drifting on a dark base, transform-only motion so it stays GPU-cheap
// on low-end boxes. Used by the countdown face, the projector, the output
// monitor and the editor thumbnails — one renderer, one look, everywhere.
// `value` is "anim:<id>"; unknown ids fall back to the first preset (same as
// the countdown face). `k` scales blob geometry for thumbnails (1 = full
// 1280×720 design canvas).
export default function AnimatedBg({ value, k = 1, style }) {
  const anim = animatedPresetOf(value);
  if (!anim) return null;
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: anim.base, ...style }}>
      <style>{'@keyframes kogDrift{from{transform:translate(var(--kog-dx-neg,0px),var(--kog-dy-neg,0px))}to{transform:translate(var(--kog-dx,0px),var(--kog-dy,0px))}}'}</style>
      {anim.blobs.map((b, i) => (
        <div
          key={b.css + i}
          style={{
            position: 'absolute',
            width: b.w * k,
            height: b.h * k,
            left: `${b.x}%`,
            top: `${b.y}%`,
            background: b.css,
            animation: `kogDrift ${b.d} ease-in-out infinite alternate`,
            ['--kog-dx']: `${b.dx * k}px`,
            ['--kog-dy']: `${b.dy * k}px`,
            ['--kog-dx-neg']: `${-b.dx * k}px`,
            ['--kog-dy-neg']: `${-b.dy * k}px`,
          }}
        />
      ))}
    </div>
  );
}
