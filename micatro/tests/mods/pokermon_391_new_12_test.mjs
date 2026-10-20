// Pokermon 3.9.1 new jokers, sub-batch 12 (PORTING.md "New jokers, sub-batch 12"): the 15 jokers 3.9.1 added to
// pokejokers_11.lua (Delcatty, Sableye, Meditite / Medicham, Plusle, Minun, Volbeat, Illumise, Roselia, Carvanha / Sharpedo,
// Wailmer / Wailord, Torkoal, Spinda), every one fired through real plays (act), and each evolution.
//   - the overlay: data391.js new_jokers / new_deferred / families, the 3.9.1 static data, text, order and pools; contentRev 9
//   - each joker's main effect; Skitty -> Delcatty (Moon Stone, deferred in sub-batch 11), Meditite -> Medicham,
//     Carvanha -> Sharpedo, Wailmer -> Wailord; (Roselia -> Roserade: switched on in sub-batch 14); Minun's shop discount
//   - the art: every new joker's 3.9.1 cell (and its Shiny twin) holds a real picture (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_12_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, create_card, P_CARDS, P_CENTER_POOLS, localize, get_current_pool, Card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { get_family_keys, poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['delcatty', 'sableye', 'meditite', 'medicham', 'plusle', 'minun', 'volbeat', 'illumise', 'roselia', 'carvanha', 'sharpedo',
  'wailmer', 'wailord', 'torkoal', 'spinda'];
