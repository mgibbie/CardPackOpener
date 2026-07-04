// ai.js — opponent for Magepunk Battlecards. Greedy but reasonable:
// coin when it unlocks a play, plays on-curve, removal at the biggest threat,
// trades favorably, honors taunt, otherwise goes face.
import * as E from './engine.js';

const PI = 1; // AI is always player 2

function biggestThreat(board) {
	return [...board].sort((a, b) => (b.attack * 2 + E.hp(b)) - (a.attack * 2 + E.hp(a)))[0] || null;
}

function pickTarget(state, card) {
	const spec = E.targetSpec(state, PI, card);
	if (!spec) return null;
	const legal = E.legalTargets(state, PI, spec);
	if (!legal.length) return null;
	const enemyCreatures = legal.filter(t => t.type === 'creature' && t.player === 0);
	const myCreatures = legal.filter(t => t.type === 'creature' && t.player === PI);
	const enemyHero = legal.find(t => t.type === 'hero' && t.player === 0);

	const creatureOf = t => state.players[t.player].board.find(c => c.uid === t.uid);

	switch (card.id) {
		case 'fireball': case 'lightning_bolt': case 'arcane_bolt': {
			const dmg = card.effects?.[0]?.value ?? 3;
			// lethal check
			if (state.players[0].life <= dmg && enemyHero) return enemyHero;
			// kill the biggest killable creature
			const killable = enemyCreatures.filter(t => E.hp(creatureOf(t)) <= dmg && !creatureOf(t).shield);
			if (killable.length) {
				killable.sort((a, b) => creatureOf(b).attack - creatureOf(a).attack);
				return killable[0];
			}
			return enemyHero || enemyCreatures[0] || legal[0];
		}
		case 'backstab': case 'contract_killer': case 'mark_target': case 'tumbleweed_tactician': {
			if (!enemyCreatures.length) return null;
			enemyCreatures.sort((a, b) => {
				const ca = creatureOf(a), cb = creatureOf(b);
				return (cb.attack * 2 + E.hp(cb)) - (ca.attack * 2 + E.hp(ca));
			});
			return enemyCreatures[0];
		}
		case 'fortify': {
			if (!myCreatures.length) return null;
			myCreatures.sort((a, b) => creatureOf(b).attack - creatureOf(a).attack);
			return myCreatures[0];
		}
		default: {
			// generic effect-driven cards: aim helpful effects at ourselves,
			// harmful ones at the biggest enemy
			const first = card.effects?.find(e => CHOSEN_TYPES.has(e.type));
			if (first?.type === 'buff' || first?.type === 'grant') {
				if (!myCreatures.length) return null;
				myCreatures.sort((a, b) => creatureOf(b).attack - creatureOf(a).attack);
				return myCreatures[0];
			}
			if (first?.type === 'heal') {
				const myHero = legal.find(t => t.type === 'hero' && t.player === PI);
				return myHero || myCreatures[0] || null;
			}
			if (first?.type === 'destroy' || first?.type === 'damage') {
				if (enemyCreatures.length) {
					enemyCreatures.sort((a, b) => {
						const ca = creatureOf(a), cb = creatureOf(b);
						return (cb.attack * 2 + E.hp(cb)) - (ca.attack * 2 + E.hp(ca));
					});
					return enemyCreatures[0];
				}
				return enemyHero || legal[0];
			}
			return enemyCreatures[0] || legal[0];
		}
	}
}
const CHOSEN_TYPES = new Set(['damage', 'heal', 'buff', 'grant', 'destroy']);

function playableCards(state) {
	const p = state.players[PI];
	return p.hand.filter(c => {
		if (!E.canPlay(state, PI, c)) return false;
		// don't waste targeted removal with no targets
		const spec = E.targetSpec(state, PI, c);
		if (spec && spec.required && !pickTarget(state, c)) return false;
		// hold healing until it matters
		if ((c.id === 'healing_potion' || c.id === 'natures_blessing') && p.life > 25) return false;
		return true;
	});
}

// One AI action per call so the renderer can animate between steps.
// Returns true if it acted, false when it wants to end the turn.
export function step(state) {
	if (state.over || state.current !== PI) return false;
	const p = state.players[PI];

	// 1. play the most expensive playable card
	const playable = playableCards(state);
	if (playable.length) {
		playable.sort((a, b) => b.cost - a.cost);
		const card = playable[0];
		const target = pickTarget(state, card);
		if (E.playCard(state, PI, card.uid, target)) return true;
	}

	// 1b. coin if it unlocks the next play
	if (p.coins > 0) {
		const unlocks = p.hand.some(c => c.cost === E.availableMana(p) + 1 &&
			(c.type !== 'creature' || p.board.length < E.MAX_BOARD));
		if (unlocks && E.useCoin(state, PI)) return true;
	}

	// 2. attack with each ready creature
	const attackers = E.attackersFor(state, PI);
	for (const a of attackers) {
		const targets = E.attackTargets(state, PI, a);
		if (!targets.length) continue;
		const heroT = targets.find(t => t.type === 'hero');
		const creatureTs = targets.filter(t => t.type === 'creature');
		const creatureOf = t => state.players[0].board.find(c => c.uid === t.uid);

		// lethal: go face
		if (heroT && state.players[0].life <= a.attack) {
			if (E.attack(state, PI, a.uid, heroT)) return true;
		}
		// favorable trade: we kill it and survive (or kill something bigger than us)
		let best = null, bestScore = -1;
		for (const t of creatureTs) {
			const d = creatureOf(t);
			if (!d) continue;
			const kills = !d.shield && (a.attack >= E.hp(d) || E.has(a, E.KW.DEATHTOUCH));
			const survives = d.attack < E.hp(a) || a.shield;
			if (kills && survives) {
				const score = d.attack * 2 + E.hp(d);
				if (score > bestScore) { bestScore = score; best = t; }
			}
		}
		// must attack a taunt even without a favorable trade
		const mustTrade = !heroT;
		if (!best && mustTrade && creatureTs.length) {
			creatureTs.sort((x, y) => E.hp(creatureOf(x)) - E.hp(creatureOf(y)));
			best = creatureTs[0];
		}
		const target = best || heroT;
		if (target && E.attack(state, PI, a.uid, target)) return true;
	}

	return false; // nothing left to do
}
