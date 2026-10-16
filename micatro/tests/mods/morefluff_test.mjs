// More Fluff (micatro/mods/morefluff): off -> nothing; on -> every Colour card (incl. charging over real
// rounds), every 45° Rotarot, every pack, voucher, tag, enhancement, deck and blind fired through real act()
// plays with the mod's exact numbers; the Superboss mode (The Ticket -> Bigger Blind / boss / DX boss -> win);
// Modded packs offer only jokers from ACTIVE mods; describe() leaves no #n# unfilled. The 83 jokers are in
// morefluff_jokers_{a,b,c}_test.mjs.
//   node micatro/tests/mods/morefluff_test.mjs
import {
  start, clearHand, hand, add, clearJokers, clearConsumables, play, discard, winRound, nextRound, toShop, msgs, tot, filled,
  ok, near, flush, done, G, P_CENTERS, P_CARDS, act, STATES,
} from './morefluff_helpers.mjs';
import { P_CENTER_POOLS, P_JOKER_RARITY_POOLS, P_BLINDS, P_TAGS, add_joker, get_blind_amount, create_card, Card, create_playing_card } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { describe, describeCenter, describeBlind, describeTag, describeBack } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';
import { MODS, ATLASES, SOUNDS, CONSUMABLE_TYPES, RARITIES } from '../../js/mods/registry.js';
import { loadMods } from '../../js/mods/index.js';
import { STATUS } from '../../mods/morefluff/index.js';
import { trigger_colour_end_of_round } from '../../mods/morefluff/colours.js';

const useC = (c, targets = []) => act({ type: 'use', id: c.sort_id, targets: targets.map((x) => x.sort_id) });
const cons = (key) => { const c = add_joker(key); flush(); return c; };
const setsIn = (area) => area.cards.map((c) => c.ability.set);

// ===================================================================== off
{
  start('MFOFF', { mods: [] });
  ok(!Object.values(P_CENTER_POOLS).some((p) => p.some((c) => c.mod === 'morefluff')), 'off: no More Fluff center in any pool');
  ok(!P_CENTER_POOLS.Colour && !P_CENTER_POOLS.Rotarot, 'off: no Colour / Rotarot pools');
  ok(!P_CENTER_POOLS.Tag.some((t) => t.mod === 'morefluff'), 'off: no More Fluff tags');
  ok(G.GAME.colour_rate === undefined && G.GAME.rotarot_rate === undefined, 'off: no shop rates for the new types');
  // a vanilla boss pick never lands on a DX boss; skipping works; vanilla scaling table
  G.GAME.round_resets.ante = 16;
  ok(get_blind_amount(1) === 300, 'off: vanilla blind amounts');
  ok(!toView().music, 'off: no mod music');
}

