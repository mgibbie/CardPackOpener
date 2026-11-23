// abilities3.js — the second batch of abilities the Poketactica battle had no rule for (RULES_REV 8; the abilities sweep,
// tools/poketactica/sweep_abilities.mjs). As abilities2.js: pure tables and small functions that battle.js and
// abilities.js call where each applies. Several only hand the shared Pokémon rules (overworld/rules/modifiers.js) the
// context they already knew how to read (the auras, the Ruin four, Battery, Supreme Overlord, Tangled Feet).
import { AB_ATE, SOUND_MOVES, POWDER_MOVES } from '../../../overworld/rules/tables.js';
import { manhattan } from './grid.js';

/** How far an aura reaches on the grid (Fairy Aura, Dark Aura, Aura Break, the Ruin four): in Pokémon they fill the field. */
export const AURA_REACH = 3;
const live = (S) => S.units.filter((x) => x.hp > 0 && x.x != null);
const beside = (S, u, pred) => live(S).some((a) => a !== u && a.side === u.side && manhattan(a.x, a.y, u.x, u.y) === 1 && pred(a));

/** Mold Breaker, Teravolt, Turboblaze: its moves ignore the target's ability. */
const MOLD = new Set(['moldbreaker', 'teravolt', 'turboblaze']);
export const breaksMold = (u) => MOLD.has(u.ability);

/** The type a move really has in this user's hands. -> { type, ate (x1.2) } or null */
export function moveType(u, m) {
	const ab = u.ability;
	if (AB_ATE[ab] && m.type === 'Normal') return { type: AB_ATE[ab], ate: true };
	if (ab === 'normalize' && m.type !== 'Normal') return { type: 'Normal', ate: true };
	if (ab === 'liquidvoice' && SOUND_MOVES.has(m.id) && m.type !== 'Water') return { type: 'Water', ate: false };
	return null;
}
/** Protean / Libero: the user becomes the type of the move it uses. */
export const takesMoveType = (u) => u.ability === 'protean' || u.ability === 'libero';

/** Air Lock / Cloud Nine on the board: the weather does nothing. */
export const calm = (S) => S.units.some((x) => x.hp > 0 && x.x != null && (x.ability === 'airlock' || x.ability === 'cloudnine'));

/** What the shared damage rules read of the field around an attack (u strikes v). */
const AURAS = new Set(['fairyaura', 'darkaura', 'aurabreak']);
export function fieldCtx(S, u, v, phys) {
	const all = live(S);
	const nearU = all.filter((x) => manhattan(x.x, x.y, u.x, u.y) <= AURA_REACH);
	const nearV = all.filter((x) => x !== v && manhattan(x.x, x.y, v.x, v.y) <= AURA_REACH);
	const fieldAbs = [...nearU.map((x) => x.ability).filter((a) => AURAS.has(a)), ...nearV.map((x) => x.ability).filter((a) => a === 'swordofruin' || a === 'beadsofruin')];
	const otherAbs = nearU.filter((x) => x !== u).map((x) => x.ability).filter((a) => a === 'tabletsofruin' || a === 'vesselofruin');
	const helper = all.find((x) => x !== u && x.side === u.side && manhattan(x.x, x.y, u.x, u.y) === 1 && (x.ability === 'powerspot' || (x.ability === 'battery' && !phys)));
	const fallen = S.units.filter((x) => x !== u && x.side === u.side && x.hp <= 0).length;
	return { fieldAbs, otherAbs, fallen, double: !!helper, allyAb: helper ? helper.ability : null };
}

