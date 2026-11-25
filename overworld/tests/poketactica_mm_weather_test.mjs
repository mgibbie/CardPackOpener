// poketactica_mm_weather_test.mjs — MYSTERY MAZE, a dungeon's WEATHER (rules revision 19;
// Plans/POKETACTICA_MYSTERY_MAZE_IMPROVEMENT_PLAN.md item 10: "weather is cleared on every floor and does nothing over
// time"). A dungeon's recipe says which floors have which weather; it is the battle's weather for the whole floor, and
// hail and sand wear down whoever is not at home in them. A run recorded under rules 18 has clear skies.
// Pure: node only.   node overworld/tests/poketactica_mm_weather_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as MM from '../../poketactica/js/mm/turn.js';
import { MM_W as W, MM_H as H, T_FLOOR } from '../../poketactica/js/mm/gen.js';
import { DUNGEONS, dungeonById, dungeonAt, dungeonLevels, WEATHER_NAME, WEATHER_SAY, WEATHER_REV } from '../../poketactica/js/mm/dungeons.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv = 30, moves) => {
	let f = makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-sky' + lv, shinyRate: 0 });
	if (moves) { const pool = [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))]; f = equip({ ...f, pool }, moves); }
	return f;
};
const PROPS = { layout: 0, roomDensity: 6, floorConnectivity: 15, enemyDensity: 0, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 0, trapDensity: 0, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
/** A three-floor test dungeon: floor 1 has the weather given, floor 2 is clear, floor 3 has it again. */
const dungeon = (sky) => ({ id: 'test', name: 'Test Cave', party: 4, floors: [sky, null, sky].map((w) => ({ props: PROPS, water: false, vis: 0, wild: [], items: [], traps: [], ...(w ? { weather: w } : {}) })) });
function arena(sky, o = {}) {
	const S = MM.newRun(o.seed || 'sky', { dungeon: dungeon(sky), party: o.party || [fig('pikachu', 30, ['thundershock', 'tackle']), fig('squirtle', 30, ['watergun', 'tackle'])], bag: [], ...(o.rev ? { rev: o.rev } : {}) }, data);
	for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) { S.F.terrain[y * W + x] = T_FLOOR; S.F.room[y * W + x] = 0; }
	MM.partyOf(S).forEach((u, i) => { u.x = 20 - i; u.y = 15; });
	MM.act(S, { t: 'face', d: 2 }, data);
	S.F.stairs = [21, 15];
	S.B.map = { w: W, h: H, height: S.F.terrain.map((t) => ((t & 3) === 0 ? null : 0)), base: { x: 0, y: 0 } };
	return S;
}
const sky = (S) => (S.B.field.weather ? S.B.field.weather.kind : null);
const pass20 = (S, n = 20) => { const all = []; for (let i = 0; i < n; i++) all.push(...MM.act(S, { t: 'pass' }, data)); return all; };

A(MM.MM_RULES_REV >= 19 && WEATHER_REV === 19, 'the rules revision is 19 or later');

