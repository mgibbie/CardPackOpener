// Gen 6, batch 3: the Gen 6 Legendaries (contentRev 63; jokers/pokejokers_designs.js; PORTING.md "Gen 6, batch 3"). The owner's "Yes"
// (2026-11-02); each complete ALONE (the solo rule, r59), so every joker here is played on its own through real hands and rounds.
//   Yveltal   (Dark)    Oblivion Wing: each end of round destroys 1 random held card (seeded; Giratina sees it) and banks +X0.25.
//   Zygarde   (Dragon)  Cells: +1 per scored card (once a hand: retriggers / Blueprint add none); 10% X1.5, 50% (50 Cells) X2.5,
//                       Complete (100) X4 and +1 hand size; the art follows the Forme.
//   Diancie   (Fairy)   Diamond Storm: scored Diamonds (Wild too) $1 and X1.2; a random non-Diamond deck card (never Stone) becomes a
//                       Diamond when a Blind is selected, keeping rank / enhancement / seal / edition; Blueprint converts another.
//   Hoopa     (Psychic) Hyperspace Hole: a Tarot or Planet at the end of each shop (room); Unbound after 15 consumables used: a Spectral.
//   Volcanion (Fire)    +1 discard; X2 plus X0.25 per discard used this round.
// Then Energy (the standard shares; the fixed numbers stay), the art (form cells and their types) and save / resume.
//   node micatro/tests/mods/pokermon_gen6_legendaries_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { get_type } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.G6_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const cr = () => G.GAME.current_round;
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand), `held` cards staying in hand -> {mult, chips, money}. */
function play(list, { held, left } = {}) {
  clearHand();
  const cs = cards(list);
  if (held) cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left;
  else if (cr().hands_left < 2) cr().hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0, cards: cs };
}
/** Win the round with a 1-card hand, `held` cards staying in hand through the end of round. */
function endRound(held = []) {
  clearHand(); const c = hand(['S_2']); cards(held);
  G.GAME.chips = G.GAME.blind.chips; if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
function useOn(k, target) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(target ? { joker_targets: [target.sort_id] } : {}) }); flush(); return r; }
const form = (j) => { const v = {}; view_card(j, v); return v.poke && v.poke.form; };
const drawn = (j) => {
  const v = {}; view_card(j, v);
  const f = POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos }, { area: 'jokers' });
  const d = f || j.config.center;
  return `{${d.pos.x},${d.pos.y}}+{${d.soul_pos.x},${d.soul_pos.y}}`;
};
const deckCount = () => G.playing_cards.length;
const FLUSH5 = ['H_2', 'H_5', 'H_7', 'H_9', 'H_J'];

// ------------------------------------------------------------------- the pin and the five centers
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 63 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 63+ (Gen 6 batch 3)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const want = { yveltal: 'Dark', zygarde: 'Dragon', diancie: 'Fairy', hoopa: 'Psychic', volcanion: 'Fire' };
  for (const [n, t] of Object.entries(want)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === t && c.gen === 6, `${n}: Legendary $20, ${t}, Gen 6`, c && [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(['oblivion_Xmult', 'cells', 'complete_size', 'complete_given', 'diamond_money', 'used', 'd_size'].every((f) => !(f in energy_values)), 'the bank, the counters, the $1, the hand size and the discard are no energy fields');
  // Pokédex order: Xerneas 716 -> Yveltal ... Volcanion -> Rowlet 722
  const order = Object.keys(P_CENTERS).filter((k) => /^j_poke_(xerneas|yveltal|zygarde|diancie|hoopa|volcanion|rowlet)$/.test(k));
  ok(JSON.stringify(order) === JSON.stringify(['j_poke_xerneas', 'j_poke_yveltal', 'j_poke_zygarde', 'j_poke_diancie', 'j_poke_hoopa', 'j_poke_volcanion', 'j_poke_rowlet']), 'Pokédex order: after Xerneas, before Rowlet', order);
  const pool = (G.P_CENTER_POOLS || {}).Joker;
  void pool;
});

