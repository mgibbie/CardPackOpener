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
  ok(r.total.chips === 40 + 53 && fh.every((c) => c.ability.perma_bonus === 8) && j.ability.extra.full_houses === 1, 'larvitar: Full House cards gain +8 chips', [r.total, fh.map((c) => c.ability.perma_bonus)]);
  j.ability.extra.full_houses = 6;
  winRound();
  ok(key(j) === 'j_poke_pupitar' && j.ability.extra.full_houses === 0, 'larvitar -> pupitar after 6 Full Houses', [key(j), j.ability.extra]);
  nextRound();
  const fh2 = hand(['S_A', 'H_A', 'D_A', 'S_K', 'H_K']);
  play(fh2);
  ok(fh2.every((c) => c.ability.perma_bonus === 12), 'pupitar: +12 chips', fh2.map((c) => c.ability.perma_bonus));
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
}

// ---------------------------------------------------------------- Celebi
{
  start('CELEBI', {}, { noBlind: true });
  const j = add('j_poke_celebi');
  ok(G.GAME.celebi_skips === 1, 'celebi: first ante back after 1 skip');
  const ante = G.GAME.round_resets.ante;
  act({ type: 'skip_blind' });
  ok(G.GAME.round_resets.ante === ante - 1 && G.GAME.celebi_skips === 2 && j.ability.extra.skip_count === 0, 'celebi: skipping winds the ante back', [G.GAME.round_resets.ante, G.GAME.celebi_skips]);
  if (G.STATE !== STATES.BLIND_SELECT) act({ type: 'skip_booster' }); // the skip's tag opened a pack
  ok(act({ type: 'skip_blind' }).ok, 'skipped the Big Blind');
  ok(G.GAME.round_resets.ante === ante - 1 && j.ability.extra.skip_count === 1, 'celebi: now needs 2 skips', [G.GAME.round_resets.ante, j.ability.extra.skip_count]);
}

// ---------------------------------------------------------------- Treecko / Grovyle / Sceptile
{
  start('TREE');
  const h = G.hand.config.card_limit;
  const j = add('j_poke_treecko');
  ok(G.hand.config.card_limit === h + 1, 'treecko +1 hand size');
  const tg = j.ability.extra.targets;
  ok(tg.length === 3 && tg.every((t) => typeof t.id === 'number') && tg[0].id < tg[1].id, 'treecko: 3 random target ranks', tg);
  G.GAME.probabilities.normal = 2;
  const d0 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[0].id]]));
  ok(G.GAME.dollars === d0 + 1 && j.ability.extra.money_earned === 1, 'treecko: $1 per scored target rank (1 in 2)', G.GAME.dollars - d0);
  clearHand();
  const d1 = G.GAME.dollars;
  play(hand(['S_' + nonTarget(j)]));
  ok(G.GAME.dollars === d1, 'treecko: nothing for other ranks');
  G.GAME.probabilities.normal = 1;
  j.ability.extra.money_earned = 16;
  winRound();
  ok(key(j) === 'j_poke_grovyle' && JSON.stringify(j.ability.extra.targets) === JSON.stringify(tg), 'treecko -> grovyle keeps its targets', [key(j), j.ability.extra.targets]);
  nextRound();
  add('j_poke_bulbasaur'); // another Grass: always pays
  const d2 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[1].id], 'H_' + CODE[tg[1].id]]));
  ok(G.GAME.dollars === d2 + 4, 'grovyle: $2 per target with another Grass', G.GAME.dollars - d2);
  j.ability.extra.money_earned = 32;
  winRound();
  ok(key(j) === 'j_poke_sceptile', 'grovyle -> sceptile', key(j));
  nextRound();
  const d3 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[2].id]]));
  ok(G.GAME.dollars === d3 + 3 && j.ability.extra.money_earned === 3, 'sceptile: $2 +1 per other Grass per target', G.GAME.dollars - d3);
  ok(G.hand.config.card_limit === h + 2, 'hand size kept across the line (+bulbasaur)', G.hand.config.card_limit);
}

