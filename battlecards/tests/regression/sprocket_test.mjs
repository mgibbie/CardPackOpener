// Sprocket / Contraptions. A Sprocket is 3 ordered slots. Assemble gives a random Contraption
// that you place into a slot (overwriting). At each of your turn-starts slot 1's Contraption
// fires once and is removed, then the slots advance (2->1, 3->2). So slot 1 fires next turn,
// slot 2 the turn after, slot 3 the turn after that.
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
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = ['_c', '_c', '_c', '_c', '_c', '_c']; p.board = []; p.life = 30; p.armor = 0; p.sprocket = [null, null, null]; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
};

// state + pool
ok('players start with a 3-slot empty sprocket', game().players[0].sprocket.length === 3 && game().players[0].sprocket.every(x => x === null));
ok('a Contraption pool exists', E.contraptionPool(game()).length >= 6);
ok('demo card carries the assemble effect', byId.assemble_a_contraption.effects.some(e => e.type === 'assemble'));

// Assemble: random contraption + a slot pick
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
  ok('placed Mana Battery in slot 1', st.players[0].sprocket[0].id === 'contraption_mana_battery');
  E.placeContraption(st, 0, 0, 'contraption_conveyor_belt');
  ok('placing in an occupied slot OVERWRITES', st.players[0].sprocket[0].id === 'contraption_conveyor_belt'); }

// slot 1 fires on the very next crank, then is consumed
{ const st = game();
  E.placeContraption(st, 0, 0, 'contraption_conveyor_belt'); // draw 1
  const h = st.players[0].hand.length;
  E.crankSprocket(st, 0);
  ok('slot 1: fires on the next crank (drew a card)', st.players[0].hand.length === h + 1);
  ok('slot 1: consumed after firing (one-shot)', !st.players[0].sprocket[0]); }

// slot 2 fires after two cranks (advances first)
{ const st = game();
  E.placeContraption(st, 0, 1, 'contraption_conveyor_belt');
  const h = st.players[0].hand.length;
  E.crankSprocket(st, 0);
  ok('slot 2: no fire on crank 1', st.players[0].hand.length === h);
  ok('slot 2: advanced into slot 1', st.players[0].sprocket[0] && st.players[0].sprocket[0].id === 'contraption_conveyor_belt' && !st.players[0].sprocket[1]);
  E.crankSprocket(st, 0);
  ok('slot 2: fires on crank 2', st.players[0].hand.length === h + 1); }

// slot 3 fires after three cranks
{ const st = game();
  E.placeContraption(st, 0, 2, 'contraption_conveyor_belt');
  const h = st.players[0].hand.length;
  E.crankSprocket(st, 0); ok('slot 3: no fire crank 1', st.players[0].hand.length === h);
  E.crankSprocket(st, 0); ok('slot 3: no fire crank 2', st.players[0].hand.length === h);
  E.crankSprocket(st, 0); ok('slot 3: fires on crank 3', st.players[0].hand.length === h + 1); }

// the fired effect actually runs (Mana Battery grants mana)
{ const st = game(); E.placeContraption(st, 0, 0, 'contraption_mana_battery');
  const m = E.availableMana(st.players[0]); E.crankSprocket(st, 0);
  ok('Mana Battery contraption grants 1 mana on fire', E.availableMana(st.players[0]) === m + 1, `${m} -> ${E.availableMana(st.players[0])}`); }

// an empty sprocket cranks harmlessly
{ const st = game(); E.crankSprocket(st, 0); ok('empty sprocket crank: no crash, no change', st.players[0].sprocket.every(x => x === null)); }

console.log(`${pass}/${pass + fail} sprocket checks passed`);
process.exit(fail ? 1 : 0);
