// Sylvie's Silliness 0.11 (micatro/mods/sylviesilly): mod off = none of its content; every deck,
// blind, booster, moon, the Bloom spectral and both vouchers fired through real act() plays with
// exact values; the 7 intended-design fixes; describe() text.
//   node micatro/tests/mods/sylviesilly_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, P_BLINDS, P_CENTER_POOLS, add_joker, create_playing_card, create_card, get_new_boss } from '../../js/engine/core.js';
import { newRun, act, STATES } from '../../js/engine/run.js';
import { ACTIVE } from '../../js/mods/registry.js';
import { describe, describeCenter, describeBlind, describeBack } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/sylviesilly/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const NOFILL = /#\d+#/;

function run(seed, { boss = 'bl_wall', mods = ['sylviesilly'], back = 'b_red' } = {}) {
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
function win(cards) { G.GAME.chips = G.GAME.blind.chips; if (!cards) { clearHand(); cards = hand(['S_2']); } return play(cards, { keepChips: true }); }
function toShop() { if (G.STATE === STATES.SELECTING_HAND) win(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); }
function toBoss() {
  // Skip Small and Big (a skip tag may open a pack: skip it), then select the boss.
  for (let i = 0; i < 10 && G.STATE !== STATES.SELECTING_HAND; i++) {
    if (G.STATE === STATES.BLIND_SELECT) { if (G.GAME.blind_on_deck !== 'Boss') act({ type: 'skip_blind' }); else act({ type: 'select_blind' }); }
    else act({ type: 'skip_booster' });
  }
}
function buyFromShop(centerKey, area) {
  const c = create_card(P_CENTERS[centerKey].set, area, null, null, null, null, centerKey, 'test');
  area.emplace(c);
  G.GAME.dollars = 1000;
  return act({ type: 'buy', id: c.sort_id });
}
const use = (c) => act({ type: 'use', id: c.sort_id, targets: [] });
/** Only this card in hand (the rest go back to the deck). */
const solo = (c) => { for (const x of G.hand.cards.slice()) if (x !== c) { G.hand.remove_card(x); G.deck.emplace(x); } G.hand.highlighted.length = 0; if (c.area !== G.hand) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); } return [c]; };
const fromDeck = (k) => { const c = G.deck.cards.find((x) => x.config.card.key === k); G.deck.remove_card(c); G.hand.emplace(c); return c; };

// =================================================================== off / on
{
  run('SYOFF', { mods: [] });
  ok(ACTIVE.length === 0, 'no mods');
  const all = Object.values(P_CENTER_POOLS).flat();
  ok(!all.some((c) => c && c.mod === 'sylviesilly'), 'off: nothing of the mod in any pool');
  G.FORCE_BOSS = null;
  const seen = new Set();
  for (let a = 1; a <= 10; a++) { G.GAME.round_resets.ante = a; for (let i = 0; i < 30; i++) seen.add(get_new_boss()); }
  ok(![...seen].some((k) => k.startsWith('bl_sylvie')), 'off: no Sylvie boss is ever drawn');
  ok(P_CENTERS.m_bonus.config.bonus === 30 && P_CENTERS.m_gold.config.h_dollars === 3, 'off: base enhancement values');
}
{
  run('SYON');
  ok(ACTIVE.join() === 'sylviesilly', 'on');
  ok(STATUS.decks.length === 4 && STATUS.blinds.length === 6 && STATUS.boosters.length === 8 && STATUS.moons.length === 8 && STATUS.spectrals.length === 1 && STATUS.vouchers.length === 2, 'inventory 4/6/8/8/1/2', STATUS);
  ok(STATUS.moons.every((k) => P_CENTER_POOLS.Planet.some((c) => c.key === k)), 'moons are Planets in the pool');
  ok(P_CENTER_POOLS.Spectral.some((c) => c.key === 'c_sylvie_bloom'), 'Bloom pooled');
  ok(STATUS.boosters.every((k) => P_CENTER_POOLS.Booster.some((c) => c.key === k)), 'packs pooled');
  ok(STATUS.vouchers.every((k) => P_CENTER_POOLS.Voucher.some((c) => c.key === k)), 'vouchers pooled');
  const p = (k) => P_CENTERS[k];
  ok(p('p_sylvie_suit_mega').config.extra === 5 && p('p_sylvie_suit_mega').config.choose === 2 && p('p_sylvie_suit_mega').cost === 9 && p('p_sylvie_suit_mega').weight === 0.25, 'Mega Suits 5 / 2, $9, weight 0.25');
  ok(p('p_sylvie_bonus_jumbo').cost === 7 && p('p_sylvie_bonus_jumbo').weight === 0.75 && p('p_sylvie_fortune_normal').cost === 5, 'pack costs / weights');
  ok(p('c_sylvie_europa').cost === 3 && p('c_sylvie_bloom').cost === 4 && p('v_sylvie_stamper').cost === 10, 'consumable / voucher costs');
  ok(JSON.stringify(p('v_sylvie_seal_deal').requires) === '["v_sylvie_stamper"]', 'Seal the Deal requires Stamper');
  ok(P_BLINDS.bl_sylvie_pathway.boss.min === 1 && P_BLINDS.bl_sylvie_prospector.boss.min === 2 && P_BLINDS.bl_sylvie_frost.dollars === 5 && P_BLINDS.bl_sylvie_frost.mult === 2, 'blind data');
  G.FORCE_BOSS = null;
  const seen = new Set();
  G.GAME.round_resets.ante = 3;
  for (let i = 0; i < 300; i++) seen.add(get_new_boss());
  ok(STATUS.blinds.every((k) => seen.has(k)), 'on: every Sylvie boss can be drawn', [...seen].filter((k) => k.startsWith('bl_sylvie')));
}

