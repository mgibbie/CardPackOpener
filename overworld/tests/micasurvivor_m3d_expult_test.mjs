// micasurvivor_m3d_expult_test.mjs — MicaSurvivor 3D, Expedition (Plans/MICASURVIVOR_3D_PLAN.md §5.47): the Ultimates
// (micasurvivor/m3d/expult.js), in node, with the 2D game's OWN numbers and signatures (js/expedition/ultimates.js,
// js/systems/zmoves.js) read as they are.
//   * the charge: 95 s by itself; a KO's share from a bucket; elites, alphas and bosses; damage taken; none while casting
//   * the cast: only when full; a 0.32 s hit-stop; you cannot be hurt during it nor 0.6 s after; the 2D game's damage
//     formula; no piece takes more than 28 % of a boss's max HP
//   * which Ultimate: a signature by tier (evolutions + Maturity + Mega), or the form's first type's
//   * the eighteen type choreographies: each lasts what the 2D game's does and does what it says (freeze and shatter,
//     roots and a heal, a dive from the sky, a vortex, …), and none leaves you where you could not walk back from
//   * the signatures' own beats by tier; Mew's copies (seeded)
//   * auto; the same seed gives the same fight; what the run writes, and the tasks
//   node overworld/tests/micasurvivor_m3d_expult_test.mjs
import { dataFrom, addEnemy, addBoss, hashWorld, U } from '../../micasurvivor/m3d/combat.js';
import { expFrom, newRun, stepRun, result, walkable } from '../../micasurvivor/m3d/expedition.js';
import { nameOf, typeCode, typeOfCode, tierOf, codeOf, dmgOf, setCharge, pressUlt, tryCast, tickUlt, ultReady, ultView, makeFx, copiesOf, BEAT_NAMES } from '../../micasurvivor/m3d/expult.js';
import { recordOps, applyOps, deviceId } from '../../micasurvivor/m3d/expsave.js';
import { noMeta } from '../../micasurvivor/m3d/expmeta.js';
import { CELL } from '../../micasurvivor/m3d/sim.js';
import { loadG } from './m3d_data.mjs';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const store = new Map(), ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const G = loadG(['systems/expedition.js', 'expedition/save.js', 'expedition/meta.js'], { localStorage: ls });
await G.ExpSave.open();
G.DB = { save: { coins: 100, stats: {}, owned: {} }, commit() { return true; } };
G.Expedition.wallet = { balance: () => G.DB.save.coins, earn(n) { n = Math.floor(+n); if (!(n > 0)) return false; G.DB.save.coins += n; return true; }, spend(n) { if (G.DB.save.coins < n) return false; G.DB.save.coins -= n; return true; } };
G.Unlocks = { add: (list) => list.length }; G.UI = { toast() { } };
const data = dataFrom(G), X = expFrom(G), UX = X.Uu, K = G.ExpUlt.K, DT = 1 / 60;

A(!!UX && UX.K === K && UX.SIG_CODES.length === 16 && UX.ORDER.length === 18 && UX.BOSS_CAP === 0.28 && BEAT_NAMES.join() === 'ring,beams,smite,dive,meteors,nova,pull,drain,heal', 'the 3D run reads the 2D game\'s own Ultimates: its numbers, its 16 signatures, the 18 types, the boss cap, the nine beats');
A(UX.SIGS[4].names.join() === 'Roaring Ember,Fire Vortex,Winged Inferno' && nameOf(UX, 4, 0) === 'Roaring Ember' && nameOf(UX, 4, 4) === 'Winged Inferno' && nameOf(UX, typeCode(UX, 'bug'), 0) === 'Devastating Plague' && typeOfCode(UX, 172) === 'electric', 'names in English: a signature\'s by tier, a type\'s Z-move');

