// Pokermon 3.9.1 new jokers, sub-batch 14 (PORTING.md "New jokers, sub-batch 14"): the 14 jokers 3.9.1 added to
// pokejokers_13-16.lua (Clamperl / Huntail / Gorebyss, Relicanth, Bagon / Shelgon / Salamence, Deoxys, Budew, Roserade,
// Chingling, Bronzor / Bronzong, Gallade), every one fired through real plays (act), and each evolution.
//   - the overlay: data391.js new_jokers / families, new_deferred empty, the 3.9.1 static data, text, order and pools; contentRev 11
//   - each joker's main effect; Clamperl -> Gorebyss (a Link Cable) / Huntail (a Link Cable sold), Bagon -> Shelgon -> Salamence,
//     Budew -> Roselia, Chingling -> Chimecho, Bronzor -> Bronzong
//   - the deferred evolutions, now on, with the real items: Kirlia -> Gallade (a Dawn Stone), Roselia -> Roserade (a Shiny Stone);
//     the Ralts line's highest evolution with Nacho's line in the family
//   - the Flower card's Roserade rule (3 suits are enough), the DNA Seal, the Meteorite (Deoxys's formes), Bronzor's card of the
//     round, Jirachi's Copy / Negging forms (and the Wish Pack, which offers neither, as 3.9.1)
//   - the art: every new joker's 3.9.1 cell (and its Shiny twin) holds a real picture; Deoxys's forme souls, the Meteorite, the
//     DNA Seal (needs the gitignored art: MICATRO_MAIN)
//   node micatro/tests/mods/pokermon_391_new_14_test.mjs
import path from 'path';
import { T, start, hand, add, play, winRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS, P_CENTER_POOLS, P_SEALS, localize, get_current_pool, Card } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { STATUS } from '../../mods/pokermon/index.js';
import D391 from '../../mods/pokermon/data391.js';
import { poke_get_family_list, get_family_keys, get_highest_evo } from '../../mods/pokermon/systems/evolution.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { view_card } from '../../mods/pokermon/systems/anim.js';
import { POKE_UI } from '../../mods/pokermon/ui.js';
import { ART, crops } from './poke_art_helpers.mjs';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const C = (n) => P_CENTERS['j_poke_' + n];
const NEW = ['clamperl', 'huntail', 'gorebyss', 'relicanth', 'bagon', 'shelgon', 'salamence', 'deoxys', 'budew', 'roserade', 'chingling',
  'bronzor', 'bronzong', 'gallade'];
/** A card on top of the deck (the next one drawn). */
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};
/** A section: an error (e.g. on a build without these jokers) is one failure, not the end of the suite. */
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 300)); } };
/** Discard these hand cards (the hand refills from the top of the deck). */
const discard = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); return act({ type: 'discard' }); };
const flush = () => G.E_MANAGER.flush();
const close = (a, b) => Math.abs(a - b) < 1e-9;
/** Win the round and go to the shop. */
const toShop = () => { winRound(); act({ type: 'cash_out' }); flush(); };
/** From the shop to the next Blind, selected (a pack a Tag opens on the way is skipped: Clamperl's Ethereal Tag). */
const nextBlind = () => { act({ type: 'next_round' }); flush(); while (G.pack_cards && G.pack_cards.cards.length && [STATES.SPECTRAL_PACK, STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND].includes(G.STATE)) { act({ type: 'skip_booster' }); flush(); } act({ type: 'select_blind' }); clearHand(); };
/** Use an item on a joker (joker_targets), then let the queue run. */
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };

// ------------------------------------------------------------------- the overlay
ok(MODS.pokermon.contentRev >= 11 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 11+ (pin 3.9.1+r11+)', PINS.modPin('pokermon'));
const NJ = Object.fromEntries(Object.entries(D391.new_jokers || {}).filter(([, v]) => v.sub_batch === '14'));
ok(JSON.stringify(Object.keys(NJ)) === JSON.stringify(NEW), 'data391.js new_jokers (sub-batch 14): the 14 of 3.9.1 pokejokers_13-16, in file order', Object.keys(NJ));
ok(NEW.every((n) => C(n) && !C(n).unported && STATUS.PORTED.jokers.includes('j_poke_' + n)), 'every new joker is registered and ported');
{
  const F = STATUS.PORTED_FILES;
  const n = (f) => (F['pokemon/' + f + '.lua'] || []).length;
  ok(n('pokejokers_13') === 22 && n('pokejokers_14') === 8 && n('pokejokers_15') === 15 && n('pokejokers_16') === 25, 'defs: 22 / 8 / 15 / 25 from pokejokers_13 / 14 / 15 / 16.lua', [n('pokejokers_13'), n('pokejokers_14'), n('pokejokers_15'), n('pokejokers_16')]);
}
sec(() => {
  // Static data straight from 3.9.1 (never retyped): rarity / cost / stage / type.
  const want = {
    clamperl: [3, 6, 'Basic', 'Water'], huntail: ['poke_safari', 8, 'One', 'Water'], gorebyss: ['poke_safari', 8, 'One', 'Water'],
    relicanth: [3, 6, 'Basic', 'Earth'], bagon: [2, 6, 'Basic', 'Dragon'], shelgon: ['poke_safari', 8, 'One', 'Dragon'],
    salamence: ['poke_safari', 10, 'Two', 'Dragon'], deoxys: [4, 20, 'Legendary', 'Psychic'], budew: [1, 3, 'Baby', 'Grass'],
    roserade: ['poke_safari', 9, 'One', 'Grass'], chingling: [3, 3, 'Baby', 'Psychic'], bronzor: [3, 6, 'Basic', 'Metal'],
    bronzong: ['poke_safari', 8, 'One', 'Metal'], gallade: ['poke_safari', 10, 'Two', 'Fighting'],
  };
  for (const [n, [rarity, cost, stage, ptype]] of Object.entries(want)) {
    const c = C(n);
    ok(c.rarity === rarity && c.cost === cost && c.stage === stage && c.ptype === ptype, `${n}: 3.9.1 rarity / cost / stage / type`, [c.rarity, c.cost, c.stage, c.ptype]);
  }
  ok(C('clamperl').config.extra.item_req === 'linkcable' && C('bagon').pseudol === true && C('relicanth').perishable_compat === false
    && C('bagon').config.evo_rqmt === 5 && C('bronzor').config.evo_rqmt === 10 && C('deoxys').config.extra.form === 4, '3.9.1 configs / flags',
  [C('clamperl').config, C('bagon').config, C('deoxys').config]);
  ok(C('relicanth').attributes.includes('ancient') && C('budew').attributes.includes('baby'), 'attributes: 3.9.1 ones', C('relicanth').attributes);
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  ok(['j_poke_deoxys_attack', 'j_poke_deoxys_defense', 'j_poke_deoxys_speed'].every((k) => JL[k] && JL[k].name.startsWith('Deoxys (')), 'Deoxys forme texts (3.9.1)');
});
sec(() => {
  // Their place in the joker list: 3.9.1's file order.
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  const after = (a, b) => keys.indexOf('j_poke_' + b) === keys.indexOf('j_poke_' + a) + 1;
  ok(after('glalie', 'clamperl') && after('clamperl', 'huntail') && after('gorebyss', 'relicanth') && after('relicanth', 'luvdisc') && after('luvdisc', 'bagon')
    && after('salamence', 'beldum') && after('jirachi_fixer', 'deoxys') && after('kricketune', 'budew') && after('roserade', 'buizel')
    && after('honchkrow', 'chingling') && after('bronzong', 'bonsly') && after('porygonz', 'gallade') && after('gallade', 'probopass'), 'inserted in 3.9.1 file order');
});
sec(() => {
  // The 3.9.1 text (each #n# the text names filled by loc_vars)
  const JL = MODS.pokermon.content.loc.descriptions.Joker;
  start('LOC14');
  for (const n of NEW) {
    const e = JL['j_poke_' + n];
    const card = add('j_poke_' + n);
    const lv = C(n).loc_vars(C(n), [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((m) => +m.slice(1, -1)))];
    ok(e && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }), `${n}: text + loc_vars fill #${used.join('#, #')}#`, lv.vars);
  }
});
sec(() => {
  // Families (3.9.1 functions/pokefamily.lua): the deferred lines are whole now
  const fam = (n) => JSON.stringify(poke_get_family_list(n));
  ok(fam('clamperl') === '["clamperl","huntail","gorebyss"]' && fam('salamence') === '["bagon","shelgon","salamence"]'
    && fam('bronzong') === '["bronzor","bronzong"]', 'families: Clamperl, Bagon, Bronzor lines');
  ok(fam('roselia') === '["budew","roselia","roserade"]' && fam('chimecho') === '["chingling","chimecho"]', 'families: Budew / Roselia / Roserade, Chingling / Chimecho');
  ok(fam('kirlia') === '["ralts","kirlia","gardevoir","gallade"]' && get_family_keys('kirlia').includes('j_poke_gallade'), 'family: the Ralts line with Gallade', poke_get_family_list('kirlia'));
  const dk = get_family_keys('deoxys');
  ok(dk.length === 4 && dk.every((k) => k.key === 'j_poke_deoxys') && dk.map((k) => k.form).join() === '4,1,2,3', 'family: Deoxys and its 3 formes (forms)', dk);
  // the deferrals are gone: Kirlia and Roselia have their stones back
  ok(D391.new_deferred.length === 0, 'data391.js new_deferred is empty', D391.new_deferred);
  ok(C('kirlia').config.extra.item_req === 'dawnstone' && C('roselia').config.extra.item_req === 'shinystone', 'Kirlia: Dawn Stone, Roselia: Shiny Stone (item_req)');
  ok(JL0().j_poke_kirlia.text.some((l) => l.includes('Dawn Stone')) && JL0().j_poke_roselia.text.some((l) => l.includes('Shiny Stone')), 'and their stone lines in the text');
});
function JL0() { return MODS.pokermon.content.loc.descriptions.Joker; }
sec(() => {
  // Pools: in_pool + pool_filter; the shop's rarity pools
  start('POOL14');
  const pool = P_CENTER_POOLS.Joker.map((c) => c.key);
  ok(pool.indexOf('j_poke_clamperl') === pool.indexOf('j_poke_glalie') + 1 && pool.includes('j_poke_gallade'), 'the Joker pool holds them, in 3.9.1 order');
  const avail = (r, legendary) => get_current_pool('Joker', r, legendary)[0].filter((k) => k !== 'UNAVAILABLE');
  const ofNew = (r, legendary) => avail(r, legendary).filter((k) => NEW.includes(k.replace('j_poke_', '')));
  ok(JSON.stringify(ofNew(0.1)) === JSON.stringify(['j_poke_budew'])
    && JSON.stringify(ofNew(0.8)) === JSON.stringify(['j_poke_bagon'])
    && JSON.stringify(ofNew(0.99)) === JSON.stringify(['j_poke_clamperl', 'j_poke_relicanth', 'j_poke_chingling', 'j_poke_bronzor']), 'shop rarity pools: Common / Uncommon / Rare (Safari never)', [ofNew(0.1), ofNew(0.8), ofNew(0.99)]);
  ok(JSON.stringify(ofNew(null, true)) === JSON.stringify(['j_poke_deoxys']), 'Deoxys: in the Legendary pool (The Soul)', ofNew(null, true));
  add('j_poke_bagon');
  ok(pool_filter(C('bagon'), 'Joker') === false && pool_filter(C('salamence'), 'Joker') === false, 'one per family: Bagon held -> its line is out');
  ok(pool_filter(C('budew'), 'Joker') === undefined, 'Budew (Gen 4) can be rolled');
  start('POOL14B', { gen_three: false });
  ok(pool_filter(C('clamperl'), 'Joker') === false && pool_filter(C('budew'), 'Joker') === undefined, 'Gen 3 off -> Clamperl out, Budew (Gen 4) in');
});

