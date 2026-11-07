// Gen 7, batch 3: the Ultra Beasts (contentRev 66; jokers/pokejokers_designs.js; PORTING.md "Gen 7, batch 3"). The owner's "Yes build it
// and merge when the gate passes" (2026-11-02). Every joker is played through real hands and rounds:
//   Nihilego    (Dark)      Parasite: copies the Joker to its LEFT (Blueprint mirrored; the compatible line).
//   Buzzwole    (Fighting)  X3 Mult, -1 hand size.
//   Pheromosa   (Grass)     X3 on the round's first 2 hands, then debuffed until the round ends (back for the next; save / resume).
//   Xurkitree   (Lightning) each card held in hand +4 Mult.
//   Celesteela  (Metal)     +$1 sell value each end of round; X1 + X0.05 per $1 of sell value.
//   Kartana     (Grass)     exactly 1 scoring card: it retriggers 3 times and gives X2 each time.
//   Guzzlord    (Dragon)    a Blind selected: eats the leftmost consumable, +X0.2 banked.
//   Stakataka   (Earth)     each Stone card held in hand X1.25.
//   Blacephalon (Psychic)   X3; each hand played costs $2, never past the debt limit.
//   Poipole     (Dark)      +2 Mult per Dragon Joker; after 5 rounds Naganadel (Dragon): X1.5 + X0.25 per Dragon Joker, itself included.
// BEAST BOOST (all but Nihilego): each Boss Blind beaten adds 10% of the main number's UNENERGIZED base; with Energy, in either order.
// Then Energy (the standard shares; the fixed numbers stay), save / resume, and the art (each cell's type).
//   node micatro/tests/mods/pokermon_gen7_ultrabeasts_test.mjs
import path from 'path';
// (Session runs here start with engineRev: 1 = the rules before Pages: these suites measure the mod alone)
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { if (process.env.UB_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const full = (j) => { const d = describe(j); return [...d.lines, ...((d.main_end) || [])].join(' | ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' '); };
const cr = () => G.GAME.current_round;
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand), `held` cards staying in hand -> {mult, chips, money}. */
function play(list, { held } = {}) {
  clearHand();
  const cs = cards(list);
  if (held) cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (cr().hands_left < 2) cr().hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0, cards: cs };
}
/** Win the round with a 1-card hand. */
function endRound(held = []) {
  clearHand(); const c = hand(['S_2']); cards(held);
  G.GAME.chips = G.GAME.blind.chips; if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
/** Cash out, leave the shop, select the next Blind (a harmless Boss: The Wall). */
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
/** Win rounds until the Blind being played is the Boss (not beaten yet). */
function toBoss() { let g = 0; while (!G.GAME.blind.boss && g++ < 5) { endRound(); advance(); } if (!G.GAME.blind.boss) throw new Error('no boss'); }
/** Beat the Boss Blind and go on to the next Blind. */
function beatBoss() { toBoss(); endRound(); advance(); }
function useOn(k, target) { const c = add(k); const r = act({ type: 'use', id: c.sort_id, targets: [], ...(target ? { joker_targets: [target.sort_id] } : {}) }); flush(); return r; }
/** Put joker `j` directly left of joker `of`. */
function placeLeft(j, of) { const a = G.jokers.cards; a.splice(a.indexOf(j), 1); a.splice(a.indexOf(of), 0, j); }

const UB = { nihilego: ['Dark', 3, 7, 'Basic'], buzzwole: ['Fighting', 3, 7, 'Basic'], pheromosa: ['Grass', 3, 7, 'Basic'], xurkitree: ['Lightning', 3, 7, 'Basic'],
  celesteela: ['Metal', 3, 7, 'Basic'], kartana: ['Grass', 3, 7, 'Basic'], guzzlord: ['Dragon', 3, 7, 'Basic'], poipole: ['Dark', 1, 5, 'Basic'],
  naganadel: ['Dragon', 'poke_safari', 8, 'One'], stakataka: ['Earth', 3, 7, 'Basic'], blacephalon: ['Psychic', 3, 7, 'Basic'] };

// ------------------------------------------------------------------- the pin and the eleven centers
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 66 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 66+ (Gen 7 batch 3; r67 Gen 7 batch 4)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const [n, [t, r, c, st]] of Object.entries(UB)) {
    const x = P_CENTERS['j_poke_' + n];
    ok(x && x.rarity === r && x.cost === c && x.stage === st && x.ptype === t && x.gen === 7 && x.attributes.includes('ultra_beast'), `${n}: ${r} $${c} ${st}, ${t}, Gen 7, ultra_beast`, x && [x.rarity, x.cost, x.stage, x.ptype, x.attributes]);
  }
  ok(['beast_boosts', 'h_size', 'val_gain', 'retriggers', 'gluttony_Xmult', 'recoil', 'rounds'].every((f) => !(f in energy_values)), 'the Beast Boost count, the hand size, the $1, the retriggers, the bank and the $2 are no energy fields');
  ok(P_CENTERS.j_poke_nihilego.poke_no_energy_field === true && !P_CENTERS.j_poke_nihilego.poke_beast_boost, 'Nihilego: no number (Energy-inert, no Beast Boost)');
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker' && !['j_poke_mega_magearna', 'j_poke_mega_golisopod', 'j_poke_mega_zeraora'].includes(c.key)).map((c) => c.key);
  const chain = ['nihilego', 'buzzwole', 'pheromosa', 'xurkitree', 'celesteela', 'kartana', 'guzzlord', 'necrozma', 'magearna', 'marshadow', 'poipole', 'naganadel', 'stakataka', 'blacephalon', 'zeraora', 'grookey']; // (with Gen 7 batch 4's Necrozma, Magearna, Marshadow 800-802 and Zeraora 807)
  const i = keys.indexOf('j_poke_nihilego');
  ok(i > 0 && chain.every((n, k) => keys[i + k] === 'j_poke_' + n), 'Pokédex order: Nihilego (793) ... Guzzlord (799), Necrozma ... Marshadow, Poipole (803) ... Blacephalon (806), Zeraora, then Grookey (810)', keys.slice(i - 1, i + 17));
  ok(keys[i - 1] === 'j_poke_lunala', '... right after Lunala (792; Gen 7 batch 4)', keys[i - 1]);
});

