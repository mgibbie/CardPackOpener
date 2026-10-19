// More Fluff jokers, part C (micatro/mods/morefluff/jokers_c.js, 1.9.9999): all 26 fired through real act() plays with
// the mod's numbers, every describe() filled, and one test per intended-design fix (see the module header).
//   node micatro/tests/mods/morefluff_jokers_c_test.mjs
import {
  ok, near, flush, done, start, hand, add, clearJokers, clearConsumables, clearHand, play, discard, winRound, nextRound, toShop,
  msgs, tot, filled, G, P_CENTERS, act, STATES,
} from './morefluff_helpers.mjs';
import { P_JOKER_RARITY_POOLS, P_CENTER_POOLS, P_BLINDS, probability_vars, get_blind_amount, add_joker } from '../../js/engine/core.js';
import { describe } from '../../js/engine/describe.js';

const KEYS = 'recycling virtual wilddrawfour yuckyrat allicantdo bloodpact bookmove brass bowlingball cba fleshprison grep hugejoker hyperjimbo jankman mashupalbum pixeljoker rainbowjoker rosetinted the_solo top10 widejoker triangle marigold lessfluff oopsallfives'.split(' ').map((k) => 'j_mf_' + k);
const S2 = () => play(hand(['S_2']));

// ------------------------------------------------------------- registration / text
start('MFC0');
ok(KEYS.every((k) => P_CENTERS[k] && P_CENTERS[k].mod === 'morefluff'), 'all 26 registered');
const RET = ['j_mf_virtual', 'j_mf_wilddrawfour', 'j_mf_fleshprison', 'j_mf_mashupalbum', 'j_mf_rosetinted'];
ok(KEYS.filter((k) => k !== 'j_mf_oopsallfives' && !RET.includes(k)).every((k) => [1, 2, 3, 4].some((r) => P_JOKER_RARITY_POOLS[r].includes(P_CENTERS[k]))), 'the active ones in the rarity pools');
ok(RET.every((k) => P_CENTERS[k].rarity === 'mf_oldfluff' && P_JOKER_RARITY_POOLS.mf_oldfluff.includes(P_CENTERS[k]) && ![1, 2, 3, 4].some((r) => P_JOKER_RARITY_POOLS[r].includes(P_CENTERS[k]))), '1.9.9999 retires Virtual / Wild Draw Four / Flesh Prison / Mashup Album / Rose-Tinted Glasses to Old Fluff');
ok(RET.every((k) => P_CENTERS[k].atlas === 'mf_jokers_156'), 'the retired jokers keep their 1.5.6 art (1.9.9999: placeholder sketches)');
ok(![1, 2, 3, 4].some((r) => P_JOKER_RARITY_POOLS[r].includes(P_CENTERS.j_mf_oopsallfives)) && P_CENTERS.j_mf_oopsallfives.rarity === 'mf_token', 'Token rarity: never rolled from 1-4');
ok(P_CENTERS.j_mf_triangle.rarity === 4 && P_CENTERS.j_mf_marigold.rarity === 4 && P_CENTERS.j_mf_brass.enhancement_gate === 'm_mf_brass' && !P_CENTERS.j_mf_wilddrawfour.enhancement_gate, 'rarities / gates from the Lua (1.9.9999: Wild Draw Four ungated)');
for (const k of KEYS) { const j = add(k); const d = describe(j); ok(filled(d) && d.lines.length > 0, 'describe filled ' + k, d.lines); j.remove(); }
flush();

// ------------------------------------------------------------- Recycling
{
  start('MFC1');
  add('j_mf_recycling');
  toShop();
  G.GAME.dollars = 100;
  const pack = G.shop_booster.cards[0];
  ok(act({ type: 'buy', id: pack.sort_id }).ok, 'open a pack');
  ok(act({ type: 'skip_booster' }).ok, 'skip it');
  ok(G.consumeables.cards.length === 1 && ['Tarot', 'Planet'].includes(G.consumeables.cards[0].ability.set), 'Recycling: Tarot or Planet on skip', G.consumeables.cards.map((c) => c.ability.set));
}

