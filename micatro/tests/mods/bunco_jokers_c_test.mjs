// Bunco jokers, part C (mods/bunco/jokers_c.js): every joker fired through real act() plays with the mod's numbers.
import {
  T, ok, near, flush, done, start, hand, add, play, discard, toShop, msgs, tot, filled, handName, clearJokers,
  G, P_CENTERS, P_CARDS, P_TAGS, act, STATES,
} from './bunco_helpers.mjs';
import { describe } from '../../js/engine/describe.js';
import { ease_dollars, create_card } from '../../js/engine/core.js';
import { calculate_context } from '../../js/engine/run.js';

const SPECTRUM = ['S_2', 'H_5', 'C_8', 'D_J', 'bunc_FLEURON_K']; // 50 chips / 6 mult + 2+5+8+10+10
const statusOf = (r, card) => r.events.filter((e) => e.type === 'status' && e.card === card.sort_id).map((e) => e.message);

// ---------------------------------------------------------------- descriptions
{
  start('BJC-DESC');
  const keys = ['bounty_hunter', 'mousetrap', 'the_joker', 'tangram', 'domino', 'glue_gun', 'taped', 'rubber_band_ball', 'headache',
    'games_collector', 'jumper', 'stylophone', 'kite_experiment', 'robot', 'hardtack', 'pica', 'zealous', 'lurid', 'envious', 'proud',
    'wishalloy', 'unobtanium', 'dynasty', 'magic_wand', 'starfruit', 'fondue', 'myopia', 'astigmatism', 'roygbiv', 'rigoletto'];
  for (const k of keys) {
    ok(P_CENTERS['j_bunc_' + k], 'center registered ' + k);
    const j = add('j_bunc_' + k);
    const d = describe(j);
    ok(filled(d), 'description filled ' + k, d && d.lines);
    j.remove(); flush();
  }
  ok(P_CENTERS.j_bunc_rigoletto.soul_pos && P_CENTERS.j_bunc_rigoletto.atlas === 'bunco_jokers_legendary', 'Rigoletto soul_pos + legendary atlas');
  const m = add('j_bunc_mousetrap');
  ok(describe(m).lines.join(' ').includes('+300') && describe(m).lines.join(' ').includes('1 in 3'), 'Mousetrap text: +300 Chips, 1 in 3', describe(m).lines);
  clearJokers();
}

// ---------------------------------------------------------------- Bounty Hunter
{
  start('BJC-BOUNTY');
  const j = add('j_bunc_bounty_hunter');
  const d0 = G.GAME.dollars;
  ease_dollars(5); flush();
  ok(G.GAME.dollars === d0 + 4, 'Bounty Hunter: $5 gain gives $4', G.GAME.dollars - d0);
  ok(j.ability.extra.mult === 1, 'Bounty Hunter: +1 Mult per gain');
  ease_dollars(-3); flush();
  ok(G.GAME.dollars === d0 + 1 && j.ability.extra.mult === 1, 'Bounty Hunter: spending untouched');
  ease_dollars(1); flush();
  ok(G.GAME.dollars === d0 + 1 && j.ability.extra.mult === 2, 'Bounty Hunter: a $1 gain becomes $0 but still counts');
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 3, 21]), 'Bounty Hunter: +2 Mult in play', tot(r));
}

// ---------------------------------------------------------------- Mousetrap
{
  start('BJC-MOUSE');
  const j = add('j_bunc_mousetrap');
  let chips = 0, ouch = 0;
  for (let i = 0; i < 24; i++) {
    G.GAME.current_round.hands_left = 5;
    const r = play(hand(['S_2']), { left: 0 });
    const t = tot(r);
    if (msgs(r.events).includes('OUCH!')) {
      ouch++;
      ok(G.GAME.current_round.hands_left === 3 && t[0] === 7, 'Mousetrap: OUCH loses one more hand, no chips', [G.GAME.current_round.hands_left, t]);
    } else {
      chips++;
      ok(G.GAME.current_round.hands_left === 4 && t[0] === 307, 'Mousetrap: +300 Chips', [G.GAME.current_round.hands_left, t]);
    }
  }
  ok(chips > 0 && ouch > 0, 'Mousetrap: both outcomes', [chips, ouch]);
  ok(j.area === G.jokers, 'Mousetrap stays');
}

