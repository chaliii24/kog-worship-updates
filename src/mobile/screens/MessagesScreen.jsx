import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Send, MessageCircle, Check, CheckCheck, AlertCircle, Clock,
  Megaphone, Users, Search, X,
} from 'lucide-react';
import { C, T, R, TOUCH } from '../theme.js';
import { Row, Pill, Btn, EmptyState } from '../ui.jsx';

const PRIORITIES = [['normal', 'Normal'], ['important', 'Important'], ['urgent', 'Urgent']];
const FALLBACK_QUICK = [
  { id: 'q1', label: 'Thank you.', text: 'Thank you.' },
  { id: 'q2', label: 'Go ahead.', text: 'Go ahead.' },
  { id: 'q3', label: 'Standby.', text: 'Standby.' },
  { id: 'q4', label: 'Please repeat.', text: 'Please repeat.' },
  { id: 'q5', label: 'Understood.', text: 'Understood.' },
];

function deviceId() {
  try {
    let id = localStorage.getItem('kog-device-id');
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2); localStorage.setItem('kog-device-id', id); }
    return id;
  } catch { return 'dev-' + Math.random().toString(36).slice(2); }
}
function deviceName() {
  try {
    let n = localStorage.getItem('kog-device-name');
    if (!n) { n = 'Remote ' + deviceId().slice(0, 4); localStorage.setItem('kog-device-name', n); }
    return n;
  } catch { return 'Remote'; }
}

const fmtTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};
const channelOf = (m) => (m && m.channelId === 'booth' ? 'booth' : 'direct');

const STATUS = {
  sending: { label: 'Sending', icon: Clock, color: C.faint },
  sent: { label: 'Sent', icon: Check, color: C.faint },
  delivered: { label: 'Delivered', icon: CheckCheck, color: T.ACCENT_MUTED },
  read: { label: 'Read', icon: CheckCheck, color: T.ACCENT },
  acknowledged: { label: 'Read', icon: CheckCheck, color: T.ACCENT },
  failed: { label: 'Not delivered — tap to retry', icon: AlertCircle, color: T.ERROR },
};

