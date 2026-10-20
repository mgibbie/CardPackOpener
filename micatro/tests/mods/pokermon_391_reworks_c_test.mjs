// pokermon_391_reworks_c_test.mjs — Pokermon 3.9.1 upgrade, batch 8 (Plans/MICATRO_MODS_UPGRADES.md): the joker reworks
// of pokejokers_18-34 (Pansage -> Gholdengo: Gen 5-9) and the non-Pokédex files (zotherjokers, zmissingno). Every existing
// joker of those files is on its 3.9.1 behaviour and takes ALL its 3.9.1 static data (data391.js `reworked`), except the
// holds: the Hazard jokers (Roggenrola line, Ferroseed line, Golett line, Tarountula line: the Hazard layer, batch 10) and
// Unown Swarm (the Unown rework). `rework_deferred` names the parts that wait for new content (Bitter Rival / Champion,
// the Oologist, the Unown rework's Ruins of Alph spawn).
//   - the overlay: reworked / held / deferred sets, whole 3.9.1 configs / flags / text; contentRev 5 (pin 3.9.1+r5); every
//     reworked joker's loc_vars fills the #n# its 3.9.1 text reads
//   - one or more reworks per file FIRED through real plays
//   - the new seams: the destroy_card contexts carry scoring_name / poker_hands, poke_evolve's energize_amount,
//     create_consumeable / smods_copy_card / destroy_joker, get_random_poke_key's exclude_types
//   - the holds stay on 3.2.1, the house rules stay
//   node micatro/tests/mods/pokermon_391_reworks_c_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { create_card } from '../../js/engine/core.js';
import DATA from '../../mods/pokermon/data.js';
import D391 from '../../mods/pokermon/data391.js';
import * as API from '../../mods/pokermon/api.js';

const { ok, done } = T();
const C = (n) => P_CENTERS['j_poke_' + n];
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-6;
const JOKER_LOC = DATA.loc.descriptions.Joker;
const RANGE = /(pokejokers_(1[89]|2\d|3\d)|zotherjokers|zmissingno)\.lua$/;
const list = (f) => (Array.isArray(f.ret.list) ? f.ret.list : []);
const inRange = DATA.groups.jokers.filter((f) => RANGE.test(f.file)).flatMap((f) => list(f).map((it) => it.name));
const RW = (D391.reworked || []).filter((n) => inRange.includes(n));
/** One fired block: a throw (old code without the 3.9.1 hook) counts as a failure and the rest still runs. */
const blk = (fn) => { try { fn(); } catch (e) { ok(false, 'block threw: ' + e.message); } };
// (batch 10 took the 9 Hazard jokers off hold: pokermon_391_hazard_test.mjs)
// (batch 10b: the Unown Swarm, the last hold here, is reworked — the Unown rework)
const HOLD = [];

// ---------------------------------------------------------------- the overlay + version
ok(MODS.pokermon.version === '3.9.1' && MODS.pokermon.contentRev >= 5 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon 3.9.1, contentRev 5+ (pin 3.9.1+r5 since batch 8; r6 batch 10)', PINS.modPin('pokermon'));
ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'the legacy pin is untouched');
ok(inRange.length === 93 && RW.length === 93 - HOLD.length && HOLD.every((n) => !RW.includes(n)), 'reworked: every joker of pokejokers_18-34 / zotherjokers / zmissingno (Pokermon 3.9.1; the Unown Swarm since batch 10b)', [RW.length, inRange.length]);
const holds = (D391.rework_hold || []).filter(([n]) => inRange.includes(n));
ok(holds.map(([n]) => n).sort().join() === HOLD.slice().sort().join() && holds.every(([n, why]) => n === 'unown_swarm' ? /Unown rework/.test(why) : /Hazard layer/.test(why)),
  'rework_hold: none here (the Hazard jokers left in batch 10, the Unown Swarm in 10b)', holds);
