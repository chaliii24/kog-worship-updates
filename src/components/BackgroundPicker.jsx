import React, { useMemo, useState } from 'react';
import { Check, Image as ImageIcon, Play } from 'lucide-react';
import { GRADIENT_PACK } from '../lib/backgrounds';
import { ANIMATED_GRADIENTS } from './CountdownFace';

// Name shown on a media tile / in its tooltip.
const assetName = (asset) => {
  if (asset?.name) return asset.name;
  try {
    return decodeURIComponent(String(asset?.url || '').split('/').pop().split('?')[0]) || 'Media asset';
  } catch {
    return 'Media asset';
  }
};

/* Which bucket a library asset falls into. The library itself only knows
   image vs video, so the name decides the rest: logos by name, motion and
   texture loops as backgrounds, everything else reads as a photo. */
export const mediaCategory = (asset) => {
  const name = assetName(asset).toLowerCase();
  if (/logo|brand|emblem|crest|wordmark|watermark|kog/.test(name)) return 'logos';
  if (asset?.kind === 'video') return 'videos';
  if (/background|backdrop|bg[-_ ]|texture|pattern|gradient|loop|motion|abstract|bokeh|nebula|smoke|glow|neon|particle|wave|star|cloud|dust|flare|streak|light/.test(name)) return 'backgrounds';
  return 'photos';
};

const CATEGORIES = [
  { k: 'all', label: 'All', tip: 'Every image and video in your library' },
  { k: 'backgrounds', label: 'Backgrounds', tip: 'Abstract, texture and motion loops — good full-screen backdrops' },
  { k: 'videos', label: 'Videos', tip: 'Every video asset' },
  { k: 'photos', label: 'Photos', tip: 'Photographs and stills' },
  { k: 'logos', label: 'Logos', tip: 'Logos, wordmarks and church branding' },
];

/* The small round tick that marks whatever is currently applied. One mark
   for every kind of background, so "what is live?" reads the same whether
   it is a solid colour, a gradient, an animated loop or a media file. */
function CheckMark({ ACCENT }) {
  return (
    <span
      style={{
        position: 'absolute',
        top: 3,
        right: 3,
        width: 15,
        height: 15,
        borderRadius: 999,
        background: ACCENT,
        color: '#1C1C1E',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.55)',
        zIndex: 3,
        pointerEvents: 'none',
      }}
    >
      <Check size={10} strokeWidth={3.5} />
    </span>
  );
}

