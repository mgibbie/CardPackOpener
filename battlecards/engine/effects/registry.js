// engine/effects/registry.js — the effect-handler registry (docs/06, PR 13).
//
// Dispatch-order rule (behavior-preserving migration): inside execEffects'
// existing loop, the registry is checked FIRST; a miss falls through to the
// legacy 900-branch chain unchanged. The trigger-side switch needs no check
// of its own — its `default:` already delegates per-effect to execEffects,
// so retiring a switch case routes that type through the registry too (one
// handler serves both dispatchers, killing the twin-drift class).
//
// Handler signature: (ctx, e) where ctx = { state, pi, target, source,
// enemies, scaled }. `scaled` is execEffects' per-call value scaler (X-spells
// and valuePer live counts); handlers that don't need it ignore it.
//
// PILOT BATCH (docs/06 Phase 7): armor, draw, conjure-id, hero-shield,
// hero-immune-until-next, shuffle-ids-into-deck — moved from the chain
// verbatim, chain branches (and the switch's simpler `armor` twin, which
// silently lacked the all-heroes variant) deleted.
import { emit, instantiate, MAX_HAND, endTurn, gainTokenCard } from '../../engine.js';
import { gainArmor } from '../damage.js';
import { drawCards } from '../zones.js';

const HANDLERS = new Map();

export function register(type, fn) {
	if (HANDLERS.has(type)) throw new Error(`effect handler '${type}' registered twice`);
	HANDLERS.set(type, fn);
}
export function getEffectHandler(type) {
	return HANDLERS.get(type);
}
export function registeredTypes() {
	return [...HANDLERS.keys()];
}

// ---------- pilot handlers ----------

register('armor', ({ state, pi }, e) => {
	if (e.target === 'all-heroes') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) gainArmor(state, s2, e.value); } // Armor Vendor
	else gainArmor(state, pi, e.value);
});

register('draw', ({ state, pi, scaled }, e) => {
	// count-vs-value tolerance (docs/06 pinned it; king_llane regression): a
	// handful of imported cards write `count` instead of `value` — the old
	// chain read only e.value, so {type:'draw', count:1} silently drew NOTHING
	const n = e.value != null || e.valuePer ? scaled(e) : (e.count || 0);
	if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) drawCards(state, s2, n); }
	else drawCards(state, pi, n);
});

register('conjure-id', ({ state, pi, enemies }, e) => {
	// put a specific card (token ids allowed) into your hand (forEnemy: theirs)
	const p = e.forEnemy && enemies.length ? state.players[enemies[0]] : state.players[pi];
	const tpi = e.forEnemy && enemies.length ? enemies[0] : pi;
	const def = state.cardsById[e.id];
	if (def && p.hand.length < MAX_HAND) {
		const card = instantiate(def, tpi);
		if (e.id === 'high_kings_hammer' && p.hammerBonus) card.attack += p.hammerBonus;
		card.zone = 'hand'; p.hand.push(card);
		emit(state, { type: 'conjure', player: tpi, card, color: null });
	}
});

register('hero-shield', ({ state, pi }) => {
	state.players[pi].heroShield = true; // Curious Cumulus / Hardlight Protector
	emit(state, { type: 'heroShield', player: pi });
});

register('hero-immune-until-next', ({ state, pi }) => {
	state.players[pi].heroImmuneUntilTurn = state.turnNumber + state.players.length; // Doomsday Prepper
});

register('shuffle-ids-into-deck', ({ state, pi, enemies }, e) => {
	// forEnemy: they hide in an opponent's deck instead (King Llane fleeing Garona)
	const tp = e.forEnemy && enemies.length ? enemies[0] : pi;
	const dp = state.players[tp];
	for (const id of e.ids || []) if (state.cardsById[id]) dp.deck.push(id);
	for (let i = dp.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dp.deck[i], dp.deck[j]] = [dp.deck[j], dp.deck[i]]; }
});

