// poketactica_plain_items_test.mjs — THE PLAIN HELD ITEMS GAIN BY LEVEL (Plans/POKETACTICA_MODES_PLAN.md item I1; battle
// rules 13). Ten held items had no number of their own, so a level gave them slots and nothing else: the seven curing
// beads, Focus Thread, White Moss and Scope Sight. Each now gains PLAIN_PER_K × (k − 1): nothing at level 1, 20% at 100.
//   a curing bead, White Moss   also heal that much of max HP when they work
//   Focus Thread                leaves that much of max HP (1 HP at level 1)
//   Scope Sight                 its critical hits deal that much more
// A level 1 item plays exactly as before, and so does a battle recorded under rules 12.
// Pure: node only.   node overworld/tests/poketactica_plain_items_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as TD from '../../poketactica/js/td/sim.js';
import * as MM from '../../poketactica/js/mm/turn.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { HELD } from '../../poketactica/js/goods.js';
import { TD_MAPS } from '../../poketactica/js/td/maps.js';
import { PLAIN_ITEMS, PLAIN_PER_K, LEVEL_PLAIN, kOf, heldAt, heldTextAt } from '../../poketactica/js/gear.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const flat = (w = 8, h = 8, base = { x: 1, y: h - 2 }) => ({ w, h, height: Array(w * h).fill(0), base });
const fig = (sp, lv, moves, opt = {}) => {
	let f = makeFigurine(sp, lv, makeRng(opt.seed || sp + lv), data, { shinyRate: 0 });
	f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] };
	f = equip(f, moves);
	return opt.held ? { ...f, held: opt.held, ...(opt.lv > 1 ? { gear: { lv: opt.lv, gems: [] } } : {}) } : f;
};
const battle = (player, foes, { seed = 'g', rev } = {}) => B.newBattle(seed, { map: flat(), player, enemy: foes.map(([f, x, y]) => ({ fig: f, x, y, ai: 'hold' })), rev: rev || B.RULES_REV }, data);
const go = (S, a) => B.act(S, a, data);
const evs = (S, t) => S.log.filter((e) => e.t === t);
const frac = (lv) => PLAIN_PER_K * (kOf(lv) - 1);

