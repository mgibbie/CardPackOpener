// The owner's Chatot and Pachirisu (2026-10-28; jokers/pokejokers_designs.js; PORTING.md "The owner's Chatot + Pachirisu"):
//   Chatot 441 (Basic, single-stage, Rare $7, Colorless)
//     Vocabulary: +4 Mult for each DIFFERENT poker hand type played this run (G.GAME.hands[h].played > 0: the run's own records,
//     so hands played before Chatot was bought count; secret hands too).
//     New Word: the first time each poker hand type is played this run, while Chatot is held, create that hand's Planet (with
//     consumable room). Tracked per joker (`new_words`): never twice for a type; a hand first played without Chatot never grants.
//   Pachirisu 417 (Basic, single-stage, Rare $7, Lightning)
//     Quick Spark: the first hand of each round gives X2 Mult; Nuzzle: plus X0.25 for each OTHER Lightning Joker (is_type: a Tera
//     sticker counts; a debuffed joker doesn't).
//     Cheek Pouch: at end of round, earn $1 for each Lightning Joker, itself included (calc_dollar_bonus: a cash-out row).
//   Energy: Chatot's per-hand `mult` (+40% of base), Pachirisu's `Xmult` and `Xmult_mod` (+20% each); the Planets and the $ are fixed.
//   Blueprint: copies Chatot's Mult (not New Word) and Pachirisu's first-hand X Mult (not the Cheek Pouch).
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_chatot_pachirisu_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, nextRound, winRound, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const planets = () => G.consumeables.cards.map((c) => c.config.center.key);

/** A joker with no scoring effect of its own (Egg) given a Tera sticker: a pure "count". */
function tera(type) { const e = add('j_egg'); apply_type_sticker(e, type); return e; }
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
/** Play these cards (the hand emptied first); -> the hand total, the queue settled. */
const playK = (keys) => { clearHand(); const t = play(hand(keys)).total; flush(); return t; };
const HIGH = ['S_2'];                                     // High Card: 7 Chips, 1 Mult
const PAIR = ['S_3', 'H_3'];                              // Pair: 16 Chips, 2 Mult
const TWO_PAIR = ['S_3', 'H_3', 'S_4', 'H_4'];            // Two Pair: 2 Mult
const FLUSH = ['H_2', 'H_5', 'H_7', 'H_9', 'H_J'];        // Flush: 4 Mult
const STRAIGHT = ['S_4', 'H_5', 'D_6', 'C_7', 'S_8'];     // Straight: 4 Mult
const FIVE = ['S_A', 'H_A', 'D_A', 'C_A', 'S_A'];         // Five of a Kind (secret): 12 Mult
const played = () => Object.values(G.GAME.hands).filter((h) => h.played > 0).length;

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ['chatot', 'pachirisu']) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /chatot|pachirisu/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Chatot / Pachirisu (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('CHPA0');
  const c = P_CENTERS.j_poke_chatot, p = P_CENTERS.j_poke_pachirisu;
  ok(c.rarity === 3 && c.cost === 7 && c.stage === 'Basic' && c.ptype === 'Colorless' && c.gen === 4 && c.config.extra.mult === 4 && !c.config.extra.rounds,
    'Chatot: Rare $7, Basic (single-stage), Colorless, Gen 4, +4 Mult per hand type', [c.rarity, c.cost, c.stage, c.ptype, c.config.extra]);
  ok(p.rarity === 3 && p.cost === 7 && p.stage === 'Basic' && p.ptype === 'Lightning' && p.gen === 4
    && p.config.extra.Xmult === 2 && p.config.extra.Xmult_mod === 0.25 && p.config.extra.pouch === 1,
    'Pachirisu: Rare $7, Basic (single-stage), Lightning, Gen 4, X2 + X0.25 per other Lightning, $1 per Lightning', [p.rarity, p.cost, p.stage, p.ptype, p.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_chatot'), k = keys.indexOf('j_poke_pachirisu');
  ok(i > 0 && keys[i - 1] === 'j_poke_happiny' && keys[i + 1] === 'j_poke_spiritomb', 'Pokédex order: Happiny (440), Chatot (441), Spiritomb (442)', keys.slice(i - 1, i + 2));
  ok(k > 0 && keys[k - 1] === 'j_poke_vespiquen' && keys[k + 1] === 'j_poke_buizel', 'Pokédex order: Vespiquen (416, the owner\'s Combee line), Pachirisu (417), Buizel (418)', keys.slice(k - 1, k + 2));
  ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === 10 && c.pos.y === 29, 'Chatot art: upstream 3.9.1\'s own cell (Natdex 10,29)', [c.atlas, c.pos]);
  ok(p.atlas === 'poke_AtlasJokersBasicNatdex391' && p.pos.x === 22 && p.pos.y === 27, 'Pachirisu art: upstream 3.9.1\'s own cell (Natdex 22,27)', [p.atlas, p.pos]);
  ok(pool_filter(c, 'Joker') === undefined && c.in_pool(c) !== false && pool_filter(p, 'Joker') === undefined && p.in_pool(p) !== false, 'both can be rolled in the shop (Rare)');
  ok(!('pouch' in energy_values) && 'mult' in energy_values && 'Xmult' in energy_values && 'Xmult_mod' in energy_values, 'Energy fields: mult / Xmult / Xmult_mod (the $ pouch is not one)');
});