/** A run with nothing in it but what a check puts there (rx off: an Ultimate's own damage is what is measured). */
const mk = (o = {}) => { const S = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, autoPick: 0, meta: noMeta(), rx: false, ...o }); S.plan.events = []; S.w.pl.crit = 0; S.w.pl.maxHp = S.w.pl.hp = 1e5; return S; };
const typed = (dex, o = {}) => mk({ dex, league: false, moves: ['tackle'], ...o });
const foe = (S, dx, dz = 0, o = {}) => addEnemy(S.w, 19, S.w.pl.s.x + dx, S.w.pl.s.z + dz, { dummy: true, hp: 1e6, ...o });
const step = (S, n = 1) => { for (let i = 0; i < n; i++) { S.acc = -1e9; stepRun(S, null); } };
const evs = (S, sub) => S.w.events.filter((ev) => ev.k === 'ult' && ev.sub === sub);
/** One tick of the Ultimate's own clock with these events as the fight's (the charge reads them). */
const feed = (S, events, dt = DT) => { S.w.events.length = 0; S.w.events.push(...events); tickUlt(S, dt); };
/** A piece played by itself, the world not stepping (the foes stand as they are): -> the piece. `each(fx)` runs every tick. */
const play = (S, code, tier = 0, each = null) => { const fx = makeFx(S, code, tier); let n = 0; while (!fx.done && n++ < 2000) { fx.tick(DT); if (each) each(fx); } return fx; };
const DEXOF = { normal: 16, fire: 4, water: 7, electric: 25, grass: 1, ice: 87, fighting: 66, poison: 23, ground: 27, flying: 21, psychic: 63, bug: 10, rock: 74, ghost: 92, dragon: 147, dark: 198, steel: 81, fairy: 35 };

// ---------------------------------------------------------------- the charge
{
	const S = mk(), Q = S.ult;
	A(!!Q && Q.c === 0 && !ultReady(S) && codeOf(S) === 4 && ultView(S).name === 'Roaring Ember' && ultView(S).pct === 0, 'a run starts with its Ultimate empty (Charmander\'s: Roaring Ember)');
	step(S, 60);
	A(near(Q.c, 60 * DT / 95, 1e-9) && K.PASSIVE_T === 95, 'by itself it fills in 95 s (a second: 1 / 95)', Q.c);
	const c0 = Q.c;
	feed(S, Array.from({ length: 10 }, () => ({ k: 'kill' })), 0);
	A(near(Q.c - c0, K.BUCKET) && K.BUCKET === 0.024 && K.KILL === 0.004, 'ten KOs at once: only the bucket\'s 0.024 (six KOs\' worth)', Q.c - c0);
	feed(S, [], 1); const c1 = Q.c; feed(S, [{ k: 'kill' }, { k: 'kill' }, { k: 'kill' }], 0);
	A(near(Q.c - c1, 0.008), 'the bucket refills 0.008 a second (two KOs\' worth after one)', Q.c - c1);
	const c2 = Q.c; feed(S, [{ k: 'kill', xk: 'elite' }, { k: 'kill', xk: 'summoner' }], 0);
	A(near(Q.c - c2, 0.06), 'an elite or a summoner: + 0.03 each');
	const c3 = Q.c; feed(S, [{ k: 'kill', xk: 'alpha' }, { k: 'kill', xk: 'totem' }], 0);
	A(near(Q.c - c3, 0.16), 'an alpha or a totem: + 0.08 each');
	const c4 = Q.c; feed(S, [{ k: 'kill', boss: true }, { k: 'kill', xk: 'legend' }], 0);
	A(near(Q.c - c4, 0.4), 'a guardian, a legendary, any boss: + 0.2 each');
	const c5 = Q.c; feed(S, [{ k: 'hurt', d: S.w.pl.maxHp * 0.2 }], 0);
	A(near(Q.c - c5, 0.35 * 0.2), 'damage taken: + 0.35 × the damage / your max HP');
	A(near(Q.src.kill, 0.032) && near(Q.src.elite, 0.06) && near(Q.src.alpha, 0.16) && near(Q.src.boss, 0.4) && near(Q.src.hurt, 0.07), 'where the charge came from is kept by source');
	// a press before it is full
	feed(S, [], 0); pressUlt(S); tickUlt(S, 0);
	A(!Q.cast && Q.casts === 0 && evs(S, 'no').length === 1, 'pressed before it is full: nothing (the page is told, for its sound)');
	setCharge(S, 0.999); feed(S, [], 0);
	A(!ultReady(S) && evs(S, 'ready').length === 0, 'at 99.9 %: not ready');
	feed(S, [{ k: 'kill', boss: true }], 0);
	A(ultReady(S) && Q.c === 1 && evs(S, 'ready').length === 1 && ultView(S).ready && ultView(S).pct === 100, 'full: ready, said once');
	feed(S, [], DT);
	A(evs(S, 'ready').length === 0, '…not said again');
}

