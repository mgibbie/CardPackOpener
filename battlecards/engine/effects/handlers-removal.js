// engine/effects/handlers-removal.js — damage, destruction, freezes, silences and other removal (housekeeping split, PR 40).
// Handler bodies are the verbatim registry migrations (PRs 13–39); this file
// only re-homes them. Imported for its registration side effects by index.js.
import { register, registerTrigger, ABORT } from './registry.js';
import { spendCorpses } from '../../engine.js';
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

register('hero-corpse-deathrattle', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].heroDeathrattleCorpses = true; // Husk, Eternal Reaper
});


register('set-next-spell-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSpellDamageBonus = (state.players[pi].nextSpellDamageBonus || 0) + (e.value || 2); // Celestial Emissary
});


register('doom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// dies at the end of this turn (Power Overwhelming)
			const t = chosenCreature();
			if (t) t.doomTurn = state.turnNumber;
});


register('mark-doomed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voodoo Doll: remember a chosen creature; destroy it when this dies
			const t = chosenCreature();
			if (t && source) source.doomedUid = t.uid;
});


register('damage-target-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Aeon Reaver: deal damage to a minion equal to its own Attack
			const t = chosenCreature();
			if (t) damageCreature(state, t, t.attack || 0, source);
});


register('set-next-hero-power-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Daring Fire-Eater: your next Hero Power this turn deals more
			state.players[pi].heroPowerDamageNext = (state.players[pi].heroPowerDamageNext || 0) + (e.value || 2);
});


register('freeze-gain-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sleet Skater: freeze an enemy minion, gain Armor equal to its Attack
			const t = chosenCreature();
			if (t) { freezeCreature(state, t); gainArmor(state, pi, t.attack || 0); }
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


register('trigger-deathrattles', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ragnaros: fire your creatures' Deathrattles without them dying
			for (const c of [...state.players[pi].board]) {
				if (!isDead(c) && c.deathrattle) execEffects(state, pi, c.deathrattle, null, c);
			}
});


register('grant-honorable-kill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wing Commander Mulverick: give your minions an Honorable Kill effect
			for (const c of state.players[pi].board) if (!isDead(c) && c.type !== 'location') c.honorableKill = JSON.parse(JSON.stringify(e.effects));
});


register('counter-stack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cryptic Command's counter mode: counter the topmost spell now on the stack
			const top = [...state.stack].reverse().find(en => en.kind === 'spell' && !en.countered);
			if (top) counterStackEntry(state, top, 'graveyard');
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


register('destroy-marked', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voodoo Doll's Deathrattle
			if (source?.doomedUid != null) { const t = findCreature(state, source.doomedUid); if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); } }
});


register('repeat-last-battlecry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Brilliant Macaw: replay the last Battlecry you played. Re-entry
			// guarded — a second Macaw's "last Battlecry" is another Macaw's
			// repeat, which would recurse without bound (stack overflow).
			if (state._macawLock) return;
			const lb = state.players[pi].lastBattlecryThisGame;
			if (lb && lb.effects) {
				state._macawLock = true;
				try { execEffects(state, pi, JSON.parse(JSON.stringify(lb.effects)), lb.target || null, source); }
				finally { state._macawLock = false; }
			}
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


register('destroy-own-deck-gain-immune', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// The Jailer: destroy your deck; this minion gains Immune
			const p = state.players[pi];
			p.deck = [];
			if (source && !source.keywords.includes(KW.IMMUNE)) source.keywords.push(KW.IMMUNE);
			emit(state, { type: 'shuffle', player: pi });
});


register('silence-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dalaran Librarian: silence the creatures flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb)) silenceCreature(state, nb);
});


register('silence-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Showstopper: Silence every minion on the board (exceptSource -> Smothering Starfish)
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location' && !(e.exceptSource && c === source)) silenceCreature(state, c);
});


register('damage-per-cards-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Spectral Pillager: deal `value` to a chosen creature for each OTHER card played this turn
			const t = chosenCreature();
			const n = state.players[pi].cardsPlayedThisTurn || 0;
			if (t && n > 0) damageCreature(state, t, (e.value || 1) * n, source);
});


