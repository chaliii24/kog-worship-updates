import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Smartphone, ShieldAlert, Power, Copy, Check, Trash2 } from 'lucide-react';
import { stubTap } from '../../lib/anim';

// The desktop's side of the LAN remote: QR + URL for pairing, the 6-digit
// code, live client count and server controls. Talks to the main process over
// IPC; every mutating call returns the refreshed info so the panel never has
// to guess.
export default function RemoteMenu({ C, ACCENT, onClose }) {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState('');
  const [showFirewall, setShowFirewall] = useState(false);
  const copyTimer = useRef(null);

  const ipc = (typeof window !== 'undefined' && window.require) ? window.require('electron').ipcRenderer : null;

  const refresh = useCallback(async () => {
    if (!ipc) return;
    try { setInfo(await ipc.invoke('lan-info')); } catch { /* main not ready */ }
  }, [ipc]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live device count while the panel is open.
  useEffect(() => {
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const act = async (channel) => {
    if (!ipc) return;
    try { setInfo(await ipc.invoke(channel)); } catch { /* noop */ }
  };

  const copy = (text, key) => {
    if (!text) return;
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(''), 1600);
    }).catch(() => {});
  };

  if (!info) return null;

  const running = info.running;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 400, width: 346,
        background: C.elevated, border: `1px solid ${C.border2}`, borderRadius: 14, padding: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)', fontFamily: 'inherit',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 900 }}>
          <Smartphone size={15} color={ACCENT} /> Phone remote
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 900, letterSpacing: 1, color: running ? '#4ade80' : C.faint }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: running ? '#22c55e' : C.faint2, boxShadow: running ? '0 0 8px #22c55e' : 'none' }} />
          {running ? 'ON' : 'OFF'}
        </span>
      </div>

      {!running ? (
        <div style={{ background: C.elevated2, border: `1px dashed ${C.border2}`, borderRadius: 10, padding: 13, fontSize: 12.5, color: C.muted, lineHeight: 1.55, marginBottom: 11 }}>
          The server is off. Turn it on so phones on the same WiFi can connect.
        </div>
      ) : (
        <>
          {/* QR */}
          <div style={{ background: '#0b0b10', borderRadius: 12, padding: 12, textAlign: 'center', marginBottom: 10, border: `1px solid ${C.border2}` }}>
            {info.qr
              ? <img src={info.qr} alt="Scan to open the remote" style={{ width: 168, height: 168, borderRadius: 8 }} />
              : <div style={{ width: 168, height: 168, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', fontSize: 12 }}>QR unavailable</div>}
            <div style={{ marginTop: 9, fontSize: 11, fontWeight: 800, color: '#9ca3af', letterSpacing: 0.4 }}>
              Scan with the phone camera
            </div>
          </div>

          <UrlRow label="Control (operator)" value={info.controlUrl} C={C} copied={copied === 'ctrl'} onCopy={() => copy(info.controlUrl, 'ctrl')} />
          <UrlRow label="Stage (singers)" value={info.stageUrl} C={C} copied={copied === 'stage'} onCopy={() => copy(info.stageUrl, 'stage')} />

          {/* PIN */}
          <div style={{ background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 10, padding: '10px 12px', marginTop: 9, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.4, textTransform: 'uppercase', color: C.faint }}>Pairing code</div>
              <div style={{ fontSize: 27, fontWeight: 900, letterSpacing: 7, fontFamily: 'ui-monospace, Consolas, monospace', color: C.text, lineHeight: 1.15 }}>{info.pin}</div>
            </div>
            <button onClick={() => act('lan-new-pin')} title="Generate a new code" style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: C.muted, borderRadius: 8, padding: '7px 9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 800, fontFamily: 'inherit' }}>
              <RefreshCw size={12} /> New
            </button>
          </div>

          {/* Devices */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 700, color: C.muted }}>
              {info.clients > 0 ? `${info.clients} phone${info.clients === 1 ? '' : 's'} connected` : 'No phones connected'}
              {info.paired > 0 && <span style={{ color: C.faint }}> · {info.paired} paired</span>}
            </span>
            <button onClick={() => act('lan-revoke')} title="Disconnect every phone and force re-pairing" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#f87171', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', fontSize: 10.5, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit' }}>
              <Trash2 size={12} /> Disconnect all
            </button>
          </div>
        </>
      )}

      {/* Firewall / troubleshooting */}
      <button onClick={() => setShowFirewall(v => !v)} style={{ marginTop: 10, background: 'transparent', border: 'none', color: C.accLine, fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', fontFamily: 'inherit' }}>
        <ShieldAlert size={13} /> Phone can't connect?
      </button>
      <AnimatePresence>
        {showFirewall && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6, paddingTop: 6 }}>
              <b style={{ color: C.text }}>1.</b> Both devices must be on the same WiFi (guest networks often block this).<br />
              <b style={{ color: C.text }}>2.</b> The computer must not be asleep.<br />
              <b style={{ color: C.text }}>3.</b> Windows may be blocking the port — run this in an admin terminal:
              <div onClick={() => copy(info.firewallHint, 'fw')} title="Click to copy" style={{ marginTop: 7, background: C.input, border: `1px solid ${C.border2}`, borderRadius: 7, padding: '8px 9px', fontSize: 10.5, fontFamily: 'ui-monospace, Consolas, monospace', color: copied === 'fw' ? '#4ade80' : C.text2, wordBreak: 'break-all', cursor: 'pointer' }}>
                {copied === 'fw' ? 'Copied ✓' : info.firewallHint}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Server toggle */}
      <motion.button {...stubTap} onClick={() => act(running ? 'lan-stop' : 'lan-start')} style={{ width: '100%', marginTop: 11, background: running ? 'rgba(239,68,68,0.10)' : 'rgba(34,197,94,0.12)', border: `1px solid ${running ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.45)'}`, color: running ? '#f87171' : '#4ade80', borderRadius: 9, padding: '9px', fontSize: 12, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit' }}>
        <Power size={14} /> {running ? 'Turn remote off' : 'Turn remote on'}
      </motion.button>
    </motion.div>
  );
}

function UrlRow({ label, value, C, copied, onCopy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated2, border: `1px solid ${C.border2}`, borderRadius: 9, padding: '7px 9px' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: 1.3, textTransform: 'uppercase', color: C.faint }}>{label}</div>
        <div style={{ fontSize: 11.5, fontFamily: 'ui-monospace, Consolas, monospace', color: copied ? '#4ade80' : C.text2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
      </div>
      <button onClick={onCopy} title="Copy" style={{ background: 'transparent', border: `1px solid ${C.border2}`, color: copied ? '#4ade80' : C.muted, borderRadius: 7, padding: 6, cursor: 'pointer', display: 'flex', flexShrink: 0, fontFamily: 'inherit' }}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  );
}
