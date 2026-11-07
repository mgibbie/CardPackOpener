// Gen 5, batch 3 (the owner's "Build batch 3", 2026-10-29; jokers/pokejokers_designs.js "Gen 5, batch 3"; PORTING.md "Gen 5, batch 3"):
// 30 jokers, #580-637, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7):
//   Ducklett 580 -> Swanna (Water)             +40 Chips / X2 if the hand contains a Flush. 5 rounds.
//   Deerling 585 -> Sawsbuck (Grass)           Seasons (by Ante: Spring Hearts, Summer Diamonds, Autumn Clubs, Winter Spades): scored cards of the
//                                              season's suit +3 Mult / X1.2; a 3.9.1 card per season. 5 rounds.
//   Emolga 587 (Lightning, R $7)               Static: scored face cards $1 and +2 Mult.
//   Karrablast 588 + Shelmet 616 (Grass)       +6 Mult / +40 Chips; they evolve ONLY together, after 4 rounds held together: Escavalier (X1.5;
//                                              held Steel X1.75 instead of X1.5) and Accelgor (+1 hand, +1 discard, +4 Mult per hand left).
//   Foongus 590 -> Amoonguss (Grass)           1 in 4 at the end of the shop, a Poke Ball (room); Spore: the Boss Blind is off during the round's
//                                              first hand (blind.js Blind.suspend), back after it. 5 rounds.
//   Alomomola 594 (Water, R $7)                Healing Heart: the round's first destroyed playing card is copied back into the deck.
//   Joltik 595 -> Galvantula (Lightning)       +3 Mult per other Lightning Joker; Electroweb: held Gold cards X1.2. 5 rounds.
//   Tynamo 602 -> Eelektrik -> Eelektross      +1 Mult per Steel in the deck; +3 Mult per Steel held; X1.5 + X0.1 per Steel in the deck.
//   Cubchoo 613 -> Beartic (Water)             scored Glass +20 Chips; Freeze: at end of round the leftmost held card stays in hand into the next
//                                              round (run.js keep_in_hand), X1.5 held while frozen, thaws when played / discarded. 5 rounds.
//   Stunfisk 618 (Lightning, R $7)             each discard $1, at most $4 a round.
//   Mienfoo 619 -> Mienshao (Fighting)         the highest / top 2 ranked scored cards retrigger. 5 rounds.
//   Druddigon 621 (Dragon, R $7)               scored Kings X1.4.
//   Bouffalant 626 (Colorless, R $7)           Head Charge: X0.5 banked per Blind beaten with the first hand, max X4.
//   Rufflet 627 -> Braviary (Colorless)        +10 Mult / X2 during Boss Blinds. 5 rounds.
//   Heatmor 631 (Fire) + Durant 632 (Metal)    +4 Mult per discard used; held Steel X1.75 instead of X1.5; together Heatmor banks X0.1 a round.
//   Larvesta 636 -> Volcarona (Fire)           +5 Mult, doubled while sunny; Volcarona: always sunny (Cherrim, Castform, Larvesta), each Fire
//                                              Joker X1.25. 5 rounds.
// Every ability is FIRED through real hands / discards / rounds / shops with exact numbers.
//   node micatro/tests/mods/pokermon_gen5_batch3_test.mjs
import fs from 'fs';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state, STATES } from './poke_helpers.mjs';
import { create_card } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker } from '../../mods/pokermon/api.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import * as DES from '../../mods/pokermon/jokers/pokejokers_designs.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  ducklett: ['ducklett', 'swanna'], deerling: ['deerling', 'sawsbuck'], emolga: ['emolga'], karrablast: ['karrablast', 'escavalier'],
  foongus: ['foongus', 'amoonguss'], alomomola: ['alomomola'], joltik: ['joltik', 'galvantula'], tynamo: ['tynamo', 'eelektrik', 'eelektross'],
  cubchoo: ['cubchoo', 'beartic'], shelmet: ['shelmet', 'accelgor'], stunfisk: ['stunfisk'], mienfoo: ['mienfoo', 'mienshao'],
  druddigon: ['druddigon'], bouffalant: ['bouffalant'], rufflet: ['rufflet', 'braviary'], heatmor: ['heatmor'], durant: ['durant'],
  larvesta: ['larvesta', 'volcarona'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (in that order: the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (with `held` left in hand); the round never ends by accident unless `win`. */
function play(list, { held = [], clear = true, win = false } = {}) {
  if (clear) clearHand();
  const cs = cards(list);
  const hs = cards(held);
  G.GAME.chips = 0;
  if (win) G.GAME.chips = G.GAME.blind.chips;
  else if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, held: hs, events, total, mult: Number(total.mult), chips: Number(total.chips), score: Number(total.total) };
}
/** Discard exactly these hand cards (a player discard). */
function discard(cs) {
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  return r;
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** To the next Blind through the cash-out and the shop, keeping the hand (a frozen card stays): the real deal. */
function nextBlind(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
function use(k, targets) {
  const c = add(k);
  const r = act({ type: 'use', id: c.sort_id, targets: (targets || []).map((x) => x.sort_id) });
  flush();
  return r;
}
function sell(j) { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; }
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j, shiny) => { const f = face(j, shiny); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const cardId = (c) => c.base.suit + c.base.id + ':' + key(c);
/** A Blind with a chosen boss: select it as the Small Blind (blind.boss is the boss's own flag), through the real first deal. */
function bossRound(seed, boss, jokers = []) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  G.GAME.round_resets.blind_choices.Small = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 55 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 55+ (Gen 5 batch 3)', PINS.modPin('pokermon'));
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 30 (nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G5B3S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, sheet, x, y]
  const WANT = {
    ducklett: [1, 5, 'Basic', 'Water', 5, 'Natdex', 18, 38], swanna: [S, 8, 'One', 'Water', undefined, 'Natdex', 20, 38],
    deerling: [1, 5, 'Basic', 'Grass', 5, 'Gen05', 2, 1], sawsbuck: [S, 8, 'One', 'Grass', undefined, 'Gen05', 10, 1],
    emolga: [3, 7, 'Basic', 'Lightning', undefined, 'Natdex', 2, 39],
    karrablast: [1, 5, 'Basic', 'Grass', undefined, 'Natdex', 4, 39], escavalier: [S, 8, 'One', 'Grass', undefined, 'Natdex', 6, 39],
    foongus: [1, 5, 'Basic', 'Grass', 5, 'Natdex', 8, 39], amoonguss: [S, 8, 'One', 'Grass', undefined, 'Natdex', 10, 39],
    alomomola: [3, 7, 'Basic', 'Water', undefined, 'Natdex', 16, 39],
    joltik: [1, 5, 'Basic', 'Lightning', 5, 'Natdex', 18, 39], galvantula: [S, 8, 'One', 'Lightning', undefined, 'Natdex', 20, 39],
    tynamo: [2, 6, 'Basic', 'Lightning', 5, 'Natdex', 2, 40], eelektrik: [S, 8, 'One', 'Lightning', 5, 'Natdex', 4, 40], eelektross: [S, 10, 'Two', 'Lightning', undefined, 'Natdex', 6, 40],
    cubchoo: [1, 5, 'Basic', 'Water', 5, 'Natdex', 24, 40], beartic: [S, 8, 'One', 'Water', undefined, 'Natdex', 26, 40],
    shelmet: [1, 5, 'Basic', 'Grass', undefined, 'Natdex', 0, 41], accelgor: [S, 8, 'One', 'Grass', undefined, 'Natdex', 2, 41],
    stunfisk: [3, 7, 'Basic', 'Lightning', undefined, 'Natdex', 4, 41],
    mienfoo: [1, 5, 'Basic', 'Fighting', 5, 'Natdex', 6, 41], mienshao: [S, 8, 'One', 'Fighting', undefined, 'Natdex', 8, 41],
    druddigon: [3, 7, 'Basic', 'Dragon', undefined, 'Natdex', 10, 41], bouffalant: [3, 7, 'Basic', 'Colorless', undefined, 'Natdex', 20, 41],
    rufflet: [1, 5, 'Basic', 'Colorless', 5, 'Natdex', 22, 41], braviary: [S, 8, 'One', 'Colorless', undefined, 'Natdex', 24, 41],
    heatmor: [3, 7, 'Basic', 'Fire', undefined, 'Natdex', 0, 42], durant: [3, 7, 'Basic', 'Metal', undefined, 'Natdex', 2, 42],
    larvesta: [1, 5, 'Basic', 'Fire', 5, 'Natdex', 10, 42], volcarona: [S, 8, 'One', 'Fire', undefined, 'Natdex', 12, 42],
  };
  ok(Object.keys(WANT).length === 30, '30 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, sheet, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 5,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 5`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === 'poke_AtlasJokersBasic' + sheet + '391' && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${sheet} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  // (the regional forms sit after their original lines: skipped here)
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker' && !/^j_poke_(alolan|galarian|hisuian|paldean|mega)_/.test(c.key)).map((c) => c.key);
  const run = (from, list, to) => { const i = keys.indexOf('j_poke_' + list[0]); return i > 0 && [from, ...list, to].every((k, n) => keys[i - 1 + n] === 'j_poke_' + k) ? true : keys.slice(i - 1, i + list.length + 1); };
  const RUNS = [
    ['gothitelle', ['ducklett', 'swanna'], 'vanillite'], ['vanilluxe', ['deerling', 'sawsbuck', 'emolga', 'karrablast', 'escavalier', 'foongus', 'amoonguss'], 'frillish'],
    ['jellicent', ['alomomola', 'joltik', 'galvantula'], 'ferroseed'], ['klinklang', ['tynamo', 'eelektrik', 'eelektross'], 'elgyem'],
    ['haxorus', ['cubchoo', 'beartic'], 'cryogonal'], ['cryogonal', ['shelmet', 'accelgor', 'stunfisk', 'mienfoo', 'mienshao', 'druddigon'], 'golett'],
    ['bisharp', ['bouffalant', 'rufflet', 'braviary', 'heatmor', 'durant'], 'deino'], ['hydreigon', ['larvesta', 'volcarona'], null],
  ];
  for (const [from, list, to] of RUNS) {
    const r = to ? run(from, list, to) : run(from, list, keys[keys.indexOf('j_poke_' + list[list.length - 1]) + 1].slice(7));
    ok(r === true, `Pokédex order: ${from}, ${list.join(', ')}${to ? ', ' + to : ''}`, r);
  }
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).filter((k) => !/^(j_poke_)?(alolan|galarian|hisuian|paldean|mega)_/.test(k)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  const inert = ['foongus', 'amoonguss', 'alomomola', 'stunfisk', 'mienfoo', 'mienshao'];
  ok(inert.every((n) => C(n).poke_no_energy_field === true) && NAMES.filter((n) => !inert.includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Energy-inert by design (poke_no_energy_field): Foongus / Amoonguss (odds, Spore), Alomomola (a copy), Stunfisk (money), Mienfoo / Mienshao (retriggers)');
  ok(['static_money', 'money_cap', 'static_paid', 'together', 'steel_x', 'charge_Xmult', 'Xmult_cap', 'ant_Xmult', 'targets', 'retriggers', 'hands', 'd_size', 'num', 'dem'].every((f) => !(f in energy_values)),
    'fixed: the money and its cap, the trade count, Escavalier\'s Steel X1.75, the banks and the cap, the retriggers, the +hand / +discard, the odds');
});

// ------------------------------------------------------------------- Ducklett / Swanna: Flush
await sec('flush', () => {
  start('DUCK');
  add('j_poke_ducklett');
  let t = play(['H_2', 'H_5', 'H_7', 'H_9', 'H_J']);
  ok(t.chips === 35 + 2 + 5 + 7 + 9 + 10 + 40 && near(t.mult, 4), 'Ducklett: a Flush +40 Chips (35 + 33 + 40) x 4', t.total);
  t = play(['H_2', 'H_3', 'H_4', 'H_5', 'H_6']);
  ok(t.chips === 100 + 20 + 40 && near(t.mult, 8), 'a Straight Flush contains a Flush: +40 too', t.total);
  t = play(['H_9', 'S_9']);
  ok(t.chips === 10 + 18 && near(t.mult, 2), 'a Pair: nothing', t.total);
  start('SWAN');
  add('j_poke_swanna');
  t = play(['S_2', 'S_5', 'S_7', 'S_9', 'S_J']);
  ok(near(t.mult, 4 * 2), 'Swanna: a Flush X2 (4 x 2)', t.total);
  t = play(['S_A']);
  ok(near(t.mult, 1), 'a High Card: nothing', t.total);
  start('DUCKEVO');
  const d = add('j_poke_ducklett');
  rounds(4); ok(key(d) === 'j_poke_ducklett', 'Ducklett: still Ducklett after 4 rounds');
  rounds(1); ok(key(d) === 'j_poke_swanna', 'Ducklett -> Swanna after 5 rounds', key(d));
});

// ------------------------------------------------------------------- Deerling / Sawsbuck: the season cycle, its suits and its art
await sec('seasons', () => {
  ok([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, -1].map((a) => DES.season_of_ante(a)).join() === 'spring,summer,autumn,winter,spring,summer,autumn,winter,spring,winter,autumn',
    'the season by Ante: 1 Spring, 2 Summer, 3 Autumn, 4 Winter, then again (deterministic; Ante 0 Winter)');
  const SUIT = { spring: 'H', summer: 'D', autumn: 'C', winter: 'S' };
  start('DEER');
  const d = add('j_poke_deerling');
  for (const [ante, season] of [[1, 'spring'], [2, 'summer'], [3, 'autumn'], [4, 'winter'], [5, 'spring']]) {
    G.GAME.round_resets.ante = ante;
    const s = SUIT[season], other = SUIT[season === 'spring' ? 'winter' : 'spring'];
    const t = play([s + '_5', s + '_5', other + '_7', other + '_7']);
    ok(near(t.mult, 2 + 2 * 3), `Ante ${ante} (${season}): two scored ${s} cards +3 each, the other suit nothing (Two Pair 2 + 6)`, t.total);
    ok(new RegExp('Now ' + DES.SEASONS[season].name + ': ' + DES.SEASONS[season].suit).test(plain(d)), `the tooltip names ${season} and its suit`, plain(d));
  }
  G.GAME.round_resets.ante = 1;
  let t = play([['S_5', 'm_wild'], 'C_5']);
  ok(near(t.mult, 2 + 3), 'a Wild card counts as the season\'s suit (Spring: +3); the Club not', t.total);
  // the season changes at the start of each Ante: beat the Boss (ante 1 -> 2), and the shop is already Summer
  start('DEERANTE');
  const d2 = add('j_poke_deerling');
  ok(DES.season_now() === 'spring', 'a new run: Ante 1, Spring');
  endRound(); advance(); endRound(); advance(); // Small, Big
  ok(G.GAME.round_resets.ante === 1 && DES.season_now() === 'spring', 'still Spring on the Boss Blind of Ante 1');
  endRound();
  ok(G.GAME.round_resets.ante === 2 && DES.season_now() === 'summer', 'the Boss beaten: Ante 2, Summer (the cash-out and shop are already Summer)', G.GAME.round_resets.ante);
  advance();
  t = play(['D_5', 'D_5']);
  ok(near(t.mult, 2 + 6), 'Summer: Diamonds +3 each', t.total);
  // Sawsbuck: X1.2 per scored card of the suit
  start('SAWS');
  add('j_poke_sawsbuck');
  G.GAME.round_resets.ante = 3;
  t = play(['C_8', 'C_8', 'H_8']);
  ok(near(t.mult, 3 * 1.2 * 1.2), 'Sawsbuck, Autumn: Three of a Kind with two Clubs: 3 x 1.2 x 1.2', t.total);
  // the art: each season its own 3.9.1 card (the Gen 5 sheet), live from the Ante
  const CELLS = { deerling: { spring: [2, 1], summer: [4, 1], autumn: [6, 1], winter: [8, 1] }, sawsbuck: { spring: [10, 1], summer: [0, 2], autumn: [2, 2], winter: [4, 2] } };
  start('DEERART');
  for (const n of ['deerling', 'sawsbuck']) {
    const j = add('j_poke_' + n);
    for (const [i, season] of DES.SEASON_ORDER.entries()) {
      G.GAME.round_resets.ante = i + 1;
      const [atlas, pos] = drawn(j), [sa, sp] = drawn(j, true);
      ok(atlas === 'poke_AtlasJokersBasicGen05391' && pos.x === CELLS[n][season][0] && pos.y === CELLS[n][season][1], `${n} in ${season}: Gen 5 {${CELLS[n][season]}}`, [atlas, pos]);
      ok(sa === 'poke_AtlasJokersBasicGen05Shiny391' && sp.x === pos.x && sp.y === pos.y, `${n} in ${season}, Shiny: the Shiny sheet's twin`, [sa, sp]);
    }
  }
  ok(ANIM.SEASON_SPRITES && ANIM.SEASON_SPRITES.j_poke_deerling.winter.x === 8, 'SEASON_SPRITES exported');
  // evolution: 5 rounds
  start('DEEREVO');
  const e = add('j_poke_deerling');
  rounds(4); ok(key(e) === 'j_poke_deerling', 'Deerling: still Deerling after 4 rounds');
  rounds(1); ok(key(e) === 'j_poke_sawsbuck', 'Deerling -> Sawsbuck after 5 rounds', key(e));
  void d2;
});

// ------------------------------------------------------------------- Emolga: Static
await sec('emolga', () => {
  start('EMOL');
  add('j_poke_emolga');
  let d0 = G.GAME.dollars;
  let t = play(['S_K', 'H_K', 'D_K']);
  ok(near(t.mult, 3 + 3 * 2) && G.GAME.dollars === d0 + 3, 'Three Kings: +2 Mult and $1 each (3 + 6; $3)', [t.total, G.GAME.dollars - d0]);
  d0 = G.GAME.dollars;
  t = play(['S_J', 'H_Q', 'D_A']);
  ok(near(t.mult, 1) && G.GAME.dollars === d0, 'a High Card Ace: only the Ace scores, no face: nothing', [t.total, G.GAME.dollars - d0]);
  d0 = G.GAME.dollars;
  t = play(['S_Q', 'H_Q', 'D_9', 'C_9']);
  ok(near(t.mult, 2 + 4) && G.GAME.dollars === d0 + 2, 'Two Pair (Queens and 9s): the two Queens +2 and $1', [t.total, G.GAME.dollars - d0]);
  add('j_pareidolia');
  d0 = G.GAME.dollars;
  t = play(['S_4', 'H_4']);
  ok(near(t.mult, 2 + 4) && G.GAME.dollars === d0 + 2, 'with Pareidolia every card is a face card', [t.total, G.GAME.dollars - d0]);
});

// ------------------------------------------------------------------- Karrablast + Shelmet: the trade pair
await sec('trade', () => {
  start('TRADE1');
  const k = add('j_poke_karrablast'), s = add('j_poke_shelmet');
  let t = play(['S_A']);
  ok(t.chips === 5 + 11 + 40 && near(t.mult, 1 + 6), 'Karrablast +6 Mult, Shelmet +40 Chips', t.total);
  rounds(3);
  ok(key(k) === 'j_poke_karrablast' && key(s) === 'j_poke_shelmet' && ex(k).together === 3 && ex(s).together === 3, 'held together 3 rounds: 3/4 each, no evolution yet', [ex(k).together, ex(s).together]);
  ok(/Together: 3\/4; with Shelmet/.test(plain(k)) && /Together: 3\/4; with Karrablast/.test(plain(s)), 'the tooltip counts and names the partner', [plain(k), plain(s)]);
  endRound();
  ok(key(k) === 'j_poke_escavalier' && key(s) === 'j_poke_accelgor', 'the 4th round together: at that end of round Karrablast -> Escavalier AND Shelmet -> Accelgor', [key(k), key(s)]);
  // no partner: neither evolves, ever
  start('TRADE2');
  const lone = add('j_poke_karrablast');
  rounds(8);
  ok(key(lone) === 'j_poke_karrablast' && !ex(lone).together, 'Karrablast alone, 8 rounds: no evolution (0 rounds together)', [key(lone), ex(lone).together]);
  ok(/needs Shelmet/.test(plain(lone)), 'the tooltip: "needs Shelmet"', plain(lone));
  start('TRADE2B');
  const sl = add('j_poke_shelmet');
  rounds(6);
  ok(key(sl) === 'j_poke_shelmet' && !ex(sl).together, 'Shelmet alone: no evolution', key(sl));
  // a debuffed partner isn't one: the round doesn't count
  start('TRADE3');
  const k3 = add('j_poke_karrablast'), s3 = add('j_poke_shelmet');
  rounds(2);
  debuff(s3);
  rounds(2);
  ok(ex(k3).together === 2 && ex(s3).together === 2, 'Shelmet debuffed for 2 rounds: neither counts them (2/4 each)', [ex(k3).together, ex(s3).together]);
  undebuff(s3);
  rounds(2);
  ok(key(k3) === 'j_poke_escavalier' && key(s3) === 'j_poke_accelgor', '... 2 more together: both evolve', [key(k3), key(s3)]);
  // pairing: several of either, leftmost with leftmost; the odd one out counts nothing
  start('TRADE4');
  const ka = add('j_poke_karrablast'), kb = add('j_poke_karrablast'), sa = add('j_poke_shelmet');
  rounds(4);
  ok(key(ka) === 'j_poke_escavalier' && key(sa) === 'j_poke_accelgor' && key(kb) === 'j_poke_karrablast' && !ex(kb).together,
    'two Karrablasts, one Shelmet: the LEFTMOST Karrablast pairs and evolves; the other counts nothing', [key(ka), key(kb), key(sa), ex(kb).together]);
  // a new partner must catch up: the counts are each joker's own
  start('TRADE5');
  const k5 = add('j_poke_karrablast'), s5 = add('j_poke_shelmet');
  rounds(2);
  sell(s5);
  const s6 = add('j_poke_shelmet');
  rounds(2);
  ok(key(k5) === 'j_poke_karrablast' && ex(k5).together === 4 && ex(s6).together === 2, 'a new Shelmet: Karrablast 4/4 (it waits), the new one 2/4', [ex(k5).together, ex(s6).together]);
  rounds(2);
  ok(key(k5) === 'j_poke_escavalier' && key(s6) === 'j_poke_accelgor', '... both evolve once the new one reaches 4', [key(k5), key(s6)]);
  // Everstone stops it
  start('TRADE6');
  const k7 = add('j_poke_karrablast'), s7 = add('j_poke_shelmet');
  add('j_poke_everstone');
  rounds(5);
  ok(key(k7) === 'j_poke_karrablast' && key(s7) === 'j_poke_shelmet' && ex(k7).together === 4, 'an Everstone: they count (4/4) but never evolve', [key(k7), ex(k7).together]);
});

// ------------------------------------------------------------------- Escavalier / Durant / Registeel: held Steel, the best rule wins
await sec('steel rules', () => {
  start('STEEL');
  const e = add('j_poke_escavalier');
  let t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 1.75 * 1.5), 'Escavalier: a held Steel card X1.75 (not X1.5), then its own X1.5: 2.625', t.total);
  t = play(['S_A'], { held: [['H_K', 'm_steel'], ['D_K', 'm_steel']] });
  ok(near(t.mult, 1.75 * 1.75 * 1.5), 'two held Steel cards: X1.75 each', t.total);
  const du = add('j_poke_durant');
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 1.75 * 1.5), 'Escavalier + Durant: still X1.75 once (they never stack)', t.total);
  const rs = add('j_poke_registeel');
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 2 * 1.5), 'with Registeel: its X2 wins', t.total);
  rs.remove(); e.remove(); flush();
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 1.75), 'Durant alone: X1.75', t.total);
  debuff(du);
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 1.5), 'a debuffed Durant: the card\'s own X1.5', t.total);
  undebuff(du);
  add('j_mime');
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 1.75 * 1.75), 'Mime retriggers the held Steel card: X1.75 twice (the rule is the card\'s)', t.total);
  const [st] = cards([['C_3', 'm_steel']]);
  ok(/X1\.75/.test(describe(st).lines.join(' ')), 'the Steel card\'s own tooltip says X1.75', describe(st).lines);
});

