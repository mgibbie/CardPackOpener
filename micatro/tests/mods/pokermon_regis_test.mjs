// The owner's Regi trio (2026-10-28; jokers/pokejokers_designs.js "The Regi trio"; PORTING.md "The owner's Regi trio"):
//   Regirock 377 (Legendary $20, Earth)   Stone Body: Stone cards give +100 Chips instead of +50, and permanently gain +10 Chips each
//                                         time they score.
//   Regice 378 (Legendary $20, Water)     Ice Body: Glass cards never shatter (the 1 in 4 roll is fixed to 0).
//   Registeel 379 (Legendary $20, Metal)  Iron Body: Steel cards held in hand give X2 Mult instead of X1.5 (the Steel card's own held
//                                         effect: a Red Seal / Mime repeat it).
//   Regi Trio: when a Blind is selected each converts 1 + (OTHER Regi species you have, undebuffed) random cards of the full deck into
//   its enhancement (unenhanced cards first; never a card that already is it). Energy: Regirock chips1 +30% / chip_mod +20%, Registeel
//   Xmult_multi +5%, Regice glass_convert +1 card per Energy.
// Every ability is FIRED through real rounds with exact numbers.
//   node micatro/tests/mods/pokermon_regis_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_card, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const REGIS = ['regirock', 'regice', 'registeel'];
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
/** Back into the hand (a played card sits in the discard). */
function back(c) { if (c.area) c.area.remove_card(c); G.hand.emplace(c); return c; }
const enh = (k) => (G.playing_cards || []).filter((c) => c.config.center.key === k).length;
/** A new run at the blind select, these jokers added, then the Blind selected: -> the enhancement counts it made. */
function blind(seed, keys, prep) {
  start(seed, {}, { noBlind: true });
  const js = keys.map((k) => add(k));
  if (prep) prep(js);
  const before = { s: enh('m_stone'), g: enh('m_glass'), t: enh('m_steel'), plain: enh('c_base') };
  act({ type: 'select_blind' });
  G.E_MANAGER.flush();
  return { js, stone: enh('m_stone') - before.s, glass: enh('m_glass') - before.g, steel: enh('m_steel') - before.t, plain: before.plain - enh('c_base') };
}

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 30 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 30+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of REGIS) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /regirock|regice|registeel/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has a Regi (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('REGI0');
  const want = { regirock: ['Earth', 2], regice: ['Water', 4], registeel: ['Metal', 6] };
  for (const n of REGIS) {
    const c = P_CENTERS['j_poke_' + n];
    ok(c.rarity === 4 && c.cost === 20 && c.stage === 'Legendary' && c.ptype === want[n][0] && c.gen === 3, n + ': Legendary $20, ' + want[n][0] + ', Gen 3', [c.rarity, c.cost, c.stage, c.ptype]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === want[n][1] && c.pos.y === 25 && c.soul_pos && c.soul_pos.x === want[n][1] + 1 && c.soul_pos.y === 25,
      n + ': upstream 3.9.1 cell + its floating soul (Natdex ' + want[n][1] + ',25 / ' + (want[n][1] + 1) + ',25)', [c.atlas, c.pos, c.soul_pos]);
  }
  ok(P_CENTERS.j_poke_regirock.config.extra.chips1 === 100 && P_CENTERS.j_poke_regirock.config.extra.chip_mod === 10 && P_CENTERS.j_poke_registeel.config.extra.Xmult_multi === 2
    && P_CENTERS.j_poke_regice.config.extra.glass_convert === 1, 'numbers: +100 / +10, X2, 1 Glass');
  ok(energy_values.chips1 === 0.3 && energy_values.chip_mod === 0.2 && energy_values.Xmult_multi === 0.05 && energy_values.glass_convert === 1, 'energy fields: chips1 +30%, chip_mod +20%, Xmult_multi +5%, glass_convert +1 (its whole base)', energy_values);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_regirock');
  ok(keys.slice(i - 1, i + 4).join() === 'j_poke_metagross,j_poke_regirock,j_poke_regice,j_poke_registeel,j_poke_jirachi', 'Pokédex order: Metagross (376), Regirock, Regice, Registeel, Jirachi (385)', keys.slice(i - 1, i + 4));
  // the Legendary pool (The Soul): all three are in it, none in the Common / Uncommon / Rare shop pools
  const [leg] = get_current_pool('Joker', 4, true);
  ok(REGIS.every((n) => leg.includes('j_poke_' + n)), 'all three are in the Legendary pool', leg.filter((k) => /regi/.test(k)));
  for (const r of [1, 2, 3]) { const [p] = get_current_pool('Joker', r); ok(!REGIS.some((n) => p.includes('j_poke_' + n)), 'not in the rarity ' + r + ' pool'); }
  let seen = new Set();
  for (let k = 0; k < 400 && seen.size < 3; k++) { const c = create_card('Joker', G.jokers, true, null, null, null, null, 'soul' + k); if (/regi/.test(c.config.center.key)) seen.add(c.config.center.key); c.remove(); }
  ok(seen.size === 3, 'The Soul\'s legendary roll can make each of them', [...seen]);
});

