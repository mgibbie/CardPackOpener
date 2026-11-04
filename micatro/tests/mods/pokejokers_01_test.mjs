// Pokermon pokejokers_01 (Bulbasaur -> Nidorina): every one of the 36 jokers fired through
// real plays (act), plus each line's evolution. Reference for the other pokejokers_NN tests.
//   node micatro/tests/mods/pokejokers_01_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, state, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;

// All 36 are ported (and registered with real behaviour).
const FILE_JOKERS = ['bulbasaur', 'ivysaur', 'venusaur', 'mega_venusaur', 'charmander', 'charmeleon', 'charizard', 'mega_charizard_x', 'mega_charizard_y',
  'squirtle', 'wartortle', 'blastoise', 'mega_blastoise', 'caterpie', 'metapod', 'butterfree', 'weedle', 'kakuna', 'beedrill', 'mega_beedrill',
  'pidgey', 'pidgeotto', 'pidgeot', 'mega_pidgeot', 'rattata', 'raticate', 'spearow', 'fearow', 'ekans', 'arbok', 'pikachu', 'raichu',
  'sandshrew', 'sandslash', 'nidoranf', 'nidorina'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 36 pokejokers_01 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_01.lua'].length === 38, 'defs: 38 from pokejokers_01.lua (36 + Mega Raichu X / Y, batch 16)', STATUS.PORTED_FILES['pokemon/pokejokers_01.lua'].length);

// ---------------------------------------------------------------- Bulbasaur line
{
  start('BULBA');
  const j = add('j_poke_bulbasaur');
  ok(G.hand.config.card_limit === 9, 'bulbasaur +1 hand size', G.hand.config.card_limit);
  const id = G.GAME.current_round.bulb1card.id;
  const rank = G.GAME.current_round.bulb1card.rank;
  const code = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[id];
  const held = hand(['H_' + code, 'D_' + code]);
  const other = hand(['S_' + (code === '2' ? '3' : '2')]);
  const d0 = G.GAME.dollars;
  const r = play(other);
  ok(G.GAME.dollars === d0 + 2 && j.ability.extra.earned === 2, 'bulbasaur: $1 per held ' + rank, { d: G.GAME.dollars - d0, e: j.ability.extra.earned });
  ok(statusMsgs(r.events).includes('$1'), 'bulbasaur: "$1" popup');
  // Money evolution: 16 earned -> Ivysaur at end of round (same card, hand size kept).
  j.ability.extra.earned = 16;
  const sid = j.sort_id;
  const w = winRound();
  ok(key(j) === 'j_poke_ivysaur' && j.sort_id === sid && G.jokers.cards[0] === j, 'bulbasaur evolves into ivysaur in place', key(j));
  ok(w.events.some((e) => e.type === 'poke_evolve' && e.from === 'j_poke_bulbasaur' && e.to === 'j_poke_ivysaur'), 'poke_evolve UI event');
  ok(G.hand.config.card_limit === 9, 'hand size unchanged across the evolution', G.hand.config.card_limit);
  // Ivysaur: $1 + coin flip per held card, evolves at 16.
  nextRound();
  const id2 = G.GAME.current_round.bulb1card.id;
  const c2 = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[id2];
  hand(['H_' + c2]);
  const d1 = G.GAME.dollars;
  play(hand(['S_' + (c2 === '2' ? '3' : '2')]));
  const gain = G.GAME.dollars - d1;
  ok((gain === 1 || gain === 2) && j.ability.extra.earned === gain, 'ivysaur: $1-2 per held card', { gain, e: j.ability.extra.earned });
  j.ability.extra.earned = 16;
  winRound();
  ok(key(j) === 'j_poke_venusaur', 'ivysaur evolves into venusaur', key(j));
  nextRound();
  const id3 = G.GAME.current_round.bulb1card.id;
  const c3 = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[id3];
  hand(['H_' + c3]);
  const d2 = G.GAME.dollars;
  play(hand(['S_' + (c3 === '2' ? '3' : '2')]));
  ok(G.GAME.dollars === d2 + 2, 'venusaur: $2 per held card', G.GAME.dollars - d2);
}
{
  start('MVENU');
  hand(['S_2', 'S_3']);
  const before = G.hand.config.card_limit;
  add('j_poke_mega_venusaur');
  ok(G.hand.config.card_limit === before + 4, 'mega venusaur +4 hand size', G.hand.config.card_limit);
  ok(G.hand.cards.length === 2 + 4, 'mega venusaur: the hand fills to the new size once (no extra draw of its own) (Pokermon 3.9.1)', G.hand.cards.length);
}

// ---------------------------------------------------------------- Charmander line
{
  start('CHARM');
  const d0 = G.GAME.current_round.discards_left, rd = G.GAME.round_resets.discards;
  const j = add('j_poke_charmander');
  ok(G.GAME.current_round.discards_left === d0 + 1 && G.GAME.round_resets.discards === rd + 1, 'charmander +1 discard');
  G.GAME.current_round.discards_left = 0;
  const r = play(hand(['S_A']));
  ok(j.ability.extra.mult === 1 && r.total.mult === 2, 'charmander: +1 Mult with 0 discards left, scored', { m: j.ability.extra.mult, t: r.total });
  G.GAME.current_round.discards_left = 1;
  play(hand(['S_K']));
  ok(j.ability.extra.mult === 1, 'charmander: no gain with discards left');
  j.ability.extra.mult = 16;
  winRound();
  ok(key(j) === 'j_poke_charmeleon' && j.ability.extra.mult === 16 && j.ability.extra.mult_mod === 2, 'charmander -> charmeleon keeps scaled mult', j.ability.extra);
  ok(G.GAME.round_resets.discards === rd + 1, 'discard bonus stays +1 across the evolution', G.GAME.round_resets.discards);
  nextRound();
  G.GAME.current_round.discards_left = 0;
  play(hand(['S_A']));
  ok(j.ability.extra.mult === 18, 'charmeleon: +2 Mult per hand at 0 discards', j.ability.extra.mult);
  j.ability.extra.mult = 36;
  G.GAME.current_round.discards_left = 1;
  winRound();
  ok(key(j) === 'j_poke_charizard' && j.ability.extra.mult === 36, 'charmeleon -> charizard at 36', j.ability.extra);
  nextRound();
  G.GAME.current_round.discards_left = 0;
  let r2 = play(hand(['S_A']));
  // High card 5+11=16 chips; mult (1+36)*1.5 = 55.5
  ok(r2.total.mult === 55.5, 'charizard: +36 Mult and X1.5 at 0 discards', r2.total);
  G.GAME.current_round.discards_left = 1;
  r2 = play(hand(['S_K']));
  ok(r2.total.mult === 37, 'charizard: just +36 Mult with discards left', r2.total);
}
{
  start('CHARX');
  const x = add('j_poke_mega_charizard_x');
  G.GAME.current_round.discards_left = 0;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 5, 'mega charizard X: X5 at 0 discards', r.total);
  const y0 = G.GAME.round_resets.discards;
  add('j_poke_mega_charizard_y');
  ok(G.GAME.round_resets.discards === y0 + 5, 'mega charizard Y: +5 discards', G.GAME.round_resets.discards);
  ok(x.ability.extra.Xmult === 5, 'mega X data');
}

