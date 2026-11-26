import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  X, Send, Check, CheckCheck, AlertTriangle, Clock, Users,
  Search, VolumeX, Megaphone,
} from 'lucide-react';

const PRIORITY_COLORS = { normal: '#94a3b8', important: '#f59e0b', urgent: '#ef4444' };
const BOOTH = 'booth';
const FALLBACK_QUICK = [
  { id: 'q1', label: 'Received.', text: 'Received.' },
  { id: 'q2', label: 'Go ahead.', text: 'Go ahead.' },
  { id: 'q3', label: 'Standby.', text: 'Standby.' },
  { id: 'q4', label: 'Please repeat.', text: 'Please repeat.' },
  { id: 'q5', label: 'Hold — 1 minute.', text: 'Hold — 1 minute.' },
  { id: 'q6', label: 'Thank you.', text: 'Thank you.' },
];

const fmtTime = (ts) => {
  try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
};

export default function MessageCenter({
  C, ACCENT, onClose,
  conversations, messagesByConv, connectedDevices,
  mutedDevices, setDeviceMuted,
  loadConversationMessages, sendMessageToRemote, markConversationRead,
  searchMessageHistory, liveContext, unreadTotal,
}) {
  const [activeConv, setActiveConv] = useState(BOOTH);
  const [draft, setDraft] = useState('');
  const [priority, setPriority] = useState('normal');
  const [quickReplies, setQuickReplies] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    ipcRenderer.invoke('quick-replies-get', 'shared')
      .then((r) => setQuickReplies(Array.isArray(r) && r.length ? r : FALLBACK_QUICK))
      .catch(() => setQuickReplies(FALLBACK_QUICK));
  }, []);

  useEffect(() => {
    if (!activeConv) return;
    loadConversationMessages(activeConv);
    markConversationRead(activeConv);
  }, [activeConv, loadConversationMessages, markConversationRead]);

  // Real-time read receipts: mark incoming messages read as they arrive while
  // the conversation is open, without requiring the chat to be reopened. A
  // booth row only flips to "read" once every member has read it, so keep
  // asking for a fresh aggregate while unread incoming rows exist.
  useEffect(() => {
    if (!activeConv) return;
    const msgs = messagesByConv ? (messagesByConv[activeConv] || []) : [];
    const hasUnreadIncoming = msgs.some((m) => m.senderId !== 'operator' && m.status !== 'read' && m.status !== 'acknowledged');
    if (hasUnreadIncoming) markConversationRead(activeConv);
  }, [activeConv, messagesByConv, markConversationRead]);

  // Search runs against the database, so it also finds threads not yet loaded.
  useEffect(() => {
    const q = query.trim();
    if (!q || !searchMessageHistory) { setResults([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchMessageHistory(q)); } catch { setResults([]); }
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query, searchMessageHistory]);

  const convList = Array.isArray(conversations) ? conversations : [];
  const devices = Array.isArray(connectedDevices) ? connectedDevices : [];
  const boothConv = convList.find((c) => c.conversationId === BOOTH || c.kind === 'booth') || null;
  const dmConvs = convList.filter((c) => c.conversationId !== BOOTH && c.kind !== 'booth');
  const deviceFor = (convId) => devices.find((d) => d.deviceId === convId);
  const nameFor = (msg) => msg.senderName || deviceFor(msg.senderId)?.deviceName || 'Remote';
  const isBooth = activeConv === BOOTH;
  const msgs = activeConv ? (messagesByConv[activeConv] || []) : [];

  // Keep the newest message in view: on opening a thread, when a note arrives
  // or is sent, and once more on the next frame for late layout/height changes.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return undefined;
    el.scrollTop = el.scrollHeight;
    const raf = requestAnimationFrame(() => { const e = listRef.current; if (e) e.scrollTop = e.scrollHeight; });
    return () => cancelAnimationFrame(raf);
  }, [activeConv, query, msgs.length]);
  const activeDevice = isBooth ? null : deviceFor(activeConv);
  const isMuted = activeDevice ? mutedDevices?.has(activeDevice.deviceId) : false;

  const boothMembers = devices.length;
  const connCount = devices.filter((d) => d.connected !== false).length;

  const statusIcon = (m) => {
    if (m.senderId !== 'operator') return null;
    if (m.status === 'acknowledged') return <CheckCheck size={12} color="#22c55e" />;
    if (m.status === 'read') return <CheckCheck size={12} color="#60a5fa" />;
    if (m.status === 'delivered') return <Check size={12} color="#94a3b8" />;
    if (m.status === 'failed') return <AlertTriangle size={12} color="#ef4444" />;
    return <Clock size={12} color="#94a3b8" />;
  };

  // Booth receipts: every connected phone is a member, so the aggregate only
  // reaches "read" when the slowest device has read it.
  const receiptLine = (m) => {
    if (!isBooth || m.senderId !== 'operator') return null;
    const receipts = Array.isArray(m.receipts) ? m.receipts : [];
    if (!receipts.length) return null;
    const total = Math.max(boothMembers, receipts.length);
    const delivered = receipts.filter((r) => r.delivered_at).length;
    const read = receipts.filter((r) => r.read_at).length;
    const acked = receipts.filter((r) => r.ack_at).length;
    const parts = [`Delivered ${delivered}/${total}`];
    if (read) parts.push(`read ${read}/${total}`);
    if (acked) parts.push(`ack ${acked}/${total}`);
    return parts.join(' · ');
  };

  const send = async (text, prio = priority) => {
    const content = (text || draft).trim();
    if (!content) return;
    await sendMessageToRemote({
      channelId: isBooth ? BOOTH : 'dm',
      deviceId: isBooth ? undefined : activeConv,
      content,
      priority: prio,
      context: liveContext || '',
    });
    setDraft('');
    setPriority('normal');
    if (activeConv) loadConversationMessages(activeConv);
  };

  const acknowledge = async (m) => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    const at = Date.now();
    try {
      await ipcRenderer.invoke('messages-ack', { id: m.id, status: 'acknowledged', extra: { ackAt: at } });
      if (m.senderId && m.senderId !== 'operator') {
        await ipcRenderer.invoke('mobile-send-status', { deviceId: m.senderId, id: m.id, status: 'acknowledged', ackAt: at });
      }
      loadConversationMessages(activeConv);
    } catch { /* noop */ }
  };

  const openConversation = (convId) => {
    setActiveConv(convId);
    setQuery('');
    if (convId === BOOTH) setResults([]);
  };

  const activeTitle = useMemo(() => {
    if (isBooth) return 'Booth';
    return activeDevice?.deviceName || activeConv || 'Select a conversation';
  }, [isBooth, activeDevice, activeConv]);

  const sidebarRow = ({ key, label, sub, unread, connected, muted, onClick, pinned }) => (
    <button
      key={key}
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4, borderRadius: 8,
        border: '1px solid ' + (activeConv === key ? ACCENT : 'transparent'),
        background: activeConv === key ? 'rgba(255,184,0,0.08)' : 'transparent',
        cursor: 'pointer', opacity: muted ? 0.62 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: pinned ? 800 : 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
          {pinned ? <Megaphone size={12} color={ACCENT} /> : null}
          {label}
          {muted ? <VolumeX size={10} color={C.faint} /> : null}
        </span>
        {connected === undefined ? null : (
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#22c55e' : '#64748b', flexShrink: 0 }} />
        )}
      </div>
      {sub ? (
        <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>
      ) : null}
      {unread > 0 ? (
        <span style={{ display: 'inline-block', marginTop: 4, fontSize: 9.5, fontWeight: 800, background: ACCENT, color: '#171208', borderRadius: 9, padding: '1px 6px' }}>{unread}</span>
      ) : null}
    </button>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 760, maxWidth: '94vw', height: 580, maxHeight: '90vh', background: C.panel || '#1a1b22', border: '1px solid var(--ui-border2)', borderRadius: 14, display: 'flex', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
      >
        {/* Sidebar: search, pinned booth, direct messages */}
        <div style={{ width: 236, borderRight: '1px solid var(--ui-border2)', display: 'flex', flexDirection: 'column', background: C.elevated || '#13141a' }}>
          <div style={{ padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Messages</span>
            <span style={{ fontSize: 10, color: C.faint }}>{unreadTotal} unread</span>
          </div>
          <div style={{ padding: '0 10px 8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 7, background: C.input || '#101116', border: '1px solid var(--ui-border2)' }}>
              <Search size={12} color={C.faint} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages…"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 11.5, fontFamily: 'inherit' }}
              />
              {query ? (
                <button onClick={() => setQuery('')} style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 0, lineHeight: 0 }}><X size={12} /></button>
              ) : null}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
            {sidebarRow({
              key: BOOTH,
              label: 'Booth',
              sub: boothMembers ? `${boothMembers} device${boothMembers === 1 ? '' : 's'} · ${connCount} online` : 'All remotes',
              unread: boothConv?.unread || 0,
              connected: connCount > 0,
              pinned: true,
              onClick: () => openConversation(BOOTH),
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 4px 5px', fontSize: 9.5, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase', color: C.faint }}>
              <Users size={10} /> Direct
            </div>

            {dmConvs.length === 0 && devices.length === 0 && (
              <div style={{ padding: 12, fontSize: 10.5, color: C.faint, textAlign: 'center' }}>No remotes paired yet. Phones appear here when they connect.</div>
            )}

            {dmConvs.map((c) => {
              const dev = deviceFor(c.conversationId);
              return sidebarRow({
                key: c.conversationId,
                label: dev?.deviceName || c.conversationId,
                sub: c.lastMessage ? `${c.lastMessage.sender_id === 'operator' ? 'You: ' : ''}${c.lastMessage.content}` : '',
                unread: c.unread || 0,
                connected: dev ? dev.connected !== false : false,
                muted: mutedDevices?.has(c.conversationId),
                onClick: () => openConversation(c.conversationId),
              });
            })}

            {devices.filter((d) => !dmConvs.some((c) => c.conversationId === d.deviceId)).map((d) => sidebarRow({
              key: d.deviceId,
              label: d.deviceName,
              sub: 'Start a direct conversation',
              connected: d.connected !== false,
              muted: mutedDevices?.has(d.deviceId),
              onClick: () => openConversation(d.deviceId),
            }))}
          </div>
        </div>

        {/* Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ padding: '11px 14px', borderBottom: '1px solid var(--ui-border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isBooth ? <Megaphone size={14} color={ACCENT} /> : null}
                {query ? 'Search results' : activeTitle}
              </div>
              <div style={{ fontSize: 9.5, color: C.faint, marginTop: 1 }}>
                {isBooth ? 'Everyone paired sees this. Use Direct for one operator.' : isMuted ? 'Muted — history still arrives' : 'Private between you and this remote'}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {!isBooth && activeConv ? (
                <button
                  onClick={() => setDeviceMuted?.(activeConv, !isMuted)}
                  title={isMuted ? 'Unmute this device' : 'Mute banners and notifications from this device'}
                  style={{ background: 'transparent', border: '1px solid var(--ui-border2)', borderRadius: 6, color: isMuted ? '#f59e0b' : C.muted, cursor: 'pointer', padding: '4px 7px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 800 }}
                >
                  <VolumeX size={11} /> {isMuted ? 'Muted' : 'Mute'}
                </button>
              ) : null}
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer' }}><X size={16} /></button>
            </div>
          </div>

          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {query ? (
              searching ? (
                <div style={{ margin: 'auto', fontSize: 12, color: C.faint }}>Searching…</div>
              ) : results.length === 0 ? (
                <div style={{ margin: 'auto', fontSize: 12, color: C.faint }}>No messages match “{query}”.</div>
              ) : results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => openConversation(r.conversationId === BOOTH ? BOOTH : r.conversationId)}
                  style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--ui-border2)', background: C.elevated2 || '#23242c', color: C.text, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 9.5, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    <span>{r.channelId === BOOTH ? 'Booth' : (deviceFor(r.conversationId)?.deviceName || 'Direct')} · {r.senderId === 'operator' ? 'You' : (r.senderName || 'Remote')}</span>
                    <span>{fmtTime(r.timestamp)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 3, color: C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{r.content}</div>
                </button>
              ))
            ) : (
              <>
                {msgs.length === 0 && (
                  <div style={{ margin: 'auto', textAlign: 'center', fontSize: 12, color: C.faint, maxWidth: 300, lineHeight: 1.5 }}>
                    {isBooth ? 'The booth channel is quiet. Messages from every paired remote land here.' : 'No messages yet with this remote.'}
                  </div>
                )}
                {msgs.map((m) => {
                  const mine = m.senderId === 'operator';
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', minWidth: 0 }}>
                      {!mine && isBooth ? (
                        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase', color: C.faint, marginBottom: 2, marginLeft: 2 }}>
                          {nameFor(m)}
                        </div>
                      ) : null}
                      <div style={{
                        width: 'fit-content', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box',
                        padding: '8px 11px', borderRadius: 12,
                        background: mine ? ACCENT : (C.elevated2 || '#23242c'),
                        color: mine ? '#171208' : C.text,
                        fontSize: 12.5, lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'break-word',
                        borderLeft: !mine && m.priority !== 'normal' ? `3px solid ${PRIORITY_COLORS[m.priority]}` : 'none',
                      }}>
                        {m.content}
                      </div>
                      {m.context ? (
                        <div style={{ fontSize: 9.5, color: C.faint, marginTop: 2, paddingLeft: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Megaphone size={9} /> {m.context}
                        </div>
                      ) : null}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, justifyContent: mine ? 'flex-end' : 'flex-start', fontSize: 9.5, color: C.faint, flexWrap: 'wrap' }}>
                        <span>{fmtTime(m.timestamp)}</span>
                        {m.priority !== 'normal' && <span style={{ color: PRIORITY_COLORS[m.priority], fontWeight: 800, textTransform: 'uppercase' }}>{m.priority}</span>}
                        {statusIcon(m)}
                        {receiptLine(m) ? <span>{receiptLine(m)}</span> : null}
                        {!mine && (
                          <button
                            onClick={() => acknowledge(m)}
                            style={{ background: 'transparent', border: 'none', color: m.status === 'acknowledged' ? '#22c55e' : C.faint, cursor: 'pointer', fontSize: 9, fontWeight: 800 }}
                            title="Acknowledge to the sender"
                          >
                            {m.status === 'acknowledged' ? 'acked ✓' : 'ack'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div style={{ padding: 10, borderTop: '1px solid var(--ui-border2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {quickReplies.map((q) => (
                <button
                  key={q.id}
                  onClick={() => send(q.text)}
                  style={{ fontSize: 10.5, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--ui-border2)', background: C.elevated2, color: C.text2, cursor: 'pointer' }}
                >{q.label}</button>
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
                placeholder={isBooth ? 'Message every remote…' : 'Type a message…'}
                style={{ flex: 1, minWidth: 0, fontSize: 12.5, padding: '7px 10px', borderRadius: 6, background: C.input, color: C.text, border: '1px solid var(--ui-border2)', outline: 'none' }}
              />
              <button onClick={() => send()} style={{ padding: '7px 12px', borderRadius: 6, background: ACCENT, color: '#171208', border: 'none', cursor: 'pointer', fontWeight: 800 }}><Send size={14} /></button>
            </div>
            {isBooth ? (
              <div style={{ fontSize: 9.5, color: C.faint, textAlign: 'center' }}>
                Booth messages are delivered to every paired control phone · direct replies stay private
              </div>
            ) : null}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