// ------------------------------------------------------------------- Nihilego: Parasite (the Joker to its LEFT)
await sec('nihilego', () => {
  start('UBNI');
  const n = add('j_poke_nihilego');
  let t = play(['S_5']);
  ok(near(t.mult, 1), 'alone (nothing to its left): nothing', t.total);
  ok(/| incompatible/.test(full(n)), 'tooltip: incompatible with nothing to its left', full(n));
  const j = add('j_joker'); placeLeft(j, n);
  t = play(['S_5']);
  ok(near(t.mult, 1 + 4 + 4), 'a Joker to its left: +4 twice', t.total);
  ok(/Parasite: copies the ability \| of the Joker to its left/.test(plain(n)) && /| compatible/.test(full(n)), 'text + the compatible line', full(n));
  // the Joker to its RIGHT is not copied
  const a = G.jokers.cards; a.splice(a.indexOf(j), 1); a.push(j);
  t = play(['S_5']);
  ok(near(t.mult, 1 + 4), 'a Joker to its right: not copied', t.total);
  // an X: Buzzwole to its left
  const b = add('j_poke_buzzwole'); placeLeft(b, n);
  t = play(['S_5']);
  ok(near(t.mult, 1 * 3 * 3 + 4), 'Buzzwole to its left: X3 twice (the Joker +4 after them)', t.total);
  // a Joker Blueprint can't copy: incompatible, nothing
  const ff = add('j_four_fingers'); placeLeft(ff, n);
  ok(/| incompatible/.test(full(n)), 'Four Fingers to its left: incompatible', full(n));
  t = play(['S_5']);
  ok(near(t.mult, 1 * 3 + 4), '... and nothing copied', t.total);
  // a debuffed Nihilego copies nothing; Energy can't be used on it
  act({ type: 'sell', id: ff.sort_id }); flush();
  const en = useOn('c_poke_darkness_energy', n);
  ok(en && en.ok === false, 'a Darkness Energy cannot be used on Nihilego (no number)', en);
  // a Blueprint directly to its left: they copy each other -> nothing (the copy depth guard), no hang
  const bp = add('j_blueprint'); placeLeft(bp, n);
  t = play(['S_5']);
  ok(near(t.mult, 1 * 3 + 4), 'Blueprint | Nihilego copy each other: nothing more (Buzzwole X3, Joker +4)', t.total);
});

