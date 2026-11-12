// explevel.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): an Expedition run's own level-ups, on top of
// expedition.js. They are not the base game's: a move has LEVELS 1-8 (+8 % damage each) and every level brings ROLLS
// (damage, cooldown, count, area, speed, duration, crit, status) sized by the card's RARITY; VITAMINS (21, three slots,
// ten levels) raise the run's STATS; with nothing left to offer, Training. Three tools: Refresh, Skip, Banish.
//
// The tables and the arithmetic are the 2D game's own, called as they are: js/expedition/levelups.js (card weights,
// rarity odds, the XP curve), items.js (vitamins, the stats and how they add up, how they land on the player),
// moves.js (a move's levels and rolls, and its numbers rebuilt from them), league.js (which moves are physical). What
// is here is the deal of the cards, written for this module's player, and the stats that act in a fight (a dodge, the
// shield, lifesteal, the curse).
//
// Not here yet: the 60 items and their procs (they arrive with the economy that hands them out), the League's kits and
// evolutions, and the Lab's extra slots.
import { rng as makeRng } from './gen.js';
import { canFire } from './combat.js';

/** The 2D game's level-up tables, as this module reads them. G: its global with expedition/items.js, levelups.js,
 *  moves.js, league-data.js and league.js loaded. */
export function levelFrom(G) {
	const L = G.ExpLevel, I = G.ExpItems, M = G.ExpMoves, EN = G.ExpEN || {};
	return { K: L.K, IK: I.K, MK: M.K, I, M, RAR_MUL: I.RAR_MUL, RAR: I.RAR, VITAMINS: I.VITAMINS, VIT: I.VIT, rollRarity: L.rollRarity, odds: L.odds,
		need: (lv) => Math.round(L.K.XP_K * (L.K.XP_A + L.K.XP_B * lv + Math.pow(lv, L.K.XP_P))),
		pool: (types) => Object.keys(M.MOVES).concat(...types.map((t) => G.Moves.POOL[t] || [])), def: (id) => M.MOVES[id] || G.Moves.BY_ID[id],
		en: (s) => EN[s] || s, classOf: (id) => (G.ExpLeague ? G.ExpLeague.classOf(id) : 'spec') };
}
function mix(...vals) {
	let h = 0x2545F491 | 0;
	for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
	return h >>> 0;
}
const alias = (o, name, field) => Object.defineProperty(o, name, { get() { return this[field]; }, set(v) { this[field] = v; }, configurable: true });

/** The sum of one of the run's stats (vitamins, Training; same-stat bonuses add). */
export const total = (S, stat) => S.L.I.total(S.w.pl, stat);
/** A move's Expedition level (1-8). */
export const levelOf = (m) => m.xlv || 1;

