import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Smartphone, MessageCircle, MonitorPlay, PenLine, Megaphone, Monitor,
  Settings2, ShieldCheck, Link2Off, RefreshCw, WifiOff, Loader2, X,
} from 'lucide-react';
import { C, T, R, FONT } from './theme.js';
import { createLink } from './link.js';
import { connectionLabel } from './live.js';
import { Sheet, SheetRow, Row, Btn, Pill, Divider, IconBtn } from './ui.jsx';
import AppHeader from './components/AppHeader.jsx';
import BottomNav from './components/BottomNav.jsx';
import PinPad from './screens/PinPad.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import LyricsScreen from './screens/LyricsScreen.jsx';
import BibleScreen from './screens/BibleScreen.jsx';
import CountdownScreen from './screens/CountdownScreen.jsx';
import MessagesScreen from './screens/MessagesScreen.jsx';
import PresentationScreen from './screens/PresentationScreen.jsx';
import DrawScreen from './screens/DrawScreen.jsx';
import OverlayScreen from './screens/OverlayScreen.jsx';
import OutputsScreen from './screens/OutputsScreen.jsx';
import StageScreen from './screens/StageScreen.jsx';

// Role routing lives in two places because the same build serves every surface:
//   * `?role=drummer` (or pastor / worship / follow) deep-links a phone straight
//     into a LOCKED stage view — no menus, no role picker, just that role's
//     screen. Drummer additionally goes full-screen metronome.
//   * `#stage` / `#control` keeps the legacy toggle used by the QR codes.
// The query wins over the hash so an operator can hand out a dedicated link
// that a singer cannot accidentally navigate away from.
const LOCKED_STAGE_ROLES = new Set(['drummer', 'pastor', 'worship', 'follow']);

const SUB_TITLES = {
  presentation: 'Presentation',
  draw: 'Draw',
  overlay: 'Audience message',
  outputs: 'Live outputs',
};

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

function readDeviceName() {
  try { return localStorage.getItem('kog-device-name') || 'This phone'; } catch { return 'This phone'; }
}
function readDeviceId() {
  try { return localStorage.getItem('kog-device-id') || ''; } catch { return ''; }
}
function writeDeviceName(name) {
  const clean = String(name || '').trim().slice(0, 64);
  if (!clean) return;
  try { localStorage.setItem('kog-device-name', clean); } catch { /* private mode */ }
}

// Two lanes travel the same socket: the booth is shared by every paired phone,
// direct is the private projectionist thread.
function channelOf(m) {
  return m && (m.channelId === 'booth' || m.conversationId === 'booth') ? 'booth' : 'direct';
}

