// engine/effects/handlers-tombs.js — Tombs of Terror treasure effects.
// Imported for its registration side effects by index.js.
import { register } from './registry.js';
import {
	emit, instantiate, hp, isDead, opponentsOf, summon, recomputeAuras, sweepDeaths,
	MAX_HAND, breakWeapon, isSpellType, targetSpec, legalTargets, runSpell,
	addManaCrystal,
} from '../../engine.js';
import { gainArmor } from '../damage.js';

register('transform-all-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Scales of Justice: turn every creature on both boards into a vanilla token
	const tok = { name: e.name || 'Murloc', attack: e.attack ?? 1, health: e.health ?? 1, tribe: e.tribe || 'Murloc', keywords: e.keywords || [] };
	for (const pl of state.players) {
		for (let i = 0; i < pl.board.length; i++) {
			const c = pl.board[i];
			if (isDead(c) || c.type === 'location') continue;
			const nt = instantiate({ id: 'token_' + tok.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: tok.name, type: 'creature', cost: 1, rarity: 'common', token: true, description: `A ${tok.attack}/${tok.health} ${tok.name}.`, attack: tok.attack, health: tok.health, tribe: tok.tribe, keywords: [...tok.keywords] }, pl === state.players[pi] ? pi : (pl.__pi ?? state.players.indexOf(pl)));
			nt.zone = 'board'; nt.sick = c.sick;
			pl.board[i] = nt;
			emit(state, { type: 'transformed', uid: c.uid, player: state.players.indexOf(pl), name: nt.name, card: nt });
		}
	}
	recomputeAuras(state);
} });

register('cast-deck-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Advanced Targeting Monocle: cast a copy of every spell in your deck with
	// random targets (reentrancy-guarded)
	if (state._deckCastLock) return;
	state._deckCastLock = true;
	try {
		const p = state.players[pi];
		const spellIds = p.deck.filter(id => { const d = state.cardsById[id]; return d && isSpellType(d) && !d.choices && !d.xSpell && !d.counterSpell; });
		for (const id of spellIds) {
			if (state.over) break;
			const spell = instantiate(state.cardsById[id], pi);
			const spec = targetSpec(state, pi, spell, null);
			let tgt = null;
			if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) continue; }
			emit(state, { type: 'conjure', player: pi, card: spell, color: null });
			runSpell(state, pi, spell, tgt, null);
			sweepDeaths(state);
		}
	} finally { state._deckCastLock = false; }
} });

register('reduce-deck-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Pack Mule / Upgraded Pack Mule: every card in your deck costs (value) less
	const p = state.players[pi];
	p.deckCostPersist = p.deckCostPersist || {};
	for (const id of p.deck) { const d = state.cardsById[id]; if (d) p.deckCostPersist[id] = Math.max(0, (p.deckCostPersist[id] ?? (d.cost || 0)) - (e.value || 1)); }
} });

register('remove-cheap-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Do the Math: remove every card in your deck costing (value) or less
	const p = state.players[pi];
	const cap = e.value ?? 2;
	p.deck = p.deck.filter(id => { const d = state.cardsById[id]; return !d || (d.cost || 0) > cap; });
	emit(state, { type: 'shuffle', player: pi });
} });

register('add-mana-crystal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Academic Research / Tea Time: gain permanent Mana Crystals
	addManaCrystal(state, pi, e.value || 1);
} });

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