/** Give a run its level-ups. S: expedition.js's run; L: levelFrom(G); lv: [[move id, level]] to start at. */
export function setup(S, L, lv = []) {
	const w = S.w, pl = w.pl, K = L.K;
	S.L = L;
	// the 2D game's functions write a player's fields by its names for them: the same fields here, under both names
	alias(pl, 'critChance', 'crit'); alias(pl, 'regenFlat', 'baseRegen'); alias(pl, 'dmgReduce', 'baseReduce');
	pl.coinMul = 1; pl.xluck = 0;
	L.I.ensure(pl);
	for (const m of pl.moves) L.M.base(m);
	for (const [id, n] of lv) { const m = pl.moves.find((q) => q.id === id); for (let i = 1; m && i < n; i++) L.M.levelUp(pl, m, []); }
	S.lv = { draw: 0, refreshes: K.REFRESH, skips: K.SKIP, bans: K.BANISH, banned: new Set(), log: [], coins: 0 };
	w.xpNeed = L.need; pl.xpNext = L.need(pl.level);
	w.offerCards = () => offerCards(S);
	w.hooks = {
		// a hit you take: a dodge (never above 40 %), then the shield soaks what it can
		hurt: (ww, d) => {
			const P = pl.xproc, ev = Math.min(L.IK.EVADE_CAP, total(S, 'evade'));
			if (ev > 0 && ww.rand() < ev) { ww.events.push({ k: 'dodge' }); return 0; }
			P.shieldT = 0;
			if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; if (d <= 0) { ww.events.push({ k: 'shielded' }); return 0; } }
			return d;
		},
		// a hit you land: lifesteal is banked, and paid back at no more than 5 % of your HP a second
		dealt: (ww, d) => { const s = total(S, 'steal'); if (s > 0 && d > 0) pl.xproc.steal = Math.min(pl.maxHp * L.IK.STEAL_CAP, pl.xproc.steal + d * s); },
	};
	L.I.apply(pl);
	return S.lv;
}
/** Every tick of the run: the shield comes back 4 s after the last hit; banked lifesteal heals. */
export function tickStats(S, dt) {
	const pl = S.w.pl, P = pl.xproc, IK = S.L.IK; if (pl.dead) return;
	const sh = total(S, 'shield');
	P.shieldT += dt;
	if (sh > 0 && P.shieldT >= IK.SHIELD_T) P.shield = sh;
	if (P.shield > sh) P.shield = sh;
	if (P.steal > 0) { const h = Math.min(P.steal, pl.maxHp * IK.STEAL_CAP * dt); P.steal -= h; pl.hp = Math.min(pl.maxHp, pl.hp + h); }
}
/** What the Cursed Incense does to the zone's enemies (HP and damage), and to their XP. */
export const curse = (S) => (S.L ? total(S, 'curse') : 0);

// ---------------------------------------------------------------- the cards
const banned = (S, k) => S.lv.banned.has(k);
/** The moves you could learn now: your types', from the base game's pools and Expedition's own (one buff or weather
 *  move at most). */
