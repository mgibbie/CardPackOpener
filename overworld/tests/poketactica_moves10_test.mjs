// poketactica_moves10_test.mjs — the moves carried into Poketactica by battle RULES_REV 10 (engine/statusfx2.js): about
// 40 from the moves sweep's list of those that did nothing. Each is played on the real engine.
// The owner's rules for permanent loss (2026-11-23) are pinned here too: Perish Song, Destiny Bond, Grudge and Revival
// Blessing stay off; Healing Wish and Lunar Dance heal without anyone fainting.
//   node overworld/tests/poketactica_moves10_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import { EXTRA10, CALLS } from '../../poketactica/js/engine/statusfx2.js';
import { marksOf } from '../../poketactica/js/engine/statusfx.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();

const fig = (sp, tag, moves) => { let f = makeFigurine(sp, 50, makeRng(sp + tag), data, { id: sp + tag, shinyRate: 0 }); if (moves) f = equip({ ...f, pool: [...f.pool.filter((p) => !moves.includes(p.id)), ...moves.map((id) => ({ id, lv: 1, xp: 0 }))] }, moves); return { ...f, ability: null }; };
/** A 7 x 7 board: me (Machamp) at (3, 3), an ally (Eevee) at (2, 3) if asked, the foe (Snorlax unless o.foe) at (3, 2). */
function scene(o = {}) {
	const S = B.newBattle('m10', { map: { w: 7, h: 7, height: Array(49).fill(0), base: { x: 3, y: 3 }, ground: Array(49).fill(null) }, noBonus: true, rev: o.rev || B.RULES_REV,
		player: [fig('machamp', 'm', o.moves), ...(o.ally ? [fig('eevee', 'a')] : [])], enemy: [{ fig: fig(o.foe || 'snorlax', 'f', o.foeMoves), x: 3, y: 2, ai: o.ai || 'hold' }] }, data);
	const U = { S, me: S.units[0], ally: o.ally ? S.units[1] : null, foe: S.units[o.ally ? 2 : 1] };
	if (U.ally) { U.ally.x = 2; U.ally.y = 3; }
	B.act(S, { t: 'deploy', uid: U.me.uid }, data);
	S.rng = makeRng('same').state(); S.log.length = 0;
	return U;
}
const use = (U, by, id, at) => { const t = at || (by === U.me ? U.foe : U.me); return B.useMoveAt(U.S, by, { move: id, x: t.x, y: t.y }, data).map((e) => e.t + (e.why ? ':' + e.why : '') + (e.t === 'calls' ? ':' + e.move : '')); };
const mine = (U, id) => use(U, U.me, id, U.me);
const dmgTo = (U, v, f) => { const hp = v.hp; f(); return hp - v.hp; };

