// pokermon_leftovers_test.mjs — the last Pokermon 3.9.1 leftovers (Plans/MICATRO_MODS_UPGRADES.md "Pokermon 3.9.1 leftovers"):
//   1. the Pocket Packs' 3.9.1 contents (boosters/packs1.lua create_item(seed) + pokermon.poll_evo_item): the evolution-item roll on
//      its own seed ('pocket_evo_item'), poll_evo_item's rules (not in play, not banned, in its pool; list requirements count only
//      through in_pool), the soulable random Item seeded per pack ('pocket'), no c_keys bookkeeping, booster_size / choice mods in
//      the text — FIRED through the packs' own create_card, and a real pack bought and opened from the shop;
//   2. the Debris Sleeve's alt on the Debris Deck (poke_negative_hazards): every Hazard card has card_limit +1, i.e. +1 hand size
//      while held — the engine's playing-card card_limit seam (js/engine/smods.js held_card_limit; run.js draws the extra slots);
//      FIRED through real draws (the round's first deal, a draw after a play), plus the tooltip, the alt text and the opt-in rule;
//   3. the Series A sprite series (Pokermon's cosmetic `series` option): ui.js draws a joker's Series A cell (Shiny twin, alt soul,
//      the animated strips), add-on jokers on Pokermon's sheets follow it, and the option never reaches the engine — the recipe,
//      the gameplay and the checksum are the same with it on.
//   node micatro/tests/mods/pokermon_leftovers_test.mjs   (art checks: the gitignored art, or MICATRO_MAIN=<main checkout>)
import fs from 'fs';
import path from 'path';
import { T, start, add, G, P_CENTERS, act, STATES, clearHand, hand } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { newRun } from '../../js/engine/run.js';
import { create_card, create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { Session, viewChecksum } from '../../js/engine/session.js';
import { cardView, toView } from '../../js/engine/view.js';
import { describe } from '../../js/engine/describe.js';
import { findSleeve, sleeveInfo } from '../../js/engine/sleeve.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const sec = async (f) => { try { await f(); } catch (e) { ok(false, 'section threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)); } };
const safe = (f) => { try { return f(); } catch (e) { return undefined; } };
const key = (c) => c.config.center.key;
const clone = (o) => JSON.parse(JSON.stringify(o));
const POCKETS = ['p_poke_pokepack_normal_1', 'p_poke_pokepack_normal_2', 'p_poke_pokepack_jumbo_1', 'p_poke_pokepack_mega_1',
  'p_poke_pokepack_normal_3', 'p_poke_pokepack_normal_4', 'p_poke_pokepack_jumbo_2', 'p_poke_pokepack_mega_2'];

// ------------------------------------------------------------------ the pin
ok(MODS.pokermon.version === '3.9.1' && MODS.pokermon.contentRev >= 16 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev,
  'Pokermon 3.9.1, contentRev 16 (the leftovers batch: pin 3.9.1+r16)', [MODS.pokermon.contentRev, safe(() => PINS.modPin('pokermon'))]);

// ------------------------------------------------------------------ 1. the Pocket Packs
/** A Pocket pack card (not opened) and its center, for calling the pack's own create_card slot by slot. */
function pocketCard(k = 'p_poke_pokepack_normal_1') {
  const center = P_CENTERS[k];
  const pack = create_card('Booster', G.shop_booster, null, null, true, true, k);
  return { center, pack };
}
const slot = (center, pack, i) => center.create_card(center, pack, i);
/** Run f with the RNG and used_jokers as they are now, then put them back (the same draw can be repeated). */
function peek(f) {
  const rng = clone(G.GAME.pseudorandom), used = clone(G.GAME.used_jokers);
  try { return f(); } finally { G.GAME.pseudorandom = rng; G.GAME.used_jokers = used; }
}
const { pseudorandom, pseudoseed } = await import('../../js/engine/core.js');