// ------------------------------------------------------------- Virtual Joker
{
  start('MFC2', { noBlind: true });
  const v = add('j_mf_virtual'); add('j_joker');
  act({ type: 'select_blind' }); clearHand();
  ok(G.jokers.cards.every((j) => j.facing === 'back'), 'Virtual: jokers flipped on blind select');
  const r = play(hand(['S_2', 'H_2']));
  const vFirst = G.jokers.cards[0] === v; // (shuffled: X3 before or after the Joker's +4)
  const m = vFirst ? 2 * 3 + 4 : (2 + 4) * 3;
  ok(r.total.chips === 14 && near(r.total.mult, m) && r.total.total === 14 * m, 'Virtual: X3 (pair, +4 Joker, in the shuffled order)', tot(r));
  ok(v.ability.extra === 3, 'Virtual extra 3');
}

// ------------------------------------------------------------- Wild Draw Four
{
  start('MFC3');
  const w = add('j_mf_wilddrawfour');
  play(hand(['S_A'], 'm_wild'));
  ok(G.hand.config.card_limit === 12 && w.ability.h_size === 4, 'Wild Draw Four: +4 hand size per Wild scored', G.hand.config.card_limit);
  play(hand(['S_K', 'H_K'], 'm_wild'));
  ok(G.hand.config.card_limit === 20 && w.ability.h_size === 12, 'two more Wilds: +8', G.hand.config.card_limit);
  nextRound();
  ok(G.hand.config.card_limit === 8 && w.ability.h_size === 0, 'reset at end of round', G.hand.config.card_limit);
}

// ------------------------------------------------------------- Yucky Rat
{
  start('MFC4');
  const y = add('j_mf_yuckyrat');
  const cards = hand(['S_2', 'H_2']);
  const r = play(cards);
  ok(near(y.ability.extra.x_mult, 1.1), 'Yucky Rat: +X0.05 per unenhanced card', y.ability.extra.x_mult);
  ok(r.total.chips === 14 && near(r.total.mult, 2.2) && r.total.total === 30, 'Yucky Rat scores its new X1.1 the same hand', tot(r));
  ok(cards.every((c) => c.config.center.key === 'm_mf_yucky'), 'played cards became Yucky');
  const y2 = play(hand(['S_3'], 'm_bonus'));
  ok(near(y.ability.extra.x_mult, 1.1), 'enhanced cards are left alone');
}

// ------------------------------------------------------------- All I Can't Do
{
  start('MFC5', { noBlind: true });
  const a = add('j_mf_allicantdo');
  act({ type: 'select_blind' });
  ok(G.hand.cards.length === 8 && G.hand.cards.every((c) => c.debuff && c.ability.debuff_sources.allicantdo), 'All I Can\'t Do: first drawn hand debuffed');
  const c = G.hand.cards[0];
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: [c.sort_id] });
  const r = act({ type: 'play' });
  const t = r.events.find((e) => e.type === 'hand_total');
  ok(near(a.ability.extra.x_mult, 1.1) && near(t.mult, 1.1) && t.chips === 5, 'gains X0.1 per played debuffed card (and scores it)', t);
  ok(msgs(r.events).includes('X1.1 Mult'), 'popup X1.1 Mult');
  G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' });
  ok(G.STATE === STATES.ROUND_EVAL, 'round won');
  ok(G.playing_cards.every((c) => !c.debuff && !c.ability.debuff_sources?.allicantdo), 'round eval: the debuffs leave the deck');
}

// ------------------------------------------------------------- Blood Pact
{
  start('MFC6');
  const b = add('j_mf_bloodpact');
  let r = play(hand(['H_2', 'H_2']));
  ok(r.total.total === 140, 'Blood Pact: X5 on all-Hearts', tot(r));
  r = play(hand(['H_2', 'S_2']));
  flush();
  ok(r.total.total === 28 && !G.jokers.cards.includes(b) && msgs(r.events).includes('Extinct!'), 'a non-Heart: self destructs', tot(r));
}

