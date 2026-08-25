// finalfantasy_run_test.mjs — Lorequest Final Fantasy run module (finalfantasy.js) + the 38 hero powers.
// Covers pure run logic (rosters, rung gating, deck sizes, static enemy gen, loot, spoils) AND engine
// integration: every one of the 38 unique hero powers installs at createGame and fires through
// useHeroPower without throwing / leaving an invalid state. Also checks the SPRITSUMMON hero powers.
import fs from 'fs';
import * as FF from '../../finalfantasy.js';
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
ok('10 base heroes', FF.HEROES.length === 10, FF.HEROES.length);
ok('secret hero = Gilgamesh', FF.SECRET_HEROES.length === 1 && FF.SECRET_HEROES[0] === 'Gilgamesh');
ok('27 enemies total', FF.ENEMIES.length === 27, FF.ENEMIES.length);
ok('rung sizes A9 B9 C7 D2', FF.ENEMY_RUNGS.A.length === 9 && FF.ENEMY_RUNGS.B.length === 9 && FF.ENEMY_RUNGS.C.length === 7 && FF.ENEMY_RUNGS.D.length === 2,
  [FF.ENEMY_RUNGS.A.length, FF.ENEMY_RUNGS.B.length, FF.ENEMY_RUNGS.C.length, FF.ENEMY_RUNGS.D.length]);
ok('heroes and enemies are disjoint', FF.HEROES.every(h => !FF.ENEMIES.includes(h)) && FF.ENEMIES.every(e => !FF.isHero(e)));
ok('every enemy has a class', FF.ENEMIES.every(e => FF.classOf(e) !== 'neutral'), FF.ENEMIES.filter(e => FF.classOf(e) === 'neutral'));
ok('every hero+secret has a class', [...FF.HEROES, ...FF.SECRET_HEROES].every(h => FF.classOf(h) !== 'neutral'));
ok('WINS_TO_CLEAR=12 / LOSSES_TO_END=3', FF.WINS_TO_CLEAR === 12 && FF.LOSSES_TO_END === 3);
ok('every character has a colour identity', [...FF.HEROES, ...FF.SECRET_HEROES, ...FF.ENEMIES].every(ch => FF.colorsOf(ch).length > 0));

// ───────────────────────── hero powers (38) ─────────────────────────
const ALL_CHARS = [...FF.HEROES, ...FF.SECRET_HEROES, ...FF.ENEMIES];
ok('38 characters total (11 heroes + 27 enemies)', ALL_CHARS.length === 38, ALL_CHARS.length);
ok('every character has a unique hero power', ALL_CHARS.every(ch => FF.HERO_POWERS[ch]), ALL_CHARS.filter(ch => !FF.HERO_POWERS[ch]));
ok('all 38 power NAMES are distinct', new Set(ALL_CHARS.map(ch => FF.HERO_POWERS[ch].name)).size === 38, new Set(ALL_CHARS.map(ch => FF.HERO_POWERS[ch].name)).size);
ok('every power has {name,cost,text,effects[]}', ALL_CHARS.every(ch => { const p = FF.HERO_POWERS[ch]; return p.name && typeof p.cost === 'number' && p.text && Array.isArray(p.effects) && p.effects.length; }));
ok('seatOf carries class id + name + power', (() => { const s = FF.seatOf('Cloud'); return s.id === 'warrior' && s.name === 'Cloud' && s.power === FF.HERO_POWERS['Cloud']; })());

// ───────────────────────── decks ─────────────────────────
for (const h of FF.HEROES) ok(`${h}: hero deck = 10 singleton cards`, FF.deckOf(cardsById, h).length === 10, FF.deckOf(cardsById, h).length);
ok('Gilgamesh: hero deck = 10', FF.deckOf(cardsById, 'Gilgamesh').length === 10, FF.deckOf(cardsById, 'Gilgamesh').length);
for (const e of FF.ENEMIES) {
  const d = FF.deckOf(cardsById, e);
  ok(`${e}: enemy deck = 30 (2×15)`, d.length === 30, d.length);
  ok(`${e}: exactly 15 distinct cards ×2`, new Set(d).size === 15, new Set(d).size);
}

// ───────────────────────── rung gating ─────────────────────────
ok('win 0 roster = all of Rung A (incl. first-only)', FF.enemyRosterFor(0).length === 9 && FF.FIRST_ONLY.size === 2 && [...FF.FIRST_ONLY].every(f => FF.enemyRosterFor(0).includes(f)));
ok('wins 1–2 roster = Rung A minus first-only (7)', FF.enemyRosterFor(1).length === 7 && FF.enemyRosterFor(2).length === 7 && [...FF.FIRST_ONLY].every(f => !FF.enemyRosterFor(1).includes(f)));
ok('wins 3–6 = Rung B (9)', [3, 4, 5, 6].every(w => FF.enemyRosterFor(w).length === 9 && FF.enemyRosterFor(w).every(e => FF.ENEMY_RUNGS.B.includes(e))));
ok('wins 7–10 = Rung C (7)', [7, 8, 9, 10].every(w => FF.enemyRosterFor(w).length === 7 && FF.enemyRosterFor(w).every(e => FF.ENEMY_RUNGS.C.includes(e))));
ok('win 11 = Rung D final boss (2)', FF.enemyRosterFor(11).length === 2 && FF.enemyRosterFor(11).every(e => FF.ENEMY_RUNGS.D.includes(e)));
{ const reachable = new Set(); for (let w = 0; w <= 11; w++) for (const e of FF.enemyRosterFor(w)) reachable.add(e);
  ok('all 27 enemies reachable across wins 0..11', reachable.size === 27, reachable.size); }
{ const rng = seededRng(5); let last = null, okAll = true;
  for (let w = 0; w <= 11; w++) { const e = FF.randomEnemy(w, rng, last); if (!FF.enemyRosterFor(w).includes(e) || e === last) okAll = false; last = e; }
  ok('randomEnemy: in-rung + no immediate repeat', okAll); }

