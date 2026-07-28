// engine/effects/handlers-deck.js — draw, deck, discard and card-movement effects (housekeeping split, PR 40).
// Handler bodies are the verbatim registry migrations (PRs 13–39); this file
// only re-homes them. Imported for its registration side effects by index.js.
import { register, registerTrigger, ABORT } from './registry.js';
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

register('draw', ({ state, pi, scaled }, e) => {
	// count-vs-value tolerance (docs/06 pinned it; king_llane regression): a
	// handful of imported cards write `count` instead of `value` — the old
	// chain read only e.value, so {type:'draw', count:1} silently drew NOTHING
	const n = e.value != null || e.valuePer ? scaled(e) : (e.count || 0);
	if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) drawCards(state, s2, n); }
	else drawCards(state, pi, n);
});


register('shuffle-ids-into-deck', ({ state, pi, enemies }, e) => {
	// forEnemy: they hide in an opponent's deck instead (King Llane fleeing Garona)
	const tp = e.forEnemy && enemies.length ? enemies[0] : pi;
	const dp = state.players[tp];
	for (const id of e.ids || []) if (state.cardsById[id]) dp.deck.push(id);
	for (let i = dp.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dp.deck[i], dp.deck[j]] = [dp.deck[j], dp.deck[i]]; }
});


register('geddon-draws', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].geddonDraw = true; // Commander Geddon
});


register('set-deck-inner-fire', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lady in White: creatures drawn from your deck get Attack equal to Health
			state.players[pi].deckInnerFire = true;
});


register('reverse-deck', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Timeless Causality: reverse the order of your deck
			state.players[pi].deck.reverse();
			emit(state, { type: 'shuffle', player: pi });
});


register('draw-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = enemyHero();
			if (t != null) drawCards(state, t, e.value || 1);
});


register('set-max-hand-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Valdris Felgorge: draw cards (our hand cap is already generous)
			drawCards(state, pi, e.draw || 4);
});


register('enemy-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Southsea Scoundrel: the opponent also draws
			for (const o of enemies) drawCards(state, o, e.value || 1);
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


register('draw-until-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			let guard = 20;
			while (p.hand.length < MAX_HAND && p.deck.length && guard-- > 0) drawCards(state, pi, 1);
});


register('maybe-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Package Dealer: chance to draw another card (fires on card-drawn)
			if (state.rng() < (e.chance ?? 0.5)) drawCards(state, pi, e.value || 1);
});


register('set-next-draw-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// SI:7 Skulker: the next card you draw costs less
			state.players[pi].nextDrawDiscount = (state.players[pi].nextDrawDiscount || 0) + (e.value || 1);
});


register('set-cast-when-drawn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sheldras Moontree: the next N spells you draw are Cast When Drawn
			state.players[pi].castWhenDrawn = (state.players[pi].castWhenDrawn || 0) + (e.value || 3);
});


register('put-on-bottom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Azsharan Scavenger: put a card on the bottom of your deck (front of the array)
			for (let i = 0; i < (e.count || 1); i++) state.players[pi].deck.unshift(e.id);
});


register('draw-if-self-didnt-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Astral Serpent: at end of turn, if this didn't attack, draw N (runs via turn-end ongoing)
			if (source && (source.attacksUsed || 0) === 0) drawCards(state, pi, e.value || 2);
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


register('arm-enemy-draw-punish', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ashen Elemental: the opponent's draws next turn deal damage to them
			for (const o of enemies) { state.players[o].drawPunishTurn = state.turnNumber + 1; state.players[o].drawPunishDamage = e.value || 2; }
});


register('store-deck-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Enthusiastic Banker: move a card from your deck onto this minion's stash
			if (source && state.players[pi].deck.length) { const id = state.players[pi].deck.pop(); (source.storedCards = source.storedCards || []).push(id); }
});


register('add-remembered-discard', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Expired Merchant's Deathrattle: add copies of the discarded card
			if (source?.discardedId && state.cardsById[source.discardedId]) execEffects(state, pi, [{ type: 'add-card', id: source.discardedId, count: e.count || 2 }], target, source);
});


