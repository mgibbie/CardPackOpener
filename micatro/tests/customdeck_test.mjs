// Custom decks — the native deck editor's engine side (micatro/js/engine/customdeck.js), a rebuild
// of the Deck Creator mod. Definitions -> the exact starting state; every ported rule option FIRES
// (and is a no-op when off); validation clamps; share codes round-trip; a custom-deck run replays
// from its recipe; the owner's Goth Deck example loads and starts a run; a run without a custom deck
// never activates the internal mod.
//   node micatro/tests/customdeck_test.mjs
import { T, clearHand, hand, add, play, discard, winRound, nextRound, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './mods/oio_helpers.mjs';
import { newRun, legal } from '../js/engine/run.js';
import { Card, create_card, get_current_pool, get_blind_amount } from '../js/engine/core.js';
import { Session } from '../js/engine/session.js';
import { toView } from '../js/engine/view.js';
import { MODS, ACTIVE } from '../js/mods/registry.js';
import * as CD from '../js/engine/customdeck.js';

const { ok, done } = T();
const H = MODS.customdeck.hooks;

/** A run with a custom deck (rules / params / ...), The Wall as boss; blind selected + empty hand unless noBlind. */
function run(def, { seed = 'CDT', noBlind = false, boss = 'bl_wall' } = {}) {
  newRun({ seed, customDeck: { name: 'Test', ...def } });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
  G.E_MANAGER.flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
const rules = (r, extra = {}) => run({ rules: r, ...extra }, extra.opts || {});
const ev = (res, type) => res.events.filter((e) => e.type === type);
/** Win the current round and stop at the cash-out screen. */
function toEval() { winRound(); G.E_MANAGER.flush(); }
/** From the current blind to the shop. */
function toShop() { if (G.STATE === STATES.SELECTING_HAND) toEval(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); }
function openPack(key) {
  const c = new Card(P_CARDS.empty, P_CENTERS[key]);
  G.shop_booster.emplace(c);
  G.GAME.dollars = Math.max(G.GAME.dollars, 50);
  const r = act({ type: 'buy', id: c.sort_id });
  return { r, card: c };
}
const centers = (area) => area.cards.map((c) => c.config.center.key);

// ===================================================================== off = gone
{
  newRun({ seed: 'VAN' });
  ok(!ACTIVE.includes('customdeck') && G.GAME.mods.length === 0 && !G.GAME.custom_deck, 'a run without a custom deck never activates the internal mod');
  ok(G.GAME.selected_back_key === 'b_red' && G.playing_cards.length === 52, 'vanilla run unchanged (Red Deck, 52 cards)');
  run({}, { noBlind: true });
  ok(ACTIVE.includes('customdeck') && G.GAME.mods.length === 0 && !('customdeck' in G.GAME.mod_options), 'a custom-deck run activates it, but never lists it in G.GAME.mods / mod_options');
  ok(G.GAME.selected_back_key === CD.CUSTOM_DECK_BACK && G.GAME.selected_back.name === 'Challenge Deck', 'a custom deck plays on the neutral Challenge back (no Red Deck +1 discard)');
  ok(G.GAME.round_resets.discards === 3 && G.GAME.round_resets.hands === 4 && G.GAME.dollars === 4 && G.hand.config.card_limit === 8 && G.jokers.config.card_limit === 5 && G.consumeables.config.card_limit === 2, 'an empty definition = vanilla numbers (3 discards, 4 hands, $4, 8 hand, 5/2 slots)');
  ok(G.playing_cards.length === 52, 'and the standard 52');
  const v = toView();
  ok(v.custom_deck && v.custom_deck.name === 'Test' && v.back === 'b_red' && v.mods.length === 0, 'the view carries the custom deck (name, back art) for spectators', v.custom_deck);
}

// ===================================================================== params -> starting state
{
  const params = { dollars: 25, hands: 6, discards: 1, hand_size: 10, joker_slots: 7, consumable_slots: 4, reroll_cost: 2, money_per_hand: 3, money_per_discard: 2,
    interest_amount: 2, interest_cap: 10, discount_percent: 50, discard_cost: 1, ante_scaling: 2, blind_scaling: 0.5, win_ante: 4,
    joker_rate: 0, tarot_rate: 30, planet_rate: 0, spectral_rate: 10, playing_card_rate: 5 };
  run({ params }, { noBlind: true });
  const g = G.GAME;
  ok(g.dollars === 25 && g.round_resets.hands === 6 && g.round_resets.discards === 1, 'dollars / hands / discards');
  ok(G.hand.config.card_limit === 10 && G.jokers.config.card_limit === 7 && G.consumeables.config.card_limit === 4, 'hand size / joker slots / consumable slots');
  ok(g.current_round.reroll_cost === 2 && g.base_reroll_cost === 2, 'reroll cost');
  ok(g.interest_amount === 2 && g.interest_cap === 50 && g.discount_percent === 50, 'interest amount / cap ($10 of interest = $50 held) / discount');
  ok(g.modifiers.money_per_hand === 3 && g.modifiers.money_per_discard === 2 && g.modifiers.discard_cost === 1, '$ per hand / per discard / discard cost');
  ok(g.starting_params.ante_scaling === 2 && g.win_ante === 4, 'ante scaling / winning ante');
  ok(get_blind_amount(1) === 150 && toView().choices.Small.chips === 150 * 2, 'blind score multiplier 0.5 (300 -> 150) and ante scaling x2 on the requirement', toView().choices.Small.chips);
  ok(g.joker_rate === 0 && g.tarot_rate === 30 && g.planet_rate === 0 && g.spectral_rate === 10 && g.playing_card_rate === 5, 'appearance rates');
  // discard cost + $/discard + $/hand at the cash out
  act({ type: 'select_blind' }); clearHand();
  const cs = hand(['S_2', 'S_3']);
  const d0 = G.GAME.dollars;
  discard([cs[0]]);
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0 - 1, 'each discard costs $1 (discard cost)');
  G.GAME.current_round.discards_left = 1;
  winRound(); G.E_MANAGER.flush();
  const rows = G.GAME.round_eval.rows;
  const hr = rows.find((r) => r.name === 'hands'), dr = rows.find((r) => r.name === 'discards');
  ok(hr && hr.dollars === hr.disp * 3 && dr && dr.dollars === 2, '$3 per hand left and $2 per discard left at the cash out', rows);
  // all appearance rates 0: one of Joker/Tarot/Planet/Spectral becomes 100 (seeded)
  run({ params: { joker_rate: 0, tarot_rate: 0, planet_rate: 0, spectral_rate: 0, playing_card_rate: 0 } }, { noBlind: true });
  const hundred = ['joker_rate', 'tarot_rate', 'planet_rate', 'spectral_rate'].filter((k) => G.GAME[k] === 100);
  ok(hundred.length === 1, 'all rates 0 -> one of Joker/Tarot/Planet/Spectral becomes 100 (Deck Creator)', hundred);
  run({ params: { money_per_hand: 0 } });
  winRound(); G.E_MANAGER.flush();
  ok(G.GAME.modifiers.no_extra_hand_money && !G.GAME.round_eval.rows.some((r) => r.name === 'hands'), '$0 per hand -> no "remaining hands" money');
}

// ===================================================================== cards / items / bans
{
  run({ cards: [['H_A', 'm_glass', 'foil', 'Red', 3], ['S_K', 0, 'negative', 0, 1], ['C_2', 'm_gold', 0, 'Purple', 2]] }, { noBlind: true });
  const pc = G.playing_cards.map((c) => [c.config.card.key, c.config.center.key, c.edition && c.edition.type, c.seal]);
  const n = (k) => pc.filter((x) => x.join() === k).length;
  ok(G.playing_cards.length === 6 && G.GAME.starting_deck_size === 6 && G.deck.cards.length === 6, 'a custom card list: 6 cards in the deck', pc);
  ok(n('H_A,m_glass,foil,Red') === 3 && n('S_K,c_base,negative,') === 1 && n('C_2,m_gold,,Purple') === 2, 'every card has its rank, suit, enhancement, edition and seal', pc);
  ok(G.playing_cards.every((c) => c.playing_card >= 1) && new Set(G.playing_cards.map((c) => c.playing_card)).size === 6, 'playing_card ids 1..6');
  run({ cards: [] }, { noBlind: true });
  ok(G.playing_cards.length === 0, 'an empty deck is allowed (the run ends when you can\'t draw)');
  // jokers with stickers, consumables, vouchers, tags
  run({
    jokers: [{ key: 'j_joker', edition: 'negative', eternal: true, n: 2 }, { key: 'j_greedy_joker', perishable: true, rental: true, pinned: true }, { key: 'j_nonexistent_x' }],
    consumables: [{ key: 'c_fool', n: 2 }, { key: 'c_pluto', edition: 'negative' }],
    vouchers: ['v_paint_brush', 'v_reroll_surplus', 'v_crystal_ball', 'v_grabber'],
    tags: [{ key: 'tag_economy' }, { key: 'tag_double', n: 2 }],
  }, { noBlind: true });
  const js = G.jokers.cards;
  ok(js.length === 3 && js.filter((j) => j.config.center.key === 'j_joker' && j.edition && j.edition.negative && j.ability.eternal).length === 2, '2 Eternal Negative Jokers (an unknown key is skipped)', centers(G.jokers));
  const gj = js.find((j) => j.config.center.key === 'j_greedy_joker');
  ok(gj && gj.ability.perishable && gj.ability.rental && gj.pinned, 'Perishable + Rental + Pinned', gj && gj.ability);
  ok(G.jokers.config.card_limit === 7, 'Negative jokers add their slots (5 + 2)');
  ok(centers(G.consumeables).join() === 'c_fool,c_fool,c_pluto' && G.consumeables.cards[2].edition && G.consumeables.cards[2].edition.negative, 'consumables (2 Fools + a Negative Pluto)', centers(G.consumeables));
  ok(G.consumeables.config.card_limit === 2 + 1 + 1, 'Crystal Ball +1 and the Negative Pluto +1 consumable slot');
  ok(G.GAME.used_vouchers.v_paint_brush && G.hand.config.card_limit === 9, 'Paint Brush: +1 hand size AFTER the deck\'s hand size (Deck Creator special-cased it)', G.hand.config.card_limit);
  ok(G.GAME.round_resets.reroll_cost === 3 && G.GAME.current_round.reroll_cost === 3, 'Reroll Surplus applies on top of the deck\'s reroll cost (5 - 2)', G.GAME.round_resets.reroll_cost);
  ok(G.GAME.round_resets.hands === 5 && G.GAME.starting_voucher_count === 4, 'Grabber: +1 hand; 4 starting vouchers');
  ok(G.GAME.tags.map((t) => t.key).join() === 'tag_double,tag_double' && G.GAME.dollars === 8, 'starting tags: the Economy Tag already paid ($4 -> $8), two Double Tags wait', [G.GAME.tags.map((t) => t.key), G.GAME.dollars]);
  // bans
  run({ bans: { jokers: ['j_joker'], consumables: ['c_fool'], vouchers: ['v_overstock_norm'], tags: ['tag_rare'], blinds: ['bl_hook'], boosters: ['p_arcana_normal_1'] } }, { noBlind: true });
  const bk = G.GAME.banned_keys;
  ok(bk.j_joker && bk.c_fool && bk.v_overstock_norm && bk.tag_rare && bk.bl_hook && bk.p_arcana_normal_1, 'bans -> banned_keys');
  const [jp] = get_current_pool('Joker', 0.1);
  ok(!jp.includes('j_joker'), 'a banned joker never enters a pool');
  // banning every ante-1 boss is refused (the run needs one): the blind bans are dropped
  run({ bans: { blinds: ['bl_club', 'bl_goad', 'bl_head', 'bl_hook', 'bl_manacle', 'bl_pillar', 'bl_psychic', 'bl_window'] } }, { noBlind: true });
  ok(!G.GAME.banned_keys.bl_club && typeof G.GAME.round_resets.blind_choices.Boss === 'string', 'banning every ante-1 boss is ignored (no boss-less run)');
  run({ bans: { blinds: ['bl_final_acorn', 'bl_final_bell', 'bl_final_heart', 'bl_final_leaf', 'bl_final_vessel'] } }, { noBlind: true });
  ok(!G.GAME.banned_keys.bl_final_bell, 'banning every showdown boss is ignored too');
}

// ===================================================================== validation
{
  const v = CD.validateDeck({ name: 'x'.repeat(99) + '\u0000', desc: 7, back: 'zzz', mods: ['pokermon', 'BAD MOD', 'customdeck'],
    params: { dollars: 1e9, hands: -5, hand_size: 'lots', blind_scaling: 0.0001, win_ante: 3.7 },
    cards: [['H_A', 'm_glass', 'holographic', 'Red', 1e6], ['nope'], { front: 'S_2', n: 3 }, 'junk'],
    jokers: Array.from({ length: 80 }, () => ({ key: 'j_joker', n: 5, eternal: true, perishable: true })),
    consumables: [{ key: 'c_fool', edition: 'foil' }], vouchers: ['v_grabber', 'v_grabber', '<script>'],
    tags: [{ key: 'tag_double', n: 999 }], bans: { jokers: Array.from({ length: 5000 }, (_, i) => 'j_x' + i) },
    rules: { aces_are_faces: 'yes', balance_percent: 500, shop_slots: 99, eternal_rate: 30, nope: 1 } });
  ok(v.name.length === CD.LIMITS.name && v.desc === '7' && v.back === 'b_red', 'name clipped to 32, back defaults to Red', v.name);
  ok(v.mods.join() === 'pokermon', 'mods: only valid ids, never the internal one', v.mods);
  ok(v.params.dollars === 9999 && v.params.hands === 1 && v.params.hand_size === 8 && v.params.blind_scaling === 0.05 && v.params.win_ante === 4, 'params clamped / defaulted / rounded', v.params);
  ok(v.cards.length === 1 && v.cards[0][4] === CD.LIMITS.cards && v.cards[0][2] === 'holo', 'cards: count capped at 500 in total (nothing after the cap)', v.cards);
  const v2 = CD.validateDeck({ cards: [['H_A', 'm_glass', 'holographic', 'Red', 2], ['nope'], { front: 'S_2', n: 3 }, 'junk', ['S_3', 'm_<x>', 'shiny?', '???', 1]] });
  ok(JSON.stringify(v2.cards) === JSON.stringify([['H_A', 'm_glass', 'holo', 'Red', 2], ['S_2', 0, 0, 0, 3], ['S_3', 0, 0, 0, 1]]), 'junk entries dropped, bad fields zeroed', v2.cards);
  ok(v.jokers.reduce((a, j) => a + j.n, 0) === CD.LIMITS.jokers && v.jokers[0].eternal && !v.jokers[0].perishable, 'jokers capped at 50 copies; never Eternal AND Perishable');
  ok(v.consumables[0].edition === undefined, 'a consumable is only Negative / random edition');
  ok(v.vouchers.join() === 'v_grabber', 'vouchers deduped, bad keys dropped');
  ok(v.tags[0].n === CD.LIMITS.tags, 'tags capped at 30');
  ok(v.bans.jokers.length === CD.LIMITS.bans, 'bans capped (2000)');
  ok(v.rules.aces_are_faces === undefined && v.rules.balance_percent === 100 && v.rules.shop_slots === 5 && !('eternal_rate' in v.rules) && !('nope' in v.rules), 'rules: wrong types ignored, numbers clamped, defaults + unknown keys dropped', v.rules);
  ok(JSON.stringify(CD.validateDeck(v)) === JSON.stringify(v), 'validation is idempotent');
  ok(JSON.stringify(CD.validateDeck(null)).length < 2000 && CD.validateDeck([1, 2]).name === 'Custom Deck', 'garbage in -> a default deck out');
  // a huge definition stays bounded and starts fast
  const t0 = Date.now();
  run({ cards: Array.from({ length: 2000 }, () => ['S_A', 'm_steel', 'polychrome', 'Gold', 50]), rules: { random_glass_cards: 9999, random_edition_cards: 9999 } }, { noBlind: true });
  ok(G.playing_cards.length === CD.LIMITS.cards && Date.now() - t0 < 4000, 'a huge definition is capped at 500 cards and starts quickly', { n: G.playing_cards.length, ms: Date.now() - t0 });
}

// ===================================================================== share codes
{
  const def = CD.validateDeck({ name: 'Code Deck', cards: CD.CARD_PRESETS.find((p) => p.id === 'checkered').cards(), jokers: [{ key: 'j_joker' }], rules: { aces_are_faces: true, balance_percent: 25 } });
  const code = await CD.encodeDeck(def);
  ok(/^MCD1\.[A-Za-z0-9_-]+$/.test(code) && code.length < 1200, 'a share code is MCD1.<base64url gzip>', code.length);
  const back = await CD.decodeDeck(code);
  ok(JSON.stringify(back) === JSON.stringify(def), 'the code round-trips to the same definition');
  ok(await CD.decodeDeck('MCD1.garbage!!') === null && await CD.decodeDeck('hello') === null && await CD.decodeDeck('') === null, 'garbage codes decode to null');
  const raw = 'MCDR1.' + Buffer.from(JSON.stringify({ name: 'Raw', params: { hands: 99 } })).toString('base64url');
  const rd = await CD.decodeDeck(raw);
  ok(rd && rd.name === 'Raw' && rd.params.hands === 25, 'an uncompressed code decodes (and is validated)');
}

// ===================================================================== presets
{
  const n = (id) => { const c = CD.CARD_PRESETS.find((p) => p.id === id).cards(); return c ? c.reduce((a, x) => a + x[4], 0) : 52; };
  ok(n('standard') === 52 && n('no_faces') === 40 && n('checkered') === 52 && n('faces_aces') === 16 && n('numbers') === 36 && n('empty') === 0, 'card presets: 52 / 40 / 52 / 16 / 36 / 0');
  run({ cards: CD.CARD_PRESETS.find((p) => p.id === 'checkered').cards() }, { noBlind: true });
  ok(G.playing_cards.every((c) => c.base.suit === 'Spades' || c.base.suit === 'Hearts'), 'Checkered preset: only Spades + Hearts');
}

// ===================================================================== GAMEPLAY rules
{
  rules({ aces_are_faces: true, sevens_are_faces: true, stones_are_faces: true });
  const [a, s, st, f] = hand(['H_A', 'H_7', 'H_5', 'H_4']);
  st.set_ability(P_CENTERS.m_stone);
  ok(a.is_face() && s.is_face() && st.is_face() && !f.is_face(), 'Aces / 7s / Stones are face cards');
  rules({});
  const [a2, s2] = hand(['H_A', 'H_7']);
  ok(!a2.is_face() && !s2.is_face(), '(off: not faces)');
}
{
  rules({ chips_dollar_cap: true });
  ok(G.GAME.modifiers.chips_dollar_cap === true, 'Chips cannot exceed current $ (the vanilla modifier)');
  G.GAME.dollars = 7;
  const r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips <= 7, 'a Pair scores at most $7 of chips', r.total);
}
{
  rules({ minus_hand_size_per_X_dollar: true });
  ok(G.hand.config.card_limit === 8, '$4: no hand size lost yet');
  G.GAME.dollars = 12;
  act({ type: 'sort_hand', by: 'rank' });
  ok(G.hand.config.card_limit === 6, '$12: -2 hand size (-1 per $5)', G.hand.config.card_limit);
  G.GAME.dollars = 3;
  act({ type: 'sort_hand', by: 'rank' });
  ok(G.hand.config.card_limit === 8, 'and it comes back when the money goes', G.hand.config.card_limit);
}
{
  rules({ debuff_played_cards: true });
  const cs = hand(['S_A', 'H_A']);
  play(cs);
  G.E_MANAGER.flush();
  ok(cs.every((c) => c.ability.perma_debuff), 'played cards are debuffed after scoring');
}
{
  rules({ death_targets_random_card: true });
  const cs = hand(['S_2', 'S_3', 'S_4', 'S_K']);
  const death = add('c_death');
  act({ type: 'use', id: death.sort_id, targets: [cs[0].sort_id, cs[1].sort_id] });
  G.E_MANAGER.flush();
  const keys = G.hand.cards.map((c) => c.config.card.key).sort();
  ok(cs[0].config.card.key === 'S_2' && keys.filter((k) => k === 'S_3').length === 2, 'Death: the rightmost selected card is copied onto a random OTHER card (the leftmost stays)', keys);
  rules({});
  const cs2 = hand(['S_2', 'S_3', 'S_4', 'S_K']);
  const d2 = add('c_death');
  act({ type: 'use', id: d2.sort_id, targets: [cs2[0].sort_id, cs2[1].sort_id] });
  G.E_MANAGER.flush();
  ok(cs2[0].config.card.key === 'S_3', '(off: Death copies onto the leftmost)');
}
{
  rules({ spectral_cards_cannot_destroy_jokers: true });
  add('j_joker'); add('j_greedy_joker');
  const ankh = add('c_ankh');
  act({ type: 'use', id: ankh.sort_id });
  G.E_MANAGER.flush();
  ok(G.jokers.cards.length === 3, 'Ankh copies a Joker without destroying the others', centers(G.jokers));
  const hex = add('c_hex');
  act({ type: 'use', id: hex.sort_id });
  G.E_MANAGER.flush();
  ok(G.jokers.cards.length === 3 && G.jokers.cards.filter((j) => j.edition && j.edition.polychrome).length === 1, 'Hex makes one Polychrome without destroying the others');
}
{
  rules({ ectoplasm_cannot_change_hand_size: true });
  add('j_joker');
  const e = add('c_ectoplasm');
  act({ type: 'use', id: e.sort_id });
  G.E_MANAGER.flush();
  ok(G.hand.config.card_limit === 8 && G.jokers.cards[0].edition && G.jokers.cards[0].edition.negative, 'Ectoplasm: Negative joker, hand size kept');
}
{
  rules({ ouija_cannot_change_hand_size: true });
  hand(['S_2', 'H_9', 'C_K']);
  const o = add('c_ouija');
  act({ type: 'use', id: o.sort_id });
  G.E_MANAGER.flush();
  ok(G.hand.config.card_limit === 8 && new Set(G.hand.cards.map((c) => c.base.value)).size === 1, 'Ouija: one rank for the hand, hand size kept');
}
{
  rules({ wraith_cannot_set_money_to_zero: true });
  G.GAME.dollars = 30;
  const w = add('c_wraith');
  act({ type: 'use', id: w.sort_id });
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === 30 && G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.rarity === 3, 'Wraith: a Rare joker, money kept', G.GAME.dollars);
}
{
  rules({ spectral_seals_add_additional: true });
  const cs = hand(['S_2', 'H_9', 'C_K']);
  const t = add('c_talisman');
  act({ type: 'use', id: t.sort_id, targets: [cs[0].sort_id] });
  G.E_MANAGER.flush();
  ok(cs[0].seal === 'Gold' && G.hand.cards.filter((c) => c.seal === 'Gold').length === 2, 'Talisman seals the target AND one more card', G.hand.cards.map((c) => c.seal));
}
{
  rules({ no_spectral_destroy_cards: true });
  hand(['S_2', 'H_9']);
  const f = add('c_familiar');
  act({ type: 'use', id: f.sort_id });
  G.E_MANAGER.flush();
  ok(G.hand.cards.length === 5, 'Familiar adds 3 face cards without destroying one', G.hand.cards.length);
  const d0 = G.GAME.dollars;
  const im = add('c_immolate');
  act({ type: 'use', id: im.sort_id });
  G.E_MANAGER.flush();
  ok(G.hand.cards.length === 5 && G.GAME.dollars === d0 + 20, 'Immolate pays $20 without destroying cards');
}
{
  rules({ balance_percent: 100 });
  const r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === r.total.mult && r.total.chips === Math.floor((32 + 2) / 2), 'Balance 100%: chips and mult balanced (Plasma)', r.total);
  rules({ balance_percent: 0 });
  const r2 = play(hand(['S_A', 'H_A']));
  ok(r2.total.chips === 32 && r2.total.mult === 2, '(0%: not balanced)', r2.total);
}
{
  rules({ flipped_cards: 1 }, { opts: { noBlind: true } });
  ok(G.GAME.modifiers.flipped_cards === 1, '1 in X drawn face down -> modifiers.flipped_cards');
  act({ type: 'select_blind' });
  ok(G.hand.cards.length === 8 && G.hand.cards.every((c) => c.facing === 'back'), '1 in 1: every drawn card is face down');
}
{
  rules({ draw_to_hand_size: 2 }, { opts: { noBlind: true } });
  act({ type: 'select_blind' });
  ok(G.hand.cards.length === 8, 'the first draw fills the hand');
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id, G.hand.cards[1].sort_id, G.hand.cards[2].sort_id] });
  act({ type: 'discard' });
  ok(G.hand.cards.length === 7, 'after a discard of 3, only 2 cards are drawn', G.hand.cards.length);
}
{
  rules({ extra_hand_level_upgrades: 2 });
  const p = add('c_pluto');
  act({ type: 'use', id: p.sort_id });
  G.E_MANAGER.flush();
  ok(G.GAME.hands['High Card'].level === 4, 'Pluto levels High Card by 1 + 2 extra', G.GAME.hands['High Card'].level);
}
{
  rules({ chance_to_increase_discard_cards_rank: 100 });
  const [c] = hand(['S_5', 'S_9']);
  discard([c]);
  G.E_MANAGER.flush();
  ok(c.config.card.key === 'S_6', 'a discarded 5 becomes a 6', c.config.card.key);
}
{
  run({ cards: [['S_2', 0, 0, 0, 20]], rules: { chance_to_increase_drawn_cards_rank: 100 } }, { noBlind: true });
  act({ type: 'select_blind' });
  ok(G.hand.cards.length === 8 && G.hand.cards.every((c) => c.config.card.key === 'S_3'), 'every drawn 2 becomes a 3', G.hand.cards.map((c) => c.config.card.key));
  ok(G.deck.cards.every((c) => c.config.card.key === 'S_2'), 'cards left in the deck are untouched');
}
{
  rules({ mult_reduction_percent: 50, chip_reduction_percent: 25 });
  const r = play(hand(['S_A', 'H_A']));
  ok(r.total.chips === 32 * 0.75 && r.total.mult === 1, 'Mult -50% and Chips -25% at the final scoring step (Deck Creator\'s were no-ops — fixed)', r.total);
}
{
  rules({ multiply_probabilities: 3, divide_probabilities: 2 }, { opts: { noBlind: true } });
  ok(G.GAME.probabilities.normal === 1.5, 'probabilities x3 / 2', G.GAME.probabilities.normal);
}
{
  rules({ edition_rate: 7 }, { opts: { noBlind: true } });
  ok(G.GAME.edition_rate === 7, 'edition rate');
}
{
  rules({ destroy_random_joker_after_ante_four: 100 });
  const j = add('j_joker');
  const e = add('j_greedy_joker'); e.set_eternal(true);
  G.GAME.round_resets.ante = 4;
  for (let i = 0; i < 3 && !G.GAME.blind.boss; i++) nextRound();
  ok(G.GAME.blind.boss && G.GAME.round_resets.ante === 4, 'ante 4 boss');
  toEval();
  ok(!G.jokers.cards.includes(j) && G.jokers.cards.includes(e), 'a random non-Eternal joker is destroyed at the end of Ante 4');
}
// ===================================================================== MONEY rules
{
  rules({ full_price_jokers: true, full_price_consumables: true });
  const j = add('j_joker'), t = add('c_fool');
  ok(j.sell_cost === j.cost && t.sell_cost === t.cost, 'jokers / consumables sell for full price', [j.sell_cost, j.cost, t.sell_cost]);
  rules({});
  const j2 = add('j_joker');
  ok(j2.sell_cost === Math.max(1, Math.floor(j2.cost / 2)), '(off: half price)');
}
{
  rules({ inflation: true, negative_fifty_dollars_allowed: true }, { opts: { noBlind: true } });
  ok(G.GAME.modifiers.inflation && G.GAME.bankrupt_at === -50, 'inflation; funds may drop to -$50');
}
{
  rules({ booster_ante_scaling: 2 }, { opts: { noBlind: true } });
  G.GAME.round_resets.ante = 3;
  const b = new Card(P_CARDS.empty, P_CENTERS.p_arcana_normal_1);
  ok(b.cost === 4 + 2 * 2, 'a booster costs $2 more per ante (ante 3: +$4)', b.cost);
}
{
  rules({ negative_joker_money: 3, enhanced_dollars_per_round: 1 });
  add('j_joker', 'negative'); add('j_joker', 'negative');
  for (const c of G.playing_cards.slice(0, 5)) c.set_ability(P_CENTERS.m_bonus);
  toEval();
  const rows = G.GAME.round_eval.rows;
  ok(rows.some((r) => r.custom_deck && r.dollars === 6 && /Negative/.test(r.name)) && rows.some((r) => r.custom_deck && r.dollars === 5 && /Enhanced/.test(r.name)), '$3 per Negative joker and $1 per Enhanced card at the cash out', rows);
}
{
  rules({ gain_dollars_when_skip_booster: 5 });
  toShop();
  const { card } = openPack('p_arcana_normal_1');
  const d0 = G.GAME.dollars;
  act({ type: 'skip_booster' });
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0 + 5 && card, '+$5 for skipping a booster');
}
{
  rules({ random_sell_value_increase: 4 });
  const j = add('j_joker');
  toEval();
  ok(j.ability.extra_value === 4 && j.sell_cost === 1 + 4, 'a random joker gains $4 of sell value each round', j.ability.extra_value);
  rules({ random_sell_value_decrease: 3 });
  const j2 = add('j_joker'); j2.ability.extra_value = 5; j2.set_cost();
  toEval();
  ok(j2.ability.extra_value === 2, 'and loses $3 (never below 0)', j2.ability.extra_value);
}
// ===================================================================== SHOP rules
{
  rules({ reroll_boosters: true });
  toShop();
  const before = G.shop_booster.cards.map((c) => c.sort_id);
  G.GAME.dollars = 50;
  act({ type: 'reroll_shop' });
  const after = G.shop_booster.cards.map((c) => c.sort_id);
  ok(before.length === 2 && after.length === 2 && after.every((id) => !before.includes(id)), 'a reroll replaces the boosters too', [before, after]);
}
{
  rules({ allow_legendary_jokers_everywhere: true }, { opts: { noBlind: true } });
  let leg = 0;
  for (let i = 0; i < 400; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.config.center.rarity === 4) leg++; c.remove(); }
  rules({}, { opts: { noBlind: true } });
  let leg0 = 0;
  for (let i = 0; i < 400; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, null, 'sho'); if (c.config.center.rarity === 4) leg0++; c.remove(); }
  ok(leg > 0 && leg0 === 0, 'Legendary jokers can roll in the shop (~3%), never without the rule', { leg, leg0 });
}
{
  rules({ enable_eternals_in_shop: true, enable_perishables_in_shop: true, enable_rentals_in_shop: true, all_eternal: true }, { opts: { noBlind: true } });
  const m = G.GAME.modifiers;
  ok(m.enable_eternals_in_shop && m.enable_perishables_in_shop && m.enable_rentals_in_shop && m.all_eternal, 'Eternal / Perishable / Rental jokers in the shop; all jokers Eternal');
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_joker');
  ok(c.ability.eternal, 'all_eternal: a new joker is Eternal');
}
{
  rules({ allow_soul: true, allow_black_hole: true, allow_duplicate_jokers: true });
  const [sp] = get_current_pool('Spectral');
  ok(sp.includes('c_soul') && sp.includes('c_black_hole'), 'The Soul and Black Hole sit in the Spectral pool');
  rules({});
  const [sp0] = get_current_pool('Spectral');
  ok(!sp0.includes('c_soul') && !sp0.includes('c_black_hole'), '(off: hidden)');
  rules({ allow_duplicate_jokers: true });
  add('j_joker');
  const [p1] = get_current_pool('Joker', 0.1);
  ok(p1.includes('j_joker'), 'a held joker can appear again (duplicates)');
  rules({});
  add('j_joker');
  const [p0] = get_current_pool('Joker', 0.1);
  ok(!p0.includes('j_joker'), '(off: no duplicates)');
}
{
  rules({ one_free_card_in_shop: true, voucher_is_free: true, one_free_booster_in_shop: true });
  toShop();
  ok(G.shop_jokers.cards.filter((c) => c.cost === 0).length === 1, 'one shop card is free');
  ok(G.shop_vouchers.cards[0].cost === 0, 'the voucher is free');
  ok(G.shop_booster.cards[0].cost === 0 && G.shop_booster.cards[1].cost > 0, 'the first booster is free');
  G.GAME.dollars = 0;
  const r = act({ type: 'buy', id: G.shop_vouchers.cards[0].sort_id });
  ok(r.ok && G.GAME.dollars === 0, 'a free voucher redeems for $0');
}
{
  rules({ one_free_item_in_shop: true });
  toShop();
  const free = [...G.shop_jokers.cards, ...G.shop_vouchers.cards, ...G.shop_booster.cards].filter((c) => c.cost === 0);
  ok(free.length === 1, 'exactly one shop item is free', free.map((c) => c.config.center.key));
}
{
  rules({ shop_slots: 4, booster_pack_slots: 4, voucher_slots: 3 });
  toShop();
  ok(G.shop_jokers.cards.length === 4 && G.shop_booster.cards.length === 4 && G.shop_vouchers.cards.length === 3, '4 shop slots, 4 boosters, 3 vouchers', [G.shop_jokers.cards.length, G.shop_booster.cards.length, G.shop_vouchers.cards.length]);
  rules({ shop_slots: 0, booster_pack_slots: 0, voucher_slots: 0 });
  toShop();
  ok(G.shop_jokers.cards.length === 0 && G.shop_booster.cards.length === 0 && G.shop_vouchers.cards.length === 0, 'an empty shop (0 / 0 / 0)');
}
{
  const stickers = (r) => {
    rules(r, { opts: { noBlind: true } });
    const out = [];
    for (let i = 0; i < 40; i++) { const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker', 'sho'); out.push(c.ability); c.remove(); }
    return out;
  };
  const e = stickers({ enable_eternals_in_shop: true, eternal_rate: 100 });
  ok(e.every((a) => a.eternal), 'Eternal rate 100%: every shop joker Eternal');
  const p = stickers({ enable_perishables_in_shop: true, perishable_rate: 100 });
  ok(p.every((a) => a.perishable), 'Perishable rate 100%');
  const rr = stickers({ enable_rentals_in_shop: true, rental_rate: 100 });
  ok(rr.every((a) => a.rental), 'Rental rate 100%');
  const z = stickers({ enable_eternals_in_shop: true, enable_rentals_in_shop: true, eternal_rate: 0, rental_rate: 0 });
  ok(z.every((a) => !a.eternal && !a.rental), 'rates 0%: none');
}
// ===================================================================== BOOSTER PACK rules
{
  const kinds = (r, pack, n = 60) => {
    rules(r, { opts: { noBlind: true } });
    const b = new Card(P_CARDS.empty, P_CENTERS[pack]);
    const out = {};
    for (let i = 1; i <= n; i++) { const c = H.pack_card(b, (i % 3) + 1); if (!c) return null; out[c.ability.set] = (out[c.ability.set] || 0) + 1; c.remove(); }
    return out;
  };
  let k = kinds({ spectral_cards_in_arcana: true }, 'p_arcana_normal_1');
  ok(k && k.Spectral > 0 && k.Tarot > 0 && !k.Planet, 'Spectral cards in Arcana packs', k);
  k = kinds({ planet_cards_in_arcana: true }, 'p_arcana_normal_1');
  ok(k && k.Planet > 0 && k.Tarot > 0, 'Planet cards in Arcana packs', k);
  k = kinds({ tarot_cards_in_spectral: true }, 'p_spectral_normal_1');
  ok(k && k.Tarot > 0 && k.Spectral > 0, 'Tarot cards in Spectral packs', k);
  k = kinds({ planet_cards_in_spectral: true }, 'p_spectral_normal_1');
  ok(k && k.Planet > 0, 'Planet cards in Spectral packs', k);
  k = kinds({ tarot_cards_in_celestial: true }, 'p_celestial_normal_1');
  ok(k && k.Tarot > 0 && k.Planet > 0, 'Tarot cards in Celestial packs', k);
  k = kinds({ spectral_cards_in_celestial: true }, 'p_celestial_normal_1');
  ok(k && k.Spectral > 0, 'Spectral cards in Celestial packs', k);
  ok(kinds({}, 'p_arcana_normal_1') === null, '(off: the vanilla generator runs)');
}
{
  rules({ always_telescoping: true });
  G.GAME.hands.Pair.played = 5;
  toShop();
  openPack('p_celestial_normal_1');
  ok(G.pack_cards.cards[0].config.center.key === 'c_mercury', 'Celestial packs always contain the most played hand (Pair -> Mercury)', centers(G.pack_cards));
  rules({ never_telescoping: true });
  G.GAME.hands.Pair.played = 5;
  toShop();
  let merc = 0;
  for (let i = 0; i < 6; i++) {
    openPack('p_celestial_mega_1');
    if (centers(G.pack_cards).includes('c_mercury')) merc++;
    act({ type: 'skip_booster' });
  }
  ok(merc === 0, 'Celestial packs never contain it (30 planets, no Mercury)');
}
{
  const std = (r) => {
    rules(r, { opts: { noBlind: true } });
    const b = new Card(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
    const cs = [];
    for (let i = 0; i < 30; i++) { const c = H.pack_card(b, 1); cs.push({ e: c.config.center.key, d: c.edition && c.edition.type, s: c.seal }); c.remove(); }
    return cs;
  };
  let cs = std({ standard_pack_enhancement_rate: 100, standard_pack_edition_rate: 300, standard_pack_seal_rate: 100 });
  ok(cs.every((c) => c.e !== 'c_base' && c.d && c.s), 'Standard packs: 100% enhanced, an edition on every card (rate 300), 100% sealed', cs.slice(0, 3));
  cs = std({ standard_pack_enhancement_rate: 0, standard_pack_edition_rate: 0, standard_pack_seal_rate: 0 });
  ok(cs.every((c) => c.e === 'c_base' && !c.d && !c.s), 'rates 0: plain cards');
}
{
  rules({ extra_booster_pack_choices: 1, extra_arcana_pack_cards: 2, extra_celestial_pack_cards: 1, extra_spectral_pack_cards: 3, extra_standard_pack_cards: 4, extra_buffoon_pack_cards: 5 });
  toShop();
  const sizes = {};
  for (const [k, p] of [['arcana', 'p_arcana_normal_1'], ['celestial', 'p_celestial_normal_1'], ['spectral', 'p_spectral_normal_1'], ['standard', 'p_standard_normal_1'], ['buffoon', 'p_buffoon_normal_1']]) {
    openPack(p);
    sizes[k] = [G.pack_cards.cards.length, G.GAME.pack_choices];
    act({ type: 'skip_booster' });
  }
  ok(sizes.arcana[0] === 3 + 2 && sizes.celestial[0] === 3 + 1 && sizes.spectral[0] === 2 + 3 && sizes.standard[0] === 3 + 4 && sizes.buffoon[0] === 2 + 5, 'extra cards per pack kind', sizes);
  ok(Object.values(sizes).every(([, ch]) => ch === 2), '+1 choice in every base pack', sizes);
}
{
  rules({ chance_for_free_booster: 100 });
  toShop();
  G.GAME.dollars = 10;
  const c = new Card(P_CARDS.empty, P_CENTERS.p_arcana_normal_1); G.shop_booster.emplace(c);
  act({ type: 'buy', id: c.sort_id });
  ok(G.GAME.dollars === 10 && G.STATE === STATES.TAROT_PACK, 'a booster opens for $0');
}
// ===================================================================== BLIND rules
{
  const after = (r, slot) => {
    rules(r);
    if (slot !== 'Small') { toShop(); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); }
    if (slot === 'Boss') { toShop(); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); }
    toEval();
    const d0 = G.GAME.dollars + G.GAME.current_round.dollars;
    const j0 = G.jokers.cards.length;
    act({ type: 'cash_out' });
    G.E_MANAGER.flush();
    return { state: G.STATE, money: G.GAME.dollars - d0, jokers: G.jokers.cards.length - j0 };
  };
  ok(after({ skip_shop_chance_small_blind: 100 }, 'Small').state === STATES.BLIND_SELECT, 'the shop is skipped after the Small Blind');
  ok(after({ skip_shop_chance_small_blind: 100 }, 'Big').state === STATES.SHOP, '(but not after the Big Blind)');
  ok(after({ skip_shop_chance_big_blind: 100 }, 'Big').state === STATES.BLIND_SELECT, 'after the Big Blind');
  ok(after({ skip_shop_chance_boss: 100 }, 'Boss').state === STATES.BLIND_SELECT, 'after the Boss');
  ok(after({ skip_shop_chance_any: 100 }, 'Big').state === STATES.BLIND_SELECT, 'after any blind');
  ok(after({}, 'Small').state === STATES.SHOP, '(off: the shop opens)');
  const rew = after({ skip_shop_chance_any: 100, chance_for_random_negative_joker_on_shop_skip: 100, chance_for_twenty_dollars_on_shop_skip: 100 }, 'Small');
  ok(rew.money === 20 && rew.jokers === 1 && G.jokers.cards[0].edition && G.jokers.cards[0].edition.negative, 'a skipped shop pays $20 and a Negative joker', rew);
}
{
  rules({ skip_blind_disabled_chance_small_blind: 100 }, { opts: { noBlind: true } });
  ok(!legal().can_skip_blind && act({ type: 'skip_blind' }).ok === false, 'Skip is disabled on the Small Blind');
  rules({ skip_blind_disabled_chance_big_blind: 100 }, { opts: { noBlind: true } });
  ok(legal().can_skip_blind && act({ type: 'skip_blind' }).ok && !legal().can_skip_blind && act({ type: 'skip_blind' }).ok === false, 'on the Big Blind (Small still skippable)');
  rules({ skip_blind_disabled_chance_any: 100 }, { opts: { noBlind: true } });
  ok(!legal().can_skip_blind, 'on every blind');
  rules({}, { opts: { noBlind: true } });
  ok(legal().can_skip_blind, '(off: skippable)');
  const d0 = 4;
  rules({ skip_blind_disabled_chance_small_blind: 100, chance_for_five_dollars_on_skip_disable: 100, chance_for_fifteen_dollars_on_skip_disable: 100, chance_for_negative_joker_on_skip_disable: 100 }, { opts: { noBlind: true } });
  ok(G.GAME.dollars === d0 + 20 && G.jokers.cards.length === 1 && G.jokers.cards[0].edition.negative, 'a disabled Skip pays $5 + $15 and a Negative joker', G.GAME.dollars);
  act({ type: 'sort_hand', by: 'rank' });
  ok(G.GAME.dollars === d0 + 20, 'rolled once per blind, not every time the screen updates');
}
// ===================================================================== SEAL rules
{
  rules({ blue_seal_switch_trigger: true, chance_for_negative_joker_on_blue_seal_trigger: 100 });
  const [b] = hand(['S_9']); b.set_seal('Blue');
  G.GAME.last_hand_played = 'High Card';
  G.GAME.chips = G.GAME.blind.chips;
  play(hand(['S_2']), { keepChips: true });
  G.E_MANAGER.flush();
  ok(b.seal && b.seal !== 'Blue' && G.consumeables.cards.length === 1, 'a triggered Blue Seal switches to another seal (planet still made)', [b.seal, centers(G.consumeables)]);
  ok(G.jokers.cards.length === 1 && G.jokers.cards[0].edition.negative, 'and a Negative joker arrives');
}
{
  rules({ blue_seal_always_most_played: true });
  G.GAME.hands.Flush.played = 9;
  const [b] = hand(['S_9']); b.set_seal('Blue');
  G.GAME.chips = G.GAME.blind.chips;
  play(hand(['S_2']), { keepChips: true });
  G.E_MANAGER.flush();
  ok(centers(G.consumeables).join() === 'c_jupiter', 'a Blue Seal makes the most played hand\'s planet (Flush -> Jupiter), not the last hand\'s', centers(G.consumeables));
}
{
  rules({ purple_seal_switch_trigger: true, chance_for_two_purple_tarots: 100 });
  const [p] = hand(['S_9', 'H_2']); p.set_seal('Purple');
  discard([p]);
  G.E_MANAGER.flush();
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Tarot'), 'a Purple Seal gives two Tarots', centers(G.consumeables));
  ok(p.seal !== 'Purple' && ['Red', 'Gold', 'Blue'].includes(p.seal), 'and switches seal', p.seal);
  rules({ chance_purple_seal_rolls_spectral: 100 });
  const [p2] = hand(['S_9', 'H_2']); p2.set_seal('Purple');
  discard([p2]);
  G.E_MANAGER.flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'Purple Seals create Spectrals instead', centers(G.consumeables));
}
{
  rules({ red_seal_silly_messages: true, extra_red_seal_repetitions: 2 });
  const [c] = hand(['S_A']); c.set_seal('Red');
  const r = play([c]);
  const msgs = statusMsgs(r.events);
  ok(r.total.chips === 5 + 11 * 4, 'Red Seal + 2 extra repetitions: the Ace scores 4 times', r.total);
  ok(msgs.some((m) => CD.RED_SEAL_MESSAGES.includes(m)) && !msgs.includes('Again!'), 'silly messages instead of Again!', msgs);
  rules({ chance_to_disable_red_seal_retriggers: 100 });
  const [c2] = hand(['S_A']); c2.set_seal('Red');
  const r2 = play([c2]);
  ok(r2.total.chips === 5 + 11, 'Red Seal retriggers disabled: scored once', r2.total);
}
{
  rules({ chance_to_double_gold_seal: 100 });
  const [c] = hand(['S_A']); c.set_seal('Gold');
  const d0 = G.GAME.dollars;
  play([c]);
  G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0 + 6, 'a Gold Seal pays $6', G.GAME.dollars - d0);
}
// ===================================================================== ENHANCEMENT rules
{
  rules({ make_sevens_lucky: 100 });
  G.GAME.probabilities.normal = 1000;
  const [c] = hand(['S_7']);
  const d0 = G.GAME.dollars;
  const r = play([c]);
  G.E_MANAGER.flush();
  ok(r.total.mult === 1 + 20 && G.GAME.dollars === d0 + 20, 'a 7 rolls like a Lucky card (+20 Mult, $20)', [r.total, G.GAME.dollars - d0]);
  ok(c.ability.mult === 0, 'FIX: the 7 keeps its own Mult (Deck Creator set it to 20 for good)', c.ability.mult);
  rules({ make_stones_lucky: 100 });
  G.GAME.probabilities.normal = 1000;
  const [s] = hand(['S_7']); s.set_ability(P_CENTERS.m_stone);
  const r2 = play([s]);
  ok(r2.total.mult === 1 + 20, 'a Stone rolls like a Lucky card', r2.total);
}
{
  rules({ triple_mult_cards_chance: 100 });
  const [m] = hand(['S_2']); m.set_ability(P_CENTERS.m_mult);
  const r = play([m]);
  ok(r.total.mult === 1 + 12, 'a Mult card gives triple (+12)', r.total);
  rules({ disable_mult_cards_chance: 100 });
  const [m2] = hand(['S_2']); m2.set_ability(P_CENTERS.m_mult);
  const r2 = play([m2]);
  ok(r2.total.mult === 1, 'a Mult card gives nothing', r2.total);
}
{
  const gold = (r) => {
    rules(r);
    const [g] = hand(['S_9']); g.set_ability(P_CENTERS.m_gold);
    const d0 = G.GAME.dollars;
    G.GAME.chips = G.GAME.blind.chips;
    play(hand(['S_2']), { keepChips: true });
    G.E_MANAGER.flush();
    return G.GAME.dollars - d0;
  };
  ok(gold({}) === 3, '(a held Gold card pays $3)');
  ok(gold({ chance_to_triple_gold_money: 100 }) === 9, 'FIX: triple money from a HELD Gold card ($9)');
  ok(gold({ chance_to_disable_gold_money: 100 }) === 0, 'disable it ($0)');
  rules({ chance_to_triple_gold_money: 100 });
  const [pg] = hand(['S_9']); pg.set_ability(P_CENTERS.m_gold);
  const d0 = G.GAME.dollars;
  play([pg]); G.E_MANAGER.flush();
  ok(G.GAME.dollars === d0, 'a PLAYED Gold card pays nothing (Deck Creator paid +$6 there)');
}
// ===================================================================== GLASS BREAK rules
{
  const glass = (r) => {
    rules(r);
    G.GAME.probabilities.normal = 1000;
    const j = add('j_joker');
    const [g] = hand(['S_9']); g.set_ability(P_CENTERS.m_glass);
    const d0 = G.GAME.dollars, n0 = G.playing_cards.length;
    play([g]);
    G.E_MANAGER.flush();
    return { money: G.GAME.dollars - d0, cards: G.playing_cards.length - n0, joker: G.jokers.cards.includes(j), jokers: G.jokers.cards.length, gone: !G.playing_cards.includes(g), deck: G.deck.cards };
  };
  const base = glass({});
  ok(base.gone && base.money === 0 && base.cards === -1, '(a Glass card breaks)');
  ok(glass({ broken_glass_money: 7 }).money === 7, '+$7 on a Glass break');
  ok(glass({ gain_ten_dollars_glass_break_chance: 100 }).money === 10, '+$10 chance');
  const st = glass({ replace_broken_glass_with_stones_chance: 100 });
  ok(st.cards === 0 && st.deck.some((c) => c.config.center.key === 'm_stone'), 'replaced with a Stone card in the deck', st.cards);
  ok(glass({ replace_broken_glass_with_random_cards_chance: 100 }).cards === 0, 'replaced with a random card');
  const neg = glass({ negative_joker_for_broken_glass: 100 });
  ok(neg.jokers === 2, 'a random Negative joker', neg.jokers);
  ok(!glass({ destroy_joker_on_broken_glass: 100 }).joker, 'a random joker destroyed');
}
// ===================================================================== BOSS WIN TAGS
{
  const all = {};
  for (const [, list] of CD.RULE_GROUPS.filter(([g]) => g === 'Boss Win Tags')) for (const [k] of list) all[k] = 100;
  rules(all);
  ok(G.GAME.blind.name === 'Small Blind', 'small blind');
  toEval();
  ok(G.GAME.tags.length === 0, 'no tags after a Small Blind');
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  toShop(); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(G.GAME.blind.boss, 'boss');
  winRound();
  const added = [];
  const res = G.ui_events.filter((e) => e.type === 'tag_added');
  G.E_MANAGER.flush();
  for (const e of G.ui_events) if (e.type === 'tag_added') added.push(e.tag);
  const want = CD.RULES.filter((r) => r.key.endsWith('_tag_percent')).length;
  ok(new Set(added).size === want && want === 24, 'all 24 Boss Win Tags at 100% (Uncommon ... Economy)', [new Set(added).size, res.length]);
}
// ===================================================================== STARTING DECK (dynamic) rules
{
  const deck = (r) => { run({ rules: r }, { noBlind: true }); return G.playing_cards; };
  ok(deck({ remove_faces: true }).length === 40 && deck({ remove_faces: true }).every((c) => !c.is_face()), 'No Face cards: 40');
  ok(deck({ no_aces: true }).length === 48 && deck({ no_aces: true }).every((c) => c.base.value !== 'Ace'), 'No Aces: 48');
  ok(deck({ no_numbered_cards: true }).length === 16, 'No numbered cards: 16');
  const rr = deck({ randomize_ranks: true });
  ok(rr.length === 52 && new Set(rr.map((c) => c.config.card.key)).size < 52 && ['Spades', 'Hearts', 'Clubs', 'Diamonds'].every((s) => rr.filter((c) => c.base.suit === s).length === 13), 'Randomize ranks (suits kept)');
  const rs = deck({ randomize_suits: true });
  ok(rs.length === 52 && ['Spades', 'Hearts', 'Clubs', 'Diamonds'].some((s) => rs.filter((c) => c.base.suit === s).length !== 13) && RANKS13(rs), 'Randomize suits (ranks kept)');
  run({ rules: { one_random_voucher: true, random_starting_jokers: 3, randomize_money_configurable: 50 } }, { noBlind: true });
  ok(G.GAME.starting_voucher_count === 1 && Object.keys(G.GAME.used_vouchers).length === 1, 'Start with 1 random voucher', Object.keys(G.GAME.used_vouchers));
  ok(G.jokers.cards.length === 3, 'Start with 3 random jokers');
  ok(G.GAME.dollars >= 4 && G.GAME.dollars <= 54, '+$0..50 starting money', G.GAME.dollars);
  const cnt = (cs, f) => cs.filter(f).length;
  const ed = deck({ random_polychrome_cards: 3, random_holographic_cards: 4, random_foil_cards: 5, random_edition_cards: 6 });
  ok(cnt(ed, (c) => c.edition && c.edition.polychrome) >= 3 && cnt(ed, (c) => c.edition && c.edition.holo) >= 4 && cnt(ed, (c) => c.edition && c.edition.foil) >= 5 && cnt(ed, (c) => c.edition) === 18, 'X random cards become Polychrome / Holo / Foil / a random edition (3+4+5+6)', cnt(ed, (c) => c.edition));
  const en = deck({ random_bonus_cards: 1, random_glass_cards: 2, random_lucky_cards: 3, random_steel_cards: 4, random_stone_cards: 5, random_wild_cards: 6, random_mult_cards: 7, random_gold_cards: 8, random_enhancement_cards: 9 });
  const by = (k) => cnt(en, (c) => c.config.center.key === k);
  ok(by('m_bonus') >= 1 && by('m_glass') >= 2 && by('m_lucky') >= 3 && by('m_steel') >= 4 && by('m_stone') >= 5 && by('m_wild') >= 6 && by('m_mult') >= 7 && by('m_gold') >= 8 && cnt(en, (c) => c.config.center.key !== 'c_base') === 45, 'X random cards become Bonus / Glass / Lucky / Steel / Stone / Wild / Mult / Gold / random (45)', cnt(en, (c) => c.config.center.key !== 'c_base'));
  const over = deck({ random_glass_cards: 500 });
  ok(cnt(over, (c) => c.config.center.key === 'm_glass') === 52, 'more than the deck: every card, then it stops');
}
function RANKS13(cs) { const by = {}; for (const c of cs) by[c.base.value] = (by[c.base.value] || 0) + 1; return Object.values(by).every((n) => n === 4) && Object.keys(by).length === 13; }

