// Dalaran Heist run data: the 16 passive treasures (phase 2). Heroes, boss
// wings, and run logic land in later phases. Card-shaped data (active
// treasures, alt hero powers) lives in cards.json under set DALARAN_HEIST.
import * as E from './engine.js';

// Passive treasures: picked at the start of a run, applied once per game.
// `apply(state, pi)` mutates the live game state; display fields feed the
// picker UI and the wiki.
export const PASSIVES = {
	recycling: {
		name: 'Recycling', text: 'After a friendly minion dies, gain 2 Armor.',
		apply: (state, pi) => { const p = state.players[pi]; p.armorPerFriendlyDeath = (p.armorPerFriendlyDeath || 0) + 2; },
	},
	rocket_backpacks: {
		name: 'Rocket Backpacks', text: 'Your minions have Rush.',
		apply: (state, pi) => {
			const em = E.instantiate({ id: 'heist_rocket_backpacks', name: 'Rocket Backpacks', type: 'emblem', cost: 0, rarity: 'basic', description: 'Your minions have Rush.', aura: { keywords: ['rush'] } }, pi);
			em.zone = 'emblem';
			state.players[pi].emblems.push(em);
			E.recomputeAuras(state);
		},
	},
	emerald_goggles: {
		name: 'Emerald Goggles', text: 'The left-most card in your hand costs (2) less.',
		apply: (state, pi) => { state.players[pi].leftmostDiscount = 2; },
	},
	robes_of_gaudiness: {
		name: 'Robes of Gaudiness', text: 'Your cards cost half, but you can only play two cards each turn.',
		apply: (state, pi) => { const p = state.players[pi]; p.robesHalf = true; p.robesTwoCards = true; },
	},
	stargazing: {
		name: 'Stargazing', text: 'You can use your Hero Power twice each turn. It costs (1) less.',
		apply: (state, pi) => { state.players[pi].stargazing = true; },
	},
	resourcefulness: {
		name: 'Resourcefulness', text: 'At the start of the game, equip a random weapon and give it +1/+1.',
		apply: (state, pi) => { E.execEffects(state, pi, [{ type: 'equip-random', selfBuff: { attack: 1, durability: 1 } }], null, null); },
	},
	a_princes_ring: {
		name: "A Prince's Ring", text: 'Replace your starting Hero Power with a random one.',
		apply: (state, pi) => {
			const pool = Object.values(state.cardsById).filter(d => d.type === 'heropower' && d.id.startsWith('dala_') && d.power);
			if (!pool.length) return;
			const power = E.instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
			power.zone = 'heropower'; power.usedThisTurn = false;
			state.players[pi].heroPowers = [power];
		},
	},
	book_of_wonders: {
		name: 'Book of Wonders', text: "At the start of the game, shuffle 10 Scrolls of Wonder into your deck.",
		apply: (state, pi) => {
			const p = state.players[pi];
			for (let i = 0; i < 10; i++) p.deck.push('dala_scroll_of_wonder');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
		},
	},
	wondrous_wisdomball: {
		name: 'Wondrous Wisdomball', text: 'Occasionally gives helpful advice.',
		apply: (state, pi) => { state.players[pi].wisdomball = true; },
	},
	togwaggles_dice: {
		name: "Togwaggle's Dice", text: 'At the end of your turn, randomize the Cost of all cards in your hand.',
		apply: (state, pi) => { state.players[pi].togwaggleDice = true; },
	},
	dr_booms_remote: {
		name: "Dr. Boom's Remote", text: 'At the start of the game, summon three 1/1 Boom Bots.',
		apply: (state, pi) => { for (let i = 0; i < 3; i++) if (state.cardsById['boom_bot']) E.summon(state, pi, state.cardsById['boom_bot']); },
	},
	hagathas_embrace: {
		name: "Hagatha's Embrace", text: 'At the start of your turn, give a random minion in your hand +1/+1.',
		apply: (state, pi) => { state.players[pi].hagathaEmbrace = true; },
	},
	the_hand_of_rafaam: {
		name: 'The Hand of Rafaam', text: "At the start of the game, give your opponent two Cursed! cards.",
		apply: (state, pi) => {
			for (const o of E.opponentsOf(state, pi)) {
				for (let i = 0; i < 2; i++) {
					const c = E.instantiate(state.cardsById['dala_cursed'], o);
					c.zone = 'hand';
					state.players[o].hand.push(c);
				}
				break;
			}
		},
	},
	elixir_of_vigor: {
		name: 'Elixir of Vigor', text: 'After you play a minion, shuffle two copies of it into your deck. They cost (1).',
		apply: (state, pi) => { state.players[pi].vigorShuffle = true; },
	},
	elixir_of_vim: {
		name: 'Elixir of Vim', text: 'You draw an additional two cards each turn. You are Immune to Fatigue.',
		apply: (state, pi) => { const p = state.players[pi]; p.extraTurnDraw = 2; p.noFatigue = true; },
	},
	elixir_of_vile: {
		name: 'Elixir of Vile', text: 'Your spells cost Health instead of Mana.',
		apply: (state, pi) => { state.players[pi].spellsCostHealth = true; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'heistPassive', player: pi, id, name: p.name });
	return true;
}
