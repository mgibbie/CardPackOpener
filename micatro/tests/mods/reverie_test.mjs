// Reverie (micatro/mods/reverie): mod off = none of its content; every Cine's special shop, every
// Exchange Coupon progressing into its Cine, tags bought / packed as cards, every pack, the joker, both
// decks, both tags, both vouchers and the Reverie spectral — through real act() plays with exact values;
// the 4 intended-design fixes; describe() text has no unfilled #n#.
//   node micatro/tests/mods/reverie_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import {
  G, P_CENTERS, P_CARDS, P_TAGS, P_CENTER_POOLS, Card, add_joker, create_playing_card, create_card, get_current_pool,
} from '../../js/engine/core.js';
import { newRun, act, STATES, change_voucher_limit } from '../../js/engine/run.js';
import { ACTIVE } from '../../js/mods/registry.js';
import { describe, describeCenter, describeBack, describeTag } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import '../../mods/morefluff/index.js';
import { STATUS, create_tag_as_card } from '../../mods/reverie/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const NOFILL = /#\d+#/;
const MODS = ['reverie'];

function run(seed, { back = 'b_red', mods = MODS } = {}) {
  newRun({ seed, back, mods });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
}
function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
const add = (k, ed) => { const c = add_joker(k, ed); flush(); return c; };
function play(cards, { keepChips } = {}) {
  if (!keepChips) { G.GAME.chips = 0; if (G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; }
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { res, total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}
/** Win the current blind with `chips` scored (default: exactly the requirement). */
function win(chips) {
  if (G.STATE === STATES.BLIND_SELECT) act({ type: 'select_blind' });
  clearHand();
  const c = hand(['S_2']);
  G.GAME.chips = chips !== undefined ? chips : G.GAME.blind.chips;
  return play(c, { keepChips: true });
}
function toShop(chips) { win(chips); act({ type: 'cash_out' }); ok(G.STATE === STATES.SHOP, 'in the shop'); }
/** A Cine / coupon card in the Cine slots (as a pack pick would leave it). */
function giveCine(k) { const c = new Card(P_CARDS.empty, P_CENTERS[k]); c.add_to_deck(); G.cine_quests.emplace(c); return c; }
const use = (c, targets) => act({ type: 'use', id: c.sort_id, targets: targets || [] });
const shopKeys = (area) => (area || G.shop_jokers).cards.map(key);
const ownedNames = () => G.jokers.cards.map((c) => c.ability.name);

// =================================================================== off
{
  run('RVOFF', { mods: [] });
  ok(ACTIVE.length === 0 && !G.cine_quests, 'off: no mods, no Cine area');
  ok(!P_CENTER_POOLS.Cine && !P_CENTER_POOLS.Cine_Quest, 'off: no Cine pools');
  ok(!P_CENTER_POOLS.Booster.some((c) => c.mod === 'reverie') && !P_CENTER_POOLS.Tag.some((t) => t.mod === 'reverie'), 'off: no packs / tags');
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod) && !P_CENTER_POOLS.Voucher.some((c) => c.mod) && !P_CENTER_POOLS.Spectral.some((c) => c.mod), 'off: no joker / voucher / spectral');
  ok(!P_CENTER_POOLS.Consumeables.some((c) => c.mod), 'off: no consumables');
  toShop();
  ok(G.GAME.current_round.reroll_cost === 5, 'off: vanilla reroll cost');
  const v = toView();
  ok(!v.mod_areas && !v.areas.cine_quests, 'off: no mod area in the view');
}

// =================================================================== on: setup
{
  run('RVON');
  ok(ACTIVE.join() === 'reverie', 'on');
  ok(G.cine_quests && G.cine_quests.config.card_limit === 1 && G.areas.includes(G.cine_quests), 'one Cine slot, in G.areas');
  ok(P_CENTER_POOLS.Cine.length === 10 && P_CENTER_POOLS.Cine_Quest.length === 10, 'Cine pools (Every Hue needs More Fluff)', [P_CENTER_POOLS.Cine.length, P_CENTER_POOLS.Cine_Quest.length]);
  ok(P_CENTER_POOLS.Cine.map((c) => c.key).join() === 'c_rev_gem_heist,c_rev_tag_or_die,c_rev_eerie_inn,c_rev_let_it_moon,c_rev_poker_face,c_rev_crazy_lucky,c_rev_adrifting,c_rev_morsel,c_rev_unseen,c_rev_ive_no_shape', 'Cine pool in the mod order', P_CENTER_POOLS.Cine.map((c) => c.key));
  ok(!P_CENTER_POOLS.Consumeables.some((c) => c.key.includes('every_hue')), 'Every Hue out of the consumable pool');
  for (const k of ['p_rev_tag_normal_1', 'p_rev_tag_normal_2', 'p_rev_tag_jumbo_1', 'p_rev_tag_mega_1', 'p_rev_crazy_lucky_1']) ok(G.GAME.banned_keys[k] === true, 'banned until its Cine: ' + k);
  ok(!G.GAME.banned_keys.p_rev_flim_normal_1, 'Film packs are in the shop pool');
  ok(!get_current_pool('Spectral')[0].includes('c_rev_reverie') && !get_current_pool('Consumeables')[0].includes('c_rev_reverie'), 'Reverie never rolls from a pool');
  ok(get_current_pool('Tag')[0].includes('tag_rev_cine') && !get_current_pool('Tag')[0].includes('tag_rev_mega_tag'), 'Stub Tag in the tag pool, Stamp Tag not');
  run('RVMF', { mods: ['reverie', 'morefluff'] });
  ok(P_CENTER_POOLS.Cine.length === 11 && P_CENTER_POOLS.Cine.some((c) => c.key === 'c_rev_every_hue'), 'with More Fluff: Every Hue');
  run('RVFS', { back: 'b_rev_filmstrip' });
  ok(G.cine_quests.config.card_limit === 2, 'Filmstrip Deck: +1 Cine slot');
}

