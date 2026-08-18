// Sprocket / Contraptions. 3 slots + an indicator that cycles 1->2->3->1. Assemble gives a
// random Contraption you place into a slot (overwriting); Contraptions STAY in their slot. At
// each of your turn-starts the indicator's current slot fires (if it holds one), then the
// indicator advances — so a Contraption fires each time the indicator cycles back to it, and
// the slot you pick sets how many ticks until the indicator first reaches it. Contraptions are
// real MTG (Unstable) ports: 0-cost, uncollectible, auto-resolving.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._m = { id: '_m', name: 'M', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
byId._f = { id: '_f', name: 'F', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
byId._big = { id: '_big', name: 'Big', type: 'creature', cost: 1, attack: 2, health: 6, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };
const ZAP = 'contraption_division_table'; // fires -> enemy hero loses 2 (a persistent fire counter)
const MANA = 'contraption_sap_sucker';    // fires -> gain 1 mana

const game = () => {
	const st = E.createGame(byId, seededRng(9), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.life = 30; p.armor = 0; p.sprocket = [null, null, null]; p.sprocketPointer = 0; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
};
const foeLife = st => st.players[1].life;

// state + pool
{ const p = game().players[0];
  ok('players start with 3 empty slots + pointer at 0', p.sprocket.length === 3 && p.sprocket.every(x => x === null) && p.sprocketPointer === 0); }
{ const pool = E.contraptionPool(game());
  ok('a Contraption pool exists', pool.length >= 9);
  ok('every Contraption is a 0-cost, uncollectible gadget with effects', pool.every(c => c.cost === 0 && c.collectible === false && c.contraption === true && Array.isArray(c.effects) && c.effects.length)); }
ok('demo card carries the assemble effect', byId.assemble_a_contraption.effects.some(e => e.type === 'assemble'));

// Assemble: random contraption + slot pick
{ const st = game(); E.assemble(st, 0);
  const pq = st.pickQueue[0];
  ok('Assemble queues a slot pick (mode assemble, 3 slots)', pq && pq.mode === 'assemble' && pq.ids.length === 3);
  ok('Assemble rolled a real Contraption', pq && byId[pq.contraptionId] && byId[pq.contraptionId].contraption === true);
  E.resolvePick(st, '1'); // place in slot 2 (index 1)
  ok('placed into the chosen slot', st.players[0].sprocket[1] && st.players[0].sprocket[1].id === pq.contraptionId);
  ok('other slots stay empty', !st.players[0].sprocket[0] && !st.players[0].sprocket[2]); }

// overwrite
{ const st = game();
  E.placeContraption(st, 0, 0, MANA);
  E.placeContraption(st, 0, 0, ZAP);
  ok('placing in an occupied slot OVERWRITES', st.players[0].sprocket[0].id === ZAP); }

// the pointed slot fires on the next crank, and the Contraption STAYS
{ const st = game();
  E.placeContraption(st, 0, 0, ZAP); // enemy -2, at the pointer (slot 0)
  const L = foeLife(st);
  E.crankSprocket(st, 0);
  ok('pointed Contraption fires on crank (enemy -2)', foeLife(st) === L - 2, foeLife(st));
  ok('Contraption STAYS in its slot (persistent)', st.players[0].sprocket[0] && st.players[0].sprocket[0].id === ZAP);
  ok('indicator advanced to the next slot', st.players[0].sprocketPointer === 1); }

// re-fires each time the indicator cycles back (every 3 turns)
{ const st = game();
  E.placeContraption(st, 0, 0, ZAP);
  const L = foeLife(st);
  E.crankSprocket(st, 0); // ptr 0 fires (-2), -> 1
  E.crankSprocket(st, 0); // ptr 1 empty, -> 2
  E.crankSprocket(st, 0); // ptr 2 empty, -> 0
  ok('no extra fires while the indicator is on other slots', foeLife(st) === L - 2, foeLife(st));
  E.crankSprocket(st, 0); // ptr 0 again -> fires AGAIN
  ok('re-fires when the indicator cycles back', foeLife(st) === L - 4, foeLife(st)); }

// slot choice delays via the pointer: index 1 (pointer at 0) fires on the 2nd crank
{ const st = game();
  E.placeContraption(st, 0, 1, ZAP);
  const L = foeLife(st);
  ok('ETA of slot index 1 with pointer 0 is 2 turns', E.contraptionEta(st.players[0], 1) === 2);
  E.crankSprocket(st, 0); ok('slot 2: no fire on crank 1', foeLife(st) === L);
  E.crankSprocket(st, 0); ok('slot 2: fires on crank 2', foeLife(st) === L - 2); }

// the indicator cycles 0 -> 1 -> 2 -> 0
{ const st = game();
  E.crankSprocket(st, 0); ok('pointer 0 -> 1', st.players[0].sprocketPointer === 1);
  E.crankSprocket(st, 0); ok('pointer 1 -> 2', st.players[0].sprocketPointer === 2);
  E.crankSprocket(st, 0); ok('pointer 2 -> 0', st.players[0].sprocketPointer === 0); }

// the fired effect actually runs (Sap Sucker grants mana)
{ const st = game(); E.placeContraption(st, 0, 0, MANA);
  const m = E.availableMana(st.players[0]); E.crankSprocket(st, 0);
  ok('Sap Sucker grants 1 mana on fire', E.availableMana(st.players[0]) === m + 1); }

// an empty sprocket cranks harmlessly (pointer still advances)
{ const st = game(); E.crankSprocket(st, 0);
  ok('empty sprocket crank: no crash, pointer advanced', st.players[0].sprocketPointer === 1 && st.players[0].sprocket.every(x => x === null)); }

// the new random-enemy damage primitive (Thud-for-Duds) hits an enemy creature
{ const st = game();
  const foe = E.instantiate(byId._big, 1); foe.zone = 'board'; st.players[1].board.push(foe);
  E.placeContraption(st, 0, 0, 'contraption_thud_for_duds');
  E.crankSprocket(st, 0);
  ok('Thud-for-Duds deals 3 to a random enemy creature', foe.damage === 3 && E.hp(foe) === 3, `dmg=${foe.damage} hp=${E.hp(foe)}`); }

// Turbo-Thwacking Auto-Hammer grants Windfury to a friendly creature
{ const st = game();
  const c = E.instantiate(byId._m, 0); c.zone = 'board'; st.players[0].board.push(c);
  E.placeContraption(st, 0, 0, 'contraption_turbo_thwacking_auto_hammer');
  E.crankSprocket(st, 0);
  ok('Turbo-Thwacking grants Windfury to a friendly', c.keywords.includes('windfury'), c.keywords); }

// every ported Contraption fires without error (real MTG effects, all auto-resolving)
{ for (const c of E.contraptionPool(game())) {
    const st = game();
    const mine = E.instantiate(byId._m, 0); mine.zone = 'board'; st.players[0].board.push(mine);
    const foe = E.instantiate(byId._f, 1); foe.zone = 'board'; st.players[1].board.push(foe);
    st.players[0].deck = ['_m', '_m', '_m']; st.players[1].deck = ['_f', '_f', '_f', '_f'];
    E.placeContraption(st, 0, 0, c.id);
    let threw = false; try { E.crankSprocket(st, 0); } catch (e) { threw = true; console.log('  FIRE ERROR', c.id, e.message); }
    ok(`${c.id.replace('contraption_', '')} fires cleanly`, !threw);
  } }

console.log(`${pass}/${pass + fail} sprocket checks passed`);
process.exit(fail ? 1 : 0);