// ------------------------------------------------------------------- Buzzwole: X3, -1 hand size
await sec('buzzwole', () => {
  start('UBBU');
  const h0 = G.hand.config.card_limit;
  const b = add('j_poke_buzzwole');
  ok(G.hand.config.card_limit === h0 - 1, '-1 hand size', [h0, G.hand.config.card_limit]);
  const t = play(['S_5', 'H_5']);
  ok(near(t.mult, 2 * 3), 'a Pair: X3', t.total);
  ok(/Muscle: X3 Mult \| -1 hand size/.test(plain(b)) && /Beast Boost: each Boss Blind \| defeated permanently adds \| X0\.3 Mult \| \(Beast Boost: \+0\)/.test(plain(b)), 'text: Muscle + Beast Boost (+0)', plain(b));
  act({ type: 'sell', id: b.sort_id }); flush();
  ok(G.hand.config.card_limit === h0, 'sold: the hand size back', G.hand.config.card_limit);
});

// ------------------------------------------------------------------- Beast Boost: Boss Blinds only; with Energy in either order; Blueprint adds none
await sec('beast boost', () => {
  start('UBBB');
  const b = add('j_poke_buzzwole');
  endRound(); advance();
  ok((ex(b).beast_boosts || 0) === 0, 'a Small Blind beaten: no boost', ex(b).beast_boosts);
  const bp = add('j_blueprint'); placeLeft(bp, b);
  beatBoss();
  ok(ex(b).beast_boosts === 1, 'the Boss Blind beaten: 1 boost (Blueprint adds none)', ex(b).beast_boosts);
  act({ type: 'sell', id: bp.sort_id }); flush();
  let t = play(['S_5']);
  ok(near(t.mult, 3.3), 'X3.3 after one Boss', t.total);
  ok(/\(Beast Boost: \+0\.3\)/.test(plain(b)) && /Muscle: X3\.3 Mult/.test(plain(b)), 'tooltip: X3.3, (Beast Boost: +0.3)', plain(b));
  increment_energy(b, 'Fighting');
  t = play(['S_5']);
  ok(near(ex(b).Xmult, 3.6) && near(t.mult, 3.9), 'then a Fighting Energy: X3.6 + 0.3 = X3.9 (Energy is +20% of the base 3, not of the boosted value)', [ex(b).Xmult, t.total]);
  beatBoss();
  t = play(['S_5']);
  ok(ex(b).beast_boosts === 2 && near(t.mult, 4.2), 'a second Boss with Energy: still +0.3 (10% of the unenergized base): X4.2', [ex(b).beast_boosts, t.total]);
  // the other order: Energy first, then the Boss -> the same number
  start('UBBB2');
  const b2 = add('j_poke_buzzwole');
  increment_energy(b2, 'Fighting');
  beatBoss();
  t = play(['S_5']);
  ok(near(t.mult, 3.9), 'Energy first, then a Boss: X3.9 too', t.total);
  // three Energies + two Bosses
  increment_energy(b2, 'Fighting'); increment_energy(b2, 'Fighting');
  beatBoss();
  t = play(['S_5']);
  ok(near(t.mult, 4.8 + 0.6), '3 Energies (X4.8) + 2 Bosses (+0.6): X5.4', t.total);
  // a lost Boss (game over) gives none: covered by beat_boss / game_over; a debuffed joker isn't calculated
});