// =================================================================== the Cine shops
function cineShop(seed, cine, { back, mods, setup } = {}) {
  run(seed, { back, mods });
  if (setup) setup();
  toShop();
  G.GAME.dollars = 100;
  const c = giveCine(cine);
  const before = { vouchers: shopKeys(G.shop_vouchers), boosters: shopKeys(G.shop_booster) };
  const r = use(c);
  ok(r.ok, 'use ' + cine, r.error);
  ok(!c.area && G.cine_quests.cards.length === 0, cine + ': used up');
  return before;
}
// I Sing, I've No Shape: only owned jokers, +$20 reroll
{
  const before = cineShop('RVSING', 'c_rev_ive_no_shape', { setup: () => { add('j_egg'); add('j_scary_face'); } });
  ok(G.GAME.current_round.used_cine.join() === "I Sing, I've No Shape", 'used_cine');
  ok(G.shop_jokers.cards.length === 2 && G.shop_jokers.cards.every((c) => ['Egg', 'Scary Face'].includes(c.ability.name)), 'I Sing: copies of owned jokers', shopKeys());
  ok(G.GAME.current_round.reroll_cost === 25, 'I Sing: reroll $5 + $20', G.GAME.current_round.reroll_cost);
  ok(shopKeys(G.shop_vouchers).join() === before.vouchers.join() && shopKeys(G.shop_booster).join() === before.boosters.join(), 'I Sing: vouchers / packs untouched');
  act({ type: 'reroll_shop' });
  ok(G.GAME.dollars === 75 && G.shop_jokers.cards.every((c) => ['Egg', 'Scary Face'].includes(c.ability.name)), 'I Sing: reroll paid $25, still copies', [G.GAME.dollars, shopKeys()]);
  ok(G.GAME.current_round.reroll_cost === 26, 'I Sing: next reroll $6 + $20');
  act({ type: 'next_round' });
  ok(!G.GAME.current_round.used_cine && G.GAME.banned_keys.p_rev_crazy_lucky_1 === true, 'shop end clears the Cine');
}
// The Unseen: Negative jokers & consumables, X5 reroll
{
  cineShop('RVUNSEEN', 'c_rev_unseen');
  ok(G.shop_jokers.cards.every((c) => (c.ability.set === 'Joker' || c.ability.consumeable) && c.edition && c.edition.negative), 'Unseen: every card Negative', shopKeys());
  ok(G.GAME.current_round.reroll_cost === 25, 'Unseen: reroll X5', G.GAME.current_round.reroll_cost);
  act({ type: 'reroll_shop' });
  ok(G.shop_jokers.cards.every((c) => c.edition && c.edition.negative), 'Unseen: rerolled cards Negative too');
  ok(G.GAME.current_round.reroll_cost === 30, 'Unseen: (5+1) X5');
}
// Gem Heist: Polychrome, 25% off
{
  const before = cineShop('RVHEIST', 'c_rev_gem_heist');
  let good = G.shop_jokers.cards.length === 2;
  for (const c of G.shop_jokers.cards) {
    const was = c.cost;
    c.set_cost();
    const full = c.cost;
    if (['Joker', 'Default', 'Enhanced'].includes(c.ability.set) && !(c.edition && c.edition.polychrome)) good = false;
    if (was !== Math.max(1, Math.floor(full * 75 / 100))) good = false;
  }
  ok(good, 'Gem Heist: Polychrome and 25% off', shopKeys());
  ok(G.GAME.current_round.reroll_cost === 5 && shopKeys(G.shop_booster).join() === before.boosters.join(), 'Gem Heist: reroll unchanged, packs untouched');
}
// Crazy Lucky: everything is the Pack
{
  cineShop('RVCRAZY', 'c_rev_crazy_lucky');
  ok(shopKeys().every((k) => k === 'p_rev_crazy_lucky_1') && shopKeys(G.shop_vouchers).join() === 'p_rev_crazy_lucky_1' && shopKeys(G.shop_booster).every((k) => k === 'p_rev_crazy_lucky_1') && G.shop_booster.cards.length === 2,
    'Crazy Lucky: card slots, voucher and packs are all Packs', [shopKeys(), shopKeys(G.shop_vouchers), shopKeys(G.shop_booster)]);
  ok(G.GAME.current_round.reroll_cost === 5 && !G.GAME.banned_keys.p_rev_crazy_lucky_1, 'Crazy Lucky: X1 reroll, its pack unbanned');
  const pk = G.shop_jokers.cards[0];
  const d0 = G.GAME.dollars;
  const r = act({ type: 'buy', id: pk.sort_id });
  ok(r.ok && G.STATE === STATES.MOD_PACK && G.pack_cards.cards.length === 4 && G.GAME.pack_choices === 1 && G.GAME.dollars === d0 - 6, 'a Pack in a card slot opens: 4 cards, choose 1, $6', [r.error, G.STATE, G.pack_cards.cards.length, G.GAME.dollars - d0]);
  ok(toView().pack_kind === 'Pack', 'view: pack name');
}
// Tag or Die: tags for $8, Tag packs
{
  cineShop('RVTAG', 'c_rev_tag_or_die');
  ok(G.shop_jokers.cards.every((c) => c.ability.set === 'Tag' && c.ability.tag && c.cost === 8), 'Tag or Die: tags for $8', shopKeys());
  ok(G.shop_booster.cards.every((c) => /^p_rev_tag_/.test(key(c))) && G.shop_booster.cards.length === 2, 'Tag or Die: Tag packs', shopKeys(G.shop_booster));
  const t = G.shop_jokers.cards[0];
  const tk = key(t), d0 = G.GAME.dollars, ntags = G.GAME.tags.length;
  const r = act({ type: 'buy', id: t.sort_id });
  ok(r.ok && G.GAME.dollars <= d0 - 8 + 40 && !t.area && G.jokers.cards.length === 0, 'bought a tag (not a joker)', [r.error, tk]);
  ok(G.GAME.tags.length === ntags + 1 || ['tag_economy', 'tag_handy', 'tag_garbage', 'tag_skip', 'tag_orbital', 'tag_top_up'].includes(tk), 'the tag joined your tags (or applied at once)', [tk, G.GAME.tags.map((x) => x.key)]);
  const v = toView();
  ok(v.areas.shop_jokers.length && v.areas.shop_jokers[0].tag_card && !NOFILL.test(JSON.stringify(v.areas.shop_jokers[0].desc)), 'view: tag card with its description', v.areas.shop_jokers[0]);
}
// a bought Economy Tag applies in the shop; a Charm Tag waits for the next blind
{
  const only = (tagKey) => { for (const k of Object.keys(P_TAGS)) G.GAME.banned_keys[k] = k !== tagKey; };
  cineShop('RVECON', 'c_rev_tag_or_die', { setup: () => only('tag_economy') });
  G.GAME.dollars = 20;
  const e = G.shop_jokers.cards[0];
  ok(key(e) === 'tag_economy', 'forced Economy Tag card');
  act({ type: 'buy', id: e.sort_id });
  ok(G.GAME.dollars === 24 && !G.GAME.tags.some((x) => x.key === 'tag_economy'), 'Economy Tag bought for $8 doubles the $12 left: $24', G.GAME.dollars);
  cineShop('RVCHARM', 'c_rev_tag_or_die', { setup: () => only('tag_charm') });
  act({ type: 'buy', id: G.shop_jokers.cards[0].sort_id });
  ok(G.GAME.tags.some((x) => x.key === 'tag_charm') && G.STATE === STATES.SHOP, 'Charm Tag waits in the shop');
  const pk = G.shop_booster.cards[0];
  act({ type: 'buy', id: pk.sort_id });
  ok(G.STATE === STATES.MOD_PACK && G.pack_cards.cards.every((c) => c.ability.set === 'Tag'), 'Tag Pack: tags', G.pack_cards.cards.map(key));
  act({ type: 'skip_booster' });
  ok(G.STATE === STATES.SHOP && G.GAME.tags.some((x) => x.key === 'tag_charm'), "closing a pack in the shop doesn't fire the Charm Tag");
  act({ type: 'next_round' });
  ok(G.STATE === STATES.TAROT_PACK && !G.GAME.tags.some((x) => x.key === 'tag_charm'), 'the Charm Tag opens its pack at the next blind select', G.STATE);
}
// Orbital Tag card: its hand is rolled on the card
{
  const only = (tagKey) => { for (const k of Object.keys(P_TAGS)) G.GAME.banned_keys[k] = k !== tagKey; };
  cineShop('RVORB', 'c_rev_tag_or_die', { setup: () => { only('tag_orbital'); G.GAME.round_resets.ante = 2; } }); // (Orbital Tag: ante 2+)
  const o = G.shop_jokers.cards[0];
  const hnd = o.ability.orbital_hand;
  ok(hnd && G.GAME.hands[hnd] && o.ability.tag.ability.orbital_hand === hnd, 'Orbital Tag card has its hand', hnd);
  const lv = G.GAME.hands[hnd].level;
  act({ type: 'buy', id: o.sort_id });
  ok(G.GAME.hands[hnd].level === lv + 3, 'bought Orbital Tag levels ' + hnd + ' by 3', G.GAME.hands[hnd].level);
}
// Let It Moon: Tarots & Planets, Arcana / Celestial packs
{
  cineShop('RVMOON', 'c_rev_let_it_moon');
  ok(G.shop_jokers.cards.every((c) => ['Tarot', 'Planet'].includes(c.ability.set) || c.ability.name === 'Black Hole' || c.ability.name === 'The Soul'), 'Let It Moon: Tarot / Planet cards', shopKeys());
  ok(G.shop_booster.cards.every((c) => /^p_(arcana|celestial)_/.test(key(c))), 'Let It Moon: Arcana / Celestial packs', shopKeys(G.shop_booster));
}
// Poker Face: copies of deck cards, Standard packs (copies too)
{
  cineShop('RVPOKER', 'c_rev_poker_face');
  const deckKeys = new Set(G.playing_cards.map((c) => c.config.card.key + '|' + key(c)));
  ok(G.shop_jokers.cards.every((c) => (c.ability.set === 'Default' || c.ability.set === 'Enhanced') && deckKeys.has(c.config.card.key + '|' + key(c))), 'Poker Face: copies of deck cards', G.shop_jokers.cards.map((c) => c.config.card.key));
  ok(G.shop_booster.cards.every((c) => /^p_standard_/.test(key(c))), 'Poker Face: Standard packs', shopKeys(G.shop_booster));
  const n0 = G.playing_cards.length;
  act({ type: 'buy', id: G.shop_jokers.cards[0].sort_id });
  ok(G.playing_cards.length === n0 + 1, 'bought a copy into the deck');
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  ok(G.STATE === STATES.STANDARD_PACK && G.pack_cards.cards.every((c) => deckKeys.has(c.config.card.key + '|' + key(c))), 'Standard pack: copies of deck cards', G.pack_cards.cards.map((c) => c.config.card.key));
}
// Eerie Inn: only Spectral packs, X2 reroll
{
  cineShop('RVEERIE', 'c_rev_eerie_inn');
  ok(G.shop_jokers.cards.every((c) => /^p_spectral_/.test(key(c))) && G.shop_booster.cards.every((c) => /^p_spectral_/.test(key(c))), 'Eerie Inn: Spectral packs everywhere', [shopKeys(), shopKeys(G.shop_booster)]);
  ok(G.GAME.current_round.reroll_cost === 10, 'Eerie Inn: reroll X2');
  const r = act({ type: 'buy', id: G.shop_jokers.cards[0].sort_id });
  ok(r.ok && G.STATE === STATES.SPECTRAL_PACK, 'a Spectral pack in a card slot opens', [r.error, G.STATE]);
}
// Adrifting: face down, $1 each
{
  cineShop('RVADRIFT', 'c_rev_adrifting');
  const all = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards];
  ok(all.length === 5 && all.every((c) => c.facing === 'back' && c.cost === 1), 'Adrifting: everything face down for $1', all.map((c) => [key(c), c.facing, c.cost]));
  ok(G.GAME.current_round.reroll_cost === 5, 'Adrifting: reroll unchanged');
  const v = toView();
  ok(v.areas.shop_vouchers[0].facing === 'back' && v.areas.shop_vouchers[0].back_atlas === 'rev_vouchers' && v.areas.shop_booster[0].back_atlas === 'rev_boosters', "view: Reverie's flipped voucher / pack backs");
  const j = G.shop_jokers.cards.find((c) => c.ability.set === 'Joker');
  if (j) {
    const d0 = G.GAME.dollars;
    act({ type: 'buy', id: j.sort_id });
    ok(G.GAME.dollars === d0 - 1 && j.area === G.jokers && j.facing === 'front', 'bought a face-down joker for $1; it turns up', [d0 - G.GAME.dollars, j.facing]);
  } else ok(true, 'no joker rolled');
}
// Morsel: food jokers with doubled values, Buffoon packs
{
  cineShop('RVMORSEL', 'c_rev_morsel');
  const foods = ['j_gros_michel', 'j_ice_cream', 'j_turtle_bean', 'j_diet_cola', 'j_popcorn', 'j_ramen', 'j_selzer', 'j_egg'];
  ok(G.shop_jokers.cards.every((c) => foods.includes(key(c)) && c.ability.morseled), 'Morsel: food jokers, morseled', shopKeys());
  ok(G.shop_booster.cards.every((c) => /^p_buffoon_/.test(key(c))), 'Morsel: Buffoon packs');
  const ice = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_ice_cream', 'test');
  G.shop_jokers.emplace(ice);
  ok(ice.ability.extra.chips === 200 && ice.ability.extra.chip_mod === 10, 'Ice Cream doubled: +200 chips, -10 per hand', ice.ability.extra);
  const ramen = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_ramen', 'test');
  G.shop_jokers.emplace(ramen);
  ok(ramen.ability.x_mult === 4 && ramen.ability.extra === 0.02, 'Ramen doubled: X4, -X0.02', [ramen.ability.x_mult, ramen.ability.extra]);
  const d = describe(ramen);
  ok(d.info.some((x) => x.key === 'morseled') && !NOFILL.test(JSON.stringify(d)), 'Morsel info on the card', d);
  const cola = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_diet_cola', 'test');
  G.shop_jokers.emplace(cola);
  ok(describe(cola).lines[1] === 'create two free', 'Diet Cola text: two free', describe(cola).lines);
  act({ type: 'buy', id: cola.sort_id });
  const nt = G.GAME.tags.length;
  act({ type: 'sell', id: cola.sort_id });
  ok(G.GAME.tags.filter((t) => t.key === 'tag_double').length === 2 && G.GAME.tags.length === nt + 2, 'morsel Diet Cola sold: two Double Tags', G.GAME.tags.map((t) => t.key));
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  ok(G.pack_cards.cards.every((c) => foods.includes(key(c)) && c.ability.morseled), 'Buffoon pack: morseled food jokers', G.pack_cards.cards.map(key));
}
// Every Hue (More Fluff): Colour cards that already have 3 rounds
{
  cineShop('RVHUE', 'c_rev_every_hue', { mods: ['reverie', 'morefluff'] });
  ok(G.shop_jokers.cards.length === 2 && G.shop_jokers.cards.every((c) => c.ability.set === 'Colour' && c.ability.val === Math.floor(3 / c.ability.upgrade_rounds) && c.ability.partial_rounds === 3 % c.ability.upgrade_rounds),
    'Every Hue: charged Colour cards', G.shop_jokers.cards.map((c) => [key(c), c.ability.val, c.ability.partial_rounds, c.ability.upgrade_rounds]));
  ok(G.shop_booster.cards.every((c) => /^p_mf_colour_/.test(key(c))), 'Every Hue: Colour packs', shopKeys(G.shop_booster));
}
// The Reverie spectral: every Cine at once
{
  run('RVREV');
  toShop();
  G.GAME.dollars = 100;
  const c = new Card(P_CARDS.empty, P_CENTERS.c_rev_reverie);
  c.add_to_deck();
  G.consumeables.emplace(c);
  ok(!c.can_use_consumeable() === false, 'Reverie usable in the shop');
  ok(use(c).ok, 'use Reverie');
  const u = G.GAME.current_round.used_cine;
  ok(u[0] === 'Reverie' && u.length === 11, 'Reverie: every Cine applied', u);
  ok(G.GAME.current_round.reroll_cost === 70, 'Reverie: reroll (5 X2 X1 X5) + 20 = $70', G.GAME.current_round.reroll_cost);
  const all = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards];
  ok(all.every((x) => key(x) === 'p_rev_crazy_lucky_1' && x.facing === 'back' && x.cost === 1), 'Reverie: all Packs, face down, $1', all.map((x) => [key(x), x.facing, x.cost]));
  act({ type: 'next_round' });
  ok(!G.GAME.current_round.used_cine && G.GAME.shop.joker_max === 2, 'Reverie: over after the shop');
  // a Spectral used outside the shop: no
  run('RVREV2');
  const c2 = new Card(P_CARDS.empty, P_CENTERS.c_rev_reverie); c2.add_to_deck(); G.consumeables.emplace(c2);
  ok(!c2.can_use_consumeable(), 'Reverie only in the shop');
  // the 0.3% "soul" roll in Film packs
  c2.remove();
  let found = null, n = 0;
  for (; n < 5000 && !found; n++) { const x = create_card('Cine_Quest', G.pack_cards, null, null, true, true, null, 'film'); if (key(x) === 'c_rev_reverie') found = x; else x.remove(); }
  ok(found && n > 1, 'Reverie rolls in a coupon pack now and then (0.3%)', n);
  found.add_to_deck(); G.cine_quests.emplace(found);
  let again = 0;
  for (let i = 0; i < 3000; i++) { const x = create_card('Cine_Quest', G.pack_cards, null, null, true, true, null, 'film'); if (key(x) === 'c_rev_reverie') again++; x.remove(); }
  ok(again === 0, 'while you hold a Reverie it does not roll again (no Showman)', again);
  ok(!key(create_card('Cine', G.pack_cards, null, null, true, false, null, 'x')).includes('reverie'), 'not soulable: no roll');
}