// ------------------------------------------------------------------- Clamperl / Huntail / Gorebyss
sec(() => {
  start('CLAMPERL', {}, { noBlind: true });
  const tags0 = G.GAME.tags.length;
  const j = add('j_poke_clamperl');
  ok(G.GAME.tags.length === tags0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_ethereal', 'clamperl: comes with an Ethereal Tag', G.GAME.tags.map((t) => t.key));
  act({ type: 'select_blind' });
  clearHand();
  toShop();
  const hs = G.hand.config.card_limit;
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS.p_arcana_normal_1);
  G.shop_booster.emplace(b);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: b.sort_id });
  flush();
  ok(G.hand.config.card_limit === hs + 4, 'clamperl: +4 hand size while a pack is open', [hs, G.hand.config.card_limit]);
  act({ type: 'skip_booster' });
  flush();
  // (the pack's end lets the Ethereal Tag open its Spectral pack: +4 again while that one is open)
  ok(G.STATE === STATES.SPECTRAL_PACK && G.hand.config.card_limit === hs + 4, 'clamperl: the Ethereal Tag\'s Spectral pack opens next (+4 again)', [G.STATE, G.hand.config.card_limit]);
  act({ type: 'skip_booster' });
  flush();
  ok(G.STATE === STATES.SHOP && G.hand.config.card_limit === hs, 'clamperl: back when the pack closes', G.hand.config.card_limit);
  // Link Cable used on it -> Gorebyss
  const cable = add('c_poke_linkcable');
  const u = useOn(cable, j);
  ok(u.ok, 'a Link Cable can be used on Clamperl', u.error);
  nextBlind();
  winRound();
  ok(key(j) === 'j_poke_gorebyss', 'clamperl -> gorebyss with a Link Cable', key(j));
});
sec(() => {
  start('CLAMPERL2');
  const j = add('j_poke_clamperl');
  toShop();
  const cable = add('c_poke_linkcable');
  act({ type: 'sell', id: cable.sort_id });
  flush();
  ok(j.ability.extra.link_sold === 1, 'clamperl: counts Link Cables sold', j.ability.extra);
  nextBlind();
  winRound();
  ok(key(j) === 'j_poke_huntail', 'clamperl -> huntail after selling a Link Cable', key(j));
});
/** Open an Arcana pack in the shop (hand cards dealt). */
const openArcana = () => {
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS.p_arcana_normal_1);
  G.shop_booster.emplace(b);
  G.GAME.dollars = 100;
  act({ type: 'buy', id: b.sort_id });
  flush();
};
sec(() => {
  start('HUNTAIL');
  const j = add('j_poke_huntail');
  toShop();
  const t = add('c_fool');
  act({ type: 'sell', id: t.sort_id });
  flush();
  ok(j.ability.extra.Xmult === 1, 'huntail: a Tarot sold outside a pack does nothing', j.ability.extra.Xmult);
  openArcana();
  const held = G.hand.cards.length;
  const t2 = add('c_fool');
  act({ type: 'sell', id: t2.sort_id });
  flush();
  ok(close(j.ability.extra.Xmult, 1.1) && G.hand.cards.length === held - 1, 'huntail: a Tarot sold in a pack: +X0.1 and a random held card destroyed', [j.ability.extra.Xmult, held, G.hand.cards.length]);
  const it = add('c_poke_linkcable');
  act({ type: 'sell', id: it.sort_id });
  flush();
  ok(close(j.ability.extra.Xmult, 1.2), 'huntail: an Item too', j.ability.extra.Xmult);
  act({ type: 'skip_booster' });
  nextBlind();
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.2), 'huntail: X1.2 Mult', r.total);
});
sec(() => {
  start('GOREBYSS');
  const j = add('j_poke_gorebyss');
  toShop();
  const hs = G.hand.config.card_limit;
  openArcana();
  ok(G.hand.config.card_limit === hs + 4, 'gorebyss: +4 hand size in a pack');
  const t = add('c_strength');
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  const u = act({ type: 'use', id: t.sort_id });
  flush();
  ok(u.ok && close(j.ability.extra.Xmult, 1.15), 'gorebyss: a Tarot used in a pack: +X0.15', [u.error, j.ability.extra.Xmult]);
  act({ type: 'skip_booster' });
  nextBlind();
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.15), 'gorebyss: X1.15 Mult', r.total);
});

