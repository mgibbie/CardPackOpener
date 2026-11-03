// Gen 8, batch 2 (the owner's "go ahead with batch 2", 2026-11-02; jokers/pokejokers_designs.js "Gen 8, batch 2"; PORTING.md "Gen 8,
// batch 2"): 14 jokers, #848-861, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8; Toxel a Baby U $4,
// Toxtricity a shop Basic R $7), in Pokédex order after Barraskewda, before Dreepy:
//   Toxel 848 -> Toxtricity (Lightning)          +4 Mult (a Baby: the faint rule); 3 rounds. Toxtricity's form is rolled when obtained:
//                                                Amped X2 on exactly 5 played cards, Low Key +40 Chips per card fewer than 5.
//   Sizzlipede 850 -> Centiskorch (Fire)         Fire Spin: the round's first discarded card burns (destroyed); +2 Mult / X0.1 banked.
//   Clobbopus 852 -> Grapploct (Fighting)        Octolock: held cards sharing a scored rank +2 Mult each / X1.25 each.
//   Sinistea 854 -> Polteageist (Psychic)        X1.5 / X2; Antique (1 in 10, rolled when obtained, fixed) X3 / X4.
//   Hatenna 856 -> Hattrem -> Hatterene (Psychic) +4 / +6 Mult per Psychic Joker; X1 + X0.25 each; Magic Powder: a Psychic Tera to its right.
//   Impidimp 859 -> Morgrem -> Grimmsnarl (Fairy) Prankster: rerolls $1 less (min $1); the shop's first reroll free; X0.1 per reroll.
// Every ability is FIRED through real hands / rounds / shops with exact numbers.
//   node micatro/tests/mods/pokermon_gen8_batch2_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import * as RUN from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { is_type, get_type, apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import * as ANIM from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 900)); } };
const ex = (j) => j.ability.extra;
const C = (n) => P_CENTERS['j_poke_' + n];
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ');
const LINES = {
  toxel: ['toxel', 'toxtricity'], sizzlipede: ['sizzlipede', 'centiskorch'], clobbopus: ['clobbopus', 'grapploct'], sinistea: ['sinistea', 'polteageist'],
  hatenna: ['hatenna', 'hattrem', 'hatterene'], impidimp: ['impidimp', 'morgrem', 'grimmsnarl'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys, or [key, center] pairs (the first is the leftmost). */
function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list`, keeping `held` in hand; the round never ends by accident. */
function play(list, held = []) {
  clearHand();
  const cs = cards(list);
  const hs = cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, held: hs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
}
/** Discard `list` from the hand (a player's discard). */
function discard(list) {
  clearHand();
  const cs = cards(list);
  if (G.GAME.current_round.discards_left < 1) G.GAME.current_round.discards_left = 1;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'discard' });
  flush();
  return { cards: cs, r };
}
/** Win the round in progress (High Card 2) -> ROUND_EVAL. */
function endRound() { clearHand(); const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips; if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2; act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush(); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const rounds = (n) => { for (let r = 0; r < n; r++) { endRound(); advance(); } };
/** Win the round and open the shop. */
function toShop() { endRound(); act({ type: 'cash_out' }); flush(); }
const cost = () => G.GAME.current_round.reroll_cost;
/** Reroll the shop: -> the $ it cost. */
function reroll() { const d0 = G.GAME.dollars; const r = act({ type: 'reroll_shop' }); flush(); return d0 - G.GAME.dollars; }
/** A fresh run with these jokers and the first Blind selected (the setting_blind context sees them). */
function fresh(seed, jokers) {
  start(seed, {}, { noBlind: true });
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  act({ type: 'select_blind' }); flush();
  clearHand();
  return js;
}
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j) => { const f = face(j); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const GEN8 = 'poke_AtlasJokersBasicGen08391';

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', async () => {
  ok(MODS.pokermon.contentRev >= 71 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 71+ (Gen 8 batch 2)', PINS.modPin('pokermon'));
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  walk(path.join(ROOT, 'mods', 'pokermonplus'));
  ok(hits.length === 0, 'Pokermon+ has none of the 14', hits);
  // Nacho 1.7.9 ships the Impidimp line as data only: can_load = false upstream, so mods/nacho/index.js never registers it
  const NACHO = (await import('../../mods/nacho/data179.js')).default;
  const nf = NACHO.groups.jokers.filter((f) => (f.ret.list || []).some((x) => NAMES.includes(x.name)));
  ok(nf.length === 1 && nf[0].file === 'src/pokemon/0859_impidimp.lua' && nf[0].ret.can_load === false, 'Nacho: only its Impidimp line, never loaded (nothing to dedupe)', nf.map((f) => [f.file, f.ret.can_load]));
});
await sec('static', () => {
  start('G8B2S');
  const S = 'poke_safari';
  const N = 'poke_AtlasJokersBasicNatdex391';
  // [rarity, cost, stage, type, rounds|undefined, atlas, x, y]
  const WANT = {
    toxel: [2, 4, 'Baby', 'Lightning', 3, N, 14, 56], toxtricity: [3, 7, 'Basic', 'Lightning', undefined, GEN8, 6, 0],
    sizzlipede: [1, 5, 'Basic', 'Fire', 5, N, 18, 56], centiskorch: [S, 8, 'One', 'Fire', undefined, N, 20, 56],
    clobbopus: [1, 5, 'Basic', 'Fighting', 5, N, 22, 56], grapploct: [S, 8, 'One', 'Fighting', undefined, N, 24, 56],
    sinistea: [1, 5, 'Basic', 'Psychic', 5, N, 26, 56], polteageist: [S, 8, 'One', 'Psychic', undefined, N, 28, 56],
    hatenna: [2, 6, 'Basic', 'Psychic', 4, N, 0, 57], hattrem: [S, 8, 'One', 'Psychic', 5, N, 2, 57], hatterene: [S, 10, 'Two', 'Psychic', undefined, N, 4, 57],
    impidimp: [2, 6, 'Basic', 'Fairy', 4, N, 6, 57], morgrem: [S, 8, 'One', 'Fairy', 5, N, 8, 57], grimmsnarl: [S, 10, 'Two', 'Fairy', undefined, N, 10, 57],
  };
  ok(Object.keys(WANT).length === 14 && NAMES.length === 14, '14 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, atlas, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 8,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 8`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === atlas && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${atlas} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const order = ['barraskewda', ...NAMES, 'dreepy'].map((n) => 'j_poke_' + n);
  const i = keys.indexOf('j_poke_barraskewda');
  ok(i > 0 && order.every((k, n) => keys[i + n] === k), 'Pokédex order: Barraskewda (847), Toxel ... Grimmsnarl (848-861), Dreepy (885)', keys.slice(i, i + 16));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  ok(NAMES.every((n) => !C(n).poke_no_energy_field), 'every one of the 14 takes Energy (a main number, or its evolution\'s carried)');
  ok(['reroll_discount', 'num', 'dem', 'rounds', 'burn_mult', 'burn_Xmult', 'prank_Xmult'].every((f) => !(f in energy_values))
    && ['mult', 'chips', 'Xmult', 'mult_mod', 'Xmult_mod', 'Xmult_multi'].every((f) => f in energy_values),
    'Energy fields: the main numbers; fixed: the reroll discount, the Antique odds, the banks');
});