// =================================================================== decks
{
  run('LLD', { back: 'b_sylvie_lemonlime' });
  ok(G.GAME.round_resets.discards === 2, 'Lemon-Lime: -1 discard', G.GAME.round_resets.discards);
  const S = (v) => [...new Set(G.playing_cards.filter((c) => c.base.value === v).map((c) => c.base.suit))].join();
  ok(S('Ace') === 'Spades' && S('10') === 'Spades' && S('6') === 'Spades', 'A/10/6 -> Spades');
  ok(S('King') === 'Hearts' && S('9') === 'Hearts' && S('5') === 'Hearts', 'K/9/5 -> Hearts');
  ok(S('Queen') === 'Clubs' && S('8') === 'Clubs' && S('4') === 'Clubs', 'Q/8/4 -> Clubs');
  ok(S('Jack') === 'Diamonds' && S('7') === 'Diamonds' && S('3') === 'Diamonds', 'J/7/3 -> Diamonds');
  const twos = G.playing_cards.filter((c) => c.base.value === '2');
  ok(twos.every((c) => key(c) === 'm_wild') && twos.map((c) => c.seal).join() === 'Red,Blue,Gold,Purple', "the 2's: Wild, Red/Blue/Gold/Purple Seals", twos.map((c) => c.seal));
}
{
  run('AURORA', { back: 'b_sylvie_aurora' });
  ok(G.GAME.round_resets.hands === 3 && G.jokers.config.card_limit === 4, 'Aurora: -1 hand, -1 joker slot');
  ok(G.consumeables.cards.map(key).join() === 'c_aura', 'Aurora: starts with Aura');
  ok(G.GAME.used_vouchers.v_hone && G.GAME.used_vouchers.v_glow_up && G.GAME.edition_rate === 4, 'Aurora: Hone + Glow Up');
  ok(G.GAME.starting_params.auroramodifier === true, 'aurora modifier');
  select(); toShop();
  let n = 0, ed = 0, enh = 0, enhEd = 0;
  for (let i = 0; i < 6; i++) {
    buyFromShop('p_standard_jumbo_1', G.shop_booster);
    for (const c of G.pack_cards.cards) { n++; if (c.edition) ed++; if (c.ability.set === 'Enhanced') { enh++; if (c.edition) enhEd++; } }
    act({ type: 'skip_booster' });
  }
  ok(n === 30 && ed === n, 'Aurora: every Standard pack card is Special', { n, ed });
  ok(enh > 0 && enhEd === enh, 'fix 5: Enhanced pack cards too (Lua: only unenhanced)', { enh, enhEd });
  const pc = create_playing_card({ front: P_CARDS.S_A }, G.hand);
  pc.set_edition({ holo: true }); pc.set_edition(null);
  ok(pc.edition && (pc.edition.foil || pc.edition.holo || pc.edition.polychrome), 'set_edition(nil) on a playing card rolls an edition');
  const jk = add('j_joker'); jk.set_edition(null);
  ok(!jk.edition, 'jokers are not touched by the Aurora roll');
  // copy_card passes {} (not nil): a copy keeps having no edition
  const { copy_card } = await import('../../js/engine/core.js');
  const plain = create_playing_card({ front: P_CARDS.S_K }, null); plain.edition = null;
  ok(!copy_card(plain).edition, 'copy_card: no Aurora roll (Lua passes {})');
}
{
  run('SULFUR', { back: 'b_sylvie_sulfur' });
  ok(G.consumeables.cards.map(key).join() === 'c_death', 'Sulfur: starts with Death');
  ok(G.GAME.used_vouchers.v_overstock_norm && G.GAME.shop.joker_max === 3, 'Sulfur: Overstock');
  ok(G.GAME.joker_rate === 4, 'fix 1: Sulfur joker rate 4 (Lua: stayed 20)', G.GAME.joker_rate);
}
{
  run('HALLOW', { back: 'b_sylvie_hallowed' });
  ok(G.GAME.tarot_rate === 0 && G.GAME.planet_rate === 0 && G.GAME.playing_card_rate === 10 && G.GAME.used_vouchers.v_magic_trick, 'Hallowed: no Tarots/Planets, Magic Trick; fix 7: playing cards 10 (Lua: Magic Trick sets 4)', G.GAME.playing_card_rate);
  select(); toShop();
  let sets = new Set();
  for (let i = 0; i < 15; i++) { for (const c of G.shop_jokers.cards) sets.add(c.ability.set); G.GAME.dollars = 1000; act({ type: 'reroll_shop' }); }
  ok(!sets.has('Tarot') && !sets.has('Planet') && (sets.has('Default') || sets.has('Enhanced')), 'Hallowed shop: playing cards, no Tarots/Planets', [...sets]);
}
for (const k of STATUS.decks) { const d = describeBack(k); ok(d && d.lines.length >= 3 && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d); }

