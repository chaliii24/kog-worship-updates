// Reading a presentation back in.
//
// Two modes, because "look exactly like the original" and "keep it editable"
// are opposite goals. Image mode asks an installed office suite to export
// every slide as a PNG: pixel-perfect, but it needs PowerPoint, WPS
// Presentation or LibreOffice installed. Text mode unzips the file and
// rebuilds the words: always available for .pptx/.odp, not pixel-perfect.
// Requesting images with no office suite falls back to text and says so.
//
// Deliberately separate from main.js: the parsing is regex-level, so it
// gets exercised against real files on its own instead of only in the app.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { findSofficeExe, libreExportPngs } from './officeProviders.js';

export const psQuote = (p) => "'" + String(p).replace(/'/g, "''") + "'";

export const runPowerShell = (script, timeoutMs = 60000) => new Promise((resolve) => {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    (err, stdout, stderr) => resolve({ ok: !err, err, stdout: String(stdout || ''), stderr: String(stderr || '') })
  );
});

// Exit code 3 means that COM ProgID could not be created: not installed.
// Tries each ProgID in order (PowerPoint, then WPS Presentation aliases);
// the first missing one moves on, the first real failure reports it.
export const pptxExportImages = async (filePath, tmpDir, progIds = ['PowerPoint.Application']) => {
  fs.mkdirSync(tmpDir, { recursive: true });
  let lastError = null;
  for (const progId of progIds) {
    const script = [
      '$ErrorActionPreference = "Stop"',
      `try { $ppt = New-Object -ComObject ${progId} } catch { exit 3 }`,
      `try { $pres = $ppt.Presentations.Open(${psQuote(filePath)}, $true, $false, $false) } catch { try { $ppt.Quit() } catch {}; exit 4 }`,
      'try {',
      '  $n = $pres.Slides.Count',
      '  for ($i = 1; $i -le $n; $i++) {',
      `    $out = Join-Path ${psQuote(tmpDir)} ("{0:D3}.png" -f $i)`,
      '    $pres.Slides.Item($i).Export($out, "PNG", 1600, 900)',
      '  }',
      '  Write-Output $n',
      '} finally {',
      '  try { $pres.Close() } catch {}',
      '  try { $ppt.Quit() } catch {}',
      '}',
    ].join('\n');
    const r = await runPowerShell(script, 120000);
    if (!r.ok) {
      // exit 3 = this suite is not installed: try the next one. exit 4 =
      // Presentations.Open failed (bad/corrupt file): every suite would say
      // the same, so stop instead of slow-rolling through the rest.
      if (r.err && r.err.code === 3) continue;
      lastError = r.err && r.err.killed
        ? 'The slideshow app took too long to respond.'
        : (r.stderr || 'The slideshow app could not open that file.').trim().slice(0, 300);
      return { error: lastError };
    }
    const files = fs.readdirSync(tmpDir).filter(f => /\.png$/i.test(f)).sort();
    if (!files.length) { lastError = 'The slideshow app exported no slides from that file.'; continue; }
    return { files };
  }
  if (lastError) return { error: lastError };
  return { missing: true };
};

// LibreOffice headless export for image import: opens anything Impress
// opens (pptx, ppt, odp, dps...) with no COM and no window. Runs in main.js
// AFTER the COM chain so pixel-fidelity stays PowerPoint-first.
export const libreImportImages = (filePath, tmpDir) => {
  const so = findSofficeExe();
  if (!so) return { missing: true };
  const r = libreExportPngs(so, filePath, tmpDir);
  if (!r.ok) return { error: r.error };
  return { files: r.files.map(f => path.basename(f)), dir: tmpDir, absolute: true, provider: 'libreoffice' };
};

const decodeXmlText = (s) => String(s)
  .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (_) { return ''; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (_) { return ''; } })
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// Every text-bearing shape on a slide (tables live in graphicFrame, not sp).
const pptxShapeBlocks = (xml) => {
  const out = [];
  const re = /<p:(sp|graphicFrame)\b[\s\S]*?<\/p:\1>/g;
  let m;
  while ((m = re.exec(xml))) out.push(m[0]);
  return out;
};

