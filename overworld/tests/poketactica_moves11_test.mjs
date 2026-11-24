// poketactica_moves11_test.mjs — battle RULES_REV 11 (engine/statusfx3.js): ENTRY HAZARDS as trap tiles, KNOCKBACK, and
// Mimic, Sketch, Transform, Conversion 2, Stuff Cheeks, Electrify, Ion Deluge, Powder, Court Change. Each is played on
// the real engine; the hazards also on a Tower Defense road (TD_RULES_REV 10).
//   node overworld/tests/poketactica_moves11_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import { HAZARDS, hazardsOn, resisting } from '../../poketactica/js/engine/statusfx3.js';
import * as TD from '../../poketactica/js/td/sim.js';
import { tdKind } from '../../poketactica/js/td/effects.js';
import { tdMapById } from '../../poketactica/js/td/maps.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();
const fig = (sp, tag, moves, lv = 50) => { let f = makeFigurine(sp, lv, makeRng(sp + tag), data, { id: sp + tag, shinyRate: 0 }); if (moves) f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null }; };
/** A 7 x 7 board: me (Machamp) at (3, 3); the foe (Snorlax unless o.foe) at (3, 2), standing still. */
function scene(o = {}) {
	const S = B.newBattle('m11', { map: { w: 7, h: 7, height: Array(49).fill(0), base: { x: 3, y: 3 }, ground: Array(49).fill(null) }, noBonus: true, rev: o.rev || B.RULES_REV,
		player: [fig('machamp', 'm', o.moves)], enemy: [{ fig: fig(o.foe || 'snorlax', 'f', o.foeMoves), x: 3, y: 2, ai: 'hold' }] }, data);
	const U = { S, me: S.units[0], foe: S.units[1] };
	B.act(S, { t: 'deploy', uid: U.me.uid }, data);
	U.foe.stats = { ...U.foe.stats, atk: 1, spa: 1 };   // (it stands there: what is tested is what the moves do)
	S.rng = makeRng('same').state(); S.log.length = 0;
	return U;
}
const use = (U, by, id, at) => { const t = at || (by === U.me ? U.foe : U.me); return B.useMoveAt(U.S, by, { move: id, x: t.x, y: t.y }, data).map((e) => e.t + (e.why ? ':' + e.why : '')); };
const endTurn = (U) => { U.S.log.length = 0; B.act(U.S, { t: 'end' }, data); return U.S.log.map((e) => e.t + (e.kind ? ':' + e.kind : '') + (e.why ? ':' + e.why : '')); };

