// Nacho's Pokermon Dip 1.6.4 -> 1.7.9-5 (Plans/MICATRO_MODS_UPGRADES.md batches 18 / 19; micatro/mods/nacho/PORTING.md "1.7.9
// upgrade"). Every effect is FIRED through real plays (act):
//   - the pin (1.7.9-5+r2, LEGACY_MOD_VERSIONS untouched), the data (data179.js / sprites179.js), the inventory: the 1.7.9 jokers,
//     the Toxic-Stall data-only lines, the legacy definitions, nothing for the deprecated / never-loaded upstream lines
//   - batch 18: the legacy definitions (registered, out of every pool, evolving into Pokermon's, their 1.6.4 behaviour), the
//     re-keyed Megas (j_poke_mega_*: a Mega Stone on POKERMON's Gardevoir / Altaria / Gallade, their 1.7.9 effects, reverting),
//     the Elite alias (stake_nacho_elite_stake plays Pokermon's Elite), the reworks of the existing jokers
//   - batch 19: a sample of the new jokers (fossils, Snover line, Victini, Solosis, Bounsweet, Wimpod, Togedemaru, Dhelmise, the
//     Applin line + the apples, Finizen / Palafin, Frigibax line + Mega Baxcalibur, the Excavator + Fossil Tag + Ancient Pack),
//     their evolutions, Pokermon precedence (no 1.7.9 species is a Pokermon joker), their art (3.9.1 cells + Shiny twins)
//   - an old recipe with old keys (a custom deck holding j_nacho_mega_gardevoir / j_nacho_ralts, stake_nacho_elite_stake) loads
//   node micatro/tests/mods/nacho_179_test.mjs   (set MICATRO_MAIN for the art checks in a worktree)
import path from 'path';
import { T, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { newRun } from '../../js/engine/run.js';
import { P_CENTER_POOLS, P_STAKES, P_TAGS, create_playing_card, localize } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { centerActive, MODS, resolveCardKey, isRetiredKey } from '../../js/mods/registry.js';
import { aliasesOf } from '../../js/mods/aliases.js';
import { SUPERSEDED } from '../../js/mods/superseded.js';
import * as PINS from '../../js/mods/pins.js';
import * as NI from '../../mods/nacho/index.js';
import * as N from '../../mods/nacho/api.js';
// (dynamic: on a 1.6.4 tree — origin/main before batch 18 — these files don't exist, and the suite still runs to count its failures)
const opt = async (p) => { try { return await import(p); } catch { return {}; } };
const DATA179 = (await opt('../../mods/nacho/data179.js')).default || { groups: { jokers: [] } };
const SPRITES179 = (await opt('../../mods/nacho/sprites179.js')).default || {};
const calc = (await opt('../../mods/nacho/dip.js')).calc || { get_full_house: () => [], get_common_ranks: () => [] };
const { STATUS, LINES, CHALLENGES, REPLACED } = NI;
const LEGACY_KEYS = NI.LEGACY_KEYS || [];
import { Card } from '../../js/engine/core.js';
const apply_to_run = (self, center) => Card.apply_to_run(self, center);
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };

function start(seed, { nacho = true, options = {}, poke = {}, boss = 'bl_wall', noBlind = false, stake, mods } = {}) {
  newRun({ seed, back: 'b_red', stake, mods: mods || (nacho ? ['pokermon', 'nacho'] : ['pokermon']), modOptions: { pokermon: poke, nacho: options } });
  G.FORCE_BOSS = boss;
  G.GAME.round_resets.blind_choices.Boss = boss;
  flush();
  if (noBlind) return;
  act({ type: 'select_blind' });
  clearHand();
}
function next() {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  act({ type: 'select_blind' });
  clearHand();
}
const use = (c, joker_targets, targets = []) => { const r = act({ type: 'use', id: c.sort_id, targets, joker_targets }); flush(); return r; };
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); const r = act({ type: 'discard' }); clearHand(); return r; };
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
const evolveNow = (j) => { winRound(); flush(); return key(j); };

// 1.7.9's new jokers that load (batch 19), the Toxic-Stall data-only ones, the legacy keys (batch 18)
const NEW = ['cranidos', 'rampardos', 'shieldon', 'bastiodon', 'snover', 'abomasnow', 'mega_abomasnow', 'victini', 'solosis', 'duosion',
  'reuniclus', 'bounsweet', 'steenee', 'tsareena', 'wimpod', 'golisopod', 'togedemaru', 'dhelmise', 'applin', 'flapple', 'appletun',
  'dipplin', 'hydrapple', 'finizen', 'palafin', 'palafin_hero', 'frigibax', 'arctibax', 'baxcalibur', 'mega_baxcalibur', 'excavator'];
const TOXIC = ['hisuian_sneasel', 'sneasler', 'okidogi', 'munkidori', 'fezandipiti', 'pecharunt'];
const LEGACY = ['ralts', 'kirlia', 'gardevoir', 'gallade', 'swablu', 'altaria', 'bagon', 'shelgon', 'salamence', 'mega_salamence'];
const REKEYED = { mega_gardevoir: 'gardevoir', mega_altaria: 'altaria', mega_gallade: 'gallade' };
const NOT_PORTED = ['bronzor', 'bronzong', 'smoliv', 'dolliv', 'arboliva', 'impidimp', 'morgrem', 'grimmsnarl', 'gmax_flapple', 'gmax_appletun'];

