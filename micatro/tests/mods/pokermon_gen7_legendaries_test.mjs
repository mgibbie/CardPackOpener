// Gen 7, batch 4: the Gen 7 Legendaries (contentRev 67; jokers/pokejokers_designs.js; PORTING.md "Gen 7, batch 4"). The owner's "Yes build
// it" (2026-11-02); each complete ALONE (the solo rule, r59), so every joker here is played on its own through real hands and rounds.
//   Type: Null (Colorless, $10)  banks X0.1 each end of round; after 5 rounds -> Silvally, the bank kept.
//   Silvally   (Colorless)       RKS System: X2 + X0.25 per other Joker of its type, x Type: Null's bank; any Energy used sets its type
//                                (every type's Energy works on it); its Memory card; Monotype-exempt.
//   Tapu Koko  (Lightning)       every scored card X1.1.          Tapu Lele (Psychic)  each Tarot used creates a Planet (room).
//   Tapu Bulu  (Grass)           +2 hand size, X1.5.               Tapu Fini (Water)    +1 hand; $2 per unused hand at end of round.
//   Cosmog ($10) +1 Mult a round -> Cosmoem ($10) X0.25 a round, counts red vs black -> Solgaleo (Hearts / Diamonds X1.25) or Lunala
//                                (Spades / Clubs X1.25), the banks carried.
//   Necrozma   (Psychic)         X0.1 per Planet used; at X3 Ultra Necrozma for good: Dragon, +1 hand size, its Ultra card.
//   Magearna   (Metal)           scored Steel cards X1.5.          Marshadow (Fighting) X2, X4 during a Boss Blind (Zenith card).
//   Zeraora    (Lightning)       scored face cards $1 and X1.25.
// Then Energy (the standard shares; the fixed numbers stay), the art (every form cell's type) and save / resume.
//   node micatro/tests/mods/pokermon_gen7_legendaries_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { get_type, is_type } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.G7_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const cr = () => G.GAME.current_round;
const J = (k) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + k);
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand), `held` cards staying in hand -> {mult, chips, money}. */
function play(list, { held, left, debuffFirst } = {}) {
  clearHand();
  const cs = cards(list);
  if (debuffFirst) debuff(cs[0]);
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
/** Win the round with `list` (default a lone 2 of Spades), `held` cards staying in hand through the end of round. */
function endRound(held = [], list = ['S_2']) {
  clearHand(); const c = cards(list); cards(held);
  G.GAME.chips = G.GAME.blind.chips; if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
function advance(boss) {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** A full round: win it and select the next Blind. */
function round(held, list) { endRound(held, list); flush(); advance(); }
function useOn(k, target) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(target ? { joker_targets: [target.sort_id] } : {}) }); flush(); return r; }
const form = (j) => { const v = {}; view_card(j, v); return v.poke && v.poke.form; };
const drawn = (j) => {
  const v = {}; view_card(j, v);
  const f = POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, soul_pos: j.config.center.soul_pos }, { area: 'jokers' });
  const d = f || j.config.center;
  return `{${d.pos.x},${d.pos.y}}+{${d.soul_pos.x},${d.soul_pos.y}}`;
};
const moveLeftOf = (a, b) => { G.jokers.cards.splice(G.jokers.cards.indexOf(a), 1); G.jokers.cards.splice(G.jokers.cards.indexOf(b), 0, a); };
const NAMES = ['typenull', 'silvally', 'tapu_koko', 'tapu_lele', 'tapu_bulu', 'tapu_fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'magearna', 'marshadow', 'zeraora'];

// ------------------------------------------------------------------- the pin and the fourteen centers
await sec('pin', () => {
  ok(MODS.pokermon.contentRev === 67 && PINS.modPin('pokermon') === '3.9.1+r67', 'Pokermon contentRev 67 (pin 3.9.1+r67; Gen 7 batch 4)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const want = { typenull: ['Colorless', 10], silvally: ['Colorless', 20], tapu_koko: ['Lightning', 20], tapu_lele: ['Psychic', 20], tapu_bulu: ['Grass', 20], tapu_fini: ['Water', 20],
    cosmog: ['Psychic', 10], cosmoem: ['Psychic', 10], solgaleo: ['Metal', 20], lunala: ['Psychic', 20], necrozma: ['Psychic', 20], magearna: ['Metal', 20], marshadow: ['Fighting', 20], zeraora: ['Lightning', 20] };
  for (const [n, [t, cost]] of Object.entries(want)) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c && c.rarity === 4 && c.cost === cost && c.stage === 'Legendary' && c.ptype === t && c.gen === 7, `${n}: Legendary $${cost}, ${t}, Gen 7`, c && [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
  }
  // only through their line: Silvally, Cosmoem, Solgaleo, Lunala never in a pool (Urshifu's way); the others are
  start('G7POOL');
  for (const n of ['silvally', 'cosmoem', 'solgaleo', 'lunala']) { const c = P_CENTERS['j_poke_' + n]; ok(c.custom_pool_func && c.in_pool(c) === false, `${n}: only through its line (never in a pool)`); }
  for (const n of ['typenull', 'tapu_koko', 'tapu_lele', 'tapu_bulu', 'tapu_fini', 'cosmog', 'necrozma', 'magearna', 'marshadow', 'zeraora']) { const c = P_CENTERS['j_poke_' + n]; ok(!c.custom_pool_func && c.in_pool(c) !== false, `${n}: in the Legendary pool`); }
  ok(['null_Xmult', 'cosmo_mult', 'cosmo_Xmult', 'prism_Xmult', 'red', 'black', 'ultra_size', 'ultra_given', 'mist_money', 'plasma_money', 'h_size', 'hands', 'rounds'].every((f) => !(f in energy_values)),
    'the banks, the counts, the money, the hand size, the hand and the rounds are no energy fields');
  ok(P_CENTERS.j_poke_silvally.poke_mono_exempt === true && !P_CENTERS.j_poke_typenull.poke_mono_exempt && !P_CENTERS.j_poke_necrozma.poke_mono_exempt, 'Silvally Monotype-exempt (Type: Null and Necrozma are not)');
  ok(P_CENTERS.j_poke_tapu_lele.poke_no_energy_field === true && P_CENTERS.j_poke_tapu_fini.poke_no_energy_field === true, 'Tapu Lele and Tapu Fini have no number: Energy-inert');
  // Pokédex order
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key.replace('j_poke_', ''));
  const after = (a, b) => keys.indexOf(b) === keys.indexOf(a) + 1;
  ok(after('mudsdale', 'typenull') && after('typenull', 'silvally') && after('silvally', 'mimikyu'), 'Pokédex order: Mudsdale (750) > Type: Null > Silvally > Mimikyu (778)', keys.slice(keys.indexOf('mudsdale'), keys.indexOf('mudsdale') + 4));
  const run = ['mega_drampa', 'tapu_koko', 'tapu_lele', 'tapu_bulu', 'tapu_fini', 'cosmog', 'cosmoem', 'solgaleo', 'lunala', 'necrozma', 'magearna', 'marshadow', 'zeraora'];
  ok(run.every((n, i) => i === 0 || keys.indexOf(n) > keys.indexOf(run[i - 1])) && keys.indexOf('zeraora') < keys.indexOf('grookey'), 'Pokédex order: Drampa (780) < the Tapus < the Cosmog line < Necrozma < Magearna < Marshadow < Zeraora < Grookey (810)');
});