// ------------------------------------------------------------------- Yveltal alone: Oblivion Wing
await sec('yveltal', () => {
  start('G6YV');
  const y = add('j_poke_yveltal');
  let t = play(['S_5']);
  ok(near(t.mult, 1), 'Yveltal alone, nothing banked yet: X1 (no X given)', t.total);
  const n0 = deckCount();
  const held = ['H_9', 'D_T', 'C_K'];
  endRound(held);
  const gone = G.playing_cards.length;
  ok(gone === n0 + 1 + held.length - 1 && near(ex(y).oblivion_Xmult, 1.25), 'end of round: 1 held card destroyed, +X0.25 (X1.25)', [n0, gone, ex(y).oblivion_Xmult]);
  advance();
  t = play(['S_5']);
  ok(near(t.mult, 1.25), '... plays X1.25 the next round', t.total);
  ok(/Oblivion Wing: at the end of \| each round, destroys a random \| card held in hand and gains \| X0\.25 Mult \| \(Currently X1\.25 Mult\)/.test(plain(y)), 'text: Oblivion Wing, the gain and the bank', plain(y));
  // nothing held: nothing destroyed, nothing gained
  const n1 = deckCount();
  endRound([]);
  ok(deckCount() === n1 + 1 && near(ex(y).oblivion_Xmult, 1.25), 'nothing held at end of round: nothing destroyed, no gain', [deckCount(), n1, ex(y).oblivion_Xmult]);
  advance();
  // Giratina sees the destroyed card (remove_playing_cards); Blueprint copies the X, never the destroy
  const g = add('j_poke_giratina');
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(y), 0, bp);
  const n2 = deckCount();
  endRound(['H_9', 'D_T']);
  ok(deckCount() === n2 + 1 + 2 - 1 && near(ex(y).oblivion_Xmult, 1.5) && ex(g).destroyed === 1 && near(ex(g).shadow_Xmult, 1.25),
    'with a Blueprint: still ONE card destroyed and one gain (X1.5); Giratina counts it (X1.25)', [deckCount() - n2, ex(y).oblivion_Xmult, ex(g).destroyed]);
  advance();
  t = play(['S_5']);
  ok(near(t.mult, 1.5 * 1.5 * 1.25), 'Blueprint copies the X: X1.5 x X1.5 (x Giratina X1.25)', t.total);
  // seeded: the same run destroys the same card
  const pick = () => {
    start('G6YVSEED'); add('j_poke_yveltal');
    clearHand(); const c = hand(['S_2']); const hs = cards(['H_3', 'D_8', 'C_Q', 'S_A']);
    G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
    return hs.map((x, i) => (G.playing_cards.includes(x) ? '' : i)).join('');
  };
  const a = pick(), b = pick();
  ok(a.length === 1 && a === b, 'seeded: the same run destroys the same one card of the four', [a, b]);
});