// ------------------------------------------------------------------- Vocabulary: the run's played hands, from before Chatot was bought
sec('vocabulary', () => {
  start('CHPA1');
  playK(HIGH); playK(PAIR); playK(TWO_PAIR);
  ok(played() === 3, 'three hand types played before Chatot (High Card, Pair, Two Pair)', played());
  nextRound(); flush(); // a new round: the run's count is kept (played_this_round resets, played does not)
  const c = add('j_poke_chatot');
  ok(/Currently \{C:attention\}3\{C:inactive\}: \{C:mult\}\+12\{/.test(lines(c)), 'a late Chatot sees the whole run: (Currently 3: +12 Mult)', lines(c));
  let t = playK(PAIR);
  ok(t.chips === 16 && near(t.mult, 2 + 12) && planets().length === 0, 'a Pair (already played): +12 Mult, no Planet', [t, planets()]);
  t = playK(FLUSH);
  ok(near(t.mult, 4 + 16), 'a first Flush: 4 types now, +16 Mult (the hand being played counts at once)', t);
  ok(planets().join() === 'c_jupiter', 'New Word: the first Flush of the run created Jupiter', planets());
  t = playK(HIGH);
  ok(near(t.mult, 1 + 16) && planets().length === 1, 'High Card again: +16, no new Planet', [t, planets()]);
  G.consumeables.cards.slice().forEach((x) => x.remove()); flush();
  t = playK(FIVE);
  ok(near(t.mult, 12 + 20) && planets().join() === 'c_planet_x', 'a secret hand counts: Five of a Kind, 5 types (+20), Planet X', [t, planets()]);
  ok(/Currently \{C:attention\}5\{C:inactive\}: \{C:mult\}\+20\{/.test(lines(c)), 'the tooltip follows: (Currently 5: +20 Mult)', lines(c));
  ok(/Vocabulary:\{\} \{C:mult\}\+4\{\} Mult for each/.test(lines(c)) && /New Word:/.test(lines(c)) && /Must have room/.test(lines(c)), 'the text: Vocabulary / New Word', lines(c));

  start('CHPA1B');
  const c2 = add('j_poke_chatot');
  ok(/Currently \{C:attention\}0\{C:inactive\}: \{C:mult\}\+0\{/.test(lines(c2)), 'a new run: (Currently 0: +0 Mult)', lines(c2));
  t = playK(HIGH);
  ok(near(t.mult, 1 + 4) && planets().join() === 'c_pluto', 'the run\'s first hand: +4 Mult and Pluto', [t, planets()]);
});

// ------------------------------------------------------------------- New Word: once per type, only while held, only with room
sec('new word', () => {
  start('CHPA2');
  const c = add('j_poke_chatot');
  playK(FLUSH);
  ok(planets().join() === 'c_jupiter', 'first Flush: Jupiter', planets());
  playK(FLUSH);
  ok(planets().join() === 'c_jupiter', 'a second Flush: nothing more', planets());
  ok(ex(c).new_words && ex(c).new_words.Flush === true, 'the joker records the type it granted (new_words)', ex(c).new_words);
  c.sell_card(); flush();
  ok(!G.jokers.cards.includes(c), 'Chatot sold');
  G.consumeables.cards.slice().forEach((x) => x.remove()); flush();
  playK(STRAIGHT); // played with no Chatot held
  ok(planets().length === 0, 'a Straight first played while no Chatot is held: no Planet', planets());
  const c2 = add('j_poke_chatot');
  playK(FLUSH); playK(STRAIGHT);
  ok(planets().length === 0, 'a re-bought Chatot never grants for types already played (Flush, Straight)', planets());
  playK(PAIR);
  ok(planets().join() === 'c_mercury', '... but grants for a new one (Pair: Mercury)', planets());
  ok(Object.keys(ex(c2).new_words).join() === 'Pair', 'its own record: Pair only', ex(c2).new_words);

  // room: two consumable slots full -> a first-time hand grants nothing, and never later
  start('CHPA2R');
  add('j_poke_chatot');
  add('c_pluto'); add('c_mercury');
  ok(planets().length === 2 && G.consumeables.config.card_limit === 2, 'consumables full (2 / 2)', planets());
  let t = playK(FLUSH);
  ok(planets().length === 2 && near(t.mult, 4 + 4), 'a first Flush with no room: no Planet (still +4 Mult)', [planets(), t]);
  G.consumeables.cards.slice().forEach((x) => x.remove()); flush();
  playK(FLUSH);
  ok(planets().length === 0, 'room again: the Flush is no longer a first play, no Planet', planets());
  add('c_pluto');
  playK(PAIR);
  ok(planets().join() === 'c_pluto,c_mercury', 'one slot free: a first Pair fills it (Mercury)', planets());

  // two Chatots: each grants its own
  start('CHPA2T');
  add('j_poke_chatot'); add('j_poke_chatot');
  t = playK(PAIR);
  ok(planets().join() === 'c_mercury,c_mercury' && near(t.mult, 2 + 4 + 4), 'two Chatots: two Mercuries (one each), +4 Mult each', [planets(), t]);

  // a debuffed Chatot does nothing
  start('CHPA2D');
  debuff(add('j_poke_chatot'));
  t = playK(PAIR);
  ok(planets().length === 0 && near(t.mult, 2), 'a debuffed Chatot: no Mult, no Planet', [planets(), t]);
});

// ------------------------------------------------------------------- Quick Spark: X2 only on the round's first hand
sec('quick spark', () => {
  start('CHPA3');
  const p = add('j_poke_pachirisu');
  ok(/Currently \{X:mult,C:white\} X2 \{C:inactive\}, Active!\)/.test(lines(p)), 'tooltip: (Currently X2, Active!)', lines(p));
  let t = playK(HIGH);
  ok(t.chips === 7 && near(t.mult, 2), 'the first hand of the round: X2 Mult', t);
  ok(/Used this round/.test(lines(p)), 'tooltip after it: Used this round', lines(p));
  t = playK(HIGH);
  ok(near(t.mult, 1), 'the second hand: nothing', t);
  t = playK(PAIR);
  ok(near(t.mult, 2), 'the third hand: nothing', t);
  nextRound(); flush();
  ok(/Active!/.test(lines(p)), 'a new round: Active! again', lines(p));
  t = playK(PAIR);
  ok(near(t.mult, 4), 'the next round\'s first hand: X2 again (Pair 2 -> 4)', t);
  // a discard first does not use it up (it is the first HAND)
  nextRound(); flush();
  clearHand(); act({ type: 'highlight', ids: hand(['S_9']).map((c) => c.sort_id) }); act({ type: 'discard' }); flush();
  t = playK(HIGH);
  ok(near(t.mult, 2), 'a discard before the first hand: the first hand still X2', t);
});

// ------------------------------------------------------------------- Nuzzle: +X0.25 for each OTHER Lightning Joker, debuffed not counted
sec('nuzzle', () => {
  const xs = [];
  for (let n = 0; n <= 3; n++) {
    start('CHPA4_' + n);
    add('j_poke_pachirisu');
    if (n >= 1) add('j_poke_magnemite'); // a real Lightning joker (played Steel cards only: none here)
    for (let i = 1; i < n; i++) tera('Lightning');
    xs.push(playK(HIGH).mult);
  }
  ok(xs.join() === '2,2.25,2.5,2.75', 'with 0 / 1 / 2 / 3 other Lightning jokers: X2 / X2.25 / X2.5 / X2.75', xs);
  start('CHPA4D');
  const p = add('j_poke_pachirisu');
  add('j_poke_magnemite'); debuff(tera('Lightning')); debuff(add('j_poke_pikachu'));
  add('j_poke_charmander'); tera('Fire'); add('j_egg');
  ok(/Currently \{X:mult,C:white\} X2\.25 /.test(lines(p)), 'tooltip: X2.25 (one undebuffed other Lightning)', lines(p));
  const t = playK(HIGH);
  ok(near(t.mult, 2.25), 'two debuffed Lightning jokers, a Fire joker, a Fire-Tera Egg and a plain Egg don\'t count: X2.25', t);
  start('CHPA4T');
  add('j_poke_pachirisu'); const m = add('j_poke_magnemite'); apply_type_sticker(m, 'Fire');
  ok(near(playK(HIGH).mult, 2), 'a Lightning joker with a Fire Tera sticker is no longer Lightning: X2');
  start('CHPA4B');
  add('j_poke_pachirisu'); add('j_poke_pachirisu');
  ok(near(playK(HIGH).mult, 2.25 * 2.25), 'two Pachirisus: each counts the other (X2.25 each)');
});

// ------------------------------------------------------------------- Cheek Pouch: $1 per Lightning Joker at end of round
const pouchRows = () => (G.GAME.round_eval.rows || []).filter((r) => r.center === 'j_poke_pachirisu');
sec('cheek pouch', () => {
  start('CHPA5');
  const p = add('j_poke_pachirisu');
  ok(/Currently \{C:money\}\$1\{/.test(lines(p)), 'tooltip alone: (Currently $1)', lines(p));
  winRound(); flush();
  ok(G.STATE === STATES.ROUND_EVAL && pouchRows().length === 1 && pouchRows()[0].dollars === 1, 'alone: a $1 cash-out row (itself included)', G.GAME.round_eval.rows);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  add('j_poke_magnemite'); tera('Lightning'); debuff(tera('Lightning')); add('j_poke_charmander');
  ok(/Currently \{C:money\}\$3\{/.test(lines(p)), 'tooltip: (Currently $3)', lines(p));
  const before = G.GAME.dollars;
  winRound(); flush();
  ok(pouchRows().length === 1 && pouchRows()[0].dollars === 3, 'with Magnemite + a Lightning-Tera Egg (+ a debuffed one, a Fire joker): $3', pouchRows());
  const total = G.GAME.round_eval.total;
  act({ type: 'cash_out' }); flush();
  ok(G.GAME.dollars === before + total, 'the cash-out pays the row', [before, total, G.GAME.dollars]);
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  debuff(p);
  winRound(); flush();
  ok(pouchRows().length === 0, 'a debuffed Pachirisu pays nothing', pouchRows());
});

// ------------------------------------------------------------------- Energy
sec('energy', () => {
  start('CHPA6');
  const c = add('j_poke_chatot');
  increment_energy(c, 'Colorless');
  ok(ex(c).energy_count === 1 && near(ex(c).mult, 5.6), '1 Colorless Energy: Chatot +5.6 per hand type (4 x 1.4)', ex(c));
  increment_energy(c, 'Colorless'); increment_energy(c, 'Colorless');
  ok(near(ex(c).mult, 8.8), '3 Energy: +8.8 per hand type', ex(c));
  playK(HIGH);
  const t = playK(PAIR);
  ok(near(t.mult, 2 + 17.6) && planets().join() === 'c_pluto,c_mercury', 'energized: 2 types -> +17.6 Mult; the Planets unchanged (one each)', [t, planets()]);
  ok(/\+8\.8\{\} Mult for each/.test(lines(c)) && /\+17\.6\{/.test(lines(c)), 'the tooltip shows +8.8 and +17.6', lines(c));

  start('CHPA6P');
  const p = add('j_poke_pachirisu'); add('j_poke_magnemite'); tera('Lightning');
  increment_energy(p, 'Lightning');
  ok(near(ex(p).Xmult, 2.4) && near(ex(p).Xmult_mod, 0.3) && ex(p).pouch === 1, '1 Lightning Energy: X2.4, X0.3 per other; the $1 fixed', ex(p));
  increment_energy(p, 'Lightning'); increment_energy(p, 'Lightning');
  ok(near(ex(p).Xmult, 3.2) && near(ex(p).Xmult_mod, 0.4) && ex(p).pouch === 1, '3 Energy: X3.2, X0.4 per other; still $1', ex(p));
  ok(/Currently \{X:mult,C:white\} X4 /.test(lines(p)), 'tooltip: X4 (3.2 + 2 x 0.4)', lines(p));
  ok(near(playK(HIGH).mult, 4), 'energized first hand with 2 other Lightning jokers: X4');
  winRound(); flush();
  ok(pouchRows().length === 1 && pouchRows()[0].dollars === 3, 'the Cheek Pouch is still $1 each: $3', pouchRows());
});

// ------------------------------------------------------------------- Blueprint
sec('blueprint', () => {
  start('CHPA7');
  add('j_blueprint'); add('j_poke_chatot');
  const t = playK(PAIR);
  ok(near(t.mult, 2 + 4 + 4) && planets().join() === 'c_mercury', 'Blueprint copies Vocabulary (+4 twice) but not New Word (one Mercury)', [t, planets()]);
  start('CHPA7P');
  add('j_blueprint'); add('j_poke_pachirisu');
  let u = playK(HIGH);
  ok(near(u.mult, 4), 'Blueprint copies Quick Spark on the first hand (X2 twice; Blueprint is no Lightning joker)', u);
  u = playK(HIGH);
  ok(near(u.mult, 1), '... and nothing on the second hand', u);
  winRound(); flush();
  const rows = (G.GAME.round_eval.rows || []).filter((r) => /^joker/.test(r.name));
  ok(rows.length === 1 && rows[0].center === 'j_poke_pachirisu' && rows[0].dollars === 1, 'the Cheek Pouch is not copied (one $1 row, Pachirisu\'s)', rows);
});

// ------------------------------------------------------------------- vanilla untouched
sec('vanilla', () => {
  start('CHPAVAN');
  add('j_joker');
  playK(FLUSH);
  const t = playK(HIGH);
  ok(t.chips === 7 && near(t.mult, 5) && planets().length === 0, 'a run without them plays as before', [t, planets()]);
});

done();
