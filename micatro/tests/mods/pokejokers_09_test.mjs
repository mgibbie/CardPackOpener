// Pokermon pokejokers_09 (Miltank -> Linoone): every one of the 25 jokers fired through real
// plays (act), plus each line's evolution.
//   node micatro/tests/mods/pokejokers_09_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const evalRow = (k) => G.GAME.round_eval && G.GAME.round_eval.rows.find((x) => x.center === k);
const CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
/** A rank (code) that is none of the joker's targets. */
const nonTarget = (j) => ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'].find((c) => !j.ability.extra.targets.some((t) => CODE[t.id] === c));

const FILE_JOKERS = ['miltank', 'blissey', 'raikou', 'entei', 'suicune', 'larvitar', 'pupitar', 'tyranitar', 'mega_tyranitar', 'lugia',
  'ho_oh', 'celebi', 'treecko', 'grovyle', 'sceptile', 'torchic', 'combusken', 'blaziken', 'mudkip', 'marshtomp', 'swampert',
  'poochyena', 'mightyena', 'zigzagoon', 'linoone'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 25 pokejokers_09 jokers ported',
  FILE_JOKERS.filter((n) => P_CENTERS['j_poke_' + n].unported));
ok(STATUS.PORTED_FILES['pokemon/pokejokers_09.lua'].length === 25, 'defs: 25 from pokejokers_09.lua', STATUS.PORTED_FILES['pokemon/pokejokers_09.lua'].length);

// ---------------------------------------------------------------- Miltank
{
  start('MILT');
  add('j_poke_miltank');
  add('j_poke_teddiursa');
  winRound();
  ok(evalRow('j_poke_miltank') && evalRow('j_poke_miltank').dollars === 8, 'miltank: $4 per Colorless joker at cash-out', evalRow('j_poke_miltank'));
}

// ---------------------------------------------------------------- Blissey
{
  start('BLISS');
  const j = add('j_poke_blissey');
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_A', 'H_A', 'D_A'], { center: 'm_lucky' }));
  const polys = G.playing_cards.filter((c) => c.edition && c.edition.polychrome && c.config.center.key === 'm_lucky');
  ok(polys.length === 2 && j.ability.extra.triggers === 2, 'blissey: copies the first 2 Lucky triggers as Polychrome', [polys.length, j.ability.extra.triggers]);
  G.GAME.probabilities.normal = 1;
  winRound();
  ok(j.ability.extra.triggers === 0, 'blissey: resets at end of round', j.ability.extra.triggers);
}

// ---------------------------------------------------------------- Raikou
{
  start('RAIK');
  add('j_poke_raikou');
  const held = hand(['H_2', 'D_3', 'C_4', 'H_5']);
  const d0 = G.GAME.dollars;
  play(hand(['S_K']));
  ok(G.GAME.dollars === d0 + 9, 'raikou: $9 on a 1-card first hand', G.GAME.dollars - d0);
  ok(held.filter((c) => c.get_id() === 13).length === 3, 'raikou: 3 held cards become Kings', held.map((c) => c.base.value));
  clearHand();
  const d1 = G.GAME.dollars;
  play(hand(['S_K']));
  ok(G.GAME.dollars === d1, 'raikou: only the first hand', G.GAME.dollars - d1);
}

// ---------------------------------------------------------------- Entei
{
  start('ENTEI');
  const j = add('j_poke_entei');
  const four = hand(['S_2', 'S_3', 'S_4', 'S_5']);
  const n0 = G.playing_cards.length;
  act({ type: 'highlight', ids: four.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.playing_cards.length === n0 - 1 && near(j.ability.extra.Xmult, 1.4), 'entei: first 4-card discard burns one card, X+0.4', [n0 - G.playing_cards.length, j.ability.extra.Xmult]);
  clearHand();
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.4), 'entei X1.4', r.total);
}

