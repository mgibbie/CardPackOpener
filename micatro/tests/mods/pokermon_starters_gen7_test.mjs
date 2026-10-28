// The Gen 7 starters (2026-10-28, the owner's "build" of the Gen 5-9 starters spec; jokers/pokejokers_designs.js "the Gen 7 starters";
// PORTING.md "The Gen 7 starters"). Pokermon's starter rules: the type perk at every stage (Grass +1 hand size, Fire +1 discard, Water
// +1 hand), Basic Uncommon $5 'starter' (the Starter Pack), Stage 1 Safari $8, Stage 2 Safari $10, evolving after 5 then 5 rounds.
//   Rowlet 722 / Dartrix 723 / Decidueye 724 (Grass)   the RIGHTMOST scored card retriggers 1 / 2 / 2 times; Decidueye's Spirit
//                                                      Shackle: it also gives X1.3 each time it scores (X1.3^3 with both retriggers)
//   Litten 725 / Torracat 726 / Incineroar 727 (Fire)   +2 / +4 Mult, X(1 + 0.25), per hand already played this round (hands BEFORE
//                                                      this one: the round's first hand gives nothing)
//   Popplio 728 / Brionne 729 / Primarina 730 (Water)   scored Hearts +3 / +5 Mult; Primarina's Sparkling Aria X1.2
//   Energy: Rowlet line Xmult_multi +5% (Rowlet / Dartrix carry it for Decidueye), Litten line mult +40% / Xmult_mod +20%, Popplio line
//   mult +40% / Xmult_multi +5%; the perks and the retrigger counts are fixed.
// Every effect is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_starters_gen7_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { Card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = { Grass: ['rowlet', 'dartrix', 'decidueye'], Fire: ['litten', 'torracat', 'incineroar'], Water: ['popplio', 'brionne', 'primarina'] };
const ALL = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
/** Play exactly these cards (in hand order: the first is the leftmost); -> the hand total. */
const play2 = (keys, opts) => { clearHand(); return play(hand(keys, opts)).total; };
// A Flush of Hearts, leftmost the 2, rightmost the 3: Flush 35 Chips x 4; the cards 2 + 5 + 9 + 10 + 3 = 29.
const FLUSH = ['H_2', 'H_5', 'H_9', 'H_K', 'H_3'];
const FLUSH_CHIPS = 35 + 29;
/** Win the round in progress with a High Card 2 (landing in ROUND_EVAL). */
function endRound() { clearHand(); G.GAME.chips = G.GAME.blind.chips; play(hand(['S_2']), { keepChips: true }); flush(); }
/** Cash out, leave the shop, select the next blind (a harmless Boss), empty hand. */
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** n whole rounds (won, then the next blind selected). */
function rounds(n) { for (let i = 0; i < n; i++) { endRound(); advance(); } }