// ------------------------------------------------------------------- Relicanth
sec(() => {
  start('RELICANTH');
  add('j_poke_relicanth');
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_4', 'H_4', 'S_K']));
  flush();
  // Pair of 4s (scoring: the two 4s): 10 + 4 + 4 + 40 (the rightmost scoring card)
  ok(r.total.chips === 58 && G.GAME.dollars - d0 === 4, 'relicanth: 2 Ancient 4s: the rightmost scoring card +40 Chips and $4', [r.total, G.GAME.dollars - d0]);
  clearHand();
  const bottom = G.deck.cards.find((c) => c.get_id() !== 4);
  play(hand(['S_4', 'H_4', 'D_4']));
  ok(key(bottom) === 'm_stone', 'relicanth: 3 Ancient 4s: the bottom deck card that isn\'t a 4 becomes Stone', key(bottom));
  clearHand();
  // 4 Ancient 4s: X(1 + 0.75 per depleted rank) — deplete the Kings
  for (const c of G.deck.cards.filter((v) => v.get_id() === 13)) { G.deck.remove_card(c); G.discard.emplace(c); }
  const r4 = play(hand(['S_4', 'H_4', 'D_4', 'C_4']));
  // Four of a Kind: 60 + 4 x 4 + 40 Chips, 7 Mult X1.75
  ok(close(r4.total.mult, 7 * 1.75), 'relicanth: 4 Ancient 4s: X1.75 with 1 depleted rank (Kings)', r4.total);
});

// ------------------------------------------------------------------- Bagon / Shelgon / Salamence
sec(() => {
  start('BAGON');
  const hs = G.hand.config.card_limit;
  const j = add('j_poke_bagon');
  ok(G.hand.config.card_limit === hs - 1, 'bagon: -1 hand size');
  G.GAME.hands.Straight.played = 4;
  const r = play(hand(['S_2', 'H_3', 'S_4', 'D_5', 'C_6']));
  // the Straight played makes 5: +15 Mult
  ok(r.total.mult === 4 + 15 && j.ability.extra.triggers === 1, 'bagon: +3 Mult per Straight played (5)', [r.total, j.ability.extra]);
  j.ability.extra.triggers = 4;
  clearHand();
  play(hand(['S_2', 'H_3', 'S_4', 'D_5', 'C_6']));
  winRound();
  ok(key(j) === 'j_poke_shelgon' && G.hand.config.card_limit === hs - 2, 'bagon -> shelgon after 5 scored Straights (-2 hand size)', [key(j), G.hand.config.card_limit]);
});
sec(() => {
  start('SHELGON');
  const j = add('j_poke_shelgon');
  const r0 = j.ability.extra.rounds;
  play(hand(['S_2', 'H_3', 'S_4', 'D_5', 'C_6']));
  ok(j.ability.extra.rounds === r0 - 1, 'shelgon: a scored Straight counts a round off', [r0, j.ability.extra.rounds]);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_salamence', 'shelgon -> salamence', key(j));
});
sec(() => {
  start('SALAMENCE', {}, { noBlind: true });
  add('j_poke_salamence');
  G.GAME.hands.Straight.played = 10;
  const hs = G.hand.config.card_limit;
  act({ type: 'select_blind' });
  flush();
  ok(G.hand.config.card_limit === hs + 2, 'salamence: +1 hand size this round per 5 Straights played (10: +2)', [hs, G.hand.config.card_limit]);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 50, 'salamence: +5 Mult per Straight played', r.total);
  winRound();
  act({ type: 'cash_out' });
  ok(G.hand.config.card_limit === hs, 'salamence: the hand size is for the round only', G.hand.config.card_limit);
});

