// Pokermon 3.9.1 batch 17, the last of the upgrade (PORTING.md "Batch 17"): the non-Pokédex jokers, the April Fools jokers, the
// Starter Pack...? / Tag...?, the five boss blinds and 3.9.1's own Iridescent Hacker, the Elite stake, the 12 challenges (5 new),
// the Obituary / Revenant sleeves' alts (Pink Seal 1 in 3), and Steamodded object_weights (the Soul items' weights).
// Everything is FIRED through the engine (act / real rounds / the real blinds), not by reading the data:
//   - Rage Candy Bar, Bitter Rival, Champion (the Rival chain), Imposter Professor (+ its Starter Pack...?), Oologist (+ the Mystery
//     Egg's hatch speed-ups), Daycare, Repel; Spiclops, Miror Budicolo (+ the Ludicolo card), Capture Disc (the drag action)
//   - The Mirror, The Rocket, The Star, Gray Godfather, White Executive, the Iridescent Hacker (3.9.1 logic)
//   - the Elite stake (+2 win ante, the showdown antes, the New Run picker and Nacho's Elite's precedence)
//   - each challenge's setup and rules (Mystery Dungeon: the daily seed from a date passed in, the deck pick, replay determinism)
//   - object_weights (the item weights, the soul items, the Edition weights, the Revenant alt's Pocket Packs), the Pink Seal
//   - the overlay (data391.js new_jokers "17", sprite_extra, families, consumable_spawn, challenges) and contentRev 15; the art
//   node micatro/tests/mods/pokermon_391_batch17_test.mjs   (art checks need the gitignored art: MICATRO_MAIN)
import fs from 'fs';
import path from 'path';
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_BLINDS, P_STAKES, P_SEALS, get_new_boss, create_card } from '../../js/engine/core.js';
import { MODS, feature } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { Session } from '../../js/engine/session.js';
import { newRun, STATES } from '../../js/engine/run.js';
import { findChallenge } from '../../js/engine/challenge.js';
import { poll_object, calculate_seam } from '../../js/engine/smods.js';
import { modStakes } from '../../js/mods/index.js';
import * as VIEW from '../../js/engine/view.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import * as P from '../../mods/pokermon/api.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
// (namespace / dynamic imports: on a build without batch 17 these names or files are missing — each check then fails, not the suite)
import * as PACKS1 from '../../mods/pokermon/boosters/packs1.js';
import * as CHAL from '../../mods/pokermon/challenges.js';
import * as BOSS from '../../mods/pokermon/blinds/pokebossblind.js';
const opt = async (p) => { try { return await import(p); } catch { return {}; } };
const APRIL = await opt('../../mods/pokermon/jokers/zzzapril_fools.js');
const STAKES = await opt('../../mods/pokermon/stakes.js');
const starterq_lists = PACKS1.starterq_lists || (() => ({ grass: [], fire: [], water: [], pseudo: [], bidoof_yamper: [] }));
const { daily_of_seed = () => null, mystery_dungeon_decks = () => [] } = CHAL;
const { capture_disc_drag = () => 0, APRIL_FOOLS = new Set(['spiclops', 'miror_budicolo', 'capture_disc']) } = APRIL;
const white_executive_total = BOSS.white_executive_total || (() => 0);
const elite_boss_eligible = STAKES.elite_boss_eligible || (() => undefined);
import '../../mods/nacho/index.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
const flush = () => G.E_MANAGER.flush();
const NEW = ['rage_candy_bar', 'bitter_rival', 'champion', 'imposter_professor', 'daycare', 'oologist', 'spiclops', 'miror_budicolo', 'capture_disc'];
const BLINDS = ['bl_poke_mirror', 'bl_poke_rocket', 'bl_poke_star', 'bl_poke_gray_godfather', 'bl_poke_white_executive'];
const PACKS = () => [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
/** From the shop / a skip: past any tag pack to the next blind, selected. */
const toNextBlind = () => {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  act({ type: 'select_blind' });
  clearHand();
};
/** Win the current blind and go to the next one (selected). */
const advance = () => { winRound(); toNextBlind(); };
/** From a fresh start (Small selected): to the Boss Blind `bossKey`, selected. */
const toBoss = (bossKey) => { G.FORCE_BOSS = bossKey; G.GAME.round_resets.blind_choices.Boss = bossKey; advance(); advance(); };
const onDeckTop = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};

