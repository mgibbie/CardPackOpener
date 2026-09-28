// Bryan (2026-09-28), two Battlecards reports:
//   1. "Sneaky scout honorable kill did not work ... I used it and it still took
//      mana away". Honorable Kill fired only for an attacker that SURVIVED; a 3/2
//      Scout trading into a 3/3 died too, so its discount never landed. It now
//      fires either way (as in Hearthstone).
//   2. "Instrument Case deathrattle (from Worgen Roadie) did not give me a
//      weapon". The case sits under the OPPONENT's control, and its deathrattle
//      equipped its controller, so the enemy got the weapon, and a fixed 3/2 axe,
//      not the "random weapon" the card promises. Now the Roadie's player (who
//      made the case) equips a random weapon.
//
//   node battlecards/tests/regression/honorable_trade_roadie_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId['t_ogre'] = { id: 't_ogre', name: 'Ogre', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', description: 'x' };
function fresh(seed = 0.4) { const s = E.createGame(byId, () => seed, null, 2); for (const p of s.players) { p.board = []; p.hand = []; p.mana = { cur: 99, max: 99, bonus: 0 }; } return s; }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { const c = give(s, pi, id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
let pass = 0, fail = 0; const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// 1. Sneaky Scout trades into a 3/3: both die, and the Honorable Kill still lands
{
	const s = fresh();
	const scout = summon(s, 0, 'sneaky_scout'); scout.sick = false;
	const ogre = summon(s, 1, 't_ogre');
	E.attack(s, 0, scout.uid, { type: 'creature', uid: ogre.uid, player: 1 });
	ok('setup: the Scout died in the trade', !s.players[0].board.some(c => c.uid === scout.uid));
	ok('the Ogre died to exactly 3 damage', !s.players[1].board.some(c => c.uid === ogre.uid));
	ok('Honorable Kill fired although the Scout died', s.players[0].heroPowerDiscountNext >= 99, s.players[0].heroPowerDiscountNext);
}
// ...and an overkill (not exact) still gives nothing
{
	const s = fresh();
	const scout = summon(s, 0, 'sneaky_scout'); scout.sick = false;
	const ogre = summon(s, 1, 't_ogre'); ogre.maxHealth = 2;
	E.attack(s, 0, scout.uid, { type: 'creature', uid: ogre.uid, player: 1 });
	ok('an overkill is not an Honorable Kill', !s.players[0].heroPowerDiscountNext);
}
// 2. Worgen Roadie: the enemy gets the case; breaking it arms the ROADIE's player
for (const seed of [0.1, 0.4, 0.8]) {
	const s = fresh(seed);
	const r = give(s, 0, 'worgen_roadie');
	E.playCard(s, 0, r.uid, E.targetSpec(s, 0, r) ? { type: 'hero', player: 1 } : null, null, 0);
	const cs = s.players[1].board.find(c => c.id === 'fol_instrument_case');
	ok(`[${seed}] the Instrument Case goes to the opponent`, !!cs);
	if (!cs) continue;
	const k = give(s, 0, 't_kill');
	E.playCard(s, 0, k.uid, { type: 'creature', uid: cs.uid, player: 1 }, null, 0);
	const w0 = s.players[0].weapon, w1 = s.players[1].weapon;
	ok(`[${seed}] breaking it equips the Roadie's player`, !!w0 && w0.attack > 0 && w0.durability > 0, JSON.stringify(w0 && { n: w0.name, a: w0.attack, d: w0.durability }));
	ok(`[${seed}] ...not the case's controller`, !w1, w1 && w1.name);
	ok(`[${seed}] ...with a real random weapon, not the old fixed axe`, w0 && w0.name !== 'Roadie Axe', w0 && w0.name);
}
// the opponent breaking their own case still arms the Roadie's player
{
	const s = fresh();
	const r = give(s, 0, 'worgen_roadie');
	E.playCard(s, 0, r.uid, E.targetSpec(s, 0, r) ? { type: 'hero', player: 1 } : null, null, 0);
	const cs = s.players[1].board.find(c => c.id === 'fol_instrument_case');
	s.current = 1;
	const k = give(s, 1, 't_kill');
	E.playCard(s, 1, k.uid, { type: 'creature', uid: cs.uid, player: 1 }, null, 0);
	ok('whoever breaks it, the weapon is the Roadie player\'s', !!s.players[0].weapon && !s.players[1].weapon);
}

// 3. Brewster, the Brutal is a Beast (Bryan: "not a beast and it should be")
ok('Brewster, the Brutal is a Beast', byId.duels_brewster_the_brutal.tribe === 'Beast');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
