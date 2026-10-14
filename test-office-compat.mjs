// Office-compat checks: PowerPoint + WPS (COM) + LibreOffice (headless).
// Runs with plain `node test-office-compat.mjs` — no Electron, no Office
// required. Anything needing a real suite asserts graceful degradation,
// never a throw.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import {
  COM_PROVIDERS, PRESENTATION_EXTENSIONS, isPresentationFile,
  findSofficeExe, listPngs,
} from './electron/officeProviders.js';
import { pptxExportImages, odpReadText } from './electron/pptxImport.js';
import { libreAvailable, libreShotFile, libreState } from './electron/libreBridge.js';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

console.log('--- provider registry ---');
check('COM chain has 3 entries', COM_PROVIDERS.length === 3, JSON.stringify(COM_PROVIDERS));
check('PowerPoint tried first', COM_PROVIDERS[0].progId === 'PowerPoint.Application');
check('WPS WPP.Application second', COM_PROVIDERS[1].id === 'wps' && COM_PROVIDERS[1].progId === 'WPP.Application');
check('WPS legacy KWPP alias third', COM_PROVIDERS[2].progId === 'KWPP.Application');
for (const ext of ['pptx', 'ppt', 'ppsx', 'pps', 'potx', 'odp', 'otp', 'dps']) {
  check('accepts .' + ext, PRESENTATION_EXTENSIONS.includes(ext));
}
check('isPresentationFile sermon.odp', isPresentationFile('C:\\deck\\sermon.odp') === true);
check('isPresentationFile deck.dps', isPresentationFile('deck.dps') === true);
check('rejects notes.txt', isPresentationFile('notes.txt') === false);

console.log('--- bridge scripts route all three suites ---');
const pptBridgeSrc = fs.readFileSync('./electron/pptBridge.js', 'utf8');
check('pptBridge tries PowerPoint.Application', pptBridgeSrc.includes('PowerPoint.Application'));
check('pptBridge tries WPP.Application', pptBridgeSrc.includes('WPP.Application'));
check('pptBridge tries KWPP.Application', pptBridgeSrc.includes('KWPP.Application'));
check('pptBridge reports noComApp', pptBridgeSrc.includes('noComApp'));
check('pptBridge reports provider', pptBridgeSrc.includes('provider = $prov'));
check('pptBridge COM handle is script-scoped (function-local $pp would silently null the app)',
  pptBridgeSrc.includes('$script:pp = New-Object'));
const mainSrc = fs.readFileSync('./electron/main.js', 'utf8');
check('main routes ppt-next to libre engine', mainSrc.includes('libreNext()'));
check('main routes ppt-shot to libre cache', mainSrc.includes('libreShotFile'));
check('main exposes office-providers', mainSrc.includes('office-providers'));
check('main import filter has odp', mainSrc.includes("'odp'"));
check('main import filter has dps', mainSrc.includes("'dps'"));
const sermonSrc = fs.readFileSync('./src/components/SermonPanel.jsx', 'utf8');
check('SermonPanel shows LibreOffice', sermonSrc.includes('LibreOffice'));
check('SermonPanel queries office-providers', sermonSrc.includes('office-providers'));
check('SermonPanel accepts .odp drops', sermonSrc.includes('odp'));

console.log('--- natural PNG sort (slide2 before slide10) ---');
const pngDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kog-pngsort-'));
for (const n of ['deck-1.png', 'deck-10.png', 'deck-2.png', 'deck-20.png', 'deck-3.png']) {
  fs.writeFileSync(path.join(pngDir, n), 'x');
}
const sorted = listPngs(pngDir).map((p) => path.basename(p));
check('natural order', JSON.stringify(sorted) === JSON.stringify(['deck-1.png', 'deck-2.png', 'deck-3.png', 'deck-10.png', 'deck-20.png']), sorted.join(','));
try { fs.rmSync(pngDir, { recursive: true, force: true }); } catch {}

console.log('--- COM chain degrades without suites ---');
const bogusDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kog-bogus-'));
const bogus = await pptxExportImages('C:\\nonexistent\\x.pptx', bogusDir, ['No.Such.ProgId']);
check('unknown ProgID -> missing (try next)', bogus.missing === true, JSON.stringify(bogus));
try { fs.rmSync(bogusDir, { recursive: true, force: true }); } catch {}

console.log('--- LibreOffice helpers degrade when absent ---');
let so = null;
try { so = libreAvailable(); } catch (e) { so = 'THREW'; }
check('libreAvailable never throws', so !== 'THREW', String(so));
check('libreShotFile empty when idle', libreShotFile(1) === null);
const st = await libreState();
check('libreState idle = not running', st && st.running === false, JSON.stringify(st));

console.log('--- synthetic .odp text import ---');
const runPs = (script) => new Promise((resolve) => {
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { timeout: 30000, windowsHide: true }, (err, stdout, stderr) => resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
});
const odpWork = fs.mkdtempSync(path.join(os.tmpdir(), 'kog-odp-'));
const contentXml = `<?xml version="1.0" encoding="UTF-8"?>` +
  `<office:document-content xmlns:office="u" xmlns:draw="u" xmlns:text="u">` +
  `<office:body><office:presentation>` +
  `<draw:page draw:name="page1"><draw:frame><draw:text-box>` +
  `<text:p><text:span>Grace Upon Grace</text:span></text:p>` +
  `<text:p>Amazing grace<text:line-break/>how sweet</text:p>` +
  `<text:p>Second verse here</text:p>` +
  `</draw:text-box></draw:frame></draw:page>` +
  `<draw:page draw:name="page2"><draw:frame><draw:text-box>` +
  `<text:p>Benediction</text:p>` +
  `</draw:text-box></draw:frame></draw:page>` +
  `</office:presentation></office:body></office:document-content>`;
fs.writeFileSync(path.join(odpWork, 'content.xml'), contentXml, 'utf8');
fs.writeFileSync(path.join(odpWork, 'mimetype'), 'application/vnd.oasis.opendocument.presentation', 'utf8');
const q = (p) => "'" + String(p).replace(/'/g, "''") + "'";
const zip = await runPs(`Compress-Archive -Path ${q(path.join(odpWork, '*'))} -DestinationPath ${q(path.join(odpWork, 'deck.zip'))} -Force; Write-Output ok`);
let odpRes = null;
if (zip.ok) {
  const odpFile = path.join(odpWork, 'deck.odp');
  fs.renameSync(path.join(odpWork, 'deck.zip'), odpFile);
  odpRes = await odpReadText(odpFile, path.join(odpWork, 'extract'));
}
check('odp reads 2 slides', odpRes && odpRes.ok && odpRes.slides.length === 2, JSON.stringify(odpRes));
check('odp slide1 title', odpRes?.slides?.[0]?.title === 'Grace Upon Grace', odpRes?.slides?.[0]?.title);
check('odp line-break flattens to space', (odpRes?.slides?.[0]?.bullets || []).join(' | ').includes('Amazing grace how sweet'), JSON.stringify(odpRes?.slides?.[0]?.bullets));
check('odp slide2 title-only', odpRes?.slides?.[1]?.title === 'Benediction' && (odpRes?.slides?.[1]?.bullets || []).length === 0, JSON.stringify(odpRes?.slides?.[1]));
try { fs.rmSync(odpWork, { recursive: true, force: true }); } catch {}

console.log('--- soffice discovery degrades ---');
let found = 'THREW';
try { found = findSofficeExe(); } catch { found = 'THREW'; }
check('findSofficeExe never throws', found !== 'THREW');

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
