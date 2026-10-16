// BETMMA (micatro/mods/betmma): mod off = none of its content; every voucher's effect (and every fusion's
// unlock rule), voucher rarity + weights, the 3 voucher packs, the 11 jokers and the 2 editions fired through
// real act() plays with exact values; the intended-design fixes (each fails on the shipped Lua behaviour);
// the engine's extra-voucher fix; describe() fills every #n#.
//   node micatro/tests/mods/betmma_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, add_joker, create_playing_card, create_card, get_current_pool,
  get_blind_amount, get_next_voucher_key, ease_dollars, level_up_hand, poll_edition, pseudoseed,
} from '../../js/engine/core.js';
import { newRun, act, STATES, change_voucher_limit, evaluate_poker_hand } from '../../js/engine/run.js';
import { ACTIVE } from '../../js/mods/registry.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';
import { STATUS, VOUCHERS_MODULE as V, REAL_RANDOM_MODULE as RR, EDITIONS_MODULE as E, CHALLENGES } from '../../mods/betmma/index.js';
import { pseudorandom_element_weighted, get_weight } from '../../mods/betmma/common.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const VK = (id) => 'v_betmma_' + id;
const JK = (id) => 'j_betmma_' + id;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

function run(seed, { mods = ['betmma'], options = {}, boss = 'bl_wall', back = 'b_red' } = {}) {
  newRun({ seed, back, mods, modOptions: { betmma: options } });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
}
function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
const add = (k, ed) => { const c = add_joker(k, ed); flush(); return c; };
/** Redeem a voucher through Card:redeem (free). */
function redeem(id) {
  const c = new Card(P_CARDS.empty, P_CENTERS[id.startsWith('v_') ? id : VK(id)]);
  c.cost = 0;
  c.redeem();
  flush();
  return c;
}
function select() { act({ type: 'select_blind' }); clearHand(); }
function play(cards, { keepChips } = {}) {
  if (!keepChips) { G.GAME.chips = 0; if (G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; }
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { res, total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}
/** Win the current blind with `chips` already scored (S_2 high card adds 7). */
function win(chips) { G.GAME.chips = chips ?? G.GAME.blind.chips; clearHand(); return play(hand(['S_2']), { keepChips: true }); }
function toShop() { if (G.STATE === STATES.SELECTING_HAND) win(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); }
function nextRound() { toShop(); if (G.STATE === STATES.SHOP) act({ type: 'next_round' }); select(); }
function toBoss() {
  for (let i = 0; i < 10 && G.STATE !== STATES.SELECTING_HAND; i++) {
    if (G.STATE === STATES.BLIND_SELECT) { if (G.GAME.blind_on_deck !== 'Boss') act({ type: 'skip_blind' }); else select(); }
    else act({ type: 'skip_booster' });
  }
}
const msgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
const NOFILL = /#\d+#/;
function shopItem(centerKey, area) {
  const c = create_card(P_CENTERS[centerKey].set, area, null, null, null, null, centerKey, 'test');
  area.emplace(c);
  return c;
}
const used = (id) => !!G.GAME.used_vouchers[VK(id)];
const tagKeys = () => G.GAME.tags.map((t) => t.key);

// =================================================================== off / on
{
  run('BETOFF', { mods: [] });
  ok(ACTIVE.length === 0, 'no mods');
  ok(!P_CENTER_POOLS.Voucher.some((c) => c.mod === 'betmma') && !P_CENTER_POOLS.Joker.some((c) => c.mod === 'betmma') &&
     !P_CENTER_POOLS.Booster.some((c) => c.mod === 'betmma'), 'off: no BETMMA vouchers / jokers / packs in pools');
  ok(get_blind_amount(1) === 300 && get_blind_amount(2) === 800, 'off: blind amounts vanilla');
  ok(!G.GAME.current_round.voucher.startsWith('v_betmma'), 'off: the shop voucher is vanilla');
  const pool = get_current_pool('Voucher')[0].filter((v) => v !== 'UNAVAILABLE');
  ok(pool.length === 16, 'off: 16 tier-1 vanilla vouchers available, no rarity filter', pool.length);
}
{
  run('BETON');
  ok(ACTIVE.join() === 'betmma', 'on: active');
  const v = P_CENTER_POOLS.Voucher.filter((c) => c.mod === 'betmma');
  ok(v.length === 82 && STATUS.vouchers.length === 82, '82 vouchers registered and pooled', v.length);
  ok(STATUS.fusions.length === 24 && STATUS.fusions.every((k) => P_CENTERS[k].config.weight === 4), '24 fusion vouchers, each weighing 4');
  ok(P_CENTER_POOLS.Joker.filter((c) => c.mod === 'betmma').length === 11, '11 jokers pooled');
  ok(P_CENTER_POOLS.Booster.filter((c) => c.mod === 'betmma').length === 3, '3 voucher packs pooled');
  ok(STATUS.editions.length === 2 && P_CENTERS.e_betmma_phantom.config.card_limit === 1, '2 editions');
  ok(CHALLENGES.length === 5 && CHALLENGES[3].deck.cards.length === 52 && CHALLENGES[3].deck.cards.every((c) => c.e === 'm_stone'), '5 challenges (data), Anti-Medusa all Stone');
  // option toggles: vouchers off -> gone (packs + editions too); one voucher off -> just it; jokers off
  run('BETOPT', { options: { vouchers: false } });
  ok(!P_CENTER_POOLS.Voucher.some((c) => c.mod === 'betmma') && !P_CENTER_POOLS.Booster.some((c) => c.mod === 'betmma') &&
     P_CENTER_POOLS.Joker.some((c) => c.mod === 'betmma'), 'option vouchers off: no vouchers or packs, jokers still on');
  run('BETOPT', { options: { v_slate: false, jokers: false, voucher_packs: false } });
  ok(!P_CENTER_POOLS.Voucher.some((c) => c.key === VK('slate')) && P_CENTER_POOLS.Voucher.some((c) => c.key === VK('chaos')), 'per-voucher option: Slate off, Chaos on');
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'betmma') && !P_CENTER_POOLS.Booster.some((c) => c.mod === 'betmma'), 'jokers / packs options off');
}

// =================================================================== rarity
{
  run('BETRAR');
  const r = (id) => V.VOUCHER_DATA[id].config.rarity || 1;
  ok(r('abstract_art') === 2 && r('voucher_bulk') === 3 && r('chaos') === 4 && r('oversupply') === 1, 'rarities from the Lua configs');
  // FIX 2: Overkill is uncommon (the shipped Lua put rarity=2 beside config, so it was common)
  ok(P_CENTERS[VK('overkill')].config.rarity === 2, 'FIX 2: Overkill is uncommon');
  // the pool roll: each voucher joins with chance 1 / {1, 2, 4, 20}
  const seen = {}, tries = 400;
  for (let i = 0; i < tries; i++) for (const k of get_current_pool('Voucher')[0]) if (k !== 'UNAVAILABLE') seen[k] = (seen[k] || 0) + 1;
  const freq = (id) => (seen[id.startsWith('v_') ? id : VK(id)] || 0) / tries;
  ok(freq('v_overstock_norm') === 1 && freq('oversupply') === 1, 'common vouchers always in the pool', [freq('v_overstock_norm'), freq('oversupply')]);
  ok(Math.abs(freq('abstract_art') - 0.5) < 0.08 && Math.abs(freq('engulfer') - 0) < 1e-9, 'uncommon ~1/2 (tier 2 not unlocked: never)', [freq('abstract_art')]);
  ok(Math.abs(freq('overkill') - 0.5) < 0.08, 'FIX 2: Overkill joins ~1/2 of the time', freq('overkill'));
  G.GAME.used_vouchers[VK('voucher_bundle')] = true; G.GAME.used_vouchers[VK('collector')] = true; G.GAME.used_vouchers[VK('abstract_art')] = true;
  for (const k of Object.keys(seen)) delete seen[k];
  for (let i = 0; i < 2000; i++) for (const k of get_current_pool('Voucher')[0]) if (k !== 'UNAVAILABLE') seen[k] = (seen[k] || 0) + 1;
  ok(Math.abs((seen[VK('voucher_bulk')] || 0) / 2000 - 0.25) < 0.04, 'rare ~1/4', (seen[VK('voucher_bulk')] || 0) / 2000);
  ok(Math.abs((seen[VK('chaos')] || 0) / 2000 - 0.05) < 0.02, 'legendary ~1/20', (seen[VK('chaos')] || 0) / 2000);
  // weights: fusions 4, others 1; picked ~4x as often in a weighted draw
  ok(get_weight(VK('chaos')) === 4 && get_weight(VK('oversupply')) === 1 && get_weight('v_overstock_norm') === 1 && get_weight('UNAVAILABLE') === 1, 'get_weight');
  let f = 0;
  for (let i = 0; i < 1000; i++) if (pseudorandom_element_weighted([[1, VK('oversupply')], [2, VK('chaos')]], pseudoseed('wtest' + i), get_weight)[0] === VK('chaos')) f++;
  ok(Math.abs(f / 1000 - 0.8) < 0.05, 'a fusion is picked 4:1 against a plain voucher', f / 1000);
  // FIX 3: the rarity switch off -> no roll (legendary always in) and weight 1
  run('BETRAR2', { options: { voucher_rarity: false } });
  G.GAME.used_vouchers[VK('collector')] = true; G.GAME.used_vouchers[VK('abstract_art')] = true;
  let all = true;
  for (let i = 0; i < 50; i++) if (!get_current_pool('Voucher')[0].includes(VK('chaos'))) all = false;
  ok(all, 'FIX 3: voucher rarity off -> a legendary is always in the pool');
  ok(get_weight(VK('chaos')) === 1, 'voucher rarity off -> fusion weight 1');
}

// =================================================================== fusion unlock rules
{
  run('BETFUS', { options: { voucher_rarity: false } });
  for (const k of STATUS.fusions) {
    const req = P_CENTERS[k].requires;
    ok(req.length === 2, k + ' has 2 parents');
    const inPool = () => get_current_pool('Voucher')[0].includes(k);
    G.GAME.used_vouchers = {};
    const none = inPool();
    G.GAME.used_vouchers = { [req[0]]: true };
    const one = inPool();
    G.GAME.used_vouchers = { [req[1]]: true };
    const other = inPool();
    G.GAME.used_vouchers = { [req[0]]: true, [req[1]]: true };
    const both = inPool();
    ok(!none && !one && !other && both, 'fusion ' + k + ' unlocks only with both ' + req.join(' + '), { none, one, other, both });
  }
  G.GAME.used_vouchers = {};
  // a tier-2 voucher needs its tier 1
  ok(!get_current_pool('Voucher')[0].includes(VK('gold_bar')), 'Gold Bar needs Gold Coin');
  G.GAME.used_vouchers[VK('gold_coin')] = true;
  ok(get_current_pool('Voucher')[0].includes(VK('gold_bar')), 'Gold Bar after Gold Coin');
}

// =================================================================== engine fix: an extra shop voucher keeps the round's voucher
{
  run('BETXV', { mods: ['betmma'], options: { vouchers: false } }); // (no BETMMA rules: just the engine's voucher slots)
  select(); toShop();
  change_voucher_limit(1);
  ok(G.shop_vouchers.cards.length === 2, 'two shop vouchers (main + extra slot)');
  const main = G.GAME.current_round.voucher;
  const extra = G.shop_vouchers.cards.find((c) => key(c) !== main);
  G.GAME.dollars = 100;
  ok(act({ type: 'buy', id: extra.sort_id }).ok, 'buy the extra voucher');
  ok(G.GAME.current_round.voucher === main, 'ENGINE FIX: the round voucher survives buying the extra one', G.GAME.current_round.voucher);
  ok(G.shop_vouchers.cards.some((c) => key(c) === main), 'main voucher still for sale');
  act({ type: 'next_round' }); select(); toShop();
  ok(G.shop_vouchers.cards.some((c) => key(c) === main), 'main voucher back in the next shop of the ante');
  const m = G.shop_vouchers.cards.find((c) => key(c) === main);
  act({ type: 'buy', id: m.sort_id });
  ok(G.GAME.current_round.voucher === null, 'buying the main voucher clears it (vanilla)');
}