// ---------- the owner's rules for permanent loss
{
	for (const id of ['perishsong', 'destinybond', 'grudge', 'revivalblessing']) {
		const U = scene(), before = JSON.stringify([U.me.hp, U.foe.hp, U.me.fx, U.foe.fx]);
		const log = id === 'perishsong' || id === 'revivalblessing' ? mine(U, id) : mine(U, id);
		A(!EXTRA10[id] && JSON.stringify([U.me.hp, U.foe.hp, U.me.fx, U.foe.fx]) === before && !log.includes('ko'), `${data.moves[id].name} stays off: nothing happens`, log);
	}
	const U = scene({ ally: true }); U.ally.hp = 10; U.ally.status = 'par';
	const hp = U.me.hp; mine(U, 'healingwish');
	A(U.me.hp === hp - Math.floor(U.me.maxHP / 2) && U.me.hp > 0 && U.ally.hp === 10 + Math.floor(U.ally.maxHP / 2) && U.ally.status === 'par', 'Healing Wish: the ally beside it is healed by half, the user pays half its HP and does NOT faint', [U.me.hp, U.ally.hp]);
	const L = scene({ ally: true }); L.ally.hp = 10; L.ally.status = 'par'; mine(L, 'lunardance');
	A(L.me.hp > 0 && L.ally.hp === 10 + Math.floor(L.ally.maxHP / 2) && L.ally.status === null, 'Lunar Dance: the same, and it cures the ally');
	const N = scene(); const log = mine(N, 'healingwish');
	A(N.me.hp === N.me.maxHP && log.includes('noeffect'), 'with no hurt ally beside it, it does nothing (and costs nothing)', log);
	const old = scene({ ally: true, rev: 9 }); old.ally.hp = 10; mine(old, 'healingwish');
	A(old.ally.hp === 10 && old.me.hp === old.me.maxHP, 'a battle recorded under rev 9 replays as it was played (it did nothing)');
}
// ---------- Substitute, Endure, the guards
{
	const U = scene(); mine(U, 'substitute');
	const cost = Math.floor(U.me.maxHP / 4);
	A(U.me.hp === U.me.maxHP - cost && U.me.sub === cost && marksOf(U.me).some((m) => m.id === 'sub'), 'Substitute: a quarter of its HP makes one', [U.me.hp, U.me.sub]);
	const hp = U.me.hp; use(U, U.foe, 'thunderwave');
	A(U.me.status == null, 'a foe\'s status move does not get past it');
	U.foe.stats = { ...U.foe.stats, atk: 5 };
	use(U, U.foe, 'tackle');
	A(U.me.hp === hp && U.me.sub < cost, 'a hit lands on the substitute, not on the user', [U.me.hp, U.me.sub]);
	U.foe.stats = { ...U.foe.stats, atk: 9999 }; use(U, U.foe, 'tackle');
	A(U.me.hp === hp && !U.me.sub, 'it breaks when it has taken its fill, and that hit goes no further');
	use(U, U.foe, 'tackle');
	A(U.me.hp < hp, 'the next one lands');
}
{
	const run = (rev) => { const U = scene({ rev, moves: ['endure', 'tackle'], ai: 'aggro', foeMoves: ['tackle'] }); U.foe.stats = { ...U.foe.stats, atk: 99999 }; B.act(U.S, { t: 'attack', uid: U.me.uid, move: 'endure', x: U.me.x, y: U.me.y }, data); B.act(U.S, { t: 'end' }, data); return U.me.hp; };
	A(run() === 1 && run(9) === 0, 'Endure holds through the foe\'s phase (as a one-turn mark it wore off before the foe moved)', [run(), run(9)]);
	const Q = scene(); mine(Q, 'quickguard');
	A(dmgTo(Q, Q.me, () => use(Q, Q.foe, 'quickattack')) === 0 && dmgTo(Q, Q.me, () => use(Q, Q.foe, 'tackle')) > 0, 'Quick Guard: a priority move does not land; an ordinary one does');
	const W = scene({ ally: true }); mine(W, 'wideguard');
	const eq = dmgTo(W, W.me, () => use(W, W.foe, 'earthquake'));
	A(eq === 0, 'Wide Guard: a move that hits several does not land', eq);
	const M = scene(); mine(M, 'magiccoat'); use(M, M.foe, 'growl');
	A(M.me.boosts.atk === 0 && M.foe.boosts.atk === -1, 'Magic Coat: a foe\'s status move comes back');
	const Mi = scene(); mine(Mi, 'mist'); use(Mi, Mi.foe, 'growl');
	A(Mi.me.boosts.atk === 0, 'Mist: a foe cannot lower its stats');
	const R = scene(); mine(R, 'magnetrise');
	A(dmgTo(R, R.me, () => use(R, R.foe, 'earthquake')) === 0 && dmgTo(R, R.me, () => use(R, R.foe, 'tackle')) > 0, 'Magnet Rise: Ground moves do not reach it');
	const F = scene({ ally: true }); mine(F, 'followme');
	const a0 = F.ally.hp, m0 = F.me.hp; use(F, F.foe, 'tackle', F.ally);
	A(F.ally.hp === a0 && F.me.hp < m0, 'Follow Me: a foe\'s move aimed at the ally beside it goes to the user');
}
// ---------- on a foe
{
	const U = scene(); use(U, U.foe, 'tackle'); use(U, U.me, 'disable');
	A(B.heldBlock(U.foe, 'tackle', data) === 'disabled' && !B.heldBlock(U.foe, 'growl', data), 'Disable: not the move it used last');
	const E = scene({ foeMoves: ['tackle', 'growl'] }); use(E, E.foe, 'tackle'); use(E, E.me, 'encore');
	A(/encore/.test(B.heldBlock(E.foe, 'growl', data) || '') && !B.heldBlock(E.foe, 'tackle', data), 'Encore: only the move it used last');
	const T = scene(); use(T, T.me, 'torment'); use(T, T.foe, 'tackle');
	A(/tormented/.test(B.heldBlock(T.foe, 'tackle', data) || '') && !B.heldBlock(T.foe, 'growl', data), 'Torment: not the same move twice running');
	const N = scene(); const log = use(N, N.me, 'disable');
	A(log.includes('noeffect'), 'Disable against a foe that has not used a move does nothing', log);
	const K = scene(); const mv = B.moveNow(K.S, K.foe); use(K, K.me, 'meanlook');
	A(mv > 0 && B.moveNow(K.S, K.foe) === 0 && B.moveTiles(K.S, K.foe).size <= 1, 'Mean Look: it cannot leave its tile');
	const O = scene(); use(O, O.me, 'octolock'); B.act(O.S, { t: 'end' }, data);
	A(O.foe.boosts.def === -1 && O.foe.boosts.spd === -1, 'Octolock: trapped, and its Defense and Sp. Def fall each turn', O.foe.boosts);
	let stuck = 0;
	for (let i = 0; i < 30; i++) { const X = scene(); use(X, X.me, 'attract'); X.S.rng = makeRng('at' + i).state(); if (use(X, X.foe, 'tackle').includes('infatuated')) stuck++; }
	A(stuck >= 8 && stuck <= 22, 'Attract: about half the time the foe cannot act', stuck);
	const D = scene(); D.foe.fx = { reflect: 5 }; use(D, D.me, 'defog');
	A(!D.foe.fx.reflect && D.foe.boosts.eva === -1, 'Defog: the foe\'s Reflect comes down and its evasion falls');
}
// ---------- the field
{
	const hitOf = (setup, mv = 'tackle') => { const U = scene(); U.me.stats = { ...U.me.stats, spe: 50 }; U.foe.stats = { ...U.foe.stats, spe: 100 }; setup(U); return B.forecast(U.S, U.me, mv, 3, 2, data).targets[0].hit; };
	A(hitOf((U) => mine(U, 'tailwind')) > hitOf(() => {}), 'Tailwind: Speed doubled (surer to hit, harder to be hit)', [hitOf((U) => mine(U, 'tailwind')), hitOf(() => {})]);
	A(hitOf((U) => mine(U, 'trickroom')) > hitOf(() => {}), 'Trick Room: the slower one is the surer', [hitOf((U) => mine(U, 'trickroom')), hitOf(() => {})]);
	A(hitOf((U) => { mine(U, 'trickroom'); U.me.guardLast = false; mine(U, 'trickroom'); }) === hitOf(() => {}), 'used again, Trick Room ends');
	A(hitOf((U) => mine(U, 'gravity'), 'thunder') > hitOf(() => {}, 'thunder'), 'Gravity: moves land more often');
	const tb = (sport) => { const U = scene(); if (sport) mine(U, 'mudsport'); return dmgTo(U, U.foe, () => use(U, U.me, 'thunderbolt')); };
	A(tb(true) < tb(false) * 0.7, 'Mud Sport: Electric moves are halved', [tb(true), tb(false)]);
	const G = scene(); G.foe.x = 6; G.foe.y = 0; mine(G, 'gravity');   // (the foe out of reach: nothing but the turns going by)
	for (let i = 0; i < 5; i++) B.act(G.S, { t: 'end' }, data);
	const on4 = (() => { const H = scene(); H.foe.x = 6; H.foe.y = 0; mine(H, 'gravity'); for (let i = 0; i < 4; i++) B.act(H.S, { t: 'end' }, data); return B.fieldOn(H.S, 'gravity'); })();
	A(on4 && !B.fieldOn(G.S, 'gravity') && !G.S.over, 'a field effect lasts 5 turns');
}
// ---------- moves that use another move
{
	const U = scene(); const log = mine(U, 'metronome');
	A(log.some((e) => e.startsWith('calls:')) && log.filter((e) => e === 'use').length === 2, 'Metronome uses some other move', log);
	const C = scene(); use(C, C.foe, 'bodyslam'); const lc = use(C, C.me, 'copycat');
	A(lc.includes('calls:bodyslam') && lc.includes('hit'), 'Copycat uses the last move anyone used', lc);
	const Mi = scene(); use(Mi, Mi.foe, 'bodyslam'); use(Mi, Mi.me, 'tackle');
	A(use(Mi, Mi.me, 'mirrormove').includes('calls:bodyslam'), 'Mirror Move uses the target\'s last move');
	A(use(scene(), scene().me, 'copycat').length >= 0 && mine(scene(), 'copycat').includes('fail'), 'with nothing to copy, Copycat fails');
	A(use(scene(), scene().me, 'naturepower').length >= 0 && (() => { const N = scene(); return use(N, N.me, 'naturepower').includes('calls:triattack'); })(), 'Nature Power is Tri Attack on plain ground');
	const Sl = scene({ moves: ['sleeptalk', 'tackle'] }); Sl.me.status = 'slp'; Sl.me.sleepTurns = 3;
	const ls = use(Sl, Sl.me, 'sleeptalk');
	A(ls.includes('calls:tackle') && Sl.me.status === 'slp', 'Sleep Talk uses one of its other moves, asleep', ls);
	A(CALLS.sleeptalk({ data, rng: () => 0, user: { status: null, fig: { equipped: ['tackle'] } } }) === null, 'awake, it fails');
}
// ---------- held items
{
	const band = { catBoost: 'Physical' };
	const T = scene(); T.me.held = band; T.me.heldId = 'muscleband'; use(T, T.me, 'trick');
	A(T.me.held == null && T.foe.heldId === 'muscleband', 'Trick: the two swap what they hold');
	const C = scene(); C.foe.held = band; C.foe.heldId = 'muscleband'; use(C, C.me, 'corrosivegas');
	A(C.foe.held == null, 'Corrosive Gas: the foe\'s item is gone for the battle');
	const R = scene(); R.me.held = { berryHealFrac: 0.25 }; R.me.heldId = 'sitrusberry'; R.me.heldUsed = true; mine(R, 'recycle');
	A(R.me.heldUsed === false, 'Recycle: the berry it ate is back');
	const Bs = scene({ ally: true }); Bs.me.held = band; Bs.me.heldId = 'muscleband'; use(Bs, Bs.me, 'bestow', Bs.ally);
	A(Bs.me.held == null && Bs.ally.heldId === 'muscleband', 'Bestow: it gives what it holds to an ally with nothing');
	const Sw = scene(); Sw.foe.held = band; Sw.foe.heldId = 'muscleband'; use(Sw, Sw.me, 'switcheroo');
	A(Sw.me.heldId === 'muscleband' && Sw.foe.held == null, 'Switcheroo: as Trick');
	const F = scene(); F.me.held = band; F.me.heldId = 'muscleband';
	const d1 = dmgTo(F, F.foe, () => use(F, F.me, 'fling')), d2 = dmgTo(F, F.foe, () => use(F, F.me, 'fling'));
	A(d1 > 0 && F.me.heldUsed === true && d2 === 0, 'Fling: it throws what it holds, once', [d1, d2]);
}

