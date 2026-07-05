// ai.js — opponent for Magepunk Battlecards. Greedy but reasonable:
// coin when it unlocks a play, plays on-curve, removal at the biggest threat,
// trades favorably, honors taunt, otherwise goes face. Plays any seat in a
// free-for-all: harmful effects aim at the biggest threat across every
// opponent, face damage goes at the lowest-life hero.
import * as E from './engine.js';

function threatScore(c) {
	return c.attack * 2 + E.hp(c);
}

function creatureOf(state, t) {
	return state.players[t.player].board.find(c => c.uid === t.uid);
}

// lowest-life enemy hero target among the given hero targets
function weakestHero(state, heroTs) {
	return [...heroTs].sort((a, b) => state.players[a.player].life - state.players[b.player].life)[0] || null;
}

function pickTarget(state, pi, card) {
	const spec = E.targetSpec(state, pi, card);
	if (!spec) return null;
	const legal = E.legalTargets(state, pi, spec);
	if (!legal.length) return null;
	const enemyCreatures = legal.filter(t => t.type === 'creature' && t.player !== pi);
	const myCreatures = legal.filter(t => t.type === 'creature' && t.player === pi);
	const enemyHeroes = legal.filter(t => t.type === 'hero' && t.player !== pi);
	const byThreat = ts => [...ts].sort((a, b) => threatScore(creatureOf(state, b)) - threatScore(creatureOf(state, a)));

	switch (card.id) {
		case 'fireball': case 'lightning_bolt': case 'arcane_bolt': {
			const dmg = card.effects?.[0]?.value ?? 3;
			// lethal check on any enemy hero
			const lethal = enemyHeroes.find(t => state.players[t.player].life <= dmg);
			if (lethal) return lethal;
			// kill the biggest killable creature
			const killable = enemyCreatures.filter(t => E.hp(creatureOf(state, t)) <= dmg && !creatureOf(state, t).shield);
			if (killable.length) return byThreat(killable)[0];
			return weakestHero(state, enemyHeroes) || enemyCreatures[0] || legal[0];
		}
		case 'backstab': case 'contract_killer': case 'mark_target': case 'tumbleweed_tactician': {
			if (!enemyCreatures.length) return null;
			return byThreat(enemyCreatures)[0];
		}
		case 'fortify': {
			if (!myCreatures.length) return null;
			return [...myCreatures].sort((a, b) => creatureOf(state, b).attack - creatureOf(state, a).attack)[0];
		}
		default: {
			// generic effect-driven cards: aim helpful effects at ourselves,
			// harmful ones at the biggest enemy
			const first = card.effects?.find(e => CHOSEN_TYPES.has(e.type));
			if (first?.type === 'buff' || first?.type === 'grant') {
				if (!myCreatures.length) return null;
				return [...myCreatures].sort((a, b) => creatureOf(state, b).attack - creatureOf(state, a).attack)[0];
			}
			if (first?.type === 'heal') {
				const myHero = legal.find(t => t.type === 'hero' && t.player === pi);
				return myHero || myCreatures[0] || null;
			}
			if (first?.type === 'destroy' || first?.type === 'damage') {
				if (enemyCreatures.length) return byThreat(enemyCreatures)[0];
				return weakestHero(state, enemyHeroes) || legal[0];
			}
			// pure hero choices (e.g. "the enemy hero" with 3+ players)
			if (enemyHeroes.length && !enemyCreatures.length && !myCreatures.length) {
				return weakestHero(state, enemyHeroes);
			}
			return enemyCreatures[0] || legal[0];
		}
	}
}
const CHOSEN_TYPES = new Set(['damage', 'heal', 'buff', 'grant', 'destroy']);