register('destroy-and-selfdamage-by-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Riftcleaver: destroy a creature; your hero takes damage equal to its Health
			const t = chosenCreature();
			if (t) { const h = hp(t); t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); damageHero(state, pi, h, pi); }
});


register('copy-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Unearthed Raptor: gain a copy of a chosen friendly minion's Deathrattle
			const c = chosenCreature();
			if (c && c.deathrattle && source) {
				source.deathrattle = [...(source.deathrattle || []),
					...JSON.parse(JSON.stringify(c.deathrattle))];
			}
});


register('freeze-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// freeze a random unfrozen enemy creature
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && !c.frozen) pool.push(c);
			}
			if (pool.length) freezeCreature(state, pool[Math.floor(state.rng() * pool.length)]);
});


register('destroy-friendly-by-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Terrible Chef: destroy a friendly minion of a given id (the Egg it summoned)
			const t = state.players[pi].board.find(c => c.id === e.id && !isDead(c));
			if (t) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
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


register('destroy-self-gain-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gurubashi Offering: at the start of your turn, destroy this and gain Armor
			if (source && source.zone === 'board' && !isDead(source)) { source.damage = source.maxHealth; source.shield = false; emit(state, { type: 'destroy', uid: source.uid }); }
			gainArmor(state, pi, e.value || 8);
});


register('destroy-all-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gigafin: destroy all enemy minions (spit-back simplified away)
			for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			sweepDeaths(state);
});


register('destroy-friendly-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ravenous Kraken: destroy a chosen friendly minion and remember it for a Deathrattle summon
			const t = chosenCreature();
			if (t && t.controller === pi && source) { source.rememberedId = t.id; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
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


register('destroy-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Azari, the Devourer: destroy your opponent's deck (Omen of the End: only the top N)
			for (const o of enemies) { if (e.count != null) { for (let n = 0; n < e.count; n++) { const id = state.players[o].deck.pop(); if (!id) break; } } else state.players[o].deck = []; }
			emit(state, { type: 'deckDestroyed' });
});


register('dormant-damage-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Magtheridon: while Dormant, deal N to all enemies at end of turn
			if (source && source.dormantLeft > 0) { for (const o of enemies) { for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 3, source); damageHero(state, o, e.value || 3, pi); } }
});


register('add-counters', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// +1/+1 counters (a permanent buff that other cards can count)
			const t = e.target === 'self' ? source : chosenCreature();
			if (t && t.zone === 'board' && !isDead(t)) {
				const n = e.value === 'X' ? (source?.xValue || 0) : (e.value || 1);
				buffCreature(t, n, n); // buffCreature banks the counters
			}
});


register('destroy-enemy-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Platebreaker: destroy the opponent's Armor (and deal that much, if asked)
			for (const o of enemies) {
				const amt = state.players[o].armor;
				state.players[o].armor = 0;
				if (amt > 0) { emit(state, { type: 'armor', player: o, amount: -amt, armor: 0 }); if (e.thenDamage) damageHero(state, o, amt, pi); }
			}
});


register('damage-enemies-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blademaster Samuro (Frenzy): deal damage = this minion's Attack to all enemy minions
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
});


register('damage-enemies-by-heal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xyrella: deal damage to all enemy minions equal to Health restored this turn
			const amt = state.players[pi].healedAmountThisTurn || 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
});


register('heal-self-creature', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Regeneratin' Thug: restore Health to this creature at the start of your turn
			if (source && source.zone === 'board' && !isDead(source) && source.damage > 0) {
				source.damage = Math.max(0, source.damage - (e.value || 2));
				emit(state, { type: 'heal', targetType: 'creature', uid: source.uid, amount: e.value || 2, hp: hp(source) });
			}
});


register('destroy-random-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Void Crusher: destroy a random creature on each player's board
			for (const pl of state.players) {
				const pool = pl.board.filter(c => !isDead(c) && c.type !== 'location');
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			}
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


register('devour-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ratcatcher: destroy a chosen friendly creature, gain its Attack and Health
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const _m = e.double ? 2 : 1; const a = t.attack * _m, h2 = hp(t) * _m; // Crusty the Crustacean: gain DOUBLE
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


register('sacrifice-selves-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mogu Cultist: destroy all copies of this creature, summon a token
			const pp = state.players[pi];
			for (const c of [...pp.board]) if (c.id === source.id && !isDead(c)) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			if (e.summonId && state.cardsById[e.summonId]) summon(state, pi, state.cardsById[e.summonId]);
} });


