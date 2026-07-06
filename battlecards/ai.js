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
			if (FRIENDLY_TYPES.has(first?.type)) {
				if (first.type === 'heal-full') {
					// most-damaged friendly creature, or nothing
					const hurt = myCreatures.filter(t => creatureOf(state, t).damage > 0);
					if (!hurt.length) return null;
					return [...hurt].sort((a, b) => creatureOf(state, b).damage - creatureOf(state, a).damage)[0];
				}
				if (!myCreatures.length) return null;
				if (first.type === 'attack-equals-health' || first.type === 'double-attack') {
					// biggest health-over-attack gap pays off most
					return [...myCreatures].sort((a, b) =>
						(E.hp(creatureOf(state, b)) - creatureOf(state, b).attack) - (E.hp(creatureOf(state, a)) - creatureOf(state, a).attack))[0];
				}
				return [...myCreatures].sort((a, b) => creatureOf(state, b).attack - creatureOf(state, a).attack)[0];
			}
			if (first?.type === 'heal') {
				const myHero = legal.find(t => t.type === 'hero' && t.player === pi);
				return myHero || myCreatures[0] || null;
			}
			if (HOSTILE_TYPES.has(first?.type)) {
				if (enemyCreatures.length) return byThreat(enemyCreatures)[0];
				if (first.type === 'damage' || first.type === 'destroy') return weakestHero(state, enemyHeroes) || legal[0];
				return null; // debuffs/steals are wasted without an enemy creature
			}
			// pure hero choices (e.g. "the enemy hero" with 3+ players)
			if (enemyHeroes.length && !enemyCreatures.length && !myCreatures.length) {
				return weakestHero(state, enemyHeroes);
			}
			return enemyCreatures[0] || legal[0];
		}
	}
}
const FRIENDLY_TYPES = new Set(['buff', 'grant', 'temp-buff', 'heal-full', 'attack-equals-health', 'double-health', 'double-attack', 'grant-ongoing']);
const HOSTILE_TYPES = new Set(['damage', 'destroy', 'exile', 'set-health', 'set-attack', 'bounce', 'mind-control', 'transform', 'transform-copy']);
const CHOSEN_TYPES = new Set([...FRIENDLY_TYPES, ...HOSTILE_TYPES, 'heal']);

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

	// -1. resolve any pending scry/gaze this seat owes a decision on:
	// keep own affordable cards, bury the enemy's best
	if (state.scryQueue.length && state.scryQueue[0].chooser === pi) {
		const pend = state.scryQueue[0];
		const picks = pend.ids.map(id => {
			const cost = state.cardsById[id]?.cost || 0;
			const bottom = pend.deckOwner === pi ? cost > p.mana.max + 2 : cost >= 4;
			return { id, bottom };
		});
		E.resolveScry(state, picks);
		return true;
	}

	// -1b. unmask disguised creatures worth their cost
	for (const c of p.board) {
		if (c.disguised && E.canUnmask(state, pi, c)
			&& c.disguised.attack + c.disguised.maxHealth > 5) {
			if (E.unmask(state, pi, c.uid)) return true;
		}
	}

	// 0. work the lands: tap for mana first, conjure when hand runs dry,
	// boost a random friendly otherwise
	for (const l of p.lands) {
		if (!E.canTapLand(state, pi, l)) continue;
		const taps = E.landTaps(l);
		let idx = taps.findIndex(t => t.effects.some(e => e.type === 'gain-mana'));
		if (idx < 0 && p.hand.length < 4) idx = taps.findIndex(t => t.effects.some(e => e.type === 'conjure'));
		if (idx < 0 && p.board.length) idx = taps.findIndex(t => t.effects.some(e => e.type === 'boost'));
		if (idx < 0) continue;
		const spec = E.tapSpec(state, pi, l, idx);
		let target = null;
		if (spec) {
			const legal = E.legalTargets(state, pi, spec);
			if (!legal.length) continue;
			target = legal[Math.floor(Math.random() * legal.length)];
		}
		if (E.tapLand(state, pi, l.uid, idx, target)) return true;
	}
	// 0b. develop a land when flush enough that it doesn't cost the turn
	if (E.canBuyLand(state, pi) && E.availableMana(p) >= E.LAND_COST + 3 && p.lands.length < 3) {
		const pool = E.landPool(state);
		if (pool.length && E.buyLand(state, pi, pool[Math.floor(Math.random() * pool.length)].id)) return true;
	}

	// 1. play the most expensive playable card
	const playable = playableCards(state, pi);
	if (playable.length) {
		playable.sort((a, b) => b.cost - a.cost);
		const card = playable[0];
		let choice = null, target = null;
		if (card.choices) {
			// take the first branch that's targetless or has a live target
			for (let i = 0; i < card.choices.length; i++) {
				const spec = E.targetSpec(state, pi, card, i);
				if (!spec) { choice = i; break; }
				const t2 = pickTarget(state, pi, { id: card.id, type: 'sorcery', effects: card.choices[i].effects });
				if (t2) { choice = i; target = t2; break; }
			}
			if (choice == null) choice = 0;
		} else {
			target = pickTarget(state, pi, card);
		}
		if (E.playCard(state, pi, card.uid, target, choice)) return true;
	}

	// 1a'. companion and commander come off their zones like extra hand cards
	for (const c of [p.companion, ...p.command].filter(Boolean)) {
		if (!E.canPlay(state, pi, c)) continue;
		const spec = E.targetSpec(state, pi, c);
		let target = null;
		if (spec) {
			target = pickTarget(state, pi, c);
			if (spec.required && !target) continue;
		}
		if (E.playCard(state, pi, c.uid, target)) return true;
	}

	// 1b. coin if it unlocks the next play
	if (p.coins > 0) {
		const unlocks = p.hand.some(c => c.cost === E.availableMana(p) + 1);
		if (unlocks && E.useCoin(state, pi)) return true;
	}

	// 1c. activate an installed hero power with leftover mana
	for (const hpw of p.heroPowers) {
		if (!E.canUseHeroPower(state, pi, hpw)) continue;
		let choice = null;
		let fx = hpw.power.effects;
		if (hpw.power.choices) {
			// take the first branch that's targetless or has a live target
			for (let i = 0; i < hpw.power.choices.length; i++) {
				const spec2 = E.heroPowerSpec(state, pi, hpw, i);
				const bfx = hpw.power.choices[i].effects;
				if (!spec2) { choice = i; fx = bfx; break; }
				if (pickTarget(state, pi, { id: hpw.id, type: 'sorcery', effects: bfx })) { choice = i; fx = bfx; break; }
			}
			if (choice == null) continue;
		}
		// don't waste pure healing at high life
		if (fx.every(e => e.type === 'heal') && p.life > 30) continue;
		const spec = E.heroPowerSpec(state, pi, hpw, choice);
		let target = null;
		if (spec) {
			target = pickTarget(state, pi, { id: hpw.id, type: 'sorcery', effects: fx });
			if (spec.required && !target) continue;
		}
		if (E.useHeroPower(state, pi, hpw.uid, target, choice)) return true;
	}

	// 1d. planeswalkers: cash in the minus ability when affordable, else tick up
	for (const pw of p.planeswalkers) {
		if (!E.canUseWalker(state, pi, pw)) continue;
		const idxMinus = pw.abilities.findIndex(a => a.cost < 0);
		const idxPlus = pw.abilities.findIndex(a => a.cost >= 0);
		let idx = (idxMinus >= 0 && E.canUseWalker(state, pi, pw, idxMinus)) ? idxMinus : idxPlus;
		if (idx < 0 || !E.canUseWalker(state, pi, pw, idx)) continue;
		const spec = E.walkerSpec(state, pi, pw, idx);
		let target = null;
		if (spec) {
			target = pickTarget(state, pi, { id: pw.id, type: 'sorcery', effects: pw.abilities[idx].effects });
			if (spec.required && !target) continue;
		}
		if (E.useWalker(state, pi, pw.uid, idx, target)) return true;
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
		// enemy planeswalkers generate value every turn: put them down next
		if (!best) {
			const walkerTs = targets.filter(t => t.type === 'walker');
			const loyaltyOf = t => state.players[t.player].planeswalkers.find(w => w.uid === t.uid)?.loyalty ?? 99;
			best = walkerTs.sort((x, y) => loyaltyOf(x) - loyaltyOf(y))[0] || null;
		}
		const target = best || weakestHero(state, heroTs);
		if (target && E.attack(state, pi, a.uid, target)) return true;
	}

	// 3. swing the hero: lethal face, a good trade, or face (weapon or temp attack)
	if (E.canHeroAttack(state, pi)) {
		const av = E.heroAttackValue(p);
		const targets = E.heroAttackTargets(state, pi);
		const heroTs = targets.filter(t => t.type === 'hero');
		const creatureTs = targets.filter(t => t.type === 'creature');
		const lethal = heroTs.find(t => state.players[t.player].life <= av);
		if (lethal && E.heroAttack(state, pi, lethal)) return true;
		// good trade: kill a creature whose counterattack won't hurt too much
		let best = null, bestScore = -1;
		for (const t of creatureTs) {
			const d = creatureOf(state, t);
			if (!d || d.shield || av < E.hp(d)) continue;
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
