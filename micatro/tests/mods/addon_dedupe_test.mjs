// Add-on dedupe (Pokermon precedence; micatro/mods/pokermon/PORTING.md "Add-on dedupe (Pokermon precedence)"): with Pokermon,
// Nacho's Pokermon Dip and Pokermon+ loaded, the add-on duplicates of Pokermon jokers are out of play but stay registered.
//   - the inventory: every registered joker of the three mods by name — exactly the 12 known duplicates (Nacho's Ralts / Swablu /
//     Bagon lines with Gallade, Pokermon+'s Nincada line); regional forms and Megas are distinct cards
//   - pools: many seeded runs, every joker rarity (create_card, the shop, Buffoon packs, rarity Tags) and every random-Pokémon
//     pick (get_random_poke_key: stages, types, Showman held) — no duplicate key, ever; the Pokermon twins still roll
//   - evolutions retarget: a legacy add-on line evolves into Pokermon's (level, item, Rare Candy / highest evo, Pokermon+'s
//     Shedinja); a Mega Stone on Pokermon's Gardevoir / Gallade / Altaria / Salamence gives Nacho's Mega, and it devolves back
//   - legacy keys: a recipe (custom deck) holding j_nacho_ralts replays and the card works; Pokermon+'s Wonder Guard challenge
//     still starts with its Shedinja; a removed key keeps its name / text / art, is not "retired", resolves to itself; win
//     stickers it earns go to Pokermon's line
//   - the Pokédex family view and the version pins (Nacho / Pokermon+ contentRev 1)
//   node micatro/tests/mods/addon_dedupe_test.mjs
import { T, hand, add, play, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { create_card, get_current_pool, localize } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { describeCenter } from '../../js/engine/describe.js';
import { centerActive } from '../../js/mods/registry.js';
import { resolveKey, isRetired, aliasesOf } from '../../js/mods/aliases.js';
import * as PINS from '../../js/mods/pins.js';
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';
import * as P from '../../mods/pokermon/api.js';
import { familyOf } from '../../mods/pokermon/ui.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 300)); } };
const flush = () => G.E_MANAGER.flush();
const MODS3 = ['pokermon', 'nacho', 'pokermonplus'];
function start(seed, { noBlind = false, mods = MODS3 } = {}) {
  newRun({ seed, back: 'b_red', mods });
  G.FORCE_BOSS = 'bl_wall';
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
const use = (c, jokers) => { const r = act({ type: 'use', id: c.sort_id, targets: [], joker_targets: jokers }); flush(); return r; };

const DUPES = {
  j_nacho_ralts: 'j_poke_ralts', j_nacho_kirlia: 'j_poke_kirlia', j_nacho_gardevoir: 'j_poke_gardevoir', j_nacho_gallade: 'j_poke_gallade',
  j_nacho_swablu: 'j_poke_swablu', j_nacho_altaria: 'j_poke_altaria',
  j_nacho_bagon: 'j_poke_bagon', j_nacho_shelgon: 'j_poke_shelgon', j_nacho_salamence: 'j_poke_salamence',
  j_sonfive_nincada: 'j_poke_nincada', j_sonfive_ninjask: 'j_poke_ninjask', j_sonfive_shedinja: 'j_poke_shedinja',
};
const NACHO_MEGAS = { gardevoir: 'j_nacho_mega_gardevoir', gallade: 'j_nacho_mega_gallade', altaria: 'j_nacho_mega_altaria', salamence: 'j_nacho_mega_salamence' };

// ===================================================================== the inventory (a script check of every registered joker)
sec('inventory', () => {
  const MODS = ['pokermon', 'nacho', 'pokermonplus'];
  const jokers = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && MODS.includes(c.mod));
  const byName = {};
  for (const c of jokers) (byName[c.name] = byName[c.name] || []).push(c.key);
  const shared = Object.entries(byName).filter(([, ks]) => new Set(ks.map((k) => P_CENTERS[k].mod)).size > 1);
  const found = {};
  for (const [, ks] of shared) { const base = ks.find((k) => P_CENTERS[k].mod === 'pokermon'); for (const k of ks) if (k !== base) found[k] = base; }
  ok(JSON.stringify(Object.keys(found).sort()) === JSON.stringify(Object.keys(DUPES).sort()) && Object.entries(DUPES).every(([k, v]) => found[k] === v),
    'every joker of Pokermon / Nacho / Pokermon+ by name: exactly the 12 known add-on duplicates', found);
  ok(!Object.values(byName).some((ks) => ks.length > 1 && ks.every((k) => P_CENTERS[k].mod !== 'pokermon')), 'Nacho and Pokermon+ share no joker');
  // display names too (a renamed key with the same Pokémon): only the 12, plus Pokermon's own forms (Shellder's shell, Jirachi's)
  const disp = {};
  for (const c of jokers) { const n = String(localize({ type: 'name_text', set: 'Joker', key: c.key })).toLowerCase(); (disp[n] = disp[n] || []).push(c.key); }
  const cross = Object.values(disp).filter((ks) => new Set(ks.map((k) => P_CENTERS[k].mod)).size > 1).flat().filter((k) => P_CENTERS[k].mod !== 'pokermon');
  ok(cross.every((k) => DUPES[k]) && cross.length === 12, 'by display name: the same 12', cross);
  // distinct forms stay: regional forms and the add-on Megas Pokermon doesn't have
  for (const k of ['j_nacho_galarian_meowth', 'j_nacho_hisuian_sneasel', 'j_nacho_hisuian_zorua', 'j_nacho_hisuian_zoroark', ...Object.values(NACHO_MEGAS), 'j_nacho_mega_audino']) {
    ok(P_CENTERS[k] && !P.replaced_by(k) && !P_CENTERS[k].poke_replaced_by, k + ': a distinct form, not a duplicate');
  }
  for (const [k, v] of Object.entries(DUPES)) {
    ok(P.replaced_by(k) === v && P_CENTERS[k].poke_replaced_by === v && P.precedence_key(k) === v, k + ' -> replaced by ' + v);
    ok(!P.replaced_by(v) && P.precedence_key(v) === v, v + ': Pokermon\'s own, never replaced');
  }
});

// ===================================================================== pools: no duplicate ever rolls
sec('pools', () => {
  const seen = new Set();
  const twins = new Set();
  const RAR = [1, 2, 3, 4, 'poke_safari'];
  const STAGES = [null, 'Basic', 'One', 'Two'];
  const TYPES = [null, 'Psychic', 'Dragon', 'Colorless', 'Earth', 'Grass'];
  const note = (k) => { seen.add(k); if (Object.values(DUPES).includes(k)) twins.add(k); };
  for (let s = 0; s < 24; s++) {
    start('DEDUPE' + s, { noBlind: true });
    if (s % 3 === 1) add('j_ring_master'); // Showman lifts the duplicate / family rules — not this one
    if (s % 3 === 2) add('j_poke_pokedex');
    for (const r of RAR) {
      const [pool] = get_current_pool('Joker', r);
      for (const k of pool) if (k !== 'UNAVAILABLE') note(k);
      for (let i = 0; i < 25; i++) {
        const c = create_card('Joker', G.jokers, r === 4, r === 4 ? undefined : r, true, null, null, 'dd' + i);
        note(key(c)); c.remove();
      }
    }
    for (let i = 0; i < 40; i++) {
      const c = create_card('Joker', G.jokers, null, null, true, null, null, 'buf' + i); // a Buffoon pack / Wild Card style roll
      note(key(c)); c.remove();
    }
    for (const st of STAGES) for (const ty of TYPES) for (let i = 0; i < 6; i++) note(P.get_random_poke_key('dedupe' + i, st, null, null, ty));
  }
  // a real shop and Buffoon packs, rerolled
  for (let s = 0; s < 6; s++) {
    start('DDSHOP' + s);
    winRound(); act({ type: 'cash_out' }); flush();
    for (let i = 0; i < 30 && G.STATE === STATES.SHOP; i++) {
      for (const c of G.shop_jokers.cards) note(key(c));
      G.GAME.dollars = 1000;
      act({ type: 'reroll' }); flush();
    }
    for (const pk of ['p_buffoon_normal_1', 'p_buffoon_mega_1']) {
      const [pool] = get_current_pool('Joker', 2);
      for (const k of pool) if (k !== 'UNAVAILABLE') note(k);
      void pk;
    }
  }
  // rarity Tags: Uncommon / Rare Tag shop jokers come from create_card with that rarity (above); the Pokémon random picks
  // (Poké Balls, Transformation, the randomizer) are get_random_poke_key (above).
  const bad = [...seen].filter((k) => DUPES[k]);
  ok(!bad.length, 'no add-on duplicate in ' + seen.size + ' distinct rolled jokers (pools, create_card, the shop, random Pokémon)', bad);
  ok(twins.size >= 8, 'their Pokermon twins do roll (' + twins.size + ' of 12 seen)', [...twins]);
  ok(Object.keys(DUPES).every((k) => !P_CENTERS[k].in_pool(P_CENTERS[k]) && !P.pokemon_in_pool(P_CENTERS[k])), 'every duplicate: in_pool false and out of pokemon_in_pool');
  ok(Object.keys(DUPES).every((k) => centerActive(P_CENTERS[k])), 'every duplicate stays an ACTIVE center (an owned one still works)');
});

// ===================================================================== evolutions retarget to the Pokermon line
sec('legacy evolutions', () => {
  start('DDEVO');
  const r = add('j_nacho_ralts');
  G.GAME.hands['Pair'].level += 2;
  const res = play(hand(['S_A']));
  ok(res.total.mult === 1 + 2, 'an owned j_nacho_ralts keeps working as before (+1 Mult per level above 1)', res.total);
  r.ability.extra.rounds = 1; winRound();
  ok(key(r) === 'j_poke_kirlia', 'Nacho Ralts -> Pokermon\'s Kirlia (not j_nacho_kirlia)', key(r));
  start('DDEVO2');
  const k = add('j_nacho_kirlia'); k.ability.extra.rounds = 1; winRound();
  ok(key(k) === 'j_poke_gardevoir', 'Nacho Kirlia -> Pokermon\'s Gardevoir', key(k));
  start('DDEVO3');
  const k2 = add('j_nacho_kirlia');
  use(add('c_poke_dawnstone'), [k2.sort_id]); winRound();
  ok(key(k2) === 'j_poke_gallade', 'Nacho Kirlia + Dawn Stone -> Pokermon\'s Gallade', key(k2));
  start('DDEVO4');
  const s = add('j_nacho_swablu'); s.ability.extra.rounds = 1; winRound();
  ok(key(s) === 'j_poke_altaria', 'Nacho Swablu -> Pokermon\'s Altaria', key(s));
  start('DDEVO5');
  const b = add('j_nacho_bagon');
  for (const c of G.playing_cards) P.change_base(c, null, 'King');
  winRound();
  ok(key(b) === 'j_poke_shelgon', 'Nacho Bagon -> Pokermon\'s Shelgon', key(b));
  start('DDEVO6');
  const sg = add('j_nacho_shelgon');
  for (const c of G.playing_cards) P.change_base(c, null, 'King');
  winRound();
  ok(key(sg) === 'j_poke_salamence', 'Nacho Shelgon -> Pokermon\'s Salamence', key(sg));
  start('DDEVO7');
  const n = add('j_sonfive_nincada'); n.ability.extra.rounds = 1; winRound(); flush();
  ok(key(n) === 'j_poke_ninjask', 'Pokermon+ Nincada -> Pokermon\'s Ninjask', key(n));
  ok(G.jokers.cards.some((c) => key(c) === 'j_poke_shedinja') && !G.jokers.cards.some((c) => key(c) === 'j_sonfive_shedinja'), 'its shell Shedinja is Pokermon\'s', G.jokers.cards.map(key));
  // the funnel: every evolution path (Rare Candy, devolution, forced keys) goes through poke_evolve
  start('DDEVO8');
  const x = add('j_nacho_ralts');
  P.poke_evolve(x, 'j_nacho_gardevoir', true);
  ok(key(x) === 'j_poke_gardevoir', 'poke_evolve(immediate) to a duplicate key gives Pokermon\'s', key(x));
  const y = add('j_nacho_ralts');
  P.poke_backend_evolve(y, 'j_sonfive_ninjask');
  ok(key(y) === 'j_poke_ninjask', 'poke_backend_evolve too', key(y));
  // family lists stay unified (sub-batch 11): one Ralts family, one Nincada family
  const fam = P.poke_get_family_list('ralts').map((v) => (typeof v === 'object' ? v.key : v));
  ok(fam.includes('gallade') && fam.includes('mega_gardevoir') && fam.includes('mega_gallade') && P.family.filter((f) => f.some((v) => (v.key || v) === 'ralts')).length === 1, 'the Ralts family stays one list (with Nacho\'s Megas)', fam);
  ok(P.family.filter((f) => f.some((v) => (v.key || v) === 'nincada')).length === 1, 'the Nincada family stays one list');
});

// ===================================================================== Mega Stone: Pokermon's line reaches Nacho's Megas
sec('megas', () => {
  for (const [nm, mega] of Object.entries(NACHO_MEGAS)) {
    start('DDMEGA' + nm);
    const j = add('j_poke_' + nm);
    ok(P.megastone_in_pool(), nm + ': the Mega Stone can roll while Pokermon\'s ' + nm + ' is held');
    const stone = add('c_poke_megastone');
    ok(P.megastone_can_use(stone), nm + ': the Mega Stone can be used on Pokermon\'s ' + nm);
    use(stone, [j.sort_id]);
    ok(key(j) === mega, 'Mega Stone on j_poke_' + nm + ' -> ' + mega, key(j));
    // (Pokermon 3.9.1, batch 16: the stone remembers the Mega's card, its unique_val)
    ok(stone.ability.extra.used_on === j.unique_val && P.megastone_mega(stone) === j, nm + ': the stone remembers the Mega', stone.ability.extra.used_on);
    // devolve: the next round the stone reverts it — to Pokermon's joker, never Nacho's
    winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); flush();
    use(stone, [j.sort_id]);
    ok(key(j) === 'j_poke_' + nm, nm + ': the Mega devolves back to Pokermon\'s ' + nm, key(j));
  }
  // with Nacho off (Pokermon + Pokermon+), Pokermon's Gardevoir has no Mega and the stone has no target
  start('DDMEGAOFF', { mods: ['pokermon', 'pokermonplus'] });
  add('j_poke_gardevoir');
  const st = add('c_poke_megastone');
  ok(!P.megastone_can_use(st) && !P.megastone_in_pool(), 'Nacho off: no Mega for Pokermon\'s Gardevoir');
  // Nacho's Ralts line toggled off: its Megas are off too
  newRun({ seed: 'DDMEGAOPT', back: 'b_red', mods: MODS3, modOptions: { nacho: { Ralts: false } } }); flush();
  act({ type: 'select_blind' }); clearHand();
  add('j_poke_gardevoir');
  const st2 = add('c_poke_megastone');
  ok(!P.megastone_can_use(st2), 'Nacho\'s Ralts line off: no Mega Gardevoir');
});

