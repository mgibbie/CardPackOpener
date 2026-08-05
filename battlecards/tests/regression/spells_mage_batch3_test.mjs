// Mage spell-import batch 3 — behavioral checks (secrets, copies, excess, deathrattle-grant).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById.t_cheap = { id: 't_cheap', name: 'Cheap', type: 'creature', cost: 1, attack: 1, health: 1 };
cardsById.t_mid = { id: 't_mid', name: 'Mid', type: 'creature', cost: 4, attack: 3, health: 3 };
cardsById.t_bolt = { id: 't_bolt', name: 'Bolt', type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 0 }] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'mage'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const enemy = (st, hp = 9) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 1, attack: 0, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const friendly = (st, atk = 3, hp = 4) => { const m = E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 3, attack: atk, health: hp }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const cast = (st, id, target = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, null, 0); };

for (const id of ['netherwind_portal', 'rigged_faire_game', 'arcane_flow', 'bursting_leyline', 'molten_reflection', 'sheep_mask', 'simulacrum', 'seafloor_gateway']) ok(`${id} present`, cardsById[id], id);

// Arcane Flow: 4 to a target + 2 to all enemies
{
	const st = game();
	const a = enemy(st, 9), b = enemy(st, 9);
	const heroBefore = st.players[1].life;
	cast(st, 'arcane_flow', { type: 'creature', uid: a.uid, player: 1 });
	ok('Arcane Flow: 4+2 to the target, 2 to the other, 2 to hero', a.damage === 6 && b.damage === 2 && st.players[1].life === heroBefore - 2, [a.damage, b.damage, heroBefore - st.players[1].life]);
}

// Bursting Leyline: 4 to a random enemy minion, excess to enemy hero
{
	const st = game();
	const only = enemy(st, 2); // 2 hp -> 2 excess to hero
	const heroBefore = st.players[1].life;
	cast(st, 'bursting_leyline');
	ok('Bursting Leyline killed the minion + 2 excess to hero', st.players[1].life === heroBefore - 2, [heroBefore, st.players[1].life]);
}

// Molten Reflection: summon a copy of a friendly minion
{
	const st = game();
	const m = friendly(st, 4, 5);
	cast(st, 'molten_reflection', { type: 'creature', uid: m.uid, player: 0 });
	ok('Molten Reflection copied the friendly minion', st.players[0].board.filter(c => c.name === 'F').length === 2, st.players[0].board.length);
}

// Sheep Mask: set a minion to 1/1 + grant "Deathrattle: 2 to all minions"
{
	const st = game();
	const target = enemy(st, 9); target.attack = 6;
	const bystander = friendly(st, 3, 5);
	cast(st, 'sheep_mask', { type: 'creature', uid: target.uid, player: 1 });
	ok('Sheep Mask set stats to 1/1', target.attack === 1 && E.hp(target) === 1, [target.attack, E.hp(target)]);
	ok('Sheep Mask granted a Deathrattle', (target.deathrattle || []).length > 0, target.deathrattle);
	target.damage = target.maxHealth; E.sweepDeaths(st);
	ok('the granted Deathrattle dealt 2 to all minions', bystander.damage === 2, bystander.damage);
}

// Simulacrum: copy the lowest-Cost minion in your hand
{
	const st = game();
	const cheap = E.instantiate(cardsById.t_cheap, 0); cheap.zone = 'hand'; st.players[0].hand.push(cheap);
	const mid = E.instantiate(cardsById.t_mid, 0); mid.zone = 'hand'; st.players[0].hand.push(mid);
	cast(st, 'simulacrum');
	ok('Simulacrum copied the lowest-Cost minion (t_cheap)', st.players[0].hand.filter(c => c.id === 't_cheap').length === 2, st.players[0].hand.map(c => c.id));
}

// Netherwind Portal (Secret): opponent casts a spell -> summon a random 4-Cost minion
{
	const st = game(); cast(st, 'netherwind_portal');
	ok('Netherwind Portal is an active Secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
	st.current = 1;
	const boardBefore = st.players[0].board.length;
	const sp = E.instantiate(cardsById.t_bolt, 1); sp.zone = 'hand'; st.players[1].hand.push(sp); st.players[1].mana.cur = 10;
	E.playCard(st, 1, sp.uid, null, null, 0); // enemy casts a spell -> secret fires
	ok('Netherwind Portal summoned a minion for you', st.players[0].board.length === boardBefore + 1, [boardBefore, st.players[0].board.length]);
	ok('the summoned minion costs 4', st.players[0].board.length && cardsById[st.players[0].board[st.players[0].board.length - 1].id]?.cost === 4, st.players[0].board.at(-1)?.id);
}

// Rigged Faire Game (Secret): draw 3 if you took no damage during the opponent's turn
{
	const st = game(); st.players[0].deck = ['t_cheap', 't_cheap', 't_cheap', 't_cheap'];
	cast(st, 'rigged_faire_game');
	st.current = 1;
	const handBefore = st.players[0].hand.length;
	E.endTurn(st); // opponent's turn ends, hero took no damage -> draw 3 (+1 mandatory start-of-turn draw)
	ok('Rigged Faire Game drew 3 (no damage taken) + the turn-start draw', st.players[0].hand.length === handBefore + 4, [handBefore, st.players[0].hand.length]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
