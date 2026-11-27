// poketactica_mm_teach_test.mjs — MYSTERY MAZE, MOVES TO TEACH INSIDE A RUN (Plans/POKETACTICA_MODES_PLAN.md item M5;
// rules 22). A Lesson Slate lies on some floors. Whoever reads it (the leader, or a partner it is handed to) learns the
// next move its kind would learn, for the rest of the run; with every slot full, one move makes way.
// Pure: node only.
//   node overworld/tests/poketactica_mm_teach_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { ITEMS, usable, throwable, givable } from '../../poketactica/js/mm/items.js';
import { makeFigurine, equip, stretchedLearnset } from '../../poketactica/js/figurine.js';
import { packActs, unpackActs } from '../../poketactica/js/mm/replay.js';
import { dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, moves) => { let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-t' + lv, shinyRate: 0 }); if (moves) f = equip(f, moves); return f; };
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 5, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 6, trapDensity: 10, numExtraHallways: 3, buriedItemDensity: 2, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const dungeon = (floors = 3) => ({ id: 'test', name: 'Test Cave', party: 4, floors: Array.from({ length: floors }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) });
function arena(party, bag = [], more = {}) {
	const S = MM.newRun('teach', { dungeon: dungeon(), party, bag, ...more }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const act = (S, a) => MM.act(S, a, data), L = (S) => MM.leaderOf(S), of = (e, t) => e.filter((v) => v.t === t);
const SLATE = 'teachslate';

// ---------- the item
A(MM.MM_RULES_REV >= 22 && MM.TEACH_REV === 22, 'the rules revision is 22 or later');
A(ITEMS[SLATE] && ITEMS[SLATE].name === 'Lesson Slate' && ITEMS[SLATE].teach && /for the rest of this run/.test(ITEMS[SLATE].note), 'the Lesson Slate: named, and its note says the move is for this run');
A(usable(SLATE) && givable(SLATE) && !throwable(SLATE), 'it is read, or handed to a partner; it is not thrown');

// ---------- what it teaches: the NEXT move of the reader's kind
{
	const ls = stretchedLearnset(data.species.bulbasaur);
	const S = arena([fig('bulbasaur', 5)], [{ id: SLATE }]);
	const u = L(S), want = ls.find(([l, id]) => l > u.level && !u.fig.pool.some((p) => p.id === id) && data.moves[id]);
	A(want && MM.nextLesson(S, u) === want[1], 'a Lv 5 Bulbasaur: the slate teaches the first move it would learn above Lv 5', [want, MM.nextLesson(S, u)]);
	const before = [...u.fig.equipped];
	A(before.length < MM.MOVE_SLOTS && MM.actBlock(S, { t: 'use', slot: 0 }, data) === null, 'with a free slot it can be read at once', before);
	const turns = S.turns, e = act(S, { t: 'use', slot: 0 });
	const t = of(e, 'taught')[0];
	A(t && t.move === want[1] && t.forgot === null && L(S).fig.equipped.includes(want[1]) && L(S).fig.equipped.length === before.length + 1 && L(S).pp[want[1]] === (data.moves[want[1]].pp || 10), 'read: the move is in a slot, with its PP', [t, L(S).fig.equipped]);
	A(S.bag.length === 0 && S.turns === turns + 1, 'the slate is used up, and reading it takes a turn', [S.bag.length, turns, S.turns]);
	A(!L(S).fig.pool.some((p) => p.id === want[1]), 'it is for THIS RUN: the pool of moves the figurine owns is not touched');
}
// ---------- every slot full: one makes way, and it must be said which
{
	const S = arena([fig('bulbasaur', 30)], [{ id: SLATE }, { id: SLATE }]);
	const u = L(S), eq = [...u.fig.equipped], next = MM.nextLesson(S, u);
	A(eq.length === MM.MOVE_SLOTS && next, 'a Lv 30 Bulbasaur has four moves and something still to learn', [eq, next]);
	A(MM.actBlock(S, { t: 'use', slot: 0 }, data) === 'pick a move to forget' && MM.actBlock(S, { t: 'use', slot: 0, forget: 9 }, data) === 'pick a move to forget', 'four moves: reading it without saying which makes way is refused');
	const e = act(S, { t: 'use', slot: 0, forget: 1 }), t = of(e, 'taught')[0];
	A(t && t.move === next && t.forgot === eq[1] && L(S).fig.equipped[1] === next && L(S).fig.equipped.length === 4 && !(eq[1] in L(S).pp) && L(S).pp[next] > 0, 'said: the second move makes way for it', [t, L(S).fig.equipped]);
	A(MM.nextLesson(S, L(S)) !== next, 'the next slate teaches the move after that one', MM.nextLesson(S, L(S)));
	const back = unpackActs(packActs([{ t: 'use', slot: 0, forget: 1 }]));
	A(back && back.length === 1 && back[0].t === 'use' && back[0].forget === 1, 'a recorded run keeps which move made way');
}
// ---------- nothing left to learn: the slate is kept
{
	const S = arena([fig('bulbasaur', 100)], [{ id: SLATE }]);
	A(MM.nextLesson(S, L(S)) === null && MM.actBlock(S, { t: 'use', slot: 0, forget: 0 }, data) === 'it has nothing left to learn' && S.bag.length === 1, 'a Lv 100 Bulbasaur has passed every move: the slate is refused, and kept');
}
// ---------- handed to a partner
{
	const S = arena([fig('pikachu', 30), fig('charmander', 5)], [{ id: SLATE }]);
	const p = MM.partyOf(S).find((u) => u !== L(S)), next = MM.nextLesson(S, p), n = p.fig.equipped.length;
	const e = act(S, { t: 'give', slot: 0, uid: p.uid }), t = of(e, 'taught')[0];
	A(next && t && t.uid === p.uid && t.move === next && p.fig.equipped.length === n + 1 && S.bag.length === 0, 'handed to a partner: the partner learns the next move of ITS kind', [next, t]);
}
// ---------- where they lie: some floors, by dice of their own
{
	const d = dungeonById('whisper-woods');
	let slates = 0, onFloor = true, shop = false;
	for (let k = 0; k < 60; k++) {
		const S = MM.newRun('lay' + k, { dungeon: d, party: [fig('pikachu', 30)] }, data);
		for (const o of S.items.filter((x) => x.id === SLATE)) { slates++; const i = o.y * W + o.x; if ((S.F.terrain[i] & 3) !== T_FLOOR || (o.x === S.F.stairs[0] && o.y === S.F.stairs[1])) onFloor = false; if (o.shop) shop = true; }
	}
	A(slates >= 3 && slates <= 20 && onFloor && !shop, `60 first floors: a slate lies on ${slates} of them (about ${MM.SLATE_CHANCE} in 100), on open floor, off the stairs, never in a shop`, slates);
	// the other rolls of the run fall as they did before slates: the same floor, the same items, slate or no slate
	const plain = (S) => JSON.stringify([S.items.filter((o) => o.id !== SLATE), S.traps, S.F.stairs, S.units.map((u) => [u.species, u.x, u.y])]);
	let same = 0, old = 0;
	for (let k = 0; k < 20; k++) {
		const a = MM.newRun('lay' + k, { dungeon: d, party: [fig('pikachu', 30)] }, data), b = MM.newRun('lay' + k, { dungeon: d, party: [fig('pikachu', 30)], rev: 21 }, data);
		if (plain(a) === plain(b)) same++;
		if (b.items.some((o) => o.id === SLATE)) old++;
	}
	A(same === 20 && old === 0, 'a run recorded before slates finds none, and everything else on its floors is where it was', [same, old]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
