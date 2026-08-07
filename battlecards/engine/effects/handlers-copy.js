// engine/effects/handlers-copy.js — copies, transforms, conjures and discovery (housekeeping split, PR 40).
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


register('arm-copycat', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Copycat: arm to copy the next card the opponent plays
			for (const o of enemies) state.players[o].copycatFor = pi;
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


register('conjure-id-endturn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Everburning Phoenix: get another copy at the end of the turn
			const p = state.players[pi];
			(p.endTurnConjure = p.endTurnConjure || []).push(e.id);
});


register('copy-enemy-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Horde Operative: copy the opponent's Secrets and put them into play
			for (const o of enemies) for (const sec of [...state.players[o].secrets]) { if (state.players[pi].secrets.length < 5 && state.cardsById[sec.id]) installSecret(state, pi, sec.id); }
});


register('illusion-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bloodthistle Illusionist: a copy appears; one of the two is secretly fake
			if (source && state.cardsById[source.id]) {
				const cp = summon(state, pi, state.cardsById[source.id]);
				if (cp) { (state.rng() < 0.5 ? cp : source).illusion = true; }
			}
});


register('discover-target-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Amalgam of the Deep: discover a minion of the chosen friendly minion's type
			const t = chosenCreature();
			const tribe = t && (t.tribe || '').split('/')[0];
			execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: tribe || undefined }], null, source);
});


register('copy-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Faceless Rager: set this creature's Health equal to a chosen friendly's
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source)) {
				source.maxHealth = hp(t); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});


register('disguise', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature() || (() => {
				// triggered disguises without a chosen target hide a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c) && !c.disguised);
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
			})();
			if (t) disguiseCreature(state, t);
});


register('swap-attack-with', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Origami Frog: swap Attack with another minion
			const t = chosenCreature();
			if (t && source) { const a = source.attack; source.attack = t.attack; t.attack = a; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});


register('swap-hero-powers', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Grizzled Wizard: swap Hero Powers with an opponent
			const o = enemies[0];
			if (o != null) { const tmp = state.players[pi].heroPowers; state.players[pi].heroPowers = state.players[o].heroPowers; state.players[o].heroPowers = tmp; emit(state, { type: 'heroPowerGained', player: pi, card: state.players[pi].heroPowers[0] }); }
});


register('copy-adjacent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gloop Sprayer: summon a copy of each creature flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const adj of [board[idx - 1], board[idx + 1]]) {
				if (adj && !isDead(adj) && adj.type !== 'location') { const def = state.cardsById[adj.id]; if (def) summon(state, pi, def); }
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


register('underbelly-discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			if (p.contraband && p.contraband.length) {
				state.pickQueue.push({ player: pi, ids: [...p.contraband], costMod: -3 });
				emit(state, { type: 'pickStart', player: pi, count: p.contraband.length });
			} else execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: 'Beast', costMod: -3 }], null, source);
} });


register('roll-dice-discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Snake Eyes: roll two dice, Discover a card of each rolled Cost (doubles = an extra)
			const r1 = 1 + Math.floor(state.rng() * 6), r2 = 1 + Math.floor(state.rng() * 6);
			execEffects(state, pi, [{ type: 'discover', cost: r1 }, { type: 'discover', cost: r2 }], null, source);
			if (r1 === r2) execEffects(state, pi, [{ type: 'discover', cost: r1 }], null, source);
} });


register('copy-last-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Astral Vigilant: get a copy of the last Draenei you played
			const p = state.players[pi];
			const id = (e.tribe === 'Draenei' || !e.tribe) ? p.lastDraeneiId : null;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
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


register('copy-enemy-last-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fate Splitter: add a copy of the last card the opponent played to your hand
			const foe = enemies[0], p = state.players[pi];
			const id = foe != null ? state.players[foe].lastCardPlayedId : null;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });


