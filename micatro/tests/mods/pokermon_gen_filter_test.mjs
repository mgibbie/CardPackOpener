// The Pokermon generation filter (r79; the owner's bug 2026-11-03: "the gen 4 starters come up even when gen 4 is off"):
// micatro/mods/pokermon/systems/pools.js GEN_FILTER_REV / GEN_FIXES / install_gen_filter, boosters/packs1.js starter lists.
//   - the inventory: EVERY registered Pokémon joker (Pokermon, its owner designs, Nacho's Pokermon Dip, Pokermon+) carries the
//     National Dex generation of its species (regional forms and Megas: their base species'), checked against a dex -> gen table
//     over all 1025 species (fixtures/national_dex.json, from overworld/data/species_index.json); the exceptions are listed
//   - every source, FIRED with Gen 4 off and with only one generation on: the Starter Pack (and Starter Pack...?, the Professors'
//     lists), shop rolls + rerolls, Buffoon packs, Poké / Great / Ultra / Master / Timer Balls, The Soul, the attribute pools
//     (the Mystery Egg's hatch: SMODS.poll_object), Nacho's Ancient Pack, the Paradox Ball / packs (all 20 Paradox jokers are Gen 9)
//   - the filter survives a save / resume; a run recorded on r78 (fixtures/pokermon_genfilter_r78_recipe.json: Gen 4 off, its
//     Starter Pack offered Nacho's Turtwig and the player took it) replays as recorded
//   node micatro/tests/mods/pokermon_gen_filter_test.mjs
import { readFileSync } from 'fs';
import { T, G, P_CENTERS, act, STATES, add, clearHand, hand } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { get_current_pool, create_card } from '../../js/engine/core.js';
import { poll_object } from '../../js/engine/smods.js';
import { Session } from '../../js/engine/session.js';
import * as PINS from '../../js/mods/pins.js';
import { MODS } from '../../js/mods/registry.js';
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';
import { get_random_poke_key } from '../../mods/pokermon/api.js';
import { starter_lists, starterq_lists } from '../../mods/pokermon/boosters/packs1.js';
import { paradox_keys } from '../../mods/pokermon/paradox.js';
import { speciesOfJoker, genOf } from '../../../tools/micatro/pokermon_missing_jokers.mjs';

const { ok, done } = T();
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const key = (c) => c.config.center.key;
const MODS3 = ['pokermon', 'nacho', 'pokermonplus'];
const GEN_OPT = ['gen_oneb', 'gen_two', 'gen_three', 'gen_four', 'gen_five', 'gen_six', 'gen_seven', 'gen_eight', 'gen_nine'];
/** Pokermon options with exactly these generations on. */
const gens = (on) => Object.fromEntries(GEN_OPT.map((k, i) => [k, on.includes(i + 1)]));
const ALL_BUT_4 = [1, 2, 3, 5, 6, 7, 8, 9];
const DEX = JSON.parse(readFileSync(new URL('../fixtures/national_dex.json', import.meta.url), 'utf8')).species;
const isPoke = (c) => !!(c && c.set === 'Joker' && c.stage && c.stage !== 'Other');

/** Jokers with a Pokémon stage that are no National Dex species (joke / glitch cards): their gen as shipped. */
const NOT_A_SPECIES = {
  j_poke_shell: 1, // (Slowbro's Shellder, a Gen 1 card)
  j_poke_weird_tree: 2, // (Sudowoodo's disguise)
  j_poke_missingno: 1,
  j_poke_billion_lions: 9, j_poke_spiclops: undefined, j_poke_miror_budicolo: 3, // (April Fools: pokemon_aprilfools only)
};