register('copy-last-deathrattle-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Monstrous Parrot: add a copy of the last friendly Deathrattle minion that died
			const p = state.players[pi];
			const id = p.lastDeathrattleDied;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
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


register('buff-spell-damage-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dalaran Aspirant: raise this creature's Spell Damage static
			if (source && !isDead(source)) {
				if (!source.static || source.static.type !== 'spell-damage') source.static = { type: 'spell-damage', value: 0 };
				source.static.value = (source.static.value || 0) + (e.value || 1);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });


register('draw-spell-selfdamage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hullbreaker: draw a spell, your hero takes damage equal to its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && (drawn.cost || 0) > 0) damageHero(state, pi, drawn.cost || 0, pi);
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


register('exile', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// removed from the game: no death, no deathrattle, never reshuffled
			const t = chosenCreature();
			const doExile = c => { const owner = state.players[c.controller]; owner.board = owner.board.filter(x => x !== c); c.zone = 'exile'; owner.exile.push(c); emit(state, { type: 'exiled', uid: c.uid, player: c.controller, name: c.name }); };
			if (t && (e.minAttack == null || t.attack >= e.minAttack)) {
				doExile(t);
				// Aman'Thul (Strike from History): remove a SECOND enemy minion. HS lets
				// you choose both; the engine has no two-target pick, so the second is
				// a random OTHER enemy minion.
				if (e.alsoRandomOther) {
					const pool = enemies.flatMap(o => state.players[o].board.filter(c => c !== t && !isDead(c) && c.type !== 'location'));
					if (pool.length) doExile(pool[Math.floor(state.rng() * pool.length)]);
				}
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


register('repeat-last-cost-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pet Parrot: recast the last card of a given Cost you played
			const last = state.players[pi].lastCardOfCost && state.players[pi].lastCardOfCost[e.cost ?? 1];
			if (last && state.cardsById[last.id]) { const def = state.cardsById[last.id]; if (isSpellType(def)) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), last.target || null, source); else if (def.type === 'creature') summon(state, pi, def); }
} });


register('eat-enemy-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mutanus the Devourer: eat a random minion in the opponent's hand, gain its stats
			const foe = enemies[0];
			if (foe != null && source) {
				const pool = state.players[foe].hand.filter(c => c.type === 'creature');
				if (pool.length) { const m = pool[Math.floor(state.rng() * pool.length)]; state.players[foe].hand = state.players[foe].hand.filter(c => c !== m); buffCreature(source, m.attack || 0, hp(m) || 0); }
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


register('create-kazakus-potion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kazakus: a random custom-style potion into your hand
			const potions = ['kazakus_potion_a', 'kazakus_potion_b', 'kazakus_potion_c'];
			const id = potions[Math.floor(state.rng() * potions.length)];
			const p = state.players[pi];
			if (state.cardsById[id] && p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
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


register('destroy-adjacent-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disguised Executioner: a random minion beside this one dies
			if (source) {
				const b = state.players[source.controller]?.board || [];
				const i = b.indexOf(source);
				const nbs = [b[i - 1], b[i + 1]].filter(n => n && !isDead(n) && n.type === 'creature');
				if (nbs.length) { const t = nbs[Math.floor(state.rng() * nbs.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
			}
} });


register('eat-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Abominable Lieutenant: destroy a random enemy minion, gain its stats
			const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
			if (pool.length && source && !isDead(source)) { const t = pool[Math.floor(state.rng() * pool.length)]; const a = t.attack || 0, h2 = hp(t) || 0; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); buffCreature(source, a, h2); }
} });


register('sacrifice-others-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Teron Gorefiend: destroy all other friendly minions, remembering them
			const others = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (source) source.rememberedMinions = others.map(c => ({ id: c.id, name: c.name, tribe: c.tribe || null, attack: c.attack || 0, health: hp(c) }));
			for (const c of others) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			sweepDeaths(state);
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


register('destroy-enemy-plague-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tomb Traitor: destroy a Plague in the opponent's deck; if you do, deal V to all enemy minions
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; const idx = fp.deck.findIndex(id => (state.cardsById[id]?.name || '').includes('Plague')); if (idx >= 0) { fp.deck.splice(idx, 1); emit(state, { type: 'shuffle', player: foe }); for (const c of [...fp.board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 3, source); } }
} });


register('trigger-one-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// fire a chosen (or random) friendly creature's Deathrattle without it dying (count = times)
			let c = chosenCreature();
			if (e.random) { const pool = state.players[pi].board.filter(x => x !== source && !isDead(x) && x.deathrattle && x.deathrattle.length && (!e.tribe || (x.tribe || '').includes(e.tribe))); c = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; } // Guiding Figure / Boom Wrench (Mech)
			if (c && !isDead(c) && c.deathrattle) for (let n = 0; n < (e.count || 1); n++) execEffects(state, pi, c.deathrattle, null, c);
} });


