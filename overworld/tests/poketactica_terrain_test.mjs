// poketactica_terrain_test.mjs — LIVING TERRAIN (owner, 2026-11-22): what a tile is made of, with Pokémon's rules
// (poketactica/js/engine/terrain.js): water / ice cost 2 Move unless the figurine is at home there (or Flying), lava burns
// at the phase's end, tall grass hides (-20% to hit), and each boosts its own type's moves (+20%). The forecast agrees
// with the hit, the enemy AI walks by the same costs, the map format (campaign.js `ground` rows / `theme`), the dungeon's
// themed floors, and a battle from before the rules (rules rev < 3) plays by the old ones. Pure: node only.
//   node overworld/tests/poketactica_terrain_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as T from '../../poketactica/js/engine/terrain.js';
import { buildMap, GROUND_CHAR, CHAPTER_THEME, MAPS } from '../../poketactica/js/campaign.js';
import { genFloor, floorTheme, FLOOR_THEMES } from '../../poketactica/js/dungeon.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const fig = (sp, lv, moves, seed) => { let f = makeFigurine(sp, lv, makeRng(seed || sp), data, { id: sp + '-' + (seed || 'x'), shinyRate: 0 }); if (moves) f = equip({ ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return f; };
// a 9 x 5 map: water in column 2, ice in column 4, lava at (6, 2), tall grass at (7, 2)
const W = 9, H = 5;
const ground = Array(W * H).fill(null);
for (let y = 0; y < H; y++) { ground[y * W + 2] = 'water'; ground[y * W + 4] = 'ice'; }
ground[2 * W + 6] = 'lava'; ground[2 * W + 7] = 'tallgrass';
const map = (g = ground) => ({ w: W, h: H, height: Array(W * H).fill(0), base: { x: 0, y: 2 }, ...(g ? { ground: g } : {}) });
const setup = (player, enemy, rev = B.RULES_REV, g) => ({ map: map(g), player, enemy, rev });
const far = (sp = 'rattata') => [{ fig: fig(sp, 3), x: 8, y: 0, ai: 'hold' }];