// ------------------------------------------------------------------- Toxel / Toxtricity: a Baby, the forms
await sec('toxel', () => {
  start('TOXEL');
  const t = add('j_poke_toxel');
  let h = play(['S_A']);
  ok(near(h.mult, 1 + 4), 'Toxel: +4 Mult', h.total);
  ok(/\+4 Mult/.test(plain(t)) && /Evolves after 3 rounds/.test(plain(t)), 'its text', plain(t));
  // the Baby rule: a non-Baby Joker to its right -> it faints (debuffed) after the hand
  const j = add('j_joker');
  h = play(['S_A']);
  ok(near(h.mult, 1 + 4 + 4) && t.debuff, 'a non-Baby Joker to its right: it scores this hand, then faints (debuffed)', [h.total, t.debuff]);
  j.remove(); flush();
  endRound(); advance();
  ok(!t.debuff, 'the next round: back', t.debuff);
  ok(ex(t).rounds === 3, 'the round it fainted in didn\'t count: still 3 to go', ex(t).rounds);
  rounds(2);
  ok(key(t) === 'j_poke_toxel' && ex(t).rounds === 1, '2 rounds: 1 to go', [key(t), ex(t).rounds]);
  rounds(1);
  ok(key(t) === 'j_poke_toxtricity' && ['amped', 'lowkey'].includes(t.ability.poke_tox_form), 'Toxel -> Toxtricity after 3 rounds; its form rolled on evolving', [key(t), t.ability.poke_tox_form]);
  // seeded: the same run seed rolls the same form; across seeds both forms appear
  const roll = (seed) => { start(seed); return add('j_poke_toxtricity').ability.poke_tox_form; };
  ok(roll('TOXSEED') === roll('TOXSEED'), 'seeded: the same run rolls the same form', roll('TOXSEED'));
  const seen = new Set(); for (let s = 0; s < 24; s++) seen.add(roll('TOXF' + s));
  ok(seen.has('amped') && seen.has('lowkey') && seen.size === 2, 'both forms appear across seeds', [...seen]);
});
await sec('toxtricity forms', () => {
  start('TOXF');
  const t = add('j_poke_toxtricity');
  ok(['amped', 'lowkey'].includes(t.ability.poke_tox_form), 'obtained directly: the form is rolled', t.ability.poke_tox_form);
  const form0 = t.ability.poke_tox_form;
  t.ability.poke_tox_form = 'amped';
  let h = play(['S_2', 'H_5', 'D_9', 'C_J', 'S_K']);
  ok(near(h.mult, 1 * 2), 'Amped: 5 cards played (a High Card, 1 scored) -> X2', h.total);
  h = play(['S_2', 'H_5', 'D_9', 'C_J']);
  ok(near(h.mult, 1), 'Amped: 4 cards -> nothing', h.total);
  ok(/Punk Rock: X2 Mult if exactly 5 cards are played/.test(plain(t)) && /Amped Form/.test(plain(t)), 'Amped text', plain(t));
  ok(drawn(t)[0] === GEN8 && drawn(t)[1].x === 6 && drawn(t)[1].y === 0, 'Amped: its own card (Gen 8 {6,0})', drawn(t));
  t.ability.poke_tox_form = 'lowkey';
  h = play(['S_A']);
  ok(h.chips === 11 + 5 + 160, 'Low Key: 1 card -> +160 Chips', h.total);
  h = play(['S_A', 'H_A', 'D_3']);
  ok(h.chips === 10 + 22 + 80, 'Low Key: 3 cards -> +80 Chips', h.total);
  h = play(['S_2', 'H_5', 'D_9', 'C_J', 'S_K']);
  ok(h.chips === 5 + 10 && near(h.mult, 1), 'Low Key: 5 cards -> nothing', h.total);
  ok(/\+40 Chips for each card fewer than 5 played/.test(plain(t)) && /Low Key Form/.test(plain(t)), 'Low Key text', plain(t));
  ok(drawn(t)[0] === GEN8 && drawn(t)[1].x === 8 && drawn(t)[1].y === 0, 'Low Key: its Low Key card (Gen 8 {8,0})', drawn(t));
  const sh = face(t, true);
  ok(sh && sh.atlas === 'poke_AtlasJokersBasicGen08Shiny391' && sh.pos.x === 8, 'a Shiny Low Key draws the Shiny sheet\'s twin', sh && [sh.atlas, sh.pos]);
  t.ability.poke_tox_form = undefined;
  ok(/Amped Form, Punk Rock/.test(plain(t)) && /Low Key Form/.test(plain(t)) && /rolled when obtained/.test(plain(t)), 'unrolled (shop / collection): both forms, "rolled when obtained"', plain(t));
  t.ability.poke_tox_form = form0;
  // Blueprint copies it
  start('TOXBP');
  const t2 = add('j_poke_toxtricity'); add('j_blueprint'); G.jokers.cards.reverse();
  t2.ability.poke_tox_form = 'amped';
  h = play(['S_2', 'H_5', 'D_9', 'C_J', 'S_K']);
  ok(near(h.mult, 4), 'Blueprint copies the X2', h.total);
});

