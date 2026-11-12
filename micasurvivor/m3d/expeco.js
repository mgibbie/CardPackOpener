// expeco.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run's economy, on top of
// expedition.js. The run's money (₽: a little for every KO, more for the big ones, gold rocks, a Skip) and what a zone
// holds to spend it on or to stand in: Poké Balls (paid, free, cursed), Meowth's stall, the Unown altars and the comet
// (stand in the circle to charge them), the challenge altar, the cursed and Gengar's altars, Ditto, Hypno, cages,
// gold rocks, berry bushes, a slot machine. There is no button: everything works by standing in it, as in 2D.
//
// The prices, the tables and the reels are the 2D game's own (js/expedition/economy.js: its K, ballCost, price,
// heat, cageCost, slotCost, reels, payout), called as they are. What is here is where things stand in a 3D zone and
// what standing in them does to this module's run.
//
// 3D's own: a zone here is 98 m across, far smaller than a 2D one, so things stand closer together (5 cells apart, 3
// for rocks and bushes; 2D: 8 and 4) and a zone that has no room for all 43 gets as many as fit, the big ones first.
// A thing counts you only on its own level, as the altar does.
import { CELL } from './sim.js';
import { rng as makeRng } from './gen.js';
import { U, gainXp } from './combat.js';
import { XK, spawn, free, walkable, flat3, say } from './expedition.js';
import { takeItem } from './explevel.js';
import { excluded, researchKo, researchCage } from './expmeta.js';

export const EK = {
	// what each zone holds (the 2D game's list and order: the big ones are placed first)
	PLACE: [['unown4', 1], ['unown3', 1], ['unown2', 1], ['unown1', 2], ['challenge', 1], ['cursedaltar', 1], ['greed', 1], ['comet', 1], ['meowth', 3], ['ball', 6], ['freeball', 2], ['cursedball', 2], ['ditto', 1], ['hypno', 1], ['cage', 2], ['rock', 8], ['berry', 8], ['slots', 1]],
	SMALL: ['rock', 'berry'],
	FROM_SPAWN: 5, FROM_ALTAR: 4, GAP: 5, GAP_SMALL: 3,   // cells
	HORDE_D: 250, HORDE_NEAR: 40,                          // units: a horde arrives this far from its altar
	NAME: { ball: 'Poké Ball', freeball: 'Free Poké Ball', cursedball: 'Cursed Poké Ball', great: 'Great Ball', meowth: "Meowth's stall", unown1: 'Unown altar', unown2: 'Rare Unown altar', unown3: 'Epic Unown altar', unown4: 'Golden Unown altar',
		comet: 'Comet shard', challenge: 'Challenge altar', cursedaltar: 'Cursed altar', greed: "Gengar's altar", ditto: 'Ditto', hypno: 'Hypno', rock: 'Gold rock', berry: 'Berry bush', cage: 'Cage', slots: 'Slot machine' },
	COL: { ball: '#ff4d5e', freeball: '#eef3ff', cursedball: '#a35cff', great: '#4f9cf0', meowth: '#ffd23f', unown1: '#b9c4d4', unown2: '#5fd07a', unown3: '#b46cf2', unown4: '#ffb020', comet: '#7fe9ff', challenge: '#ff7b3d', cursedaltar: '#7c3fb0',
		greed: '#d05cff', ditto: '#f0a8e8', hypno: '#f6d860', rock: '#e8b93a', berry: '#3f8cff', cage: '#9aa3b2', slots: '#ff5fa2' },
};
export const FRESH = 0, USED = 1, ACTIVE = 2, GONE = 3, READY = 4;
function mix(...vals) {
	let h = 0x7F4A7C15 | 0;
	for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
	return h >>> 0;
}
/** The 2D game's economy tables, as this module reads them. G: its global with expedition/economy.js loaded. */
export function ecoFrom(G) {
	const E = G.ExpEco;
	return { K: E.K, KINDS: E.KINDS, ballCost: E.ballCost, allowance: E.allowance, heatOf: E.heatOf, heatMul: E.heatMul, price: E.price, cageCost: E.cageCost, slotCost: E.slotCost, reels: E.reels, payout: E.payout };
}

// ---------------------------------------------------------------- where things stand
/** A zone's interactables: { objs: [{ i, kind, cx, cz, x, y, z, v }], visits: [{ v, at, until, spot }], cometAt }, or
 *  null at the shrine. From the room and the seed only: the same for the host and every viewer. Kept on the room. */