// ===================================================================== legacy keys still load
sec('recipe', () => {
  const s = new Session();
  s.start({ seed: 'DDRECIPE', mods: MODS3, customDeck: { name: 'Legacy', jokers: [{ key: 'j_nacho_ralts' }, { key: 'j_sonfive_shedinja' }] } });
  const rec = JSON.parse(JSON.stringify(s.recipe));
  ok(rec.customDeck.jokers.some((j) => j.key === 'j_nacho_ralts'), 'a recipe holding j_nacho_ralts');
  const s2 = Session.fromRecipe(rec);
  const r = G.jokers.cards.find((c) => key(c) === 'j_nacho_ralts');
  ok(!s2.stoppedAt && r && G.jokers.cards.some((c) => key(c) === 'j_sonfive_shedinja'), 'it loads: the legacy jokers are on the row', G.jokers.cards.map(key));
  s2.act({ type: 'select_blind' }); clearHand();
  G.GAME.hands['Pair'].level += 3;
  const res = play(hand(['S_A']));
  ok(res.total.mult === 1 + 3, 'and j_nacho_ralts works (+1 Mult per hand level above 1)', res.total);
  // Pokermon+'s Wonder Guard challenge starts with its own (legacy) Shedinja
  const wg = Session.fromRecipe({ v: 1, seed: 'DDWG', back: 'b_red', stake: 1, mods: ['pokermon', 'pokermonplus'], challenge: 'c_sonfive_wonder_guard', actions: [] });
  flush();
  ok(!wg.stoppedAt && G.jokers.cards.some((c) => key(c) === 'j_sonfive_shedinja' && c.ability.eternal), 'the Wonder Guard challenge still starts with an eternal j_sonfive_shedinja', G.jokers.cards.map(key));
});

