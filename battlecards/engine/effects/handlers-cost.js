// engine/effects/handlers-cost.js — mana, cost, discount and resource effects (housekeeping split, PR 40).
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

register('corpse-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].corpseDouble = true; // Falric
});


register('corpse-next-card', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].nextCardCorpses = true; // Exarch Maladaar
});


register('next-murloc-free', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].nextMurlocFree = true; // Seadevil Stinger
});


register('hero-power-free-game', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Raza the Chained
			state.players[pi].heroPowerFreeGame = true;
});


register('overload-free-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].overloadFreeTurn = state.turnNumber; // Pebbly Page
});


register('clear-own-overload', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Minecart Cruiser: cancel this turn's Overload
			state.players[pi].overloadPending = 0;
});


register('free-next-spell', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Inkmaster Solia: the next spell this turn costs (0)
			state.players[pi].freeSpellsThisTurn = true;
});


register('spells-cost-one', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Ysiel Windsinger: your spells cost (1) this turn
			state.players[pi].spellsCostOneThisTurn = true;
});


register('free-enemy-spells', ({ state, pi, target, source, enemies, scaled }, e) => {
			for (const o of enemies) state.players[o].freeSpellsNextTurn = true;
			emit(state, { type: 'freeSpells', player: pi });
});


register('refresh-hero-power', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Auctionmaster Beardo: your Hero Power can be used again this turn
			for (const hp of state.players[pi].heroPowers) hp.usedThisTurn = false;
});


register('gain-coin', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			for (let n = 0; n < (e.value || 1); n++) addCoin(state, pi);
});


register('next-secret-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSecretCost = e.value != null ? e.value : 1; // Kabal Lackey
});


register('leyline-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].leylineDiscount = (state.players[pi].leylineDiscount || 0) + (e.value || 1); // Ley Walker
});


register('set-minion-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Loh the Living Legend: your minions cost (N) this game
			state.players[pi].minionCostSet = e.value ?? 5;
});


register('add-overload', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const _otp = e.forEnemy && enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : pi; // Murgatha overloads the enemy
			state.players[_otp].overloadPending = (state.players[_otp].overloadPending || 0) + (e.value || 1); // Winged Aberration
});


register('gain-corpses', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].corpses += e.value;
			emit(state, { type: 'corpses', player: pi, corpses: state.players[pi].corpses });
});


register('foreign-demon-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.foreignDemonDiscount = (p.foreignDemonDiscount || 0) + (e.value || 1); // Foreboding Flame
});


register('set-self-hp-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Genn Greymane: your Hero Power costs (1) (a board aura via heroPowerCostSet)
			if (source) source.heroPowerCostSet = e.value ?? 1;
});


register('next-name-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Murloc Rafaam: the next card matching a name costs less
			state.players[pi].nextNameDiscount = { substr: e.substr, value: e.value || 0 };
});


register('discount-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hunter's Call: cards in hand permanently cost (N) less
			for (const c of state.players[pi].hand) { if (e.spellsOnly && !isSpellType(c)) continue; if (e.minionsOnly && c.type !== 'creature') continue; c.cost = Math.max(0, c.cost - (e.value || 1)); }
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


register('set-next-weapon-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Space Pirate: your next weapon costs (N) less
			state.players[pi].nextWeaponDiscount = (state.players[pi].nextWeaponDiscount || 0) + (e.value || 1);
});


register('set-combo-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Foxy Fraud: your next Combo card this turn costs less
			state.players[pi].nextComboDiscount = (state.players[pi].nextComboDiscount || 0) + (e.value || 2);
});


register('set-choose-one-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Pride Seeker: your next Choose One card costs less
			state.players[pi].nextChooseOneDiscount = (state.players[pi].nextChooseOneDiscount || 0) + (e.value || 2);
});


