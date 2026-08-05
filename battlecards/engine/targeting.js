// engine/targeting.js -- the targeting service (docs/engine-hardening/05, PR 9).
//
// CHOSEN / targetSpec / legalTargets / equipTargets / attackTargets moved
// VERBATIM from engine.js (move-only extraction). CHOSEN maps effect type ->
// allowed e.target values -> target kind; targetSpec derives a card's target
// requirement from its live effects (combo/kicker/miracle-aware);
// legalTargets enumerates the board under stealth/elusive/dormant rules;
// attackTargets applies taunt walls, piercing, rush, and the Ghostly Prison
// hero-attack tax gate.
//
// Pure readers: no state mutation. Shared helpers are imported back from
// engine.js (same intentional call-time-safe cycle as engine/cost.js).
import {
	hp, has, isDead, opponentsOf, availableMana, liveEffectsOf, heroAttackTax,
	KW,
} from '../engine.js';

const CHOSEN = {
	damage: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature', 'undamaged-creature': 'creature', 'enemy-any': 'enemy-any' },
	heal: { any: 'any', creature: 'creature' },
	buff: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'summon-hatch-egg': { 'friendly-creature': 'friendly-creature' }, // Clutch of Corruption: a friendly Dragon
	'spend-all-mana-damage': { creature: 'creature' }, // Forbidden Flame: a minion
	'grant-ongoing': { 'friendly-creature': 'friendly-creature' },
	'grant-static': { 'friendly-creature': 'friendly-creature' },
	grant: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'grant-spell-damage': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'damage-per-cards-played': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'damage-target-by-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'grant-immune-turn': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'damage-stealth-on-kill': { creature: 'creature', 'enemy-creature': 'enemy-creature', any: 'any', 'enemy-any': 'enemy-any' },
	'make-dormant': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'damage-target-and-same-tribe': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'damage-chain-neighbors': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	kelidan: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'become-copy-of-target': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'steal-until-bigger': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'swap-with-hand': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'shuffle-copies-of-target': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'sacrifice-summon-costplus': { 'friendly-creature': 'friendly-creature' },
	'discover-target-tribe': { 'friendly-creature': 'friendly-creature' },
	'steal-health': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'bounce-to-deck-bottom': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'summon-copy-of-target-buffed': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'set-target-stats': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'destroy-fragment-then-damage': { any: 'any', 'enemy-any': 'enemy-any', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'transform-into-token': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'mark-doomed': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'devour-target': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'fill-board-copies-of-target': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'devour-enemy': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'throw-hand-minion': { 'enemy-creature': 'enemy-creature' },
	'lock-minion-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'buff-target-by-source-stats': { 'friendly-creature': 'friendly-creature' },
	'grant-attack-while-alive': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'destroy-friendly-tribe-buff-all': { 'friendly-creature': 'friendly-creature' },
	'destroy-friendly-remember': { 'friendly-creature': 'friendly-creature' },
	'heal-or-harm-target': { any: 'any' },
	'destroy-target-gain-stats': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'damage-excess-draw': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'heal-by-self-health': { any: 'any', creature: 'creature' },
	infinitize: { 'friendly-creature': 'friendly-creature' },
	picklock: { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	imprison: { 'enemy-creature': 'enemy-creature' },
	'ooze-bones': { 'friendly-creature': 'friendly-creature' },
	'debuff-until-your-next': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'steal-bonus-keywords': { 'enemy-creature': 'enemy-creature' },
	'swap-attack-with': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'freeze-gain-armor': { 'enemy-creature': 'enemy-creature' },
	'set-target-stats-from-source': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'swap-stats-two': { creature: 'creature' },
	'swap-enemy-with-deck': { 'enemy-creature': 'enemy-creature' },
	fireworks: { 'friendly-creature': 'friendly-creature' },
	'bounce-and-buff': { 'friendly-creature': 'friendly-creature' },
	'copy-health': { 'friendly-creature': 'friendly-creature' },
	'transform-target-into-source': { 'friendly-creature': 'friendly-creature' },
	'mark-summon-copy': { 'enemy-creature': 'enemy-creature' },
	'destroy-all-copies': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'copy-to-all-zones': { 'friendly-creature': 'friendly-creature' },
	destroy: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-hand': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	frostburn: { creature: 'creature' },
	'deck-minions-become-copies': { 'friendly-creature': 'friendly-creature' },
	'copy-summon': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'summon-with-stats': { 'friendly-creature': 'friendly-creature' },
	exile: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'exile-until-return': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	blink: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	fight: { 'friendly-creature': 'friendly-creature', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'attach-equip': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	disguise: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	freeze: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'trigger-one-deathrattle': { 'friendly-creature': 'friendly-creature' },
	silence: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'temp-buff': { creature: 'creature', 'friendly-creature': 'friendly-creature', 'friendly-any': 'friendly-any' },
	'heal-full': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'set-health': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'set-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'attack-equals-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-attack': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	bounce: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature', permanent: 'permanent' },
	'mind-control': { 'enemy-creature': 'enemy-creature' },
	transform: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'transform-copy': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-health-with': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-stats-with': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'copy-stats': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-hand-cheap': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'destroy-and-remember': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-deck': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'summon-copies-from-deck': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'blade-of-cthun': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	conditional: { any: 'any', creature: 'creature' },
	'damage-then': { any: 'any', creature: 'creature' },
	'draw-damage': { any: 'any' },
	'grant-deathrattle': { creature: 'creature' },
	'copy-deathrattle': { 'friendly-creature': 'friendly-creature' },
	attach: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'attach-curse': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'add-counters': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'temp-immune': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-stats': { creature: 'creature' },
	shadowflame: { 'friendly-creature': 'friendly-creature' },
	swipe: { 'enemy-any': 'enemy-any' },
	'damage-adjacent': { creature: 'creature' },
	betrayal: { 'enemy-creature': 'enemy-creature' },
	doom: { 'friendly-creature': 'friendly-creature' },
	corrupt: { 'enemy-creature': 'enemy-creature' },
	'mind-control-temp': { 'enemy-creature': 'enemy-creature' },
	'set-hero-health': { 'any-hero': 'any-hero' },
};

// Returns null (no target needed) or { targets, filter(card)?, required, why }
// `choice` selects a Choose One branch before deriving the target.
export function targetSpec(state, pi, card, choice) {
	// hand-scripted legacy cards keep their bespoke specs
	if (card.type === 'creature') {
		switch (card.id) {
			case 'contract_killer':
				return { targets: 'creature', filter: c => hp(c) <= 3, required: false, why: 'a creature with 3 or less Health' };
			case 'tumbleweed_tactician':
				return { targets: 'enemy-creature', required: false, why: 'an enemy creature' };
		}
	}
	switch (card.id) {
		case 'backstab':
			return { targets: 'creature', filter: c => c.damage === 0, required: true, why: 'an undamaged creature' };
		case 'fortify':
			return { targets: 'creature', required: true, why: 'a creature' };
		case 'mark_target':
			return { targets: 'enemy-creature', required: true, why: 'an enemy creature' };
	}
	// choose-one cards with no branch picked yet: the branch menu comes first
	if (card.choices && choice == null) return null;
	// generic: derive from the first effect that needs a chosen target
	// (combo-aware: an active combo line replaces the base effects;
	//  Miracle effects join the scan when the card was drawn this turn)
	const _specEffects = [...(liveEffectsOf(state, pi, card, choice) || []),
		...((card.miracle && card.drawnThisTurn) ? (card.miracle.effects || []) : [])];
	for (const e of _specEffects) {
		let kind = CHOSEN[e.type]?.[e.target];
		// "the enemy hero" is unambiguous in 1v1 but a choice with 3+ players;
		// Joust likewise lets you pick which opponent to Joust against
		if (!kind && e.target === 'enemy-hero' && (e.type === 'damage' || e.type === 'joust') && opponentsOf(state, pi).length > 1) {
			kind = 'enemy-hero';
		}
		if (!kind) continue;
		let filter = null, why = {
			any: 'any target', creature: 'a creature',
			'enemy-creature': 'an enemy creature', 'friendly-creature': 'a friendly creature',
			'friendly-any': 'a friendly character', 'enemy-hero': 'an enemy hero',
			'enemy-any': 'an enemy', 'any-hero': 'a hero', permanent: 'any permanent',
		}[kind];
		if (e.target === 'undamaged-creature') { filter = c => c.damage === 0; why = 'an undamaged creature'; }
		if (e.maxAttack != null) { filter = c => c.attack <= e.maxAttack; why = `a creature with ${e.maxAttack} or less Attack`; }
		if (e.maxCost != null) { filter = c => (c.cost || 0) <= e.maxCost; why = `a creature that costs ${e.maxCost} or less`; }
		if (e.minAttack != null) { filter = c => c.attack >= e.minAttack; why = `a creature with ${e.minAttack} or more Attack`; }
		if (e.requireKeyword != null) { filter = c => c.keywords.includes(e.requireKeyword); why = `a creature with ${e.requireKeyword.replace(/_/g, ' ')}`; }
		if (e.requireDamaged) { filter = c => c.damage > 0; why = 'a damaged creature'; }
		if (e.excludeSelf) { const prev = filter; filter = c => c !== card && (!prev || prev(c)); why = (why || 'a creature') + ' other than this'; }
			if (e.excludeTitan) { const prev = filter; filter = c => !c.titan && (!prev || prev(c)); why = 'a non-Titan minion'; } // Aman'Thul: Shape the Stars
		if (e.tribe) {
			const tribes = e.tribe.split('|');
			filter = c => tribes.some(t => (c.tribe || '').includes(t));
			why = `a friendly ${e.tribe.replace(/\|/g, '/')}`;
		}
		// spells need their target; creature/weapon battlecries fizzle without one.
		// picking which opponent (enemy-hero, e.g. Joust/multi-target burn) is required.
		const required = kind === 'enemy-hero' || (card.type !== 'creature' && card.type !== 'weapon');
		return { targets: kind, filter, required, why };
	}
	return null;
}

export function legalTargets(state, pi, spec) {
	const out = [];
	const opps = opponentsOf(state, pi);
	// Spellward Jeweler: an Elusive enemy hero can't be targeted this window
	const pushHero = (side) => { if (side !== pi && (state.players[side].heroElusiveUntil || 0) >= state.turnNumber) return; out.push({ type: 'hero', player: side }); };
	const pushCreatures = (side) => {
		for (const c of state.players[side].board) {
			if (c.type === 'location') continue; // locations aren't creatures
			if (c.dormantLeft > 0) continue;     // dormant: untouchable
			if (side !== pi && c.stealthed) continue; // stealth: untargetable by opponent
			if (side !== pi && has(c, KW.ELUSIVE)) continue; // elusive: no enemy spells/powers
			if (!spec.filter || spec.filter(c)) out.push({ type: 'creature', uid: c.uid, player: side });
		}
	};
	if (spec.targets === 'any') {
		pushCreatures(pi);
		for (const o of opps) pushCreatures(o);
		out.push({ type: 'hero', player: pi });
		for (const o of opps) pushHero(o);
	}
	if (spec.targets === 'creature') { pushCreatures(pi); for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'enemy-creature') { for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'friendly-creature') { pushCreatures(pi); }
	if (spec.targets === 'friendly-any') { pushCreatures(pi); out.push({ type: 'hero', player: pi }); }
	if (spec.targets === 'enemy-hero') { for (const o of opps) pushHero(o); }
	if (spec.targets === 'enemy-any') {
		for (const o of opps) { pushCreatures(o); pushHero(o); }
	}
	if (spec.targets === 'any-hero') {
		out.push({ type: 'hero', player: pi });
		for (const o of opps) pushHero(o);
	}
	if (spec.targets === 'permanent') {
		const pushPermanents = (side) => {
			const P = state.players[side];
			for (const c of P.board) {
				if (c.dormantLeft > 0) continue;
				if (side !== pi && (c.stealthed || has(c, KW.ELUSIVE))) continue;
				if (!spec.filter || spec.filter(c)) out.push({ type: c.type === 'location' ? 'location' : 'creature', uid: c.uid, player: side });
			}
			for (const c of P.artifacts) if (!spec.filter || spec.filter(c)) out.push({ type: 'artifact', uid: c.uid, player: side });
			for (const c of P.enchantments) if (!spec.filter || spec.filter(c)) out.push({ type: 'enchantment', uid: c.uid, player: side });
			for (const c of P.planeswalkers) if (!spec.filter || spec.filter(c)) out.push({ type: 'walker', uid: c.uid, player: side });
		};
		pushPermanents(pi);
		for (const o of opps) pushPermanents(o);
	}
	return out;
}

export function equipTargets(state, pi, equipUid) {
	const p = state.players[pi];
	const eq = p.artifacts.find(a => a.uid === equipUid);
	if (!eq || !eq.equip) return [];
	return p.board.filter(c => c.type !== 'location' && c.dormantLeft <= 0 && !isDead(c))
		.map(c => ({ type: 'creature', uid: c.uid, player: pi }));
}

export function attackTargets(state, pi, attacker) {
	const out = [];
	const rushOnly = attacker.sick && has(attacker, KW.RUSH) && !has(attacker, KW.CHARGE);
	for (const opp of opponentsOf(state, pi)) {
		const board = state.players[opp].board.filter(c => !c.stealthed && c.type !== 'location' && c.dormantLeft <= 0);
		// piercing ignores taunt walls
		const taunts = has(attacker, KW.PIERCING) ? [] : board.filter(c => has(c, KW.TAUNT));
		out.push(...(taunts.length ? taunts : board).map(c => ({ type: 'creature', uid: c.uid, player: opp })));
		if (!taunts.length) {
			for (const w of state.players[opp].planeswalkers) out.push({ type: 'walker', uid: w.uid, player: opp });
			// the hero is only a legal target if pi can afford the attack tax (Ghostly Prison)
			const tax = heroAttackTax(state, opp);
			const noHero = attacker.noHeroAttackTurn === state.turnNumber; // Charged Devilsaur
			if (!rushOnly && !noHero && (tax === 0 || availableMana(state.players[pi]) >= tax)) out.push({ type: 'hero', player: opp });
		}
	}
	return out;
}
