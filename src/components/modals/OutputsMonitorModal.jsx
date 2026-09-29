import React, { useEffect, useRef, useState } from 'react';
import { Monitor, X, Power, Plus, Trash2, Crosshair, RotateCw, RefreshCw, ChevronDown, Radio, Play, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { modalOverlay, panelLg, stubTap, iconBtnTap } from '../../lib/anim';

const ROLE_COLORS = {
  lyrics: '#8b5cf6',
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

// A resolution's ratio IS the view shape: the output stays fullscreen and
// only the composed frame changes, so picking a resolution also sets the
// output's aspect to that ratio — the projector, the preview and the aspect
// buttons then all agree on what the audience sees.
const RES_ASPECT = {
  '3840x2160': '16:9', '2560x1440': '16:9', '1920x1080': '16:9',
  '1600x900': '16:9', '1366x768': '16:9', '1280x720': '16:9', '800x450': '16:9',
  '1920x1200': '16:10', '1600x1200': '4:3', '1440x900': '16:10',
  '1280x1024': '4:3', '1280x800': '16:10', '1024x768': '4:3'
};

const ASPECT_OPTIONS = ['16:9', '4:3', '16:10', '21:9'];

// Hardware controls talk to main directly (identify overlays, DeckLink SDI).
const ipc = (typeof window !== 'undefined' && window.require) ? window.require('electron').ipcRenderer : null;
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* noop */ } };

const ROTATION_OPTIONS = [0, 90, 180, 270];
const BLEND_EDGES = [['l', 'Left'], ['r', 'Right'], ['t', 'Top'], ['b', 'Bottom']];
const FEATHER_DEFAULT = { l: 0, r: 0, t: 0, b: 0 };
const BLEND_DEFAULT = { enabled: false, gamma: 1, feather: FEATHER_DEFAULT, overlap: FEATHER_DEFAULT };

// DeckLink display modes: ffmpeg's decklink OUTPUT device takes the mode via
// -s (size) / -r (rate) / -field_order — docs §4.4.2, not format_code.
const SDI_FORMATS = [
  { v: 'p5994', label: '1080p 59.94', w: 1920, h: 1080, rate: '60000/1001', field: 'progressive' },
  { v: 'p50', label: '1080p 50', w: 1920, h: 1080, rate: '50', field: 'progressive' },
  { v: 'p30', label: '1080p 30', w: 1920, h: 1080, rate: '30', field: 'progressive' },
  { v: 'p2997', label: '1080p 29.97', w: 1920, h: 1080, rate: '30000/1001', field: 'progressive' },
  { v: 'p25', label: '1080p 25', w: 1920, h: 1080, rate: '25', field: 'progressive' },
  { v: 'i5994', label: '1080i 59.94', w: 1920, h: 1080, rate: '30000/1001', field: 'tt' },
  { v: 'i50', label: '1080i 50', w: 1920, h: 1080, rate: '25', field: 'tt' },
  { v: 'h5994', label: '720p 59.94', w: 1280, h: 720, rate: '60000/1001', field: 'progressive' },
  { v: 'h50', label: '720p 50', w: 1280, h: 720, rate: '50', field: 'progressive' }
];