// ------------------------------------------------------------------- Accelgor: +1 hand, +1 discard, +4 Mult per hand left
await sec('accelgor', () => {
  start('ACCEL', {}, { noBlind: true });
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  const a = add('j_poke_accelgor');
  ok(G.GAME.round_resets.hands === h0 + 1 && G.GAME.round_resets.discards === d0 + 1, 'Accelgor: +1 hand, +1 discard each round', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.current_round.hands_left === h0 + 1 && G.GAME.current_round.discards_left === d0 + 1, 'the round starts with 5 hands and 4 discards', [G.GAME.current_round.hands_left, G.GAME.current_round.discards_left]);
  clearHand();
  const [c1] = cards(['S_A']);
  act({ type: 'highlight', ids: [c1.sort_id] }); G.GAME.blind.chips = 1e15;
  let r = act({ type: 'play' }); flush();
  let tot = r.events.find((e) => e.type === 'hand_total');
  ok(near(Number(tot.mult), 1 + 4 * 4), 'the 1st of 5 hands: 4 hands left when it scores: +16', tot);
  clearHand();
  G.GAME.current_round.hands_left = 1;
  const [c2] = cards(['S_A']);
  act({ type: 'highlight', ids: [c2.sort_id] });
  r = act({ type: 'play' }); flush();
  tot = r.events.find((e) => e.type === 'hand_total');
  ok(near(Number(tot.mult), 1), 'the round\'s last hand: 0 left, +0', tot);
  start('ACCEL2', {}, { noBlind: true });
  const a2 = add('j_poke_accelgor');
  sell(a2);
  ok(G.GAME.round_resets.hands === h0 && G.GAME.round_resets.discards === d0, 'sold: both back', [G.GAME.round_resets.hands, G.GAME.round_resets.discards]);
  void a;
});