// ---------- which floors have which weather
{
	const of = (id) => dungeonById(id).floors.map((f) => f.weather || '-');
	const kinds = (id) => [...new Set(of(id).filter((w) => w !== '-'))].join();
	A(kinds('frostspire') === 'hail' && kinds('pebble-hollow') === 'sand' && kinds('tidepool-isles') === 'rain' && kinds('ember-rift') === 'sun' && kinds('gale-tower') === 'sand', 'hail in Frostspire, sand in Pebble Hollow and Gale Tower, rain in the Tidepool Isles, sun in Ember Rift');
	A(['whisper-woods', 'sunken-ruins', 'starfall-spire', 'sprout-trial', 'ancients-descent'].every((id) => kinds(id) === ''), 'the first dungeon, the dark ones and the two Lv 5 ones keep clear skies');
	const named = DUNGEONS.filter((d) => !d.endless);
	A(named.every((d) => !d.floors[0].weather && !d.floors[d.floors.length - 1].weather), 'never on the first floor, never on the boss\'s');
	A(named.every((d) => d.floors.filter((f) => f.weather).length <= d.floors.length / 2), 'on half a dungeon\'s floors at most', named.map((d) => [d.id, d.floors.filter((f) => f.weather).length]));
	A(named.every((d) => dungeonAt(d.id, 18).floors.every((f) => !f.weather)) && named.every((d) => dungeonAt(d.id, 14).floors.every((f) => !f.weather)), 'as a run under rules 18 (or 14) knew them: clear skies everywhere');
	const fr18 = dungeonAt('frostspire', 18).floors[4], fr = dungeonById('frostspire').floors[4];
	A(fr.weather === 'hail' && JSON.stringify({ ...fr, weather: undefined }) === JSON.stringify({ ...fr18, weather: undefined }), 'the weather is all that differs between a floor at 18 and at 19');
	A(dungeonLevels(dungeonById('frostspire')).sky === 'hail' && dungeonLevels(dungeonById('whisper-woods')).sky === null, 'the camp is told a dungeon\'s weather (dungeonLevels)');
	const abyss = dungeonById('the-abyss'), a = [2, 6, 10, 14, 18].map((n) => MM.floorOf(abyss, n).weather || '-');
	A(a.join() === '-,sand,sun,hail,rain' && !MM.floorOf(abyss, 7).weather && [6, 10, 14, 18, 22, 26].every((n) => !MM.floorOf(dungeonAt('the-abyss', 18), n).weather), 'The Abyss: every fourth floor from B6F, each kind in turn; none under rules 18', a);
	A(dungeonAt('the-abyss', 18).clearSky === true && !dungeonAt('the-abyss', 18).oldItems && dungeonAt('the-abyss', 17).oldItems === true && dungeonAt('the-abyss', 19) === abyss, 'the endless dungeon keeps each older revision\'s floors apart');
	A(['rain', 'sun', 'hail', 'sand'].every((k) => WEATHER_NAME[k] && WEATHER_SAY[k]), 'every kind has a name and a line');
}

// ---------- the floor has it: from the first step to the stairs, and not on the next floor
{
	const S = arena('hail');
	A(sky(S) === 'hail' && MM.view(S).weather === 'hail', 'the floor begins in hail, and the page is told');
	const e0 = pass20(S, 30);
	A(sky(S) === 'hail', 'thirty turns on: it has not let up');
	const e = MM.act(S, { t: 'step', d: 2 }, data), e2 = MM.act(S, { t: 'stairs' }, data);
	A(S.floorNo === 2 && sky(S) === null && MM.view(S).weather === null && !e2.some((x) => x.t === 'weather'), 'down the stairs: the next floor is clear');
	S.F.stairs = [MM.leaderOf(S).x, MM.leaderOf(S).y];
	const e3 = MM.act(S, { t: 'stairs' }, data);
	A(S.floorNo === 3 && sky(S) === 'hail' && e3.some((x) => x.t === 'weather' && x.kind === 'hail' && x.floor), 'and the third has hail again, announced as the floor begins', e3.filter((x) => x.t === 'weather'));
	const O = arena('hail', { rev: 18 });
	A(sky(O) === null && pass20(O, 40).every((x) => !(x.t === 'hurt' && x.why === 'hail')), 'a run recorded under rules 18 on the same floor: a clear sky, and nothing bites');
}