register('reduce-libram-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Aldor Attendant / Aldor Truthseeker: your Librams cost less this game
			state.players[pi].libramDiscount = (state.players[pi].libramDiscount || 0) + (e.value || 1);
});


register('hero-power-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fencing Coach: your next Hero Power this turn costs less
			state.players[pi].heroPowerDiscountNext = (state.players[pi].heroPowerDiscountNext || 0) + (e.value || 0);
});


register('tax-enemy-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Loatheb: each opponent's spells cost more on their next turn
			for (const o of enemies) state.players[o].spellTaxNext = (state.players[o].spellTaxNext || 0) + (e.value || 0);
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


register('tax-enemy-battlecry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Boompistol Bully: enemy Battlecry cards cost more next turn
			for (const o of enemies) state.players[o].battlecryTaxNext = (state.players[o].battlecryTaxNext || 0) + (e.value || 5);
});


register('reduce-hand-school-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cariel Roame: reduce the Cost of a spell school in your hand
			for (const c of state.players[pi].hand) if (schoolOf(c) === e.school) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});


register('discount-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fire Plume Harbinger: reduce the Cost of a tribe's cards in your hand
			for (const c of state.players[pi].hand) if ((c.tribe || '').includes(e.tribe)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});


register('reduce-hand-darkgift-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Overgrown Horror: reduce the Cost of minions in your hand with Dark Gifts
			for (const c of state.players[pi].hand) if (c._darkGift && c.type === 'creature') c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
});


register('discount-hand-mincost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Summer Flowerchild (Finale): reduce the Cost of expensive cards in your hand
			for (const c of state.players[pi].hand) if ((c.cost || 0) >= (e.minCost || 6)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});


register('enemy-minion-tax-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Forensic Duster: the opponent's minions cost more on their next turn
			for (const o of enemies) { state.players[o].enemyMinionTaxTurn = state.turnNumber + 1; state.players[o].enemyMinionTaxAmount = e.value || 1; }
});

register('enemy-cards-cost-more', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Norgannon (Ancient Knowledge): ALL the opponent's cards cost more next turn
			for (const o of enemies) { state.players[o].enemyCardTaxTurn = state.turnNumber + 1; state.players[o].enemyCardTaxAmount = e.value || 1; }
});


register('discount-foreign-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Leyline Manipulator: cheaper for cards that didn't start in your deck
			const p = state.players[pi];
			for (const c of p.hand) if (!c.fromDeck && c !== source) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
});


register('spend-corpses', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (p.corpses >= e.value) {
				spendCorpses(state, pi, e.value);
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
			}
});


register('set-tribe-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Clownfish: your next N minions of a tribe cost less
			state.players[pi].nextTribeDiscount = { tribe: e.tribe, count: e.count || 2, amount: e.value || 2, overload: e.overload || 0 }; // Planetary Navigator adds Overload
});


register('shade-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Enthralled Shade: enemy-copied cards in hand get cheaper
			const p = state.players[pi];
			for (const c of p.hand) if (c._copiedFromEnemy && (c.cost || 0) > 0) { c.cost -= 1; emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
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
			if ((p.corpses || 0) >= (e.cost || 5)) { spendCorpses(state, pi, (e.cost || 5)); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); healHero(state, pi, e.value || 5); }
});


register('set-own-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Audio Amplifier: set your maximum Mana (hand-size cap approximated by MAX_HAND)
			const p = state.players[pi];
			if (p.mana) { p.mana.max = e.value || 11; p.mana.cur = Math.min(p.mana.cur, p.mana.max); emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(p) }); }
});


register('reduce-random-hand-minion-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dreampetal Florist: cheapen a random creature in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (c.cost || 0) > 0);
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
});


register('reduce-hand-edges-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wayward Sage: reduce the Cost of the left- and right-most cards in your hand
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			for (const c of [...new Set([others[0], others[others.length - 1]])].filter(Boolean)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
});