// ------------------------------------------------------------------- Zygarde alone: Cells and the three Formes
await sec('zygarde', () => {
  start('G6ZY');
  const h0 = G.hand.config.card_limit;
  const z = add('j_poke_zygarde');
  ok(form(z) === 'ten' && drawn(z) === '{2,11}+{3,11}', 'a new Zygarde: 10% Forme, its own card {2,11}', [form(z), drawn(z)]);
  let t = play(FLUSH5);
  ok(near(t.mult, 4 * 1.5) && ex(z).cells === 5, 'a Flush: X1.5, 5 Cells', [t.total, ex(z).cells]);
  t = play(['S_5', 'H_5', 'C_9'], {});
  ok(ex(z).cells === 7, 'a Pair (2 scored of 3 played): +2 Cells', ex(z).cells);
  // retriggers don't add (Hanging Chad retriggers the first card twice), a debuffed played card doesn't score
  const chad = add('j_hanging_chad');
  t = play(FLUSH5);
  ok(ex(z).cells === 12, 'with Hanging Chad: still +5 (retriggers add none)', ex(z).cells);
  act({ type: 'sell', id: chad.sort_id }); flush();
  clearHand();
  const cs = cards(FLUSH5); debuff(cs[0]);
  G.GAME.chips = 0; if (cr().hands_left < 2) cr().hands_left = 2; act({ type: 'highlight', ids: cs.map((c) => c.sort_id) }); act({ type: 'play' }); flush();
  ok(ex(z).cells === 16, 'a debuffed card in the Flush doesn\'t score: +4', ex(z).cells);
  // Blueprint copies the X, adds no Cells
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(z), 0, bp);
  t = play(FLUSH5);
  ok(ex(z).cells === 21 && near(t.mult, 4 * 1.5 * 1.5), 'with a Blueprint: +5 Cells once, X1.5 x X1.5', [ex(z).cells, t.total]);
  act({ type: 'sell', id: bp.sort_id }); flush();
  ok(/\(Cells: 21\/100\)/.test(plain(z)) && /\(Currently 10% Forme\)/.test(plain(z)), 'tooltip: Cells 21/100, 10% Forme', plain(z));
  // real Flushes to 50: the hand that collects the 50th still pays 10%; then 50% Forme
  for (let i = 0; i < 20 && ex(z).cells < 46; i++) play(FLUSH5);
  ok(ex(z).cells === 46, '46 Cells', ex(z).cells);
  t = play(FLUSH5);
  ok(near(t.mult, 4 * 1.5) && ex(z).cells === 51 && form(z) === 'half', 'the 50th Cell: that hand X1.5, then the 50% Forme', [t.total, ex(z).cells, form(z)]);
  ok(drawn(z) === '{4,11}+{5,11}', '... its 50% card and soul {4,11}', drawn(z));
  t = play(FLUSH5);
  ok(near(t.mult, 4 * 2.5) && G.hand.config.card_limit === h0, '50% Forme: X2.5, no hand size yet', [t.total, G.hand.config.card_limit]);
  for (let i = 0; i < 20 && ex(z).cells < 96; i++) play(FLUSH5);
  t = play(FLUSH5);
  ok(near(t.mult, 4 * 2.5) && ex(z).cells === 100 && form(z) === 'complete' && G.hand.config.card_limit === h0 + 1, 'the 100th Cell: that hand X2.5, then Complete Forme and +1 hand size', [t.total, ex(z).cells, G.hand.config.card_limit]);
  ok(drawn(z) === '{6,11}+{7,11}', '... its Complete card {6,11}', drawn(z));
  t = play(FLUSH5);
  ok(near(t.mult, 16) && ex(z).cells === 100 && G.hand.config.card_limit === h0 + 1, 'Complete: X4, Cells stay at 100, the hand size given once', [t.total, ex(z).cells, G.hand.config.card_limit]);
  ok(/\(Cells: 100\/100\)/.test(plain(z)) && /\(Currently Complete Forme\)/.test(plain(z)), 'tooltip: 100/100, Complete Forme', plain(z));
  debuff(z);
  ok(G.hand.config.card_limit === h0, 'debuffed: the hand size goes', G.hand.config.card_limit);
  undebuff(z);
  ok(G.hand.config.card_limit === h0 + 1, 'un-debuffed: it comes back (once)', G.hand.config.card_limit);
  advance();
  ok(G.hand.config.card_limit === h0 + 1, 'and stays through rounds', G.hand.config.card_limit);
  act({ type: 'sell', id: z.sort_id }); flush();
  ok(G.hand.config.card_limit === h0, 'sold: the hand size taken back', G.hand.config.card_limit);
});

