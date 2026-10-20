// Pokermon pokejokers_02 (Nidoqueen -> Poliwag): every one of the 30 jokers fired through real
// plays (act), plus each line's evolution and the mod_probability seam (Venonat / Venomoth).
//   node micatro/tests/mods/pokejokers_02_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { get_probability_vars } from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
/** Win n rounds in a row (the last one stays in ROUND_EVAL). */
const rounds = (n) => { for (let i = 0; i < n; i++) { winRound(); if (i < n - 1) nextRound(); } };
const useOn = (cons, j) => act({ type: 'use', id: cons.sort_id, targets: [], joker_targets: [j.sort_id] });

const FILE_JOKERS = ['nidoqueen', 'nidoranm', 'nidorino', 'nidoking', 'clefairy', 'clefable', 'vulpix', 'ninetales', 'jigglypuff', 'wigglytuff',
  'zubat', 'golbat', 'oddish', 'gloom', 'vileplume', 'paras', 'parasect', 'venonat', 'venomoth', 'diglett', 'dugtrio', 'meowth', 'persian',
  'psyduck', 'golduck', 'mankey', 'primeape', 'growlithe', 'arcanine', 'poliwag'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 30 pokejokers_02 jokers ported',
  FILE_JOKERS.filter((n) => P_CENTERS['j_poke_' + n].unported));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_02.lua'].length === 30, 'defs: 30 from pokejokers_02.lua', STATUS.PORTED_FILES['pokemon/pokejokers_02.lua'].length);

// ---------------------------------------------------------------- Nidoran-M line + Nidoqueen
{
  start('NIDOQ');
  const h0 = G.hand.config.card_limit;
  const q = add('j_poke_nidoqueen');
  ok(G.hand.config.card_limit === h0 + 1, 'nidoqueen +1 hand size', G.hand.config.card_limit);
  hand(['S_Q', 'H_Q']);
  const r = play(hand(['S_2']));
  ok(r.total.chips === 5 + 2 + 90 * 2, 'nidoqueen: +90 chips per Queen held', r.total);
  q.remove(); G.E_MANAGER.flush();
  ok(G.hand.config.card_limit === h0, 'nidoqueen removed: hand size back', G.hand.config.card_limit);
}
{
  start('NIDOM');
  const j = add('j_poke_nidoranm');
  hand(['S_K', 'H_K']);
  let r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 8 * 2, 'nidoran M: +8 Mult per King held', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_nidorino', 'nidoran M -> nidorino after 4 rounds', key(j));
  nextRound();
  hand(['S_K']);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 12, 'nidorino: +12 Mult per King held', r.total);
  const ms = add('c_poke_moonstone');
  ok(useOn(ms, j).ok && j.ability.extra.evolve === true, 'moon stone marks nidorino');
  const h0 = G.hand.config.card_limit;
  winRound();
  ok(key(j) === 'j_poke_nidoking', 'nidorino -> nidoking with a Moon Stone', key(j));
  ok(G.hand.config.card_limit === h0 + 1, 'nidoking +1 hand size after evolving', G.hand.config.card_limit);
  nextRound();
  hand(['S_K', 'D_K']);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 15 * 2, 'nidoking: +15 Mult per King held', r.total);
}

// ---------------------------------------------------------------- Clefairy / Clefable
{
  start('CLEF');
  const j = add('j_poke_clefairy');
  let r = play(hand(['C_2', 'C_2']));
  ok(r.total.chips === 14 && r.total.mult === 2 + 3 + 3, 'clefairy: +3 Mult per scored Club', r.total);
  r = play(hand(['S_2', 'H_2']));
  ok(r.total.mult === 2, 'clefairy: nothing for non-Clubs', r.total);
  ok(useOn(add('c_poke_moonstone'), j).ok, 'moon stone usable on clefairy');
  winRound();
  ok(key(j) === 'j_poke_clefable', 'clefairy -> clefable', key(j));
  nextRound();
  r = play(hand(['C_2', 'C_2']));
  ok(j.ability.extra.clubs_scored === 2 && r.total.mult === 2 + 2 + 2, 'clefable: +1 Mult per Club scored this round, per Club', [j.ability.extra, r.total]);
  r = play(hand(['C_3', 'C_3']));
  ok(j.ability.extra.clubs_scored === 4 && r.total.mult === 2 + 4 + 4, 'clefable: tally grows', r.total);
  winRound();
  ok(j.ability.extra.clubs_scored === 0, 'clefable: tally resets at end of round', j.ability.extra.clubs_scored);
}

