// The owner's 12 Type Sleeves (2026-10-27; mods/pokermon/typesleeves.js; PORTING.md "The owner's Type Sleeves"; contentRev 22).
// Each "<Type> Sleeve": a Negative Energy of its type at the start (no slot), and the first 2 shops' initial stock each holds a
// Joker of that type (the last joker slot; rerolls restock normally; shop size unchanged); no Joker of the type left -> a normal
// slot. Seeded on the shop's streams: the same seed stocks the same Jokers, also after a resume (the recipe re-simulates).
// Every check FIRES real runs (Session.start + act: blind, play, cash out, the shop).
//   node micatro/tests/mods/pokermon_type_sleeves_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS } from '../../js/engine/core.js';
import { STATES, get_poker_hand_info } from '../../js/engine/run.js';
import { Session } from '../../js/engine/session.js';
import { MODS, ATLASES } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { allSleeves, findSleeve, sleeveInfo } from '../../js/engine/sleeve.js';
import '../../mods/pokermon/index.js';
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';
import { replaced_by } from '../../mods/pokermon/systems/precedence.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 500)); } };

const TYPES = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth'];
const ENERGY = { Grass: 'grass', Fire: 'fire', Water: 'water', Lightning: 'lightning', Psychic: 'psychic', Fighting: 'fighting', Colorless: 'colorless', Dark: 'darkness', Metal: 'metal', Fairy: 'fairy', Dragon: 'dragon', Earth: 'earth' };
const SKEY = (t) => 'sleeve_poke_' + ENERGY[t] + 'sleeve';
const key = (c) => c.config.center.key;
const ptype = (c) => (c.ability && c.ability.extra && typeof c.ability.extra === 'object' && c.ability.extra.ptype) || null;
const shopKeys = () => G.shop_jokers.cards.map(key);
const lastSlot = () => G.shop_jokers.cards[G.shop_jokers.cards.length - 1];
const flush = () => G.E_MANAGER.flush();

function start(sleeve, seed, extra = {}) {
  const s = new Session();
  s.start({ seed, back: extra.back || 'b_red', sleeve, mods: ['pokermon'], modOptions: extra.modOptions ? { pokermon: extra.modOptions } : {} });
  flush();
  return s;
}
/** Win the current blind by force (not replayable: the forced chips are no action) and land in the shop. */
function forceShop(s) {
  if (G.STATE === STATES.SHOP) s.act({ type: 'next_round' });
  s.act({ type: 'select_blind' });
  G.GAME.chips = G.GAME.blind.chips;
  s.act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  s.act({ type: 'play' });
  s.act({ type: 'cash_out' });
  flush();
  return G.STATE === STATES.SHOP;
}
/** Best scoring selection of up to 5 cards (the replay bot's), for runs that must replay. */
function bestHand() {
  const cards = G.hand.cards; let best = null, bs = -1; const n = Math.min(cards.length, 10);
  for (let mask = 1; mask < (1 << n); mask++) {
    let bits = 0; for (let m = mask; m; m &= m - 1) bits++;
    if (bits > 5) continue;
    const sel = cards.filter((_, i) => mask & (1 << i));
    const info = get_poker_hand_info(sel); if (info.text === 'NULL') continue;
    const h = G.GAME.hands[info.text];
    const sc = (h.chips + info.scoring_hand.reduce((a, c) => a + c.get_chip_bonus(), 0)) * h.mult;
    if (sc > bs) { bs = sc; best = sel; }
  }
  return (best || cards.slice(0, 1)).map((c) => c.sort_id);
}
/** Play the blind for real (recorded actions only) to the shop. -> true when the shop opened. */
function playShop(s) {
  if (G.STATE === STATES.SHOP) s.act({ type: 'next_round' });
  s.act({ type: 'select_blind' });
  for (let i = 0; i < 12 && G.STATE === STATES.SELECTING_HAND; i++) {
    s.act({ type: 'highlight', ids: bestHand() });
    s.act({ type: 'play' });
    flush();
  }
  if (G.STATE === STATES.ROUND_EVAL) s.act({ type: 'cash_out' });
  flush();
  return G.STATE === STATES.SHOP;
}

