// The owner's Combee line (2026-10-28; jokers/pokejokers_designs.js "LINE F9"; PORTING.md "The owner's Combee line"):
//   Combee 415 (Basic, Common $5, Grass)       Honey Gather: at end of round, the Jokers directly LEFT and RIGHT of it each gain
//                                              +$1 sell value (nothing on an empty side; a debuffed Combee does nothing).
//                                              Evolves after 5 rounds (every Combee: the female-only lore rule is not used).
//   Vespiquen 416 (Stage 1, Safari $8, Grass)  Honey Gather +$2; Attack Order: X(1 + 0.1 per $ of the two neighbours' current
//                                              sell value, card.sell_cost), max X3.
//   Energy: the per-$ `Xmult_mod` (+20% of base: 0.1 -> 0.12 / 0.14 / 0.16); the honey and the X3 cap are fixed; Combee carries the
//   field, so its Energy goes through evolution. Blueprint copies Attack Order's X, never the honey (no double feed).
// Every ability is FIRED through real rounds (won hands, the end-of-round pass, cash-out, shop) and real hands, with exact numbers.
//   node micatro/tests/mods/pokermon_combee_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, nextRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const LINE = ['combee', 'vespiquen'];
const sell = (j) => j.sell_cost;
const sells = (js) => js.map(sell).join();
/** Win the current round and pass through cash-out and the shop into the next round's blind select (the end-of-round pass fires). */
const round = () => { nextRound(); flush(); };
/** High Card of one 2 of Spades: 7 Chips, 1 Mult before the jokers. */
const high = () => { clearHand(); const t = play(hand(['S_2'])).total; flush(); return t; };
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
/** Give a joker an exact sell value (its extra_value on top of its own half-cost). */
function setSell(j, v) { j.ability.extra_value = 0; j.set_cost(); j.ability.extra_value = v - j.sell_cost; j.set_cost(); return j; }

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /combee|vespiquen/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Combee / Vespiquen (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('BEE0');
  const [c, v] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(c.rarity === 1 && c.cost === 5 && c.stage === 'Basic' && c.ptype === 'Grass' && c.gen === 4 && c.config.extra.honey === 1 && c.config.extra.rounds === 5 && !c.blueprint_compat,
    'Combee: Common $5, Basic, Grass, Gen 4, +$1 honey, 5 rounds, not Blueprint-compatible', [c.rarity, c.cost, c.stage, c.ptype, c.config.extra, c.blueprint_compat]);
  ok(v.rarity === 'poke_safari' && v.cost === 8 && v.stage === 'One' && v.ptype === 'Grass' && v.config.extra.honey === 2 && v.config.extra.Xmult_mod === 0.1 && v.config.extra.Xmult_cap === 3 && v.blueprint_compat,
    'Vespiquen: Safari $8, Stage 1, Grass, +$2 honey, X0.1 per $, max X3, Blueprint-compatible', [v.rarity, v.cost, v.stage, v.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_combee');
  ok(i > 0 && keys[i + 1] === 'j_poke_vespiquen' && keys.indexOf('j_poke_roserade') < i && keys.indexOf('j_poke_buizel') > i + 1,
    'Pokédex order: after Roserade (407), Combee, Vespiquen, before Buizel (418)', keys.slice(i - 1, i + 3));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(/combee.*vespiquen/.test(fam('combee')) && fam('combee') === fam('vespiquen') && poke_get_family_list('combee').length === 2, 'one family: Combee -> Vespiquen', fam('combee'));
  ok([[c, 18], [v, 20]].every(([x, px]) => x.atlas === 'poke_AtlasJokersBasicNatdex391' && x.pos.x === px && x.pos.y === 27),
    'art: upstream 3.9.1\'s own cells (Natdex 18,27 / 20,27: the Grass frame)', [c.atlas, c.pos, v.pos]);
  ok(pool_filter(c, 'Joker') === undefined && c.in_pool(c) !== false, 'Combee can be rolled in the shop (Common)');
  ok('Xmult_mod' in energy_values && !('honey' in energy_values) && !('Xmult_cap' in energy_values) && !('rounds' in energy_values),
    'Energy fields: Xmult_mod (the honey, the cap and the timer are not)');
});

// ------------------------------------------------------------------- Honey Gather: exactly the two neighbours, +$1 / +$2
sec('honey', () => {
  start('BEE1');
  const a = add('j_joker'), b = add('j_joker'), cb = add('j_poke_combee'), d = add('j_joker'), e = add('j_joker');
  ok(sells([a, b, cb, d, e]) === '1,1,2,1,1', 'start: Jokers sell for $1, Combee for $2', sells([a, b, cb, d, e]));
  round();
  ok(sells([a, b, cb, d, e]) === '1,2,2,2,1', 'one round: only the Jokers directly left and right gain +$1 (non-adjacent and Combee itself unchanged)', sells([a, b, cb, d, e]));
  round(); round();
  ok(sells([a, b, cb, d, e]) === '1,4,2,4,1', 'three rounds: +$3 each to the neighbours, nothing else', sells([a, b, cb, d, e]));

  start('BEE1V');
  const p = add('j_joker'), q = add('j_joker'), vq = add('j_poke_vespiquen'), r = add('j_joker'), s = add('j_joker');
  round();
  ok(sells([p, q, vq, r, s]) === '1,3,4,3,1', 'Vespiquen: its two neighbours gain exactly +$2, the rest nothing', sells([p, q, vq, r, s]));
  round();
  ok(sells([p, q, vq, r, s]) === '1,5,4,5,1', 'a second round: +$2 more', sells([p, q, vq, r, s]));
  // the money actually lands: selling a honeyed Joker pays its new value
  const before = G.GAME.dollars;
  act({ type: 'sell', id: q.sort_id }); flush();
  ok(G.GAME.dollars === before + 5, 'selling a honeyed neighbour pays its $5', [before, G.GAME.dollars]);
});
sec('edges', () => {
  start('BEE2L');
  const cb = add('j_poke_combee'), a = add('j_joker'), b = add('j_joker');
  round();
  ok(sells([cb, a, b]) === '2,2,1', 'leftmost Combee: only the Joker on its right gains (+$1); no left neighbour, nothing there', sells([cb, a, b]));
  start('BEE2R');
  const x = add('j_joker'), y = add('j_joker'), vq = add('j_poke_vespiquen');
  round();
  ok(sells([x, y, vq]) === '1,3,4', 'rightmost Vespiquen: only the Joker on its left gains (+$2)', sells([x, y, vq]));
  start('BEE2A');
  const solo = add('j_poke_combee');
  round();
  ok(sell(solo) === 2, 'a Combee alone: no neighbour, nothing changes (not even itself)', sell(solo));
});
sec('debuffed', () => {
  start('BEE3');
  const a = add('j_joker'), cb = add('j_poke_combee'), b = add('j_joker');
  debuff(cb);
  round();
  ok(sells([a, cb, b]) === '1,2,1', 'a debuffed Combee gives no honey', sells([a, cb, b]));
  ok(ex(cb).rounds === 5, '... and its evolution timer doesn\'t tick', ex(cb).rounds);
  start('BEE3V');
  const p = add('j_joker'), vq = add('j_poke_vespiquen'), q = add('j_joker');
  debuff(vq);
  round();
  ok(sells([p, vq, q]) === '1,4,1', 'a debuffed Vespiquen gives no honey', sells([p, vq, q]));
  // a debuffed NEIGHBOUR still takes the honey (sell value isn't an ability)
  start('BEE3N');
  const m = add('j_joker'), cb2 = add('j_poke_combee'), n = add('j_joker');
  debuff(m);
  round();
  ok(sells([m, cb2, n]) === '2,2,2', 'a debuffed neighbour still gains its +$1', sells([m, cb2, n]));
});
sec('reorder', () => {
  start('BEE4');
  const a = add('j_joker'), b = add('j_joker'), cb = add('j_poke_combee'), d = add('j_joker');
  round();
  ok(sells([a, b, cb, d]) === '1,2,2,2', 'order A B Combee D: B and D gain', sells([a, b, cb, d]));
  act({ type: 'reorder', area: 'jokers', ids: [b, cb, a, d].map((j) => j.sort_id) }); flush();
  ok(G.jokers.cards.map((j) => j.sort_id).join() === [b, cb, a, d].map((j) => j.sort_id).join(), 'the row is now B Combee A D (a real reorder)');
  round();
  ok(sells([a, b, cb, d]) === '2,3,2,2', 'after the reorder: B and A gain, D (no longer adjacent) doesn\'t', sells([a, b, cb, d]));
});

// ------------------------------------------------------------------- Attack Order: X from the neighbours' sell value, max X3
sec('attack order', () => {
  start('BEE5');
  const vq = add('j_poke_vespiquen');
  ok(/Currently \{C:money\}\$0\{C:inactive\}: \{X:mult,C:white\} X1 /.test(lines(vq)), 'alone (the shop card): (Currently $0: X1 Mult)', lines(vq));
  ok(near(high().mult, 1), 'no neighbours: X1');
  const l = add('j_egg'); // Egg: no scoring effect; cost 4 -> sells for $2 ... until its own end-of-round +$3
  act({ type: 'reorder', area: 'jokers', ids: [l, vq].map((j) => j.sort_id) }); flush();
  setSell(l, 4);
  ok(near(high().mult, 1.4), 'one neighbour worth $4: X1.4', high().mult);
  const r = add('j_egg'); setSell(r, 6);
  ok(near(high().mult, 2), 'neighbours worth $4 + $6: X2', high().mult);
  ok(/Currently \{C:money\}\$10\{C:inactive\}: \{X:mult,C:white\} X2 /.test(lines(vq)), 'the tooltip: (Currently $10: X2 Mult)', lines(vq));
  const far = add('j_egg'); setSell(far, 30);
  ok(near(high().mult, 2), 'a $30 Joker further along the row doesn\'t count: still X2', high().mult);
  setSell(r, 16);
  ok(near(high().mult, 3), 'neighbours worth $20: X3 exactly', high().mult);
  setSell(r, 40);
  const t = high();
  ok(near(t.mult, 3), 'neighbours worth $44: capped at X3', t);
  ok(/Max \{X:mult,C:white\} X3 /.test(lines(vq)) && /Currently \{C:money\}\$44\{C:inactive\}: \{X:mult,C:white\} X3 /.test(lines(vq)), 'the tooltip shows the cap and (Currently $44: X3)', lines(vq));

  // the honey feeds the X: a round later the same neighbours are worth $2 more each
  start('BEE5R');
  const a = add('j_joker'), v2 = add('j_poke_vespiquen'), b = add('j_joker');
  const t1 = high();
  ok(near(t1.mult, (1 + 4) * 1.2 + 4), 'Joker, Vespiquen, Joker ($1 + $1): (1 + 4) x 1.2 + 4 = 10', t1);
  round(); round();
  ok(sells([a, b]) === '5,5', 'two rounds of honey: both neighbours $5', sells([a, b]));
  const t2 = high();
  ok(near(t2.mult, (1 + 4) * 2 + 4), 'Attack Order now X2 ($10): (1 + 4) x 2 + 4 = 14', t2);
});

// ------------------------------------------------------------------- evolution after 5 rounds; Energy carried
sec('evolution', () => {
  start('BEEEVO');
  const cb = add('j_poke_combee'), a = add('j_joker');
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test(lines(cb)), 'Combee\'s footer: (Evolves after 5 rounds)', lines(cb));
  increment_energy(cb, 'Grass');
  ok(ex(cb).energy_count === 1 && near(ex(cb).Xmult_mod, 0.12) && ex(cb).honey === 1, '1 Grass Energy on Combee: its stored per-$ X0.12, the honey still $1', ex(cb));
  for (let r = 1; r <= 4; r++) round();
  ok(key(cb) === 'j_poke_combee' && ex(cb).rounds === 1 && sell(a) === 5, 'after 4 rounds: still Combee (1 round left), the Joker +$4', [key(cb), ex(cb).rounds, sell(a)]);
  round();
  ok(key(cb) === 'j_poke_vespiquen', 'after the 5th round: Vespiquen', key(cb));
  ok(sell(a) === 6, 'the 5th round\'s honey was still Combee\'s +$1 ($6)', sell(a));
  ok(ex(cb).honey === 2 && near(ex(cb).Xmult_mod, 0.12) && ex(cb).energy_count === 1 && ex(cb).Xmult_cap === 3, 'Energy carried: X0.12 per $, honey +$2, cap X3', ex(cb));
  const t = high();
  ok(near(t.mult, (1 + 0.12 * 6) + 4), 'energized Vespiquen next to a $6 Joker: X1.72, then the Joker\'s +4', t);
  round();
  ok(sell(a) === 8, 'now +$2 a round ($8)', sell(a));
});

