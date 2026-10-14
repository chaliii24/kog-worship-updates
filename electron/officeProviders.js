// Office provider detection + LibreOffice helpers — no native modules.
//
// The Presentation tab used to speak only to Microsoft PowerPoint over COM.
// This module answers "what can actually show slides on THIS machine":
//   - powerpoint: PowerPoint.Application COM is creatable
//   - wps:        WPP.Application (or legacy KWPP.Application) COM is creatable
//   - libreoffice: soffice.exe exists (headless PNG export + --show slideshow)
//
// Detection is cached briefly: every COM probe spawns powershell.exe, so
// hammering it on each render would be felt. All helpers degrade to
// { present: false } instead of ever throwing.
import { execFile, execFileSync, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

// COM ProgIDs, in the order the bridge tries them. WPS Presentation
// intentionally mirrors the PowerPoint object model (Presentations.Open,
// SlideShowSettings.Run, View.Next/Previous/GotoSlide, Slides.Item.Export),
// so one PowerShell script drives both — only the ProgID differs.
export const COM_PROVIDERS = [
  { id: 'powerpoint', progId: 'PowerPoint.Application', label: 'PowerPoint' },
  { id: 'wps', progId: 'WPP.Application', label: 'WPS Presentation' },
  { id: 'wps', progId: 'KWPP.Application', label: 'WPS Presentation' },
];

export const PROVIDER_LABELS = {
  powerpoint: 'PowerPoint',
  wps: 'WPS Presentation',
  libreoffice: 'LibreOffice Impress',
};

// Every format the Presentation tab accepts. ppt/pps are the pre-2007
// binaries (COM or LibreOffice only — never the unzip reader). odp/otp are
// LibreOffice native (PowerPoint/WPS open them with fidelity loss, so COM
// is still tried first). dps is WPS Presentation native.
export const PRESENTATION_EXTENSIONS = [
  'pptx', 'ppt', 'ppsx', 'pps', 'potx', 'pot', 'pptm', 'odp', 'otp', 'dps',
];

export const isPresentationFile = (filePath) =>
  PRESENTATION_EXTENSIONS.includes(
    path.extname(String(filePath || '')).toLowerCase().replace(/^\./, '')
  );

// --- Executable discovery (sync, cheap: PATH lookup + known folders) --------

function whereExe(exe) {
  try {
    const out = execFileSync('where.exe', [exe], {
      timeout: 8000, windowsHide: true,
    }).toString().split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const p of out) {
      try { if (p && fs.statSync(p).isFile()) return p; } catch {}
    }
  } catch {}
  return null;
}

function firstExisting(candidates) {
  for (const p of candidates) {
    try { if (p && fs.statSync(p).isFile()) return p; } catch {}
  }
  return null;
}

// WPS installs versioned side-by-side
// (...\WPS Office\12.8.50.1234\office6\wpp.exe, per-user under
// AppData\Local\Kingsoft), so scan one level deep instead of hardcoding.
function findWppExe() {
  const hit = whereExe('wpp.exe');
  if (hit) return hit;
  const roots = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env.LocalAppData && path.join(process.env.LocalAppData, 'Kingsoft'),
  ].filter(Boolean);
  for (const root of roots) {
    for (const base of ['WPS Office', 'Kingsoft\\WPS Office']) {
      const dir = path.join(root, base);
      let entries = [];
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const e of entries) {
        const cands = [
          path.join(dir, e, 'office6', 'wpp.exe'),
          path.join(dir, e, 'wpp.exe'),
        ];
        const found = firstExisting(cands);
        if (found) return found;
      }
    }
  }
  return null;
}

export function findSofficeExe() {
  const hit = whereExe('soffice.exe');
  if (hit) return hit;
  return firstExisting([
    process.env['ProgramFiles'] && path.join(process.env['ProgramFiles'], 'LibreOffice', 'program', 'soffice.exe'),
    process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'LibreOffice', 'program', 'soffice.exe'),
  ].filter(Boolean));
}

export function findWppExePublic() {
  return findWppExe();
}

// --- COM probing (async: one powershell per ProgID, cached 60s) -------------

let comCache = { at: 0, result: null };
const COM_CACHE_MS = 60000;

function probeProgId(progId) {
  return new Promise((resolve) => {
    const script = `try { $o = New-Object -ComObject ${progId}; try { $o.Quit() } catch {}; Write-Output 'OK' } catch { Write-Output 'FAIL' }`;
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 20000, windowsHide: true, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) return resolve(false);
        resolve(String(stdout || '').trim().toUpperCase().startsWith('OK'));
      });
  });
}

export async function detectComProviders() {
  const now = Date.now();
  if (comCache.result && now - comCache.at < COM_CACHE_MS) return comCache.result;
  const seen = new Set();
  const out = [];
  for (const p of COM_PROVIDERS) {
    if (seen.has(p.progId)) continue;
    seen.add(p.progId);
    let ok = false;
    try { ok = await probeProgId(p.progId); } catch { ok = false; }
    if (ok && !out.some((q) => q.id === p.id)) out.push({ id: p.id, progId: p.progId, label: p.label });
  }
  comCache = { at: now, result: out };
  return out;
}

