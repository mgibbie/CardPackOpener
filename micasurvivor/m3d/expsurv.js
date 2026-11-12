// expsurv.js — MicaSurvivor 3D, P4 (Plans/MICASURVIVOR_3D_PLAN.md): Expedition's SURVIVAL, an endless run on one map,
// on top of expedition.js (the same spawner, events and bosses from your damage). What is Survival's own:
//   milestones   a boss every 5:00; every third a LEGENDARY (the map's own first); at 45:00 MEWTWO, which does not end
//                the run. Each one down: a berry, an item (two for a legendary), and a PACT to choose.
//   phases       at 12:00 and 24:00 the enemies move to the next band and grow tougher.
//   timeline     every 5:00 segment brings an alpha, a swarm or a stampede, a flock, an elite wave, a rock slide, and
//                now and then a totem or a summoner, bigger as the segments go.
//   pacing       half as many enemies as Classic's trickle, each with 1.8 times the HP and XP.
//   wounds       from 30:00 every heal is worth 4 % less a minute, down to a fifth.
//   night        from 45:00 each new enemy has 12 % more HP and 6 % more damage a minute.
//   pacts        nine boon-for-a-price pacts, three offered after each milestone boss; one taken, or none.
//   siege        from 5:00, staying within 6 m of one spot for 20 s starts a siege: your damage falls toward 30 % and
//                flocks of fliers hunt you. Move, and it lifts.
//   migration    at 11:00, and every 11:00 after, a portal opens on the land's altar for 90 s: step in and the run
//                moves to a new land (new ground, new things).
//   its curve    above Lv 40 a level needs more XP than Classic's.
//   hazards      hostile ground on every land: mud slows you, quicksand slows and pulls you in, brambles cut you while
//                you move, burning ground burns. More kinds wake with the phases. A jump clears them; they never
//                finish you.
// The numbers, the milestones, each segment's plan, the pacts, the night, the wounds and the score are the 2D game's
// own (js/expedition/survival.js), called as they are.
//
// 3D's own: a new land is new ground (the 2D game comes back to the same three zones; here the land's number seeds the
// level). The siege's 6 m is measured on the ground, whatever your height.
// A land here is far smaller than a 2D one, so its hazards stand closer (5 cells apart; 2D: 7), as its things do.
// Not here yet: Mega bosses, Survival in co-op and for a watcher, its records.
import { K as SK, CELL, groundAt } from './sim.js';
import { rng as makeRng } from './gen.js';
import { CK, U, drop } from './combat.js';
import { XK, spawn, fire, makeBoss, escorts, spot, say, walkable, flat3, payOf } from './expedition.js';
import { dropItem } from './explevel.js';

function mix(...vals) {
	let h = 0x9E3779B9 | 0;
	for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
	return h >>> 0;
}
/** The 2D game's Survival tables, as this module reads them. G: its global with expedition/survival.js loaded. */
export function survFrom(G) {
	const V = G.ExpSurv, EN = G.ExpEN || {};
	return { K: V.K, PACTS: V.PACTS, PACT_BY: V.PACT_BY, phaseOf: V.phaseOf, woundK: V.woundK, nightOf: V.nightOf, milestone: V.milestone, segPlan: V.segPlan, offerOf: V.offerOf, curveK: V.curveK, scoreOf: V.scoreOf, HAZ: V.HAZ, en: (s) => EN[s] || s };
}
const name = (S, dex) => { const m = S.data.mon(dex); return m ? m.name : '#' + dex; };
const mmss = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

/** How a land's hazards stand in 3D: cells from where you arrive, from the altar, and from each other. */
export const HZ = { FROM_SPAWN: 5, FROM_ALTAR: 4, GAP: 5 };
/** A land's hostile ground: [{ i, kind ('mud' | 'brambles' | 'quicksand' | 'burning'), phase (it wakes in), x, y, z,
 *  r (m) }]. From the room and the seed only: the same for every viewer. Kept on the room. */