// ---------------------------------------------------------------- Squirtle line
{
  start('SQUIRT');
  const j = add('j_poke_squirtle');
  ok(G.GAME.round_resets.hands === 5 && G.GAME.current_round.hands_left === 5, 'squirtle +1 hand', [G.GAME.round_resets.hands, G.GAME.current_round.hands_left]);
  const r = play(hand(['S_A']));
  // before: hands_left already 4 after the play started -> +4 chips; High card 5+11+4 = 20
  ok(j.ability.extra.chips === 4 && r.total.chips === 20, 'squirtle: +1 chip per hand left, scored', { c: j.ability.extra.chips, t: r.total });
  j.ability.extra.chips = 50;
  let hl = G.GAME.current_round.hands_left;
  winRound(); // the winning hand still adds +1 per hand left before the evolution
  ok(key(j) === 'j_poke_wartortle' && j.ability.extra.chips === 50 + (hl - 1), 'squirtle -> wartortle keeps its scaled chips', j.ability.extra);
  nextRound();
  const c0 = j.ability.extra.chips;
  play(hand(['S_A']));
  ok(j.ability.extra.chips === c0 + 2 * 4, 'wartortle: +2 chips per hand left', j.ability.extra.chips);
  j.ability.extra.chips = 120;
  hl = G.GAME.current_round.hands_left;
  winRound();
  ok(key(j) === 'j_poke_blastoise' && j.ability.extra.chips === 120 + 2 * (hl - 1), 'wartortle -> blastoise (chips above 120 carried)', j.ability.extra);
  nextRound();
  const r2 = play(hand(['S_A']));
  // chips + 25 * 4 hands left (+16 base)
  ok(r2.total.chips === 16 + j.ability.extra.chips + 25 * 4, 'blastoise: chips + 25 per hand left', r2.total);
  const bv = P_CENTERS.j_poke_blastoise.loc_vars(P_CENTERS.j_poke_blastoise, [], j).vars;
  ok(bv[3] === j.ability.extra.chips + 25 * G.GAME.current_round.hands_left, 'blastoise tooltip shows the current total (Pokermon 3.9.1)', bv);
  const h = G.GAME.round_resets.hands;
  add('j_poke_mega_blastoise');
  ok(G.GAME.round_resets.hands === h + 3, 'mega blastoise +3 hands', G.GAME.round_resets.hands);
}