// ---------------------------------------------------------------- Vulpix / Ninetales / Venonat / Venomoth
{
  start('VULP');
  const v = add('j_poke_vulpix');
  ok(JSON.stringify(get_probability_vars(v, 1, 3, 'vulpix')) === '[1,3]', 'vulpix odds 1 in 3');
  const vn = add('j_poke_venonat');
  ok(JSON.stringify(get_probability_vars(v, 1, 3, 'vulpix')) === '[2,3]', 'venonat: +1 numerator (2 in 3)', get_probability_vars(v, 1, 3));
  G.GAME.probabilities.normal = 2;
  ok(JSON.stringify(get_probability_vars(v, 1, 3, 'vulpix')) === '[4,3]', 'venonat then Oops: (1+1)*2', get_probability_vars(v, 1, 3));
  G.GAME.probabilities.normal = 1;
  ok(JSON.stringify(P_CENTERS.j_poke_vulpix.loc_vars(P_CENTERS.j_poke_vulpix, [], v).vars) === '[2,3]', 'vulpix tooltip shows 2 in 3');
  rounds(5);
  ok(key(vn) === 'j_poke_venonat' || key(vn) === 'j_poke_venomoth', 'venonat level countdown runs');
  ok(key(vn) === 'j_poke_venomoth', 'venonat -> venomoth after 5 rounds', key(vn));
  ok(JSON.stringify(get_probability_vars(v, 1, 3)) === '[3,3]', 'venomoth: +2 numerator (3 in 3)');
  nextRound();
  // Guaranteed now: every scored 9 makes a Tarot while there's room.
  const r = play(hand(['S_9']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'vulpix: scored 9 -> Tarot (odds via Venomoth)', G.consumeables.cards.map(key));
  ok(statusMsgs(r.events).some((m) => /Tarot/.test(m)), 'vulpix: "+1 Tarot" popup');
  play(hand(['S_9', 'H_9']));
  ok(G.consumeables.cards.length === 2, 'vulpix: stops at the consumable limit', G.consumeables.cards.length);
  // Vanilla listed probabilities go through the same seam: Lucky cards (1 in 5) with Oops x2 + Venomoth -> 6 in 5.
  G.GAME.probabilities.normal = 2;
  const lr = play(hand(['S_2', 'H_2'], { center: 'm_lucky' }));
  ok(lr.total.mult === 2 + 20 + 20, 'venomoth also raises vanilla Lucky odds ((1+2)*2 in 5 = sure)', lr.total);
  G.GAME.probabilities.normal = 1;
  // Fire Stone (unported item) -> what its use does: extra.evolve = true.
  v.ability.extra.evolve = true;
  winRound();
  ok(key(v) === 'j_poke_ninetales', 'vulpix -> ninetales with a Fire Stone', key(v));
  ok(G.consumeables.cards.some((c) => key(c) === 'c_medium' && c.edition && c.edition.negative), 'evolving into ninetales also brings the Negative Medium (SMODS set_ability re-adds)', G.consumeables.cards.map(key));
}
{
  start('NINE');
  const n = add('j_poke_ninetales');
  const med = G.consumeables.cards.find((c) => key(c) === 'c_medium');
  ok(med && med.edition && med.edition.negative, 'ninetales: creates a Negative Medium on add', G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 2; // 1 in 2 -> sure
  play(hand(['S_9']));
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.some((c) => c.ability.set === 'Tarot'), 'ninetales: scored 9 -> Tarot', G.consumeables.cards.map(key));
  ok(!!n, 'ninetales added');
}

// ---------------------------------------------------------------- Jigglypuff / Wigglytuff
{
  start('JIGG');
  const j = add('j_poke_jigglypuff');
  let r = play(hand(['S_2', 'S_2']));
  ok(r.total.chips === 10 + 2 + 2 + 10 * 2 && r.total.mult === 2 + 2 * 2, 'jigglypuff: +10 chips +2 Mult per Spade', r.total);
  ok(useOn(add('c_poke_moonstone'), j).ok, 'moon stone usable on jigglypuff');
  winRound();
  ok(key(j) === 'j_poke_wigglytuff', 'jigglypuff -> wigglytuff', key(j));
  nextRound();
  r = play(hand(['S_2', 'S_2']));
  ok(r.total.chips === 10 + 2 + 2 + (30 + 2) * 2 && r.total.mult === 6, 'wigglytuff: +30 + the card\'s chips per Spade, +2 Mult', r.total);
  r = play(hand(['H_A']));
  ok(r.total.chips === 16 && r.total.mult === 1, 'wigglytuff: nothing for non-Spades', r.total);
}

// ---------------------------------------------------------------- Zubat / Golbat
{
  start('ZUBAT');
  const j = add('j_poke_zubat');
  const b = hand(['S_2', 'H_2'], { center: 'm_bonus' });
  let r = play(b);
  // Pokermon 3.9.1: only the first scoring Enhanced card is eaten (+2 Mult), the second keeps its Bonus.
  ok(j.ability.extra.mult === 2 && key(b[0]) === 'c_base' && key(b[1]) === 'm_bonus', 'zubat: eats the first Enhanced card, +2 Mult (Pokermon 3.9.1)', [j.ability.extra.mult, b.map(key)]);
  ok(r.total.chips === 10 + 4 + 30 && r.total.mult === 2 + 2, 'zubat: the eaten card scores as a base card (Pokermon 3.9.1)', r.total);
  ok(statusMsgs(r.events).includes('+2 Mult'), 'zubat: "+2 Mult" (Pokermon 3.9.1)', statusMsgs(r.events));
  r = play(hand(['S_5']));
  ok(j.ability.extra.mult === 2 && r.total.mult === 1 + 2, 'zubat: keeps its Mult, no gain without an Enhanced card', r.total);
  j.ability.extra.mult = 12;
  winRound();
  ok(key(j) === 'j_poke_golbat' && j.ability.extra.mult === 12, 'zubat -> golbat at 12 Mult (Mult carried)', [key(j), j.ability.extra.mult]);
}
{
  start('GOLBAT');
  const j = add('j_poke_golbat');
  const m = hand(['S_2', 'H_2'], { center: 'm_mult' });
  let r = play(m);
  // Both Mult cards are eaten before scoring (base cards now): +2 Mult each.
  ok(m.every((c) => key(c) === 'c_base') && j.ability.extra.mult === 4 && j.ability.extra.eaten === 2, 'golbat: eats Mult cards (+2 Mult each)', j.ability.extra);
  ok(r.total.chips === 14 && r.total.mult === 2 + 4, 'golbat: scores its Mult', r.total);
  ok(statusMsgs(r.events).includes('Skree!'), 'golbat: "Skree!"', statusMsgs(r.events));
  // Pokermon 3.9.1: every Enhancement eaten gives +2 Mult (the chips / XMult / money halves are gone).
  play(hand(['S_3', 'H_3'], { center: 'm_bonus' }));
  play(hand(['S_4', 'H_4'], { center: 'm_glass' }));
  play(hand(['S_5', 'H_5'], { center: 'm_gold' }));
  ok(j.ability.extra.mult === 16 && j.ability.extra.eaten === 8 && j.ability.extra.chips === undefined, 'golbat: +2 Mult for any Enhancement eaten (Pokermon 3.9.1)', j.ability.extra);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 && r.total.mult === 1 + 16, 'golbat: only +Mult (Pokermon 3.9.1)', r.total);
  winRound();
  ok(!G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_golbat'), 'golbat: no cash-out money (Pokermon 3.9.1)', G.GAME.round_eval.rows);
  nextRound();
  j.ability.extra.eaten = 15;
  winRound();
  ok(key(j) === 'j_poke_golbat', 'golbat: not yet at 15 eaten (Pokermon 3.9.1)', key(j));
  nextRound();
  j.ability.extra.eaten = 16;
  winRound();
  ok(key(j) === 'j_poke_crobat', 'golbat -> crobat after eating 16 (Pokermon 3.9.1)', key(j));
}

// ---------------------------------------------------------------- Oddish line
{
  start('ODD');
  const j = add('j_poke_oddish');
  let r = play(hand(['S_3']));
  const seen0 = new Set([r.total.mult]);
  for (let i = 0; i < 20; i++) seen0.add(play(hand(['S_3'])).total.mult);
  ok([...seen0].every((m) => m === 2 || m === 4 || m === 6) && seen0.size === 3, 'oddish: +1, +3 or +5 Mult per scored odd card (Pokermon 3.9.1)', [...seen0]);
  r = play(hand(['S_4']));
  ok(r.total.mult === 1, 'oddish: nothing for even cards', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_gloom', 'oddish -> gloom after 4 rounds (Pokermon 3.9.1)', key(j));
  nextRound();
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(play(hand(['S_A'])).total.mult);
  ok([...seen].every((m) => m === 4 || m === 6 || m === 8) && seen.size === 3, 'gloom: +3, +5 or +7 Mult per odd card (Pokermon 3.9.1)', [...seen]);
  j.ability.extra.evolve = 'leafstone';
  winRound();
  ok(key(j) === 'j_poke_vileplume', 'gloom + Leaf Stone -> vileplume', key(j));
  nextRound();
  const seen2 = new Set();
  for (let i = 0; i < 20; i++) seen2.add(play(hand(['S_7'])).total.mult);
  ok([...seen2].every((m) => m === 1.5 || m === 1.3 || m === 8) && seen2.size === 3, 'vileplume: +7, X1.3 or X1.5 Mult per odd card (Pokermon 3.9.1)', [...seen2]);
}
{
  start('GLOOM2');
  const j = add('j_poke_gloom');
  j.ability.extra.evolve = 'sunstone';
  winRound();
  ok(key(j) === 'j_poke_bellossom', 'gloom + Sun Stone -> bellossom', key(j));
}

// ---------------------------------------------------------------- Paras / Parasect
{
  start('PARAS');
  const j = add('j_poke_paras');
  let r = play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  ok(j.ability.extra.mult === 1 && r.total.chips === 30 && r.total.mult === 2 + 1, 'paras: +1 Mult per Two Pair', r.total);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 1, 'paras: keeps its Mult on other hands', r.total);
  j.ability.extra.mult = 8;
  winRound();
  ok(key(j) === 'j_poke_parasect' && j.ability.extra.mult === 8, 'paras -> parasect at 8 (Mult carried)', [key(j), j.ability.extra]);
  nextRound();
  r = play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  ok(j.ability.extra.mult === 11 && r.total.mult === 2 + 11, 'parasect: +3 Mult per Two Pair', r.total);
  r = play(hand(['S_2']));
  ok(j.ability.extra.mult === 9 && r.total.mult === 1 + 9, 'parasect: -2 Mult on other hands', r.total);
  ok(statusMsgs(r.events).includes('-2 Mult'), 'parasect: "-2 Mult"', statusMsgs(r.events));
  j.ability.extra.mult = 1;
  play(hand(['S_2']));
  ok(j.ability.extra.mult === 0, 'parasect: the loss floors at 0 Mult (Pokermon 3.9.1)', j.ability.extra.mult);
}

// ---------------------------------------------------------------- Diglett / Dugtrio
{
  start('DIG');
  const j = add('j_poke_diglett');
  let r = play(hand(['S_2', 'H_2', 'D_2']));
  ok(r.total.chips === 30 + 6 + 60 && r.total.mult === 3 + 4, 'diglett: Three of a Kind with a 2 -> +60 chips +4 Mult', r.total);
  ok(statusMsgs(r.events).includes('Dig!'), 'diglett: "Dig!"');
  r = play(hand(['S_K', 'H_K', 'D_K']));
  ok(r.total.chips === 30 + 30 + 60 && r.total.mult === 3, 'diglett: Three of a Kind only -> chips', r.total);
  r = play(hand(['S_3']));
  ok(r.total.chips === 8 && r.total.mult === 1 + 4, 'diglett: a 2/3/4 only -> Mult', r.total);
  rounds(4);
  ok(key(j) === 'j_poke_dugtrio', 'diglett -> dugtrio after 4 rounds', key(j));
  nextRound();
  r = play(hand(['S_2', 'H_2', 'D_2']));
  ok(r.total.chips === 30 + 6 + 120 && r.total.mult === 3 * 1.5, 'dugtrio: +120 chips and X1.5', r.total);
}

// ---------------------------------------------------------------- Meowth / Persian
{
  start('MEOW');
  const j = add('j_poke_meowth');
  G.GAME.probabilities.normal = 5; // Lucky cards always trigger
  play(hand(['S_2'], { center: 'm_lucky' }));
  ok(j.ability.extra.money === 3 && j.ability.extra.triggers === 1, 'meowth: +$2 on the first Lucky trigger', j.ability.extra);
  play(hand(['S_3'], { center: 'm_lucky' }));
  ok(j.ability.extra.money === 3, 'meowth: once per round', j.ability.extra);
  G.GAME.probabilities.normal = 1;
  winRound();
  ok(j.ability.extra.triggers === 0, 'meowth: trigger count resets at end of round');
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_meowth');
  ok(row && row.dollars === 3, 'meowth: $3 at cash-out', row);
  nextRound();
  j.ability.extra.money = 9;
  winRound();
  ok(key(j) === 'j_poke_persian' && j.ability.extra.money === 9, 'meowth -> persian at $9 (money carried)', [key(j), j.ability.extra]);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.probabilities.normal = 5; // 1 in 5 double -> sure
  play(hand(['S_2'], { center: 'm_lucky' }));
  ok(j.ability.extra.money === 11, 'persian: +$2 on a Lucky trigger', j.ability.extra.money);
  winRound();
  const row2 = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_persian');
  ok(row2 && row2.dollars === 22, 'persian: payout doubled on its 1 in 5', row2);
}

// ---------------------------------------------------------------- Psyduck / Golduck
{
  start('PSY');
  const j = add('j_poke_psyduck');
  let d0 = G.GAME.dollars;
  let r = play(hand(['S_K']));
  ok(G.GAME.dollars === d0 + 3 && statusMsgs(r.events).includes('$3'), 'psyduck: lone face card -> $3', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  play(hand(['S_K', 'H_K']));
  ok(G.GAME.dollars === d0, 'psyduck: nothing for two cards');
  rounds(5);
  ok(key(j) === 'j_poke_golduck', 'psyduck -> golduck after 5 rounds', key(j));
  nextRound();
  d0 = G.GAME.dollars;
  const f = hand(['S_Q']);
  r = play(f);
  ok(G.GAME.dollars === d0 + 3 && key(f[0]) === 'm_gold', 'golduck: lone face -> Gold card and $3', [G.GAME.dollars - d0, key(f[0])]);
  // Pokermon 3.9.1: $3 whenever ANY card becomes Gold (Steamodded setting_ability), not only its own.
  clearHand();
  const c = hand(['D_4'])[0];
  d0 = G.GAME.dollars;
  c.set_ability(P_CENTERS.m_gold);
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0 + 3, 'golduck: $3 when any card becomes Gold (Pokermon 3.9.1)', G.GAME.dollars - d0);
  d0 = G.GAME.dollars;
  c.set_ability(P_CENTERS.m_bonus);
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0, 'golduck: nothing for other Enhancements', G.GAME.dollars - d0);
}

