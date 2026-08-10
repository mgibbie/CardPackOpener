// Totemic Power (Instructor Fireheart hero power): summon a random basic Totem;
// if you're Overloaded, summon a non-basic Totem instead.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
const art = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url))));
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const BASICS = new Set(['sch_totem_healing', 'sch_totem_searing', 'sch_totem_stoneclaw', 'sch_totem_wrath']);
const hp = cardsById['duelshp_totemic_power'];
ok('description matches the real hero power', hp.description === "Hero Power (2): Create a random basic Totem. If you're Overloaded, create a non-basic Totem instead.");

const fire = (seed, overloaded) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0;
	if (overloaded) st.players[0].overloadLockedThisTurn = 1;
	E.execEffects(st, 0, JSON.parse(JSON.stringify(hp.power.effects)), null, null);
	return st.players[0].board.find(c => (c.tribe || '').includes('Totem'));
};

// NOT overloaded -> always one of the 4 basic totems (and it has art)
{
	const seen = new Set();
	for (let s = 0; s < 40; s++) { const t = fire(s, false); if (t) seen.add(t.id); }
	ok('not overloaded: only ever summons the 4 basic totems', [...seen].every(id => BASICS.has(id)), [...seen]);
	ok('not overloaded: covers multiple basics (randomized)', seen.size >= 2, [...seen]);
	ok('every summoned basic has art', [...seen].every(id => art.has(id)), [...seen]);
}

// Overloaded -> a non-basic Totem (never a basic), reasonable size (cost <= 3), with art
{
	const seen = new Set();
	for (let s = 0; s < 40; s++) { const t = fire(s, true); if (t) seen.add(t.id); }
	ok('overloaded: never summons a basic totem', [...seen].every(id => !BASICS.has(id)), [...seen]);
	ok('overloaded: summons real non-basic Totem-tribe minions', seen.size >= 1 && [...seen].every(id => (cardsById[id].tribe || '').includes('Totem')), [...seen]);
	ok('overloaded: never the oversized totems (Gigantotem/Totem Goliath)', ![...seen].some(id => id === 'gigantotem' || id === 'totem_goliath'), [...seen]);
	ok('every summoned non-basic has art', [...seen].every(id => art.has(id)), [...seen]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