register('set-deck-top-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Twilight Medium: set the Cost of the top card of your deck to a value
			const p = state.players[pi];
			if (p.deck.length) { p.deckCostOverrides = p.deckCostOverrides || {}; p.deckCostOverrides[p.deck[p.deck.length - 1]] = (e.value || 0); }
});


register('draw-set-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bright-Eyed Scout: draw a card and change its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.cost = e.cost;
});


register('draw-to-match', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Divine Favor: draw until your hand matches an opponent's
			const victim = enemyHero();
			if (victim != null) {
				const diff = state.players[victim].hand.length - state.players[pi].hand.length;
				if (diff > 0) drawCards(state, pi, diff);
			}
});


register('reorder-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lorekeeper Polkelt: order your deck highest Cost -> lowest (draws pop the top/end)
			const p = state.players[pi];
			p.deck.sort((a, b) => (state.cardsById[a]?.cost || 0) - (state.cardsById[b]?.cost || 0)); // ascending: pop() draws the highest first
});


register('infinity-restore', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._infUid != null) {
				const c = p.hand.find(x => x.uid === source._infUid);
				if (c) { c.cost = source._infCost || 0; emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); }
			}
});


register('draw-remember', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Platysaur: draw a card and remember it for the Deathrattle discard
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			if (source && p.hand.length > before) source._rememberUid = p.hand[p.hand.length - 1].uid;
});


register('shuffle-enemy-hand-card-choose', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Ghastly Gravedigger: if you control a Secret, shuffle a chosen card from the opponent's hand into their deck
			if (e.requireSecret && !state.players[pi].secrets.length) return;
			execEffects(state, pi, [{ type: 'shuffle-enemy-hand-card' }], null, source);
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


register('draw-stilt-reward', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Stiltstepper: draw a card; if you play it this turn, give your hero +N Attack
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.stiltReward = e.value || 4;
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


register('discard-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._rememberUid != null) {
				const hi = p.hand.findIndex(c => c.uid === source._rememberUid);
				if (hi >= 0) { const [c] = p.hand.splice(hi, 1); toGraveyard(state, pi, c); emit(state, { type: 'discard', player: pi, card: c }); }
			}
});


register('set-deck-bottom-costs', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Krona, Keeper of Eons: set the Costs of the bottom N cards of your deck (front of array = bottom)
			const p = state.players[pi];
			p.deckCostOverrides = p.deckCostOverrides || {};
			for (let i = 0; i < (e.count || 5) && i < p.deck.length; i++) p.deckCostOverrides[p.deck[i]] = (e.value ?? 1);
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


register('mill-own-top', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Willful Watcher: destroy the top N cards of your deck
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && p.deck.length; n++) { const id = p.deck.pop(); if (id && state.cardsById[id] && !state.cardsById[id].token) p.discardLogIds.push(id); }
			emit(state, { type: 'shuffle', player: pi });
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


register('discard-weapon-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Grimtotem Buzzkill: discard a weapon from your hand to draw N cards
			const p = state.players[pi];
			const w = p.hand.find(c => c.type === 'weapon');
			if (w) { p.hand = p.hand.filter(c => c !== w); if (!w.token) p.discardLogIds.push(w.id); emit(state, { type: 'discard', player: pi, card: w }); drawCards(state, pi, e.value || 3); }
});


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


register('shuffle-remembered-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Test Subject: shuffle every spell cast on this creature into your deck
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (state.cardsById[id]) p.deck.push(id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
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


register('shuffle-soul-fragments', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spirit Jailer / etc: shuffle N Soul Fragments into your deck
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 2); n++) p.deck.push('sch_soul_fragment');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
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


register('copy-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Archbishop Benedictus: shuffle a copy of your opponent's deck into your deck
			const foe = enemies[0];
			if (foe != null) {
				const p = state.players[pi];
				for (const id of state.players[foe].deck) p.deck.push(id);
				for (let k = p.deck.length - 1; k > 0; k--) { const j = Math.floor(state.rng() * (k + 1)); [p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]]; }
			}
} });