sec('names / stickers', () => {
  const known = (k) => !!P_CENTERS[k];
  for (const k of Object.keys(DUPES)) {
    const nm = localize({ type: 'name_text', set: 'Joker', key: k });
    const d = describeCenter(k);
    ok(typeof nm === 'string' && nm.length > 2 && nm !== k && d && d.lines && d.lines.length, k + ': still named and described (' + nm + ')');
    ok(P_CENTERS[k].atlas && P_CENTERS[k].pos, k + ': still drawn (atlas + pos)');
    ok(!isRetired(k, known) && resolveKey(k, known) === k && !aliasesOf(P_CENTERS[k].poke_replaced_by).includes(k), k + ': not retired, resolves to itself, no alias');
  }
  // the win stickers a legacy card earns for its earlier stages go to Pokermon's line
  start('DDWIN', { noBlind: true });
  const m = add('j_nacho_mega_gardevoir');
  const prev = P.family_win_keys(m);
  ok(!prev.some((k) => DUPES[k]), 'family win stickers from a Nacho Mega name no duplicate key', prev);
});

// ===================================================================== the Pokédex family view, the deck editor, the pins
sec('dex / pins', () => {
  start('DDDEX', { noBlind: true });
  {
    const f = familyOf({ center: 'j_poke_gardevoir' });
    ok(f.includes('j_nacho_mega_gardevoir') && f.includes('j_nacho_mega_gallade') && !f.some((k) => DUPES[k]), 'Pokédex: Pokermon\'s Ralts line shows Nacho\'s Megas, no duplicate', f);
    const g = familyOf({ center: 'j_nacho_ralts' });
    ok(g[0] === 'j_nacho_ralts' && g.includes('j_poke_kirlia') && !g.includes('j_nacho_kirlia'), 'Pokédex on a legacy card: itself, then Pokermon\'s line', g);
  }
  ok(PINS.modPin('nacho') === '1.6.4+r1' && PINS.modPin('pokermonplus') === '1.0.3-251101e+r1', 'pins: Nacho 1.6.4+r1, Pokermon+ 1.0.3-251101e+r1', [PINS.modPin('nacho'), PINS.modPin('pokermonplus')]);
  ok(PINS.LEGACY_MOD_VERSIONS.nacho === '1.6.4' && PINS.LEGACY_MOD_VERSIONS.pokermonplus === '1.0.3-251101e', 'LEGACY_MOD_VERSIONS untouched');
  const d = PINS.pinDiff({ mods: ['pokermon', 'nacho'], modVersions: { pokermon: PINS.modPin('pokermon'), nacho: '1.6.4' } });
  ok(d.length === 1 && d[0].id === 'nacho', 'a run recorded on Nacho 1.6.4 (rev 0) warns on resume', d);
});

done();