// ------------------------------------------------------------------- Foongus: a Poke Ball at the end of the shop
await sec('foongus', () => {
  start('FOON');
  const f = add('j_poke_foongus');
  ex(f).num = ex(f).dem = 1;
  endRound(); act({ type: 'cash_out' });
  const n0 = G.consumeables.cards.length;
  act({ type: 'next_round' }); flush();
  ok(G.consumeables.cards.length === n0 + 1 && key(G.consumeables.cards[G.consumeables.cards.length - 1]) === 'c_poke_pokeball', 'forced odds: the end of the shop creates a Poke Ball', G.consumeables.cards.map(key));
  // no room: nothing (and no roll)
  start('FOON2');
  const f2 = add('j_poke_foongus');
  ex(f2).num = ex(f2).dem = 1;
  add('c_poke_pokeball'); add('c_poke_pokeball');
  endRound(); act({ type: 'cash_out' });
  const seed0 = JSON.stringify(G.GAME.pseudorandom);
  act({ type: 'next_round' }); flush();
  ok(G.consumeables.cards.length === 2, 'full consumable slots: no Poke Ball', G.consumeables.cards.map(key));
  ok(!JSON.stringify(G.GAME.pseudorandom).includes('"foongus"') || seed0.includes('"foongus"'), 'no room: no roll (the foongus stream never started)');
  // the odds over many seeds: about 1 in 4
  let made = 0;
  for (let i = 0; i < 80; i++) {
    start('FOONR' + i);
    add('j_poke_foongus');
    endRound(); act({ type: 'cash_out' });
    act({ type: 'next_round' }); flush();
    if (G.consumeables.cards.some((c) => key(c) === 'c_poke_pokeball')) made++;
  }
  ok(made >= 8 && made <= 34, '1 in 4 over 80 seeded shops (8..34 Poke Balls)', made);
  start('FOONEVO');
  const e = add('j_poke_foongus');
  rounds(5); ok(key(e) === 'j_poke_amoonguss', 'Foongus -> Amoonguss after 5 rounds', key(e));
});

