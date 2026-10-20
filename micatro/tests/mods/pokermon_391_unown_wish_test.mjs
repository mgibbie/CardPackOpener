// pokermon_391_unown_wish_test.mjs — Pokermon 3.9.1 upgrade, batch 10b (Plans/MICATRO_MODS_UPGRADES.md): the Unown rework
// (Unown, Unown Swarm, Ruins of Alph's Unown spawn, the 3.9.1 Unown art) and the Wish Pack (3 random unused wishes, Jirachi's
// change_form wishes). Everything is FIRED through real runs:
//   - the overlay: Unown / Unown Swarm reworked (3.9.1 config, text, flags), nothing left in rework_hold, Ruins of Alph and
//     Jirachi no longer deferred, Unown on its 3.9.1 card; contentRev 7 (pin 3.9.1+r7)
//   - Unown / Unown Swarm are never in a pool (3.9.1 in_pool false); Unown self-destructs (SMODS.destroy_cards) after it
//     triggers with Ruins of Alph and at end of round ("Fled!")
//   - Ruins of Alph: three Negative Unown by SMODS.add_card (3.9.1 keeps their cost); they still sell for $0 (the set_cost
//     rule both versions have), so selling them pays nothing
//   - the art: the Unown card draws its form as the soul layer (3.9.1 set_sprites); the Unown Swarm draws from 3.9.1's
//     one-row strips split into tiles <= 8192 px (tools/micatro/split_pokermon_unown_swarm.mjs), cropped to the card
//   - the Wish Pack: 3 offers, all different, from the 5 wishes (no Master Ball); a wish is a change_form ("Transformed!")
//   node micatro/tests/mods/pokermon_391_unown_wish_test.mjs
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS, ATLASES } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { get_current_pool } from '../../js/engine/core.js';
import D391 from '../../mods/pokermon/data391.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const plain = (lines) => lines.join(' ').replace(/{[^}]*}/g, '');
const CODE = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: 'T', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const WISHES = ['c_poke_fake_banker', 'c_poke_fake_booster', 'c_poke_fake_power', 'c_poke_fake_copy', 'c_poke_fake_fixer'];
// (each section runs on its own: one that throws — e.g. content missing on an older build — counts as a FAIL)
const sec = (f) => { try { f(); } catch (e) { ok(false, 'section threw: ' + (e && e.message)); } };
const asyncSec = async (f) => { try { await f(); } catch (e) { ok(false, 'section threw: ' + (e && e.message)); } };

// ------------------------------------------------------------------ the overlay / pin
ok(MODS.pokermon.contentRev === 7 && PINS.modPin('pokermon') === '3.9.1+r7', 'Pokermon contentRev 7 (pin 3.9.1+r7)', PINS.modPin('pokermon'));
ok((D391.rework_hold || []).length === 0, 'rework_hold is empty: Unown / Unown Swarm are reworked', D391.rework_hold);
ok(['unown', 'unown_swarm', 'ruins_of_alph', 'jirachi'].every((n) => D391.reworked.includes(n)), 'Unown, Unown Swarm, Ruins of Alph, Jirachi are on 3.9.1');
const deferred = Object.fromEntries(D391.rework_deferred || []);
ok(!deferred.ruins_of_alph && !deferred.jirachi, 'rework_deferred: Ruins of Alph\'s Unown spawn and Jirachi\'s Wish Pack are done', Object.keys(deferred));
ok((D391.sprite_hold || []).length === 0 && D391.sprites.unown, 'sprite_hold is empty: Unown takes its 3.9.1 sprite', D391.sprite_hold);
sec(() => {
  const u = P_CENTERS.j_poke_unown;
  ok(u.atlas === 'poke_AtlasJokersBasicGen02391' && u.pos.x === 0 && u.pos.y === 0 && u.soul_pos.x === 1 && u.soul_pos.y === 0,
    'Unown: the 3.9.1 card (AtlasJokersBasicGen02 391 {0,0}, soul {1,0})', [u.atlas, u.pos, u.soul_pos]);
  ok(u.config.extra.targets[0].id === 14 && u.config.extra.mult === 6, 'Unown: 3.9.1 config (numeric target id 14, +6 Mult)', u.config.extra);
  ok((u.attributes || []).includes('nature'), 'Unown: 3.9.1 attributes (rank, mult, nature)', u.attributes);
  const s = P_CENTERS.j_poke_unown_swarm;
  ok(s.config.extra.mult === 28 && s.config.extra.Xmult_multi === 2.8 && s.no_collection, 'Unown Swarm: +28 / X2.8, not in the collection', s.config.extra);
});

