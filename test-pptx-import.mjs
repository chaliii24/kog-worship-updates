import PptxGenJS from 'pptxgenjs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { pptxReadText, pptxExportImages } from './electron/pptxImport.js';

const out = path.join(os.tmpdir(), 'kog-import-test.pptx');
const tmp = path.join(os.tmpdir(), 'kog-import-test-extract');

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_16x9';

// 11 slides on purpose: slide10.xml must not sort before slide2.xml.
const titles = ['Opening', 'Welcome', 'Worship', 'Prayer', 'Offering', 'Sermon', 'Response', 'Communion', 'Benediction', 'Tenth Slide', 'Dismissal'];
titles.forEach((t, i) => {
  const s = pptx.addSlide();
  if (i === 0) {
    s.addText('Sunday Worship', { x: 0.5, y: 1.2, w: 9, h: 1.2, fontSize: 40, bold: true });
    s.addText('September 27, 2026', { x: 0.5, y: 2.6, w: 9, h: 0.7, fontSize: 20 });
  } else if (i === 1) {
    s.addText('Announcements', { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 32, bold: true });
    s.addText([
      { text: 'Youth night Friday 7pm', options: { bullet: true, breakLine: true } },
      { text: 'Bring a friend', options: { bullet: true } },
    ], { x: 0.7, y: 1.6, w: 8.5, h: 3, fontSize: 22 });
  } else {
    s.addText(t, { x: 0.5, y: 0.5, w: 9, h: 1, fontSize: 30, bold: true });
    s.addText('Body line for ' + t, { x: 0.7, y: 1.8, w: 8.5, h: 2, fontSize: 20 });
  }
});

await pptx.writeFile({ fileName: out });

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

console.log('--- text import (unzip + parse) ---');
const res = await pptxReadText(out, tmp);
console.log(JSON.stringify(res, null, 2).slice(0, 1400));

check('ok flag', res.ok === true, res.error);
check('11 slides', res.slides && res.slides.length === 11, 'got ' + (res.slides || []).length);
check('slide 1 title', res.slides?.[0]?.title === 'Sunday Worship', res.slides?.[0]?.title);
check('slide 1 subtitle became content', (res.slides?.[0]?.bullets || []).join(' | ').includes('September 27, 2026'), JSON.stringify(res.slides?.[0]?.bullets));
check('slide 2 title', res.slides?.[1]?.title === 'Announcements', res.slides?.[1]?.title);
check('slide 2 bullets', (res.slides?.[1]?.bullets || []).join(' | ').includes('Youth night Friday 7pm'), JSON.stringify(res.slides?.[1]?.bullets));
check('numeric order: slide10 is 10th', res.slides?.[9]?.title === 'Tenth Slide', res.slides?.[9]?.title);
check('numeric order: slide11 last', res.slides?.[10]?.title === 'Dismissal', res.slides?.[10]?.title);
check('no slide lost', res.slides?.every(s => s.title || (s.bullets || []).length), JSON.stringify(res.slides?.map(s => s.title)));

console.log('--- image export (needs PowerPoint installed) ---');
const imgDir = path.join(os.tmpdir(), 'kog-import-test-img');
const img = await pptxExportImages(out, imgDir);
console.log(JSON.stringify(img));
if (img.missing) console.log('  INFO  PowerPoint not installed here -> import falls back to text (expected path).');
else check('image mode produced 11 PNGs', (img.files || []).length === 11, 'got ' + (img.files || []).length);

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
try { fs.rmSync(imgDir, { recursive: true, force: true }); } catch {}
try { fs.rmSync(out, { force: true }); } catch {}

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
