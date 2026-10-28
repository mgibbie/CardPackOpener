// The Gen 6 starters (2026-10-28, the owner's "build" of the missing Gen 5-9 starters; jokers/pokejokers_designs.js "The Gen 6 starters";
// PORTING.md "The Gen 6 starters"). Pokermon's starter conventions: Basic Uncommon $5 with `starter` (the Starter Pack), Stage 1 Safari $8,
// Stage 2 Safari $10; a type perk at every stage (Grass +1 hand size, Fire +1 discard, Water +1 hand); 5 rounds, then 5.
//   Chespin 650 -> Quilladin 651 -> Chesnaught 652 (Grass)   +40 / +80 / +150 Chips; Chesnaught's Spiky Shield X1.5 while you have 2+
//                                                             hands left, counted before the hand is played (every hand but the last).
//   Fennekin 653 -> Braixen 654 -> Delphox 655 (Fire)        +1 Foresight each; Braixen: the first discard each round with a card sharing a
//                                                             rank with a Foreseen card creates a Tarot (must have room); Delphox's Mystical
//                                                             Fire: permanently gains X0.2 per Tarot used.
//   Froakie 656 -> Frogadier 657 -> Greninja 658 (Water)     +30 / +50 Chips per Water Joker (itself included); Greninja's Protean: at each
//                                                             Blind it takes the type most common among your other Jokers (a tie: keeps its
//                                                             type; Monotype-exempt), X(1.5 + 0.5 per other Joker of its type).
//   Energy: chips +30%, Xmult / Xmult_mod +20%; the perks, the Foresight, the 2 hands and the Tarot are fixed. Fennekin / Braixen carry
//   Delphox's Xmult_mod ("Energy carries to Delphox").
// Every ability is FIRED through real hands / discards / consumables / rounds with exact numbers.
//   node micatro/tests/mods/pokermon_starters_gen6_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, state, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { Card, P_CARDS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker, get_type, is_type } from '../../mods/pokermon/systems/types.js';
import { starter_lists } from '../../mods/pokermon/boosters/packs1.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { discard_cards_from_highlighted } from '../../js/engine/run.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const flat = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const C = (n) => P_CENTERS['j_poke_' + n];
const LINES = [['chespin', 'quilladin', 'chesnaught'], ['fennekin', 'braixen', 'delphox'], ['froakie', 'frogadier', 'greninja']];
const NAMES = LINES.flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
/** A pure typed "count" with no effect of its own: an Egg with a Tera sticker. */
function tera(type) { const e = add('j_egg'); apply_type_sticker(e, type); flush(); return e; }
function fresh(seed, jokers) { start(seed); return jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k)); }
/** Play exactly these cards; `final` makes it the round's last hand (hands_left 1 before it is played). */
function play(keys, { final = false, handsLeft } = {}) {
  clearHand();
  const cs = hand(keys);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (final) G.GAME.current_round.hands_left = 1;
  else if (handsLeft) G.GAME.current_round.hands_left = handsLeft;
  else if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips) };
}
const RANK = { 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const rankKey = (id, suit = 'S') => suit + '_' + (RANK[id] || String(id));
const scry = () => (G.scry_view ? G.scry_view.cards : []);
/** Discard as the player: `match` -> one card sharing the top Foreseen card's rank (+ a filler of another rank), else two cards of ranks no
 *  Foreseen card has. -> the consumables gained. */
function discard({ match, hook = false } = {}) {
  clearHand();
  const seen = new Set(scry().map((c) => c.get_id()));
  const other = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].filter((id) => !seen.has(id));
  const keys = match ? [rankKey(scry()[0].get_id(), 'H'), rankKey(other[0], 'D')] : [rankKey(other[0], 'D'), rankKey(other[1], 'C')];
  const cs = hand(keys);
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  const before = G.consumeables.cards.length;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  if (hook) discard_cards_from_highlighted(true); else act({ type: 'discard' });
  flush();
  return G.consumeables.cards.length - before;
}
/** Win the round, cash out, select the next Blind (The Wall). */
function nextRound() {
  clearHand();
  const c = hand(['S_2']);
  G.GAME.blind.chips = 1; G.GAME.chips = 1;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) });
  act({ type: 'play' }); flush();
  if (state() === 'ROUND_EVAL') act({ type: 'cash_out' });
  if (state() === 'SHOP') act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const use = (c) => { const r = act({ type: 'use', id: c.sort_id, targets: [] }); flush(); return r; };

