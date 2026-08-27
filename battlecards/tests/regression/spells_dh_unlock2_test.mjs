// Batch-2 unlock effects: draw valuePer friendly-deaths, random-damage valuePer
// hero-attack, draw-check notType, add-card makeTemporary, shuffle cardClass, and
// the generic timed "lasts N turns" team aura.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_spell = { id: 't_spell', name: 'Sp', type: 'sorcery', cost: 1, effects: [] };
cardsById.t_min = { id: 't_min', name: 'Mn', type: 'creature', cost: 1, attack: 1, health: 1 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demon_hunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'demon_hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, hp = 9, tribe = null) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp, tribe }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendly = (st, atk = 2, hp = 2, tribe = null) => { const m = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 1, attack: atk, health: hp, tribe }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); };
const myTurnEnd = (st) => { E.endTurn(st); E.endTurn(st); };

for (const id of ['feast_of_souls', 'blade_dance', 'mark_of_scorn', 'throw_glaive', 'cosmic_manifestations', 'creep_tumor', 'field_of_strife']) ok(`${id} present`, cardsById[id], id);

// Feast of Souls: draw a card per friendly minion that died this turn
{
	const st = game(); st.players[0].deck = ['t_min', 't_min', 't_min', 't_min'];
	st.players[0].diedThisTurn = 3;
	const before = st.players[0].hand.length;
	cast(st, 'feast_of_souls');
	ok('Feast of Souls drew 3 (3 friendly deaths this turn)', st.players[0].hand.length === before + 3, [before, st.players[0].hand.length]);
}

// Blade Dance: deal (hero Attack) to 3 random enemy minions
{
	const st = game(); st.players[0].heroTempAttack = 4;
	const a = enemy(st, 9), b = enemy(st, 9), c = enemy(st, 9);
	cast(st, 'blade_dance');
	ok('Blade Dance dealt hero-Attack (4) x3 = 12 total', a.damage + b.damage + c.damage === 12, [a.damage, b.damage, c.damage]);
}

// Mark of Scorn: draw; if it's NOT a minion, 4 to lowest enemy
{
	const st = game(); st.players[0].deck = ['t_spell']; // top is a spell (not a minion)
	const big = enemy(st, 20), small = enemy(st, 5);
	cast(st, 'mark_of_scorn');
	ok('Mark of Scorn (drew a spell): 4 to the lowest enemy', small.damage === 4, [big.damage, small.damage]);
}
{
	const st = game(); st.players[0].deck = ['t_min']; // top is a minion
	const small = enemy(st, 5);
	cast(st, 'mark_of_scorn');
	ok('Mark of Scorn (drew a minion): no bonus damage', small.damage === 0, small.damage);
}

// Throw Glaive: deal 2; if it dies, add a Temporary copy to hand
{
	const st = game();
	const foe = enemy(st, 2); // dies to 2
	cast(st, 'throw_glaive', { type: 'creature', uid: foe.uid, player: 1 });
	const copy = st.players[0].hand.find(c => c.id === 'throw_glaive');
	ok('Throw Glaive added a copy on kill', !!copy, st.players[0].hand.map(c => c.id));
	ok('the copy is Temporary', copy && copy.temporary === true, copy && copy.temporary);
}

// Cosmic Manifestations: shuffles a Demon Hunter spell (cardClass filter)
{
	const st = game();
	const foe = enemy(st, 9);
	cast(st, 'cosmic_manifestations', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Cosmic Manifestations dealt 2', foe.damage >= 2, foe.damage);
	const shuffled = st.players[0].deck.map(id => cardsById[id]).filter(Boolean);
	ok('shuffled at least one DH spell into the deck', shuffled.length >= 1 && shuffled.every(d => (d.cardClass || 'neutral') === 'demon_hunter'), st.players[0].deck);
}

// Field of Strife: your minions +1 Attack; fades after 3 turns
{
	const st = game();
	const m = friendly(st, 2, 2);
	cast(st, 'field_of_strife');
	ok('Field of Strife: friendly minion +1 Attack (2 -> 3)', m.attack === 3, m.attack);
	myTurnEnd(st); myTurnEnd(st); myTurnEnd(st); // 3 of my turn-ends
	ok('Field of Strife faded after 3 turns (back to 2)', m.attack === 2, m.attack);
}

// Creep Tumor: Zerg minions get +1 Attack and Rush; non-Zerg unaffected
{
	const st = game();
	const zerg = friendly(st, 2, 2, 'Zerg'), other = friendly(st, 2, 2, 'Beast');
	cast(st, 'creep_tumor');
	ok('Creep Tumor: Zerg minion +1 Attack + Rush', zerg.attack === 3 && zerg.keywords.includes('rush'), [zerg.attack, zerg.keywords]);
	ok('Creep Tumor: non-Zerg unaffected', other.attack === 2, other.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
