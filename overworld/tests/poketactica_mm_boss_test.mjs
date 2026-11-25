// poketactica_mm_boss_test.mjs — MYSTERY MAZE, REAL BOSS FLOORS (rules revision 21;
// Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md item 12: "every boss is a wild Pokémon standing on the stairs").
// A boss may have HELPERS beside it and one TRICK it plays once: rage (double speed at half HP), mend (a third of its HP
// back at a third), rally (two more helpers at half HP). A run recorded under rules 20 meets the boss alone.
// Pure: node only.   node overworld/tests/poketactica_mm_boss_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { DUNGEONS, dungeonById, dungeonLevels, BOSS_REV, BOSS_TRICKS, HELPER_UNDER, RALLY_N, MEND_PART } from '../../poketactica/js/mm/dungeons.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 60) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-boss' + lv, shinyRate: 0 });
const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** A one-floor dungeon that is that dungeon's boss floor (no other wild Pokémon), with this boss recipe if given. */
const bossRun = (id, seed, o = {}) => {
	const fl = dungeonById(id).floors[dungeonById(id).floors.length - 1];
	const floor = { ...fl, props: { ...fl.props, enemyDensity: 0 }, ...(o.boss ? { boss: o.boss } : {}) };
	return MM.newRun(seed, { dungeon: { id: 'test', name: 'Test', party: 4, floors: [floor] }, party: [fig('pikachu'), fig('squirtle')], bag: [], ...(o.rev ? { rev: o.rev } : {}) }, data);
};
const bossOf = (S) => S.units.find((u) => u.boss);
const helpersOf = (S) => S.units.filter((u) => u.helper && u.hp > 0);
const passN = (S, n) => { const all = []; for (let i = 0; i < n && !S.over; i++) all.push(...MM.act(S, { t: 'pass' }, data)); return all; };

A(MM.MM_RULES_REV >= 21 && BOSS_REV === 21, 'the rules revision is 21 or later');

// ---------- which bosses
{
	const story = DUNGEONS.filter((d) => !d.endless), bosses = story.map((d) => d.floors[d.floors.length - 1].boss);
	A(!bosses[0].helpers && !bosses[0].trick, 'the first dungeon\'s boss stands alone, as it did', story[0].id);
	const armed = story.filter((d, i) => bosses[i].helpers && bosses[i].helpers[1] > 0);
	A(armed.length >= 5, 'five bosses or more have helpers beside them from the start', armed.map((d) => d.id));
	A(story.filter((d) => d.needs && !d.lv5).every((d) => { const b = d.floors[d.floors.length - 1].boss; return (b.helpers && b.helpers[1] > 0) || b.trick; }), 'every story boss after the first has helpers or a trick');
	{ const g = dungeonById('gale-tower').floors, s = dungeonById('starfall-spire').floors, gb = g[g.length - 1].boss, sb = s[s.length - 1].boss; A(!gb.helpers && gb.trick === 'mend' && sb.helpers[1] === 0 && sb.trick === 'rally', 'the two last bosses: a trick, and nobody beside them at the start (measured: see the plan)'); }
	A(bosses.every((b) => !b.helpers || (data.species[b.helpers[0]] && b.helpers[1] >= 0 && b.helpers[1] <= 3)), 'helpers are real species, three of them at most');
	A(bosses.every((b) => !b.trick || BOSS_TRICKS[b.trick]) && Object.keys(BOSS_TRICKS).every((k) => bosses.some((b) => b.trick === k)), 'every trick is a known one, and each of the three is some boss\'s', bosses.map((b) => b.trick || '-'));
	A(Object.values(BOSS_TRICKS).every((t) => t.name && t.say && t.at >= 2), 'each trick has a name and a line that says what it does');
	const lv = dungeonLevels(dungeonById('ember-rift'));
	A(lv.bossHelpers && lv.bossHelpers[0] === 'slugma' && lv.bossTrick === 'rage' && dungeonLevels(story[0]).bossHelpers === null && dungeonLevels(story[0]).bossTrick === null, 'the camp can say what a boss brings');
}

// ---------- helpers
{
	const S = bossRun('pebble-hollow', 'h1'), b = bossOf(S), hs = helpersOf(S);
	A(b && b.species === 'onix' && hs.length === 2 && hs.every((h) => h.species === 'geodude'), 'Onix has two Geodude with it', hs.map((h) => h.species));
	A(hs.every((h) => cheb(h, b) <= 4 && !h.nap && h.side !== 'p' && h.post && h.post[0] === h.x && h.post[1] === h.y), 'beside it, awake, keeping to their posts', hs.map((h) => cheb(h, b)));
	A(hs.every((h) => h.level === b.level - HELPER_UNDER), 'three levels under the boss', [hs.map((h) => h.level), b.level]);
	const plain = makeFigurine('geodude', b.level - HELPER_UNDER, makeRng('x'), data, { id: 'g', shinyRate: 0 });
	A(hs.every((h) => h.maxHP < 0.8 * (MM.newRun('t', { dungeon: { id: 't', name: 't', party: 4, floors: [{ ...dungeonById('pebble-hollow').floors[0], wild: [] }] }, party: [plain], bag: [] }, data).units[0].maxHP)), 'they are wild Pokémon in strength (less HP than a figurine of their level)');
	A(!hs.some((h) => h.x === S.F.stairs[0] && h.y === S.F.stairs[1] && h !== b), 'none stands on the stairs');
	{ const L = MM.leaderOf(S), was = [L.x, L.y], st = S.F.stairs.slice(); S.F.stairs = [L.x, L.y]; A(/boss bars/.test(MM.actBlock(S, { t: 'stairs' }, data) || ''), 'the boss still bars the stairs'); S.F.stairs = st; L.x = was[0]; L.y = was[1]; }
	const old = bossRun('pebble-hollow', 'h1', { rev: 20 });
	A(bossOf(old) && helpersOf(old).length === 0 && !bossOf(old).trick, 'a rules-20 run of the same floor meets the boss alone');
	const two = bossRun('pebble-hollow', 'h1');
	A(MM.hashOf(two) === MM.hashOf(S), 'the same seed, the same floor');
}

