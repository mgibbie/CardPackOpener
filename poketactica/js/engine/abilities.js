// abilities.js — abilities on the grid (stage 3d): the field ones get their area from poketactica/data/ability_shapes.json
// (owner, 2026-11-20: "field ones + self"); the user's own ones live in the shared Pokémon rules (overworld/rules/).
// Pure; battle.js calls these hooks.
//   on landing (deploy / battle start)  Intimidate-style stat drops in a burst, weather setters, the terrain Surges (paint)
//   always on, within n                 Pressure (+1 SP for foes), Friend Guard (allies take 3/4), Damp (no explosions),
//                                       Victory Star (allies' accuracy), the trapping abilities (a foe inside can move 1 tile)
//   pull                                Lightning Rod / Storm Drain draw a matching single-target move aimed within n
//   contact                             Static, Flame Body, Poison Point, Effect Spore, Rough Skin, Iron Barbs, ...
import { manhattan } from './grid.js';
import { shrugsIntimidate } from './abilities2.js';
import { onEnter as onEnter8 } from './abilities3.js';

const ENTER_DROPS = { intimidate: { atk: -1 }, petrify: { spe: -1 }, supersweetsyrup: { eva: -1 } };
const ENTER_WEATHER = { drought: 'sun', drizzle: 'rain', sandstream: 'sand', snowwarning: 'hail', stormbringer: 'rain', primordialsea: 'rain', desolateland: 'sun', orichalcumpulse: 'sun' };
const SURGE = { electricsurge: 'electric', grassysurge: 'grassy', psychicsurge: 'psychic', mistysurge: 'misty', hadronengine: 'electric' };
const TRAPS = { arenatrap: (v) => !v.types.includes('Flying') && v.ability !== 'levitate', shadowtag: () => true, magnetpull: (v) => v.types.includes('Steel') };
const PULL = { lightningrod: 'Electric', stormdrain: 'Water' };
const CONTACT_STATUS = { static: 'par', flamebody: 'brn', poisonpoint: 'psn', deepfreeze: 'frz' };
const CONTACT_CHIP = { roughskin: 8, ironbarbs: 8 };

const radius = (data, ab, dflt) => ((data.abilityShapes && data.abilityShapes[ab]) || {}).n || dflt;
const near = (S, u, n, pred) => S.units.filter((v) => v !== u && v.hp > 0 && v.x != null && u.x != null && manhattan(u.x, u.y, v.x, v.y) <= n && pred(v));

/** When a unit lands on the map. h = { ev, boost(v, changes), setWeather(kind), paint(tiles, kind) } */
export function onEnter(S, u, data, h) {
	if (S.rev >= 8) onEnter8(S, u, h);   // (Download, Intrepid Sword, Trace ...: abilities3.js; Trace then acts as what it copied)
	const ab = u.ability;
	if (ENTER_DROPS[ab]) {
		const foes = near(S, u, radius(data, ab, 2), (v) => v.side !== u.side);
		if (foes.length) h.ev({ t: 'ability', uid: u.uid, ab, targets: foes.map((v) => v.uid) });
		for (const v of foes) {
			if (S.rev >= 8 && ab === 'intimidate' && v.ability === 'guarddog') { h.ev({ t: 'ability', uid: v.uid, ab: v.ability }); h.boost(v, { atk: 1 }); continue; }   // (Guard Dog: it rises instead)
			if (S.rev >= 7 && ab === 'intimidate' && shrugsIntimidate(v)) continue; h.boost(v, ENTER_DROPS[ab], u);   // (rev 7: Inner Focus, Oblivious, Own Tempo, Scrappy)
		}
	}
	if (ENTER_WEATHER[ab]) { h.setWeather(ENTER_WEATHER[ab]); h.ev({ t: 'ability', uid: u.uid, ab, weather: ENTER_WEATHER[ab] }); }
	if (SURGE[ab]) {
		const n = radius(data, ab, 2), tiles = [];
		for (let y = u.y - n; y <= u.y + n; y++) for (let x = u.x - n; x <= u.x + n; x++) if (manhattan(u.x, u.y, x, y) <= n) tiles.push([x, y]);
		h.paint(tiles, SURGE[ab]);
		h.ev({ t: 'ability', uid: u.uid, ab, terrain: SURGE[ab] });
	}
}

/** Extra SP a unit pays for a move (Pressure from foes within reach). */
export const pressureExtra = (S, u, data) => (near(S, u, radius(data, 'pressure', 2), (v) => v.side !== u.side && v.ability === 'pressure').length ? 1 : 0);

/** The damage multiplier a defender gets from its allies (Friend Guard within 1). */
export const allyGuard = (S, v, data) => (near(S, v, radius(data, 'friendguard', 1), (a) => a.side === v.side && a.ability === 'friendguard').length ? 0.75 : 1);

/** Damp nearby: no self-KO moves. */
export const dampNear = (S, u, data) => S.units.some((d) => d.hp > 0 && d.x != null && d.ability === 'damp' && manhattan(d.x, d.y, u.x, u.y) <= radius(data, 'damp', 3));

/** Victory Star: allies within n (and the holder) hit more often (x1.1). */
export const accuracyAura = (S, u, data) => (S.units.some((a) => a.side === u.side && a.hp > 0 && a.x != null && a.ability === 'victorystar' && manhattan(a.x, a.y, u.x, u.y) <= radius(data, 'victorystar', 2)) ? 1.1 : 1);

/** The Move a unit really has: trapped by a foe's Arena Trap / Shadow Tag / Magnet Pull within reach -> 1 tile. */
export function trappedMove(S, u, data) {
	for (const t of S.units) {
		if (t.side === u.side || t.hp <= 0 || t.x == null || !TRAPS[t.ability] || u.x == null) continue;
		if (manhattan(t.x, t.y, u.x, u.y) <= radius(data, t.ability, 1) && TRAPS[t.ability](u)) return 1;
	}
	return null;
}

/** Lightning Rod / Storm Drain: a single-target move of its type aimed within reach goes to the holder instead. -> the holder or null */
export function pullTarget(S, u, m, x, y, data) {
	if (m.s !== 'one') return null;
	let best = null;
	for (const p of S.units) {
		if (p.hp <= 0 || p.x == null || p === u || PULL[p.ability] !== m.type) continue;
		const d = manhattan(p.x, p.y, x, y);
		if (d <= radius(data, p.ability, 3) && (!best || d < best.d)) best = { p, d };
	}
	return best && (best.p.x !== x || best.p.y !== y) ? best.p : null;
}

/** Contact abilities on the defender, after a contact hit. h = { setStatus(v, st), hurt(v, n, why), ev } */
export function onContact(S, attacker, defender, contact, rng, h) {
	if (!contact || attacker.hp <= 0) return;
	const ab = defender.ability;
	if (CONTACT_STATUS[ab] && rng() < 0.3) { h.ev({ t: 'ability', uid: defender.uid, ab }); h.setStatus(attacker, CONTACT_STATUS[ab]); }
	else if (ab === 'effectspore' && rng() < 0.3) { h.ev({ t: 'ability', uid: defender.uid, ab }); h.setStatus(attacker, ['psn', 'par', 'slp'][Math.floor(rng() * 3)]); }
	if (CONTACT_CHIP[ab]) { h.ev({ t: 'ability', uid: defender.uid, ab }); h.hurt(attacker, Math.max(1, Math.floor(attacker.maxHP / CONTACT_CHIP[ab])), ab); }
}