/** A card on top of the deck (the next one drawn). */
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.message).slice(0, 160)); } };
/** Discard these hand cards (the hand refills from the top of the deck). */
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
const flush = () => G.E_MANAGER.flush();

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 9 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 9+ (pin 3.9.1+r9+)', PINS.modPin('pokermon'));
const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '12'));
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW), 'data391.js new_jokers (sub-batch 12): the 15 of 3.9.1 pokejokers_11, in file order', Object.keys(NJ));
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_11.lua'] && STATUS.PORTED_FILES['pokemon/pokejokers_11.lua'].length === 21, 'defs: 21 from pokejokers_11.lua', STATUS.PORTED_FILES['pokemon/pokejokers_11.lua'] && STATUS.PORTED_FILES['pokemon/pokejokers_11.lua'].length);
sec(() => {
  // Static data straight from 3.9.1 (never retyped): spot checks of rarity / cost / stage / type / config.
  const want = {
    delcatty: ['poke_safari', 9, 'One', 'Colorless'], sableye: [3, 7, 'Basic', 'Dark'], meditite: [1, 5, 'Basic', 'Fighting'],
    plusle: [1, 4, 'Basic', 'Lightning'], minun: [1, 3, 'Basic', 'Lightning'], volbeat: [2, 5, 'Basic', 'Grass'],
    sharpedo: ['poke_safari', 8, 'One', 'Water'], torkoal: [3, 7, 'Basic', 'Fire'], spinda: [2, 7, 'Basic', 'Colorless'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: 3.9.1 rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('torkoal').enhancement_gate === 'm_mult' && C('volbeat').perishable_compat === false && C('minun').blueprint_compat === false, 'torkoal: Mult gate; volbeat: no Perishable; minun: not Blueprint-compatible');
  ok(C('carvanha').config.evo_rqmt === 3 && C('carvanha').knockoff_starter === true && C('wailmer').config.extra.rounds === 5 && C('meditite').config.extra.mult_mod === 7, '3.9.1 configs', [C('carvanha').config, C('wailmer').config]);
  ok(C('skitty').config.extra.item_req === 'moonstone', 'skitty: its Moon Stone now (Delcatty is here)', C('skitty').config.extra);
  ok(C('spinda').attributes.includes('nature') && C('sableye').attributes.includes('dark_type'), 'attributes: 3.9.1 + load_pokemon ones', C('spinda').attributes);
});
sec(() => {
  // Their place in the joker list: 3.9.1's file order.
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('skitty', 'delcatty') && after('delcatty', 'sableye') && after('sableye', 'aron') && after('aggron', 'meditite') && after('minun', 'volbeat')
    && after('wailord', 'numel') && after('mega_camerupt', 'torkoal') && after('torkoal', 'spinda'), 'inserted in 3.9.1 file order');
});
sec(() => {
  // The 3.9.1 text (each #n# the text names filled by loc_vars)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  start('LOC12');
  for (const n of NEW) {
    const e = JL['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
  ok(JL.j_poke_minun.text.some((l) => l.includes('cost')) && JL.j_poke_spinda.name === 'Spinda' && JL.j_poke_skitty.text.some((l) => l.includes('Moon Stone')), 'the 3.9.1 entries (Skitty with its Moon Stone line)');
  const OL = MODS.pokermon.content.loc.descriptions.Other;
  ok(OL.deplete && localize('poke_teeter_dance_ex') === 'Teeter Dance!' && localize('poke_m_poke_seed') === 'Seed', 'loc: Deplete, Teeter Dance!, the enhancement names');
});
sec(() => {
  // Deferred: Roselia -> Roserade (Shiny Stone) and Budew -> Roselia: sub-batch 14
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  const def = Object.fromEntries(D391.new_deferred.map(([n, why, drop]) => [n, drop]));
  // (came back in sub-batch 14: pokermon_391_new_14_test.mjs fires the Shiny Stone)
  ok(!def.roselia && !def.skitty, 'new_deferred: roselia (since sub-batch 14) and skitty no more', def);
  ok(C('roselia').config.extra.item_req === 'shinystone' && JL.j_poke_roselia.text.some((l) => l.includes('Shiny Stone')), 'roselia: its Shiny Stone item_req and line again (Roserade exists)');
  ok(!!P_CENTERS.j_poke_roserade && !!P_CENTERS.j_poke_budew, 'Budew / Roserade are registered (sub-batch 14)');
});
sec(() => {
  // Families (3.9.1 functions/pokefamily.lua), minus jokers not ported yet
  ok(JSON.stringify(poke_get_family_list('skitty')) === JSON.stringify(['skitty', 'delcatty']), 'family: skitty / delcatty', poke_get_family_list('skitty'));
  ok(JSON.stringify(poke_get_family_list('medicham')) === JSON.stringify(['meditite', 'medicham'])
    && JSON.stringify(poke_get_family_list('carvanha')) === JSON.stringify(['carvanha', 'sharpedo'])
    && JSON.stringify(poke_get_family_list('wailord')) === JSON.stringify(['wailmer', 'wailord']), 'families: Meditite, Carvanha, Wailmer lines');
  ok(JSON.stringify(poke_get_family_list('roselia')) === JSON.stringify(['budew', 'roselia', 'roserade']) && get_family_keys('roselia').includes('j_poke_roserade'), 'family: Budew / Roselia / Roserade (sub-batch 14)', poke_get_family_list('roselia'));
});
sec(() => {
  // Pools: in_pool (pokemon_in_pool) + pool_filter (one per family, the Gen 3 option); the shop's rarity pools
  start('POOL12');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_delcatty') === pool.indexOf('j_poke_skitty') + 1 && pool.includes('j_poke_spinda'), 'the Joker pool holds them, in 3.9.1 order');
  ok(C('plusle').in_pool(C('plusle')) && C('sableye').in_pool(C('sableye')) && pool_filter(C('plusle'), 'Joker') === undefined, 'Plusle / Sableye can be rolled');
  ok(C('torkoal').in_pool(C('torkoal')) === false, 'Torkoal waits for a Mult card in the deck (enhancement_gate)');
  const avail = (r) => get_current_pool('Joker', r)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_meditite', 'j_poke_plusle', 'j_poke_minun', 'j_poke_illumise', 'j_poke_wailmer'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_volbeat', 'j_poke_roselia', 'j_poke_carvanha', 'j_poke_spinda'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_sableye']), 'shop rarity pools: Common / Uncommon / Rare (Torkoal gated)', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  hand(['S_A'], { center: 'm_mult' })[0];
  G.playing_cards.push(G.hand.cards[G.hand.cards.length - 1]);
  ok(C('torkoal').in_pool(C('torkoal')) !== false, 'Torkoal: in with a Mult card in the deck');
  add('j_poke_carvanha');
  ok(pool_filter(C('sharpedo'), 'Joker') === false && pool_filter(C('carvanha'), 'Joker') === false, 'one per family: Carvanha held -> its line is out');
  start('POOL12B', { gen_three: false });
  ok(pool_filter(C('plusle'), 'Joker') === false, 'Gen 3 off -> out');
});

// ------------------------------------------------------------------- Skitty -> Delcatty, Delcatty
sec(() => {
  start('SKITTY12');
  const j = add('j_poke_skitty');
  const stone = add('c_poke_moonstone');
  const u = act({ type: 'use', id: stone.sort_id, joker_targets: [j.sort_id] }); // (the Moon Stone used on Skitty)
  ok(u.ok, 'the Moon Stone can be used on Skitty', u.error);
  flush();
  ok(j.ability.extra.evolve === true || key(j) === 'j_poke_delcatty', 'a Moon Stone targets Skitty now', [key(j), j.ability.extra.evolve]);
  winRound();
  ok(key(j) === 'j_poke_delcatty', 'skitty -> delcatty with a Moon Stone', key(j));
});
sec(() => {
  start('DELCATTY');
  const j = add('j_poke_delcatty');
  const fire = add('j_joker');
  fire.ability.fire_sticker = true;
  G.GAME.current_round.cattype = 'Fire';
  const r = play(hand(['S_A']));
  // Joker +4, and its copy with +1 Energy: 4 + 4 x 0.4 = 5.6
  ok(Math.abs(r.total.mult - (1 + 4 + 5.6)) < 1e-9, 'delcatty: copies the Fire joker to its right with +1 Energy (+5.6 for +4)', r.total);
  ok(fire.ability.mult === 4 && !fire.gone, 'delcatty: the copied joker keeps its own values', [fire.ability.mult, fire.gone]);
  C('delcatty').update(C('delcatty'), j);
  ok(j.ability.blueprint_compat === 'compatible', 'delcatty: the compatible badge');
  G.GAME.current_round.cattype = 'Water';
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 5, 'delcatty: not another type', r2.total);
  // a Pokémon to the right: the copy reads energized values, and never counts its rounds (gone): Cyndaquil's level countdown
  // runs once a round, not twice
  G.GAME.current_round.cattype = 'Fire';
  fire.remove();
  const p = add('j_poke_cyndaquil');
  const before = JSON.stringify(p.ability.extra);
  clearHand();
  play(hand(['S_A']));
  ok(JSON.stringify(p.ability.extra) === before, 'delcatty: the copied Pokémon keeps its own values', p.ability.extra);
  const r0 = p.ability.extra.rounds;
  winRound();
  ok(p.ability.extra.rounds === r0 - 1 && key(p) === 'j_poke_cyndaquil', 'delcatty: the copied Pokémon counts its round once', [r0, p.ability.extra.rounds]);
});

// ------------------------------------------------------------------- Sableye
sec(() => {
  start('SABLEYE');
  const j = add('j_poke_sableye');
  clearHand();
  onDeck('S_K', 'm_bonus');
  discard(hand(['S_2']));
  ok(j.ability.extra.Xmult === 1.5 && j.ability.extra.enhancements.m_bonus === true, 'sableye: drawing the last Bonus card in the deck -> +X0.5', j.ability.extra);
  clearHand();
  onDeck('S_Q', 'm_bonus');
  discard(hand(['S_3']));
  ok(j.ability.extra.Xmult === 1.5, 'sableye: once per enhancement a round', j.ability.extra.Xmult);
  clearHand();
  onDeck('H_Q', 'm_mult'); onDeck('H_J', 'm_mult');
  discard(hand(['S_4']));
  ok(j.ability.extra.Xmult === 2, 'sableye: two Mult cards drawn together: the deck is out of them -> +X0.5 once', j.ability.extra.Xmult);
  clearHand();
  const r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 2) < 1e-9, 'sableye: X2', r.total);
  const w = winRound();
  ok(j.ability.extra.Xmult === 1 && Object.keys(j.ability.extra.enhancements).length === 0 && statusMsgs(w.events).includes(localize('k_reset')), 'sableye: resets at end of round', j.ability.extra);
});