// ------------------------------------------------------------------- pin, static data, order, families, art, precedence, energy fields
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 50 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 50+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const re = new RegExp('["\'](' + NAMES.join('|') + ')["\']|_(' + NAMES.join('|') + ')\\b', 'i');
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the nine (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('G6S0');
  const TYPES = ['Grass', 'Fire', 'Water'];
  LINES.forEach((line, li) => line.forEach((n, si) => {
    const c = C(n), dex = 650 + li * 3 + si;
    const want = [[2, 5, 'Basic'], ['poke_safari', 8, 'One'], ['poke_safari', 10, 'Two']][si];
    ok(c.rarity === want[0] && c.cost === want[1] && c.stage === want[2] && c.ptype === TYPES[li] && c.gen === 6,
      n + ' (' + dex + '): ' + want.join(' ') + ', ' + TYPES[li] + ', Gen 6', [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === 8 + 2 * (li * 3 + si) && c.pos.y === 43 && !c.soul_pos,
      n + ': upstream 3.9.1 cell Natdex {' + (8 + 2 * (li * 3 + si)) + ',43} (nothing to deploy)', [c.atlas, c.pos]);
    ok(c.attributes.includes('starter') && (si === 0 ? c.starter === true : !c.starter), n + ': the starter attribute' + (si === 0 ? ' and the Starter Pack flag' : ' (not in the Starter Pack)'));
  }));
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_chespin');
  ok(i > 0 && keys[i - 1] === 'j_poke_hydreigon' && NAMES.every((n, k) => keys[i + k] === 'j_poke_' + n) && keys[i + 9] === 'j_poke_bunnelby',
    'Pokédex order: Hydreigon (635), Chespin ... Greninja (650-658), Bunnelby (659)', keys.slice(i - 1, i + 10));
  for (const line of LINES) ok(JSON.stringify(poke_get_family_list(line[0])) === JSON.stringify(line), line.join(' -> ') + ': one family', poke_get_family_list(line[0]));
  const E = (n) => C(n).config.extra;
  ok(['chespin', 'quilladin', 'chesnaught'].every((n) => E(n).h_size === 1) && E('chespin').chips === 40 && E('quilladin').chips === 80 && E('chesnaught').chips === 150
    && E('chesnaught').Xmult === 1.5 && E('chesnaught').hands_req === 2, 'Chespin line: +1 hand size; +40 / +80 / +150 Chips; X1.5 with 2+ hands');
  ok(['fennekin', 'braixen', 'delphox'].every((n) => E(n).d_size === 1 && E(n).scry === 1 && E(n).Xmult_mod === 0.2) && E('delphox').fire_Xmult === 1,
    'Fennekin line: +1 discard, +1 Foresight, X0.2 per Tarot (carried from Fennekin)');
  ok(['froakie', 'frogadier', 'greninja'].every((n) => E(n).hands === 1) && E('froakie').chips === 30 && E('frogadier').chips === 50 && E('greninja').Xmult === 1.5
    && E('greninja').Xmult_mod === 0.5 && C('greninja').poke_mono_exempt === true && !C('frogadier').poke_mono_exempt, 'Froakie line: +1 hand; +30 / +50 per Water Joker; X1.5 + 0.5; Greninja Monotype-exempt');
  ok(LINES.every((l) => E(l[0]).rounds === 5 && E(l[1]).rounds === 5 && E(l[2]).rounds === undefined), 'evolutions: 5 rounds, then 5 (Chikorita / Cyndaquil / Totodile\'s timers)');
  ok(!['h_size', 'd_size', 'hands', 'scry', 'hands_req', 'fire_Xmult', 'rounds'].some((f) => f in energy_values) && near(energy_values.chips, 0.3) && near(energy_values.Xmult, 0.2)
    && near(energy_values.Xmult_mod, 0.2), 'Energy: chips +30%, Xmult / Xmult_mod +20%; perks, Foresight, the 2 hands and the bank are fixed');
});