// =================================================================== blinds
function bossWithEnh(seed, boss) {
  run(seed, { boss });
  const enh = ['m_stone', 'm_gold', 'm_steel', 'm_glass', 'm_mult', 'm_bonus', 'm_wild', 'm_lucky'];
  const map = {};
  enh.forEach((e, i) => { const c = G.playing_cards[i * 3]; c.set_ability(P_CENTERS[e]); map[e] = c; });
  toBoss();
  return map;
}
{
  const m = bossWithEnh('PROS', 'bl_sylvie_prospector');
  ok(G.GAME.blind.name === 'The Prospector', 'fighting The Prospector');
  ok(['m_stone', 'm_gold', 'm_steel', 'm_glass'].every((e) => m[e].debuff) && ['m_mult', 'm_bonus', 'm_wild', 'm_lucky'].every((e) => !m[e].debuff), 'Prospector: Stone/Gold/Steel/Glass debuffed');
  ok(G.playing_cards.filter((c) => c.debuff).length === 4, 'only those');
  G.GAME.blind.disable();
  ok(!G.playing_cards.some((c) => c.debuff), 'disabled: none');
}
{
  const m = bossWithEnh('GAMB', 'bl_sylvie_gambler');
  ok(['m_mult', 'm_bonus', 'm_wild', 'm_lucky'].every((e) => m[e].debuff) && ['m_stone', 'm_gold', 'm_steel', 'm_glass'].every((e) => !m[e].debuff), 'Gambler: Mult/Bonus/Wild/Lucky debuffed');
}
{
  run('PATH', { boss: 'bl_sylvie_pathway' }); toBoss();
  const bad = G.playing_cards.filter((c) => c.debuff !== [6, 7, 8, 9, 10].includes(c.get_id()));
  ok(G.GAME.blind.name === 'The Pathway' && bad.length === 0 && G.playing_cards.filter((c) => c.debuff).length === 20, 'Pathway: all 6-10 debuffed (20)');
}
{
  run('BACK', { boss: 'bl_sylvie_backside' }); toBoss();
  const bad = G.playing_cards.filter((c) => c.debuff !== [14, 2, 3, 4, 5].includes(c.get_id()));
  ok(bad.length === 0 && G.playing_cards.filter((c) => c.debuff).length === 20, 'Backside: all A-5 debuffed (20)');
}
for (const [boss, list, name] of [['bl_sylvie_heatwave', [2, 4, 6, 8, 10], 'Heatwave'], ['bl_sylvie_frost', [14, 3, 5, 7, 9], 'Frost']]) {
  run('HF' + name, { boss }); toBoss();
  const hc = G.hand.cards;
  ok(hc.length === 8 && hc.every((c) => (c.facing === 'back') === list.includes(c.get_id())), `${name}: exactly those cards drawn face down`, hc.map((c) => [c.get_id(), c.facing]));
  ok(hc.some((c) => c.facing === 'back') || !hc.some((c) => list.includes(c.get_id())), `${name}: some face down`);
  G.GAME.blind.disable();
  ok(G.hand.cards.every((c) => c.facing === 'front') && !G.playing_cards.some((c) => c.ability.wheel_flipped), `${name} disabled: all face up`);
}
run('DESCB');
for (const k of STATUS.blinds) { const d = describeBlind(k); ok(d.name && d.lines.length === 2 && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d); }

