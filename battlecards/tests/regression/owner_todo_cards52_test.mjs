// Fifty-second batch from the wiki's owner inbox (owner_todo), 2026-09-13.
//   wastes_warping_wail -> give it the Fel spell school (tribe "Fel"); the damage
//                          is unchanged, and its plate now reads "Sorcery - Fel".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { plateLabelFor } from '../../plate-label.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const def = cardsById.wastes_warping_wail;
ok('Warping Wail has the Fel spell school (tribe)', def.tribe === 'Fel', def.tribe);
ok('Warping Wail is still a sorcery', def.type === 'sorcery', def.type);
ok('its plate reads "Sorcery - Fel"', plateLabelFor(def) === 'Sorcery - Fel', plateLabelFor(def));
ok('it still deals 3 damage to a creature', (def.effects || []).some(e => e.type === 'damage' && e.value === 3 && e.target === 'creature'), JSON.stringify(def.effects));
ok('description is unchanged', def.description === 'Deal 3 damage to a creature.', JSON.stringify(def.description));

// FIRE it: deals 3 to a chosen creature
{
	const st = E.createGame(cardsById, seededRng(1), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	const foe = E.instantiate({ id: 'tgt', name: 'T', type: 'creature', cost: 5, attack: 1, health: 5 }, 1); foe.zone = 'board'; foe.sick = false; st.players[1].board.push(foe);
	const sp = E.instantiate(def, 0); sp.zone = 'hand'; st.players[0].hand.push(sp);
	const h0 = E.hp(foe);
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
	ok('dealt 3 damage (5 -> 2)', E.hp(foe) === h0 - 3, [h0, E.hp(foe)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