// --------------------------------------------------- Caterpie / Weedle (level evolutions)
{
  start('CATER');
  const j = add('j_poke_caterpie');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 4, 'caterpie +3 Mult', r.total);
  winRound();
  ok(key(j) === 'j_poke_caterpie' && j.ability.extra.rounds === 1, 'caterpie: 1 round left', j.ability.extra.rounds);
  nextRound(); winRound();
  ok(key(j) === 'j_poke_metapod', 'caterpie -> metapod after 2 rounds', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 7, 'metapod +6 Mult', r.total);
  winRound(); nextRound(); winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_butterfree', 'metapod -> butterfree after 3 rounds', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 13, 'butterfree +12 Mult', r.total);
}
{
  start('WEED');
  const j = add('j_poke_weedle');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 36, 'weedle +20 chips', r.total);
  winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_kakuna', 'weedle -> kakuna', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 56, 'kakuna +40 chips', r.total);
  winRound(); nextRound(); winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_beedrill', 'kakuna -> beedrill', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 96, 'beedrill +80 chips', r.total);
  const m = add('j_poke_mega_beedrill');
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 + 80 + 640, 'mega beedrill +640 chips', r.total);
  ok(!!m, 'mega beedrill added');
}

// ---------------------------------------------------------------- Pidgey line
{
  start('PIDG');
  const j = add('j_poke_pidgey');
  // Pair of Aces (2 suits, 1 rank) -> 3 * 2 = +6 Mult; Pair: 10 chips, 2 mult
  let r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 + 6, 'pidgey: +2 Mult per distinct rank and suit', r.total);
  winRound(); nextRound(); winRound(); nextRound(); winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_pidgeotto', 'pidgey -> pidgeotto after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 + 9, 'pidgeotto: +3 per rank/suit', r.total);
  winRound(); nextRound(); winRound(); nextRound(); winRound(); nextRound(); winRound();
  ok(key(j) === 'j_poke_pidgeot', 'pidgeotto -> pidgeot', key(j));
  nextRound();
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 + 15, 'pidgeot: +5 per rank/suit', r.total);
  G.jokers.cards[0].remove();
  add('j_poke_mega_pidgeot');
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 * (1 + 0.75 * 3), 'mega pidgeot: X(1 + 0.75 per rank/suit)', r.total);
}

// ---------------------------------------------------------------- Rattata line
{
  start('RATT');
  const j = add('j_poke_rattata');
  // Three 2s: base 30 chips/3 mult, cards 2+2+2; first two retriggered -> +4 chips
  let r = play(hand(['S_2', 'H_2', 'D_2']));
  ok(r.total.chips === 30 + 6 + 4, 'rattata retriggers the first 2 scored cards', r.total);
  for (let i = 0; i < 5; i++) { winRound(); if (i < 4) nextRound(); }
  ok(key(j) === 'j_poke_raticate', 'rattata -> raticate after 5 rounds', key(j));
  nextRound();
  r = play(hand(['S_2', 'H_2', 'D_2']));
  ok(r.total.chips === 30 + 6 + 6, 'raticate retriggers the first 3', r.total);
}

