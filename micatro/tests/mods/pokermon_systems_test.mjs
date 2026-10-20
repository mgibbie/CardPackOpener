// Pokermon M1 systems: on/off, pools, types/Tera, energy math, every evolution kind,
// carry-over, Everstone, Megastone, shiny, the rule hooks (3-card straights, Splash,
// aliases, Probopass, debuffs, costs, forced seals / Tera), scry, contexts (post_discard,
// hand_drawn, poke_evolved), reserve + keep_on_use, Jirachi cash-out, the view.
//   node micatro/tests/mods/pokermon_systems_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import {
  P_CENTER_POOLS, P_JOKER_RARITY_POOLS, get_current_pool, create_card, create_playing_card, poll_edition, find_joker, add_joker,
} from '../../js/engine/core.js';
import { newRun, get_poker_hand_info } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { describe } from '../../js/engine/describe.js';
import { registerMod, ACTIVE } from '../../js/mods/registry.js';
import * as P from '../../mods/pokermon/api.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const avail = (type, rarity, k) => get_current_pool(type, rarity)[0].includes(k);
const near = (a, b) => Math.abs(a - b) < 1e-9;

// A helper mod used only here: records the new contexts and scores scry cards.
const seen = [];
registerMod({
  id: 'poketest', name: 'Poke Test', prefix: 'pt',
  content: {
    centers: [{ key: 'j_pt_seer', set: 'Joker', name: 'Seer', rarity: 1, cost: 1, pos: { x: 0, y: 0 }, config: {},
      calculate(self, card, context) {
        if (context.hand_drawn) seen.push(['hand_drawn', context.hand_drawn.length]);
        if (context.post_discard) seen.push(['post_discard']);
        if (context.poke_evolved) seen.push(['poke_evolved', context.from, context.to]);
        if (context.individual && context.cardarea === G.scry_view) return { chip_mod: 100, card };
        return undefined;
      } }],
  },
  hooks: { calculate(context) { if (context.poke_evolved) seen.push(['hook_evolved']); } },
});

// ======================================================== OFF: nothing of Pokermon
newRun({ seed: 'OFF' });
ok(ACTIVE.length === 0 && !P_CENTER_POOLS.Item && !P_CENTER_POOLS.Energy, 'off: no Item/Energy pools');
ok(!P_CENTER_POOLS.Joker.some((c) => c.mod) && !P_JOKER_RARITY_POOLS.poke_safari, 'off: no Pokémon in pools / rarities');
ok(G.GAME.joker_rate === 20 && !G.scry_view, 'off: vanilla joker rate, no scry view');
ok(!P_CENTER_POOLS.Edition.some((e) => e.mod) && !P_CENTER_POOLS.Booster.some((b) => b.mod), 'off: no shiny edition / Pocket packs');
{
  act({ type: 'select_blind' });
  const h = ['S_A', 'H_K', 'D_Q'].map((k) => create_playing_card({ front: P_CARDS[k] }));
  ok(get_poker_hand_info(h).text !== 'Straight', 'off: no 3-card straights');
}

