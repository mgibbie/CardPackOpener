// engine/zones.js -- zone transitions (docs/engine-hardening/05, PR 10).
//
// drawCards / toGraveyard / bouncePermanent moved VERBATIM from engine.js
// (move-only; characterization suite tests/characterization/
// draw_pipeline_test.mjs pinned the pipeline BEFORE the move, per docs/09).
// The draw pipeline stacks every on-draw rider: fatigue, graveyard
// reshuffle, bombs, draw-trigger tokens, per-card deck riders, cast-when-
// drawn, copy-on-draw, and the Ponder/Emerge/card-drawn trigger hooks --
// rider hooks remain direct calls back into engine.js (same intentional
// call-time-safe cycle as cost.js / targeting.js).
//
// Also home to the NAMED deck ops (removeFromDeck / shuffleInto) that
// replace the ~40 inline splice/shuffle idioms; call sites migrate lazily,
// so both helpers consume rng()/mutate exactly like the idioms they replace.
import {
	emit, instantiate, damageHero, checkGameOver, execEffects, runSpell,
	sweepDeaths, questTick, fireOngoing, firePonder, fireEmerge,
	recomputeAuras, staticValue, isDead, isSpellType, schoolOf, targetSpec,
	legalTargets, MAX_HAND, KW, CTHUN_BASE,
} from '../engine.js';

// remove one copy of `id` from the deck (any position); returns true if found
export function removeFromDeck(deck, id) {
	const i = deck.indexOf(id);
	if (i < 0) return false;
	deck.splice(i, 1);
	return true;
}

// insert ids at uniformly random deck positions, one rng() call per id --
// identical to the engine's `deck.splice(floor(rng()*(len+1)), 0, id)` idiom
export function shuffleInto(state, deck, ids) {
	for (const id of ids) deck.splice(Math.floor(state.rng() * (deck.length + 1)), 0, id);
}

