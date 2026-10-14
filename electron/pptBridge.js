// PowerPoint / WPS sermon bridge — NO native modules.
//
// Drives an installed Microsoft PowerPoint OR WPS Presentation over COM from
// a stock powershell.exe child (Windows PowerShell 5.1 is STA, which COM
// needs), so this ships through CI untouched: no winax, no rebuild, no new
// dependency. WPS Presentation mirrors the PowerPoint object model
// (Presentations.Open, SlideShowSettings.Run, View.Next/Previous/GotoSlide,
// Slide.Export), so one script drives both — only the ProgID differs, tried
// in order: PowerPoint.Application, WPP.Application, KWPP.Application.
// Protocol is JSON lines over stdin/stdout, one in-flight command at a time.
//
// LibreOffice Impress has no compatible COM model, so it is NOT driven here
// — see libreBridge.js (headless PNG export + --show slideshow) instead.
//
// The slideshow window is positioned onto the projector with Win32
// SetWindowPos against SlideShowWindow.HWND (no title guessing). Speaker
// show type is kept (Esc still works) so a dead bridge can never trap the
// projector in an unclosable fullscreen. Every COM call is wrapped —
// Office closed by hand, missing install, bad file — and surfaces as
// { ok:false, error } instead of ever crashing the main process.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

const OP_TIMEOUT_MS = 20000;

