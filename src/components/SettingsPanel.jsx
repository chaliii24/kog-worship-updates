import React, { useEffect, useState } from 'react';
import {
  Info, Palette, Monitor, LayoutTemplate, BookOpen, Database,
  RefreshCw, Download, Upload, FolderOpen, FileText, Trash2,
  Sun, Moon, Check, ExternalLink, Play, Music, Settings as SettingsIcon,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ICON_HUES, iconHue } from '../lib/icons';

// Settings tab (ex-Functions): GPresenter-style sections, but every row is a
// REAL control already wired in this app — no decorative toggles. Sections
// omitted on purpose: Language and License (this app has neither).
const SECTIONS = [
  { id: 'application', label: 'Application', icon: Info, kind: 'application' },
  { id: 'appearance', label: 'Appearance', icon: Palette, kind: 'appearance' },
  { id: 'display', label: 'Display', icon: Monitor, kind: 'display' },
  { id: 'templates', label: 'Song Templates', icon: LayoutTemplate, kind: 'templates' },
  { id: 'bibles', label: 'Bible Translations', icon: BookOpen, kind: 'bibles' },
  { id: 'data', label: 'Data Management', icon: Database, kind: 'data' },
];

const ASPECTS = ['16:9', '4:3', '16:10', '21:9'];
const RELEASES_URL = 'https://github.com/chaliii24/kog-worship-updates/releases';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

// One GPresenter-style row: label left, control right.
function Row({ C, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '9px 12px' }}>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text2 }}>{label}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{children}</span>
    </div>
  );
}

function ActionBtn({ C, ACCENT, onClick, disabled, primary, children, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: primary ? ACCENT : C.elevated2,
        border: '1px solid ' + (primary ? ACCENT : 'var(--ui-border2)'),
        color: primary ? '#fff' : C.text,
        padding: '6px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 800,
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.55 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 5,
      }}
    >{children}</button>
  );
}