// ------------------------------------------------------------------- Diancie alone: Diamond Storm
await sec('diancie', () => {
  start('G6DI', {}, { noBlind: true });
  const d = add('j_poke_diancie');
  // a deck of Diamonds but for one Steel / Red Seal / Foil Spade 7 and one Stone card
  for (const c of G.playing_cards) c.change_suit('Diamonds');
  const sp = G.playing_cards[0], st = G.playing_cards[1];
  sp.change_suit('Spades'); sp.set_ability(P_CENTERS.m_steel, null, true); sp.set_seal('Red', true); sp.set_edition({ foil: true }, true, true);
  const rank = sp.base.value;
  st.change_suit('Clubs'); st.set_ability(P_CENTERS.m_stone, null, true);
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(sp.base.suit === 'Diamonds' && sp.base.value === rank && key(sp) === 'm_steel' && sp.seal === 'Red' && sp.edition && sp.edition.foil, 'Blind selected: the one non-Diamond became a Diamond, rank / Steel / Red Seal / Foil kept', [sp.base.suit, sp.base.value, key(sp), sp.seal, sp.edition]);
  ok(st.base.suit === 'Clubs' && key(st) === 'm_stone', 'a Stone card is never picked', [st.base.suit, key(st)]);
  // scored Diamonds: $1 and X1.2 each; a Wild card counts; a Spade doesn't
  let t = play(['D_5', 'D_5']);
  ok(near(t.mult, 2 * 1.2 * 1.2) && t.money === 2, 'a Pair of Diamonds: X1.2 twice, $2', [t.total, t.money]);
  t = play([['S_9', 'm_wild']]);
  ok(near(t.mult, 1.2) && t.money === 1, 'a Wild card counts as a Diamond', [t.total, t.money]);
  t = play(['S_9']);
  ok(near(t.mult, 1) && t.money === 0, 'a Spade: nothing', [t.total, t.money]);
  ok(/Diamond Storm: each scored \| Diamond earns \$1 and \| gives X1\.2 Mult/.test(plain(d)) && /When a Blind is selected, \| a random non-Diamond card \| in your deck becomes \| a Diamond/.test(plain(d)), 'text', plain(d));
  // a standard deck: exactly one card a Blind; Blueprint converts another
  start('G6DI2', {}, { noBlind: true });
  const dd = add('j_poke_diancie');
  const dia = () => G.playing_cards.filter((c) => c.base.suit === 'Diamonds').length;
  const n0 = dia();
  act({ type: 'select_blind' }); flush();
  ok(dia() === n0 + 1, 'a standard deck: one more Diamond per Blind', [n0, dia()]);
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(dd), 0, bp);
  endRound(); advance();
  ok(dia() === n0 + 3, 'with a Blueprint: two more the next Blind', [n0, dia()]);
  // seeded: the same seed converts the same card
  const pickOf = () => { start('G6DISEED', {}, { noBlind: true }); add('j_poke_diancie'); const before = G.playing_cards.map((c) => c.base.suit); act({ type: 'select_blind' }); flush(); return G.playing_cards.findIndex((c, i) => c.base.suit !== before[i]); };
  const a = pickOf(), b = pickOf();
  ok(a >= 0 && a === b, 'seeded: the same card each time', [a, b]);
});

// ------------------------------------------------------------------- Hoopa alone: Hyperspace Hole, Unbound
await sec('hoopa', () => {
  start('G6HO');
  const h = add('j_poke_hoopa');
  ok(form(h) === 'confined' && drawn(h) === '{8,11}+{9,11}', 'Hoopa: its own card {8,11}', [form(h), drawn(h)]);
  endRound();
  act({ type: 'cash_out' }); flush();
  ok(G.STATE === STATES.SHOP && G.consumeables.cards.length === 0, 'in the shop, nothing yet', G.consumeables.cards.length);
  act({ type: 'next_round' }); flush();
  const got = G.consumeables.cards.map((c) => c.ability.set);
  ok(got.length === 1 && ['Tarot', 'Planet'].includes(got[0]), 'the end of the shop: a Tarot or a Planet', got);
  // no room: nothing (two slots, both full)
  add('c_pluto');
  act({ type: 'select_blind' }); flush(); clearHand();
  endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  ok(G.consumeables.cards.length === 2, 'no room: nothing created', G.consumeables.cards.length);
  for (const c of G.consumeables.cards.slice()) { c.remove ? c.remove() : null; }
  G.consumeables.cards.length = 0;
  act({ type: 'select_blind' }); flush(); clearHand();
  // 15 consumables used (any kind): Unbound
  for (let i = 0; i < 14; i++) useOn('c_pluto');
  ok(ex(h).used === 14 && form(h) === 'confined' && /\(Used: 14\/15\)/.test(plain(h)), '14 used: still Confined, "Used: 14/15"', [ex(h).used, plain(h)]);
  const en = useOn('c_poke_psychic_energy', h);
  ok(en && en.ok === false && ex(h).used === 14, 'a Psychic Energy cannot be used on Hoopa (no number: Energy-inert)', en);
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); }
  useOn('c_hermit');
  ok(ex(h).used === 15 && form(h) === 'unbound' && drawn(h) === '{10,11}+{11,11}' && get_type(h) === 'Psychic', 'the 15th (The Hermit): Hoopa Unbound, its card {10,11}, still Psychic', [ex(h).used, form(h), drawn(h), get_type(h)]);
  ok(/\(Hoopa Unbound\)/.test(plain(h)), 'tooltip: Hoopa Unbound', plain(h));
  useOn('c_pluto');
  ok(ex(h).used === 15, 'the count stops there', ex(h).used);
  endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  const sp = G.consumeables.cards.map((c) => c.ability.set);
  ok(sp.length === 1 && sp[0] === 'Spectral', 'Unbound: the end of the shop creates a Spectral card', sp);
  // Blueprint copies the creation (room permitting)
  start('G6HO2');
  const h2 = add('j_poke_hoopa');
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(h2), 0, bp);
  endRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => ['Tarot', 'Planet'].includes(c.ability.set)), 'with a Blueprint: two cards', G.consumeables.cards.map((c) => c.ability.set));
  useOn('c_pluto');
  ok(ex(h2).used === 1, 'Blueprint adds nothing to the count (one use, one count)', ex(h2).used);
  ok(P_CENTERS.j_poke_hoopa.poke_no_energy_field === true, 'Hoopa has no number: Energy-inert (poke_no_energy_field)');
});