// ------------------------------------------------------------------- the inventory
sec('inventory', () => {
  newRun({ seed: 'GFINV', back: 'b_red', mods: MODS3 });
  ok(MODS.pokermon.contentRev >= 79 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 79 or later', PINS.modPin('pokermon'));
  const dexes = new Set(Object.values(DEX));
  ok(dexes.size === 1025 && [...dexes].every((n) => n >= 1 && n <= 1025), 'the dex table covers all 1025 species', dexes.size);
  ok(genOf(1) === 1 && genOf(387) === 4 && genOf(493) === 4 && genOf(494) === 5 && genOf(1018) === 9 && genOf(1025) === 9, 'dex -> gen boundaries');
  const bad = [], seen = { pokermon: 0, nacho: 0, pokermonplus: 0 };
  for (const c of Object.values(P_CENTERS)) {
    if (!isPoke(c) || !MODS3.includes(c.mod)) continue;
    seen[c.mod]++;
    if (Object.prototype.hasOwnProperty.call(NOT_A_SPECIES, c.key)) {
      if (c.gen !== NOT_A_SPECIES[c.key]) bad.push(`${c.key}: gen ${c.gen}, listed ${NOT_A_SPECIES[c.key]}`);
      continue;
    }
    const dex = speciesOfJoker(c.name, DEX);
    if (!dex) { bad.push(`${c.key}: no species for "${c.name}" (add it to NOT_A_SPECIES if it is none)`); continue; }
    if (c.gen !== genOf(dex)) bad.push(`${c.key} (#${dex}): gen ${c.gen}, species gen ${genOf(dex)}`);
  }
  ok(bad.length === 0, 'every Pokémon joker carries its species\' generation', bad);
  ok(seen.pokermon > 950 && seen.nacho >= 80 && seen.pokermonplus >= 25, 'walked every mod\'s Pokémon', seen);
  // the rule on forms: a regional form / a Mega is its base species' generation
  const g = (k) => P_CENTERS[k] && P_CENTERS[k].gen;
  ok(g('j_nacho_galarian_meowth') === 1 && g('j_poke_hisuian_qwilfish') === 2 && g('j_poke_mega_lucario') === 4 && g('j_poke_mega_gallade') === 4 && g('j_poke_mega_skarmory') === 2,
    'forms: Galarian Meowth 1, Hisuian Qwilfish 2, Mega Lucario 4, Mega Gallade 4, Mega Skarmory 2', ['j_nacho_galarian_meowth', 'j_poke_hisuian_qwilfish', 'j_poke_mega_lucario', 'j_poke_mega_gallade', 'j_poke_mega_skarmory'].map(g));
  ok(['j_nacho_turtwig', 'j_nacho_chimchar', 'j_nacho_piplup'].every((k) => g(k) === 4), 'Nacho\'s Sinnoh starters are Gen 4');
  const px = paradox_keys(null);
  ok(px.length === 20 && px.every((k) => g(k) === 9), 'all 20 Paradox jokers are Gen 9', px.filter((k) => g(k) !== 9));
});

/** A drawn key breaks the filter when it is a Pokémon of a generation that is off. */
const offGen = (k, on) => { const c = P_CENTERS[k]; return isPoke(c) && !(c.gen && on.includes(c.gen)); };
const start = (seed, on, extra = {}) => {
  newRun({ seed, back: 'b_red', mods: MODS3, modOptions: { pokermon: gens(on) }, ...extra });
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  flush();
};
function toShop() {
  act({ type: 'select_blind' }); clearHand(); flush();
  const c = hand(['S_2']); G.GAME.chips = G.GAME.blind.chips;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' }); flush();
}
/** Open this booster from the shop; -> its card keys (then skipped). */
function openPack(pk) {
  G.GAME.dollars = 1000;
  const card = add_booster(pk);
  act({ type: 'buy', id: card.sort_id }); flush();
  const got = G.pack_cards ? G.pack_cards.cards.map(key) : [];
  if (G.pack_cards && G.pack_cards.cards.length) act({ type: 'skip_booster' }); flush();
  return got;
}
function add_booster(pk) { const p = create_card('Booster', G.shop_booster, null, null, null, null, pk); G.shop_booster.emplace(p); flush(); return p; }
/** Use a consumable (a Ball, The Soul) n times with room for what it makes; -> the joker keys made. */
function useN(ck, n) {
  const out = [];
  G.jokers.config.card_limit = 1000;
  for (let i = 0; i < n; i++) {
    const before = new Set(G.jokers.cards);
    const c = add(ck);
    act({ type: 'use', id: c.sort_id }); flush();
    for (const j of G.jokers.cards) if (!before.has(j)) out.push(key(j));
    // (hold nothing: the family / held rules would shrink the pool; each use starts from the same empty row)
    for (const j of G.jokers.cards.slice()) { j.remove_from_deck && j.remove_from_deck(); G.jokers.remove_card(j); }
  }
  return out;
}

/** Every source, fired; -> {source: [offending keys]} plus a count of what was made. */
function sweep(seed, on) {
  const bad = {}, made = {};
  const note = (src, keys) => { made[src] = (made[src] || 0) + keys.length; const b = keys.filter((k) => offGen(k, on)); if (b.length) bad[src] = [...new Set([...(bad[src] || []), ...b])]; };
  // the Starter Pack (from the Starter Tag) and the Starter Pack...?, opened at the first blind choice by a custom deck's tags
  for (let i = 0; i < 12; i++) {
    for (const tag of ['tag_poke_starter_tag', 'tag_poke_starterq_tag']) {
      start(seed + 'ST' + i, on, { customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: tag }] } });
      note(tag, G.pack_cards ? G.pack_cards.cards.map(key) : []);
    }
  }
  start(seed + 'L', on);
  for (const [n, L] of [['starter_lists', starter_lists()], ['starterq_lists', starterq_lists()]]) note(n, Object.values(L).flat());
  // the shop: its rolls + 40 rerolls, Buffoon packs, Nacho's Ancient Pack
  start(seed + 'SHOP', on); toShop();
  note('shop', G.shop_jokers.cards.map(key));
  for (let i = 0; i < 40; i++) { G.GAME.dollars = 1000; act({ type: 'reroll_shop' }); flush(); note('shop', G.shop_jokers.cards.map(key)); }
  for (let i = 0; i < 6; i++) { note('buffoon', openPack('p_buffoon_mega_1')); note('nacho ancient pack', openPack('p_nacho_ancient_pack')); }
  for (const r of [1, 2, 3]) note('pool rarity ' + r, get_current_pool('Joker', r)[0].filter((k) => k !== 'UNAVAILABLE'));
  note('pool legendary', get_current_pool('Joker', null, true)[0].filter((k) => k !== 'UNAVAILABLE'));
  // the attribute pools (the Mystery Egg's hatch: poll_object over stage_baby / stage_basic; Tall Grass: 'pokemon')
  for (let i = 0; i < 60; i++) {
    G.GAME.pseudorandom['gfatt' + i] = undefined;
    note('poll_object attributes', [poll_object({ attributes: ['stage_baby', 'stage_basic'], union: true, seed: 'gfatt' + i }), poll_object({ attributes: ['pokemon'], rarity: 1, seed: 'gfatt' + i })].filter(Boolean));
  }
  // get_random_poke_key (Transformation, Mystery Box, ...): every stage / type
  for (let i = 0; i < 30; i++) for (const st of [null, 'Basic', 'One', 'Two', 'Legendary', 'Baby']) note('get_random_poke_key', [get_random_poke_key('gfr' + i, st)]);
  for (const t of ['Grass', 'Fire', 'Water', 'Lightning', 'Dark', 'Metal']) note('get_random_poke_key', [get_random_poke_key('gft' + t, 'Basic', null, null, t)]);
  // the Balls and The Soul, used
  start(seed + 'BALL', on); act({ type: 'select_blind' }); flush();
  for (const b of ['c_poke_pokeball', 'c_poke_greatball', 'c_poke_ultraball', 'c_poke_masterball', 'c_sonfive_timerball']) note(b, useN(b, 8));
  note('c_soul', useN('c_soul', 12));
  if (on.includes(9)) { note('c_poke_paradoxball', useN('c_poke_paradoxball', 6)); note('paradox pack', openPackLater()); }
  return { bad, made };
}
function openPackLater() { start('GFPX', [9]); toShop(); return [...openPack('p_poke_pokepack_ancient_jumbo'), ...openPack('p_poke_pokepack_future_jumbo')]; }