export function hazardsOf(room, S) {
	if (!room || room.shrine) return [];
	if (room.haz) return room.haz;
	const V = S.X.V, K = V.K, rng = makeRng(mix(S.seed, S.X.MAP_IDS.indexOf(room.map) + 1, room.zone, 0x4A2, room.seed | 0)), ok = walkable(room), cand = [], out = [];
	const sx = room.spawn[0] / CELL, sz = room.spawn[2] / CELL, ax = room.altar[0] / CELL, az = room.altar[2] / CELL;
	for (let cz = 2; cz < room.h - 2; cz++) for (let cx = 2; cx < room.w - 2; cx++) {
		const i = cz * room.w + cx; if (!ok[i] || room.cells[i] >= room.rimH || !flat3(room, cx, cz)) continue;
		if (Math.hypot(cx + 0.5 - sx, cz + 0.5 - sz) < HZ.FROM_SPAWN || Math.hypot(cx + 0.5 - ax, cz + 0.5 - az) < HZ.FROM_ALTAR) continue;
		cand.push([cx, cz]);
	}
	for (let i = cand.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cand[i], cand[j]] = [cand[j], cand[i]]; }
	for (const [cx, cz] of cand) {
		if (out.length >= K.HAZ_N) break;
		if (out.some((o) => Math.hypot(o.cx - cx, o.cz - cz) < HZ.GAP)) continue;
		const kind = V.HAZ[out.length % V.HAZ.length];
		out.push({ i: out.length, cx, cz, kind: kind.id, phase: kind.phase, x: (cx + 0.5) * CELL, y: room.cells[cz * room.w + cx], z: (cz + 0.5) * CELL, r: (K.HAZ_R[0] + rng() * (K.HAZ_R[1] - K.HAZ_R[0])) * CELL / 2 });
	}
	return (room.haz = out);
}
/** The hazard under a point at run time t (only those awake in its phase, and only on their own level), or null. */
export function hazardAt(S, x, y, z, t) {
	const ph = S.X.V.phaseOf(t);
	for (const o of hazardsOf(S.w.room, S)) if (o.phase <= ph && Math.abs(y - o.y) <= XK.SITE_UP && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return o;
	return null;
}
/** The land's hazards that are awake now, for the page to draw. */
export const hazardsNow = (S) => { const ph = S.X.V.phaseOf(S.w.t); return S.sv ? hazardsOf(S.w.room, S).filter((o) => o.phase <= ph) : []; };
/** Make a run a Survival run. */
export function setupSurv(S) {
	const V = S.X.V, w = S.w, pl = w.pl, s = pl.s;
	S.sv = { phase: 0, miles: 0, downs: 0, legends: 0, mewtwo: 0, land: 1, seg: -1, segEv: [], segN: 0, nextMig: V.K.MIGRATE_AT, portalUntil: 0, bosses: [], pacts: [], pactSeen: 0,
		siege: { ax: s.x, az: s.z, t: 0, on: false, k: 1, cd: 1 }, px: s.x, pz: s.z, haz: null, hazDmg: 0, lastHp: pl.hp, lastMax: pl.maxHp, said: { wounds: false, night: false }, log: { lands: 1, sieges: 0, flocks: 0 } };
	// its own curve: Classic's up to Lv 40, then slower
	if (S.L) { w.xpNeed = (lv) => Math.round(S.L.need(lv) * V.curveK(lv)); pl.xpNext = w.xpNeed(pl.level); }
	// the siege: your hits are worth less while it lasts
	const hooks = w.hooks || (w.hooks = {}), out = hooks.out;
	hooks.out = (ww, e, src, dmg) => (out ? out(ww, e, src, dmg) : 1) * (S.sv.siege.k < 1 ? S.sv.siege.k : 1);
	return S.sv;
}
/** The team's price for its pacts: { hp, dmg, rate, boss, elite }. */
export function foeTeam(S) {
	const out = { hp: 0, dmg: 0, rate: 0, boss: 0, elite: 0 };
	for (const id of S.sv.pacts) { const p = S.X.V.PACT_BY[id]; for (const k in p.team) out[k] += p.team[k]; }
	return out;
}
/** What Survival does to a new enemy at t: { hp, dmg, rate, elite, xp } (the pacing, the night, the pacts). */
export function foeK(S, t) {
	const V = S.X.V, n = V.nightOf(t), tm = foeTeam(S), P = V.K.PACE;
	return { hp: n.hp * (1 + tm.hp) * P.hp, dmg: n.dmg * (1 + tm.dmg), rate: (1 + tm.rate) * P.rate, elite: tm.elite, xp: P.xp };
}
/** The run has stepped through the migration portal. */
export function migrated(S, t) { S.sv.land++; S.sv.log.lands++; S.sv.nextMig = t + S.X.V.K.MIGRATE_EVERY; S.sv.portalUntil = 0; S.sv.px = NaN; }

function spawnMile(S, m, t) {
	const V = S.X.V, K = V.K, w = S.w, s = w.pl.s, rng = makeRng(mix(S.seed, m.n, 0xB055)), a = rng() * 6.2832;
	const pt = spot(S, rng, a, true, [10, 4]) || [s.x + Math.cos(a) * 12, s.z + Math.sin(a) * 12];
	const zone = Math.min(3, V.phaseOf(t) + 1), team = foeTeam(S), night = V.nightOf(t);
	const target = m.mewtwo ? K.MEWTWO_TARGET : m.legend ? K.LEGEND_TARGET : K.MILE_TARGET[zone - 1];
	const e = makeBoss(S, { dex: m.dex, legend: m.legend, zone, x: pt[0], z: pt[1], target, hpK: (1 + K.MILE_HP * m.n) * (1 + team.boss) * night.hp, dmgK: night.dmg }, t);
	e.xmile = m.n; e.xmew = m.mewtwo ? 1 : 0;
	escorts(S, pt[0], pt[1]);
	S.sv.bosses.push({ e, m, at: t });
	S.boss = e; S.exhSaid = false;
	say(S, m.mewtwo ? 'MEWTWO AWAKENS! Midnight has come' : m.legend ? `Legendary milestone: ${name(S, m.dex)}!` : `Milestone boss: ${name(S, m.dex)}!`, 3.6);
	return e;
}
function tickBosses(S, t) {
	const sv = S.sv, w = S.w;
	for (let i = sv.bosses.length - 1; i >= 0; i--) {
		const b = sv.bosses[i], e = b.e;
		if (e.dead) {
			sv.bosses.splice(i, 1);
			const rec = S.bosses.find((q) => q.dex === e.dex && q.down == null); if (rec) rec.down = Math.round((t - rec.at) * 10) / 10;
			sv.downs++; if (b.m.legend) sv.legends++; if (b.m.mewtwo) sv.mewtwo++;
			const g = groundAt(w.room, e.a.x, e.a.z), item = () => (S.lv ? dropItem(S) : 'leftovers');
			drop(w, 'item', e.a.x - 20 * U, g, e.a.z, item()); drop(w, 'heal', e.a.x + 20 * U, g, e.a.z, 0);
			if (b.m.legend) drop(w, 'item', e.a.x, g, e.a.z + 20 * U, item());
			for (const p of w.pickups) p.pulled = true;
			say(S, `${name(S, e.dex)} defeated! Choose a pact`, 3);
			if (S.boss === e) S.boss = null;
			continue;
		}
		const k = S.X.exhaustion(t - e.xborn, e.xtarget);
		e.takenK = k > 1 ? k : 0;
	}
	if (!S.boss && sv.bosses.length) S.boss = sv.bosses[sv.bosses.length - 1].e;
}
/** Seal a pact: its boon and its price from now on. */
export function takePact(S, id) {
	const sv = S.sv, p = S.X.V.PACT_BY[id]; if (!p || sv.pacts.includes(id)) return false;
	sv.pacts.push(id);
	if (S.syncPerks) S.syncPerks();
	say(S, `Pact sealed: ${S.X.V.en(p.name)}`, 2.6);
	return true;
}
function offerPact(S) {
	const sv = S.sv, V = S.X.V; sv.pactSeen++;
	const n = sv.pactSeen, ids = V.offerOf(S.seed, n, S.slot | 0, sv.pacts); if (!ids.length) return;
	S.pick = { kind: 'pact', title: 'A pact: a boon for a price', sub: `Milestone ${n} · choose 1 of ${ids.length}`, picks: 1, taken: [], ids: [], cancel: 'No pact',
		cards: ids.map((id) => ({ id, title: V.en(V.PACT_BY[id].name), tag: 'Pact', desc: V.en(V.PACT_BY[id].text) })), onTake: (i) => takePact(S, ids[i]), onClose: () => true };
	S.w.events.push({ k: 'pick', kind: 'pact' });
}
/** Every tick of a Survival run (after the fight's): its clock. */
export function tickSurv(S, dt, t) {
	const sv = S.sv, V = S.X.V, K = V.K, w = S.w, pl = w.pl, s = pl.s;
	// the phases
	const ph = V.phaseOf(t);
	if (ph !== sv.phase) {
		sv.phase = ph; S.zi = ph; S.pzs = t;
		const p = S.X.plan(S.seed, S.map, ph + 1, S.diff); p.events = []; S.plan = p;
		say(S, ph === 1 ? `Phase ${ph + 1}: the forest stirs` : `Phase ${ph + 1}: the worst of the forest`, 3.4);
	}
	if (!sv.said.wounds && t >= K.WOUNDS_AT) { sv.said.wounds = true; say(S, 'Deep wounds: healing gets harder every minute', 3.4); }
	if (!sv.said.night && t >= K.NIGHT_AT) { sv.said.night = true; say(S, 'Endless Night: stronger enemies every minute', 3.4); }
	// the segment's timeline
	const g = Math.floor(t / K.MILE_S);
	if (g !== sv.seg) { sv.seg = g; sv.segEv = V.segPlan(S.seed, S.map, g, S.diff); sv.segN = 0; }
	while (sv.segN < sv.segEv.length && t >= sv.segEv[sv.segN].at) fire(S, sv.segEv[sv.segN++]);
	// milestones
	while (t >= (sv.miles + 1) * K.MILE_S) { sv.miles++; spawnMile(S, V.milestone(sv.miles, S.map, S.seed), t); }
	tickBosses(S, t);
	// the migration portal (it waits while a milestone boss is up: the portal empties the land)
	if (S.ph === 2 && t >= sv.portalUntil) { S.ph = 0; S.portalT = 0; sv.nextMig = t + K.MIGRATE_EVERY - K.PORTAL_OPEN; say(S, 'The migration portal closes', 2.4); }
	else if (S.ph !== 2 && t >= sv.nextMig && !sv.bosses.length) { S.ph = 2; S.portalT = 0; sv.portalUntil = t + K.PORTAL_OPEN; say(S, 'A migration portal opens! Step in to travel to new lands', 3.6); }
	if (pl.dead) return;
	// hostile ground (your feet must be on it: a jump clears it)
	if (!(sv.px === sv.px)) { sv.px = s.x; sv.pz = s.z; }   // (a new land: you have only just arrived)
	const moved = Math.hypot(s.x - sv.px, s.z - sv.pz), hz = (s.grounded || s.sliding) && moved < 4 ? hazardAt(S, s.x, s.y, s.z, t) : null;
	sv.haz = hz ? hz.kind : null;
	if (hz) {
		const to = (x, z) => { if (Math.abs(groundAt(w.room, x, z) - s.y) <= SK.STEP) { s.x = x; s.z = z; s.y = groundAt(w.room, x, z); } };
		if (hz.kind === 'mud' || hz.kind === 'quicksand') {   // this tick's step is worth less; quicksand also draws you to its middle
			const k = hz.kind === 'mud' ? K.MUD : K.QUICK;
			to(sv.px + (s.x - sv.px) * k, sv.pz + (s.z - sv.pz) * k);
			if (hz.kind === 'quicksand') { const d = Math.hypot(hz.x - s.x, hz.z - s.z); if (d > 4 * U) to(s.x + (hz.x - s.x) / d * K.QUICK_PULL * U * dt, s.z + (hz.z - s.z) / d * K.QUICK_PULL * U * dt); }
		} else {
			const rate = hz.kind === 'burning' ? K.BURN : moved > 0.4 * U ? K.BRAMBLE : 0;
			if (rate > 0 && pl.invuln <= 0) { const d = pl.maxHp * rate * dt; pl.hp = Math.max(1, pl.hp - d); sv.hazDmg += d; }   // (it bites; it never finishes you)
		}
	}
	sv.px = s.x; sv.pz = s.z;
	// deep wounds: what this tick healed is worth less (a max-HP gain is left alone)
	const wk = V.woundK(t);
	if (wk < 1 && sv.lastHp > 0 && pl.hp > sv.lastHp && pl.maxHp === sv.lastMax) pl.hp = sv.lastHp + (pl.hp - sv.lastHp) * wk;
	sv.lastHp = pl.hp; sv.lastMax = pl.maxHp;
	// the siege: stay in one place and they come for you
	const sg = sv.siege, was = sg.on;
	if (t < K.SIEGE_FROM || Math.hypot(s.x - sg.ax, s.z - sg.az) > K.SIEGE_R) { sg.ax = s.x; sg.az = s.z; sg.t = 0; sg.on = false; if (was) say(S, 'The siege lifts', 1.8); }
	else { sg.t += dt; if (!sg.on && sg.t >= K.SIEGE_T) { sg.on = true; sg.cd = 1; sv.log.sieges++; say(S, 'Siege! Keep moving or they will hunt you', 2.8); } }
	sg.k = sg.on ? Math.max(K.SIEGE_MIN, sg.k - K.SIEGE_FALL * dt) : Math.min(1, sg.k + K.SIEGE_RISE * dt);
	if (sg.on && (sg.cd -= dt) <= 0) {
		sg.cd = K.SIEGE_FLOCK;
		const rng = makeRng(mix(S.seed, Math.floor(t * 10), 0x5146)), pool = S.X.MAPS[S.map].flock[S.zi], dex = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))], a0 = rng() * 6.2832;
		for (let i = 0; i < K.SIEGE_N; i++) {
			const a = a0 + (rng() - 0.5) * 0.9, d = CK.SPAWN_MIN * 0.9 + rng() * 4, x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d;
			const e = spawn(S, dex, x, z, { spd: 1.25 });
			if (!e.fly) { e.fly = true; e.a.fly = true; e.a.grounded = false; e.a.hover = CK.FLY_HOVER; e.a.y = groundAt(w.room, x, z) + CK.FLY_HOVER; }
			e.xsiege = 1;
		}
		sv.log.flocks++; say(S, 'A flock hunts you!', 2.2);
	}
	// a pact for each milestone boss down
	if (sv.downs > sv.pactSeen && !S.pick && !(S.cap && S.cap.cine)) offerPact(S);
}
/** The readout's line: Survival, the phase, the next milestone, the portal, the night or the wounds, the money. */
export function survHud(S) {
	const sv = S.sv, V = S.X.V, t = S.w.t, parts = ['SURVIVAL', `PHASE ${V.phaseOf(t) + 1}`];
	if (S.diff !== 'normal') parts.push(S.diff.toUpperCase());
	const m = V.milestone(sv.miles + 1, S.map, S.seed), left = mmss(m.at - t);
	parts.push(m.mewtwo ? `MEWTWO IN ${left}` : m.legend ? `LEGENDARY IN ${left}` : `BOSS IN ${left}`);
	if (S.ph === 2) parts.push(`PORTAL ${Math.max(0, Math.ceil(sv.portalUntil - t))} s`);
	const n = V.nightOf(t), wk = V.woundK(t);
	if (n.hp > 1) parts.push('NIGHT ×' + n.hp.toFixed(1)); else if (wk < 1) parts.push(`WOUNDS −${Math.round((1 - wk) * 100)}%`);
	if (sv.siege.on || sv.siege.k < 1) parts.push(`SIEGE · DAMAGE ${Math.round(sv.siege.k * 100)}%`);
	if (sv.haz) parts.push({ mud: 'MUD', brambles: 'BRAMBLES', quicksand: 'QUICKSAND', burning: 'BURNING GROUND' }[sv.haz]);
	if (S.boss && S.boss.takenK > 1) parts.push('EXHAUSTED ×' + S.boss.takenK.toFixed(1));
	if (S.eco) parts.push('₽ ' + S.coins);
	return parts.join(' · ');
}
/** The end of a Survival run: its parts, the 2D game's score, and the end screen's lines. */
export function survResult(S) {
	const sv = S.sv, V = S.X.V, w = S.w, t = Math.floor(w.t);
	const parts = { kills: w.stats.kills, time: t, dmg: Math.floor(w.stats.dealt), bosses: sv.downs, legends: sv.legends, catches: S.cap ? S.cap.n : 0, zone: Math.min(3, V.phaseOf(t) + 1), won: false };
	const lines = [`Survived ${mmss(t)} · phase ${V.phaseOf(t) + 1}`];
	if (sv.downs) lines.push(`Milestone bosses: ${sv.downs} (${sv.legends} legendary)`);
	if (sv.mewtwo) lines.push('Mewtwo defeated!');
	if (sv.pacts.length) lines.push('Pacts: ' + sv.pacts.map((id) => V.en(V.PACT_BY[id].name)).join(', '));
	if (sv.land > 1) lines.push(`Lands visited: ${sv.land}`);
	return { won: false, survival: true, title: 'SURVIVAL', line: lines[0], lines, parts, score: V.scoreOf(parts, S.diff), pay: payOf(S, { ...parts, surv: true }), medal: '', splits: [], bosses: S.bosses.map((b) => ({ ...b })) };
}