const DEF = (D391.rework_deferred || []).map(([n]) => n);
ok(['rival', 'mystery_egg'].every((n) => DEF.includes(n)) && !DEF.includes('ruins_of_alph') && DEF.length === 5, 'rework_deferred: + Rival (Bitter Rival / Champion), Mystery Egg (Oologist); Ruins of Alph\'s Unown spawn done in batch 10b', DEF);
ok(C('garbodor').config.extra.active === false && C('vikavolt').config.extra.mult === undefined && C('vikavolt').config.extra.Xmult === 0.5
  && C('annihilape').config.extra.mult_mod === 5 && C('gholdengo').config.extra.Xmult1 === 1 && C('everstone').config.extra.Xmult_multi2 === 1.5
  && C('rival').config.extra.money === 15 && C('mimikyu').config.extra.disguise === undefined && C('dreepy').config.extra.suit === undefined,
  'a reworked joker takes its whole 3.9.1 config (Garbodor, Vikavolt, Annihilape, Gholdengo, Everstone, Rival, Mimikyu, Dreepy) (Pokermon 3.9.1)');
ok(C('vanillite').blueprint_compat === true && C('rival').blueprint_compat === false && C('treasure_eatery').blueprint_compat === false
  && C('trubbish').perishable_compat === false && C('mystery_egg').perishable_compat === false && C('rival').cost === 5,
  'compat flags / cost: the Vanillite line Blueprint-compatible, Rival / Treasure Eatery not; Trubbish / Mystery Egg not Perishable; Rival $5 (Pokermon 3.9.1)');
ok(/after skipping/.test(JOKER_LOC.j_poke_rival.text.join(' ')) && /held/.test(JOKER_LOC.j_poke_kingambit.text.join(' ')) && /copy of a random card/.test(JOKER_LOC.j_poke_sylveon.text.join(' '))
  && /leftmost card's/.test(JOKER_LOC.j_poke_dreepy.text.join(' ')), 'reworked jokers show their 3.9.1 text (Rival, Kingambit, Sylveon, Dreepy)');
ok(JOKER_LOC.j_poke_pumpkaboo_large && /Jacks/.test(JOKER_LOC.j_poke_gourgeist_large.text.join(' ')) && /poke_psychic/.test(JOKER_LOC.j_poke_gourgeist_large.text.join(' ')),
  'Pumpkaboo / Gourgeist take their 3.9.1 per-size entries (the generator reads a form-keyed joker\'s forms)');
ok(/hazard layer/i.test(JOKER_LOC.j_poke_roggenrola.text.join(' ')) && D391.loc.Joker.j_poke_roggenrola && C('roggenrola').config.extra.hazard_level === 1 && C('roggenrola').config.extra.hazards === undefined,
  'a former Hazard hold takes its 3.9.1 text and config (Roggenrola: hazard_level, batch 10)', C('roggenrola').config);
blk(() => {
  start('RW391C_LOC');
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
    if (G.jokers.cards.includes(c)) { G.jokers.remove_card(c); c.remove(); }
  }
  ok(bad.length === 0, `every reworked joker's loc_vars fills its 3.9.1 text (${RW.length}) (Pokermon 3.9.1)`, bad);
});

// ---------------------------------------------------------------- 18: Simisear (the destroy pass + its context)
blk(() => {
  start('RW391C_SIMI');
  add('j_poke_simisear');
  const h = add('j_poke_hydreigon');
  const x0 = h.ability.extra.Xmult;
  const cards = hand(['S_2', 'S_5', 'S_8', 'S_K', 'H_3']);
  play(cards);
  ok(!G.playing_cards.includes(cards[4]) && key(G.consumeables.cards[0]) === 'c_empress' && near(h.ability.extra.Xmult, x0 + h.ability.extra.Xmult_mod),
    'simisear: a first-hand Flush makes The Empress and its unscored card is destroyed in the destroy_card pass (a remove_playing_cards listener sees it) (Pokermon 3.9.1)', [G.consumeables.cards.map(key), h.ability.extra.Xmult]);
});
blk(() => {
  // The seam: a mod joker's destroy_card context (scored and unscored) carries scoring_name / poker_hands, like SMODS.
  start('RW391C_SEAM');
  const j = add('j_poke_simisear');
  const seen = [];
  const orig = j.config.center.calculate;
  j.config.center.calculate = function (self, card, context) { if (context.destroy_card) seen.push([context.cardarea === 'unscored' ? 'u' : 'p', context.scoring_name, !!(context.poker_hands && context.poker_hands.Pair)]); return orig.call(this, self, card, context); };
  try { play(hand(['S_9', 'H_9', 'D_4'])); } finally { j.config.center.calculate = orig; }
  ok(seen.length === 3 && seen.every(([, n, p]) => n === 'Pair' && p) && seen.filter(([a]) => a === 'u').length === 1, 'seam: destroy_card contexts carry scoring_name / poker_hands (SMODS.calculate_destroying_cards)', seen);
});

