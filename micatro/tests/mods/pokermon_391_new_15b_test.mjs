// Pokermon new jokers, sub-batch 15b (PORTING.md "New jokers, sub-batch 15b"): the 9 jokers upstream added on its main branch AFTER
// the 3.9.1 release (InertSteak/Pokermon main @ af0b656, "3.9.1-1016a"): Lotad / Lombre / Ludicolo, Mawile, Electrike / Manectric,
// Cryogonal, Greavard / Houndstone. Every one is fired through real plays (act), and each evolution.
//   - the overlay: data391.js new_jokers (upstream: 'main') / upstream_main (the pin) / families, main's static data, text, order and
//     pools; contentRev 13 with version still '3.9.1' (pin "3.9.1 (rev 13)")
//   - each joker's main effect; Lotad -> Lombre -> Ludicolo (a real Water Stone), Electrike -> Manectric, Greavard -> Houndstone
//   - the Lotad line's beat (G.GAME.poke_beat 2 <-> 4 after every scored hand)
//   - the Megas: neither Mawile nor Manectric has one upstream yet (pokespriteload.lua sprites only, no joker)
//   - the art: every new joker's cell (and its Shiny twin) holds a real picture (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_15b_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_CENTER_POOLS, localize, get_current_pool } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['lotad', 'lombre', 'ludicolo', 'mawile', 'electrike', 'manectric', 'cryogonal', 'greavard', 'houndstone'];
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 300)); } };
const flush = () => G.E_MANAGER.flush();
/** Use an item on a joker (joker_targets), then let the queue run. */
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };
/** Into the next round's Blind (from ROUND_EVAL). */
const nextBlind = () => { act({ type: 'cash_out' }); flush(); act({ type: 'next_round' }); flush(); act({ type: 'select_blind' }); clearHand(); };
const inArea = (area, c) => area.cards.includes(c);

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 13 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 13+ (pin 3.9.1+r13+)', PINS.modPin('pokermon'));
ok(MODS.pokermon.version === '3.9.1' && PINS.pinLabel(PINS.modPin('pokermon')) === '3.9.1 (rev ' + MODS.pokermon.contentRev + ')',
  'version stays 3.9.1 (the 9 jokers from main are counted by contentRev): the pin reads "3.9.1 (rev 13)"', [MODS.pokermon.version, PINS.pinLabel(PINS.modPin('pokermon'))]);