// =================================================================== the pin, the data, the inventory
sec('pin', () => {
  ok(MODS.nacho.version === '1.7.9-5' && MODS.nacho.contentRev === 2 && PINS.modPin('nacho') === '1.7.9-5+r2', 'Nacho pinned 1.7.9-5+r2', PINS.modPin('nacho'));
  ok(PINS.LEGACY_MOD_VERSIONS.nacho === '1.6.4', 'LEGACY_MOD_VERSIONS untouched (nacho 1.6.4)', PINS.LEGACY_MOD_VERSIONS.nacho);
  ok(DATA179.source === 'NachosPokermonDip-1.7.9-5' && DATA179.groups.jokers.length === 42, 'data179.js: the 1.7.9-5 extract (42 joker files)', [DATA179.source, DATA179.groups.jokers.length]);
  ok(NEW.every((n) => SPRITES179[n] || ['excavator', 'palafin_hero', 'mega_baxcalibur'].includes(n)), 'sprites179.js: a 3.9.1 cell for every new joker without its own atlas');
});
sec('inventory', () => {
  const C = (n, p = 'nacho') => P_CENTERS['j_' + p + '_' + n];
  ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.ported.includes('j_nacho_' + n)), 'batch 19: the 31 new jokers that load are registered and ported', NEW.filter((n) => !C(n) || C(n).unported));
  ok(TOXIC.every((n) => C(n) && C(n).nacho_unavailable === 'ToxicStall' && STATUS.unavailable.includes('j_nacho_' + n)), 'the 6 Toxic-Stall jokers: data only (unavailable)');
  ok(LEGACY.every((n) => C(n) && C(n).nacho_legacy === '1.6.4') && LEGACY_KEYS.length === 10, 'batch 18: 10 legacy definitions (the Ralts / Swablu / Bagon lines + Mega Salamence)', LEGACY_KEYS);
  ok(Object.keys(REKEYED).every((n) => C(n, 'poke') && C(n, 'poke').mod === 'nacho' && !C(n)), 'the 3 Megas are re-keyed to j_poke_* (registered by Nacho), the j_nacho_* keys gone');
  ok(NOT_PORTED.every((n) => !C(n) && !C(n, 'poke') || (C(n, 'poke') && C(n, 'poke').mod === 'pokermon')), 'deprecated / never-loaded upstream lines (Bronzor, Smoliv, Impidimp, G-Max) are not registered by Nacho');
  const nacho = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker');
  ok(nacho.length === 82, '82 Nacho jokers: 66 1.7.9 + 6 Toxic-Stall + 10 legacy', nacho.length);
  // Pokermon precedence: no 1.7.9 joker is a Pokémon base Pokermon has; the only duplicates are the legacy 9.
  const pokeNames = new Set(Object.values(P_CENTERS).filter((c) => c.mod === 'pokermon' && c.set === 'Joker').map((c) => c.name));
  const clash = nacho.filter((c) => !c.nacho_legacy && pokeNames.has(c.name)).map((c) => c.key);
  ok(clash.length === 0, 'precedence: no 1.7.9 joker shares a name with a Pokermon joker', clash);
  ok(JSON.stringify(REPLACED.slice().sort()) === JSON.stringify(LEGACY.filter((n) => n !== 'mega_salamence').map((n) => 'j_nacho_' + n).sort()), 'mark_precedence: exactly the 9 legacy duplicates are replaced', REPLACED);
  ok(LEGACY.filter((n) => n !== 'mega_salamence').every((n) => SUPERSEDED['j_nacho_' + n] === 'j_poke_' + n), 'the sticker merge (superseded.js) still maps the legacy keys to Pokermon\'s');
  ok(P_CENTERS.c_nacho_tartapple && P_CENTERS.c_nacho_sweetapple && P_CENTERS.c_nacho_syrupyapple && P_CENTERS.p_nacho_ancient_pack && P_TAGS.tag_nacho_fossil_tag, 'the apples, the Ancient Pack and the Fossil Tag');
  ok(!P_STAKES.stake_nacho_elite_stake && P_STAKES.stake_poke_elite, 'no Nacho stake any more (Pokermon owns the Elite stake)');
  ok(LINES.filter((l) => l.option).length === 31 && CHALLENGES.length === 4, '31 line / Mega options, 4 challenges', [LINES.filter((l) => l.option).length, CHALLENGES.length]);
});
sec('options + pools', () => {
  start('N179_ON');
  const act_ = Object.values(P_CENTERS).filter((c) => c.mod === 'nacho' && c.set === 'Joker' && centerActive(c));
  ok(act_.length === 76, 'on: 76 jokers active by default (all lines incl. Clauncher; Toxic-Stall off)', act_.length);
  ok(P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_clauncher) && P_CENTER_POOLS.Joker.includes(P_CENTERS.j_nacho_cranidos), '1.7.9 default: Clauncher is in (1.6.4: off)');
  const legacyIn = LEGACY.filter((n) => P_CENTER_POOLS.Joker.includes(P_CENTERS['j_nacho_' + n]) && P_CENTERS['j_nacho_' + n].in_pool && P_CENTERS['j_nacho_' + n].in_pool(P_CENTERS['j_nacho_' + n], {}));
  ok(legacyIn.length === 0, 'legacy definitions are never in a pool', legacyIn);
  const saw = new Set();
  for (let i = 0; i < 600; i++) saw.add(N.get_random_poke_key('n179_' + i));
  ok(![...saw].some((k) => LEGACY.includes(k.replace('j_nacho_', '')) || TOXIC.includes(k.replace('j_nacho_', ''))), 'random Pokémon: never a legacy or Toxic-Stall joker');
  ok([...saw].some((k) => NEW.includes(k.replace('j_nacho_', ''))), 'random Pokémon: the new lines can roll');
  start('N179_OPT', { options: { Applin: false, Mega_Gardevoir: false } });
  ok(!centerActive(P_CENTERS.j_nacho_applin) && !centerActive(P_CENTERS.c_nacho_tartapple), 'the Applin option off: the line and its apples are out');
  const g = add('j_poke_gardevoir');
  ok(N.addon_megas(g.config.center).length === 0, 'Mega_Gardevoir off: Pokermon\'s Gardevoir has no Mega');
});

// =================================================================== batch 18: aliases, Elite, legacy keys, old recipes
sec('aliases', () => {
  for (const n of Object.keys(REKEYED)) {
    ok(resolveCardKey('j_nacho_' + n) === 'j_poke_' + n && !isRetiredKey('j_nacho_' + n) && aliasesOf('j_poke_' + n).includes('j_nacho_' + n), `renamed: j_nacho_${n} -> j_poke_${n} (stickers count for it)`);
  }
  ok(resolveCardKey('stake_nacho_elite_stake') === 'stake_poke_elite', 'renamed: stake_nacho_elite_stake -> stake_poke_elite');
  ok(LEGACY.every((n) => resolveCardKey('j_nacho_' + n) === 'j_nacho_' + n && !isRetiredKey('j_nacho_' + n)), 'legacy keys resolve to themselves (registered), never "retired"');
});
sec('elite alias', () => {
  start('N179_ELITE', { stake: 'stake_nacho_elite_stake', noBlind: true });
  ok(G.GAME.stake_key === 'stake_poke_elite' && G.GAME.stake === 8 && G.GAME.win_ante === 10 && G.GAME.modifiers.poke_elite4, 'a run on the old Nacho Elite key plays Pokermon\'s Elite (Gold + win ante 10 + showdowns)', [G.GAME.stake_key, G.GAME.win_ante]);
  ok(!G.GAME.modifiers.elite4, 'Nacho\'s own elite4 rule is gone');
});
sec('old recipe', () => {
  // A replay / save recorded on 1.6.4: its custom deck names the old Mega key and a legacy joker, its stake the old Elite.
  const sess = new Session();
  sess.start({ seed: 'N179_OLD', back: 'b_red', stake: 'stake_nacho_elite_stake', mods: ['pokermon', 'nacho'], modOptions: { nacho: { Ralts: true, Clauncher: false, customStakes: true } } });
  ok(G.GAME.stake_key === 'stake_poke_elite', 'the old stake key starts Pokermon\'s Elite');
  ok(G.GAME.mod_options.nacho.Clauncher === false, 'a stored 1.6.4 option (Clauncher off) still applies');
  const j = add(resolveCardKey('j_nacho_mega_gardevoir'));
  ok(key(j) === 'j_poke_mega_gardevoir', 'the old Mega key resolves to the re-keyed card');
  const r = add('j_nacho_ralts');
  ok(key(r) === 'j_nacho_ralts' && r.ability.extra.rounds === 4, 'a legacy joker still loads with its 1.6.4 data');
  act({ type: 'select_blind' });
  clearHand();
  const p = play(hand(['S_A']));
  ok(p.total && p.total.chips === 16, 'and both play (no hand levels: Mega Gardevoir X1, Ralts +0)', p.total);
});