// =================================================================== Exchange Coupons -> Cines
const giveQuest = (k) => { const q = giveCine(k); ok(q.ability.progress === 0, k + ': progress 0'); return q; };
function converted(q, cine, msg) {
  ok(key(q) === cine && q.ability.progress === undefined && q.area === G.cine_quests, msg + ': became ' + cine, [key(q), q.ability.progress]);
  ok(!G.GAME.used_jokers[cine + '_quest'], msg + ': the coupon is back in the pool');
}
// Gem Heist coupon: sell 2 editioned jokers (+ Dynamic Film +15 per progress)
{
  run('RVQHEIST');
  const film = add('j_rev_dynamic_film');
  const q = giveQuest('c_rev_gem_heist_quest');
  const a = add('j_joker', 'foil'), b = add('j_joker'), c = add('j_egg', 'holo');
  act({ type: 'sell', id: a.sort_id });
  ok(q.ability.progress === 1 && film.ability.extra.chips === 15, 'sold a Foil joker: 1/2, Dynamic Film +15', [q.ability.progress, film.ability.extra.chips]);
  act({ type: 'sell', id: b.sort_id });
  ok(q.ability.progress === 1 && film.ability.extra.chips === 15, 'a plain joker does not count');
  act({ type: 'sell', id: c.sort_id });
  converted(q, 'c_rev_gem_heist', 'Gem Heist coupon');
  ok(film.ability.extra.chips === 30, 'Dynamic Film: +30 after two steps');
  // Dynamic Film scores its chips: High Card 2 = 5 + 2, +30 = 37
  act({ type: 'select_blind' }); clearHand();
  const r = play(hand(['S_2']));
  ok(r.total && r.total.chips === 37 && r.total.mult === 1, 'Dynamic Film: +30 Chips', r.total);
  ok(describe(film).lines.join(' ').includes('{C:chips}30{C:inactive} Chips') && !NOFILL.test(JSON.stringify(describe(film))), 'Dynamic Film text', describe(film).lines);
}
// I Sing coupon: beat 3 blinds by X2
{
  run('RVQSING');
  const q = giveQuest('c_rev_ive_no_shape_quest');
  toShop(); act({ type: 'next_round' });
  ok(q.ability.progress === 0, 'a blind beaten by less than X2: no progress');
  for (let i = 0; i < 3; i++) {
    act({ type: 'select_blind' });
    toShop(G.GAME.blind.chips * 2);
    if (i < 2) { ok(q.ability.progress === i + 1, 'beaten by X2: ' + (i + 1) + '/3', q.ability.progress); act({ type: 'next_round' }); }
  }
  converted(q, 'c_rev_ive_no_shape', 'I Sing coupon');
}
// The Unseen coupon: 5 rounds with an empty joker slot
{
  run('RVQUNSEEN');
  const q = giveQuest('c_rev_unseen_quest');
  for (let i = 0; i < 5; i++) add('j_joker');
  toShop(); act({ type: 'next_round' });
  ok(q.ability.progress === 0, 'no empty joker slot: no progress');
  act({ type: 'sell', id: G.jokers.cards[0].sort_id });
  for (let i = 0; i < 5; i++) { toShop(); if (i < 4) { ok(q.ability.progress === i + 1, 'an empty slot: ' + (i + 1) + '/5'); act({ type: 'next_round' }); } }
  converted(q, 'c_rev_unseen', 'Unseen coupon');
}
// Crazy Lucky coupon: open 6 boosters
{
  run('RVQCRAZY');
  const q = giveQuest('c_rev_crazy_lucky_quest');
  toShop();
  for (let i = 0; i < 6; i++) {
    G.GAME.dollars = 50;
    const p = new Card(P_CARDS.empty, P_CENTERS.p_buffoon_normal_1);
    G.shop_booster.emplace(p);
    act({ type: 'buy', id: p.sort_id });
    act({ type: 'skip_booster' });
    if (i < 5) ok(q.ability.progress === i + 1, 'opened a pack: ' + (i + 1) + '/6', q.ability.progress);
  }
  converted(q, 'c_rev_crazy_lucky', 'Crazy Lucky coupon');
}
// Tag or Die coupon: skip 4 blinds
{
  run('RVQTAG');
  const q = giveQuest('c_rev_tag_or_die_quest');
  let skips = 0;
  for (let guard = 0; guard < 40 && skips < 4; guard++) {
    if (G.STATE === STATES.BLIND_SELECT) {
      if (G.GAME.blind_on_deck !== 'Boss') { G.GAME.round_resets.blind_tags[G.GAME.blind_on_deck] = 'tag_double'; act({ type: 'skip_blind' }); skips++; if (skips < 4) ok(q.ability.progress === skips, 'skipped: ' + skips + '/4'); }
      else toShop();
    } else if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
    else act({ type: 'skip_booster' });
  }
  converted(q, 'c_rev_tag_or_die', 'Tag or Die coupon');
}
// Let It Moon coupon: use 10 Planets / Tarots
{
  run('RVQMOON');
  const q = giveQuest('c_rev_let_it_moon_quest');
  toShop();
  const sp = add_joker('c_hermit'); flush(); use(sp);
  ok(q.ability.progress === 1, 'a Tarot used: 1/10', q.ability.progress);
  const spec = add_joker('c_hex'); flush();
  for (let i = 0; i < 9; i++) { const p = add_joker('c_pluto'); flush(); use(p); }
  converted(q, 'c_rev_let_it_moon', 'Let It Moon coupon');
}
// Poker Face coupon: enhance 8 playing cards
{
  run('RVQPOKER');
  const q = giveQuest('c_rev_poker_face_quest');
  act({ type: 'select_blind' }); clearHand();
  const cards = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8', 'S_9']);
  for (let i = 0; i < 4; i++) {
    const e = add_joker('c_empress'); flush();
    const r = use(e, [cards[2 * i].sort_id, cards[2 * i + 1].sort_id]);
    if (i < 3) ok(r.ok && q.ability.progress === 2 * i + 2, 'Empress on 2 cards: ' + (2 * i + 2) + '/8', [r.error, q.ability.progress]);
  }
  converted(q, 'c_rev_poker_face', 'Poker Face coupon');
  const run2 = () => { run('RVQPOKER2'); const q2 = giveQuest('c_rev_poker_face_quest'); act({ type: 'select_blind' }); clearHand(); const [m] = hand(['S_2'], 'm_mult'); const e = add_joker('c_magician'); flush(); use(e, [m.sort_id]); return q2; };
  ok(run2().ability.progress === 0, 'an already Enhanced card re-enhanced does not count');
}
// Eerie Inn coupon: destroy 5 cards
{
  run('RVQEERIE');
  const q = giveQuest('c_rev_eerie_inn_quest');
  act({ type: 'select_blind' }); clearHand();
  const cards = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7']);
  let h = add_joker('c_hanged_man'); flush(); use(h, [cards[0].sort_id, cards[1].sort_id]);
  ok(q.ability.progress === 2, 'The Hanged Man destroyed 2: 2/5', q.ability.progress);
  const j = add('j_joker');
  act({ type: 'sell', id: j.sort_id });
  ok(q.ability.progress === 2, 'a sold joker is not destroyed');
  h = add_joker('c_hanged_man'); flush(); use(h, [cards[2].sort_id, cards[3].sort_id]);
  ok(q.ability.progress === 4, '4/5');
  h = add_joker('c_hanged_man'); flush(); use(h, [cards[4].sort_id]);
  converted(q, 'c_rev_eerie_inn', 'Eerie Inn coupon');
}
// Adrifting coupon: play 5 debuffed / face-down cards
{
  run('RVQADRIFT');
  const q = giveQuest('c_rev_adrifting_quest');
  act({ type: 'select_blind' }); clearHand();
  const cs = hand(['S_2', 'S_3', 'H_4']);
  cs[0].flip(); cs[1].flip();
  play(cs);
  ok(q.ability.progress === 2, '2 face-down cards played: 2/5', q.ability.progress);
  clearHand();
  const ds = hand(['S_5', 'S_6', 'S_7', 'S_8']);
  for (const d of ds.slice(0, 3)) d.debuff = true;
  play(ds);
  converted(q, 'c_rev_adrifting', 'Adrifting coupon');
}
// Morsel coupon: get 2 Food Jokers (+ fix 1: a food joker back from a debuff doesn't count)
{
  run('RVQMORSEL');
  const q = giveQuest('c_rev_morsel_quest');
  toShop();
  G.GAME.dollars = 50;
  const g = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_gros_michel', 'test');
  G.shop_jokers.emplace(g);
  act({ type: 'buy', id: g.sort_id });
  ok(q.ability.progress === 1, 'bought Gros Michel: 1/2', q.ability.progress);
  add('j_joker');
  ok(q.ability.progress === 1, 'a non-food joker does not count');
  g.set_debuff(true); g.set_debuff(false);
  ok(q.ability.progress === 1, 'fix 1: a Food Joker back from a debuff is not "got" again', q.ability.progress);
  add('j_popcorn');
  converted(q, 'c_rev_morsel', 'Morsel coupon');
}
// Every Hue coupon (More Fluff): use 2 Colour cards
{
  run('RVQHUE', { mods: ['reverie', 'morefluff'] });
  const q = giveQuest('c_rev_every_hue_quest');
  toShop();
  for (let i = 0; i < 2; i++) { const c = add_joker('c_mf_pink'); flush(); const r = use(c); if (i === 0) ok(r.ok && q.ability.progress === 1, 'a Colour card used: 1/2', [r.error, q.ability.progress]); }
  converted(q, 'c_rev_every_hue', 'Every Hue coupon');
}

