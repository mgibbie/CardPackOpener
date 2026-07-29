// engine/effects/handlers-heist.js — Dalaran Heist treasures & hero powers.
// Imported for its registration side effects by index.js.
import { register, registerTrigger, ABORT } from './registry.js';
import {
	emit, instantiate, MAX_HAND, execEffects, summon,
	damageHero, hp, isDead, opponentsOf, freezeCreature, KW,
	recomputeAuras, sweepDeaths, findCreature, isSpellType,
	targetSpec, legalTargets, runSpell, has,
} from '../../engine.js';
import { damageCreature } from '../damage.js';
import { drawCards } from '../zones.js';

register('extra-turns', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Continuum Collider: take an extra turn; your opponent takes an extra
	// turn after (turn order: you, you, them, them, then normal rotation)
	const o = enemies.length ? enemies[0] : null;
	const q = [pi];
	if (o != null) { q.push(o, o); }
	state.forcedTurns = [...(state.forcedTurns || []), ...q];
} });

register('shuffle-random-treasures', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Untold Splendor: shuffle N random treasures into your deck
	const p = state.players[pi];
	const pool = Object.values(state.cardsById).filter(d => d.treasure && d.id !== (source ? source.id : null));
	for (let n = 0; n < (e.count || 1) && pool.length; n++) {
		p.deck.push(pool[Math.floor(state.rng() * pool.length)].id);
	}
	for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
} });

const randomLegendary = (state) => {
	const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary'
		&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
	return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
};

register('replace-all-cards-random-legendaries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Golden Candle: replace ALL your other cards (hand + deck) with random
	// Legendary minions
	const p = state.players[pi];
	for (let i = 0; i < p.hand.length; i++) {
		if (source && p.hand[i].uid === source.uid) continue;
		const d = randomLegendary(state);
		if (d) { const c = instantiate(d, pi); c.zone = 'hand'; p.hand[i] = c; }
	}
	p.deck = p.deck.map(() => { const d = randomLegendary(state); return d ? d.id : null; }).filter(Boolean);
	emit(state, { type: 'handDeckReplaced', player: pi });
} });

register('transform-board-random-legendaries', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Swampqueen's Call: transform your minions into random REAL Legendary
	// minions (full defs, unlike the vanilla-token `transform` effect)
	const p = state.players[pi];
	for (let i = 0; i < p.board.length; i++) {
		const c = p.board[i];
		if (isDead(c) || c.type === 'location') continue;
		const d = randomLegendary(state);
		if (!d) break;
		const tok = instantiate(d, pi);
		tok.zone = 'board'; tok.sick = c.sick;
		p.board[i] = tok;
		emit(state, { type: 'transformed', uid: c.uid, player: pi, name: tok.name, card: tok });
	}
	recomputeAuras(state);
} });

register('deck-minions-become-copies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Duplatransmogrifier: choose a friendly minion; every minion in your
	// deck becomes a copy of it (id-based decks: swap the ids)
	const t = chosenCreature();
	if (t && state.cardsById[t.id]) {
		const p = state.players[pi];
		p.deck = p.deck.map(id => (state.cardsById[id]?.type === 'creature' ? t.id : id));
		emit(state, { type: 'deckTransformed', player: pi, name: t.name });
	}
} });

register('buff-deck-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Sow the Seeds: give all minions currently in your deck +A/+H (one
	// deckIdBuffs entry per deck card; each is consumed by one draw)
	const p = state.players[pi];
	for (const id of p.deck) {
		if (state.cardsById[id]?.type === 'creature') {
			(p.deckIdBuffs = p.deckIdBuffs || []).push({ id, attack: e.attack || 0, health: e.health || 0 });
		}
	}
} });

register('steal-random-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Dagwik Stickytoe: take a random card from an opponent's hand
	const p = state.players[pi];
	for (const o of enemies) {
		const oh = state.players[o].hand;
		if (!oh.length || p.hand.length >= MAX_HAND) continue;
		const idx = Math.floor(state.rng() * oh.length);
		const [c] = oh.splice(idx, 1);
		c.controller = pi;
		p.hand.push(c);
		emit(state, { type: 'cardStolen', player: pi, from: o, name: c.name });
		break;
	}
} });

register('frostburn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Frostburn hero power: Freeze a creature; if it's already Frozen,
	// deal 2 damage instead (heroes can't be Frozen in Battlecards)
	const t = chosenCreature();
	if (t) {
		if (t.frozen) { damageCreature(state, t, e.value || 2, source); sweepDeaths(state); }
		else freezeCreature(state, t);
	}
} });

register('delay-to-turn-start', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Big Boomba round two: run effects at the start of this player's next turn
	const p = state.players[pi];
	(p.turnStartEffects = p.turnStartEffects || []).push(JSON.parse(JSON.stringify(e.effects || [])));
} });

register('master-scheme', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Master Scheme: Deal N damage (random enemy). Draw N. Gain N Armor.
	// Summon N Boom Bots. N = turns held (schemeGrow tick).
	const n = Math.max(1, source?._schemeLevel || 1);
	const p = state.players[pi];
	for (let i = 0; i < n; i++) {
		const pool = [];
		for (const o of enemies) pool.push(...state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
		if (pool.length) damageCreature(state, pool[Math.floor(state.rng() * pool.length)], 1, source);
		else { const f = enemyHero(); if (f != null) damageHero(state, f, 1, pi); }
	}
	drawCards(state, pi, n);
	p.armor += n;
	emit(state, { type: 'armor', player: pi, armor: p.armor });
	for (let i = 0; i < n; i++) if (state.cardsById['boom_bot']) summon(state, pi, state.cardsById['boom_bot']);
	sweepDeaths(state);
} });

register('summon-reaped', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Soulreaper's Scythe deathrattle: summon every minion this weapon killed
	// (kill ids logged on the weapon instance by heroAttack)
	for (const id of (source && source._reaped) || []) {
		if (state.cardsById[id]) summon(state, pi, state.cardsById[id]);
	}
} });

register('recast-spells-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
	// Elistra the Immortal: recast every spell you've played this game
	// (targets chosen randomly; reentrancy-guarded like cast-random-spell)
	if (state._chaosLock) continue;
	state._chaosLock = true;
	try {
		const plays = [];
		for (const [id, k] of Object.entries(state.players[pi].playedCountById || {})) {
			const d = state.cardsById[id];
			if (d && isSpellType(d) && !d.choices && !d.xSpell && !d.counterSpell) for (let i = 0; i < k; i++) plays.push(d);
		}
		for (const d of plays) {
			if (state.over) break;
			const spell = instantiate(d, pi);
			const spec = targetSpec(state, pi, spell, null);
			let tgt = null;
			if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) continue; }
			emit(state, { type: 'conjure', player: pi, card: spell, color: null });
			runSpell(state, pi, spell, tgt, null);
			sweepDeaths(state);
		}
	} finally { state._chaosLock = false; }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('overpowered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Overpowered: after you play a card this turn, replay a copy of it
	// (consumed by the playCard hook; reset at end of turn)
	state.players[pi].overpoweredTurn = state.turnNumber;
} });