// Two lanes over the same transport: Booth (every paired phone + the
// projectionist) and Direct (the private projectionist thread). Unread is per
// lane, delivery/read receipts are the existing msg-ack / msg-status ones.
export default function MessagesScreen({
  messages, setMessages, channel = 'booth', setChannel,
  unreadBy = {}, setUnreadBy, linkRef, online, state, deviceName: myName,
}) {
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState('normal');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [kb, setKb] = useState(0);
  const [navH, setNavH] = useState(60);
  const [short, setShort] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const lastSendRef = useRef({ at: 0, text: '' });

  useEffect(() => {
    const mq = window.matchMedia('(max-height: 520px)');
    const sync = () => setShort(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:0;padding-bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none';
    document.body.appendChild(probe);
    const inset = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    setNavH(60 + inset);
  }, []);

  const sorted = useMemo(
    () => [...(messages || [])].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)),
    [messages],
  );
  const lane = useMemo(() => sorted.filter((m) => channelOf(m) === channel), [sorted, channel]);

  // Opening a lane clears its badge and acknowledges what arrived there.
  useEffect(() => {
    setUnreadBy?.((u) => ({ ...u, [channel]: 0 }));
    if (!linkRef.current) return;
    for (const m of messages || []) {
      if (channelOf(m) !== channel) continue;
      if (m.senderId === 'operator' && m.status !== 'read' && m.status !== 'acknowledged') {
        linkRef.current.sendStatus?.(m.id, 'read', { readAt: Date.now() });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  // Keep the newest message visible on arrival, after the keyboard opens, and
  // when the lane changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    el.scrollTop = el.scrollHeight;
    // Bubbles can reflow after the status line changes, so pin once more.
    const raf = requestAnimationFrame(() => { const e = listRef.current; if (e) e.scrollTop = e.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [lane.length, lane[lane.length - 1]?.id, kb, channel]);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const sync = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, []);

  const quick = useMemo(() => {
    const share = Array.isArray(state?.quickReplies) ? state.quickReplies : [];
    return share.length ? share.map((q, i) => ({ id: q.id ?? i, label: q.label || q.text, text: q.text || q.label })) : FALLBACK_QUICK;
  }, [state?.quickReplies]);

  // What was live when the note was written, so "wrong verse" has a reference.
  const liveContext = useMemo(() => {
    const live = state?.live;
    if (live?.title) return `Live: ${live.title}${live.artist ? ` — ${live.artist}` : ''}`;
    if (state?.service?.name) return `Service: ${state.service.name}`;
    return '';
  }, [state?.live, state?.service]);

  const sendPayload = (msg) => {
    const id = msg.id;
    const sentId = channel === 'booth' ? 'booth' : deviceId();
    return linkRef.current?.sendMessage?.({
      id,
      channelId: channel === 'booth' ? 'booth' : 'dm',
      conversationId: sentId,
      senderId: deviceId(),
      senderName: myName || deviceName(),
      recipientId: channel === 'booth' ? 'booth' : 'operator',
      content: msg.content,
      priority: msg.priority,
      context: msg.context || undefined,
      timestamp: msg.timestamp,
    });
  };

  const post = (content, prio) => {
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('m-' + Date.now());
    // Same arrival sequencing as incoming: this phone's clock may sit behind
    // the computer's, which would otherwise file this note above the reply
    // that came in just before it.
    const newest = (messages || []).reduce((n, x) => Math.max(n, Number(x.timestamp) || 0), 0);
    const msg = {
      id,
      channelId: channel,
      conversationId: channel,
      senderId: 'self',
      senderName: 'You',
      recipientId: channel === 'booth' ? 'booth' : 'operator',
      content,
      priority: prio,
      context: liveContext,
      status: 'sending',
      timestamp: Math.max(Date.now(), newest + 1),
    };
    setMessages((prev) => [...prev, msg]);
    const ok = sendPayload(msg);
    if (!ok) {
      // Never left the phone: say so instead of pretending it was sent.
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'failed' } : m)));
      return false;
    }
    setTimeout(() => setMessages((prev) => prev.map((m) => (m.id === id && m.status === 'sending' ? { ...m, status: 'sent' } : m))), 350);
    return true;
  };

  const send = (text) => {
    const content = String(text ?? draft).trim();
    if (!content) return;
    // Guard against a double tap firing the same message twice.
    const now = Date.now();
    if (lastSendRef.current.text === content && now - lastSendRef.current.at < 400) return;
    lastSendRef.current = { at: now, text: content };
    post(content.slice(0, 4000), priority);
    setDraft('');
    setPriority('normal');
    requestAnimationFrame(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; });
  };

  const retry = (m) => {
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'sending' } : x)));
    const ok = sendPayload({ ...m, content: m.content, priority: m.priority || 'normal', timestamp: Date.now() });
    if (!ok) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'failed' } : x)));
      return;
    }
    setTimeout(() => setMessages((prev) => prev.map((x) => (x.id === m.id && x.status === 'sending' ? { ...x, status: 'sent' } : x))), 350);
  };

  const typing = kb - navH > 20;
  const compact = typing || short;
  const isBooth = channel === 'booth';
  const shown = query.trim()
    ? lane.filter((m) => String(m.content || '').toLowerCase().includes(query.trim().toLowerCase()))
    : lane;

  const switchLane = (next) => {
    setSearchOpen(false);
    setQuery('');
    setChannel?.(next);
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
        boxSizing: 'border-box', overflow: 'hidden',
        paddingBottom: Math.max(0, kb - navH),
      }}
    >
      {/* Lane switcher: Booth is the shared room, Direct is the private thread. */}
      <div style={{ padding: '8px 12px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 6, background: C.elevated, border: `1px solid ${C.border}`, borderRadius: R.md, padding: 4 }}>
          {[
            { id: 'booth', label: 'Booth', Icon: Megaphone, badge: unreadBy.booth || 0 },
            { id: 'direct', label: 'Direct', Icon: Users, badge: unreadBy.direct || 0 },
          ].map(({ id, label, Icon, badge }) => {
            const on = channel === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => switchLane(id)}
                style={{
                  flex: 1, minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  borderRadius: R.sm, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: on ? T.ACCENT_SOFT : 'transparent',
                  color: on ? T.ACCENT : C.muted,
                  fontSize: 12.5, fontWeight: 900,
                }}
              >
                <Icon size={14} /> {label}
                {badge ? (
                  <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: T.ACCENT, color: T.ON_ACCENT, fontSize: 9.5, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    {badge > 9 ? '9+' : badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conversation header */}
      <div style={{ padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <Row gap={10}>
          <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 12, background: T.ACCENT_SOFT, border: `1px solid ${T.ACCENT_LINE}`, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isBooth ? <Megaphone size={18} /> : <MessageCircle size={18} />}
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 5, background: online ? T.SUCCESS : C.faint2, border: `2px solid ${C.bg}` }} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: C.text }}>{isBooth ? 'Booth' : 'Projectionist'}</span>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: online ? T.SUCCESS : C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {!online ? 'Offline · messages wait until reconnected' : isBooth ? 'Everyone paired sees this' : 'Private · desktop only'}
            </span>
          </span>
          <button
            type="button"
            onClick={() => { setSearchOpen((v) => !v); setQuery(''); }}
            aria-label={searchOpen ? 'Close search' : 'Search this conversation'}
            style={{ width: 36, height: 36, borderRadius: 10, border: `1px solid ${C.border}`, background: searchOpen ? T.ACCENT_SOFT : 'transparent', color: searchOpen ? T.ACCENT : C.muted, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            {searchOpen ? <X size={16} /> : <Search size={16} />}
          </button>
        </Row>
        {searchOpen ? (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isBooth ? 'Search the booth…' : 'Search this thread…'}
            autoFocus
            style={{
              marginTop: 8, width: '100%', boxSizing: 'border-box',
              background: C.input, border: `1px solid ${C.border2}`, borderRadius: R.sm,
              color: C.text, fontSize: 16, fontFamily: 'inherit', padding: '9px 12px', outline: 'none',
            }}
          />
        ) : null}
      </div>

      {/* History */}
      <div
        ref={listRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 9,
        }}
      >
        {shown.length === 0 ? (
          <EmptyState
            icon={isBooth ? Megaphone : MessageCircle}
            title={query.trim() ? 'No matches' : isBooth ? 'Booth is quiet' : 'No messages yet'}
            hint={query.trim()
              ? 'Try a shorter phrase.'
              : isBooth
                ? 'Post a note the whole team can see — everyone paired with the booth reads it.'
                : 'Send a private note to the projectionist — quick replies below are one tap.'}
            style={{ margin: 'auto 0' }}
          />
        ) : null}

        {shown.map((m) => {
          const mine = m.senderId !== 'operator';
          const fromOtherPhone = isBooth && mine && m.senderId !== 'self';
          const st = STATUS[m.status] || null;
          const StIcon = st?.icon;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', minWidth: 0, alignSelf: mine ? 'flex-end' : 'flex-start' }}>
              {fromOtherPhone ? (
                <span style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.7, textTransform: 'uppercase', color: C.faint, marginBottom: 2, marginLeft: 3 }}>
                  {m.senderName || 'Remote'}
                </span>
              ) : null}
              <div
                style={{
                  // The bubble hugs its text: it never stretches to the column
                  // width and a long word can never push it past the screen.
                  width: 'fit-content',
                  maxWidth: '100%',
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: '9px 12px',
                  borderRadius: mine ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                  background: mine ? T.ACCENT_GRAD : C.elevated,
                  border: `1px solid ${mine ? 'rgba(255,201,40,0.55)' : C.border}`,
                  color: mine ? T.ON_ACCENT : C.text,
                  fontSize: 14, lineHeight: 1.45, fontWeight: mine ? 600 : 500,
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word',
                  boxShadow: mine ? '0 4px 12px rgba(255,201,40,0.10)' : 'none',
                }}
              >
                {m.content}
              </div>
              {m.context ? (
                <span style={{ fontSize: 9.5, color: C.faint2, marginTop: 2, maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.context || ''}
                </span>
              ) : null}
              <Row gap={5} style={{ marginTop: 3, maxWidth: '100%', minWidth: 0, flexWrap: 'wrap', flexDirection: mine ? 'row-reverse' : 'row' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: C.faint2 }}>{fmtTime(m.timestamp)}</span>
                {mine && st ? (
                  <button
                    type="button"
                    onClick={m.status === 'failed' ? () => retry(m) : undefined}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3, padding: 0,
                      background: 'transparent', border: 'none', fontFamily: 'inherit',
                      fontSize: 9.5, fontWeight: 800, color: st.color,
                      cursor: m.status === 'failed' ? 'pointer' : 'default',
                    }}
                  >
                    <StIcon size={11} /> {st.label}
                  </button>
                ) : null}
                {m.priority === 'urgent' ? <Pill tone="error" style={{ fontSize: 8, padding: '1px 5px' }}>Urgent</Pill> : null}
                {m.priority === 'important' ? <Pill tone="warning" style={{ fontSize: 8, padding: '1px 5px' }}>Important</Pill> : null}
              </Row>
            </div>
          );
        })}
      </div>

      {/* Composer — a flow sibling below the scroller, so it can never be
          covered by messages and never sits under the bottom nav. */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.bgAlt, padding: '8px 10px 10px' }}>
        <style>{'.kog-quick::-webkit-scrollbar{display:none}'}</style>
        <div
          className="kog-quick"
          style={{
            display: 'flex', flexWrap: 'nowrap', gap: 5,
            overflowX: 'auto', overflowY: 'hidden',
            WebkitOverflowScrolling: 'touch', overscrollBehaviorX: 'contain',
            scrollbarWidth: 'none', msOverflowStyle: 'none',
            touchAction: 'pan-x', paddingBottom: 8,
          }}
        >
          {quick.map((q) => (
            <button
              key={q.id}
              type="button"
              onClick={() => send(q.text)}
              style={{
                flexShrink: 0, height: 32, padding: '0 11px', borderRadius: 999,
                background: C.elevated, border: `1px solid ${C.border}`, color: C.text2,
                fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{q.label}</button>
          ))}
        </div>
        {compact ? null : <Row gap={6} style={{ marginBottom: 7 }}>
          {PRIORITIES.map(([v, label]) => {
            const on = priority === v;
            return (
              <button
                key={v}
                type="button"
                onClick={() => setPriority(v)}
                style={{
                  height: 26, padding: '0 10px', borderRadius: 999, fontFamily: 'inherit',
                  fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase',
                  cursor: 'pointer',
                  background: on ? (v === 'urgent' ? T.ERROR_SOFT : v === 'important' ? T.WARNING_SOFT : T.ACCENT_SOFT) : 'transparent',
                  border: `1px solid ${on ? (v === 'urgent' ? T.ERROR_LINE : v === 'important' ? T.WARNING_LINE : T.ACCENT_LINE) : C.border}`,
                  color: on ? (v === 'urgent' ? T.ERROR : v === 'important' ? T.WARNING : T.ACCENT) : C.faint,
                }}
              >{label}</button>
            );
          })}
        </Row>}
        <Row gap={8} align="flex-end">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setTimeout(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, 120)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={isBooth ? 'Message the booth…' : 'Message the projectionist…'}
            rows={1}
            style={{
              flex: 1, minWidth: 0, minHeight: TOUCH, maxHeight: 120, resize: 'none',
              background: C.input, border: `1px solid ${C.border2}`, borderRadius: R.lg,
              color: C.text, fontSize: 16, fontWeight: 500, fontFamily: 'inherit',
              padding: '12px 13px', outline: 'none', lineHeight: 1.4,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)',
            }}
          />
          <Btn
            variant="primary"
            size="md"
            onClick={() => send()}
            disabled={!draft.trim()}
            aria-label="Send message"
            style={{ width: TOUCH, padding: 0, flexShrink: 0, borderRadius: 16 }}
          >
            <Send size={18} />
          </Btn>
        </Row>
        {compact ? null : (
          <div style={{ fontSize: 9.5, color: C.faint2, marginTop: 6, textAlign: 'center' }}>
            {isBooth
              ? 'Booth: everyone paired sees this, including the projectionist'
              : 'Direct: only the projectionist sees this · history is kept on the computer'}
          </div>
        )}
      </div>
    </div>
  );
}