// ------------------------------------------------------------- Book Move
{
  start('MFC7');
  const b = add('j_mf_bookmove');
  nextRound(); nextRound();
  ok(b.ability.extra.c_rounds === 2, 'Book Move counts rounds');
  nextRound();
  ok(b.ability.extra.c_rounds === 3, '3 rounds');
  ok(act({ type: 'sell', id: b.sort_id }).ok, 'sell');
  const ks = G.jokers.cards.map((j) => j.config.center.key);
  ok(ks.includes('j_hanging_chad') && ks.includes('j_photograph') && ks.length === 2, 'sold after 3 rounds: Hanging Chad + Photograph', ks);
  start('MFC7b');
  const b2 = add('j_mf_bookmove');
  nextRound();
  act({ type: 'sell', id: b2.sort_id });
  ok(G.jokers.cards.length === 0, 'sold early: nothing');
}

// ------------------------------------------------------------- Brass Joker
{
  start('MFC8');
  const br = add('j_mf_brass'); add('j_joker');
  let r = S2();
  ok(r.total.total === 35, 'Brass Joker with no retriggers: plain', tot(r));
  G.GAME.probabilities.normal = 3; // 3 in 3: every Brass Card breaks
  play(hand(['S_5', 'H_5', 'D_5'], 'm_mf_brass'));
  G.GAME.probabilities.normal = 1;
  ok(br.ability.upgrade_rounds === 3 && br.ability.retriggers === 1 && br.ability.partial_rounds === 0, 'three Brass Cards destroyed (1.9.9999: 3 a level): +1 retrigger', br.ability);
  r = S2();
  ok(r.total.chips === 7 && r.total.mult === 9 && r.total.total === 63 && msgs(r.events).includes('Again!'), 'retriggers the joker to its right', tot(r));
  ok(/Currently {C:attention}1{/.test(describe(br).lines.join(' ')), 'describe shows the retriggers');
}

// ------------------------------------------------------------- Bowling Ball / Pixel Joker / Triangle
{
  start('MFC9');
  add('j_mf_bowlingball');
  let r = play(hand(['S_3']));
  ok(r.total.chips === 68 && r.total.mult === 11 && r.total.total === 748, 'Bowling Ball: 3s +60 Chips +10 Mult', tot(r));
  clearJokers(); add('j_mf_pixeljoker');
  r = play(hand(['S_A']));
  ok(r.total.total === 24, 'Pixel Joker: Ace X1.5', tot(r));
  r = play(hand(['S_4', 'H_9']));
  ok(near(r.total.mult, 1.5) && r.total.chips === 14, 'Pixel Joker: 9 X1.5 (high card scores the 9 only)', tot(r));
  clearJokers(); add('j_mf_triangle');
  r = play(hand(['S_2', 'H_2', 'D_2']));
  ok(r.total.chips === 36 && r.total.mult === 81 && r.total.total === 2916, 'Triangle: X3 per card on Three of a Kind', tot(r));
  r = play(hand(['S_2', 'H_2']));
  ok(r.total.total === 28, 'Triangle: not on a Pair', tot(r));
}

// ------------------------------------------------------------- Card Buffer Advanced
{
  start('MFC10');
  add('j_joker', 'holo'); add('j_joker');
  let r = S2();
  ok(r.total.total === 133, 'no CBA: 1 + 10 + 4 + 4', tot(r));
  add('j_mf_cba');
  r = S2();
  ok(r.total.mult === 23 && r.total.total === 161 && msgs(r.events).includes('Again!'), 'CBA retriggers the first editioned joker', tot(r));
}

// ------------------------------------------------------------- Complexity Creep (deleted in 1.9.9999)
{
  start('MFC11');
  ok(!P_CENTERS.j_mf_complexitycreep, 'Complexity Creep is not registered (a retired key: aliases.js)');
}

// ------------------------------------------------------------- Flesh Prison
{
  start('MFC12', { noBlind: true });
  const f = add('j_mf_fleshprison');
  act({ type: 'skip_blind' }); act({ type: 'skip_blind' });
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.chips === get_blind_amount(1) * P_BLINDS.bl_wall.mult * 5, 'Flesh Prison: X5 Boss Blind size', G.GAME.blind.chips);
  clearConsumables();
  winRound(); flush();
  const soul = G.consumeables.cards.find((c) => c.config.center.key === 'c_soul');
  ok(soul && soul.edition && soul.edition.negative && !G.jokers.cards.includes(f), 'boss beaten: Negative Soul, self destructs');
}