// ------------------------------------------------------------------- Budew / Roserade / the Flower card
sec(() => {
  start('BUDEW');
  const j = add('j_poke_budew');
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 0.75), 'budew: X0.75 Mult (a lone Baby)', r.total);
  winRound();
  flush();
  const seed = G.consumeables.cards.find((c) => key(c) === 'c_poke_miracleseed');
  ok(seed && seed.edition && seed.edition.negative, 'budew: a Negative Miracle Seed at end of round', G.consumeables.cards.map(key));
  act({ type: 'cash_out' }); nextBlind();
  winRound();
  ok(key(j) === 'j_poke_roselia', 'budew -> roselia in 2 rounds', key(j));
});
sec(() => {
  // Roselia -> Roserade with a real Shiny Stone (deferred in sub-batch 12)
  start('ROSELIA14');
  const j = add('j_poke_roselia');
  const stone = add('c_poke_shinystone');
  const u = useOn(stone, j);
  ok(u.ok && (j.ability.extra.evolve === true || key(j) === 'j_poke_roserade'), 'a Shiny Stone targets Roselia', [u.error, key(j), j.ability.extra.evolve]);
  winRound();
  ok(key(j) === 'j_poke_roserade', 'roselia -> roserade with a Shiny Stone', key(j));
});
sec(() => {
  start('ROSERADE');
  add('j_poke_roserade');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 3, 'roserade: an Odd first scoring card is retriggered twice', r.total);
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(r2.total.chips === 5 + 11 * 3, 'roserade: every hand (not only the round\'s first)', r2.total);
  clearHand();
  const r3 = play(hand(['S_K']));
  ok(r3.total.chips === 15, 'roserade: an Even one is not', r3.total);
});
sec(() => {
  // The Flower card (batch 10): X2 when the scoring hand has 4 suits — 3 with Roserade. Kings: Roserade retriggers no Odd card.
  const three = () => hand(['S_K', 'H_K', 'D_K']).map((c, i) => { if (i === 0) c.set_ability(P_CENTERS.m_poke_flower, null, true); return c; });
  start('FLOWER0');
  const r0 = play(three());
  start('FLOWER1');
  add('j_poke_roserade');
  const r1 = play(three());
  ok(r0.total.mult === 3 && r1.total.mult === 6, 'flower: 3 suits score X2 only with Roserade (Three of a Kind: 3 -> 6 Mult)', [r0.total, r1.total]);
});

// ------------------------------------------------------------------- Chingling, Bronzor / Bronzong
sec(() => {
  start('CHINGLING');
  const j = add('j_poke_chingling');
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 0.75), 'chingling: X0.75 Mult (a lone Baby)', r.total);
  winRound();
  flush();
  const just = G.consumeables.cards.find((c) => key(c) === 'c_justice');
  ok(just && just.edition && just.edition.negative, 'chingling: a Negative Justice at end of round', G.consumeables.cards.map(key));
  act({ type: 'cash_out' }); nextBlind();
  winRound();
  ok(key(j) === 'j_poke_chimecho', 'chingling -> chimecho in 2 rounds', key(j));
});
sec(() => {
  start('BRONZOR');
  const cr = G.GAME.current_round;
  ok(typeof cr.bronzo_rank === 'string' && typeof cr.bronzo_suit === 'string' && cr.bronzo_id >= 2, 'the round\'s Bronzor card is set (reset_bronzo_card)', [cr.bronzo_rank, cr.bronzo_suit, cr.bronzo_id]);
  cr.bronzo_rank = 'Ace'; cr.bronzo_id = 14; cr.bronzo_suit = 'Hearts';
  const j = add('j_poke_bronzor');
  const r = play(hand(['H_K', 'S_K']));
  // Pair: 10 + 20 Chips, 2 Mult X1.3 (the Heart)
  ok(close(r.total.mult, 2 * 1.3), 'bronzor: X1.3 per scored card of the round\'s suit', r.total);
  clearHand();
  play(hand(['S_A', 'C_A']));
  ok(j.ability.extra.scored === 2, 'bronzor: counts scored cards of the round\'s rank', j.ability.extra);
  j.ability.extra.scored = 10;
  winRound();
  ok(key(j) === 'j_poke_bronzong', 'bronzor -> bronzong after 10', key(j));
  const lv = C('bronzor').loc_vars(C('bronzor'), [], j);
  ok(lv.vars[1] === localize('Ace', 'ranks') && lv.colours[0] === 'SUITS.Hearts', 'bronzor: its text names the round\'s card (suit colour)', lv);
});
sec(() => {
  start('BRONZONG');
  const cr = G.GAME.current_round;
  cr.bronzo_rank = 'Ace'; cr.bronzo_id = 14; cr.bronzo_suit = 'Hearts';
  add('j_poke_bronzong');
  const r = play(hand(['S_A', 'C_A']));
  // Pair of Aces, each retriggered once: 10 + 11 x 4 Chips
  ok(r.total.chips === 10 + 44 && r.total.mult === 2, 'bronzong: scored cards of the round\'s rank retrigger once', r.total);
  clearHand();
  const r2 = play(hand(['H_K', 'D_K']));
  ok(close(r2.total.mult, 2 * 1.3), 'bronzong: X1.3 per scored card of the round\'s suit', r2.total);
});
sec(() => {
  // the round's card follows the deck (seed 'bronzo' .. ante) and is redrawn each round
  start('BRONZO2');
  const a = JSON.stringify([G.GAME.current_round.bronzo_rank, G.GAME.current_round.bronzo_suit]);
  start('BRONZO2');
  const b = JSON.stringify([G.GAME.current_round.bronzo_rank, G.GAME.current_round.bronzo_suit]);
  ok(a === b, 'the Bronzor card is seeded', [a, b]);
});

