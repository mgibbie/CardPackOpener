// pokermon_391_reworks_b_test.mjs — Pokermon 3.9.1 upgrade, batch 7 (Plans/MICATRO_MODS_UPGRADES.md): the joker reworks
// of pokejokers_09-17 (Miltank -> Shaymin: the Gen 3 + Gen 4 range). Every existing joker of those files is on its 3.9.1
// behaviour and takes ALL its 3.9.1 static data (data391.js `reworked`: config_all, compat flags, the Joker loc entry); no
// joker of the range is held. `rework_deferred` names the parts that wait for other content (Mega Lucario, the Flower
// enhancement's X2 / X3, the Wish Pack).
//   - the overlay: every joker of 09-17 reworked, whole 3.9.1 configs / flags / text, loc_extra (Wish!); contentRev 4
//     (pin 3.9.1+r4); every reworked joker's loc_vars fills the #n# its 3.9.1 text reads
//   - one or more reworks per file FIRED through real plays: 09 the Gen-3 starters (Nature triggers, evolve after 16),
//     Blaziken, Swampert, Celebi, Ho-oh; 10 Shroomish (knockoff starter); 11 Mega Camerupt; 12 Dusclops (the unscored
//     destroy seam); 13 the Jirachi forms (Banker X3 cash-out, Booster rerolls, Power, Invis, Fixer); 14 Kricketune;
//     15 Lucario's pool rule, Lopunny; 16 Leafeon (mod-level Lucky counter), Glaceon, Magmortar, Yanmega, Porygon-Z,
//     the Rotom forms' pool rule; 17 Shaymin
//   - the shared changes: find_pokemon_type's 3.9.1 exclude args, rules.evaluate_round no longer doubles for Jirachi
//   - the deferred parts and the house rules stay
//   node micatro/tests/mods/pokermon_391_reworks_b_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { probability_vars } from '../../js/engine/core.js';
import DATA from '../../mods/pokermon/data.js';
import D391 from '../../mods/pokermon/data391.js';
import { find_pokemon_type } from '../../mods/pokermon/systems/types.js';
import { evaluate_round } from '../../mods/pokermon/systems/rules.js';

const { ok, done } = T();
const C = (n) => P_CENTERS['j_poke_' + n];
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const JOKER_LOC = DATA.loc.descriptions.Joker;
const RANGE = /pokejokers_(09|1[0-7])\.lua$/;
const inRange = DATA.groups.jokers.filter((f) => RANGE.test(f.file)).flatMap((f) => f.ret.list.map((it) => it.name));
const RW = (D391.reworked || []).filter((n) => inRange.includes(n));
const CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

// ---------------------------------------------------------------- the overlay + version
ok(MODS.pokermon.version === '3.9.1' && MODS.pokermon.contentRev >= 4 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon 3.9.1, contentRev 4 or later (batch 8: 5)', PINS.modPin('pokermon'));
ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'the legacy pin is untouched');
ok(inRange.length === 97 && RW.length === 97, 'reworked: every joker of pokejokers_09-17, no holds (Pokermon 3.9.1)', [RW.length, inRange.length]);
ok(!(D391.rework_hold || []).some(([n]) => inRange.includes(n)), 'nothing of 09-17 is held on 3.2.1');
ok((D391.rework_deferred || []).map(([n]) => n).filter((n) => inRange.includes(n)).sort().join() === 'jirachi,lucario,porygonz,shaymin,shaymin_sky', 'rework_deferred (09-17): Lucario (Mega), Shaymin x2 (Flower X2/X3), Jirachi (Wish Pack), Porygon-Z (usage counter)', D391.rework_deferred);
ok(C('treecko').config.evo_rqmt === 16 && C('treecko').config.extra.triggers === 0 && C('treecko').config.extra.num === undefined && C('treecko').perishable_compat !== false,
  'a reworked joker takes its whole 3.9.1 config and flags (Treecko: 16 triggers, no coin flip, Perishable allowed) (Pokermon 3.9.1)', C('treecko').config);