// ======================================================== ON: pools
start('POOLS', {}, { noBlind: true });
ok(G.GAME.joker_rate === 28 && G.GAME.item_rate === 4 && G.GAME.energy_rate === 2, 'on: joker_rate +8, Item 4, Energy 2', [G.GAME.joker_rate, G.GAME.item_rate, G.GAME.energy_rate]);
ok(avail('Joker', 0.1, 'j_poke_caterpie') && avail('Joker', 0.1, 'j_poke_weedle'), 'common pool has basic Pokémon');
ok(!avail('Joker', 0.1, 'j_joker'), 'pokemon_only (default on): base jokers out of the pool');
ok(P_JOKER_RARITY_POOLS.poke_safari.some((c) => c.key === 'j_poke_ivysaur') && !P_JOKER_RARITY_POOLS[2].some((c) => c.key === 'j_poke_ivysaur'), 'safari rarity has its own (weight-0) pool');
ok(P_JOKER_RARITY_POOLS.poke_mega.some((c) => c.key === 'j_poke_mega_venusaur'), 'mega rarity pool');
// (Ports land file by file: pick whatever is still unported instead of naming one.)
{
  const uj = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && c.unported && c.rarity === 1);
  ok(uj.every((c) => !avail('Joker', 0.1, c.key)), 'unported jokers never offered', uj.filter((c) => avail('Joker', 0.1, c.key)).map((c) => c.key));
  const ui = Object.values(P_CENTERS).filter((c) => c.set === 'Item' && c.unported);
  ok(avail('Item', null, 'c_poke_pokeball') && avail('Item', null, 'c_poke_thunderstone') && ui.every((c) => !avail('Item', null, c.key)), 'Item pool: ported only', ui.filter((c) => avail('Item', null, c.key)).map((c) => c.key));
}
ok(avail('Energy', null, 'c_poke_fire_energy') && !avail('Energy', null, 'c_poke_bird_energy'), 'Energy pool');
ok(!avail('Spectral', null, 'c_poke_megastone'), 'hidden Megastone not in the plain pool');
ok(P_CENTER_POOLS.Booster.some((b) => b.key === 'p_poke_pokepack_normal_1') && P_CENTERS.p_poke_pokepack_wish_pack.in_pool() === false && P_CENTERS.p_poke_pokepack_starter_pack.in_pool() === false, 'Pocket packs pooled; Wish / Starter packs never rolled (tag-only)');
add('j_poke_caterpie');
ok(!avail('Joker', 0.1, 'j_poke_caterpie') && !avail('Joker', 0.1, 'j_poke_metapod'), 'family rule: held Caterpie blocks its line');
ok(avail('Joker', 0.1, 'j_poke_weedle'), 'other families still offered');
G.jokers.cards[0].remove();
ok(avail('Joker', 0.1, 'j_poke_metapod') && avail('Joker', 0.1, 'j_poke_caterpie'), 'selling frees the family again (used_jokers)');
create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie', 'x');
ok(!avail('Joker', 0.1, 'j_poke_metapod') && G.GAME.used_jokers.j_poke_caterpie, 'a family member already shown this run blocks the line (poke_family_present)');
add('j_poke_pokedex');
ok(avail('Joker', 0.1, 'j_poke_metapod'), 'Pokédex lifts the family rule');
start('POOLS2', { pokemon_only: false, gen_oneb: false }, { noBlind: true });
ok(avail('Joker', 0.1, 'j_joker') && !avail('Joker', 0.1, 'j_poke_caterpie'), 'options: pokemon_only off + gen 1 off');
start('POOLS3', { pokeballs: false }, { noBlind: true });
ok(!avail('Item', null, 'c_poke_pokeball'), 'pokeballs option off removes the balls');
{
  start('RANDPOKE', {}, { noBlind: true });
  const k = P.get_random_poke_key('t', 'Basic');
  ok(P_CENTERS[k].stage === 'Basic' && !P_CENTERS[k].unported && P_CENTERS[k].rarity !== 'poke_mega', 'get_random_poke_key: ported Basic', k);
  const c = create_card('Joker', G.jokers, null, 'poke_safari', null, null, null, 'x');
  ok(c.config.center.rarity === 'poke_safari', 'create_card with a rarity key (poke_safari)', key(c));
}

// ======================================================== types + Tera
{
  start('TYPES');
  const ch = add('j_poke_charmander');
  ok(P.get_type(ch) === 'Fire' && P.is_type(ch, 'Fire') && P.has_type(ch), 'ptype from data');
  const jk = add('j_joker');
  ok(!P.has_type(jk), 'base joker has no type');
  P.apply_type_sticker(jk, 'Water');
  ok(P.get_type(jk) === 'Water' && P.type_sticker_applied(jk) === 'Water' && P.find_pokemon_type('Water').includes(jk), 'Tera sticker on a base joker');
  P.apply_type_sticker(ch, 'Grass');
  ok(P.get_type(ch) === 'Grass' && ch.ability.extra.ptype === 'Grass' && !ch.ability.fire_sticker, 'Tera overrides ptype');
  const d = describe(jk);
  ok(d.badges.some((b) => b.key === 'poke_type' && /Water/.test(b.label) && /Tera/.test(b.label)), 'type badge on a base joker (describe hook)', d.badges);
  const d2 = describe(ch);
  ok(d2.badges.some((b) => b.key === 'poke_type'), 'type badge on a Pokémon');
  ok(P.find_other_poke_or_energy_type(ch, 'Grass') === 0 && P.find_other_poke_or_energy_type(jk, 'Water', true) === 1, 'find_other_poke_or_energy_type');
}

