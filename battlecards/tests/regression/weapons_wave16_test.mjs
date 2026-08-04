// Missing HS weapons — wave 16: Woecleaver (Recruit on hero attack).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 63) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };

ok('woecleaver exists', cardsById.woecleaver?.type === 'weapon');

// Woecleaver: after your hero attacks, Recruit a minion (summon one from your deck)
{
	const st = game();
	st.players[0].deck = ['chillwind_yeti', 'chillwind_yeti', 'chillwind_yeti'];
	const foe = put(st, 1, dummy(0, 6, 'Foe'));
	equip(st, 'woecleaver'); st.players[0].heroAttacksUsed = 0;
	const before = st.players[0].board.filter(c => c.type !== 'location').length;
	const deck0 = st.players[0].deck.length;
	E.heroAttack(st, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Woecleaver Recruited a minion from the deck onto the board', st.players[0].board.filter(c => c.type !== 'location').length === before + 1, st.players[0].board.length - before);
	ok('the Recruited minion left the deck', st.players[0].deck.length === deck0 - 1, [deck0, st.players[0].deck.length]);
	ok('the Recruited minion is a Chillwind Yeti', st.players[0].board.some(c => c.id === 'chillwind_yeti'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
