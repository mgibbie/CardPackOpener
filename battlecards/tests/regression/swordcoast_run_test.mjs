// swordcoast_run_test.mjs — Lorequest Sword Coast run module (swordcoast.js) + the 38 hero powers.
// Covers the pure run logic (rosters, rung gating, deck sizes, static enemy gen, alternating reward,
// spoils draft) AND engine integration: every one of the 38 unique hero powers installs at createGame
// and fires through useHeroPower without throwing / leaving an invalid state.
import fs from 'fs';
import * as SC from '../../swordcoast.js';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
cardsById._foe = { id: '_foe', name: 'F', type: 'creature', cost: 5, attack: 5, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ───────────────────────── rosters ─────────────────────────
ok('10 base heroes', SC.HEROES.length === 10, SC.HEROES.length);
ok('secret hero = Gale', SC.SECRET_HEROES.length === 1 && SC.SECRET_HEROES[0] === 'Gale');
ok('27 enemies total', SC.ENEMIES.length === 27, SC.ENEMIES.length);
ok('rung sizes A9 B9 C7 D2', SC.ENEMY_RUNGS.A.length === 9 && SC.ENEMY_RUNGS.B.length === 9 && SC.ENEMY_RUNGS.C.length === 7 && SC.ENEMY_RUNGS.D.length === 2,
  [SC.ENEMY_RUNGS.A.length, SC.ENEMY_RUNGS.B.length, SC.ENEMY_RUNGS.C.length, SC.ENEMY_RUNGS.D.length]);
ok('heroes and enemies are disjoint', SC.HEROES.every(h => !SC.ENEMIES.includes(h)) && SC.ENEMIES.every(e => !SC.isHero(e)));
ok('every enemy has a class', SC.ENEMIES.every(e => SC.classOf(e) !== 'neutral'), SC.ENEMIES.filter(e => SC.classOf(e) === 'neutral'));
ok('every hero+secret has a class', [...SC.HEROES, ...SC.SECRET_HEROES].every(h => SC.classOf(h) !== 'neutral'));
ok('WINS_TO_CLEAR=12 / LOSSES_TO_END=3', SC.WINS_TO_CLEAR === 12 && SC.LOSSES_TO_END === 3);
ok('every character has a colour identity', [...SC.HEROES, ...SC.SECRET_HEROES, ...SC.ENEMIES].every(ch => SC.colorsOf(ch).length > 0));

// ───────────────────────── hero powers (38) ─────────────────────────
const ALL_CHARS = [...SC.HEROES, ...SC.SECRET_HEROES, ...SC.ENEMIES];
ok('38 characters total (11 heroes + 27 enemies)', ALL_CHARS.length === 38, ALL_CHARS.length);
ok('every character has a unique hero power', ALL_CHARS.every(ch => SC.HERO_POWERS[ch]), ALL_CHARS.filter(ch => !SC.HERO_POWERS[ch]));
ok('all 38 power NAMES are distinct', new Set(ALL_CHARS.map(ch => SC.HERO_POWERS[ch].name)).size === 38, new Set(ALL_CHARS.map(ch => SC.HERO_POWERS[ch].name)).size);
ok('every power has {name,cost,text,effects[]}', ALL_CHARS.every(ch => { const p = SC.HERO_POWERS[ch]; return p.name && typeof p.cost === 'number' && p.text && Array.isArray(p.effects) && p.effects.length; }));
ok('seatOf carries class id + name + power', (() => { const s = SC.seatOf('Drizzt'); return s.id === 'hunter' && s.name === 'Drizzt' && s.power === SC.HERO_POWERS['Drizzt']; })());

// ───────────────────────── decks ─────────────────────────
for (const h of SC.HEROES) ok(`${h}: hero deck = 10 singleton cards`, SC.deckOf(cardsById, h).length === 10, SC.deckOf(cardsById, h).length);
ok('Gale: hero deck = 10', SC.deckOf(cardsById, 'Gale').length === 10, SC.deckOf(cardsById, 'Gale').length);
for (const e of SC.ENEMIES) {
  const d = SC.deckOf(cardsById, e);
  ok(`${e}: enemy deck = 30 (2×15)`, d.length === 30, d.length);
  ok(`${e}: exactly 15 distinct cards ×2`, new Set(d).size === 15, new Set(d).size);
}

// ───────────────────────── rung gating ─────────────────────────
ok('win 0 roster = all of Rung A (incl. first-only)', SC.enemyRosterFor(0).length === 9 && SC.FIRST_ONLY.size === 2 && [...SC.FIRST_ONLY].every(f => SC.enemyRosterFor(0).includes(f)));
ok('wins 1–2 roster = Rung A minus first-only (7)', SC.enemyRosterFor(1).length === 7 && SC.enemyRosterFor(2).length === 7 && [...SC.FIRST_ONLY].every(f => !SC.enemyRosterFor(1).includes(f)));
ok('wins 3–6 = Rung B (9)', [3, 4, 5, 6].every(w => SC.enemyRosterFor(w).length === 9 && SC.enemyRosterFor(w).every(e => SC.ENEMY_RUNGS.B.includes(e))));
ok('wins 7–10 = Rung C (7)', [7, 8, 9, 10].every(w => SC.enemyRosterFor(w).length === 7 && SC.enemyRosterFor(w).every(e => SC.ENEMY_RUNGS.C.includes(e))));
ok('win 11 = Rung D final boss (2)', SC.enemyRosterFor(11).length === 2 && SC.enemyRosterFor(11).every(e => SC.ENEMY_RUNGS.D.includes(e)));
{ const reachable = new Set(); for (let w = 0; w <= 11; w++) for (const e of SC.enemyRosterFor(w)) reachable.add(e);
  ok('all 27 enemies reachable across wins 0..11', reachable.size === 27, reachable.size); }
{ const rng = seededRng(5); let last = null, okAll = true;
  for (let w = 0; w <= 11; w++) { const e = SC.randomEnemy(w, rng, last); if (!SC.enemyRosterFor(w).includes(e) || e === last) okAll = false; last = e; }
  ok('randomEnemy: in-rung + no immediate repeat', okAll); }

// ───────────────────────── static enemy gen ─────────────────────────
{ const g = SC.generateEnemy(cardsById, 'Tiamat');
  ok('generateEnemy static shape (id/name/cls/deck, 30 cards, no loot)', g.id === 'Tiamat' && g.name === 'Tiamat' && g.cls === 'warrior' && g.deck.length === 30 && g.loot === undefined, [g.cls, g.deck.length]); }

// ───────────────────────── loot ─────────────────────────
ok('rewardForWin alternates treasure(odd)/bucket(even)', [1, 2, 3, 4, 5, 6].map(SC.rewardForWin).join(',') === 'treasure,bucket,treasure,bucket,treasure,bucket');
{ const rng = seededRng(9); const sp = SC.spoilsChoices(cardsById, 'Bhaal, Lord of Murder', rng, 3);
  ok('spoilsChoices: 3 distinct ids from the fallen foe’s pool', sp.length === 3 && new Set(sp).size === 3 && sp.every(id => cardsById[id] && cardsById[id].scDeck === 'Bhaal, Lord of Murder'), sp); }
ok('treasurePool returns DUELS treasures', SC.treasurePool(cardsById).length > 0
  && SC.treasurePool(cardsById).every(d => (d.treasure && d.set === 'DUELS') || d.scTreasure));

// ───────────────────────── engine integration: install + fire all 38 powers ─────────────────────────
function bootWith(seatChar, oppChar = 'Drizzt') {
  const picks = [SC.seatOf(seatChar), SC.seatOf(oppChar)];
  const st = E.createGame(cardsById, seededRng(3), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, picks);
  st.classPicks = picks;
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.mana = { cur: 10, max: 10, bonus: 0 }; }
  return st;
}
{ const st = bootWith('Drizzt', 'Tiamat');
  ok('createGame installs BOTH seats’ hero powers', (st.players[0].heroPowers || []).length >= 1 && (st.players[1].heroPowers || []).length >= 1,
    [st.players[0].heroPowers?.length, st.players[1].heroPowers?.length]);
  ok('player 0 power name matches HERO_POWERS[Drizzt]', st.players[0].heroPowers.some(hp => hp.name === 'Flashing Scimitars'));
  ok('player 1 power name matches HERO_POWERS[Tiamat]', st.players[1].heroPowers.some(hp => hp.name === 'Five Heads Roar')); }