// ======================================================== energy math
{
  start('ENERGY');
  const ch = add('j_poke_charmander');
  const fe = add('c_poke_fire_energy');
  ok(act({ type: 'use', id: fe.sort_id }).ok, 'fire energy usable (first matching joker)');
  ok(near(ch.ability.extra.mult_mod, 1.2) && ch.ability.extra.energy_count === 1 && ch.ability.extra.mult === 0, 'energize: mult_mod 1 -> 1.2 (x0.2), mult 0 stays', ch.ability.extra);
  const ce = add('c_poke_colorless_energy');
  act({ type: 'use', id: ce.sort_id, joker_targets: [ch.sort_id] });
  ok(near(ch.ability.extra.mult_mod, 1.3) && ch.ability.extra.c_energy_count === 1, 'Colorless on a non-Colorless joker counts half', ch.ability.extra);
  const cat = add('j_poke_caterpie');
  const ge = add('c_poke_grass_energy');
  act({ type: 'use', id: ge.sort_id, joker_targets: [cat.sort_id] });
  ok(near(cat.ability.extra.mult, 4.2), 'caterpie mult 3 -> 4.2 (x0.4)', cat.ability.extra);
  // Limit: 3 (energy_max + energy_plus); the 4th can't be used.
  for (let i = 0; i < 2; i++) act({ type: 'use', id: add('c_poke_grass_energy').sort_id, joker_targets: [cat.sort_id] });
  const g4 = add('c_poke_grass_energy');
  ok(P.get_total_energy(cat) === 3 && !act({ type: 'use', id: g4.sort_id, joker_targets: [cat.sort_id] }).ok, 'energy limit 3 per joker');
  G.GAME.energy_plus = 1;
  ok(act({ type: 'use', id: g4.sort_id, joker_targets: [cat.sort_id] }).ok && P.get_total_energy(cat) === 4, 'energy_plus raises the limit');
  // Base joker with a Tera sticker: plain mult fields.
  const jk = add('j_joker');
  P.apply_type_sticker(jk, 'Fire');
  P.increment_energy(jk, 'Fire');
  ok(near(jk.ability.mult, 4 + 4 * 0.4) && jk.ability.energy_count === 1, 'base Joker energized (ability.mult)', jk.ability);
  const dj = describe(jk);
  ok(dj.info.some((i) => i.key === 'energy' && i.lines.join(' ').includes('1')) && dj.badges.some((b) => b.key === 'poke_type'), 'base joker description: energy tooltip + type badge', dj.info);
  const gj = add('j_greedy_joker');
  P.apply_type_sticker(gj, 'Fire');
  P.increment_energy(gj, 'Colorless');
  ok(near(gj.ability.extra.s_mult, 3 + 3 * 0.4 / 2) && gj.ability.extra.suit === 'Diamonds' && gj.ability.extra.c_energy_count === 1, 'base joker with table extra: s_mult energized by Colorless (half)', gj.ability.extra);
  ok(G.GAME.energies_used >= 6, 'energies_used counted', G.GAME.energies_used);
}
{
  start('ROUND', { precise_energy: false });
  const cat = add('j_poke_caterpie');
  P.increment_energy(cat, 'Grass');
  ok(cat.ability.extra.mult === 5, 'precise_energy off: mult rounds up (4.2 -> 5)', cat.ability.extra);
  const bu = add('j_poke_bulbasaur');
  P.increment_energy(bu, 'Grass');
  ok(bu.ability.extra.money_mod === 1 && near(bu.ability.money_mod_frac, 0.1), 'precise_energy off: money_mod keeps its fraction', [bu.ability.extra.money_mod, bu.ability.money_mod_frac]);
  start('UNLIM', { unlimited_energy: true });
  const c2 = add('j_poke_caterpie');
  for (let i = 0; i < 5; i++) P.energy_increase(c2, 'Grass');
  ok(P.get_total_energy(c2) === 5, 'unlimited_energy option', P.get_total_energy(c2));
}