// ------------------------------------------------------------------- Volcanion alone: Steam Eruption
await sec('volcanion', () => {
  start('G6VO', {}, { noBlind: true });
  const d0 = G.GAME.round_resets.discards;
  const v = add('j_poke_volcanion');
  ok(G.GAME.round_resets.discards === d0 + 1, '+1 discard each round', G.GAME.round_resets.discards);
  act({ type: 'select_blind' }); flush();
  ok(cr().discards_left === d0 + 1, 'the round: 4 discards', cr().discards_left);
  let t = play(['S_5']);
  ok(near(t.mult, 2), 'no discard used: X2', t.total);
  for (let i = 0; i < 2; i++) { clearHand(); const c = hand(['C_3']); act({ type: 'highlight', ids: [c[0].sort_id] }); act({ type: 'discard' }); flush(); }
  t = play(['S_5']);
  ok(cr().discards_used === 2 && near(t.mult, 2.5), 'two discards used: X2.5', [cr().discards_used, t.total]);
  ok(/Steam Eruption: X2 Mult, \| plus X0\.25 for each \| discard used this round \| \(Currently X2\.5 Mult\)/.test(plain(v)), 'text', plain(v));
  endRound(); advance();
  t = play(['S_5']);
  ok(near(t.mult, 2) && cr().discards_left === d0 + 1, 'the next round it resets: X2', [t.total, cr().discards_left]);
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(v), 0, bp);
  t = play(['S_5']);
  ok(near(t.mult, 4) && G.GAME.round_resets.discards === d0 + 1, 'Blueprint copies the X (not the discard)', [t.total, G.GAME.round_resets.discards]);
  act({ type: 'sell', id: v.sort_id }); flush();
  ok(G.GAME.round_resets.discards === d0, 'sold: the discard taken back', G.GAME.round_resets.discards);
});