// =================================================================== packs
{
  // Film Packs: coupons (normal / jumbo), Cines (mega), taken into the Cine slot
  for (const [pk, n, quest] of [['p_rev_flim_normal_1', 2, true], ['p_rev_flim_normal_2', 2, true], ['p_rev_flim_jumbo_1', 4, true], ['p_rev_flim_mega_1', 2, false]]) {
    run('RVFILM' + pk);
    toShop();
    G.GAME.dollars = 50;
    const p = new Card(P_CARDS.empty, P_CENTERS[pk]);
    G.shop_booster.emplace(p);
    const d0 = G.GAME.dollars;
    act({ type: 'buy', id: p.sort_id });
    ok(G.STATE === STATES.MOD_PACK && G.pack_cards.cards.length === n && G.GAME.pack_choices === 1 && G.GAME.dollars === d0 - P_CENTERS[pk].cost, pk + ': ' + n + ' cards, choose 1, $' + P_CENTERS[pk].cost, G.pack_cards.cards.map(key));
    ok(G.pack_cards.cards.every((c) => c.ability.set === 'Cine' && !!c.config.center.reward === quest), pk + (quest ? ': Exchange Coupons' : ': Cines'), G.pack_cards.cards.map(key));
    ok(toView().pack_kind === 'Film Pack' && toView().areas.pack_cards[0].use_label === 'Select', pk + ': view (Film Pack, Select)');
    const pick = G.pack_cards.cards[0];
    const r = use(pick);
    ok(r.ok && pick.area === G.cine_quests && G.STATE === STATES.SHOP, pk + ': taken into the Cine slot', [r.error, pick.area && pick.area.name, G.STATE]);
  }
  // a full Cine slot: can't take another
  run('RVFULL'); toShop(); G.GAME.dollars = 50;
  giveCine('c_rev_morsel');
  const p = new Card(P_CARDS.empty, P_CENTERS.p_rev_flim_normal_1); G.shop_booster.emplace(p);
  act({ type: 'buy', id: p.sort_id });
  const r = use(G.pack_cards.cards[0]);
  ok(!r.ok && r.error === 'no space' && G.STATE === STATES.MOD_PACK, 'no Cine slot free: no space', r.error);
  // Tag packs: distinct tags; Mega: choose 2
  for (const [pk, n, choose] of [['p_rev_tag_normal_1', 2, 1], ['p_rev_tag_normal_2', 2, 1], ['p_rev_tag_jumbo_1', 4, 1], ['p_rev_tag_mega_1', 4, 2]]) {
    run('RVTP' + pk); toShop(); G.GAME.dollars = 50;
    const tp = new Card(P_CARDS.empty, P_CENTERS[pk]); G.shop_booster.emplace(tp);
    act({ type: 'buy', id: tp.sort_id });
    const ks = G.pack_cards.cards.map(key);
    ok(G.pack_cards.cards.length === n && new Set(ks).size === n && G.pack_cards.cards.every((c) => c.ability.set === 'Tag') && G.GAME.pack_choices === choose, pk + ': ' + n + ' distinct tags, choose ' + choose, ks);
    const t0 = G.GAME.tags.length;
    const pick = G.pack_cards.cards.find((c) => !['tag_economy', 'tag_handy', 'tag_garbage', 'tag_skip', 'tag_orbital', 'tag_top_up'].includes(key(c))) || G.pack_cards.cards[0];
    const pr = use(pick);
    ok(pr.ok && (G.GAME.tags.length === t0 + 1 || ['tag_economy', 'tag_handy', 'tag_garbage', 'tag_skip', 'tag_orbital', 'tag_top_up'].includes(key(pick))), pk + ': the picked tag joins your tags', [pr.error, key(pick)]);
    ok(choose === 2 ? G.STATE === STATES.MOD_PACK : G.STATE === STATES.SHOP, pk + ': picks left');
  }
  // the Crazy Lucky Pack: anything, taken (not used)
  let seen = new Set();
  for (let s = 0; s < 12; s++) {
    run('RVCP' + s); toShop(); G.GAME.dollars = 50;
    const cp = new Card(P_CARDS.empty, P_CENTERS.p_rev_crazy_lucky_1); G.shop_booster.emplace(cp);
    act({ type: 'buy', id: cp.sort_id });
    ok(G.pack_cards.cards.length === 4 && toView().pack_kind === 'Pack', 'Crazy Lucky Pack: 4 cards');
    for (const c of G.pack_cards.cards) seen.add(c.ability.set);
    const pick = G.pack_cards.cards[0];
    const set = pick.ability.set, nC = G.consumeables.cards.length, nJ = G.jokers.cards.length, nD = G.playing_cards.length, nT = G.GAME.tags.length, d0 = G.GAME.dollars;
    const pr = use(pick);
    if (set === 'Joker') ok(pr.ok && G.jokers.cards.length === nJ + 1, 'crazy pick: a joker');
    else if (set === 'Cine') ok(pr.ok && pick.area === G.cine_quests, 'crazy pick: a coupon to the Cine slot');
    else if (pick.ability.consumeable) ok(pr.ok && pick.area === G.consumeables && G.consumeables.cards.length === nC + 1, 'crazy pick: a consumable is TAKEN, not used', [key(pick), pr.error]);
    else if (set === 'Default' || set === 'Enhanced') ok(pr.ok && G.playing_cards.length === nD + 1, 'crazy pick: a playing card');
    else if (set === 'Voucher') ok(pr.ok && G.GAME.used_vouchers[key(pick)] && G.GAME.dollars === d0, 'crazy pick: a free voucher', [G.GAME.dollars - d0]);
    else if (set === 'Tag') ok(pr.ok, 'crazy pick: a tag');
  }
  ok(seen.has('Joker') && seen.has('Tag') && (seen.has('Default') || seen.has('Enhanced')), 'Crazy Lucky Pack: jokers, tags, playing cards...', [...seen]);
  // a free voucher from a Crazy pack (forced): $0, round voucher untouched unless it's the same one
  run('RVCPV'); toShop(); G.GAME.dollars = 50;
  const rv = G.GAME.current_round.voucher;
  const cp = new Card(P_CARDS.empty, P_CENTERS.p_rev_crazy_lucky_1); G.shop_booster.emplace(cp);
  act({ type: 'buy', id: cp.sort_id });
  const vc = create_card('Voucher', G.pack_cards, null, null, true, true, 'v_grabber', 'test'); G.pack_cards.emplace(vc);
  const d1 = G.GAME.dollars;
  use(vc);
  ok(G.GAME.used_vouchers.v_grabber && G.GAME.dollars === d1 && G.GAME.current_round.voucher === rv, 'Crazy pack voucher: redeemed free', [G.GAME.dollars - d1]);
}