// ===================================================================== determinism: recipe replay
{
  const def = { name: 'Replay', params: { dollars: 30, hand_size: 9 }, cards: CD.CARD_PRESETS.find((p) => p.id === 'faces_aces').cards(),
    jokers: [{ key: 'j_joker', edition: 'random' }], rules: { balance_percent: 50, chance_to_increase_drawn_cards_rank: 40, random_glass_cards: 5, skip_shop_chance_any: 50, extra_hand_level_upgrades: 1 } };
  const s = new Session();
  s.start({ seed: 'RECIPE1', customDeck: def });
  ok(s.recipe.customDeck && s.recipe.customDeck.name === 'Replay' && JSON.stringify(s.recipe.customDeck) === JSON.stringify(CD.validateDeck(def)), 'the validated definition is in the recipe');
  let guard = 0;
  while (!s.over && guard++ < 60) {
    const v = s.view();
    if (v.state === 'BLIND_SELECT') s.act({ type: 'select_blind' });
    else if (v.state === 'SELECTING_HAND') { s.act({ type: 'highlight', ids: v.areas.hand.slice(0, 5).map((c) => c.id) }); s.act({ type: 'play' }); }
    else if (v.state === 'ROUND_EVAL') s.act({ type: 'cash_out' });
    else if (v.state === 'SHOP') s.act({ type: 'next_round' });
    else if (/PACK/.test(v.state)) s.act({ type: 'skip_booster' });
    else break;
  }
  const snap = JSON.stringify({ v: s.view(), d: G.GAME.dollars, seeds: G.GAME.pseudorandom });
  const rec = JSON.parse(JSON.stringify(s.recipe));
  const s2 = Session.fromRecipe(rec);
  ok(s2.recipe.actions.length === s.recipe.actions.length && s.recipe.actions.length > 5, 'every recorded action replays', [s2.recipe.actions.length, s.recipe.actions.length]);
  ok(JSON.stringify({ v: s2.view(), d: G.GAME.dollars, seeds: G.GAME.pseudorandom }) === snap, 'the replayed run is identical (view, money, every RNG stream)');
  ok(s2.view().custom_deck && s2.view().custom_deck.name === 'Replay', 'resume restores the custom deck');
}