sec('gen 4 off', () => {
  const { bad, made } = sweep('GF4', ALL_BUT_4);
  ok(Object.keys(bad).length === 0, 'Gen 4 off: no source makes a Gen 4 Pokémon', bad);
  ok(made.tag_poke_starter_tag >= 48 && made.shop >= 60 && made.c_poke_pokeball >= 8 && made.c_soul >= 1, 'each source made cards', made);
});
// the reported case: Nacho's Turtwig / Chimchar / Piplup never in a Starter Pack with Gen 4 off (many seeds)
sec('sinnoh starters', () => {
  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    start('GFSIN' + i, ALL_BUT_4, { customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: 'tag_poke_starter_tag' }] } });
    for (const c of G.pack_cards.cards) seen.add(key(c));
  }
  ok(!['j_nacho_turtwig', 'j_nacho_chimchar', 'j_nacho_piplup'].some((k) => seen.has(k)), 'Gen 4 off: 40 Starter Packs, never Turtwig / Chimchar / Piplup', [...seen].filter((k) => /turtwig|chimchar|piplup/.test(k)));
  const on = new Set();
  for (let i = 0; i < 40; i++) {
    start('GFSIN' + i, [1, 2, 3, 4, 5, 6, 7, 8, 9], { customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: 'tag_poke_starter_tag' }] } });
    for (const c of G.pack_cards.cards) on.add(key(c));
  }
  ok(['j_nacho_turtwig', 'j_nacho_chimchar', 'j_nacho_piplup'].some((k) => on.has(k)), 'Gen 4 on: they still come', [...on].filter((k) => /nacho/.test(k)));
});
// only one generation on: only it appears (Gen 3 has every kind of joker: starters, a pseudo, legendaries; Gen 9 its Paradoxes)
for (const only of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
  sec('only gen ' + only, () => {
    const { bad, made } = sweep('GFO' + only, [only]);
    ok(Object.keys(bad).length === 0, `only Gen ${only} on: every source makes Gen ${only} only`, bad);
    ok(made.shop >= 40 && made.c_poke_pokeball >= 8, `only Gen ${only}: the sources made cards`, made);
  });
}
// Gen 1 off: the Starter Pack's Pikachu / Eevee slot (both Gen 1) falls back to an allowed Basic, not Caterpie
sec('empty generation pool', () => {
  start('GFEMPTY', []);
  const result = get_random_poke_key('empty', 'Basic');
  ok(!result || !isPoke(P_CENTERS[result]), 'all generations off: an empty Pokémon pool never falls back to a disabled Pokémon', result);
  start('GFEMPTYTAG', [], { customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: 'tag_poke_starter_tag' }] } });
  ok(G.pack_cards.cards.length === 4 && G.pack_cards.cards.every(c => !isPoke(c.config.center)), 'empty starter pack uses non-Pokémon fallback cards', G.pack_cards.cards.map(key));
  start('GFEMPTYBALL', []); act({ type: 'select_blind' }); flush();
  ok(useN('c_poke_pokeball', 1).length === 0, 'empty Poké Ball produces no disabled Pokémon');
});
sec('gen 1 off fallback', () => {
  start('GFNO1', [2, 3, 4, 5, 6, 7, 8, 9], { customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: 'tag_poke_starter_tag' }] } });
  const got = G.pack_cards.cards.map(key);
  ok(got.length === 4 && !got.some((k) => offGen(k, [2, 3, 4, 5, 6, 7, 8, 9])) && !got.includes('j_poke_caterpie'), 'Gen 1 off: no Pikachu / Eevee / Caterpie in the Starter Pack', got);
});
// the filter on the joker row's own line: evolving a held joker is never filtered (a Gen 1 Eevee still becomes a Gen 6 Sylveon)
sec('evolutions', () => {
  start('GFEVO', [1]); act({ type: 'select_blind' }); flush();
  const pk = add('j_poke_eevee');
  ok(P_CENTERS.j_poke_sylveon && P_CENTERS.j_poke_sylveon.gen === 6, 'Sylveon is Gen 6');
  const pool = get_current_pool('Joker', 2)[0];
  ok(!pool.includes('j_poke_sylveon'), 'only Gen 1: Sylveon is not in the shop pool');
  ok(pk && key(pk) === 'j_poke_eevee', 'held Eevee (its evolutions stay open: poke_evolve never reads the pools)');
});

