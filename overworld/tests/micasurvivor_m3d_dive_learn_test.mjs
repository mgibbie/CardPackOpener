// micasurvivor_m3d_dive_learn_test.mjs — MicaSurvivor 3D, Dive part 8 (Plans/MICASURVIVOR_3D_PLAN.md §5.60): the new
// special of levels 4, 10, 16… (micasurvivor/m3d/dive.js learnCards), in node, with the 2D Dive's own rule (LEARN_AT).
//   * on those levels the cards are "learn X, forget special 1", "learn X, forget special 2", and a card that keeps your moves
//   * X is your League member's next kit move, then a move of your types
//   * the learned move takes the special's slot: it fires when pressed; the basic is never offered up
//   * other levels deal the usual cards; a level's offer is made once; the same seed offers the same move
//   node overworld/tests/micasurvivor_m3d_dive_learn_test.mjs
import { rulesFrom, newDive, stepDive, pressSpecial, learnCards } from '../../micasurvivor/m3d/dive.js';
import { dataFrom, addEnemy, choose, gainXp } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), E = G.ExpDive;
const member = X.G.BY[4], KIT = member.kit.filter((id) => !!X.L.def(id)).slice(0, R.K.SLOTS);
const run = (o = {}) => { const S = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: KIT, ...o }); S.w.pl.maxHp = S.w.pl.hp = 1e9; S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; return S; };
const step = (S) => { stepDive(S, noInput()); return S.w.events.slice(); };
/** Level up until the cards of level `lv` are up (the cards of the levels before it: the first is taken). */
const toLevel = (S, lv) => { const w = S.w, pl = w.pl; for (let k = 0; k < 4000; k++) { if (pl.choices) { if (pl.level >= lv) return pl.choices; choose(w, 0); } else if (pl.level < lv || !pl.pending) gainXp(w, Math.ceil(pl.xpNext - pl.xp) / (pl.xpMul || 1) + 0.01); step(S); } return null; };
const ids = (S) => S.w.pl.moves.map((m) => m.id);

A(R.LEARN_AT === E.LEARN_AT && [4, 10, 16, 22].every((l) => R.LEARN_AT(l)) && [1, 2, 3, 5, 9, 11, 15].every((l) => !R.LEARN_AT(l)), "the levels are the 2D Dive's: 4, 10, 16, 22…");
A(KIT.length === 3 && member.kit.length >= 4, `Charmander's kit: ${KIT.join(', ')}; then ${member.kit.slice(3).join(', ')}`, member.kit);

// ---------------------------------------------------------------- an ordinary level
{
	const S = run(), cards = toLevel(S, 2);
	A(!!cards && S.w.pl.level === 2 && !cards.some((c) => c.type === 'swap'), 'level 2: the usual cards (no move is offered in place of a special)', cards && cards.map((c) => c.key));
}
// ---------------------------------------------------------------- level 4
{
	const S = run(), cards = toLevel(S, 4), pl = S.w.pl, before = ids(S);
	const want = member.kit.slice(3).find((id) => !!X.L.def(id) && !before.includes(id));
	A(!!cards && pl.level === 4 && cards.length === 3, 'level 4: three cards', cards && cards.map((c) => [c.type, c.key]));
	A(cards[0].type === 'swap' && cards[1].type === 'swap' && cards[0].id === want && cards[1].id === want, `the first two teach ${want}, the next move of the kit`, cards.map((c) => c.id));
	A(cards[0].swapOut === before[1] && cards[1].swapOut === before[2], 'one forgets special 1, the other special 2; the basic is never offered up', cards.map((c) => c.swapOut));
	A(cards[2].kind === 'train', 'the third keeps your moves (training)', cards[2].key);
	A(cards.slice(0, 2).every((c) => /^Replaces /.test(c.tag) && /^Forgets /.test(c.desc)), 'each says what it replaces', cards.map((c) => c.tag));
	// take the first: the new move is special 1
	choose(S.w, 0); step(S);
	A(ids(S).join() === [before[0], want, before[2]].join() && pl.moves[1].xman === true && !pl.moves[0].xman, `taken: ${want} is special 1 now, in its slot`, ids(S));
	const s = pl.s, e = addEnemy(S.w, 19, s.x + 2, s.z, { t: 0, ti: 0, hp: 1e6 }); e.dummy = true;
	let ev = []; for (let i = 0; i < 90; i++) ev.push(...step(S));
	A(!ev.some((q) => q.k === 'special' && q.id === want), 'it waits to be pressed');
	pl.moves[1].t = 0;
	A(pressSpecial(S, 1) === true, 'pressed');
	ev = []; for (let i = 0; i < 30; i++) ev.push(...step(S));
	A(ev.some((q) => q.k === 'special' && q.id === want), '…it fires');
	A(learnCards(S) === null, "a level's offer is made once");
}
{	// the second card: special 2 goes
	const S = run(), cards = toLevel(S, 4), before = ids(S), want = cards[1].id;
	choose(S.w, 1); step(S);
	A(ids(S).join() === [before[0], before[1], want].join(), 'the second card: special 2 is the one forgotten', ids(S));
}
{	// the third: nothing changes in the kit
	const S = run(); toLevel(S, 4); const before = ids(S);
	choose(S.w, 2); step(S);
	A(ids(S).join() === before.join(), 'the third card: your moves stay');
}
// ---------------------------------------------------------------- level 10: the kit is spent, a move of your types
{
	const S = run(), c4 = toLevel(S, 4), first = c4[0].id;
	choose(S.w, 0); step(S);
	const cards = toLevel(S, 10);
	A(!!cards && S.w.pl.level === 10 && cards.length === 3 && cards[0].type === 'swap' && cards[0].id === cards[1].id && cards[0].id !== first && !ids(S).includes(cards[0].id), 'level 10: another new special, one you do not have', cards && cards.map((c) => [c.type, c.id]));
	const d = X.L.def(cards[0].id), types = S.w.pl.mon.types.map((t) => String(t).toLowerCase());
	A(!!d && (member.kit.includes(cards[0].id) || types.includes(String(d.type).toLowerCase())), `it is of the kit or of your types (${cards[0].id}: ${d && d.type})`, [types, d && d.type]);
	// the same seed offers the same
	const T = run(); toLevel(T, 4); choose(T.w, 0); step(T);
	const again = toLevel(T, 10);
	A(again && again[0].id === cards[0].id, 'the same run offers the same move');
}
// ---------------------------------------------------------------- off
{
	const S = run({ kit: false }), cards = toLevel(S, 4);
	A(!!cards && !cards.every((c, i) => i > 1 || c.type === 'swap'), 'a Dive without the kit (kit: false) deals the usual cards on level 4', cards && cards.map((c) => c.type));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