// ---------------------------------------------------------------- 19: Trubbish / Garbodor / Zorua
blk(() => {
  start('RW391C_TRUB');
  const j = add('j_poke_trubbish');
  j.ability.extra.triggers = 3;
  const dl = G.GAME.current_round.discards_left;
  winRound();
  ok(key(j) === 'j_poke_garbodor' && j.ability.extra.chips === 3 * dl, 'trubbish: scales at end of round and evolves through scaling_evo (Pokermon 3.9.1)', [key(j), j.ability.extra]);
});
blk(() => {
  start('RW391C_GARB');
  const j = add('j_poke_garbodor');
  for (let i = 0; i < 2; i++) nextRound();
  ok(G.GAME.blind.boss, 'boss blind');
  const t0 = G.GAME.tags.length;
  j.calculate_joker({ end_of_round: true, main_eval: true, game_over: false }); G.E_MANAGER.flush();
  ok(j.ability.extra.active === true && G.GAME.tags.length === t0, 'garbodor: a clean ante arms the Garbage Tag at end of round... (Pokermon 3.9.1)', j.ability.extra);
  j.config.center.calc_dollar_bonus(j.config.center, j); G.E_MANAGER.flush();
  ok(j.ability.extra.active === false && G.GAME.tags.length === t0 + 1 && G.GAME.tags.some((t) => t.key === 'tag_garbage'), '...and it comes with the cash-out (calc_dollar_bonus) (Pokermon 3.9.1)', G.GAME.tags.map((t) => t.key));
});
blk(() => {
  start('RW391C_ZORUA');
  const z = add('j_poke_zorua');
  add('j_four_fingers'); // not Blueprint-compatible
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 && z.ability.extra.active === false, 'zorua: only copies a Blueprint-compatible rightmost joker (SMODS.blueprint_effect) — it is revealed all the same (Pokermon 3.9.1)', r.total);
  z.ability.extra.active = true;
  add('j_joker');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 + 4 && z.ability.extra.active === false, 'zorua: copies Joker, then is revealed');
  const rounds = z.ability.extra.rounds;
  winRound();
  ok(z.ability.extra.active === true && z.ability.extra.rounds === rounds - 1, 'zorua: resets in the main end-of-round pass and still counts its round (Pokermon 3.9.1)', z.ability.extra);
  const s = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_zorua');
  ok(P_CENTERS[s.ability.extra.hidden_key].ptype !== 'Dark' && P_CENTERS[s.ability.extra.hidden_key].rarity === 1, 'zorua: a shop Zorua\'s Illusion is a Common non-Dark Pokémon (exclude_types) (Pokermon 3.9.1)', s.ability.extra.hidden_key);
});
blk(() => ok(Array.from({ length: 30 }, (_, i) => API.get_random_poke_key_options({ key_append: 'x' + i, exclude_types: ['Fire', 'Water'] })).every((k) => !['Fire', 'Water'].includes(P_CENTERS[k].ptype)),
  'seam: get_random_poke_key_options / exclude_types (3.9.1 pokermon.get_random_poke_key_options)'));

// ---------------------------------------------------------------- 20: the Vanillite line
blk(() => {
  start('RW391C_VAN');
  add('j_blueprint');
  const j = add('j_poke_vanilluxe');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 280 && j.ability.extra.chips === 130, 'vanilluxe: Blueprint copies +140 Chips, the melt count drops once (Pokermon 3.9.1)', r.total);
  const v = add('j_poke_vanillite');
  v.ability.eternal = true;
  ok(API.destroy_joker(v) === false && G.jokers.cards.includes(v), 'seam: destroy_joker keeps an Eternal joker (SMODS.destroy_cards)');
});