// ------------------------------------------------------------------- pin, registration, text, art
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 22 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 22+ (23 since the Sprigatito rework)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
});
sec('registered', () => {
  const mine = allSleeves().filter((s) => s.poke_type_sleeve);
  ok(mine.length === 12 && mine.every((s) => s.mod === 'pokermon'), '12 Type Sleeves, Pokermon\'s', mine.map((s) => s.key));
  ok(JSON.stringify(mine.map((s) => s.poke_type_sleeve)) === JSON.stringify(TYPES), 'one per Pokermon type (POKETYPES order)');
  TYPES.forEach((t, i) => {
    const s = findSleeve(SKEY(t));
    ok(s && s.name === (ENERGY[t][0].toUpperCase() + ENERGY[t].slice(1)) + ' Sleeve', `${t}: "${s && s.name}"`);
    ok(s && s.atlas === 'poke_type_sleeves' && s.pos.x === i && s.pos.y === 0, `${t}: art cell ${i} of poke_type_sleeves`, s && s.pos);
    ok(s && s.unlocked === true && !s.mod_option && !s.legacy && !s.alt, `${t}: unlocked from the start, no option gate, no alt`);
    const info = sleeveInfo(s, 'b_red'), plain = info.lines.join(' ').replace(/\{[^}]*\}/g, '');
    const en = ENERGY[t][0].toUpperCase() + ENERGY[t].slice(1) + ' Energy';
    ok(plain === `Start with a Negative ${en} card The first 2 shops each start with a ${t} Joker`, `${t}: picker text`, plain);
    ok(info.lines[3].includes('{X:poke_' + t.toLowerCase() + ','), `${t}: the type in its colour box`, info.lines[3]);
    // any deck: the same effect on Pokermon's own decks (no alt)
    ok(!sleeveInfo(s, 'b_poke_pokemondeck').alt && !sleeveInfo(s, 'b_poke_diceydeck').alt, `${t}: no alternate effect on any deck`);
  });
  const a = ATLASES.poke_type_sleeves;
  ok(a && /\/type_sleeves\.png$/.test(a.src) && a.px === 71 && a.py === 95, 'atlas poke_type_sleeves -> type_sleeves.png (71 x 95 cells)', a);
});

// ------------------------------------------------------------------- every type: the Energy, shop 1, shop 2, shop 3
for (const t of TYPES) sec('type ' + t, () => {
  const s = start(SKEY(t), 'TSL' + t);
  const en = 'c_poke_' + ENERGY[t] + '_energy';
  const cons = G.consumeables.cards;
  ok(cons.length === 1 && key(cons[0]) === en, `${t}: starts with one ${en}`, cons.map(key));
  ok(cons[0] && cons[0].edition && cons[0].edition.negative === true, `${t}: the Energy is Negative`, cons[0] && cons[0].edition);
  ok(G.consumeables.config.card_limit === 3 && cons.length < G.consumeables.config.card_limit, `${t}: it takes no slot (2 slots + 1 Negative, 2 free)`, [cons.length, G.consumeables.config.card_limit]);
  ok(P_CENTERS[en] && P_CENTERS[en].set === 'Energy', `${t}: an Energy card`);
  const forced = [];
  for (let shop = 1; shop <= 2; shop++) {
    ok(forceShop(s), `${t}: shop ${shop} opened`);
    const j = lastSlot();
    ok(G.shop_jokers.cards.length === G.GAME.shop.joker_max && G.GAME.shop.joker_max === 2, `${t}: shop ${shop} has its normal 2 joker slots`, shopKeys());
    ok(j && ptype(j) === t && key(j) === G.GAME.poke_type_sleeve_last, `${t}: shop ${shop}'s last slot is a ${t} Joker`, [shopKeys(), j && ptype(j)]);
    ok(j && j.config.center.rarity !== 4 && j.config.center.rarity !== 'poke_safari' && j.config.center.rarity !== 'poke_mega', `${t}: shop ${shop}: a shop rarity`, j && j.config.center.rarity);
    ok(j && G.shop_jokers.cards.filter((c) => key(c) === key(j)).length === 1, `${t}: shop ${shop}: not a duplicate of the other slot`, shopKeys());
    forced.push(key(j));
  }
  G.GAME.poke_type_sleeve_last = 'MARK';
  ok(forceShop(s), `${t}: shop 3 opened`);
  ok(G.GAME.poke_type_sleeve_last === 'MARK' && G.GAME.poke_type_sleeve_shops === 3 && !G.GAME.poke_type_sleeve_due, `${t}: shop 3 has no guarantee`, [G.GAME.poke_type_sleeve_last, G.GAME.poke_type_sleeve_shops]);
});

