// engine/effects/handlers-tombs.js — Tombs of Terror treasure effects.
// Imported for its registration side effects by index.js.
import { register } from './registry.js';
import {
	emit, instantiate, hp, isDead, opponentsOf, summon, recomputeAuras, sweepDeaths,
} from '../../engine.js';
import { gainArmor } from '../damage.js';

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
