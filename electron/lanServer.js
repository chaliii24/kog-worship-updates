// LAN remote server.
//
// Lives in the Electron main process and owns ONE port (8787) for two things:
//   * HTTP  — hands out the built mobile page (production) so a phone needs
//             nothing but a browser;
//   * WS    — state down, commands up, pairing handshake.
//
// Security model: the socket is read-only until a phone presents a pairing
// PIN shown on the operator's screen. Stage phones (singers) connect without
// a PIN because they can only *receive* — the server refuses to forward any
// command from a socket that has not paired as a control client.
import http from 'http';
import net from 'net';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';
import electronLog from 'electron-log';

const log = electronLog || { info: (...a) => console.log(...a), error: (...a) => console.error(...a) };

const PORT = Number(process.env.KOG_LAN_PORT) || 8787;
const PAIR_FILE_NAME = 'remote-pairing.json';
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
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

function lanAddresses() {
  const ifs = os.networkInterfaces();
  const found = [];
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name] || []) {
      if (i.family === 'IPv4' && !i.internal) found.push({ name, address: i.address });
    }
  }
  if (!found.length) return [];
  // Prefer a real LAN adapter over a VPN/Hyper-V/Tailscale tunnel, because the
  // phone has to be able to reach the address we print.
  const real = found.filter(a => /wi-?fi|ethernet|lan|local/i.test(a.name) && !/vpn|tun|tap|wireguard|tailscale|vmware|vbox|hyper-v|wsl/i.test(a.name));
  return [...real, ...found.filter(a => !real.includes(a))];
}

function primaryAddress() {
  const list = lanAddresses();
  return list.length ? list[0].address : '127.0.0.1';
}

function distDir() {
  // <app>/dist — same folder the renderer loads in a packaged build.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'dist');
}

export function createLanServer({ getDistDir = distDir, userDataDir, dev = false } = {}) {
  const pairPath = userDataDir ? path.join(userDataDir, PAIR_FILE_NAME) : null;

  let server = null;
  let wss = null;
  let lastState = null;
  let onCommand = null;
  let commandPort = null; // forwards a phone command to the renderer

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
      if (s.readyState === 1) {
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

  const notBuilt = (res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#050509;color:#e5e7eb;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:28px">The app has not been built yet and the dev server is not running.<br>Start <b>npm run dev</b> or build the app, then reload this page.</body></html>');
  };

  // Vite has not produced dist/ yet, or we are in dev — hand the phone to the
  // live dev server instead of a stale build. `location.hash` is carried over
  // explicitly because the browser never sends the fragment to the server, so
  // a meta-refresh alone would drop #control / #stage.
  const redirectToDev = (res) => {
    const target = `http://${primaryAddress()}:5173/mobile.html`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#050509;color:#fff;font:600 16px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px"><div>Opening the dev build…<br><br><a id="l" style="color:#60a5fa" href="${target}">tap here if nothing happens</a></div><script>location.replace('${target}'+location.hash);document.getElementById('l').href='${target}'+location.hash;</script></body></html>`);
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

    if (reqPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ok: true, port: PORT, clients: sockets.size, pinned: pairing.tokens.length > 0, dev }));
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
      // The entire reason a PIN exists: unpaired sockets cannot touch output.
      if (sock.kogRole !== 'control' || !sock.kogControl) {
        try { sock.send(JSON.stringify({ t: 'ack', cmd: msg.cmd, ok: false, reason: 'forbidden' })); } catch { /* noop */ }
        return;
      }
      const cmd = typeof msg.cmd === 'string' ? msg.cmd.slice(0, 40) : '';
      if (!cmd) return;
      let ok = false;
      try { ok = commandPort ? !!commandPort({ cmd, payload: msg.payload }) : false; } catch (e) { log.error('[lan] command failed:', e.message); }
      try { sock.send(JSON.stringify({ t: 'ack', cmd, ok })); } catch { /* noop */ }
    }
  };

  const start = ({ onCommand: cmdHandler } = {}) => {
    // Always return a promise — callers chain .then/.catch on it.
    if (server) return Promise.resolve(info());
    onCommand = cmdHandler || null;
    commandPort = cmdHandler || null;
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
      sock.on('close', () => { sockets.delete(sock); });
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
    try { return await QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#ffffff', light: '#0b0b10' } }); }
    catch { return ''; }
  };

  // Always point at this server rather than at Vite directly: it decides at
  // request time whether to forward to the dev server or serve the build, so
  // the QR code stays valid across dev and packaged runs.
  const controlUrl = () => `http://${primaryAddress()}:${PORT}/#control`;
  const stageUrl = () => `http://${primaryAddress()}:${PORT}/#stage`;

  const info = () => ({
    running: !!server,
    port: PORT,
    ip: primaryAddress(),
    addresses: lanAddresses(),
    controlUrl: controlUrl(),
    stageUrl: stageUrl(),
    pin,
    clients: sockets.size,
    paired: pairing.tokens.length,
    // Windows blocks inbound listeners silently if the rule was declined once.
    firewallHint: `netsh advfirewall firewall add rule name="KOG Worship Remote" dir=in action=allow protocol=TCP localport=${PORT}`,
  });

  return {
    start,
    stop,
    setState,
    info,
    qr: (url) => qr(url || controlUrl()),
    regeneratePin: () => newPin(),
    revokeAll,
    isRunning: () => !!server,
  };
}
