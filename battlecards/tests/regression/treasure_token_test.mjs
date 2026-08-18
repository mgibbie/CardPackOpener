// Treasure Token sacrifice is now a choice: gain 1 mana / color-boost a creature you control /
// Discover a card of a color (pick a color, then 1 of 3). The boost + discover options chain
// through a color pick; boost then picks a creature.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._c = { id: '_c', name: 'C', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = () => {
	const st = E.createGame(byId, seededRng(5), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.life = 30; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
};
const addTreasure = st => { const t = E.instantiate(byId.treasure_token, 0); t.zone = 'artifact'; st.players[0].artifacts.push(t); return t; };
const putC = st => { const c = E.instantiate(byId._c, 0); c.zone = 'board'; c.sick = false; st.players[0].board.push(c); E.recomputeAuras(st); return c; };

// data
ok('treasure_token sacrifice is a choice', byId.treasure_token.sac.choose === 'treasure');

// sacrifice queues the main 3-way choice + removes the token
{ const st = game(); const t = addTreasure(st);
  ok('sacrificeToken succeeds', E.sacrificeToken(st, 0, t.uid));
  ok('token left the artifact zone', st.players[0].artifacts.length === 0);
  const pq = st.pickQueue[0];
  ok('main choice queued (treasure/main, 3 options)', pq && pq.mode === 'treasure' && pq.stage === 'main' && pq.ids.length === 3, pq && pq.ids); }

// option 1: gain 1 mana
{ const st = game(); const t = addTreasure(st); E.sacrificeToken(st, 0, t.uid);
  const before = E.availableMana(st.players[0]);
  E.resolvePick(st, 'mana');
  ok('mana: +1 available mana', E.availableMana(st.players[0]) === before + 1, `${before} -> ${E.availableMana(st.players[0])}`);
  ok('mana: chain done (queue empty)', st.pickQueue.length === 0); }

// option 2: color-boost a creature (main -> color -> creature)
{ const st = game(); const c = putC(st); const t = addTreasure(st); E.sacrificeToken(st, 0, t.uid);
  E.resolvePick(st, 'boost');
  let pq = st.pickQueue[0];
  ok('boost -> pick a color (5 options)', pq && pq.stage === 'color' && pq.then === 'boost' && pq.ids.length === 5, pq && pq.ids);
  E.resolvePick(st, 'R');
  pq = st.pickQueue[0];
  ok('color -> pick a friendly creature', pq && pq.stage === 'boost-target' && pq.ids.includes(c.uid), pq && pq.ids);
  const before = c.attack + E.hp(c) + (c.keywords || []).length;
  E.resolvePick(st, c.uid);
  E.recomputeAuras(st);
  ok('boost: a "boosted" event fired on the creature', st.events.some(e => e.type === 'boosted' && e.uid === c.uid));
  ok('boost: never weakens the creature', c.attack + E.hp(c) + (c.keywords || []).length >= before);
  ok('boost: chain done', st.pickQueue.length === 0); }

// option 2 with no creatures: fizzles cleanly
{ const st = game(); const t = addTreasure(st); E.sacrificeToken(st, 0, t.uid);
  E.resolvePick(st, 'boost'); E.resolvePick(st, 'G');
  ok('boost with no creatures: no target pick, no crash', st.pickQueue.length === 0); }

// option 3: Discover a card of a color (main -> color -> discover 1 of 3)
{ const st = game(); const t = addTreasure(st); E.sacrificeToken(st, 0, t.uid);
  E.resolvePick(st, 'discover');
  let pq = st.pickQueue[0];
  ok('discover -> pick a color', pq && pq.stage === 'color' && pq.then === 'discover');
  E.resolvePick(st, 'U');
  pq = st.pickQueue[0];
  ok('color -> a Discover pick is queued', pq && pq.discover && pq.ids.length >= 1, pq && pq.ids);
  ok('Discover offers only BLUE, non-token, non-land cards', pq && pq.ids.every(id => (byId[id].colors || []).includes('U') && byId[id].type !== 'land' && !byId[id].token), pq && pq.ids);
  ok('Discover offers at most 3', pq && pq.ids.length <= 3, pq && pq.ids.length); }

console.log(`${pass}/${pass + fail} treasure token checks passed`);
process.exit(fail ? 1 : 0);