// =================================================================== batch 18: the legacy definitions keep their 1.6.4 behaviour
sec('legacy', () => {
  start('N179_LEGACY');
  const r = add('j_nacho_ralts');
  G.GAME.hands.Flush.level += 2;
  const p = play(hand(['S_A']));
  ok(p.total.mult === 1 + 2, 'legacy Ralts (1.6.4): +1 Mult per hand level above 1', p.total);
  r.ability.extra.rounds = 1;
  ok(evolveNow(r) === 'j_poke_kirlia', 'a legacy Ralts evolves into Pokermon\'s Kirlia (precedence)', key(r));
  next();
  const sal = add('j_nacho_salamence');
  ok(!sal.config.center.megas && N.addon_megas(sal.config.center).length === 0, 'legacy Salamence: 1.7.9 dropped Mega Salamence — no Mega');
  const stone = add('c_poke_megastone');
  ok(!stone.can_use_consumeable(), 'a Mega Stone has no target with only Salamence');
  const ms = add('j_nacho_mega_salamence');
  ok(ms && key(ms) === 'j_nacho_mega_salamence', 'Mega Salamence stays registered (legacy) for old saves');
  const g = add('j_nacho_gardevoir');
  use(stone, [g.sort_id]);
  ok(key(g) === 'j_poke_mega_gardevoir', 'a legacy Gardevoir still Megas — into the re-keyed Mega Gardevoir', key(g));
});

// =================================================================== batch 18: the re-keyed Megas, from Pokermon's jokers
sec('megas', () => {
  start('N179_MEGAS');
  const g = add('j_poke_gardevoir');
  ok(N.addon_megas(g.config.center).join() === 'j_poke_mega_gardevoir', 'Pokermon\'s Gardevoir lists Nacho\'s re-keyed Mega (attach_mega)');
  const stone = add('c_poke_megastone');
  use(stone, [g.sort_id]);
  ok(key(g) === 'j_poke_mega_gardevoir', 'Mega Stone: Pokermon\'s Gardevoir -> j_poke_mega_gardevoir', key(g));
  ok(N.poke_get_family_list('gardevoir').includes('mega_gardevoir'), 'add_to_family: Mega Gardevoir joins the Ralts family');
  // Mega Gardevoir (1.7.9): X(1 + 0.1 x (hand levels above 1 + Energized jokers))
  G.GAME.hands.Pair.level += 3;
  const e = add('j_poke_charmander');
  e.ability.extra.energy_count = 1;
  const p = play(hand(['S_A']));
  ok(near(p.total.mult, 1 + 0.1 * (3 + 1)), 'Mega Gardevoir: X1.4 (3 levels above 1 + 1 Energized joker)', p.total);
  next();
  use(stone, [g.sort_id]);
  ok(key(g) === 'j_poke_gardevoir', 'Mega Stone again: back to Pokermon\'s Gardevoir', key(g));
  // Mega Gallade (1.7.9): X3, +1 Energy limit, can't be debuffed; an Item gives a random joker +1 Energy limit
  start('N179_MEGAGALLADE');
  const ga = add('j_poke_gallade');
  const s2 = add('c_poke_megastone');
  const lim0 = G.GAME.energy_plus || 0;
  use(s2, [ga.sort_id]);
  ok(key(ga) === 'j_poke_mega_gallade' && (G.GAME.energy_plus || 0) === lim0 + 1, 'Pokermon\'s Gallade -> Mega Gallade: +1 Energy limit', [key(ga), G.GAME.energy_plus]);
  ga.set_debuff(true);
  ok(!ga.debuff, 'Mega Gallade can\'t be debuffed');
  const p2 = play(hand(['S_A']));
  ok(near(p2.total.mult, 3), 'Mega Gallade: X3 Mult', p2.total);
  const bu = add('j_poke_bulbasaur');
  const lim1 = N.energy_limit_bonus(bu) + N.energy_limit_bonus(ga);
  use(add('c_poke_leftovers'), []);
  ok(N.energy_limit_bonus(bu) + N.energy_limit_bonus(ga) === lim1 + 1, 'Mega Gallade: an Item gives a random joker +1 Energy limit (e_limit_up, counted by the Energy limit)', [lim1, N.energy_limit_bonus(bu), N.energy_limit_bonus(ga)]);
  const jk = add('j_joker');
  const ex0 = JSON.stringify(jk.ability.extra);
  for (let i = 0; i < 12; i++) use(add('c_poke_leftovers'), []);
  ok(JSON.stringify(jk.ability.extra) === ex0 && jk.ability.nacho_e_limit_up > 0, 'a base joker keeps its own `extra`; its bonus goes in nacho_e_limit_up (the Lua replaced `extra`: fixed)', jk.ability);
  const r3 = play(hand(['S_A']));
  ok(r3.total.mult >= 3 + 4, 'Joker still gives its +4 after Mega Gallade\'s Items', r3.total);
  start('N179_MEGAALTARIA');
  // Mega Altaria (1.7.9, Fairy): drawn 9s turn Polychrome and earn $2; 9s can't be debuffed
  const al = add('j_poke_altaria');
  use(add('c_poke_megastone'), [al.sort_id]);
  ok(key(al) === 'j_poke_mega_altaria' && al.ability.extra.ptype === 'Fairy', 'Pokermon\'s Altaria -> Mega Altaria (Fairy)', key(al));
  const d0 = G.GAME.dollars;
  onDeck('S_9'); onDeck('H_2');
  const cards = hand(['D_3', 'D_4', 'D_5']);
  play(cards);
  const nines = G.hand.cards.filter((c) => c.get_id() === 9);
  const nine = nines[0];
  ok(nines.length >= 1 && nines.every((c) => c.edition && c.edition.polychrome) && G.GAME.dollars === d0 + 2 * nines.length, 'Mega Altaria: each drawn 9 becomes Polychrome and earns $2', [nines.map((c) => c.edition), G.GAME.dollars - d0]);
  nine.set_debuff(true);
  ok(!nine.debuff, 'Mega Altaria: 9s can\'t be debuffed');
});

