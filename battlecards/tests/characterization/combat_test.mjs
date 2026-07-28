// combat_test.mjs — characterization of vanilla combat: attack legality,
// target restriction, mutual strikes, keyword interactions, hero attacks.
// These pin CURRENT behavior (including this engine's non-HS Poisonous).
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const sc = () => new Scenario(byId)
	.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
	.def('t_big', { type: 'creature', cost: 6, attack: 6, health: 7 })
	.def('t_taunt', { type: 'creature', cost: 2, attack: 2, health: 4, keywords: ['taunt'] })
	.def('t_stealth', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['stealth'] })
	.def('t_shield', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['divine_shield'] })
	.def('t_wind', { type: 'creature', cost: 3, attack: 2, health: 4, keywords: ['windfury'] })
	.def('t_rush', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['rush'] })
	.def('t_charge', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['charge'] })
	.def('t_fs', { type: 'creature', cost: 2, attack: 3, health: 2, keywords: ['first_strike'] })
	.def('t_ls', { type: 'creature', cost: 3, attack: 3, health: 3, keywords: ['lifesteal'] })
	.def('t_poison', { type: 'creature', cost: 2, attack: 1, health: 3, keywords: ['poisonous'] })
	.def('t_venom', { type: 'creature', cost: 2, attack: 1, health: 3, keywords: ['venomous'] })
	.def('t_pierce', { type: 'creature', cost: 3, attack: 3, health: 3, keywords: ['piercing'] });

