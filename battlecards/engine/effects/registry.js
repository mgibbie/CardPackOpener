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
	opponentsOf, freezeCreature, STARTING_LIFE, KW, MAX_BASE_MANA, CTHUN_BASE,
	applyGift, schoolOf, recomputeAuras, sweepDeaths, counterStackEntry,
	findCreature, silenceCreature, isSpellType, heroAttackValue, fireOngoing,
	checkGameOver, questTick, disguiseCreature,
	spendMana, breakWeapon, resolveCombat, addCardToHand, syncCthun, degradeWeapon,
	runBattlecry, kindredActive, firePonder,
	EXCAVATE_TIERS, EXCAVATE_LEGENDARIES, ALL_AZERITE_LEGENDARIES,
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