// ---------------------------------------------------------------- the cast
{
	const S = mk(), Q = S.ult, w = S.w, e = foe(S, 3);
	step(S, 2); setCharge(S, 1); pressUlt(S); step(S);
	const cast = evs(S, 'cast')[0];
	A(!!Q.cast && Q.casts === 1 && Q.sigs === 1 && Q.c === 0 && cast && cast.name === 'Roaring Ember' && cast.type === 'fire' && cast.tier === 0 && ultView(S).casting, 'pressed when full: it is cast (the page is told its name, its type, its tier); the charge is spent');
	const t0 = w.t, tick0 = w.tick; let held = 0;
	while (w.t === t0 && held < 100) { step(S); held++; }
	A(held >= 19 && held <= 21 && K.HITSTOP === 0.32, `the hit-stop: the world holds for 0.32 s (${held - 1} steps)`, held);
	A(w.hooks.hurt(w, 50) === 0, 'while it is cast, a hit does nothing');
	const hp0 = w.pl.hp; w.pl.invuln = 0; addEnemy(w, 19, w.pl.s.x + 0.3, w.pl.s.z, { dmg: 50 }); step(S, 40);
	A(w.pl.hp === hp0 && !!Q.cast, '…a foe on you through the cast: no HP lost');
	const cDuring = Q.c; feed(S, [{ k: 'kill', boss: true }], DT);
	A(Q.c === cDuring && Q.c === 0, 'nothing charges while casting (not time, not a boss)');
	let n = 0; while (Q.cast && n++ < 600) step(S);
	A(!Q.cast && near(w.t - t0, 4.2, 0.1) && evs(S, 'end').length === 1 && e.hp < e.maxHp, 'the cast ends when its choreography does (Fire: 4.2 s), and it hurt what was near', w.t - t0);
	A(Q.iT > 0.55 && w.hooks.hurt(w, 50) === 0, 'for 0.6 s after it you still cannot be hurt');
	step(S, 40);
	A(Q.iT <= 0 && w.hooks.hurt(w, 50) > 0, '…then you can');
	A(Q.c > 0 && Q.c < 0.02, 'and the charge starts again from nothing');
	// you fall mid-cast: it ends
	const D = mk(); foe(D, 3); step(D, 2); setCharge(D, 1); pressUlt(D); step(D, 30); D.w.pl.dead = true; tickUlt(D, DT);
	A(!D.ult.cast, 'if you fall during a cast, it ends');
}