// ------------------------------------------------------------------- pin, static data, order, families, precedence, energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 47 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 47+', PINS.modPin('pokermon'));
  for (const n of ALL) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const re = new RegExp(ALL.join('|'), 'i');
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the nine (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('ST7S');
  let x = 2;
  for (const [t, line] of Object.entries(LINES)) {
    line.forEach((n, i) => {
      const c = P_CENTERS['j_poke_' + n];
      const [r, cost, stage] = [[2, 5, 'Basic'], ['poke_safari', 8, 'One'], ['poke_safari', 10, 'Two']][i];
      ok(c.rarity === r && c.cost === cost && c.stage === stage && c.ptype === t && c.gen === 7 && c.blueprint_compat && c.attributes.includes('starter'),
        n + ': ' + [r, '$' + cost, stage, t, 'Gen 7', 'starter attribute'].join(' / '), [c.rarity, c.cost, c.stage, c.ptype, c.gen, c.attributes]);
      ok(!!c.starter === (i === 0), n + (i === 0 ? ': the Basic is a Starter Pack starter' : ': not a Starter Pack starter'), c.starter);
      ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === 48, n + ': upstream 3.9.1 cell Natdex {' + x + ',48} (nothing to deploy)', [c.atlas, c.pos]);
      const E = c.config.extra;
      const perk = { Grass: E.h_size, Fire: E.d_size, Water: E.hands }[t];
      ok(perk === 1, n + ': its type perk (+1 ' + { Grass: 'hand size', Fire: 'discard', Water: 'hand' }[t] + ')', E);
      ok(i === 2 ? !('rounds' in E) : E.rounds === 5, n + (i === 2 ? ': the last stage' : ': evolves after 5 rounds'), E.rounds);
      x += 2;
    });
  }
  const E = (n) => P_CENTERS['j_poke_' + n].config.extra;
  ok(E('rowlet').retriggers === 1 && E('dartrix').retriggers === 2 && E('decidueye').retriggers === 2 && E('decidueye').Xmult_multi === 1.3
    && E('rowlet').Xmult_multi === 1.3 && E('dartrix').Xmult_multi === 1.3, 'Rowlet line: 1 / 2 / 2 retriggers, X1.3 (carried by the first two for Energy)');
  ok(E('litten').mult === 2 && E('torracat').mult === 4 && E('incineroar').Xmult_mod === 0.25, 'Litten line: +2 / +4 Mult, X0.25 per hand');
  ok(E('popplio').mult === 3 && E('brionne').mult === 5 && E('primarina').Xmult_multi === 1.2, 'Popplio line: +3 / +5 Mult, X1.2 per Heart');
  ok(near(energy_values.Xmult_multi, 0.05) && near(energy_values.mult, 0.4) && near(energy_values.Xmult_mod, 0.2)
    && !['retriggers', 'h_size', 'd_size', 'hands', 'rounds'].some((f) => f in energy_values), 'Energy fields: Xmult_multi +5%, mult +40%, Xmult_mod +20%; the perks, retriggers and rounds fixed');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const i = keys.indexOf('j_poke_rowlet');
  ok(i > 0 && keys[i - 1] === 'j_poke_xerneas' && ALL.every((n, k) => keys[i + k] === 'j_poke_' + n) && keys[i + 9] === 'j_poke_grubbin',
    'Pokédex order: Xerneas (716), Rowlet ... Primarina (722-730), then Grubbin (736)', keys.slice(i - 1, i + 10));
  // the families: owning any stage keeps the other two out of the pools (poke_family_present)
  G.GAME.used_jokers.j_poke_dartrix = true;
  ok(!starter_lists().grass.includes('j_poke_rowlet'), 'family: with a Dartrix owned, Rowlet is out of the Starter Pack (one family)');
  delete G.GAME.used_jokers.j_poke_dartrix;
});