/** Protosynthesis (in sun) / Quark Drive (on Electric Terrain): its best stat rises. -> that stat's key, or null */
function paradox(u, weather, terrain) {
	if (!((u.ability === 'protosynthesis' && weather === 'sun') || (u.ability === 'quarkdrive' && terrain === 'electric'))) return null;
	return ['atk', 'def', 'spa', 'spd', 'spe'].reduce((a, k) => (u.stats[k] > u.stats[a] ? k : a), 'atk');
}
/** The attacker's stat: Plus / Minus beside each other, Flower Gift in sun (it and the allies beside it), Protosynthesis / Quark Drive. */
export function atkMult(S, u, phys, weather, terrain) {
	let m = 1;
	const ab = u.ability, pm = (a) => a.ability === 'plus' || a.ability === 'minus';
	if (!phys && pm(u) && beside(S, u, pm)) m *= 1.5;
	if (phys && weather === 'sun' && (ab === 'flowergift' || beside(S, u, (a) => a.ability === 'flowergift'))) m *= 1.5;
	if (paradox(u, weather, terrain) === (phys ? 'atk' : 'spa')) m *= 1.3;
	return m;
}
/** The defender's stat: Flower Gift in sun (Sp. Def), Protosynthesis / Quark Drive. */
export function defMult(S, v, phys, weather, terrain) {
	let m = 1;
	if (!phys && weather === 'sun' && (v.ability === 'flowergift' || beside(S, v, (a) => a.ability === 'flowergift'))) m *= 1.5;
	if (paradox(v, weather, terrain) === (phys ? 'def' : 'spd')) m *= 1.3;
	return m;
}
/** Speed (accuracy / evasion on the grid): Surge Surfer on Electric Terrain, Unburden once its item is used up, Protosynthesis / Quark Drive. */
export function speedMult(u, weather, terrain) {
	if (u.ability === 'surgesurfer' && terrain === 'electric') return 2;
	if (u.ability === 'unburden' && u.heldUsed) return 2;
	return paradox(u, weather, terrain) === 'spe' ? 1.5 : 1;
}

/**
 * A move its target (or the target's neighbour) will not take. mold: the user ignores the target's own ability.
 * -> { ab, uid } (whose ability refused it) or null
 */
const MAJESTY = new Set(['queenlymajesty', 'dazzling', 'armortail']);
export function refuses(S, u, v, m, mold) {
	if (v === u) return null;
	const ally = v.side === u.side, status = m.category === 'Status', own = mold ? null : v.ability;
	if (ally && !status && own === 'telepathy') return { ab: own, uid: v.uid };
	if (!ally && (m.priority || 0) > 0) {
		if (MAJESTY.has(own)) return { ab: own, uid: v.uid };
		const q = live(S).find((a) => a !== v && a.side === v.side && MAJESTY.has(a.ability) && manhattan(a.x, a.y, v.x, v.y) === 1);
		if (q) return { ab: q.ability, uid: q.uid };
	}
	if (status && own === 'goodasgold') return { ab: own, uid: v.uid };
	if (status && own === 'overcoat' && POWDER_MOVES.has(m.id)) return { ab: own, uid: v.uid };
	return null;
}
/** Magic Bounce: a foe's status move comes back at the one who used it. */
export const bounces = (u, v, m, mold) => !mold && v.ability === 'magicbounce' && v.side !== u.side && m.category === 'Status' && m.s !== 'self';

/** Disguise (any hit) / Ice Face (a physical one): the first is taken by the costume. -> the damage it takes instead, or null */
export function costume(v, info) {
	if (v.busted || info.mold) return null;
	if (v.ability === 'disguise') return Math.max(1, Math.floor(v.maxHP / 8));
	if (v.ability === 'iceface' && info.phys) return 0;
	return null;
}
/** Struck and still standing (beyond abilities2's stat changes). -> { retype?, slow?, weather?, paint? } or null */
export function whenStruck(v, info) {
	const ab = v.ability;
	if (ab === 'colorchange' && info.type && !(v.types.length === 1 && v.types[0] === info.type)) return { retype: [info.type] };
	if (ab === 'cottondown') return { slow: 2 };          // (everyone else within 2 tiles: Speed -1)
	if (ab === 'sandspit') return { weather: 'sand' };
	if (ab === 'seedsower') return { paint: 'grassy' };
	return null;
}
/** A contact hit landed on the holder: the attacker's ability becomes... -> { ability, swap? } or null */
const SPREADS = new Set(['mummy', 'lingeringaroma']);
const FIXED = new Set(['disguise', 'iceface', 'multitype', 'rkssystem', 'zenmode', 'stancechange', 'schooling', 'shieldsdown', 'battlebond', 'powerconstruct', 'comatose', 'wonderguard', 'mummy', 'lingeringaroma', 'wanderingspirit']);
export function rubsOff(u, v) {
	if (FIXED.has(u.ability)) return null;
	if (SPREADS.has(v.ability)) return { ability: v.ability };
	if (v.ability === 'wanderingspirit') return { ability: v.ability, swap: true };
	return null;
}

/** Berries: Unnerve near (a foe within 2 tiles) stops them; Ripen doubles what a healing one gives; Cheek Pouch mends a third on top. */
export const unnerved = (S, v) => live(S).some((f) => f.side !== v.side && f.ability === 'unnerve' && manhattan(f.x, f.y, v.x, v.y) <= 2);
export const berryMult = (v) => (v.ability === 'ripen' ? 2 : 1);
export const berryBonus = (v) => (v.ability === 'cheekpouch' ? Math.max(1, Math.floor(v.maxHP / 3)) : 0);