// ===================================================================== stress: random rule sets, a bot, replays
// Random definitions (every rule at a random value, random cards / items / bans) played by a simple
// bot: no engine error, no stall, and each run replays from its recipe to the identical state.
{
  let s = 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pickR = (a) => a[Math.floor(rnd() * a.length)];
  const randomDef = (i) => {
    const r = {};
    for (const o of CD.RULES) {
      if (rnd() > 0.25) continue;
      r[o.key] = o.kind === 'bool' ? true : o.kind === 'pct' ? pickR([0, 10, 50, 100]) : Math.round(o.min + rnd() * Math.min(o.max - o.min, 6));
    }
    return {
      name: 'Stress ' + i, rules: r,
      params: { dollars: pickR([0, 4, 50]), hands: pickR([1, 4, 8]), discards: pickR([0, 3, 6]), hand_size: pickR([5, 8, 12]), joker_slots: pickR([1, 5, 9]), blind_scaling: pickR([0.5, 1, 2]) },
      cards: rnd() < 0.5 ? null : Array.from({ length: 30 }, () => [pickR(['S', 'H', 'C', 'D']) + '_' + pickR(['2', '7', 'T', 'Q', 'A']), pickR([0, 'm_glass', 'm_gold', 'm_mult', 'm_stone', 'm_lucky']), pickR([0, 0, 'foil', 'negative']), pickR([0, 'Red', 'Blue', 'Gold', 'Purple']), 1 + Math.floor(rnd() * 2)]),
      jokers: rnd() < 0.5 ? [{ key: pickR(['j_joker', 'j_blueprint', 'j_oops', 'j_showman', 'j_dna']), edition: pickR([undefined, 'negative', 'random']) }] : [],
      consumables: [{ key: pickR(['c_death', 'c_ankh', 'c_hex', 'c_ouija', 'c_familiar', 'c_talisman', 'c_pluto']) }],
      vouchers: rnd() < 0.5 ? ['v_overstock_norm', 'v_crystal_ball'] : [], tags: rnd() < 0.3 ? [{ key: 'tag_double' }, { key: 'tag_charm' }] : [],
      bans: { jokers: ['j_joker'], blinds: ['bl_wall'] },
    };
  };
  let crashes = 0, acts = 0, replays = 0;
  for (let i = 0; i < 12; i++) {
    const sess = new Session();
    try {
      sess.start({ seed: 'STRESS' + i, customDeck: randomDef(i) });
      for (let n = 0; n < 160 && !sess.over; n++) {
        const v = sess.view();
        const st = v.state;
        let a;
        if (st === 'BLIND_SELECT') a = v.legal.can_skip_blind && rnd() < 0.2 ? { type: 'skip_blind' } : { type: 'select_blind' };
        else if (st === 'SELECTING_HAND') {
          const ids = v.areas.hand.map((c) => c.id);
          const cons = v.areas.consumeables.find((c) => rnd() < 0.3);
          if (cons) { sess.act({ type: 'use', id: cons.id, targets: ids.slice(0, 2) }); acts++; }
          const pickIds = ids.filter(() => rnd() < 0.5).slice(0, 5);
          a = { type: 'highlight', ids: pickIds.length ? pickIds : ids.slice(0, 1) };
          sess.act(a); acts++;
          a = v.discards_left > 0 && rnd() < 0.35 ? { type: 'discard' } : { type: 'play' };
        } else if (st === 'ROUND_EVAL') a = { type: 'cash_out' };
        else if (st === 'SHOP') {
          const items = [...v.areas.shop_jokers, ...v.areas.shop_booster, ...v.areas.shop_vouchers].filter((c) => c.cost <= v.dollars);
          if (items.length && rnd() < 0.6) a = { type: 'buy', id: pickR(items).id };
          else if (rnd() < 0.2 && v.dollars >= v.reroll_cost) a = { type: 'reroll_shop' };
          else a = { type: 'next_round' };
        } else if (/PACK/.test(st)) {
          const pc = v.areas.pack_cards;
          a = pc.length && rnd() < 0.6 ? { type: 'use', id: pickR(pc).id, targets: v.areas.hand.slice(0, 1).map((c) => c.id) } : { type: 'skip_booster' };
        } else break;
        const r = sess.act(a); acts++;
        if (!r.ok && st === 'SHOP') { sess.act({ type: 'next_round' }); acts++; }
        if (!r.ok && /PACK/.test(st)) { sess.act({ type: 'skip_booster' }); acts++; }
        if (!r.ok && st === 'SELECTING_HAND') { sess.act({ type: 'play' }); acts++; }
      }
      const snap = JSON.stringify(sess.view());
      const s2 = Session.fromRecipe(JSON.parse(JSON.stringify(sess.recipe)));
      if (JSON.stringify(s2.view()) === snap) replays++;
      else console.log('replay diverged', i);
    } catch (e) { crashes++; console.log('stress crash', i, e && e.stack && e.stack.split('\n').slice(0, 4).join(' | ')); }
  }
  ok(crashes === 0 && acts > 600, '12 random custom decks played by a bot: no engine errors', { crashes, acts });
  ok(replays === 12, 'and every one replays from its recipe to the identical state', replays);
}

