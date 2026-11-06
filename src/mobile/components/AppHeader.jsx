import React from 'react';
import { ChevronLeft, MessageCircle, LayoutGrid } from 'lucide-react';
import { C, T, S, TXT, FONT } from '../theme.js';
import { Row, IconBtn, Badge, Dot } from '../ui.jsx';
import { connectionLabel } from '../live.js';

// Compact app bar: brand on the left, connection + notifications + menu on the
// right. Connection is a small pill, never a full-width banner — during a
// service the operator needs the status, not an announcement.
export default function AppHeader({
  status = 'connecting',
  unread = 0,
  title,
  subtitle,
  onBack,
  onOpenMessages,
  onOpenMore,
  right,
}) {
  const tone = status === 'online' ? 'success'
    : status === 'offline' || status === 'denied' ? 'error'
      : 'warning';
  const label = connectionLabel(status);

  return (
    <header
      style={{
        position: 'sticky', top: 0, zIndex: 40,
        paddingTop: 'env(safe-area-inset-top)',
        background: 'rgba(11,12,14,0.88)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderBottom: `1px solid ${C.border}`,
        fontFamily: FONT,
      }}
    >
      <Row style={{ height: 58, padding: '0 14px', gap: S.sm }}>
        {onBack ? (
          <IconBtn label="Back" onClick={onBack} variant="ghost" style={{ marginLeft: -6 }}>
            <ChevronLeft size={19} />
          </IconBtn>
        ) : (
          <Row gap={9} style={{ flexShrink: 0 }}>
            <span
              style={{
                width: 30, height: 30, borderRadius: 9, background: T.ACCENT_GRAD,
                color: T.ON_ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, fontWeight: 900, letterSpacing: -0.5, boxShadow: '0 3px 10px rgba(255,201,40,0.22)',
              }}
            >K</span>
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ ...TXT.brand, fontSize: 12.5, letterSpacing: 1.3, color: C.text }}>KOG Worship</span>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1.6, textTransform: 'uppercase', color: C.faint }}>
                Remote
              </span>
            </span>
          </Row>
        )}

        {title ? (
          <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 15.5, fontWeight: 900, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
            {subtitle ? <span style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</span> : null}
          </span>
        ) : <span style={{ flex: 1 }} />}

        <Row gap={6} style={{ flexShrink: 0 }}>
          <span
            title={label}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '0 9px', height: 26, borderRadius: 999,
              background: tone === 'success' ? T.SUCCESS_SOFT : tone === 'error' ? T.ERROR_SOFT : T.WARNING_SOFT,
              border: `1px solid ${tone === 'success' ? T.SUCCESS_LINE : tone === 'error' ? T.ERROR_LINE : T.WARNING_LINE}`,
              color: tone === 'success' ? T.SUCCESS : tone === 'error' ? T.ERROR : T.WARNING,
              fontSize: 10.5, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase',
            }}
          >
            <Dot tone={tone} size={6} pulse={tone === 'success'} />
            {label}
          </span>
          {onOpenMessages ? (
            <span style={{ position: 'relative' }}>
              <IconBtn label={`Messages${unread ? ` (${unread} unread)` : ''}`} onClick={onOpenMessages} variant="ghost">
                <MessageCircle size={18} />
              </IconBtn>
              {unread ? (
                <Badge count={unread} style={{ position: 'absolute', top: -2, right: -2, pointerEvents: 'none' }} />
              ) : null}
            </span>
          ) : null}
          {onOpenMore ? (
            <IconBtn label="More controls" onClick={onOpenMore} variant="ghost">
              <LayoutGrid size={17} />
            </IconBtn>
          ) : null}
          {right || null}
        </Row>
      </Row>
    </header>
  );
}
