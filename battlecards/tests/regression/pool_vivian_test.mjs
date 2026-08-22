// pool_vivian_test.mjs — Vivien pool redesign (G beast TOOLBOX: Adapt + hunt/tutor + Arkbow + deathtouch).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'B', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', tribe: 'Beast' };
byId._x = { id: '_x', name: 'X', type: 'creature', cost: 2, attack: 2, health: 8, rarity: 'common', tribe: 'Ogre' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const pool = raw.cards.filter(c => c.loreDeck === 'Vivian');
// ---- rubric ----
ok('Vivien pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl planeswalker/artifact/enchantment/instant', types.size >= 6 && ['planeswalker', 'artifact', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('>=3 persistent engines', pool.filter(c => c.ongoing || c.aura || c.tapAbility).length >= 3, pool.filter(c => c.ongoing || c.aura || c.tapAbility).map(c => c.id));
ok('uses Adapt (toolbox) on multiple cards', pool.filter(c => (c.effects || []).some(e => e.type === 'adapt')).length >= 2, pool.filter(c => (c.effects || []).some(e => e.type === 'adapt')).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(2), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_beast', '_beast', '_beast', '_beast', '_beast']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_beast'); const foe = put(st, 1, '_x'); let threw = null;
  const tgt = (c.id === 'vivian_hunt') ? { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid }
    : (['vivian_ranger', 'vivian_command'].includes(c.id)) ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- jungle guide: tutor a Beast from your deck ----
{ const st = game(); const d0 = st.players[0].deck.length; const h0 = st.players[0].hand.length;
  play(st, 0, 'vivian_jungle_guide', null);
  ok('Jungle Guide tutors a Beast to hand', st.players[0].hand.some(c => c.id === '_beast') && st.players[0].deck.length === d0 - 1, [d0, st.players[0].deck.length, h0, st.players[0].hand.length]); }

// ---- arkbow artifact: tap to shoot a creature for 3 ----
{ const st = game(); const bow = (() => { const c = E.instantiate(byId.vivian_arkbow, 0); c.zone = 'artifact'; c.tapped = false; st.players[0].artifacts.push(c); return c; })();
  const foe = put(st, 1, '_x');
  const okTap = E.tapArtifact(st, 0, bow.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('Arkbow taps to deal 3 to a creature', okTap && foe.damage === 3 && bow.tapped === true, [okTap, foe.damage, bow.tapped]); }

// ---- talent: Beast anthem (+1/+1 and Deathtouch) ----
{ const st = game(); play(st, 0, 'vivian_talent', null); const b = put(st, 0, '_beast'); E.recomputeAuras(st);
  ok('Talent gives Beasts +1/+1 and Deathtouch', b.attack === 4 && E.hp(b) === 4 && (E.has ? E.has(b, 'deathtouch') : b.keywords.includes('deathtouch')), [b.attack, E.hp(b), b.keywords]); }

// ---- menagerie: Beast lord (+1/+1) ----
{ const st = game(); put(st, 0, 'vivian_menagerie'); const b = put(st, 0, '_beast'); E.recomputeAuras(st);
  ok('Menagerie buffs other Beasts +1/+1', b.attack === 4 && E.hp(b) === 4, [b.attack, E.hp(b)]); }

// ---- command: single-beast go-tall pump ----
{ const st = game(); const b = put(st, 0, '_beast');
  play(st, 0, 'vivian_command', { type: 'creature', uid: b.uid, player: 0 });
  ok('Command gives a creature +4/+4 and Trample', b.attack === 7 && E.hp(b) === 7 && (E.has ? E.has(b, 'trample') : b.keywords.includes('trample')), [b.attack, E.hp(b)]); }

// ---- prowler Adapt: battlecry queues an Adapt pick; resolving it upgrades the creature ----
{ const st = game(); const { c: pr } = play(st, 0, 'vivian_prowler', null);
  ok('Prowler battlecry offers an Adapt pick', st.pickQueue && st.pickQueue.some(p => p.mode === 'adapt'), st.pickQueue);
  const pk = st.pickQueue.find(p => p.mode === 'adapt');
  E.resolvePick(st, 0, pk.ids[0]);
  const grew = pr.attack > 3 || E.hp(pr) > 3 || (pr.keywords || []).length > 2 || !!pr.shield;
  ok('Resolving Adapt upgrades the creature', grew, [pr.attack, E.hp(pr), pr.keywords, pr.shield]); }

// ---- serpent: deathtouch + first strike (safe answer) ----
ok('Serpent is a deathtouch + first-strike answer', (byId.vivian_serpent.keywords || []).includes('deathtouch') && (byId.vivian_serpent.keywords || []).includes('first_strike'));

// ---- hunt: fight ----
{ const st = game(); const fr = put(st, 0, '_beast'); const foe = put(st, 1, '_x');
  play(st, 0, 'vivian_hunt', { type: 'creature', uid: fr.uid, player: 0, fightTarget: foe.uid });
  ok('Hunt: the buffed friendly fights an enemy', foe.damage >= 5, [foe.damage]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