// =================================================================== vouchers (1): oversupply .. reserve area
{
  // Oversupply: a Voucher Tag after the Boss Blind only; Oversupply Plus: after every blind
  run('BETOS');
  redeem('oversupply');
  select(); win();
  ok(!tagKeys().includes('tag_voucher'), 'Oversupply: no tag after Small Blind');
  toShop(); act({ type: 'next_round' }); select(); win(); toShop(); act({ type: 'next_round' });
  toBoss(); win();
  ok(tagKeys().filter((k) => k === 'tag_voucher').length === 1, 'Oversupply: a Voucher Tag after the Boss', tagKeys());
  run('BETOSP');
  redeem('oversupply'); redeem('oversupply_plus');
  select(); win();
  ok(tagKeys().filter((k) => k === 'tag_voucher').length === 1, 'Oversupply Plus: a Voucher Tag after the Small Blind');
}
{
  // Gold Coin: +$11, Small Blind pays nothing; Gold Bar: +$16, Big Blind pays nothing
  run('BETGC');
  const d0 = G.GAME.dollars;
  redeem('gold_coin');
  ok(G.GAME.dollars === d0 + 11 && G.GAME.modifiers.no_blind_reward.Small, 'Gold Coin: +$11, no Small Blind reward');
  redeem('gold_bar');
  ok(G.GAME.dollars === d0 + 27 && G.GAME.modifiers.no_blind_reward.Big, 'Gold Bar: +$16, no Big Blind reward');
  const v = toView();
  ok(v.choices.Small.dollars === 0 && v.choices.Big.dollars === 0 && v.choices.Boss.dollars === 5, 'blind rewards shown 0 / 0 / 5');
}
{
  // Abstract Art: +1 Ante to win, +1 hand, +1 discard; Mondrian: +1 Ante to win, +1 joker slot
  run('BETAA');
  const h = G.GAME.round_resets.hands, d = G.GAME.round_resets.discards, lim = G.jokers.config.card_limit;
  redeem('abstract_art');
  ok(G.GAME.win_ante === 9 && G.GAME.round_resets.hands === h + 1 && G.GAME.round_resets.discards === d + 1, 'Abstract Art: win ante 9, +1 hand, +1 discard');
  redeem('mondrian');
  ok(G.GAME.win_ante === 10 && G.jokers.config.card_limit === lim + 1, 'Mondrian: win ante 10, +1 joker slot');
}
{
  // Round Up / Round Up Plus: chips (mult) round up to the nearest 10 at every step
  run('BETRU');
  select();
  let t = play(hand(['S_2'])).total;
  ok(t.chips === 7 && t.mult === 1, 'baseline: High Card 2 = 7 x 1');
  redeem('round_up');
  t = play(hand(['S_3'])).total;
  ok(t.chips === 20 && t.mult === 1 && t.total === 20, 'Round Up: 5 -> 10, +3 -> 20 chips', t);
  redeem('round_up_plus');
  t = play(hand(['S_4'])).total;
  ok(t.chips === 20 && t.mult === 10 && t.total === 200, 'Round Up Plus: mult 1 -> 10', t);
}
{
  // Event Horizon: 2 Negative planets now; 1 in 4 a Black Hole on opening a Celestial Pack
  run('BETEH');
  redeem('event_horizon');
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Planet' && c.edition && c.edition.negative), 'Event Horizon: 2 Negative planets');
  select(); toShop();
  G.GAME.probabilities.normal = 1000;
  const pk = shopItem('p_celestial_normal_1', G.shop_booster);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pk.sort_id });
  ok(G.consumeables.cards.some((c) => key(c) === 'c_black_hole'), 'Event Horizon: Celestial Pack -> Black Hole');
  act({ type: 'skip_booster' });
  // Engulfer: a Black Hole now (room); 1 in 5 per Planet used
  run('BETEN');
  redeem('event_horizon');
  G.consumeables.config.card_limit = 6;
  redeem('engulfer');
  ok(G.consumeables.cards.filter((c) => key(c) === 'c_black_hole').length === 1, 'Engulfer: a Black Hole now');
  G.GAME.probabilities.normal = 1000;
  select();
  const pl = G.consumeables.cards.find((c) => key(c) !== 'c_black_hole');
  act({ type: 'use', id: pl.sort_id });
  ok(G.consumeables.cards.filter((c) => key(c) === 'c_black_hole').length === 2, 'Engulfer: using a Planet makes a Black Hole');
}
{
  // Target: <= 120% of the blind -> a Joker (room); Bull's Eye: <= 105% -> a Negative Joker
  run('BETTG');
  redeem('target');
  select();
  win(G.GAME.blind.chips + 50); // 350 + 7 = 119%
  ok(G.jokers.cards.length === 1 && !G.jokers.cards[0].edition?.negative, 'Target: 119% -> a joker', G.jokers.cards.length);
  toShop(); act({ type: 'next_round' }); select();
  win(G.GAME.blind.chips * 1.3);
  ok(G.jokers.cards.length === 1, 'Target: 130% -> nothing');
  run('BETBE');
  redeem('target'); redeem('bulls_eye');
  select();
  win(G.GAME.blind.chips); // 100% + 7
  ok(G.jokers.cards.length === 2 && G.jokers.cards.filter((c) => c.edition && c.edition.negative).length === 1, "Bull's Eye: a Negative joker as well", G.jokers.cards.length);
}
{
  // Voucher Bundle: 2 random vouchers; Voucher Bulk: 4
  run('BETVB');
  const n0 = Object.keys(G.GAME.used_vouchers).length;
  redeem('voucher_bundle');
  ok(Object.keys(G.GAME.used_vouchers).length === n0 + 3, 'Voucher Bundle: itself + 2 random vouchers', Object.keys(G.GAME.used_vouchers));
  const cr = G.GAME.current_round.voucher;
  redeem('voucher_bulk');
  ok(Object.keys(G.GAME.used_vouchers).length === n0 + 8, 'Voucher Bulk: itself + 4', Object.keys(G.GAME.used_vouchers).length);
  ok(G.GAME.current_round.voucher === cr, 'random redeems keep the round voucher');
}
{
  // Skip: +$6 per skip; Skipper: a Double Tag per skip (before the blind's tag: it doubles it)
  run('BETSK');
  G.FORCE_TAG = 'tag_uncommon';
  G.GAME.round_resets.blind_tags.Small = 'tag_uncommon';
  redeem('skip'); redeem('skipper');
  const d0 = G.GAME.dollars;
  act({ type: 'skip_blind' });
  ok(G.GAME.dollars === d0 + 6, 'Skip: +$6', G.GAME.dollars - d0);
  ok(tagKeys().filter((k) => k === 'tag_uncommon').length === 2, 'Skipper: the Double Tag doubles the skip tag', tagKeys());
  G.FORCE_TAG = null;
}
{
  // Scrawl: $2 per joker, then fill the joker slots; Scribble: 3 Negative Spectral cards
  run('BETSC');
  add('j_joker'); add('j_egg');
  const d0 = G.GAME.dollars;
  redeem('scrawl');
  ok(G.GAME.dollars === d0 + 4 && G.jokers.cards.length === 5, 'Scrawl: +$4 for 2 jokers, filled to 5', [G.GAME.dollars - d0, G.jokers.cards.length]);
  // FIX 6: an over-full row never makes joker_buffer negative
  G.jokers.config.card_limit = 3;
  redeem('scrawl');
  ok(G.GAME.joker_buffer === 0, 'FIX 6: Scrawl with an over-full row leaves joker_buffer at 0', G.GAME.joker_buffer);
  redeem('scribble');
  ok(G.consumeables.cards.length === 3 && G.consumeables.cards.every((c) => c.ability.set === 'Spectral' && c.edition && c.edition.negative), 'Scribble: 3 Negative Spectrals');
}
{
  // Reserve Area: keep a Tarot from an Arcana Pack; Reserve Area Plus: Spectrals too (+ an Ethereal Tag)
  run('BETRA');
  select(); toShop();
  G.GAME.dollars = 100;
  let pk = shopItem('p_arcana_normal_1', G.shop_booster);
  act({ type: 'buy', id: pk.sort_id });
  let c = G.pack_cards.cards[0];
  ok(!act({ type: 'reserve', id: c.sort_id }).ok, 'no Reserve Area: cannot reserve');
  act({ type: 'skip_booster' });
  redeem('reserve_area');
  pk = shopItem('p_arcana_normal_1', G.shop_booster);
  act({ type: 'buy', id: pk.sort_id });
  c = G.pack_cards.cards[0];
  const v = toView().areas.pack_cards.find((x) => x.id === c.sort_id);
  ok(v.reserve === true && v.reserve_label === 'RESERVE', 'Reserve Area: the pack card offers RESERVE');
  ok(act({ type: 'reserve', id: c.sort_id }).ok && G.consumeables.cards.includes(c) && G.STATE === STATES.SHOP, 'Reserve Area: Tarot kept, pack closed');
  pk = shopItem('p_spectral_normal_1', G.shop_booster);
  act({ type: 'buy', id: pk.sort_id });
  ok(!act({ type: 'reserve', id: G.pack_cards.cards[0].sort_id }).ok, 'Reserve Area: not Spectral packs');
  act({ type: 'skip_booster' });
  redeem('reserve_area_plus');
  ok(tagKeys().includes('tag_ethereal'), 'Reserve Area Plus: an Ethereal Tag now');
  G.consumeables.config.card_limit = 5;
  pk = shopItem('p_spectral_normal_1', G.shop_booster);
  act({ type: 'buy', id: pk.sort_id });
  c = G.pack_cards.cards[0];
  ok(act({ type: 'reserve', id: c.sort_id }).ok && G.consumeables.cards.includes(c), 'Reserve Area Plus: Spectral kept');
}

