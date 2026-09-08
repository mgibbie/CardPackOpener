// Twenty-fourth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Craw Wurm     -> retribe Beast; add "Constellation: Gain +3/+3".
//   Colossapede   -> retribe Beast.
//   Beast in Show -> add "Battlecry: Discover a copy of a card in your deck".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 51) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; } return st; };

// ---------- Craw Wurm: Constellation: Gain +3/+3 ----------
{
	const c = cardsById.craw_wurm;
	ok('Craw Wurm is a Beast', c.tribe === 'Beast', c.tribe);
	ok('reads "Trample.\\nConstellation: Gain +3/+3."', c.description === 'Trample.\nConstellation: Gain +3/+3.', JSON.stringify(c.description));
	ok('Constellation wired (enchantment-played -> buff-self +3/+3)', c.ongoing?.on === 'enchantment-played' && c.ongoing.effects[0].type === 'buff-self' && c.ongoing.effects[0].attack === 3 && c.ongoing.effects[0].health === 3, JSON.stringify(c.ongoing));
	const st = game();
	const w = E.instantiate(c, 0); w.zone = 'board'; st.players[0].board.push(w); // 6/4
	E.fireOngoing(st, 0, 'enchantment-played', {});
	ok('Constellation grew it +3/+3 (6/4 -> 9/7)', w.attack === 9 && w.maxHealth === 7, [w.attack, w.maxHealth]);
}

// ---------- Colossapede: retribe Beast ----------
ok('Colossapede is a Beast', cardsById.colossapede.tribe === 'Beast', cardsById.colossapede.tribe);

// ---------- Beast in Show: Battlecry: Discover a copy of a card in your deck ----------
{
	const c = cardsById.beast_in_show;
	ok('reads "Trample.\\nBattlecry: Discover a copy of a card in your deck."', c.description === 'Trample.\nBattlecry: Discover a copy of a card in your deck.', JSON.stringify(c.description));
	ok('battlecry is a fromOwnDeck discover', c.keywords.includes('battlecry') && c.effects?.[0]?.type === 'discover' && c.effects[0].fromOwnDeck === true, JSON.stringify(c.effects));
	const st = game();
	st.players[0].deck = ['tomb_spider', 'harvest_golem', 'loot_hoarder', 'fireball'];
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	const before = (st.pickQueue || []).length;
	E.playCard(st, 0, sp.uid, null, null, 0);
	const q = (st.pickQueue || [])[before];
	ok('Battlecry queued a Discover', !!q && q.discover === true && Array.isArray(q.ids) && q.ids.length > 0, JSON.stringify(q && q.ids));
	ok('every offered card is from your deck', (q?.ids || []).every(id => st.players[0].deck.includes(id) || id === 'tomb_spider' || id === 'harvest_golem' || id === 'loot_hoarder' || id === 'fireball'), JSON.stringify(q?.ids));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