// ---------- rage
{
	const S = bossRun('ember-rift', 'r1'), b = bossOf(S);
	A(b.trick === 'rage' && !b.tricked, 'Magmar\'s trick is rage');
	for (const h of helpersOf(S)) h.hp = 0;
	const ev0 = passN(S, 3);
	A(!ev0.some((e) => e.t === 'bosstrick') && !b.tricked, 'at full HP nothing happens');
	const st0 = b.stage;
	b.hp = Math.floor(b.maxHP / 2);
	const ev1 = passN(S, 2);
	A(ev1.some((e) => e.t === 'bosstrick' && e.kind === 'rage' && e.uid === b.uid) && b.tricked, 'at half HP it rages', ev1.filter((e) => e.t === 'bosstrick'));
	A(b.stage === st0 + 1 && ev1.some((e) => e.t === 'speed' && e.uid === b.uid), 'and moves at double speed', [st0, b.stage]);
	passN(S, 30);
	A(S.over || b.hp <= 0 || b.stage === st0 + 1, 'for the rest of the fight');
	b.hp = Math.max(1, Math.floor(b.maxHP / 4));
	A(S.over || !passN(S, 3).some((e) => e.t === 'bosstrick'), 'once');
}

// ---------- mend
{
	const S = bossRun('tidepool-isles', 'm1'), b = bossOf(S);
	A(b.trick === 'mend', 'Starmie\'s trick is mend');
	for (const h of helpersOf(S)) h.hp = 0;
	b.hp = Math.floor(b.maxHP / 2);
	A(!passN(S, 2).some((e) => e.t === 'bosstrick'), 'not at half HP');
	b.hp = Math.floor(b.maxHP / 3);
	const hp0 = b.hp, ev = passN(S, 1);
	A(ev.some((e) => e.t === 'bosstrick' && e.kind === 'mend') && ev.some((e) => e.t === 'heal' && e.uid === b.uid && e.n === Math.floor(b.maxHP / MEND_PART)), 'at a third of its HP it takes a quarter back', [hp0, b.hp, b.maxHP]);
	b.hp = 1;
	A(S.over || !passN(S, 3).some((e) => e.t === 'bosstrick'), 'once');
}

// ---------- rally
{
	const S = bossRun('frostspire', 'c1'), b = bossOf(S);
	A(b.trick === 'rally' && helpersOf(S).length === 2, 'Glalie\'s trick is rally; it starts with two Snorunt');
	for (const h of helpersOf(S)) h.hp = 0;
	b.hp = Math.floor(b.maxHP / 2);
	const ev = passN(S, 1), hs = helpersOf(S);
	A(ev.some((e) => e.t === 'bosstrick' && e.kind === 'rally') && hs.length === RALLY_N && hs.every((h) => h.species === 'snorunt' && cheb(h, b) <= 4), 'at half HP two more come to its side', hs.length);
	A(ev.filter((e) => e.t === 'spawn').length === RALLY_N, 'and the page is told where');
	// a boss with a trick and no helpers: nothing to rally, nothing breaks
	const T = bossRun('frostspire', 'c2', { boss: { species: 'glalie', level: 35, trick: 'rally' } }), tb = bossOf(T);
	tb.hp = Math.floor(tb.maxHP / 2);
	const ev2 = passN(T, 1);
	A(ev2.some((e) => e.t === 'bosstrick') && helpersOf(T).length === 0, 'a rallying boss with no helpers calls nobody');
	// a sleeping boss plays no trick until it wakes
	const U = bossRun('ember-rift', 's1'), ub = bossOf(U);
	for (const h of helpersOf(U)) h.hp = 0;
	ub.hp = Math.floor(ub.maxHP / 2); ub.status = 'slp'; ub.sleepTurns = 4;
	A(!passN(U, 1).some((e) => e.t === 'bosstrick'), 'a boss that is asleep plays no trick');
	A(passN(U, 8).some((e) => e.t === 'bosstrick') || U.over, 'it does when it wakes');
}

// ---------- knocking the boss out still opens the stairs, helpers or not
{
	const S = bossRun('pebble-hollow', 'k1'), b = bossOf(S), L = MM.leaderOf(S);
	b.hp = 0;
	const kept = S.units.filter((u) => u !== b);
	S.units.length = 0; S.units.push(...kept);
	L.x = S.F.stairs[0]; L.y = S.F.stairs[1];
	A(MM.actBlock(S, { t: 'stairs' }, data) === null, 'with the boss down the stairs are open, though its helpers still stand');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
