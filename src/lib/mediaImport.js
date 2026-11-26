// ---------------------------------------------------------------------------
// NATIVE IMPORT PATH
//
// Every media surface used to open the renderer's own <input type="file">. That
// puts the OS dialog inside a Chromium window, hands back a File blob, and then
// copies the bytes through IPC anyway — two trips for a 300 MB clip. The main
// process already owns the copy + SQLite registration ('add-media-file'), so
// the components ask for real paths from Electron's native dialog and pass
// those straight to the importer instead.
//
// The <input> path stays alive as the fallback for anything that already has a
// File in hand (drag & drop, older call sites) — nothing that worked before is
// removed.
//
// LIBRARY SOURCE: files are REFERENCED where they already live on this
// computer, never copied into the app. A long-serving machine therefore keeps
// its media folder small (only thumbnails), and the library cannot bloat
// userData no matter how often files are added.
//
// NO LIBRARY CAP. The old 50-picture / 50-video limit is gone. Every surface
// that shows the library virtualizes its grid and renders cached stills (see
// lib/virtualMediaGrid.jsx), so the size of the library no longer decides how
// fast the panel feels; the main process builds video posters in the
// background, one clip at a time.
// ---------------------------------------------------------------------------

import { toast } from '../untitledui/components/ui/toast';

// LIBRARY CHANGED: main writes the row, but App holds the one library list that
// every picker (Media tab, song editor gallery, background rails) renders. A
// surface that imported a file used to show it only after the editor was closed
// and reopened, because nothing asked App to re-read. Importing fires this
// event; App debounces one refetch for all of them.
const MEDIA_CHANGED_EVENT = 'kog:media-changed';

export const notifyMediaChanged = () => {
  try { window.dispatchEvent(new CustomEvent(MEDIA_CHANGED_EVENT)); } catch {}
};

export const subscribeMediaChanged = (fn) => {
  const handler = () => { try { fn(); } catch {} };
  window.addEventListener(MEDIA_CHANGED_EVENT, handler);
  return () => window.removeEventListener(MEDIA_CHANGED_EVENT, handler);
};

const hasElectron = () => !!(typeof window !== 'undefined' && window.require);

// The main process says, per file, why it could not be added (wrong type,
// HEIC, app-owned copy, unreadable). Repeating that here is the difference
// between "the picker did nothing" and "that file cannot be used, here is why".
const reportSkipped = (skipped) => {
  if (!Array.isArray(skipped) || !skipped.length) return;
  const reasons = [...new Set(skipped.map((s) => (s && s.reason) || '').filter(Boolean))];
  const extra = skipped.length > reasons.length ? ` (${skipped.length} files)` : '';
  try {
    toast.add({
      type: 'error',
      title: skipped.length === 1 ? 'That file was not added' : `${skipped.length} files were not added`,
      description: `${reasons.join(' ') || 'Those files could not be used.'}${extra}`,
      duration: 8000,
    });
  } catch {}
};

/** Opens the OS picker; resolves to absolute paths ([] on cancel/unavailable). */
export const pickMediaFiles = async ({ kind = 'all', multiple = true } = {}) => {
  if (!hasElectron()) return [];
  try {
    const { ipcRenderer } = window.require('electron');
    const paths = await ipcRenderer.invoke('media-pick-files', { kind, multiple });
    return Array.isArray(paths) ? paths.filter(Boolean) : [];
  } catch {
    return [];
  }
};

/** Registers the given OS paths in the library (no copy), kicks the
 *  thumbnail/poster pipeline, and resolves to ready-to-use assets. */
export const importMediaPaths = async (paths) => {
  if (!hasElectron() || !Array.isArray(paths) || paths.length === 0) return [];
  try {
    const { ipcRenderer } = window.require('electron');
    const res = await ipcRenderer.invoke('media-import-paths', paths);
    // Current main returns { assets, skipped }; an older one returned the plain
    // array, so accept both and never lose a successful import to a shape.
    const assets = Array.isArray(res) ? res : Array.isArray(res && res.assets) ? res.assets : [];
    if (res && Array.isArray(res.skipped)) reportSkipped(res.skipped);
    const ready = assets.filter((a) => a && a.url);
    if (ready.length) notifyMediaChanged();
    return ready;
  } catch {
    return [];
  }
};

/** Show the operator's own file in its folder (Explorer/Finder). When the
 *  file is gone the main process opens the last-known folder instead. */
export const revealMediaSource = async (url) => {
  if (!hasElectron() || !url) return { ok: false, error: 'Only available inside the app.' };
  try {
    const { ipcRenderer } = window.require('electron');
    return await ipcRenderer.invoke('media-reveal-source', url) || { ok: false };
  } catch {
    return { ok: false, error: 'Could not open that folder.' };
  }
};

/** Point an existing library entry at wherever its file lives now. The URL —
 *  and therefore every song/cue that references it — does not change. */
export const relinkMediaSource = async (url) => {
  if (!hasElectron() || !url) return { ok: false, error: 'Only available inside the app.' };
  try {
    const { ipcRenderer } = window.require('electron');
    return await ipcRenderer.invoke('media-relink-source', url) || { ok: false };
  } catch {
    return { ok: false, error: 'Could not relink that file.' };
  }
};

/** Pick + import in one call — what an "Upload" / "Add" button should do. */
export const pickAndImportMedia = async (opts = {}) => {
  const paths = await pickMediaFiles(opts);
  if (!paths.length) return [];
  return importMediaPaths(paths);
};