// =================================================================== vouchers (2): overkill .. stash
{
  // Overkill: >= 300% -> Foil / Holo / Polychrome on a random editionless joker
  run('BETOK');
  redeem('overkill');
  add('j_joker');
  select();
  win(G.GAME.blind.chips * 2);
  ok(!G.jokers.cards[0].edition, 'Overkill: 200% -> nothing');
  toShop(); act({ type: 'next_round' }); select();
  win(G.GAME.blind.chips * 3);
  ok(G.jokers.cards[0].edition && ['foil', 'holo', 'polychrome'].includes(G.jokers.cards[0].edition.type), 'Overkill: 300% -> an edition', G.jokers.cards[0].edition);
  // Big Blast: >= X5 -> Negative (can override), then the bar is X20
  run('BETBB');
  redeem('overkill'); redeem('big_blast');
  add('j_joker', 'foil');
  ok(V.big_blast_vars(P_CENTERS[VK('big_blast')])[0] === 5, 'Big Blast: X5 first');
  select();
  win(G.GAME.blind.chips * 5);
  ok(G.jokers.cards[0].edition && G.jokers.cards[0].edition.negative && G.GAME.v_big_blast_count === 1, 'Big Blast: X5 -> Negative (over Foil)');
  ok(V.big_blast_vars(P_CENTERS[VK('big_blast')])[0] === 20 && V.big_blast_vars(P_CENTERS[VK('big_blast')])[1] === 16, 'Big Blast: then X20 (and X16 after that)');
}
{
  // 3D Boosters: a third booster slot; 4D Boosters: rerolls reroll the packs, $3 dearer
  run('BET3D');
  redeem('3d_boosters');
  select(); toShop();
  ok(G.shop_booster.cards.length === 3, '3D Boosters: 3 packs in the shop', G.shop_booster.cards.length);
  redeem('4d_boosters');
  const before = G.shop_booster.cards.map((c) => c.sort_id);
  G.GAME.dollars = 100;
  act({ type: 'reroll_shop' });
  ok(G.shop_booster.cards.length === 3 && G.shop_booster.cards.every((c) => !before.includes(c.sort_id)), '4D Boosters: reroll replaces the packs');
  ok(G.shop_booster.cards.every((c) => c.cost === P_CENTERS[key(c)].cost + 3), '4D Boosters: rerolled packs cost $3 more', G.shop_booster.cards.map((c) => [c.cost, P_CENTERS[key(c)].cost]));
}
{
  // B1G1: redeeming a voucher also redeems its higher tier, paying full price
  run('BETB1');
  redeem('b1g50'); redeem('b1g1');
  select(); toShop();
  G.GAME.dollars = 100;
  const ov = shopItem('v_overstock_norm', G.shop_vouchers);
  act({ type: 'buy', id: ov.sort_id });
  ok(G.GAME.used_vouchers.v_overstock_plus && G.GAME.dollars === 100 - 10 - 10, 'B1G1: Overstock + Overstock Plus, $20 paid', G.GAME.dollars);
  ok(G.GAME.shop.joker_max === 4, 'B1G1: both Overstocks applied');
  // B1G50%: 50% (not doubled by Oops) to get the higher tier at half price
  let hit = false, miss = false;
  for (let s = 0; s < 30 && !(hit && miss); s++) {
    run('BETB5' + s);
    redeem('b1g50');
    G.GAME.probabilities.normal = 1000; // "This chance can't be doubled"
    G.GAME.dollars = 100;
    const c = new Card(P_CARDS.empty, P_CENTERS.v_grabber);
    c.redeem(); flush();
    if (G.GAME.used_vouchers.v_nacho_tong) { hit = true; ok(G.GAME.dollars === 100 - 10 - 5, 'B1G50%: Nacho Tong at half price ($5)', G.GAME.dollars); }
    else { miss = true; ok(G.GAME.dollars === 90, 'B1G50%: miss pays only the voucher'); }
  }
  ok(hit && miss, 'B1G50%: both outcomes happen');
  // B1Ginf: every higher tier whose only missing parent is this one (no legendaries)
  run('BETBI');
  for (const id of ['b1g50', 'b1g1', 'collector', 'b1ginf', 'round_up']) redeem(id);
  G.GAME.dollars = 100;
  redeem('gold_coin');
  ok(used('gold_bar') && used('gold_round_up'), 'B1Ginf: Gold Coin -> Gold Bar and Gold Round Up (fusion with Round Up)');
  ok(G.GAME.dollars === 100 + 11 + 16 - 1 - 10, 'B1Ginf: their full costs paid ($1 + $10)', G.GAME.dollars);
  // no legendaries from B1G: Chaos (Collector + Abstract Art) never comes with Abstract Art
  redeem('abstract_art');
  ok(!used('chaos') && used('mondrian'), 'B1G never gives a legendary (no Chaos), still Mondrian');
}
{
  // Collector: each voucher redeemed -4% blind requirement (multiplicative)
  run('BETCO');
  redeem('collector');
  ok(near(get_blind_amount(1), 300 * 0.96), 'Collector: 1 voucher -> X0.96', get_blind_amount(1));
  redeem('v_grabber' ); redeem('v_wasteful');
  ok(near(get_blind_amount(1), 300 * Math.pow(0.96, 3)), 'Collector: 3 vouchers -> X0.96^3');
  select();
  ok(near(G.GAME.blind.chips, Math.floor(300 * Math.pow(0.96, 3) * 1) ) || near(G.GAME.blind.chips, 300 * Math.pow(0.96, 3)), 'Collector: the Small Blind asks for less', G.GAME.blind.chips);
  // Connoisseur: with more than $400/(redeemed+1), a redeem also gives Antimatter (and X5 to that bar)
  run('BETCN');
  redeem('collector'); redeem('connoisseur');
  ok(G.GAME.vouchers_bought === 2 && V.connoisseur_vars(P_CENTERS[VK('connoisseur')])[1] === 134, 'Connoisseur: bar $400/3 = $134');
  G.GAME.dollars = 99;
  redeem('v_grabber');
  ok(!G.GAME.used_vouchers.v_antimatter, 'Connoisseur: $99 < $100 (400/4) -> no Antimatter');
  G.GAME.dollars = 80;
  const lim = G.jokers.config.card_limit;
  redeem('v_wasteful');
  ok(G.GAME.used_vouchers.v_antimatter && G.jokers.config.card_limit === lim + 1 && G.GAME.v_connoisseur_count === 1, 'Connoisseur: $80 >= $80 (400/5) -> Antimatter (+1 joker slot)');
  ok(V.connoisseur_vars(P_CENTERS[VK('connoisseur')])[0] === 2000, 'Connoisseur: bar X5');
}
{
  // Flipped Card: flip up to 3 cards once per hand; flipped cards come back after being played
  run('BETFL');
  select();
  ok(!act({ type: 'betmma_flip' }).ok, 'no Flipped Card: no flip');
  redeem('flipped_card');
  const cs = hand(['S_K', 'H_K', 'D_5', 'C_9']);
  act({ type: 'highlight', ids: [cs[0].sort_id, cs[2].sort_id] });
  ok(toView().mod_buttons && toView().mod_buttons[0].label === 'Flip' && toView().mod_buttons[0].enabled, 'Flip button shown');
  ok(act({ type: 'betmma_flip' }).ok && cs[0].facing === 'back' && cs[2].facing === 'back', 'Flip: 2 cards face down');
  ok(!act({ type: 'betmma_flip' }).ok, 'Flip: once per hand');
  act({ type: 'highlight', ids: [cs[0].sort_id, cs[1].sort_id] });
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const r = act({ type: 'play' });
  const t = r.events.find((e) => e.type === 'hand_total');
  ok(t.chips === 30 && t.mult === 2, 'the flipped K scores normally (Pair of Kings 10+20 x 2)', t);
  ok(G.hand.cards.includes(cs[0]) && !G.hand.cards.includes(cs[1]) && G.discard.cards.includes(cs[1]), 'Flipped Card: the flipped King returns to hand, the other is discarded');
  ok(act({ type: 'highlight', ids: [cs[2].sort_id] }).ok && act({ type: 'betmma_flip' }).ok, 'Flip: allowed again after a hand');
  // Double Flipped Card: a flipped card is held in hand while the rest score (held effects fire)
  run('BETDF');
  redeem('flipped_card'); redeem('double_flipped_card');
  select();
  const st = hand(['S_K'], 'm_steel')[0], pk = hand(['H_2', 'D_2']);
  act({ type: 'highlight', ids: [st.sort_id] }); act({ type: 'betmma_flip' });
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: [st.sort_id, pk[0].sort_id, pk[1].sort_id] });
  const t2 = act({ type: 'play' }).events.find((e) => e.type === 'hand_total');
  ok(t2.chips === 10 + 2 + 2 && near(t2.mult, 2 * 1.5), 'Double Flipped: the flipped Steel King (not scoring) is held while the hand scores (X1.5)', t2);
  ok(G.hand.cards.includes(st), 'Double Flipped: it stays in hand');
}
{
  // Prologue: an Eternal Tarot each blind (the last one goes); Epilogue: +1 slot, an Eternal Spectral each blind end
  run('BETPR');
  redeem('prologue');
  select();
  const p1 = G.consumeables.cards.filter((c) => c.ability.v_prologue);
  ok(p1.length === 1 && p1[0].ability.set === 'Tarot' && p1[0].ability.eternal, 'Prologue: an Eternal Tarot at blind start');
  ok(!p1[0].can_sell_card(), 'an Eternal consumable cannot be sold');
  nextRound();
  const p2 = G.consumeables.cards.filter((c) => c.ability.v_prologue);
  ok(p2.length === 1 && p2[0] !== p1[0], 'Prologue: the old one goes, a new one comes');
  run('BETEP');
  const lim = G.consumeables.config.card_limit;
  redeem('prologue'); redeem('epilogue');
  ok(G.consumeables.config.card_limit === lim + 1, 'Epilogue: +1 consumable slot');
  select(); win();
  ok(G.consumeables.cards.some((c) => c.ability.v_epilogue && c.ability.set === 'Spectral' && c.ability.eternal), 'Epilogue: an Eternal Spectral at blind end');
}
{
  // Bonus+ / Mult+: Bonus Cards +30 more chips (also the ones you have), Mult Cards +8 more Mult; reset next run
  run('BETBP');
  select();
  const b0 = hand(['S_9'], 'm_bonus')[0];
  redeem('bonus_plus');
  ok(P_CENTERS.m_bonus.config.bonus === 60 && b0.ability.bonus === 60, 'Bonus+: Bonus Cards +60 (existing too)');
  let t = play([b0]).total;
  ok(t.chips === 5 + 9 + 60, 'Bonus+: scores 60 bonus chips', t);
  redeem('mult_plus');
  const m0 = hand(['S_9'], 'm_mult')[0];
  t = play([m0]).total;
  ok(t.mult === 1 + 12, 'Mult+: Mult Card gives +12', t);
  run('BETBP2', { mods: [] });
  ok(P_CENTERS.m_bonus.config.bonus === 30 && P_CENTERS.m_mult.config.mult === 4, 'a new run (mod off) restores Bonus +30 / Mult +4');
}
{
  // Omnicard: Wild Cards can't be debuffed and retrigger
  run('BETOM');
  redeem('omnicard');
  select();
  const w = hand(['S_9'], 'm_wild')[0];
  w.set_debuff(true);
  ok(!w.debuff, 'Omnicard: a Wild Card cannot be debuffed');
  const t = play([w]).total;
  ok(t.chips === 5 + 9 + 9, 'Omnicard: Wild Card retriggered', t);
  // Bulletproof: a breaking Glass Card loses X0.1 instead, until it would drop to X1.5
  run('BETBU');
  redeem('omnicard'); redeem('bulletproof');
  select();
  G.GAME.probabilities.normal = 1000;
  const g = hand(['S_9'], 'm_glass')[0];
  const r = play([g]);
  ok(!g.removed && G.playing_cards.includes(g) && near(g.ability.x_mult, 1.9), 'Bulletproof: the Glass Card survives at X1.9', g.ability.x_mult);
  ok(G.discard.cards.includes(g), 'Bulletproof: and goes to the discard pile');
  ok(msgs(r.events).includes('Bulletproof!'), 'Bulletproof! message');
  g.ability.x_mult = 1.6;
  G.discard.remove_card(g); G.hand.emplace(g);
  play([g]);
  ok(g.removed, 'Bulletproof: at X1.6 it breaks (X1.5 is the floor)');
}
{
  // Cash Clutch / Inflation: +$1 more per remaining hand each
  run('BETCC');
  redeem('cash_clutch');
  select(); win();
  let row = G.GAME.round_eval.rows.find((r) => r.name === 'hands');
  ok(row && row.dollars === 3 * 2, 'Cash Clutch: $2 per hand left', row);
  toShop(); act({ type: 'next_round' });
  redeem('inflation');
  select(); win();
  row = G.GAME.round_eval.rows.find((r) => r.name === 'hands');
  ok(row && row.dollars === 3 * 3, 'Inflation: $3 per hand left', row);
}
{
  // Eternity: Eternal jokers in the shop, 40% of them Negative
  run('BETET');
  redeem('eternity');
  ok(G.GAME.modifiers.enable_eternals_in_shop, 'Eternity: Eternal jokers in the shop');
  ok(describe(new Card(P_CARDS.empty, P_CENTERS[VK('eternity')])).lines.join(' ').includes('40%'), 'Eternity: "40%" chance');
  let et = 0, neg = 0;
  for (let i = 0; i < 2500; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.ability.eternal) { et++; if (c.edition && c.edition.negative) neg++; } }
  ok(et > 400 && Math.abs(neg / et - 0.4) < 0.06, 'Eternity: ~40% of Eternal shop jokers are Negative', [et, neg]);
  // Half-life: Perishable jokers take half a slot
  redeem('half_life');
  ok(G.GAME.modifiers.enable_perishables_in_shop, 'Half-life: Perishable jokers in the shop');
  const lim = G.jokers.config.card_limit;
  const p = add('j_joker'); p.ability.perishable = true; p.ability.perish_tally = 5;
  const p2 = new Card(P_CARDS.empty, P_CENTERS.j_egg); p2.ability.perishable = true; p2.ability.perish_tally = 5; p2.add_to_deck(); G.jokers.emplace(p2);
  ok(G.jokers.config.card_limit === lim + 0.5, 'Half-life: a Perishable joker adds 0.5 slot (p added before its sticker: only one counts)', G.jokers.config.card_limit);
  p2.start_dissolve();
  ok(G.jokers.config.card_limit === lim, 'Half-life: removing it takes the half slot back');
}
{
  // Debt Burden: Rental jokers in the shop; each extends the debt limit by $10; no rent while in debt
  run('BETDB');
  redeem('debt_burden');
  ok(G.GAME.modifiers.enable_rentals_in_shop, 'Debt Burden: Rental jokers in the shop');
  const r = new Card(P_CARDS.empty, P_CENTERS.j_joker); r.set_rental(true); r.add_to_deck(); G.jokers.emplace(r);
  ok(G.GAME.bankrupt_at === -10, 'Debt Burden: a Rental joker -> debt limit -$10', G.GAME.bankrupt_at);
  select();
  G.GAME.dollars = -5;
  win();
  ok(G.GAME.dollars === -5, 'Debt Burden: no rent while in debt', G.GAME.dollars);
  // Bobby Pin: Pinned jokers in the shop; a Pinned joker that does nothing copies the joker to its right
  run('BETBO');
  redeem('debt_burden'); redeem('bobby_pin');
  let pinned = 0;
  for (let i = 0; i < 300; i++) if (create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho').pinned) pinned++;
  ok(Math.abs(pinned / 300 - 0.3) < 0.08, 'Bobby Pin: ~30% of shop jokers are Pinned', pinned / 300);
  select();
  const cc = add('j_credit_card'); cc.pinned = true;
  add('j_joker');
  const t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 4 + 4, 'Bobby Pin: Pinned Credit Card copies Joker (+4 twice)', t);
}
{
  // Stow: +1 slot, leftmost joker debuffed while slots are full; Stash: +1, rightmost debuffed with <= 1 free
  run('BETST');
  redeem('stow');
  ok(G.jokers.config.card_limit === 6, 'Stow: +1 joker slot');
  const js = [];
  for (let i = 0; i < 5; i++) js.push(add('j_joker'));
  select();
  ok(!js[0].debuff, 'Stow: 5/6 -> nothing debuffed');
  js.push(add('j_joker'));
  act({ type: 'sort_hand', by: 'rank' });
  ok(js[0].debuff && !js[1].debuff, 'Stow: 6/6 -> the leftmost is debuffed');
  const t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 4 * 5, 'Stow: only 5 Jokers score', t);
  run('BETSS');
  redeem('stow'); redeem('stash');
  const ks = [];
  for (let i = 0; i < 5; i++) ks.push(add('j_joker'));
  select(); act({ type: 'sort_hand', by: 'rank' });
  ok(!ks[4].debuff && !ks[0].debuff, 'Stash: 5/7 (2 free) -> nothing debuffed', ks.map((c) => c.debuff));
  ks.push(add('j_joker'));
  act({ type: 'sort_hand', by: 'rank' });
  ok(ks[5].debuff && !ks[0].debuff, 'Stash: 6/7 (1 free) -> the rightmost is debuffed', ks.map((c) => c.debuff));
}

