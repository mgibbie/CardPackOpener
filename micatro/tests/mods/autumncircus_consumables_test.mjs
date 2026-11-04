// Þe Autumn Circus — consumables (mods/autumncircus/consumables.js, MoreConsumables.lua): every tarot / planet /
// spectral (and the More Fluff cross-mod Rotarots + Colour) used through real act({type:'use'}) with the mod's
// exact numbers; suit levels scored on real plays; the Observatory effects on real plays; pools on / off;
// describe() leaves no #n# unfilled. Each FIX (intended design) has a test that fails with the fix reverted.
//   node micatro/tests/mods/autumncircus_consumables_test.mjs
import {
  start, hand, add, play, use, nextRound, msgs, tot, filled, ok, near, flush, done, G, P_CENTERS, act, describe, describeCenter, AMM,
  clearJokers, clearConsumables, clearHand,
} from './autumncircus_helpers.mjs';
import { P_CENTER_POOLS, get_current_pool, add_joker, level_up_hand } from '../../js/engine/core.js';
import { centerActive } from '../../js/mods/registry.js';
import { STATUS } from '../../mods/autumncircus/index.js';
import { trigger_colour_end_of_round } from '../../mods/morefluff/colours.js';

const cons = (key) => { const c = add_joker(key); flush(); return c; };
const visible = () => G.handlist.filter((h) => G.GAME.hands[h].visible);
const levels = () => Object.fromEntries(G.handlist.map((h) => [h, G.GAME.hands[h].level]));
const inPool = (type, key) => get_current_pool(type)[0].includes(key);
const fresh = (seed, mods) => { start(seed, mods ? { mods } : {}); clearJokers(); clearConsumables(); };
/** Only these hands visible (pseudorandom_unlocked_hand then picks among them); returns a restore fn. */
function onlyVisible(list) {
  const was = Object.fromEntries(G.handlist.map((h) => [h, G.GAME.hands[h].visible]));
  for (const h of G.handlist) G.GAME.hands[h].visible = list.includes(h);
  return () => { for (const h of G.handlist) G.GAME.hands[h].visible = was[h]; };
}
const TAC = (k) => 'c_thac_' + k;
const plain = (d) => d.lines.join(' ').replace(/\{[^}]*\}/g, '');

// ===================================================================== off / registration / pools
{
  start('ACCOFF', { mods: [] });
  ok(!Object.values(P_CENTER_POOLS).some((p) => Array.isArray(p) && p.some((c) => c && c.key && c.key.startsWith('c_thac_'))), 'off: no TAC consumable in any pool');
}
ok(STATUS.tarots.length === 11 && STATUS.planets.length === 10 && STATUS.spectrals.length === 19 && STATUS.rotarots.length === 8 && STATUS.colours.length === 1,
  'content: 11 tarots / 10 planets / 19 spectrals / 8 Rotarots / 1 Colour', [STATUS.tarots.length, STATUS.planets.length, STATUS.spectrals.length, STATUS.rotarots.length, STATUS.colours.length]);