register('reduce-corrupt-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dark Inquisitor Xanesh: your Corrupt/Corrupted cards cost less (hand now, deck on draw)
			const p = state.players[pi];
			for (const c of p.hand) if (c.corrupt || c.corruptGrow) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
			p.corruptDeckDiscount = (p.corruptDeckDiscount || 0) + (e.value || 2);
});


register('reduce-hand-tribe-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Soridormi's awakening: Dragons in hand cost (4) less
			const p = state.players[pi];
			for (const c of p.hand) if ((c.tribe || '').includes(e.tribe) && (c.cost || 0) > 0) {
				c.cost = Math.max(0, c.cost - (e.value || 1));
				emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost });
			}
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


register('unlock-overload', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Eternal Sentinel: give back the Mana Crystals locked this turn, and
			// cancel next turn's pending lock
			const p = state.players[pi];
			if (p.overloadLockedThisTurn) { p.mana.cur += p.overloadLockedThisTurn; p.overloadLockedThisTurn = 0; }
			p.overloadPending = 0;
			emit(state, { type: 'manaGained', player: pi });
});


register('gain-empty-mana-crystal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Widowbloom Seedsman: gain an empty Mana Crystal (max +1, current unchanged); Tranquil Treant: both players
			const targets = e.eachPlayer ? state.players.map((_, i) => i) : [pi];
			for (const idx of targets) { const pl = state.players[idx]; if (pl.mana && !pl.eliminated) pl.mana.max = (pl.mana.max || 0) + (e.value || 1); }
});


register('reset-hand-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wizened Truthseeker: every card in both hands returns to its printed Cost
			for (const pl of state.players) for (const c of pl.hand) {
				const def = state.cardsById[c.id];
				if (def && c.cost !== def.cost) { c.cost = def.cost || 0; emit(state, { type: 'costChange', player: c.controller, uid: c.uid, cost: c.cost }); }
			}
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


register('refresh-highest-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Green-Thumb Gardener: refresh empty crystals equal to your highest-Cost spell
			const p = state.players[pi];
			let best = 0; for (const c of p.hand) if (isSpellType(c)) best = Math.max(best, c.cost || 0);
			if (best > 0) { p.mana.cur = Math.min(p.mana.max, p.mana.cur + best); emit(state, { type: 'manaGained', player: pi }); }
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


register('gain-mana-to-match', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crystal Tender: gain empty Mana Crystals until you match the opponent's maximum Mana
			const p = state.players[pi];
			let target = p.mana ? p.mana.max : 0;
			for (const o of enemies) { const om = state.players[o].mana ? state.players[o].mana.max : 0; if (om > target) target = om; }
			if (p.mana && target > p.mana.max) p.mana.max = target;
} });


register('spend-corpses-up-to', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Spend up to N Corpses / all of your Corpses, X for each spent"
			const p = state.players[pi];
			const n = Math.min(e.max ?? Infinity, p.corpses);
			if (n > 0) {
				spendCorpses(state, pi, n);
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				for (let i = 0; i < n; i++) execEffects(state, pi, e.effects, target, source);
			}
} });


register('reduce-random-enemy-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Curious Explorer: reduce the Cost of a random minion in your opponent's hand
			for (const o of enemies) {
				const pool = state.players[o].hand.filter(c => c.type === 'creature' && (c.cost || 0) > 0);
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); }
				break;
			}
} });


register('lose-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Revenant Rascal: target 'all' destroys a Mana Crystal for each player
			const victims = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const vi of victims) { const vp = state.players[vi]; vp.mana.max = Math.max(0, vp.mana.max - (e.value || 1)); vp.mana.cur = Math.min(vp.mana.cur, vp.mana.max); }
} });


register('reduce-hand-if-distinct-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zaqali Flamemancer: if every card in your hand has a different Cost, reduce their Costs
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			const costs = others.map(c => c.cost || 0);
			if (others.length && new Set(costs).size === costs.length) { for (const c of others) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); }
} });