// ---------------------------------------------------------------- Mankey / Primeape
{
  start('MANK');
  const j = add('j_poke_mankey');
  let r = play(hand(['S_2', 'H_2']));
  ok(r.total.chips === 10 + 4 + 10 && r.total.mult === 2 + 6, 'mankey: +5 chips +3 Mult per scored prime', r.total);
  r = play(hand(['S_4', 'H_4']));
  ok(r.total.chips === 18 && r.total.mult === 2, 'mankey: nothing for 4s', r.total);
  rounds(5);
  ok(key(j) === 'j_poke_primeape', 'mankey -> primeape after 5 rounds', key(j));
  nextRound();
  r = play(hand(['S_7', 'H_7', 'D_7']));
  ok(r.total.chips === 30 + 21 + 21 && r.total.mult === 3 + 15 && j.ability.extra.primes_played === 3, 'primeape: +7 chips +5 Mult per prime, counted', [r.total, j.ability.extra]);
  j.ability.extra.primes_played = 27;
  winRound(); // (the winning 2 is a prime: 28)
  ok(key(j) === 'j_poke_primeape', 'primeape: not yet at 28 primes' + ' (Pokermon 3.9.1 data)', key(j));
  nextRound();
  winRound(); // (29)
  ok(key(j) === 'j_poke_annihilape', 'primeape -> annihilape after 29 primes' + ' (Pokermon 3.9.1 data)', key(j));
}