// ------------------------------------------------------------- Grep
{
  start('MFC13');
  add('j_mf_grep');
  const [c] = hand(['S_A']);
  const r = discard([c]);
  const match = (x) => x.get_id() === 14 || x.base.suit === 'Spades';
  const n = G.deck.cards.filter(match).length;
  ok(n > 0 && G.deck.cards.slice(-n).every(match) && msgs(r.events).some((m) => /^Found \d+$/.test(m)), 'Grep: matching rank/suit on top of the deck ("Found n")', msgs(r.events));
  const top = G.hand.cards.filter((x) => x.sort_id !== c.sort_id);
  ok(top.length && top.every(match), 'the redraw comes from them', top.map((x) => x.config.card.key));
}

// ------------------------------------------------------------- Huge Joker
{
  start('MFC14');
  add('j_mf_hugejoker');
  ok(G.hand.config.card_limit === 6, 'Huge Joker: -2 hand size');
  ok(S2().total.total === 21, 'X3');
  ok(describe(G.jokers.cards[0]).lines.join(' ').includes('-2'), 'text -2');
}

// ------------------------------------------------------------- Hyperjimbo
{
  start('MFC15');
  add('j_mf_hyperjimbo');
  const r = play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  const c0 = 20 * Math.pow(20, Math.pow(20, 0.04) - 1);
  ok(near(r.total.chips, c0 + 10, 1e-6) && r.total.total === Math.floor((c0 + 10) * 2), 'Hyperjimbo: 4 cards -> chips^^1.04 before scoring', tot(r));
  ok(msgs(r.events).includes('^^1.04 Chips'), 'popup');
  ok(play(hand(['S_2', 'H_2', 'D_2'])).total.chips === 36, 'not with 3 cards');
}

// ------------------------------------------------------------- Jankman
{
  start('MFC16');
  add('j_joker'); add('j_jolly'); add('j_mf_jankman');
  const r = S2();
  ok(near(r.total.chips, 7 * 1.31 * 1.31) && r.total.mult === 5 && r.total.total === 60, 'Jankman: X1.31 Chips per modded joker (+ Jolly Joker, + itself)', tot(r));
}