// ------------------------------------------------------------------- Kirlia -> Gallade, Gallade
sec(() => {
  start('KIRLIA14');
  const j = add('j_poke_kirlia');
  const stone = add('c_poke_dawnstone');
  const u = useOn(stone, j);
  ok(u.ok && (j.ability.extra.evolve === true || key(j) === 'j_poke_gallade'), 'a Dawn Stone targets Kirlia', [u.error, key(j), j.ability.extra.evolve]);
  winRound();
  flush();
  ok(key(j) === 'j_poke_gallade', 'kirlia -> gallade with a Dawn Stone', key(j));
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_double_rainbow_energy'), 'gallade (evolved): holding a Double Rainbow Energy', G.consumeables.cards.map(key));
});
sec(() => {
  start('GALLADE');
  const g = add('j_poke_gallade');
  ok(G.consumeables.cards.some((c) => key(c) === 'c_poke_double_rainbow_energy'), 'gallade: comes holding a Double Rainbow Energy');
  const b = add('j_poke_bulbasaur');
  b.ability.extra.energy_count = 2;
  const s = add('j_poke_squirtle');
  s.ability.extra.energy_count = 1;
  const r = play(hand(['S_A']));
  ok(close(r.total.mult, 1.5), 'gallade: X(1 + 0.5 per Joker with 2+ Energy) (1)', r.total);
  g.ability.extra.energy_count = 2;
  clearHand();
  const r2 = play(hand(['S_A']));
  ok(close(r2.total.mult, 2), 'gallade: counts itself', r2.total);
});