// ------------------------------------------------------------------- the overlay
sec('overlay', () => {
  ok(MODS.pokermon.version === '3.9.1' && MODS.pokermon.contentRev >= 15 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon 3.9.1, contentRev 15+ (pin 3.9.1+r15 since batch 17; r16 the leftovers batch)', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  const n17 = Object.entries(D391.new_jokers).filter(([, v]) => v.sub_batch === '17').map(([n]) => n);
  ok(n17.slice().sort().join() === NEW.slice().sort().join(), 'data391.js new_jokers "17": the 6 non-Pokédex + 3 April Fools jokers', n17);
  ok(NEW.every((n) => C(n) && !C(n).unported), 'every one is registered and ported');
  ok(C('repel') && !C('repel').unported && C('repel').in_pool() === false && C('repel').atlas === 'poke_repel', 'Repel: registered in full (3.9.1 never registers it), never offered, its composed card');
  ok(D391.rework_deferred.map(([n]) => n).join() === 'porygonz', 'rework_deferred: only Porygon-Z left (Rival and Mystery Egg done)', D391.rework_deferred);
  ok(D391.families.some((f) => f.join() === 'rival,bitter_rival,champion'), 'the Rival family: Rival, Bitter Rival, Champion');
  ok(['rage_candy_bar', 'miror_budicolo', 'capture_disc'].every((n) => D391.sprites[n].extra) && C('rage_candy_bar').atlas === 'poke_rage_candy_bar'
    && C('miror_budicolo').atlas === 'poke_miror_budicolo' && C('capture_disc').atlas === 'poke_capture_disc', 'sprite_extra: own atlases / the composed card');
  ok(['bitter_rival', 'champion', 'imposter_professor', 'daycare', 'oologist', 'spiclops'].every((n) => C(n).atlas === 'poke_AtlasJokersBasicOthers391'),
    'the others: 3.9.1 Others sheet');
  ok(C('oologist').pos.x === 4 && C('oologist').pos.y === 4 && C('daycare').pos.x === 2 && C('daycare').pos.y === 4 && C('spiclops').pos.x === 6 && C('spiclops').pos.y === 4, 'their 3.9.1 cells');
  ok(D391.challenges.length === 12 && D391.consumable_spawn.greatball.weight === 3, 'the overlay carries the 12 challenges and the consumables\' spawn fields');
  ok(C('bellsprout').knockoff_starter && C('mareep').knockoff_pseudol && C('slugma').knockoff_starter, '3.9.1\'s knock-off starter flags (Bellsprout, Mareep, Slugma, ...)');
  ok(P_CENTERS.b_poke_pokemondeck.poke_option === undefined, 'the Trainer Deck: no pokeballs gate (3.9.1)');
});

// ------------------------------------------------------------------- Rage Candy Bar
sec('rage candy bar', () => {
  start('B17_RAGE');
  const rc = add('j_poke_rage_candy_bar');
  const t1 = onDeckTop('S_K'), t2 = onDeckTop('S_Q');
  play(hand(['H_2']));
  flush();
  ok(t1.destroyed && t2.destroyed && !G.playing_cards.includes(t1) && !G.playing_cards.includes(t2) && rc.ability.extra.hands === 2, 'first hand: the top 2 deck cards are destroyed (3 -> 2 hands left)', rc.ability.extra);
  const t3 = onDeckTop('S_J');
  play(hand(['H_3']));
  flush();
  ok(!t3.destroyed && rc.ability.extra.hands === 2, 'a second hand: nothing');
  advance();
  rc.ability.extra.hands = 1;
  const r = play(hand(['H_4']));
  flush();
  ok(!G.jokers.cards.includes(rc) && statusMsgs(r.events).includes('Eaten!'), 'the third first-hand: eaten', statusMsgs(r.events));
});

// ------------------------------------------------------------------- the Rival chain
sec('rival chain', () => {
  start('B17_RIVAL', {}, { noBlind: true });
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  ok(C('rival').in_pool(C('rival')) && !C('bitter_rival').in_pool(C('bitter_rival')) && !C('champion').in_pool(C('champion')), 'at first: Rival in the pool, Bitter Rival / Champion not');
  const rv = add('j_poke_rival');
  act({ type: 'skip_blind' });
  for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  ok(rv.ability.extra.money === 25, 'Rival: a skipped Blind raises the payout by $10', rv.ability.extra.money);
  act({ type: 'select_blind' }); clearHand();
  advance(); // big -> boss
  const d0 = G.GAME.dollars;
  const r = winRound();
  flush();
  ok(G.GAME.poke_rival_defeated && !G.jokers.cards.includes(rv) && statusMsgs(r.events).includes('Smell Ya Later!'), 'a beaten Boss: the Rival pays and leaves', statusMsgs(r.events));
  ok(!C('rival').in_pool(C('rival')) && C('bitter_rival').in_pool(C('bitter_rival')) && !C('champion').in_pool(C('champion')), '... now Bitter Rival is in the pool (Rival is not)');
  toNextBlind(); // ante 2 small
  const br = add('j_poke_bitter_rival');
  ok(br.ability.extra.money === 25 && br.ability.extra.money_mod === 20, 'Bitter Rival: $25, +$20 per skip');
  advance(); advance(); // -> boss
  const r2 = winRound();
  flush();
  ok(G.GAME.poke_bitter_rival_defeated && !G.jokers.cards.includes(br) && statusMsgs(r2.events).includes('Smell Ya Later!'), 'Bitter Rival beaten at the Boss: leaves', statusMsgs(r2.events));
  ok(!C('bitter_rival').in_pool(C('bitter_rival')) && C('champion').in_pool(C('champion')), '... and Champion is in the pool');
  toNextBlind();
  const ch = add('j_poke_champion');
  G.GAME.skips = 3;
  const p = play(hand(['H_2']));
  ok(p.total && Math.abs(p.total.mult - 1 * 1.6) < 1e-9, 'Champion: X(1 + 0.2 per skip) — 3 skips: X1.6', p.total);
  advance(); advance();
  const t0 = G.GAME.tags.length;
  winRound(); flush();
  ok(G.GAME.tags.length === t0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_skip', 'Champion: a Speed Tag for a beaten Boss', G.GAME.tags.map((t) => t.key));
  ok(G.jokers.cards.includes(ch), '... and it stays');
});

// ------------------------------------------------------------------- Imposter Professor + Starter Pack...?
sec('imposter professor', () => {
  start('B17_PROF');
  ok(C('professor').in_pool(C('professor')) && C('imposter_professor').in_pool(C('imposter_professor')), 'both Professors are in the pool while every starter slot has a candidate');
  const L = starterq_lists();
  ok(L.grass.includes('j_poke_bellsprout') && L.fire.includes('j_poke_ponyta') && L.water.includes('j_poke_slowpoke') && L.pseudo.includes('j_poke_mareep')
    && L.bidoof_yamper.includes('j_poke_bidoof'), 'Starter Pack...? candidates: the knock-off starters (3.9.1 flags), Bidoof / Yamper', Object.fromEntries(Object.entries(L).map(([k, v]) => [k, v.length])));
  const ip = add('j_poke_imposter_professor');
  ok(ip.ability.extra.form === 1, 'owned: form 1');
  const v = { center: key(ip) };
  view_card(ip, v);
  const f = POKE_UI.face({ ...v, center: key(ip), atlas: ip.config.center.atlas, pos: ip.config.center.pos });
  ok(f && f.pos.x === 8 && f.pos.y === 1, 'its card: the unmasked cell (Others {8,1})', f && f.pos);
  advance();
  winRound();
  ok(ip.ability.extra.rounds_current === 2, 'two rounds counted');
  act({ type: 'cash_out' });
  const r = act({ type: 'sell', id: ip.sort_id });
  flush();
  const dex = G.jokers.cards.find((c) => key(c) === 'j_poke_pokedex');
  ok(r.ok && dex && dex.ability.rental && G.GAME.tags.some((t) => t.key === 'tag_poke_starterq_tag'), 'sold: a rental Pokédex and a Starter Tag...?', G.GAME.tags.map((t) => t.key));
  act({ type: 'next_round' });
  flush();
  const pack = G.pack_cards.cards.map(key);
  ok(PACKS().includes(G.STATE) && pack.length === 4 && starterq_lists() && pack.every((k) => P_CENTERS[k].knockoff_starter || P_CENTERS[k].knockoff_pseudol || ['j_poke_bidoof', 'j_poke_yamper'].includes(k)),
    'the tag opens the Starter Pack...?: knock-off starters (Grass, Fire, Water, Bidoof / Yamper)', pack);
  ok(P_CENTERS[pack[0]].ptype === 'Grass' && P_CENTERS[pack[1]].ptype === 'Fire' && P_CENTERS[pack[2]].ptype === 'Water', '... in slot order', pack);
});

// ------------------------------------------------------------------- Oologist + Mystery Egg
sec('oologist', () => {
  start('B17_OOLO');
  const oo = add('j_poke_oologist');
  for (let i = 0; i < 6; i++) advance();
  ok(oo.ability.extra.rounds_current === 6, '6 rounds counted', oo.ability.extra.rounds_current);
  const r = act({ type: 'sell', id: oo.sort_id });
  flush();
  const eggs = G.jokers.cards.filter((c) => key(c) === 'j_poke_mystery_egg');
  ok(r.ok && eggs.length === 2 && eggs.every((e) => e.edition && e.edition.negative), 'sold after 6 rounds: 2 Negative Mystery Eggs', eggs.length);
  // the hatch speed-ups (only with an Oologist): 2 Flame Body neighbours + 2 Fire Energy -> a sure extra round and -0.5
  const run = (withOolo) => {
    start('B17_EGG');
    const a = add('j_poke_slugma'), egg = add('j_poke_mystery_egg'), b = add('j_poke_magby');
    add('c_poke_fire_energy'); add('c_poke_fire_energy');
    if (withOolo) add('j_poke_oologist');
    egg.ability.extra.rounds = 3;
    winRound(); flush();
    return egg.ability.extra.rounds;
  };
  ok(run(false) === 2, 'no Oologist: one round off');
  ok(run(true) === 0.5, 'with the Oologist: 1 + 1 (Fire Energy / Flame Body roll) + 2/4 rounds off', run(true));
});

// ------------------------------------------------------------------- Daycare
sec('daycare', () => {
  start('B17_DAY');
  add('j_poke_charmeleon');
  const dc = add('j_poke_daycare');
  add('j_poke_ivysaur');
  const r = act({ type: 'sell', id: dc.sort_id });
  flush();
  const egg = G.jokers.cards.find((c) => key(c) === 'j_poke_mystery_egg');
  ok(r.ok && egg && ['j_poke_charmander', 'j_poke_bulbasaur'].includes(egg.ability.extra.key) && egg.ability.extra.rounds === 3, 'sold between two Pokémon: an egg of a parent\'s lowest stage (3 rounds)', egg && egg.ability.extra);
  start('B17_DAY2');
  add('j_poke_pichu');
  const dc2 = add('j_poke_daycare');
  add('j_poke_ivysaur');
  act({ type: 'sell', id: dc2.sort_id }); flush();
  ok(!G.jokers.cards.some((c) => key(c) === 'j_poke_mystery_egg'), 'a Baby neighbour does not breed: no egg');
});

// ------------------------------------------------------------------- Repel
sec('repel', () => {
  start('B17_REPEL');
  toBoss('bl_wall');
  const rp = add('j_poke_repel');
  const r = act({ type: 'sell', id: rp.sort_id });
  flush();
  ok(r.ok && G.GAME.blind.disabled && G.GAME.tags.some((t) => t.key === 'tag_d_six'), 'sold during a Boss: it is disabled, and a D6 Tag', G.GAME.tags.map((t) => t.key));
  ok(!C('repel').in_pool(C('repel')), 'never in a pool');
});

// ------------------------------------------------------------------- April Fools
sec('april fools', () => {
  start('B17_APRIL');
  ok([...APRIL_FOOLS].every((n) => C(n).in_pool(C(n)) === false), 'option off: none of the April Fools jokers is offered');
  ok(P.get_random_poke_key('x', 'Basic') !== 'j_poke_miror_budicolo', 'option off: not a random Pokémon pick either');
  start('B17_APRIL2', { pokemon_aprilfools: true }, { noBlind: true });
  ok(['spiclops', 'miror_budicolo', 'capture_disc'].every((n) => C(n).in_pool(C(n)) !== false), 'option on: offered');
  const hs = G.hand.config.card_limit, hl = G.GAME.poke_hazard_level || 0;
  const sp = add('j_poke_spiclops');
  ok(G.hand.config.card_limit === hs + 4 && G.GAME.poke_hazard_level === hl + 1, 'Spiclops: +4 hand size, +1 Hazard layer');
  const d0 = G.GAME.round_resets.discards;
  act({ type: 'select_blind' }); flush();
  ok(G.GAME.current_round.discards_left === d0 - 1 && G.hand.config.card_limit === hs + 4 + 1, 'Spiclops at Blind select: -1 discard, + hand size = the Hazard level', [G.GAME.current_round.discards_left, G.hand.config.card_limit]);
  clearHand();
  // Capture Disc: shaking it (the drag action) gains Mult
  const cd = add('j_poke_capture_disc');
  const a = act({ type: 'poke_capture_disc_drag', id: cd.sort_id, segs: [0.5, 10, 10, 10, 30] });
  ok(a.ok && cd.ability.extra.mult === 2, 'Capture Disc: a drag of 60.5 units shakes it twice (> 0, then > 25)', cd.ability.extra.mult);
  ok(!act({ type: 'poke_capture_disc_drag', id: cd.sort_id, segs: [-1] }).ok && !act({ type: 'poke_capture_disc_drag', id: sp.sort_id, segs: [1] }).ok, 'a bad drag / another card is refused');
  const p = play(hand(['H_2']));
  ok(p.total && p.total.mult === 1 + 2, 'Capture Disc: +2 Mult', p.total);
  winRound(); flush();
  ok(cd.ability.extra.mult === 0, 'reset at end of round');
  // frame by frame, as the Lua's card.drag: the threshold is 25 x the Mult it has NOW, and each shake starts the count over
  ok(capture_disc_drag(cd, [1, 20, 6, 30, 19]) === 2 && cd.ability.extra.mult === 2, 'capture_disc_drag: 1 (> 0), 20+6 (> 25), then 30+19 is < 50', cd.ability.extra.mult);
  cd.ability.extra.mult = 0;
  // Miror Budicolo: becomes a Ludicolo card in the deck
  toNextBlind();
  const n0 = G.playing_cards.length;
  const mb = add('j_poke_miror_budicolo');
  flush();
  const lud = G.playing_cards.find((c) => key(c) === 'm_poke_ludicolo');
  ok(!G.jokers.cards.includes(mb) && G.playing_cards.length === n0 + 1 && lud && G.deck.cards.includes(lud), 'Miror Budicolo: leaves the joker row, a Ludicolo card joins the deck');
  G.deck.cards.splice(G.deck.cards.indexOf(lud), 1); G.hand.emplace(lud);
  const r = play([lud, ...hand(['H_9'])]);
  ok(statusMsgs(r.events).includes('Ludicolo!') && lud.get_id() < 0, 'the Ludicolo card: no rank, always scores, "Ludicolo!"', statusMsgs(r.events));
});

// ------------------------------------------------------------------- the boss blinds
sec('the mirror', () => {
  start('B17_MIRROR');
  const left = add('j_poke_charmander'), right = add('j_poke_squirtle');
  right.set_eternal(true);
  toBoss('bl_poke_mirror');
  flush();
  ok(key(right) === 'j_poke_ditto' && !right.ability.eternal && key(left) === 'j_poke_charmander', 'The Mirror: the rightmost joker becomes Ditto (no longer Eternal)', [key(left), key(right)]);
});
sec('the rocket', () => {
  start('B17_ROCKET');
  G.GAME.dollars = 30;
  toBoss('bl_poke_rocket');
  flush();
  ok(G.GAME.blind.config.blind.key === 'bl_poke_rocket', 'fighting The Rocket');
  // (toBoss clears the hand: draw again)
  G.FUNCS_draw = null;
  start('B17_ROCKET2', {}, { noBlind: true });
  G.GAME.dollars = 30;
  G.FORCE_BOSS = 'bl_poke_rocket'; G.GAME.round_resets.blind_choices.Boss = 'bl_poke_rocket';
  act({ type: 'skip_blind' }); for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  act({ type: 'skip_blind' }); for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  G.GAME.dollars = 30;
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.length > 0 && G.hand.cards.every((c) => c.facing === 'back'), 'with $25+: every card is drawn face down', G.hand.cards.map((c) => c.facing));
  start('B17_ROCKET3', {}, { noBlind: true });
  G.FORCE_BOSS = 'bl_poke_rocket'; G.GAME.round_resets.blind_choices.Boss = 'bl_poke_rocket';
  act({ type: 'skip_blind' }); for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  act({ type: 'skip_blind' }); for (let k = 0; k < 4 && PACKS().includes(G.STATE); k++) act({ type: 'skip_booster' });
  G.GAME.dollars = 4;
  act({ type: 'select_blind' }); flush();
  ok(G.hand.cards.every((c) => c.facing !== 'back'), 'with less: face up');
});
sec('the star / the hacker', () => {
  for (const bk of ['bl_poke_star', 'bl_poke_iridescent_hacker']) {
    start('B17_STAR' + bk.length);
    const js = ['charmander', 'squirtle', 'bulbasaur', 'pikachu', 'abra', 'machop', 'eevee', 'gastly'].map((n) => add('j_poke_' + n));
    const jk = add('j_joker'); P.apply_type_sticker(jk, 'Metal');
    toBoss(bk);
    const types = () => (bk === 'bl_poke_star' ? [G.GAME.blind.effect.ptype] : G.GAME.blind.effect.ptypes);
    const right = () => [...js, jk].every((c) => !!c.debuff === types().some((t) => P.is_type(c, t)));
    ok(right() && types().length >= 1 && types().length <= (bk === 'bl_poke_star' ? 1 : 3), bk + ': the jokers of its type(s) are debuffed after the draw', [types(), [...js, jk].map((c) => !!c.debuff)]);
    play(hand(['S_2']));
    ok(right(), bk + ': re-picked after a hand, debuffs follow', types());
    G.GAME.blind.disable(); flush();
    ok([...js, jk].every((c) => !c.debuff), bk + ': disabled -> every joker restored');
  }
});
sec('gray godfather', () => {
  start('B17_GODFATHER');
  const js = [add('j_poke_charmander'), add('j_poke_squirtle')];
  js[0].set_eternal(true);
  toBoss('bl_poke_gray_godfather');
  ok(G.GAME.blind.config.blind.key === 'bl_poke_gray_godfather' && P_BLINDS.bl_poke_gray_godfather.boss.showdown, 'Gray Godfather: a showdown boss');
  G.GAME.dollars = 20;
  play(hand(['S_2'])); flush();
  ok(G.GAME.dollars === 15 && js.every((c) => G.jokers.cards.includes(c)), '-$5 per hand played; not in debt: no joker lost', G.GAME.dollars);
  act({ type: 'highlight', ids: hand(['S_3']).map((c) => c.sort_id) }); act({ type: 'discard' }); flush();
  ok(G.GAME.dollars === 10, '-$5 per discard', G.GAME.dollars);
  G.GAME.dollars = 2;
  play(hand(['S_4'])); flush();
  ok(G.GAME.dollars === -3 && G.jokers.cards.includes(js[0]) && !G.jokers.cards.includes(js[1]), 'in debt after it: a random non-Eternal joker is destroyed', [G.GAME.dollars, G.jokers.cards.map(key)]);
});
sec('white executive', () => {
  start('B17_WHITE');
  add('j_poke_charmander'); add('j_poke_squirtle'); add('c_poke_fire_energy');
  const total = white_executive_total();
  toBoss('bl_poke_white_executive');
  flush();
  const deb = G.playing_cards.filter((c) => c.ability.debuff_sources && c.ability.debuff_sources.white_executive);
  ok(total > 0 && deb.length === total && deb.every((c) => c.debuff), 'White Executive: as many cards debuffed as the jokers\' + consumables\' sell value', [total, deb.length]);
  winRound(); flush();
  ok(G.playing_cards.every((c) => !(c.ability.debuff_sources || {}).white_executive), 'end of round: lifted');
});
sec('blind data', () => {
  const want = { bl_poke_mirror: [3, false, 1], bl_poke_rocket: [2, false, 2], bl_poke_star: [3, false, 24], bl_poke_gray_godfather: [8, true, 3], bl_poke_white_executive: [8, true, 4] };
  for (const [k, [min, sd, y]] of Object.entries(want)) {
    const b = P_BLINDS[k];
    ok(b && b.mod === 'pokermon' && b.boss.min === min && !!b.boss.showdown === sd && b.pos.y === y && b.atlas === 'poke_AtlasBossblinds391', k + ': 3.9.1 data', b && [b.boss, b.pos, b.atlas]);
  }
  // the view the board draws: a mod blind's chip comes from its own atlas, and its shown name is its loc name (its `name` is its key)
  start('B17_VIEW', {}, { noBlind: true });
  G.GAME.round_resets.blind_choices.Boss = 'bl_poke_mirror';
  const vb = VIEW.toView ? VIEW.toView().choices.Boss : {};
  ok(vb.atlas === 'poke_AtlasBossblinds391' && vb.label === 'The Mirror' && vb.name === 'bl_poke_mirror' && vb.pos.y === 1, 'the blind-select view: the chip atlas + cell, the shown name', vb && [vb.atlas, vb.label, vb.name]);
  const keys = Object.keys(P_BLINDS).filter((k) => k.startsWith('bl_poke_'));
  ok(keys.join() === [...BLINDS, 'bl_poke_iridescent_hacker'].join(), '3.9.1\'s order (the Hacker last)', keys);
});

// ------------------------------------------------------------------- the Elite stake
sec('elite stake', () => {
  const s = P_STAKES.stake_poke_elite;
  ok(s && s.mod === 'pokermon' && s.applied_stakes.join() === 'gold' && s.atlas === 'poke_elite_stake', 'the Elite stake is registered (above Gold, 3.9.1 art)');
  newRun({ seed: 'B17_ELITE', back: 'b_red', stake: 'stake_poke_elite', mods: ['pokermon'] });
  ok(G.GAME.stake === 8 && G.GAME.stake_key === 'stake_poke_elite' && G.GAME.win_ante === 10 && G.GAME.modifiers.poke_elite4, 'a run on it: Gold rules (level 8) + win ante 10 + poke_elite4', [G.GAME.stake, G.GAME.win_ante]);
  ok(G.GAME.modifiers.enable_rentals_in_shop && G.GAME.modifiers.scaling === 3, '... with every stake below it applied');
  const boss = (ante) => { G.GAME.round_resets.ante = ante; G.GAME.bosses_used = Object.fromEntries(Object.keys(G.GAME.bosses_used).map((k) => [k, 0])); return P_BLINDS[get_new_boss()]; };
  ok([1, 2, 6, 11].every((a) => !boss(a).boss.showdown), 'antes 1-6 (and 11): ordinary bosses');
  ok([7, 8, 9, 10, 17].every((a) => boss(a).boss.showdown), 'antes 7-10 (the last 4 before the win ante) and 17: showdown bosses');
  ok(elite_boss_eligible(true, { boss: { min: 1 } }, 3) === true && elite_boss_eligible(true, { boss: { showdown: true, min: 10 } }, 7) === true, 'the hook: min still applies to ordinary bosses, not to showdowns');
  const picker = modStakes(['pokermon']).map((x) => x.key);
  ok(picker.includes('stake_poke_elite'), 'the New Run picker lists it', picker);
  const withNacho = modStakes(['pokermon', 'nacho']).map((x) => x.key);
  // (Nacho 1.7.9, batch 18: Nacho's Elite stake is no longer registered; stake_nacho_elite_stake is an alias of this one)
  ok(withNacho.includes('stake_poke_elite') && !withNacho.includes('stake_nacho_elite_stake') && !P_STAKES.stake_nacho_elite_stake, 'with Nacho: the Pokermon Elite stake (Nacho 1.7.9 re-keyed its own to it)', withNacho);
  const sess = new Session();
  sess.start({ seed: 'B17_ELITE2', back: 'b_red', stake: 'stake_poke_elite', mods: ['pokermon'] });
  ok(sess.recipe.stake === 'stake_poke_elite', 'the recipe records the stake key (leaderboard / replays resolve it)', sess.recipe.stake);
});

// ------------------------------------------------------------------- the challenges
const chRun = (id, extra = {}) => { newRun({ seed: 'B17_' + id, mods: ['pokermon'], challenge: 'c_poke_' + id, ...extra }); flush(); };
sec('challenges', () => {
  const ids = (MODS.pokermon.challenges || []).map((c) => c.key);
  ok(ids.join() === ['nuzlocke', 'goodasgold', 'parenthood', 'littlecup', 'hammertime', 'lonesome', 'randomizer', 'delibird_delimma', 'safety_first', 'mystery_dungeon', 'imposter_syndrome', 'mean_look'].map((k) => 'c_poke_' + k).join(),
    '12 challenges, 3.9.1\'s order', ids);
  ok(findChallenge('c_poke_delibird_delimma').name === 'Delibird Dilemma' && findChallenge('c_poke_mean_look').name === 'Mean Look', 'their 3.9.1 names');
  ok(['nuzlocke', 'goodasgold', 'parenthood', 'littlecup', 'hammertime', 'lonesome'].every((k) => findChallenge('c_poke_' + k).restrictions.banned_other.some((b) => b.id === 'bl_poke_mirror')), '3.9.1 bans The Mirror from the old ones');
  // Delibird Dilemma
  chRun('delibird_delimma');
  ok(G.jokers.cards.length === 1 && key(G.jokers.cards[0]) === 'j_poke_delibird' && G.jokers.cards[0].ability.eternal && G.GAME.modifiers.no_interest
    && G.GAME.modifiers.no_extra_hand_money && G.GAME.modifiers.no_blind_reward.Boss && G.GAME.banned_keys.v_seed_money, 'Delibird Dilemma: an Eternal Delibird, no rewards / interest / hand money');
  // Safety First
  chRun('safety_first');
  ok(G.jokers.cards.map(key).join() === 'j_poke_mudkip,j_poke_roggenrola,j_poke_bronzor' && G.jokers.cards.every((c) => c.ability.eternal), 'Safety First: Eternal Mudkip, Roggenrola, Bronzor');
  ok(G.playing_cards.every((c) => key(c) === 'm_poke_hazard') && G.GAME.energy_rate === 0 && G.GAME.joker_rate === 0 && G.GAME.banned_keys.c_poke_heavyboots, 'an all-Hazard deck, no Energy and no jokers in the shop', [G.GAME.energy_rate]);
  const pk = create_card('Booster', G.pack_cards, null, null, true, false, 'p_poke_pokepack_normal_1');
  ok(P_CENTERS.p_poke_pokepack_normal_1.create_card(P_CENTERS.p_poke_pokepack_normal_1, pk, 1).ability.set === 'Item', 'a Pocket Pack\'s Energy slot holds an Item (poke_no_energy)');
  // Imposter Syndrome
  chRun('imposter_syndrome');
  ok(key(G.jokers.cards[0]) === 'j_poke_ditto', 'Imposter Syndrome: a Ditto');
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); clearHand();
  const ch = add('j_poke_charmander'), ev = add('j_poke_eevee');
  G.GAME.blind.debuff_card(ch); G.GAME.blind.debuff_card(ev);
  ok(ch.debuff && !ev.debuff && !G.jokers.cards[0].debuff, 'non-Colorless jokers are debuffed (Charmander), Colorless ones not (Eevee, Ditto)');
  advance(); advance();
  const n = G.jokers.cards.length;
  winRound(); flush();
  ok(G.jokers.cards.length === n + 1 && key(G.jokers.cards[n]) === 'j_poke_ditto', 'a beaten Boss: another Ditto');
  // Mean Look
  chRun('mean_look');
  ok(G.GAME.scry_amount === 7 && G.GAME.round_resets.discards === 4, 'Mean Look: +7 Foresight, 4 discards', [G.GAME.scry_amount, G.GAME.round_resets.discards]);
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); clearHand();
  onDeckTop('C_5'); onDeckTop('D_5');
  const bad = play(hand(['H_9', 'S_9']));
  ok(bad.events.some((e) => e.type === 'not_allowed'), 'a Pair while the Foreseen cards make a Pair: debuffed ("Must play an Unforeseen hand")');
  // Randomizer keeps working under its 3.9.1 rule id
  chRun('randomizer');
  ok(G.GAME.modifiers.poke_apply_randomizer, 'Randomizer: poke_apply_randomizer');
});
sec('mystery dungeon', () => {
  const ch = findChallenge('c_poke_mystery_dungeon');
  ok(ch && ch.daily_seed && ch.daily_seed('20102026') === 'POKE_20102026' && daily_of_seed('POKE_20102026') === '20102026', 'Mystery Dungeon: a daily challenge (date -> seed, and back)');
  const decks = mystery_dungeon_decks().map((d) => d.key);
  ok(decks.join() === ['pokemondeck', 'luminousdeck', 'telekineticdeck', 'ampeddeck', 'futuredeck', 'stadiumdeck', 'megadeck', 'vendingdeck', 'diceydeck'].map((k) => 'b_poke_' + k).join(), 'its decks: 3.9.1\'s 9 non-legacy decks, in order', decks);
  const one = (daily) => {
    const s = new Session();
    s.start({ mods: ['pokermon'], challenge: 'c_poke_mystery_dungeon', daily });
    flush();
    return { seed: s.recipe.seed, seeded: !!s.recipe.seeded, deck: G.GAME.poke_mystery_dungeon_deck_key, joker: G.jokers.cards[0] && key(G.jokers.cards[0]), eternal: G.jokers.cards[0] && G.jokers.cards[0].ability.eternal, recipe: s.recipe };
  };
  const a = one('20102026'), b = one('20102026'), c = one('21102026');
  ok(a.seed === 'POKE_20102026' && !a.seeded && a.deck && decks.includes(a.deck) && a.joker && a.eternal, 'started with today\'s date: that day\'s seed (not a player seed), a random deck, an Eternal random joker', [a.seed, a.deck, a.joker]);
  ok(a.deck === b.deck && a.joker === b.joker, 'the same day: the same run');
  ok(c.seed === 'POKE_21102026', 'another day: another seed');
  // replay: the recipe (the seed) rebuilds the same day, on any day — the engine reads no clock
  const s2 = new Session();
  s2.replay ? s2.replay(a.recipe) : null;
  newRun({ seed: a.recipe.seed, seeded: false, mods: ['pokermon'], challenge: 'c_poke_mystery_dungeon' }); flush();
  ok(G.GAME.poke_mystery_dungeon_deck_key === a.deck && key(G.jokers.cards[0]) === a.joker, 'a replay from the recipe: the same deck and joker');
  // the deck's effect applies (vending: the modifier; others: the deck's apply)
  newRun({ seed: 'X', mods: ['pokermon'], challenge: 'c_poke_mystery_dungeon', daily: '01012026' }); flush();
  const dk = G.GAME.poke_mystery_dungeon_deck_key;
  ok(dk === 'b_poke_vendingdeck' ? G.GAME.modifiers.poke_vending : true, 'the picked deck applies', dk);
  // the Vending effect through the mod (poke_vending): a Voucher Tag after an odd Ante's Boss
  start('B17_VEND');
  G.GAME.modifiers.poke_vending = true;
  toBoss('bl_wall');
  const t0 = G.GAME.tags.length;
  winRound(); flush();
  ok(G.GAME.tags.length === t0 + 1 && G.GAME.tags[t0].key === 'tag_voucher', 'poke_vending: a Voucher Tag after the Ante 1 Boss');
});