// =================================================================== tags & decks
{
  // Stub Tag: a free Film Pack
  run('RVSTUB');
  G.GAME.round_resets.blind_tags.Small = 'tag_rev_cine';
  const d0 = G.GAME.dollars;
  act({ type: 'skip_blind' });
  ok(G.STATE === STATES.MOD_PACK && /^p_rev_flim_normal_/.test(G.GAME.pack_center) && G.pack_cards.cards.length === 2 && G.GAME.dollars === d0, 'Stub Tag: a free Film Pack', [G.GAME.pack_center, G.GAME.dollars - d0]);
  ok(!G.GAME.tags.some((t) => t.key === 'tag_rev_cine'), 'Stub Tag used');
  const dt = describeTag('tag_rev_cine');
  ok(dt.name === 'Stub Tag' && !NOFILL.test(JSON.stringify(dt)), 'Stub Tag text', dt);
  // Stamp Deck: every skip gives a Stamp Tag -> a free Jumbo Tag Pack
  run('RVSTAMP', { back: 'b_rev_stamp' });
  ok(G.GAME.round_resets.blind_tags.Small === 'tag_rev_mega_tag' && G.GAME.round_resets.blind_tags.Big === 'tag_rev_mega_tag', 'Stamp Deck: Stamp Tags on both skips');
  act({ type: 'skip_blind' });
  ok(G.STATE === STATES.MOD_PACK && G.GAME.pack_center === 'p_rev_tag_jumbo_1' && G.pack_cards.cards.length === 4 && G.pack_cards.cards.every((c) => c.ability.set === 'Tag'), 'Stamp Tag: a free Jumbo Tag Pack', [G.GAME.pack_center, G.pack_cards.cards.map(key)]);
  act({ type: 'skip_booster' });
  act({ type: 'select_blind' });
  win(); act({ type: 'cash_out' });
  ok(G.GAME.round_resets.blind_tags.Small === 'tag_rev_mega_tag', 'Stamp Deck: still Stamp Tags after cash out');
  act({ type: 'next_round' }); toShop(); act({ type: 'next_round' });
  ok(G.GAME.round_resets.ante === 2 && G.GAME.round_resets.blind_tags.Small === 'tag_rev_mega_tag' && G.GAME.round_resets.blind_tags.Big === 'tag_rev_mega_tag', 'Stamp Deck: new ante, Stamp Tags again', G.GAME.round_resets.blind_tags);
  const db = describeBack('b_rev_stamp');
  ok(db.lines.join(' ').includes('Jumbo Tag Pack') && !NOFILL.test(JSON.stringify(db)), 'Stamp Deck text', db.lines);
  ok(describeBack('b_rev_filmstrip').lines.join(' ').includes('+1') && !NOFILL.test(JSON.stringify(describeBack('b_rev_filmstrip'))), 'Filmstrip Deck text');
  // Filmstrip Deck: Cines stack
  cineShop('RVSTACK', 'c_rev_gem_heist', { back: 'b_rev_filmstrip' });
  const m = giveCine('c_rev_unseen');
  use(m);
  ok(G.GAME.current_round.used_cine.join() === 'Gem Heist,The Unseen', 'Filmstrip: Cines stack', G.GAME.current_round.used_cine);
  ok(G.shop_jokers.cards.every((c) => c.edition && (c.edition.polychrome || c.edition.negative)), 'Filmstrip: Gem Heist + Unseen editions', G.shop_jokers.cards.map((c) => c.edition && c.edition.type));
  ok(G.GAME.current_round.reroll_cost === 25, 'Filmstrip: X5');
  // without Filmstrip the second Cine replaces the first
  cineShop('RVNOSTACK', 'c_rev_gem_heist');
  use(giveCine('c_rev_unseen'));
  ok(G.GAME.current_round.used_cine.join() === 'The Unseen', 'no Filmstrip: the new Cine replaces the old');
}

