// poketactica_deepgear_test.mjs — THE DUNGEON's FOES WITH LEVELLED ITEMS, DEEP DOWN (Plans/POKETACTICA_MODES_PLAN.md item
// D3). "The player's ceiling rose with the Item World; nothing else's did." From floor 30 the boss's held item is
// levelled, and some of the other foes hold their type's booster at that level.
// Pure: node only.   node overworld/tests/poketactica_deepgear_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from '../../poketactica/js/dungeon.js';
import { campaignSetup, foeFigure } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { heldAt, kOf } from '../../poketactica/js/gear.js';
import { HELD } from '../../poketactica/js/goods.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 60, makeRng('dg' + i), data, { id: 'dg-' + i, shinyRate: 0 }));
const S = 'twgear1';

// ---------- the numbers
{
	A(D.GEAR_FROM === 30 && D.gearLevel(29) === 1 && D.gearLevel(30) === 10 && D.gearLevel(40) === 25 && D.gearLevel(60) === 55 && D.gearLevel(90) === 100 && D.gearLevel(500) === 100, 'an item is Lv 10 at floor 30, 1.5 more a floor, 100 at most', [D.gearLevel(30), D.gearLevel(40), D.gearLevel(90)]);
	A(D.gearCount(29) === 0 && D.gearCount(30) === 1 && D.gearCount(49) === 1 && D.gearCount(50) === 2 && D.gearCount(70) === 3 && D.gearCount(90) === 4 && D.gearCount(400) === 4, 'one ordinary foe holds one at floor 30, one more every 20 floors, four at most');
	A(D.gearAt(S, 30) && !D.gearAt(S, 29) && !D.gearAt('r1abc', 60) && !D.gearAt('iwabc', 60), 'from floor 30 of a run with twists; never an older run or an Item World dive');
}
// ---------- the floors
{
	const bad = []; let n = 0, bosses = 0;
	for (let f = 30; f <= 95; f++) {
		const m = D.genFloor(S, f, data), lv = D.gearLevel(f); n++;
		const held = m.foes.filter((x) => x.held), boss = m.foes.find((x) => x.boss);
		if (!m.gear || m.gear.lv !== lv || m.gear.n !== held.length) bad.push(f + ': mark');
		if (!held.every((x) => x.heldLv === lv && HELD[x.held])) bad.push(f + ': levels');
		if (m.foes.some((x) => x.treasure && x.held)) bad.push(f + ': a treasure foe holds one');
		const plain = held.filter((x) => !x.boss).length, room = m.foes.filter((x) => !x.boss && !x.treasure).length;
		if (plain !== Math.min(D.gearCount(f), room)) bad.push(f + ': count ' + plain);
		if (boss) { bosses++; if (!boss.held || boss.heldLv !== lv) bad.push(f + ': the boss'); }
		if (!m.tip.startsWith(`Deep floor: ${held.length} of the foes hold`) || !m.tip.includes('a Lv ' + lv + ' item')) bad.push(f + ': not said');
		if (!held.filter((x) => !x.boss).every((x) => x.held === (D.BOSS_HELD[data.species[x.sp].types[0]] || 'sitrusberry'))) bad.push(f + ': not the item of its type');
		try {
			const Sx = B.newBattle('g' + f, campaignSetup(m, team, data, 'g' + f), data), es = Sx.units.filter((u) => u.side === 'e');
			if (!m.foes.every((x, i) => (x.held ? es[i].heldId === x.held && es[i].held && es[i].held.lv === lv : !es[i].heldId))) bad.push(f + ': in battle');
		} catch (e) { bad.push(f + ': ' + e.message); }
	}
	A(n === 66 && bosses >= 6 && bad.length === 0, `floors 30 to 95: the boss and the right number of other foes hold their type's item at the floor's level, a treasure foe none; the tip says so; in the battle each unit holds it at that level`, bad.slice(0, 6));
	const a = D.genFloor(S, 29, data), o = D.genFloor('r1abc', 45, data);
	A(!a.gear && !a.foes.some((x) => x.heldLv) && !o.gear && !o.foes.some((x) => x.heldLv), 'floor 29 has none, and an older run\'s floor 45 is what it was');
	A(JSON.stringify(D.genFloor(S, 44, data)) === JSON.stringify(D.genFloor(S, 44, data)), 'the same each time it is made');
	// the Gilded door keeps them
	const g = D.genFloor(S, 44, data, 'rich');
	A(g.door === 'rich' && g.gear && g.foes.filter((x) => x.heldLv).length === D.genFloor(S, 44, data).foes.filter((x) => x.heldLv).length, 'behind the Gilded door the same foes hold them');
}
// ---------- a levelled item is stronger
{
	const f = { sp: 'charmander', lv: 50, x: 0, y: 0, held: 'charcoal' }, plain = foeFigure(f, data, 'x'), lev = foeFigure({ ...f, heldLv: 55 }, data, 'x');
	A(!plain.gear && lev.gear && lev.gear.lv === 55 && lev.held === 'charcoal', 'a foe\'s figurine carries its item\'s level');
	const h1 = heldAt('charcoal', 1), h55 = heldAt('charcoal', 55);
	A(h55.lv === 55 && Math.abs(h55.k - kOf(55)) < 1e-9 && h55.k > 2 && !h1.lv, `the item at Lv 55 is the player's own Lv 55 item (its bonus x${kOf(55).toFixed(2)})`, [h55.k]);
}
// ---------- the page
{
	const hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8'), main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8');
	A(/id="floor-gear"/.test(hub) && /gearAt\(run\.seed, f\)/.test(hub), 'the Dungeon screen says a deep floor\'s items before it is entered');
	A(/u\.held && u\.held\.lv > 1 \? ' Lv ' \+ u\.held\.lv/.test(main), 'a foe\'s panel in battle shows its item\'s level, as a figurine\'s does');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