export function moveCands(S) {
	const L = S.L, pl = S.w.pl, types = pl.mon.types && pl.mon.types.length ? pl.mon.types : ['normal'], seen = new Set(), out = [];
	const buffs = pl.moves.filter((m) => m.kind === 'buff' || m.kind === 'weather').length;
	for (const id of L.pool(types)) {
		const d = L.def(id);
		if (!d || seen.has(id) || pl.moves.some((m) => m.id === id) || banned(S, id) || !types.includes(d.type) || !canFire(d.kind)) continue;
		if ((d.kind === 'buff' || d.kind === 'weather') && buffs >= 1) continue;
		seen.add(id); out.push(id);
	}
	return out;
}
/** The move a swap card replaces: your lowest-level one (on a tie, the last). */
export function swapOut(S) { let best = null; for (const m of S.w.pl.moves) if (!best || levelOf(m) <= levelOf(best)) best = m; return best; }
const dress = (S, c, ti) => { c.tier = ti; c.rar = ti + 1; c.rarName = S.L.RAR[ti]; return c; };
const rollsText = (S, rolls) => rolls.map((r) => S.L.M.rollText(r));
function upCard(S, m, ti, rng) {
	const L = S.L, pl = S.w.pl, rolls = L.M.drawRolls(m, ti, L.RAR_MUL[ti], rng), lv = levelOf(m);
	return dress(S, { type: 'up', kind: 'move', key: 'up:' + m.id, id: m.id, title: m.id, mtype: m.type, rolls, tag: `Lv ${lv} > ${lv + 1}`, desc: [`+${Math.round(L.MK.LV_DMG * 100)}% damage`].concat(rollsText(S, rolls)).join(' · '),
		apply: () => { L.M.levelUp(pl, m, rolls); S.lv.log.push([pl.level, 'up', m.id, ti]); } }, ti);
}
function newCard(S, id, ti, rng, old = null) {
	const L = S.L, w = S.w, pl = w.pl, d = L.def(id), tmp = L.M.instance(id), rolls = ti > 0 ? L.M.drawRolls(tmp, ti, L.RAR_MUL[ti], rng) : [];
	const c = dress(S, { type: old ? 'swap' : 'new', kind: 'move', key: (old ? 'swap:' : 'new:') + id, id, xban: id, title: id, mtype: d.type, rolls, tag: old ? `Replaces ${old.id}` : d.type + ' · ' + d.kind,
		desc: (old ? `Forgets ${old.id} (Lv ${levelOf(old)}). ` : '') + rollsText(S, rolls).join(' · '),
		apply: () => {
			if (pl.moves.some((q) => q.id === id)) return;
			const m = w.data.move(id); let at = pl.moves.length;
			if (old) { at = pl.moves.indexOf(old); if (at < 0) return; pl.moves.splice(at, 1); w.orbs = w.orbs.filter((p) => p.mid !== old.id); c.swapOut = old.id; }
			else if (pl.moves.length >= L.K.MAX_MOVES) return;
			pl.moves.splice(at, 0, m);
			L.M.base(m);
			if (rolls.length) L.M.addRolls(pl, m, rolls); else L.M.refresh(pl, m);
			S.lv.log.push([pl.level, old ? 'swap' : 'new', old ? id + '>' + old.id : id, ti]);
		} }, ti);
	if (old) c.swapOut = old.id;
	return c;
}
function vitCard(S, id, ti) {
	const L = S.L, pl = S.w.pl, v = L.VIT[id], x = L.I.vitOf(pl, id), lv = x ? x.lvl : 0;
	const c = dress(S, { type: x ? 'up' : 'new', kind: 'vit', key: 'vit:' + id, id, title: L.en(v.name), tag: x ? `Vitamin Lv ${lv} > ${lv + 1}` : 'Vitamin',
		desc: L.I.vitText(id, L.RAR_MUL[ti]) + (x ? '' : ` · Slot ${pl.xv.length + 1}/${L.IK.VIT_SLOTS}`),
		apply: () => { L.I.takeVitamin(pl, id, ti); S.lv.log.push([pl.level, 'vit', id, ti]); } }, ti);
	if (!x) c.xban = 'v:' + id;
	return c;
}
/** With nothing else to offer: Training (a little damage or HP, less each time, never under a third) or a rest. */
export function trainCards(S) {
	const L = S.L, K = L.K, pl = S.w.pl, n = pl.xtr.n, k = Math.max(K.TRAIN_MIN, 1 / (1 + K.TRAIN_DECAY * n));
	const dmg = +(K.TRAIN_DMG * k).toFixed(4), hp = Math.max(1, Math.round(K.TRAIN_HP * k)), log = (key) => S.lv.log.push([pl.level, 'train', key, 0]);
	return [
		{ type: 'stat', kind: 'train', key: 'xtrain:dmg', title: 'Training', tag: 'Training', desc: L.I.statText('dmg', dmg), apply: () => { pl.xtr.n++; pl.xtr.dmg += dmg; L.I.apply(pl); log('dmg'); } },
		{ type: 'stat', kind: 'train', key: 'xtrain:hp', title: 'Training', tag: 'Training', desc: L.I.statText('hp', hp), apply: () => { pl.xtr.n++; pl.xtr.hp += hp; L.I.apply(pl); log('hp'); } },
		{ type: 'stat', kind: 'train', key: 'xtrain:rest', title: 'Rest', tag: 'Rest', desc: 'Heals 40% of your HP.', apply: () => { pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.4); log('rest'); } },
	];
}
/** Every card that could be dealt now: { key, w, kind, make(tier, rng) -> card }. */
export function candidates(S) {
	const L = S.L, K = L.K, pl = S.w.pl, out = [];
	for (const m of pl.moves) if (levelOf(m) < L.MK.MAX_LV) out.push({ key: 'up:' + m.id, w: K.W.up, kind: 'move', make: (ti, rng) => upCard(S, m, ti, rng) });
	const cs = moveCands(S);
	// (the 2D run fills its four slots from the League's kit; until the League is here, a free slot is offered a move)
	if (pl.moves.length < K.MAX_MOVES) for (const id of cs) out.push({ key: 'new:' + id, w: K.W.newMove, kind: 'move', make: (ti, rng) => newCard(S, id, ti, rng) });
	else { const old = swapOut(S); if (old && cs.length) for (const id of cs) out.push({ key: 'swap:' + id, w: K.W.swap / cs.length, kind: 'move', make: (ti, rng) => newCard(S, id, ti, rng, old) }); }
	if (pl.xv.length < L.IK.VIT_SLOTS) for (const v of L.VITAMINS) if (!L.I.vitOf(pl, v.id) && !banned(S, 'v:' + v.id)) out.push({ key: 'vit:' + v.id, w: K.W.newVit, kind: 'vit', make: (ti) => vitCard(S, v.id, ti) });
	for (const x of pl.xv) if (x.lvl < L.IK.VIT_MAX) out.push({ key: 'vit:' + x.id, w: K.W.vitUp, kind: 'vit', make: (ti) => vitCard(S, x.id, ti) });
	return out;
}
/** A level's cards: three, drawn by weight from the run's own seeded stream; a move card is always among them and
 *  comes first; each gets a rarity by your level, luck and zone. */