// =================================================================== vouchers
{
  // Script: +2 shop slots while a Cine is on
  run('RVSCRIPT'); toShop(); G.GAME.dollars = 100;
  const sv = new Card(P_CARDS.empty, P_CENTERS.v_rev_script); sv.shop_voucher = true; G.shop_vouchers.emplace(sv);
  act({ type: 'buy', id: sv.sort_id });
  ok(G.GAME.used_vouchers.v_rev_script && G.GAME.shop.joker_max === 2, 'Script: nothing without a Cine');
  use(giveCine('c_rev_morsel'));
  ok(G.GAME.shop.joker_max === 4 && G.shop_jokers.cards.length === 4, 'Script: 4 shop slots with a Cine', G.shop_jokers.cards.length);
  act({ type: 'next_round' });
  ok(G.GAME.shop.joker_max === 2 && G.shop_jokers.config.card_limit === 2, 'Script: back to 2 after the shop');
  // Script redeemed while a Cine is on: +2 now
  cineShop('RVSCRIPT2', 'c_rev_unseen');
  const sv2 = new Card(P_CARDS.empty, P_CENTERS.v_rev_script); sv2.shop_voucher = true; G.shop_vouchers.emplace(sv2);
  act({ type: 'buy', id: sv2.sort_id });
  ok(G.GAME.shop.joker_max === 4 && G.shop_jokers.cards.length === 4 && G.shop_jokers.cards.every((c) => c.edition && c.edition.negative), 'Script mid-Cine: 2 more (Cine) cards now', G.shop_jokers.cards.length);
  // Megaphone: goals halved, now and later
  run('RVMEGA', { back: 'b_rev_filmstrip' }); toShop(); G.GAME.dollars = 100;
  const q = giveQuest('c_rev_gem_heist_quest');
  const ej = add('j_joker', 'foil');
  act({ type: 'sell', id: ej.sort_id });
  ok(q.ability.progress === 1 && q.ability.extra.goal === 2, 'Gem Heist coupon 1/2');
  G.GAME.used_vouchers.v_rev_script = true;
  const mv = new Card(P_CARDS.empty, P_CENTERS.v_rev_megaphone); mv.shop_voucher = true; G.shop_vouchers.emplace(mv);
  act({ type: 'buy', id: mv.sort_id });
  converted(q, 'c_rev_gem_heist', 'Megaphone: goal 2 -> 1, done at once');
  const q2 = giveQuest('c_rev_let_it_moon_quest');
  ok(q2.ability.extra.goal === 5 && describe(q2).lines.join(' ').includes('5'), 'Megaphone: a new Let It Moon coupon needs 5', q2.ability.extra.goal);
  ok(P_CENTERS.v_rev_megaphone.requires.join() === 'v_rev_script', 'Megaphone requires Script');
}

