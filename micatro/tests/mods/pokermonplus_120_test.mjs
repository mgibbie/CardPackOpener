// Pokermon+ 1.2.0-261018a (Plans/MICATRO_MODS_UPGRADES.md batch 20; micatro/mods/pokermonplus/PORTING.md): every new and
// reworked effect FIRED through real plays, the decks / sleeves / stake reworks, the legacy definitions of the 7 jokers 1.2.0
// dropped (an old recipe holding them still loads and replays), Pokermon precedence and the version pin.
//   node micatro/tests/mods/pokermonplus_120_test.mjs
import { T, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { create_card, create_playing_card } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS, centerActive } from '../../js/mods/registry.js';
import { modBacks } from '../../js/mods/index.js';
import { allSleeves } from '../../js/engine/sleeve.js';
import { allChallenges } from '../../js/engine/challenge.js';
import { SUPERSEDED } from '../../js/mods/superseded.js';
import * as PINS from '../../js/mods/pins.js';
import '../../mods/pokermonplus/index.js';
import * as P from '../../mods/pokermon/api.js';
import { Tag as TagCls } from '../../js/engine/tag.js';
import { describe } from '../../js/engine/describe.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-6;
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
function start(seed = 'P120', { plus = {}, poke = {}, back = 'b_red', stake = 1, sleeve = null, noBlind = false } = {}) {
  newRun({ seed, back, stake, sleeve, mods: ['pokermon', 'pokermonplus'], modOptions: { pokermon: poke, pokermonplus: plus } });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, targets: [], joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };
const toShop = () => { if (G.STATE === STATES.SELECTING_HAND) winRound(); flush(); if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); flush(); };
const toBoss = () => { let g = 0; while (!G.GAME.blind.boss && g++ < 5) nextRound(); };
/** A played card back into the hand (played cards go to the discard pile). */
const rehand = (...cards) => { for (const c of cards) { if (c.area && c.area !== G.hand) c.area.remove_card(c); if (!G.hand.cards.includes(c)) G.hand.emplace(c); } return cards; };
const destroy = (cards) => { const h = add('c_hanged_man'); act({ type: 'use', id: h.sort_id, targets: cards.map((c) => c.sort_id) }); flush(); };

const NEW12 = ['heatran', 'mega_darkrai', 'helioptile', 'heliolisk', 'minior', 'duraludon', 'archaludon', 'shroodle', 'grafaiai', 'canari_plush', 'member_card', 'mystery_box'];
const DROPPED7 = ['nincada', 'ninjask', 'shedinja', 'croagunk', 'toxicroak', 'vullaby', 'mandibuzz'];

