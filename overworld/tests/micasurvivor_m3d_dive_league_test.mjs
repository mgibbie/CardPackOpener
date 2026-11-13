// micasurvivor_m3d_dive_league_test.mjs — MicaSurvivor 3D, Dive part 10 (Plans/MICASURVIVOR_3D_PLAN.md §5.62): a Dive as a
// League member (micasurvivor/m3d/dive.js with o.league), in node.
//   * you start as the member's first stage, with the League's stats, and its kit's first three moves: the basic and
//     both specials (PokéDive's start); a Dive never holds a fourth
//   * it evolves at its level, also when that level is one that offers a new special (16 for Charmander)
//   * the new special of level 4 is the kit's fourth move
//   * the save gets the League's counters and the forms reached
//   * without o.league a Dive is as before
//   node overworld/tests/micasurvivor_m3d_dive_league_test.mjs
import { rulesFrom, newDive, stepDive, result } from '../../micasurvivor/m3d/dive.js';
import * as DS from '../../micasurvivor/m3d/divesave.js';
import { applyOps } from '../../micasurvivor/m3d/expsave.js';
import { dataFrom, choose, gainXp, hashWorld } from '../../micasurvivor/m3d/combat.js';
import { expFrom } from '../../micasurvivor/m3d/expedition.js';
import { noInput } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };

const G = loadG(['systems/expedition.js', 'expedition/dive-gen.js', 'expedition/dive.js']);
const data = dataFrom(G), X = expFrom(G), R = rulesFrom(G), LG = X.G, M = LG.BY[4];
const run = (o = {}) => { const S = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, league: true, ...o }); S.w.enemies.length = 0; S.groups.length = 0; S.ft = 1e9; return S; };
const step = (S) => { stepDive(S, noInput()); return S.w.events.slice(); };
const ids = (S) => S.w.pl.moves.map((m) => m.id);
/** Level up to `lv`, taking card `pickAt(level, cards)` (default: the last card, which keeps the kit on a learn level). -> { cards (level lv's), seen: { level: cards } } */
const toLevel = (S, lv, pickAt = (l, c) => c.length - 1) => { const w = S.w, pl = w.pl, seen = {}; for (let k = 0; k < 20000; k++) { pl.hp = pl.maxHp; if (pl.choices) { seen[pl.level] = pl.choices.map((c) => [c.type, c.kind, c.id || c.key]); if (pl.level >= lv) return { cards: pl.choices, seen }; choose(w, pickAt(pl.level, pl.choices)); } else if (pl.level < lv || !pl.pending) gainXp(w, Math.ceil(pl.xpNext - pl.xp) / (pl.xpMul || 1) + 0.01); step(S); } return { cards: null, seen }; };
const kit3 = M.kit.slice(0, R.K.SLOTS);

// ---------------------------------------------------------------- the start
{
	const S = run(), pl = S.w.pl, st = LG.statsOf(4);
	A(!!S.lg && S.lg.member === 4 && S.lg.form === 4 && pl.mon.dex === 4, 'a Dive with the League: you are the member, at its first stage');
	A(pl.maxHp === st.hp && pl.hp === pl.maxHp && pl.baseAtk === st.atk, "its HP and attack are the League's", [pl.maxHp, st.hp, pl.baseAtk, st.atk]);
	A(ids(S).join() === kit3.join() && !pl.moves[0].xman && pl.moves[1].xman && pl.moves[2].xman, `it starts with the kit's first three: ${kit3.join(', ')} (the basic and both specials)`, ids(S));
	A(pl.moves.every((m) => m.xk === LG.factorOf(m.id, S.lg.st)), "each at its class's factor for the stage");
	const S9 = run({ dex: 6 });
	A(S9.lg.member === 4 && S9.w.pl.mon.dex === 4, 'asked for a later stage (Charizard): its member, from the first stage');
}
// ---------------------------------------------------------------- the levels
{
	const S = run(), pl = S.w.pl;
	const a = toLevel(S, 4);
	A(ids(S).length === 3 && S.spare.length === 0, 'levels 2 and 3: the kit stays three (a Dive never holds a fourth move)', ids(S));
	A(a.cards && a.cards[0].type === 'swap' && a.cards[0].id === M.kit[3] && a.cards[1].id === M.kit[3], `level 4 offers the kit's fourth move (${M.kit[3]}) in place of a special`, a.seen[4]);
	// on to the evolution's level, keeping the kit each time
	const evoLv = LG.evoLevel(M, 4), to = LG.nextOf(M, 4)[0][0];
	const all = []; const w = S.w;
	for (let k = 0; k < 20000 && S.lg.form === 4; k++) { pl.hp = pl.maxHp; if (pl.choices) choose(w, pl.choices.length - 1); else gainXp(w, Math.ceil(pl.xpNext - pl.xp) / (pl.xpMul || 1) + 0.01); all.push(...step(S)); }
	A(S.lg.form === to && pl.mon.dex === to && S.lg.evo === 1 && pl.level === evoLv, `it evolves into dex ${to} at level ${evoLv} (a level that also offers a new special: the evolution is not put off)`, [S.lg.form, pl.level, evoLv, R.LEARN_AT(evoLv)]);
	A(all.some((q) => q.k === 'evolve' && q.to === to), 'the page is told');
	A(ids(S).length === 3 && pl.moves[1].xman && pl.moves[2].xman && pl.moves.every((m) => m.xk === LG.factorOf(m.id, S.lg.st)), "its moves are at the new stage's factors, and still a basic and two specials");
	A(result(S).parts.form === to && result(S).parts.evos === 1, "the run's result has the form reached");
	// the save
	const c = {}, s = {}, Sv = { who: 'guest', data: {}, get: (k) => c[k] || 0, has: (k, v) => !!(s[k] && s[k].includes(String(v))), bump: (k, n) => { c[k] = (c[k] || 0) + n; }, best: (k, v) => { c[k] = Math.max(c[k] || 0, v); }, add: (k, v) => { s[k] = s[k] || []; if (!s[k].includes(String(v))) s[k].push(String(v)); }, commit: () => {} };
	S.ended = true; S.lost = true;
	applyOps(Sv, DS.recordOps(S, result(S), { dev: 'dv1' }));
	A(c['lg.evo'] === 1 && c['lg.runs.4'] === 1 && c['lg.best.4'] === pl.level && c['lg.lv'] === pl.level && s['league.played'].join() === '4' && s['league.form'].includes(String(to)), 'the save gets the League\'s counters and the form reached (it is yours from now on)', [c, s]);
	A(c['dive.runs'] === 1, '…with the Dive\'s own');
}
// ---------------------------------------------------------------- the same run
{
	const one = () => { const S = run({ seed: 5 }); toLevel(S, 6); return [hashWorld(S.w), ids(S).join(), S.w.pl.level]; };
	A(JSON.stringify(one()) === JSON.stringify(one()), 'the same Dive gives the same levels');
}
// ---------------------------------------------------------------- without the League
{
	const S = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, moves: ['ember', 'water-gun', 'tackle'] });
	A(!S.lg && ids(S).join() === 'ember,water-gun,tackle' && result(S).parts.evos === 0, 'without o.league a Dive is as before: the moves you name, no League');
	const ops = DS.recordOps(Object.assign(S, { ended: true, lost: true }), result(S), { dev: 'dv1' });
	A(!ops.some((q) => /^lg\.|^league\./.test(q[1])), '…and writes nothing of the League');
	const K = newDive(data, X, R, { route: 'forest', seed: 7, dex: 4, league: true, kit: false, moves: ['ember'] });
	A(!K.lg, 'a Dive without the kit (kit: false) has no League either');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