// ------------------------------------------------------------------- Sizzlipede / Centiskorch: Fire Spin
await sec('fire spin', () => {
  start('SIZZ');
  const s = add('j_poke_sizzlipede');
  const n0 = G.playing_cards.length;
  let d = discard(['S_K', 'H_9']);
  ok(!G.playing_cards.includes(d.cards[0]) && G.playing_cards.includes(d.cards[1]) && G.playing_cards.length === n0 + 1, 'the first discard: its first card burns (destroyed), the other is discarded', [G.playing_cards.length - n0]);
  ok(ex(s).burn_mult === 2 && /Currently \+2 Mult; burned this round/.test(plain(s)), 'Sizzlipede: +2 Mult banked', plain(s));
  d = discard(['S_Q']);
  ok(G.playing_cards.includes(d.cards[0]) && ex(s).burn_mult === 2, 'a second discard this round: nothing', ex(s).burn_mult);
  let h = play(['S_A']);
  ok(near(h.mult, 1 + 2), 'it scores +2', h.total);
  endRound(); advance();
  ok(/ready/.test(plain(s)), 'a new round: ready', plain(s));
  discard(['D_4']);
  ok(ex(s).burn_mult === 4, 'next round: +4 banked', ex(s).burn_mult);
  // The Hook's discards never burn (a player's discard only)
  endRound(); advance();
  clearHand();
  const hk2 = cards(['S_3', 'H_4']);
  for (const c of hk2) G.hand.add_to_highlighted(c, true);
  RUN.discard_cards_from_highlighted(true); flush();
  ok(hk2.every((c) => G.playing_cards.includes(c)) && ex(s).burn_mult === 4, 'The Hook\'s discard (hook = true): nothing burns', ex(s).burn_mult);
  // destroy contexts fire: Canio (a face card destroyed: +X1)
  const caino = add('j_caino');
  const x0 = caino.ability.caino_xmult;
  discard(['S_J']);
  ok(ex(s).burn_mult === 6 && caino.ability.caino_xmult === x0 + 1, 'a burned Jack: Canio gains X1 (remove_playing_cards ran)', [ex(s).burn_mult, caino.ability.caino_xmult]);
  caino.remove(); flush();
  ok(/Fire Spin: the first card you discard each round is destroyed and this Joker permanently gains \+2 Mult/.test(plain(s)), 'its text', plain(s));
  ok(ex(s).rounds === 3, '2 rounds won: 3 to go', ex(s).rounds);
  rounds(2);
  ok(key(s) === 'j_poke_sizzlipede', '4 rounds: still Sizzlipede', key(s));
  rounds(1);
  ok(key(s) === 'j_poke_centiskorch' && ex(s).burn_mult === 6 && ex(s).burn_Xmult === 1, 'Sizzlipede -> Centiskorch after 5 rounds: the +6 Mult carries', [key(s), ex(s).burn_mult, ex(s).burn_Xmult]);
  h = play(['S_A']);
  ok(near(h.mult, 1 + 6), 'Centiskorch: +6 kept (X1: nothing yet)', h.total);
  discard(['S_9']);
  ok(near(ex(s).burn_Xmult, 1.1) && ex(s).burn_mult === 6, 'Centiskorch: the burn gains X0.1', [ex(s).burn_Xmult, ex(s).burn_mult]);
  h = play(['S_A']);
  ok(near(h.mult, (1 + 6) * 1.1), 'it scores +6 and X1.1', h.total);
  ok(/permanently gains X0.1 Mult/.test(plain(s)) && /\+6 Mult \(kept from Sizzlipede\)/.test(plain(s)), 'its text', plain(s));
  // Blueprint copies the score, never the burn
  start('SIZZ2');
  const s2 = add('j_poke_sizzlipede'); add('j_blueprint'); G.jokers.cards.reverse();
  const m0 = G.playing_cards.length;
  discard(['S_K', 'H_9']);
  ok(ex(s2).burn_mult === 2 && G.playing_cards.length === m0 + 1, 'with Blueprint: one card burns, +2 once', [ex(s2).burn_mult, G.playing_cards.length - m0]);
  h = play(['S_A']);
  ok(near(h.mult, 1 + 4), 'Blueprint copies the +2', h.total);
  // with Carnivine: both eat the same card (destroyed once), both bank
  start('SIZZ3');
  const s3 = add('j_poke_sizzlipede'), cv = add('j_poke_carnivine');
  const k0 = G.playing_cards.length;
  d = discard(['S_K', 'H_9']);
  ok(ex(s3).burn_mult === 2 && ex(cv).devour_mult === 4 && G.playing_cards.length === k0 + 1 && !G.playing_cards.includes(d.cards[0]), 'with Carnivine: the same card, destroyed once; both bank', [ex(s3).burn_mult, ex(cv).devour_mult, G.playing_cards.length - k0]);
});

