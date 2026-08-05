// DH spell-import batch 3 — behavioral checks on the trickier survivors.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_min = { id: 't_min', name: 'Mn', type: 'creature', cost: 1, attack: 1, health: 1 };
cardsById.t_rush = { id: 't_rush', name: 'Rsh', type: 'creature', cost: 3, attack: 3, health: 3, keywords: ['rush'] };
cardsById.t_spell = { id: 't_spell', name: 'Sp', type: 'sorcery', cost: 1, effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'demonhunter', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'demonhunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, hp = 9) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 3, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendlyDemon = (st, atk = 3, hp = 3) => { const m = E.instantiate({ id: 'fd', name: 'Fiend', type: 'creature', cost: 2, attack: atk, health: hp, tribe: 'Demon' }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); };
const nextTurn = (st) => { E.endTurn(st); E.endTurn(st); };

for (const id of ['security', 'sigil_of_summoning', 'sinful_brand', 'void_blast', 'soul_split', 'skirting_death', 'feldorei_warband', 'rush_the_stage']) ok(`${id} present`, cardsById[id], id);

// SECURITY!!: two 1/1 Illidari with Rush; Outcast (edge play) -> one more
{
	const st = game();
	// non-edge: fillers around it
	const f1 = E.instantiate(cardsById.t_spell, 0), f2 = E.instantiate(cardsById.t_spell, 0), s = E.instantiate(cardsById.security, 0);
	f1.zone = f2.zone = s.zone = 'hand'; st.players[0].hand.push(f1, s, f2); st.players[0].mana.cur = 10;
	E.playCard(st, 0, s.uid, null, null, 0);
	ok('SECURITY (no Outcast): two Illidari', st.players[0].board.filter(c => c.name === 'Illidari').length === 2, st.players[0].board.length);
}
{
	const st = game();
	cast(st, 'security'); // sole card = edge = Outcast
	ok('SECURITY (Outcast): three Illidari', st.players[0].board.filter(c => c.name === 'Illidari').length === 3, st.players[0].board.length);
}

// Sigil of Summoning: two 2/2 Demons with Taunt at the start of your next turn
{
	const st = game();
	cast(st, 'sigil_of_summoning');
	ok('Sigil: nothing yet', st.players[0].board.length === 0, st.players[0].board.length);
	nextTurn(st);
	const d = st.players[0].board.filter(c => c.attack === 2 && c.keywords.includes('taunt'));
	ok('Sigil: two 2/2 Taunt Demons next turn', d.length === 2, st.players[0].board.length);
}

// Void Blast: 3 to a minion; if it dies, get a Void Soul
{
	const st = game();
	const foe = enemy(st, 3);
	cast(st, 'void_blast', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Void Blast killed the minion + got a Void Soul', st.players[0].hand.some(c => c.id === 'void_soul'), st.players[0].hand.map(c => c.id));
}

// Soul Split: summon a copy of a friendly Demon
{
	const st = game();
	const demon = friendlyDemon(st, 4, 5);
	cast(st, 'soul_split', { type: 'creature', uid: demon.uid, player: 0 });
	ok('Soul Split copied the Demon (2 now)', st.players[0].board.filter(c => c.name === 'Fiend').length === 2, st.players[0].board.length);
}

// Skirting Death: hero steals 4 Attack from a minion this turn
{
	const st = game();
	const foe = enemy(st, 9); foe.attack = 6;
	cast(st, 'skirting_death', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Skirting Death: hero gained 4 Attack', E.heroAttackValue(st, st.players[0]) === 4, E.heroAttackValue(st, st.players[0]));
	ok('Skirting Death: minion lost 4 Attack (6 -> 2)', foe.attack === 2, foe.attack);
}

// Fel'dorei Warband: 4 damage; if deck has no minions, summon four Illidari
{
	const st = game(); st.players[0].deck = ['t_spell'];
	const foe = enemy(st, 20);
	cast(st, 'feldorei_warband', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Feldorei (no minions in deck): dealt 4 + summoned 4 Illidari', foe.damage === 4 && st.players[0].board.filter(c => c.name === 'Illidari').length === 4, [foe.damage, st.players[0].board.length]);
}

// Rush the Stage: draw two Rush minions, costing (1) less
{
	const st = game(); st.players[0].deck = ['t_min', 't_rush', 't_rush', 't_min'];
	cast(st, 'rush_the_stage');
	const drawn = st.players[0].hand.filter(c => c.id === 't_rush');
	ok('Rush the Stage drew Rush minions', drawn.length >= 1, st.players[0].hand.map(c => c.id));
	ok('the drawn Rush minions cost 1 less (3 -> 2)', drawn.length && drawn.every(c => c.cost === 2), drawn.map(c => c.cost));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