// =================================================================== themed packs
{
  run('PACKS');
  select(); toShop();
  const P = STATUS.PACK_POOLS;
  const SOUL = ['c_soul', 'c_black_hole'];
  for (const pk of STATUS.boosters) {
    const theme = P_CENTERS[pk].theme;
    const allowed = new Set([...P[theme].TarotPlanet, ...(P[theme].Joker || []), ...P[theme].Spectral, ...SOUL]);
    let okAll = true, cats = { tp: 0, sp: 0, j: 0, pc: 0 }, n = 0, uniq = true;
    for (let i = 0; i < 12; i++) {
      const r = buyFromShop(pk, G.shop_booster);
      if (!r.ok) { okAll = false; break; }
      if (i === 0) {
        ok(G.STATE === STATES.MOD_PACK_HAND && G.hand.cards.length > 0, `${pk}: opens with the hand drawn`);
        ok(G.GAME.pack_choices === P_CENTERS[pk].config.choose && G.pack_cards.cards.length === P_CENTERS[pk].config.extra, `${pk}: ${P_CENTERS[pk].config.extra} cards, choose ${P_CENTERS[pk].config.choose}`);
      }
      const keys = [];
      for (const c of G.pack_cards.cards) {
        n++;
        if (c.ability.set === 'Default' || c.ability.set === 'Enhanced') { cats.pc++; if (theme !== 'Bonus') okAll = false; continue; }
        keys.push(key(c));
        if (!allowed.has(key(c))) okAll = false;
        if (c.ability.set === 'Joker') cats.j++; else if (P[theme].Spectral.includes(key(c))) cats.sp++; else cats.tp++;
      }
      if (new Set(keys).size !== keys.length) uniq = false;
      act({ type: 'skip_booster' });
    }
    ok(okAll, `${pk}: every card from its themed pool`, cats);
    ok(uniq, `${pk}: no duplicates in one pack`);
    ok(cats.tp > n * 0.5 && (theme === 'Bonus' ? cats.pc > 0 && cats.j === 0 : cats.j > 0 && cats.pc === 0), `${pk}: ~75% Tarot/Planet, rest ${theme === 'Bonus' ? 'Enhanced cards' : 'Jokers'}`, cats);
  }
  // picking: a Joker from a Fortune pack goes to the jokers; a moon from a Suits pack is used
  let gotJoker = false, gotMoon = false;
  for (let i = 0; i < 20 && !(gotJoker && gotMoon); i++) {
    buyFromShop(i % 2 ? 'p_sylvie_fortune_jumbo' : 'p_sylvie_suit_jumbo', G.shop_booster);
    const j = G.pack_cards.cards.find((c) => c.ability.set === 'Joker');
    const moon = G.pack_cards.cards.find((c) => /^c_sylvie_(europa|io|callisto|ganymede)$/.test(key(c)));
    if (!gotJoker && j && G.jokers.cards.length < G.jokers.config.card_limit) { ok(act({ type: 'use', id: j.sort_id }).ok && j.area === G.jokers, 'pack Joker taken'); gotJoker = true; }
    else if (!gotMoon && moon) { const before = G.playing_cards.filter((c) => c.ability.perma_bonus).length; ok(act({ type: 'use', id: moon.sort_id }).ok && G.playing_cards.filter((c) => c.ability.perma_bonus).length > before, 'pack moon used'); gotMoon = true; }
    if (G.STATE !== STATES.SHOP) act({ type: 'skip_booster' });
  }
  ok(gotJoker && gotMoon, 'picked a Joker and a moon from themed packs');
  for (const pk of STATUS.boosters) { const d = describeCenter(pk); ok(d.lines.length === 2 && !d.lines.some((l) => NOFILL.test(l)) && d.lines[0].includes(String(P_CENTERS[pk].config.choose)), `describe ${pk}`, d.lines); }
}

