// Group B — Titans (wave 3b): Aggramar (weapon abilities) + Sargeras (portal).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 8) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'hunter', name: 'H', power: null }, { id: 'warlock', name: 'W', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[1].mana.max = 10; st.players[1].mana.cur = 10;
	return st;
};
const play = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, null, 0); return st.players[pi].board.find(b => b.id === id); };
const putBoard = (st, pi, id, def) => { const c = E.instantiate(def || cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); return c; };
const dummyDef = (a, h, name = 'D') => ({ id: 'dm_' + name, name, type: 'creature', cost: 3, rarity: 'basic', attack: a, health: h });

ok('Aggramar is a 3/7 Titan with a Battlecry + 3 abilities', cardsById['aggramar_the_avenger'].titan && cardsById['aggramar_the_avenger'].activated.length === 3 && cardsById['aggramar_the_avenger'].keywords.includes('battlecry'));
ok('Sargeras is a 6/12 Titan with a Battlecry + 3 abilities', cardsById['sargeras_the_destroyer'].titan && cardsById['sargeras_the_destroyer'].activated.length === 3);

// ---------- Aggramar: Battlecry equips a 3/3 Taeshalach ----------
{
	const st = game();
	const ag = play(st, 0, 'aggramar_the_avenger');
	ok('Battlecry equipped a 3/3 Taeshalach', st.players[0].weapon && st.players[0].weapon.attack === 3 && st.players[0].weapon.durability === 3, st.players[0].weapon && [st.players[0].weapon.attack, st.players[0].weapon.durability]);
	ok('the Titan itself cannot attack yet (0 abilities used)', !E.canAttackWith(st, 0, ag));
}

// ---------- Aggramar: Maintain Order = weapon "After your hero attacks, draw a card" ----------
{
	const st = game();
	const ag = play(st, 0, 'aggramar_the_avenger');
	st.players[0].deck = ['chillwind_yeti', 'wolfrider'].filter(id => cardsById[id]);
	E.activateAbility(st, 0, ag.uid, 0, null); // Maintain Order
	ok('weapon carries an after-hero-attack trigger', (st.players[0].weapon.afterHeroAttack || []).length === 1);
	const hand0 = st.players[0].hand.length;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('after the hero attacks: drew a card', st.players[0].hand.length === hand0 + 1, [hand0, st.players[0].hand.length]);
}

// ---------- Aggramar: Commanding Presence = weapon summons a 3/3 Enforcer after a hero attack ----------
{
	const st = game();
	const ag = play(st, 0, 'aggramar_the_avenger');
	E.activateAbility(st, 0, ag.uid, 1, null); // Commanding Presence
	const board0 = st.players[0].board.length;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	const enf = st.players[0].board.find(c => c.name === 'Enforcer');
	ok('after the hero attacks: a 3/3 Enforcer with Taunt appears', enf && enf.attack === 3 && E.hp(enf) === 3 && enf.keywords.includes('taunt'), enf && [enf.attack, E.hp(enf)]);
}

// ---------- Aggramar: Swift Slash = weapon +2 Attack and hero Immune while attacking ----------
{
	const st = game();
	const ag = play(st, 0, 'aggramar_the_avenger');
	E.activateAbility(st, 0, ag.uid, 2, null); // Swift Slash
	ok('weapon gained +2 Attack (3 -> 5)', st.players[0].weapon.attack === 5, st.players[0].weapon.attack);
	const blocker = putBoard(st, 1, null, dummyDef(6, 10, 'Blocker')); // would deal 6 back
	const life0 = st.players[0].life;
	E.heroAttack(st, 0, { type: 'creature', uid: blocker.uid, player: 1 });
	ok('the hero took NO retaliation (Immune while attacking)', st.players[0].life === life0, [life0, st.players[0].life]);
	ok('the weapon still hit the blocker for 5', blocker.damage === 5, blocker.damage);
}

// ---------- Sargeras: the portal (an ongoing) summons two 3/2 Imps at end of turn ----------
{
	const st = game();
	play(st, 0, 'sargeras_the_destroyer');
	const board0 = st.players[0].board.filter(c => c.name === 'Imp').length;
	E.endTurn(st); // end of player 0's turn
	const imps = st.players[0].board.filter(c => c.name === 'Imp');
	ok('exactly two 3/2 Imps summoned at end of your turn (no double-portal)', imps.length === board0 + 2 && imps.every(c => c.attack === 3 && E.hp(c) === 2), imps.map(c => [c.attack, E.hp(c)]));
}

// ---------- Sargeras: To the Void! wipes all OTHER minions ----------
{
	const st = game();
	const sg = putBoard(st, 0, 'sargeras_the_destroyer');
	putBoard(st, 0, null, dummyDef(2, 2, 'Mine'));
	putBoard(st, 1, null, dummyDef(2, 2, 'Theirs'));
	E.activateAbility(st, 0, sg.uid, 0, null); // To the Void!
	ok('all OTHER minions are gone, Sargeras survives', st.players[0].board.length === 1 && st.players[0].board[0] === sg && st.players[1].board.filter(c => c.type === 'creature').length === 0);
}

// ---------- Sargeras: Inferno! + Legion Invasion! ----------
{
	const st = game();
	const sg = putBoard(st, 0, 'sargeras_the_destroyer');
	E.activateAbility(st, 0, sg.uid, 1, null); // Inferno! -> two 6/6 Infernals
	const inf = st.players[0].board.filter(c => c.name === 'Infernal');
	ok('Inferno! summoned two 6/6 Infernals (Demon)', inf.length === 2 && inf.every(c => c.attack === 6 && E.hp(c) === 6 && (c.tribe || '').includes('Demon')), inf.map(c => [c.attack, E.hp(c)]));

	const st2 = game();
	const sg2 = putBoard(st2, 0, 'sargeras_the_destroyer');
	E.activateAbility(st2, 0, sg2.uid, 2, null); // Legion Invasion!
	ok('Legion Invasion set the demon-summon buff', st2.players[0].legionInvasion === true);
	const demon = E.summon(st2, 0, { id: 'token_test_demon', name: 'Voidling', type: 'creature', cost: 3, token: true, rarity: 'common', tribe: 'Demon', attack: 3, health: 3, description: 'x' });
	ok('a future Demon summon gains +2 Health and Taunt (3/3 -> 3/5 Taunt)', demon && demon.attack === 3 && E.hp(demon) === 5 && demon.keywords.includes('taunt'), demon && [demon.attack, E.hp(demon)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