export function offerCards(S, n = S.L.K.CARDS) {
	const L = S.L, pl = S.w.pl;
	L.M.refreshAll(pl);
	const rng = makeRng(mix(S.seed, pl.level, S.lv.draw++, 0xD5));
	const pool = candidates(S), picked = [], o = { level: pl.level, luck: pl.xluck || 0, zone: Math.min(4, S.zone) };
	while (picked.length < n && pool.length) {
		const tot = pool.reduce((a, c) => a + c.w, 0);
		let r = rng() * tot, i = 0;
		for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
		picked.push(pool.splice(i, 1)[0]);
	}
	if (!picked.some((c) => c.kind === 'move')) { const j = pool.findIndex((c) => c.kind === 'move'); if (j >= 0) { if (picked.length >= n) picked.pop(); picked.push(pool.splice(j, 1)[0]); } }
	picked.sort((a, b) => (a.kind === 'move' ? 0 : 1) - (b.kind === 'move' ? 0 : 1));
	const cards = picked.map((c) => c.make(L.rollRarity(rng, o), rng));
	return cards.length ? cards : trainCards(S).slice(0, n);
}

// ---------------------------------------------------------------- the tools
const choosing = (S) => !!S.w.pl.choices;
/** Refresh: other cards for this level (two a run). */
export function refresh(S) { if (!choosing(S) || S.lv.refreshes <= 0) return false; S.lv.refreshes--; S.w.pl.choices = offerCards(S); S.w.events.push({ k: 'levelup', level: S.w.pl.level }); return true; }
/** Skip: no card; 10 x zone of the run's money instead (two a run). */
export function skip(S) {
	const pl = S.w.pl; if (!choosing(S) || S.lv.skips <= 0) return false;
	const coins = S.L.K.SKIP_COINS * Math.min(4, S.zone);
	S.lv.skips--; S.lv.coins += coins; pl.choices = null; pl.pending--;
	S.lv.log.push([pl.level, 'skip', 'skip', 0]); S.w.events.push({ k: 'chose', key: 'skip', coins });
	return true;
}
/** Banish: card i (a move or a vitamin you do not have yet) is never offered again this run; other cards come up. */
export function banish(S, i) {
	const pl = S.w.pl, c = pl.choices && pl.choices[i];
	if (!c || !c.xban || S.lv.bans <= 0) return false;
	S.lv.banned.add(c.xban); S.lv.bans--; pl.choices = offerCards(S); S.w.events.push({ k: 'levelup', level: pl.level });
	return true;
}
