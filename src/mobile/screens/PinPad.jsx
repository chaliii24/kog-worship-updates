import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Delete } from 'lucide-react';
import { C, T, R, TOUCH } from '../theme.js';

// A custom keypad instead of an <input>: it needs no keyboard, so iOS never
// auto-zooms, and there is no field to mistap while a service is running.
export default function PinPad({ C: theme, value, onChange, onSubmit, error, role, onSwitchRole }) {
  const themeC = theme || C;
  // Name at pairing: the booth credits every message to this label, so it is
  // worth asking once instead of showing "Remote a3f2" forever.
  const [name, setName] = useState(() => {
    try { return localStorage.getItem('kog-device-name') || ''; } catch { return ''; }
  });
  useEffect(() => {
    if (value.length === 6) onSubmit(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (d) => { if (value.length < 6) onChange(value + d); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '24px 20px calc(24px + env(safe-area-inset-bottom))' }}>
      <span style={{ width: 54, height: 54, borderRadius: 17, background: T.ACCENT_SOFT, border: `1px solid ${T.ACCENT_LINE}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: T.ACCENT }}>
        <ShieldCheck size={24} />
      </span>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -0.3 }}>
          {role === 'stage' ? 'Pair this phone' : 'Pair to control'}
        </div>
        <div style={{ fontSize: 13, color: themeC.muted, marginTop: 7, lineHeight: 1.55, maxWidth: 300 }}>
          Open <b style={{ color: themeC.text }}>Remote</b> on the computer and enter the 6-digit code shown there.
        </div>
      </div>

      {role !== 'stage' ? (
        <div style={{ width: '100%', maxWidth: 300 }}>
          <label htmlFor="kog-pair-name" style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: themeC.faint, marginBottom: 5, textAlign: 'center' }}>
            Name this phone
          </label>
          <input
            id="kog-pair-name"
            value={name}
            onChange={(e) => {
              const next = e.target.value.slice(0, 64);
              setName(next);
              try {
                if (next.trim()) localStorage.setItem('kog-device-name', next.trim());
                else localStorage.removeItem('kog-device-name');
              } catch { /* private mode */ }
            }}
            placeholder="e.g. Camera phone"
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box', textAlign: 'center',
              background: C.input, border: `1px solid ${C.border2}`, borderRadius: R.sm,
              color: C.text, fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
              padding: '10px 12px', outline: 'none',
            }}
          />
        </div>
      ) : null}

      {/* Dots — one per digit so progress is obvious without reading numbers. */}
      <div style={{ display: 'flex', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          return (
            <motion.span
              key={i}
              animate={{ scale: filled ? 1 : 0.84 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              style={{
                width: 14, height: 14, borderRadius: '50%',
                background: filled ? T.ACCENT : 'transparent',
                border: `2px solid ${filled ? T.ACCENT : themeC.border2}`,
                boxShadow: filled ? '0 0 12px rgba(255,201,40,0.5)' : 'none',
              }}
            />
          );
        })}
      </div>

      <div style={{ minHeight: 20, fontSize: 13, fontWeight: 700, color: T.ERROR, textAlign: 'center' }}>{error || ''}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 10 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <KeyBtn key={d} label={d} onPress={() => tap(d)} />
        ))}
        <KeyBtn label="Clear" small onPress={() => onChange('')} />
        <KeyBtn label="0" onPress={() => tap('0')} />
        <KeyBtn label={<Delete size={20} />} onPress={() => onChange(value.slice(0, -1))} />
      </div>

      <button
        type="button"
        onClick={() => onSwitchRole(role === 'stage' ? 'control' : 'stage')}
        style={{ background: 'transparent', border: 'none', color: T.ACCENT, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', padding: 10, fontFamily: 'inherit' }}
      >
        {role === 'stage' ? 'I need the control remote →' : 'I only need the singer view →'}
      </button>
    </div>
  );
}

function KeyBtn({ label, onPress, small }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 620, damping: 30 }}
      onClick={onPress}
      style={{
        height: 62, borderRadius: R.md, background: C.elevated,
        border: `1px solid ${C.border2}`, color: C.text,
        fontSize: small ? 12.5 : 24, fontWeight: 800, cursor: 'pointer',
        letterSpacing: small ? 0.4 : 0, fontFamily: 'inherit',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        touchAction: 'manipulation', minWidth: TOUCH,
      }}
    >{label}</motion.button>
  );
}
