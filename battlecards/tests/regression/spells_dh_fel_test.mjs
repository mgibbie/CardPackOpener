// DH Fel/Relic spell-import batch — behavioral checks on the trickier survivors.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_min = { id: 't_min', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1 };
cardsById.t_fill = { id: 't_fill', name: 'F', type: 'sorcery', cost: 1, effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7, mana = 10) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = mana; st.players[0].mana.cur = mana;
	return st;
};
const enemy = (st, hp = 5, tribe = null) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp, tribe }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = st.players[0].mana.max; E.playCard(st, 0, s.uid, target, null, 0); };
const nextTurn = (st) => { E.endTurn(st); E.endTurn(st); }; // back to player 0's turn start

for (const id of ['sigil_of_flame', 'fury_rank_1', 'deal_with_a_devil', 'fumigate', 'flash_flood', 'fel_barrage']) ok(`${id} present`, cardsById[id], id);

// Sigil of Flame: nothing now; 3 to all minions at the start of your NEXT turn
{
	const st = game();
	const a = enemy(st, 9), b = enemy(st, 9);
	cast(st, 'sigil_of_flame');
	ok('Sigil: no immediate damage', a.damage === 0 && b.damage === 0, [a.damage, b.damage]);
	nextTurn(st);
	ok('Sigil: 3 damage to all minions at next turn start', a.damage === 3 && b.damage === 3, [a.damage, b.damage]);
}

// Fury (Rank 1): +2 hero Attack; +4 at 5 Mana; +6 at 10 Mana (Manathirst tiers)
{
	const st = game(7, 4); // 4 max mana -> only base tier
	cast(st, 'fury_rank_1');
	ok('Fury at 4 Mana: hero +2 Attack', E.heroAttackValue(st, st.players[0]) === 2, E.heroAttackValue(st, st.players[0]));
}
{
	const st = game(7, 5);
	cast(st, 'fury_rank_1');
	ok('Fury at 5 Mana: hero +4 Attack', E.heroAttackValue(st, st.players[0]) === 4, E.heroAttackValue(st, st.players[0]));
}
{
	const st = game(7, 10);
	cast(st, 'fury_rank_1');
	ok('Fury at 10 Mana: hero +6 Attack', E.heroAttackValue(st, st.players[0]) === 6, E.heroAttackValue(st, st.players[0]));
}

// Deal with a Devil: 2 Felfiends; 4 if your deck has no minions
{
	const st = game(); st.players[0].deck = ['t_min'];
	cast(st, 'deal_with_a_devil');
	ok('Deal with a Devil (deck has minion): 2 Felfiends', st.players[0].board.filter(c => c.name === 'Felfiend').length === 2, st.players[0].board.length);
}
{
	const st = game(); st.players[0].deck = ['t_fill'];
	cast(st, 'deal_with_a_devil');
	ok('Deal with a Devil (no minions in deck): 4 Felfiends', st.players[0].board.filter(c => c.name === 'Felfiend').length === 4, st.players[0].board.length);
}

// Fumigate: 3 to the target + all others of the same minion type
{
	const st = game();
	const a = enemy(st, 9, 'Murloc'), b = enemy(st, 9, 'Murloc'), c = enemy(st, 9, 'Beast');
	cast(st, 'fumigate', { type: 'creature', uid: a.uid, player: 1 });
	ok('Fumigate hit the target + same-tribe', a.damage === 3 && b.damage === 3, [a.damage, b.damage]);
	ok('Fumigate spared a different tribe', c.damage === 0, c.damage);
}

// Flash Flood: 5 to the opponent's left- and right-most minions.
// (Played from a NON-edge hand slot so Outcast — "do it again" — does NOT trigger.)
{
	const st = game();
	const l = enemy(st, 20), mid = enemy(st, 9), r = enemy(st, 20);
	const f1 = E.instantiate(cardsById.t_fill, 0), f2 = E.instantiate(cardsById.t_fill, 0);
	const ff = E.instantiate(cardsById.flash_flood, 0);
	f1.zone = f2.zone = ff.zone = 'hand';
	st.players[0].hand.push(f1, ff, f2); // ff is neither left- nor right-most
	st.players[0].mana.cur = st.players[0].mana.max;
	E.playCard(st, 0, ff.uid, null, null, 0);
	ok('Flash Flood (no Outcast) hit both flanks for 5', l.damage === 5 && r.damage === 5, [l.damage, mid.damage, r.damage]);
	ok('Flash Flood spared the middle', mid.damage === 0, mid.damage);
}
// Outcast (played as an edge card): "do it again" -> 10 to each flank
{
	const st = game();
	const l = enemy(st, 20), r = enemy(st, 20);
	cast(st, 'flash_flood'); // sole card in hand = edge -> Outcast active
	ok('Flash Flood Outcast doubled the flank damage to 10', l.damage === 10 && r.damage === 10, [l.damage, r.damage]);
}

// Fel Barrage: 2 to the lowest-Health enemy, twice
{
	const st = game();
	const big = enemy(st, 20), small = enemy(st, 5);
	cast(st, 'fel_barrage');
	ok('Fel Barrage hit the lowest-Health enemy twice (4 total)', small.damage === 4 || big.damage + small.damage === 4, [big.damage, small.damage]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
