// One socket for everything: state comes down, commands go up. Routing all of
// it through WebSocket (rather than fetch + SSE) means the mobile page never
// makes a cross-origin HTTP request, so there is no CORS to configure.
//
// Port rule: always talk to <hostname>:8787, regardless of where this page was
// served from. In dev Vite serves the HTML on :5173 but the control socket
// still lives on :8787; in production Electron serves both from :8787.

const TOKEN_KEY = 'kog-remote-token';
const ROLE_KEY = 'kog-remote-role';
const HEARTBEAT_MS = 20000;
const SILENCE_LIMIT_MS = 50000; // one missed heartbeat window + slack

export function readRole() {
  try { return localStorage.getItem(ROLE_KEY) || 'control'; } catch { return 'control'; }
}

export function writeRole(role) {
  try { localStorage.setItem(ROLE_KEY, role); } catch { /* private mode */ }
}

function readToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* private mode */ }
}

export function createLink({ role, onState, onStatus }) {
  let ws = null;
  let wantOpen = true;
  let attempt = 0;
  let heartbeatTimer = null;
  let watchdogTimer = null;
  let lastMessageAt = 0;
  let reconnectTimer = null;
  // "Connected" is not the same as "authorised". The server answers pings from
  // anyone, so only an accepted auth may flip the UI out of the PIN screen.
  let authed = false;
  // Bumped on every connect so events from a socket we already abandoned (an
  // old close firing late, a stale heartbeat) cannot tear down the live one.
  let gen = 0;

  const setStatus = (s, reason) => { try { onStatus(s, reason); } catch { /* noop */ } };

  const clearTimers = () => {
    clearInterval(heartbeatTimer);
    clearTimeout(watchdogTimer);
    heartbeatTimer = null;
    watchdogTimer = null;
  };

  const send = (obj) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  };

  const scheduleReconnect = () => {
    if (!wantOpen || reconnectTimer) return;
    attempt += 1;
    // 0.5s, 1s, 2s, 4s, capped at 5s — a phone that just left and re-entered
    // WiFi should recover fast, but we must not hammer a laptop that is asleep.
    const delay = Math.min(5000, 500 * Math.pow(2, Math.max(0, attempt - 1)));
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  };

  const connect = () => {
    if (!wantOpen) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    const myGen = ++gen;
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    let url;
    try {
      url = `ws://${location.hostname}:8787/ws`;
      ws = new WebSocket(url);
    } catch {
      setStatus('offline');
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (myGen !== gen) return;
      attempt = 0;
      authed = false;
      lastMessageAt = Date.now();
      // A saved token skips the PIN prompt after the first pairing; the server
      // rejects a stale one (fresh app run) with `need-pin`.
      const token = readToken();
      send({ t: 'auth', role, token });
      setStatus(token ? 'connecting' : 'need-pin');

      clearInterval(heartbeatTimer);
      heartbeatTimer = setInterval(() => {
        if (myGen !== gen) return;
        if (Date.now() - lastMessageAt > SILENCE_LIMIT_MS) {
          // Server went away (app closed / laptop slept) — drop and retry.
          try { ws.close(); } catch { /* noop */ }
          return;
        }
        send({ t: 'ping' });
      }, HEARTBEAT_MS);
    };

    ws.onmessage = (ev) => {
      if (myGen !== gen) return;
      lastMessageAt = Date.now();
      if (authed) setStatus('online');
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }

      if (msg.t === 'pong') return;
      if (msg.t === 'auth') {
        if (msg.ok) {
          authed = true;
          if (msg.token) writeToken(msg.token);
          setStatus('online');
        } else {
          authed = false;
          if (msg.reason === 'pin' || !msg.reason) setStatus('need-pin');
          else if (msg.reason === 'wrong') setStatus('wrong');
          else if (msg.reason === 'locked') setStatus('locked');
          else setStatus('denied', msg.reason);
        }
        return;
      }
      if (msg.t === 'state') {
        try { onState(msg.data); } catch { /* noop */ }
      }
    };

    ws.onclose = () => {
      if (myGen !== gen) return;
      clearTimers();
      setStatus('offline');
      scheduleReconnect();
    };

    ws.onerror = () => {
      if (myGen !== gen) return;
      try { ws.close(); } catch { /* noop */ }
    };
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      // Returning from a screen-off period: poke the socket immediately
      // instead of waiting out the silent period.
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
        attempt = 0;
        connect();
      } else {
        send({ t: 'ping' });
      }
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  connect();

  return {
    send: (cmd, payload) => send({ t: 'cmd', cmd, payload }),
    submitPin: (pin) => send({ t: 'pin', pin: String(pin || '').trim() }),
    retry: () => {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
      attempt = 0;
      authed = false;
      // The current socket is open but was rejected — closing it is the only
      // way to force the auth handshake to run again.
      gen += 1;
      clearInterval(heartbeatTimer);
      try { if (ws) ws.close(); } catch { /* noop */ }
      ws = null;
      connect();
    },
    forgetToken: () => { writeToken(''); },
    dispose: () => {
      wantOpen = false;
      gen += 1;
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(reconnectTimer);
      clearInterval(heartbeatTimer);
      clearTimeout(watchdogTimer);
      try { ws && ws.close(); } catch { /* noop */ }
    },
  };
}