// ---------- the rest
{
	const G = scene({ ally: true }); G.ally.ability = 'plus'; use(G, G.me, 'gearup', G.ally);
	const M = scene({ ally: true }); M.ally.ability = 'minus'; use(M, M.me, 'magneticflux', M.ally);
	const N = scene({ ally: true }); use(N, N.me, 'gearup', N.ally);
	A(G.ally.boosts.atk === 1 && G.ally.boosts.spa === 1 && M.ally.boosts.def === 1 && M.ally.boosts.spd === 1 && N.ally.boosts.atk === 0, 'Gear Up and Magnetic Flux raise an ally with Plus or Minus, and no one else');
	const P = scene(), a0 = P.me.stats.atk, d0 = P.me.stats.def; mine(P, 'powershift');
	A(P.me.stats.atk === d0 && P.me.stats.def === a0 && a0 !== d0, 'Power Shift swaps its Attack and Defense');
	const As = scene({ ally: true }); As.ally.fig = { ...As.ally.fig, equipped: ['bodyslam'] };
	A(use(As, As.me, 'assist').includes('calls:bodyslam'), 'Assist uses one of an ally\'s moves');
	const E = scene(); E.me.hp = 20; const eh = E.foe.hp; use(E, E.me, 'endeavor');
	A(E.foe.hp === 20 && eh > 20, 'Endeavor brings the foe down to the user\'s HP');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