// ------------------------------------------------------------------- Clobbopus / Grapploct: Octolock
await sec('octolock', () => {
  start('OCTO');
  const c = add('j_poke_clobbopus');
  let h = play(['S_K'], ['H_K', 'D_K', 'C_5', 'S_9']);
  ok(near(h.mult, 1 + 2 + 2), 'Clobbopus: a King scored, 2 Kings held -> +4', h.total);
  h = play(['S_K', 'H_K', 'D_3'], ['C_K', 'C_3', 'S_3']);
  ok(near(h.mult, 2 + 2), 'a Pair of Kings with a 3 kicker: held King +2; held 3s don\'t count (the kicker doesn\'t score)', h.total);
  clearHand();
  const [pl] = cards(['S_Q']);
  const hs = cards(['H_Q', 'D_Q', ['C_Q', 'm_stone']]);
  debuff(hs[0]);
  G.GAME.chips = 0;
  act({ type: 'highlight', ids: [pl.sort_id] }); const r = act({ type: 'play' }); flush();
  const tot = (r.events.find((e) => e.type === 'hand_total') || {});
  ok(near(Number(tot.mult), 1 + 2), 'a debuffed held Queen and a held Stone don\'t count: +2', tot);
  ok(/Octolock: \+2 Mult for each card held in hand that shares a rank with a scored card/.test(plain(c)), 'its text', plain(c));
  rounds(5);
  ok(key(c) === 'j_poke_grapploct', 'Clobbopus -> Grapploct after 5 rounds', key(c));
  h = play(['S_7', 'H_7'], ['D_7', 'C_7', 'S_2']);
  ok(near(h.mult, 2 * 1.25 * 1.25), 'Grapploct: each held 7 X1.25', h.total);
  ok(/each card held in hand that shares a rank with a scored card gives X1.25 Mult/.test(plain(c)), 'its text', plain(c));
  // Mime retriggers the held pass
  add('j_mime');
  h = play(['S_7'], ['D_7']);
  ok(near(h.mult, 1 * 1.25 * 1.25), 'with Mime: the held 7 gives X1.25 twice', h.total);
});

