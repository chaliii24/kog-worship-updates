import React, { useMemo, useState } from 'react';
import { normalizeFx, normalizeBgFx, GRAIN_TEXTURE, GRUNGE_TEXTURE } from '../lib/cinematic';
import { FONT_OPTIONS } from '../lib/constants';

const cardStyle = (C, active) => ({
  textAlign: 'left',
  padding: 0,
  background: active ? 'rgba(0,170,255,0.12)' : C.elevated2,
  border: `1px solid ${active ? '#00aaff' : 'var(--ui-border2)'}`,
  borderRadius: 8,
  overflow: 'hidden',
  cursor: 'pointer',
  color: C.text,
});

function SliderRow({ C, label, value, min = 0, max = 100, step = 1, suffix = '', onChange, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }} title={title}>
      <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, width: 64, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ flex: 1, minWidth: 0 }} />
      <span style={{ fontSize: 9.5, color: C.muted, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{value}{suffix}</span>
    </div>
  );
}

// Which text boxes a preset's TYPE is written to. Effects, background grade
// and the ghost layer are slide-wide, so they are deliberately not part of
// this picker — only typography can belong to one box.
function TextBoxTarget({ C, ACCENT, boxes = [], value = 'all', onChange }) {
  if (!boxes || boxes.length < 2) return null;
  const all = value === 'all';
  const picked = all ? boxes.map((_, i) => i) : (Array.isArray(value) ? value : []);
  const toggle = (i) => {
    const next = picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b);
    onChange?.(next.length === boxes.length ? 'all' : next);
  };
  return (
    <div style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '6px 7px', marginBottom: 7 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 8.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.8 }}>Preset type → boxes</span>
        <span style={{ fontSize: 8.5, color: all ? '#36C982' : C.faint, fontWeight: 700 }}>
          {all ? 'All' : `${picked.length}/${boxes.length}`}
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        <button
          onClick={() => onChange?.('all')}
          aria-pressed={all}
          title="Apply the preset's typography to every text box on each target slide"
          style={{
            background: all ? 'rgba(0,170,255,0.18)' : C.elevated,
            border: `1px solid ${all ? ACCENT : 'var(--ui-border2)'}`,
            color: all ? C.text : C.muted,
            borderRadius: 5, padding: '3px 7px', fontSize: 8.5, fontWeight: 800, cursor: 'pointer',
          }}
        >All boxes</button>
        {boxes.map((b, i) => {
          const on = all || picked.includes(i);
          const label = i === 0 ? 'Main' : `Box ${i + 1}`;
          return (
            <button
              key={b.id || i}
              onClick={() => toggle(i)}
              aria-pressed={on}
              title={`${label}${b.text ? `: “${String(b.text).replace(/\s+/g, ' ').trim().slice(0, 54)}”` : ' (empty)'}`}
              style={{
                background: on ? 'rgba(0,170,255,0.12)' : 'transparent',
                border: `1px solid ${on ? ACCENT : 'var(--ui-border2)'}`,
                color: on ? C.text : C.faint,
                borderRadius: 5, padding: '3px 7px', fontSize: 8.5, fontWeight: 800, cursor: 'pointer',
              }}
            >{label}</button>
          );
        })}
      </div>
      <div style={{ fontSize: 8, color: C.faint, lineHeight: 1.4, marginTop: 4 }}>
        {all
          ? 'Type goes to every box. Effects, grade, transition and ghost stay slide-wide.'
          : picked.length
            ? `Type goes to ${picked.length} selected box${picked.length === 1 ? '' : 'es'}. Effects, grade, transition and ghost stay slide-wide.`
            : 'No box selected - applying will change only the slide effects, grade, transition and ghost.'}
      </div>
    </div>
  );
}

