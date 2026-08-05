// Hunter spell-import batch 2 — Beast/utility slice + the beasts-you-control scaler.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'M', power: null }, { id: 'hunter', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.board = []; p.deck = []; }
	st.players[0].heroClass = 'hunter'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const cast = (st, id, target = null, choice = null) => { const s = E.instantiate(cardsById[id], 0); s.zone = 'hand'; st.players[0].hand.push(s); st.players[0].mana.cur = 10; E.playCard(st, 0, s.uid, target, choice, 0); return s; };
const enemy = (st, hp = 9) => { const m = E.instantiate({ id: 'e', name: 'Ox', type: 'creature', cost: 3, attack: 2, health: hp }, 1); m.zone = 'board'; m.sick = false; st.players[1].board.push(m); return m; };
const beast = (st, atk = 2, hp = 2) => { const m = E.instantiate({ id: 'b', name: 'B', type: 'creature', cost: 1, attack: atk, health: hp, tribe: 'Beast' }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };

for (const id of ['overwhelm', 'ricochet_shot', 'shimmer_shot', 'corrosive_breath', 'cower_in_fear', 'feign_death', 'bestial_madness', 'frenzied_fangs', 'dinomancy', 'the_marsh_queen', 'unseal_the_vault', 'always_a_bigger_jormungar'])
	ok(`${id} present`, cardsById[id], id);

// Overwhelm: 2 damage + 1 per Beast you control (the new valuePer scaler)
{
	const st = game();
	beast(st); beast(st); beast(st); // control 3 Beasts -> 2 + 3 = 5
	const foe = enemy(st, 9);
	cast(st, 'overwhelm', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Overwhelm dealt 2 + (3 Beasts) = 5', foe.damage === 5, foe.damage);
}
{
	const st = game(); // no Beasts -> flat 2
	const foe = enemy(st, 9);
	cast(st, 'overwhelm', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Overwhelm with no Beasts deals the flat 2', foe.damage === 2, foe.damage);
}

// Ricochet Shot: 3 hits of 1 damage spread across enemies
{
	const st = game();
	const a = enemy(st, 9), b = enemy(st, 9);
	const heroBefore = st.players[1].life;
	cast(st, 'ricochet_shot');
	const total = a.damage + b.damage + (heroBefore - st.players[1].life);
	ok('Ricochet Shot dealt 3 total damage across enemies', total === 3, total);
}

// Corrosive Breath: 3 to a minion; +3 to enemy hero only if holding a Dragon
{
	const st = game();
	const foe = enemy(st, 9);
	cast(st, 'corrosive_breath', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Corrosive Breath dealt 3 to the minion (no Dragon)', foe.damage === 3, foe.damage);
	const st2 = game();
	st2.players[0].hand.push(E.instantiate({ id: 'drag', name: 'D', type: 'creature', cost: 5, attack: 5, health: 5, tribe: 'Dragon' }, 0));
	const foe2 = enemy(st2, 9); const heroBefore = st2.players[1].life;
	cast(st2, 'corrosive_breath', { type: 'creature', uid: foe2.uid, player: 1 });
	ok('holding a Dragon, Corrosive Breath also hit the enemy hero for 3', st2.players[1].life === heroBefore - 3, [heroBefore, st2.players[1].life]);
}

// Cower in Fear: 3 to a minion + your next Beast this turn costs (2) less
{
	const st = game();
	const foe = enemy(st, 9);
	cast(st, 'cower_in_fear', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Cower in Fear dealt 3', foe.damage === 3, foe.damage);
	const b = E.instantiate({ id: 'wolf', name: 'Wolf', type: 'creature', cost: 4, attack: 3, health: 3, tribe: 'Beast' }, 0); b.zone = 'hand'; st.players[0].hand.push(b);
	ok('a Beast now costs 2 less (4 -> 2)', E.effectiveCost(st, 0, b) === 2, E.effectiveCost(st, 0, b));
}

// Feign Death: trigger all friendly Deathrattles (without the minions dying)
{
	const st = game();
	const dr = E.instantiate({ id: 'ticker', name: 'Ticker', type: 'creature', cost: 2, attack: 2, health: 3, keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 3, target: 'enemy-heroes' }] }, 0);
	dr.zone = 'board'; dr.sick = false; st.players[0].board.push(dr);
	const heroBefore = st.players[1].life;
	cast(st, 'feign_death');
	ok('Feign Death fired the Deathrattle (3 to enemy hero)', st.players[1].life === heroBefore - 3, [heroBefore, st.players[1].life]);
	ok('the minion is still alive', st.players[0].board.some(c => c.id === 'ticker'), st.players[0].board.map(c => c.id));
}

// Bestial Madness: +1 Attack to minions in hand, deck, AND battlefield
{
	const st = game();
	const onBoard = beast(st, 2, 2);
	const inHand = E.instantiate({ id: 'h', name: 'H', type: 'creature', cost: 2, attack: 1, health: 1 }, 0); inHand.zone = 'hand'; st.players[0].hand.push(inHand);
	cast(st, 'bestial_madness');
	ok('Bestial Madness buffed the board minion +1 Attack', onBoard.attack === 3, onBoard.attack);
	ok('Bestial Madness buffed the hand minion +1 Attack', inHand.attack === 2, inHand.attack);
}

// Frenzied Fangs: base summons two 2/1 Bats; Infuse(3) version summons 3/3 Bats
{
	const st = game();
	cast(st, 'frenzied_fangs');
	const bats = st.players[0].board.filter(c => c.name === 'Bat');
	ok('Frenzied Fangs summoned two 2/1 Bats', bats.length === 2 && bats[0].attack === 2, bats.map(b => [b.attack, E.hp(b)]));
	ok('the Infuse token exists as a 3/3 summon', cardsById.frenzied_fangs_infused && cardsById.frenzied_fangs_infused.effects[0].attack === 3, cardsById.frenzied_fangs_infused?.effects);
}

// Dinomancy: replace your Hero Power with "Give a Beast +3/+3"
{
	const st = game();
	cast(st, 'dinomancy');
	ok('Dinomancy swapped in the hp_dinomancy Hero Power', st.players[0].heroPowers.some(h => h.id === 'hp_dinomancy'), st.players[0].heroPowers.map(h => h.id));
}

// The Marsh Queen: installs as a quest
{
	const st = game();
	cast(st, 'the_marsh_queen');
	ok('The Marsh Queen installed as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
