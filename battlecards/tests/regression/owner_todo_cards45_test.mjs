// Forty-fifth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Abbey Griffin        -> tribe "Beast"
//   Soul Warden          -> real Alliance trigger: "Alliance: Gain 1 Life."
//   Vulshok Morningstar  -> Swing-convention text (mechanics unchanged)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(64), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['soul_warden']; p.board = []; p.heroPowers = []; p.mana = { cur: 30, max: 10, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; c.cost = 0; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null, null); return c; };

// ---- Abbey Griffin: a Beast now ----
{
	const g = cardsById.abbey_griffin;
	ok('Abbey Griffin is a Beast', g.tribe === 'Beast', g.tribe);
	ok('keeps Elusive & Taunt', (g.keywords || []).includes('elusive') && (g.keywords || []).includes('taunt'));
	const st = fresh();
	const c = put(st, 0, 'abbey_griffin');
	E.execEffects(st, 0, [{ type: 'buff', target: 'friendly-creatures', tribe: 'Beast', attack: 1, health: 1 }], null, null);
	ok('Beast-tribal buffs now hit it', c.attack === 3 && c.maxHealth === 5, [c.attack, c.maxHealth].join('/'));
}

// ---- Soul Warden: Alliance ----
{
	const w = cardsById.soul_warden;
	ok('the text reads as Alliance', w.description === 'Alliance: Gain 1 Life.', w.description);
	ok('the trigger matches the other Alliance cards', w.ongoing && w.ongoing.on === 'creature-played', JSON.stringify(w.ongoing));
	const st = fresh();
	put(st, 0, 'soul_warden');
	st.players[0].life = 30;
	play(st, 0, 'abbey_griffin'); // an ally hits the table
	ok('playing another creature gains 1 Life', st.players[0].life === 31, st.players[0].life);
}

// ---- Vulshok Morningstar: Swing wording, same swing ----
{
	const v = cardsById.wastes_vulshok_morningstar;
	ok('the text uses the Swing convention (batch 67 appended a Deathrattle)', v.description.startsWith('Swing: Creatures you control gain +1 Attack.'), v.description);
	ok('still a 2/3 weapon', v.attack === 2 && v.durability === 3);
	const st = fresh();
	const c = put(st, 0, 'abbey_griffin');
	const w = E.instantiate(v, 0); w.zone = 'weapon'; st.players[0].weapon = w;
	st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'hero', player: 1 });
	ok('the swing still buffs your creatures +1 Attack', c.attack === 3, c.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
