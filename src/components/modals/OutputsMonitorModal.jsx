import React, { useEffect, useState } from 'react';
import { Monitor, X, Power, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, panelLg, stubTap, iconBtnTap } from '../../lib/anim';

const ROLE_COLORS = {
  lyrics: '#3B82F6',
  stage: '#8B5CF6',
  media: '#22C55E'
};

const ROLE_OPTIONS = [
  { value: 'lyrics', label: 'Lyrics' },
  { value: 'stage', label: 'Stage' }
];

const RESOLUTION_OPTIONS = [
  { value: 'native', label: 'Native (fullscreen)' },
  { group: '4K / UHD', options: [{ value: '3840x2160', label: '3840 × 2160 (4K UHD)' }] },
  { group: 'Common Resolutions', options: [
    { value: '2560x1440', label: '2560 × 1440 (QHD)' },
    { value: '1920x1080', label: '1920 × 1080 (Full HD)' },
    { value: '1920x1200', label: '1920 × 1200 (WUXGA)' },
    { value: '1600x1200', label: '1600 × 1200 (UXGA)' },
    { value: '1600x900', label: '1600 × 900 (HD+)' },
    { value: '1440x900', label: '1440 × 900 (WXGA+)' },
    { value: '1366x768', label: '1366 × 768 (HD)' },
    { value: '1280x1024', label: '1280 × 1024 (SXGA)' },
    { value: '1280x800', label: '1280 × 800 (WXGA)' },
    { value: '1280x720', label: '1280 × 720 (720p)' },
    { value: '1024x768', label: '1024 × 768 (XGA)' },
  ]},
  { group: 'Preview', options: [{ value: '800x450', label: '800 × 450 (Preview)' }] },
];

const ASPECT_OPTIONS = ['16:9', '4:3', '16:10', '21:9'];