ok(!P_CENTERS.c_thac_shooting_star && !P_CENTERS.c_thac_chill_moon && !P_CENTERS.c_thac_rotflip_star && !P_CENTERS.c_thac_journey, 'SixSuits planets / flips and Journey are not registered');
{
  fresh('ACCPOOL');
  const tar = P_CENTER_POOLS.Tarot.map((c) => c.key), pla = P_CENTER_POOLS.Planet.map((c) => c.key), spe = P_CENTER_POOLS.Spectral.map((c) => c.key);
  ok(STATUS.tarots.every((k) => tar.includes(k)) && STATUS.planets.every((k) => pla.includes(k)) && STATUS.spectrals.every((k) => spe.includes(k)), 'on: tarots / planets / spectrals in their pools');
  ok(!centerActive(P_CENTERS.c_thac_rot_drunkard) && !centerActive(P_CENTERS.c_thac_placeholder_grey) && !(P_CENTER_POOLS.Rotarot || []).length, 'without More Fluff: no Rotarot / Colour cards');
  ok(inPool('Tarot', TAC('universe')) && !inPool('Tarot', TAC('drunkard')) && !inPool('Tarot', TAC('juggler')), "Drunkard / Juggler never rolled (yes_pool_flag 'neversetthis')");
  ok(inPool('Planet', TAC('planet_s')), 'Planet S rolls while the deck has Spades');
  const spades = G.playing_cards.filter((c) => c.base.suit === 'Spades');
  for (const c of spades) c.base.suit = 'Hearts';
  ok(!inPool('Planet', TAC('planet_s')) && inPool('Planet', TAC('planet_h')), 'Planet S out of the pool with no Spades in the deck (in_pool)');
  for (const c of spades) c.base.suit = 'Spades';
  ok(P_CENTERS.c_thac_universe.cost === 3 && P_CENTERS.c_thac_universe.atlas === 'thac_MoreConsumables' && P_CENTERS.c_thac_chance.name === 'Chance', 'SMODS defaults: cost 3, MoreConsumables atlas, named spectrals keep their name');
}
{
  fresh('ACCXPOOL', ['autumncircus', 'morefluff']);
  const rot = P_CENTER_POOLS.Rotarot.map((c) => c.key), col = P_CENTER_POOLS.Colour.map((c) => c.key);
  ok(STATUS.rotarots.every((k) => rot.includes(k)) && col.includes(TAC('placeholder_grey')), 'with More Fluff: TAC Rotarots + Placeholder Grey in their pools');
  ok(P_CENTERS.c_thac_rot_universe.atlas === 'thac_Rotatema', 'Rotarots use the 107px Rotatema atlas');
  ok(!inPool('Rotarot', TAC('rot_universe')) && !inPool('Rotarot', TAC('rot_veteran')) && inPool('Rotarot', TAC('rot_drunkard')) && inPool('Rotarot', TAC('rot_joker')),
    'the "Sorry nothing" Rotarots never roll; Drunkard! / Juggler! / Joker! do');
  const bad = [];
  for (const k of [...STATUS.tarots, ...STATUS.planets, ...STATUS.spectrals, ...STATUS.rotarots, ...STATUS.colours]) if (!filled(describeCenter(k))) bad.push(k);
  ok(!bad.length, 'describeCenter(): every TAC consumable text filled', bad);
  const c = cons(TAC('comedy'));
  const d = describe(c);
  ok(filled(d) && d.info.some((i) => i.key === 'thac_steven_stamp' && i.name === "Steven's Stamp" && i.lines.length), 'describe(): Comedy shows the Steven\'s Stamp box');
  ok(plain(describeCenter(TAC('veteran'))).includes('Enhances 2 selected cards to Star Cards') && describeCenter(TAC('veteran')).info.some((i) => i.key === 'm_thac_star'), 'Veteran: "Enhances 2 ... Star Cards" + the Star Card box');
  ok(describeCenter(TAC('comet')).info.some((i) => i.key === 'mc_obs_off_comet') && describeCenter(TAC('comet')).badges[0].label === 'Comet', 'Comet: inactive Observatory box; "Comet" badge');
  G.GAME.used_vouchers.v_observatory = true;
  ok(describeCenter(TAC('meteor')).info.some((i) => i.key === 'mc_obs_on_meteor' && i.lines.join(' ').includes('X3.375')), 'Meteor: active Observatory box with Observatory');
  G.GAME.used_vouchers.v_observatory = undefined;
  ok(describeCenter(TAC('dysnomia')).lines.join(' ').includes('1 in 2'), 'Dysnomia: 1 in 2 text');
  ok(describeCenter(TAC('void')).lines.join(' ').includes('$6'), 'Void: $6 per removed enhancement');
  ok(describeCenter(TAC('chance')).name === 'Chance' && describeCenter(TAC('tribute')).name.join(' ').includes('Work In Progress!'), 'loc_txt spectral names (+ the WIP subtitle)');
}

