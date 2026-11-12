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
// The 60 ITEMS are here too (they stack; no slots): their stats add up with the vitamins', and the ones that do
// something do it here: thorns, the Focus Band, the three revives, Sitrus, the Weakness Policy, execute, flinch, the
// time stop, and the four epic items' timed strikes. The economy (expeco.js) hands them out.
// Not here yet: the League's kits and evolutions (so Eviolite does nothing), and the Lab's extra slots.
import { rng as makeRng } from './gen.js';
import { moveActor } from './actors.js';
import { canFire, land, attackOf, CK, U } from './combat.js';

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
	S.lv = { draw: 0, refreshes: K.REFRESH, skips: K.SKIP, bans: K.BANISH, banned: new Set(), log: [], items: 0, rifts: [] };
	S.coins = S.coins || 0;
	w.xpNeed = L.need; pl.xpNext = L.need(pl.level);
	w.offerCards = () => offerCards(S);
	w.hooks = {
		// a hit you take: a dodge (never above 40 %), then the shield soaks what it can
		hurt: (ww, d) => {
			const P = pl.xproc, ev = Math.min(L.IK.EVADE_CAP, total(S, 'evade'));
			if (ev > 0 && ww.rand() < ev) { ww.events.push({ k: 'dodge' }); return 0; }
			P.shieldT = 0;
			if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; if (d <= 0) { ww.events.push({ k: 'shielded' }); return 0; } }
			if (L.I.has(pl, 'weaknesspolicy')) P.wpT = 6;   // (a hit taken: + 30 % damage for 6 s)
			const th = total(S, 'thorns');   // the Rocky Helmet hurts whoever is on you
			if (th > 0) { const e = nearest(ww, pl.s, pl.r + 46 * U)[0]; if (e) land(ww, e, th * (1 + L.IK.PROC_LV * (pl.level - 1)), e.a.x - pl.s.x, e.a.z - pl.s.z, 80, { kind: 'item' }); }
			return d;
		},
		// a hit you land: lifesteal is banked, and paid back at no more than 5 % of your HP a second
		dealt: (ww, d) => { const s = total(S, 'steal'); if (s > 0 && d > 0) pl.xproc.steal = Math.min(pl.maxHp * L.IK.STEAL_CAP, pl.xproc.steal + d * s); },
		// a hit about to land: super-effective, bosses, the Weakness Policy, execute, flinch, the Relic Crown's time stop
		out: (ww, e, src, dmg) => {
			if (!pl.xi || !Object.keys(pl.xi).length) return 1;
			let k = 1; const mt = src && (src.mtype || src.type), P = pl.xproc;
			const se = total(S, 'super'); if (se > 0 && mt && ww.data.typeLabel(ww.data.typeMult(mt, e.types)) === 'super') k *= 1 + se;
			const b = total(S, 'boss'); if (b > 0 && e.boss) k *= 1 + b;
			if (P.wpT > 0) k *= 1 + total(S, 'wpolicy');
			const ex = total(S, 'execute'); if (ex > 0 && !e.boss && e.hp > 0 && e.hp / e.maxHp < ex && dmg > 0) k = Math.max(k, (e.hp + 1) / dmg);
			const fl = total(S, 'flinch'); if (fl > 0 && !e.boss && ww.rand() < fl) e.frozenT = Math.max(e.frozenT, 0.4);
			if (L.I.has(pl, 'reliccrown') && ww.t - P.crownT >= 20) { P.crownT = ww.t; ww.events.push({ k: 'item', id: 'reliccrown' }); for (const o of nearest(ww, pl.s, 300 * U)) if (!o.boss) o.frozenT = Math.max(o.frozenT, 1); }
			return k;
		},
		// the hit that would finish you: the Focus Band, the Revival Herb (once a zone, in flames), a Revive, a Max Revive
		ko: (ww) => {
			const P = pl.xproc, f = total(S, 'focus');
			if (f > 0 && ww.t - P.focusT >= 20 && ww.rand() < f) { P.focusT = ww.t; pl.hp = 1; pl.invuln = 1.2; ww.events.push({ k: 'item', id: 'focusband' }); return true; }
			const back = (k, id) => { pl.hp = Math.max(1, Math.round(pl.maxHp * k)); pl.invuln = 2.2; ww.events.push({ k: 'item', id }); return true; };
			if (L.I.has(pl, 'revivalherb') && P.phoenixZone !== S.zone) {
				P.phoenixZone = S.zone; back(0.4, 'revivalherb');
				for (const e of nearest(ww, pl.s, 220 * U)) land(ww, e, pdmg(S, 60), e.a.x - pl.s.x, e.a.z - pl.s.z, 300, { type: 'fire', burn: 4, kind: 'item' });
				return true;
			}
			if (P.revives > 0) { P.revives--; return back(0.3, 'revive'); }
			if (P.maxrev > 0) { P.maxrev--; return back(0.6, 'maxrevive'); }
			return false;
		},
	};
	L.I.apply(pl);
	return S.lv;
}
/** The enemies within `r` metres of a point (on its level), nearest first. */
const nearest = (w, s, r) => w.enemies.filter((e) => !e.dead && Math.hypot(e.a.x - s.x, e.a.z - s.z) <= r && Math.abs(e.a.y - s.y) <= CK.REACH_UP * 2).sort((a, b) => Math.hypot(a.a.x - s.x, a.a.z - s.z) - Math.hypot(b.a.x - s.x, b.a.z - s.z));
/** An item's own strike: its base x (1 + 6 % a level) x your attack. */
const pdmg = (S, b) => b * (1 + S.L.IK.PROC_LV * (S.w.pl.level - 1)) * attackOf(S.w.pl);
const PROCS = { p_bolt: 2.5, p_solar: 6, p_ring: 4, p_rift: 8 };
/** One of the epic items' strikes (n: how many of it you hold). */
function proc(S, p, n) {
	const w = S.w, pl = w.pl, s = pl.s, foes = nearest(w, s, 340 * U); if (!foes.length) return;
	const hit = (e, d, src) => land(w, e, d, e.a.x - s.x, e.a.z - s.z, 40, { kind: 'item', ...src });
	w.events.push({ k: 'proc', id: p });
	if (p === 'p_bolt') for (const e of foes.slice(0, 3)) hit(e, pdmg(S, 14) * n, { type: 'electric' });   // the Electirizer: three bolts
	else if (p === 'p_solar') { const e = foes[0]; for (const o of nearest(w, { x: e.a.x, y: e.a.y, z: e.a.z }, 90 * U)) hit(o, pdmg(S, 40) * n, { type: 'grass' }); }   // the Sun Stone: a strike on the nearest
	else if (p === 'p_ring') for (const o of nearest(w, s, 120 * U)) hit(o, pdmg(S, 16) * n, { type: 'fire', burn: 3 });   // the Magmarizer: a ring of fire round you
	else if (p === 'p_rift') { const e = foes[Math.floor(foes.length / 2)]; S.lv.rifts.push({ x: e.a.x, y: e.a.y, z: e.a.z, t: 0, dmg: pdmg(S, 30) * n }); }   // the Meteorite: a rift that drags them in, then bursts
}
/** Take one of an Expedition item (they stack to a cap). -> how many you now hold; at the cap, 0 and a small heal. */
export function takeItem(S, id) {
	const L = S.L, pl = S.w.pl, it = L.I.IT[id]; if (!it) return 0;
	const n = L.I.takeItem(pl, id);
	if (n) { S.lv.log.push([pl.level, 'item', id, it.rar]); S.w.events.push({ k: 'say', text: `Item: ${L.en(it.name)}${n > 1 ? ' ×' + n : ''}`, s: 2.6 }); }
	else pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.2);
	return n;
}
/** An item for a drop (an alpha's, a roamer's): a rarity by your level, luck and zone, then one of it you have room for. */
export function rollItem(S, rng) {
	const L = S.L, pl = S.w.pl, ti = L.rollRarity(rng, { level: pl.level, luck: pl.xluck || 0, zone: Math.min(4, S.zone), item: true });
	for (let t = ti; t >= 0; t--) { const pool = L.I.ITEMS.filter((it) => it.rar === t && L.I.room(pl, it.id)); if (pool.length) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))].id; }
	return null;
}
/** The next dropped item of the run (its own seeded stream). */
export const dropItem = (S) => rollItem(S, makeRng(mix(S.seed, 0x17E3, S.lv.items++))) || 'leftovers';
/** Every tick of the run: the shield comes back 4 s after the last hit; banked lifesteal heals; the items' clocks. */
export function tickStats(S, dt) {
	const pl = S.w.pl, P = pl.xproc, IK = S.L.IK; if (pl.dead) return;
	const sh = total(S, 'shield');
	P.shieldT += dt;
	if (sh > 0 && P.shieldT >= IK.SHIELD_T) P.shield = sh;
	if (P.shield > sh) P.shield = sh;
	if (P.steal > 0) { const h = Math.min(P.steal, pl.maxHp * IK.STEAL_CAP * dt); P.steal -= h; pl.hp = Math.min(pl.maxHp, pl.hp + h); }
	if (!Object.keys(pl.xi).length) return;
	const w = S.w, I = S.L.I;
	if (P.wpT > 0) P.wpT -= dt;
	if (I.has(pl, 'sitrusberry') && pl.hp < pl.maxHp * 0.4 && w.t - P.sitrusT >= 60 / I.stacks(pl, 'sitrusberry')) { P.sitrusT = w.t; pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * 0.25); w.events.push({ k: 'item', id: 'sitrusberry' }); }
	for (const p in PROCS) { const n = total(S, p); if (!n) continue; P.t[p] = (P.t[p] || 0) + dt; if (P.t[p] < PROCS[p]) continue; P.t[p] = 0; proc(S, p, n); }
	const R = S.lv.rifts;
	for (let i = R.length - 1; i >= 0; i--) {
		const r = R[i]; r.t += dt;
		for (const e of nearest(w, r, 220 * U)) { if (e.boss) continue; const dx = r.x - e.a.x, dz = r.z - e.a.z, l = Math.hypot(dx, dz) || 1, st = Math.min(l, 150 * U * dt); moveActor(e.a, w.room, dx / l * st, dz / l * st); }
		if (r.t >= 1.5) { for (const e of nearest(w, r, 90 * U)) land(w, e, r.dmg, e.a.x - r.x, e.a.z - r.z, 120, { type: 'psychic', kind: 'item' }); w.events.push({ k: 'blast', x: r.x, y: r.y, z: r.z, r: 90 * U, id: null }); R.splice(i, 1); }
	}
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
	S.lv.skips--; S.coins += coins; if (S.eco) S.eco.earned += coins; pl.choices = null; pl.pending--;
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
