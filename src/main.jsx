import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import './index.css'
import App from './App.jsx'
import { installVideoGuard } from './lib/perf'

// Pause off-screen autoplaying videos (media grids, cue thumbnails, editor
// previews) so only what's actually visible is being decoded. Huge CPU saver
// on low-end machines; invisible to the user.
installVideoGuard()

// Second line of defence for the console's scale. The MAIN process owns it
// (electron/uiScale.js → setZoomFactor in the window fit); this only forbids
// the page from ever going ABOVE 100%, which is what "the app looks zoomed
// in" was. Level 0 == factor 1.0; -4 leaves room for the 0.55 fit floor on a
// small panel. Deliberately NOT setZoomFactor(1) — that would overrule the
// laptop's 0.80 fit and clip it.
if (window.require) {
  try {
    const { webFrame } = window.require('electron')
    webFrame.setVisualZoomLevelLimits(1, 1)
    webFrame.setLayoutZoomLevelLimits(-4, 0)
  } catch { /* browser dev without Electron — nothing to lock */ }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)