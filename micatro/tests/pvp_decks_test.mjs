// Micatro Multiplayer stage 7c: the Multiplayer DECKS and STAKES (engine/pvp_decks.js) and a custom deck in a match.
//   each deck's rule played, the three stakes' modifiers, the Cocktail's seeded three, the mod active only in a match that
//   plays one of them, a host's custom deck in a match (the match's rules win: no ante-8 end), resume / replay exact.
//   node micatro/tests/pvp_decks_test.mjs
import { G, P_CENTERS, P_STAKES, add_joker, get_blind_amount, ease_dollars, Card, P_CARDS } from '../js/engine/core.js';
import { newRun, act, STATE_NAMES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session, viewChecksum, ReplayStepper } from '../js/engine/session.js';
import { ACTIVE } from '../js/mods/registry.js';

const store = {};
globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } };
const st = () => STATE_NAMES[G.STATE];
const PVP = { lives: 4, pvpStart: 2, deathOnLoss: false, comeback: true, ruleset: 'expanded', order: true };
const flush = () => G.E_MANAGER.flush();
const start = (back, stake = 1, seed = 'MPDECK01') => { newRun({ seed, back, stake, pvp: PVP }); flush(); };
const weak = (A = act) => { A({ type: 'highlight', ids: [G.hand.cards[G.hand.cards.length - 1].sort_id] }); return A({ type: 'play' }); };