// =================================================================== batch 18: reworks of the existing jokers
sec('rework turtwig', () => {
  start('N179_TURTWIG');
  const cap = G.GAME.interest_cap;
  const j = add('j_nacho_turtwig');
  winRound();
  ok(G.GAME.interest_cap === cap + 5 && j.ability.extra.interest === 1, 'Turtwig: Leech Seed +$5 cap, interest 1', [G.GAME.interest_cap, j.ability.extra.interest]);
  next();
  j.ability.extra.rounds = 1;
  // (its last round seeds once more, then it evolves: 1.7.9 counts levels in the later `evolution` context)
  ok(evolveNow(j) === 'j_nacho_grotle' && j.ability.extra.interest === 2, 'Turtwig -> Grotle keeps `interest` (poke_custom_values_to_keep)', j.ability.extra);
  ok(G.GAME.interest_cap === cap + 10, 'the evolution keeps the cap (Turtwig gives back 2 steps, Grotle re-adds them)', G.GAME.interest_cap);
  next();
  j.ability.extra.rounds = 1;
  winRound(); flush();
  ok(key(j) === 'j_nacho_torterra' && j.ability.extra.interest === 4 && G.GAME.interest_cap === cap + 20, 'Grotle: +$10 cap, then -> Torterra', [key(j), j.ability.extra.interest, G.GAME.interest_cap]);
  act({ type: 'cash_out' }); act({ type: 'next_round' });
  G.GAME.dollars = 100;
  act({ type: 'select_blind' }); flush();
  ok(j.ability.extra.h_size === 3, 'Torterra: hand size capped at 3 (1.6.4: 4) at $100', j.ability.extra.h_size);
  clearHand();
  const hs = G.hand.config.card_limit;
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(G.GAME.interest_cap === cap && G.hand.config.card_limit === hs - 3, 'selling Torterra gives the cap and the hand size back', [G.GAME.interest_cap, G.hand.config.card_limit]);
});
sec('rework seed money', () => {
  // Turtwig's init: Seed Money / Money Tree RAISE the interest cap (+$25 / +$50) instead of setting it ($50 / $100).
  start('N179_SEED', { noBlind: true });
  G.GAME.interest_cap = 40;
  apply_to_run(null, P_CENTERS.v_seed_money); flush();
  ok(G.GAME.interest_cap === 65, 'Nacho on: Seed Money on a $40 cap -> $65 (1.7.9; vanilla sets $50)', G.GAME.interest_cap);
  apply_to_run(null, P_CENTERS.v_money_tree); flush();
  ok(G.GAME.interest_cap === 115, 'Money Tree -> +$50', G.GAME.interest_cap);
  start('N179_SEED_OFF', { nacho: false, noBlind: true });
  G.GAME.interest_cap = 40;
  apply_to_run(null, P_CENTERS.v_seed_money); flush();
  ok(G.GAME.interest_cap === 50, 'Nacho off: vanilla Seed Money (sets $50)', G.GAME.interest_cap);
});
sec('rework chimchar', () => {
  start('N179_CHIMCHAR');
  const j = add('j_nacho_chimchar');
  discard(hand(['S_5', 'H_K', 'D_3']));
  ok(j.ability.extra.mult === 10, 'Chimchar: Mult = the discard\'s highest card (King 10)', j.ability.extra.mult);
  discard(hand(['S_4']));
  ok(j.ability.extra.mult === 10, 'Chimchar: a lower discard keeps it', j.ability.extra.mult);
  const r = play(hand(['S_2']));
  ok(r.total.mult === 1 + 10, 'Chimchar: +10 Mult', r.total);
  ok(j.ability.extra.rounds === 4, 'Chimchar: 4 rounds to evolve (1.7.9; 1.6.4 counted scoring rounds)', j.ability.extra.rounds);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_monferno' && j.ability.extra.mult === 0, 'Chimchar -> Monferno after its rounds (reset)', [key(j), j.ability.extra.mult]);
  next();
  discard(hand(['S_5', 'H_K'])); discard(hand(['D_9']));
  ok(j.ability.extra.mult === 10 + 9, 'Monferno: + each discard\'s highest rank (10 + 9)', j.ability.extra.mult);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_infernape', 'Monferno -> Infernape', key(j));
  next();
  discard(hand(['S_K', 'H_A', 'D_5']));
  ok(near(j.ability.extra.Xmult, 1.6), 'Infernape: +X0.3 per discarded face card / Ace (scale_card)', j.ability.extra.Xmult);
  const r2 = play(hand(['S_2']));
  ok(near(r2.total.mult, (1 + 30) * 1.6), 'Infernape: +30 Mult, X1.6', r2.total);
  winRound();
  ok(j.ability.extra.Xmult === 1, 'Infernape: resets to Xmult1');
});
sec('rework piplup', () => {
  start('N179_PIPLUP');
  const j = add('j_nacho_prinplup');
  hand(['D_7', 'D_K']);
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 50 + 7 + 10, 'Prinplup: +50 Chips (1.6.4: 30) + held ranks', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_empoleon', 'Prinplup -> Empoleon', key(j));
  next();
  hand(['D_7', 'D_K']);
  const stone = hand(['S_2'], { center: 'm_stone' });
  const r2 = play(hand(['S_A']));
  ok(r2.total.chips === 16 + 80 + 14 + 20, 'Empoleon: +80 Chips (1.6.4: 50), held ranks x2, a Stone card nothing', r2.total);
  void stone;
});
sec('rework audino', () => {
  start('N179_AUDINO');
  add('j_poke_caterpie'); const ma = add('j_nacho_mega_audino'); add('j_poke_bulbasaur');
  winRound();
  ok(!G.jokers.cards.some((c) => key(c) === 'j_poke_mystery_egg'), 'Mega Audino (1.7.9): no egg at a non-Boss round');
  G.GAME.blind.boss = true;
  next();
  G.GAME.blind.boss = true;
  const ev = winRound();
  flush();
  const egg = G.jokers.cards.find((c) => key(c) === 'j_poke_mystery_egg');
  ok(egg && egg.edition && egg.ability.extra.rounds === 1 && ['j_poke_caterpie', 'j_poke_bulbasaur'].includes(egg.ability.extra.key), 'Mega Audino: a Boss beaten -> a Daycare egg of an adjacent parent, an edition, 1 round', egg && [egg.edition, egg.ability.extra]);
  void ev; void ma;
});
sec('rework clauncher', () => {
  start('N179_CLAUNCHER');
  ok(centerActive(P_CENTERS.j_nacho_clauncher), 'Clauncher on by default (1.7.9)');
  add('j_nacho_clauncher');
  const [a, b] = hand(['S_5', 'H_5']);
  a.set_edition({ foil: true }, true); b.set_edition({ foil: true }, true);
  const h = hand(['D_K']); h[0].set_edition({ polychrome: true }, true);
  const r = play([a, b]);
  ok(r.total.chips === 10 + 55 * 2 + 55, 'Clauncher: the first played card of an edition retriggers (Foil once)', r.total);
  ok(P_CENTERS.j_nacho_clauncher.in_pool() === true, 'Clauncher in the pool with any editioned deck card');
});
sec('rework dedenne', () => {
  start('N179_DEDENNE');
  add('j_nacho_dedenne');
  G.GAME.probabilities.normal = 4; // the 1 in 4 always hits (a Pickup roll can still be "nothing": 34%)
  G.consumeables.config.card_limit = 99;
  let made = 0, rounds = 0;
  for (let i = 0; i < 6; i++) {
    if (i) next();
    const n0 = G.consumeables.cards.length;
    hand(['D_K'], { center: 'm_gold' });
    winRound(hand(['S_2'])); flush();
    rounds++;
    if (G.consumeables.cards.length > n0) made++;
  }
  ok(made > 0 && made <= rounds, 'Dedenne: a held Gold card paying out rolls a Pickup Item (dedenne_trig)', [made, rounds]);
  next();
  const n1 = G.consumeables.cards.length;
  winRound(hand(['S_2'])); flush();
  ok(G.consumeables.cards.length === n1, 'Dedenne: no Gold card held, nothing', [n1, G.consumeables.cards.length]);
});
sec('rework carbink', () => {
  start('N179_CARBINK');
  const lv = G.GAME.poke_hazard_level ?? 0;
  const j = add('j_nacho_carbink');
  ok((G.GAME.poke_hazard_level ?? 0) === lv + 1, 'Carbink: +1 Hazard level', G.GAME.poke_hazard_level);
  const [hz] = hand(['S_5'], { center: 'm_poke_hazard' });
  const [st] = hand(['S_6'], { center: 'm_stone' });
  ok(N.has_enhancement(hz, 'm_gold') && !N.has_enhancement(st, 'm_gold'), 'Carbink: Hazard cards count as Gold (Stone ones no longer)');
  ok(P_CENTERS.j_nacho_carbink.rarity === 3 && P_CENTERS.j_nacho_carbink.cost === 7 && P_CENTERS.j_nacho_carbink.enhancement_gate === 'm_poke_hazard', 'Carbink: Rare, $7, needs a Hazard card');
  act({ type: 'sell', id: j.sort_id }); flush();
  ok((G.GAME.poke_hazard_level ?? 0) === lv, 'selling Carbink takes the Hazard level back');
});
sec('rework goomy', () => {
  start('N179_GOOMY');
  const j = add('j_nacho_goomy');
  const held = hand(['S_2', 'H_3']);
  const fl = hand(['S_4', 'S_6', 'S_8', 'S_T', 'S_Q']);
  play(fl);
  ok(fl.every((c) => c.ability.perma_mult === 1) && held[0].ability.perma_mult === 1 && !held[1].ability.perma_mult, 'Goomy: a Spade Flush gives every played + held Spade +1 perma Mult', [held.map((c) => c.ability.perma_mult)]);
  ok(j.ability.extra.flushes === 1, 'Goomy counts the Flush');
  j.ability.extra.flushes = 6;
  ok(evolveNow(j) === 'j_nacho_sliggoo', 'Goomy -> Sliggoo at 6 Flushes', key(j));
  ok(calc.get_full_house(hand(['S_5', 'H_5', 'D_5', 'S_9', 'H_9']), 'nominal').join() === '5,9', 'get_full_house: (three, two) ranks');
  const sl = P_CENTERS.j_nacho_hisuian_sliggoo;
  ok(sl.in_pool(sl) === false, 'Hisuian Sliggoo: out of the pool before any Flush House');
});
sec('rework oranguru', () => {
  start('N179_ORANGURU', { noBlind: true });
  act({ type: 'select_blind' }); winRound(); act({ type: 'cash_out' });
  add('j_nacho_oranguru');
  for (const c of G.playing_cards.slice(0, 10)) N.change_base(c, null, '7');
  ok(calc.get_common_ranks().map((r) => r.key).join() === '7', 'Oranguru: the most common rank is 7');
  const pack = new Card(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
  G.shop_booster.emplace(pack);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: pack.sort_id }); flush();
  ok(G.GAME.pack_choices === 2, 'Oranguru: +1 card selection in a Standard Pack (1 -> 2)', G.GAME.pack_choices);
  ok(G.pack_cards.cards.length > 0 && G.pack_cards.cards.every((c) => c.base.value === '7'), 'Oranguru: every Standard Pack card is one of your most common ranks', G.pack_cards.cards.map((c) => c.base.value));
  act({ type: 'skip_booster' }); flush();
  ok(G.STATE === STATES.SHOP && !G.pack_cards.cards.length, 'the pack closes once (ending_booster takes the choice back)', N.G.STATE);
});
sec('rework passimian', () => {
  start('N179_PASSIMIAN');
  const p = add('j_nacho_passimian');
  const b = add('j_poke_charmander');
  b.set_edition({ holo: true }, true);
  act({ type: 'sell', id: b.sort_id }); flush();
  ok(p.ability.received_key === 'j_poke_charmander' && p.edition && p.edition.holo, 'Passimian: receives the sold Pokémon AND its edition (1.7.9)', [p.ability.received_key, p.edition]);
  const p2 = add('j_nacho_passimian');
  const v = add('j_joker');
  act({ type: 'sell', id: v.sort_id }); flush();
  ok(!p2.ability.received_key, 'Passimian: a base-game joker (no stage) is not received', p2.ability.received_key);
});
sec('rework turtonator', () => {
  start('N179_TURTONATOR');
  const t = add('j_nacho_turtonator');
  ok(!t.ability.extra.trapped, 'Turtonator: inactive');
  const [c] = hand(['S_K']);
  c.set_debuff(true);
  flush();
  ok(t.ability.extra.trapped === true, 'Turtonator: a debuffed card arms Shell Trap (shell_trap)', t.ability.extra);
  c.set_debuff(false);
  const r = play(hand(['S_A', 'H_A']));
  ok(near(r.total.mult, 2 * 1.5 * 1.5), 'Turtonator: scoring cards X1.5 while armed', r.total);
  ok(!t.ability.extra.trapped, 'Turtonator: disarmed after the hand');
});
sec('rework skwovet', () => {
  start('N179_SKWOVET');
  const j = add('j_nacho_skwovet');
  use(add('c_mercury'));
  ok(j.ability.extra.mult === 1, 'Skwovet: +1 Mult per consumable in a blind', j.ability.extra.mult);
  j.ability.extra.mult = 12;
  ok(evolveNow(j) === 'j_nacho_greedent', 'Skwovet -> Greedent at 12 Mult (1.7.9 scaling_evo)', key(j));
});
sec('rework meowth', () => {
  start('N179_MEOWTH');
  const m = add('j_nacho_galarian_meowth');
  const metal = add('j_poke_aron'); // (Metal; its X Mult is Energy-scaled)
  const x0 = metal.ability.extra.Xmult_mod;
  play(hand(['S_K'], { center: 'm_steel' }));
  ok((metal.ability.extra.energy_count || 0) === 1 && metal.ability.extra.Xmult_mod > x0 && m.ability.extra.raised === 1 && m.ability.extra.steel_scored === 1, 'Galarian Meowth: a Steel card played -> +1 Energy on the other Metal jokers (its values scale)', [metal.ability.extra, m.ability.extra]);
  winRound(); flush();
  ok((metal.ability.extra.energy_count || 0) === 0 && near(metal.ability.extra.Xmult_mod, x0) && m.ability.extra.raised === 0, 'Galarian Meowth: the Energy is taken back at end of round', metal.ability.extra);
  m.ability.extra.steel_scored = 15;
  next();
  ok(evolveNow(m) === 'j_nacho_perrserker', 'Galarian Meowth -> Perrserker after 15 Steel cards scored', key(m));
});
sec('rework terapagos', () => {
  start('N179_TERA');
  const t = add('j_nacho_terapagos');
  flush();
  const orb = G.consumeables.cards.find((c) => key(c) === 'c_poke_teraorb');
  ok(orb && orb.edition && orb.edition.negative, 'Terapagos: a Negative Tera Orb when gained');
  use(orb, [t.sort_id]);
  ok(key(t) === 'j_nacho_terapagos_terastal', 'Tera Orb on Terapagos -> Terastal', key(t));
  const ts = P_CENTERS.j_nacho_terapagos_stellar;
  ok(ts.atlas === 'poke_AtlasJokersBasicGen09391' && ts.pos.x === 4 && ts.pos.y === 6 && ts.soul_atlas === 'nacho_terapagos_stellar_soul179', 'Terapagos-Stellar: 3.9.1 Gen 9 {4,6} card + 1.7.9\'s animated soul');
});