// ------------------------------------------------------------------- Energy: +20% of the base per-$ X; the cap and the honey fixed
sec('energy', () => {
  start('BEEEN');
  const l = add('j_egg'), vq = add('j_poke_vespiquen');
  setSell(l, 10);
  increment_energy(vq, 'Grass');
  ok(near(ex(vq).Xmult_mod, 0.12) && ex(vq).honey === 2 && ex(vq).Xmult_cap === 3, '1 Grass Energy: X0.12 per $, honey and cap fixed', ex(vq));
  ok(near(high().mult, 2.2), '$10 of neighbours: X2.2', high().mult);
  increment_energy(vq, 'Grass'); increment_energy(vq, 'Grass');
  ok(near(ex(vq).Xmult_mod, 0.16) && ex(vq).energy_count === 3 && ex(vq).honey === 2 && ex(vq).Xmult_cap === 3, '3 Grass Energy: X0.16 per $ (0.1 -> 0.12 / 0.14 / 0.16); honey $2, cap X3', ex(vq));
  ok(near(high().mult, 2.6), '$10 of neighbours: X2.6', high().mult);
  ok(/X0\.16 \{\} for each/.test(lines(vq)) && /X2\.6 /.test(lines(vq)), 'the tooltip shows X0.16 and the current X2.6', lines(vq));
  setSell(l, 15);
  ok(near(high().mult, 3), '$15 of neighbours (X3.4 uncapped): still capped at X3', high().mult);
  start('BEEEN2');
  const v2 = add('j_poke_vespiquen');
  increment_energy(v2, 'Colorless');
  ok(near(ex(v2).Xmult_mod, 0.11) && ex(v2).c_energy_count === 1, 'a Colorless Energy: half strength, X0.11 per $', ex(v2));
  // a real Grass Energy card used on Combee (leftmost): it is energizable (its stored Xmult_mod), and its honey doesn't change
  start('BEEEN3');
  const cb = add('j_poke_combee'), j2 = add('j_joker');
  const en = add('c_poke_grass_energy');
  act({ type: 'use', id: en.sort_id }); flush();
  ok(ex(cb).energy_count === 1 && near(ex(cb).Xmult_mod, 0.12) && ex(cb).honey === 1, 'a Grass Energy card used: Combee energized (X0.12 stored for Vespiquen), honey still +$1', ex(cb));
  round();
  ok(sell(j2) === 2, 'an energized Combee still gives exactly +$1', sell(j2));
});