try {
	A(B.RULES_REV >= 3, 'rules rev 3: living terrain');
	// ---- movement: water and ice cost 2 for the wrong types
	{
		const S = B.newBattle('t-move', setup([fig('machamp', 40)], far()), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const u = B.unit(S, 'p0'); u.move = 3;
		const tiles = B.moveTiles(S, u);
		A(tiles.has('2,2') && tiles.get('2,2').d === 3 && !tiles.has('3,2'), 'a Fighting type wading: Move 3 reaches the water (1 + 2) and no further along that row', [...tiles.keys()].filter((k) => k.endsWith(',2')));
		const S2 = B.newBattle('t-move2', setup([fig('squirtle', 40)], far()), data);
		B.act(S2, { t: 'deploy', uid: 'p0' }, data);
		const w = B.unit(S2, 'p0'); w.move = 3;
		A(B.moveTiles(S2, w).has('3,2') && B.moveTiles(S2, w).get('2,2').d === 2, 'a Water type swims at the normal cost');
		const S3 = B.newBattle('t-move3', setup([fig('pidgey', 40)], far()), data);
		B.act(S3, { t: 'deploy', uid: 'p0' }, data);
		const f = B.unit(S3, 'p0'); f.move = 5;
		A(B.moveTiles(S3, f).get('4,2').d === 4, 'a Flying type crosses water and ice at the normal cost');
		const S4 = B.newBattle('t-move4', setup([fig('machamp', 40)], far()), data);
		B.act(S4, { t: 'deploy', uid: 'p0' }, data);
		const m = B.unit(S4, 'p0'); m.move = 7;
		A(B.moveTiles(S4, m).get('4,2').d === 6, 'ice costs 2 as well (1 + 2 + 1 + 2)', B.moveTiles(S4, m).get('4,2'));
		// walking SP counts tiles walked, not the cost
		m.sp = 0;
		B.act(S4, { t: 'move', uid: 'p0', x: 3, y: 2 }, data);
		A(m.sp === 3 * Math.ceil(m.maxSP * 0.02), 'SP from walking counts the tiles, not the Move spent', [m.sp]);
	}
	// ---- lava burns at the phase's end; not a Fire type
	{
		const S = B.newBattle('t-lava', setup([fig('machamp', 40), fig('charmander', 40)], far()), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const u = B.unit(S, 'p0'); u.x = 6; u.y = 2;
		B.act(S, { t: 'deploy', uid: 'p1' }, data);
		const c = B.unit(S, 'p1'); c.x = 6; c.y = 3; S.map.ground[3 * W + 6] = 'lava';
		const hp = u.hp, hpc = c.hp;
		const r = B.act(S, { t: 'end' }, data);
		A(u.hp === hp - Math.max(1, Math.floor(u.maxHP / 8)) && r.events.some((e) => e.t === 'hurt' && e.uid === 'p0' && e.why === 'lava'), 'a figurine on lava at its phase end burns for 1/8 of its HP', [hp, u.hp, r.events.filter((e) => e.uid === 'p0').map((e) => e.t + ':' + (e.why || ''))]);
		A(c.hp === hpc, 'a Fire type on lava is fine');
		S.map.ground[3 * W + 6] = null;
	}
	// ---- tall grass hides; the forecast agrees
	{
		const S = B.newBattle('t-grass', setup([fig('machamp', 40, ['dynamicpunch'])], [{ fig: fig('rattata', 20), x: 7, y: 2, ai: 'hold' }]), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const u = B.unit(S, 'p0'); u.x = 6; u.y = 3;
		const e = S.units.find((x) => x.side === 'e');
		const f1 = B.forecast(S, u, 'dynamicpunch', 7, 2, data).targets[0];
		e.x = 8; e.y = 2;
		const f2 = B.forecast(S, { ...u, x: 7, y: 3 }, 'dynamicpunch', 8, 2, data).targets[0];
		A(f1.hidden && !f2.hidden && f2.hit < 100 && Math.abs(f1.hit - f2.hit * 0.8) <= 1.5 , 'in tall grass: the forecast says so, and the hit chance is 20% lower', [f1.hit, f2.hit]);
	}
	// ---- the ground boosts its own type: the forecast and the hit agree
	{
		const sq = fig('blastoise', 90, ['watergun']);
		const S = B.newBattle('t-boost', setup([sq], [{ fig: fig('snorlax', 70), x: 3, y: 0, ai: 'hold' }]), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const u = B.unit(S, 'p0'); u.x = 2; u.y = 1;   // (in the water column)
		const fa = B.forecast(S, u, 'watergun', 3, 0, data);
		const t1 = fa && fa.targets[0];
		const dry = B.newBattle('t-boost2', setup([sq], [{ fig: fig('snorlax', 70), x: 3, y: 0, ai: 'hold' }], B.RULES_REV, Array(W * H).fill(null)), data);
		B.act(dry, { t: 'deploy', uid: 'p0' }, data);
		const ud = B.unit(dry, 'p0'); ud.x = 2; ud.y = 1;
		const t2 = B.forecast(dry, ud, 'watergun', 3, 0, data).targets[0];
		A(t1 && t1.ground === 'water' && t1.max > t2.max && Math.abs(t1.max / t2.max - 1.2) < 0.08, 'a Water move from water: +20% in the forecast', [t1 && t1.max, t2.max]);
	}
	// ---- the enemy walks by the same costs
	{
		const S = B.newBattle('t-ai', setup([fig('machamp', 40)], [{ fig: fig('geodude', 20), x: 3, y: 2, ai: 'aggro' }]), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const e = S.units.find((x) => x.side === 'e');
		const reach = B.moveTiles(S, e);
		A(reach.get('2,2').d === 2 && (!reach.get('1,2') || reach.get('1,2').d >= 3), 'a foe pays the same water costs (the AI plans with them)');
	}
	// ---- an old battle (no rules rev 3) ignores the ground
	{
		const S = B.newBattle('t-old', setup([fig('machamp', 40)], far(), 2), data);
		B.act(S, { t: 'deploy', uid: 'p0' }, data);
		const u = B.unit(S, 'p0'); u.move = 3;
		A(!S.terrain && B.moveTiles(S, u).get('2,2').d === 2 && B.moveTiles(S, u).has('3,2'), 'a battle from before the rules (rev 2): water costs nothing extra');
		A(B.view(S).ground === null && B.view(B.newBattle('t-v', setup([fig('machamp', 40)], far()), data)).ground.length === W * H, 'the view carries the ground only when it is played');
	}
	// ---- the map format
	{
		A(Object.values(GROUND_CHAR).every((k) => T.GROUND.includes(k)), 'every ground char is a known kind');
		const m = buildMap({ name: 'x', chapter: 5, rows: ['...', '.1.'], ground: ['w.t', 'l.i'], base: [1, 0] });
		A(m.theme === 'islands' && m.ground.join() === 'water,,tallgrass,lava,,ice', 'campaign maps: `ground` rows -> map.ground, the chapter -> its theme', m);
		A(!buildMap({ name: 'y', chapter: 1, rows: ['..'], base: [0, 0] }).ground, 'a map with no ground rows has no living terrain');
		A(Object.keys(CHAPTER_THEME).length >= 6 && MAPS.every((x) => buildMap(x).theme), 'every chapter has a look');
	}
	// ---- the dungeon's floors: themed by band, dressed off the base and the foes
	{
		A(floorTheme(1) === FLOOR_THEMES[0] && floorTheme(11) === FLOOR_THEMES[1] && floorTheme(10) === FLOOR_THEMES[0], 'a theme per ten floors');
		let bad = 0, dressed = 0;
		for (let f = 1; f <= 60; f += 3) {
			const m = genFloor('terr', f, data), bm = buildMap(m), [bx, by] = m.base;
			if (bm.ground && bm.ground.some(Boolean)) dressed++;
			const at = (x, y) => (bm.ground ? bm.ground[y * bm.w + x] : null);
			if (['water', 'lava', 'ice'].includes(at(bx, by))) bad++;
			for (const fo of m.foes) if (at(fo.x, fo.y) === 'lava') bad++;
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(bx + dx, by + dy) === 'lava') bad++;
		}
		A(dressed >= 15 && bad === 0, 'dungeon floors carry living terrain, never on the base, beside it as lava, or under a foe as lava', [dressed, bad]);
		A(JSON.stringify(genFloor('terr', 7, data).rows) === JSON.stringify(genFloor('terr', 7, data).rows), 'the same floor every time');
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
