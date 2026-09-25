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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)