// ---------------------------------------------------------------- the damage, and a boss's cap
{
	const S = typed(16), w = S.w, pl = w.pl;
	pl.level = 12;
	const d0 = dmgOf(S, 0), d3 = dmgOf(S, 3), atk = d0 / (40 * (1 + 0.1 * 12) * 0.62);
	A(near(d3 / d0, 1.45) && atk > 0 && near(d0, K.DMG * (1 + K.DMG_LV * 12) * atk * K.DMG_K), 'damage: 40 × (1 + 0.1 level) × (1 + 0.15 tier) × attack × 0.62', [d0, d3]);
	const fx = makeFx(S, typeCode(UX, 'normal'), 0), e = foe(S, 2);
	A(near(fx.zhit(e, fx.dmg * 2, 1, 0), d0 * 2, 1e-6) && near(1e6 * e.def.hp, 0, 1e99) && e.maxHp - e.hp === Math.round(d0 * 2), 'a hit of weight 2 does twice that (Normal on a Rattata: no type factor)');
	// a boss: 28 % of its max HP a piece
	const b = addBoss(w, 150, pl.s.x + 5, pl.s.z, { slot: 0 }); b.maxHp = b.hp = 1000; b.shield = 0;
	fx.zhit(b, 1e6, 1, 0);
	A(b.hp === 720 && !b.dead, 'a boss: one piece takes no more than 28 % of its max HP (1000 -> 720, whatever the hit)');
	fx.zhit(b, 1e6, 1, 0);
	A(b.hp === 720, '…and nothing more from that piece');
	const fx2 = makeFx(S, typeCode(UX, 'normal'), 0); fx2.zhit(b, 100, 1, 0);
	A(b.hp === 620, 'the next piece has its own 28 % (a 100 hit: 620)');
	b.hp = 150; const fx3 = makeFx(S, typeCode(UX, 'normal'), 0); fx3.zhit(b, 1e6, 1, 0);
	A(b.dead, 'a boss with less than that left falls');
	// one that can be caught keeps its own floor
	const c = addBoss(w, 144, pl.s.x - 5, pl.s.z, { slot: 0 }); c.maxHp = 1000; c.hp = 100; c.hpFloor = 1; c.shield = 0;
	makeFx(S, typeCode(UX, 'normal'), 0).zhit(c, 1e6, 1, 0);
	A(c.hp === 1 && !c.dead && c.hpFloor === 1, 'one that can be caught is left at 1 HP, as by any hit');
}

// ---------------------------------------------------------------- which Ultimate, and its tier
{
	const S = mk();
	A(tierOf(S) === 0, 'tier 0 at the start');
	S.lg.evo = 2; A(tierOf(S) === 2 && (tickUlt(S, 0), ultView(S).name) === 'Winged Inferno', 'two evolutions: tier 2 (Winged Inferno)');
	S.lg.mat = 1; S.lg.mega = 6; A(tierOf(S) === 4 && K.TIER_MAX === 4, '+ Maturity + a Mega: tier 4');
	S.lg.mat = 2; A(tierOf(S) === 4, '…never above 4');
	const C = mk({ dex: 10 });
	A(codeOf(C) === typeCode(UX, 'bug') && ultView(C).name === 'Devastating Plague' && !ultView(C).sig, 'a League member with no signature (Caterpie): its type\'s');
	const P = typed(16);
	A(codeOf(P) === typeCode(UX, 'normal') && tierOf(P) === 0, 'a run outside the League: its first type\'s, tier 0');
	const Gu = newRun(data, X, { seed: 7, dex: 4, league: true, weather: false, guest: true });
	A(!Gu.ult, 'a co-op guest\'s side has none');
}