register('discount-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Skittish Saucier: cards adjacent in hand (at play time) cost less
			const p = state.players[pi];
			const hi = source ? source._handIndex : -1;
			if (hi >= 0) for (const c of [p.hand[hi - 1], p.hand[hi]]) {
				if (c && (c.cost || 0) > 0) { c.cost = Math.max(0, c.cost - (e.value || 1)); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			}
} });


register('refresh-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// LIVE first-wins body kept (value + valuePer spells-this-turn/self-attack;
	// merged during the TIME_TRAVEL import). Retired dead twin: the older
	// subset emitting 'manaGained', unreachable since that merge.
			const mp = state.players[pi].mana;
			const n = e.valuePer === 'spells-this-turn' ? (state.players[pi].spellsPlayedThisTurn || 0) : e.valuePer === 'self-attack' ? (source ? (source.attack || 0) : 0) : e.value; // Priestess Valishj / Enduring Roach / Chromatic Broodmother
			mp.cur = n != null ? Math.min(mp.max, (mp.cur || 0) + n) : mp.max;
			emit(state, { type: 'mana', player: pi, cur: mp.cur, max: mp.max });
} });


register('steal-empty-mana-crystal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Doomkin: take one of your opponent's empty Mana Crystals
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const fp = state.players[foe]; if ((fp.mana?.max || 0) > (fp.mana?.cur || 0) && p.mana) { fp.mana.max = Math.max(0, fp.mana.max - 1); p.mana.max = (p.mana.max || 0) + 1; emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(p) }); } }
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


register('gain-max-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const targets = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated)
				: e.target === 'enemy' ? [enemyHero()].filter(x => x != null) : [pi];
			for (const who of targets) {
				const wp = state.players[who];
				wp.mana.max = Math.min(MAX_BASE_MANA, wp.mana.max + (e.value || 1));
				emit(state, { type: 'manaGained', player: who, amount: 0, mana: availableMana(wp) });
			}
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


register('set-hand-spell-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Naga Sand Witch: set the Cost of spells in your hand; Lunar Trailblazer: one random spell -> this minion's Cost
			const cost = e.fromSourceCost && source ? (source.cost || 0) : (e.value ?? 5);
			if (e.random) { const pool = state.players[pi].hand.filter(c => isSpellType(c)); if (pool.length) pool[Math.floor(state.rng() * pool.length)].cost = cost; }
			else for (const c of state.players[pi].hand) if (isSpellType(c)) c.cost = cost;
} });


register('copy-hand-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pip the Potent: add a copy of each card in your hand of a given Cost
			const p = state.players[pi];
			const targets = p.hand.filter(c => c !== source && (c.cost || 0) === (e.cost ?? 1) && state.cardsById[c.id]);
			for (const c of targets) { if (p.hand.length >= MAX_HAND) break; const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
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


register('spend-corpses-while', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Corpse Explosion: pay 1 and repeat while any creature survives
			const p = state.players[pi];
			let guard = 100;
			const anyAlive = () => state.players.some(pl => pl.board.some(c => !isDead(c)));
			while (p.corpses >= (e.value || 1) && anyAlive() && guard-- > 0) {
				spendCorpses(state, pi, e.value || 1);
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
				sweepDeaths(state);
			}
} });


