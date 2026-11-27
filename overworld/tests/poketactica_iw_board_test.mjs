// poketactica_iw_board_test.mjs — THE ITEM WORLD's FINDS ON THE BOARD (Plans/POKETACTICA_MODES_PLAN.md item I2). "A find
// is a line in the results." On a floor that holds a gemstone a foe is seen to carry it, and some floors have a treasure
// tile: a figurine that walks onto it takes one more gemstone.
// Pure: node only.   node overworld/tests/poketactica_iw_board_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as IW from '../../poketactica/js/itemworld.js';
import { campaignSetup } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { parseGem } from '../../poketactica/js/gear.js';
import { isBossFloor } from '../../poketactica/js/dungeon.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 30, makeRng('ib' + i), data, { id: 'ib-' + i, shinyRate: 0 }));
const SEED = 'iwboard1', ID = 'charcoal';

// ---------- over many floors
{
	const bad = []; let carriers = 0, tiles = 0, gems = 0, n = 0;
	for (const seed of [SEED, 'iwboard2', 'iwboard3']) for (let f = 2; f <= 60; f++) {
		const m = IW.itemFloor(seed, f, ID, data); n++;
		const hasGem = IW.findsOf(seed, f).some((x) => x.k === 'gem'), boss = isBossFloor(f), car = m.foes.filter((x) => x.carrier);
		if (hasGem && !boss) gems++;
		if (car.length !== (hasGem && !boss ? 1 : 0)) bad.push(seed + f + ': carriers ' + car.length);
		carriers += car.length;
		if (m.tile) {
			tiles++;
			const [x, y] = m.tile;
			if (boss) bad.push(seed + f + ': a tile on an exit floor');
			if (m.rows[y][x] === '#') bad.push(seed + f + ': the tile is no tile');
			if (Math.abs(x - m.base[0]) + Math.abs(y - m.base[1]) < IW.TILE_FAR) bad.push(seed + f + ': too near the base');
			if (m.foes.some((q) => q.x === x && q.y === y) || (m.symbols || []).some((q) => q.x === x && q.y === y)) bad.push(seed + f + ': on a foe or a symbol');
			const g = parseGem(IW.tileFind(seed, f).gem);
			if (!g || g.lv < 1) bad.push(seed + f + ': its gemstone');
		}
		if (JSON.stringify(IW.itemFloor(seed, f, ID, data)) !== JSON.stringify(m)) bad.push(seed + f + ': not the same twice');
		try { const S = B.newBattle('b', campaignSetup(m, team, data, 'b'), data); if (S.units.filter((u) => u.side === 'e').length !== m.foes.length) bad.push(seed + f + ': build'); } catch (e) { bad.push(seed + f + ': ' + e.message); }
	}
	A(bad.length === 0 && carriers === gems && carriers > 40, `${n} floors: every floor with a gemstone has exactly one foe carrying it (${carriers}), an exit floor none`, bad.slice(0, 6));
	A(tiles > n * 0.2 && tiles < n * 0.45, `about ${Math.round(IW.TILE_CHANCE * 100)} floors in 100 have a treasure tile (${tiles} of ${n}): a real tile, away from the base, nobody's start, never on an exit floor`, tiles);
}
// ---------- a figurine can walk to the tile
{
	let m = null, f = 2; for (; f <= 60 && !(m && m.tile); f++) m = IW.itemFloor(SEED, f, ID, data);
	const S = B.newBattle('walk', campaignSetup(m, team, data, 'walk'), data), p = S.units.find((u) => u.side === 'p');
	B.act(S, { t: 'deploy', uid: p.uid }, data);
	let on = false;
	for (let t = 0; t < 40 && !on && !S.over; t++) {
		const tiles = [...B.moveTiles(S, p).values()], [tx, ty] = m.tile;
		const best = tiles.reduce((a, q) => (Math.abs(q.x - tx) + Math.abs(q.y - ty) < Math.abs(a.x - tx) + Math.abs(a.y - ty) ? q : a), { x: p.x, y: p.y });
		if (best.x !== p.x || best.y !== p.y) B.act(S, { t: 'move', uid: p.uid, x: best.x, y: best.y }, data);
		on = p.x === tx && p.y === ty;
		if (!on) { p.hp = p.maxHP; B.act(S, { t: 'end' }, data); }
	}
	A(on, `a figurine walks from the base onto the treasure tile (floor ${f - 1}, tile ${m.tile})`);
}
// ---------- taking it
{
	const tile = [5, 3], mv = (uid, x, y) => ({ t: 'move', uid, x, y });
	A(!IW.tileTaken([], tile) && !IW.tileTaken([mv('p0', 4, 3), { t: 'end' }], tile) && !IW.tileTaken([mv('p0', 5, 3)], null), 'not taken by standing elsewhere; a floor with no tile has nothing to take');
	A(IW.tileTaken([mv('p0', 4, 3), { t: 'end' }, mv('p0', 5, 3)], tile), 'a figurine that walks onto it takes it');
	A(!IW.tileTaken([mv('p0', 5, 3), { t: 'undo', uid: 'p0' }], tile), 'a walk taken back with Undo did not happen');
	A(IW.tileTaken([mv('p0', 5, 3), { t: 'undo', uid: 'p1' }], tile) && IW.tileTaken([mv('p0', 5, 3), { t: 'end' }, mv('p0', 6, 3), { t: 'undo', uid: 'p0' }], tile), 'another figurine\'s Undo, or a later walk taken back, does not give it back');
	A(IW.tileTaken([mv('p0', 5, 3), { t: 'undo', uid: 'p0' }, mv('p1', 5, 3)], tile), 'taken back, then taken by another: taken');
}
// ---------- what a cleared floor banks
{
	const run = { uid: 'u', id: ID, from: 5, floor: 7, seed: SEED, found: [], style: 'tactics' };
	const plain = IW.afterFloor(run, 7), extra = IW.afterFloor(run, 7, [IW.tileFind(SEED, 7)]);
	A(extra.finds.length === plain.finds.length + 1 && extra.run.found.length === plain.run.found.length + 1 && JSON.stringify(extra.finds.slice(0, plain.finds.length)) === JSON.stringify(plain.finds), 'the tile\'s gemstone joins the floor\'s finds; the floor\'s own finds are what they were');
	A(JSON.stringify(IW.afterFloor(run, 7)) === JSON.stringify(IW.afterFloor(run, 7, [])), 'with no tile taken a floor banks what it always did');
	A(JSON.stringify(IW.tileFind(SEED, 7)) === JSON.stringify(IW.tileFind(SEED, 7)) && parseGem(IW.tileFind(SEED, 40).gem).lv >= parseGem(IW.tileFind(SEED, 4).gem).lv, 'the tile\'s gemstone is the same each time, and stronger deeper');
}
// ---------- the page
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8');
	A(/function iwMarks\(\)/.test(main) && /sub: 'treasure'/.test(main) && /sub: 'carries a gemstone'/.test(main), 'the board marks the treasure tile (until it is taken) and the foe that carries the gemstone (while it stands)');
	A(/afterFloor\(dive, m\.floor, gotTile \? \[tileFind\(dive\.seed, m\.floor\)\] : \[\]\)/.test(main) && /id=\\?"r-tile\\?"/.test(main), 'a cleared floor banks the tile\'s gemstone only if it was walked onto, and the results say which');
	A(/Treasure! A /.test(main), 'walking onto it says what was found');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