// =================================================================== moons
{
  run('MOONS');
  select();
  const spadeA = fromDeck('S_A');
  const eu = add('c_sylvie_europa');
  ok(use(eu).ok, 'use Europa');
  flush();
  const spades = G.playing_cards.filter((c) => c.base.suit === 'Spades');
  ok(spades.length === 13 && spades.every((c) => c.ability.perma_bonus === 5) && G.playing_cards.filter((c) => c.ability.perma_bonus).length === 13, 'Europa: every Spade +5 Chips, nothing else');
  let t = play([spadeA]).total;
  ok(t.chips === 21, 'Europa: the Ace scores 5 + 11 + 5', t);
  for (const [m, suit] of [['c_sylvie_io', 'Clubs'], ['c_sylvie_callisto', 'Hearts'], ['c_sylvie_ganymede', 'Diamonds']]) {
    const c = add(m); use(c); flush();
    ok(G.playing_cards.filter((x) => x.base.suit === suit).every((x) => x.ability.perma_bonus === 5), `${P_CENTERS[m].name}: every ${suit} card +5`);
  }
  // Charon / Hydra / Titan / Euceladus: current and future cards
  clearHand();
  const b0 = hand(['S_5'], 'm_bonus')[0], m0 = hand(['S_6'], 'm_mult')[0], s0 = hand(['S_7'], 'm_stone')[0], g0 = hand(['S_8'], 'm_gold')[0];
  for (const k of ['c_sylvie_charon', 'c_sylvie_hydra', 'c_sylvie_titan', 'c_sylvie_euceladus']) { const c = add(k); ok(use(c).ok, 'use ' + k); flush(); }
  ok(b0.ability.bonus === 40, 'fix 2: Charon raises a CURRENT Bonus card to +40 (Lua: stayed 30)', b0.ability.bonus);
  ok(s0.ability.bonus === 60, 'fix 2: Titan raises a CURRENT Stone card to +60 (Lua: stayed 50)', s0.ability.bonus);
  ok(m0.ability.mult === 6 && g0.ability.h_dollars === 4, 'Hydra: current Mult card +6; Euceladus: current Gold card $4');
  const b1 = hand(['H_5'], 'm_bonus')[0], m1 = hand(['H_6'], 'm_mult')[0], s1 = hand(['H_7'], 'm_stone')[0], g1 = hand(['H_8'], 'm_gold')[0];
  ok(b1.ability.bonus === 40 && m1.ability.mult === 6 && s1.ability.bonus === 60 && g1.ability.h_dollars === 4, 'future cards: Bonus 40 / Mult 6 / Stone 60 / Gold $4');
  ok(describeCenter('m_bonus').lines.join(' ').includes('40'), 'Bonus card text shows +40');
  b0.set_ability(P_CENTERS.c_base);
  ok(b0.ability.bonus === 0, 'a Bonus card turned plain loses exactly the Bonus chips (no negative leftover)', b0.ability.bonus);
  t = play(solo(b1)).total;
  ok(t.chips === 5 + 5 + 40, 'Charon: a (new) Bonus 5 scores 5 + 5 + 40', t);
  t = play(solo(m1)).total;
  ok(t.mult === 1 + 6, 'Hydra: a Mult card gives +6 Mult', t);
  t = play(solo(s1)).total;
  ok(t.chips === 5 + 60, 'Titan: a Stone card scores 60', t);
  clearHand();
  const gHeld = hand(['C_8'], 'm_gold')[0];
  const d0 = G.GAME.dollars;
  win(hand(['C_2']));
  ok(G.GAME.dollars - d0 === 4, 'Euceladus: a held Gold card pays $4', G.GAME.dollars - d0);
  ok(gHeld.ability.h_dollars === 4 && G.GAME.sylvie_enh.gold === 1 && G.GAME.sylvie_enh.bonus === 10, 'fix 3: the upgrades are per-run state (G.GAME.sylvie_enh)', G.GAME.sylvie_enh);
  ok(describe(add('c_sylvie_charon')).badges[0].label === 'Moon', 'Moon badge');
  // fix 3: no leak into the next run
  run('MOONS2');
  ok(P_CENTERS.m_bonus.config.bonus === 30 && P_CENTERS.m_mult.config.mult === 4 && P_CENTERS.m_stone.config.bonus === 50 && P_CENTERS.m_gold.config.h_dollars === 3, 'fix 3: a new run starts from the base values');
  run('MOONS3', { mods: [] });
  ok(create_playing_card({ front: P_CARDS.S_5, center: P_CENTERS.m_bonus }).ability.bonus === 30, 'vanilla run after: Bonus +30');
  for (const k of STATUS.moons) { const d = describeCenter(k); ok(d.lines.length === 4 && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d.lines); }
}