await sec(() => {
  start('PKT1', {}, { noBlind: true });
  for (const k of POCKETS) {
    const c = P_CENTERS[k];
    ok(c && c.config && c.config.c_keys === undefined && (c.config.extra === 4 || c.config.extra === 6), `${k}: 3.9.1 config (no c_keys)`, c && c.config);
  }
  const { center, pack } = pocketCard();
  // 3.9.1 loc_vars: choose / size count Steamodded's booster_choice_mod / booster_size_mod
  G.GAME.modifiers.booster_size_mod = 2; G.GAME.modifiers.booster_choice_mod = 1;
  const lv = center.loc_vars(center, [], pack);
  ok(lv && lv.vars[0] === 2 && lv.vars[1] === 5, 'Pocket Pack text: choose 1+1 of 3+2 (booster_choice_mod / booster_size_mod)', lv && lv.vars);
  G.GAME.modifiers.booster_size_mod = 0; G.GAME.modifiers.booster_choice_mod = 0;
  // slot 1 is an Energy (or Double Rainbow), every other slot an Item; nothing is remembered per pack
  const sets = [];
  for (let n = 0; n < 30; n++) for (let i = 1; i <= 4; i++) sets.push([i, slot(center, pack, i).ability.set]);
  ok(sets.filter(([i]) => i === 1).every(([, s]) => s === 'Energy' || s === 'Spectral'), 'slot 1: an Energy (or Double Rainbow Energy)');
  ok(sets.filter(([i]) => i > 1).every(([, s]) => s === 'Item'), 'slots 2-4: Items', [...new Set(sets.filter(([i]) => i > 1).map(([, s]) => s))]);
  ok(G.GAME.poke_pocket_c_keys === undefined, '3.2.1\'s per-pack c_keys bookkeeping is gone (3.9.1 create_card = create_pocket_card)');
});

await sec(() => {
  // The random Item: SMODS.create_card{set = 'poke_item', soulable = true, key_append = 'pocket'} after the 'pocket_evo_item' roll —
  // the very same draw as asking for it directly.
  start('PKT2', {}, { noBlind: true });
  const { center, pack } = pocketCard();
  let same = 0, tries = 0;
  for (let n = 0; n < 24; n++) {
    const want = peek(() => {
      const roll = pseudorandom(pseudoseed('pocket_evo_item'));
      if (roll > 0.92) return null; // (no held evolver: the evo path finds nothing and falls through, but skip these)
      return key(create_card('Item', G.pack_cards, null, null, true, true, undefined, 'pocket'));
    });
    const got = key(slot(center, pack, 2));
    if (want === null) continue;
    tries++;
    if (got === want) same++;
  }
  ok(tries >= 15 && same === tries, 'slot 2+ Item: the pocket_evo_item roll, then a soulable Item with key_append "pocket" (3.9.1 create_item)', { same, tries });
});

await sec(() => {
  // The evolution item: 8% (pocket_evo_item > 0.92) an item a held joker needs, by poll_evo_item('match').
  start('PKT3', {}, { noBlind: true });
  add('j_poke_vulpix'); // item_req firestone
  const { center, pack } = pocketCard();
  let hits = 0, fire = 0;
  for (let n = 0; n < 400 && hits < 6; n++) {
    const evo = peek(() => pseudorandom(pseudoseed('pocket_evo_item')) > 0.92);
    const c = slot(center, pack, 3);
    const k = key(c);
    // (poll_evo_item skips an item in play: a card just created marks used_jokers; let it go before the next roll)
    c.remove();
    if (!evo) continue;
    hits++;
    if (k === 'c_poke_firestone') fire++;
  }
  ok(hits >= 6 && fire === hits, 'the evolution-item roll (pocket_evo_item > 0.92) gives the Fire Stone Vulpix needs, every time', { hits, fire });
});

await sec(async () => {
  const { poll_evo_item } = await import('../../mods/pokermon/systems/items.js');
  start('PKT4', {}, { noBlind: true });
  ok(poll_evo_item('match') === undefined, 'poll_evo_item: no evolver held -> nothing');
  const v = add('j_poke_vulpix');
  ok(poll_evo_item('match') === 'c_poke_firestone', 'poll_evo_item: Vulpix -> the Fire Stone');
  const stone = add('c_poke_firestone');
  ok(G.GAME.used_jokers.c_poke_firestone && poll_evo_item('match') === undefined, 'poll_evo_item: a Fire Stone in play (used_jokers) is not offered again');
  stone.remove(); G.E_MANAGER.flush();
  G.GAME.banned_keys.c_poke_firestone = true;
  ok(poll_evo_item('match') === undefined, 'poll_evo_item: a banned item is not offered');
  delete G.GAME.banned_keys.c_poke_firestone;
  v.remove(); G.E_MANAGER.flush();
  // Gloom needs Leaf OR Sun Stone (a list): poll_evo_item rolls one of them (3.9.1's stones are always in their pool)
  add('j_poke_gloom');
  const got = new Set();
  for (let n = 0; n < 40; n++) got.add(poll_evo_item('match'));
  ok(got.size === 2 && got.has('c_poke_leafstone') && got.has('c_poke_sunstone'), 'poll_evo_item: a list requirement (Gloom) rolls one of its items', [...got]);
  // an item whose in_pool says no is never offered (3.9.1: G.P_CENTERS[key]:in_pool())
  const lp = P_CENTERS.c_poke_leafstone.in_pool, sp = P_CENTERS.c_poke_sunstone.in_pool;
  P_CENTERS.c_poke_leafstone.in_pool = () => false;
  const only = new Set();
  for (let n = 0; n < 20; n++) only.add(poll_evo_item('match'));
  P_CENTERS.c_poke_leafstone.in_pool = lp; P_CENTERS.c_poke_sunstone.in_pool = sp;
  // (the list is rolled first, then filtered, as in 3.9.1: a Leaf Stone roll comes back empty)
  ok(!only.has('c_poke_leafstone') && only.has('c_poke_sunstone') && only.has(undefined), 'poll_evo_item: an item out of its pool is skipped', [...only]);
});

