// Owner inbox batch, 2026-09-30.
//   Lupine Harbingers        -> "Rush & Trample.\nInspire: Add a random Beast to each player's hand."
//   Legolas's Quick Reflexes -> "Target creature gains +2/+2 & Taunt.\nTwinspell."
//   Galadhrim Bow            -> "Deathtouch.\nSwing: Deal 1 damage to a random creature you don't control."
//                               (filed as "Deathrattle."; owner: "i meant deathtouch. the deathtouch
//                               effect should be utilized on the random ping as well")
//
// add-random-card learns eachPlayer (every living player gets their own card).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 74) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'hunter', name: 'A', power: null }, { id: 'hunter', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 40; p.armor = 0; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// ---- 1) Lupine Harbingers: Inspire -> a random Beast to EACH player's hand ----
{
	const c = byId.ymid_lupine_harbingers;
	ok('reads "Rush & Trample. / Inspire: Add a random Beast to each player\'s hand."', c.description === "Rush & Trample.\nInspire: Add a random Beast to each player's hand.", c.description);
	ok('keeps Rush & Trample', c.keywords.includes('rush') && c.keywords.includes('trample'));
	ok('Inspire = a hero-power trigger', c.ongoing && c.ongoing.on === 'hero-power-used', JSON.stringify(c.ongoing));
	for (const seed of [1, 2, 3]) {
		const st = fresh(seed);
		put(st, 0, c);
		E.fireOngoing(st, 0, 'hero-power-used', {});
		const mine = st.players[0].hand, theirs = st.players[1].hand;
		ok(`[${seed}] using the hero power gives EACH player one random Beast`, mine.length === 1 && theirs.length === 1
			&& /Beast/.test(mine[0].tribe || '') && /Beast/.test(theirs[0].tribe || '') && mine[0].type === 'creature',
			JSON.stringify([mine.map(x => x.name + ':' + x.tribe), theirs.map(x => x.name + ':' + x.tribe)]));
		ok(`[${seed}] ...each owned by the player whose hand it is`, mine[0] && theirs[0] && mine[0].controller === 0 && theirs[0].controller === 1);
	}
}

// ---- 2) Legolas's Quick Reflexes: target creature +2/+2 & Taunt, Twinspell ----
{
	const c = byId.me_legolas_reflexes, ii = byId.me_legolas_reflexes_ii;
	ok('reads "Target creature gains +2/+2 & Taunt. / Twinspell."', c.description === 'Target creature gains +2/+2 & Taunt.\nTwinspell.', c.description);
	ok('the twin exists, is not a token, and does not re-conjure', ii && !ii.token && ii.collectible === false && !(ii.effects || []).some(e => e.type === 'conjure-id'), JSON.stringify(ii && ii.effects));
	for (const side of [0, 1]) {
		const st = fresh();
		const t = put(st, side, byId._ogre);
		const card = give(st, 0, c);
		E.playCard(st, 0, card.uid, { type: 'creature', uid: t.uid, player: side }, null, 0);
		ok(`on ${side ? 'an ENEMY' : 'your'} creature: +2/+2 and Taunt (any creature is a legal target)`, t.attack === 3 && t.maxHealth === 11 && t.keywords.includes('taunt'), `${t.attack}/${t.maxHealth} ${JSON.stringify(t.keywords)}`);
		const copy = st.players[0].hand.find(x => x.id === 'me_legolas_reflexes_ii');
		ok(`...and Twinspell puts the copy in your hand (${side ? 'enemy' : 'own'} target)`, !!copy);
		if (side === 0 && copy) {
			const t2 = put(st, 0, byId._ogre);
			E.playCard(st, 0, copy.uid, { type: 'creature', uid: t2.uid, player: 0 }, null, 0);
			ok('the copy casts the same effect, and makes no further copy', t2.attack === 3 && t2.keywords.includes('taunt') && !st.players[0].hand.some(x => x.id === 'me_legolas_reflexes_ii'));
		}
	}
}

// ---- 3) Galadhrim Bow: Deathtouch, and the Swing ping carries it ----
{
	const c = byId.me_legolas_bow;
	ok('reads "Deathtouch. / Swing: Deal 1 damage to a random creature you don\'t control."', c.description === "Deathtouch.\nSwing: Deal 1 damage to a random creature you don't control.", c.description);
	ok('has Deathtouch (Poisonous is gone)', c.keywords.includes('deathtouch') && !c.keywords.includes('poisonous'), JSON.stringify(c.keywords));
	ok('Swing = a hero-attacks trigger', c.ongoing && c.ongoing.on === 'hero-attacks');
	const equip = st => { const w = E.instantiate(c, 0); w.zone = 'weapon'; st.players[0].weapon = w; return w; };
	// the ping: a random enemy CREATURE (never a friendly one, never a hero), and it kills
	for (const seed of [5, 6, 7]) {
		const st = fresh(seed);
		equip(st);
		const mine = put(st, 0, byId._ogre);
		const a = put(st, 1, byId._ogre), b = put(st, 1, byId._ogre);
		E.heroAttack(st, 0, { type: 'hero', player: 1 });
		const dead = [a, b].filter(x => !st.players[1].board.includes(x) || E.isDead(x));
		ok(`[${seed}] the Swing ping's 1 damage destroys a 9-Health enemy (Deathtouch on the ping)`, dead.length === 1, JSON.stringify([a, b].map(x => x.damage)));
		ok(`[${seed}] ...never your own creature`, st.players[0].board.includes(mine) && !E.isDead(mine) && mine.damage === 0);
	}
	// the Bow's own hit on a creature is Deathtouch too
	{
		const st = fresh();
		equip(st);
		const big = put(st, 1, byId._ogre);
		E.heroAttack(st, 0, { type: 'creature', uid: big.uid, player: 1 });
		ok("the Bow's own 1-damage hit destroys a 9-Health creature", !st.players[1].board.includes(big) || E.isDead(big), `dmg ${big.damage}`);
	}
	// nothing to ping: no error, the hero only takes the attack
	{
		const st = fresh();
		equip(st);
		E.heroAttack(st, 0, { type: 'hero', player: 1 });
		ok('with no enemy creatures the ping does nothing (the hero only takes the attack)', st.players[1].life === 39, st.players[1].life);
	}
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