// ------------------------------------------------------------------- Type: Null alone -> Silvally
await sec('typenull', () => {
  start('G7TN');
  const t = add('j_poke_typenull');
  let r = play(['S_5']);
  ok(near(r.mult, 1), 'a fresh Type: Null: nothing banked yet (X1)', r.total);
  round();
  ok(near(ex(t).null_Xmult, 1.1) && ex(t).rounds === 4, 'end of round: +X0.1 (X1.1), 4 rounds left', [ex(t).null_Xmult, ex(t).rounds]);
  r = play(['S_5']);
  ok(near(r.mult, 1.1), '... plays X1.1', r.total);
  ok(/Permanently gains X0\.1 Mult \| at the end of each round \| \(Currently X1\.1 Mult\) \| \(Evolves after 4 rounds\)/.test(plain(t)), 'text', plain(t));
  // Blueprint copies the X, never the gain
  const bp = add('j_blueprint'); moveLeftOf(bp, t);
  r = play(['S_5']);
  ok(near(r.mult, 1.1 * 1.1), 'Blueprint copies the X', r.total);
  round();
  ok(near(ex(t).null_Xmult, 1.2), 'with a Blueprint: still +X0.1 a round', ex(t).null_Xmult);
  act({ type: 'sell', id: bp.sort_id }); flush();
  round(); round(); round();
  const s = J('silvally');
  ok(!J('typenull') && s && near(ex(s).null_Xmult, 1.5) && ex(s).ptype === 'Colorless', 'after 5 rounds: Silvally, the bank X1.5 kept', s && [ex(s).null_Xmult, ex(s).ptype]);
  r = play(['S_5']);
  ok(near(r.mult, 2 * 1.5), 'Silvally alone: X2 x X1.5 (kept from Type: Null) = X3', r.total);
  round();
  ok(near(ex(s).null_Xmult, 1.5), 'Silvally keeps the bank, no longer growing', ex(s).null_Xmult);
});