// ---------------------------------------------------------------- Torchic / Combusken / Blaziken
{
  start('TORCH');
  const dd = G.GAME.round_resets.discards;
  const j = add('j_poke_torchic');
  ok(G.GAME.round_resets.discards === dd + 1, 'torchic +1 discard');
  const tg = j.ability.extra.targets;
  const dc = hand(['S_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id], 'S_' + nonTarget(j)]);
  act({ type: 'highlight', ids: dc.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(j.ability.extra.cards_discarded === 2, 'torchic: counts discarded target ranks', j.ability.extra.cards_discarded);
  clearHand();
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 && j.ability.extra.mult_earned === 2, 'torchic: +1 Mult per target discarded', r.total);
  j.ability.extra.mult_earned = 60;
  winRound();
  ok(key(j) === 'j_poke_combusken' && j.ability.extra.cards_discarded === 0, 'torchic -> combusken (round count reset)', [key(j), j.ability.extra]);
  nextRound();
  add('j_poke_charmander'); // Fire: +2 per discard
  const dc2 = hand(['S_' + CODE[tg[2].id]]);
  act({ type: 'highlight', ids: dc2.map((c) => c.sort_id) });
  act({ type: 'discard' });
  clearHand();
  r = play(hand(['S_A']));
  ok(j.ability.extra.cards_discarded === 2 && r.total.mult === 1 + 4, 'combusken: +2 per target discarded with another Fire, x2 Mult', [j.ability.extra, r.total]);
  j.ability.extra.mult_earned = 150;
  winRound();
  ok(key(j) === 'j_poke_blaziken', 'combusken -> blaziken', key(j));
  nextRound();
  const dc3 = hand(['S_' + CODE[tg[0].id], 'D_' + CODE[tg[0].id]]);
  act({ type: 'highlight', ids: dc3.map((c) => c.sort_id) });
  act({ type: 'discard' });
  clearHand();
  r = play(hand(['S_A']));
  // 2 discarded * (blaziken + charmander = 2 Fire): +1*2*2 = 4 Mult, X(1 + 0.15*2*2) = X1.6
  ok(near(r.total.mult, (1 + 4) * 1.6), 'blaziken: +Mult and X per discard per Fire/Fighting', r.total);
}

// ---------------------------------------------------------------- Mudkip / Marshtomp / Swampert
{
  start('MUDK');
  const hh = G.GAME.round_resets.hands;
  const j = add('j_poke_mudkip');
  ok(G.GAME.round_resets.hands === hh + 1, 'mudkip +1 hand');
  const tg = j.ability.extra.targets;
  const c0 = CODE[tg[0].id];
  let r = play(hand(['S_' + c0]));
  const nom = hand(['C_' + c0])[0].base.nominal; clearHand();
  ok(r.total.chips === 5 + nom + 20 && j.ability.extra.chips_earned === 20, 'mudkip: +20 chips per scored target', r.total);
  j.ability.extra.chips_earned = 400;
  winRound();
  ok(key(j) === 'j_poke_marshtomp', 'mudkip -> marshtomp', key(j));
  nextRound();
  add('j_poke_squirtle');
  r = play(hand(['S_' + c0]));
  ok(r.total.chips === 5 + nom + 60 + G.jokers.cards[1].ability.extra.chips, 'marshtomp: +30 x2 with another Water (+ squirtle)', r.total);
  j.ability.extra.chips_earned = 960;
  winRound();
  ok(key(j) === 'j_poke_swampert', 'marshtomp -> swampert', key(j));
  nextRound();
  r = play(hand(['S_' + c0]));
  ok(r.total.chips === 5 + nom + 40 + 20 + G.jokers.cards[1].ability.extra.chips && j.ability.extra.chips_earned === 60, 'swampert: +40 +20 per other Water/Earth', r.total);
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