// ------------------------------------------------------------------- Blueprint: copies the X, never the honey
sec('blueprint', () => {
  start('BEEBP');
  const bp = add('j_blueprint'), vq = add('j_poke_vespiquen'), j = add('j_joker');
  ok(sells([bp, vq, j]) === '5,4,1', 'Blueprint $5, Vespiquen $4, Joker $1', sells([bp, vq, j]));
  const t = high();
  ok(t.chips === 7 && near(t.mult, 1 * 1.6 * 1.6 + 4), 'Blueprint copies Attack Order (X1.6 from Vespiquen\'s $5 + $1 neighbours) twice, then the Joker\'s +4', t);
  round();
  ok(sells([bp, vq, j]) === '7,4,3', 'one round: each neighbour +$2 once (Blueprint\'s copy feeds nothing more)', sells([bp, vq, j]));
  start('BEEBP2');
  const bp2 = add('j_blueprint'), cb = add('j_poke_combee'), k = add('j_joker');
  round();
  ok(sells([bp2, cb, k]) === '6,2,2', 'Blueprint next to Combee: +$1 once each (Combee isn\'t Blueprint-compatible)', sells([bp2, cb, k]));
});

// ------------------------------------------------------------------- vanilla untouched
sec('vanilla', () => {
  start('BEEVAN');
  const a = add('j_joker'), b = add('j_joker');
  round();
  ok(sells([a, b]) === '1,1', 'without the line, sell values don\'t grow', sells([a, b]));
  ok(near(high().mult, 9), 'and two Jokers score +8 as before');
});

done();
