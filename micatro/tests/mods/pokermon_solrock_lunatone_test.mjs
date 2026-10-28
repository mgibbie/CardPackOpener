// The owner's Lunatone (337) + Solrock (338) (2026-10-28; jokers/pokejokers_designs.js; PORTING.md "The owner's Lunatone + Solrock"):
//   a pair, like Plusle / Minun. Both Earth (Rock maps to Earth), single-stage, Uncommon $6.
//   Day and night: within each round the 1st, 3rd and 5th hands are DAY, the 2nd and 4th NIGHT (current_round.hands_played
//   before the hand: 0, 2, 4... = day).
//     Solrock, Sunlight:   +100 Chips on day hands.
//     Lunatone, Moonlight: X2 Mult on night hands.
//     Cosmic Power: holding BOTH (each checks for the other; a debuffed partner doesn't count): Solrock also +50 Chips by night,
//     Lunatone also X1.5 by day — every hand gets both. Each copy acts on its own.
//   Energy: chips +30% / Xmult +20% of base; the half values are derived (chips / 2, 1 + (X - 1) / 2), so the ratio holds.
// Every number is FIRED through real played hands (act: highlight + play) with exact totals.
//   node micatro/tests/mods/pokermon_solrock_lunatone_test.mjs
import { T, start, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values, energy_matches } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const hp = () => G.GAME.current_round.hands_played;
/** A run in its first round with these jokers (left to right). */
function setup(seed, jokers) {
  start(seed);
  return jokers.map((k) => add(k));
}
/** Play a Pair of Kings (30 Chips, 2 Mult before jokers) -> the hand total. */
const pairK = () => { clearHand(); return play(hand(['S_K', 'H_K'])).total; };
/** Play `n` hands in a row this round -> [[chips, mult], ...]. */
const series = (n) => Array.from({ length: n }, () => { const t = pairK(); return [t.chips, t.mult]; });
const same = (got, want) => got.length === want.length && got.every((g, i) => g[0] === want[i][0] && near(g[1], want[i][1]));
const tip = (j) => JSON.stringify(describe(j));
const debuff = (j) => { j.ability.debuff_sources = { test: true }; j.set_debuff(); flush(); };

// ------------------------------------------------------------------- pin, static data, order, pool, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 28 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 28+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ['lunatone', 'solrock']) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const addon = ['nacho', 'pokermonplus'].flatMap((m) => (MODS[m] && MODS[m].content && MODS[m].content.centers || [])
    .filter((c) => /lunatone|solrock/i.test((c.name || '') + ' ' + (c.key || ''))).map((c) => c.key));
  ok(addon.length === 0, 'neither Nacho nor Pokermon+ has Lunatone or Solrock', addon);
});
sec('static', () => {
  start('SOLLUNA0');
  for (const [n, x] of [['lunatone', 12], ['solrock', 14]]) {
    const c = C(n);
    ok(c.rarity === 2 && c.cost === 6 && c.stage === 'Basic' && c.ptype === 'Earth' && c.gen === 3 && c.blueprint_compat === true,
      n + ': Uncommon $6, Basic, Earth, Gen 3, Blueprint-compatible', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === 22 && !c.soul_pos, n + ': art is upstream 3.9.1\'s own card (Natdex ' + x + ', 22)', [c.atlas, c.pos]);
    ok(poke_get_family_list(n).length <= 1 && !c.config.evo_rqmt && !('rounds' in c.config.extra), n + ': single-stage (no family, no evolution)');
    ok(pool_filter(c, 'Joker') === undefined && c.in_pool(c) !== false, n + ': can be rolled in the shop (Uncommon)');
  }
  ok(near(C('solrock').config.extra.chips, 100) && near(C('lunatone').config.extra.Xmult, 2), 'base numbers: Solrock chips 100, Lunatone Xmult 2');
  ok('chips' in energy_values && 'Xmult' in energy_values, 'Energy fields: chips (+30%) and Xmult (+20%)');
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_lunatone');
  ok(i > 0 && keys[i - 1] === 'j_poke_seviper' && keys[i + 1] === 'j_poke_solrock', 'Pokédex order: Seviper (336), Lunatone (337), Solrock (338)', keys.slice(i - 1, i + 3));
});