register('copy-deck-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// R4T-C4TCH3R: duplicate every spell in your deck
			const p = state.players[pi];
			const spells = p.deck.filter(id => { const dd = state.cardsById[id]; return dd && isSpellType(dd); });
			for (const id of spells) p.deck.push(id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
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


register('shuffle-copies-of-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Northshire Farmer: shuffle N stat-set copies of a chosen friendly into your deck
			const t = chosenCreature();
			if (t) { const p = state.players[pi]; for (let i = 0; i < (e.count || 3); i++) p.deck.push(t.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
} });


register('shuffle-cards-into-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Framester: shuffle N copies of a card into the opponent's deck
			const foe = enemies[0];
			if (foe != null && e.id) { const fp = state.players[foe]; for (let n = 0; n < (e.count || 1); n++) fp.deck.push(e.id); for (let i = fp.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [fp.deck[i], fp.deck[j]] = [fp.deck[j], fp.deck[i]]; } emit(state, { type: 'shuffle', player: foe }); }
} });


register('bounce-to-deck-bottom', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bootstrap Sunkeneer: put an enemy minion on the bottom of its owner's deck
			const t = chosenCreature();
			if (t && t.controller != null) { const owner = state.players[t.controller]; owner.board = owner.board.filter(c => c !== t); if (state.cardsById[t.id]) owner.deck.unshift(t.id); t.zone = 'gone'; emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name }); recomputeAuras(state); }
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


register('copy-deck-top-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Narain Soothfancy: add N copies of the top card of your deck to your hand
			const p = state.players[pi];
			if (p.deck.length) { const id = p.deck[p.deck.length - 1]; const def = state.cardsById[id]; if (def) for (let n = 0; n < (e.count || 1) && p.hand.length < MAX_HAND; n++) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
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


register('mill', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Devour: burn the top N cards of an opponent's deck (target 'all' = everyone,
			// 'self' = your own deck — Tickatus)
			if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) for (let i = 0; i < (e.value || 1); i++) state.players[s2].deck.pop(); }
			else if (e.target === 'self') { for (let i = 0; i < (e.value || 1); i++) e.bottom ? state.players[pi].deck.shift() : state.players[pi].deck.pop(); } // Waste Remover: bottom of own deck
			else { const victim = enemyHero(); if (victim != null) { for (let i = 0; i < (e.value || 1); i++) state.players[victim].deck.pop(); } }
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


register('unlock-overload-draw', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Thorim: unlock your Overloaded Mana Crystals, draw that many cards
			const p = state.players[pi];
			const locked = (p.overloadPending || 0) + (p.overloadLockedThisTurn || 0);
			p.overloadPending = 0; p.overloadLockedThisTurn = 0;
			if (p.mana) { p.mana.cur = Math.min(p.mana.max, (p.mana.cur || 0) + locked); emit(state, { type: 'manaGained', player: pi, amount: locked, mana: availableMana(p) }); }
			if (locked > 0) drawCards(state, pi, locked);
} });