// fix 4: during The Goad (Spades debuffed) Europa still upgrades every Spade
{
  run('GOAD', { boss: 'bl_goad' });
  toBoss();
  const sp = G.playing_cards.filter((c) => c.base.suit === 'Spades');
  ok(G.GAME.blind.name === 'The Goad' && sp.every((c) => c.debuff), 'The Goad debuffs the Spades');
  const eu = add('c_sylvie_europa');
  ok(use(eu).ok, 'use Europa during The Goad');
  flush();
  ok(sp.every((c) => c.ability.perma_bonus === 5), 'fix 4: debuffed Spades are upgraded too (Lua: none were)', sp.map((c) => c.ability.perma_bonus || 0));
}

// =================================================================== Bloom
{
  const got = [];
  for (const seed of ['BLOOM', 'BLOOM', 'BLOOM', 'BLOOM', 'BLOOM', 'BLOOM2', 'BLOOM3', 'BLOOM4']) {
    run(seed);
    const b = add('c_sylvie_bloom');
    ok(use(b).ok, 'use Bloom');
    flush();
    ok(G.GAME.tags.length === 1 && ['tag_economy', 'tag_skip', 'tag_investment'].includes(G.GAME.tags[0].key), 'Bloom: a Speed/Investment/Economy Tag', G.GAME.tags.map((t) => t.key));
    got.push(G.GAME.tags[0] && G.GAME.tags[0].key);
  }
  ok(got.slice(0, 5).every((k) => k === got[0]), 'fix 6: Bloom is seeded (same seed, same tag)', got);
  ok(!describeCenter('c_sylvie_bloom').lines.some((l) => NOFILL.test(l)), 'describe Bloom');
}

// =================================================================== Stamper / Seal the Deal
function standardSeals(n) {
  let cards = 0, sealed = 0;
  for (let i = 0; i < n; i++) {
    buyFromShop('p_standard_jumbo_1', G.shop_booster);
    for (const c of G.pack_cards.cards) { cards++; if (c.seal) sealed++; }
    act({ type: 'skip_booster' });
  }
  return sealed / cards;
}
{
  run('STAMP');
  select(); toShop();
  const base = standardSeals(8);
  ok(base < 0.4, 'no voucher: ~20% sealed', base);
  ok(buyFromShop('v_sylvie_stamper', G.shop_vouchers).ok && G.GAME.used_vouchers.v_sylvie_stamper, 'redeem Stamper');
  const st = standardSeals(8);
  ok(st > 0.65, 'Stamper: most Standard pack cards sealed (75% + the base roll)', st);
  ok(buyFromShop('v_sylvie_seal_deal', G.shop_vouchers).ok, 'redeem Seal the Deal');
  const sd = standardSeals(6);
  ok(sd === 1, 'Seal the Deal: every Standard pack card sealed', sd);
  // not other packs' playing cards / shop cards
  for (const k of STATUS.vouchers) { const d = describeCenter(k); ok(d.lines.length === 3 && !d.lines.some((l) => NOFILL.test(l)), `describe ${k}`, d.lines); }
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