await sec(() => {
  // a real Pocket Pack, bought in the shop and opened: 4 cards, the first an Energy, the rest Items; hand dealt (draw_hand)
  start('PKT5', {}, { noBlind: true });
  G.STATE = STATES.SHOP; G.STATE_COMPLETE = true;
  G.GAME.dollars = 100;
  const p = create_card('Booster', G.shop_booster, null, null, null, null, 'p_poke_pokepack_normal_1');
  G.shop_booster.emplace(p); G.E_MANAGER.flush();
  const r = act({ type: 'buy', id: p.sort_id });
  const cards = G.pack_cards.cards;
  ok(r.ok && cards.length === 4 && ['Energy', 'Spectral'].includes(cards[0].ability.set) && cards.slice(1).every((c) => c.ability.set === 'Item'),
    'a Pocket Pack bought and opened: an Energy and 3 Items', [r.ok, cards.map(key)]);
});

// ------------------------------------------------------------------ 2. the Debris Sleeve's alt
const isHazard = (c) => key(c) === 'm_poke_hazard';
const HZ = () => P_CENTERS.m_poke_hazard;
/** Debris deck (+ the Debris sleeve), blind selected. */
function debris(sleeve, seed = 'DEBALT') {
  const s = new Session();
  s.start({ seed, back: 'b_poke_diceydeck', sleeve: sleeve ? 'sleeve_poke_diceysleeve' : null, mods: ['pokermon'] });
  G.E_MANAGER.flush();
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  return s;
}
/** n Hazard cards on top of the deck (the next ones drawn). */
function hazardsOnTop(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = create_playing_card({ front: P_CARDS.S_7, center: HZ() }, G.deck);
    G.deck.remove_card(c); G.deck.cards.push(c); c.area = G.deck; // (the deck draws from the end)
    out.push(c);
  }
  return out;
}
await sec(() => {
  debris(true);
  ok(G.GAME.modifiers.poke_negative_hazards === true, 'Debris Deck + Debris Sleeve: the sleeve plays its alt (poke_negative_hazards)');
  ok(G.GAME.poke_hazard_level === 1 && G.GAME.poke_hazard_max === 4 && G.hand.config.card_limit === 9, 'the deck still applies (+1 Hazard layer and limit, +1 hand size); the alt adds no second layer / hand size',
    [G.GAME.poke_hazard_level, G.GAME.poke_hazard_max, G.hand.config.card_limit]);
  act({ type: 'select_blind' });
  const dealt = G.hand.cards.filter(isHazard);
  ok(dealt.length === 1 && dealt[0].ability.card_limit === 1, 'the first hand: its dealt Hazard card has card_limit +1', dealt.map((c) => c.ability.card_limit));
  ok(G.hand.cards.length === 10 && toView().hand_limit === 10, 'a held Hazard is +1 hand size: 9 + 1 dealt = 10 cards, hand limit 10', [G.hand.cards.length, toView().hand_limit]);
  const d = describe(dealt[0]);
  ok((d.info || []).some((i) => i.key === 'generic_card_limit_pc' && /\+1 hand size/.test(i.lines.join(' '))), 'a Hazard card\'s tooltip: "+1 hand size" (Steamodded generic_card_limit_pc)', d.info);
  // a play: the draw refills to 9 + every Hazard held; Hazards drawn take no hand space (Steamodded's card_limit draw)
  clearHand();
  const top = hazardsOnTop(3);
  const c1 = hand(['H_2'])[0];
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: [c1.sort_id] });
  act({ type: 'play' });
  ok(top.every((c) => G.hand.cards.includes(c)), 'the 3 Hazards on top of the deck were drawn');
  ok(G.hand.cards.length === 12 && toView().hand_limit === 12, 'drawn after a play: 9 cards + 3 Hazards = 12 held (each Hazard +1 hand size)', [G.hand.cards.length, toView().hand_limit]);
  // a Hazard that becomes something else gives its slot back
  top[0].set_ability(P_CENTERS.m_steel);
  ok(!top[0].ability.card_limit && toView().hand_limit === 11, 'a Hazard turned Steel: card_limit back to 0, hand limit 11', [top[0].ability.card_limit, toView().hand_limit]);
  top[0].set_ability(HZ());
  ok(top[0].ability.card_limit === 1, '... and Hazard again: +1 again', top[0].ability.card_limit);
});
await sec(() => {
  // the same draw without the alt (Debris Deck alone): Hazards take hand space as usual
  debris(false);
  ok(!G.GAME.modifiers.poke_negative_hazards, 'Debris Deck alone: no alt');
  act({ type: 'select_blind' });
  ok(G.hand.cards.filter(isHazard).every((c) => !c.ability.card_limit), 'Debris Deck alone: Hazards have no card_limit');
  clearHand();
  const top = hazardsOnTop(3);
  const c1 = hand(['H_2'])[0];
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15; G.GAME.current_round.hands_left = 3;
  act({ type: 'highlight', ids: [c1.sort_id] });
  act({ type: 'play' });
  ok(G.hand.cards.length === 9 && top.every((c) => G.hand.cards.includes(c)) && toView().hand_limit === 9, 'Debris Deck alone: the draw stops at 9 (3 of them Hazards)', [G.hand.cards.length, toView().hand_limit]);
  // another sleeve's deck: the Debris Sleeve plays its own effect
  const s = new Session(); s.start({ seed: 'DEBRED', back: 'b_red', sleeve: 'sleeve_poke_diceysleeve', mods: ['pokermon'] }); G.E_MANAGER.flush();
  ok(!G.GAME.modifiers.poke_negative_hazards && G.GAME.poke_hazard_level === 1 && G.hand.config.card_limit === 9, 'Debris Sleeve on the Red Deck: its own effect (layer +1, hand size +1), no alt');
});
await sec(() => {
  // the New Run picker shows the alt's text with the Debris Deck
  const s = findSleeve('sleeve_poke_diceysleeve');
  const alt = safe(() => sleeveInfo(s, 'b_poke_diceydeck')), own = safe(() => sleeveInfo(s, 'b_red'));
  ok(alt && alt.alt && /Hazards.*\+1.*hand size/i.test(alt.lines.join(' ').replace(/{[^}]*}/g, '')), 'the picker: "All Hazards give +1 hand size" on the Debris Deck (3.9.1 sleeve_poke_diceysleeve_alt)', alt);
  ok(own && !own.alt && /hazard layer/i.test(own.lines.join(' ')), 'the picker: its own text on another deck', own);
});
await sec(() => {
  // the seam is opt-in: a card_limit on a playing card adds nothing without an opted-in mod (vanilla, or mods that didn't opt in)
  newRun({ seed: 'VANCL', back: 'b_red' });
  G.E_MANAGER.flush();
  act({ type: 'select_blind' });
  G.hand.cards[0].ability.card_limit = 3;
  ok(toView().hand_limit === 8, 'vanilla: a playing card\'s card_limit is ignored (no opted-in mod)', toView().hand_limit);
});