// ======================================================== evolution kinds + carry-over
{
  start('EVO');
  const ch = add('j_poke_charmander');
  P.increment_energy(ch, 'Fire');
  ch.ability.perishable = true; ch.ability.perish_tally = 1;
  ch.set_edition({ poke_shiny: true }, true, true);
  ch.ability.extra.mult = 16;
  G.GAME.current_round.discards_left = 1;
  const w = winRound();
  ok(key(ch) === 'j_poke_charmeleon', 'scaling evo (Charmander mult 16)');
  ok(near(ch.ability.extra.mult_mod, 2.4) && ch.ability.extra.energy_count === 1, 'energy re-applied to the new base (2 -> 2.4)', ch.ability.extra);
  ok(ch.ability.extra.mult === 16, 'scaled mult carried', ch.ability.extra.mult);
  ok(ch.ability.perish_tally === G.GAME.perishable_rounds && !ch.debuff, 'perishable tally reset on evolution', ch.ability.perish_tally);
  ok(ch.edition && ch.edition.poke_shiny, 'shiny kept');
  ok(statusMsgs(w.events).some((m) => /Evolved/i.test(m)), 'evolve message', statusMsgs(w.events));
  // used_jokers rebuilt: the old key is forgotten, the new one held.
  ok(!G.GAME.used_jokers.j_poke_charmander && G.GAME.used_jokers.j_poke_charmeleon, 'used_jokers bookkeeping');
}
{
  start('TYPEEVO');
  const ch = add('j_poke_caterpie');
  P.apply_type_sticker(ch, 'Water');
  const r = P.type_evo(ch.config.center, ch, { end_of_round: true }, 'j_poke_metapod', 'water');
  G.E_MANAGER.flush();
  ok(key(ch) === 'j_poke_metapod' && r, 'type_evo (sticker requirement)');
  ok(ch.ability.water_sticker && ch.ability.extra.ptype === 'Water', 'Tera sticker survives evolution and keeps the ptype', ch.ability.extra);
  const b = add('j_poke_bulbasaur');
  P.deck_suit_evo(b.config.center, b, { end_of_round: true }, 'j_poke_ivysaur', 'Spades', 0.2);
  G.E_MANAGER.flush();
  ok(key(b) === 'j_poke_ivysaur', 'deck_suit_evo (25% Spades >= 20%)');
  const s = add('j_poke_squirtle');
  P.deck_enhance_evo(s.config.center, s, { end_of_round: true }, 'j_poke_wartortle', 'Glass', null, 1);
  G.E_MANAGER.flush();
  ok(key(s) === 'j_poke_squirtle', 'deck_enhance_evo: no Glass, no evolution');
  G.playing_cards[0].set_ability(P_CENTERS.m_glass);
  P.deck_enhance_evo(s.config.center, s, { end_of_round: true }, 'j_poke_wartortle', 'Glass', null, 1);
  G.E_MANAGER.flush();
  ok(key(s) === 'j_poke_wartortle', 'deck_enhance_evo (flat 1 Glass)');
  const w = add('j_poke_weedle');
  G.playing_cards[1].set_seal('Red', true);
  P.deck_seal_evo(w.config.center, w, { end_of_round: true }, 'j_poke_kakuna', null, null, 1);
  G.E_MANAGER.flush();
  ok(key(w) === 'j_poke_kakuna', 'deck_seal_evo (any seal)');
  ok(!P.can_evolve(w.config.center, w, { end_of_round: true, blueprint: 1 }, 'j_poke_beedrill'), 'no evolution from a blueprint copy');
  ok(!P.can_evolve(w.config.center, w, { end_of_round: true, individual: true }, 'j_poke_beedrill'), 'no evolution in an individual context');
}
{
  start('EVERSTONE');
  const c = add('j_poke_caterpie');
  add('j_poke_everstone');
  const r = play(hand(['S_A']));
  // High card 16 chips; caterpie +3 -> 4; everstone X1.5 on a Basic -> 6 (Pokermon 3.9.1: Basic X1.5, Baby X1.75)
  ok(near(r.total.mult, 4 * 1.5), 'everstone: X1.5 per Basic (Pokermon 3.9.1)', r.total);
  winRound(); nextRound(); winRound();
  ok(key(c) === 'j_poke_caterpie' && c.ability.extra.rounds === 0, 'everstone blocks the evolution (countdown still runs)', [key(c), c.ability.extra.rounds]);
}
{
  start('RANDOMIZER');
  G.GAME.modifiers.apply_randomizer = true;
  const c = add('j_poke_caterpie');
  c.ability.extra.rounds = 1;
  winRound();
  ok(key(c) !== 'j_poke_caterpie' && key(c) !== 'j_poke_metapod' && P_CENTERS[key(c)].stage, 'randomizer challenge: random evolution target', key(c));
}
{
  // poke_evolved context reaches other mods (Nacho's Dip) — not for megas.
  seen.length = 0;
  start('EVOCTX', {}, { mods: ['poketest'] });
  add('j_pt_seer');
  const c = add('j_poke_caterpie');
  c.ability.extra.rounds = 1;
  winRound();
  ok(seen.some((s) => s[0] === 'poke_evolved' && s[1] === 'j_poke_caterpie' && s[2] === 'j_poke_metapod') && seen.some((s) => s[0] === 'hook_evolved'), 'poke_evolved context (joker + mod hook)', seen);
}
{
  start('FAMILY', {}, { noBlind: true });
  const v = add('j_poke_venusaur');
  ok(P.get_previous_evo(v) === 'ivysaur' && P.get_previous_evo(v, true) === 'j_poke_ivysaur', 'get_previous_evo');
  const m = add('j_poke_mega_charizard_x');
  ok(P.get_previous_evo(m, true) === 'j_poke_charizard', 'get_previous_evo from a mega');
  const b = add('j_poke_bulbasaur');
  ok(P.get_highest_evo(b) === 'venusaur', 'get_highest_evo skips megas', P.get_highest_evo(b));
  const keys = P.get_family_keys('pikachu', null, add('j_poke_pikachu'));
  ok(keys.includes('j_poke_pichu') && keys.includes('j_poke_raichu') && keys.includes('c_poke_thunderstone'), 'get_family_keys (+ item requirement)', keys);
}