// ------------------------------------------------------------------- Amoonguss, Spore: the Boss Blind is off during the round's first hand
await sec('spore', () => {
  // The Psychic: 5 cards a hand
  bossRound('SPPSY', 'bl_psychic', ['j_poke_amoonguss']);
  ok(G.GAME.blind.name === 'The Psychic' && G.GAME.blind.suspended === true && G.GAME.blind.off && !G.GAME.blind.disabled, 'Spore: the Boss Blind is suspended from the first deal (off, not disabled)', [G.GAME.blind.name, G.GAME.blind.suspended]);
  let t = play(['S_A']);
  ok(t.score === (5 + 11) * 1, 'The Psychic, hand 1: a 1-card hand scores (16)', t.total);
  ok(!G.GAME.blind.suspended && !G.GAME.blind.off, 'after the first hand: the Blind is back', G.GAME.blind.suspended);
  t = play(['S_A']);
  ok(t.score === 0, 'hand 2: debuffed again (0)', t.total);
  bossRound('SPPSY0', 'bl_psychic');
  t = play(['S_A']);
  ok(t.score === 0 && !G.GAME.blind.suspended, 'no Amoonguss: hand 1 is debuffed', t.total);
  // The Flint: halves the base Chips and Mult
  bossRound('SPFLI', 'bl_flint', ['j_poke_amoonguss']);
  t = play(['S_5', 'H_5']);
  ok(t.chips === 10 + 10 && near(t.mult, 2), 'The Flint, hand 1: a full Pair (20 x 2)', t.total);
  t = play(['S_5', 'H_5']);
  ok(t.chips === 5 + 10 && near(t.mult, 1), 'hand 2: halved (15 x 1)', t.total);
  // The Eye: hand 1 is not recorded, so a repeat is allowed once
  bossRound('SPEYE', 'bl_eye', ['j_poke_amoonguss']);
  t = play(['S_5', 'H_5']); ok(t.score > 0, 'The Eye, hand 1: Pair', t.total);
  t = play(['S_6', 'H_6']); ok(t.score > 0, 'hand 2: Pair again is allowed (hand 1 was never recorded)', t.total);
  t = play(['S_7', 'H_7']); ok(t.score === 0, 'hand 3: a third Pair is debuffed', t.total);
  // debuffing bosses: the debuffed cards score in hand 1, and are debuffed again after it
  for (const [boss, c] of [['bl_goad', 'S_A'], ['bl_club', 'C_A'], ['bl_window', 'D_A'], ['bl_head', 'H_A'], ['bl_plant', 'S_K'], ['bl_pillar', 'S_A']]) {
    bossRound('SPDB' + boss, boss, ['j_poke_amoonguss']);
    const id = c === 'S_K' ? 10 : 11;
    clearHand();
    const [pc] = cards([c]);
    const [held] = cards([c]);
    // (The Pillar: cards played this Ante)
    if (boss === 'bl_pillar') for (const x of [pc, held]) { x.ability.played_this_ante = true; G.GAME.blind.debuff_card(x); }
    ok(!held.debuff && !pc.debuff, `${boss}: under Spore its cards aren't debuffed`, [held.debuff, pc.debuff]);
    G.hand.unhighlight_all();
    act({ type: 'highlight', ids: [pc.sort_id] }); G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
    const r = act({ type: 'play' }); flush();
    const tot = r.events.find((e) => e.type === 'hand_total');
    ok(Number(tot.total) === 5 + id, `${boss}, hand 1: the ${c} scores (${5 + id})`, tot);
    ok(held.debuff === true, `${boss}: back after hand 1, the held ${c} is debuffed again`, held.debuff);
  }
  for (const boss of ['bl_goad', 'bl_head']) {
    bossRound('SPDB2' + boss, boss, ['j_poke_amoonguss']);
    const c = boss === 'bl_goad' ? 'S_A' : 'H_A';
    const [c1, c2] = cards([c, c]); // (both made before hand 1, as the deck's cards are: the Blind debuffs them when it comes back)
    for (const x of [c1, c2]) {
      G.hand.unhighlight_all();
      act({ type: 'highlight', ids: [x.sort_id] }); G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
      const r = act({ type: 'play' }); flush();
      const tot = r.events.find((e) => e.type === 'hand_total');
      if (x === c1) ok(Number(tot.total) === 16, `${boss}, hand 1: 16`, tot);
      else ok(Number(tot.total) === 5, `${boss}, hand 2: the card is debuffed again (5 x 1)`, tot);
    }
  }
  // The Hook: nothing on the first play
  bossRound('SPHOOK', 'bl_hook', ['j_poke_amoonguss']);
  play(['S_A'], { held: ['H_2', 'H_3', 'H_4', 'H_5'] });
  ok(G.discard.cards.length === 1, 'The Hook, hand 1: no held cards discarded (only the played one in the discard pile)', G.discard.cards.length);
  play(['S_A'], { held: ['H_2', 'H_3', 'H_4', 'H_5'], clear: true });
  ok(G.discard.cards.length === 1 + 1 + 2, 'hand 2: The Hook discards 2', G.discard.cards.length);
  // not a Boss: nothing
  start('SPSMALL');
  add('j_poke_amoonguss');
  ok(!G.GAME.blind.suspended && !G.GAME.blind.boss, 'the Small Blind: Spore does nothing');
  // a Chicot: disabled for good; Spore never brings it back
  bossRound('SPCHI', 'bl_psychic', ['j_poke_amoonguss', 'j_chicot']);
  ok(G.GAME.blind.disabled && !G.GAME.blind.suspended, 'Chicot disabled it when it was selected: no suspension');
  play(['S_A']); t = play(['S_A']);
  ok(t.score === 16 && G.GAME.blind.disabled, 'hand 2 still free: Chicot\'s disable is for good', t.total);
  // a Luchador sold during the suspended hand disables it for good
  const [, lu] = bossRound('SPLUC', 'bl_psychic', ['j_poke_amoonguss', 'j_luchador']);
  ok(G.GAME.blind.suspended, 'suspended');
  sell(lu);
  ok(G.GAME.blind.disabled && !G.GAME.blind.suspended, 'Luchador sold during the suspension: disabled for good (it still could)', [G.GAME.blind.disabled, G.GAME.blind.suspended]);
  play(['S_A']); t = play(['S_A']);
  ok(t.score === 16, '... so hand 2 is free too', t.total);
  // Amoonguss sold during the suspension: back at once
  const [am] = bossRound('SPSOLD', 'bl_psychic', ['j_poke_amoonguss']);
  sell(am);
  ok(!G.GAME.blind.suspended && !G.GAME.blind.off, 'Amoonguss sold before the first hand: the Blind is back at once');
  t = play(['S_A']);
  ok(t.score === 0, 'and hand 1 is debuffed', t.total);
  // The Manacle: its -1 hand size is a set-up (kept), and is given back when the Blind is beaten on hand 1
  start('SPMAN', {}, { noBlind: true });
  const hs = G.hand.config.card_limit;
  add('j_poke_amoonguss');
  G.GAME.round_resets.blind_choices.Small = 'bl_manacle';
  act({ type: 'select_blind' }); flush();
  ok(G.hand.config.card_limit === hs - 1 && G.GAME.blind.suspended, 'The Manacle under Spore: its -1 hand size stays (a set-up)', G.hand.config.card_limit);
  play(['S_A'], { win: true });
  act({ type: 'cash_out' }); flush();
  ok(G.hand.config.card_limit === hs, 'won on hand 1: The Manacle gives the hand size back at its defeat', G.hand.config.card_limit);
  // the board shows it as disabled while suspended
  bossRound('SPVIEW', 'bl_psychic', ['j_poke_amoonguss']);
  ok(/active this hand/.test(plain(G.jokers.cards[0])), 'Amoonguss tooltip: "active this hand"', plain(G.jokers.cards[0]));
  play(['S_A']);
  ok(/used this round/.test(plain(G.jokers.cards[0])), '... then "used this round"', plain(G.jokers.cards[0]));
  // a debuffed Amoonguss at the first deal: no Spore
  start('SPDEB', {}, { noBlind: true });
  debuff(add('j_poke_amoonguss'));
  G.GAME.round_resets.blind_choices.Small = 'bl_psychic';
  act({ type: 'select_blind' }); flush();
  ok(!G.GAME.blind.suspended, 'a debuffed Amoonguss: no Spore');
});

