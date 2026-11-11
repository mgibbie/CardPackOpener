// run_fight_identity_test.mjs — a run's mid-fight snapshot belongs to ONE fight.
//
// instinctgauntlet, Middle-earth run rmw5py6mqpfdl85 (2026-11-07): "Continue the run" restored a
// fight-1 board vs Shagrat (turn 5, 5 life) while the run said 0 wins / 2 losses, next foe Tom, Bert
// & William. The run's ONE snapshot field had been written back by a tab still holding the old F1
// board (three tabs were open on ?middleearth=1; every tab saves its board on visibilitychange /
// pagehide), and every resume re-stamped it fresh. Playing it out would have recorded F1's result
// onto the current fight. Now:
//   - each fight boot mints run.fightId; a snapshot write records snapshotFight + snapshotProgress
//   - a tab may write only while the run still names ITS fight (maySaveSnapshot)
//   - a resume restores only a board of the run's current fight (snapshotForCurrentFight); older,
//     untagged boards are judged by their content (seat 1 must be the run's enemy)
import { maySaveSnapshot, snapshotForCurrentFight } from '../../runsync.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const board = (me, foe, turn = 5) => ({ schemaVersion: 1, turnNumber: turn, classPicks: [{ id: 'priest', name: me }, { id: 'rogue', name: foe }], players: [] });

// ===== the reported save, exactly as it was (untagged: written before fight ids existed) =====
const reported = { active: true, runId: 'rmw5py6mqpfdl85', rev: 124, characterId: 'Samwise Gamgee', wins: 0, losses: 2,
	enemy: { id: 'tbw', name: 'Tom, Bert & William' }, snapshot: board('Samwise Gamgee', 'Shagrat'), snapshotAt: 1794018978000 };
{ const v = snapshotForCurrentFight(reported);
  ok('the reported F1-vs-Shagrat board is NOT restored into the F3 run', v.ok === false, JSON.stringify(v));
  ok('...because its foe is not the run\'s enemy', v.reason === 'other-enemy', v.reason); }
ok('a board against the run\'s own enemy (untagged) still resumes',
	snapshotForCurrentFight({ ...reported, snapshot: board('Samwise Gamgee', 'Tom, Bert & William') }).ok === true);

// ===== tagged boards =====
const run = { active: true, runId: 'r1', characterId: 'Frodo', wins: 3, losses: 1, enemy: { name: 'Gollum' }, fightId: 'fB',
	snapshot: board('Frodo', 'Gollum'), snapshotFight: 'fB', snapshotProgress: 4 };
ok('a board of the current fight resumes (frame-exact resume untouched)', snapshotForCurrentFight(run).ok === true);
ok('a board tagged with an older fight is refused', snapshotForCurrentFight({ ...run, snapshotFight: 'fA' }).reason === 'other-fight');
ok('a board saved at another point of the run (progress) is refused', snapshotForCurrentFight({ ...run, snapshotProgress: 3 }).reason === 'other-progress');
ok('a run with no snapshot has nothing to resume', snapshotForCurrentFight({ ...run, snapshot: undefined }).ok === false);
// modes whose seats are not "character vs enemy name" (dungeon/heist/tombs/duels/arena) are never judged by names
ok('a class-seat mode (no characterId) is not judged by seat names',
	snapshotForCurrentFight({ active: true, runId: 'd', level: 3, bossId: 'x', snapshot: board('Mage', 'Some Boss') }).ok === true);

// ===== who may write =====
ok('the tab playing the run\'s fight may save', maySaveSnapshot(run, 'fB') === true);
ok('a stale tab (the run moved on to another fight) may NOT save', maySaveSnapshot(run, 'fA') === false);
ok('a stale tab may not save after the fight\'s result cleared fightId', maySaveSnapshot({ ...run, fightId: undefined }, 'fB') === false);
ok('nothing is saved into an inactive run', maySaveSnapshot({ ...run, active: false }, 'fB') === false);
ok('a tab that never bound a fight keeps the old behaviour', maySaveSnapshot(run, null) === true);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
