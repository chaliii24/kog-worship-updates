// CCLI usage-report logic tests — raw Node, no Electron/DB needed.
//
// ccliReport.js is deliberately pure (no imports), so the counting rules a
// church depends on for licensing compliance are provable here:
//   * a song counts ONCE per service even if the plan lists it twice,
//   * medley constituent songs each count once for that service,
//   * arrangements sharing one CCLI number merge into a single line,
//   * songs with no number are flagged, never silently dropped,
//   * CSV output survives commas/quotes in titles.
import { extractCcli, extractCcliFromCues, itemSongIds, buildUsageReport, reportToCsv } from './electron/ccliReport.js';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

// --- extractCcli -----------------------------------------------------------
check('extractCcli: "CCLI #7116401"', extractCcli('Some line\nCCLI #7116401') === '7116401');
check('extractCcli: "CCLI 7116401"', extractCcli('CCLI 7116401') === '7116401');
check('extractCcli: lowercase + colon "ccli#: 7116401"', extractCcli('ccli#: 7116401') === '7116401');
check('extractCcli: SongSelect form "CCLI Song # 7116401"', extractCcli('CCLI Song # 7116401') === '7116401');
check('extractCcli: legacy 4-digit number', extractCcli('CCLI #2257') === '2257');
check('extractCcli: no number -> null', extractCcli('CCLI') === null);
check('extractCcli: digits without keyword -> null', extractCcli('Verse 3 of 7116401 stories') === null);
check('extractCcli: empty/null -> null', extractCcli('') === null && extractCcli(null) === null);
check('extractCcli: first match wins', extractCcli('CCLI #1111111 then CCLI #2222222') === '1111111');

// --- extractCcliFromCues --------------------------------------------------
check('extractCcliFromCues: finds it in the third cue', extractCcliFromCues([
  { text: 'Way Maker' }, { text: 'Verse 1' }, { text: 'Chorus\nCCLI #7116401' },
]) === '7116401');
check('extractCcliFromCues: no cues -> null', extractCcliFromCues([]) === null);
check('extractCcliFromCues: null cues -> null', extractCcliFromCues(null) === null);

// --- itemSongIds ----------------------------------------------------------
check('itemSongIds: plain song id', JSON.stringify(itemSongIds({ item_type: 'song', content: '42' })) === '[42]');
check('itemSongIds: legacy float string "42.0"', JSON.stringify(itemSongIds({ item_type: 'song', content: '42.0' })) === '[42]');
check('itemSongIds: medley expands anchor+links', JSON.stringify(itemSongIds({
  item_type: 'song', content: JSON.stringify({ anchor: { songId: 1 }, links: [{ songId: 2 }, { songId: 3 }] }),
})) === '[1,2,3]');
check('itemSongIds: medley with no links -> anchor only', JSON.stringify(itemSongIds({
  item_type: 'song', content: JSON.stringify({ anchor: { songId: 7 }, links: [] }),
})) === '[7]');
check('itemSongIds: non-song item -> []', itemSongIds({ item_type: 'media', content: '1' }).length === 0);
check('itemSongIds: empty content -> []', itemSongIds({ item_type: 'song', content: '' }).length === 0);
check('itemSongIds: broken JSON -> [] (never throws)', itemSongIds({ item_type: 'song', content: '{anchor' }).length === 0);
check('itemSongIds: null item -> [] (never throws)', itemSongIds(null).length === 0);
check('itemSongIds: medley with string ids normalizes', JSON.stringify(itemSongIds({
  item_type: 'song', content: JSON.stringify({ anchor: { songId: '9' }, links: [] }),
})) === '[9]');

// --- buildUsageReport -----------------------------------------------------
const songs = new Map([
  [1, { id: 1, title: 'Way Maker', ccli: '7116401' }],
  [2, { id: 2, title: 'Way Maker (Key of D)', ccli: '7116401' }], // same number!
  [3, { id: 3, title: 'Goodness of God', ccli: '8356911' }],
  [4, { id: 4, title: 'Amazing Grace', ccli: null }],             // public domain
  [5, { id: 5, title: 'Deleted Song', ccli: null }],              // missing from plans
]);