// ------------------------------------------------------------------- alone: each works half the cycle
sec('solrock alone', () => {
  setup('SOL1', ['j_poke_solrock']);
  ok(hp() === 0, 'the round starts at 0 hands played (the first hand is a day)');
  const got = series(5);
  ok(same(got, [[130, 2], [30, 2], [130, 2], [30, 2], [130, 2]]), 'Solrock alone: +100 Chips on hands 1 / 3 / 5 (day), nothing on 2 / 4 (night)', got);
});
sec('lunatone alone', () => {
  setup('LUN1', ['j_poke_lunatone']);
  const got = series(5);
  ok(same(got, [[30, 2], [30, 4], [30, 2], [30, 4], [30, 2]]), 'Lunatone alone: X2 Mult on hands 2 / 4 (night), nothing on 1 / 3 / 5 (day)', got);
});
sec('discards keep the cycle', () => {
  setup('SOL2', ['j_poke_solrock']);
  let t = pairK();
  ok(t.chips === 130, 'hand 1 (day): +100', t);
  clearHand(); hand(['D_2', 'D_3']);
  act({ type: 'highlight', ids: G.hand.cards.map((c) => c.sort_id) });
  act({ type: 'discard' }); flush();
  ok(G.GAME.current_round.discards_used === 1 && hp() === 1, 'a discard is not a hand (hands played still 1)');
  t = pairK();
  ok(t.chips === 30, 'hand 2 after a discard is still night: nothing', t);
});

// ------------------------------------------------------------------- together: Cosmic Power, every hand gets both
sec('pair', () => {
  setup('PAIR1', ['j_poke_solrock', 'j_poke_lunatone']);
  const got = series(5);
  ok(same(got, [[130, 3], [80, 4], [130, 3], [80, 4], [130, 3]]),
    'both: day 30 + 100 Chips, 2 x 1.5 = 3 Mult; night 30 + 50 Chips, 2 x 2 = 4 Mult (hands 1-5)', got);
  setup('PAIR2', ['j_poke_lunatone', 'j_poke_solrock']);
  const got2 = series(2);
  ok(same(got2, [[130, 3], [80, 4]]), 'the order of the two in the row doesn\'t matter', got2);
  // a hand-level 6th hand would be a day again (0, 2, 4 ... even = day)
  G.GAME.current_round.hands_played = 5;
  const t = pairK();
  ok(t.chips === 80 && near(t.mult, 4), 'hands played 5 before the hand (a 6th hand): night', t);
});
sec('copies', () => {
  setup('COPY1', ['j_poke_solrock', 'j_poke_solrock', 'j_poke_lunatone']);
  let got = series(2);
  ok(same(got, [[230, 3], [130, 4]]), 'two Solrocks + a Lunatone: each Solrock gives its own +100 by day / +50 by night', got);
  setup('COPY2', ['j_poke_lunatone', 'j_poke_lunatone', 'j_poke_solrock']);
  got = series(2);
  ok(same(got, [[130, 4.5], [80, 8]]), 'two Lunatones + a Solrock: X1.5 twice by day (4.5), X2 twice by night (8)', got);
  setup('COPY3', ['j_poke_solrock', 'j_poke_solrock']);
  got = series(2);
  ok(same(got, [[230, 2], [30, 2]]), 'two Solrocks and no Lunatone: no Cosmic Power (a copy of itself is not the partner)', got);
  setup('COPY4', ['j_blueprint', 'j_poke_solrock']);
  got = series(2);
  ok(same(got, [[230, 2], [30, 2]]), 'a Blueprint copies Solrock (+100 twice by day) but is not a Lunatone (nothing by night)', got);
  setup('COPY5', ['j_blueprint', 'j_poke_lunatone', 'j_poke_solrock']);
  got = series(2);
  ok(same(got, [[130, 4.5], [80, 8]]), 'a Blueprint copying a paired Lunatone copies its X1.5 by day and its X2 by night', got);
});
sec('debuffed partner', () => {
  const [s, l] = setup('DEB1', ['j_poke_solrock', 'j_poke_lunatone']);
  debuff(l);
  ok(l.debuff === true && s.debuff !== true, 'Lunatone is debuffed');
  let got = series(2);
  ok(same(got, [[130, 2], [30, 2]]), 'a debuffed Lunatone breaks the pair: Solrock +100 by day only; the Lunatone gives nothing', got);
  ok(/needs Lunatone/.test(tip(s)), 'Solrock\'s tooltip: "Cosmic Power: needs Lunatone"', tip(s).slice(0, 900));
  const [s2, l2] = setup('DEB2', ['j_poke_solrock', 'j_poke_lunatone']);
  debuff(s2);
  got = series(2);
  ok(same(got, [[30, 2], [30, 4]]), 'a debuffed Solrock breaks it too: Lunatone X2 by night only', got);
  ok(/needs Solrock/.test(tip(l2)), 'Lunatone\'s tooltip: "Cosmic Power: needs Solrock"', tip(l2).slice(0, 900));
  // the debuff lifted: the pair is back
  s2.ability.debuff_sources = {}; s2.set_debuff(false); flush();
  got = series(2);
  ok(s2.debuff !== true && same(got, [[130, 3], [80, 4]]), 'the debuff lifted (hands 3, 4): Cosmic Power again', got);
});

