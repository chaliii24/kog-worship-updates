// Blackmagic DeckLink / UltraStudio SDI output bridge.
//
// True SDK output (zero latency, no compositor) needs a native addon built
// against Blackmagic's proprietary DeckLink headers, which cannot ship in
// CI. The shippable pipeline is an ffmpeg bridge: an ffmpeg built with
// --enable-decklink plays the projector window straight out of the card
// (gdigrab window/region capture -> decklink output device, docs:
// https://ffmpeg.org/ffmpeg-devices.html#decklink-1). This module owns
// capability detection — driver installed, ffmpeg found, decklink OUTPUT
// device compiled in, hardware enumeration — plus the capture->SDI child
// process, degrading gracefully with a precise reason whenever a
// prerequisite is missing.

import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';

const DRIVER_DIRS = [
  path.join(process.env.ProgramW6432 || 'C:\\Program Files', 'Blackmagic Design', 'Blackmagic Desktop Video'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Blackmagic Design', 'Blackmagic Desktop Video'),
];

let mirror = null; // { proc, opts, stopping }
let lastError = null;

// Capability probes are expensive (they spawn ffmpeg), so cache them.
// ffmpeg path and support change only when the user installs something.
const cache = {
  ffmpeg: { value: undefined, at: 0 },   // string | null
  capable: { value: undefined, at: 0 },  // boolean
  devices: { value: undefined, at: 0 },  // string[]
};

function run(cmd, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(r); } };
    let child;
    try {
      child = execFile(cmd, args, { windowsHide: true, timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
        done({ code: error && typeof error.code === 'number' ? error.code : 0, out: String(stdout || ''), err: String(stderr || '') });
      });
    } catch (e) {
      done({ code: -1, out: '', err: String((e && e.message) || e) });
      return;
    }
    child.on('error', (e) => done({ code: -1, out: '', err: String((e && e.message) || e) }));
  });
}

export async function findFfmpeg(override) {
  // A directory passes existsSync but is not an executable — fail fast with a
  // clear message instead of a confusing async spawn error 700ms later.
  if (override) {
    try {
      if (fs.existsSync(override) && fs.statSync(override).isFile()) return override;
    } catch {}
    return null;
  }
  const now = Date.now();
  if (cache.ffmpeg.value !== undefined && now - cache.ffmpeg.at < 60000) return cache.ffmpeg.value;
  let found = null;
  const r = await run('where.exe', ['ffmpeg'], 8000);
  if (r.code === 0) {
    found = (r.out || '').split(/\r?\n/).map((s) => s.trim()).find((s) => s && fs.existsSync(s)) || null;
  }
  cache.ffmpeg = { value: found, at: now };
  return found;
}

export function driverInstalled() {
  return DRIVER_DIRS.some((d) => { try { return fs.existsSync(d); } catch { return false; } });
}

// Does THIS ffmpeg build carry the decklink OUTPUT device? A stock Windows
// build does not (it needs the DeckLink SDK at configure time). Two probes:
// `-sinks decklink` on builds that know the flag, else a dry run against a
// fake device name — expected to FAIL on device open, but the failure text
// tells us whether the format itself was recognized.
export async function decklinkOutputSupported(ffmpeg) {
  if (!ffmpeg) return false;
  const now = Date.now();
  if (cache.capable.value !== undefined && now - cache.capable.at < 60000) return cache.capable.value;
  let ok = false;
  const sinks = await run(ffmpeg, ['-hide_banner', '-sinks', 'decklink'], 8000);
  const sinksText = `${sinks.out}\n${sinks.err}`;
  if (/decklink/i.test(sinksText) && !/unknown|invalid|no such|unrecognized|unavailable/i.test(sinksText)) {
    ok = true;
  }
  if (!ok) {
    const probe = await run(
      ffmpeg,
      ['-hide_banner', '-f', 'lavfi', '-i', 'color=black:s=128x128:r=30', '-frames:v', '1', '-f', 'decklink', '-pix_fmt', 'uyvy422', '__kog_sdi_probe__'],
      10000
    );
    const text = `${probe.out}\n${probe.err}`;
    if (/unable to find a suitable output format|not a suitable output format|unknown (?:output )?format|no such filter/i.test(text)) {
      ok = false;
    } else if (text.trim()) {
      ok = true; // got as far as opening the device -> the output device is compiled in
    }
  }
  cache.capable = { value: ok, at: now };
  return ok;
}

