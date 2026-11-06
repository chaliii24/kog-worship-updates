import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
// The projector's OWN face registry. MiniSlide renders the wall's real
// ProjectorDisplay, so lyric/title/deck text must resolve the same bundled
// faces here instead of falling back to the phone's system font.
import '../fonts.css';
import MobileApp from './MobileApp.jsx';

createRoot(document.getElementById('root')).render(<MobileApp />);