register('copy-enemy-deck-top', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Plagiarizarrr: add a copy of the top card of the opponent's deck to your hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null && state.players[foe].deck.length && p.hand.length < MAX_HAND) { const id = state.players[foe].deck[state.players[foe].deck.length - 1]; const def = state.cardsById[id]; if (def) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });


register('transform-deck-neutral', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wyrmrest Purifier: turn every Neutral card in your deck into a random class card
			const p = state.players[pi], cls = p.heroClass;
			const pool = Object.values(state.cardsById).filter(d => d.cardClass === cls && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.type !== 'land');
			if (cls && pool.length) p.deck = p.deck.map(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral' ? pool[Math.floor(state.rng() * pool.length)].id : id);
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


register('copy-random-enemy-deck-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mind Eater: add a copy of a random card from the opponent's deck to your hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null && state.players[foe].deck.length && p.hand.length < MAX_HAND) { const id = state.players[foe].deck[Math.floor(state.rng() * state.players[foe].deck.length)]; const def = state.cardsById[id]; if (def) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
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


register('equip-weapon-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Selfless Sidekick: equip a random weapon from your deck
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'weapon');
			if (idxs.length) { const [id, di] = idxs[Math.floor(state.rng() * idxs.length)]; p.deck.splice(di, 1); if (p.weapon) breakWeapon(state, pi, true); const w = instantiate(state.cardsById[id], pi); w.zone = 'weapon'; p.weapon = w; emit(state, { type: 'weaponEquip', player: pi, card: w }); recomputeAuras(state); runBattlecry(state, pi, w, null); }
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


register('draw-school-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sketch Artist: draw a spell of a school, then add a copy to your hand
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', school: e.school, count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && state.cardsById[drawn.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[drawn.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
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


register('shuffle-random-primes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Envoy Rustwix: shuffle N random Prime Legendary minions into your deck
			const primes = Object.values(state.cardsById).filter(d => typeof d.id === 'string' && d.id.endsWith('_prime') && d.type === 'creature');
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 3) && primes.length; n++) p.deck.push(primes[Math.floor(state.rng() * primes.length)].id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
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


register('draw-give-spells-to-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Magatha: draw N cards; give any spells drawn to your opponent
			const p = state.players[pi], foe = enemies[0];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 5);
			if (foe != null) { const drawn = p.hand.filter(c => !before.has(c.uid) && isSpellType(c)); for (const c of drawn) { p.hand = p.hand.filter(x => x !== c); if (state.players[foe].hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[c.id] || c, foe); cp.zone = 'hand'; state.players[foe].hand.push(cp); emit(state, { type: 'conjure', player: foe, card: cp, color: null }); } } }
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


register('return-discarded', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cho'gall: return everything you discarded this game; Soulwarden: N random
			const p = state.players[pi];
			let ids = p.discardLogIds;
			if (e.random) { const pool = [...p.discardLogIds]; ids = []; for (let i = 0; i < (e.count || 1) && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0]); }
			for (const id of ids) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const card = instantiate(def, pi); card.zone = 'hand'; if (e.freeCost) card.cost = 0; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
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


register('rebuild-deck-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Archivist Elysiana: replace your deck with 2 copies each of some random cards
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			const deck = [];
			for (let i = 0; i < (e.count || 5) && pool.length; i++) { const d = pool[Math.floor(state.rng() * pool.length)]; deck.push(d.id, d.id); }
			p.deck = deck;
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
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


register('transform-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady Prestor: transform minions in your deck into random `tribe` (keep Cost)
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes(e.tribe) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) p.deck = p.deck.map(id => { const d = state.cardsById[id]; if (!d || d.type !== 'creature') return id; const cands = pool.filter(x => (x.cost || 0) === (d.cost || 0)); return cands.length ? cands[Math.floor(state.rng() * cands.length)].id : pool[Math.floor(state.rng() * pool.length)].id; });
} });


register('shuffle-died-copies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raza the Resealed: shuffle copies of N random died friendly minions into your deck, cost 0
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			for (let n = 0; n < (e.count || 5) && pool.length; n++) { const def = pool[Math.floor(state.rng() * pool.length)]; p.deck.push(def.id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi }); // NB: the (0)-cost reduction on the shuffled copies is not modeled per-copy
} });


register('swap-with-enemy-deck-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Soul Seeker: swap this with a random minion from the opponent's deck
			const foe = enemies[0];
			if (source && foe != null) { const fp = state.players[foe]; const idxs = fp.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token); if (idxs.length) { const [id, i] = idxs[Math.floor(state.rng() * idxs.length)]; fp.deck.splice(i, 1); const p = state.players[pi]; p.board = p.board.filter(c => c !== source); if (state.cardsById[source.id]) fp.deck.push(source.id); source.zone = 'gone'; summon(state, pi, state.cardsById[id]); emit(state, { type: 'bounce', uid: source.uid, player: pi, name: source.name }); } }
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