export default function MobileApp() {
  // Parsed once on load: the URL is the provisioner, not a live preference.
  const [route] = useState(parseRoleRoute);
  const [role, setRole] = useState(route.role);
  const [state, setState] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [reason, setReason] = useState('');
  const [pinValue, setPinValue] = useState('');
  const [pinError, setPinError] = useState('');
  const linkRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [unreadBy, setUnreadBy] = useState({ booth: 0, direct: 0 });
  const unread = (unreadBy.booth || 0) + (unreadBy.direct || 0);
  const [msgChannel, setMsgChannel] = useState('booth');
  const [toast, setToast] = useState(null);
  const [view, setView] = useState('home');
  const [sub, setSub] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deviceName, setDeviceNameState] = useState(readDeviceName);

  // Refs so the socket listener (installed once) sees the live conversation
  // instead of the channel that was open when it mounted.
  const chatOpenRef = useRef(false);
  const msgChannelRef = useRef('booth');
  useEffect(() => { msgChannelRef.current = msgChannel; }, [msgChannel]);
  useEffect(() => { chatOpenRef.current = view === 'messages' && !sub; }, [view, sub]);

  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 5200); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    const link = createLink({
      role,
      onState: (s) => setState(s),
      onMessage: (m) => {
        if (m.t === 'msg') {
          const channel = channelOf(m);
          const fromOperator = m.senderId === 'operator';
          const self = readDeviceId();
          const ownEcho = !fromOperator && !!self && m.senderId === self;
          // Only the operator's messages are receipts; a phone-authored booth
          // message has no receipt rows to answer.
          if (fromOperator) { try { linkRef.current?.sendAck?.(m.id); } catch { /* noop */ } }
          setMessages((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            // The phone and the computer rarely share a clock exactly, so a
            // raw sort on the sender's timestamp can file a fresh reply above
            // messages already on screen. Sequence by arrival instead.
            const newest = prev.reduce((n, x) => Math.max(n, Number(x.timestamp) || 0), 0);
            return [...prev, {
              id: m.id,
              channelId: channel,
              conversationId: channel,
              senderId: fromOperator ? 'operator' : (ownEcho ? 'self' : m.senderId),
              senderName: fromOperator ? (m.senderName || 'Projectionist') : (ownEcho ? 'You' : (m.senderName || 'Remote')),
              recipientId: fromOperator ? 'self' : 'booth',
              content: m.content,
              priority: m.priority || 'normal',
              context: m.context || null,
              status: 'delivered',
              timestamp: Math.max(Number(m.timestamp) || Date.now(), newest + 1),
            }];
          });
          if (fromOperator) {
            const open = chatOpenRef.current && msgChannelRef.current === channel;
            if (open) {
              try { linkRef.current?.sendStatus?.(m.id, 'read', { readAt: Date.now() }); } catch { /* noop */ }
            } else {
              setUnreadBy((u) => ({ ...u, [channel]: (u[channel] || 0) + 1 }));
              setToast({ id: m.id, sender: m.senderName || 'Projectionist', text: m.content, channel });
            }
          }
        } else if (m.t === 'msg-ack') {
          setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: 'delivered' } : x));
        } else if (m.t === 'msg-status') {
          setMessages((prev) => prev.map((x) => x.id === m.id ? { ...x, status: m.status || x.status } : x));
        } else if (m.t === 'msg-sync') {
          const incoming = Array.isArray(m.messages) ? m.messages : [];
          const self = readDeviceId();
          setMessages((prev) => {
            const map = new Map(prev.map((x) => [x.id, x]));
            // Sync arrives in the desktop's stored order; keep that order and
            // never let an older device clock drop a message above the ones
            // already showing here.
            let clock = prev.reduce((n, x) => Math.max(n, Number(x.timestamp) || 0), 0);
            for (const im of incoming) {
              const channel = channelOf(im);
              const mine = im.senderId === self;
              if (!map.has(im.id)) {
                clock = Math.max(Number(im.timestamp) || 0, clock + 1);
                map.set(im.id, {
                  id: im.id,
                  channelId: channel,
                  conversationId: channel,
                  senderId: im.senderId === 'operator' ? 'operator' : (mine ? 'self' : im.senderId),
                  senderName: im.senderName || (mine ? 'You' : 'Remote'),
                  recipientId: im.recipientId,
                  content: im.content,
                  priority: im.priority || 'normal',
                  context: im.context || null,
                  status: im.status || 'sent',
                  timestamp: clock,
                });
              } else {
                const existing = map.get(im.id);
                map.set(im.id, { ...existing, status: im.status || existing.status, channelId: channel });
              }
            }
            return [...map.values()].sort((a, b) => a.timestamp - b.timestamp);
          });
          // Unread is per lane, and the open lane never accrues a badge.
          const pending = { booth: 0, direct: 0 };
          for (const im of incoming) {
            if (im.senderId !== 'operator') continue;
            if (im.status === 'read' || im.status === 'acknowledged') continue;
            pending[channelOf(im)] += 1;
          }
          pending[msgChannelRef.current] = 0;
          setUnreadBy((u) => ({ booth: Math.max(u.booth || 0, pending.booth), direct: Math.max(u.direct || 0, pending.direct) }));
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

  // A message marked "failed" never reached the socket, so re-sending it after
  // a reconnect cannot duplicate anything — it just delivers what was typed.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasOffline = prevStatusRef.current !== 'online';
    prevStatusRef.current = status;
    if (status !== 'online' || !wasOffline) return;
    const failed = messages.filter((m) => m.status === 'failed' && m.senderId !== 'operator');
    if (!failed.length) return;
    for (const m of failed) {
      const channel = m.channelId === 'booth' ? 'booth' : 'dm';
      const ok = linkRef.current?.sendMessage?.({
        id: m.id,
        channelId: channel,
        conversationId: channel === 'booth' ? 'booth' : readDeviceId(),
        senderId: readDeviceId(),
        senderName: readDeviceName(),
        recipientId: channel === 'booth' ? 'booth' : 'operator',
        content: m.content,
        priority: m.priority || 'normal',
        context: m.context || undefined,
        timestamp: Date.now(),
      });
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: ok ? 'sending' : 'failed' } : x)));
      if (ok) setTimeout(() => setMessages((prev) => prev.map((x) => (x.id === m.id && x.status === 'sending' ? { ...x, status: 'sent' } : x))), 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    document.body.style.background = C.bg;
    document.body.style.color = C.text;
    document.body.style.fontFamily = FONT;
    document.documentElement.style.colorScheme = 'dark';
  }, []);

  const send = (cmd, payload) => {
    if (!linkRef.current) return false;
    return linkRef.current.send(cmd, payload || {});
  };

  const submitPin = (value) => {
    setPinError('');
    linkRef.current?.submitPin(value);
  };

  const switchRole = (to) => {
    const next = to === 'stage' ? 'stage' : 'control';
    // Locked roles (drummer/pastor/etc.) cannot be switched away.
    if (route.lockedRole) return;
    setRole(next);
    setView('home');
    setSub(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('role');
      url.hash = next;
      window.history.replaceState(null, '', url.toString());
    } catch { /* noop */ }
  };

  const go = (next) => { setSub(null); setView(next); };
  const openSub = (id) => {
    setMoreOpen(false);
    setSettingsOpen(false);
    if (['lyrics', 'bible', 'countdown', 'messages', 'home'].includes(id)) { setSub(null); setView(id); return; }
    setSub(id);
  };

  const needsPin = PIN_STATUSES.includes(status);
  const showDenied = status === 'denied';
  const connecting = !state && (status === 'connecting' || status === 'reconnecting' || status === 'offline');

  if (needsPin) {
    return <Shell><PinPad C={C} value={pinValue} onChange={setPinValue} onSubmit={submitPin} error={pinError} role={role} onSwitchRole={switchRole} /></Shell>;
  }
  if (showDenied) {
    return (
      <Shell>
        <CentreState
          icon={<ShieldCheck size={26} color={T.ERROR} />}
          title="Not paired"
          body={reason === 'revoked'
            ? 'The operator disconnected the phones. Ask for the new pairing code on the computer.'
            : 'This phone is not authorised to control the output.'}
          action={<Btn variant="primary" icon={<RefreshCw size={15} />} onClick={() => { linkRef.current?.forgetToken(); linkRef.current?.retry(); setPinError(''); }}>Pair again</Btn>}
        />
      </Shell>
    );
  }
  if (connecting) {
    return (
      <Shell>
        <CentreState
          icon={<Loader2 size={24} color={T.ACCENT} style={{ animation: 'kog-spin 1.1s linear infinite' }} />}
          title="Looking for the computer"
          body="Keep KOG Worship open on the computer and stay on the same WiFi network."
          action={<Btn variant="quiet" onClick={() => linkRef.current?.retry()}>Retry now</Btn>}
        />
      </Shell>
    );
  }
  if (role === 'stage') {
    return (
      <Shell>
        <StageScreen C={C} state={state} status={status} send={send} onSwitchRole={switchRole} lockedRole={route.lockedRole} />
      </Shell>
    );
  }

  const SUB_COMPONENTS = {
    presentation: <PresentationScreen state={state} send={send} />,
    draw: <DrawScreen C={C} ACCENT={T.ACCENT} state={state} send={send} />,
    overlay: <OverlayScreen state={state} send={send} />,
    outputs: <OutputsScreen state={state} send={send} />,
  };
  const VIEW_COMPONENTS = {
    home: (
      <HomeScreen
        state={state}
        send={send}
        unread={unread}
        messages={messages}
        onNavigate={(v) => go(v)}
        onOpenScreen={openSub}
        onOpenMessages={() => go('messages')}
      />
    ),
    lyrics: <LyricsScreen state={state} send={send} />,
    bible: <BibleScreen C={C} ACCENT={T.ACCENT} state={state} send={send} />,
    countdown: <CountdownScreen state={state} send={send} />,
  };

  return (
    <Shell>
      <AppHeader
        status={status}
        unread={unread}
        title={sub ? SUB_TITLES[sub] : undefined}
        subtitle={sub ? (sub === 'presentation' ? (state?.sermon?.title || state?.live?.presentation?.deckTitle || '') : (state?.live?.title || state?.song?.title || '')) : undefined}
        onBack={sub ? () => setSub(null) : undefined}
        onOpenMessages={sub ? undefined : () => go('messages')}
        onOpenMore={() => setMoreOpen(true)}
      />

      <main style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!sub && view === 'messages' ? (
          <MessagesScreen
            messages={messages}
            setMessages={setMessages}
            channel={msgChannel}
            setChannel={setMsgChannel}
            unreadBy={unreadBy}
            setUnreadBy={setUnreadBy}
            linkRef={linkRef}
            online={status === 'online'}
            state={state}
            deviceName={readDeviceName()}
          />
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={sub || view}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: 'easeOut' }}
                style={{ minHeight: '100%' }}
              >
                {sub ? SUB_COMPONENTS[sub] : VIEW_COMPONENTS[view]}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </main>

      <BottomNav value={sub ? '__sub' : view} onChange={go} unread={unread} />

      {/* Incoming-message toast: sits under the header, never over the
          transport, and opens the conversation on tap. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            initial={{ opacity: 0, y: -14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            style={{
              position: 'fixed', left: 12, right: 12, zIndex: 9200,
              top: 'calc(66px + env(safe-area-inset-top))',
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 8px 8px 10px', borderRadius: R.md,
              background: 'rgba(36,40,50,0.97)', border: `1px solid ${T.ACCENT_LINE}`,
              boxShadow: T.SHADOW, fontFamily: 'inherit', color: C.text,
            }}
          >
            <button
              type="button"
              onClick={() => {
                const ch = toast.channel || 'booth';
                setToast(null);
                setUnreadBy((u) => ({ ...u, [ch]: 0 }));
                setMsgChannel(ch);
                go('messages');
              }}
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none', padding: 0, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left', color: C.text, minHeight: 40,
              }}
            >
              <span style={{ width: 32, height: 32, borderRadius: 10, background: T.ACCENT_SOFT, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <MessageCircle size={16} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: T.ACCENT }}>
                  New message · {toast.sender}
                </span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>
                  {toast.text}
                </span>
              </span>
            </button>
            <IconBtn label="Dismiss notification" onClick={() => setToast(null)} size={36} variant="quiet">
              <X size={15} />
            </IconBtn>
          </motion.div>
        )}
      </AnimatePresence>

      <Sheet open={moreOpen} title="More controls" onClose={() => setMoreOpen(false)}>
        <SheetRow icon={MonitorPlay} label="Presentation" hint={state?.sermon?.loaded ? state.sermon.title || 'Loaded' : 'No deck loaded'} onClick={() => openSub('presentation')} />
        <SheetRow icon={PenLine} label="Draw on output" hint={state?.draw?.strokes?.length ? `${state.draw.strokes.length} strokes on the wall` : 'Annotate the live slide'} onClick={() => openSub('draw')} />
        <SheetRow icon={Megaphone} label="Audience message" hint={state?.overlay ? 'A message is live' : 'Show a short text bug'} onClick={() => openSub('overlay')} />
        <SheetRow icon={Monitor} label="Live outputs" hint={`${(state?.outputs || []).length} display${(state?.outputs || []).length === 1 ? '' : 's'} configured`} onClick={() => openSub('outputs')} />
        <Divider />
        <SheetRow icon={Smartphone} label="Singer view" hint="Stage monitor for singers, locked to follow" onClick={() => { setMoreOpen(false); switchRole('stage'); }} />
        <SheetRow icon={Settings2} label="Settings & device" hint={deviceName} onClick={() => { setMoreOpen(false); setSettingsOpen(true); }} />
      </Sheet>

      <Sheet open={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 14, marginBottom: 10 }}>
          <Row gap={10}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: T.ACCENT_SOFT, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
              <Smartphone size={18} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800 }}>{readDeviceName()}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: C.faint, marginTop: 1 }}>Paired control remote</span>
            </span>
            <Pill tone={status === 'online' ? 'live' : 'warning'}>{connectionLabel(status)}</Pill>
          </Row>
          <Divider />
          <Row style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}>Desktop</span>
            <span style={{ fontSize: 11.5, color: C.text2, fontWeight: 800 }}>{window.location.hostname}:8787</span>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 700 }}>Service</span>
            <span style={{ fontSize: 11.5, color: C.text2, fontWeight: 800, maxWidth: '60%', textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {state?.service?.name || 'None open'}
            </span>
          </Row>
        </div>
        <div style={{ background: C.elevated, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 12, marginBottom: 10 }}>
          <label htmlFor="kog-phone-name" style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: C.faint, marginBottom: 6 }}>Name this phone</label>
          <input
            id="kog-phone-name"
            defaultValue={deviceName}
            placeholder="e.g. Camera phone"
            maxLength={64}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (!next || next === deviceName) return;
              writeDeviceName(next);
              setDeviceNameState(next);
              linkRef.current?.renameDevice?.(next);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            style={{ width: '100%', boxSizing: 'border-box', background: C.input, border: `1px solid ${C.border2}`, borderRadius: R.sm, color: C.text, fontSize: 16, fontWeight: 600, fontFamily: 'inherit', padding: '10px 12px', outline: 'none' }}
          />
          <div style={{ fontSize: 10.5, color: C.faint2, marginTop: 6, lineHeight: 1.45 }}>The projectionist sees this name on every message you send.</div>
        </div>
        <SheetRow icon={WifiOff} label="Reconnect now" hint="Re-run pairing with the desktop" onClick={() => { setSettingsOpen(false); linkRef.current?.retry(); }} />
        <SheetRow
          icon={Link2Off}
          label="Unpair this phone"
          hint="Forget the pairing code — you will need the 6-digit code again"
          tone="danger"
          onClick={() => { setSettingsOpen(false); linkRef.current?.forgetToken(); linkRef.current?.retry(); }}
        />
        <Row style={{ justifyContent: 'center', paddingTop: 6 }}>
          <span style={{ fontSize: 10, color: C.faint2, fontWeight: 700, letterSpacing: 0.4 }}>KOG Worship Remote · premium dark</span>
        </Row>
      </Sheet>
    </Shell>
  );
}

// Fixed-height app shell: the page itself never scrolls, each screen owns its
// own scroller, and the nav sits in flow above the home indicator.
function Shell({ children }) {
  return (
    <div
      style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        background: C.bg, color: C.text, fontFamily: FONT, overflow: 'hidden',
        position: 'relative',
      }}
    >
      <style>{`@keyframes kog-spin { to { transform: rotate(360deg) } }`}</style>
      {children}
    </div>
  );
}

function CentreState({ icon, title, body, action }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '24px 26px' }}>
      <span style={{ width: 56, height: 56, borderRadius: 17, background: C.elevated, border: `1px solid ${C.border2}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>{title}</div>
        <div style={{ fontSize: 13, color: C.muted, marginTop: 7, lineHeight: 1.55, maxWidth: 300 }}>{body}</div>
      </div>
      {action || null}
    </div>
  );
}