register('destroy-own-totems-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Totem Cruncher: destroy your Totems, gain +2/+2 for each
			const p = state.players[pi];
			const totems = p.board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes('Totem'));
			for (const t of totems) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			if (totems.length && source && source.zone === 'board' && !isDead(source)) buffCreature(source, (e.attack || 2) * totems.length, (e.health || 2) * totems.length);
} });


register('spend-corpses-damage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Eulogizer: spend N Corpses to deal V damage to a target
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 3)) { spendCorpses(state, pi, (e.cost || 3)); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); const t = chosenCreature(); if (t) damageCreature(state, t, e.value || 3, source); else if (target?.type === 'hero') damageHero(state, target.player, e.value || 3, pi); else { const eh = enemyHero(); if (eh != null) damageHero(state, eh, e.value || 3, pi); } }
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


register('damage-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Explosive Shot / Cone of Cold: chosen creature + its board neighbors
			const t = chosenCreature();
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				const neighbors = [board[idx - 1], board[idx + 1]].filter(Boolean);
				let hurt = damageCreature(state, t, boost(e.value), null) || 0;
				if (e.freeze) freezeCreature(state, t);
				for (const nb of neighbors) {
					hurt += damageCreature(state, nb, boost(e.splash), null) || 0;
					if (e.freeze) freezeCreature(state, nb);
				}
				if (e.lifesteal && hurt > 0) healHero(state, pi, hurt); // Felscream Blast
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


register('damage-enemy-hand-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gunslinger Kurtrus: fire N shots of V damage at random minions in the opponent's hand
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; for (let n = 0; n < (e.count || 6); n++) { const pool = fp.hand.filter(c => c.type === 'creature'); if (!pool.length) break; const c = pool[Math.floor(state.rng() * pool.length)]; c.maxHealth = (c.maxHealth || 1) - (e.value || 2); if ((c.maxHealth || 0) <= 0) { fp.hand = fp.hand.filter(x => x !== c); emit(state, { type: 'discard', player: foe, card: c }); } } }
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


register('destroy-target-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ravenous Devilsaur: destroy a minion; Kindred: gain its stats (requireKindredForStats). Natalie Seline: healthOnly
			const t = chosenCreature();
			if (t) { const a = t.attack || 0, h = hp(t); t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); const gains = !e.requireKindredForStats || kindredActive(state, pi, source); if (source && !isDead(source) && gains) { if (!e.healthOnly) source.attack += a; source.maxHealth += h; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); } if (e.healHeroByStats) healHero(state, pi, h); } // The Primus (Runes of Blood): your hero also gains its Health
} });


register('damage-all-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Risky Skipper: deal `value` to every minion on both sides
			// (exceptSource omits the caster — Shattered Rumbler: "all OTHER minions";
			//  exceptTribe skips a tribe — Fire Breather: "except Demons")
			const dv = e.valueFromHandSize ? state.players[pi].hand.length : (e.value || 1); // Entitled Customer
			for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && !(e.exceptSource && c === source) && !(e.exceptTribe && (c.tribe || '').includes(e.exceptTribe))) damageCreature(state, c, dv, source);
			sweepDeaths(state);
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


