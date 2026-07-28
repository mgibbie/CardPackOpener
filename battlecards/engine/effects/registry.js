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
import { emit, instantiate, MAX_HAND, endTurn, gainTokenCard, execEffects, summon } from '../../engine.js';
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

// ---------- batch 2 (PR 18): the remaining 24 zero-risk chain branches ----------

register('set-next-battlecry-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Murmuring Elemental: arm the next Battlecry this turn to fire twice
			state.players[pi].nextBattlecryDouble = true;
});

register('free-enemy-spells', ({ state, pi, target, source, enemies, scaled }, e) => {
			for (const o of enemies) state.players[o].freeSpellsNextTurn = true;
			emit(state, { type: 'freeSpells', player: pi });
});

register('grant-battlecries-twice', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Deepminer Brann: your Battlecries trigger twice for the rest of the game
			state.players[pi].battlecriesTwice = true;
});

register('aegwynn-pass', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Aegwynn: the next minion you draw inherits Spell Damage +2 and this Deathrattle
			state.players[pi].aegwynnPending = true;
});

register('grant-hero-elusive', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Spellward Jeweler: your hero can't be targeted until your next turn
			state.players[pi].heroElusiveUntil = state.turnNumber + 2;
});

register('double-deck-minion-stats', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lor'themar Theron: double the stats of all minions in your deck (applied as they're drawn)
			state.players[pi].deckDoubleStats = true;
});

register('grant-first-card-free', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Bonelord Frostwhisper: for the rest of the game, your first card each turn costs (0)
			state.players[pi].firstCardFreeEachTurn = true;
});

register('reverse-deck', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Timeless Causality: reverse the order of your deck
			state.players[pi].deck.reverse();
			emit(state, { type: 'shuffle', player: pi });
});

register('inc-pogo', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Pogo-Hopper: track how many you've played so the next gains more
			state.players[pi].pogoCount = (state.players[pi].pogoCount || 0) + 1;
});

register('sorry', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].canSaySorry = true; // Gullible Guard: it's an emote, but it's YOURS
			emit(state, { type: 'sorryUnlocked', player: pi });
});

register('refresh-hero-power', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Auctionmaster Beardo: your Hero Power can be used again this turn
			for (const hp of state.players[pi].heroPowers) hp.usedThisTurn = false;
});

register('extra-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Timewinder Zarimi: take an extra turn after this one
			state.forcedTurns = (state.forcedTurns && state.forcedTurns.length) ? [pi, ...state.forcedTurns] : [pi];
});

register('summon-random-hand-size', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Astromancer: summon a random creature costing exactly your hand size
			execEffects(state, pi, [{ type: 'summon-random', cost: state.players[pi].hand.length }], target, source);
});

register('aviana-cycle', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Aviana: three of your turns from now, the Full Moon rises
			state.players[pi].avianaAt = state.turnNumber + 3 * state.players.length;
			emit(state, { type: 'lunarCycle', player: pi });
});

register('asteroid-blast', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Asteroid: 2 damage to a random enemy, plus any Bolide boosts
			execEffects(state, pi, [{ type: 'random-damage', value: 2 + (state.players[pi].asteroidBoost || 0), count: 1, pool: 'enemies' }], null, source);
});

register('blessing-dragon', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Paladin: shuffle two Emerald Portals into your deck (they summon an Imbue-cost minion when drawn)
			execEffects(state, pi, [{ type: 'shuffle-into-own-deck', id: 'edr_emerald_portal', count: 2 }], null, source);
});

register('clear-graveyards', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Farewell: exile every card in every graveyard
			for (const pl of state.players) { for (const c of pl.graveyard) { c.zone = 'exile'; pl.exile.push(c); } pl.graveyard = []; }
			emit(state, { type: 'graveyardsCleared', player: pi });
});

register('devastation', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Kronx Dragonhoof: approximate Galakrond's Devastation (deal 5 to all enemies)
			execEffects(state, pi, [{ type: 'damage', value: 5, target: 'enemy-creatures' }, { type: 'damage', value: 5, target: 'enemy-heroes' }], target, source);
});

register('lotus-shots', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lotus Troublemaker: one shot, plus one per 2 Mana spent while held
			const shots = 1 + Math.floor(((source && source._manaWhileHeld) || 0) / 2);
			execEffects(state, pi, [{ type: 'random-damage', value: 2, count: shots, pool: 'enemies' }], null, source);
});

register('invoke-galakrond', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Invoke Galakrond: power up your Galakrond (base -> upgraded at 2 -> maxed at 4)
			state.players[pi].galakrondInvokes = (state.players[pi].galakrondInvokes || 0) + 1;
			emit(state, { type: 'invokeGalakrond', player: pi, count: state.players[pi].galakrondInvokes });
});

register('hedra', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Hedra the Heretic: for each spell cast while holding this, summon a minion of that Cost
			for (const id of (source && source.spellsHeldIds) || []) {
				const cost = state.cardsById[id]?.cost || 0;
				execEffects(state, pi, [{ type: 'summon-random', cost }], null, source);
			}
});

register('discover-enemy-class-spell', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Hipster: Discover a spell from your opponent's class
			const foe = enemies[0];
			const cls = foe != null ? (state.players[foe].heroClass || state.players[foe].heroClasses?.[0] || 'mage') : 'mage';
			execEffects(state, pi, [{ type: 'discover', cardType: 'spell', cardClasses: [cls] }], null, source);
});

register('informant-discover', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Shadowed Informant: a spell from a (random) class each time
			const classes = ['mage', 'priest', 'rogue', 'druid', 'warlock', 'shaman', 'paladin', 'warrior', 'hunter'];
			execEffects(state, pi, [{ type: 'discover', cardType: 'spell', cardClasses: [classes[Math.floor(state.rng() * classes.length)]] }], null, source);
});

register('resummon-remembered-buffed', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Teron Gorefiend deathrattle: resummon the remembered minions with +1/+1
			for (const m of (source && source.rememberedMinions) || []) {
				const base = state.cardsById[m.id];
				const def = base ? JSON.parse(JSON.stringify(base)) : { id: 'token_' + (m.name || 'minion').toLowerCase().replace(/\W+/g, '_'), name: m.name, type: 'creature', cost: 0, token: true, rarity: 'common', tribe: m.tribe };
				def.attack = (m.attack || 0) + 1; def.health = (m.health || 0) + 1;
				summon(state, pi, def);
			}
});