ok(!!PINS.LEGACY_MOD_VERSIONS && PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
const UM = D391.upstream_main || {};
ok(UM.repo === 'InertSteak/Pokermon' && UM.commit === 'af0b656cb1d871d541b643b85d97d40caaf0c4b7' && UM.version === '3.9.1-1016a'
  && JSON.stringify(UM.jokers) === JSON.stringify(NEW), 'data391.js upstream_main: the pinned main commit and its 9 jokers', UM);
const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '15b'));
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW) && Object.values(NJ).every((v) => v.upstream === 'main'),
  'data391.js new_jokers (sub-batch 15b): the 9 from main, in file order, marked upstream: main', Object.keys(NJ));
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
{
  const F = STATUS.PORTED_FILES;
  const n = (f) => (F['pokemon/' + f + '.lua'] || []).length;
  const got = ['09', '10', '11', '21', '33'].map((f) => n('pokejokers_' + f));
  ok(got.join() === '31,27,24,14,7', 'defs: 31 / 27 / 24 / 14 / 7 from pokejokers_09 / 10 / 11 / 21 / 33.lua', got);
}
sec(() => {
  // Static data straight from upstream main (never retyped): rarity / cost / stage / type.
  const want = {
    lotad: [1, 4, 'Basic', 'Water'], lombre: ['poke_safari', 6, 'One', 'Water'], ludicolo: ['poke_safari', 8, 'Two', 'Water'],
    mawile: [2, 6, 'Basic', 'Metal'], electrike: [1, 5, 'Basic', 'Lightning'], manectric: ['poke_safari', 7, 'One', 'Lightning'],
    cryogonal: [3, 9, 'Basic', 'Water'], greavard: [2, 5, 'Basic', 'Psychic'], houndstone: ['poke_safari', 7, 'One', 'Psychic'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: main's rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('lombre').config.extra.item_req === 'waterstone' && C('electrike').config.evo_rqmt === 15 && C('electrike').enhancement_gate === 'm_gold'
    && C('manectric').enhancement_gate === 'm_gold' && C('cryogonal').blueprint_compat === false && C('houndstone').config.extra.limit === 2
    && C('greavard').config.extra.rounds === 5 && C('lotad').config.extra.rounds === 4, 'main configs / flags / gates',
  [C('lombre').config, C('electrike').config, C('houndstone').config]);
  ok(C('greavard').attributes.includes('deplete') && C('ludicolo').attributes.includes('energy_limit') && C('lotad').attributes.includes('economy'),
    'attributes: main\'s ones (deplete is registered)', C('greavard').attributes);
  ok(MODS.pokermon.content.attributes ? MODS.pokermon.content.attributes.some((a) => a.key === 'deplete') : true, 'the deplete attribute is registered');
});
sec(() => {
  // Their place in the joker list: main's file order. (The owner's designs, PORTING.md "The owner's 25 new jokers", sit among them
  // in Pokédex order: Tatsugiri after Houndstone; skipped here.)
  const designs = new Set((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).map((n) => 'j_poke_' + n));
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker' && !designs.has(c.key)).map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('dustox', 'lotad') && after('lotad', 'lombre') && after('lombre', 'ludicolo') && after('ludicolo', 'seedot')
    && after('sableye', 'mawile') && after('mawile', 'aron') && after('medicham', 'electrike') && after('electrike', 'manectric')
    && after('manectric', 'plusle') && after('haxorus', 'cryogonal') && after('cryogonal', 'golett') && after('wugtrio', 'greavard')
    && after('greavard', 'houndstone') && after('houndstone', 'annihilape'), 'inserted in main\'s file order');
});
sec(() => {
  // main's text (each #n# the text names filled by loc_vars); Other.depleted comes along (Relicanth's tooltip had none)
  const L = MODS.pokermon.content.loc.descriptions;
  start('LOC15B');
  for (const n of NEW) {
    const e = L.Joker['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
  ok(L.Joker.j_poke_lombre.text.some((l) => l.includes('Water Stone')) && L.Joker.j_poke_houndstone.text.some((l) => l.includes('discard selection limit')),
    'Lombre\'s Water Stone, Houndstone\'s discard limit lines');
  ok(L.Other.depleted && L.Other.depleted.name === 'Depleted', 'Other.depleted (Greavard / Houndstone / Relicanth tooltip)', L.Other.depleted);
});
sec(() => {
  // Families (main's functions/pokefamily.lua); no Mega for Mawile / Manectric yet
  const fam = (n) => JSON.stringify(poke_get_family_list(n));
  ok(fam('lombre') === '["lotad","lombre","ludicolo"]' && fam('manectric') === '["electrike","manectric"]' && fam('greavard') === '["greavard","houndstone"]',
    'families: the 3 lines', [fam('lombre'), fam('manectric'), fam('greavard')]);
  ok(poke_get_family_list('mawile').length <= 1 && poke_get_family_list('cryogonal').length <= 1, 'Mawile and Cryogonal stand alone');
  ok(C('mawile').megas === undefined && C('manectric').megas === undefined && !P_CENTERS.j_poke_mega_mawile && !P_CENTERS.j_poke_mega_manectric,
    'no Mega Mawile / Mega Manectric: upstream main has their sprites only, no joker (batch 16 / later)');
  ok(!D391.new_deferred.some(([n]) => NEW.includes(n)), 'nothing of theirs is deferred');
});
sec(() => {
  // Pools: in_pool + pool_filter; the shop's rarity pools
  start('POOL15B');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_lotad') === pool.indexOf('j_poke_dustox') + 1 && pool.includes('j_poke_houndstone'), 'the Joker pool holds them, in main\'s order');
  const avail = (r, legendary) => get_current_pool('Joker', r, legendary)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r) => avail(r).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_lotad'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_mawile', 'j_poke_greavard'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_cryogonal']), 'shop rarity pools: Common / Uncommon / Rare (Safari never; Electrike gated)', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  create_playing_card({ front: P_CARDS.S_5, center: P_CENTERS.m_gold }, G.deck);
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_lotad', 'j_poke_electrike']), 'a Gold card in the deck opens Electrike (enhancement_gate)', ofNew(0.1));
  add('j_poke_lotad');
  ok(pool_filter(C('lotad'), 'Joker') === false && pool_filter(C('ludicolo'), 'Joker') === false, 'one per family: Lotad held -> its line is out');
  start('POOL15B2', { gen_nine: false });
  ok(pool_filter(C('greavard'), 'Joker') === false && pool_filter(C('cryogonal'), 'Joker') === undefined, 'Gen 9 off -> Greavard out, Cryogonal (Gen 5) in');
});