// ---------- batch 1 (PR 17): 30 chain branches moved verbatim ----------
// Bodies unchanged except chain-level `continue;` -> `return;` (same
// skip-this-effect semantics). Selection criteria: no trigger-side switch
// twin, no execEffects closure-helper references beyond the ctx fields.

register('cook', ({ state, pi, target, source, enemies, scaled }, e) => {
			gainTokenCard(state, pi, 'food_token');
});

register('enrich', ({ state, pi, target, source, enemies, scaled }, e) => {
			gainTokenCard(state, pi, 'treasure_token');
});

register('corpse-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].corpseDouble = true; // Falric
});

register('hero-immune', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].heroImmuneTurn = state.turnNumber;
});

register('leyline-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].leylineDouble = true; // Surge Needle
});

register('galaxy-lens', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].galaxyLens = true; // Farseer Nobundo
});

register('geddon-draws', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].geddonDraw = true; // Commander Geddon
});

register('commanding-shout', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].minionsSurviveTurn = state.turnNumber;
});

register('corpse-next-card', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].nextCardCorpses = true; // Exarch Maladaar
});

register('next-murloc-free', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].nextMurlocFree = true; // Seadevil Stinger
});

register('companion-upgrade', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].companionUpgrade = true; // Migrating Elekk
});

register('set-spells-lifesteal', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].spellsLifestealThisTurn = true; // Omega Mind
});

register('end-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Time Stop: end the current turn immediately
			endTurn(state);
});

register('hero-power-free-game', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Raza the Chained
			state.players[pi].heroPowerFreeGame = true;
});

register('overload-free-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].overloadFreeTurn = state.turnNumber; // Pebbly Page
});

register('set-next-kindred-twice', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Primalfin Challenger
			state.players[pi].nextKindredTwice = true;
});

register('hero-corpse-deathrattle', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].heroDeathrattleCorpses = true; // Husk, Eternal Reaper
});

register('clear-own-overload', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Minecart Cruiser: cancel this turn's Overload
			state.players[pi].overloadPending = 0;
});

register('companion-extra', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].companionExtra = (state.players[pi].companionExtra || 0) + 1; // Talya Earthstrider
});

register('free-next-spell', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Inkmaster Solia: the next spell this turn costs (0)
			state.players[pi].freeSpellsThisTurn = true;
});

register('spells-cost-one', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Ysiel Windsinger: your spells cost (1) this turn
			state.players[pi].spellsCostOneThisTurn = true;
});

register('warloc-next', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Warloc: your next (3)-or-less Murloc costs Health instead of Mana
			state.players[pi].warlocNext = true;
});

register('investigate', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Investigate: make a Clue token (Sacrifice, pay 2: draw a card)
			gainTokenCard(state, pi, 'clue_token');
});

register('upgrade-hero-power', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Justicar Trueheart: your Hero Power resolves twice from now on
			state.players[pi].heroPowerUpgraded = true;
});

register('set-heal-harm', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Auchenai Phantasm: this turn, your healing deals damage instead
			state.players[pi].healHarmThisTurn = true;
});

register('enable-odyn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Odyn: for the rest of the game, gaining Armor also grants Attack this turn
			state.players[pi].odynActive = true;
});

register('unstealth-all', ({ state, pi, target, source, enemies, scaled }, e) => {
			for (const pl of state.players) for (const c of pl.board) {
				c.stealthed = false;
				c.tempStealth = false;
			}
});

register('agamaggan-next', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Agamaggan: the next card you play costs the OPPONENT'S Health (up to 10)
			state.players[pi].agamagganNext = true;
});

register('set-deck-inner-fire', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lady in White: creatures drawn from your deck get Attack equal to Health
			state.players[pi].deckInnerFire = true;
});

register('arm-copycat', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Copycat: arm to copy the next card the opponent plays
			for (const o of enemies) state.players[o].copycatFor = pi;
});
