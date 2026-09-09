// bushido_to_swing_test.mjs (2026-09-08)
//
// Owner request: retire the Bushido keyword entirely and replace every case
// with "Swing: Gain +1/+1" (a self-attacks ongoing that permanently grows the
// creature +1/+1 each time it attacks). Quietblade Shinobi's cost aura, which
// used to key off Bushido, now discounts cards with Swing OR Connect.
//
// This locks in: (1) Bushido is gone from the engine, glossary, keywords[] and
// descriptions; (2) each converted card still grows +1/+1 on attack via Swing
// — including the two that carry it in `ongoings` alongside another trigger;
// (3) Quietblade discounts Swing and Connect cards, nothing else.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
const kwSrc = fs.readFileSync(new URL('../../keywords.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 71) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Bushido is gone everywhere ----------
ok('KW.BUSHIDO no longer exists', E.KW.BUSHIDO === undefined);
ok('keywords.js glossary has no Bushido entry', !/Bushido/.test(kwSrc), 'found Bushido in keywords.js');
{
	const kwHit = raw.cards.filter(c => (c.keywords || []).includes('bushido'));
	ok('no card keeps the bushido keyword', kwHit.length === 0, kwHit.map(c => c.id));
	const descHit = raw.cards.filter(c => /bushido/i.test(c.description || ''));
	ok('no card description mentions Bushido', descHit.length === 0, descHit.map(c => c.id));
}

// ---------- every converted card grows +1/+1 when it attacks ----------
// [id, baseAtk, baseHp, where the Swing trigger lives]
const CONVERTED = [
	['mistweaver_champion', 'ongoing'],
	['mistweaver_shogun', 'ongoings'],   // ongoing slot holds Prowess
	['mistweaver_ronin', 'ongoing'],
	['hyperspace_ronin', 'ongoing'],
	['prophet_of_wanderwood', 'ongoings'], // ongoing slot holds Inspire
	['red_eyes_black_dragon', 'ongoing'],
];
for (const [id, where] of CONVERTED) {
	const def = cardsById[id];
	ok(`${id} names Swing in its text`, /Swing: Gain \+1\/\+1\./.test(def.description), JSON.stringify(def.description));
	const inst = E.instantiate(def, 0);
	const hasSwing = where === 'ongoing'
		? inst.ongoing?.on === 'self-attacks'
		: (inst.ongoings || []).some(o => o.on === 'self-attacks');
	ok(`${id} carries a self-attacks Swing trigger in ${where}`, hasSwing, JSON.stringify([inst.ongoing, inst.ongoings]));
	// fire it: attacking the enemy hero grows it +1/+1
	const st = game();
	const c = put(st, 0, E.instantiate(def, 0));
	const a0 = c.attack, h0 = c.maxHealth;
	E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
	ok(`${id} grows +1/+1 on attack (${a0}/${h0} -> ${a0 + 1}/${h0 + 1})`, c.attack === a0 + 1 && c.maxHealth === h0 + 1, [c.attack, c.maxHealth]);
}

// Shogun's OTHER trigger (Prowess) must still fire independently of Swing
{
	const st = game();
	const shogun = put(st, 0, E.instantiate(cardsById.mistweaver_shogun, 0));
	const a0 = shogun.attack;
	E.fireOngoing(st, 0, 'spell-played', {});
	ok('Shogun Prowess still fires (spell-played +1 Attack) alongside Swing', shogun.attack === a0 + 1, [a0, shogun.attack]);
}

// ---------- Quietblade Shinobi: Swing OR Connect cards cost 1 less ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.quietblade_shinobi, 0));
	const mk = (id, extra) => { const c = E.instantiate({ id, name: id, type: 'creature', cost: 4, attack: 2, health: 2, ...extra }, 0); c.zone = 'hand'; st.players[0].hand.push(c); return c; };
	const swing = mk('sw', { ongoing: { on: 'self-attacks', effects: [{ type: 'buff-self', attack: 1, health: 1 }] } });
	const connect = mk('cn', { ongoing: { on: 'self-hit-player', effects: [{ type: 'draw', value: 1 }] } });
	const plain = mk('pl', {});
	ok('a Swing card is discounted (4 -> 3)', E.effectiveCost(st, 0, swing) === 3, E.effectiveCost(st, 0, swing));
	ok('a Connect card is discounted (4 -> 3)', E.effectiveCost(st, 0, connect) === 3, E.effectiveCost(st, 0, connect));
	ok('a card with neither is not discounted (4)', E.effectiveCost(st, 0, plain) === 4, E.effectiveCost(st, 0, plain));
	ok('the aura reads "Swing or Connect"', /Swing or Connect/.test(cardsById.quietblade_shinobi.description), cardsById.quietblade_shinobi.description);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