// ======================================================== Megastone
{
  start('MEGA');
  const v = add('j_poke_venusaur');
  const hs = G.hand.config.card_limit;
  const ms = add('c_poke_megastone');
  ok(ms.can_use_consumeable(), 'megastone usable with a mega-capable joker');
  ok(act({ type: 'use', id: ms.sort_id }).ok, 'use megastone');
  ok(key(v) === 'j_poke_mega_venusaur' && ms.area === G.consumeables, 'mega evolution; the stone stays (keep_on_use)', [key(v), ms.area && ms.area.name]);
  ok(G.hand.config.card_limit === hs - 1 + 4, 'mega venusaur hand size replaces venusaur\'s', G.hand.config.card_limit);
  // (Pokermon 3.9.1, batch 16: used_on is the Mega's card, its unique_val)
  ok(ms.ability.extra.used_on === v.unique_val && !ms.ability.extra.usable && !ms.can_use_consumeable(), 'once per round', ms.ability.extra.used_on);
  winRound();
  ok(ms.ability.extra.usable === true, 'usable again after the round');
  act({ type: 'cash_out' });
  ok(act({ type: 'use', id: ms.sort_id }).ok && key(v) === 'j_poke_venusaur', 'second use reverts the mega', key(v));
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(!ms.can_use_consumeable(), 'still spent until the round ends');
  winRound(); act({ type: 'cash_out' });
  act({ type: 'use', id: ms.sort_id });
  ok(key(v) === 'j_poke_mega_venusaur', 'mega again next round');
  act({ type: 'sell', id: ms.sort_id });
  ok(key(v) === 'j_poke_venusaur', 'selling the stone devolves its mega', key(v));
}
{
  start('MEGAXY');
  const c1 = add('j_poke_charizard');
  add('j_poke_caterpie');
  const ms = add('c_poke_megastone');
  act({ type: 'use', id: ms.sort_id, joker_targets: [c1.sort_id] });
  ok(key(c1) === 'j_poke_mega_charizard_x', 'leftmost Charizard -> Mega X', key(c1));
  start('MEGAXY2');
  add('j_poke_caterpie');
  const c2 = add('j_poke_charizard');
  const ms2 = add('c_poke_megastone');
  act({ type: 'use', id: ms2.sort_id, joker_targets: [c2.sort_id] });
  ok(key(c2) === 'j_poke_mega_charizard_y', 'rightmost Charizard -> Mega Y', key(c2));
}

// ======================================================== shiny
{
  start('SHINY');
  const j = add('j_poke_caterpie');
  const cost0 = j.cost;
  j.set_edition('e_poke_shiny');
  ok(j.edition.poke_shiny && j.edition.type === 'poke_shiny' && j.edition.key === 'e_poke_shiny', 'shiny edition applied (string key)');
  ok(j.cost === cost0 + 5, 'shiny +$5 cost', [cost0, j.cost]);
  ok(G.GAME.modifiers.extra_boosters === 1, 'owned shiny: +1 booster slot');
  ok(describe(j).badges.some((b) => b.label === 'Shiny'), 'Shiny badge');
  winRound(); act({ type: 'cash_out' });
  ok(G.shop_booster.cards.length === 3, 'shop has 3 booster slots', G.shop_booster.cards.length);
  act({ type: 'sell', id: j.sort_id });
  ok(G.GAME.modifiers.extra_boosters === 0, 'selling the shiny removes the slot', G.GAME.modifiers.extra_boosters);
  // Buying a shiny in the shop: the slot (and a pack) arrive on purchase.
  const sj = G.shop_jokers.cards[0];
  sj.set_edition({ poke_shiny: true }, true, true);
  ok(sj.shiny_on_add && G.GAME.modifiers.extra_boosters === 0, 'shop shiny waits for purchase');
  G.GAME.dollars = 100;
  const nb = G.shop_booster.cards.length;
  ok(act({ type: 'buy', id: sj.sort_id }).ok && G.GAME.modifiers.extra_boosters === 1 && G.shop_booster.cards.length === nb + 1, 'bought shiny: +1 slot and a pack now', [G.GAME.modifiers.extra_boosters, G.shop_booster.cards.length]);
  // Shiny playing cards: refused unless the option is on.
  const pc = create_playing_card({ front: P_CARDS.S_A }, G.deck);
  pc.set_edition('e_poke_shiny');
  ok(!pc.edition, 'no shiny playing cards by default');
  start('SHINYPC', { shiny_playing_cards: true });
  const pc2 = create_playing_card({ front: P_CARDS.S_A }, G.deck);
  pc2.set_edition({ poke_shiny: true });
  ok(pc2.edition && pc2.edition.poke_shiny, 'shiny_playing_cards option');
  // The weighted poll can roll a shiny (seed scan).
  let got = null;
  for (let i = 0; i < 4000 && !got; i++) { const e = poll_edition('shinyscan' + i, null, null, true); if (e && e.poke_shiny) got = i; }
  ok(got !== null, 'poll_edition can roll Shiny', got);
  const r = play(hand(['S_A']));
  ok(r.total && r.total.mult === 1, 'shiny scores nothing (no edition popup on a joker)');
}

