// Fifty-eighth batch from the wiki's owner inbox (owner_todo), 2026-09-14.
//   spectral_procession -> "Create six 1/1 Spirits with Lifesteal & Taunt."
//                          (was three, Lifesteal only)
//   cathars_crusade -> "Alliance: Creatures you control gain +1/+1." (Alliance =
//                       on creature-played; was the broader "summoned" trigger)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.enchantments = []; p.graveyard = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// ---------- Spectral Procession ----------
{
	const def = cardsById.spectral_procession;
	ok('Spectral text is "Create six 1/1 Spirits with Lifesteal & Taunt."', def.description === 'Create six 1/1 Spirits with Lifesteal & Taunt.', JSON.stringify(def.description));
	const e = (def.effects || [])[0];
	ok('summons six 1/1 Spirits with Lifesteal & Taunt', e && e.type === 'summon' && e.count === 6 && e.attack === 1 && e.health === 1 && e.name === 'Spirit' && (e.keywords || []).includes('lifesteal') && (e.keywords || []).includes('taunt'), JSON.stringify(def.effects));
	// FIRE: six spirits hit the board, each 1/1 with both keywords
	const st = game(1);
	const s = E.instantiate(def, 0); s.zone = 'hand'; st.players[0].hand.push(s);
	E.playCard(st, 0, s.uid, null, null, 0);
	const spirits = st.players[0].board.filter(c => c.name === 'Spirit');
	ok('created six Spirits', spirits.length === 6, spirits.length);
	ok('each is a 1/1 with Lifesteal & Taunt', spirits.every(c => c.attack === 1 && E.hp(c) === 1 && (c.keywords || []).includes('lifesteal') && (c.keywords || []).includes('taunt')), spirits.map(c => [c.attack, E.hp(c), c.keywords]));
}

// ---------- Cathars' Crusade: Alliance ----------
{
	const def = cardsById.cathars_crusade;
	ok("Cathars' text is \"Alliance: Creatures you control gain +1/+1.\"", def.description === 'Alliance: Creatures you control gain +1/+1.', JSON.stringify(def.description));
	ok('it triggers on creature-played (Alliance)', def.ongoing && def.ongoing.on === 'creature-played', JSON.stringify(def.ongoing));
	ok('it buffs your creatures +1/+1', def.ongoing && def.ongoing.effects.some(e => e.type === 'buff' && e.attack === 1 && e.health === 1 && e.target === 'friendly-creatures'), JSON.stringify(def.ongoing));
	// FIRE: playing a creature buffs the whole board +1/+1
	const st = game(2);
	const ally = E.instantiate({ id: 'a', name: 'A', type: 'creature', cost: 2, attack: 2, health: 2 }, 0); ally.zone = 'board'; ally.sick = false; st.players[0].board.push(ally);
	st.players[0].enchantments.push(E.instantiate(def, 0));
	const a0 = ally.attack, h0 = E.hp(ally);
	const cr = E.instantiate({ id: 'n', name: 'N', type: 'creature', cost: 1, attack: 1, health: 1 }, 0); cr.zone = 'hand'; st.players[0].hand.push(cr);
	E.playCard(st, 0, cr.uid, null, null, 0);
	ok('an existing ally gained +1/+1 (2/2 -> 3/3)', ally.attack === a0 + 1 && E.hp(ally) === h0 + 1, [ally.attack, E.hp(ally)]);
	ok('the freshly-played creature is also buffed (1/1 -> 2/2)', cr.attack === 2 && E.hp(cr) === 2, [cr.attack, E.hp(cr)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