// =================================================================== intended-design fixes
{
  // fix 2: an Uncommon Tag in a Gem Heist / Unseen shop stocks its joker (the tag isn't wasted)
  run('RVFIX2');
  toShop();
  add_tag(new Tag('tag_uncommon'));
  use(giveCine('c_rev_unseen'));
  const first = G.shop_jokers.cards[0];
  ok(!G.GAME.tags.some((t) => t.key === 'tag_uncommon') && first.config.center.rarity === 2 && first.ability.couponed && first.cost === 0, 'fix 2: the Uncommon Tag\'s free joker is in the shop', [key(first), first.cost, G.GAME.tags.map((t) => t.key)]);
  // fix 3: a reroll stocks exactly the slots (no extra, thrown-away card marked as used)
  run('RVFIX3'); toShop(); G.GAME.dollars = 200;
  use(giveCine('c_rev_unseen'));
  for (let i = 0; i < 3; i++) act({ type: 'reroll_shop' });
  const live = new Set([...G.jokers.cards, ...G.shop_jokers.cards].map((c) => c.ability.name));
  const stray = Object.keys(G.GAME.used_jokers).filter((k) => P_CENTERS[k] && P_CENTERS[k].set === 'Joker' && !live.has(P_CENTERS[k].name));
  ok(stray.length === 0, 'fix 3: no joker is marked used without a card', stray);
  // fix 4: two voucher slots — Crazy Lucky replaces both
  run('RVFIX4');
  change_voucher_limit(1);
  toShop();
  ok(G.shop_vouchers.cards.length === 2, 'two shop vouchers', shopKeys(G.shop_vouchers));
  use(giveCine('c_rev_crazy_lucky'));
  ok(G.shop_vouchers.cards.length === 2 && shopKeys(G.shop_vouchers).every((k) => k === 'p_rev_crazy_lucky_1'), 'fix 4: both vouchers became Packs', shopKeys(G.shop_vouchers));
}