// --- mutual damage: both survive a non-lethal trade ---
{
	const r = sc().board(0, ['t_bear']).board(1, [{ id: 't_big' }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectHp(1, 0, 4)                     // 7 - 3
		.expectDead(0, 0)                      // bear (3 hp) dies to 6 attack
		.run();
	ok('trade: damage is mutual and lethal side dies', r.failures.length === 0, r.failures);
}
// --- both die on exact lethal ---
{
	const r = sc().board(0, ['t_bear']).board(1, ['t_bear'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectDead(0, 0).expectDead(1, 0)
		.run();
	ok('3/3 into 3/3: both die', r.failures.length === 0, r.failures);
}
// --- taunt restricts creature attacks and hero attacks ---
{
	const s = new Scenario(byId); // reuse defs via sc()
	const r = sc().board(0, ['t_bear']).board(1, ['t_bear', 't_taunt'])
		.expect('taunt gates targets', st => {
			const atk = st.players[0].board[0];
			const ts = E.attackTargets(st, 0, atk);
			return ts.length === 1 && ts[0].uid === st.players[1].board[1].uid;
		})
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE)        // face attack was rejected
		.run();
	ok('taunt: only the taunt is attackable; face attack rejected', r.failures.length === 0, r.failures);
}
// --- piercing ignores taunt walls ---
{
	const r = sc().board(0, ['t_pierce']).board(1, ['t_taunt'])
		.expect('piercing sees face + all minions', st => {
			const ts = E.attackTargets(st, 0, st.players[0].board[0]);
			return ts.some(t => t.type === 'hero');
		})
		.run();
	ok('piercing: taunt does not gate targets', r.failures.length === 0, r.failures);
}
// --- stealth: untargetable by attacks; pops when the stealthed minion attacks ---
{
	const r = sc().board(0, ['t_bear']).board(1, ['t_stealth'])
		.expect('stealthed minion not attackable', st =>
			!E.attackTargets(st, 0, st.players[0].board[0]).some(t => t.type === 'creature'))
		.run();
	ok('stealth: excluded from attack targets', r.failures.length === 0, r.failures);
	const r2 = sc().board(0, ['t_stealth']).board(1, [])
		.attack(0, 0, { targetHero: 1 })
		.expect('stealth popped after attacking', st => st.players[0].board[0].stealthed === false)
		.run();
	ok('stealth: breaks when the stealthed minion attacks', r2.failures.length === 0, r2.failures);
}
// --- divine shield absorbs exactly one instance ---
{
	const r = sc().board(0, ['t_bear', 't_bear']).board(1, [{ id: 't_shield', health: 4 }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectHp(1, 0, 4)                      // shield ate the first hit...
		.expectHp(0, 0, 1)                      // ...but the shielded minion still struck back
		.attack(0, 1, { targetBoard: [1, 0] })
		.expectHp(1, 0, 1)                      // second hit lands (4 - 3)
		.run();
	ok('divine shield: absorbs first hit only; retaliation still happens', r.failures.length === 0, r.failures);
}
// --- windfury: two attacks per turn, not three ---
{
	const r = sc().board(0, ['t_wind']).board(1, [])
		.attack(0, 0, { targetHero: 1 })
		.attack(0, 0, { targetHero: 1 })
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE - 4)     // 2 + 2, third swing rejected
		.run();
	ok('windfury: exactly two attacks', r.failures.length === 0, r.failures);
}
// --- summoning sickness: plain minion can't attack the turn it arrives ---
{
	const r = sc().board(0, [{ id: 't_bear', sick: true }]).board(1, [])
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE)
		.run();
	ok('sick minion cannot attack', r.failures.length === 0, r.failures);
}
// --- charge attacks anything while sick; rush is creatures-only ---
{
	const r = sc().board(0, [{ id: 't_charge', sick: true }]).board(1, [])
		.attack(0, 0, { targetHero: 1 })
		.expectLife(1, E.STARTING_LIFE - 2)
		.run();
	ok('charge: may hit face while sick', r.failures.length === 0, r.failures);
	const r2 = sc().board(0, [{ id: 't_rush', sick: true }]).board(1, ['t_bear'])
		.expect('rush-while-sick offers creatures only', st =>
			!E.attackTargets(st, 0, st.players[0].board[0]).some(t => t.type === 'hero'))
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE)
		.attack(0, 0, { targetBoard: [1, 0], mayFail: true })
		.expectHp(1, 0, 1)
		.run();
	ok('rush: creatures only while sick', r2.failures.length === 0, r2.failures);
}
// --- frozen and 0-attack minions cannot attack ---
{
	const r = sc().board(0, ['t_bear', { id: 't_bear', attack: 0 }]).board(1, [])
		.do(st => { st.players[0].board[0].frozen = st.turnNumber; })
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.attack(0, 1, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE)
		.run();
	ok('frozen and 0-attack: no attacks', r.failures.length === 0, r.failures);
}
// --- attacksUsed resets at the attacker's next turn ---
{
	// NOTE: empty decks fatigue at each turn start — stock filler so life math stays clean
	const r = sc().def('t_filler', { type: 'creature', cost: 9, attack: 1, health: 1 })
		.deck(0, Array(4).fill('t_filler')).deck(1, Array(4).fill('t_filler'))
		.board(0, ['t_bear']).board(1, [])
		.attack(0, 0, { targetHero: 1 })
		.attack(0, 0, { targetHero: 1, mayFail: true })
		.endTurn(2)
		.attack(0, 0, { targetHero: 1 })
		.expectLife(1, E.STARTING_LIFE - 6)
		.run();
	ok('attack allowance refreshes each turn', r.failures.length === 0, r.failures);
}
// --- first strike: no retaliation when the first strike is lethal ---
{
	const r = sc().board(0, ['t_fs']).board(1, [{ id: 't_bear', health: 3 }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectDead(1, 0)
		.expectHp(0, 0, 2)                      // untouched: defender died before striking
		.run();
	ok('first strike: lethal hit prevents retaliation', r.failures.length === 0, r.failures);
	// both first strike -> simultaneous (neither is "first")
	const r2 = sc().board(0, ['t_fs']).board(1, [{ id: 't_fs', health: 2, attack: 3 }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectDead(0, 0).expectDead(1, 0)
		.run();
	ok('double first strike: simultaneous strikes', r2.failures.length === 0, r2.failures);
}
// --- lifesteal heals the controller on combat damage ---
{
	const r = sc().life(0, 20).board(0, ['t_ls']).board(1, [{ id: 't_big', attack: 0 }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectLife(0, 23)
		.run();
	ok('lifesteal: combat damage heals the hero', r.failures.length === 0, r.failures);
}
// --- THIS ENGINE'S poisonous: a condition, not instant death ---
{
	const r = sc().board(0, ['t_poison']).board(1, [{ id: 't_big' }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expect('target survives but is Poisoned', st => {
			const t = st.players[1].board[0];
			return t && t.poisoned === true && E.hp(t) === 6;
		})
		.endTurn(2)                             // ticks at the END of the POISONED minion's CONTROLLER's turn
		.expect('poison ticked for 2', st => E.hp(st.players[1].board[0]) === 4)
		.run();
	ok('poisonous = Poisoned condition (2 dmg at poisoner\'s end of turn), NOT instant kill', r.failures.length === 0, r.failures);
}
// --- venomous: one-shot doom, keyword consumed ---
{
	const r = sc().board(0, ['t_venom']).board(1, [{ id: 't_big', attack: 0 }, { id: 't_big' }])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expectDead(1, 0)
		.expect('venom spent after one kill', st => !E.has(st.players[0].board[0], E.KW.VENOMOUS))
		.run();
	ok('venomous: destroys on first hit, then is consumed', r.failures.length === 0, r.failures);
}
// --- attacks resolve synchronously when nobody can respond ---
{
	const r = sc().board(0, ['t_bear']).board(1, [])
		.attack(0, 0, { targetHero: 1 })
		.expect('no lingering stack or priority', st => st.stack.length === 0 && st.priority == null)
		.expectLife(1, E.STARTING_LIFE - 3)
		.run();
	ok('attack resolves immediately with no responders', r.failures.length === 0, r.failures);
}
// --- hero attack with a weapon: durability, retaliation, break ---
{
	const s = new Scenario(byId)
		.def('t_bear', { type: 'creature', cost: 2, attack: 3, health: 3 })
		.board(1, [{ id: 't_bear', health: 8 }])
		.do((st) => {                            // equip a plain 4/2 weapon via engine effect path
			// use the tested 'equip' effect shape through a proxy spell
			st.players[0].deck.push('t_wpn'); });
	s.def('t_wpn', { type: 'sorcery', cost: 0, effects: [{ type: 'equip', name: 'Test Axe', attack: 4, durability: 2 }] });
	const r = s.hand(0, ['t_wpn']).play(0, 't_wpn')
		.expect('weapon equipped 4/2', st => st.players[0].weapon && st.players[0].weapon.attack === 4 && st.players[0].weapon.durability === 2)
		.heroAttack(0, { targetBoard: [1, 0] })
		.expectHp(1, 0, 4)
		.expect('hero took retaliation', st => st.players[0].life === E.STARTING_LIFE - 3)
		.expect('durability spent', st => !st.players[0].weapon || st.players[0].weapon.durability === 1)
		.run();
	ok('hero attack: weapon damage, defender retaliation, durability loss', r.failures.length === 0, r.failures);
}
// --- hero attack allowance: once per turn without windfury ---
{
	const s = sc().def('t_wpn', { type: 'sorcery', cost: 0, effects: [{ type: 'equip', name: 'Test Axe', attack: 2, durability: 4 }] });
	const r = s.hand(0, ['t_wpn']).play(0, 't_wpn')
		.heroAttack(0, { targetHero: 1 })
		.heroAttack(0, { targetHero: 1, mayFail: true })
		.expectLife(1, E.STARTING_LIFE - 2)
		.run();
	ok('hero attacks once per turn', r.failures.length === 0, r.failures);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