// ---------------------------------------------------------------- Spearow / Fearow
{
  start('SPEAR');
  const j = add('j_poke_spearow');
  j.ability.extra.cards_drawn = 25;
  play(hand(['S_A'])); // the hand refills: 8 cards drawn during the Blind
  ok(j.ability.extra.upgrade === true && j.ability.extra.cards_drawn === 3, 'spearow: armed after drawing 30 cards, the rest carries (Pokermon 3.9.1)', j.ability.extra);
  const lvl = G.GAME.hands['High Card'].level;
  clearHand();
  play(hand(['S_K']));
  ok(G.GAME.hands['High Card'].level === lvl + 1 && j.ability.extra.upgrade === false && j.ability.extra.triggers === 1, 'spearow: next hand levels up, counts a trigger (Pokermon 3.9.1)', { lvl: G.GAME.hands['High Card'].level, ex: j.ability.extra });
  // Blueprint copies the level up now (blueprint_compat true).
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  j.ability.extra.upgrade = true;
  clearHand();
  play(hand(['S_Q']));
  ok(G.GAME.hands['High Card'].level === lvl + 3 && j.ability.extra.triggers === 2, 'spearow: Blueprint copies the level up (Pokermon 3.9.1)', [G.GAME.hands['High Card'].level, j.ability.extra]);
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); bp.remove();
  j.ability.extra.upgrade = true; // the winning hand is the 3rd trigger
  const d0 = G.GAME.round_resets.discards;
  winRound();
  ok(key(j) === 'j_poke_fearow', 'spearow -> fearow after 3 triggers (Pokermon 3.9.1)', [key(j), j.ability.extra]);
  ok(G.GAME.round_resets.discards === d0 + 1, 'fearow +1 discard (Pokermon 3.9.1)', G.GAME.round_resets.discards - d0);
  nextRound();
  j.ability.extra.cards_drawn = 29;
  play(hand(['S_A']));
  ok(j.ability.extra.upgrade === true, 'fearow: armed after drawing 30 cards (Pokermon 3.9.1)', j.ability.extra);
  const lp = G.GAME.hands['High Card'].level;
  clearHand();
  play(hand(['S_K']));
  ok(G.GAME.hands['High Card'].level === lp + 1 && j.ability.extra.upgrade === false, 'fearow: levels up the next hand (Pokermon 3.9.1)', [G.GAME.hands['High Card'].level, j.ability.extra]);
}

// ---------------------------------------------------------------- Ekans / Arbok
{
  start('EKANS');
  const j = add('j_poke_ekans');
  let r = play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(r.total.mult === 4 + 10, 'ekans +10 Mult on a straight', r.total);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'ekans: nothing without a straight', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_arbok', 'ekans -> arbok after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_A', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(r.total.mult === 4 + 15, 'arbok +15 Mult on a straight', r.total);
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'arbok: straight with an Ace makes a Tarot', G.consumeables.cards.map(key));
  ok(statusMsgs(r.events).some((m) => /Tarot/.test(m)), 'arbok: "+1 Tarot" popup', statusMsgs(r.events));
  r = play(hand(['S_9', 'H_K', 'D_Q', 'C_J', 'S_T']));
  ok(G.consumeables.cards.length === 1 && r.total.mult === 4 + 15, 'arbok: no Tarot without an Ace', G.consumeables.cards.length);
  ok(statusMsgs(r.events).includes('+15 Mult'), 'arbok: shows +15 Mult (intended text)', statusMsgs(r.events));
}