export function drawCards(state, pi, count) {
	const p = state.players[pi];
	let drawn = 0; // cards that actually reached hand (not fatigue/burn/bomb) — for "if you do"
	for (let i = 0; i < count; i++) {
		if (p.deck.length === 0 && p.graveyard.length > 0) {
			// reshuffle graveyard ids into deck (per BattleEngine.startPhase);
			// summoned tokens have no card def and can't be redrawn; token
			// CARDS (Bananas, Blood Tokens) cease to exist like MTG tokens
			p.deck = p.graveyard.map(c => c.id).filter(id => state.cardsById[id] && !state.cardsById[id].token);
			p.graveyard = [];
			for (let k = p.deck.length - 1; k > 0; k--) {
				const j = Math.floor(state.rng() * (k + 1));
				[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
			}
			if (p.deck.length) emit(state, { type: 'reshuffle', player: pi });
		}
		const id = p.deck.pop();
		if (!id && p.kiljaeden) {
			// Kil'jaeden: the portal never runs dry — a growing random Demon instead
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Demon') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			if (pool.length) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi);
				card.attack += p.kiljaeden.bonus; card.maxHealth += p.kiljaeden.bonus;
				card.zone = 'hand'; card.fromDeck = true; card.drawnThisTurn = true;
				p.hand.push(card);
				emit(state, { type: 'draw', player: pi, card });
			}
			continue;
		}
		if (!id) {
			// nothing to reshuffle either: truly out of cards — fatigue
			if (p.noFatigue) continue; // Elixir of Vim: Immune to Fatigue
			p.fatigue++;
			emit(state, { type: 'fatigue', player: pi, amount: p.fatigue });
			damageHero(state, pi, p.fatigue, pi);
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// Bomb / Mine: an enemy shuffled it in — it explodes on draw
		if (id === 'bomb' || id === 'mine') {
			emit(state, { type: 'bombDetonated', player: pi });
			damageHero(state, pi, id === 'mine' ? 10 : 5, pi); // Iron Juggernaut's Mine hits for 10
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// draw-trigger tokens (Fal'dorei Ambush, The Darkness's Candle): fire an
		// effect on draw and are consumed instead of entering the hand
		const trigDef = state.cardsById[id];
		if (trigDef && trigDef.drawTrigger) {
			emit(state, { type: 'drawTrigger', player: pi, cardId: id, name: trigDef.name });
			execEffects(state, pi, trigDef.onDraw || [], null, null);
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// A defless id (a dynamic token_* minted by become-copy effects that some
		// deck-return effect pushed by id) EVAPORATES instead of crashing the draw:
		// tokens cease to exist when they leave play, decks included.
		if (!state.cardsById[id]) { i--; continue; }
		// No burn on overdraw: hand may exceed MAX_HAND during your turn and is
		// trimmed back down at end of turn (MTG-style cleanup discard).
		const card = instantiate(state.cardsById[id], pi);
		card.fromDeck = true; // drawn from your deck — Leyline Manipulator ignores these
		card.drawnThisTurn = true; // Keli'dan the Breaker: "If drawn this turn"
		if (p.deckCostOverrides && p.deckCostOverrides[id] != null) { card.cost = p.deckCostOverrides[id]; delete p.deckCostOverrides[id]; } // Twilight Medium: top card's Cost set to (0)
		if (p.deckCostPersist && p.deckCostPersist[id] != null) card.cost = p.deckCostPersist[id]; // Elixir of Vigor: the copies cost (1)
		if (p.deckInnerFire && card.type === 'creature') card.attack = card.maxHealth; // Lady in White
		if (p.robesOfDiminishing && isSpellType(card)) { card.cost = 0; emit(state, { type: 'costChange', player: pi, uid: card.uid, cost: 0 }); } // Robes of Diminishing
		if (card.type === 'creature' && p.drawBuff) { card.attack += p.drawBuff.attack || 0; card.maxHealth += p.drawBuff.health || 0; }
		if (card.type === 'creature' && p.drawBuffMinions && p.drawBuffMinions.count > 0) { card.attack += p.drawBuffMinions.attack || 0; card.maxHealth += p.drawBuffMinions.health || 0; p.drawBuffMinions.count--; if (p.drawBuffMinions.count <= 0) p.drawBuffMinions = null; } // (legacy next-drawn buff)
		if (p.deckIdBuffs && p.deckIdBuffs.length) { const bi = p.deckIdBuffs.findIndex(b => b.id === id); if (bi >= 0) { const b = p.deckIdBuffs.splice(bi, 1)[0]; card.attack += b.attack || 0; card.maxHealth += b.health || 0; } } // Beanstalk Brute: specific deck cards carry buffs
		if (card.handDeckGrowAttack && p.defGrowth && p.defGrowth[id]) card.attack += p.defGrowth[id]; // Grazing Stegodon: grew while in your deck
		if (p.deckElementalSpellDamage && card.type === 'creature' && (card.tribe || '').includes('Elemental')) { // Saruun
			if (!card.static || card.static.type !== 'spell-damage') card.static = { type: 'spell-damage', value: 0 };
			card.static.value += p.deckElementalSpellDamage;
		}
		if (p.aegwynnPending && card.type === 'creature') { // Aegwynn: the powers pass on
			p.aegwynnPending = false;
			if (!card.static || card.static.type !== 'spell-damage') card.static = { type: 'spell-damage', value: 0 };
			card.static.value += 2;
			card.deathrattle = [...(card.deathrattle || []), { type: 'aegwynn-pass' }];
			if (!card.keywords.includes('deathrattle')) card.keywords.push('deathrattle');
		}
		if (card.type === 'creature' && p.drawBuffTribe) { for (const tr in p.drawBuffTribe) if ((card.tribe || '').includes(tr)) { card.attack += p.drawBuffTribe[tr].attack || 0; card.maxHealth += p.drawBuffTribe[tr].health || 0; } } // Shan'do Wildclaw
		if (p.corruptDeckDiscount && (card.corrupt || card.corruptGrow)) card.cost = Math.max(0, (card.cost || 0) - p.corruptDeckDiscount); // Dark Inquisitor Xanesh
		if (p.deckMinionDiscount && card.type === 'creature') card.cost = Math.max(0, (card.cost || 0) - p.deckMinionDiscount); // Vanndar / Cera'thine
		if (card.type === 'creature' && p.deckTribeDiscount) { for (const tr in p.deckTribeDiscount) if ((card.tribe || '').includes(tr)) card.cost = Math.max(0, (card.cost || 0) - p.deckTribeDiscount[tr]); } // Frizz Kindleroost
		if (p.deckKeywordDiscount) { for (const kw in p.deckKeywordDiscount) if ((card.keywords || []).includes(kw)) card.cost = Math.max(0, (card.cost || 0) - p.deckKeywordDiscount[kw]); } // Rotten Rodent: Deathrattle cards
		if (p.deckSchoolSpellDamage && isSpellType(card)) { const sch = schoolOf(card); if (sch && p.deckSchoolSpellDamage[sch]) card.bonusSpellDamage = (card.bonusSpellDamage || 0) + p.deckSchoolSpellDamage[sch]; } // Halduron Brightwing: Arcane spells drawn from deck
		if (p.deckSpellDamageAll && isSpellType(card)) card.bonusSpellDamage = (card.bonusSpellDamage || 0) + p.deckSpellDamageAll; // Archmage Kalec: all spells drawn
		if (p.deckDoubleStats && card.type === 'creature') { card.attack = (card.attack || 0) * 2; card.maxHealth = (card.maxHealth || 0) * 2; } // Lor'themar Theron: doubled deck minions
		// C'Thun enters hand carrying every buff it collected while in your deck
		if (card.id === 'c_thun') { card.attack = CTHUN_BASE + p.cthunAtk; card.maxHealth = CTHUN_BASE + p.cthunHp; if (p.cthunTaunt && !card.keywords.includes(KW.TAUNT)) card.keywords.push(KW.TAUNT); }
		card.zone = 'hand';
		if (state.hpResolver === pi && staticValue(p, 'hero-power-draw-zero') > 0) card.cost = 0; // Wilfred Fizzlebang
		if (!p.stealerUsedThisTurn && p.board.some(x => x.id === 'stealer_of_souls' && !isDead(x))) { card.cost = 0; p.stealerUsedThisTurn = true; } // Stealer of Souls (Health-cost approximated as free)
		if (p.nextDrawDiscount > 0) { card.cost = Math.max(0, (card.cost || 0) - p.nextDrawDiscount); p.nextDrawDiscount = 0; } // SI:7 Skulker
		if (p.drawPunishTurn === state.turnNumber && p.drawPunishDamage > 0) damageHero(state, pi, p.drawPunishDamage, null); // Ashen Elemental
		if (p.castWhenDrawn > 0 && isSpellType(card) && !card.counterSpell && !card.xSpell) { // Sheldras Moontree
			p.castWhenDrawn -= 1;
			const spec = targetSpec(state, pi, card, null); let tgt = null;
			if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; if (spec.required && !tgt) { p.hand.push(card); drawn++; continue; } }
			emit(state, { type: 'conjure', player: pi, card, color: null });
			runSpell(state, pi, card, tgt, card.choices ? 0 : null); sweepDeaths(state);
			drawn++; continue;
		}
		p.hand.push(card);
		if (card.copyOnDraw && state.cardsById[card.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[card.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } // Encumbered Pack Mule
		drawn++;
		emit(state, { type: 'draw', player: pi, card });
		state.expanseEvents = (state.expanseEvents || 0) + 1; // The Ceaseless Expanse: a card was drawn
		questTick(state, 'draw', pi, 1, card);
		// Ponder: fires on every card drawn after your first draw of the turn
		p.drawsThisTurn = (p.drawsThisTurn || 0) + 1;
		if (p.drawsThisTurn > 1) firePonder(state, pi, { drawn: card });
		fireEmerge(state, pi, card);
		// Chromaggus: "whenever you draw a card…" (guard against re-entrant copies)
		if (state.dealt && !state.drawTrigLock) {
			state.drawTrigLock = true;
			try { fireOngoing(state, pi, 'card-drawn', { card }); }
			finally { state.drawTrigLock = false; }
		}
		// opponents may react to your draw (Smothering Tithe: pay {2} or I get a Treasure)
		if (state.dealt && !state.enemyDrawLock) {
			state.enemyDrawLock = true;
			try { for (let s2 = 0; s2 < state.players.length; s2++) if (s2 !== pi && !state.players[s2].eliminated) fireOngoing(state, s2, 'enemy-draws', { drawer: pi, card }); }
			finally { state.enemyDrawLock = false; }
		}
	}
	return drawn;
}

export function toGraveyard(state, pi, card) {
	// Tokens (summoned creatures, Blood/Clue/Food/Treasure, etc.) are exiled
	// instead of hitting the graveyard — MTG-style, they leave no corpse and
	// can't be referenced, reanimated, or reshuffled from the grave. Coins are
	// NOT tokens, so they fall through to the graveyard and can reshuffle.
	if (card.token || (card.tribe || '').split(/\s+/).includes('Token')) {
		card.zone = 'exile';
		state.players[pi].exile.push(card);
		return;
	}
	state.players[pi].graveyard.push(card);
}

export function bouncePermanent(state, ownerPi, card, costMod = 0) {
	const owner = state.players[ownerPi];
	owner.board = owner.board.filter(c => c !== card);
	owner.artifacts = owner.artifacts.filter(c => c !== card);
	owner.enchantments = owner.enchantments.filter(c => c !== card);
	owner.planeswalkers = owner.planeswalkers.filter(c => c !== card);
	for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === card.uid) eq.attachedTo = null;
	if (!card.token) { // tokens cease to exist when they leave play
		const def = state.cardsById[card.id];
		if (def && owner.hand.length < MAX_HAND) {
			const c = instantiate(def, ownerPi);
			c.zone = 'hand';
			c.cost = Math.max(0, (def.cost || 0) + costMod);
			owner.hand.push(c);
		}
	}
	emit(state, { type: 'bounce', uid: card.uid, player: ownerPi, name: card.name });
	// Harbinger of the Blighted: returning to hand from play summons reinforcements
	if (!card.token && state.cardsById[card.id]?.bounceTrigger) {
		execEffects(state, ownerPi, JSON.parse(JSON.stringify(state.cardsById[card.id].bounceTrigger)), null, null);
	}
	recomputeAuras(state);
}
