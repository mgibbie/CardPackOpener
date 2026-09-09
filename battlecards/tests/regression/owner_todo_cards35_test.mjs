// Thirty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Grizzly Bears          -> tribe "Beast"
//   Acidic Slime           -> tribe "Ooze"
//   Bitterbow Sharpshooters-> tribe "Beast Archer"
//   Alpha Tyrranax         -> add "Inspire: Adapt a random creature you control"
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 83) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.pickQueue = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } st.pickQueue = []; return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- tribe edits ----------
ok('Grizzly Bears is a Beast', cardsById.grizzly_bears.tribe === 'Beast', cardsById.grizzly_bears.tribe);
ok('Acidic Slime is an Ooze', cardsById.acidic_slime.tribe === 'Ooze', cardsById.acidic_slime.tribe);
ok('Bitterbow Sharpshooters is a "Beast Archer"', cardsById.bitterbow_sharpshooters.tribe === 'Beast Archer', cardsById.bitterbow_sharpshooters.tribe);

// ---------- Alpha Tyrranax: Inspire -> Adapt a random creature you control ----------
{
	const c = cardsById.alpha_tyrranax;
	ok('reads "Trample.\\nInspire: Adapt a random creature you control."', c.description === 'Trample.\nInspire: Adapt a random creature you control.', JSON.stringify(c.description));
	ok('Inspire is a hero-power-used adapt(random-friendly) trigger', c.ongoing?.on === 'hero-power-used' && c.ongoing.effects[0].type === 'adapt' && c.ongoing.effects[0].target === 'random-friendly', JSON.stringify(c.ongoing));

	// FIRE it with the Alpha as the only friendly creature -> it adapts itself
	const st = game();
	const alpha = put(st, 0, E.instantiate(c, 0));
	E.fireOngoing(st, 0, 'hero-power-used', {});
	const pick = (st.pickQueue || []).find(q => q.mode === 'adapt');
	ok('Inspire queued an Adapt', !!pick && Array.isArray(pick.ids) && pick.ids.length === 3, JSON.stringify(pick));
	ok('the Adapt targets a friendly creature (the Alpha)', !!pick && pick.adaptUids.includes(alpha.uid), pick && pick.adaptUids);

	// with several friendlies, the chosen creature is always one you control (never the enemy)
	const st2 = game();
	const mine1 = put(st2, 0, E.instantiate(c, 0));
	const mine2 = put(st2, 0, E.instantiate({ id: 'm', name: 'M', type: 'creature', cost: 1, attack: 1, health: 1 }, 0));
	const foe = put(st2, 1, E.instantiate({ id: 'f', name: 'F', type: 'creature', cost: 1, attack: 1, health: 1 }, 1));
	const mine = new Set([mine1.uid, mine2.uid]);
	let allFriendly = true;
	for (let i = 0; i < 12; i++) { st2.pickQueue = []; E.fireOngoing(st2, 0, 'hero-power-used', {}); const p = st2.pickQueue.find(q => q.mode === 'adapt'); if (!p || !p.adaptUids.every(u => mine.has(u)) || p.adaptUids.includes(foe.uid)) { allFriendly = false; break; } }
	ok('the random pick is always a creature you control, never the enemy', allFriendly);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