// ------------------------------------------------------------------- the type perks, kept through both evolutions
await sec('perks', () => {
  start('ST7P1');
  const h0 = G.hand.config.card_limit;
  const r = add('j_poke_rowlet');
  ok(G.hand.config.card_limit === h0 + 1, 'Rowlet: +1 hand size', [h0, G.hand.config.card_limit]);
  start('ST7P2');
  const d0 = G.GAME.current_round.discards_left, rd0 = G.GAME.round_resets.discards;
  const l = add('j_poke_litten');
  ok(G.GAME.current_round.discards_left === d0 + 1 && G.GAME.round_resets.discards === rd0 + 1, 'Litten: +1 discard (now and each round)', [d0, G.GAME.current_round.discards_left]);
  start('ST7P3');
  const n0 = G.GAME.current_round.hands_left, rh0 = G.GAME.round_resets.hands;
  const p = add('j_poke_popplio');
  ok(G.GAME.current_round.hands_left === n0 + 1 && G.GAME.round_resets.hands === rh0 + 1, 'Popplio: +1 hand (now and each round)', [n0, G.GAME.current_round.hands_left]);
  // each line through both evolutions: the perk stays exactly +1 (the old stage's is taken back, the new one's given)
  for (const [t, line] of Object.entries(LINES)) {
    start('ST7PE' + t);
    const base = { Grass: () => G.hand.config.card_limit, Fire: () => G.GAME.round_resets.discards, Water: () => G.GAME.round_resets.hands }[t];
    const b0 = base();
    const j = add('j_poke_' + line[0]);
    for (let r2 = 1; r2 <= 4; r2++) { endRound(); advance(); }
    ok(key(j) === 'j_poke_' + line[0] && ex(j).rounds === 1, line[0] + ': still itself after 4 rounds (1 left)', [key(j), ex(j).rounds]);
    endRound();
    ok(key(j) === 'j_poke_' + line[1] && ex(j).rounds === 5, line[0] + ' evolves into ' + line[1] + ' after 5 rounds (5 more)', [key(j), ex(j).rounds]);
    ok(base() === b0 + 1, line[1] + ': the perk is still +1', [b0, base()]);
    advance();
    rounds(4);
    endRound();
    ok(key(j) === 'j_poke_' + line[2], line[1] + ' evolves into ' + line[2] + ' after 5 more rounds', key(j));
    ok(base() === b0 + 1, line[2] + ': the perk is still +1', [b0, base()]);
    advance();
    j.remove(); flush();
    ok(base() === b0, line[2] + ' gone: the perk is taken back', [b0, base()]);
  }
});

// ------------------------------------------------------------------- Rowlet line: the rightmost scored card
await sec('rowlet line', () => {
  start('ST7R1');
  const r = add('j_poke_rowlet');
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 3 && near(t.mult, 4), 'Rowlet: the rightmost (the 3) retriggers once: 64 + 3', t);
  t = play2(['S_K']);
  ok(t.chips === 5 + 10 + 10 && near(t.mult, 1), 'a 1-card hand: its card is the rightmost (+10)', t);
  t = play2(['S_4', 'H_9', 'D_K', 'C_5', 'S_7']);
  ok(t.chips === 5 + 10 + 10 && near(t.mult, 1), 'High Card: the rightmost SCORED card (the King, the only one scored), not the rightmost played', t);
  clearHand();
  const cs = hand(FLUSH);
  debuff(cs[4]);
  t = play(cs).total;
  ok(t.chips === FLUSH_CHIPS - 3 && near(t.mult, 4), 'a debuffed rightmost card scores nothing and the end never shifts inward (no retrigger on the K)', t);
  r.remove(); flush();
  start('ST7R2');
  add('j_poke_dartrix');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 6 && near(t.mult, 4), 'Dartrix: the rightmost retriggers twice: 64 + 3 + 3', t);
  start('ST7R3');
  const d = add('j_poke_decidueye');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 6 && near(t.mult, 4 * Math.pow(1.3, 3)), 'Decidueye: twice, and X1.3 each time it scores: X4 x 1.3^3 = X8.788', t);
  t = play2(['H_5', 'S_5']);
  ok(t.chips === 10 + 10 + 10 && near(t.mult, 2 * Math.pow(1.3, 3)), 'Decidueye, a Pair: the right 5 retriggers twice with X1.3 each (30 x 4.394)', t);
  ok(/Spirit Shackle: retrigger the \| rightmost scored card 2 times; \| it gives X1\.3 Mult/.test(plain(d)) && /X2\.197 in all/.test(plain(d)), 'Decidueye tooltip: Spirit Shackle, X1.3, X2.197 in all', plain(d));
  // a Blueprint copies the retrigger (and Decidueye's X)
  start('ST7R4');
  add('j_poke_rowlet');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 6, 'a Blueprint copying Rowlet: the rightmost retriggers twice', t);
});

