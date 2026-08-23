// pool_vorinclex_test.mjs — Vorinclex boss pool (G Phyrexian ramp + doubled +1/+1 counters + giant tramplers + mana denial).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._small = { id: '_small', name: 'S', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 4, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Vorinclex');
// ---- rubric ----
ok('Vorinclex pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl location/enchantment/instant/quest', types.size >= 6 && ['location', 'enchantment', 'instant', 'quest'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Green', pool.every(c => (c.colors || []).join('') === 'G'));
ok('the boss (sig) doubles your +1/+1 counters', byId.vorinclex_sig.type === 'creature' && byId.vorinclex_sig.static && byId.vorinclex_sig.static.type === 'counter-doubler');

function game() {
  const st = E.createGame(byId, seededRng(30), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const emptyMana = (st, pi, cur, max) => { st.players[pi].mana = { cur, max, bonus: 0 }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_wall'); emptyMana(st, 1, 2, 10); let threw = null;
  const tgt = (c.id === 'vorinclex_instinct') ? { type: 'creature', uid: fr.uid, player: 0 }
    : (c.id === 'vorinclex_hostility') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid } : null;
  try { play(st, 0, c.id, tgt, c.id === 'vorinclex_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig: ramp + steal + counter-doubler (cur stays high enough to pay the 7-cost) ----
{ const st = game(); emptyMana(st, 1, 2, 10); // p0 keeps default 30/30
  play(st, 0, 'vorinclex_sig', null);
  ok('Vorinclex boss ramps you +2 and steals 1 (net +3 max)', st.players[0].mana.max === 30 + 3, st.players[0].mana.max);
  ok('Vorinclex boss reduces opponent max mana by 1', st.players[1].mana.max === 9, st.players[1].mana.max); }

// ---- counter-doubler: grow doubles while the boss is out ----
{ const st = game(); const ally = put(st, 0, '_v');
  play(st, 0, 'vorinclex_monstrosity', null);
  ok('without the boss, Monstrosity adds a single +1/+1 counter', ally.attack === 3 && E.hp(ally) === 3, [ally.attack, E.hp(ally)]);
  const st2 = game(); put(st2, 0, 'vorinclex_sig'); const ally2 = put(st2, 0, '_v');
  play(st2, 0, 'vorinclex_monstrosity', null);
  ok('with the boss out, counters are DOUBLED (+2/+2)', ally2.attack === 4 && E.hp(ally2) === 4, [ally2.attack, E.hp(ally2)]); }

// ---- devastator: grows when it attacks ----
{ const st = game(); const dev = put(st, 0, 'vorinclex_devastator'); const a0 = dev.attack, h0 = E.hp(dev);
  E.attack(st, 0, dev.uid, { type: 'hero', player: 1 });
  ok('Devastator gains a +1/+1 counter when it attacks', dev.attack === a0 + 1 && E.hp(dev) === h0 + 1, [a0, dev.attack]); }

// ---- primalism: grows each turn start (deathtouch grower) ----
{ const st = game(); const pm = put(st, 0, 'vorinclex_primalism'); const a0 = pm.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Primalism gains a +1/+1 counter at turn start', pm.attack === a0 + 1, [a0, pm.attack]); }

// ---- monument location: tap to grow the team ----
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'vorinclex_monument', null);
  const loc = st.players[0].board.find(c => c.id === 'vorinclex_monument'); const a0 = v.attack;
  E.tapLand(st, 0, loc.uid, 0);
  ok('Monument taps to put a +1/+1 counter on each of your creatures', v.attack === a0 + 1, [a0, v.attack]); }

// ---- voracity enchantment: ramp each turn ----
{ const st = game(); emptyMana(st, 0, 3, 3); play(st, 0, 'vorinclex_voracity', null);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Voracity gains a Mana Crystal at turn start', st.players[0].mana.max === 4, st.players[0].mana.max); }

// ---- command modal: ramp mode (mode 1) ----
{ const st = game(); // default 30/30 so the 5-cost is payable
  play(st, 0, 'vorinclex_command', null, 1);
  ok('Command (ramp mode) gains three Mana Crystals', st.players[0].mana.max === 33, st.players[0].mana.max); }

// ---- command modal: big body (mode 2) ----
{ const st = game(); const n0 = st.players[0].board.length;
  play(st, 0, 'vorinclex_command', null, 2);
  ok('Command (body mode) makes a 6/6 Phyrexian with Trample', st.players[0].board.some(c => c.name === 'Phyrexian' && c.attack === 6 && (c.keywords || []).includes('trample')) && st.players[0].board.length === n0 + 1, st.players[0].board.map(c => c.name + c.attack)); }

// ---- curse: steal two enemy crystals ----
{ const st = game(); emptyMana(st, 0, 5, 5); emptyMana(st, 1, 2, 10);
  play(st, 0, 'vorinclex_curse', null);
  ok('Curse steals two of the opponent’s Mana Crystals', st.players[1].mana.max === 8 && st.players[0].mana.max === 7, [st.players[0].mana.max, st.players[1].mana.max]); }

// ---- hostility: friendly fights an enemy ----
{ const st = game(); const fighter = put(st, 0, 'vorinclex_ravager'); const foe = put(st, 1, '_wall'); // 5/4 vs 3/4
  play(st, 0, 'vorinclex_hostility', { type: 'creature', uid: fighter.uid, player: 0, fightTarget: foe.uid }); E.sweepDeaths(st);
  ok('Hostility: your creature fights and kills the enemy', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- overgrowth quest: summon 5 -> reward ----
{ const st = game(); play(st, 0, 'vorinclex_overgrowth', null); // default 30/30 keeps the 5 plays payable
  ok('Overgrowth installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const pre = put(st, 0, '_v'); const pa0 = pre.attack;
  for (let i = 0; i < 5; i++) play(st, 0, '_v', null);
  ok('Overgrowth reward: your creatures get +2/+2', pre.attack >= pa0 + 2, [pa0, pre.attack]);
  ok('Overgrowth reward: gain two Mana Crystals', st.players[0].mana.max === 32, st.players[0].mana.max); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