// ---------------------------------------------------------------- The Joker + Headache
{
  start('BJC-THEJOKER');
  const tj = add('j_bunc_the_joker');
  const hd = add('j_bunc_headache');
  G.GAME.probabilities.normal = 3; // 3 in 3: every base scoring card goes
  const [a, b] = hand(['S_5', 'H_5']);
  const [bonus] = hand(['C_5'], 'm_bonus');
  const kick = hand(['D_9'])[0];
  play([a, b, bonus, kick]);
  ok(!G.playing_cards.includes(a) && !G.playing_cards.includes(b), 'The Joker: scored base cards destroyed');
  ok(G.playing_cards.includes(bonus), 'The Joker: enhanced card kept');
  ok(G.playing_cards.includes(kick), 'The Joker: unscored card kept');
  ok(hd.ability.extra.destroyed === 2, 'Headache: counts 2 destroyed', hd.ability.extra.destroyed);
  ok(tj.ability.extra.trash_list.length === 0, 'The Joker: list cleared');
  const tags0 = G.GAME.tags.length;
  if (P_TAGS.tag_bunc_arcade) {
    play(hand(['S_7', 'H_7', 'C_7']));
    ok(G.GAME.tags.length === tags0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_bunc_arcade', 'Headache: 4 destroyed -> Arcade Tag');
    ok(hd.ability.extra.destroyed === 1, 'Headache: 5 - 4 = 1 left', hd.ability.extra.destroyed);
  } else console.log('NOTE: tag_bunc_arcade not registered yet (tags.js) — Headache tag check skipped');
  G.GAME.probabilities.normal = 0;
  const keep = hand(['S_9', 'H_9']);
  play(keep);
  ok(keep.every((c) => G.playing_cards.includes(c)), 'The Joker: no destroy on a failed roll');
}

// ---------------------------------------------------------------- Tangram
{
  start('BJC-TANGRAM');
  add('j_bunc_tangram');
  const r = play(hand(['S_7', 'H_7', 'C_7']));
  ok(same(tot(r), [51, 66, 51 * 66]), 'Tangram: each 7 gives +7 x 3 Mult', tot(r));
}

// ---------------------------------------------------------------- Domino (shop + pack)
{
  start('BJC-DOMINO');
  add('j_bunc_domino');
  toShop();
  ok(G.STATE === STATES.SHOP, 'in shop');
  for (const c of G.shop_jokers.cards.slice()) c.remove();
  const sj = ['j_joker', 'j_greedy_joker', 'j_lusty_joker'].map((k) => { const c = create_card('Joker', G.shop_jokers, null, null, null, null, k); G.shop_jokers.emplace(c); return c; });
  flush();
  G.GAME.dollars = 100;
  const cost = sj[1].cost;
  act({ type: 'buy', id: sj[1].sort_id });
  ok(sj.every((c) => c.area === G.jokers), 'Domino: bought card + both neighbours acquired', sj.map((c) => c.area && c.area.name));
  ok(G.GAME.dollars === 100 - cost, 'Domino: only the bought card is paid for', [G.GAME.dollars, cost]);
  ok(G.GAME.current_round.jokers_purchased === 3, 'Domino: neighbours count as purchased', G.GAME.current_round.jokers_purchased);
  // a Buffoon pack: take the middle card, the two neighbours come too and the pack closes (empty)
  for (const j of G.jokers.cards.slice()) if (j.config.center.key !== 'j_bunc_domino') j.remove();
  flush();
  G.GAME.PACK_INTERRUPT = G.STATE;
  G.STATE = STATES.BUFFOON_PACK;
  G.GAME.pack_choices = 2;
  const pk = ['j_joker', 'j_greedy_joker', 'j_lusty_joker'].map((k) => { const c = create_card('Joker', G.pack_cards, null, null, null, null, k); G.pack_cards.emplace(c); return c; });
  const r = act({ type: 'use', id: pk[1].sort_id });
  ok(r.ok && pk.every((c) => c.area === G.jokers), 'Domino: pack pick + neighbours taken', [r.error, pk.map((c) => c.area && c.area.name)]);
  ok(G.GAME.pack_choices === 0 && G.STATE === STATES.SHOP, 'Domino: emptied pack closes', [G.GAME.pack_choices, G.STATE]);
}

// ---------------------------------------------------------------- Glue Gun
{
  start('BJC-GLUE');
  const gg = add('j_bunc_glue_gun');
  const cs = hand(['S_2', 'H_3', 'C_4']);
  hand(['D_5']);
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  ok(describe(gg).lines.join(' ').includes('{C:green}'), 'Glue Gun: active with 3 selected', describe(gg).lines);
  act({ type: 'sell', id: gg.sort_id });
  const g = cs[0].ability.group;
  ok(g && g.source === 'j_bunc_glue_gun' && cs.every((c) => c.ability.group && c.ability.group.id === g.id), 'Glue Gun: selected cards linked', cs.map((c) => c.ability.group));
  const gg2 = add('j_bunc_glue_gun');
  const many = hand(['S_6', 'H_7', 'C_8', 'D_9', 'S_T']);
  G.hand.unhighlight_all && G.hand.unhighlight_all();
  act({ type: 'highlight', ids: many.map((c) => c.sort_id) });
  act({ type: 'sell', id: gg2.sort_id });
  ok(many.every((c) => !c.ability.group), 'Glue Gun: more than 4 selected -> nothing linked');
}

// ---------------------------------------------------------------- Taped
{
  start('BJC-TAPED');
  add('j_bunc_taped');
  G.GAME.blind.boss = true;
  const cs = hand(['S_2', 'H_3', 'C_4']);
  play(cs);
  ok(cs[0].ability.group && cs.every((c) => c.ability.group && c.ability.group.id === cs[0].ability.group.id) && cs[0].ability.group.source === 'j_bunc_taped', 'Taped: first boss hand linked');
  const cs2 = hand(['S_5', 'H_6']);
  play(cs2);
  ok(cs2.every((c) => !c.ability.group), 'Taped: second hand not linked');
  start('BJC-TAPED2');
  add('j_bunc_taped');
  const cs3 = hand(['S_5', 'H_6']);
  play(cs3);
  ok(cs3.every((c) => !c.ability.group), 'Taped: not on a non-boss blind');
}

// ---------------------------------------------------------------- Rubber Band Ball
{
  start('BJC-RBB');
  ok(!P_CENTERS.j_bunc_rubber_band_ball.in_pool(), 'Rubber Band Ball: not in pool before any link');
  const j = add('j_bunc_rubber_band_ball');
  let r = play(hand(['S_2']));
  ok(same(tot(r), [7, 1, 7]), 'Rubber Band Ball: X1 (no effect) with no links', tot(r));
  G.GAME.last_card_group = 2;
  ok(P_CENTERS.j_bunc_rubber_band_ball.in_pool(), 'Rubber Band Ball: in pool once linked');
  r = play(hand(['S_2']));
  ok(same(tot(r), [7, 3, 21]) && j.ability.extra.xmult === 3, 'Rubber Band Ball: 2 links -> X3', tot(r));
}

// ---------------------------------------------------------------- Games Collector
{
  start('BJC-GAMES');
  const j = add('j_bunc_games_collector');
  j.calculate_joker({ groups_drawn: [{ id: 1, source: 'x' }, { id: 2, source: 'x' }] });
  flush();
  ok(j.ability.extra.chips === 20, 'Games Collector: +10 Chips per group drawn', j.ability.extra.chips);
  const r = play(hand(['S_2']));
  ok(same(tot(r), [27, 1, 27]), 'Games Collector: +20 Chips', tot(r));
}

// ---------------------------------------------------------------- Jumper
{
  start('BJC-JUMPER');
  const j = add('j_bunc_jumper');
  let r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(j.ability.extra.chips === 8 && tot(r)[0] === 35 + 30 + 8, 'Jumper: Flush -> +8 Chips, scores at once', tot(r));
  r = play(hand(['H_2']));
  ok(j.ability.extra.chips === 8 && tot(r)[0] === 7 + 8, 'Jumper: keeps +8 on a non-Flush', tot(r));
}

// ---------------------------------------------------------------- Stylophone
{
  start('BJC-STYLO');
  add('j_bunc_stylophone');
  let r = play(hand(['S_A']));
  ok(near(tot(r)[1], 1 + 14 * 0.3), 'Stylophone: Ace gives X0.3 of rank 14 Mult', tot(r));
  r = play(hand(['S_A'], 'm_stone'));
  ok(near(tot(r)[1], 1), 'Stylophone: Stone card gives nothing', tot(r));
}

// ---------------------------------------------------------------- Kite Experiment + Robot
{
  start('BJC-KITE');
  const kite = add('j_bunc_kite_experiment');
  const robot = add('j_bunc_robot');
  ok(!P_CENTERS.j_bunc_kite_experiment.in_pool() && !P_CENTERS.j_bunc_robot.in_pool(), 'Kite / Robot: not in pool without Copper');
  if (P_CENTERS.m_bunc_copper) {
    G.playing_cards[0].set_ability(P_CENTERS.m_bunc_copper);
    ok(P_CENTERS.j_bunc_kite_experiment.in_pool() && P_CENTERS.j_bunc_robot.in_pool(), 'Kite / Robot: in pool with a Copper card');
  } else console.log('NOTE: m_bunc_copper not registered yet (enhancements.js) — Copper pool check skipped');
  G.GAME.probabilities.normal = 2; // 2 in 2
  const [c1, c2] = hand(['S_5', 'H_5']);
  c1.config.copper_rescored_times = 1; c2.config.copper_rescored_times = 1;
  let out = calculate_context({ rescore_cards: [c1, c2] });
  ok(c1.config.copper_rescored_times === 0 && kite.ability.extra.cards_rescored.length === 1, 'Kite Experiment: lead card rescored once more');
  ok(out.some(([c, e]) => c === kite && e.message === '+1'), 'Kite Experiment: +1 message');
  ok(robot.ability.extra.mult === 6, 'Robot: +3 Mult per rescored card', robot.ability.extra.mult);
  c1.config.copper_rescored_times = 1;
  calculate_context({ rescore_cards: [c1, c2] });
  ok(c1.config.copper_rescored_times === 1, 'Kite Experiment: only one extra rescore per card');
  ok(robot.ability.extra.mult === 12, 'Robot: 12 Mult', robot.ability.extra.mult);
  const r = play(hand(['S_2']));
  ok(same(tot(r), [7, 13, 91]) && kite.ability.extra.cards_rescored.length === 0, 'Robot: +12 Mult; Kite list cleared after play', tot(r));
}

// ---------------------------------------------------------------- Hardtack / Pica
{
  start('BJC-CRACK');
  ok(!P_CENTERS.j_bunc_hardtack.in_pool() && !P_CENTERS.j_bunc_pica.in_pool(), 'Hardtack / Pica: not in pool without Cracker');
  if (P_CENTERS.m_bunc_cracker) {
    G.playing_cards[0].set_ability(P_CENTERS.m_bunc_cracker);
    ok(P_CENTERS.j_bunc_hardtack.in_pool() && P_CENTERS.j_bunc_pica.in_pool(), 'Hardtack / Pica: in pool with a Cracker card');
  } else console.log('NOTE: m_bunc_cracker not registered yet (enhancements.js) — Cracker pool check skipped');
}

// ---------------------------------------------------------------- Exotic pool isolation
{
  start('BJC-EXOTIC');
  ok(!P_CENTERS.j_bunc_zealous.in_pool() && !P_CENTERS.j_bunc_rigoletto.in_pool(), 'Exotic jokers: out of the pool until the Exotic System is on');
  G.GAME.Exotic = true;
  ok(P_CENTERS.j_bunc_zealous.in_pool() && P_CENTERS.j_bunc_rigoletto.in_pool(), 'Exotic jokers: in the pool with exotics enabled');
}

// ---------------------------------------------------------------- Zealous / Lurid / Dynasty
{
  start('BJC-SPEC');
  ok(handName(hand(SPECTRUM)) === 'bunc_Spectrum', 'a Spectrum', handName(G.hand.cards));
  const z = add('j_bunc_zealous');
  let r = play(G.hand.cards.slice());
  ok(same(tot(r), [85, 16, 1360]), 'Zealous: +10 Mult on a Spectrum', tot(r));
  r = play(hand(['S_2']));
  ok(same(tot(r), [7, 1, 7]), 'Zealous: nothing without a Spectrum', tot(r));
  z.remove(); flush();
  const l = add('j_bunc_lurid');
  r = play(hand(SPECTRUM));
  ok(same(tot(r), [165, 6, 990]), 'Lurid: +80 Chips on a Spectrum', tot(r));
  l.remove(); flush();
  add('j_bunc_dynasty');
  r = play(hand(SPECTRUM));
  ok(same(tot(r), [85, 30, 2550]), 'Dynasty: X5 Mult on a Spectrum', tot(r));
  r = play(hand(['S_2']));
  ok(same(tot(r), [7, 1, 7]), 'Dynasty: nothing without a Spectrum', tot(r));
}

// ---------------------------------------------------------------- Envious / Proud / Unobtanium
{
  start('BJC-SUITS');
  const e = add('j_bunc_envious');
  let r = play(hand(['bunc_FLEURON_5']));
  ok(same(tot(r), [10, 7, 70]), 'Envious: Fleuron +6 Mult', tot(r));
  r = play(hand(['S_5']));
  ok(same(tot(r), [10, 1, 10]), 'Envious: not on Spades', tot(r));
  e.remove(); flush();
  const p = add('j_bunc_proud');
  r = play(hand(['bunc_HALBERD_5']));
  ok(same(tot(r), [10, 7, 70]), 'Proud: Halberd +6 Mult', tot(r));
  p.remove(); flush();
  add('j_bunc_unobtanium');
  r = play(hand(['bunc_HALBERD_5']));
  ok(same(tot(r), [40, 7, 280]), 'Unobtanium: Halberd +30 Chips +6 Mult', tot(r));
  r = play(hand(['bunc_FLEURON_5']));
  ok(same(tot(r), [10, 1, 10]), 'Unobtanium: not on Fleurons', tot(r));
}

// ---------------------------------------------------------------- Wishalloy
{
  start('BJC-WISH');
  add('j_bunc_wishalloy');
  G.GAME.probabilities.normal = 7;
  const d0 = G.GAME.dollars;
  play(hand(['bunc_FLEURON_K']));
  flush();
  ok(G.GAME.dollars === d0 + 10, 'Wishalloy: Fleuron King earns $10 (its chips)', G.GAME.dollars - d0);
  play(hand(['S_K'])); flush();
  ok(G.GAME.dollars === d0 + 10, 'Wishalloy: not on Spades');
}

// ---------------------------------------------------------------- Magic Wand
{
  start('BJC-WAND');
  const j = add('j_bunc_magic_wand');
  let r = play(hand(SPECTRUM));
  ok(j.ability.extra.mult === 3 && tot(r)[1] === 9, 'Magic Wand: +3 Mult on a Spectrum', tot(r));
  r = play(hand(SPECTRUM));
  ok(j.ability.extra.mult === 6 && tot(r)[1] === 12, 'Magic Wand: consecutive -> +6', tot(r));
  r = play(hand(['S_2']));
  ok(j.ability.extra.mult === 0 && tot(r)[1] === 7 && msgs(r.events).includes('Reset'), 'Magic Wand: scores, then resets after a non-Spectrum', [tot(r), msgs(r.events)]);
}

// ---------------------------------------------------------------- Starfruit
{
  start('BJC-STAR');
  const j = add('j_bunc_starfruit');
  const lv = G.GAME.hands.bunc_Spectrum.level;
  play(hand(SPECTRUM));
  ok(G.GAME.hands.bunc_Spectrum.level === lv + 1, 'Starfruit: levels up the Spectrum');
  play(hand(['S_2']));
  ok(G.GAME.hands['High Card'].level === 1, 'Starfruit: not without a Spectrum');
  G.GAME.probabilities.normal = 0;
  toShop();
  ok(j.area === G.jokers, 'Starfruit: safe on a failed roll');
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  G.GAME.probabilities.normal = 4;
  toShop();
  ok(!G.jokers.cards.includes(j), 'Starfruit: eaten at end of round (4 in 4)');
}

// ---------------------------------------------------------------- Fondue
{
  start('BJC-FONDUE');
  add('j_bunc_fondue');
  ok(!G.GAME.Exotic, 'exotics off');
  const cs = hand(['S_5', 'H_5', 'C_9']);
  play(cs);
  ok(G.GAME.Exotic === true, 'Fondue: enables the Exotic System');
  ok(cs[0].base.suit === 'bunc_Fleurons' && cs[1].base.suit === 'bunc_Fleurons' && cs[2].base.suit === 'Clubs', 'Fondue: scored cards became Fleurons', cs.map((c) => c.base.suit));
  const cs2 = hand(['S_6']);
  play(cs2);
  ok(cs2[0].base.suit === 'Spades', 'Fondue: only the first hand of the round');
}

// ---------------------------------------------------------------- Myopia / Astigmatism
{
  start('BJC-EYES');
  const [s, c, h, d] = hand(['S_5', 'C_5', 'H_5', 'D_5']);
  ok(!s.is_suit('bunc_Halberds') && !h.is_suit('bunc_Fleurons'), 'no joker: base suits only');
  const my = add('j_bunc_myopia');
  ok(s.is_suit('bunc_Halberds') && c.is_suit('bunc_Halberds') && s.is_suit('Spades') && !s.is_suit('Clubs') && !h.is_suit('bunc_Halberds'), 'Myopia: Spades and Clubs count as Halberds');
  my.remove(); flush();
  add('j_bunc_astigmatism');
  ok(h.is_suit('bunc_Fleurons') && d.is_suit('bunc_Fleurons') && !h.is_suit('Diamonds') && !s.is_suit('bunc_Fleurons'), 'Astigmatism: Hearts and Diamonds count as Fleurons');
  add('j_bunc_proud');
  clearJokers();
  add('j_bunc_myopia'); add('j_bunc_proud');
  const r = play(hand(['S_5']));
  ok(same(tot(r), [10, 7, 70]), 'Myopia + Proud: a Spade scores as a Halberd', tot(r));
}

// ---------------------------------------------------------------- ROYGBIV
{
  start('BJC-ROY');
  add('j_bunc_roygbiv');
  G.GAME.probabilities.normal = 7;
  const cs = hand(SPECTRUM);
  cs[0].set_edition({ foil: true }, true, true);
  play(cs);
  ok(cs[0].edition.foil && cs.slice(1).every((c) => c.edition && c.edition.polychrome), 'ROYGBIV: editionless scored cards become Polychrome', cs.map((c) => c.edition));
  const n = hand(['S_2', 'S_3']);
  play(n);
  ok(n.every((c) => !c.edition), 'ROYGBIV: not without a Spectrum');
}

// ---------------------------------------------------------------- Rigoletto
{
  start('BJC-RIGO');
  const j = add('j_bunc_rigoletto');
  hand(['bunc_FLEURON_5', 'bunc_HALBERD_6', 'bunc_FLEURON_7']);
  const n = G.playing_cards.filter((c) => c.base.suit === 'bunc_Fleurons' || c.base.suit === 'bunc_Halberds').length;
  ok(n === 3, 'three exotic cards in the deck', n);
  const r = play(hand(['S_2']));
  ok(near(tot(r)[1], 1 + 3 * 0.2) && near(j.ability.extra.xmult, 1.6), 'Rigoletto: X0.2 per Exotic card (X1.6)', tot(r));
  ok(describe(j).lines.join(' ').includes('1.6'), 'Rigoletto: description current', describe(j).lines);
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
void T; void discard;
done();
