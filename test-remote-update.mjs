// Updater + draw-mode unit checks. Plain node, no Electron.
import fs from 'fs';
import { parseVersion, semverGt } from './electron/versionCompare.js';
import { sanitizeDrawStroke, pushDrawStroke, strokeToPath } from './src/lib/draw.js';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

console.log('--- updater version compare ---');
check('newer patch is available', semverGt('1.1.30', '1.1.29') === true);
check('newer minor is available', semverGt('1.2.0', '1.1.29') === true);
check('newer major is available', semverGt('2.0.0', '1.1.29') === true);
check('same version is NOT available', semverGt('1.1.29', '1.1.29') === false);
check('older remote is NOT available', semverGt('1.1.28', '1.1.29') === false);
check('older major is NOT available', semverGt('0.9.9', '1.1.29') === false);
check('two-part versions compare', semverGt('1.10', '1.9') === true);
check('release beats prerelease', semverGt('1.1.29', '1.1.29-beta') === true);
check('prerelease is not newer than release', semverGt('1.1.29-beta', '1.1.29') === false);
check('garbage never offers', semverGt('latest', '1.1.29') === false && semverGt('1.1.29', '') === false);
check('v-prefix tolerated', semverGt('v1.1.30', 'v1.1.29') === true);
check('parseVersion parts', JSON.stringify(parseVersion('1.2.3').nums) === '[1,2,3]');

console.log('--- updater wiring ---');
const mainSrc = fs.readFileSync('./electron/main.js', 'utf8');
check('main gates check on semverGt', mainSrc.includes('semverGt(remote, current)'));
check('main returns isAvailable', mainSrc.includes('isAvailable'));
check('main fans out render-live-draw', mainSrc.includes("sendToOutput(win, 'render-live-draw', lastLiveDraw)"));
check('get-live-state carries draw', mainSrc.includes('draw: lastLiveDraw'));
const appSrc = fs.readFileSync('./src/App.jsx', 'utf8');
check('renderer honors isAvailable', appSrc.includes('result.isAvailable'));
check('up-to-date names the version', appSrc.includes('is the latest'));
check('draw state exists', appSrc.includes('const [drawStrokes, setDrawStrokes]'));
check('bible remote state exists', appSrc.includes('const [bibleRemote, setBibleRemote]'));
check('snapshot carries draw', appSrc.includes('draw: drawStrokes.length'));
check('snapshot carries bible', appSrc.includes('bible: bibleRemote || null'));
for (const cmd of ['bibleCatalog', 'bibleBooks', 'bibleChapter', 'bibleSearch', 'bibleGo', 'bibleFire', 'drawAdd', 'drawUndo', 'drawClear']) {
  check(`command ${cmd} registered`, appSrc.includes(`${cmd}:`));
}
check('outputs listen render-live-draw', (appSrc.match(/\.on\('render-live-draw'/g) || []).length >= 2);
check('projector renders DrawOverlay', fs.readFileSync('./src/components/ProjectorDisplay.jsx', 'utf8').includes("from './DrawOverlay.jsx'"));
check('monitor mini renders DrawOverlay', appSrc.includes('<DrawOverlay strokes={drawStrokes}'));
check('clear-all kills drawings', appSrc.includes('setDrawStrokesLive([])'));

console.log('--- mobile wiring ---');
const ctl = fs.readFileSync('./src/mobile/screens/ControlScreen.jsx', 'utf8');
for (const t of ['bible', 'draw']) check(`tab ${t} in flow`, ctl.includes(`'${t}'`));
check('BibleScreen rendered', ctl.includes('<BibleScreen'));
check('DrawScreen rendered', ctl.includes('<DrawScreen'));
check('minis echo draw', ctl.includes('draw={state?.draw?.strokes'));
check('BibleScreen fires verses', fs.readFileSync('./src/mobile/screens/BibleScreen.jsx', 'utf8').includes("send('bibleFire'"));
check('DrawScreen sends strokes', fs.readFileSync('./src/mobile/screens/DrawScreen.jsx', 'utf8').includes("send('drawAdd'"));

console.log('--- draw lib ---');
const bad = sanitizeDrawStroke({ color: 'red', width: 999, points: [[5, 5]] });
check('single point rejected', bad === null);
const good = sanitizeDrawStroke({ id: 'a1', color: '#60a5fa', width: 12, points: [[0, 0], [10, 10], [2000, -50], [20, 20]] });
check('clamps + keeps id/color', good && good.id === 'a1' && good.color === '#60a5fa' && good.points[2][0] === 1280 && good.points[2][1] === 0, JSON.stringify(good));
check('bad color defaults', sanitizeDrawStroke({ points: [[0, 0], [4, 4]] }).color === '#f87171');
const capped = pushDrawStroke(new Array(25).fill(null).map((_, i) => ({ id: `s${i}`, color: '#fff', width: 6, points: [[i, i], [i + 1, i + 1]] })), { id: 'new', color: '#fff', width: 6, points: [[0, 0], [1, 1]] });
check('stroke cap keeps newest 20', capped.length === 20 && capped[19].id === 'new' && capped[0].id === 's6', `${capped.length} ${capped[0].id}`);
check('path builder', strokeToPath([[0, 0], [10, 20]]) === 'M0 0 L10 20');

console.log('--- bible load speed guards ---');
const mainSrc2 = fs.readFileSync('./electron/main.js', 'utf8');
check('catalog fetch capped at 8s', mainSrc2.includes('AbortSignal.timeout(8000)'));
check('no 30s catalog hang', !mainSrc2.includes('AbortSignal.timeout(30000)'));
check('size HEAD capped at 5s', mainSrc2.includes('AbortSignal.timeout(5000)'));
check('list returns on a 1.2s size budget', mainSrc2.includes('setTimeout(r, 1200)'));
check('instant sync catalog for lookups', mainSrc2.includes('function getBibleCatalogSync()'));
check('findBibleEntry never awaits network', mainSrc2.includes('const catalog = getBibleCatalogSync()'));
check('concurrent catalog fetches shared', mainSrc2.includes('catalogFlight'));

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