// ------------------------------------------------------------------- Silvally alone: RKS System
await sec('silvally', () => {
  start('G7SV');
  const s = add('j_poke_silvally');
  ok(form(s) === 'Colorless' && drawn(s) === '{6,1}+{7,1}' && get_type(s) === 'Colorless', 'a Silvally: Colorless, its own card {6,1}', [form(s), drawn(s)]);
  let r = play(['S_5']);
  ok(near(r.mult, 2), 'alone, no bank: X2', r.total);
  // a Fire Energy used on it: every type's Energy works on it (full strength), then it is Fire, its Fire Memory card
  const u = useOn('c_poke_fire_energy', s);
  ok(u && u.ok !== false && ex(s).energy_count === 1 && near(ex(s).Xmult, 2.4) && near(ex(s).Xmult_mod, 0.3), 'a Fire Energy works on a Colorless Silvally, full strength (X2.4, +0.3)', [u, ex(s).energy_count, ex(s).Xmult]);
  ok(ex(s).ptype === 'Fire' && get_type(s) === 'Fire' && is_type(s, 'Fire') && !is_type(s, 'Colorless') && form(s) === 'Fire' && drawn(s) === '{2,2}+{3,2}', '... and it becomes Fire: its Fire Memory card {2,2}', [ex(s).ptype, form(s), drawn(s)]);
  ok(/RKS System: X2\.4 Mult, plus \| X0\.3 for each other \| Joker of its type \| \(Currently Fire, 0 others\)/.test(plain(s)) && /Its type never breaks Monotype/.test(plain(s)), 'text', plain(s));
  // an Energy used on ANOTHER joker sets its type too: a Water Energy on Squirtle -> Water, and Squirtle is "another Water Joker"
  const sq = add('j_poke_squirtle');
  useOn('c_poke_water_energy', sq);
  ok(ex(sq).energy_count === 1 && ex(s).energy_count === 1 && ex(s).ptype === 'Water' && drawn(s) === '{4,2}+{5,2}', 'a Water Energy on Squirtle: Silvally turns Water (its own Energy count unchanged), Water Memory', [ex(sq).energy_count, ex(s).energy_count, ex(s).ptype]);
  r = play(['S_5']);
  ok(near(r.mult, 2.4 + 0.3), 'Water with one other Water Joker: X2.4 + X0.3', r.total);
  debuff(sq);
  r = play(['S_5']);
  ok(near(r.mult, 2.4), 'a debuffed one doesn\'t count', r.total);
  undebuff(sq);
  // Colorless Energy: back to Colorless (Colorless Energy goes to the leftmost: Silvally, full strength)
  useOn('c_poke_colorless_energy', s);
  ok(ex(s).ptype === 'Colorless' && drawn(s) === '{6,1}+{7,1}' && ex(s).energy_count === 2 && near(ex(s).Xmult, 2.8), 'a Colorless Energy: Colorless again (full strength: X2.8)', [ex(s).ptype, ex(s).energy_count, ex(s).Xmult]);
  // Blueprint copies the X; a Blueprint never sets the type twice
  const bp = add('j_blueprint'); moveLeftOf(bp, s);
  useOn('c_poke_metal_energy', s);
  ok(ex(s).ptype === 'Metal' && drawn(s) === '{0,2}+{1,2}', 'Metal Energy: Metal Memory {0,2}', [ex(s).ptype, drawn(s)]);
  r = play(['S_5']);
  ok(near(r.mult, 3.2 * 3.2), 'Blueprint copies the X: X3.2 x X3.2', r.total);
  // every memory: each type's Energy gives that type's card
  const MEM = { Fighting: '{8,1}', Earth: '{10,1}', Metal: '{0,2}', Fire: '{2,2}', Water: '{4,2}', Grass: '{6,2}', Lightning: '{8,2}', Psychic: '{10,2}', Dragon: '{0,3}', Dark: '{2,3}', Fairy: '{4,3}', Colorless: '{6,1}' };
  start('G7SV2');
  const s2 = add('j_poke_silvally');
  for (const [t, cell] of Object.entries(MEM)) {
    const k = 'c_poke_' + (t === 'Dark' ? 'darkness' : t.toLowerCase()) + '_energy';
    ex(s2).energy_count = 0; ex(s2).c_energy_count = 0;
    useOn(k, s2);
    ok(ex(s2).ptype === t && drawn(s2).startsWith(cell), `${t} Energy: ${t}, its Memory ${cell}`, [ex(s2).ptype, drawn(s2)]);
  }
  // Monotype: a Charmander + Silvally run locks Fire, and Silvally turning Water never breaks it
  newRun({ seed: 'G7MONO', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_charmander');
  const s3 = add('j_poke_silvally');
  act({ type: 'select_blind' }); flush(); clearHand();
  const RB = () => G.GAME.run_badges;
  ok(RB() && RB().mono && RB().type === 'Fire', 'a Charmander + Silvally run locks Fire (Silvally left out)', RB() && RB().type);
  useOn('c_poke_water_energy', s3);
  round();
  ok(ex(s3).ptype === 'Water' && RB().mono && RB().mono_reason === '', 'Silvally turned Water: still Monotype', [ex(s3).ptype, RB()]);
});

// ------------------------------------------------------------------- the Tapus alone
await sec('tapu koko', () => {
  start('G7KO');
  const k = add('j_poke_tapu_koko');
  let r = play(['S_5', 'H_5', 'C_9', 'D_9', 'S_K']);
  ok(near(r.mult, 2 * 1.1 ** 4), 'Two Pair: every scored card X1.1 (4 cards: X1.4641)', r.total);
  const chad = add('j_hanging_chad');
  r = play(['S_5']);
  ok(near(r.mult, 1.1 ** 3), 'a retriggered card gives it again (Hanging Chad: X1.1 three times)', r.total);
  act({ type: 'sell', id: chad.sort_id }); flush();
  const bp = add('j_blueprint'); moveLeftOf(bp, k);
  r = play(['S_5']);
  ok(near(r.mult, 1.1 * 1.1), 'Blueprint copies it', r.total);
  ok(/Electric Surge: every \| scored card gives \| X1\.1 Mult/.test(plain(k)), 'text', plain(k));
});
await sec('tapu lele', () => {
  start('G7LE');
  const l = add('j_poke_tapu_lele');
  useOn('c_hermit');
  let got = G.consumeables.cards.map((c) => c.ability.set);
  ok(got.length === 1 && got[0] === 'Planet', 'The Hermit used: a random Planet created', got);
  useOn('c_hermit');
  got = G.consumeables.cards.map((c) => c.ability.set);
  ok(got.length === 2 && got.every((s) => s === 'Planet'), 'another Tarot: another Planet (2 slots: now full)', got);
  useOn('c_hermit');
  ok(G.consumeables.cards.length === 2, 'no room: nothing created', G.consumeables.cards.length);
  useOn('c_pluto');
  ok(G.consumeables.cards.length === 2, 'a Planet used makes nothing', G.consumeables.cards.length);
  for (const c of G.consumeables.cards.slice()) G.consumeables.remove_card(c);
  const bp = add('j_blueprint'); moveLeftOf(bp, l);
  useOn('c_hermit');
  got = G.consumeables.cards.map((c) => c.ability.set);
  ok(got.length === 2 && got.every((s) => s === 'Planet'), 'with a Blueprint: two Planets for one Tarot', got);
  ok(/Psychic Surge: each \| Tarot card used creates \| a random Planet card \| \(Must have room\)/.test(plain(l)), 'text', plain(l));
  // seeded: the same run makes the same Planet
  const pick = () => { start('G7LESEED'); add('j_poke_tapu_lele'); useOn('c_hermit'); return key(G.consumeables.cards[0]); };
  const a = pick(), b = pick();
  ok(a && a === b, 'seeded: the same Planet each time', [a, b]);
});
await sec('tapu bulu', () => {
  start('G7BU', {}, { noBlind: true });
  const h0 = G.hand.config.card_limit;
  const b = add('j_poke_tapu_bulu');
  ok(G.hand.config.card_limit === h0 + 2, '+2 hand size', G.hand.config.card_limit);
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length === h0 + 2, 'the deal draws 10', G.hand.cards.length);
  clearHand();
  const r = play(['S_5']);
  ok(near(r.mult, 1.5), 'X1.5', r.total);
  ok(/\+2 hand size \| \| Grassy Surge: X1\.5 Mult/.test(plain(b)), 'text', plain(b));
  debuff(b);
  ok(G.hand.config.card_limit === h0, 'debuffed: the hand size goes', G.hand.config.card_limit);
  undebuff(b);
  act({ type: 'sell', id: b.sort_id }); flush();
  ok(G.hand.config.card_limit === h0, 'sold: back to 8', G.hand.config.card_limit);
});
await sec('tapu fini', () => {
  start('G7FI', {}, { noBlind: true });
  const h0 = G.GAME.round_resets.hands;
  const f = add('j_poke_tapu_fini');
  ok(G.GAME.round_resets.hands === h0 + 1, '+1 hand each round', G.GAME.round_resets.hands);
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(cr().hands_left === h0 + 1, 'the round: 5 hands', cr().hands_left);
  // win on the first hand: 4 unused hands -> $8 from Misty Surge (+ the usual $1 a hand)
  const $0 = G.GAME.dollars;
  endRound();
  const left = cr().hands_left;
  const ev = act({ type: 'cash_out' }); flush();
  const gained = G.GAME.dollars - $0;
  ok(left === 4, '4 hands left after winning on the first', left);
  // the same win without Tapu Fini, for the baseline cash-out
  start('G7FI', {}, { noBlind: true });
  G.GAME.round_resets.hands += 1; act({ type: 'select_blind' }); flush(); clearHand();
  const $1 = G.GAME.dollars; endRound(); act({ type: 'cash_out' }); flush();
  const base = G.GAME.dollars - $1;
  ok(gained - base === 8, 'Misty Surge: $2 per unused hand ($8 for 4) on top of the usual cash-out', [gained, base, ev && ev.ok]);
  ok(/\+1 hand each round \| \| Misty Surge: earn \$2 \| for each unused hand \| at end of round/.test(plain(f)), 'text', plain(f));
  // won on the last hand: nothing
  start('G7FI2', {}, { noBlind: true });
  add('j_poke_tapu_fini'); act({ type: 'select_blind' }); flush(); clearHand();
  cr().hands_left = 1;
  const $2 = G.GAME.dollars;
  { const c = cards(['S_2']); G.GAME.chips = G.GAME.blind.chips; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
  const ln = cr().hands_left; act({ type: 'cash_out' }); flush();
  ok(ln === 0 && G.STATE === STATES.SHOP && G.GAME.dollars - $2 === base - 4, 'won on the last hand: no Misty Surge money', [ln, G.GAME.dollars - $2, base]);
});

// ------------------------------------------------------------------- the Cosmog line alone: banks carried, the red / black branch
await sec('cosmog', () => {
  start('G7CG');
  const c = add('j_poke_cosmog');
  let r = play(['S_5']);
  ok(near(r.mult, 1), 'a fresh Cosmog: +0', r.total);
  round();
  ok(ex(c).cosmo_mult === 1 && ex(c).rounds === 2, 'end of round: +1 Mult banked, 2 rounds left', [ex(c).cosmo_mult, ex(c).rounds]);
  r = play(['S_5']);
  ok(near(r.mult, 2), '... plays +1 Mult (High Card 1 + 1)', r.total);
  ok(/Permanently gains \+1 Mult \| at the end of each round \| \(Currently \+1 Mult\) \| \(Evolves after 2 rounds\)/.test(plain(c)), 'text', plain(c));
  round(); round();
  const m = J('cosmoem');
  ok(!J('cosmog') && m && ex(m).cosmo_mult === 3 && ex(m).cosmo_Xmult === 1 && ex(m).rounds === 3, 'after 3 rounds: Cosmoem, Cosmog\'s +3 Mult kept', m && [ex(m).cosmo_mult, ex(m).cosmo_Xmult, ex(m).rounds]);
  r = play(['S_5']);
  ok(near(r.mult, 4), 'Cosmoem gives Cosmog\'s +3 Mult', r.total);
  // red vs black: a Heart Flush (5 red), a Pair of Spades + a Club kicker scored? (Pair: 2 black), a Wild (both), a Stone (neither)
  play(['H_2', 'H_5', 'H_7', 'H_9', 'H_J']);
  play(['S_9', 'C_9', 'D_3']);
  play([['S_4', 'm_wild']]);
  play([['S_4', 'm_stone']]);
  ok(ex(m).red === 6 && ex(m).black === 4, 'counts: 5 Hearts + the Wild = 6 red; the lone 5, the 2 black 9s + the Wild = 4 black; the Stone none (the unscored 3 none)', [ex(m).red, ex(m).black]);
  const chad = add('j_hanging_chad');
  play(['S_K']);
  ok(ex(m).black === 5, 'a retriggered card counts once', ex(m).black);
  act({ type: 'sell', id: chad.sort_id }); flush();
  const c0 = [ex(m).red, ex(m).black];
  play(['S_8', 'C_8'], { debuffFirst: true });
  ok(ex(m).black === c0[1] + 1, 'a debuffed scored card doesn\'t count (a Pair of 8s, one debuffed: +1)', [c0, ex(m).black]);
  ok(/\(Red 6 \/ Black 6\)/.test(plain(m)), 'tooltip: Red 6 / Black 6', plain(m));
  round(undefined, ['D_2']);
  ok(near(ex(m).cosmo_Xmult, 1.25) && ex(m).cosmo_mult === 3, 'end of round: +X0.25 (X1.25), the Mult stays +3', [ex(m).cosmo_Xmult, ex(m).cosmo_mult]);
  r = play(['D_5']);
  ok(near(r.mult, 4 * 1.25), '... plays +3 and X1.25', r.total);
  round(undefined, ['D_2']); round(undefined, ['D_2']);
  const sol = J('solgaleo');
  ok(!J('cosmoem') && sol && ex(sol).cosmo_mult === 3 && near(ex(sol).cosmo_Xmult, 1.75), 'more red (10 with the red wins vs 6): Solgaleo, both banks kept (+3, X1.75)', sol && [ex(sol).cosmo_mult, ex(sol).cosmo_Xmult, J('lunala') && 'lunala']);
  r = play(['H_5', 'D_5', 'S_9']);
  ok(near(r.mult, (2 * 1.25 * 1.25 + 3) * 1.75), 'Solgaleo: a Pair of red 5s X1.25 each, then +3 and X1.75', r.total);
  r = play(['S_5', 'C_5']);
  ok(near(r.mult, (2 + 3) * 1.75), 'black cards: just the banks', r.total);
  ok(/Sunsteel Strike: each scored \| Heart or Diamond gives \| X1\.25 Mult \| \| \+3 and X1\.75 Mult \| \(kept from Cosmog and Cosmoem\)/.test(plain(sol)), 'text', plain(sol));
});
await sec('cosmoem branches', () => {
  // more black -> Lunala; a tie -> Solgaleo
  const grow = (seed, hands) => {
    start(seed);
    add('j_poke_cosmog');
    for (let i = 0; i < 3; i++) round();
    const m = J('cosmoem');
    for (const h of hands) play(h);
    const before = [ex(m).red, ex(m).black];
    for (let i = 0; i < 3; i++) round(undefined, ['D_A']);
    return { before, j: G.jokers.cards[0] };
  };
  // the round-winning hand (a red Ace each round) counts too: 3 red from the wins
  let g = grow('G7LU', [['S_2', 'S_5', 'S_7', 'S_9', 'S_J']]);
  ok(key(g.j) === 'j_poke_lunala' && ex(g.j).cosmo_mult === 3 && near(ex(g.j).cosmo_Xmult, 1.75), 'more black (5 vs 3): Lunala, both banks kept', [key(g.j), g.before, ex(g.j).cosmo_mult, ex(g.j).cosmo_Xmult]);
  let r = play(['S_5', 'C_5', 'H_9']);
  ok(near(r.mult, (2 * 1.25 * 1.25 + 3) * 1.75), 'Lunala: a Pair of black 5s X1.25 each, then +3 and X1.75', r.total);
  ok(/Moongeist Beam: each scored \| Spade or Club gives \| X1\.25 Mult/.test(plain(g.j)), 'text', plain(g.j));
  g = grow('G7TIE', [['S_2', 'C_2', 'D_9']]);
  ok(key(g.j) === 'j_poke_solgaleo', 'more red (the 3 red wins vs 2 black: the counts are read when it evolves): Solgaleo', [key(g.j), g.before]);
  g = grow('G7TIE2', [['S_2', 'C_2', 'S_9'], ['C_4']]);
  ok(key(g.j) === 'j_poke_solgaleo' && g.before[0] === 0, 'black 3 vs red 3 (the wins): a tie -> Solgaleo', [key(g.j), g.before]);
  // Energy carries: an energized Cosmog -> Cosmoem's gain, Solgaleo's per-card X
  start('G7CEN');
  const c = add('j_poke_cosmog');
  increment_energy(c, 'Psychic');
  ok(near(ex(c).mult_mod, 1.2), 'Cosmog + 1 Psychic Energy: +1.2 a round', ex(c).mult_mod);
  for (let i = 0; i < 3; i++) round();
  const m = J('cosmoem');
  ok(near(ex(m).cosmo_mult, 3.6) && near(ex(m).Xmult_mod, 0.3) && ex(m).energy_count === 1, 'Cosmoem: +3.6 kept, the Energy re-applied (X0.3 a round)', [ex(m).cosmo_mult, ex(m).Xmult_mod]);
});

// ------------------------------------------------------------------- Necrozma alone: Prism, Ultra Necrozma
await sec('necrozma', () => {
  start('G7NE');
  const h0 = G.hand.config.card_limit;
  const n = add('j_poke_necrozma');
  ok(form(n) === 'base' && drawn(n) === '{6,4}+{7,4}' && get_type(n) === 'Psychic', 'Necrozma: Psychic, its own card {6,4}', [form(n), drawn(n)]);
  useOn('c_neptune');
  ok(near(ex(n).prism_Xmult, 1.1), 'a Planet used: +X0.1', ex(n).prism_Xmult);
  useOn('c_hermit');
  ok(near(ex(n).prism_Xmult, 1.1), 'a Tarot: nothing', ex(n).prism_Xmult);
  let r = play(['S_5']);
  ok(near(r.mult, 1.1), 'plays X1.1', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, n);
  useOn('c_neptune');
  ok(near(ex(n).prism_Xmult, 1.2), 'with a Blueprint: still +X0.1 a Planet', ex(n).prism_Xmult);
  r = play(['S_5']);
  ok(near(r.mult, 1.2 * 1.2), 'Blueprint copies the X', r.total);
  act({ type: 'sell', id: bp.sort_id }); flush();
  for (let i = 0; i < 17; i++) useOn('c_neptune');
  ok(near(ex(n).prism_Xmult, 2.9) && form(n) === 'base' && G.hand.config.card_limit === h0, '19 Planets: X2.9, still Necrozma', [ex(n).prism_Xmult, form(n)]);
  ok(/\(Necrozma\)/.test(plain(n)), 'tooltip: (Necrozma)', plain(n));
  useOn('c_neptune');
  ok(near(ex(n).prism_Xmult, 3) && form(n) === 'ultra' && drawn(n) === '{0,5}+{1,5}' && G.hand.config.card_limit === h0 + 1, 'the 20th: X3, Ultra Necrozma, its Ultra card {0,5}, +1 hand size', [ex(n).prism_Xmult, form(n), drawn(n), G.hand.config.card_limit]);
  ok(ex(n).ptype === 'Dragon' && get_type(n) === 'Dragon' && is_type(n, 'Dragon') && !is_type(n, 'Psychic'), '... Dragon, the type its Ultra card shows', ex(n).ptype);
  ok(/\(Ultra Necrozma\)/.test(plain(n)) && /Prism: gains X0\.1 Mult \| for each Planet card used \| \(Currently X3 Mult\)/.test(plain(n)), 'text', plain(n));
  useOn('c_neptune');
  ok(near(ex(n).prism_Xmult, 3.1) && G.hand.config.card_limit === h0 + 1, 'it keeps banking; the hand size given once', [ex(n).prism_Xmult, G.hand.config.card_limit]);
  r = play(['S_5']);
  ok(near(r.mult, 3.1), 'Ultra: X3.1', r.total);
  debuff(n);
  ok(G.hand.config.card_limit === h0, 'debuffed: the hand size goes', G.hand.config.card_limit);
  undebuff(n);
  ok(G.hand.config.card_limit === h0 + 1, 'un-debuffed: back (once)', G.hand.config.card_limit);
  round();
  ok(form(n) === 'ultra' && ex(n).ptype === 'Dragon' && G.hand.config.card_limit === h0 + 1, 'for good: still Ultra next round', [form(n), ex(n).ptype]);
  // a Dragon Energy now matches (Psychic doesn't)
  const pe = useOn('c_poke_psychic_energy', n);
  ok(pe && pe.ok === false && !(ex(n).energy_count), 'a Psychic Energy no longer works on Ultra Necrozma', pe);
  useOn('c_poke_dragon_energy', n);
  ok(ex(n).energy_count === 1 && near(ex(n).Xmult_mod, 0.12), '... a Dragon Energy does (+X0.12 a Planet)', [ex(n).energy_count, ex(n).Xmult_mod]);
  act({ type: 'sell', id: n.sort_id }); flush();
  ok(G.hand.config.card_limit === h0, 'sold: the hand size taken back', G.hand.config.card_limit);
  // Monotype: an Ultra Necrozma still matches the Psychic it was gained as
  newRun({ seed: 'G7NEMONO', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_abra');
  const n2 = add('j_poke_necrozma');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(G.GAME.run_badges.mono && G.GAME.run_badges.type === 'Psychic', 'an Abra + Necrozma run locks Psychic', G.GAME.run_badges.type);
  G.consumeables.config.card_limit = 30;
  for (let i = 0; i < 20; i++) useOn('c_neptune');
  ok(form(n2) === 'ultra' && ex(n2).ptype === 'Dragon', 'Ultra Necrozma (Dragon)');
  round();
  ok(G.GAME.run_badges.mono && G.GAME.run_badges.mono_reason === '', 'next round: still Monotype (gained as Psychic)', G.GAME.run_badges);
});

// ------------------------------------------------------------------- Magearna, Marshadow, Zeraora alone
await sec('magearna', () => {
  start('G7MA');
  const m = add('j_poke_magearna');
  let r = play([['S_5', 'm_steel'], ['H_5', 'm_steel'], 'C_9']);
  ok(near(r.mult, 2 * 1.5 * 1.5), 'a Pair of scored Steel 5s: X1.5 each', r.total);
  r = play(['S_5', 'H_5'], { held: [['D_K', 'm_steel']] });
  ok(near(r.mult, 2 * 1.5), 'a Steel card held: its own X1.5 as usual (Magearna adds nothing there)', r.total);
  r = play(['S_5', 'H_5']);
  ok(near(r.mult, 2), 'no Steel: nothing', r.total);
  const chad = add('j_hanging_chad');
  r = play([['S_5', 'm_steel']]);
  ok(near(r.mult, 1.5 ** 3), 'a retriggered Steel card: X1.5 each time', r.total);
  act({ type: 'sell', id: chad.sort_id }); flush();
  const bp = add('j_blueprint'); moveLeftOf(bp, m);
  r = play([['S_5', 'm_steel']]);
  ok(near(r.mult, 1.5 * 1.5), 'Blueprint copies it', r.total);
  ok(/Soul-Heart: scored \| Steel cards give \| X1\.5 Mult/.test(plain(m)), 'text', plain(m));
});
await sec('marshadow', () => {
  start('G7MS');
  const m = add('j_poke_marshadow');
  let r = play(['S_5']);
  ok(near(r.mult, 2) && form(m) === 'base' && drawn(m) === '{2,5}+{3,5}', 'a Small Blind: X2, its own card {2,5}', [r.total, drawn(m)]);
  ok(/Spectral Thief: X2 Mult; \| X4 Mult during \| a Boss Blind \| \(Currently X2 Mult\)/.test(plain(m)), 'text', plain(m));
  round(); round();
  ok(G.GAME.blind.boss, 'the Boss Blind (The Wall)');
  r = play(['S_5']);
  ok(near(r.mult, 4) && form(m) === 'zenith' && drawn(m) === '{4,5}+{5,5}' && /\(Currently X4 Mult\)/.test(plain(m)), 'during the Boss Blind: X4, its Zenith card {4,5}', [r.total, drawn(m)]);
  G.GAME.blind.disable(); flush();
  r = play(['S_5']);
  ok(near(r.mult, 4), 'a disabled Boss is still a Boss Blind: X4', r.total);
  const bp = add('j_blueprint'); moveLeftOf(bp, m);
  r = play(['S_5']);
  ok(near(r.mult, 16), 'Blueprint copies it (X4 x X4)', r.total);
  endRound(); act({ type: 'cash_out' }); flush();
  ok(form(m) === 'base' && drawn(m) === '{2,5}+{3,5}', 'in the shop: its own card again', drawn(m));
});
await sec('zeraora', () => {
  start('G7ZE');
  const z = add('j_poke_zeraora');
  let r = play(['S_K', 'H_K', 'C_9']);
  ok(near(r.mult, 2 * 1.25 * 1.25) && r.money === 2, 'a Pair of Kings: X1.25 each and $1 each', [r.total, r.money]);
  r = play(['S_5', 'H_5']);
  ok(near(r.mult, 2) && r.money === 0, 'no face card: nothing', [r.total, r.money]);
  const pa = add('j_pareidolia');
  r = play(['S_5']);
  ok(near(r.mult, 1.25) && r.money === 1, 'Pareidolia: every card is a face', [r.total, r.money]);
  act({ type: 'sell', id: pa.sort_id }); flush();
  const bp = add('j_blueprint'); moveLeftOf(bp, z);
  r = play(['S_J']);
  ok(near(r.mult, 1.25 * 1.25) && r.money === 2, 'Blueprint copies both', [r.total, r.money]);
  ok(/Plasma Fists: each scored \| face card earns \$1 \| and gives X1\.25 Mult/.test(plain(z)), 'text', plain(z));
});

// ------------------------------------------------------------------- Energy: the standard shares; the fixed numbers stay
await sec('energy', () => {
  const steps = (n, fields, type) => {
    start('G7EN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  const tn = steps('typenull', [['Xmult_mod', [0.12, 0.14, 0.16]]], 'Colorless');
  ok(ex(tn).null_Xmult === 1 && ex(tn).rounds === 5, 'Type: Null: the bank and the rounds untouched');
  round();
  ok(near(ex(tn).null_Xmult, 1.16), 'energized Type: Null banks +X0.16 a round', ex(tn).null_Xmult);
  const sv = steps('silvally', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult_mod', [0.3, 0.35, 0.4]]], 'Colorless');
  let r = play(['S_5']);
  ok(near(r.mult, 3.2), 'energized Silvally: X3.2', r.total);
  void sv;
  steps('tapu_koko', [['Xmult_multi', [1.155, 1.21, 1.265]]], 'Lightning');
  r = play(['S_5']);
  ok(near(r.mult, 1.265), 'energized Tapu Koko: X1.265 a card', r.total);
  const bu = steps('tapu_bulu', [['Xmult', [1.8, 2.1, 2.4]]], 'Grass');
  ok(ex(bu).h_size === 2, 'Tapu Bulu: the +2 hand size stays');
  const cg = steps('cosmog', [['mult_mod', [1.2, 1.4, 1.6]]], 'Psychic');
  ok(ex(cg).cosmo_mult === 0, 'Cosmog: the bank untouched');
  steps('solgaleo', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Metal');
  steps('lunala', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Psychic');
  steps('necrozma', [['Xmult_mod', [0.12, 0.14, 0.16]]], 'Psychic');
  steps('magearna', [['Xmult_multi', [1.575, 1.65, 1.725]]], 'Metal');
  steps('marshadow', [['Xmult', [2.4, 2.8, 3.2]], ['Xmult1', [4.8, 5.6, 6.4]]], 'Fighting');
  const ze = steps('zeraora', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Lightning');
  r = play(['S_K']);
  ok(near(r.mult, 1.4375) && r.money === 1 && ex(ze).plasma_money === 1, 'energized Zeraora: a King X1.4375 and still $1', [r.total, r.money]);
  // Energy-inert: no Energy can be used on Tapu Lele / Tapu Fini
  for (const [n, k] of [['tapu_lele', 'c_poke_psychic_energy'], ['tapu_fini', 'c_poke_water_energy']]) {
    start('G7INERT' + n);
    const j = add('j_poke_' + n);
    const u = useOn(k, j);
    ok(u && u.ok === false && !ex(j).energy_count, `${n}: its own type's Energy can't be used on it (Energy-inert)`, u);
  }
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G7RESUME', customDeck: { name: 'Gen7', mods: ['pokermon'], params: { joker_slots: 10, consumable_slots: 30, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_typenull' }, { key: 'j_poke_cosmog' }, { key: 'j_poke_necrozma' }, { key: 'j_poke_tapu_lele' }, { key: 'j_poke_tapu_fini' }, { key: 'j_poke_marshadow' }, { key: 'j_poke_zeraora' }],
    consumables: [...Array.from({ length: 20 }, () => ({ key: 'c_pluto' })), { key: 'c_hermit' }, { key: 'c_poke_colorless_energy' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  must({ type: 'select_blind' });
  for (const p of G.consumeables.cards.slice()) if (p.ability.set === 'Planet' || key(p) === 'c_hermit') must({ type: 'use', id: p.sort_id, targets: [] });
  let rounds = 0;
  while (rounds < 6 && G.STATE !== STATES.GAME_OVER) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
  }
  const sv = () => J('silvally') || J('typenull'), cl = () => J('solgaleo') || J('lunala') || J('cosmoem') || J('cosmog');
  const snap = () => [key(sv()), ex(sv()).null_Xmult, key(cl()), ex(cl()).cosmo_mult, ex(cl()).cosmo_Xmult, ex(cl()).red, ex(cl()).black, ex(J('necrozma')).prism_Xmult, form(J('necrozma')), ex(J('necrozma')).ptype,
    G.hand.config.card_limit, G.GAME.round_resets.hands, G.GAME.dollars, G.consumeables.cards.map((c) => key(c)).join(',')];
  const live = snap();
  ok(live[0] === 'j_poke_silvally' && near(live[1], 1.5) && ['j_poke_solgaleo', 'j_poke_lunala'].includes(live[2]) && live[3] === 3 && near(live[4], 1.75) && live[8] === 'ultra' && live[9] === 'Dragon' && live[10] === 9,
    'live: Silvally (X1.5 kept), Solgaleo / Lunala (+3, X1.75), Ultra Necrozma, hand size 9', live);
  // the Colorless Energy now: Silvally takes it (leftmost)
  const en = G.consumeables.cards.find((c) => key(c) === 'c_poke_colorless_energy');
  if (en) must({ type: 'use', id: en.sort_id, targets: [] });
  const live2 = snap();
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live2), 'resumed: the evolutions, the banks, the counts, the Ultra form and type, the hand size, the money come back exactly', [r.stoppedAt, snap(), live2]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live2), 'the replay stepper too', snap());
  // a Silvally's type from an Energy comes back with its Memory card
  const s2 = new Session();
  s2.start({ seed: 'G7RESUME2', customDeck: { name: 'Gen7b', mods: ['pokermon'], params: { joker_slots: 8, consumable_slots: 8, blind_scaling: 0.05 },
    jokers: [{ key: 'j_poke_squirtle' }, { key: 'j_poke_silvally' }], consumables: [{ key: 'c_poke_water_energy' }] } });
  flush();
  const m2 = (a) => { const rr = s2.act(a); flush(); if (!rr.ok) throw new Error(JSON.stringify(a) + ': ' + rr.error); return rr; };
  m2({ type: 'use', id: G.consumeables.cards[0].sort_id, targets: [] });
  const sn2 = () => [ex(J('silvally')).ptype, drawn(J('silvally')), ex(J('squirtle')).energy_count];
  const l2 = sn2();
  ok(l2[0] === 'Water' && l2[1] === '{4,2}+{5,2}' && l2[2] === 1, 'live: the Water Energy went on Squirtle, Silvally Water', l2);
  Session.fromRecipe(JSON.parse(JSON.stringify(s2.recipe))); flush();
  ok(JSON.stringify(sn2()) === JSON.stringify(l2), 'resumed: Silvally Water, its Water Memory', sn2());
});

// ------------------------------------------------------------------- the art: every cell's type is the joker's (or its form's)
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const CELLS = { typenull: ['Natdex', [12, 51], 'Colorless'], silvally: ['Gen07', [6, 1], 'Colorless'], tapu_koko: ['Natdex', [8, 52], 'Lightning'], tapu_lele: ['Natdex', [10, 52], 'Psychic'],
      tapu_bulu: ['Natdex', [12, 52], 'Grass'], tapu_fini: ['Natdex', [14, 52], 'Water'], cosmog: ['Natdex', [16, 52], 'Psychic'], cosmoem: ['Natdex', [18, 52], 'Psychic'], solgaleo: ['Natdex', [20, 52], 'Metal'],
      lunala: ['Natdex', [22, 52], 'Psychic'], necrozma: ['Gen07', [6, 4], 'Psychic'], ultra_necrozma: ['Gen07', [0, 5], 'Dragon'], magearna: ['Natdex', [10, 53], 'Metal'], marshadow: ['Gen07', [2, 5], 'Fighting'],
      marshadow_zenith: ['Gen07', [4, 5], 'Fighting'], zeraora: ['Natdex', [22, 53], 'Lightning'] };
    const MEM = { Fighting: [8, 1], Earth: [10, 1], Metal: [0, 2], Fire: [2, 2], Water: [4, 2], Grass: [6, 2], Lightning: [8, 2], Psychic: [10, 2], Dragon: [0, 3], Dark: [2, 3], Fairy: [4, 3] };
    for (const [t, pos] of Object.entries(MEM)) CELLS['silvally_' + t] = ['Gen07', pos, t];
    for (const [n, [sheet, pos, want]] of Object.entries(CELLS)) {
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasic' + sheet, pos });
      ok(r && r.ptype === want, `${n}'s cell ${sheet} {${pos}} shows ${want}`, r);
    }
    // and the live forms draw exactly those cells
    const { GEN7_LEGEND_FORMS } = await import('../../mods/pokermon/systems/anim.js');
    ok(Object.entries(MEM).every(([t, [x, y]]) => GEN7_LEGEND_FORMS.j_poke_silvally[t].pos.x === x && GEN7_LEGEND_FORMS.j_poke_silvally[t].pos.y === y), 'Silvally\'s 11 Memory forms point at the typed cells');
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
