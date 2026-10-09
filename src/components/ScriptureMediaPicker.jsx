import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, RefreshCw, Search, Upload, Film, X } from 'lucide-react';
import { motion } from 'motion/react';
import { useApp } from '../context/AppContext';
import { stubTap } from '../lib/anim';
import { mediaLabel } from '../lib/backgrounds';

const FOLDER_KEY = 'bible_media_folder';

// Scripture media popup: pick a PICTURE or VIDEO from a folder on disk
// instead of uploading it every time. The folder is only a browsing source —
// on pick the file is referenced where it sits (media://kog-media/bf/…), so a
// whole worship-art folder costs no library copies. The path is remembered in
// localStorage so the popup opens already browsed. Also offers "In the app"
// (already-imported media) and an upload escape hatch in the footer.
export default function ScriptureMediaPicker({ mode = 'session', onClose, onPick }) {
  const { C, ACCENT, scriptureDefaultOptions = [], bibleMedia, scriptureDefault } = useApp();
  const [folder, setFolder] = useState(() => {
    try { return localStorage.getItem(FOLDER_KEY) || ''; } catch { return ''; }
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const current = mode === 'default'
    ? (scriptureDefault && scriptureDefault.value)
    : (bibleMedia && bibleMedia.value);

  const listFolder = async (dir) => {
    if (!window.require || !dir) { setItems([]); return; }
    setLoading(true);
    try {
      const { ipcRenderer } = window.require('electron');
      const got = await ipcRenderer.invoke('bible-media-list', dir);
      setItems(Array.isArray(got) ? got : []);
    } catch { setItems([]); }
    setLoading(false);
  };

  // Auto-browse on open so the popup lands on content, not a blank state.
  useEffect(() => { listFolder(folder); /* eslint-disable-line */ }, []);

  const chooseFolder = async () => {
    if (!window.require) return;
    try {
      const { ipcRenderer } = window.require('electron');
      const dir = await ipcRenderer.invoke('bible-media-pick-folder');
      if (!dir) return;
      setFolder(dir);
      try { localStorage.setItem(FOLDER_KEY, dir); } catch { /* private mode */ }
      listFolder(dir);
    } catch { /* dialog unavailable */ }
  };

  // Escape closes — capture phase so the workspace hotkeys never see it first.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const folderItems = useMemo(
    () => (q ? items.filter((it) => String(it.name).toLowerCase().includes(q)) : items),
    [items, q]
  );
  const appItems = useMemo(
    () => (q ? scriptureDefaultOptions.filter((o) => String(o.label || '').toLowerCase().includes(q)) : scriptureDefaultOptions),
    [scriptureDefaultOptions, q]
  );
  const folderName = folder ? folder.split(/[\\/]/).filter(Boolean).pop() || folder : '';

  const pickFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) onPick({ file });
    e.target.value = '';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 640, maxWidth: '94vw', maxHeight: '86vh', background: C.panel, border: '1px solid var(--ui-border2)', borderRadius: 14, padding: 18, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <FolderOpen size={15} color={ACCENT} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text, flex: 1 }}>Choose Scripture Media</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: C.muted, cursor: 'pointer', display: 'flex', padding: 4 }}><X size={16} /></button>
        </div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginBottom: 10 }}>
          {mode === 'default'
            ? 'Becomes the default background attached to every scripture you add.'
            : 'Applies to the live output right now — this session only.'}
        </div>

        {/* Folder bar: remembered path + pick + refresh */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div title={folder || 'No folder selected'} style={{ flex: 1, minWidth: 0, background: C.elevated, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '6px 9px', fontSize: 11.5, color: folder ? C.text2 : C.faint, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {folder || 'No folder selected'}
          </div>
          <motion.button {...stubTap} onClick={chooseFolder} style={{ background: ACCENT, border: 'none', color: '#fff', borderRadius: 8, padding: '6px 11px', fontSize: 11.5, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
            <FolderOpen size={12} /> {folder ? 'Change' : 'Select folder'}
          </motion.button>
          <motion.button {...stubTap} onClick={() => listFolder(folder)} title="Refresh this folder" style={{ background: C.elevated2, border: '1px solid var(--ui-border2)', color: C.muted, borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'inline-flex', flexShrink: 0 }}>
            <RefreshCw size={12} />
          </motion.button>
        </div>

        {/* Search filters both the folder listing and in-app media */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: C.input, border: '1px solid var(--ui-border2)', borderRadius: 8, padding: '6px 9px', marginBottom: 10 }}>
          <Search size={12} color={C.faint} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by filename…" style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', color: C.text, fontSize: 12, outline: 'none' }} />
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', marginRight: -4, paddingRight: 4 }}>
          {!folder && (
            <div style={{ textAlign: 'center', padding: '26px 16px 20px 16px' }}>
              <FolderOpen size={30} color={C.faint} style={{ margin: '0 auto 10px 0', display: 'block' }} />
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text2, marginBottom: 4 }}>No folder selected</div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.55, maxWidth: 380, margin: '0 auto 14px auto' }}>
                Pick the folder where your Bible pictures and videos live — they stay on disk and are used straight from there.
              </div>
              <motion.button {...stubTap} onClick={chooseFolder} style={{ background: ACCENT, border: 'none', color: '#fff', borderRadius: 9, padding: '9px 16px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>
                <FolderOpen size={13} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Select a folder
              </motion.button>
            </div>
          )}
          {folder && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>
                {loading ? 'Loading…' : `${folderName} — ${folderItems.length} file${folderItems.length === 1 ? '' : 's'}`}
              </div>
              {!loading && folderItems.length === 0 && (
                <div style={{ fontSize: 11.5, color: C.muted, padding: '4px 0 12px 0' }}>
                  {q ? 'No files match that search.' : 'No pictures or videos in this folder.'}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 14 }}>
                {folderItems.map((it) => (
                  <motion.button
                    {...stubTap}
                    key={it.url}
                    onClick={() => onPick({ type: it.type, value: it.url, name: it.name })}
                    title={it.name}
                    style={{
                      position: 'relative', aspectRatio: '16 / 10', borderRadius: 8, overflow: 'hidden',
                      border: current === it.url ? '2px solid ' + ACCENT : '1px solid var(--ui-border2)',
                      background: '#000', padding: 0, cursor: 'pointer', display: 'block', width: '100%',
                    }}
                  >
                    {it.type === 'video'
                      ? <Film size={20} color="#8b8ba0" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }} />
                      : <img src={it.url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 6px 4px 6px', fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                      {mediaLabel(it.name)}
                    </span>
                  </motion.button>
                ))}
              </div>
            </>
          )}

          {appItems.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 }}>In the app</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                {appItems.map((o) => (
                  <motion.button
                    {...stubTap}
                    key={o.value}
                    onClick={() => onPick({ type: o.type, value: o.value, name: o.name || o.label })}
                    title={o.label}
                    style={{
                      position: 'relative', aspectRatio: '16 / 10', borderRadius: 8, overflow: 'hidden',
                      border: current === o.value ? '2px solid ' + ACCENT : '1px solid var(--ui-border2)',
                      background: '#000', padding: 0, cursor: 'pointer', display: 'block', width: '100%',
                    }}
                  >
                    {o.type === 'video'
                      ? <video src={o.value} preload="metadata" muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      : <img src={o.value} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
                    <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '10px 6px 4px 6px', fontSize: 9.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                      {o.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Upload escape hatch: files not in the chosen folder */}
        <motion.label {...stubTap} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, background: 'rgba(139,92,246,0.12)', border: '1px dashed rgba(139,92,246,0.5)', color: '#C4B5FD', borderRadius: 10, padding: '9px', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>
          <Upload size={12} /> Or upload a picture / video
          <input type="file" accept="image/*,video/*" onChange={pickFile} style={{ display: 'none' }} />
        </motion.label>
      </motion.div>
    </motion.div>
  );
}