// shop 3 really is a normal shop: over 20 seeds the Dragon Sleeve's shop 3 is not always a Dragon (shops 1-2 always are)
sec('shop 3 statistics', () => {
  let s12 = 0, s3 = 0;
  for (let k = 0; k < 20; k++) {
    const s = start(SKEY('Dragon'), 'TSLD3' + k);
    for (let n = 1; n <= 3; n++) {
      forceShop(s);
      const dragons = G.shop_jokers.cards.filter((c) => ptype(c) === 'Dragon').length;
      if (n < 3 && dragons) s12++;
      if (n === 3 && dragons) s3++;
    }
  }
  ok(s12 === 40, 'Dragon Sleeve: every shop 1 and 2 of 20 runs had a Dragon', s12);
  ok(s3 < 10, 'Dragon Sleeve: shop 3 mostly had none (no guarantee)', s3);
});

// ------------------------------------------------------------------- rerolls keep no guarantee; packs re-open the same shop
sec('reroll', () => {
  const s = start(SKEY('Fire'), 'TSLRR');
  forceShop(s);
  const first = lastSlot();
  ok(ptype(first) === 'Fire', 'Fire Sleeve: shop 1 starts with a Fire Joker');
  G.GAME.poke_type_sleeve_last = 'MARK';
  G.GAME.dollars = 100;
  const r = s.act({ type: 'reroll_shop' }); flush();
  ok(r.ok && G.GAME.poke_type_sleeve_last === 'MARK' && G.shop_jokers.cards.length === 2, 'a reroll restocks normally (no forced pick)', [r.ok, G.GAME.poke_type_sleeve_last, shopKeys()]);
  // the next shop is still guaranteed (the reroll used nothing up)
  forceShop(s);
  ok(ptype(lastSlot()) === 'Fire' && G.GAME.poke_type_sleeve_shops === 2, 'shop 2 still starts with a Fire Joker', [shopKeys(), G.GAME.poke_type_sleeve_shops]);
});