// ------------------------------------------------------------------- Litten line: hands already played this round
await sec('litten line', () => {
  start('ST7L1');
  const l = add('j_poke_litten');
  ok(/Currently \+0 Mult/.test(plain(l)), 'Litten before any hand: currently +0', plain(l));
  let t = play2(['S_2']);
  ok(t.chips === 7 && near(t.mult, 1), 'hand 1 (none before it): nothing', t);
  ok(/Currently \+2 Mult/.test(plain(l)), 'after one hand: currently +2', plain(l));
  t = play2(['S_2']);
  ok(near(t.mult, 1 + 2), 'hand 2: +2 Mult (1 hand before)', t);
  t = play2(['S_2']);
  ok(near(t.mult, 1 + 4), 'hand 3: +4 Mult', t);
  discardOne();
  t = play2(['S_2']);
  ok(near(t.mult, 1 + 6), 'hand 4: +6 Mult (a discard in between counts nothing)', t);
  endRound(); advance();
  t = play2(['S_2']);
  ok(near(t.mult, 1), 'a new round: its first hand gives nothing again (the count is per round)', t);
  start('ST7L2');
  add('j_poke_torracat');
  const got = [];
  for (let n = 0; n < 4; n++) got.push(play2(['S_2']).mult);
  ok(got.every((m, n) => near(m, 1 + 4 * n)), 'Torracat: +0 / +4 / +8 / +12 Mult on hands 1-4', got);
  start('ST7L3');
  const inc = add('j_poke_incineroar');
  const gx = [];
  for (let n = 0; n < 4; n++) gx.push(play2(['S_5', 'H_5']).mult);
  ok(gx.every((m, n) => near(m, 2 * (1 + 0.25 * n))), 'Incineroar, Pairs: X1 / X1.25 / X1.5 / X1.75 on hands 1-4', gx);
  ok(/Currently X1\.75 Mult/.test(plain(inc)) === false && /Currently X2 Mult/.test(plain(inc)), 'Incineroar tooltip after 4 hands: currently X2 (for the next)', plain(inc));
});
function discardOne() {
  clearHand();
  const c = hand(['D_9']);
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'discard' }); flush();
}

// ------------------------------------------------------------------- Popplio line: scored Hearts
await sec('popplio line', () => {
  start('ST7W1');
  add('j_poke_popplio');
  let t = play2(['H_5', 'S_5']);
  ok(t.chips === 20 && near(t.mult, 2 + 3), 'Popplio, a Pair (one Heart): +3', t);
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS && near(t.mult, 4 + 15), 'a Flush of Hearts: +3 x 5', t);
  t = play2(['S_7', 'S_K']);
  ok(near(t.mult, 1), 'High Card K of Spades (the 7 does not score): nothing', t);
  t = play2(['S_9', 'C_9'], { center: 'm_wild' });
  ok(near(t.mult, 2 + 6), 'Wild cards count as Hearts: +3 each', t);
  start('ST7W2');
  add('j_poke_brionne');
  t = play2(FLUSH);
  ok(near(t.mult, 4 + 25), 'Brionne: +5 x 5', t);
  start('ST7W3');
  add('j_poke_primarina');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS && near(t.mult, 4 * Math.pow(1.2, 5)), 'Primarina, Sparkling Aria: X1.2 x 5 Hearts', t);
  t = play2(['H_5', 'S_5']);
  ok(near(t.mult, 2 * 1.2), 'a Pair with one Heart: X1.2 once', t);
  // retriggered Hearts score again (Rowlet on the right Heart)
  add('j_poke_rowlet');
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 3 && near(t.mult, 4 * Math.pow(1.2, 6)), 'with Rowlet: the rightmost Heart scores twice, X1.2 six times', t);
});