// ------------------------------------------------------------------- Meditite / Medicham
sec(() => {
  start('MEDITITE');
  const j = add('j_poke_meditite');
  G.GAME.current_round.discards_left = 0;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 14, 'meditite: +7 Mult per empty consumable slot (2) with 0 discards left', r.total);
  add('c_pluto');
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 8, 'meditite: one slot filled -> +7', r2.total);
  G.GAME.current_round.discards_left = 1;
  clearHand();
  const r3 = play(hand(['S_A']));
  ok(r3.total.mult === 1, 'meditite: not with a discard left', r3.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_medicham', 'meditite -> medicham', key(j));
});
sec(() => {
  start('MEDICHAM');
  add('j_poke_medicham');
  const [six] = hand(['S_6']);
  const r = play([six]);
  flush();
  ok(!G.playing_cards.includes(six) && G.consumeables.cards.some((c) => c.ability.set === 'Spectral'), 'medicham: Sixth Sense: a lone 6 as the first hand is destroyed for a Spectral card', G.consumeables.cards.map(key));
  ok(statusMsgs(r.events).includes(localize('k_plus_spectral')), 'medicham: "+1 Spectral"');
  G.GAME.current_round.discards_left = 0;
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 13, 'medicham: +12 Mult per empty consumable slot (1 left)', r2.total);
  clearHand();
  const [six2] = hand(['H_6']);
  play([six2]);
  ok(G.playing_cards.includes(six2), 'medicham: not on a later hand');
});