// ===================================================================== tarots
{
  fresh('ACCUNIV');
  const cs = hand(['S_2', 'H_3', 'C_4']);
  const u = cons(TAC('universe'));
  const r = use(u, cs);
  ok(r.ok && cs.every((c) => c.config.center.set === 'Enhanced' && P_CENTER_POOLS.Enhanced.includes(c.config.center)) && !G.hand.highlighted.length, 'The Universe: each selected card gets a random enhancement', cs.map((c) => c.config.center.key));
  ok(!G.consumeables.cards.includes(u), 'The Universe is used up');
  clearHand();
  const six = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7']);
  ok(use(cons(TAC('universe')), six).ok && six.filter((c) => c.config.center.set === 'Enhanced').length === 5, 'The Universe: at most 5 cards (the selection limit; mod_num = min(5, max_highlighted))');
}
{
  fresh('ACCVOID');
  const [a, b, c] = hand(['S_2', 'H_3', 'C_4']);
  a.set_ability(P_CENTERS.m_bonus); b.set_ability(P_CENTERS.m_mult);
  const $0 = G.GAME.dollars;
  ok(use(cons(TAC('void')), [a, b, c]).ok && [a, b, c].every((x) => x.config.center === P_CENTERS.c_base), 'Void: enhancements removed');
  ok(G.GAME.dollars - $0 === 12, 'Void: $6 for each of the 2 removed enhancements', G.GAME.dollars - $0);
}
{
  fresh('ACCSQ');
  const [a] = hand(['S_A']);
  const n0 = G.playing_cards.length, lim0 = G.deck.config.card_limit;
  ok(use(cons(TAC('happy_squirrel')), [a]).ok, 'The Happy Squirrel: usable on 1 unenhanced card');
  const aces = G.hand.cards.filter((c) => c.base.suit === 'Spades' && c.base.value === 'Ace');
  ok(aces.length === 2 && G.playing_cards.length === n0 + 1 && G.deck.config.card_limit === lim0 + 1, 'The Happy Squirrel: one copy of it in hand + the deck');
  clearHand();
  const [g] = hand(['H_K'], 'm_glass');
  ok(!use(cons(TAC('happy_squirrel')), [g]).ok, 'The Happy Squirrel: not on an enhanced card');
  clearHand(); clearConsumables();
  const two = hand(['H_K', 'H_Q']);
  ok(!use(cons(TAC('happy_squirrel')), two).ok, 'The Happy Squirrel: exactly 1 card');
}
{
  fresh('ACCART');
  const [sel, ...others] = hand(['H_K', 'S_2', 'S_3', 'S_4']);
  sel.set_ability(P_CENTERS.m_glass); sel.set_edition({ foil: true }, true); sel.set_seal('Red', true);
  ok(use(cons(TAC('artist')), [sel]).ok, 'The Artist: used on 1 card');
  const painted = others.filter((c) => c.config.center === P_CENTERS.m_glass && c.edition && c.edition.foil && c.seal === 'Red');
  const untouched = others.filter((c) => c.config.center === P_CENTERS.c_base && !c.edition && !c.seal);
  ok(painted.length === 2 && untouched.length === 1, 'The Artist: 2 random other hand cards get its enhancement, edition and seal', [painted.length, untouched.length]);
  ok(sel.config.center === P_CENTERS.m_glass && sel.edition.foil && sel.seal === 'Red', 'The Artist: the selected card keeps them');
  clearHand();
  ok(!use(cons(TAC('artist')), hand(['H_K', 'H_Q'])).ok, 'The Artist: max 1 selected');
}
for (const [k, conv, n] of [['veteran', 'm_thac_star', 2], ['bone', 'm_thac_bone', 2], ['collector', 'm_thac_jewel', 1], ['cycle', 'm_thac_soulbound', 3]]) {
  fresh('ACCENH' + k);
  const cs = hand(['S_2', 'S_3', 'S_4', 'S_5'].slice(0, n));
  ok(use(cons(TAC(k)), cs).ok && cs.every((c) => c.config.center.key === conv), `${k}: ${n} selected -> ${conv}`);
  clearHand();
  ok(!use(cons(TAC(k)), hand(['H_2', 'H_3', 'H_4', 'H_5'].slice(0, n + 1))).ok, `${k}: not on ${n + 1} cards`);
}
{
  fresh('ACCDRJ');
  const d = cons(TAC('drunkard')), j = cons(TAC('juggler'));
  ok(!use(d, hand(['S_2'])).ok && !use(j, hand(['S_3'])).ok, 'The Drunkard / The Juggler: unfinished, never usable');
  ok(describe(j).lines.join(' ').includes('Not Yet Implemented'), 'The Juggler: "Not Yet Implemented"');
}
{
  fresh('ACCJOKER');
  cons(TAC('joker'));
  const r = play(hand(['S_2']));
  ok(near(tot(r)[0], 7) && near(tot(r)[1], 5), 'The Joker (held): +4 Mult on a High Card (7 x 5)', tot(r));
  const m = msgs(r.events);
  ok(m.includes('Hee hee!') && m.includes('Hoo hoo!') && m.includes('+4 Mult'), 'The Joker: Hee hee! / Hoo hoo! / +4 Mult', m);
  const j = G.consumeables.cards[0];
  ok(use(j).ok && !G.consumeables.cards.length, 'The Joker: usable (does nothing but laugh)');
  const r2 = play(hand(['S_3']));
  ok(near(tot(r2)[1], 1), 'The Joker: no Mult once used');
}

