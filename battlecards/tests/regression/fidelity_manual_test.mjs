// Manual fidelity batch: overkill-on-spells engine support + 13 restored riders.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

byId.t_frail = { id: 't_frail', name: 'Frail', type: 'creature', cost: 1, attack: 1, health: 1 };
byId.t_tough = { id: 't_tough', name: 'Tough', type: 'creature', cost: 1, attack: 1, health: 9 };

function game() {
	const st = E.createGame(byId, seededRng(111), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.board = []; p.deck = Array(10).fill('t_tough'); }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); E.recomputeAuras(st); return c;
}
function cast(st, id, tgt = null) {
	const sp = E.instantiate(byId[id], 0); sp.zone = 'hand';
	st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, tgt, null, 0); return sp;
}
const tgtOf = c => ({ type: 'creature', uid: c.uid, player: c.controller });

// --- spell Overkill: fires on excess kill, not on a plain hit ---
{
	const st = game();
	const frail = put(st, 1, 't_frail'); // 1 hp: 2 damage overkills
	cast(st, 'totemic_smash', tgtOf(frail));
	ok('overkill: excess kill creates a basic Totem', st.players[0].board.some(c => (c.tribe || '').includes('Totem')), st.players[0].board.map(c => c.name));
}
{
	const st = game();
	const tough = put(st, 1, 't_tough'); // survives: no overkill
	cast(st, 'totemic_smash', tgtOf(tough));
	ok('overkill: no totem without a kill', !st.players[0].board.some(c => (c.tribe || '').includes('Totem')));
}
// --- blast_wave: AoE overkill via threadSource ---
{
	const st = game();
	put(st, 1, 't_frail'); put(st, 1, 't_tough');
	const hand = st.players[0].hand.length;
	cast(st, 'blast_wave');
	ok('blast wave: AoE overkill conjures a Mage spell', st.players[0].hand.length === hand + 1 && E.isSpellType(st.players[0].hand[0]), st.players[0].hand.map(c => c.id));
}
// --- scorch / storage_scuffle: the new selfCostIf conds ---
{
	const st = game();
	const sc = E.instantiate(byId.scorch, 0); sc.zone = 'hand'; st.players[0].hand.push(sc);
	ok('scorch: full price without an Elemental last turn', E.effectiveCost(st, 0, sc) === byId.scorch.cost);
	st.players[0].elementalLastTurn = true;
	ok('scorch: (1) after an Elemental last turn', E.effectiveCost(st, 0, sc) === 1);
	const ss = E.instantiate(byId.storage_scuffle, 0); ss.zone = 'hand'; st.players[0].hand.push(ss);
	st.players[0].discoveredThisTurn = 1;
	ok('scuffle: (0) after a Discover this turn', E.effectiveCost(st, 0, ss) === 0);
}
// --- to_my_side / yogg_in_the_box: deckNoMinions riders ---
{
	const st = game();
	st.players[0].deck = []; // no minions in deck
	cast(st, 'to_my_side');
	ok('to my side: two companions with a minionless deck', st.players[0].board.length === 2, st.players[0].board.length);
}
// --- omega_assembly: manathirst 10 keeps all 3 ---
{
	const st = game();
	st.players[0].mana.max = 10;
	const hand = st.players[0].hand.length;
	cast(st, 'omega_assembly');
	ok('omega: 10 mana -> 3 Mechs straight to hand (no pick)', st.pickQueue.length === 0 && st.players[0].hand.length === hand + 3, st.players[0].hand.length - hand);
}
{
	const st = game();
	st.players[0].mana.max = 5;
	cast(st, 'omega_assembly');
	ok('omega: below 10 -> a normal Discover', st.pickQueue.length === 1);
}
// --- garrote: Bleeds shuffle in and bite when drawn ---
{
	const st = game();
	st.players[0].deck = [];
	cast(st, 'garrote');
	ok('garrote: 3 Bleeds in the deck', st.players[0].deck.filter(id => id === 'bleed').length === 3);
}
// --- lightforged_blessing: twinspell copy lands in hand ---
{
	const st = game();
	const m = put(st, 0, 't_tough');
	cast(st, 'lightforged_blessing', tgtOf(m));
	ok('blessing: lifesteal granted + twinspell copy in hand', m.keywords.includes('lifesteal') && st.players[0].hand.some(c => c.id === 'lightforged_blessing_ii'));
}
// --- pick_pocket: echo flag present ---
ok('pick pocket: Echo', byId.pick_pocket.echo === true);
// --- suffocate: starship rider ---
{
	const st = game();
	const a = put(st, 1, 't_tough'), b = put(st, 1, 't_tough');
	st.players[0].starshipPieces = ['x'];
	cast(st, 'suffocate', tgtOf(a));
	ok('suffocate: building a Starship destroys a random extra', st.players[1].board.filter(c => !E.isDead(c)).length === 0, st.players[1].board.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