// =================================================================== describe(): every text filled
{
  run('RVDESC', { mods: ['reverie', 'morefluff'] });
  const keys = [...STATUS.cines, ...STATUS.quests, ...STATUS.boosters, ...STATUS.vouchers, 'c_rev_reverie', 'j_rev_dynamic_film'];
  for (const k of keys) {
    const d = describeCenter(k);
    ok(d && d.name && d.lines.length && !NOFILL.test(JSON.stringify(d)), 'describeCenter ' + k, d);
  }
  for (const k of STATUS.decks) ok(!NOFILL.test(JSON.stringify(describeBack(k))), 'describeBack ' + k);
  for (const k of STATUS.tags) ok(!NOFILL.test(JSON.stringify(describeTag(k))), 'describeTag ' + k);
  for (const k of [...STATUS.cines, ...STATUS.quests]) {
    const c = giveCine(k);
    const d = describe(c);
    ok(!NOFILL.test(JSON.stringify(d)) && d.badges.some((b) => b.key === 'cine'), 'describe live ' + k, d);
    c.remove();
  }
  const q = giveCine('c_rev_unseen_quest');
  ok(describe(q).lines.join('|') === 'Converts to {C:cine}The Unseen{}|after having {C:attention}1{} empty|{C:attention}Joker{} slot for {C:attention}5{} rounds|{C:inactive}(Currently {C:attention}0{C:inactive}/5)' && describe(q).info.some((x) => x.key === 'c_rev_unseen'), 'coupon text + its Cine', describe(q));
  q.set_edition({ negative: true });
  ok(describe(q).info.some((x) => x.key === 'e_negative_cine'), 'Negative Cine: +1 Cine slot info');
  for (const k of Object.keys(P_TAGS).filter((t) => !P_TAGS[t].mod)) {
    for (const t of Object.keys(P_TAGS)) G.GAME.banned_keys[t] = t !== k;
    G.GAME.round_resets.ante = 8;
    const c = create_tag_as_card(G.shop_jokers);
    const d = describe(c);
    ok(key(c) === k && !NOFILL.test(JSON.stringify(d)), 'tag card text ' + k, d);
  }
  ok(toView().mod_areas[0].key === 'cine_quests', 'view: the Cine area');
}

// =================================================================== negative Cines take no slot
{
  run('RVNEG'); toShop(); G.GAME.dollars = 50;
  giveCine('c_rev_morsel');
  const p = new Card(P_CARDS.empty, P_CENTERS.p_rev_flim_normal_1); G.shop_booster.emplace(p);
  act({ type: 'buy', id: p.sort_id });
  const n = G.pack_cards.cards[0];
  n.set_edition({ negative: true });
  const r = use(n);
  ok(r.ok && G.cine_quests.cards.length === 2 && G.cine_quests.config.card_limit === 2, 'a Negative coupon fits a full Cine slot and adds one', [r.error, G.cine_quests.config.card_limit]);
  act({ type: 'sell', id: n.sort_id });
  ok(G.cine_quests.config.card_limit === 1 && G.cine_quests.cards.length === 1, 'sold: the slot goes with it');
}

console.log(`reverie: ${pass} ok, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
