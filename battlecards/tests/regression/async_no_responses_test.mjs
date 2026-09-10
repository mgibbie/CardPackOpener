// async_no_responses_test.mjs — correspondence format: NO response windows.
// With state.noInstantResponses set (game.js startAsync sets it on every async
// boot path), the absent player is never offered priority — no ghost-played
// instants — while pre-committed reactions (secrets/traps) still fire.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function game(noResponses) {
  const st = E.createGame(byId, seededRng(150), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  if (noResponses) st.noInstantResponses = true;
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const play = (st, pi, id, target) => { const c = give(st, pi, id); return { c, okp: E.playCard(st, pi, c.uid, target ?? null) }; };

// baseline sanity: WITHOUT the flag, an opponent holding an instant gets a window
{ const st = game(false); give(st, 1, 'lightning_bolt');
  play(st, 0, 'divination', null);
  ok('baseline: live play still opens a response window', st.priority === 1, st.priority); }

// correspondence: the same cast resolves immediately — no window, no ghost
{ const st = game(true); give(st, 1, 'lightning_bolt'); const h0 = st.players[0].hand.length;
  play(st, 0, 'divination', null);
  ok('async: no priority window opens on a cast', st.priority == null && st.stack.length === 0, [st.priority, st.stack.length]);
  ok('async: the spell resolved immediately (drew 2)', st.players[0].hand.length === h0 + 2, [h0, st.players[0].hand.length]); }

// attacks resolve without a response window too
{ const st = game(true); give(st, 1, 'lightning_bolt');
  const a = put(st, 0, '_v'); const life0 = st.players[1].life;
  E.attack(st, 0, a.uid, { type: 'hero', player: 1 });
  ok('async: an attack resolves without a window', st.priority == null && st.players[1].life === life0 - a.attack, [st.priority, life0, st.players[1].life]); }

// pre-committed reactions still work: the absent player's secret fires on its own
{ const st = game(true);
  const s = E.instantiate(byId.noble_sacrifice, 1); s.zone = 'secret'; st.players[1].secrets.push(s);
  const a = put(st, 0, '_v'); const life0 = st.players[1].life;
  E.attack(st, 0, a.uid, { type: 'hero', player: 1 });
  ok('async: the absent player’s secret still fires', st.players[1].secrets.length === 0, st.players[1].secrets.length);
  ok('...redirecting the attack (hero untouched)', st.players[1].life === life0, [life0, st.players[1].life]); }

// ---- correspondence-only Island alternates: pool gating ----
// Normal games: the Island conjure never offers a corrOnly card. Correspondence
// games (banned cards filtered from the map): the pool is the 57 legal originals
// + 13 alternates and never a counter.
import('../../format.js').then(({ filterCorrespondence, isCounterCard }) => {
  const conjureMany = (st, n) => {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const h0 = st.players[0].hand.length;
      E.execEffects(st, 0, [{ type: 'conjure', count: 1, landSet: 'Island' }], null, null);
      const got = st.players[0].hand[st.players[0].hand.length - 1];
      if (st.players[0].hand.length > h0 && got) seen.add(got.id);
      st.players[0].hand = [];
    }
    return seen;
  };

  { const st = game(false); const seen = conjureMany(st, 300);
    ok('normal play: Island conjure never offers a correspondence alternate', [...seen].every(id => !byId[id].corrOnly), [...seen].filter(id => byId[id].corrOnly));
    ok('normal play: counters still conjureable (baseline)', [...seen].some(id => byId[id].counterSpell), seen.size); }

  { const st = game(true); st.cardsById = filterCorrespondence(byId, new Set());
    const seen = conjureMany(st, 400);
    ok('correspondence: conjure never offers a counter', [...seen].every(id => !isCounterCard(byId[id])), [...seen].filter(id => isCounterCard(byId[id])));
    ok('correspondence: the alternates DO appear', [...seen].some(id => byId[id].corrOnly), seen.size); }

  console.log(`${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
});
