// Risk of Jesters (micatro/mods/riskofjesters): mod off = none of its content; every joker,
// voucher and blind fired through real act() plays with exact values; the Temporary sticker;
// the 6 intended-design fixes (each fails on the shipped Lua behaviour); describe() text.
//   node micatro/tests/mods/riskofjesters_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import {
  G, P_CENTERS, P_CARDS, P_BLINDS, P_CENTER_POOLS, P_JOKER_RARITY_POOLS, add_joker, create_playing_card, create_card, get_new_boss,
} from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { registerMod, ACTIVE } from '../../js/mods/registry.js';
import { describe, describeCenter, describeBlind } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/riskofjesters/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();

// A throwaway mod with a string-rarity joker (Benthic Bloom port note).
registerMod({
  id: 'rojtest', name: 'RoJ test', prefix: 'rt',
  content: {
    rarities: [{ key: 'rt_odd', name: 'Odd', weight: 0 }],
    centers: [{ key: 'j_rt_odd', set: 'Joker', name: 'Odd Joker', rarity: 'rt_odd', cost: 1, pos: { x: 0, y: 0 }, config: {} }],
  },
});

function run(seed, { boss = 'bl_wall', mods = ['riskofjesters'], back = 'b_red' } = {}) {
  newRun({ seed, back, mods });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
}
function clearHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
}
const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
const add = (k, ed) => { const c = add_joker(k, ed); flush(); return c; };
function select() { act({ type: 'select_blind' }); clearHand(); }
function play(cards, { keepChips } = {}) {
  if (!keepChips) { G.GAME.chips = 0; if (G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15; }
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const res = act({ type: 'play' });
  return { res, total: res.events.find((e) => e.type === 'hand_total'), events: res.events };
}
function win() { G.GAME.chips = G.GAME.blind.chips; clearHand(); return play(hand(['S_2']), { keepChips: true }); }
function nextRound() {
  if (G.STATE === STATES.SELECTING_HAND) win();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  select();
}
function toShop() { if (G.STATE === STATES.SELECTING_HAND) win(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); }
/** Skip Small and Big, then select the (forced) boss. */
function toBoss() {
  // Skip Small and Big (a skip tag may open a pack: skip it), then select the boss.
  for (let i = 0; i < 10 && G.STATE !== STATES.SELECTING_HAND; i++) {
    if (G.STATE === STATES.BLIND_SELECT) { if (G.GAME.blind_on_deck !== 'Boss') act({ type: 'skip_blind' }); else select(); }
    else act({ type: 'skip_booster' });
  }
}
const msgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
const NOFILL = /#\d+#/;
function buyFromShop(centerKey, area) {
  const c = create_card(P_CENTERS[centerKey].set, area, null, null, null, null, centerKey, 'test');
  area.emplace(c);
  G.GAME.dollars = 1000;
  return act({ type: 'buy', id: c.sort_id });
}

// =================================================================== off / on
{
  run('ROJOFF', { mods: [] });
  ok(ACTIVE.length === 0, 'no mods');
  ok(!P_CENTER_POOLS.Joker.some((c) => c.mod === 'riskofjesters') && !P_CENTER_POOLS.Voucher.some((c) => c.mod === 'riskofjesters'), 'off: no RoJ jokers/vouchers in pools');
  G.FORCE_BOSS = null;
  const seen = new Set();
  for (let a = 1; a <= 16; a++) { G.GAME.round_resets.ante = a; for (let i = 0; i < 25; i++) seen.add(get_new_boss()); }
  ok(![...seen].some((k) => k.startsWith('bl_roj')), 'off: no RoJ boss is ever drawn');
  // vanilla behaviour unchanged with the mod off: a joker added does nothing extra
  select();
  add('j_joker'); add('j_joker');
  ok(G.jokers.cards.length === 2, 'off: no duplication');
}
{
  run('ROJON', { boss: 'bl_wall' });
  ok(ACTIVE.join() === 'riskofjesters', 'on');
  ok(STATUS.jokers.length === 11 && STATUS.vouchers.length === 2 && STATUS.blinds.length === 4, 'inventory 11 / 2 / 4', STATUS);
  ok(STATUS.jokers.every((k) => P_CENTER_POOLS.Joker.some((c) => c.key === k)), 'on: all 11 jokers pooled');
  ok(STATUS.vouchers.every((k) => P_CENTER_POOLS.Voucher.some((c) => c.key === k)), 'on: both vouchers pooled');
  const R = (k) => P_CENTERS[k].rarity;
  ok(R('j_roj_egocentrism') === 1 && R('j_roj_eulogy') === 2 && R('j_roj_bungus') === 1 && R('j_roj_snake_eyes') === 1 && R('j_roj_daisy') === 2 && R('j_roj_kjaro') === 2
    && R('j_roj_duplicator') === 3 && R('j_roj_happiest_mask') === 3 && R('j_roj_benthic') === 3 && R('j_roj_encrusted') === 1 && R('j_roj_executive_card') === 2, 'rarities as the mod');
  const C = (k) => P_CENTERS[k].cost;
  ok(C('j_roj_egocentrism') === 4 && C('j_roj_eulogy') === 5 && C('j_roj_bungus') === 6 && C('j_roj_duplicator') === 10 && C('j_roj_happiest_mask') === 9 && C('j_roj_benthic') === 8 && C('v_roj_3d_printer') === 10, 'costs as the mod');
  ok(!P_CENTERS.j_roj_encrusted.eternal_compat && !P_CENTERS.j_roj_eulogy.blueprint_compat, 'compat flags');
  ok(JSON.stringify(P_CENTERS.v_roj_militech_printer.requires) === '["v_roj_3d_printer"]', 'Mili-Tech requires 3D Printer');
  const B = (k) => P_BLINDS[k];
  ok(B('bl_roj_loop').dollars === 5 && B('bl_roj_loop').mult === 2 && B('bl_roj_loop').boss.min === 1 && !B('bl_roj_loop').boss.showdown, 'The Loop data');
  ok(B('bl_roj_final_hammer').boss.showdown && B('bl_roj_final_crab').boss.showdown && B('bl_roj_final_crab').dollars === 8, 'showdown finishers');
  G.FORCE_BOSS = null;
  const seen = new Set();
  G.GAME.round_resets.ante = 8;
  for (let i = 0; i < 400; i++) seen.add(get_new_boss());
  ok(seen.has('bl_roj_final_hammer') || seen.has('bl_roj_final_crab'), 'on: a RoJ finisher can be drawn at ante 8', [...seen]);
}

// =================================================================== Egocentrism
{
  run('EGO');
  const ego = add('j_roj_egocentrism');
  const jk = add('j_joker', 'foil');
  ok(ego.ability.extra === 40, 'Egocentrism +40');
  const r = act({ type: 'select_blind' });
  clearHand();
  flush();
  ok(G.jokers.cards.length === 2 && G.jokers.cards.every((c) => key(c) === 'j_roj_egocentrism'), 'blind selected: the Joker became an Egocentrism', G.jokers.cards.map(key));
  ok(!jk.area && G.jokers.cards[1].edition && G.jokers.cards[1].edition.foil, 'the copy keeps the converted joker\'s edition');
  ok(msgs(r.events).includes('Converted!'), 'Converted! message');
  const d = describe(ego);
  ok(d.lines.some((l) => l.includes('+80')), 'describe: currently +80 Chips', d.lines);
  const { total } = play(hand(['S_A']));
  // High Card: 5 + 11 = 16; Ego 1: +80; foil +50, Ego 2: +80 -> 226 x1
  ok(total.chips === 226 && total.mult === 1, 'Egocentrism: +40 per Egocentrism each', total);
  // no more convertables: nothing happens next blind
  nextRound();
  ok(G.jokers.cards.length === 2, 'nothing left to convert');
}

// =================================================================== Eulogy Zero
{
  run('EULOGY');
  select();
  add('j_roj_eulogy');
  G.GAME.probabilities.normal = 2; // 2 in 2
  toShop();
  ok(G.STATE === STATES.SHOP, 'in shop');
  const sc = G.shop_jokers.cards;
  ok(sc.length > 0 && sc.every((c) => c.ability.eulogyed && c.facing === 'back'), 'Eulogy: shop cards flipped', sc.map((c) => c.facing));
  const c = sc[0];
  const half = c.cost;
  c.ability.eulogyed = undefined; c.set_cost(); const full = c.cost; c.ability.eulogyed = true; c.set_cost();
  ok(half === Math.floor(full * 0.5) && c.cost === half, 'Eulogy: half price', { half, full });
  G.GAME.dollars = 100;
  const d0 = G.GAME.dollars;
  ok(act({ type: 'buy', id: c.sort_id }).ok, 'buy a flipped card');
  ok(c.facing === 'front' && G.GAME.dollars === d0 - half, 'bought card faces up; paid half', { f: c.facing, paid: d0 - G.GAME.dollars });
  ok(c.sell_cost === Math.max(1, Math.floor(half / 2)), 'sell value from the halved price');
  // vouchers / boosters are not shop "cards" here
  ok(!G.shop_booster.cards.some((x) => x.ability.eulogyed) && !G.shop_vouchers.cards.some((x) => x.ability.eulogyed), 'boosters/vouchers untouched');
  // 0 in 2: nothing
  G.GAME.probabilities.normal = 0;
  act({ type: 'reroll_shop' });
  ok(G.shop_jokers.cards.every((x) => !x.ability.eulogyed && x.facing === 'front'), 'Eulogy roll fails -> normal cards');
  ok(describe(G.jokers.cards[0]).lines.join(' ').includes('0 in 2'), 'Eulogy describe', describe(G.jokers.cards[0]).lines);
}

// =================================================================== Bustling Fungus
{
  run('BUNGUS');
  select();
  const l = add('j_joker');
  const b = add('j_roj_bungus');
  const r = add('j_greedy_joker', 'holo');
  const seen = [];
  for (let i = 1; i <= 5; i++) {
    win();
    seen.push(b.ability.bungus_rounds);
    if (i < 5) ok(!l.edition, `Fungus: no foil after ${i} rounds`);
    if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
    act({ type: 'next_round' });
    select();
  }
  ok(seen.join() === '1,2,3,4,5', 'Fungus counts rounds', seen);
  ok(l.edition && l.edition.foil, 'after 5 rounds the left joker is Foil');
  ok(r.edition && r.edition.holo && !r.edition.foil, 'the right joker keeps its edition');
  const r6 = win();
  ok(b.ability.bungus_rounds === 6 && !msgs(r6.events).some((m) => /\//.test(m)), 'after 5 no more messages');
  ok(describe(b).lines.some((l2) => l2.includes('6/5') || l2.includes('(Currently')), 'Fungus describe');
}

// =================================================================== Snake Eyes (+ fix 4)
{
  run('SNAKE');
  select();
  const s = add('j_roj_snake_eyes');
  ok(s.ability.extra.mult === 2 && s.ability.extra.mult_mod === 6, 'Snake Eyes 2 / +6');
  let t = play(hand(['S_A'])).total;
  ok(t.mult === 3, 'Snake Eyes: +2 Mult', t);
  G.GAME.probabilities.normal = 0; // the Wheel always fails
  const w = add_joker('c_wheel_of_fortune'); flush();
  clearHand();
  const u = act({ type: 'use', id: w.sort_id });
  flush();
  ok(u.ok && s.ability.extra.mult === 8, 'Wheel of Fortune Nope! -> +6 Mult', s.ability.extra.mult);
  ok(msgs(u.events).includes('Upgrade!'), 'Upgrade! message');
  clearHand();
  t = play(hand(['S_A'])).total;
  ok(t.mult === 9, 'Snake Eyes: +8 Mult', t);
  // fix 4: a Blueprint copying Snake Eyes does not make it scale twice
  const bp = add_joker('j_blueprint'); flush();
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp); G.jokers.set_ranks();
  const w2 = add_joker('c_wheel_of_fortune'); flush();
  act({ type: 'use', id: w2.sort_id }); flush();
  ok(s.ability.extra.mult === 14, 'fix 4: one Nope! = +6 even with Blueprint (Lua: +12)', s.ability.extra.mult);
  clearHand();
  t = play(hand(['S_A'])).total;
  ok(t.mult === 29, 'Blueprint copies the +14 Mult', t);
  // a successful Wheel does nothing
  G.GAME.probabilities.normal = 1000;
  const w3 = add_joker('c_wheel_of_fortune'); flush();
  act({ type: 'use', id: w3.sort_id }); flush();
  ok(s.ability.extra.mult === 14, 'successful Wheel: no upgrade');
}

// =================================================================== Lepton Daisy
{
  run('DAISY');
  select();
  add('j_roj_daisy');
  const cards = hand(['H_K', 'S_K', 'C_2', 'D_3']);
  cards[2].set_debuff(true); cards[3].set_debuff(true);
  const t = play(cards).total;
  // Pair 10 x2; K+K 20 -> 30; +50 x 2 debuffed -> 130 x 2
  ok(t.chips === 130 && t.mult === 2, 'Lepton Daisy: +50 Chips per debuffed card in the played hand', t);
  clearHand();
  const t2 = play(hand(['H_K', 'S_K'])).total;
  ok(t2.chips === 30, 'no debuffed cards: nothing', t2);
}

// =================================================================== Kjaro's Band
{
  run('KJARO');
  select();
  const k = add('j_roj_kjaro');
  ok(describe(k).lines.join(' ').includes('not enough chips'), 'Kjaro describe: not enough chips');
  let t = play(hand(['S_A'])).total;
  ok(t.mult === 1, 'Kjaro inactive at first', t);
  // win with 4x the required chips
  G.GAME.chips = G.GAME.blind.chips * 4; clearHand();
  const w = play(hand(['S_2']), { keepChips: true });
  ok(k.ability.enabled === true && msgs(w.events).includes('Active!'), 'X4 chips -> Active!');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  ok(describe(k).lines.join(' ').includes('active'), 'Kjaro describe: active', describe(k).lines);
  t = play(hand(['S_A'])).total;
  ok(t.mult === 4 && t.chips === 16, 'Kjaro: X4 Mult', t);
  // a normal win switches it off
  win();
  ok(k.ability.enabled === false, 'less than X4 -> off');
}

// =================================================================== Substandard Duplicator (+ Temporary, fix 1)
{
  run('DUPE');
  select();
  const d = add('j_roj_duplicator');
  ok(G.jokers.cards.length === 1, 'the Duplicator does not copy itself');
  const g = add('j_gift');
  ok(G.jokers.cards.length === 3, 'gaining a joker makes a copy', G.jokers.cards.map(key));
  const tmp = G.jokers.cards[2];
  ok(key(tmp) === 'j_gift' && tmp.ability.temporary && tmp.edition && tmp.edition.negative && !tmp.ability.eternal, 'copy: Negative, Temporary');
  ok(tmp.sell_cost === 0, 'Temporary: no sell value');
  ok(G.jokers.config.card_limit === 6, 'the Negative copy takes no slot');
  const db = describe(tmp);
  ok(db.badges.some((b) => b.key === 'temporary') && db.info.some((i) => i.key === 'temporary'), 'Temporary badge + tooltip');
  // fix 1: a debuff lifting is not "gaining" a joker
  g.set_debuff(true); g.set_debuff(false); flush();
  ok(G.jokers.cards.length === 3, 'fix 1: un-debuffing a joker does not copy it again (Lua: it did)', G.jokers.cards.map(key));
  // the copy is not copied (Temporary)
  // end of round: the Temporary copy breaks without acting (no second Gift Card bonus)
  const w = win();
  flush();
  ok(!G.jokers.cards.includes(tmp) && msgs(w.events).includes('Broken!'), 'Temporary joker broken at end of round');
  ok(d.ability.extra_value === 1, 'the Temporary Gift Card did not act (only +1 sell value)', d.ability.extra_value);
}

// =================================================================== Happiest Mask (fix 2)
{
  run('MASK');
  select();
  const m = add('j_roj_happiest_mask');
  G.GAME.probabilities.normal = 2; // 2 in 2
  const j = add('j_joker');
  j.start_dissolve(); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'a destroyed joker -> a Spectral');
  // a destroyed playing card
  const pc = G.playing_cards[0];
  pc.start_dissolve(); flush();
  ok(G.consumeables.cards.length === 2, 'a destroyed playing card -> a Spectral');
  // no room
  const j2 = add('j_joker'); j2.start_dissolve(); flush();
  ok(G.consumeables.cards.length === 2, 'must have room');
  // sold / used are not destroyed
  act({ type: 'sell', id: G.consumeables.cards[0].sort_id }); flush();
  ok(G.consumeables.cards.length === 1, 'selling a card: no Spectral');
  const j3 = add('j_joker');
  act({ type: 'sell', id: j3.sort_id }); flush();
  ok(G.consumeables.cards.length === 1, 'selling a joker: no Spectral');
  const pl = add_joker('c_pluto'); flush();
  ok(G.consumeables.cards.length === 2, 'pluto added');
  act({ type: 'use', id: pl.sort_id }); flush();
  ok(G.consumeables.cards.length === 1, 'using a consumable: no Spectral', G.consumeables.cards.map(key));
  // fix 2: a debuffed joker is not destroyed
  const j4 = add('j_joker');
  j4.set_debuff(true); j4.set_debuff(false); flush();
  ok(G.consumeables.cards.length === 1, 'fix 2: debuffing a joker is not "destroyed" (Lua: a Spectral)', G.consumeables.cards.length);
  // 0 in 2
  G.GAME.probabilities.normal = 0;
  j4.start_dissolve(); flush();
  ok(G.consumeables.cards.length === 1, '0 in 2: nothing');
  ok(describe(m).lines.join(' ').includes('0 in 2'), 'Happiest describe');
}

// =================================================================== Benthic Bloom (+ fix 7)
{
  run('BENTHIC', { mods: ['riskofjesters', 'rojtest'] });
  select();
  add('j_roj_benthic');
  const c = add('j_joker', 'foil');
  G.GAME.blind.boss = true;
  const w = win(); flush();
  const nw = G.jokers.cards.find((x) => key(x) !== 'j_roj_benthic');
  ok(!c.area && nw && nw.config.center.rarity === 2 && nw.edition && nw.edition.foil, 'Boss defeated: Common -> Uncommon, edition kept', nw && [key(nw), nw.config.center.rarity]);
  ok(msgs(w.events).includes('Upgrade!'), 'Upgrade! message');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  // not on a non-boss blind
  win(); flush();
  ok(G.jokers.cards.length === 2 && G.jokers.cards.includes(nw), 'no upgrade on a non-boss blind');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  // Rare -> Legendary
  nw.remove(); flush();
  const rare = add('j_baron');
  G.GAME.blind.boss = true; win(); flush();
  const leg = G.jokers.cards.find((x) => key(x) !== 'j_roj_benthic');
  ok(!rare.area && leg && leg.config.center.rarity === 4, 'Rare -> Legendary', leg && key(leg));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  // Legendary and string-rarity jokers are not upgradable (fix 7: no crash)
  const odd = add('j_rt_odd');
  G.GAME.blind.boss = true; win(); flush();
  ok(odd.area === G.jokers && leg.area === G.jokers, 'Legendary / string-rarity jokers are left alone');
}

// =================================================================== Encrusted Key (+ fix 5)
{
  run('KEY');
  select();
  const k = add('j_roj_encrusted');
  win(); flush();
  ok(k.area === G.jokers && G.GAME.tags.length === 0, 'not on a non-boss blind');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  G.GAME.blind.boss = true; win(); flush();
  ok(!k.area && G.GAME.tags.filter((t) => t.key === 'tag_coupon').length === 1, 'Boss: destroyed, +1 Coupon Tag');
  ok(describeCenter('j_roj_encrusted').lines.join(' ').includes('Coupon Tag'), 'Encrusted describe');
  // fix 5: Blueprint copying it gives one extra tag
  act({ type: 'cash_out' }); act({ type: 'next_round' }); select();
  const tags0 = G.GAME.tags.length;
  const bp = add('j_blueprint');
  const k2 = add('j_roj_encrusted');
  G.GAME.blind.boss = true; win(); flush();
  ok(!k2.area && bp.area === G.jokers && G.GAME.tags.length === tags0 + 2, 'fix 5: Blueprint + Key = 2 Coupon Tags, Key destroyed once (Lua: 1)', G.GAME.tags.length - tags0);
}

// =================================================================== Executive Card + 3D / Mili-Tech Printer
{
  run('EXEC');
  select();
  const e = add('j_roj_executive_card');
  ok(e.ability.executive_remaining === 6, 'Executive: 6 to go');
  toShop();
  const counts = [];
  for (let i = 1; i <= 7; i++) {
    const r = buyFromShop('p_arcana_normal_1', G.shop_booster);
    if (!r.ok) { ok(false, 'buy booster', r); break; }
    counts.push([G.GAME.pack_size, G.GAME.pack_choices, e.ability.executive_remaining]);
    act({ type: 'skip_booster' });
  }
  ok(JSON.stringify(counts.slice(0, 6).map((c) => c[2])) === '[5,4,3,2,1,0]', 'Executive counts down', counts);
  ok(counts[6][1] === 3 && counts[6][0] === 3 && counts[6][2] === 6, '7th pack: choose all 3, then the count restarts', counts[6]);
  ok(counts[5][1] === 1, '6th pack: still choose 1');
  // 3D Printer: +1 card
  ok(buyFromShop('v_roj_3d_printer', G.shop_vouchers).ok && G.GAME.used_vouchers.v_roj_3d_printer, 'redeem 3D Printer');
  const bd = G.shop_booster.cards[0] ? describe(G.shop_booster.cards[0]) : null;
  buyFromShop('p_arcana_normal_1', G.shop_booster);
  ok(G.GAME.pack_size === 4 && G.pack_cards.cards.length === 4 && G.GAME.pack_choices === 1, '3D Printer: 4 cards, choose 1', [G.GAME.pack_size, G.pack_cards.cards.length, G.GAME.pack_choices]);
  act({ type: 'skip_booster' });
  ok(buyFromShop('v_roj_militech_printer', G.shop_vouchers).ok, 'redeem Mili-Tech Printer');
  buyFromShop('p_buffoon_normal_1', G.shop_booster);
  ok(G.GAME.pack_size === 3 && G.GAME.pack_choices === 2, 'Mili-Tech: Buffoon 2+1 cards, choose 2', [G.GAME.pack_size, G.GAME.pack_choices]);
  act({ type: 'skip_booster' });
  const pk = create_card('Booster', G.shop_booster, null, null, null, null, 'p_arcana_mega_1', 't'); G.shop_booster.emplace(pk);
  const dl = describe(pk).lines.join(' ');
  ok(dl.includes('{C:attention}3{}') && dl.includes('{C:attention}6'),'pack description shows choose 2+1 of 5+1', dl);
  ok(bd === null || bd.lines.join(' ').length > 0, 'booster describe');
  ok(describe(e).lines.join(' ').includes('remaining') || describe(e).lines.join(' ').includes('Active'), 'Executive describe', describe(e).lines);
}

// =================================================================== The Loop
{
  run('LOOP', { boss: 'bl_roj_loop' });
  for (const k of ['j_joker', 'j_greedy_joker', 'j_lusty_joker']) add(k);
  toBoss();
  ok(G.GAME.blind.name === 'The Loop', 'fighting The Loop');
  const deb = () => G.jokers.cards.filter((c) => c.debuff).length;
  play(hand(['S_2'])); clearHand();
  ok(deb() === 0, 'after 1 hand: no joker disabled');
  play(hand(['S_3']));
  ok(deb() === 1, 'after 2 hands: one random joker disabled', deb());
  clearHand();
  play(hand(['S_4']));
  ok(deb() === 1, 'still exactly one after the 3rd hand');
  G.GAME.blind.disable();
  ok(deb() === 0, 'disabled: jokers back');
  ok(describeBlind('bl_roj_loop').lines.join(' ') === '', 'live disabled blind: no text');
}

// =================================================================== The Void (+ fix 3)
{
  run('VOID', { boss: 'bl_roj_void' });
  const jk = add('j_joker');
  const egg = add('j_egg');
  const key2 = add('j_roj_encrusted');
  toBoss();
  ok(G.GAME.blind.name === 'The Void', 'fighting The Void');
  const w = win(); flush();
  ok(jk.sell_cost === 0 && egg.sell_cost === 0, 'The Void: every joker sells for 0', [jk.sell_cost, egg.sell_cost]);
  ok(msgs(w.events).filter((m) => m === 'Voided!').length === 2, 'Voided! on each joker', msgs(w.events));
  ok(!key2.area && G.GAME.tags.some((t) => t.key === 'tag_coupon'), 'fix 3: jokers still act at the end of The Void (Lua: the Key never fired)');
  jk.set_cost();
  ok(jk.sell_cost === 0, 'fix 3: a later set_cost keeps the 0 (Lua: price came back)');
  ok(egg.ability.extra_value + Math.max(1, Math.floor(egg.cost / 2)) === 0, 'Egg sells for 0 after its own +3');
}

// =================================================================== Glaucous Hammer (+ fix 6)
{
  run('HAMMER', { boss: 'bl_roj_final_hammer' });
  toBoss();
  ok(G.GAME.blind.name === 'Glaucous Hammer', 'fighting Glaucous Hammer');
  const n = G.playing_cards.filter((c) => c.debuff).length;
  ok(n === 26 && G.playing_cards.filter((c) => c.ability.hammered).length === 26, 'half the deck (26) debuffed', n);
  G.GAME.blind.set_blind(P_BLINDS.bl_roj_final_hammer);
  ok(G.playing_cards.filter((c) => c.debuff).length === 26, 'fix 6: a second Glaucous Hammer debuffs a fresh half, not more (Lua: up to 52)', G.playing_cards.filter((c) => c.debuff).length);
  G.GAME.blind.disable();
  ok(G.playing_cards.filter((c) => c.debuff).length === 0, 'disabled: no debuffs');
}

// =================================================================== Tyrian Crab
{
  run('CRAB', { boss: 'bl_roj_final_crab' });
  toBoss();
  ok(G.GAME.blind.name === 'Tyrian Crab', 'fighting Tyrian Crab');
  const base = G.GAME.blind.chips;
  G.GAME.chips = 0;
  play(hand(['S_2']), { keepChips: true });
  ok(G.GAME.blind.chips === Math.floor(base * 1.5), 'X1.5 required chips after a hand', [base, G.GAME.blind.chips]);
  const after1 = G.GAME.blind.chips;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'discard' });
  ok(G.GAME.blind.chips === after1, 'a discard does not raise it');
  clearHand();
  play(hand(['S_3']), { keepChips: true });
  ok(G.GAME.blind.chips === Math.floor(after1 * 1.5), 'again after the 2nd hand');
  G.GAME.blind.disable();
  ok(G.GAME.blind.chips === base, 'disabled: back to the base target', [G.GAME.blind.chips, base]);
}