ok(C('mega_camerupt').config.extra.Xmult_mod === 0.5 && C('yanmega').config.extra.mult_mod === 6 && C('glaceon').config.extra.retriggers === 1 && C('jirachi_power').config.extra.every === 2
  && C('leafeon').config.extra.h_size === undefined, 'renamed / new / dropped keys follow 3.9.1 (Mega Camerupt, Yanmega, Glaceon, Jirachi Power, Leafeon) (Pokermon 3.9.1)');
ok(C('magmortar').blueprint_compat === true && C('leafeon').blueprint_compat === true && C('glaceon').blueprint_compat === true && C('jirachi_booster').blueprint_compat === true
  && C('jirachi_invis').blueprint_compat === true && C('poochyena').perishable_compat === false && C('mantyke').perishable_compat === false,
  'compat flags: Magmortar / Leafeon / Glaceon / Jirachi Booster / Invis Blueprint-compatible; Poochyena, Mantyke not Perishable (Pokermon 3.9.1)');
ok(/Nature/.test(JOKER_LOC.j_poke_treecko.text.join(' ')) && /triggering/.test(JOKER_LOC.j_poke_treecko.text.join(' ')) && /Triples/.test(JOKER_LOC.j_poke_leafeon.text.join(' ')),
  'reworked jokers show their 3.9.1 text (Treecko, Leafeon) (Pokermon 3.9.1)', JOKER_LOC.j_poke_treecko.text);