// ---------- the ten, and what the camp says of them
{
	A(B.RULES_REV >= 13 && PLAIN_ITEMS.length === 10 && ['lumberry', 'cheriberry', 'focussash', 'whiteherb', 'scopelens'].every((id) => PLAIN_ITEMS.includes(id)), 'battle rules 13; ten plain items (seven curing beads, Focus Thread, White Moss, Scope Sight)', PLAIN_ITEMS);
	A(LEVEL_PLAIN.length === 0, 'no item is left whose level changes no number');
	A(Math.abs(frac(1)) < 1e-9 && Math.abs(frac(100) - 0.2) < 1e-9 && frac(50) > 0.09 && frac(50) < 0.11, 'what a level adds: nothing at level 1, about 10% at level 50, 20% at level 100', [frac(1), frac(50), frac(100)]);
	A(PLAIN_ITEMS.every((id) => heldTextAt(id, 1) === HELD[id].text && heldAt(id, 1) === HELD[id].held), 'at level 1 each reads and plays as it always did');
	A(PLAIN_ITEMS.every((id) => heldTextAt(id, 100) !== HELD[id].text && /20%/.test(heldTextAt(id, 100))), 'at level 100 each says its 20%', PLAIN_ITEMS.map((id) => heldTextAt(id, 100)));
	A(heldTextAt('cheriberry', 100) === 'Once a battle: cures paralysis and heals 20% of its HP.' && heldTextAt('focussash', 100) === 'Once a battle: at full HP, a hit that would knock it out leaves it on 20% of its HP.' && heldTextAt('scopelens', 100) === 'Critical hits are twice as likely and deal 20% more damage.' && heldTextAt('whiteherb', 100) === 'Once a battle: undoes its lowered stats and heals 20% of its HP.', 'in words: a bead, the thread, the sight, the moss at level 100');
}
// ---------- Focus Thread: leaves more than 1 HP, and the forecast says so
{
	const left = (lv, rev) => {
		const S = battle([fig('machamp', 100, ['karatechop'])], [[fig('rattata', 5, ['tackle'], { held: 'focussash', lv }), 1, 5]], { rev }); go(S, { t: 'deploy', uid: 'p0' });
		const f = B.forecast(S, S.units[0], 'karatechop', 1, 5, data).targets[0];
		go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' });
		const v = S.units[1];
		return { hit: evs(S, 'hit').length > 0, hp: v.hp, max: v.maxHP, f };
	};
	const a = left(1), b = left(100), c = left(100, 12);
	A(a.hit && a.hp === 1 && a.f.max === a.max - 1, 'a level 1 Focus Thread leaves 1 HP, as before', a);
	A(b.hit && b.hp === Math.max(1, Math.floor(b.max * 0.2)) && b.hp > 1 && b.f.sash && b.f.ko === 'no' && b.f.max === b.max - b.hp, 'a level 100 one leaves 20% of its HP, and the forecast said so', b);
	A(c.hit && c.hp === 1, 'a battle recorded under rules 12 plays a level 100 thread as it did: 1 HP', c);
}
// ---------- a curing bead: cures, and heals
{
	const run = (lv, rev) => {
		for (let i = 0; i < 40; i++) {
			const S = battle([fig('pikachu', 30, ['thunderwave'])], [[fig('snorlax', 30, ['tackle'], { held: 'cheriberry', lv }), 1, 5]], { seed: 'tw' + i, rev }); go(S, { t: 'deploy', uid: 'p0' });
			const v = S.units[1]; v.hp = Math.floor(v.maxHP / 2);
			const hp0 = v.hp;
			go(S, { t: 'attack', uid: 'p0', move: 'thunderwave', x: 1, y: 5 }); go(S, { t: 'execute' });
			if (!S.log.some((e) => e.t === 'status')) continue;
			return { cured: v.status === null, gain: v.hp - hp0, max: v.maxHP };
		}
		return null;
	};
	const a = run(1), b = run(100), c = run(100, 12);
	A(a && a.cured && a.gain === 0, 'a level 1 Cheri Bead cures the paralysis and heals nothing, as before', a);
	A(b && b.cured && b.gain === Math.floor(b.max * 0.2), 'a level 100 one cures it and heals 20% of its HP', b);
	A(c && c.cured && c.gain === 0, 'under rules 12 a level 100 bead only cures', c);
}
// ---------- White Moss: undoes the drop, and heals
{
	const run = (lv) => {
		const S = battle([fig('machamp', 30, ['leer'])], [[fig('snorlax', 30, ['tackle'], { held: 'whiteherb', lv }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		const v = S.units[1]; v.hp = Math.floor(v.maxHP / 2); const hp0 = v.hp;
		go(S, { t: 'attack', uid: 'p0', move: 'leer', x: 1, y: 6 }); go(S, { t: 'execute' });
		return { def: v.boosts.def, gain: v.hp - hp0, max: v.maxHP };
	};
	const a = run(1), b = run(100);
	A(a.def === 0 && a.gain === 0 && b.def === 0 && b.gain === Math.floor(b.max * 0.2), 'White Moss: level 1 undoes the drop; level 100 also heals 20% of its HP', [a, b]);
}
// ---------- Scope Sight: its critical hits hit harder
{
	// the same seeds with a level 1 and a level 100 sight: where both are critical hits, the level 100 one deals about 1.2 times as much
	let seen = 0, ok = 0, plainSame = 0, plainSeen = 0;
	for (let i = 0; i < 120 && seen < 6; i++) {
		const one = (lv, rev) => { const S = battle([fig('machamp', 50, ['karatechop'], { held: 'scopelens', lv })], [[fig('snorlax', 60, ['tackle']), 1, 5]], { seed: 'crit' + i, rev }); go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' }); return evs(S, 'hit')[0]; };
		const a = one(1), b = one(100), c = one(100, 12);
		if (!a || !b) continue;
		if (a.crit && b.crit) { seen++; const r = b.dmg / a.dmg; if (r > 1.17 && r < 1.23) ok++; if (c && c.dmg === a.dmg) plainSame++; }
		else if (!a.crit && !b.crit) { plainSeen++; if (a.dmg !== b.dmg) plainSeen = -999; }
	}
	A(seen >= 3 && ok === seen, `Scope Sight at level 100: a critical hit deals 1.2 times a level 1 sight's (${seen} critical hits compared)`, [seen, ok]);
	A(plainSeen > 0, 'a hit that is not critical is the same at any level');
	A(plainSame === seen, 'under rules 12 a level 100 sight hits as a level 1 one');
}
// ---------- the other modes: new runs play by rules 13, recorded ones by what they were recorded under
{
	A(TD.TD_RULES_REV >= 19 && MM.MM_RULES_REV >= 23, 'Tower Defense rules 19 and Mystery Maze rules 23 carry battle rules 13');
	const squad = [fig('pikachu', 20, ['thundershock'])];
	const tdNow = TD.newRun('rv', { map: TD_MAPS[0], squad }, data), tdOld = TD.newRun('rv', { map: TD_MAPS[0], squad, rev: 18 }, data);
	A(tdNow.B.rev === 13 && tdOld.B.rev === 12, 'a Tower Defense run recorded under rules 18 fights by battle rules 12; a new one by 13', [tdNow.B.rev, tdOld.B.rev]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