// ---------------------------------------------------------------- Suicune
{
  start('SUIC');
  add('j_poke_suicune');
  const [a] = hand(['S_A']);
  const r = play([a]);
  ok(a.ability.perma_bonus === 11 && r.total.chips === 5 + 22, 'suicune: scored cards gain their chips (max 50) permanently first', [a.ability.perma_bonus, r.total]);
}

// ---------------------------------------------------------------- Larvitar / Pupitar / Tyranitar
{
  start('LARV');
  const j = add('j_poke_larvitar');
  const fh = hand(['S_A', 'H_A', 'D_A', 'S_K', 'H_K']);
  let r = play(fh);
  ok(r.total.chips === 40 + 53 && fh.every((c) => c.ability.perma_bonus === 10) && j.ability.extra.full_houses === 1, 'larvitar: Full House cards gain +10 chips' + ' (Pokermon 3.9.1 data)', [r.total, fh.map((c) => c.ability.perma_bonus)]);
  j.ability.extra.full_houses = 6;
  winRound();
  ok(key(j) === 'j_poke_pupitar' && j.ability.extra.full_houses === 0, 'larvitar -> pupitar after 6 Full Houses', [key(j), j.ability.extra]);
  nextRound();
  const fh2 = hand(['S_A', 'H_A', 'D_A', 'S_K', 'H_K']);
  play(fh2);
  ok(fh2.every((c) => c.ability.perma_bonus === 15), 'pupitar: +15 chips' + ' (Pokermon 3.9.1 data)', fh2.map((c) => c.ability.perma_bonus));
  j.ability.extra.full_houses = 8;
  winRound();
  ok(key(j) === 'j_poke_tyranitar', 'pupitar -> tyranitar after 8 Full Houses', key(j));
  nextRound();
  const fh3 = hand(['S_A', 'H_A', 'D_A', 'S_K', 'H_K']);
  r = play(fh3);
  ok(r.total.chips === 40 + 53 && fh3.every((c) => c.ability.nominal_drain === 4 && near(c.ability.perma_x_mult, 0.1)), 'tyranitar: erodes 4 chips into X0.1 per card', [r.total, fh3.map((c) => [c.ability.nominal_drain, c.ability.perma_x_mult])]);
  clearHand();
  for (const c of fh3) { c.area.remove_card(c); G.hand.emplace(c); }
  r = play(fh3);
  let m = 4; for (let i = 0; i < 5; i++) m *= 1.1;
  ok(r.total.chips === 40 + 3 * 7 + 2 * 6 && near(r.total.mult, m), 'tyranitar: eroded cards score less chips but X1.1 each', [r.total, m]);
}
{
  start('MTYR');
  add('j_poke_mega_tyranitar');
  const fh = hand(['S_A', 'H_A', 'D_A', 'S_K', 'H_K']);
  const r = play(fh);
  ok(G.GAME.hands['Full House'].level === 2 && r.total.chips === 65 + 53 && r.total.mult === 6, 'mega tyranitar: levels Full House up first', [G.GAME.hands['Full House'].level, r.total]);
  ok(fh.every((c) => c.ability.perma_bonus === 2), 'mega tyranitar: +level permanent chips per card', fh.map((c) => c.ability.perma_bonus));
}

// ---------------------------------------------------------------- Lugia
{
  start('LUGIA');
  const j = add('j_poke_lugia');
  j.ability.extra.drawn = 39;
  play(hand(['S_A']));
  ok(j.ability.extra.Xmult === 2 && j.ability.extra.drawn < 40, 'lugia: X+1 per 40 cards drawn', j.ability.extra);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'lugia X2', r.total);
}

