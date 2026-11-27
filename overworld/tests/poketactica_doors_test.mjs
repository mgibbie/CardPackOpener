// poketactica_doors_test.mjs — THE DUNGEON's CHOICE BETWEEN FLOORS (Plans/POKETACTICA_MODES_PLAN.md item D2). "The Dungeon
// is a straight line." After a floor there are two doors to the next, each saying what is behind it: the Quiet door
// (the floor as it is) or the Gilded door (stronger foes, more stars).
// Pure: node only.   node overworld/tests/poketactica_doors_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from '../../poketactica/js/dungeon.js';
import { campaignSetup } from '../../poketactica/js/campaign.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { STARTERS } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const team = STARTERS.slice(0, 3).map((sp, i) => makeFigurine(sp, 30, makeRng('dr' + i), data, { id: 'dr-' + i, shinyRate: 0 }));
const S = 'twdoor1';

// ---------- where there are two doors
{
	A(D.doorsAt(S, 2) && D.doorsAt(S, 9) && D.doorsAt(S, 11) && !D.doorsAt(S, 10) && !D.doorsAt(S, 20) && !D.doorsAt(S, 1), 'two doors lead to every floor but the first and the boss floors');
	A(!D.doorsAt('r1abc', 5) && D.genFloor('r1abc', 5, data, 'rich').door === undefined && JSON.stringify(D.genFloor('r1abc', 5, data, 'rich')) === JSON.stringify(D.genFloor('r1abc', 5, data)), 'a run begun before twists has no doors: its floor is the floor it was, whatever it is handed');
	A(JSON.stringify(D.genFloor(S, 10, data, 'rich')) === JSON.stringify(D.genFloor(S, 10, data)), 'a boss floor has one door');
}
// ---------- what is behind each
{
	A(D.doorLevel(10) === 12 && D.doorLevel(20) === 23 && D.doorLevel(100) === 115 && D.doorLevel(999) === 999 && D.doorStars(5) === 30 && D.doorStars(11) === 48, 'the Gilded door: foes 15% higher (2 levels at least), stars half as many again', [D.doorLevel(10), D.doorLevel(20), D.doorStars(5), D.doorStars(11)]);
	const say = D.doorsSay(S, 5);
	A(say.safe.name === 'Quiet door' && say.rich.name === 'Gilded door' && say.safe.level === D.floorLevel(5) && say.rich.level === D.doorLevel(D.floorLevel(5)) && say.safe.stars === D.floorStars(5) && say.rich.stars === D.doorStars(5) && say.rich.level > say.safe.level && say.rich.stars > say.safe.stars, 'each door says the level and the stars behind it', say);
	let tw = null; for (let f = 3; f < 60 && !tw; f += 3) if (D.twistOf(S, f)) tw = f;
	A(tw && D.doorsSay(S, tw).safe.twist === D.TWISTS[D.twistOf(S, tw)].name && D.doorsSay(S, tw).rich.twist === D.doorsSay(S, tw).safe.twist && D.doorsSay(S, 4).safe.twist === null, 'and the floor\'s twist, when it has one');
}
// ---------- the floors behind them
{
	const bad = []; let n = 0;
	for (let f = 2; f <= 45; f++) {
		if (!D.doorsAt(S, f)) continue; n++;
		const a = D.genFloor(S, f, data), b = D.genFloor(S, f, data, 'rich');
		if (a.door || b.door !== 'rich') bad.push(f + ': mark');
		if (JSON.stringify(a.rows) !== JSON.stringify(b.rows) || JSON.stringify(a.geo) !== JSON.stringify(b.geo) || JSON.stringify(a.symbols) !== JSON.stringify(b.symbols) || a.base.join() !== b.base.join()) bad.push(f + ': the board');
		if (!(b.foes.length === a.foes.length && b.foes.every((x, i) => x.sp === a.foes[i].sp && x.x === a.foes[i].x && x.y === a.foes[i].y && x.lv === D.doorLevel(a.foes[i].lv) && x.ai === a.foes[i].ai && !!x.treasure === !!a.foes[i].treasure))) bad.push(f + ': foes');
		if (b.reward.stars !== D.doorStars(f) || a.reward.stars !== D.floorStars(f) || !b.name.endsWith('Gilded door') || !b.tip.startsWith('Behind the Gilded door') || b.tip.includes('Clear it for ' + D.floorStars(f) + ' ★')) bad.push(f + ': stars or words');
		if (b.twist !== a.twist) bad.push(f + ': twist');
		// (in the battle: each foe is as much stronger than the Quiet door's as the floor says. A Geo colour can raise a foe's level in both.)
		try { const lv = (m) => B.newBattle('d' + f, campaignSetup(m, team, data, 'd' + f), data).units.filter((u) => u.side === 'e').map((u) => u.level), la = lv(a), lb = lv(b); if (!(lb.length === la.length && lb.every((x, i) => x - la[i] === b.foes[i].lv - a.foes[i].lv && x > la[i]))) bad.push(f + ': levels in battle'); } catch (e) { bad.push(f + ': ' + e.message); }
	}
	A(n > 30 && bad.length === 0, `${n} floors: behind the Gilded door is the same board, the same foes on the same tiles (and the same twist), every foe stronger, the stars higher; the engine builds each`, bad.slice(0, 6));
	A(JSON.stringify(D.genFloor(S, 7, data, 'rich')) === JSON.stringify(D.genFloor(S, 7, data, 'rich')), 'the same each time it is made (a battle resumed is the battle left)');
}
// ---------- the run keeps the door
{
	const store = new Map(), LS = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
	D.saveRun({ seed: S, floor: 5, clean: 2, door: 'rich' }, LS);
	A(JSON.stringify(D.loadRun(LS)) === JSON.stringify({ seed: S, floor: 5, clean: 2, door: 'rich' }), 'a run saved with its door is loaded with it');
	D.saveRun({ seed: S, floor: 6 }, LS);
	A(D.loadRun(LS).door === undefined, 'the next floor has no door taken yet');
	store.set(D.RUN_KEY, JSON.stringify({ seed: S, floor: 6, door: 'anything' }));
	A(D.loadRun(LS).door === undefined, 'a door this build does not know is no door');
}
// ---------- the page
{
	const main = fs.readFileSync(path.join(ROOT, 'poketactica/js/main.js'), 'utf8'), hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8');
	A((main.match(/genFloor\((P\.)?run\.seed, (P\.)?run\.floor, P\.data, (P\.)?run\.door\)/g) || []).length === 2, 'a new battle and a resumed one both make the floor behind the run\'s door');
	A(/won && nt\.kind === 'dungeon' && team\.length && !nt\.run\.door && doorsAt\(nt\.run\.seed, nt\.run\.floor\)/.test(main) && /through\(null\)\)\.classList\.add\('pt-rnext', 'pt-door'\)/.test(main) && /through\('rich'\)/.test(main), 'after a floor is won the results offer the two doors; Z is the Quiet door');
	A(/const through = \(door\) => \{ const run = door \? \{ \.\.\.nt\.run, door \} : nt\.run; saveRun\(run\);/.test(main), 'the door taken is saved with the run before the battle starts');
	A(/by the Gilded door/.test(hub) && /if \(t\.kind === 'dungeon' && t\.run\.door\) saveRun\(t\.run\);/.test(hub) && /id=\\?"floor-door\\?"/.test(hub), 'the Dungeon screen offers the Gilded door too, and says which door a floor is behind');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