export function layoutOf(room, S) {
	if (!room || !(room.zone >= 1 && room.zone <= 3)) return null;
	if (room.eco) return room.eco;
	const EKK = S.X.E.K, mi = S.X.MAP_IDS.indexOf(room.map) + 1, rng = makeRng(mix(S.seed, mi, room.zone, 0xEC07)), ok = walkable(room), cand = [];
	const sx = room.spawn[0] / CELL, sz = room.spawn[2] / CELL, ax = room.altar[0] / CELL, az = room.altar[2] / CELL;
	for (let cz = 2; cz < room.h - 2; cz++) for (let cx = 2; cx < room.w - 2; cx++) {
		const i = cz * room.w + cx; if (!ok[i] || room.cells[i] >= room.rimH || !flat3(room, cx, cz)) continue;
		if (Math.hypot(cx + 0.5 - sx, cz + 0.5 - sz) < EK.FROM_SPAWN || Math.hypot(cx + 0.5 - ax, cz + 0.5 - az) < EK.FROM_ALTAR) continue;
		cand.push([cx, cz]);
	}
	for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
	const objs = [], res = S.X.MAPS[room.map].residents[room.zone - 1], small = (k) => EK.SMALL.includes(k);
	for (const [kind, n] of EK.PLACE) {
		let placed = 0;
		for (let ci = 0; ci < cand.length && placed < n; ci++) {
			const c = cand[ci]; if (!c) continue;
			if (objs.some((o) => Math.hypot(o.cx - c[0], o.cz - c[1]) < (small(kind) || small(o.kind) ? EK.GAP_SMALL : EK.GAP))) continue;
			cand[ci] = null; placed++;
			const o = { i: objs.length, kind, cx: c[0], cz: c[1], x: (c[0] + 0.5) * CELL, y: room.cells[c[1] * room.w + c[0]], z: (c[1] + 0.5) * CELL, v: 0 };
			if (kind === 'rock') o.v = EKK.ROCK[0] + Math.floor(rng() * (EKK.ROCK[1] - EKK.ROCK[0] + 1));
			else if (kind === 'cage') o.v = res.length ? res[Math.floor(rng() * res.length) % res.length] : 16;
			objs.push(o);
		}
	}
	const visits = [], stalls = objs.filter((o) => o.kind === 'meowth').map((o) => o.i);
	for (let v = 0, at = EKK.MEOWTH_FIRST; at < S.X.K.FINAL + 120 && stalls.length; v++, at += EKK.MEOWTH_EVERY) { const a = at + Math.floor(rng() * (EKK.MEOWTH_JIT + 1)); visits.push({ v, at: a, until: a + EKK.MEOWTH_STAY, spot: stalls[v % stalls.length] }); }
	const cometAt = EKK.COMET_AT[0] + Math.floor(rng() * (EKK.COMET_AT[1] - EKK.COMET_AT[0] + 1));
	return (room.eco = { objs, visits, cometAt });
}

// ---------------------------------------------------------------- the run's money
/** Give a run its economy. */
export function setupEco(S) {
	S.coins = S.coins || 0;
	S.eco = { frac: 0, earned: 0, spent: 0, balls: 0, opened: 0, buys: 0, mods: { diff: 0, rate: 0, xp: 0, money: 0, loot: 0 }, used: 0, draws: 0, waves: 0, z: null, hordes: [],
		log: { balls: 0, shop: 0, altars: 0, freed: 0, rocks: 0, berries: 0, ditto: 0, hypno: 0, spins: 0, slotWins: 0, ambush: 0 } };
	S.pick = null; S.w.kos = [];
	return S.eco;
}
/** What the run's curses and altars have done: { diff, rate, xp, money, loot }. */
export const mods = (S) => (S.eco ? S.eco.mods : NOMODS);
const NOMODS = { diff: 0, rate: 0, xp: 0, money: 0, loot: 0 };
/** Your money factor: the Nugget and the Amulet Coin, and Gengar's greed. */
export const goldK = (S) => Math.max(0, S.w.pl.coinMul || 1) * (1 + mods(S).money);
/** ₽ into the run (a KO's fraction is kept until it makes a whole one). -> the whole ₽ gained */
export function earn(S, n) {
	const E = S.eco; if (!E || !(n > 0)) return 0;
	E.frac += n;
	const whole = Math.floor(E.frac + 1e-9);
	E.frac -= whole; S.coins += whole; E.earned += whole;
	return whole;
}
export function spend(S, n) { if (!S.eco || S.coins < n) return false; S.coins -= n; S.eco.spent += n; return true; }
const zoneNow = (S) => Math.min(3, S.zone || 1);
/** A KO pays: 0.2; an elite or a summoner 1; an alpha or a totem 5; a guardian 20 x zone. */
function onKill(S, ev) {
	const K = S.X.E.K;
	const v = ev.boss || ev.xk === 'guardian' || ev.xk === 'legend' ? K.KO_BOSS * zoneNow(S) : ev.xk === 'alpha' || ev.xk === 'totem' ? K.KO_ALPHA : ev.xk === 'elite' || ev.xk === 'summoner' ? K.KO_ELITE : K.KO;
	earn(S, v * goldK(S));
}