// Full picture for the UI badge + the load fallback chain.
export async function detectOfficeProviders() {
  let com = [];
  try { com = await detectComProviders(); } catch { com = []; }
  const sofficePath = findSofficeExe();
  const wppPath = findWppExe();
  return {
    powerpoint: com.some((c) => c.id === 'powerpoint'),
    wps: com.some((c) => c.id === 'wps') || !!wppPath,
    libreoffice: !!sofficePath,
    sofficePath: sofficePath || null,
    wppPath: wppPath || null,
    com,
  };
}

// --- Slide counting without any Office (bounds for nav + goto) --------------
//
// pptx-family files are zips: ppt/slides/slideN.xml. odp-family files are
// zips too: content.xml carries one <draw:page> per slide. Binary
// ppt/pps/dps cannot be counted this way (null = unknown, caller falls
// back to the engine's own count).
export async function countSlidesInFile(filePath) {
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const tmpDir = path.join(os.tmpdir(), `kog-count-${Date.now().toString(36)}`);
  try {
    if (['.pptx', '.pptm', '.ppsx', '.potx', '.potm'].includes(ext)) {
      const names = await listZipEntries(filePath, tmpDir);
      const slides = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n));
      return slides.length || null;
    }
    if (['.odp', '.otp'].includes(ext)) {
      const xml = await readZipEntry(filePath, tmpDir, 'content.xml');
      if (xml == null) return null;
      const pages = xml.match(/<draw:page[\s>]/g);
      return (pages && pages.length) || null;
    }
  } catch {}
  finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
  return null;
}

function psQuote(p) {
  return "'" + String(p).replace(/'/g, "''") + "'";
}

function runPs(script, timeoutMs = 30000) {
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

async function listZipEntries(filePath, tmpDir) {
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$z = [System.IO.Compression.ZipFile]::OpenRead(${psQuote(filePath)})`,
    'try { $z.Entries.FullName } finally { $z.Dispose() }',
  ].join('\n');
  const r = await runPs(script);
  if (!r.ok) return [];
  return r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

async function readZipEntry(filePath, tmpDir, entryName) {
  fs.mkdirSync(tmpDir, { recursive: true });
  const dest = path.join(tmpDir, 'entry.xml');
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `$z = [System.IO.Compression.ZipFile]::OpenRead(${psQuote(filePath)})`,
    `try { $e = $z.Entries | Where-Object { $_.FullName -eq ${psQuote(entryName)} } | Select-Object -First 1`,
    `  if ($e -ne $null) { [System.IO.Compression.ZipFileExtensions]::ExtractToFile($e, ${psQuote(dest)}, $true); Write-Output 'ok' } } finally { $z.Dispose() }`,
  ].join('\n');
  const r = await runPs(script);
  if (!r.ok || !r.stdout.includes('ok')) return null;
  try { return fs.readFileSync(dest, 'utf8'); } catch { return null; }
}

// --- LibreOffice headless PNG export (thumbnails + image import) -------------
//
// `soffice --headless --convert-to png` renders every Impress slide to its
// own PNG in outDir (any format Impress opens: pptx, ppt, odp, dps...).
// Returns { ok, files: [abs paths, natural slide order] } — never throws.
export function libreExportPngs(sofficePath, filePath, outDir, timeoutMs = 120000) {
  try {
    fs.mkdirSync(outDir, { recursive: true });
    const r = spawnSync(sofficePath, [
      '--headless', '--nologo', '--norestore',
      '--convert-to', 'png:impress_png_Export',
      '--outdir', outDir,
      filePath,
    ], { timeout: timeoutMs, windowsHide: true });
    if (r.error) return { ok: false, error: String(r.error.message || r.error) };
    if (r.status !== 0 && !hasPngs(outDir)) {
      const tail = String(r.stderr || r.stdout || '').toString().trim().slice(-300);
      return { ok: false, error: tail || `LibreOffice exited with code ${r.status}.` };
    }
    const files = listPngs(outDir);
    if (!files.length) return { ok: false, error: 'LibreOffice exported no slides from that file.' };
    return { ok: true, files };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function hasPngs(dir) {
  try { return fs.readdirSync(dir).some((f) => /\.png$/i.test(f)); } catch { return false; }
}

// Natural order: slide2 before slide10 (plain sort would reorder them).
export function listPngs(dir) {
  let names = [];
  try { names = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f)); } catch { return []; }
  const key = (n) => String(n).split(/(\d+)/).map((p) => (/\d+/.test(p) ? String(parseInt(p, 10)).padStart(10, '0') : p.toLowerCase())).join('');
  names.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  return names.map((n) => path.join(dir, n));
}
