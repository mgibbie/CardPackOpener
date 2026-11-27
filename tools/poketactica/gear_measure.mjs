// gear_measure.mjs — THE ITEM WORLD's BALANCE, MEASURED (Plans/POKETACTICA_MODES_PLAN.md item I4). "Built, never
// measured": a held item's bonus grows from x1 at level 1 to x3 at level 100 (gear.js kOf), and each plush gemstone adds
// 0.5% of a stat a level. This plays the Tower Defense Road's auto-player with the same squad holding nothing, then its
// type's booster at several levels, then that booster with every slot full of gemstones, and prints how far each gets.
// It also prints the sums themselves: what one figurine's stats and a boosted move's damage multiplier come to.
//   node tools/poketactica/gear_measure.mjs [--map=td-loop] [--level=20,40] [--runs=4] [--squad=12]
import path from 'path';
import { fileURLToPath } from 'url';
import { loadData, squadAt, autoRun } from './td_auto.mjs';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import { BOSS_HELD } from '../../poketactica/js/dungeon.js';
import { HELD } from '../../poketactica/js/goods.js';
import { kOf, slotsAt, gemStr, heldTextAt, gemMults } from '../../poketactica/js/gear.js';
import { battleStats } from '../../poketactica/js/figurine.js';

/** A squad with every figurine holding its type's booster at item level `lv`, every slot full of gemstones of `gem` level
 *  (0: no gemstones; lv 0: nothing held). The gemstones: Attack and Sp. Atk in turn (the stats a tower hits with). */
export function gearedSquad(level, n, data, lv, gem) {
	return squadAt(level, n, data).map((f) => {
		if (!lv) return f;
		const held = BOSS_HELD[(data.species[f.species].types || [])[0]] || 'silkscarf';
		const gems = gem ? Array.from({ length: slotsAt(lv) }, (_, i) => gemStr(i % 2 ? 'spa' : 'atk', gem)) : [];
		return { ...f, held: HELD[held] ? held : 'silkscarf', ...(lv > 1 || gems.length ? { gear: { lv, gems } } : {}) };
	});
}
/** The cases measured: [label, item level, gemstone level]. */
export const CASES = Object.freeze([['nothing held', 0, 0], ['item Lv 1', 1, 0], ['item Lv 25', 25, 0], ['item Lv 50', 50, 0], ['item Lv 100', 100, 0], ['item Lv 50 + Lv 25 gems', 50, 25], ['item Lv 100 + Lv 50 gems', 100, 50], ['item Lv 100 + Lv 100 gems', 100, 100]]);
/** The waves a case reaches: -> { avg, min, max } over `runs` seeds. */
export function measure(map, level, n, data, lv, gem, runs) {
	const got = [];
	for (let r = 0; r < runs; r++) got.push(autoRun('gear-' + r, map, gearedSquad(level, n, data, lv, gem), data).wave);
	return { avg: got.reduce((a, b) => a + b, 0) / got.length, min: Math.min(...got), max: Math.max(...got) };
}
/** The sums: a type booster's damage multiplier at a level, and what full slots of gemstones do to a stat. */
export function sums() {
	const out = [];
	for (const lv of [1, 25, 50, 75, 100]) {
		// (the multiplier is read from the item's own text at that level: the number the player is shown, and the engine's)
		const boost = +((/([\d.]+)×/.exec(heldTextAt('charcoal', lv)) || [])[1] || 0) || null;
		const slots = slotsAt(lv);
		out.push({ lv, k: kOf(lv), boost, slots, gems: [25, 50, 100].map((g) => ({ g, half: gemMults({ gems: Array.from({ length: slots }, (_, i) => gemStr(i % 2 ? 'spa' : 'atk', g)) }).atk, all: gemMults({ gems: Array.from({ length: slots }, () => gemStr('atk', g)) }).atk })) });
	}
	return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const arg = (n, d) => { const h = process.argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
	const data = loadData(), map = tdMapById(arg('map', 'td-loop')), runs = +arg('runs', 4), n = +arg('squad', 12);
	console.log('The sums (a type booster, Charcoal Stick):');
	for (const s of sums()) console.log(`  item Lv ${s.lv}: bonus x${s.k.toFixed(2)}${s.boost ? ', its type\'s moves x' + s.boost.toFixed(2) : ''}, ${s.slots} slots · full of Attack gemstones: ` + s.gems.map((g) => `Lv ${g.g} = Attack x${g.all.toFixed(2)}`).join(', '));
	{ const f0 = gearedSquad(40, 1, data, 0, 0)[0], f1 = gearedSquad(40, 1, data, 100, 100)[0], a = battleStats(f0, data), b = battleStats(f1, data); console.log(`  one figurine (${f0.species} Lv 40): Attack ${a.atk} -> ${b.atk}, Sp. Atk ${a.spa} -> ${b.spa} with a Lv 100 item full of Lv 100 gemstones (half Attack, half Sp. Atk)`); }
	for (const level of arg('level', '20,40').split(',').map(Number)) {
		console.log(`\n${map.name}, ${n} at Lv ${level}, ${runs} runs each (the Road's auto-player):`);
		let base = null;
		for (const [label, lv, gem] of CASES) { const r = measure(map, level, n, data, lv, gem, runs); if (base == null) base = r.avg; console.log(`  ${label.padEnd(28)} waves ${r.min}-${r.max} (avg ${r.avg.toFixed(1)})  ${r.avg >= base ? '+' : ''}${(r.avg - base).toFixed(1)}`); }
	}
}