// ───────────────────────── static enemy gen ─────────────────────────
{ const g = FF.generateEnemy(cardsById, 'Sephiroth, One-Winged Angel');
  ok('generateEnemy static shape (id/name/cls/deck, 30 cards, no loot)', g.id === 'Sephiroth, One-Winged Angel' && g.cls === 'warlock' && g.deck.length === 30 && g.loot === undefined, [g.cls, g.deck.length]); }

// ───────────────────────── loot ─────────────────────────
ok('rewardForWin alternates treasure(odd)/bucket(even)', [1, 2, 3, 4, 5, 6].map(FF.rewardForWin).join(',') === 'treasure,bucket,treasure,bucket,treasure,bucket');
{ const rng = seededRng(9); const sp = FF.spoilsChoices(cardsById, 'Kefka, Dancing Mad', rng, 3);
  ok('spoilsChoices: 3 distinct ids from the fallen foe’s pool', sp.length === 3 && new Set(sp).size === 3 && sp.every(id => cardsById[id] && cardsById[id].ffDeck === 'Kefka, Dancing Mad'), sp); }
ok('treasurePool returns DUELS treasures', FF.treasurePool(cardsById).length > 0
  && FF.treasurePool(cardsById).every(d => (d.treasure && d.set === 'DUELS') || d.ffTreasure));

// ───────────────────────── engine integration: install + fire all 38 powers ─────────────────────────
function bootWith(seatChar, oppChar = 'Cloud') {
  const picks = [FF.seatOf(seatChar), FF.seatOf(oppChar)];
  const st = E.createGame(cardsById, seededRng(3), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, picks);
  st.classPicks = picks;
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.mana = { cur: 10, max: 10, bonus: 0 }; }
  return st;
}
{ const st = bootWith('Cloud', 'Sephiroth, One-Winged Angel');
  ok('createGame installs BOTH seats’ hero powers', (st.players[0].heroPowers || []).length >= 1 && (st.players[1].heroPowers || []).length >= 1,
    [st.players[0].heroPowers?.length, st.players[1].heroPowers?.length]);
  ok('player 0 power name matches HERO_POWERS[Cloud]', st.players[0].heroPowers.some(hp => hp.name === 'Cross-Slash'));
  ok('player 1 power name matches Sephiroth', st.players[1].heroPowers.some(hp => hp.name === 'Supernova')); }

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
  const power = FF.HERO_POWERS[ch];
  const hp = st.players[0].heroPowers.find(h => h.name === power.name);
  ok(`${ch}: power '${power.name}' installed on hero (cost ${power.cost})`, !!hp && hp.power && hp.power.cost === power.cost, hp && hp.power && hp.power.cost);
  let threw = null;
  try { E.useHeroPower(st, 0, hp.uid, powerTarget(power, fr.uid, foe.uid), null); if (st.scryQueue && st.scryQueue.length) E.resolveScry(st, []); E.sweepDeaths(st); } catch (e) { threw = e; }
  ok(`${ch}: hero power '${power.name}' fires without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${ch}: state valid after firing '${power.name}'`, !v || v.length === 0, v);
}

// spot-check a few power EFFECTS actually happened
{ const st = bootWith('Yuna'); const b0 = st.players[0].board.length;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Grand Summon');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Yuna Spritsummon adds a Sprit token', st.players[0].board.length === b0 + 1 && st.players[0].board.some(c => c.tribe === 'Sprit'), st.players[0].board.map(c => c.tribe)); }
{ const st = bootWith('Cecil'); st.players[0].life -= 5; const l0 = st.players[0].life;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Cover');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Cecil Cover gains 3 life', st.players[0].life === l0 + 3, [l0, st.players[0].life]); }
{ const st = bootWith('Fandaniel, Telophoroi Ascian'); const f1 = put(st, 1, '_v'); const f2 = put(st, 1, '_v');
  const hp = st.players[0].heroPowers.find(h => h.name === 'Spread Despair');
  E.useHeroPower(st, 0, hp.uid, null, null); E.sweepDeaths(st);
  ok('Fandaniel damages all enemy creatures', st.players[1].board.length === 2 && st.players[1].board.every(c => (c.damage || 0) >= 1), st.players[1].board.map(c => c.damage)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
