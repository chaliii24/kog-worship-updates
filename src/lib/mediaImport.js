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
// LIBRARY CAP: 50 pictures + 50 videos. The main process enforces the hard
// limit (electron/main.js) so no entry point can slip past it; this module
// adds the friendly half — it refuses to open a dialog with no room left and
// trims an oversized batch to the slots that remain, telling the operator why.
// ---------------------------------------------------------------------------

import { toast } from '../untitledui/components/ui/toast';
import { MEDIA_IMAGE_EXT, MEDIA_VIDEO_EXT, extOf } from '../../electron/mediaTypes.js';

export const MEDIA_IMAGE_LIMIT = 50;
export const MEDIA_VIDEO_LIMIT = 50;

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

const kindOfPath = (p) => {
  const ext = extOf(p);
  if (MEDIA_IMAGE_EXT.includes(ext)) return 'image';
  if (MEDIA_VIDEO_EXT.includes(ext)) return 'video';
  return 'audio';
};

/** How many pictures/videos the library already holds, and the cap per kind. */
export const getMediaLibraryStatus = async () => {
  const fallback = { limit: MEDIA_IMAGE_LIMIT, image: 0, video: 0 };
  if (!hasElectron()) return fallback;
  try {
    const { ipcRenderer } = window.require('electron');
    const s = await ipcRenderer.invoke('media-library-status');
    if (!s || typeof s !== 'object') return fallback;
    return {
      limit: Number(s.limit) || MEDIA_IMAGE_LIMIT,
      image: Math.max(0, Number(s.image) || 0),
      video: Math.max(0, Number(s.video) || 0),
    };
  } catch {
    return fallback;
  }
};

// The main process says, per file, why it could not be added (wrong type,
// HEIC, app-owned copy, library full). Repeating that here is the difference
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

const announceFull = (limit) => {
  try {
    toast.add({
      type: 'error',
      title: 'Media library is full',
      description: `The library keeps ${limit} pictures and ${limit} videos so the Media tab stays fast. Delete a few there to upload more.`,
      duration: 6000,
    });
  } catch {}
};

const announceSkipped = (skipped, limit) => {
  try {
    toast.add({
      type: 'info',
      title: 'Library limit reached',
      description: `Skipped ${skipped} file${skipped === 1 ? '' : 's'} — the library keeps ${limit} pictures and ${limit} videos. Delete a few in the Media tab to free room.`,
      duration: 6000,
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
  const kind = opts.kind || 'all';
  const status = await getMediaLibraryStatus();
  const full = (k) => (k === 'video' ? status.video : status.image) >= status.limit;

  // Nothing can be added: say so before the OS dialog opens.
  if (kind === 'video' && full('video')) { announceFull(status.limit); return []; }
  if (kind === 'image' && full('image')) { announceFull(status.limit); return []; }
  if (kind === 'all' && full('image') && full('video')) { announceFull(status.limit); return []; }

  const paths = await pickMediaFiles(opts);
  if (!paths.length) return [];

  // Trim the selection to the slots that are left; audio is uncapped.
  const room = {
    image: Math.max(0, status.limit - status.image),
    video: Math.max(0, status.limit - status.video),
  };
  const taken = { image: 0, video: 0 };
  let skipped = 0;
  const accepted = paths.filter((p) => {
    const k = kindOfPath(p);
    if (k === 'audio') return true;
    taken[k] += 1;
    if (taken[k] > room[k]) { skipped += 1; return false; }
    return true;
  });
  if (skipped) announceSkipped(skipped, status.limit);
  if (!accepted.length) return [];
  return importMediaPaths(accepted);
};