// ------------------------------------------------------------------- Regirock: +100 instead of +50, +10 permanent per score
sec('regirock stone', () => {
  start('REGI1');
  const [s] = hand(['S_A'], { center: 'm_stone' });
  let t = play([s]).total;
  ok(t.chips === 5 + 50, 'no Regirock: a Stone card High Card gives 5 + 50 = 55 Chips', t);
  const r = add('j_poke_regirock');
  back(s); t = play([s]).total;
  ok(t.chips === 5 + 100, 'with Regirock: 5 + 100 = 105 (+100 instead of +50)', t);
  ok(s.ability.perma_bonus === 10, 'the Stone card permanently gained +10 Chips', s.ability.perma_bonus);
  back(s); t = play([s]).total;
  ok(t.chips === 5 + 110 && s.ability.perma_bonus === 20, 'next hand: 5 + 110 = 115, then +20 banked', [t, s.ability.perma_bonus]);
  // a Red Seal: it scores twice, +10 each time (100+20, then 100+30)
  s.set_seal('Red', true);
  back(s); t = play([s]).total;
  ok(t.chips === 5 + 120 + 130 && s.ability.perma_bonus === 40, 'a Red Seal retrigger: 5 + 120 + 130 = 255, +10 per score (perma 40)', [t, s.ability.perma_bonus]);
  // a plain card gains nothing; sell Regirock: the Stone is +50 again (its perma_bonus stays)
  const [p] = hand(['H_9']); play([p]);
  ok(!p.ability.perma_bonus, 'a non-Stone card gains nothing', p.ability.perma_bonus);
  s.set_seal(null, true);
  r.remove(); G.E_MANAGER.flush();
  back(s); t = play([s]).total;
  ok(t.chips === 5 + 50 + 40, 'Regirock gone: +50 again, the banked +40 kept: 95', t);
  // debuffed: no rule, no growth
  const r2 = debuff(add('j_poke_regirock'));
  back(s); t = play([s]).total;
  ok(r2.debuff && t.chips === 5 + 50 + 40 && s.ability.perma_bonus === 40, 'a debuffed Regirock does nothing (95, no growth)', [t, s.ability.perma_bonus]);
});