// ------------------------------------------------------------------- Lotad / Lombre / Ludicolo (the beat)
sec(() => {
  start('LOTAD');
  const j = add('j_poke_lotad');
  ok(G.GAME.poke_beat === undefined, 'no beat yet (reads as 2)');
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_A', 'H_2']));
  flush();
  const got = G.GAME.dollars - d0;
  ok(got === 1 || got === 2, 'lotad: $1 or $2 on a 2-card hand', got);
  ok(r.events.some((e) => e.type === 'status' && e.area === 'jokers' && e.dollars === got), 'lotad: its $ pops', r.events.filter((e) => e.type === 'status'));
  ok(G.GAME.poke_beat === 4, 'the beat swaps to 4 after the hand (mod calculate, after)', G.GAME.poke_beat);
  clearHand();
  const d1 = G.GAME.dollars;
  play(hand(['S_3', 'H_4'])); flush();
  ok(G.GAME.dollars === d1 && G.GAME.poke_beat === 2, 'lotad: a 2-card hand pays nothing on the 4 beat; the beat swaps back', [G.GAME.dollars - d1, G.GAME.poke_beat]);
  clearHand();
  play(hand(['S_5'])); flush();
  ok(G.GAME.poke_beat === 4, 'the beat swaps after every scored hand, Lotad or not');
  clearHand();
  const d2 = G.GAME.dollars;
  play(hand(['S_6', 'H_7', 'D_8', 'C_10'])); flush();
  ok([1, 2].includes(G.GAME.dollars - d2), 'lotad: a 4-card hand pays on the 4 beat', G.GAME.dollars - d2);
  // Lotad -> Lombre in 4 rounds
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_lombre', 'lotad -> lombre after its rounds', key(j));
});
sec(() => {
  start('LOMBRE');
  const j = add('j_poke_lombre');
  G.GAME.poke_beat = 4;
  const d0 = G.GAME.dollars;
  play(hand(['S_6', 'H_7', 'D_8', 'C_10'])); flush();
  ok(G.GAME.dollars - d0 === 2, 'lombre: $2 when the hand matches the beat (4)', G.GAME.dollars - d0);
  // Lombre -> Ludicolo with a real Water Stone
  const stone = add('c_poke_waterstone');
  const u = useOn(stone, j);
  ok(u.ok, 'a Water Stone targets Lombre', u.error);
  winRound();
  ok(key(j) === 'j_poke_ludicolo', 'lombre -> ludicolo (Water Stone)', key(j));
});
sec(() => {
  start('LUDICOLO');
  const e0 = G.GAME.energy_plus || 0;
  const j = add('j_poke_ludicolo');
  ok(G.GAME.energy_plus === e0 + 1, 'ludicolo: +1 Energy Limit', G.GAME.energy_plus);
  const r = play(hand(['S_A', 'H_2'])); flush();
  ok(G.consumeables.cards.filter((c) => c.ability.set === 'Energy').length === 1 && statusMsgs(r.events).includes(localize('poke_plus_energy')),
    'ludicolo: an Energy card on a hand of the beat ("+1 Energy")', [G.consumeables.cards.map(key), statusMsgs(r.events)]);
  clearHand();
  play(hand(['S_3', 'H_4'])); flush();
  ok(G.consumeables.cards.length === 1, 'ludicolo: none off the beat');
  add('c_poke_waterstone');
  clearHand();
  play(hand(['S_6', 'H_7', 'D_8', 'C_10'])); flush();
  ok(G.consumeables.cards.length === 2, 'ludicolo: none without room');
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(G.GAME.energy_plus === e0, 'ludicolo sold: the Energy Limit goes', G.GAME.energy_plus);
});

