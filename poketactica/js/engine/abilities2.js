// abilities2.js — abilities the Poketactica battle had no rule for (RULES_REV 7; found by the abilities sweep,
// tools/poketactica/sweep_abilities.mjs: 209 of 318 changed nothing). The overworld game's battle has a handler for
// nearly every ability, but in its own battle code; these are the same rules, written for the grid. Pure tables and
// small functions; battle.js calls them where each applies.

/** Speed doubles in the holder's weather (the grid reads Speed as accuracy / evasion); Quick Feet: 1.5× with a status. */
const WEATHER_SPEED = { swiftswim: 'rain', chlorophyll: 'sun', sandrush: 'sand', slushrush: 'hail' };
export const speedMult = (u, weather) => (WEATHER_SPEED[u.ability] && WEATHER_SPEED[u.ability] === weather ? 2 : u.ability === 'quickfeet' && u.status ? 1.5 : 1);
/** The attacker's stat: Huge Power / Pure Power double physical Attack. */
export const atkMult = (u, phys) => (phys && (u.ability === 'hugepower' || u.ability === 'purepower') ? 2 : 1);
/** The defender's stat: Marvel Scale (Defense 1.5× with a status). */
export const defMult = (v, phys) => (phys && v.ability === 'marvelscale' && v.status ? 1.5 : 1);
export const blocksCrit = (v) => v.ability === 'shellarmor' || v.ability === 'battlearmor';
/** Merciless: always a critical hit on a poisoned target. */
export const alwaysCrit = (u, v) => u.ability === 'merciless' && (v.status === 'psn' || v.status === 'tox');
export const noRecoil = (u) => u.ability === 'rockhead' || u.ability === 'magicguard';
/** Magic Guard: only attacks hurt it (not burns, poison, Leech Seed, lava, recoil ...); what it chooses to pay still costs. */
const DIRECT = new Set(['confusion', 'cost', 'memento', 'finalgambit']);
export const shrugsOff = (v, why) => v.ability === 'magicguard' && !DIRECT.has(why);

/**
 * A stat change arriving on v (by: who caused it, if anyone). -> the changes to apply ({} = all blocked), and what the
 * holder does about a foe lowering it: { changes, after? }
 */
const BLOCK_ALL = new Set(['clearbody', 'whitesmoke', 'fullmetalbody']);
const BLOCK_ONE = { hypercutter: 'atk', bigpecks: 'def', keeneye: 'acc' };
export function statChange(v, changes, by) {
	const foe = !!by && by.side !== v.side, ab = v.ability;
	let ch = { ...changes };
	if (ab === 'contrary') ch = Object.fromEntries(Object.entries(ch).map(([k, d]) => [k, -d]));
	if (ab === 'simple') ch = Object.fromEntries(Object.entries(ch).map(([k, d]) => [k, d * 2]));
	let dropped = false;
	if (foe) {
		for (const [k, d] of Object.entries(ch)) {
			if (d >= 0) continue;
			if (BLOCK_ALL.has(ab) || BLOCK_ONE[ab] === k) delete ch[k]; else dropped = true;
		}
	}
	const after = dropped && ab === 'defiant' ? { atk: 2 } : dropped && ab === 'competitive' ? { spa: 2 } : null;
	return { changes: ch, after, blocked: Object.keys(ch).length < Object.keys(changes).length };
}
/** Who an entry drop (Intimidate ...) does not reach. */
export const shrugsIntimidate = (v) => ['innerfocus', 'oblivious', 'owntempo', 'scrappy'].includes(v.ability);