const PS_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'Add-Type -TypeDefinition @"',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class KogWin32 {',
  '  [DllImport("user32.dll", SetLastError=true)]',
  '  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);',
  '}',
  '"@',
  '$pp = $null; $pres = $null; $show = $null; $prov = $null',
  // ProgIDs in preference order. A failed create is normal (app not
  // installed) — only a mesh of ALL failing means "no COM office".
  '$COM_IDS = @(',
  "  @{ id='powerpoint'; prog='PowerPoint.Application' },",
  "  @{ id='wps'; prog='WPP.Application' },",
  "  @{ id='wps'; prog='KWPP.Application' }",
  ')',
  'function EnsureApp() {',
  // NOTE: $script: scope is mandatory here — a bare $pp inside a function is
  // function-local, so the created app object would never reach the switch.
  '  if ($script:pp -ne $null) { return $true }',
  '  foreach ($c in $COM_IDS) {',
  '    try { $script:pp = New-Object -ComObject $c.prog; $script:prov = $c.id; return $true } catch {}',
  '  }',
  '  $script:pp = $null; $script:prov = $null; return $false',
  '}',
  'function Resp($id, $ok, $data) {',
  '  $o = @{ id = $id; ok = $ok }',
  '  if ($data -ne $null) { foreach ($k in $data.Keys) { $o[$k] = $data[$k] } }',
  '  Write-Output ($o | ConvertTo-Json -Compress)',
  '}',
  'function CurIndex() { try { return [int]$show.View.Slide.SlideIndex } catch { return 0 } }',
  'function ClosePres() {',
  '  try { if ($show -ne $null) { $show.View.Exit() } } catch {}',
  '  $script:show = $null',
  '  try { if ($pres -ne $null) { $pres.Close() } } catch {}',
  '  $script:pres = $null',
  '}',
  'while ($true) {',
  '  $line = [Console]::In.ReadLine()',
  '  if ($null -eq $line) { break }',
  '  if ($line.Trim() -eq "") { continue }',
  '  try { $msg = $line | ConvertFrom-Json } catch { continue }',
  '  $id = $msg.id',
  '  try {',
  '    switch ($msg.op) {',
  "      'open' {",
  '        ClosePres',
  // Creation failure across EVERY ProgID is distinct from "picked a bad
  // file": main.js uses noComApp to fall through to LibreOffice instead of
  // showing a PowerPoint-branded error.
  '        if (-not (EnsureApp)) { Resp $id $false @{ error = "No slideshow app found (tried Microsoft PowerPoint and WPS Presentation)."; noComApp = $true }; continue }',
  '        try { $pp.Visible = -1 } catch {}',
  '        try { $pres = $pp.Presentations.Open($msg.file, $true, $false, $true) } catch { Resp $id $false @{ error = ("Cannot open presentation: " + $_.Exception.Message); provider = $prov }; continue }',
  '        $total = 0',
  '        try { $total = [int]$pres.Slides.Count } catch {}',
  '        try { $show = $pres.SlideShowSettings.Run() } catch { Resp $id $false @{ error = ("Slideshow failed to start: " + $_.Exception.Message); provider = $prov }; ClosePres; continue }',
  '        Start-Sleep -Milliseconds 700',
  '        try {',
  '          $hwnd = [IntPtr][int]$show.HWND',
  '          [void][KogWin32]::SetWindowPos($hwnd, [IntPtr]::Zero, [int]$msg.x, [int]$msg.y, [int]$msg.w, [int]$msg.h, 0x0040)',
  '        } catch {}',
  '        Resp $id $true @{ totalSlides = $total; index = (CurIndex); provider = $prov }',
  '      }',
  "      'next' {",
  '        if ($show -eq $null) { Resp $id $false @{ error = "No slideshow running." }; continue }',
  '        try { $show.View.Next() } catch { Resp $id $false @{ error = $_.Exception.Message }; continue }',
  '        Resp $id $true @{ index = (CurIndex); provider = $prov }',
  '      }',
  "      'prev' {",
  '        if ($show -eq $null) { Resp $id $false @{ error = "No slideshow running." }; continue }',
  '        try { $show.View.Previous() } catch { Resp $id $false @{ error = $_.Exception.Message }; continue }',
  '        Resp $id $true @{ index = (CurIndex); provider = $prov }',
  '      }',
  "      'goto' {",
  '        if ($show -eq $null) { Resp $id $false @{ error = "No slideshow running." }; continue }',
  '        try { $show.View.GotoSlide([int]$msg.index, 0) } catch { Resp $id $false @{ error = $_.Exception.Message }; continue }',
  '        Resp $id $true @{ index = (CurIndex); provider = $prov }',
  '      }',
  "      'shot' {",
  '        if ($pres -eq $null) { Resp $id $false @{ error = "No presentation open." }; continue }',
  '        try {',
  '          $shotTotal = 0; try { $shotTotal = [int]$pres.Slides.Count } catch {}',
  '          $shotIdx = [int]$msg.index',
  '          if ($shotIdx -lt 1) { $shotIdx = 1 }',
  '          if ($shotTotal -gt 0 -and $shotIdx -gt $shotTotal) { $shotIdx = $shotTotal }',
  '          $shotW = [int]$msg.w; if ($shotW -lt 160) { $shotW = 640 }',
  '          $shotH = [int]$msg.h; if ($shotH -lt 90) { $shotH = 360 }',
  '          try {',
  '            $pw = [double]$pres.PageSetup.SlideWidth',
  '            $ph = [double]$pres.PageSetup.SlideHeight',
  '            if ($pw -gt 0 -and $ph -gt 0) { $shotH = [int][Math]::Round($shotW * $ph / $pw) }',
  '          } catch {}',
  '          $pres.Slides.Item($shotIdx).Export($msg.file, "PNG", $shotW, $shotH)',
  '          Resp $id $true @{ index = $shotIdx; totalSlides = $shotTotal; file = $msg.file }',
  '        } catch { Resp $id $false @{ error = $_.Exception.Message }; continue }',
  '      }',
  "      'state' {",
  '        if ($show -eq $null -or $pres -eq $null) { Resp $id $true @{ running = $false; index = 0; totalSlides = 0 }; continue }',
  '        $t = 0; try { $t = [int]$pres.Slides.Count } catch {}',
  '        Resp $id $true @{ running = $true; index = (CurIndex); totalSlides = $t; provider = $prov }',
  '      }',
  "      'close' {",
  '        ClosePres',
  '        try { if ($pp -ne $null) { $pp.Quit(); $pp = $null } } catch {}',
  '        Resp $id $true @{}',
  '      }',
  "      'quit' {",
  '        ClosePres',
  '        try { if ($pp -ne $null) { $pp.Quit(); $pp = $null } } catch {}',
  '        Resp $id $true @{}',
  '        break',
  '      }',
  '      default { Resp $id $false @{ error = ("unknown op: " + $msg.op) } }',
  '    }',
  '  } catch { Resp $id $false @{ error = $_.Exception.Message } }',
  '}',
].join('\r\n');

let child = null;
let scriptFile = null;
let seq = 0;
const pending = new Map();
let tail = Promise.resolve();