// ---------------------------------------------------------------- Ho-oh
{
  start('HOOH');
  const j = add('j_poke_ho_oh');
  const p = add('c_pluto');
  ok(act({ type: 'use', id: p.sort_id }).ok, 'used Pluto');
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_pluto' && G.consumeables.cards[0].edition.polychrome, 'ho-oh: duplicates the first consumable used as Polychrome', G.consumeables.cards.map(key));
  act({ type: 'use', id: G.consumeables.cards[0].sort_id });
  ok(G.consumeables.cards.length === 0 && j.ability.extra.used === 1, 'ho-oh: once per round', G.consumeables.cards.map(key));
  nextRound();
  ok(j.ability.extra.used === 0, 'ho-oh: resets on blind select');
  add('j_poke_bulbasaur'); // something to energize
  const bird = add('c_poke_bird_energy');
  ok(act({ type: 'use', id: bird.sort_id }).ok, 'used Bird Energy');
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_double_rainbow_energy' && G.consumeables.cards[0].edition.polychrome,
    'ho-oh: a used Bird Energy comes back as a Polychrome Double Rainbow Energy (Pokermon 3.9.1)', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- Celebi (Pokermon 3.9.1)
{
  start('CELEBI', {}, { noBlind: true });
  const j = add('j_poke_celebi');
  ok(!G.GAME.poke_celebi_skips && j.config.center.loc_vars(j.config.center, [], j).vars[0] === 1, 'celebi: first ante back after 1 skip (Pokermon 3.9.1)');
  const ante = G.GAME.round_resets.ante;
  act({ type: 'skip_blind' });
  ok(G.GAME.round_resets.ante === ante - 1 && G.GAME.poke_celebi_skips === 2 && j.ability.extra.skip_count === 0, 'celebi: skipping winds the ante back (Pokermon 3.9.1)', [G.GAME.round_resets.ante, G.GAME.poke_celebi_skips]);
  if (G.STATE !== STATES.BLIND_SELECT) act({ type: 'skip_booster' }); // the skip's tag opened a pack
  ok(act({ type: 'skip_blind' }).ok, 'skipped the Big Blind');
  ok(G.GAME.round_resets.ante === ante - 1 && j.ability.extra.skip_count === 1, 'celebi: now needs 2 skips', [G.GAME.round_resets.ante, j.ability.extra.skip_count]);
  if (G.STATE !== STATES.BLIND_SELECT) act({ type: 'skip_booster' });
  act({ type: 'select_blind' });
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + G.GAME.round * 0.05) && G.GAME.round >= 1, 'celebi: X(1 + 0.05 per round played) Mult (Pokermon 3.9.1)', [r.total, G.GAME.round]);
}
{
  start('CELEBI2', {}, { noBlind: true });
  const j = add('j_poke_celebi');
  const bp = add('j_blueprint');
  G.jokers.remove_card(bp); G.jokers.cards.unshift(bp); bp.area = G.jokers;
  act({ type: 'skip_blind' });
  ok(G.GAME.poke_celebi_skips === 2 && j.ability.extra.skip_count === 0, 'celebi: Blueprint does not count the skip twice (Pokermon 3.9.1)', [G.GAME.poke_celebi_skips, j.ability.extra.skip_count]);
}