// ======================================================== rule hooks
{
  start('HANDS');
  const h3 = (k) => k.map((x) => create_playing_card({ front: P_CARDS[x] }));
  const aipom = add('j_poke_aipom');
  ok(get_poker_hand_info(h3(['S_A', 'H_K', 'D_Q'])).text === 'Straight', 'Aipom: 3-card straight');
  ok(get_poker_hand_info(h3(['S_2', 'S_9', 'S_K'])).text === 'Flush', 'Aipom: 3-card flush');
  aipom.remove();
  add('j_poke_ambipom');
  ok(get_poker_hand_info(h3(['S_A', 'H_K', 'D_Q'])).text === 'Straight', 'Ambipom: 3-card straight with 3 cards');
  ok(get_poker_hand_info(h3(['S_A', 'H_K', 'D_Q', 'C_5'])).text !== 'Straight', 'Ambipom: not with 4 cards');
  G.jokers.cards[0].remove();
  add('j_poke_pansear');
  ok(find_joker('Four Fingers').length === 1 && get_poker_hand_info(h3(['S_2', 'S_9', 'S_K', 'S_4'])).text === 'Flush', 'Pansear counts as Four Fingers');
  add('j_poke_panpour');
  ok(create_playing_card({ front: P_CARDS.S_2 }).is_face(), 'Panpour counts as Pareidolia');
  add('j_poke_pansage');
  ok(find_joker('Shortcut').length === 1, 'Pansage counts as Shortcut');
  add('j_poke_smeargle');
  ok(!create_playing_card({ front: P_CARDS.H_2 }).is_suit('Diamonds'), 'Smeargle no longer counts as Smeared Joker (Pokermon 3.9.1)');
}
{
  start('SPLASH');
  add('j_poke_magikarp');
  const r = play(hand(['S_A', 'H_A', 'D_5']));
  const sc = r.events.find((e) => e.type === 'scoring_hand');
  ok(sc && sc.cards.length === 3, 'Magikarp: every played card scores (Splash)', sc);
  const stone = create_playing_card({ front: P_CARDS.S_3, center: P_CENTERS.m_stone }, G.hand);
  ok(!stone.is_face(), 'stone not a face');
  add('j_poke_probopass');
  ok(stone.is_face(), 'Probopass: Stone Cards are faces');
}
{
  start('DEBUFF');
  const baby = add('j_poke_pichu');
  baby.ability.fainted = G.GAME.round;
  baby.set_debuff();
  ok(baby.debuff, 'fainted baby is debuffed during the round');
  winRound();
  ok(!baby.debuff, 'fainted baby recovers after the round', baby.debuff);
  nextRound();
  const g = add('j_poke_gholdengo');
  g.set_debuff(true);
  ok(!g.debuff, 'Gholdengo cannot be debuffed');
  const ten = create_playing_card({ front: P_CARDS.S_T }, G.hand);
  ten.set_debuff(true);
  ok(ten.debuff, '10 debuffs normally');
  add('j_poke_tentacruel');
  ten.set_debuff(true);
  ok(!ten.debuff, 'Tentacruel protects 10s');
  const wild = create_playing_card({ front: P_CARDS.S_4, center: P_CENTERS.m_wild }, G.hand);
  add('j_poke_tangrowth');
  wild.set_debuff(true);
  ok(!wild.debuff, 'Tangrowth protects Wild Cards');
  // faint_baby_poke: a Baby left of an adult faints at joker_main.
  start('FAINT');
  const pichu = add('j_poke_pichu');
  add('j_poke_caterpie');
  P.faint_baby_poke(pichu.config.center, pichu, { cardarea: G.jokers, scoring_hand: [], joker_main: true });
  G.E_MANAGER.flush();
  ok(pichu.debuff && pichu.ability.fainted === G.GAME.round, 'faint_baby_poke: baby faints left of an adult');
  ok(P.volatile_active(null, G.jokers.cards[1], 'right') === true, 'volatile_active');
}
{
  start('COSTS');
  winRound(); act({ type: 'cash_out' });
  const b = G.shop_booster.cards[0];
  const c0 = b.cost;
  add('j_poke_rotom');
  b.set_cost();
  ok(b.cost === Math.max(0, c0 - 1), 'Rotom: boosters $1 cheaper', [c0, b.cost]);
  const u = add('j_poke_unown');
  ok(u.sell_cost === 0, 'Unown sells for $0');
  const z = add('j_poke_zorua');
  z.set_rental(true);
  ok(!z.ability.rental, 'rental_compat false (Zorua) never becomes Rental');
  // Misdreavus-style nominal drain (lovely patch on get_chip_bonus): never below 1 chip.
  const ten = create_playing_card({ front: P_CARDS.S_T }, G.deck);
  ten.ability.nominal_drain = 4;
  ok(ten.get_chip_bonus() === 6, 'nominal_drain lowers rank chips', ten.get_chip_bonus());
  ten.ability.nominal_drain = 50;
  ok(ten.get_chip_bonus() === 1 && ten.ability.nominal_drain === 9, 'nominal_drain stabilizes at 1 chip', ten.get_chip_bonus());
}
{
  start('FORCED');
  G.GAME.modifiers.poke_force_seal = 'poke_pink_seal';
  G.GAME.modifiers.apply_type = true;
  const pc = create_card('Base', G.hand, null, null, null, null, null, 'x');
  ok(pc.seal === 'poke_pink_seal', 'deck forced seal on created playing cards', pc.seal);
  const j = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_caterpie', 'x');
  ok(P.type_sticker_applied(j) && P.get_total_energy(j) === (P.energy_matches(j, P.type_sticker_applied(j), false) ? 1 : 0), 'apply_type: created jokers get a Tera type (+1 energy if it matches)', [P.type_sticker_applied(j), P.get_total_energy(j)]);
}
{
  start('JIRACHI');
  add('j_poke_jirachi_banker');
  winRound();
  const rows = G.GAME.round_eval.rows;
  // (Pokermon 3.9.1: the joker's own modify_final_cashout, X3, replaced the "Jirachi Double Payout" lovely patch)
  const jr = rows.find((r) => r.name === 'cashout_mod1');
  const before = rows.filter((r) => r !== jr).reduce((n, r) => n + (r.dollars || 0), 0);
  ok(jr && jr.dollars === before * 2 && G.GAME.round_eval.total === before * 3 && !rows.some((r) => r.name === 'joker_jirachi1'), 'Jirachi Banker triples the cash-out (Pokermon 3.9.1)', { jr, total: G.GAME.round_eval.total, before });
  G.GAME.modifiers.no_interest = true; G.GAME.modifiers.reset_no_interest = true;
  act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand(); winRound();
  ok(!G.GAME.modifiers.no_interest, 'Double Rainbow interest lockout lifts after a cash-out');
}