register('damage-then', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// deal damage, then branch on whether the creature survived
			let v = e.value;
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0) + (state.players[pi].spellDamageThisTurn || 0) + (source.bonusSpellDamage || 0);
				const sd = state.players[pi].schoolSpellDmg; if (sd) { const sch = schoolOf(source); if (sch && sd[sch]) v += sd[sch]; } // Duels: per-school Spell Damage (Kindling Flame / Bitter Cold / Natural Force)
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


register('silence', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			if (e.target === 'all-others') { for (const pl of state.players) for (const c of [...pl.board]) if (c !== source && !isDead(c) && c.type === 'creature') silenceCreature(state, c); } // Medivh the Hallowed
			else if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) silenceCreature(state, c); }
			else if (e.target === 'friendly-others') { for (const c of [...state.players[pi].board]) if (c !== source && !isDead(c)) silenceCreature(state, c); } // Wailing Soul
			else if (e.target === 'self') { if (source && !isDead(source)) silenceCreature(state, source); } // Overzealous Healer (Spellburst)
			else { const t = chosenCreature(); if (t) silenceCreature(state, t); }
} });


register('copy-deck-deathrattle-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Scourge Illusionist: add a set-stat copy of another Deathrattle minion in your deck to your hand
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.keywords || []).includes('deathrattle') && !d.token && d.id !== (source && source.id));
			if (pool.length && p.hand.length < MAX_HAND) { const def = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(def, pi); cp.zone = 'hand'; if (e.setStats != null) { cp.attack = e.setStats; cp.maxHealth = e.setStats; } if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });


register('corpse-gain-deathrattle', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Boneshredder: spend N Corpses to gain + trigger a random died friendly's Deathrattle
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 5)) {
				const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
				if (pool.length && source) { spendCorpses(state, pi, (e.cost || 5)); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); const pick = pool[Math.floor(state.rng() * pool.length)]; source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(pick.deathrattle))]; if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle'); execEffects(state, pi, JSON.parse(JSON.stringify(pick.deathrattle)), null, source); }
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


register('become-copy-of-random-damaged', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Battleworn Faceless: transform into a full copy of a random damaged minion in play
			const pool = [];
			for (const pl of state.players) for (const c of pl.board) if (c !== source && !isDead(c) && c.type !== 'location' && c.damage > 0) pool.push(c);
			if (pool.length && source && source.zone === 'board' && !isDead(source)) { const victim = pool[Math.floor(state.rng() * pool.length)]; const base = state.cardsById[victim.id]; if (base) { const def = JSON.parse(JSON.stringify(base)); def.token = true; def.id = 'token_' + base.id; const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick; const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); } }
} });


register('grant-hand-school-spelldamage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Silvermoon Farstrider: give all spells of a school in your hand Spell Damage +N; Halduron: also deck; Battlefield Blaster: one random; Archmage Kalec: all + all-deck
			const p = state.players[pi];
			if (e.random) { const pool = p.hand.filter(c => isSpellType(c) && (!e.school || schoolOf(c) === e.school)); if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.bonusSpellDamage = (c.bonusSpellDamage || 0) + (e.value || 1); } }
			else for (const c of p.hand) if (isSpellType(c) && (!e.school || schoolOf(c) === e.school)) c.bonusSpellDamage = (c.bonusSpellDamage || 0) + (e.value || 1);
			if (e.alsoDeck && e.school) { p.deckSchoolSpellDamage = p.deckSchoolSpellDamage || {}; p.deckSchoolSpellDamage[e.school] = (p.deckSchoolSpellDamage[e.school] || 0) + (e.value || 1); }
			if (e.allDeck) p.deckSpellDamageAll = (p.deckSpellDamageAll || 0) + (e.value || 1); // Archmage Kalec
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
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0) + (state.players[pi].spellDamageThisTurn || 0) + (source.bonusSpellDamage || 0);
				const sd = state.players[pi].schoolSpellDmg; if (sd) { const sch = schoolOf(source); if (sch && sd[sch]) v += sd[sch]; } // Duels: per-school Spell Damage (Kindling Flame / Bitter Cold / Natural Force)
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
					if (t) {
						const before = hp(t); // Combustion: excess beyond Health spills to both neighbors
						damageCreature(state, t, v, null);
						if (e.excessToNeighbors && v > before) {
							const b = state.players[t.controller].board, i = b.indexOf(t), ex = v - before;
							for (const nb of [b[i - 1], b[i + 1]]) if (nb && !isDead(nb) && nb.type !== 'location') damageCreature(state, nb, ex, null);
						}
					}
					else if (target?.type === 'hero') damageHero(state, target.player, v, pi);
					else if (e.target === 'any') { const f = enemyHero(); if (f != null) damageHero(state, f, v, pi); } // fallback: face
				}
			}
			if (lsBefore != null) healHero(state, pi, Math.max(0, totalHurt() - lsBefore));
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
				const rdv = e.heraldScaled ? hm() : (e.valuePer ? scaled(e) : e.value); // Blade Dance: damage = hero Attack
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