// ------------------------------------------------------------------- Pheromosa: Glass Cannon (2 hands, then debuffed until the round ends)
await sec('pheromosa', () => {
  start('UBPH');
  const p = add('j_poke_pheromosa');
  let t = play(['S_5']);
  ok(near(t.mult, 3) && !p.debuff, 'hand 1: X3', t.total);
  ok(/\(1\/2 hands left\)/.test(plain(p)), 'tooltip: 1/2 hands left', plain(p));
  t = play(['S_5']);
  ok(near(t.mult, 3) && p.debuff, 'hand 2: X3, then debuffed', [t.total, p.debuff]);
  ok(/\(Tired until the round ends\)/.test(plain(p)), 'tooltip: tired', plain(p));
  t = play(['S_5']);
  ok(near(t.mult, 1), 'hand 3: debuffed, nothing', t.total);
  endRound();
  ok(!p.debuff && !(p.ability.debuff_sources || {}).pheromosa, 'the round ends: restored', [p.debuff, p.ability.debuff_sources]);
  advance();
  t = play(['S_5']);
  ok(near(t.mult, 3), 'the next round: X3 again', t.total);
  ok(/Glass Cannon: X3 Mult \| on the first 2 hands of \| each round; then debuffed \| until the round ends/.test(plain(p)), 'text', plain(p));
  // a Boss beaten on the 3rd hand: restored before the end of round, so the boost lands
  toBoss();
  play(['S_5']); play(['S_5']);
  ok(p.debuff, 'at the Boss, tired after 2 hands', p.debuff);
  endRound(); advance();
  ok(!p.debuff && ex(p).beast_boosts === 1, 'beating the Boss while tired: restored and Beast Boosted', [p.debuff, ex(p).beast_boosts]);
  t = play(['S_5']);
  ok(near(t.mult, 3.3), 'X3.3', t.total);
  // Blueprint copies the X only while Pheromosa is fresh
  const bp = add('j_blueprint'); placeLeft(bp, p);
  t = play(['S_5']);
  ok(near(t.mult, 3.3 * 3.3) && p.debuff, 'hand 2 with Blueprint: X3.3 twice', t.total);
  t = play(['S_5']);
  ok(near(t.mult, 1), 'hand 3: Pheromosa tired, Blueprint copies nothing', t.total);
  // a 1-hand round: never tired
  endRound(); advance();
  ok(!p.debuff, 'a new round: fresh');
});

// ------------------------------------------------------------------- Xurkitree: Live Wire (held cards +4 Mult)
await sec('xurkitree', () => {
  start('UBXU');
  const x = add('j_poke_xurkitree');
  let t = play(['S_5'], { held: ['H_9', 'D_T', 'C_K'] });
  ok(near(t.mult, 1 + 3 * 4), '3 held cards: +12 Mult', t.total);
  clearHand();
  const cs = cards(['S_5']); const hs = cards(['H_9', 'D_T']); debuff(hs[0]);
  G.GAME.chips = 0; act({ type: 'highlight', ids: [cs[0].sort_id] }); const r = act({ type: 'play' }); flush();
  const tt = r.events.find((e) => e.type === 'hand_total');
  ok(near(Number(tt.mult), 1 + 4), 'a debuffed held card gives nothing', tt);
  ok(/Live Wire: each card \| held in hand gives \| \+4 Mult/.test(plain(x)), 'text', plain(x));
});

// ------------------------------------------------------------------- Celesteela: Launch (sell value +$1 a round; X0.05 per $1)
await sec('celesteela', () => {
  start('UBCE');
  const c = add('j_poke_celesteela');
  ok(c.sell_cost === 3, 'sell value $3 ($7 / 2)', c.sell_cost);
  let t = play(['S_5']);
  ok(near(t.mult, 1.15), '$3: X1.15', t.total);
  endRound(); advance();
  ok(c.sell_cost === 4, 'a round later: $4', c.sell_cost);
  t = play(['S_5']);
  ok(near(t.mult, 1.2), 'X1.2', t.total);
  const bp = add('j_blueprint'); placeLeft(bp, c);
  endRound(); advance();
  ok(c.sell_cost === 5, 'with a Blueprint: still +$1 (only Celesteela grows)', c.sell_cost);
  t = play(['S_5']);
  ok(near(t.mult, 1.25 * 1.25), 'Blueprint copies the X: X1.25 twice', t.total);
  act({ type: 'sell', id: bp.sort_id }); flush();
  ok(/Launch: gains \$1 of \| sell value at end of round \| X1 Mult, plus X0\.05 \| for each \$1 of its sell value \| \(Currently X1\.25 Mult\)/.test(plain(c)), 'text', plain(c));
  // the Boss beaten (one more round): $6 and one boost (+X0.005 per $1)
  beatBoss();
  ok(c.sell_cost === 6 && ex(c).beast_boosts === 1, 'past the Boss: $6, 1 boost', [c.sell_cost, ex(c).beast_boosts]);
  t = play(['S_5']);
  ok(near(t.mult, 1 + 0.055 * 6), 'X1 + 0.055 x 6 = X1.33', t.total);
  const $0 = G.GAME.dollars;
  act({ type: 'sell', id: c.sort_id }); flush();
  ok(G.GAME.dollars - $0 === 6, 'sold for $6', G.GAME.dollars - $0);
});

