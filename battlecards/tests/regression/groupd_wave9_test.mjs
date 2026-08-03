// Group D (turn triggers) wave 9 — Ohn'ahra (play top 3) + Subterfuge Swindler.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 29) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].board = []; st.players[1].board = [];
	return st;
};
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const minions = (st, pi) => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location');

ok('ohn_ahra turn-end ongoing', cardsById['ohn_ahra'].ongoing?.on === 'turn-end');
ok('subterfuge_swindler turn-end ongoing (keywords/deathrattle preserved)', cardsById['subterfuge_swindler'].ongoing?.on === 'turn-end' && cardsById['subterfuge_swindler'].keywords.includes('rush') && cardsById['subterfuge_swindler'].deathrattle);

// Ohn'ahra: end of turn, play the top 3 cards from your deck
{
	const st = game(); const o = put(st, 0, 'ohn_ahra');
	st.players[0].deck = ['chillwind_yeti', 'boulderfist_ogre', 'wolfrider']; // 3 creatures on top
	const b0 = minions(st, 0).length;
	E.endTurn(st);
	ok('Ohn\'ahra: 3 creatures from the deck were played onto the board', minions(st, 0).length === b0 + 3, minions(st, 0).map(c => c.id));
	ok('Ohn\'ahra: those cards left the deck', st.players[0].deck.length === 0);
}
// Ohn'ahra with a spell on top casts it
{
	const st = game(); put(st, 0, 'ohn_ahra');
	const dmg = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && !c.token && c.collectible !== false && !(c.colors && c.colors.length) && JSON.stringify(c.effects || []).includes('"damage"'));
	st.players[0].deck = [dmg.id, 'chillwind_yeti', 'boulderfist_ogre'];
	st.players[1].life = 30;
	E.endTurn(st);
	ok('Ohn\'ahra: a spell among the top 3 was cast (no crash, deck emptied)', st.players[0].deck.length === 0 && !st.over);
}
// Subterfuge Swindler: end of turn, each player draws a spell
{
	const st = game(); put(st, 0, 'subterfuge_swindler');
	const spell = raw.cards.find(c => (c.type === 'sorcery' || c.type === 'instant') && !c.token && c.collectible !== false && !(c.colors && c.colors.length));
	st.players[0].deck = ['chillwind_yeti', spell.id]; st.players[1].deck = ['boulderfist_ogre', spell.id];
	E.endTurn(st);
	ok('Subterfuge Swindler: YOU drew a spell', st.players[0].hand.some(c => { const d = cardsById[c.id]; return d && (d.type === 'sorcery' || d.type === 'instant'); }), st.players[0].hand.map(c => c.id));
	ok('Subterfuge Swindler: the OPPONENT also drew a spell', st.players[1].hand.some(c => { const d = cardsById[c.id]; return d && (d.type === 'sorcery' || d.type === 'instant'); }), st.players[1].hand.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