// ------------------------------------------------------------------ 3. the Series A sprite series
const { modOptionList } = await import('../../js/mods/index.js');
const { POKE_UI, seriesA } = await import('../../mods/pokermon/ui.js');
const D391 = (await import('../../mods/pokermon/data391.js')).default;
const SERIES = { v: 'basic' };
POKE_UI.bind({ cosmetic: (mod, k) => (mod === 'pokermon' && k === 'series' ? SERIES.v : undefined) });
const viewOf = (k, edition) => {
  const c = add(k);
  if (edition) { c.set_edition(edition, true, true); G.E_MANAGER.flush(); }
  return cardView(c);
};
const face = (d) => POKE_UI.face(d, { jokers: [], area: 'jokers' });

await sec(() => {
  const op = modOptionList('pokermon').find((o) => o.key === 'series');
  ok(op && op.type === 'choice' && op.default === 'basic' && op.cosmetic && op.choices.map((c) => c.value).join() === 'basic,seriesa', 'Pokermon option "Joker art": Basic | Series A, Basic by default, cosmetic', op);
  ok(Object.keys(D391.series_a || {}).length === 136, '3.9.1\'s 136 Series A alternates (data391.js series_a)', Object.keys(D391.series_a || {}).length);
});

await sec(async () => {
  start('SERA', {}, { noBlind: true });
  const gengar = viewOf('j_poke_gengar'), pika = viewOf('j_poke_pikachu'), shiny = viewOf('j_poke_pikachu', 'e_poke_shiny');
  const bell = viewOf('j_poke_bellsprout'), bellS = viewOf('j_poke_bellsprout', 'e_poke_shiny'), baltoy = viewOf('j_poke_baltoy'), moltres = viewOf('j_poke_moltres');
  const charm = viewOf('j_poke_charmander'); // (no Series A alternate)
  SERIES.v = 'basic';
  ok([gengar, pika, bell, baltoy].every((d) => face(d) === null), 'Basic (default): the faces are the Basic cards');
  SERIES.v = 'seriesa';
  const g = face(gengar);
  ok(g && g.atlas === 'poke_AtlasJokersSeriesANatdex391' && g.pos.x === 6 && g.pos.y === 6 && g.soul_pos && g.soul_pos.x === 7, 'Series A: Gengar draws its Series A cell + its alt floating sprite {7,6}', g && [g.atlas, g.pos, g.soul_pos]);
  const p = face(pika), ps = face(shiny);
  ok(p && p.atlas === 'poke_AtlasJokersSeriesANatdex391' && p.pos.x === 18 && p.pos.y === 1, 'Series A: Pikachu {18,1} on the Series A Natdex sheet', p && [p.atlas, p.pos]);
  ok(ps && ps.atlas === 'poke_AtlasJokersSeriesANatdexShiny391' && ps.pos.x === 18, 'Series A + Shiny: the Series A Shiny sheet (3.9.1 e_poke_shiny on_load)', ps && ps.atlas);
  const m = face(moltres);
  ok(m && m.atlas === 'poke_AtlasJokersSeriesANatdex391' && m.soul_pos && m.soul_pos.x === 21 && m.soul_pos.y === 9, 'Series A: Moltres keeps its floating sprite, from the Series A sheet', m && [m.atlas, m.soul_pos]);
  const b = face(bell), bs = face(bellS), bt = face(baltoy);
  const ab = b && POKE_UI.anim(b), abs = bs && POKE_UI.anim(bs), abt = bt && POKE_UI.anim(bt);
  ok(b && b.atlas === 'poke_AtlasJokersSeriesABellsprout' && ab && ab.frames === 24 && ab.fps === 10 && ab.atlas === b.atlas, 'Series A: Bellsprout animates (24 frames, 10 fps)', [b && b.atlas, ab]);
  ok(bs && bs.atlas === 'poke_AtlasJokersSeriesABellsproutShiny' && abs && abs.frames === 24, 'Series A + Shiny: Bellsprout\'s Shiny strip animates', [bs && bs.atlas, abs]);
  ok(bt && bt.atlas === 'poke_AtlasJokersSeriesABaltoy' && abt && abt.frames === 32 && abt.fps === 50, 'Series A: Baltoy animates (32 frames, 50 fps)', abt);
  ok(face(charm) === null, 'Series A: a joker without a Series A cell keeps its Basic card (Charmander)');
  ok(POKE_UI.still(gengar) && POKE_UI.still(gengar).atlas === g.atlas, 'Series A: still cards (collection, Pokédex, deck editor) too');
  // every registered Series A atlas the faces name exists
  const { ATLASES } = await import('../../js/mods/registry.js');
  const named = new Set();
  for (const [n, s] of Object.entries(D391.series_a)) { named.add('poke_' + (s.anim || s.atlas + '391')); named.add('poke_' + (s.anim ? s.anim + 'Shiny' : s.atlas + 'Shiny391')); void n; }
  ok([...named].every((a) => ATLASES[a] && ATLASES[a].src), 'every Series A sheet / strip (and Shiny twin) a face can name is registered', [...named].filter((a) => !ATLASES[a]));
  SERIES.v = 'basic';
});