// =================================================================== copies restart counters
{
  run('COPY');
  select();
  const b = add('j_roj_bungus'); b.ability.bungus_rounds = 3;
  const x = add('j_roj_executive_card'); x.ability.executive_remaining = 2;
  const k = add('j_roj_kjaro'); k.ability.enabled = true;
  const inv = add('j_invisible');
  const { copy_card } = await import('../../js/engine/core.js');
  ok(copy_card(b).ability.bungus_rounds === 0 && copy_card(x).ability.executive_remaining === 6 && copy_card(k).ability.enabled === false, 'copies restart Fungus / Executive / Kjaro');
  ok(inv, 'ok');
}

// =================================================================== describe: every text filled
{
  run('DESC');
  select();
  for (const k of STATUS.jokers) {
    const c = add(k);
    const d = describe(c);
    ok(d.name && d.lines.length && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d.lines);
    const dc = describeCenter(k);
    ok(dc.lines.length && !dc.lines.some((l) => NOFILL.test(l)), `describeCenter ${k}`, dc.lines);
    c.remove();
  }
  for (const k of STATUS.vouchers) { const d = describeCenter(k); ok(d.lines.length && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d.lines); }
  for (const k of STATUS.blinds) { const d = describeBlind(k); ok(d.name && d.lines.length === 2 && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d); }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
