import { app, BrowserWindow, ipcMain, screen, dialog, protocol, shell, session } from 'electron';
import electronUpdater from 'electron-updater';
const { autoUpdater } = electronUpdater;
import electronLog from 'electron-log';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Readable } from 'stream';
import { GoogleGenAI } from '@google/genai';
import ollama from 'ollama';
import PptxGenJS from 'pptxgenjs';
import dotenv from 'dotenv';
import { parseSongBlocks, sanitizeCues } from './songParse.js';
import { parseReference, matchBook } from './bibleResolve.js';
import { 
  getSongs, 
  getSongDetails, 
  saveSong, 
  deleteSong, 
  toggleFavorite, 
  updateLastUsed, 
  setSongBackground,
  setSongAudio,
  getMediaLibrary,
  addMediaAsset,
  deleteMediaAsset,
  getLibraryStats,
  exportLibrary, 
  importLibrary, 
  getServices, 
  getServiceDetails, 
  saveServicePlan,
  deleteService,
  getTemplates, 
  saveTemplate, 
  deleteTemplate,
  getPresentations,
  getPresentationDetails,
  savePresentation,
  deletePresentation,
  getBuiltinVideosDir,
  getBuiltinPhotosDir,
  getBuiltinVideoAssets,
  getBuiltinPhotoAssets
} from './database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.setPath('userData', path.join(app.getPath('appData'), 'kog-worship'));

// Local Font Access API (window.queryLocalFonts) — must be enabled before ready.
app.commandLine.appendSwitch('enable-local-font-access');

// Load the Gemini key in packaged builds too: cwd/.env (dev) is not shipped,
// so also look in resources/.env (bundled) and userData/.env (per-machine override).
if (!process.env.GEMINI_API_KEY) {
  const envCandidates = [
    path.join(process.resourcesPath || '', '.env'),
    path.join(app.getPath('userData'), '.env'),
    path.join(process.cwd(), '.env')
  ];
  for (const envPath of envCandidates) {
    if (envPath && fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      if (process.env.GEMINI_API_KEY) break;
    }
  }
}

const MEDIA_DIR = path.join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
]);

function mediaMime(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.aac') return 'audio/aac';
  return 'application/octet-stream';
}

function serveFileProtocol(rootDir, request) {
  const fileName = decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');
  if (!fileName || path.isAbsolute(fileName)) return new Response(null, { status: 404 });
  const filePath = path.join(rootDir, fileName);
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return new Response(null, { status: 404 });
  }
  const size = fs.statSync(filePath).size;
  const mime = mediaMime(fileName);
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader) {
    const match = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
    const start = match ? parseInt(match[1], 10) : 0;
    const end = match && match[2] ? Math.min(parseInt(match[2], 10), size - 1) : size - 1;
    const chunk = fs.createReadStream(filePath, { start, end });
    return new Response(Readable.toWeb(chunk), {
      status: 206,
      headers: {
        'Content-Type': mime,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }
  return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
    status: 200,
    headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' }
  });
}

function serveMediaProtocol() {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const builtinDir = getBuiltinVideosDir();
  const builtinPhotosDir = getBuiltinPhotosDir();
  protocol.handle('media', async (request) => {
    try {
      // Bundled backgrounds are served under media://kog-media/builtin/... (videos)
      // and media://kog-media/builtin-photos/... (photos).
      const url = new URL(request.url);
      if (url.pathname.startsWith('/builtin-photos/')) return serveFileProtocol(builtinPhotosDir, request);
      if (url.pathname.startsWith('/builtin/')) return serveFileProtocol(builtinDir, request);
      return serveFileProtocol(MEDIA_DIR, request);
    } catch (e) {
      return new Response(null, { status: 500 });
    }
  });
}

ipcMain.handle('add-media-file', async (event, sourcePath) => {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) return null;
    const ext = path.extname(sourcePath).toLowerCase();
    if (!['.mp4', '.webm', '.mov', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.mp3', '.m4a', '.wav', '.ogg', '.aac'].includes(ext)) return null;
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    fs.copyFileSync(sourcePath, path.join(MEDIA_DIR, fileName));
    const url = `media://kog-media/${encodeURIComponent(fileName)}`;
    const kind = ['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext) ? 'image' : ['.mp4', '.webm', '.mov'].includes(ext) ? 'video' : 'audio';
    addMediaAsset(url, kind, fileName);
    return url;
  } catch (e) {
    return null;
  }
});

let operatorWindow;
const outputWindows = new Map(); // id -> { win, role, displayId, name }

// Dev serves Vite from localhost; packaged builds load the bundled renderer.
function getAppStartUrl() {
  if (process.env.ELECTRON_START_URL) return process.env.ELECTRON_START_URL;
  if (app.isPackaged) return `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;
  return 'http://localhost:5173';
}

function createWindow() {
  operatorWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    title: 'KOG Worship - Matrix Command',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });

  operatorWindow.loadURL(getAppStartUrl());

  // On 1080p-class PC monitors the operator UI is sized up so it does not look
  // tiny: maximize the window and lightly zoom the interface.
  operatorWindow.webContents.on('did-finish-load', () => {
    try {
      const h = screen.getPrimaryDisplay().bounds.height;
      if (h >= 1050 && h <= 1300) {
        operatorWindow.maximize();
        operatorWindow.webContents.setZoomFactor(1.15);
      }
    } catch (e) {}
  });

  operatorWindow.on('closed', () => app.quit());
}

autoUpdater.logger = electronLog;
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

app.whenReady().then(() => {
  // Auto-grant localFontAccess (and everything else this local app needs).
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  serveMediaProtocol();
  createWindow();
  screen.on('display-added', notifyDisplaysChanged);
  screen.on('display-removed', notifyDisplaysChanged);
  screen.on('display-metrics-changed', notifyDisplaysChanged);
  setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
});

// --- OUTPUT DISPLAYS: list available physical displays/projectors ---
function getDisplayList() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays()
    .filter((display) => display.internal !== true)
    .map((display, index) => ({
      id: display.id,
      label: display.label || `Display ${index + 1}`,
      width: display.bounds.width,
      height: display.bounds.height,
      primary: display.id === primaryId,
      internal: false,
      scaleFactor: display.scaleFactor
    }));
}

ipcMain.handle('list-displays', () => getDisplayList());

function notifyDisplaysChanged() {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('displays-changed', getDisplayList());
  }
}

// --- OUTPUT WINDOW REGISTRY ---
// Every configured output owns one window, keyed by a stable id.
// displayId = number -> physical display, 'preview' -> dev preview window, null -> closed.

function outputRoute(output) {
  const role = encodeURIComponent(output.role || 'lyrics');
  return `#/output/${encodeURIComponent(output.id)}?role=${role}`;
}

function resolutionPreset(res) {
  const map = {
    '3840x2160': [3840, 2160],
    '2560x1440': [2560, 1440],
    '1920x1200': [1920, 1200],
    '1920x1080': [1920, 1080],
    '1600x1200': [1600, 1200],
    '1600x900': [1600, 900],
    '1440x900': [1440, 900],
    '1400x1050': [1400, 1050],
    '1366x768': [1366, 768],
    '1280x1024': [1280, 1024],
    '1280x800': [1280, 800],
    '1280x768': [1280, 768],
    '1280x720': [1280, 720],
    '1024x768': [1024, 768],
    '800x450': [800, 450]
  };
  return (res && map[res]) ? map[res] : null;
}

function createOutputWindow(output) {
  const displayId = output.displayId;
  const target = displayId === 'preview' ? null : screen.getAllDisplays().find((d) => d.id === displayId);
  const startUrl = getAppStartUrl();
  const preset = resolutionPreset(output.resolution);
  const isWindowed = preset !== null;

  let win;
  if (!isWindowed) {
    const primary = target || screen.getPrimaryDisplay();
    win = new BrowserWindow({
      x: primary.bounds.x,
      y: primary.bounds.y,
      width: primary.bounds.width,
      height: primary.bounds.height,
      fullscreen: true,
      frame: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      minimizable: false,
      movable: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
  } else {
    const [w, h] = preset;
    win = new BrowserWindow({
      width: w,
      height: h,
      x: target ? (target.bounds.x + 60) : (60 + outputWindows.size * 40),
      y: target ? (target.bounds.y + 60) : (60 + outputWindows.size * 40),
      title: `${output.name || 'Output'} (${w}×${h})`,
      autoHideMenuBar: true,
      alwaysOnTop: true,
      minimizable: false,
      fullscreen: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
  }

  outputWindows.set(output.id, {
    win,
    role: output.role || 'lyrics',
    displayId: displayId ?? null,
    name: output.name || 'Output',
    resolution: isWindowed ? (output.resolution || 'native') : 'native'
  });

  win.loadURL(`${startUrl}${outputRoute(output)}`);
  win.webContents.on('did-finish-load', () => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('update-output-aspect', output.aspect || '16:9');
    }
  });
  win.on('closed', () => {
    if (outputWindows.get(output.id)?.win === win) outputWindows.delete(output.id);
  });
}

function closeOutputWindow(id) {
  const entry = outputWindows.get(id);
  if (entry?.win && !entry.win.isDestroyed()) entry.win.close();
  outputWindows.delete(id);
}

function closeAllOutputs() {
  for (const id of [...outputWindows.keys()]) closeOutputWindow(id);
}

function syncOutputs(outputs) {
  lastSyncedOutputs = Array.isArray(outputs) ? outputs : [];
  // Only outputs the operator has explicitly started are opened. Assignments
  // are restored on launch, but `enabled` is never persisted, so nothing is
  // projected until the operator starts an output.
  const desired = (Array.isArray(outputs) ? outputs : [])
    .filter((o) => o && o.id && o.enabled === true && o.displayId !== null && o.displayId !== undefined && o.displayId !== '');

  const desiredIds = new Set(desired.map((o) => o.id));
  for (const id of [...outputWindows.keys()]) {
    if (!desiredIds.has(id)) closeOutputWindow(id);
  }

  for (const output of desired) {
    const existing = outputWindows.get(output.id);
    if (!existing) {
      createOutputWindow(output);
    } else if (existing.displayId !== output.displayId || existing.role !== output.role || existing.resolution !== (output.resolution || 'native')) {
      closeOutputWindow(output.id);
      createOutputWindow(output);
    } else {
      existing.name = output.name || existing.name;
    }
  }
}

ipcMain.on('outputs-sync', (event, outputs) => syncOutputs(outputs));

// Persist output assignments so the layout survives restarts.
const OUTPUTS_FILE = path.join(app.getPath('userData'), 'outputs.json');
ipcMain.handle('outputs-load', () => {
  try {
    const raw = fs.readFileSync(OUTPUTS_FILE, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
});
ipcMain.on('outputs-save', (event, outputs) => {
  try {
    // Persist assignments only — never the runtime `enabled` flag, so outputs
    // stay closed on the next launch until the operator starts them.
    const persistable = (Array.isArray(outputs) ? outputs : []).map((o) => ({
      id: o.id,
      name: o.name,
      role: o.role,
      displayId: o.displayId,
      resolution: o.resolution || 'native',
      aspect: o.aspect || '16:9'
    }));
    fs.writeFileSync(OUTPUTS_FILE, JSON.stringify(persistable, null, 2));
  } catch (e) {}
});

// Content routing: by role (lyrics / stage) or by explicit output id.
// The last payloads are cached so an output window opened AFTER a cue was
// fired can show the currently live slide immediately — without this, a
// freshly started output stayed black until the operator re-clicked a cue.
let lastLiveSlide = null;
let lastLiveStage = null;

ipcMain.on('update-live-slide', (event, slideData) => {
  lastLiveSlide = slideData || null;
  for (const { win, role } of outputWindows.values()) {
    if (role === 'lyrics' && win && !win.isDestroyed()) win.webContents.send('render-live-slide', slideData);
  }
});

ipcMain.on('update-live-stage', (event, stageData) => {
  lastLiveStage = stageData || null;
  for (const { win, role } of outputWindows.values()) {
    if (role === 'stage' && win && !win.isDestroyed()) win.webContents.send('render-live-stage', stageData);
  }
});

// Pulled by an output window once its render listeners are registered, so
// there is no load-order race (a push on did-finish-load could arrive
// before the window is listening and be lost).
ipcMain.handle('get-live-state', () => ({ slide: lastLiveSlide, stage: lastLiveStage }));

ipcMain.on('update-output-aspect', (event, aspect) => {
  for (const [id, { win }] of outputWindows) {
    if (win && !win.isDestroyed()) {
      const output = lastSyncedOutputs.find(o => o.id === id);
      win.webContents.send('update-output-aspect', output?.aspect || aspect);
    }
  }
});

ipcMain.on('output-content', (event, payload) => {
  const entry = payload && outputWindows.get(payload.outputId);
  if (entry?.win && !entry.win.isDestroyed()) {
    entry.win.webContents.send(payload.channel || 'render-live-slide', payload.data);
  }
});

// Legacy single-window toggles kept for compatibility.
function externalDisplayId() {
  const d = screen.getAllDisplays().find((display) => display.bounds.x !== 0 || display.bounds.y !== 0);
  return d ? d.id : 'preview';
}

let lastSyncedOutputs = [];

function openDefaultOutput(id, name, role) {
  closeOutputWindow(id);
  const existing = lastSyncedOutputs.find(o => o.id === id);
  createOutputWindow({ id, name, role, displayId: externalDisplayId(), resolution: existing?.resolution });
}

ipcMain.on('toggle-dev-projector', () => {
  if (outputWindows.has('projector')) { closeOutputWindow('projector'); return; }
  openDefaultOutput('projector', 'Lyrics Projector', 'lyrics');
});

ipcMain.on('toggle-stage-window', () => {
  if (outputWindows.has('stage')) { closeOutputWindow('stage'); return; }
  openDefaultOutput('stage', 'Stage Monitor', 'stage');
});

ipcMain.on('close-output', (event, id) => closeOutputWindow(id));
ipcMain.on('close-all-outputs', () => closeAllOutputs());

// --- OUTPUT STATUS + LIVE THUMBNAILS (for the operator's monitor) ---
ipcMain.handle('get-output-status', () => {
  const displays = screen.getAllDisplays();
  return [...outputWindows.entries()].map(([id, entry]) => {
    const disp = entry.displayId === 'preview' ? null : displays.find((d) => d.id === entry.displayId) || null;
    return {
      id,
      name: entry.name,
      role: entry.role,
      open: !!(entry.win && !entry.win.isDestroyed()),
      displayId: disp ? entry.displayId : null,
      displayLabel: disp ? (disp.label || `${disp.bounds.width}×${disp.bounds.height}`) : null,
      width: disp ? disp.bounds.width : null,
      height: disp ? disp.bounds.height : null
};
  });
});
 
// --- AUTO UPDATER IPC ---
ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { updateInfo: result?.updateInfo, error: null };
  } catch (error) {
    return { updateInfo: null, error: error.message };
  }
});
 
ipcMain.handle('download-update', async () => {
  return new Promise((resolve) => {
    const cleanup = () => {
      autoUpdater.removeAllListeners('update-available');
      autoUpdater.removeAllListeners('update-not-available');
      autoUpdater.removeAllListeners('error');
    };
    autoUpdater.once('update-available', async () => {
      try {
        await autoUpdater.downloadUpdate();
        cleanup();
        resolve({ success: true, error: null });
      } catch (error) {
        cleanup();
        resolve({ success: false, error: error.message });
      }
    });
    autoUpdater.once('update-not-available', () => {
      cleanup();
      resolve({ success: false, error: 'App is up to date. No update available.' });
    });
    autoUpdater.once('error', (err) => {
      cleanup();
      resolve({ success: false, error: err.message });
    });
    autoUpdater.checkForUpdates();
  });
});
 
ipcMain.handle('install-update', async () => {
  autoUpdater.quitAndInstall(true, true);
  return { success: true };
});
 
ipcMain.on('update-available', (event, info) => {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('update-available', info);
  }
});
 
ipcMain.on('update-downloaded', (event, info) => {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('update-downloaded', info);
  }
});