// One string per <a:p>. A line break inside a paragraph stays in the same
// bullet — bullets in PowerPoint follow paragraphs, not wrapped lines.
const pptxParagraphs = (block) => {
  const out = [];
  const paraRe = /<a:p[\s>]([\s\S]*?)<\/a:p>/g;
  let p;
  while ((p = paraRe.exec(block))) {
    const inner = p[1] || '';
    let txt = '';
    const runRe = /<a:t>([\s\S]*?)<\/a:t>|<a:br\b[^>]*\/?>/g;
    let r;
    while ((r = runRe.exec(inner))) {
      txt += r[0].indexOf('<a:t') === 0 ? decodeXmlText(r[1] || '') : ' ';
    }
    const trimmed = txt.replace(/\s+/g, ' ').trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
};

const pptxShapeInfo = (block) => {
  const isTitle = /<p:ph\b[^>]*\btype="(title|ctrTitle)"/i.test(block);
  const xM = /<a:off\b[^>]*\bx="(-?\d+)"/.exec(block);
  const yM = /<a:off\b[^>]*\by="(-?\d+)"/.exec(block);
  let sz = 0;
  const szRe = /\bsz="(\d+)"/g;
  let s;
  while ((s = szRe.exec(block))) sz = Math.max(sz, parseInt(s[1], 10) || 0);
  return { isTitle, x: xM ? parseInt(xM[1], 10) : 0, y: yM ? parseInt(yM[1], 10) : 0, sz };
};

// Unzip + parse. Returns { ok, mode: 'text', slides: [{ title, bullets }] }.
// Handles the OOXML family (pptx/pptm/ppsx/potx...) via ppt/slides/*.xml
// and the OpenDocument family (odp/otp) via content.xml <draw:page>.
export const pptxReadText = async (filePath, tmpDir) => {
  // The pre-2007 binary formats are not zip archives, so there is nothing to
  // unzip — only an installed suite (COM image mode, or LibreOffice) can
  // open them.
  if (/\.(ppt|pps|dps)$/i.test(filePath) && !/\.(pptx|pptm|ppsx|potx|potm)$/i.test(filePath)) {
    return { ok: false, error: 'This is the old binary format, which cannot be read without an installed slideshow app.\n\nPick "As images" if PowerPoint, WPS Presentation or LibreOffice is installed on this computer.\n\nOtherwise convert it to .pptx first (in PowerPoint, WPS, or the free LibreOffice) and import that instead.' };
  }
  if (/\.(odp|otp)$/i.test(filePath)) return odpReadText(filePath, tmpDir);
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `if (Test-Path -LiteralPath ${psQuote(tmpDir)}) { Remove-Item -LiteralPath ${psQuote(tmpDir)} -Recurse -Force }`,
    `New-Item -ItemType Directory -Force -Path ${psQuote(tmpDir)} | Out-Null`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(filePath)}, ${psQuote(tmpDir)})`,
    'Write-Output "ok"',
  ].join('\n');
  const r = await runPowerShell(script, 60000);
  if (!r.ok) return { ok: false, error: 'Could not read that file as a PowerPoint (.pptx). ' + (r.stderr || '').trim().slice(0, 200) };

  const slidesDir = path.join(tmpDir, 'ppt', 'slides');
  if (!fs.existsSync(slidesDir)) return { ok: false, error: 'That file has no slides.' };
  // slide2.xml must come before slide10.xml — a plain sort would reorder them.
  const names = fs.readdirSync(slidesDir).filter(f => /^slide\d+\.xml$/i.test(f))
    .sort((a, b) => (parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10)));

  const slides = [];
  for (const name of names) {
    const xml = fs.readFileSync(path.join(slidesDir, name), 'utf8');
    const shapes = pptxShapeBlocks(xml)
      .map(block => ({ ...pptxShapeInfo(block), paras: pptxParagraphs(block) }))
      .filter(s => s.paras.length);
    if (!shapes.length) { slides.push({ title: '', bullets: [] }); continue; }
    // Title = the placeholder marked as one, else the biggest/topmost text.
    let titleShape = shapes.find(s => s.isTitle);
    if (!titleShape) titleShape = [...shapes].sort((a, b) => (b.sz - a.sz) || (a.y - b.y))[0];
    const rest = shapes.filter(s => s !== titleShape).sort((a, b) => (a.y - b.y) || (a.x - b.x));
    const bullets = [];
    rest.forEach(s => s.paras.forEach(p => bullets.push(p)));
    // Anything after the first line of the title block is content, not heading.
    titleShape.paras.slice(1).forEach(p => bullets.push(p));
    slides.push({ title: titleShape.paras[0] || '', bullets });
  }
  return { ok: true, mode: 'text', slides };
};

// OpenDocument text import (odp/otp): one <draw:page> per slide, text in
// <text:p> runs (nested <text:span>/<text:line-break> flattened). First
// paragraph = title, the rest = bullets — same contract as the OOXML path.
export const odpReadText = async (filePath, tmpDir) => {
  const script = [
    'Add-Type -AssemblyName System.IO.Compression.FileSystem',
    `if (Test-Path -LiteralPath ${psQuote(tmpDir)}) { Remove-Item -LiteralPath ${psQuote(tmpDir)} -Recurse -Force }`,
    `New-Item -ItemType Directory -Force -Path ${psQuote(tmpDir)} | Out-Null`,
    `[System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(filePath)}, ${psQuote(tmpDir)})`,
    'Write-Output "ok"',
  ].join('\n');
  const r = await runPowerShell(script, 60000);
  if (!r.ok) return { ok: false, error: 'Could not read that file as a presentation (.odp). ' + (r.stderr || '').trim().slice(0, 200) };
  let xml = '';
  try { xml = fs.readFileSync(path.join(tmpDir, 'content.xml'), 'utf8'); } catch {
    return { ok: false, error: 'That file has no slides.' };
  }
  const stripTags = (s) => decodeXmlText(String(s || '')
    .replace(/<text:line-break[^/]*\/?>/g, ' ')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
  const slides = [];
  const pageRe = /<draw:page[\s>][\s\S]*?<\/draw:page>/g;
  let pg;
  while ((pg = pageRe.exec(xml))) {
    const paras = [];
    const pRe = /<text:p[\s>]([\s\S]*?)<\/text:p>/g;
    let m;
    while ((m = pRe.exec(pg[0]))) {
      const t = stripTags(m[1]);
      if (t) paras.push(t);
    }
    if (!paras.length) { slides.push({ title: '', bullets: [] }); continue; }
    slides.push({ title: paras[0], bullets: paras.slice(1) });
  }
  if (!slides.length) return { ok: false, error: 'That file has no slides.' };
  return { ok: true, mode: 'text', slides };
};
