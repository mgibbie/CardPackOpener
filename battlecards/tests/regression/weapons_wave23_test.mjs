// Wave 23: Blacksmithing Hammer (Trade -> +2 Durability, persists to the drawn copy)
// + Felstring Harp (on your turn, hero damage becomes healing, weapon degrades).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass = 'warrior', seed = 9) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

for (const id of ['blacksmithing_hammer', 'felstring_harp']) ok(`${id} exists`, cardsById[id], id);

// Blacksmithing Hammer: trade it -> the copy shuffled back gains +2 Durability.
// With an otherwise-empty deck, the automatic post-trade draw pulls the buffed
// copy straight back, so we see it applied end-to-end (afterTrade + draw-buff).
{
	const st = game('warrior');
	const h = E.instantiate(cardsById.blacksmithing_hammer, 0); h.zone = 'hand'; st.players[0].hand.push(h);
	st.players[0].mana.cur = 10;
	ok('canTrade the tradeable hammer', E.canTrade(st, 0, h));
	E.tradeCard(st, 0, h.uid); // shuffles hammer into (empty) deck, then draws 1 -> the hammer
	const drawn = st.players[0].hand.find(c => c.id === 'blacksmithing_hammer');
	ok('the traded hammer is drawn back', drawn, st.players[0].hand.map(c => c.id));
	ok('drawn hammer is 5 attack / 3 durability (base 5/1 + 2)', drawn && drawn.attack === 5 && drawn.durability === 3, drawn && [drawn.attack, drawn.durability]);
	ok('a fresh copy (not traded) stays at 5/1', E.instantiate(cardsById.blacksmithing_hammer, 0).durability === 1);
}
// deck-id durability buff applies on draw generally (direct zones.js check)
{
	const st = game('warrior');
	st.players[0].deckIdBuffs = [{ id: 'blacksmithing_hammer', attack: 0, health: 0, durability: 2 }];
	st.players[0].deck = ['blacksmithing_hammer'];
	E.drawCards(st, 0, 1);
	const drawn = st.players[0].hand.find(c => c.id === 'blacksmithing_hammer');
	ok('deck-id durability buff applied on draw (5/3)', drawn && drawn.durability === 3, drawn && drawn.durability);
	ok('the durability buff was consumed', !(st.players[0].deckIdBuffs || []).length, st.players[0].deckIdBuffs);
}

// Felstring Harp: on your turn, damage to your hero becomes +2 healing and it loses durability
{
	const st = game('warlock');
	const w = equip(st, 'felstring_harp');
	ok('equipped Felstring Harp at 0/3', w && w.attack === 0 && w.durability === 3, w && [w.attack, w.durability]);
	const lifeBefore = st.players[0].life;
	// your own turn: take "damage" -> converts to healing +2, weapon -1 durability
	const dealt = E.damageHero(st, 0, 4, 1);
	ok('no damage was actually taken (returned 0)', dealt === 0, dealt);
	ok('hero was healed +2 instead', st.players[0].life === lifeBefore + 2, [lifeBefore, st.players[0].life]);
	ok('weapon lost 1 durability (3 -> 2)', st.players[0].weapon && st.players[0].weapon.durability === 2, st.players[0].weapon?.durability);
}
// On the OPPONENT's turn, Felstring does NOT convert (only "on your turn")
{
	const st = game('warlock');
	equip(st, 'felstring_harp');
	st.current = 1; // enemy's turn
	const lifeBefore = st.players[0].life;
	const dealt = E.damageHero(st, 0, 4, 1);
	ok('enemy turn: damage lands normally', st.players[0].life === lifeBefore - 4 && dealt === 4, [lifeBefore, st.players[0].life, dealt]);
	ok('enemy turn: weapon durability unchanged (still 3)', st.players[0].weapon.durability === 3, st.players[0].weapon?.durability);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