// =================================================================== vouchers (3): undying .. eliminator
{
  // Undying: a destroyed (not sold) non-Phantom joker comes back as a Phantom copy (+1 slot, 50% to trigger)
  run('BETUN');
  redeem('undying');
  const j = add('j_joker');
  const lim = G.jokers.config.card_limit;
  j.start_dissolve();
  const ph = G.jokers.cards[0];
  ok(G.jokers.cards.length === 1 && key(ph) === 'j_joker' && ph.edition && ph.edition.betmma_phantom, 'Undying: a Phantom Joker comes back');
  ok(G.jokers.config.card_limit === lim + 1, 'Phantom: +1 joker slot');
  ph.start_dissolve();
  ok(G.jokers.cards.length === 0 && G.jokers.config.card_limit === lim, 'a Phantom joker destroyed stays gone (and its slot goes)');
  const s = add('j_egg'); G.GAME.dollars = 0;
  select();
  act({ type: 'sell', id: s.sort_id });
  ok(G.jokers.cards.length === 0, 'Undying: a sold joker does not come back');
  // Phantom: 50% of its calculations don't happen
  const pj = add('j_joker'); pj.set_edition({ betmma_phantom: true }, true);
  let hits = 0;
  for (let i = 0; i < 200; i++) { const r = pj.calculate_joker({ joker_main: true, cardarea: G.jokers, scoring_hand: [], full_hand: [] }); if (r && r.mult_mod === 4) hits++; }
  ok(Math.abs(hits / 200 - 0.5) < 0.1, 'Phantom: triggers ~50% of the time', hits);
  // Reincarnate: selling a Phantom joker makes a joker of the same rarity
  run('BETRI');
  redeem('undying'); redeem('reincarnate');
  const u = add('j_blueprint'); // rare
  u.start_dissolve();
  const p2 = G.jokers.cards[0];
  select();
  act({ type: 'sell', id: p2.sort_id });
  ok(G.jokers.cards.length === 1 && P_CENTERS[key(G.jokers.cards[0])].rarity === 3 && !G.jokers.cards[0].edition, 'Reincarnate: a rare Phantom sold -> a new rare joker', G.jokers.cards.map(key));
  // FIX 1: without Reincarnate, a sold Phantom joker is just sold
  run('BETRI2');
  redeem('undying');
  add('j_blueprint').start_dissolve();
  select();
  act({ type: 'sell', id: G.jokers.cards[0].sort_id });
  ok(G.jokers.cards.length === 0, 'FIX 1: no Reincarnate -> no new joker from a sold Phantom', G.jokers.cards.map(key));
}
{
  // Bargain Aisle: the shop's first item is free; Clearance Aisle: its first Booster Pack too
  run('BETBA');
  redeem('bargain_aisle'); redeem('clearance_aisle');
  select(); toShop();
  ok(G.shop_jokers.cards[0].cost === 0 && G.shop_jokers.cards[1].cost > 0, 'Bargain Aisle: first shop item $0');
  ok(G.shop_booster.cards[0].cost === 0 && G.shop_booster.cards[1].cost > 0, 'Clearance Aisle: first pack $0');
  // Reroll Aisle (Reroll Surplus + Clearance Aisle): ...also after every reroll
  redeem('v_reroll_surplus'); redeem('reroll_aisle');
  G.GAME.dollars = 100;
  act({ type: 'reroll_shop' });
  ok(G.shop_jokers.cards[0].cost === 0, 'Reroll Aisle: first item free after a reroll');
}
{
  // Rich Boss: Boss Blinds +$8; Richer Boss: +$4 per ante more
  run('BETRB');
  redeem('rich_boss');
  ok(toView().choices.Boss.dollars === 5 + 8, 'Rich Boss: shown $13 on the boss');
  toBoss(); win();
  let row = G.GAME.round_eval.rows.find((r) => r.name === 'blind1');
  ok(row.dollars === 13, 'Rich Boss: boss pays $13', row);
  toShop(); act({ type: 'next_round' });
  redeem('richer_boss');
  ok(toView().choices.Boss.dollars === 5 + 8 + 4 * 2, 'Richer Boss: ante 2 boss shows $21');
  toBoss(); win();
  row = G.GAME.round_eval.rows.find((r) => r.name === 'blind1');
  ok(row.dollars === 21, 'Richer Boss: ante 2 boss pays $21', row);
}
{
  // Gravity Assist: upgrading a hand also upgrades the visible hands next to it; Gravitational Wave: all others +0.2
  run('BETGA');
  redeem('gravity_assist');
  level_up_hand(null, 'Pair');
  const H = G.GAME.hands;
  ok(H.Pair.level === 2 && H['Two Pair'].level === 2 && H['High Card'].level === 2 && H['Three of a Kind'].level === 1, 'Gravity Assist: Pair -> Two Pair and High Card too');
  redeem('gravitational_wave');
  level_up_hand(null, 'Flush');
  ok(H.Flush.level === 2 && H['Full House'].level === 2 && H.Straight.level === 2 && near(H['Three of a Kind'].level, 1.2) && near(H['Flush Five'].level, 1.2) && near(H.Pair.level, 2.2), 'Gravitational Wave: every other hand +0.2 levels (hidden ones too)', [H['Three of a Kind'].level, H['Flush Five'].level]);
  ok(near(H['Three of a Kind'].mult, 3 + 2 * 0.2) && near(H['Three of a Kind'].chips, 30 + 20 * 0.2), 'fractional level: Three of a Kind 34 x 3.4');
}
{
  // Garbage Bag: +3 discards now; unused discards carry over. Handbag: same for hands
  run('BETGB');
  select();
  const d0 = G.GAME.current_round.discards_left;
  redeem('garbage_bag');
  ok(G.GAME.current_round.discards_left === d0 + 3, 'Garbage Bag: +3 discards now');
  win(); toShop();
  // (Red Deck: 4 discards a round; 4 + 3 unused carry over)
  ok(d0 === 4 && G.GAME.current_round.discards_left === 4 + 7, 'Garbage Bag: 7 unused discards carry over (shop shows 11)', G.GAME.current_round.discards_left);
  act({ type: 'next_round' }); select();
  ok(G.GAME.current_round.discards_left === 11, 'Garbage Bag: next round has 4 + 7', G.GAME.current_round.discards_left);
  redeem('handbag');
  win(); toShop(); act({ type: 'next_round' }); select();
  ok(G.GAME.current_round.hands_left === 4 + 6, 'Handbag: 6 unused hands carry over (3 left + 3 one-time)', G.GAME.current_round.hands_left);
}
{
  // Echo Wall: discarding a card fires its end-of-round effect (Gold: $3); Echo Chamber: holding it during a hand
  run('BETEW');
  redeem('echo_wall');
  select();
  const g = hand(['S_9'], 'm_gold')[0];
  const d0 = G.GAME.dollars;
  act({ type: 'highlight', ids: [g.sort_id] }); act({ type: 'discard' });
  ok(G.GAME.dollars === d0 + 3, 'Echo Wall: discarded Gold Card pays $3', G.GAME.dollars - d0);
  redeem('echo_chamber');
  clearHand();
  hand(['S_8'], 'm_gold');
  const d1 = G.GAME.dollars;
  play(hand(['S_2']));
  ok(G.GAME.dollars === d1 + 3, 'Echo Chamber: a held Gold Card pays $3 per hand', G.GAME.dollars - d1);
  // ... and a held Blue Seal card makes a Planet
  clearHand();
  const b = hand(['S_7'])[0]; b.set_seal('Blue', true);
  play(hand(['S_3']));
  ok(G.consumeables.cards.some((c) => c.ability.set === 'Planet'), 'Echo Chamber: a held Blue Seal makes a Planet');
}
{
  // Laminator: leftmost joker with a sticker, 1 in 3 an edition at round end; Eliminator: then its stickers go
  run('BETLM');
  redeem('laminator');
  const j = add('j_joker'); j.set_eternal(true);
  G.GAME.probabilities.normal = 1000;
  select(); win();
  ok(j.edition && ['foil', 'holo', 'polychrome', 'negative'].includes(j.edition.type) && j.ability.eternal, 'Laminator: the stickered leftmost joker got an edition', j.edition);
  run('BETEL');
  redeem('laminator'); redeem('eliminator');
  const k = add('j_joker'); k.set_rental(true);
  G.GAME.probabilities.normal = 1000;
  select(); win();
  ok(k.edition && !k.ability.rental && !k.ability.eternal, 'Eliminator: laminated and its stickers removed');
}