function Pill({ ok, label, title }) {
  return (
    <span title={title} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${ok ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`, color: ok ? '#22c55e' : '#f87171', borderRadius: 999, padding: '3px 8px', fontSize: 9.5, fontWeight: 800, letterSpacing: 0.6 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: ok ? '#22c55e' : '#f87171' }} />
      {label}
    </span>
  );
}

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
  // Per-output "Screen Setup" disclosure (rotation / pixel window / blend).
  const [openAdv, setOpenAdv] = useState({});
  // DeckLink / UltraStudio SDI bridge status (polled with the output status).
  const [sdi, setSdi] = useState({
    checking: true,
    busy: false,
    running: false,
    pid: null,
    device: lsGet('kog_sdi_device'),
    format: lsGet('kog_sdi_format') || 'p5994',
    capture: lsGet('kog_sdi_capture') || 'window',
    ffmpegPathInput: lsGet('kog_sdi_ffmpeg'),
    devices: [],
    driverFound: false,
    ffmpegPath: null,
    decklinkOut: false,
    lastError: null
  });

  useEffect(() => {
    if (!window.require) return;
    const { ipcRenderer } = window.require('electron');
    let alive = true;

    const poll = async () => {
      try {
        const list = await ipcRenderer.invoke('get-output-status');
        if (alive) setStatus(Array.isArray(list) ? list : []);
      } catch (e) {}
      // DeckLink capability (driver / ffmpeg / SDI output / running) rides
      // the same 1s tick — probes are cached in main after the first call.
      if (ipc) {
        try {
          const ds = await ipc.invoke('decklink-status', lsGet('kog_sdi_ffmpeg') || null);
          if (alive && ds) {
            // `device` in local state is the USER's selection (persisted);
            // main's mirror device is informational, so don't clobber it.
            const { device: _mirrorDevice, ...rest } = ds;
            setSdi((prev) => ({ ...prev, ...rest, checking: false }));
          }
        } catch (e) { if (alive) setSdi((prev) => ({ ...prev, checking: false })); }
      }
    };

    const loadDevices = async () => {
      if (!ipc) return;
      try {
        const list = await ipc.invoke('decklink-devices', lsGet('kog_sdi_ffmpeg') || null);
        if (alive && Array.isArray(list)) setSdi((prev) => ({ ...prev, devices: list }));
      } catch (e) {}
    };
    const onThumbs = (_e, list) => {
      if (!alive) return;
      setThumbs(Object.fromEntries((list || []).map(t => [t.id, t.dataUrl])));
    };

    poll();
    loadDevices();
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

  // ---- DeckLink / UltraStudio SDI bridge ---------------------------------
  const sdiReady = sdi.driverFound && !!sdi.ffmpegPath && sdi.decklinkOut;
  const openOut = status.find((s) => s.open && s.role === 'lyrics') || status.find((s) => s.open) || null;

  const refreshSdi = async () => {
    if (!ipc) return;
    try {
      const list = await ipc.invoke('decklink-devices', lsGet('kog_sdi_ffmpeg') || null);
      if (Array.isArray(list)) setSdi((prev) => ({ ...prev, devices: list }));
    } catch (e) {}
  };

  const startSdi = async () => {
    if (!ipc) return;
    if (!openOut) {
      setSdi((prev) => ({ ...prev, lastError: 'Start an output window first — SDI mirrors whatever it shows.' }));
      return;
    }
    setSdi((prev) => ({ ...prev, busy: true, lastError: null }));
    const fmt = SDI_FORMATS.find((f) => f.v === sdi.format) || SDI_FORMATS[0];
    // Window capture is exact (it follows custom viewports and rotation,
    // which render inside the window); the desktop-region mode exists as a
    // fallback for builds where PrintWindow capture of a GPU window is black.
    const region = sdi.capture === 'region' && openOut.bounds
      ? { x: openOut.bounds.x, y: openOut.bounds.y, w: openOut.bounds.width, h: openOut.bounds.height }
      : null;
    let res;
    try {
      res = await ipc.invoke('decklink-start', {
        ffmpegPath: lsGet('kog_sdi_ffmpeg') || null,
        device: sdi.device,
        mode: { w: fmt.w, h: fmt.h, rate: fmt.rate, field: fmt.field },
        windowTitle: openOut.title,
        region
      });
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    setSdi((prev) => ({
      ...prev,
      busy: false,
      running: !!(res && res.ok),
      pid: (res && res.pid) || null,
      lastError: res && res.ok ? null : ((res && res.error) || 'SDI start failed.')
    }));
  };

  const stopSdi = async () => {
    if (!ipc) return;
    try { await ipc.invoke('decklink-stop'); } catch (e) {}
    setSdi((prev) => ({ ...prev, running: false, pid: null, lastError: null }));
  };

  return (
    <motion.div {...modalOverlay} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }} onClick={onClose}>
      <motion.div {...panelLg} onClick={(e) => e.stopPropagation()} style={{ background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, width: 'min(860px, 94vw)', maxHeight: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--ui-border2)', flexShrink: 0 }}>
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
            <motion.button {...stubTap} onClick={addOutput} style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, padding: '6px 11px', borderRadius: 8, fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
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
                <div key={out.id} style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                      style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                    >
                      {ROLE_OPTIONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>

                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>Resolution</div>
                      <select
                        value={out.resolution || 'native'}
                        onChange={(e) => {
                          const v = e.target.value;
                          const a = RES_ASPECT[v];
                          // Resolution shapes the view, never the window: the
                          // output stays fullscreen and composes at this
                          // resolution's aspect ratio.
                          updateOutput(out.id, a ? { resolution: v, aspect: a } : { resolution: v });
                        }}
                        style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11, fontWeight: 600, padding: '5px 8px', cursor: 'pointer', outline: 'none' }}
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
                          <motion.button key={a} {...stubTap} onClick={() => updateOutput(out.id, { aspect: a })} style={{ flex: 1, background: (out.aspect || '16:9') === a ? 'rgba(255,79,163,0.14)' : C.elevated, border: (out.aspect || '16:9') === a ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', color: (out.aspect || '16:9') === a ? PINK : C.muted, borderRadius: 6, padding: '4px 0', fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>{a}</motion.button>
                        ))}
                      </div>
                    </div>

                    <select
                      value={out.displayId ?? ''}
                      onChange={(e) => changeDisplay(out.id, e.target.value)}
                      disabled={!hasDisplays}
                      title="Choose which display this output appears on"
                      style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: hasDisplays ? 'pointer' : 'not-allowed', outline: 'none' }}
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
                      onClick={() => setOpenAdv((prev) => ({ ...prev, [out.id]: !prev[out.id] }))}
                      title="Rotation, custom pixel window (LED wall), edge blending"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, background: openAdv[out.id] ? 'rgba(139,92,246,0.14)' : C.elevated, border: `1px solid ${openAdv[out.id] ? 'rgba(139,92,246,0.45)' : 'var(--ui-border2)'}`, color: openAdv[out.id] ? '#a78bfa' : C.muted, borderRadius: 7, padding: '5px 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6, cursor: 'pointer' }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><RotateCw size={11} /> SCREEN SETUP</span>
                      <ChevronDown size={12} style={{ transform: openAdv[out.id] ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
                    </motion.button>
                    {openAdv[out.id] && (
                      <ScreenSetupPanel out={out} updateOutput={updateOutput} displays={outputDisplays} C={C} PINK={PINK} />
                    )}

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
            <div style={{ fontSize: 12.5, color: C.faint2, padding: 14, background: C.elevated2, border: '1px dashed var(--ui-border2)', borderRadius: 10 }}>
              No external display detected. Connect a projector, LED processor, or second monitor.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
              {outputDisplays.map(d => {
                const inUse = assignedDisplayIds.includes(d.id);
                return (
                  <div key={d.id} style={{ background: C.elevated2, border: inUse ? `1px solid ${PINK}` : '1px solid var(--ui-border2)', borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
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

          {/* ---------------- HARDWARE ---------------- */}
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.4, margin: '24px 0 10px 0' }}>Hardware</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 12 }}>
            {/* Identify Displays: number + hardware port on every screen. */}
            <div style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Crosshair size={14} color={PINK} />
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8 }}>IDENTIFY DISPLAYS</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                Flashes a numbered overlay — carrying each screen's hardware port (<span style={{ color: '#a78bfa', fontWeight: 800 }}>\\.\DISPLAY1</span>) — on every connected screen for 6 seconds, so a technician can match each output window to its monitor port.
              </div>
              <div style={{ fontSize: 10, color: C.faint2, lineHeight: 1.5 }}>
                Live outputs bind to the display handle itself (not loose coordinates), never take keyboard focus on a secondary display, and hide the mouse cursor.
              </div>
              <motion.button {...stubTap} onClick={() => ipc && ipc.send('identify-displays')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(139,92,246,0.9)', border: '1px solid transparent', color: '#fff', padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                <Crosshair size={13} /> Identify now
              </motion.button>
            </div>

            {/* DeckLink / UltraStudio direct SDI output (ffmpeg bridge). */}
            <div style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 10, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Radio size={14} color={PINK} />
                  <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.8 }}>DECKLINK / ULTRASTUDIO — SDI</span>
                </div>
                <motion.button {...iconBtnTap} onClick={refreshSdi} title="Re-scan DeckLink devices" style={{ background: 'transparent', border: 'none', color: C.faint, cursor: 'pointer', display: 'flex', padding: 2 }}>
                  <RefreshCw size={13} />
                </motion.button>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Pill ok={sdi.driverFound} label="DRIVER" title={sdi.driverFound ? 'Blackmagic Desktop Video installed' : 'Blackmagic Desktop Video not found'} />
                <Pill ok={!!sdi.ffmpegPath} label="FFMPEG" title={sdi.ffmpegPath || 'ffmpeg not found on PATH'} />
                <Pill ok={sdi.decklinkOut} label="SDI OUT" title={sdi.decklinkOut ? 'ffmpeg has the DeckLink output device' : 'ffmpeg lacks --enable-decklink output support'} />
                {sdi.running && <Pill ok label={`LIVE${sdi.pid ? ` · pid ${sdi.pid}` : ''}`} title="SDI mirror running" />}
              </div>

              <div>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 3 }}>Device</span>
                {sdi.devices.length ? (
                  <select
                    value={sdi.device}
                    onChange={(e) => { setSdi((p) => ({ ...p, device: e.target.value })); lsSet('kog_sdi_device', e.target.value); }}
                    style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="">Select a DeckLink device…</option>
                    {sdi.devices.map((d) => <option key={d} value={d}>{d}</option>)}
                    {sdi.device && !sdi.devices.includes(sdi.device) ? <option value={sdi.device}>{sdi.device} (custom)</option> : null}
                  </select>
                ) : (
                  <input
                    value={sdi.device}
                    onChange={(e) => { setSdi((p) => ({ ...p, device: e.target.value })); lsSet('kog_sdi_device', e.target.value); }}
                    placeholder="Exact device name (e.g. DeckLink Mini Monitor)"
                    style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text, fontSize: 11.5, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }}
                  />
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 3 }}>Format</span>
                  <select
                    value={sdi.format}
                    onChange={(e) => { setSdi((p) => ({ ...p, format: e.target.value })); lsSet('kog_sdi_format', e.target.value); }}
                    style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                  >
                    {SDI_FORMATS.map((f) => <option key={f.v} value={f.v}>{f.label}</option>)}
                  </select>
                </div>
                <div>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 3 }}>Capture</span>
                  <select
                    value={sdi.capture}
                    onChange={(e) => { setSdi((p) => ({ ...p, capture: e.target.value })); lsSet('kog_sdi_capture', e.target.value); }}
                    title="Output window = the window itself (exact, follows custom viewports). Desktop region = fallback if window capture is black."
                    style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text2, fontSize: 11.5, fontWeight: 600, padding: '6px 8px', cursor: 'pointer', outline: 'none' }}
                  >
                    <option value="window">Output window</option>
                    <option value="region">Desktop region</option>
                  </select>
                </div>
              </div>

              <div>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 3 }}>
                  ffmpeg path <span style={{ color: C.faint2, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(blank = auto-detect)</span>
                </span>
                <input
                  value={sdi.ffmpegPathInput}
                  onChange={(e) => { setSdi((p) => ({ ...p, ffmpegPathInput: e.target.value })); lsSet('kog_sdi_ffmpeg', e.target.value); }}
                  placeholder={sdi.ffmpegPath || 'ffmpeg not found on PATH'}
                  style={{ width: '100%', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, color: C.text, fontSize: 11.5, padding: '6px 8px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ fontSize: 10.5, color: sdi.lastError ? '#f87171' : C.muted, lineHeight: 1.5, minHeight: 16 }}>
                {sdi.lastError
                  ? sdi.lastError
                  : sdi.checking
                    ? 'Checking DeckLink capabilities…'
                    : sdi.running
                      ? `SDI live → ${sdi.device || 'device'}`
                      : !sdi.driverFound
                        ? 'Blackmagic Desktop Video driver not found — install it from blackmagicdesign.com.'
                        : !sdi.ffmpegPath
                          ? 'ffmpeg not found — install it and add to PATH, or set the full path above.'
                          : !sdi.decklinkOut
                            ? 'This ffmpeg has no DeckLink output device. Use a build configured with --enable-decklink.'
                            : !openOut
                              ? 'Start an output window first — SDI mirrors whatever it shows.'
                              : 'Ready. Pick a device and format, then Start SDI.'}
              </div>

              {sdi.running ? (
                <motion.button {...stubTap} onClick={stopSdi} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'rgba(239,68,68,0.14)', border: '1px solid rgba(239,68,68,0.45)', color: '#f87171', padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}>
                  <Square size={12} /> Stop SDI
                </motion.button>
              ) : (
                <motion.button
                  {...stubTap}
                  onClick={startSdi}
                  disabled={sdi.busy || !sdiReady || !sdi.device || !openOut}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: sdiReady && sdi.device && openOut && !sdi.busy ? 'rgba(139,92,246,0.9)' : C.elevated, border: '1px solid var(--ui-border2)', color: sdiReady && sdi.device && openOut && !sdi.busy ? '#fff' : C.faint2, padding: '7px 10px', borderRadius: 8, fontSize: 11.5, fontWeight: 800, cursor: sdi.busy || !sdiReady || !sdi.device || !openOut ? 'not-allowed' : 'pointer', opacity: sdi.busy ? 0.7 : 1 }}
                >
                  <Play size={12} /> {sdi.busy ? 'Starting…' : 'Start SDI'}
                </motion.button>
              )}
            </div>
          </div>
        </div>
</motion.div>
      </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Per-output Screen Setup: rotation, custom pixel window (LED walls),
// and edge blending. Everything here maps 1:1 onto the output's config that
// main pushes live to its window (geometry changes rebuild the window;
// rotation / blend apply without a restart).
// ---------------------------------------------------------------------------
// Numeric input that survives real typing: clearing the box to retype a
// 4-digit value must not snap back to the minimum mid-keystroke (the old
// clamp-on-change handler made the field impossible to empty), while every
// accepted value is still clamped live and re-clamped on blur. While the
// field has focus it owns its own text; external changes ("Use display",
// presets) land again as soon as focus leaves.
function NumField({ value, onCommit, min, max, style }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);

  const clamp = (n) => Math.max(min, Math.min(max, Math.round(n)));
  const emit = (raw) => {
    const t = String(raw).trim();
    if (t === '' || t === '-') return; // let the box go blank / hold the minus
    const n = Number(t);
    if (Number.isFinite(n)) onCommit(clamp(n));
  };

  return (
    <input
      type="number"
      value={draft}
      min={min}
      max={max}
      style={style}
      onFocus={() => { focused.current = true; }}
      onChange={(e) => { setDraft(e.target.value); emit(e.target.value); }}
      onBlur={() => {
        focused.current = false;
        const t = String(draft).trim();
        const n = Number(t);
        const next = t !== '' && t !== '-' && Number.isFinite(n) ? clamp(n) : Number(value);
        setDraft(String(next));
        if (next !== Number(value)) onCommit(next);
      }}
    />
  );
}

function ScreenSetupPanel({ out, updateOutput, displays, C, PINK }) {
  const bound = (displays || []).find((d) => d.id === out.displayId);
  const vp = {
    enabled: false, x: 0, y: 0,
    w: bound ? bound.width : 1920, h: bound ? bound.height : 1080,
    ...(out.viewport || {})
  };
  const setVp = (patch) => updateOutput(out.id, { viewport: { ...vp, ...patch } });

  const rot = out.rotation || 0;

  const blend = {
    ...BLEND_DEFAULT,
    ...(out.blend || {}),
    feather: { ...FEATHER_DEFAULT, ...((out.blend && out.blend.feather) || {}) },
    overlap: { ...FEATHER_DEFAULT, ...((out.blend && out.blend.overlap) || {}) }
  };
  const setBlend = (patch) => updateOutput(out.id, { blend: { ...blend, ...patch } });
  const setEdge = (bucket, k, v) => setBlend({ [bucket]: { ...blend[bucket], [k]: v } });

  const lbl = { fontSize: 9.5, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4, display: 'block' };
  // minWidth: 0 + minmax(0, 1fr) columns: a number input's intrinsic width
  // (and a 4-digit value) otherwise sets the grid's min-content, which drags
  // the whole card wider as you type a bigger resolution.
  const numStyle = { background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 6, color: C.text, fontSize: 11, padding: '4px 6px', width: '100%', minWidth: 0, outline: 'none', boxSizing: 'border-box' };
  const numProps = (value, on, min, max) => ({ value, onCommit: on, min, max, style: numStyle });
  const checkRow = (checked, onChange, title) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, fontWeight: 700, color: C.text2, cursor: 'pointer' }} title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: PINK, margin: 0 }} />
      {title}
    </label>
  );

  return (
    <div style={{ background: C.elevated, border: '1px dashed rgba(139,92,246,0.35)', borderRadius: 9, padding: '10px 10px 11px', display: 'flex', flexDirection: 'column', gap: 11 }}>
      {/* Rotation */}
      <div>
        <span style={lbl}>Display Rotation</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {ROTATION_OPTIONS.map((r) => (
            <motion.button
              key={r}
              {...stubTap}
              onClick={() => updateOutput(out.id, { rotation: r })}
              title={r === 0 ? 'Normal orientation' : `Rotate output ${r}° clockwise`}
              style={{ flex: 1, background: rot === r ? 'rgba(139,92,246,0.16)' : C.elevated2, border: rot === r ? '1px solid rgba(139,92,246,0.55)' : '1px solid var(--ui-border2)', color: rot === r ? '#a78bfa' : C.muted, borderRadius: 6, padding: '4px 0', fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}
            >
              {r}°
            </motion.button>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: C.faint2, marginTop: 3 }}>90°/270° turn a side-screen or ceiling monitor's image.</div>
      </div>

      {/* Custom pixel window */}
      <div>
        {checkRow(!!vp.enabled, (v) => setVp({ enabled: v }), 'Custom pixel window (LED processor / video wall)')}
        {vp.enabled && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginTop: 7 }}>
              {[['x', 'X', -9999, 9999], ['y', 'Y', -9999, 9999], ['w', 'W', 64, 16384], ['h', 'H', 64, 16384]].map(([k, L, min, max]) => (
                <div key={k}>
                  <span style={lbl}>{L}</span>
                  <NumField {...numProps(vp[k], (v) => setVp({ [k]: v }), min, max)} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 7 }}>
              <div style={{ fontSize: 9.5, color: C.faint2, lineHeight: 1.45 }}>
                Relative to {bound ? `${bound.label}` : 'the bound display'}'s origin — may run negative or past its edge.
              </div>
              <motion.button
                {...stubTap}
                onClick={() => setVp({ x: 0, y: 0, w: bound ? bound.width : vp.w, h: bound ? bound.height : vp.h })}
                style={{ flexShrink: 0, background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, padding: '4px 8px', fontSize: 9.5, fontWeight: 800, cursor: 'pointer' }}
              >
                Use display
              </motion.button>
            </div>
          </>
        )}
      </div>

      {/* Edge blending */}
      <div>
        {checkRow(!!blend.enabled, (v) => setBlend({ enabled: v }), 'Edge blending (feather, overlap, gamma)')}
        {blend.enabled && (
          <>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                <span style={{ ...lbl, marginBottom: 2 }}>Gamma curve</span>
                <span style={{ fontSize: 10.5, fontWeight: 800, color: '#a78bfa' }}>{(Number(blend.gamma) || 1).toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.4"
                step="0.05"
                value={Number(blend.gamma) || 1}
                onChange={(e) => setBlend({ gamma: Number(e.target.value) })}
                style={{ width: '100%', accentColor: PINK, margin: 0 }}
                title="1.00 = off · higher = darker midtones (match the projector's gamma)"
              />
              <div style={{ fontSize: 9.5, color: C.faint2, marginTop: 2 }}>1.00 = off · higher = darker midtones.</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', gap: '6px 8px', alignItems: 'center', marginTop: 9 }}>
              <span style={{ ...lbl, marginBottom: 0 }}>Edge</span>
              <span style={{ ...lbl, marginBottom: 0, textAlign: 'center' }} title="Soft alpha fade into the seam (px)">Feather px</span>
              <span style={{ ...lbl, marginBottom: 0, textAlign: 'center' }} title="Darkening band where two projectors double up (px)">Overlap px</span>
              {BLEND_EDGES.map(([k, L]) => (
                <React.Fragment key={k}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.text2, width: 44 }}>{L}</span>
                  <NumField {...numProps(blend.feather[k], (v) => setEdge('feather', k, v), 0, 1200)} />
                  <NumField {...numProps(blend.overlap[k], (v) => setEdge('overlap', k, v), 0, 1200)} />
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: C.faint2, marginTop: 7, lineHeight: 1.45 }}>
              Feather = soft edge fade where this image meets its neighbor. Overlap = seam darkening to cancel the doubled brightness. Both start at 0 (off).
            </div>
          </>
        )}
      </div>
    </div>
  );
}
