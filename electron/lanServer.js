// LAN remote server.
//
// Lives in the Electron main process and owns ONE port (8787) for two things:
//   * HTTP  — hands out the built mobile page (production) so a phone needs
//             nothing but a browser;
//   * WS    — state down, commands up, pairing handshake.
//
// Security model: the socket is read-only until a phone presents a pairing
// PIN shown on the operator's screen. Stage phones (singers) connect without
// a PIN because they can only *receive*. The single exception is the drummer's
// `metronomeSet` (tempo, meter, song pick): that surface is provisioned as a
// stage phone but owns the click, so the server forwards that one command and
// still refuses every other control command from an unpaired socket.
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import electronLog from 'electron-log';
import { BIBLE_MEDIA_EXT } from './mediaTypes.js';
import { canRunLanCommand } from './lanCommandRules.js';
import { listAddresses, pickAddress, probeRouteAddress } from './netAddress.js';

const log = electronLog || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };

const PORT = Number(process.env.KOG_LAN_PORT) || 8787;
const PAIR_FILE_NAME = 'remote-pairing.json';
const NET_FILE_NAME = 'remote-network.json';
const MAX_TOKENS = 24;
const PIN_MAX_ATTEMPTS = 6;
const PIN_LOCKOUT_MS = 45000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.jfif': 'image/jpeg',
};

// Address selection lives in netAddress.js (route probe → ranking → operator
// pin). This thin wrapper keeps the URL builders below readable; the state
// `primaryAddress()` consults (`probed`, `pinned`) is owned by the server
// instance, since a pin belongs to one operator's machine.
const lanAddresses = () => listAddresses();

function distDir() {
  // <app>/dist — same folder the renderer loads in a packaged build.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'dist');
}