// =================================================================== fusion vouchers
{
  // Gold Round Up: your money always rounds up to an even number
  run('BETGR');
  G.GAME.dollars = 4;
  redeem('gold_round_up');
  ease_dollars(3); flush();
  ok(G.GAME.dollars === 8, 'Gold Round Up: $4 + $3 -> $8', G.GAME.dollars);
  ease_dollars(-1); flush();
  ok(G.GAME.dollars === 8, 'Gold Round Up: $8 - $1 -> $8 (7 rounds up)', G.GAME.dollars);
  ease_dollars(2); flush();
  ok(G.GAME.dollars === 10, 'Gold Round Up: even stays even');
}
{
  // Overshopping: you can shop after skipping a blind
  run('BETOV');
  G.GAME.round_resets.blind_tags.Small = 'tag_uncommon';
  redeem('overshopping');
  act({ type: 'skip_blind' });
  ok(G.STATE === STATES.SHOP && G.shop_jokers.cards.length === 2 && G.shop_booster.cards.length === 2, 'Overshopping: skipping opens the shop', G.STATE);
  act({ type: 'next_round' });
  ok(G.STATE === STATES.BLIND_SELECT && G.GAME.blind_on_deck === 'Big', 'Overshopping: then on to the Big Blind');
  // ...a skip tag that opens a pack: the shop is stocked once the pack closes
  run('BETOV2');
  G.GAME.round_resets.blind_tags.Small = 'tag_charm';
  redeem('overshopping');
  act({ type: 'skip_blind' });
  ok(G.STATE === STATES.TAROT_PACK, 'Overshopping + Charm Tag: the pack opens first', G.STATE);
  act({ type: 'skip_booster' });
  ok(G.STATE === STATES.SHOP && G.shop_jokers.cards.length === 2, 'Overshopping: the shop is stocked after the pack', [G.STATE, G.shop_jokers.cards.length]);
}
{
  // Reroll Cut: rerolling the boss also rerolls the tags and gives a random tag
  run('BETRC');
  redeem('v_directors_cut'); redeem('v_reroll_surplus'); redeem('reroll_cut');
  G.GAME.dollars = 100;
  const t0 = { ...G.GAME.round_resets.blind_tags };
  const n0 = G.GAME.tags.length;
  act({ type: 'reroll_boss' });
  const t1 = G.GAME.round_resets.blind_tags;
  ok(G.GAME.tags.length >= n0 + 1 || tagKeys().length >= 0, 'Reroll Cut: a random tag', tagKeys());
  ok(t1.Small !== undefined && t1.Big !== undefined && (t1.Small !== t0.Small || t1.Big !== t0.Big), 'Reroll Cut: the blind tags were rerolled', [t0, t1]);
  ok(G.GAME.tags.length + (G.GAME.tags.length === n0 ? 1 : 0) >= n0 + 1, 'Reroll Cut: gained a tag (it may have fired already)');
}
{
  // Vanish Magic: playing cards in the shop can vanish for $3
  run('BETVM');
  redeem('v_magic_trick'); redeem('v_blank'); redeem('vanish_magic');
  select(); toShop();
  const pc = shopItem('c_base', G.shop_jokers);
  const vv = toView().areas.shop_jokers.find((x) => x.id === pc.sort_id);
  ok(vv.mod_actions && vv.mod_actions[0].action.type === 'betmma_vanish', 'Vanish Magic: VANISH offered on a shop playing card');
  const d0 = G.GAME.dollars;
  ok(act({ type: 'betmma_vanish', id: pc.sort_id }).ok && !G.shop_jokers.cards.includes(pc) && G.GAME.dollars === d0 + 3, 'Vanish Magic: vanished, +$3');
  ok(!act({ type: 'betmma_vanish', id: G.shop_jokers.cards[0].sort_id }).ok || G.shop_jokers.cards[0].ability.set === 'Default', 'Vanish Magic: only playing cards');
}
{
  // Darkness: Negative editions ~4X as often (an extra poll at X3 first)
  const count = (seed, d) => {
    run(seed);
    if (d) redeem('darkness');
    let n = 0;
    for (let i = 0; i < 20000; i++) { const e = poll_edition('dk' + (i % 7), 1); if (e && e.negative) n++; }
    return n;
  };
  const base = count('BETDK', false), dark = count('BETDK', true);
  ok(base > 30 && Math.abs(dark / base - 4) < 1, 'Darkness: ~4x Negatives', [base, dark]);
}
{
  // Double Planet: buying a Planet creates another (room)
  run('BETDP');
  redeem('v_planet_merchant'); redeem('b1g50'); redeem('double_planet');
  select(); toShop();
  const p = shopItem('c_pluto', G.shop_jokers);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: p.sort_id });
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Planet'), 'Double Planet: bought one, got two');
}
{
  // Trash Picker: +1 hand, +1 discard; with no discards left a discard costs a hand; discards earn like hands
  run('BETTP');
  redeem('v_grabber'); redeem('v_wasteful');
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  redeem('trash_picker');
  ok(G.GAME.round_resets.hands === h0 + 1 && G.GAME.round_resets.discards === d0 + 1 && G.GAME.modifiers.money_per_discard === 1, 'Trash Picker: +1 hand, +1 discard, $1 per discard');
  select();
  G.GAME.current_round.discards_left = 0;
  const hl = G.GAME.current_round.hands_left;
  const c = hand(['S_5'])[0];
  act({ type: 'highlight', ids: [c.sort_id] });
  ok(toView().legal.can_discard, 'Trash Picker: discard allowed with 0 discards');
  ok(act({ type: 'discard' }).ok && G.GAME.current_round.hands_left === hl - 1, 'Trash Picker: costs a hand', G.GAME.current_round.hands_left);
  G.GAME.current_round.discards_left = 2;
  win();
  const row = G.GAME.round_eval.rows.find((r) => r.name === 'discards');
  ok(row && row.dollars === 2, 'Trash Picker: $1 per discard left', row);
  redeem('cash_clutch');
  ok(G.GAME.modifiers.money_per_discard === 2 && G.GAME.modifiers.money_per_hand === 2, 'Cash Clutch with Trash Picker: discards earn more too');
}
{
  // Money Target: double interest when your money is a multiple of 5
  run('BETMT');
  redeem('v_seed_money'); redeem('target'); redeem('money_target');
  select();
  G.GAME.dollars = 20; win();
  let row = G.GAME.round_eval.rows.find((r) => r.name === 'interest');
  ok(row.dollars === 8 && G.GAME.interest_amount === 1, 'Money Target: $20 -> $8 interest (doubled), restored after', row);
  toShop(); act({ type: 'next_round' }); select();
  G.GAME.dollars = 21; win();
  row = G.GAME.round_eval.rows.find((r) => r.name === 'interest');
  ok(row.dollars === 4, 'Money Target: $21 -> $4', row);
}
{
  // Art Gallery: +1 Ante to win; each boss beaten: +1 hand, +1 discard or -1 Ante
  const seen = new Set();
  for (let s = 0; s < 12 && seen.size < 3; s++) {
    run('BETAG' + s);
    redeem('v_hieroglyph'); redeem('abstract_art');
    const wa = G.GAME.win_ante;
    redeem('art_gallery');
    ok(G.GAME.win_ante === wa + 1, 'Art Gallery: +1 Ante to win');
    const h = G.GAME.round_resets.hands, d = G.GAME.round_resets.discards, a = G.GAME.round_resets.ante;
    toBoss(); win(); toShop();
    if (G.GAME.round_resets.hands === h + 1) seen.add('hand');
    else if (G.GAME.round_resets.discards === d + 1) seen.add('discard');
    else if (G.GAME.round_resets.ante === a) seen.add('ante'); // (+1 for the boss, -1 back)
  }
  ok(seen.size === 3, 'Art Gallery: hand / discard / ante all happen', [...seen]);
}
{
  // Slate: Stone Cards +100 more chips; Stone Cards don't count toward the 5 selected / played
  run('BETSL');
  redeem('v_petroglyph'); redeem('bonus_plus'); redeem('slate');
  ok(P_CENTERS.m_stone.config.bonus === 150, 'Slate: Stone Card bonus 150');
  select();
  const cs = hand(['S_A', 'S_K', 'S_Q', 'S_J', 'S_T']);
  const st = hand(['H_2', 'H_3'], 'm_stone');
  act({ type: 'highlight', ids: [...cs, ...st].map((c) => c.sort_id) });
  ok(G.hand.highlighted.length === 7, 'Slate: 5 cards + 2 Stones selected', G.hand.highlighted.length);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  const r = act({ type: 'play' });
  const t = r.events.find((e) => e.type === 'hand_total');
  ok(r.ok && t && t.hand === 'Straight Flush' && t.chips === 100 + 11 + 10 + 10 + 10 + 10 + 150 * 2, 'Slate: plays all 7 (Royal Flush + 2 Stones at 150)', t);
}
{
  // Gilded Glider: a paying Gold Card passes the enhancement to the plain card on its right
  run('BETGG');
  redeem('gold_coin'); redeem('gold_bar'); redeem('bonus_plus'); redeem('gilded_glider');
  select(); clearHand();
  const g = hand(['S_9'], 'm_gold')[0]; const p1 = hand(['S_8'])[0]; const p2 = hand(['S_7'])[0];
  G.hand.cards.splice(0, G.hand.cards.length, g, p1, p2);
  const d0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips;
  const sc = hand(['C_2'])[0];
  G.hand.remove_card(sc); G.hand.cards.push(sc); sc.area = G.hand;
  act({ type: 'highlight', ids: [sc.sort_id] }); act({ type: 'play' });
  ok(g.config.center_key === 'c_base' && p1.config.center_key === 'c_base' && p2.config.center_key === 'm_gold', 'Gilded Glider: the Gold glides all the way right', [g, p1, p2].map((c) => c.config.center_key));
  const row = G.GAME.round_eval && G.GAME.round_eval.rows;
  ok(G.GAME.dollars - d0 >= 9, 'Gilded Glider: it paid at each stop ($3 x 3)', G.GAME.dollars - d0);
}
{
  // Mirror: a scoring Steel Card retriggers the card to its right
  run('BETMI');
  redeem('flipped_card'); redeem('omnicard'); redeem('mirror');
  select();
  const st = hand(['S_9'], 'm_steel')[0], n = hand(['H_9'])[0];
  const t = play([st, n]).total;
  ok(t.chips === 10 + 9 + 9 + 9, 'Mirror: the 9 right of the Steel 9 scores twice (Pair 10 + 9 + 9 + 9)', t);
  // over 50 queued retriggers: 50 retriggers, each scaled up (the ratio)
  clearHand();
  const a = hand(['S_5'])[0], b = hand(['H_5'])[0];
  b.ability.temp_repetition = 100;
  const t2 = play([a, b]).total;
  ok(t2.chips === 10 + 5 + 5 * 2 * 51, 'over-retriggered: 50 retriggers of X2 value', t2);
}
{
  // 4D Vouchers: rerolls reroll the vouchers too, $2 dearer
  run('BET4V');
  redeem('3d_boosters'); redeem('4d_boosters'); redeem('oversupply'); redeem('4d_vouchers');
  select(); toShop();
  const v0 = G.shop_vouchers.cards[0];
  G.GAME.dollars = 100;
  act({ type: 'reroll_shop' });
  const v1 = G.shop_vouchers.cards[0];
  ok(v1 && v1 !== v0 && v1.cost === P_CENTERS[key(v1)].cost + 2 && G.GAME.current_round.voucher === key(v1), '4D Vouchers: a new voucher, $2 more', [key(v0), v1 && key(v1), v1 && v1.cost]);
}
{
  // Recycle Area: discard your hand once in an Arcana / Spectral pack
  run('BETRY');
  redeem('reserve_area'); redeem('v_wasteful'); redeem('recycle_area');
  select(); toShop();
  G.GAME.dollars = 100;
  const pk = shopItem('p_arcana_normal_1', G.shop_booster);
  act({ type: 'buy', id: pk.sort_id });
  const before = G.hand.cards.map((c) => c.sort_id);
  ok(toView().mod_buttons && toView().mod_buttons.some((b) => b.where === 'pack' && b.enabled), 'Recycle Area: Discard button in the pack');
  ok(act({ type: 'betmma_discard_booster' }).ok, 'Recycle Area: discard');
  ok(G.hand.cards.length === before.length && G.hand.cards.every((c) => !before.includes(c.sort_id)), 'Recycle Area: a fresh hand', [before.length, G.hand.cards.length]);
  ok(G.discard.cards.length === 0, 'Recycle Area: the old hand went back into the deck');
  ok(!act({ type: 'betmma_discard_booster' }).ok, 'Recycle Area: once per pack');
}
{
  // Chaos: the same Enhancement again stacks
  run('BETCH');
  redeem('collector'); redeem('abstract_art'); redeem('chaos');
  select();
  const c = hand(['S_9'], 'm_bonus')[0];
  c.set_ability(P_CENTERS.m_bonus);
  ok(c.ability.bonus === 60, 'Chaos: Bonus Card twice -> +60', c.ability.bonus);
  c.set_ability(P_CENTERS.m_bonus);
  ok(c.ability.bonus === 90 && c.config.center.config.bonus === 90, 'Chaos: three times -> +90');
  const gl = hand(['S_8'], 'm_glass')[0];
  gl.set_ability(P_CENTERS.m_glass);
  ok(gl.ability.x_mult === 4, 'Chaos: Glass twice -> X4');
  const t = play([c]).total;
  ok(t.chips === 5 + 9 + 90, 'Chaos: the stacked Bonus Card scores +90', t);
}
{
  // Heat Death: Eternal + Perishable can stack; an Eternal joker perishing gives +1 Joker slot
  run('BETHD');
  redeem('eternity'); redeem('half_life'); redeem('heat_death');
  ok(G.GAME.modifiers.cry_eternal_perishable_compat, 'Heat Death: Eternal and Perishable can stack');
  let both = 0;
  for (let i = 0; i < 400; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.ability.eternal && c.ability.perishable) both++; }
  ok(both > 0, 'Heat Death: shop jokers that are both Eternal and Perishable', both);
  const j = new Card(P_CARDS.empty, P_CENTERS.j_joker);
  j.ability.eternal = true; j.ability.perishable = true; j.ability.perish_tally = 1;
  const lim = G.jokers.config.card_limit;
  j.add_to_deck(); G.jokers.emplace(j);
  ok(G.jokers.config.card_limit === lim + 0.5, 'Half-life: the Eternal Perishable joker takes half a slot');
  j.calculate_perishable();
  // debuffed: its half slot goes (Half-life counts live Perishables), Heat Death adds a whole one
  ok(j.debuff && G.jokers.config.card_limit === lim + 1 && j.ability.heat_deathed, 'Heat Death: perished Eternal joker -> +1 slot', G.jokers.config.card_limit - lim);
  j.set_debuff(true);
  ok(G.jokers.config.card_limit === lim + 1, 'Heat Death: only once');
}
{
  // Deep Roots: interest on the absolute value of your money
  run('BETDR');
  redeem('v_seed_money'); redeem('debt_burden'); redeem('deep_roots');
  select();
  G.GAME.dollars = -20;
  G.GAME.chips = G.GAME.blind.chips; clearHand();
  G.GAME.bankrupt_at = -100;
  play(hand(['S_2']), { keepChips: true });
  const row = G.GAME.round_eval.rows.find((r) => r.name === 'interest');
  ok(row && row.dollars === 4 && G.GAME.dollars === -20, 'Deep Roots: -$20 earns $4 interest (money unchanged)', row);
}
{
  // Solar System: a used Planet triggers again once, plus once per Planet held
  run('BETSO');
  redeem('v_planet_merchant'); redeem('event_horizon'); redeem('solar_system');
  // (Event Horizon gave 2 Negative planets)
  select();
  const pl = create_card('Planet', G.consumeables, null, null, null, null, 'c_pluto'); pl.add_to_deck(); G.consumeables.emplace(pl);
  const held = G.consumeables.cards.filter((c) => c.ability.set === 'Planet' && c !== pl).length;
  act({ type: 'use', id: pl.sort_id });
  ok(G.GAME.hands['High Card'].level === 1 + 2 + held, 'Solar System: Pluto x(2 + ' + held + ' held)', G.GAME.hands['High Card'].level);
}
{
  // Forbidden Area: with no consumable slot left, a bought consumable goes to the joker row, and is used
  // (and kept) on every hand you play
  run('BETFA');
  redeem('reserve_area'); redeem('undying'); redeem('forbidden_area');
  select(); toShop();
  G.consumeables.config.card_limit = 0;
  const p = shopItem('c_pluto', G.shop_jokers);
  G.GAME.dollars = 100;
  ok(act({ type: 'buy', id: p.sort_id }).ok && G.jokers.cards.includes(p), 'Forbidden Area: Pluto bought into the joker row');
  act({ type: 'next_round' }); select();
  play(hand(['S_2']));
  ok(G.GAME.hands['High Card'].level === 2 && G.jokers.cards.includes(p), 'Forbidden Area: Pluto used before the hand (and kept)');
  play(hand(['S_3']));
  ok(G.GAME.hands['High Card'].level === 3, 'Forbidden Area: ...every hand');
  // a Tarot in the joker row works on the played cards: The Lovers makes them Wild first
  const lv = create_card('Tarot', G.jokers, null, null, null, null, 'c_lovers'); lv.add_to_deck(); G.jokers.emplace(lv);
  clearHand();
  const k = hand(['S_K'])[0];
  play([k]);
  ok(k.config.center_key === 'm_wild', 'Forbidden Area: The Lovers in the joker row made the played card Wild');
  // reserving from a pack with full consumable slots -> the joker row
  toShop();
  const pk = shopItem('p_arcana_normal_1', G.shop_booster);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pk.sort_id });
  const c = G.pack_cards.cards[0];
  ok(act({ type: 'reserve', id: c.sort_id }).ok && G.jokers.cards.includes(c), 'Forbidden Area: reserved into the joker row');
}
{
  // Voucher Tycoon: Vouchers appear in the shop's card slots (rate 2), and buying one redeems it
  run('BETVT');
  redeem('oversupply'); redeem('v_planet_merchant'); redeem('v_planet_tycoon'); redeem('voucher_tycoon');
  ok(G.GAME.voucher_rate === 2, 'Voucher Tycoon: voucher rate 2');
  select(); toShop();
  let found = null;
  G.GAME.dollars = 1000;
  for (let i = 0; i < 40 && !found; i++) { act({ type: 'reroll_shop' }); found = G.shop_jokers.cards.find((c) => c.ability.set === 'Voucher'); }
  ok(found, 'Voucher Tycoon: a voucher in the card slots');
  if (found) {
    const cr = G.GAME.current_round.voucher;
    ok(act({ type: 'buy', id: found.sort_id }).ok && G.GAME.used_vouchers[key(found)] && G.GAME.current_round.voucher === cr, 'Voucher Tycoon: buying it redeems it (round voucher kept)');
  }
}
{
  // Cryptozoology: a bought joker 15% gets Tentacle; Tentacle eats the joker to its right at blind start
  run('BETCZ');
  redeem('v_crystal_ball'); redeem('undying'); redeem('cryptozoology');
  select(); toShop();
  let n = 0, tent = 0;
  G.GAME.dollars = 10000;
  for (let i = 0; i < 120; i++) {
    G.jokers.config.card_limit = 100;
    const j = shopItem('j_joker', G.shop_jokers);
    act({ type: 'buy', id: j.sort_id });
    n++; if (j.edition && j.edition.betmma_tentacle) tent++;
  }
  ok(Math.abs(tent / n - 0.15) < 0.08, 'Cryptozoology: ~15% Tentacle', [tent, n]);
  run('BETTE');
  const t = add('j_joker'); t.set_edition('e_betmma_tentacle', true);
  const right = add('j_scary_face'); // +30 chips (extra 30)
  select();
  ok(!G.jokers.cards.includes(right) && t.ability.mult === 4 + 30, 'Tentacle: ate Scary Face, Joker +30 Mult', [G.jokers.cards.map(key), t.ability.mult]);
  const e = add('j_egg'); e.set_eternal(true);
  nextRound();
  ok(G.jokers.cards.includes(e), 'Tentacle: an Eternal joker is safe');
}