// ---------------------------------------------------------------- 21-22
blk(() => {
  start('RW391C_CHAN');
  const j = add('j_poke_chandelure');
  const cheap = add('j_joker');
  cheap.sell_cost = 1;
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, (1 + j.sell_cost + 4) * j.ability.extra.Xmult_multi), 'chandelure: a $1 joker gives XMult (Pokermon 3.9.1)', r.total);
});
blk(() => {
  start('RW391C_DEINO');
  const j = add('j_poke_deino');
  const r = play(hand(['S_4', 'H_4', 'D_4', 'C_5', 'S_5']));
  ok(near(r.total.mult, 4 * 1.5) && j.ability.extra.hand_played === 1, 'house rule kept: Deino triggers on a hand CONTAINING a Three of a Kind (Full House)', [r.total, j.ability.extra]);
  ok(/contains a \{C:attention\}Three of a Kind/.test(JOKER_LOC.j_poke_deino.text.join(' ')) && /contains a \{C:attention\}Three of a Kind/.test(JOKER_LOC.j_poke_zweilous.text.join(' ')),
    'house rule kept: Deino / Zweilous 3.9.1 text says "contains a Three of a Kind"', JOKER_LOC.j_poke_deino.text);
});

// ---------------------------------------------------------------- 24: Sylveon, Pumpkaboo / Gourgeist
blk(() => {
  start('RW391C_SYL', {}, { noBlind: true });
  add('j_poke_sylveon');
  const n0 = G.playing_cards.length;
  act({ type: 'select_blind' });
  ok(G.playing_cards.length === n0 + 1 && G.hand.cards.filter((c) => c.edition && (c.edition.foil || c.edition.holo || c.edition.polychrome)).length === 1,
    'sylveon: the round begins with a Foil / Holo / Polychrome copy of a deck card in hand (Pokermon 3.9.1)');
});
blk(() => {
  start('RW391C_PUMP');
  const j = add('j_poke_pumpkaboo');
  j.ability.extra.jacks_discarded = j.ability.extra.jack_target - 1;
  G.GAME.current_round.discards_left = 5;
  const js = hand(['S_J', 'H_J', 'D_4']);
  act({ type: 'highlight', ids: js.map((c) => c.sort_id) }); act({ type: 'discard' }); G.E_MANAGER.flush();
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral' && j.ability.extra.jacks_discarded === 1,
    'pumpkaboo: the Jack that reaches the target makes a Spectral, the next Jack in the same discard starts the count again (Pokermon 3.9.1)', j.ability.extra);
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_gourgeist' && j.ability.extra.money === 6 && j.ability.extra.jacks_discarded === 1, 'pumpkaboo -> gourgeist: $6 at every size, the Jack count kept (poke_custom_values_to_keep) (Pokermon 3.9.1)', j.ability.extra);
});

// ---------------------------------------------------------------- 25-26
blk(() => {
  start('RW391C_VIKA');
  add('j_poke_vikavolt');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5), 'vikavolt: counts itself, no +Mult (Pokermon 3.9.1)', r.total);
});
blk(() => {
  start('RW391C_DUSK');
  add('j_poke_lycanroc_dusk');
  play(hand(['S_2', 'H_2', 'S_3', 'H_3']));
  const r = play(hand(['D_2', 'C_2', 'D_3', 'C_3']));
  ok(r.total.chips === 35, 'lycanroc dusk: retriggers on every hand (Pokermon 3.9.1)', r.total);
});