// ---------- entry hazards: trap tiles
{
	const U = scene(); const log = use(U, U.me, 'spikes');
	A(log.includes('hazard') && U.S.hazards.some((h) => h.x === 3 && h.y === 2 && h.kind === 'spikes' && h.side === 'p'), 'Spikes are laid on the tiles the move covers, and stay', U.S.hazards);
	const hp = U.foe.hp, l2 = endTurn(U);
	A(hp - U.foe.hp === Math.floor(U.foe.maxHP / 8) && l2.includes('hazard-hit:spikes'), 'a foe standing on them when its phase ends loses an eighth', [hp - U.foe.hp, l2]);
	const hp2 = U.foe.hp; endTurn(U);
	A(hp2 - U.foe.hp === Math.floor(U.foe.maxHP / 8), 'and again each phase it stays there');
	U.me.x = 3; U.me.y = 2; U.foe.x = 6; U.foe.y = 6; const mine = U.me.hp; endTurn(U);
	A(U.me.hp === mine, 'the side that laid them walks over them freely');
	const old = scene({ rev: 10 });
	const ol = use(old, old.me, 'spikes'); const oh = old.foe.hp; endTurn(old);
	A(!ol.includes('hazard') && !old.S.hazards && old.foe.hp === oh, 'a battle recorded under rev 10 replays as it was played (nothing laid, nothing hurt)', ol);
}
{
	const R = scene({ foe: 'charizard' }); use(R, R.me, 'stealthrock'); const hp = R.foe.hp; endTurn(R);
	A(hp - R.foe.hp === Math.floor(R.foe.maxHP / 8 * 4), 'Stealth Rock bites by how Rock hits its types: half of a Charizard', hp - R.foe.hp);
	const F = scene({ foe: 'charizard' }); use(F, F.me, 'spikes'); const fh = F.foe.hp; endTurn(F);
	A(F.foe.hp === fh, 'a Flying type is over Spikes');
	const T = scene(); use(T, T.me, 'toxicspikes'); endTurn(T);
	A(T.foe.status === 'psn', 'Toxic Spikes poison');
	const P = scene({ foe: 'ekans' }); use(P, P.me, 'toxicspikes'); endTurn(P);
	A(P.foe.status == null && !P.S.hazards.some((h) => h.x === 3 && h.y === 2) && P.S.hazards.length > 0, 'a Poison type soaks up the ones under it: that tile is clear');
	const W = scene(); use(W, W.me, 'stickyweb'); endTurn(W); endTurn(W);
	A(W.foe.boosts.spe === -1, 'Sticky Web: Speed -1, once');
	const C = scene(); use(C, C.me, 'spikes'); use(C, C.me, 'courtchange', C.me);
	A(C.S.hazards.every((h) => h.side === 'e') && hazardsOn(C.S, { ...C.me, x: 3, y: 2 }).length === 1, 'Court Change hands the hazards to the other side');
	const S2 = scene(); use(S2, S2.foe, 'spikes', S2.me); A(S2.S.hazards.length > 0, 'a foe can lay them too');
	use(S2, S2.me, 'rapidspin');
	A(!S2.S.hazards.some((h) => Math.abs(h.x - 3) + Math.abs(h.y - 3) <= 1), 'Rapid Spin clears the ones within a tile of its user', S2.S.hazards);
	const D = scene(); use(D, D.foe, 'stealthrock', D.me); use(D, D.me, 'defog', D.me);
	A(!D.S.hazards.length, 'Defog clears the ones around where it is aimed');
	A(Object.keys(HAZARDS).length === 4, 'four kinds');
}
// ---------- knockback
{
	const U = scene(); const log = use(U, U.me, 'roar');
	A(U.foe.x === 3 && U.foe.y === 0 && log.includes('pushed'), 'Roar pushes the foe straight away from the user, 2 tiles', [U.foe.x, U.foe.y, log]);
	const E = scene(); E.foe.y = 1; E.me.y = 2; use(E, E.me, 'whirlwind');
	A(E.foe.y === 0, 'it stops at the edge of the board');
	const Dg = scene(); const hp = Dg.foe.hp; use(Dg, Dg.me, 'dragontail');
	A(Dg.foe.hp < hp && Dg.foe.y < 2, 'Dragon Tail hits and pushes');
	const O = scene({ rev: 10 }); use(O, O.me, 'roar');
	A(O.foe.y === 2, 'under rev 10 nothing was pushed (the known gap)');
}
// ---------- the rest
{
	const M = scene({ moves: ['mimic', 'tackle'] }); use(M, M.foe, 'bodyslam'); use(M, M.me, 'mimic');
	A(M.me.fig.equipped.join() === 'bodyslam,tackle' && M.me.pp.bodyslam === 5, 'Mimic: the foe\'s last move goes on in Mimic\'s place, for the battle', M.me.fig.equipped);
	const T = scene(); use(T, T.me, 'transform');
	A(T.me.types.join() === T.foe.types.join() && T.me.stats.def === T.foe.stats.def && T.me.fig.equipped.join() === T.foe.fig.equipped.slice(0, 4).join() && T.me.maxHP !== T.foe.maxHP, 'Transform: its types, stats and moves (not its HP)');
	const C = scene(); use(C, C.foe, 'thunderbolt'); use(C, C.me, 'conversion2');
	A(C.me.types.length === 1 && C.me.types[0] === resisting('Electric') && ['Electric', 'Grass', 'Ground', 'Dragon'].includes(C.me.types[0]), 'Conversion 2: it becomes a type that resists the foe\'s last move', C.me.types);
	const Sc = scene(); Sc.me.held = { berryHealFrac: 0.25 }; Sc.me.heldId = 'sitrusberry'; Sc.me.hp = 20; use(Sc, Sc.me, 'stuffcheeks', Sc.me);
	A(Sc.me.boosts.def === 2 && Sc.me.heldUsed && Sc.me.hp === 20 + Math.floor(Sc.me.maxHP / 4), 'Stuff Cheeks: it eats its berry and its Defense rises 2');
	const El = scene(); use(El, El.me, 'electrify');
	const hit = (U) => { U.S.log.length = 0; B.useMoveAt(U.S, U.foe, { move: 'tackle', x: U.me.x, y: U.me.y }, data); return (U.S.log.find((e) => e.t === 'hit') || {}).type; };
	A(hit(El) === 'Electric' && hit(El) === 'Normal', 'Electrify: the foe\'s next move is an Electric one, and only that one');
	const Io = scene(); use(Io, Io.me, 'iondeluge', Io.me);
	A(hit(Io) === 'Electric', 'Ion Deluge: Normal moves are Electric ones while it lasts');
	const Pw = scene(); use(Pw, Pw.me, 'powder'); const ph = Pw.foe.hp, mh = Pw.me.hp; const lg = use(Pw, Pw.foe, 'ember');
	A(lg.includes('fail:powder') && ph - Pw.foe.hp === Math.floor(Pw.foe.maxHP / 4) && Pw.me.hp === mh, 'Powder: the foe\'s Fire move blows up in its face', lg);
}
// ---------- on a Tower Defense road
{
	const kind = (id, tdRev) => tdKind(id, B.moveOf({ fig: { pool: [{ id, lv: 1, xp: 0 }] } }, id, data), B.RULES_REV, tdRev);
	A(kind('spikes') === 'trap' && kind('stealthrock') === 'trap' && kind('spikes', 9) === 'none', 'a hazard move is a road trap for a tower (it had no use under TD rev 9)');
	const S = TD.newRun('hz', { map: tdMapById('td-loop'), squad: [fig('machamp', 't', ['spikes', 'toxicspikes'], 30)] }, data);
	const hits = {}, hurt = [];
	for (let i = 0; i < 900 && !S.over; i++) {
		TD.step(S, i === 0 ? [{ t: 'place', fig: 0, x: 5, y: 2 }, { t: 'call' }] : S.phase !== 'wave' && i % 40 === 0 ? [{ t: 'call' }] : [], data);
		for (const e of S.ev) { if (e.t === 'hazard-hit') (hits[e.uid] = hits[e.uid] || []).push(e.kind); if (e.t === 'hurt' && e.why === 'spikes') hurt.push(e.n); }
	}
	const onRoad = (S.B.hazards || []).every((h) => S.onPath[h.y * S.B.map.w + h.x]);
	A((S.B.hazards || []).length > 0 && onRoad, 'a tower lays its hazards on the road tiles in reach', (S.B.hazards || []).length);
	A(Object.keys(hits).length > 0 && Object.values(hits).every((ks) => new Set(ks).size === ks.length) && hurt.length > 0, 'an enemy that walks over them takes each kind once', hits);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