register('reduce-id-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ultraxion: reduce Deathwing's Cost wherever he is
			const p = state.players[pi];
			for (const c of p.hand) if ((c.id || '').includes(e.idIncludes)) { c.cost = Math.max(0, (c.cost || 0) - (e.value || 2)); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			for (const id of p.deck) if (id.includes(e.idIncludes)) { const def = state.cardsById[id]; if (def) (p.deckCostOverrides = p.deckCostOverrides || {})[id] = Math.max(0, ((p.deckCostOverrides || {})[id] ?? def.cost ?? 0) - (e.value || 2)); }
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


register('corpse-bride', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Corpse Bride: the Groom grows +1/+1 per Corpse spent (up to 5)
			const p = state.players[pi];
			const spend = Math.min(5, p.corpses || 0);
			spendCorpses(state, pi, spend);
			emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
			const g = summon(state, pi, { id: 'token_risen_groom', name: 'Risen Groom', type: 'creature', cost: 5, attack: 5, health: 5, tribe: 'Undead', rarity: 'common', token: true, keywords: ['taunt'], description: 'Taunt' });
			if (g && spend) { g.attack += spend; g.maxHealth += spend; emit(state, { type: 'buff', uid: g.uid, attack: g.attack, hp: hp(g) }); }
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


register('set-mana-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mojomaster Zihi: set each player to N Mana Crystals
			for (const pl of state.players) { if (pl.eliminated) continue; pl.mana.max = e.value || 5; pl.mana.cur = Math.min(pl.mana.cur, pl.mana.max); }
			emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(state.players[pi]) });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('refresh-friendly-attacks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Exarch Akama: after this attacks, all OTHER friendly minions can attack again
			for (const c of state.players[pi].board) { if (c === source || isDead(c) || c.type === 'location') continue; c.attacksUsed = 0; c.sick = false; }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('refresh-self-attack', ({ state, pi, source }, e) => {
	// Giant Sand Worm: "it may attack again" — grant this minion another attack this turn
	if (source && !isDead(source) && source.zone === 'board') { source.attacksUsed = Math.max(0, (source.attacksUsed || 0) - (e.value || 1)); emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});

register('refresh-hero-attack', ({ state, pi }, e) => {
	// Gonk, the Raptor: your hero may attack again
	const p = state.players[pi]; p.heroAttacksUsed = Math.max(0, (p.heroAttacksUsed || 0) - (e.value || 1));
});

register('improve-tick', ({ state, source }, e) => {
	// Festival of Legends instruments: each matching action grows the Deathrattle
	if (source) source.improveCount = (source.improveCount || 0) + (e.value || 1);
});

register('discount-next-spell', ({ state, pi }, e) => {
	// Jazz Bass: your next spell costs (N) less
	state.players[pi].nextSpellDiscount = (state.players[pi].nextSpellDiscount || 0) + (e.value || 1);
});

register('gain-spell-damage-turn', ({ state, pi }, e) => {
	// Magical Dollhouse / Rune Dagger: Spell Damage +N for the rest of this turn
	state.players[pi].spellDamageThisTurn = (state.players[pi].spellDamageThisTurn || 0) + (e.value || 1);
});

register('set-next-summon-stats', ({ state, pi }, e) => {
	// The Crystal Cove: the next minion you summon this turn is set to A/H
	state.players[pi].nextSummonStats = { attack: e.attack ?? 4, health: e.health ?? 4 };
});

register('summon-scaled-cards-played', ({ state, pi }, e) => {
	// Sinstone Graveyard: a Ghost with +1/+1 for each other card played this turn
	const s = (e.base || 1) + (state.players[pi].cardsPlayedThisTurn || 0);
	summon(state, pi, { id: 'token_' + (e.name || 'ghost').toLowerCase(), name: e.name || 'Ghost', type: 'creature', cost: 0, token: true, rarity: 'common', attack: s, health: s, keywords: e.keywords || [], description: `A ${s}/${s} token.` });
});

register('lose-durability', ({ state, pi }, e) => {
	// Cosmic Keyboard / The Fist of Ra-den: the equipped weapon loses N Durability
	for (let i = 0; i < (e.value || 1); i++) if (state.players[pi].weapon) degradeWeapon(state, pi);
});

register('reduce-hand-battlecry-cost', ({ state, pi }, e) => {
	// Auctionhouse Gavel: reduce the Cost of a random Battlecry minion in your hand
	const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.keywords || []).includes('battlecry'));
	if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
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