// ------------------------------------------------------------------- the Starter Pack
await sec('starter pack', () => {
  start('G6PACK');
  const L = starter_lists();
  ok(L.grass.includes('j_poke_chespin') && L.fire.includes('j_poke_fennekin') && L.water.includes('j_poke_froakie'), 'Starter Pack candidates: Chespin (Grass), Fennekin (Fire), Froakie (Water)');
  ok(!['quilladin', 'chesnaught', 'braixen', 'delphox', 'frogadier', 'greninja'].some((n) => [...L.grass, ...L.fire, ...L.water].includes('j_poke_' + n)), 'their evolutions are not');
  add('j_poke_quilladin');
  ok(!starter_lists().grass.includes('j_poke_chespin') && starter_lists().grass.length === L.grass.length - 1, 'holding a Quilladin: the Chespin family is left out of the pack');
  // open a real Starter Pack with the other starters set aside: slots 1-3 must be ours (the pack's own create_card)
  start('G6PACK2');
  const saved = [];
  for (const c of Object.values(P_CENTERS)) if (c && c.set === 'Joker' && c.starter && !['j_poke_chespin', 'j_poke_fennekin', 'j_poke_froakie'].includes(c.key)) { saved.push(c); c.starter = false; }
  try {
    clearHand(); const w = hand(['S_2']); G.GAME.blind.chips = 1; G.GAME.chips = 1;
    act({ type: 'highlight', ids: w.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); act({ type: 'cash_out' }); flush();
    const pack = new Card(P_CARDS.empty, P_CENTERS.p_poke_pokepack_starter_pack);
    G.shop_booster.emplace(pack);
    G.GAME.dollars = 2000;
    ok(act({ type: 'buy', id: pack.sort_id }).ok && G.STATE === STATES.MOD_PACK, 'the Starter Pack opens');
    const got = G.pack_cards.cards.map(key);
    ok(got[0] === 'j_poke_chespin' && got[1] === 'j_poke_fennekin' && got[2] === 'j_poke_froakie', 'its Grass / Fire / Water slots: Chespin, Fennekin, Froakie', got);
  } finally { for (const c of saved) c.starter = true; }
});

// ------------------------------------------------------------------- Chespin line: +1 hand size, Chips, Spiky Shield
await sec('chespin', () => {
  start('G6CH1');
  const hs = G.hand.config.card_limit;
  const [c] = [add('j_poke_chespin')];
  ok(G.hand.config.card_limit === hs + 1, 'Chespin: +1 hand size', [hs, G.hand.config.card_limit]);
  let r = play(['S_2']);
  ok(r.chips === 5 + 2 + 40 && near(r.mult, 1), 'High Card: +40 Chips (5 + 2 + 40)', r.total);
  c.remove(); flush();
  ok(G.hand.config.card_limit === hs, 'sold / gone: the hand size is taken back', G.hand.config.card_limit);
  const [q] = fresh('G6CH2', ['quilladin']);
  r = play(['S_2']);
  ok(r.chips === 5 + 2 + 80 && near(r.mult, 1) && G.hand.config.card_limit === hs + 1, 'Quilladin: +80 Chips, +1 hand size', r.total);
  ok(flat(q).includes('+80 Chips') && flat(q).includes('hand size'), 'Quilladin tooltip', flat(q));
});
await sec('chesnaught', () => {
  const [c] = fresh('G6CN1', ['chesnaught']);
  let r = play(['S_2'], { handsLeft: 4 });
  ok(r.chips === 157 && near(r.mult, 1.5), '4 hands left: +150 Chips and Spiky Shield X1.5', r.total);
  r = play(['S_2'], { handsLeft: 2 });
  ok(r.chips === 157 && near(r.mult, 1.5), 'exactly 2 hands left before the hand (this one included): X1.5', r.total);
  r = play(['S_2'], { final: true });
  ok(r.chips === 157 && near(r.mult, 1), 'the final hand (1 left): +150 Chips only', r.total);
  start('G6CN2'); const c2 = add('j_poke_chesnaught');
  G.GAME.current_round.hands_left = 3;
  ok(flat(c2).includes('X1.5 Mult') && flat(c2).includes('Active!'), 'tooltip: X1.5 while 2+ hands, Active!', flat(c2));
  G.GAME.current_round.hands_left = 1;
  ok(flat(c2).includes('Inactive'), 'tooltip with 1 hand left: Inactive', flat(c2));
  // Blueprint copies both
  start('G6CN3'); add('j_blueprint'); add('j_poke_chesnaught');
  r = play(['S_2'], { handsLeft: 4 });
  ok(r.chips === 5 + 2 + 300 && near(r.mult, 2.25), 'Blueprint copies +150 and X1.5', r.total);
  ok(c, 'ok');
});

// ------------------------------------------------------------------- Fennekin line: +1 discard, +1 Foresight, Braixen's Tarot, Mystical Fire
await sec('fennekin', () => {
  start('G6FE1');
  const d0 = G.GAME.round_resets.discards, dl = G.GAME.current_round.discards_left;
  const f = add('j_poke_fennekin');
  ok(G.GAME.round_resets.discards === d0 + 1 && G.GAME.current_round.discards_left === dl + 1, 'Fennekin: +1 discard (now and each round)', [d0, G.GAME.round_resets.discards]);
  ok(G.GAME.scry_amount === 1 && scry().length === 1, 'Fennekin: +1 Foresight (one Foreseen card)', G.GAME.scry_amount);
  ok(discard({ match: true }) === 0, 'Fennekin makes no Tarot');
  f.remove(); flush();
  ok(G.GAME.round_resets.discards === d0 && (G.GAME.scry_amount || 0) === 0, 'gone: the discard and the Foresight are taken back');
});
await sec('braixen', () => {
  const [b] = fresh('G6BR1', ['braixen']);
  ok(G.GAME.scry_amount === 1, 'Braixen: +1 Foresight', G.GAME.scry_amount);
  ok(discard({ match: false }) === 0, 'a discard with no Foreseen rank: no Tarot');
  ok(flat(b).includes('Active!'), 'tooltip: Active!', flat(b));
  const got = discard({ match: true });
  ok(got === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'the first discard with a card sharing the Foreseen rank: a Tarot', G.consumeables.cards.map(key));
  ok(flat(b).includes('Used this round'), 'tooltip: Used this round', flat(b));
  ok(discard({ match: true }) === 0, 'a second one this round: nothing (once per round)');
  nextRound();
  ok(discard({ match: true }) === 1, 'the next round: another Tarot');
  // no room: nothing made, the round's chance not used up
  nextRound();
  while (G.consumeables.cards.length < G.consumeables.config.card_limit) add('c_pluto');
  ok(discard({ match: true }) === 0, 'no consumable room: no Tarot');
  G.consumeables.cards[0].remove(); flush();
  ok(discard({ match: true }) === 1, '... and with room again, the same round: the Tarot (not used up by the full slots)');
  // The Hook's forced discard isn't yours
  nextRound();
  for (const c of G.consumeables.cards.slice()) c.remove(); flush();
  ok(discard({ match: true, hook: true }) === 0, 'a forced discard (The Hook): no Tarot');
  // the Tarot is from the run's seeded stream
  const pick = (seed) => { fresh(seed, ['braixen']); discard({ match: true }); return G.consumeables.cards.map(key).join(); };
  const a = pick('G6BRSEED'), c = pick('G6BRSEED');
  ok(a && a === c, 'seeded: the same seed makes the same Tarot', [a, c]);
});
await sec('delphox', () => {
  start('G6DX1');
  const d0 = G.GAME.round_resets.discards;
  const d = add('j_poke_delphox');
  ok(G.GAME.scry_amount === 1 && G.GAME.round_resets.discards === d0 + 1, 'Delphox: +1 Foresight, +1 discard', [G.GAME.scry_amount, G.GAME.round_resets.discards]);
  let r = play(['S_2']);
  ok(near(r.mult, 1), 'no Tarot used yet: no X', r.total);
  use(add('c_temperance'));
  ok(near(ex(d).fire_Xmult, 1.2), 'a Tarot used (Temperance): X1.2', ex(d).fire_Xmult);
  use(add('c_hermit'));
  ok(near(ex(d).fire_Xmult, 1.4), 'a second Tarot (The Hermit): X1.4', ex(d).fire_Xmult);
  use(add('c_neptune'));
  ok(near(ex(d).fire_Xmult, 1.4), 'a Planet (Neptune): no gain', ex(d).fire_Xmult);
  r = play(['S_2']);
  ok(near(r.mult, 1.4), 'Mystical Fire: X1.4', r.total);
  ok(flat(d).includes('X0.2 Mult') && flat(d).includes('Currently X1.4 Mult'), 'tooltip', flat(d));
  // Blueprint copies the X, never the gain
  start('G6DX2'); add('j_blueprint'); const d2 = add('j_poke_delphox');
  use(add('c_temperance'));
  ok(near(ex(d2).fire_Xmult, 1.2), 'with Blueprint, one Tarot still gains once (X1.2)', ex(d2).fire_Xmult);
  r = play(['S_2']);
  ok(near(r.mult, 1.44), 'Blueprint copies X1.2', r.total);
  // Energy raises later gains only (banked is never raised)
  increment_energy(d2, 'Fire');
  ok(near(ex(d2).Xmult_mod, 0.24) && near(ex(d2).fire_Xmult, 1.2), 'Fire Energy: gain 0.2 -> 0.24, the bank X1.2 untouched', ex(d2));
  use(add('c_temperance'));
  ok(near(ex(d2).fire_Xmult, 1.44), 'the next Tarot gains 0.24: X1.44', ex(d2).fire_Xmult);
  increment_energy(d2, 'Fire'); increment_energy(d2, 'Fire');
  ok(near(ex(d2).Xmult_mod, 0.32), 'three Energy: 0.24 / 0.28 / 0.32', ex(d2).Xmult_mod);
});

// ------------------------------------------------------------------- Froakie line: Chips per Water Joker; Greninja's Protean
await sec('froakie', () => {
  const [f] = fresh('G6FR1', ['froakie']);
  ok(G.GAME.round_resets.hands === 5, 'Froakie: +1 hand (4 -> 5)', G.GAME.round_resets.hands);
  let r = play(['S_2']);
  ok(r.chips === 5 + 2 + 30, 'alone (itself a Water Joker): +30 Chips', r.total);
  const w = tera('Water'); tera('Fire');
  r = play(['S_2']);
  ok(r.chips === 5 + 2 + 60, '+ a Water Egg (and a Fire one): 2 Water Jokers, +60', r.total);
  debuff(w);
  r = play(['S_2']);
  ok(r.chips === 5 + 2 + 30, 'the Water Egg debuffed: +30', r.total);
  add('j_poke_arceus');
  r = play(['S_2']);
  ok(r.chips === 5 + 2 + 60, 'Arceus (every type) counts as Water: +60', r.total);
  ok(flat(f).includes('Currently 2: +60 Chips'), 'tooltip: Currently 2: +60', flat(f));
  f.remove(); flush();
  ok(G.GAME.round_resets.hands === 4, 'gone: the hand is taken back', G.GAME.round_resets.hands);
  const [g] = fresh('G6FR2', ['frogadier']);
  tera('Water');
  r = play(['S_2']);
  ok(r.chips === 5 + 2 + 100 && G.GAME.round_resets.hands === 5, 'Frogadier: +50 per Water Joker (2: +100), +1 hand', r.total);
  ok(g, 'ok');
});
await sec('greninja', () => {
  start('G6GR1', {}, { noBlind: true });
  const g = add('j_poke_greninja');
  ok(G.GAME.round_resets.hands === 5, 'Greninja: +1 hand', G.GAME.round_resets.hands);
  tera('Fire'); tera('Fire'); tera('Water');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(ex(g).ptype === 'Fire' && get_type(g) === 'Fire' && is_type(g, 'Fire') && !is_type(g, 'Water'), 'Protean: 2 Fire vs 1 Water others -> Greninja is Fire', ex(g).ptype);
  let r = play(['S_2']);
  ok(near(r.mult, 1.5 + 0.5 * 2), 'X(1.5 + 0.5 x 2 other Fire Jokers) = X2.5', r.total);
  ok(flat(g).includes('Currently Fire, 2 others') && flat(g).includes('X2.5'), 'tooltip names the type and the count', flat(g));
  // it keeps its type through the shop; a tie at the next Blind keeps it
  nextRound();
  ok(ex(g).ptype === 'Fire', 'the next Blind (still 2 Fire, 1 Water): Fire', ex(g).ptype);
  G.jokers.cards.find((j) => j !== g && get_type(j) === 'Fire').remove(); flush();
  nextRound();
  ok(ex(g).ptype === 'Fire', 'a tie (1 Fire, 1 Water): it keeps its current type (Fire)', ex(g).ptype);
  r = play(['S_2']);
  ok(near(r.mult, 2), 'X(1.5 + 0.5 x 1) = X2', r.total);
  tera('Water');
  nextRound();
  ok(ex(g).ptype === 'Water', '2 Water vs 1 Fire: Water again', ex(g).ptype);
  r = play(['S_2']);
  ok(near(r.mult, 2.5), 'X2.5 with 2 other Water Jokers', r.total);
  // debuffed jokers don't count, for the pick nor the X
  for (const j of G.jokers.cards.filter((j) => j !== g && get_type(j) === 'Water')) debuff(j);
  r = play(['S_2']);
  ok(near(r.mult, 1.5), 'its 2 Water partners debuffed: X1.5', r.total);
  nextRound();
  ok(ex(g).ptype === 'Fire', 'and at the next Blind the undebuffed Fire one decides: Fire', ex(g).ptype);
  // no typed joker: keeps its type
  start('G6GR2', {}, { noBlind: true });
  const g2 = add('j_poke_greninja'); add('j_joker');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(ex(g2).ptype === 'Water', 'no typed joker: stays Water', ex(g2).ptype);
  r = play(['S_2']);
  ok(near(r.mult, 1 * 1.5 + 4), 'X1.5 alone (then Joker +4, to its right)', r.total);
  // Blueprint copies the X, not Protean
  start('G6GR3', {}, { noBlind: true });
  add('j_blueprint'); const g3 = add('j_poke_greninja'); tera('Fire'); tera('Fire');
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(ex(g3).ptype === 'Fire', 'with Blueprint: Fire', ex(g3).ptype);
  r = play(['S_2']);
  ok(near(r.mult, 2.5 * 2.5), 'Blueprint copies X2.5', r.total);
  // Energy: its current type's matches
  increment_energy(g3, 'Fire');
  ok(near(ex(g3).Xmult, 1.8) && near(ex(g3).Xmult_mod, 0.6), 'Fire Energy while Fire: 1.5 -> 1.8, 0.5 -> 0.6', ex(g3));
  increment_energy(g3, 'Water');
  ok(near(ex(g3).Xmult, 1.8) && (ex(g3).energy_count || 0) === 1, 'Water Energy while Fire: no match', ex(g3));
  increment_energy(g3, 'Fire'); increment_energy(g3, 'Fire');
  ok(near(ex(g3).Xmult, 2.4) && near(ex(g3).Xmult_mod, 0.8), 'three Energy: X2.4 + 0.8 each', ex(g3));
  r = play(['S_2']);
  ok(near(r.mult, (2.4 + 1.6) * (2.4 + 1.6)), 'Greninja + Blueprint, 3 Energy, 2 Fire others: X4 each', r.total);
});
await sec('greninja monotype', () => {
  const RB = () => G.GAME.run_badges;
  newRun({ seed: 'G6MONO', seeded: false, back: 'b_red', mods: ['pokermon'] }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  add('j_poke_charmander');
  const g = add('j_poke_greninja');
  act({ type: 'select_blind' }); flush();
  ok(RB() && RB().mono && RB().type === 'Fire' && ex(g).ptype === 'Fire', 'a Charmander + Greninja run locks Fire (Greninja left out; it turns Fire)', [RB() && RB().type, ex(g).ptype]);
  clearHand(); nextRound();
  ok(RB().mono && RB().mono_reason === '', 'next round: still Monotype', RB());
});

// ------------------------------------------------------------------- evolutions, perks across them, Energy numbers
await sec('evolve chespin', () => {
  start('G6EV1');
  const hs = G.hand.config.card_limit;
  const c = add('j_poke_chespin');
  increment_energy(c, 'Grass');
  ok(near(ex(c).chips, 52), 'one Grass Energy: +40 -> +52', ex(c).chips);
  for (let i = 0; i < 4; i++) nextRound();
  ok(key(c) === 'j_poke_chespin' && ex(c).rounds === 1, 'after 4 rounds: still Chespin', [key(c), ex(c).rounds]);
  nextRound();
  ok(key(c) === 'j_poke_quilladin' && near(ex(c).chips, 104) && ex(c).energy_count === 1, 'after 5: Quilladin, its Energy re-applied (+80 -> +104)', [key(c), ex(c)]);
  ok(G.hand.config.card_limit === hs + 1, 'still exactly +1 hand size (not doubled by the evolution)', G.hand.config.card_limit);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(c) === 'j_poke_chesnaught' && near(ex(c).chips, 195) && near(ex(c).Xmult, 1.8), 'after 5 more: Chesnaught, +150 -> +195, X1.5 -> X1.8', [key(c), ex(c)]);
  ok(G.hand.config.card_limit === hs + 1, 'Chesnaught: still +1 hand size', G.hand.config.card_limit);
  const r = play(['S_2'], { handsLeft: 4 });
  ok(r.chips === 7 + 195 && near(r.mult, 1.8), 'and it scores +195, X1.8', r.total);
  const [q] = fresh('G6EN1', ['quilladin']); const [ch] = [add('j_poke_chesnaught')];
  const qs = [], cs = [], xs = [];
  for (let i = 0; i < 3; i++) { increment_energy(q, 'Grass'); increment_energy(ch, 'Grass'); qs.push(ex(q).chips); cs.push(ex(ch).chips); xs.push(ex(ch).Xmult); }
  ok([104, 128, 152].every((v, i) => near(qs[i], v)) && [195, 240, 285].every((v, i) => near(cs[i], v)) && [1.8, 2.1, 2.4].every((v, i) => near(xs[i], v)),
    'Energy: Quilladin 104 / 128 / 152; Chesnaught 195 / 240 / 285 and X1.8 / 2.1 / 2.4', [qs, cs, xs]);
  ok(ex(ch).h_size === 1 && ex(ch).hands_req === 2, 'the perk and the 2 hands never energize');
});
await sec('evolve fennekin', () => {
  start('G6EV2');
  const d0 = G.GAME.round_resets.discards;
  const f = add('j_poke_fennekin');
  increment_energy(f, 'Fire');
  ok(near(ex(f).Xmult_mod, 0.24) && ex(f).scry === 1 && ex(f).d_size === 1, 'Fennekin takes Energy for later: 0.2 -> 0.24 (Foresight / discard fixed)', ex(f));
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(f) === 'j_poke_braixen' && near(ex(f).Xmult_mod, 0.24), 'after 5 rounds: Braixen, the Energy carried', [key(f), ex(f)]);
  ok(G.GAME.round_resets.discards === d0 + 1 && G.GAME.scry_amount === 1, 'still exactly +1 discard and +1 Foresight', [G.GAME.round_resets.discards, G.GAME.scry_amount]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(f) === 'j_poke_delphox' && near(ex(f).Xmult_mod, 0.24) && near(ex(f).fire_Xmult, 1), 'after 5 more: Delphox, gain 0.24 (Energy from Fennekin), bank X1', [key(f), ex(f)]);
  ok(G.GAME.round_resets.discards === d0 + 1 && G.GAME.scry_amount === 1, 'Delphox: still +1 discard, +1 Foresight');
  use(add('c_temperance'));
  ok(near(ex(f).fire_Xmult, 1.24), 'its first Tarot: X1.24', ex(f).fire_Xmult);
});
await sec('evolve froakie', () => {
  start('G6EV3');
  const f = add('j_poke_froakie');
  const en = [];
  for (let i = 0; i < 3; i++) { increment_energy(f, 'Water'); en.push(ex(f).chips); }
  ok([39, 48, 57].every((v, i) => near(en[i], v)), 'Froakie Energy: +30 -> 39 / 48 / 57', en);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(f) === 'j_poke_frogadier' && near(ex(f).chips, 95) && G.GAME.round_resets.hands === 5, 'after 5 rounds: Frogadier, 3 Energy re-applied (+50 -> +95), still +1 hand', [key(f), ex(f).chips, G.GAME.round_resets.hands]);
  for (let i = 0; i < 5; i++) nextRound();
  ok(key(f) === 'j_poke_greninja' && near(ex(f).Xmult, 2.4) && near(ex(f).Xmult_mod, 0.8) && ex(f).ptype === 'Water' && G.GAME.round_resets.hands === 5,
    'after 5 more: Greninja (Water), X2.4 + 0.8 per other (3 Energy), still +1 hand', [key(f), ex(f), G.GAME.round_resets.hands]);
  const [fr] = fresh('G6EN3', ['frogadier']);
  const fg = [];
  for (let i = 0; i < 3; i++) { increment_energy(fr, 'Water'); fg.push(ex(fr).chips); }
  ok([65, 80, 95].every((v, i) => near(fg[i], v)), 'Frogadier Energy: +50 -> 65 / 80 / 95', fg);
});