// ===================================================================== the Goth Deck (owner's Deck Creator deck)
{
  const { loadMods } = await import('../js/mods/index.js');
  await loadMods(['pokermon']);
  const goth = CD.EXAMPLE_DECKS.find((d) => d.id === 'goth');
  ok(goth && goth.by === 'mgibbie' && goth.def.name === 'Goth Deck', 'the Goth Deck is a built-in example (by mgibbie)');
  const s = new Session();
  s.start({ seed: 'GOTH', customDeck: goth.def });
  ok(G.GAME.mods.includes('pokermon') && s.recipe.mods.includes('pokermon'), 'it turns on Pokermon (its jokers need it)', G.GAME.mods);
  ok(centers(G.jokers).join() === 'j_poke_gothitelle,j_poke_xatu,j_poke_arcanine' && G.jokers.cards.every((j) => j.edition && j.edition.negative && j.ability.eternal), 'Gothitelle, Xatu, Arcanine — Negative + Eternal', centers(G.jokers));
  ok(G.jokers.config.card_limit === 8, '5 joker slots + 3 from the Negatives');
  ok(['v_planet_merchant', 'v_planet_tycoon', 'v_paint_brush', 'v_palette'].every((v) => G.GAME.used_vouchers[v]) && G.GAME.planet_rate === 4 * P_CENTERS.v_planet_tycoon.config.extra, 'Planet Merchant + Tycoon, Paint Brush + Palette', G.GAME.planet_rate);
  ok(G.hand.config.card_limit === 10 && G.playing_cards.length === 52 && G.GAME.dollars === 4 && G.GAME.round_resets.hands === 4 && G.GAME.round_resets.discards === 3, 'hand size 8 + 2, the standard 52, vanilla money / hands / discards');
  const r = s.act({ type: 'select_blind' });
  ok(r.ok && s.view().state === 'SELECTING_HAND' && s.view().areas.hand.length === 10, 'the run starts: blind selected, 10 cards drawn');
  const r2 = s.act({ type: 'highlight', ids: s.view().areas.hand.slice(0, 5).map((c) => c.id) });
  ok(r2.ok && s.act({ type: 'play' }).ok, 'a hand plays');
}

done();