// ---------------------------------------------------------------- 30-34
blk(() => {
  start('RW391C_DREEPY');
  const j = add('j_poke_dreepy');
  hand(['D_2', 'H_K', 'C_9']);
  act({ type: 'sell', id: j.sort_id });
  ok(G.hand.cards.every((c) => c.base.suit === 'Diamonds'), 'dreepy: sold, the hand takes the leftmost card\'s suit (Pokermon 3.9.1)', G.hand.cards.map((c) => c.base.suit));
});
blk(() => {
  start('RW391C_TINKA', {}, { noBlind: true });
  const j = add('j_poke_tinkatink');
  act({ type: 'select_blind' });
  const c = G.playing_cards.find((x) => x.ability.debuff_sources && x.ability.debuff_sources['tinkatink' + j.unique_val]);
  c.ability.debuff_sources.boss_rule = true;
  winRound();
  ok(c.ability.debuff_sources.boss_rule === true && !c.ability.debuff_sources['tinkatink' + j.unique_val], 'tinkatink: lifts only its own debuffs (Pokermon 3.9.1)', c.ability.debuff_sources);
});
blk(() => {
  start('RW391C_KING');
  const j = add('j_poke_kingambit');
  for (const c of G.playing_cards) if (c.get_id() === 13) c.set_base(API.P_CARDS ? API.P_CARDS[c.base.suit[0] + '_2'] : c.config.card);
  j.ability.extra.Xmult = 4;
  hand(['D_K']);
  const r = play(hand(['S_5', 'H_5']));
  ok(near(r.total.mult, 2 * 2 * 2 * 4), 'kingambit: the deck\'s only King held in hand -> each nonface card X2 (Pokermon 3.9.1)', r.total);
});
blk(() => {
  start('RW391C_ANNI');
  add('j_poke_annihilape');
  const r = play(hand(['S_2']));
  ok(r.total.chips === 5 + 2 + 7 && r.total.mult === 1 + 5, 'annihilape: chip_mod / mult_mod (Pokermon 3.9.1 keys)', r.total);
});
blk(() => {
  start('RW391C_GIMMI');
  const g = add('j_poke_gimmighoul');
  const h = add('j_poke_gholdengo');
  G.GAME.dollars = 0;
  const r = play(hand(['S_A'], { center: 'm_gold' }));
  ok(G.GAME.dollars === 0 && near(h.ability.extra.Xmult, 1.5) && near(r.total.mult, 1.5) && g.ability.extra.money_seen === 6,
    'gimmighoul + gholdengo: Gimmighoul\'s $3 goes into dollar_buffer, so Gholdengo can spend it in the same card; both moves are seen (money_altered) (Pokermon 3.9.1)', [G.GAME.dollars, h.ability.extra.Xmult, g.ability.extra.money_seen, r.total]);
  ok(C('gimmighoulr').in_pool(C('gimmighoulr')) === false, 'gimmighoul (roaming): never in a pool (Pokermon 3.9.1)');
});

