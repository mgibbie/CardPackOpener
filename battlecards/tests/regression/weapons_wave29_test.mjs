// Wave 29: Kingsbane — always keeps enchantments; Deathrattle shuffles it into
// your deck, and the redrawn copy restores its Attack buffs and bonus keywords.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 6) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'rogue', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'rogue'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const redraw = (st) => { st.players[0].deck = ['kingsbane']; E.drawCards(st, 0, 1); return st.players[0].hand.find(c => c.id === 'kingsbane'); };

ok('kingsbane exists', cardsById.kingsbane);

// Unbuffed: breaks -> shuffles back -> redraws as a fresh 1/3 (no phantom buff)
{
	const st = game();
	equip(st, 'kingsbane');
	E.breakWeapon(st, 0, false);
	ok('unbuffed Kingsbane shuffled into deck', st.players[0].deck.includes('kingsbane'), st.players[0].deck);
	ok('no enchantment captured when unbuffed', !(st.players[0].deckIdBuffs || []).some(b => b.id === 'kingsbane'), st.players[0].deckIdBuffs);
	const d = redraw(st);
	ok('redrawn Kingsbane is a clean 1/3', d && d.attack === 1 && d.durability === 3, d && [d.attack, d.durability]);
}

// Buffed: +2 Attack and a Lifesteal enchantment persist through shuffle/redraw
{
	const st = game();
	const w = equip(st, 'kingsbane'); // 1/3
	w.attack += 2;                    // Deadly Poison
	if (!w.keywords.includes('lifesteal')) w.keywords.push('lifesteal'); // Leeching Poison
	E.breakWeapon(st, 0, false);
	const buff = (st.players[0].deckIdBuffs || []).find(b => b.id === 'kingsbane');
	ok('captured +2 Attack enchantment', buff && buff.attack === 2, buff);
	ok('captured the lifesteal keyword', buff && buff.keywords.includes('lifesteal'), buff && buff.keywords);
	const d = redraw(st);
	ok('redrawn Kingsbane kept +2 Attack (now 3)', d && d.attack === 3, d && d.attack);
	ok('redrawn Kingsbane durability reset to base (3)', d && d.durability === 3, d && d.durability);
	ok('redrawn Kingsbane kept Lifesteal', d && d.keywords.includes('lifesteal'), d && d.keywords);
	ok('the captured buff was consumed on draw', !(st.players[0].deckIdBuffs || []).some(b => b.id === 'kingsbane'), st.players[0].deckIdBuffs);
}

// Enchantments ACCUMULATE across cycles: re-equip the 3/3, buff again, break, redraw at 5/3
{
	const st = game();
	const w = equip(st, 'kingsbane');
	w.attack += 2;
	E.breakWeapon(st, 0, false);
	let d = redraw(st);
	ok('after cycle 1: 3 Attack', d && d.attack === 3, d && d.attack);
	// equip the redrawn (already-buffed) copy and buff it more
	st.players[0].mana.cur = 10;
	E.playCard(st, 0, d.uid, null, null, 0);
	st.players[0].weapon.attack += 2; // total now 5
	E.breakWeapon(st, 0, false);
	const buff = (st.players[0].deckIdBuffs || []).find(b => b.id === 'kingsbane');
	ok('cycle 2 captures the full +4 over base', buff && buff.attack === 4, buff && buff.attack);
	d = redraw(st);
	ok('after cycle 2: 5 Attack (buffs accumulated, no double-count)', d && d.attack === 5, d && d.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