register('swap-enemy-with-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Translocation Instructor: swap a chosen enemy minion with a random minion in their deck
			const t = chosenCreature();
			if (t && t.controller != null && t.controller !== pi) { const owner = state.players[t.controller]; const idxs = owner.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token); if (idxs.length) { const [id, di] = idxs[Math.floor(state.rng() * idxs.length)]; owner.deck.splice(di, 1); owner.board = owner.board.filter(c => c !== t); if (state.cardsById[t.id]) owner.deck.push(t.id); t.zone = 'gone'; summon(state, t.controller, state.cardsById[id]); emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name }); recomputeAuras(state); } }
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


register('discard-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			while (p.hand.length) {
				const c = p.hand.pop();
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */
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
				if (e.summonCopy) { // Searing Reflection: also summon an X/Y copy of the draw
					const cd = JSON.parse(JSON.stringify(state.cardsById[id]));
					if (e.summonCopy.attack != null) cd.attack = e.summonCopy.attack;
					if (e.summonCopy.health != null) cd.health = e.summonCopy.health;
					const cpy = summon(state, pi, cd);
					if (cpy && e.summonCopy.grant && !cpy.keywords.includes(e.summonCopy.grant)) { cpy.keywords.push(e.summonCopy.grant); if (e.summonCopy.grant === KW.DIVINE_SHIELD) cpy.shield = true; }
				}
				if (e.setCost != null) card.cost = e.setCost;
				if (e.costMod) card.cost = Math.max(0, (card.cost || 0) + e.costMod); // Vashj Prime: reduce drawn spells' Cost
				if (e.gainDeathrattle && source && card.deathrattle && card.deathrattle.length) { source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(card.deathrattle))]; if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle'); } // Necrium Apothecary
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
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


register('return-weaker-to-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// King Plush: return all minions with less Attack than this to their owners' decks
			if (source) { for (const pl of state.players) { for (const c of [...pl.board]) { if (c === source || isDead(c) || c.type === 'location') continue; if ((c.attack || 0) < (source.attack || 0) && state.cardsById[c.id]) { const owner = state.players[c.controller]; owner.board = owner.board.filter(x => x !== c); if (!c.token) owner.deck.push(c.id); c.zone = 'gone'; emit(state, { type: 'bounce', uid: c.uid, player: c.controller, name: c.name }); } } } recomputeAuras(state); }
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


register('fill-hand-enemy-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Ashamane: fill your hand with copies of cards from your opponent's deck (cheaper)
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { let guard = 20; while (p.hand.length < MAX_HAND && state.players[foe].deck.length && guard-- > 0) { const id = state.players[foe].deck[Math.floor(state.rng() * state.players[foe].deck.length)]; const def = state.cardsById[id]; if (!def) continue; const cp = instantiate(def, pi); cp.zone = 'hand'; if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
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


register('snapshot-hand-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Photographer Fizzle: shuffle a copy of each card in your hand into your deck
			const p = state.players[pi];
			for (const c of p.hand) { if (c === source) continue; if (state.cardsById[c.id]) p.deck.push(c.id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('add-stored-cards', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Enthusiastic Banker deathrattle: add the stashed cards to your hand
			const p = state.players[pi];
			for (const id of (source && source.storedCards) || []) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (!def) continue; const nc = instantiate(def, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


const _h_draw_lowest = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Grillmaster: draw your lowest / highest Cost card
			const p = state.players[pi];
			if (p.deck.length && p.hand.length < MAX_HAND) { let idx = 0; for (let i = 1; i < p.deck.length; i++) { const ci = state.cardsById[p.deck[i]]?.cost || 0, cb = state.cardsById[p.deck[idx]]?.cost || 0; if (e.type === 'draw-lowest' ? ci < cb : ci > cb) idx = i; } const [id] = p.deck.splice(idx, 1); const card = instantiate(state.cardsById[id], pi); card.zone = 'hand'; card.fromDeck = true; p.hand.push(card); emit(state, { type: 'draw', player: pi, card }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('draw-lowest', _h_draw_lowest);
register('draw-highest', _h_draw_lowest); // shared or-branch handler


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