// ------------------------------------------------------------------- the pool rules
sec('pool rules', () => {
  // Hazards option off: never a hazard joker (3.9.1 'hazards' attribute) — Metal has several (Skarmory, Bronzor...)
  let hz = 0, metal = 0;
  for (let k = 0; k < 25; k++) {
    const s = start(SKEY('Metal'), 'TSLHZ' + k, { modOptions: { hazards_on: false } });
    for (let n = 1; n <= 2; n++) { forceShop(s); const c = lastSlot().config.center; if (ptype(lastSlot()) === 'Metal') metal++; if (c.hazard_poke || (c.attributes || []).includes('hazards')) hz++; }
  }
  ok(metal === 50 && hz === 0, 'Hazards off: 50 guaranteed Metal Jokers, none with hazards', [metal, hz]);
  // ... and with Hazards on they do come up (the filter is the option's, not the sleeve's)
  let hzOn = 0;
  for (let k = 0; k < 25; k++) {
    const s = start(SKEY('Metal'), 'TSLHZ' + k);
    for (let n = 1; n <= 2; n++) { forceShop(s); const c = lastSlot().config.center; if (c.hazard_poke || (c.attributes || []).includes('hazards')) hzOn++; }
  }
  ok(hzOn > 0, 'Hazards on: hazard Metal Jokers can be the guarantee', hzOn);
  // no duplicates: an owned joker of the type isn't picked (no Showman); with Showman it may be
  const s = start(SKEY('Dragon'), 'TSLDUP');
  const dragons = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && c.mod === 'pokermon' && c.config.extra && c.config.extra.ptype === 'Dragon' && [1, 2, 3].includes(c.rarity));
  for (const c of dragons.slice(1)) G.GAME.used_jokers[c.key] = true; // (as if every other Dragon were owned)
  forceShop(s);
  ok(key(lastSlot()) === dragons[0].key, `no duplicates: the one Dragon not in use is picked (${dragons[0].key})`, [shopKeys(), dragons.map((c) => c.key)]);
  // precedence: an add-on's duplicate of a Pokermon joker never is the pick (Nacho / Pokermon+ on)
  let addon = 0, n = 0, fromAddon = 0;
  for (let k = 0; k < 15; k++) {
    const s2 = new Session(); s2.start({ seed: 'TSLADD' + k, back: 'b_red', sleeve: SKEY('Water'), mods: ['pokermon', 'nacho', 'pokermonplus'] }); flush();
    for (let m = 1; m <= 2; m++) {
      forceShop(s2); const c = lastSlot(); n++;
      if (c.config.center.mod !== 'pokermon') fromAddon++;
      if (ptype(c) !== 'Water') addon += 100;
      if (replaced_by(key(c))) addon++;
    }
  }
  ok(fromAddon > 0, 'with the add-ons on, their own Water Jokers can be the guarantee', fromAddon);
  ok(n === 30 && addon === 0, 'with Nacho + Pokermon+: 30 Water guarantees, never an add-on duplicate of a Pokermon joker', [n, addon]);
});

// ------------------------------------------------------------------- the fallback: no Joker of the type left
sec('fallback', () => {
  // Gen 1 only: Pokermon has no Gen 1 Metal joker in its pools
  const GEN1 = { gen_oneb: true, gen_two: false, gen_three: false, gen_four: false, gen_five: false, gen_six: false, gen_seven: false, gen_eight: false, gen_nine: false };
  // (one run at a time: the engine state is global)
  const a = start(SKEY('Metal'), 'TSLFB', { modOptions: GEN1 });
  ok(forceShop(a), 'fallback: shop 1 opened');
  const fb = shopKeys();
  ok(G.GAME.poke_type_sleeve_last === null && fb.length === 2 && G.shop_jokers.cards.every((c) => ptype(c) !== 'Metal'), 'fallback: no Metal Joker can come up -> 2 normal jokers', [fb, G.GAME.poke_type_sleeve_last]);
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_poke_metal_energy', 'fallback: the Negative Metal Energy still comes');
  forceShop(a);
  ok(G.GAME.poke_type_sleeve_last === null && G.GAME.poke_type_sleeve_shops === 2 && G.shop_jokers.cards.length === 2, 'fallback: shop 2 falls back too', [G.GAME.poke_type_sleeve_last, shopKeys()]);
  // ... and shop 1 is exactly the stock of the same run with the guarantee used up (the fallback draws nothing from the RNG first)
  const b = start(SKEY('Metal'), 'TSLFB', { modOptions: GEN1 });
  G.GAME.poke_type_sleeve_shops = 2;
  forceShop(b);
  ok(JSON.stringify(shopKeys()) === JSON.stringify(fb), 'fallback: the same stock as a run without the guarantee', [fb, shopKeys()]);
  // the first slot is untouched by the guarantee (it rolls before the forced last slot)
  const c = start(SKEY('Grass'), 'TSLSLOT');
  forceShop(c); const guaranteed = shopKeys();
  const d = start(SKEY('Grass'), 'TSLSLOT'); G.GAME.poke_type_sleeve_shops = 2;
  forceShop(d);
  ok(guaranteed[0] === shopKeys()[0], 'the first slot is the normal roll (the guarantee takes the last)', [guaranteed, shopKeys()]);
});