// ------------------------------------------------------------------- Regice: Glass never shatters (forced roll); counters see nothing
function glassRound(seed, keys, opt = {}) {
  start(seed);
  const js = keys.map((k) => add(k));
  if (opt.debuffIce) debuff(js.find((j) => j.config.center.key === 'j_poke_regice'));
  G.GAME.probabilities.normal = 1e6; // forced: 1e6 in 4 — every unprotected Glass card breaks
  const gs = hand(['S_K', 'H_K'], { center: 'm_glass' });
  const t = play(gs).total;
  G.E_MANAGER.flush();
  G.GAME.probabilities.normal = 1;
  return { js, gs, t, broke: gs.filter((c) => c.shattered).length, kept: gs.filter((c) => G.playing_cards.includes(c)).length };
}
sec('regice glass', () => {
  let r = glassRound('REGI2a', ['j_glass', 'j_poke_whismur']);
  const gj = r.js[0], wh = r.js[1];
  ok(r.broke === 2 && r.kept === 0, 'without Regice (forced roll): both Glass cards shatter', r);
  ok(near(gj.ability.x_mult, 1 + 2 * 0.75) && ex(wh).glass_chips === 30 + 40, 'Glass Joker (+X1.5) and Whismur (+40 Chips) count the 2 breaks', [gj.ability.x_mult, ex(wh).glass_chips]);
  r = glassRound('REGI2b', ['j_glass', 'j_poke_whismur', 'j_poke_regice']);
  ok(r.broke === 0 && r.kept === 2 && r.gs.every((c) => G.discard.cards.includes(c)), 'with Regice (same forced roll): neither shatters, both go to the discard', r);
  ok(near(r.t.mult, 2 * 2 * 2), 'the Glass cards still give X2 each (a Pair: 2 x 2 x 2 = 8 Mult)', r.t);
  ok(near(r.js[0].ability.x_mult, 1) && ex(r.js[1]).glass_chips === 30, 'Glass Joker and Whismur see no break (X1, 30 Chips)', [r.js[0].ability.x_mult, ex(r.js[1]).glass_chips]);
  r = glassRound('REGI2c', ['j_glass', 'j_poke_regice'], { debuffIce: true });
  ok(r.broke === 2 && near(r.js[0].ability.x_mult, 2.5), 'a debuffed Regice protects nothing: both shatter, Glass Joker counts them', [r.broke, r.js[0].ability.x_mult]);
  // the roll itself: 0 in 4 with Regice
  start('REGI2d'); add('j_poke_regice');
  const [g] = hand(['S_2'], { center: 'm_glass' });
  G.GAME.probabilities.normal = 1e6;
  let breaks = 0;
  for (let k = 0; k < 20; k++) { back(g); play([g]); if (g.shattered) breaks++; }
  G.GAME.probabilities.normal = 1;
  ok(breaks === 0 && G.playing_cards.includes(g), '20 forced hands with Regice: never shatters', breaks);
});

// ------------------------------------------------------------------- Registeel: held Steel X2 (its held effect), Red Seal / Mime
sec('registeel steel', () => {
  start('REGI3');
  const held = () => hand(['C_7'], { center: 'm_steel' })[0];
  let st = held();
  let t = play(hand(['S_2'])).total;
  ok(near(t.mult, 1.5), 'no Registeel: a held Steel card X1.5', t);
  const reg = add('j_poke_registeel');
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 2), 'with Registeel: X2 instead of X1.5', t);
  st.set_seal('Red', true);
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 4), 'a Red Seal on the held Steel: X2 twice = X4', t);
  st.set_seal(null, true);
  add('j_mime');
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 4), 'Mime retriggers it too: X2 twice = X4', t);
  // two held Steels, no Mime
  clearHand(); G.jokers.cards.filter((j) => j.config.center.key === 'j_mime').forEach((j) => j.remove()); G.E_MANAGER.flush();
  st = held(); held();
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 4), 'two held Steel cards: X2 each = X4', t);
  debuff(reg);
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 2.25), 'a debuffed Registeel: X1.5 each again (X2.25)', t);
});