export default function OutputsMonitorModal({
  C,
  PINK,
  outputDisplays,
  outputs,
  updateOutput,
  addOutput,
  removeOutput,
  setOutputRunning,
  outputAspect,
  setOutputAspect,
  onClose
}) {
  const [status, setStatus] = useState([]);
  const [thumbs, setThumbs] = useState({});

  useEffect(() => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    let alive = true;

    const poll = async () => {
      try {
        const list = await ipcRenderer.invoke('get-output-status');
        if (alive) setStatus(Array.isArray(list) ? list : []);
      } catch (e) {}
    };
    const onThumbs = (_e, list) => {
      if (!alive) return;
      setThumbs(Object.fromEntries((list || []).map(t => [t.id, t.dataUrl])));
    };

    poll();
    const pollId = setInterval(poll, 1000);
    ipcRenderer.on('output-thumbnails', onThumbs);
    ipcRenderer.send('monitor-start');

    return () => {
      alive = false;
      clearInterval(pollId);
      ipcRenderer.removeListener('output-thumbnails', onThumbs);
      ipcRenderer.send('monitor-stop');
    };
  }, []);

  const statusById = Object.fromEntries(status.map(s => [s.id, s]));
  const assignedDisplayIds = status.map(s => s.displayId).filter(Boolean);
  const hasDisplays = !!(outputDisplays && outputDisplays.length);

  const changeDisplay = (id, value) => {
    const displayId = value === '' ? null : (value === 'preview' ? 'preview' : Number(value));
    updateOutput(id, { displayId, enabled: displayId !== null });
  };

  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={onClose}>
      <motion.div {...panelLg} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid #2d2d3f', borderRadius: 14, width: 'min(860px, 94vw)', maxHeight: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #23233a', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Monitor size={18} color={PINK} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: 0.3 }}>Live Outputs Monitor</div>
              <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>Assign each output to a display, then press Start. Outputs stay closed until you start them.</div>
            </div>
          </div>
          <motion.button {...iconBtnTap} onClick={onClose} title="Close monitor" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></motion.button>
        </div>

        <div style={{ padding: 20, overflowY: 'auto' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4 }}>Outputs</div>
            <motion.button {...stubTap} onClick={addOutput} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid #2d2d3f', color: C.text, padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} /> Add Output
            </motion.button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {outputs.map((out) => {
              const info = statusById[out.id];
              const isOpen = !!(info && info.open);
              const running = !!out.enabled;
              const accent = ROLE_COLORS[out.role] || PINK;
              const thumb = thumbs[out.id];
              const removable = out.id !== 'projector' && out.id !== 'stage';
              return (
                <div key={out.id} style={{ background: C.elevated2, border: '1px solid #2d2d3f', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isOpen && thumb ? (
                      <img src={thumb} alt={`${out.name} live preview`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: C.faint2 }}>
                        <Power size={20} />
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1 }}>OFFLINE</span>
                      </div>
                    )}
                    <span style={{ position: 'absolute', top: 8, left: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', padding: '3px 9px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: isOpen ? '#22c55e' : C.faint2, boxShadow: isOpen ? '0 0 8px #22c55e' : 'none' }} />
                      {isOpen ? 'Live' : 'Off'}
                    </span>
                    {removable && (
                      <motion.button {...iconBtnTap} onClick={() => removeOutput(out.id)} title="Remove output" style={{ position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.12)', color: '#f87171', borderRadius: 7, padding: 4, cursor: 'pointer', display: 'flex' }}><Trash2 size={13} /></motion.button>
                    )}
                  </div>

                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <input
                        value={out.name}
                        onChange={(e) => updateOutput(out.id, { name: e.target.value })}
                        style={{ background: 'transparent', border: 'none', color: C.text, fontSize: 13, fontWeight: 800, outline: 'none', minWidth: 0, flex: 1 }}
                      />
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: accent, textTransform: 'uppercase', letterSpacing: 1 }}>{out.role}</span>
                    </div>

                    <select
                      value={out.role}
                      onChange={(e) => updateOutput(out.id, { role: e.target.value })}
                      style={{ width: '100%', background: C.elevated, border: '1px solid #2b2b44', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                    >
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Resolution</div>
                      <select
                        value={out.resolution || 'native'}
                        onChange={(e) => updateOutput(out.id, { resolution: e.target.value })}
                        style={{ width: '100%', background: C.elevated, border: '1px solid #2b2b44', borderRadius: 8, color: C.text2, fontSize: 11, fontWeight: 600, padding: '5px 8px', cursor: 'pointer', outline: 'none' }}
                      >
                        {RESOLUTION_OPTIONS.map(o => o.group ? (
                          <optgroup key={o.group} label={o.group}>{o.options.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</optgroup>
                        ) : (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Aspect Ratio</div>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {ASPECT_OPTIONS.map(a => (
                          <motion.button key={a} {...stubTap} onClick={() => updateOutput(out.id, { aspect: a })} style={{ flex: 1, background: (out.aspect || '16:9') === a ? 'rgba(255,79,163,0.14)' : C.elevated, border: (out.aspect || '16:9') === a ? `1px solid ${PINK}` : '1px solid #2b2b44', color: (out.aspect || '16:9') === a ? PINK : C.muted, borderRadius: 6, padding: '4px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{a}</motion.button>
                        ))}
                      </div>
                    </div>

                    <select
                      value={out.displayId ?? ''}
                      onChange={(e) => changeDisplay(out.id, e.target.value)}
                      disabled={!hasDisplays}
                      title="Choose which display this output appears on"
                      style={{ width: '100%', background: C.elevated, border: '1px solid #2b2b44', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: hasDisplays ? 'pointer' : 'not-allowed', outline: 'none' }}
                    >
                      <option value="">Off — no output window</option>
                      {(outputDisplays || []).map(d => (
                        <option key={d.id} value={d.id}>{d.label}{d.primary ? ' (Primary)' : ''} · {d.width}×{d.height}</option>
                      ))}
                      <option value="preview">Preview window (dev)</option>
                    </select>

                    <div style={{ fontSize: 11, color: C.muted, minHeight: 15 }}>
                      {isOpen
                        ? (info?.displayLabel ? `${info.displayLabel}${info.width ? ` · ${info.width}×${info.height}` : ''}` : 'Dev preview window')
                        : (out.displayId != null && out.displayId !== '' ? 'Assigned — not started' : 'Not showing anywhere')}
                    </div>

                    <motion.button
                      {...stubTap}
                      onClick={() => setOutputRunning(out.id, !running)}
                      title={running ? 'Stop this output' : 'Start this output (nothing opens until you do)'}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: running ? 'rgba(239,68,68,0.14)' : accent, border: running ? '1px solid rgba(239,68,68,0.4)' : '1px solid transparent', color: running ? '#f87171' : '#fff', padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                    >
                      <Power size={13} /> {running ? 'Stop Output' : 'Start Output'}
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4, margin: '22px 0 10px 0' }}>Connected Displays</div>
          {!hasDisplays ? (
            <div style={{ fontSize: 12.5, color: C.faint2, padding: 14, background: C.elevated2, border: '1px dashed #2d2d3f', borderRadius: 10 }}>
              No external display detected. Connect a projector, LED processor, or second monitor.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {outputDisplays.map(d => {
                const inUse = assignedDisplayIds.includes(d.id);
                return (
                  <div key={d.id} style={{ background: C.elevated2, border: inUse ? `1px solid ${PINK}` : '1px solid #2d2d3f', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.label}{d.primary ? ' · Primary' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                        Online · {d.width}×{d.height}{inUse ? ' · In use' : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
</motion.div>
      </motion.div>
  );
}