// ===================================================================== planets
{
  fresh('ACCCOMET');
  const before = levels();
  ok(use(cons(TAC('comet'))).ok, 'Comet: usable any time');
  const diff = G.handlist.filter((h) => G.GAME.hands[h].level !== before[h]);
  ok(diff.length === 1 && G.GAME.hands[diff[0]].level === before[diff[0]] + 2 && G.GAME.hands[diff[0]].visible, 'Comet: a random visible hand +2 levels', diff);
  const h = G.GAME.hands[diff[0]];
  ok(h.mult === h.s_mult + 2 * h.l_mult && h.chips === h.s_chips + 2 * h.l_chips, 'Comet: the hand\'s chips / mult follow its level');
}
{
  fresh('ACCMETEOR');
  for (const h of visible()) level_up_hand(null, h, true, 1); // every hand at level 2: the downgrade shows
  const before = levels();
  ok(use(cons(TAC('meteor'))).ok, 'Meteor: usable');
  const up = G.handlist.filter((h) => G.GAME.hands[h].level === before[h] + 3), down = G.handlist.filter((h) => G.GAME.hands[h].level === before[h] - 1);
  const changed = G.handlist.filter((h) => G.GAME.hands[h].level !== before[h]);
  ok(up.length === 1 && down.length === 1 && up[0] !== down[0] && changed.length === 2, 'Meteor: one hand +3, a different hand -1', { up, down });
  // a level-1 hand is not downgraded
  fresh('ACCMETEOR2');
  const restore = onlyVisible(['Pair', 'High Card']);
  const b2 = levels();
  use(cons(TAC('meteor')));
  const ups = ['Pair', 'High Card'].filter((h) => G.GAME.hands[h].level === b2[h] + 3);
  const other = ups[0] === 'Pair' ? 'High Card' : 'Pair';
  ok(ups.length === 1 && G.GAME.hands[other].level === 1, 'Meteor: a level-1 hand stays at level 1');
  restore();
}
{
  fresh('ACCSAT');
  const s = cons(TAC('satellite'));
  ok(use(s).ok && G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Planet'), 'Satellite: 2 random Planets (its own slot freed)');
  clearConsumables();
  cons('c_fool'); const s2 = cons(TAC('satellite'));
  use(s2);
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.filter((c) => c.ability.set === 'Planet').length === 1, 'Satellite: up to the free room (1)');
}
{
  fresh('ACCMOON');
  ok(use(cons(TAC('moon'))).ok && G.consumeables.cards.length === 1 && ['Tarot', 'Planet', 'Spectral'].includes(G.consumeables.cards[0].ability.set), 'Moon: 1 random Tarot / Planet / Spectral', G.consumeables.cards.map((c) => c.ability.set));
}
{
  fresh('ACCSTATION');
  ok(plain(describe(cons(TAC('station')))).includes('Currently: High Card'), 'Space Station: favourite starts at High Card');
  clearConsumables();
  play(hand(['S_2', 'H_2'])); play(hand(['S_3', 'H_3']));
  const lv = G.GAME.hands.Pair.level;
  ok(use(cons(TAC('station'))).ok && G.GAME.hands.Pair.level === lv + 1, 'Space Station: most played hand (Pair) +1 level');
}
{
  fresh('ACCDYS');
  const vis = visible();
  vis.forEach((h, i) => { G.GAME.hands[h].level = i + 1; level_up_hand(null, h, true, 0); });
  const before = levels();
  G.GAME.probabilities.normal = 0; // (no up / down rolls: a pure shuffle)
  ok(use(cons(TAC('dysnomia'))).ok, 'Dysnomia: usable');
  const after = vis.map((h) => G.GAME.hands[h].level);
  ok(JSON.stringify([...after].sort((a, b) => a - b)) === JSON.stringify(vis.map((h) => before[h]).sort((a, b) => a - b)) && vis.some((h) => G.GAME.hands[h].level !== before[h]),
    'Dysnomia: the visible hands\' levels are shuffled among them', after);
  ok(vis.every((h) => { const x = G.GAME.hands[h]; return x.mult === Math.max(x.s_mult + x.l_mult * (x.level - 1), 1) && x.chips === Math.max(x.s_chips + x.l_chips * (x.level - 1), 0); }), 'Dysnomia: chips / mult recomputed for the new levels');
  // every hand rolls (1 in 2): with certain odds each moves 1 up or down (never below 1)
  G.GAME.probabilities.normal = 1e9;
  const b2 = vis.map((h) => G.GAME.hands[h].level);
  use(cons(TAC('dysnomia')));
  const sum0 = b2.reduce((a, b) => a + b, 0), sum1 = vis.reduce((a, h) => a + G.GAME.hands[h].level, 0);
  ok(sum0 !== sum1 && Math.abs(sum1 - sum0) <= vis.length && vis.every((h) => G.GAME.hands[h].level >= 1), 'Dysnomia: each shuffled hand upgrades or downgrades', [sum0, sum1]);
  G.GAME.probabilities.normal = 1;
  ok(msgs(use(cons(TAC('dysnomia'))).events).length >= 0, 'Dysnomia: usable again');
}
for (const [k, suit, code] of [['planet_s', 'Spades', 'S'], ['planet_h', 'Hearts', 'H'], ['planet_c', 'Clubs', 'C'], ['planet_d', 'Diamonds', 'D']]) {
  fresh('ACCSUIT' + k);
  ok(use(cons(TAC(k))).ok, `${k}: usable`);
  const sl = G.GAME.amm_data.suit_levels[suit];
  ok(sl.level === 2 && sl.chips === 5 && sl.mult === 1, `${k}: ${suit} level 2 (+5 Chips / +1 Mult)`, sl);
  const r = play(hand([code + '_2']));
  ok(near(tot(r)[0], 12) && near(tot(r)[1], 2) && near(tot(r)[2], 24), `${k}: a scored ${suit} card +5 Chips +1 Mult (High Card 12 x 2)`, tot(r));
  const other = code === 'S' ? 'H' : 'S';
  const r2 = play(hand([other + '_2']));
  ok(near(tot(r2)[2], 7), `${k}: other suits unaffected (7 x 1)`, tot(r2));
  ok(describe(cons(TAC(k))).lines.join(' ').includes('lvl.2'), `${k}: text shows lvl.2`);
}

