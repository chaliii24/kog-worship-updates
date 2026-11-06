import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { C, T, S, R, TXT, TOUCH } from './theme.js';

// ── Layout ────────────────────────────────────────────────────────────────
// One vertical rhythm for every screen: 16px gutters, 14px between cards.
export function Screen({ children, style, ...rest }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: S.lg, padding: `6px 16px 24px`, ...style }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function Stack({ children, gap = S.md, style, ...rest }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap, minWidth: 0, ...style }} {...rest}>{children}</div>;
}

export function Row({ children, gap = S.sm, align = 'center', style, ...rest }) {
  return <div style={{ display: 'flex', alignItems: align, gap, minWidth: 0, ...style }} {...rest}>{children}</div>;
}

export function Divider({ style }) {
  return <div style={{ height: 1, background: C.border, margin: `${S.sm}px 0`, ...style }} />;
}

export function SectionLabel({ children, right, style }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: -4, ...style }}>
      <span style={{ ...TXT.label }}>{children}</span>
      {right || null}
    </Row>
  );
}

// ── Surfaces ──────────────────────────────────────────────────────────────
// `live` adds the yellow edge marker; `tone` switches the marker colour.
export function Card({ children, live, tone = 'accent', pad = 14, style, ...rest }) {
  const mark = tone === 'live' ? T.SUCCESS : tone === 'error' ? T.ERROR : tone === 'warning' ? T.WARNING : T.ACCENT;
  return (
    <div
      style={{
        position: 'relative',
        background: C.elevated,
        border: `1px solid ${live ? mark === T.SUCCESS ? T.SUCCESS_LINE : C.border2 : C.border}`,
        borderRadius: R.lg,
        padding: pad,
        overflow: 'hidden',
        boxShadow: T.SHADOW_SOFT,
        ...style,
      }}
      {...rest}
    >
      {live ? <span style={{ position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 3, background: mark }} /> : null}
      {children}
    </div>
  );
}

export function Pill({ children, tone = 'neutral', style }) {
  const map = {
    neutral: { bg: C.elevated2, fg: C.text2, line: 'transparent' },
    accent: { bg: T.ACCENT_SOFT, fg: T.ACCENT, line: T.ACCENT_LINE },
    live: { bg: T.SUCCESS_SOFT, fg: T.SUCCESS, line: T.SUCCESS_LINE },
    warning: { bg: T.WARNING_SOFT, fg: T.WARNING, line: T.WARNING_LINE },
    error: { bg: T.ERROR_SOFT, fg: T.ERROR, line: T.ERROR_LINE },
  }[tone] || {};
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 9px', borderRadius: R.pill, whiteSpace: 'nowrap',
        background: map.bg, color: map.fg, border: `1px solid ${map.line}`,
        fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone = 'success', size = 7, pulse = false }) {
  const color = { success: T.SUCCESS, error: T.ERROR, warning: T.WARNING, accent: T.ACCENT, muted: C.faint2 }[tone] || T.SUCCESS;
  const dot = (
    <span
      style={{
        width: size, height: size, borderRadius: '50%', background: color, flexShrink: 0,
        boxShadow: `0 0 8px ${color}66`,
      }}
    />
  );
  if (!pulse) return dot;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flexShrink: 0 }}>
      <motion.span
        animate={{ scale: [1, 2.2], opacity: [0.45, 0] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color }}
      />
      {dot}
    </span>
  );
}

export function Badge({ count, style }) {
  if (!count) return null;
  return (
    <span
      style={{
        minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9,
        background: T.ERROR, color: '#fff', fontSize: 10.5, fontWeight: 900,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        lineHeight: 1, ...style,
      }}
    >{count > 99 ? '99+' : count}</span>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────
const VARIANTS = {
  primary: { background: T.ACCENT_GRAD, color: T.ON_ACCENT, border: '1px solid rgba(255,201,40,0.9)', shadow: '0 6px 16px rgba(255,201,40,0.16)' },
  gold: { background: T.ACCENT_SOFT, color: T.ACCENT, border: `1px solid ${T.ACCENT_LINE}`, shadow: 'none' },
  ghost: { background: C.elevated2, color: C.text, border: `1px solid ${C.border2}`, shadow: 'none' },
  quiet: { background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, shadow: 'none' },
  danger: { background: T.ERROR_SOFT, color: T.ERROR, border: `1px solid ${T.ERROR_LINE}`, shadow: 'none' },
  success: { background: T.SUCCESS, color: '#04210F', border: `1px solid ${T.SUCCESS}`, shadow: '0 6px 16px rgba(34,197,94,0.18)' },
};

const SIZES = {
  lg: { height: 56, padding: '0 18px', fontSize: 16.5, radius: R.lg, gap: 9 },
  md: { height: TOUCH, padding: '0 14px', fontSize: 14, radius: R.md, gap: 7 },
  sm: { height: 44, padding: '0 11px', fontSize: 12.5, radius: R.sm, gap: 6 },
};

export function Btn({
  children, icon, variant = 'ghost', size = 'md', full, disabled,
  onClick, style, title, className, active, ...rest
}) {
  const v = VARIANTS[variant] || VARIANTS.ghost;
  const s = SIZES[size] || SIZES.md;
  return (
    <motion.button
      type="button"
      title={title}
      aria-label={typeof children === 'string' ? children : title}
      whileTap={disabled ? undefined : { scale: 0.975 }}
      transition={{ type: 'spring', stiffness: 620, damping: 34 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={className}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        gap: s.gap, height: s.height, minHeight: s.height, padding: s.padding,
        borderRadius: s.radius, fontFamily: 'inherit', fontWeight: 800,
        fontSize: s.fontSize, letterSpacing: 0.1, cursor: disabled ? 'default' : 'pointer',
        width: full ? '100%' : undefined, touchAction: 'manipulation',
        WebkitTapHighlightColor: 'transparent', whiteSpace: 'nowrap',
        background: v.background, color: v.color, border: v.border, boxShadow: v.shadow,
        opacity: disabled ? 0.45 : 1,
        ...(active ? { borderColor: T.ACCENT, color: T.ACCENT } : null),
        ...style,
      }}
      {...rest}
    >
      {icon || null}
      {children}
    </motion.button>
  );
}

export function IconBtn({ children, label, onClick, active, size = 44, variant = 'quiet', style, ...rest }) {
  const v = VARIANTS[variant] || VARIANTS.quiet;
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      whileTap={{ scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 640, damping: 32 }}
      onClick={onClick}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: R.md,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? T.ACCENT_SOFT : v.background, color: active ? T.ACCENT : v.color,
        border: `1px solid ${active ? T.ACCENT_LINE : v.border.replace('1px solid ', '')}`,
        cursor: 'pointer', fontFamily: 'inherit', touchAction: 'manipulation',
        ...style,
      }}
      {...rest}
    >{children}</motion.button>
  );
}