// ------------------------------------------------------------------- Alomomola: Healing Heart
await sec('alomomola', () => {
  start('ALOMO');
  add('j_poke_alomomola');
  add('j_caino');
  const n0 = G.playing_cards.length;
  clearHand();
  const [k] = cards([['S_K', 'm_glass']]);
  k.set_seal('Red', true); k.set_edition({ foil: true }, true, true);
  use('c_hanged_man', [k]);
  const copies = G.playing_cards.filter((c) => c !== k && c.base.suit === 'Spades' && c.base.id === 13 && key(c) === 'm_glass' && c.seal === 'Red' && c.edition && c.edition.foil);
  ok(G.playing_cards.length === n0 + 1 - 1 + 1, 'The Hanged Man destroys the King: it is copied back (1 made, 1 destroyed, +1 copy)', [n0, G.playing_cards.length]);
  ok(copies.length === 1 && copies[0].area === G.deck && !G.playing_cards.includes(k), 'the copy: the King of Spades, Glass, Red Seal, Foil, in the deck; the original is gone', copies.map(cardId));
  const caino = G.jokers.cards.find((j) => key(j) === 'j_caino');
  ok(near(caino.ability.caino_xmult, 1 + 1), 'Canio still counts the destroyed King (X2): it is a copy, the original was destroyed', caino.ability.caino_xmult);
  ok(/used this round/.test(plain(G.jokers.cards[0])), 'the tooltip: used this round', plain(G.jokers.cards[0]));
  // once a round: two more destroyed, no copy
  const n0b = G.playing_cards.length;
  const [q, j2] = cards(['H_Q', 'D_J']);
  use('c_hanged_man', [q, j2]);
  ok(G.playing_cards.length === n0b, 'the 2nd destroy this round (2 cards): no copy', [n0b, G.playing_cards.length]);
  ok(near(caino.ability.caino_xmult, 1 + 3), 'Canio: X4', caino.ability.caino_xmult);
  // the next round copies again
  endRound(); advance();
  const n1 = G.playing_cards.length;
  const [g] = cards([['C_9', 'm_glass']]);
  use('c_hanged_man', [g]);
  ok(G.playing_cards.length === n1 + 1 - 1 + 1, 'a new round: the first destroyed card is copied again', [n1, G.playing_cards.length]);
  endRound(); advance();
  const n3 = G.playing_cards.length;
  const two = cards(['S_4', 'H_4']);
  use('c_hanged_man', two);
  ok(G.playing_cards.length === n3 + 2 - 2 + 1, 'two destroyed at once: only the first of them is copied', [n3, G.playing_cards.length]);
  // a shattered Glass card (any cause)
  start('ALOMO2');
  add('j_poke_alomomola');
  G.GAME.probabilities.normal = 1e9;
  const n2 = G.playing_cards.length;
  const t = play([['H_7', 'm_glass']]);
  ok(G.playing_cards.length === n2 + 1 - 1 + 1 && G.playing_cards.some((c) => c.base.suit === 'Hearts' && c.base.id === 7 && key(c) === 'm_glass' && c.area === G.deck && !c.shattered), 'a Glass card that shatters is copied back into the deck', [n2, G.playing_cards.length]);
  void t;
});

// ------------------------------------------------------------------- Joltik / Galvantula; the Tynamo line
await sec('lightning', () => {
  start('JOLT');
  const j = add('j_poke_joltik');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Joltik alone: +0 (it never counts itself)', t.total);
  add('j_poke_pikachu'); const e = add('j_poke_emolga');
  t = play(['S_3']);
  ok(near(t.mult, 1 + 2 * 3), 'two other Lightning Jokers: +6', t.total);
  debuff(e);
  t = play(['S_3']);
  ok(near(t.mult, 1 + 3), 'a debuffed one doesn\'t count: +3', t.total);
  const v = add('j_joker'); apply_type_sticker(v, 'Lightning'); flush();
  t = play(['S_3']);
  ok(near(t.mult, 1 + 4 + 3 * 2), 'a Lightning Tera Joker counts (+6; its own +4)', t.total);
  rounds(5); ok(key(j) === 'j_poke_galvantula', 'Joltik -> Galvantula after 5 rounds', key(j));
  start('GALV');
  add('j_poke_galvantula');
  t = play(['S_A'], { held: [['H_K', 'm_gold'], ['D_K', 'm_gold'], 'C_K'] });
  ok(near(t.mult, 1.2 * 1.2), 'Galvantula: two Gold cards held X1.2 each (the plain King nothing)', t.total);
  // Tynamo: Steel cards in the full deck
  start('TYNA');
  const ty = add('j_poke_tynamo');
  t = play(['S_A']);
  ok(near(t.mult, 1), 'Tynamo, no Steel: +0', t.total);
  G.playing_cards.filter((c) => c.area === G.deck).slice(0, 3).forEach((c) => c.set_ability(P_CENTERS.m_steel, null, true));
  t = play(['S_A']);
  ok(near(t.mult, 1 + 3), '3 Steel cards in the deck: +3', t.total);
  rounds(5); ok(key(ty) === 'j_poke_eelektrik', 'Tynamo -> Eelektrik after 5 rounds', key(ty));
  t = play(['S_A'], { held: [['H_K', 'm_steel'], ['D_K', 'm_steel']] });
  ok(near(t.mult, (1 * 1.5 + 3) * 1.5 + 3), 'Eelektrik: each held Steel card X1.5 (its own) then +3 (h_mult): (1.5 + 3) x 1.5 + 3', t.total);
  rounds(5); ok(key(ty) === 'j_poke_eelektross', 'Eelektrik -> Eelektross after 5 more', key(ty));
  const steel = G.playing_cards.filter((c) => key(c) === 'm_steel').length;
  t = play(['S_A']);
  ok(near(t.mult, 1.5 + 0.1 * steel), `Eelektross: X(1.5 + 0.1 x ${steel} Steel in the deck)`, [t.total, steel]);
});

