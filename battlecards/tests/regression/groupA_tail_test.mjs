// Group A tail — three formerly-vanilla stat-sticks made faithful:
//   Wallow, the Wretched   — held/decked, copies every Dark Gift given to your minions
//   Twisted Monstrosity    — each turn in hand, swaps between two random Bonus Effects
//   Stalwart Avenger       — Immune while attacking; end of EACH turn swaps Atk/Health
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 3) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warlock', name: 'W', power: null }, { id: 'warrior', name: 'R', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 20; st.players[0].mana.cur = 20; st.players[1].mana.max = 20; st.players[1].mana.cur = 20;
	return st;
};
const put = (st, pi, id, zone = 'hand') => { const c = E.instantiate(cardsById[id], pi); c.zone = zone; st.players[pi][zone === 'board' ? 'board' : 'hand'].push(c); if (zone === 'board') { c.summonedThisTurn = false; c.sick = false; c.attacksUsed = 0; } return c; };

// ---------- data wiring ----------
ok('Wallow: 6/6 Ancient, accrueDarkGifts', cardsById['wallow_the_wretched'].accrueDarkGifts && cardsById['wallow_the_wretched'].tribe === 'Ancient' && cardsById['wallow_the_wretched'].attack === 6);
ok('Twisted: 6/5 Beast, Elusive+Taunt, bonusEffectSwap', cardsById['twisted_monstrosity'].bonusEffectSwap && cardsById['twisted_monstrosity'].keywords.join() === 'elusive,taunt');
ok('Stalwart: 7/2 Draenei, swapStatsEndOfTurn + immuneWhileAttacking', cardsById['stalwart_avenger'].swapStatsEndOfTurn && cardsById['stalwart_avenger'].immuneWhileAttacking && cardsById['stalwart_avenger'].attack === 7 && cardsById['stalwart_avenger'].health === 2);

// ---------- Wallow: gains a copy of Dark Gifts given to your minions (in hand) ----------
{
	const st = game();
	const w = put(st, 0, 'wallow_the_wretched'); // held
	const a0 = w.attack, h0 = E.hp(w);
	const dummy = put(st, 0, 'stalwart_avenger', 'board'); // any friendly minion
	// grant a concrete +3/+3 Dark Gift to your minion
	E.applyGift(st, dummy, E.DARK_GIFTS.find(g => g.label === '+3/+3'), { board: true });
	ok('Wallow in hand gains the +3/+3 gift too', w.attack === a0 + 3 && E.hp(w) === h0 + 3, [w.attack, E.hp(w)]);
	// a gift to the OPPONENT's minion is not copied
	const foe = put(st, 1, 'stalwart_avenger', 'board');
	E.applyGift(st, foe, E.DARK_GIFTS.find(g => g.label === '+3/+3'), { board: true });
	ok('Wallow ignores gifts given to the OPPONENT\'s minions', w.attack === a0 + 3, w.attack);
	// a keyword gift is copied as a keyword
	E.applyGift(st, dummy, E.DARK_GIFTS.find(g => g.label === 'Taunt'), { board: true });
	ok('Wallow copies keyword gifts (Taunt)', w.keywords.includes('taunt'));
}

// ---------- Wallow: replays gifts accrued while sitting in the DECK ----------
{
	const st = game();
	st.players[0].deck = ['wallow_the_wretched']; // decked
	const dummy = put(st, 0, 'stalwart_avenger', 'board');
	E.applyGift(st, dummy, E.DARK_GIFTS.find(g => g.label === '+3/+3'), { board: true });
	E.applyGift(st, dummy, E.DARK_GIFTS.find(g => g.label === 'Taunt'), { board: true });
	E.drawCards(st, 0, 1); // draw Wallow
	const w = st.players[0].hand.find(c => c.id === 'wallow_the_wretched');
	ok('drawn Wallow carries every gift accrued in the deck (9/9 Taunt)', w && w.attack === 9 && E.hp(w) === 9 && w.keywords.includes('taunt'), w && [w.attack, E.hp(w)]);
}

// ---------- Twisted Monstrosity: alternates between two Bonus Effects each turn in hand ----------
{
	const st = game(7);
	const t = put(st, 0, 'twisted_monstrosity');
	E.endTurn(st); E.endTurn(st); // back to p0's turn -> two Bonus Effects chosen, the first applied
	ok('picked two DISTINCT Bonus Effects', t._bonusPair && t._bonusPair.length === 2 && t._bonusPair[0].label !== t._bonusPair[1].label, t._bonusPair);
	const labelA = t._darkGift, snapA = { a: t.attack, h: E.hp(t), kw: [...t.keywords] };
	ok('the first Bonus Effect is live', labelA === t._bonusPair[0].label && t._bonusActive === 0, labelA);
	ok('keeps its base Elusive + Taunt through the swap', t.keywords.includes('elusive') && t.keywords.includes('taunt'));
	E.endTurn(st); E.endTurn(st); // next turn -> the OTHER Bonus Effect
	ok('next turn: swapped to the second Bonus Effect', t._darkGift === t._bonusPair[1].label && t._bonusActive === 1, t._darkGift);
	E.endTurn(st); E.endTurn(st); // and back to the first
	ok('swaps back to the first (no runaway accumulation)', t._darkGift === labelA && t.attack === snapA.a && E.hp(t) === snapA.h && t.keywords.join() === snapA.kw.join(), [labelA, snapA, { a: t.attack, h: E.hp(t) }]);
}

// ---------- Stalwart Avenger: end of EACH turn, swap Attack/Health ----------
{
	const st = game();
	const s = put(st, 0, 'stalwart_avenger', 'board'); // 7/2
	ok('starts 7/2', s.attack === 7 && E.hp(s) === 2);
	E.endTurn(st); // end of p0's turn -> swap -> 2/7
	ok('after your turn ends: swapped to 2/7', s.attack === 2 && E.hp(s) === 7, [s.attack, E.hp(s)]);
	E.endTurn(st); // end of p1's turn -> swaps again (EACH turn) -> 7/2
	ok('swaps at end of the OPPONENT\'s turn too (EACH turn) -> 7/2', s.attack === 7 && E.hp(s) === 2, [s.attack, E.hp(s)]);
}

// ---------- Stalwart Avenger: Immune while attacking (no retaliation) ----------
{
	const st = game();
	const s = put(st, 0, 'stalwart_avenger', 'board'); // 7/2
	const blocker = E.instantiate({ id: 'blk', name: 'Blocker', type: 'creature', cost: 5, rarity: 'basic', attack: 5, health: 8 }, 1);
	blocker.zone = 'board'; blocker.summonedThisTurn = false; st.players[1].board.push(blocker);
	st.current = 0;
	E.attack(st, 0, s.uid, { type: 'creature', uid: blocker.uid, player: 1 });
	if (st.pendingCombat || st.combat) E.resolveCombat(st, 0, s.uid, { type: 'creature', uid: blocker.uid, player: 1 });
	ok('attacker took NO retaliation damage (Immune while attacking)', !E.isDead(s) && s.damage === 0, [s.damage, E.isDead(s)]);
	ok('the defender still took the 7 damage', blocker.damage === 7 || E.isDead(blocker), blocker.damage);
	ok('immunity lapses after the swing (flag cleared)', !s._attackingImmune);
	// once the swing is over it can take normal damage again
	damageCreature(st, s, 3, null);
	ok('takes damage normally when NOT attacking', s.damage === 3 || E.isDead(s), s.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