await sec(async () => {
  // add-ons on Pokermon's sheets follow the option (3.9.1 load_atlas path); an add-on's own sheet doesn't
  const { loadMods } = await import('../../js/mods/index.js');
  await loadMods(['pokermon', 'nacho', 'pokermonplus']);
  newRun({ seed: 'SERADD', back: 'b_red', mods: ['pokermon', 'nacho', 'pokermonplus'] }); G.E_MANAGER.flush();
  SERIES.v = 'seriesa';
  const ch = face(viewOf('j_nacho_chimchar')), le = face(viewOf('j_sonfive_lechonk')), ex = face(viewOf('j_nacho_excavator'));
  const s = D391.series_a.chimchar;
  ok(ch && ch.atlas === 'poke_' + s.atlas + '391' && ch.pos.x === s.pos.x && ch.pos.y === s.pos.y, 'Nacho\'s Chimchar (on Pokermon\'s sheet) draws its Series A cell', ch && [ch.atlas, ch.pos]);
  ok(le && /SeriesA/.test(le.atlas), 'Pokermon+\'s Lechonk (on Pokermon\'s sheet) draws its Series A cell', le && le.atlas);
  ok(ex === null || !/SeriesA/.test(String(ex.atlas)), 'Nacho\'s Excavator (its own sheet) is untouched');
  SERIES.v = 'basic';
});