// ------------------------------------------------------------------- the Regi Trio: 1 / 2 / 3 per Blind
sec('trio count', () => {
  let r = blind('REGI4a', ['j_poke_regirock']);
  ok(r.stone === 1 && r.glass === 0 && r.steel === 0, 'Regirock alone: 1 Stone card per Blind', r);
  r = blind('REGI4b', ['j_poke_regice']);
  ok(r.glass === 1, 'Regice alone: 1 Glass card', r);
  r = blind('REGI4c', ['j_poke_registeel']);
  ok(r.steel === 1, 'Registeel alone: 1 Steel card', r);
  r = blind('REGI4d', ['j_poke_regirock', 'j_poke_regice']);
  ok(r.stone === 2 && r.glass === 2 && r.steel === 0, 'two Regis: 2 each', r);
  r = blind('REGI4e', ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel']);
  ok(r.stone === 3 && r.glass === 3 && r.steel === 3 && r.plain === 9, 'all three: 3 each (9 cards, all from the unenhanced ones)', r);
  ok(/random card\(s\) in.*\{C:attention\}3\{\}|\{C:attention\}3\{\} random/.test(lines(r.js[0])) || /selected, \{C:attention\}3\{\}/.test(lines(r.js[0])), 'the tooltip shows 3', lines(r.js[0]));
  // duplicates (as through Showman): another copy of the SAME Regi isn't an "other Regi"; two Regirocks are ONE other species for Regice
  r = blind('REGI4f', ['j_poke_regirock', 'j_poke_regirock']);
  ok(r.stone === 2, 'two Regirocks, nothing else: 1 each (a twin isn\'t another Regi)', r);
  r = blind('REGI4g', ['j_poke_regirock', 'j_poke_regirock', 'j_poke_regice']);
  ok(r.stone === 4 && r.glass === 2, 'two Regirocks + Regice: each Regirock 2, Regice 2 (Regirock counted once)', r);
  // debuffed Regis neither convert nor count
  r = blind('REGI4h', ['j_poke_regirock', 'j_poke_regice', 'j_poke_registeel'], (js) => debuff(js[1]));
  ok(r.js[1].debuff && r.stone === 2 && r.glass === 0 && r.steel === 2, 'a debuffed Regice: no Glass, and the others make 2 each', r);
  // the next Blind converts again
  start('REGI4i', {}, { noBlind: true });
  add('j_poke_regirock');
  act({ type: 'select_blind' });
  const one = enh('m_stone');
  G.GAME.chips = G.GAME.blind.chips; clearHand(); play(hand(['S_2']), { keepChips: true });
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  ok(one === 1 && enh('m_stone') === 2, 'every Blind: 1, then 2 Stone cards', [one, enh('m_stone')]);
  // Blueprint copies the conversion (as Marble Joker)
  r = blind('REGI4j', ['j_blueprint', 'j_poke_regirock']);
  ok(r.stone === 2, 'Blueprint + Regirock: 2 Stone cards', r);
});

// ------------------------------------------------------------------- conversion picks: unenhanced first, never its own enhancement
sec('conversion prefers unenhanced', () => {
  for (let k = 0; k < 6; k++) {
    let plain;
    const r = blind('REGI5' + k, ['j_poke_regirock'], () => {
      const pcs = G.playing_cards.slice().sort((a, b) => a.sort_id - b.sort_id);
      plain = pcs[(k * 7) % pcs.length];
      for (const c of pcs) if (c !== plain) c.set_ability(P_CENTERS.m_bonus, null, true);
    });
    ok(r.stone === 1 && plain.config.center.key === 'm_stone' && enh('m_bonus') === 51, 'seed ' + k + ': the one unenhanced card is the one that becomes Stone', [r, plain.config.center.key]);
  }
  // none unenhanced: any non-Stone card (an enhancement is overwritten) — never an existing Stone
  let other;
  let r = blind('REGI5x', ['j_poke_regirock'], () => {
    const pcs = G.playing_cards.slice().sort((a, b) => a.sort_id - b.sort_id);
    other = pcs[10];
    for (const c of pcs) c.set_ability(c === other ? P_CENTERS.m_gold : P_CENTERS.m_stone, null, true);
  });
  ok(r.stone === 1 && other.config.center.key === 'm_stone' && enh('m_gold') === 0, 'all Stone but one Gold: the Gold one becomes Stone (it overwrites once no plain card is left)', r);
  r = blind('REGI5y', ['j_poke_regirock', 'j_poke_regice'], () => { for (const c of G.playing_cards) c.set_ability(P_CENTERS.m_stone, null, true); });
  ok(r.stone === -2 && r.glass === 2, 'all Stone with Regirock + Regice: Regirock converts nothing (no non-Stone card), Regice turns 2 Stones to Glass', r);
  // seal and edition survive a conversion
  let sealed;
  blind('REGI5z', ['j_poke_registeel'], () => {
    const pcs = G.playing_cards.slice().sort((a, b) => a.sort_id - b.sort_id);
    sealed = pcs[3]; sealed.set_seal('Gold', true); sealed.set_edition({ foil: true }, true, true);
    for (const c of pcs) if (c !== sealed) c.set_ability(P_CENTERS.m_wild, null, true);
  });
  ok(sealed.config.center.key === 'm_steel' && sealed.seal === 'Gold' && sealed.edition && sealed.edition.foil, 'the converted card keeps its seal and edition', [sealed.config.center.key, sealed.seal, sealed.edition]);
});

// ------------------------------------------------------------------- Energy
sec('energy', () => {
  start('REGI6');
  const rock = add('j_poke_regirock');
  const vals = [];
  for (let k = 0; k < 3; k++) { increment_energy(rock, 'Earth'); vals.push([ex(rock).chips1, ex(rock).chip_mod]); }
  ok(vals.every((v, k) => near(v[0], 100 + 30 * (k + 1)) && near(v[1], 10 + 2 * (k + 1))), 'Regirock: +100 -> 130 / 160 / 190, +10 -> 12 / 14 / 16', vals);
  const [s] = hand(['S_A'], { center: 'm_stone' });
  let t = play([s]).total;
  ok(near(t.chips, 5 + 190) && near(s.ability.perma_bonus, 16), 'a 3-Energy Regirock: the Stone gives 190 and banks +16', [t, s.ability.perma_bonus]);
  const steel = add('j_poke_registeel');
  const xs = [];
  for (let k = 0; k < 3; k++) { increment_energy(steel, 'Metal'); xs.push(ex(steel).Xmult_multi); }
  ok(xs.every((v, k) => near(v, 2 + 0.1 * (k + 1))), 'Registeel: X2 -> X2.1 / X2.2 / X2.3', xs);
  clearHand(); const [h] = hand(['C_7'], { center: 'm_steel' }); h.set_seal('Red', true);
  t = play(hand(['S_2'])).total;
  ok(near(t.mult, 2.3 * 2.3), 'a 3-Energy Registeel and a Red Seal: X2.3 twice (X5.29)', t);
  // Regice: +1 Glass card per Energy (a mismatched Colorless +0.5, floored)
  let r = blind('REGI6a', ['j_poke_regice'], (js) => { increment_energy(js[0], 'Water'); });
  ok(r.glass === 2, 'Regice, 1 Energy: 2 Glass cards', r);
  r = blind('REGI6b', ['j_poke_regice'], (js) => { for (let k = 0; k < 3; k++) increment_energy(js[0], 'Water'); });
  ok(r.glass === 4 && /\{C:attention\}4\{\}/.test(lines(r.js[0])), 'Regice, 3 Energy: 4 Glass cards (tooltip 4)', [r, lines(r.js[0])]);
  r = blind('REGI6c', ['j_poke_regice', 'j_poke_regirock', 'j_poke_registeel'], (js) => { for (let k = 0; k < 3; k++) increment_energy(js[0], 'Water'); });
  ok(r.glass === 6 && r.stone === 3 && r.steel === 3, 'a 3-Energy Regice with both others: 4 + 2 = 6 Glass (the others 3 each)', r);
  r = blind('REGI6d', ['j_poke_regice'], (js) => { increment_energy(js[0], 'Colorless'); });
  ok(r.glass === 1 && near(ex(r.js[0]).glass_convert, 1.5), 'Regice, 1 Colorless (half): 1.5, floored to 1 Glass', [r, ex(r.js[0]).glass_convert]);
  r = blind('REGI6e', ['j_poke_regice'], (js) => { increment_energy(js[0], 'Colorless'); increment_energy(js[0], 'Colorless'); });
  ok(r.glass === 2, 'Regice, 2 Colorless: 2 Glass', r);
  // Energy never adds a convert field to the other two
  ok(ex(rock).glass_convert === undefined && ex(steel).glass_convert === undefined, 'Regirock / Registeel have no glass_convert');
});

// ------------------------------------------------------------------- vanilla rules untouched without a Regi (Pokermon on)
sec('no regi', () => {
  start('REGI7');
  add('j_poke_rhyhorn');
  const [s] = hand(['S_A'], { center: 'm_stone' });
  const t = play([s]).total;
  ok(t.chips === 5 + 50 && s.ability.perma_bonus === 12, 'Rhyhorn alone: Stone +50 (and its own +12)', [t, s.ability.perma_bonus]);
});

done();
