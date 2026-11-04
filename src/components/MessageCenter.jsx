import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Send, MessageSquare, Users, Check, CheckCheck, AlertTriangle, Zap, Clock, Trash2 } from 'lucide-react';

const PRIORITY_COLORS = { normal: '#94a3b8', important: '#f59e0b', urgent: '#ef4444' };

export default function MessageCenter({
  C, ACCENT, onClose,
  conversations, messagesByConv, connectedDevices,
  loadConversationMessages, sendMessageToRemote, markConversationRead,
  unreadTotal,
}) {
  const [activeConv, setActiveConv] = useState(null);
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState('normal');
  const [quickReplies, setQuickReplies] = useState([]);

  useEffect(() => {
    if (window.require) {
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.invoke('quick-replies-get', 'operator').then((r) => setQuickReplies(Array.isArray(r) ? r : [])).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (activeConv) {
      loadConversationMessages(activeConv);
      markConversationRead(activeConv);
    }
  }, [activeConv, loadConversationMessages, markConversationRead]);

  const convList = Array.isArray(conversations) ? conversations : [];
  const deviceFor = (convId) => (connectedDevices || []).find((d) => d.deviceId === convId);
  const msgs = activeConv ? (messagesByConv[activeConv] || []) : [];

  const send = async (text, prio = priority) => {
    const content = (text || draft).trim();
    if (!content || !activeConv) return;
    await sendMessageToRemote({ deviceId: activeConv, content, priority: prio });
    setDraft('');
    setPriority('normal');
  };

  const statusIcon = (m) => {
    if (m.senderId === 'operator') {
      if (m.status === 'acknowledged') return <CheckCheck size={12} color="#22c55e" />;
      if (m.status === 'read') return <CheckCheck size={12} color="#60a5fa" />;
      if (m.status === 'delivered') return <Check size={12} color="#94a3b8" />;
      if (m.status === 'failed') return <AlertTriangle size={12} color="#ef4444" />;
      return <Clock size={12} color="#94a3b8" />;
    }
    return null;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 720, maxWidth: '92vw', height: 560, maxHeight: '88vh', background: C.panel || '#1a1b22', border: '1px solid var(--ui-border2)', borderRadius: 14, display: 'flex', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        {/* Sidebar: conversations */}
        <div style={{ width: 220, borderRight: '1px solid var(--ui-border2)', display: 'flex', flexDirection: 'column', background: C.elevated || '#13141a' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--ui-border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Messages</span>
            <span style={{ fontSize: 10, color: C.faint }}>{unreadTotal} unread</span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {convList.length === 0 && (
              <div style={{ padding: 16, fontSize: 11, color: C.faint, textAlign: 'center' }}>No conversations yet. Connected remotes will appear here.</div>
            )}
            {convList.map((c) => {
              const dev = deviceFor(c.conversationId);
              const active = activeConv === c.conversationId;
              return (
                <button key={c.conversationId} onClick={() => setActiveConv(c.conversationId)}
                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4, borderRadius: 8, border: '1px solid ' + (active ? ACCENT : 'transparent'), background: active ? 'rgba(255,184,0,0.08)' : 'transparent', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev?.deviceName || c.conversationId}</span>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dev?.connected ? '#22c55e' : '#64748b', flexShrink: 0 }} />
                  </div>
                  {c.lastMessage && (
                    <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.lastMessage.sender_id === 'operator' ? 'You: ' : ''}{c.lastMessage.content}
                    </div>
                  )}
                  {c.unread > 0 && (
                    <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9.5, fontWeight: 800, background: ACCENT, color: '#171208', borderRadius: 9, padding: '1px 6px' }}>{c.unread}</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Connected devices without conversation yet */}
          {connectedDevices.filter((d) => !convList.some((c) => c.conversationId === d.deviceId)).map((d) => (
            <button key={d.deviceId} onClick={() => setActiveConv(d.deviceId)}
              style={{ margin: '0 6px 6px', padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--ui-border2)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: C.text2 }}>{d.deviceName}</span>
                <span style={{ fontSize: 9, color: C.faint }}>new</span>
              </div>
            </button>
          ))}
        </div>

        {/* Conversation pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--ui-border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
              {activeConv ? (deviceFor(activeConv)?.deviceName || activeConv) : 'Select a conversation'}
            </span>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}><X size={16} /></button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!activeConv && <div style={{ margin: 'auto', fontSize: 12, color: C.faint }}>Pick a remote on the left to start chatting.</div>}
            {msgs.map((m) => {
              const mine = m.senderId === 'operator';
              return (
                <div key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                  <div style={{
                    padding: '8px 11px', borderRadius: 12,
                    background: mine ? ACCENT : (C.elevated2 || '#23242c'),
                    color: mine ? '#171208' : C.text,
                    fontSize: 12.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    borderLeft: !mine && m.priority !== 'normal' ? `3px solid ${PRIORITY_COLORS[m.priority]}` : 'none',
                  }}>
                    {m.content}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, justifyContent: mine ? 'flex-end' : 'flex-start', fontSize: 9.5, color: C.faint }}>
                    <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.priority !== 'normal' && <span style={{ color: PRIORITY_COLORS[m.priority], fontWeight: 800, textTransform: 'uppercase' }}>{m.priority}</span>}
                    {statusIcon(m)}
                    {!mine && (
                      <button onClick={async () => {
                        if (window.require) {
                          const { ipcRenderer } = window.require('electron');
                          await ipcRenderer.invoke('messages-ack', { id: m.id, status: 'acknowledged', extra: { ackAt: Date.now() } });
                          await ipcRenderer.invoke('mobile-send-status', { deviceId: activeConv, id: m.id, status: 'acknowledged', ackAt: Date.now() });
                        }
                      }} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', fontSize: 9 }} title="Acknowledge">ack</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {activeConv && (
            <div style={{ padding: 10, borderTop: '1px solid var(--ui-border2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* Quick replies */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {quickReplies.map((q) => (
                  <button key={q.id} onClick={() => send(q.text)} style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--ui-border2)', background: C.elevated2, color: C.text2, cursor: 'pointer' }}>{q.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ fontSize: 11, padding: '6px 8px', borderRadius: 6, background: C.input, color: C.text, border: '1px solid var(--ui-border2)' }}>
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                  placeholder="Type a message…"
                  style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', borderRadius: 6, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', outline: 'none' }}
                />
                <button onClick={() => send()} style={{ padding: '7px 12px', borderRadius: 6, background: ACCENT, color: '#171208', border: 'none', cursor: 'pointer', fontWeight: 800 }}><Send size={14} /></button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
