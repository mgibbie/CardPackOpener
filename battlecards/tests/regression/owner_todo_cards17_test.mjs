// Seventeenth batch (2026-09-08): the "samurai wiring pass". A family of paper
// imports named keywords in their text that their keywords arrays never carried,
// so those abilities were inert. This wires them all and FIRES each:
//
//   prophet_of_wanderwood -> + Bushido
//   red_eyes_black_dragon -> + Impulsive, Firebreathing, Bushido, Taunt
//   mistweaver_champion   -> Taunt, Trample, Spell Damage+1, Bushido
//   mistweaver_shogun     -> Taunt, Prowess, Bushido
//   hyperspace_ronin      -> Spell Damage+2, Bushido
//   quietblade_shinobi    -> "Your cards with Bushido cost 1 less" (costMod)
//   xiongmao_bladedancer  -> "Your Hero Weapons have +6 Attack" (weaponAura)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 29) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.weapon = null; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
const enemyCreature = (st, hp) => put(st, 1, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 1, attack: 0, health: hp }, 1));
// spell damage only applies to real spell types (sorcery/instant), not type:'spell'
const zapAt = (st, tgtUid) => { const sp = E.instantiate({ id: 'zap', name: 'Zap', type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 2, target: 'creature' }] }, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10; E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgtUid, player: 1 }, null, 0); };

// ---------- Bushido (prophet + red eyes): +1/+1 on attack ----------
{
	const st = game();
	const prophet = put(st, 0, E.instantiate(cardsById.prophet_of_wanderwood, 0)); // base 4/5
	ok('Prophet has Bushido wired', prophet.keywords.includes('bushido'), JSON.stringify(prophet.keywords));
	E.attack(st, 0, prophet.uid, { type: 'hero', player: 1 });
	ok('Prophet Bushido grew it +1/+1 on attack (5/6)', prophet.attack === 5 && prophet.maxHealth === 6, [prophet.attack, prophet.maxHealth]);
}
{
	const re = cardsById.red_eyes_black_dragon;
	const inst = E.instantiate(re, 0);
	ok('Red Eyes carries impulsive/firebreathing/bushido/taunt/deathrattle',
		['impulsive', 'firebreathing', 'bushido', 'taunt', 'deathrattle'].every(k => inst.keywords.includes(k)), JSON.stringify(inst.keywords));
	const st = game();
	const dragon = put(st, 0, E.instantiate(re, 0)); // base 9/6
	E.attack(st, 0, dragon.uid, { type: 'hero', player: 1 });
	ok('Red Eyes Bushido grew it +1/+1 on attack (10/7)', dragon.attack === 10 && dragon.maxHealth === 7, [dragon.attack, dragon.maxHealth]);
}

// ---------- Spell Damage (champion +1, hyperspace +2) ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.mistweaver_champion, 0));
	const inst = E.instantiate(cardsById.mistweaver_champion, 0);
	ok('Champion carries taunt/trample/bushido', ['taunt', 'trample', 'bushido'].every(k => inst.keywords.includes(k)), JSON.stringify(inst.keywords));
	const foe = enemyCreature(st, 9);
	zapAt(st, foe.uid);
	ok('Champion Spell Damage+1: a 2-damage spell deals 3', foe.damage === 3, ['damage', foe.damage]);
}
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.hyperspace_ronin, 0));
	const foe = enemyCreature(st, 9);
	zapAt(st, foe.uid);
	ok('Hyperspace Ronin Spell Damage+2: a 2-damage spell deals 4', foe.damage === 4, ['damage', foe.damage]);
}

// ---------- Prowess (shogun): +1/+1 until end of turn per spell ----------
{
	const st = game();
	const shogun = put(st, 0, E.instantiate(cardsById.mistweaver_shogun, 0)); // base 5/3
	const inst = E.instantiate(cardsById.mistweaver_shogun, 0);
	ok('Shogun carries taunt/bushido', ['taunt', 'bushido'].every(k => inst.keywords.includes(k)), JSON.stringify(inst.keywords));
	E.fireOngoing(st, 0, 'spell-played', {});
	ok('Shogun Prowess grew it +1 Attack on a spell (6)', shogun.attack === 6, ['attack', shogun.attack]);
}

// ---------- quietblade_shinobi: your cards with Bushido cost 1 less ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.quietblade_shinobi, 0));
	const bushidoCard = E.instantiate({ id: 'bx', name: 'BX', type: 'creature', cost: 4, attack: 2, health: 2, keywords: ['bushido'] }, 0);
	bushidoCard.zone = 'hand'; st.players[0].hand.push(bushidoCard);
	const plainCard = E.instantiate({ id: 'px', name: 'PX', type: 'creature', cost: 4, attack: 2, health: 2 }, 0);
	plainCard.zone = 'hand'; st.players[0].hand.push(plainCard);
	ok('a Bushido card costs 1 less (4 -> 3)', E.effectiveCost(st, 0, bushidoCard) === 3, ['cost', E.effectiveCost(st, 0, bushidoCard)]);
	ok('a non-Bushido card is unaffected (still 4)', E.effectiveCost(st, 0, plainCard) === 4, ['cost', E.effectiveCost(st, 0, plainCard)]);
}

// ---------- xiongmao_bladedancer: your Hero Weapons have +6 Attack ----------
{
	const st = game();
	st.players[0].weapon = { id: 'axe', name: 'Axe', attack: 3, durability: 2 };
	ok('base weapon Attack is 3 without Xiongmao', E.heroAttackValue(st, st.players[0]) === 3, ['atk', E.heroAttackValue(st, st.players[0])]);
	put(st, 0, E.instantiate(cardsById.xiongmao_bladedancer, 0));
	E.recomputeAuras(st);
	ok('Xiongmao gives your weapon +6 Attack (3 -> 9)', E.heroAttackValue(st, st.players[0]) === 9, ['atk', E.heroAttackValue(st, st.players[0])]);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