// ------------------------------------------------------------------- Kartana: Sacred Sword (exactly 1 scoring card)
await sec('kartana', () => {
  start('UBKA');
  const k = add('j_poke_kartana');
  let t = play(['S_5']);
  ok(near(t.mult, 16), 'one card: scores 4 times (3 retriggers), X2 each: X16', t.total);
  t = play(['S_5', 'H_5']);
  ok(near(t.mult, 2), 'a Pair (2 scoring cards): nothing', t.total);
  t = play(['S_A', 'H_3', 'D_7', 'C_9', 'S_J']);
  ok(near(t.mult, 16), 'a 5-card High Card (1 scoring): X16', t.total);
  ok(/Sacred Sword: if the played \| hand has exactly 1 scoring \| card, it retriggers 3 times \| and gives X2 Mult each time/.test(plain(k)), 'text', plain(k));
  const bp = add('j_blueprint'); placeLeft(bp, k);
  t = play(['S_5']);
  ok(near(t.mult, 2 ** 14), 'Blueprint copies both: 7 scorings, X2 twice each: X2^14', t.total);
});

// ------------------------------------------------------------------- Guzzlord: Gluttony (eats the leftmost consumable each Blind)
await sec('guzzlord', () => {
  start('UBGU', {}, { noBlind: true });
  const g = add('j_poke_guzzlord');
  const pl = add('c_pluto'), me = add('c_mercury');
  act({ type: 'select_blind' }); flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0] === me && near(ex(g).gluttony_Xmult, 1.2), 'a Blind: the leftmost (Pluto) eaten, X1.2', [G.consumeables.cards.map(key), ex(g).gluttony_Xmult]);
  clearHand();
  let t = play(['S_5']);
  ok(near(t.mult, 1.2), 'X1.2', t.total);
  const bp = add('j_blueprint'); placeLeft(bp, g);
  endRound(); advance();
  ok(G.consumeables.cards.length === 0 && near(ex(g).gluttony_Xmult, 1.4), 'next Blind, with a Blueprint: one meal (Mercury), X1.4', [G.consumeables.cards.length, ex(g).gluttony_Xmult]);
  t = play(['S_5']);
  ok(near(t.mult, 1.4 * 1.4), 'Blueprint copies the X', t.total);
  endRound(); advance();
  ok(near(ex(g).gluttony_Xmult, 1.4), 'nothing held: nothing eaten, nothing gained', ex(g).gluttony_Xmult);
  void pl;
  act({ type: 'sell', id: bp.sort_id }); flush();
  ok(/Gluttony: when a Blind is \| selected, destroys your \| leftmost consumable and \| gains X0\.2 Mult \| \(Currently X1\.4 Mult\)/.test(plain(g)), 'text', plain(g));
  beatBoss();
  t = play(['S_5']);
  ok(ex(g).beast_boosts === 1 && near(t.mult, 1.5), 'a Boss beaten: +X0.1 (10% of the X1 base): X1.5', [ex(g).beast_boosts, t.total]);
});

// ------------------------------------------------------------------- Stakataka: Stone Wall (held Stone cards X1.25)
await sec('stakataka', () => {
  start('UBST');
  const s = add('j_poke_stakataka');
  let t = play(['S_5'], { held: [['H_9', 'm_stone'], ['D_T', 'm_stone'], 'C_K'] });
  ok(near(t.mult, 1.25 * 1.25), '2 Stone cards held: X1.25 twice (the plain card nothing)', t.total);
  t = play(['S_5'], { held: ['C_K'] });
  ok(near(t.mult, 1), 'no Stone held: nothing', t.total);
  ok(/Stone Wall: each Stone \| card held in hand gives \| X1\.25 Mult/.test(plain(s)), 'text', plain(s));
});

