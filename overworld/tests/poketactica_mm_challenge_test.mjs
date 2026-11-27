// poketactica_mm_challenge_test.mjs — MYSTERY MAZE, CHALLENGE RULES YOU CHOOSE BEFORE A RUN (Plans/POKETACTICA_MODES_PLAN.md
// item M1; rules 24; never daily). "Clearing a dungeon again has no point": a run may be begun with no items, alone, or
// timed. Each makes the clear prize half as big again and is marked on the dungeon, for good, once cleared with it.
// Pure: node only.   node overworld/tests/poketactica_mm_challenge_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { dungeonById } from '../../poketactica/js/mm/dungeons.js';
import { mmRecipe, validMmRecipe, mmNewRun, mmFig } from '../../poketactica/js/mm/replay.js';
import { mmOutcome, applyMmRewards, challengeMult, clearPrize } from '../../poketactica/js/mm/rewards.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { newFigs, addFig, cleanFigs, merge3Figs } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-c' + lv, shinyRate: 0 });
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 5, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 6, trapDensity: 10, numExtraHallways: 3, buriedItemDensity: 2, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const TEST = { id: 'test', name: 'Test Cave', party: 4, reward: { first: 100, again: 40 }, floors: Array.from({ length: 3 }, () => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [] })) };
/** An open field with nothing on it: the leader at (20, 15) facing east. */
function arena(ch, party = [fig('pikachu')], more = {}) {
	const S = MM.newRun('ch', { dungeon: TEST, party, ch, ...more }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	S.items = []; S.traps = [];
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [50, 28];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const act = (S, a) => MM.act(S, a, data), L = (S) => MM.leaderOf(S), of = (e, t) => e.filter((v) => v.t === t);
const woods = dungeonById('whisper-woods');

// ---------- the table
A(MM.MM_RULES_REV >= 24 && MM.CHALLENGE_REV === 24 && JSON.stringify(MM.CHALLENGE_IDS) === '["noitems","solo","clock"]', 'rules 24: three challenge rules (no items, alone, timed)');
A(MM.CHALLENGE_IDS.every((id) => MM.CHALLENGES[id].name && MM.CHALLENGES[id].say.length > 20 && MM.CHALLENGES[id].icon && MM.CHALLENGES[id].pay === 0.5), 'each has a name, a picture, a sentence, and pays half as much again');
A(JSON.stringify(MM.cleanCh(['clock', 'nonsense', 'noitems', 'clock'])) === '["noitems","clock"]' && MM.cleanCh('x').length === 0, 'a list of them is read defensively: known ones, once each, in the table\'s order');
A(MM.challengeable(woods) && !MM.challengeable(dungeonById('the-abyss')) && !MM.challengeable(dungeonById('sprout-trial')) && !MM.challengeable({ ...woods, noRecord: true }), 'for a dungeon that can be cleared and keeps a record: not the endless one, not a Lv 5 one, not a dive');

// ---------- how a run begins
{
	const party = [fig('pikachu'), fig('charmander'), fig('squirtle')], bag = [{ id: 'oran' }, { id: 'apple' }];
	const plain = MM.newRun('b', { dungeon: woods, party, bag }, data), all = MM.newRun('b', { dungeon: woods, party, bag, ch: ['clock', 'solo', 'noitems'] }, data);
	A(!plain.ch && plain.bag.length === 2 && MM.partyOf(plain).length === 3, 'a run with no challenge is the run it always was');
	A(JSON.stringify(all.ch) === '["noitems","solo","clock"]' && all.bag.length === 0 && MM.partyOf(all).length === 1, 'all three: the bag starts empty and one figurine goes in', [all.ch, all.bag.length, MM.partyOf(all).length]);
	const old = MM.newRun('b', { dungeon: woods, party, bag, ch: ['solo'], rev: 23 }, data);
	A(!old.ch && MM.partyOf(old).length === 3, 'a run recorded under rules 23 has none, whatever it is handed');
	const abyss = MM.newRun('b', { dungeon: dungeonById('the-abyss'), party, bag, ch: ['solo'] }, data);
	A(!abyss.ch, 'the endless dungeon takes none');
}
// ---------- no items
{
	const S = arena(['noitems'], [fig('pikachu')], { bag: [{ id: 'oran' }] });
	S.items.push({ x: 21, y: 15, id: 'oran' }, { x: 22, y: 15, id: 'stars', n: 7 }, { x: 23, y: 15, id: 'vaultkey' });
	const stars0 = S.stars;
	const e1 = act(S, { t: 'step', d: 2 });
	A(S.bag.length === 0 && of(e1, 'leftit').length === 1 && S.items.some((o) => o.id === 'oran' && o.x === 21), 'no items: the bag starts empty, and a bead walked over is left where it lies', [S.bag, e1.map((e) => e.t)]);
	act(S, { t: 'step', d: 2 });
	A(S.stars === stars0 + 7, 'stars are still picked up');
	act(S, { t: 'step', d: 2 });
	A(S.bag.length === 1 && S.bag[0].id === 'vaultkey', 'and so is a key');
	const P = arena(null);
	P.items.push({ x: 21, y: 15, id: 'oran' });
	act(P, { t: 'step', d: 2 });
	A(P.bag.length === 1 && P.bag[0].id === 'oran', '(without the rule the bead is picked up)');
}
// ---------- alone: nobody joins
{
	const tries = (ch) => { let n = 0; for (let k = 0; k < 80; k++) { const S = MM.newRun('rec' + k, { dungeon: TEST, party: [fig('machamp', 60)], ch }, data); for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; } const u = L(S); u.x = 20; u.y = 15; MM.act(S, { t: 'face', d: 2 }, data); S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } }; Object.assign(MM.addWild(S, 'rattata', 2, 21, 15, data), { nap: true }); for (let i = 0; i < 4 && S.units.some((x) => x.side !== 'p' && x.hp > 0); i++) MM.act(S, { t: 'attack' }, data); n += S.recruits.length; } return n; };
	const open = tries(null), solo = tries(['solo']);
	A(open >= 3 && solo === 0, `alone: of 80 wild Rattata knocked out, ${open} ask to join an ordinary run and none joins a run alone`, [open, solo]);
}
// ---------- timed: each floor has its turns
{
	const S = arena(['clock']);
	A(MM.clockLeft(S) === MM.CLOCK_TURNS && MM.clockLeft(arena(null)) === null && MM.view(S).clock === MM.CLOCK_TURNS, 'timed: the floor starts with its ' + MM.CLOCK_TURNS + ' turns (a run without the rule has no clock)');
	const warned = [];
	for (let i = 0; i < MM.CLOCK_TURNS - 1; i++) for (const e of of(act(S, { t: 'pass' }), 'clock')) warned.push(e.left);
	A(!S.over && MM.clockLeft(S) === 1 && JSON.stringify(warned) === JSON.stringify(MM.CLOCK_WARN), 'it warns at 100, 50, 20 and 10 turns left, and one turn from the end the run still stands', [warned, MM.clockLeft(S)]);
	const e = act(S, { t: 'pass' });
	A(S.over && S.over.clock === true && S.over.won === false && of(e, 'over').some((x) => x.clock), 'at 0 the run is over, as lost', S.over);
	// the stairs give the next floor its own turns
	const T = arena(['clock']);
	for (let i = 0; i < 40; i++) act(T, { t: 'pass' });
	T.F.stairs = [L(T).x, L(T).y];
	act(T, { t: 'stairs' });
	A(T.floorNo === 2 && MM.clockLeft(T) === MM.CLOCK_TURNS, 'going down the stairs starts the count again', [T.floorNo, MM.clockLeft(T)]);
}
// ---------- the recipe carries them, and a replay is the same run
{
	const party = [fig('pikachu'), fig('charmander')].map(mmFig), acts = [{ t: 'pass' }, { t: 'pass' }, { t: 'face', d: 4 }];
	const S = MM.newRun('rcp', { dungeon: woods, party, bag: [], ch: ['solo', 'clock'] }, data);
	for (const a of acts) MM.act(S, a, data);
	const rec = mmRecipe({ seed: 'rcp', dungeonId: 'whisper-woods', party, bag: [], stars: 0, acts, S });
	A(JSON.stringify(rec.ch) === '["solo","clock"]' && validMmRecipe(rec), 'a run\'s recipe keeps its challenge rules', rec.ch);
	A(!validMmRecipe({ ...rec, ch: ['solo', 'flying'] }) && !validMmRecipe({ ...rec, ch: 'solo' }), 'a recipe with a rule that does not exist is not a recipe');
	const R = mmNewRun(rec, data);
	for (const a of acts) MM.act(R, a, data);
	A(JSON.stringify(R.ch) === '["solo","clock"]' && MM.hashOf(R) === MM.hashOf(S), 'replayed from its recipe it is the same run');
	// (REGRESSION: a comment put in the middle of the recipe's line cut off everything after it: a finished run's recipe had no end)
	MM.act(S, { t: 'quit' }, data);
	{ const done = mmRecipe({ seed: 'rcp', dungeonId: 'whisper-woods', party, bag: [], stars: 0, acts: [...acts, { t: 'quit' }], S }); A(done.over && done.over.quit === true && done.n === 4 && /Whisper Woods/.test(done.label) && JSON.stringify(done.ch) === '["solo","clock"]', 'the recipe of a finished run still says how it ended, its length and its label', [done.over, done.n, done.label]); }
	const plainRec = mmRecipe({ seed: 'rcp', dungeonId: 'whisper-woods', party, bag: [], stars: 0, acts: [], S: MM.newRun('rcp', { dungeon: woods, party, bag: [] }, data) });
	A(!('ch' in plainRec) && validMmRecipe(plainRec), 'a run with none has no such field: its recipe is as it always was');
}
// ---------- what a clear pays, and the mark it leaves
{
	A(challengeMult([]) === 1 && challengeMult(['solo']) === 1.5 && challengeMult(['noitems', 'solo', 'clock']) === 2.5, 'the prize: half as much again for each (one: 1.5 times, all three: 2.5 times)');
	let col = addFig(newFigs(), fig('pikachu'));
	const win = (ch, won = true) => { const S = arena(ch); S.over = { won, floor: 3 }; const r = applyMmRewards(col, mmOutcome(S), TEST, data, 't'); col = r.col; return r.report; };
	const r1 = win(['solo']);
	A(r1.prize === 150 && r1.bonus === 50 && JSON.stringify(r1.newCh) === '["solo"]' && JSON.stringify(col.mm.ch) === '{"test":["solo"]}', 'a first clear alone: 150 stars for the 100 star prize, and "alone" is marked on the dungeon', [r1.prize, col.mm.ch]);
	const r2 = win(['solo', 'clock']);
	A(r2.prize === Math.round(clearPrize(TEST, 1) * 2) && JSON.stringify(r2.newCh) === '["clock"]' && JSON.stringify(col.mm.ch.test) === '["solo","clock"]', 'cleared again alone and timed: the later prize doubled, and only "timed" is new', [r2.prize, r2.newCh, col.mm.ch]);
	const r3 = win(['noitems'], false);
	A(r3.prize === 0 && r3.ch.length === 0 && !col.mm.ch.test.includes('noitems'), 'a run that is lost marks nothing and pays no prize');
	const r4 = win([]);
	A(r4.prize === clearPrize(TEST, 2) && r4.bonus === 0 && r4.ch.length === 0, 'an ordinary clear pays the ordinary prize');
	// the marks are kept and synced: a rule cleared on either device is cleared
	const kept = cleanFigs(JSON.parse(JSON.stringify(col)));
	A(JSON.stringify(kept.mm.ch) === JSON.stringify(col.mm.ch), 'a saved and loaded collection keeps the marks');
	const other = { ...newFigs(), mm: { clear: { test: 1 }, best: {}, store: {}, ch: { test: ['noitems'], 'whisper-woods': ['solo', 'cheat'] } } };
	const both = merge3Figs(newFigs(), col, other);
	A(JSON.stringify(both.mm.ch) === '{"test":["noitems","solo","clock"],"whisper-woods":["solo"]}', 'two devices: the marks of both, and a rule that does not exist is dropped', both.mm.ch);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
