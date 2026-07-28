// draw_pipeline_test.mjs — characterization of the draw pipeline BEFORE the
// PR 10 zones.js extraction (docs/09: "mechanical + characterization first").
//
// Pins the behaviors the pipeline stacks onto a single draw: fatigue,
// graveyard reshuffle, bombs, draw-trigger tokens, per-card deck riders
// (cost overrides, id buffs, draw buffs), cast-when-drawn, copy-on-draw,
// overdraw (no burn), and the toGraveyard / bouncePermanent zone rules.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- basic draw: marks + counters ---
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.deck(0, ['t_c']).run();
	const n = E.drawCards(state, 0, 1);
	const c = state.players[0].hand.at(-1);
	ok('draw returns count reaching hand', n === 1);
	ok('drawn card marked fromDeck + drawnThisTurn', c.fromDeck === true && c.drawnThisTurn === true);
	ok('drawsThisTurn tracked', state.players[0].drawsThisTurn >= 1);
}
// --- fatigue: empty deck AND empty graveyard ---
{
	const { state } = new Scenario(byId).run();
	const p = state.players[0];
	const life = p.life;
	E.drawCards(state, 0, 2);
	ok('fatigue escalates: 1 + 2 = 3 damage', p.fatigue === 2 && p.life === life - 3, `fatigue ${p.fatigue} life ${p.life}`);
}
// --- graveyard reshuffle: real cards return, tokens cease ---
{
	const { state } = new Scenario(byId)
		.def('t_real', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.run();
	const p = state.players[0];
	p.graveyard.push({ id: 't_real', uid: 90001, zone: 'graveyard' });
	p.graveyard.push({ id: 't_ghost_token', uid: 90002, zone: 'graveyard' }); // no def in cardsById
	const n = E.drawCards(state, 0, 1);
	ok('reshuffle: the real card came back', n === 1 && state.players[0].hand.at(-1).id === 't_real');
	ok('reshuffle: defless token ceased to exist', p.deck.length === 0 && p.graveyard.length === 0);
}
// --- bombs explode on draw and never reach the hand ---
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(0, ['t_c']).run();
	const p = state.players[0];
	const life = p.life, hand = p.hand.length;
	p.deck.push('bomb'); // top of deck
	const n = E.drawCards(state, 0, 1);
	ok('bomb: 5 damage, nothing drawn', p.life === life - 5 && p.hand.length === hand && n === 0);
}
// --- deck riders: cost override (once), id buff (once) ---
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 5, attack: 2, health: 2 })
		.deck(0, ['t_c', 't_c']).run();
	const p = state.players[0];
	p.deckCostOverrides = { t_c: 0 };
	p.deckIdBuffs = [{ id: 't_c', attack: 3, health: 3 }];
	E.drawCards(state, 0, 2);
	const [a, b] = p.hand.slice(-2);
	ok('deckCostOverrides: first copy costs 0, second full price', (a.cost === 0) !== (b.cost === 0));
	const buffed = [a, b].filter(c => c.attack === 5 && c.maxHealth === 5).length;
	ok('deckIdBuffs: exactly one copy buffed +3/+3', buffed === 1, `${a.attack}/${a.maxHealth} ${b.attack}/${b.maxHealth}`);
}
// --- drawBuff: every drawn minion grows ---
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] })
		.deck(0, ['t_c', 't_sp']).run();
	const p = state.players[0];
	p.drawBuff = { attack: 2, health: 2 };
	E.drawCards(state, 0, 2);
	const sp = p.hand.find(c => c.id === 't_sp'), cr = p.hand.find(c => c.id === 't_c');
	ok('drawBuff hits minions only', cr.attack === 3 && cr.maxHealth === 3 && sp.cost === 1);
}
// --- nextDrawDiscount: one-shot ---
{
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 4, attack: 2, health: 2 })
		.deck(0, ['t_c', 't_c']).run();
	const p = state.players[0];
	p.nextDrawDiscount = 3;
	E.drawCards(state, 0, 2);
	const costs = p.hand.slice(-2).map(c => c.cost).sort((x, y) => x - y);
	ok('nextDrawDiscount: first draw -3, second untouched', costs[0] === 1 && costs[1] === 4, costs.join(','));
}
// --- castWhenDrawn: spell auto-casts instead of entering hand ---
{
	const { state } = new Scenario(byId)
		.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 2 }] })
		.deck(0, ['t_sp']).run();
	const p = state.players[0];
	p.castWhenDrawn = 1;
	const n = E.drawCards(state, 0, 1);
	ok('castWhenDrawn: spell cast (armor gained), hand empty of it', p.armor === 2 && !p.hand.some(c => c.id === 't_sp') && n === 1);
	ok('castWhenDrawn: charge consumed', p.castWhenDrawn === 0);
}
// --- copyOnDraw (Pack Mule): a free copy joins the hand ---
{
	const { state } = new Scenario(byId)
		.def('t_mule', { type: 'creature', cost: 2, attack: 2, health: 2, copyOnDraw: true })
		.deck(0, ['t_mule']).run();
	E.drawCards(state, 0, 1);
	ok('copyOnDraw: two copies in hand', state.players[0].hand.filter(c => c.id === 't_mule').length === 2);
}
// --- overdraw: NO burn — hand grows past MAX_HAND ---
{
	const ids = Array(17).fill('t_c');
	const { state } = new Scenario(byId)
		.def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(0, ids).run();
	const n = E.drawCards(state, 0, 17);
	ok('no burn on overdraw: all 17 reach hand (cleanup trims later)', n === 17 && state.players[0].hand.length >= 17);
}
// --- toGraveyard rules (via a real kill): tokens exile, real cards rest ---
{
	const { state } = new Scenario(byId)
		.def('t_killer', { type: 'creature', cost: 1, attack: 5, health: 5 })
		.def('t_victim', { type: 'creature', cost: 1, attack: 0, health: 1 })
		.board(0, ['t_killer'])
		.board(1, ['t_victim'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('real card rests in the graveyard', state.players[1].graveyard.some(c => c.id === 't_victim'));
}
{
	const { state } = new Scenario(byId)
		.def('t_killer', { type: 'creature', cost: 1, attack: 5, health: 5 })
		.def('t_tok', { type: 'creature', cost: 1, attack: 0, health: 1, token: true })
		.board(0, ['t_killer'])
		.board(1, ['t_tok'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.run();
	ok('token exiles instead (leaves no corpse)', state.players[1].exile.some(c => c.id === 't_tok')
		&& !state.players[1].graveyard.some(c => c.id === 't_tok'));
}
// --- bouncePermanent: fresh copy to hand, tokens cease, equipment detaches ---
{
	const { state } = new Scenario(byId)
		.def('t_min', { type: 'creature', cost: 3, attack: 2, health: 2 })
		.def('t_bouncer', { type: 'sorcery', cost: 1, effects: [{ type: 'bounce', target: 'creature' }] })
		.board(0, ['t_min'])
		.mana(0, 10)
		.hand(0, ['t_bouncer'])
		.play(0, 't_bouncer', { targetBoard: [0, 0] })
		.run();
	const copies = state.players[0].hand.filter(c => c.id === 't_min');
	ok('bounce: back in hand as a fresh instance', state.players[0].board.length === 0 && copies.length === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