// ------------------------------------------------------------------- Mawile
sec(() => {
  start('MAWILE');
  add('j_poke_mawile');
  const n0 = G.playing_cards.length;
  const [k] = hand(['S_K']);
  const r = play([k]); flush();
  const steel = G.hand.cards.filter((c) => key(c) === 'm_steel' && c.base.value === 'King' && c.base.suit === 'Spades');
  ok(steel.length === 1, 'mawile: a Steel copy of the lone first card goes to hand', G.hand.cards.map((c) => [c.base.value, key(c)]));
  ok(!G.playing_cards.includes(k) && G.playing_cards.length === n0 + 1, 'mawile: the played card is destroyed after scoring', G.playing_cards.includes(k));
  ok(k.removed || k.REMOVED || !G.discard.cards.includes(k), 'mawile: it is not in the discard pile');
  ok(r.total.chips === 5 + 10, 'the played King still scored (destroyed after scoring)', r.total);
  ok(statusMsgs(r.events).includes(localize('k_copied_ex')), 'mawile: "Copied!"', statusMsgs(r.events));
  clearHand();
  const n1 = G.playing_cards.length;
  const [q] = hand(['S_Q']);
  play([q]); flush();
  ok(G.playing_cards.includes(q) && G.playing_cards.length === n1 + 1, 'mawile: only the first hand of the round', G.playing_cards.length - n1);
});
sec(() => {
  start('MAWILE2');
  add('j_poke_mawile');
  const cards = hand(['S_K', 'H_K']);
  const n0 = G.playing_cards.length;
  play(cards); flush();
  ok(G.playing_cards.length === n0 && cards.every((c) => G.playing_cards.includes(c)), 'mawile: a 2-card first hand: no copy, nothing destroyed');
});

// ------------------------------------------------------------------- Electrike / Manectric
sec(() => {
  start('ELECTRIKE');
  const j = add('j_poke_electrike');
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_K', 'H_K'], { center: 'm_gold' })); flush();
  ok(G.GAME.dollars - d0 === 6 && j.ability.extra.scored === 2, 'electrike: $3 per scored Gold card (counted)', [G.GAME.dollars - d0, j.ability.extra.scored]);
  ok(r.events.filter((e) => e.type === 'status' && e.eval_type === 'dollars' && e.amt === 3).length === 2, 'electrike: $3 pops on each', r.events.filter((e) => e.type === 'status'));
  clearHand();
  const d1 = G.GAME.dollars;
  play(hand(['S_Q', 'H_Q'])); flush();
  ok(G.GAME.dollars === d1, 'electrike: plain cards pay nothing');
  j.ability.extra.scored = 15;
  winRound();
  ok(key(j) === 'j_poke_manectric', 'electrike -> manectric after 15 Gold cards scored', key(j));
});
sec(() => {
  start('MANECTRIC');
  add('j_poke_manectric');
  const d0 = G.GAME.dollars;
  const [a, b] = hand(['S_K', 'H_K'], { center: 'm_gold' });
  const [c] = hand(['D_K']);
  play([a, b, c]); flush();
  ok(G.GAME.dollars - d0 === 8, 'manectric: $4 per scored Gold card', G.GAME.dollars - d0);
  const first = [a, b].find((x) => inArea(G.hand, x)), other = [a, b].find((x) => !inArea(G.hand, x));
  ok(first && other && inArea(G.discard, other) && inArea(G.discard, c) && !first.poke_manectric_return,
    'manectric: the first scoring Gold card comes back to hand after scoring; the rest are discarded',
    [a, b, c].map((x) => [x.base.suit, inArea(G.hand, x) ? 'hand' : inArea(G.discard, x) ? 'discard' : '?']));
});