autoUpdater.on('download-progress', (progress) => {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  }
});
 
ipcMain.on('update-error', (event, error) => {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('update-error', error);
  }
});
 
ipcMain.on('update-not-available', (event, info) => {
  if (operatorWindow && !operatorWindow.isDestroyed()) {
    operatorWindow.webContents.send('update-not-available', info);
  }
});
 
let monitorTimer = null;
let monitorTarget = null;

async function pushOutputThumbnails() {
  if (!monitorTarget || monitorTarget.isDestroyed()) return;
  const entries = [];
  for (const [id, entry] of outputWindows.entries()) {
    const win = entry.win;
    if (!win || win.isDestroyed()) continue;
    try {
      const image = await win.webContents.capturePage();
      if (image.isEmpty()) continue;
      const small = image.resize({ width: 480 });
      entries.push({ id, dataUrl: 'data:image/jpeg;base64,' + small.toJPEG(60).toString('base64') });
    } catch (e) {}
  }
  if (monitorTarget && !monitorTarget.isDestroyed()) {
    monitorTarget.webContents.send('output-thumbnails', entries);
  }
}

ipcMain.on('monitor-start', () => {
  monitorTarget = operatorWindow;
  if (monitorTimer) clearInterval(monitorTimer);
  pushOutputThumbnails();
  monitorTimer = setInterval(pushOutputThumbnails, 1000);
});

ipcMain.on('monitor-stop', () => {
  if (monitorTimer) { clearInterval(monitorTimer); monitorTimer = null; }
  monitorTarget = null;
});

// --- HYBRID AI PARSER HANDLER (GEMINI / OLLAMA / REGEX FAILSAFE) ---
const promptInstruction = `You are an expert worship presentation software assistant. Parse the raw song text below — it may be plain lyrics (no chords) or a guitar chord chart.
1. If it is a chord chart, completely strip out all guitar chords (e.g., C#m, A, E, D/F#), capo/transpose markers and structural tab markers, keeping only the clean lyrics. If it is plain lyrics with no chords, keep every word exactly as written — do NOT remove words that merely look like chords (such as "A" or "am").
2. Organize the lyrics into logical sections (Verse 1, Chorus, Bridge, etc.). Use explicit markers such as [Verse 1], "Chorus:" or (Bridge) when the text has them. If the text has NO section markers, split it by blank-line stanzas and label them "Verse 1", "Verse 2", … in order of first appearance; when the same stanza repeats (the chorus), label EVERY occurrence of that repeated stanza "Chorus".
3. Return ONLY a valid JSON array of objects, where each object has a "label" (string) and "text" (string of lyrics). Do not include markdown formatting blocks like \`\`\`json, just the raw JSON string.
4. NEVER invent, guess, translate, paraphrase, or rewrite lyrics. Use ONLY words that appear in the provided text.
5. If the provided text does not contain actual song lyrics (for example it is website navigation, menus, comments, ads, or unrelated content), return exactly [].`;