// ------------------------------------------------------------------- Energy: standard shares; perks / retriggers fixed; carried
await sec('energy', () => {
  start('ST7E1');
  const r = add('j_poke_rowlet');
  const got = [];
  for (let n = 0; n < 3; n++) { increment_energy(r, 'Grass'); got.push(ex(r).Xmult_multi); }
  ok(got.every((v, n) => near(v, 1.3 + 0.065 * (n + 1))) && ex(r).retriggers === 1 && ex(r).h_size === 1, 'Rowlet + Grass Energy: X1.365 / X1.43 / X1.495 (for Decidueye); retrigger and hand size fixed', [got, ex(r)]);
  let t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 3 && near(t.mult, 4), 'an energized Rowlet still only retriggers (no X of its own)', t);
  ok(/Energy carries to Decidueye/.test(plain(r)), 'its tooltip says the Energy carries to Decidueye', plain(r));
  rounds(10);
  ok(key(r) === 'j_poke_decidueye' && ex(r).energy_count === 3 && near(ex(r).Xmult_multi, 1.495) && ex(r).retriggers === 2, 'a 3-Energy Rowlet becomes a 3-Energy Decidueye: X1.495, 2 retriggers', ex(r));
  t = play2(FLUSH);
  ok(t.chips === FLUSH_CHIPS + 6 && near(t.mult, 4 * Math.pow(1.495, 3)), 'energized Spirit Shackle: X1.495 three times', t);

  start('ST7E2');
  const l = add('j_poke_litten');
  const lm = [];
  for (let n = 0; n < 3; n++) { increment_energy(l, 'Fire'); lm.push(ex(l).mult); }
  ok(lm.every((v, n) => near(v, 2 + 0.8 * (n + 1))) && ex(l).d_size === 1, 'Litten + Fire Energy: +2.8 / +3.6 / +4.4 a hand; the discard fixed', [lm, ex(l).d_size]);
  play2(['S_2']); play2(['S_2']);
  t = play2(['S_2']);
  ok(near(t.mult, 1 + 2 * 4.4), '3 Energy, hand 3: +8.8 Mult', t);
  start('ST7E3');
  const l2 = add('j_poke_litten');
  increment_energy(l2, 'Fire');
  rounds(5);
  ok(key(l2) === 'j_poke_torracat' && ex(l2).energy_count === 1 && near(ex(l2).mult, 5.6), 'a 1-Energy Litten becomes a 1-Energy Torracat: +5.6 a hand', ex(l2));
  rounds(5);
  ok(key(l2) === 'j_poke_incineroar' && ex(l2).energy_count === 1 && near(ex(l2).Xmult_mod, 0.3) && ex(l2).d_size === 1, '... and a 1-Energy Incineroar: X0.3 a hand', ex(l2));
  play2(['S_2']);
  t = play2(['S_2']);
  ok(near(t.mult, 1.3), 'energized Incineroar, hand 2: X1.3', t);

  start('ST7E4');
  const p = add('j_poke_popplio');
  const pm = [];
  for (let n = 0; n < 3; n++) { increment_energy(p, 'Water'); pm.push(ex(p).mult); }
  ok(pm.every((v, n) => near(v, 3 + 1.2 * (n + 1))) && ex(p).hands === 1, 'Popplio + Water Energy: +4.2 / +5.4 / +6.6 a Heart; the hand fixed', [pm, ex(p).hands]);
  t = play2(FLUSH);
  ok(near(t.mult, 4 + 5 * 6.6), '3 Energy: +6.6 x 5 Hearts', t);
  start('ST7E5');
  const b = add('j_poke_brionne');
  increment_energy(b, 'Water');
  ok(near(ex(b).mult, 7), 'Brionne + 1 Water Energy: +7', ex(b).mult);
  rounds(5);
  ok(key(b) === 'j_poke_primarina' && near(ex(b).Xmult_multi, 1.26) && ex(b).hands === 1, 'a 1-Energy Brionne becomes a 1-Energy Primarina: X1.26 a Heart', ex(b));
  t = play2(FLUSH);
  ok(near(t.mult, 4 * Math.pow(1.26, 5)), 'energized Sparkling Aria: X1.26 x 5', t);
  start('ST7E6');
  const inc = add('j_poke_incineroar');
  for (let n = 0; n < 3; n++) increment_energy(inc, 'Fire');
  ok(near(ex(inc).Xmult_mod, 0.4), 'Incineroar + 3 Fire Energy: X0.4 a hand', ex(inc).Xmult_mod);
  const dec = add('j_poke_decidueye');
  for (let n = 0; n < 3; n++) increment_energy(dec, 'Grass');
  ok(near(ex(dec).Xmult_multi, 1.495) && ex(dec).retriggers === 2, 'Decidueye + 3 Grass Energy: X1.495, still 2 retriggers', ex(dec));
});