// ---------------------------------------------------------------- zotherjokers / zmissingno
blk(() => {
  start('RW391C_EVER');
  add('j_poke_everstone');
  add('j_poke_yamper');
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5), 'everstone: Basic Pokémon X1.5 (Pokermon 3.9.1)', r.total);
});
blk(() => {
  start('RW391C_RIVAL', {}, { noBlind: true });
  const j = add('j_poke_rival');
  act({ type: 'skip_blind' });
  if (G.STATE !== STATES.BLIND_SELECT) act({ type: 'skip_booster' });
  act({ type: 'select_blind' }); clearHand();
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const d0 = G.GAME.dollars;
  winRound();
  ok(!G.jokers.cards.includes(j) && G.GAME.dollars - d0 === 25 && G.GAME.poke_rival_defeated === true && C('rival').in_pool(C('rival')) === false,
    'rival: +$10 per skip, a beaten Boss pays $25 and it leaves the pool for good (Pokermon 3.9.1)', [G.GAME.dollars - d0]);
});
blk(() => {
  start('RW391C_EGG');
  add('j_joker');
  const j = add('j_poke_mystery_egg');
  ok(C(j.ability.extra.key.slice(7)) && ['Basic', 'Baby'].includes(P_CENTERS[j.ability.extra.key].stage) && [1, 2, 3].includes(P_CENTERS[j.ability.extra.key].rarity),
    'mystery egg: its Pokémon comes from the stage_baby / stage_basic attribute pools (poll_object) (Pokermon 3.9.1)', j.ability.extra.key);
  const target = j.ability.extra.key;
  j.ability.extra.rounds = 1;
  winRound();
  ok(G.jokers.cards[1] === j && key(j) === target && (j.ability.extra.energy_count || 0) === 1,
    'mystery egg: hatches in place, energized once (poke_evolve energize_amount) (Pokermon 3.9.1)', [G.jokers.cards.map(key), j.ability.extra]);
});
blk(() => {
  // The in-place hatch into a Pokémon with a Nature (targets): the egg has none to carry, so the hatchling keeps its own
  // (Lua pairs() skips nil kept values; the fuzz found the 3.2.1 JS port deleting them).
  start('RW391C_EGG2');
  const j = add('j_poke_mystery_egg');
  j.ability.extra.key = 'j_poke_treecko';
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_treecko' && Array.isArray(j.ability.extra.targets) && j.ability.extra.targets.length > 0, 'mystery egg -> Treecko keeps its Nature targets', j.ability.extra);
  nextRound();
  const r = play(hand(['S_' + ({ 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[j.ability.extra.targets[0].id] || j.ability.extra.targets[0].id)]));
  ok(r && r.total, 'the hatched Treecko scores without throwing', r && r.total);
});
blk(() => {
  start('RW391C_DONUT', {}, { noBlind: true });
  add('j_blueprint');
  const j = add('j_poke_jelly_donut');
  act({ type: 'select_blind' });
  ok(j.ability.extra.rounds === 3 && G.consumeables.cards.length === 2, 'jelly donut: Blueprint makes an Energy but does not eat a round (Pokermon 3.9.1)', [j.ability.extra.rounds, G.consumeables.cards.length]);
});
blk(() => {
  start('RW391C_RUINS');
  const j = add('j_poke_ruins_of_alph');
  j.ability.extra.merged = 6;
  const n0 = G.jokers.cards.length;
  act({ type: 'sell', id: j.sort_id }); G.E_MANAGER.flush();
  const made = G.jokers.cards.filter((c) => c !== j);
  ok(made.length === n0 && made.some((c) => c.config.center.rarity === 'poke_safari'), 'ruins of alph: 5+ merged -> a Safari joker (Pokermon 3.9.1)', made.map(key));
});
blk(() => {
  start('RW391C_RUINS2', {}, { noBlind: true });
  add('j_poke_ruins_of_alph');
  act({ type: 'select_blind' });
  const un = G.jokers.cards.filter((c) => key(c) === 'j_poke_unown');
  ok(un.length === 3 && un.every((c) => c.edition && c.edition.negative && c.sell_cost === 0), 'Ruins of Alph\'s three Negative Unown (SMODS.add_card since batch 10b) sell for $0', un.map((c) => c.sell_cost));
});
blk(() => {
  start('RW391C_MISS');
  const j = add('j_poke_missingno');
  G.GAME.round_resets.ante = 1;
  const t0 = G.GAME.tags.length;
  for (let i = 0; i < 15; i++) { j.calculate_joker({ end_of_round: true, main_eval: true, game_over: false }); G.E_MANAGER.flush(); }
  const got = G.GAME.tags.slice(t0).map((t) => t.key);
  ok(got.length >= 30 && !got.some((k) => ['tag_negative', 'tag_standard', 'tag_meteor', 'tag_buffoon', 'tag_handy', 'tag_garbage', 'tag_ethereal', 'tag_top_up', 'tag_orbital', 'tag_boss'].includes(k)),
    'missingno: its tags come from the Tag pool (SMODS.poll_object) — no ante-2 tag at ante 1 (Pokermon 3.9.1)', got);
});
blk(() => {
  start('RW391C_CONS');
  const c = API.create_consumeable('c_cryptid');
  G.consumeables.config.card_limit = G.consumeables.cards.length;
  ok(c && key(c) === 'c_cryptid' && API.create_consumeable('c_cryptid') === undefined, 'seam: create_consumeable (3.9.1 pokermon.create_consumeable) needs room');
});

// ---------------------------------------------------------------- the former holds: the Hazard layer (batch 10)
blk(() => {
  start('RW391C_HOLD', {}, { noBlind: true });
  add('j_poke_roggenrola');
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter((c) => c.config.center.key === 'm_poke_hazard').length === 1, 'Roggenrola: +1 Hazard layer -> 1 Hazard card dealt into the first hand (batch 10)');
});

done();