// ------------------------------------------------------------------ 3b. Shiny on the Basic series: the Shiny sheet (3.9.1 e_poke_shiny on_load)
const { basicShiny } = await import('../../mods/pokermon/ui.js');
const twinOf = (a) => String(a).replace(/(391)?$/, 'Shiny$1');
await sec(async () => {
  const { loadMods } = await import('../../js/mods/index.js');
  const { ATLASES } = await import('../../js/mods/registry.js');
  await loadMods(['pokermon', 'nacho', 'pokermonplus']);
  newRun({ seed: 'SHBASIC', back: 'b_red', mods: ['pokermon', 'nacho', 'pokermonplus'] }); G.E_MANAGER.flush();
  SERIES.v = 'basic';
  const pika = viewOf('j_poke_pikachu'), pikaS = viewOf('j_poke_pikachu', 'e_poke_shiny');
  const f = face(pikaS);
  ok(face(pika) === null, 'Basic: a plain Pikachu is its Basic card');
  ok(f && f.atlas === 'poke_AtlasJokersBasicNatdexShiny391' && f.pos.x === pikaS.pos.x && f.pos.y === pikaS.pos.y && f.edition === 'poke_shiny',
    'Basic + Shiny: Pikachu draws the same cell of the Basic Natdex SHINY sheet (and keeps the Shiny edition, whose shader 3.9.1 still draws)', f && [f.atlas, f.pos, f.edition]);
  const st = POKE_UI.still(pikaS);
  ok(st && st.atlas === 'poke_AtlasJokersBasicNatdexShiny391' && POKE_UI.still(pika) === null, 'Basic + Shiny: still cards (collection, Pokédex, deck editor) draw the Shiny sheet too', st && st.atlas);
  // a Mega: its card and its floating sprite both come from the Shiny sheet
  const mg = face(viewOf('j_poke_mega_gengar', 'e_poke_shiny'));
  ok(mg && mg.atlas === 'poke_AtlasJokersBasicGen01Shiny391' && mg.soul_pos, 'Basic + Shiny: Mega Gengar (card + floating sprite) on the Gen01 Shiny sheet', mg && [mg.atlas, mg.soul_pos]);
  // Kecleon's type card (set_sprite_pos on the Shiny sheet), Unown's form
  const kv = viewOf('j_poke_kecleon', 'e_poke_shiny');
  const k = face({ ...kv, poke: { ...(kv.poke || {}), ptype: 'Fire' } });
  ok(k && k.atlas === 'poke_AtlasJokersBasicGen03Shiny391', 'Basic + Shiny: Kecleon\'s type card is on the Gen03 Shiny sheet', k && k.atlas);
  const uv = viewOf('j_poke_unown', 'e_poke_shiny');
  const u = face({ ...uv, poke: { ...(uv.poke || {}), form: 'B' } });
  ok(u && /Shiny391$/.test(u.atlas) && u.soul_pos && u.soul_pos.x === 2, 'Basic + Shiny: Unown\'s form letter floats over its Shiny card', u && [u.atlas, u.soul_pos]);
  // Zorua: its illusion by its own edition; its disguise copies the target's sprite by the TARGET's edition
  const zS = viewOf('j_poke_zorua', 'e_poke_shiny'), z = viewOf('j_poke_zorua');
  const ill = face({ ...zS, poke: { ...(zS.poke || {}), illusion: 'j_poke_pikachu' } });
  ok(ill && ill.atlas === 'poke_AtlasJokersBasicNatdexShiny391' && ill.win_key === 'j_poke_zorua', 'Basic + Shiny: a Shiny Zorua\'s illusion is the Shiny Pikachu card', ill && ill.atlas);
  const tgt = viewOf('j_poke_bulbasaur', 'e_poke_shiny');
  const dz = POKE_UI.face(z, { jokers: [z, tgt], area: 'jokers' });
  ok(dz && dz.atlas === 'poke_AtlasJokersBasicNatdexShiny391' && dz.win_key === 'j_poke_zorua', 'Basic: Zorua disguised as a Shiny Bulbasaur draws Bulbasaur\'s Shiny card', dz && dz.atlas);
  // Series A on, a joker without a Series A cell: its Basic Shiny card (load_atlas keeps the Basic sheet, on_load adds 'Shiny')
  SERIES.v = 'seriesa';
  const ch = face(viewOf('j_poke_charmander', 'e_poke_shiny'));
  ok(ch && ch.atlas === 'poke_AtlasJokersBasicNatdexShiny391', 'Series A + Shiny, no Series A cell (Charmander): the Basic Shiny sheet', ch && ch.atlas);
  SERIES.v = 'basic';
  // the add-ons on Pokermon's sheets (3.9.1 and the 3.2.1 sheets), and the add-ons' own sheets
  const nch = viewOf('j_nacho_chimchar', 'e_poke_shiny'), sal = viewOf('j_nacho_mega_salamence', 'e_poke_shiny'), lec = viewOf('j_sonfive_lechonk', 'e_poke_shiny');
  ok(face(nch) && face(nch).atlas === twinOf(nch.atlas) && /^poke_AtlasJokersBasic/.test(nch.atlas), 'Basic + Shiny: Nacho\'s Chimchar (Pokermon\'s sheet) draws its Shiny cell', face(nch) && face(nch).atlas);
  ok(sal.atlas === 'poke_AtlasJokersBasicGen03' && face(sal) && face(sal).atlas === 'poke_AtlasJokersBasicGen03Shiny', 'Basic + Shiny: Nacho\'s Mega Salamence (Pokermon\'s 3.2.1 Gen03 sheet) draws its Shiny twin', face(sal) && face(sal).atlas);
  ok(face(lec) && face(lec).atlas === twinOf(lec.atlas), 'Basic + Shiny: Pokermon+\'s Lechonk draws its Shiny cell', face(lec) && face(lec).atlas);
  const ex = face(viewOf('j_nacho_excavator', 'e_poke_shiny'));
  ok(ex && ex.atlas === 'nacho_shiny_excavator179', 'Basic + Shiny: Nacho\'s Excavator draws its own Shiny sheet (on_load\'s poke_custom_prefix branch: nacho_shiny_excavator)', ex && ex.atlas);
  // no Shiny twin: today's card + the shader
  for (const kk of ['j_poke_rage_candy_bar', 'j_poke_capture_disc', 'j_poke_repel', 'j_sonfive_member_card']) {
    const v = viewOf(kk, 'e_poke_shiny');
    ok(basicShiny(v) === null && v.edition === 'poke_shiny', `no Shiny sheet: ${kk} keeps its card + the Shiny shader`, v.atlas);
  }
  // every joker on a Basic joker sheet has its Shiny twin registered
  const miss = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && /^poke_AtlasJokersBasic/.test(String(c.atlas)) && !(ATLASES[twinOf(c.atlas)] && ATLASES[twinOf(c.atlas)].src)).map((c) => c.key);
  ok(miss.length === 0, 'every joker on a Basic joker sheet has its Shiny twin sheet registered', miss);
});