// ---------------------------------------------------------------- the eighteen type choreographies
{
	const DUR = { normal: 2.9, fire: 4.2, water: 3.6, electric: 3.6, grass: 3.6, ice: 3.8, fighting: 3.2, poison: 4.2, ground: 3.4, flying: 2.8, psychic: 3.6, bug: 3.9, rock: 4.0, ghost: 3.8, dragon: 3.8, dark: 3.6, steel: 3.0, fairy: 3.6 };
	const bad = [], notes = [];
	for (const ty of UX.ORDER) {
		const S = typed(DEXOF[ty]), w = S.w, s = w.pl.s, mask = walkable(w.room), foes = [];
		for (let i = 0; i < 12; i++) foes.push(foe(S, Math.cos(i * 0.9) * (4 + i % 4 * 3), Math.sin(i * 0.9) * (4 + i % 4 * 3)));
		const big = foe(S, 6, 6, { hp: 5e6 }); foes.push(big);
		const d0 = foes.map((e) => Math.hypot(e.a.x - s.x, e.a.z - s.z)), x0 = s.x, z0 = s.z, hp0 = w.pl.hp = w.pl.maxHp * 0.5;
		const seen = { frozen: 0, slept: 0, conf: 0, hidden: 0, slow: 0 };
		const fx = play(S, typeCode(UX, ty), 0, (f) => { if (near(f.t, 1, DT)) { seen.frozen = foes.filter((e) => e.frozenT > 0).length; seen.slept = foes.filter((e) => e.sleepT > 0).length; seen.hidden = +S.ult.hidden; seen.slow = Math.max(...foes.map((e) => e.slow)); } });
		const hurt = foes.filter((e) => e.hp < e.maxHp).length, moved = Math.hypot(s.x - x0, s.z - z0), cell = Math.floor(s.z / CELL) * w.room.w + Math.floor(s.x / CELL);
		const closer = foes.filter((e, i) => Math.hypot(e.a.x - x0, e.a.z - z0) < d0[i] - 0.5).length;
		if (!near(fx.t, DUR[ty], DT * 1.5)) bad.push(`${ty}: lasts ${fx.t.toFixed(2)} s, not ${DUR[ty]}`);
		if (!hurt) bad.push(`${ty}: hurt nothing`);
		if (!mask[cell]) bad.push(`${ty}: left you where you cannot walk back from`);
		if (S.ult.hidden) bad.push(`${ty}: left you hidden`);
		const want = {
			normal: () => moved > 5, steel: () => moved > 5,
			fire: () => hurt >= 6,
			water: () => closer >= 8,
			electric: () => foes.filter((e) => e.paraT > 0).length >= 6,
			grass: () => w.pl.hp > hp0 * 1.3 && hurt === 13,
			ice: () => seen.frozen === 13 && foes.every((e) => !(e.frozenT > 0)) && hurt === 13,
			fighting: () => big.maxHp - big.hp > 8 * fx.dmg && Math.hypot(s.x - big.a.x, s.z - big.a.z) < 4.5,
			poison: () => foes.filter((e) => e.poison > 0).length >= 3,
			ground: () => foes.filter((e) => e.slow >= 0.6).length >= 3,
			flying: () => seen.hidden === 1 && moved > 2 && hurt >= 3,
			psychic: () => foes.every((e) => e.confT > 0) && hurt === 13,
			bug: () => hurt >= 6 && foes.some((e) => e.poison > 0),
			rock: () => hurt >= 6,
			ghost: () => w.pl.hp > hp0 && hurt === 13,
			dragon: () => hurt === 13,
			dark: () => closer >= 4 && hurt === 13,
			fairy: () => seen.slept === 13 && w.pl.hp > hp0 * 1.2 && hurt === 13,
		}[ty];
		if (!want()) bad.push(`${ty}: did not do what it says ${JSON.stringify({ hurt, moved: +moved.toFixed(1), closer, seen, hp: +(w.pl.hp / hp0).toFixed(2) })}`);
		notes.push(`${ty} ${fx.t.toFixed(1)}s`);
	}
	A(bad.length === 0, `each of the 18 lasts what the 2D game's does, does what it says, and leaves you on ground you can walk back from (${notes.join(', ')})`, bad.join('\n      '));
	// two of them to the number
	const S = typed(87), w = S.w, e = foe(S, 5), far = foe(S, 49);
	const fx = play(S, typeCode(UX, 'ice'), 0, (f) => { if (near(f.t, 1, DT)) S.frozeFor = e.frozenT; });
	A(near(S.frozeFor, 1.8 * 2.4) && e.maxHp - e.hp === Math.round(fx.dmg * 2.6) && far.hp === far.maxHp, 'Absolute Zero: everything within 760 px (47.5 m) is frozen for 2.4 × a freeze, then shattered at × 2.6; at 49 m: untouched', [S.frozeFor, e.maxHp - e.hp, fx.dmg * 2.6]);
	const F = typed(21), fw = F.w, pack = [foe(F, 18, 0), foe(F, 19, 1), foe(F, 18, 1)], lone = foe(F, -10, 0);
	const ffx = play(F, typeCode(UX, 'flying'), 0);
	A(Math.hypot(fw.pl.s.x - pack[0].a.x, fw.pl.s.z - pack[0].a.z) < 2.5 && pack.every((q) => q.maxHp - q.hp === Math.round(ffx.dmg * 4.2)) && lone.hp === lone.maxHp, 'Supersonic Dive: you come down on the biggest group (× 4.2 within 320 px); a lone foe 28 m away is untouched');
}

