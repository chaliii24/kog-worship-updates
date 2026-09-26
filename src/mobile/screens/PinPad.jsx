import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { stubTap } from '../../lib/anim.js';

// A custom keypad instead of an <input>: it needs no keyboard, so iOS never
// auto-zooms, and there is no field to mistap while a service is running.
export default function PinPad({ C, value, onChange, onSubmit, error, role, onSwitchRole }) {
  useEffect(() => {
    if (value.length === 6) onSubmit(value);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const tap = (d) => { if (value.length < 6) onChange(value + d); };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '24px 20px calc(24px + env(safe-area-inset-bottom))' }}>
      <div style={{ fontSize: 40 }}>🔗</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 19, fontWeight: 900, letterSpacing: 0.2 }}>
          {role === 'stage' ? 'Pair this phone' : 'Pair to control'}
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 7, lineHeight: 1.55, maxWidth: 300 }}>
          Open <b style={{ color: C.text }}>Remote</b> on the computer and enter the 6-digit code shown there.
        </div>
      </div>

      {/* Dots — one per digit so progress is obvious without reading numbers. */}
      <div style={{ display: 'flex', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => {
          const filled = i < value.length;
          return (
            <motion.span
              key={i}
              animate={{ scale: filled ? 1 : 0.86 }}
              transition={{ type: 'spring', stiffness: 520, damping: 26 }}
              style={{
                width: 15, height: 15, borderRadius: '50%',
                background: filled ? '#3b82f6' : 'transparent',
                border: `2px solid ${filled ? '#3b82f6' : C.border2}`,
                boxShadow: filled ? '0 0 12px rgba(59,130,246,0.55)' : 'none',
              }}
            />
          );
        })}
      </div>

      <div style={{ minHeight: 20, fontSize: 13, fontWeight: 700, color: '#f87171', textAlign: 'center' }}>{error || ''}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 76px)', gap: 10 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
          <KeyBtn key={d} C={C} label={d} onPress={() => tap(d)} />
        ))}
        <KeyBtn C={C} label="Clear" small onPress={() => onChange('')} />
        <KeyBtn C={C} label="0" onPress={() => tap('0')} />
        <KeyBtn C={C} label="⌫" onPress={() => onChange(value.slice(0, -1))} />
      </div>

      <button
        onClick={() => onSwitchRole(role === 'stage' ? 'control' : 'stage')}
        style={{ background: 'transparent', border: 'none', color: C.accLine, fontSize: 13.5, fontWeight: 800, cursor: 'pointer', padding: 8 }}
      >
        {role === 'stage' ? 'I need the control remote →' : 'I only need the singer view →'}
      </button>
    </div>
  );
}

function KeyBtn({ C, label, onPress, small }) {
  return (
    <motion.button
      {...stubTap}
      onPointerDown={onPress}
      style={{
        height: 62, borderRadius: 14,
        background: C.elevated,
        border: `1px solid ${C.border2}`,
        color: C.text,
        fontSize: small ? 13 : 24,
        fontWeight: 800,
        cursor: 'pointer',
        letterSpacing: small ? 0.4 : 0,
        fontFamily: 'inherit',
        touchAction: 'manipulation',
      }}
    >{label}</motion.button>
  );
}
