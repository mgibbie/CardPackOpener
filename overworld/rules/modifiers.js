// rules/modifiers.js — accuracy, the damage modifier stack, critical hits and one hit's damage, as PURE functions of a
// plain context (Poketactica stage 1, owner 2026-11-20). Transcribed line for line from battle.js's useMove, in the
// SAME ORDER (floating-point products are order-sensitive: the parity test, rules_parity_test.mjs, holds them to it).
// battle.js builds the context from the live battle and calls these; Poketactica builds it from the grid.
import { NEVER_MISS, PUNCH_MOVES, BITE_MOVES, PULSE_MOVES, SOUND_MOVES, SLICING_MOVES, AB_TYPE_BOOST, HIGH_CRIT, ALWAYS_CRIT, stageMult } from './tables.js';

/**
 * Accuracy. c = { moveId, acc, category, type, userTypes, accStage, evaStage, gravity, userAb, targetAb, weather,
 *   targetConfused, userAccBoost, targetEvade }  ->  { neverMiss, hitChance }  (a roll of rng()*100 > hitChance misses)
 */
export function accuracyOf(c) {
	const neverMiss = (c.acc ?? 100) === true || NEVER_MISS.has(c.moveId) || (c.moveId === 'toxic' && (c.userTypes || []).includes('Poison'));
	let hitChance = (c.acc ?? 100) * stageMult((c.accStage || 0) - (c.evaStage || 0));
	if (c.gravity > 0) hitChance *= 5 / 3;
	const uAb = c.userAb, tAb = c.targetAb;
	if (uAb === 'compoundeyes') hitChance *= 1.3;
	if (uAb === 'victorystar') hitChance *= 1.1;
	if (uAb === 'hustle' && c.category === 'Physical') hitChance *= 0.8;
	if (tAb === 'sandveil' && c.weather === 'sand') hitChance *= 0.8;
	if (tAb === 'snowcloak' && c.weather === 'hail') hitChance *= 0.8;
	if (tAb === 'tangledfeet' && c.targetConfused) hitChance *= 0.5;
	if (tAb === 'wonderskin' && c.category === 'Status' && !neverMiss) hitChance = Math.min(hitChance, 50);
	if (c.userAccBoost) hitChance *= c.userAccBoost;
	if (c.targetEvade) hitChance *= c.targetEvade;
	if (c.moveId === 'thunder' || c.moveId === 'hurricane') {
		if (c.weather === 'rain') hitChance = 999;
		else if (c.weather === 'sun') hitChance = Math.min(hitChance, 50);
	}
	if (c.moveId === 'blizzard' && c.weather === 'hail') hitChance = 999;
	if (uAb === 'noguard' || tAb === 'noguard') hitChance = 999;
	if (uAb === 'sunbeam' && (c.type === 'Fire' || c.type === 'Grass')) hitChance = 999;   // custom (owner 2026-11-20)
	return { neverMiss, hitChance };
}

/**
 * The damage modifier stack (weather, terrain, sports, abilities on both sides, items, spread, auras, ruin, allies).
 * c = { moveId, type, category, priority, atePower, energized, Pw, phys, fx, eff, spread,
 *   user: { ab, types, curHP, maxHP, status, gender, chargedUp, flashFired, slowStartT, helpingHand },
 *   target: { ab, curHP, maxHP, gender, movedThisTurn, justSwitchedIn }, uItem,
 *   weatherRaw, weather, terrain, mudSport, waterSport, fallen, fieldAbs, otherAbs, double, allyAb, targetAllyFriendGuard }
 * -> { mult, usedCharge }  (usedCharge: Charge's doubled Electric hit was spent)
 */