function playableCards(state, pi) {
	const p = state.players[pi];
	return p.hand.filter(c => {
		if (!E.canPlay(state, pi, c)) return false;
		// don't waste targeted removal with no targets
		const spec = E.targetSpec(state, pi, c);
		if (spec && spec.required && !pickTarget(state, pi, c)) return false;
		// hold healing until it matters
		if ((c.id === 'healing_potion' || c.id === 'natures_blessing') && p.life > 25) return false;
		// don't replace a weapon that still has swings left
		if (c.type === 'weapon' && p.weapon && p.weapon.durability > 1) return false;
		// weapon buffs are dead cards without a weapon
		if (c.effects?.some(e => e.type === 'buff-weapon') && !p.weapon) return false;
		return true;
	});
}

// One AI action per call so the renderer can animate between steps.
// Returns true if it acted, false when it wants to end the turn.
export function step(state, pi = 1) {
	if (state.over || state.current !== pi || state.players[pi].eliminated) return false;
	const p = state.players[pi];

	// 1. play the most expensive playable card
	const playable = playableCards(state, pi);
	if (playable.length) {
		playable.sort((a, b) => b.cost - a.cost);
		const card = playable[0];
		const target = pickTarget(state, pi, card);
		if (E.playCard(state, pi, card.uid, target)) return true;
	}

	// 1b. coin if it unlocks the next play
	if (p.coins > 0) {
		const unlocks = p.hand.some(c => c.cost === E.availableMana(p) + 1);
		if (unlocks && E.useCoin(state, pi)) return true;
	}

	// 2. attack with each ready creature
	const attackers = E.attackersFor(state, pi);
	for (const a of attackers) {
		const targets = E.attackTargets(state, pi, a);
		if (!targets.length) continue;
		const heroTs = targets.filter(t => t.type === 'hero');
		const creatureTs = targets.filter(t => t.type === 'creature');

		// lethal: go face on any killable hero
		const lethal = heroTs.find(t => state.players[t.player].life <= a.attack);
		if (lethal && E.attack(state, pi, a.uid, lethal)) return true;

		// favorable trade: we kill it and survive (or kill something bigger than us)
		let best = null, bestScore = -1;
		for (const t of creatureTs) {
			const d = creatureOf(state, t);
			if (!d) continue;
			const kills = !d.shield && (a.attack >= E.hp(d) || E.has(a, E.KW.DEATHTOUCH));
			const survives = d.attack < E.hp(a) || a.shield;
			if (kills && survives) {
				const score = threatScore(d);
				if (score > bestScore) { bestScore = score; best = t; }
			}
		}
		// no hero is reachable (taunts everywhere): trade into the softest creature
		const mustTrade = !heroTs.length;
		if (!best && mustTrade && creatureTs.length) {
			best = [...creatureTs].sort((x, y) => E.hp(creatureOf(state, x)) - E.hp(creatureOf(state, y)))[0];
		}
		const target = best || weakestHero(state, heroTs);
		if (target && E.attack(state, pi, a.uid, target)) return true;
	}

	// 3. swing the weapon: lethal face, a good trade, or face
	if (E.canHeroAttack(state, pi)) {
		const w = p.weapon;
		const targets = E.heroAttackTargets(state, pi);
		const heroTs = targets.filter(t => t.type === 'hero');
		const creatureTs = targets.filter(t => t.type === 'creature');
		const lethal = heroTs.find(t => state.players[t.player].life <= w.attack);
		if (lethal && E.heroAttack(state, pi, lethal)) return true;
		// good trade: kill a creature whose counterattack won't hurt too much
		let best = null, bestScore = -1;
		for (const t of creatureTs) {
			const d = creatureOf(state, t);
			if (!d || d.shield || w.attack < E.hp(d)) continue;
			if (d.attack >= p.life - 5) continue; // never trade into near-death
			if (d.attack > 4 && p.life < 20) continue;
			const score = threatScore(d) - d.attack; // value gained minus face cost
			if (score > bestScore) { bestScore = score; best = t; }
		}
		const target = best || weakestHero(state, heroTs);
		if (target && E.heroAttack(state, pi, target)) return true;
	}

	return false; // nothing left to do
}