// ------------------------------------------------------------------- Cubchoo / Beartic: Glass Chips, Freeze
await sec('cubchoo', () => {
  start('CUBC');
  const c = add('j_poke_cubchoo');
  G.GAME.probabilities.normal = 0;
  const t = play([['S_9', 'm_glass'], ['H_9', 'm_glass']]);
  ok(t.chips === 10 + 18 + 40, 'Cubchoo: two scored Glass cards +20 Chips each', t.total);
  rounds(5); ok(key(c) === 'j_poke_beartic', 'Cubchoo -> Beartic after 5 rounds', key(c));
});
/** Win the round in progress by playing `list`, holding `held` (the first held is the leftmost): -> the held cards. */
function winHolding(list, held) {
  clearHand();
  const hs = cards(held), ps = cards(list);
  G.GAME.chips = G.GAME.blind.chips;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: ps.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  return hs;
}
await sec('freeze', () => {
  start('FRZ');
  const b = add('j_poke_beartic');
  const [k, n, f] = winHolding(['S_2'], ['H_K', 'D_9', 'C_4']);
  ok(state() === 'ROUND_EVAL', 'the round is won', state());
  ok(k.ability.poke_frozen === b.sort_id && k.area === G.hand && G.hand.cards.length === 1, 'end of round: the LEFTMOST held card (King of Hearts) is frozen and stays in your hand', [k.area === G.hand, G.hand.cards.map(cardId)]);
  ok(n.area === G.deck && f.area === G.deck, 'the other held cards go back to the deck', [n.area && n.area.config.type, f.area && f.area.config.type]);
  act({ type: 'cash_out' }); flush();
  ok(state() === 'SHOP' && G.hand.cards.length === 1 && G.hand.cards[0] === k, 'through the cash-out and the shop: still in hand', [state(), G.hand.cards.length]);
  act({ type: 'next_round' }); flush();
  ok(G.hand.cards[0] === k || G.hand.cards.includes(k), 'the next Blind\'s choice: still in hand');
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  const deck0 = G.deck.cards.length;
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.includes(k) && G.hand.cards.length === G.hand.config.card_limit && deck0 - G.deck.cards.length === G.hand.config.card_limit - 1,
    'the next round\'s deal fills around it: 8 cards in hand, 7 drawn', [G.hand.cards.length, deck0 - G.deck.cards.length]);
  ok(/Frozen: King of Hearts/.test(plain(b)), 'Beartic\'s tooltip names the frozen card', plain(b));
  ok((describe(k).lines || []).join(' ').includes('Frozen'), 'the frozen card\'s own tooltip says Frozen', describe(k).lines);
  // the held X1.5
  for (const c of G.hand.cards.slice()) if (c !== k) { G.hand.remove_card(c); G.deck.emplace(c); }
  const [a] = cards(['S_A']);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: [a.sort_id] });
  let r = act({ type: 'play' }); flush();
  let tot = r.events.find((e) => e.type === 'hand_total');
  ok(near(Number(tot.mult), 1.5), 'while frozen it gives X1.5 when a hand scores (held)', tot);
  ok(k.ability.poke_frozen === b.sort_id, 'still frozen after a hand it didn\'t play in');
  // still held at the next end of round: it stays frozen, nothing else is
  for (const c of G.hand.cards.slice()) if (c !== k) { G.hand.remove_card(c); G.deck.emplace(c); }
  const extra = cards(['S_8']);
  G.GAME.chips = G.GAME.blind.chips;
  const [w] = cards(['C_2']);
  G.hand.cards.splice(G.hand.cards.indexOf(extra[0]), 1); G.hand.cards.unshift(extra[0]); // the 8 is now the leftmost
  act({ type: 'highlight', ids: [w.sort_id] }); act({ type: 'play' }); flush();
  ok(G.hand.cards.length === 1 && G.hand.cards[0] === k && !extra[0].ability.poke_frozen, 'its frozen card still held at the end of round: it stays (one card per Beartic); the new leftmost isn\'t frozen', G.hand.cards.map(cardId));
  // played: it thaws, and the next end of round freezes the leftmost again
  nextBlind();
  ok(G.hand.cards.includes(k), 'the next round: the King is dealt in again (still frozen)', G.hand.cards.map(cardId));
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  G.hand.unhighlight_all();
  act({ type: 'highlight', ids: [k.sort_id] });
  r = act({ type: 'play' }); flush();
  ok(k.ability.poke_frozen === undefined && k.area !== G.hand, 'played: it thaws', k.ability.poke_frozen);
  const [q2] = winHolding(['S_2'], ['S_Q', 'H_J']);
  ok(q2.ability.poke_frozen === b.sort_id && G.hand.cards.length === 1 && G.hand.cards[0] === q2 && k.area === G.deck, 'the next end of round: the new leftmost (Queen of Spades) is frozen; the thawed King went back to the deck', [G.hand.cards.map(cardId)]);
  // discarded: it thaws
  nextBlind();
  ok(G.hand.cards.includes(q2), 'the Queen is in the new hand');
  G.hand.unhighlight_all();
  discard([q2]);
  ok(q2.ability.poke_frozen === undefined, 'discarded: it thaws', q2.ability.poke_frozen);
  const [x3] = winHolding(['S_2'], ['D_3']);
  ok(x3.ability.poke_frozen === b.sort_id && q2.area === G.deck, 'and the next end of round freezes again (the Queen went back)', [x3.ability.poke_frozen, q2.area === G.deck]);
  // a pack opened in the shop: the frozen card is part of the hand, and stays when the pack closes
  act({ type: 'cash_out' }); flush();
  const ap = create_card('Booster', G.shop_booster, null, null, null, null, 'p_arcana_normal_1', 'test');
  G.shop_booster.emplace(ap);
  {
    G.GAME.dollars = 100;
    act({ type: 'buy', id: ap.sort_id }); flush();
    ok(state() !== 'SHOP' && G.hand.cards.includes(x3) && G.hand.cards.length === G.hand.config.card_limit, 'an Arcana pack opened in the shop: the frozen card is part of the pack hand (the draw fills around it)', [state(), G.hand.cards.length]);
    act({ type: 'skip_booster' }); flush();
    ok(state() === 'SHOP' && G.hand.cards.length === 1 && G.hand.cards[0] === x3 && x3.ability.poke_frozen === b.sort_id, '... and stays in hand (frozen) when the pack closes; the rest go back to the deck', G.hand.cards.map(cardId));
  }

  // Beartic sold: the card thaws at the next end of round (goes back to the deck)
  start('FRZSOLD');
  const b2 = add('j_poke_beartic');
  const [s1] = winHolding(['S_2'], ['H_5']);
  ok(s1.ability.poke_frozen === b2.sort_id && G.hand.cards[0] === s1, 'frozen');
  act({ type: 'cash_out' }); flush();
  sell(b2);
  act({ type: 'next_round' }); flush();
  act({ type: 'select_blind' }); flush();
  ok(!DES.freeze_keep(s1), 'Beartic sold: its card no longer kept');
  endRound();
  ok(s1.area === G.deck, 'and goes back to the deck at the next end of round');
  // two Beartics: two cards
  start('FRZ2');
  const ba = add('j_poke_beartic'), bb = add('j_poke_beartic');
  const [h1, h2, h3] = winHolding(['S_2'], ['H_A', 'H_K', 'H_Q']);
  ok(h1.ability.poke_frozen === ba.sort_id && h2.ability.poke_frozen === bb.sort_id && h3.area === G.deck && G.hand.cards.length === 2, 'two Beartics freeze the two leftmost cards, one each', G.hand.cards.map(cardId));
  // a debuffed Beartic: no X, its card still kept
  start('FRZDEB');
  const bd = add('j_poke_beartic');
  const [d1] = winHolding(['S_2'], ['C_K']);
  nextBlind();
  ok(G.hand.cards.includes(d1), '(dealt in with the next hand)');
  debuff(bd);
  const t = play(['S_A'], { held: [], clear: false });
  ok(near(t.mult, 1), 'a debuffed Beartic: no X1.5', t.total);
  ok(DES.freeze_keep(d1) || d1.area !== G.hand, 'its card is still kept while held');
});
await sec('freeze resume', () => {
  // a real run (a Session): win the first Blind holding cards, go through the shop to the next Blind, then resume it from the recipe
  let done1 = false;
  for (let i = 0; i < 20 && !done1; i++) {
    const s = new Session();
    s.start({ engineRev: 1, seed: 'FRZRES' + i, customDeck: { name: 'Ice', mods: ['pokermon'], params: { blind_scaling: 0.05 }, jokers: [{ key: 'j_poke_beartic' }] } });
    s.act({ type: 'select_blind' }); flush();
    const hc = G.hand.cards.slice();
    const play5 = hc.slice(1, 6);
    s.act({ type: 'highlight', ids: play5.map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
    if (state() !== 'ROUND_EVAL') continue;
    const fz = G.hand.cards.find((c) => c.ability.poke_frozen !== undefined);
    if (!fz || fz !== hc[0]) { ok(false, 'FRZRES' + i + ': the leftmost was frozen', G.hand.cards.map(cardId)); break; }
    const want = cardId(fz);
    s.act({ type: 'cash_out' }); flush();
    const r1 = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    ok(!r1.stoppedAt && state() === 'SHOP' && G.hand.cards.length === 1 && cardId(G.hand.cards[0]) === want && DES.freeze_keep(G.hand.cards[0]),
      `resume in the shop (FRZRES${i}): the frozen ${want} is back in hand, frozen`, [r1.stoppedAt, state(), G.hand.cards.map(cardId)]);
    r1.act({ type: 'next_round' }); flush();
    r1.act({ type: 'select_blind' }); flush();
    const deal = G.hand.cards.map(cardId);
    ok(deal.includes(want) && G.hand.cards.length === G.hand.config.card_limit, 'the next deal fills around it', deal);
    const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(r1.recipe))); flush();
    ok(!r2.stoppedAt && JSON.stringify(G.hand.cards.map(cardId)) === JSON.stringify(deal) && DES.freeze_keep(G.hand.cards.find((c) => cardId(c) === want)),
      'resume mid-round: the same hand, the card still frozen', [r2.stoppedAt, G.hand.cards.map(cardId)]);
    done1 = true;
  }
  ok(done1, 'a seed won its first Blind with 5 cards (blind_scaling 0.05)');
});

// ------------------------------------------------------------------- Stunfisk: $1 a discard, max $4 a round
await sec('stunfisk', () => {
  start('STUN');
  add('j_poke_stunfisk');
  const d0 = G.GAME.dollars;
  for (let i = 0; i < 6; i++) { const [c] = cards(['S_' + (i + 2)]); discard([c]); }
  ok(G.GAME.dollars === d0 + 4, 'six discards: $1 each, at most $4 a round', G.GAME.dollars - d0);
  ok(/this round \$4/.test(plain(G.jokers.cards[0])), 'the tooltip shows this round\'s $4', plain(G.jokers.cards[0]));
  endRound(); advance();
  const d1 = G.GAME.dollars;
  const [c] = cards(['H_9', 'H_8']); discard([c]);
  ok(G.GAME.dollars === d1 + 1, 'a new round: $1 again (one discard of one card)', G.GAME.dollars - d1);
  const d2 = G.GAME.dollars;
  const two = cards(['H_7', 'H_6']); discard(two);
  ok(G.GAME.dollars === d2 + 1, 'a discard of 2 cards is one discard: $1', G.GAME.dollars - d2);
});

