// Reading a PowerPoint (.pptx) back in.
//
// Two modes, because "look exactly like PowerPoint" and "keep it editable" are
// opposite goals. Image mode asks PowerPoint itself (COM) to export every slide
// as a PNG: pixel-perfect, but it needs Office installed. Text mode unzips the
// .pptx and rebuilds the words: always available, not pixel-perfect. Requesting
// images with no Office falls back to text and says so.
//
// Deliberately separate from main.js: the XML parsing is regex-level, so it
// gets exercised against real files on its own instead of only in the app.
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

export const psQuote = (p) => "'" + String(p).replace(/'/g, "''") + "'";

export const runPowerShell = (script, timeoutMs = 60000) => new Promise((resolve) => {
  execFile(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    (err, stdout, stderr) => resolve({ ok: !err, err, stdout: String(stdout || ''), stderr: String(stderr || '') })
  );
});

// Exit code 3 means PowerPoint itself could not be created: not installed.
export const pptxExportImages = async (filePath, tmpDir) => {
  fs.mkdirSync(tmpDir, { recursive: true });
  const script = [
    '$ErrorActionPreference = "Stop"',
    'try { $ppt = New-Object -ComObject PowerPoint.Application } catch { exit 3 }',
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
    if (r.err && r.err.code === 3) return { missing: true };
    return { error: r.err && r.err.killed ? 'PowerPoint took too long to respond.' : (r.stderr || 'PowerPoint could not open that file.').trim().slice(0, 300) };
  }
  const files = fs.readdirSync(tmpDir).filter(f => /\.png$/i.test(f)).sort();
  if (!files.length) return { error: 'PowerPoint exported no slides from that file.' };
  return { files };
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
export const pptxReadText = async (filePath, tmpDir) => {
  // The pre-2007 binary formats are not zip archives, so there is nothing to
  // unzip — only PowerPoint itself (COM, image mode) can open them.
  if (/\.(ppt|pps)$/i.test(filePath)) {
    return { ok: false, error: 'This is the old .ppt format, which cannot be read without PowerPoint.\n\nPick "As images" if PowerPoint is installed on this computer.\n\nOtherwise convert it to .pptx first (in PowerPoint, or the free LibreOffice) and import that instead.' };
  }
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