export function damageMods(c) {
	const u = c.user, t = c.target, uAb = u.ab, tAb = t.ab, phys = c.phys, fx = c.fx || {}, eff = c.eff, uItem = c.uItem;
	let envMult = 1, usedCharge = false;
	const wk = c.weatherRaw;
	if (wk === 'rain') envMult *= c.type === 'Water' ? 1.5 : c.type === 'Fire' ? 0.5 : 1;
	if (wk === 'sun') envMult *= c.type === 'Fire' ? 1.5 : c.type === 'Water' ? 0.5 : 1;
	const tk = c.terrain;
	if (tk === 'electric' && c.type === 'Electric') envMult *= 1.3;
	if (tk === 'grassy' && c.type === 'Grass') envMult *= 1.3;
	if (tk === 'psychic' && c.type === 'Psychic') envMult *= 1.3;
	if (tk === 'misty' && c.type === 'Dragon') envMult *= 0.5;
	if (c.mudSport > 0 && c.type === 'Electric') envMult *= 0.5;
	if (c.waterSport > 0 && c.type === 'Fire') envMult *= 0.5;
	if (u.chargedUp && c.type === 'Electric') { envMult *= 2; usedCharge = true; }
	// ability multipliers on the element and power
	const pinch = { overgrow: 'Grass', blaze: 'Fire', torrent: 'Water', swarm: 'Bug' };
	if (pinch[uAb] === c.type && u.curHP <= Math.floor(u.maxHP / 3)) envMult *= 1.5;
	if (uAb === 'technician' && c.Pw <= 60) envMult *= 1.5;
	if (u.flashFired && c.type === 'Fire') envMult *= 1.5;
	if (AB_TYPE_BOOST[uAb] === c.type) envMult *= 1.5;
	if (c.atePower) envMult *= 1.2;
	if (uAb === 'ironfist' && PUNCH_MOVES.has(c.moveId)) envMult *= 1.2;
	if (uAb === 'strongjaw' && BITE_MOVES.has(c.moveId)) envMult *= 1.5;
	if (uAb === 'megalauncher' && PULSE_MOVES.has(c.moveId)) envMult *= 1.5;
	if (uAb === 'reckless' && fx.recoil) envMult *= 1.2;
	if (uAb === 'sheerforce' && fx.sec) envMult *= 1.3;
	if (uAb === 'toughclaws' && phys) envMult *= 1.3;
	if (uAb === 'punkrock' && SOUND_MOVES.has(c.moveId)) envMult *= 1.3;
	if (uAb === 'sandforce' && c.weather === 'sand' && ['Rock', 'Ground', 'Steel'].includes(c.type)) envMult *= 1.3;
	if (uAb === 'solarpower' && !phys && c.weather === 'sun') envMult *= 1.5;
	if (uAb === 'flareboost' && !phys && u.status === 'brn') envMult *= 1.5;
	if (uAb === 'toxicboost' && phys && u.status === 'psn') envMult *= 1.5;
	if (uAb === 'defeatist' && u.curHP <= u.maxHP / 2) envMult *= 0.5;
	if (uAb === 'waterbubble' && c.type === 'Water') envMult *= 2;
	if (uAb === 'rivalry' && u.gender && t.gender) envMult *= u.gender === t.gender ? 1.25 : 0.75;
	if (u.slowStartT > 0 && phys) envMult *= 0.5;
	// defender-side reducers
	if (tAb === 'thickfat' && (c.type === 'Fire' || c.type === 'Ice')) envMult *= 0.5;
	if (tAb === 'dryskin' && c.type === 'Fire') envMult *= 1.25;
	if (tAb === 'heatproof' && c.type === 'Fire') envMult *= 0.5;
	if (tAb === 'waterbubble' && c.type === 'Fire') envMult *= 0.5;
	if (tAb === 'furcoat' && phys) envMult *= 0.5;
	if (tAb === 'icescales' && !phys) envMult *= 0.5;
	if (tAb === 'fluffy') envMult *= (phys ? 0.5 : 1) * (c.type === 'Fire' ? 2 : 1);
	if (tAb === 'punkrock' && SOUND_MOVES.has(c.moveId)) envMult *= 0.5;
	if ((tAb === 'multiscale' || tAb === 'shadowshield') && t.curHP === t.maxHP) envMult *= 0.5;
	if (['filter', 'solidrock', 'prismarmor'].includes(tAb) && eff > 1) envMult *= 0.75;
	if (uAb === 'tintedlens' && eff < 1) envMult *= 2;
	if (uAb === 'adaptability' && (u.types || []).includes(c.type)) envMult *= 4 / 3; // stab 1.5 -> 2
	// held items scale damage
	if (uItem?.typeBoost === c.type) envMult *= 1.2;
	if (uItem?.choice === 'atk' && phys) envMult *= 1.5;
	if (uItem?.choice === 'spa' && !phys) envMult *= 1.5;
	if (uItem?.lifeOrb) envMult *= 1.3;
	if (uItem?.expertBelt && eff > 1) envMult *= 1.2;
	if (uItem?.catBoost === c.category) envMult *= 1.1;
	// a spread move hitting more than one target is weaker per target
	if (c.spread) envMult *= 0.75;
	if (u.helpingHand) envMult *= 1.5;
	if ((uAb === 'analytic' || uAb === 'analyze') && t.movedThisTurn) envMult *= 1.3;
	// the custom (Radical Ransei) power abilities
	if (uAb === 'acceleration' && (c.priority || 0) > 0) envMult *= 1.5;
	if (uAb === 'elementalist' && ['Fire', 'Water', 'Electric'].includes(c.type) && !(u.types || []).includes(c.type)) envMult *= 1.5;
	if (uAb === 'soundboost' && SOUND_MOVES.has(c.moveId)) envMult *= 1.3;
	if (c.energized) envMult *= 1.3;
	if (uAb === 'sharpness' && SLICING_MOVES.has(c.moveId)) envMult *= 1.5;
	if (uAb === 'stakeout' && t.justSwitchedIn) envMult *= 2;
	if (uAb === 'neuroforce' && eff > 1) envMult *= 1.25;
	if (uAb === 'steelyspirit' && c.type === 'Steel') envMult *= 1.5;
	if (uAb === 'supremeoverlord') envMult *= 1 + 0.1 * Math.min(5, c.fallen || 0);
	// AURAS are field-wide, AURA BREAK inverts them
	const auras = c.fieldAbs || [];
	if ((c.type === 'Fairy' && auras.includes('fairyaura')) || (c.type === 'Dark' && auras.includes('darkaura'))) {
		envMult *= auras.includes('aurabreak') ? 0.75 : 4 / 3;
	}
	// the RUIN quartet each weaken one stat for everyone else on the field
	const ruin = c.otherAbs || [];
	if (phys && ruin.includes('tabletsofruin')) envMult *= 0.75;
	if (!phys && ruin.includes('vesselofruin')) envMult *= 0.75;
	if (phys && uAb !== 'swordofruin' && auras.includes('swordofruin')) envMult *= 1.25;
	if (!phys && uAb !== 'beadsofruin' && auras.includes('beadsofruin')) envMult *= 1.25;
	if (uAb === 'gorillatactics' && phys) envMult *= 1.5;
	// doubles support: an ally's BATTERY / POWER SPOT amplifies, the target's ally's FRIEND GUARD softens
	if (c.double) {
		if (c.allyAb === 'battery' && !phys) envMult *= 1.3;
		if (c.allyAb === 'powerspot') envMult *= 1.3;
	}
	if (c.double && c.targetAllyFriendGuard) envMult *= 0.75;
	return { mult: envMult, usedCharge };
}