// Segmented control. `options` is [[value, label], …]; wraps when there are
// more than four choices so labels never truncate on a 360px phone.
export function Segmented({ options, value, onChange, style }) {
  const wrap = options.length > 4;
  return (
    <div
      style={{
        display: 'flex', flexWrap: wrap ? 'wrap' : 'nowrap', gap: 4,
        background: C.input, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 4,
        ...style,
      }}
    >
      {options.map(([v, label]) => {
        const on = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            style={{
              flex: wrap ? '1 1 auto' : 1, minWidth: wrap ? 64 : 0, height: 38,
              borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12.5, fontWeight: 800, padding: '0 10px', whiteSpace: 'nowrap',
              background: on ? T.ACCENT : 'transparent',
              color: on ? T.ON_ACCENT : C.muted,
              boxShadow: on ? '0 2px 8px rgba(255,201,40,0.18)' : 'none',
              transition: 'background 120ms ease, color 120ms ease',
            }}
          >{label}</button>
        );
      })}
    </div>
  );
}

export function Field({ style, ...rest }) {
  return (
    <input
      {...rest}
      style={{
        background: C.input, border: `1px solid ${C.border2}`, borderRadius: R.md,
        color: C.text, fontSize: 16, fontWeight: 600, padding: '0 12px', height: TOUCH,
        outline: 'none', fontFamily: 'inherit', minWidth: 0, width: '100%',
        boxSizing: 'border-box', ...style,
      }}
    />
  );
}

export function CheckRow({ checked, onChange, children }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: TOUCH,
        background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
        color: C.text2, fontSize: 13.5, fontWeight: 700, padding: 0, textAlign: 'left',
      }}
    >
      <span
        style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0,
          border: `1.5px solid ${checked ? T.ACCENT : C.border2}`,
          background: checked ? T.ACCENT : 'transparent',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: T.ON_ACCENT, fontSize: 13, fontWeight: 900,
        }}
      >{checked ? '✓' : ''}</span>
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
    </button>
  );
}

// ── States ────────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon, title, hint, action, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center', padding: '28px 18px', ...style }}>
      {Icon ? (
        <span style={{ width: 46, height: 46, borderRadius: 14, background: C.elevated, border: `1px solid ${C.border}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.faint }}>
          <Icon size={20} />
        </span>
      ) : null}
      {title ? <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{title}</div> : null}
      {hint ? <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.55, maxWidth: 300 }}>{hint}</div> : null}
      {action || null}
    </div>
  );
}

export function LoadingState({ label = 'Working…' }) {
  return (
    <Row gap={10} style={{ padding: '18px 4px', color: C.muted, fontSize: 13, fontWeight: 700 }}>
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 1 }}
        style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${C.border2}`, borderTopColor: T.ACCENT }}
      />
      {label}
    </Row>
  );
}

// ── Overlays ──────────────────────────────────────────────────────────────
// Bottom sheet used by the "More" menu and settings. Dismissible by backdrop
// tap; caps its height and scrolls so it never traps the page.
export function Sheet({ open, title, onClose, children }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(4,5,7,0.66)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-end' }}
        >
          <motion.div
            initial={{ y: 28, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{
              width: '100%', maxHeight: '86dvh', overflowY: 'auto',
              background: C.bgAlt, borderTop: `1px solid ${C.border2}`,
              borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl,
              padding: `10px 16px calc(16px + env(safe-area-inset-bottom))`,
              boxShadow: '0 -18px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ width: 38, height: 4, borderRadius: 2, background: C.elevated2, margin: '0 auto 12px' }} />
            <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ ...TXT.title }}>{title}</span>
              <IconBtn label="Close" onClick={onClose} size={36}><X size={17} /></IconBtn>
            </Row>
            {children}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export function SheetRow({ icon: Icon, label, hint, onClick, tone = 'default', trailing }) {
  const color = tone === 'danger' ? T.ERROR : C.text;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, width: '100%',
        minHeight: TOUCH + 8, padding: '10px 12px', marginBottom: 6,
        background: C.elevated, border: `1px solid ${C.border}`, borderRadius: R.md,
        color, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
      }}
    >
      {Icon ? (
        <span style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: tone === 'danger' ? T.ERROR_SOFT : C.elevated2, color: tone === 'danger' ? T.ERROR : T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={17} />
        </span>
      ) : null}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>{label}</span>
        {hint ? <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 2, fontWeight: 600 }}>{hint}</span> : null}
      </span>
      {trailing || null}
    </button>
  );
}