// =================================================================== batch 19: the new jokers
sec('cranidos', () => {
  start('N179_CRANIDOS');
  const j = add('j_nacho_cranidos');
  let r = play(hand(['S_5', 'H_5', 'D_5', 'C_9']));
  // Three of a Kind (30 x 3): 5s 15 chips, the first 5: +5 Mult and X1.1 (3 Ancient 5s); the 9 (unscored) is destroyed
  ok(near(r.total.mult, (3 + 5) * 1.1) && r.total.chips === 30 + 15, 'Cranidos: 3 Ancient 5s — the first 5 gives +5 Mult and X1.1', r.total);
  ok(j.ability.extra.third_times === 1, 'Cranidos: a 3+ hand counts toward evolving', j.ability.extra.third_times);
  ok(G.playing_cards.filter((c) => c.get_id() === 9).length === 4, 'Cranidos 2+: the first unscored card (the played 9) is destroyed (4 of the 5 nines left)', G.playing_cards.filter((c) => c.get_id() === 9).length);
  j.ability.extra.third_times = 5;
  ok(evolveNow(j) === 'j_nacho_rampardos', 'Cranidos -> Rampardos after 5 such hands', key(j));
  next();
  r = play(hand(['S_5', 'H_5', 'D_5', 'C_5']));
  // 4 Ancient 5s: only the first 5 scores, retriggered 3 times (4 - 1); it gives +20 Mult and X1.4 each time
  ok(r.total.chips === 60 + 5 * 4 && near(r.total.mult, ((((7 + 20) * 1.4 + 20) * 1.4 + 20) * 1.4 + 20) * 1.4), 'Rampardos 4+: the other 5s leave the scoring hand, the first is retriggered 3x (+20, X1.4 each)', r.total);
});
sec('shieldon', () => {
  start('N179_SHIELDON');
  const j = add('j_nacho_shieldon');
  const held = hand(['D_K'], { center: 'm_steel' });
  const p = hand(['S_6', 'H_6', 'D_6', 'C_2']);
  const r = play(p);
  ok(N.has_enhancement(p[0], 'm_steel'), 'Shieldon 2+: the first scoring card becomes Steel');
  // Three of a Kind: 3 Ancient 6s -> each 6 +36 Chips; the held Steel K +36 Chips (3+), X1.5
  ok(r.total.chips === 30 + 6 * 3 + 36 * 3 + 36 && near(r.total.mult, 3 * 1.5), 'Shieldon: scoring 6s and held Steel cards +12 Chips per Ancient 6', r.total);
  ok(j.ability.extra.third_times === 1, 'Shieldon: counts a 3+ hand');
  void held;
});
sec('snover', () => {
  start('N179_SNOVER');
  const j = add('j_nacho_snover');
  const d0 = G.GAME.dollars;
  const [g] = hand(['S_A'], { center: 'm_glass' });
  G.GAME.probabilities.normal = 1000;
  play([g]);
  flush();
  ok(G.GAME.dollars === d0 + 2, 'Snover: a scored Glass card earns $2', G.GAME.dollars - d0);
  ok(G.playing_cards.filter((c) => N.has_enhancement(c, 'm_glass')).length === 1 && j.ability.extra.triggered, 'Snover: the broken Glass card turned an unenhanced deck card into Glass (Ice Shard)');
  const ab = add('j_nacho_abomasnow');
  ok(ab.config.center.megas && ab.config.center.megas[0] === 'mega_abomasnow', 'Abomasnow has its Mega');
  use(add('c_poke_megastone'), [ab.sort_id]);
  ok(key(ab) === 'j_nacho_mega_abomasnow', 'Abomasnow -> Mega Abomasnow', key(ab));
  const d1 = G.GAME.dollars;
  const [g2] = hand(['H_A'], { center: 'm_glass' });
  play([g2]); flush();
  ok(G.GAME.dollars - d1 >= 20, 'Mega Abomasnow: a broken Glass card earns $20', G.GAME.dollars - d1);
});
sec('victini', () => {
  start('N179_VICTINI');
  const v = add('j_nacho_victini');
  const [num, den] = N.get_probability_vars(v, 1, 4, 'test');
  ok(num === 3 && den === 4, 'Victini: listed probabilities tripled (1 in 4 -> 3 in 4)', [num, den]);
  N.pseudorandom_probability(v, 'victini_test', 1, 4);
  ok(near(v.ability.extra.Xmult, 1.05), 'Victini: +X0.05 per rolled probability', v.ability.extra.Xmult);
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.05), 'Victini: X1.05', r.total);
});
sec('solosis', () => {
  start('N179_SOLOSIS');
  const j = add('j_nacho_solosis');
  const ace = hand(['S_A']);
  const n0 = G.playing_cards.length;
  const r = play(ace);
  ok(r.total.chips === 10 + 11 * 2 && r.total.mult === 2, 'Solosis: the first hand\'s first card is copied into it (a Pair of Aces)', r.total);
  ok(G.playing_cards.length === n0 && j.ability.extra.copies_made === 1, 'Solosis: the temporary copy is destroyed after scoring', [G.playing_cards.length, n0]);
  const r2 = play(hand(['S_K']));
  ok(r2.total.chips === 5 + 10, 'Solosis: only the first hand of the round', r2.total);
  j.ability.extra.copies_made = 4;
  ok(evolveNow(j) === 'j_nacho_duosion', 'Solosis -> Duosion after 4 copies', key(j));
});
sec('bounsweet', () => {
  start('N179_BOUNSWEET');
  const j = add('j_nacho_bounsweet');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 3, 'Bounsweet: +3 Mult', r.total);
  add('j_poke_bulbasaur');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 9, 'Bounsweet: x3 with another Grass joker', r.total);
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_steenee', 'Bounsweet -> Steenee', key(j));
  next();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 7 * 2, 'Steenee: +7 Mult per Grass joker (2)', r.total);
  add('j_poke_oddish');
  ok(evolveNow(j) === 'j_nacho_tsareena', 'Steenee -> Tsareena with 3 Grass jokers', key(j));
  next();
  j.set_debuff(true);
  ok(!j.debuff, 'Tsareena: can\'t be debuffed while every joker is Grass');
});
sec('wimpod', () => {
  start('N179_WIMPOD');
  const j = add('j_nacho_wimpod');
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 30, 'Wimpod: +30 Chips on the first hand', r.total);
  r = play(hand(['S_A']));
  ok(r.total.chips === 16 && j.debuff, 'Wimpod: Emergency Exit — the second hand of the round it faints', [r.total, j.debuff]);
  winRound(); act({ type: 'cash_out' });
  ok(!j.debuff, 'Wimpod: back after the round');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  j.ability.extra.rounds = 1;
  ok(evolveNow(j) === 'j_nacho_golisopod', 'Wimpod -> Golisopod', key(j));
  ok(P_CENTERS.j_nacho_golisopod.eternal_compat === false, 'Golisopod can\'t be Eternal');
});
sec('togedemaru', () => {
  start('N179_TOGEDEMARU');
  add('j_nacho_togedemaru'); add('j_poke_pikachu'); add('j_poke_bronzor');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 * 1.3), 'Togedemaru: each Lightning joker X1.3 (Pikachu)', r.total);
  const d0 = G.GAME.dollars;
  winRound(); flush();
  ok(G.GAME.dollars === d0 + 6, 'Togedemaru: every Metal joker earns $3 at end of round (itself + Bronzor)', G.GAME.dollars - d0);
});
sec('dhelmise', () => {
  start('N179_DHELMISE');
  const d = add('j_nacho_dhelmise');
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 * 1.5), 'Dhelmise: scores as a held Steel card (X1.5)', r.total);
  ok(!G.hand.cards.some((c) => c.dip_scoring_for), 'Dhelmise: its temporary card is gone after the hand');
  d.ability.extra.energy_count = 2;
  hand(['D_K'], { center: 'm_steel' });
  r = play(hand(['S_A']));
  ok(near(r.total.mult, Math.pow(1.5 + 1.5 * 0.05 * 2, 2)), 'Dhelmise: its Energy boosts held Steel cards (X1.65 each, itself included)', r.total);
});
sec('applin', () => {
  start('N179_APPLIN');
  const hs = G.hand.config.card_limit;
  const a = add('j_nacho_applin');
  ok(G.hand.config.card_limit === hs + 1, 'Applin: +1 hand size');
  const w = hand(['S_2']);
  const n0 = G.playing_cards.length;
  winRound(w); flush();
  ok(G.playing_cards.length === n0 - 1, 'Applin: a random deck card is destroyed at end of round', [n0, G.playing_cards.length]);
  next();
  const t = add('c_nacho_tartapple');
  ok(t.config.center.in_pool() === true, 'the apples are in the pool with an Applin owned');
  act({ type: 'highlight_joker', id: a.sort_id });
  use(t, [a.sort_id]);
  ok(a.ability.extra.evolve === 'tartapple', 'Tart Apple on Applin: marked to evolve', a.ability.extra.evolve);
  ok(evolveNow(a) === 'j_nacho_flapple', 'Applin + Tart Apple -> Flapple (evo_list)', key(a));
  next();
  const fl = a;
  const [x, y] = hand(['S_9', 'S_8']);
  const t2 = add('c_nacho_tartapple');
  use(t2, [], [x.sort_id, y.sort_id]);
  flush();
  ok(x.ability.perma_mult === 1 && y.destroyed, 'Tart Apple on two held cards: the left +1 perma Mult, the right destroyed', [x.ability.perma_mult, !!y.destroyed]);
  ok(near(fl.ability.extra.Xmult, 1.3), 'Flapple: +X0.3 per destroyed playing card', fl.ability.extra.Xmult);
  clearHand();
  play(hand(['S_A']));
  ok(near(fl.ability.extra.Xmult, 1.2), 'Flapple: -X0.1 after each hand', fl.ability.extra.Xmult);
  // Dipplin: a destroyed card comes back as a Wild copy
  const dp = add('j_nacho_dipplin');
  const [z] = hand(['D_4']);
  const n1 = G.playing_cards.length;
  N.poke_remove_card(z, dp); flush();
  ok(G.playing_cards.length === n1 && G.playing_cards.some((c) => c.base.value === '4' && c.base.suit === 'Diamonds' && N.has_enhancement(c, 'm_wild')), 'Dipplin: the destroyed card comes back as a Wild copy', [n1, G.playing_cards.length]);
});
sec('palafin', () => {
  start('N179_PALAFIN');
  const f = add('j_nacho_finizen');
  ok(f.ability.extra.rounds === 6, 'Finizen: 6 rounds to evolve');
  f.ability.extra.rounds = 1;
  ok(evolveNow(f) === 'j_nacho_palafin', 'Finizen -> Palafin', key(f));
  next();
  const lim = G.jokers.config.card_limit;
  const r = play(hand(['S_A']));
  flush();
  ok(r.total.chips === 16 + 50 && !G.jokers.cards.includes(f) && G.jokers.config.card_limit === lim - 1, 'Palafin: +50 Chips, then it vanishes (Flip Turn) keeping its slot', [r.total.chips, G.jokers.cards.map(key), G.jokers.config.card_limit]);
  winRound(); flush();
  const hero = G.jokers.cards.find((c) => key(c) === 'j_nacho_palafin_hero');
  ok(hero && G.jokers.config.card_limit === lim, 'end of round: back as Palafin-Hero, the slot released', [G.jokers.cards.map(key), G.jokers.config.card_limit]);
  next();
  const [b] = hand(['S_K'], { center: 'm_bonus' });
  const r2 = play([b]);
  ok(r2.total.chips >= 100 && b.ability.perma_bonus === 5 && near(b.ability.perma_x_mult, 0.05), 'Palafin-Hero: +100 Chips; the first card +5 perma Chips, +X0.05 if Bonus (from 0: intended-design fix)', [r2.total, b.ability.perma_bonus, b.ability.perma_x_mult]);
});
sec('frigibax', () => {
  start('N179_FRIGIBAX');
  const j = add('j_nacho_frigibax');
  const cards = hand(['S_A', 'H_A'], { center: 'm_mult' });
  play(cards);
  ok(cards[0].edition && cards[0].edition.foil && !cards[1].edition, 'Frigibax: the first scoring card with Mult becomes Foil (only one)', cards.map((c) => c.edition));
  for (const c of G.playing_cards.slice(0, 9)) c.set_edition({ foil: true }, true, true);
  ok(evolveNow(j) === 'j_nacho_arctibax', 'Frigibax -> Arctibax with 9 Foil cards', key(j));
  next();
  j.ability.evo_rqmt = 18;
  for (const c of G.playing_cards.slice(0, 18)) c.set_edition({ foil: true }, true, true);
  ok(evolveNow(j) === 'j_nacho_baxcalibur', 'Arctibax -> Baxcalibur with 18 Foil cards', key(j));
  next();
  use(add('c_poke_megastone'), [j.sort_id]);
  ok(key(j) === 'j_nacho_mega_baxcalibur', 'Baxcalibur -> Mega Baxcalibur', key(j));
  ok(!P_CENTERS.j_nacho_mega_baxcalibur.megas, '1.7.9-5 (904ae39): Mega Baxcalibur lists no Mega of its own');
  next();
  use(G.consumeables.cards.find((c) => key(c) === 'c_poke_megastone'), [j.sort_id]);
  ok(key(j) === 'j_nacho_baxcalibur', 'the Mega Stone reverts Mega Baxcalibur', key(j));
});
sec('excavator', () => {
  start('N179_EXCAVATOR');
  const x = add('j_nacho_excavator');
  ok(x.config.center.atlas === 'nacho_excavator179' && x.config.center.stage === 'Other', 'Excavator: its own art, an "Other" joker');
  G.GAME.blind.boss = true; winRound(); flush();
  next(); G.GAME.blind.boss = true; winRound(); flush();
  ok(x.ability.extra.bosses_beat === 2, 'Excavator: counts Boss Blinds', x.ability.extra.bosses_beat);
  act({ type: 'cash_out' });
  act({ type: 'sell', id: x.sort_id }); flush();
  const tag = G.GAME.tags.find((t) => t.key === 'tag_nacho_fossil_tag');
  ok(!!tag, 'Excavator: sold after 2 Bosses -> a Fossil Tag', G.GAME.tags.map((t) => t.key));
  act({ type: 'next_round' });
  flush();
  ok(G.pack_cards && G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => P_CENTERS[key(c)].attributes && P_CENTERS[key(c)].attributes.includes('ancient')), 'Fossil Tag: a free Ancient Pack of 3 ancient (fossil) Pokémon', G.pack_cards && G.pack_cards.cards.map(key));
});