/** Synchronize: the burn, poison or paralysis a foe gave it goes back. */
export const sendsBack = (v, st) => v.ability === 'synchronize' && (st === 'brn' || st === 'psn' || st === 'tox' || st === 'par');
/** Early Bird: it sleeps half as long. */
export const sleepTurns = (v, n) => (v.ability === 'earlybird' ? Math.max(1, Math.floor(n / 2)) : n);

/**
 * The end of the holder's side's phase (as abilities2's phaseEnd; kept apart so an older recording never runs these).
 * h = { ev, cure(v), hurt(v, n, why), foesNear(v, n) }
 */
export const PHASE_ABILITIES = new Set(['naturalcure', 'baddreams', 'harvest']);
export function phaseEnd(u, weather, rng, h) {
	const ab = u.ability;
	// (Natural Cure heals on leaving the field; nobody leaves a board, so it has Shed Skin's chance each turn instead)
	if (ab === 'naturalcure') { if (u.status && rng() < 1 / 3) { h.ev({ t: 'ability', uid: u.uid, ab }); h.cure(u); } }
	else if (ab === 'baddreams') {
		const asleep = h.foesNear(u, 2).filter((f) => f.status === 'slp');
		if (asleep.length) h.ev({ t: 'ability', uid: u.uid, ab });
		for (const f of asleep) h.hurt(f, Math.max(1, Math.floor(f.maxHP / 8)), 'baddreams');
	} else if (ab === 'harvest') {
		const hd = u.held;
		if (u.heldUsed && hd && (hd.berryHeal || hd.berryHealFrac || hd.cure) && (weather === 'sun' || rng() < 0.5)) { u.heldUsed = false; h.ev({ t: 'ability', uid: u.uid, ab }); }
	}
}

/**
 * Landing on the board (beyond abilities.js's drops, weather and Surges).
 * h = { ev, boost(v, changes, by), heal(v, n) }; near(n, pred) -> the units within n tiles of it
 */
const NO_TRACE = new Set(['trace', 'disguise', 'iceface', 'multitype', 'rkssystem', 'zenmode', 'stancechange', 'schooling', 'shieldsdown', 'battlebond', 'powerconstruct', 'imposter', 'illusion', 'neutralizinggas', 'receiver', 'powerofalchemy']);
export function onEnter(S, u, h) {
	const ab = u.ability, near = (n, pred) => live(S).filter((x) => x !== u && manhattan(x.x, x.y, u.x, u.y) <= n && pred(x)).sort((a, b) => manhattan(a.x, a.y, u.x, u.y) - manhattan(b.x, b.y, u.x, u.y));
	const foe = (x) => x.side !== u.side, ally = (x) => x.side === u.side;
	const say = (extra) => h.ev({ t: 'ability', uid: u.uid, ab, ...extra });
	if (ab === 'intrepidsword') { say(); h.boost(u, { atk: 1 }); }
	else if (ab === 'dauntlessshield') { say(); h.boost(u, { def: 1 }); }
	else if (ab === 'download') { const f = near(99, foe)[0]; if (f) { say(); h.boost(u, f.stats.def < f.stats.spd ? { atk: 1 } : { spa: 1 }); } }
	else if (ab === 'trace') { const f = near(2, (x) => foe(x) && x.ability && !NO_TRACE.has(x.ability))[0]; if (f) { u.ability = f.ability; h.ev({ t: 'ability', uid: u.uid, ab: 'trace', ability: f.ability }); return true; } }
	else if (ab === 'screencleaner') { const had = live(S).filter((x) => x.fx && (x.fx.reflect || x.fx.lightscreen)); if (had.length) say(); for (const x of had) { delete x.fx.reflect; delete x.fx.lightscreen; } }
	else if (ab === 'curiousmedicine') { const al = near(1, ally).filter((x) => Object.values(x.boosts).some((b) => b)); if (al.length) say(); for (const x of al) for (const k of Object.keys(x.boosts)) x.boosts[k] = 0; }
	else if (ab === 'hospitality') { const al = near(1, (x) => ally(x) && x.hp < x.maxHP); if (al.length) say(); for (const x of al) h.heal(x, Math.max(1, Math.floor(x.maxHP / 4))); }
	else if (ab === 'costar') { const a = near(1, ally)[0]; if (a && Object.values(a.boosts).some((b) => b)) { say(); u.boosts = { ...a.boosts }; } }
	return false;
}