// ------------------------------------------------------------------- Mienfoo / Mienshao: the top ranked cards retrigger
await sec('mienfoo', () => {
  start('MIEN');
  const m = add('j_poke_mienfoo');
  let t = play(['S_9', 'H_9', 'D_4', 'C_4']);
  ok(t.chips === 20 + 9 + 9 + 4 + 4 + 9, 'Mienfoo: Two Pair 9s and 4s: the leftmost 9 retriggers (+9)', t.total);
  t = play(['S_K', 'H_A', 'D_A']);
  ok(t.chips === 10 + 11 + 11 + 11, 'Aces high: a Pair of Aces, the leftmost Ace retriggers', t.total);
  t = play([['S_5', 'm_stone'], 'H_3', 'D_3']);
  ok(t.chips === 10 + 50 + 3 + 3 + 3, 'a Stone card is never the target (no rank): a 3 retriggers', t.total);
  rounds(5); ok(key(m) === 'j_poke_mienshao', 'Mienfoo -> Mienshao after 5 rounds', key(m));
  t = play(['S_9', 'H_9', 'D_4', 'C_4']);
  ok(t.chips === 20 + 9 + 9 + 4 + 4 + 9 + 9, 'Mienshao: the top 2 (both 9s) retrigger', t.total);
  t = play(['S_K', 'H_K', 'D_K', 'C_2', 'S_2']);
  ok(t.chips === 40 + 30 + 4 + 20, 'Mienshao, a Full House of Kings: the two leftmost Kings retrigger', t.total);
});

// ------------------------------------------------------------------- Druddigon, Bouffalant, Rufflet / Braviary
await sec('druddigon', () => {
  start('DRUD');
  add('j_poke_druddigon');
  let t = play(['S_K', 'H_K']);
  ok(near(t.mult, 2 * 1.4 * 1.4), 'Druddigon: a Pair of Kings X1.4 each', t.total);
  t = play(['S_Q', 'H_Q']);
  ok(near(t.mult, 2), 'Queens: nothing', t.total);
});
await sec('bouffalant', () => {
  start('BOUF');
  const b = add('j_poke_bouffalant');
  endRound(); // won with the round's first hand
  ok(near(ex(b).charge_Xmult, 1.5), 'a Blind beaten with the first hand: X1.5', ex(b).charge_Xmult);
  advance();
  play(['S_3']);
  endRound(); // the second hand wins
  ok(near(ex(b).charge_Xmult, 1.5), 'beaten with the 2nd hand: no gain', ex(b).charge_Xmult);
  for (let i = 0; i < 6; i++) { advance(); endRound(); }
  ok(near(ex(b).charge_Xmult, 4), 'capped at X4', ex(b).charge_Xmult);
  advance();
  const t = play(['S_A']);
  ok(near(t.mult, 4), 'it gives the X: X4', t.total);
});
await sec('rufflet', () => {
  start('RUFF');
  const r = add('j_poke_rufflet');
  let t = play(['S_A']);
  ok(near(t.mult, 1), 'Rufflet, the Small Blind: nothing', t.total);
  rounds(5); ok(key(r) === 'j_poke_braviary', 'Rufflet -> Braviary after 5 rounds', key(r));
  bossRound('RUFFB', 'bl_wall', ['j_poke_rufflet']);
  t = play(['S_A']);
  ok(near(t.mult, 1 + 10), 'a Boss Blind: +10', t.total);
  bossRound('BRAVB', 'bl_wall', ['j_poke_braviary']);
  t = play(['S_A']);
  ok(near(t.mult, 2), 'Braviary: X2 during a Boss Blind', t.total);
  start('BRAVS');
  add('j_poke_braviary');
  t = play(['S_A']);
  ok(near(t.mult, 1), 'not a Boss: nothing', t.total);
});

// ------------------------------------------------------------------- Heatmor + Durant: the rivals
await sec('rivals', () => {
  start('HEAT');
  const h = add('j_poke_heatmor');
  discard(cards(['S_2'])); discard(cards(['S_3']));
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 8), 'Heatmor: 2 discards used this round: +8', t.total);
  endRound();
  ok(near(ex(h).ant_Xmult, 1), 'alone: nothing banked at end of round', ex(h).ant_Xmult);
  advance();
  const d = add('j_poke_durant');
  endRound();
  ok(near(ex(h).ant_Xmult, 1.1), 'with Durant: X0.1 banked at end of round (X1.1)', ex(h).ant_Xmult);
  advance(); endRound();
  ok(near(ex(h).ant_Xmult, 1.2), 'two rounds: X1.2', ex(h).ant_Xmult);
  ok(/active/.test(plain(h)) && /active/.test(plain(d)), 'both tooltips: the pair is active', [plain(h), plain(d)]);
  advance();
  debuff(d); endRound();
  ok(near(ex(h).ant_Xmult, 1.2), 'a debuffed Durant: no growth', ex(h).ant_Xmult);
  advance();
  sell(d);
  t = play(['S_A']);
  ok(near(t.mult, 1.2), 'Durant sold: Heatmor keeps giving its banked X1.2 (0 discards: +0)', t.total);
  endRound();
  ok(near(ex(h).ant_Xmult, 1.2), '... and banks no more', ex(h).ant_Xmult);
  // Blueprint copies the X, never the bank
  start('HEATBP');
  add('j_blueprint'); const h2 = add('j_poke_heatmor'); add('j_poke_durant');
  endRound();
  ok(near(ex(h2).ant_Xmult, 1.1), 'Blueprint doesn\'t bank twice', ex(h2).ant_Xmult);
});

// ------------------------------------------------------------------- Larvesta / Volcarona: the sun
/** Select the Blind with `red` red cards and `clubs` Clubs already in hand, so the first deal draws the rest (the forecast reads them). */
function dealWith(seed, jokers, held) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k));
  clearHand();
  cards(held);
  act({ type: 'select_blind' }); flush();
  return js;
}
await sec('sun', () => {
  // Larvesta: doubled while sunny (a red first deal), else +5
  let [l] = dealWith('LARV1', ['j_poke_larvesta'], ['H_2', 'H_3', 'H_4', 'D_5', 'D_6', 'D_7', 'H_8']);
  ok(DES.cherrim_sunny(l), 'a red first deal: sunny for Larvesta');
  let t = play(['S_A']);
  ok(near(t.mult, 1 + 10), 'Larvesta, sunny: +10 (5 doubled)', t.total);
  [l] = dealWith('LARV2', ['j_poke_larvesta'], ['C_2', 'C_3', 'C_4', 'C_5', 'C_6', 'C_7', 'C_8']);
  ok(!DES.cherrim_sunny(l), 'a Clubs deal: not sunny');
  t = play(['S_A']);
  ok(near(t.mult, 1 + 5), 'Larvesta, not sunny: +5', t.total);
  ok(/Not sunny/.test(plain(l)), 'the tooltip: Not sunny', plain(l));
  // Volcarona: always sunny — Larvesta, Cherrim, Castform
  const [l2, v, ch, cf] = dealWith('VOLC1', ['j_poke_larvesta', 'j_poke_volcarona', 'j_poke_cherrim', 'j_poke_castform'], ['C_2', 'C_3', 'C_4', 'C_5', 'C_6', 'C_7', 'C_8']);
  ok(DES.cherrim_sunny(l2) && DES.cherrim_sunny(ch), 'a Clubs deal with Volcarona: sunny for Larvesta and Cherrim');
  ok(ex(cf).form === 'sunny' && ex(cf).ptype === 'Fire', 'Castform takes its Sunny form (Fire) on a Clubs deal', [ex(cf).form, ex(cf).ptype]);
  ok(JSON.stringify(drawn(ch)[1]) === JSON.stringify(ANIM.CHERRIM_SPRITES.sunshine), 'Cherrim shows its Sunshine card', drawn(ch));
  // the Flower card with Cherrim in the sun: X2.5 instead of X2
  t = play(['S_A']);
  // Larvesta +10 (sunny), then Volcarona X1.25 for each Fire Joker: Larvesta, Volcarona, Castform (Sunny: Fire)
  ok(near(t.mult, (1 + 10) * Math.pow(1.25, 3)), 'Larvesta +10 in the sun; Volcarona X1.25 for each of the 3 Fire Jokers (Larvesta, itself, Sunny Castform)', t.total);
  sell(v);
  ok(!DES.cherrim_sunny(l2), 'Volcarona sold: no sun (live)');
  // Kyogre: Volcarona doesn't override its rain
  const [, , cf2, ty] = dealWith('VOLC2', ['j_poke_kyogre', 'j_poke_volcarona', 'j_poke_castform', 'j_poke_tympole'], ['H_2', 'H_3', 'H_4', 'H_5', 'H_6', 'H_7', 'H_8']);
  ok(ex(cf2).form === 'rainy', 'Kyogre + Volcarona: Castform stays Rainy (Kyogre\'s lock wins)', ex(cf2).form);
  ok(DES.swift_swim_raining(ty) && DES.cherrim_sunny(ty), 'and it is both raining (Tympole) and sunny (the shared check)');
  // Volcarona's X for each Fire Joker, itself included; a Fire Tera counts
  start('VOLC3');
  add('j_poke_volcarona');
  t = play(['S_A']);
  ok(near(t.mult, 1.25), 'Volcarona alone: X1.25 (itself)', t.total);
  const jk = add('j_joker'); apply_type_sticker(jk, 'Fire'); flush();
  t = play(['S_A']);
  ok(near(t.mult, (1 * 1.25 + 4) * 1.25), 'a Fire Tera Joker: its +4, then X1.25 for it too', t.total);
  start('LARVEVO');
  const e = add('j_poke_larvesta');
  rounds(5); ok(key(e) === 'j_poke_volcarona', 'Larvesta -> Volcarona after 5 rounds', key(e));
});