// ------------------------------------------------------------------- Plusle / Minun
sec(() => {
  start('PLUSLE');
  add('j_poke_plusle');
  add('c_pluto');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4, 'plusle: +2 Mult per Joker and consumable (2)', r.total);
  add('j_poke_minun');
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(Math.abs(r2.total.mult - (1 + 6) * 2.5) < 1e-9, 'plusle: Minun gives X2.5', r2.total);
});
sec(() => {
  start('MINUN');
  const price = (k) => { const c = create_card('Joker', G.jokers, null, null, null, null, k); c.set_cost(); const v = c.cost; c.remove(); return v; };
  const p0 = price('j_joker');
  const pl0 = (() => { const c = new Card(P_CARDS.empty, P_CENTERS.c_pluto); c.set_cost(); return c.cost; })();
  const m = add('j_poke_minun');
  ok(price('j_joker') === p0 - 1, 'minun: Jokers cost $1 less', [p0, price('j_joker')]);
  ok((() => { const c = new Card(P_CARDS.empty, P_CENTERS.c_pluto); c.set_cost(); return c.cost; })() === pl0 - 1, 'minun: consumables cost $1 less');
  ok((() => { const c = new Card(P_CARDS.empty, P_CENTERS.p_standard_normal_1); c.set_cost(); return c.cost; })() === P_CENTERS.p_standard_normal_1.cost - 1, 'minun: packs cost $1 less');
  ok(C('minun').calc_dollar_bonus(C('minun'), m) === undefined, 'minun: no $ without a Plusle');
  act({ type: 'sell', id: m.sort_id });
  flush();
  ok(price('j_joker') === p0, 'minun sold: full price again');
  // $10 per Plusle at end of round: the same round with and without a Plusle
  const cash = (withPlusle) => {
    start('MINUN2');
    add('j_poke_minun');
    if (withPlusle) add('j_poke_plusle');
    winRound();
    const d0 = G.GAME.dollars;
    act({ type: 'cash_out' });
    return G.GAME.dollars - d0;
  };
  const a = cash(false), b = cash(true);
  ok(b - a === 10, 'minun: +$10 at end of round per Plusle', [a, b]);
});