// ------------------------------------------------------------------ never in a pool (3.9.1 in_pool false)
sec(() => {
  start('UWPOOL');
  const pool = get_current_pool('Joker', 'poke_safari')[0];
  ok(pool.includes('j_poke_ruins_of_alph') || pool.length > 10, '(the Safari pool is populated)', pool.length);
  ok(!pool.includes('j_poke_unown'), 'Unown is never in a pool (3.9.1 in_pool false)');
  ok(!pool.includes('j_poke_unown_swarm'), 'Unown Swarm is never in a pool (3.9.1 in_pool false)');
  add('j_ring_master');
  const pool2 = get_current_pool('Joker', 'poke_safari')[0];
  ok(!pool2.includes('j_poke_unown') && !pool2.includes('j_poke_unown_swarm'), '... not even with Showman');
});

// ------------------------------------------------------------------ Unown
sec(() => {
  start('UWUNOWN');
  const u = add('j_poke_unown');
  const u2 = add('j_poke_unown');
  ok(u.ability.extra.form !== u2.ability.extra.form, 'Unown: two Unown never share a form', [u.ability.extra.form, u2.ability.extra.form]);
  const t = u.ability.extra.targets[0];
  ok(typeof t.id === 'number' && t.id >= 2 && t.id <= 14, 'Unown: a random Nature rank (set_nature)', t);
  act({ type: 'sell', id: u2.sort_id });
  let r = play(hand(['S_' + CODE[t.id]]));
  ok(r.total.mult === 1 + 6, 'Unown: +6 Mult when the hand contains its Nature card', r.total);
  ok(G.jokers.cards.includes(u), 'Unown: stays after triggering without Ruins of Alph');
  ok(u.sell_cost === 0, 'Unown sells for $0', u.sell_cost);
  const w = winRound();
  ok(!G.jokers.cards.includes(u) && u.getting_sliced, 'Unown: self-destructs at end of round (SMODS.destroy_cards)', G.jokers.cards.map(key));
  ok(statusMsgs(w.events).some((m) => /fle/i.test(m)), 'Unown: "Fled!"', statusMsgs(w.events));
});

// ------------------------------------------------------------------ Ruins of Alph
sec(() => {
  start('UWRUINS', {}, { noBlind: true });
  const ruins = add('j_poke_ruins_of_alph');
  act({ type: 'select_blind' });
  G.E_MANAGER.flush();
  clearHand();
  const unowns = G.jokers.cards.filter((c) => key(c) === 'j_poke_unown');
  ok(unowns.length === 3 && unowns.every((c) => c.edition && c.edition.negative), 'Ruins of Alph: 3 Negative Unown when the Blind is selected', unowns.length);
  ok(new Set(unowns.map((c) => c.ability.extra.form)).size === 3, '... with three different forms', unowns.map((c) => c.ability.extra.form));
  ok(unowns.every((c) => c.sell_cost === 0), '... each sells for $0 (the Unown set_cost rule, 3.2.1 and 3.9.1 alike)', unowns.map((c) => c.sell_cost));
  ok(unowns.every((c) => c.cost > 0), '... and keeps its cost (3.9.1 SMODS.add_card no longer zeroes it)', unowns.map((c) => c.cost));
  // the old exploit: selling the three free Unown each blind
  const d0 = G.GAME.dollars;
  act({ type: 'sell', id: unowns[2].sort_id });
  ok(G.GAME.dollars === d0, 'selling a Ruins Unown pays nothing (no $-per-blind exploit)', G.GAME.dollars - d0);
  // a triggered Unown merges into Ruins and is destroyed right after the hand (3.9.1 SMODS.destroy_cards)
  const u = unowns[0];
  const t = u.ability.extra.targets[0];
  // (the other Unown gets another Nature rank, so it never triggers)
  unowns[1].ability.extra.targets[0].id = t.id === 13 ? 12 : 13; // (and not 2: winRound plays a 2)
  const other = unowns[1];
  const r = play(hand(['S_' + CODE[t.id]]));
  G.E_MANAGER.flush();
  ok(ruins.ability.extra.merged >= 1 && ruins.ability.extra.forms.includes(u.ability.extra.form), 'Ruins of Alph: merges the triggered Unown (form recorded)', ruins.ability.extra);
  ok(!G.jokers.cards.includes(u) && u.getting_sliced, 'a merged Unown is destroyed after the hand', G.jokers.cards.map(key));
  ok(G.jokers.cards.includes(other) && !other.ability.extra.merged, 'an Unown that did not trigger stays (not merged)');
  ok(r.total.mult >= 1 + 6, 'the Unown scored its +6 first', r.total);
  // the next blind's Unown skip the merged forms
  const left = G.jokers.cards.filter((c) => key(c) === 'j_poke_unown').length;
  const w = winRound();
  ok(!G.jokers.cards.some((c) => key(c) === 'j_poke_unown'), 'every Unown flees at end of round', G.jokers.cards.map(key));
  ok(left === 1 && statusMsgs(w.events).some((m) => /fle/i.test(m)), 'the Unown that did not merge: "Fled!"', [left, statusMsgs(w.events)]);
  act({ type: 'cash_out' });
  act({ type: 'next_round' });
  act({ type: 'select_blind' });
  G.E_MANAGER.flush();
  const again = G.jokers.cards.filter((c) => key(c) === 'j_poke_unown');
  ok(again.length === 3 && again.every((c) => !ruins.ability.extra.forms.includes(c.ability.extra.form)), 'the next blind\'s Unown skip the merged forms',
    [again.map((c) => c.ability.extra.form), ruins.ability.extra.forms]);
});