// =================================================================== the art (needs the gitignored art: MICATRO_MAIN in a worktree)
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else {
  await (async () => {
    const ATL = { ...MODS.pokermon.content.atlases, ...MODS.nacho.content.atlases };
    const want = {};
    const jokers = [...NEW, ...Object.keys(REKEYED)].map((n) => P_CENTERS['j_nacho_' + n] || P_CENTERS['j_poke_' + n]);
    for (const c of jokers) {
      const shiny = c.atlas.endsWith('391') ? c.atlas.replace(/391$/, 'Shiny391') : c.atlas.replace(/^nacho_/, 'nacho_shiny_');
      for (const a of [c.atlas, shiny]) {
        const A = ATL[a];
        if (!A) { ok(false, 'art: no atlas ' + a); continue; }
        const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
        const root = A.src.includes('/nacho/') ? path.join(ART, '../../../nacho/assets/2x') : ART;
        (want[root + '|' + file] = want[root + '|' + file] || {})[c.key + '|' + a] = [c.pos.x * A.px * 2, c.pos.y * A.py * 2, A.px * 2, A.py * 2];
      }
    }
    const px = {};
    for (const [rf, rects] of Object.entries(want)) { const [root, file] = rf.split('|'); Object.assign(px, await crops(path.join(root, file), rects)); }
    const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
    for (const c of jokers) {
      const shiny = c.atlas.endsWith('391') ? c.atlas.replace(/391$/, 'Shiny391') : c.atlas.replace(/^nacho_/, 'nacho_shiny_');
      const b = px[c.key + '|' + c.atlas], s = px[c.key + '|' + shiny];
      let diff = 0; if (b && s) for (let i = 0; i < b.px.length; i++) diff += Math.abs(b.px[i] - s.px[i]);
      ok(b && s && b.inside && s.inside && opaque(b) > 0.5 && opaque(s) > 0.5 && diff > 0, `${c.key}: a real sprite and its Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, b && s && [opaque(b), opaque(s), diff]);
    }
  })().catch((e) => ok(false, 'art threw ' + e.message));
}

done();