// ------------------------------------------------------------------- Deoxys, the DNA Seal, the Meteorite
sec(() => {
  start('DEOXYS');
  const dx = add('j_poke_deoxys');
  ok(!!P_SEALS.poke_dna_seal, 'the DNA Seal is registered (3.9.1 seals1.lua)');
  const [a, k] = hand(['S_A', 'H_K']);
  discard([k]);
  flush();
  ok(k.seal === 'poke_dna_seal', 'deoxys: a 1-card first discard gets a DNA Seal', k.seal);
  const [q] = hand(['D_Q']);
  discard([q]);
  flush();
  ok(!q.seal, 'deoxys: only the first discard', q.seal);
  // the DNA Seal: a 1-card hand makes a Sealless copy in hand
  clearHand();
  G.discard.remove_card(k);
  G.hand.emplace(k);
  const n0 = G.playing_cards.length;
  const r = play([k]);
  flush();
  const copy = G.hand.cards.find((c) => c !== k && c.get_id() === 13 && c.base.suit === 'Hearts');
  ok(G.playing_cards.length === n0 + 1 && copy && !copy.seal && statusMsgs(r.events).includes(localize('k_copied_ex')), 'DNA Seal: a 1-card hand -> a Sealless copy in hand ("Copied!")', [n0, G.playing_cards.length, copy && copy.seal]);
  ok(copy && !copy.ability.perma_x_mult && !copy.ability.perma_h_dollars, 'Normal forme: no extra on the copy');
  void a; void dx;
});
sec(() => {
  // the Meteorite: forme cycles on reroll, use -> Deoxys's forme; a deck card destroyed; usable again next round
  start('METEOR');
  const dx = add('j_poke_deoxys');
  const m = add('c_poke_meteorite');
  ok(P_CENTERS.c_poke_meteorite.in_pool(P_CENTERS.c_poke_meteorite) === true && P_CENTERS.c_poke_meteorite.soul_set === 'Planet' && P_CENTERS.c_poke_meteorite.soul_rate === 0.2, 'meteorite: a hidden Planet soul card (0.2) while you have Deoxys');
  toShop();
  G.GAME.dollars = 100;
  const rr = act({ type: 'reroll_shop' });
  flush();
  ok(m.ability.extra.forme === 'Attack' && statusMsgs(rr.events).includes('Attack'), 'meteorite: the forme changes on a reroll (Normal -> Attack)', [m.ability.extra.forme, statusMsgs(rr.events)]);
  const deck0 = G.deck.cards.length;
  const u = act({ type: 'use', id: m.sort_id });
  flush();
  ok(u.ok && dx.ability.extra.form === 1 && G.consumeables.cards.includes(m), 'meteorite: Deoxys -> Attack Forme; the Meteorite stays (reusable)', [u.error, dx.ability.extra.form]);
  ok(G.deck.cards.filter((c) => !c.destroyed).length === deck0 - 1 || G.deck.cards.length === deck0 - 1, 'meteorite: destroys 1 random card left in the deck', [deck0, G.deck.cards.length]);
  ok(m.ability.extra.usable === false && !P_CENTERS.c_poke_meteorite.can_use(P_CENTERS.c_poke_meteorite, m), 'meteorite: once per round');
  const lv = C('deoxys').loc_vars(C('deoxys'), [], dx);
  ok(lv.key === 'j_poke_deoxys_attack', 'deoxys: its text is the Attack forme\'s', lv.key);
  const v = {};
  view_card(dx, v);
  const face = POKE_UI.face({ center: 'j_poke_deoxys', facing: 'front', poke: v.poke, atlas: dx.config.center.atlas, pos: dx.config.center.pos }, { area: 'jokers' });
  ok(face && face.soul_pos.x === 5 && face.soul_pos.y === 3, 'deoxys: the Attack forme floats over its card ({5,3})', face && face.soul_pos);
  nextBlind();
  const w = winRound();
  ok(m.ability.extra.usable === true && statusMsgs(w.events).includes(localize('k_reset')), 'meteorite: usable again after the round', m.ability.extra);
});
/** A Deoxys in `form` plays a DNA-sealed King alone: -> the copy. */
const dnaCopy = (seed, form) => {
  start(seed);
  const dx = add('j_poke_deoxys');
  dx.ability.extra.form = form;
  const [k] = hand(['H_K']);
  k.set_seal('poke_dna_seal', true);
  play([k]);
  flush();
  return G.hand.cards.find((c) => c !== k && c.get_id() === 13 && c.base.suit === 'Hearts');
};
sec(() => {
  const atk = dnaCopy('DNA1', 1);
  ok(atk && close(atk.ability.perma_x_mult, 0.25), 'Attack forme: the copy gets +X0.25 Mult (permanent)', atk && atk.ability.perma_x_mult);
  clearHand();
  G.hand.emplace(atk);
  const r = play([atk]);
  ok(close(r.total.mult, 1 * 1.25), 'the copy scores X1.25', r.total);
  const spd = dnaCopy('DNA3', 3);
  ok(spd && spd.ability.perma_bonus === 40, 'Speed forme: +40 Chips (permanent)', spd && spd.ability.perma_bonus);
  const def = dnaCopy('DNA2', 2);
  ok(def && def.ability.perma_h_dollars === 2, 'Defense forme: +$2 held at end of round (permanent)', def && def.ability.perma_h_dollars);
  const d0 = G.GAME.dollars;
  for (const c of G.hand.cards.slice()) if (c !== def) { G.hand.remove_card(c); G.deck.emplace(c); }
  winRound(hand(['S_2']));
  const eff = def.get_end_of_round_effect();
  ok(eff.h_dollars === 2, 'the copy held at end of round pays $2 (perma_h_dollars)', eff);
  void d0;
});

// ------------------------------------------------------------------- Jirachi's Copy / Negging forms (and the Wish Pack)
sec(() => {
  start('JCOPY');
  const jc = add('j_poke_jirachi_copy');
  add('j_joker');
  const r = play(hand(['S_A']));
  // (the copy runs as if the Joker were Energized once more: Pokermon's Energy scales a joker's numbers, +4 -> +5.6)
  ok(close(r.total.mult, 1 + 5.6 + 4) && statusMsgs(r.events).includes('+5.6 Mult'), 'jirachi_copy: copies the Joker to its right, Energized once more (+5.6 Mult, then its own +4)', r.total);
  ok(C('jirachi_copy').in_pool(C('jirachi_copy')) === false && C('jirachi_negging').in_pool(C('jirachi_negging')) === false, 'the Copy / Negging forms are never in a pool');
  void jc;
});
sec(() => {
  start('JNEG');
  const j = add('j_poke_jirachi');
  const lim = G.jokers.config.card_limit;
  const w = add('c_poke_fake_negging');
  act({ type: 'use', id: w.sort_id });
  flush();
  ok(key(j) === 'j_poke_jirachi_negging' && G.jokers.config.card_limit === lim + 2 && G.GAME.negative_edition_rate === 2, 'the Negative wish: Jirachi Negging, +2 Joker slots, Negatives X2', [key(j), G.jokers.config.card_limit - lim, G.GAME.negative_edition_rate]);
  const PJL = MODS.pokermon.content.loc.descriptions.Joker;
  ok(PJL.j_poke_jirachi_copy.text.join(' ').includes('poke_pink') && PJL.j_poke_jirachi_negging.text.length === 2, 'their 3.9.1 texts');
});
sec(() => {
  // The Wish Pack offers 3.9.1's 5 wishes: its "copy" wish is Jirachi Invis; neither Copy nor Negging is offered (3.9.1 likewise).
  start('WISHP');
  add('j_poke_jirachi');
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
    for (const c of (G.pack_cards ? G.pack_cards.cards : [])) seen.add(key(c));
    if (G.pack_cards) act({ type: 'skip_booster' });
    if (G.STATE === STATES.BLIND_SELECT) act({ type: 'select_blind' });
    clearHand();
  }
  ok(seen.size > 0 && !seen.has('c_poke_fake_negging') && [...seen].every((k) => ['c_poke_fake_banker', 'c_poke_fake_booster', 'c_poke_fake_power', 'c_poke_fake_copy', 'c_poke_fake_fixer'].includes(k)), 'the Wish Pack: only 3.9.1\'s 5 wishes (no Negging)', [...seen]);
  start('WISHC');
  const j = add('j_poke_jirachi');
  const w = add('c_poke_fake_copy');
  act({ type: 'use', id: w.sort_id });
  flush();
  ok(key(j) === 'j_poke_jirachi_invis', 'the Copy wish grants Jirachi Invis (3.9.1 fake_copy)', key(j));
});