// ---------------------------------------------------------------- Growlithe / Arcanine
{
  start('GROWL');
  const j = add('j_poke_growlithe');
  let r = play(hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']));
  ok(r.total.chips === 35 + 30 && r.total.mult === 4 + 8, 'growlithe: +8 Mult on a Flush', r.total);
  r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'growlithe: nothing without a Flush', r.total);
  j.ability.extra.evolve = true; // Fire Stone
  winRound();
  ok(key(j) === 'j_poke_arcanine', 'growlithe -> arcanine with a Fire Stone', key(j));
  nextRound();
  const f = hand(['S_2', 'S_4', 'S_6', 'S_8', 'S_T']);
  r = play(f);
  ok(key(f[0]) === 'm_mult' && f.slice(1).every((c) => key(c) === 'c_base'), 'arcanine: first base card of a Flush becomes a Mult card', f.map(key));
  ok(r.total.chips === 65 && r.total.mult === (4 + 4) * 1.5, 'arcanine: X1.5 on a Flush (Mult card scores)', r.total);
  // Pokermon 3.9.1: Blueprint copies the XMult but no longer converts a second card.
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  clearHand();
  const f2 = hand(['H_2', 'H_4', 'H_6', 'H_8', 'H_T']);
  r = play(f2);
  ok(f2.filter((c) => key(c) === 'm_mult').length === 1, 'arcanine: Blueprint does not convert a second card (Pokermon 3.9.1)', f2.map(key));
  ok(r.total.mult === (4 + 4) * 1.5 * 1.5, 'arcanine: Blueprint copies the X1.5', r.total);
}

// ---------------------------------------------------------------- Poliwag
{
  start('POLI');
  const j = add('j_poke_poliwag');
  let r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 4 && G.GAME.poke_poli_suit === 'Hearts', 'poliwag: +4 Mult per Spade, then the suit turns to Hearts', [r.total, G.GAME.poke_poli_suit]);
  r = play(hand(['S_3']));
  ok(r.total.mult === 1 && G.GAME.poke_poli_suit === 'Clubs', 'poliwag: Spades no longer count', [r.total, G.GAME.poke_poli_suit]);
  r = play(hand(['C_3']));
  ok(r.total.mult === 1 + 4 && G.GAME.poke_poli_suit === 'Diamonds', 'poliwag: Clubs count', r.total);
  add('j_poke_poliwag'); // two Poli jokers change the suit once per hand
  play(hand(['D_3']));
  ok(G.GAME.poke_poli_suit === 'Spades', 'poli suit cycles once per hand with two Poliwags', G.GAME.poke_poli_suit);
  rounds(5);
  ok(key(j) === 'j_poke_poliwhirl', 'poliwag -> poliwhirl after 5 rounds', key(j));
}

done();