// ---------------------------------------------------------------- Pikachu / Raichu
{
  start('PIKA', {}, { noBlind: true });
  const p = add('j_poke_pikachu');
  G.GAME.dollars = 10;
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === 12, 'pikachu: $2 when a Blind is selected under $25 (Pokermon 3.9.1)', G.GAME.dollars);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'pikachu: no Mult under $25 (Pokermon 3.9.1)', r.total);
  G.GAME.dollars = 25;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 10, 'pikachu: +10 Mult at $25 or more (Pokermon 3.9.1)', r.total);
  winRound();
  ok(!G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_pikachu'), 'pikachu: no cash-out money (Pokermon 3.9.1)', G.GAME.round_eval.rows);
  // Thunder Stone on Pikachu (highlighted joker) -> Raichu at the end of the round.
  act({ type: 'cash_out' });
  const ts = add('c_poke_thunderstone');
  ok(act({ type: 'use', id: ts.sort_id, joker_targets: [p.sort_id] }).ok, 'thunder stone usable on Pikachu');
  ok(p.ability.extra.evolve === true, 'thunder stone marks pikachu to evolve');
  act({ type: 'next_round' });
  G.GAME.dollars = 30; // >= 25: no Pikachu money
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === 30, 'pikachu: nothing at $25+', G.GAME.dollars);
  winRound();
  ok(key(p) === 'j_poke_raichu', 'pikachu -> raichu with a Thunder Stone', key(p));
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.dollars = 37;
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.dollars === 37 + 5, 'raichu: earns interest when a Blind is selected ($37 -> $5, the $25 cap) (Pokermon 3.9.1)', G.GAME.dollars);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 * 4, 'raichu: +4 Mult per $10 ($44 -> +16) (Pokermon 3.9.1)', r.total);
  ok(!(p.edition && p.edition.negative), 'raichu no longer turns Negative (Pokermon 3.9.1)', p.edition);
}

// ---------------------------------------------------------------- Sandshrew / Sandslash
{
  start('SAND');
  const j = add('j_poke_sandshrew');
  const glass = hand(['S_A', 'H_A'], { center: 'm_glass' });
  let r = play([glass[0]]);
  ok(r.total.chips === 5 + 11 + 25 * 2, 'sandshrew: +25 chips per Glass card in deck', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_sandslash', 'sandshrew -> sandslash after 4 rounds (Pokermon 3.9.1)', [key(j), j.ability.extra]);
  nextRound();
  const ng = G.playing_cards.filter((c) => c.config.center.key === 'm_glass').length;
  r = play(hand(['S_K']));
  ok(r.total.chips === 15 + 40 * ng, 'sandslash: +40 per Glass card', { r: r.total, ng });
  // Discarded Enhanced cards may become Glass (1 in 3; odds forced); unenhanced ones never.
  G.GAME.probabilities.normal = 1000;
  clearHand();
  const bonus = hand(['D_5'], { center: 'm_bonus' })[0];
  const plain = hand(['C_5'])[0];
  act({ type: 'highlight', ids: [bonus.sort_id, plain.sort_id] });
  act({ type: 'discard' });
  G.E_MANAGER.flush();
  ok(bonus.config.center.key === 'm_glass' && plain.config.center.key === 'c_base', 'sandslash: a discarded Enhanced card becomes Glass (Pokermon 3.9.1)', [bonus.config.center.key, plain.config.center.key]);
  G.GAME.probabilities.normal = 1;
  const v = P_CENTERS.j_poke_sandslash.loc_vars(P_CENTERS.j_poke_sandslash, [], j).vars;
  ok(v[2] === 1 && v[3] === 3, 'sandslash tooltip: 1 in 3 (Pokermon 3.9.1)', v);
}

// ---------------------------------------------------------------- Nidoran F / Nidorina
{
  start('NIDO');
  const j = add('j_poke_nidoranf');
  hand(['S_Q', 'H_Q']);
  let r = play(hand(['S_2']));
  ok(r.total.chips === 5 + 2 + 50 * 2, 'nidoran F: +50 chips per Queen held', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_nidorina', 'nidoran F -> nidorina after 4 rounds', key(j));
  nextRound();
  hand(['S_Q']);
  r = play(hand(['S_2']));
  ok(r.total.chips === 5 + 2 + 75, 'nidorina: +75 per Queen held', r.total);
  // Moon Stone -> Nidoqueen.
  const ms = add('c_poke_moonstone');
  ok(act({ type: 'use', id: ms.sort_id, targets: [], joker_targets: [j.sort_id] }).ok && j.ability.extra.evolve === true, 'moon stone marks nidorina');
  winRound();
  ok(key(j) === 'j_poke_nidoqueen', 'nidorina -> nidoqueen with a Moon Stone', key(j));
}

done();