// ======================================================== contexts
{
  seen.length = 0;
  start('CTX', {}, { mods: ['poketest'] });
  add('j_pt_seer');
  hand(['S_2', 'S_3', 'S_4']);
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  G.deck.cards.length > 0 && act({ type: 'discard' });
  ok(seen.some((s) => s[0] === 'post_discard'), 'post_discard context');
  ok(seen.some((s) => s[0] === 'hand_drawn' && s[1] === 6), 'hand_drawn context with the drawn cards (8 - 2 kept)', seen);
  ok(G.GAME.poke_ante_discards_used === 1, 'Garbodor counter (discards this ante)', G.GAME.poke_ante_discards_used);
  seen.length = 0;
  P.poke_draw_one();
  G.E_MANAGER.flush();
  ok(seen.some((s) => s[0] === 'hand_drawn' && s[1] === 1), 'poke_draw_one re-fires hand_drawn', seen);
}

// ======================================================== scry
{
  start('SCRY', {}, { mods: ['poketest'] });
  G.GAME.scry_amount = 2;
  const top = G.deck.cards.slice(-2).reverse();
  ok(G.scry_view.cards.length === 2 && G.scry_view.cards[0] === top[0] && G.scry_view.cards[1] === top[1], 'scry view = the top 2 deck cards');
  const v = toView();
  ok(v.areas.scry && v.areas.scry.length === 2 && v.poke.scry_amount === 2, 'view exposes areas.scry');
  add('j_pt_seer');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 200, 'scry cards scored like held cards (cardarea === G.scry_view)', r.total);
  G.GAME.scry_amount = 0;
  ok(!toView().areas.scry, 'no scry area at 0');
}