// ------------------------------------------------------------------- the in-game texts
await sec('texts', () => {
  start('G6T0');
  const T = {};
  for (const n of NAMES) T[n] = flat(add('j_poke_' + n));
  console.log(JSON.stringify(T, null, 1));
  ok(/\+1 hand size \+40 Chips/.test(T.chespin) && /Evolves after 5 rounds/.test(T.chespin), 'Chespin text', T.chespin);
  ok(/Spiky Shield: X1.5 Mult while you have 2 or more hands left/.test(T.chesnaught), 'Chesnaught text', T.chesnaught);
  ok(/\+1 discard each round \+1 Foresight/.test(T.fennekin) && /Energy carries to Delphox/.test(T.fennekin), 'Fennekin text', T.fennekin);
  ok(/shares a rank with a Foreseen card, create a Tarot card/.test(T.braixen) && /Must have room/.test(T.braixen), 'Braixen text', T.braixen);
  ok(/Mystical Fire: gains X0.2 Mult for each Tarot card used/.test(T.delphox), 'Delphox text', T.delphox);
  ok(/\+1 hand \+30 Chips for each Water Joker/.test(T.froakie), 'Froakie text', T.froakie);
  ok(/Protean: when a Blind is selected, becomes the type most common among your other Jokers/.test(T.greninja) && /Monotype/.test(T.greninja), 'Greninja text', T.greninja);
  ok(!Object.values(T).some((s) => /ERROR|#\d#|undefined|NaN/.test(s)), 'no unfilled variables');
});

done();