// ------------------------------------------------------------------- Luminous Deck: the guarantee keeps its type
sec('luminous', () => {
  let ok2 = 0;
  for (let k = 0; k < 8; k++) {
    const s = start(SKEY('Psychic'), 'TSLLUM' + k, { back: 'b_poke_luminousdeck' });
    for (let n = 1; n <= 2; n++) {
      forceShop(s);
      const j = lastSlot();
      const tera = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'colorless', 'dark', 'metal', 'fairy', 'dragon', 'earth'].filter((x) => j.ability[x + '_sticker']);
      if (ptype(j) === 'Psychic' && (tera.length === 0 || (tera.length === 1 && tera[0] === 'psychic'))) ok2++;
    }
  }
  ok(ok2 === 16, 'Luminous Deck: every guaranteed Joker stays Psychic (its Tera sticker, if any, is Psychic)', ok2);
});

// ------------------------------------------------------------------- determinism: same seed, and resume mid-shop
sec('determinism', () => {
  for (const t of ['Grass', 'Dark', 'Fairy']) {
    const run = () => { const s = start(SKEY(t), 'TSLDET' + t); const out = []; for (let n = 1; n <= 2; n++) { forceShop(s); out.push(shopKeys()); } return out; };
    const x = run(), y = run();
    ok(JSON.stringify(x) === JSON.stringify(y), `${t}: the same seed stocks the same shops`, [x, y]);
  }
  // a real (replayable) run: play to shop 1, reroll, resume mid-shop; then buy the guaranteed Joker, play to shop 2, resume there
  let done = false;
  for (const seed of ['TSLRES1', 'TSLRES2', 'TSLRES3', 'TSLRES4', 'TSLRES5']) {
    const s = start(SKEY('Water'), seed);
    if (!playShop(s)) continue;
    const shop1 = shopKeys(), forced1 = key(lastSlot());
    ok(ptype(lastSlot()) === 'Water', `resume (${seed}): shop 1 starts with a Water Joker`, shop1);
    const r1 = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
    ok(G.STATE === STATES.SHOP && JSON.stringify(shopKeys()) === JSON.stringify(shop1), 'resume mid-shop 1: the same stock (the same forced Joker)', [shop1, shopKeys()]);
    // buy the forced Joker in the resumed run, reroll, then resume again
    const buy = G.shop_jokers.cards.find((c) => key(c) === forced1);
    const rb = r1.act({ type: 'buy', id: buy.sort_id }); flush();
    ok(rb.ok && G.jokers.cards.some((c) => key(c) === forced1), 'resume: the forced Joker can be bought', rb.error);
    if (G.GAME.dollars >= G.GAME.current_round.reroll_cost) r1.act({ type: 'reroll_shop' });
    flush();
    const afterReroll = shopKeys();
    Session.fromRecipe(JSON.parse(JSON.stringify(r1.recipe))); flush();
    ok(JSON.stringify(shopKeys()) === JSON.stringify(afterReroll) && G.jokers.cards.some((c) => key(c) === forced1), 'resume after buy + reroll: the same shop', [afterReroll, shopKeys()]);
    const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(r1.recipe))); flush();
    if (!playShop(r2)) continue;
    const shop2 = shopKeys();
    ok(ptype(lastSlot()) === 'Water' && key(lastSlot()) !== forced1, 'shop 2 starts with a Water Joker (not the one owned)', shop2);
    Session.fromRecipe(JSON.parse(JSON.stringify(r2.recipe))); flush();
    ok(G.STATE === STATES.SHOP && JSON.stringify(shopKeys()) === JSON.stringify(shop2) && G.GAME.poke_type_sleeve_shops === 2, 'resume mid-shop 2: the same forced Joker', [shop2, shopKeys()]);
    done = true;
    break;
  }
  ok(done, 'a replayable run reached shops 1 and 2');
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
