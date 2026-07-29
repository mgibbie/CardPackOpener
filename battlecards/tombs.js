// Tombs of Terror run data: the 16 passive treasures. Explorers, chapters,
// and run logic land in later phases. Card-shaped data (active treasures,
// Explorer hero powers) lives in cards.json under set TOMBS_OF_TERROR.
import * as E from './engine.js';

const emblem = (state, pi, id, name, text, extra) => {
	const em = E.instantiate({ id, name, type: 'emblem', cost: 0, rarity: 'basic', description: text, ...extra }, pi);
	em.zone = 'emblem';
	state.players[pi].emblems.push(em);
	E.recomputeAuras(state);
};

// Passive treasures: picked at run start, applied once per fight. Most set a
// player flag that engine hooks read (playCard / spell / draw / turn-end /
// damageHero / discover); a few boot straight into an emblem aura.
export const PASSIVES = {
	mummy_magic: {
		name: 'Mummy Magic', text: 'After you play your first Deathrattle creature each turn, give it Reborn.',
		apply: (state, pi) => { state.players[pi].mummyMagic = true; },
	},
	crook_and_flail: {
		name: 'Crook and Flail', text: 'After you cast a spell, put a creature from your deck onto the battlefield.',
		apply: (state, pi) => { state.players[pi].crookAndFlail = true; },
	},
	unlocked_potential: {
		name: 'Unlocked Potential', text: 'Your creatures have Attack equal to their Health.',
		apply: (state, pi) => { state.players[pi].deckInnerFire = true; },
	},
	vip_membership: {
		name: 'VIP Membership', text: 'Taverns you visit are upgraded!',
		apply: (state, pi) => { state.players[pi].vipMembership = true; },
	},
	disks_of_legend: {
		name: 'Disks of Legend', text: 'After you play a Legendary creature, summon a copy of it.',
		apply: (state, pi) => { state.players[pi].disksOfLegend = true; },
	},
	darklight_torch: {
		name: 'Darklight Torch', text: 'After you play an even-Cost card, refresh your Hero Power. It costs (0) this turn.',
		apply: (state, pi) => { state.players[pi].darklightTorch = true; },
	},
	primordial_bulwark: {
		name: 'Primordial Bulwark', text: 'Block lethal damage & deal 20 damage to target opponent. (once per game)',
		apply: (state, pi) => { state.players[pi].primordialBulwark = true; },
	},
	band_of_bees: {
		name: 'Band of Bees', text: 'Your creatures that cost (2) or less have Poisonous.',
		apply: (state, pi) => emblem(state, pi, 'tomb_band_of_bees', 'Band of Bees', 'Your cheap creatures have Poisonous.', { aura: { keywords: ['poisonous'], maxCost: 2 } }),
	},
	band_of_scarabs: {
		name: 'Band of Scarabs', text: 'Enemy creatures have -1 Attack.',
		apply: (state, pi) => emblem(state, pi, 'tomb_band_of_scarabs', 'Band of Scarabs', 'Enemy creatures have -1 Attack.', { aura: { global: true, scope: 'enemies', attack: -1 } }),
	},
	disks_of_swiftness: {
		name: 'Disks of Swiftness', text: 'Your opponent must pass their first 2 turns.',
		apply: (state, pi) => { for (const o of E.opponentsOf(state, pi)) state.players[o].skipTurns = (state.players[o].skipTurns || 0) + 2; },
	},
	alchemists_stone: {
		name: "Alchemist's Stone", text: 'After you play an odd-Cost card, reduce the Cost of cards in your hand by (1).',
		apply: (state, pi) => { state.players[pi].alchemistStone = true; },
	},
	ever_changing_elixir: {
		name: 'Ever-Changing Elixir', text: 'At the end of your turn, transform a friendly creature into one that costs (1) more.',
		apply: (state, pi) => { state.players[pi].everChangingElixir = true; },
	},
	scroll_of_nonsense: {
		name: 'Scroll of Nonsense', text: 'Spell Damage +10. At the end of your turn, this loses 1 Spell Damage.',
		apply: (state, pi) => emblem(state, pi, 'tomb_scroll_of_nonsense', 'Scroll of Nonsense', 'Spell Damage that decays each turn.', { static: { type: 'spell-damage', value: 10 }, scrollDecay: true }),
	},
	lucky_spade: {
		name: 'Lucky Spade', text: 'After you Discover a card, add 2 copies of it to your hand. They cost (2) less.',
		apply: (state, pi) => { state.players[pi].luckySpade = true; },
	},
	titanic_ring: {
		name: 'Titanic Ring', text: 'Your creatures have +1 Health and Taunt.',
		apply: (state, pi) => emblem(state, pi, 'tomb_titanic_ring', 'Titanic Ring', 'Your creatures have +1 Health and Taunt.', { aura: { health: 1, keywords: ['taunt'] } }),
	},
	robes_of_diminishing: {
		name: 'Robes of Diminishing', text: 'After you draw a spell, reduce its Cost to (0) this turn.',
		apply: (state, pi) => { state.players[pi].robesOfDiminishing = true; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'tombsPassive', player: pi, id, name: p.name });
	return true;
}
