// Gen 9, batch 1 (the owner's "Yes", 2026-11-03; jokers/pokejokers_designs.js "Gen 9, batch 1"; PORTING.md "Gen 9, batch 1"): 15 jokers,
// #919-950, on the guide's price slots (3-stage U $6 / S $8 / S $10, 2-stage C $5 / S $8, single-stage R $7), in Pokédex order:
//   Nymble 919 -> Lokix (Grass)                  Lunge: +15 Mult / X2.5 if the played hand has 3 or fewer cards. 4 rounds.
//   Pawmi 921 -> Pawmo -> Pawmot (Lightning)      +2 Mult per Lightning Joker; scored face cards $1; X1.5 and Revival Blessing: once per
//                                                Ante, another Joker DESTROYED (not sold) comes back in its place, state and all.
//   Squawkabilly 931 (Colorless, R $7)           Parrot: each Planet used, 1 in 2 to level that hand once more; plumage rolled when obtained.
//   Tadbulb 938 -> Bellibolt (Lightning)         +3 Mult per discard used this round; Electromorphosis: +X0.25 charge per discard, fired by
//                                                the next scoring hand, lost at round end.
//   Wattrel 940 -> Kilowattrel (Lightning)       Wind Power: $1 / $2 per discard left at end of round.
//   Maschiff 942 -> Mabosstiff (Dark)            +12 Mult / X1.5 during Boss Blinds; Guard Dog: your Jokers can't be debuffed.
//   Toedscool 948 -> Toedscruel (Grass)          Mycelium: +4 Chips per card above 52 / X1 + X0.02 per card above 40 in the full deck.
//   Klawf 950 (Earth, R $7)                      Anger Shell: X1 + X1 for each hand already played this round.
// Every ability is FIRED through real hands / rounds / shops with exact numbers.
//   node micatro/tests/mods/pokermon_gen9_batch1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import * as RUN from '../../js/engine/run.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { is_type, apply_type_sticker } from '../../mods/pokermon/systems/types.js';
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
  nymble: ['nymble', 'lokix'], pawmi: ['pawmi', 'pawmo', 'pawmot'], squawkabilly: ['squawkabilly'], tadbulb: ['tadbulb', 'bellibolt'],
  wattrel: ['wattrel', 'kilowattrel'], maschiff: ['maschiff', 'mabosstiff'], toedscool: ['toedscool', 'toedscruel'], klawf: ['klawf'],
};
const NAMES = Object.values(LINES).flat();
function debuff(c) { c.ability.debuff_sources = { test: true }; c.set_debuff(); flush(); return c; }
function undebuff(c) { c.ability.debuff_sources = {}; c.set_debuff(); flush(); return c; }
/** Put cards in hand: a list of keys (the first is the leftmost). */
function cards(list) { return list.map((k) => hand([k])[0]); }
/** Play `list`, keeping `held` in hand; the round never ends by accident. */
function play(list, held = []) {
  clearHand();
  const cs = cards(list);
  cards(held);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (G.GAME.current_round.hands_left < 2) G.GAME.current_round.hands_left = 2;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  const total = events.find((e) => e.type === 'hand_total') || {};
  return { cards: cs, events, total, mult: Number(total.mult), chips: Number(total.chips) };
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
/** Win the round and stop at the cash-out: -> the cash-out rows. */
function toEval() { endRound(); return (G.GAME.round_eval && G.GAME.round_eval.rows) || []; }
const rowsOf = (rows, n) => rows.filter((r) => r.center === 'j_poke_' + n);
/** A fresh run with these jokers, the first Blind NOT selected yet (so setting_blind sees them). */
function fresh(seed, jokers) {
  start(seed, {}, { noBlind: true });
  return jokers.map((k) => (Array.isArray(k) ? add(k[0].startsWith('j_') ? k[0] : 'j_poke_' + k[0], k[1]) : add(k.startsWith('j_') ? k : 'j_poke_' + k)));
}
function selectBlind() { act({ type: 'select_blind' }); flush(); clearHand(); }
function use(k) { const c = add(k); G.jokers.highlighted.length = 0; const r = act({ type: 'use', id: c.sort_id, targets: [] }); flush(); return r; }
function sell(j) { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; }
const face = (j, shiny) => {
  const v = {}; view_card(j, v);
  return POKE_UI.face({ center: key(j), facing: 'front', poke: v.poke, atlas: j.config.center.atlas, pos: j.config.center.pos, ...(shiny ? { edition: 'poke_shiny' } : {}) }, { area: 'jokers' });
};
const drawn = (j) => { const f = face(j); return f ? [f.atlas, f.pos] : [j.config.center.atlas, j.config.center.pos]; };
const GEN9 = 'poke_AtlasJokersBasicGen09391';
const N = 'poke_AtlasJokersBasicNatdex391';

// ------------------------------------------------------------------- pin, static data, order, families, Energy fields
await sec('pin', async () => {
  ok(MODS.pokermon.contentRev >= 76 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 76+ (Gen 9 batch 1)', PINS.modPin('pokermon'));
  for (const n of NAMES) {
    ok(C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const re = new RegExp('\\b(' + NAMES.join('|') + ')\\b', 'i');
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (f.name !== 'assets') walk(p); } else if (/\.(js|json|lua)$/.test(f.name) && re.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  walk(path.join(ROOT, 'mods', 'pokermonplus'));
  walk(path.join(ROOT, 'mods', 'nacho'));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has any of the 15', hits);
});
await sec('static', () => {
  start('G9B1S');
  const S = 'poke_safari';
  // [rarity, cost, stage, type, rounds|undefined, atlas, x, y]
  const WANT = {
    nymble: [1, 5, 'Basic', 'Grass', 4, N, 6, 61], lokix: [S, 8, 'One', 'Grass', undefined, N, 8, 61],
    pawmi: [2, 6, 'Basic', 'Lightning', 4, N, 10, 61], pawmo: [S, 8, 'One', 'Lightning', 5, N, 12, 61], pawmot: [S, 10, 'Two', 'Lightning', undefined, N, 14, 61],
    squawkabilly: [3, 7, 'Basic', 'Colorless', undefined, GEN9, 8, 0],
    tadbulb: [1, 5, 'Basic', 'Lightning', 5, N, 14, 62], bellibolt: [S, 8, 'One', 'Lightning', undefined, N, 16, 62],
    wattrel: [1, 5, 'Basic', 'Lightning', 4, N, 18, 62], kilowattrel: [S, 8, 'One', 'Lightning', undefined, N, 20, 62],
    maschiff: [1, 5, 'Basic', 'Dark', 5, N, 22, 62], mabosstiff: [S, 8, 'One', 'Dark', undefined, N, 24, 62],
    toedscool: [1, 5, 'Basic', 'Grass', 5, N, 4, 63], toedscruel: [S, 8, 'One', 'Grass', undefined, N, 6, 63],
    klawf: [3, 7, 'Basic', 'Earth', undefined, N, 8, 63],
  };
  ok(Object.keys(WANT).length === 15 && NAMES.length === 15, '15 jokers');
  for (const [n, [rarity, cost, stage, type, rnds, atlas, x, y]] of Object.entries(WANT)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === type && c.config.extra.ptype === type && c.gen === 9,
      `${n}: ${rarity} $${cost}, ${stage}, ${type}, Gen 9`, [c.rarity, c.cost, c.stage, c.ptype, c.gen]);
    ok(c.config.extra.rounds === rnds, `${n}: ${rnds ? 'evolves after ' + rnds + ' rounds' : 'no round timer'}`, c.config.extra.rounds);
    ok(c.atlas === atlas && c.pos.x === x && c.pos.y === y && !c.soul_pos, `${n}: upstream 3.9.1 cell ${atlas} {${x},${y}} (nothing to deploy)`, [c.atlas, c.pos]);
  }
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const run = (before, list, after) => { const i = keys.indexOf('j_poke_' + before); return [before, ...list, after].every((n, k) => keys[i + k] === 'j_poke_' + n); };
  ok(run('spidops', ['nymble', 'lokix', 'pawmi', 'pawmo', 'pawmot'], 'tandemaus'), 'Pokédex order: Spidops (918), Nymble ... Pawmot (919-923), Tandemaus (924)');
  ok(run('arboliva', ['squawkabilly'], 'charcadet'), 'Pokédex order: Arboliva (930), Squawkabilly (931), Charcadet (935)');
  ok(run('ceruledge', ['tadbulb', 'bellibolt', 'wattrel', 'kilowattrel', 'maschiff', 'mabosstiff'], 'bramblin'), 'Pokédex order: Ceruledge (937), Tadbulb ... Mabosstiff (938-943), Bramblin (946)');
  ok(run('brambleghast', ['toedscool', 'toedscruel', 'klawf'], 'rellor'), 'Pokédex order: Brambleghast (947), Toedscool ... Klawf (948-950), Rellor (953)');
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  for (const line of Object.values(LINES)) if (line.length > 1) ok(fam(line[0]) === line.join(), 'one family: ' + line.join(' -> '), fam(line[0]));
  const inert = ['squawkabilly', 'wattrel', 'kilowattrel'];
  ok(inert.every((n) => C(n).poke_no_energy_field) && NAMES.filter((n) => !inert.includes(n)).every((n) => !C(n).poke_no_energy_field),
    'Energy-inert: Squawkabilly (odds and a level), Wattrel / Kilowattrel ($); the other 12 take Energy');
  ok(['face_money', 'wind_money', 'num', 'dem', 'levels', 'rounds', 'charge_Xmult', 'blessing_ante'].every((f) => !(f in energy_values))
    && ['mult', 'chips', 'Xmult', 'Xmult_mod'].every((f) => f in energy_values),
    'Energy fields: the main numbers; fixed: the $, the odds, the level, the charge bank, the blessing');
});

// ------------------------------------------------------------------- Nymble / Lokix: Lunge
await sec('lunge', () => {
  start('LUNGE');
  const n = add('j_poke_nymble');
  let h = play(['S_A', 'H_A', 'D_7']);
  ok(near(h.mult, 2 + 15), 'Nymble: a 3-card hand (a Pair with a kicker) -> +15', h.total);
  h = play(['S_K']);
  ok(near(h.mult, 1 + 15), '1 card -> +15', h.total);
  h = play(['S_A', 'H_A', 'D_7', 'C_4']);
  ok(near(h.mult, 2), '4 cards -> nothing', h.total);
  ok(/Lunge: \+15 Mult if the played hand has 3 or fewer cards/.test(plain(n)) && /Evolves after 4 rounds/.test(plain(n)), 'its text', plain(n));
  rounds(3);
  ok(key(n) === 'j_poke_nymble' && ex(n).rounds === 1, '3 rounds: 1 to go', [key(n), ex(n).rounds]);
  rounds(1);
  ok(key(n) === 'j_poke_lokix', 'Nymble -> Lokix after 4 rounds', key(n));
  h = play(['S_A', 'H_A', 'D_A']);
  ok(near(h.mult, 3 * 2.5), 'Lokix: Three of a Kind (3 cards) -> X2.5', h.total);
  h = play(['S_9', 'H_9', 'D_9', 'C_9']);
  ok(near(h.mult, 7), 'Four of a Kind (4 cards) -> nothing', h.total);
  ok(/Lunge: X2.5 Mult if the played hand has 3 or fewer cards/.test(plain(n)), 'its text', plain(n));
  add('j_blueprint'); G.jokers.cards.reverse();
  h = play(['S_K', 'H_K']);
  ok(near(h.mult, 2 * 2.5 * 2.5), 'Blueprint copies the X2.5', h.total);
});

// ------------------------------------------------------------------- Pawmi / Pawmo: the Lightning team, face money
await sec('pawmi pawmo', () => {
  start('PAWMI');
  const p = add('j_poke_pawmi');
  let h = play(['S_A']);
  ok(near(h.mult, 1 + 2) && /Currently 1: \+2 Mult/.test(plain(p)), 'Pawmi alone: +2 (itself)', [h.total, plain(p)]);
  const t = add('j_poke_tadbulb'); const d = add('j_joker'); apply_type_sticker(d, 'Lightning'); add('j_four_fingers');
  h = play(['S_A']);
  ok(near(h.mult, 1 + 6 + 4), 'with Tadbulb and a Lightning Tera Joker (Four Fingers isn\'t Lightning): +6 (then the Joker\'s +4)', h.total);
  debuff(t);
  h = play(['S_A']);
  ok(near(h.mult, 1 + 4 + 4), 'a debuffed Lightning Joker doesn\'t count: +4', h.total);
  undebuff(t);
  apply_type_sticker(p, 'Fire');
  ok(/Currently 2: \+4 Mult/.test(plain(p)), 'a Fire Tera Pawmi isn\'t Lightning itself: 2 (the others)', plain(p));
  for (const j of G.jokers.cards.slice()) if (j !== p) j.remove();
  flush();
  start('PAWMO');
  const q = add('j_poke_pawmi');
  rounds(4);
  ok(key(q) === 'j_poke_pawmo', 'Pawmi -> Pawmo after 4 rounds', key(q));
  let d0 = G.GAME.dollars;
  h = play(['S_K', 'H_K', 'D_Q', 'C_2']);
  ok(G.GAME.dollars - d0 === 2 && near(h.mult, 2), 'Pawmo: a Pair of Kings (2 scored faces; the Queen and the 2 don\'t score) -> $2', [G.GAME.dollars - d0, h.total]);
  add('j_hanging_chad');
  d0 = G.GAME.dollars;
  play(['S_J']);
  ok(G.GAME.dollars - d0 === 3, 'a retriggered Jack (Hanging Chad: 2 more times) pays three times', G.GAME.dollars - d0);
  ok(/Each scored face card earns \$1/.test(plain(q)) && /Energy carries to Pawmot/.test(plain(q)), 'its text', plain(q));
  rounds(5);
  ok(key(q) === 'j_poke_pawmot', 'Pawmo -> Pawmot after 5 rounds', key(q));
  h = play(['S_A']);
  ok(near(h.mult, 1.5), 'Pawmot: X1.5', h.total);
});

// ------------------------------------------------------------------- Pawmot: Revival Blessing
await sec('revival', () => {
  // Ceremonial Dagger destroys the Joker to its right when a Blind is selected: a Foil, Rental, Perishable Sizzlipede with a bank
  const js = fresh('REVIVE', ['j_ceremonial', ['sizzlipede', 'foil'], 'j_joker', 'pawmot', 'j_egg']);
  const [dag, sz, , pm] = js;
  sz.set_rental(true); sz.ability.perishable = true; sz.ability.perish_tally = 3;
  ex(sz).burn_mult = 6;
  increment_energy(sz, 'Fire');
  const want = JSON.stringify({ ...sz.ability, extra: { ...ex(sz) } });
  ok(G.jokers.cards.length === 5 && G.jokers.config.card_limit === 5, 'a full row: 5 / 5');
  selectBlind();
  const back = G.jokers.cards[1];
  ok(!G.jokers.cards.includes(sz) && sz.removed && back !== sz && key(back) === 'j_poke_sizzlipede', 'the Sizzlipede was destroyed and a Sizzlipede is back', G.jokers.cards.map(key));
  ok(G.jokers.cards.length === 5 && G.jokers.cards.map(key).join() === ['j_ceremonial', 'j_poke_sizzlipede', 'j_joker', 'j_poke_pawmot', 'j_egg'].join(), 'in the same place (2nd), using the freed slot: still 5 / 5', G.jokers.cards.map(key));
  ok(back.edition && back.edition.foil && back.ability.rental && back.ability.perishable && back.ability.perish_tally === 3, 'its edition (Foil) and stickers (Rental, Perishable 3) come back', [back.edition, back.ability.rental, back.ability.perish_tally]);
  ok(ex(back).burn_mult === 6 && ex(back).energy_count === 1 && near(ex(back).mult_mod, 2.4) && JSON.stringify({ ...back.ability, extra: { ...ex(back) } }) === want, 'its ability exactly (+6 Mult banked, 1 Energy)', [ex(back).burn_mult, ex(back).energy_count]);
  ok(!back.debuff && back.added_to_deck, 'undebuffed and in play');
  ok(dag.ability.mult > 0, 'the Dagger still took its Mult (the destroyed card\'s sell value)', dag.ability.mult);
  ok(/Revival Blessing: used this Ante/.test(plain(pm)), 'tooltip: used this Ante', plain(pm));
  let h = play(['S_A']);
  ok(near(h.mult, (1 + dag.ability.mult + 6 + 4) * 1.5), 'the revived Sizzlipede scores its +6 (Dagger, Sizzlipede, Joker, then Pawmot X1.5)', [h.total, dag.ability.mult]);
  // the same Ante, the Big Blind: the Dagger takes it again, and this time it stays gone
  endRound(); advance();
  ok(!G.jokers.cards.some((j) => key(j) === 'j_poke_sizzlipede') && G.jokers.cards.length === 4, 'once per Ante: the second one this Ante stays destroyed', G.jokers.cards.map(key));
  // the next Ante: ready again (the Dagger sits out the Boss Blind, then takes the Joker in Ante 2)
  dag.remove(); flush();
  endRound(); advance();
  ok(G.GAME.round_resets.ante === 1 && G.GAME.blind.boss && G.jokers.cards.length === 3, 'the Boss Blind of Ante 1 (no Dagger)', G.jokers.cards.map(key));
  endRound();
  act({ type: 'cash_out' }); act({ type: 'next_round' }); flush();
  ok(G.GAME.round_resets.ante === 2 && /Revival Blessing: ready/.test(plain(pm)), 'Ante 2: ready again', [G.GAME.round_resets.ante, plain(pm)]);
  const dag2 = add('j_ceremonial'); G.jokers.cards.splice(G.jokers.cards.indexOf(dag2), 1); G.jokers.cards.unshift(dag2);
  const jk = G.jokers.cards[1];
  ok(key(jk) === 'j_joker', 'a Dagger again, the Joker right of it', G.jokers.cards.map(key));
  act({ type: 'select_blind' }); flush(); clearHand();
  ok(jk.removed && key(G.jokers.cards[1]) === 'j_joker' && G.jokers.cards[1] !== jk && /used this Ante/.test(plain(pm)), 'Ante 2: the Joker is destroyed and comes back', G.jokers.cards.map(key));

  // selling is never destroying: nothing comes back, the blessing stays ready
  const s2 = fresh('REVSELL', ['j_joker', 'pawmot']);
  selectBlind();
  sell(s2[0]);
  ok(!G.jokers.cards.some((j) => key(j) === 'j_joker') && /Revival Blessing: ready/.test(plain(s2[1])), 'sold: gone, the blessing still ready', [G.jokers.cards.map(key), plain(s2[1])]);
  // Pawmot itself destroyed: nothing; a debuffed Pawmot: nothing; a Negative comes back with its own slot
  const s3 = fresh('REVSELF', ['j_ceremonial', 'pawmot', 'pawmot']);
  selectBlind();
  ok(G.jokers.cards.length === 3 && key(G.jokers.cards[1]) === 'j_poke_pawmot' && /used this Ante/.test(plain(s3[2])), 'two Pawmots: the destroyed one is revived by the other', [G.jokers.cards.map(key), plain(s3[2])]);
  const s4 = fresh('REVSOLO', ['j_ceremonial', 'pawmot']);
  selectBlind();
  ok(G.jokers.cards.length === 1 && key(G.jokers.cards[0]) === 'j_ceremonial', 'a lone Pawmot destroyed: it never revives itself', G.jokers.cards.map(key));
  const s5 = fresh('REVDEB', ['j_ceremonial', 'j_joker', 'pawmot']);
  debuff(s5[2]);
  selectBlind();
  ok(!G.jokers.cards.some((j) => key(j) === 'j_joker') && /ready/.test(plain(s5[2])), 'a debuffed Pawmot revives nothing', G.jokers.cards.map(key));
  const s6 = fresh('REVNEG', ['j_ceremonial', ['j_joker', 'negative'], 'pawmot', 'j_egg', 'j_egg', 'j_egg']);
  const lim = G.jokers.config.card_limit;
  ok(lim === 6 && G.jokers.cards.length === 6, 'a Negative in a full row: 6 / 6');
  selectBlind();
  ok(G.jokers.cards.length === 6 && G.jokers.config.card_limit === 6 && key(G.jokers.cards[1]) === 'j_joker' && G.jokers.cards[1].edition && G.jokers.cards[1].edition.negative && G.jokers.cards[1] !== s6[1],
    'the Negative comes back Negative, with its own slot: still 6 / 6', [G.jokers.cards.length, G.jokers.config.card_limit]);
  // no room (a creation pending in the freed slot): nothing comes back, the blessing waits
  const s7 = fresh('REVFULL', ['j_joker', 'pawmot']);
  selectBlind();
  G.GAME.joker_buffer = 4;
  s7[0].start_dissolve(); flush();
  G.GAME.joker_buffer = 0;
  ok(G.jokers.cards.length === 1 && /ready/.test(plain(s7[1])), 'no room for it (pending creations fill the row): nothing back, still ready', G.jokers.cards.map(key));
  // a debuffed Joker destroyed comes back undebuffed
  const s8 = fresh('REVUND', ['j_ceremonial', 'j_joker', 'pawmot']);
  s8[1].debuff = true; s8[1].remove_from_deck(true);
  selectBlind();
  ok(key(G.jokers.cards[1]) === 'j_joker' && !G.jokers.cards[1].debuff && G.jokers.cards[1].added_to_deck, 'a debuffed Joker comes back undebuffed, in play', G.jokers.cards.map((j) => [key(j), j.debuff]));
  // Hex (destroys all but one): one comes back; Madness: comes back
  const s9 = fresh('REVMAD', ['j_madness', 'j_joker', 'pawmot']);
  s9[2].set_eternal(true);
  selectBlind();
  ok(G.jokers.cards.length === 3 && s9[1].removed && G.jokers.cards.filter((j) => key(j) === 'j_joker').length === 1 && /used this Ante/.test(plain(s9[2])) && near(s9[0].ability.x_mult, 1.5),
    'Madness (an Eternal Pawmot: the Joker is its only target) destroys the Joker: it comes back; Madness still gains X0.5', [G.jokers.cards.map(key), s9[0].ability.x_mult]);
  endRound(); advance();
  ok(G.jokers.cards.length === 2 && near(s9[0].ability.x_mult, 2), 'the Big Blind: destroyed again, gone for this Ante', [G.jokers.cards.map(key), s9[0].ability.x_mult]);
  ok(/Revival Blessing: once per Ante, when another of your Jokers is destroyed, it comes back in the same place/.test(plain(s9[2])) && /Not when sold/.test(plain(s9[2])), 'its text', plain(s9[2]));
});

// ------------------------------------------------------------------- Squawkabilly: Parrot, plumage
await sec('parrot', () => {
  start('PARROT');
  const s = add('j_poke_squawkabilly');
  const p0 = G.GAME.hands.Pair.level;
  let extra = 0;
  for (let i = 0; i < 40; i++) { const l = G.GAME.hands.Pair.level; use('c_mercury'); extra += G.GAME.hands.Pair.level - l - 1; }
  ok(G.GAME.hands.Pair.level === p0 + 40 + extra && extra > 10 && extra < 30, '40 Mercurys: each +1, and about half once more (1 in 2)', extra);
  const f0 = G.GAME.hands.Flush.level, s0 = G.GAME.hands['Straight Flush'].level;
  use('c_jupiter');
  ok(G.GAME.hands['Straight Flush'].level === s0 && G.GAME.hands.Flush.level >= f0 + 1 && G.GAME.hands.Flush.level <= f0 + 2, 'it levels the Planet\'s own hand only', [f0, G.GAME.hands.Flush.level]);
  // Oops! All 6s doubles the odds: 2 in 2, always
  add('j_oops');
  const t0 = G.GAME.hands['Three of a Kind'].level;
  for (let i = 0; i < 5; i++) use('c_venus');
  ok(G.GAME.hands['Three of a Kind'].level === t0 + 10, 'Oops! All 6s: 2 in 2, every Venus levels twice', G.GAME.hands['Three of a Kind'].level - t0);
  ok(/Parrot: each Planet card used has a 2 in 2 chance to level up that hand once more/.test(plain(s)), 'its text shows the odds (2 in 2 with Oops!)', plain(s));
  // a Tarot doesn't count; Blueprint copies nothing
  add('j_blueprint');
  const hc = G.GAME.hands['High Card'].level;
  use('c_pluto');
  ok(G.GAME.hands['High Card'].level === hc + 2, 'with Blueprint: still +2 (not +3)', G.GAME.hands['High Card'].level - hc);
  // seeded: the same run seed, the same rolls
  const seq = (seed) => { start(seed); add('j_poke_squawkabilly'); const out = []; for (let i = 0; i < 12; i++) { const l = G.GAME.hands.Pair.level; use('c_mercury'); out.push(G.GAME.hands.Pair.level - l); } return out.join(''); };
  ok(seq('PARSEED') === seq('PARSEED'), 'seeded: the same run rolls the same', seq('PARSEED'));
  // a Colorless Joker: Starly's flock counts it
  start('PARFLOCK');
  const st = add('j_poke_starly'); add('j_poke_squawkabilly');
  ok(is_type(G.jokers.cards[1], 'Colorless') && /Currently 2: \+4 Mult/.test(plain(st)), 'Starly\'s flock counts it (2 Colorless Jokers)', plain(st));
});
await sec('plumage', () => {
  start('PLUME');
  const s = add('j_poke_squawkabilly');
  ok(ANIM.GEN9_FORM_SPRITES && ['green', 'blue', 'yellow', 'white'].includes(s.ability.poke_plumage), 'obtained: its plumage is rolled', s.ability.poke_plumage);
  const cells = { green: [8, 0], blue: [0, 1], yellow: [2, 1], white: [4, 1] };
  for (const [pl, [x, y]] of Object.entries(cells)) {
    s.ability.poke_plumage = pl;
    const d = drawn(s);
    ok(d[0] === GEN9 && d[1].x === x && d[1].y === y, `${pl}: its card (Gen 9 {${x},${y}})`, d);
    ok(plain(s).includes('(' + pl[0].toUpperCase() + pl.slice(1) + ' Plumage)'), `${pl}: the tooltip names it`, plain(s));
  }
  s.ability.poke_plumage = 'white';
  const sh = face(s, true);
  ok(sh && sh.atlas === 'poke_AtlasJokersBasicGen09Shiny391' && sh.pos.x === 4 && sh.pos.y === 1, 'a Shiny White draws the Shiny sheet\'s twin', sh && [sh.atlas, sh.pos]);
  s.ability.poke_plumage = undefined;
  ok(/Plumage: rolled when obtained/.test(plain(s)), 'unrolled (shop / collection): "rolled when obtained"', plain(s));
  const roll = (seed) => { start(seed); return add('j_poke_squawkabilly').ability.poke_plumage; };
  ok(roll('PLSEED') === roll('PLSEED'), 'seeded: the same run rolls the same plumage');
  const seen = new Set(); for (let i = 0; i < 40; i++) seen.add(roll('PL' + i));
  ok(seen.size === 4, 'all four plumages appear across seeds', [...seen]);
  // a debuff / un-debuff (add_to_deck again) keeps it
  start('PLKEEP');
  const k = add('j_poke_squawkabilly'); const pl = k.ability.poke_plumage;
  debuff(k); undebuff(k);
  ok(k.ability.poke_plumage === pl, 'a debuff and back: the same plumage', [pl, k.ability.poke_plumage]);
});

// ------------------------------------------------------------------- Tadbulb / Bellibolt: discards, Electromorphosis
await sec('electromorphosis', () => {
  start('TADB');
  const t = add('j_poke_tadbulb');
  let h = play(['S_A']);
  ok(near(h.mult, 1), 'Tadbulb: no discard yet -> nothing', h.total);
  discard(['S_3', 'H_4', 'D_5']); discard(['C_6']);
  h = play(['S_A']);
  ok(near(h.mult, 1 + 6) && /Currently \+6 Mult/.test(plain(t)), 'two discards used (3 cards, 1 card): +6', [h.total, plain(t)]);
  // The Hook's discard is no discard used
  clearHand();
  const hk = cards(['S_3', 'H_4']); for (const c of hk) G.hand.add_to_highlighted(c, true);
  RUN.discard_cards_from_highlighted(true); flush();
  h = play(['S_A']);
  ok(near(h.mult, 1 + 6), 'The Hook\'s discard (hook = true) doesn\'t count', h.total);
  endRound(); advance();
  h = play(['S_A']);
  ok(near(h.mult, 1), 'a new round: back to 0', h.total);
  ok(/\+3 Mult for each discard used this round/.test(plain(t)), 'its text', plain(t));
  rounds(3);
  ok(key(t) === 'j_poke_tadbulb' && ex(t).rounds === 1, '4 rounds won: still Tadbulb, 1 to go', [key(t), ex(t).rounds]);
  rounds(1);
  ok(key(t) === 'j_poke_bellibolt' && ex(t).charge_Xmult === 1, 'Tadbulb -> Bellibolt after 5 rounds: charge X1', [key(t), ex(t).charge_Xmult]);
  h = play(['S_A']);
  ok(near(h.mult, 1), 'no charge: nothing', h.total);
  discard(['S_3']); discard(['H_4', 'D_9']);
  ok(near(ex(t).charge_Xmult, 1.5) && /Charge: X1.5/.test(plain(t)), 'two discards: charge X1.5', [ex(t).charge_Xmult, plain(t)]);
  h = play(['S_A']);
  ok(near(h.mult, 1.5) && ex(t).charge_Xmult === 1, 'the next hand fires X1.5 and resets the charge to X1', [h.total, ex(t).charge_Xmult]);
  h = play(['S_A']);
  ok(near(h.mult, 1), 'the hand after: nothing', h.total);
  // Blueprint copies the shot, the charge resets once
  const bp = add('j_blueprint'); G.jokers.cards.reverse();
  discard(['S_3']);
  ok(near(ex(t).charge_Xmult, 1.25), 'with Blueprint: a discard charges +X0.25 once', ex(t).charge_Xmult);
  h = play(['S_A']);
  ok(near(h.mult, 1.25 * 1.25) && ex(t).charge_Xmult === 1, 'Blueprint copies the X1.25; one reset', [h.total, ex(t).charge_Xmult]);
  bp.remove(); flush();
  // lost at round end
  discard(['S_3']); discard(['S_4']);
  ok(near(ex(t).charge_Xmult, 1.5), 'charged X1.5');
  endRound(); advance();
  ok(ex(t).charge_Xmult === 1, 'the round ended unfired: the charge is lost', ex(t).charge_Xmult);
  // a debuffed hand (The Psychic: fewer than 5 cards) doesn't fire it
  discard(['S_3']);
  // The Psychic (a hand of fewer than 5 cards is debuffed: no joker_main) doesn't fire it; a 5-card hand does
  while (!G.GAME.blind.boss) { endRound(); advance('bl_psychic'); }
  discard(['S_3']);
  const pre = ex(t).charge_Xmult;
  h = play(['S_A']);
  ok(G.GAME.blind.name === 'The Psychic' && near(pre, 1.25) && near(ex(t).charge_Xmult, 1.25), 'a debuffed hand (The Psychic, 1 card): the charge holds X1.25', [G.GAME.blind.name, pre, ex(t).charge_Xmult, h.total]);
  h = play(['S_2', 'H_5', 'D_9', 'C_J', 'S_K']);
  ok(near(h.mult, 1.25) && ex(t).charge_Xmult === 1, 'a 5-card hand: fires X1.25', [h.total, ex(t).charge_Xmult]);
  ok(/Electromorphosis: each discard used adds X0.25 to a charge; your next scoring hand fires it/.test(plain(t)), 'its text', plain(t));
});

// ------------------------------------------------------------------- Wattrel / Kilowattrel: Wind Power
await sec('wind power', () => {
  start('WIND');
  const w = add('j_poke_wattrel');
  ok(G.GAME.current_round.discards_left === 4 && /Currently \$4/.test(plain(w)), 'Red Deck: 4 discards left; the tooltip reads them', [G.GAME.current_round.discards_left, plain(w)]);
  ok(/Wind Power: earn \$1 at end of round for each discard left/.test(plain(w)) && /Evolves after 4 rounds/.test(plain(w)), 'its text', plain(w));
  const dl = G.GAME.current_round.discards_left;
  let rows = toEval();
  ok(rowsOf(rows, 'wattrel').length === 1 && rowsOf(rows, 'wattrel')[0].dollars === dl, `the cash-out: a $${dl} Wattrel row ($1 x ${dl} discards left)`, rowsOf(rows, 'wattrel'));
  advance();
  discard(['S_3']); discard(['S_4']);
  const dl2 = G.GAME.current_round.discards_left;
  rows = toEval();
  ok(rowsOf(rows, 'wattrel')[0] && rowsOf(rows, 'wattrel')[0].dollars === dl2 && dl2 === dl - 2, 'two discards used: $2 less', rowsOf(rows, 'wattrel'));
  advance();
  while (G.GAME.current_round.discards_left > 0) discard(['S_3']);
  rows = toEval();
  ok(rowsOf(rows, 'wattrel').length === 0, 'no discard left: no row', rowsOf(rows, 'wattrel'));
  advance();
  // Blueprint copies no $
  const bp = add('j_blueprint'); G.jokers.cards.reverse();
  rows = toEval();
  ok(rows.filter((x) => x.center === 'j_blueprint' && x.dollars).length === 0, 'Blueprint copies no $');
  bp.remove(); flush();
  advance();
  ok(key(w) === 'j_poke_kilowattrel' && /Wind Power: earn \$2 at end of round/.test(plain(w)), 'Wattrel -> Kilowattrel after 4 rounds', [key(w), plain(w)]);
  rows = toEval();
  ok(rowsOf(rows, 'kilowattrel')[0] && rowsOf(rows, 'kilowattrel')[0].dollars === 2 * dl, `Kilowattrel: $2 per discard left ($${2 * dl})`, rowsOf(rows, 'kilowattrel'));
  const d0 = G.GAME.dollars;
  act({ type: 'cash_out' }); flush();
  ok(G.GAME.dollars - d0 >= 2 * dl, 'cashed out', G.GAME.dollars - d0);
  // a debuffed one pays nothing
  advance();
  debuff(w);
  rows = toEval();
  ok(rowsOf(rows, 'kilowattrel').length === 0, 'debuffed: no row');
});

// ------------------------------------------------------------------- Maschiff / Mabosstiff: Boss Blinds, Guard Dog
await sec('guard dog', () => {
  start('MASCH');
  const m = add('j_poke_maschiff');
  let h = play(['S_A']);
  ok(near(h.mult, 1), 'Maschiff: the Small Blind -> nothing', h.total);
  endRound(); advance();
  endRound(); advance('bl_wall');
  ok(G.GAME.blind.boss, 'the Boss Blind');
  h = play(['S_A']);
  ok(near(h.mult, 1 + 12), 'during the Boss Blind: +12', h.total);
  ok(/\+12 Mult during Boss Blinds/.test(plain(m)), 'its text', plain(m));
  rounds(4);
  ok(key(m) === 'j_poke_mabosstiff', 'Maschiff -> Mabosstiff after 5 rounds', key(m));
  ok(!G.GAME.blind.boss, 'a Small / Big Blind now');
  h = play(['S_A']);
  ok(near(h.mult, 1), 'Mabosstiff: not a Boss -> nothing', h.total);
  while (!G.GAME.blind.boss) { endRound(); advance('bl_final_heart'); }
  ok(G.GAME.blind.name === 'Crimson Heart', 'Crimson Heart', G.GAME.blind.name);
  const j = add('j_joker'), j2 = add('j_greedy_joker');
  for (let i = 0; i < 4; i++) {
    h = play(['S_A']);
    ok(!G.jokers.cards.some((x) => x.debuff), 'Crimson Heart debuffs none of your Jokers (hand ' + (i + 1) + ')', G.jokers.cards.map((x) => [key(x), x.debuff]));
  }
  ok(near(h.mult, 1 * 1.5 + 4), 'during the Boss Blind: X1.5 (then the Joker\'s +4)', h.total);
  // without Mabosstiff Crimson Heart does debuff
  m.remove(); flush();
  let hit = 0;
  for (let i = 0; i < 4; i++) { play(['S_A']); if (j.debuff || j2.debuff) hit++; }
  ok(hit >= 3, 'without it: Crimson Heart debuffs a Joker each hand', hit);
  // gained mid-round: the current debuff lifts at once
  const m2 = add('j_poke_mabosstiff');
  ok(!j.debuff && !j2.debuff, 'Mabosstiff bought: the Crimson Heart debuff lifts at once', [j.debuff, j2.debuff]);
  // an SMODS debuff source, on another Joker or on itself: no debuff
  debuff(j); debuff(m2);
  ok(!j.debuff && !m2.debuff, 'a debuff source on the Joker or on Mabosstiff itself: neither is debuffed', [j.debuff, m2.debuff]);
  // a Perishable's end of life still debuffs
  j2.ability.perishable = true; j2.ability.perish_tally = 0; j2.set_debuff(); flush();
  ok(j2.debuff, 'a Perishable at the end of its life: debuffed (a sticker\'s cost)', j2.debuff);
  // losing it: the lasting sources come back
  m2.ability.debuff_sources = {};
  m2.remove(); flush();
  ok(j.debuff, 'Mabosstiff gone: the Joker\'s debuff source takes hold again', j.debuff);
  ok(/Guard Dog: your Jokers can't be debuffed/.test(plain(m2)) && /Perishable still expires, a Baby still faints/.test(plain(m2)), 'its text', plain(m2));
  // a Baby still faints
  start('MABBABY');
  add('j_poke_mabosstiff'); const tx = add('j_poke_toxel'); add('j_joker');
  play(['S_A']);
  ok(tx.debuff, 'a Baby with a non-Baby Joker to its right still faints', tx.debuff);
});

// ------------------------------------------------------------------- Toedscool / Toedscruel: Mycelium
await sec('mycelium', () => {
  start('TOED');
  const t = add('j_poke_toedscool');
  // the hand helper creates cards (they join the deck): measure the deck as it scores
  const deck = () => G.playing_cards.length;
  ok(deck() === 52 && /Currently 0: \+0 Chips/.test(plain(t)), 'a 52-card deck: 0 above 52', [deck(), plain(t)]);
  let h = play(['S_A']);
  ok(h.chips === 16 + 4 * (deck() - 52), `deck ${deck()}: +${4 * (deck() - 52)} Chips`, [h.total, deck()]);
  hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8']); clearHand();
  h = play(['S_A']);
  ok(deck() === 61 && h.chips === 16 + 4 * 9, 'a 61-card deck: +36 Chips', [h.total, deck()]);
  // a destroyed card leaves the deck
  const g = G.playing_cards[0]; g.start_dissolve(); flush();
  h = play(['S_A']);
  ok(deck() === 61 && h.chips === 16 + 4 * 9, 'one destroyed, one more played: still 61', [h.total, deck()]);
  ok(/Mycelium: \+4 Chips for each card in your full deck above 52/.test(plain(t)), 'its text', plain(t));
  rounds(5);
  ok(key(t) === 'j_poke_toedscruel', 'Toedscool -> Toedscruel after 5 rounds', key(t));
  h = play(['S_A']);
  ok(near(h.mult, 1 + 0.02 * (deck() - 40)), `Toedscruel: X1 + X0.02 x ${deck() - 40}`, [h.total, deck()]);
  ok(new RegExp('Currently ' + (deck() - 40) + ': X' + (1 + 0.02 * (deck() - 40)).toFixed(2).replace(/0$/, '')).test(plain(t)), 'its tooltip', plain(t));
  // a small deck: X1 (never below)
  start('TOED2');
  const t2 = add('j_poke_toedscruel');
  while (G.playing_cards.length > 30) G.playing_cards[0].start_dissolve();
  flush();
  h = play(['S_A']);
  ok(near(h.mult, 1), 'a 31-card deck: X1 (never below)', [h.total, G.playing_cards.length]);
  ok(/Mycelium: X1 Mult, plus X0.02 for each card in your full deck above 40/.test(plain(t2)), 'its text', plain(t2));
});

// ------------------------------------------------------------------- Klawf: Anger Shell
await sec('anger shell', () => {
  start('KLAWF');
  const k = add('j_poke_klawf');
  const xs = [];
  for (let i = 0; i < 4; i++) xs.push(play(['S_A']).mult);
  ok(xs.every((x, i) => near(x, i + 1)), 'Red Deck\'s 4 hands: X1, X2, X3, X4', xs);
  ok(/Currently X5 Mult/.test(plain(k)), 'tooltip: X5 next (4 already played)', plain(k));
  endRound(); advance();
  ok(near(play(['S_A']).mult, 1), 'a new round: X1 again');
  ok(/Anger Shell: X1 Mult, plus X1 for each hand already played this round/.test(plain(k)), 'its text', plain(k));
  add('j_blueprint'); G.jokers.cards.reverse();
  ok(near(play(['S_A']).mult, 4), 'Blueprint copies it (2nd hand: X2 x X2)');
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
  steps('nymble', 'mult', 'Grass', [21, 27, 33]);
  steps('lokix', 'Xmult', 'Grass', [3, 3.5, 4]);
  steps('pawmi', 'mult', 'Lightning', [2.8, 3.6, 4.4]);
  let j = steps('pawmo', 'Xmult', 'Lightning', [1.8, 2.1, 2.4]); fixed(j, 'face_money', 1);
  steps('pawmot', 'Xmult', 'Lightning', [1.8, 2.1, 2.4]);
  steps('tadbulb', 'mult', 'Lightning', [4.2, 5.4, 6.6]);
  j = steps('bellibolt', 'Xmult_mod', 'Lightning', [0.3, 0.35, 0.4]); fixed(j, 'charge_Xmult', 1);
  steps('maschiff', 'mult', 'Dark', [16.8, 21.6, 26.4]);
  steps('mabosstiff', 'Xmult', 'Dark', [1.8, 2.1, 2.4]);
  steps('toedscool', 'chips', 'Grass', [5.2, 6.4, 7.6]);
  steps('toedscruel', 'Xmult_mod', 'Grass', [0.024, 0.028, 0.032]);
  j = steps('klawf', 'Xmult_mod', 'Earth', [1.2, 1.4, 1.6]);
  const xs = []; for (let i = 0; i < 4; i++) xs.push(r4(play(['S_A']).mult));
  ok(xs.join() === '1,2.6,4.2,5.8', 'energized Klawf (3): X1 / 2.6 / 4.2 / 5.8', xs);
  // the Energy-inert three: no field to raise
  for (const [n, f, v] of [['squawkabilly', 'dem', 2], ['wattrel', 'wind_money', 1], ['kilowattrel', 'wind_money', 2]]) {
    start('ENX' + n);
    const c = add('j_poke_' + n);
    increment_energy(c, C(n).ptype);
    ok(ex(c)[f] === v, `${n}: ${f} stays ${v} (Energy-inert)`, ex(c)[f]);
  }
  // charges after Energy: new gains only (never retroactive)
  start('ENBELL');
  const b = add('j_poke_bellibolt');
  discard(['S_3']);
  increment_energy(b, 'Lightning');
  discard(['S_4']);
  ok(near(ex(b).charge_Xmult, 1.55), 'a charge of X0.25, then Energy, then X0.3: X1.55', ex(b).charge_Xmult);
  // Energy carries through evolution (re-applied to the new base): Pawmi (2) -> Pawmo -> Pawmot X2.1
  start('ENEVO');
  const p = add('j_poke_pawmi');
  increment_energy(p, 'Lightning'); increment_energy(p, 'Lightning');
  rounds(4);
  ok(key(p) === 'j_poke_pawmo' && near(ex(p).Xmult, 2.1), 'Pawmi (2 Energy) -> Pawmo: Pawmot\'s X carried at X2.1', [key(p), ex(p).Xmult]);
  rounds(5);
  ok(key(p) === 'j_poke_pawmot' && ex(p).energy_count === 2 && near(ex(p).Xmult, 2.1), '-> Pawmot: X2.1', [key(p), ex(p).Xmult]);
  start('ENEVO2');
  const t = add('j_poke_tadbulb');
  increment_energy(t, 'Lightning');
  rounds(5);
  ok(key(t) === 'j_poke_bellibolt' && near(ex(t).Xmult_mod, 0.3) && ex(t).charge_Xmult === 1, 'Tadbulb (1 Energy) -> Bellibolt: X0.3 a discard', [key(t), ex(t).Xmult_mod]);
});

// ------------------------------------------------------------------- save / resume
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'G9B1RES', customDeck: { name: 'Gen 9a', mods: ['pokermon'], params: { blind_scaling: 0.05 },
    cards: [['S_K', 0, 0, 0, 12], ['H_9', 0, 0, 0, 10], ['D_5', 0, 0, 0, 10], ['C_7', 0, 0, 0, 20]],
    jokers: [{ key: 'j_ceremonial' }, { key: 'j_poke_sizzlipede' }, { key: 'j_poke_pawmot' }, { key: 'j_poke_squawkabilly' }, { key: 'j_poke_bellibolt' }] } });
  s.act({ type: 'select_blind' }); flush();
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 3).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush();
  const charge = ex(G.jokers.cards.find((j) => key(j) === 'j_poke_bellibolt')).charge_Xmult;
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 2).map((c) => c.sort_id) }); s.act({ type: 'discard' }); flush();
  s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush();
  const snap = () => ({
    state: G.STATE,
    jokers: G.jokers.cards.map((j) => [key(j), j.ability.poke_plumage || null, ex(j) && typeof ex(j) === 'object' ? [ex(j).blessing_ante, ex(j).charge_Xmult, ex(j).burn_mult] : null]),
    hands: Object.fromEntries(Object.entries(G.GAME.hands).map(([k, v]) => [k, v.level])),
    deck: G.playing_cards.length, chips: String(G.GAME.chips), dollars: G.GAME.dollars, played: G.GAME.current_round.hands_played,
  });
  const want = snap();
  const jk = want.jokers;
  ok(jk.length === 5 && jk[1][0] === 'j_poke_sizzlipede' && jk[2][2][0] === 1 && jk[3][1] && near(charge, 1.25) && jk[4][2][1] === 1 && want.played === 1,
    'the run: the Dagger\'s target revived (blessing used in Ante 1), the plumage rolled, Bellibolt charged then fired, a hand played', want);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const got = snap();
  ok(!r.stoppedAt && JSON.stringify(got) === JSON.stringify(want), 'resume: the revival, the plumage, the charge and the score come back the same', { want, got });
});

// ------------------------------------------------------------------- the art: the 3.9.1 cells show these types (every plumage too)
if (ART) {
  await sec('art types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    const sheet = (a) => a.replace(/^poke_/, '').replace(/391$/, '');
    const bad = [];
    for (const n of NAMES) { const r = typer.typeOfEntry({ atlas: sheet(C(n).atlas), pos: [C(n).pos.x, C(n).pos.y] }); if (!r || r.ptype !== C(n).ptype) bad.push([n, C(n).ptype, r && r.ptype]); }
    ok(!bad.length, 'each of the 15 is the type its 3.9.1 card shows', bad);
    const pl = Object.values(ANIM.GEN9_FORM_SPRITES.j_poke_squawkabilly).map((p) => typer.typeOfEntry({ atlas: 'AtlasJokersBasicGen09', pos: [p.x, p.y] }));
    ok(pl.length === 3 && pl.every((r) => r && r.ptype === 'Colorless'), 'the Blue / Yellow / White plumage cells are Colorless too', pl.map((r) => r && r.ptype));
  });
} else ok(true, '(art types: the Pokermon sheets are not on disk here)');

done();