// ---------------------------------------------------------------- items on offer
/** n different items you have room for, none below rarity `min` (it steps down a rarity, then up, when one is empty). */
export function rollOffers(S, rng, n, min = 0) {
	const L = S.L, pl = S.w.pl, out = [];
	for (let k = 0; k < n; k++) {
		const ti = Math.max(min, L.rollRarity(rng, { level: pl.level, luck: pl.xluck || 0, zone: zoneNow(S) })), order = [ti];
		for (let d = 1; d < 5; d++) { if (ti - d >= min) order.push(ti - d); if (ti + d <= 4) order.push(ti + d); }
		for (const t of order) { const pool = L.I.ITEMS.filter((it) => it.rar === t && L.I.room(pl, it.id) && !out.includes(it.id) && !excluded(S, it.id)); if (pool.length) { out.push(pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id); break; } }
	}
	return out;
}
const seedFor = (S, i, salt) => mix(S.seed, S.X.MAP_IDS.indexOf(S.map) + 1, S.zone, i, salt, S.eco.draws++);
/** A choice is up (the fight holds until it is made): { kind: 'ball' | 'unown' | 'comet' | 'shop' | 'hypno', title, sub,
 *  ids (items) | vit (vitamins), picks, taken: [index], prices (a shop's) }. */
function openPick(S, p) {
	S.pick = Object.assign({ taken: [], ids: [], picks: 1 }, p);
	S.w.events.push({ k: 'pick', kind: p.kind });
	if ((p.ids && p.ids.length === 0 && !p.vit) || (p.vit && !p.vit.length)) S.pick = null;   // (nothing to choose from)
	return S.pick;
}
/** Meowth's prices now, by stock slot (the more you buy without opening balls, the dearer). */
export function shopPrices(S, stock) { const E = S.X.E, h = E.heatOf(S.eco.buys, S.eco.opened), z = zoneNow(S), I = S.L.I; return (stock || []).map((id) => E.price(I.IT[id] ? I.IT[id].rar : 0, z, h)); }
/** Take choice i of the pick that is up. -> whether it was taken */
export function pickTake(S, i) {
	const P = S.pick, Z = S.eco && S.eco.z; if (!P || P.taken.includes(i)) return false;
	if (P.onTake) { const ok = P.onTake(i); if (ok && S.pick === P && !P.hold) S.pick = null; return ok; }   // (a choice with its own answer: capture's swap)
	if (P.kind === 'hypno') {   // forget a vitamin: its slot is free again
		const pl = S.w.pl, k = pl.xv.findIndex((x) => x.id === P.vit[i]); if (k < 0) return false;
		pl.xv.splice(k, 1); S.L.I.apply(pl);
		if (Z && P.obj != null) markUsed(S, Z, Z.lay.objs[P.obj]);
		if (S.eco) S.eco.log.hypno++; S.pick = null; return true;   // (a co-op guest forgets its own: it has no economy of its own to log to)
	}
	const id = P.ids[i]; if (!id) return false;
	if (P.kind === 'shop') {
		if (!Z || !Z.stock || (Z.sold & (1 << i))) return false;
		const cost = shopPrices(S, Z.stock)[i];
		if (!spend(S, cost)) { say(S, `You need ${cost - S.coins} ₽ more`, 2.2); return false; }
		Z.sold |= 1 << i; S.eco.buys++; S.eco.log.shop++; S.eco.used++;
		takeItem(S, id); P.taken.push(i); P.prices = shopPrices(S, Z.stock);
		return true;
	}
	takeItem(S, id); P.taken.push(i);
	if (P.taken.length >= P.picks) S.pick = null;
	return true;
}
/** Leave the pick that is up (a shop, Hypno; a ball's choice cannot be left). */
export function pickClose(S) { const P = S.pick; if (!P || !(P.kind === 'shop' || P.kind === 'hypno' || P.onClose)) return false; S.pick = null; if (P.onClose) P.onClose(); return true; }

