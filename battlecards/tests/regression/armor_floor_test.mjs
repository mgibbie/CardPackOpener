// Armor never goes negative. Frozen Buckler ("Gain 10 Armor. At the start of your next turn,
// lose 5 Armor.") could underflow: if the +10 was spent down below 5 before the delayed -5
// fired, armor went to a negative value and stuck (validateGameState "armor invalid (-N)").
// gainArmor now floors at 0.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };
const armorClean = st => !(validateGameState(st) || []).some(x => /armor invalid/.test(x));

const game = () => {
	const st = E.createGame(byId, seededRng(3), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; p.armor = 0; }
	st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
	return st;
};

// direct floor: a "lose armor" effect can't underflow
{ const st = game(); st.players[0].armor = 2;
  E.execEffects(st, 0, [{ type: 'armor', value: -5 }], null, null);
  ok('armor floors at 0 (2 - 5 => 0, not -3)', st.players[0].armor === 0, st.players[0].armor);
  ok('...validateGameState clean', armorClean(st)); }

// Frozen Buckler: +10 now, then the delayed -5 floors once the 10 has been spent
{ const st = game();
  const fb = E.instantiate(byId.frozen_buckler, 0); fb.zone = 'hand'; st.players[0].hand.push(fb);
  E.playCard(st, 0, fb.uid, null);
  ok('Frozen Buckler grants 10 armor', st.players[0].armor === 10, st.players[0].armor);
  st.players[0].armor = 2; // as if 8 armor soaked damage before your next turn
  E.execEffects(st, 0, [{ type: 'armor', value: -5 }], null, null);
  ok('the -5 decay leaves 0 armor, not negative', st.players[0].armor === 0, st.players[0].armor);
  ok('...no armor-invalid violation', armorClean(st)); }

// positive gains still work
{ const st = game(); E.execEffects(st, 0, [{ type: 'armor', value: 7 }], null, null);
  ok('positive armor gain unaffected', st.players[0].armor === 7);
  E.execEffects(st, 0, [{ type: 'armor', value: -3 }], null, null);
  ok('partial loss above zero works (7 - 3 = 4)', st.players[0].armor === 4); }

console.log(`${pass}/${pass + fail} armor-floor checks passed`);
process.exit(fail ? 1 : 0);
