// New engine mechanics unlocked for the spell import: conditional `deckNoMinions`
// (Malfunction) + damage `excessToNeighbors` rider (Combustion).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_spell = { id: 't_spell', name: 'S', type: 'sorcery', cost: 1, effects: [] };
cardsById.t_min = { id: 't_min', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, hp = 5) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); };

for (const id of ['malfunction', 'combustion']) ok(`${id} present`, cardsById[id], id);

// Malfunction — deck HAS minions: only 3 damage split (no bonus)
{
	const st = game();
	st.players[0].deck = ['t_min', 't_spell', 't_spell'];
	const a = enemy(st, 20);
	cast(st, 'malfunction');
	ok('deck has a minion -> only 3 damage total', a.damage === 3, a.damage);
}
// Malfunction — deck has NO minions: 3 + 3 = 6
{
	const st = game();
	st.players[0].deck = ['t_spell', 't_spell', 't_spell'];
	const a = enemy(st, 20);
	cast(st, 'malfunction');
	ok('deck has no minions -> 6 damage total', a.damage === 6, a.damage);
}
// Malfunction — empty deck also counts as "no minions"
{
	const st = game();
	st.players[0].deck = [];
	const a = enemy(st, 20);
	cast(st, 'malfunction');
	ok('empty deck -> 6 damage total', a.damage === 6, a.damage);
}

// Combustion — no excess: 4 to the target, neighbors untouched
{
	const st = game();
	const left = enemy(st, 9), mid = enemy(st, 9), right = enemy(st, 9);
	cast(st, 'combustion', { type: 'creature', uid: mid.uid, player: 1 });
	ok('Combustion dealt 4 to the target', mid.damage === 4, mid.damage);
	ok('no excess -> neighbors untouched', left.damage === 0 && right.damage === 0, [left.damage, right.damage]);
}
// Combustion — excess (4 vs a 1-hp minion) spills 3 to both neighbors
{
	const st = game();
	const left = enemy(st, 9), mid = enemy(st, 1), right = enemy(st, 9);
	cast(st, 'combustion', { type: 'creature', uid: mid.uid, player: 1 });
	ok('the 1-hp target died', mid.damage >= mid.maxHealth, mid.damage);
	ok('excess 3 hit the left neighbor', left.damage === 3, left.damage);
	ok('excess 3 hit the right neighbor', right.damage === 3, right.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
