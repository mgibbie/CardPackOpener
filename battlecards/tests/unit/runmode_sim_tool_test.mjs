// runmode_sim_tool_test.mjs — tools/runmode-sim.mjs stays runnable, reproducible and faithful.
// The simulator drove the 2026-10-13 Lorequest balance passes (#686-#692) and found the Bill
// Ferny freeze (#690). It must set fights up the way game.js does, or its numbers mean nothing.
//   1. a small run finishes, writes one record per fight, and every fight ends
//   2. the same run twice gives the same results (seeded)
//   3. an override reaches the fight (a trial nerf changes the outcome)
//   4. bad input is refused
//   5. game.js's boot<Mode>Encounter still does what fight() mirrors, for all three modes
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../..');
const TOOL = path.join(ROOT, 'tools/runmode-sim.mjs');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const tmp = name => path.join(os.tmpdir(), `runmode-sim-test-${process.pid}-${name}`);
const run = (extra, out) => { execFileSync(process.execPath, [TOOL, '--mode=middleearth', '--enemies=Shagrat', '--games=1', '--rounds=1', '--workers=2', `--out=${out}`, ...extra], { stdio: 'ignore' });
	return JSON.parse(fs.readFileSync(out, 'utf8')); };

// ===== 1 + 2 =====
const a = run([], tmp('a.json')), b = run([], tmp('b.json'));
ok('one record per fight (10 heroes x Shagrat x 1)', a.length === 10, a.length);
ok('every fight ends in a win or a loss', a.every(x => x.result === 'win' || x.result === 'loss'), a.map(x => x.result));
ok('records carry hero, enemy, round, seed', a.every(x => x.hero && x.enemy === 'Shagrat' && x.round === 1 && Number.isFinite(x.seed)));
ok('the same run twice gives the same results', JSON.stringify(a.map(x => [x.result, x.turn])) === JSON.stringify(b.map(x => [x.result, x.turn])));

// ===== 3 =====
const ovFile = tmp('ov.json');
fs.writeFileSync(ovFile, JSON.stringify({ __powers: { Shagrat: { cost: 9 } }, 'Snowslope Hunter|Shagrat': { cost: 9 }, 'Great Ugly-Looking Goblin|Shagrat': { cost: 9 } }));
const c = run([`--overrides=${ovFile}`], tmp('c.json'));
ok('an override reaches the fights (outcomes change)', JSON.stringify(c.map(x => [x.result, x.turn])) !== JSON.stringify(a.map(x => [x.result, x.turn])));

// ===== 4 =====
const bad = spawnSync(process.execPath, [TOOL, '--mode=bogus'], { encoding: 'utf8' });
ok('an unknown mode is refused', bad.status === 2 && /--mode must be/.test(bad.stderr), bad.stderr);
const who = spawnSync(process.execPath, [TOOL, '--mode=middleearth', '--enemies=Nobody'], { encoding: 'utf8' });
ok('an unknown enemy is refused', who.status === 2 && /unknown enemies/.test(who.stderr), who.stderr);

// ===== 5 =====
const game = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
for (const [fn, tag] of [['bootMiddleEarthEncounter', 'meDeck'], ['bootSwordCoastEncounter', 'scDeck'], ['bootFinalFantasyEncounter', 'ffDeck']]) {
	const i = game.indexOf(`function ${fn}(`);
	const body = i < 0 ? '' : game.slice(i, game.indexOf('\n}\n', i));
	ok(`${fn} exists`, i >= 0);
	const mirrored = ['E.createGame(', 'E.resetDeckAndHand(state, 1,', 'E.drawCards(state, 1, 4)', 'E.addCoin(state, 1)', 'E.stripLoadouts(state)',
		'setRunLife((run.wins || 0) + (run.losses || 0) + 1)', `allowedBasicsFor(cardsById, '${tag}'`];
	const missing = mirrored.filter(s => !body.includes(s));
	ok(`${fn} still does what the simulator mirrors`, missing.length === 0, missing);
	const extra = ['applyRunAnomaly'].filter(s => body.includes(s));
	ok(`${fn}: the only step the sim skips is the weekly anomaly (none by default)`, extra.length === 1);
}
ok('the sim uses game.js\'s run life formula', /function runLifeFor\(round\) \{ return 10 \+ 5 \* \(round - 1\); \}/.test(game));

for (const f of ['a.json', 'b.json', 'c.json', 'ov.json']) { try { fs.unlinkSync(tmp(f)); } catch { /* temp */ } }
console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