// ------------------------------------------------------------------- Sinistea / Polteageist: Phony or Antique
await sec('antique', () => {
  start('TEA');
  const s = add('j_poke_sinistea');
  ok(['antique', 'phony'].includes(s.ability.poke_tea), 'obtained: rolled', s.ability.poke_tea);
  s.ability.poke_tea = 'phony';
  let h = play(['S_A']);
  ok(near(h.mult, 1.5) && /Currently: Phony/.test(plain(s)), 'Phony Sinistea: X1.5', [h.total, plain(s)]);
  s.ability.poke_tea = 'antique';
  h = play(['S_A']);
  ok(near(h.mult, 3) && /Currently: Antique!/.test(plain(s)), 'Antique Sinistea: X3', [h.total, plain(s)]);
  ok(/X1.5 Mult Antique: X3 instead \(1 in 10, rolled when obtained\)/.test(plain(s)), 'its text', plain(s));
  rounds(5);
  ok(key(s) === 'j_poke_polteageist' && s.ability.poke_tea === 'antique', 'Sinistea -> Polteageist after 5 rounds: still Antique (no re-roll)', [key(s), s.ability.poke_tea]);
  h = play(['S_A']);
  ok(near(h.mult, 4), 'Antique Polteageist: X4', h.total);
  s.ability.poke_tea = 'phony';
  h = play(['S_A']);
  ok(near(h.mult, 2), 'Phony Polteageist: X2', h.total);
  // the rate: 1 in 10, fixed (Oops! All 6s doesn't touch it)
  const rate = (seed, oops) => {
    start(seed);
    if (oops) G.GAME.probabilities.normal = 1000;
    let a = 0;
    for (let i = 0; i < 400; i++) { const j = add('j_poke_sinistea'); if (j.ability.poke_tea === 'antique') a++; j.remove(); }
    flush();
    return a;
  };
  const a1 = rate('TEARATE', false), a2 = rate('TEARATE2', true);
  ok(a1 > 20 && a1 < 65, 'about 1 in 10 (400 obtained)', a1);
  ok(a2 > 20 && a2 < 65, 'with odds forced high (Oops!): still about 1 in 10 (fixed odds)', a2);
  // the evolved card from a fresh Toxel-style path: an unrolled Polteageist added directly rolls too
  start('TEA2');
  const p = add('j_poke_polteageist');
  ok(['antique', 'phony'].includes(p.ability.poke_tea), 'Polteageist obtained directly: rolled', p.ability.poke_tea);
});

// ------------------------------------------------------------------- Hatenna / Hattrem / Hatterene: the Psychic team, Magic Powder
await sec('psychic team', () => {
  start('HAT');
  const h0 = add('j_poke_hatenna');
  let h = play(['S_A']);
  ok(near(h.mult, 1 + 4), 'Hatenna alone: +4 (itself)', h.total);
  const d = add('j_four_fingers'); apply_type_sticker(d, 'Psychic'); add('j_joker');
  h = play(['S_A']);
  ok(near(h.mult, 1 + 8 + 4) && /Currently 2: \+8 Mult/.test(plain(h0)), 'with a Psychic Tera Four Fingers (the Joker isn\'t Psychic): +8 (then the Joker +4)', [h.total, plain(h0)]);
  debuff(d);
  h = play(['S_A']);
  ok(near(h.mult, 1 + 4 + 4), 'a debuffed Psychic Joker doesn\'t count', h.total);
  undebuff(d);
  rounds(4);
  ok(key(h0) === 'j_poke_hattrem', 'Hatenna -> Hattrem after 4 rounds', key(h0));
  h = play(['S_A']);
  ok(near(h.mult, 1 + 12 + 4), 'Hattrem: +6 per Psychic Joker (2)', h.total);
  rounds(5);
  ok(key(h0) === 'j_poke_hatterene', 'Hattrem -> Hatterene after 5 rounds', key(h0));
  for (const j of G.jokers.cards.slice()) if (j !== h0) j.remove();
  flush();
  h = play(['S_A']);
  ok(near(h.mult, 1.25), 'Hatterene alone: X1.25', h.total);
  // Magic Powder: a Joker to its right turns Psychic when a Blind is selected
  const jk = add('j_joker');
  ok(!is_type(jk, 'Psychic'), 'the Joker: not Psychic yet');
  endRound(); advance();
  ok(jk.ability.psychic_sticker === true && is_type(jk, 'Psychic') && get_type(jk) === 'Psychic', 'a Blind selected: the Joker to its right gets a Psychic Tera sticker', jk.ability);
  h = play(['S_A']);
  ok(near(h.mult, 1 * 1.5 + 4), 'now 2 Psychic Jokers: X1.5 (then the Joker\'s +4)', h.total);
  ok(/Magic Powder: when a Blind is selected, the Joker to its right gets a Psychic Tera sticker/.test(plain(h0)), 'its text', plain(h0));
  // a Pokémon of another type converts too (its type becomes Psychic); one already Psychic is left alone; the row's end: nothing
  start('HAT2', {}, { noBlind: true });
  const ht = add('j_poke_hatterene'), sq = add('j_poke_squirtle'), ps = add('j_poke_abra');
  act({ type: 'select_blind' }); flush();
  ok(get_type(sq) === 'Psychic' && sq.ability.psychic_sticker && !ps.ability.psychic_sticker, 'Squirtle (Water) to its right becomes Psychic; Abra beyond is untouched', [get_type(sq), ps.ability.psychic_sticker]);
  G.jokers.cards.splice(G.jokers.cards.indexOf(ht), 1); G.jokers.cards.push(ht);
  endRound(); advance();
  ok(true, 'at the row\'s right end: nothing to convert (no throw)');
  // Blueprint doesn't convert a second Joker
  start('HAT3', {}, { noBlind: true });
  const bp = add('j_blueprint'), ht3 = add('j_poke_hatterene'), j3 = add('j_joker');
  act({ type: 'select_blind' }); flush();
  ok(j3.ability.psychic_sticker && !ht3.ability.psychic_sticker && !bp.ability.psychic_sticker, 'with Blueprint to its left: only the Joker to Hatterene\'s right converts', [j3.ability.psychic_sticker, bp.ability.psychic_sticker]);
  // debuffed Hatterene: no conversion
  start('HAT4', {}, { noBlind: true });
  const ht4 = add('j_poke_hatterene'), j4 = add('j_joker');
  debuff(ht4);
  act({ type: 'select_blind' }); flush();
  ok(!j4.ability.psychic_sticker, 'a debuffed Hatterene converts nothing', j4.ability.psychic_sticker);
});