export function createLanServer({ getDistDir = distDir, userDataDir, dev = false, mediaDir = null, builtinMedia = [] } = {}) {
  const pairPath = userDataDir ? path.join(userDataDir, PAIR_FILE_NAME) : null;
  const netPath = userDataDir ? path.join(userDataDir, NET_FILE_NAME) : null;

  let server = null;
  let wss = null;
  let lastState = null;
  let onCommand = null;
  let commandPort = null; // forwards a phone command to the renderer
  let onMessage = null;   // forwards a phone message to the renderer
  let onDeviceConnect = null;
  let onDeviceDisconnect = null;

  // ---- network address -----------------------------------------------------
  // `probed` is what the OS routing table says, `pinned` is what the operator
  // chose. Both are re-validated against the live interface list every time a
  // link is built, so a stale value (laptop moved from church Wi-Fi to home)
  // is ignored instead of printed.
  let probed = '';
  let probedAt = 0;
  let pinned = '';

  const liveAddresses = () => lanAddresses();

  const loadNetPrefs = () => {
    if (!netPath) return;
    try {
      const data = JSON.parse(fs.readFileSync(netPath, 'utf8'));
      if (data && typeof data.address === 'string') pinned = data.address;
    } catch { /* first run: no pin yet */ }
  };

  const saveNetPrefs = () => {
    if (!netPath) return;
    try {
      fs.mkdirSync(path.dirname(netPath), { recursive: true });
      fs.writeFileSync(netPath, JSON.stringify({ address: pinned || '' }, null, 2));
    } catch (e) {
      log.warn('[lan] could not save network preference:', e.message);
    }
  };

  const primaryAddress = () => pickAddress({ addresses: liveAddresses(), probed, pinned });

  // Cheap (a UDP connect that sends nothing) and cached, because the remote
  // menus poll `info()` every few seconds: re-probing on every poll would open
  // and close a socket for no new information.
  const refreshNetwork = async (force = false) => {
    if (!force && Date.now() - probedAt < 10000) return primaryAddress();
    probed = await probeRouteAddress();
    probedAt = Date.now();
    const picked = primaryAddress();
    if (picked !== probed) log.info('[lan] using address', picked, probed ? `(route says ${probed})` : '(no default route)');
    return picked;
  };

  // '' (or an address that is no longer on this machine) clears the pin and
  // hands the choice back to auto-detection.
  const setPreferredAddress = (address) => {
    const wanted = typeof address === 'string' ? address.trim() : '';
    const found = liveAddresses().find(a => a.address === wanted);
    pinned = found ? found.address : '';
    saveNetPrefs();
    log.info('[lan] network address:', pinned || '(auto)');
    return info();
  };

  loadNetPrefs();

  const pairing = { secret: '', tokens: [] };
  let pin = '000000';
  let pinFailed = 0;
  let pinLockedUntil = 0;

  const sockets = new Set();

  // ---- pairing store -------------------------------------------------------
  const loadPairing = () => {
    if (!pairPath) return;
    try {
      if (fs.existsSync(pairPath)) {
        const data = JSON.parse(fs.readFileSync(pairPath, 'utf8'));
        if (data && typeof data.secret === 'string' && data.secret.length >= 32) {
          pairing.secret = data.secret;
          pairing.tokens = Array.isArray(data.tokens) ? data.tokens.filter(t => typeof t === 'string') : [];
        }
      }
    } catch (e) {
      log.warn('[lan] could not read pairing file:', e.message);
    }
    if (!pairing.secret) pairing.secret = crypto.randomBytes(32).toString('hex');
    savePairing();
  };

  const savePairing = () => {
    if (!pairPath) return;
    try {
      fs.mkdirSync(path.dirname(pairPath), { recursive: true });
      fs.writeFileSync(pairPath, JSON.stringify({ secret: pairing.secret, tokens: pairing.tokens }, null, 2));
    } catch (e) {
      log.warn('[lan] could not save pairing file:', e.message);
    }
  };

  const newPin = () => {
    // Avoid leading zeros so the code reads naturally when read off a screen.
    pin = String(crypto.randomInt(100000, 1000000));
    pinFailed = 0;
    pinLockedUntil = 0;
    // Also lands in main.log, so "what's the code again?" is answerable after
    // the window is closed.
    log.info('[lan] pairing code:', pin);
    return pin;
  };

  const validToken = (token) => typeof token === 'string' && token.length >= 32 && pairing.tokens.includes(token);

  const issueToken = () => {
    const token = crypto.randomBytes(24).toString('hex');
    pairing.tokens.push(token);
    if (pairing.tokens.length > MAX_TOKENS) pairing.tokens = pairing.tokens.slice(-MAX_TOKENS);
    savePairing();
    return token;
  };

  const revokeAll = () => {
    pairing.tokens = [];
    savePairing();
    // Existing sockets lose control rights immediately.
    for (const s of sockets) {
      if (s.kogControl) {
        s.kogControl = false;
        try { s.send(JSON.stringify({ t: 'auth', ok: false, reason: 'revoked' })); } catch { /* noop */ }
      }
    }
    return newPin();
  };

  // ---- state broadcast -----------------------------------------------------
  const broadcast = (obj) => {
    const raw = JSON.stringify(obj);
    for (const s of sockets) {
      // Identified sockets only: a fresh connection that never declared
      // itself (stage) or paired (control) used to receive full snapshots —
      // live lyrics, service order, timer — with no PIN at all.
      if (s.readyState === 1 && (s.kogRole === 'stage' || (s.kogRole === 'control' && s.kogAuthed))) {
        try { s.send(raw); } catch { /* noop */ }
      }
    }
  };

  const setState = (snap) => {
    lastState = snap || null;
    if (lastState) broadcast({ t: 'state', data: lastState });
  };

  // ---- HTTP ---------------------------------------------------------------
  const sendFile = (res, filePath) => {
    fs.readFile(filePath, (err, buf) => {
      if (err) { notFound(res); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(buf);
    });
  };

  const notFound = (res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  };

  // Media files (phone miniatures): images can be served whole, but a phone's
  // <video> needs byte ranges to start/seek reliably. Chromium tolerates a
  // plain 200; iOS Safari often paints the first frame BLACK until the server
  // advertises Accept-Ranges and answers 206. One helper for both the uploads
  // folder and the folder-backed (Bible) route keeps that behaviour identical.
  const sendMediaFile = (req, res, abs, st, immutable) => {
    const total = st.size;
    const type = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'Access-Control-Allow-Origin': '*',
    };
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (m && (m[1] !== '' || m[2] !== '')) {
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);
      if (start == null) {
        // Suffix range: the last N bytes.
        start = Math.max(0, total - (end || 0));
        end = total - 1;
      } else if (end == null || end >= total) {
        end = total - 1;
      }
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${total}` });
        res.end();
        return;
      }
      res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${total}`, 'Content-Length': end - start + 1 });
      fs.createReadStream(abs, { start, end }).on('error', () => { try { res.destroy(); } catch {} }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, 'Content-Length': total });
    fs.createReadStream(abs).on('error', () => { try { res.destroy(); } catch {} }).pipe(res);
  };

  const notBuilt = (res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#090a0f;color:#cbd5e1;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:28px">The app has not been built yet and the dev server is not running.<br>Start <b>npm run dev</b> or build the app, then reload this page.</body></html>');
  };

  // Vite has not produced dist/ yet, or we are in dev — hand the phone to the
  // live dev server instead of a stale build. `location.search` / `hash` are
  // carried over explicitly because the browser never sends the fragment to
  // the server, and a meta-refresh alone would drop both — including the
  // `?role=drummer` provisioning parameter.
  const redirectToDev = (res) => {
    const target = `http://${primaryAddress()}:5173/mobile.html`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#090a0f;color:#fff;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px"><div>Opening the dev build…<br><br><a id="l" style="color:#a78bfa" href="${target}">tap here if nothing happens</a></div><script>location.replace('${target}'+location.search+location.hash);document.getElementById('l').href='${target}'+location.search+location.hash;</script></body></html>`);
  };

  // Is the Vite dev server actually up? Probed per request (cached briefly) so
  // an `electron .` run without Vite falls back to the last built page instead
  // of handing the phone a dead link.
  let viteUpAt = 0;
  let viteUp = false;
  const viteIsUp = (cb) => {
    const age = Date.now() - viteUpAt;
    if (age < 4000) { cb(viteUp); return; }
    let done = false;
    const finish = (up) => {
      if (done) return;
      done = true;
      viteUp = up;
      viteUpAt = Date.now();
      cb(up);
    };
    const sock = net.connect({ host: '127.0.0.1', port: 5173 }, () => { sock.destroy(); finish(true); });
    sock.on('error', () => finish(false));
    setTimeout(() => { try { sock.destroy(); } catch { /* noop */ } finish(false); }, 500);
  };

  const serveDist = (res, reqPath) => {
    const root = getDistDir();
    const mobileEntry = path.join(root, 'mobile.html');
    const isHtmlRoute = reqPath === '/' || reqPath === '/index.html' || reqPath === '/mobile.html';

    if (!fs.existsSync(mobileEntry)) {
      // Nothing built yet: send the phone to Vite if it is running, otherwise
      // say so instead of serving a blank page.
      if (isHtmlRoute) {
        if (dev) { viteIsUp((up) => (up ? redirectToDev(res) : notBuilt(res))); return; }
        notBuilt(res);
        return;
      }
      notFound(res);
      return;
    }

    // Absolute path, then verify it stayed inside dist/ — reject `..` and any
    // attempt to read outside the bundle.
    const rel = reqPath === '/' ? 'mobile.html' : reqPath.replace(/^\/+/, '');
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep) && abs !== mobileEntry) { notFound(res); return; }
    if (abs === root) { notFound(res); return; }

    fs.stat(abs, (err, st) => {
      if (err || !st.isFile()) { notFound(res); return; }
      sendFile(res, abs);
    });
  };

  const handleHttp = (req, res) => {
    const reqPath = decodeURIComponent((req.url || '/').split('?')[0]);

    // Browsers request /favicon.ico automatically when a page has no icon
    // link (and some do it anyway). mobile.html now points at /favicon.png,
    // but answer the legacy path too so the stage phone's console stays
    // clean: serve the shipped icon, or 204 when nothing is built yet.
    if (reqPath === '/favicon.ico' || reqPath === '/favicon.png') {
      const icon = path.join(getDistDir(), 'favicon.png');
      fs.stat(icon, (err, st) => {
        if (err || !st.isFile()) {
          res.writeHead(204, { 'Access-Control-Allow-Origin': '*'});
          res.end();
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': st.size,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(icon).on('error', () => { try { res.destroy(); } catch {} }).pipe(res);
      });
      return;
    }

    if (reqPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, port: PORT, clients: sockets.size, pinned: pairing.tokens.length > 0, dev }));
      return;
    }

    // Phone background images: media:// URLs only resolve inside Electron,
    // so paired control phones fetch library images here instead. Bearer
    // token required (same pairing as WS commands); stage phones don't render
    // miniatures. Filenames are content-addressed uploads → immutable cache.
    // Videos are deliberately NOT served — phones show a badge, never a stream.
    if (reqPath === '/media' || reqPath.startsWith('/media/')) {
      const q = new URL(req.url || '/', 'http://lan').searchParams;
      if (!validToken(q.get('token') || '')) {
        res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('pairing required');
        return;
      }
      const name = decodeURIComponent(reqPath.slice('/media/'.length));
      // Folder-backed Bible media (bf/<folder>/<file> — from the scripture
      // media picker). reqPath is already decoded above, so the folder path
      // on Windows legitimately contains backslashes — this branch must run
      // BEFORE the bare-filename rules below. Extension whitelisted, and the
      // resolved file must sit DIRECTLY inside the given folder (no
      // traversal, no subpaths). NOT immutable-cached: the operator can
      // replace a picture in that folder and phones must see the new one.
      if (name.startsWith('bf/')) {
        const rest = name.slice(3);
        const cut = rest.lastIndexOf('/');
        const folder = cut > 0 ? rest.slice(0, cut) : '';
        const file = cut > 0 ? rest.slice(cut + 1) : '';
        const ext = path.extname(file).toLowerCase();
        if (!folder || !file || !BIBLE_MEDIA_EXT.includes(ext)) { notFound(res); return; }
        const abs = path.resolve(folder, file);
        if (path.dirname(abs) !== path.resolve(folder)) { notFound(res); return; }
        fs.stat(abs, (err, st) => {
          if (err || !st.isFile()) { notFound(res); return; }
          sendMediaFile(req, res, abs, st, false);
        });
        return;
      }
      if (!name || name.includes('\\') || name.includes('..')) { notFound(res); return; }
      // Known builtin prefixes keep their subpath; uploads must be a bare
      // filename. Either way the tail is basenamed — no traversal, ever.
      let dir = mediaDir;
      let file = name;
      for (const b of builtinMedia) {
        if (b && b.prefix && name.startsWith(b.prefix) && b.dir) {
          dir = b.dir;
          file = name.slice(b.prefix.length);
          break;
        }
      }
      if (file.includes('/')) { notFound(res); return; }
      file = path.basename(file);
      if (!file) { notFound(res); return; }
      if (!dir) { notFound(res); return; }
      const abs = path.resolve(dir, file);
      if (abs !== path.join(dir, file) && !abs.startsWith(path.join(dir, path.sep))) { notFound(res); return; }
      fs.stat(abs, (err, st) => {
        if (err || !st.isFile()) { notFound(res); return; }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
          'Content-Length': st.size,
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(abs).on('error', () => { try { res.destroy(); } catch {} }).pipe(res);
      });
      return;
    }

    const isHtmlRoute = reqPath === '/' || reqPath === '/index.html' || reqPath === '/mobile.html';
    // In dev, prefer the live Vite server so edits show up on the phone
    // immediately; fall back to the last build if Vite is not running.
    if (dev && isHtmlRoute) {
      viteIsUp((up) => (up ? redirectToDev(res) : serveDist(res, reqPath)));
      return;
    }
    serveDist(res, reqPath);
  };

  // ---- WS -----------------------------------------------------------------
  const handleMessage = (sock, raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'ping') {
      try { sock.send(JSON.stringify({ t: 'pong' })); } catch { /* noop */ }
      return;
    }

    if (msg.t === 'auth') {
      const role = msg.role === 'stage' ? 'stage' : 'control';
      if (role === 'stage') {
        // Read-only: safe without a PIN, it cannot change anything.
        sock.kogRole = 'stage';
        sock.kogAuthed = true;
        try { sock.send(JSON.stringify({ t: 'auth', ok: true, role: 'stage' })); } catch { /* noop */ }
        if (lastState) { try { sock.send(JSON.stringify({ t: 'state', data: lastState })); } catch { /* noop */ } }
        return;
      }
      if (validToken(msg.token)) {
        sock.kogRole = 'control';
        sock.kogAuthed = true;
        sock.kogControl = true;
        try { sock.send(JSON.stringify({ t: 'auth', ok: true, role: 'control' })); } catch { /* noop */ }
        if (lastState) { try { sock.send(JSON.stringify({ t: 'state', data: lastState })); } catch { /* noop */ } }
      } else {
        try { sock.send(JSON.stringify({ t: 'auth', ok: false, reason: 'pin' })); } catch { /* noop */ }
      }
      return;
    }

    // Device identity: paired phones announce themselves so the operator can
    // address replies to the right person and keep conversations separate.
    if (msg.t === 'hello') {
      sock.kogDeviceId = String(msg.deviceId || '').slice(0, 64);
      sock.kogDeviceName = String(msg.deviceName || 'Remote').slice(0, 64);
      if (sock.kogDeviceId) {
        try { onDeviceConnect && onDeviceConnect({ deviceId: sock.kogDeviceId, deviceName: sock.kogDeviceName, role: sock.kogRole }); } catch {}
      }
      try { sock.send(JSON.stringify({ t: 'hello-ack', deviceId: sock.kogDeviceId })); } catch {}
      return;
    }

    // Two-way messaging: a phone submits a message to the operator.
    if (msg.t === 'msg') {
      if (!sock.kogAuthed || sock.kogRole !== 'control') {
        try { sock.send(JSON.stringify({ t: 'ack', cmd: 'msg', ok: false, reason: 'forbidden' })); } catch {}
        return;
      }
      const m = {
        id: String(msg.id || crypto.randomUUID()),
        conversationId: String(msg.conversationId || sock.kogDeviceId || 'unknown'),
        senderId: sock.kogDeviceId || 'unknown',
        senderName: sock.kogDeviceName || 'Remote',
        recipientId: 'operator',
        content: String(msg.content || '').slice(0, 4000),
        priority: ['normal','important','urgent'].includes(msg.priority) ? msg.priority : 'normal',
        timestamp: Number(msg.timestamp) || Date.now(),
      };
      try { onMessage && onMessage({ type: 'msg', device: { deviceId: sock.kogDeviceId, deviceName: sock.kogDeviceName }, message: m }); } catch (e) { log.error('[lan] onMessage failed:', e.message); }
      return;
    }

    // Phone acknowledges / updates status of an operator message.
    if (msg.t === 'msg-ack' || msg.t === 'msg-status') {
      const id = String(msg.id || '');
      if (!id) return;
      try { onMessage && onMessage({ type: msg.t === 'msg-ack' ? 'msg-ack' : 'msg-status', device: { deviceId: sock.kogDeviceId, deviceName: sock.kogDeviceName }, id, status: msg.status, deliveredAt: msg.deliveredAt, readAt: msg.readAt, ackAt: msg.ackAt }); } catch {}
      return;
    }

    if (msg.t === 'pin') {
      if (Date.now() < pinLockedUntil) {
        try { sock.send(JSON.stringify({ t: 'auth', ok: false, reason: 'locked' })); } catch { /* noop */ }
        return;
      }
      const entered = String(msg.pin || '').trim();
      if (entered === pin) {
        pinFailed = 0;
        const token = issueToken();
        sock.kogRole = 'control';
        sock.kogAuthed = true;
        sock.kogControl = true;
        try { sock.send(JSON.stringify({ t: 'auth', ok: true, role: 'control', token })); } catch { /* noop */ }
        if (lastState) { try { sock.send(JSON.stringify({ t: 'state', data: lastState })); } catch { /* noop */ } }
        log.info('[lan] device paired');
      } else {
        pinFailed += 1;
        if (pinFailed >= PIN_MAX_ATTEMPTS) {
          pinLockedUntil = Date.now() + PIN_LOCKOUT_MS;
          pinFailed = 0;
          log.warn('[lan] PIN lockout engaged');
        }
        try { sock.send(JSON.stringify({ t: 'auth', ok: false, reason: 'wrong' })); } catch { /* noop */ }
      }
      return;
    }

    if (msg.t === 'cmd') {
      const cmd = typeof msg.cmd === 'string' ? msg.cmd.slice(0, 40) : '';
      if (!cmd) return;
      // The entire reason a PIN exists: unpaired sockets cannot touch output.
      // The drummer phone is the one exception (see lanCommandRules.js):
      // without it the console never received metronomeSet and the phone's
      // optimistic BPM reverted as soon as its echo timed out.
      const allowed = canRunLanCommand({
        role: sock.kogRole,
        authed: sock.kogAuthed,
        control: sock.kogControl,
        cmd,
      });
      if (!allowed) {
        try { sock.send(JSON.stringify({ t: 'ack', cmd, ok: false, reason: 'forbidden' })); } catch { /* noop */ }
        return;
      }
      let ok = false;
      try { ok = commandPort ? !!commandPort({ cmd, payload: msg.payload }) : false; } catch (e) { log.error('[lan] command failed:', e.message); }
      try { sock.send(JSON.stringify({ t: 'ack', cmd, ok })); } catch { /* noop */ }
    }
  };

  const start = ({ onCommand: cmdHandler, onMessage: msgHandler, onDeviceConnect: devConn, onDeviceDisconnect: devDisc } = {}) => {
    // Always return a promise — callers chain .then/.catch on it.
    if (server) return Promise.resolve(info());
    onCommand = cmdHandler || null;
    commandPort = cmdHandler || null;
    onMessage = msgHandler || null;
    onDeviceConnect = devConn || null;
    onDeviceDisconnect = devDisc || null;
    loadPairing();
    newPin();

    server = http.createServer(handleHttp);

    wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      const url = (req.url || '').split('?')[0];
      if (url !== '/ws') { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });

    wss.on('connection', (sock) => {
      sockets.add(sock);
      sock.kogAuthed = false;
      sock.kogRole = 'none';
      sock.kogControl = false;
      sock.on('message', (raw) => handleMessage(sock, raw.toString()));
      sock.on('close', () => {
        sockets.delete(sock);
        if (sock.kogDeviceId) {
          try { onDeviceDisconnect && onDeviceDisconnect({ deviceId: sock.kogDeviceId, deviceName: sock.kogDeviceName }); } catch {}
        }
      });
      sock.on('error', () => { sockets.delete(sock); });
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') log.error(`[lan] port ${PORT} already in use — LAN remote unavailable`);
      else log.error('[lan] server error:', e.message);
    });

    // 0.0.0.0 so phones can reach it; the firewall prompt (if any) happens here.
    return new Promise((resolve) => {
      const onListenFail = () => {
        // Usually a port clash. Report the remote as OFF rather than showing a
        // pairing code that no phone could ever use.
        try { server && server.close(); } catch { /* noop */ }
        server = null;
        wss = null;
        resolve(info());
      };
      server.once('error', onListenFail);
      server.listen(PORT, '0.0.0.0', () => {
        server.removeListener('error', onListenFail);
        log.info(`[lan] listening on 0.0.0.0:${PORT}`);
        resolve(info());
      });
    });
  };

  const stop = () => {
    try { for (const s of sockets) { try { s.close(); } catch { /* noop */ } } } catch { /* noop */ }
    sockets.clear();
    try { wss && wss.close(); } catch { /* noop */ }
    wss = null;
    try { server && server.close(); } catch { /* noop */ }
    server = null;
    // `lastState` is deliberately kept: restarting the remote should serve the
    // current slide immediately rather than blank phones until the next cue.
  };

  const qr = async (url) => {
    try { return await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#ffffff', light: '#13151e' } }); }
    catch { return ''; }
  };

  // Always point at this server rather than at Vite directly: it decides at
  // request time whether to forward to the dev server or serve the build, so
  // the QR code stays valid across dev and packaged runs.
  const controlUrl = () => `http://${primaryAddress()}:${PORT}/#control`;
  const stageUrl = () => `http://${primaryAddress()}:${PORT}/#stage`;
  // Deep link straight into the full-screen drummer metronome: the mobile
  // router reads ?role=drummer on load and skips every menu / role picker.
  const drummerUrl = () => `http://${primaryAddress()}:${PORT}/?role=drummer`;

  const info = () => ({
    running: !!server,
    port: PORT,
    ip: primaryAddress(),
    addresses: lanAddresses(),
    // true when the operator pinned an adapter that still exists — the UI
    // shows it as a deliberate choice rather than an auto guess.
    addressLocked: !!pinned && lanAddresses().some(a => a.address === pinned),
    controlUrl: controlUrl(),
    stageUrl: stageUrl(),
    drummerUrl: drummerUrl(),
    pin,
    clients: sockets.size,
    paired: pairing.tokens.length,
    // Windows blocks inbound listeners silently if the rule was declined once.
    firewallHint: `netsh advfirewall firewall add rule name="KOG Worship Remote" dir=in action=allow protocol=TCP localport=${PORT}`,
  });

  const sendToDevice = (deviceId, obj) => {
    const raw = JSON.stringify(obj);
    let sent = 0;
    for (const s of sockets) {
      if (s.readyState === 1 && s.kogDeviceId === deviceId) {
        try { s.send(raw); sent++; } catch {}
      }
    }
    return sent > 0;
  };
  const sendToAllDevices = (obj) => {
    const raw = JSON.stringify(obj);
    let sent = 0;
    for (const s of sockets) {
      if (s.readyState === 1 && s.kogRole === 'control' && s.kogAuthed) {
        try { s.send(raw); sent++; } catch {}
      }
    }
    return sent;
  };
  const getDevices = () => {
    const seen = new Map();
    for (const s of sockets) {
      if (s.kogRole === 'control' && s.kogAuthed && s.kogDeviceId) {
        seen.set(s.kogDeviceId, { deviceId: s.kogDeviceId, deviceName: s.kogDeviceName || 'Remote', connected: s.readyState === 1 });
      }
    }
    return [...seen.values()];
  };

  return {
    start,
    stop,
    setState,
    info,
    qr: (url) => qr(url || controlUrl()),
    regeneratePin: () => newPin(),
    revokeAll,
    refreshNetwork,
    setPreferredAddress,
    isRunning: () => !!server,
    sendToDevice,
    sendToAllDevices,
    getDevices,
  };
}