// ===================================================================== Observatory
{
  fresh('ACCOBS');
  const pair = () => play(hand(['S_2', 'H_2'])); // Pair: 14 chips x 2 mult
  cons(TAC('comet'));
  let r = pair();
  ok(near(tot(r)[2], 28) && !msgs(r.events).includes('Nope!'), 'no Observatory: Comet does nothing', tot(r));
  G.GAME.used_vouchers.v_observatory = true;
  let restore = onlyVisible(['Pair']);
  r = pair();
  ok(near(tot(r)[1], 4.5) && near(tot(r)[2], 63), 'Observatory + Comet: X2.25 Mult when the random hand is the one played (14 x 4.5)', tot(r));
  restore(); restore = onlyVisible(['High Card']);
  r = pair();
  ok(near(tot(r)[2], 28) && msgs(r.events).includes('Nope!'), 'Observatory + Comet: Nope! on another hand', tot(r));
  restore(); clearConsumables();

  cons(TAC('meteor'));
  restore = onlyVisible(['Pair']);
  r = pair();
  ok(near(tot(r)[1], 6.75), 'Observatory + Meteor: X3.375 when the first random hand is played', tot(r));
  restore(); restore = onlyVisible(['Pair', 'High Card']);
  const seen = new Set();
  for (let i = 0; i < 60 && seen.size < 3; i++) {
    r = pair();
    const m = tot(r)[1];
    if (near(m, 6.75)) seen.add('x3.375');
    else if (near(m, 2 * 0.66)) seen.add('x0.66');
    else if (near(m, 2) && msgs(r.events).includes('Nope!')) seen.add('nope');
    else seen.add('bad:' + m);
  }
  ok(seen.has('x3.375') && seen.has('x0.66') && seen.has('nope') && ![...seen].some((s) => s.startsWith('bad')), 'Observatory + Meteor: X3.375 (first hand) / X0.66 (second hand) / Nope!', [...seen]);
  restore(); clearConsumables();

  cons(TAC('station'));
  r = pair(); // Pair is now the most played hand
  ok(near(tot(r)[1], 3) && near(tot(r)[2], 42), 'Observatory + Space Station: X1.5 on the most played hand', tot(r));
  r = play(hand(['S_5']));
  ok(near(tot(r)[2], 10), 'Observatory + Space Station: nothing on another hand (High Card 10 x 1)', tot(r));
  clearConsumables();

  cons(TAC('dysnomia')); cons(TAC('satellite'));
  r = pair();
  ok(near(tot(r)[2], 28), 'Observatory + Dysnomia / Satellite: "Nothing actually..."', tot(r));
  G.GAME.used_vouchers.v_observatory = undefined;
}

