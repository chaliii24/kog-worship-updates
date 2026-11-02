import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import { getTheme } from './lib/theme.js';
import StageScreen from './mobile/screens/StageScreen.jsx';

const params = new URLSearchParams(window.location.search);
const C = getTheme(true).C;

const songTitle = params.get('title') || 'Great Are You Lord';
const state = {
  // A real loaded song is what arms the BPM readout now, exactly like the live
  // build. `?nosong` keeps the empty first-launch view available for checks.
  song: { id: 1, title: songTitle },
  stage: {
    current: { title: songTitle, text: 'x', label: '' },
    cfg: { bpm: 92, timeSignature: 4 },
  },
  metronome: { bpm: Number(params.get('bpm') || 92), timeSignature: Number(params.get('meter') || 4) },
};

createRoot(document.getElementById('root')).render(
  <StageScreen C={C} state={params.get('nosong') ? {} : state} status="online" onSwitchRole={() => {}} lockedRole="drummer" />
);
