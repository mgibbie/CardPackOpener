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
	opponentsOf, freezeCreature, STARTING_LIFE, KW,
	applyGift, schoolOf, recomputeAuras, sweepDeaths, counterStackEntry,
	findCreature, silenceCreature, isSpellType, heroAttackValue, fireOngoing,
	checkGameOver, questTick, disguiseCreature,
} from '../../engine.js';
import { damageCreature, healHero } from '../damage.js';
import { gainArmor } from '../damage.js';
import { drawCards, toGraveyard } from '../zones.js';
import { runDeathrattle } from '../death.js';

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