// ------------------------------------------------------------------- save / resume, and an r78 run
sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'GFRES', mods: MODS3, modOptions: { pokermon: gens(ALL_BUT_4) }, customDeck: { name: 'Starter', mods: MODS3, tags: [{ key: 'tag_poke_starter_tag' }] } });
  flush();
  const live = G.pack_cards.cards.map(key);
  s.act({ type: 'use', id: G.pack_cards.cards[0].sort_id }); flush();
  s.act({ type: 'select_blind' }); flush();
  const row = G.jokers.cards.map(key);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && Session.pinDiff(r.recipe).length === 0, 'resume: every move replays, no prompt', r.stoppedAt);
  ok(s.recipe.modOptions.pokermon.gen_four === false && G.GAME.mod_options.pokermon.gen_four === false, 'the recipe and the resumed run keep Gen 4 off');
  ok(JSON.stringify(G.jokers.cards.map(key)) === JSON.stringify(row) && !live.some((k) => offGen(k, ALL_BUT_4)), 'the same pick, and the pack had no Gen 4', [row, live]);
  ok(get_current_pool('Joker', 2)[0].every((k) => k === 'UNAVAILABLE' || !offGen(k, ALL_BUT_4)), 'resumed: the shop pool still has no Gen 4');
});
sec('r78 recipe', () => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_genfilter_r78_recipe.json', import.meta.url), 'utf8'));
  ok(FIX.modVersions.pokermon === '3.9.1+r78' && FIX.modOptions.pokermon.gen_four === false, 'the fixture: recorded on r78 with Gen 4 off', FIX.modVersions);
  const diff = Session.pinDiff(FIX);
  ok(diff.some((d) => d.id === 'pokermon' && d.recorded === '3.9.1+r78'), 'the resume prompt names r78 -> the current pin', diff);
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX)), { repin: true }); flush();
  ok(!s.stoppedAt && G.jokers.cards.map(key).join() === 'j_nacho_turtwig', '"Continue anyway": the r78 moves replay as recorded (its Starter Pack offered Turtwig; the pick holds)', [s.stoppedAt, G.jokers.cards.map(key)]);
  const st = Session.stepper(JSON.parse(JSON.stringify(FIX)));
  st.seek(st.total); flush();
  ok(!st.error && G.jokers.cards.map(key).join() === 'j_nacho_turtwig', 'the replay viewer: the same', [st.error, G.jokers.cards.map(key)]);
  // the same moves on today's rules: that pack has no Turtwig (what the gate keeps away from the old run)
  const asNew = { ...JSON.parse(JSON.stringify(FIX)), modVersions: PINS.currentPins(FIX.mods) };
  Session.fromRecipe(asNew); flush();
  ok(!G.jokers.cards.map(key).includes('j_nacho_turtwig'), 'the same moves recorded on r79: no Turtwig', G.jokers.cards.map(key));
});

done();
