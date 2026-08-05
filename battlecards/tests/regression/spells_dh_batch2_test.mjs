// DH spell-import batch 2 — behavioral checks on the trickier survivors.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_out = { id: 't_out', name: 'Outy', type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['outcast'] };
cardsById.t_plain = { id: 't_plain', name: 'Plain', type: 'creature', cost: 2, attack: 2, health: 2 };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7, mana = 10) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = mana; st.players[0].mana.cur = mana;
	return st;
};
const enemyKw = (st, kw = ['taunt']) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 2, health: 5, keywords: kw }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = st.players[0].mana.max; E.playCard(st, 0, s.uid, target, null, 0); return s; };
const nextTurn = (st) => { E.endTurn(st); E.endTurn(st); };

for (const id of ['sigil_of_silence', 'demon_companion', 'double_jump', 'red_card', 'wings_of_hate', 'fel_guardians', 'second_slice', 'twin_slice']) ok(`${id} present`, cardsById[id], id);

// Sigil of Silence: at the start of your next turn, silence all enemy minions
{
	const st = game();
	const foe = enemyKw(st, ['taunt', 'divine_shield']); foe.shield = true;
	cast(st, 'sigil_of_silence');
	ok('Sigil of Silence: no immediate silence', foe.keywords.includes('taunt'), foe.keywords);
	nextTurn(st);
	ok('Sigil of Silence: enemy minions silenced next turn', foe.keywords.length === 0, foe.keywords);
}

// Demon Companion: summons one of the 3 companions
{
	const st = game();
	cast(st, 'demon_companion');
	const summoned = st.players[0].board.find(c => ['Reffuh', 'Kolek', 'Dreadful Fiend'].includes(c.name));
	ok('Demon Companion summoned a companion', summoned && (summoned.tribe || '').includes('Demon'), summoned && summoned.name);
}

// Double Jump: tutors an Outcast card from the deck
{
	const st = game();
	st.players[0].deck = ['t_plain', 't_out', 't_plain'];
	cast(st, 'double_jump');
	ok('Double Jump drew the Outcast card', st.players[0].hand.some(c => c.id === 't_out'), st.players[0].hand.map(c => c.id));
}

// Red Card: makes a minion Dormant for 2 turns
{
	const st = game();
	const foe = enemyKw(st, []);
	cast(st, 'red_card', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Red Card made the minion Dormant', foe.dormantLeft > 0, foe.dormantLeft);
}

// Wings of Hate: 1/1 Felwings; 2/2 at 5 Mana; 3/3 at 10 Mana
{
	const st = game(7, 4);
	cast(st, 'wings_of_hate');
	const w = st.players[0].board.filter(c => c.name === 'Felwing');
	ok('Wings of Hate at 4 Mana: two 1/1 Felwings', w.length === 2 && w[0].attack === 1, w.map(x => x.attack));
}
{
	const st = game(7, 5);
	cast(st, 'wings_of_hate');
	const w = st.players[0].board.filter(c => c.name === 'Felwing');
	ok('Wings of Hate at 5 Mana: two 2/2 Felwings', w.length === 2 && w[0].attack === 2, w.map(x => x.attack));
}

// Fel Guardians: costs (1) less per friendly minion that died this game
{
	const st = game();
	const g = E.instantiate(cardsById.fel_guardians, 0); g.zone = 'hand'; st.players[0].hand.push(g);
	ok('Fel Guardians base cost 7', E.effectiveCost(st, 0, g) === 7, E.effectiveCost(st, 0, g));
	st.players[0].friendlyDeaths = 3;
	ok('Fel Guardians costs 4 after 3 friendly deaths', E.effectiveCost(st, 0, g) === 4, E.effectiveCost(st, 0, g));
}

// Twin Slice: +2 hero Attack + adds Second Slice (which also gives +2)
{
	const st = game();
	cast(st, 'twin_slice');
	ok('Twin Slice: hero +2 Attack', E.heroAttackValue(st, st.players[0]) === 2, E.heroAttackValue(st, st.players[0]));
	ok('Twin Slice added Second Slice to hand', st.players[0].hand.some(c => c.id === 'second_slice'), st.players[0].hand.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