// ===================================================================== on: registration
start('MFON');
ok(STATUS.jokers.length === 83 && STATUS.colours.length === 17 && STATUS.rotarots.length === 22 && STATUS.boosters.length === 16
  && STATUS.vouchers.length === 3 && STATUS.enhancements.length === 8 && STATUS.decks.length === 4 && STATUS.tags.length === 4 && STATUS.blinds.length === 16,
'content counts: 83 jokers / 17 Colour / 22 Rotarot / 16 packs / 3 vouchers / 8 enhancements / 4 decks / 4 tags / 16 blinds', STATUS);
ok(CONSUMABLE_TYPES.Colour.shop_rate === 1 && CONSUMABLE_TYPES.Rotarot.shop_rate === 2 && G.GAME.colour_rate === 1 && G.GAME.rotarot_rate === 2, 'Colour / Rotarot shop rates 1 / 2');
ok(P_CENTER_POOLS.Colour.length === 17 && P_CENTER_POOLS.Rotarot.length === 22, 'Colour / Rotarot pools');
ok(RARITIES.mf_token && RARITIES.mf_token.weight === 0 && P_JOKER_RARITY_POOLS.mf_token.length === 1, 'Token rarity (weight 0) holds Oops! All 5s');
ok(P_CENTERS.c_mf_new_gold.hidden && !P_CENTER_POOLS.Colour.filter((c) => !c.hidden).some((c) => c.key === 'c_mf_new_gold'), 'Gold is a hidden (soul-like) Colour');
ok(ATLASES.mf_jokers.src.endsWith('/morefluff/assets/2x/mf_jokers_refresh.png') && ATLASES.mf_rotarots.px === 107 && ATLASES.mf_blinds.frames === 21, 'atlases (refreshed joker art, 107px rotarots, animated blinds)');
ok(SOUNDS.mf_music_colourpack && SOUNDS.mf_music_duelzone.src.endsWith('/morefluff/assets/sounds/music_duelzone.ogg') && SOUNDS.mf_treethree, 'mod sounds registered');
{
  // every description is filled
  const bad = [];
  for (const k of [...STATUS.colours, ...STATUS.rotarots, ...STATUS.boosters, ...STATUS.vouchers, ...STATUS.enhancements]) if (!filled(describeCenter(k))) bad.push(k);
  for (const k of STATUS.decks) { const d = describeBack(k); if (!d || !d.lines.length || d.lines.some((l) => /#\d+#/.test(l))) bad.push(k); }
  for (const k of STATUS.tags) { const d = describeTag(k); if (!d.lines.length || d.lines.some((l) => /#\d+#/.test(l))) bad.push(k); }
  for (const k of STATUS.blinds.filter((b) => b !== 'bl_mf_bigger_blind')) { const d = describeBlind(k); if (!d.lines.length) bad.push(k); }
  ok(!bad.length, 'describe(): every Colour / Rotarot / pack / voucher / enhancement / deck / tag / blind text is filled', bad);
  ok(describeTag('tag_mf_clutch').lines.join(' ').includes('X4'), 'Clutch Tag: X4 Mult text');
  ok(describeBlind('bl_mf_bigger_blind').type === 'Small', 'Bigger Blind describes as a Small blind');
}

// ===================================================================== Colour cards
{
  start('MFCOL');
  clearConsumables();
  // ---- charging over real rounds: Crimson (3 rounds/level), Deep Blue (1), Black (4)
  const crim = cons('c_mf_crimson'), deep = cons('c_mf_deepblue');
  ok(crim.ability.val === 0 && crim.ability.upgrade_rounds === 3 && deep.ability.upgrade_rounds === 1, 'Colour config from the mod');
  ok(!crim.can_use_consumeable() || crim.ability.val === 0, 'fresh Colour has val 0');
  winRound();
  ok(G.STATE === STATES.ROUND_EVAL && crim.ability.partial_rounds === 1 && crim.ability.val === 0 && deep.ability.val === 1 && deep.ability.partial_rounds === 0, 'one round: Crimson 1/3, Deep Blue +1', [crim.ability, deep.ability]);
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(crim.ability.partial_rounds === 2 && deep.ability.val === 2, 'two rounds');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const r3 = winRound();
  ok(crim.ability.val === 1 && crim.ability.partial_rounds === 0 && deep.ability.val === 3, 'three rounds: Crimson levels up to 1', crim.ability);
  ok(msgs(r3.events).includes('Upgrade!'), 'Upgrade! popup');
  act({ type: 'cash_out' });
  ok(G.STATE === STATES.SHOP, 'in the shop');
  // a skipped blind gives no round to the Colour cards
  act({ type: 'next_round' });
  const before = crim.ability.partial_rounds;
  act({ type: 'skip_blind' });
  ok(crim.ability.partial_rounds === before, 'skipping a blind charges nothing');
  // ---- Crimson: val Rare Tags
  const tags0 = G.GAME.tags.length;
  ok(useC(crim).ok && G.GAME.tags.length === tags0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_rare', 'Crimson (val 1): +1 Rare Tag', G.GAME.tags.map((t) => t.key));
  // ---- Deep Blue (val 3): 3 non-Spade hand cards become Spades
  act({ type: 'select_blind' }); clearHand();
  const h = hand(['H_2', 'H_3', 'D_4', 'C_5', 'S_6']);
  ok(useC(deep).ok && h.filter((c) => c.base.suit === 'Spades').length === 4, 'Deep Blue (val 3): three cards turn Spades', h.map((c) => c.base.suit));
}
{
  // direct charging rules: Paint Roller adds a round 1 in 2; Yellow gains $8 sell value per level
  start('MFCHG');
  clearConsumables();
  const y = cons('c_mf_yellow');
  const s0 = y.sell_cost;
  for (let i = 0; i < 3; i++) trigger_colour_end_of_round(y);
  ok(y.ability.val === 1 && y.ability.extra_value === 8 && y.sell_cost === s0 + 8, 'Yellow: +$8 sell value per level', [y.ability.val, y.sell_cost, s0]);
  ok(!y.can_use_consumeable(), 'Yellow cannot be used');
  G.GAME.used_vouchers.v_mf_paintroller = true;
  const p = cons('c_mf_pink');
  let extra = 0;
  for (let i = 0; i < 40; i++) { const before = p.ability.partial_rounds + p.ability.val * 2; trigger_colour_end_of_round(p); extra += (p.ability.partial_rounds + p.ability.val * 2) - before - 1; }
  ok(extra > 8 && extra < 32, 'Paint Roller: about half of the charges add a second round', extra);
  G.GAME.used_vouchers.v_mf_paintroller = undefined;
  // halted cards never charge
  const b = cons('c_mf_blue'); b.ability.mf_halted = true; trigger_colour_end_of_round(b);
  ok(b.ability.partial_rounds === 0, 'a halted Colour card gains no rounds');
}
{
  start('MFCOL2');
  clearConsumables();
  G.consumeables.config.card_limit = 30;
  const make = (key, val) => { const c = cons(key); c.ability.val = val; return c; };
  // Grey / Silver: Double / Polychrome Tags
  const n0 = G.GAME.tags.length;
  useC(make('c_mf_grey', 2));
  ok(G.GAME.tags.slice(n0).map((t) => t.key).join() === 'tag_double,tag_double', 'Grey (val 2): 2 Double Tags', G.GAME.tags.map((t) => t.key));
  useC(make('c_mf_silver', 1));
  ok(G.GAME.tags.slice(n0).map((t) => t.key).join() === 'tag_polychrome,tag_polychrome,tag_polychrome', 'Silver: a Polychrome Tag (the two Double Tags copy it)', G.GAME.tags.map((t) => t.key));
  // White / Blue / Lilac / Peach: Negative cards of a type
  for (const [key, set] of [['c_mf_white', 'Colour'], ['c_mf_blue', 'Planet'], ['c_mf_lilac', 'Tarot'], ['c_mf_peach', 'Rotarot']]) {
    const c = make(key, 2);
    const before = G.consumeables.cards.length;
    useC(c);
    const made = G.consumeables.cards.slice(before - 1);
    ok(made.length === 2 && made.every((m) => m.ability.set === set && m.edition && m.edition.negative), `${key}: 2 Negative ${set} cards`, made.map((m) => [m.ability.set, m.edition]));
  }
  // Green: Negative Oops! All 5s jokers; Gold: Negative Souls
  clearJokers();
  useC(make('c_mf_green', 2));
  ok(G.jokers.cards.length === 2 && G.jokers.cards.every((j) => j.config.center.key === 'j_mf_oopsallfives' && j.edition.negative), 'Green: 2 Negative Oops! All 5s');
  const before = G.consumeables.cards.length;
  useC(make('c_mf_new_gold', 1));
  ok(G.consumeables.cards.length === before + 1 && G.consumeables.cards[G.consumeables.cards.length - 1].config.center.key === 'c_soul' && G.consumeables.cards[G.consumeables.cards.length - 1].edition.negative, 'Gold: a Negative Soul');
  // Pink: rounds to random Colour cards
  clearConsumables();
  const w = make('c_mf_white', 0), pk = make('c_mf_pink', 3);
  useC(pk);
  ok(w.ability.partial_rounds === 3 || w.ability.val === 1, 'Pink (val 3): three rounds go to the held White', w.ability);
  // Black: Negative to a joker (unedited first)
  clearJokers(); clearConsumables();
  const j1 = add('j_joker'), j2 = add('j_mf_jester', 'foil');
  useC(make('c_mf_black', 1));
  ok(j1.edition && j1.edition.negative && j2.edition.foil, 'Black: an unedited joker turns Negative first');
  useC(make('c_mf_black', 1));
  ok(j2.edition.negative, 'Black: then an editioned (non-Negative) one');
  // FIX: Black's can_use typo (`edition.egative`) let it be used with only Negative jokers (doing nothing)
  ok(!make('c_mf_black', 1).can_use_consumeable(), 'fix: Black cannot be used when every joker is already Negative');
  // Brown: destroy val random hand cards for $cash_per each
  act({ type: 'select_blind' }); clearHand(); clearConsumables();
  hand(['S_2', 'S_3', 'S_4', 'S_5']);
  const br = make('c_mf_brown', 2);
  const d0 = G.GAME.dollars, pc = G.playing_cards.length;
  useC(br);
  ok(G.hand.cards.length === 2 && G.playing_cards.length === pc - 2 && G.GAME.dollars === d0 + 4, 'Brown (val 2): 2 hand cards destroyed, +$4', [G.hand.cards.length, G.GAME.dollars - d0]);
  // suit colours
  for (const [key, suit] of [['c_mf_seaweed', 'Clubs'], ['c_mf_red', 'Hearts'], ['c_mf_orange', 'Diamonds']]) {
    clearHand();
    const hh = hand(['S_2', 'S_3', 'S_4']);
    useC(make(key, 2));
    ok(hh.filter((c) => c.base.suit === suit).length === 2, `${key}: 2 cards turn ${suit}`);
  }
  ok(!make('c_mf_red', 1).can_use_consumeable() === (G.hand.cards.length <= 1), 'suit Colours need 2+ hand cards');
}

// ===================================================================== Colour packs, Painter's Tag, vouchers
{
  start('MFCPK', { noBlind: true });
  clearConsumables();
  G.GAME.dollars = 100;
  const pack = new Card(P_CARDS.empty, P_CENTERS.p_mf_colour_mega_1);
  G.shop_booster.emplace(pack);
  G.STATE = STATES.SHOP;
  ok(act({ type: 'buy', id: pack.sort_id }).ok && G.pack_cards.cards.length === 4 && G.pack_cards.cards.every((c) => c.ability.set === 'Colour') && G.GAME.pack_choices === 2, 'Mega Colour Pack: choose 2 of 4 Colour cards');
  const c0 = G.pack_cards.cards[0];
  ok(!act({ type: 'use', id: c0.sort_id }).ok, 'a Colour card cannot be USED from a pack');
  const v = toView();
  const pv = v.areas.pack_cards.find((x) => x.id === c0.sort_id);
  ok(pv && pv.no_use && pv.reserve && pv.reserve_label === 'TAKE', 'the pack card view offers TAKE only', pv);
  ok(v.music === 'mf_music_colourpack', 'Colour pack music');
  ok(act({ type: 'reserve', id: c0.sort_id }).ok && G.consumeables.cards.includes(c0), 'TAKE: the Colour card goes to the consumable slots');
  act({ type: 'reserve', id: G.pack_cards.cards[0].sort_id });
  ok(G.STATE === STATES.SHOP && G.consumeables.cards.length === 2, 'second pick closes the pack');
  // Colour Theory: 40% of Colour pack cards are Polychrome
  G.GAME.used_vouchers.v_mf_colourtheory = true;
  let poly = 0;
  for (let i = 0; i < 50; i++) { const c = P_CENTERS.p_mf_colour_normal_1.create_card(); if (c.edition && c.edition.polychrome) poly++; c.remove(); }
  ok(poly > 10 && poly < 32, 'Colour Theory: ~40% Polychrome', poly);
  // Painter's Tag: a free Jumbo Colour Pack
  G.STATE = STATES.BLIND_SELECT;
  add_tag(new Tag('tag_mf_colour'));
  G.GAME.tags[G.GAME.tags.length - 1].apply_to_run({ type: 'new_blind_choice' });
  flush();
  ok(G.GAME.pack_center === 'p_mf_colour_jumbo_1' && G.pack_cards.cards.length === 4, "Painter's Tag opens a free Jumbo Colour Pack", G.GAME.pack_center);
  // Rainbow deck: White + Paint Roller
  newRun({ seed: 'MFRB', back: 'b_mf_rainbow', mods: ['morefluff'] });
  ok(G.GAME.used_vouchers.v_mf_paintroller && G.consumeables.cards.some((c) => c.config.center.key === 'c_mf_white'), 'Rainbow Deck: White card + Paint Roller');
}

// ===================================================================== Rotarot cards
{
  start('MFROT');
  clearConsumables(); clearJokers();
  G.consumeables.config.card_limit = 30;
  // mod_conv cards
  for (const [key, enh, n] of [['c_mf_rot_magician', 'm_mf_yucky', 5], ['c_mf_rot_empress', 'm_mf_cult', 2], ['c_mf_rot_heirophant', 'm_mf_monus', 2],
    ['c_mf_rot_lovers', 'm_mf_styled', 2], ['c_mf_rot_chariot', 'm_mf_teal', 1], ['c_mf_rot_justice', 'm_mf_brass', 1], ['c_mf_rot_devil', 'm_mf_marigold', 3], ['c_mf_rot_tower', 'm_mf_gemstone', 1]]) {
    clearHand();
    const hh = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6'].slice(0, n));
    const c = cons(key);
    ok(c.ability.consumeable.max_highlighted === n, `${key}: up to ${n} cards`);
    ok(useC(c, hh).ok && hh.every((x) => x.config.center.key === enh), `${key} -> ${enh}`);
  }
  // Fool: copies the last Rotarot/Colour used
  const fool = cons('c_mf_rot_fool');
  ok(G.GAME.last_rot_tarot_colour === 'c_mf_rot_tower' && fool.can_use_consumeable(), 'last Rotarot tracked');
  useC(fool);
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_mf_rot_tower'), 'Fool makes the last one (Tower)');
  ok(G.GAME.last_rot_tarot_colour === 'c_mf_rot_fool' && !cons('c_mf_rot_fool').can_use_consumeable(), 'Fool cannot copy a Fool');
  clearConsumables();
  // High Priestess: 2 Colour; Emperor: 2 Rotarot
  useC(cons('c_mf_rot_high_priestess'));
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Colour'), 'High Priestess: 2 Colour cards');
  clearConsumables();
  useC(cons('c_mf_rot_emperor'));
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Rotarot'), 'Emperor: 2 Rotarot cards');
  clearConsumables();
  // Hermit: up to the next multiple of $25
  G.GAME.dollars = 7; useC(cons('c_mf_rot_hermit')); flush();
  ok(G.GAME.dollars === 25, 'Hermit: $7 -> $25', G.GAME.dollars);
  G.GAME.dollars = 50; useC(cons('c_mf_rot_hermit')); flush();
  ok(G.GAME.dollars === 50, 'Hermit: a multiple of 25 gains nothing');
  // Wheel: 1 in 5 for a random edition on an unedited joker
  const jj = add('j_joker');
  let hits = 0, tries = 0;
  while (tries < 60) { tries++; jj.set_edition(null); const w = cons('c_mf_rot_wheel'); useC(w); if (jj.edition) hits++; }
  ok(hits > 4 && hits < 25, 'Wheel: ~1 in 5 gives an edition', hits);
  clearJokers();
  ok(!cons('c_mf_rot_wheel').can_use_consumeable(), 'Wheel needs an unedited joker');
  clearConsumables();
  // Strength: random ranks; Death: copies one picked card; Hanged Man: destroys 3 random
  clearHand();
  const st = hand(['S_2', 'S_2', 'S_2']);
  useC(cons('c_mf_rot_strength'), st);
  ok(st.some((c) => c.base.value !== '2') && st.every((c) => c.base.suit === 'Spades'), 'Strength: random ranks, same suits', st.map((c) => c.base.value));
  clearHand();
  const de = hand(['S_A', 'H_5', 'D_9']);
  useC(cons('c_mf_rot_death'), de);
  ok(new Set(de.map((c) => c.base.suit + c.base.value)).size === 1, 'Death: all three become the same card', de.map((c) => c.base.suit + c.base.value));
  clearHand();
  hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6']);
  const pc0 = G.playing_cards.length;
  useC(cons('c_mf_rot_hanged_man'));
  ok(G.hand.cards.length === 2 && G.playing_cards.length === pc0 - 3, 'Hanged Man: 3 random hand cards destroyed');
  // Temperance: +$3 sell value to everything held
  const tj = add('j_joker'); const tc = cons('c_mf_white');
  const ts0 = tj.sell_cost, tc0 = tc.sell_cost;
  useC(cons('c_mf_rot_temperance'));
  ok(tj.sell_cost === ts0 + 3 && tc.sell_cost === tc0 + 3, 'Temperance: +$3 sell value', [tj.sell_cost, ts0]);
  clearJokers(); clearConsumables();
  // Star / Moon / Sun / World: 3 Enhanced cards of the suit into the hand during a round
  for (const [key, suit] of [['c_mf_rot_star', 'Diamonds'], ['c_mf_rot_moon', 'Clubs'], ['c_mf_rot_sun', 'Hearts'], ['c_mf_rot_world', 'Spades']]) {
    clearHand();
    const pc = G.playing_cards.length;
    useC(cons(key));
    ok(G.hand.cards.length === 3 && G.hand.cards.every((c) => c.base.suit === suit && c.ability.set === 'Enhanced' && c.config.center.key !== 'm_stone') && G.playing_cards.length === pc + 3, `${key}: 3 Enhanced ${suit} into the hand`);
  }
  // Judgement: a NON-vanilla joker
  clearJokers();
  for (let i = 0; i < 5; i++) { useC(cons('c_mf_rot_judgement')); }
  ok(G.jokers.cards.length === 5 && G.jokers.cards.every((j) => j.config.center.mod), 'Judgement: only modded jokers', G.jokers.cards.map((j) => j.config.center.key));
  ok(!(G.GAME.mf_modded_only > 0), 'the modded-only window closes');
  // FIX: suit cards used outside a round go into the deck (the Lua's G.STATE test never saw BLIND_SELECT)
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  ok(G.STATE === STATES.BLIND_SELECT, 'at blind select');
  const deck0 = G.deck.cards.length, hand0 = G.hand.cards.length;
  useC(cons('c_mf_rot_star'));
  ok(G.deck.cards.length === deck0 + 3 && G.hand.cards.length === hand0, 'fix: Star used at blind select puts its cards in the deck', [G.deck.cards.length - deck0, G.hand.cards.length]);
}
{
  // Rotarot packs (draw the hand) + Rotarot Tag
  start('MFRPK', { noBlind: true });
  G.GAME.dollars = 100; G.STATE = STATES.SHOP;
  for (const key of STATUS.boosters.filter((k) => k.includes('rotarot'))) {
    const pack = new Card(P_CARDS.empty, P_CENTERS[key]);
    G.shop_booster.emplace(pack);
    act({ type: 'buy', id: pack.sort_id });
    const cfg = P_CENTERS[key].config;
    ok(G.STATE === STATES.MOD_PACK_HAND && G.pack_cards.cards.length === cfg.extra && G.pack_cards.cards.every((c) => c.ability.set === 'Rotarot' || c.config.center.key === 'c_soul') && G.GAME.pack_choices === cfg.choose && G.hand.cards.length > 0, `${key}: ${cfg.choose} of ${cfg.extra}, hand drawn`);
    if (key === 'p_mf_rotarot_normal_1') ok(toView().music === 'mf_music_rotarot', 'Rotarot pack music');
    act({ type: 'skip_booster' });
  }
  G.STATE = STATES.BLIND_SELECT;
  add_tag(new Tag('tag_mf_rotarot'));
  G.GAME.tags[G.GAME.tags.length - 1].apply_to_run({ type: 'new_blind_choice' });
  flush();
  ok(G.GAME.pack_center === 'p_mf_rotarot_mega_1' && G.pack_cards.cards.length === 5, 'Rotarot Tag: a free Mega Rotarot pack');
}

// ===================================================================== enhancements
{
  start('MFENH');
  const lvl = (h) => G.GAME.hands[h].level;
  // Monus +10 chips / Cult +1 mult per level of the played hand
  G.GAME.hands['High Card'].level = 3;
  let r = play(hand(['S_A'], 'm_mf_monus'));
  ok(r.total.chips === 5 + 11 + 10 * 3 && r.total.mult === 1, 'Monus: +10 Chips x level 3', tot(r));
  r = play(hand(['S_A'], 'm_mf_cult'));
  ok(r.total.mult === 1 + 3 && r.total.chips === 5 + 11, 'Cult: +1 Mult x level 3', tot(r));
  G.GAME.hands['High Card'].level = 1; G.GAME.hands['High Card'].mult = 1; G.GAME.hands['High Card'].chips = 5;
  // Teal: X1.5 chips while held
  hand(['S_K'], 'm_mf_teal');
  r = play([hand(['S_A'])[0]]);
  ok(r.total.chips === Math.floor((5 + 11) * 1.5) || near(r.total.chips, (5 + 11) * 1.5), 'Teal held: X1.5 Chips', tot(r));
  // Gemstone: +$3, scores with no rank/suit, always scores
  const g = hand(['S_2'], 'm_mf_gemstone')[0];
  ok(g.get_id() < 0 && !g.is_suit('Spades'), 'Gemstone: no rank, no suit');
  const d0 = G.GAME.dollars;
  r = play([g, hand(['H_K'])[0]]);
  flush();
  ok(G.GAME.dollars === d0 + 3 && r.total.chips === 5 + 10, 'Gemstone: always scores, +$3, no chips', [G.GAME.dollars - d0, tot(r)]);
  // Brass: retriggers 2 more times
  const bc = hand(['S_5'], 'm_mf_brass')[0];
  r = play([bc]);
  ok(r.total.chips === 5 + 5 * 3, 'Brass: scores 3 times', tot(r));
  // Brass 1 in 3 / Yucky 1 in 2 to break after scoring
  let brk = 0, yk = 0;
  for (let i = 0; i < 30; i++) { const c = hand(['S_9'], 'm_mf_brass')[0]; play([c]); if (!G.playing_cards.includes(c)) brk++; }
  for (let i = 0; i < 30; i++) { const c = hand(['S_9'], 'm_mf_yucky')[0]; play([c]); if (!G.playing_cards.includes(c)) yk++; }
  ok(brk > 3 && brk < 18 && yk > 7 && yk < 24, 'Brass ~1/3 and Yucky ~1/2 are destroyed', [brk, yk]);
  // Marigold: $1 at end of round + $1 per other Marigold held
  clearHand();
  hand(['S_2', 'S_3'], 'm_mf_marigold');
  const m0 = G.GAME.dollars;
  G.GAME.chips = G.GAME.blind.chips; G.GAME.current_round.hands_left = 1;
  act({ type: 'highlight', ids: hand(['H_2']).map((c) => c.sort_id) });
  act({ type: 'play' });
  ok(G.GAME.dollars - m0 === 4, 'Marigold x2 held: $2 each', G.GAME.dollars - m0);
  // Styled: a random Seal when drawn
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  for (const c of G.deck.cards) c.set_ability(P_CENTERS.m_mf_styled);
  act({ type: 'select_blind' });
  ok(G.hand.cards.length > 0 && G.hand.cards.every((c) => c.seal), 'Styled: drawn cards gain Seals', G.hand.cards.map((c) => c.seal));
  // Steel / held effects etc. untouched; describe filled for live enhanced cards
  ok(filled(describe(hand(['S_4'], 'm_mf_brass')[0])) && filled(describe(hand(['S_4'], 'm_mf_monus')[0])), 'live enhanced cards describe');
}

// ===================================================================== decks
{
  newRun({ seed: 'MFDK1', back: 'b_mf_grosmichel', mods: ['morefluff'] }); flush();
  ok(G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.key === 'j_gros_michel', 'Gros Michel Deck');
  newRun({ seed: 'MFDK2', back: 'b_mf_philosophical', mods: ['morefluff'] }); flush();
  ok(G.jokers.cards.length === 5 && G.jokers.cards.every((j) => j.config.center.key === 'j_mf_philosophical') && G.jokers.config.card_limit === 10, 'Philosophical Deck: 5 Philosophical Jokers (+5 slots)', G.jokers.config.card_limit);
  newRun({ seed: 'MFDK3', back: 'b_mf_blasphemy', mods: ['morefluff'] }); flush();
  const bj = G.jokers.cards[0];
  ok(bj && bj.config.center.key === 'j_mf_blasphemy' && bj.edition.negative && bj.ability.eternal, 'Blasphemous Deck: Negative Eternal Blasphemy');
  newRun({ seed: 'MFDK4', back: 'b_mf_rainbow', mods: [] });
  ok(G.GAME.selected_back_key === 'b_red', 'off: a More Fluff deck falls back to Red');
}

// ===================================================================== tags: Modded, Clutch
{
  start('MFTAG');
  // Clutch: X4 Mult for every hand of the next blind, then gone at cash-out
  add_tag(new Tag('tag_mf_clutch'));
  let r = play(hand(['S_A']));
  ok(r.total.mult === 4 && r.total.chips === 16, 'Clutch Tag: X4 Mult', tot(r));
  r = play(hand(['S_A']));
  ok(r.total.mult === 4, 'Clutch Tag: every hand of the blind');
  winRound();
  act({ type: 'cash_out' });
  ok(!G.GAME.tags.some((t) => t.key === 'tag_mf_clutch'), 'Clutch Tag used up after the round');
  // Modded Tag: a free Jumbo Modded Pack of modded jokers
  act({ type: 'next_round' });
  add_tag(new Tag('tag_mf_moddedpack'));
  G.GAME.tags[G.GAME.tags.length - 1].apply_to_run({ type: 'new_blind_choice' });
  flush();
  ok(G.GAME.pack_center === 'p_mf_modded_jumbo_1' && G.pack_cards.cards.length === 4 && G.pack_cards.cards.every((c) => c.ability.set === 'Joker' && c.config.center.mod), 'Modded Tag: free Jumbo Modded Pack, modded jokers');
  ok(toView().music === 'mf_music_modded', 'Modded pack music');
}
{
  // Modded packs: only jokers of ACTIVE mods (here More Fluff + Milatro), never a base joker (Jolly Joker either)
  await loadMods(['milatro']);
  newRun({ seed: 'MFMOD', back: 'b_red', mods: ['morefluff', 'milatro'] }); flush();
  const seen = new Set(); let base = 0;
  for (let i = 0; i < 300; i++) {
    for (const key of ['p_mf_modded_normal_1', 'p_mf_modded_normal_2', 'p_mf_modded_jumbo_1', 'p_mf_modded_mega_1']) {
      const c = P_CENTERS[key].create_card();
      if (!c.config.center.mod) base++;
      seen.add(c.config.center.mod);
      c.remove();
    }
  }
  ok(base === 0, 'fix: Modded packs never offer a base-game joker (the Lua lists missed Jolly Joker)', base);
  ok(seen.has('morefluff') && seen.has('milatro') && seen.size === 2, 'Modded packs mix every active mod', [...seen]);
  ok(!(G.GAME.mf_modded_only > 0) && P_CENTER_POOLS.Joker.some((c) => !c.mod), 'the shop still sells base jokers');
  for (const key of ['p_mf_modded_normal_1', 'p_mf_modded_jumbo_1', 'p_mf_modded_mega_1']) {
    const cfg = P_CENTERS[key].config;
    ok(cfg.modded_pack && P_CENTERS[key].cost === { p_mf_modded_normal_1: 6, p_mf_modded_jumbo_1: 10, p_mf_modded_mega_1: 14 }[key], `${key}: cost / config`);
  }
}

// ===================================================================== blinds + Superboss
{
  // scaling 4 (Superboss): Steamodded's get_blind_amount
  start('MFSB0');
  G.GAME.modifiers.scaling = 4;
  ok(get_blind_amount(1) === 300 && get_blind_amount(2) === 1100 && get_blind_amount(8) === 400000, 'SMODS blind amounts for scaling 4', [get_blind_amount(2), get_blind_amount(8)]);
  G.GAME.modifiers.scaling = 1;
}
const fight = (key, seed) => {
  start(seed, { boss: key, noBlind: true });
  G.GAME.round_resets.ante = 9;
  G.GAME.round_resets.blind_states = { Small: 'Defeated', Big: 'Defeated', Boss: 'Select' };
  G.GAME.blind_on_deck = 'Boss';
  G.STATE = STATES.BLIND_SELECT;
  act({ type: 'select_blind' });
  return G.GAME.blind;
};
{
  ok(STATUS.blinds.filter((b) => b !== 'bl_mf_bigger_blind').every((b) => P_BLINDS[b].boss.showdown && P_BLINDS[b].debuff.superboss && P_BLINDS[b].dollars === 10), 'DX bosses: showdown, superboss, $10');
  let b = fight('bl_mf_violet_vessel_dx', 'DX1');
  ok(b.chips === get_blind_amount(9) * 24, 'Violet Vessel DX: X24 blind');
  b.disable();
  ok(b.chips === get_blind_amount(9) * 3, 'disabled: /8');
  b = fight('bl_mf_cerulean_bell_dx', 'DX2');
  ok(G.hand.highlighted.length === 3 && G.hand.highlighted.every((c) => c.ability.forced_selection), 'Cerulean Bell DX: 3 forced cards');
  b = fight('bl_mf_needle_dx', 'DX3');
  ok(G.GAME.current_round.hands_left === 1 && G.GAME.current_round.discards_left === 1, 'Needle DX: 1 hand, 1 discard');
  const hs = G.hand.config.card_limit;
  b = fight('bl_mf_manacle_dx', 'DX4');
  ok(G.hand.config.card_limit === 5 && G.hand.cards.length === 5, 'Manacle DX: -3 hand size', G.hand.config.card_limit);
  // Pillar DX: played cards (this run) debuffed, half of them forgiven at the start
  start('DX5'); const pl = hand(['S_A', 'S_K']); play(pl);
  ok(pl.every((c) => c.ability.mf_played_this_game), 'played cards are marked mf_played_this_game');
  for (const c of G.playing_cards) c.ability.mf_played_this_game = true;
  b = fight('bl_mf_pillar_dx', 'DX5b');
  for (const c of G.playing_cards) c.ability.mf_played_this_game = true;
  b.set_blind(P_BLINDS.bl_mf_pillar_dx); flush();
  const deb = G.playing_cards.filter((c) => c.debuff).length;
  ok(deb > 10 && deb < 42, 'Pillar DX: about half of the played cards stay debuffed', deb);
  for (const [key, suit] of [['bl_mf_club_dx', 'Clubs'], ['bl_mf_goad_dx', 'Spades'], ['bl_mf_window_dx', 'Diamonds'], ['bl_mf_head_dx', 'Hearts']]) {
    fight(key, 'DX' + key);
    ok(G.playing_cards.every((c) => c.debuff === !c.is_suit(suit, true)), `${key}: all non-${suit} debuffed`);
  }
  // Arm DX: played hand to level 0
  fight('bl_mf_arm_dx', 'DX6'); clearHand();
  G.GAME.hands.Pair.level = 3;
  play(hand(['S_A', 'H_A']));
  ok(G.GAME.hands.Pair.level === 0, 'Arm DX: Pair level 3 -> 0', G.GAME.hands.Pair.level);
  // Wheel DX: only one card face up
  fight('bl_mf_wheel_dx', 'DX7');
  ok(G.hand.cards.filter((c) => c.facing === 'front').length === 1, 'Wheel DX: one card face up', G.hand.cards.map((c) => c.facing));
  // House DX: first hand discarded (and FIX: a new hand drawn)
  fight('bl_mf_house_dx', 'DX8');
  ok(G.discard.cards.length === 8 && G.hand.cards.length === 8 && G.GAME.current_round.discards_left === G.GAME.round_resets.discards, 'House DX: the first hand is discarded (no discard used) and fix: a new hand is drawn', [G.discard.cards.length, G.hand.cards.length]);
  // Hook DX: after a play, the redrawn hand is discarded and redrawn
  fight('bl_mf_hook_dx', 'DX9');
  const firstIds = G.hand.cards.map((c) => c.sort_id);
  G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' });
  ok(G.hand.cards.length === 8 && !G.hand.cards.some((c) => firstIds.includes(c.sort_id)), 'Hook DX: whole hand discarded after the play, then fix: redrawn', G.hand.cards.length);
  // Psychic DX: 5 cards are not allowed
  fight('bl_mf_psychic_dx', 'DX10'); clearHand();
  const ps = play(hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_7']));
  ok(ps.total.total === 0, 'Psychic DX: a 5-card hand scores nothing');
  // Serpent DX: no redraw until the hand is empty
  fight('bl_mf_serpent_dx', 'DX11');
  discard([G.hand.cards[0]]);
  ok(G.hand.cards.length === 7, 'Serpent DX: no redraw after a discard', G.hand.cards.length);
  // DX bosses only after the win ante; never as the vanilla ante-8 showdown
  start('DXPOOL', { noBlind: true, boss: null });
  ok(!P_BLINDS.bl_mf_hook_dx.in_pool(P_BLINDS.bl_mf_hook_dx) && !P_BLINDS.bl_mf_bigger_blind.in_pool(), 'DX bosses out of the pool up to the win ante, Bigger Blind never');
  G.GAME.round_resets.ante = 16;
  ok(P_BLINDS.bl_mf_hook_dx.in_pool(P_BLINDS.bl_mf_hook_dx), 'DX bosses in the pool past the win ante');
}
{
  // ---- The Ticket and a full Superboss ante, as the mod's own test the_ticket (win_ante 2)
  start('MFSB', { noBlind: true, boss: 'bl_wheel' });
  G.FORCE_BOSS = null;
  G.GAME.win_ante = 2;
  G.GAME.dollars = 0;
  act({ type: 'select_blind' }); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  act({ type: 'select_blind' }); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.name === 'The Wheel', 'ante 1 boss');
  winRound(); act({ type: 'cash_out' });
  ok(G.GAME.round_resets.ante === 2 && G.STATE === STATES.SHOP, 'shop of ante 2 (= win ante)');
  const ticket = G.shop_vouchers.cards.find((c) => c.config.center.key === 'v_mf_superboss_ticket');
  ok(ticket && ticket.cost === -10, 'The Ticket is in the shop for $-10', ticket && ticket.cost);
  const d0 = G.GAME.dollars;
  ok(act({ type: 'buy', id: ticket.sort_id }).ok, 'buy The Ticket');
  flush();
  const rr = G.GAME.round_resets;
  ok(G.GAME.dollars === d0 + 10 && G.GAME.superboss_active && G.GAME.modifiers.scaling === 4, 'Ticket: +$10, Superboss on, scaling 1 -> 4', [G.GAME.dollars - d0, G.GAME.modifiers.scaling]);
  ok(rr.blind_choices.Small === 'bl_mf_bigger_blind' && P_BLINDS[rr.blind_choices.Big].boss && P_BLINDS[rr.blind_choices.Boss].debuff.superboss, 'Superboss blinds: Bigger / boss / DX', rr.blind_choices);
  ok(toView().music === 'mf_music_duelzone', 'DUEL ZONE plays');
  act({ type: 'next_round' });
  ok(!act({ type: 'skip_blind' }).ok, 'no skipping during Superboss');
  act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.name === 'Bigger Blind' && G.GAME.blind.chips === get_blind_amount(2) && G.GAME.blind.get_type() === 'Small', 'Bigger Blind: X1, a Small blind');
  winRound(); act({ type: 'cash_out' });
  ok(rr.blind_states.Small === 'Defeated' && rr.ante === 2, 'Bigger Blind fills the Small slot');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.boss && !G.GAME.blind.debuff.superboss, 'Big slot: a regular boss');
  winRound();
  ok(!G.GAME.won && rr.ante === 2, 'beating the Big-slot boss neither wins nor ends the ante');
  act({ type: 'cash_out' });
  ok(rr.blind_states.Big === 'Defeated', 'Big slot defeated');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.debuff.superboss, 'Boss slot: the DX boss', G.GAME.blind.name);
  G.GAME.blind.disabled = false;
  winRound();
  flush();
  ok(G.GAME.won && rr.ante === 3, 'beating the DX boss of the win ante wins the run (and ends the ante)');
  ok(!G.GAME.superboss_active && G.GAME.modifiers.scaling === 1 && rr.blind_choices.Small === 'bl_small' && rr.blind_choices.Big === 'bl_big', 'Superboss ends: scaling back, blinds back');
  act({ type: 'cash_out' });
  ok(!G.shop_vouchers.cards.some((c) => c.config.center.key === 'v_mf_superboss_ticket'), 'no Ticket past the win ante');
  ok(STATUS.challenges[0] === 'c_mf_superboss_always', 'challenge data registered');
}

// ===================================================================== temporary cards (Blade Dance)
{
  start('MFTMP');
  const t = hand(['S_9'], 'm_steel')[0];
  t.ability.mf_temporary = true;
  winRound();
  ok(!G.playing_cards.includes(t) && !t.area, 'temporary cards dissolve at the end of the round');
}

done();