// art: every Basic-sheet joker's Shiny cell (card or floating sprite) is a real, recoloured picture
await sec(async () => {
  if (!ART) { ok(false, 'the Pokermon art is not here (set MICATRO_MAIN to the main checkout)'); return; }
  const W = 142, H = 190;
  const fileOf = (a) => { const m = /^poke_(AtlasJokersBasic\w+?)(Shiny)?(391)?$/.exec(a); return path.join(ART, 'Basic Series', m[1] + (m[2] || '') + (m[3] ? '-391' : '') + '.png'); };
  const list = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && /^poke_AtlasJokersBasic/.test(String(c.atlas)) && c.pos);
  const req = {};
  list.forEach((c, i) => {
    for (const [tag, pos] of [['c', c.pos], ['s', c.soul_pos && c.soul_pos.x < 90 ? c.soul_pos : null]]) {
      if (!pos) continue;
      for (const [f, t] of [[fileOf(c.atlas), 'b'], [fileOf(twinOf(c.atlas)), 'h']]) (req[f] = req[f] || {})[i + tag + t] = [pos.x * W, pos.y * H, W, H];
    }
  });
  const px = {};
  for (const [f, r] of Object.entries(req)) { if (!fs.existsSync(f)) { ok(false, 'missing ' + f); continue; } Object.assign(px, await crops(f, r)); }
  const opaque = (a) => { let n = 0; for (let i = 3; i < a.px.length; i += 4) if (a.px[i] > 128) n++; return n / (a.px.length / 4); };
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]); return d / a.px.length; };
  const bad = [];
  list.forEach((c, i) => {
    const cb = px[i + 'cb'], ch = px[i + 'ch'], sb = px[i + 'sb'], sh = px[i + 'sh'];
    const real = cb && ch && cb.inside && ch.inside && opaque(ch) > 0.5;
    const recol = (cb && ch && diff(cb, ch) > 0.15) || (sb && sh && sb.inside && sh.inside && diff(sb, sh) > 0.15);
    if (!real || !recol) bad.push(c.key);
  });
  ok(list.length > 600 && bad.length === 0, `every Basic-sheet joker's Shiny cell is a real picture, recoloured from its Basic cell (${list.length} jokers)`, bad);
});