// ------------------------------------------------------------------- Blacephalon: Mind Blown (X3, $2 a hand, the debt limit)
await sec('blacephalon', () => {
  start('UBBL');
  const b = add('j_poke_blacephalon');
  G.GAME.dollars = 5;
  let t = play(['S_5']);
  ok(near(t.mult, 3) && t.money === -2, 'X3 and -$2', [t.total, t.money]);
  t = play(['S_5']);
  ok(G.GAME.dollars === 1, '$3 -> $1', G.GAME.dollars);
  t = play(['S_5']);
  ok(G.GAME.dollars === 1 && near(t.mult, 3), 'at $1: never past the debt limit ($0): no loss, still X3', [G.GAME.dollars, t.total]);
  G.GAME.bankrupt_at = -20; // (Credit Card's limit)
  t = play(['S_5']);
  ok(G.GAME.dollars === -1, 'with a -$20 debt limit: $1 -> -$1', G.GAME.dollars);
  G.GAME.bankrupt_at = 0;
  G.GAME.dollars = 10;
  const bp = add('j_blueprint'); placeLeft(bp, b);
  t = play(['S_5']);
  ok(near(t.mult, 9) && t.money === -2, 'Blueprint copies the X only: X3 twice, -$2 once', [t.total, t.money]);
  ok(/Mind Blown: lose \$2 each \| hand played \| \(Never past your debt limit\)/.test(plain(b)), 'text', plain(b));
});

// ------------------------------------------------------------------- Poipole -> Naganadel: Dragon count; evolution carries the boosts
await sec('poipole', () => {
  start('UBPO');
  const p = add('j_poke_poipole');
  let t = play(['S_5']);
  ok(near(t.mult, 1), 'Poipole alone (not a Dragon itself): nothing', t.total);
  const gz = add('j_poke_guzzlord');
  t = play(['S_5']);
  ok(near(t.mult, 1 + 2), 'with Guzzlord (Dragon): +2', t.total);
  debuff(gz);
  t = play(['S_5']);
  ok(near(t.mult, 1), 'a debuffed Dragon doesn\'t count', t.total);
  act({ type: 'sell', id: gz.sort_id }); flush();
  ok(/\+2 Mult for each \| Dragon Joker/.test(plain(p)) && /Evolves after 5 rounds/.test(plain(p)), 'text', plain(p));
  // 5 rounds: Small, Big, the Boss (a boost), Small, Big -> Naganadel
  for (let i = 0; i < 5; i++) { endRound(); if (i < 4) advance(); }
  const n = G.jokers.cards.find((j) => key(j) === 'j_poke_naganadel');
  ok(n && !G.jokers.cards.some((j) => key(j) === 'j_poke_poipole') && ex(n).beast_boosts === 1, 'after 5 rounds: Naganadel, its Beast Boost carried', n && ex(n));
  advance();
  t = play(['S_5']);
  ok(near(t.mult, 1.5 + 0.15 + 0.25), 'Naganadel alone: X1.5 + 0.15 (one boost) + 0.25 (itself, a Dragon) = X1.9', t.total);
  add('j_poke_guzzlord');
  t = play(['S_5']);
  ok(near(t.mult, 1.65 + 0.5), 'with Guzzlord (X1 base, nothing banked): X2.15', t.total);
  ok(/Dragon Pulse: X1\.65 Mult, \| plus X0\.25 for each \| Dragon Joker \| \(Itself included\) \| \(Currently X2\.15 Mult\)/.test(plain(n)), 'text', plain(n));
});

