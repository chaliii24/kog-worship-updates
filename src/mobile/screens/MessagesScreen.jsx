import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, MessageCircle, Check, CheckCheck, AlertCircle, Clock } from 'lucide-react';
import { C, T, R, TOUCH } from '../theme.js';
import { Row, Pill, Btn, EmptyState } from '../ui.jsx';

const PRIORITIES = [['normal', 'Normal'], ['important', 'Important'], ['urgent', 'Urgent']];
const QUICK = ['Thank you.', 'Go ahead.', 'Standby.', 'Please repeat.', 'Understood.'];

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

const STATUS = {
  sending: { label: 'Sending', icon: Clock, color: C.faint },
  sent: { label: 'Sent', icon: Check, color: C.faint },
  delivered: { label: 'Delivered', icon: CheckCheck, color: T.ACCENT_MUTED },
  read: { label: 'Read', icon: CheckCheck, color: T.ACCENT },
  acknowledged: { label: 'Read', icon: CheckCheck, color: T.ACCENT },
  failed: { label: 'Not delivered — tap to retry', icon: AlertCircle, color: T.ERROR },
};

// Operator ↔ projectionist conversation. Transport, ids, conversation and
// persistence are the existing ones (t:'msg' / msg-ack / msg-status /
// msg-sync); this screen only changes how that conversation is presented.
export default function MessagesScreen({ messages, setMessages, unread, setUnread, linkRef, online }) {
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState('normal');
  const [kb, setKb] = useState(0);
  // Height of the app's bottom nav (60px row + home-indicator inset). The nav
  // is a flow sibling BELOW this screen, so when the keyboard opens we only
  // need to rise by the part of the keyboard that is above the nav — padding
  // the full keyboard height would leave a dead band under the field.
  const [navH, setNavH] = useState(60);
  // Landscape phones are ~390px tall: the composer's optional rows would leave
  // the conversation with a couple of centimetres, so they collapse there too.
  const [short, setShort] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

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

  // Opening the conversation clears the badge and acknowledges what arrived.
  useEffect(() => {
    setUnread(0);
    if (!linkRef.current) return;
    for (const m of messages || []) {
      if (m.senderId === 'operator' && m.status !== 'read' && m.status !== 'acknowledged') {
        linkRef.current.sendStatus?.(m.id, 'read', { readAt: Date.now() });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message visible on arrival, and after the keyboard opens.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sorted.length, kb]);

  // iOS keeps the layout viewport full height when the keyboard opens, which
  // would bury the composer. Track the visual viewport and lift the sheet by
  // the covered amount so typing never hides the field.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const sync = () => setKb(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync();
    return () => { vv.removeEventListener('resize', sync); vv.removeEventListener('scroll', sync); };
  }, []);

  const post = (content, prio) => {
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('m-' + Date.now());
    const msg = {
      id,
      conversationId: 'self',
      senderId: 'self',
      senderName: 'Me',
      recipientId: 'operator',
      content,
      priority: prio,
      status: 'sending',
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    const ok = linkRef.current?.sendMessage?.({
      id,
      conversationId: deviceId(),
      senderId: deviceId(),
      senderName: deviceName(),
      recipientId: 'operator',
      content,
      priority: prio,
      timestamp: msg.timestamp,
    });
    if (!ok) {
      // Never left the phone: say so instead of pretending it was sent.
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'failed' } : m)));
      return false;
    }
    setTimeout(() => setMessages((prev) => prev.map((m) => (m.id === id && m.status === 'sending' ? { ...m, status: 'sent' } : m))), 350);
    return true;
  };

  const lastSendRef = useRef({ at: 0, text: '' });
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
    const ok = linkRef.current?.sendMessage?.({
      id: m.id,
      conversationId: deviceId(),
      senderId: deviceId(),
      senderName: deviceName(),
      recipientId: 'operator',
      content: m.content,
      priority: m.priority || 'normal',
      timestamp: Date.now(),
    });
    if (!ok) {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: 'failed' } : x)));
      return;
    }
    setTimeout(() => setMessages((prev) => prev.map((x) => (x.id === m.id && x.status === 'sending' ? { ...x, status: 'sent' } : x))), 350);
  };

  // The keyboard genuinely covers the bottom of the page on iOS (100dvh does
  // not shrink there, only the visual viewport does). Android resizes the
  // layout viewport instead, so kb stays 0 and nothing has to change.
  const typing = kb - navH > 20;
  const compact = typing || short;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
        // border-box so the keyboard padding eats INTO the screen instead of
        // growing it past the shell (content-box made the composer overflow
        // and get clipped by the shell's overflow:hidden).
        boxSizing: 'border-box', overflow: 'hidden',
        paddingBottom: Math.max(0, kb - navH),
      }}
    >
      {/* Conversation header */}
      <div style={{ padding: '10px 16px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <Row gap={10}>
          <span style={{ position: 'relative', width: 38, height: 38, borderRadius: 12, background: T.ACCENT_SOFT, border: `1px solid ${T.ACCENT_LINE}`, color: T.ACCENT, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MessageCircle size={18} />
            <span style={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: 5, background: online ? T.SUCCESS : C.faint2, border: `2px solid ${C.bg}` }} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 900, color: C.text }}>Projectionist</span>
            <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: online ? T.SUCCESS : C.faint }}>
              {online ? 'Desktop · messages deliver instantly' : 'Offline · messages wait until reconnected'}
            </span>
          </span>
          {unread ? <Pill tone="accent">{unread} new</Pill> : null}
        </Row>
      </div>

      {/* History */}
      <div
        ref={listRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch',
          padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 9,
        }}
      >
        {sorted.length === 0 ? (
          <EmptyState
            icon={MessageCircle}
            title="No messages yet"
            hint="Send a note to the booth — quick replies below are one tap."
            style={{ margin: 'auto 0' }}
          />
        ) : null}

        {sorted.map((m) => {
          const mine = m.senderId !== 'operator';
          const st = STATUS[m.status] || null;
          const StIcon = st?.icon;
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  padding: '9px 12px',
                  borderRadius: mine ? '16px 16px 5px 16px' : '16px 16px 16px 5px',
                  background: mine ? T.ACCENT_GRAD : C.elevated,
                  border: `1px solid ${mine ? 'rgba(255,201,40,0.55)' : C.border}`,
                  color: mine ? T.ON_ACCENT : C.text,
                  fontSize: 14, lineHeight: 1.45, fontWeight: mine ? 600 : 500,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  boxShadow: mine ? '0 4px 12px rgba(255,201,40,0.10)' : 'none',
                }}
              >
                {m.content}
              </div>
              <Row gap={5} style={{ marginTop: 3, flexDirection: mine ? 'row-reverse' : 'row' }}>
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
        {/* Quick replies: one row, swiped horizontally, no visible scrollbar. */}
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
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              style={{
                flexShrink: 0, height: 32, padding: '0 11px', borderRadius: 999,
                background: C.elevated, border: `1px solid ${C.border}`, color: C.text2,
                fontSize: 11.5, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >{q}</button>
          ))}
        </div>
        {/* Priority chips collapse while typing and on short (landscape)
            screens: otherwise the conversation is left with ~30px. */}
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
            placeholder="Message the projectionist…"
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
            Delivered straight to the booth · history is kept on the computer
          </div>
        )}
      </div>
    </div>
  );
}