/** Struck and still standing: what the holder's ability does. info = { phys, type, crit, before (its HP before the hit) } -> stat changes, or null */
export function whenStruck(v, info) {
	const ab = v.ability, t = info.type;
	if (ab === 'angerpoint' && info.crit) return { atk: 12 };
	if (ab === 'weakarmor' && info.phys) return { def: -1, spe: 2 };
	if (ab === 'stamina') return { def: 1 };
	if (ab === 'justified' && t === 'Dark') return { atk: 1 };
	if (ab === 'rattled' && (t === 'Bug' || t === 'Ghost' || t === 'Dark')) return { spe: 1 };
	if (ab === 'watercompaction' && t === 'Water') return { def: 2 };
	if (ab === 'steamengine' && (t === 'Fire' || t === 'Water')) return { spe: 6 };
	const crossed = info.before > v.maxHP / 2 && v.hp <= v.maxHP / 2;
	if (ab === 'berserk' && crossed) return { spa: 1 };
	if (ab === 'angershell' && crossed) return { atk: 1, spa: 1, spe: 1, def: -1, spd: -1 };
	return null;
}
/** A contact hit landed on a holder that is still standing: what the ATTACKER gets. -> { stats? } or null */
export const touched = (v) => (v.ability === 'gooey' || v.ability === 'tanglinghair' ? { stats: { spe: -1 } } : null);
/** Poison Touch: the attacker's own contact hits poison 3 times in 10. */
export const poisonsOnTouch = (u) => u.ability === 'poisontouch';
/** It knocked a foe out. -> stat changes, or null */
export function afterKo(u) {
	const ab = u.ability;
	if (ab === 'moxie' || ab === 'chillingneigh' || ab === 'asone') return { atk: 1 };
	if (ab === 'grimneigh') return { spa: 1 };
	if (ab === 'beastboost') { const best = ['atk', 'def', 'spa', 'spd', 'spe'].reduce((a, k) => (u.stats[k] > u.stats[a] ? k : a), 'atk'); return { [best]: 1 }; }
	return null;
}

/**
 * The end of the holder's side's phase. h = { boost(v, changes), heal(v, n), cure(v), ev, allies(v): the allies beside it }
 * -> true if a poison's bite is to be skipped (Poison Heal mends instead)
 */
export const PHASE_ABILITIES = new Set(['speedboost', 'moody', 'shedskin', 'hydration', 'healer', 'icebody', 'raindish', 'regenerator', 'poisonheal']);
export function phaseEnd(u, weather, rng, h) {
	const ab = u.ability;
	if (ab === 'speedboost') h.boost(u, { spe: 1 });
	else if (ab === 'moody') {
		const ks = ['atk', 'def', 'spa', 'spd', 'spe'], up = ks[Math.floor(rng() * ks.length)], rest = ks.filter((k) => k !== up), down = rest[Math.floor(rng() * rest.length)];
		h.boost(u, { [up]: 2, [down]: -1 });
	} else if (ab === 'shedskin') { if (u.status && rng() < 1 / 3) { h.ev({ t: 'ability', uid: u.uid, ab }); h.cure(u); } }
	else if (ab === 'hydration') { if (u.status && weather === 'rain') { h.ev({ t: 'ability', uid: u.uid, ab }); h.cure(u); } }
	else if (ab === 'healer') { for (const a of h.allies(u)) if (a.status && rng() < 0.3) { h.ev({ t: 'ability', uid: u.uid, ab }); h.cure(a); } }
	else if ((ab === 'icebody' && weather === 'hail') || (ab === 'raindish' && weather === 'rain')) { if (u.hp < u.maxHP) h.heal(u, Math.max(1, Math.floor(u.maxHP / 16))); }
	// (Regenerator mends a third on leaving the field; nobody leaves a board, so it mends a little every turn instead)
	else if (ab === 'regenerator') { if (u.hp < u.maxHP) h.heal(u, Math.max(1, Math.floor(u.maxHP / 16))); }
	else if (ab === 'poisonheal' && (u.status === 'psn' || u.status === 'tox')) { if (u.hp < u.maxHP) h.heal(u, Math.max(1, Math.floor(u.maxHP / 8))); return true; }
	return false;
}