// ======================================================== items / packs / reserve
{
  start('BALL');
  const pb = add('c_poke_pokeball');
  ok(act({ type: 'use', id: pb.sort_id }).ok && G.jokers.cards.length === 1 && G.jokers.cards[0].config.center.stage === 'Basic', 'Poké Ball: a random Basic Pokémon', G.jokers.cards.map(key));
  const tr = add('c_poke_transformation');
  const target = G.jokers.cards[0];
  const before = key(target);
  ok(act({ type: 'use', id: tr.sort_id }).ok, 'Transformation usable');
  ok(key(target) !== before || !P.get_highest_evo(target) || P.get_total_energy(target) >= 0, 'Transformation: energy + highest evolution', [before, key(target)]);
}
{
  start('THUNDER');
  const pk = add('j_poke_pikachu');
  const ts = add('c_poke_thunderstone');
  const sel = hand(['H_7'])[0];
  const n0 = G.playing_cards.length;
  ok(act({ type: 'use', id: ts.sort_id, targets: [sel.sort_id] }).ok, 'Thunder Stone on a hand card');
  ok(G.playing_cards.length === n0 + 1 && G.playing_cards.filter((c) => c.config.center.key === 'm_gold' && c.base.value === '7').length === 2 && pk.ability.extra.evolve === true,
    'Thunder Stone: card -> 2 Gold 7s, Pikachu marked to evolve', G.playing_cards.length - n0);
}
{
  start('POCKET');
  winRound(); act({ type: 'cash_out' });
  const pack = new (G.shop_booster.cards[0].constructor)(P_CARDS.empty, P_CENTERS.p_poke_pokepack_normal_1);
  G.shop_booster.emplace(pack);
  G.GAME.dollars = 50;
  ok(act({ type: 'buy', id: pack.sort_id }).ok && G.STATE === STATES.MOD_PACK_HAND && G.pack_cards.cards.length === 4, 'Pocket pack opens with 4 cards and the hand drawn');
  ok(G.pack_cards.cards[0].ability.set === 'Energy' || key(G.pack_cards.cards[0]) === 'c_poke_double_rainbow_energy', 'slot 1 is an Energy', key(G.pack_cards.cards[0]));
  ok(G.pack_cards.cards.slice(1).every((c) => c.ability.set === 'Item' || c.ability.set === 'Spectral'), 'other slots are Items', G.pack_cards.cards.map(key));
  const c = G.pack_cards.cards[1];
  ok(act({ type: 'reserve', id: c.sort_id }).ok && c.area === G.consumeables && G.STATE === STATES.SHOP, 'reserve: saved to the consumables, pack closed', [c.area && c.area.name, G.STATE]);
}

// ======================================================== view + loc
{
  start('VIEW');
  const ch = add('j_poke_charmander');
  P.increment_energy(ch, 'Fire');
  const v = toView();
  const jv = v.areas.jokers[0];
  ok(jv.poke && jv.poke.ptype === 'Fire' && jv.poke.energy === 1 && jv.poke.stage === 'Basic', 'card view: type / energy / stage', jv.poke);
  ok(jv.desc.name === 'Charmander' && jv.desc.lines.some((l) => /discard/.test(l)) && jv.desc.info.some((i) => i.key === 'energy'), 'description from Pokermon loc + energy tooltip', jv.desc);
  ok(jv.atlas === 'poke_AtlasJokersBasicNatdex391' && jv.pos.x === 6, 'Natdex art cell (the 3.9.1 sheet)', [jv.atlas, jv.pos]);
  const cat = add('j_poke_caterpie');
  ok(toView().areas.jokers[1].poke.rounds === 2, 'level-evo countdown in the view');
}

// ======================================================== OFF again
newRun({ seed: 'OFF2' });
ok(!find_joker('Four Fingers').length && G.GAME.joker_rate === 20, 'a plain run after a modded one is vanilla');

done();
