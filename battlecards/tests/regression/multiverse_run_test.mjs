// multiverse_run_test.mjs — Lorequest: Multiverse run module (multiverse.js) + its 32 hero powers.
// Covers pure run logic (rosters, rung gating, 10-card decks, WIN-PARITY enemy gen, loot budget) AND
// engine integration: every one of the 32 unique hero powers installs at createGame and fires through
// useHeroPower without throwing / leaving an invalid state. Multiverse is the PARITY variant (like
// Duels/Lorequest): enemies are regenerated to match the player's bucket/treasure count — there is NO
// spoils draft and NO static 30-card foe.
import fs from 'fs';
import * as MV from '../../multiverse.js';
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
ok('10 base heroes', MV.HEROES.length === 10, MV.HEROES.length);
ok('secret hero = Silver Surfer', MV.SECRET_HEROES.length === 1 && MV.SECRET_HEROES[0] === 'Silver Surfer');
ok('21 villains total', MV.ENEMIES.length === 21, MV.ENEMIES.length);
ok('rung sizes STREET15 MASTERMIND4 COSMIC2', MV.ENEMY_RUNGS.STREET.length === 15 && MV.ENEMY_RUNGS.MASTERMIND.length === 4 && MV.ENEMY_RUNGS.COSMIC.length === 2,
  [MV.ENEMY_RUNGS.STREET.length, MV.ENEMY_RUNGS.MASTERMIND.length, MV.ENEMY_RUNGS.COSMIC.length]);
ok('COSMIC = Thanos + Galactus', MV.ENEMY_RUNGS.COSMIC.includes('Thanos') && MV.ENEMY_RUNGS.COSMIC.includes('Galactus'));
ok('heroes and villains are disjoint', MV.HEROES.every(h => !MV.ENEMIES.includes(h)) && MV.ENEMIES.every(e => !MV.isHero(e)));
ok('every villain has a class', MV.ENEMIES.every(e => MV.classOf(e) !== 'neutral'), MV.ENEMIES.filter(e => MV.classOf(e) === 'neutral'));
ok('every hero+secret has a class', [...MV.HEROES, ...MV.SECRET_HEROES].every(h => MV.classOf(h) !== 'neutral'));
ok('WINS_TO_CLEAR=12 / LOSSES_TO_END=3', MV.WINS_TO_CLEAR === 12 && MV.LOSSES_TO_END === 3);
// colourless Galactus is intentional; every OTHER character carries a colour identity for wiki pips
ok('all heroes + villains (except Galactus) have a colour identity',
  [...MV.HEROES, ...MV.SECRET_HEROES, ...MV.ENEMIES].filter(ch => ch !== 'Galactus').every(ch => MV.colorsOf(ch).length > 0));

// ───────────────────────── hero powers (32) ─────────────────────────
const ALL_CHARS = [...MV.HEROES, ...MV.SECRET_HEROES, ...MV.ENEMIES];
ok('32 characters total (11 heroes + 21 villains)', ALL_CHARS.length === 32, ALL_CHARS.length);
ok('every character has a unique hero power', ALL_CHARS.every(ch => MV.HERO_POWERS[ch]), ALL_CHARS.filter(ch => !MV.HERO_POWERS[ch]));
ok('all 32 power NAMES are distinct', new Set(ALL_CHARS.map(ch => MV.HERO_POWERS[ch].name)).size === 32, new Set(ALL_CHARS.map(ch => MV.HERO_POWERS[ch].name)).size);
ok('every power has {name,cost,text,effects[]}', ALL_CHARS.every(ch => { const p = MV.HERO_POWERS[ch]; return p.name && typeof p.cost === 'number' && p.text && Array.isArray(p.effects) && p.effects.length; }));
ok('seatOf carries class id + name + power', (() => { const s = MV.seatOf('Spider-Man'); return s.id === 'rogue' && s.name === 'Spider-Man' && s.power === MV.HERO_POWERS['Spider-Man']; })());