export default function SettingsPanel() {
  const {
    C, ACCENT, libraryStats, appInfo, themeDark, toggleTheme, iconTheme, setIconTheme,
    outputAspect, setOutputAspect, setShowOutputMonitor,
    templates, applyTemplate, removeTemplate, saveCurrentTemplate,
    bibleLib, bibleLibFiltered, bibleTrans, bibleLibQuery, setBibleLibQuery,
    bibleLibLoading, bibleDL, openBibleTranslation, downloadBible,
    deleteBibleTranslation, refreshBibleLib,
    handleExport, handleImport, shellOpenDataFolder,
    aboutStatus, updateReady, updateProgress, updateVersion,
    handleCheckUpdates, handleDownloadUpdate, handleInstallUpdate,
  } = useApp();
  const [section, setSection] = useState('application');

  // Warm the Bible catalog when its section opens (the dock effect warms it
  // on tab visit too — this covers section revisits after downloads).
  useEffect(() => {
    if (section === 'bibles') refreshBibleLib();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const openExternal = (url) => {
    if (window.require) window.require('electron').ipcRenderer.invoke('open-external', url).catch(() => {});
  };
  const openLog = () => {
    if (window.require) window.require('electron').ipcRenderer.invoke('open-log-file').catch(() => {});
  };

  const phase = updateReady || 'idle';
  const busy = phase === 'checking' || phase === 'downloading' || phase === 'installing';
  const pct = Math.round(updateProgress?.percent || 0);
  const storageBytes = (appInfo?.storage?.dbBytes || 0) + (appInfo?.storage?.bibleBytes || 0);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
      {/* Section nav */}
      <div style={{ display: 'grid', gap: 4 }}>
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const on = section === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, textAlign: 'left',
                background: on ? 'rgba(139,92,246,0.16)' : 'transparent',
                border: '1px solid ' + (on ? 'rgba(139,92,246,0.5)' : 'transparent'),
                color: on ? '#C4B5FD' : C.text2, borderRadius: 9, padding: '8px 11px',
                fontSize: 12.5, fontWeight: on ? 800 : 600, cursor: 'pointer',
              }}
            >
              <Icon size={14} color={iconTheme === 'prism' ? iconHue(s.kind, C) : undefined} /> {s.label}
            </button>
          );
        })}
      </div>

      <div style={{ height: 1, background: 'var(--ui-border)' }} />

      {/* APPLICATION */}
      {section === 'application' && (
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {[
              { label: 'Songs', value: libraryStats?.songs ?? '—' },
              { label: 'Slides', value: libraryStats?.cues ?? '—' },
              { label: 'Services', value: libraryStats?.services ?? '—' },
              { label: 'Templates', value: libraryStats?.templates ?? '—' },
              { label: 'Media', value: libraryStats?.mediaAssets ?? '—' },
            ].map((s) => (
              <div key={s.label} style={{ background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.heading }}>{s.value}</div>
                <div style={{ fontSize: 9, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <Row C={C} label="Version">
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{appInfo?.version || '—'}</span>
            <button onClick={() => openExternal(RELEASES_URL + '/latest')} title="Open release notes" style={{ background: 'transparent', border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={11} /> What&apos;s New
            </button>
          </Row>

          <div style={{ display: 'grid', gap: 6, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '9px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.text2 }}>Updates</span>
              {phase === 'available' && (
                <ActionBtn C={C} ACCENT={ACCENT} primary onClick={handleDownloadUpdate}><Download size={12} /> Download{updateVersion ? ` v${updateVersion}` : ''}</ActionBtn>
              )}
              {phase === 'downloaded' && (
                <ActionBtn C={C} ACCENT={ACCENT} primary onClick={handleInstallUpdate}><RefreshCw size={12} /> Restart &amp; Install</ActionBtn>
              )}
              {!busy && phase !== 'available' && phase !== 'downloaded' && phase !== 'complete' && (
                <ActionBtn C={C} ACCENT={ACCENT} onClick={handleCheckUpdates}><RefreshCw size={12} /> Check</ActionBtn>
              )}
              {(busy || phase === 'complete') && (
                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.muted }}>
                  {phase === 'checking' && 'Checking…'}
                  {phase === 'downloading' && `Downloading… ${pct}%`}
                  {phase === 'installing' && 'Installing…'}
                  {phase === 'complete' && 'Installed — restart to finish'}
                </span>
              )}
            </div>
            {updateProgress && (
              <div style={{ height: 5, background: C.elevated2, borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: 999 }} />
              </div>
            )}
            {aboutStatus && !updateProgress && (
              <div style={{ fontSize: 11, color: C.muted }}>{aboutStatus}</div>
            )}
          </div>

          <Row C={C} label="Storage Used">
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{formatBytes(storageBytes)}</span>
          </Row>

          <Row C={C} label="Diagnostic log">
            <ActionBtn C={C} ACCENT={ACCENT} onClick={openLog} title="Open main.log"><FileText size={12} /> Open log</ActionBtn>
          </Row>

          <Row C={C} label="Developer">
            <span style={{ fontSize: 12, fontWeight: 700, color: C.muted }}>Charles Darius Arradaza</span>
          </Row>
        </div>
      )}

      {/* APPEARANCE */}
      {section === 'appearance' && (
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <Row C={C} label="Theme">
            <ActionBtn C={C} ACCENT={ACCENT} primary={themeDark} onClick={() => { if (!themeDark) toggleTheme(); }}><Moon size={12} /> Dark</ActionBtn>
            <ActionBtn C={C} ACCENT={ACCENT} primary={!themeDark} onClick={() => { if (themeDark) toggleTheme(); }}><Sun size={12} /> Light</ActionBtn>
          </Row>
          <div style={{ fontSize: 11, color: C.faint2, lineHeight: 1.6 }}>Dark is the operator-tuned OLED Midnight workspace; Light is for bright offices and daytime prep.</div>

          <div style={{ fontSize: 10, color: C.faint, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 4 }}>Icon style</div>
          {[
            {
              id: 'prism', name: 'Prism Slate',
              desc: 'Every kind of icon gets its own color, so the same function looks the same everywhere.',
              preview: [
                <Monitor key="m" size={15} color={ICON_HUES.outputs} />,
                <Music key="u" size={15} color={ICON_HUES.song} />,
                <SettingsIcon key="s" size={15} color={ICON_HUES.settings} />,
              ],
            },
            {
              id: 'mono', name: 'Mono',
              desc: 'Icons follow the theme — quiet and uniform.',
              preview: [
                <Monitor key="m" size={15} color={C.muted} />,
                <Music key="u" size={15} color={C.muted} />,
                <SettingsIcon key="s" size={15} color={C.muted} />,
              ],
            },
          ].map((opt) => {
            const on = iconTheme === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setIconTheme(opt.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  background: on ? 'rgba(52,211,153,0.08)' : C.elevated,
                  border: '1px solid ' + (on ? 'rgba(52,211,153,0.6)' : 'var(--ui-border2)'),
                  borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: C.elevated2, border: '1px solid var(--ui-border2)', borderRadius: 7, padding: '6px 8px', flexShrink: 0 }}>
                  {opt.preview}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 800, color: C.text }}>{opt.name}</span>
                  <span style={{ display: 'block', fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 2 }}>{opt.desc}</span>
                </span>
                {on && <Check size={15} color="#34d399" style={{ flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}

      {/* DISPLAY */}
      {section === 'display' && (
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ display: 'grid', gap: 6, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '9px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text2 }}>Default aspect</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ASPECTS.map((a) => (
                <button
                  key={a}
                  onClick={() => setOutputAspect(a)}
                  style={{
                    background: outputAspect === a ? ACCENT : C.elevated2,
                    border: '1px solid ' + (outputAspect === a ? ACCENT : 'var(--ui-border2)'),
                    color: outputAspect === a ? '#fff' : C.muted,
                    borderRadius: 7, padding: '6px 13px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer',
                  }}
                >{a}</button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.faint2, lineHeight: 1.6 }}>Applies live to physical outputs. Per-output resolution and overrides live under Outputs.</div>
          </div>
          <ActionBtn C={C} ACCENT={ACCENT} onClick={() => setShowOutputMonitor(true)}><Monitor size={12} /> Open Outputs</ActionBtn>
        </div>
      )}

      {/* SONG TEMPLATES */}
      {section === 'templates' && (
        <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          {(templates || []).map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 9, padding: '8px 10px' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
              <button onClick={() => applyTemplate(t.id)} title="Load into the service order" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.text, borderRadius: 7, padding: '5px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Play size={11} /> Use</button>
              <button onClick={() => removeTemplate(t.id)} title="Delete template" style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex', padding: 4 }}><Trash2 size={13} /></button>
            </div>
          ))}
          {!(templates || []).length && (
            <div style={{ fontSize: 11.5, color: C.faint2, lineHeight: 1.6 }}>No templates yet — arrange a service order, then save it here to reuse it any Sunday.</div>
          )}
          <ActionBtn C={C} ACCENT={ACCENT} onClick={saveCurrentTemplate}><Check size={12} /> Save current service as template</ActionBtn>
        </div>
      )}

      {/* BIBLE TRANSLATIONS */}
      {section === 'bibles' && (
        <div style={{ display: 'grid', gap: 6, alignContent: 'start' }}>
          <input
            value={bibleLibQuery}
            onChange={(e) => setBibleLibQuery(e.target.value)}
            placeholder={`Search ${bibleLib.length} versions…`}
            style={{ background: C.input, color: C.text, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '8px 10px', fontSize: 12, outline: 'none', width: '100%', boxSizing: 'border-box' }}
          />
          {bibleLibLoading && <div style={{ fontSize: 11, color: C.faint2 }}>Loading catalog…</div>}
          {[...bibleLibFiltered].sort((a, b) => ((b.installed ? 1 : 0) - (a.installed ? 1 : 0)) || a.name.localeCompare(b.name)).map((b) => {
            const isInstalled = b.installed;
            const isActive = bibleTrans === b.abbrev;
            const downloading = bibleDL.running && bibleDL.abbrev === b.abbrev;
            const pct = downloading ? Math.round((bibleDL.progress || 0) * 100) : 0;
            return (
              <div key={b.abbrev} style={{ display: 'grid', gap: 6, background: isActive ? 'rgba(139,92,246,0.12)' : C.elevated, border: '1px solid ' + (isActive ? 'rgba(139,92,246,0.5)' : 'var(--ui-border2)'), borderRadius: 9, padding: '8px 10px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.35 }}>{b.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: 600, color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {isInstalled ? `Installed · ${b.books} books` : downloading ? `Downloading… ${pct}%` : `${b.size || ''}${b.lang ? ` · ${b.lang}` : ''}`.replace(/^\W+/, '') || (b.code || b.abbrev).toUpperCase()}
                  </span>
                  {isInstalled ? (
                    <button onClick={() => { if (!isActive) openBibleTranslation(b.abbrev); }} style={{ flexShrink: 0, background: isActive ? '#7c3aed' : C.elevated2, border: '1px solid var(--ui-border)', color: isActive ? '#fff' : C.text2, padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>{isActive ? 'Active' : 'Open'}</button>
                  ) : (
                    <button onClick={() => downloadBible(b.abbrev)} disabled={downloading} style={{ flexShrink: 0, background: C.elevated2, border: '1px solid var(--ui-border)', color: C.text2, padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 800, cursor: downloading ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>{downloading ? `${pct}%` : 'Download'}</button>
                  )}
                </div>
                {downloading && (
                  <div style={{ height: 4, background: C.elevated2, borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: ACCENT, borderRadius: 999 }} />
                  </div>
                )}
                {isInstalled && b.abbrev !== 'kjv' && (
                  <button onClick={() => deleteBibleTranslation(b.abbrev)} style={{ justifySelf: 'start', background: 'transparent', border: 'none', color: '#f87171', fontSize: 10.5, fontWeight: 700, cursor: 'pointer', padding: 0 }}>Delete from device</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* DATA MANAGEMENT */}
      {section === 'data' && (
        <div style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <ActionBtn C={C} ACCENT={ACCENT} onClick={handleExport}><Download size={12} /> Backup Library</ActionBtn>
            <ActionBtn C={C} ACCENT={ACCENT} onClick={handleImport}><Upload size={12} /> Import Library</ActionBtn>
            <ActionBtn C={C} ACCENT={ACCENT} onClick={() => shellOpenDataFolder()}><FolderOpen size={12} /> Open Data Folder</ActionBtn>
          </div>
          {appInfo?.dbPath && (
            <div style={{ fontSize: 10.5, color: C.faint2, lineHeight: 1.7, overflowWrap: 'anywhere' }}>Database: {appInfo.dbPath}</div>
          )}
          <div style={{ fontSize: 11, color: C.faint2, lineHeight: 1.6 }}>Backups are portable JSON — move them between machines, then Import to restore. Per-song backups live under Songs → Export.</div>
        </div>
      )}
    </div>
  );
}