// ---------------------------------------------------------------- a zone's state
const zoneState = (lay) => { const n = lay.objs.length; return { lay, st: new Array(n).fill(FRESH), ch: new Array(n).fill(0), t: new Array(n).fill(0), latch: new Set(), wave: new Map(), visit: -1, stock: null, sold: 0, spot: -1, slot: new Map(), per: new Map() }; };   // (per: each co-op guest's own stand clocks and latches)
function markUsed(S, Z, o, st = USED) { Z.st[o.i] = st; if (st === USED) { S.eco.used++; S.eco.last = o.i; } }
/** A wave of the zone's Pokémon round a thing (its own stream). opt: { hp, dex: [..], d (units away) }. -> the new enemies */
export function horde(S, o, n, opt = {}) {
	const w = S.w, out = [], cards = S.plan.cards.slice(0, Math.min(8, S.plan.cards.length)), rng = makeRng(mix(S.seed, S.zone, o.i, 0x7A7E, S.eco.waves++));
	const a0 = rng() * 6.2832, d0 = (opt.d || EK.HORDE_D) * U;
	for (let k = 0; k < n; k++) {
		const dex = opt.dex ? opt.dex[k % opt.dex.length] : cards[Math.floor(rng() * cards.length) % cards.length], fly = S.data.hovers(dex), ang = a0 + k / n * 6.2832;
		let pt = null;
		for (const f of [1, 0.6, 1.5, 0.3]) {   // (a cliff in the way: nearer, then further)
			for (let i = 0; i < 6 && !pt; i++) { const a = ang + (i ? (rng() - 0.5) * 1.8 : 0), d = d0 * f + rng() * 60 * U, x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d; if (free(S, x, z, fly)) pt = [x, z]; }
			if (pt) break;
		}
		if (!pt) pt = [o.x + Math.cos(ang) * EK.HORDE_NEAR * U, o.z + Math.sin(ang) * EK.HORDE_NEAR * U];
		const e = spawn(S, dex, pt[0], pt[1], { hp: opt.hp || 1 });
		e.xch = o.i + 1; out.push(e);
	}
	S.eco.hordes.push([o.i, out.length]);
	return out;
}