// ------------------------------------------------------------------- the Starter Pack
await sec('starter pack', () => {
  start('ST7SP');
  const L = starter_lists();
  ok(L.grass.includes('j_poke_rowlet') && L.fire.includes('j_poke_litten') && L.water.includes('j_poke_popplio'), 'Rowlet / Litten / Popplio are Starter Pack candidates (Grass / Fire / Water)', L);
  ok(!['dartrix', 'decidueye'].some((n) => L.grass.includes('j_poke_' + n)) && !['torracat', 'incineroar'].some((n) => L.fire.includes('j_poke_' + n))
    && !['brionne', 'primarina'].some((n) => L.water.includes('j_poke_' + n)), 'their evolutions are not');
  // every OTHER starter family already owned: the pack's three typed slots can only be the Gen 7 Basics (whatever the seed)
  for (const k of [...L.grass, ...L.fire, ...L.water]) if (!['j_poke_rowlet', 'j_poke_litten', 'j_poke_popplio'].includes(k)) G.GAME.used_jokers[k] = true;
  const L2 = starter_lists();
  ok(L2.grass.join() === 'j_poke_rowlet' && L2.fire.join() === 'j_poke_litten' && L2.water.join() === 'j_poke_popplio', 'with the other starters owned, only the Gen 7 three remain', L2);
  G.GAME.chips = G.GAME.blind.chips; play(hand(['S_2']), { keepChips: true }); flush();
  act({ type: 'cash_out' }); flush();
  const pack = new Card(P_CARDS.empty, P_CENTERS.p_poke_pokepack_starter_pack);
  G.shop_booster.emplace(pack);
  G.GAME.dollars = 2000;
  ok(act({ type: 'buy', id: pack.sort_id }).ok && G.STATE === STATES.MOD_PACK, 'a Starter Pack opens');
  const ks = G.pack_cards.cards.map(key);
  ok(ks[0] === 'j_poke_rowlet' && ks[1] === 'j_poke_litten' && ks[2] === 'j_poke_popplio', 'its Grass / Fire / Water slots: Rowlet, Litten, Popplio', ks);
  ok(act({ type: 'use', id: G.pack_cards.cards[2].sort_id }).ok && G.jokers.cards.some((j) => key(j) === 'j_poke_popplio'), 'picked: Popplio joins the jokers');
});

// ------------------------------------------------------------------- the text
await sec('text', () => {
  start('ST7T');
  const want = {
    rowlet: /\+1 hand size \| Retrigger the rightmost \| scored card \| \(Energy carries to Decidueye\) \| \(Evolves after 5 rounds\)/,
    dartrix: /\+1 hand size \| Retrigger the rightmost \| scored card 2 times/,
    decidueye: /\+1 hand size .*Spirit Shackle/,
    litten: /\+1 discard each round \| \+2 Mult for each hand \| already played this round \| \(Currently \+0 Mult\) \| \(Evolves after 5 rounds\)/,
    torracat: /\+4 Mult for each hand/,
    incineroar: /\+1 discard each round \| X1 Mult, plus X0\.25 for \| each hand already played \| this round \| \(Currently X1 Mult\)/,
    popplio: /\+1 hand each round \| Scored Hearts give \| \+3 Mult \| \(Evolves after 5 rounds\)/,
    brionne: /\+5 Mult/,
    primarina: /\+1 hand each round .*Sparkling Aria: scored \| Hearts give X1\.2 Mult/,
  };
  for (const [n, re] of Object.entries(want)) {
    const j = add('j_poke_' + n);
    ok(re.test(plain(j)), n + ': its text', plain(j));
    j.remove(); flush();
  }
});

done();