// ------------------------------------------------------------------ Unown Swarm
sec(() => {
  start('UWSWARM');
  add('j_poke_unown_swarm');
  let r = play(hand(['S_2']));
  ok(r.total.mult === 1, 'Unown Swarm: nothing without a Legendary', r.total);
  add('j_poke_jirachi');
  r = play(hand(['S_2']));
  ok(Math.abs(r.total.mult - (1 + 28) * 2.8) < 1e-6, 'Unown Swarm: each Legendary joker gives +28 Mult and X2.8', r.total);
});

// ------------------------------------------------------------------ the art: Unown forms, the Swarm's tiles
await asyncSec(async () => {
  const { POKE_UI } = await import('../../mods/pokermon/ui.js');
  const { ANIMATED } = await import('../../mods/pokermon/systems/anim.js');
  const A = await import('../../js/ui/assets.js');
  const u = P_CENTERS.j_poke_unown;
  const view = (form) => ({ center: 'j_poke_unown', mod: 'pokermon', set: 'Joker', atlas: u.atlas, pos: u.pos, soul_pos: u.soul_pos, poke: { form } });
  const f = (form) => { const r = POKE_UI.face(view(form), { jokers: [], area: 'jokers' }); return r && r.soul_pos; };
  ok(f('A') && f('A').x === 1 && f('A').y === 0, 'Unown A: soul layer = its form cell {1,0} (3.9.1 set_sprites)', f('A'));
  ok(f('K') && f('K').x === 1 && f('K').y === 1, 'Unown K: {1,1}', f('K'));
  ok(f('ZQu') && f('ZQu').x === 8 && f('ZQu').y === 2, 'Unown ? (ZQu): {8,2}', f('ZQu'));
  ok(f('ZEx') && f('ZEx').x === 7 && f('ZEx').y === 2, 'Unown ! (ZEx): {7,2}', f('ZEx'));
  // the swarm: 3.9.1's one-row strips (36 frames x 580 px = 20880 px) split into tiles of 14 frames (8120 px)
  const an = ANIMATED.j_poke_unown_swarm;
  ok(an && an.frames === 36 && an.frames_per_row === 36, 'Unown Swarm animation: 36 frames in one row (3.9.1 strip)', an);
  for (const n of ['j_poke_unown_swarm', 'j_poke_unown_swarm_shiny', 'j_poke_unown_swarm_soul', 'j_poke_unown_swarm_shiny_soul']) {
    const a = ATLASES['poke_' + n];
    const tiles = (a && a.tiles) || [];
    const okTiles = tiles.length === 3 && tiles.every((t, i) => ATLASES[t] && /-391-t\d\.png$/.test(ATLASES[t].src) && ATLASES[t].src.includes(n + '-391-t' + i)
      && ATLASES[t].px === 290 && ATLASES[t].py === 285);
    ok(okTiles && a.tile_cols * 580 <= 8192, n + ': 3 tiles of the 3.9.1 strip, each <= 8192 px wide', a && { tiles: a.tiles, cols: a.tile_cols });
  }
  A.bindModRegistry({ ATLASES });
  const at = (pos, frame) => A.modCellRect('poke_j_poke_unown_swarm', pos, frame);
  const r0 = at({ x: 0, y: 0 }), r20 = at({ x: 20, y: 0 }), r35 = at({ x: 35, y: 0 }), r13 = at({ x: 13, y: 0 });
  ok(r0 && r0.atlas === 'poke_j_poke_unown_swarm_t0' && r0.sx === 37 * 2, 'frame 0: tile 0, cropped to the card (x 37 of 290, Lua set_alignment 37/3/71)', r0);
  ok(r13 && r13.atlas === 'poke_j_poke_unown_swarm_t0' && r13.sx === 13 * 580 + 74, 'frame 13: still tile 0', r13);
  ok(r20 && r20.atlas === 'poke_j_poke_unown_swarm_t1' && r20.sx === 6 * 580 + 74 && r20.sw === 213 * 2 && r20.sh === 285 * 2, 'frame 20: tile 1, cell 6', r20);
  ok(r35 && r35.atlas === 'poke_j_poke_unown_swarm_t2' && r35.sx === 7 * 580 + 74, 'frame 35: tile 2, cell 7', r35);
  ok(at({ x: 0, y: 0 }, 21) && at({ x: 0, y: 0 }, 21).atlas === 'poke_j_poke_unown_swarm_t1', 'a frame offset picks the tile too');
  const plainCell = A.modCellRect('poke_AtlasJokersBasicGen02391', { x: 1, y: 2 });
  ok(plainCell && plainCell.atlas === 'poke_AtlasJokersBasicGen02391' && plainCell.sx === 142 && plainCell.sy === 380, 'an ordinary atlas: the plain cell', plainCell);
  // the Swarm's view: shiny picks the shiny strip, the soul strip rides along
  start('UWSWARMV');
  const sw = add('j_poke_unown_swarm', 'poke_shiny');
  const { cardView } = await import('../../js/engine/view.js');
  const v = cardView(sw);
  const anim = POKE_UI.anim(v);
  ok(anim && anim.atlas === 'poke_j_poke_unown_swarm_shiny' && anim.soulAtlas === 'poke_j_poke_unown_swarm_shiny_soul' && anim.fpr === 36,
    'a Shiny Unown Swarm animates the shiny strip + its soul strip', anim);
});

