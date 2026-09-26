import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getTheme } from '../lib/theme.js';
import { stubTap } from '../lib/anim.js';
import { createLink } from './link.js';
import PinPad from './screens/PinPad.jsx';
import ControlScreen from './screens/ControlScreen.jsx';
import StageScreen from './screens/StageScreen.jsx';

// The role lives in the URL hash so the SAME build serves both jobs and it
// works identically whether the page came from Vite (:5173) or Electron (:8787).
// `#/stage` was not usable here because the desktop renderer routes its stage
// output window on `hash.includes('/stage')`.
function roleFromHash() {
  return String(window.location.hash || '').toLowerCase().includes('stage') ? 'stage' : 'control';
}

const PIN_STATUSES = ['need-pin', 'wrong', 'locked'];

export default function MobileApp() {
  const [role] = useState(roleFromHash);
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [reason, setReason] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const linkRef = useRef(null);

  useEffect(() => {
    const link = createLink({
      role,
      onState: (s) => setState(s),
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
    window.location.hash = to;
    window.location.reload();
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
              background: banner.tone === 'bad' ? 'rgba(239,68,68,0.18)' : 'rgba(34,197,94,0.14)',
              borderBottom: `1px solid ${banner.tone === 'bad' ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.3)'}`,
              color: banner.tone === 'bad' ? '#f87171' : '#4ade80',
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
        <StageScreen C={C} state={state} status={status} onSwitchRole={switchRole} />
      ) : (
        <ControlScreen C={C} T={T} state={state} status={status} send={send} onSwitchRole={switchRole} />
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
        style={{ width: 34, height: 34, borderRadius: '50%', border: `3px solid ${C.border2}`, borderTopColor: '#3b82f6' }}
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
      <motion.button {...stubTap} onClick={onRetry} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 10, padding: '13px 26px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
        Pair again
      </motion.button>
    </div>
  );
}