// ---- the mod only in a match that plays one of them; never in solo
{
  start('b_red');
  ok(!ACTIVE.includes('pvp_decks'), 'a match on a vanilla deck + stake: the Multiplayer decks mod is off');
  newRun({ seed: 'MPDECK01', back: 'b_mp_violet' });
  ok(!ACTIVE.includes('pvp_decks') && G.GAME.selected_back_key === 'b_red', 'a solo run can\'t pick a Multiplayer deck (Multiplayer only)');
  start('b_mp_violet');
  ok(ACTIVE.includes('pvp_decks') && G.GAME.selected_back_key === 'b_mp_violet' && !G.GAME.mods.includes('pvp_decks'), 'a match on the Violet Deck: active, never listed');
}
// ---- Violet: +1 voucher slot; vouchers 50% / 30% off in antes 1 / 2
{
  start('b_mp_violet');
  ok(G.GAME.modifiers.extra_vouchers === 1, 'Violet: +1 Voucher slot');
  const v = new Card(P_CARDS.empty, P_CENTERS.v_overstock_norm);
  ok(v.cost === 5, 'Violet: a $10 Voucher costs $5 in ante 1', v.cost);
  G.GAME.round_resets.ante = 2; v.set_cost();
  ok(v.cost === 7, 'Violet: $7 in ante 2', v.cost);
  G.GAME.round_resets.ante = 3; v.set_cost();
  ok(v.cost === 10, 'Violet: full price from ante 3', v.cost);
}
// ---- Indigo: +1 pick per pack; no skip while a card can be taken; no Red Card
{
  start('b_mp_indigo');
  ok(G.GAME.banned_keys.j_red_card, 'Indigo: Red Card banned');
  act({ type: 'select_blind' }); G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); act({ type: 'play' }); act({ type: 'cash_out' });
  const p = new Card(P_CARDS.empty, P_CENTERS.p_buffoon_normal_1); G.shop_booster.emplace(p); G.GAME.dollars = 50;
  ok(act({ type: 'buy', id: p.sort_id }).ok && G.GAME.pack_choices === 2, 'Indigo: a Buffoon Pack lets you choose 2', G.GAME.pack_choices);
  const sk = act({ type: 'skip_booster' });
  ok(!sk.ok && /skipped/.test(sk.error), 'Indigo: the pack can\'t be skipped while a joker can be taken', sk.error);
}
// ---- Orange / Oracle
{
  start('b_mp_orange');
  ok(G.consumeables.cards.filter((c) => c.config.center.key === 'c_hanged_man').length === 2 && st() === 'STANDARD_PACK' && G.pack_cards.cards.length === 5, 'Orange: 2 Hanged Men, and a free Mega Standard Pack opens at once', [st(), G.pack_cards.cards.length]);
  start('b_mp_oracle');
  ok(G.GAME.used_vouchers.v_clearance_sale && G.consumeables.cards.some((c) => c.config.center.key === 'c_medium'), 'Oracle: Clearance Sale + Medium');
  ease_dollars(500, true);
  ok(G.GAME.dollars === 75, 'Oracle: money capped at $50 + the interest cap ($75)', G.GAME.dollars);
}
// ---- Heidelberg: leaving a shop with a consumable -> a Negative copy
{
  start('b_mp_heidelberg');
  act({ type: 'select_blind' }); G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); act({ type: 'play' }); act({ type: 'cash_out' });
  add_joker('c_mars');
  act({ type: 'next_round' });
  const cs = G.consumeables.cards;
  ok(cs.length === 2 && cs[1].config.center.key === 'c_mars' && cs[1].edition && cs[1].edition.negative, 'Heidelberg: a Negative copy of the consumable after the shop', cs.map((c) => [c.config.center.key, c.edition]));
}
// ---- Echo: every scoring card retriggers; blinds X1.2 (+0.2 per Boss)
{
  start('b_red', 1, 'MPECHO01');
  const plain = (() => { act({ type: 'select_blind' }); const ids = G.hand.cards.slice(0, 1).map((c) => c.sort_id); act({ type: 'highlight', ids }); act({ type: 'play' }); return +G.GAME.chips; })();
  const blind0 = +G.GAME.blind.chips;
  start('b_mp_echodeck', 1, 'MPECHO01');
  act({ type: 'select_blind' });
  ok(+G.GAME.blind.chips === Math.round(blind0 * 1.2) || Math.abs(+G.GAME.blind.chips - blind0 * 1.2) < 1, 'Echo: blinds X1.2', [+G.GAME.blind.chips, blind0]);
  const ids = G.hand.cards.slice(0, 1).map((c) => c.sort_id); act({ type: 'highlight', ids }); act({ type: 'play' });
  ok(+G.GAME.chips > plain, 'Echo: the scoring card is retriggered (more chips than the same hand on the Red Deck)', [+G.GAME.chips, plain]);
}
// ---- Gradient: a card counts one rank up / down for jokers; 10s and Aces are faces
{
  start('b_mp_gradient');
  const scary = add_joker('j_scary_face');
  const ten = G.playing_cards.find((c) => c.base.id === 10), nine = G.playing_cards.find((c) => c.base.id === 9);
  ok(ten.is_face() && G.playing_cards.find((c) => c.base.id === 14).is_face(), 'Gradient: 10s and Aces count as face cards');
  const r9 = scary.calculate_joker({ individual: true, cardarea: G.play, other_card: ten, scoring_hand: [ten], full_hand: [ten] });
  ok(r9 && r9.chips === 30, 'Gradient: a 10 (also a Jack) is a face for Scary Face', r9);
  void nine;
  const ev = add_joker('j_even_steven');
  const r7 = ev.calculate_joker({ individual: true, cardarea: G.play, other_card: G.playing_cards.find((c) => c.base.id === 7), scoring_hand: [], full_hand: [] });
  ok(r7 && r7.mult === 4, 'Gradient: a 7 counts as an 8 for Even Steven', r7);
}
// ---- Cocktail: three other decks from the seed, their effects together
{
  start('b_mp_cocktail', 1, 'MPCOCK01');
  const a = G.GAME.cocktail.slice();
  start('b_mp_cocktail', 1, 'MPCOCK01');
  ok(a.length === 3 && JSON.stringify(a) === JSON.stringify(G.GAME.cocktail) && !a.includes('b_mp_cocktail'), 'Cocktail: 3 decks from the seed, never itself', a);
  let seenYellow = false;
  for (let i = 0; i < 40 && !seenYellow; i++) {
    newRun({ seed: 'MPCOCKY' + i, back: 'b_mp_cocktail', pvp: PVP });
    if (G.GAME.cocktail.includes('b_yellow')) { seenYellow = true; ok(G.GAME.dollars === 14, 'Cocktail with the Yellow Deck: +$10 at the start', G.GAME.dollars); }
  }
  ok(seenYellow, 'a Cocktail drew the Yellow Deck in 40 seeds');
}
// ---- the stakes
{
  start('b_red', 'stake_mp_planet');
  const M = G.GAME.modifiers;
  ok(G.GAME.stake === 9 && M.scaling === 3 && M.no_blind_reward.Small && M.enable_eternals_in_shop && M.enable_perishables_in_shop && !M.enable_rentals_in_shop && G.GAME.round_resets.discards === 4, 'Planet Stake: scaling 3, no Small reward, Eternal + Perishable, no Rentals, no -1 discard', { stake: G.GAME.stake, M, d: G.GAME.round_resets.discards });
  start('b_red', 'stake_mp_spectral');
  ok(G.GAME.stake === 10 && G.GAME.modifiers.scaling === 4 && G.GAME.modifiers.enable_rentals_in_shop, 'Spectral Stake: + Rentals, scaling 4');
  const a4 = get_blind_amount(4);
  start('b_red', 'stake_mp_spectralplus');
  ok(G.GAME.stake === 11 && G.GAME.modifiers.scaling === 5 && get_blind_amount(4) > a4, 'Spectral+ Stake: scaling 5, bigger blinds than Spectral', [get_blind_amount(4), a4]);
  ok(P_STAKES.stake_mp_planet.atlas === 'mtpvp_stakes', 'the stakes draw our own chips');
}
// ---- a custom deck in a match: its rules, the match's (no ante-8 end); recorded
{
  const s = new Session();
  s.start({ seed: 'MPCUST01', customDeck: { name: 'Lobby deck', rules: { win_ante: 2 } }, pvp: PVP, engineRev: 1 });
  ok(G.GAME.pvp && G.GAME.custom_deck && G.GAME.win_ante === 999, 'a custom deck in a match: the match\'s rules (no win at its ante)');
  for (let i = 0; i < 5; i++) { s.act({ type: 'select_blind' }); for (let k = 0; k < 9 && st() === 'SELECTING_HAND'; k++) weak((a) => s.act(a)); s.act({ type: 'cash_out' }); s.act({ type: 'next_round' }); }
  ok(s.act({ type: 'pvp_start_blind' }).ok && G.GAME.blind.config.blind.key === 'bl_mp_nemesis', 'the Nemesis comes as in any match');
  ok(s.recipe.customDeck && s.recipe.pvp, 'the recipe has both the deck and the match');
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs, 'resume rebuilds it exactly');
}
// ---- a Multiplayer deck + stake match resumes / replays exactly
{
  const s = new Session();
  s.start({ seed: 'MPDREC01', back: 'b_mp_cocktail', stake: 'stake_mp_spectral', pvp: PVP, engineRev: 1 });
  for (let i = 0; i < 3; i++) { s.act({ type: 'select_blind' }); for (let k = 0; k < 9 && st() === 'SELECTING_HAND'; k++) weak((a) => s.act(a)); s.act({ type: 'cash_out' }); s.act({ type: 'reroll_shop' }); s.act({ type: 'next_round' }); }
  const cs = viewChecksum(toView());
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(!r.stoppedAt && viewChecksum(toView()) === cs, 'a Cocktail / Spectral Stake match resumes exactly');
  const sc = new ReplayStepper(JSON.parse(JSON.stringify(s.recipe))).scan();
  ok(!sc.end.error && sc.end.checksum === cs, '... and replays exactly');
}

console.log(`pvp decks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