// ------------------------------------------------------------------- Cryogonal
sec(() => {
  start('CRYOGONAL');
  add('j_poke_cryogonal');
  const cards = hand(['S_K', 'H_K']);
  const r = play(cards); flush();
  ok(cards.every((c) => key(c) === 'm_glass'), 'cryogonal: scoring face cards become Glass', cards.map(key));
  ok(r.total.mult === 2 * 2 * 2, 'cryogonal: before scoring (they score as Glass: X2 each)', r.total);
  ok(statusMsgs(r.events).includes(localize('Gem_glass')), 'cryogonal: its (unlocalized upstream) message', statusMsgs(r.events));
  clearHand();
  const plain = hand(['S_9', 'H_9']);
  play(plain); flush();
  ok(plain.every((c) => key(c) === 'c_base'), 'cryogonal: not other cards');
  clearHand();
  const hc = hand(['S_A', 'H_J']);
  play(hc); flush();
  ok(key(hc[1]) === 'c_base', 'cryogonal: only scoring cards (an unscored Jack stays)', hc.map(key));
});

// ------------------------------------------------------------------- Greavard / Houndstone
/** Take every card of these ranks out of the deck (played ones of the rank are then depleted). */
const deplete = (...values) => { G.deck.cards = G.deck.cards.filter((c) => !values.includes(c.base.value)); };
sec(() => {
  start('GREAVARD');
  const j = add('j_poke_greavard');
  const r0 = play(hand(['S_A']));
  ok(r0.total.chips === 5 + 11, 'greavard: an Ace with Aces left in the deck scores once', r0.total);
  clearHand();
  deplete('Ace');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 2, 'greavard: a depleted rank is retriggered', r.total);
  clearHand();
  const r2 = play(hand(['S_2'], { center: 'm_stone' }));
  ok(r2.total.chips === 5 + 50 * 2, 'greavard: a card with no rank (Stone) is retriggered', r2.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_houndstone', 'greavard -> houndstone after its rounds', key(j));
});
sec(() => {
  start('HOUNDSTONE');
  const lim0 = G.GAME.starting_params.discard_limit ?? 5;
  const j = add('j_poke_houndstone');
  ok(G.GAME.starting_params.discard_limit === lim0 + 2, 'houndstone: +2 discard selection limit', G.GAME.starting_params.discard_limit);
  const seven = hand(['S_2', 'S_3', 'S_4', 'S_5', 'S_6', 'S_7', 'S_8']);
  act({ type: 'highlight', ids: seven.map((c) => c.sort_id) });
  const d = act({ type: 'discard' });
  ok(d.ok, 'houndstone: a 7-card discard is allowed', d.error);
  clearHand();
  deplete('King');
  const r = play(hand(['S_K']));
  ok(r.total.chips === 5 + 10 * 2, 'houndstone: a depleted rank is retriggered', r.total);
  act({ type: 'sell', id: j.sort_id }); flush();
  ok(G.GAME.starting_params.discard_limit === lim0, 'houndstone sold: the limit goes back', G.GAME.starting_params.discard_limit);
});

// ------------------------------------------------------------------- the art
if (!ART) console.log('(Pokermon art not on disk: the sprite checks are skipped; set MICATRO_MAIN)');
else if (!NEW.every(C)) ok(false, 'art: the new jokers are not registered');
else {
  const ATL = MODS.pokermon.content.atlases;
  const want = {};
  const cell = (atlas, pos, id, w = 142, h = 190) => {
    const A = ATL[atlas];
    const file = decodeURIComponent(A.src).replace(/^.*\/assets\/2x\//, '');
    (want[file] || (want[file] = {}))[id] = [pos.x * w, pos.y * h, w, h];
  };
  for (const n of NEW) {
    const c = C(n);
    cell(c.atlas, c.pos, n + '|' + c.atlas);
    cell(c.atlas.replace(/391$/, 'Shiny391'), c.pos, n + '|' + c.atlas.replace(/391$/, 'Shiny391'));
  }
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  for (const n of NEW) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(c.atlas === 'poke_AtlasJokersBasicNatdex391' && base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0,
      `${n}: a real upstream sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [c.atlas, opaque(base), opaque(shiny), diff]);
  }
  ok(new Set(NEW.map((n) => hash(px[n + '|' + C(n).atlas]))).size === NEW.length, 'every one is its own picture');
}

done();