// Service A: sang Way Maker twice (twice in plan) + Goodness of God
const svcA = {
  id: 10, name: 'Sunday Service', date: '2026-03-01',
  items: [
    { item_type: 'song', content: '1' },
    { item_type: 'song', content: '1' }, // duplicate in plan
    { item_type: 'song', content: '3' },
    { item_type: 'section_header', content: '' },
  ],
};
// Service B: medley of Way Maker(D arrangement) + Goodness, plus Amazing Grace
const svcB = {
  id: 11, name: 'Sunday Service', date: '2026-03-08',
  items: [
    { item_type: 'song', content: JSON.stringify({ anchor: { songId: 2 }, links: [{ songId: 3 }] }) },
    { item_type: 'song', content: '4' },
  ],
};
// Service C: nothing song-shaped at all
const svcC = { id: 12, name: 'Prayer Night', date: '2026-03-15', items: [{ item_type: 'custom_slide', content: 'hello' }] };

const report = buildUsageReport([svcA, svcB, svcC], songs);
const rowFor = (num) => report.rows.find((r) => r.ccli === num);

const wm = rowFor('7116401');
check('report: both arrangements merged into ONE row', report.rows.filter((r) => r.ccli === '7116401').length === 1, JSON.stringify(report.rows));
check('report: merged row shows both titles', !!wm && wm.title === 'Way Maker · Way Maker (Key of D)', wm && wm.title);
check('report: sung twice in one plan counts ONCE for that service', !!wm && wm.services.filter((s) => s.id === 10).length === 1 && wm.times === 2, wm && JSON.stringify(wm.services));
check('report: medley constituent counts for the medley service', !!wm && wm.services.some((s) => s.id === 11));

const god = rowFor('8356911');
check('report: medley + standalone same service = one use', !!god && god.times === 2 && god.services.length === 2, god && JSON.stringify(god.services));

check('report: no-number song lands in missing, not rows', report.missing.length === 1 && report.missing[0].title === 'Amazing Grace', JSON.stringify(report.missing));
check('report: missing carries its times', report.missing[0].times === 1);
check('report: rows sorted by times desc', report.rows[0].times >= report.rows[1].times, JSON.stringify(report.rows.map((r) => r.times)));
check('report: empty range -> empty report', buildUsageReport([], songs).rows.length === 0);
check('report: undated service counted, not matched', buildUsageReport([{ id: 9, name: 'x', date: '', items: [{ item_type: 'song', content: '1' }] }], songs).undated === 1);
check('report: deleted song id in plan does not throw', buildUsageReport([{ id: 1, name: 'x', date: '2026-01-01', items: [{ item_type: 'song', content: '999' }] }], songs).missing.length === 1);
check('report: null songsById never throws; unresolvable ids flagged as missing', (() => {
  const r = buildUsageReport([svcA], null); // every lookup null -> all flagged
  return r.missing.length > 0 && r.missing.every((m) => m.title === '(song deleted from library)');
})());

// --- reportToCsv ----------------------------------------------------------
const csv = reportToCsv(report, [{ title: 'Recessional Hymn', ccli: '1234', times: 2 }]);
check('csv: header row exact', csv.split('\n')[0] === 'Song,CCLI Song #,Times Used');
check('csv: contains both report rows', csv.includes('Way Maker · Way Maker (Key of D),7116401,2') && csv.includes('Goodness of God,8356911,2'));
check('csv: missing-number song present with blank number', csv.includes('Amazing Grace,,1'));
check('csv: manual row appended with marker + count', csv.includes('Recessional Hymn (manual),1234,2'));
check('csv: quotes commas in titles', reportToCsv({ rows: [{ key: 'x', ccli: '1', title: 'How Great, Is Our God', times: 1, services: [] }], missing: [] }).includes('"How Great, Is Our God",1,1'));
check('csv: quotes embedded quotes', reportToCsv({ rows: [{ key: 'x', ccli: '1', title: 'He "Is" Good', times: 1, services: [] }], missing: [] }).includes('"He ""Is"" Good"'));
check('csv: null report -> header only', reportToCsv(null) === 'Song,CCLI Song #,Times Used');

console.log('');
if (fails.length) { console.log(`${fails.length} FAILED: ${fails.join(' | ')}`); process.exit(1); }
console.log('All CCLI report tests passed.');