function PresetPreview({ preset, C }) {
  const cue = preset.cue || {};
  const ghost = preset.ghost;
  const fx = normalizeFx(preset.fx);
  const bg = normalizeBgFx(preset.bg_fx);
  const grade = [
    bg.grayscale ? `grayscale(${bg.grayscale / 100})` : '',
    bg.contrast ? `contrast(${1 + bg.contrast / 100})` : '',
    bg.brightness ? `brightness(${1 + bg.brightness / 100})` : '',
  ].filter(Boolean).join(' ') || 'none';
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      aspectRatio: '16 / 9',
      overflow: 'hidden',
      background: 'radial-gradient(ellipse at 30% 20%, #3a3a3a, #111 58%, #050505)',
      filter: grade,
    }}>
      {bg.overlay === 'grunge' && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: GRUNGE_TEXTURE, backgroundSize: '150px 150px', opacity: 0.35, mixBlendMode: 'overlay' }} />
      )}
      {ghost && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: cue.font, fontWeight: 800, fontSize: 30, letterSpacing: 2,
          color: 'transparent', WebkitTextFillColor: 'transparent',
          WebkitTextStroke: `1px ${ghost.strokeColor || '#fff'}`,
          opacity: (ghost.opacity ?? 20) / 100,
          textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>GHOST</div>
      )}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: cue.font, fontWeight: 800, fontSize: 20,
        color: cue.color || '#f5f5f4', textTransform: cue.case === 'upper' ? 'uppercase' : 'none',
        letterSpacing: `${Math.min(3, cue.letterSpacing || 0)}px`,
        textShadow: cue.shadow ? '0 2px 8px rgba(0,0,0,0.8)' : 'none',
        WebkitTextStroke: cue.outline ? `1px ${cue.strokeColor || '#000'}` : undefined,
        textAlign: 'center', lineHeight: 1,
      }}>TYPE</div>
      {fx.grain > 0 && (
        <div style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN_TEXTURE, backgroundSize: '70px 70px', opacity: (fx.grain / 100) * 0.45, mixBlendMode: 'overlay' }} />
      )}
      {fx.glitch > 0 && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', height: 3, background: 'rgba(255,60,110,0.35)', mixBlendMode: 'screen' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 24px rgba(0,0,0,${(bg.vignette || 0) / 120})`, pointerEvents: 'none' }} />
    </div>
  );
}

/**
 * CINEMATIC + LAYERED TEXT inspector.
 *
 * Three tabs keep a lot of power inside the existing 240px sidebar:
 *   Looks   — built-in + saved presets, apply scope, save/delete
 *   Effects — independent grain/noise/scanline/RGB/glitch/flicker/jitter/
 *             scratch/vignette sliders plus the background grade
 *   Layers  — the ghost/watermark text layer (context line or custom words)
 */