// ------------------------------------------------------------- Mashup Album
{
  start('MFC17');
  const m = add('j_mf_mashupalbum');
  let r = S2();
  ok(r.total.chips === 22 && r.total.mult === 5, 'Mashup Album: +15 Chips +4 Mult', tot(r));
  r = play(hand(['H_2', 'H_3', 'H_4', 'H_5', 'H_7']));
  ok(m.ability.extra.mult === 8 && r.total.chips === 71 && r.total.mult === 12, 'red flush: +4 Mult', tot(r));
  play(hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_7']));
  ok(m.ability.extra.chips === 30, 'black flush: +15 Chips');
}

// ------------------------------------------------------------- Rainbow Joker
{
  start('MFC18');
  add('j_mf_rainbowjoker');
  add_joker('c_mf_red'); flush();
  let r = S2();
  ok(r.total.total === 10, 'Rainbow Joker: X1.5 per Colour card', tot(r));
  add_joker('c_mf_blue'); add_joker('c_fool'); flush();
  r = S2();
  ok(near(r.total.mult, 2.25), 'two Colour cards, a Tarot ignored', tot(r));
}

// ------------------------------------------------------------- Rose-Tinted Glasses
{
  start('MFC19');
  add('j_mf_rosetinted');
  const [c] = hand(['S_2']);
  play([c]); flush();
  ok(!G.playing_cards.includes(c) && G.GAME.tags.some((t) => t.key === 'tag_double'), 'first hand a single 2: destroyed, Double Tag');
  const [c2] = hand(['H_2']);
  play([c2]); flush();
  ok(G.playing_cards.includes(c2) && G.GAME.tags.filter((t) => t.key === 'tag_double').length === 1, 'not on a later hand');
}

// ------------------------------------------------------------- The Solo
{
  start('MFC20');
  const s = add('j_mf_the_solo');
  S2();
  ok(near(s.ability.extra.x_mult, 1.1), 'The Solo: +X0.1 on a 1-card hand');
  const r = play(hand(['S_2', 'H_2']));
  ok(near(s.ability.extra.x_mult, 1.1) && near(r.total.mult, 2.2), 'not on a pair, scores X1.1', tot(r));
}

// ------------------------------------------------------------- Top 10
{
  start('MFC21');
  add('j_mf_top10');
  G.GAME.dollars = 1203;
  winRound();
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_mf_top10');
  ok(row && row.dollars === 20, 'Top 10: $5 per unique digit (1203 -> 4)', row);
}

// ------------------------------------------------------------- Wide Joker
{
  start('MFC22');
  add('j_joker'); add('j_mf_widejoker');
  const r = S2();
  ok(near(r.total.mult, Math.pow(5, 1.14)) && r.total.total === Math.floor(7 * Math.pow(5, 1.14)) && msgs(r.events).includes('^1.14 Mult'), 'Wide Joker: ^1.14 Mult', tot(r));
}

// ------------------------------------------------------------- Marigold
{
  const winHeld = () => { G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }); act({ type: 'play' }); flush(); };
  start('MFC23');
  hand(['S_5'], 'm_mf_marigold');
  let d0 = G.GAME.dollars; winHeld();
  const base = G.GAME.dollars - d0;
  start('MFC23b');
  add('j_mf_marigold');
  hand(['S_5'], 'm_mf_marigold');
  d0 = G.GAME.dollars; winHeld();
  ok(base === 1 && G.GAME.dollars - d0 === 3, 'Marigold: held Marigold Cards retrigger twice ($1 -> $3)', [base, G.GAME.dollars - d0]);
}

// ------------------------------------------------------------- Less Fluff
{
  start('MFC24', { noBlind: true });
  add('j_joker'); const lf = add('j_mf_lessfluff'); const tri = add('j_mf_triangle'); const lf2 = add('j_mf_lessfluff');
  const r = act({ type: 'select_blind' }); flush(); clearHand();
  ok(!G.jokers.cards.includes(tri) && !G.jokers.cards.includes(lf2) && G.jokers.cards.length === 2, 'Less Fluff (1.9.9999) destroys every other modded joker — another Less Fluff too — not base ones');
  ok(near(lf.ability.extra.x_mult, 1.4), 'X0.2 per joker destroyed', lf.ability.extra.x_mult);
  ok(msgs(r.events).includes('X1.4 Mult'), 'fix 4: popup X1.4 Mult', msgs(r.events));
  ok(S2().total.total === 49, 'scores X1.4');
}

// ------------------------------------------------------------- Oops! All 5s
{
  start('MFC25');
  ok(probability_vars(null, 1, 5).join() === '1,5', 'no Token: 1 in 5');
  add('j_mf_oopsallfives');
  ok(probability_vars(null, 1, 5).join() === '1,4' && probability_vars(null, 1, 1.5).join() === '1,1', 'Token: denominators -1 (1.5 -> 1)');
  add('j_mf_oopsallfives');
  ok(probability_vars(null, 1, 5).join() === '1,3', 'two Tokens: -2');
  const gm = add('j_gros_michel');
  ok(describe(gm).lines.join(' ').length > 0, 'still describes');
}

done();