const HARDWARE_RE = /decklink|ultrastudio|blackmagic|intensity/i;

function parseDeviceNames(text) {
  const names = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\[[^\]]*\]\s*/, '').trim(); // strip ffmpeg log prefix
    if (!HARDWARE_RE.test(line)) continue;
    let name = line;
    const quoted = line.match(/'([^']+)'/) || line.match(/"([^"]+)"/);
    if (quoted) name = quoted[1];
    name = name.replace(/\((?:input|output|input\/output)\)\s*$/i, '').trim();
    if (name && HARDWARE_RE.test(name) && name.length < 120 && !names.includes(name)) names.push(name);
  }
  return names;
}

export async function listDevices(ffmpegOverride) {
  const ffmpeg = await findFfmpeg(ffmpegOverride);
  if (!ffmpeg) return [];
  const now = Date.now();
  if (cache.devices.value && now - cache.devices.at < 15000) return cache.devices.value;
  const names = [];
  // `-sources decklink` enumerates the hardware on DeckLink-enabled builds
  // (the cards are the same physical devices used for output).
  const sources = await run(ffmpeg, ['-hide_banner', '-sources', 'decklink'], 8000);
  names.push(...parseDeviceNames(`${sources.out}\n${sources.err}`));
  if (!names.length) {
    // Older builds: deprecated input-device listing prints hardware too.
    const legacy = await run(ffmpeg, ['-hide_banner', '-f', 'decklink', '-list_devices', '1', '-i', 'dummy'], 8000);
    names.push(...parseDeviceNames(`${legacy.out}\n${legacy.err}`));
  }
  cache.devices = { value: names, at: now };
  return names;
}

