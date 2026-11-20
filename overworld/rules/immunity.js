// rules/immunity.js — who a damaging move can't touch, and who a status can't stick to, as PURE functions of a plain
// context (Poketactica stage 1c, owner 2026-11-20). Transcribed from battle.js (useMove's immunity block, applyStatus)
// in the SAME ORDER: the first rule that applies wins, as it did there. They return WHY; battle.js still says it on
// screen (and applies the side effects: an absorber's heal / boost, Flash Fire's charge).
import { AB_ABSORB, BULLET_MOVES, POWDER_MOVES, SOUND_MOVES, effectiveness } from './tables.js';
import { STATUS_IMMUNE, STATUS_IMMUNE_AB } from './status.js';

/**
 * A damaging move against its target. c = { moveId, type, targetAb, userAb, targetTypes, fx, primal, weatherOn, foresight }
 * -> { block, absorb?, eff, deltaWeakened }:
 *   block  null (it hits) | 'levitate' | 'disenchant' | 'absorb' | 'bulletproof' | 'overcoat' | 'flashfire' | 'soundproof'
 *          | 'damp' | 'sturdy' | 'fizzle-rain' | 'fizzle-sun' | 'immune' (type: "It doesn't affect…") | 'wonderguard'
 *   absorb the AB_ABSORB entry when block === 'absorb'      eff  the type multiplier after Delta Stream / Foresight / Scrappy
 *   deltaWeakened  Delta Stream took the super-effectiveness off a Flying type (battle.js says so)
 */
export function moveImmunity(c) {
	const tAb = c.targetAb, uAb = c.userAb, type = c.type, fx = c.fx || {}, types = c.targetTypes || [];
	const out = (block, extra = {}) => ({ block, eff: 1, deltaWeakened: false, ...extra });
	if (tAb === 'levitate' && type === 'Ground') return out('levitate');
	if (tAb === 'disenchant' && type === 'Fairy') return out('disenchant');
	const absorb = AB_ABSORB[tAb];
	if (absorb && type === absorb.t) return out('absorb', { absorb });
	if (tAb === 'bulletproof' && BULLET_MOVES.has(c.moveId)) return out('bulletproof');
	if (tAb === 'overcoat' && POWDER_MOVES.has(c.moveId)) return out('overcoat');
	if (tAb === 'flashfire' && type === 'Fire') return out('flashfire');
	if (tAb === 'soundproof' && SOUND_MOVES.has(c.moveId)) return out('soundproof');
	if (fx.selfKO && (uAb === 'damp' || tAb === 'damp')) return out('damp');
	if (fx.ohko && tAb === 'sturdy') return out('sturdy');
	if (c.primal === 'primordialsea' && type === 'Fire' && c.weatherOn) return out('fizzle-rain');
	if (c.primal === 'desolateland' && type === 'Water' && c.weatherOn) return out('fizzle-sun');
	let eff = effectiveness(type, types), deltaWeakened = false;
	if (c.primal === 'deltastream' && c.weatherOn && types.includes('Flying') && effectiveness(type, ['Flying']) > 1) { eff /= 2; deltaWeakened = true; }
	if (eff === 0 && c.foresight) eff = 1;
	if (eff === 0 && uAb === 'scrappy' && (type === 'Normal' || type === 'Fighting') && types.includes('Ghost')) eff = effectiveness(type, types.filter((t) => t !== 'Ghost'));
	if (eff === 0) return { block: 'immune', eff, deltaWeakened };
	if (tAb === 'wonderguard' && eff <= 1) return { block: 'wonderguard', eff, deltaWeakened };
	return { block: null, eff, deltaWeakened };
}

/**
 * Can this status stick? c = { st, has (the target already has a status), targetTypes, sourceAb, targetAb, guardAbs
 * (the target's and, in doubles, its ally's abilities), weather, uproar }
 * -> null (it sticks) | 'has' | 'type' | 'flowerveil' | 'ability' | 'uproar'
 */
export function statusBlock(c) {
	if (c.has) return 'has';
	// CORROSION poisons even Steel and Poison types: the one ability that overrides a type immunity
	const corroding = c.sourceAb === 'corrosion' && c.st === 'psn';
	if (!corroding && (STATUS_IMMUNE[c.st] || []).some((t) => (c.targetTypes || []).includes(t))) return 'type';
	if ((c.guardAbs || []).includes('flowerveil') && (c.targetTypes || []).includes('Grass')) return 'flowerveil';
	const tAb = c.targetAb;
	if ((STATUS_IMMUNE_AB[c.st] || []).includes(tAb) || (tAb === 'leafguard' && c.weather === 'sun') || tAb === 'comatose') return 'ability';
	if (c.st === 'slp' && c.uproar) return 'uproar';
	return null;
}