/** Critical-hit odds. c = { blocked, laserFocus, focusEnergy, userAb, targetStatus, moveId, critBoostItem } -> 0..1 */
export function critChanceOf(c) {
	let critChance = c.blocked ? 0 : c.laserFocus ? 1 : c.focusEnergy ? 0.25 : 1 / 16;
	if (!c.blocked && c.userAb === 'merciless' && (c.targetStatus === 'psn' || c.targetStatus === 'tox')) critChance = 1;
	else if (!c.blocked && ALWAYS_CRIT.has(c.moveId)) critChance = 1;
	else if (!c.blocked && HIGH_CRIT.has(c.moveId)) critChance = Math.max(critChance, 1 / 8);
	if (!c.blocked && c.userAb === 'superluck') critChance = Math.max(critChance, 1 / 8);
	if (!c.blocked && c.critBoostItem) critChance = Math.max(critChance, 1 / 8);
	return critChance;
}

/** A critical hit's multiplier: 2x (Sniper 2.5x). */
export const critMultOf = (userAb) => (userAb === 'sniper' ? 2.5 : 2);

/** One hit's damage from the base damage, in battle.js's exact product order. h = { crit, critMult, stab, eff, screened, envMult, partial, roll } */
export function hitDamage(base, h) {
	return Math.max(1, Math.floor(base * (h.crit ? h.critMult : 1) * h.stab * h.eff * h.screened * h.envMult * (h.partial ?? 1) * h.roll));
}
