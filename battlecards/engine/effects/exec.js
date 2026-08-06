// engine/effects/exec.js — the effect executors (docs/05, PR 40).
//
// execEffects (play-path: battlecries, spells, deathrattles) and
// runSecretEffects (trigger-path: ongoings, secrets) moved VERBATIM from
// core.js. Both are pure dispatch shells over the registry: execEffects
// builds the closure-helper ctx (enemies/scaled/boost/heal/buff...) that
// handler bodies were written against; runSecretEffects threads the trigger
// context + the triggering() liveness helper, delegating unmatched types to
// execEffects with the firing permanent as source.
import './index.js'; // ensure every themed handler file has registered
import { getEffectHandler, getTriggerHandler, ABORT } from './registry.js';
import {
	opponentsOf, heraldMult, findCreature, emit, hp, isDead, has, fireOngoing,
	staticValue, heroAttackValue, recomputeAuras, KW, STARTING_LIFE,
} from '../../engine.js';
export function execEffects(state, pi, effects, target, source) {
	// dev-mode effect budget (state.debug is never set in production): each
	// execEffects call counts against a per-action budget the caller resets —
	// a cheap runaway-composition tripwire (loops manifest as huge call counts)
	if (state.debug && state.debug.effectBudget && ++state._fxCount > state.debug.effectBudget) {
		state._fxCount = 0;
		throw new Error(`effect budget exceeded (${state.debug.effectBudget} execEffects calls in one action) — possible effect loop`);
	}
	const enemies = opponentsOf(state, pi);
	// current Herald multiplier for `heraldScaled` effects (Colossal appendages)
	const hm = () => heraldMult(state.players[pi].heraldCount || 0);
	const pickEnemy = () => enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : null;
	// "the enemy hero": the chosen one, the only one, or (untargeted fallback) a random one
	const enemyHero = () => {
		if (target?.type === 'hero' && target.player !== pi) return target.player;
		return enemies.length === 1 ? enemies[0] : pickEnemy();
	};
	const chosenCreature = () => target?.type === 'creature' ? findCreature(state, target.uid) : null;
	const healCreature = (c, v) => {
		const healed = c.damage > 0 && v > 0;
		const landed = Math.min(v, c.damage); // Xyrella: healing that actually restored Health
		// Overheal: the healing that overflows past full Health (wasted, but a bonus)
		const overflow = v - c.damage;
		c.damage = Math.max(0, c.damage - v);
		emit(state, { type: 'heal', targetType: 'creature', uid: c.uid, amount: v, hp: hp(c) });
		if (v > 0 && !isDead(c)) { const hb = state.players[pi].board.filter(x => x.healBonusHealth && !isDead(x)).reduce((s, x) => s + x.healBonusHealth, 0); if (hb) { c.maxHealth += hb; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } } // Lightsteed
		if (healed) {
			state.players[pi].healedThisTurn = true; // Cleric of An'she
			state.players[pi].healedAmountThisTurn = (state.players[pi].healedAmountThisTurn || 0) + landed; // Xyrella
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedCreature: c });
		}
		if (c.overheal && overflow > 0 && !isDead(c)) {
			c._lastOverheal = overflow; // Heartthrob: remember the overflow for cost-scaled effects
			execEffects(state, c.controller, c.overheal, null, c);
		}
		// Anchorite: another minion's overheal becomes permanent extra Health
		if (overflow > 0 && !isDead(c) && state.players[c.controller].board.some(a => a.overhealReactive && !isDead(a) && a !== c)) {
			c.maxHealth += overflow;
			emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		}
	};
	const buffCreature = (c, atk, hpv) => {
		atk = atk || 0; hpv = hpv || 0; // robustness: undefined stat -> 0
		if (c.doubleBuffs) { atk *= 2; hpv *= 2; } // Saidan the Scarlet
		if (c.statGainBonus && (atk > 0 || hpv > 0)) { atk += 1; hpv += 1; } // Dalaran Champion
		c.attack += atk;
		c.maxHealth += hpv;
		// any permanent +1/+1 banks a "counter" so Proliferate can find it later
		if (atk > 0 && hpv > 0) c.counters = (c.counters || 0) + Math.min(atk, hpv);
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	};
	// Shield Slam-style scaling: the effect's value multiplies by a live count
	const scaled = e => {
		if (e.value === 'X') return source?.xValue || 0; // X-spells: excess mana
		if (!e.valuePer) return e.value;
		const p = state.players[pi];
		if (e.valuePer === 'armor') return (e.value || 1) * p.armor;
		if (e.valuePer === 'cards-played') return (e.value || 1) * (p.cardsPlayedThisTurn || 0); // Shadow Sculptor
		if (e.valuePer === 'hero-attack') return heroAttackValue(state, p);
		if (e.valuePer === 'hero-attacks-game') return (e.value || 1) + (p.heroAttacksGame || 0); // Shockspitter: 1 + your hero attacks this game
		if (e.valuePer === 'schools-cast-game') return (e.value || 1) + Object.keys(p.schoolsCastGame || {}).length; // Inquisitive Creation
		if (e.valuePer === 'elementals-last-turn') return (e.value || 1) + (p.elementalsPlayedLastTurn || 0); // Unchained Gladiator: 1 + Elementals played last turn
		if (e.valuePer === 'draws-this-turn') return (e.value || 1) * (p.drawsThisTurn || 0); // Mindbender
		if (e.valuePer === 'friendly-deaths-this-turn') return (e.value || 1) * (p.diedThisTurn || 0); // Feast of Souls
		if (e.valuePer === 'beasts-you-control') return (e.value || 0) + p.board.filter(c => !isDead(c) && (c.tribe || '').includes('Beast')).length; // Overwhelm: base + 1 per Beast you control
		if (e.valuePer === 'corpses') return (e.value || 1) * (p.corpses || 0); // Fistful of Corpses: damage = your Corpses (not spent)
		if (e.valuePer === 'damaged-friendly') {
			let n = p.board.filter(c => !isDead(c) && c.damage > 0).length;
			if (p.life < STARTING_LIFE) n++;
			return (e.value || 1) * n;
		}
		return e.value;
	};
	// Prophet Velen doubles spell and hero-power damage/healing
	const velen = source && (source.type === 'sorcery' || source.type === 'instant' || source.type === 'heropower')
		? staticValue(state.players[pi], 'double-spell') : 0;
	const boost = v0 => v0 * (2 ** velen);
	for (const e0 of effects || []) {
		// "improve" instruments (Festival of Legends weapons): a Deathrattle number
		// that grows with source.improveCount. improveScaled names which field scales.
		let e = e0;
		if (e0.improveScaled && source && source.improveCount) {
			const n = source.improveCount; e = { ...e0 };
			if (e0.improveScaled === 'stats') { e.attack = (e.attack || 0) + n; e.health = (e.health || 0) + n; }
			else if (e0.improveScaled === 'count') e.count = (e.count || 0) + n;
			else e.value = (e.value || 0) + n; // 'value'
		}
		// Every effect type resolves through engine/effects/registry.js — the
		// legacy 900-branch if-chain is fully retired (PRs 13–37). The ctx
		// carries this function's closure helpers so handler bodies run with
		// chain-identical scope; a handler returning ABORT stops the whole list
		// (the old bare-`return`-from-execEffects semantics).
		const _h = getEffectHandler(e.type);
		if (_h) {
			if (_h({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) === ABORT) return;
			continue;
		}
		if (state.debug && state.debug.strictEffects && e.type && !getTriggerHandler(e.type)) {
			// (trigger-only types are KNOWN types — reached here they no-op, as their
			// old explicit effects-side stubs did)
			// dev-mode only (state.debug is never set in production): an effect
			// type that NOTHING handled. In prod this is a silent no-op — here it
			// is loud, so data typos and unregistered types can't hide.
			throw new Error(`unknown effect type: '${e.type}'`);
		}
	}
	// heals/set-health may have cleared damage: enrage bonuses retract here
	recomputeAuras(state);
}

export function runSecretEffects(state, pi, effects, ctx) {
	// dev-mode effect budget (see execEffects): trigger-side loops recurse via
	// runSecretEffects→summon→fireOngoing WITHOUT touching execEffects (the
	// Goldbeard recursion, fuzz seed 9419695), so the tripwire counts here too
	if (state.debug && state.debug.effectBudget && ++state._fxCount > state.debug.effectBudget) {
		state._fxCount = 0;
		throw new Error(`effect budget exceeded (${state.debug.effectBudget} effect calls in one action) — possible trigger loop`);
	}
	const triggering = () => {
		const m = ctx.minion || (ctx.attackerType === 'creature' ? ctx.attacker : null);
		return m && !isDead(m) ? m : null;
	};
	for (const e of effects || []) {
		const th = getTriggerHandler(e.type);
		if (th) { th(state, pi, e, ctx, triggering); continue; }
		// unmatched trigger types delegate to execEffects with the firing
		// permanent as `source` so self-scoped effects still work (the old
		// switch default)
		execEffects(state, pi, [e], null, ctx.self || null);
	}
}