// ------------------------------------------------------------------- the cycle resets each round
sec('round reset', () => {
  setup('RST1', ['j_poke_solrock', 'j_poke_lunatone']);
  series(2); // hands 1 (day), 2 (night)
  clearHand(); winRound(); flush(); // hand 3 (a day) wins: 3 hands played this round
  ok(G.STATE === STATES.ROUND_EVAL, 'round 1 won on its 3rd hand');
  act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP && /Next hand: .*Day/.test(tip(G.jokers.cards[0])), 'in the shop the tooltip says the next hand (the next round\'s first) is a Day', tip(G.jokers.cards[0]).slice(0, 900));
  act({ type: 'next_round' });
  act({ type: 'select_blind' }); flush();
  ok(hp() === 0, 'the new round starts at 0 hands played');
  const got = series(3);
  ok(same(got, [[130, 3], [80, 4], [130, 3]]), 'round 2: day, night, day again (not carried on from round 1\'s 3 hands)', got);
});

// ------------------------------------------------------------------- Energy: the full and the half values scale together
sec('energy', () => {
  const [s, l] = setup('NRG1', ['j_poke_solrock', 'j_poke_lunatone']);
  ok(energy_matches(s, 'Earth', false) && energy_matches(l, 'Earth', false) && !energy_matches(s, 'Fire', false), 'Earth Energy matches both');
  G.consumeables.config.card_limit = 10;
  for (const target of [s, l]) {
    const e = add('c_poke_earth_energy');
    // (an Energy goes to the leftmost joker: put the target first)
    G.jokers.cards.splice(G.jokers.cards.indexOf(target), 1); G.jokers.cards.unshift(target);
    act({ type: 'use', id: e.sort_id }); flush();
  }
  ok(ex(s).energy_count === 1 && near(ex(s).chips, 130), 'one Earth Energy on Solrock: 100 + 30 = 130 Chips', ex(s));
  ok(ex(l).energy_count === 1 && near(ex(l).Xmult, 2.4), 'one Earth Energy on Lunatone: X2 + 0.4 = X2.4', ex(l));
  let got = series(2);
  ok(same(got, [[160, 2 * 1.7], [95, 2 * 2.4]]), 'energized pair: day +130 Chips, X1.7 (1 + 1.4 / 2); night +65 Chips (130 / 2), X2.4', got);
  const d = tip(s), dl = tip(l);
  ok(/\+130/.test(d) && /\+65/.test(d) && /X2\.4/.test(dl) && /X1\.7/.test(dl), 'the tooltips show the energized numbers (+130 / +65, X2.4 / X1.7)', [d.slice(0, 700), dl.slice(0, 700)]);
  // three Energy each (the limit): 190 / 95 Chips, X3.2 / X2.1
  const [s3, l3] = setup('NRG3', ['j_poke_solrock', 'j_poke_lunatone']);
  for (let i = 0; i < 3; i++) { increment_energy(s3, 'Earth'); increment_energy(l3, 'Earth'); }
  ok(ex(s3).energy_count === 3 && near(ex(s3).chips, 190) && ex(l3).energy_count === 3 && near(ex(l3).Xmult, 3.2), '3 Energy: 190 Chips, X3.2', [ex(s3), ex(l3)]);
  got = series(2);
  ok(same(got, [[220, 2 * 2.1], [125, 2 * 3.2]]), '3 Energy: day +190, X2.1; night +95, X3.2', got);
  // Colorless Energy: half strength (+15 Chips, +0.2 X), the halves follow (57.5, X1.6)
  const [sc, lc] = setup('NRGC', ['j_poke_solrock', 'j_poke_lunatone']);
  increment_energy(sc, 'Colorless'); increment_energy(lc, 'Colorless');
  ok(near(ex(sc).chips, 115) && near(ex(lc).Xmult, 2.2), 'Colorless Energy (half): 115 Chips, X2.2', [ex(sc), ex(lc)]);
  got = series(2);
  ok(same(got, [[145, 2 * 1.6], [87.5, 2 * 2.2]]), 'Colorless-energized pair: day +115, X1.6; night +57.5, X2.2', got);
});