// ---------------------------------------------------------------- Treecko / Grovyle / Sceptile (Pokermon 3.9.1 starters)
{
  start('TREE');
  const h = G.hand.config.card_limit;
  const j = add('j_poke_treecko');
  ok(G.hand.config.card_limit === h + 1, 'treecko +1 hand size');
  const tg = j.ability.extra.targets;
  ok(tg.length === 3 && tg.every((t) => typeof t.id === 'number') && tg[0].id < tg[1].id, 'treecko: 3 random target ranks', tg);
  const d0 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[0].id], 'H_' + CODE[tg[0].id]]));
  ok(G.GAME.dollars === d0 + 2 && j.ability.extra.triggers === 2, 'treecko: always $1 per scored Nature card, counts triggers (Pokermon 3.9.1)', [G.GAME.dollars - d0, j.ability.extra.triggers]);
  clearHand();
  const d1 = G.GAME.dollars;
  play(hand(['S_' + nonTarget(j)]));
  ok(G.GAME.dollars === d1, 'treecko: nothing for other ranks');
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_grovyle' && JSON.stringify(j.ability.extra.targets) === JSON.stringify(tg) && j.ability.extra.triggers === 0, 'treecko -> grovyle after 16 triggers, keeps its targets (Pokermon 3.9.1)', [key(j), j.ability.extra]);
  nextRound();
  const d2 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[1].id], 'H_' + CODE[tg[1].id], 'D_' + CODE[tg[1].id], 'C_' + CODE[tg[1].id]]));
  const g = G.GAME.dollars - d2;
  ok(g >= 4 && g <= 8 && j.ability.extra.triggers === 4, 'grovyle: $1 or $2 per scored Nature card (Pokermon 3.9.1)', [g, j.ability.extra.triggers]);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_sceptile', 'grovyle -> sceptile after 16 triggers (Pokermon 3.9.1)', key(j));
  nextRound();
  add('j_poke_bulbasaur'); // another Grass Joker
  add('c_poke_grass_energy'); // energy no longer counts
  const d3 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[2].id]]));
  ok(G.GAME.dollars === d3 + 3 && j.ability.extra.money_earned === 3, 'sceptile: $2 +1 per OTHER Grass Joker (no Energy) per Nature card (Pokermon 3.9.1)', G.GAME.dollars - d3);
  ok(G.hand.config.card_limit === h + 2, 'hand size kept across the line (+bulbasaur)', G.hand.config.card_limit);
}

// ---------------------------------------------------------------- Torchic / Combusken / Blaziken (Pokermon 3.9.1 starters)
{
  start('TORCH');
  const dd = G.GAME.round_resets.discards;
  const j = add('j_poke_torchic');
  ok(G.GAME.round_resets.discards === dd + 1, 'torchic +1 discard');
  const tg = j.ability.extra.targets;
  let r = play(hand(['S_' + CODE[tg[0].id], 'H_' + CODE[tg[0].id]]));
  ok(r.total.mult === 2 + 5 + 5 && j.ability.extra.triggers === 2, 'torchic: +5 Mult per scored Nature card (Pokermon 3.9.1)', [r.total, j.ability.extra.triggers]);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_combusken' && j.ability.extra.triggers === 0, 'torchic -> combusken after 16 triggers (Pokermon 3.9.1)', [key(j), j.ability.extra]);
  nextRound();
  r = play(hand(['S_' + CODE[tg[1].id]]));
  ok(r.total.mult === 1 + 8, 'combusken: +8 Mult per scored Nature card (Pokermon 3.9.1)', r.total);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_blaziken', 'combusken -> blaziken', key(j));
  nextRound();
  const ch = add('j_poke_charmander'); // a Fire Joker
  const discardN = (n) => {
    const dc = hand(Array.from({ length: n }, (_, i) => ['S_', 'H_', 'D_', 'C_', 'S_'][i] + CODE[tg[i % 3].id]));
    act({ type: 'highlight', ids: dc.map((c) => c.sort_id) });
    act({ type: 'discard' });
    clearHand();
  };
  discardN(4);
  ok(j.ability.extra.cards_discarded === 4, 'blaziken: counts discarded Nature cards', j.ability.extra.cards_discarded);
  r = play(hand(['S_' + nonTarget(j)]));
  ok(r.total.mult === 1 + ch.ability.extra.mult, 'blaziken: no X Mult below 5 discarded (Pokermon 3.9.1)', r.total);
  discardN(1);
  r = play(hand(['S_' + CODE[tg[0].id]]));
  // +10 (Nature card), then Charmander's +Mult, then X1.5 for Charmander and X1.5 for Blaziken itself (both Fire)
  ok(near(r.total.mult, (1 + 10 + ch.ability.extra.mult) * 1.5 * 1.5), 'blaziken: each Fire/Fighting Joker X1.5 after 5 Nature discards (Pokermon 3.9.1)', r.total);
  winRound();
  ok(j.ability.extra.cards_discarded === 0, 'blaziken: resets at end of round');
}

