// Owner inbox batch 5 (2026-08-31): Beast Within's wording, Clockwork Fox's
// tribes, plus the live art-tuning override folded back into the repo.
//
// The tribe change is the one worth executing rather than eyeballing: tribes are
// a single space-separated string here ("Dragon Beast", "Human Ranger"), so
// "Mech Beast" only earns both if the engine's tribe matching actually splits
// it. Checked against real tribe-gated effects rather than trusting the string.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 12) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2,
		[{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0;
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }
	return st;
};

// ---------- Beast Within ----------
{
	const c = cardsById.beast_within;
	ok('Beast Within reads "Destroy target creature."',
		c.description === 'Destroy target creature.', c.description);
	// the wording is only honest because the effect really is targeted
	ok('and its effect really is a targeted destroy',
		c.effects?.[0]?.type === 'destroy' && c.effects[0].target === 'creature', JSON.stringify(c.effects));
	const st = game();
	const mine = E.instantiate({ id: 't_a', name: 'A', type: 'creature', cost: 1, attack: 1, health: 4 }, 0);
	const theirs = E.instantiate({ id: 't_b', name: 'B', type: 'creature', cost: 1, attack: 1, health: 4 }, 1);
	mine.zone = 'board'; st.players[0].board.push(mine);
	theirs.zone = 'board'; st.players[1].board.push(theirs);
	const spell = E.instantiate(c, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	st.players[0].mana.cur = 10;
	const spec = E.targetSpec(st, 0, spell);
	ok('it asks the player to choose', !!spec && spec.required === true, JSON.stringify(spec && spec.targets));
	E.playCard(st, 0, spell.uid, { type: 'creature', uid: theirs.uid, player: 1 }, null, 0);
	E.sweepDeaths(st);
	ok('the CHOSEN creature dies', !st.players[1].board.some(m => m.uid === theirs.uid));
	ok('and the other one is untouched', st.players[0].board.some(m => m.uid === mine.uid));
}

// ---------- Clockwork Fox ----------
{
	const c = cardsById.clockwork_fox;
	ok('Clockwork Fox is a "Mech Beast"', c.tribe === 'Mech Beast', c.tribe);
	ok('its stats and Deathrattle are untouched',
		c.cost === 3 && c.attack === 3 && c.health === 2 && c.deathrattle?.[0]?.value === 2,
		JSON.stringify([c.cost, c.attack, c.health, c.deathrattle]));

	// does the engine see BOTH tribes? drive real tribe-gated buffs
	const buffTribe = (tribe) => {
		const st = game();
		const fox = E.instantiate(c, 0); fox.zone = 'board'; st.players[0].board.push(fox);
		const before = fox.attack;
		// the real shape: a `buff` narrowed by `tribe` (handlers-buffs matches with
		// (c.tribe||'').includes(e.tribe), which is why a space-separated string
		// can carry two tribes at once)
		cardsById.t_lord = {
			id: 't_lord', name: 'Lord', type: 'creature', cost: 2, attack: 1, health: 1,
			keywords: ['battlecry'],
			effects: [{ type: 'buff', target: 'friendly-creatures', tribe, attack: 2, health: 2 }],
		};
		const lord = E.instantiate(cardsById.t_lord, 0); lord.zone = 'hand'; st.players[0].hand.push(lord);
		st.players[0].mana.cur = 10;
		E.playCard(st, 0, lord.uid, null, null, 0);
		return fox.attack - before;
	};
	const asMech = buffTribe('Mech');
	const asBeast = buffTribe('Beast');
	const asOther = buffTribe('Dragon');
	ok('a Mech buff reaches it', asMech > 0, `+${asMech}`);
	ok('a Beast buff reaches it too', asBeast > 0, `+${asBeast}`);
	ok('an unrelated tribe does not', asOther === 0, `+${asOther}`);
}

// ---------- the folded art tuning ----------
{
	const t = JSON.parse(fs.readFileSync(new URL('../../art_tuning.json', import.meta.url)));
	ok('the live colossapede reframe was folded into the repo',
		t.colossapede && t.colossapede.z === 1.3 && t.colossapede.fy === 0.12,
		JSON.stringify(t.colossapede));
	ok('and it did not clobber the entries already there', Object.keys(t).length >= 7, String(Object.keys(t).length));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
