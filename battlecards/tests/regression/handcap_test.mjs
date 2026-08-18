// Hand size is MTG-style: you may hold more than HAND_LIMIT (15) DURING your turn — draw and
// card generation never burn — and the hand is trimmed down to HAND_LIMIT only at end of turn.
// MAX_HAND (40) is just a high mid-turn safety ceiling. Regression coverage for the split.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
// synthetic test cards
byId.t_filler = { id: 't_filler', name: 'Filler', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId.t_gift = { id: 't_gift', name: 'Gift', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId.t_conjure = { id: 't_conjure', name: 'Conjure', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'conjure-id', id: 't_gift' }] };
byId.t_eight = { id: 't_eight', name: 'Eight Bots', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'add-token', name: 'Bot', attack: 1, health: 1, count: 8 }] };
byId.t_fill = { id: 't_fill', name: 'Fill Hand', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'fill-hand-token', id: 't_gift' }] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(11), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const fill = (st, pi, n, id = 't_filler') => { for (let i = 0; i < n; i++) { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); } };
const play = (st, pi, id) => E.playCard(st, pi, st.players[pi].hand.find(c => c.id === id).uid, null, null, 0);

// --- sanity: the constants split correctly ---
ok('HAND_LIMIT is 15', E.HAND_LIMIT === 15);
ok('MAX_HAND ceiling is well above 15', E.MAX_HAND > 15);

// --- generation past 15 is NOT dropped ---
{
	const st = game();
	fill(st, 0, 15);                       // 15 fillers
	const c = E.instantiate(byId.t_conjure, 0); c.zone = 'hand'; st.players[0].hand.push(c); // 16th card
	ok('hand starts at 16 (over the limit, allowed mid-turn)', st.players[0].hand.length === 16);
	play(st, 0, 't_conjure');              // spell leaves (->15), conjures t_gift (->16)
	ok('conjure into a full hand adds the card (not dropped)', st.players[0].hand.length === 16);
	ok('the conjured card is present', st.players[0].hand.some(c => c.id === 't_gift'));
}

// --- add-token count is honored even from a nearly-full hand ---
{
	const st = game();
	fill(st, 0, 12);
	const c = E.instantiate(byId.t_eight, 0); c.zone = 'hand'; st.players[0].hand.push(c); // 13 cards
	play(st, 0, 't_eight');                // spell leaves (->12), adds 8 -> 20
	ok('all 8 tokens are added past 15 (hand = 20)', st.players[0].hand.length === 20);
}

// --- draw past 15 never burns ---
{
	const st = game();
	fill(st, 0, 15);
	st.players[0].deck = Array(5).fill('t_filler');
	const n = E.drawCards(st, 0, 5);
	ok('draw 5 into a full hand: all reach hand (20), no burn', n === 5 && st.players[0].hand.length === 20);
}

// --- fill-to-limit effects still stop at HAND_LIMIT (not the ceiling) ---
{
	const st = game();
	fill(st, 0, 9);
	const c = E.instantiate(byId.t_fill, 0); c.zone = 'hand'; st.players[0].hand.push(c); // 10 cards
	play(st, 0, 't_fill');                 // spell leaves (->9), fills to HAND_LIMIT
	ok('fill-hand-token fills to exactly HAND_LIMIT (15), not the ceiling', st.players[0].hand.length === 15);
}

// --- end-of-turn cleanup trims back down to HAND_LIMIT ---
{
	const st = game();
	fill(st, 0, 20);                       // 20 cards, mid-turn (legal)
	E.endTurn(st);
	const dq = st.discardQueue.find(d => d.player === 0 && d.cleanup);
	ok('end of turn queues a cleanup discard', !!dq);
	ok('cleanup discards exactly the overflow (20 - 15 = 5)', dq && dq.count === 5);
	const picks = st.players[0].hand.slice(0, 5).map(c => c.uid);
	E.resolveDiscard(st, picks);
	ok('after resolving, hand is exactly the limit (15)', st.players[0].hand.length === 15);
}

// --- the AI's cleanup discard is SENSIBLE: keep the bombs, shed the chaff ---
byId.t_bomb = { id: 't_bomb', name: 'Bomb', type: 'creature', cost: 10, attack: 12, health: 12, keywords: ['taunt'], rarity: 'common' };
byId.t_good_cheap = { id: 't_good_cheap', name: 'Good Cheap', type: 'creature', cost: 2, attack: 5, health: 5, keywords: ['lifesteal'], rarity: 'common' };
{
	const st = game();
	fill(st, 0, 15);                                  // 15 one-cost chaff
	for (let i = 0; i < 3; i++) { const c = E.instantiate(byId.t_bomb, 0); c.zone = 'hand'; st.players[0].hand.push(c); } // + 3 bombs = 18
	st.discardQueue.push({ player: 0, count: 3, cleanup: true });
	AI.step(st, 0);                                   // AI resolves the cleanup discard
	ok('AI cleanup keeps ALL 3 bombs (sheds chaff instead)', st.players[0].hand.filter(c => c.id === 't_bomb').length === 3);
	ok('AI cleanup discarded the cheap chaff', st.players[0].graveyard.every(c => c.id === 't_filler'));
	ok('AI cleanup leaves the hand at exactly the limit', st.players[0].hand.length === 15);
}
// value heuristic: a strong cheap card outranks a weak pricier one
ok('handKeepValue ranks a 5/5 lifesteal 2-drop above a vanilla 1/1', AI.handKeepValue(byId.t_good_cheap) > AI.handKeepValue(byId.t_filler));
// and a real bomb outranks efficient cheap cards (kept on cleanup)
ok('handKeepValue keeps a 10-cost bomb over a 2-cost body', AI.handKeepValue(byId.t_bomb) > AI.handKeepValue(byId.t_good_cheap));

// --- the AI plays a flooded hand sensibly: develop the board, don't ramp/waste mana ---
byId.t_c3 = { id: 't_c3', name: 'C3', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common' };
byId.t_c8 = { id: 't_c8', name: 'C8', type: 'creature', cost: 8, attack: 8, health: 8, rarity: 'common' };
{
	const st = game();                                // player 0, 10 mana, 0 lands
	for (let i = 0; i < 18; i++) { const id = ['t_filler', 't_c3', 't_c8'][i % 3]; const c = E.instantiate(byId[id], 0); c.zone = 'hand'; st.players[0].hand.push(c); }
	let g = 0; while (AI.step(st, 0) && g++ < 60) { }
	ok('AI with a flooded hand develops the board (plays creatures)', st.players[0].board.filter(c => c.type === 'creature').length >= 2);
	ok('AI does NOT ramp lands while its hand is over the limit', st.players[0].lands.length === 0);
	ok('AI spends its mana on the hand (<=1 left)', E.availableMana(st.players[0]) <= 1);
	ok('AI terminates (no large-hand stall)', g < 60);
}

console.log(`${pass}/${pass + fail} hand-cap checks passed`);
process.exit(fail ? 1 : 0);
