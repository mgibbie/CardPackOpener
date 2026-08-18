// Sprocket / Contraptions. 3 slots + an indicator that cycles 1->2->3->1. Assemble gives a
// random Contraption you place into a slot (overwriting); Contraptions STAY in their slot. At
// each of your turn-starts the indicator's current slot fires (if it holds one), then the
// indicator advances — so a Contraption fires each time the indicator cycles back to it, and
// the slot you pick sets how many ticks until the indicator first reaches it.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(9), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = ['_c', '_c', '_c', '_c', '_c', '_c']; p.board = []; p.life = 30; p.armor = 0; p.sprocket = [null, null, null]; p.sprocketPointer = 0; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
};

// state + pool
{ const p = game().players[0];
  ok('players start with 3 empty slots + pointer at 0', p.sprocket.length === 3 && p.sprocket.every(x => x === null) && p.sprocketPointer === 0); }
ok('a Contraption pool exists', E.contraptionPool(game()).length >= 6);
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
  E.placeContraption(st, 0, 0, 'contraption_mana_battery');
  E.placeContraption(st, 0, 0, 'contraption_conveyor_belt');
  ok('placing in an occupied slot OVERWRITES', st.players[0].sprocket[0].id === 'contraption_conveyor_belt'); }

// the pointed slot fires on the next crank, and the Contraption STAYS
{ const st = game();
  E.placeContraption(st, 0, 0, 'contraption_conveyor_belt'); // draw 1, at the pointer (slot 0)
  const h = st.players[0].hand.length;
  E.crankSprocket(st, 0);
  ok('pointed Contraption fires on crank (drew a card)', st.players[0].hand.length === h + 1);
  ok('Contraption STAYS in its slot (persistent)', st.players[0].sprocket[0] && st.players[0].sprocket[0].id === 'contraption_conveyor_belt');
  ok('indicator advanced to the next slot', st.players[0].sprocketPointer === 1); }

// re-fires each time the indicator cycles back (every 3 turns)
{ const st = game();
  E.placeContraption(st, 0, 0, 'contraption_conveyor_belt');
  const h = st.players[0].hand.length;
  E.crankSprocket(st, 0); // ptr 0 fires (+1), -> 1
  E.crankSprocket(st, 0); // ptr 1 empty, -> 2
  E.crankSprocket(st, 0); // ptr 2 empty, -> 0
  ok('no extra fires while the indicator is on other slots', st.players[0].hand.length === h + 1);
  E.crankSprocket(st, 0); // ptr 0 again -> fires AGAIN
  ok('re-fires when the indicator cycles back', st.players[0].hand.length === h + 2); }

// slot choice delays via the pointer: index 1 (pointer at 0) fires on the 2nd crank
{ const st = game();
  E.placeContraption(st, 0, 1, 'contraption_conveyor_belt');
  const h = st.players[0].hand.length;
  ok('ETA of slot index 1 with pointer 0 is 2 turns', E.contraptionEta(st.players[0], 1) === 2);
  E.crankSprocket(st, 0); ok('slot 2: no fire on crank 1', st.players[0].hand.length === h);
  E.crankSprocket(st, 0); ok('slot 2: fires on crank 2', st.players[0].hand.length === h + 1); }

// the indicator cycles 0 -> 1 -> 2 -> 0
{ const st = game();
  E.crankSprocket(st, 0); ok('pointer 0 -> 1', st.players[0].sprocketPointer === 1);
  E.crankSprocket(st, 0); ok('pointer 1 -> 2', st.players[0].sprocketPointer === 2);
  E.crankSprocket(st, 0); ok('pointer 2 -> 0', st.players[0].sprocketPointer === 0); }

// the fired effect actually runs (Mana Battery)
{ const st = game(); E.placeContraption(st, 0, 0, 'contraption_mana_battery');
  const m = E.availableMana(st.players[0]); E.crankSprocket(st, 0);
  ok('Mana Battery grants 1 mana on fire', E.availableMana(st.players[0]) === m + 1); }

// an empty sprocket cranks harmlessly (pointer still advances)
{ const st = game(); E.crankSprocket(st, 0);
  ok('empty sprocket crank: no crash, pointer advanced', st.players[0].sprocketPointer === 1 && st.players[0].sprocket.every(x => x === null)); }

console.log(`${pass}/${pass + fail} sprocket checks passed`);
process.exit(fail ? 1 : 0);
