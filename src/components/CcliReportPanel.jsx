import React, { useEffect, useMemo, useState } from 'react';
import { Copy, ExternalLink, FileText, Plus, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { reportToCsv } from '../../electron/ccliReport.js';

// SETTINGS → CCLI REPORT.
//
// CCLI (and oneLicense/easySong) require churches to report which songs they
// used and how often, every reporting period — it is how songwriters get
// paid. This turns the app's own dated service plans into that exact list:
// pick a range, get Song / CCLI # / Times used, copy it, paste it into
// reporting.ccli.com.
//
// The counting rules live in electron/ccliReport.js (same file the main
// process queries through — one implementation): once per service even if
// the plan lists the song twice, medley parts each count once, arrangements
// sharing a CCLI number merge into one line. Songs with no number on file
// are FLAGGED, never dropped — public domain and other-agency songs are the
// operator's call, not ours.

const input = (C) => ({
  background: C.input, color: C.text, border: '1px solid var(--ui-border2)',
  borderRadius: 8, padding: '7px 9px', fontSize: 12, outline: 'none',
});

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
const today = () => new Date().toISOString().split('T')[0];
function lastMonthRange() {
  const d = new Date();
  const start = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const end = new Date(d.getFullYear(), d.getMonth(), 0);
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  return [fmt(start), fmt(end)];
}

export default function CcliReportPanel() {
  const { C, ACCENT } = useApp();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  // Songs sung OUTSIDE the saved plan (ad-hoc fires that never entered the
  // service order). Session-only rows, merged into the copied CSV marked
  // "(manual)" so a re-count against the plans stays auditable.
  const [manual, setManual] = useState([]);
  const [mTitle, setMTitle] = useState('');
  const [mCcli, setMCcli] = useState('');
  const [mTimes, setMTimes] = useState('1');

  const openExternal = (url) => {
    if (window.require) window.require('electron').ipcRenderer.invoke('open-external', url).catch(() => {});
  };

  const generate = async (f = from, t = to) => {
    if (!window.require) return;
    setLoading(true);
    try {
      const r = await window.require('electron').ipcRenderer.invoke('db-ccli-report', f, t);
      setReport(r || { rows: [], missing: [], undated: 0 });
    } catch (e) {
      console.error('[ccli-report]', e);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  // Opening the section generates immediately — an empty panel that needs a
  // button press before showing anything reads as "broken", not "idle".
  useEffect(() => { generate(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, []);

  const csv = useMemo(() => reportToCsv(report, manual), [report, manual]);
  const totalTimes = useMemo(
    () => (report ? report.rows.reduce((n, r) => n + r.times, 0) + manual.reduce((n, r) => n + Math.max(1, Number(r.times) || 1), 0) : 0),
    [report, manual]
  );

  const copyCsv = async () => {
    try {
      await navigator.clipboard.writeText(csv);
    } catch {
      // Electron clipboard fallback (some builds deny the async API)
      const { clipboard } = window.require('electron');
      clipboard.writeText(csv);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const addManual = () => {
    const title = mTitle.trim();
    if (!title) return;
    setManual((m) => [...m, { title, ccli: mCcli.trim(), times: Math.max(1, Number(mTimes) || 1) }]);
    setMTitle(''); setMCcli(''); setMTimes('1');
  };

  const btn = (primary) => ({
    background: primary ? ACCENT : C.elevated2,
    border: '1px solid ' + (primary ? ACCENT : 'var(--ui-border2)'),
    color: primary ? '#fff' : C.text,
    padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 800,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
  });
  const SECTION = { fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2 };

  const svcTip = (services) => (services || [])
    .map((s) => `${s.date}${s.name ? ` — ${s.name}` : ''}`)
    .join('\n');

  return (
    <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
      {/* Spinner keyframe for the Generate button — scoped name, injected here
          because the global TRANSITION_KEYFRAMES string only lands in lyric
          output windows, not in the operator console. */}
      <style>{'@keyframes ccli-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }'}</style>
      {/* Range picker */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ ...input(C), flex: '1 1 120px', minWidth: 0 }} />
          <span style={{ fontSize: 11, color: C.faint2 }}>to</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ ...input(C), flex: '1 1 120px', minWidth: 0 }} />
          <button onClick={() => generate()} disabled={loading} style={{ ...btn(true), opacity: loading ? 0.6 : 1 }}>
            <RefreshCw size={12} style={loading ? { animation: 'ccli-spin 0.9s linear infinite' } : undefined} /> {loading ? 'Building…' : 'Generate'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['This month', () => { setFrom(monthStart()); setTo(today()); generate(monthStart(), today()); }],
            ['Last month', () => { const [f, t] = lastMonthRange(); setFrom(f); setTo(t); generate(f, t); }],
            ['Year to date', () => { const f = `${new Date().getFullYear()}-01-01`; setFrom(f); setTo(today()); generate(f, today()); }],
          ].map(([label, fn]) => (
            <button key={label} onClick={fn} style={{ ...btn(false), padding: '4px 10px', fontSize: 10.5 }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Result summary + actions */}
      {report && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            {report.rows.length} song{report.rows.length === 1 ? '' : 's'} reported · {totalTimes} use{totalTimes === 1 ? '' : 's'}
            {manual.length ? ` · +${manual.length} manual` : ''}
            {report.missing.length ? ` · ${report.missing.length} need a number` : ''}
            {report.undated ? ` · ${report.undated} plan(s) without a date skipped` : ''}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={copyCsv} style={btn(true)}><Copy size={12} /> {copied ? 'Copied!' : 'Copy for CCLI'}</button>
            <button onClick={() => openExternal('https://reporting.ccli.com')} style={btn(false)}><ExternalLink size={12} /> Open reporting.ccli.com</button>
          </div>
        </div>
      )}

      {/* Report table */}
      {report && report.rows.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ ...SECTION, display: 'grid', gridTemplateColumns: '1fr 86px 52px', gap: 8, padding: '0 10px' }}>
            <span>Song</span><span>CCLI #</span><span style={{ textAlign: 'right' }}>Used</span>
          </div>
          {report.rows.map((r) => (
            <div key={r.key} title={svcTip(r.services)} style={{ display: 'grid', gridTemplateColumns: '1fr 86px 52px', gap: 8, alignItems: 'center', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
              <span style={{ fontSize: 11.5, fontVariantNumeric: 'tabular-nums', color: C.text2 }}>{r.ccli}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: ACCENT, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.times}</span>
            </div>
          ))}
        </div>
      )}

      {/* Missing CCLI numbers — flagged, never silently dropped */}
      {report && report.missing.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          <div style={{ ...SECTION, display: 'flex', alignItems: 'center', gap: 5, color: '#f59e0b' }}>
            <AlertTriangle size={11} /> Needs a CCLI number
          </div>
          <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.6 }}>
            Used in this period but no number on file. Add it in the song editor (CCLI # field) — or leave blank if the song is public domain / licensed elsewhere; it still appears in the copied list without a number.
          </div>
          {report.missing.map((m) => (
            <div key={m.songId} title={svcTip(m.services)} style={{ display: 'grid', gridTemplateColumns: '1fr 86px 52px', gap: 8, alignItems: 'center', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 8, padding: '7px 10px' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
              <span style={{ fontSize: 10.5, color: '#f59e0b', fontWeight: 700 }}>no number</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.times}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {report && report.rows.length === 0 && report.missing.length === 0 && (
        <div style={{ fontSize: 11.5, color: C.faint2, lineHeight: 1.7 }}>
          No songs found in plans saved between {from || '…'} and {to || '…'}.
          The report counts songs from <b>saved service plans</b> (Shows) in this date range — save a plan after a service and it lands here automatically.
        </div>
      )}

      {/* Manual entries — songs sung ad-hoc, never in a plan */}
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={SECTION}>Sung outside the plan?</div>
        <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.6 }}>
          If a song was fired live and never entered the service order, add it here for this period. It joins the copied list marked “(manual)”.
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <input value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Song title" style={{ ...input(C), flex: '2 1 140px', minWidth: 0 }} />
          <input value={mCcli} onChange={(e) => setMCcli(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))} placeholder="CCLI #" style={{ ...input(C), flex: '1 1 80px', minWidth: 0 }} />
          <input type="number" min="1" value={mTimes} onChange={(e) => setMTimes(e.target.value)} title="Times used" style={{ ...input(C), flex: '0 1 64px', minWidth: 0 }} />
          <button onClick={addManual} style={btn(false)}><Plus size={12} /> Add</button>
        </div>
        {manual.map((m, i) => (
          <div key={`${m.title}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr 86px 52px 26px', gap: 8, alignItems: 'center', background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '7px 10px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
            <span style={{ fontSize: 11.5, color: C.text2, fontVariantNumeric: 'tabular-nums' }}>{m.ccli || '—'}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{m.times}</span>
            <button onClick={() => setManual((list) => list.filter((_, k) => k !== i))} title="Remove" style={{ background: 'transparent', border: 'none', color: '#FF4545', cursor: 'pointer', display: 'flex', padding: 3 }}><Trash2 size={12} /></button>
          </div>
        ))}
      </div>

      {/* Preview of exactly what gets copied */}
      {report && (report.rows.length > 0 || report.missing.length > 0 || manual.length > 0) && (
        <div style={{ display: 'grid', gap: 6 }}>
          <div style={SECTION}>What gets copied</div>
          <pre style={{ margin: 0, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '9px 11px', fontSize: 10.5, lineHeight: 1.65, color: C.text2, overflowX: 'auto', whiteSpace: 'pre' }}>{csv}</pre>
          <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.6, display: 'flex', alignItems: 'flex-start', gap: 5 }}>
            <FileText size={11} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Paste into CCLI's reporting form. oneLicense / easySong songs report to those agencies separately — the numbers here are CCLI's.</span>
          </div>
        </div>
      )}
    </div>
  );
}