// ------------------------------------------------------------------- Volbeat / Illumise
sec(() => {
  start('VOLBEAT');
  const j = add('j_poke_volbeat');
  act({ type: 'use', id: add('c_mercury').sort_id });
  ok(j.ability.extra.chips === 6 && j.ability.extra.Xmult === 1, 'volbeat: +6 Chips per Planet used', j.ability.extra);
  const grass = add('j_poke_bulbasaur');
  act({ type: 'use', id: add('c_mercury').sort_id });
  ok(j.ability.extra.chips === 6 && Math.abs(j.ability.extra.Xmult - 1.08) < 1e-9, 'volbeat: with another Grass joker, +X0.08 instead', j.ability.extra);
  act({ type: 'sell', id: grass.sort_id });
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 6 && Math.abs(r.total.mult - 1.08) < 1e-9, 'volbeat: scores its Chips and X Mult', r.total);
});
sec(() => {
  start('ILLUMISE', {}, { noBlind: true });
  add('j_poke_illumise');
  add('j_poke_oddish');
  act({ type: 'select_blind' });
  flush();
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === 'Planet'), 'illumise: a Planet card per Grass joker (2) at Blind select', G.consumeables.cards.map(key));
  start('ILLUMISE2', {}, { noBlind: true });
  add('j_poke_illumise');
  add('j_poke_oddish'); add('j_poke_bulbasaur');
  act({ type: 'select_blind' });
  flush();
  ok(G.consumeables.cards.length === 2, 'illumise: must have room (3 Grass, 2 slots)', G.consumeables.cards.length);
});

// ------------------------------------------------------------------- Roselia
sec(() => {
  start('ROSELIA');
  const j = add('j_poke_roselia');
  const r = play(hand(['S_A']));
  // High Card: 5 + 11 x 3 (the Ace and 2 retriggers)
  ok(r.total.chips === 38, 'roselia: an Odd first scoring card of the round is retriggered twice', r.total);
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.chips === 16, 'roselia: only the round\'s first hand', r2.total);
  start('ROSELIA2');
  const j2 = add('j_poke_roselia');
  const [k] = hand(['S_K']);
  play([k]);
  ok(key(k) === 'm_poke_seed', 'roselia: an Even first card becomes a Seed card', key(k));
  // (its Shiny Stone evolution into Roserade, sub-batch 14, is pokermon_391_new_14_test.mjs's)
  winRound();
  ok(key(j2) === 'j_poke_roselia', 'roselia: no evolution without a Shiny Stone', key(j2));
  void j;
});

// ------------------------------------------------------------------- Carvanha / Sharpedo
sec(() => {
  start('CARVANHA', {}, { noBlind: true });
  const j = add('j_poke_carvanha');
  const prey = add('j_joker');
  act({ type: 'select_blind' });
  flush();
  ok(!G.jokers.cards.includes(prey) && j.ability.extra.eaten === 1, 'carvanha: destroys the joker to its right at Blind select', [G.jokers.cards.map(key), j.ability.extra.eaten]);
  clearHand();
  const r = play(hand(['S_A', 'H_A']));
  clearHand();
  const r2 = play(hand(['S_K', 'H_K']));
  ok(r.total.mult === 2 && r2.total.mult === 4, 'carvanha: X2 on a hand already played this round', [r.total, r2.total]);
  j.ability.extra.eaten = 3;
  winRound();
  ok(key(j) === 'j_poke_sharpedo', 'carvanha -> sharpedo after 3 jokers', key(j));
});
sec(() => {
  start('SHARPEDO', {}, { noBlind: true });
  const j = add('j_poke_sharpedo');
  const prey = add('j_joker');
  const eternal = add('j_joker');
  act({ type: 'select_blind' });
  flush();
  ok(!G.jokers.cards.includes(prey) && G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Spectral', 'sharpedo: destroys the joker to its right for a Spectral card', [G.jokers.cards.map(key), G.consumeables.cards.map(key)]);
  clearHand();
  play(hand(['S_A', 'H_A']));
  clearHand();
  const r = play(hand(['S_K', 'H_K']));
  // (the next joker, +4, scores after Sharpedo's X3)
  ok(r.total.mult === 2 * 3 + 4, 'sharpedo: X3 on a repeated hand', r.total);
  // an Eternal joker to the right is safe
  eternal.set_eternal(true);
  nextRound();
  flush();
  ok(G.jokers.cards.includes(eternal) && G.jokers.cards.includes(j), 'sharpedo: not an Eternal joker', G.jokers.cards.map(key));
});

// ------------------------------------------------------------------- Wailmer / Wailord
sec(() => {
  start('WAILMER');
  const j = add('j_poke_wailmer');
  const clubs = G.deck.cards.filter((c) => c.is_suit('Clubs')).length;
  const r = play(hand(['S_A']));
  ok(clubs > 0 && r.total.chips === 16 + 6 * clubs, 'wailmer: +6 Chips per Club left in the deck', [clubs, r.total]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_wailord', 'wailmer -> wailord', key(j));
});
sec(() => {
  start('WAILORD');
  add('j_poke_wailord');
  const clubs = G.deck.cards.filter((c) => c.is_suit('Clubs')).length;
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 10 * clubs, 'wailord: +10 Chips per Club left in the deck', [clubs, r.total]);
  winRound();
  act({ type: 'cash_out' });
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS.p_standard_normal_1);
  G.shop_booster.emplace(b);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: b.sort_id });
  flush();
  ok(G.pack_cards && G.pack_cards.cards.length > 0 && G.pack_cards.cards.every((c) => c.base.suit === 'Clubs'), 'wailord: Standard Pack cards become Clubs', G.pack_cards && G.pack_cards.cards.map((c) => c.base.suit));
});

