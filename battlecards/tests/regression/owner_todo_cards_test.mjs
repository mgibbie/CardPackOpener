// Card changes filed from the wiki's owner inbox (owner_todo), applied 2026-08-31.
//
//   Forest Bear    -> 2/4 for 3 with Taunt & Swift; tribe Bear -> Beast
//   Lotus Cobra    -> tribe Snake -> Beast; shorter Landfall wording
//   Grizzly Bears  -> 2/2 for 3 with Taunt & "Deathrattle: Target creature gains +2/+2"
//
// Worth pinning rather than trusting the data edit: "Swift" is this game's
// DISPLAY name for the first_strike keyword (161 cards read that way), so a
// card asking for "Taunt & Swift" needs keywords ['taunt','first_strike'] and
// not a keyword literally called swift — an easy thing to get wrong later. And
// Grizzly Bears' Deathrattle is new behaviour, so it gets actually fired here
// rather than just checked for existing in the JSON.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 7) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- Forest Bear ----------
{
	const c = cardsById.forest_bear;
	ok('Forest Bear costs 3', c.cost === 3, c.cost);
	ok('Forest Bear is a 2/4', c.attack === 2 && c.health === 4, `${c.attack}/${c.health}`);
	ok('Forest Bear is a Beast', c.tribe === 'Beast', c.tribe);
	ok('Forest Bear has Taunt', (c.keywords || []).includes('taunt'), JSON.stringify(c.keywords));
	// Swift == first_strike in this game's vocabulary
	ok('Forest Bear has Swift (first_strike)', (c.keywords || []).includes('first_strike'), JSON.stringify(c.keywords));
	ok('Forest Bear reads "Taunt. Swift."', c.description === 'Taunt. Swift.', c.description);
	ok('no bogus "swift" keyword crept in', !(c.keywords || []).includes('swift'));
}

// ---------- Lotus Cobra ----------
{
	const c = cardsById.lotus_cobra;
	ok('Lotus Cobra is a Beast', c.tribe === 'Beast', c.tribe);
	ok('Lotus Cobra reads "Landfall: Gain 1 mana this turn."',
		c.description === 'Landfall: Gain 1 mana this turn.', c.description);
	// the text got shorter; the behaviour must not have
	ok('its Landfall trigger is intact',
		c.ongoing?.on === 'landfall' && c.ongoing.effects?.[0]?.type === 'gain-mana' && c.ongoing.effects[0].value === 1,
		JSON.stringify(c.ongoing));
}

// ---------- Grizzly Bears ----------
{
	const c = cardsById.grizzly_bears;
	ok('Grizzly Bears costs 3', c.cost === 3, c.cost);
	ok('Grizzly Bears is a 2/2', c.attack === 2 && c.health === 2, `${c.attack}/${c.health}`);
	ok('Grizzly Bears has Taunt + Deathrattle',
		(c.keywords || []).includes('taunt') && (c.keywords || []).includes('deathrattle'), JSON.stringify(c.keywords));
	ok('its Deathrattle buffs a creature +2/+2',
		c.deathrattle?.[0]?.type === 'buff' && c.deathrattle[0].attack === 2
		&& c.deathrattle[0].health === 2 && c.deathrattle[0].target === 'creature',
		JSON.stringify(c.deathrattle));

	// and it actually fires: kill it with a friendly creature standing by
	const st = game();
	cardsById.t_buddy = { id: 't_buddy', name: 'Buddy', type: 'creature', cost: 1, attack: 1, health: 5 };
	const bear = E.instantiate(cardsById.grizzly_bears, 0);
	const buddy = E.instantiate(cardsById.t_buddy, 0);
	for (const m of [bear, buddy]) { m.zone = 'board'; st.players[0].board.push(m); }
	// a board card carries maxHealth + accumulated damage, not a live `health`
	const beforeAtk = buddy.attack, beforeHp = buddy.maxHealth;
	bear.damage = bear.maxHealth;    // lethal already dealt
	E.sweepDeaths(st);
	ok('the bear left the board', !st.players[0].board.some(m => m.uid === bear.uid),
		st.players[0].board.map(m => m.id).join(','));
	const survivor = st.players[0].board.find(m => m.uid === buddy.uid);
	ok('a creature got +2/+2 from the Deathrattle',
		!!survivor && survivor.attack === beforeAtk + 2 && survivor.maxHealth === beforeHp + 2,
		survivor ? `${survivor.attack}/${survivor.maxHealth} (was ${beforeAtk}/${beforeHp})` : 'buddy gone');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