// ------------------------------------------------------------------- object_weights
sec('object weights', () => {
  newRun({ seed: 'B17_VAN', back: 'b_red' });
  ok(!feature('object_weights'), 'vanilla: object_weights off');
  start('B17_OW');
  ok(feature('object_weights'), 'a Pokermon run: object_weights on (3.9.1 optional_features)');
  const c = (k) => P_CENTERS['c_poke_' + k];
  ok(!c('greatball').hidden && c('greatball').weight === 3 && c('teraorb').weight === 5 && c('thickclub').weight === 1 && !c('thickclub').hidden && c('leek').weight === 1 && c('heavyboots').weight === 2 && !c('heavyboots').hidden,
    'the Soul items are Items with weights (Great Ball 3, Tera Orb 5, Thick Club / Leek 1, Heavy-Duty Boots 2)');
  ok(c('leftovers').hidden && c('leftovers').soul_set === 'Spectral' && c('leftovers').soul_rate === 0.003 && c('leftovers').weight === 3, 'Leftovers: still hidden in 3.9.1, so a Spectral soul card at Steamodded\'s default 0.003');
  ok(c('ultraball').soul_rate === 0.008 && c('megastone').soul_rate === 0.006, 'Ultra Ball 0.008, Mega Stone 0.006');
  const seen = new Set();
  for (let i = 0; i < 400; i++) seen.add(poll_object({ type: 'Item', seed: 'b17w' + i }));
  ok(!seen.has('c_poke_leftovers') && !seen.has('c_poke_masterball') && !seen.has('c_poke_heavyboots') && seen.has('c_poke_greatball'), 'the Item pool: no hidden card, no Boots without a Hazard layer, Great Balls', [...seen].length);
  G.GAME.poke_hazard_level = 1;
  let boots = false;
  for (let i = 0; i < 600 && !boots; i++) boots = poll_object({ type: 'Item', seed: 'b17b' + i }) === 'c_poke_heavyboots';
  ok(boots, 'with a Hazard layer: the Boots can roll');
  // Jirachi's negative_edition_rate on the Edition poll (modify_weights)
  G.GAME.negative_edition_rate = 2;
  const pool = [{ key: 'e_negative', weight: 3 }, { key: 'e_polychrome', weight: 6 }]; pool.e_negative = pool[0]; pool.e_polychrome = pool[1];
  calculate_seam({ modify_weights: true, pool, pool_types: {}, args: { type: 'Edition' } }, 'modify_weights');
  ok(pool[0].weight === 6 && pool[1].weight === 3, 'negative_edition_rate 2: Negative +3, Polychrome -3 (not below 3)', pool);
  // the Revenant Sleeve's alt: Pocket Packs weigh 0
  G.GAME.modifiers.poke_no_pocket_packs = true;
  ok(P_CENTERS.p_poke_pokepack_normal_1.get_weight(P_CENTERS.p_poke_pokepack_normal_1, 1) === 0, 'poke_no_pocket_packs: Pocket Packs weigh 0');
});

