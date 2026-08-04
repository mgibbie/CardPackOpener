// Missing HS weapons — wave 13: selfCost cost-reduction (Blackpaw's Whip / Starstrung Bow).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 60) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const inHand = (st, def) => { const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };

for (const id of ['blackpaw_s_whip', 'starstrung_bow']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Blackpaw's Whip: costs (1) less for each Coin in your hand
{
	const st = game();
	const whip = inHand(st, cardsById.blackpaw_s_whip); const base = cardsById.blackpaw_s_whip.cost;
	ok('Blackpaw\'s Whip base cost with no Coins', E.effectiveCost(st, 0, whip) === base, E.effectiveCost(st, 0, whip));
	inHand(st, cardsById.coin); inHand(st, cardsById.coin);
	ok('Blackpaw\'s Whip costs 2 less with 2 Coins', E.effectiveCost(st, 0, whip) === base - 2, E.effectiveCost(st, 0, whip));
}
// Blackpaw's Whip: Deathrattle draw a card
{
	const st = game();
	st.players[0].deck = ['chillwind_yeti'];
	const w = E.instantiate(cardsById.blackpaw_s_whip, 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10;
	E.playCard(st, 0, w.uid, null, null, 0);
	const h0 = st.players[0].hand.length; E.breakWeapon(st, 0);
	ok('Blackpaw\'s Whip deathrattle drew a card', st.players[0].hand.length === h0 + 1, st.players[0].hand.length - h0);
}
// Starstrung Bow: costs (1) less per friendly Secret triggered this game
{
	const st = game();
	const bow = inHand(st, cardsById.starstrung_bow); const base = cardsById.starstrung_bow.cost;
	ok('Starstrung Bow base cost with no triggered Secrets', E.effectiveCost(st, 0, bow) === base, E.effectiveCost(st, 0, bow));
	// simulate a friendly Secret triggering (Explosive Trap) on the opponent's turn
	E.installSecret(st, 0, 'explosive_trap');
	const atk = E.instantiate({ id: 'atk', name: 'A', type: 'creature', cost: 2, attack: 3, health: 3 }, 1); atk.zone = 'board'; atk.sick = false; st.players[1].board.push(atk);
	st.current = 1; E.attack(st, 1, atk.uid, { type: 'hero', player: 0 }); // triggers Explosive Trap
	ok('a friendly Secret triggered (counter incremented)', (st.players[0].secretsTriggeredGame || 0) >= 1, st.players[0].secretsTriggeredGame);
	ok('Starstrung Bow costs 1 less after a triggered Secret', E.effectiveCost(st, 0, bow) === base - 1, E.effectiveCost(st, 0, bow));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