ok(DATA.loc.misc.dictionary.poke_wish_ex === 'Wish!', 'loc_extra: Jirachi Booster\'s "Wish!" (Pokermon 3.9.1)');
{
  // every reworked joker's loc_vars fills each #n# its 3.9.1 text reads (Lua nil at an index the text never reads is fine)
  start('RW391B_LOC');
  const bad = [];
  const used = (text) => { const s = new Set(); for (const l of [text].flat(3)) for (const x of String(l).matchAll(/#(\d+)#/g)) s.add(+x[1]); return [...s]; };
  for (const n of RW) {
    const c = add('j_poke_' + n);
    const center = c.config.center;
    let ret;
    try { ret = center.loc_vars ? center.loc_vars(center, [], c) : { vars: [] }; } catch (e) { bad.push(n + ': throws ' + e.message); continue; }
    const entry = JOKER_LOC[(ret && ret.key) || center.key];
    const vars = (ret && ret.vars) || [];
    if (!entry) { bad.push(n + ': no loc'); continue; }
    const miss = used(entry.text).filter((i) => vars[i - 1] === undefined || (typeof vars[i - 1] === 'number' && Number.isNaN(vars[i - 1])));
    if (miss.length) bad.push(`${n}: #${miss.join('#, #')}# unfilled, got ${JSON.stringify(vars)}`);
    c.remove();
  }
  ok(bad.length === 0, `every reworked joker's loc_vars fills its 3.9.1 text (${RW.length}) (Pokermon 3.9.1)`, bad);
}

// ---------------------------------------------------------------- 09: the Gen-3 starters
{
  start('RW391B_TORCH');
  const j = add('j_poke_torchic');
  const tg = j.ability.extra.targets;
  const r = play(hand(['S_' + CODE[tg[0].id], 'H_' + CODE[tg[0].id]]));
  ok(r.total.mult === 2 + 5 + 5 && j.ability.extra.triggers === 2, 'torchic: +5 Mult per scored Nature card, counts triggers (Pokermon 3.9.1)', [r.total, j.ability.extra]);
  j.ability.extra.triggers = 16;
  winRound();
  ok(key(j) === 'j_poke_combusken' && JSON.stringify(j.ability.extra.targets) === JSON.stringify(tg), 'torchic -> combusken after 16 triggers, Nature kept (Pokermon 3.9.1)', key(j));
}
{
  start('RW391B_MUDK');
  const j = add('j_poke_mudkip');
  add('j_poke_squirtle');
  const tg = j.ability.extra.targets;
  const r = play(hand(['S_' + CODE[tg[0].id]]));
  const nom = j.ability.extra.targets[0].id === 14 ? 11 : Math.min(10, tg[0].id);
  ok(r.total.chips === 5 + nom + 30 + G.jokers.cards[1].ability.extra.chips, 'mudkip: +30 Chips, no "doubled with another Water" (Pokermon 3.9.1)', r.total);
}
{
  start('RW391B_TREE');
  const j = add('j_poke_treecko');
  const tg = j.ability.extra.targets;
  const d0 = G.GAME.dollars;
  play(hand(['S_' + CODE[tg[1].id]]));
  ok(G.GAME.dollars === d0 + 1, 'treecko: always $1 per scored Nature card (no 1 in 2) (Pokermon 3.9.1)', G.GAME.dollars - d0);
}
{
  start('RW391B_BLAZ');
  const j = add('j_poke_blaziken');
  const tg = j.ability.extra.targets;
  for (let i = 0; i < 5; i++) {
    const [c] = hand(['D_' + CODE[tg[i % 3].id]]);
    act({ type: 'highlight', ids: [c.sort_id] }); act({ type: 'discard' });
    clearHand();
  }
  const r = play(hand(['S_' + CODE[tg[0].id]]));
  ok(j.ability.extra.cards_discarded === 5 && near(r.total.mult, (1 + 10) * 1.5), 'blaziken: after 5 Nature discards each Fire / Fighting Joker (itself) X1.5 (Pokermon 3.9.1)', [r.total, j.ability.extra.cards_discarded]);
}
{
  start('RW391B_SWAMP');
  const j = add('j_poke_swampert');
  add('j_poke_squirtle');
  const tg = j.ability.extra.targets;
  play(hand(['H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id], 'H_' + CODE[tg[2].id], 'H_' + CODE[tg[0].id], 'H_' + CODE[tg[1].id]]));
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Tarot', 'swampert: 5 scoring Nature cards -> a Tarot per 2 Water / Earth Jokers (Pokermon 3.9.1)', G.consumeables.cards.map(key));
}
{
  start('RW391B_CELEBI');
  add('j_poke_celebi');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + G.GAME.round * 0.05) && G.GAME.round >= 1, 'celebi: X(1 + 0.05 x rounds played) (Pokermon 3.9.1)', [r.total, G.GAME.round]);
}

// ---------------------------------------------------------------- 10-12
ok(C('shroomish').knockoff_starter === true && C('numel').knockoff_starter === true, 'Shroomish and Numel are knockoff starters (Pokermon 3.9.1 flag)');
{
  start('RW391B_MCAM');
  const j = add('j_poke_mega_camerupt');
  play(hand(['S_A', 'H_A'], { center: 'm_mult' }));
  ok(near(j.ability.extra.Xmult, 2), 'mega camerupt: +X0.5 (Xmult_mod) per Mult card scored (Pokermon 3.9.1)', j.ability.extra);
}
{
  start('RW391B_DUSC');
  add('j_poke_dusclops');
  G.GAME.current_round.hands_left = 1;
  G.consumeables.config.card_limit = 0;
  const k = hand(['S_K']);
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  act({ type: 'highlight', ids: [...hand(['S_3', 'H_3', 'D_3', 'C_3']), ...k].map((c) => c.sort_id) });
  act({ type: 'play' }); G.E_MANAGER.flush();
  ok(!G.playing_cards.includes(k[0]) && G.consumeables.cards.length === 0, 'dusclops: the lone unscored card of the last hand is destroyed in the destroy pass; no Spectral without room (Pokermon 3.9.1)', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- 13: the Jirachi forms
{
  start('RW391B_BANK');
  add('j_poke_jirachi_banker');
  winRound();
  const rows = G.GAME.round_eval.rows;
  const jr = rows.find((x) => x.name === 'cashout_mod1');
  const before = rows.filter((x) => x !== jr).reduce((n, x) => n + (x.dollars || 0), 0);
  ok(jr && G.GAME.round_eval.total === 3 * before && before > 0, 'jirachi banker: X3 end-of-round payout (modify_final_cashout) (Pokermon 3.9.1)', rows);
  ok(evaluate_round([{ dollars: 5 }]) === undefined, 'rules.evaluate_round no longer adds a Jirachi doubling row (3.9.1 dropped the lovely patch)');
}
{
  start('RW391B_BOOST');
  const j = add('j_poke_jirachi_booster');
  winRound(); act({ type: 'cash_out' });
  const n0 = G.shop_booster.cards.length;
  G.GAME.dollars = 100;
  act({ type: 'reroll_shop' });
  ok(G.shop_booster.cards.length === n0 + 1 && j.ability.extra.rerolls === 1, 'jirachi booster: a reroll adds a Booster to the shop (Pokermon 3.9.1)', [G.shop_booster.cards.length - n0]);
}
{
  start('RW391B_POWER');
  const j = add('j_poke_jirachi_power');
  play(hand(['S_A'])); play(hand(['S_K']));
  const r = play(hand(['S_Q', 'H_Q']));
  ok(r.total.mult === 2 * 2 * 2 && j.config.center.loc_vars(j.config.center, [], j).vars[1] === 3, 'jirachi power: X2 per card every 3rd hand (every = 2, shown as 3) (Pokermon 3.9.1)', r.total);
}
{
  start('RW391B_INVIS');
  const inv = add('j_poke_jirachi_invis');
  const cat = add('j_poke_caterpie');
  const w1 = add('j_poke_weedle'), w2 = add('j_poke_weedle');
  let r = play(hand(['S_A']));
  const m = cat.ability.extra.mult;
  ok(r.total.mult === 1 + m && G.jokers.cards.includes(inv), 'jirachi invis: no copy with fewer than 3 Energized Jokers, and it stays (Pokermon 3.9.1)', r.total);
  for (const c of [cat, w1, w2]) c.ability.extra.energy_count = 1;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 2 * m, 'jirachi invis: copies the Joker to its right with 3 Energized Jokers (Pokermon 3.9.1)', r.total);
}
{
  start('RW391B_FIX');
  add('j_poke_jirachi_fixer');
  const [d] = hand(['H_5']);
  hand(['H_6']);
  act({ type: 'highlight', ids: [d.sort_id] }); act({ type: 'discard' }); G.E_MANAGER.flush();
  ok(!G.playing_cards.includes(d) && G.consumeables.cards.length === 1 && ['c_death', 'c_cryptid', 'c_poke_metalcoat'].includes(key(G.consumeables.cards[0])),
    'jirachi fixer: a 1-card first discard is destroyed and makes a Death / Cryptid / Metal Coat (Pokermon 3.9.1)', G.consumeables.cards.map(key));
}

// ---------------------------------------------------------------- 14-15
{
  start('RW391B_KRIC');
  add('j_poke_kricketune');
  G.consumeables.config.card_limit = 0;
  G.GAME.probabilities.normal = 1000;
  const d0 = G.GAME.dollars;
  play(hand(['S_2', 'H_5', 'D_8', 'C_J']));
  G.GAME.probabilities.normal = 1;
  ok(G.GAME.dollars === d0 + 4 && G.consumeables.cards.length === 0 && G.GAME.consumeable_buffer === 0, 'kricketune: $4, and no Tarot without room (Pokermon 3.9.1)', [G.GAME.dollars - d0, G.GAME.consumeable_buffer]);
}
{
  start('RW391B_LUC');
  for (const c of G.playing_cards) c.edition = null;
  ok(C('lucario').in_pool(C('lucario')) === false, 'lucario: not in the pool without an editioned playing card (Pokermon 3.9.1)');
  G.playing_cards[3].set_edition({ holo: true }, true);
  ok(C('lucario').in_pool(C('lucario')) !== false, 'lucario: in the pool with one (Pokermon 3.9.1)');
}

// ---------------------------------------------------------------- 16
{
  start('RW391B_LEAF');
  add('j_poke_leafeon');
  ok(probability_vars(null, 1, 4).join() === '1,4', 'leafeon: no effect before a Lucky trigger this round');
  G.GAME.probabilities.normal = 1000;
  play(hand(['S_K'], { center: 'm_lucky' }));
  G.GAME.probabilities.normal = 1;
  ok(probability_vars(null, 1, 4).join() === '3,4', 'leafeon: triples listed probabilities after a Lucky card triggered (mod-level counter) (Pokermon 3.9.1)', probability_vars(null, 1, 4));
  winRound();
  ok(probability_vars(null, 1, 4).join() === '1,4', 'leafeon: resets at end of round (Pokermon 3.9.1)');
}
{
  start('RW391B_GLAC');
  add('j_poke_glaceon');
  G.GAME.probabilities.normal = 0;
  const r = play(hand(['S_A'], { center: 'm_glass' }));
  G.GAME.probabilities.normal = 1;
  ok(r.total.mult === 4, 'glaceon: Glass cards retrigger (X2 twice) (Pokermon 3.9.1)', r.total);
}
{
  start('RW391B_MAGM');
  const j = add('j_poke_magmortar');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 && !statusMsgs(r.events).some((x) => /Fire Blast/.test(x)), 'magmortar: silent until it has gained (Pokermon 3.9.1)', statusMsgs(r.events));
  const [d] = hand(['H_9']);
  act({ type: 'highlight', ids: [d.sort_id] }); act({ type: 'discard' });
  ok(j.ability.extra.mult === 2 && !G.playing_cards.includes(d), 'magmortar: a 1-card first discard is destroyed, +2 Mult');
}
{
  start('RW391B_YAN');
  add('j_poke_yanmega');
  G.GAME.probabilities.normal = 0;
  const r = play(hand(['S_3']));
  G.GAME.probabilities.normal = 1;
  ok(r.total.chips === 5 + 3 + 12 && r.total.mult === 1 + 6, 'yanmega: +12 Chips +6 Mult from chip_mod / mult_mod (Pokermon 3.9.1 keys)', r.total);
}
ok(['rotomh', 'rotomw', 'rotomf', 'rotomfan', 'rotomm'].every((n) => C(n).in_pool(C(n)) === false), 'the Rotom forms are never in a pool (Pokermon 3.9.1)');

// ---------------------------------------------------------------- shared: find_pokemon_type's exclude args (3.9.1)
{
  start('RW391B_FPT');
  const a = add('j_poke_bulbasaur'), b = add('j_poke_oddish');
  ok(find_pokemon_type('Grass').length === 2 && find_pokemon_type('Grass', a).length === 1 && find_pokemon_type('Grass', null, 'oddish').length === 1,
    'find_pokemon_type(type, exclude_card, exclude_name) (Pokermon 3.9.1)');
  void b;
}

// ---------------------------------------------------------------- deferred parts + house rules
ok(!(C('lucario').megas || []).includes('mega_lucario') && !P_CENTERS.j_poke_mega_lucario, 'deferred: no Mega Lucario yet (a new 3.9.1 joker)');
ok(P_CENTERS.m_poke_flower && JSON.stringify(P_CENTERS.m_poke_flower.config).includes('3'), 'deferred: the Flower enhancement keeps its 3.2.1 X3 (its 3.9.1 X2 / X3 rule waits for batch 10)', P_CENTERS.m_poke_flower && P_CENTERS.m_poke_flower.config);
ok(/contains/.test(JOKER_LOC.j_poke_deino.text[1]), 'house rule: Deino "contains a Three of a Kind" (pokejokers_21, untouched)');
ok(!!C('jirachi_copy') && !!C('jirachi_negging'), 'kept: the two written-but-unregistered Jirachi forms stay defined (intended-design fix)');

done();
