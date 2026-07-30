// Hearthstone Duels run data: passive treasures + the playable heroes. Active
// treasures (set DUELS) and hero powers (type 'heropower', id duelshp_*) live
// in cards.json. Boss ladder + run logic land in later phases. Mirrors the
// tombs.js / heist.js structure.
import * as E from './engine.js';

const emblem = (state, pi, id, name, text, extra) => {
	const em = E.instantiate({ id, name, type: 'emblem', cost: 0, rarity: 'basic', description: text, ...extra }, pi);
	em.zone = 'emblem';
	state.players[pi].emblems.push(em);
	E.recomputeAuras(state);
};

// Passive treasures: picked at run start, applied once per fight. Most set a
// player flag the engine already reads (shared with Tombs/Heist) or boot an
// emblem aura. Batch 1 is the reuse-only set; school-specific and new-hook
// passives arrive in later batches.
export const PASSIVES = {
	robe_of_the_apprentice: {
		name: 'Robe of the Apprentice', text: 'Spell Damage +1.',
		apply: (state, pi) => emblem(state, pi, 'duels_robe_apprentice', 'Robe of the Apprentice', 'Spell Damage +1.', { static: { type: 'spell-damage', value: 1 } }),
	},
	small_backpacks: {
		name: 'Small Backpacks', text: 'At the start of the game, draw 2 cards.',
		apply: (state, pi) => E.execEffects(state, pi, [{ type: 'draw', value: 2 }], null, null),
	},
	small_pouches: {
		name: 'Small Pouches', text: 'At the start of the game, draw a card.',
		apply: (state, pi) => E.execEffects(state, pi, [{ type: 'draw', value: 1 }], null, null),
	},
	band_of_bees: {
		name: 'Band of Bees', text: 'Your creatures that cost (2) or less have Poisonous.',
		apply: (state, pi) => emblem(state, pi, 'duels_band_of_bees', 'Band of Bees', 'Your cheap creatures have Poisonous.', { aura: { keywords: ['poisonous'], maxCost: 2 } }),
	},
	emerald_goggles: {
		name: 'Emerald Goggles', text: 'The left-most card in your hand costs (2) less.',
		apply: (state, pi) => { state.players[pi].leftmostDiscount = 2; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'duelsPassive', player: pi, id, name: p.name });
	return true;
}

// ---------- heroes ----------
// The signature Duels heroes, one per class. Their hero-power options are the
// class powers imported into cards.json (duelshp_*); HERO_POWERS lists what is
// wired so far (expanded as more powers are imported).
export const HEROES = [
	{ id: 'mozaki', name: 'Mozaki, Master Duelist', heroClass: 'mage', flavor: 'Every spell she casts sharpens the next.' },
	{ id: 'slate', name: 'Professor Slate', heroClass: 'hunter', flavor: 'A chemist who solves every problem with the right toxin.' },
	{ id: 'turalyon', name: 'Turalyon, the Tenured', heroClass: 'paladin', flavor: 'The Lightbringer, now grading on a curve.' },
	{ id: 'omu', name: 'Forest Warden Omu', heroClass: 'druid', flavor: 'Mana comes and goes; the forest endures.' },
	{ id: 'lilian', name: 'Infiltrator Lilian', heroClass: 'rogue', flavor: 'She was never here, and she already left with your deck.' },
	{ id: 'illucia', name: 'Mindrender Illucia', heroClass: 'priest', flavor: 'She will play your hand better than you would.' },
	{ id: 'willow', name: 'Archwitch Willow', heroClass: 'warlock', flavor: 'Imps for every occasion, and every occasion is now.' },
	{ id: 'fireheart', name: 'Instructor Fireheart', heroClass: 'shaman', flavor: 'Invoke, invoke, invoke — the elements are listening.' },
	{ id: 'rattlegore', name: 'Rattlegore', heroClass: 'warrior', flavor: 'Bone by bone, he simply reassembles.' },
	{ id: 'stelina', name: 'Star Student Stelina', heroClass: 'demon_hunter', flavor: 'Top of her class in disappearing acts.' },
	{ id: 'sai', name: 'Sai Shadestorm', heroClass: 'death_knight', flavor: 'The corpses keep the ledger; she keeps the corpses.' },
];

// class -> imported hero-power ids (cards.json, type 'heropower'). Grows batch
// by batch; a hero's picker rolls from its class list plus the neutral powers.
export const HERO_POWERS = {
	neutral: ['duelshp_send_in_the_scout'],
	warrior: ['duelshp_primal_power', 'duelshp_uber_primal_power'],
	hunter: ['duelshp_survival_training'],
	paladin: ['duelshp_modest_aspirations', 'duelshp_from_golden_light', 'ulda_new_recruits'],
	druid: ['duelshp_harvest_time'],
	priest: ['duelshp_shadow_mend', 'duelshp_call_of_madness'],
	death_knight: ['duelshp_blood_parasite'],
};