// ------------------------------------------------------------------- Energy: the standard shares; the fixed numbers stay
await sec('energy', () => {
  const steps = (n, fields, type) => {
    start('UBEN' + n);
    const j = add('j_poke_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    return j;
  };
  const bu = steps('buzzwole', [['Xmult', [3.6, 4.2, 4.8]]], 'Fighting');
  ok(ex(bu).h_size === -1, 'Buzzwole: -1 hand size stays');
  steps('pheromosa', [['Xmult', [3.6, 4.2, 4.8]]], 'Grass');
  steps('xurkitree', [['mult', [5.6, 7.2, 8.8]]], 'Lightning');
  const ce = steps('celesteela', [['Xmult_mod', [0.06, 0.07, 0.08]]], 'Metal');
  ok(ex(ce).val_gain === 1, 'Celesteela: +$1 a round stays');
  const ka = steps('kartana', [['Xmult_multi', [2.1, 2.2, 2.3]]], 'Grass');
  ok(ex(ka).retriggers === 3, 'Kartana: 3 retriggers stay');
  let t = play(['S_5']);
  ok(near(t.mult, 2.3 ** 4), 'energized Kartana: X2.3 four times', t.total);
  const gz = steps('guzzlord', [['Xmult_mod', [0.24, 0.28, 0.32]]], 'Dragon');
  ok(ex(gz).gluttony_Xmult === 1, 'Guzzlord: the bank untouched (future meals only)');
  steps('stakataka', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Earth');
  const bl = steps('blacephalon', [['Xmult', [3.6, 4.2, 4.8]]], 'Psychic');
  ok(ex(bl).recoil === 2, 'Blacephalon: $2 stays');
  steps('poipole', [['mult', [2.8, 3.6, 4.4]]], 'Dark');
  steps('naganadel', [['Xmult', [1.8, 2.1, 2.4]], ['Xmult_mod', [0.3, 0.35, 0.4]]], 'Dragon');
});

// ------------------------------------------------------------------- save / resume (a run is its recipe)
await sec('resume', () => {
  const s = new Session();
  s.start({ engineRev: 1, seed: 'UBRESUME', customDeck: { name: 'UB', mods: ['pokermon'], params: { joker_slots: 9, consumable_slots: 8, blind_scaling: 5 },
    jokers: [{ key: 'j_poke_pheromosa' }, { key: 'j_poke_celesteela' }, { key: 'j_poke_guzzlord' }, { key: 'j_poke_buzzwole' }, { key: 'j_poke_poipole' }, { key: 'j_poke_blacephalon' }],
    consumables: [{ key: 'c_pluto' }, { key: 'c_pluto' }, { key: 'c_pluto' }, { key: 'c_pluto' }] } });
  flush();
  const J = (n) => G.jokers.cards.find((c) => key(c) === 'j_poke_' + n);
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  let rounds = 0, guard = 0;
  // three rounds (past the first Boss), then two hands into the fourth (Pheromosa tired)
  while (rounds < 3 && guard++ < 60) {
    if (G.STATE === STATES.BLIND_SELECT) must({ type: 'select_blind' });
    must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
    must({ type: 'play' });
    if (G.STATE === STATES.ROUND_EVAL) { must({ type: 'cash_out' }); must({ type: 'next_round' }); rounds++; }
    if (G.STATE === STATES.GAME_OVER) throw new Error('game over');
  }
  must({ type: 'select_blind' });
  for (let i = 0; i < 2; i++) { must({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); must({ type: 'play' }); }
  const snap = () => [J('pheromosa').debuff, ex(J('pheromosa')).beast_boosts, J('celesteela').sell_cost, ex(J('guzzlord')).gluttony_Xmult, ex(J('buzzwole')).beast_boosts,
    G.consumeables.cards.length, (J('poipole') || J('naganadel')).config.center.key, G.GAME.dollars, G.hand.config.card_limit];
  const live = snap();
  ok(live[0] === true && live[1] === 1 && live[4] === 1 && live[2] === 6 && near(live[3], 1.8) && live[5] === 0, 'live: Pheromosa tired, a Boss boost each, Celesteela $6, Guzzlord ate 4 (X1.8)', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && JSON.stringify(snap()) === JSON.stringify(live), 'resumed: the tired Pheromosa, the boosts, the sell value, the bank, the money exactly', [r.stoppedAt, snap(), live]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); st.seek(st.total);
  ok(!st.error && JSON.stringify(snap()) === JSON.stringify(live), 'the replay stepper too', snap());
  // the resumed run goes on: the round ends, Pheromosa recovers
  const r2 = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  G.GAME.chips = G.GAME.blind.chips;
  const rr = r2.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); flush();
  r2.act({ type: 'play' }); flush();
  ok(rr.ok && !J('pheromosa').debuff, 'resumed, the round won: Pheromosa recovers', J('pheromosa').debuff);
});

// ------------------------------------------------------------------- the art: every cell's type is the joker's
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    for (const n of Object.keys(UB)) {
      const c = P_CENTERS['j_poke_' + n];
      const r = typer.typeOfEntry({ atlas: c.atlas, pos: [c.pos.x, c.pos.y] });
      ok(r && r.ptype === c.ptype && c.soul_pos, `${n}'s cell ${c.atlas} {${c.pos.x},${c.pos.y}} shows ${c.ptype} (with its soul)`, [r, c.soul_pos]);
    }
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