const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
function powerTarget(power, friendlyUid, foeUid) {
  const toks = (power.effects || []).map(e => e.target).filter(Boolean);
  if (toks.some(t => ['enemy-creature', 'any'].includes(t))) return { type: 'creature', uid: foeUid, player: 1 };
  if (toks.some(t => t === 'friendly-creature')) return { type: 'creature', uid: friendlyUid, player: 0 };
  return null;
}
for (const ch of ALL_CHARS) {
  const st = bootWith(ch);
  const fr = put(st, 0, '_v'); const foe = put(st, 1, '_foe');
  const power = SC.HERO_POWERS[ch];
  const hp = st.players[0].heroPowers.find(h => h.name === power.name);
  ok(`${ch}: power '${power.name}' installed on hero (cost ${power.cost})`, !!hp && hp.power && hp.power.cost === power.cost, hp && hp.power && hp.power.cost);
  let threw = null;
  try { E.useHeroPower(st, 0, hp.uid, powerTarget(power, fr.uid, foe.uid), null); if (st.scryQueue && st.scryQueue.length) E.resolveScry(st, []); E.sweepDeaths(st); } catch (e) { threw = e; }
  ok(`${ch}: hero power '${power.name}' fires without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${ch}: state valid after firing '${power.name}'`, !v || v.length === 0, v);
}

// spot-check a few power EFFECTS actually happened
{ const st = bootWith('Halsin'); const b0 = st.players[0].board.length;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Wild Shape');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Halsin power summons a Beast', st.players[0].board.length === b0 + 1 && st.players[0].board.some(c => c.name === 'Wild Shape')); }
{ const st = bootWith('Nadaar'); st.players[0].life -= 5; const l0 = st.players[0].life;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Selfless Guard');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Nadaar power gains 3 life', st.players[0].life === l0 + 3, [l0, st.players[0].life]); }
{ const st = bootWith('Baba Lysaga, Night Witch'); const f1 = put(st, 1, '_v'); const f2 = put(st, 1, '_v');
  const hp = st.players[0].heroPowers.find(h => h.name === 'Night Hexes');
  E.useHeroPower(st, 0, hp.uid, null, null); E.sweepDeaths(st);
  ok('Baba Lysaga power damages all enemy creatures', st.players[1].board.length === 2 && st.players[1].board.every(c => (c.damage || 0) >= 1), st.players[1].board.map(c => c.damage)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