await sec(() => {
  // cosmetic: the option never reaches the engine — not in the run's options, not in the recipe; gameplay and checksum unchanged
  const runWith = (opts) => {
    const s = new Session();
    s.start({ seed: 'SERCHK', back: 'b_red', mods: ['pokermon'], modOptions: { pokermon: opts } });
    G.E_MANAGER.flush();
    s.act({ type: 'select_blind' });
    for (let i = 0; i < 3 && G.STATE === STATES.SELECTING_HAND; i++) {
      s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
      s.act({ type: 'play' });
    }
    return { recipe: clone(s.recipe), opts: clone(G.GAME.mod_options), sum: viewChecksum(toView()), hand: G.hand.cards.map((c) => c.base && c.base.id + c.base.suit).join() };
  };
  const a = runWith({}), b = runWith({ series: 'seriesa' });
  ok(b.opts.pokermon && b.opts.pokermon.series === undefined && b.recipe.modOptions.pokermon.series === undefined, 'Series A chosen: not in the run\'s mod options, not in the recipe', [b.opts.pokermon && b.opts.pokermon.series, b.recipe.modOptions]);
  ok(JSON.stringify(a.recipe.modOptions) === JSON.stringify(b.recipe.modOptions) && a.sum === b.sum && a.hand === b.hand, 'Series A chosen: the same recipe options, the same play, the same checksum', [a.sum, b.sum]);
});

await sec(async () => {
  // the viewer's choice is their saved mod options (screens.js micatro_mods), else the default
  const store = {};
  globalThis.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const { cosmetic } = await import('../../js/ui/modui.js');
  const { bindModRegistry } = await import('../../js/ui/assets.js');
  bindModRegistry(await import('../../js/mods/registry.js'));
  ok(cosmetic('pokermon', 'series') === 'basic', 'modui cosmetic(): nothing saved -> the option\'s default (Basic)');
  store.micatro_mods = JSON.stringify({ ids: ['pokermon'], options: { pokermon: { series: 'seriesa' } } });
  ok(cosmetic('pokermon', 'series') === 'seriesa', 'modui cosmetic(): the viewer\'s saved choice (Series A)');
});

// ------------------------------------------------------------------ art: the cells the faces draw are real Series A pictures
await sec(async () => {
  if (!ART) { ok(false, 'the Pokermon art is not here (set MICATRO_MAIN to the main checkout)'); return; }
  const W = 142, H = 190;
  const file = (a) => { const s = a.replace(/^poke_/, '').replace(/391$/, ''); const f391 = path.join(ART, 'Series A', s + '-391.png'); return fs.existsSync(f391) ? f391 : path.join(ART, 'Series A', s + '.png'); };
  const basicFile = (a) => path.join(ART, 'Basic Series', a.replace(/^poke_/, '').replace(/SeriesA/, 'Basic').replace(/391$/, '') + '-391.png');
  const names = ['gengar', 'pikachu', 'moltres', 'ho_oh', 'eevee', 'zangoose', 'seviper', 'chimchar', 'lechonk'];
  const req = {};
  for (const n of names) {
    const s = D391.series_a[n];
    for (const [f, tag] of [[file('poke_' + s.atlas + '391'), 'a'], [file('poke_' + s.atlas + 'Shiny391'), 's'], [basicFile('poke_' + s.atlas + '391'), 'b']]) (req[f] = req[f] || {})[n + tag] = [s.pos.x * W, s.pos.y * H, W, H];
  }
  const px = {};
  for (const [f, r] of Object.entries(req)) { if (!fs.existsSync(f)) { ok(false, 'missing ' + f); continue; } Object.assign(px, await crops(f, r)); }
  const opaque = (a) => { let n = 0; for (let i = 3; i < a.px.length; i += 4) if (a.px[i] > 128) n++; return n / (a.px.length / 4); };
  const diff = (a, b) => { let d = 0; for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i]); return d / a.px.length; };
  for (const n of names) {
    const a = px[n + 'a'], s = px[n + 's'], b = px[n + 'b'];
    ok(a && s && b && a.inside && opaque(a) > 0.5 && opaque(s) > 0.5 && diff(a, b) > 5, `${n}: its Series A cell (and Shiny twin) is a real picture, not the Basic card`, a && b && [opaque(a), diff(a, b)]);
  }
  for (const strip of ['Bellsprout', 'Voltorb', 'Electrode', 'Baltoy', 'Claydol']) {
    for (const sh of ['', 'Shiny']) {
      const f = path.join(ART, 'Series A', 'AtlasJokersSeriesA' + strip + sh + '.png');
      const buf = fs.existsSync(f) ? fs.readFileSync(f) : null;
      const w = buf ? buf.readUInt32BE(16) : 0;
      const fr = (await import('../../mods/pokermon/systems/anim.js')).SERIES_A_ANIM['AtlasJokersSeriesA' + strip].frames;
      ok(buf && w === fr * W, `the ${strip}${sh} strip holds its ${fr} frames in one row`, w);
    }
  }
});

done();