// ------------------------------------------------------------------- Impidimp / Morgrem / Grimmsnarl: Prankster
await sec('prankster', () => {
  // the base: Red Deck rerolls $5, then $6
  start('PRANK0');
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 5, 'no Prankster: $5', cost());
  ok(reroll() === 5 && cost() === 6, 'then $6', cost());
  // Impidimp: $1 less, stacks, never below $1
  start('PRANK1');
  const i1 = add('j_poke_impidimp');
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 4, 'Impidimp: $4', cost());
  ok(reroll() === 4 && cost() === 5, 'paid $4; next $5 (6 - 1)', cost());
  const i2 = add('j_poke_impidimp');
  ok(cost() === 4, 'a second Impidimp (bought mid-shop): $4 (6 - 2)', cost());
  i2.remove(); flush();
  ok(cost() === 5, 'sold: $5', cost());
  debuff(i1);
  ok(cost() === 6, 'debuffed: $6', cost());
  undebuff(i1);
  ok(cost() === 5 && /shop rerolls cost \$1 less/.test(plain(i1)) && /Energy carries to Grimmsnarl/.test(plain(i1)), 'back: $5; its text', [cost(), plain(i1)]);
  // the floor and a D6 Tag ($0 first)
  start('PRANK2');
  add('j_poke_impidimp'); add('j_poke_impidimp');
  add_tag(new Tag('tag_d_six')); flush();
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 0, 'D6 Tag: the first reroll $0 stays free', cost());
  ok(reroll() === 0 && cost() === 1, 'then $1 (never below $1, not -1)', cost());
  ok(reroll() === 1 && cost() === 1, 'then $1 again (2 - 2, floored)', cost());
  ok(reroll() === 1 && cost() === 1, '... (3 - 2)', cost());
  ok(reroll() === 1 && cost() === 2, '... (4 - 2)', cost());
  // with Chaos the Clown: the free one stays free, then discounted
  start('PRANK3');
  add('j_poke_impidimp'); add('j_chaos');
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 0 && reroll() === 0 && cost() === 4, 'Chaos + Impidimp: free, then $4', cost());
  // Morgrem: the first reroll of each shop free, Chaos-like (the price doesn't step up)
  start('PRANK4');
  const m = add('j_poke_morgrem');
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 0 && /free reroll ready/.test(plain(m)), 'Morgrem: the shop\'s first reroll $0', [cost(), plain(m)]);
  ok(reroll() === 0 && cost() === 5, 'free; the next $5 (not $6)', cost());
  ok(/used this shop/.test(plain(m)), 'tooltip: used this shop', plain(m));
  ok(reroll() === 5 && cost() === 6, '$5 then $6', cost());
  act({ type: 'next_round' }); act({ type: 'select_blind' }); flush(); clearHand();
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 0 && reroll() === 0 && cost() === 5, 'the next shop: free again', cost());
  ok(/Prankster: your first reroll in each shop is free/.test(plain(m)), 'its text', plain(m));
  // two Morgrems: still one free reroll
  start('PRANK5');
  add('j_poke_morgrem'); add('j_poke_morgrem');
  toShop();
  G.GAME.dollars = 100;
  ok(reroll() === 0 && cost() === 5 && reroll() === 5, 'two Morgrems: one free reroll', cost());
  // with Chaos the Clown: doesn't stack (one free reroll, Chaos's)
  start('PRANK6');
  add('j_poke_morgrem'); add('j_chaos');
  toShop();
  G.GAME.dollars = 100;
  ok(cost() === 0 && reroll() === 0 && cost() === 5 && reroll() === 5, 'Morgrem + Chaos: one free reroll, then $5 (no second free one)', cost());
  // with a D6 Tag: $0, $1, $2 (the D6's $0 is the shop's first reroll)
  start('PRANK7');
  add('j_poke_morgrem');
  add_tag(new Tag('tag_d_six')); flush();
  toShop();
  G.GAME.dollars = 100;
  ok(reroll() === 0 && reroll() === 1 && reroll() === 2, 'Morgrem + D6 Tag: $0, $1, $2 (as the D6 alone)', cost());
  // bought mid-shop: free only if nothing has been rerolled yet
  start('PRANK8');
  toShop();
  G.GAME.dollars = 100;
  reroll();
  const m8 = add('j_poke_morgrem');
  ok(cost() === 6, 'bought after a reroll: no free one this shop ($6)', cost());
  m8.remove(); flush();
  start('PRANK9');
  toShop();
  G.GAME.dollars = 100;
  const m9 = add('j_poke_morgrem');
  ok(cost() === 0, 'bought before any reroll: the first is free', cost());
  m9.remove(); flush();
  ok(cost() === 5, 'sold before using it: $5', cost());
  // Morgrem + Impidimp: free first, then $1 less
  start('PRANK10');
  add('j_poke_morgrem'); add('j_poke_impidimp');
  toShop();
  G.GAME.dollars = 100;
  ok(reroll() === 0 && cost() === 4 && reroll() === 4, 'Morgrem + Impidimp: free, then $4', cost());
  // evolution: Impidimp (4 rounds) -> Morgrem (5) -> Grimmsnarl
  start('PRANKEVO');
  const g = add('j_poke_impidimp');
  rounds(4);
  ok(key(g) === 'j_poke_morgrem', 'Impidimp -> Morgrem after 4 rounds', key(g));
  rounds(5);
  ok(key(g) === 'j_poke_grimmsnarl', 'Morgrem -> Grimmsnarl after 5 rounds', key(g));
  toShop();
  G.GAME.dollars = 100;
  ok(reroll() === 0 && near(ex(g).prank_Xmult, 1.1), 'Grimmsnarl: the free first reroll; X0.1 gained', ex(g).prank_Xmult);
  ok(reroll() === 5 && reroll() === 6 && near(ex(g).prank_Xmult, 1.3), 'every reroll gains X0.1 (X1.3)', ex(g).prank_Xmult);
  ok(/Permanently gains X0.1 Mult for every shop reroll/.test(plain(g)) && /Currently X1.3 Mult/.test(plain(g)), 'its text', plain(g));
  act({ type: 'next_round' }); act({ type: 'select_blind' }); flush(); clearHand();
  let h = play(['S_A']);
  ok(near(h.mult, 1.3), 'it scores X1.3', h.total);
  // Blueprint copies the X, never the gain
  add('j_blueprint'); G.jokers.cards.reverse();
  h = play(['S_A']);
  ok(near(h.mult, 1.3 * 1.3), 'Blueprint copies the X1.3', h.total);
  toShop();
  G.GAME.dollars = 100;
  reroll();
  ok(near(ex(g).prank_Xmult, 1.4), 'with Blueprint: X0.1 a reroll (not 0.2)', ex(g).prank_Xmult);
});

