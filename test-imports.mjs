// Import/export consistency for Electron main-process modules.
//
// `npm run dev` boots electron/main.js in raw Node ESM: a named import with
// no matching export kills the app before any window exists (the
// libreImportImages outage). Vite only proves the renderer graph, so this
// test proves the main-process one: every relative named import must resolve
// to a real export. Pure regex over source — no Electron runtime needed.
import fs from 'fs';
import path from 'path';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

const DIR = './electron';
const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));
check('electron modules found', files.length > 0, String(files.length));

// Collect exports per file: `export const|function|async function|class NAME`
// and `export { a, b }` / `export { a as b }`.
const exportsOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      const name = (bits[1] || bits[0] || '').trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) out.add(name);
    }
  }
  return out;
};

const cache = new Map();
const getExports = (abs) => {
  if (!cache.has(abs)) {
    let src = '';
    try { src = fs.readFileSync(abs, 'utf8'); } catch {}
    cache.set(abs, exportsOf(src));
  }
  return cache.get(abs);
};

let checked = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  // import { a, b as c } from './x.js'  (+ side-effect imports ignored)
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.[^'"]*)['"]/g)) {
    let target = m[2];
    if (!target.endsWith('.js')) target += '.js';
    const abs = path.normalize(path.join(DIR, target));
    const names = m[1].split(',').map((p) => {
      const bits = p.trim().split(/\s+as\s+/);
      return (bits[0] || '').trim();
    }).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
    if (!fs.existsSync(abs)) {
      check(`${f} -> ${target} exists`, false, 'missing file');
      continue;
    }
    const available = getExports(abs);
    for (const n of names) {
      checked += 1;
      check(`${f} imports {${n}} from ${target}`, available.has(n), `exports: ${[...available].slice(0, 8).join(',')}${available.size > 8 ? '…' : ''}`);
    }
  }
}
check('import edges checked', checked > 10, String(checked));

// Renderer files imported by main-process modules must exist too
// (songParse.js precedent) — existence only, bundling is vite's job.
for (const f of files) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  for (const m of src.matchAll(/from\s*['"]((?:\.\.\/)+[^'"]+)['"]/g)) {
    const abs = path.normalize(path.join(DIR, m[1]));
    check(`${f} reaches ${m[1]}`, fs.existsSync(abs));
  }
}

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
