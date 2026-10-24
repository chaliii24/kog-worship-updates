// Test entry point for test-title-card-ui.mjs.
//
// Electron has no per-process userData switch on Windows (app.setPath in the
// real main.js wins), so point appData at a throwaway folder BEFORE requiring
// the real main module. main.js derives userData from appData, which keeps the
// test away from the operator's real library.
const { app } = require('electron');
const path = require('node:path');
const os = require('node:os');

app.setPath('appData', process.env.KOG_TEST_APPDATA || path.join(os.tmpdir(), 'kog-title-card-test'));
require('../electron/main.js');