// ------------------------------------------------------------------ the Wish Pack + Jirachi's wishes
const wishPack = (seed) => {
  start(seed);
  const j = add('j_poke_jirachi');
  winRound();
  act({ type: 'cash_out' });
  act({ type: 'next_round' });
  return { j, offers: (G.pack_cards ? G.pack_cards.cards : []).map(key) };
};
sec(() => {
  const P = P_CENTERS.p_poke_pokepack_wish_pack;
  ok(P.config.extra === 3 && P.config.choose === 1, 'Wish Pack: 3 offers, choose 1 (3.9.1)', P.config);
  const seen = new Set();
  let allOk = true, n = 0;
  for (const seed of ['WISH1', 'WISH2', 'WISH3', 'WISH4', 'WISH5', 'WISH6']) {
    const { offers } = wishPack(seed);
    n++;
    if (!(offers.length === 3 && new Set(offers).size === 3 && offers.every((k) => WISHES.includes(k)))) { allOk = false; ok(false, 'Wish Pack ' + seed + ': 3 different wishes of the 5', offers); }
    for (const k of offers) seen.add(k);
  }
  ok(allOk && n === 6, 'Wish Pack: always 3 different wishes, never the Master Ball (6 packs)');
  ok(seen.size >= 4, 'Wish Pack: the 3 are random among the 5 wishes', [...seen]);
  ok(!seen.has('c_poke_fake_masterball'), 'Wish Pack: no Master Ball wish (3.9.1)');
  const a = wishPack('WISHSAME').offers, b = wishPack('WISHSAME').offers;
  ok(a.join() === b.join(), 'Wish Pack: seeded (same run seed -> same 3 wishes)', [a, b]);
});
sec(() => {
  // pick a wish: change_form ("Transformed!")
  let got = null, seed = 0;
  while (!got && seed < 30) {
    const { j, offers } = wishPack('WISHB' + seed++);
    if (offers.includes('c_poke_fake_banker')) got = j;
  }
  ok(!!got, 'a Wish Pack with the Banker wish');
  if (!got) return;
  const card = G.pack_cards.cards.find((c) => key(c) === 'c_poke_fake_banker');
  const d = describe(card);
  ok((d.info || []).some((i) => i.key === 'j_poke_jirachi_banker'), 'the wish card shows the form it grants (3.9.1 info_queue)', (d.info || []).map((i) => i.key));
  const res = act({ type: 'use', id: card.sort_id });
  G.E_MANAGER.flush();
  ok(key(got) === 'j_poke_jirachi_banker', 'Jirachi -> Jirachi Banker', key(got));
  ok(statusMsgs(res.events).some((m) => /Transformed/i.test(m)), 'the wish is a change_form: "Transformed!"', statusMsgs(res.events));
});
sec(() => {
  // the Master Ball wish card (not in the pack any more) still works: a random Legendary
  start('WISHMB');
  const j = add('j_poke_jirachi');
  const mb = add('c_poke_fake_masterball');
  const d = describe(mb);
  ok((d.info || []).some((i) => i.key === 'c_poke_masterball'), 'Master Ball wish: shows the Master Ball', (d.info || []).map((i) => i.key));
  act({ type: 'use', id: mb.sort_id });
  G.E_MANAGER.flush();
  ok(key(j) !== 'j_poke_jirachi' && P_CENTERS[key(j)].rarity === 4, 'Master Ball wish: Jirachi becomes a random Legendary', key(j));
});

done();
