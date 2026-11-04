// run_enemy_no_repeat_test.mjs — bug review 2026-10-26 (instinctgauntlet, keys
// bug:1792951537504 / bug:1792962629342): one Lorequest run offered the same Commander twice
// — The Balrog at F10 (beaten) and again at F12, Azog likewise — because randomEnemy only
// avoided the IMMEDIATE repeat (the F11 foe in between cleared the way back).
// Now every mode's randomEnemy takes the run's `faced` list and offers someone new while the
// roster has anyone left; game.js keeps that list on the run (noteFaced), and older saves
// recover it from their fight-replay labels.
import fs from 'fs';
import * as LQ from '../../lorequest.js';
import * as ME from '../../middleearth.js';
import * as SC from '../../swordcoast.js';
import * as FF from '../../finalfantasy.js';
import * as MV from '../../multiverse.js';
import { seededRng } from '../../engine/rng.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

// the reported shape: Balrog beaten at win 8 -> 9, lose to the Witch-king, next pick at 9 wins
{
	let repeats = 0;
	for (let seed = 1; seed <= 400; seed++) {
		const e = ME.randomEnemy(9, seededRng(seed), 'Witch-king of Angmar', ['The Balrog', 'Witch-king of Angmar']);
		if (e === 'The Balrog' || e === 'Witch-king of Angmar') repeats++;
	}
	ok('Middle-earth: The Balrog is never re-offered after Witch-king (400 seeds)', repeats === 0, repeats);
}

// whole simulated runs for every wins/losses mode: no foe twice while the rung has someone new
const MODES = [['middleearth', ME], ['swordcoast', SC], ['finalfantasy', FF], ['multiverse', MV]];
for (const [name, M] of MODES) {
	let bad = 0, runs = 0;
	for (let seed = 1; seed <= 150; seed++) {
		const rng = seededRng(seed * 31 + 7);
		let wins = 0, losses = 0, last = null; const faced = [];
		while (wins < 12 && losses < 3) {
			const e = M.randomEnemy(wins, rng, last, faced);
			const roster = M.enemyRosterFor(wins);
			if (!roster.includes(e)) bad++;
			const fresh = roster.filter(c => c !== last && !faced.includes(c));
			if (fresh.length && faced.includes(e)) bad++;   // a repeat while someone new was left
			faced.push(e); last = e;
			if (rng() < 0.8) wins++; else losses++;
		}
		runs++;
	}
	ok(`${name}: ${runs} simulated runs never repeat a foe while the rung has someone new`, bad === 0, bad);
}
// Lorequest (games-indexed roster, never your own planeswalker)
{
	let bad = 0;
	for (let seed = 1; seed <= 150; seed++) {
		const rng = seededRng(seed * 17 + 3);
		let wins = 0, losses = 0, last = null; const faced = []; const self = LQ.PLANESWALKERS[seed % LQ.PLANESWALKERS.length];
		while (wins < 12 && losses < 3) {
			const games = wins + losses;
			const e = LQ.randomEnemy(games, rng, last, self, faced);
			if (e === self || faced.includes(e)) bad++;
			faced.push(e); last = e;
			if (rng() < 0.8) wins++; else losses++;
		}
	}
	ok('lorequest: 150 simulated runs never repeat a foe (or face yourself)', bad === 0, bad);
}
// an exhausted rung still returns someone in it (the final rung has 2 Dark Lords, up to 3 fights)
ok('exhausted rung falls back inside the rung, still no immediate repeat',
	(() => { const e = ME.randomEnemy(11, seededRng(5), 'Sauron the Dark Lord', ['Sauron the Dark Lord', 'Sauron the Lidless Eye']); return e === 'Sauron the Lidless Eye'; })());
ok('no faced list: the old behaviour (in-rung, no immediate repeat)',
	(() => { for (let s = 1; s < 60; s++) { const e = ME.randomEnemy(8, seededRng(s), 'Azog'); if (e === 'Azog' || !ME.enemyRosterFor(8).includes(e)) return false; } return true; })());

// game.js keeps the list: every advance passes noteFaced(run), and noteFaced recovers an older
// save's foes from its fight-replay labels ("Fight 10 — The Balrog (win)")
const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
for (const fn of ['genLorequestEnemy', 'genMiddleEarthEnemy', 'genSwordCoastEnemy', 'genFinalFantasyEnemy', 'genMultiverseEnemy']) {
	const advances = src.split('\n').filter(l => l.includes(`run.enemy = ${fn}(`) && !l.includes('run.enemy ||'));
	ok(`${fn}: the between-fights advance passes the run's faced list`, advances.length === 1 && advances[0].includes('noteFaced(run)'), advances);
}
const m = /function noteFaced\(run\) \{[\s\S]*?\n\}/.exec(src);
ok('noteFaced exists in game.js', !!m);
if (m) {
	const noteFaced = new Function(m[0] + '\nreturn noteFaced;')();
	const run = { fightReplays: [{ id: 'a', label: 'Fight 10 — The Balrog (win)' }, { id: 'b', label: 'Fight 11 — Witch-king of Angmar (loss)' }], enemy: { id: 'Witch-king of Angmar' } };
	const f = noteFaced(run);
	ok('noteFaced: legacy labels + the current foe', f.includes('The Balrog') && f.includes('Witch-king of Angmar') && f.length === 2, f);
	ok('noteFaced stores the list on the run', Array.isArray(run.faced) && run.faced.length === 2);
	const run2 = { faced: ['Azog'], enemy: { id: 'Saruman' } };
	ok('noteFaced keeps the list and adds the foe just fought', JSON.stringify(noteFaced(run2)) === JSON.stringify(['Azog', 'Saruman']), run2.faced);
	const picked = ME.randomEnemy(9, seededRng(3), 'Witch-king of Angmar', noteFaced({ fightReplays: run.fightReplays, enemy: run.enemy }));
	ok('end to end: the run from the report cannot draw The Balrog again', picked !== 'The Balrog' && picked !== 'Witch-king of Angmar', picked);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