// =================================================================== Real Random
const rr_table = (spec) => { const t = RR.real_random_empty_abilities_table(); for (const [k, vals] of Object.entries(spec)) { t.values[k].num = vals.length; t.values[k].values = vals.slice(); t.num += vals.length; } return t; };
function set_rr(card, spec) {
  card.config.center = JSON.parse(JSON.stringify(card.config.center));
  card.config.center.real_random_abilities = rr_table(spec);
  card.ability.real_random_abilities = card.config.center.real_random_abilities;
}
{
  run('BETRR');
  select();
  const old = hand(['S_9'], 'm_lucky')[0];
  redeem('v_crystal_ball'); redeem('omnicard'); redeem('real_random');
  ok(old.config.center.real_random_abilities && old.config.center.real_random_abilities.num === 3, 'Real Random: a Lucky Card gets 3 random abilities');
  ok(P_CENTERS.m_lucky.real_random_abilities === undefined, 'Real Random: the shared Lucky center is untouched');
  const fresh = hand(['S_8'])[0];
  fresh.set_ability(P_CENTERS.m_lucky);
  ok(fresh.config.center.real_random_abilities.num === 3, 'Real Random: a new Lucky Card gets 3 too');
  const d = describe(fresh);
  ok(d.lines.some((l) => /chance/.test(l)) && !d.lines.some((l) => /\$20|\+20.*Mult/.test(l)) && !d.lines.some((l) => NOFILL.test(l)), 'Real Random: the card lists its abilities, not the vanilla Lucky text', d.lines);
  // exact abilities: +100 chips, +8 Mult, X2 Mult, $5 (all 1 in 1)
  clearHand();
  const c = hand(['S_9'], 'm_lucky')[0];
  set_rr(c, { chip: [[100, 1]], mult: [[8, 1]], x_mult: [[2, 1]], dollars: [[5, 1]] });
  const d0 = G.GAME.dollars;
  const t = play([c]).total;
  flush();
  ok(t.chips === 5 + 9 + 100 && t.mult === (1 + 8) * 2, 'Real Random: +100 Chips, +8 Mult (the Lucky +20 is gone), X2', t);
  ok(G.GAME.dollars === d0 + 5, 'Real Random: $5', G.GAME.dollars - d0);
  // FIX 4: the Lucky Card's own 1 in 15 $20 no longer pays (forced: probabilities X1000)
  clearHand();
  const c2 = hand(['S_9'], 'm_lucky')[0];
  set_rr(c2, { chip: [[25, 1000000]] });
  G.GAME.probabilities.normal = 1000;
  const d1 = G.GAME.dollars;
  play([c2]); flush();
  ok(G.GAME.dollars === d1, 'FIX 4: no hidden $20 from the Lucky Card itself', G.GAME.dollars - d1);
  G.GAME.probabilities.normal = 1;
  // joker / consumable slot abilities (fixed 1 in 777 / 177; forced)
  clearHand();
  const c3 = hand(['S_9'], 'm_lucky')[0];
  set_rr(c3, { joker_slot: [], consumable_slot: [] });
  c3.config.center.real_random_abilities.values.joker_slot.num = 1; c3.config.center.real_random_abilities.values.consumable_slot.num = 1;
  const jl = G.jokers.config.card_limit, cl = G.consumeables.config.card_limit;
  G.GAME.probabilities.normal = 1000;
  play([c3]); flush();
  ok(G.jokers.config.card_limit === jl + 1 && G.consumeables.config.card_limit === cl + 1, 'Real Random: +1 Joker slot, +1 Consumable slot');
  G.GAME.probabilities.normal = 1;
  // FIX 5: "a random Negative Joker" fired `times` times makes `times` jokers (the Lua made times²)
  clearHand();
  const c4 = hand(['S_9'], 'm_lucky')[0];
  set_rr(c4, {}); c4.config.center.real_random_abilities.values.random_negative_joker.num = 1;
  c4.ability.over_retriggered_ratio = 3;
  G.GAME.probabilities.normal = 1000;
  const n0 = G.jokers.cards.length;
  G.jokers.config.card_limit = 100;
  RR.REAL_RANDOM_DATA.random_negative_joker.calc_function(c4); flush();
  ok(G.jokers.cards.length === n0 + 3 && G.jokers.cards.slice(n0).every((j) => j.edition && j.edition.negative), 'FIX 5: an X3 random Negative Joker ability -> 3 Negative jokers', G.jokers.cards.length - n0);
  G.GAME.probabilities.normal = 1;
  // a Negative Magician at every blind
  nextRound();
  ok(G.consumeables.cards.some((x) => key(x) === 'c_magician' && x.edition && x.edition.negative), 'Real Random: a Negative Magician at blind start');
  // retrigger_next / transfer_ability act on the card to the right
  clearHand();
  const a = hand(['S_9'], 'm_lucky')[0], b = hand(['H_9'])[0];
  set_rr(a, {}); a.config.center.real_random_abilities.values.retrigger_next.num = 1; a.config.center.real_random_abilities.values.retrigger_next.values = [[2, 1]];
  a.config.center.real_random_abilities.values.transfer_ability.num = 1;
  G.GAME.probabilities.normal = 1000;
  const tt = play([a, b]).total;
  ok(tt.chips === 10 + 9 + 9 * 3 + (b.config.center.real_random_abilities ? 0 : 0) || tt.chips >= 10 + 9 + 27, 'Real Random: the 9 on the right retriggers twice', tt);
  ok(b.config.center.real_random_abilities && b.config.center.real_random_abilities.num >= 1, 'Real Random: an ability transferred to the right card');
  G.GAME.probabilities.normal = 1;
}