export default function CinematicPanel({
  C,
  ACCENT,
  cue,
  presets = [],
  scope = 'this',
  onScopeChange,
  onPatch,
  onPatchLive,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  onGhostSource,
  onGhostLastLine,
  ghostContext = {},
  textBoxes = [],
  boxTarget = 'all',
  onBoxTargetChange,
  sourceLabel = 'Main text',
}) {
  const [tab, setTab] = useState('looks');
  const [selected, setSelected] = useState(presets[0]?.id || 'cine-grunge');
  // Presets are effects-first: applying one must never resize or restyle the
  // operator's lyric unless they explicitly ask for the preset's typography.
  const [applyType, setApplyType] = useState(false);
  const [name, setName] = useState('');
  const [open, setOpen] = useState(true);

  const fx = useMemo(() => normalizeFx(cue?.fx), [cue?.fx]);
  const bg = useMemo(() => normalizeBgFx(cue?.bg_fx), [cue?.bg_fx]);
  const ghost = cue?.ghost || {};
  const ghostOn = !!ghost.on;
  // Missing on old cues means the original hollow watermark.
  const ghostStrokeOnly = ghost.strokeOnly !== false;

  const setFx = (patch, live = true) => (live ? onPatchLive : onPatch)?.({ fx: { ...fx, ...patch } });
  const setBg = (patch, live = true) => (live ? onPatchLive : onPatch)?.({ bg_fx: { ...bg, ...patch } });
  const setGhost = (patch) => onPatch?.({ ghost: { ...ghost, ...patch } });
  const preset = presets.find((p) => p.id === selected) || presets[0];

  const apply = () => {
    if (!preset) return;
    onApplyPreset?.(preset, scope, boxTarget, applyType);
  };

  const save = () => {
    const made = onSavePreset?.(name);
    if (made) {
      setName('');
      setSelected(made.id);
    }
  };

  return (
    <div style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: 10 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', marginBottom: open ? 8 : 0 }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.5 }}>Cinematic Look</span>
        <span style={{ fontSize: 9.5, color: C.faint }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <>
          <div style={{ display: 'flex', gap: 3, marginBottom: 9 }}>
            {[['looks', 'Looks'], ['effects', 'Effects'], ['layers', 'Layers']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  flex: 1, background: tab === k ? ACCENT : C.elevated2,
                  border: `1px solid ${tab === k ? ACCENT : 'var(--ui-border2)'}`,
                  color: tab === k ? C.text : C.muted,
                  borderRadius: 6, padding: '5px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer',
                }}
              >{label}</button>
            ))}
          </div>

          {tab === 'looks' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 8 }}>
                {presets.map((p) => (
                  <button key={p.id} onClick={() => setSelected(p.id)} title={p.note} style={cardStyle(C, selected === p.id)}>
                    <PresetPreview preset={p} C={C} />
                    <div style={{ padding: '4px 6px 5px', fontSize: 9, fontWeight: 800, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                  </button>
                ))}
              </div>

              {preset && <div style={{ fontSize: 9, color: C.faint, lineHeight: 1.45, marginBottom: 7 }}>{preset.note}</div>}

              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                {[['this', 'This slide'], ['selected', 'Selected'], ['all', 'All slides']].map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => onScopeChange?.(k)}
                    title={k === 'selected' ? 'Ctrl+click slides in the list to tick them' : undefined}
                    style={{
                      flex: 1, background: scope === k ? 'rgba(0,170,255,0.18)' : C.elevated2,
                      border: `1px solid ${scope === k ? ACCENT : 'var(--ui-border2)'}`,
                      color: scope === k ? C.text : C.muted,
                      borderRadius: 5, padding: '4px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer',
                    }}
                  >{label}</button>
                ))}
              </div>

              <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 3 }}>Text style</div>
              <div style={{ display: 'flex', gap: 3, marginBottom: 5 }}>
                {[[false, 'Keep mine'], [true, 'Preset type']].map(([usePreset, label]) => (
                  <button
                    key={String(usePreset)}
                    onClick={() => setApplyType(usePreset)}
                    aria-pressed={applyType === usePreset}
                    title={usePreset
                      ? 'Also apply the preset’s font, size, spacing, colour and outline to the selected text boxes'
                      : 'Apply only the preset’s effects, background grade, transition and ghost — keep the lyric’s current font and size'}
                    style={{
                      flex: 1, background: applyType === usePreset ? 'rgba(0,170,255,0.18)' : C.elevated2,
                      border: `1px solid ${applyType === usePreset ? ACCENT : 'var(--ui-border2)'}`,
                      color: applyType === usePreset ? C.text : C.muted,
                      borderRadius: 5, padding: '4px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer',
                    }}
                  >{label}</button>
                ))}
              </div>

              {applyType ? (
                <>
                  <TextBoxTarget C={C} ACCENT={ACCENT} boxes={textBoxes} value={boxTarget} onChange={onBoxTargetChange} />
                  {(textBoxes || []).length < 2 && (
                    <div style={{ fontSize: 8, color: C.faint, lineHeight: 1.4, marginBottom: 7 }}>
                      Preset typography applies to the main text box.
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 8, color: C.faint, lineHeight: 1.4, marginBottom: 7 }}>
                  Effects, grade, transition and ghost only. Your font, size, spacing and colours stay exactly as they are.
                </div>
              )}

              <button
                onClick={apply}
                style={{ width: '100%', background: ACCENT, border: 'none', color: '#04121f', borderRadius: 7, padding: '7px 8px', fontSize: 10.5, fontWeight: 900, cursor: 'pointer', marginBottom: 10 }}
              >Apply {preset ? `“${preset.name}”` : 'look'}</button>

              <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Save this look</div>
              <div style={{ fontSize: 8, color: C.faint, lineHeight: 1.4, marginBottom: 4 }}>
                Saves type from <span style={{ color: C.text2, fontWeight: 700 }}>{sourceLabel}</span> plus this slide’s effects, grade, transition and ghost look.
              </div>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
                  placeholder="Preset name"
                  style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: '6px 7px', fontSize: 10.5, outline: 'none' }}
                />
                <button onClick={save} title="Save the current slide's cinematic look as a reusable preset (words are never saved)" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 6, padding: '5px 8px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>Save</button>
              </div>
              {presets.some((p) => p.custom) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {presets.filter((p) => p.custom).map((p) => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '3px 5px' }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 9.5, fontWeight: 700, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                      <button onClick={() => onDeletePreset?.(p.id)} title="Delete this saved preset" style={{ background: 'transparent', border: 'none', color: '#FF4545', fontSize: 10, cursor: 'pointer', padding: 1 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'effects' && (
            <>
              {[
                ['grain', 'Grain'], ['noise', 'Static'], ['scanlines', 'Scanlines'],
                ['rgbSplit', 'RGB Split'], ['glitch', 'Glitch'], ['flicker', 'Flicker'],
                ['jitter', 'Jitter'], ['scratches', 'Scratches'], ['vignette', 'Vignette'],
              ].map(([k, label]) => (
                <SliderRow key={k} C={C} label={label} value={fx[k]} onChange={(v) => setFx({ [k]: v })} title={`${label} intensity (0 = off)`} />
              ))}
              <SliderRow C={C} label="FX speed" value={fx.speed} min={0.2} max={3} step={0.1} suffix="×" onChange={(v) => setFx({ speed: v })} title="Animation speed for grain, static, glitch and flicker" />
              <button
                onClick={() => onPatch?.({ fx: normalizeFx({}) })}
                style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, padding: '5px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer', margin: '4px 0 10px' }}
              >Clear effects</button>

              <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, margin: '2px 0 5px' }}>Background Grade</div>
              <SliderRow C={C} label="Mono" value={bg.grayscale} suffix="%" onChange={(v) => setBg({ grayscale: v })} />
              <SliderRow C={C} label="Contrast" value={bg.contrast} min={-40} max={100} onChange={(v) => setBg({ contrast: v })} />
              <SliderRow C={C} label="Bright" value={bg.brightness} min={-50} max={50} onChange={(v) => setBg({ brightness: v })} />
              <SliderRow C={C} label="Blur" value={bg.blur} min={0} max={24} onChange={(v) => setBg({ blur: v })} />
              <SliderRow C={C} label="Zoom" value={bg.zoom} min={100} max={135} suffix="%" onChange={(v) => setBg({ zoom: v })} />
              <SliderRow C={C} label="Vignette" value={bg.vignette} suffix="%" onChange={(v) => setBg({ vignette: v })} />
              <SliderRow C={C} label="Tint" value={bg.tintOpacity} suffix="%" onChange={(v) => setBg({ tintOpacity: v })} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, width: 64 }}>Tint color</label>
                <input type="color" value={bg.tint} onChange={(e) => setBg({ tint: e.target.value }, false)} style={{ width: 34, height: 22, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 4, padding: 0, cursor: 'pointer' }} />
                <div style={{ flex: 1 }} />
                <select
                  value={bg.overlay}
                  onChange={(e) => setBg({ overlay: e.target.value }, false)}
                  title="Distressed texture over the photo/video"
                  style={{ background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '4px 5px', fontSize: 9.5, outline: 'none' }}
                >
                  {['none', 'grunge', 'paper', 'dust', 'ink'].map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              {bg.overlay !== 'none' && (
                <SliderRow C={C} label="Texture" value={bg.overlayOpacity} suffix="%" onChange={(v) => setBg({ overlayOpacity: v })} />
              )}
              <button
                onClick={() => onPatch?.({ bg_fx: normalizeBgFx({}) })}
                style={{ width: '100%', background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, padding: '5px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer', marginTop: 3 }}
              >Reset background grade</button>
            </>
          )}

          {tab === 'layers' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <button
                  onClick={() => setGhost({ on: !ghostOn })}
                  style={{
                    flex: 1, background: ghostOn ? 'rgba(0,170,255,0.2)' : C.elevated2,
                    border: `1px solid ${ghostOn ? ACCENT : 'var(--ui-border2)'}`,
                    color: ghostOn ? C.text : C.muted,
                    borderRadius: 6, padding: '6px 0', fontSize: 10, fontWeight: 800, cursor: 'pointer',
                  }}
                >{ghostOn ? 'Ghost layer ON' : 'Add ghost layer'}</button>
              </div>

              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                {[
                  ['prev', 'Prev line', ghostContext.prev],
                  ['next', 'Next line', ghostContext.next],
                  ['this', 'This line', ghostContext.this],
                ].map(([k, label, line]) => (
                  <button
                    key={k}
                    onClick={() => onGhostSource?.(k)}
                    disabled={!line}
                    title={line ? `Watermark: “${line.slice(0, 80)}”` : 'No line available on that slide'}
                    style={{
                      flex: 1, background: ghost.source === k ? 'rgba(0,170,255,0.18)' : C.elevated2,
                      border: `1px solid ${ghost.source === k ? ACCENT : 'var(--ui-border2)'}`,
                      color: line ? C.text2 : C.faint, opacity: line ? 1 : 0.45,
                      borderRadius: 5, padding: '4px 0', fontSize: 8.5, fontWeight: 800, cursor: line ? 'pointer' : 'default', whiteSpace: 'nowrap',
                    }}
                  >{label}</button>
                ))}
              </div>

              <div style={{ fontSize: 9, color: ghostContext.prev ? '#FFC72C' : C.faint, lineHeight: 1.45, marginBottom: 5 }}>
                {ghostContext.prev ? `Prev: “${ghostContext.prev.slice(0, 70)}”` : 'No previous slide line to echo.'}
              </div>

              <textarea
                value={ghost.text || ''}
                onChange={(e) => setGhost({ text: e.target.value, source: 'custom' })}
                placeholder="Ghost words (shown huge behind the main lyric)"
                rows={2}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 6, padding: 6, fontSize: 10.5, outline: 'none', marginBottom: 6 }}
              />

              <button
                onClick={() => onGhostLastLine?.()}
                title="Move the last line of this slide's lyric into the ghost layer (Ctrl+Z undoes it)"
                style={{ width: '100%', background: 'rgba(255,184,0,0.14)', border: '1px solid rgba(255,184,0,0.45)', color: '#FFC72C', borderRadius: 6, padding: '5px 0', fontSize: 9.5, fontWeight: 800, cursor: 'pointer', marginBottom: 8 }}
              >Move last lyric line → ghost</button>

              <SliderRow C={C} label="Opacity" value={ghost.opacity ?? 20} min={0} max={60} suffix="%" onChange={(v) => setGhost({ opacity: v })} />
              <SliderRow C={C} label="Size" value={ghost.size ?? 230} min={40} max={520} onChange={(v) => setGhost({ size: v })} title="Independent font size for the background text (the ghost box is resized separately)" />
              <SliderRow C={C} label="Tracking" value={ghost.letterSpacing ?? 6} min={-5} max={40} step={0.5} onChange={(v) => setGhost({ letterSpacing: v })} />
              <SliderRow C={C} label="Line ht" value={ghost.lineHeight ?? 0.95} min={0.5} max={2.5} step={0.05} onChange={(v) => setGhost({ lineHeight: v })} />
              <SliderRow C={C} label="Stroke" value={ghost.strokeWidth ?? 2.5} min={0} max={16} step={0.5} onChange={(v) => setGhost({ strokeWidth: v })} />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, width: 64 }}>Stroke col</label>
                <input type="color" value={ghost.strokeColor || '#f5f5f4'} onChange={(e) => setGhost({ strokeColor: e.target.value })} style={{ width: 32, height: 21, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 4, padding: 0, cursor: 'pointer' }} />
                <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700 }}>Fill</label>
                <input type="color" value={ghost.color || '#f5f5f4'} onChange={(e) => setGhost({ color: e.target.value })} style={{ width: 32, height: 21, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 4, padding: 0, cursor: 'pointer' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, width: 64 }}>Hollow</label>
                <button
                  onClick={() => setGhost({ strokeOnly: !ghostStrokeOnly })}
                  title={ghostStrokeOnly ? 'Hollow: outline only, fill transparent. Click for solid fill + stroke.' : 'Filled: the Fill colour is visible under the stroke. Click for outline only.'}
                  style={{
                    flex: 1, background: ghostStrokeOnly ? 'rgba(0,170,255,0.18)' : C.elevated2,
                    border: `1px solid ${ghostStrokeOnly ? ACCENT : 'var(--ui-border2)'}`,
                    color: ghostStrokeOnly ? C.text : C.muted,
                    borderRadius: 5, padding: '4px 0', fontSize: 9, fontWeight: 800, cursor: 'pointer',
                  }}
                >{ghostStrokeOnly ? 'ON · stroke only' : 'OFF · fill visible'}</button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                <label style={{ fontSize: 9.5, color: C.faint, fontWeight: 700, width: 64 }}>Face</label>
                <select
                  value={ghost.font || ''}
                  onChange={(e) => setGhost({ font: e.target.value })}
                  style={{ flex: 1, minWidth: 0, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '4px 5px', fontSize: 9.5, outline: 'none' }}
                >
                  <option value="">Same as lyric</option>
                  {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
                {[['none', 'Aa'], ['upper', 'AA'], ['lower', 'aa']].map(([m, label]) => (
                  <button key={m} onClick={() => setGhost({ case: m })} style={{ flex: 1, background: (ghost.case || 'upper') === m ? ACCENT : C.elevated2, border: '1px solid var(--ui-border2)', color: (ghost.case || 'upper') === m ? '#0D1014' : C.muted, borderRadius: 5, padding: '4px 0', fontSize: 9, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
                ))}
                <select
                  value={ghost.blendMode || 'screen'}
                  onChange={(e) => setGhost({ blendMode: e.target.value })}
                  title="Ghost blend mode"
                  style={{ flex: 1.4, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 5, padding: '3px 4px', fontSize: 8.5, outline: 'none' }}
                >
                  {['screen', 'overlay', 'soft-light', 'normal', 'multiply'].map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>Position</span>
                <button
                  onClick={() => setGhost({ box: { x: 64, y: 170, w: 1152, h: 380 } })}
                  style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 5, padding: '2px 6px', fontSize: 8.5, fontWeight: 700, cursor: 'pointer' }}
                >Center</button>
              </div>
              <SliderRow C={C} label="X" value={Math.round(ghost.box?.x ?? 64)} min={-300} max={1300} onChange={(v) => setGhost({ box: { ...(ghost.box || {}), x: v } })} />
              <SliderRow C={C} label="Y" value={Math.round(ghost.box?.y ?? 170)} min={-300} max={900} onChange={(v) => setGhost({ box: { ...(ghost.box || {}), y: v } })} />
              <SliderRow C={C} label="Width" value={Math.round(ghost.box?.w ?? 1152)} min={100} max={1800} onChange={(v) => setGhost({ box: { ...(ghost.box || {}), w: v } })} />
              <SliderRow C={C} label="Height" value={Math.round(ghost.box?.h ?? 380)} min={60} max={1200} onChange={(v) => setGhost({ box: { ...(ghost.box || {}), h: v } })} />
              <SliderRow C={C} label="Angle" value={Math.round(ghost.box?.angle ?? 0)} min={-45} max={45} onChange={(v) => setGhost({ box: { ...(ghost.box || {}), angle: v } })} />

              <div style={{ fontSize: 8.5, color: C.faint, lineHeight: 1.45, marginTop: 4 }}>
                The ghost is a second, independent text layer. Its words are optional and are never removed from the lyric unless you use the move button above.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
