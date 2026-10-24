// Browser harness for the video-slot hook — bundled by tests/unit/useVideoSlot.test.mjs
// and driven inside a real Chromium, so the lifecycle exercised here is React's
// own (including StrictMode's mount → cleanup → mount), not a simulation of it.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useVideoSlot } from '../../src/lib/lazyVideo.jsx';
import { videoSlotStats } from '../../src/lib/videoSlots.js';

let setItems = null;
let root = null;

function Probe({ label, enabled, priority }) {
  const granted = useVideoSlot(enabled, priority);
  window.__states[label] = !!granted;
  return null;
}

function Host() {
  const [items, setItemsState] = useState([]);
  setItems = setItemsState;
  return <>{items.map((it) => <Probe key={it.key} label={it.key} enabled={it.enabled} priority={it.priority} />)}</>;
}

window.__states = {};
window.__stats = () => videoSlotStats();
window.__setItems = (items) => setItems(items);

window.__mount = () => {
  root = createRoot(document.getElementById('root'));
  root.render(<React.StrictMode><Host /></React.StrictMode>);
};

window.__unmount = () => {
  if (!root) return;
  root.unmount();
  root = null;
};

// Lets React flush its passive effects and lets the hook's deferred releases
// (one microtask out) land before a snapshot is taken.
window.__settle = () => new Promise((r) => setTimeout(r, 30));