// ------------------------------------------------------------------- the tooltips: next hand day / night + the pair status
sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(J.j_poke_lunatone && J.j_poke_lunatone.name === 'Lunatone' && J.j_poke_solrock && J.j_poke_solrock.name === 'Solrock', 'the two texts');
  ok(/Moonlight:/.test(J.j_poke_lunatone.text.join(' ')) && /Sunlight:/.test(J.j_poke_solrock.text.join(' '))
    && [J.j_poke_lunatone, J.j_poke_solrock].every((e) => /Cosmic Power:/.test(e.text.join(' '))), 'Moonlight / Sunlight / Cosmic Power');
  const [s, l] = setup('TXT1', ['j_poke_solrock', 'j_poke_lunatone']);
  ok(/Next hand: .*Day/.test(tip(s)) && /Next hand: .*Day/.test(tip(l)), 'before the first hand: "Next hand: Day"', tip(s).slice(0, 900));
  ok(/Cosmic Power: .*active/.test(tip(s)) && /Cosmic Power: .*active/.test(tip(l)), 'both held: "Cosmic Power: active"');
  ok(/\+100/.test(tip(s)) && /\+50/.test(tip(s)) && /X2/.test(tip(l)) && /X1\.5/.test(tip(l)), 'the numbers: +100 / +50, X2 / X1.5');
  pairK();
  ok(/Next hand: .*Night/.test(tip(s)) && /Next hand: .*Night/.test(tip(l)), 'after the first hand: "Next hand: Night"', tip(s).slice(0, 900));
  pairK();
  ok(/Next hand: .*Day/.test(tip(s)), 'after the second: "Next hand: Day"');
  const [solo] = setup('TXT2', ['j_poke_solrock']);
  ok(/needs Lunatone/.test(tip(solo)), 'Solrock alone: "Cosmic Power: needs Lunatone"', tip(solo).slice(0, 900));
  const [lsolo] = setup('TXT3', ['j_poke_lunatone']);
  ok(/needs Solrock/.test(tip(lsolo)), 'Lunatone alone: "Cosmic Power: needs Solrock"');
  ok(key(solo) === 'j_poke_solrock' && key(lsolo) === 'j_poke_lunatone', '(the keys)');
});

done();
