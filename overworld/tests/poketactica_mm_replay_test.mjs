// poketactica_mm_replay_test.mjs — MYSTERY MAZE, the recipe (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 9): a run is its
// seed, dungeon, party, bag, stars and the leader's actions, packed small; re-run, it is the same run (a replay, a
// resume). And a spectator's view holds nothing the player doesn't see. Pure: node only.
//   node overworld/tests/poketactica_mm_replay_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W } from '../../poketactica/js/mm/gen.js';
import { DIR8, cheb } from '../../poketactica/js/mm/shapes8.js';
import { packActs, unpackActs, mmRecipe, validMmRecipe, mmNewRun, mmDriver, mmRunTo, MM_REPLAY_V } from '../../poketactica/js/mm/replay.js';
import { validRecipe, slimFig } from '../../poketactica/js/replay.js';
import { dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { usable, ITEMS } from '../../poketactica/js/mm/items.js';
import { aimsAtFoes } from '../../poketactica/js/mm/ai.js';
import { ATTACK, moveFor } from '../../poketactica/js/mm/combat.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-mm' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const L = (S) => MM.leaderOf(S);

// ================================================================ actions, packed
{
	const acts = [{ t: 'step', d: 0 }, { t: 'step', d: 7 }, { t: 'pass' }, { t: 'attack' }, { t: 'stairs' }, { t: 'take' }, { t: 'pay' }, { t: 'face', d: 3 }, { t: 'move', id: 'thunderbolt', x: 12, y: 30 }, { t: 'use', slot: 2 },
		{ t: 'throw', slot: 0 }, { t: 'throw', slot: 1, x: 4, y: 5 }, { t: 'putback', slot: 3 }, { t: 'tactic', uid: 'p1', tactic: 'hunt' }, { t: 'quit' }];
	const s = packActs(acts);
	A(s.startsWith('07pasty{"t":"face","d":3}') && s.endsWith('q') && JSON.stringify(unpackActs(s)) === JSON.stringify(acts), 'every kind of action packs and unpacks: a step is a digit, the common ones a letter, the rest their JSON', s.slice(0, 60));
	A(unpackActs('0123x') === null && unpackActs('01{"t":1}') === null && unpackActs('01{"t":"use"') === null && unpackActs(5) === null && unpackActs('8') === null && JSON.stringify(unpackActs('')) === '[]', 'anything else is refused');
	A(packActs(Array.from({ length: 3000 }, (_, i) => ({ t: 'step', d: i % 8 }))).length === 3000, 'a 3,000-step walk is 3,000 characters');
}

// ================================================================ a played run, and its recipe
const party = [fig('pikachu', 30, ['thundershock', 'quickattack']), fig('squirtle', 30, ['watergun']), fig('pidgey', 30, ['gust'])];
function play(seed, dungeon, n, more = {}) {
	const d = dungeonById(dungeon), head = { seed, dungeonId: dungeon, party, bag: more.bag || [], stars: more.stars || 0 };
	const S = MM.newRun(seed, { dungeon: d, party: party.map(slimFig), bag: head.bag, stars: head.stars }, data);
	const r = makeRng('script:' + seed), acts = [];
	const act = (a) => { acts.push(a); return MM.act(S, a, data); };
	for (let k = 0; k < n && !S.over; k++) {
		const u = L(S);
		const item = S.bag.findIndex((it) => !it.sticky && usable(it.id) && it.id !== 'escapeorb');
		const near = aimsAtFoes(S, u, ATTACK);
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1] && !MM.actBlock(S, { t: 'stairs' }, data)) act({ t: 'stairs' });
		else if (item >= 0 && r() < 0.05) act({ t: 'use', slot: item });
		else if (near.length) {
			const m = moveFor(u, 'thundershock', data), aims = u.fig.equipped.includes('thundershock') && u.pp.thundershock > 0 && u.sp >= m.spCost ? aimsAtFoes(S, u, m) : [];
			if (aims.length && r() < 0.4) act({ t: 'move', id: 'thundershock', x: aims[0][0], y: aims[0][1] });
			else { const d2 = DIR8.findIndex(([dx, dy]) => u.x + dx === near[0][0] && u.y + dy === near[0][1]); if (u.dir !== d2) act({ t: 'face', d: d2 }); act({ t: 'attack' }); }
		} else {
			const goal = S.items.length && S.bag.length < 20 && r() < 0.5 ? S.items.reduce((p, o) => (cheb(o.x, o.y, u.x, u.y) < cheb(p.x, p.y, u.x, u.y) ? o : p)) : { x: S.F.stairs[0], y: S.F.stairs[1] };
			const dist = MM.walkMap(S.F, u, goal.x, goal.y), here = dist[u.y * W + u.x];
			const d2 = [0, 1, 2, 3, 4, 5, 6, 7].find((k2) => MM.canWalk(S.F, u, k2) && dist[(u.y + DIR8[k2][1]) * W + u.x + DIR8[k2][0]] === here - 1 && !MM.actBlock(S, { t: 'step', d: k2 }, data));
			act(d2 != null ? { t: 'step', d: d2 } : { t: 'pass' });
		}
	}
	return { S, acts, head };
}
{
	const one = play('replay-a', 'pebble-hollow', 700, { bag: [{ id: 'apple' }, { id: 'oran' }], stars: 50 });
	const rec = mmRecipe({ ...one.head, acts: one.acts, S: one.S });
	const fights = one.acts.filter((a) => a.t === 'attack' || a.t === 'move').length;
	A(one.acts.length > 200 && fights >= 5 && one.S.floorNo >= 2, `(a run to work with: ${one.acts.length} actions, B${one.S.floorNo}F, ${fights} attacks, ${one.S.kills} knocked out${one.S.over ? ', over' : ''})`);
	A(rec.v === MM_REPLAY_V && rec.kind === 'mm' && rec.rev === MM.MM_RULES_REV && rec.dungeon === 'pebble-hollow' && rec.n === one.acts.length && rec.floor === one.S.floorNo && /^Mystery Maze · Pebble Hollow · B\d+F$/.test(rec.label) && rec.party.length === 3 && rec.stars === 50 && rec.bag.length === 2, 'the recipe: the seed, the dungeon by id, the party, the bag and stars taken in, the actions, a label');
	const size = JSON.stringify(rec).length;
	A(validMmRecipe(rec) && validRecipe(rec) && validRecipe(JSON.parse(JSON.stringify(rec))) && size < 6000 && rec.acts.length < one.acts.length * 3, `it is valid (through JSON too) and small: ${size} bytes for ${rec.n} actions`, size);
	// re-run: the same run
	const again = mmRunTo(JSON.parse(JSON.stringify(rec)), null, data);
	A(MM.hashOf(again) === MM.hashOf(one.S) && again.floorNo === one.S.floorNo && again.turns === one.S.turns && JSON.stringify(again.over) === JSON.stringify(one.S.over) && JSON.stringify(again.fallen) === JSON.stringify(one.S.fallen), 're-run from the recipe, it is the same run to the last detail (a replay, a resume)');
	// part way, and on from there (a resume keeps playing)
	const half = rec.n >> 1;
	const mid = mmRunTo(rec, half, data);
	one.acts.slice(half).forEach((a) => MM.act(mid, a, data));
	A(MM.hashOf(mid) === MM.hashOf(one.S), 're-run half way and played on, it ends the same');
	// the driver
	const d = mmDriver(rec, data);
	A(d.k === 0 && d.S.floorNo === 1 && d.floorStart(1) === 0 && MM.hashOf(d.S) === MM.hashOf(mmNewRun(rec, data)), 'the driver starts before the first action');
	let evs = 0;
	while (d.S.floorNo < 2 && !d.done()) evs += d.step().length;
	const f2 = d.floorStart(2);
	A(evs > 0 && f2 > 0 && d.k === f2 && d.S.floorNo === 2 && d.S.turns === 0 && d.to(f2 + 20).turns > 0 && d.k === f2 + 20, 'it plays action by action and notes where each floor began', [evs, f2]);
	d.to(Infinity);
	A(d.done() && d.step() === null && MM.hashOf(d.S) === MM.hashOf(one.S), 'to the end: the same run, and nothing after it');
	// what is refused
	const bad = (ch) => !validMmRecipe({ ...rec, ...ch });
	A(bad({ dungeon: 'nowhere' }) && bad({ seed: '' }) && bad({ party: [] }) && bad({ party: [{ species: 'pikachu' }] }) && bad({ n: rec.n + 1 }) && bad({ acts: rec.acts + 'z' }) && bad({ bag: [{ id: 'nope' }] }) && bad({ stars: -1 }) && bad({ v: 2 }) && !validMmRecipe(null) && !validRecipe({ kind: 'mm' }), 'a recipe with an unknown dungeon, no party, a wrong count, junk actions or an unknown item is refused');
	// another seed, another run
	const two = play('replay-b', 'pebble-hollow', 100);
	A(MM.hashOf(two.S) !== MM.hashOf(mmRunTo(rec, two.acts.length, data)), 'another seed is another dungeon');
}
{
	// a Lv 5 dungeon and the endless one replay too
	for (const [id, n] of [['sprout-trial', 300], ['the-abyss', 400]]) {
		const one = play('replay-' + id, id, n);
		const rec = mmRecipe({ ...one.head, acts: one.acts, S: one.S });
		A(validMmRecipe(rec) && MM.hashOf(mmRunTo(JSON.parse(JSON.stringify(rec)), null, data)) === MM.hashOf(one.S) && one.acts.length > 50, `${dungeonById(id).name} replays the same (${one.acts.length} actions, B${one.S.floorNo}F)`);
	}
}

// ================================================================ what a spectator is sent
{
	const one = play('view', 'tidepool-isles', 60);
	const S = one.S, v = MM.view(S), txt = JSON.stringify(v);
	const unseen = v.tiles.filter((t) => t === -1).length;
	A(!('seed' in v) && !('rng' in v) && !('pre' in v) && !txt.includes(S.seed) && unseen > 300 && v.tiles.length === S.F.terrain.length, 'the view has no seed and no ground the player has not explored', unseen);
	const hidden = S.traps.filter((t) => !t.seen).length, outOfSight = S.units.filter((u) => u.side !== 'p' && !v.units.some((x) => x.uid === u.uid)).length;
	A(v.traps.length === S.traps.filter((t) => t.seen).length && (hidden === 0 || v.traps.length < S.traps.length) && v.items.every((o) => S.seen[o.y * W + o.x]) && v.units.filter((u) => u.side === 'p').length === MM.partyOf(S).length, 'no hidden trap, no item on unexplored ground; the party is always there', [hidden, outOfSight]);
	A(v.theme === 'islands' && v.dungeon === 'Tidepool Isles' && typeof v.belly === 'number' && Array.isArray(v.bag) && txt.length < 20000, 'it carries what the bar shows and how the floor looks', txt.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
