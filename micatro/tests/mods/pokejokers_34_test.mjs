// Pokermon pokejokers_34 (Gimmighoul -> Gholdengo): every joker fired through real plays (act),
// plus the evolution.
//   node micatro/tests/mods/pokejokers_34_test.mjs
import { T, start, hand, add, play, winRound, nextRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['gimmighoul', 'gimmighoulr', 'gholdengo'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 3 pokejokers_34 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_34.lua'].length === 3, 'defs: 3 from pokejokers_34.lua');

// ---------------------------------------------------------------- Gimmighoul
{
  start('GIMMIGHOUL');
  const j = add('j_poke_gimmighoul');
  ok(j.ability.extra.previous_money === G.GAME.dollars && j.ability.extra.money_seen === 0, 'gimmighoul: remembers the money it was made with');
  let seen = 0;
  const track = (res) => { for (const e of res.events) if (e.type === 'dollars') seen += Math.abs(e.mod); return res; };
  const d0 = G.GAME.dollars;
  track(play(hand(['S_K', 'H_K'], { center: 'm_gold' })).res);
  ok(G.GAME.dollars === d0 + 6, 'gimmighoul: played Gold cards earn $3', G.GAME.dollars - d0);
  ok(j.ability.extra.money_seen === 6 && seen === 6, 'gimmighoul: counts money earned', j.ability.extra.money_seen);
  track(winRound().res);
  track(act({ type: 'cash_out' }));
  ok(j.ability.extra.money_seen === seen && seen > 6, 'gimmighoul: counts the cash-out too', [j.ability.extra.money_seen, seen]);
  // Spending counts as well (each change on its own: earning $X then spending $Y counts X + Y).
  G.GAME.dollars = 50; j.ability.extra.previous_money = 50; j.ability.extra.money_seen = 0;
  const pack = G.shop_booster.cards[0];
  const cost = pack.cost;
  act({ type: 'buy', id: pack.sort_id });
  ok(j.ability.extra.money_seen === cost, 'gimmighoul: counts money spent', [j.ability.extra.money_seen, cost]);
  // Skipping a pack in the shop: a free Negative roaming Gimmighoul joins the shop.
  const n0 = G.shop_jokers.cards.length;
  act({ type: 'skip_booster' });
  const r = G.shop_jokers.cards.find((c) => key(c) === 'j_poke_gimmighoulr');
  ok(r && G.shop_jokers.cards.length === n0 + 1 && r.cost === 0 && r.edition && r.edition.negative, 'gimmighoul: skipped pack -> free Negative Gimmighoul (Roaming) in the shop', r && [r.cost, r.edition]);
  // Buying it pays out and it leaves.
  const d1 = G.GAME.dollars, slots = G.jokers.cards.length;
  act({ type: 'buy', id: r.sort_id });
  const gain = G.GAME.dollars - d1;
  ok([1, 3, 5, 10, 30, 50, 100, 200].includes(gain), 'gimmighoul (roaming): random payout when obtained', gain);
  ok(G.jokers.cards.length === slots && !G.jokers.cards.includes(r), 'gimmighoul (roaming): leaves right away');
  ok(j.ability.extra.money_seen === cost + gain, 'gimmighoul: saw that payout too', j.ability.extra.money_seen);
  act({ type: 'next_round' }); act({ type: 'select_blind' });
  j.ability.extra.money_seen = 999;
  winRound();
  ok(key(j) === 'j_poke_gholdengo', 'gimmighoul evolves after seeing $999', key(j));
}
{
  // Skipping a pack outside the shop (tag pack): no roaming Gimmighoul.
  start('GIMMI2');
  add('j_poke_gimmighoul');
  const before = G.shop_jokers.cards.length;
  P_CENTERS.j_poke_gimmighoul.calculate(P_CENTERS.j_poke_gimmighoul, G.jokers.cards[0], { skipping_booster: true });
  ok(G.shop_jokers.cards.length === before, 'gimmighoul: no shop, no roaming Gimmighoul');
}

// ---------------------------------------------------------------- Gholdengo
{
  start('GHOLDENGO');
  const j = add('j_poke_gholdengo');
  G.GAME.dollars = 7;
  let r = play(hand(['S_K', 'H_K'], { center: 'm_gold' }));
  // Both Gold cards: -$3 each (7 -> 4 -> 1), X1.5 each -> X2.25.
  ok(r.total.chips === 30 && near(r.total.mult, 2 * 2.25) && G.GAME.dollars === 1, 'gholdengo: Gold cards spend $3 and multiply its XMult by 1.5', [r.total, G.GAME.dollars]);
  G.GAME.dollars = 4;
  r = play(hand(['S_Q', 'H_Q'], { center: 'm_gold' }));
  ok(near(j.ability.extra.Xmult, 2.25 * 1.5) && G.GAME.dollars === 1, 'gholdengo: only spends what it has', [j.ability.extra.Xmult, G.GAME.dollars]);
  ok(near(r.total.mult, 2 * 2.25 * 1.5), 'gholdengo: XMult scored', r.total);
  j.set_debuff(true);
  ok(!j.debuff, 'gholdengo cannot be debuffed');
  winRound();
  ok(j.ability.extra.Xmult === 1, 'gholdengo: resets at end of round', j.ability.extra.Xmult);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'gholdengo: X1 without Gold cards', r.total);
}

done();
