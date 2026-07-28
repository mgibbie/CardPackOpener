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
import {
	emit, instantiate, MAX_HAND, endTurn, gainTokenCard, execEffects, summon,
	installSecret, addCoin, damageHero, hp, availableMana, isDead,
	opponentsOf, freezeCreature, STARTING_LIFE, KW, MAX_BASE_MANA, CTHUN_BASE, MAX_HERO_POWERS, BOOST_TABLES,
	applyGift, schoolOf, recomputeAuras, sweepDeaths, counterStackEntry,
	findCreature, silenceCreature, isSpellType, heroAttackValue, fireOngoing,
	checkGameOver, questTick, disguiseCreature,
	spendMana, breakWeapon, resolveCombat, addCardToHand, syncCthun, degradeWeapon,
	runBattlecry, kindredActive, firePonder,
	applyRollEntry, targetSpec, legalTargets, runSpell,
	fireEmerge, staticValue, growBlubberBaron, queueAdapt, returnBlinked, has, MAX_SECRETS, destroyPermanent, findPermanent,
	EXCAVATE_TIERS, EXCAVATE_LEGENDARIES, ALL_AZERITE_LEGENDARIES,
} from '../../engine.js';
import { damageCreature, healHero } from '../damage.js';
import { gainArmor } from '../damage.js';
import { drawCards, toGraveyard, bouncePermanent } from '../zones.js';
import { runDeathrattle } from '../death.js';

const HANDLERS = new Map();

export function register(type, fn) {
	if (HANDLERS.has(type)) throw new Error(`effect handler '${type}' registered twice`);
	HANDLERS.set(type, fn);
}
export function getEffectHandler(type) {
	return HANDLERS.get(type);
}
// Abort sentinel: a handler returning ABORT stops the WHOLE effect list
// (velen-exiled-replay's game-over guard was a bare `return` from execEffects).
export const ABORT = Symbol('abort-effects');

// ---------- trigger-side registry (endgame II, PR 38) ----------
// runSecretEffects' 139-case switch, retired. Handlers get the TRIGGER
// context (ctx.self/minion/damaged/amount/...) plus the triggering() helper;
// bodies are the old case bodies verbatim inside do/while(false), so their
// `break` statements end the effect exactly like the old case breaks.
const TRIGGER_HANDLERS = new Map();
export function registerTrigger(type, fn) {
	if (TRIGGER_HANDLERS.has(type)) throw new Error(`trigger handler '${type}' registered twice`);
	TRIGGER_HANDLERS.set(type, fn);
}
export function getTriggerHandler(type) {
	return TRIGGER_HANDLERS.get(type);
}
export function registeredTriggerTypes() {
	return [...TRIGGER_HANDLERS.keys()];
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

// ---------- batch 3 (PR 19): 43 branches unlocked by ctx-threaded helpers ----------
// The handler ctx now carries execEffects' prelude closures (hm, pickEnemy,
// enemyHero, chosenCreature, healCreature, buffCreature, boost), so bodies
// that use them move verbatim like everything else.

register('install-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			installSecret(state, pi, e.id);
});

register('gain-coin', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			for (let n = 0; n < (e.value || 1); n++) addCoin(state, pi);
});

register('grant-static', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.static = { ...e.static };
});

register('temp-immune', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.immuneTurn = state.turnNumber;
});

register('grant-medic', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.medic = (t.medic || 0) + e.value;
});

register('draw-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = enemyHero();
			if (t != null) drawCards(state, t, e.value || 1);
});

register('next-secret-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSecretCost = e.value != null ? e.value : 1; // Kabal Lackey
});

register('grant-ongoing', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.ongoing = JSON.parse(JSON.stringify(e.ongoing));
});

register('eruption-upgrade', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.eruptionBonus = (p.eruptionBonus || 0) + 1; // Incindius
});

register('set-max-hand-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Valdris Felgorge: draw cards (our hand cap is already generous)
			drawCards(state, pi, e.draw || 4);
});

register('hatch-egg', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source?.hatchId && state.cardsById[source.hatchId]) summon(state, pi, state.cardsById[source.hatchId]);
});

register('leyline-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].leylineDiscount = (state.players[pi].leylineDiscount || 0) + (e.value || 1); // Ley Walker
});

register('leyline-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].leylineBoost = (state.players[pi].leylineBoost || 0) + (e.value || 1); // Mystic Runesaber
});

register('asteroid-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].asteroidBoost = (state.players[pi].asteroidBoost || 0) + (e.value || 1); // Bolide Behemoth
});

register('set-minion-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Loh the Living Legend: your minions cost (N) this game
			state.players[pi].minionCostSet = e.value ?? 5;
});

register('next-temp-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextTempDiscount = (state.players[pi].nextTempDiscount || 0) + (e.value || 2); // Spelunker
});

register('enemy-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Southsea Scoundrel: the opponent also draws
			for (const o of enemies) drawCards(state, o, e.value || 1);
});

register('attack-own-hero', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Malefic Rook: this minion attacks your own hero
			if (source) damageHero(state, pi, source.attack || 0, pi);
});

register('add-overload', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].overloadPending = (state.players[pi].overloadPending || 0) + (e.value || 1); // Winged Aberration
});

register('temp-crystal-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].tempCrystalNext = (state.players[pi].tempCrystalNext || 0) + (e.value || 1); // Emberscarred Whelp
});

register('jar-release', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._heldId && state.cardsById[source._heldId]) summon(state, pi, state.cardsById[source._heldId]);
});

register('godfrey-start', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Godfrey the Betrayer: end-of-turn overflow discards come back cheaper
			state.players[pi].godfreyReturn = true;
});

register('enable-attack-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Argent Watchman: may attack this turn despite Can't Attack
			if (source) source.attackAnywayTurn = state.turnNumber;
});

register('summon-marked-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source?.copyVictimId && state.cardsById[source.copyVictimId]) summon(state, pi, state.cardsById[source.copyVictimId]);
});

register('corrupt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// dies at the start of the caster's next turn (Corruption)
			const t = chosenCreature();
			if (t) t.corruptedBy = pi;
});

register('gain-corpses', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].corpses += e.value;
			emit(state, { type: 'corpses', player: pi, corpses: state.players[pi].corpses });
});

register('foreign-demon-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.foreignDemonDiscount = (p.foreignDemonDiscount || 0) + (e.value || 1); // Foreboding Flame
});

register('cant-attack-heroes-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Charged Devilsaur: this creature can't attack heroes this turn
			if (source) source.noHeroAttackTurn = state.turnNumber;
});

register('set-next-spell-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSpellDamageBonus = (state.players[pi].nextSpellDamageBonus || 0) + (e.value || 2); // Celestial Emissary
});

register('doom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// dies at the end of this turn (Power Overwhelming)
			const t = chosenCreature();
			if (t) t.doomTurn = state.turnNumber;
});

register('draw-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			for (let s2 = 0; s2 < state.players.length; s2++) {
				if (!state.players[s2].eliminated) drawCards(state, s2, e.value);
			}
});

register('coin-flip-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Pro Gamer: 50% chance to draw N (Rock-Paper-Scissors approximated)
			if (state.rng() < 0.5) drawCards(state, pi, e.value || 2);
});

register('ursoc-resurrect', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._ursocKills) for (const id of source._ursocKills) if (state.cardsById[id]) summon(state, pi, state.cardsById[id]);
});

register('set-self-hp-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Genn Greymane: your Hero Power costs (1) (a board aura via heroPowerCostSet)
			if (source) source.heroPowerCostSet = e.value ?? 1;
});

register('double-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) { t.attack += t.attack; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});

register('temp-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const pp = state.players[pi];
			pp.mana.bonus += e.value || 1;
			emit(state, { type: 'coin', player: pi, mana: availableMana(pp) });
});

register('grant-next-school-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Holy Cowboy: your next spell of a school costs less
			state.players[pi].nextSchoolDiscount = { school: e.school, amount: e.value || 2 };
});

register('draw-until-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			let guard = 20;
			while (p.hand.length < MAX_HAND && p.deck.length && guard-- > 0) drawCards(state, pi, 1);
});

register('next-name-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Murloc Rafaam: the next card matching a name costs less
			state.players[pi].nextNameDiscount = { substr: e.substr, value: e.value || 0 };
});

register('maybe-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Package Dealer: chance to draw another card (fires on card-drawn)
			if (state.rng() < (e.chance ?? 0.5)) drawCards(state, pi, e.value || 1);
});

register('load-bullets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gattlesnake: load N bullets onto this minion (fired by its Deathrattle)
			if (source) source.bullets = (source.bullets || 0) + (e.count || 2);
});

register('discount-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hunter's Call: cards in hand permanently cost (N) less
			for (const c of state.players[pi].hand) c.cost = Math.max(0, c.cost - (e.value || 1));
});

register('heal-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = e.target === 'self' ? source : chosenCreature(); // Stoneskin Gargoyle: restore self
			if (t && t.damage > 0) healCreature(t, t.damage);
});

// ---------- batch 4 (PR 20): 43 more (146 total) ----------

register('mark-doomed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voodoo Doll: remember a chosen creature; destroy it when this dies
			const t = chosenCreature();
			if (t && source) source.doomedUid = t.uid;
});

register('grant-double-turns', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Temporus: your opponent takes two turns, then you take two turns
			const o = enemies[0];
			if (o != null) state.forcedTurns = [o, o, pi, pi];
});

register('set-next-cards-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Scabbs Cutterbutter: your next N cards this turn cost less
			state.players[pi].nextCardsDiscount = { count: e.count || 2, amount: e.value || 2 };
});

register('set-next-spell-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Murkwater Scribe: your next spell costs less
			state.players[pi].nextSpellDiscount = (state.players[pi].nextSpellDiscount || 0) + (e.value || 1);
});

register('gain-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].mana.bonus += e.value;
			emit(state, { type: 'manaGained', player: pi, amount: e.value, mana: availableMana(state.players[pi]) });
});

register('set-next-draw-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// SI:7 Skulker: the next card you draw costs less
			state.players[pi].nextDrawDiscount = (state.players[pi].nextDrawDiscount || 0) + (e.value || 1);
});

register('gain-armor-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Scrap Golem: gain Armor equal to this minion's Attack
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) gainArmor(state, pi, amt);
});

register('set-next-weapon-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Space Pirate: your next weapon costs (N) less
			state.players[pi].nextWeaponDiscount = (state.players[pi].nextWeaponDiscount || 0) + (e.value || 1);
});

register('damage-target-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Aeon Reaver: deal damage to a minion equal to its own Attack
			const t = chosenCreature();
			if (t) damageCreature(state, t, t.attack || 0, source);
});

register('hero-temp-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const hta = e.heraldScaled ? hm() : e.value;
			state.players[pi].heroTempAttack += hta;
			emit(state, { type: 'heroBuffed', player: pi, amount: hta });
});

register('conjure-id-endturn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Everburning Phoenix: get another copy at the end of the turn
			const p = state.players[pi];
			(p.endTurnConjure = p.endTurnConjure || []).push(e.id);
});

register('mark-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mindflayer Kaahrj: remember a chosen creature; Deathrattle summons a copy
			const t = chosenCreature();
			if (t && source) source.copyVictimId = t.id;
});

register('set-next-minion-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hodir: set the stats of your next N minions
			state.players[pi].nextMinionStats = { count: e.count || 3, attack: e.attack || 8, health: e.health || 8 };
});

register('set-combo-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Foxy Fraud: your next Combo card this turn costs less
			state.players[pi].nextComboDiscount = (state.players[pi].nextComboDiscount || 0) + (e.value || 2);
});

register('set-cast-when-drawn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sheldras Moontree: the next N spells you draw are Cast When Drawn
			state.players[pi].castWhenDrawn = (state.players[pi].castWhenDrawn || 0) + (e.value || 3);
});

register('put-on-bottom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Azsharan Scavenger: put a card on the bottom of your deck (front of the array)
			for (let i = 0; i < (e.count || 1); i++) state.players[pi].deck.unshift(e.id);
});

register('set-choose-one-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Pride Seeker: your next Choose One card costs less
			state.players[pi].nextChooseOneDiscount = (state.players[pi].nextChooseOneDiscount || 0) + (e.value || 2);
});

register('random-effects', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// d4-roll hero powers: run one random option
			const opt = e.options[Math.floor(state.rng() * e.options.length)];
			execEffects(state, pi, opt, target, source);
});

register('grant-parity-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Thaddius: your odd/even-Cost cards cost less (swaps polarity each turn)
			state.players[pi].parityDiscount = { parity: e.parity || 'odd', amount: e.value || 2 };
});

register('grant-overload-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Inzah: for the rest of the game, your Overload cards cost less
			state.players[pi].overloadDiscount = (state.players[pi].overloadDiscount || 0) + (e.value || 1);
});

register('gain-heal-bonus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cleansing Cleric: your healing effects restore N more Health this game
			state.players[pi].healBonusGame = (state.players[pi].healBonusGame || 0) + (e.value || 2);
});

register('attack-equals-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) {
				t.attack = hp(t);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('reduce-libram-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Aldor Attendant / Aldor Truthseeker: your Librams cost less this game
			state.players[pi].libramDiscount = (state.players[pi].libramDiscount || 0) + (e.value || 1);
});

register('hero-power-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fencing Coach: your next Hero Power this turn costs less
			state.players[pi].heroPowerDiscountNext = (state.players[pi].heroPowerDiscountNext || 0) + (e.value || 0);
});

register('set-next-hero-power-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Daring Fire-Eater: your next Hero Power this turn deals more
			state.players[pi].heroPowerDamageNext = (state.players[pi].heroPowerDamageNext || 0) + (e.value || 2);
});

register('saruun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Saruun: Elementals in your deck gain Spell Damage +1 when drawn
			const p = state.players[pi];
			p.deckElementalSpellDamage = (p.deckElementalSpellDamage || 0) + 1;
});

register('buff-self-if-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mawsworn Bailiff: if you have N+ Armor, gain +X/+X
			if (source && (state.players[pi].armor || 0) >= (e.armor || 4)) buffCreature(source, e.attack || 0, e.health || 0);
});

register('heal-lock-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crater Gator: the enemy hero can't be healed until your next turn
			for (const o of enemies) state.players[o].healLockUntilTurn = state.turnNumber + state.players.length;
});

register('heal-hero-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Reno Jackson: restore your hero to full
			const p = state.players[pi];
			const full = p.maxLife ?? STARTING_LIFE;
			if (p.life < full) healHero(state, pi, full - p.life);
});

register('tax-enemy-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Loatheb: each opponent's spells cost more on their next turn
			for (const o of enemies) state.players[o].spellTaxNext = (state.players[o].spellTaxNext || 0) + (e.value || 0);
});

register('draw-if-self-didnt-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Astral Serpent: at end of turn, if this didn't attack, draw N (runs via turn-end ongoing)
			if (source && (source.attacksUsed || 0) === 0) drawCards(state, pi, e.value || 2);
});

register('freeze-gain-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sleet Skater: freeze an enemy minion, gain Armor equal to its Attack
			const t = chosenCreature();
			if (t) { freezeCreature(state, t); gainArmor(state, pi, t.attack || 0); }
});

register('launch-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// SCV / Concussive Shells / Salvage the Bunker: your next launch costs less
			const p = state.players[pi];
			p.nextLaunchDiscount = (p.nextLaunchDiscount || 0) + (e.value || 0);
});

register('tax-enemy-hero-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Saboteur: each opponent's Hero Power costs more next turn
			for (const o of enemies) state.players[o].heroPowerTaxNext = (state.players[o].heroPowerTaxNext || 0) + (e.value || 0);
});

register('buff-self-per-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Snakebite: gain +X/+X for each minion that died this turn
			const n = state.diedThisTurn || 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});

register('luck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// coin flip: heads runs the effects, tails fizzles
			if (state.rng() < 0.5) execEffects(state, pi, e.effects, target, source);
			else emit(state, { type: 'luckFail', player: pi });
});

register('skip-own-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Endtime Murozond: the opponent takes your next turn
			const foes = opponentsOf(state, pi);
			if (foes.length) state.forcedTurns = [...(state.forcedTurns || []), foes[0], foes[0]];
});

register('tax-enemy-battlecry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Boompistol Bully: enemy Battlecry cards cost more next turn
			for (const o of enemies) state.players[o].battlecryTaxNext = (state.players[o].battlecryTaxNext || 0) + (e.value || 5);
});

register('buff-hand-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Alliance Bannerman: give minions in your hand +X/+X
			for (const c of state.players[pi].hand) if (c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; }
});

register('gain-weapon-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const w = state.players[pi].weapon;
			if (w && source) {
				source.attack += w.attack;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});

register('draw-then', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// draw N; run `then` only if a card was actually drawn ("if you do")
			const n = drawCards(state, pi, scaled(e));
			if (n > 0 && e.then) execEffects(state, pi, e.then, target, source);
});

register('put-card-bottom-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Disposal Assistant: put a specific card on the bottom of your deck (front of array = bottom)
			const p = state.players[pi];
			if (e.id && state.cardsById[e.id]) p.deck.unshift(e.id);
});

register('draw-per-schools', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Multicaster: draw a card for each different spell school cast this game
			const n = Object.keys(state.players[pi].schoolsCastGame || {}).length;
			if (n > 0) drawCards(state, pi, n);
});

// ---------- batch 5 (PR 21): 40 more (186 total) ----------

register('dragons-rush', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].dragonsRush = true; // Ebyssian
			for (const c of state.players[pi].board) if ((c.tribe || '').includes('Dragon') && !c.keywords.includes('rush')) c.keywords.push('rush');
});

register('ship-random-gifts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Raven (Lift Off piece), when launched: the ship gains random Bonus Effects
			if (source) for (let gi = 0; gi < (e.count || 1); gi++) applyGift(state, source, undefined, { board: true });
});

register('buff-hand-double', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Emeriss: double Attack and Health of all creatures in your hand
			for (const c of state.players[pi].hand) if (c.type === 'creature') { c.attack += c.attack; c.maxHealth += c.maxHealth; }
});

register('reduce-hand-school-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cariel Roame: reduce the Cost of a spell school in your hand
			for (const c of state.players[pi].hand) if (schoolOf(c) === e.school) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});

register('buff-target-by-source-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Outfit Tailor: give a friendly minion +Attack/+Health equal to this minion's stats
			const t = chosenCreature();
			if (t && source) buffCreature(t, source.attack || 0, hp(source) || 0);
});

register('buff-next-summon-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Thornmantle Musician (Finale): the next minion of a tribe you summon gets +X/+X
			state.players[pi].nextTribeSummonBuff = { tribe: e.tribe, attack: e.attack || 1, health: e.health || 1 };
});

register('damage-self-per-enemy-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Witchwood Grizzly: lose 1 Health for each card in your opponent's hand
			const n = enemies.reduce((s, o) => s + state.players[o].hand.length, 0);
			if (n > 0) damageHero(state, pi, n, pi);
});

register('buff-self-by-hero-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fearless Flamejuggler: gain stats equal to the damage your hero took this turn
			const n = state.players[pi].heroDamageTakenThisTurn || 0;
			if (source && n > 0) buffCreature(source, n, n);
});

register('buff-self-per-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lawful Longarm: gain +N Attack for each card in your hand
			if (source) buffCreature(source, (e.attack || 1) * state.players[pi].hand.length, (e.health || 0) * state.players[pi].hand.length);
});

register('irida-void', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Irida: the deck departs to the Void
			const p = state.players[pi];
			p.voidPile = [...p.deck];
			p.deck = [];
			emit(state, { type: 'voidOpened', player: pi, count: p.voidPile.length });
});

register('double-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = e.target === 'self' ? source : chosenCreature(); // Faceless Lurker: this minion
			if (t) { t.maxHealth += hp(t); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});

register('grant-attack-while-alive', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rowdy Fan: chosen minion has +N Attack while the source is alive
			const t = chosenCreature();
			if (t && source) { source.aura = { targetUid: t.uid, attack: e.attack || 4 }; recomputeAuras(state); }
});

register('kiljaeden', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Kil'jaeden: your deck becomes an endless portal of ever-growing Demons
			const p = state.players[pi];
			p.kiljaeden = { bonus: 0 };
			p.deck = [];
			emit(state, { type: 'kiljaeden', player: pi });
});

register('set-next-spell-double', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSpellDoubleCast = true; // Electra Stormsurge
			if (e.count) state.players[pi].nextSpellDoubleCount = (state.players[pi].nextSpellDoubleCount || 0) + e.count; // Tyrande: next 3 spells
});

register('grant-tribe-summon-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Timewarden: until end of your next turn, minions of a tribe you summon gain keywords
			state.players[pi].tribeSummonBuff = { tribe: e.tribe, keywords: e.keywords || [], untilTurn: state.turnNumber + 2 };
});

register('trigger-deathrattles', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ragnaros: fire your creatures' Deathrattles without them dying
			for (const c of [...state.players[pi].board]) {
				if (!isDead(c) && c.deathrattle) execEffects(state, pi, c.deathrattle, null, c);
			}
});

register('arm-enemy-draw-punish', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ashen Elemental: the opponent's draws next turn deal damage to them
			for (const o of enemies) { state.players[o].drawPunishTurn = state.turnNumber + 1; state.players[o].drawPunishDamage = e.value || 2; }
});

register('grant-stealth-while-alive', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Obsessive Fan: chosen minion has Stealth while the source is alive
			const t = chosenCreature();
			if (t && source) { source.aura = { targetUid: t.uid, keywords: [KW.STEALTH] }; recomputeAuras(state); }
});

register('discount-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fire Plume Harbinger: reduce the Cost of a tribe's cards in your hand
			for (const c of state.players[pi].hand) if ((c.tribe || '').includes(e.tribe)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});

register('grant-self-endturn-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Partner in Crime: at end of your turn, summon a copy of this minion (one-shot)
			if (source) source.ongoing = { on: 'turn-end', once: true, effects: [{ type: 'summon-copy-of-self', count: e.count || 1 }] };
});

register('buff-self-per-combo-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rhyme Spinner: +X/+X for each other Combo card you've played this game
			const n = state.players[pi].combosPlayedGame || 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});

register('buff-next-drawn-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Beanstalk Brute (approx "top N minions in deck"): buff the next N minions you draw
			const p = state.players[pi];
			p.drawBuffMinions = { count: e.count || 3, attack: e.attack || 0, health: e.health || 0 };
});

register('grant-honorable-kill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wing Commander Mulverick: give your minions an Honorable Kill effect
			for (const c of state.players[pi].board) if (!isDead(c) && c.type !== 'location') c.honorableKill = JSON.parse(JSON.stringify(e.effects));
});

register('boost-parts-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xhilag: raise the damage of all its Stalks
			if (source) for (const c of state.players[pi].board) {
				if (!isDead(c) && c.colossalOf === source.name) c.partPower = (c.partPower || 2) + (e.amount || 1);
			}
});

register('reduce-hand-darkgift-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Overgrown Horror: reduce the Cost of minions in your hand with Dark Gifts
			for (const c of state.players[pi].hand) if (c._darkGift && c.type === 'creature') c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
});

register('discount-hand-mincost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Summer Flowerchild (Finale): reduce the Cost of expensive cards in your hand
			for (const c of state.players[pi].hand) if ((c.cost || 0) >= (e.minCost || 6)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});

register('make-dormant', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Maiev Shadowsong: send a chosen minion Dormant
			const t = chosenCreature();
			if (t) { t.dormantLeft = e.value || 2; emit(state, { type: 'dormant', player: t.controller, uid: t.uid, turns: t.dormantLeft }); }
});

register('grant-colossal-parts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hydralodon: give your appendages of this Colossal a keyword
			for (const c of state.players[pi].board) {
				if (c.colossalOf === source?.name && !c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
			}
});

register('eruption-blast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Eruption: 4 damage randomly split, +1 per upgrade
			const p = state.players[pi];
			execEffects(state, pi, [{ type: 'random-damage', value: 1, count: 4 + (p.eruptionBonus || 0), pool: 'enemies' }], null, source);
});

register('enemy-minion-tax-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Forensic Duster: the opponent's minions cost more on their next turn
			for (const o of enemies) { state.players[o].enemyMinionTaxTurn = state.turnNumber + 1; state.players[o].enemyMinionTaxAmount = e.value || 1; }
});

register('vistah-arm', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mistah Vistah: replay every spell cast between now and 3 of your turns from now
			const p = state.players[pi];
			p.vistahAt = state.turnNumber + 3 * state.players.length;
			p.vistahSpells = p.vistahSpells || [];
});

register('discount-foreign-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Leyline Manipulator: cheaper for cards that didn't start in your deck
			const p = state.players[pi];
			for (const c of p.hand) if (!c.fromDeck && c !== source) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
});

register('spend-corpses', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (p.corpses >= e.value) {
				p.corpses -= e.value;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
			}
});

register('blessing-moon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Priest: get a random Priest card; it costs (N) less
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			execEffects(state, pi, [{ type: 'conjure-random', cardClass: 'priest', costMod: -n }], null, source);
});

register('nethrek-check', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Chef Neth'rek, Start of Game: an all-(3)-or-less deck surges to 10 Mana on turn five
			const p = state.players[pi];
			if (p.deck.length && p.deck.every(id => (state.cardsById[id]?.cost || 0) <= 3)) p.manaSurgeIn = 5;
});

register('set-tribe-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Clownfish: your next N minions of a tribe cost less
			state.players[pi].nextTribeDiscount = { tribe: e.tribe, count: e.count || 2, amount: e.value || 2, overload: e.overload || 0 }; // Planetary Navigator adds Overload
});

register('alex-guardian', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Alexstrasza, Guardian of Life: Health to 15; full Health unleashes 15
			const p = state.players[pi];
			p.life = Math.min(p.life, 15);
			p.alexPayoff = true;
			emit(state, { type: 'life', player: pi, life: p.life });
});

register('double-self-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Soldier of the Bronze: double this minion's Health
			if (source && !isDead(source)) { source.maxHealth = (source.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});

register('store-deck-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Enthusiastic Banker: move a card from your deck onto this minion's stash
			if (source && state.players[pi].deck.length) { const id = state.players[pi].deck.pop(); (source.storedCards = source.storedCards || []).push(id); }
});

register('counter-stack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cryptic Command's counter mode: counter the topmost spell now on the stack
			const top = [...state.stack].reverse().find(en => en.kind === 'spell' && !en.countered);
			if (top) counterStackEntry(state, top, 'graveyard');
});

// ---------- dup retirement (PR 22): the four double-branch types ----------
// Each had TWO chain branches (first-wins); the winners move here verbatim
// and both branches are deleted. One shadowed variant was a real card bug
// (Echoing Ooze exact copies) and is revived behind e.exact.

register('double-attack-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// LIVE first-wins semantics kept: plain double, any zone (works from hand).
	// Retired dead twin: a guarded buffCreature rewrite (doubleBuffs/statGain
	// riders would have applied) that never executed.
			if (source) { source.attack *= 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});

register('summon-self-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// exact:true — the retired second branch's semantics, previously SHADOWED:
	// a copy carrying the source's CURRENT stats/keywords (Echoing Ooze says
	// "an exact copy"; hand-buffed stats now carry over). End-of-turn timing
	// remains approximated as immediate, unchanged.
	if (e.exact) {
				// Echoing Ooze: a copy carrying this creature's CURRENT stats/keywords
				if (source) summon(state, pi, { id: source.id, name: source.name, type: 'creature',
					cost: source.cost || 0, rarity: source.rarity || 'common', token: true, tribe: source.tribe || '',
					attack: source.attack, health: source.maxHealth, keywords: [...(source.keywords || [])],
					description: source.description || '' });
		return;
	}
			// Saronite Chain Gang / Doppelgangster: fresh copies of the played minion
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
});

register('gain-weapon-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// LIVE semantics kept (board+alive guard); the dead twin was identical
	// minus the guard.
			// Phantom Freebooter: gain +Attack/+Health equal to your weapon's stats
			if (source && source.zone === 'board' && !isDead(source)) {
				const w = state.players[pi].weapon;
				if (w) buffCreature(source, w.attack || 0, w.durability || 0);
			}
});

register('destroy-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// LIVE semantics kept (ifAlone option; sweep deferred to the caller like
	// every other chain effect). The dead twin swept immediately.
			// Anima Golem: destroy the source (optionally only if it's your only creature)
			if (source && source.zone === 'board' && !isDead(source)) {
				const alone = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location').length === 0;
				if (!e.ifAlone || alone) {
					source.damage = source.maxHealth;
					source.shield = false;
					emit(state, { type: 'destroy', uid: source.uid });
				}
			}
});

// ---------- batch 6 (PR 23): 44 more (234 total) ----------

register('destroy-marked', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voodoo Doll's Deathrattle
			if (source?.doomedUid != null) { const t = findCreature(state, source.doomedUid); if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); } }
});

register('summon-random-armor-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Geosculptor Yip: summon a random creature costing exactly your Armor (cap 10)
			const cost = Math.min(e.max ?? 10, state.players[pi].armor || 0);
			execEffects(state, pi, [{ type: 'summon-random', cost }], target, source);
});

register('repeat-last-battlecry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Brilliant Macaw: replay the last Battlecry you played
			const lb = state.players[pi].lastBattlecryThisGame;
			if (lb && lb.effects) execEffects(state, pi, JSON.parse(JSON.stringify(lb.effects)), lb.target || null, source);
});

register('lock-minion-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Annoying Fan: chosen minion can't attack while the source is alive
			const t = chosenCreature();
			if (t && source) { t.cantAttackWhile = source.uid; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});

register('summon-for-player', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// helper: summon a token for a specific player (used by Blightfang's granted deathrattle)
			const owner = e.player != null ? e.player : pi;
			if (state.cardsById[e.summonId]) summon(state, owner, state.cardsById[e.summonId]);
});

register('buff-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const w = state.players[pi].weapon;
			if (w) {
				w.attack += e.attack || 0;
				w.durability += e.durability || 0;
				emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
			}
});

register('heal-self-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Relentless Worg: restore the source to full Health
			if (source && !isDead(source)) { source.damage = 0; source.tempHealth = 0; emit(state, { type: 'heal', targetType: 'creature', uid: source.uid, amount: 0, hp: hp(source) }); }
});

register('portal-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Emerald Portal (drawTrigger): summon a random minion costing your Imbue count
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			execEffects(state, pi, [{ type: 'summon-random', cost: Math.min(n, 10) }], null, source);
});

register('destroy-and-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Moat Lurker: destroy a creature; its Deathrattle brings it back
			const t = chosenCreature();
			if (t && source) { source.moatVictim = t.id; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
});

register('damage-enemies-per-counter', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Omen's Deathrattle: 1 damage to all enemies, +1 per attack it made
			const v = (e.value || 1) + ((source && source[e.key || '_grew']) || 0);
			execEffects(state, pi, [{ type: 'damage', value: v, target: 'enemies' }], null, source);
});

register('repeat-first-battlecry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bolner Hammerbeak: replay the first Battlecry played this turn
			const fb = state.players[pi].firstBattlecryThisTurn;
			if (fb && fb.effects) execEffects(state, pi, JSON.parse(JSON.stringify(fb.effects)), fb.target || null, source);
});

register('heal-by-self-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Amber Priestess: restore Health equal to this minion's Health
			const v = source ? Math.max(0, source.maxHealth - source.damage) : (e.value || 4);
			execEffects(state, pi, [{ type: 'heal', value: v, target: 'any' }], target, source);
});

register('add-remembered-discard', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Expired Merchant's Deathrattle: add copies of the discarded card
			if (source?.discardedId && state.cardsById[source.discardedId]) execEffects(state, pi, [{ type: 'add-card', id: source.discardedId, count: e.count || 2 }], target, source);
});

register('buff-friendly-attack-filter', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Busy-Bot: give your minions with N Attack +X/+X
			for (const c of state.players[pi].board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.attack || 0) === (e.attackEquals ?? 1)) buffCreature(c, e.attack || 1, e.health || 1);
});

register('summon-copy-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Animated Avalanche: summon a copy of this minion (count copies — Zixor Prime)
			if (source) { const base = state.cardsById[source.id]; if (base) for (let n = 0; n < (e.count || 1); n++) summon(state, pi, JSON.parse(JSON.stringify(base))); }
});

register('swap-hand-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Reflecto Engineer: swap Attack and Health of all minions in both hands
			for (const pl of state.players) for (const c of pl.hand) if (c.type === 'creature') { const a = c.attack || 0, h2 = c.maxHealth || 0; c.attack = h2; c.maxHealth = a; }
});

register('set-deck-top-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Twilight Medium: set the Cost of the top card of your deck to a value
			const p = state.players[pi];
			if (p.deck.length) { p.deckCostOverrides = p.deckCostOverrides || {}; p.deckCostOverrides[p.deck[p.deck.length - 1]] = (e.value || 0); }
});

register('fire-bullets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gattlesnake Deathrattle: fire each loaded bullet at a random enemy
			const n = (source && source.bullets) || 0;
			if (n > 0) execEffects(state, pi, [{ type: 'random-damage', value: e.value || 1, count: n, pool: 'enemies' }], null, source);
});

register('draw-set-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bright-Eyed Scout: draw a card and change its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.cost = e.cost;
});

register('destroy-own-deck-gain-immune', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// The Jailer: destroy your deck; this minion gains Immune
			const p = state.players[pi];
			p.deck = [];
			if (source && !source.keywords.includes(KW.IMMUNE)) source.keywords.push(KW.IMMUNE);
			emit(state, { type: 'shuffle', player: pi });
});

register('resummon-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Moat Lurker's Deathrattle (count>1: Carnivorous Cube summons 2 copies)
			if (source?.moatVictim && state.cardsById[source.moatVictim]) {
				for (let i = 0; i < (e.count || 1); i++) summon(state, pi, state.cardsById[source.moatVictim]);
			}
});

register('silence-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dalaran Librarian: silence the creatures flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb)) silenceCreature(state, nb);
});

register('heal-per-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cult Apothecary: restore N to your hero for each enemy creature
			const n = enemies.reduce((s, o) => s + state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
			if (n > 0) healHero(state, pi, (e.value || 0) * n);
});

register('equip-self-as-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Remornia (approx): after attacking, equip a weapon with this minion's Attack
			if (source) execEffects(state, pi, [{ type: 'equip', name: e.name || 'Remornia', attack: source.attack || e.attack || 5, durability: e.durability || 1 }], null, source);
});

register('silence-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Showstopper: Silence every minion on the board (exceptSource -> Smothering Starfish)
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location' && !(e.exceptSource && c === source)) silenceCreature(state, c);
});

register('draw-to-match', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Divine Favor: draw until your hand matches an opponent's
			const victim = enemyHero();
			if (victim != null) {
				const diff = state.players[victim].hand.length - state.players[pi].hand.length;
				if (diff > 0) drawCards(state, pi, diff);
			}
});

register('copy-enemy-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Horde Operative: copy the opponent's Secrets and put them into play
			for (const o of enemies) for (const sec of [...state.players[o].secrets]) { if (state.players[pi].secrets.length < 5 && state.cardsById[sec.id]) installSecret(state, pi, sec.id); }
});

register('damage-per-cards-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Spectral Pillager: deal `value` to a chosen creature for each OTHER card played this turn
			const t = chosenCreature();
			const n = state.players[pi].cardsPlayedThisTurn || 0;
			if (t && n > 0) damageCreature(state, t, (e.value || 1) * n, source);
});

register('reduce-deck-keyword-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rotten Rodent: cards with a keyword drawn from your deck cost less
			const p = state.players[pi];
			p.deckKeywordDiscount = p.deckKeywordDiscount || {};
			p.deckKeywordDiscount[e.keyword] = (p.deckKeywordDiscount[e.keyword] || 0) + (e.value || 1);
});

register('reorder-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lorekeeper Polkelt: order your deck highest Cost -> lowest (draws pop the top/end)
			const p = state.players[pi];
			p.deck.sort((a, b) => (state.cardsById[a]?.cost || 0) - (state.cardsById[b]?.cost || 0)); // ascending: pop() draws the highest first
});

register('shade-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Enthralled Shade: enemy-copied cards in hand get cheaper
			const p = state.players[pi];
			for (const c of p.hand) if (c._copiedFromEnemy && (c.cost || 0) > 0) { c.cost -= 1; emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
});

register('buff-self-per-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Power Slider: +X/+X for each distinct minion type you've played this game
			const n = state.players[pi].tribesPlayedGame ? state.players[pi].tribesPlayedGame.size : 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});

register('infinity-restore', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._infUid != null) {
				const c = p.hand.find(x => x.uid === source._infUid);
				if (c) { c.cost = source._infCost || 0; emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			}
});

register('resurrect-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Kel'Thuzad: summon all your creatures that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.slice();
			p.diedThisTurnIds = [];
			for (const id of ids) { const def = state.cardsById[id]; if (def) summon(state, pi, def); }
});

register('destroy-and-selfdamage-by-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Riftcleaver: destroy a creature; your hero takes damage equal to its Health
			const t = chosenCreature();
			if (t) { const h = hp(t); t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); damageHero(state, pi, h, pi); }
});

register('draw-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Platysaur: draw a card and remember it for the Deathrattle discard
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			if (source && p.hand.length > before) source._rememberUid = p.hand[p.hand.length - 1].uid;
});

register('illusion-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bloodthistle Illusionist: a copy appears; one of the two is secretly fake
			if (source && state.cardsById[source.id]) {
				const cp = summon(state, pi, state.cardsById[source.id]);
				if (cp) { (state.rng() < 0.5 ? cp : source).illusion = true; }
			}
});

register('copy-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Unearthed Raptor: gain a copy of a chosen friendly minion's Deathrattle
			const c = chosenCreature();
			if (c && c.deathrattle && source) {
				source.deathrattle = [...(source.deathrattle || []),
					...JSON.parse(JSON.stringify(c.deathrattle))];
			}
});

register('spark', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// target 'all' = every player sparks (always beneficial, so auto-taken)
			const seats = e.target === 'all' ? state.players.map((_, s2) => s2) : [pi];
			for (const s2 of seats) { state.players[s2].sparked = true; emit(state, { type: 'sparked', player: s2 }); }
});

register('fatigue-self-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Baritone Imp: take Fatigue damage, gain that much Attack and Health
			const p = state.players[pi];
			const amt = (p.fatigue || 0) + 1;
			p.fatigue = amt;
			damageHero(state, pi, amt, pi);
			if (source && !isDead(source)) buffCreature(source, amt, amt);
});

register('buff-self-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fireguard Destroyer: gain a random amount of Attack in [min,max]
			if (source && source.zone === 'board' && !isDead(source)) {
				const [lo, hi] = e.range || [1, 1];
				buffCreature(source, lo + Math.floor(state.rng() * (hi - lo + 1)), e.health || 0);
			}
});

register('awaken-imprisoned', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._imprisonedUid != null) {
				const t = findCreature(state, source._imprisonedUid);
				if (t && t.dormantLeft > 9000) { t.dormantLeft = 0; t.sick = true; emit(state, { type: 'awaken', player: t.controller, uid: t.uid, name: t.name }); }
			}
});

register('armor-per-wisp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Merry Moonkin: armor improved by Wisps you control
			const p = state.players[pi];
			const wisps = p.board.filter(c => (c.name || '') === 'Wisp' && !isDead(c)).length;
			execEffects(state, pi, [{ type: 'armor', value: (e.value || 1) + wisps }], null, source);
});

register('imprison', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Timeway Warden: the chosen enemy sleeps until this dies
			const t = chosenCreature();
			if (t && source) {
				t.dormantLeft = 9999;
				source._imprisonedUid = t.uid;
				emit(state, { type: 'dormant', player: t.controller, uid: t.uid, turns: 9999 });
			}
});

// ---------- batch 7 (PR 24): 45 more (279 total) ----------

register('shuffle-enemy-hand-card-choose', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ghastly Gravedigger: if you control a Secret, shuffle a chosen card from the opponent's hand into their deck
			if (e.requireSecret && !state.players[pi].secrets.length) return;
			execEffects(state, pi, [{ type: 'shuffle-enemy-hand-card' }], null, source);
});

register('grant-next-class-free', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blood Crusader: your next minion of a class this turn costs Health instead of Mana (approximated as free)
			state.players[pi].nextClassFree = e.cardClass;
			state.players[pi]._classFreeGrantedThisPlay = true; // don't let the granting card consume its own grant
});

register('nethrandamus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nethrandamus: X grows with every friendly death this game
			const p = state.players[pi];
			const x = Math.min(10, Math.max(1, Math.floor((p.friendlyDeaths || 0) / 2) + 1));
			execEffects(state, pi, [{ type: 'summon-random', cost: x, count: 2 }], null, source);
});

register('buff-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voidgill: give all minions of a tribe in your hand +X/+X
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) { c.attack = (c.attack || 0) + (e.attack || 0); c.maxHealth = (c.maxHealth || 0) + (e.health || 0); }
});

register('leech-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.leechBoost = (p.leechBoost || 0) + (e.value || 1); // Hideous Husk
			for (const c of p.board) if (c.name === 'Leech' && !isDead(c)) { c.attack += e.value || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});

register('gain-armor-per', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Drywhisker Armorer: gain Armor scaled by a count
			let n = 0;
			if (e.per === 'enemy-creatures') for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length;
			if (n > 0) gainArmor(state, pi, (e.value || 1) * n);
});

register('reduce-rightmost-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nightmare Dragonkin: reduce the Cost of the right-most card in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source);
			if (pool.length) { const c = pool[pool.length - 1]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
});

register('spend-corpses-heal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Maw and Paw: spend N Corpses to restore Health to your hero
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 5)) { p.corpses -= (e.cost || 5); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); healHero(state, pi, e.value || 5); }
});

register('draw-to', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// draw until you hold N cards
			const p = state.players[pi];
			let guard = 20;
			while (p.hand.length < e.value && guard-- > 0) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length === before) break; // nothing left to draw
			}
});

register('cast-absorbed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crackling Cloudstrider's Deathrattle: cast the spell it swallowed
			if (source && source._absorbedId) {
				const def = state.cardsById[source._absorbedId];
				if (def && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
			}
});

register('set-life-to-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// High Priest Thekal: convert all but 1 Health into Armor
			const p = state.players[pi];
			const conv = Math.max(0, p.life - 1);
			p.life -= conv; gainArmor(state, pi, conv);
			emit(state, { type: 'damage', targetType: 'hero', player: pi, amount: 0, life: p.life });
});

register('cenarius-thrice', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Forest Lord Cenarius: three sequential picks between his two boons
			for (let n = 0; n < 3; n++) {
				state.pickQueue.push({ player: pi, ids: ['cenarius_might', 'cenarius_ancient'], cenarius: true });
			}
			emit(state, { type: 'pickStart', player: pi, count: 2 });
});

register('draw-stilt-reward', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Stiltstepper: draw a card; if you play it this turn, give your hero +N Attack
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.stiltReward = e.value || 4;
});

register('freeze-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// freeze a random unfrozen enemy creature
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && !c.frozen) pool.push(c);
			}
			if (pool.length) freezeCreature(state, pool[Math.floor(state.rng() * pool.length)]);
});

register('summon-with-gifts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Tyrannogill: summon N tokens, each with its own random Bonus Effect
			for (let n = 0; n < (e.count || 1); n++) {
				const c = state.cardsById[e.summonId] ? summon(state, pi, state.cardsById[e.summonId]) : null;
				if (c) applyGift(state, c, null, { board: true });
			}
});

register('discover-target-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Amalgam of the Deep: discover a minion of the chosen friendly minion's type
			const t = chosenCreature();
			const tribe = t && (t.tribe || '').split('/')[0];
			execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: tribe || undefined }], null, source);
});

register('set-lackey-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dark Pharaoh Tekahn: for the rest of the game, your Lackeys are N/N
			state.players[pi].lackeyBuff = e.value || 4;
			for (const c of state.players[pi].hand) if (typeof c.id === 'string' && c.id.startsWith('lackey_')) { c.attack = e.value || 4; c.maxHealth = e.value || 4; }
});

register('fireworks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fireworks Tech: give a chosen friendly Mech +1/+1; if it has a Deathrattle, trigger it
			const t = chosenCreature();
			if (t) {
				buffCreature(t, e.attack || 1, e.health || 1);
				if (t.deathrattle && t.deathrattle.length) runDeathrattle(state, t.controller, t);
			}
});

register('destroy-friendly-by-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Terrible Chef: destroy a friendly minion of a given id (the Egg it summoned)
			const t = state.players[pi].board.find(c => c.id === e.id && !isDead(c));
			if (t) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
});

register('fill-board-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hir'eek, the Bat: fill your board with copies of this creature
			const p = state.players[pi];
			const def = source && (state.cardsById[source.id] || source);
			if (def) while (p.board.filter(c => !isDead(c)).length < 7) { const c = summon(state, pi, def); if (!c) break; }
});

register('awaken-darkness', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// The Darkness's Candle: wake any dormant Darkness on the board
			for (const pl of state.players) for (const c of pl.board) {
				if (c.name === 'The Darkness' && c.dormantLeft > 0) { c.dormantLeft = 0; emit(state, { type: 'awaken', uid: c.uid, player: c.controller }); }
			}
});

register('draw-free', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wondrous Wand: draw N cards, they cost (0)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 3); n++) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length > before) { const c = p.hand[p.hand.length - 1]; c.cost = 0; }
			}
});

register('reduce-deck-minions-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Vanndar Stormpike: reduce the Cost of minions in your hand and deck
			const p = state.players[pi];
			for (const c of p.hand) if (c.type === 'creature') c.cost = Math.max(0, (c.cost || 0) - (e.value || 3));
			p.deckMinionDiscount = (p.deckMinionDiscount || 0) + (e.value || 3);
});

register('summon-deathrattle-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// N'Zoth: summon your Deathrattle creatures that died this game
			const p = state.players[pi];
			for (const id of p.deathLogIds) {
				const def = state.cardsById[id];
				if (def?.type === 'creature' && (def.keywords || []).includes('deathrattle')) summon(state, pi, def);
			}
});

register('destroy-soul-fragment', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// generic: destroy a Soul Fragment in your deck (heals 2), then run `then`
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) { p.deck.splice(fi, 1); healHero(state, pi, 2); if (e.then) execEffects(state, pi, e.then, target, source); }
});

register('tocha-42', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mystified Tocha: if combined hero Health is exactly 42, set yours to 42
			const p = state.players[pi];
			const total = state.players.reduce((s, pl) => s + (pl.eliminated ? 0 : pl.life), 0);
			if (total === 42) { p.life = 42; emit(state, { type: 'life', player: pi, life: 42 }); }
});

register('grant-next-outcast-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fierce Outsider (Outcast): your next Outcast card costs less
			state.players[pi].nextOutcastDiscount = (state.players[pi].nextOutcastDiscount || 0) + (e.value || 1);
			state.players[pi]._outcastDiscountGrantedThisPlay = true; // don't let the granting card consume its own discount
});

register('summon-random-discarded', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cruel Dinomancer: summon a random creature you discarded this game
			const p = state.players[pi];
			const ids = p.discardLogIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
});

register('spend-mana-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lost Exarch: spend all your remaining Mana, summon that many tokens
			const p = state.players[pi];
			const n = availableMana(p);
			p.mana.cur = 0; p.mana.bonus = 0;
			for (let i = 0; i < n; i++) { if (state.cardsById[e.summonId]) summon(state, pi, state.cardsById[e.summonId]); }
});

register('reduce-highest-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shivering Sorceress: reduce the Cost of the highest-Cost spell in your hand
			let best = null; for (const c of state.players[pi].hand) if (isSpellType(c) && (!best || (c.cost || 0) > (best.cost || 0))) best = c;
			if (best) best.cost = Math.max(0, (best.cost || 0) - (e.value || 1));
});

register('destroy-self-gain-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gurubashi Offering: at the start of your turn, destroy this and gain Armor
			if (source && source.zone === 'board' && !isDead(source)) { source.damage = source.maxHealth; source.shield = false; emit(state, { type: 'destroy', uid: source.uid }); }
			gainArmor(state, pi, e.value || 8);
});

register('discard-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._rememberUid != null) {
				const hi = p.hand.findIndex(c => c.uid === source._rememberUid);
				if (hi >= 0) { const [c] = p.hand.splice(hi, 1); toGraveyard(state, pi, c); emit(state, { type: 'discard', player: pi, card: c }); }
			}
});

register('bwonsamdi-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bwonsamdi's Deathrattle: a random minion whose Cost grows with his Boons
			const p = state.players[pi];
			p.bwonsamdiDied = true;
			const cost = 4 + ((p.bwonsamdiBoons && p.bwonsamdiBoons.costBonus) || 0);
			execEffects(state, pi, [{ type: 'summon-random', cost }], null, source);
});

register('haunt-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Haunting Nightmare: mark a random card in your hand; playing it summons a token
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && !c.hauntSummon);
			if (pool.length) pool[Math.floor(state.rng() * pool.length)].hauntSummon = e.summonId || 'rlk_soldier';
});

register('nightmare-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nightmare: +5/+5 now, destroyed at the start of your next turn
			const t = chosenCreature();
			if (t) {
				t.attack += 5; t.maxHealth += 5;
				t._doomAtTurn = state.turnNumber + state.players.length;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('set-own-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Audio Amplifier: set your maximum Mana (hand-size cap approximated by MAX_HAND)
			const p = state.players[pi];
			if (p.mana) { p.mana.max = e.value || 11; p.mana.cur = Math.min(p.mana.cur, p.mana.max); emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(p) }); }
});

register('set-target-stats-from-source', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Toy Captain Tarim: set a minion's Attack and Health to this minion's
			const t = chosenCreature();
			if (t && source) { t.attack = source.attack || 0; t.maxHealth = hp(source) || 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});

register('summon-random-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Onyx Bishop: resurrect a random friendly creature that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
});

register('air-support', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Air Support: Mega-Windfury, but never at heroes
			const t = chosenCreature();
			if (t) {
				t.megaWindfury = true; t.noFace = true;
				if (!t.keywords.includes('windfury')) t.keywords.push('windfury');
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('set-weapon-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Swarthy Swordshiner: set your weapon's Attack and Durability
			const w = state.players[pi].weapon;
			if (w) { w.attack = e.attack ?? w.attack; w.durability = e.durability ?? w.durability; emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability }); }
});

register('destroy-all-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gigafin: destroy all enemy minions (spit-back simplified away)
			for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			sweepDeaths(state);
});

register('infinitize', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// P.M.M. Infinitizer: set a friendly minion to 8/8; it can't hit heroes this turn
			const t = chosenCreature();
			if (t) {
				t.attack = 8; t.maxHealth = 8; t.damage = 0;
				t.noFaceTurn = state.turnNumber;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('double-self-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Immortal: double this minion's Attack and Health (the 4-Mana cost is not modeled)
			if (source && !isDead(source)) { source.attack = (source.attack || 0) * 2; source.maxHealth = (source.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});

register('set-deck-bottom-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Krona, Keeper of Eons: set the Costs of the bottom N cards of your deck (front of array = bottom)
			const p = state.players[pi];
			p.deckCostOverrides = p.deckCostOverrides || {};
			for (let i = 0; i < (e.count || 5) && i < p.deck.length; i++) p.deckCostOverrides[p.deck[i]] = (e.value ?? 1);
});

register('hero-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// give your hero +N Attack this turn (Soulshard Lapidary)
			state.players[pi].heroTempAttack += e.value || 0;
			emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(state.players[pi]) });
			if ((e.value || 0) > 0) fireOngoing(state, pi, 'hero-gained-attack', {}); // Wickerclaw
});

// ---------- batch 8 (PR 25): 45 more (324 total) ----------

register('summon-if-control', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hydralodon Head deathrattle: only summons more if the parent survives
			const held = state.players[pi].board.some(c => !isDead(c) && c.name === e.ifControl);
			if (held) {
				const def = state.cardsById[e.id];
				if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
			}
});

register('gain-armor-no-trigger', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Razorfen Rockstar payoff: add armor WITHOUT re-firing armor-gained (avoids self-loop)
			const p = state.players[pi];
			p.armor += e.value || 2;
			p.armorGainedGame = (p.armorGainedGame || 0) + (e.value || 2);
			emit(state, { type: 'armor', player: pi, amount: e.value || 2, armor: p.armor });
});

register('cast-secret-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sparkjoy Cheat: cast a Secret from your hand (install it), then run `then`
			const p = state.players[pi];
			const si = p.hand.findIndex(c => c.secret);
			if (si >= 0) { const [c] = p.hand.splice(si, 1); installSecret(state, pi, c.id); if (e.then) execEffects(state, pi, e.then, target, source); }
});

register('fill-hand-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Halazzi, the Lynx: fill your hand with a token
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			while (def && p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
});

register('copy-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Faceless Shambler: copy a friendly creature's Attack and Health
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				source.attack = t.attack;
				source.maxHealth = t.maxHealth;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});

register('buff-hand-tribe-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Snapdragon: give all minions with a keyword in your hand +X/+X (deck approximated as hand)
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.keywords || []).includes(e.keyword)) { c.attack = (c.attack || 0) + (e.attack || 0); c.maxHealth = (c.maxHealth || 0) + (e.health || 0); }
});

register('blessing-golem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Druid: summon an N/N Plant Golem (N = Imbue count)
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			summon(state, pi, { id: 'token_plant_golem', name: 'Plant Golem', type: 'creature', cost: 0, token: true, rarity: 'common', attack: n, health: n, description: `A ${n}/${n} Plant Golem.` });
});

register('reduce-random-hand-minion-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dreampetal Florist: cheapen a random creature in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (c.cost || 0) > 0);
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
});

register('destroy-friendly-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ravenous Kraken: destroy a chosen friendly minion and remember it for a Deathrattle summon
			const t = chosenCreature();
			if (t && t.controller === pi && source) { source.rememberedId = t.id; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
});

register('grant-free-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Anub'Rekhan: your next N minions this turn cost Armor instead of Mana (approximated as free)
			state.players[pi].freeMinionsCount = (state.players[pi].freeMinionsCount || 0) + (e.count || 3);
			state.players[pi]._freeMinionGrantedThisPlay = true; // don't let the granting minion consume its own charge
});

register('reduce-hand-edges-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wayward Sage: reduce the Cost of the left- and right-most cards in your hand
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			for (const c of [...new Set([others[0], others[others.length - 1]])].filter(Boolean)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});

register('betrayal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// the chosen enemy stabs its own neighbors
			const t = chosenCreature();
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				for (const nb of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					damageCreature(state, nb, t.attack, t);
				}
			}
});

register('crewmate-adjoin', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crewmates: summon every Crewmate adjoining this one (a run at the top of your deck)
			const p = state.players[pi];
			while (p.deck.length && ((state.cardsById[p.deck[p.deck.length - 1]]?.name) || '').includes('Crewmate')) {
				const id = p.deck.pop();
				summon(state, pi, state.cardsById[id]);
			}
});

register('blessing-wisp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mage: summon a Wisp, deal N damage split among enemies
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			if (state.cardsById['edr_wisp']) summon(state, pi, state.cardsById['edr_wisp']);
			execEffects(state, pi, [{ type: 'random-damage', value: 1, count: n, pool: 'enemies' }], null, source);
});

register('reduce-corrupt-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dark Inquisitor Xanesh: your Corrupt/Corrupted cards cost less (hand now, deck on draw)
			const p = state.players[pi];
			for (const c of p.hand) if (c.corrupt || c.corruptGrow) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
			p.corruptDeckDiscount = (p.corruptDeckDiscount || 0) + (e.value || 2);
});

register('swap-deck-tops', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mischief Maker: swap the top card of your deck with your opponent's
			const o = enemies[0], mp = state.players[pi];
			if (o != null && mp.deck.length && state.players[o].deck.length) {
				const a = mp.deck.pop(), b = state.players[o].deck.pop();
				mp.deck.push(b); state.players[o].deck.push(a);
			}
});

register('blight-shuffle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Disguised Doctor: Blights hide in your deck and bite when drawn
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 4); n++) p.deck.push('blight');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
});

register('set-hero-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const who = e.target === 'self' ? pi : (target?.type === 'hero' ? target.player : enemyHero()); // Majordomo: your own hero
			if (who != null) {
				state.players[who].life = e.value;
				emit(state, { type: 'heal', targetType: 'hero', player: who, amount: 0, life: e.value });
				checkGameOver(state);
			}
});

register('swap-self-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sentient Hourglass: swap this minion's Attack and Health
			if (source && !isDead(source)) { const a = source.attack || 0, h = hp(source); source.attack = h; source.maxHealth = a; source.damage = 0; source.tempHealth = 0; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});

register('summon-copies-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Madam Goya: summon every copy of a chosen friendly creature from your deck
			const t = chosenCreature();
			const p = state.players[pi];
			if (t) {
				const rest = [];
				for (const id of p.deck) { if (id === t.id) summon(state, pi, state.cardsById[id]); else rest.push(id); }
				p.deck = rest;
			}
});

register('summon-copy-per-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dragon Golem: summon a copy of this for each minion of a tribe in your hand
			const n = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes(e.tribe)).length;
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < n; i++) summon(state, pi, def);
});

register('destroy-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Azari, the Devourer: destroy your opponent's deck (Omen of the End: only the top N)
			for (const o of enemies) { if (e.count != null) { for (let n = 0; n < e.count; n++) { const id = state.players[o].deck.pop(); if (!id) break; } } else state.players[o].deck = []; }
			emit(state, { type: 'deckDestroyed' });
});

register('summon-per-enemy-bomb', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blastmaster Boom: summon `per` Boom Bots for each Bomb in enemy decks
			let bombs = 0;
			for (const o of enemies) bombs += state.players[o].deck.filter(id => id === 'bomb').length;
			const def = state.cardsById['boom_bot'];
			if (def) for (let n = 0; n < bombs * (e.per || 1); n++) summon(state, pi, def);
});

register('invoke', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Descent of Dragons: Invoke Galakrond (tracked as a counter; grants a small bonus)
			const p = state.players[pi];
			p.invokeCount = (p.invokeCount || 0) + (e.times || 1);
			if (source && source.zone === 'board' && !isDead(source) && (e.attack || e.health)) buffCreature(source, e.attack || 0, e.health || 0);
});

register('reduce-hand-tribe-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Soridormi's awakening: Dragons in hand cost (4) less
			const p = state.players[pi];
			for (const c of p.hand) if ((c.tribe || '').includes(e.tribe) && (c.cost || 0) > 0) {
				c.cost = Math.max(0, c.cost - (e.value || 1));
				emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost });
			}
});

register('nythendra-split', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nythendra: split into Beetles; she reforms from the survivors next turn
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 4); n++) if (state.cardsById['nythendra_beetle']) summon(state, pi, state.cardsById['nythendra_beetle']);
			p.nythendraReformAt = state.turnNumber + state.players.length;
});

register('informant-tax', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// ...or make it cost (2) more
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const rm = state.players[foe].hand[state.players[foe].hand.length - 1];
				rm.cost = (rm.cost || 0) + 2;
				emit(state, { type: 'costChange', player: foe, uid: rm.uid, cost: rm.cost });
			}
});

register('dormant-damage-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Magtheridon: while Dormant, deal N to all enemies at end of turn
			if (source && source.dormantLeft > 0) { for (const o of enemies) { for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 3, source); damageHero(state, o, e.value || 3, pi); } }
});

register('mill-own-top', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Willful Watcher: destroy the top N cards of your deck
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && p.deck.length; n++) { const id = p.deck.pop(); if (id && state.cardsById[id] && !state.cardsById[id].token) p.discardLogIds.push(id); }
			emit(state, { type: 'shuffle', player: pi });
});

register('add-counters', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// +1/+1 counters (a permanent buff that other cards can count)
			const t = e.target === 'self' ? source : chosenCreature();
			if (t && t.zone === 'board' && !isDead(t)) {
				const n = e.value === 'X' ? (source?.xValue || 0) : (e.value || 1);
				buffCreature(t, n, n); // buffCreature banks the counters
			}
});

register('swap-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crazed Alchemist: attack <-> current health
			const t = chosenCreature();
			if (t) {
				const a = t.attack, h2 = hp(t);
				t.attack = h2;
				t.maxHealth = a;
				t.damage = 0;
				t.tempAttack = 0;
				t.tempHealth = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('stalk-strike', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xhilag's Stalk: deal its escalating power to a random enemy creature
			const dmg = (source && source.partPower) || 2;
			const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
			if (pool.length) damageCreature(state, pool[Math.floor(state.rng() * pool.length)], dmg, source || null);
});

register('draw-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// draw card(s) that arrive costing less
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1); i++) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length > before) {
					const card = p.hand.at(-1);
					card.cost = Math.max(0, card.cost - e.amount);
				}
			}
});

register('hematurge', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hematurge: spend a Corpse to Discover a Death Knight card
			const p = state.players[pi];
			if ((p.corpses || 0) >= 1) {
				p.corpses -= 1;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, [{ type: 'discover', cardClasses: ['deathknight'] }], null, source);
			}
});

register('draw-edwin-reward', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Edwin, Defias Kingpin: draw a card; if you play it this turn, buff this +N/+N
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			for (const c of p.hand) if (!before.has(c.uid)) { c.edwinReward = e.value || 2; c.edwinUid = source ? source.uid : null; }
});

register('quickdraw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Quickdrawn cards return to the deck at end of turn if unplayed
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, e.value);
			for (let i = before; i < p.hand.length; i++) p.hand[i].quickdrawn = true;
			questTick(state, 'quickdraw', pi, Math.max(0, p.hand.length - before));
});

register('copy-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Faceless Rager: set this creature's Health equal to a chosen friendly's
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source)) {
				source.maxHealth = hp(t); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});

register('summon-random-basic-totem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Party Favor Totem: summon N random basic Totems
			const pool = ['sch_totem_healing', 'sch_totem_searing', 'sch_totem_stoneclaw', 'sch_totem_wrath'];
			for (let n = 0; n < (e.count || 1); n++) { const id = pool[Math.floor(state.rng() * pool.length)]; if (state.cardsById[id]) summon(state, pi, state.cardsById[id]); }
});

register('disguise', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature() || (() => {
				// triggered disguises without a chosen target hide a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c) && !c.disguised);
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
			})();
			if (t) disguiseCreature(state, t);
});

register('set-hero-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Vilefin Inquisitor: replace your Hero Power with a specific one
			const def = state.cardsById[e.powerId];
			if (def) { const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false; state.players[pi].heroPowers = [power]; emit(state, { type: 'heroPowerGained', player: pi, card: power }); }
});

register('destroy-enemy-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Platebreaker: destroy the opponent's Armor (and deal that much, if asked)
			for (const o of enemies) {
				const amt = state.players[o].armor;
				state.players[o].armor = 0;
				if (amt > 0) { emit(state, { type: 'armor', player: o, amount: -amt, armor: 0 }); if (e.thenDamage) damageHero(state, o, amt, pi); }
			}
});

register('spend-corpses-summon-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shambling Zombietank: spend N Corpses to summon a copy of this
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 5) && source && state.cardsById[source.id]) { p.corpses -= (e.cost || 5); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); summon(state, pi, state.cardsById[source.id]); }
});

register('buff-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shan'do Wildclaw: give a tribe in your deck +X/+X (applied as they're drawn)
			const p = state.players[pi];
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
});

register('augur-discard', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._augurId) {
				for (const o of enemies) {
					const op = state.players[o];
					const i = op.hand.findIndex(c => c.id === source._augurId);
					if (i >= 0) { const [c] = op.hand.splice(i, 1); toGraveyard(state, o, c); emit(state, { type: 'discard', player: o, card: c }); }
					break;
				}
			}
});

register('ancient-regurgitate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._eaten) for (const id of source._eaten) {
				if (p.hand.length >= MAX_HAND || !state.cardsById[id]) break;
				const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
});

// ---------- batch 9 (PR 26): 45 more (369 total) ----------

register('summon-copy-of-self-once-per-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lab Patron: summon a copy of this, but only once per turn (player-global to avoid chains)
			const p = state.players[pi];
			if (source && state.cardsById[source.id]) { const key = '_oncePerTurn_' + source.id; if (p[key] !== state.turnNumber) { p[key] = state.turnNumber; summon(state, pi, state.cardsById[source.id]); } }
});

register('cast-enemy-last-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Asvedon: cast a copy of the last spell your opponent played
			const foe = enemies[0];
			const last = foe != null ? state.players[foe].lastSpellPlayed : null;
			if (last && state.cardsById[last.id]) execEffects(state, pi, JSON.parse(JSON.stringify(state.cardsById[last.id].effects || [])), last.target || null, source);
});

register('trigger-imbued-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wisprider: "...then trigger it" — fire your imbued Blessing's effect immediately
			const p = state.players[pi];
			const hp0 = p.heroPowers.find(x => (x.id || '').startsWith('hp_blessing_'));
			if (hp0 && hp0.power && hp0.power.effects) execEffects(state, pi, JSON.parse(JSON.stringify(hp0.power.effects)), null, source);
});

register('swap-attack-with', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Origami Frog: swap Attack with another minion
			const t = chosenCreature();
			if (t && source) { const a = source.attack; source.attack = t.attack; t.attack = a; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});

register('damage-enemies-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blademaster Samuro (Frenzy): deal damage = this minion's Attack to all enemy minions
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
});

register('set-hand-minions-to-higher-stat', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Divine Augur: set the Attack and Health of every minion in your hand to the higher of the two
			for (const c of state.players[pi].hand) if (c.type === 'creature') { const hi = Math.max(c.attack || 0, c.maxHealth || 0); c.attack = hi; c.maxHealth = hi; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});

register('unlock-overload', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Eternal Sentinel: give back the Mana Crystals locked this turn, and
			// cancel next turn's pending lock
			const p = state.players[pi];
			if (p.overloadLockedThisTurn) { p.mana.cur += p.overloadLockedThisTurn; p.overloadLockedThisTurn = 0; }
			p.overloadPending = 0;
			emit(state, { type: 'manaGained', player: pi });
});

register('debuff-until-your-next', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Scarlet Subjugator: -N Attack until your next turn
			const t = chosenCreature();
			if (t) {
				t.attack = Math.max(0, t.attack - (e.value || 2));
				t._atkRestore = { turn: state.turnNumber + state.players.length, amount: e.value || 2 };
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});

register('draw-discount-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sharp-Eyed Lookout: draw a card; it costs (1) less this turn
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			if (p.hand.length > before) {
				const c = p.hand[p.hand.length - 1];
				if ((c.cost || 0) > 0) { c.cost -= e.value || 1; c._costRestoreEnd = e.value || 1; }
			}
});

register('hero-attack-multi-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Chronikar: +N hero Attack this turn and the next `turns - 1` of your turns
			const p = state.players[pi];
			p.heroTempAttack = (p.heroTempAttack || 0) + (e.value || 3);
			p.heroAttackTurns = { value: e.value || 3, left: (e.turns || 3) - 1 };
			emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(p) });
});

register('dagger-or-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wicked Blightspawn: equip a 1/2 Dagger, or +2 Attack to your weapon
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += 2; emit(state, { type: 'weaponBuff', player: pi, attack: p.weapon.attack }); }
			else execEffects(state, pi, [{ type: 'equip', name: 'Dagger', attack: 1, durability: 2 }], null, source);
});

register('give-attack-to-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fiendish Servant: hand this minion's Attack to a random friendly minion
			const atk = source ? (source.attack || 0) : 0;
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (atk > 0 && pool.length) buffCreature(pool[Math.floor(state.rng() * pool.length)], atk, 0);
});

register('gain-empty-mana-crystal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Widowbloom Seedsman: gain an empty Mana Crystal (max +1, current unchanged); Tranquil Treant: both players
			const targets = e.eachPlayer ? state.players.map((_, i) => i) : [pi];
			for (const idx of targets) { const pl = state.players[idx]; if (pl.mana && !pl.eliminated) pl.mana.max = (pl.mana.max || 0) + (e.value || 1); }
});

register('summon-copies-of-board', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Freya: summon a copy of each OTHER friendly minion
			const p = state.players[pi];
			const originals = p.board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			for (const c of originals) { const def = state.cardsById[c.id]; if (def && p.board.filter(x => !isDead(x)).length < 7) summon(state, pi, def); }
});

register('damage-enemies-by-heal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xyrella: deal damage to all enemy minions equal to Health restored this turn
			const amt = state.players[pi].healedAmountThisTurn || 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
});

register('swap-hero-powers', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Grizzled Wizard: swap Hero Powers with an opponent
			const o = enemies[0];
			if (o != null) { const tmp = state.players[pi].heroPowers; state.players[pi].heroPowers = state.players[o].heroPowers; state.players[o].heroPowers = tmp; emit(state, { type: 'heroPowerGained', player: pi, card: state.players[pi].heroPowers[0] }); }
});

register('grant-next-recruit-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Stewart the Steward: the next Silver Hand Recruit you summon gains +X/+X (and, if chain, this same Deathrattle)
			state.players[pi].nextRecruitBuff = { attack: e.attack || 3, health: e.health || 3, deathrattle: e.chain ? [{ type: 'grant-next-recruit-buff', attack: e.attack || 3, health: e.health || 3, chain: true }] : null };
});

register('reset-hand-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wizened Truthseeker: every card in both hands returns to its printed Cost
			for (const pl of state.players) for (const c of pl.hand) {
				const def = state.cardsById[c.id];
				if (def && c.cost !== def.cost) { c.cost = def.cost || 0; emit(state, { type: 'costChange', player: c.controller, uid: c.uid, cost: c.cost }); }
			}
});

register('hammer-grow-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// High King's Hammer breaks: shuffle it back with +2 Attack permanently
			const p = state.players[pi];
			p.hammerBonus = (p.hammerBonus || 0) + 2;
			p.deck.push('high_kings_hammer');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
});

register('discount-other-class-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ethereal Peddler: cards in hand from another class cost less
			const p = state.players[pi];
			const mine = p.heroClass;
			for (const c of p.hand) {
				const cc = c.cardClass || 'neutral';
				if (cc !== 'neutral' && cc !== mine && !cc.split('__').includes(mine)) c.cost = Math.max(0, (c.cost || 0) - (e.amount || 2));
			}
});

register('reduce-hand-spells-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Clearance Promoter: reduce the Cost of N spells in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => isSpellType(c));
			for (let n = 0; n < (e.count || 2) && pool.length; n++) { const c = pool.splice(Math.floor(state.rng() * pool.length), 1)[0]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
});

register('summon-per-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// King Phaoris: for each spell in your hand, summon a random creature of its Cost
			const pp = state.players[pi];
			for (const c of pp.hand.filter(x => isSpellType(x))) {
				if (pp.board.filter(x => !isDead(x)).length >= 7) break;
				execEffects(state, pi, [{ type: 'summon-random', cost: c.cost || 0 }], target, source);
			}
});

register('refresh-highest-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Green-Thumb Gardener: refresh empty crystals equal to your highest-Cost spell
			const p = state.players[pi];
			let best = 0; for (const c of p.hand) if (isSpellType(c)) best = Math.max(best, c.cost || 0);
			if (best > 0) { p.mana.cur = Math.min(p.mana.max, p.mana.cur + best); emit(state, { type: 'manaGained', player: pi }); }
});

register('summon-per-frost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bearon Gla'shear: summon a token for each Frost spell cast this game
			const n = state.players[pi].frostSpellsGame || 0;
			for (let i = 0; i < n; i++) summon(state, pi, state.cardsById[e.summonId] || { id: e.summonId, name: e.name || 'Elemental', type: 'creature', cost: 0, token: true, rarity: 'common', attack: 3, health: 4 });
});

register('shuffle-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// shuffle your hand into your deck (tokens evaporate)
			const p = state.players[pi];
			for (const c of p.hand) if (state.cardsById[c.id]) p.deck.push(c.id);
			p.hand = [];
			for (let k = p.deck.length - 1; k > 0; k--) {
				const j = Math.floor(state.rng() * (k + 1));
				[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
			}
});

register('draw-both-to', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Genzo, the Shark: every player draws until they have N cards
			for (let s3 = 0; s3 < state.players.length; s3++) {
				const pl = state.players[s3];
				let guard = 0;
				while (pl.hand.length < (e.value || 3) && guard++ < 20) { const before = pl.hand.length; drawCards(state, s3, 1); if (pl.hand.length === before) break; }
			}
});

register('spend-armor-resummon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// General Vezax (Deathrattle): lose N Armor to resummon this
			const p = state.players[pi];
			if ((p.armor || 0) >= (e.value || 4) && source && state.cardsById[source.id]) { p.armor -= (e.value || 4); emit(state, { type: 'armor', player: pi, amount: -(e.value || 4), armor: p.armor }); summon(state, pi, state.cardsById[source.id]); }
});

register('bulb-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cultivating Sprite: an upgrading Bulb
			const p = state.players[pi];
			if (state.cardsById['sprite_bulb'] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById['sprite_bulb'], pi); c.zone = 'hand'; c._bulbLevel = 1;
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
});

register('spend-mana-double-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Immortal: spend N Mana to double this minion's stats
			const p = state.players[pi];
			if (source && !isDead(source) && availableMana(p) >= (e.value || 4)) {
				spendMana(p, e.value || 4);
				source.attack *= 2; source.maxHealth *= 2;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});

register('discard-weapon-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Grimtotem Buzzkill: discard a weapon from your hand to draw N cards
			const p = state.players[pi];
			const w = p.hand.find(c => c.type === 'weapon');
			if (w) { p.hand = p.hand.filter(c => c !== w); if (!w.token) p.discardLogIds.push(w.id); emit(state, { type: 'discard', player: pi, card: w }); drawCards(state, pi, e.value || 3); }
});

register('remove-enemy-stealth', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Streetwise Investigator: enemy creatures lose Stealth
			for (const o of enemies) for (const c of state.players[o].board) {
				if (c.stealthed || c.keywords.includes(KW.STEALTH)) { c.stealthed = false; c.keywords = c.keywords.filter(k => k !== KW.STEALTH); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
});

register('copy-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gloop Sprayer: summon a copy of each creature flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const adj of [board[idx - 1], board[idx + 1]]) {
				if (adj && !isDead(adj) && adj.type !== 'location') { const def = state.cardsById[adj.id]; if (def) summon(state, pi, def); }
			}
});

register('blade-flurry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// destroy your weapon; its attack hits every enemy
			const p = state.players[pi];
			if (p.weapon) {
				const dmg = p.weapon.attack;
				breakWeapon(state, pi, true);
				for (const o of enemies) {
					for (const c of [...state.players[o].board]) damageCreature(state, c, dmg, null);
					damageHero(state, o, dmg, pi);
				}
			}
});

register('temp-buff-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source.zone === 'board' && !isDead(source)) {
				source.attack += e.attack || 0;
				source.tempAttack += e.attack || 0;
				source.maxHealth += e.health || 0;
				source.tempHealth = (source.tempHealth || 0) + (e.health || 0);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});

register('add-self-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Feral Gibberer: add a copy of this creature to your hand
			if (source && state.cardsById[source.id] && state.players[pi].hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[source.id], pi);
				c.zone = 'hand'; state.players[pi].hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
});

register('discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// one-shot rider: "the next X you play (this turn) costs (N) less / (0)"
			const p = state.players[pi];
			p.costDiscounts = p.costDiscounts || [];
			p.costDiscounts.push({
				cardType: e.cardType || 'all', amount: e.amount || 0, tribe: e.tribe || null,
				setZero: !!e.setZero, thisTurn: !!e.thisTurn, turn: state.turnNumber,
			});
});

register('buff-self-per-played-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Freebird: +X/+X for each other copy of this card you've played this game
			// (playedCountById is incremented AFTER the battlecry, so it already counts only prior plays)
			const n = source ? (state.players[pi].playedCountById?.[source.id] || 0) : 0;
			if (source && n > 0) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});

register('spend-mana-summon-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Commissary Crook: spend all your Mana, summon a random minion of that Cost
			const p = state.players[pi];
			const n = availableMana(p);
			p.mana.cur = 0; p.mana.bonus = 0;
			emit(state, { type: 'mana', player: pi, cur: 0, max: p.mana.max });
			if (n > 0) execEffects(state, pi, [{ type: 'summon-random', cost: n }], target, source);
});

register('buff-hand-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Unlucky Powderman: give minions in your hand with a keyword +X/+X (deck buff approximated to hand)
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.keywords || []).includes(e.keyword)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});

register('summon-dragons-per-big-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dragoncaller Alanna: a 5/5 Dragon for each 5+ Cost spell cast this game
			const n = state.players[pi].bigSpellsGame || 0;
			for (let i = 0; i < n; i++) summon(state, pi, { id: 'token_dragon_5_5', name: 'Dragon', type: 'creature', cost: 5, token: true, tribe: 'Dragon', rarity: 'common', attack: 5, health: 5, description: 'A 5/5 Dragon.' });
});

register('spend-corpses-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Boneguard Commander: raise up to N Corpses as tokens
			const p = state.players[pi];
			const n = Math.min(e.max || 6, p.corpses || 0);
			if (n > 0 && state.cardsById[e.summonId]) { p.corpses -= n; emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); for (let i = 0; i < n; i++) summon(state, pi, state.cardsById[e.summonId]); }
});

register('qonzu-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Qonzu: hand the discovered spell to the opponent's deck top
			const p = state.players[pi];
			const hi = p.hand.findIndex(c => c.uid === e.uid);
			if (hi >= 0) {
				const [c] = p.hand.splice(hi, 1);
				for (const o of enemies) { state.players[o].deck.push(c.id); break; }
				emit(state, { type: 'discard', player: pi, card: c });
			}
});

register('enemy-summon-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Deathlord: each opponent puts a creature from their deck into play
			for (const o of enemies) {
				const op = state.players[o];
				const ci = op.deck.findIndex(id => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token);
				if (ci >= 0) { const [id] = op.deck.splice(ci, 1); summon(state, o, state.cardsById[id]); }
			}
});

register('resurrect-highest-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Calia Menethil: resurrect your highest-Cost minion that died this game
			const p = state.players[pi];
			let best = null;
			for (const id of [...new Set(p.deathLogIds)]) { const def = state.cardsById[id]; if (def && def.type === 'creature' && (!best || (def.cost || 0) > (best.cost || 0))) best = def; }
			if (best) summon(state, pi, best);
});

register('heal-self-creature', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Regeneratin' Thug: restore Health to this creature at the start of your turn
			if (source && source.zone === 'board' && !isDead(source) && source.damage > 0) {
				source.damage = Math.max(0, source.damage - (e.value || 2));
				emit(state, { type: 'heal', targetType: 'creature', uid: source.uid, amount: e.value || 2, hp: hp(source) });
			}
});

// ---------- batch 10 (PR 27): 45 more (414 total) ----------

register('gain-mana-to-match', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crystal Tender: gain empty Mana Crystals until you match the opponent's maximum Mana
			const p = state.players[pi];
			let target = p.mana ? p.mana.max : 0;
			for (const o of enemies) { const om = state.players[o].mana ? state.players[o].mana.max : 0; if (om > target) target = om; }
			if (p.mana && target > p.mana.max) p.mana.max = target;
} });

register('draw-both-until', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sightless Magistrate: both players draw until they have N cards
			for (let s2 = 0; s2 < state.players.length; s2++) { const pl = state.players[s2]; let guard = 0; while (pl.hand.length < (e.value || 5) && pl.hand.length < MAX_HAND && guard++ < 20) { const before = pl.hand.length; drawCards(state, s2, 1); if (pl.hand.length === before) break; } }
} });

register('draw-spell-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Deepwater Evoker: draw a spell, gain Armor equal to its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn) gainArmor(state, pi, drawn.cost || 0);
} });

register('spend-corpses-up-to', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Spend up to N Corpses / all of your Corpses, X for each spent"
			const p = state.players[pi];
			const n = Math.min(e.max ?? Infinity, p.corpses);
			if (n > 0) {
				p.corpses -= n;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				for (let i = 0; i < n; i++) execEffects(state, pi, e.effects, target, source);
			}
} });

register('shuffle-remembered-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Test Subject: shuffle every spell cast on this creature into your deck
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (state.cardsById[id]) p.deck.push(id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
} });

register('bolster', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// +N/+N to your creature with the least health (MTG-style default)
			const pool = state.players[pi].board.filter(c => !isDead(c));
			if (pool.length) {
				const t = pool.reduce((a, b) => hp(b) < hp(a) ? b : a);
				t.attack += e.value;
				t.maxHealth += e.value;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });

register('destroy-random-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Void Crusher: destroy a random creature on each player's board
			for (const pl of state.players) {
				const pool = pl.board.filter(c => !isDead(c) && c.type !== 'location');
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			}
} });

register('shuffle-tokens-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rivendare: shuffle specific cards into your deck
			const p = state.players[pi];
			for (const id of e.ids || []) if (state.cardsById[id]) p.deck.push(id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
} });

register('chromatic-egg', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chromatic Egg: remember a random Dragon; Deathrattle hatches it
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Dragon') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			if (pool.length && source) source.hatchId = pool[Math.floor(state.rng() * pool.length)].id;
} });

register('random-buff-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mad Hatter: toss N +1/+1 hats onto random OTHER creatures (may stack)
			for (let i = 0; i < (e.count || 1); i++) {
				const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
				if (!pool.length) break;
				buffCreature(pool[Math.floor(state.rng() * pool.length)], e.attack || 1, e.health || 1);
			}
} });

register('summon-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Beast Speaker Taka (_takaId) / Amorphous Slime, Ravenous Kraken,
			// Carnivorous Cubicle (rememberedId): summon the remembered card.
			// (Merged: the _takaId-only branch shadowed the rememberedId branch.)
			const rid = source && (source._takaId || source.rememberedId);
			if (rid && state.cardsById[rid]) summon(state, pi, state.cardsById[rid]);
} });

register('temp-stealth-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Coppertail Imposter: gain Stealth until your next turn
			if (source && source.zone === 'board' && !isDead(source)) {
				source.tempStealth = true; source.stealthed = true;
				if (!source.keywords.includes(KW.STEALTH)) source.keywords.push(KW.STEALTH);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('cast-secret-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Private Eye: install N Secrets from your deck (Combo casts 2)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => state.cardsById[id]?.secret && !p.secrets.some(s => s.id === id));
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				installSecret(state, pi, id);
			}
} });

register('thalena-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blood Doctor Thalena: a second, Corpse-costed Hero Power
			const p = state.players[pi];
			const def = state.cardsById['hp_blood_tap'];
			if (def) {
				const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false;
				p.heroPowers.push(power);
				emit(state, { type: 'heroPowerGained', player: pi, card: power });
			}
} });

register('underbelly-discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			if (p.contraband && p.contraband.length) {
				state.pickQueue.push({ player: pi, ids: [...p.contraband], costMod: -3 });
				emit(state, { type: 'pickStart', player: pi, count: p.contraband.length });
			} else execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: 'Beast', costMod: -3 }], null, source);
} });

register('reduce-random-enemy-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Curious Explorer: reduce the Cost of a random minion in your opponent's hand
			for (const o of enemies) {
				const pool = state.players[o].hand.filter(c => c.type === 'creature' && (c.cost || 0) > 0);
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); }
				break;
			}
} });

register('replay-last-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Conniving Conman: replay the last card you played (approx: your most recent card)
			const id = state.players[pi].lastCardPlayedId;
			const def = id && state.cardsById[id];
			if (def) { if (isSpellType(def)) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), null, source); else if (def.type === 'creature') summon(state, pi, def); }
} });

register('recruit-attack-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Brash Battlemaster: your Silver Hand Recruits get +N Attack this game
			const p = state.players[pi];
			p.recruitAttackBonus = (p.recruitAttackBonus || 0) + (e.value || 1);
			for (const c of p.board) if (c.name === 'Silver Hand Recruit' && !isDead(c)) { c.attack += e.value || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });

register('equip-per-cards-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Necrolord Draka: equip a weapon whose Attack grows with other cards played this turn
			const p = state.players[pi];
			const bonus = Math.min(e.cap ?? 10, Math.max(0, (p.cardsPlayedThisTurn || 1) - 1));
			execEffects(state, pi, [{ type: 'equip', name: e.name || 'Dagger', attack: (e.attack || 1) + bonus, durability: e.durability || 3 }], null, source);
} });

register('damage-excess-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Temporal Construct: deal N to a minion, draw a card per excess damage
			const t = chosenCreature();
			if (t) {
				const rem = Math.max(0, t.maxHealth - t.damage);
				const dealt = damageCreature(state, t, e.value || 5, source);
				const excess = Math.max(0, (e.value || 5) - rem);
				if (excess > 0 && dealt > 0) drawCards(state, pi, excess);
			}
} });

register('heal-adjacent-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Neferset Ritualist: restore the creatures flanking this one to full Health
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb) && nb.damage > 0) { nb.damage = 0; emit(state, { type: 'heal', targetType: 'creature', uid: nb.uid, amount: 0, hp: hp(nb) }); }
} });

register('devour-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ratcatcher: destroy a chosen friendly creature, gain its Attack and Health
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const a = t.attack, h2 = hp(t);
				t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid });
				buffCreature(source, a, h2);
			}
} });

register('damage-stealth-on-kill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Burrowing Scorpid: deal damage; if it kills, gain Stealth
			const t = chosenCreature();
			if (t) { const before = isDead(t); damageCreature(state, t, e.value || 2, source); if (!before && isDead(t) && source && !isDead(source) && !source.keywords.includes(KW.STEALTH)) { source.keywords.push(KW.STEALTH); source.stealthed = true; } }
			sweepDeaths(state);
} });

register('lose-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Revenant Rascal: target 'all' destroys a Mana Crystal for each player
			const victims = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const vi of victims) { const vp = state.players[vi]; vp.mana.max = Math.max(0, vp.mana.max - (e.value || 1)); vp.mana.cur = Math.min(vp.mana.cur, vp.mana.max); }
} });

register('sacrifice-selves-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mogu Cultist: destroy all copies of this creature, summon a token
			const pp = state.players[pi];
			for (const c of [...pp.board]) if (c.id === source.id && !isDead(c)) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			if (e.summonId && state.cardsById[e.summonId]) summon(state, pi, state.cardsById[e.summonId]);
} });

register('murozond-thief', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Murozond, Thief of Time: no-duplicates deck -> Discover a Dragon that nukes
			const p = state.players[pi];
			const ids = p.deck.filter(id => state.cardsById[id]);
			if (new Set(ids).size === ids.length && ids.length > 0) {
				execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: 'Dragon', damageAllByCost: true }], null, source);
			}
} });

register('sylvanas-volley', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ranger-General Sylvanas: 2 damage to all enemies, repeated per Windrunner played
			const p = state.players[pi];
			const extra = ['alleria_windrunner', 'vereesa_windrunner'].reduce((s, id) => s + (p.playedCountById?.[id] || 0), 0);
			for (let n = 0; n < 1 + extra; n++) execEffects(state, pi, [{ type: 'damage', value: 2, target: 'enemies' }], null, source);
} });

register('summon-all-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Headmaster Kel'Thuzad (Spellburst): summon the minions destroyed this turn to your side
			const gathered = [];
			for (let s2 = 0; s2 < state.players.length; s2++) { gathered.push(...state.players[s2].diedThisTurnIds); state.players[s2].diedThisTurnIds = []; }
			for (const id of gathered) { const def = state.cardsById[id]; if (def) summon(state, pi, def); }
} });

register('reduce-hand-if-distinct-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zaqali Flamemancer: if every card in your hand has a different Cost, reduce their Costs
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			const costs = others.map(c => c.cost || 0);
			if (others.length && new Set(costs).size === costs.length) { for (const c of others) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); }
} });

register('may', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// optional "you may …": defer a yes/no to the controller. The UI (or AI)
			// resolves it via resolveAsk, running `then` on yes / `else` on no.
			state.askQueue.push({ player: pi, prompt: e.prompt || '', yes: e.yes || 'Yes', no: e.no || 'No',
				then: e.then || [], else: e.else || [] });
			emit(state, { type: 'askStart', player: pi, prompt: e.prompt || '' });
} });

register('grant-keyword-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Audio Medic (Finale): the source minion gains a keyword
			if (source && !isDead(source) && !source.keywords.includes(e.keyword)) { source.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) source.shield = true; if (e.keyword === KW.STEALTH) source.stealthed = true; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
} });

register('spend-all-mana-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Forbidden Ancient: spend all your Mana, gain +1/+1 per Mana spent
			const p = state.players[pi];
			const n = availableMana(p);
			if (n > 0) { spendMana(p, n); if (source && !isDead(source)) { source.attack += (e.attack || 1) * n; source.maxHealth += (e.health || 1) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); } }
} });

register('shuffle-soul-fragments', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spirit Jailer / etc: shuffle N Soul Fragments into your deck
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 2); n++) p.deck.push('sch_soul_fragment');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
} });

register('roll-dice-discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Snake Eyes: roll two dice, Discover a card of each rolled Cost (doubles = an extra)
			const r1 = 1 + Math.floor(state.rng() * 6), r2 = 1 + Math.floor(state.rng() * 6);
			execEffects(state, pi, [{ type: 'discover', cost: r1 }, { type: 'discover', cost: r2 }], null, source);
			if (r1 === r2) execEffects(state, pi, [{ type: 'discover', cost: r1 }], null, source);
} });

register('secrets-to-soldiers', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cannonmaster Smythe: transform your Secrets into 3/3 Soldiers
			const p = state.players[pi];
			const n = p.secrets.length; p.secrets = [];
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'bar_soldier', name: e.name || 'Soldier', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, description: 'A 3/3 Soldier.' });
} });

register('copy-last-deathrattle-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Monstrous Parrot: add a copy of the last friendly Deathrattle minion that died
			const p = state.players[pi];
			const id = p.lastDeathrattleDied;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
} });

register('resummon-source', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ancestral Spirit's granted deathrattle: the fallen returns
			if (source) {
				const def = state.cardsById[source.id];
				summon(state, pi, def || {
					id: source.id, name: source.name, type: 'creature', cost: 0,
					rarity: source.rarity || 'common', description: source.description || '',
					attack: source.attack, health: source.maxHealth,
				});
			}
} });

register('return-remembered-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Primalfin Champion: return the spells cast on it to your hand
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
} });

register('destroy-friendly-tribe-buff-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elder Nadox: destroy a chosen friendly minion; your minions gain its Attack
			const t = chosenCreature();
			if (t && t.controller === pi) { const a = t.attack || 0; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); for (const c of state.players[pi].board) if (c !== t && !isDead(c) && c.type !== 'location') buffCreature(c, a, 0); }
} });

register('damage-flanks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crow's Nest Lookout: deal damage to the left- and right-most enemy minions
			for (const o of enemies) { const board = state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'); const targets = [...new Set([board[0], board[board.length - 1]])].filter(Boolean); for (const t of targets) damageCreature(state, t, e.value || 2, source); }
			sweepDeaths(state);
} });

register('argus-start', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Broxigar, Start of Game: he disappears; the First Portal takes his deck slot
			const p = state.players[pi];
			const bi = p.deck.indexOf('broxigar');
			if (bi >= 0) { p.deck.splice(bi, 1); p.deck.push('first_portal_to_argus'); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } }
} });

register('discount-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Skittish Saucier: cards adjacent in hand (at play time) cost less
			const p = state.players[pi];
			const hi = source ? source._handIndex : -1;
			if (hi >= 0) for (const c of [p.hand[hi - 1], p.hand[hi]]) {
				if (c && (c.cost || 0) > 0) { c.cost = Math.max(0, c.cost - (e.value || 1)); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			}
} });

register('replace-deck-with-enemy-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tony, King of Piracy: replace your deck with a copy of your opponent's
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { p.deck = state.players[foe].deck.slice(); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
} });

register('draw-spell-cheap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Stonehearth Vindicator: draw a spell costing (maxCost) or less; it costs (0) this turn
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', maxCost: e.maxCost ?? 3, count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn) drawn.cost = 0;
} });

register('return-self-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Deathrattle: Return this to your hand" — a fresh copy comes back
			const p = state.players[pi];
			const def = source && state.cardsById[source.id];
			if (def && !p.eliminated && p.hand.length < MAX_HAND) {
				const card = instantiate(def, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });

// ---------- batch 11 (PR 28): 45 more (459 total) incl. 2 dup retirements ----------

register('refresh-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// LIVE first-wins body kept (value + valuePer spells-this-turn/self-attack;
	// merged during the TIME_TRAVEL import). Retired dead twin: the older
	// subset emitting 'manaGained', unreachable since that merge.
			const mp = state.players[pi].mana;
			const n = e.valuePer === 'spells-this-turn' ? (state.players[pi].spellsPlayedThisTurn || 0) : e.valuePer === 'self-attack' ? (source ? (source.attack || 0) : 0) : e.value; // Priestess Valishj / Enduring Roach / Chromatic Broodmother
			mp.cur = n != null ? Math.min(mp.max, (mp.cur || 0) + n) : mp.max;
			emit(state, { type: 'mana', player: pi, cur: mp.cur, max: mp.max });
} });

register('excavate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// REVIVED: the second branch was the REAL tiered Excavate (Badlands
	// progression + class Azerite legendaries), written for the faithful-flags
	// upgrade but shadowed by the earlier random-Treasure approximation — all
	// 27 data uses silently got the approx. The tiered path is now primary;
	// e.id keeps the old conjure-a-specific-treasure escape hatch (no card
	// data uses it today).
	if (e.id) {
				// Excavate (approx): add a random Treasure spell to your hand
				const p = state.players[pi];
				if (p.hand.length < MAX_HAND && state.cardsById[e.id || 'ww_treasure']) { const cp = instantiate(state.cardsById[e.id || 'ww_treasure'], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); p.excavateCount = (p.excavateCount || 0) + 1; }
		return;
	}
			const pl = state.players[pi];
			if (!pl.eliminated) {
				const tier = (pl.excavateCount || 0) % 5; // 0-3 fixed, 4 = class legendary
				let id;
				if (tier < 4) id = EXCAVATE_TIERS[tier];
				else {
					const pool = EXCAVATE_LEGENDARIES[pl.heroClass] || ALL_AZERITE_LEGENDARIES;
					id = pool[Math.floor(state.rng() * pool.length)];
				}
				pl.excavateCount = (pl.excavateCount || 0) + 1;
				emit(state, { type: 'excavated', player: pi, tier, id });
				addCardToHand(state, pi, id);
			}
} });

register('short-turns', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nozdormu the Eternal: both decks hold him -> 15-second turns (client honors)
			if (opponentsOf(state, pi).some(o => state.players[o].deck.includes('nozdormu_the_eternal'))
				|| state.players.some((pl, i) => i !== pi && pl.hand.some(c => c.id === 'nozdormu_the_eternal'))) {
				if (!state.shortTurns) { state.shortTurns = true; emit(state, { type: 'shortTurns' }); }
			}
} });

register('copy-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Archbishop Benedictus: shuffle a copy of your opponent's deck into your deck
			const foe = enemies[0];
			if (foe != null) {
				const p = state.players[pi];
				for (const id of state.players[foe].deck) p.deck.push(id);
				for (let k = p.deck.length - 1; k > 0; k--) { const j = Math.floor(state.rng() * (k + 1)); [p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]]; }
			}
} });

register('remove-colossal-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chromatus' Heads: each head's death strips a keyword from the parent
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => c.name === source.colossalOf);
				if (parent) {
					parent.keywords = parent.keywords.filter(k => k !== e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) parent.shield = false;
					recomputeAuras(state);
				}
			}
} });

register('copy-deck-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// R4T-C4TCH3R: duplicate every spell in your deck
			const p = state.players[pi];
			const spells = p.deck.filter(id => { const dd = state.cardsById[id]; return dd && isSpellType(dd); });
			for (const id of spells) p.deck.push(id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
} });

register('install-random-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Observer of Mysteries: install N random Secrets
			const pool = Object.values(state.cardsById).filter(d => d.secret && !d.token && d.collectible !== false && !state.players[pi].secrets.some(s => s.id === d.id));
			for (let n = 0; n < (e.count || 2) && pool.length; n++) { const [def] = pool.splice(Math.floor(state.rng() * pool.length), 1); installSecret(state, pi, def.id); }
} });

register('mill-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fel Reaver: burn the top N cards of your own deck
			const p = state.players[pi];
			for (let i = 0; i < (e.value || 1); i++) {
				const id = p.deck.pop();
				if (!id) break;
				const def = state.cardsById[id];
				if (def && !def.token) { const c = instantiate(def, pi); c.zone = 'graveyard'; p.graveyard.push(c); }
				emit(state, { type: 'mill', player: pi });
			}
} });

register('buff-self-per-other-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ultra-Capacitor: gain +X/+Y for each other friendly minion
			if (source) {
				const n = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location').length;
				if (n > 0) { source.attack += (e.attack || 1) * n; source.maxHealth += (e.health || 1) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
			}
} });

register('return-last-turn-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Krag'wa, the Frog: return all spells you played last turn to your hand
			const p = state.players[pi];
			for (const id of (p.spellsPlayedLastTurnIds || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
} });

register('holmes-investigate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Inspector Murloc Holmes: name a card; if they play it next turn, 3 Coins
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const ids = [...new Set(state.players[foe].hand.map(c => c.id))].slice(0, 3);
				state.pickQueue.push({ player: pi, ids, holmes: true });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('buff-spell-damage-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dalaran Aspirant: raise this creature's Spell Damage static
			if (source && !isDead(source)) {
				if (!source.static || source.static.type !== 'spell-damage') source.static = { type: 'spell-damage', value: 0 };
				source.static.value = (source.static.value || 0) + (e.value || 1);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('shadowflame', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// sacrifice a friendly creature, its attack burns every enemy creature
			const t = chosenCreature();
			if (t && t.controller === pi) {
				const dmg = t.attack;
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				for (const o of enemies) for (const c of [...state.players[o].board]) damageCreature(state, c, dmg, null);
			}
} });

register('steal-enemy-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kobold Stickyfinger: take the opponent's weapon
			const o = enemies[0];
			if (o != null && state.players[o].weapon) {
				const w = state.players[o].weapon; state.players[o].weapon = null;
				if (state.players[pi].weapon) breakWeapon(state, pi, true);
				w.controller = pi; state.players[pi].weapon = w;
				emit(state, { type: 'weaponEquipped', player: pi, card: w });
			}
} });

register('summon-copy-of-target-buffed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ini Stormcoil: summon a copy of a chosen friendly minion with granted keywords
			const t = chosenCreature();
			if (t) { const base = state.cardsById[t.id]; if (base) { const c = summon(state, pi, JSON.parse(JSON.stringify(base))); if (c) for (const kw of e.keywords || []) { if (!c.keywords.includes(kw)) { c.keywords.push(kw); if (kw === KW.DIVINE_SHIELD) c.shield = true; } } } }
} });

register('draw-spell-selfdamage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hullbreaker: draw a spell, your hero takes damage equal to its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && (drawn.cost || 0) > 0) damageHero(state, pi, drawn.cost || 0, pi);
} });

register('copy-last-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Astral Vigilant: get a copy of the last Draenei you played
			const p = state.players[pi];
			const id = (e.tribe === 'Draenei' || !e.tribe) ? p.lastDraeneiId : null;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('steal-empty-mana-crystal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Doomkin: take one of your opponent's empty Mana Crystals
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const fp = state.players[foe]; if ((fp.mana?.max || 0) > (fp.mana?.cur || 0) && p.mana) { fp.mana.max = Math.max(0, fp.mana.max - 1); p.mana.max = (p.mana.max || 0) + 1; emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(p) }); } }
} });

register('summon-hand-size-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Abyssal Summoner: summon a token with stats equal to your hand size
			const n = state.players[pi].hand.length;
			summon(state, pi, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Abyssal Enforcer', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, keywords: e.keywords || [], description: `A ${n}/${n} token.` });
} });

register('jandice-barov', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Jandice Barov: summon two random 5-Cost minions; one secretly dies when damaged
			const before = state.players[pi].board.length;
			execEffects(state, pi, [{ type: 'summon-random', cost: 5, count: 2 }], null, source);
			const fresh = state.players[pi].board.slice(before).filter(c => !isDead(c));
			if (fresh.length) fresh[Math.floor(state.rng() * fresh.length)].diesOnDamage = true;
} });

register('wasteland', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wasteland Vanguard: 3 split among enemies; if any die, 3 more
			const before = state.minionsDiedGame || 0;
			execEffects(state, pi, [{ type: 'random-damage', value: 1, count: 3, pool: 'enemies' }], null, source);
			sweepDeaths(state);
			if ((state.minionsDiedGame || 0) > before) execEffects(state, pi, [{ type: 'random-damage', value: 1, count: 3, pool: 'enemies' }], null, source);
} });

register('destroy-cost-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Skulking Geist: destroy all spells of a given cost in every hand and deck
			for (const pl of state.players) {
				pl.hand = pl.hand.filter(c => !(isSpellType(c) && (c.cost || 0) === e.value));
				pl.deck = pl.deck.filter(id => { const def = state.cardsById[id]; return !(def && isSpellType(def) && (def.cost || 0) === e.value); });
			}
			emit(state, { type: 'skulk', value: e.value });
} });

register('sacrifice-summon-costplus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sacrificial Summoner: destroy a friendly minion, summon a deck minion costing (1) more
			const t = chosenCreature();
			if (t && t.controller === pi) {
				const cost = (t.cost || 0) + (e.value || 1);
				t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state);
				execEffects(state, pi, [{ type: 'recruit', cost }], null, source);
			}
} });

register('put-highest-hand-on-top', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Envoy of Prosperity: put the highest-Cost card in your hand on top of your deck
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && state.cardsById[c.id]);
			if (pool.length) { let best = pool[0]; for (const c of pool) if ((c.cost || 0) > (best.cost || 0)) best = c; p.hand = p.hand.filter(c => c !== best); p.deck.push(best.id); } // top of deck = end of array
} });

register('shuffle-into-own-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Incindius (approx): shuffle N copies of a token card into your deck (Eruption upgrades not modeled)
			const p = state.players[pi];
			if (e.id) { for (let n = 0; n < (e.count || 1); n++) p.deck.push(e.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
} });

register('summon-copies-of-damaged-rush', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nablya, the Watcher: summon copies of your damaged minions, giving the copies Rush
			const p = state.players[pi];
			const dmgd = p.board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && c.damage > 0 && state.cardsById[c.id]);
			for (const c of dmgd) { const nc = summon(state, pi, state.cardsById[c.id]); if (nc && !nc.keywords.includes(KW.RUSH)) nc.keywords.push(KW.RUSH); }
} });

register('grant-deathrattle-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Greybough: give a random friendly minion a Deathrattle
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.deathrattle = (c.deathrattle || []).concat(JSON.parse(JSON.stringify(e.effects))); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
} });

register('destroy-deck-max-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hemet, Jungle Hunter: destroy all cards in your deck costing N or less (Warmaster Blackhorn: both decks)
			const targets = e.bothPlayers ? state.players.map((_, i) => i) : [pi];
			for (const idx of targets) { const pl = state.players[idx]; pl.deck = pl.deck.filter(id => (state.cardsById[id]?.cost || 0) > (e.maxCost || 0)); }
			emit(state, { type: 'shuffledIntoDeck', player: pi, count: 0 });
} });

register('jailer-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			if (source && source._jailedId != null && state.cardsById[source._jailedId]) {
				const op = state.players[source._jailedOwner];
				if (op && op.hand.length < MAX_HAND) {
					const c = instantiate(state.cardsById[source._jailedId], source._jailedOwner);
					c.zone = 'hand'; op.hand.push(c);
					emit(state, { type: 'conjure', player: source._jailedOwner, card: c, color: null });
				}
			}
} });

register('coin-to-current', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Time Skipper: the player whose turn is ending gets a Coin
			const cur = state.players[state.current];
			if (cur && !cur.eliminated && state.cardsById['coin'] && cur.hand.length < MAX_HAND + 5) {
				const cn = instantiate(state.cardsById['coin'], state.current);
				cn.zone = 'hand'; cur.hand.push(cn);
				emit(state, { type: 'conjure', player: state.current, card: cn, color: null });
			}
} });

register('force-all-enemies-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Festival Security (Finale): force all enemy minions to attack this
			if (source && !isDead(source)) { for (const o of enemies) { for (const c of [...state.players[o].board]) { if (isDead(source)) break; if (!isDead(c) && !c.frozen && c.attack > 0 && c.type !== 'location' && c.dormantLeft <= 0) resolveCombat(state, o, c.uid, { type: 'creature', uid: source.uid, player: source.controller }); } } }
} });

register('buff-colossal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// an appendage that also grows its parent Colossal (Wickerfang's Legs)
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf);
				if (parent) {
					parent.attack += e.attack || 0;
					parent.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: parent.uid, attack: parent.attack, hp: hp(parent) });
				}
			}
} });

register('draw-beast-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Banjosaur: draw a Beast and gain its stats
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', tribe: 'Beast', count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && source && !isDead(source)) buffCreature(source, drawn.attack || 0, drawn.maxHealth || 0);
} });

register('grant-immune-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ashtongue Slayer: give a minion Immune until end of turn (target 'self' = source, Kurtrus Outcast)
			const t = e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? source : null) : chosenCreature();
			if (t) { if (!t.keywords.includes(KW.IMMUNE)) t.keywords.push(KW.IMMUNE); t.immuneTurnClear = true; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
} });

register('exile', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// removed from the game: no death, no deathrattle, never reshuffled
			const t = chosenCreature();
			if (t && (e.minAttack == null || t.attack >= e.minAttack)) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				t.zone = 'exile';
				owner.exile.push(t);
				emit(state, { type: 'exiled', uid: t.uid, player: t.controller, name: t.name });
			}
} });

register('argus-final', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// the last Fleeing Demon fell: Broxigar reappears in his owner's hand
			for (const o of enemies) {
				const op = state.players[o];
				if (state.cardsById['broxigar'] && op.hand.length < MAX_HAND) {
					const bx = instantiate(state.cardsById['broxigar'], o);
					bx.zone = 'hand'; op.hand.push(bx);
					emit(state, { type: 'conjure', player: o, card: bx, color: null });
				}
				break;
			}
} });

register('buff-random-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Helboar: give a random matching minion in your hand +attack/+health
			const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes(e.tribe));
			if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack = (t.attack || 0) + (e.attack || 0); t.maxHealth = (t.maxHealth || 0) + (e.health || 0); t.health = (t.health || 0) + (e.health || 0); }
} });

register('shuffle-copies-of-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Northshire Farmer: shuffle N stat-set copies of a chosen friendly into your deck
			const t = chosenCreature();
			if (t) { const p = state.players[pi]; for (let i = 0; i < (e.count || 3); i++) p.deck.push(t.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
} });

register('buff-random-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vicious Bloodworm (battlecry path — the ongoing path lives in runSecretEffects): buff a random creature in your hand
			const pool2 = state.players[pi].hand.filter(c => c.type === 'creature');
			if (pool2.length) { const c = pool2[Math.floor(state.rng() * pool2.length)]; c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });

register('augur-peek', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ancient Augur: secretly mark one of 3 enemy hand cards for the Deathrattle
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const ids = [...new Set(state.players[foe].hand.map(c => c.id))].slice(0, 3);
				state.pickQueue.push({ player: pi, ids, augurUid: source ? source.uid : null });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('draw-tribe-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Flesh Behemoth: draw a minion of a tribe and summon a copy of it
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', tribe: e.tribe, count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && state.cardsById[drawn.id]) summon(state, pi, state.cardsById[drawn.id]);
} });

register('picklock', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Picklock: every number equals your remaining Mana
			const p = state.players[pi];
			const n = availableMana(p);
			if (source && !isDead(source)) {
				source.attack = n; source.maxHealth = Math.max(1, n); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
			const t = chosenCreature();
			if (t) damageCreature(state, t, n, source);
} });

register('infinity-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Acolyte of Infinity: a random hand card costs INFINITY until this dies
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source);
			if (source && pool.length) {
				const c = pool[Math.floor(state.rng() * pool.length)];
				source._infUid = c.uid; source._infCost = c.cost;
				c.cost = 9999;
				emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost });
			}
} });

register('destroy-played-last-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chrono-Lord Epoch: destroy enemy minions played last turn
			for (const o of enemies) {
				const op = state.players[o];
				for (const c of [...op.board]) {
					if (!isDead(c) && c.type === 'creature' && (op.cardsPlayedLastTurnIds || []).includes(c.id)) {
						c.damage = c.maxHealth; c.shield = false;
						emit(state, { type: 'destroy', uid: c.uid });
					}
				}
			}
			sweepDeaths(state);
} });

register('summon-per-fragment', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Soulciologist Malicia: for each Soul Fragment in your deck, summon a token
			const p = state.players[pi];
			const n = p.deck.filter(id => id === 'sch_soul_fragment').length;
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'sch_soul', name: e.name || 'Soul', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, keywords: ['rush'], description: 'Rush.' });
} });

// ---------- batch 12 (PR 29): 45 more (504 total) ----------

register('shuffle-cards-into-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Framester: shuffle N copies of a card into the opponent's deck
			const foe = enemies[0];
			if (foe != null && e.id) { const fp = state.players[foe]; for (let n = 0; n < (e.count || 1); n++) fp.deck.push(e.id); for (let i = fp.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [fp.deck[i], fp.deck[j]] = [fp.deck[j], fp.deck[i]]; } emit(state, { type: 'shuffle', player: foe }); }
} });

register('heal-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lightwell: mend a random damaged friendly character
			const p = state.players[pi];
			const pool = p.board.filter(c => !isDead(c) && c.damage > 0).map(c => ({ c }));
			if (p.life < STARTING_LIFE) pool.push({ hero: true });
			if (pool.length) {
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero) healHero(state, pi, e.value);
				else healCreature(pick.c, e.value);
			}
} });

register('equip-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// equip a specific weapon def by id (High King's Hammer, Atiesh...)
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			if (def) {
				if (p.weapon) breakWeapon(state, pi, true);
				const w = instantiate(def, pi);
				if (e.id === 'high_kings_hammer' && p.hammerBonus) w.attack += p.hammerBonus;
				w.zone = 'weapon'; p.weapon = w;
				emit(state, { type: 'weaponEquip', player: pi, card: w });
				recomputeAuras(state);
			}
} });

register('add-random-lich-king', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Lich King: add a random Lich King card to your hand
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.lichKingCard);
			if (pool.length && p.hand.length < MAX_HAND) {
				const c = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('bounce-to-deck-bottom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bootstrap Sunkeneer: put an enemy minion on the bottom of its owner's deck
			const t = chosenCreature();
			if (t && t.controller != null) { const owner = state.players[t.controller]; owner.board = owner.board.filter(c => c !== t); if (state.cardsById[t.id]) owner.deck.unshift(t.id); t.zone = 'gone'; emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name }); recomputeAuras(state); }
} });

register('switch-sides', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disguised trio: this minion joins the OPPONENT'S board
			const p = state.players[pi];
			if (source && p.board.includes(source)) {
				for (const o of enemies) {
					p.board = p.board.filter(c => c !== source);
					source.controller = o;
					state.players[o].board.push(source);
					emit(state, { type: 'defected', uid: source.uid, player: o });
					recomputeAuras(state);
					break;
				}
			}
} });

register('heal-or-harm-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Alexstrasza the Life-Binder: choose a character — restore N to a friendly, deal N to an enemy
			const v = e.value || 8;
			const t = chosenCreature();
			if (t) { if (t.controller === pi) healCreature(t, v); else damageCreature(state, t, v, source); sweepDeaths(state); }
			else if (target?.type === 'hero') { if (target.player === pi) healHero(state, pi, v); else damageHero(state, target.player, v, pi); }
} });

register('buff-deck-top-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Beanstalk Brute: +4/+4 to the top N minions of your deck (top = draw end)
			const p = state.players[pi];
			let found = 0;
			for (let i = p.deck.length - 1; i >= 0 && found < (e.count || 3); i--) {
				const dd = state.cardsById[p.deck[i]];
				if (dd && dd.type === 'creature') { (p.deckIdBuffs = p.deckIdBuffs || []).push({ id: p.deck[i], attack: e.attack || 0, health: e.health || 0 }); found++; }
			}
} });

register('trigger-died-deathrattles', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Endbringer Umbra: trigger the Deathrattles of N friendly minions that died this game
			const p = state.players[pi];
			let n = e.count || 5;
			for (const id of [...p.deathLogIds].reverse()) {
				if (n <= 0) break;
				const def = state.cardsById[id];
				if (def && def.deathrattle && def.deathrattle.length) { execEffects(state, pi, JSON.parse(JSON.stringify(def.deathrattle)), null, source); n--; }
			}
} });

register('upgrade-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Upgrade!: buff an equipped weapon, or forge one from nothing
			const p = state.players[pi];
			if (p.weapon) {
				p.weapon.attack += e.attack || 1;
				p.weapon.durability += e.durability || 1;
				emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability });
			} else {
				execEffects(state, pi, [{ type: 'equip', ...e.elseEquip }], target, source);
			}
} });

register('draw-check', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// draw N, then run `then` only if every newly-drawn card matches e.allType
			const dp = state.players[pi];
			const before = new Set(dp.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			const drawn = dp.hand.filter(c => !before.has(c.uid));
			if (drawn.length >= (e.value || 1) && (!e.allType || drawn.every(c => c.type === e.allType)) && e.then)
				execEffects(state, pi, e.then, target, source);
} });

register('reduce-highest-school-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shadowborn: reduce the Cost of the highest-Cost spell of a school in your hand
			const p = state.players[pi];
			let best = null;
			for (const c of p.hand) { if (isSpellType(c) && (!e.school || schoolOf(c) === e.school)) { if (!best || (c.cost || 0) > (best.cost || 0)) best = c; } }
			if (best) { best.cost = Math.max(0, (best.cost || 0) - (e.value || 3)); emit(state, { type: 'costChanged', uid: best.uid }); }
} });

register('copy-enemy-last-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fate Splitter: add a copy of the last card the opponent played to your hand
			const foe = enemies[0], p = state.players[pi];
			const id = foe != null ? state.players[foe].lastCardPlayedId : null;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('debuff-random-hand-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Twisted Treant: give a random minion in each player's hand -N Attack
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pool = state.players[s2].hand.filter(c => c.type === 'creature');
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack = Math.max(0, (c.attack || 0) + (e.attack || -2)); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
} });

register('gain-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const targets = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated)
				: e.target === 'enemy' ? [enemyHero()].filter(x => x != null) : [pi];
			for (const who of targets) {
				const wp = state.players[who];
				wp.mana.max = Math.min(MAX_BASE_MANA, wp.mana.max + (e.value || 1));
				emit(state, { type: 'manaGained', player: who, amount: 0, mana: availableMana(wp) });
			}
} });

register('rafaam-wincon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Timethief Rafaam: if you played all 9 other Rafaams, destroy the enemy hero
			const p = state.players[pi];
			const nine = ['tiny_rafaam', 'green_rafaam', 'explorer_rafaam', 'warchief_rafaam', 'mindflayer_rfaam', 'calamitous_rafaam', 'giant_rafaam', 'murloc_rafaam', 'archmage_rafaam'];
			if (nine.every(id => (p.playedCountById?.[id] || 0) >= 1)) {
				for (const o of enemies) damageHero(state, o, 9999, pi);
			}
} });

register('spend-corpses-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Volcoross: spend N Corpses to gain +N/+N
			const p = state.players[pi];
			if (source && !isDead(source) && (p.corpses || 0) >= (e.amount || 0)) {
				p.corpses -= e.amount || 0;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				source.attack += e.amount || 0; source.maxHealth += e.amount || 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('copy-deck-top-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Narain Soothfancy: add N copies of the top card of your deck to your hand
			const p = state.players[pi];
			if (p.deck.length) { const id = p.deck[p.deck.length - 1]; const def = state.cardsById[id]; if (def) for (let n = 0; n < (e.count || 1) && p.hand.length < MAX_HAND; n++) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });

register('repeat-last-cost-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pet Parrot: recast the last card of a given Cost you played
			const last = state.players[pi].lastCardOfCost && state.players[pi].lastCardOfCost[e.cost ?? 1];
			if (last && state.cardsById[last.id]) { const def = state.cardsById[last.id]; if (isSpellType(def)) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), last.target || null, source); else if (def.type === 'creature') summon(state, pi, def); }
} });

register('give-enemy-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hoarding Dragon: add copies of a card to each opponent's hand
			const def = state.cardsById[e.id];
			if (def) for (const o of enemies) {
				for (let i = 0; i < (e.count || 1); i++) {
					if (state.players[o].hand.length >= MAX_HAND) break;
					const card = instantiate(def, o); card.zone = 'hand'; state.players[o].hand.push(card);
					emit(state, { type: 'conjure', player: o, card, color: null });
				}
			}
} });

register('set-target-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Class Action Lawyer: set a minion's Attack and Health (gated on deckNoNeutral)
			if (e.requireDeckNoNeutral && state.players[pi].deck.some(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral')) return;
			const t = chosenCreature();
			if (t) { t.attack = e.attack ?? 1; t.maxHealth = e.health ?? 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
} });

register('gem-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gemstone Hoarder's Deathrattle: the stashed card returns at (1) less
			const p = state.players[pi];
			if (source && source._gemId && state.cardsById[source._gemId] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[source._gemId], pi);
				c.zone = 'hand'; c.cost = Math.max(0, (c.cost || 0) - 1);
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('swap-decks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// King Togwaggle: swap decks with an opponent (and hand them a Ransom to swap back)
			const o = enemies[0];
			if (o != null) {
				const tmp = state.players[pi].deck; state.players[pi].deck = state.players[o].deck; state.players[o].deck = tmp;
				emit(state, { type: 'decksSwapped', player: pi, other: o });
				if (!e.back) execEffects(state, pi, [{ type: 'give-enemy-card', id: 'kings_ransom' }], null, source);
			}
} });

register('curse-enemy-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chaos Gazer: curse a card in the opponent's hand; if unplayed by the
			// end of their next turn, they take damage (resolved in endTurn)
			const foe = enemies[0];
			if (foe != null) { const h = state.players[foe].hand.filter(c => !c.cursed); if (h.length) { const cc = h[Math.floor(state.rng() * h.length)]; cc.cursed = true; cc.curseDamage = e.value || 3; emit(state, { type: 'cursed', player: foe, uid: cc.uid }); } }
} });

register('eat-enemy-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mutanus the Devourer: eat a random minion in the opponent's hand, gain its stats
			const foe = enemies[0];
			if (foe != null && source) {
				const pool = state.players[foe].hand.filter(c => c.type === 'creature');
				if (pool.length) { const m = pool[Math.floor(state.rng() * pool.length)]; state.players[foe].hand = state.players[foe].hand.filter(c => c !== m); buffCreature(source, m.attack || 0, hp(m) || 0); }
			}
} });

register('enemy-discard', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// each opponent discards at random
			const dn = e.count === 'X' ? (source?.xValue || 0) : (e.count || 1);
			for (const o of enemies) {
				const op = state.players[o];
				for (let i = 0; i < dn && op.hand.length; i++) {
					const j = Math.floor(state.rng() * op.hand.length);
					const [c] = op.hand.splice(j, 1);
					toGraveyard(state, o, c);
					emit(state, { type: 'discard', player: o, card: c });
				}
			}
} });

register('add-random-junk', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dust Bunny: add a random piece of junk to your hand
			const junk = e.ids || ['coin', 'wwb_rock', 'banana', 'wwb_knife'];
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) { const id = junk[Math.floor(state.rng() * junk.length)]; if (state.cardsById[id]) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });

register('chest-coins', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hooktail's Chest: whoever breaks it (the chest's enemies) gets 3 Coins
			for (const o of enemies) {
				const op = state.players[o];
				for (let i = 0; i < (e.count || 3) && op.hand.length < MAX_HAND && state.cardsById['coin']; i++) {
					const cn = instantiate(state.cardsById['coin'], o); cn.zone = 'hand'; op.hand.push(cn);
					emit(state, { type: 'conjure', player: o, card: cn, color: null });
				}
				break;
			}
} });

register('attack-lowest-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady S'theno: attack the lowest-Health enemy minion
			if (source && !isDead(source)) {
				let best = null, bo = -1;
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) { if (!best || hp(c) < hp(best)) { best = c; bo = o; } }
				if (best) resolveCombat(state, pi, source.uid, { type: 'creature', uid: best.uid, player: bo });
			}
} });

register('xortoth-stars', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Xortoth: a Star at each end of your hand; they collide when adjacent
			const p = state.players[pi];
			if (state.cardsById['xortoth_star']) {
				const s1 = instantiate(state.cardsById['xortoth_star'], pi); s1.zone = 'hand';
				const s2 = instantiate(state.cardsById['xortoth_star'], pi); s2.zone = 'hand';
				p.hand.unshift(s1); p.hand.push(s2);
				emit(state, { type: 'conjure', player: pi, card: s2, color: null });
			}
} });

register('argus-next', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// a Fleeing Demon died (pi = its controller): Broxigar's owner (the enemy)
			// draws a card and gets the next Portal shuffled into their deck
			for (const o of enemies) {
				drawCards(state, o, 1);
				const op = state.players[o];
				op.deck.push(e.portal);
				for (let i = op.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [op.deck[i], op.deck[j]] = [op.deck[j], op.deck[i]]; }
				break;
			}
} });

register('draw-minion-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Claw Machine: draw a minion and give it +X/+X
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: 1 }], target, source);
			for (const c of p.hand) if (!before.has(c.uid) && c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });

register('mill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Devour: burn the top N cards of an opponent's deck (target 'all' = everyone,
			// 'self' = your own deck — Tickatus)
			if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) for (let i = 0; i < (e.value || 1); i++) state.players[s2].deck.pop(); }
			else if (e.target === 'self') { for (let i = 0; i < (e.value || 1); i++) e.bottom ? state.players[pi].deck.shift() : state.players[pi].deck.pop(); } // Waste Remover: bottom of own deck
			else { const victim = enemyHero(); if (victim != null) { for (let i = 0; i < (e.value || 1); i++) state.players[victim].deck.pop(); } }
} });

register('set-hand-spell-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Naga Sand Witch: set the Cost of spells in your hand; Lunar Trailblazer: one random spell -> this minion's Cost
			const cost = e.fromSourceCost && source ? (source.cost || 0) : (e.value ?? 5);
			if (e.random) { const pool = state.players[pi].hand.filter(c => isSpellType(c)); if (pool.length) pool[Math.floor(state.rng() * pool.length)].cost = cost; }
			else for (const c of state.players[pi].hand) if (isSpellType(c)) c.cost = cost;
} });

register('loot', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Loot: draw a card, then discard a card of your choice
			// (the discard resolves asynchronously via resolveDiscard)
			const p = state.players[pi];
			for (let i = 0; i < (e.value || 1); i++) drawCards(state, pi, 1);
			if (p.hand.length && !p.eliminated) {
				const count = Math.min(e.value || 1, p.hand.length);
				state.discardQueue.push({ player: pi, count });
				emit(state, { type: 'lootStart', player: pi, count });
			}
} });

register('destroy-starship', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Star Vulpera: destroy a random enemy Starship or Starship Piece
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && (c.starshipPiece || c.id === 'gdb_the_starship')) pool.push(c);
			}
			if (pool.length) {
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
} });

register('relic-mine', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Relic Miner: destroy your top card, Discover one of the same Rarity
			const p = state.players[pi];
			if (p.deck.length) {
				const id = p.deck.pop();
				const def = state.cardsById[id];
				if (def) {
					toGraveyard(state, pi, instantiate(def, pi));
					emit(state, { type: 'milled', player: pi, name: def.name });
					execEffects(state, pi, [{ type: 'discover', rarity: def.rarity || 'common' }], null, source);
				}
			}
} });

register('copy-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pip the Potent: add a copy of each card in your hand of a given Cost
			const p = state.players[pi];
			const targets = p.hand.filter(c => c !== source && (c.cost || 0) === (e.cost ?? 1) && state.cardsById[c.id]);
			for (const c of targets) { if (p.hand.length >= MAX_HAND) break; const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('equip-destroyed-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hoard Pillager: re-equip a weapon from your graveyard
			const p = state.players[pi];
			const weps = p.graveyard.filter(c => c.type === 'weapon');
			if (weps.length) {
				const w = weps[Math.floor(state.rng() * weps.length)];
				const gi = p.graveyard.indexOf(w); if (gi >= 0) p.graveyard.splice(gi, 1);
				const def = state.cardsById[w.id] || w;
				execEffects(state, pi, [{ type: 'equip-id', id: def.id }], null, source);
			}
} });

register('summon-random-cost-overheal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Heartthrob: summon a random minion with Cost equal to the amount Overhealed
			const amt = (source && source._lastOverheal) || 0;
			if (amt > 0) { const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === amt && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length)); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
} });

register('leyline-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ley Walker's Deathrattle: get a random Leyline
			const p = state.players[pi];
			const LEYS = ['leyline_of_flame', 'leyline_of_frost', 'leyline_of_arcana'];
			const id = LEYS[Math.floor(state.rng() * LEYS.length)];
			if (state.cardsById[id] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('ursol', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ursol: your highest-Cost hand spell becomes a 3-turn Aura (casts at your turn ends)
			const p = state.players[pi];
			const spells = p.hand.filter(c => isSpellType(c));
			if (spells.length) {
				const top = spells.reduce((b, c) => ((c.cost || 0) > (b.cost || 0) ? c : b));
				p.hand = p.hand.filter(c => c !== top);
				p.ursolAura = { id: top.id, left: 3 };
				emit(state, { type: 'ursolAura', player: pi, name: top.name });
			}
} });

register('create-kazakus-potion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kazakus: a random custom-style potion into your hand
			const potions = ['kazakus_potion_a', 'kazakus_potion_b', 'kazakus_potion_c'];
			const id = potions[Math.floor(state.rng() * potions.length)];
			const p = state.players[pi];
			if (state.cardsById[id] && p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
} });

register('set-next-tribe-play-reward', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Great Dark Beyond Draenei: your next N minions of a tribe gain stats/keyword/immediate-attack when PLAYED
			state.players[pi].nextTribePlayReward = { tribe: e.tribe || 'Draenei', count: e.count || 1, attack: e.attack || 0, health: e.health || 0, keyword: e.keyword || null, immediateAttack: !!e.immediateAttack, summonCopy: !!e.summonCopy, refreshManaByAttack: !!e.refreshManaByAttack, heroAttackByOwnAttack: !!e.heroAttackByOwnAttack };
} });

register('summon-with-source-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blistering Rot: summon a token with stats equal to the source minion
			if (source) { const a = source.attack || 0, h = e.squareAttack ? (source.attack || 0) : (hp(source) || 1); const tok = summon(state, pi, { id: e.id || 'token_rot', name: e.name || 'Rot', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: a, health: Math.max(1, h), keywords: e.keywords || [], description: `A ${a}/${h} token.` }); }
} });

// ---------- batch 13 (PR 30): 45 more (549 total) ----------

register('buff-random-of-tribes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zoobot / Menagerie Magician: buff a random friendly of each listed tribe
			for (const tribe of e.tribes || []) {
				const pool = state.players[pi].board.filter(c => !isDead(c) && c !== source && (c.tribe || '').includes(tribe));
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack += e.attack || 0; t.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
			}
} });

register('draw-until', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wrathion: keep drawing until you draw a card that isn't the given tribe
			const p = state.players[pi];
			let guard = 0;
			while (guard++ < 40 && p.hand.length < MAX_HAND) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length === before) break; // fatigue / empty
				const drawn = p.hand[p.hand.length - 1];
				if (!(drawn.type === 'creature' && (drawn.tribe || '').includes(e.exceptTribe))) break;
			}
} });

register('discard-spell-then', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disciple of Sargeras: discard a random spell, and if you did, run `then`
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && isSpellType(c));
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); if (!c.token) p.discardLogIds.push(c.id); emit(state, { type: 'discard', player: pi, card: c }); if (e.then) execEffects(state, pi, e.then, target, source); }
} });

register('grant-adjacent-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Candleraiser (Finale): give adjacent minions a keyword
			if (source) { const board = state.players[pi].board; const i = board.indexOf(source); for (const j of [i - 1, i + 1]) { const nb = board[j]; if (nb && !isDead(nb) && nb.type !== 'location' && !nb.keywords.includes(e.keyword)) { nb.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) nb.shield = true; emit(state, { type: 'buff', uid: nb.uid, attack: nb.attack, hp: hp(nb) }); } } }
} });

register('swap-hand-spell-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Portalmancer Skyla: swap the Costs of the lowest- and highest-Cost spells in your hand
			const p = state.players[pi];
			const spells = p.hand.filter(c => isSpellType(c));
			if (spells.length >= 2) {
				let lo = spells[0], hi = spells[0];
				for (const c of spells) { if ((c.cost || 0) < (lo.cost || 0)) lo = c; if ((c.cost || 0) > (hi.cost || 0)) hi = c; }
				if (lo !== hi) { const tmp = lo.cost; lo.cost = hi.cost; hi.cost = tmp; }
			}
} });

register('destroy-all-copies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Flik Skyshiv: destroy a chosen creature and every copy of it, everywhere
			const t = chosenCreature();
			if (t) {
				const id = t.id;
				for (const pl of state.players) {
					for (const c of [...pl.board]) if (c.id === id && !isDead(c)) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
					pl.hand = pl.hand.filter(c => c.id !== id);
					pl.deck = pl.deck.filter(cid => cid !== id);
				}
			}
} });

register('blessing-wolf', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hunter: a random Beast in your hand gets +N Attack and costs (N) less
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes('Beast'));
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack += n; c.cost = Math.max(0, (c.cost || 0) - n); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });

register('copy-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// War Master Voone: copy all creatures of a tribe in your hand
			const p = state.players[pi];
			const copies = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			for (const c of copies) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[c.id] || c; const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('cast-last-onfriendly-on-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sunwing Squawker: recast the last spell you cast on a friendly minion, on this
			const p = state.players[pi];
			const ids = p.spellsOnFriendly || [];
			const id = ids[ids.length - 1];
			const def = id && state.cardsById[id];
			if (def && def.effects && source && source.zone === 'board' && !isDead(source)) {
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
			}
} });

register('copy-friendly-location', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Scrapbooking Student: summon a copy of a friendly location
			const p = state.players[pi];
			const locs = p.board.filter(c => c.type === 'location' && !isDead(c) && state.cardsById[c.id]);
			if (locs.length) {
				const src = locs[Math.floor(state.rng() * locs.length)];
				const loc = instantiate(state.cardsById[src.id], pi); loc.zone = 'board';
				p.board.push(loc);
				emit(state, { type: 'locationPlayed', player: pi, card: loc });
			}
} });

register('garona-llane', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Garona: if your opponent is holding King Llane, destroy him and halve their Health
			for (const o of enemies) {
				const op = state.players[o];
				const li = op.hand.findIndex(c => c.id === 'king_llane');
				if (li >= 0) {
					const [llane] = op.hand.splice(li, 1);
					emit(state, { type: 'discard', player: o, card: llane });
					op.life = Math.ceil(op.life / 2);
					emit(state, { type: 'life', player: o, life: op.life });
				}
			}
} });

register('underbelly-stock', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// King of the Underbelly: three contraband Beasts are chosen at game start
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Beast') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			p.contraband = [];
			for (let n = 0; n < 3 && pool.length; n++) p.contraband.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
} });

register('copy-highest-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Audio Splitter: add a copy of the highest-Cost spell in your hand
			const p = state.players[pi];
			let best = null;
			for (const c of p.hand) if (isSpellType(c) && (!best || (c.cost || 0) > (best.cost || 0))) best = c;
			if (best && p.hand.length < MAX_HAND && state.cardsById[best.id]) { const cp = instantiate(state.cardsById[best.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('unlock-overload-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Thorim: unlock your Overloaded Mana Crystals, draw that many cards
			const p = state.players[pi];
			const locked = (p.overloadPending || 0) + (p.overloadLockedThisTurn || 0);
			p.overloadPending = 0; p.overloadLockedThisTurn = 0;
			if (p.mana) { p.mana.cur = Math.min(p.mana.max, (p.mana.cur || 0) + locked); emit(state, { type: 'manaGained', player: pi, amount: locked, mana: availableMana(p) }); }
			if (locked > 0) drawCards(state, pi, locked);
} });

register('destroy-fragment-then-aoe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shardshatter Mystic: destroy a Soul Fragment in your deck to deal damage to all other minions
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) {
				p.deck.splice(fi, 1);
				healHero(state, pi, 2);
				for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && c !== source) damageCreature(state, c, e.value || 3, source);
				sweepDeaths(state);
			}
} });

register('shaffar', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nexus-Prince Shaffar: +3/+3 to a hand minion, which inherits this Spellburst
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length) {
				const c = pool[Math.floor(state.rng() * pool.length)];
				c.attack += 3; c.maxHealth += 3;
				c.ongoing = { on: 'spell-played', once: true, effects: [{ type: 'shaffar' }] };
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
} });

register('destroy-adjacent-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disguised Executioner: a random minion beside this one dies
			if (source) {
				const b = state.players[source.controller]?.board || [];
				const i = b.indexOf(source);
				const nbs = [b[i - 1], b[i + 1]].filter(n => n && !isDead(n) && n.type === 'creature');
				if (nbs.length) { const t = nbs[Math.floor(state.rng() * nbs.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
			}
} });

register('cast-remembered-on-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lynessa Sunsorrow: recast every spell you cast on your creatures this game onto this one
			const p = state.players[pi];
			if (source && p.spellsOnFriendly) for (const id of [...p.spellsOnFriendly]) {
				const def = state.cardsById[id];
				if (def && def.effects && source.zone === 'board' && !isDead(source)) {
					execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
				}
			}
} });

register('spend-corpses-while', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Corpse Explosion: pay 1 and repeat while any creature survives
			const p = state.players[pi];
			let guard = 100;
			const anyAlive = () => state.players.some(pl => pl.board.some(c => !isDead(c)));
			while (p.corpses >= (e.value || 1) && anyAlive() && guard-- > 0) {
				p.corpses -= e.value || 1;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
				sweepDeaths(state);
			}
} });

register('buff-cthun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// buff your C'Thun wherever it is (hand/deck/board persist via the tracker)
			const p = state.players[pi];
			p.cthunAtk += e.value || 0; p.cthunHp += e.value || 0;
			for (const ey of p.board) if (ey.cthunLink && !isDead(ey)) { ey.attack += e.value || 0; ey.maxHealth += e.value || 0; emit(state, { type: 'buff', uid: ey.uid, attack: ey.attack, hp: hp(ey) }); } // Eyestalk of C'Thun
			if (e.keyword === 'taunt') p.cthunTaunt = true;
			syncCthun(state, pi);
} });

register('copy-enemy-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Azalina Soulthief: replace your hand with a copy of an opponent's
			const o = enemies[0];
			if (o != null) {
				const p = state.players[pi];
				p.hand = [];
				for (const ec of state.players[o].hand) {
					if (p.hand.length >= MAX_HAND) break;
					const def = state.cardsById[ec.id] || ec;
					const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
					emit(state, { type: 'conjure', player: pi, card, color: null });
				}
			}
} });

register('eat-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Abominable Lieutenant: destroy a random enemy minion, gain its stats
			const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
			if (pool.length && source && !isDead(source)) { const t = pool[Math.floor(state.rng() * pool.length)]; const a = t.attack || 0, h2 = hp(t) || 0; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); buffCreature(source, a, h2); }
} });

register('buff-weapons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady Ashvane: buff weapons in hand and equipped (+ deck via a draw aura)
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += e.attack || 0; p.weapon.durability += e.health || 0; emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability }); }
			for (const c of p.hand) if (c.type === 'weapon') { c.attack = (c.attack || 0) + (e.attack || 0); c.durability = (c.durability || 0) + (e.health || 0); }
} });

register('copy-enemy-deck-top', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Plagiarizarrr: add a copy of the top card of the opponent's deck to your hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null && state.players[foe].deck.length && p.hand.length < MAX_HAND) { const id = state.players[foe].deck[state.players[foe].deck.length - 1]; const def = state.cardsById[id]; if (def) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });

register('emblem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			if (!p.eliminated) {
				const em = instantiate({
					id: 'emblem_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'emblem', cost: 0, rarity: 'special',
					description: e.description || '', ongoing: e.ongoing || null,
					static: e.static || null, aura: e.aura || null,
				}, pi);
				em.zone = 'emblem';
				p.emblems.push(em);
				emit(state, { type: 'emblemGained', player: pi, card: em });
			}
} });

register('summon-hand-minion-lifesteal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kangor (Deathrattle): summon a random minion from your hand and give it Lifesteal
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); c.zone = 'board'; if (!c.keywords.includes('lifesteal')) c.keywords.push('lifesteal'); p.board.push(c); emit(state, { type: 'summon', player: pi, card: c }); recomputeAuras(state); }
} });

register('godfrey-loop', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lord Godfrey: deal N to all other creatures; if any die, repeat
			let again = true, guard = 24;
			while (again && guard-- > 0 && !state.over) {
				const hit = [];
				for (const pl of state.players) for (const c of pl.board) if (c !== source && !isDead(c) && c.type !== 'location') hit.push(c);
				if (!hit.length) break;
				for (const c of hit) damageCreature(state, c, e.value || 2, source);
				again = hit.some(c => isDead(c));
				sweepDeaths(state);
			}
} });

register('sacrifice-others-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Teron Gorefiend: destroy all other friendly minions, remembering them
			const others = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (source) source.rememberedMinions = others.map(c => ({ id: c.id, name: c.name, tribe: c.tribe || null, attack: c.attack || 0, health: hp(c) }));
			for (const c of others) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			sweepDeaths(state);
} });

register('summon-dragons-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Deathwing (Dragons) / Krul the Unshackled (tribe: Demon)
			const p = state.players[pi];
			const tribe = e.tribe || 'Dragon';
			for (const c of [...p.hand]) {
				if (c.type === 'creature' && (c.tribe || '').includes(tribe)) {
					p.hand = p.hand.filter(x => x !== c);
					c.zone = 'board'; p.board.push(c);
					emit(state, { type: 'summon', player: pi, card: c });
					fireOngoing(state, pi, 'summoned', { minion: c });
				}
			}
			recomputeAuras(state);
} });

register('doommaiden-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Doommaiden: draw from the enemy deck; unplayed, it goes back at end of turn
			const p = state.players[pi];
			for (const o of enemies) {
				const op = state.players[o];
				if (!op.deck.length || p.hand.length >= MAX_HAND) break;
				const id = op.deck.pop();
				const c = instantiate(state.cardsById[id], pi);
				c.zone = 'hand'; c._returnToDeckOf = o;
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
				break;
			}
} });

register('summon-random-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Travelmaster Dungar (approx): summon N random minions from your deck ("different expansions" not enforced)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idxs = p.deck.map((id, i) => ({ id, i })).filter(x => state.cardsById[x.id]?.type === 'creature');
				if (!idxs.length) break;
				const pick = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(pick.i, 1);
				summon(state, pi, state.cardsById[pick.id]);
			}
} });

register('destroy-enemy-plague-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tomb Traitor: destroy a Plague in the opponent's deck; if you do, deal V to all enemy minions
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; const idx = fp.deck.findIndex(id => (state.cardsById[id]?.name || '').includes('Plague')); if (idx >= 0) { fp.deck.splice(idx, 1); emit(state, { type: 'shuffle', player: foe }); for (const c of [...fp.board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 3, source); } }
} });

register('transform-deck-neutral', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wyrmrest Purifier: turn every Neutral card in your deck into a random class card
			const p = state.players[pi], cls = p.heroClass;
			const pool = Object.values(state.cardsById).filter(d => d.cardClass === cls && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.type !== 'land');
			if (cls && pool.length) p.deck = p.deck.map(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral' ? pool[Math.floor(state.rng() * pool.length)].id : id);
} });

register('grant-random-keywords-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fossilized Kaleidosaur: gain N random keywords
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			for (let i = 0; i < (e.count || 1) && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });

register('add-from-opening-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Starlight Whelp: add a random card from your starting hand to your hand
			const p = state.players[pi];
			const pool = (p.openingHand || []).filter(id => state.cardsById[id]);
			for (let n = 0; n < (e.count || 1) && pool.length && p.hand.length < MAX_HAND; n++) { const id = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('trigger-one-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// fire a chosen (or random) friendly creature's Deathrattle without it dying (count = times)
			let c = chosenCreature();
			if (e.random) { const pool = state.players[pi].board.filter(x => x !== source && !isDead(x) && x.deathrattle && x.deathrattle.length); c = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; } // Guiding Figure
			if (c && !isDead(c) && c.deathrattle) for (let n = 0; n < (e.count || 1); n++) execEffects(state, pi, c.deathrattle, null, c);
} });

register('attack-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Black Blood: swing at a random enemy creature (count -> Trenchstalker: 3 different)
			const hit = new Set();
			for (let i = 0; i < (e.count || 1); i++) {
				if (!source || isDead(source)) break;
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && !hit.has(c.uid)));
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				hit.add(t.uid);
				resolveCombat(state, pi, source.uid, { type: 'creature', uid: t.uid, player: t.controller });
				sweepDeaths(state);
			}
} });

register('shuffle-bomb', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// shuffle Bomb(s) into a random enemy's deck; they explode on draw
			for (let n = 0; n < (e.count || 1); n++) {
				const foes = enemies.filter(o => !state.players[o].eliminated);
				if (!foes.length) break;
				const od = state.players[foes[Math.floor(state.rng() * foes.length)]].deck;
				od.splice(Math.floor(state.rng() * (od.length + 1)), 0, e.id || 'bomb'); // Iron Juggernaut: id:'mine'
			}
			emit(state, { type: 'bombShuffled', player: pi, count: e.count || 1 });
} });

register('jailer-discard', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Felsoul Jailer: the enemy discards a minion; the Deathrattle returns it
			for (const o of enemies) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (!pool.length) break;
				const c = pool[Math.floor(state.rng() * pool.length)];
				op.hand = op.hand.filter(x => x !== c);
				emit(state, { type: 'discard', player: o, card: c });
				if (source) { source._jailedId = c.id; source._jailedOwner = o; }
				break;
			}
} });

register('destroy-own-totems-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Totem Cruncher: destroy your Totems, gain +2/+2 for each
			const p = state.players[pi];
			const totems = p.board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes('Totem'));
			for (const t of totems) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			if (totems.length && source && source.zone === 'board' && !isDead(source)) buffCreature(source, (e.attack || 2) * totems.length, (e.health || 2) * totems.length);
} });

register('tolins', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tolin's Goblet: draw a card, fill your hand with copies of it
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			if (p.hand.length > before) {
				const c = p.hand[p.hand.length - 1];
				const def = state.cardsById[c.id];
				while (def && p.hand.length < MAX_HAND) {
					const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
			}
} });

register('duplicate-deck-legendaries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chainbreaker Hogger (Start of Game): duplicate all OTHER Legendary cards in your deck
			const p = state.players[pi];
			const dupes = p.deck.filter(id => state.cardsById[id]?.rarity === 'legendary' && id !== e.exceptId);
			for (const id of dupes) p.deck.push(id);
			if (dupes.length) { for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
} });

register('copy-from-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shifting Shade: copy a random card from an opponent's deck into your hand
			const p = state.players[pi];
			for (const o of enemies) {
				const od = state.players[o].deck;
				if (od.length && p.hand.length < MAX_HAND) { const id = od[Math.floor(state.rng() * od.length)]; if (state.cardsById[id]) { const card = instantiate(state.cardsById[id], pi); card.zone = 'hand'; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
				break;
			}
} });

register('install-random-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Professor Putricide: install a random secret (optionally of a class)
			const installed = new Set(state.players[pi].secrets.map(s => s.id));
			const pool = Object.values(state.cardsById).filter(d => d.secret && !d.token
				&& d.collectible !== false && !(d.colors && d.colors.length)
				&& (!e.cardClass || (d.cardClass || 'neutral') === e.cardClass)
				&& !installed.has(d.id));
			if (pool.length) installSecret(state, pi, pool[Math.floor(state.rng() * pool.length)].id);
} });

register('summon-from-deck-weaker', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Meat Wagon: summon a creature from your deck with less Attack than this one
			const p = state.players[pi];
			const cap = source ? source.attack : (e.maxAttack ?? 0);
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (def.attack || 0) < cap; });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				summon(state, pi, state.cardsById[id]);
			}
} });

// ---------- batch 14 (PR 31): 45 more (594 total) ----------

register('summon-from-deck-affordable', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dinner Performer: summon a random minion from your deck you can afford
			const p = state.players[pi];
			const avail = (p.mana?.cur || 0) + (p.mana?.bonus || 0);
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const d = state.cardsById[id]; return d && d.type === 'creature' && !d.token && (d.cost || 0) <= avail; });
			if (idxs.length) { const [id, i] = idxs[Math.floor(state.rng() * idxs.length)]; p.deck.splice(i, 1); summon(state, pi, state.cardsById[id]); }
} });

register('spend-corpses-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Eulogizer: spend N Corpses to deal V damage to a target
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 3)) { p.corpses -= (e.cost || 3); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); const t = chosenCreature(); if (t) damageCreature(state, t, e.value || 3, source); else if (target?.type === 'hero') damageHero(state, target.player, e.value || 3, pi); else { const eh = enemyHero(); if (eh != null) damageHero(state, eh, e.value || 3, pi); } }
} });

register('summon-with-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Forge of Wills: a named token wearing the chosen creature's stats
			const t = chosenCreature();
			if (t) {
				summon(state, pi, {
					id: 'token_' + (e.name || 'construct').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name || 'Construct', type: 'creature', cost: 0, rarity: 'common',
					description: `A ${t.attack}/${hp(t)} ${e.name || 'token'}.`,
					attack: t.attack, health: hp(t),
					keywords: [...(e.keywords || [])], tribe: e.tribe || null,
				});
			}
} });

register('summon-random-location', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cruise Captain Lora: put N random locations into play
			const pool = Object.values(state.cardsById).filter(d => d.type === 'location' && !d.token && d.collectible !== false);
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const loc = instantiate(def, pi); loc.zone = 'board';
				p.board.push(loc);
				emit(state, { type: 'locationPlayed', player: pi, card: loc });
			}
} });

register('copy-hand-edges', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zai, the Incredible: add copies of the leftmost and rightmost cards in hand
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			const picks = others.length ? [...new Set([others[0], others[others.length - 1]])] : [];
			for (const c of picks) { if (p.hand.length >= MAX_HAND) break; const inst = instantiate(state.cardsById[c.id] || c, pi); inst.zone = 'hand'; p.hand.push(inst); emit(state, { type: 'conjure', player: pi, card: inst, color: null }); }
} });

register('damage-target-and-same-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Waste Warden: deal damage to a minion and all others of the same type
			const t = chosenCreature();
			if (t) {
				const tribe = t.tribe || '';
				damageCreature(state, t, e.value || 3, source);
				if (tribe) for (const pl of state.players) for (const c of [...pl.board]) if (c !== t && !isDead(c) && c.type !== 'location' && (c.tribe || '') && tribe.split('/').some(tr => (c.tribe || '').includes(tr))) damageCreature(state, c, e.value || 3, source);
				sweepDeaths(state);
			}
} });

register('copy-random-enemy-deck-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mind Eater: add a copy of a random card from the opponent's deck to your hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null && state.players[foe].deck.length && p.hand.length < MAX_HAND) { const id = state.players[foe].deck[Math.floor(state.rng() * state.players[foe].deck.length)]; const def = state.cardsById[id]; if (def) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });

register('enemy-summon-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dirty Rat: each opponent puts a random creature from their hand into play
			for (const o of enemies) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; op.hand = op.hand.filter(x => x !== c); c.zone = 'board'; op.board.push(c); emit(state, { type: 'summon', player: o, card: c }); fireOngoing(state, o, 'summoned', { minion: c }); }
			}
			recomputeAuras(state);
} });

register('swap-hand-with-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mindrender Illucia: replace your hand with a copy of your opponent's until end of turn
			const foe = enemies[0];
			if (foe != null && !source?._illuciaDone) {
				const p = state.players[pi];
				p.savedHand = p.hand;
				p.hand = state.players[foe].hand.map(c => { const def = state.cardsById[c.id]; const nc = def ? instantiate(def, pi) : JSON.parse(JSON.stringify(c)); nc.zone = 'hand'; return nc; });
				p.illuciaSwap = true;
				emit(state, { type: 'handSwap', player: pi });
			}
} });

register('azalina-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Azalina: 20 of yours + 20 copied from the enemy's start
			const p = state.players[pi];
			p.deck = p.deck.slice(0, 20);
			for (const o of enemies) {
				const src = state.players[o].startingDeckIds || state.players[o].deck;
				for (let n = 0; n < 20 && src.length; n++) p.deck.push(src[Math.floor(state.rng() * src.length)]);
				break;
			}
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
} });

register('transform-deck-neutrals', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Envoy of the Glade: neutral deck cards become random Druid ones
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => (dd.cardClass || '').split('__').includes('druid') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			if (pool.length) p.deck = p.deck.map(id => {
				const dd = state.cardsById[id];
				return (dd && (dd.cardClass || 'neutral') === 'neutral') ? pool[Math.floor(state.rng() * pool.length)].id : id;
			});
} });

register('fatigue-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crazed Conductor: take Fatigue damage, summon that many tokens
			const p = state.players[pi];
			const amt = (p.fatigue || 0) + 1;
			p.fatigue = amt;
			damageHero(state, pi, amt, pi);
			for (let i = 0; i < amt; i++) summon(state, pi, { id: e.summonId || 'token_imp', name: e.name || 'Imp', type: 'creature', cost: 0, token: true, tribe: 'Demon', rarity: 'common', attack: e.tokenAttack || 3, health: e.tokenHealth || 3, description: `A ${e.tokenAttack || 3}/${e.tokenHealth || 3} Imp.` });
} });

register('shuffle-enemy-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Star Student Stelina (Outcast): shuffle a random card from opponent's hand into their deck
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; if (fp.hand.length) { const i = Math.floor(state.rng() * fp.hand.length); const [c] = fp.hand.splice(i, 1); fp.deck.push(c.id); for (let k = fp.deck.length - 1; k > 0; k--) { const j = Math.floor(state.rng() * (k + 1)); [fp.deck[k], fp.deck[j]] = [fp.deck[j], fp.deck[k]]; } emit(state, { type: 'shuffle', player: foe }); } }
} });

register('own-deck-top-pick', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sightless Watcher: look at 3 deck cards, put one on top
			const p = state.players[pi];
			const idxs = p.deck.map((_, i) => i);
			const ids = [];
			for (let i = 0; i < 3 && idxs.length; i++) {
				const k = idxs.splice(Math.floor(state.rng() * idxs.length), 1)[0];
				if (!ids.includes(p.deck[k])) ids.push(p.deck[k]);
			}
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids, ownDeckTop: true });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('informant-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Royal Informant: copy the right-most card in the opponent's hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null && state.players[foe].hand.length && p.hand.length < MAX_HAND) {
				const rm = state.players[foe].hand[state.players[foe].hand.length - 1];
				const def = state.cardsById[rm.id] || rm;
				const c = instantiate(def, pi); c.zone = 'hand'; c._copiedFromEnemy = true; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('fill-board-random-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Li'Na, Shop Manager: fill your board with random minions of a given Cost
			const p = state.players[pi];
			const cost = e.cost != null ? e.cost : 0;
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === cost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			while (pool.length && p.board.filter(c => !isDead(c)).length < 7) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
} });

register('lock-enemy-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Coilfang Constrictor: random enemy hand cards can't be played next turn
			// (Renferal: one more per card you played this turn)
			const foe = enemies[0];
			const locks = (e.count || 1) + (e.plusPlayedThisTurn ? (state.players[pi].cardsPlayedThisTurn || 0) : 0);
			if (foe != null) { const fh = [...state.players[foe].hand]; for (let n = 0; n < locks && fh.length; n++) { const i = Math.floor(state.rng() * fh.length); const c = fh.splice(i, 1)[0]; c.lockedUntilTurn = state.turnNumber + 2; } }
} });

register('plunder', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// steal the top card(s) of an opponent's deck into your hand
			const victim = enemyHero();
			if (victim != null) {
				const p = state.players[pi], vd = state.players[victim].deck;
				for (let i = 0; i < (e.value || 1) && vd.length; i++) {
					if (p.hand.length >= MAX_HAND) break;
					const id = vd.pop();
					const card = instantiate(state.cardsById[id], pi);
					card.zone = 'hand';
					p.hand.push(card);
					emit(state, { type: 'plunder', player: pi, victim, card });
				}
			}
} });

register('attack-flanks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kurtrus Ashfallen: attack the left- and right-most enemy minions
			if (source && !isDead(source)) {
				for (const o of enemies) {
					const board = state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && c.dormantLeft <= 0);
					const targets = [...new Set([board[0], board[board.length - 1]])].filter(Boolean);
					for (const t of targets) { if (!isDead(source) && !isDead(t)) resolveCombat(state, pi, source.uid, { type: 'creature', uid: t.uid, player: o }); }
				}
			}
} });

register('transform-deck-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Prince Liam: transform every N-Cost card in your deck into a random Legendary creature
			const p = state.players[pi];
			const legends = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (legends.length) p.deck = p.deck.map(id => ((state.cardsById[id]?.cost || 0) === (e.cost ?? 1)) ? legends[Math.floor(state.rng() * legends.length)].id : id);
} });

register('shuffle-self-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Shuffle this card back into your deck" — Astral Tiger recursion
			const p = state.players[pi];
			if (source && state.cardsById[source.id] && !p.eliminated) {
				p.deck.push(source.id);
				for (let i = p.deck.length - 1; i > 0; i--) {
					const j = Math.floor(state.rng() * (i + 1));
					[p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
				}
				emit(state, { type: 'shuffledIntoDeck', player: pi, cardId: source.id }); fireOngoing(state, pi, 'card-shuffled', { cardId: source.id });
			}
} });

register('morchok-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Morchok: draw at -(10); excess reduction repeats on the next draw
			const p = state.players[pi];
			let red = e.value || 10, guard = 6;
			while (red > 0 && guard-- > 0 && p.deck.length && p.hand.length < MAX_HAND) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length === before) break;
				const c = p.hand[p.hand.length - 1];
				const used = Math.min(red, c.cost || 0);
				c.cost = Math.max(0, (c.cost || 0) - red);
				red -= used === 0 ? red : used;
			}
} });

register('summon-random-cost-ds', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raylla, Sand Sculptor: summon a random N-Cost minion and give it Divine Shield
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === (e.cost ?? 2) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) { const c = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (c && !c.keywords.includes(KW.DIVINE_SHIELD)) { c.keywords.push(KW.DIVINE_SHIELD); c.shield = true; } }
} });

register('exile-until-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Oblivion Ring / Fiend Hunter: exile a creature; it comes back (as a
			// fresh permanent) when THIS card leaves play (see sweepDeaths).
			const t = chosenCreature();
			if (t && source) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				t.zone = 'exile';
				owner.exile.push(t);
				source.oringExiled = { uid: t.uid, id: t.id, owner: t.controller };
				emit(state, { type: 'exiled', uid: t.uid, player: t.controller, name: t.name });
			}
} });

register('swap-health-with', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vol'jin: swap this creature's Health with a chosen creature's
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const sh = source.maxHealth, sd = source.damage;
				source.maxHealth = t.maxHealth; source.damage = t.damage;
				t.maxHealth = sh; t.damage = sd;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });

register('destroy-random-per-part', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ozumat: destroy a random enemy creature for each living appendage
			const parts = source ? state.players[pi].board.filter(c =>
				!isDead(c) && c.colossalOf === source.name).length : 0;
			for (let n = 0; n < parts; n++) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
} });

register('degrade-enemy-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// chip the chosen (or any armed) enemy's weapon
			const armed = enemies.filter(o => state.players[o].weapon);
			const chosen = target?.type === 'hero' && target.player !== pi ? target.player : null;
			const victim = (chosen != null && state.players[chosen].weapon) ? chosen
				: armed.length ? armed[Math.floor(state.rng() * armed.length)] : null;
			if (victim != null) {
				for (let i = 0; i < (e.value || 1); i++) {
					if (state.players[victim].weapon) degradeWeapon(state, victim);
				}
			}
} });

register('zin-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zin-Azshari (empowered): summon a copy of a random friendly minion, doubled stats
			const p = state.players[pi];
			const pool = p.board.filter(c => c.type === 'creature' && !isDead(c) && state.cardsById[c.id]);
			if (pool.length) {
				const t = pool[Math.floor(state.rng() * pool.length)];
				const cp = summon(state, pi, state.cardsById[t.id]);
				if (cp) { cp.attack = t.attack * 2; cp.maxHealth = t.maxHealth * 2; emit(state, { type: 'buff', uid: cp.uid, attack: cp.attack, hp: hp(cp) }); }
			}
} });

register('buff-battlecry-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Turbulus: give all OTHER Battlecry minions in hand and on board +X/+X
			const p = state.players[pi];
			for (const c of p.board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.keywords || []).includes('battlecry')) buffCreature(c, e.attack || 1, e.health || 1);
			for (const c of p.hand) if (c.type === 'creature' && (c.keywords || []).includes('battlecry')) { c.attack += e.attack || 1; c.maxHealth += e.health || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });

register('devour-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Void Terror eats its neighbors and grows by their stats
			if (source && source.zone === 'board' && !isDead(source)) {
				const board = state.players[pi].board;
				const idx = board.indexOf(source);
				let a = 0, h2 = 0;
				for (const nb of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					a += nb.attack;
					h2 += hp(nb);
					nb.damage = nb.maxHealth;
					nb.shield = false;
					emit(state, { type: 'destroy', uid: nb.uid });
				}
				if (a || h2) buffCreature(source, a, h2);
			}
} });

register('resurrect-by-attacks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tyr: resurrect one died friendly minion of your class for each listed Attack value
			const p = state.players[pi];
			const cls = p.heroClass;
			for (const atk of e.attacks || [2, 3, 4]) { const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.attack || 0) === atk && (cls == null || (d.cardClass || 'neutral') === cls || (d.cardClass || 'neutral') === 'neutral')); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
} });

register('add-random-combo-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disc Jockey (Combo): add a random card with Combo to your hand
			const pool = Object.values(state.cardsById).filter(d => (d.keywords || []).includes('combo') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			const p = state.players[pi];
			if (pool.length && p.hand.length < MAX_HAND) { const def = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('pay-or-sacrifice', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "sacrifice this unless you pay N": pay from leftover mana if able, else destroy the source
			const pp = state.players[pi];
			if (source && source.zone === 'board' && !isDead(source)) {
				if (availableMana(pp) >= (e.value || 0)) {
					spendMana(pp, e.value || 0);
					emit(state, { type: 'paidUpkeep', player: pi, amount: e.value || 0, uid: source.uid });
				} else {
					source.damage = source.maxHealth;
					source.shield = false;
					emit(state, { type: 'destroy', uid: source.uid });
				}
			}
} });

register('draw-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Holy Wrath: draw a card, deal its cost as damage
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			const drawn = p.hand.length > before ? p.hand.at(-1) : null;
			const v = drawn ? (drawn.cost || 0) : 0;
			if (v > 0) {
				const t = chosenCreature();
				if (t) damageCreature(state, t, v, null);
				else if (target?.type === 'hero') damageHero(state, target.player, v, pi);
				else { const f = enemyHero(); if (f != null) damageHero(state, f, v, pi); }
			}
} });

register('runi-future', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Runi: hand minions leave for 2 turns and return with +5/+5
			const p = state.players[pi];
			const going = p.hand.filter(c => c.type === 'creature' && c !== source);
			if (going.length) {
				p.hand = p.hand.filter(c => !going.includes(c));
				p.futureCards = p.futureCards || [];
				for (const c of going) { c.attack += 5; c.maxHealth += 5; p.futureCards.push({ card: c, at: state.turnNumber + 2 * state.players.length }); }
				emit(state, { type: 'sentToFuture', player: pi, count: going.length });
			}
} });

register('shuffle-hand-card-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bibliomite: shuffle a card from your hand into your deck (random, drawing a card)
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && state.cardsById[c.id] && !c.token);
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); p.deck.push(c.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } if (e.draw) drawCards(state, pi, 1); }
} });

register('reduce-deck-tribe-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Frizz Kindleroost: Dragons drawn from your deck cost less
			// (alsoHand -> Granite Forgeborn reduces Elementals already in hand too)
			state.players[pi].deckTribeDiscount = state.players[pi].deckTribeDiscount || {};
			state.players[pi].deckTribeDiscount[e.tribe] = (state.players[pi].deckTribeDiscount[e.tribe] || 0) + (e.value || 2);
			if (e.alsoHand) for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
} });

register('copy-hand-random-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ramkahen Wildtamer: copy a random creature of a tribe in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length && p.hand.length < MAX_HAND) {
				const src = pool[Math.floor(state.rng() * pool.length)];
				const def = state.cardsById[src.id] || src;
				const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('eat-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gral, the Shark: eat a random creature in your deck, gain its stats
			const p = state.players[pi];
			const idxs = p.deck.map((id, j) => ({ id, j })).filter(x => state.cardsById[x.id]?.type === 'creature' && !state.cardsById[x.id].token);
			if (idxs.length && source && source.zone === 'board' && !isDead(source)) {
				const pick = idxs[Math.floor(state.rng() * idxs.length)];
				const def = state.cardsById[pick.id];
				p.deck.splice(pick.j, 1);
				buffCreature(source, def.attack || 0, def.health || 0);
			}
} });

register('draw-spell-school-then', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Devout / Frostweave Dungeoneer: draw a spell; if it's a `school` spell, run `then` (bonus)
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && schoolOf(drawn) === e.school) {
				if (e.discount) drawn.cost = Math.max(0, (drawn.cost || 0) - e.discount);
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
} });

register('damage-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Explosive Shot / Cone of Cold: chosen creature + its board neighbors
			const t = chosenCreature();
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				const neighbors = [board[idx - 1], board[idx + 1]].filter(Boolean);
				damageCreature(state, t, boost(e.value), null);
				if (e.freeze) freezeCreature(state, t);
				for (const nb of neighbors) {
					damageCreature(state, nb, boost(e.splash), null);
					if (e.freeze) freezeCreature(state, nb);
				}
			}
} });

register('grant-spell-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tuskarr Fisherman: give a chosen friendly creature Spell Damage +N
			// (target 'self' = the source, for Mozaki's growing Spell Damage)
			const t = e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? source : null) : chosenCreature();
			if (t) {
				if (!t.static || t.static.type !== 'spell-damage') t.static = { type: 'spell-damage', value: 0 };
				t.static.value = (t.static.value || 0) + (e.value || 1);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });

register('summon-quilboar-scaled', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zok Fogsnout: summon two Taunt Quilboar scaled by your hero Attack (+ armor gained this turn approximated by hero attack)
			const bonus = heroAttackValue(state.players[pi]);
			for (let i = 0; i < (e.count || 2); i++) summon(state, pi, { id: 'token_quilboar', name: 'Quilboar', type: 'creature', cost: 0, token: true, tribe: 'Quilboar', rarity: 'common', attack: (e.base || 1) + bonus, health: (e.base || 1) + bonus, keywords: ['taunt'], description: `A ${(e.base || 1) + bonus}/${(e.base || 1) + bonus} Taunt Quilboar.` });
} });

register('reduce-id-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ultraxion: reduce Deathwing's Cost wherever he is
			const p = state.players[pi];
			for (const c of p.hand) if ((c.id || '').includes(e.idIncludes)) { c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			for (const id of p.deck) if (id.includes(e.idIncludes)) { const def = state.cardsById[id]; if (def) (p.deckCostOverrides = p.deckCostOverrides || {})[id] = Math.max(0, ((p.deckCostOverrides || {})[id] ?? def.cost ?? 0) - (e.value || 2)); }
} });

register('bulb-cast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// the Bulb casts three random spells of its level's Cost
			const lvl = (source && source._bulbLevel) || 1;
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && (dd.cost || 0) === lvl && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.effects);
			for (let n = 0; n < 3 && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });

// ---------- batch 15 (PR 32): 45 more (639 total) ----------

register('reveal-spell-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spiteful Summoner: reveal a random spell in your deck, summon a random minion of its Cost
			const p = state.players[pi];
			const spells = p.deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d));
			if (spells.length) {
				const sp = spells[Math.floor(state.rng() * spells.length)];
				emit(state, { type: 'joust', player: pi, myName: sp.name, myCost: sp.cost, enemyName: null, enemyCost: null, win: true });
				execEffects(state, pi, [{ type: 'summon-random', cost: sp.cost || 0 }], target, source);
			}
} });

register('damage-enemy-hand-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gunslinger Kurtrus: fire N shots of V damage at random minions in the opponent's hand
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; for (let n = 0; n < (e.count || 6); n++) { const pool = fp.hand.filter(c => c.type === 'creature'); if (!pool.length) break; const c = pool[Math.floor(state.rng() * pool.length)]; c.maxHealth = (c.maxHealth || 1) - (e.value || 2); if ((c.maxHealth || 0) <= 0) { fp.hand = fp.hand.filter(x => x !== c); emit(state, { type: 'discard', player: foe, card: c }); } } }
} });

register('lothar', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lothar: attack a random enemy minion; if it dies, gain +3/+3
			if (source && !isDead(source)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0).map(c => ({ o, c })));
				if (pool.length) { const { o, c } = pool[Math.floor(state.rng() * pool.length)]; resolveCombat(state, pi, source.uid, { type: 'creature', uid: c.uid, player: o }); if (isDead(c) && !isDead(source)) buffCreature(source, e.attack || 3, e.health || 3); }
			}
} });

register('enigma-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Faceless Enigma: pick 1 of 2 Secrets; the other casts for your opponent
			const pool = Object.values(state.cardsById).filter(dd => dd.secret && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const ids = [];
			for (let i = 0; i < 2 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			if (ids.length === 2) {
				state.pickQueue.push({ player: pi, ids, enigmaFoe: enemies[0] ?? null });
				emit(state, { type: 'pickStart', player: pi, count: 2 });
			}
} });

register('blackwing-bolt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blackwing Experiment: a 2-Cost spell dealing this minion's Attack
			const p = state.players[pi];
			const v = source ? (source.attack || 3) : 3;
			if (p.hand.length < MAX_HAND) {
				const c = instantiate({ id: 'token_blackwing_bolt', name: 'Blackwing Bolt', type: 'sorcery', cost: 2, rarity: 'common', token: true, description: `Deal ${v} damage.`, effects: [{ type: 'damage', value: v, target: 'any' }] }, pi);
				c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('transform-target-into-source', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Faceless Corruptor: turn a chosen friendly creature into a copy of this one
			const t = chosenCreature();
			if (t && source && state.cardsById[source.id]) {
				const owner = t.controller;
				const clone = instantiate(state.cardsById[source.id], owner);
				clone.zone = 'board'; clone.sick = t.sick;
				const board = state.players[owner].board; board[board.indexOf(t)] = clone; t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: owner, from: t.name, card: clone });
				recomputeAuras(state);
			}
} });

register('copy-hand-school-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Grave Defiler: get a copy of a Fel spell in your hand (Lady Deathwhisper: `all` copies every match)
			const p = state.players[pi];
			const pool = p.hand.filter(c => schoolOf(c) === e.school);
			const picks = e.all ? [...pool] : (pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []);
			for (const src of picks) { if (p.hand.length >= MAX_HAND) break; const nc = instantiate(state.cardsById[src.id] || src, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
} });

register('equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			if (p.eliminated) return;
			if (p.weapon) breakWeapon(state, pi, true);
			const w = instantiate({
				id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
				name: e.name, type: 'weapon', cost: 0, rarity: 'common',
				description: `A ${e.attack}/${e.durability} weapon.`,
				attack: e.attack, durability: e.durability,
			}, pi);
			w.zone = 'weapon';
			p.weapon = w;
			emit(state, { type: 'weaponEquip', player: pi, card: w });
			fireOngoing(state, pi, 'weapon-equipped');
} });

register('templar-merge', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dark/High Templar: with the other Templar in play, they merge into an Archon
			const p = state.players[pi];
			const otherId = e.other;
			const mate = p.board.find(c => c.id === otherId && !isDead(c));
			if (source && mate && state.cardsById['sc_archon']) {
				p.board = p.board.filter(c => c !== source && c !== mate);
				source.zone = 'gone'; mate.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: null });
				summon(state, pi, state.cardsById['sc_archon']);
			}
} });

register('gain-deathrattles-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Archdruid of Thorns: gain the Deathrattles of your minions that died this turn
			if (source) {
				const p = state.players[pi];
				for (const id of (p.diedThisTurnIds || [])) {
					const def = state.cardsById[id];
					if (def && def.deathrattle && def.deathrattle.length) { source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(def.deathrattle))]; }
				}
				if (source.deathrattle && source.deathrattle.length && !source.keywords.includes('deathrattle')) source.keywords.push('deathrattle');
			}
} });

register('swipe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// big hit on the chosen enemy, splash on all their allies
			const t = chosenCreature();
			const mainHero = !t && target?.type === 'hero' ? target.player : null;
			if (t || mainHero != null) {
				if (t) damageCreature(state, t, boost(e.value), null);
				else damageHero(state, mainHero, boost(e.value), pi);
				for (const o of enemies) {
					for (const c of [...state.players[o].board]) if (c !== t) damageCreature(state, c, boost(e.splash), null);
					if (o !== mainHero) damageHero(state, o, boost(e.splash), pi);
				}
			}
} });

register('attack-random-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Verdant Dreamsaber: attack N random enemy minions (mutual damage)
			if (source && !isDead(source)) for (let n = 0; n < (e.count || 1); n++) {
				if (isDead(source)) break;
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && c.dormantLeft <= 0) pool.push(c);
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				damageCreature(state, t, source.attack, source);
				damageCreature(state, source, t.attack, t);
			}
} });

register('mugzee-check', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mug'Zee, Start of Game: all-spell deck -> Mug's Magic; all-minion -> Zee's Might
			const p = state.players[pi];
			const others = p.deck.map(id => state.cardsById[id]).filter(Boolean).filter(d => d.id !== 'mugzee');
			if (others.length && !others.some(d => d.type === 'creature')) { p.mugMagic = true; emit(state, { type: 'heroPowerPassive', player: pi, name: "Mug's Magic" }); }
			if (others.length && !others.some(d => isSpellType(d))) { p.zeeMight = true; emit(state, { type: 'heroPowerPassive', player: pi, name: "Zee's Might" }); }
} });

register('equip-weapon-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Selfless Sidekick: equip a random weapon from your deck
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'weapon');
			if (idxs.length) { const [id, di] = idxs[Math.floor(state.rng() * idxs.length)]; p.deck.splice(di, 1); if (p.weapon) breakWeapon(state, pi, true); const w = instantiate(state.cardsById[id], pi); w.zone = 'weapon'; p.weapon = w; emit(state, { type: 'weaponEquip', player: pi, card: w }); recomputeAuras(state); runBattlecry(state, pi, w, null); }
} });

register('kelidan', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Keli'dan the Breaker: destroy a minion; if drawn this turn, destroy all others instead
			if (source && source.drawnThisTurn) {
				for (const pl of state.players) for (const c of [...pl.board]) if (c !== source && !isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
				sweepDeaths(state);
			} else {
				const t = chosenCreature();
				if (t) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
			}
} });

register('resurrect-frenzy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Overlord Saurfang: resurrect friendly minions that had Frenzy
			const p = state.players[pi];
			const isFrenzy = def => { const o = def.ongoing; const list = o ? [o] : []; if (def.ongoings) list.push(...def.ongoings); return list.some(t => t && t.on === 'self-damaged' && t.survives); };
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && isFrenzy(d));
			for (let i = 0; i < (e.count || 2) && pool.length; i++) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
} });

register('steal-until-bigger', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Serena Bloodfeather: move 1/1 from the target to this until this is bigger
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				let guard = 40;
				while (guard-- > 0 && (source.attack <= t.attack || hp(source) <= hp(t)) && t.attack > 1 && hp(t) > 1) {
					t.attack -= 1; t.maxHealth -= 1;
					source.attack += 1; source.maxHealth += 1;
				}
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('transform-random-enemy-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Plaguespreader: transform a random minion in the opponent's hand into a copy of a card
			const foe = enemies[0];
			if (foe != null && state.cardsById[e.id]) { const fp = state.players[foe]; const pool = fp.hand.filter(c => c.type === 'creature'); if (pool.length) { const victim = pool[Math.floor(state.rng() * pool.length)]; const i = fp.hand.indexOf(victim); const nc = instantiate(state.cardsById[e.id], foe); nc.zone = 'hand'; fp.hand[i] = nc; emit(state, { type: 'transformed', uid: victim.uid, player: foe, from: victim.name, card: nc }); } }
} });

register('draw-all-copies-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Grand Empress Shek'zara: pick a random card in your deck, draw all copies of it
			const p = state.players[pi];
			if (p.deck.length) {
				const pickId = p.deck[Math.floor(state.rng() * p.deck.length)];
				let guard = 30;
				while (p.deck.includes(pickId) && p.hand.length < MAX_HAND && guard-- > 0) {
					const i = p.deck.indexOf(pickId); p.deck.splice(i, 1);
					const nc = instantiate(state.cardsById[pickId], pi); nc.zone = 'hand'; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
			}
} });

register('dredge', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dredge: look at the bottom N (default 3) of your deck and put one
			// on top — you don't draw it. The choice resolves via resolveDredge.
			const p = state.players[pi];
			if (!p.eliminated) {
				// bottom of the deck is the front of the array (draws pop the end)
				const ids = p.deck.splice(0, Math.min(e.value || 3, p.deck.length));
				if (ids.length) {
					state.dredgeQueue.push({ player: pi, ids });
					emit(state, { type: 'dredgeStart', player: pi, count: ids.length });
					firePonder(state, pi, { dredge: true });
				}
			}
} });

register('gain-deathrattle-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Seeping Oozeling: copy the Deathrattle of a random creature in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
			if (pool.length && source) {
				const pick = pool[Math.floor(state.rng() * pool.length)];
				source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(pick.deathrattle))];
				if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle');
			}
} });

register('etc-rock', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elite Tauren Chieftain: both players get the power to ROCK!
			const CHORDS = ['power_chord_murloc', 'power_chord_rogues', 'power_chord_horde'];
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2];
				const id = CHORDS[Math.floor(state.rng() * CHORDS.length)];
				if (state.cardsById[id] && pl.hand.length < MAX_HAND && !pl.eliminated) {
					const c = instantiate(state.cardsById[id], s2); c.zone = 'hand'; pl.hand.push(c);
					emit(state, { type: 'conjure', player: s2, card: c, color: null });
				}
			}
} });

register('draw-school-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sketch Artist: draw a spell of a school, then add a copy to your hand
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', school: e.school, count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && state.cardsById[drawn.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[drawn.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('dungar-travel', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Travelmaster Dungar: three deck minions from different expansions
			const p = state.players[pi];
			const seen = new Set();
			for (let n = 0; n < 3; n++) {
				const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const dd = state.cardsById[id]; return dd?.type === 'creature' && !dd.token && !seen.has(dd.set || '?'); });
				if (!idxs.length) break;
				const [id, i] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(i, 1);
				seen.add(state.cardsById[id].set || '?');
				summon(state, pi, state.cardsById[id]);
			}
} });

register('varian', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Varian: draw a Rush minion to gain Rush; repeat for Taunt and Divine Shield
			const p = state.players[pi];
			for (const kw of ['rush', 'taunt', 'divine_shield']) {
				const before = new Set(p.hand.map(c => c.uid));
				execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', requireKeyword: kw, count: 1 }], null, source);
				const drawn = p.hand.find(c => !before.has(c.uid));
				if (drawn && source && !isDead(source) && !source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; }
			}
} });

register('cthun-blast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// C'Thun's Battlecry: damage equal to its Attack, split among all enemies
			let hits = source ? source.attack : (CTHUN_BASE + state.players[pi].cthunAtk);
			for (; hits > 0; hits--) {
				const pool = [];
				for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c)) pool.push({ c }); pool.push({ hero: o }); }
				if (!pool.length) break;
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero != null) damageHero(state, pick.hero, 1, pi); else damageCreature(state, pick.c, 1, source || null);
			}
} });

register('draw-creatures-to-board', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Varian Wrynn: draw N; any creatures drawn go straight into play (no battlecry)
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			for (const c of p.hand.filter(x => !before.has(x.uid))) {
				if (c.type === 'creature' && !p.eliminated) {
					p.hand = p.hand.filter(x => x !== c);
					c.zone = 'board'; p.board.push(c);
					emit(state, { type: 'summon', player: pi, card: c });
					fireOngoing(state, pi, 'summoned', { minion: c });
				}
			}
			recomputeAuras(state);
} });

register('destroy-fragment-then-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shadowlight Scholar: destroy a Soul Fragment in your deck to deal damage
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) {
				p.deck.splice(fi, 1);
				healHero(state, pi, 2); // destroying a Soul Fragment restores 2 Health
				const t = chosenCreature() || (target && target.type === 'hero' ? target : null);
				if (target && target.type === 'hero') damageHero(state, target.player, e.value || 3, pi);
				else if (t) damageCreature(state, t, e.value || 3, source);
				sweepDeaths(state);
			}
} });

register('bounce-self-set-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rhythmdancer Risa: return this to your hand and set its Cost
			if (source && source.zone === 'board' && !isDead(source) && state.cardsById[source.id] && state.players[pi].hand.length < MAX_HAND) {
				state.players[pi].board = state.players[pi].board.filter(c => c !== source);
				const cp = instantiate(state.cardsById[source.id], pi); cp.zone = 'hand'; cp.cost = e.value ?? 1;
				state.players[pi].hand.push(cp); source.zone = 'gone';
				emit(state, { type: 'bounce', uid: source.uid, player: pi, name: source.name }); recomputeAuras(state);
			}
} });

register('destroy-enemy-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			let n = 0;
			for (const o of enemies) {
				const op = state.players[o];
				for (const sc of [...op.secrets]) {
					n++;
					op.secrets = op.secrets.filter(x => x !== sc);
					toGraveyard(state, o, sc);
					emit(state, { type: 'secretRevealed', player: o, card: sc });
				}
			}
			// Eater of Secrets: gain +1/+1 for each Secret destroyed
			if (e.buffSelf && n > 0 && source && !isDead(source)) {
				source.attack += n; source.maxHealth += n;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('deploy-secret-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mad Scientist: one Secret. Mysterious Challenger (all): one of each.
			const p = state.players[pi];
			if (e.all) {
				const seen = new Set();
				for (const id of [...p.deck]) {
					const def = state.cardsById[id];
					if (def?.secret && !seen.has(id)) { seen.add(id); const i = p.deck.indexOf(id); if (i >= 0) { p.deck.splice(i, 1); installSecret(state, pi, id); } }
				}
			} else {
				const si = p.deck.findIndex(id => state.cardsById[id]?.secret);
				if (si >= 0) { const [id] = p.deck.splice(si, 1); installSecret(state, pi, id); }
			}
} });

register('spire-reveal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spire Security: reveal a random deck spell; (5)+ fires the volley
			const p = state.players[pi];
			const spells = p.deck.filter(id => { const dd = state.cardsById[id]; return dd && isSpellType(dd); });
			if (spells.length) {
				const id = spells[Math.floor(state.rng() * spells.length)];
				const dd = state.cardsById[id];
				emit(state, { type: 'reveal', player: pi, name: dd.name, cost: dd.cost });
				if ((dd.cost || 0) >= 5) execEffects(state, pi, [{ type: 'random-damage', value: 1, count: 5, pool: 'enemy-creatures' }], null, source);
			}
} });

register('blade-of-cthun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blade of C'Thun: destroy a creature, add its Attack/Health to C'Thun
			const t = chosenCreature();
			if (t) {
				const a = t.attack, h2 = t.maxHealth;
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				const p = state.players[pi];
				p.cthunAtk += a; p.cthunHp += h2;
			for (const ey of p.board) if (ey.cthunLink && !isDead(ey)) { ey.attack += a; ey.maxHealth += h2; emit(state, { type: 'buff', uid: ey.uid, attack: ey.attack, hp: hp(ey) }); } // Eyestalk of C'Thun
				syncCthun(state, pi);
			}
} });

register('swap-hand-deck-bottom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sir Finley, Sea Guide: swap your hand with the bottom of your deck
			const p = state.players[pi];
			const handIds = p.hand.filter(c => state.cardsById[c.id] && !c.token).map(c => c.id);
			const n = handIds.length;
			const bottom = p.deck.splice(0, Math.min(n, p.deck.length));
			p.deck.unshift(...handIds); // old hand goes to the bottom
			p.hand = [];
			for (const id of bottom) { if (state.cardsById[id]) { const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); } }
			emit(state, { type: 'handSwap', player: pi });
} });

register('return-destroyed-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rummaging Kobold: return a destroyed weapon from your graveyard to your hand
			const p = state.players[pi];
			const weps = p.graveyard.filter(c => c.type === 'weapon');
			if (weps.length && p.hand.length < MAX_HAND) {
				const w = weps[Math.floor(state.rng() * weps.length)];
				const def = state.cardsById[w.id] || w;
				const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
				const gi = p.graveyard.indexOf(w); if (gi >= 0) p.graveyard.splice(gi, 1);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });

register('copy-to-hand-cheap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shadowcaster: a 1/1 copy of a friendly creature that costs (1)
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && p.hand.length < MAX_HAND) {
				const def = state.cardsById[t.id] || { id: t.id, name: t.name, type: 'creature', rarity: t.rarity, description: t.description };
				const card = instantiate(def, pi);
				card.zone = 'hand'; card.attack = e.attack || 1; card.maxHealth = e.health || 1; card.cost = e.cost != null ? e.cost : 1;
				p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });

register('shuffle-random-primes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Envoy Rustwix: shuffle N random Prime Legendary minions into your deck
			const primes = Object.values(state.cardsById).filter(d => typeof d.id === 'string' && d.id.endsWith('_prime') && d.type === 'creature');
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 3) && primes.length; n++) p.deck.push(primes[Math.floor(state.rng() * primes.length)].id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
} });

register('add-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fire Fly: a fresh token creature lands in your hand
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) {
				const card = instantiate({
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: e.cost || 1, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, tribe: e.tribe || null, token: true,
				}, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });

register('summon-died-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kanrethad Prime: resummon friendly minions of a tribe that died this game
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.tribe || '').includes(e.tribe));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) { const nc = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (nc && e.grant && !nc.keywords.includes(e.grant)) { nc.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) nc.shield = true; } } // Infantry Reanimator: grant Reborn
} });

register('discard-weapons-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Furnacefire Colossus: discard all weapons in hand, gain their Attack+Durability
			const p = state.players[pi];
			let atk = 0, hlth = 0;
			for (const c of [...p.hand]) {
				if (c.type === 'weapon') {
					atk += c.attack || 0; hlth += c.durability || 0;
					p.hand = p.hand.filter(x => x !== c);
					toGraveyard(state, pi, c);
					emit(state, { type: 'discard', player: pi, card: c });
					if (!c.token) p.discardLogIds.push(c.id);
				}
			}
			if (source && source.zone === 'board' && !isDead(source) && (atk || hlth)) buffCreature(source, atk, hlth);
} });

register('summon-jade', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Jade Golem: per-player counter, each golem +1/+1 over the last (cap 30/30).
			// The counter advances even if the board is full and the summon fails.
			const p = state.players[pi];
			const n = Math.min(30, (p.jadeCount || 0) + 1);
			p.jadeCount = n;
			const c = summon(state, pi, {
				id: 'token_jade_golem', name: 'Jade Golem', type: 'creature',
				cost: Math.min(10, n), rarity: 'common', token: true,
				description: `A ${n}/${n} Jade Golem.`, attack: n, health: n,
			});
			if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant);
} });

register('hand-mixer', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Togwaggle, Smuggler King: shuffle both players' hands together and redeal
			const all = [];
			const counts = state.players.map(pl => { all.push(...pl.hand); return pl.hand.length; });
			for (const pl of state.players) pl.hand = [];
			for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
			state.players.forEach((pl, idx) => {
				for (let k = 0; k < counts[idx]; k++) { const c = all.pop(); if (c) { c.controller = idx; pl.hand.push(c); } }
			});
			emit(state, { type: 'handsMixed' });
} });

register('throw-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Party Crasher: throw a random minion from your hand at a chosen enemy (they trade damage)
			const t = chosenCreature();
			const p = state.players[pi];
			const minionsInHand = p.hand.filter(c => c.type === 'creature');
			if (t && minionsInHand.length) {
				const m = minionsInHand[Math.floor(state.rng() * minionsInHand.length)];
				p.hand = p.hand.filter(c => c !== m);
				if (!m.token) p.discardLogIds.push(m.id);
				damageCreature(state, t, m.attack || 0, null);
				if (source && !isDead(source)) damageCreature(state, source, t.attack || 0, null);
			}
} });

register('destroy-target-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ravenous Devilsaur: destroy a minion; Kindred: gain its stats (requireKindredForStats). Natalie Seline: healthOnly
			const t = chosenCreature();
			if (t) { const a = t.attack || 0, h = hp(t); t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); const gains = !e.requireKindredForStats || kindredActive(state, pi, source); if (source && !isDead(source) && gains) { if (!e.healthOnly) source.attack += a; source.maxHealth += h; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); } }
} });

register('hand-legendary-replace', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Golden Kobold: replace your hand with random Legendary minions
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let i = 0; i < p.hand.length; i++) {
				if (!pool.length) break;
				const def = pool[Math.floor(state.rng() * pool.length)];
				const nc = instantiate(def, pi); nc.zone = 'hand';
				p.hand[i] = nc;
				emit(state, { type: 'conjure', player: pi, card: nc, color: null });
			}
} });

// ---------- batch 16 (PR 33): 45 more (684 total) ----------

register('gain-random-keyword-per-enemy-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Torghast Custodian: for each enemy minion, randomly gain a keyword
			const kws = e.keywords || ['rush', 'divine_shield', 'windfury'];
			let n = 0; for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });

register('swap-stats-with', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Darkspeaker: swap this creature's Attack & Health with a chosen one
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const sa = source.attack, sh = source.maxHealth, sd = source.damage;
				source.attack = t.attack; source.maxHealth = t.maxHealth; source.damage = t.damage;
				t.attack = sa; t.maxHealth = sh; t.damage = sd;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });

register('eyes-in-the-sky', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// look at 3 cards in the enemy's deck; the pick goes on top
			const foe = enemies[0];
			if (foe != null) {
				const op = state.players[foe];
				const ids = [];
				const idxs = op.deck.map((_, i) => i);
				for (let i = 0; i < 3 && idxs.length; i++) {
					const k = idxs.splice(Math.floor(state.rng() * idxs.length), 1)[0];
					if (!ids.includes(op.deck[k])) ids.push(op.deck[k]);
				}
				if (ids.length) {
					state.pickQueue.push({ player: pi, ids, enemyDeckTop: foe });
					emit(state, { type: 'pickStart', player: pi, count: ids.length });
				}
			}
} });

register('summon-deck-minions-setstats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elise, Badlands Savior: summon set-stat copies of N random minions in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			for (let n = 0; n < (e.count || 4) && pool.length; n++) { if (p.board.filter(c => !isDead(c)).length >= 7) break; const def = JSON.parse(JSON.stringify(pool[Math.floor(state.rng() * pool.length)])); if (e.stats != null) { def.attack = e.stats; def.health = e.stats; } def.token = true; def.id = 'token_' + def.id; summon(state, pi, def); }
} });

register('copy-lowest-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tending Dragonkin: add a copy of the lowest-Cost minion of a tribe in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length && p.hand.length < MAX_HAND) {
				let lo = pool[0]; for (const c of pool) if ((c.cost || 0) < (lo.cost || 0)) lo = c;
				if (state.cardsById[lo.id]) { const cp = instantiate(state.cardsById[lo.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
			}
} });

register('mind-control-temp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shadow Madness: borrow an enemy creature until end of turn
			const t = chosenCreature();
			if (t && t.controller !== pi && (e.maxAttack == null || t.attack <= e.maxAttack)
				&& !state.players[pi].eliminated) {
				const from = t.controller;
				state.players[from].board = state.players[from].board.filter(c => c !== t);
				t.tempControl = from;
				t.controller = pi;
				t.sick = false;
				t.attacksUsed = 0;
				state.players[pi].board.push(t);
				emit(state, { type: 'mindControl', uid: t.uid, player: pi, name: t.name });
				recomputeAuras(state);
			}
} });

register('summon-tentacle-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Loken: summon a Tentacle with the stats of a random minion in your deck (+ Taunt)
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			if (pool.length) { const pick = pool[Math.floor(state.rng() * pool.length)]; summon(state, pi, { id: 'ttn_tentacle', name: 'Tentacle', type: 'creature', cost: 0, token: true, rarity: 'common', attack: pick.attack || 0, health: pick.health || 1, keywords: ['taunt'], description: `A ${pick.attack}/${pick.health} Tentacle with Taunt.` }); }
} });

register('damage-all-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Risky Skipper: deal `value` to every minion on both sides
			// (exceptSource omits the caster — Shattered Rumbler: "all OTHER minions";
			//  exceptTribe skips a tribe — Fire Breather: "except Demons")
			const dv = e.valueFromHandSize ? state.players[pi].hand.length : (e.value || 1); // Entitled Customer
			for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && !(e.exceptSource && c === source) && !(e.exceptTribe && (c.tribe || '').includes(e.exceptTribe))) damageCreature(state, c, dv, source);
			sweepDeaths(state);
} });

register('swap-attack-extremes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wealth Redistributor: swap the Attack of the highest- and lowest-Attack minions
			const all = state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c.type !== 'location'));
			if (all.length >= 2) {
				let hi = all[0], lo = all[0];
				for (const c of all) { if (c.attack > hi.attack) hi = c; if (c.attack < lo.attack) lo = c; }
				if (hi !== lo) { const t = hi.attack; hi.attack = lo.attack; lo.attack = t; emit(state, { type: 'buff', uid: hi.uid, attack: hi.attack, hp: hp(hi) }); emit(state, { type: 'buff', uid: lo.uid, attack: lo.attack, hp: hp(lo) }); }
			}
} });

register('summon-died-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Imp King Rafaam: resurrect friendly dead minions whose name contains a substring
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.name || '').includes(e.nameIncludes || ''));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) { const nc = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (nc && e.grant && !nc.keywords.includes(e.grant)) { nc.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) nc.shield = true; } } // Kingpin Pud: grant Windfury
} });

register('fight', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// two-target fight: the chosen fighter (target.uid) and its foe
			// (target.fightTarget) each deal damage equal to their power to the other
			const aC = e.selfFights ? source : chosenCreature();
			const bC = e.selfFights ? chosenCreature() : (target && target.fightTarget != null ? findCreature(state, target.fightTarget) : null);
			if (aC && bC && aC !== bC && !isDead(aC) && !isDead(bC)) {
				const pa = aC.attack, pb = bC.attack;
				emit(state, { type: 'fight', a: aC.uid, b: bC.uid });
				damageCreature(state, bC, pa, aC);
				damageCreature(state, aC, pb, bC);
			}
} });

register('copy-enemy-hero-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sideshow Spelleater: copy a random opponent's Hero Power
			const p = state.players[pi];
			for (const o of enemies) {
				const src = state.players[o].heroPowers[0];
				if (src && p.heroPowers.length < MAX_HERO_POWERS && !p.heroPowers.some(h => h.id === src.id)) {
					const copy = instantiate(state.cardsById[src.id] || { id: src.id, name: src.name, type: 'heropower', power: src.power }, pi);
					copy.zone = 'heropower'; copy.usedThisTurn = false;
					p.heroPowers.push(copy);
					emit(state, { type: 'heroPowerGained', player: pi, card: copy });
				}
				break;
			}
} });

register('boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// color boost: roll the color's d6 table onto a chosen friendly
			// creature; Chromatic creatures roll twice and keep both
			const t = chosenCreature();
			const table = BOOST_TABLES[e.color] || [];
			if (t && table.length) {
				const rolls = has(t, KW.CHROMATIC) ? 2 : 1;
				for (let i = 0; i < rolls && !isDead(t); i++) {
					const roll = Math.floor(state.rng() * table.length);
					applyRollEntry(state, t, table[roll]);
					emit(state, { type: 'boosted', uid: t.uid, color: e.color, roll: roll + 1, label: table[roll].label, attack: t.attack, hp: hp(t) });
				}
			}
} });

register('bounce-and-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bog Slosher: return a friendly creature to hand and give it +2/+2
			const t = chosenCreature();
			if (t) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				const def = state.cardsById[t.id];
				if (def && owner.hand.length < MAX_HAND) {
					const card = instantiate(def, t.controller);
					card.zone = 'hand'; card.attack += e.attack || 0; card.maxHealth += e.health || 0;
					owner.hand.push(card); emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name });
				}
				recomputeAuras(state);
			}
} });

register('shuffle-lowest-hand-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Safety Inspector: shuffle the lowest-Cost card from your hand into your deck
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source);
			if (pool.length) {
				let lo = pool[0];
				for (const c of pool) if ((c.cost || 0) < (lo.cost || 0)) lo = c;
				p.hand = p.hand.filter(c => c !== lo);
				if (!lo.token && state.cardsById[lo.id]) { p.deck.push(lo.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } }
				emit(state, { type: 'shuffle', player: pi });
			}
} });

register('force-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Behemoth's Lure: force a random enemy to attack the Behemoth (parent)
			const magnet = source && source.colossalOf ? (state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf) || source) : source;
			if (magnet && !isDead(magnet)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c =>
					!isDead(c) && !c.frozen && c.attack > 0));
				if (pool.length) {
					const a = pool[Math.floor(state.rng() * pool.length)];
					resolveCombat(state, a.controller, a.uid, { type: 'creature', uid: magnet.uid, player: magnet.controller });
				}
			}
} });

register('random-invocation', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kalimos, Primal Lord: cast a random Elemental Invocation
			const inv = Math.floor(state.rng() * 4);
			if (inv === 0) execEffects(state, pi, [{ type: 'damage', value: 6, target: 'enemy-heroes' }], target, source);
			else if (inv === 1) execEffects(state, pi, [{ type: 'damage', value: 3, target: 'enemy-creatures' }], target, source);
			else if (inv === 2) execEffects(state, pi, [{ type: 'heal', value: 12, target: 'self' }], target, source);
			else execEffects(state, pi, [{ type: 'summon', count: 2, attack: 6, health: 6, name: 'Elemental', tribe: 'Elemental' }], target, source);
} });

register('corpse-bride', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Corpse Bride: the Groom grows +1/+1 per Corpse spent (up to 5)
			const p = state.players[pi];
			const spend = Math.min(5, p.corpses || 0);
			p.corpses -= spend;
			emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
			const g = summon(state, pi, { id: 'token_risen_groom', name: 'Risen Groom', type: 'creature', cost: 5, attack: 5, health: 5, tribe: 'Undead', rarity: 'common', token: true, keywords: ['taunt'], description: 'Taunt' });
			if (g && spend) { g.attack += spend; g.maxHealth += spend; emit(state, { type: 'buff', uid: g.uid, attack: g.attack, hp: hp(g) }); }
} });

register('gain-random-keyword-per-class-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elitist Snob: for each card of a class in your hand, gain a random keyword
			const kws = e.keywords || ['divine_shield', 'lifesteal', 'rush', 'taunt'];
			const n = state.players[pi].hand.filter(c => c !== source && (c.cardClass || '').split('__').includes(e.cardClass)).length;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });

register('draw-give-spells-to-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Magatha: draw N cards; give any spells drawn to your opponent
			const p = state.players[pi], foe = enemies[0];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 5);
			if (foe != null) { const drawn = p.hand.filter(c => !before.has(c.uid) && isSpellType(c)); for (const c of drawn) { p.hand = p.hand.filter(x => x !== c); if (state.players[foe].hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[c.id] || c, foe); cp.zone = 'hand'; state.players[foe].hand.push(cp); emit(state, { type: 'conjure', player: foe, card: cp, color: null }); } } }
} });

register('summon-died-this-game', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hadronox (Taunt) / Abominable Bowman (Beast, random): resummon fallen friendlies
			const p = state.players[pi];
			let ids = p.deathLogIds.filter(id => {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature') return false;
				if (e.keyword && !(def.keywords || []).includes(e.keyword)) return false;
				if (e.tribe && !(def.tribe || '').includes(e.tribe)) return false;
				return true;
			});
			if (e.random) { if (ids.length) ids = [ids[Math.floor(state.rng() * ids.length)]]; else ids = []; }
			for (const id of ids) summon(state, pi, state.cardsById[id]);
} });

register('copy-random-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mystery Egg: add a copy of a random minion of a tribe in your deck to your hand
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token && (!e.tribe || (d.tribe || '').includes(e.tribe)));
			if (pool.length && p.hand.length < MAX_HAND) { const def = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(def, pi); cp.zone = 'hand'; if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('draw-both-swap-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tentacled Menace: each player draws a card, then swap the two drawn cards' Costs
			const o = enemies[0];
			const before0 = state.players[pi].hand.length; drawCards(state, pi, 1);
			const my = state.players[pi].hand.length > before0 ? state.players[pi].hand[state.players[pi].hand.length - 1] : null;
			let their = null;
			if (o != null) { const b = state.players[o].hand.length; drawCards(state, o, 1); their = state.players[o].hand.length > b ? state.players[o].hand[state.players[o].hand.length - 1] : null; }
			if (my && their) { const t = my.cost; my.cost = their.cost; their.cost = t; }
} });

register('gain-random-keywords-per-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The One-Amalgam Band: gain a random keyword for each distinct minion type played this game
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			const n = state.players[pi].tribesPlayedGame ? state.players[pi].tribesPlayedGame.size : 0;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });

register('isorath-devour', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Isorath: swallow 2 random enemy hand cards; Deathrattle returns them
			for (const o of enemies) {
				const op = state.players[o];
				const eaten = [];
				for (let n = 0; n < 2 && op.hand.length; n++) {
					const i = Math.floor(state.rng() * op.hand.length);
					const [c] = op.hand.splice(i, 1);
					eaten.push(c.id);
					emit(state, { type: 'discard', player: o, card: c });
				}
				if (source) { source._devoured = eaten; source._devouredOwner = o; }
				break;
			}
			if (source) { source.dormantLeft = 2; emit(state, { type: 'dormant', player: pi, uid: source.uid, turns: 2 }); }
} });

register('add-random-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tomb Lurker: add a random creature (optionally with a keyword) that died this game to your hand
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].filter(id => {
				const def = state.cardsById[id];
				return def?.type === 'creature' && (!e.keyword || (def.keywords || []).includes(e.keyword));
			});
			if (pool.length && p.hand.length < MAX_HAND) {
				const def = state.cardsById[pool[Math.floor(state.rng() * pool.length)]];
				const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('ancient-eat', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hungering Ancient: eat a random deck minion, grow by its stats
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature');
			if (idxs.length && source && !isDead(source)) {
				const [id, i] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(i, 1);
				const def = state.cardsById[id];
				source.attack += def.attack || 0; source.maxHealth += def.health || 0;
				(source._eaten = source._eaten || []).push(id);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });

register('return-discarded', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cho'gall: return everything you discarded this game; Soulwarden: N random
			const p = state.players[pi];
			let ids = p.discardLogIds;
			if (e.random) { const pool = [...p.discardLogIds]; ids = []; for (let i = 0; i < (e.count || 1) && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0]); }
			for (const id of ids) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const card = instantiate(def, pi); card.zone = 'hand'; if (e.freeCost) card.cost = 0; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
} });

register('attach-equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kor Outfitter: attach an Equipment you control to a friendly creature
			// (free). No board-permanent targeting UI, so pick an unattached one you
			// control (else any) and put it on the chosen creature.
			const t = chosenCreature();
			const pp = state.players[pi];
			if (t && !isDead(t)) {
				const eqs = pp.artifacts.filter(a => a.equip);
				const eq = eqs.find(a => a.attachedTo === null) || eqs[0];
				if (eq) {
					eq.attachedTo = t.uid;
					emit(state, { type: 'equipAttached', player: pi, equipUid: eq.uid, creatureUid: t.uid, name: eq.name });
					recomputeAuras(state);
				}
			}
} });

register('shuffle-random-legendaries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Prince Malchezaar: shuffle N random Legendary creatures into your deck
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary'
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				p.deck.push(pool[Math.floor(state.rng() * pool.length)].id);
			}
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffledIntoDeck', player: pi, count: e.count || 1 });
} });

register('spammy-arcanist', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spammy Arcanist: deal 1 to all other minions; if any die, repeat
			let guard = 30;
			while (guard-- > 0) {
				const before = state.players.reduce((n, pl) => n + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
				for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && c !== source) damageCreature(state, c, e.value || 1, source);
				sweepDeaths(state);
				const after = state.players.reduce((n, pl) => n + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
				if (after >= before) break; // nothing died
			}
} });

register('leyline-fire', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// a Leyline pulses at the end of your turn
			const p = state.players[pi];
			const boost = p.leylineBoost || 0;
			const fireOnce = () => {
				if (e.kind === 'flame') execEffects(state, pi, [{ type: 'random-damage', value: 2 + boost, count: 1, pool: 'enemies' }], null, source);
				else if (e.kind === 'frost') execEffects(state, pi, [{ type: 'freeze', target: 'random-enemy', count: 1 + boost }], null, source);
				else if (e.kind === 'arcana') execEffects(state, pi, [{ type: 'conjure-random', cardType: 'spell', count: 1 + boost }], null, source);
			};
			fireOnce();
			if (p.leylineDouble) fireOnce();
} });

register('adjacent-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// battlecry blessing on the creatures flanking the source
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			if (idx >= 0) {
				for (const t of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					if (e.attack || e.health) buffCreature(t, e.attack || 0, e.health || 0);
					if (e.keyword && !t.keywords.includes(e.keyword)) {
						t.keywords.push(e.keyword);
						if (e.keyword === KW.DIVINE_SHIELD) t.shield = true;
						if (e.keyword === KW.STEALTH) t.stealthed = true;
					}
					if (e.static) t.static = { ...e.static }; // Ancient Mage's Spell Damage
				}
			}
} });

register('primordial-protector', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Primordial Protector: draw your highest-Cost spell, summon a random minion of that Cost
			const p = state.players[pi];
			let bestI = -1, bestC = -1;
			for (let i = 0; i < p.deck.length; i++) { const d = state.cardsById[p.deck[i]]; if (d && isSpellType(d) && (d.cost || 0) > bestC) { bestC = d.cost || 0; bestI = i; } }
			if (bestI >= 0) { const [id] = p.deck.splice(bestI, 1); const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); execEffects(state, pi, [{ type: 'summon-random', cost: bestC }], null, source); }
} });

register('add-lackey', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rise of Shadows: add a random Lackey to your hand
			const lackeys = ['lackey_ethereal', 'lackey_faceless', 'lackey_goblin', 'lackey_kobold', 'lackey_witchy'];
			for (let i = 0; i < (e.count || 1); i++) {
				const p2 = state.players[pi];
				if (p2.hand.length >= MAX_HAND) break;
				execEffects(state, pi, [{ type: 'add-card', id: lackeys[Math.floor(state.rng() * lackeys.length)] }], target, source);
				if (p2.lackeyBuff) { const added = p2.hand[p2.hand.length - 1]; if (added && added.id.startsWith('lackey_')) { added.attack = p2.lackeyBuff; added.maxHealth = p2.lackeyBuff; } } // Dark Pharaoh Tekahn
			}
} });

register('rebuild-deck-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Archivist Elysiana: replace your deck with 2 copies each of some random cards
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			const deck = [];
			for (let i = 0; i < (e.count || 5) && pool.length; i++) { const d = pool[Math.floor(state.rng() * pool.length)]; deck.push(d.id, d.id); }
			p.deck = deck;
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
} });

register('add-random-outcast-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wretched Exile: add a random Outcast card to your hand (Felerin: count + costMod)
			const pool = Object.values(state.cardsById).filter(d => (d.keywords || []).includes('outcast') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && pool.length && p.hand.length < MAX_HAND; n++) { const cp = instantiate(pool[Math.floor(state.rng() * pool.length)], pi); cp.zone = 'hand'; if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('buff-random-other-grant-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crowd Surfer / Mecha-Leaper: give a random OTHER minion (optional tribe) +X/+X and this same Deathrattle
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; buffCreature(t, e.attack || 1, e.health || 1); if (source && source.deathrattle && source.deathrattle.length) { t.deathrattle = [...(t.deathrattle || []), ...JSON.parse(JSON.stringify(source.deathrattle))]; if (!t.keywords.includes('deathrattle')) t.keywords.push('deathrattle'); } }
} });

register('eat-own-deck-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hungering Ancient: eat a random minion in your OWN deck and gain its stats (Deathrattle add-to-hand not modeled)
			if (source) {
				const p = state.players[pi];
				const idxs = p.deck.map((id, i) => ({ id, i })).filter(x => state.cardsById[x.id]?.type === 'creature');
				if (idxs.length) {
					const pick = idxs[Math.floor(state.rng() * idxs.length)];
					const def = state.cardsById[pick.id];
					p.deck.splice(pick.i, 1);
					source.attack += (def.attack || 0); source.maxHealth += (def.health || 0);
					emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				}
			}
} });

register('repeat-big-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Grey Sage Parrot: repeat the last spell you cast that costs (6) or more
			const lb = state.players[pi].lastBigSpell;
			const def = lb && state.cardsById[lb.id];
			if (def) { const spell = instantiate(def, pi); const spec = targetSpec(state, pi, spell, null); let tgt = lb.target; if (spec && (!tgt || !legalTargets(state, pi, spec).some(t => t.uid === tgt.uid))) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; } emit(state, { type: 'conjure', player: pi, card: spell, color: null }); runSpell(state, pi, spell, tgt, null); sweepDeaths(state); }
} });

register('draw-transform-to-chicken', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gnomish Experimenter: draw a card; if it's a creature, make it a 1/1 Chicken
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && drawn.type === 'creature') {
				drawn.id = 'token_chicken'; drawn.name = 'Chicken'; drawn.attack = 1; drawn.maxHealth = 1;
				drawn.cost = 0; drawn.keywords = []; drawn.tribe = 'Beast'; drawn.effects = null; drawn.ongoing = null; drawn.deathrattle = null;
				emit(state, { type: 'transformed', uid: drawn.uid, player: pi, from: 'card', card: drawn });
			}
} });

register('mill-except-highest', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The 8 Hands From Beyond: destroy both players' decks except the N highest-Cost cards in each
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2];
				const keep = [...pl.deck].sort((a, b) => (state.cardsById[b]?.cost || 0) - (state.cardsById[a]?.cost || 0)).slice(0, e.count || 8);
				const keptCounts = {}; for (const id of keep) keptCounts[id] = (keptCounts[id] || 0) + 1;
				const newDeck = [];
				for (const id of pl.deck) { if ((keptCounts[id] || 0) > 0) { keptCounts[id]--; newDeck.push(id); } }
				pl.deck = newDeck;
				emit(state, { type: 'shuffle', player: s2 });
			}
} });

register('destroy-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			let times = e.count || 1;
			if (e.countPerHoldingTribe) times += state.players[pi].hand.filter(c => (c.tribe || '').includes(e.countPerHoldingTribe)).length; // Disciple of Demise: repeat per held Dragon
			for (let n = 0; n < times; n++) {
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) {
					if (!isDead(c) && (e.maxAttack == null || c.attack <= e.maxAttack)) pool.push(c);
				}
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
} });

register('buff-weapon-or-draw-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Weapons Expert: if you have a weapon, give it +1/+1; otherwise draw a weapon
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += e.attack || 1; p.weapon.durability += e.durability || 1; emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability }); }
			else { const idx = p.deck.findIndex(id => state.cardsById[id]?.type === 'weapon'); if (idx >= 0 && p.hand.length < MAX_HAND) { const [id] = p.deck.splice(idx, 1); const wc = instantiate(state.cardsById[id], pi); wc.zone = 'hand'; p.hand.push(wc); emit(state, { type: 'draw', player: pi, card: wc }); } }
} });

register('mimiron-assemble', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mimiron's Head: if you have 3+ Mechs, destroy them and form V-07-TR-0N
			const p = state.players[pi];
			const mechs = p.board.filter(c => !isDead(c) && (c.tribe || '').includes('Mech'));
			if (mechs.length >= 3) {
				for (const m of mechs) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				sweepDeaths(state);
				summon(state, pi, { id: 'token_v07tr0n', name: 'V-07-TR-0N', type: 'creature', cost: 0, rarity: 'legendary',
					token: true, tribe: 'Mech', attack: 7, health: 8, keywords: ['charge', 'windfury'], description: 'A 7/8 Mech with Charge and Windfury.' });
			}
} });

// ---------- batch 17 (PR 34): 45 more (729 total) ----------

register('copy-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crimson Expanse: summon a copy of the chosen creature at its
			// CURRENT stats, optionally entering Dormant
			const t = chosenCreature();
			if (t) {
				const copy = summon(state, pi, {
					id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity,
					description: t.description, attack: t.attack, health: hp(t),
					keywords: t.keywords.filter(k => !t.auraKeywords.includes(k)),
					tribe: t.tribe, deathrattle: t.deathrattle,
				});
				if (copy && e.dormant) {
					copy.dormantLeft = e.dormant;
					emit(state, { type: 'dormant', player: pi, uid: copy.uid, turns: e.dormant });
				}
			}
} });

register('planeshift', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// shift the arena to a random different plane: old plane departs, new arrives
			const pool = Object.values(state.cardsById).filter(d => d.type === 'plane' && d.id !== state.plane);
			if (pool.length) {
				const old = state.plane, oldDef = old ? state.cardsById[old] : null;
				if (oldDef && oldDef.departure) execEffects(state, pi, oldDef.departure, null, null);
				const next = pool[Math.floor(state.rng() * pool.length)];
				state.plane = next.id;
				emit(state, { type: 'planeshifted', player: pi, from: old, to: next.id, name: next.name });
				if (next.arrival) execEffects(state, pi, next.arrival, null, null);
			}
} });

register('copy-random-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nobleman: create a copy of a random card in your hand (Cloud Serpent: of a tribe, e.g. "Elemental|Dragon")
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && state.cardsById[c.id] && (!e.tribe || e.tribe.split('|').some(tr => (c.tribe || '').includes(tr))) && (!e.school || schoolOf(c) === e.school)); // Malevolent Mutant: a Fel spell
			if (pool.length && p.hand.length < MAX_HAND) { const src = pool[Math.floor(state.rng() * pool.length)]; const nc = instantiate(state.cardsById[src.id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
} });

register('buff-all-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Grand Totem Eys'or: +X/+X to a tribe in hand, deck and battlefield
			const p = state.players[pi];
			for (const c of p.board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.tribe || '').includes(e.tribe)) buffCreature(c, e.attack || 0, e.health || 0);
			for (const c of p.hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; }
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
} });

register('copy-to-all-zones', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sathrovarr: add a copy of a chosen friendly creature to hand, deck, and board
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && state.cardsById[t.id]) {
				if (p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[t.id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
				p.deck.push(t.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				if (p.board.filter(c => !isDead(c)).length < 7) summon(state, pi, state.cardsById[t.id]);
			}
} });

register('swap-stats-two', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chillin' Vol'jin (approx): swap the stats of the chosen minion with a random OTHER minion
			const t = chosenCreature();
			if (t) { const pool = []; for (const pl of state.players) for (const c of pl.board) if (c !== t && !isDead(c) && c.type !== 'location') pool.push(c); if (pool.length) { const t2 = pool[Math.floor(state.rng() * pool.length)]; const a = t.attack, h2 = hp(t); t.attack = t2.attack; t.maxHealth = hp(t2); t.damage = 0; t2.attack = a; t2.maxHealth = h2; t2.damage = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); emit(state, { type: 'buff', uid: t2.uid, attack: t2.attack, hp: hp(t2) }); } }
} });

register('summon-from-deck-suicide', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Maxima Blastenheimer: summon a minion from your deck; it attacks the enemy hero, then dies
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature');
			if (idxs.length) {
				const [id, di] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(di, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c) { const foe = enemies[0]; if (foe != null) resolveCombat(state, pi, c.uid, { type: 'hero', player: foe }); if (!isDead(c)) { c.damage = c.maxHealth; emit(state, { type: 'destroy', uid: c.uid }); sweepDeaths(state); } }
			}
} });

register('replace-spells-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lilian Voss: replace every spell in your hand with a random spell
			const p = state.players[pi];
			const n = p.hand.filter(c => isSpellType(c)).length;
			p.hand = p.hand.filter(c => !isSpellType(c));
			const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let i = 0; i < n && p.hand.length < MAX_HAND && pool.length; i++) {
				const rd = pool[Math.floor(state.rng() * pool.length)];
				const c = instantiate(rd, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('draw-foreign', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dreamwarden: draw a deck card that didn't start there, then grow
			const p = state.players[pi];
			const idx = p.deck.findIndex(id => !(p.startingDeckIds || []).includes(id));
			if (idx >= 0 && p.hand.length < MAX_HAND) {
				const [id] = p.deck.splice(idx, 1);
				const card = instantiate(state.cardsById[id], pi);
				card.zone = 'hand'; card.fromDeck = true; p.hand.push(card);
				emit(state, { type: 'draw', player: pi, card });
				if (source && !isDead(source)) { source.attack += e.attack || 0; source.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
			}
} });

register('voidwalker-envy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Witch of the Arch-Thief: keep summoning while the enemy is ahead on minions
			const p = state.players[pi];
			let guard = 8;
			const enemyCount = () => Math.max(0, ...enemies.map(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length));
			const mine = () => p.board.filter(c => !isDead(c) && c.type !== 'location').length;
			do {
				summon(state, pi, { id: 'token_voidwalker', name: 'Voidwalker', type: 'creature', cost: 1, attack: 1, health: 3, tribe: 'Demon', rarity: 'common', token: true, keywords: ['taunt'], description: 'Taunt' });
			} while (guard-- > 0 && enemyCount() > mine() && mine() < 7);
} });

register('beatrix', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Commander Beatrix: ten copies of a 2-Cost minion join your deck
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.cost || 0) === 2 && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			if (pool.length) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				for (let n = 0; n < 10; n++) p.deck.push(def.id);
				for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				emit(state, { type: 'beatrixPick', player: pi, name: def.name });
			}
} });

register('ivus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ivus, the Forest Lord: spend the rest of your Mana; per crystal, a random bonus
			const p = state.players[pi];
			let n = availableMana(p);
			p.mana.cur = Math.max(0, p.mana.cur - n); p.mana.bonus = 0;
			for (let i = 0; i < n && source && !isDead(source); i++) {
				const roll = Math.floor(state.rng() * 4);
				if (roll === 0) buffCreature(source, 2, 2);
				else { const kw = ['rush', 'divine_shield', 'taunt'][roll - 1]; if (!source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; } }
			}
			emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });

register('toki-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Timelooper Toki: 3 random spells; play all 3 for another Toki
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const group = source ? source.uid : Math.floor(state.rng() * 1e9);
			for (let i = 0; i < 3 && pool.length && p.hand.length < MAX_HAND; i++) {
				const def = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				const c = instantiate(def, pi); c.zone = 'hand'; c._tokiGroup = group;
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });

register('damage-chain-neighbors', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Lurker Below: deal damage to an enemy minion; if it dies, hit a neighbor, repeat
			let t = chosenCreature();
			let guard = 12;
			while (t && !isDead(t) && guard-- > 0) {
				const owner = state.players[t.controller];
				const idx = owner.board.indexOf(t);
				damageCreature(state, t, e.value || 3, source);
				if (!isDead(t)) break;
				// pick a living neighbor of the one that just died
				const neighbors = [owner.board[idx - 1], owner.board[idx + 1]].filter(c => c && !isDead(c) && c.type !== 'location');
				t = neighbors.length ? neighbors[Math.floor(state.rng() * neighbors.length)] : null;
			}
			sweepDeaths(state);
} });

register('transform-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady Prestor: transform minions in your deck into random `tribe` (keep Cost)
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes(e.tribe) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) p.deck = p.deck.map(id => { const d = state.cardsById[id]; if (!d || d.type !== 'creature') return id; const cands = pool.filter(x => (x.cost || 0) === (d.cost || 0)); return cands.length ? cands[Math.floor(state.rng() * cands.length)].id : pool[Math.floor(state.rng() * pool.length)].id; });
} });

register('destroy-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// hit the chosen enemy's weapon if they have one, else any armed enemy
			const armed = enemies.filter(o => state.players[o].weapon);
			const chosen = target?.type === 'hero' && target.player !== pi ? target.player : null;
			const victim = (chosen != null && state.players[chosen].weapon) ? chosen
				: armed.length ? armed[Math.floor(state.rng() * armed.length)] : null;
			if (victim != null) {
				if (e.gainArmorEqAttack) gainArmor(state, pi, state.players[victim].weapon.attack || 0); // Gluttonous Ooze
				if (e.drawDurability) drawCards(state, pi, state.players[victim].weapon.durability);
				breakWeapon(state, victim, true);
			}
} });

register('vyranoth', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vyranoth: a 100-Cost starting-minion deck splits 100 stats into it
			const p = state.players[pi];
			const total = (p.startingDeckIds || []).reduce((s2, id) => { const dd = state.cardsById[id]; return s2 + ((dd && dd.type === 'creature') ? (dd.cost || 0) : 0); }, 0);
			if (total === 100) {
				const minions = p.deck.filter(id => state.cardsById[id]?.type === 'creature');
				for (let n = 0; n < 25 && minions.length; n++) {
					const id = minions[Math.floor(state.rng() * minions.length)];
					(p.deckIdBuffs = p.deckIdBuffs || []).push({ id, attack: 2, health: 2 });
				}
				emit(state, { type: 'vyranothSplit', player: pi });
			}
} });

register('enemy-summon-from-hand-and-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wild Bloodstinger: pull a creature from the opponent's hand into play, then hit it
			const o = enemies[0];
			if (o != null) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (pool.length && op.board.filter(c => !isDead(c)).length < 7) {
					const c = pool[Math.floor(state.rng() * pool.length)];
					op.hand = op.hand.filter(x => x !== c);
					c.zone = 'board'; c.sick = true; op.board.push(c);
					emit(state, { type: 'summon', player: o, card: c }); fireOngoing(state, o, 'summoned', { minion: c }); recomputeAuras(state);
					damageCreature(state, c, e.value || 5, source);
				}
			}
} });

register('buff-self-attack-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mish-Mash Mosher / Barricade Basher: gain +N Attack (and Health) and attack a random enemy minion (guarded chain)
			if (source && !isDead(source)) {
				buffCreature(source, e.attack || 1, e.health || 0);
				state._mmDepth = (state._mmDepth || 0) + 1;
				if (state._mmDepth < 12) {
					const pool = [];
					for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) pool.push({ type: 'creature', uid: c.uid, player: o });
					if (pool.length) resolveCombat(state, pi, source.uid, pool[Math.floor(state.rng() * pool.length)]);
				}
				state._mmDepth--;
			}
} });

register('steal-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Herald of Shadows: steal Health from a minion (it loses Health, this gains it)
			let t = chosenCreature();
			if (e.random) { const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')); t = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; } // K'ara, the Dark Star
			if (t && source && !isDead(source)) { const amt = Math.min(e.value || 2, hp(t) - 1 >= 0 ? (e.value || 2) : 0); t.maxHealth = Math.max(1, t.maxHealth - (e.value || 2)); t.damage = Math.min(t.damage, t.maxHealth); buffCreature(source, 0, e.value || 2); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
} });

register('summon-starship-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gravitational Displacer, when launched: summon a copy of the Starship
			if (source && state.cardsById['gdb_the_starship']) {
				const cp = summon(state, pi, {
					...state.cardsById['gdb_the_starship'],
					attack: source.attack, health: source.maxHealth,
					keywords: source.keywords.filter(k => k !== 'deathrattle'),
					description: source.description,
				});
				if (cp) {
					if (source.deathrattle) { cp.deathrattle = JSON.parse(JSON.stringify(source.deathrattle)); if (!cp.keywords.includes('deathrattle')) cp.keywords.push('deathrattle'); }
					if (source.ongoings) cp.ongoings = JSON.parse(JSON.stringify(source.ongoings));
				}
			}
} });

register('shuffle-died-copies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raza the Resealed: shuffle copies of N random died friendly minions into your deck, cost 0
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			for (let n = 0; n < (e.count || 5) && pool.length; n++) { const def = pool[Math.floor(state.rng() * pool.length)]; p.deck.push(def.id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi }); // NB: the (0)-cost reduction on the shuffled copies is not modeled per-copy
} });

register('recast-own-last-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chatty Macaw: recast the last spell you cast (at a random enemy if it targets)
			const last = state.players[pi].lastSpellPlayed;
			const def = last && state.cardsById[last.id];
			if (def && isSpellType(def)) { let tgt = last.target || null; const foesM = []; for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foesM.push({ type: 'creature', uid: c.uid, player: o }); if (foesM.length) tgt = foesM[Math.floor(state.rng() * foesM.length)]; else { const eh = enemyHero(); if (eh != null) tgt = { type: 'hero', player: eh }; } execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), tgt, source); }
} });

register('devour-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Insatiable Devourer: destroy a chosen enemy minion and gain its stats (Infuse: neighbors too)
			const t = chosenCreature();
			if (t && t.controller !== pi && source && source.zone === 'board' && !isDead(source)) {
				const victims = [t];
				if (e.neighbors) { const b = state.players[t.controller].board; const i = b.indexOf(t); for (const j of [i - 1, i + 1]) { const nb = b[j]; if (nb && !isDead(nb) && nb.type !== 'location') victims.push(nb); } }
				let a = 0, h2 = 0;
				for (const v of victims) { a += v.attack; h2 += hp(v); v.damage = v.maxHealth; v.shield = false; emit(state, { type: 'destroy', uid: v.uid }); }
				buffCreature(source, a, h2);
			}
} });

register('gy-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// graveyard recursion: pick a fallen card back to hand or battlefield
			const p = state.players[pi];
			const pool = p.graveyard.filter(c => {
				const d = state.cardsById[c.id];
				return d && !d.token && d.collectible !== false && (!e.cardType || d.type === e.cardType)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)
					&& (!e.tribe || (d.tribe || '').includes(e.tribe));
			});
			const ids = [...new Set(pool.map(c => c.id))];
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids: ids.slice(0, 8), mode: 'gy',
					to: e.to || 'hand', title: 'Return from the graveyard' });
				emit(state, { type: 'pickStart', player: pi });
			}
} });

register('fyrakk-blaze', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fyrakk: cast N Mana worth of random Fire spells
			let budget = e.budget || 15;
			const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && schoolOf(d) === 'Fire' && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.effects);
			let guard = 30;
			while (budget > 0 && guard-- > 0) {
				const affordable = pool.filter(d => (d.cost || 0) <= budget && (d.cost || 0) > 0);
				if (!affordable.length) break;
				const def = affordable[Math.floor(state.rng() * affordable.length)];
				budget -= def.cost || 1;
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });

register('swap-with-enemy-deck-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Soul Seeker: swap this with a random minion from the opponent's deck
			const foe = enemies[0];
			if (source && foe != null) { const fp = state.players[foe]; const idxs = fp.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token); if (idxs.length) { const [id, i] = idxs[Math.floor(state.rng() * idxs.length)]; fp.deck.splice(i, 1); const p = state.players[pi]; p.board = p.board.filter(c => c !== source); if (state.cardsById[source.id]) fp.deck.push(source.id); source.zone = 'gone'; summon(state, pi, state.cardsById[id]); emit(state, { type: 'bounce', uid: source.uid, player: pi, name: source.name }); } }
} });

register('grant-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const targets = e.target === 'creature' ? [chosenCreature()].filter(Boolean)
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : []) // Fatespinner
				: e.target === 'friendly-others' ? state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && (!e.tribe || (c.tribe || '').includes(e.tribe))) // Rustsworn Cultist / Braingill (tribe filter)
				: state.players[pi].board.filter(c => !isDead(c));
			for (const c of targets) {
				c.deathrattle = (c.deathrattle || []).concat(JSON.parse(JSON.stringify(e.effects)));
				if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle');
			}
} });

register('gain-deathrattles-from-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Da Undatakah: gain the Deathrattles of N friendly creatures that died this game
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
			for (let i = 0; i < (e.count || 3) && pool.length && source; i++) {
				const def = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(def.deathrattle))];
			}
			if (source && source.deathrattle && source.deathrattle.length && !source.keywords.includes('deathrattle')) source.keywords.push('deathrattle');
} });

register('buff-self-per-damaged-then-attack-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Decimator Olgra: +1/+1 per damaged minion, then attack all enemies
			if (source) {
				let n = 0;
				for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.damage > 0 && c.type !== 'location') n++;
				if (n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
				for (const o of enemies) { if (isDead(source)) break; for (const c of [...state.players[o].board]) { if (isDead(source)) break; if (!isDead(c) && c.type !== 'location' && c.dormantLeft <= 0) resolveCombat(state, pi, source.uid, { type: 'creature', uid: c.uid, player: o }); } if (!isDead(source)) resolveCombat(state, pi, source.uid, { type: 'hero', player: o }); }
			}
} });

register('become-friendly-tribe-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shan'do Wildclaw: transform into a copy of a random friendly minion of a tribe
			if (source) {
				const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.tribe));
				if (pool.length) {
					const base = state.cardsById[pool[Math.floor(state.rng() * pool.length)].id];
					if (base) { const tok = instantiate(JSON.parse(JSON.stringify(base)), pi); tok.zone = 'board'; tok.sick = source.sick; const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); }
				}
			}
} });

register('cast-enemy-random-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Unseen Saboteur: an opponent casts a random spell from their hand at random targets
			const o = enemies[0];
			if (o != null) {
				const op = state.players[o];
				const spells = op.hand.filter(c => isSpellType(c));
				if (spells.length) {
					const sp = spells[Math.floor(state.rng() * spells.length)];
					op.hand = op.hand.filter(c => c !== sp);
					const spec = targetSpec(state, o, sp, null);
					let tgt = null;
					if (spec) { const legal = legalTargets(state, o, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; }
					if (!spec || tgt || !spec.required) { runSpell(state, o, sp, tgt, null); sweepDeaths(state); }
				}
			}
} });

register('cast-highest-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Clumsy Courier: cast the highest-Cost spell from your hand (random target)
			const p = state.players[pi];
			let best = null; for (const c of p.hand) if (isSpellType(c) && (!e.school || schoolOf(c) === e.school) && (!best || (c.cost || 0) > (best.cost || 0))) best = c; // e.school -> Felwalker
			if (best) { p.hand = p.hand.filter(c => c !== best); const spec = targetSpec(state, pi, best, null); let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; } emit(state, { type: 'conjure', player: pi, card: best, color: null }); runSpell(state, pi, best, tgt, null); sweepDeaths(state); }
} });

register('damage-random-enemy-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Biopod: deal damage equal to this minion's Attack to a random enemy
			// (count = independent hits; minionsOnly restricts to enemy minions — Felfire Thrusters)
			if (source) {
				const amt = source.attack || 0;
				for (let i = 0; i < (e.count || 1) && amt > 0; i++) {
					const pool = []; for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') pool.push({ o, c }); if (!e.minionsOnly) pool.push({ o, c: null }); }
					if (!pool.length) break;
					const pick = pool[Math.floor(state.rng() * pool.length)];
					if (pick.c) damageCreature(state, pick.c, amt, source); else damageHero(state, pick.o, amt, pi);
				}
			}
} });

register('discard-random-tribe-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Amorphous Slime: discard a random minion of a tribe and remember it for a later summon
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length && source) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); if (!c.token) p.discardLogIds.push(c.id); source.rememberedId = c.id; emit(state, { type: 'discard', player: pi, card: c }); }
		// ('summon-remembered' is handled earlier in the chain — the rememberedId
		// variant that lived here was merged into that branch after the duplicate
		// shadowed it; see tests/tools/twin-audit.mjs)
} });

register('open-pack-play', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Avatar of Hearthstone: open a pack and PLAY everything in it
			const pool = Object.values(state.cardsById).filter(dd => (dd.type === 'creature' || isSpellType(dd)) && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const legendaries = pool.filter(dd => dd.rarity === 'legendary');
			for (let n = 0; n < 5; n++) {
				const src = n === 0 && legendaries.length ? legendaries : pool;
				const def = src[Math.floor(state.rng() * src.length)];
				if (!def) break;
				if (def.type === 'creature') summon(state, pi, def);
				else if (def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });

register('damage-then', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// deal damage, then branch on whether the creature survived
			let v = e.value;
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0) + (source.bonusSpellDamage || 0);
			}
			const t = chosenCreature();
			if (t) {
				damageCreature(state, t, v, null);
				const branch = isDead(t) ? e.ifDies : e.ifSurvives;
				if (branch) execEffects(state, pi, branch, target, source);
			} else if (target?.type === 'hero') {
				damageHero(state, target.player, v, pi);
				if (e.ifSurvives) execEffects(state, pi, e.ifSurvives, target, source); // heroes survive
			}
} });

register('vectus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vectus: summon two 1/1 Whelps, each gains a Deathrattle from a minion that died this game
			const drPool = [...new Set(state.players[pi].deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.deathrattle && d.deathrattle.length);
			for (let n = 0; n < 2; n++) {
				const c = summon(state, pi, { id: 'sch_whelp', name: 'Whelp', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Dragon', attack: 1, health: 1, description: 'A 1/1 Whelp.' });
				if (c && drPool.length) { const d = drPool[Math.floor(state.rng() * drPool.length)]; c.deathrattle = JSON.parse(JSON.stringify(d.deathrattle)); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
			}
} });

register('conjure-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Al'Akir: get e.count creatures whose Cost equals this creature's Attack
			const pcost = source ? source.attack : 0;
			const pp = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
				&& (d.cost || 0) === pcost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi); card.zone = 'hand';
				if (e.costTo != null) card.cost = e.costTo;
				pp.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });

register('conjure-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Discover-a-cost approximation: a random card of that cost
			const p = state.players[pi];
			const ccCost = e.heraldScaled ? hm() : e.cost;
			const pool = Object.values(state.cardsById).filter(d =>
				(d.cost || 0) === ccCost && d.type !== 'land' && !d.token && d.collectible !== false
				&& !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length && p.hand.length < MAX_HAND) {
				const card = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				card.zone = 'hand';
				if (e.setCost != null) card.cost = e.setCost;
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
				fireEmerge(state, pi, card);
			}
} });

register('copy-to-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Manic Soulcaster: shuffle a copy of a chosen friendly creature into your deck
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && state.cardsById[t.id]) {
				const elekk = p.board.filter(c => c.id === 'augmented_elekk' && !isDead(c)).length; // Augmented Elekk: an extra copy per shuffle
				const total = (e.count || 1) * (1 + elekk);
				for (let n = 0; n < total; n++) p.deck.push(t.id);
				for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				emit(state, { type: 'shuffledIntoDeck', player: pi, cardId: t.id }); fireOngoing(state, pi, 'card-shuffled', { cardId: t.id });
			}
} });

register('crumble', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crumblecrusher: a random enemy minion, location, and weapon all crumble
			for (const o of enemies) {
				const op = state.players[o];
				const minions = op.board.filter(c => c.type === 'creature' && !isDead(c));
				if (minions.length) { const t = minions[Math.floor(state.rng() * minions.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
				const locs = op.board.filter(c => c.type === 'location');
				if (locs.length) { const l = locs[Math.floor(state.rng() * locs.length)]; op.board = op.board.filter(x => x !== l); emit(state, { type: 'destroy', uid: l.uid }); }
				if (op.weapon) breakWeapon(state, o, true);
				break;
			}
			sweepDeaths(state);
} });

register('accretion-mill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blazing Accretion: destroy your top 3 cards; Fire spells and Elementals are drawn instead
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 3) && p.deck.length; n++) {
				const id = p.deck.pop();
				const def = state.cardsById[id];
				const keep = def && (((def.tribe || '').includes('Elemental')) || (isSpellType(def) && schoolOf(def) === 'Fire'));
				if (keep && p.hand.length < MAX_HAND) {
					const c = instantiate(def, pi); c.zone = 'hand'; c.fromDeck = true; p.hand.push(c);
					emit(state, { type: 'draw', player: pi, card: c });
				} else if (def) {
					toGraveyard(state, pi, instantiate(def, pi));
					emit(state, { type: 'milled', player: pi, name: def.name });
				}
			}
} });

register('silence', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			if (e.target === 'all-others') { for (const pl of state.players) for (const c of [...pl.board]) if (c !== source && !isDead(c) && c.type === 'creature') silenceCreature(state, c); } // Medivh the Hallowed
			else if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) silenceCreature(state, c); }
			else if (e.target === 'friendly-others') { for (const c of [...state.players[pi].board]) if (c !== source && !isDead(c)) silenceCreature(state, c); } // Wailing Soul
			else if (e.target === 'self') { if (source && !isDead(source)) silenceCreature(state, source); } // Overzealous Healer (Spellburst)
			else { const t = chosenCreature(); if (t) silenceCreature(state, t); }
} });

register('swap-random-hand-cards', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Theotar (approx): swap a random card between each player's hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const fp = state.players[foe]; const mine = p.hand.filter(c => c !== source); if (mine.length && fp.hand.length) { const mi = p.hand.indexOf(mine[Math.floor(state.rng() * mine.length)]); const fi = Math.floor(state.rng() * fp.hand.length); const myCard = p.hand[mi], foeCard = fp.hand[fi]; const toMe = instantiate(state.cardsById[foeCard.id] || foeCard, pi); toMe.zone = 'hand'; const toFoe = instantiate(state.cardsById[myCard.id] || myCard, foe); toFoe.zone = 'hand'; p.hand[mi] = toMe; fp.hand[fi] = toFoe; emit(state, { type: 'conjure', player: pi, card: toMe, color: null }); } }
} });

// ---------- batch 18 (PR 35): 45 more (774 total) ----------

register('copy-deck-deathrattle-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Scourge Illusionist: add a set-stat copy of another Deathrattle minion in your deck to your hand
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.keywords || []).includes('deathrattle') && !d.token && d.id !== (source && source.id));
			if (pool.length && p.hand.length < MAX_HAND) { const def = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(def, pi); cp.zone = 'hand'; if (e.setStats != null) { cp.attack = e.setStats; cp.maxHealth = e.setStats; } if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });

register('summon-from-hand-min-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Giant Anaconda: put a creature from your hand with N+ Attack into play
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && c.attack >= (e.minAttack || 0) && (e.maxCost == null || (c.cost || 0) <= e.maxCost) && (!e.requireKeyword || c.keywords.includes(e.requireKeyword)) && (!e.tribe || (c.tribe || '').includes(e.tribe))); // Coffin Crasher / Piloted Reaper / Oondasta
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); c.zone = 'board'; p.board.push(c); emit(state, { type: 'summon', player: pi, card: c }); fireOngoing(state, pi, 'summoned', { minion: c }); growBlubberBaron(state, pi, c); recomputeAuras(state); }
} });

register('resummon-self-diminished', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rattlegore: resummon this minion with -1/-1 (recurses down to 1/1)
			if (source) {
				const na = (source.attack || 0) - 1, nh = (source.maxHealth || 0) - 1;
				if (na > 0 && nh > 0) {
					const base = state.cardsById[source.id] || {};
					const def = { id: 'token_' + source.id, name: source.name, type: 'creature', cost: source.cost || 0, token: true, rarity: base.rarity || 'legendary', tribe: source.tribe || null, attack: na, health: nh, keywords: [...(base.keywords || [])].filter(k => k !== 'deathrattle'), description: source.name, deathrattle: [{ type: 'resummon-self-diminished' }] };
					if (!def.keywords.includes('deathrattle')) def.keywords.push('deathrattle');
					summon(state, pi, def);
				}
			}
} });

register('reduce-random-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Imprisoned Satyr: reduce the Cost of a random minion in your hand
			// (tribe filter -> Fangbound Druid reduces a Beast; school -> Florist reduces a Nature spell)
			const pool = e.school
				? state.players[pi].hand.filter(c => schoolOf(c) === e.school)
				: e.overload
				? state.players[pi].hand.filter(c => (c.overload || 0) > 0) // Disciple of Golganneth: an Overload card
				: e.anyCard
				? state.players[pi].hand.filter(c => c !== source) // Two-Faced Investor
				: state.players[pi].hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
} });

register('copy-random-enemy-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Incriminating Psychic: copy N random cards from the opponent's hand into yours
			// (Tricky Satyr: `lowest` copies their cheapest card instead)
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const src = state.players[foe].hand.slice(); for (let n = 0; n < (e.count || 1) && src.length && p.hand.length < MAX_HAND; n++) { const i = e.lowest ? src.reduce((bi, c, ci) => ((c.cost || 0) < (src[bi].cost || 0) ? ci : bi), 0) : Math.floor(state.rng() * src.length); const [ec] = src.splice(i, 1); const def = state.cardsById[ec.id] || ec; const card = instantiate(def, pi); card.zone = 'hand'; card._copiedFromEnemy = true; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
} });

register('summon-token-attack-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Factory Assemblybot: summon a token that immediately attacks a random enemy
			const tok = summon(state, pi, state.cardsById[e.summonId] || { id: e.summonId || 'token_bot', name: e.name || 'Bot', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 6, health: e.health || 7 });
			if (tok) { tok.sick = false; const foes = []; for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); } if (foes.length && !isDead(tok)) resolveCombat(state, pi, tok.uid, foes[Math.floor(state.rng() * foes.length)]); }
} });

register('swap-enemy-with-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Translocation Instructor: swap a chosen enemy minion with a random minion in their deck
			const t = chosenCreature();
			if (t && t.controller != null && t.controller !== pi) { const owner = state.players[t.controller]; const idxs = owner.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token); if (idxs.length) { const [id, di] = idxs[Math.floor(state.rng() * idxs.length)]; owner.deck.splice(di, 1); owner.board = owner.board.filter(c => c !== t); if (state.cardsById[t.id]) owner.deck.push(t.id); t.zone = 'gone'; summon(state, t.controller, state.cardsById[id]); emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name }); recomputeAuras(state); } }
} });

register('transform-neighbor-into-copy-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Replicat-o-tron: at end of turn, turn a neighbor into a copy of this
			if (source) {
				const board = state.players[pi].board;
				const i = board.indexOf(source);
				const nbs = [board[i - 1], board[i + 1]].filter(c => c && !isDead(c) && c.type !== 'location' && c.id !== source.id);
				if (nbs.length) {
					const nb = nbs[Math.floor(state.rng() * nbs.length)];
					const base = state.cardsById[source.id];
					if (base) { const tok = instantiate(JSON.parse(JSON.stringify(base)), nb.controller); tok.zone = 'board'; tok.sick = nb.sick; board[board.indexOf(nb)] = tok; nb.zone = 'gone'; emit(state, { type: 'transformed', uid: nb.uid, player: nb.controller, from: nb.name, card: tok }); recomputeAuras(state); }
				}
			}
} });

register('summon-from-deck-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pipsi Painthoof: summon a random minion of each listed keyword from your deck
			const p = state.players[pi];
			const _sfdk = [];
			for (const kw of e.keywords || []) { const idx = p.deck.findIndex(id => { const d = state.cardsById[id]; return d?.type === 'creature' && !d.token && (d.keywords || []).includes(kw); }); if (idx >= 0) { const [id] = p.deck.splice(idx, 1); const sm = summon(state, pi, state.cardsById[id]); if (sm) _sfdk.push(sm); } }
			// High Cultist Herenn: the two summoned minions fight each other
			if (e.fight && _sfdk.length === 2 && !isDead(_sfdk[0]) && !isDead(_sfdk[1])) {
				damageCreature(state, _sfdk[1], _sfdk[0].attack, _sfdk[0]);
				damageCreature(state, _sfdk[0], _sfdk[1].attack, _sfdk[1]);
			}
} });

register('summon-random-died-game', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Psychopomp: summon a random friendly creature that died this game, optionally granting a keyword
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (!e.requireKeyword || (d.keywords || []).includes(e.requireKeyword)) && (e.maxCost == null || (d.cost || 0) <= e.maxCost) && (e.minCost == null || (d.cost || 0) >= e.minCost)); // Wakener of Souls / Ravenous Felhunter / Ferocious Felbat
			if (pool.length) { const def = pool[Math.floor(state.rng() * pool.length)]; for (let n = 0; n < (e.count || 1); n++) { const c = summon(state, pi, def); if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); } } // count 2 = resurrect + a copy
} });

register('reanimate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// summon the highest-Cost creature from your graveyard, with riders
			const p = state.players[pi];
			const cands = p.graveyard.filter(c => { const d = state.cardsById[c.id]; return d && d.type === 'creature' && !d.token && d.collectible !== false; });
			if (cands.length) {
				let best = cands[0];
				for (const c of cands) if ((state.cardsById[c.id].cost || 0) > (state.cardsById[best.id].cost || 0)) best = c;
				p.graveyard = p.graveyard.filter(c => c !== best);
				const c = summon(state, pi, state.cardsById[best.id]);
				if (c) {
					if (e.attack || e.health) buffCreature(c, e.attack || 0, e.health || 0);
					for (const kw of e.keywords || []) { if (!c.keywords.includes(kw)) c.keywords.push(kw); if (kw === KW.DIVINE_SHIELD) c.shield = true; }
				}
			}
} });

register('corpse-gain-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Boneshredder: spend N Corpses to gain + trigger a random died friendly's Deathrattle
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 5)) {
				const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
				if (pool.length && source) { p.corpses -= (e.cost || 5); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); const pick = pool[Math.floor(state.rng() * pool.length)]; source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(pick.deathrattle))]; if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle'); execEffects(state, pi, JSON.parse(JSON.stringify(pick.deathrattle)), null, source); }
			}
} });

register('temp-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "+N Attack this turn": a chosen creature, all your creatures, or
			// (when a hero was chosen) that hero
			const bump = t => {
				t.attack += e.attack || 0;
				t.tempAttack += e.attack || 0;
				if (e.health) { t.maxHealth += e.health; t.tempHealth = (t.tempHealth || 0) + e.health; } // Giant Growth: +N/+N this turn
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			};
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) bump(c);
			} else {
				const t = chosenCreature();
				if (t) bump(t);
				else if (target?.type === 'hero') {
					state.players[target.player].heroTempAttack += e.attack || 0;
					emit(state, { type: 'heroBuffed', player: target.player, amount: e.attack || 0 });
				}
			}
} });

register('drakkari-swap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Drakkari Trickster: each player gets a copy of a random card from their opponent's deck
			const o = enemies[0];
			if (o != null) {
				const p = state.players[pi], op = state.players[o];
				if (op.deck.length && p.hand.length < MAX_HAND) { const id = op.deck[Math.floor(state.rng() * op.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
				if (p.deck.length && op.hand.length < MAX_HAND) { const id = p.deck[Math.floor(state.rng() * p.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, o); c.zone = 'hand'; op.hand.push(c); emit(state, { type: 'conjure', player: o, card: c, color: null }); } }
			}
} });

register('destroy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const t = chosenCreature();
			if (t && (e.requireHeroHealthChanged == null || state.players[pi].heroHealthChangedThisTurn)
					&& (e.maxAttack == null || t.attack <= e.maxAttack)
				&& (e.maxCost == null || (t.cost || 0) <= e.maxCost)
				&& (e.minAttack == null || t.attack >= e.minAttack)
				&& (e.requireKeyword == null || t.keywords.includes(e.requireKeyword))
				&& (e.requireRarity == null || t.rarity === e.requireRarity)
				&& (e.tribe == null || (t.tribe || '').includes(e.tribe))
				&& !(e.requireDamaged && t.damage === 0)) {
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				// riders that only apply when something was actually destroyed
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
} });

register('deploy-equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Stoneforge Mystic: put an Equipment from your hand into play (unattached)
			const pp = state.players[pi];
			const pool = pp.hand.filter(c => c.equip);
			const drop = (card) => {
				pp.hand = pp.hand.filter(x => x !== card);
				card.zone = 'artifact'; card.attachedTo = null;
				pp.artifacts.push(card);
				if (card.effects) execEffects(state, pi, card.effects, null, card);
				recomputeAuras(state);
				emit(state, { type: 'deployedEquip', player: pi, uid: card.uid, name: card.name });
				fireOngoing(state, pi, 'equipment-entered', { equip: card });
			};
			if (pool.length === 1) drop(pool[0]);
			else if (pool.length > 1) state.pickQueue.push({ player: pi, ids: [...new Set(pool.map(c => c.id))].slice(0, 8), mode: 'deploy-equip', title: 'Put an Equipment into play' });
} });

register('transform-self-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Druid of the Plains (Frenzy): transform this minion into a fixed-stat token
			if (source && source.zone === 'board' && !isDead(source)) {
				const tok = instantiate({ id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: e.name || 'Token', type: 'creature', cost: e.cost || 0, rarity: 'common', token: true, tribe: e.tribe || source.tribe || null, attack: e.attack, health: e.health, keywords: e.keywords || [], description: e.description || `A ${e.attack}/${e.health} token.` }, pi);
				tok.zone = 'board'; tok.sick = source.sick;
				const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state);
			}
} });

register('replace-with-legendaries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Arch-Villain Rafaam: replace your hand and deck with random Legendary creatures
			const p = state.players[pi];
			const legends = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (legends.length) {
				const handN = p.hand.filter(c => c !== source).length;
				p.hand = p.hand.filter(c => c === source);
				for (let i = 0; i < handN && p.hand.length < MAX_HAND; i++) { const c = instantiate(legends[Math.floor(state.rng() * legends.length)], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
				p.deck = p.deck.map(() => legends[Math.floor(state.rng() * legends.length)].id);
			}
} });

register('equip-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blingtron 3000: equip a random weapon (self, or each player)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'weapon'
				&& !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.attack && d.durability);
			const who = e.eachPlayer ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const tp of who) {
				if (!pool.length) break;
				const wd = pool[Math.floor(state.rng() * pool.length)];
				const bA = (tp === pi && e.selfBuff) ? (e.selfBuff.attack || 0) : 0; // Stadium Announcer: yours gets +1/+1
				const bD = (tp === pi && e.selfBuff) ? (e.selfBuff.durability || 0) : 0;
				execEffects(state, tp, [{ type: 'equip', name: wd.name, attack: wd.attack + bA, durability: wd.durability + bD }], null, null);
			}
} });

register('become-copy-of-random-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shapeless Constellation: transform into a set-stat copy of a random minion in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length && source && source.zone === 'board' && !isDead(source)) { const pick = pool[Math.floor(state.rng() * pool.length)]; const base = state.cardsById[pick.id]; if (base) { const def = JSON.parse(JSON.stringify(base)); if (e.stats != null) { def.attack = e.stats; def.health = e.stats; } def.token = true; def.id = 'token_' + base.id; const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick; const board = p.board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); } }
} });

register('magtheridon-warder-death', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Magtheridon's Warders: when the last one dies, wipe the board and awaken him
			const anyWarder = state.players.some(pl => pl.board.some(c => c.id === 'bt_magtheridon_warder' && !isDead(c)));
			if (!anyWarder) {
				let mag = null, magOwner = -1;
				for (let s2 = 0; s2 < state.players.length; s2++) for (const c of state.players[s2].board) if (c.id === 'magtheridon' && c.dormantLeft > 0) { mag = c; magOwner = s2; }
				if (mag) {
					mag.dormantLeft = 0; mag.sick = true; emit(state, { type: 'awaken', player: magOwner, uid: mag.uid, name: mag.name });
					for (const pl of state.players) for (const c of [...pl.board]) if (c !== mag && !isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
					sweepDeaths(state);
				}
			}
} });

register('adapt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// paper rule: roll a d10 three times (reroll dupes); the controller
			// picks ONE of the three, applied to the adapting creature(s)
			let targets;
			if (e.name) targets = state.players[pi].board.filter(c => !isDead(c) && c.name === e.name); // Lightfused Stegodon: Silver Hand Recruits
			else if (e.target === 'friendly-creatures') targets = state.players[pi].board.filter(c => !isDead(c));
			else if (e.tribe) targets = state.players[pi].board.filter(c => !isDead(c) && (c.tribe || '').includes(e.tribe));
			else { const t = chosenCreature() || (source && source.zone === 'board' && !isDead(source) ? source : null); targets = t ? [t] : []; }
			targets = targets.filter(c => c.type !== 'location');
			for (let n = 0; n < (e.times || 1); n++) queueAdapt(state, pi, targets); // Ravenous Pterrordax: Adapt twice
} });

register('summon-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Voidcaller: a random qualifying creature jumps from hand to board.
			// count>1 pulls that many (Beastmaster Leoroxx: 3 Beasts from hand)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const pool = p.hand.filter(c => c.type === 'creature'
					&& (!e.tribe || (c.tribe || '').includes(e.tribe))
					&& (e.maxCost == null || (c.cost || 0) <= e.maxCost) // Razorboar
					&& (!e.requireKeyword || (c.keywords || []).includes(e.requireKeyword)));
				if (!pool.length) break;
				const c = pool[Math.floor(state.rng() * pool.length)];
				p.hand = p.hand.filter(x => x !== c);
				c.zone = 'board';
				c.sick = true;
				p.board.push(c);
				emit(state, { type: 'summon', player: pi, card: c });
				fireOngoing(state, pi, 'summoned', { minion: c });
				recomputeAuras(state);
			}
} });

register('shuffle-random-spells-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blasteroid: shuffle N random spells (optionally of a school) into your deck; they cost less
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && (!e.school || schoolOf(d) === e.school));
			if (pool.length) {
				for (let n = 0; n < (e.count || 1); n++) {
					const def = pool[Math.floor(state.rng() * pool.length)];
					p.deck.push(def.id);
					if (e.costMod) { p.deckCostOverrides = p.deckCostOverrides || {}; p.deckCostOverrides[def.id] = Math.max(0, (def.cost || 0) + e.costMod); }
				}
				for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				emit(state, { type: 'shuffle', player: pi });
			}
} });

register('become-copy-of-random-damaged', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Battleworn Faceless: transform into a full copy of a random damaged minion in play
			const pool = [];
			for (const pl of state.players) for (const c of pl.board) if (c !== source && !isDead(c) && c.type !== 'location' && c.damage > 0) pool.push(c);
			if (pool.length && source && source.zone === 'board' && !isDead(source)) { const victim = pool[Math.floor(state.rng() * pool.length)]; const base = state.cardsById[victim.id]; if (base) { const def = JSON.parse(JSON.stringify(base)); def.token = true; def.id = 'token_' + base.id; const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick; const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); } }
} });

register('hand-pick', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// choose one of your own hand cards; the chosen card is acted on in resolvePick
			const p = state.players[pi];
			let pool = p.hand.filter(c => c !== source);
			if (e.cardType === 'spell') pool = pool.filter(c => isSpellType(c));
			else if (e.cardType) pool = pool.filter(c => c.type === e.cardType);
			if (e.maxCost != null) pool = pool.filter(c => (c.cost || 0) <= e.maxCost);
			if (e.school) pool = pool.filter(c => schoolOf(c) === e.school); // Malevolent Mutant: Fel spells
			const ids = [...new Set(pool.map(c => c.id))];
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids, handPick: { action: e.action, value: e.valueFromSelfAttack && source ? (source.attack || 0) : (e.value ?? null), sourceUid: source ? source.uid : null } });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('buff-zones', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// buff creatures in hand + on the battlefield now, and creatures still in
			// the deck as they are drawn (deck cards have no live identity until drawn)
			const p = state.players[pi];
			const match = c => !e.nameIncludes || (c.name || '').includes(e.nameIncludes); // Green Rafaam: only Rafaams
			if (!e.skipBoard && !e.deckOnly) for (const c of p.board) if (c.type === 'creature' && !isDead(c) && c !== source && match(c)) buffCreature(c, e.attack || 0, e.health || 0); // Mistcaller: hand+deck only
			if (!e.deckOnly) for (const c of p.hand) if (c.type === 'creature' && match(c)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; } // Prince Keleseth: deck only
			if (!e.nameIncludes) {
				p.drawBuff = p.drawBuff || { attack: 0, health: 0 };
				p.drawBuff.attack += e.attack || 0; p.drawBuff.health += e.health || 0;
			}
} });

register('summon-deck-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Barnes: summon a copy of a random creature in YOUR deck (original
			// stays); attack/health override forces token stats. The Boom Reaver
			// (e.grant): the copy gains a keyword. (Merged: this branch shadowed
			// the grant-carrying duplicate.)
			const p = state.players[pi];
			const ids = p.deck.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) {
				const def = state.cardsById[ids[Math.floor(state.rng() * ids.length)]];
				const c = summon(state, pi, def);
				if (c && e.attack != null) {
					c.attack = e.attack + c.auraAttack;
					c.maxHealth = e.health + c.auraHealth;
					c.damage = 0;
				}
				if (c && e.grant && !c.keywords.includes(e.grant)) {
					c.keywords.push(e.grant);
					if (e.grant === KW.DIVINE_SHIELD) c.shield = true;
					if (e.grant === KW.STEALTH) c.stealthed = true;
				}
			}
} });

register('imbue', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Emerald Dream Imbue: upgrade your Hero Power to the class Blessing; each Imbue makes it stronger
			const p = state.players[pi];
			p.imbueCount = (p.imbueCount || 0) + 1;
			const IMBUED = { druid: 'hp_blessing_golem', hunter: 'hp_blessing_wolf', mage: 'hp_blessing_wisp', priest: 'hp_blessing_moon', shaman: 'hp_blessing_wind', paladin: 'hp_blessing_dragon' };
			const pid = IMBUED[p.heroClass];
			const def = pid && state.cardsById[pid];
			if (def) {
				if (!p.heroPowers.some(hp0 => hp0.id === pid)) { const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false; p.heroPowers = [power]; emit(state, { type: 'heroPowerGained', player: pi, card: power }); }
			} else p.heroPowerUpgraded = true; // classless/off-class heroes keep the double-fire fallback
			emit(state, { type: 'imbue', player: pi, count: p.imbueCount });
} });

register('become-copy-of-random-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cover Artist: transform into a set-stat copy of a random minion
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== (source && source.id));
			if (pool.length && source && source.zone === 'board' && !isDead(source)) { const base = pool[Math.floor(state.rng() * pool.length)]; const def = JSON.parse(JSON.stringify(base)); def.attack = e.stats ?? 3; def.health = e.stats ?? 3; def.token = true; def.id = 'token_' + base.id; const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick; const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); }
} });

register('copy-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Puppet Theatre: a copy of the chosen creature lands in your hand,
			// optionally with overridden stats/cost (1/1 copy that costs 1)
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && p.hand.length < MAX_HAND && !p.eliminated) {
				const def = state.cardsById[t.id];
				const copy = def ? instantiate(def, pi) : instantiate({
					id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity,
					description: t.description, attack: t.attack, health: t.maxHealth,
					keywords: [...t.keywords], tribe: t.tribe,
				}, pi);
				copy.zone = 'hand';
				if (e.setAttack != null) copy.attack = e.setAttack;
				if (e.setHealth != null) copy.maxHealth = e.setHealth;
				if (e.setCost != null) copy.cost = e.setCost;
				p.hand.push(copy);
				emit(state, { type: 'conjure', player: pi, card: copy, color: null });
			}
} });

register('become-copy-of-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Nameless One: become a set-stat copy of a chosen minion, then Silence it
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source)) {
				const base = state.cardsById[t.id];
				if (base) {
					const def = JSON.parse(JSON.stringify(base));
					if (!e.fullCopy) { def.attack = e.stats ?? 4; def.health = e.stats ?? 4; } // Imp-oster: fullCopy keeps stats
					def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick;
					const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok });
					if (e.silence) silenceCreature(state, t); // The Nameless One silences; Imp-oster doesn't
					recomputeAuras(state);
				}
			}
} });

register('transform-copy-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Muckmorpher: become a stat-set copy of a random creature in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token && d.id !== (source && source.id));
			if (pool.length && source && source.zone === 'board' && !isDead(source)) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const clone = instantiate(def, source.controller);
				clone.zone = 'board'; clone.sick = source.sick;
				if (e.setAttack != null) clone.attack = e.setAttack;
				if (e.setHealth != null) { clone.maxHealth = e.setHealth; clone.damage = 0; }
				const board = p.board; board[board.indexOf(source)] = clone; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: clone });
				recomputeAuras(state);
			}
} });

register('forefather-guess', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Futuristic Forefather: guess which card is in the enemy hand
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const real = state.players[foe].hand[Math.floor(state.rng() * state.players[foe].hand.length)];
				const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.id !== real.id);
				const ids = [real.id];
				for (let i = 0; i < 2 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
				for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
				state.pickQueue.push({ player: pi, ids, guessId: real.id, guessUid: source ? source.uid : null });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('transform-self-into-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Caria Felsoul: transform into an N/N copy of a minion of `tribe` from your deck
			const p = state.players[pi];
			const ids = p.deck.filter(id => { const d = state.cardsById[id]; return d && d.type === 'creature' && (d.tribe || '').includes(e.tribe); });
			if (ids.length && source && source.zone === 'board' && !isDead(source)) {
				const base = state.cardsById[ids[Math.floor(state.rng() * ids.length)]];
				const def = JSON.parse(JSON.stringify(base)); if (e.stats != null) { def.attack = e.stats; def.health = e.stats; } def.token = true; def.id = 'token_' + base.id;
				const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick;
				const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state);
			}
} });

register('torga-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Torga: draw a Kindred card, then draw a minion that shares a type with it
			const p = state.players[pi];
			const ki = p.deck.findIndex(id => state.cardsById[id]?.kindredCard);
			if (ki >= 0) {
				const [id] = p.deck.splice(ki, 1);
				const card = instantiate(state.cardsById[id], pi); card.zone = 'hand'; card.fromDeck = true; p.hand.push(card);
				emit(state, { type: 'draw', player: pi, card });
				const tribes = (card.tribe || '').split('/').filter(Boolean);
				const ai = p.deck.findIndex(id2 => { const dd = state.cardsById[id2]; return dd?.type === 'creature' && id2 !== id && tribes.some(t => ((dd.tribe || '')).includes(t) || dd.tribe === 'All'); });
				if (ai >= 0) { const [id2] = p.deck.splice(ai, 1); const c2 = instantiate(state.cardsById[id2], pi); c2.zone = 'hand'; c2.fromDeck = true; p.hand.push(c2); emit(state, { type: 'draw', player: pi, card: c2 }); }
			}
} });

register('buff-self-per', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Clockwork Rager (turns taken) / Heir of Hereafter (damaged minions) / Duke of Below (discards)
			if (source && !isDead(source)) {
				let n = 0;
				if (e.per === 'turns-taken') n = Math.max(1, Math.ceil((state.turnNumber || 1) / 2));
				else if (e.per === 'damaged-minions') { for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location' && c.damage > 0) n++; }
				else if (e.per === 'discards-game') n = (state.players[pi].discardLogIds || []).length;
				else if (e.per === 'cards-played') n = state.players[pi].cardsPlayedThisTurn || 0; // Defias Wannabe: each OTHER card played this turn (counter increments after the battlecry, so it already excludes this card)
				if (n > 0) { source.attack += (e.attack || 0) * n; source.maxHealth += (e.health || 0) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
			}
} });

register('grant-hand-school-spelldamage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Silvermoon Farstrider: give all spells of a school in your hand Spell Damage +N; Halduron: also deck; Battlefield Blaster: one random; Archmage Kalec: all + all-deck
			const p = state.players[pi];
			if (e.random) { const pool = p.hand.filter(c => isSpellType(c) && (!e.school || schoolOf(c) === e.school)); if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.bonusSpellDamage = (c.bonusSpellDamage || 0) + (e.value || 1); } }
			else for (const c of p.hand) if (isSpellType(c) && (!e.school || schoolOf(c) === e.school)) c.bonusSpellDamage = (c.bonusSpellDamage || 0) + (e.value || 1);
			if (e.alsoDeck && e.school) { p.deckSchoolSpellDamage = p.deckSchoolSpellDamage || {}; p.deckSchoolSpellDamage[e.school] = (p.deckSchoolSpellDamage[e.school] || 0) + (e.value || 1); }
			if (e.allDeck) p.deckSpellDamageAll = (p.deckSpellDamageAll || 0) + (e.value || 1); // Archmage Kalec
} });

register('harth-hands', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Harth Stonebrew: an iconic hand from Hearthstone's past
			const p = state.players[pi];
			const HANDS = [
				['ragnaros_the_firelord', 'ysera', 'alexstrasza', 'deathwing'],
				['leeroy_jenkins', 'coin', 'coin', 'shadowstep'],
				['ancient_watcher', 'sunfury_protector', 'ironbeak_owl', 'faceless_manipulator'],
				['northshire_cleric', 'wild_pyromancer', 'injured_blademaster', 'circle_of_healing'],
			].map(h => h.filter(id => state.cardsById[id])).filter(h => h.length >= 3);
			const pick = HANDS.length ? HANDS[Math.floor(state.rng() * HANDS.length)] : null;
			if (pick) {
				for (const c of p.hand) if (c !== source) toGraveyard(state, pi, c);
				p.hand = p.hand.filter(c => c === source);
				for (const id of pick) {
					const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
					emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
			}
} });

register('become-copy-of-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Prince Taldaram: transform into a stat-fixed copy of a random creature in hand
			if (source && source.zone === 'board' && !isDead(source)) {
				const p = state.players[pi];
				const pool = p.hand.filter(c => c.type === 'creature');
				if (pool.length) {
					const pick = pool[Math.floor(state.rng() * pool.length)];
					const base = state.cardsById[pick.id] || pick;
					const def = JSON.parse(JSON.stringify(base));
					const st = e.setStats ?? 3;
					def.attack = st; def.health = st; def.cost = st; def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, source.controller);
					tok.zone = 'board'; tok.sick = source.sick;
					const board = p.board;
					board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: tok });
					recomputeAuras(state);
				}
			}
} });

register('talanji', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Talanji: register the chosen Boon, then draw Bwonsamdi (or resurrect him)
			const p = state.players[pi];
			p.bwonsamdiBoons = p.bwonsamdiBoons || { keywords: [], costBonus: 0 };
			if (e.boon && !p.bwonsamdiBoons.keywords.includes(e.boon)) { p.bwonsamdiBoons.keywords.push(e.boon); p.bwonsamdiBoons.costBonus += 2; }
			const def = state.cardsById['time_bwonsamdi'];
			if (def) {
				if (p.bwonsamdiDied) {
					const bw = summon(state, pi, def);
					if (bw) for (const k of p.bwonsamdiBoons.keywords) if (!bw.keywords.includes(k)) { bw.keywords.push(k); if (k === KW.DIVINE_SHIELD) bw.shield = true; }
				} else if (p.hand.length < MAX_HAND) {
					const bw = instantiate(def, pi);
					for (const k of p.bwonsamdiBoons.keywords) if (!bw.keywords.includes(k)) bw.keywords.push(k);
					bw.zone = 'hand'; p.hand.push(bw);
					emit(state, { type: 'conjure', player: pi, card: bw, color: null });
				}
			}
} });

register('give-enemy-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mulch: a random creature lands in an opponent's hand
			const victim = enemyHero();
			if (victim != null) {
				let pool = Object.values(state.cardsById).filter(d =>
					d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander
					&& !(d.colors && d.colors.length));
				if (e.cardType === 'creature') pool = pool.filter(d => d.type === 'creature');
				const vp = state.players[victim];
				if (pool.length && vp.hand.length < MAX_HAND) {
					const card = instantiate(pool[Math.floor(state.rng() * pool.length)], victim);
					card.zone = 'hand';
					vp.hand.push(card);
					emit(state, { type: 'conjure', player: victim, card, color: null });
				}
			}
		// ('buff-random-friendly' is handled earlier in the chain — the `count`
		// loop was merged there after this duplicate was shadowed. The secret
		// executor keeps its own trigger-side copy; see twin-audit.mjs.)
} });

register('transform-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Furbolg Mossbinder: turn a chosen creature into a fixed-stat token
			if (e.requireElementalLastTurn && !state.players[pi].elementalLastTurn) return; // Lilypad Lurker
			const t = chosenCreature();
			if (t && t.controller != null && !isDead(t)) {
				const owner = t.controller;
				const tok = instantiate({ id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name || 'Elemental', type: 'creature', cost: 0, rarity: 'common', token: true,
					tribe: e.tribe || null, attack: e.attack, health: e.health, keywords: e.keywords || [],
					description: e.description || `A ${e.attack}/${e.health} token.` }, owner);
				tok.zone = 'board'; tok.sick = t.sick;
				const board = state.players[owner].board;
				board[board.indexOf(t)] = tok; t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: owner, from: t.name, card: tok });
				recomputeAuras(state);
			}
} });

register('destroy-enemy-hand-deck-board', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Patchwerk: destroy a random minion in the opponent's hand, deck, and battlefield
			for (const o of enemies) {
				const op = state.players[o];
				const handPool = op.hand.filter(c => c.type === 'creature');
				if (handPool.length) { const c = handPool[Math.floor(state.rng() * handPool.length)]; op.hand = op.hand.filter(x => x !== c); emit(state, { type: 'discard', player: o, card: c }); }
				const deckIdxs = op.deck.map((id, i) => ({ id, i })).filter(x => state.cardsById[x.id]?.type === 'creature');
				if (deckIdxs.length) { const pick = deckIdxs[Math.floor(state.rng() * deckIdxs.length)]; op.deck.splice(pick.i, 1); }
				const boardPool = op.board.filter(c => !isDead(c) && c.type !== 'location');
				if (boardPool.length) { const c = boardPool[Math.floor(state.rng() * boardPool.length)]; c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
				break;
			}
			sweepDeaths(state);
} });

register('cast-spell-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// High Abbess Alura (Spellburst): cast a random spell from your deck (targets source if possible)
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const d = state.cardsById[id]; return d && isSpellType(d) && (e.maxCost == null || (d.cost || 0) <= e.maxCost); }); // Violet Treasuregill: 2 or less
			if (idxs.length) {
				const [id, di] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(di, 1);
				const spell = instantiate(state.cardsById[id], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); const selfT = source && legal.find(t => t.uid === source.uid); tgt = selfT || (legal.length ? legal[Math.floor(state.rng() * legal.length)] : null); }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null);
				sweepDeaths(state);
			}
} });

// ---------- batch 19 (PR 36): the final 32 movable branches (806 total) ----------
// The mechanical pool is EMPTY: every remaining chain branch either has a
// loop-scoped `continue` (needs per-body analysis) or a trigger-side switch
// twin (deliberate retirement). This batch carries the giants: conditional
// (407 data uses), summon (548), discover (207), conjure-random (169),
// heal (145), summon-random (100).

register('summon-from-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Finja: summon N creatures of a tribe from your deck onto the battlefield
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (!e.tribe || (def.tribe || '').includes(e.tribe)); });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c && e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; } // Possessed Animancer: Lifesteal
				if (c && e.chainDeathrattleSummonId && state.cardsById[e.chainDeathrattleSummonId]) { // Moragg: "Deathrattle: Summon Moragg"
					c.deathrattle = [...(c.deathrattle || []), { type: 'summon', count: 1, summonId: e.chainDeathrattleSummonId }];
					if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle');
				}
			}
} });

register('add-hagatha-horror', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Swampqueen Hagatha: add a 5/5 Horror with two random Shaman spells baked in
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) {
				const spells = Object.values(state.cardsById).filter(d => isSpellType(d) && d.cardClass === 'shaman' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
				const chosen = [];
				for (let i = 0; i < 2 && spells.length; i++) chosen.push(spells[Math.floor(state.rng() * spells.length)]);
				const bc = chosen.flatMap(sp => JSON.parse(JSON.stringify(sp.effects || [])));
				const horror = instantiate({ id: 'dal_drustvar_horror', name: 'Drustvar Horror', type: 'creature', cost: 5, token: true, rarity: 'epic', set: 'DALARAN', attack: 5, health: 5, keywords: bc.length ? ['battlecry'] : [], description: '5/5. ' + chosen.map(s => s.name).join(', '), effects: bc }, pi);
				horror.zone = 'hand'; p.hand.push(horror); emit(state, { type: 'conjure', player: pi, card: horror, color: null });
			}
} });

register('blessing-wind', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shaman: transform a random friendly minion into one that costs (N) more
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			const p = state.players[pi];
			const pool2 = p.board.filter(c => !isDead(c) && c.type !== 'location' && !c.token);
			if (pool2.length) {
				const t = pool2[Math.floor(state.rng() * pool2.length)];
				const targetCost = (t.cost || 0) + n;
				const opts = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.cost || 0) === targetCost && !dd.token && dd.collectible !== false && !dd.companion && !dd.commander && !(dd.colors && dd.colors.length));
				if (opts.length) {
					const nd = instantiate(opts[Math.floor(state.rng() * opts.length)], pi);
					nd.zone = 'board'; nd.sick = t.sick;
					const bi = p.board.indexOf(t);
					if (bi >= 0) { p.board[bi] = nd; t.zone = 'gone'; emit(state, { type: 'transformed', uid: t.uid, player: pi, from: t.name, card: nd }); recomputeAuras(state); }
				}
			}
} });

register('shuffle-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raptor/Direhorn Hatchling: shuffle a token into your deck; Weasel
			// Tunneler (enemy:true) shuffles itself into an opponent's deck
			const owners = e.enemy ? enemies.filter(o => !state.players[o].eliminated) : [pi];
			const elekkS = state.players[pi].board.filter(c => c.id === 'augmented_elekk' && !isDead(c)).length; // Augmented Elekk
			const shufOwners = e.eachPlayer ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : owners; // Hakkar: each player
			for (const own of shufOwners) {
				const dk = state.players[own].deck;
				if (!e.id || !state.cardsById[e.id]) break;
				for (let n = 0; n < (e.count || 1) * (own === pi ? (1 + elekkS) : 1); n++) dk.push(e.id);
				for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
				emit(state, { type: 'shuffledIntoDeck', player: own, cardId: e.id }); if (own === pi) fireOngoing(state, pi, 'card-shuffled', { cardId: e.id });
			}
} });

register('spell-joust-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raven Familiar: reveal a random spell from each deck; if yours costs more, draw it
			const p = state.players[pi];
			const mine = p.deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d));
			const foe = enemies[0] != null ? state.players[enemies[0]].deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d)) : [];
			if (mine.length) {
				const my = mine[Math.floor(state.rng() * mine.length)];
				const their = foe.length ? foe[Math.floor(state.rng() * foe.length)] : null;
				emit(state, { type: 'joust', player: pi, myName: my.name, myCost: my.cost, enemyName: their?.name || null, enemyCost: their?.cost ?? null, win: (my.cost || 0) > (their?.cost ?? -1) });
				if ((my.cost || 0) > (their?.cost ?? -1) && p.hand.length < MAX_HAND) {
					const j = p.deck.indexOf(my.id);
					if (j >= 0) { p.deck.splice(j, 1); const card = instantiate(my, pi); card.zone = 'hand'; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); }
				}
			}
} });

register('copy-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// copy random card(s) from an opponent's hand or deck (originals stay)
			const victim = enemyHero();
			if (victim != null) {
				const p = state.players[pi], op = state.players[victim];
				for (let i = 0; i < (e.count || 1); i++) {
					let def = null;
					if (e.from === 'hand') {
						const pool = op.hand.filter(c => state.cardsById[c.id]);
						if (pool.length) def = state.cardsById[pool[Math.floor(state.rng() * pool.length)].id];
					} else {
						let ids = op.deck.filter(id => state.cardsById[id]);
						if (e.filter === 'creature') ids = ids.filter(id => state.cardsById[id].type === 'creature');
						if (ids.length) def = state.cardsById[ids[Math.floor(state.rng() * ids.length)]];
					}
					if (!def) break;
					if (e.summon) {
						summon(state, pi, def);
					} else if (p.hand.length < MAX_HAND) {
						const card = instantiate(def, pi);
						card.zone = 'hand';
						p.hand.push(card);
						emit(state, { type: 'conjure', player: pi, card, color: null });
					}
				}
			}
} });

register('ooze-bones', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dissolving Ooze: destroy a friendly minion, pocket its Attack and Health as Bones
			const t = chosenCreature();
			const p = state.players[pi];
			if (t) {
				const atk = t.attack, hpv = Math.max(1, t.maxHealth - t.damage);
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				sweepDeaths(state);
				const bones = [
					{ id: 'token_attack_bone', name: 'Attack Bone', type: 'sorcery', cost: 1, rarity: 'common', token: true, description: `Give a minion +${atk} Attack.`, effects: [{ type: 'buff', attack: atk, health: 0, target: 'creature' }] },
					{ id: 'token_health_bone', name: 'Health Bone', type: 'sorcery', cost: 1, rarity: 'common', token: true, description: `Give a minion +${hpv} Health.`, effects: [{ type: 'buff', attack: 0, health: hpv, target: 'creature' }] },
				];
				for (const bd of bones) if (p.hand.length < MAX_HAND) { const bc = instantiate(bd, pi); bc.zone = 'hand'; p.hand.push(bc); emit(state, { type: 'conjure', player: pi, card: bc, color: null }); }
			}
} });

register('discard-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			while (p.hand.length) {
				const c = p.hand.pop();
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */
			}
} });

register('transform-self-random-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lotus Illusionist: become a random creature of a given Cost
			if (source && source.zone === 'board' && !isDead(source)) {
				const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === e.cost
					&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== source.id);
				if (pool.length) {
					const rd = pool[Math.floor(state.rng() * pool.length)];
					const tok = instantiate({ id: 'token_' + rd.id, name: rd.name, type: 'creature', cost: 0, rarity: 'common', token: true,
						tribe: rd.tribe, description: rd.description, attack: rd.attack, health: rd.health, keywords: rd.keywords || [] }, source.controller);
					tok.zone = 'board'; tok.sick = source.sick;
					const board = state.players[source.controller].board;
					board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: tok });
					recomputeAuras(state);
				}
			}
} });

register('blood-fighter-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lo'Gosh trio: summon a Blood Fighter from your hand with +5/+5 and a rider
			const p = state.players[pi];
			const hi = p.hand.findIndex(c => (c.name || '').includes('Blood Fighter'));
			if (hi >= 0) {
				const [bf] = p.hand.splice(hi, 1);
				bf.attack += 5; bf.maxHealth += 5;
				bf.zone = 'board'; bf.sick = true; p.board.push(bf);
				emit(state, { type: 'summon', player: pi, card: bf });
				if (e.mode === 'taunt' && !bf.keywords.includes(KW.TAUNT)) bf.keywords.push(KW.TAUNT);
				if (e.mode === 'elusive' && !bf.keywords.includes(KW.ELUSIVE)) bf.keywords.push(KW.ELUSIVE);
				recomputeAuras(state);
				if (e.mode === 'attack') {
					// attacks a random enemy minion (falls back to nothing on empty boards)
					const pool = [];
					for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') pool.push(c);
					if (pool.length) {
						const t = pool[Math.floor(state.rng() * pool.length)];
						damageCreature(state, t, bf.attack, bf);
						damageCreature(state, bf, t.attack, t);
					}
				}
			}
} });

register('bashana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bashana: three Treants carved with 12 Mana worth of Nature spells
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && schoolOf(dd) === 'Nature' && (dd.cost || 0) > 0 && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.effects);
			let budget = 12;
			for (let n = 0; n < 3; n++) {
				const affordable = pool.filter(dd => (dd.cost || 0) <= budget);
				const pick = affordable.length ? affordable[Math.floor(state.rng() * affordable.length)] : null;
				if (pick) budget -= pick.cost || 0;
				const tid = 'token_bashana_treant';
				if (p.hand.length < MAX_HAND) {
					const c = instantiate({ id: tid, name: 'Treant', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', token: true, keywords: pick ? ['battlecry'] : [], description: pick ? `Battlecry: Cast ${pick.name}.` : '', effects: pick ? JSON.parse(JSON.stringify(pick.effects)) : null }, pi);
					c.zone = 'hand'; p.hand.push(c);
					emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
			}
} });

register('search', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// library search: pick a matching card out of your deck (then shuffle)
			const p = state.players[pi];
			let ids = [...new Set(p.deck.filter(id => {
				const d = state.cardsById[id];
				return d && (e.cardType === 'spell' ? (d.type === 'sorcery' || d.type === 'instant')
					: !e.cardType || d.type === e.cardType)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)
					&& (e.maxAttack == null || (d.attack || 0) <= e.maxAttack)
					&& (!e.tribe || (d.tribe || '').includes(e.tribe))
					&& (!e.equipment || !!d.equip); // Steelshaper's Gift / Stoneforge: Equipment only
			}))];
			// pick: Discover-from-deck flavor — offer N randomly-sampled matches
			if (e.pick) {
				for (let k = ids.length - 1; k > 0; k--) {
					const j = Math.floor(state.rng() * (k + 1));
					[ids[k], ids[j]] = [ids[j], ids[k]];
				}
				ids = ids.slice(0, e.pick);
			}
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids: ids.slice(0, 8), mode: 'search',
					to: e.to || 'hand', title: 'Search your deck' });
				emit(state, { type: 'pickStart', player: pi });
			}
} });

register('chronogor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chronogor: you draw your 2 highest-Cost cards; the enemy draws your 2 lowest
			const p = state.players[pi];
			for (let k = 0; k < 2; k++) {
				if (!p.deck.length) break;
				let hi = 0;
				for (let i = 1; i < p.deck.length; i++) if ((state.cardsById[p.deck[i]]?.cost || 0) > (state.cardsById[p.deck[hi]]?.cost || 0)) hi = i;
				const [id] = p.deck.splice(hi, 1);
				if (p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'draw', player: pi, card: c }); }
			}
			for (const o of enemies) {
				for (let k = 0; k < 2; k++) {
					if (!p.deck.length) break;
					let lo = 0;
					for (let i = 1; i < p.deck.length; i++) if ((state.cardsById[p.deck[i]]?.cost || 0) < (state.cardsById[p.deck[lo]]?.cost || 0)) lo = i;
					const [id] = p.deck.splice(lo, 1);
					const op = state.players[o];
					if (op.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[id], o); c.zone = 'hand'; op.hand.push(c); emit(state, { type: 'conjure', player: o, card: c, color: null }); }
				}
				break;
			}
} });

register('freeze', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) freezeCreature(state, c); }
			else if (e.target === 'all-others') { for (const pl of state.players) for (const c of pl.board) if (c !== source && !isDead(c) && c.type !== 'location') freezeCreature(state, c); } // Snowfall Guardian
			else if (e.target === 'random-enemy') { // Demented Frostcaller / Popsicooler (count)
				for (let i = 0; i < (e.count || 1); i++) {
					const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && !c.frozen && c.type !== 'location'));
					if (!pool.length) break;
					freezeCreature(state, pool[Math.floor(state.rng() * pool.length)]);
				}
			}
			else if (e.target === 'self') { if (source && !isDead(source)) freezeCreature(state, source); } // Frozen Crusher
			else if (e.target === 'friendly-others') { for (const c of state.players[pi].board) if (c !== source && !isDead(c)) freezeCreature(state, c); } // Hyldnir Frostrider
			else { const t = chosenCreature(); if (t) freezeCreature(state, t); /* hero freeze: no-op (heroes can't attack) */ }
} });

register('blink', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Flicker: exile a creature, then immediately return it as a fresh
			// permanent (resets damage/auras/buffs) and retrigger its Battlecry.
			const t = chosenCreature();
			if (t && t.zone === 'board' && !isDead(t) && t !== source) {
				const owner = t.controller;
				state.players[owner].board = state.players[owner].board.filter(c => c !== t);
				for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === t.uid) eq.attachedTo = null;
				emit(state, { type: 'blinkOut', uid: t.uid, player: owner, name: t.name });
				recomputeAuras(state);
				if (!t.token) { // tokens cease to exist when they leave play
					const def = state.cardsById[t.id] || { id: t.id, name: t.name, type: 'creature', cost: t.cost,
						attack: t.attack, health: t.maxHealth, rarity: t.rarity, description: t.description, tribe: t.tribe };
					if (e.delayed) {
						// "return at the beginning of the next end step" — it's gone this turn (dodges wipes)
						(state.pendingReturns = state.pendingReturns || []).push({ controller: pi, def });
					} else {
						returnBlinked(state, owner, def); // immediate flicker
					}
				}
			}
} });

register('discard-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1) && p.hand.length; i++) {
				const j = Math.floor(state.rng() * p.hand.length);
				const [c] = p.hand.splice(j, 1);
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */ // Tiny Knight of Evil
			}
} });

register('grant-bonus-effect', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bonus Effects: apply N random gifts to self (Mutating Lifeform / Ace Wayfinder) or a random friendly (Stranglevine)
			const applied = [];
			for (let n = 0; n < (e.count || 1); n++) {
				let t = null;
				if (e.target === 'random-friendly') { const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location'); t = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; }
				else t = (source && source.zone === 'board' && !isDead(source)) ? source : null;
				if (!t) break;
				applied.push(applyGift(state, t, null, { board: true }));
				if (e.propagateDeathrattle && source && source.deathrattle && t !== source) { t.deathrattle = [...(t.deathrattle || []), ...JSON.parse(JSON.stringify(source.deathrattle))]; if (!t.keywords.includes('deathrattle')) t.keywords.push('deathrattle'); } // Stranglevine chains
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
			if (e.rewardNextTribe && applied.length) state.players[pi].nextTribePlayReward = { tribe: e.rewardNextTribe, count: 1, attack: 0, health: 0, keyword: null, giftLabels: applied.map(g => g.label) }; // Ace Wayfinder: the next Draenei gains them too
} });

register('buff-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// hand-buffs: pump creatures (or a weapon) still waiting in your hand
			const p = state.players[pi];
			let pool;
			if (e.cardType === 'weapon') pool = p.hand.filter(c => c.type === 'weapon'); // Grimestreet Pawnbroker
			else {
				pool = p.hand.filter(c => c.type === 'creature');
				if (e.tribe) pool = pool.filter(c => (c.tribe || '').includes(e.tribe)); // Grimscale Chum / Trogg Beastrager
				if (e.requireKeyword) pool = pool.filter(c => c.keywords.includes(e.requireKeyword)); // Forlorn Stalker
			}
			const targets = e.random ? (pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []) // Deathaxe Punisher: one random match
				: e.all || e.requireKeyword ? pool
				: pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : [];
			for (const c of targets) {
				c.attack += e.attack || 0;
				if (c.type === 'weapon') c.durability += e.health || 0; else c.maxHealth += e.health || 0;
				if (e.cost) c.cost = Math.max(0, (c.cost || 0) - e.cost); // Ebon Dragonsmith: cheaper weapon
				if (e.setAttack != null) c.attack = e.setAttack; // Anka, the Buried: a 1/1 that costs 1
				if (e.setHealth != null) c.maxHealth = e.setHealth;
				if (e.setCost != null) c.cost = e.setCost;
			}
} });

register('destroy-right-gain', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cho'gall's Arms / Soldier of Cho'gall: destroy the creature to its right
			// and grow. With Cho'gall in play the kill lands in a random enemy DECK
			// instead, but the growth still happens.
			if (source) {
				const drg = e.heraldScaled ? hm() : (e.amount || 1);
				const deckMode = state.players[pi].board.some(c => c.armsHitEnemyDeck && !isDead(c));
				let killed = false;
				if (deckMode) {
					const foes = enemies.filter(o => state.players[o].deck.some(id =>
						state.cardsById[id]?.type === 'creature'));
					if (foes.length) {
						const o = foes[Math.floor(state.rng() * foes.length)];
						const dk = state.players[o].deck;
						const spots = dk.map((id, k) => state.cardsById[id]?.type === 'creature' ? k : -1).filter(k => k >= 0);
						dk.splice(spots[Math.floor(state.rng() * spots.length)], 1);
						killed = true;
					}
				} else {
					const b = state.players[pi].board, r = b[b.indexOf(source) + 1];
					if (r && !isDead(r)) { r.damage = r.maxHealth; r.shield = false; emit(state, { type: 'destroy', uid: r.uid }); killed = true; }
				}
				if (killed) {
					source.attack += drg; source.maxHealth += drg;
					emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				}
			}
} });

register('discard-lowest', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lakkari Felhound: discard your N lowest-Cost cards
			const p = state.players[pi];
			for (let k = 0; k < (e.count || 1) && p.hand.length; k++) {
				let li = 0;
				for (let j = 1; j < p.hand.length; j++) if (e.highest ? (p.hand[j].cost || 0) > (p.hand[li].cost || 0) : (p.hand[j].cost || 0) < (p.hand[li].cost || 0)) li = j; // Expired Merchant: highest
				const [c] = p.hand.splice(li, 1);
				if (e.remember && source) source.discardedId = c.id; // Expired Merchant deathrattle
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */
			}
} });

register('galakrond', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Galakrond's Battlecry scales with your Invokes (0-1 base, 2-3 upgraded, 4+ maxed),
			// installs the class Galakrond hero power, and equips a 5/2 Claw when maxed.
			const p = state.players[pi];
			const inv = p.galakrondInvokes || 0, tier = inv < 2 ? 0 : inv < 4 ? 1 : 2;
			const scale = [1, 2, 4][tier];
			const before = p.hand.length;
			if (e.gclass === 'warlock') { for (let i = 0; i < scale; i++) execEffects(state, pi, [{ type: 'summon-random', tribe: 'Demon' }], null, source); }
			else if (e.gclass === 'rogue') { drawCards(state, pi, scale); for (const c of p.hand.slice(before)) c.cost = 0; }
			else if (e.gclass === 'shaman') { const s = [2, 4, 8][tier]; execEffects(state, pi, [{ type: 'summon', count: 2, attack: s, health: s, name: 'Storm', keywords: ['rush'] }], null, source); }
			else if (e.gclass === 'warrior') { execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: scale }], null, source); for (const c of p.hand.slice(before)) { c.attack += 4; c.maxHealth = (c.maxHealth || 0) + 4; } }
			else if (e.gclass === 'priest') execEffects(state, pi, [{ type: 'destroy-random', count: scale }], null, source);
			if (e.power && p.heroPowers.length < MAX_HERO_POWERS && !p.heroPowers.some(h => h.id === 'galakrond_' + e.gclass + '_power')) {
				const hp = instantiate({ id: 'galakrond_' + e.gclass + '_power', name: e.power.name, type: 'heropower', cost: 0, rarity: 'basic', power: { cost: e.power.cost, effects: e.power.effects }, description: e.power.text, cardClass: e.gclass }, pi);
				hp.zone = 'heropower'; p.heroPowers.push(hp);
			}
			if (tier === 2) execEffects(state, pi, [{ type: 'equip', name: 'Galakrond Claw', attack: 5, durability: 2 }], null, source);
} });

register('joust', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Reveal a random creature from each deck; you win if yours costs more.
			// An empty deck reveals nothing: no creature = can't win / auto-loses.
			const p = state.players[pi];
			const creaturePicks = deck => {
				const idxs = [];
				for (let i = 0; i < deck.length; i++) { const def = state.cardsById[deck[i]]; if (def?.type === 'creature' && !def.token) idxs.push(i); }
				return idxs;
			};
			const myPool = creaturePicks(p.deck);
			const myPick = myPool.length ? myPool[Math.floor(state.rng() * myPool.length)] : -1;
			const myCost = myPick >= 0 ? (state.cardsById[p.deck[myPick]].cost || 0) : null;
			const myName = myPick >= 0 ? state.cardsById[p.deck[myPick]].name : null;
			let enemyCost = null, enemyName = null;
			// joust the chosen player; with no target (2p / deathrattle) a random opponent
			const foe = (target?.type === 'hero' && target.player !== pi) ? target.player
				: (enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : null);
			if (foe != null) {
				const ed = state.players[foe].deck;
				const ePool = creaturePicks(ed);
				if (ePool.length) { const ei = ePool[Math.floor(state.rng() * ePool.length)]; enemyCost = state.cardsById[ed[ei]].cost || 0; enemyName = state.cardsById[ed[ei]].name; }
			}
			const win = myCost != null && (enemyCost == null || myCost > enemyCost);
			emit(state, { type: 'joust', player: pi, opponent: foe, myName, myCost, enemyName, enemyCost, win });
			if (win) {
				if (e.drawWinner && myPick >= 0 && p.hand.length < MAX_HAND) {
					const [id] = p.deck.splice(myPick, 1);
					const card = instantiate(state.cardsById[id], pi);
					card.zone = 'hand'; p.hand.push(card);
					emit(state, { type: 'draw', player: pi, card });
				}
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
} });

register('transform', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// replace a creature in place with a fresh token (no death, no deathrattle)
			let t = null;
			if (e.random) {
				const pool = [];
				for (const pl of state.players) for (const c of pl.board) {
					if (!isDead(c) && !(e.others && c === source)) pool.push(c);
				}
				if (pool.length) t = pool[Math.floor(state.rng() * pool.length)];
			} else t = chosenCreature();
			if (t) {
				let opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				if (e.randomCost) {
					// Recombobulator: same Cost. Master of Evolution: costDelta +1
					// Plucky Podling: it always transforms into something (2) pricier
					const want = (t.cost || 0) + (e.costDelta || 0) + (t.transformPlusCost || 0);
					const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
						&& (d.cost || 0) === want && !d.token && d.collectible !== false
						&& !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== t.id);
					if (pool.length) {
						const rd = pool[Math.floor(state.rng() * pool.length)];
						opt = { name: rd.name, attack: rd.attack, health: rd.health, keywords: rd.keywords || [] };
					}
				}
				const tok = instantiate({
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common', token: true,
					description: `A ${opt.attack}/${opt.health} ${opt.name}.`,
					attack: opt.attack, health: opt.health,
					keywords: opt.keywords || [],
				}, t.controller);
				tok.zone = 'board';
				tok.sick = t.sick;
				const board = state.players[t.controller].board;
				board[board.indexOf(t)] = tok;
				t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: tok });
				recomputeAuras(state);
			}
} });

register('herald', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Herald: summon your class's Soldier; its stats + effect value scale
			// x1 for your 1st-2nd Herald, x2 for the 3rd-4th, x4 for the 5th on.
			const p = state.players[pi];
			const prev = p.heraldCount || 0;
			const m = prev < 2 ? 1 : prev < 4 ? 2 : 4;
			p.heraldCount = prev + 1;
			const SOL = {
				shaman: { id: 'token_soldier_of_alakir', atk: 1, hp: 2 },
				demon_hunter: { id: 'token_soldier_of_azshara', atk: 2, hp: 1 },
				warlock: { id: 'token_soldier_of_chogall', atk: 1, hp: 1 },
				death_knight: { id: 'token_soldier_of_onyxia', atk: 1, hp: 1 },
				warrior: { id: 'token_soldier_of_ragnaros', atk: 2, hp: 1 },
				rogue: { id: 'token_soldier_of_sinestra', atk: 1, hp: 1 },
			};
			const cls = SOL[p.heroClass] ? p.heroClass
				: (source && (source.cardClass || '').split('__').find(c => SOL[c])) || 'warrior';
			const spec = SOL[cls], def = state.cardsById[spec.id];
			const soldier = def && summon(state, pi, def);
			if (soldier) {
				soldier.attack = spec.atk * m; soldier.maxHealth = spec.hp * m;
				if (e.grant && !soldier.keywords.includes(e.grant)) soldier.keywords.push(e.grant);
				if (cls === 'shaman') { soldier.aura = { attack: m, adjacent: true }; recomputeAuras(state); }
				else if (cls === 'warrior') { soldier.deathrattle = [{ type: 'random-damage', value: m, count: 1, pool: 'enemies' }]; if (!soldier.keywords.includes('deathrattle')) soldier.keywords.push('deathrattle'); }
				else if (cls === 'warlock') soldier.ongoing = { on: 'turn-end', effects: [{ type: 'destroy-right-gain', amount: m }] };
				else if (cls === 'demon_hunter') execEffects(state, pi, [{ type: 'hero-temp-attack', value: m }], null, soldier);
				else if (cls === 'death_knight') execEffects(state, pi, [{ type: 'conjure-cost', cost: m }], null, soldier);
				else if (cls === 'rogue') execEffects(state, pi, [{ type: 'conjure-named', match: '', cardType: 'spell', costMod: -m, count: 1 }], null, soldier);
				emit(state, { type: 'buff', uid: soldier.uid, attack: soldier.attack, hp: hp(soldier) });
			}
} });

register('heal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			let v = e.value === "X" ? (source?.xValue || 0) : e.valueFromHandSize ? state.players[pi].hand.length : boost(e.value); // Spice Bread Baker
			if (v > 0) v += state.players[pi].healBonusGame || 0; // Cleansing Cleric: your heals restore 2 more this game
			if (state.hpDoubling) v *= 2; // Clockwork Automaton: double Hero Power healing
			// Auchenai Soulpriest: your healing deals damage instead
			const harm = staticValue(state.players[pi], 'heal-becomes-damage') > 0 || state.players[pi].healHarmThisTurn; // Auchenai Phantasm
			const mendHero = who => harm ? damageHero(state, who, v, pi) : healHero(state, who, v);
			const mend = c => harm ? damageCreature(state, c, v, null) : healCreature(c, v);
			if (e.target === 'self') mendHero(pi);
			else if (e.target === 'enemy-hero') { const t = enemyHero(); if (t != null) mendHero(t); }
			else if (e.target === 'enemy-heroes') { for (const o of opponentsOf(state, pi)) mendHero(o); }
			else if (e.target === 'all-heroes') { for (let s = 0; s < state.players.length; s++) if (!state.players[s].eliminated) mendHero(s); }
			else if (e.target === 'all-creatures') { for (const pl of state.players) for (const c of [...pl.board]) mend(c); }
			else if (e.target === 'friendly-creatures') { for (const c of [...state.players[pi].board]) mend(c); }
			else if (e.target === 'friendly-all') { mendHero(pi); for (const c of [...state.players[pi].board]) mend(c); }
			else if (e.target === 'friendly-characters') { mendHero(pi); for (const c of [...state.players[pi].board]) mend(c); } // Sunfury Clergy: hero + all friendly minions
			else if (e.target === 'random-damaged-friendly') {
				// Black Blood's Body: restore a random damaged friendly character
				const pool = [...state.players[pi].board.filter(c => !isDead(c) && c.damage > 0)];
				if (state.players[pi].life < STARTING_LIFE) pool.push('hero');
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)];
					if (t === 'hero') mendHero(pi); else mend(t); }
			}
			else {
				const t = chosenCreature();
				if (t) mend(t);
				else if (target?.type === 'hero') mendHero(target.player);
				else mendHero(pi);
			}
} });

register('transform-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Faceless-style: the source becomes a copy of the chosen creature
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const def = state.cardsById[t.id];
				const clone = instantiate(def || {
					id: t.id, name: t.name, type: 'creature', cost: t.cost,
					rarity: t.rarity, description: t.description,
				}, source.controller);
				// live state minus aura contributions (auras re-apply on recompute)
				clone.zone = 'board';
				clone.name = t.name;
				clone.attack = t.attack - t.auraAttack - t.tempAttack;
				clone.maxHealth = t.maxHealth - (t.auraHealth || 0) - (t.tempHealth || 0);
				clone.damage = t.damage;
				clone.keywords = t.keywords.filter(k => !t.auraKeywords.includes(k));
				clone.tribe = t.tribe;
				clone.effects = t.effects;
				clone.deathrattle = t.deathrattle ? JSON.parse(JSON.stringify(t.deathrattle)) : null;
				clone.ongoing = t.ongoing ? JSON.parse(JSON.stringify(t.ongoing)) : null;
				clone.static = t.static ? { ...t.static } : null;
				clone.aura = t.aura ? JSON.parse(JSON.stringify(t.aura)) : null;
				clone.costMod = t.costMod ? { ...t.costMod } : null;
				clone.selfCost = t.selfCost ? { ...t.selfCost } : null;
				clone.enrage = t.enrage ? JSON.parse(JSON.stringify(t.enrage)) : null;
				clone.combo = t.combo ? JSON.parse(JSON.stringify(t.combo)) : null;
				clone.statRule = t.statRule;
				clone.selfScale = t.selfScale ? { ...t.selfScale } : null;
				clone.condKeyword = t.condKeyword ? { ...t.condKeyword } : null;
				clone.offTurnAttack = t.offTurnAttack;
				clone.medic = t.medic;
				clone.shield = t.shield;
				clone.stealthed = t.stealthed;
				clone.sick = source.sick;
				if (e.setAttack != null) clone.attack = e.setAttack; // Shadowy Figure: a 2/2 copy
				if (e.setHealth != null) { clone.maxHealth = e.setHealth; clone.damage = 0; }
				const board = state.players[source.controller].board;
				board[board.indexOf(source)] = clone;
				source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: clone });
				recomputeAuras(state);
			}
} });

register('launch-starship', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// GDB: summon The Starship with the combined stats, keywords, deathrattles
			// and ongoing triggers of every assembled piece, then fire each piece's
			// launch effects. e.bonus = an Exodar Protocol rider baked into the ship.
			const p = state.players[pi];
			const pieceDefs = (p.starshipPieces || []).map(id => state.cardsById[id]).filter(Boolean);
			if (pieceDefs.length && state.cardsById['gdb_the_starship']) {
				let atk = 0, hpv = 0; const kws = new Set(); let dr = []; const ongs = []; const names = [];
				for (const d of pieceDefs) {
					atk += d.attack || 0; hpv += d.health || 0;
					for (const k of d.keywords || []) if (k !== 'battlecry' && k !== 'deathrattle') kws.add(k);
					if (d.deathrattle) dr = dr.concat(JSON.parse(JSON.stringify(d.deathrattle)));
					if (d.ongoing) ongs.push(JSON.parse(JSON.stringify(d.ongoing)));
					names.push(d.name);
				}
				if (e.bonus) { atk += e.bonus.attack || 0; hpv += e.bonus.health || 0; for (const k of e.bonus.keywords || []) kws.add(k); }
				const ship = summon(state, pi, {
					...state.cardsById['gdb_the_starship'],
					attack: Math.max(1, atk), health: Math.max(1, hpv), keywords: [...kws],
					description: 'Launched Starship: ' + names.join(', ') + '.',
				});
				if (ship) {
					if (dr.length) { ship.deathrattle = dr; if (!ship.keywords.includes('deathrattle')) ship.keywords.push('deathrattle'); }
					if (ongs.length) ship.ongoings = ongs;
					p.starshipPieces = [];
					p.starshipsLaunched = (p.starshipsLaunched || 0) + 1;
					emit(state, { type: 'starshipLaunch', player: pi, uid: ship.uid, name: ship.name, pieces: names });
					for (const d of pieceDefs) if (d.launch) execEffects(state, pi, JSON.parse(JSON.stringify(d.launch)), null, ship);
					// Hellion / Siege Tank / Thor: transform wherever they are once you've launched
					for (let hi = 0; hi < p.hand.length; hi++) {
						const hd = state.cardsById[p.hand[hi].id];
						if (hd && hd.launchTransform && state.cardsById[hd.launchTransform]) {
							const ni = instantiate(state.cardsById[hd.launchTransform], pi);
							ni.zone = 'hand'; p.hand[hi] = ni;
							emit(state, { type: 'transformed', player: pi, uid: ni.uid, name: ni.name });
						}
					}
					p.deck = p.deck.map(id => {
						const dd = state.cardsById[id];
						return (dd && dd.launchTransform && state.cardsById[dd.launchTransform]) ? dd.launchTransform : id;
					});
					recomputeAuras(state);
				}
			}
} });

register('summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// perEnemy: one token per enemy creature ("Unleash the Hounds");
			// options: pick a random companion (Animal Companion);
			// forEnemy: tokens go to a random opponent (Leeroy's Whelps);
			// eachPlayer: every player summons the token(s) (Sokenzan's Arrival)
			let n = e.count === 'X' ? (source?.xValue || 0) : e.count === 'source-attack' ? (source?.attack || 0) : (e.count || 1); // Rat Pack
			if (e.perEnemy) {
				n = 0;
				for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c)).length;
			}
			if (!e.eachPlayer && !e.forEnemy && state.players[pi].board.some(c => c.id === 'khadgar' && !isDead(c))) n *= 2; // Khadgar: summon twice as many
			const isCompanions = e.options && e.options.some(o => o.name === 'Huffer');
			if (isCompanions && state.players[pi].companionExtra) n += state.players[pi].companionExtra; // Talya Earthstrider
			const summonOne = (ownerIdx) => {
				if (isCompanions && state.players[pi].companionUpgrade) { // Migrating Elekk: random Beasts at +1 Cost instead
					const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Beast') && (dd.cost || 0) === 4 && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
					if (pool.length) { summon(state, ownerIdx, pool[Math.floor(state.rng() * pool.length)]); return; }
				}
				const opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				// summonId: instantiate a real card def so it keeps its own ongoing —
				// e.g. Gibberling's Spellburst summons another Gibberling that snowballs
				if (opt.summonId && state.cardsById[opt.summonId]) { summon(state, ownerIdx, state.cardsById[opt.summonId]); return; }
				// randomKeywords: each token rolls its own bonus (Bucket of Soldiers)
				const kws = [...(opt.keywords || [])];
				if (e.randomKeywords?.length) kws.push(e.randomKeywords[Math.floor(state.rng() * e.randomKeywords.length)]);
				summon(state, ownerIdx, {
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common', token: true,
					description: opt.description || `A ${opt.attack}/${opt.health} token.`,
					attack: opt.attack, health: opt.health,
					keywords: kws,
					tribe: opt.tribe || null,
					aura: opt.aura || null,
					static: opt.static || e.static || null,
					deathrattle: opt.deathrattle || null, // Underbelly Network's Rat
				});
			};
			const owners = e.eachPlayer
				? state.players.map((_, idx) => idx)
				: [e.forEnemy && enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : pi];
			for (const ownerIdx of owners) for (let i = 0; i < n; i++) summonOne(ownerIdx);
} });

register('summon-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Summon a random creature with Mana Value 2 or less" / "a random
			// Demon" / "a random 4-Cost minion" (exact cost) / Past Conflux's
			// "a random Dragon that costs 5 or more".
			// Steeldancer: costFromWeapon fixes the Cost to your weapon's Attack.
			const exactCost = e.costFromWeapon ? (state.players[pi].weapon ? (state.players[pi].weapon.attack || 0) : 0)
				: e.costFromSelfAttack ? (source ? (source.attack || 0) : 0) // Spurfang: Cost = this minion's Attack
				: e.costFromSelfCost ? (source ? (source.cost || 0) : 0) // Ulfar's granted Deathrattle: Cost = this minion's Cost
				: e.cost;
			const pool = e.ids ? e.ids.map(id => state.cardsById[id]).filter(Boolean) : Object.values(state.cardsById).filter(d =>
				d.type === 'creature' && (e.maxCost == null || (d.cost || 0) <= e.maxCost)
				&& (e.minCost == null || (d.cost || 0) >= e.minCost)
				&& (exactCost == null || (d.cost || 0) === exactCost)
				&& (e.tribe == null || (d.tribe || '').includes(e.tribe))
				&& (e.rarity == null || d.rarity === e.rarity)
				&& (e.requireKeyword == null || (d.keywords || []).includes(e.requireKeyword)) // Obsidian Revenant: Deathrattle minions
				&& !d.companion && !d.commander && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			let howMany = e.count || 1;
			if (e.countPer === 'schools-cast-game') howMany = (e.count || 1) + Object.keys(state.players[pi].schoolsCastGame || {}).length; // Razzle-Dazzler
			if (e.countPer === 'self-deaths') howMany = source ? Math.max(1, (state.players[pi].diedCountById?.[source.id] || 0)) : 1; // Ysondre: one Dragon per time it has died
			for (let i = 0; i < howMany && pool.length; i++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const owner = e.forEnemy && enemies.length
					? enemies[Math.floor(state.rng() * enemies.length)] : pi;
				const c = summon(state, owner, def);
				if (c && e.disguise) disguiseCreature(state, c);
				// "...and give it Taunt": grant a keyword to the summoned creature
				if (c && e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; if (e.grant === KW.STEALTH) c.stealthed = true; }
				if (c && e.dormantTurns) { c.dormantLeft = e.dormantTurns; emit(state, { type: 'dormant', player: owner, uid: c.uid, turns: e.dormantTurns }); } // Paltry Flutterwing / Dreadsoul
				// Ankylodon: the summoned Beasts attack random enemies
				if (c && e.attackRandom && !isDead(c)) {
					const foes = [];
					for (const o of opponentsOf(state, owner)) for (const fc of state.players[o].board) if (!isDead(fc) && fc.type !== 'location') foes.push(fc);
					if (foes.length) { const t = foes[Math.floor(state.rng() * foes.length)]; damageCreature(state, t, c.attack, c); damageCreature(state, c, t.attack, t); }
				}
			}
} });

register('discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// hero-power discovers took a dedicated guarded branch BEFORE the plain
	// one in the old chain; batch 19 briefly rerouted them here — restored:
	if (e.heroPower) {
			// Sir Finley: Discover a new Hero Power (replaces yours on pick)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'heropower' && d.power);
			const ids = [];
			for (let i = 0; i < 3 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			if (ids.length && !state.players[pi].eliminated) {
				state.pickQueue.push({ player: pi, ids, heroPower: true });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
		return;
	}
			// Discover: pick 1 of 3 random matches; Draft: pick 1 of 5. Curious
			// Glimmerroot (fromEnemyDeck) samples the opponent's deck.
			const enemyDeckDefs = () => {
				const foe = enemies[0];
				if (foe == null) return [];
				return [...new Set(state.players[foe].deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			};
			const ownDeckDefs = () => [...new Set(state.players[pi].deck)].map(id => state.cardsById[id]).filter(d => d && !d.token && (e.cardType === 'spell' ? isSpellType(d) : e.cardType === 'any' ? true : d.type === 'creature')); // Stitched Tracker / Tortollan Pilgrim / Naielle's Tracking
			const enemyHandDefs = () => { const foe = enemies[0]; return foe == null ? [] : state.players[foe].hand.map(c => state.cardsById[c.id] || c).filter(d => d && !d.token); }; // Madame Lazul
			const diedDefs = () => [...new Set(state.players[pi].deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature'); // Body Wrapper
			const discoverCost = e.costFromMana ? availableMana(state.players[pi]) : e.cost; // Scrappy Scavenger: Cost = your remaining Mana
			const discoverPool = () => (e.fromEnemyDeck ? enemyDeckDefs() : e.fromEnemyHand ? enemyHandDefs() : e.fromDied ? diedDefs() : e.fromOwnDeck ? ownDeckDefs() : Object.values(state.cardsById)).filter(d => {
				if (d.type === 'land' || d.token || d.collectible === false || d.companion || d.commander) return false;
				if (d.colors && d.colors.length) return false;
				if (e.cardType === 'spell' ? !isSpellType(d) : (e.cardType && e.cardType !== 'any' && d.type !== e.cardType)) return false;
				if (e.tribe && !(d.tribe || '').includes(e.tribe)) return false;
				if (discoverCost != null && (d.cost || 0) !== discoverCost) return false;
				if (e.maxCost != null && (d.cost || 0) > e.maxCost) return false;
				if (e.minCost != null && (d.cost || 0) < e.minCost) return false;
				if (e.hasStatic && d.static?.type !== e.hasStatic) return false;
				if (e.rarity && d.rarity !== e.rarity) return false; // Suspicious Usher / Legendary Invitation
				if (e.requireRewind && !(d.rewind > 0)) return false; // Morchie: a Rewind card
				if (e.requireKeyword && !(d.keywords || []).includes(e.requireKeyword)) return false;
				if (e.cardClasses && !e.cardClasses.includes(d.cardClass || 'neutral')) return false; // Grimestreet Informant / Kabal Courier / Lotus Agents
				return true;
			});
			// `count` queues that many separate Discovers; `to:'board'` summons the pick
			for (let n = 0; n < (e.count || 1); n++) {
				if (state.players[pi].eliminated) break;
				const pool = discoverPool();
				const ids = [];
				for (let i = 0; i < (e.pick || 3) && pool.length; i++) {
					ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
				}
				if (!ids.length) break;
				state.pickQueue.push({ player: pi, ids, grant: e.grant || null, buff: e.buff || null, to: e.to || null, costMod: e.costMod || null, healByCost: e.healByCost || false, armorByCost: e.armorByCost || false, installSecret: e.installSecret || false, castRandom: e.castRandom || false, damageSelfByCost: e.damageSelfByCost || false, gainDeathrattleUid: e.gainDeathrattle && source ? source.uid : null, setAttack: e.setAttack ?? null, setHealth: e.setHealth ?? null, setCost: e.setCost ?? null, darkGift: e.darkGift || false, duplicate: e.duplicate || false, mode: (e.fromOwnDeck && e.drawPick) ? 'search' : undefined, shuffleOthers: e.shuffleOthers || false, toDeckBottomBuff: e.toDeckBottomBuff || null, gainStatsUid: (e.gainStats && source) ? source.uid : null, hataaru: e.hataaru || false, summonTwice: e.summonTwice || false, qonzu: e.qonzu || false, grantCastTwice: e.grantCastTwice || false, damageAllByCost: e.damageAllByCost || false });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });

register('conjure-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// random collectible card(s) matching filters, added to your hand;
			// cardClass 'enemy' = an opponent's class pool, 'other' = any class but yours
			const p = state.players[pi];
			let pool = Object.values(state.cardsById).filter(d =>
				d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander
				&& !(d.colors && d.colors.length));
			if (e.cardType === 'creature') pool = pool.filter(d => d.type === 'creature');
			else if (e.cardType === 'spell') pool = pool.filter(d => isSpellType(d));
			else if (e.cardType === 'weapon') pool = pool.filter(d => d.type === 'weapon');
			if (e.minAttack != null) pool = pool.filter(d => (d.attack || 0) >= e.minAttack);
			if (e.requireKeyword) pool = pool.filter(d => (d.keywords || []).includes(e.requireKeyword)); // Whirlkick Master: a Combo card
			if (e.cost != null) pool = pool.filter(d => (d.cost || 0) === e.cost); // Ravencaller / Tanglefur Mystic
			if (e.maxCost != null) pool = pool.filter(d => (d.cost || 0) <= e.maxCost); // Carrier Whelp: a Dragon that costs (3) or less
			if (e.minCost != null) pool = pool.filter(d => (d.cost || 0) >= e.minCost); // Hexmarshal: a spell that costs (5) or more
			if (e.nameIncludes) pool = pool.filter(d => (d.name || '').includes(e.nameIncludes)); // Yrel: Librams
			if (e.school) pool = pool.filter(d => schoolOf(d) === e.school); // Galactic Crusader: Holy spells
			if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
			if (e.rarity) pool = pool.filter(d => d.rarity === e.rarity); // Golden Monkey: Legendaries
			if (e.requireRewind) pool = pool.filter(d => d.rewind > 0); // Time Machine: a random Rewind card
			if (e.requireStarshipPiece) pool = pool.filter(d => d.starshipPiece); // Scrounging Shipwright
			if (e.requireColossal) pool = pool.filter(d => d.colossal); // Primordial Lord
			if (e.cardClass === 'enemy') {
				const victim = enemyHero();
				const cls = victim != null && state.players[victim].heroClass;
				pool = cls ? pool.filter(d => d.cardClass === cls) : [];
			} else if (e.cardClass === 'other') {
				pool = pool.filter(d => d.cardClass && d.cardClass !== 'neutral'
					&& d.cardClass !== p.heroClass);
			} else if (e.cardClass) {
				pool = e.cardClass === 'own' ? (p.heroClass ? pool.filter(d => (d.cardClass || 'neutral') === p.heroClass) : pool) : pool.filter(d => d.cardClass === e.cardClass); // Wandmaker: your class / Lyra: a specific class
			}
			// `copies`: pick ONE match and add that same card N times; else N distinct rolls
			const cnt = e.fillHand ? Math.max(0, MAX_HAND - p.hand.length) // Well of Eternity: fill your hand
				: e.countPer === 'spells-this-turn' ? (p.spellsPlayedThisTurn || 0) : (e.count || 1); // Mana Cyclone
			const addTo = (own) => {
				const op = state.players[own];
				const picks = e.copies ? Array(e.copies).fill(pool.length ? pool[Math.floor(state.rng() * pool.length)] : null)
					: Array.from({ length: cnt }, () => pool.length ? pool[Math.floor(state.rng() * pool.length)] : null);
				for (const def of picks) {
					if (!def || op.hand.length >= MAX_HAND) break;
					const card = instantiate(def, own);
					card.zone = 'hand';
					if (e.setCost != null) card.cost = e.setCost;
					if (e.setStats != null && card.type === 'creature') { card.attack = e.setStats; card.maxHealth = e.setStats; } // Karov the Broken: 1/1 copies
					if (e.costMod) card.cost = Math.max(0, (card.cost || 0) + e.costMod); // Flame Behemoth: cheaper
					if (e.makeTemporary) card.temporary = true; // Hologram Operator: Temporary copies vanish at end of turn
					if (e.ticksDown) card._ticksDown = true; // Circadiamancer: cheaper at each of your turn starts
					if (e.altLife) card.altCost = { life: card.cost || 0 }; // Whispering Stone: costs Health instead of Mana
					if (e.castTwice) card.castTwice = true; // Empowered Well of Eternity: they cast twice
					if (e.buffAttack && card.type === 'weapon') card.attack = (card.attack || 0) + e.buffAttack; // Neferset Weaponsmith combo
					op.hand.push(card);
					emit(state, { type: 'conjure', player: own, card, color: null });
					fireEmerge(state, own, card);
				}
			};
			// Spellslinger: eachPlayer gives every player their own random card
			if (e.eachPlayer) { for (let i = 0; i < state.players.length; i++) if (!state.players[i].eliminated) addTo(i); }
			else if (e.toEnemy) { for (const o of enemies) addTo(o); } // K'thir Ritualist
			else addTo(pi);
} });

register('conditional', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "If you control a Beast / have 12 or less Health / it's Frozen, ... instead"
			const t = chosenCreature();
			const p = state.players[pi];
			let ok = true;
			if (e.if.controlTribe) ok = p.board.some(c => !isDead(c) && (c.tribe || '').includes(e.if.controlTribe));
			else if (e.if.minOtherCreatures != null) ok = p.board.filter(c => !isDead(c) && c !== source && c.type !== 'location').length >= e.if.minOtherCreatures; // Nesting Roc
			else if (e.if.diedThisGame) ok = p.deathLogIds.includes(e.if.diedThisGame); // Feugen/Stalagg
			else if (e.if.enemyMaxHealth != null) ok = opponentsOf(state, pi).some(o => state.players[o].life <= e.if.enemyMaxHealth); // Drakonid Crusher
			else if (e.if.noDuplicates) ok = new Set(p.deck).size === p.deck.length; // Reno Jackson
			else if (e.if.controlOtherTribe) ok = p.board.some(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.if.controlOtherTribe)); // Gorillabot / Fossilized Devilsaur
			else if (e.if.controlSecret) ok = p.secrets.length > 0; // Avian Watcher
			else if (e.if.enemyFrozen) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => c.frozen && !isDead(c))); // Cryomancer
			else if (e.if.enemyHasTaunt) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => !isDead(c) && has(c, KW.TAUNT))); // Spiked Hogrider
			else if (e.if.enemyHandEmpty) ok = opponentsOf(state, pi).some(o => state.players[o].hand.length === 0); // Tanaris Hogchopper
			else if (e.if.weaponAttack != null) ok = !!(p.weapon && p.weapon.attack >= e.if.weaponAttack); // Luckydo Buccaneer
			else if (e.if.weaponEquipped) ok = !!p.weapon; // Hobart Grapplehammer
			else if (e.if.enemyHandSize != null) ok = opponentsOf(state, pi).some(o => state.players[o].hand.length >= e.if.enemyHandSize); // Leatherclad Hogleader
			else if (e.if.controlHealth != null) ok = p.board.some(c => !isDead(c) && hp(c) >= e.if.controlHealth); // Fight Promoter
			else if (e.if.selfAttack != null) ok = !!(source && source.attack >= e.if.selfAttack); // Meanstreet Marshal
			else if (e.if.elementalLastTurn) ok = !!p.elementalLastTurn; // Thunder Lizard, Blazecaller, …
			else if (e.if.holdingMinAttack != null) ok = p.hand.some(c => c.type === 'creature' && c.attack >= e.if.holdingMinAttack); // Elder Longneck
			else if (e.if.controlStatic) ok = p.board.some(c => !isDead(c) && c.static?.type === e.if.controlStatic); // Master of Ceremonies: a Spell Damage minion
			else if (e.if.maxHealthSelf != null) ok = p.life <= e.if.maxHealthSelf;
			else if (e.if.targetFrozen) ok = !!(t && t.frozen);
			else if (e.if.targetFriendlyTribe) ok = !!(t && t.controller === pi && (t.tribe || '').includes(e.if.targetFriendlyTribe));
			else if (e.if.heroAttacked) ok = p.heroAttacksUsed > 0;
			else if (e.if.controlMinAttack != null) ok = p.board.some(c => !isDead(c) && c !== source && c.attack >= e.if.controlMinAttack);
			else if (e.if.cthunMinAttack != null) ok = (CTHUN_BASE + p.cthunAtk) >= e.if.cthunMinAttack;
			else if (e.if.holdingTribe) ok = p.hand.some(c => (c.tribe || '').includes(e.if.holdingTribe));
			else if (e.if.handEmpty) ok = p.hand.length === 0;
			else if (e.if.excavatedTwice) ok = (p.excavateCount || 0) >= 2;
			else if (e.if.manathirst != null) ok = (p.mana.max || 0) >= e.if.manathirst; // mana crystals this turn, regardless of spend
			else if (e.if.finale) ok = availableMana(p) === 0; // you spent all your mana playing this card
			else if (e.if.lastCardCost != null) ok = (p.lastCardCost === e.if.lastCardCost); // Rolling Stone: the last card you played costs N
			else if (e.if.friendlyUndeadDied) ok = (p.deathLogIds || []).some(id => (state.cardsById[id]?.tribe || '').includes('Undead')); // Bone Flinger (approx: a friendly Undead has died this game)
			else if (e.if.noFriendlyDeaths) ok = (p.diedThisTurn || 0) === 0;
			else if (e.if.friendlyDied) ok = (p.diedThisTurn || 0) > 0;       // Bone Flurry
			else if (e.if.deckAtLeast != null) ok = p.deck.length >= e.if.deckAtLeast; // Crowd Control
			else if (e.if.deckAtMost != null) ok = p.deck.length <= e.if.deckAtMost; // Blood Shard Bristleback
			else if (e.if.heroPowerUsed) ok = (p.heroPowers || []).some(h => h.usedThisTurn); // Manafeeder Panthara
			else if (e.if.holdingSpellMinCost != null) ok = p.hand.some(c => (c.type === 'sorcery' || c.type === 'instant' || c.type === 'secret' || c.type === 'trap') && (c.cost || 0) >= e.if.holdingSpellMinCost); // Groundskeeper
			else if (e.if.enemyTurn) ok = state.current !== pi; // Skelemancer / Vryghoul / Mountainfire Armor (died on opponent's turn)
			else if (e.if.deckNoCost != null) ok = !p.deck.some(id => (state.cardsById[id]?.cost || 0) === e.if.deckNoCost); // Prince Keleseth / Valanar
			else if (e.if.deckHasKeyword) ok = p.deck.some(id => { const def = state.cardsById[id]; return def?.type === 'creature' && (def.keywords || []).includes(e.if.deckHasKeyword); }); // Corpsetaker
			else if (e.if.noOtherCreatures) ok = !p.board.some(c => c !== source && !isDead(c) && c.type !== 'location'); // Lone Champion
			else if (e.if.controlTribeCount) ok = p.board.filter(c => !isDead(c) && (c.tribe || '').includes(e.if.controlTribeCount.tribe)).length >= e.if.controlTribeCount.count; // Windshear Stormcaller
			else if (e.if.heroTookDamage) ok = !!p.heroDamagedThisTurn; // Duskbat / Deathweb Spider
			else if (e.if.onlyCreature) ok = !state.players.some(pl => pl.board.some(c => c !== source && !isDead(c) && c.type !== 'location')); // Night Prowler
			else if (e.if.deckAllEven) ok = p.deck.length > 0 && p.deck.every(id => ((state.cardsById[id]?.cost || 0) % 2) === 0); // Murkspark Eel
			else if (e.if.deckAllOdd) ok = p.deck.length > 0 && p.deck.every(id => ((state.cardsById[id]?.cost || 0) % 2) === 1); // Gloom Stag / Glitter Moth
			else if (e.if.anyDiedThisTurn) ok = (state.diedThisTurn || 0) > 0; // Carrion Drake
			else if (e.if.controlCountHealth) ok = p.board.filter(c => !isDead(c) && c.type !== 'location' && hp(c) >= e.if.controlCountHealth.health).length >= e.if.controlCountHealth.count; // Star Aligner
			else if (e.if.emptyEverything) ok = p.deck.length === 0 && p.hand.length === 0 && !p.board.some(c => c !== source && !isDead(c) && c.type !== 'location'); // Mecha'thun
			else if (e.if.hasRememberedSpells) ok = !!(source && source.rememberedSpells && source.rememberedSpells.length); // Zerek, Master Cloner
			else if (e.if.enemyCreatureCount != null) ok = opponentsOf(state, pi).reduce((s, o) => s + state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length, 0) >= e.if.enemyCreatureCount; // Belligerent Gnome
			else if (e.if.spellsThisTurn != null) ok = (p.spellsPlayedThisTurn || 0) >= e.if.spellsThisTurn; // Wartbringer
			else if (e.if.controlFrozen) ok = p.board.some(c => !isDead(c) && c.frozen); // Ice Cream Peddler
			else if (e.if.healedGame != null) ok = (p.healedGame || 0) >= e.if.healedGame; // Zandalari Templar
			else if (e.if.playedQuestGame) ok = !!p.questsPlayedGame; // Sky Gen'ral Kragg
			else if (e.if.anyDamaged) ok = state.players.some(pl => pl.board.some(c => !isDead(c) && c.type !== 'location' && c.damage > 0)); // Bonechewer Raider
			else if (e.if.controlStealthed) ok = p.board.some(c => !isDead(c) && c.stealthed); // Greyheart Sage
			else if (e.if.castSpellLastTurn) ok = !!p.castSpellLastTurn; // Marshspawn / Shattered Rumbler
			else if (e.if.heroHealthChanged) ok = !!p.heroHealthChangedThisTurn; // Brittlebone Destroyer
			else if (e.if.hasSpellDamage) ok = staticValue(p, 'spell-damage') > 0; // Sorcerous Substitute
			else if (e.if.hasArmor) ok = (p.armor || 0) > 0; // Ironclad
			else if (e.if.armorAtLeast != null) ok = (p.armor || 0) >= e.if.armorAtLeast; // Fleshshaper
			else if (e.if.armorChangedThisTurn) ok = !!p.armorChangedThisTurn; // Stoneskin Armorer
			else if (e.if.drawsThisTurnAtLeast != null) ok = (p.drawsThisTurn || 0) >= e.if.drawsThisTurnAtLeast; // Careless Mechanist
			else if (e.if.corpsesAtLeast != null) ok = (p.corpses || 0) >= e.if.corpsesAtLeast; // Eulogizer
			else if (e.if.dragonsPlayedGame != null) ok = (p.dragonsPlayedGame || 0) >= e.if.dragonsPlayedGame; // Timewinder Zarimi
			else if (e.if.holdingCost != null) ok = p.hand.some(c => c !== source && (c.cost || 0) === e.if.holdingCost); // Greedy Partner: holding another N-Cost card
			else if (e.if.holdingSecret) ok = p.hand.some(c => c.secret); // Sparkjoy Cheat
			else if (e.if.spellsGame != null) ok = (p.spellsPlayedTotal || 0) >= e.if.spellsGame; // Yogg-Saron, Master of Fate
			else if (e.if.healedThisTurn) ok = !!p.healedThisTurn; // Cleric of An'she
			else if (e.if.holdingSchool) ok = p.hand.some(c => schoolOf(c) === e.if.holdingSchool); // Toad of the Wilds
			else if (e.if.castSchoolThisTurn) ok = !!(p.schoolsCastThisTurn && p.schoolsCastThisTurn[e.if.castSchoolThisTurn]); // Metamorfin
			else if (e.if.diedCountGame) ok = (p.diedCountById?.[e.if.diedCountGame.id] || 0) >= e.if.diedCountGame.count; // Elwynn Boar
			else if (e.if.anyHeroDamagedThisTurn) ok = state.players.some(pl => pl.heroDamagedThisTurn); // Twilight Deceptor
			else if (e.if.holdingSchoolsBoth) ok = e.if.holdingSchoolsBoth.every(sch => p.hand.some(c => schoolOf(c) === sch)); // Lightmaw Netherdrake
			else if (e.if.holdingTribeMinCost) ok = p.hand.some(c => (c.tribe || '').includes(e.if.holdingTribeMinCost.tribe) && (c.cost || 0) >= e.if.holdingTribeMinCost.cost); // Warden of Chains
			else if (e.if.notHonorablyKilled) ok = !(source && source.honorablyKilled); // Korrak the Bloodrager
			else if (e.if.armorGainedGame != null) ok = (p.armorGainedGame || 0) >= e.if.armorGainedGame; // Captain Galvangar
			else if (e.if.spellsCastWhileHeld != null) ok = (source && source.spellsCastWhileHeld || 0) >= e.if.spellsCastWhileHeld; // Spellcoiler / Ancient Krakenbane
			else if (e.if.schoolWhileHeld) ok = !!(source && source.schoolsWhileHeld && source.schoolsWhileHeld[e.if.schoolWhileHeld]); // Heralds
			else if (e.if.dealtHeroDamage != null) ok = (p.damageToEnemyHeroThisTurn || 0) >= e.if.dealtHeroDamage; // Crooked Cook
			else if (e.if.hpDamageGame != null) ok = (p.hpDamageGame || 0) >= e.if.hpDamageGame; // Jan'alai, the Dragonhawk
			else if (e.if.deckEmpty) ok = p.deck.length === 0; // Chef Nomi
			else if (e.if.holdingOtherClass) ok = p.hand.some(c => c !== source && c.cardClass && c.cardClass !== 'neutral' && c.cardClass !== p.heroClass); // Underbelly Fence
			else if (e.if.controlLackey) ok = p.board.some(c => !isDead(c) && typeof c.id === 'string' && c.id.startsWith('lackey_')); // Heistbaron Togwaggle
			else if (e.if.unspentMana) ok = availableMana(p) > 0; // Crystal Merchant
			else if (e.if.controlCountId) ok = p.board.filter(c => !isDead(c) && c.id === e.if.controlCountId.id).length >= e.if.controlCountId.count; // Desert Obelisk
			else if (e.if.boardFullOfId) ok = p.board.filter(c => !isDead(c) && c.type !== 'location').length >= 7 && p.board.every(c => isDead(c) || c.type === 'location' || c.id === e.if.boardFullOfId); // Mogu Cultist
			else if (e.if.enemyControlTribe) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => !isDead(c) && (c.tribe || '').includes(e.if.enemyControlTribe))); // Dragonmaw Poacher
			else if (e.if.invokedTwice) ok = (p.invokeCount || 0) >= 2; // Descent of Dragons "Invoked twice"
			else if (e.if.deckNoNeutral) ok = p.deck.length > 0 && p.deck.every(id => (state.cardsById[id]?.cardClass || 'neutral') !== 'neutral'); // Lightforged Zealot/Crusader
			else if (e.if.overloaded) ok = (p.overloadPending || 0) > 0 || (p.overloadLockedThisTurn || 0) > 0; // Cumulo-Maximus
			else if (e.if.heroPowerUpgraded) ok = !!p.heroPowerUpgraded || (p.imbueCount || 0) >= 1; // legacy Imbue proxy
			else if (e.if.imbuedAtLeast != null) ok = (p.imbueCount || 0) >= e.if.imbuedAtLeast || !!p.heroPowerUpgraded; // Petal Picker twice / Malorne 4x
			else if (e.if.kindredActive) ok = kindredActive(state, pi, source); // Lost City Kindred: you control another minion sharing a type
			else if (e.if.buildingStarship != null) ok = ((p.starshipPieces || []).length > 0) === !!e.if.buildingStarship; // Crystal Welder / Exarch Othaar / The Exodar
			else if (e.if.holdingNameIncludes) ok = p.hand.some(c => (c.name || '').includes(e.if.holdingNameIncludes) && c !== source); // Warchief / Mindflayer Rafaam
			else if (e.if.selfPaidZero != null) ok = (source && source._paidCost === 0) === !!e.if.selfPaidZero; // Void Ray
			else if (e.if.selfPaidMax != null) ok = !!source && source._paidCost != null && source._paidCost <= e.if.selfPaidMax; // Verdant Dreamsaber
			else if (e.if.friendlyDeathsAtLeast != null) ok = (p.friendlyDeaths || 0) >= e.if.friendlyDeathsAtLeast; // Aessina
			else if (e.if.playedQuestGame != null) ok = ((p.questsPlayedGame || 0) > 0) === !!e.if.playedQuestGame; // Questing Assistant
			else if (e.if.selfHeldMana != null) ok = !!source && (source._manaWhileHeld || 0) >= e.if.selfHeldMana; // Felwood / Broodwatcher / Merithra
			else if (e.if.noMinionLastTurn != null) ok = (p._minionLastTurn !== true) === !!e.if.noMinionLastTurn; // Wizened Wildspeaker
			else if (e.if.schoolCastThisTurn) ok = !!(p.schoolsCastThisTurn && p.schoolsCastThisTurn[e.if.schoolCastThisTurn]); // Baleful Blazer
			else if (e.if.selfCopiesDiedAtLeast != null) ok = !!source && (p.diedCountById?.[source.id] || 0) >= e.if.selfCopiesDiedAtLeast; // Captured Archmage
			else if (e.if.deckNoSpells != null) ok = !p.deck.some(id => { const dd = state.cardsById[id]; return dd && isSpellType(dd); }) === !!e.if.deckNoSpells; // Hexmarshal
			else if (e.if.ownTurnDamageAtLeast != null) ok = (p.ownTurnsDamage || 0) >= e.if.ownTurnDamageAtLeast; // Party Planner Vona
			else if (e.if.holdingTribe) ok = p.hand.some(c => c !== source && (c.tribe || '').includes(e.if.holdingTribe)); // Victor Nefarius: holding a Dragon
			else if (e.if.spellDamageDealtThisTurn != null) ok = (p.spellDmgTurn === state.turnNumber) === !!e.if.spellDamageDealtThisTurn; // Unstable Spellcaster
			else if (e.if.selfEnemyCopyHeld != null) ok = !!(source && source._enemyCopyWhileHeld) === !!e.if.selfEnemyCopyHeld; // Mind Sweeper
			else if (e.if.deckSharesType) { // City Chief Esho: every minion in your deck shares a minion type ('All' is a wildcard)
				const lists = p.deck.filter(id => state.cardsById[id]?.type === 'creature')
					.map(id => ((state.cardsById[id]?.tribe) || '').split('/').filter(Boolean));
				if (!lists.length || lists.some(l => !l.length)) ok = false;
				else {
					const candidates = new Set(lists.flat().filter(t => t !== 'All'));
					ok = lists.every(l => l.includes('All'))
						|| [...candidates].some(t => lists.every(l => l.includes(t) || l.includes('All')));
				}
			}
			else if (e.if.spellsThisTurn != null) ok = (p.spellsPlayedThisTurn || 0) >= e.if.spellsThisTurn; // Unstable Spellcaster (spell-damage-dealt approx)
			else if (e.if.deckCostsDistinct != null) ok = new Set(p.deck.map(id => state.cardsById[id]?.cost || 0)).size >= e.if.deckCostsDistinct; // Elise the Navigator: 10 cards of different Costs
			else if (e.if.selfDrawnThisTurn) ok = !!(source && source.drawnThisTurn); // Swiftdraw riders (Farm Hand / Benevolent Banker)
			else if (e.if.holdingDarkGift) ok = p.hand.some(c => c._darkGift); // Frostburn Matriarch / Dragon Turtle
			execEffects(state, pi, ok ? e.then : (e.else || []), target, source);
			if (ok && e.if.kindredActive && p.nextKindredTwice) { p.nextKindredTwice = false; execEffects(state, pi, e.then, target, source); } // Primalfin Challenger: your next Kindred triggers twice
} });

// ---------- endgame (PR 37): the final chain branches — chain EMPTY ----------
// Bodies are verbatim inside `do { ... } while (false)`: a top-level `continue`
// exits the do-while (= skip this effect, exactly the old chain semantics)
// while loop-scoped continues keep binding to their own loops. Types with
// trigger-side switch twins keep those twins (switch wins on the trigger
// path, unchanged); twin retirement is the next, deliberate step.

register('damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// lifesteal accounting (was the effects-loop prefix; only these two
	// damage types ever used it)
	const totalHurt = () => state.players.reduce((s, pl) => s + pl.board.reduce((b, c) => b + c.damage, 0) - pl.life - pl.armor, 0);
	const spellLS = source && (source.type === 'sorcery' || source.type === 'instant') && state.players[pi].spellsLifestealThisTurn; // Omega Mind
	const lsBefore = (e.lifesteal || spellLS) ? totalHurt() : null;
	do {
			if (e.requireElementalLastTurn && !state.players[pi].elementalLastTurn) continue; // Gyreworm
				if (e.requireControlOtherTribe && !state.players[pi].board.some(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.requireControlOtherTribe))) continue; // South Coast Chieftain
				if (e.requireDeckAtMost != null && state.players[pi].deck.length > e.requireDeckAtMost) continue; // Blood Shard Bristleback
				if (e.requireHoldingSchool && !state.players[pi].hand.some(c => schoolOf(c) === e.requireHoldingSchool)) continue; // Defias Leper
				if (e.requireHeroDamagedThisTurn && !state.players[pi].heroDamagedThisTurn) continue; // Shadowblade Slinger
				if (e.requireHoldingSpellMinCost != null && !state.players[pi].hand.some(c => isSpellType(c) && (c.cost || 0) >= e.requireHoldingSpellMinCost)) continue; // Weaver of the Cycle
				if (e.requireHeroPowerUpgraded && !(state.players[pi].heroPowerUpgraded || (state.players[pi].imbueCount || 0) >= 2)) continue; // Resplendent Dreamweaver: Imbued twice
				if (e.requireHeroHealthChanged && !state.players[pi].heroHealthChangedThisTurn) continue; // Liferender
				if (e.requireWeaponEquipped && !state.players[pi].weapon) continue; // Fogsail Freebooter
				if (e.requireQuestPlayed && !(state.players[pi].questsPlayedGame > 0)) continue; // Questing Assistant
			// friendly Spell Damage boosts direct spell damage
			let v = e.value === 'source-attack' ? (source?.attack || 0) : scaled(e); // Sergeant Sally
			if (e.valueFromHeroDamage) v = state.players[pi].heroDamageTakenThisTurn || 0; // Shadowblade Slinger
				if (e.valueFromSelfHealth && source) v = hp(source); // Cleansing Lightspawn: damage = this minion's Health
				if (e.valueFromSelfAttack && source) v = source.attack || 0; // Ebonscale Scout: damage = this minion's Attack
				if (e.altValueIfDrawn != null && source && source.drawnThisTurn) v = e.altValueIfDrawn; // Oil Rig Ambusher
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0) + (source.bonusSpellDamage || 0);
			}
			if (state.hpDamageBonus) v += state.hpDamageBonus; // Fallen Hero: your Hero Power deals extra
			if (state.hpDoubling) v *= 2; // Clockwork Automaton: double Hero Power damage
			v = boost(v);
			// spell damage landed this turn: Unstable Spellcaster + Raincaller's first-strike bonus
			if (source && isSpellType(source) && v > 0) {
				const sp0 = state.players[pi];
				if (sp0.spellDmgTurn !== state.turnNumber) {
					sp0.spellDmgTurn = state.turnNumber;
					for (const rc of sp0.board) if (rc.raincaller && !isDead(rc)) { rc.attack += 2; emit(state, { type: 'buff', uid: rc.uid, attack: rc.attack, hp: hp(rc) }); }
				}
			}
			// Lightning Storm rolls its damage per target
			const rollv = () => e.range
				? boost(e.range[0] + Math.floor(state.rng() * (e.range[1] - e.range[0] + 1)))
				: v;
			// Fyrakk: immune to spells of a school (spell damage passes source=null below,
			// so the school check happens here where the casting spell is still in scope)
			// Flux Revenant / Stormrook: school damage redirects into an effect instead
			const schoolImmune = t2 => {
				if (!t2 || !source || !isSpellType(source)) return false;
				if (t2.immuneToSchool && schoolOf(source) === t2.immuneToSchool) return true;
				const rd = t2.spellDamageRedirect;
				if (rd && schoolOf(source) === rd.school && !isDead(t2)) {
					execEffects(state, t2.controller, JSON.parse(JSON.stringify(rd.effects)), null, t2);
					return true;
				}
				return false;
			};
			switch (e.target) {
				case 'enemy-hero': { const t = enemyHero(); if (t != null) damageHero(state, t, v, pi); break; }
				case 'own-hero': damageHero(state, pi, v, pi); break;
				case 'friendly-others': for (const c of [...state.players[pi].board]) { if (c === source || c.type === 'location') continue; damageCreature(state, c, v, null); } break; // Afflicted Devastator
				case 'enemy-creatures': for (const o of enemies) for (const c of [...state.players[o].board]) { if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue; if (schoolImmune(c)) continue; damageCreature(state, c, rollv(), null); } break;
				case 'frozen-enemy-creatures': for (const o of enemies) for (const c of [...state.players[o].board]) { if (c.frozen) damageCreature(state, c, v, null); } break;
				case 'all-creatures': for (const pl of state.players) for (const c of [...pl.board]) { if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue; if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue; if (e.exceptSelf && c === source) continue; damageCreature(state, c, v, null); } break;
				case 'enemies':
					for (const o of enemies) {
						for (const c of [...state.players[o].board]) { if (schoolImmune(c)) continue; damageCreature(state, c, v, null); }
						damageHero(state, o, v, pi);
					}
					break;
				case 'enemy-heroes': // every opponent's face, creatures untouched
					for (const o of enemies) damageHero(state, o, v, pi);
					break;
				case 'all-heroes': // each hero including your own
					for (let s2 = 0; s2 < state.players.length; s2++) {
						if (!state.players[s2].eliminated) damageHero(state, s2, v, pi);
					}
					break;
				case 'undamaged-enemy-creatures': // Dark Iron Skulker
					for (const o of enemies) {
						for (const c of [...state.players[o].board]) {
							if (c.damage === 0) damageCreature(state, c, v, null);
						}
					}
					break;
				case 'everyone':
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						for (const c of [...state.players[s].board]) damageCreature(state, c, v, null);
						damageHero(state, s, v, pi);
					}
					break;
				case 'other-characters': // everything except the source creature
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						for (const c of [...state.players[s].board]) if (c !== source) damageCreature(state, c, v, null);
						damageHero(state, s, v, pi);
					}
					break;
				case 'other-creatures': // every creature except the source
					for (const pl of state.players) {
						for (const c of [...pl.board]) if (c !== source) damageCreature(state, c, v, null);
					}
					break;
				case 'damaged-creatures': // Sleep with the Fishes
					for (const pl of state.players) {
						for (const c of [...pl.board]) if (c.damage > 0) damageCreature(state, c, v, null);
					}
					break;
				case 'own-creatures': // Ticking Abomination
					for (const c of [...state.players[pi].board]) damageCreature(state, c, v, null);
					break;
				default: { // chosen target
					const t = chosenCreature();
					if (t && e.requireTargetTribe && !(t.tribe || '').length) break; // Bugsquasher: only typed minions
					if (t && schoolImmune(t)) break; // Fyrakk shrugs it off
					if (t) damageCreature(state, t, v, null);
					else if (target?.type === 'hero') damageHero(state, target.player, v, pi);
					else if (e.target === 'any') { const f = enemyHero(); if (f != null) damageHero(state, f, v, pi); } // fallback: face
				}
			}
			if (lsBefore != null) healHero(state, pi, Math.max(0, totalHurt() - lsBefore));
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) {
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					if (e.excludeSelf && c === source) continue; // Felfin Navigator: your OTHER Murlocs
						if (e.name && c.name !== e.name) continue; // Quartermaster's Recruits
					if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue;
					if (e.requireDamaged && !(c.damage > 0)) continue; // Ball and Chain
					buffCreature(c, e.attack, e.health);
				}
			} else if (e.target === 'all-creatures') {
				for (const pl of state.players) for (const c of pl.board) {
					if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue;
					buffCreature(c, e.attack, e.health);
				}
			} else if (e.target === 'friendly-others') {
				for (const c of state.players[pi].board) if (c !== source) buffCreature(c, e.attack, e.health);
			} else if (e.target === 'self') {
				if (source && !isDead(source)) buffCreature(source, e.attack, e.health); // Rolling Stone
			} else if (e.target === 'all-others') {
				// every player's board except the source itself (tribal blessings)
				for (const pl of state.players) for (const c of pl.board) {
					if (c === source) continue;
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					buffCreature(c, e.attack, e.health);
				}
			} else {
				const t = chosenCreature();
				if (t && !(e.requireDamaged && t.damage === 0)) {
					// Vile Library: "+1/+1. Repeat for each Imp you control."
					let times = 1;
					if (e.repeatPerFriendly) {
						times += state.players[pi].board.filter(c => !isDead(c)
							&& c.type !== 'location'
							&& ((c.tribe || '').includes(e.repeatPerFriendly)
								|| c.name.includes(e.repeatPerFriendly))).length;
					}
					for (let i = 0; i < times; i++) buffCreature(t, e.attack, e.health);
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('grant', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			const grantTo = e.target === 'friendly-creatures' ? state.players[pi].board
				: e.target === 'friendly-others' ? state.players[pi].board.filter(c => c !== source) // Camouflaged Dirigible
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : [])
				: [chosenCreature()].filter(Boolean);
			// tribe-restricted grants never fall back to a random creature
			if (!grantTo.length && e.target !== 'friendly-creatures' && e.target !== 'friendly-others' && e.target !== 'self' && !e.tribe) {
				// triggered grants without a chosen target bless a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c));
				if (pool.length) grantTo.push(pool[Math.floor(state.rng() * pool.length)]);
			}
			for (const c of grantTo) {
				// Castle Kennels: some grants only take on a matching tribe
				if (e.ifTribe && !(c.tribe || '').includes(e.ifTribe)) continue;
				if (e.ifName && c.name !== e.ifName) continue; // Balloon Merchant: Silver Hand Recruits
				if (!c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// board wipe; `others` spares the source, `spareRandom` spares one survivor
			const all = [];
			const wipeBoards = e.side === 'enemy' ? enemies.map(o => state.players[o]) : state.players;
			for (const pl of wipeBoards) for (const c of pl.board) if (!isDead(c)) all.push(c);
			let spare = null;
			if (e.others && source) spare = source;
			if (e.spareRandom && all.length) spare = all[Math.floor(state.rng() * all.length)];
			for (const c of all) {
				if (c === spare) continue;
				if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
				// "Destroy all non-Paladin creatures": spare a class's cards
				if (e.exceptClass && (c.cardClass || '').split('__').includes(e.exceptClass)) continue;
				if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue;
				if (e.maxCost != null && (c.cost || 0) > e.maxCost) continue; // Austere Command: MV 3 or less
				if (e.minCost != null && (c.cost || 0) < e.minCost) continue; // Austere Command: MV 4 or greater
				if (e.requireDamaged && !(c.damage > 0)) continue; // King Mosh: only damaged creatures
				if (e.maxAttack != null && (c.attack || 0) > e.maxAttack) continue; // Mossy Horror: 2 or less Attack
				if (e.exile) {
					const owner = state.players[c.controller];
					owner.board = owner.board.filter(x => x !== c);
					c.zone = 'exile'; owner.exile.push(c);
					emit(state, { type: 'exiled', uid: c.uid, player: c.controller, name: c.name });
				} else {
					c.damage = c.maxHealth;
					c.shield = false;
					emit(state, { type: 'destroy', uid: c.uid });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-art-ench', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// non-targeted artifact/enchantment removal (there's no board-permanent
			// targeting UI). scope 'enemy' (default) or 'all'; count N (default 1) or
			// 'all'; exile:true exiles instead of destroying.
			const scope = e.scope === 'all' ? state.players.map((_, i) => i) : enemies;
			const pool = [];
			for (const s2 of scope) for (const c of [...state.players[s2].artifacts, ...state.players[s2].enchantments]) {
				if (e.only && c.type !== e.only) continue; // only:'artifact' or 'enchantment'
				pool.push([s2, c]);
			}
			const n = e.count === 'all' ? pool.length : (e.count || 1);
			for (let k = 0; k < n && pool.length; k++) {
				const j = Math.floor(state.rng() * pool.length);
				const [own, c] = pool.splice(j, 1)[0];
				destroyPermanent(state, own, c, !!e.exile);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('random-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// lifesteal accounting (was the effects-loop prefix; only these two
	// damage types ever used it)
	const totalHurt = () => state.players.reduce((s, pl) => s + pl.board.reduce((b, c) => b + c.damage, 0) - pl.life - pl.armor, 0);
	const spellLS = source && (source.type === 'sorcery' || source.type === 'instant') && state.players[pi].spellsLifestealThisTurn; // Omega Mind
	const lsBefore = (e.lifesteal || spellLS) ? totalHurt() : null;
	do {
			// count independent hits of `value` at random members of the pool;
			// Jungle Gym: extra hits for each friendly of a tribe
			let hits = e.count || 1;
			if (e.countByAttack && source) hits = source.attack || 0; // Augmented Porcupine: split its Attack
			if (e.perFriendlyTribe) {
				hits += state.players[pi].board.filter(c => !isDead(c)
					&& (e.excludeSourceTribe ? c !== source : true) // Hydralisk: "each OTHER Zerg"
					&& (c.tribe || '').includes(e.perFriendlyTribe)).length;
			}
			if (e.perHandCard) hits = state.players[pi].hand.length; // Meteorologist
			if (e.perHandSpell) hits = state.players[pi].hand.filter(c => isSpellType(c)).length; // Void Flayer
			if (e.perManaCrystal) hits = state.players[pi].mana?.max || 0; // Trogg Gemtosser: one per Mana Crystal
			if (e.countStat) hits = state.players[pi][e.countStat] || 0; // Thor, Explosive Payload: once per Starship launched
			const _rdHit = e.distinct ? new Set() : null; // Night Elf Huntress: three DIFFERENT enemies
			for (let i = 0; i < hits; i++) {
				const pool = [];
				const pushBoard = side => { for (const c of state.players[side].board) if (!isDead(c) && c.type !== 'location' && !(e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) && !(e.exceptSource && c === source)) pool.push({ c }); };
				if (e.pool === 'friendly-others') { for (const c of state.players[pi].board) if (!isDead(c) && c !== source && c.type !== 'location') pool.push({ c }); } // Loose Specimen
				else if (e.pool === 'enemy-creatures') { for (const o of enemies) pushBoard(o); }
				else if (e.pool === 'all-creatures') { for (let s = 0; s < state.players.length; s++) pushBoard(s); }
				else if (e.pool === 'enemies') { for (const o of enemies) { pushBoard(o); pool.push({ hero: o }); } }
				else if (e.pool === 'characters') {
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						pushBoard(s);
						pool.push({ hero: s });
					}
				}
				if (!pool.length) break;
				let pickPool = pool;
				if (_rdHit) { pickPool = pool.filter(x => !_rdHit.has(x.hero != null ? 'h' + x.hero : x.c.uid)); if (!pickPool.length) break; }
				const pick = pickPool[Math.floor(state.rng() * pickPool.length)];
				if (_rdHit) _rdHit.add(pick.hero != null ? 'h' + pick.hero : pick.c.uid);
				const rdv = e.heraldScaled ? hm() : e.value;
				if (pick.hero != null) damageHero(state, pick.hero, rdv, pi);
				else {
					// Siege Tank, Deployed: excess damage hits the enemy hero
					const rem = Math.max(0, pick.c.maxHealth - pick.c.damage);
					damageCreature(state, pick.c, rdv, null);
					if (e.excessToHero && !pick.c.shield && rdv > rem) damageHero(state, pick.c.controller, rdv - rem, pi);
				}
			}
			if (lsBefore != null) healHero(state, pi, Math.max(0, totalHurt() - lsBefore));
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('add-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (e.requireDeckNoNeutral && state.players[pi].deck.some(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral')) continue; // The Countess
			const def = state.cardsById[e.id];
			const targets = e.eachPlayer ? state.players.map((_, idx) => idx).filter(idx => !state.players[idx].eliminated)
					: e.toEnemy ? opponentsOf(state, pi) : [pi]; // Mailbox Dancer gives the opponent a Coin
			for (const tp of targets) {
				const tpp = state.players[tp];
				for (let n = 0; n < (e.count || 1); n++) {
					if (def && tpp.hand.length < MAX_HAND) {
						const card = instantiate(def, tp);
						card.zone = 'hand';
						tpp.hand.push(card);
						emit(state, { type: 'conjure', player: tp, card, color: null });
					} else if (!def) {
						drawCards(state, tp, 1); // named card not in the pool yet
					}
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// battlecry/choice self-pump; `per` scales by a count
			if (source && source.zone === 'board' && !isDead(source)) {
				let n = 1;
				if (e.per === 'other-friendly') n = state.players[pi].board.filter(c => c !== source && !isDead(c)).length;
				else if (e.per === 'si7-others') n = Math.max(0, (state.players[pi].si7PlayedGame || 0) - 1); // SI:7 Informant
				else if (e.per === 'spells-this-turn') n = state.players[pi].spellsPlayedThisTurn || 0; // Queensguard
				else if (e.per === 'hand-cards') n = state.players[pi].hand.length;
				else if (e.per === 'hand-spells') n = state.players[pi].hand.filter(c => isSpellType(c)).length; // Brainstormer
				else if (e.per === 'hand-school') n = state.players[pi].hand.filter(c => isSpellType(c) && schoolOf(c) === e.school).length; // Ymirjar Frostbreaker: Frost spells in hand
				else if (e.per === 'pogos-played') n = state.players[pi].pogoCount || 0; // Pogo-Hopper
				else if (e.per === 'hero-damage-taken') n = state.players[pi].heroDamageTakenThisTurn || 0; // Nethersoul Buster
				else if (e.per === 'enemy-hand') n = opponentsOf(state, pi).reduce((s, o) => s + state.players[o].hand.length, 0); // Fire Hawk
				else if (e.per === 'cards-played') n = state.players[pi].cardsPlayedThisTurn;
				else if (e.per === 'enemy-deathrattle') n = state.players.reduce((s, pl, idx) =>
					idx === pi ? s : s + pl.board.filter(c => !isDead(c) && c.keywords.includes('deathrattle')).length, 0);
				else if (e.per === 'friendly-tribe') n = state.players[pi].board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.tribe)).length; // Draenei Totemcarver
				else if (e.per === 'enemy-creatures') n = state.players.reduce((s, pl, idx) => idx === pi ? s : s + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0); // Cyclopian Horror
				else if (e.per === 'elementals-game') n = state.players[pi].elementalsPlayedGame || 0; // Ozruk
					else if (e.per === 'died-this-turn') n = state.diedThisTurn || 0; // Wicked Skeleton
					else if (e.per === 'damaged-creatures') n = state.players.reduce((s, pl) => s + pl.board.filter(c => !isDead(c) && c.type !== 'location' && c.damage > 0).length, 0); // Death Revenant
				if (n > 0) buffCreature(source, (e.attack || 0) * n, (e.health || 0) * n);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('damage-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (source && source.zone === 'board' && !isDead(source)) damageCreature(state, source, e.value, null);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-from-deck-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Desert Camel: every player puts a creature of Cost N from their deck into play
			for (let s3 = 0; s3 < state.players.length; s3++) {
				const pl = state.players[s3];
				if (pl.eliminated) continue;
				const ci = pl.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (e.cost == null || (def.cost || 0) === e.cost); });
				if (ci >= 0) { const [id] = pl.deck.splice(ci, 1); summon(state, s3, state.cardsById[id]); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('set-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// "Change a creature's Health to N" — keeps aura bonuses on top
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'all-others'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c !== source))
				: e.target === 'enemy-creatures'
				? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')) // Veranus
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.maxHealth = e.value + (t.auraHealth || 0);
				t.damage = 0;
				t.tempHealth = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('set-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'all-others'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c !== source))
				: e.target === 'enemy-creatures'
				? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c))) // Eadric the Pure
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.attack = e.value + (t.auraAttack || 0);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('bounce', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (e.requireControlSecret && !state.players[pi].secrets.length) continue; // Blackjack Stunner
			if (e.target === 'permanent') {
				// single chosen permanent of any type (creature/artifact/enchantment/walker/location)
				if (target && target.uid != null) {
					const t = findPermanent(state, target.uid);
					if (t) bouncePermanent(state, target.player, t, e.costMod || 0);
				}
				continue;
			}
			// return creature(s) to the owner's hand as fresh copies
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'enemy-creatures'
					? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)))
					: e.target === 'friendly-others'
						? state.players[pi].board.filter(c => !isDead(c) && c !== source && c.type !== 'location') // Grumble, Worldshaker
					: e.target === 'random-friendly'
						? (() => { const pool = state.players[pi].board.filter(c => !isDead(c));
							return pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []; })()
					: e.target === 'random-enemy'
						? (() => { const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
							return pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []; })() // Sahket Sapper
						: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				const def = state.cardsById[t.id];
				if (def && owner.hand.length < MAX_HAND) {
					const card = instantiate(def, t.controller);
					card.zone = 'hand';
					card.cost = e.setCost != null ? e.setCost : Math.max(0, (def.cost || 0) + (e.costMod || 0));
					owner.hand.push(card);
				}
				emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name });
			}
			if (list.length) recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('tutor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// pull matching cards out of your deck into your hand
			const p = state.players[pi];
			const drawnIds = new Set();
			for (let i = 0; i < (e.count || 1); i++) {
				if (p.hand.length >= MAX_HAND) break;
				const idxs = [];
				for (let j = 0; j < p.deck.length; j++) {
					const def = state.cardsById[p.deck[j]];
					if (!def) continue;
					if (e.tribe && !(def.tribe || '').includes(e.tribe)) continue;
					if (e.cardType === 'spell' ? !isSpellType(def)
						: (e.cardType && def.type !== e.cardType)) continue;
					if (e.school && schoolOf(def) !== e.school) continue; // Twilight Deceptor
					if (e.maxCost != null && (def.cost || 0) > e.maxCost) continue;
					if (e.minCost != null && (def.cost || 0) < e.minCost) continue; if (e.cardType === 'secret' && !def.secret) continue; if (e.distinct && drawnIds.has(p.deck[j])) continue; if (e.health != null && (def.health || 0) !== e.health) continue; if (e.attack != null && (def.attack || 0) !== e.attack) continue; if (e.cost != null && (def.cost || 0) !== e.cost) continue; // Tol'vir Warden/Storm Chaser/Subject 9/Salhet's Pride/Holy Eggbearer
					if (e.requireKeyword && !(def.keywords || []).includes(e.requireKeyword)) continue;
					if (e.overload && !((def.overload || 0) > 0)) continue; // Pebbly Page: an Overload card
					if (e.nameIncludes && !(def.name || '').includes(e.nameIncludes)) continue; // Tiny Rafaam: draw a Rafaam
					idxs.push(j);
				}
				if (!idxs.length) break;
				// Witchwood Piper: draw the LOWEST-Cost match; Taelan: the HIGHEST; else random
				const j = e.lowest ? idxs.reduce((best, k) => (state.cardsById[p.deck[k]].cost || 0) < (state.cardsById[p.deck[best]].cost || 0) ? k : best, idxs[0])
					: e.highest ? idxs.reduce((best, k) => (state.cardsById[p.deck[k]].cost || 0) > (state.cardsById[p.deck[best]].cost || 0) ? k : best, idxs[0])
					: idxs[Math.floor(state.rng() * idxs.length)];
				const [id] = p.deck.splice(j, 1);
				drawnIds.add(id);
				const card = instantiate(state.cardsById[id], pi);
				card.zone = 'hand';
				if (e.buff) { card.attack += e.buff.attack || 0; card.maxHealth += e.buff.health || 0; } // Akali, the Rhino
				if (e.spellDamage) card.bonusSpellDamage = (card.bonusSpellDamage || 0) + e.spellDamage; // Volcanic Thrasher (Kindred): the drawn spell gets Spell Damage +2
				if (e.setAttack != null) card.attack = e.setAttack; // Jepetto Joybuzz: set to 1/1, cost 1
				if (e.setHealth != null) card.maxHealth = e.setHealth;
				if (e.setCost != null) card.cost = e.setCost;
				if (e.costMod) card.cost = Math.max(0, (card.cost || 0) + e.costMod); // Vashj Prime: reduce drawn spells' Cost
				if (e.gainDeathrattle && source && card.deathrattle && card.deathrattle.length) { source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(card.deathrattle))]; if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle'); } // Necrium Apothecary
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('consume-shields', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Blood Knight: pop every Divine Shield in play, grow per shield
			let n = 0;
			for (const pl of state.players) for (const c of pl.board) {
				if (isDead(c) || !c.shield) continue;
				c.shield = false;
				c.keywords = c.keywords.filter(k => k !== KW.DIVINE_SHIELD);
				emit(state, { type: 'shieldPop', uid: c.uid });
				n++;
			}
			if (n > 0 && source && source.zone === 'board' && !isDead(source)) {
				buffCreature(source, (e.attack || 0) * n, (e.health || 0) * n);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('temp-stealth-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Conceal: stealth until the owner's next turn
			for (const c of state.players[pi].board) {
				if (isDead(c) || c.stealthed) continue;
				c.stealthed = true;
				c.tempStealth = true;
				if (!c.keywords.includes(KW.STEALTH)) c.keywords.push(KW.STEALTH);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('recruit', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Kobolds Recruit: summon a random matching creature straight from your deck
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1); i++) {
				const idxs = [];
				for (let j = 0; j < p.deck.length; j++) {
					const def = state.cardsById[p.deck[j]];
					if (!def || def.type !== 'creature' || def.token) continue;
					if (e.tribe && !(def.tribe || '').includes(e.tribe)) continue;
					if (e.maxCost != null && (def.cost || 0) > e.maxCost) continue;
					if (e.minCost != null && (def.cost || 0) < e.minCost) continue;
					if (e.cost != null && (def.cost || 0) !== e.cost) continue;
					if (e.attack != null && (def.attack || 0) !== e.attack) continue;
					if (e.requireKeyword && !(def.keywords || []).includes(e.requireKeyword)) continue; // Death Speaker Blackthorn
					if (e.cardId && p.deck[j] !== e.cardId) continue; // Persistent Peddler: a copy of itself
					idxs.push(j);
				}
				if (!idxs.length) break;
				const j = idxs[Math.floor(state.rng() * idxs.length)];
				const [id] = p.deck.splice(j, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); // Captain Hooktusk: give them Rush
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('swap-stats-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Void Ripper: swap Attack and Health of all OTHER creatures
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type !== 'creature') continue;
				const a = c.attack, h2 = hp(c);
				c.attack = h2; c.maxHealth = a; c.damage = 0; c.tempAttack = 0; c.tempHealth = 0;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('replay-opponent-last-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Murozond the Infinite: play all cards your opponent played last turn (random targets)
			const o = enemies[0];
			if (o != null) {
				const randTarget = () => { const pool = []; for (let s2 = 0; s2 < state.players.length; s2++) { for (const c of state.players[s2].board) if (!isDead(c) && c.type !== 'location') pool.push({ type: 'creature', uid: c.uid, player: s2 }); pool.push({ type: 'hero', player: s2 }); } return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; };
				for (const id of (state.players[o].cardsPlayedLastTurnIds || [])) {
					const def = state.cardsById[id];
					if (!def) continue;
					if (def.type === 'creature') { if (state.players[pi].board.filter(c => !isDead(c)).length < 7) summon(state, pi, def); }
					else if (isSpellType(def) && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), randTarget(), source);
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('attack-all-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Deathwing, Mad Aspect: attack every other creature
			if (source && source.zone === 'board' && !isDead(source)) {
				for (const pl of state.players) for (const c of [...pl.board]) {
					if (c === source || isDead(c) || c.type === 'location') continue;
					if (isDead(source)) break;
					resolveCombat(state, source.controller, source.uid, { type: 'creature', uid: c.uid, player: c.controller });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('draw-and-summon-if-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Utgarde Grapplesnipe: both players draw; a drawn creature of a tribe is summoned
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2]; if (pl.eliminated) continue;
				const before = pl.hand.length;
				drawCards(state, s2, 1);
				const drawn = pl.hand.length > before ? pl.hand[pl.hand.length - 1] : null;
				if (drawn && drawn.type === 'creature' && (drawn.tribe || '').includes(e.tribe) && pl.board.filter(c => !isDead(c)).length < 7) {
					pl.hand = pl.hand.filter(c => c !== drawn); drawn.zone = 'board'; drawn.sick = true; pl.board.push(drawn);
					emit(state, { type: 'summon', player: s2, card: drawn }); fireOngoing(state, s2, 'summoned', { minion: drawn });
				}
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('duplicate-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Elise the Enlightened: add a copy of each other card in your hand
			const pp = state.players[pi];
			for (const c of [...pp.hand]) {
				if (c === source || pp.hand.length >= MAX_HAND) continue;
				const def = state.cardsById[c.id]; if (!def) continue;
				const cp = instantiate(def, pi); cp.zone = 'hand'; pp.hand.push(cp);
				emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('debuff-enemies-attack-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Quicksand Elemental: all enemy creatures lose Attack until your turn ends
			for (const o of enemies) for (const c of state.players[o].board) {
				if (isDead(c) || c.type === 'location' || c.attack <= 0) continue;
				const d = Math.min(c.attack, e.value || 2);
				c.attack -= d; c.turnAtkDebuff = (c.turnAtkDebuff || 0) + d;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-cheapest-from-hand-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Blatant Decoy: each player summons the lowest-Cost creature from their hand
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2];
				if (pl.eliminated || pl.board.filter(c => !isDead(c)).length >= 7) continue;
				const pool = pl.hand.filter(c => c.type === 'creature');
				if (!pool.length) continue;
				const cheap = pool.reduce((a, b) => (b.cost || 0) < (a.cost || 0) ? b : a);
				pl.hand = pl.hand.filter(c => c !== cheap);
				cheap.zone = 'board'; cheap.sick = true; pl.board.push(cheap);
				emit(state, { type: 'summon', player: s2, card: cheap }); fireOngoing(state, s2, 'summoned', { minion: cheap });
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('fill-board-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mad Summoner: fill every player's board with tokens
			for (let s2 = 0; s2 < state.players.length; s2++) {
				if (state.players[s2].eliminated) continue;
				while (state.players[s2].board.filter(c => !isDead(c)).length < 7) {
					const c = summon(state, s2, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Imp', type: 'creature', cost: 1, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 1, health: e.health || 1, description: `A ${e.attack || 1}/${e.health || 1} token.` });
					if (!c) break;
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('heal-all-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Nozari: restore both heroes to full Health
			for (let s2 = 0; s2 < state.players.length; s2++) { const pl = state.players[s2]; if (pl.eliminated) continue; if (pl.life < STARTING_LIFE) healHero(state, s2, STARTING_LIFE - pl.life); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('copy-board-battlecries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Barista Lynchen: add a copy of each of your other Battlecry creatures to hand
			const p = state.players[pi];
			for (const c of p.board) {
				if (c === source || isDead(c) || c.type !== 'creature' || !(c.keywords || []).includes('battlecry')) continue;
				if (p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[c.id]; if (!def) continue;
				const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
		// ('summon-deck-copy' is handled earlier in the chain — The Boom Reaver's
		// grant option was merged there after this duplicate was shadowed.)
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('copy-opening-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Hex Lord Malacrass: add a copy of your opening hand (minus this card)
			const p = state.players[pi];
			for (const id of (p.openingHand || [])) { if (p.hand.length >= MAX_HAND) break; if (source && id === source.id) { source._openingSkipped = source._openingSkipped || false; if (!source._openingSkipped) { source._openingSkipped = true; continue; } } const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-treants', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Treespeaker: turn your Treants into 5/5 Ancients
			const p = state.players[pi];
			for (const c of [...p.board]) {
				if (isDead(c) || !(c.name === 'Treant' || (c.tribe || '').includes('Treant'))) continue;
				const tok = instantiate({ id: 'token_ancient', name: 'Ancient', type: 'creature', cost: 0, token: true, rarity: 'common', attack: 5, health: 5, description: 'A 5/5 Ancient.' }, pi);
				tok.zone = 'board'; tok.sick = c.sick; p.board[p.board.indexOf(c)] = tok; c.zone = 'gone';
				emit(state, { type: 'transformed', uid: c.uid, player: pi, from: c.name, card: tok });
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('set-mana-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mojomaster Zihi: set each player to N Mana Crystals
			for (const pl of state.players) { if (pl.eliminated) continue; pl.mana.max = e.value || 5; pl.mana.cur = Math.min(pl.mana.cur, pl.mana.max); }
			emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(state.players[pi]) });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-foreign-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Princess Talanji: summon every creature in hand that didn't start in your deck
			const p = state.players[pi];
			for (const c of [...p.hand]) {
				if (c.type !== 'creature' || c.fromDeck) continue;
				if (p.board.filter(x => !isDead(x)).length >= 7) break;
				p.hand = p.hand.filter(x => x !== c);
				c.zone = 'board'; c.sick = true; p.board.push(c);
				emit(state, { type: 'summon', player: pi, card: c }); fireOngoing(state, pi, 'summoned', { minion: c });
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-friendly-others-filtered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Hatchery Helper: buff your OTHER minions matching an Attack filter, optionally grant a keyword
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				if (e.maxAttack != null && (c.attack || 0) > e.maxAttack) continue;
				buffCreature(c, e.attack || 0, e.health || 0);
				if (e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-others-draw-refresh', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Sawbones: destroy all your OTHER minions; draw a card and refresh a Mana Crystal for each
			const p = state.players[pi];
			let n = 0;
			for (const c of [...p.board]) { if (c === source || isDead(c) || c.type === 'location') continue; c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); n++; }
			sweepDeaths(state);
			if (n > 0) { drawCards(state, pi, n); if (p.mana) { p.mana.cur = Math.min(p.mana.max, (p.mana.cur || 0) + n); emit(state, { type: 'mana', player: pi, cur: p.mana.cur, max: p.mana.max }); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('arator', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Arator: friendly Silver Hand Recruits double up and get Taunt
			for (const c of state.players[pi].board) {
				if (c.name !== 'Silver Hand Recruit' || isDead(c)) continue;
				c.attack *= 2; c.maxHealth *= 2;
				if (!c.keywords.includes('taunt')) c.keywords.push('taunt');
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('isorath-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (source && source._devoured) {
				const op = state.players[source._devouredOwner];
				for (const id of source._devoured) {
					if (!state.cardsById[id] || op.hand.length >= MAX_HAND) continue;
					const c = instantiate(state.cardsById[id], source._devouredOwner);
					c.zone = 'hand'; op.hand.push(c);
					emit(state, { type: 'conjure', player: source._devouredOwner, card: c, color: null });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('leviathan-siphon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dread Leviathan: steal 3 Health, three times (first chosen, rest random)
			const first = chosenCreature();
			const hits = [];
			if (first) hits.push(first);
			for (let n = hits.length; n < 3; n++) {
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type === 'creature') pool.push(c);
				if (!pool.length) break;
				hits.push(pool[Math.floor(state.rng() * pool.length)]);
			}
			for (const t of hits) {
				if (isDead(t) || !source || isDead(source)) continue;
				const stolen = Math.min(3, Math.max(0, t.maxHealth - t.damage));
				damageCreature(state, t, 3, null);
				source.maxHealth += stolen;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
			sweepDeaths(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('alarashi-demons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Alarashi: hand minions become random Demons keeping stats and Cost
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Demon') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			if (pool.length) for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i];
				if (c.type !== 'creature' || c === source) continue;
				const nd = pool[Math.floor(state.rng() * pool.length)];
				const nc = instantiate(nd, pi);
				nc.zone = 'hand'; nc.attack = c.attack; nc.maxHealth = c.maxHealth; nc.cost = c.cost;
				p.hand[i] = nc;
				emit(state, { type: 'conjure', player: pi, card: nc, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('fins-swap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// The Fins Beyond Time: your starting hand returns until end of turn
			const p = state.players[pi];
			if (!p.illuciaSwap && p.startingHandIds) {
				p.savedHand = p.hand.filter(c => c !== source);
				p.hand = p.hand.filter(c => c === source);
				for (const id of p.startingHandIds) {
					if (!state.cardsById[id] || p.hand.length >= MAX_HAND) continue;
					const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
				}
				p.illuciaSwap = true;
				emit(state, { type: 'handSwap', player: pi });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-random-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// SI:7 Infiltrator: one random enemy Secret
			for (const o of enemies) {
				const op = state.players[o];
				if (!op.secrets.length) continue;
				const i = Math.floor(state.rng() * op.secrets.length);
				const [sec] = op.secrets.splice(i, 1);
				toGraveyard(state, o, sec);
				emit(state, { type: 'secretDestroyed', player: o, name: sec.name });
				break;
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('deathwing-wipe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Deathwing the Destroyer: discard a card per minion destroyed
			const p = state.players[pi];
			let destroyed = 0;
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type !== 'creature') continue;
				c.damage = c.maxHealth; c.shield = false;
				emit(state, { type: 'destroy', uid: c.uid });
				destroyed++;
			}
			sweepDeaths(state);
			for (let i = 0; i < destroyed && p.hand.length; i++) {
				const j = Math.floor(state.rng() * p.hand.length);
				const [c] = p.hand.splice(j, 1);
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('ursoc-rampage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Ursoc: attack ALL other minions, remembering his kills
			if (source) {
				source._ursocKills = [];
				for (const pl of state.players) for (const c of [...pl.board]) {
					if (c === source || isDead(source) || isDead(c) || c.type !== 'creature' || c.dormantLeft > 0) continue;
					damageCreature(state, c, source.attack, source);
					damageCreature(state, source, c.attack, c);
					if (isDead(c) && state.cardsById[c.id]) source._ursocKills.push(c.id);
				}
				sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('toru-jars', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Entomologist Toru: hand minions go into 0/1 Jars; break them to release
			const p = state.players[pi];
			for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i];
				if (c.type !== 'creature' || c === source || !state.cardsById[c.id]) continue;
				const jar = instantiate(state.cardsById['toru_jar'], pi);
				jar.zone = 'hand'; jar._heldId = c.id;
				p.hand[i] = jar;
				emit(state, { type: 'conjure', player: pi, card: jar, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('velen-exiled-replay', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Velen, Leader of the Exiled: replay Battlecries + Deathrattles of played Draenei
			const p = state.players[pi];
			for (const [id, n] of Object.entries(p.playedCountById || {})) {
				const def = state.cardsById[id];
				if (!def || !(def.tribe || '').includes('Draenei') || id === (source && source.id)) continue;
				for (let k = 0; k < n; k++) {
					if (def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, source);
					if (def.deathrattle) execEffects(state, pi, JSON.parse(JSON.stringify(def.deathrattle)), null, source);
					if (state.over) return ABORT; // was: exit execEffects entirely
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('keeper-doom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Keeper of Flame: hand minions get +N/+N but are destroyed in 3 turns
			const p = state.players[pi];
			for (const c of p.hand) {
				if (c.type !== 'creature' || c === source) continue;
				c.attack += e.attack || 0; c.maxHealth += e.health || 0;
				c._doomAtTurn = state.turnNumber + ((e.turns || 3) - 1) * state.players.length; // dies at your Nth end of turn
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('chromie-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Chromie: another copy of every (non-token) card you've played this game
			const p = state.players[pi];
			for (const [id, n] of Object.entries(p.playedCountById || {})) {
				const def = state.cardsById[id];
				if (!def || def.token) continue;
				for (let k = 0; k < n && p.hand.length < MAX_HAND; k++) {
					const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c);
					emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-distinct-tribes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Tortollan Storyteller: +1/+1 to one friendly minion of each different type
			const p = state.players[pi];
			const seen = new Set();
			for (const c of p.board) {
				if (isDead(c) || c.type !== 'creature' || c === source) continue;
				const t = (c.tribe || '').split('/')[0];
				if (!t || seen.has(t)) continue;
				seen.add(t);
				buffCreature(c, e.attack || 1, e.health || 1);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('grunty', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Grunty: summon four random Murlocs, then shoot them at random enemy minions
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Murloc') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let n = 0; n < 4 && pool.length; n++) {
				const m = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
				if (!m) continue;
				const foes = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foes.push(c);
				if (foes.length) damageCreature(state, foes[Math.floor(state.rng() * foes.length)], m.attack, m);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('replay-last-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Sasquawk: repeat each card you played last turn (spells re-cast untargeted, minions re-summoned)
			const p = state.players[pi];
			for (const id of [...(p.cardsPlayedLastTurnIds || [])]) {
				const def = state.cardsById[id];
				if (!def || def.token) continue;
				if (def.type === 'creature') summon(state, pi, def);
				else if (isSpellType(def) && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('hand-match-shuffle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Shadowcloaked Assailant: shuffle the opponent's copies of cards you're both holding into their deck
			const p = state.players[pi];
			const mine = new Set(p.hand.filter(c => c !== source).map(c => c.id));
			for (const o of enemies) {
				const op = state.players[o];
				const matches = op.hand.filter(c => mine.has(c.id));
				if (!matches.length) continue;
				op.hand = op.hand.filter(c => !matches.includes(c));
				for (const c of matches) op.deck.push(c.id);
				for (let i = op.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [op.deck[i], op.deck[j]] = [op.deck[j], op.deck[i]]; }
				emit(state, { type: 'handShuffledAway', player: o, count: matches.length });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-played-foreign-demons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Archimonde: summon every Demon you played this game that didn't start in your deck
			const p = state.players[pi];
			for (const [id, n] of Object.entries(p.playedCountById || {})) {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature' || !(def.tribe || '').includes('Demon')) continue;
				if ((p.startingDeckIds || []).includes(id)) continue;
				for (let k = 0; k < n; k++) summon(state, pi, def);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('gelbin-auras', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Gelbin of Tomorrow: put one of each Aura into the battlefield (3 turns each)
			const p = state.players[pi];
			for (const aid of ['gnomish_aura', 'mekkatorques_aura']) {
				const def = state.cardsById[aid];
				if (!def) continue;
				const a = instantiate(def, pi);
				a.zone = 'enchantment'; a.turnsLeft = 3;
				p.enchantments.push(a);
				emit(state, { type: 'enchant', player: pi, card: a });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-all-except-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Archmage Rafaam: every minion that isn't a Rafaam becomes a 1/1 Sheep
			const def = state.cardsById[e.tokenId];
			if (def) for (const pl of state.players) {
				for (let i = 0; i < pl.board.length; i++) {
					const c = pl.board[i];
					if (c.type !== 'creature' || isDead(c) || (c.name || '').includes(e.substr)) continue;
					const tok = instantiate(def, c.controller);
					tok.zone = 'board'; tok.sick = c.sick;
					pl.board[i] = tok; c.zone = 'gone';
					emit(state, { type: 'transformed', uid: c.uid, player: c.controller, from: c.name, card: tok });
				}
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('damage-all-except-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Calamitous Rafaam: damage every minion that isn't a Rafaam
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c.type !== 'creature' || isDead(c) || (c.name || '').includes(e.substr)) continue;
				damageCreature(state, c, e.value, null);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('discard-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Razidir (Kindred): your OPPONENT discards a random card
			for (const o of enemies) {
				const op = state.players[o];
				if (!op.hand.length) continue;
				const c = op.hand[Math.floor(state.rng() * op.hand.length)];
				op.hand = op.hand.filter(x => x !== c);
				if (!c.token) op.discardLogIds.push(c.id);
				emit(state, { type: 'discard', player: o, card: c });
				break;
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('steal-bonus-keywords', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Violet Punisher: strip a chosen enemy minion's bonus keywords, gain them + +1/+1 per stolen
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				const stealable = ['rush', 'taunt', 'divine_shield', 'lifesteal', 'poisonous', 'windfury', 'stealth'];
				let n = 0;
				for (const kw of stealable) {
					if (!t.keywords.includes(kw)) continue;
					t.keywords = t.keywords.filter(k => k !== kw);
					if (kw === 'divine_shield') t.shield = false;
					if (kw === 'stealth') t.stealthed = false;
					if (!source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; if (kw === 'stealth') source.stealthed = true; }
					n++;
				}
				if (n > 0) { buffCreature(source, n, n); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('double-health-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Glitter Moth: double the Health of your OTHER creatures
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				c.maxHealth += hp(c); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('damage-all-others-damaged', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Worgen Abomination: at end of turn, hit every OTHER already-damaged creature
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type === 'location' || c.damage <= 0) continue;
				damageCreature(state, c, e.value || 2, null);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dragonmaw Overseer: buff a random OTHER friendly minion (Invincible:
			// tribe filter + keyword grant; Stonecarver: only damaged; Menagerie
			// Mug/Jug + Eager Underling: `count` picks that many DISTINCT minions).
			// (Merged: this branch shadowed the count-carrying duplicate.)
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && (!e.tribe || (c.tribe || '').includes(e.tribe)) && (!e.requireDamaged || c.damage > 0));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const m = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				buffCreature(m, e.attack || 0, e.health || 0);
				if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('add-spells-on-friendly-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Lady Liadrin: add a copy of each spell you cast on friendly characters this game
			const p = state.players[pi];
			for (const id of p.spellsOnFriendly || []) {
				const def = state.cardsById[id];
				if (!def || p.hand.length >= MAX_HAND) continue;
				const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('set-stats-to-highest', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Argent Braggart: set this minion's Attack and Health to the highest on the board
			if (source) {
				let hiA = 0, hiH = 0;
				for (const pl of state.players) for (const c of pl.board) { if (isDead(c) || c.type === 'location') continue; hiA = Math.max(hiA, c.attack || 0); hiH = Math.max(hiH, hp(c) || 0); }
				source.attack = Math.max(source.attack || 0, hiA);
				source.maxHealth = Math.max(hp(source), hiH); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-copy-of-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mischievous Imp / Scuttlebutt Ghoul / Partner in Crime: summon N copies of this minion
			if (e.requireSecret && !state.players[pi].secrets.length) continue;
			const def = source && state.cardsById[source.id];
			if (def) for (let n = 0; n < (e.count || 1); n++) summon(state, pi, def);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-friendly-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Shadehound: buff your other minions of a tribe
			for (const c of state.players[pi].board) { if (isDead(c) || c.type === 'location') continue; if (e.exceptSelf && c === source) continue; if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue; buffCreature(c, e.attack || 0, e.health || 0); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-friendly-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Imp King Rafaam (Infused): buff your minions whose name contains a substring
			for (const c of state.players[pi].board) { if (isDead(c) || c.type === 'location') continue; if (e.nameIncludes && !(c.name || '').includes(e.nameIncludes)) continue; buffCreature(c, e.attack || 0, e.health || 0); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('damage-lowest-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Arrow Smith: deal damage to the lowest-Health enemy minion (Ball Hog: heals if source has Lifesteal)
			let low = null;
			for (const o of enemies) for (const c of state.players[o].board) { if (isDead(c) || c.type === 'location') continue; if (!low || hp(c) < hp(low)) low = c; }
			if (low) { const dealt = damageCreature(state, low, e.value || 1, source); if (dealt > 0 && source && (source.keywords || []).includes(KW.LIFESTEAL)) healHero(state, pi, dealt); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('buff-friendly-didnt-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// A. F. Kay: at end of turn, buff friendly minions that didn't attack this turn
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location' || c.dormantLeft > 0) continue;
				if ((c.attacksUsed || 0) !== 0) continue;
				c.attack += (e.attack || 0); c.maxHealth += (e.health || 0);
				emit(state, { type: 'buff', uid: c.uid, attack: e.attack || 0, health: e.health || 0 });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('eat-enemy-deck-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Hamm, the Hungry: eat a random minion in the enemy's deck, gain its stats (or fixed)
			if (source) {
				for (const o of enemies) {
					const idxs = state.players[o].deck.map((id, i) => ({ id, i })).filter(x => state.cardsById[x.id]?.type === 'creature');
					if (!idxs.length) continue;
					const pick = idxs[Math.floor(state.rng() * idxs.length)];
					state.players[o].deck.splice(pick.i, 1);
					source.attack += (e.attack || 2); source.maxHealth += (e.health || 2);
					emit(state, { type: 'buff', uid: source.uid, attack: e.attack || 2, health: e.health || 2 });
					break;
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-enemy-beast-attack-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Snoozin' Zookeeper: summon an X/X Beast for the opponent that attacks all of their minions
			for (const o of enemies) {
				const beast = summon(state, o, { id: e.id || 'token_wild_beast', name: e.name || 'Beast', type: 'creature', cost: 0, token: true, tribe: 'Beast', rarity: 'common', attack: e.attack || 8, health: e.health || 8, keywords: [], description: `A ${e.attack || 8}/${e.health || 8} token.` });
				if (!beast) continue;
				beast.sick = false;
				for (const victim of [...state.players[o].board]) {
					if (isDead(beast)) break;
					if (victim === beast || isDead(victim) || victim.type === 'location' || victim.dormantLeft > 0) continue;
					resolveCombat(state, o, beast.uid, { type: 'creature', uid: victim.uid, player: o });
				}
				break; // one opponent (1v1)
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('refresh-friendly-attacks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Exarch Akama: after this attacks, all OTHER friendly minions can attack again
			for (const c of state.players[pi].board) { if (c === source || isDead(c) || c.type === 'location') continue; c.attacksUsed = 0; c.sick = false; }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('resurrect-died-distinct-mincost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Merithra: resurrect all different friendly minions that cost N or more
			const p = state.players[pi];
			const seen = new Set();
			for (const id of (p.deathLogIds || [])) {
				if (seen.has(id)) continue; seen.add(id);
				const def = state.cardsById[id];
				if (def && def.type === 'creature' && (def.cost || 0) >= (e.minCost || 8)) summon(state, pi, def);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('brawl', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Badlands Brawler: destroy all minions except one random survivor (keep your own if e.favorSelf)
			const all = [];
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location') all.push(c);
			if (all.length > 1) { let survivor = null; if (e.favorSelf) { const mine = state.players[pi].board.filter(c => !isDead(c) && c.type !== 'location'); survivor = mine.length ? mine[Math.floor(state.rng() * mine.length)] : all[Math.floor(state.rng() * all.length)]; } else survivor = all[Math.floor(state.rng() * all.length)]; for (const c of all) { if (c === survivor) continue; c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); } sweepDeaths(state); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('shuffle-hand-redraw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Gaslight Gatekeeper: shuffle your hand into your deck, then draw that many
			const p = state.players[pi];
			const n = p.hand.filter(c => c !== source).length;
			for (const c of [...p.hand]) { if (c === source) continue; if (state.cardsById[c.id]) p.deck.push(c.id); }
			p.hand = p.hand.filter(c => c === source);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
			drawCards(state, pi, n);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-all-enemies-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Sir Finley: transform all enemy minions into fixed-stat tokens
			for (const o of enemies) { const op = state.players[o]; for (let i = 0; i < op.board.length; i++) { const c = op.board[i]; if (isDead(c) || c.type === 'location') continue; const tok = instantiate({ id: e.id || 'token_murloc', name: e.name || 'Murloc', type: 'creature', cost: 1, token: true, tribe: e.tribe || 'Murloc', rarity: 'common', attack: e.attack || 1, health: e.health || 1, description: `A ${e.attack || 1}/${e.health || 1} token.` }, o); tok.zone = 'board'; tok.uid = c.uid; tok.sick = c.sick; op.board[i] = tok; c.zone = 'gone'; emit(state, { type: 'transformed', uid: c.uid, player: o, from: c.name, card: tok }); } } recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('return-weaker-to-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// King Plush: return all minions with less Attack than this to their owners' decks
			if (source) { for (const pl of state.players) { for (const c of [...pl.board]) { if (c === source || isDead(c) || c.type === 'location') continue; if ((c.attack || 0) < (source.attack || 0) && state.cardsById[c.id]) { const owner = state.players[c.controller]; owner.board = owner.board.filter(x => x !== c); if (!c.token) owner.deck.push(c.id); c.zone = 'gone'; emit(state, { type: 'bounce', uid: c.uid, player: c.controller, name: c.name }); } } } recomputeAuras(state); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('resurrect-tribe-cost-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Inventor Boom: resurrect N different friendly Mechs costing M+; they attack random enemies
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.tribe || '').includes(e.tribe) && (d.cost || 0) >= (e.minCost || 0));
			const picked = [];
			for (let n = 0; n < (e.count || 2) && pool.length; n++) { const i = Math.floor(state.rng() * pool.length); const [def] = pool.splice(i, 1); const c = summon(state, pi, def); if (c) picked.push(c); }
			for (const c of picked) { if (isDead(c)) continue; c.sick = false; const foes = []; for (const o of enemies) { for (const x of state.players[o].board) if (!isDead(x) && x.type !== 'location' && !x.stealthed && x.dormantLeft <= 0) foes.push({ type: 'creature', uid: x.uid, player: o }); foes.push({ type: 'hero', player: o }); } if (foes.length && !isDead(c)) resolveCombat(state, pi, c.uid, foes[Math.floor(state.rng() * foes.length)]); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('copy-played-with-stat', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Joymancer Jepetto: add copies of every minion you've played this game with 1 Attack or 1 Health
			const p = state.players[pi];
			const seen = new Set();
			for (const id of p.playedMinionLog || []) { if (seen.has(id)) continue; seen.add(id); const def = state.cardsById[id]; if (def && def.type === 'creature' && ((def.attack || 0) === 1 || (def.health || 0) === 1) && p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-others-into-drawn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Colifero the Artist: draw a minion, transform all OTHER friendly minions into copies of it
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			const def = drawn && state.cardsById[drawn.id];
			if (def) { for (let i = 0; i < p.board.length; i++) { const c = p.board[i]; if (c === source || isDead(c) || c.type === 'location') continue; const tok = instantiate(JSON.parse(JSON.stringify(def)), pi); tok.zone = 'board'; tok.uid = c.uid; tok.sick = c.sick; p.board[i] = tok; c.zone = 'gone'; emit(state, { type: 'transformed', uid: c.uid, player: pi, from: c.name, card: tok }); } recomputeAuras(state); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-weaker-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Forgotten Animatronic: destroy a random minion with less Attack than this
			if (source) { const pool = []; for (const pl of state.players) for (const c of pl.board) { if (c === source || isDead(c) || c.type === 'location') continue; if ((c.attack || 0) < (source.attack || 0)) pool.push(c); } if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('grant-random-keyword-friendly-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Painted Canvasaur: give each OTHER friendly minion of a tribe a random keyword
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			for (const c of state.players[pi].board) { if (c === source || isDead(c) || c.type === 'location') continue; if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue; const k = kws[Math.floor(state.rng() * kws.length)]; if (!c.keywords.includes(k)) { c.keywords.push(k); if (k === KW.DIVINE_SHIELD) c.shield = true; } emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-all-others-gain-corpses', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Soulstealer: destroy all other minions; gain 1 Corpse per enemy destroyed
			let enemyDead = 0;
			for (const pl of state.players) for (const c of [...pl.board]) { if (c === source || isDead(c) || c.type === 'location') continue; if (c.controller !== pi) enemyDead++; c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			state.players[pi].corpses = (state.players[pi].corpses || 0) + enemyDead;
			emit(state, { type: 'corpses', player: pi, corpses: state.players[pi].corpses });
			sweepDeaths(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('fill-hand-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Ashamane: fill your hand with copies of cards from your opponent's deck (cheaper)
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { let guard = 20; while (p.hand.length < MAX_HAND && state.players[foe].deck.length && guard-- > 0) { const id = state.players[foe].deck[Math.floor(state.rng() * state.players[foe].deck.length)]; const def = state.cardsById[id]; if (!def) continue; const cp = instantiate(def, pi); cp.zone = 'hand'; if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('infect-enemies-summon-on-death', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Blightfang: give each enemy minion a Deathrattle that summons a Zombie for you
			const owner = pi;
			for (const o of enemies) for (const c of state.players[o].board) { if (isDead(c) || c.type === 'location') continue; c.deathrattle = (c.deathrattle || []).concat([{ type: 'summon-for-player', player: owner, summonId: e.summonId || 'rlk_zombie_taunt' }]); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('both-players-draw-discard-mill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Rin (Deathrattle): both players draw N, discard N, and destroy top N of deck
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2]; if (pl.eliminated) continue;
				drawCards(state, s2, e.value || 2);
				for (let i = 0; i < (e.value || 2) && pl.hand.length; i++) { const j = Math.floor(state.rng() * pl.hand.length); const [c] = pl.hand.splice(j, 1); toGraveyard(state, s2, c); emit(state, { type: 'discard', player: s2, card: c }); }
				for (let i = 0; i < (e.value || 2); i++) pl.deck.pop();
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('equip-both-mics', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// MC Blingtron: both players equip a 1/2 Microphone (damage-amp on the opponent's approximated/omitted)
			execEffects(state, pi, [{ type: 'equip', name: e.name || 'Microphone', attack: e.attack || 1, durability: e.durability || 2 }], null, source);
			for (const o of enemies) { const op = state.players[o]; if (op.eliminated) continue; if (op.weapon) breakWeapon(state, o, true); const w = instantiate({ id: 'token_microphone', name: e.name || 'Microphone', type: 'weapon', cost: 0, rarity: 'common', description: `A ${e.attack || 1}/${e.durability || 2} weapon.`, attack: e.attack || 1, durability: e.durability || 2 }, o); w.zone = 'weapon'; op.weapon = w; emit(state, { type: 'weaponEquip', player: o, card: w }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('snapshot-hand-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Photographer Fizzle: shuffle a copy of each card in your hand into your deck
			const p = state.players[pi];
			for (const c of p.hand) { if (c === source) continue; if (state.cardsById[c.id]) p.deck.push(c.id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('copy-hand-minions-distinct-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Rock Master Voone: add a copy of each minion of a different type in your hand
			const p = state.players[pi];
			const seen = new Set(); const toAdd = [];
			for (const c of p.hand) { if (c === source || c.type !== 'creature') continue; const tr = (c.tribe || '').split('/')[0] || ('_' + c.id); if (seen.has(tr)) continue; seen.add(tr); toAdd.push(c.id); }
			for (const id of toAdd) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('heal-friendlies-buff-per-overheal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dreamboat: restore N to all OTHER friendly minions; gain +1/+1 for each that Overhealed
			const p = state.players[pi];
			let over = 0;
			for (const c of p.board) { if (c === source || isDead(c) || c.type === 'location') continue; if (c.damage < (e.value || 3)) over++; healCreature(c, e.value || 3); }
			if (source && over) buffCreature(source, over, over);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('wrathspine', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Wrathspine Enchanter: cast a copy of a Fire, Frost, and Nature spell in your hand
			const p = state.players[pi];
			for (const sch of ['Fire', 'Frost', 'Nature']) {
				const src = p.hand.find(c => schoolOf(c) === sch);
				if (!src || !state.cardsById[src.id]) continue;
				const spell = instantiate(state.cardsById[src.id], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null); sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('add-back-held-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Commander Sivara: add the spells you cast while holding this back to your hand
			const p = state.players[pi];
			for (const id of (source && source.spellsHeldIds) || []) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (!def) continue; const nc = instantiate(def, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('replace-minions-other-class', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Cera'thine Fleetrunner: replace hand+deck minions with random other-class ones, cheaper
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.cardClass && d.cardClass !== 'neutral' && d.cardClass !== p.heroClass && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) {
				for (let i = 0; i < p.hand.length; i++) { const c = p.hand[i]; if (c.type !== 'creature') continue; const def = pool[Math.floor(state.rng() * pool.length)]; const nc = instantiate(def, pi); nc.zone = 'hand'; nc.cost = Math.max(0, (def.cost || 0) - (e.value || 2)); p.hand[i] = nc; }
				p.deck = p.deck.map(id => { const d = state.cardsById[id]; if (!d || d.type !== 'creature') return id; return pool[Math.floor(state.rng() * pool.length)].id; });
				p.deckMinionDiscount = (p.deckMinionDiscount || 0) + (e.value || 2);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('cast-all-fel', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Jace Darkweaver: cast all Fel spells you've played this game
			for (const id of [...(state.players[pi].felSpellsGame || [])]) {
				const def = state.cardsById[id]; if (!def) continue;
				const spell = instantiate(def, pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); const enemyT = legal.find(t => t.player !== pi); tgt = enemyT || (legal.length ? legal[Math.floor(state.rng() * legal.length)] : null); }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null); sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('add-stored-cards', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Enthusiastic Banker deathrattle: add the stashed cards to your hand
			const p = state.players[pi];
			for (const id of (source && source.storedCards) || []) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (!def) continue; const nc = instantiate(def, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('swap-with-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Shadow Hunter Vol'jin: swap a chosen minion with a random one in its owner's hand
			const t = chosenCreature();
			if (t) {
				const owner = state.players[t.controller];
				const handMinions = owner.hand.filter(c => c.type === 'creature');
				if (handMinions.length) {
					const hm = handMinions[Math.floor(state.rng() * handMinions.length)];
					// board minion -> hand (as a fresh card), hand minion -> board
					const bi = owner.board.indexOf(t);
					const hi = owner.hand.indexOf(hm);
					owner.hand.splice(hi, 1);
					hm.zone = 'board'; hm.sick = true; owner.board[bi] = hm;
					const def = state.cardsById[t.id];
					if (def && owner.hand.length < MAX_HAND) { const nc = instantiate(def, t.controller); nc.zone = 'hand'; owner.hand.push(nc); }
					t.zone = 'gone';
					emit(state, { type: 'summon', player: t.controller, card: hm }); recomputeAuras(state);
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('varden', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Varden Dawngrasp: freeze all enemy minions; already-frozen ones take damage instead
			for (const o of enemies) for (const c of [...state.players[o].board]) { if (isDead(c) || c.type === 'location') continue; if (c.frozen) damageCreature(state, c, e.value || 4, source); else freezeCreature(state, c); }
			sweepDeaths(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('resurrect-per-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// N'Zoth, God of the Deep: resurrect one friendly dead minion of each tribe
			const p = state.players[pi];
			const seen = new Set();
			for (const id of p.deathLogIds) {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature') continue;
				const tribe = def.tribe || 'none';
				if (seen.has(tribe)) continue;
				seen.add(tribe);
				summon(state, pi, def);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('readd-corrupted-free', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Y'Shaarj, the Defiler: add a copy of each Corrupted card played this game, cost 0 this turn
			const p = state.players[pi];
			for (const id of p.corruptedPlayedIds || []) {
				if (p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[id]; if (!def) continue;
				const nc = instantiate(def, pi); nc.zone = 'hand'; nc.cost = 0; nc.freeThisTurn = true; p.hand.push(nc);
				emit(state, { type: 'conjure', player: pi, card: nc, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-adjacent-costplus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Bogstrok Clacker: transform each neighbor into a random minion costing (1) more
			if (source) {
				const board = state.players[pi].board;
				const i = board.indexOf(source);
				for (const j of [i - 1, i + 1]) {
					const nb = board[j];
					if (!nb || isDead(nb) || nb.type === 'location') continue;
					const want = (nb.cost || 0) + (e.value || 1);
					const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
					if (!pool.length) continue;
					const def = JSON.parse(JSON.stringify(pool[Math.floor(state.rng() * pool.length)]));
					const tok = instantiate(def, nb.controller); tok.zone = 'board'; tok.sick = nb.sick;
					board[board.indexOf(nb)] = tok; nb.zone = 'gone';
					emit(state, { type: 'transformed', uid: nb.uid, player: nb.controller, from: nb.name, card: tok });
				}
				recomputeAuras(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('bless-divine-shield', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Nozdormu, Bronze Aspect: give your minions Divine Shield; any that already had one gain +3/+3 instead
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				if (c.keywords.includes(KW.DIVINE_SHIELD) && c.shield) buffCreature(c, e.attack ?? 3, e.health ?? 3);
				else { if (!c.keywords.includes(KW.DIVINE_SHIELD)) c.keywords.push(KW.DIVINE_SHIELD); c.shield = true; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('cast-random-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Servant of Yogg-Saron / Yogg-Saron: cast random spells with random targets
			const times = e.perSpellsCast ? (state.players[pi].spellsPlayedTotal || 0) : (e.count || 1);
			for (let n = 0; n < times && !state.over; n++) {
				const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false
					&& !(d.colors && d.colors.length) && !d.choices && !d.xSpell && !d.counterSpell
					&& (e.cardClass == null || (d.cardClass || 'neutral') === e.cardClass) // Solarian Prime: Mage spells
				&& (!e.otherClass || ((d.cardClass || 'neutral') !== 'neutral' && !(d.cardClass || '').split('__').includes(state.players[pi].heroClass || ''))) // Chaos Supplicant
					&& (e.cost == null || (d.cost || 0) === e.cost) // Enchanted Cauldron: same Cost
					&& (e.school == null || schoolOf(d) === e.school) // Druid of Regrowth: Nature spells
					&& (e.minCost == null || (d.cost || 0) >= e.minCost));
				if (!pool.length) break;
				const spell = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) continue; }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null);
				sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('grant-random-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Enhance-o Mechano: each other friendly creature gains a random keyword
			const kws = e.keywords || ['windfury', 'taunt', 'divine_shield'];
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				const k = kws[Math.floor(state.rng() * kws.length)];
				if (!c.keywords.includes(k)) {
					c.keywords.push(k);
					if (k === 'divine_shield') c.shield = true;
					emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('steal-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Kezan Mystic: take control of a random enemy Secret
			for (const o of enemies) {
				const p2 = state.players[o];
				if (!p2.secrets.length) continue;
				const idx = Math.floor(state.rng() * p2.secrets.length);
				const sec = p2.secrets[idx];
				if (state.players[pi].secrets.length >= MAX_SECRETS
					|| state.players[pi].secrets.some(s => s.id === sec.id)) break;
				p2.secrets.splice(idx, 1);
				sec.controller = pi; sec.zone = 'secret';
				state.players[pi].secrets.push(sec);
				emit(state, { type: 'secretPlayed', player: pi, card: sec });
				break; // one secret
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('destroy-strongest', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// destroy the highest-Attack enemy creature (Scalehide Kodo: `lowest` = lowest-Attack)
			let best = null;
			for (const o of enemies) for (const c of state.players[o].board) {
				if (isDead(c) || c.type === 'location') continue;
				if (!best || (e.lowest ? c.attack < best.attack : c.attack > best.attack)) best = c;
			}
			if (best) {
				best.damage = best.maxHealth;
				best.shield = false;
				emit(state, { type: 'destroy', uid: best.uid });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('sacrifice-each-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// every opponent loses a random creature
			for (const o of enemies) {
				const pool = state.players[o].board.filter(c => !isDead(c));
				if (!pool.length) continue;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('proliferate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// each creature you've strengthened grows +1/+1; each of your planeswalkers gains 1 loyalty
			const pp = state.players[pi];
			for (const c of [...pp.board]) {
				if (c.type === 'location' || isDead(c)) continue;
				if ((c.counters || 0) > 0) buffCreature(c, 1, 1);
			}
			for (const w of pp.planeswalkers) { w.loyalty = (w.loyalty || 0) + 1; emit(state, { type: 'walkerLoyalty', uid: w.uid, loyalty: w.loyalty }); }
			emit(state, { type: 'proliferate', player: pi });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('transform-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// transform every creature you own (hand, deck, battlefield) into a random
			// creature that naturally costs `delta` more
			const p = state.players[pi];
			const delta = e.delta || 3;
			const rc = cost => { const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
				&& (d.cost || 0) === cost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; };
			for (const c of [...p.board]) {
				if (c.type !== 'creature' || isDead(c)) continue;
				const def = rc((state.cardsById[c.id]?.cost || 0) + delta); if (!def) continue;
				const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = c.sick;
				p.board[p.board.indexOf(c)] = tok; c.zone = 'gone';
				emit(state, { type: 'transformed', uid: c.uid, player: pi, from: c.name, card: tok });
			}
			for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i]; if (c.type !== 'creature') continue;
				const def = rc((state.cardsById[c.id]?.cost || 0) + delta); if (!def) continue;
				const tok = instantiate(def, pi); tok.zone = 'hand'; p.hand[i] = tok;
			}
			for (let i = 0; i < p.deck.length; i++) {
				const d = state.cardsById[p.deck[i]]; if (!d || d.type !== 'creature') continue;
				const def = rc((d.cost || 0) + delta); if (def) p.deck[i] = def.id;
			}
			recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('sacrifice-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pool = state.players[s2].board.filter(c => !isDead(c));
				if (!pool.length) continue;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('grant-recent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// bless the most recently summoned friendly creatures (token riders)
			const recent = state.players[pi].board.slice(-(e.count || 1));
			for (const c of recent) {
				if (isDead(c) || c.keywords.includes(e.keyword)) continue;
				c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

const _h_mind_control = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// steal an enemy creature (chosen, or random from a qualifying enemy)
			let t = null;
			if (e.type === 'mind-control') {
				const c = chosenCreature();
				if (c && c.controller !== pi && (e.maxAttack == null || c.attack <= e.maxAttack) && (e.maxHealth == null || hp(c) <= e.maxHealth)) t = c; // Eternus: Health or less
			} else {
				const pool = [];
				for (const o of enemies) {
					const live = state.players[o].board.filter(c => !isDead(c));
					if (e.requireBoard && live.length < e.requireBoard) continue;
					pool.push(...live);
				}
				if (pool.length) t = pool[Math.floor(state.rng() * pool.length)];
			}
			if (t && !state.players[pi].eliminated) {
				state.players[t.controller].board = state.players[t.controller].board.filter(c => c !== t);
				t.controller = pi;
				t.sick = true;
				state.players[pi].board.push(t);
				emit(state, { type: 'mindControl', uid: t.uid, player: pi, name: t.name });
				recomputeAuras(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('mind-control', _h_mind_control);
register('mind-control-random', _h_mind_control); // shared or-branch handler

const _h_repeat_battlecries = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Shudderwock / Tess Greymane: re-run remembered effects with random targets
			const list = e.type === 'repeat-battlecries' ? state.players[pi].battlecriesPlayedGame : state.players[pi].otherClassPlayedGame;
			const randTarget = () => {
				const pool = [];
				for (let s2 = 0; s2 < state.players.length; s2++) { if (state.players[s2].eliminated) continue; for (const c of state.players[s2].board) if (!isDead(c) && c.type !== 'location') pool.push({ type: 'creature', uid: c.uid, player: s2 }); pool.push({ type: 'hero', player: s2 }); }
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
			};
			for (const id of [...list]) {
				const def = state.cardsById[id];
				if (def && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), randTarget(), source);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('repeat-battlecries', _h_repeat_battlecries);
register('replay-other-class', _h_repeat_battlecries); // shared or-branch handler

const _h_draw_lowest = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Grillmaster: draw your lowest / highest Cost card
			const p = state.players[pi];
			if (p.deck.length && p.hand.length < MAX_HAND) { let idx = 0; for (let i = 1; i < p.deck.length; i++) { const ci = state.cardsById[p.deck[i]]?.cost || 0, cb = state.cardsById[p.deck[idx]]?.cost || 0; if (e.type === 'draw-lowest' ? ci < cb : ci > cb) idx = i; } const [id] = p.deck.splice(idx, 1); const card = instantiate(state.cardsById[id], pi); card.zone = 'hand'; card.fromDeck = true; p.hand.push(card); emit(state, { type: 'draw', player: pi, card }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('draw-lowest', _h_draw_lowest);
register('draw-highest', _h_draw_lowest); // shared or-branch handler

const _h_attach = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// enchant-creature aura: permanent stats/keywords riding the target
			// ('attach' = boon for AI targeting, 'attach-curse' = Pacifism-style)
			const t = chosenCreature();
			if (t) {
				if (e.attack || e.health) buffCreature(t, e.attack || 0, e.health || 0);
				for (const k of e.keywords || []) {
					if (!t.keywords.includes(k)) t.keywords.push(k);
					if (k === KW.DIVINE_SHIELD) t.shield = true;
					if (k === KW.STEALTH) t.stealthed = true;
				}
				if (source) t.attachments.push(source.name);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('attach', _h_attach);
register('attach-curse', _h_attach); // shared or-branch handler

const _h_scry = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Scry = your own deck; Gaze = an opponent's (paper ruling).
			// The chooser's decision resolves asynchronously via resolveScry.
			const deckOwner = e.type === 'scry' ? pi : enemyHero();
			if (deckOwner != null) {
				const od = state.players[deckOwner].deck;
				const ids = [];
				for (let i = 0; i < e.value && od.length; i++) ids.push(od.pop());
				if (ids.length) {
					state.scryQueue.push({ chooser: pi, deckOwner, ids });
					emit(state, { type: 'scryStart', chooser: pi, deckOwner, count: ids.length });
					firePonder(state, pi, { scry: true });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('scry', _h_scry);
register('gaze', _h_scry); // shared or-branch handler

const _h_conjure = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// create a random card from outside the game: by color, or by a
			// named theme pool (falling back to any colored card, then anything)
			const p = state.players[pi];
			const defs = Object.values(state.cardsById).filter(d => d.type !== 'land');
			let pool;
			if (e.type === 'conjure') {
				pool = defs.filter(d => d.colors?.includes(e.color));
				if (!pool.length) pool = defs.filter(d => d.colors?.length);
			} else {
				const m = (e.match || '').toLowerCase();
				pool = m ? defs.filter(d => d.name.toLowerCase().includes(m)) : defs.slice();
				// optional narrowing: "a random Frost SPELL" / "a random DRUID card"
				if (e.cardType === 'spell') pool = pool.filter(d => d.type === 'sorcery' || d.type === 'instant');
				else if (e.cardType) pool = pool.filter(d => d.type === e.cardType);
				if (e.cardClass) pool = pool.filter(d =>
					(d.cardClass || 'neutral').split('__').includes(e.cardClass));
				if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
				pool = pool.filter(d => !d.token && d.collectible !== false);
				if (!pool.length) pool = defs.filter(d => d.colors?.length);
			}
			if (!pool.length) pool = defs;
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				if (p.hand.length >= MAX_HAND) break;
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi);
				card.zone = 'hand';
				const cmod = e.heraldScaled ? -hm() : (e.costMod || 0);
				if (cmod) card.cost = Math.max(0, (card.cost || 0) + cmod);
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: e.color || null });
				fireEmerge(state, pi, card);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('conjure', _h_conjure);
register('conjure-named', _h_conjure); // shared or-branch handler


// ---------- endgame II (PR 38): the trigger switch, retired ----------

registerTrigger('counter', (state, pi, e, ctx, triggering) => {
	do { ctx.countered = true; break;
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('destroy-damaged-subject', (state, pi, e, ctx, triggering) => {
	do { {
				// Holotechnician: destroy the minion that just took damage
				const d = ctx.damaged;
				if (d && !isDead(d) && d.type !== 'location') { d.damage = d.maxHealth; d.shield = false; emit(state, { type: 'destroy', uid: d.uid }); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-token-by-heal-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Screaming Banshee: summon a token with stats equal to the amount the hero just healed
				const amt = ctx.amount || 0;
				if (amt > 0) summon(state, pi, { id: e.summonId || 'token_soul', name: e.name || 'Soul', type: 'creature', cost: 0, token: true, rarity: 'common', attack: amt, health: amt, description: `A ${amt}/${amt} token.` });
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('metrognome', (state, pi, e, ctx, triggering) => {
	do { {
				// Metrognome: after playing a card of the tracked cost, draw one of the next cost, then increase
				const self = ctx.self, played = ctx.played;
				if (self && played && (played.cost || 0) === (self.metroCost || 0)) {
					execEffects(state, pi, [{ type: 'tutor', cost: (self.metroCost || 0) + 1, count: 1 }], null, self);
					self.metroCost = (self.metroCost || 0) + 1;
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-played-grant-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Hawkstrider Rancher: buff the just-played minion +X/+X and give it a Deathrattle
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') {
					m.attack += e.attack || 1; m.maxHealth += e.health || 1;
					if (e.deathrattle) { m.deathrattle = (m.deathrattle || []).concat(JSON.parse(JSON.stringify(e.deathrattle))); if (!m.keywords.includes('deathrattle')) m.keywords.push('deathrattle'); }
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('set-attacked-health', (state, pi, e, ctx, triggering) => {
	do { {
				// Keeneye Spotter: set the hero-attacked minion's Health to N
				const t = ctx.target;
				if (t && t.type === 'creature' && !isDead(t)) { t.maxHealth = e.value ?? 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('steal-victim-to-hand', (state, pi, e, ctx, triggering) => {
	do { {
				// Kologarn: put the minion this attacked into your hand
				const v = ctx.victim;
				if (v && !isDead(v) && v.controller != null && state.cardsById[v.id] && state.players[pi].hand.length < MAX_HAND) {
					const owner = state.players[v.controller];
					owner.board = owner.board.filter(c => c !== v); v.zone = 'gone';
					const cp = instantiate(state.cardsById[v.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp);
					emit(state, { type: 'bounce', uid: v.uid, player: pi, name: v.name }); recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-copy-of-killed', (state, pi, e, ctx, triggering) => {
	do { {
				// Overlord Drakuru: resurrect the minion this just killed onto your side; Primal Sabretooth: to hand
				const v = ctx.victim, def = v && state.cardsById[v.id];
				if (def && !state.players[pi].eliminated) {
					if (e.toHand) { const p = state.players[pi]; if (p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
					else summon(state, pi, def);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-enemy-hero-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Brutal Annihilan: deal the damage just survived to the enemy hero
				const amt = ctx.amount || 0;
				if (amt > 0) { for (const o of opponentsOf(state, pi)) damageHero(state, o, amt, pi); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-own-hero-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Brain Masseuse: deal the damage this minion just took to your own hero
				const amt2 = ctx.amount || 0;
				if (amt2 > 0) damageHero(state, pi, amt2, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				// Hozen Roughhouser: buff the attacking minion (ctx.minion from friendly-attacks)
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m)) { m.attack += e.attack || 0; m.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-random-cost-from-dead', (state, pi, e, ctx, triggering) => {
	do { {
				// Carefree Cookie: summon a random minion costing N more than the friendly that just died
				const dead = ctx.dead;
				if (dead) { const want = (dead.cost || 0) + (e.plus || 1); const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length)); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-keyword-played', (state, pi, e, ctx, triggering) => {
	do { {
				// Brittlebone Buccaneer: give the just-played minion a keyword
				const m = ctx.minion;
				if (m && m !== ctx.self && m.type === 'creature' && !isDead(m) && !m.keywords.includes(e.keyword)) { m.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gain-dead-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Devourer of Souls: gain the Deathrattle of a friendly minion that just died
				const d2 = ctx.dead, s2 = ctx.self;
				if (d2 && s2 && !isDead(s2) && d2.deathrattle && d2.deathrattle.length) {
					s2.deathrattle = [...(s2.deathrattle || []), ...JSON.parse(JSON.stringify(d2.deathrattle))];
					if (!s2.keywords.includes('deathrattle')) s2.keywords.push('deathrattle');
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('become-copy-of-enemy-played', (state, pi, e, ctx, triggering) => {
	do { {
				// Cosplay Contestant: transform into a set-stat copy of the minion the opponent just played
				const m = ctx.minion, self = ctx.self, base = m && state.cardsById[m.id];
				if (base && self && !isDead(self) && self.zone === 'board') {
					const def = JSON.parse(JSON.stringify(base));
					if (e.attack != null) def.attack = e.attack;
					if (e.health != null) def.health = e.health;
					if (e.stats != null) { def.attack = e.stats; def.health = e.stats; }
					def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = self.sick; tok.uid = self.uid;
					const board = state.players[pi].board; const i = board.indexOf(self);
					if (i >= 0) { board[i] = tok; self.zone = 'gone'; emit(state, { type: 'transformed', uid: self.uid, player: pi, from: self.name, card: tok }); recomputeAuras(state); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('become-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
				// Creepy Painting: transform into a copy of a minion that just died
				const dead = ctx.dead, self = ctx.self;
				const def = dead && state.cardsById[dead.id];
				if (def && self && dead !== self && def.type === 'creature' && !isDead(self)) {
					const fresh = instantiate(def, pi);
					const board = state.players[pi].board;
					const i = board.indexOf(self);
					if (i >= 0) { fresh.uid = self.uid; fresh.zone = 'board'; fresh.sick = self.sick; board[i] = fresh; emit(state, { type: 'transform', uid: self.uid, name: fresh.name }); recomputeAuras(state); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('copy-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Mana Bind: add a copy of the countered spell to your hand at cost 0
				const sp = ctx.spell, pp = state.players[pi];
				if (sp && state.cardsById[sp.id]) {
					const cp = instantiate(state.cardsById[sp.id], pi);
					cp.zone = 'hand'; cp.cost = 0;
					pp.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('return-played-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Diligent Notetaker (Spellburst): return the just-cast spell to hand
				const sp = ctx.played, pp = state.players[pi], def = sp && state.cardsById[sp.id];
				if (def) {
					const cp = instantiate(def, pi); cp.zone = 'hand';
					pp.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('prevent', (state, pi, e, ctx, triggering) => {
	do { ctx.prevented = true; break;
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-played-if-cost', (state, pi, e, ctx, triggering) => {
	do { {
					// Toxmonger: give the creature you just played a keyword if it costs N;
					// Magic Carpet also pumps it (+Attack) and grants Rush
					const m = ctx.minion;
					if (m && m !== ctx.self && (m.cost || 0) === (e.cost ?? 1)) {
						if (e.keyword && !m.keywords.includes(e.keyword)) { m.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; }
						if (e.attack || e.health) { m.attack += e.attack || 0; m.maxHealth += e.health || 0; }
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-on-friendly-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Nightscale Matriarch: a friendly creature was healed -> summon a token
					if (ctx.healedCreature && ctx.healedCreature.controller === pi) {
						summon(state, pi, { id: 'token_' + (e.name || 'whelp').toLowerCase(), name: e.name || 'Whelp', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 3, health: e.health || 3, description: `A ${e.attack || 3}/${e.health || 3} token.` });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-self-shield-on-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// The Glass Knight: whenever you restore Health, regain Divine Shield
					const healedYours = ctx.healedHero === pi || (ctx.healedCreature && ctx.healedCreature.controller === pi);
					if (healedYours && ctx.self && !ctx.self.shield && !isDead(ctx.self)) {
						ctx.self.shield = true;
						if (!ctx.self.keywords.includes(KW.DIVINE_SHIELD)) ctx.self.keywords.push(KW.DIVINE_SHIELD);
						emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('awaken-on-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Lucentbark's dormant seed: restore 5 Health (total) to wake it up
					const self = ctx.self;
					if (self && ctx.healedHero === pi) {
						self._healBank = (self._healBank || 0) + (ctx.amount || 0);
						if (self._healBank >= (e.threshold || 5) && state.cardsById[e.into]) {
							const tok = instantiate(state.cardsById[e.into], self.controller);
							tok.zone = 'board'; tok.sick = false;
							const board = state.players[self.controller].board;
							board[board.indexOf(self)] = tok; self.zone = 'gone';
							emit(state, { type: 'transformed', uid: self.uid, player: self.controller, from: self.name, card: tok });
							recomputeAuras(state);
						}
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-shuffled-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Tak Nozwhisker: when you shuffle a card in, add a copy to your hand
					const def = ctx.cardId && state.cardsById[ctx.cardId];
					if (def && !def.token && state.players[pi].hand.length < MAX_HAND) {
						const c = instantiate(def, pi); c.zone = 'hand'; state.players[pi].hand.push(c);
						emit(state, { type: 'conjure', player: pi, card: c, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-choose-copies', (state, pi, e, ctx, triggering) => {
	do { {
					// Keeper Stalladris: after a Choose One spell, add copies of both choices
					// (approximated: two copies of the spell you cast)
					const sp = ctx.played;
					if (sp && state.cardsById[sp.id]) for (let i = 0; i < 2; i++) {
						if (state.players[pi].hand.length >= MAX_HAND) break;
						const c = instantiate(state.cardsById[sp.id], pi); c.zone = 'hand'; state.players[pi].hand.push(c);
						emit(state, { type: 'conjure', player: pi, card: c, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-drawn-rush-doom', (state, pi, e, ctx, triggering) => {
	do { {
					// Fel Lord Betrug: drew a creature -> summon a Rush copy that dies at end of turn
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id]) {
						const cp = instantiate(state.cardsById[c.id], pi);
						cp.zone = 'board'; cp.sick = true;
						if (!cp.keywords.includes('rush')) cp.keywords.push('rush');
						cp.doomTurn = state.turnNumber;
						state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('if-played-then', (state, pi, e, ctx, triggering) => {
	do { {
					// generic "after you play a creature matching X, do Y" (Underbelly Angler, Arcane Fletcher)
					const m = ctx.minion;
					if (m && m !== ctx.self && (e.cost == null || (m.cost || 0) === e.cost) && (!e.tribe || (m.tribe || '').includes(e.tribe))) {
						execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('tutor-spell-cost-plus', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Frog: draw a spell costing (cast spell's cost + N)
					const sp = ctx.spell || ctx.played;
					if (sp) execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', cost: (sp.cost || 0) + (e.value || 1) }], null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-keyword-to-played', (state, pi, e, ctx, triggering) => {
	do { {
					// Mortuary Machine: give a keyword to the creature just played
					const m = ctx.minion;
					if (m && m !== ctx.self && e.keyword && !m.keywords.includes(e.keyword)) {
						m.keywords.push(e.keyword);
						if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('set-summoned-health-to-attack', (state, pi, e, ctx, triggering) => {
	do { {
					// High Priest Amet: a creature you summoned gets Health equal to its Attack
					const m = ctx.minion;
					if (m && m !== ctx.self) { m.maxHealth = m.attack; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('if-nth-spell-then', (state, pi, e, ctx, triggering) => {
	do { {
					// Chenvaala: after every 3rd spell this turn, run an effect
					if (((state.players[pi].spellsPlayedThisTurn || 0) % (e.every || 3)) === 0 && (state.players[pi].spellsPlayedThisTurn || 0) > 0) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('if-summoned-tribe-then', (state, pi, e, ctx, triggering) => {
	do { {
					// Skybarge: after you summon a creature of a tribe, run an effect
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-summoned-if-tribe', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Lynx: you summoned a creature of a tribe -> buff it.
					// Also gates on requireKeyword (Parade Leader: Rush) and maxHealth
					// (Carnival Barker: a 1-Health minion).
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))
						&& (!e.requireKeyword || (m.keywords || []).includes(e.requireKeyword))
						&& (!e.ifName || m.name === e.ifName)
						&& (e.maxHealth == null || hp(m) <= e.maxHealth)
						&& (!e.maxAttackSelf || (ctx.self && m.attack < ctx.self.attack))) { // Blood Matriarch Liadrin
						if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; } // Lothraxion
						for (const g of e.grants || []) if (!m.keywords.includes(g)) { m.keywords.push(g); if (g === KW.DIVINE_SHIELD) m.shield = true; if (g === KW.STEALTH) m.stealthed = true; } // Liadrin: DS + Rush
						m.attack += e.attack || 0; m.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

const _t_buff_random_hand_on_death = (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Bat / History Buff: buff a random creature in your hand
					const pool = state.players[pi].hand.filter(c => c.type === 'creature');
					if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
};
registerTrigger('buff-random-hand-on-death', _t_buff_random_hand_on_death);

registerTrigger('shuffle-cheap-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Dead: shuffle a cost-set copy of the fallen friendly into your deck
					const m = ctx.dead;
					if (m && state.cardsById[m.id] && !state.cardsById[m.id].token) {
						state.players[pi].deck.push(m.id); // (cost override is cosmetic once shuffled; keep it simple)
						const dk = state.players[pi].deck;
						for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-of-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Tiger (e.name set): summon a token with stats = the spell's Cost.
					// Summoning Stone / Atiesh / Jailhouse Manastorm (no e.name): summon a RANDOM minion of that Cost.
					// (These were two duplicate switch cases — the token variant shadowed the random one.)
					const sp = ctx.spell || ctx.played;
					if (sp && e.name) { const n = sp.cost || 0; summon(state, pi, { id: 'token_' + e.name.toLowerCase(), name: e.name, type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, description: `A ${n}/${n} token.` }); }
					else if (sp) execEffects(state, pi, [{ type: 'summon-random', cost: sp.cost || 0 }], null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-drawn-if-tribe', (state, pi, e, ctx, triggering) => {
	do { {
					// Untamed Beastmaster: you drew a creature of a tribe -> buff it in hand
					const c = ctx.card;
					if (c && c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe))) {
						c.attack += e.attack || 0; c.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('draw-on-big-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Soup Vendor: restore N+ to your hero -> draw a card
					if (ctx.healedHero === pi && (ctx.amount || 0) >= (e.min || 3)) drawCards(state, pi, e.value || 1);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('hatch-self-into', (state, pi, e, ctx, triggering) => {
	do { {
					// Nithogg's Egg: at your turn start, become a fixed-stat token
					const self = ctx.self;
					if (self && self.zone === 'board' && !isDead(self)) {
						const tok = instantiate({ id: 'token_' + (e.name || 'drake').toLowerCase(), name: e.name || 'Drake', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 4, health: e.health || 4, keywords: e.keywords || [], description: `A ${e.attack || 4}/${e.health || 4} token.` }, self.controller);
						tok.zone = 'board'; tok.sick = false;
						const board = state.players[self.controller].board;
						board[board.indexOf(self)] = tok; self.zone = 'gone';
						emit(state, { type: 'transformed', uid: self.uid, player: self.controller, from: self.name, card: tok });
						recomputeAuras(state);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('transform-drawn-legendary', (state, pi, e, ctx, triggering) => {
	do { {
					// Transmogrifier: replace a drawn card with a random Legendary creature
					const c = ctx.card;
					if (c) {
						const legs = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
						if (legs.length) { const pick = legs[Math.floor(state.rng() * legs.length)]; const p2 = state.players[pi]; const idx = p2.hand.indexOf(c); if (idx >= 0) { const nc = instantiate(pick, pi); nc.zone = 'hand'; p2.hand[idx] = nc; emit(state, { type: 'conjure', player: pi, card: nc, color: null }); } }
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-drawn-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Archmage Arugal: you drew a creature -> add a copy to your hand
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id] && state.players[pi].hand.length < MAX_HAND) {
						const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp);
						emit(state, { type: 'conjure', player: pi, card: cp, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-drawn-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Dollmaster Dorian: you drew a creature -> summon a 1/1 copy of it
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id]) {
						const cp = instantiate(state.cardsById[c.id], pi);
						cp.attack = e.attack ?? 1; cp.maxHealth = e.health ?? 1;
						cp.zone = 'board'; cp.sick = true; state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('become-copy-of-played', (state, pi, e, ctx, triggering) => {
	do { {
					// Harbinger Celestia: transform into a full copy of the creature an opponent just played
					const m = ctx.minion;
					if (m && ctx.self && ctx.self.zone === 'board' && !isDead(ctx.self) && state.cardsById[m.id]) {
						const owner = ctx.self.controller;
						const tok = instantiate(state.cardsById[m.id], owner);
						tok.zone = 'board'; tok.sick = ctx.self.sick;
						const board = state.players[owner].board;
						board[board.indexOf(ctx.self)] = tok; ctx.self.zone = 'gone';
						emit(state, { type: 'transformed', uid: ctx.self.uid, player: owner, from: ctx.self.name, card: tok });
						recomputeAuras(state);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('doom-played-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
					// Reckless Experimenter: a Deathrattle creature you played dies at end of turn
					const m = ctx.minion;
					if (m && m !== ctx.self && (m.keywords || []).includes('deathrattle')) m.doomTurn = state.turnNumber;
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-enemy-minion-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Holomancer: summon a stat-fixed copy of the creature an opponent just played
					const m = ctx.minion;
					if (m && state.cardsById[m.id]) {
						const cp = instantiate(state.cardsById[m.id], pi);
						cp.attack = e.attack ?? 1; cp.maxHealth = e.health ?? 1;
						cp.zone = 'board'; cp.sick = true; state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-copy-of-played', (state, pi, e, ctx, triggering) => {
	do { {
					// Ixlid, Fungal Lord: summon a copy of the creature you just played.
					// Playmaker (e.health set): the copy arrives with N Health remaining.
					// (Merged: this branch shadowed Playmaker's health-rider duplicate.)
					const m = ctx.minion;
					if (m && m !== ctx.self) {
						const def = state.cardsById[m.id];
						if (def) {
							const c = summon(state, pi, def);
							if (c && e.health != null) {
								c.damage = Math.max(0, (c.maxHealth || 1) - e.health);
								emit(state, { type: 'damage', targetType: 'creature', uid: c.uid, amount: 0, hp: hp(c) });
							}
						}
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
					// Sonya Shadowdancer: add a 1/1 copy of the fallen friendly to your hand
					const m = ctx.dead;
					const pp = state.players[pi];
					if (m && pp.hand.length < MAX_HAND) {
						const def = state.cardsById[m.id] || { id: m.id, name: m.name, type: 'creature', rarity: m.rarity, description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...(m.keywords || [])], tribe: m.tribe };
						const card = instantiate(def, pi);
						card.zone = 'hand'; card.attack = e.attack ?? 1; card.maxHealth = e.health ?? 1; card.cost = e.cost ?? 1;
						pp.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-frozen-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Moorabi: whenever ANOTHER creature is Frozen, add a copy of it to your hand
					const fz = ctx.frozen;
					if (fz && fz !== ctx.self) {
						const fdef = state.cardsById[fz.id];
						if (fdef && state.players[pi].hand.length < MAX_HAND) {
							const cp = instantiate(fdef, pi);
							cp.zone = 'hand';
							state.players[pi].hand.push(cp);
							emit(state, { type: 'conjure', player: pi, card: cp, color: null });
						}
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-random-enemy-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Blackguard: when YOUR hero is healed, deal that much to a random enemy minion
					if (ctx.healedHero === pi && (ctx.amount || 0) > 0) {
						const bpool = opponentsOf(state, pi).flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
						if (bpool.length) damageCreature(state, bpool[Math.floor(state.rng() * bpool.length)], ctx.amount, null);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('reflect-damage', (state, pi, e, ctx, triggering) => {
	do { {
				// hit whoever dealt the damage; fall back to a random enemy
				const opps = opponentsOf(state, pi);
				const src = ctx.src != null && ctx.src !== pi && !state.players[ctx.src]?.eliminated ? ctx.src : null;
				const t = src ?? (opps.length ? opps[Math.floor(state.rng() * opps.length)] : null);
				if (t != null) damageHero(state, t, ctx.amount || 0, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('destroy-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-minion', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) damageCreature(state, m, e.value, null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('freeze-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) freezeCreature(state, m);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

// TWIN KEPT (PR 39): subject differs: trigger = the triggering minion; effects = chosen target / all-* — both needed
registerTrigger('set-attack', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) { m.attack = e.value; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-minion', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('revive-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Redemption: the fallen friendly minion returns at 1 health
				const m = ctx.minion;
				if (m) {
					const def = state.cardsById[m.id];
					const back = summon(state, pi, def || {
						id: m.id, name: m.name, type: 'creature', cost: 0,
						rarity: m.rarity || 'common', description: m.description || '',
						attack: m.attack, health: m.maxHealth,
					});
					if (back) back.damage = Math.max(0, back.maxHealth - (e.health || 1));
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('spellbender-redirect', (state, pi, e, ctx, triggering) => {
	do { {
				// summon a decoy and make it the spell's new target
				if (ctx.target?.type === 'creature') {
					const tok = summon(state, pi, {
						id: 'token_spellbender', name: 'Spellbender', type: 'creature',
						cost: 0, rarity: 'common', description: 'A conjured decoy.',
						attack: e.attack || 1, health: e.health || 3,
					});
					if (tok) {
						ctx.target.uid = tok.uid;
						ctx.target.player = pi;
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('lose-durability', (state, pi, e, ctx, triggering) => {
	do { {
				// Sword of Justice pays for its blessing
				const m = ctx.self;
				if (m && m.type === 'weapon' && state.players[pi].weapon === m) {
					degradeWeapon(state, pi);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('cho-copy', (state, pi, e, ctx, triggering) => {
	do { {
				// Lorewalker Cho: the cast spell is copied to "the other player" —
				// the owner if someone else cast it, else a random opponent
				const def = state.cardsById[ctx.spell?.id];
				if (def) {
					let to = pi;
					if (ctx.caster === pi) {
						const opps = opponentsOf(state, pi);
						to = opps.length ? opps[Math.floor(state.rng() * opps.length)] : -1;
					}
					const rp = to >= 0 ? state.players[to] : null;
					if (rp) {
						const copy = instantiate(def, to);
						copy.zone = 'hand';
						rp.hand.push(copy);
						emit(state, { type: 'conjure', player: to, card: copy, color: null });
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

// TWIN KEPT (PR 39): different cards: trigger = Alarm-o-Bot (self swaps, same instance back); effects = Vol'jin (chosen target, fresh copy)
registerTrigger('swap-with-hand', (state, pi, e, ctx, triggering) => {
	do { {
				// Alarm-o-Bot trades places with a random creature in hand
				const bot = ctx.self;
				const p2 = state.players[pi];
				const picks = p2.hand.filter(c => c.type === 'creature');
				const bidx = p2.board.indexOf(bot);
				if (bot && bidx >= 0 && picks.length) {
					const pick = picks[Math.floor(state.rng() * picks.length)];
					p2.hand = p2.hand.filter(c => c !== pick);
					pick.zone = 'board';
					pick.sick = true;
					p2.board[bidx] = pick;
					bot.zone = 'hand';
					bot.damage = 0;
					p2.hand.push(bot);
					emit(state, { type: 'summon', player: pi, card: pick });
					recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// bless the triggering minion (Warsong Commander's Charge)
				const m = triggering();
				if (m && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
					if (e.keyword === KW.STEALTH) m.stealthed = true;
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

// TWIN KEPT (PR 39): divergent details kept: trigger includes self unless excludeSelf + sets stealthed; effects always excludes source + count support
registerTrigger('buff-random-friendly', (state, pi, e, ctx, triggering) => {
	do { {
				const pool = state.players[pi].board.filter(c => !isDead(c)
					&& (!e.excludeSelf || c !== ctx.self)
						&& (!e.requireDamaged || c.damage > 0) // Stonecarver: only a damaged minion
					&& (!e.tribe || (c.tribe || '').includes(e.tribe)));
				if (pool.length) {
					const m = pool[Math.floor(state.rng() * pool.length)];
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; if (e.grant === KW.STEALTH) m.stealthed = true; } // Mekkatorque's Aura
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('counter-self', (state, pi, e, ctx, triggering) => {
	do { {
				// Champion of the Parish: bank a +1/+1 counter on the firing creature
				const m = ctx.self;
				if (m && !isDead(m)) {
					const n = e.value || 1;
					m.counters += n;
					m.attack += n;
					m.maxHealth += n;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grant-self', (state, pi, e, ctx, triggering) => {
	do { {
				// One-eyed Cheat: the firing permanent gains a keyword
				const m = ctx.self;
				if (m && !isDead(m) && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.STEALTH) m.stealthed = true;
					if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; // Ogre-Gang Ace
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

// TWIN KEPT (PR 39): trigger = plain += (no buffCreature riders); effects = buffCreature (doubleBuffs/statGainBonus) + per-scaling — riders differ by design
registerTrigger('buff-self', (state, pi, e, ctx, triggering) => {
	do { {
				const m = ctx.self;
				if (m && !isDead(m)) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('reduce-drawn-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Shadowfiend: the just-drawn card costs (N) less
				if (ctx.card) ctx.card.cost = Math.max(0, (ctx.card.cost || 0) - (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('mirror-damage-to-own-hero', (state, pi, e, ctx, triggering) => {
	do { {
				// Wrathguard: when this takes damage, deal that much to your own hero
				if (ctx.amount > 0) damageHero(state, pi, ctx.amount, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('maybe-draw-drawer', (state, pi, e, ctx, triggering) => {
	do { {
				// Nat, the Darkfisher: at the opponent's turn start, they may draw
				if (state.rng() < (e.chance || 0.5)) drawCards(state, ctx.drawer ?? state.current, 1);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gain-armor-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Alley Armorsmith: gain Armor equal to the damage just dealt
				if (ctx.amount > 0) gainArmor(state, pi, ctx.amount);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gain-armor-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
					// Arcane Artificer: gain Armor equal to the cast spell's Cost
					const sp = ctx.spell || ctx.played;
					if (sp) gainArmor(state, pi, sp.cost || 0);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('trigger-summoned-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Spiritsinger Umbra: fire the just-summoned creature's Deathrattle now
				const m = ctx.minion;
				if (m && m !== ctx.self && m.deathrattle) runDeathrattle(state, m.controller, m);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('remember-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Primalfin Champion: record spells cast on this creature
				if (ctx.self && ctx.spell) { (ctx.self.rememberedSpells = ctx.self.rememberedSpells || []).push(ctx.spell.id); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('copy-enemy-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Trade Prince Gallywix: copy the cast spell, give its caster a Coin
				const spell = ctx.spell;
				const pp = state.players[pi];
				if (spell && state.cardsById[spell.id] && pp.hand.length < MAX_HAND) {
					const c = instantiate(state.cardsById[spell.id], pi); c.zone = 'hand';
					pp.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
				if (ctx.caster != null) addCoin(state, ctx.caster);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('destroy-damaged', (state, pi, e, ctx, triggering) => {
	do { {
				// Acidmaw: destroy the creature that was just damaged
				const t = ctx.damaged;
				if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-self-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Tunnel Trogg: +1 Attack per locked crystal (the Overload amount)
				const m = ctx.self;
				if (m && !isDead(m) && ctx.amount > 0) {
					m.attack += (e.attack || 1) * ctx.amount;
					m.maxHealth += (e.health || 0) * ctx.amount;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('copy-drawn', (state, pi, e, ctx, triggering) => {
	do { {
				// Chromaggus: put another copy of the just-drawn card into your hand
				const drawn = ctx.card;
				const p = state.players[pi];
				const def = drawn && state.cardsById[drawn.id];
				if (def && p.hand.length < MAX_HAND) {
					const copy = instantiate(def, pi);
					copy.zone = 'hand';
					p.hand.push(copy);
					emit(state, { type: 'conjure', player: pi, card: copy, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

// TWIN KEPT (PR 39): subject differs: trigger = the triggering minion; effects = chosen target / all-* — both needed
registerTrigger('set-health', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) { m.maxHealth = e.value; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('copy-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// of:'target' copies the attacked creature (Pack Tactics);
				// attack/health override forces token stats
				const m = e.of === 'target' && ctx.target?.type === 'creature'
					? findCreature(state, ctx.target.uid) : triggering();
				if (m) {
					const def = state.cardsById[m.id] || {
						id: m.id, name: m.name, type: 'creature', cost: m.cost, rarity: m.rarity,
						description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...m.keywords],
					};
					const c = summon(state, pi, def);
					if (c && e.attack != null) {
						c.attack = e.attack + c.auraAttack;
						c.maxHealth = e.health + c.auraHealth;
						c.damage = 0;
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('bounce-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) {
					const owner = state.players[m.controller];
					owner.board = owner.board.filter(c => c !== m);
					const def = state.cardsById[m.id];
					if (def) {
						const nc = instantiate(def, m.controller);
						nc.cost += e.costMod || 0;
						nc.zone = 'hand';
						owner.hand.push(nc);
					}
					emit(state, { type: 'bounce', player: m.controller, name: m.name });
					ctx.cancelled = true;
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-redirect', (state, pi, e, ctx, triggering) => {
	do { {
				const t = summon(state, pi, {
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: 0, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, keywords: e.keywords || [],
				});
				if (t) ctx.target = { type: 'creature', uid: t.uid, player: pi };
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('redirect-random', (state, pi, e, ctx, triggering) => {
	do { {
				const pool = [];
				for (let side = 0; side < state.players.length; side++) {
					if (state.players[side].eliminated) continue;
					for (const c of state.players[side].board) {
						if (c === ctx.attacker || isDead(c)) continue;
						if (ctx.target?.type === 'creature' && ctx.target.uid === c.uid) continue;
						pool.push({ type: 'creature', uid: c.uid, player: side });
					}
					const isOriginalTarget = ctx.target?.type === 'hero' && ctx.target.player === side;
					const isAttackingHero = ctx.attackerType === 'hero' && ctx.attackerPlayer === side;
					if (!isOriginalTarget && !isAttackingHero) pool.push({ type: 'hero', player: side });
				}
				if (pool.length) ctx.target = pool[Math.floor(state.rng() * pool.length)];
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gain-dead-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Glugg: gain the ORIGINAL (printed) stats of the friendly creature that died
				const dead = ctx.dead, def = dead && state.cardsById[dead.id], self = ctx.self;
				if (self && def && !isDead(self)) {
					self.attack += def.attack || 0;
					self.maxHealth += def.health || 0;
					emit(state, { type: 'buff', uid: self.uid, attack: self.attack, hp: hp(self) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('destroy-triggering', (state, pi, e, ctx, triggering) => {
	do { {
				// Frost Queen Sindragosa: destroy the enemy creature that was just Frozen
				const t = ctx.frozen || ctx.minion;
				if (t && !isDead(t) && t.controller !== pi) {
					t.damage = t.maxHealth; t.shield = false;
					emit(state, { type: 'destroy', uid: t.uid });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('opponent-may-pay', (state, pi, e, ctx, triggering) => {
	do { {
				// Rhystic Study / Smothering Tithe: the opponent tied to this trigger
				// (the caster / the drawer) may pay `amount`; if they don't, the
				// enchantment's controller (pi) gets `else`. `pi` and benefit are captured now.
				const opp = ctx.caster != null ? ctx.caster : (ctx.drawer != null ? ctx.drawer : null);
				if (opp != null && opp !== pi && !state.players[opp].eliminated) {
					const benefit = e.else || [];
					if (availableMana(state.players[opp]) >= e.amount) {
						state.askQueue.push({ player: opp,
							prompt: e.prompt || `Pay ${e.amount}?`, yes: `Pay ${e.amount}`, no: e.no || 'Decline',
							payOr: { amount: e.amount, benefitPi: pi, benefit } });
						emit(state, { type: 'askStart', player: opp, prompt: e.prompt || `Pay ${e.amount}?` });
					} else {
						execEffects(state, pi, benefit, null, ctx.self || null); // can't pay: controller gets it now
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('mirror-to-hero', (state, pi, e, ctx, triggering) => {
	do {
				// Soulbound Ashtongue: also deal the damage taken to your hero
				if (ctx.amount) damageHero(state, pi, ctx.amount, pi);
				break;
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('conjure-same-cost-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Cheesemonger: when the opponent casts a spell, add a random spell of the same Cost
				const sp = ctx.spell; const p = state.players[pi];
				if (sp && p.hand.length < MAX_HAND) {
					const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && (d.cost || 0) === (sp.cost || 0));
					if (pool.length) { const nc = instantiate(pool[Math.floor(state.rng() * pool.length)], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-mini-copy-of-drawn', (state, pi, e, ctx, triggering) => {
	do { {
				// Puppetmaster Dorian: after you draw a minion, add a 1/1 copy of it that costs (1)
				const d = ctx.card; const pp = state.players[pi];
				if (d && (state.cardsById[d.id]?.type === 'creature') && pp.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[d.id], pi); nc.zone = 'hand'; nc.attack = e.attack ?? 1; nc.maxHealth = e.health ?? 1; nc.cost = e.cost ?? 1; pp.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-copy-attack-die', (state, pi, e, ctx, triggering) => {
	do { {
				// Shoplifter Goldbeard: summon a copy of the just-summoned minion; it attacks a random enemy, then dies.
				// Re-entrancy latch: summon() fires 'summoned' INTERNALLY, so the copy
				// used to re-trigger this handler before `_shoplifterCopy` could be set —
				// infinite recursion (fuzz seed 9419695). The latch closes the window.
				const m = ctx.minion; const def = m && state.cardsById[m.id];
				if (def && m !== ctx.self && !m._shoplifterCopy && !ctx.self._shoplifting) {
					ctx.self._shoplifting = true;
					const copy = summon(state, pi, def);
					ctx.self._shoplifting = false;
					if (copy) {
						copy._shoplifterCopy = true; // don't let the copy re-trigger Goldbeard
						copy.sick = false;
						const foes = [];
						for (const o of opponentsOf(state, pi)) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); }
						if (foes.length && !isDead(copy)) resolveCombat(state, pi, copy.uid, foes[Math.floor(state.rng() * foes.length)]);
						if (!isDead(copy)) { copy.damage = copy.maxHealth; copy.shield = false; emit(state, { type: 'destroy', uid: copy.uid }); sweepDeaths(state); }
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-copy-of-played-minion-free', (state, pi, e, ctx, triggering) => {
	do { {
				// Sonya Waterdancer: after you play a low-Cost minion, add a (0)-cost copy to hand
				const m = ctx.minion; const pp = state.players[pi];
				if (m && m !== ctx.self && m.type === 'creature' && (m.cost || 0) <= (e.maxCost ?? 1) && state.cardsById[m.id] && pp.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[m.id], pi); nc.zone = 'hand'; nc.cost = 0; pp.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-copy-of-played-free', (state, pi, e, ctx, triggering) => {
	do { {
				// Tamsin Roame: when you cast a qualifying spell, add a (0)-cost copy to hand
				const sp = ctx.played; const p = state.players[pi];
				if (sp && (sp.cost || 0) >= (e.minCost || 0) && state.cardsById[sp.id] && p.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[sp.id], pi); nc.zone = 'hand'; nc.cost = 0; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-dead-copy-no-keyword', (state, pi, e, ctx, triggering) => {
	do { {
				// Plaguemaw the Rotting: resummon the fallen minion without a keyword
				const dead = ctx.dead; const base = dead && state.cardsById[dead.id];
				if (base) { const def = JSON.parse(JSON.stringify(base)); def.keywords = (def.keywords || []).filter(k => k !== e.keyword); const c = summon(state, pi, def); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('attack-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Gankster: attack the minion the opponent just played
				const m = ctx.minion;
				if (m && !isDead(m) && ctx.self && !isDead(ctx.self)) resolveCombat(state, ctx.self.controller, ctx.self.uid, { type: 'creature', uid: m.uid, player: m.controller });
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-hero-by-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Raj Naz'jan: deal damage to the enemy hero equal to the cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				if (cost > 0) for (const o of opponentsOf(state, pi)) damageHero(state, o, cost, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-self-if-unspent-mana', (state, pi, e, ctx, triggering) => {
	do { {
				// Spirit of the Tides: buff at end of turn if you have unspent Mana
				if (availableMana(state.players[pi]) > 0 && ctx.self && !isDead(ctx.self)) { ctx.self.attack += e.attack || 0; ctx.self.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('destroy-self-if-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Bubbler: pop when it takes exactly `amount` damage
				if (ctx.amount === (e.amount ?? 1) && ctx.self && !isDead(ctx.self)) { ctx.self.damage = ctx.self.maxHealth; ctx.self.shield = false; emit(state, { type: 'destroy', uid: ctx.self.uid }); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('recast-played-on-random-friendly', (state, pi, e, ctx, triggering) => {
	do { {
				// Kotori Lightblade: recast the spell just cast on this, on another friendly minion
				const sp = ctx.played; const def = sp && state.cardsById[sp.id];
				if (def && def.effects) {
					const pool = state.players[pi].board.filter(c => c !== ctx.self && !isDead(c) && c.type !== 'location');
					if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: t.uid, player: pi }, ctx.self); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-frozen', (state, pi, e, ctx, triggering) => {
	do { {
				// Cheaty Snobold: deal damage to the minion that was just Frozen
				const f = ctx.frozen;
				if (f && !isDead(f)) { damageCreature(state, f, e.value || 3, ctx.self || null); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-healed-creature', (state, pi, e, ctx, triggering) => {
	do { {
				// Luminous Geode: give the just-healed minion +Attack
				const hc = ctx.healedCreature;
				if (hc && !isDead(hc)) { hc.attack += e.attack || 0; hc.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: hc.uid, attack: hc.attack, hp: hp(hc) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('become-2-2-copy-rush', (state, pi, e, ctx, triggering) => {
	do { {
				// Forsaken Lieutenant: become a 2/2 copy of the played Deathrattle minion, with Rush
				const m2 = ctx.minion; const self = ctx.self; const base2 = m2 && state.cardsById[m2.id];
				if (base2 && self && self.zone === 'board' && !isDead(self)) {
					const def = JSON.parse(JSON.stringify(base2)); def.attack = 2; def.health = 2; def.token = true; def.id = 'token_' + base2.id; def.keywords = [...new Set([...(def.keywords || []), 'rush'])];
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = self.sick;
					const board = state.players[pi].board; board[board.indexOf(self)] = tok; self.zone = 'gone';
					emit(state, { type: 'transformed', uid: self.uid, player: pi, from: self.name, card: tok }); recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('bump-drawn-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Far Watch Post: after the opponent draws, that card costs more (capped)
				const drawn = ctx.card;
				if (drawn) drawn.cost = Math.min(e.cap || 10, (drawn.cost || 0) + (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-copy-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Keymaster Alabaster: when the opponent draws, copy that card to your hand at a set Cost
				const drawn = ctx.card;
				const p = state.players[pi];
				if (drawn && state.cardsById[drawn.id] && p.hand.length < MAX_HAND) {
					const copy = instantiate(state.cardsById[drawn.id], pi);
					copy.zone = 'hand'; copy.cost = e.value != null ? e.value : (copy.cost || 0);
					p.hand.push(copy);
					emit(state, { type: 'conjure', player: pi, card: copy, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('set-victim-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Turalyon, the Tenured: set the attacked minion's Attack and Health to N
				const v = ctx.victim;
				if (v && !isDead(v)) { v.attack = e.value || 3; v.maxHealth = e.value || 3; v.damage = 0; v.tempHealth = 0; emit(state, { type: 'buff', uid: v.uid, attack: v.attack, hp: hp(v) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-self-by-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Speaker Gidra (Spellburst): gain Attack and Health equal to the spell's Cost; Animated Moonwell: Attack only
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				if (ctx.self && !isDead(ctx.self) && cost > 0) execEffects(state, pi, [{ type: 'buff-self', attack: cost, health: e.attackOnly ? 0 : cost }], null, ctx.self);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('damage-triggering-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// deal N damage to the minion that was just summoned/played;
				// `corpses`: only by spending that many Corpses (Corpse Flower)
				const m = ctx.minion;
				if (e.corpses) {
					const p2 = state.players[pi];
					if ((p2.corpses || 0) < e.corpses) break;
					if (m && !isDead(m) && m.type !== 'location') { p2.corpses -= e.corpses; emit(state, { type: 'corpses', player: pi, corpses: p2.corpses }); }
					else break;
				}
				if (m && !isDead(m) && m.type !== 'location') damageCreature(state, m, e.value || 3, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('lurker-damage', (state, pi, e, ctx, triggering) => {
	do { {
				// Lurker: 1 damage to a random enemy after a friendly attack (2 if the attacker is a Zerg)
				const v = (ctx.minion && (ctx.minion.tribe || '').includes('Zerg')) ? 2 : 1;
				execEffects(state, pi, [{ type: 'random-damage', value: v, count: 1, pool: 'enemies' }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('set-self-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// Murozond, Unbounded: Attack becomes INFINITY (well, 9999)
				if (ctx.self && !isDead(ctx.self)) { ctx.self.attack = e.value || 9999; emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grow-counter', (state, pi, e, ctx, triggering) => {
	do { {
				// Omen: remember how often this has attacked
				if (ctx.self) ctx.self[e.key || '_grew'] = (ctx.self[e.key || '_grew'] || 0) + 1;
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('silence-destroy-triggering', (state, pi, e, ctx, triggering) => {
	do { {
				// Bayfin Bodybuilder: silence and destroy the minion that just appeared
				const m = ctx.minion;
				if (m && !isDead(m) && m.type === 'creature') {
					silenceCreature(state, m);
					m.damage = m.maxHealth; m.shield = false;
					emit(state, { type: 'destroy', uid: m.uid });
					sweepDeaths(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gorm-consume', (state, pi, e, ctx, triggering) => {
	do { {
				// Gorm the Worldeater: eat the minion to your right, wake 2 turns sooner
				const p2 = state.players[pi];
				const self = ctx.self;
				if (!self || self.dormantLeft <= 0) break;
				const i = p2.board.indexOf(self);
				const r = i >= 0 ? p2.board[i + 1] : null;
				if (r && !isDead(r) && r.type === 'creature') {
					r.damage = r.maxHealth; r.shield = false;
					emit(state, { type: 'destroy', uid: r.uid });
					sweepDeaths(state);
					self.dormantLeft = Math.max(0, self.dormantLeft - 2);
					emit(state, { type: 'dormant', player: pi, uid: self.uid, turns: self.dormantLeft });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('become-location', (state, pi, e, ctx, triggering) => {
	do { {
				// Sanc'Azel: after attacking, flip into a location
				const self2 = ctx.self;
				const p2 = state.players[pi];
				const def2 = state.cardsById[e.id];
				if (self2 && def2 && p2.board.includes(self2) && !isDead(self2)) {
					const loc = instantiate(def2, pi);
					loc.zone = 'board';
					p2.board[p2.board.indexOf(self2)] = loc;
					self2.zone = 'gone';
					emit(state, { type: 'transformed', uid: self2.uid, player: pi, from: self2.name, card: loc });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('magma-splash', (state, pi, e, ctx, triggering) => {
	do { {
				// Magma Hound: only after this survives attacking a MINION
				if (ctx.targetType === 'creature' && ctx.self && !isDead(ctx.self)) {
					execEffects(state, pi, [{ type: 'random-damage', value: 1, count: ctx.self.attack || 0, pool: 'enemies' }], null, ctx.self);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('grove-treant', (state, pi, e, ctx, triggering) => {
	do { {
				// Grove Shaper: a 2/2 Treant carrying "Deathrattle: copy that spell"
				const sp = ctx.played || ctx.spell;
				const tr = summon(state, pi, { id: 'token_grove_treant', name: 'Treant', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', token: true, keywords: ['deathrattle'], description: 'Deathrattle: Add a copy of the spell to your hand.' });
				if (tr && sp && state.cardsById[sp.id]) tr.deathrattle = [{ type: 'conjure-id', id: sp.id }];
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('attack-healed-enemy', (state, pi, e, ctx, triggering) => {
	do { {
				// Wilted Shadow: whenever you heal an enemy, this attacks it
				const hcx = ctx.healedCreature;
				if (hcx && hcx.controller !== pi && ctx.self && !isDead(ctx.self) && !isDead(hcx)) {
					damageCreature(state, hcx, ctx.self.attack, ctx.self);
					damageCreature(state, ctx.self, hcx.attack, hcx);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('ido-blessing', (state, pi, e, ctx, triggering) => {
	do { {
				// Ido of the Threshfleet: keep a Blessing in your hand while alive
				const p2 = state.players[pi];
				if (ctx.self && !isDead(ctx.self) && !p2.hand.some(c => c.id === 'threshfleet_blessing') && p2.hand.length < MAX_HAND && state.cardsById['threshfleet_blessing']) {
					const bc = instantiate(state.cardsById['threshfleet_blessing'], pi);
					bc.zone = 'hand'; p2.hand.push(bc);
					emit(state, { type: 'conjure', player: pi, card: bc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('corpse-reborn', (state, pi, e, ctx, triggering) => {
	do { {
				// Hollow Direhorn: spend Corpses to regain Reborn after a friendly death
				const p2 = state.players[pi];
				const self = ctx.self;
				if (self && !isDead(self) && !has(self, KW.REBORN) && (p2.corpses || 0) >= (e.corpses || 3)) {
					p2.corpses -= e.corpses || 3;
					emit(state, { type: 'corpses', player: pi, corpses: p2.corpses });
					self.keywords.push(KW.REBORN);
					emit(state, { type: 'buff', uid: self.uid, attack: self.attack, hp: hp(self) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('cleave-enemies-by-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// The Great Dracorex: after it attacks an enemy minion, damage ALL other enemy minions by its Attack
				const self = ctx.self, victim = ctx.victim;
				if (self && !isDead(self)) { const amt = self.attack || 0; if (amt > 0) { for (const o of opponentsOf(state, pi)) for (const c of [...state.players[o].board]) if (!isDead(c) && c !== victim && c.type !== 'location') damageCreature(state, c, amt, self); sweepDeaths(state); } }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('double-triggering-minion-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Niri of the Crater: when you play a 1-Cost minion, double its stats
				const m = ctx.minion;
				if (m && !isDead(m) && m.type !== 'location') { m.attack = (m.attack || 0) * 2; m.maxHealth = (m.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('attack-hero-target', (state, pi, e, ctx, triggering) => {
	do { {
				// Illidari Inquisitor: after your hero attacks an enemy minion, this attacks it too
				const t = ctx.target, s6 = ctx.self;
				if (t && s6 && !isDead(t) && !isDead(s6) && s6.zone === 'board') { s6.sick = false; resolveCombat(state, s6.controller, s6.uid, { type: 'creature', uid: t.uid, player: t.controller }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gain-summoned-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Tras'tath, Soul Parasite: after you summon a Demon, gain its stats
				const m = ctx.minion, s5 = ctx.self;
				if (m && s5 && m !== s5 && !isDead(s5) && (!e.tribe || (m.tribe || '').includes(e.tribe))) { s5.attack += m.attack || 0; s5.maxHealth += hp(m) || 0; emit(state, { type: 'buff', uid: s5.uid, attack: s5.attack, hp: hp(s5) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-damaged-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Rioter: after a friendly minion survives damage, give it +N Attack
				const m = ctx.damaged;
				if (m && !isDead(m) && m !== ctx.self && m.type !== 'location') { m.attack += e.attack || 1; m.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('bonus-effect-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Dreambound Raptor: after you play a minion, give it a random Bonus Effect
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') { applyGift(state, m, null, { board: true }); emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('dormant-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Warden Maiev: the just-played minion goes Dormant for N turns
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') { m.dormantLeft = e.value || 1; emit(state, { type: 'dormant', player: m.controller, uid: m.uid, turns: m.dormantLeft }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-discarded-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Maloriak: after you discard a minion, summon a copy of it
				const c = ctx.card;
				if (c && c.type === 'creature' && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('cast-random-spell-of-played-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Chaos Supplicant: after you cast a spell, cast a random spell of the same Cost (another-class restriction not modeled)
				const spell = ctx.played;
				if (spell && !state._chaosLock) { state._chaosLock = true; try { execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost: spell.cost || 0 }], null, ctx.self || null); } finally { state._chaosLock = false; } }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('reduce-discovered-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Vault Breaker: after you Discover a card, reduce its Cost
				const c = ctx.card;
				if (c) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('set-attacker-health-from-source', (state, pi, e, ctx, triggering) => {
	do { {
				// Archaios: when another friendly minion attacks, set its Health equal to this minion's Health
				const m = ctx.minion, s4 = ctx.self;
				if (m && s4 && !isDead(m) && !isDead(s4) && m !== s4 && m.type !== 'location') { m.maxHealth = hp(s4); m.damage = 0; m.tempHealth = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('buff-self-by-dead-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// Scavenging Flytrap: after a minion dies, gain its Attack
				const d3 = ctx.dead, s3 = ctx.self;
				if (d3 && s3 && !isDead(s3) && (d3.attack || 0) > 0) { s3.attack += d3.attack; emit(state, { type: 'buff', uid: s3.uid, attack: s3.attack, hp: hp(s3) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('gandling', (state, pi, e, ctx, triggering) => {
	do { {
				// Disciplinarian Gandling: destroy the just-played minion, summon a 4/4 Failed Student
				const m = ctx.minion;
				if (m && !isDead(m) && m !== ctx.self) {
					m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); sweepDeaths(state);
					summon(state, pi, { id: 'sch_failed_student', name: 'Failed Student', type: 'creature', cost: 4, token: true, rarity: 'common', attack: 4, health: 4, description: 'A 4/4 token.' });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('cast-random-same-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Enchanted Cauldron (Spellburst): cast a random spell of the just-cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('silence-victim', (state, pi, e, ctx, triggering) => {
	do { {
				// Magehunter: Silence the minion this just attacked
				if (ctx.victim && !isDead(ctx.victim)) silenceCreature(state, ctx.victim);
				break;
			}
			// ('summon-copy-of-played' is handled earlier in this switch — Playmaker's
			// health rider was merged there after this duplicate was shadowed.)
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('transform-victim-into', (state, pi, e, ctx, triggering) => {
	do { {
				// Infectious Sporeling: turn the minion this just damaged into a copy of `id`
				const v = ctx.victim; const base = state.cardsById[e.id];
				if (v && !isDead(v) && base) {
					const tok = instantiate(JSON.parse(JSON.stringify(base)), v.controller);
					tok.zone = 'board'; tok.sick = v.sick;
					const board = state.players[v.controller].board;
					const bi = board.indexOf(v);
					if (bi >= 0) { board[bi] = tok; v.zone = 'gone'; emit(state, { type: 'transformed', uid: v.uid, player: v.controller, from: v.name, card: tok }); recomputeAuras(state); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('summon-copy-of-triggering-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Auchenai Death-Speaker: after a friendly minion is Reborn, summon a copy of it
				const m = ctx.minion;
				if (m && state.cardsById[m.id]) summon(state, pi, state.cardsById[m.id]);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('add-copy-of-discovered', (state, pi, e, ctx, triggering) => {
	do { {
				// Rangari Scout: after you Discover a card, get a copy of it
				const src = ctx.card, p = state.players[pi];
				if (src && state.cardsById[src.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[src.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('conjure-minion-of-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Deep Space Curator (Spellburst): get a random minion of the cast spell's Cost, set its Cost to (0)
				const spell = ctx.played;
				if (spell) execEffects(state, pi, [{ type: 'conjure-random', cardType: 'creature', cost: spell.cost || 0, setCost: 0 }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('recast-triggering-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Starlight Reactor: after you cast an Arcane spell, recast it (targets chosen randomly)
				const spell = ctx.played;
				if (spell && isSpellType(spell) && spell.effects) {
					const foesM = []; for (const o of opponentsOf(state, pi)) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foesM.push({ type: 'creature', uid: c.uid, player: o });
					let tgt = null; if (foesM.length) tgt = foesM[Math.floor(state.rng() * foesM.length)]; else { const eh = opponentsOf(state, pi)[0]; if (eh != null) tgt = { type: 'hero', player: eh }; }
					execEffects(state, pi, JSON.parse(JSON.stringify(spell.effects)), tgt, ctx.self || null);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});
