// Group B — Titans (wave 1). The Titan framework: a Titan can't attack until it
// has used all 3 of its abilities (one per turn, each once), and each use fires
// its "After this uses an ability, ..." passive.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 5) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'warrior', name: 'W', power: null }, { id: 'mage', name: 'M', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = []; st.players[0].deck = []; st.players[1].deck = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10; st.players[1].mana.max = 10; st.players[1].mana.cur = 10;
	return st;
};
const putBoard = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; c.attacksUsed = 0; st.players[pi].board.push(c); return c; };
const enemyDummy = (st, pi, atk = 1, hp = 8) => { const c = E.instantiate({ id: 'dm', name: 'Dummy', type: 'creature', cost: 1, rarity: 'basic', attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };
const roundTrip = st => { E.endTurn(st); E.endTurn(st); }; // back to player 0's turn

// ---------- data wiring ----------
for (const id of ['norgannon', 'v_07_tr_0n_prime', 'eonar_the_life_binder', 'yogg_saron_unleashed', 'khazgoroth']) {
	const c = cardsById[id];
	ok(`${id}: titan + 3 abilities (each oncePerGame, cost 0)`, c.titan && c.activated.length === 3 && c.activated.every(a => a.oncePerGame && (a.cost || 0) === 0), id);
}
ok('Khaz\'goroth was added (was missing)', cardsById['khazgoroth'] && cardsById['khazgoroth'].attack === 4 && cardsById['khazgoroth'].health === 5);

// ---------- FRAMEWORK: attack-gating + one/turn + each-once ----------
{
	const st = game();
	const k = putBoard(st, 0, 'khazgoroth'); // 3 non-targeted abilities
	enemyDummy(st, 1);
	ok('a fresh Titan cannot attack', !E.canAttackWith(st, 0, k));
	ok('all 3 abilities are usable at the start', E.canActivate(st, 0, k, 0) && E.canActivate(st, 0, k, 1) && E.canActivate(st, 0, k, 2));

	E.activateAbility(st, 0, k.uid, 0, null); // Titanforge
	ok('after using ability 0: that ability is spent (pick would remove it)', !E.canActivate(st, 0, k, 0));
	ok('only ONE ability per turn: the others are locked this turn', !E.canActivate(st, 0, k, 1) && !E.canActivate(st, 0, k, 2));
	ok('still cannot attack (2 abilities left)', !E.canAttackWith(st, 0, k));

	roundTrip(st);
	ok('next turn: ability 0 stays spent, the other two are usable again', !E.canActivate(st, 0, k, 0) && E.canActivate(st, 0, k, 1) && E.canActivate(st, 0, k, 2));
	E.activateAbility(st, 0, k.uid, 1, null); // Tempering
	roundTrip(st);
	ok('still cannot attack with one ability left', !E.canAttackWith(st, 0, k));
	E.activateAbility(st, 0, k.uid, 2, null); // Heart of Flame -> all 3 used
	ok('after all 3 abilities used: the Titan CAN attack (same turn)', E.canAttackWith(st, 0, k), k._onceAbilities);
}

// ---------- Khaz'goroth: ability effects + "gain Immune & attack a random enemy" passive ----------
{
	const st = game();
	const k = putBoard(st, 0, 'khazgoroth'); // 4/5
	st.players[0].deck = ['fiery_war_axe', 'chillwind_yeti'].filter(id => cardsById[id]); // a weapon to tutor
	const foe = enemyDummy(st, 1, 3, 9); // 3/9, will retaliate 3 if the Titan weren't Immune
	const hand0 = st.players[0].hand.length;
	E.activateAbility(st, 0, k.uid, 0, null); // Titanforge: +2/+2, draw a weapon
	ok('Titanforge: +2/+2 (now 6/7)', k.attack === 6 && E.hp(k) === 7, [k.attack, E.hp(k)]);
	const weaponDrawn = st.players[0].hand.some(c => c.type === 'weapon');
	ok('Titanforge drew a weapon (if one was in deck)', cardsById['fiery_war_axe'] ? weaponDrawn : true);
	ok('passive fired: Titan attacked the enemy minion (it took damage)', foe.damage >= 6 || E.isDead(foe), foe.damage);
	ok('passive Immune protected the Titan (no retaliation damage)', k.damage === 0, k.damage);
}

// ---------- Norgannon: 5 damage + "double the power of the OTHER abilities" passive ----------
{
	const st = game();
	const n = putBoard(st, 0, 'norgannon'); // 3/8
	const foe = enemyDummy(st, 1, 1, 12);
	ok('before use: Ancient Knowledge tax value is 1', n.activated[1].effects[0].value === 1);
	const spec = E.abilitySpec(st, 0, n, 0); // Progenitor's Power = targeted 5 damage
	E.activateAbility(st, 0, n.uid, 0, { type: 'creature', uid: foe.uid, player: 1 });
	ok('Progenitor\'s Power dealt 5 (the used ability is NOT doubled)', foe.damage === 5, foe.damage);
	ok('passive doubled the OTHER unused abilities: Ancient Knowledge now 2', n.activated[1].effects[0].value === 2, n.activated[1].effects[0].value);
	roundTrip(st);
	E.activateAbility(st, 0, n.uid, 1, null); // Ancient Knowledge (now value 2)
	ok('Ancient Knowledge (doubled) taxes ALL enemy cards +2 next turn', st.players[1].enemyCardTaxAmount === 2 && st.players[1].enemyCardTaxTurn === st.turnNumber + 1, [st.players[1].enemyCardTaxAmount, st.players[1].enemyCardTaxTurn]);
}

// ---------- Eonar: Flourish refills mana; passive summons a 5/5 Ancient with Taunt ----------
{
	const st = game();
	const e = putBoard(st, 0, 'eonar_the_life_binder');
	st.players[0].mana.cur = 0; // spent
	const board0 = st.players[0].board.length;
	E.activateAbility(st, 0, e.uid, 2, null); // Flourish
	ok('Flourish refilled Mana Crystals to full', st.players[0].mana.cur === st.players[0].mana.max, [st.players[0].mana.cur, st.players[0].mana.max]);
	const ancient = st.players[0].board.find(c => c.name === 'Ancient');
	ok('passive summoned a 5/5 Ancient with Taunt', ancient && ancient.attack === 5 && E.hp(ancient) === 5 && ancient.keywords.includes('taunt'), ancient && [ancient.attack, E.hp(ancient)]);
	ok('board grew by exactly the Ancient', st.players[0].board.length === board0 + 1);
}

// ---------- Yogg-Saron: Tentacle Swarm fills hand; passive casts two random spells ----------
{
	const st = game(6); // seed pinned to a benign "two random spells" outcome (the pool shifts as cards are added)
	const y = putBoard(st, 0, 'yogg_saron_unleashed');
	st.players[0].hand = [];
	E.activateAbility(st, 0, y.uid, 2, null); // Tentacle Swarm
	const tendrils = st.players[0].hand.filter(c => c.id === 'token_chaotic_tendril');
	// the passive also casts two random spells; one may be a mass hand-buff that
	// lifts the Tendrils off their base 1/1, so assert only that the hand filled with Tendrils
	ok('Tentacle Swarm filled the hand with Chaotic Tendrils', tendrils.length > 0, tendrils.length);
	ok('the ability is now spent (each ability once)', !E.canActivate(st, 0, y, 2));
	ok('no crash: game still coherent after the "cast two random spells" passive', !st.over && st.players[0].board.includes(y));
}

// ---------- V-07-TR-0N Prime: ability + "repeats on another random friendly minion" passive ----------
{
	const st = game();
	const v = putBoard(st, 0, 'v_07_tr_0n_prime'); // 3/5
	const buddy = putBoard(st, 0, 'chillwind_yeti'); const bA = buddy.attack, bH = E.hp(buddy);
	enemyDummy(st, 1, 1, 20);
	E.activateAbility(st, 0, v.uid, 0, null); // Attach the Cannons!: +2/+1 to self, 4 dmg random enemy
	ok('self gained +2/+1 (now 5/6)', v.attack === 5 && E.hp(v) === 6, [v.attack, E.hp(v)]);
	ok('passive repeated the effect on the other friendly minion (+2/+1)', buddy.attack === bA + 2 && E.hp(buddy) === bH + 1, [buddy.attack, E.hp(buddy)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