ipcMain.handle('ai-parse-chord-chart', async (event, payload) => {
  const rawText = typeof payload === 'object' ? payload.text : payload;
  const requestedModel = typeof payload === 'object' ? payload.model : 'gemini-1.5-flash';
  const linesPerSlide = (typeof payload === 'object' && payload && Number(payload.linesPerSlide)) || 4;

  if (!rawText || !rawText.trim()) {
    return { cues: [], modelUsed: 'None' };
  }

  // Helper function to extract array regardless of root JSON key
  const extractCuesArray = (parsedObj) => {
    if (Array.isArray(parsedObj)) return parsedObj;
    if (parsedObj && typeof parsedObj === 'object') {
      const keys = ['cues', 'sections', 'data', 'lyrics', 'result', 'song'];
      for (const key of keys) {
        if (Array.isArray(parsedObj[key])) return parsedObj[key];
      }
      // Return first key that contains an array
      const firstArrayKey = Object.keys(parsedObj).find(k => Array.isArray(parsedObj[k]));
      if (firstArrayKey) return parsedObj[firstArrayKey];
    }
    return [];
  };

  // 1. Try Gemini Online Mode
  const hasGeminiKey = Boolean(String(process.env.GEMINI_API_KEY || '').trim());
  const wantsGemini = requestedModel !== 'ollama';
  let geminiError = null;
  let ollamaError = null;

  if (hasGeminiKey && wantsGemini) {
    try {
      const cleanKey = process.env.GEMINI_API_KEY.trim().replace(/^["']|["']$/g, '');
      const ai = new GoogleGenAI({ apiKey: cleanKey });
      
      // Flash uses the pinned 3.6 model; "Pro" maps to the live pro alias
      // (gemini-3.6-pro does not exist and 404s).
      let targetModel = 'gemini-3.6-flash';
      if (requestedModel.includes('pro')) {
        targetModel = 'gemini-pro-latest';
      }

      const response = await ai.models.generateContent({
        model: targetModel,
        contents: `${promptInstruction}\n\nRaw Text to parse:\n${rawText}`
      });

      const rawResponseText = response.text || (response.response && response.response.text ? response.response.text() : '');
      let cleanJsonString = rawResponseText.trim().replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
      const parsedObj = JSON.parse(cleanJsonString);
      const cuesArray = sanitizeCues(extractCuesArray(parsedObj));

      if (cuesArray.length > 0) {
        const displayModel = requestedModel.includes('pro') ? 'Gemini Pro (Online)' : 'Gemini 3.6 Flash (Online)';
        return { cues: cuesArray, modelUsed: displayModel };
      }
    } catch (onlineError) {
      geminiError = onlineError;
      console.log('Gemini API Error:', onlineError.message, '-> Switching to local Ollama fallback...');
    }
  }

  // 2. Try Ollama Offline Mode
  try {
    const ollamaResponse = await ollama.chat({
      model: 'llama3.2:3b', 
      messages: [
        { role: 'system', content: String(promptInstruction) },
        { role: 'user', content: String(rawText) }
      ],
      format: 'json'
    });

    let localJsonString = ollamaResponse.message.content.trim().replace(/^```json\s*/, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    const parsedObj = JSON.parse(localJsonString);
    const cuesArray = sanitizeCues(extractCuesArray(parsedObj));

    if (cuesArray.length > 0) {
      return { cues: cuesArray, modelUsed: 'Ollama (llama3.2:3b - Offline)' };
    }
  } catch (offlineError) {
    ollamaError = offlineError;
    console.log('Ollama failed or returned unparseable structure. Switching to the Local Parser...');
  }

  // 3. Guarantee Failsafe Local Parser (Never returns empty). Shared with
  //    the renderer fallback in App.jsx so chord charts, marker-driven
  //    lyrics AND plain lyrics with no markers all build real blocks.
  const sections = parseSongBlocks(rawText, linesPerSlide);

  // Make the badge say WHY the AI was skipped, so "offline" is diagnosable.
  let fallbackLabel = 'Local Parser (Offline)';
  if (wantsGemini && !hasGeminiKey) fallbackLabel = 'No API Key - Local Parser (Offline)';
  else if (geminiError) fallbackLabel = 'Gemini Failed - Local Parser (Offline)';
  else if (ollamaError && requestedModel === 'ollama') fallbackLabel = 'Ollama Unavailable - Local Parser (Offline)';

  return {
    cues: sections,
    modelUsed: fallbackLabel
  };
});
// -------------------------------------------------------------

// Database IPC Handlers
ipcMain.handle('db-get-songs', (event, search, category) => getSongs(search, category));
ipcMain.handle('db-get-song-details', (event, id) => { updateLastUsed(id); return getSongDetails(id); });
ipcMain.handle('db-save-song', (event, data) => saveSong(data));
ipcMain.handle('db-delete-song', (event, id) => deleteSong(id));
ipcMain.handle('db-toggle-favorite', (event, id) => toggleFavorite(id));
ipcMain.handle('db-set-song-bg', (event, id, bgType, bgValue) => setSongBackground(id, bgType, bgValue));
ipcMain.handle('db-set-song-audio', (event, id, audioUrl) => setSongAudio(id, audioUrl));
ipcMain.handle('db-get-media', () => getMediaLibrary());
// Bundled stock backgrounds (videos + photos) so the renderer can seed the
// scripture background picker on first run.
ipcMain.handle('list-builtin-assets', () => ({
  videos: getBuiltinVideoAssets(),
  photos: getBuiltinPhotoAssets()
}));
ipcMain.handle('db-delete-media', (event, fileUrl) => {
  try {
    deleteMediaAsset(fileUrl);
    const fileName = decodeURIComponent((fileUrl || '').split('/').pop() || '');
    const filePath = path.join(MEDIA_DIR, fileName);
    if (!fileName || !filePath.startsWith(MEDIA_DIR) || !fs.existsSync(filePath)) return true;
    fs.unlinkSync(filePath);
    return true;
  } catch (e) {
    return false;
  }
});
ipcMain.handle('db-get-stats', () => getLibraryStats());

// Service Plan IPC Handlers
ipcMain.handle('db-get-services', () => getServices());
ipcMain.handle('db-get-service-details', (event, serviceId) => getServiceDetails(serviceId));
ipcMain.handle('db-save-service', (event, serviceData) => saveServicePlan(serviceData));
ipcMain.handle('db-delete-service', (event, serviceId) => deleteService(serviceId));

// Service Template IPC Handlers
ipcMain.handle('db-get-templates', () => getTemplates());
ipcMain.handle('db-save-template', (event, payload) => saveTemplate(payload.name, payload.items));
ipcMain.handle('db-delete-template', (event, templateId) => deleteTemplate(templateId));

// Presentation Deck IPC Handlers
ipcMain.handle('db-get-presentations', () => getPresentations());
ipcMain.handle('db-get-presentation', (event, id) => getPresentationDetails(id));
ipcMain.handle('db-save-presentation', (event, deck) => savePresentation(deck));
ipcMain.handle('db-delete-presentation', (event, id) => deletePresentation(id));

// ---- Presentation media + export helpers ----
async function urlToDataUri(url) {
  try {
    if (!url) return null;
    if (url.startsWith('data:')) return url;
    if (url.startsWith('media://')) {
      const fileName = decodeURIComponent(url.split('/').pop() || '');
      const filePath = path.join(MEDIA_DIR, fileName);
      if (!fileName || !fs.existsSync(filePath)) return null;
      return `data:${mediaMime(fileName)};base64,${fs.readFileSync(filePath).toString('base64')}`;
    }
    if (url.startsWith('file://')) {
      const filePath = fileURLToPath(url);
      if (!fs.existsSync(filePath)) return null;
      return `data:${mediaMime('x' + path.extname(filePath))};base64,${fs.readFileSync(filePath).toString('base64')}`;
    }
    if (/^https?:\/\//i.test(url)) {
      const res = await fetch(url, { headers: { 'User-Agent': 'KOGWorship/1.0' } });
      if (!res.ok) return null;
      const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
      const ab = await res.arrayBuffer();
      return `data:${contentType};base64,${Buffer.from(ab).toString('base64')}`;
    }
  } catch (_) {}
  return null;
}

function firstHex(value, fallback) {
  const m = String(value || '').match(/#[0-9a-fA-F]{6}/);
  return (m ? m[0] : fallback).replace('#', '');
}

ipcMain.handle('export-presentation-pptx', async (event, deck) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const safeName = String((deck && deck.title) || 'Presentation').replace(/[\\/:*?"<>|]/g, '_').trim() || 'Presentation';
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Presentation as PowerPoint',
      defaultPath: path.join(app.getPath('documents'), `${safeName}.pptx`),
      filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }]
    });
    if (canceled || !filePath) return { canceled: true };

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'KOG Worship';
    pptx.title = safeName;
    const tex = String((deck && deck.title) || '');
    if (tex) pptx.subject = tex;

    const slides = (deck && deck.slides) || [];
    for (const s of slides) {
      const slide = pptx.addSlide();
      const bg = s.bg || {};
      const textColor = (s.textColor || '#FFFFFF').replace('#', '');
      const W = 10, H = 5.625;
      if (!bg.type || bg.type === 'color') {
        slide.background = { color: (bg.value || '#0B0F19').replace('#', '') };
      } else if (bg.type === 'gradient') {
        slide.background = { color: firstHex(bg.value, '#0B0F19') };
      } else {
        const data = await urlToDataUri(bg.value);
        if (data) slide.background = { data }; else slide.background = { color: '0B0F19' };
      }

      const layout = s.layout || 'title-bullets';
      const bullets = Array.isArray(s.bullets) ? s.bullets.filter(b => String(b).trim() !== '') : [];
      const PT = 720 / 1280; // design px -> points on a 10in-wide slide
      const IN = 10 / 1280;  // design px -> inches
      const rects = s.__rects;
      const alignOf = (r) => (r && r.align) || s.align || 'left';
      const valignOf = (r) => (r && r.v === 'center' ? 'middle' : 'top');

      // Layout image (drawn behind the text)
      if (layout === 'full-image' || layout === 'title-image') {
        const img = await urlToDataUri(s.image || bg.value);
        if (img) slide.addImage({ data: img, x: 0, y: 0, w: W, h: H });
      } else if (layout === 'image-left' || layout === 'image-right') {
        const img = await urlToDataUri(s.image || bg.value);
        if (img) {
          const iw = 4.6, ix = layout === 'image-left' ? 0 : W - 4.6;
          slide.addImage({ data: img, x: ix, y: 0, w: iw, h: H });
        }
      }

      if (rects) {
        // Free positioning: every text box uses the exact rect the user dragged in the editor.
        const put = (key, text, opts) => {
          const r = rects[key];
          if (!r || !String(text || '').trim()) return;
          slide.addText(String(text), { x: r.x * IN, y: r.y * IN, w: r.w * IN, h: r.h * IN, color: textColor, align: alignOf(r), valign: valignOf(r), ...opts });
        };
        if (layout !== 'quote') put('title', s.title, { fontSize: Math.round((s.titleSize || 42) * PT), bold: true });
        put('subtitle', s.subtitle, { fontSize: Math.round(Math.max(16, (s.bodySize || 24) * 0.85) * PT) });
        if (bullets.length && rects.bullets) {
          const r = rects.bullets;
          slide.addText(bullets.map(b => ({ text: String(b), options: { bullet: true, color: textColor, breakLine: true } })), { x: r.x * IN, y: r.y * IN, w: r.w * IN, h: r.h * IN, fontSize: Math.round((s.bodySize || 24) * PT), align: alignOf(r), valign: 'top', color: textColor });
        }
        const bodyText = s.body || (layout === 'quote' ? s.title : '');
        if (String(bodyText || '').trim() && rects.body) {
          const r = rects.body;
          slide.addText(String(bodyText), { x: r.x * IN, y: r.y * IN, w: r.w * IN, h: r.h * IN, fontSize: Math.round((layout === 'quote' ? (s.titleSize || 42) : (s.bodySize || 24)) * PT), italic: layout === 'quote', color: textColor, align: alignOf(r), valign: valignOf(r) });
        }
      } else {
        const addBullets = (x, y, w, h) => {
          if (!bullets.length && !(s.body || '').trim()) return;
          if (bullets.length) {
            slide.addText(bullets.map(b => ({ text: String(b), options: { bullet: true, color: textColor, breakLine: true } })), { x, y, w, h, fontSize: 20, align: 'left', valign: 'top' });
          } else {
            slide.addText(String(s.body), { x, y, w, h, fontSize: 20, color: textColor, align: 'left', valign: 'top' });
          }
        };
        if (layout === 'image-right' || layout === 'image-left') {
          const tx = layout === 'image-right' ? 0.4 : 5.0;
          slide.addText(s.title || '', { x: tx, y: 0.5, w: 4.6, h: 1.0, fontSize: 30, bold: true, color: textColor, align: 'left', valign: 'top' });
          addBullets(tx, 1.6, 4.6, 3.4);
        } else if (layout === 'full-image' || layout === 'title-image') {
          slide.addText(s.title || '', { x: 0.6, y: H - 2.0, w: W - 1.2, h: 1.4, fontSize: 40, bold: true, color: textColor, align: 'center', valign: 'bottom' });
        } else if (layout === 'title') {
          slide.addText(s.title || '', { x: 0.7, y: 1.6, w: W - 1.4, h: 1.4, fontSize: 46, bold: true, color: textColor, align: 'center', valign: 'middle' });
          if ((s.subtitle || '').trim()) slide.addText(s.subtitle, { x: 0.9, y: 3.1, w: W - 1.8, h: 0.9, fontSize: 22, color: textColor, align: 'center', valign: 'top' });
        } else if (layout === 'quote') {
          slide.addText(s.body || (bullets[0] || ''), { x: 0.9, y: 1.3, w: W - 1.8, h: 3.0, fontSize: 32, italic: true, color: textColor, align: 'center', valign: 'middle' });
        } else if (layout === 'blank') {
          // nothing
        } else {
          slide.addText(s.title || '', { x: 0.6, y: 0.5, w: W - 1.2, h: 1.0, fontSize: 34, bold: true, color: textColor, align: 'left', valign: 'top' });
          addBullets(0.7, 1.7, W - 1.4, 3.3);
        }
      }
    }

    await pptx.writeFile({ fileName: filePath });
    return { ok: true, filePath };
  } catch (e) {
    console.log('pptx export failed:', e.message);
    return { error: e.message };
  }
});

// ---- Downloadable backgrounds: search (Openverse, no key) + download into media library ----
ipcMain.handle('search-backgrounds', async (event, query) => {
  try {
    const q = encodeURIComponent(String(query || 'worship church').trim() || 'worship church');
    const res = await fetch(`https://api.openverse.org/v1/images/?q=${q}&page_size=18&mature=false`, {
      headers: { 'User-Agent': 'KOGWorship/1.0', 'Accept': 'application/json' }
    });
    if (!res.ok) return { error: `Search failed (HTTP ${res.status})` };
    const data = await res.json();
    const results = (data.results || [])
      .filter(r => r && (r.thumbnail || r.url))
      .map(r => ({ id: r.id, thumbnail: r.thumbnail || r.url, url: r.url, title: r.title || 'Background', creator: r.creator || '' }));
    return { results };
  } catch (e) {
    return { error: 'Search failed: ' + e.message };
  }
});

ipcMain.handle('download-background', async (event, payload) => {
  try {
    const url = payload && payload.url;
    if (!url) return { error: 'No image URL' };
    const res = await fetch(url, { headers: { 'User-Agent': 'KOGWorship/1.0' } });
    if (!res.ok) return { error: `Download failed (HTTP ${res.status})` };
    const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim().toLowerCase();
    const extMap = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/bmp': '.bmp' };
    const ext = extMap[contentType] || '.jpg';
    fs.mkdirSync(MEDIA_DIR, { recursive: true });
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    const ab = await res.arrayBuffer();
    fs.writeFileSync(path.join(MEDIA_DIR, fileName), Buffer.from(ab));
    const mediaUrl = `media://kog-media/${encodeURIComponent(fileName)}`;
    addMediaAsset(mediaUrl, 'image', String(payload.name || 'Background').slice(0, 80));
    return { url: mediaUrl, name: payload.name || 'Background' };
  } catch (e) {
    return { error: 'Download failed: ' + e.message };
  }
});

// ---------------- WEB SONG IMPORT: universal lyrics / chord chart extractor ----------------
const decodeHtmlEntities = (s) => String(s || '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ');

// Convert raw HTML into clean line-per-verse text (handles <br> + block tags as newlines)
function htmlToText(html) {
  let t = String(html || '');
  t = t.replace(/<br\s*\/?>/gi, '\n');
  t = t.replace(/<\/(?:p|div|li|h[1-6]|tr|td|section|article|blockquote|pre|figcaption|table|header|footer|dl|dt|dd|ul|ol|span)>/gi, '\n');
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '\n')
       .replace(/<style[\s\S]*?<\/style>/gi, '\n')
       .replace(/<noscript[\s\S]*?<\/noscript>/gi, '\n')
       .replace(/<svg[\s\S]*?<\/svg>/gi, '\n')
       .replace(/<!--[\s\S]*?-->/g, '\n');
  t = t.replace(/<[^>]+>/g, ' ');
  t = decodeHtmlEntities(t);
  t = t.replace(/[ \t]+/g, ' ');
  t = t.split('\n').map(l => l.trim()).join('\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
}

// Boilerplate / website-chrome lines that should never appear inside song text
const JUNK_LINES = [
  /^\s*(sign\s*in|log\s*in|logout|log\s*out|sign\s*up|create\s+(an\s+)?account)\b/i,
  /^\s*(accept|allow|customize)\s*(all\s+cookies|cookies|all)?\.?\s*$/i,
  /^\s*(cookie|cookies|privacy)\s*(policy|notice)?\s*$/i,
  /^\s*(subscribe|join|follow|share\b|share\s+on|tweet|pin\s+it|print\b|favorite|add\s+to\s+(favorites|circle)|report\s+(a\s+)?(problem|issue)|vote\b|upvote|downvote|donate)\b/i,
  /^\s*(you\s+may\s+also\s+like|recommended\s*(for\s+you)?|more\s+(from|like|songs)?\s*(from)?|related\s+(songs|artists|chords)|similar\s+songs|top\s+songs)\b/i,
  /^\s*(advertisement|sponsored|ad\b|ads\b|advertisement\s+scroll)\s*$/i,
  /^\s*was\s+this\s+helpful\s*\??$/i,
  /^\s*comments?\s*$/i,
  /^\s*this\s+(song|page|tab)\s*(is|are)?\s*(copyrighted|the\s+property)\b/i,
  /^\s*all\s+(rights\s+(reserved|belong|and\s+their)|lyrics\s+and\s+their)\b/i,
  /^\s*(we\s+do\s+not\s+claim|we\s+don.t\s+own|no\s+copyright\s+infringement)\b/i,
  /^\s*chord\s+diagram(s)?\b/i,
  /^\s*get\s+(the\s+)?(ultimate|pro|plus|premium|lifetime|access)\b/i,
  /^\s*upgrade\s*(to\s+)?(plus|pro|premium)?\b/i,
  /^\s*(transpose|capo\s+\d+|tuning)\b/i,
  /^\s*(request\s*(a\s+)?(song|tab|chords?))\b/i,
  /^\s*[\w'’-]+(?:\s+[\w'’-]+){0,6}\s+lyrics\s*$/i,
];