// opts: { ffmpegPath?, device, mode:{w,h,rate,field}, windowTitle?, region?{x,y,w,h}, fps? }
// Capture source is the OUTPUT WINDOW by title (exact match incl. custom
// viewport and rotation, which render inside the window), or the window's
// desktop region as a fallback for builds where PrintWindow capture of a
// GPU-composited window comes out black.
//
// Mode numbers are COERCED, never interpolated: the filter graph is built
// from raw strings, and a crafted `mode.w` like `1920,split[a][b]` would
// rewrite it (ffmpeg filters include file read/write primitives). Same for
// the field order allowlist and the device name (no commas/quotes/newlines).
const numMode = (v, lo, hi, fb) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
};
const cleanField = (f) => ['progressive', 'tt', 'bb', 'tb', 'bt'].includes(f) ? f : 'progressive';
const cleanDevice = (d) => {
  const s = String(d || '').trim();
  return s && !/[,;"'\n\r]/.test(s) ? s : null;
};
let lastProc = null;

export async function start(opts) {
  // Wait out a dying previous instance first: the SDI device is exclusive,
  // and spawning into its teardown raced for the handle (device busy).
  if (lastProc) {
    const t0 = Date.now();
    while (lastProc.exitCode === null && Date.now() - t0 < 2000) await new Promise((r) => setTimeout(r, 50));
    lastProc = null;
  }
  if (mirror) stop();
  lastError = null;
  const ffmpeg = await findFfmpeg(opts && opts.ffmpegPath);
  if (!ffmpeg) return { ok: false, error: 'ffmpeg not found. Install it and add it to PATH, or set the full ffmpeg.exe path above.' };
  if (!driverInstalled()) return { ok: false, error: 'Blackmagic Desktop Video driver not detected (C:\\Program Files\\Blackmagic Design\\Blackmagic Desktop Video).' };
  if (!(await decklinkOutputSupported(ffmpeg))) return { ok: false, error: 'This ffmpeg build has no DeckLink output device. Use a build configured with --enable-decklink (the stock builds do not include it).' };
  if (!opts || !opts.device) return { ok: false, error: 'Pick a DeckLink device, or type its exact name.' };
  if (!opts.windowTitle && !opts.region) return { ok: false, error: 'Start an output window first — there is nothing to send to SDI.' };

  const device = cleanDevice(opts && opts.device);
  if (!device) return { ok: false, error: 'Pick a DeckLink device, or type its exact name.' };
  if (!opts.windowTitle && !opts.region) return { ok: false, error: 'Start an output window first — there is nothing to send to SDI.' };

  const mode = opts.mode || {};
  const mw = numMode(mode.w, 320, 7680, 1920);
  const mh = numMode(mode.h, 200, 4320, 1080);
  const rate = numMode(mode.rate, 1, 120, 30);
  const field = cleanField(mode.field);
  const fps = numMode(opts.fps, 1, 120, 30);
  const source = opts.region
    ? ['-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '0',
       '-offset_x', String(Math.round(opts.region.x)), '-offset_y', String(Math.round(opts.region.y)),
       '-video_size', `${Math.round(opts.region.w)}x${Math.round(opts.region.h)}`, '-i', 'desktop']
    : ['-f', 'gdigrab', '-framerate', String(fps), '-draw_mouse', '0', '-i', `title=${opts.windowTitle}`];

  // DeckLink output is always uyvy422; the display mode comes from
  // -s / -r / -field_order (docs §4.4.2). Scale to the mode's size with
  // letterboxing so a non-matching output window never distorts.
  const args = [
    ...source,
    '-an',
    '-vf', `fps=${rate},scale=${mw}:${mh}:force_original_aspect_ratio=decrease,pad=${mw}:${mh}:(ow-iw)/2:(oh-ih)/2:black`,
    '-f', 'decklink',
    '-pix_fmt', 'uyvy422',
    '-s', `${mw}x${mh}`,
    '-r', String(rate),
    '-field_order', field,
    device
  ];

  let proc;
  try {
    proc = spawn(ffmpeg, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    lastError = String((e && e.message) || e);
    return { ok: false, error: lastError };
  }
  let errBuf = '';
  if (proc.stderr) proc.stderr.on('data', (d) => { errBuf = (errBuf + d.toString()).slice(-4000); });
  const mine = { proc, opts, stopping: false };
  mirror = mine;
  proc.on('error', (e) => {
    lastError = `SDI pipeline error: ${(e && e.message) || e}`;
    if (mirror === mine) mirror = null;
  });
  proc.on('exit', (code) => {
    if (mirror === mine) mirror = null;
    if (!mine.stopping && code !== 0) {
      lastError = (errBuf.trim() || `ffmpeg exited with code ${code}`).slice(0, 1500);
    }
  });

  // Fail fast on a bad device name instead of showing a false "running".
  await new Promise((r) => setTimeout(r, 700));
  if (mirror !== mine) return { ok: false, error: lastError || 'The SDI pipeline exited immediately.' };
  return { ok: true, pid: proc.pid };
}

export function stop() {
  if (!mirror) return { ok: true };
  const mine = mirror;
  mine.stopping = true;
  // SIGTERM, then SIGKILL if it lingers: the old fire-and-forget kill left
  // ffmpeg holding the exclusive DeckLink handle while status() reported
  // running:false — and the next start() died with "device busy".
  try { mine.proc.kill(); } catch { /* noop */ }
  mirror = null;
  lastError = null;
  // Handed to start() so it can wait out the teardown before respawning.
  lastProc = mine.proc;
  setTimeout(() => {
    try {
      if (mine.proc.exitCode === null && mine.proc.signalCode === null) mine.proc.kill('SIGKILL');
    } catch { /* already gone */ }
    if (lastProc === mine.proc) lastProc = null;
  }, 1500).unref?.();
  return { ok: true };
}

export async function status(ffmpegOverride) {
  const ffmpeg = await findFfmpeg(ffmpegOverride);
  return {
    running: !!mirror,
    pid: mirror && mirror.proc ? mirror.proc.pid : null,
    device: mirror ? (mirror.opts && mirror.opts.device) || null : null,
    driverFound: driverInstalled(),
    ffmpegPath: ffmpeg,
    decklinkOut: ffmpeg ? await decklinkOutputSupported(ffmpeg) : false,
    lastError
  };
}