// ---------------------------------------------------------------- balls, blessings, the slot machine
// (co-op: `m` is the GUEST standing there, by its puppet on the host; null: the host itself. The host keeps every
// thing's state and the team's money; what is a player's own (an item, a choice of items) goes to a guest as a SEED,
// and the guest rolls it from its own pool on its side: its items, its room for them.)
const per = (Z, m) => { if (!m) return Z; let P = Z.per.get(m.id); if (!P) { P = { t: new Array(Z.st.length).fill(0), latch: new Set() }; Z.per.set(m.id, P); } return P; };
const lacking = (S, cost) => say(S, `You need ${cost - S.coins} ₽ more`, 2.4);
function openBall(S, Z, o, as, m = null) {
	const E = S.X.E, K = E.K, kind = as || o.kind, pl = S.w.pl, P = per(Z, m), who = m || pl;
	if (kind === 'ball') {
		const cost = E.ballCost(S.eco.balls, m ? 0 : pl.xluck || 0);
		P.latch.add(o.i); P.t[o.i] = 0;
		if (S.coins < cost) { lacking(S, cost); return false; }
		spend(S, cost); S.eco.balls++;
	}
	markUsed(S, Z, o); S.eco.opened++; S.eco.log.balls++;
	const sd = seedFor(S, o.i, 0xBA11), rng = makeRng(sd);
	if (kind === 'ball' || kind === 'great') {
		const n = K.OFFERS + (S.eco.mods.loot | 0), min = kind === 'great' ? 1 : 0;
		if (m) { m.gifts.push({ k: 'xo', kind: 'ball', title: EK.NAME[kind], sd, n, min, picks: 1 }); return true; }
		const ids = rollOffers(S, rng, n, min); openPick(S, { kind: 'ball', title: EK.NAME[kind], sub: `Choose 1 of ${ids.length}`, ids, picks: 1 }); return true;
	}
	if (kind === 'freeball') { if (m) m.gifts.push({ k: 'xg', sd, n: 1, min: 0 }); else { const id = rollOffers(S, rng, 1, 0)[0]; if (id) takeItem(S, id); } return true; }
	// cursed: + 5 % difficulty, a ghost ambush, an item (a second at 40 % x (1 + luck / 100))
	S.eco.mods.diff += K.CURSE_BALL;
	const two = rng() < K.CURSE_2ND * (1 + (m ? 0 : pl.xluck || 0) / 100);
	if (m) m.gifts.push({ k: 'xg', sd, n: two ? 2 : 1, min: 0, skip: 1 });   // (the guest's items, from the same stream past the "two" draw)
	else for (const id of rollOffers(S, rng, two ? 2 : 1, 0)) takeItem(S, id);
	horde(S, { i: o.i, x: who.s.x, z: who.s.z }, K.GHOSTS[0] + K.GHOSTS[1] * zoneNow(S), { dex: K.GHOST_DEX.filter((d) => S.data.mon(d)), d: 220 });
	say(S, 'The Poké Ball was cursed! +5% difficulty · Ghost ambush!', 3);
	return true;
}
/** An Unown altar (tier 0-3) or the comet (tier null) is full. */
function blessing(S, Z, o, tier, m = null) {
	const K = S.X.E.K;
	markUsed(S, Z, o); Z.ch[o.i] = 1; S.eco.log.altars++;
	const sd = seedFor(S, o.i, 0xB1E5), rng = makeRng(sd);
	const [n, picks, min] = tier == null ? [3, 1, 1] : K.UNOWN_OFFERS[tier], kind = tier == null ? 'comet' : 'unown', title = tier == null ? EK.NAME.comet : tier === 3 ? 'Golden blessing!' : 'Unown blessing';   // (the comet's + 25 % Ultimate charge waits for Ultimates)
	if (m) { m.gifts.push({ k: 'xo', kind, title, sd, n, min, picks }); return; }
	const ids = rollOffers(S, rng, n, min);
	openPick(S, { kind, title, sub: `Choose ${Math.min(picks, ids.length)} of ${ids.length}`, ids, picks: Math.min(picks, ids.length) });
}
/** The reels slot machine i would roll next (it draws nothing). */
export const peekSpin = (S, i) => S.X.E.reels(makeRng(mix(S.seed, S.X.MAP_IDS.indexOf(S.map) + 1, S.zone, i, 0x5107, S.eco.draws)));
function spin(S, Z, o, m = null) {
	const E = S.X.E, K = E.K, pl = S.w.pl, zone = zoneNow(S), cost = E.slotCost(zone);
	if (!spend(S, cost)) { lacking(S, cost); return false; }
	const sd = seedFor(S, o.i, 0x5107), rng = makeRng(sd), r = E.reels(rng), p = E.payout(r), sym = K.SLOT_SYM[p.sym];
	Z.slot.set(o.i, { n: ((Z.slot.get(o.i) || {}).n || 0) + 1, r, win: p.kind });
	S.eco.log.spins++; S.eco.used++;
	S.w.events.push({ k: 'spin', r, win: p.kind });
	if (p.kind === 'bad' || p.kind === 'boom') {
		const boom = p.kind === 'boom', dex = boom || zone >= 3 ? 101 : 100, [a, b] = boom ? K.SLOT_AMBUSH3 : K.SLOT_AMBUSH;
		horde(S, o, a + b * zone, { dex: [dex], d: 200 }); S.eco.log.ambush++;
		if (boom) { markUsed(S, Z, o); say(S, 'Three Voltorb! The machine explodes', 3); } else say(S, dex === 101 ? 'Bad spin! Electrode!' : 'Bad spin! Voltorb!', 2.4);
		return true;
	}
	if (p.kind === 'none') { say(S, 'No prize', 1.8); return true; }
	S.eco.log.slotWins++;
	if (p.kind === 'pair') { say(S, `A pair: +${earn(S, cost * K.SLOT_PAIR)} ₽`, 2.4); return true; }
	if (sym === 'nugget') { say(S, `Jackpot! +${earn(S, cost * K.SLOT_JACKPOT)} ₽`, 3); return true; }
	if (sym === 'berry') {
		say(S, 'Prize! Berries and an item', 2.6);
		if (m) { m.gifts.push({ k: 'heal', v: K.BERRY }, { k: 'xg', sd, n: 1, min: 0, skip: 3 }); return true; }   // (past the three reels' draws)
		pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * K.BERRY); const id = rollOffers(S, rng, 1, 0)[0]; if (id) takeItem(S, id); return true;
	}
	const [n, picks, min] = { poke: [3, 1, 0], great: [3, 1, 1], ultra: [3, 1, 2], master: [4, 2, 3] }[sym];
	if (m) { m.gifts.push({ k: 'xo', kind: 'ball', title: EK.NAME.slots, sd, n, min, picks, skip: 3 }); return true; }
	const ids = rollOffers(S, rng, n, min);
	openPick(S, { kind: 'ball', title: EK.NAME.slots, sub: `Choose ${Math.min(picks, ids.length)} of ${ids.length}`, ids, picks: Math.min(picks, ids.length) });
	return true;
}