register('damage-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (source && source.zone === 'board' && !isDead(source)) damageCreature(state, source, e.value, null);
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


register('damage-all-except-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Calamitous Rafaam: damage every minion that isn't a Rafaam
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c.type !== 'creature' || isDead(c) || (c.name || '').includes(e.substr)) continue;
				damageCreature(state, c, e.value, null);
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


register('damage-enemy-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Silvermoon chain: deal `value` to a random OR lowest-Health enemy minion;
			// with excessToHero, damage beyond its Health spills to the enemy hero.
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') pool.push({ o, c });
			if (!pool.length) return;
			let hit;
			if (e.pick === 'lowest') { hit = pool[0]; for (const p of pool) if (hp(p.c) < hp(hit.c)) hit = p; }
			else hit = pool[Math.floor(state.rng() * pool.length)];
			const before = hp(hit.c);
			damageCreature(state, hit.c, e.value || 1, source);
			if (e.excessToHero && (e.value || 1) > before) damageHero(state, hit.o, (e.value || 1) - before, pi);
} });

register('damage-all-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dreadlord's Bite: deal `value` to all enemy minions AND the enemy hero
			for (const o of enemies) {
				for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 1, source);
				if (!state.players[o].eliminated) damageHero(state, o, e.value || 1, pi);
			}
} });

register('advance-location', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Advance to the present/future!" — transform this location into its next
			// stage (a fresh, full-durability location in the same board slot).
			if (!source || source.type !== 'location' || !state.cardsById[e.to]) return;
			const p = state.players[pi];
			const idx = p.board.indexOf(source);
			if (idx < 0) return;
			const ni = instantiate(state.cardsById[e.to], pi);
			ni.uid = source.uid; ni.zone = 'board'; ni.tapped = false; ni.doomed = false;
			p.board[idx] = ni;
			emit(state, { type: 'transformed', uid: ni.uid, player: pi, from: source.name, card: ni });
} });

register('damage-lowest-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Arrow Smith: deal damage to the lowest-Health enemy minion (Ball Hog: heals if source has Lifesteal)
			let low = null;
			for (const o of enemies) for (const c of state.players[o].board) { if (isDead(c) || c.type === 'location') continue; if (!low || hp(c) < hp(low)) low = c; }
			if (low) { const dealt = damageCreature(state, low, e.value || 1, source); if (dealt > 0 && source && (source.keywords || []).includes(KW.LIFESTEAL)) healHero(state, pi, dealt); }
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


register('destroy-weaker-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Forgotten Animatronic: destroy a random minion with less Attack than this
			if (source) { const pool = []; for (const pl of state.players) for (const c of pl.board) { if (c === source || isDead(c) || c.type === 'location') continue; if ((c.attack || 0) < (source.attack || 0)) pool.push(c); } if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); } }
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


register('infect-enemies-summon-on-death', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Blightfang: give each enemy minion a Deathrattle that summons a Zombie for you
			const owner = pi;
			for (const o of enemies) for (const c of state.players[o].board) { if (isDead(c) || c.type === 'location') continue; c.deathrattle = (c.deathrattle || []).concat([{ type: 'summon-for-player', player: owner, summonId: e.summonId || 'rlk_zombie_taunt' }]); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
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

