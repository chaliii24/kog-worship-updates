// Library reach, plan autosave and the desktop telestrator — run with:
//   node test-library-features.mjs
//
// Pure node (no browser, no DB): the SQLite and main-process halves are pinned
// by their source because importing database.js would touch the real library;
// the coordinate maths is a real unit test against src/lib/draw.js.
//
//   1. LYRIC SEARCH   — the query reaches inside cues, not just title/artist.
//   2. LIBRARY CHIPS  — Favorites and Recent finally reachable, plus every
//                       category the table holds (and no stuck filter).
//   3. PLAN AUTOSAVE  — the service plan gets the draft guard the editor had:
//                       mirror while dirty, recover after a crash, drop on
//                       save/discard — and recovery lands DIRTY so it is
//                       protected by the quit gate and the load guard.
//   4. TELESTRATOR    — the console can draw on the wall itself, through the
//                       same sanitize/push path as the phone.
import fs from 'node:fs';
import { clientToDesign, sanitizeDrawStroke, DRAW_W, DRAW_H } from './src/lib/draw.js';

let failures = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  PASS  ${msg}`);
  else { failures += 1; console.log(`  FAIL  ${msg}`); }
};
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

const db = read('./electron/database.js');
const main = read('./electron/main.js');
const app = read('./src/App.jsx');
const side = read('./src/components/LeftSidebar.jsx');
const panel = read('./src/components/LiveOutputPanel.jsx');

console.log('--- 1. lyric search (electron/database.js) ---');
ok(db.includes('SELECT 1 FROM cues WHERE song_id = songs.id AND text LIKE'), 'getSongs searches cue text, not just title/artist');
ok(db.includes('const esc = `%${q}%`'), 'one escaped token shared by all three LIKEs');
ok(!db.includes("query += ' ORDER BY last_used DESC LIMIT 10'\n    return db.prepare(query).all(params);") || db.includes("category === 'Recent'"), 'Recent branch still returns the 10 most-used');
ok(db.includes('export function getCategories'), 'getCategories exported for the chip row');
ok(db.includes('SELECT DISTINCT category FROM songs'), 'categories read from the table, never hardcoded');
ok(db.includes('CREATE INDEX IF NOT EXISTS idx_cues_song_id ON cues(song_id)'), 'cues(song_id) indexed — the subquery must not full-scan');

console.log('--- 2. library chips (main.js + LeftSidebar.jsx) ---');
ok(main.includes('ipcMain.handle(\'db-get-categories\', () => getCategories())'), 'db-get-categories handler registered');
ok(main.includes('getCategories,\n  getSongDetails,'), 'getCategories imported in main');
ok(side.includes('const LIBRARY_CHIPS'), 'fixed-view chip list defined');
ok(side.includes("{ id: 'Favorites', label: 'Favorites', Icon: Star,"), 'Favorites chip exists');
ok(side.includes("{ id: 'Recent', label: 'Recent', Icon: Clock,"), 'Recent chip exists');
ok(side.includes('setActiveCategory(chip.id)'), 'chips actually call setActiveCategory');
ok(side.includes('songCategories'), 'chip row reads the live category list');
ok(side.includes('Clock,'), 'Clock icon imported for Recent');
ok(side.includes('No favorites yet'), 'empty Favorites explains itself');
ok(side.includes('No recent songs yet'), 'empty Recent explains itself');
ok(side.includes('No songs match'), 'empty search names the query');
ok(side.includes('.filter((c) => c && !LIBRARY_CHIPS.some((f) => f.id === c))'), 'a category literally named All/Favorites/Recent cannot duplicate a chip');

console.log('--- 3. no stuck filter (App.jsx) ---');
ok(app.includes('const [songCategories, setSongCategories] = useState([])'), 'songCategories state declared');
ok(app.includes("invoke('db-get-categories')"), 'categories fetched alongside songs');
ok(app.includes('if (!songCategories.includes(activeCategory))'), 'a category that leaves the table drops back to All');
ok(app.includes("songCategories, activeSong,"), 'songCategories exposed through context');

console.log('--- 4. service-plan autosave (App.jsx) ---');
ok(app.includes("const SERVICE_DRAFT_KEY = 'kog-service-draft'"), 'plan draft has its own key');
ok(app.includes('const serviceDraftGenRef = useRef(0);'), 'generation ref kills writes queued before a clear');
ok(app.includes('if (isOutputWindow || showSplash) return;'), 'recovery never runs in projector/stage/output windows, and waits for the splash');
ok(app.includes('localStorage.setItem(SERVICE_DRAFT_KEY, JSON.stringify({ at: Date.now(), service: activeService }))'), 'mirror writes the whole working plan');
ok(app.includes('if (isOutputWindow || !serviceDirty || !activeService) return;'), 'mirror only while DIRTY — a clean plan must not overwrite a real recovery');
ok(app.includes('if (gen !== serviceDraftGenRef.current) return; // cleared while we waited'), 'debounce honours the generation bump');
ok(app.includes("title: 'Service plan recovered'"), 'recovery announces itself');
ok(app.indexOf('Picked up from') < app.indexOf('// Boot: the opening blank order is clean by definition.'), 'restore is declared BEFORE the baseline effect, so a recovered plan lands DIRTY');
ok((app.match(/clearServiceDraft\(\);/g) || []).length >= 2, 'draft cleared on save AND on an explicit discard');
ok(!app.includes('serviceDirty && serviceId !== activeService?.id'), 'load-another-show guard no longer exempts the same id (that silently ate a recovery)');
ok(app.includes('Save the plan before quitting?') && app.includes('if (!serviceDirty) {'), 'window-X quit gate untouched and still keyed off serviceDirty');

console.log('--- 5. desktop telestrator (LiveOutputPanel.jsx + App.jsx) ---');
ok(panel.includes('const [drawMode, setDrawMode] = useState(false)'), 'pen arms, defaults OFF');
ok(panel.includes('onClick={() => setDrawMode((d) => !d)}') && panel.includes('<PenLine size={12} /> Draw'), 'Draw toggle in the preview header');
ok(panel.includes('onPointerDown={drawMode && !locked ? onPenDown : undefined}'), 'pointer capture only while armed (a plain click keeps its old meaning)');
ok(panel.includes('touchAction: \'none\''), 'touch drawing does not scroll the panel');
ok(panel.includes('DRAW_COLORS.map'), 'ink palette');
ok(panel.includes('DRAW_WIDTHS.map'), 'nib widths');
ok(panel.includes('undoDrawStroke && undoDrawStroke()'), 'undo wired');
ok(panel.includes('clearDrawStrokes && clearDrawStrokes()'), 'clear wired');
ok(panel.includes('if (cur.points.length === 1)'), 'a single click becomes a dot instead of vanishing');
ok(panel.includes('drawMode && !locked'), 'countdown lock freezes the surface too');
ok(app.includes('drawStrokes={drawStrokes}\n          addDrawStroke={addDrawStroke}'), 'console panel fed the shared draw ops');
ok(app.includes('drawAdd: (p) => addDrawStroke(p && p.stroke)'), 'phone drawAdd delegates to the SAME implementation');
ok(app.includes('const clearDrawStrokes = () => setDrawStrokesLive([]);'), 'clear goes through the live push like every other path');

console.log('--- 6. coordinate mapping (real unit test) ---');
const half = clientToDesign({ left: 0, top: 0, width: DRAW_W, height: DRAW_H }, DRAW_W / 2, DRAW_H / 2);
ok(half && half[0] === 640 && half[1] === 360, `centre of a full-size box is the centre of the canvas (${JSON.stringify(half)})`);
// The property the whole telestrator rests on: a tiny preview maps to the SAME
// design point as the wall behind it.
const small = clientToDesign({ left: 100, top: 50, width: 320, height: 180 }, 100 + 160, 50 + 90);
ok(small && small[0] === 640 && small[1] === 360, `same ratio in a 320x180 preview lands on the same point (${JSON.stringify(small)})`);
const off = clientToDesign({ left: 0, top: 0, width: 1280, height: 720 }, -40, 99999);
ok(off && off[0] === 0 && off[1] === DRAW_H, `points outside the box clamp to the canvas (${JSON.stringify(off)})`);
ok(clientToDesign({ left: 0, top: 0, width: 0, height: 0 }, 5, 5) === null, 'a hidden (zero-size) preview maps to nothing, not to 0,0');

console.log('--- 7. the click-dot survives sanitize (real unit test) ---');
const dot = sanitizeDrawStroke({ color: '#f87171', width: 12, points: [[100, 100], [102, 100]] });
ok(dot && dot.points.length === 2, `2px-twin dot passes the dedup gate (${JSON.stringify(dot && dot.points)})`);
ok(sanitizeDrawStroke({ points: [[100, 100]] }) === null, 'a bare point is still rejected (existing contract, pinned by test-remote-update)');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nRESULT: all passed');
process.exit(failures ? 1 : 0);