// ---------------------------------------------------------------- the signatures' beats, by tier
{
	const dealt = (member, tier) => { const S = mk({ dex: member }), foes = []; for (let i = 0; i < 10; i++) foes.push(foe(S, Math.cos(i) * (3 + i % 3 * 2), Math.sin(i) * (3 + i % 3 * 2))); const fx = play(S, member, tier); return { t: fx.t, d: foes.reduce((a, e) => a + (e.maxHp - e.hp), 0) / fx.dmg, S, foes }; };
	const bad = [];
	for (const m of UX.SIG_CODES) {
		if (m === 151 || m === 92) continue;   /* (Mew copies the others; Gastly's hits take a share of the life a foe has left, so more hits is not simply more: its own check is below) */
		const a = dealt(m, 0), b = dealt(m, 1), c = dealt(m, 2);
		if (!(b.d >= a.d && c.d > b.d && c.d > a.d * 1.2)) bad.push(`${m}: ${a.d.toFixed(1)} / ${b.d.toFixed(1)} / ${c.d.toFixed(1)}`);
		const last = Math.max(0, ...UX.SIGS[m].x.filter((q) => q[0] <= 2).map((q) => q[2].t + (q[2].d || 0) + 0.14 * (q[2].n || 0) + 0.6));
		if (c.t < last - DT) bad.push(`${m}: tier 2 ends at ${c.t.toFixed(2)} s, before its last beat (${last.toFixed(2)})`);
	}
	A(bad.length === 0, 'every signature does more by tier (its own beats on top of its type\'s choreography), and lasts until its last beat', bad.join('\n      '));
	// Bulbasaur's heal, Gastly's drain, Mewtwo's pull
	const B = mk({ dex: 1 }); B.w.pl.hp = B.w.pl.maxHp * 0.5; play(B, 1, 2);
	A(near(B.w.pl.hp / B.w.pl.maxHp, 0.58, 1e-6), 'Solar Garden (Bulbasaur, tier 2): + 8 % of your max HP (no foe: nothing else heals)', B.w.pl.hp / B.w.pl.maxHp);
	const Gs = mk({ dex: 92 }), g = addEnemy(Gs.w, 10, Gs.w.pl.s.x + 4, Gs.w.pl.s.z, { dummy: true }); g.hp = g.maxHp = 1e9;   /* (a Caterpie: Ghost is neither weak nor strong against Bug) */ const gfx = makeFx(Gs, 92, 2); let before = 0; while (!gfx.done) { if (gfx.t < 3.5 && gfx.t + DT >= 3.5) before = g.hp; gfx.tick(DT); }
	A(before - g.hp > before * 0.12 && before - g.hp < before * 0.13 + gfx.dmg * 3, 'Evil Eye (Gastly, tier 2): a foe near loses 12 % of the life it has (and a little more)', [before, g.hp]);
	const Mt = mk({ dex: 150 }), pulled = foe(Mt, 20), boss = addBoss(Mt.w, 144, Mt.w.pl.s.x - 20, Mt.w.pl.s.z, { slot: 0 }), bx = boss.a.x; play(Mt, 150, 0);
	A(Math.hypot(pulled.a.x - Mt.w.pl.s.x, pulled.a.z - Mt.w.pl.s.z) < 8 && near(boss.a.x, bx, 0.01), 'Mind Wave (Mewtwo): foes within 520 px are pulled to you for 2.2 s (a boss is not)');
}

// ---------------------------------------------------------------- Mew
{
	const S = mk({ dex: 151 }), a = copiesOf(S, 3), b = copiesOf(S, 3);
	A(a.length === 3 && new Set(a).size === 3 && !a.includes(151) && a.every((c) => UX.SIGS[c]) && a.join() === b.join(), 'Metronome: copies of the other fifteen, never the same twice, the same for the same run and cast', a);
	S.ult.casts = 1; const c = copiesOf(S, 3);
	const S9 = mk({ dex: 151, seed: 9 });
	A(c.join() !== a.join() || copiesOf(S9, 3).join() !== a.join(), '…another cast or another run: others');
	for (const [tier, n] of [[0, 1], [1, 2], [2, 3], [4, 3]]) {
		const T = mk({ dex: 151 }); foe(T, 4); T.lg.evo = Math.min(2, tier); T.lg.mat = Math.max(0, tier - 2);
		step(T, 2); setCharge(T, 1); pressUlt(T); let k = 0; while ((T.ult.cast || !T.ult.casts) && k++ < 3000) step(T);
		A(T.ult.casts === 1 && T.ult.n === n && T.ult.sigs === 1, `tier ${tier}: ${n} ${n > 1 ? 'copies, one after another' : 'copy'}`, [T.ult.n, k]);
	}
}