register('copy-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// War Master Voone: copy all creatures of a tribe in your hand
			const p = state.players[pi];
			const copies = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			for (const c of copies) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[c.id] || c; const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
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


register('copy-highest-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Audio Splitter: add a copy of the highest-Cost spell in your hand
			const p = state.players[pi];
			let best = null;
			for (const c of p.hand) if (isSpellType(c) && (!best || (c.cost || 0) > (best.cost || 0))) best = c;
			if (best && p.hand.length < MAX_HAND && state.cardsById[best.id]) { const cp = instantiate(state.cardsById[best.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
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


register('copy-hand-edges', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zai, the Incredible: add copies of the leftmost and rightmost cards in hand
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			const picks = others.length ? [...new Set([others[0], others[others.length - 1]])] : [];
			for (const c of picks) { if (p.hand.length >= MAX_HAND) break; const inst = instantiate(state.cardsById[c.id] || c, pi); inst.zone = 'hand'; p.hand.push(inst); emit(state, { type: 'conjure', player: pi, card: inst, color: null }); }
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


register('transform-lowest-hand-spell', ({ state, pi }, e) => {
	// Primordial Acolyte: transform the lowest-Cost spell in your hand into a random spell that costs (delta) more
	const p = state.players[pi];
	const spells = p.hand.filter(c => isSpellType(c));
	if (!spells.length) return;
	const lowest = spells.reduce((m, c) => ((c.cost || 0) < (m.cost || 0) ? c : m), spells[0]);
	const targetCost = (lowest.cost || 0) + (e.delta || 1);
	const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && !d.choices && (d.cost || 0) === targetCost);
	if (pool.length) {
		const morph = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
		morph.uid = lowest.uid; morph.zone = 'hand';
		p.hand[p.hand.indexOf(lowest)] = morph;
		emit(state, { type: 'conjure', player: pi, card: morph, color: null });
	}
});

register('transform-random-enemy-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Plaguespreader: transform a random minion in the opponent's hand into a copy of a card
			const foe = enemies[0];
			if (foe != null && state.cardsById[e.id]) { const fp = state.players[foe]; const pool = fp.hand.filter(c => c.type === 'creature'); if (pool.length) { const victim = pool[Math.floor(state.rng() * pool.length)]; const i = fp.hand.indexOf(victim); const nc = instantiate(state.cardsById[e.id], foe); nc.zone = 'hand'; fp.hand[i] = nc; emit(state, { type: 'transformed', uid: victim.uid, player: foe, from: victim.name, card: nc }); } }
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


register('copy-lowest-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tending Dragonkin: add a copy of the lowest-Cost minion of a tribe in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length && p.hand.length < MAX_HAND) {
				let lo = pool[0]; for (const c of pool) if ((c.cost || 0) < (lo.cost || 0)) lo = c;
				if (state.cardsById[lo.id]) { const cp = instantiate(state.cardsById[lo.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
			}
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


register('copy-random-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nobleman: create a copy of a random card in your hand (Cloud Serpent: of a tribe, e.g. "Elemental|Dragon")
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && state.cardsById[c.id] && (!e.tribe || e.tribe.split('|').some(tr => (c.tribe || '').includes(tr))) && (!e.school || schoolOf(c) === e.school)); // Malevolent Mutant: a Fel spell
			if (pool.length && p.hand.length < MAX_HAND) { const src = pool[Math.floor(state.rng() * pool.length)]; const nc = instantiate(state.cardsById[src.id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
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


register('swap-random-hand-cards', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Theotar (approx): swap a random card between each player's hand
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const fp = state.players[foe]; const mine = p.hand.filter(c => c !== source); if (mine.length && fp.hand.length) { const mi = p.hand.indexOf(mine[Math.floor(state.rng() * mine.length)]); const fi = Math.floor(state.rng() * fp.hand.length); const myCard = p.hand[mi], foeCard = fp.hand[fi]; const toMe = instantiate(state.cardsById[foeCard.id] || foeCard, pi); toMe.zone = 'hand'; const toFoe = instantiate(state.cardsById[myCard.id] || myCard, foe); toFoe.zone = 'hand'; p.hand[mi] = toMe; fp.hand[fi] = toFoe; emit(state, { type: 'conjure', player: pi, card: toMe, color: null }); } }
} });


register('copy-random-enemy-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Incriminating Psychic: copy N random cards from the opponent's hand into yours
			// (Tricky Satyr: `lowest` copies their cheapest card instead)
			const foe = enemies[0], p = state.players[pi];
			if (foe != null) { const src = state.players[foe].hand.slice(); for (let n = 0; n < (e.count || 1) && src.length && p.hand.length < MAX_HAND; n++) { const i = e.lowest ? src.reduce((bi, c, ci) => ((c.cost || 0) < (src[bi].cost || 0) ? ci : bi), 0) : Math.floor(state.rng() * src.length); const [ec] = src.splice(i, 1); const def = state.cardsById[ec.id] || ec; const card = instantiate(def, pi); card.zone = 'hand'; card._copiedFromEnemy = true; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
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


register('drakkari-swap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Drakkari Trickster: each player gets a copy of a random card from their opponent's deck
			const o = enemies[0];
			if (o != null) {
				const p = state.players[pi], op = state.players[o];
				if (op.deck.length && p.hand.length < MAX_HAND) { const id = op.deck[Math.floor(state.rng() * op.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
				if (p.deck.length && op.hand.length < MAX_HAND) { const id = p.deck[Math.floor(state.rng() * p.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, o); c.zone = 'hand'; op.hand.push(c); emit(state, { type: 'conjure', player: o, card: c, color: null }); } }
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


register('become-copy-of-random-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shapeless Constellation: transform into a set-stat copy of a random minion in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length && source && source.zone === 'board' && !isDead(source)) { const pick = pool[Math.floor(state.rng() * pool.length)]; const base = state.cardsById[pick.id]; if (base) { const def = JSON.parse(JSON.stringify(base)); if (e.stats != null) { def.attack = e.stats; def.health = e.stats; } def.token = true; def.id = 'token_' + base.id; const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick; const board = p.board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); } }
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
			for (let _n = 0; _n < (e.count || 1); _n++)
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


register('transform-friendly-costplus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Boggspine Knuckles: transform every friendly minion into a random one costing (N) more
			const delta = e.costDelta || 1;
			const board = state.players[pi].board;
			for (const t of [...board]) {
				if (isDead(t) || t.type === 'location') continue;
				const want = (t.cost || 0) + delta;
				const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want
					&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== t.id);
				if (!pool.length) continue;
				const rd = pool[Math.floor(state.rng() * pool.length)];
				const tok = instantiate({ id: 'token_' + rd.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: rd.name, type: 'creature', cost: 0, rarity: 'common', token: true, description: `A ${rd.attack}/${rd.health} ${rd.name}.`, attack: rd.attack, health: rd.health, keywords: rd.keywords || [] }, pi);
				tok.zone = 'board'; tok.sick = t.sick;
				const idx = board.indexOf(t); if (idx >= 0) board[idx] = tok; t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: pi, from: t.name, card: tok });
			}
			recomputeAuras(state);
} });

register('transform-all-enemies-costplus', ({ state, pi, target, source, enemies }, e) => { {
			// Devolve: transform every ENEMY minion into a random one costing (N) less/more
			const delta = e.costDelta || -1;
			for (const o of enemies) {
				const board = state.players[o].board;
				for (const t of [...board]) {
					if (isDead(t) || t.type === 'location') continue;
					const want = Math.max(0, (t.cost || 0) + delta);
					const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want
						&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== t.id);
					if (!pool.length) continue;
					const rd = pool[Math.floor(state.rng() * pool.length)];
					const tok = instantiate({ id: 'token_' + rd.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: rd.name, type: 'creature', cost: rd.cost || 0, rarity: 'common', token: true, description: `A ${rd.attack}/${rd.health} ${rd.name}.`, attack: rd.attack, health: rd.health, keywords: rd.keywords || [], tribe: rd.tribe }, o);
					tok.zone = 'board'; tok.sick = t.sick;
					const idx = board.indexOf(t); if (idx >= 0) board[idx] = tok; t.zone = 'gone';
					emit(state, { type: 'transformed', uid: t.uid, player: o, from: t.name, card: tok });
				}
			}
			recomputeAuras(state);
} });

register('transform-all-into-random-tribe', ({ state, pi }, e) => { {
			// Plague of Murlocs: transform ALL minions (both sides) into random creatures of a tribe
			const pool0 = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes(e.tribe)
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (!pool0.length) return;
			for (let oi = 0; oi < state.players.length; oi++) {
				const board = state.players[oi].board;
				for (const t of [...board]) {
					if (isDead(t) || t.type === 'location') continue;
					const rd = pool0[Math.floor(state.rng() * pool0.length)];
					const tok = instantiate({ id: 'token_' + rd.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: rd.name, type: 'creature', cost: 0, rarity: 'common', token: true, description: `A ${rd.attack}/${rd.health} ${rd.name}.`, attack: rd.attack, health: rd.health, keywords: rd.keywords || [], tribe: rd.tribe }, oi);
					tok.zone = 'board'; tok.sick = t.sick;
					const idx = board.indexOf(t); if (idx >= 0) board[idx] = tok; t.zone = 'gone';
					emit(state, { type: 'transformed', uid: t.uid, player: oi, from: t.name, card: tok });
				}
			}
			recomputeAuras(state);
} });

register('copy-each-friendly-to-hand', ({ state, pi }) => { {
			// Echo of Medivh: put a copy of each friendly minion into your hand
			const p = state.players[pi];
			const minions = p.board.filter(c => !isDead(c) && c.type !== 'location');
			for (const t of minions) {
				if (p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[t.id] || { id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity, description: t.description, attack: t.attack, health: t.maxHealth, keywords: [...(t.keywords || [])], tribe: t.tribe };
				const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp);
				emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
} });


register('demonic-project', ({ state }) => { {
			// Demonic Project: each player transforms a random minion in their hand into a random Demon
			const demons = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Demon')
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (!demons.length) return;
			for (let oi = 0; oi < state.players.length; oi++) {
				const pl = state.players[oi];
				const hi = pl.hand.map((c, i) => [c, i]).filter(([c]) => c.type === 'creature');
				if (!hi.length) continue;
				const [, idx] = hi[Math.floor(state.rng() * hi.length)];
				const rd = demons[Math.floor(state.rng() * demons.length)];
				const cp = instantiate(rd, oi); cp.zone = 'hand';
				pl.hand[idx] = cp;
				emit(state, { type: 'transformed', player: oi, from: 'hand minion', card: cp });
			}
} });


register('destroy-summon-random-of-cost', ({ state, pi, chosenCreature }, e) => { {
			// Conjurer's Calling: destroy a minion, summon N minions of the same Cost to replace it
			const t = chosenCreature();
			if (!t) return;
			const cost = t.cost || 0, owner = t.controller;
			t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state);
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === cost
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (!pool.length) return;
			for (let k = 0; k < (e.count || 2); k++) summon(state, owner, pool[Math.floor(state.rng() * pool.length)]);
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
					} else opt = null; // nothing of the wanted Cost exists (e.g. Evolution off the top): fizzle
				}
				if (opt && opt.name != null) {
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
			}
} });


register('transform-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Puzzle Box: transform every creature into a random one costing (N) more.
			const targets = [];
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type === 'creature') targets.push(c);
			for (const t of targets) {
				if (isDead(t)) continue;
				const want = (t.cost || 0) + (e.costDelta || 0);
				const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
					&& (d.cost || 0) === want && !d.token && d.collectible !== false
					&& !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== t.id);
				if (!pool.length) continue; // nothing of the wanted Cost exists: this one fizzles
				const rd = pool[Math.floor(state.rng() * pool.length)];
				const tok = instantiate({
					id: 'token_' + rd.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: rd.name, type: 'creature', cost: 0, rarity: 'common', token: true,
					description: `A ${rd.attack}/${rd.health} ${rd.name}.`,
					attack: rd.attack, health: rd.health, keywords: rd.keywords || [],
				}, t.controller);
				tok.zone = 'board'; tok.sick = t.sick;
				const board = state.players[t.controller].board;
				board[board.indexOf(t)] = tok;
				t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: tok });
			}
			recomputeAuras(state);
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


register('discover', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// hero-power discovers took a dedicated guarded branch BEFORE the plain
	// one in the old chain; batch 19 briefly rerouted them here — restored:
	if (e.heroPower) {
			// Sir Finley: Discover a new Hero Power (replaces yours on pick)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'heropower' && d.power);
			const ids = [];
			for (let i = 0; i < 3 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			if (ids.length && !state.players[pi].eliminated) {
				state.pickQueue.push({ player: pi, ids, heroPower: true, discover: true });
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
				if (e.requireOverload && !((d.overload || 0) > 0)) return false; // Finders Keepers: a card with Overload
				if (e.chooseOne && !(Array.isArray(d.choices) && d.choices.length)) return false; // Worthy Expedition: a Choose One card
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
				// Staff of Trickery: "Reduce its Cost by your hero's Attack" — dynamic at Discover time
				const costMod = e.costModByHeroAttack ? -heroAttackValue(state, state.players[pi]) : (e.costMod || null);
				state.pickQueue.push({ player: pi, ids, discover: true, grant: e.grant || null, buff: e.buff || null, to: e.to || null, costMod, healByCost: e.healByCost || false, summonCopy: e.summonCopy || null, armorByCost: e.armorByCost || false, installSecret: e.installSecret || false, castRandom: e.castRandom || false, damageSelfByCost: e.damageSelfByCost || false, gainDeathrattleUid: e.gainDeathrattle && source ? source.uid : null, setAttack: e.setAttack ?? null, setHealth: e.setHealth ?? null, setCost: e.setCost ?? null, darkGift: e.darkGift || false, duplicate: e.duplicate || false, mode: (e.fromOwnDeck && e.drawPick) ? 'search' : undefined, shuffleOthers: e.shuffleOthers || false, toDeckBottomBuff: e.toDeckBottomBuff || null, gainStatsUid: (e.gainStats && source) ? source.uid : null, hataaru: e.hataaru || false, summonTwice: e.summonTwice || false, qonzu: e.qonzu || false, grantCastTwice: e.grantCastTwice || false, damageAllByCost: e.damageAllByCost || false });
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
			else if (e.cardType === 'secret') pool = pool.filter(d => d.type === 'secret' || !!d.secret); // Hunter's Pack: a random Secret
			if (e.minAttack != null) pool = pool.filter(d => (d.attack || 0) >= e.minAttack);
			if (e.requireKeyword) pool = pool.filter(d => (d.keywords || []).includes(e.requireKeyword)); // Whirlkick Master: a Combo card
			if (e.cost != null) pool = pool.filter(d => (d.cost || 0) === e.cost); // Ravencaller / Tanglefur Mystic
			if (e.maxCost != null) pool = pool.filter(d => (d.cost || 0) <= e.maxCost); // Carrier Whelp: a Dragon that costs (3) or less
			if (e.minCost != null) pool = pool.filter(d => (d.cost || 0) >= e.minCost); // Hexmarshal: a spell that costs (5) or more
			if (e.nameIncludes) pool = pool.filter(d => (d.name || '').includes(e.nameIncludes)); // Yrel: Librams
			if (e.school) pool = pool.filter(d => schoolOf(d) === e.school); // Galactic Crusader: Holy spells
			if (e.multiTribe) pool = pool.filter(d => d.type === 'creature' && (d.tribe || '').split('/').filter(Boolean).length >= 2); // Tortotem: a creature with multiple creature types
			if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
			if (e.rarity) pool = pool.filter(d => d.rarity === e.rarity); // Golden Monkey: Legendaries
			if (e.requireRewind) pool = pool.filter(d => d.rewind > 0); // Time Machine: a random Rewind card
			if (e.requireStarshipPiece) pool = pool.filter(d => d.starshipPiece); // Scrounging Shipwright
			if (e.requireColossal) pool = pool.filter(d => d.colossal); // Primordial Lord
			if (e.excludeColossal) pool = pool.filter(d => !d.colossal); // Nespirah, Unshackled: a non-Colossal Naga
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
					if (e.lockInHand) card._locked = true; // Low Security Wing: locked until you play another card
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


register('copy-played-with-stat', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Joymancer Jepetto: add copies of every minion you've played this game with 1 Attack or 1 Health
			const p = state.players[pi];
			const seen = new Set();
			for (const id of p.playedMinionLog || []) { if (seen.has(id)) continue; seen.add(id); const def = state.cardsById[id]; if (def && def.type === 'creature' && ((def.attack || 0) === 1 || (def.health || 0) === 1) && p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
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