// ───────────────────────── decks (10-card singleton, hero AND villain) ─────────────────────────
for (const h of MV.HEROES) ok(`${h}: hero deck = 10 singleton cards`, MV.deckOf(cardsById, h).length === 10 && new Set(MV.deckOf(cardsById, h)).size === 10, MV.deckOf(cardsById, h).length);
ok('Silver Surfer: hero deck = 10', MV.deckOf(cardsById, 'Silver Surfer').length === 10, MV.deckOf(cardsById, 'Silver Surfer').length);
for (const e of MV.ENEMIES) {
  const d = MV.deckOf(cardsById, e);
  ok(`${e}: villain base deck = 10 singleton`, d.length === 10 && new Set(d).size === 10, d.length);
}

// ───────────────────────── rung gating (STREET 0–7 / MASTERMIND 8–10 / COSMIC 11) ─────────────────────────
ok('wins 0–7 = STREET (15)', [0, 1, 4, 7].every(w => MV.enemyRosterFor(w).length === 15 && MV.enemyRosterFor(w).every(e => MV.ENEMY_RUNGS.STREET.includes(e))));
ok('wins 8–10 = MASTERMIND (4)', [8, 9, 10].every(w => MV.enemyRosterFor(w).length === 4 && MV.enemyRosterFor(w).every(e => MV.ENEMY_RUNGS.MASTERMIND.includes(e))));
ok('win 11 = COSMIC final (2)', MV.enemyRosterFor(11).length === 2 && MV.enemyRosterFor(11).every(e => MV.ENEMY_RUNGS.COSMIC.includes(e)));
ok('rungLabel by win', MV.rungLabel(0).includes('Rogues') && MV.rungLabel(9) === 'Mastermind' && MV.rungLabel(11) === 'Cosmic Threat', [MV.rungLabel(0), MV.rungLabel(9), MV.rungLabel(11)]);
{ const reachable = new Set(); for (let w = 0; w <= 11; w++) for (const e of MV.enemyRosterFor(w)) reachable.add(e);
  ok('all 21 villains reachable across wins 0..11', reachable.size === 21, reachable.size); }
{ const rng = seededRng(5); let last = null, okAll = true;
  for (let w = 0; w <= 11; w++) { const e = MV.randomEnemy(w, rng, last); if (!MV.enemyRosterFor(w).includes(e) || e === last) okAll = false; last = e; }
  ok('randomEnemy: in-rung + no immediate repeat', okAll); }

// ───────────────────────── WIN-PARITY enemy generation ─────────────────────────
ok('enemyLoot budget = 1 bucket/win + treasure per milestone', (() => {
  const a = MV.enemyLoot(0), b = MV.enemyLoot(2), c = MV.enemyLoot(5), d = MV.enemyLoot(11);
  return a.buckets === 0 && a.treasures === 0 && b.buckets === 2 && b.treasures === 1 && c.buckets === 5 && c.treasures === 2 && d.buckets === 11 && d.treasures === 4;
})(), [MV.enemyLoot(11)]);
{ // at win 0 the enemy is just its 10-card base (no parity loot yet)
  const g = MV.generateEnemy(cardsById, 'Green Goblin', 0, seededRng(1));
  ok('generateEnemy(win 0): 10-card base, loot {0,0}', g.id === 'Green Goblin' && g.cls === 'warlock' && g.deck.length === 10 && g.loot.buckets === 0 && g.loot.treasures === 0, [g.deck.length, g.loot]); }
{ // at win 5 the enemy gains 5 buckets (×3) + 2 milestone treasures = 10 + 15 + 2 = 27
  const g = MV.generateEnemy(cardsById, 'Doctor Doom', 5, seededRng(2));
  ok('generateEnemy(win 5): base + 5 buckets + 2 treasures = 27 cards', g.deck.length === 10 + 15 + 2 && g.loot.buckets === 5 && g.loot.treasures === 2, [g.deck.length, g.loot]); }
{ // parity: the deck grows monotonically with wins, matching a player who loots one bucket per win
  const sizes = [0, 1, 2, 5, 8, 11].map(w => MV.generateEnemy(cardsById, 'Thanos', w, seededRng(7)).deck.length);
  ok('enemy deck size grows with wins (parity)', sizes.every((s, i) => i === 0 || s > sizes[i - 1]), sizes); }
ok('treasurePool = mvTreasure + shared DUELS treasures', MV.treasurePool(cardsById).length > 0
  && MV.treasurePool(cardsById).every(d => d.mvTreasure || (d.treasure && d.set === 'DUELS')));
