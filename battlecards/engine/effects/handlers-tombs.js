// engine/effects/handlers-tombs.js — Tombs of Terror treasure effects.
// Imported for its registration side effects by index.js.
import { register } from './registry.js';
import {
	emit, instantiate, hp, isDead, opponentsOf, summon, recomputeAuras, sweepDeaths,
	MAX_HAND, breakWeapon,
} from '../../engine.js';
import { gainArmor } from '../damage.js';

register('add-random-treasure', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Flo Slatebrand / Uldum Treasure Cache: add N random Treasure cards to
	// your hand
	const p = state.players[pi];
	const pool = Object.values(state.cardsById).filter(d => d.treasure);
	for (let n = 0; n < (e.count || 1) && pool.length && p.hand.length < MAX_HAND; n++) {
		const d = pool[Math.floor(state.rng() * pool.length)];
		const c = instantiate(d, pi); c.zone = 'hand';
		p.hand.push(c);
		emit(state, { type: 'conjure', player: pi, card: c, color: null });
	}
} });

register('shuffle-enemy-board-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Addarah: shuffle every enemy creature into YOUR deck
	const p = state.players[pi];
	for (const o of enemies) {
		const op = state.players[o];
		for (const c of [...op.board]) {
			if (isDead(c) || c.type === 'location') continue;
			op.board = op.board.filter(x => x !== c);
			c.zone = 'gone';
			p.deck.push(c.id);
		}
	}
	for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
	emit(state, { type: 'shuffle', player: pi });
	recomputeAuras(state);
} });

register('return-weapon-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Blade of the Burning Sun deathrattle: the weapon card returns to hand
	const p = state.players[pi];
	if (source && state.cardsById[source.id] && p.hand.length < MAX_HAND) {
		const c = instantiate(state.cardsById[source.id], pi); c.zone = 'hand';
		p.hand.push(c);
		emit(state, { type: 'conjure', player: pi, card: c, color: null });
	}
} });

register('destroy-random-gain-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Titan-Forged Grapnel: destroy N random enemy creatures, gain Armor
	// equal to their combined Attack
	const pool = [];
	for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') pool.push(c);
	let armor = 0;
	for (let n = 0; n < (e.count || 2) && pool.length; n++) {
		const idx = Math.floor(state.rng() * pool.length);
		const c = pool.splice(idx, 1)[0];
		armor += c.attack || 0;
		c.damage = c.maxHealth; c.shield = false;
		emit(state, { type: 'destroy', uid: c.uid });
	}
	if (armor > 0) gainArmor(state, pi, armor);
	sweepDeaths(state);
} });

register('fill-board-copies-of-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Ancient Reflections: fill your board with set-stat copies of a chosen
	// creature (1/1 copies keep the id/keywords, lose the buffs)
	const t = chosenCreature();
	if (!t) return;
	const base = state.cardsById[t.id];
	const p = state.players[pi];
	const cap = 7;
	while (p.board.filter(c => !isDead(c) && c.type !== 'location').length < cap) {
		const cd = base ? JSON.parse(JSON.stringify(base)) : { id: t.id, name: t.name, type: 'creature', cost: t.cost || 0, rarity: 'common', keywords: [...(t.keywords || [])], tribe: t.tribe, description: t.description || '' };
		if (e.attack != null) cd.attack = e.attack;
		if (e.health != null) cd.health = e.health;
		if (!summon(state, pi, cd)) break;
	}
	recomputeAuras(state);
} });