// ---------------------------------------------------------------- standing in things
/** The altars that charge for whoever stands in them: one clock for everyone. */
const SHARED = ['unown1', 'unown2', 'unown3', 'unown4', 'comet'];
/** One thing's step for one player. d: how far they are from it on the ground (Infinity when not on its level).
 *  m: the co-op guest standing there (its puppet), or null for the host. */
function step(S, Z, o, st, d, dt, zt, m = null) {
	const E = S.X.E, K = E.K, w = S.w, pl = w.pl, who = m || pl, pr = who.r, T = CELL, P = per(Z, m);
	const stand = (r, need) => { if (d < r) { P.t[o.i] += dt; return P.t[o.i] >= need; } P.t[o.i] = Math.max(0, P.t[o.i] - dt * 2); return false; };
	switch (o.kind) {
		case 'ball': case 'freeball': case 'cursedball': if (!P.latch.has(o.i) && stand(1.15 * T + pr, K.OPEN_T)) openBall(S, Z, o, null, m); return;
		case 'meowth': {
			if (Z.spot !== o.i || P.latch.has(o.i) || d > 1.7 * T + pr) return;
			P.latch.add(o.i);
			if (m) m.gifts.push({ k: 'xs', visit: Z.visit, stock: (Z.stock || []).slice(), sold: Z.sold, prices: shopPrices(S, Z.stock) });   // (the guest's shop opens on its side; its buys come back)
			else openPick(S, { kind: 'shop', title: EK.NAME.meowth, sub: 'Buy what you like; walk away to leave', ids: Z.stock || [], picks: 99, prices: shopPrices(S, Z.stock) });
			return;
		}
		case 'unown1': case 'unown2': case 'unown3': case 'unown4': case 'comet': {
			const comet = o.kind === 'comet', tier = comet ? 0 : +o.kind[5] - 1;
			if (comet) {
				if (st === FRESH) { if (zt >= Z.lay.cometAt) { Z.st[o.i] = READY; say(S, 'A comet shard has fallen!', 2.6); } return; }
				if (zt >= Z.lay.cometAt + K.COMET_LIFE && d >= K.COMET_R * T + pr) { Z.st[o.i] = GONE; Z.ch[o.i] = 0; say(S, 'The comet shard burns out', 2.2); return; }
			} else if (tier === 3 && zt < K.SEAL) return;   // (the golden altar is sealed for the first 90 s)
			const need = comet ? K.COMET_T : K.UNOWN_T[tier], inside = d < (comet ? K.COMET_R : K.UNOWN_R[tier]) * T + pr * 0.5;
			Z.ch[o.i] = Math.max(0, Math.min(1, Z.ch[o.i] + (inside ? dt / need : -dt / need * K.DRAIN)));
			Z.st[o.i] = Z.ch[o.i] > 0 ? ACTIVE : comet ? READY : FRESH;
			if (inside && !comet && tier >= 2 && Z.ch[o.i] < 1) { Z.t[o.i] -= dt; if (Z.t[o.i] <= 0) { Z.t[o.i] = K.HORDE_EVERY; horde(S, o, K.HORDE[0] + K.HORDE[1] * zoneNow(S) + (tier === 3 ? K.HORDE[2] : 0)); say(S, 'Horde!', 2); } }
			if (Z.ch[o.i] >= 1) blessing(S, Z, o, comet ? null : tier, m);
			return;
		}
		case 'challenge': {
			if (st === FRESH) {
				if (!stand(1.6 * T + pr, K.CHAL_T)) return;
				Z.st[o.i] = ACTIVE; P.t[o.i] = 0;
				const es = horde(S, o, K.CHAL_N[0] + K.CHAL_N[1] * zoneNow(S), { hp: K.CHAL_HP }); Z.wave.set(o.i, es);
				say(S, 'Challenge! Beat the wave', 2.6);
			} else if (st === ACTIVE) {
				if (!(Z.wave.get(o.i) || []).some((e) => !e.dead)) { Z.st[o.i] = READY; Z.wave.delete(o.i); P.t[o.i] = 0; say(S, 'Challenge beaten! A Great Ball', 2.8); }
			} else if (st === READY && !P.latch.has(o.i) && stand(1.15 * T + pr, K.OPEN_T)) openBall(S, Z, o, 'great', m);
			return;
		}
		case 'cursedaltar': case 'greed': {
			if (!stand(1.6 * T + pr, K.ALTAR_T)) return;
			markUsed(S, Z, o); S.eco.log.altars++;
			const M = S.eco.mods;
			if (o.kind === 'cursedaltar') {
				M.diff += K.CURSE_ALTAR.diff; M.rate += K.CURSE_ALTAR.rate;
				const sd = seedFor(S, o.i, 0xC0A5);
				if (m) m.gifts.push({ k: 'xg', sd, n: 1, min: 2 }); else { const id = rollOffers(S, makeRng(sd), 1, 2)[0]; if (id) takeItem(S, id); }
				say(S, 'Cursed! More enemies, more difficulty', 3);
			} else { M.diff += K.GREED.diff; M.xp += K.GREED.xp; M.money += K.GREED.money; M.loot = Math.max(M.loot, K.GREED.loot); say(S, "Gengar's greed! More difficulty, more loot", 3); }
			return;
		}
		case 'ditto': {
			if (P.latch.has(o.i) || !stand(1.3 * T + pr, K.MEET_T)) return;
			P.latch.add(o.i); P.t[o.i] = 0;
			if (m) { markUsed(S, Z, o); S.eco.log.ditto++; m.gifts.push({ k: 'xd', sd: seedFor(S, o.i, 0xD170) }); return; }   // (the guest's own items: it copies one on its side)
			const I = S.L.I, have = Object.keys(pl.xi).filter((id) => I.IT[id] && I.room(pl, id));
			if (!have.length) { say(S, 'Ditto has nothing to copy', 2.4); return; }
			const id = have[Math.floor(makeRng(seedFor(S, o.i, 0xD170))() * have.length) % have.length];
			markUsed(S, Z, o); S.eco.log.ditto++; takeItem(S, id); say(S, `Ditto copies ${S.L.en(I.IT[id].name)}`, 2.8);
			return;
		}
		case 'hypno': {
			if (P.latch.has(o.i) || !stand(1.3 * T + pr, K.MEET_T)) return;
			P.latch.add(o.i); P.t[o.i] = 0;
			if (m) { m.gifts.push({ k: 'xh', obj: o.i }); return; }   // (the guest forgets one of its own vitamins on its side; Hypno stays for the others)
			if (!pl.xv.length) { say(S, 'You have no vitamins to forget', 2.4); return; }
			openPick(S, { kind: 'hypno', title: EK.NAME.hypno, sub: 'Forget a vitamin to free its slot (or walk away)', vit: pl.xv.map((x) => x.id), picks: 1, obj: o.i });
			return;
		}
		case 'cage': {
			if (P.latch.has(o.i) || !stand(1.3 * T + pr, K.MEET_T)) return;
			P.latch.add(o.i); P.t[o.i] = 0;
			const cost = E.cageCost(zoneNow(S));
			if (!spend(S, cost)) { lacking(S, cost); return; }
			markUsed(S, Z, o); S.eco.log.freed++; researchCage(S, o.v);
			const xp = Math.round(pl.xpNext * K.CAGE_XP); gainXp(w, xp / (pl.xpMul || 1));   // (the team's XP is the host's: a guest freeing a cage levels everyone)
			say(S, `You free ${(S.data.mon(o.v) || {}).name || ''}! +${xp} XP`, 2.8);
			return;
		}
		case 'slots': if (!P.latch.has(o.i) && stand(1.3 * T + pr, K.SLOT_T)) { P.latch.add(o.i); P.t[o.i] = 0; spin(S, Z, o, m); } return;
		case 'rock': {
			if (d > 0.75 * T + pr) return;
			markUsed(S, Z, o); S.eco.log.rocks++;
			w.events.push({ k: 'coins', x: o.x, y: o.y, z: o.z, n: earn(S, o.v * zoneNow(S) * goldK(S)) });
			return;
		}
		case 'berry': {
			if (d > 0.85 * T + pr || who.hp >= who.maxHp) return;
			markUsed(S, Z, o); S.eco.log.berries++;
			if (m) { m.gifts.push({ k: 'heal', v: K.BERRY }); return; }
			const before = pl.hp; pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * K.BERRY);
			say(S, `Berries! +${Math.round(pl.hp - before)} HP`, 2.2);
			return;
		}
	}
}
/** A guest buys slot `slot` of Meowth's stock (its message to the host): the team pays, the item goes to the guest. */
function guestBuy(S, Z, m, slot) {
	if (!Z.stock || !(slot >= 0) || slot >= Z.stock.length || (Z.sold & (1 << slot))) return false;
	const cost = shopPrices(S, Z.stock)[slot];
	if (!spend(S, cost)) { lacking(S, cost); return false; }
	Z.sold |= 1 << slot; S.eco.buys++; S.eco.log.shop++; S.eco.used++;
	m.gifts.push({ k: 'xgi', id: Z.stock[slot], slot });
	return true;
}
/** Every tick of the run (after the fight's): KOs pay, and the things round every player. */
export function tickEco(S, dt) {
	const E = S.eco, w = S.w, pl = w.pl; if (!E) return;
	if (w.kos) for (const ko of w.kos.splice(0)) { onKill(S, ko); researchKo(S, ko); }   // (every KO since the last look, whoever finished it)
	const lay = layoutOf(w.room, S);
	if (!lay) { E.z = null; return; }
	if (!E.z || E.z.lay !== lay) E.z = zoneState(lay);
	const Z = E.z, zt = w.t - S.zs, K = S.X.E.K;
	// Meowth comes and goes
	const vis = lay.visits.find((q) => zt >= q.at && zt < q.until) || null;
	if (vis && (Z.visit !== vis.v || Z.spot < 0)) {
		Z.visit = vis.v; Z.spot = vis.spot; Z.sold = 0;
		Z.stock = rollOffers(S, makeRng(mix(S.seed, S.X.MAP_IDS.indexOf(S.map) + 1, S.zone, 0x3E0, vis.v)), K.STOCK, 0);
		say(S, 'Meowth has opened his stall!', 2.6);
	} else if (!vis && Z.visit >= 0 && Z.spot >= 0) { if (S.pick && S.pick.kind === 'shop') S.pick = null; Z.spot = -1; Z.stock = null; say(S, 'Meowth packs up', 2.2); }
	// (co-op) what the guests have asked for
	const guests = w.mates.filter((m) => !m.dead && !m.away);
	for (const m of w.mates) if (m.inbox) for (let i = m.inbox.length - 1; i >= 0; i--) if (m.inbox[i][0] === 'xb') { guestBuy(S, Z, m, m.inbox[i][1] | 0); m.inbox.splice(i, 1); }
	const reach = (p) => (o) => { const flat = Math.hypot(p.s.x - o.x, p.s.z - o.z); return [flat, Math.abs(p.s.y - o.y) <= XK.SITE_UP ? flat : Infinity]; };
	const mine = reach(pl), theirs = guests.map((m) => [m, reach(m)]);
	for (const o of lay.objs) {
		if (Z.st[o.i] === USED || Z.st[o.i] === GONE) continue;
		const [flat, d] = pl.dead ? [Infinity, Infinity] : mine(o);
		if (Z.latch.has(o.i) && flat > 3.2 * CELL + pl.r) Z.latch.delete(o.i);
		if (theirs.length && SHARED.includes(o.kind)) {   // an altar charges for whoever is nearest
			let who = null, best = d, bf = flat;
			for (const [m, at] of theirs) { const [f2, d2] = at(o); if (d2 < best || (best === Infinity && f2 < bf)) { best = d2; bf = f2; who = m; } }
			if ((!pl.dead && !(S.pick && !who)) || who) step(S, Z, o, Z.st[o.i], best, dt, zt, who);
			continue;
		}
		if (!pl.dead && !S.pick) step(S, Z, o, Z.st[o.i], d, dt, zt);   // (with a choice of yours up, you open nothing else)
		if (S.pick && !theirs.length) break;   // (alone: a choice opened, the fight holds)
		for (const [m, at] of theirs) {
			if (Z.st[o.i] === USED || Z.st[o.i] === GONE) break;
			const P = per(Z, m), [f2, d2] = at(o);
			if (P.latch.has(o.i) && f2 > 3.2 * CELL + m.r) P.latch.delete(o.i);
			step(S, Z, o, Z.st[o.i], d2, dt, zt, m);
		}
	}
}
/** What there is to see: every thing of the zone with its state, for the page and the minimap. */
export function ecoView(S) {
	const Z = S.eco && S.eco.z; if (!Z) return [];
	return Z.lay.objs.filter((o) => Z.st[o.i] !== USED && Z.st[o.i] !== GONE && (o.kind !== 'meowth' || Z.spot === o.i) && (o.kind !== 'comet' || Z.st[o.i] === READY || Z.st[o.i] === ACTIVE))
		.map((o) => ({ i: o.i, kind: o.kind === 'challenge' && Z.st[o.i] === READY ? 'great' : o.kind, x: o.x, y: o.y, z: o.z, st: Z.st[o.i], ch: Z.ch[o.i] }));
}