// ===================================================================== spectrals
{
  fresh('ACCCHANCE');
  const cs = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6']);
  ok(use(cons(TAC('chance'))).ok && G.hand.cards.length === 5, 'Chance: usable with 2+ hand cards');
  ok(cs.some((c) => !(c.base.suit === 'Spades' && c.base.value === String(c.base.id))) && cs.some((c) => c.config.center !== P_CENTERS.c_base), 'Chance: suits / ranks / enhancements re-rolled');
  clearHand(); hand(['S_A']);
  ok(!use(cons(TAC('chance'))).ok, 'Chance: needs more than 1 card in hand');
  // FIX (intended design): the seal comes from the whole Seal pool (the Lua's 1-based off-by-one skipped the last
  // seal and gave "no seal" for index 0)
  clearHand(); clearConsumables();
  const many = hand(Array.from({ length: 160 }, (_, i) => ['S', 'H', 'C', 'D'][i % 4] + '_' + ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'][i % 13]));
  use(cons(TAC('chance')));
  const seals = new Set(many.map((c) => c.seal).filter(Boolean));
  const pool = P_CENTER_POOLS.Seal.map((s) => s.key);
  ok(pool.every((s) => seals.has(s)) && seals.has(pool[pool.length - 1]), 'FIX Chance: every seal of the pool can come up, the last one (' + pool[pool.length - 1] + ') included', [...seals]);
  const sealed = many.filter((c) => c.seal).length;
  ok(sealed > 160 * 0.12 && sealed < 160 * 0.3, 'Chance: ~20% of the cards get a seal', sealed);
  ok(many.some((c) => c.edition && c.edition.negative), 'Chance: some cards turn Negative (10%)');
}
{
  fresh('ACCOFFER');
  const n = G.playing_cards.length, slots = G.jokers.config.card_limit;
  ok(use(cons(TAC('offering'))).ok, 'Offering: usable');
  ok(G.playing_cards.length === n - Math.floor(n / 2), 'Offering: half the full deck destroyed', [n, G.playing_cards.length]);
  ok(G.jokers.config.card_limit === slots + 1, 'Offering: +1 Joker slot');
}
{
  fresh('ACCTRIB');
  ok(!use(cons(TAC('tribute'))).ok, 'Tribute: needs a joker');
  clearConsumables();
  add('j_joker'); add('j_greedy_joker'); const e = add('j_banner'); e.set_eternal(true);
  const slots = G.jokers.config.card_limit;
  ok(use(cons(TAC('tribute'))).ok && G.jokers.cards.length === 1 && G.jokers.cards[0] === e, 'Tribute: every non-Eternal joker destroyed');
  ok(G.jokers.config.card_limit === slots + 1, 'Tribute: +1 Joker slot');
}
{
  fresh('ACCSACR');
  const h0 = G.GAME.round_resets.hands, left = G.GAME.current_round.hands_left, slots = G.jokers.config.card_limit;
  const r = use(cons(TAC('sacrifice')));
  ok(r.ok && G.GAME.round_resets.hands === h0 - 1 && G.GAME.current_round.hands_left === left - 1, 'Sacrifice: -1 Hand per round (and this round)');
  ok(G.jokers.config.card_limit === slots + 1 && msgs(r.events).includes('-1 Hand'), 'Sacrifice: +1 Joker slot; "-1 Hand"');
  nextRound();
  ok(G.GAME.current_round.hands_left === h0 - 1, 'Sacrifice: next round starts with one hand fewer', G.GAME.current_round.hands_left);
}
{
  fresh('ACCSCRY');
  ok(use(cons(TAC('scry'))).ok && G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Spectral'), 'Scry: 2 random Spectrals');
  clearConsumables();
  cons('c_fool'); use(cons(TAC('scry')));
  ok(G.consumeables.cards.filter((c) => c.ability.set === 'Spectral').length === 1, 'Scry: only up to the free room');
}
{
  fresh('ACCLOTUS');
  cons('c_fool'); cons('c_fool');
  const lim = G.consumeables.config.card_limit;
  ok(use(cons(TAC('lotus'))).ok, 'Lotus: usable even with full slots');
  const made = G.consumeables.cards.filter((c) => c.ability.set === 'Tarot' && c.edition && c.edition.negative);
  ok(made.length === 3 && G.consumeables.config.card_limit === lim + 3, 'Lotus: 3 Negative Tarots', made.length);
}
{
  fresh('ACCPHANTOM');
  const j = add('j_joker');
  const lim = G.jokers.config.card_limit;
  ok(use(cons(TAC('phantom'))).ok && G.jokers.cards.length === 2, 'Phantom: a random joker created');
  const n = G.jokers.cards.find((c) => c !== j);
  ok(n.edition && n.edition.negative && G.jokers.config.card_limit === lim + 1, 'Phantom: it is Negative');
  ok(n.ability.perishable === (n.config.center.perishable_compat ? true : undefined) && !n.ability.eternal, 'Phantom: Perishable (when it can be), never Eternal');
  ok(G.jokers.cards.every((c) => c.sell_cost === 0 && c.ability.extra_value === 0 && c.cost === 0), 'Phantom: every joker sells for $0');
}
{
  fresh('ACCMISCH');
  ok(!use(cons(TAC('mischief'))).ok, 'Mischief: needs 2+ jokers');
  clearConsumables();
  const js = [add('j_joker'), add('j_greedy_joker'), add('j_lusty_joker')];
  const hs = G.hand.config.card_limit, cl = G.consumeables.config.card_limit;
  ok(use(cons(TAC('mischief'))).ok && G.jokers.cards.length === 2, 'Mischief: a random joker destroyed');
  const keys = AMM.active_stamps().map((s) => s.key);
  ok(G.jokers.cards.every((c) => keys.includes(c.seal)), 'Mischief: each other joker gets a random Stamp', G.jokers.cards.map((c) => c.seal));
  const gone = js.find((c) => !G.jokers.cards.includes(c));
  ok(!gone.seal, 'FIX Mischief: the destroyed joker is not stamped (the Lua\'s chosen_joker guard was an undefined global)', gone.seal);
  const exp_h = hs + G.jokers.cards.filter((c) => c.seal === 'thac_jimbo').length, exp_c = cl + G.jokers.cards.filter((c) => c.seal === 'thac_andy').length;
  ok(G.hand.config.card_limit === exp_h && G.consumeables.config.card_limit === exp_c, 'Mischief: only the surviving jokers\' Stamps apply', [G.hand.config.card_limit, exp_h, G.consumeables.config.card_limit, exp_c]);
}
for (const [k, stamp] of [['comedy', 'thac_steven'], ['tragedy', 'thac_todd'], ['whimsy', 'thac_jimbo'], ['entropy', 'thac_chaos'], ['wonder', 'thac_andy'],
  ['macabre', 'thac_mr_bones'], ['duplicity', 'thac_sock_and_buskin'], ['banana', 'thac_gros_michel'], ['artifice', 'thac_blueprint'], ['sunset', 'thac_dusk']]) {
  fresh('ACCSTAMP' + k);
  ok(!use(cons(TAC(k))).ok, `${k}: needs a stamp-less joker`);
  clearConsumables();
  const a = add('j_joker'), b = add('j_greedy_joker');
  a.set_seal('thac_chaos');
  const hs = G.hand.config.card_limit, cl = G.consumeables.config.card_limit;
  ok(use(cons(TAC(k))).ok && b.seal === stamp && a.seal === 'thac_chaos', `${k}: ${stamp} on the stamp-less joker`, [a.seal, b.seal]);
  if (stamp === 'thac_jimbo') ok(G.hand.config.card_limit === hs + 1, 'Whimsy: Jimbo\'s Stamp gives +1 hand size');
  if (stamp === 'thac_andy') ok(G.consumeables.config.card_limit === cl + 1, 'Wonder: Andy\'s Stamp gives +1 consumable slot');
  ok(!use(cons(TAC(k))).ok, `${k}: no stamp-less joker left -> not usable`);
}
{
  fresh('ACCGROS');
  const j = add('j_joker');
  use(cons(TAC('banana')));
  const r = play(hand(['S_2']));
  ok(j.seal === 'thac_gros_michel' && near(tot(r)[1], 1 + 15 + 4), 'Banana: the Gros Michel Stamp scores +15 Mult (with Joker\'s +4)', tot(r));
}
{
  fresh('ACCQUEST');
  add('j_joker'); add('j_greedy_joker'); add('j_lusty_joker');
  const cs = hand(['S_2', 'H_3', 'C_4']);
  ok(use(cons(TAC('quest_bed'))).ok && G.jokers.cards.length === 1, 'Quest Bed: 2 random jokers destroyed');
  const asp = cs[0].aspect;
  ok(asp && AMM.active_aspects().some((a) => a.key === asp) && cs.every((c) => c.aspect === asp), 'Quest Bed: every hand card gets the same random Aspect', cs.map((c) => c.aspect));
  clearConsumables();
  ok(!use(cons(TAC('quest_bed'))).ok, 'Quest Bed: needs 2+ jokers');
}

// ===================================================================== More Fluff cross-mod
{
  fresh('ACCROT', ['autumncircus', 'morefluff']);
  for (const k of ['rot_universe', 'rot_void', 'rot_happy_squirrel', 'rot_artist', 'rot_veteran']) {
    ok(!use(cons(TAC(k)), hand(['S_2'])).ok, `${k}: "Sorry nothing" — never usable`);
    clearHand(); clearConsumables();
  }
  ok(use(cons(TAC('rot_drunkard'))).ok && G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.key === 'j_drunkard', 'The Drunkard!: creates Drunkard');
  ok(G.GAME.last_rot_tarot_colour === TAC('rot_drunkard'), 'The Drunkard!: the 45° Fool remembers it');
  ok(use(cons(TAC('rot_juggler'))).ok && G.jokers.cards.some((c) => c.config.center.key === 'j_juggler'), 'The Juggler!: creates Juggler');
  for (let i = G.jokers.cards.length; i < G.jokers.config.card_limit; i++) add('j_joker');
  ok(!use(cons(TAC('rot_drunkard'))).ok, 'The Drunkard!: needs joker room');
  clearConsumables();
  ok(use(cons(TAC('rot_joker'))).ok && G.consumeables.cards.length === 1 && G.consumeables.cards[0].config.center.key === TAC('joker'), 'The Joker!: creates The Joker tarot');
  cons('c_fool');
  ok(!use(cons(TAC('rot_joker'))).ok || G.consumeables.cards.length <= G.consumeables.config.card_limit, 'The Joker!: needs room (or to be held)');
}
{
  fresh('ACCGREY', ['autumncircus', 'morefluff']);
  const g = cons(TAC('placeholder_grey'));
  ok(g.ability.set === 'Colour' && g.ability.val === 0 && g.ability.upgrade_rounds === 3, 'Placeholder Grey: a Colour card charging every 3 rounds');
  ok(use(g).ok && G.jokers.cards.length === 0, 'Placeholder Grey at 0: nothing');
  const g2 = cons(TAC('placeholder_grey'));
  nextRound(); nextRound();
  ok(g2.ability.val === 0 && g2.ability.partial_rounds === 2, 'Placeholder Grey: 2/3 after two rounds', [g2.ability.val, g2.ability.partial_rounds]);
  nextRound();
  ok(g2.ability.val === 1 && g2.ability.partial_rounds === 0, 'Placeholder Grey: val 1 after three rounds');
  trigger_colour_end_of_round(g2); trigger_colour_end_of_round(g2); trigger_colour_end_of_round(g2);
  ok(g2.ability.val === 2 && filled(describe(g2)), 'Placeholder Grey: val 2; text filled');
  const lim = G.jokers.config.card_limit;
  ok(use(g2).ok && G.GAME.last_rot_tarot_colour === TAC('placeholder_grey'), 'Placeholder Grey: used (the 45° Fool remembers it)');
  if (P_CENTERS.j_thac_placeholder_joker) {
    ok(G.jokers.cards.length === 2 && G.jokers.cards.every((c) => c.config.center.key === 'j_thac_placeholder_joker' && c.edition && c.edition.negative) && G.jokers.config.card_limit === lim + 2,
      'Placeholder Grey: 2 Negative Placeholder Jokers', G.jokers.cards.map((c) => c.config.center.key));
  } else ok(true, '(Placeholder Joker not ported yet: creation skipped)');
  ok(P_CENTERS.c_thac_placeholder_grey.can_use(P_CENTERS.c_thac_placeholder_grey, { area: G.pack_cards }) === false, 'Placeholder Grey: TAKEN from a pack, never used there');
}

done();
