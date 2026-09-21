// Owner inbox batch, 2026-09-21.
//   Liliana's Devotee -> "Deathtouch.\nAvenge 1: Gain +2/+2." (canonical Avenge)
//   Liliana's Reaver  -> "Deathtouch.\nYour other Undead have Deathtouch & Swing: Advance."
//
// The Reaver needed a new engine capability: until now an aura could hand out
// STATS and KEYWORDS but never a triggered ability (0 of them did). Auras now may
// carry an `ongoing`, collected into the target's `auraOngoings` — rebuilt every
// recompute, so it lapses the moment the source leaves.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._undead = { id: '_undead', name: 'Ghoul', type: 'creature', cost: 2, attack: 2, health: 4, tribe: 'Undead', rarity: 'common' };
byId._beast = { id: '_beast', name: 'Wolf', type: 'creature', cost: 2, attack: 2, health: 4, tribe: 'Beast', rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(72), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Liliana's Devotee: Avenge 1 -> +2/+2 ----
{
	const c = byId.liliana_devotee;
	ok('reads "Deathtouch.\\nAvenge 1: Gain +2/+2."', c.description === 'Deathtouch.\nAvenge 1: Gain +2/+2.', c.description);
	ok('uses the canonical Avenge shape (ongoings + every:1)', Array.isArray(c.ongoings) && c.ongoings[0].on === 'friendly-creature-died' && c.ongoings[0].every === 1, JSON.stringify(c.ongoings));
	ok('buffs +2/+2 now (was +1/+0)', c.ongoings[0].effects[0].attack === 2 && c.ongoings[0].effects[0].health === 2, JSON.stringify(c.ongoings[0].effects));
	ok('no stale singular `ongoing` left behind', !c.ongoing);
	ok('keeps Deathtouch', (c.keywords || []).includes('deathtouch'));
	// FIRE: each friendly death grows it, and it re-triggers
	const st = fresh();
	const dev = put(st, 0, c);
	const fodder = put(st, 0, byId._undead);
	ok('starts 2/3', dev.attack === 2 && dev.maxHealth === 3, [dev.attack, dev.maxHealth].join('/'));
	fodder.damage = fodder.maxHealth; E.sweepDeaths(st);
	ok('a friendly death gives +2/+2 (2/3 -> 4/5)', dev.attack === 4 && dev.maxHealth === 5, [dev.attack, dev.maxHealth].join('/'));
	const f2 = put(st, 0, byId._undead);
	f2.damage = f2.maxHealth; E.sweepDeaths(st);
	ok('it re-triggers on the next death (-> 6/7)', dev.attack === 6 && dev.maxHealth === 7, [dev.attack, dev.maxHealth].join('/'));
}

// ---- 2) Liliana's Reaver: other Undead get Deathtouch & Swing: Advance ----
{
	const c = byId.liliana_reaver;
	ok('reads "…Your other Undead have Deathtouch & Swing: Advance."', c.description === 'Deathtouch.\nYour other Undead have Deathtouch & Swing: Advance.', c.description);
	ok('the aura no longer hands out stats', !c.aura.attack && !c.aura.health, JSON.stringify(c.aura));
	ok('the aura still grants Deathtouch to OTHER Undead', c.aura.tribe === 'Undead' && c.aura.others === true && c.aura.keywords.includes('deathtouch'), JSON.stringify(c.aura));
	ok('the aura grants a Swing trigger that Advances', c.aura.ongoing.on === 'self-attacks' && c.aura.ongoing.effects[0].type === 'advance', JSON.stringify(c.aura.ongoing));

	const st = fresh();
	const reaver = put(st, 0, c);
	const ghoul = put(st, 0, byId._undead);
	const wolf = put(st, 0, byId._beast);
	E.recomputeAuras(st);
	ok('another Undead gains Deathtouch', (ghoul.keywords || []).includes('deathtouch'), JSON.stringify(ghoul.keywords));
	ok('a non-Undead does not', !(wolf.keywords || []).includes('deathtouch'), JSON.stringify(wolf.keywords));
	ok('another Undead carries the granted Swing', (ghoul.auraOngoings || []).some(o => o.on === 'self-attacks'), JSON.stringify(ghoul.auraOngoings));
	ok('a non-Undead does not', !(wolf.auraOngoings || []).length, JSON.stringify(wolf.auraOngoings));
	ok('the Reaver does not grant it to itself (others:true)', !(reaver.auraOngoings || []).length, JSON.stringify(reaver.auraOngoings));
	ok('no stat buff leaked onto the Undead', ghoul.attack === 2 && ghoul.maxHealth === 4, [ghoul.attack, ghoul.maxHealth].join('/'));

	// FIRE: the granted Swing really Advances when that creature attacks
	{
		const before = (st.pickQueue || []).length;
		E.attack(st, 0, ghoul.uid, { type: 'hero', player: 1 });
		const queued = (st.pickQueue || []).slice(before).some(q => q.mode === 'advance');
		ok('the granted Swing fires on attack and queues an Advance', queued, JSON.stringify((st.pickQueue || []).map(q => q.mode)));
	}
	// ...and it LAPSES when the Reaver leaves
	{
		reaver.damage = reaver.maxHealth; E.sweepDeaths(st); E.recomputeAuras(st);
		ok('the granted Swing lapses when its source dies', !(ghoul.auraOngoings || []).length, JSON.stringify(ghoul.auraOngoings));
		ok('and so does the granted Deathtouch', !(ghoul.keywords || []).includes('deathtouch'), JSON.stringify(ghoul.keywords));
	}
}

// ---- 3) the new aura capability is opt-in: nothing else changed ----
{
	const withOngoingAura = raw.cards.filter(c => c.aura && c.aura.ongoing).map(c => c.id);
	ok('only the Reaver uses an aura-granted trigger so far', withOngoingAura.join(',') === 'liliana_reaver', withOngoingAura.join(','));
	const st = fresh();
	const lone = put(st, 0, byId._undead);
	E.recomputeAuras(st);
	ok('a creature with no aura source has no granted triggers', !(lone.auraOngoings || []).length, JSON.stringify(lone.auraOngoings));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
