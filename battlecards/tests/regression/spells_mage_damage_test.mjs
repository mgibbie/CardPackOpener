// Prototype spell-import batch: 12 Mage damage spells (+ companion tokens) authored
// by the mage-damage-spell-author workflow and gated. Behavioral checks.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemyMinion = (st, hp = 5, atk = 0) => { const m = E.instantiate({ id: 'edum', name: 'Ox', type: 'creature', cost: 1, attack: atk, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, s.choices ? 0 : null, 0); return s; };

for (const id of ['ignite', 'icicle', 'first_flame', 'siphon_mana', 'frost_lich_cross_stitch', 'arcane_barrage', 'second_flame', 'ignite_2', 'roaring_torch']) ok(`${id} present`, cardsById[id], id);

// Icicle: deal 2 to a minion; draw only if it was Frozen
{
	const st = game();
	st.players[0].deck = ['icicle'];
	const foe = enemyMinion(st, 5);
	const handBefore = st.players[0].hand.length;
	cast(st, 'icicle', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Icicle dealt 2 to the minion', foe.damage === 2, foe.damage);
	ok('Icicle did NOT draw (target unfrozen)', st.players[0].hand.length === handBefore, st.players[0].hand.length);
}
{
	const st = game();
	st.players[0].deck = ['icicle', 'icicle'];
	const foe = enemyMinion(st, 5); foe.frozen = true;
	cast(st, 'icicle', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Icicle drew a card vs a Frozen minion', st.players[0].hand.some(c => c.id === 'icicle'), st.players[0].hand.map(c => c.id));
}

// First Flame: deal 2 to a minion + add Second Flame to hand
{
	const st = game();
	const foe = enemyMinion(st, 5);
	cast(st, 'first_flame', { type: 'creature', uid: foe.uid, player: 1 });
	ok('First Flame dealt 2', foe.damage === 2, foe.damage);
	ok('First Flame added Second Flame to hand', st.players[0].hand.some(c => c.id === 'second_flame'), st.players[0].hand.map(c => c.id));
}

// Ignite: deal 2 + shuffle an escalating Ignite into the deck
{
	const st = game();
	const foe = enemyMinion(st, 5);
	cast(st, 'ignite', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Ignite dealt 2', foe.damage === 2, foe.damage);
	ok('Ignite shuffled ignite_2 into the deck', st.players[0].deck.includes('ignite_2'), st.players[0].deck);
	ok('ignite_2 escalates (deals 3)', cardsById.ignite_2.effects.find(e => e.type === 'damage').value === 3);
}

// Siphon Mana: Honorable Kill (exact lethal) reduces spell costs in hand by 1
{
	const st = game();
	const foe = enemyMinion(st, 2); // exactly 2 -> Siphon's 2 is an Honorable Kill
	const held = E.instantiate(cardsById.icicle, 0); held.zone = 'hand'; st.players[0].hand.push(held);
	const costBefore = E.effectiveCost(st, 0, held);
	cast(st, 'siphon_mana', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Siphon Mana killed the minion', E.isDead ? E.isDead(foe) : foe.damage >= foe.maxHealth, foe.damage);
	ok('Honorable Kill discounted the held spell by 1', E.effectiveCost(st, 0, held) === costBefore - 1, [costBefore, E.effectiveCost(st, 0, held)]);
}

// Frost Lich Cross-Stitch: deal 3; if it dies, summon a 3/6 Water Elemental
{
	const st = game();
	const foe = enemyMinion(st, 3); // dies to 3
	const boardBefore = st.players[0].board.length;
	cast(st, 'frost_lich_cross_stitch', { type: 'creature', uid: foe.uid, player: 1 });
	const we = st.players[0].board.find(c => c.name === 'Water Elemental');
	ok('Cross-Stitch summoned a 3/6 Water Elemental on death', we && we.attack === 3 && E.hp(we) === 6, we && [we.attack, E.hp(we)]);
}

// Arcane Barrage: 3 to a chosen enemy + 2 to two other random ones = 7 total across enemies
{
	const st = game();
	const a = enemyMinion(st, 9), b = enemyMinion(st, 9), c = enemyMinion(st, 9);
	cast(st, 'arcane_barrage', { type: 'creature', uid: a.uid, player: 1 });
	const total = a.damage + b.damage + c.damage + (40 - st.players[1].life);
	ok('Arcane Barrage dealt 7 total to the enemy side', total === 7, total);
	ok('the chosen enemy took at least the 3', a.damage >= 3, a.damage);
}

// Seabreeze Chalice: 2 damage split among enemy minions
{
	const st = game();
	const a = enemyMinion(st, 9), b = enemyMinion(st, 9);
	cast(st, 'seabreeze_chalice');
	ok('Seabreeze split 2 damage among enemy minions', a.damage + b.damage === 2, [a.damage, b.damage]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