// ---------------------------------------------------------------- Mudkip / Marshtomp / Swampert (Pokermon 3.9.1 starters)
{
  start('MUDK');
  const hh = G.GAME.round_resets.hands;
  const j = add('j_poke_mudkip');
  ok(G.GAME.round_resets.hands === hh + 1, 'mudkip +1 hand');
  const tg = j.ability.extra.targets;
  const c0 = CODE[tg[0].id];
  add('j_poke_squirtle'); // another Water: no longer doubles
  let r = play(hand(['S_' + c0]));
  const nom = hand(['C_' + c0])[0].base.nominal; clearHand();
  const sq = G.jokers.cards[1].ability.extra.chips;
  ok(r.total.chips === 5 + nom + 30 + sq && j.ability.extra.triggers === 1, 'mudkip: +30 Chips per scored Nature card (Pokermon 3.9.1)', r.total);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_marshtomp', 'mudkip -> marshtomp after 16 triggers (Pokermon 3.9.1)', key(j));
  nextRound();
  r = play(hand(['S_' + c0]));
  ok(r.total.chips === 5 + nom + 50 + G.jokers.cards[1].ability.extra.chips, 'marshtomp: +50 Chips per scored Nature card (Pokermon 3.9.1)', r.total);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_swampert', 'marshtomp -> swampert', key(j));
  nextRound();
  r = play(hand(['S_' + c0]));
  ok(r.total.chips === 5 + nom + 60 + G.jokers.cards[1].ability.extra.chips, 'swampert: +60 Chips per scored Nature card (Pokermon 3.9.1)', r.total);
  clearHand();
  // 5 scoring Nature cards (a Flush of the target ranks) -> a Tarot per 2 Water/Earth Jokers (Swampert + Squirtle = 1)
  for (const c of G.consumeables.cards.slice()) c.remove();
  play(hand(['H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id], 'H_' + CODE[tg[2].id], 'H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id]]));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'swampert: 5 Nature cards scored -> 1 Tarot per 2 Water Jokers (Pokermon 3.9.1)', G.consumeables.cards.map(key));
  G.jokers.cards[1].remove();
  clearHand();
  for (const c of G.consumeables.cards.slice()) c.remove();
  play(hand(['H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id], 'H_' + CODE[tg[2].id], 'H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id]]));
  ok(G.consumeables.cards.length === 0, 'swampert: no Tarot with fewer than 2 Water/Earth Jokers (Pokermon 3.9.1)', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- Poochyena / Mightyena
{
  start('POOCH');
  const j = add('j_poke_poochyena');
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_A', 'H_A'], { center: 'm_glass' }));
  G.GAME.probabilities.normal = 1;
  ok(j.ability.extra.mult === 4, 'poochyena: +2 Mult per destroyed card', j.ability.extra.mult);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 5, 'poochyena scores', r.total);
  winRound(); for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_mightyena' && j.ability.extra.mult === 4, 'poochyena -> mightyena keeps its Mult', [key(j), j.ability.extra]);
  nextRound();
  add('j_poke_sneasel'); // Dark
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_K'], { center: 'm_glass' }));
  G.GAME.probabilities.normal = 1;
  ok(j.ability.extra.mult === 4 + 2 + 2, 'mightyena: +2 +1 per Dark joker per destroyed card', j.ability.extra.mult);
}

// ---------------------------------------------------------------- Zigzagoon / Linoone
{
  start('ZIGZ');
  const j = add('j_poke_zigzagoon');
  G.GAME.probabilities.normal = 4;
  play(hand(['S_A']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item', 'zigzagoon: picks up an Item (1 in 4)', G.consumeables.cards.map(key));
  G.GAME.probabilities.normal = 1;
  winRound(); for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_linoone', 'zigzagoon -> linoone after 5 rounds', key(j));
  nextRound();
  for (const c of G.consumeables.cards.slice()) c.remove();
  play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item', 'linoone: a Straight always picks up an Item', G.consumeables.cards.map(key));
}

done();