// ------------------------------------------------------------------- the sleeves' alts + the Pink Seal
sec('obituary alt / pink seal', () => {
  newRun({ seed: 'B17_OBIT', back: 'b_poke_obituarydeck', sleeve: 'sleeve_poke_obituarysleeve', mods: ['pokermon'], modOptions: { pokermon: { pokemon_legacy: true } } });
  flush();
  ok(G.GAME.modifiers.poke_pink_seal_selfdestruct && G.GAME.modifiers.poke_obituary_alt && G.playing_cards.every((c) => c.seal === 'poke_pink_seal'), 'Obituary Sleeve on the Obituary Deck: its alt (Pink Seals may fall off; Energy on sell / destroy)');
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); clearHand();
  const ch = add('j_poke_charmander');
  G.GAME.probabilities.normal = 3; // (1 in 3 -> 3 in 3)
  const [pc] = hand(['S_A']);
  pc.set_seal('poke_pink_seal', true);
  const n0 = G.consumeables.cards.length;
  play([pc]); flush();
  ok(G.consumeables.cards.length === n0 + 1 && !pc.seal, 'the Pink Seal makes an Energy, then falls off (1 in 3, made sure)', pc.seal);
  act({ type: 'sell', id: ch.sort_id }); flush();
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_fire_energy' && c.edition && c.edition.negative), 'a sold Fire joker: a Negative Fire Energy');
  newRun({ seed: 'B17_OBIT2', back: 'b_red', sleeve: 'sleeve_poke_obituarysleeve', mods: ['pokermon'], modOptions: { pokermon: { pokemon_legacy: true } } });
  flush();
  ok(!G.GAME.modifiers.poke_pink_seal_selfdestruct && G.playing_cards.every((c) => c.seal === 'poke_pink_seal'), 'on another deck: the sleeve\'s own effect only');
  newRun({ seed: 'B17_REV', back: 'b_poke_revenantdeck', sleeve: 'sleeve_poke_revenantsleeve', mods: ['pokermon'], modOptions: { pokermon: { pokemon_legacy: true } } });
  flush();
  ok(G.GAME.modifiers.poke_no_pocket_packs && G.consumeables.config.card_limit === 2 + 3, 'Revenant Sleeve on the Revenant Deck: +3 consumable slots, no Pocket Packs', G.consumeables.config.card_limit);
});