function ensureChild() {
  if (child && !child.killed && child.exitCode === null) return child;
  scriptFile = path.join(os.tmpdir(), `kog-ppt-${process.pid}.ps1`);
  fs.writeFileSync(scriptFile, PS_SCRIPT, 'utf8');
  child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptFile], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'ignore'],
  });
  const rl = readline.createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    let msg = null;
    try { msg = JSON.parse(line); } catch { return; }
    if (!msg || msg.id == null) return;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    clearTimeout(p.timer);
    p.resolve(msg);
  });
  const dead = () => {
    for (const [, p] of pending) { clearTimeout(p.timer); try { p.reject(new Error('PowerPoint bridge exited')); } catch {} }
    pending.clear();
    try { rl.close(); } catch {}
    if (scriptFile) { try { fs.unlinkSync(scriptFile); } catch {} scriptFile = null; }
    child = null;
  };
  child.on('exit', dead);
  child.on('error', dead);
  return child;
}

function call(op, args = {}, timeoutMs = OP_TIMEOUT_MS) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    tail = tail.then(() => new Promise((innerResolve) => {
      let proc;
      try {
        proc = ensureChild();
      } catch (e) {
        reject(new Error('Could not start PowerPoint bridge: ' + (e && e.message)));
        innerResolve();
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('PowerPoint timed out.'));
        innerResolve();
      }, timeoutMs);
      pending.set(id, {
        resolve: (m) => { clearTimeout(timer); resolve(m); innerResolve(); },
        reject: (e) => { clearTimeout(timer); reject(e); innerResolve(); },
        timer,
      });
      try {
        proc.stdin.write(JSON.stringify({ id, op, ...args }) + '\n');
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(new Error('PowerPoint bridge is not responding.'));
        innerResolve();
      }
    })).catch(() => {});
  });
}

const shape = (r) => {
  if (!r || !r.ok) {
    return {
      ok: false,
      error: (r && r.error) || 'Slideshow command failed.',
      // True only when NO COM office exists at all (every ProgID failed to
      // create) — main.js falls through to the LibreOffice engine on this.
      noComApp: !!(r && r.noComApp),
      provider: (r && r.provider) || null,
    };
  }
  return {
    ok: true,
    index: r.index ?? 0,
    totalSlides: r.totalSlides ?? 0,
    running: r.running ?? true,
    provider: r.provider === 'wps' ? 'wps' : r.provider === 'libreoffice' ? 'libreoffice' : 'powerpoint',
  };
};

export async function pptOpen(file, bounds) {
  if (!file) return { ok: false, error: 'No file selected.' };
  try {
    const r = await call('open', {
      file: String(file),
      x: Math.round(bounds?.x || 0),
      y: Math.round(bounds?.y || 0),
      w: Math.max(320, Math.round(bounds?.w || 1920)),
      h: Math.max(200, Math.round(bounds?.h || 1080)),
    });
    return shape(r);
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

export async function pptNext() {
  try { return shape(await call('next')); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

export async function pptPrev() {
  try { return shape(await call('prev')); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

export async function pptGoto(index) {
  try { return shape(await call('goto', { index: Math.max(1, Math.round(Number(index) || 1)) })); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

// Export one slide as a PNG thumbnail for the operator preview (current +
// next). Numbering matches GotoSlide (slide position). Returns the temp file
// path; the caller reads and deletes it. Short timeout so a hung export can
// never wedge the nav queue behind it for the full 20s.
export async function pptShot(index, file, w = 640, h = 360) {
  try {
    const r = await call('shot', {
      index: Math.max(1, Math.round(Number(index) || 1)),
      file: String(file),
      w: Math.max(160, Math.round(Number(w) || 640)),
      h: Math.max(90, Math.round(Number(h) || 360)),
    }, 8000);
    if (!r || !r.ok) return { ok: false, error: (r && r.error) || 'Slide export failed.' };
    return { ok: true, index: r.index ?? index, totalSlides: r.totalSlides ?? 0, file: r.file || file };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

export async function pptState() {
  try { return shape(await call('state')); }
  catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
}

async function pptSendClose() {
  try { await call('close'); } catch {}
}

export async function pptClose() {
  await pptSendClose();
  return { ok: true };
}

export function pptQuit() {
  try {
    if (child && !child.killed) {
      try { child.stdin.write(JSON.stringify({ id: ++seq, op: 'quit' }) + '\n'); } catch {}
      setTimeout(() => { try { child && child.kill(); } catch {} }, 1500).unref?.();
    }
  } catch {}
  for (const [, p] of pending) { try { p.reject(new Error('PowerPoint bridge shutting down')); } catch {} }
  pending.clear();
}
