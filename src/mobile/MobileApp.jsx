import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getTheme } from '../lib/theme.js';
import { stubTap } from '../lib/anim.js';
import { createLink } from './link.js';
import PinPad from './screens/PinPad.jsx';
import ControlScreen from './screens/ControlScreen.jsx';
import StageScreen from './screens/StageScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';

// Role routing lives in two places because the same build serves every surface:
//   * `?role=drummer` (or pastor / worship / follow) deep-links a phone straight
//     into a LOCKED stage view — no menus, no role picker, just that role's
//     screen. Drummer additionally goes full-screen metronome.
//   * `#stage` / `#control` keeps the legacy toggle used by the QR codes.
// The query wins over the hash so an operator can hand out a dedicated link
// that a singer cannot accidentally navigate away from.
const LOCKED_STAGE_ROLES = new Set(['drummer', 'pastor', 'worship', 'follow']);

function parseRoleRoute() {
  let param = '';
  try {
    param = String(new URLSearchParams(window.location.search).get('role') || '').trim().toLowerCase();
  } catch { param = ''; }
  if (param === 'drum') param = 'drummer';
  if (param === 'singer' || param === 'prompter') param = 'stage';
  if (param === 'operator' || param === 'desktop') param = 'control';

  if (LOCKED_STAGE_ROLES.has(param)) {
    return { role: 'stage', lockedRole: param };
  }
  if (param === 'stage' || param === 'control') {
    return { role: param, lockedRole: null };
  }
  const hash = String(window.location.hash || '').toLowerCase();
  return { role: hash.includes('stage') ? 'stage' : 'control', lockedRole: null };
}

const PIN_STATUSES = ['need-pin', 'wrong', 'locked'];

