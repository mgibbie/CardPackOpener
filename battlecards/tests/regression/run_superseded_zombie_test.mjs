// run_superseded_zombie_test.mjs — bug review 2026-10-26 (instinctgauntlet, keys
// bug:1792680487901 / bug:1792680590459). Run 12 ended ("Run recorded"), the page reloaded,
// and an OLD run — run 11 at 0W/2L, a mid-fight snapshot from 7:05 AM — came back as the
// active run. Everything this browser had stored stopped at 7:05 (replays, ended-runs list,
// the run): it lost every write after that. The server's slot held `{ended: <run 12>}`,
// which names only the LAST finished run, so the boot's zombie check (serverEndedRun:
// "the server ended THIS run") could not see that run 11 was older still, and kept it.
// serverSupersededRun: the slot's ended marker is NEWER than the local copy's last write
// -> the local run is an older run's zombie; the boot stashes it (never deletes) and offers
// a new run instead.
import fs from 'fs';
import { serverSupersededRun, serverEndedRun } from '../../runsync.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const T = h => Date.UTC(2026, 9, 22, h);   // hours, 10/22 (UTC stand-in for the tester's clock)
const run11 = { active: true, characterId: 'Sorin', runId: 'rmvje9oysm9f0uz', wins: 0, losses: 2, rev: 112, updatedAt: T(11) + 5 * 60e3, snapshotAt: T(11) + 5 * 60e3, snapshot: { turnNumber: 1 } };
const run12Ended = { ended: 'rmvrun12gideon', updated_at: T(14) + 45 * 60e3 };

ok('the reported case: a stale run 11 under a newer "run 12 ended" marker is a zombie', serverSupersededRun(run11, run12Ended) === true);
ok('...which the old check (same-run only) could not see', serverEndedRun(run11, run12Ended) === false);
ok('the SAME run ended: left to serverEndedRun', serverSupersededRun({ ...run11, runId: 'rmvrun12gideon' }, run12Ended) === false);
ok('a run started AFTER the marker (e.g. offline) is kept', serverSupersededRun({ ...run11, updatedAt: T(15), snapshotAt: T(15) }, run12Ended) === false);
ok('a live server run (not an ended marker) is left to pickCanonicalRun', serverSupersededRun(run11, { run: { runId: 'x', active: true }, updated_at: T(15) }) === false);
ok('a marker with no stamp decides nothing', serverSupersededRun(run11, { ended: 'rmvrun12gideon' }) === false);
ok('a local copy with no stamp decides nothing (legacy saves)', serverSupersededRun({ active: true, characterId: 'Sorin', wins: 0, losses: 2 }, run12Ended) === false);
ok('an inactive local copy is not a live zombie', serverSupersededRun({ ...run11, active: false }, run12Ended) === false);
ok('no local copy: nothing to do', serverSupersededRun(null, run12Ended) === false);

// the boot uses it: hydrateRunsFromServer puts the zombie away (stashed via endLocalRunCopy)
const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
const hyd = /async function hydrateRunsFromServer\(\) \{[\s\S]*?\n\}/.exec(src);
ok('hydrateRunsFromServer checks serverSupersededRun', !!hyd && /serverSupersededRun\(safeLoad\(key, null\), entry\)\) \{ endLocalRunCopy\(/.test(hyd[0]));

// and run writes never fail silently: the run savers retry after evicting replays and say so
ok('run saves go through safeSaveRetry + a visible warning', /const saverFor = key => run => \{ const ok = safeSaveRetry\(key, stampRun\(run\), freeSpaceForSnapshot\); if \(!ok\) runSaveFailed\(key\);/.test(src));
ok('a failed mid-fight snapshot write warns too', /if \(!safeSaveRetry\(io\.key, run, freeSpaceForSnapshot\)\) runSaveFailed\(io\.key\);/.test(src));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