// ------------------------------------------------------------------- Nacho: the Ralts line's highest evolution
await import('../../mods/nacho/index.js');
sec(() => {
  ok(JSON.stringify(poke_get_family_list('ralts')) === JSON.stringify(['ralts', 'kirlia', 'gardevoir', 'gallade', 'mega_gardevoir', 'mega_gallade']), 'with Nacho: the Ralts family (3.9.1 + its Megas)', poke_get_family_list('ralts'));
  start('NACHORALTS', {}, { mods: ['nacho'] });
  const pr = add('j_poke_ralts');
  const ev = get_highest_evo(pr);
  ok(ev === 'gallade' || ev === 'gardevoir', 'Pokermon Ralts: its highest evolution resolves (Gallade / Gardevoir; it was none while Gallade was missing)', ev);
  if (P_CENTERS.j_nacho_ralts) {
    const nr = add('j_nacho_ralts');
    const ev2 = get_highest_evo(nr);
    ok((ev2 === 'gallade' || ev2 === 'gardevoir') && P_CENTERS['j_nacho_' + ev2], 'Nacho Ralts: its highest evolution resolves (its own Gallade / Gardevoir)', ev2);
  } else ok(false, 'Nacho Ralts registered');
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
  const { DEOXYS_SOULS } = await import('../../mods/pokermon/systems/anim.js');
  cell(C('deoxys').atlas, C('deoxys').soul_pos, 'deoxys_soul_4');
  for (const [f, pos] of Object.entries(DEOXYS_SOULS)) cell(C('deoxys').atlas, pos, 'deoxys_soul_' + f);
  const met = P_CENTERS.c_poke_meteorite;
  cell(met.atlas, met.pos, 'meteorite');
  cell(met.atlas, met.soul_pos, 'meteorite_soul');
  const px = {};
  for (const [file, rects] of Object.entries(want)) Object.assign(px, await crops(path.join(ART, file), rects));
  const opaque = (r) => { let k = 0; for (let i = 3; i < r.px.length; i += 4) if (r.px[i] > 0) k++; return k / (r.px.length / 4); };
  const hash = (r) => { let h = 0; for (let i = 0; i < r.px.length; i += 97) h = (h * 31 + r.px[i]) >>> 0; return h; };
  for (const n of NEW) {
    const c = C(n);
    const base = px[n + '|' + c.atlas], shiny = px[n + '|' + c.atlas.replace(/391$/, 'Shiny391')];
    let diff = 0; for (let i = 0; i < base.px.length; i++) diff += Math.abs(base.px[i] - shiny.px[i]);
    ok(base.inside && opaque(base) > 0.5 && shiny.inside && opaque(shiny) > 0.5 && diff > 0, `${n}: a real 3.9.1 sprite and Shiny (${c.atlas} ${c.pos.x},${c.pos.y})`, [opaque(base), opaque(shiny), diff]);
  }
  const souls = ['4', '1', '2', '3'].map((f) => px['deoxys_soul_' + f]);
  ok(souls.every((r) => r.inside && opaque(r) > 0.05) && new Set(souls.map(hash)).size === 4, 'deoxys: its 4 forme souls on the 3.9.1 Gen 3 sheet are real, distinct pictures', souls.map(opaque));
  ok(px.meteorite.inside && opaque(px.meteorite) > 0.5 && px.meteorite_soul.inside && opaque(px.meteorite_soul) > 0.02, 'meteorite: its 3.9.1 card and soul hold pictures', [opaque(px.meteorite), opaque(px.meteorite_soul)]);
  // the DNA Seal (AtlasStickersBasic 391 {6,1})
  const S = P_SEALS.poke_dna_seal;
  const sa = ATL[S.atlas];
  const sw = (sa.px || 71) * 2, sh = (sa.py || 95) * 2;
  const sp = await crops(path.join(ART, decodeURIComponent(sa.src).replace(/^.*\/assets\/2x\//, '')), { dna: [S.pos.x * sw, S.pos.y * sh, sw, sh] });
  ok(sp.dna.inside && opaque(sp.dna) > 0.02, 'the DNA Seal: its 3.9.1 sticker cell holds a picture', opaque(sp.dna));
}

done();