// ------------------------------------------------------------------- Energy: the standard shares; the fixed numbers stay
await sec('energy', () => {
  const steps = (n, fields, type) => {
    start('G6EN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  const y = steps('yveltal', [['Xmult_mod', [0.3, 0.35, 0.4]]], 'Dark');
  ok(ex(y).oblivion_Xmult === 1, 'Yveltal: the bank untouched');
  endRound(['H_9']);
  ok(near(ex(y).oblivion_Xmult, 1.4), 'energized Yveltal: a destroy banks +X0.4', ex(y).oblivion_Xmult);
  const z = steps('zygarde', [['Xmult', [1.8, 2.1, 2.4]], ['Xmult1', [3, 3.5, 4]], ['Xmult2', [4.8, 5.6, 6.4]]], 'Dragon');
  ok(ex(z).complete_size === 1 && ex(z).cells === 0, 'Zygarde: +1 hand size and the Cells stay');
  let t = play(['S_5']);
  ok(near(t.mult, 2.4), 'energized 10% Forme: X2.4', t.total);
  const di = steps('diancie', [['Xmult_multi', [1.26, 1.32, 1.38]]], 'Fairy');
  ok(ex(di).diamond_money === 1, 'Diancie: the $1 stays');
  t = play(['D_5']);
  ok(near(t.mult, 1.38) && t.money === 1, 'energized Diancie: a Diamond X1.38 and $1', [t.total, t.money]);
  const vo = steps('volcanion', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult_mod', [0.3, 0.35, 0.4]]], 'Fire');
  ok(ex(vo).d_size === 1, 'Volcanion: the +1 discard stays');
  t = play(['S_5']);
  ok(near(t.mult, 3.2), 'energized Volcanion: X3.2', t.total);
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G6RESUME', customDeck: { name: 'Gen6', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 8, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_yveltal' }, { key: 'j_poke_zygarde' }, { key: 'j_poke_diancie' }, { key: 'j_poke_hoopa' }, { key: 'j_poke_volcanion' }],
    consumables: [{ key: 'c_pluto' }, { key: 'c_pluto' }] } });
  flush();
  const J = (n) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + n);
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  must({ type: 'select_blind' });
  for (const p of G.consumeables.cards.slice()) must({ type: 'use', id: p.sort_id, targets: [] });
  must({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) });
  must({ type: 'discard' });
  let rounds = 0;
  while (rounds < 2) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  const snap = () => [ex(J('yveltal')).oblivion_Xmult, ex(J('zygarde')).cells, form(J('zygarde')), ex(J('hoopa')).used, G.playing_cards.length,
    G.playing_cards.filter((c) => c.base.suit === 'Diamonds').length, G.consumeables.cards.map((c) => key(c)).join(','), G.GAME.round_resets.discards, G.hand.config.card_limit, G.GAME.dollars];
  const live = snap();
  ok(near(live[0], 1.5) && live[1] >= 2 && live[3] === 2 && live[6].split(',').length === 2, 'live: 2 destroys (X1.5), Cells collected, 2 used, 2 shop cards', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const back = snap();
  ok(!r.stoppedAt && JSON.stringify(back) === JSON.stringify(live), 'resumed: the bank, the Cells, the count, the deck, the shop cards come back exactly', [r.stoppedAt, back, live]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
  // a Complete Zygarde and an Unbound Hoopa come back with their form, art and hand size
  const s2 = new Session();
  s2.start({ seed: 'G6RESUME2', customDeck: { name: 'Gen6b', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 20, blind_scaling: 0.05 },
    cards: ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'].map((r) => ['H_' + r, 0, 0, 0, 4]),
    jokers: [{ key: 'j_poke_zygarde' }, { key: 'j_poke_hoopa' }], consumables: Array.from({ length: 15 }, () => ({ key: 'c_pluto' })) } });
  flush();
  const m2 = (a) => { const r = s2.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  m2({ type: 'select_blind' });
  for (const p of G.consumeables.cards.slice()) m2({ type: 'use', id: p.sort_id, targets: [] });
  let guard = 0;
  while (ex(J('zygarde')).cells < 100 && guard++ < 80) {
    if (G.STATE === STATES.BLIND_SELECT) m2({ type: 'select_blind' });
    m2({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    m2({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { m2({ type: 'cash_out' }); m2({ type: 'next_round' }); }
    if (G.STATE === STATES.GAME_OVER) { console.log('game over at', ex(J('zygarde')).cells, G.GAME.round_resets.ante, guard); break; }
  }
  const snap2 = () => [ex(J('zygarde')).cells, form(J('zygarde')), drawn(J('zygarde')), form(J('hoopa')), drawn(J('hoopa')), G.hand.config.card_limit];
  const live2 = snap2();
  ok(G.hand.config.card_limit === 9, 'Complete in a run: hand size 9', G.hand.config.card_limit);
  ok(live2[0] === 100 && live2[1] === 'complete' && live2[3] === 'unbound', 'live: Complete Zygarde, Unbound Hoopa', live2);
  const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(s2.recipe))); flush();
  ok(!r2.stoppedAt && JSON.stringify(snap2()) === JSON.stringify(live2), 'resumed: both forms, both cards and the +1 hand size exactly', [snap2(), live2]);
});

// ------------------------------------------------------------------- the art: every cell's type is the joker's
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const CELLS = { yveltal: ['Natdex', [22, 47], 'Dark'], zygarde_10: ['Gen06', [2, 11], 'Dragon'], zygarde_50: ['Gen06', [4, 11], 'Dragon'], zygarde_complete: ['Gen06', [6, 11], 'Dragon'],
      diancie: ['Natdex', [26, 47], 'Fairy'], hoopa: ['Gen06', [8, 11], 'Psychic'], hoopa_unbound: ['Gen06', [10, 11], 'Psychic'], volcanion: ['Natdex', [0, 48], 'Fire'] };
    for (const [n, [sheet, pos, want]] of Object.entries(CELLS)) {
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasic' + sheet, pos });
      ok(r && r.ptype === want, `${n}'s cell ${sheet} {${pos}} shows ${want}`, r);
    }
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