// ------------------------------------------------------------------- Energy numbers
await sec('energy', () => {
  const r3 = (x) => Math.round(x * 10000) / 10000;
  const steps = (n, field, type, want) => {
    start('EN' + n + field);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r3(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  steps('ducklett', 'chips', 'Water', [52, 64, 76]);
  steps('swanna', 'Xmult', 'Water', [2.4, 2.8, 3.2]);
  steps('deerling', 'mult', 'Grass', [4.2, 5.4, 6.6]);
  steps('sawsbuck', 'Xmult_multi', 'Grass', [1.26, 1.32, 1.38]);
  const em = steps('emolga', 'mult', 'Lightning', [2.8, 3.6, 4.4]);
  ok(ex(em).static_money === 1, 'Emolga\'s $1 stays', ex(em).static_money);
  steps('karrablast', 'mult', 'Grass', [8.4, 10.8, 13.2]);
  steps('shelmet', 'chips', 'Grass', [52, 64, 76]);
  const es = steps('escavalier', 'Xmult', 'Grass', [1.8, 2.1, 2.4]);
  ok(ex(es).steel_x === 1.75, 'Escavalier\'s Steel X1.75 stays fixed', ex(es).steel_x);
  steps('accelgor', 'mult', 'Grass', [5.6, 7.2, 8.8]);
  steps('joltik', 'mult', 'Lightning', [4.2, 5.4, 6.6]);
  steps('galvantula', 'Xmult_multi', 'Lightning', [1.26, 1.32, 1.38]);
  steps('tynamo', 'mult', 'Lightning', [1.4, 1.8, 2.2]);
  steps('eelektrik', 'mult', 'Lightning', [4.2, 5.4, 6.6]);
  steps('eelektross', 'Xmult', 'Lightning', [1.8, 2.1, 2.4]);
  steps('eelektross', 'Xmult_mod', 'Lightning', [0.12, 0.14, 0.16]);
  steps('cubchoo', 'chips', 'Water', [26, 32, 38]);
  const be = steps('beartic', 'Xmult_multi', 'Water', [1.575, 1.65, 1.725]);
  const [k] = winHolding(['S_2'], ['H_K']);
  nextBlind();
  let t = play(['S_A'], { clear: false });
  ok(near(t.mult, 1.725), 'energized Beartic: the frozen card X1.725', t.total);
  void be;
  steps('druddigon', 'Xmult_multi', 'Dragon', [1.47, 1.54, 1.61]);
  const bo = steps('bouffalant', 'Xmult_mod', 'Colorless', [0.6, 0.7, 0.8]);
  ok(ex(bo).Xmult_cap === 4 && ex(bo).charge_Xmult === 1, 'Bouffalant: the X4 cap fixed, the bank untouched', ex(bo));
  steps('rufflet', 'mult', 'Colorless', [14, 18, 22]);
  steps('braviary', 'Xmult', 'Colorless', [2.4, 2.8, 3.2]);
  steps('heatmor', 'mult', 'Fire', [5.6, 7.2, 8.8]);
  steps('heatmor', 'Xmult_mod', 'Fire', [0.12, 0.14, 0.16]);
  const du = steps('durant', 'Xmult_multi', 'Metal', [1.8375, 1.925, 2.0125]);
  t = play(['S_A'], { held: [['H_K', 'm_steel']] });
  ok(near(t.mult, 2.0125), 'energized Durant: held Steel X2.0125', t.total);
  void du;
  const la = steps('larvesta', 'mult', 'Fire', [7, 9, 11]);
  add('j_poke_volcarona');
  t = play(['S_A']);
  ok(near(t.mult, (1 + 22) * 1.25 * 1.25), 'energized Larvesta in Volcarona\'s sun: +22 (11 doubled), then X1.25 twice', t.total);
  void la;
  steps('volcarona', 'Xmult_multi', 'Fire', [1.3125, 1.375, 1.4375]);
  // the bank keeps its worth: Heatmor X1.1 banked, then energized: +0.12
  start('ENBANK');
  const h = add('j_poke_heatmor'); add('j_poke_durant');
  endRound(); advance();
  increment_energy(h, 'Fire');
  endRound();
  ok(near(ex(h).ant_Xmult, 1.22), 'Heatmor: X0.1 banked, then energized: +0.12 (X1.22; the first 0.1 not raised)', ex(h).ant_Xmult);
  // Energy carries through the trade evolution
  start('ENTRADE');
  const kk = add('j_poke_karrablast'), ss = add('j_poke_shelmet');
  increment_energy(kk, 'Grass');
  rounds(4);
  ok(key(kk) === 'j_poke_escavalier' && ex(kk).energy_count === 1 && near(ex(kk).Xmult, 1.8), 'Karrablast\'s Energy is re-applied to Escavalier: X1.8', [key(kk), ex(kk).Xmult]);
  void ss;
});

// ------------------------------------------------------------------- the art: real cells (the four seasons)
if (ART) {
  await sec('art cells', async () => {
    const ATL = MODS.pokermon.content.atlases;
    const file = (atlas) => path.join(ART, decodeURIComponent(ATL[atlas].src).replace(/^.*\/assets\/2x\//, ''));
    start('DEERPX');
    const cases = [];
    for (const n of ['deerling', 'sawsbuck']) {
      const j = add('j_poke_' + n);
      for (const [i, season] of DES.SEASON_ORDER.entries()) for (const sh of [false, true]) { G.GAME.round_resets.ante = i + 1; const [atlas, pos] = drawn(j, sh); cases.push({ n, season, sh, atlas, pos }); }
    }
    const byFile = {};
    cases.forEach((c, i) => { (byFile[file(c.atlas)] || (byFile[file(c.atlas)] = {}))[i] = [c.pos.x * 142 + 20, c.pos.y * 190 + 40, 102, 100]; });
    const px = {};
    for (const [f, rects] of Object.entries(byFile)) Object.assign(px, await crops(f, rects));
    // each season's art: Spring pink blossoms, Summer green leaves, Autumn orange leaves, Winter white snow (a hue count in the art window)
    const count = (r, test) => { let n = 0; for (let i = 0; i < r.px.length; i += 4) if (r.px[i + 3] && test(r.px[i], r.px[i + 1], r.px[i + 2])) n++; return n; };
    const pink = (R, Gc, B) => R > 200 && B > 140 && Gc < 170 && R - Gc > 50;
    const orange = (R, Gc, B) => R > 190 && Gc > 90 && Gc < 170 && B < 90;
    const white = (R, Gc, B) => R > 215 && Gc > 215 && B > 215;
    const green = (R, Gc, B) => Gc > 110 && Gc - R > 30 && Gc - B > 30;
    const got = cases.map((c, i) => ({ c: c.n + ' ' + c.season + (c.sh ? ' shiny' : ''), inside: px[i].inside, pink: count(px[i], pink), green: count(px[i], green), orange: count(px[i], orange), white: count(px[i], white) }));
    const by = (n, s, sh) => got.find((g) => g.c === n + ' ' + s + (sh ? ' shiny' : ''));
    for (const n of ['deerling', 'sawsbuck']) {
      const sp = by(n, 'spring', false), au = by(n, 'autumn', false), wi = by(n, 'winter', false), su = by(n, 'summer', false);
      ok(sp.pink > au.pink && sp.pink > wi.pink && sp.pink > su.pink, `${n}: Spring's card has the most pink (blossoms)`, [sp, su, au, wi]);
      ok(su.green > au.green && su.green > wi.green, `${n}: Summer's card is greener than Autumn's and Winter's (leaves)`, [sp, su, au, wi]);
      ok(au.orange > su.orange && au.orange > wi.orange, `${n}: Autumn's card is more orange than Summer's and Winter's`, [sp, su, au, wi]);
      ok(wi.white > sp.white && wi.white > su.white && wi.white > au.white, `${n}: Winter's card has the most white (snow)`, [sp, su, au, wi]);
    }
    ok(got.every((g) => g.inside), 'every cell is inside its sheet (normal and Shiny)', got.filter((g) => !g.inside));
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const types = [[4, 1], [6, 1], [8, 1], [0, 2], [2, 2], [4, 2]].map(([x, y]) => (typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen05', pos: [x, y] }) || {}).ptype);
    ok(types.every((t) => t === 'Grass'), 'every season\'s cell shows the Grass icon', types);
  });
} else console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');

done();