export default function BackgroundPicker({
  C,
  ACCENT,
  activeType,
  activeValue,
  onPick,
  onClear,
  onUpload,
  hasBackground,
  mediaLibrary,
  // Slide Properties shows its own "Active Background" card + gallery sheet,
  // so the 30-tile media grid would be a second copy of the same library in
  // one rail. Colour and Motion stay here.
  hideMedia = false,
}) {
  const [tab, setTab] = useState('color');
  const [cat, setCat] = useState('all');

  const assets = useMemo(
    () => (mediaLibrary || []).filter((a) => a.kind === 'image' || a.kind === 'video'),
    [mediaLibrary],
  );

  const counts = useMemo(() => {
    const out = { all: assets.length };
    for (const { k } of CATEGORIES) if (k !== 'all') out[k] = assets.filter((a) => mediaCategory(a) === k).length;
    return out;
  }, [assets]);

  const visible = cat === 'all' ? assets : assets.filter((a) => mediaCategory(a) === cat);

  // One ring for every applied state — no layout shift between 1px and 2px.
  const ring = (on) => ({
    border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'),
    boxShadow: on ? `0 0 0 2px ${ACCENT}55` : 'none',
  });

  const tabBtn = (k, label, tip) => {
    const on = tab === k;
    return (
      <button
        key={k}
        type="button"
        onClick={() => setTab(k)}
        title={tip}
        style={{
          flex: 1,
          background: on ? ACCENT : 'transparent',
          border: 'none',
          color: on ? '#1C1C1E' : C.muted,
          borderRadius: 999,
          padding: '5px 4px',
          fontSize: 10.5,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          transition: 'background 120ms ease, color 120ms ease',
        }}
      >
        {label}
      </button>
    );
  };

  const sectionLabel = (text) => (
    <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
      {text}
    </div>
  );

  const uploadBtn = {
    background: C.input,
    color: C.text2,
    border: '1px solid var(--ui-border2)',
    padding: '5px 8px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    whiteSpace: 'nowrap',
  };

  return (
    <div>
      {/* Sub-views: the three stacks that used to run down the panel in one
          dense column, split so only one is on screen at a time. */}
      <div style={{ display: 'flex', gap: 2, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 999, padding: 2, marginBottom: 9 }}>
        {tabBtn('color', 'Color', 'Solid colour and gradients')}
        {tabBtn('motion', 'Motion', 'Animated gradient loops')}
        {!hideMedia && tabBtn('media', 'Media', 'Images and videos from your library')}
      </div>

      {tab === 'color' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
            <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
              <input
                type="color"
                value={activeType === 'color' ? activeValue || '#000000' : '#000000'}
                onChange={(e) => onPick('color', e.target.value)}
                title="Solid background colour"
                style={{ width: 36, height: 28, background: C.input, border: '1px solid ' + (activeType === 'color' ? ACCENT : 'var(--ui-border2)'), boxShadow: activeType === 'color' ? `0 0 0 2px ${ACCENT}55` : 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }}
              />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 700, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', color: activeType === 'color' ? C.text : C.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeType === 'color' ? String(activeValue || '#000000').slice(0, 16) : 'No solid colour'}
            </span>
            {activeType === 'color' && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, color: ACCENT, whiteSpace: 'nowrap' }}><Check size={10} strokeWidth={3.5} /> live</span>}
            {hasBackground && (
              <button onClick={onClear} title="Clear this background" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, padding: '4px 7px', borderRadius: 6, fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                Clear
              </button>
            )}
          </div>
          {sectionLabel(`Gradients · ${GRADIENT_PACK.length}`)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
            {GRADIENT_PACK.map((g) => {
              const on = activeType === 'gradient' && activeValue === g.css;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPick('gradient', g.css)}
                  title={g.name}
                  style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, background: g.css, cursor: 'pointer', padding: 0, overflow: 'hidden', ...ring(on) }}
                >
                  {on && <CheckMark ACCENT={ACCENT} />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'motion' && (
        <>
          {sectionLabel(`Animated loops · ${ANIMATED_GRADIENTS.length}`)}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
            {ANIMATED_GRADIENTS.map((g) => {
              const on = activeType === 'animated' && activeValue === `anim:${g.id}`;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => onPick('animated', `anim:${g.id}`)}
                  title={`${g.name} (animated loop)`}
                  style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, background: g.base, cursor: 'pointer', padding: 0, overflow: 'hidden', ...ring(on) }}
                >
                  <span style={{ position: 'absolute', bottom: 0, left: 0, right: 0, textAlign: 'center', fontSize: 7, fontWeight: 800, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)', padding: '0 2px' }}>{g.name}</span>
                  {on && <CheckMark ACCENT={ACCENT} />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {!hideMedia && tab === 'media' && (
        <>
          <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
            <label style={uploadBtn} title="Upload an image from this computer">
              <ImageIcon size={10} /> Image
              <input type="file" accept="image/*" onChange={(e) => { if (e.target.files[0]) onUpload('image', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} />
            </label>
            <label style={uploadBtn} title="Upload a video from this computer">
              <Play size={10} /> Video
              <input type="file" accept="video/mp4,video/webm" onChange={(e) => { if (e.target.files[0]) onUpload('video', e.target.files[0]); e.target.value = ''; }} style={{ display: 'none' }} />
            </label>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
            {CATEGORIES.filter(({ k }) => k === 'all' || counts[k] > 0).map(({ k, label, tip }) => {
              const on = cat === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCat(k)}
                  title={tip}
                  style={{
                    background: on ? 'rgba(255,184,0,0.16)' : C.elevated2,
                    border: '1px solid ' + (on ? ACCENT : 'var(--ui-border2)'),
                    color: on ? ACCENT : C.muted,
                    borderRadius: 999,
                    padding: '3px 8px',
                    fontSize: 9.5,
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}{k === 'all' ? '' : ` ${counts[k]}`}
                </button>
              );
            })}
          </div>

          {visible.length === 0 ? (
            <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 10, color: C.faint, background: C.elevated2, border: '1px dashed var(--ui-border2)', borderRadius: 8 }}>
              {assets.length === 0 ? 'No media yet — upload an image or video above.' : `Nothing tagged ${CATEGORIES.find((c) => c.k === cat)?.label.toLowerCase()} in your library.`}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
              {visible.map((a) => {
                const on = activeType === a.kind && activeValue === a.url;
                return (
                  <button
                    key={a.url}
                    type="button"
                    onClick={() => onPick(a.kind, a.url)}
                    title={assetName(a)}
                    style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: 6, overflow: 'hidden', cursor: 'pointer', padding: 0, background: '#000', ...ring(on) }}
                  >
                    {a.kind === 'video' ? (
                      <video src={a.url} muted playsInline preload="metadata" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <img src={a.url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    )}
                    <span
                      title={a.kind === 'video' ? 'Video' : 'Image'}
                      style={{ position: 'absolute', top: 3, left: 3, width: 14, height: 14, borderRadius: 4, background: 'rgba(0,0,0,0.62)', border: '1px solid rgba(255,255,255,0.22)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                    >
                      {a.kind === 'video' ? <Play size={8} strokeWidth={3} /> : <ImageIcon size={8} strokeWidth={2.5} />}
                    </span>
                    {on && <CheckMark ACCENT={ACCENT} />}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