// 20 Multiverse-specific treasures: neutral, NO rarity, uncollectible, mvTreasure:true, in the pool,
// but treasure:false so they never leak into the shared heist/tombs/duels pools.
{ const pool = MV.treasurePool(cardsById);
  const mvT = Object.values(cardsById).filter(d => d.mvTreasure && d.id.startsWith('mv_treasure_'));
  ok('20 MV treasures (neutral, no rarity, uncollectible)', mvT.length === 20
    && mvT.every(t => t.cardClass === 'neutral' && !t.rarity && t.collectible === false), [mvT.length, mvT.filter(t => t.rarity).map(t => t.id)]);
  ok('MV treasures are in the pool but treasure:false (no cross-mode leak)', mvT.every(t => pool.some(d => d.id === t.id) && t.treasure === false));
  ok('MV treasures have unique names, not shared with any other card', mvT.every(t => cardsById && Object.values(cardsById).filter(c => c.name === t.name).length === 1)); }
ok('NO spoilsChoices export (parity mode has no spoils draft)', MV.spoilsChoices === undefined);

// ───────────────────────── engine integration: install + fire all 32 powers ─────────────────────────
function bootWith(seatChar, oppChar = 'Spider-Man') {
  const picks = [MV.seatOf(seatChar), MV.seatOf(oppChar)];
  const st = E.createGame(cardsById, seededRng(3), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, picks);
  st.classPicks = picks;
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.mana = { cur: 10, max: 10, bonus: 0 }; }
  return st;
}
{ const st = bootWith('Iron Man', 'Thanos');
  ok('createGame installs BOTH seats’ hero powers', (st.players[0].heroPowers || []).length >= 1 && (st.players[1].heroPowers || []).length >= 1,
    [st.players[0].heroPowers?.length, st.players[1].heroPowers?.length]);
  ok('player 0 power name matches HERO_POWERS[Iron Man]', st.players[0].heroPowers.some(hp => hp.name === 'Repulsor Blast'));
  ok('player 1 power name matches Thanos', st.players[1].heroPowers.some(hp => hp.name === 'The Snap')); }

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
  const power = MV.HERO_POWERS[ch];
  const hp = st.players[0].heroPowers.find(h => h.name === power.name);
  ok(`${ch}: power '${power.name}' installed on hero (cost ${power.cost})`, !!hp && hp.power && hp.power.cost === power.cost, hp && hp.power && hp.power.cost);
  let threw = null;
  try { E.useHeroPower(st, 0, hp.uid, powerTarget(power, fr.uid, foe.uid), null); if (st.scryQueue && st.scryQueue.length) E.resolveScry(st, []); E.sweepDeaths(st); } catch (e) { threw = e; }
  ok(`${ch}: hero power '${power.name}' fires without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${ch}: state valid after firing '${power.name}'`, !v || v.length === 0, v);
}

// spot-check a few power EFFECTS actually happened
{ const st = bootWith('Mysterio'); const b0 = st.players[0].board.length;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Smoke and Mirrors');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Mysterio summons a 2/1 Illusion', st.players[0].board.length === b0 + 1 && st.players[0].board.some(c => c.tribe === 'Illusion'), st.players[0].board.map(c => c.tribe)); }
{ const st = bootWith('Captain Marvel'); st.players[0].life -= 5; const l0 = st.players[0].life;
  const hp = st.players[0].heroPowers.find(h => h.name === 'Binary Light');
  E.useHeroPower(st, 0, hp.uid, null, null);
  ok('Captain Marvel Binary Light gains 3 life', st.players[0].life === l0 + 3, [l0, st.players[0].life]); }
{ const st = bootWith('Galactus'); const f1 = put(st, 1, '_v'); const f2 = put(st, 1, '_v');
  const hp = st.players[0].heroPowers.find(h => h.name === 'World Hunger');
  E.useHeroPower(st, 0, hp.uid, null, null); E.sweepDeaths(st);
  ok('Galactus World Hunger damages all enemy creatures', st.players[1].board.every(c => (c.damage || 0) >= 2 || c.zone !== 'board'), st.players[1].board.map(c => c.damage)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