// ------------------------------------------------------------------- Energy: the main number at the standard rate
await sec('energy', () => {
  const r4 = (x) => Math.round(x * 10000) / 10000;
  const steps = (n, field, type, want) => {
    start('EN' + n + field);
    const j = add('j_poke_' + n);
    const got = [];
    for (let i = 0; i < 3; i++) { increment_energy(j, type); got.push(r4(ex(j)[field])); }
    ok(got.every((v, i) => near(v, want[i])), `${n} + ${type} Energy: ${field} ${want.join(' / ')}`, got);
    return j;
  };
  const fixed = (j, f, v) => ok(ex(j)[f] === v, `${key(j)}: ${f} stays ${v}`, ex(j)[f]);
  steps('toxel', 'mult', 'Lightning', [5.6, 7.2, 8.8]);
  steps('toxtricity', 'Xmult', 'Lightning', [2.4, 2.8, 3.2]);
  const tx = steps('toxtricity', 'chips', 'Lightning', [52, 64, 76]);
  tx.ability.poke_tox_form = 'lowkey';
  let h = play(['S_A']);
  ok(h.chips === 16 + 4 * 76, 'energized Low Key: 1 card +304 Chips', h.total);
  let j = steps('sizzlipede', 'mult_mod', 'Fire', [2.4, 2.8, 3.2]);
  discard(['S_3']);
  ok(near(ex(j).burn_mult, 3.2), 'energized Sizzlipede banks +3.2 a burn', ex(j).burn_mult);
  j = steps('centiskorch', 'Xmult_mod', 'Fire', [0.12, 0.14, 0.16]);
  ok(ex(j).burn_Xmult === 1, 'the bank never moves with Energy (not retroactive)', ex(j).burn_Xmult);
  steps('clobbopus', 'mult', 'Fighting', [2.8, 3.6, 4.4]);
  steps('grapploct', 'Xmult_multi', 'Fighting', [1.3125, 1.375, 1.4375]);
  j = steps('sinistea', 'Xmult', 'Psychic', [1.8, 2.1, 2.4]); fixed(j, 'num', 1); fixed(j, 'dem', 10);
  j.ability.poke_tea = 'antique';
  h = play(['S_A']);
  ok(near(h.mult, 4.8), 'energized Antique Sinistea: X4.8 (twice X2.4)', h.total);
  steps('polteageist', 'Xmult', 'Psychic', [2.4, 2.8, 3.2]);
  steps('hatenna', 'mult', 'Psychic', [5.6, 7.2, 8.8]);
  steps('hattrem', 'mult', 'Psychic', [8.4, 10.8, 13.2]);
  steps('hatterene', 'Xmult_mod', 'Psychic', [0.3, 0.35, 0.4]);
  j = steps('impidimp', 'Xmult_mod', 'Fairy', [0.12, 0.14, 0.16]); fixed(j, 'reroll_discount', 1);
  steps('morgrem', 'Xmult_mod', 'Fairy', [0.12, 0.14, 0.16]);
  j = steps('grimmsnarl', 'Xmult_mod', 'Fairy', [0.12, 0.14, 0.16]); fixed(j, 'prank_Xmult', 1);
  // Energy carries through evolution (re-applied to the new base)
  start('ENEVO');
  const im = add('j_poke_impidimp');
  increment_energy(im, 'Fairy'); increment_energy(im, 'Fairy');
  rounds(4); rounds(5);
  ok(key(im) === 'j_poke_grimmsnarl' && ex(im).energy_count === 2 && near(ex(im).Xmult_mod, 0.14), 'Impidimp (2 Energy) -> Grimmsnarl: X0.14 a reroll', [key(im), ex(im).Xmult_mod]);
  start('ENEVO2');
  const sz = add('j_poke_sizzlipede');
  increment_energy(sz, 'Fire');
  discard(['S_3']);
  rounds(5);
  ok(key(sz) === 'j_poke_centiskorch' && near(ex(sz).burn_mult, 2.4) && near(ex(sz).Xmult_mod, 0.12), 'Sizzlipede (1 Energy, +2.4 banked) -> Centiskorch: +2.4 kept, X0.12 a burn', [key(sz), ex(sz).burn_mult, ex(sz).Xmult_mod]);
  start('ENEVO3');
  const tl = add('j_poke_toxel');
  increment_energy(tl, 'Lightning'); increment_energy(tl, 'Lightning'); increment_energy(tl, 'Lightning');
  rounds(3);
  ok(key(tl) === 'j_poke_toxtricity' && near(ex(tl).Xmult, 3.2) && near(ex(tl).chips, 76), 'Toxel (3 Energy) -> Toxtricity: X3.2 / +76 a card', [key(tl), ex(tl).Xmult, ex(tl).chips]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G8B2RES', customDeck: { name: 'Gen 8b', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 12], ['H_9', 0, 0, 0, 10], ['D_5', 0, 0, 0, 10], ['C_7', 0, 0, 0, 20]],
    jokers: [{ key: 'j_poke_toxtricity' }, { key: 'j_poke_sizzlipede' }, { key: 'j_poke_sinistea' }, { key: 'j_poke_hatterene' }, { key: 'j_joker' }, { key: 'j_poke_grimmsnarl' }, { key: 'j_poke_grapploct' }] } });
  s.act({ type: 'select_blind' }); flush();
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush();
  for (let i = 0; i < 4 && G.STATE === STATES.SELECTING_HAND; i++) {
    s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 2).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
  }
  if (G.STATE === STATES.ROUND_EVAL) { s.act({ type: 'cash_out' }); flush(); }
  if (G.STATE === STATES.SHOP) { G.GAME.dollars = Math.max(G.GAME.dollars, 0); s.act({ type: 'reroll_shop' }); flush(); s.act({ type: 'reroll_shop' }); flush(); }
  const snap = () => ({
    state: G.STATE,
    jokers: G.jokers.cards.map((j) => [key(j), j.ability.poke_tox_form || null, j.ability.poke_tea || null, !!j.ability.psychic_sticker, ex(j) && typeof ex(j) === 'object' ? [ex(j).burn_mult, ex(j).prank_Xmult] : null]),
    deck: G.playing_cards.length, cost: G.GAME.current_round.reroll_cost, rerolls: G.GAME.current_round.poke_shop_rerolls,
    chips: String(G.GAME.chips), dollars: G.GAME.dollars,
  });
  const want = snap();
  const jk = want.jokers;
  ok(want.state === STATES.SHOP && jk[0][1] && jk[2][2] && jk[4][3] && jk[1][4][0] === 2 && jk[5][4][1] > 1.1 && want.deck === 51 && want.rerolls === 2,
    'the run: Toxtricity\'s form, Sinistea\'s roll, the Joker made Psychic, a card burned (+2), Grimmsnarl grown, 2 rerolls in the shop', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the forms, the Antique roll, the Tera, the burn, the rerolls and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types (Low Key too)
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NAMES) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 14 is the type its 3.9.1 card shows', bad);
    const g = ANIM.GEN8_FORM_SPRITES.j_poke_toxtricity.lowkey;
    const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen08', pos: [g.x, g.y] });
    ok(r && r.ptype === 'Lightning', 'the Low Key cell shows Lightning too', r);
  });
} else console.log('(Pokermon art not on disk: the art type checks are skipped; set MICATRO_MAIN)');

done();
