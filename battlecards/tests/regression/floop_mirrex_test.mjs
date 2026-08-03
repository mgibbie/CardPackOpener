// Flobbidinous Floop / Mirrex: while in your hand, this IS a 3/4 copy of the
// last creature you (Floop) / your opponent (Mirrex) played.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// two distinct real creatures to be copied (one with a keyword)
const kwMon = raw.cards.find(c => c.type === 'creature' && (c.keywords || []).includes('taunt') && !c.token && c.collectible !== false && (c.effects || []).length === 0 && !(c.colors && c.colors.length));
const vanilla = raw.cards.find(c => c.type === 'creature' && !(c.keywords || []).length && !c.token && c.collectible !== false && (c.attack || 0) >= 4 && !(c.colors && c.colors.length));
ok('found sample creatures to copy', kwMon && vanilla && kwMon.id !== vanilla.id, [kwMon && kwMon.id, vanilla && vanilla.id]);

const game = () => {
	const st = E.createGame(cardsById, seededRng(4), null, 2, [{ id: 'druid', name: 'D', power: null }, { id: 'rogue', name: 'R', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	st.players[0].mana.max = 20; st.players[0].mana.cur = 20; st.players[1].mana.max = 20; st.players[1].mana.cur = 20;
	return st;
};
const playCreature = (st, pi, id) => { st.current = pi; const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, null, 0); };

// Floop copies the last creature YOU play
{
	const st = game();
	const f = E.instantiate(cardsById['flobbidinous_floop'], 0); f.zone = 'hand'; st.players[0].hand.push(f);
	ok('starts as itself (3/4 Floop) before any creature is played', st.players[0].hand[0].id === 'flobbidinous_floop' && f.attack === 3);

	playCreature(st, 0, kwMon.id);
	const c1 = st.players[0].hand.find(x => x.uid === f.uid);
	ok('after you play a creature: Floop IS a 3/4 copy of it (keeps id/keywords, own cost 4)',
		c1 && c1.id === kwMon.id && c1.attack === 3 && E.hp(c1) === 4 && c1.cost === 4 && c1.keywords.includes('taunt'), c1 && [c1.id, c1.attack, E.hp(c1), c1.cost]);

	playCreature(st, 0, vanilla.id);
	const c2 = st.players[0].hand.find(x => x.uid === f.uid);
	ok('copies the NEXT creature you play (continuous)', c2 && c2.id === vanilla.id && c2.attack === 3 && E.hp(c2) === 4, c2 && [c2.id, c2.attack]);

	// playing the copy enters it as that creature at 3/4
	st.current = 0; st.players[0].mana.cur = 20;
	E.playCard(st, 0, c2.uid, null, null, 0);
	ok('playing the copy: enters as that creature at 3/4', st.players[0].board.some(b => b.id === vanilla.id && b.attack === 3 && E.hp(b) === 4), st.players[0].board.map(b => [b.id, b.attack]));
}

// Mirrex copies the last creature your OPPONENT plays (not yours)
{
	const st = game();
	const m = E.instantiate(cardsById['mirrex_the_crystalline'], 0); m.zone = 'hand'; st.players[0].hand.push(m);

	playCreature(st, 0, vanilla.id); // YOU play a creature -> Mirrex should NOT change
	ok('Mirrex ignores creatures YOU play', st.players[0].hand.find(x => x.uid === m.uid)?.id === 'mirrex_the_crystalline');

	playCreature(st, 1, kwMon.id); // OPPONENT plays -> Mirrex copies it (3/4, own cost 3)
	const mc = st.players[0].hand.find(x => x.uid === m.uid);
	ok('Mirrex becomes a 3/4 copy of the opponent\'s played creature', mc && mc.id === kwMon.id && mc.attack === 3 && E.hp(mc) === 4 && mc.cost === 3, mc && [mc.id, mc.attack, mc.cost]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