// Same line filters as before, but paragraph breaks survive: stanza
// detection in songParse.js splits plain lyrics into blocks on blank
// lines, and the old .filter(Boolean) welded every verse into one wall.
const cleanSongLines = (text) => {
  const out = [];
  for (const rawLine of String(text || '').split('\n')) {
    const l = rawLine.trim();
    if (!l) { if (out.length && out[out.length - 1] !== '') out.push(''); continue; }
    if (/^[a-g]?[\|*]?[\s\-0-9\|]{4,}$/.test(l)) continue;
    if (JUNK_LINES.some(r => r.test(l))) continue;
    if (/^[\s│|·•*_=+#~-]{3,}$/.test(l)) continue;
    if (!/^https?:\/\/\S+$/i.test(l)) out.push(l);
  }
  while (out.length && out[0] === '') out.shift();
  while (out.length && out[out.length - 1] === '') out.pop();
  return out.join('\n');
};

// Return the inner HTML of a balanced <tag>...</tag> block starting at openIdx
function balancedTagContent(str, openIdx, tag = 'div') {
  let depth = 0;
  const re = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = openIdx;
  let m;
  while ((m = re.exec(str)) !== null) {
    if (m[0][1] === '/') depth--;
    else depth++;
    if (depth === 0) return str.slice(openIdx, m.index);
  }
  return null;
}

// Ultimate Guitar stores the actual tab in a js-store JSON blob
function extractUltimateGuitar(html) {
  const anchor = html.search(/class="js-store"/i);
  if (anchor === -1) return null;
  let json = null;
  const dataContent = html.slice(anchor, anchor + 500000).match(/data-content=(["'])([\s\S]*?)\1/);
  if (dataContent) {
    try { json = JSON.parse(decodeHtmlEntities(dataContent[2])); } catch (e) { json = null; }
  }
  if (!json) {
    const inner = balancedTagContent(html, anchor, 'div');
    if (inner) {
      const start = inner.search(/\{/);
      if (start !== -1) {
        try { json = JSON.parse(decodeHtmlEntities(inner.slice(start))); } catch (e) { json = null; }
      }
    }
  }
  if (!json) return null;
  // Current UG layout: store.page.data.tab_view — older layout: data.content.tab_view
  const tv =
    (json.store && json.store.page && json.store.page.data && json.store.page.data.tab_view) ||
    (json.data && json.data.content && json.data.content.tab_view) ||
    {};
  const content = (tv.wiki_tab && tv.wiki_tab.content) || (tv.tab && tv.tab.content);
  if (typeof content === 'string' && content.trim().length > 10) {
    return content
      .replace(/\[\/?tab\]/gi, '')
      .replace(/\[\/?ch\]/gi, '')
      .replace(/\r/g, '')
      .trim();
  }
  return null;
}

// Look for embedded structured lyrics (JSON-LD) used by many lyric sites
function extractJsonLdLyrics(html) {
  const blocks = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of blocks) {
    try {
      const obj = JSON.parse(m[1].trim());
      const queue = [obj];
      while (queue.length) {
        const node = queue.shift();
        if (!node || typeof node !== 'object') continue;
        for (const [key, value] of Object.entries(node)) {
          const k = key.toLowerCase();
          if ((k === 'lyrics' || k === 'parsedlyrics' || k === 'parsed_lyrics')) {
            if (typeof value === 'string') return value;
            if (value && typeof value === 'object' && typeof value.text === 'string') return value.text;
          }
          if (Array.isArray(value)) queue.push(...value);
          else if (value && typeof value === 'object') queue.push(value);
        }
      }
    } catch (e) { /* keep searching */ }
  }
  return null;
}

// ---------- Generic extraction v2: page-aware, title-driven ----------
// Page <title> / OG metadata — used to identify the true song container.
function extractPageMeta(html) {
  const meta = { title: '', ogTitle: '', description: '' };
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (t) meta.title = decodeHtmlEntities(t[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const og = /<meta\b[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i.exec(html)
    || /<meta\b[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i.exec(html);
  if (og) meta.ogTitle = decodeHtmlEntities(og[1]).replace(/\s+/g, ' ').trim();
  const d = /<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)
    || /<meta\b[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html);
  if (d) meta.description = decodeHtmlEntities(d[1]).replace(/\s+/g, ' ').trim();
  return meta;
}

// "Song Title - SiteName" / "Song Title | Site" -> "Song Title"
function cleanPageTitle(title, host) {
  if (!title) return '';
  const parts = title.replace(/\s+/g, ' ').trim().split(/\s+[-–—|•]\s+/).map(p => p.trim()).filter(Boolean);
  const hostWord = (host || '').replace(/^www\./i, '').split('.')[0].toLowerCase();
  if (parts.length > 1) {
    const last = parts[parts.length - 1].toLowerCase();
    const looksLikeSite = /\.(com|net|org|io|tv|co|ly|ph)\b/i.test(last) || (hostWord && last.includes(hostWord));
    if (looksLikeSite) parts.pop();
  }
  const cleaned = parts.join(' - ').trim();
  return cleaned.length > 100 ? cleaned.slice(0, 100) : cleaned;
}

const TITLE_STOP = new Set(['lyrics','lyric','songs','song','chords','chord','tab','tabs','music','official','video','with','karaoke','cover','live','full','and','the','of','to','remix','feat','ft','new','best','top']);
function titleTokens(title) {
  return (title || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !TITLE_STOP.has(w));
}

// Remove obvious non-song chrome so "related lyrics" blocks can't win.
const CHROME_CONTAINER = /<(?:ul|div|section|aside|footer|nav)\b[^>]*(?:class|id)=["'][^"']*(?:comment|related|recommended|similar|share|social|sidebar|widget|popular|trending|more-|you-may|you-might|even-more|next-|prev-|breadcrumb|copyright|menu|nav-|bottom-|footer-|loop|recent-|latest-)[^"']*["'][^>]*>[\s\S]*?<\/(?:ul|div|section|aside|footer|nav)>/gi;
function stripSongChrome(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<(?:header|footer|aside|nav)\b[^>]*>[\s\S]*?<\/(?:header|footer|aside|nav)>/gi, ' ')
    .replace(CHROME_CONTAINER, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

// Stop extraction at blocks that start listing other artists / songs.
const RELATED_HEADING = /^\s*(related\s*(songs|lyrics|posts|tabs|guitar)?|more\s*(from|lyrics|songs|tabs)?|you\s+may\s+also\s+like|recommended\s*(for)?(\s+you)?|similar\s*songs?|popular\s*(songs|lyrics|posts)?|top\s*(songs|lyrics|posts)?|next\s*(song|lyrics|chords?)?|previous\s*(song|lyrics|chords?)?|recent\s*(posts|lyrics|songs)?|other\s*(songs|lyrics|posts)?|latest\s*(lyrics|songs|posts)?|tags?\b|post\s*navigation|leave\s+a\s+comment|\d+\s*comments?|random\s*(song|post|lyrics)?)\b.*$/i;
function cutRelatedTail(text) {
  const lines = text.split('\n');
  const n = lines.length;
  for (let i = Math.floor(n * 0.25); i < n; i++) {
    if (RELATED_HEADING.test(lines[i])) return lines.slice(0, i).join('\n').trim();
  }
  return text;
}

function stripLeadingTitleLine(text, titleStr) {
  if (!titleStr || !text) return text;
  const first = text.split('\n')[0];
  if (first.length > 60) return text;
  const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const a = norm(first), b = norm(titleStr);
  if (!a || !b) return text;
  if (a === b) return text.split('\n').slice(1).join('\n').trim();
  const words = a.split(' ');
  if (words.length <= 6 && words.some(w => w.length > 2 && b.includes(w))) {
    const hit = words.filter(w => w.length > 2 && b.includes(w)).length;
    if (hit >= Math.min(2, words.length)) return text.split('\n').slice(1).join('\n').trim();
  }
  return text;
}

// Editorial/intro sentences that can appear before the actual lyrics.
const LEAD_EDITORIAL = /(is not a word|here is(\s+(a|one|our|the|another|a+|-|a|one))?|titled|another philippine|means\s|was written|this\b[\s\S]*\bsong\b|you can|below is|the origin|subscribe|please share|comment|and recording|version of the|all rights|the asidors|new collections|like this reading)/i;

// Skip intro paragraphs so extraction starts at the real song text.
function trimLyricLead(text, titleStr) {
  const tokens = titleTokens(titleStr);
  const lines = text.split('\n');
  if (!tokens.length) return text;
  const n = Math.min(lines.length, 25);
  for (let i = 0; i < n; i++) {
    const ln = lines[i];
    if (ln.length >= 90 || /^https?:\/\//i.test(ln)) continue;
    const lower = ln.toLowerCase();
    if (!tokens.some(t => lower.includes(t))) continue;
    if (LEAD_EDITORIAL.test(lower)) continue;
    return lines.slice(i).join('\n');
  }
  return text;
}

// Extract lyrics / chords from the most promising generic content container.
// Prefers <article>/<main>, scores by line count, and awards a big bonus to
// the container that contains the page title's distinctive words — so it picks
// THE song instead of a sidebar / related-lyrics block on small lyric blogs.
function extractGenericContainer(html, titleStr) {
  const tokens = titleTokens(titleStr);
  const searchable = stripSongChrome(html);
  const re = /<(div|section|article|main)\b[^>]*(?:class|id)=["'][^"']*(?:lyric|lyrics|song|songs|content|entry|article-content|post|song_content|songText|music|text|article)[^"']*["'][^>]*>/gi;
  let m;
  let best = null;
  while ((m = re.exec(searchable)) !== null) {
    const tag = m[1];
    const inner = balancedTagContent(searchable, m.index, tag);
    if (!inner) continue;
    const raw = htmlToText(inner);
    let text = cleanSongLines(raw);
    if (!text || text.length < 30 || text.startsWith('{')) continue;
    text = cutRelatedTail(text);
    if (!text || text.length < 30) continue;
    const stripped = stripLeadingTitleLine(text, titleStr);
    if (stripped) text = stripped;
    const lead = trimLyricLead(text, titleStr);
    if (lead) text = lead;
    const lines = text.split('\n').length;
    let score = lines;
    const lower = text.toLowerCase();
    if (tokens.length) {
      const hits = tokens.filter(t => lower.includes(t)).length;
      const ratio = hits / tokens.length;
      score += ratio >= 0.75 ? 60 : ratio >= 0.4 ? 25 : ratio > 0 ? 8 : 0;
    }
    if (tag === 'article' || tag === 'main') score += 15;
    if (lines > 140) score -= Math.floor((lines - 140) / 40) * 10;
    if (!best || score > best.score) best = { text, score };
  }
  return best ? best.text : null;
}

ipcMain.handle('fetch-song-url', async (event, url) => {
  try {
    if (!/^https?:\/\//i.test(url || '')) {
      return { error: 'Invalid URL. Make sure it starts with http:// or https://' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);
    if (!res.ok) return { error: `Page returned status ${res.status}` };
    const html = await res.text();
    let host = '';
    try { host = new URL(url).hostname; } catch (e) { host = ''; }
    const meta = extractPageMeta(html);

    // Channel 1: site-specific minor extraction for chord chart sources
    let text = null;
    let source = 'page';
    if (/ultimate-guitar\.com$/i.test(host)) { const t = extractUltimateGuitar(html); if (t) { text = t; source = 'Ultimate Guitar'; } }
    if (!text && /genius\.com$/i.test(host)) {
      const parts = [];
      const gRe = /<div\b[^>]*data-lyrics-container="true"[^>]*>/gi;
      let gMatch;
      while ((gMatch = gRe.exec(html)) !== null) {
        const inner = balancedTagContent(html, gMatch.index, 'div');
        if (inner) { const t = cleanSongLines(htmlToText(inner)); if (t) parts.push(t); }
      }
      if (parts.length) { text = parts.join('\n\n'); source = 'Genius'; }
    }
    if (!text && /azlyrics\.com$/i.test(host)) {
      const s = html.indexOf('<!-- start of lyrics -->');
      const e = html.indexOf('<!-- end of lyrics -->');
      if (s !== -1 && e !== -1 && e > s) {
        const t = cleanSongLines(htmlToText(html.slice(s, e)));
        if (t) { text = t; source = 'AZLyrics'; }
      }
    }

    // Channel 2: structured data (Covers many lyric sites transparently)
    if (!text) { const t = extractJsonLdLyrics(html); if (t) { text = t; source = 'Song text (structured data)'; } }

    // Channel 3: generic containers, title-aware so it picks THE song
    // (not a sidebar / related-lyrics block) even on small lyric blogs.
    if (!text) { const t = extractGenericContainer(html, meta.ogTitle || meta.title); if (t) { text = t; source = 'Song text (auto-located)'; } }

    // Channel 4: whole page stripped of navigation chrome
    if (!text) {
      const body = html
        .replace(/<script[\s\S]*?<\/script>/gi, '\n')
        .replace(/<style[\s\S]*?<\/style>/gi, '\n')
        .replace(/<form[\s\S]*?<\/form>/gi, '\n')
        .replace(/<ul\b[^>]*(?:class|id)=["'][^"']*(?:menu|nav)[^"']*["'][^>]*>[\s\S]*?<\/ul>/gi, '\n');
      let t = cutRelatedTail(cleanSongLines(htmlToText(stripSongChrome(body))));
      t = stripLeadingTitleLine(t, meta.ogTitle || meta.title);
      t = trimLyricLead(t, meta.ogTitle || meta.title);
      if (t) { text = t; source = 'Full page (best effort)'; }
    }

    if (!text) return { error: 'No readable lyrics or chord chart found on that page.' };
    if (text.length < 20) return { error: 'That page has too little song text to import.' };
    return { text, source, title: (meta.ogTitle || meta.title) ? cleanPageTitle(meta.ogTitle || meta.title, host) : null };
  } catch (err) {
    return { error: `Could not reach that page: ${err.message}` };
  }
});

ipcMain.handle('fetch-scripture', async (event, { reference, translation = 'kjv' } = {}) => {
  try {
    if (!reference || !/^[a-zA-Z0-9\s:.\- ,]+$/.test(reference)) {
      return { error: 'Enter a valid passage, e.g. John 3:16 or Psalm 23.' };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`https://bible-api.com/${encodeURIComponent(reference)}?translation=${encodeURIComponent(translation)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return { error: `Could not find that passage (${res.status}). Try "John 3:16".` };
    const data = await res.json();
    if (!data.text || !data.verses) return { error: 'No text returned for that reference.' };
    const text = data.verses
      .map(v => `${v.verse} ${(v.text || '').replace(/^(\s*)/, '')}`)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      reference: data.reference || reference,
      translation: data.translation_name || translation.toUpperCase(),
      text
    };
  } catch (err) {
    return { error: `Scripture lookup failed: ${err.message}` };
  }
});

// --- OFFLINE BIBLE LIBRARY (downloaded translations cached locally) ---
const BIBLE_DIR = path.join(app.getPath('userData'), 'bible');
const BIBLE_CATALOG_URL = 'https://api.getbible.net/v2/translations.json';

// Only offer versions useful for the Philippines: English + Philippine-language Bibles.
const BIBLE_PH_ABBREVS = new Set(['tagalog', 'tausug', 'cebuano', 'hiligaynon', 'iloko', 'bikol', 'waray', 'ceb', 'hil', 'tgl']);
function bibleKeep(entry) {
  return entry.langCode === 'en' || BIBLE_PH_ABBREVS.has(entry.abbrev);
}

// --- BEBLIA FALLBACK SOURCE (open XML Bible archive on GitHub) ---
// Used for Philippine-language versions that getbible does not carry, e.g. Cebuano RCPV/APSD.
const BEBLIA_BASE_URL = 'https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/master/';

const BIBLE_BOOK_NAMES = [
  'Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges', 'Ruth',
  '1 Samuel', '2 Samuel', '1 Kings', '2 Kings', '1 Chronicles', '2 Chronicles', 'Ezra', 'Nehemiah',
  'Esther', 'Job', 'Psalms', 'Proverbs', 'Ecclesiastes', 'Song of Solomon', 'Isaiah', 'Jeremiah',
  'Lamentations', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum',
  'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah', 'Malachi', 'Matthew', 'Mark', 'Luke', 'John', 'Acts',
  'Romans', '1 Corinthians', '2 Corinthians', 'Galatians', 'Ephesians', 'Philippians', 'Colossians',
  '1 Thessalonians', '2 Thessalonians', '1 Timothy', '2 Timothy', 'Titus', 'Philemon', 'Hebrews',
  'James', '1 Peter', '2 Peter', '1 John', '2 John', '3 John', 'Jude', 'Revelation'
];

const BIBLE_BOOK_ABBREVS = [
  'Gen', 'Exo', 'Lev', 'Num', 'Deu', 'Jos', 'Jdg', 'Rut', '1Sa', '2Sa', '1Ki', '2Ki', '1Ch', '2Ch',
  'Ezr', 'Neh', 'Est', 'Job', 'Psa', 'Pro', 'Ecc', 'Sng', 'Isa', 'Jer', 'Lam', 'Eze', 'Dan', 'Hos',
  'Joe', 'Amo', 'Oba', 'Jon', 'Mic', 'Nah', 'Hab', 'Zep', 'Hag', 'Zec', 'Mal', 'Mat', 'Mar', 'Luk',
  'Jhn', 'Act', 'Rom', '1Co', '2Co', 'Gal', 'Eph', 'Php', 'Col', '1Th', '2Th', '1Ti', '2Ti', 'Tit',
  'Phm', 'Heb', 'Jas', '1Pe', '2Pe', '1Jn', '2Jn', '3Jn', 'Jud', 'Rev'
];

// Localized display names for the 66 canonical books, keyed by language code.
// Beblia XML files only carry the canonical book number, so the name is supplied here.
// Sources: the published book lists of each translation (YouVersion / eBible).
const BIBLE_BOOK_NAMES_BY_LANG = {
  ceb: [
    'Genesis', 'Exodo', 'Levitico', 'Numeros', 'Deuteronomio', 'Josue', 'Mga Maghuhukom', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Mga Hari', '2 Mga Hari', '1 Cronicas', '2 Cronicas', 'Esdras', 'Nehemias',
    'Ester', 'Job', 'Mga Salmo', 'Mga Panultihon', 'Ecclesiastes', 'Awit sa mga Awit', 'Isaias', 'Jeremias',
    'Mga Pagbangotan', 'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amos', 'Abdias', 'Jonas', 'Miqueas', 'Nahum',
    'Habacuc', 'Sofonias', 'Hageo', 'Zacarias', 'Malaquias', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Mga Buhat',
    'Mga Taga-Roma', '1 Mga Taga-Corinto', '2 Mga Taga-Corinto', 'Mga Taga-Galacia', 'Mga Taga-Efeso',
    'Mga Taga-Filipos', 'Mga Taga-Colosas', '1 Mga Taga-Tesalonica', '2 Mga Taga-Tesalonica', '1 Timoteo',
    '2 Timoteo', 'Tito', 'Filemon', 'Mga Hebreo', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan',
    '3 Juan', 'Judas', 'Gipadayag'
  ],
  tl: [
    'Genesis', 'Exodo', 'Levitico', 'Mga Bilang', 'Deuteronomio', 'Josue', 'Mga Hukom', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Mga Hari', '2 Mga Hari', '1 Mga Cronica', '2 Mga Cronica', 'Ezra', 'Nehemias',
    'Ester', 'Job', 'Mga Awit', 'Mga Kawikaan', 'Ang Mangangaral', 'Ang Awit ni Solomon', 'Isaias', 'Jeremias',
    'Mga Panaghoy', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadias', 'Jonas', 'Mikas', 'Nahum',
    'Habakuk', 'Zefanias', 'Hagai', 'Zacarias', 'Malakias', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Mga Gawa',
    'Mga Taga-Roma', '1 Mga Taga-Corinto', '2 Mga Taga-Corinto', 'Mga Taga-Galacia', 'Mga Taga-Efeso',
    'Mga Taga-Filipos', 'Mga Taga-Colosas', '1 Mga Taga-Tesalonica', '2 Mga Taga-Tesalonica', '1 Timoteo',
    '2 Timoteo', 'Tito', 'Filemon', 'Mga Hebreo', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan',
    '3 Juan', 'Judas', 'Pahayag'
  ],
  ilo: [
    'Genesis', 'Exodo', 'Levitico', 'Numero', 'Deuteronomio', 'Josue', 'Uk-ukom', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Ar-ari', '2 Ar-ari', '1 Cronicas', '2 Cronicas', 'Ezra', 'Nehemias',
    'Ester', 'Job', 'Dagiti Salmo', 'Dagiti Proverbio', 'Eclesiastes', 'Kanta ni Solomon', 'Isaias', 'Jeremias',
    'Dungdung-aw', 'Ezekiel', 'Daniel', 'Oseas', 'Joel', 'Amos', 'Obadias', 'Jonas', 'Mikias', 'Nahum',
    'Habakuk', 'Sofonias', 'Haggeo', 'Zacarias', 'Malakias', 'San Mateo', 'San Marcos', 'San Lucas', 'San Juan',
    'Dagiti Aramid', 'Taga-Roma', '1 Taga-Corinto', '2 Taga-Corinto', 'Taga-Galacia', 'Taga-Efeso',
    'Taga-Filipos', 'Taga-Colosas', '1 Taga-Tesalonica', '2 Taga-Tesalonica', '1 Timoteo', '2 Timoteo',
    'Tito', 'Filemon', 'Hebreo', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan', '3 Juan', 'San Judas',
    'Paltiing'
  ],
  hil: [
    'Genesis', 'Exodo', 'Levitico', 'Numeros', 'Deuteronomio', 'Josue', 'Mga Hukom', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Mga Hari', '2 Mga Hari', '1 Mga Cronica', '2 Mga Cronica', 'Esdras', 'Nehemias',
    'Ester', 'Job', 'Mga Salmo', 'Mga Hulobaton', 'Ang Manugwali', 'Ang Amba sang Mga Ambahanon', 'Isaias',
    'Jeremias', 'Mga Panalambiton', 'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amos', 'Abdias', 'Jonas', 'Miqueas',
    'Nahum', 'Habakuk', 'Sofonias', 'Hageo', 'Zacarias', 'Malaquias', 'Mateo', 'Marcos', 'Lucas', 'Juan',
    'Mga Binuhatan', 'Mga Taga-Roma', '1 Mga Taga-Corinto', '2 Mga Taga-Corinto', 'Mga Taga-Galacia',
    'Mga Taga-Efeso', 'Mga Taga-Filipos', 'Mga Taga-Colosas', '1 Mga Taga-Tesalonica', '2 Mga Taga-Tesalonica',
    '1 Timoteo', '2 Timoteo', 'Tito', 'Filemon', 'Mga Hebreo', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan',
    '2 Juan', '3 Juan', 'Judas', 'Bugna'
  ],
  pam: [
    'Genesis', 'Exodo', 'Levitico', 'Ding Bilang', 'Deuteronomio', 'Josue', 'Ukum', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Ari', '2 Ari', '1 Cronica', '2 Cronica', 'Ezra', 'Nehemias',
    'Ester', 'Job', 'Ding Dalit', 'Ding Kasebian', 'Ecclesiastes', 'Ing Malagung Diling Kanta', 'Isaias',
    'Jeremias', 'Ding Tagulele', 'Ezekiel', 'Daniel', 'Hosea', 'Joel', 'Amos', 'Obadias', 'Jonas', 'Mikeas',
    'Nahum', 'Habakuk', 'Zepania', 'Hageo', 'Zacarias', 'Malakias', 'Mateo', 'Marcos', 'Lucas', 'Juan',
    'Ding Dapat', 'Roma', '1 Corinto', '2 Corinto', 'Galacia', 'Efeso', 'Filipos', 'Colosas', '1 Tesalonica',
    '2 Tesalonica', '1 Timoteo', '2 Timoteo', 'Tito', 'Filemon', 'Hebreo', 'Santiago', '1 Pedro', '2 Pedro',
    '1 Juan', '2 Juan', '3 Juan', 'Judas', 'Kapahayagan'
  ],
  war: [
    'Genesis', 'Exodo', 'Levitico', 'Numero', 'Deuteronomio', 'Josue', 'Mga Maghurukom', 'Ruth',
    '1 Samuel', '2 Samuel', '1 Hadi', '2 Hadi', '1 Cronicas', '2 Cronicas', 'Esdras', 'Nehemias',
    'Ester', 'Job', 'Mga Salmo', 'Mga Darahonon', 'Ecclesiastes', 'Kanta han mga Kanta', 'Isaias', 'Jeremias',
    'Pagnguyngoy', 'Ezequiel', 'Daniel', 'Oseas', 'Joel', 'Amos', 'Abdias', 'Jonas', 'Miqueas', 'Nahum',
    'Habacuc', 'Sofonias', 'Hageo', 'Zacarias', 'Malaquias', 'Mateo', 'Marcos', 'Lucas', 'Juan', 'Mga Buhat',
    'Mga Taga-Roma', '1 Mga Taga-Corinto', '2 Mga Taga-Corinto', 'Mga Taga-Galacia', 'Mga Taga-Efeso',
    'Mga Taga-Filipos', 'Mga Taga-Colosas', '1 Mga Taga-Tesalonica', '2 Mga Taga-Tesalonica', '1 Timoteo',
    '2 Timoteo', 'Tito', 'Filemon', 'Hebreo', 'Santiago', '1 Pedro', '2 Pedro', '1 Juan', '2 Juan', '3 Juan',
    'Judas', 'Ginpadayag'
  ]
};

function localizedBookName(langCode, nr) {
  const table = BIBLE_BOOK_NAMES_BY_LANG[langCode];
  return (table && table[nr - 1]) || BIBLE_BOOK_NAMES[nr - 1] || `Book ${nr}`;
}

// `file` points at a Beblia XML; `size` is an offline estimate shown before download.
const BEBLIA_CATALOG = [
  { abbrev: 'esv', source: 'beblia', file: 'EnglishESVBible.xml', name: 'English Standard Version (ESV)', lang: 'English', langCode: 'en', code: 'ESV', size: '4.7 MB', copyright: '© Crossway' },
  { abbrev: 'niv', source: 'beblia', file: 'EnglishNIVBible.xml', name: 'New International Version (NIV)', lang: 'English', langCode: 'en', code: 'NIV', size: '4.8 MB', copyright: '© Biblica, Inc' },
  { abbrev: 'nkjv', source: 'beblia', file: 'EnglishNKJBible.xml', name: 'New King James Version (NKJV)', lang: 'English', langCode: 'en', code: 'NKJV', size: '4.9 MB', copyright: '© Thomas Nelson' },
  { abbrev: 'ceb1917', source: 'beblia', file: 'CebuanoBible.xml', name: 'Cebuano Ang Biblia (1917)', lang: 'Cebuano', langCode: 'ceb', code: 'CBV', size: '5.8 MB', copyright: 'Public domain' },
  { abbrev: 'cebrcpv', source: 'beblia', file: 'CebuanoRCPVBible.xml', name: 'Cebuano Ang Bag-ong Maayong Balita Biblia (RCPV, 1999)', lang: 'Cebuano', langCode: 'ceb', code: 'RCPV', size: '5.1 MB', copyright: '© 1999 Philippine Bible Society' },
  { abbrev: 'ceb99', source: 'beblia', file: 'Cebuano1999Bible.xml', name: 'Cebuano Maayong Balita Biblia (1999)', lang: 'Cebuano', langCode: 'ceb', code: 'MBBCEB99', size: '5.1 MB', copyright: '© 1999 Philippine Bible Society' },
  { abbrev: 'ceb2011', source: 'beblia', file: 'Cebuano2011Bible.xml', name: 'Cebuano Ang Biblia (2011)', lang: 'Cebuano', langCode: 'ceb', code: 'ABCEB', size: '5.5 MB', copyright: '© 2011 Philippine Bible Society' },
  { abbrev: 'cebapsd', source: 'beblia', file: 'CebuanoAPSDBible.xml', name: 'Cebuano Ang Pulong sa Dios (APD/APSD)', lang: 'Cebuano', langCode: 'ceb', code: 'APD', size: '5.4 MB', copyright: '© Biblica, Inc' },
  { abbrev: 'tgl1905', source: 'beblia', file: 'TagalogBible.xml', name: 'Tagalog Ang Biblia (1905/1982)', lang: 'Tagalog', langCode: 'tl', code: 'TLAB', size: '5.7 MB', copyright: '© Philippine Bible Society, 1982' },
  { abbrev: 'tgl2001', source: 'beblia', file: 'Tagalog2001Bible.xml', name: 'Tagalog Ang Biblia (2001)', lang: 'Tagalog', langCode: 'tl', code: 'ABTAG01', size: '5.5 MB', copyright: '© Philippine Bible Society, 2001' },
  { abbrev: 'tglmbb05', source: 'beblia', file: 'Tagalog2005Bible.xml', name: 'Tagalog Magandang Balita Biblia (2005)', lang: 'Tagalog', langCode: 'tl', code: 'MBB', size: '5.0 MB', copyright: '© 2005 Philippine Bible Society' },
  { abbrev: 'tglmbb12', source: 'beblia', file: 'Tagalog2012Bible.xml', name: 'Tagalog Magandang Balita Biblia (2012)', lang: 'Tagalog', langCode: 'tl', code: 'MBB12', size: '5.0 MB', copyright: '© Philippine Bible Society' },
  { abbrev: 'tglmbb05r', source: 'beblia', file: 'TagalogRevised2005Bible.xml', name: 'Tagalog Magandang Balita Biblia (Revised, 2005)', lang: 'Tagalog', langCode: 'tl', code: 'MBBR', size: '5.0 MB', copyright: '© 2005 Philippine Bible Society' },
  { abbrev: 'tgltlba', source: 'beblia', file: 'TagalogTLBABible.xml', name: 'Tagalog Ang Biblia (TLBA)', lang: 'Tagalog', langCode: 'tl', code: 'TLBA', size: '5.6 MB', copyright: '' },
  { abbrev: 'tgldios', source: 'beblia', file: 'Tagalog2015Bible.xml', name: 'Tagalog Ang Salita ng Dios (2015)', lang: 'Tagalog', langCode: 'tl', code: 'ASD', size: '5.3 MB', copyright: '© Biblica, Inc' },
  { abbrev: 'ilo1996', source: 'beblia', file: 'IlokanoBible.xml', name: 'Ilokano Ti Baro a Naimbag a Damag Biblia (1996)', lang: 'Ilokano', langCode: 'ilo', code: 'IBNBD', size: '4.9 MB', copyright: '© 1996 Philippine Bible Society' },
  { abbrev: 'ilo1973', source: 'beblia', file: 'Ilokano1973Bible.xml', name: 'Ilokano Ti Biblia (1973)', lang: 'Ilokano', langCode: 'ilo', code: 'ILO73', size: '5.4 MB', copyright: '© 1973 Philippine Bible Society' },
  { abbrev: 'hil1982', source: 'beblia', file: 'IlonggoBible.xml', name: 'Hiligaynon Ang Biblia (1982)', lang: 'Hiligaynon', langCode: 'hil', code: 'HLG', size: '5.5 MB', copyright: '© 1982 Philippine Bible Society' },
  { abbrev: 'hil2012', source: 'beblia', file: 'Ilonggo2012Bible.xml', name: 'Hiligaynon Maayong Balita nga Biblia (2012)', lang: 'Hiligaynon', langCode: 'hil', code: 'MBBHIL', size: '5.5 MB', copyright: '© 2012 Philippine Bible Society' },
  { abbrev: 'hilapd', source: 'beblia', file: 'IlonggoAPDBible.xml', name: 'Hiligaynon Ang Pulong sa Dios (APD)', lang: 'Hiligaynon', langCode: 'hil', code: 'APD', size: '5.5 MB', copyright: '© Biblica, Inc' },
  { abbrev: 'pampanga94', source: 'beblia', file: 'PampangaBible.xml', name: 'Kapampangan Ing Mayap a Balita Biblia (1994)', lang: 'Kapampangan', langCode: 'pam', code: 'PMPV', size: '5.2 MB', copyright: '© Philippine Bible Society' },
  { abbrev: 'waray84', source: 'beblia', file: 'WarayBible.xml', name: 'Waray Baraan nga Biblia (1984)', lang: 'Waray', langCode: 'war', code: 'MBBSAM', size: '5.5 MB', copyright: '© Philippine Bible Society, 1984' }
];

function decodeXmlEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function cleanBibleText(raw) {
  const stripped = String(raw).replace(/<[^>]*>/g, ' ').replace(/\[[a-z]{1,2}\d?\]/g, ' ');
  return decodeXmlEntities(stripped).replace(/\s+/g, ' ').trim();
}

// Convert Beblia's flat XML into the same shape as a getbible translation file.
function parseBebliaXml(xml, meta) {
  const books = [];
  const testamentRe = /<testament\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/testament>/gi;
  let t;
  while ((t = testamentRe.exec(xml))) {
    const bookRe = /<book\s+number="(\d+)"[^>]*>([\s\S]*?)<\/book>/gi;
    let b;
    while ((b = bookRe.exec(t[2]))) {
      const nr = Number(b[1]);
      const name = localizedBookName(meta.langCode, nr);
      const chapters = [];
      const chapterRe = /<chapter\s+number="(\d+)"[^>]*>([\s\S]*?)<\/chapter>/gi;
      let c;
      while ((c = chapterRe.exec(b[2]))) {
        const chapterNr = Number(c[1]);
        const verses = [];
        const verseRe = /<verse\s+number="(\d+)"[^>]*>([\s\S]*?)<\/verse>/gi;
        let v;
        while ((v = verseRe.exec(c[2]))) {
          const text = cleanBibleText(v[2]);
          if (text) verses.push({ chapter: chapterNr, verse: Number(v[1]), name: `${name} ${chapterNr}:${v[1]}`, text });
        }
        chapters.push({ chapter: chapterNr, name: `${name} ${chapterNr}`, verses });
      }
      books.push({ nr, name, chapters });
    }
  }
  books.sort((a, b) => a.nr - b.nr);
  return { translation: meta.name, abbreviation: meta.code, books };
}

let onlineCatalog = null; // full list of all translations available on getbible
let onlineCatalogAt = 0;
const bibleSizeCache = new Map(); // abbrev -> formatted size string

async function bibleFileSize(abbrev) {
  if (bibleSizeCache.has(abbrev)) return bibleSizeCache.get(abbrev);
  try {
    const res = await fetch(`https://api.getbible.net/v2/${abbrev}.json`, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    const bytes = Number(res.headers.get('content-length')) || 0;
    const size = bytes ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : '';
    bibleSizeCache.set(abbrev, size);
    return size;
  } catch (_) { return ''; }
}

// Fetch the complete list of translations available online, cached for 1 hour,
// filtered to English + Philippine versions.
async function getBibleCatalog() {
  if (onlineCatalog && Date.now() - onlineCatalogAt < 3600000) return onlineCatalog;
  try {
    const res = await fetch(BIBLE_CATALOG_URL, { signal: AbortSignal.timeout(30000) });
    if (res.ok) {
      const dict = await res.json();
      const online = Object.keys(dict || {}).map(k => {
        const e = dict[k] || {};
        return {
          abbrev: k,
          source: 'getbible',
          name: e.translation || e.description || k,
          lang: e.language || e.lang || '',
          langCode: e.lang || '',
          code: e.abbreviation || k,
          description: e.description || '',
        };
      }).filter(bibleKeep);
      const seen = new Set(online.map(e => e.abbrev));
      const merged = [...online, ...BEBLIA_CATALOG.filter(b => !seen.has(b.abbrev))]
        .sort((a, b) => a.name.localeCompare(b.name));
      if (merged.length) { onlineCatalog = merged; onlineCatalogAt = Date.now(); }
    }
  } catch (_) {}
  return onlineCatalog || BIBLE_FALLBACK_CATALOG;
}

// Fallback if offline: still list English + Philippine versions we know exist.
const BIBLE_FALLBACK_CATALOG = [
  { abbrev: 'kjv', name: 'King James Version (KJV)', lang: 'English', langCode: 'en', code: 'KJV' },
  { abbrev: 'web', name: 'World English Bible (WEB)', lang: 'English', langCode: 'en', code: 'WEB' },
  { abbrev: 'asv', name: 'American Standard Version (ASV)', lang: 'English', langCode: 'en', code: 'ASV' },
  { abbrev: 'basicenglish', name: 'Basic English Bible (BBE)', lang: 'English', langCode: 'en', code: 'BBE' },
  { abbrev: 'akjv', name: 'American King James Version (AKJV)', lang: 'English', langCode: 'en', code: 'AKJV' },
  { abbrev: 'douayrheims', name: 'Douay-Rheims', lang: 'English', langCode: 'en', code: 'DRA' },
  { abbrev: 'wb', name: "Webster's Bible", lang: 'English', langCode: 'en', code: 'WBT' },
  { abbrev: 'ylt', name: "Young's Literal Translation (YLT)", lang: 'English', langCode: 'en', code: 'YLT' },
  { abbrev: 'tyndale', name: 'William Tyndale Bible', lang: 'English', langCode: 'en', code: 'TYNDALE' },
  { abbrev: 'weymouth', name: 'Weymouth NT', lang: 'English', langCode: 'en', code: 'WEY' },
  { abbrev: 'wycliffe', name: 'Wycliffe Bible', lang: 'English', langCode: 'en', code: 'WYC' },
  { abbrev: 'tagalog', name: 'Ang Dating Biblia (1905)', lang: 'Tagalog', langCode: 'tl', code: 'ADB' },
  ...BEBLIA_CATALOG
];

// Cache parsed translations in memory so chapter lookups are fast after first read
const bibleCache = new Map();
function bibleFilePath(abbrev) { return path.join(BIBLE_DIR, `${abbrev}.json`); }

function loadBibleTranslation(abbrev) {
  if (bibleCache.has(abbrev)) return bibleCache.get(abbrev);
  const file = bibleFilePath(abbrev);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  bibleCache.set(abbrev, data);
  return data;
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function findBibleEntry(abbrev) {
  const catalog = await getBibleCatalog();
  return catalog.find(e => e.abbrev === abbrev) || null;
}

ipcMain.handle('scripture-list-bibles', async () => {
  if (!fs.existsSync(BIBLE_DIR)) fs.mkdirSync(BIBLE_DIR, { recursive: true });
  const catalog = await getBibleCatalog();
  return mapWithConcurrency(catalog, 12, async b => {
    const file = bibleFilePath(b.abbrev);
    const installed = fs.existsSync(file);
    return {
      ...b,
      installed,
      fileSize: installed ? fs.statSync(file).size : 0,
      size: installed
        ? `${(fs.statSync(file).size / (1024 * 1024)).toFixed(1)} MB`
        : b.source === 'beblia' ? (b.size || '') : await bibleFileSize(b.abbrev),
      books: installed ? (() => { try { return loadBibleTranslation(b.abbrev).books.length; } catch (_) { return 0; } })() : 0
    };
  });
});

ipcMain.handle('scripture-download-bible', async (event, abbrev) => {
  if (!/^[a-zA-Z0-9_-]{1,30}$/.test(String(abbrev || ''))) return { error: 'Unknown translation.' };
  if (!fs.existsSync(BIBLE_DIR)) fs.mkdirSync(BIBLE_DIR, { recursive: true });
  const target = bibleFilePath(abbrev) + '.part';
  const entry = await findBibleEntry(abbrev);
  const source = entry && entry.source === 'beblia' ? 'beblia' : 'getbible';
  const url = source === 'beblia' && entry.file
    ? BEBLIA_BASE_URL + entry.file
    : `https://api.getbible.net/v2/${abbrev}.json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!res.ok) return { error: `Download failed (${res.status}).` };
    const total = Number(res.headers.get('content-length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (event.sender && !event.sender.isDestroyed()) {
        event.sender.send('scripture-download-progress', { abbrev, progress: total ? received / total : 0, loaded: received, total });
      }
    }
    let buf;
    if (source === 'beblia') {
      const parsed = parseBebliaXml(Buffer.concat(chunks).toString('utf8'), entry);
      if (!parsed.books.length) return { error: 'Could not read that Bible file.' };
      buf = Buffer.from(JSON.stringify(parsed));
    } else {
      buf = Buffer.concat(chunks);
    }
    fs.writeFileSync(target, buf);
    fs.renameSync(target, bibleFilePath(abbrev));
    bibleCache.delete(abbrev);
    if (event.sender && !event.sender.isDestroyed()) {
      event.sender.send('scripture-download-progress', { abbrev, progress: 1, done: true });
    }
    return { ok: true, size: buf.length };
  } catch (err) {
    if (fs.existsSync(target)) { try { fs.unlinkSync(target); } catch (_) {} }
    return { error: `Download failed: ${err.message}` };
  }
});

ipcMain.handle('scripture-delete-bible', (event, abbrev) => {
  const file = bibleFilePath(abbrev);
  if (fs.existsSync(file)) { try { fs.unlinkSync(file); } catch (_) {} }
  bibleCache.delete(abbrev);
  return { ok: true };
});

// Books list from an installed translation (66 canonical books, OT first 39)
ipcMain.handle('scripture-books', async (event, abbrev) => {
  const bible = loadBibleTranslation(abbrev);
  if (!bible) return { error: 'Translation not installed. Download it first.' };
  const entry = await findBibleEntry(abbrev);
  const lang = entry && entry.source === 'beblia' ? entry.langCode : null;
  const totalChapters = { ot: 0, nt: 0 };
  const books = bible.books.map((b, i) => {
    const isNT = i >= 39;
    const count = b.chapters ? b.chapters.length : 0;
    if (isNT) totalChapters.nt += count; else totalChapters.ot += count;
    return { nr: b.nr, name: lang ? localizedBookName(lang, b.nr) : b.name, abbr: BIBLE_BOOK_ABBREVS[i] || b.name.slice(0, 3), chapters: count, testament: isNT ? 'nt' : 'ot' };
  });
  return { translation: bible.translation, abbreviation: bible.abbreviation, books, totalChapters };
});

// A single chapter from an installed translation
ipcMain.handle('scripture-chapter', async (event, abbrev, bookNr, chapterNr) => {
  const bible = loadBibleTranslation(abbrev);
  if (!bible) return { error: 'Translation not installed. Download it first.' };
  const book = bible.books.find(b => b.nr === Number(bookNr));
  if (!book) return { error: 'Book not found.' };
  const entry = await findBibleEntry(abbrev);
  const lang = entry && entry.source === 'beblia' ? entry.langCode : null;
  const ch = (book.chapters || []).find(c => Number(c.chapter) === Number(chapterNr));
  if (!ch) return { error: 'Chapter not found.' };
  return {
    translation: bible.translation,
    abbreviation: bible.abbreviation,
    bookIndex: book.nr,
    book: lang ? localizedBookName(lang, book.nr) : book.name,
    chapter: Number(ch.chapter),
    verses: (ch.verses || []).map(v => ({ verse: Number(v.verse), text: v.text })),
    prev: chapterNr > 1 ? Number(chapterNr) - 1 : null,
    next: chapterNr < (book.chapters.length) ? Number(chapterNr) + 1 : null,
    totalChapters: book.chapters.length
  };
});

// Keyword search across an installed translation
ipcMain.handle('scripture-search', async (event, abbrev, query, limit = 40) => {
  const bible = loadBibleTranslation(abbrev);
  if (!bible) return { error: 'Translation not installed. Download it first.' };
  const entry = await findBibleEntry(abbrev);
  const lang = entry && entry.source === 'beblia' ? entry.langCode : null;
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { results: [] };
  const results = [];
  for (const book of bible.books) {
    if (results.length >= limit) break;
    const bookName = lang ? localizedBookName(lang, book.nr) : book.name;
    for (const ch of (book.chapters || [])) {
      for (const v of (ch.verses || [])) {
        if ((v.text || '').toLowerCase().includes(q)) {
          results.push({ bookIndex: book.nr, book: bookName, chapter: Number(ch.chapter), verse: Number(v.verse), ref: `${bookName} ${ch.chapter}:${v.verse}`, text: v.text });
          if (results.length >= limit) break;
        }
      }
      if (results.length >= limit) break;
    }
  }
  return { results };
});

// Parse a direct reference like "John 3:16", "Psalm 23" or "1 Peter 1:5"
// against an installed translation. Numbered books (1–3 …) parse correctly;
// anything that is not a reference returns an error so the renderer can
// fall back to the keyword search.
ipcMain.handle('scripture-resolve', async (event, abbrev, reference) => {
  const bible = loadBibleTranslation(abbrev);
  if (!bible) return { error: 'Translation not installed. Download it first.' };
  const entry = await findBibleEntry(abbrev);
  const lang = entry && entry.source === 'beblia' ? entry.langCode : null;
  const nameOf = (b) => (lang ? localizedBookName(lang, b.nr) : b.name);
  const raw = String(reference || '').trim();
  const parsed = parseReference(raw);
  if (!parsed) return { error: 'Enter a reference like John 3:16 or Psalm 23.' };
  const book = bible.books.find(b => matchBook([nameOf(b), b.name, BIBLE_BOOK_NAMES[b.nr - 1]], parsed));
  if (!book) return { error: `Book "${raw}" not found.` };
  return {
    bookIndex: book.nr,
    book: nameOf(book),
    chapter: parsed.chapter || 1,
    verse: parsed.verse || null,
    totalChapters: (book.chapters || []).length
  };
});

ipcMain.handle('app-info', () => ({
  version: app.getVersion(),
  userData: app.getPath('userData'),
  mediaDir: MEDIA_DIR,
  dbPath: path.join(app.getPath('userData'), 'kog-worship.db')
}));

ipcMain.handle('open-data-folder', () => shell.openPath(app.getPath('userData')));

ipcMain.handle('db-export', async () => {
  const data = exportLibrary();
  const { filePath } = await dialog.showSaveDialog({ title: 'Export Song Library', defaultPath: 'kog-library-backup.json', filters: [{ name: 'JSON Files', extensions: ['json'] }] });
  if (filePath) {
    fs.writeFileSync(filePath, data);
    return true;
  }
  return false;
});

ipcMain.handle('db-import', async () => {
  const { filePaths } = await dialog.showOpenDialog({ title: 'Import Song Library', filters: [{ name: 'JSON Files', extensions: ['json'] }], properties: ['openFile'] });
  if (filePaths && filePaths[0]) {
    const data = fs.readFileSync(filePaths[0], 'utf8');
    return importLibrary(data);
  }
  return false;
});