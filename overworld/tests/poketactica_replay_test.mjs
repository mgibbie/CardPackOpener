// poketactica_replay_test.mjs — a battle's replay (stage 8, poketactica/js/replay.js): the recipe (seed, setup, actions)
// rebuilds the battle EXACTLY, after packing and unpacking, at every step; it is small enough for the tape store; junk is
// refused; and the live snapshot (engine view()) carries no seed or RNG state, so a spectator (and a bettor) can't run the
// battle ahead of the player.
//   1. a battle played with deploys, moves, attacks, Execute and enemy phases, to its end -> recipe -> pack -> unpack ->
//      replayTo gives the same view at the end and at every step on the way
//   2. the figurines are slimmed (only the equipped moves) and the packed recipe is far under the store's cap
//   3. validRecipe refuses junk; unpackRecipe of junk is null
//   4. replaying twice gives the same battle (the engine never writes into the recipe)
//   5. view() has no seed / rng
//   node overworld/tests/poketactica_replay_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as R from '../../poketactica/js/replay.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { genFloor } from '../../poketactica/js/dungeon.js';
import { campaignSetup, mapById } from '../../poketactica/js/campaign.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const V = (S) => JSON.stringify(B.view(S));

/** Play a battle with simple legal choices: deploy, step toward a foe, attack what is in reach, Execute, end the phase. */
function play(setup, seed, maxTurns = 30) {
	const S = B.newBattle(seed, setup, data), actions = [], views = [V(S)];
	const tryAct = (a) => { const r = B.act(S, a, data); if (r.ok) { actions.push(a); views.push(V(S)); } return r.ok; };
	while (!S.over && S.turn <= maxTurns) {
		for (const u of S.units.filter((x) => x.side === 'p' && x.hp > 0 && x.x == null)) { if (!B.unitAt(S, S.map.base.x, S.map.base.y)) tryAct({ t: 'deploy', uid: u.uid }); }
		for (const u of B.onMap(S, 'p')) {
			if (S.over) break;
			const foes = B.onMap(S, 'e');
			if (!foes.length) break;
			const near = (x, y) => Math.min(...foes.map((f) => Math.abs(f.x - x) + Math.abs(f.y - y)));
			if (!u.moved) { const tiles = [...B.moveTiles(S, u).values()].sort((a, b) => near(a.x, a.y) - near(b.x, b.y)); if (tiles[0] && (tiles[0].x !== u.x || tiles[0].y !== u.y)) tryAct({ t: 'move', uid: u.uid, x: tiles[0].x, y: tiles[0].y }); }
			if (!u.acted) {
				let done = false;
				for (const mid of u.fig.equipped) { for (const f of foes) { if (tryAct({ t: 'attack', uid: u.uid, move: mid, x: f.x, y: f.y })) { done = true; break; } } if (done) break; }
			}
		}
		if (S.queue.length) tryAct({ t: 'execute' });
		if (!S.over) tryAct({ t: 'end' });
	}
	return { S, actions, views };
}

try {
	const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 12, makeRng('rt' + i), data, { id: sp + '-rt' + i }));
	// a fat pool on one figurine: the recipe must not carry it
	team[0] = { ...team[0], pool: [...team[0].pool, ...Array.from({ length: 50 }, (_, i) => ({ id: 'pad' + i, lv: 3, xp: 9 }))] };
	for (const [name, m] of [['campaign c1-2', mapById('c1-2')], ['dungeon floor 7', genFloor('rtest', 7, data)]]) {
		const seed = 'rp-' + name.replace(/\W/g, '');
		const setup = campaignSetup(m, team, data, seed);
		const { S, actions, views } = play(setup, seed);
		A(actions.length >= 10 && actions.some((a) => a.t === 'attack') && actions.some((a) => a.t === 'end'), `${name}: a battle was played (${actions.length} actions, turn ${S.turn}, ${S.over || 'still going'})`);
		const rec = R.recipeOf(seed, setup, actions, { label: name, won: S.over === 'won' });
		A(R.validRecipe(rec), `${name}: its recipe is valid`);
		A(rec.setup.player.every((f) => f.pool.every((p) => f.equipped.includes(p.id))) && rec.setup.player[0].pool.length <= 4, `${name}: figurines are slimmed to their equipped moves`);
		const code = await R.packRecipe(rec);
		A(/^G1\./.test(code) && code.length < 60_000, `${name}: packed, the recipe is small (${code.length} chars; the store takes 1.5 MB)`);
		const back = await R.unpackRecipe(code);
		A(!!back && JSON.stringify(back) === JSON.stringify(rec), `${name}: it unpacks to the same recipe`);
		A(V(R.replayTo(back, back.actions.length, data)) === V(S), `${name}: replaying it rebuilds the battle exactly, to its end`);
		let bad = -1;
		for (const k of [0, 1, 2, Math.floor(actions.length / 3), Math.floor(actions.length / 2), actions.length - 1]) if (V(R.replayTo(back, k, data)) !== views[k]) { bad = k; break; }
		A(bad === -1, `${name}: ... and at every step on the way (the viewer can jump to any action)`, bad);
		const steps = []; R.replayTo(back, back.actions.length, data, (i, r) => steps.push(r.ok));
		A(steps.length === actions.length && steps.every(Boolean), `${name}: every recorded action is legal again on replay`);
		A(V(R.replayTo(back, back.actions.length, data)) === V(R.replayTo(back, back.actions.length, data)), `${name}: replaying twice gives the same battle (the recipe is never written into)`);
	}
	// junk
	const good = R.recipeOf('s1', campaignSetup(mapById('c1-1'), team, data, 's1'), [{ t: 'end' }]);
	A(R.validRecipe(good), 'a minimal recipe is valid');
	for (const [why, r] of [['no version', { ...good, v: 9 }], ['no seed', { ...good, seed: '' }], ['an unknown action', { ...good, actions: [{ t: 'nuke' }] }], ['too many actions', { ...good, actions: Array(R.ACTIONS_MAX + 1).fill({ t: 'end' }) }],
		['seven figurines', { ...good, setup: { ...good.setup, player: Array(7).fill(good.setup.player[0]) } }], ['a broken map', { ...good, setup: { ...good.setup, map: { ...good.setup.map, height: [1] } } }], ['not an object', 'x']]) A(!R.validRecipe(r), 'refused: ' + why);
	A(await R.unpackRecipe('G1.garbage') === null && await R.unpackRecipe('') === null && await R.unpackRecipe(await (await import('../../battlecards/codec.js')).packString('{"v":1}')) === null, 'junk codes unpack to null');
	A(R.REPLAY_ID_RE.test('a1b2c3d4') && !R.REPLAY_ID_RE.test('../x'), 'replay ids are the tape store\'s');
	// the live view carries no seed
	const vs = V(B.newBattle('secret-seed-123', good.setup, data));
	A(!/secret-seed-123/.test(vs) && !/"rng"/.test(vs) && !/"seed"/.test(vs), 'the live snapshot (view) has no seed or RNG state');
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