export default function MobileApp() {
  // Parsed once on load: the URL is the provisioner, not a live preference.
  const [route] = useState(parseRoleRoute);
  const role = route.role;
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [reason, setReason] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const linkRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [showMessages, setShowMessages] = useState(false);
  const [msgBanner, setMsgBanner] = useState(null);
  useEffect(() => { if (!msgBanner) return; const t = setTimeout(() => setMsgBanner(null), 5000); return () => clearTimeout(t); }, [msgBanner]);

  useEffect(() => {
    const link = createLink({
      role,
      onState: (s) => setState(s),
      onMessage: (m) => {
        if (m.t === 'msg') {
          // acknowledge receipt to desktop
          try { linkRef.current?.sendAck?.(m.id); } catch {}
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, {
              id: m.id,
              conversationId: 'self',
              senderId: 'operator',
              senderName: m.senderName || 'Operator',
              recipientId: 'self',
              content: m.content,
              priority: m.priority || 'normal',
              status: 'delivered',
              timestamp: m.timestamp,
            }];
          });
          setUnread((u) => u + 1);
          if (!showMessages) setMsgBanner({ text: m.content, sender: m.senderName || 'Operator' });
          // mark read after a short delay? Leave as delivered; read on open.
        } else if (m.t === 'msg-ack') {
          setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: 'delivered' } : x));
        } else if (m.t === 'msg-status') {
          setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: m.status || x.status } : x));
        } else if (m.t === 'msg-sync') {
          const incoming = Array.isArray(m.messages) ? m.messages : [];
          setMessages((prev) => {
            const map = new Map(prev.map((x) => [x.id, x]));
            for (const im of incoming) {
              if (!map.has(im.id)) {
                map.set(im.id, {
                  id: im.id,
                  conversationId: 'self',
                  senderId: im.senderId === 'operator' ? 'operator' : im.senderId,
                  senderName: im.senderName,
                  recipientId: im.recipientId,
                  content: im.content,
                  priority: im.priority || 'normal',
                  status: im.status || 'sent',
                  timestamp: im.timestamp,
                });
              } else {
                // update status
                const existing = map.get(im.id);
                map.set(im.id, { ...existing, status: im.status || existing.status });
              }
            }
            return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
          });
        }
      },
      onStatus: (s, why) => {
        setStatus(s);
        setReason(why || '');
        if (s === 'wrong') { setPinError('Wrong code — try again'); setPinValue(''); }
        else if (s === 'locked') setPinError('Too many attempts. Wait 45 seconds.');
        else if (s === 'need-pin') { setPinError(''); setPinValue(''); }
        else if (s === 'online') { setPinError(''); setPinValue(''); }
        else if (s === 'denied') setPinError(why === 'revoked' ? 'This phone was disconnected by the operator.' : '');
      },
    });
    linkRef.current = link;
    return () => { link.dispose(); linkRef.current = null; };
  }, [role]);

  // Light theme is opt-in on the desktop; mirror it here so the phone feels
  // like the same app rather than a companion with its own palette.
  const dark = state?.themeDark !== false;
  const T = useMemo(() => getTheme(dark), [dark]);
  const C = T.C;

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }, [C.bg, C.text, dark]);

  const send = (cmd, payload) => {
    if (!linkRef.current) return false;
    return linkRef.current.send(cmd, payload || {});
  };

  const submitPin = (value) => {
    setPinError('');
    linkRef.current?.submitPin(value);
  };

  const switchRole = (to) => {
    // A manual switch must not bounce back through a locking `?role=` param
    // on reload, so drop it before changing the hash.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('role');
      url.hash = to;
      window.location.replace(url.toString());
    } catch {
      window.location.hash = to;
      window.location.reload();
    }
  };

  const needsPin = PIN_STATUSES.includes(status);
  const showDenied = status === 'denied';
  const connecting = !state && (status === 'connecting' || status === 'reconnecting' || status === 'offline');

  const banner = (() => {
    if (status === 'online') return null;
    if (status === 'reconnecting') return { text: 'Reconnecting…', tone: 'warn' };
    if (status === 'offline') return { text: 'Lost connection to the computer', tone: 'bad' };
    if (connecting) return { text: 'Connecting…', tone: 'warn' };
    if (needsPin) return { text: 'Waiting for pairing code', tone: 'warn' };
    if (showDenied) return { text: 'Not paired', tone: 'bad' };
    return null;
  })();

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, color: C.text, fontFamily: "'Inter Variable', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif", display: 'flex', flexDirection: 'column' }}>
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner.text}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            style={{
              position: 'sticky', top: 0, zIndex: 60, textAlign: 'center',
              padding: 'calc(7px + env(safe-area-inset-top)) 12px 7px',
              fontSize: 12, fontWeight: 800, letterSpacing: 0.4,
              background: banner.tone === 'bad' ? 'rgba(255,69,69,0.18)' : 'rgba(54,201,130,0.14)',
              borderBottom: `1px solid ${banner.tone === 'bad' ? 'rgba(255,69,69,0.4)' : 'rgba(54,201,130,0.3)'}`,
              color: banner.tone === 'bad' ? '#FF4545' : '#36C982',
            }}
          >{banner.text}</motion.div>
        )}
      </AnimatePresence>

      {needsPin ? (
        <PinPad C={C} value={pinValue} onChange={setPinValue} onSubmit={submitPin} error={pinError} role={role} onSwitchRole={switchRole} />
      ) : showDenied ? (
        <Denied C={C} reason={reason} onRetry={() => { linkRef.current?.forgetToken(); linkRef.current?.retry(); setPinError(''); }} />
      ) : connecting ? (
        <Connecting C={C} state={state} />
      ) : role === 'stage' ? (
        <StageScreen C={C} state={state} status={status} send={send} onSwitchRole={switchRole} lockedRole={route.lockedRole} />
      ) : (
        <ControlScreen C={C} T={T} state={state} status={status} send={send} onSwitchRole={switchRole} />
      )}
      {msgBanner && (
        <motion.div
          initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
          onClick={() => { setShowMessages(true); setUnread(0); setMsgBanner(null); }}
          style={{ position: 'fixed', top: 'calc(12px + env(safe-area-inset-top))', left: 12, right: 12, zIndex: 9998, background: '#ef4444', color: '#fff', padding: '10px 14px', borderRadius: 10, boxShadow: '0 6px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
        >
          <span style={{ fontWeight: 800 }}>New message</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{msgBanner.text}</span>
        </motion.div>
      )}
      {status === 'online' && (
        <>
          <button
            onClick={() => { setShowMessages(true); setUnread(0); }}
            style={{ position: 'fixed', bottom: 'calc(16px + env(safe-area-inset-bottom))', right: 16, zIndex: 9000, width: 52, height: 52, borderRadius: '50%', background: T.ACCENT, color: '#1C1C1E', border: 'none', cursor: 'pointer', boxShadow: '0 6px 20px rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 }}
          >
            💬
            {unread > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, background: '#FF4545', color: '#fff', fontSize: 11, fontWeight: 900, borderRadius: 9, padding: '1px 6px', minWidth: 18, textAlign: 'center' }}>{unread}</span>
            )}
          </button>
          <AnimatePresence>
            {showMessages && (
              <MessagesScreen
                C={C} T={T} linkRef={linkRef}
                messages={messages} setMessages={setMessages}
                unread={unread} setUnread={setUnread}
                onClose={() => setShowMessages(false)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

function Connecting({ C }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, minHeight: '60dvh' }}>
      <motion.span
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: 'linear', duration: 1.1 }}
        style={{ width: 34, height: 34, borderRadius: '50%', border: `3px solid ${C.border2}`, borderTopColor: '#FFB800' }}
      />
      <div style={{ fontSize: 14, fontWeight: 700, color: C.muted }}>Looking for the computer…</div>
      <div style={{ fontSize: 12.5, color: C.faint, textAlign: 'center', maxWidth: 280, lineHeight: 1.5 }}>
        The KOG Worship app has to be open and this phone has to be on the same WiFi.
      </div>
    </div>
  );
}

function Denied({ C, reason, onRetry }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, minHeight: '60dvh' }}>
      <div style={{ fontSize: 42 }}>🔒</div>
      <div style={{ fontSize: 16, fontWeight: 800 }}>Not paired</div>
      <div style={{ fontSize: 13, color: C.muted, textAlign: 'center', maxWidth: 300, lineHeight: 1.55 }}>
        {reason === 'revoked'
          ? 'The operator disconnected all phones. Ask for the new pairing code on the computer.'
          : 'This phone is not authorised to control the output.'}
      </div>
      <motion.button {...stubTap} onClick={onRetry} style={{ background: '#FFB800', color: '#1C1C1E', border: 'none', borderRadius: 10, padding: '13px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
        Pair again
      </motion.button>
    </div>
  );
}
