// LibreOffice Impress sermon bridge — NO native modules.
//
// Used when no COM slideshow app exists (no Microsoft PowerPoint, no WPS
// Presentation) but LibreOffice is installed. Two halves:
//
//   1. Thumbnails: `soffice --headless --convert-to png` renders every slide
//      once at load into a per-session folder. The filmstrip + current/next
//      previews read from there — no per-slide round-trip, no hang risk.
//   2. Live show: `soffice --impress --show <file>` runs the real slideshow
//      (animations + transitions preserved) behind our output window, moved
//      onto the projector with Win32 SetWindowPos by PID window lookup.
//      Navigation goes through WScript.Shell SendKeys: Right/Left for
//      step, <n>Enter for jump (Impress jumps to slide number + Enter),
//      Home/End implicitly via goto, Esc to end.
//
// State shape mirrors pptBridge.js ({ ok, index, totalSlides, running,
// provider: 'libreoffice' }) so main.js routes without the renderer caring
// which engine is live.
import { spawn, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { countSlidesInFile, findSofficeExe, libreExportPngs, listPngs } from './officeProviders.js';

let proc = null;
let pid = 0;
let file = null;
let index = 0;
let total = 0;
let shotsDir = null;
let pngs = [];
let sofficePath = null;

const psQuote = (p) => "'" + String(p).replace(/'/g, "''") + "'";

function runPs(script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
}

export function libreAvailable() {
  if (sofficePath) return sofficePath;
  sofficePath = findSofficeExe();
  return sofficePath;
}

// Move the slideshow window (found by owning PID) onto the projector.
// Best-effort: polls 6s for the window to exist; a miss still leaves a
// working slideshow on the primary display instead of failing the load.
async function placeOnProjector(targetPid, bounds) {
  const script = [
    'Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class KogWin32 {',
    '  [DllImport("user32.dll", SetLastError=true)]',
    '  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
    '}',
    '"@',
    `$proc = Get-Process -Id ${targetPid} -ErrorAction SilentlyContinue`,
    'if ($proc -eq $null) { exit 0 }',
    '$hwnd = [IntPtr]::Zero',
    'for ($i = 0; $i -lt 60; $i++) {',
    '  try { $proc.Refresh() } catch {}',
    '  try { $hwnd = $proc.MainWindowHandle } catch {}',
    `  if ($hwnd -ne $null -and $hwnd -ne [IntPtr]::Zero) { break }`,
    '  Start-Sleep -Milliseconds 100',
    '}',
    `if ($hwnd -ne $null -and $hwnd -ne [IntPtr]::Zero) {`,
    `  [void][KogWin32]::SetWindowPos($hwnd, [IntPtr]::Zero, ${Math.round(bounds?.x || 0)}, ${Math.round(bounds?.y || 0)}, ${Math.max(320, Math.round(bounds?.w || 1920))}, ${Math.max(200, Math.round(bounds?.h || 1080))}, 0x0040)`,
    '}',
  ].join('\r\n');
  try { await runPs(script, 12000); } catch {}
}

// Send keystrokes to the slideshow without permanently stealing focus:
// activate it, send, then hand focus back to the operator console by title.
async function sendKeys(keys) {
  const script = [
    `$wshell = New-Object -ComObject WScript.Shell`,
    `try { $wshell.AppActivate(${pid}) } catch {}`,
    'Start-Sleep -Milliseconds 150',
    `$wshell.SendKeys(${psQuote(keys)})`,
    'Start-Sleep -Milliseconds 150',
    `try { $wshell.AppActivate('KOG Worship - Matrix Command') } catch {}`,
  ].join('\r\n');
  const r = await runPs(script, 10000);
  return r.ok;
}

const alive = () => !!(proc && !proc.killed && proc.exitCode === null);

export async function libreOpen(openFile, bounds) {
  if (!openFile) return { ok: false, error: 'No file selected.' };
  const so = libreAvailable();
  if (!so) {
    return {
      ok: false,
      error: 'LibreOffice Impress was not found on this computer. Install it free from libreoffice.org, or use Microsoft PowerPoint / WPS Presentation.',
    };
  }
  await libreClose();
  // 1. Slide count (bounds for nav/goto when the format is countable).
  let counted = null;
  try { counted = await countSlidesInFile(openFile); } catch { counted = null; }
  // 2. Pre-render every slide to PNG for the filmstrip.
  shotsDir = path.join(os.tmpdir(), `kog-libre-shots-${Date.now().toString(36)}`);
  const exp = libreExportPngs(so, openFile, shotsDir);
  if (!exp.ok) {
    try { fs.rmSync(shotsDir, { recursive: true, force: true }); } catch {}
    shotsDir = null;
    return { ok: false, error: 'LibreOffice could not read that file. ' + String(exp.error || '').slice(0, 220) };
  }
  pngs = exp.files || listPngs(shotsDir);
  total = pngs.length || counted || 0;
  if (!total) {
    try { fs.rmSync(shotsDir, { recursive: true, force: true }); } catch {}
    shotsDir = null; pngs = [];
    return { ok: false, error: 'LibreOffice exported no slides from that file.' };
  }
  // 3. Start the real slideshow behind our output window.
  try {
    proc = spawn(so, ['--impress', '--nologo', '--norestore', '--show', openFile], {
      detached: false, windowsHide: false, stdio: 'ignore',
    });
    pid = (proc && proc.pid) || 0;
    proc.on('exit', () => { proc = null; pid = 0; });
    proc.on('error', () => { proc = null; pid = 0; });
  } catch (e) {
    proc = null; pid = 0;
    return { ok: false, error: 'LibreOffice failed to start the slideshow: ' + String((e && e.message) || e) };
  }
  file = String(openFile);
  index = 1;
  if (pid) await placeOnProjector(pid, bounds);
  return { ok: true, index, totalSlides: total, running: true, provider: 'libreoffice' };
}

export async function libreNext() {
  if (!alive()) return { ok: false, error: 'No slideshow running.' };
  const ok = await sendKeys('{RIGHT}');
  if (!ok) return { ok: false, error: 'Could not advance the slideshow.' };
  if (total) index = Math.min(total, index + 1);
  else index += 1;
  return { ok: true, index, totalSlides: total, running: true, provider: 'libreoffice' };
}

export async function librePrev() {
  if (!alive()) return { ok: false, error: 'No slideshow running.' };
  const ok = await sendKeys('{LEFT}');
  if (!ok) return { ok: false, error: 'Could not rewind the slideshow.' };
  index = Math.max(1, index - 1);
  return { ok: true, index, totalSlides: total, running: true, provider: 'libreoffice' };
}

export async function libreGoto(n) {
  if (!alive()) return { ok: false, error: 'No slideshow running.' };
  const target = Math.max(1, Math.round(Number(n) || 1));
  // Impress jumps to "<number> + Enter" from anywhere in the show.
  const ok = await sendKeys(`${total ? Math.min(total, target) : target}{ENTER}`);
  if (!ok) return { ok: false, error: 'Could not jump the slideshow.' };
  index = total ? Math.min(total, target) : target;
  return { ok: true, index, totalSlides: total, running: true, provider: 'libreoffice' };
}

// Pre-rendered PNG path for one slide (null when the export missed it).
export function libreShotFile(n) {
  const i = Math.max(1, Math.round(Number(n) || 1));
  if (!pngs.length) return null;
  const clamped = total ? Math.min(total, i) : i;
  return pngs[clamped - 1] || null;
}

export async function libreState() {
  if (!alive() || !file) return { ok: true, running: false, index: 0, totalSlides: 0, provider: 'libreoffice' };
  return { ok: true, running: true, index, totalSlides: total, provider: 'libreoffice' };
}

export async function libreClose() {
  // Esc ends --show cleanly (it quits after the show); kill is the backstop.
  if (pid) {
    try {
      await runPs(
        `$wshell = New-Object -ComObject WScript.Shell; try { $wshell.AppActivate(${pid}) } catch {}; Start-Sleep -Milliseconds 100; $wshell.SendKeys('{ESC}')`,
        6000);
    } catch {}
  }
  const p = proc;
  proc = null; pid = 0; file = null; index = 0; total = 0;
  if (p && !p.killed) {
    try { p.kill(); } catch {}
    await new Promise((r) => setTimeout(r, 400));
    try { p.kill('SIGKILL'); } catch {}
  }
  if (shotsDir) {
    const dir = shotsDir;
    shotsDir = null; pngs = [];
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  return { ok: true, provider: 'libreoffice' };
}

export function libreQuit() {
  try { if (proc && !proc.killed) proc.kill(); } catch {}
  proc = null; pid = 0; file = null; index = 0; total = 0;
  if (shotsDir) {
    try { fs.rmSync(shotsDir, { recursive: true, force: true }); } catch {}
    shotsDir = null; pngs = [];
  }
}