// ---------- hail and sand wear down whoever is not at home in them
{
	const chip = (S) => { const lost = {}; for (const e of pass20(S, 40)) if (e.t === 'hurt' && (e.why === 'hail' || e.why === 'sand')) (lost[e.uid] = lost[e.uid] || []).push(e.n); return lost; };
	// hail: Pikachu and Squirtle are bitten, an Ice type is not
	const S = arena('hail', { party: [fig('pikachu', 30), fig('squirtle', 30), fig('snorunt', 30)] });
	for (const u of MM.partyOf(S)) u.hp = u.maxHP;
	const lost = chip(S), [p, q, ice] = MM.partyOf(S);
	A(lost.p0 && lost.p0.length === 4 && lost.p0.every((n) => n === Math.max(1, Math.floor(p.maxHP / MM.WEATHER_CHIP))), `hail: 1/${MM.WEATHER_CHIP} of max HP every ${MM.UPKEEP_EVERY} turns (forty turns: four bites)`, lost.p0);
	A(lost.p1 && lost.p1.length >= 3 && !lost.p2 && ice.types.includes('Ice'), 'a partner is bitten too; the Ice type is not', [lost.p1, lost.p2, ice.types]);
	A(MM.weatherBites('hail', p) && !MM.weatherBites('hail', ice) && !MM.weatherBites('rain', p) && !MM.weatherBites('sun', p) && !MM.weatherBites('hail', { types: ['Normal'], ability: 'magicguard' }) && !MM.weatherBites('sand', { types: ['Normal'], ability: 'sandveil' }), 'weatherBites: by type and by ability; rain and sun bite nobody');
	// sand: Rock, Ground and Steel are at home
	const T = arena('sand', { party: [fig('pikachu', 30), fig('geodude', 30), fig('magnemite', 30), fig('sandshrew', 30)] });
	const ls = chip(T);
	A(ls.p0 && !ls.p1 && !ls.p2 && !ls.p3, 'a sandstorm: Pikachu is stung; Geodude (Rock), Magnemite (Steel) and Sandshrew (Ground) are not', Object.keys(ls));
	// rain and sun bite nobody
	const R = arena('rain'), U = arena('sun');
	A(!Object.keys(chip(R)).length && !Object.keys(chip(U)).length && sky(R) === 'rain' && sky(U) === 'sun', 'rain and sun wear nobody down');
	// it never takes the last HP
	const D = arena('hail', { party: [fig('pikachu', 30)] }), d = MM.leaderOf(D);
	d.hp = 2; D.belly = 1000;
	pass20(D, 60);
	A(d.hp >= 1 && !D.over && D.fallen.length === 0, 'hail never takes the last HP: nobody falls to the weather alone', [d.hp, D.over]);
	// a wild Pokémon is in it too
	const Wd = arena('sand');
	const wild = Object.assign(MM.addWild(Wd, 'rattata', 30, 30, 15, data), { nap: true, stone: true }), ice2 = Object.assign(MM.addWild(Wd, 'geodude', 30, 32, 15, data), { nap: true, stone: true });
	pass20(Wd, 60);
	A(wild.hp < wild.maxHP && ice2.hp === ice2.maxHP, 'the wild Pokémon are in the same storm: a Rattata is stung, a Geodude is not', [wild.hp, wild.maxHP, ice2.hp]);
}

// ---------- it is the battle's weather: rain bends Water and Fire moves
{
	const hit = (skyKind, move) => {
		const S = arena(skyKind, { seed: 'bend', party: [fig('squirtle', 30, ['watergun', 'ember'])] });
		const v = Object.assign(MM.addWild(S, 'snorlax', 30, 21, 15, data), { nap: true, stone: true });
		v.maxHP = 100000; v.hp = 100000; v.ability = null;
		const e = MM.act(S, { t: 'move', id: move, x: 21, y: 15 }, data);
		return (e.find((x) => x.t === 'hit' && x.target === v.uid) || {}).dmg || 0;
	};
	const w0 = hit(null, 'watergun'), wr = hit('rain', 'watergun'), ws = hit('sun', 'watergun'), f0 = hit(null, 'ember'), fr = hit('rain', 'ember'), fs2 = hit('sun', 'ember');
	A(w0 > 0 && wr > w0 * 1.3 && ws < w0 * 0.7, `Water Gun: ${w0} in clear air, ${wr} in rain, ${ws} in sun`, [w0, wr, ws]);
	A(f0 > 0 && fs2 > f0 * 1.3 && fr < f0 * 0.7, `Ember: ${f0} in clear air, ${fs2} in sun, ${fr} in rain`, [f0, fr, fs2]);
}

// ---------- a save and its restore keep the sky
{
	const S = arena('sand'); pass20(S, 7);
	const R = MM.fromSnapshot(MM.toSnapshot(S), data);
	A(sky(R) === 'sand' && MM.hashOf(R) === MM.hashOf(S), 'a run saved mid-floor comes back in the same storm');
	pass20(S, 15); pass20(R, 15);
	A(MM.hashOf(R) === MM.hashOf(S), 'and plays on the same from there');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