// ------------------------------------------------------------------- Torkoal
sec(() => {
  start('TORKOAL');
  add('j_poke_torkoal');
  G.GAME.current_round.discards_left = 3;
  const r = play(hand(['S_A'], { center: 'm_mult' }));
  // the Ace + 3 retriggers: 5 + 11 x 4 Chips, 1 + 4 x 4 Mult
  ok(r.total.chips === 49 && r.total.mult === 17, 'torkoal: a Mult card retriggers once per discard left (3)', r.total);
  G.GAME.current_round.discards_left = 0;
  clearHand();
  const r2 = play(hand(['S_A'], { center: 'm_mult' }));
  ok(r2.total.chips === 16 && r2.total.mult === 5, 'torkoal: none with 0 discards', r2.total);
  clearHand();
  G.GAME.current_round.discards_left = 3;
  const r3 = play(hand(['S_A']));
  ok(r3.total.chips === 16, 'torkoal: only Mult cards', r3.total);
});

// ------------------------------------------------------------------- Spinda
sec(() => {
  start('SPINDA');
  const j = add('j_poke_spinda');
  ok(G.consumeables.cards.some((c) => key(c) === 'c_wheel_of_fortune'), 'spinda: comes holding a Wheel of Fortune');
  const ex = j.ability.extra;
  ok(ex.enhancements.length === 3 && new Set(ex.enhancements).size === 3 && ex.enhancements.every((e) => P_CENTERS[e] && P_CENTERS[e].set === 'Enhanced')
    && ex.targets.length === 3 && new Set(ex.targets.map((t) => t.id)).size === 3, 'spinda: a Nature of 3 enhancements and 3 ranks on creation', ex);
  ex.enhancements = ['m_bonus'];
  ex.targets = [{ value: 'Ace', id: 14 }];
  const [a, k] = hand(['S_A', 'H_K']);
  const r = play([a, k]);
  ok(key(a) === 'm_bonus' && key(k) === 'c_base' && statusMsgs(r.events).includes(localize('poke_teeter_dance_ex')), 'spinda: a scored card of its Nature rank becomes a Nature enhancement ("Teeter Dance!")', [key(a), key(k)]);
  // High Card: the Ace (now Bonus) scores 11 + 30 before it is scored
  ok(r.total.chips === 5 + 11 + 30, 'spinda: changed before scoring', r.total);
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!NEW.every(C)) ok(false, 'art: the new jokers are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  for (const n of NEW) {
    const c = C(n);
    for (const a of [c.atlas, c.atlas.replace(/391$/, '').replace(/$/, 'Shiny391')]) {
      const A = ATL[a];
      const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
      (want[file] || (want[file] = {}))[n + '|' + a] = [c.pos.x * 142, c.pos.y * 190, 142, 190];
    }
  }
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  for (const n of NEW) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0, `${n}: a real 3.9.1 sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [opaque(base), opaque(shiny), diff]);
  }
}

void STATES; void nextRound;
done();