// ------------------------------------------------------------------- art
await (async () => {
  if (!ART) { console.log('(Pokermon art not on disk: the art checks are skipped)'); return; }
  const C2 = MODS.pokermon.content;
  const atl = (a) => C2.atlases[a];
  const fileOf = (a) => decodeURIComponent(atl(a).src).replace(/^.*\/assets\/2x\//, '');
  const want = {};
  const req = (a, pos, id) => { const A = atl(a), cw = (A.px || 71) * 2, chh = (A.py || 95) * 2; (want[fileOf(a)] || (want[fileOf(a)] = {}))[id] = [pos.x * cw, pos.y * chh, cw, chh]; };
  for (const n of [...NEW, 'repel']) req(C(n).atlas, C(n).pos, n);
  req('poke_AtlasJokersBasicOthers391', { x: 8, y: 1 }, 'imposter_revealed');
  for (const b of BLINDS) req(P_BLINDS[b].atlas, P_BLINDS[b].pos, b);
  req('poke_elite_stake', { x: 0, y: 0 }, 'elite_stake');
  req('poke_elite_stake_sticker', { x: 0, y: 0 }, 'elite_sticker');
  req('poke_miror_budicolo_shiny', { x: 0, y: 0 }, 'miror_shiny');
  const px = {};
  for (const [file, rects] of Object.entries(want)) { ok(fs.existsSync(path.join(ART, file)), 'art file: ' + file); if (fs.existsSync(path.join(ART, file))) Object.assign(px, await crops(path.join(ART, file), rects)); }
  const opaque = (r) => { let n = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) n++; return n / (r.px.length / 4); };
  // (a stake sticker is a small chip on a transparent card-sized cell)
  for (const id of Object.keys(px)) ok(px[id].inside && opaque(px[id]) > (id === 'elite_sticker' ? 0.02 : 0.2), 'art: ' + id + ' is a real picture', px[id].inside && opaque(px[id]).toFixed(2));
  // the composed cards differ from each other and from the card they were built on
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] !== b[i] ? 1 : 0; return s; };
  if (px.rage_candy_bar && px.repel) ok(diff(px.rage_candy_bar.px, px.repel.px) > 1000, 'the composed Rage Candy Bar and Repel are different cards');
})().catch((e) => ok(false, 'art threw: ' + String(e && e.stack).slice(0, 300)));

done();