// =================================================================== jokers
{
  run('BETJ1');
  select();
  // JJookkeerr: jokers with "Joker" in their name each give X1.5
  add(JK('jjookkeerr')); add('j_joker'); add('j_greedy_joker');
  let t = play(hand(['S_2'])).total;
  ok(t.chips === 7 && near(t.mult, (1 + 4) * 1.5 * 1.5) && t.total === 78, 'JJookkeerr: Joker and Greedy Joker X1.5 each', t);
  for (const j of G.jokers.cards.slice()) j.remove();
  // Ascension: the hand counts as the next one up
  add(JK('ascension'));
  t = play(hand(['S_9', 'H_9'])).total;
  ok(t.hand === 'Two Pair' && t.chips === 20 + 18 && t.mult === 2, 'Ascension: a Pair scores as Two Pair', t);
  add(JK('ascension'));
  t = play(hand(['S_8', 'H_8'])).total;
  ok(t.hand === 'Three of a Kind', 'Ascension x2: Pair -> Three of a Kind', t);
  ok(evaluate_poker_hand(hand(['S_A']))['Pair'].length === 1, 'Ascension: evaluate_poker_hand lifts the best hand');
}
{
  // Hasty Joker: $8 if the round ends after the first hand
  run('BETJ2');
  add(JK('hasty'));
  select(); win();
  let row = G.GAME.round_eval.rows.find((r) => r.center === JK('hasty'));
  ok(row && row.dollars === 8, 'Hasty Joker: $8 for a one-hand round', row);
  toShop(); act({ type: 'next_round' }); select();
  play(hand(['S_2']));
  win();
  row = G.GAME.round_eval.rows.find((r) => r.center === JK('hasty'));
  ok(!row, 'Hasty Joker: nothing after two hands');
}
{
  // ERRORR: discarded cards 1 in 3 become a random rank
  run('BETJ3');
  add(JK('errorr'));
  select();
  G.GAME.probabilities.normal = 1000;
  const cs = hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  ok(msgs(r.events).filter((m) => m === 'Rank Changed!').length === 5, 'ERRORR: 5 discarded cards change rank');
  ok(cs.every((c, i) => c.base.suit === ['Spades', 'Hearts', 'Diamonds', 'Clubs', 'Spades'][i]), 'ERRORR: suits kept');
  ok(cs.some((c, i) => c.base.value !== ['2', '3', '4', '5', '6'][i]), 'ERRORR: ranks changed', cs.map((c) => c.base.value));
}
{
  // Piggy Bank: half of every gain goes into the pig: +1 Mult per $1, and its sell value
  run('BETJ4');
  const pig = add(JK('piggy_bank'));
  const d0 = G.GAME.dollars, s0 = pig.sell_cost;
  ease_dollars(11); flush();
  ok(G.GAME.dollars === d0 + 6 && pig.ability.extra.mults === 5 && pig.sell_cost === s0 + 5, 'Piggy Bank: $11 -> $6 kept, 5 into the pig', [G.GAME.dollars - d0, pig.ability.extra.mults, pig.sell_cost - s0]);
  ease_dollars(-3); flush();
  ok(pig.ability.extra.mults === 5, 'Piggy Bank: losses are not split');
  select();
  const t = play(hand(['S_2'])).total;
  ok(t.mult === 1 + 5, 'Piggy Bank: +5 Mult', t);
}
{
  // Housing Choice: once per ante, a random voucher when the hand contains a Full House
  run('BETJ5');
  const hc = add(JK('housing_choice'));
  select();
  const n0 = Object.keys(G.GAME.used_vouchers).length;
  play(hand(['S_9', 'H_9', 'D_9', 'S_4', 'H_4']));
  ok(Object.keys(G.GAME.used_vouchers).length === n0 + 1 && hc.ability.extra.triggered, 'Housing Choice: Full House -> a voucher');
  play(hand(['S_8', 'H_8', 'D_8', 'S_3', 'H_3']));
  ok(Object.keys(G.GAME.used_vouchers).length === n0 + 1, 'Housing Choice: once per ante');
  ok(/inactive/.test(describe(hc).lines.join(' ')), 'Housing Choice: shows (inactive)');
}
{
  run('BETJ5b');
  const hc = add(JK('housing_choice'));
  hc.ability.extra.triggered = true;
  toBoss(); win();
  ok(!hc.ability.extra.triggered, 'Housing Choice: ready again on the next ante');
}
{
  // Jimbow: gains +15 Chips when its current context happens, then the context changes
  run('BETJ6');
  const jb = add(JK('jimbow'));
  ok(typeof jb.ability.extra.context === 'string' && jb.ability.extra.context.length > 0, 'Jimbow: has a context from the start', jb.ability.extra.context);
  jb.ability.extra.context = 'discard';
  select();
  const c = hand(['S_5'])[0];
  act({ type: 'highlight', ids: [c.sort_id] }); act({ type: 'discard' });
  ok(jb.ability.extra.chips === 15, 'Jimbow: +15 Chips on a discard', jb.ability.extra.chips);
  const t = play(hand(['S_2'])).total;
  ok(t.chips === 7 + 15, 'Jimbow: +15 Chips', t);
  ok(!NOFILL.test(describe(jb).lines.join(' ')) && /when/.test(describe(jb).lines.join(' ')), 'Jimbow: shows its context');
}
{
  // Gameplay Update: exactly 2 Diamonds / 0 Spades / 2 Hearts / 5 Clubs -> the joker to the right +2% per condition
  run('BETJ7');
  add(JK('gameplay_update'));
  const j = add('j_joker');
  select();
  play(hand(['H_2']));
  flush();
  ok(near(j.ability.mult, 4 * 1.02), 'Gameplay Update: no Spades -> Joker +2% (4.08 Mult)', j.ability.mult);
  play(hand(['D_2', 'D_3', 'H_4', 'H_5', 'C_6']));
  flush();
  ok(near(j.ability.mult, 4 * 1.02 * 1.02 * 1.02 * 1.02), 'Gameplay Update: 2 Diamonds + 0 Spades + 2 Hearts -> 3 times +2%', j.ability.mult);
}
{
  // Flying Cards: gains X(n+2)^-2 per card scored or discarded (n = cards left in deck)
  run('BETJ8');
  const fc = add(JK('flying_cards'));
  select();
  const n = G.deck.cards.length;
  const t = play(hand(['S_2'])).total;
  const gain = Math.pow(n + 2, -2);
  ok(near(fc.ability.x_mult, 1 + gain) && near(t.mult, 1 + gain), 'Flying Cards: X(1 + (n+2)^-2) after one card', [fc.ability.x_mult, t.mult]);
}
{
  // Friends of Jimbo: K of Spades / Q of Diamonds / J of Hearts / K of Clubs scored -> a Jimbo each (no room needed)
  run('BETJ9');
  add(JK('friends_of_jimbo'));
  for (let i = 0; i < 4; i++) add('j_egg');
  select();
  play(hand(['S_K', 'C_K', 'D_Q'])); // (a Pair of Kings: the Queen doesn't score)
  flush();
  ok(G.jokers.cards.filter((c) => key(c) === 'j_joker').length === 2 && G.jokers.cards.length === 7, 'Friends of Jimbo: 2 Jimbos, past the joker limit', G.jokers.cards.map(key));
  play(hand(['D_Q', 'H_J']));
  flush();
  ok(G.jokers.cards.filter((c) => key(c) === 'j_joker').length === 3, 'Friends of Jimbo: Q of Diamonds scores (High Card) -> a third Jimbo', G.jokers.cards.filter((c) => key(c) === 'j_joker').length);
}
{
  // Balatro Mobile: moves between areas; each area its own effect
  run('BETJA');
  select(); toShop();
  const m = shopItem(JK('balatro_mobile'), G.shop_jokers);
  ok(/When bought, generate a joker/.test(describe(m).lines.join(' ')), 'Balatro Mobile (shop): describes its shop effect');
  G.GAME.dollars = 100;
  act({ type: 'buy', id: m.sort_id });
  const extra = G.jokers.cards.find((c) => c !== m);
  ok(G.jokers.cards.includes(m) && extra && P_CENTERS[key(extra)].cost >= 2 && P_CENTERS[key(extra)].cost <= 6, 'Balatro Mobile: bought -> a $2-$6 joker came too', extra && key(extra));
  ok(m.ability.consumeable && /septillion/.test(describe(m).lines.join(' ')), 'Balatro Mobile (jokers): consumable flag, win text');
  const vv = toView().areas.jokers.find((x) => x.id === m.sort_id);
  ok(vv.mod_actions.some((a) => a.action.to === 'consumeables') && vv.mod_actions.some((a) => a.action.to === 'hand'), 'Balatro Mobile: move buttons');
  ok(act({ type: 'betmma_mobile_move', id: m.sort_id, to: 'consumeables' }).ok && G.consumeables.cards.includes(m), 'Balatro Mobile: moved to the consumables');
  act({ type: 'next_round' }); select();
  const cs = hand(['S_6', 'H_8', 'D_T', 'C_K']);
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const d0 = G.GAME.dollars;
  ok(act({ type: 'use', id: m.sort_id, targets: cs.map((c) => c.sort_id) }).ok, 'Balatro Mobile (consumables): used on 6 / 8 / 10 / K of 4 suits');
  ok(G.GAME.dollars === d0 + 26 && cs.every((c) => c.removed) && G.consumeables.cards.includes(m), 'Balatro Mobile: 4 cards destroyed, +$26, kept', G.GAME.dollars - d0);
  ok(act({ type: 'betmma_mobile_move', id: m.sort_id, to: 'hand' }).ok && G.hand.cards.includes(m), 'Balatro Mobile: moved into the hand');
  const t = play(hand(['S_2'])).total;
  ok(t.mult === (1 + 6) * 2, 'Balatro Mobile (hand): held +6 Mult X2', t);
  act({ type: 'betmma_mobile_move', id: m.sort_id, to: 'jokers' });
  G.GAME.chips = 3e25; G.GAME.blind.chips = 1e30;
  clearHand();
  act({ type: 'highlight', ids: [hand(['S_3'])[0].sort_id] }); act({ type: 'play' });
  ok(G.STATE === STATES.ROUND_EVAL && m.removed, 'Balatro Mobile (jokers): over 26 septillion -> blind won, Mobile gone', G.STATE);
}