// ---------------------------------------------------------------- auto, and the same seed
{
	const S = mk({ ultAuto: true }); step(S, 2); setCharge(S, 1); step(S, 5);
	A(S.ult.auto && !S.ult.cast && S.ult.casts === 0 && ultView(S).auto, 'auto, full, no foe near: it waits');
	foe(S, 31); step(S, 3);
	A(S.ult.casts === 0 && K.AUTO_R * U === 30, '…a foe at 31 m: still waits (auto: within 480 px, 30 m)');
	foe(S, 20); step(S, 2);
	A(S.ult.casts === 1, '…a foe at 20 m: it casts by itself');
	const P = mk(); step(P, 2); setCharge(P, 1); foe(P, 5); step(P, 5);
	A(P.ult.casts === 0, 'without auto it waits for the press');
	const once = (seed) => { const T = mk({ dex: 147, seed, rx: undefined }); for (let i = 0; i < 12; i++) foe(T, Math.cos(i) * 6, Math.sin(i) * 6, { hp: 3 }); T.lg.evo = 2; step(T, 2); setCharge(T, 1); pressUlt(T); step(T, 400); return hashWorld(T.w) + ':' + T.ult.casts + ':' + T.w.stats.kills; };
	const h1 = once(11), h2 = once(11), h3 = once(12);
	A(h1 === h2 && h1 !== h3, 'the same seed gives the same cast, to the last number (another seed: another)', [h1, h2, h3]);
}

// ---------------------------------------------------------------- what the run writes, and the tasks
{
	const Sv = G.ExpSave, M = G.ExpMeta, dev = deviceId(ls, Sv.who, globalThis.crypto);
	const S = mk(); foe(S, 4);
	for (let i = 0; i < 2; i++) { step(S, 2); setCharge(S, 1); pressUlt(S); let k = 0; while ((S.ult.cast || S.ult.casts <= i) && k++ < 2000) step(S); }
	S.w.t = 120; S.ended = true;
	const res = result(S), ops = recordOps(S, res, { T: G.ExpTier, dev, research: [], seen: Sv.get('m3d.seen.' + dev), final: false });
	const o = Object.fromEntries(ops.map((p) => [p[0] + ' ' + p[1], p[2]]));
	A(S.ult.casts === 2 && o['bump ult.casts'] === 2 && o['best ult.best'] === 2 && o['bump ult.sig'] === 2 && S.ult.names.join() === 'Roaring Ember,Roaring Ember', 'two casts: written with the run in the 2D game\'s keys (ult.casts, ult.best, ult.sig)', o);
	A(o['bump m3d.t.' + dev + '.casts'] === 2, '…and left for the tasks');
	applyOps(Sv, ops);
	const NOW = Date.UTC(2026, 10, 12, 12); M.clock = () => NOW;
	M.claim3d();
	A(Sv.get('m3d.tc.' + dev + '.casts') === 2 && Sv.get('ult.casts') === 2, 'the 2D game\'s claim counts them into the tasks');
	M.claim3d();
	A(Sv.get('m3d.tc.' + dev + '.casts') === 2, '…once');
	const S0 = mk(); S0.w.t = 60; S0.ended = true;
	const o0 = Object.fromEntries(recordOps(S0, result(S0), { T: G.ExpTier, dev, research: [], seen: 1, final: false }).map((p) => [p[0] + ' ' + p[1], p[2]]));
	A(o0['bump ult.casts'] === undefined && o0['bump ult.sig'] === undefined && o0['bump m3d.t.' + dev + '.casts'] === undefined, 'a run with no cast writes none');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
