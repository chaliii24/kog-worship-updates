import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageSquare } from 'lucide-react';

export default function MessagesScreen({ C, T, linkRef, onClose, messages, setMessages, unread, setUnread }) {
  const ACCENT = T.ACCENT;
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState('normal');
  const [quickReplies, setQuickReplies] = useState([]);
  const listRef = useRef(null);

  useEffect(() => {
    // Load quick replies for remote
    // (remote quick replies are defined locally; fallback defaults)
    setQuickReplies([
      { id: 1, label: 'Thank you.', text: 'Thank you.' },
      { id: 2, label: 'Go ahead.', text: 'Go ahead.' },
      { id: 3, label: 'Standby.', text: 'Standby.' },
      { id: 4, label: 'Please repeat.', text: 'Please repeat.' },
      { id: 5, label: 'Understood.', text: 'Understood.' },
    ]);
  }, []);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  // Mark operator messages as read when the conversation is open.
  useEffect(() => {
    if (!linkRef.current) return;
    for (const m of messages) {
      if (m.senderId === 'operator' && m.status !== 'read' && m.status !== 'acknowledged') {
        linkRef.current.sendStatus?.(m.id, 'read', { readAt: Date.now() });
      }
    }
  }, [messages, linkRef]);

  const send = (text, prio = priority) => {
    const content = (text || draft).trim();
    if (!content) return;
    const id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('m-' + Date.now());
    const msg = {
      id,
      conversationId: 'self', // phone only sees its own conversation
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
      conversationId: getDeviceId(),
      senderId: getDeviceId(),
      senderName: getDeviceName(),
      recipientId: 'operator',
      content,
      priority: prio,
      timestamp: msg.timestamp,
    });
    if (!ok) {
      setMessages((prev) => prev.map((m) => m.id === id ? { ...m, status: 'failed' } : m));
    } else {
      // optimistic: mark sent
      setTimeout(() => setMessages((prev) => prev.map((m) => m.id === id && m.status === 'sending' ? { ...m, status: 'sent' } : m)), 300);
    }
    setDraft('');
    setPriority('normal');
  };

  const onIncoming = (m) => {
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
    // mark read
    linkRef.current?.sendStatus?.(m.id, 'read', { readAt: Date.now() });
    setUnread((u) => Math.max(0, u - 1));
  };

  // Expose incoming handler via effect on messages? Instead, parent passes onMessage.
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: C.bg, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border2}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 16, fontWeight: 800 }}>Messages</span>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 20 }}>×</button>
      </div>
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.length === 0 && <div style={{ margin: 'auto', color: C.faint, fontSize: 13 }}>No messages yet. Say hi to the operator.</div>}
        {messages.map((m) => {
          const mine = m.senderId !== 'operator' && m.senderId !== 'self' ? false : (m.senderId === 'self' || m.senderId === getDeviceId());
          const isMine = m.senderId !== 'operator';
          return (
            <div key={m.id} style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
              <div style={{ padding: '8px 11px', borderRadius: 12, background: isMine ? ACCENT : (C.elevated2 || '#23242c'), color: isMine ? '#171208' : C.text, fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.content}
              </div>
              <div style={{ fontSize: 9.5, color: C.faint, marginTop: 2, textAlign: isMine ? 'right' : 'left' }}>
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {isMine && <span style={{ marginLeft: 4 }}>{m.status}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ padding: 10, borderTop: `1px solid ${C.border2}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {quickReplies.map((q) => (
            <button key={q.id} onClick={() => send(q.text)} style={{ fontSize: 11, padding: '4px 8px', borderRadius: 6, border: `1px solid ${C.border2}`, background: C.elevated2, color: C.text2, cursor: 'pointer' }}>{q.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ fontSize: 11, padding: '6px 8px', borderRadius: 6, background: C.input, color: C.text, border: `1px solid ${C.border2}` }}>
            <option value="normal">Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Type a message…"
            style={{ flex: 1, fontSize: 13, padding: '7px 10px', borderRadius: 6, background: C.input, color: C.text, border: `1px solid ${C.border2}`, outline: 'none' }}
          />
          <button onClick={() => send()} style={{ padding: '7px 12px', borderRadius: 6, background: ACCENT, color: '#171208', border: 'none', cursor: 'pointer', fontWeight: 800 }}><Send size={14} /></button>
        </div>
      </div>
    </div>
  );
}

function getDeviceId() {
  try {
    let id = localStorage.getItem('kog-device-id');
    if (!id) { id = 'dev-' + Math.random().toString(36).slice(2); localStorage.setItem('kog-device-id', id); }
    return id;
  } catch { return 'dev-' + Math.random().toString(36).slice(2); }
}
function getDeviceName() {
  try {
    let n = localStorage.getItem('kog-device-name');
    if (!n) { n = 'Remote ' + getDeviceId().slice(0, 4); localStorage.setItem('kog-device-name', n); }
    return n;
  } catch { return 'Remote'; }
}