// ============================================================================ registry, pin, legacy, precedence
sec('registry', () => {
  start('REG', { noBlind: true });
  const m = MODS.pokermonplus;
  ok(m.version === '1.2.0-261018a' && m.contentRev === 2 && PINS.modPin('pokermonplus') === '1.2.0-261018a+r2', 'version 1.2.0-261018a, contentRev 2 (pin 1.2.0-261018a+r2)', PINS.modPin('pokermonplus'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermonplus === '1.0.3-251101e', 'LEGACY_MOD_VERSIONS untouched (1.0.3-251101e)');
  for (const n of NEW12) ok(P_CENTERS['j_sonfive_' + n] && P_CENTERS['j_sonfive_' + n].mod === 'pokermonplus' && centerActive(P_CENTERS['j_sonfive_' + n]), 'new joker registered: ' + n);
  for (const n of DROPPED7) {
    const c = P_CENTERS['j_sonfive_' + n];
    ok(c && c.sonfive_legacy === '1.0.3-251101e' && c.legacy && !c.in_pool(c), 'dropped joker kept as a legacy definition, never in a pool: ' + n);
  }
  let leaked = 0;
  for (let i = 0; i < 400; i++) { const k = P.get_random_poke_key('leg' + i); if (DROPPED7.some((n) => k === 'j_sonfive_' + n)) leaked++; }
  ok(leaked === 0, 'random Pokémon (Poké Balls...) never give a legacy joker', leaked);
  // the 1.2.0 jokers' art: real 3.9.1 sheet cells, or Pokermon+'s own `other` sheet (other-120.png)
  ok(P_CENTERS.j_sonfive_heatran.atlas === 'poke_AtlasJokersBasicNatdex391' && P_CENTERS.j_sonfive_heatran.pos.x === 8 && P_CENTERS.j_sonfive_heatran.pos.y === 32, 'heatran: Natdex 3.9.1 {8,32}');
  ok(P_CENTERS.j_sonfive_minior.atlas === 'poke_AtlasJokersBasicGen07391' && P_CENTERS.j_sonfive_minior.soul_pos.x === 7, 'minior: Gen 7 sheet, shell soul {7,3}');
  ok(['mega_darkrai', 'canari_plush', 'member_card', 'mystery_box'].every((n) => P_CENTERS['j_sonfive_' + n].atlas === 'sonfive_other'), 'own-sheet jokers on sonfive_other');
  ok(m.content.atlases.sonfive_other.src.endsWith('/other-120.png') && m.content.atlases.sonfive_backs.src.endsWith('/backs-120.png') && m.content.atlases.sonfive_stickers.src.endsWith('/stickers-120.png'), 'the 1.2.0 sheets vendored as *-120.png');
  ok(P_CENTERS.j_sonfive_lechonk.rarity === 2 && P_CENTERS.j_sonfive_nacli.stage === 'Basic' && P_CENTERS.j_sonfive_stonjourner.perishable_compat === false && P_CENTERS.j_sonfive_cetoddle.perishable_compat === false, '1.2.0 data: Lechonk Uncommon, Nacli Basic, Stonjourner / Cetoddle not Perishable');
  ok(JSON.stringify(P_CENTERS.j_sonfive_darkrai.megas) === '["mega_darkrai"]', 'darkrai lists its Mega');
  // decks / sleeves / challenges
  const backs = modBacks(['pokermon', 'pokermonplus']).filter((c) => c.mod === 'pokermonplus').map((c) => c.key);
  ok(JSON.stringify(backs.sort()) === JSON.stringify(['b_sonfive_pearlescentdeck', 'b_sonfive_roguedeck', 'b_sonfive_shinydeck', 'b_sonfive_virtuousdeck', 'b_sonfive_voiddeck']), 'New Run decks: the 1.2.0 five (Pearlescent in, Prophetic out)', backs);
  ok(P_CENTERS.b_sonfive_propheticdeck && P_CENTERS.b_sonfive_propheticdeck.legacy, 'Prophetic deck: still registered (legacy)');
  const sl = allSleeves().filter((s) => s.mod === 'pokermonplus');
  ok(sl.length === 5 && sl.filter((s) => !s.legacy).length === 4 && sl.find((s) => s.legacy).key === 'sleeve_sonfive_propheticsleeve', 'sleeves: 4 listed + the legacy Prophetic Sleeve');
  const ch = allChallenges().filter((c) => c.mod === 'pokermonplus').map((c) => c.id);
  ok(ch.length === 4 && ch.includes('c_sonfive_wonder_guard') && ch.includes('c_sonfive_metallurgy'), 'challenges: the 3 of 1.2.0 + Wonder Guard (kept)', ch);
  const met = allChallenges().find((c) => c.id === 'c_sonfive_metallurgy');
  ok(met.rules.custom.length === 0, 'Metallurgy: 1.2.0\'s placeholder rule {id = "no"} not ported');
  // options
  const o = m.options;
  for (const k of ['heatran', 'helioptile', 'minior', 'duraludon', 'shroodle', 'canari_plush', 'key_items']) ok(o[k] && o[k].default === true && !(o[k].hidden && o[k].hidden()), 'option ' + k + ' (on, listed)');
  ok(o.nincada.hidden() && o.croagunk.hidden() && o.vullaby.hidden(), 'Nincada (dedupe) / Croagunk / Vullaby (legacy) options hidden');
});
sec('precedence', () => {
  for (const n of NEW12.concat(['darkrai', 'meltan', 'melmetal', 'stonjourner', 'lechonk', 'oinkologne', 'nacli', 'naclstack', 'garganacl', 'cetoddle', 'cetitan'])) {
    ok(!P.replaced_by('j_sonfive_' + n) && !P_CENTERS['j_poke_' + n], 'precedence: no Pokermon joker named ' + n + ' (added)');
  }
  ok(['nincada', 'ninjask', 'shedinja'].every((n) => P.replaced_by('j_sonfive_' + n) === 'j_poke_' + n), 'the legacy Nincada line stays superseded by Pokermon\'s');
  ok(Object.keys(SUPERSEDED).length === 12, 'superseded.js: still the 12 duplicates');
});

// ============================================================================ Heatran
sec('heatran', () => {
  start('HEAT');
  add('j_sonfive_heatran');
  const [glass] = hand(['S_A'], { center: 'm_glass' });
  G.GAME.probabilities.normal = 0; // the glass never breaks
  const r1 = play([glass]);
  ok(near(r1.total.mult, 1 * 2) && key(glass) === 'c_base' && glass.ability.perma_x_mult === 1 && glass.ability.sonfive_heatran, 'heatran: a scored Glass card scores, then is forged: base card, permanent +X1 (Forged sticker)', [r1.total.mult, key(glass), glass.ability.perma_x_mult]);
  G.GAME.probabilities.normal = 1;
  act({ type: 'sell', id: G.jokers.cards[0].sort_id }); flush();
  clearHand(); rehand(glass);
  const r2 = play([glass]);
  ok(near(r2.total.mult, 2), 'heatran: the forged card keeps X2 (perma_x_mult 1) without Heatran', r2.total.mult);
  add('j_sonfive_heatran');
  clearHand();
  const [gs] = hand(['H_K']); gs.set_seal('Gold', true);
  const d0 = G.GAME.dollars;
  play([gs]);
  ok(gs.seal == null && gs.ability.perma_p_dollars === 3 && G.GAME.dollars === d0 + 3, 'heatran: a Gold Seal -> +$3 permanently when scored (and paid this hand)', [gs.seal, gs.ability.perma_p_dollars, G.GAME.dollars - d0]);
  const d1 = G.GAME.dollars; clearHand(); play(rehand(gs));
  ok(G.GAME.dollars === d1 + 3, 'heatran: the forged Gold Seal keeps paying $3', G.GAME.dollars - d1);
  clearHand();
  const [rs] = hand(['D_9']); rs.set_seal('Red', true);
  play([rs]);
  clearHand(); const r3 = play(rehand(rs));
  ok(rs.ability.perma_repetitions === 1 && r3.total.chips === 5 + 9 * 2, 'heatran: a Red Seal -> a permanent retrigger', [rs.ability.perma_repetitions, r3.total]);
  clearHand();
  const [st] = hand(['C_7'], { center: 'm_steel' });
  play([st]);
  ok(near(st.ability.perma_h_x_mult, 0.5) && key(st) === 'c_base', 'heatran: Steel -> held X0.5 more (perma_h_x_mult)');
  clearHand(); rehand(st);
  const r4 = play(hand(['S_2']));
  ok(near(r4.total.mult, 1.5), 'heatran: the forged Steel card held gives X1.5 (Steamodded multiplicative stacking)', r4.total.mult);
  clearHand();
  const [fo] = hand(['S_5']); fo.set_edition({ foil: true }, true, true);
  const [bo] = hand(['H_5'], { center: 'm_bonus' });
  play([fo, bo]);
  clearHand(); rehand(fo, bo);
  ok(fo.ability.perma_bonus === 50 && !fo.edition && bo.ability.perma_bonus === 30 && key(bo) === 'c_base', 'heatran: Foil -> +50 Chips, Bonus -> +30 Chips, both stripped', [fo.ability.perma_bonus, bo.ability.perma_bonus]);
  const r5 = play([fo, bo]);
  ok(r5.total.chips === 10 + 5 + 50 + 5 + 30, 'heatran: the forged pair scores its permanent chips', r5.total);
  const info = (describe(gs).info || []).find((x) => x.key === 'sonfive_heatran');
  ok(info && info.lines.some((l) => l.includes('+$3')) && describe(gs).badges.some((b) => b.key === 'sonfive_heatran'), 'heatran: the Forged badge + what the card keeps in its tooltip', info);
});

// ============================================================================ Darkrai / Mega Darkrai
sec('darkrai', () => {
  start('DARK');
  const b = add('j_poke_bulbasaur');
  const base = JSON.parse(JSON.stringify(b.ability.extra));
  const field = Object.keys(P.energy_values).find((f) => typeof base[f] === 'number' && typeof P_CENTERS.j_poke_bulbasaur.config.extra[f] === 'number');
  const step = P_CENTERS.j_poke_bulbasaur.config.extra[field] * P.energy_values[field];
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  const d = add('j_sonfive_darkrai');
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_nightmare'), 'darkrai: brings a Nightmare when it joins (1.2.0)');
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  add('c_poke_grass_energy');
  play(hand(['S_2']));
  ok(near(b.ability.extra[field], base[field] + step) && !b.ability.extra.energy_count && b.ability.extra.darkrai_ecount === 1, 'darkrai: a held Grass Energy energizes the Grass joker (no Energy count)', [b.ability.extra[field], base[field] + step]);
  add('c_poke_grass_energy'); play(hand(['S_2']));
  ok(near(b.ability.extra[field], base[field] + 2 * step), 'darkrai: two held = 2x, synced not stacked');
  const h = add('j_hiker'); P.apply_type_sticker(h, 'Grass');
  play(hand(['S_2']));
  ok(near(h.ability.extra, 5 + 5 * 0.2 * 2) && h.ability.sonfive_darkrai_ecount === 2, 'darkrai: a base-game (number extra) joker of the type works', [h.ability.extra, h.ability.sonfive_darkrai_ecount]);
  toBoss(); for (const c of G.consumeables.cards.slice()) if (key(c) === 'c_poke_nightmare') { G.consumeables.remove_card(c); c.remove(); }
  winRound(); flush();
  ok(!G.consumeables.cards.some((c) => key(c) === 'c_poke_nightmare'), 'darkrai: no Nightmare after the Boss any more (1.0.3)');
  act({ type: 'sell', id: d.sort_id }); flush();
  ok(near(b.ability.extra[field], base[field]) && near(h.ability.extra, 5), 'darkrai: selling it takes the Energy back', [b.ability.extra[field], h.ability.extra]);
});
sec('mega darkrai', () => {
  start('MDARK');
  const d = add('j_sonfive_darkrai');
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  const st = add('c_poke_megastone');
  useOn(st, d);
  ok(key(d) === 'j_sonfive_mega_darkrai', 'a Mega Stone on Darkrai -> Mega Darkrai', key(d));
  add('j_poke_bulbasaur'); add('j_poke_oddish');
  add('c_poke_grass_energy');
  const r = play(hand(['S_2']));
  ok(near(r.total.mult, 1 * 2), 'mega darkrai: a held Grass Energy gives X1 per Grass joker (2 -> X2)', r.total.mult);
  add('c_poke_fire_energy');
  const r2 = play(hand(['S_2']));
  ok(near(r2.total.mult, 2), 'mega darkrai: an Energy of a type you have 0-1 of gives nothing (X must be > 1)', r2.total.mult);
});

// ============================================================================ Helioptile / Heliolisk
sec('helioptile', () => {
  start('HELIO');
  const h = add('j_sonfive_helioptile');
  ok(P_CENTERS.j_sonfive_helioptile.enhancement_gate === 'm_wild', 'helioptile: gated on a Wild card');
  const d0 = G.GAME.dollars;
  play(hand(['S_A'], { center: 'm_wild' }));
  const got = G.GAME.dollars - d0;
  ok(got === 1 || got === 2, 'helioptile: a scored Wild card earns $1 (1 in 4: $2)', got);
  G.GAME.probabilities.normal = 4;
  const d1 = G.GAME.dollars; play(hand(['S_A', 'H_A'], { center: 'm_wild' }));
  ok(G.GAME.dollars - d1 === 4, 'helioptile: the lucky roll = $2 each', G.GAME.dollars - d1);
  G.GAME.probabilities.normal = 1;
  const d2 = G.GAME.dollars; play(hand(['S_K']));
  ok(G.GAME.dollars === d2, 'helioptile: a plain card earns nothing');
  const sun = add('c_poke_sunstone'); useOn(sun, h); winRound(); flush();
  ok(key(h) === 'j_sonfive_heliolisk', 'helioptile -> heliolisk with a Sun Stone', key(h));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.probabilities.normal = 4;
  const d3 = G.GAME.dollars; play(hand(['S_A', 'H_A'], { center: 'm_wild' }));
  ok(G.GAME.dollars - d3 === 2 + 3 && h.ability.extra.money_mod === 4, 'heliolisk: $2 then $3 (each Wild raises it by $1 after paying)', [G.GAME.dollars - d3, h.ability.extra.money_mod]);
  G.GAME.probabilities.normal = 1;
  winRound(); flush();
  ok(h.ability.extra.money_mod === 2, 'heliolisk: back to $2 at end of round', h.ability.extra.money_mod);
});

// ============================================================================ Minior
sec('minior', () => {
  start('MINIOR');
  const m = add('j_sonfive_minior');
  m.ability.extra.form = 'mult';
  ok(m.ability.extra.shields && !m.ability.extra.revealed, 'minior: starts with its shields up');
  const [stone] = hand(['S_9'], { center: 'm_stone' });
  const r1 = play([stone]);
  ok(near(r1.total.mult, 1.25) && r1.total.chips === 5 + 50, 'minior: X1.25, the Stone card is only Stone', r1.total);
  play(hand(['S_2']));
  ok(m.ability.extra.hand_played === 2 && m.ability.extra.shields, 'minior: 2 hands played');
  clearHand(); const r3 = play(rehand(stone));
  ok(!m.ability.extra.shields && m.ability.extra.revealed, 'minior: shields down after 2 hands (the Core shows)');
  ok(near(r3.total.mult, 1 + 4) && r3.total.chips === 5 + 50, 'minior: no more X Mult; a Stone card is also a Mult card (+4)', r3.total);
  const v = (await_view(m));
  ok(v && v.soul_pos && v.soul_pos.x === 9 && v.soul_pos.y === 3, 'minior: the Red Core floats over the card (Gen 7 {9,3})', v && v.soul_pos);
  const d = m.config.center.loc_vars(m.config.center, [], m);
  ok(d.key === 'j_sonfive_minior_mult' && d.vars[0] === 'Mult', 'minior: its Core\'s text', d);
  toShop();
  ok(m.ability.extra.shields && m.ability.extra.hand_played === 0, 'minior: shields back up at the cash out');
  start('MINIOR2', { noBlind: true });
  const forms = new Set(); for (let i = 0; i < 40; i++) { G.GAME.pseudorandom.seed = 'MIN' + i; forms.add(add('j_sonfive_minior').ability.extra.form); }
  ok([...forms].every((f) => ['bonus', 'mult', 'wild', 'glass', 'steel', 'gold', 'lucky'].includes(f)) && forms.size >= 4, 'minior: its Core is a random enhancement', [...forms]);
});
function await_view(card) { const v = {}; MODS.pokermonplus.hooks.view_card(card, v); return v; }

// ============================================================================ Duraludon / Archaludon
sec('duraludon', () => {
  start('DURA');
  const d = add('j_sonfive_duraludon');
  const r1 = play(hand(['S_2']));
  const r2 = play(hand(['S_2']));
  const r3 = play(hand(['S_2']));
  ok(near(r1.total.mult, 1) && near(r2.total.mult, 2) && near(r3.total.mult, 1), 'duraludon: X2 every 2nd hand', [r1.total.mult, r2.total.mult, r3.total.mult]);
  P.apply_type_sticker(d, 'Metal'); winRound(); flush();
  ok(key(d) === 'j_sonfive_archaludon', 'duraludon -> archaludon with a Metal Tera sticker', key(d));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  d.ability.extra.hands_played = 0;
  add('j_poke_pikachu');
  const a1 = play(hand(['S_2']));
  ok(near(a1.total.mult, 1) && near(d.ability.extra.Xmult, 1 + 2 * 0.5), 'archaludon: charging hand: +X0.5 + X0.5 per Lightning joker', [a1.total.mult, d.ability.extra.Xmult]);
  const a2 = play(hand(['S_2']));
  ok(near(a2.total.mult, 2), 'archaludon: the next hand scores X2', a2.total.mult);
  winRound(); flush();
  ok(near(d.ability.extra.Xmult, 1), 'archaludon: resets to X1 at end of round', d.ability.extra.Xmult);
});

// ============================================================================ Lechonk / Oinkologne
sec('lechonk', () => {
  start('PIG');
  const l = add('j_sonfive_lechonk');
  G.GAME.dollars = 23;
  const ev0 = l.ability.extra_value || 0;
  winRound(); flush();
  ok(near(l.ability.extra_value, ev0 + 4) && l.ability.extra.rounds === 4, 'lechonk: end of round: +$4 (the interest on $23) to its sell value, 1 round counted', [l.ability.extra_value, l.ability.extra.rounds]);
  const rows = (G.GAME.round_eval && G.GAME.round_eval.rows) || [];
  ok(!rows.some((r) => r.name === 'interest'), 'lechonk: no interest at the cash out while it is held', rows.map((r) => r.name));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  l.ability.extra.rounds = 1; G.GAME.dollars = 10; winRound(); flush();
  ok(key(l) === 'j_sonfive_oinkologne', 'lechonk -> oinkologne after 5 rounds', key(l));
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.dollars = 10; const ev1 = l.ability.extra_value; winRound(); flush();
  ok(near(l.ability.extra_value, ev1 + 4), 'oinkologne: double the interest ($2 on $10 -> +$4)', [ev1, l.ability.extra_value]);
  act({ type: 'cash_out' }); act({ type: 'sell', id: l.sort_id }); flush(); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  G.GAME.dollars = 10; winRound(); flush();
  ok(G.GAME.round_eval.rows.some((r) => r.name === 'interest'), 'interest is back once it is gone');
});

// ============================================================================ Shroodle / Grafaiai
sec('shroodle', () => {
  start('SHROOD');
  const s = add('j_sonfive_shroodle');
  const types = s.ability.extra.targets.map((t) => t.type);
  ok(types.length === 3 && new Set(types).size === 3, 'shroodle: a Nature of 3 different types', types);
  const n0 = G.GAME.tags.length;
  toBoss(); winRound(); flush();
  ok(G.GAME.tags.length === n0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key !== 'tag_boss', 'shroodle: a random tag when the Boss is beaten', G.GAME.tags.map((t) => t.key));
  G.GAME.tags.length = 0; // (the random tag may be one that opens a pack: out of the way)
  const t = new (P.Tag || TagCls)('tag_economy');
  G.GAME.tags.push(t);
  t.apply_to_run({ type: 'immediate' }); flush();
  ok(s.ability.extra.count >= 1 && G.GAME.last_tag === 'tag_economy', 'shroodle: a triggered tag counts (tag_triggered); G.GAME.last_tag', [s.ability.extra.count, G.GAME.last_tag]);
  s.ability.extra.count = 3;
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); winRound(); flush();
  ok(key(s) === 'j_sonfive_grafaiai', 'shroodle -> grafaiai after 3 tags', key(s));
  s.ability.extra.targets = [{ type: 'Fire' }, { type: 'Water' }, { type: 'Grass' }];
  const char = add('j_poke_charmander');
  ok(P.is_type(char, 'Water') && P.is_type(char, 'Grass') && !P.is_type(char, 'Dark'), 'grafaiai: a Fire joker also counts as Water and Grass (its Nature)');
  ok(P.find_pokemon_type('Water').includes(char), 'grafaiai: find_pokemon_type sees it too');
  const we = add('c_poke_water_energy');
  G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(char);
  ok(we.can_use_consumeable(), 'grafaiai: a Water Energy can go on the Fire joker');
  const sq = add('j_poke_pikachu');
  ok(!P.is_type(sq, 'Water'), 'grafaiai: a type outside its Nature does not');
  s.debuff = true;
  ok(!P.is_type(char, 'Water'), 'grafaiai: debuffed, no Nature');
  s.debuff = false;
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.last_tag = 'tag_economy'; G.GAME.tags.length = 0;
  toBoss(); const n1 = G.GAME.tags.length; winRound(); flush();
  ok(G.GAME.tags.length === n1 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_economy', 'grafaiai: the last tag used again when the Boss is beaten', G.GAME.tags.map((x) => x.key));
});

// ============================================================================ Canari Plush
sec('canari', () => {
  start('CANARI');
  const c = add('j_sonfive_canari_plush');
  const d0 = G.GAME.round_resets.discards, cs0 = G.consumeables.config.card_limit;
  for (let i = 0; i < 3; i++) { clearHand(); const [x] = hand(['S_' + (i + 2)]); x.set_seal('Red', true); destroy([x]); }
  ok(G.GAME.round_resets.discards === d0 + 1 && c.ability.extra.red_current === 1 && c.ability.extra.red === 0, 'canari plush: 3 Red Seal cards destroyed -> +1 discard (level 1)', [G.GAME.round_resets.discards - d0, c.ability.extra]);
  for (let i = 0; i < 3; i++) { clearHand(); const [x] = hand(['H_' + (i + 2)]); x.set_seal('poke_silver', true); destroy([x]); }
  ok(G.consumeables.config.card_limit === cs0 + 1 && c.ability.extra.silver_current === 1, 'canari plush: 3 Silver Seal cards -> +1 consumable slot');
  c.set_debuff(true); flush();
  const dd = G.GAME.round_resets.discards;
  c.set_debuff(false); flush();
  ok(dd === d0 && G.GAME.round_resets.discards === d0 + 1 && G.consumeables.config.card_limit === cs0 + 1, 'fix: a debuff suspends its bonuses and they come back with the card (the Lua lost them for good)', [dd - d0, G.GAME.round_resets.discards - d0]);
  act({ type: 'sell', id: c.sort_id }); flush();
  ok(G.GAME.round_resets.discards === d0 && G.consumeables.config.card_limit === cs0, 'fix: selling it takes every level back — the consumable slots too (the Lua took back level(count since the last level) = 0)', [G.GAME.round_resets.discards - d0, G.consumeables.config.card_limit - cs0]);
});

// ============================================================================ Member Card / Mystery Box
sec('member card', () => {
  start('MEMBER');
  const m = add('j_sonfive_member_card');
  for (const t of ['grass', 'fire', 'water']) { const b = add('j_poke_' + ({ grass: 'bulbasaur', fire: 'charmander', water: 'squirtle' })[t]); useOn(add('c_poke_' + t + '_energy'), b); }
  ok(Object.keys(m.ability.extra.energy_used).length === 3, 'fix: member card counts the different Energy cards used (the Lua compared ability.name to the key: never counted)', m.ability.extra.energy_used);
  for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  act({ type: 'sell', id: m.sort_id }); flush();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_obituary'), 'member card: 3 -> an Obituary when sold');
  const m2 = add('j_sonfive_member_card');
  for (const t of ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Colorless', 'Dark', 'Metal', 'Fairy', 'Dragon', 'Earth']) m2.ability.extra.energy_used[t] = true;
  act({ type: 'sell', id: m2.sort_id }); flush();
  ok(G.jokers.cards.some((c) => key(c) === 'j_sonfive_darkrai'), 'member card: 12 -> Darkrai');
  const ep = G.GAME.energy_plus || 0; const m3 = add('j_sonfive_member_card');
  for (const t of ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting']) m3.ability.extra.energy_used[t] = true;
  act({ type: 'sell', id: m3.sort_id }); flush();
  ok((G.GAME.energy_plus || 0) === ep + 1, 'member card: 6 -> +1 Energy limit');
});
sec('mystery box', () => {
  start('MBOX');
  const b = add('j_sonfive_mystery_box');
  for (let i = 0; i < 5; i++) { const m = add('j_poke_aron'); act({ type: 'sell', id: m.sort_id }); flush(); }
  const nb = add('j_joker'); act({ type: 'sell', id: nb.sort_id }); flush();
  ok(b.ability.extra.count === 5, 'mystery box: counts the Metal jokers sold (not others)', b.ability.extra.count);
  act({ type: 'sell', id: b.sort_id }); flush();
  const got = G.jokers.cards[G.jokers.cards.length - 1];
  ok(got && P.is_type(got, 'Metal') && got.config.center.stage === 'Basic' && !(got.edition && got.edition.negative), 'mystery box: 5 -> a Basic Metal joker', got && key(got));
  const b2 = add('j_sonfive_mystery_box'); b2.ability.extra.count = 10;
  act({ type: 'sell', id: b2.sort_id }); flush();
  const got2 = G.jokers.cards[G.jokers.cards.length - 1];
  ok(got2 && got2.edition && got2.edition.negative && P.is_type(got2, 'Metal'), 'mystery box: 10 -> a Negative one', got2 && key(got2));
  const b3 = add('j_sonfive_mystery_box'); b3.ability.extra.count = 20;
  act({ type: 'sell', id: b3.sort_id }); flush();
  ok(G.jokers.cards.some((c) => key(c) === 'j_sonfive_meltan'), 'mystery box: 20 -> Meltan');
  start('MBOX2', { plus: { meltan: false }, noBlind: true });
  ok(!P_CENTERS.j_sonfive_mystery_box.in_pool(P_CENTERS.j_sonfive_mystery_box) && P_CENTERS.j_sonfive_member_card.in_pool(P_CENTERS.j_sonfive_member_card), 'key items: the Mystery Box follows the Meltan option, the Member Card the Darkrai one');
});

// ============================================================================ reworked: Melmetal, Nacli, Cetoddle, Timer Ball
sec('melmetal', () => {
  start('MELM');
  add('j_sonfive_melmetal');
  hand(['S_K'], { center: 'm_steel' });
  const r = play(hand(['S_2']));
  ok(near(r.total.mult, 1.5 ** 2), 'melmetal: 1 + floor(Metal Energy + Metal jokers / 2) = 1 retrigger (itself: 1/2)', r.total.mult);
  add('c_poke_metal_energy'); add('j_poke_magnemite');
  const r2 = play(hand(['S_2']));
  ok(near(r2.total.mult, 1.5 ** 3), 'melmetal: 1 Metal Energy + 2 Metal jokers -> 2 retriggers', r2.total.mult);
});
sec('nacli', () => {
  start('SALT');
  const n = add('j_sonfive_nacli');
  add('j_poke_squirtle'); // Water: 1 in 1
  nextRound(); flush();
  ok(!G.jokers.cards.some((c) => key(c) === 'j_poke_squirtle') && near(n.ability.extra.Xmult, 1.2), 'nacli: Salt Cure (SMODS.scale_card) +X0.2, the Water joker destroyed', n.ability.extra.Xmult);
  for (let i = 0; i < 4; i++) n.ability.extra.Xmult = n.ability.extra.Xmult + 0.2;
  ok(n.ability.extra.Xmult < 2, 'float drift: five +X0.2 land just under 2', n.ability.extra.Xmult);
  winRound(); flush();
  ok(key(n) === 'j_sonfive_naclstack', 'nacli evolves at X2 - 0.00001 (1.2.0)', key(n));
});
sec('cetoddle', () => {
  start('ICE');
  const c = add('j_sonfive_cetoddle');
  const g = hand(['S_A'], { center: 'm_glass' });
  G.GAME.probabilities.normal = 4;
  play(g); flush();
  G.GAME.probabilities.normal = 1;
  ok(near(c.ability.extra.Xmult, 1.25), 'cetoddle: +X0.25 per shattered Glass card (scale_card)', c.ability.extra.Xmult);
});
sec('timer ball', () => {
  start('TIMER', { poke: { pokemon_only: false } });
  let vanilla = 0, poke = 0;
  for (let i = 0; i < 24; i++) {
    for (const j of G.jokers.cards.slice()) { G.jokers.remove_card(j); j.remove(); }
    const t = add('c_sonfive_timerball'); t.ability.extra.count = 2;
    act({ type: 'use', id: t.sort_id }); flush();
    const j = G.jokers.cards[0];
    ok(j && j.config.center.rarity === 1, 'timer ball: 1 round -> a Common joker', j && key(j));
    if (j && j.config.center.mod) poke++; else vanilla++;
  }
  ok(vanilla > 0 && poke > 0, '1.2.0 timer ball: ANY Common joker (base game ones too), not only Pokémon', [vanilla, poke]);
  const t2 = add('c_sonfive_timerball'); t2.ability.extra.count = 4; for (const j of G.jokers.cards.slice()) { G.jokers.remove_card(j); j.remove(); }
  act({ type: 'use', id: t2.sort_id }); flush();
  ok(G.jokers.cards[0].config.center.rarity === 2, 'timer ball: 3+ rounds -> Uncommon');
  const t3 = add('c_sonfive_timerball'); t3.ability.extra.count = 20; for (const j of G.jokers.cards.slice()) { G.jokers.remove_card(j); j.remove(); }
  act({ type: 'use', id: t3.sort_id }); flush();
  ok(G.jokers.cards[0].config.center.rarity === 4, 'timer ball: 15+ -> Legendary', key(G.jokers.cards[0]));
});

// ============================================================================ decks
sec('shiny deck', () => {
  start('SHINY', { back: 'b_sonfive_shinydeck' });
  ok((G.GAME.modifiers.extra_boosters || 0) === -1 && !G.GAME.shiny_edition_rate, 'Shiny deck (1.2.0): -1 Booster slot, the shiny rate untouched', [G.GAME.modifiers.extra_boosters, G.GAME.shiny_edition_rate]);
  winRound(); flush();
  ok(G.GAME.tags.some((t) => t.key === 'tag_poke_shiny_tag'), 'Shiny deck: a Shiny Tag after the Small Blind (used by the next shop)', G.GAME.tags.map((t) => t.key));
  act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); toBoss();
  const n = G.GAME.tags.filter((t) => t.key === 'tag_poke_shiny_tag').length;
  winRound(); flush();
  ok(G.GAME.tags.filter((t) => t.key === 'tag_poke_shiny_tag').length === n, 'Shiny deck: none after the Boss Blind');
  start('SHINYSL', { back: 'b_sonfive_shinydeck', sleeve: 'sleeve_sonfive_shinysleeve', noBlind: true });
  ok(G.GAME.shiny_edition_rate === 100, 'Shiny Sleeve on the Shiny deck: shiny x100 (the deck no longer sets it)', G.GAME.shiny_edition_rate);
});
sec('void deck', () => {
  start('VOID', { back: 'b_sonfive_voiddeck' });
  ok(G.GAME.modifiers.void, 'Void: modifier on');
  toBoss(); for (const c of G.consumeables.cards.slice()) { G.consumeables.remove_card(c); c.remove(); }
  winRound(); flush();
  ok(!G.consumeables.cards.some((c) => key(c) === 'c_poke_nightmare'), 'Void (1.2.0): no Nightmare after the Boss any more');
  act({ type: 'cash_out' }); flush();
  G.GAME.probabilities.normal = 15; G.GAME.dollars = 100;
  act({ type: 'reroll_shop' }); flush();
  ok(G.shop_jokers.cards.some((c) => key(c) === 'c_poke_nightmare'), 'Void: a reroll can add a Nightmare to the shop (1 in 15)', G.shop_jokers.cards.map(key));
  G.GAME.probabilities.normal = 1;
  let hits = 0; for (let i = 0; i < 60; i++) { G.GAME.dollars = 100; const before = G.shop_jokers.cards.filter((c) => key(c) === 'c_poke_nightmare').length; act({ type: 'reroll_shop' }); flush(); if (G.shop_jokers.cards.filter((c) => key(c) === 'c_poke_nightmare').length > 0 && before === 0) hits++; }
  ok(hits > 0 && hits < 20, 'Void: about 1 reroll in 15', hits);
  start('NEG', { back: 'b_sonfive_voiddeck' });
  const b = add('j_poke_bulbasaur');
  for (let i = 0; i < 3; i++) useOn(add('c_poke_grass_energy'), b);
  const g4 = add('c_poke_grass_energy'); G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(b);
  ok(P.get_total_energy(b) === 3 && !g4.can_use_consumeable(), 'void: normal Energy capped at 3');
  act({ type: 'sell', id: g4.sort_id }); flush();
  const neg = add('c_poke_grass_energy', 'negative'); G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(b);
  ok(neg.can_use_consumeable(), 'void: a Negative Energy goes past the cap');
  useOn(neg, b);
  ok(P.get_total_energy(b) === 4 && b.ability.extra.e_limit_up === 1, 'void: +1 Energy and +1 to its limit (e_limit_up)', b.ability.extra);
  const iq = []; P.type_tooltip(null, iq, b);
  ok(iq[0] && iq[0].vars[1] === 4, 'void: the tooltip shows the raised limit', iq[0] && iq[0].vars);
  P.poke_evolve(b, 'j_poke_ivysaur', true); flush();
  ok(key(b) === 'j_poke_ivysaur' && b.ability.extra.e_limit_up === 1, 'void: e_limit_up kept through evolution');
  const c = add('j_poke_charmander');
  const neg2 = add('c_poke_grass_energy', 'negative'); G.jokers.highlighted.length = 0; G.jokers.add_to_highlighted(c);
  ok(!neg2.can_use_consumeable(), 'fix: a Negative Grass Energy does not go on a Fire joker (1.2.0 lifted the type check too)');
  start('VOIDSL', { sleeve: 'sleeve_sonfive_voidsleeve' });
  toShop(); G.GAME.probabilities.normal = 15; G.GAME.dollars = 100; act({ type: 'reroll_shop' }); flush(); G.GAME.probabilities.normal = 1;
  ok(G.GAME.modifiers.void && G.shop_jokers.cards.some((cc) => key(cc) === 'c_poke_nightmare'), 'Void Sleeve: the same reroll Nightmare');
});
sec('pearlescent deck', () => {
  start('PEARL', { back: 'b_sonfive_pearlescentdeck' });
  ok(G.GAME.modifiers.sonfive_pearlescent, 'Pearlescent: on once the run starts');
  const b = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_bulbasaur'); b.add_to_deck(); G.jokers.emplace(b);
  const base = P_CENTERS.j_poke_bulbasaur.config.extra;
  ok(P.get_total_energy(b) === -1 && b.ability.extra.e_limit_up === -1 && b.ability.extra.money_mod < base.money_mod, 'Pearlescent: a new joker has -1 Energy and -1 Energy limit', b.ability.extra);
  const j = create_card('Joker', G.jokers, null, null, null, null, 'j_joker'); j.add_to_deck(); G.jokers.emplace(j);
  ok(P.get_total_energy(j) === -1 && j.ability.sonfive_e_limit_up === -1, 'Pearlescent: a base-game joker too (the Lua crashed: no table extra)', [j.ability.mult, j.ability.c_energy_count, j.ability.energy_count]);
  winRound(); flush();
  const row = G.GAME.round_eval.rows.find((r) => r.name === 'custom');
  ok(row && row.dollars === 2, 'Pearlescent: $1 per de-energized joker at the cash out', G.GAME.round_eval.rows);
  useOn(add('c_poke_grass_energy'), b); flush();
  ok(P.get_total_energy(b) === 0, 'Pearlescent: an Energy brings it back to 0');
});
sec('lilac + weakened', () => {
  start('LILAC', { stake: 'stake_sonfive_lilac_stake', noBlind: true });
  ok(G.GAME.modifiers.enable_sonfive_weakened && !G.GAME.modifiers.enable_weakened_in_shop, 'Lilac: the 1.2.0 flag (enable_sonfive_weakened)');
  let weak = 0, ok1 = true;
  for (let i = 0; i < 200; i++) {
    G.GAME.round_resets.ante = 1 + (i % 8);
    const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie', 'sh' + i);
    if (c.ability.sonfive_weakened) {
      weak++;
      if (!(near(c.ability.extra.mult, 3 - 3 * 0.4) && c.ability.extra.energy_count === -1 && c.ability.extra.e_limit_up === -1)) ok1 = false;
    }
  }
  G.GAME.round_resets.ante = 1;
  ok(weak > 0 && weak < 200 && ok1, 'Weakened (1.2.0): -1 Energy (mult 3 -> 1.8) and -1 Energy limit', weak);
  const plain = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_joker');
  let anyVanilla = false; for (let i = 0; i < 100; i++) { const v = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_blueprint', 'bp' + i); if (v.ability.sonfive_weakened) anyVanilla = true; }
  ok(!anyVanilla, 'Weakened: a joker with nothing to de-energize (Blueprint) is never compatible');
  void plain;
  const w = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie');
  if (!w.ability.sonfive_weakened) { w.ability.sonfive_weakened = true; w.ability.extra.energy_count = -1; w.ability.extra.e_limit_up = -1; w.ability.extra.mult = 3 - 1.2; }
  w.add_to_deck(); G.shop_jokers.remove_card(w); G.jokers.emplace(w);
  P.poke_evolve(w, 'j_poke_metapod', true); flush();
  ok(near(w.ability.extra.mult, 6 - 6 * 0.4) && w.ability.extra.e_limit_up === -1, 'Weakened: the -1 Energy carries through evolution (metapod 6 -> 3.6)', w.ability.extra);
});

// ============================================================================ legacy: an old recipe with the dropped keys loads and replays
sec('legacy recipe', () => {
  const old = {
    v: 1, seed: 'LEGACY103', back: 'b_sonfive_propheticdeck', stake: 1, sleeve: 'sleeve_sonfive_propheticsleeve',
    mods: ['pokermon', 'pokermonplus'], modOptions: { pokermonplus: { croagunk: false, vullaby: false, nincada: false } },
    actions: [{ type: 'select_blind' }],
  };
  let s, err = null;
  try { s = Session.fromRecipe(old); } catch (e) { err = e; }
  ok(!err && s, 'an old recipe (Prophetic deck + sleeve, 1.0.3 options) loads', err && err.message);
  ok(G.GAME.selected_back_key === 'b_sonfive_propheticdeck' && G.GAME.selected_sleeve === 'sleeve_sonfive_propheticsleeve' && G.GAME.scry_amount >= 3, 'the legacy Prophetic deck / sleeve still play', [G.GAME.selected_back_key, G.GAME.selected_sleeve, G.GAME.scry_amount]);
  ok(G.STATE === STATES.SELECTING_HAND, 'its actions replay', G.STATE);
  const deck = {
    v: 1, seed: 'LEGACY103B', back: 'b_red', stake: 1, mods: ['pokermon', 'pokermonplus'],
    customDeck: { name: 'old', back: 'b_red', jokers: DROPPED7.map((n) => 'j_sonfive_' + n) },
    actions: [{ type: 'select_blind' }],
  };
  err = null; try { s = Session.fromRecipe(deck); } catch (e) { err = e; }
  const keys = G.jokers.cards.map(key);
  ok(!err && DROPPED7.filter((n) => keys.includes('j_sonfive_' + n)).length >= 5, 'a custom deck holding the dropped jokers loads; they resolve and are in play', [err && err.message, keys]);
  start('LEGPLAY');
  const croak = add('j_sonfive_croagunk');
  const r = play(hand(['S_2']));
  ok(r && r.total && croak.ability.extra.retriggers === 0, 'a legacy joker (Croagunk) still plays its 1.0.3 behaviour');
  newRun({ seed: 'WG', back: 'b_challenge', stake: 1, mods: ['pokermon', 'pokermonplus'], challenge: 'c_sonfive_wonder_guard' }); flush();
  ok(G.jokers.cards.some((c) => key(c) === 'j_sonfive_shedinja' && c.ability.eternal), 'Wonder Guard (dropped by 1.2.0, kept): starts with Pokermon+\'s eternal Shedinja');
});

done();