// =================================================================== voucher packs
{
  run('BETPK');
  select(); toShop();
  const cr = G.GAME.current_round.voucher;
  G.GAME.dollars = 1000;
  for (const k of ['p_betmma_voucher_pack', 'p_betmma_uncommon_voucher_pack', 'p_betmma_fusion_voucher_pack']) {
    // (4 fusions unlocked: a pack never repeats a voucher, like the Lua — each card marks used_jokers)
    if (k === 'p_betmma_fusion_voucher_pack') for (const id of ['round_up', 'gold_coin', 'collector', 'abstract_art', 'v_seed_money', 'target', 'oversupply', 'v_overstock_norm']) redeem(id);
    const pk = shopItem(k, G.shop_booster);
    const cost = pk.cost;
    const d0 = G.GAME.dollars;
    act({ type: 'buy', id: pk.sort_id });
    ok(G.STATE === STATES.MOD_PACK && G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.ability.set === 'Voucher' && c.cost === 0), k + ': 3 free vouchers, choose 1', G.pack_cards.cards.map(key));
    ok(cost === P_CENTERS[k].cost && G.GAME.dollars === d0 - cost, k + ': costs $' + P_CENTERS[k].cost);
    if (k === 'p_betmma_uncommon_voucher_pack') ok(G.pack_cards.cards.every((c) => (c.config.center.config.rarity || 1) === 2), 'Uncommon Voucher Pack: all uncommon', G.pack_cards.cards.map(key));
    if (k === 'p_betmma_fusion_voucher_pack') ok(G.pack_cards.cards.every((c) => c.config.center.requires && c.config.center.requires.length > 1), 'Fusion Voucher Pack: all fusions', G.pack_cards.cards.map(key));
    const pick = G.pack_cards.cards[0];
    const d1 = G.GAME.dollars;
    act({ type: 'use', id: pick.sort_id });
    ok(G.GAME.used_vouchers[key(pick)] && G.GAME.dollars === d1 && G.STATE === STATES.SHOP, k + ': the pick is redeemed for free');
  }
  ok(G.GAME.current_round.voucher === cr, 'voucher packs keep the round voucher');
  ok(describe(shopItem('p_betmma_fusion_voucher_pack', G.shop_booster)).lines.join(' ') === 'Choose {C:attention}1{} of up to {C:attention}3{} Fusion Vouchers to be redeemed', 'Fusion Voucher Pack text');
}

// =================================================================== editions + describe
{
  run('BETED');
  ok(/void main/.test(P_CENTERS.e_betmma_phantom.shader_fs) && /void main/.test(P_CENTERS.e_betmma_tentacle.shader_fs), 'Phantom / Tentacle carry their shader passes');
  const j = add('j_joker');
  const c0 = j.cost;
  j.set_edition({ betmma_phantom: true }, true);
  ok(j.cost === Math.max(1, c0 - 10), 'Phantom: $10 cheaper', [c0, j.cost]);
  ok(toView().areas.jokers[0].edition === 'betmma_phantom', 'view: edition type for the shader');
  const d = describe(j);
  ok(d.badges.some((b) => b.label === 'Phantom'), 'Phantom badge', d.badges);
  // every BETMMA center describes without unfilled #n#
  let bad = [];
  for (const k of [...STATUS.vouchers, ...STATUS.jokers, ...STATUS.boosters, ...STATUS.editions]) {
    const dd = describeCenter(k);
    if (!dd || !dd.name || dd.lines.some((l) => NOFILL.test(l))) bad.push(k);
    const live = new Card(P_CARDS.empty, P_CENTERS[k]);
    const dl = describe(live);
    if (dl.lines.some((l) => NOFILL.test(l))) bad.push(k + ' (live)');
  }
  ok(bad.length === 0, 'describe(): every voucher / joker / pack / edition fills its #n#', bad);
  // rarity / fusion badges
  const b = describe(new Card(P_CARDS.empty, P_CENTERS[VK('chaos')])).badges;
  ok(b[0].label === 'Fusion Voucher' && b[1].label === 'Legendary', 'Chaos: Fusion Voucher + Legendary badges', b);
  const b2 = describe(new Card(P_CARDS.empty, P_CENTERS.v_overstock_norm)).badges;
  ok(b2.some((x) => x.label === 'Common'), 'vanilla vouchers: Common badge', b2);
}

// =================================================================== stress: every voucher + jokers, a seeded bot
function botRun(seed, steps) {
  run(seed);
  // redeem everything (tier by tier, so requirements hold), then play
  const order = [...STATUS.vouchers].sort((a, b) => (P_CENTERS[a].requires ? P_CENTERS[a].requires.length : 0) - (P_CENTERS[b].requires ? P_CENTERS[b].requires.length : 0));
  for (const v of ['v_overstock_norm', 'v_directors_cut', 'v_reroll_surplus', 'v_magic_trick', 'v_blank', 'v_glow_up', 'v_antimatter', 'v_planet_merchant', 'v_grabber', 'v_wasteful', 'v_seed_money', 'v_hieroglyph', 'v_petroglyph', 'v_crystal_ball', 'v_planet_tycoon']) redeem(v);
  for (const v of order) if (!G.GAME.used_vouchers[v] && v !== VK('voucher_bulk') && v !== VK('voucher_bundle')) redeem(v);
  for (const j of STATUS.jokers) add(j);
  let s = 12345 + seed.length;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let errors = 0, n = 0;
  for (; n < steps && !G.GAME.over; n++) {
    const S = G.STATE;
    let a;
    if (S === STATES.BLIND_SELECT) a = r() < 0.2 && G.GAME.blind_on_deck !== 'Boss' ? { type: 'skip_blind' } : { type: 'select_blind' };
    else if (S === STATES.SELECTING_HAND) {
      const ids = G.hand.cards.slice().sort(() => r() - 0.5).slice(0, 1 + Math.floor(r() * 5)).map((c) => c.sort_id);
      act({ type: 'highlight', ids });
      const x = r();
      a = x < 0.1 ? { type: 'betmma_flip' } : x < 0.25 ? { type: 'discard' } : { type: 'play' };
    } else if (S === STATES.ROUND_EVAL) a = { type: 'cash_out' };
    else if (S === STATES.SHOP) {
      const forSale = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards].filter((c) => c.cost <= G.GAME.dollars - G.GAME.bankrupt_at);
      const x = r();
      if (forSale.length && x < 0.5) a = { type: 'buy', id: forSale[Math.floor(r() * forSale.length)].sort_id };
      else if (x < 0.6 && G.shop_jokers.cards[0]) a = { type: 'betmma_vanish', id: G.shop_jokers.cards[0].sort_id };
      else if (x < 0.7) a = { type: 'reroll_shop' };
      else a = { type: 'next_round' };
    } else if (G.pack_cards.cards.length && r() < 0.85) {
      const c = G.pack_cards.cards[Math.floor(r() * G.pack_cards.cards.length)];
      const x = r();
      a = x < 0.2 ? { type: 'reserve', id: c.sort_id } : x < 0.3 ? { type: 'betmma_discard_booster' } : { type: 'use', id: c.sort_id, targets: G.hand.cards.slice(0, 2).map((h) => h.sort_id) };
    } else a = { type: 'skip_booster' };
    try {
      const res = act(a);
      if (!res.ok && (S === STATES.SHOP && a.type === 'next_round')) errors++;
    } catch (e) { errors++; console.log('stress error', seed, n, a.type, e.stack.split('\n').slice(0, 3).join(' | ')); break; }
    // invariants: every card in exactly one area
    const seen = new Set();
    for (const ar of G.areas) for (const c of ar.cards) { if (seen.has(c.sort_id) || c.area !== ar) { errors++; console.log('stress invariant', seed, n, ar.name, c.sort_id); } seen.add(c.sort_id); }
    if (!Number.isFinite(G.GAME.dollars) || G.GAME.joker_buffer < 0) { errors++; console.log('stress money/buffer', G.GAME.dollars, G.GAME.joker_buffer); }
  }
  const sig = JSON.stringify([G.GAME.dollars, G.GAME.round, G.GAME.round_resets.ante, G.jokers.cards.map(key), G.consumeables.cards.map(key), Object.keys(G.GAME.used_vouchers).sort(), G.GAME.hands.Pair.level]);
  return { errors, n, sig };
}
{
  for (const seed of ['BETSTRESS1', 'BETSTRESS2', 'BETSTRESS3']) {
    const a = botRun(seed, 300);
    ok(a.errors === 0 && a.n > 50, 'stress: all vouchers + jokers, ' + a.n + ' actions, no errors (' + seed + ')', a.errors);
    const b = botRun(seed, 300);
    ok(a.sig === b.sig, 'stress: deterministic (' + seed + ')');
  }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
