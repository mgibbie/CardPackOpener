// Engine + mod correctness polish (Micatro mods plan, step 8). Each block pins one fix:
//   1. MOD returns in the vanilla contexts whose return the base game ignores (buying_card, selling_self,
//      skipping_booster, remove_playing_cards, ...) show their popup like SMODS.calculate_effect does.
//   2. Quantum enhancements come from an explicit `quantum_enhancements: true` on the granting center, and the
//      vanilla enhancement-counting jokers (Steel / Stone Joker, Golden Ticket, Glass Joker, Driver's License)
//      count them like Steamodded's fixes.toml (SMODS.has_enhancement).
//   3. Pokermon jokers missing from data.js get their static data the same way as the rest.
//   5. The Homelatro rarities use Homelatro's own weights / rules / strings.
//   6. Pokermon seams: Xatu's Celestial packs (3.9.1: their normal size again — the 3.2.1 all-planets patch is gone);
//      previous-evolution win stickers.
//   node micatro/tests/mods/engine_polish_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { localize, P_CENTER_POOLS, quantum_enhancements, find_joker } from '../../js/engine/core.js';
import { loadMods, AVAILABLE, MODS, ATLASES } from '../../js/mods/index.js';
import { RARITIES } from '../../mods/autumncircus/index.js';
import { is_type } from '../../mods/pokermon/systems/types.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { family_win_keys } from '../../mods/pokermon/systems/evolution.js';

const { ok, done } = T();
await loadMods(AVAILABLE.map((m) => m.id));
const ALL = ['morefluff', 'nacho', 'autumncircus', 'milatro'];
const msgs = (events) => events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);
const flush = () => G.E_MANAGER.flush();
const toShop = () => {
  if (G.STATE === STATES.SELECTING_HAND) winRound();
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
};
const key = (c) => c.config.center.key;

// ------------------------------------------------------------------ 1. popups in ignored-return contexts
{ // More Fluff's Broom Closet: buying_card returns {message = "Disabled!"}
  start('POLISH_BROOM', {}, { mods: ALL });
  const j = add('j_mf_broomcloset');
  toShop(); G.GAME.dollars = 100;
  const r = act({ type: 'buy', id: G.shop_jokers.cards[0].sort_id });
  ok(j.ability.active === false && msgs(r.events).includes(localize('k_disabled_ex')), 'Broom Closet: buying a card pops "Disabled!"', msgs(r.events));
}
{ // More Fluff's Treasure Map: selling_self returns {message = "$13"}
  start('POLISH_TMAP', {}, { mods: ALL });
  const j = add('j_mf_treasuremap'); j.ability.extra.c_rounds = 2;
  const r = act({ type: 'sell', id: j.sort_id });
  ok(msgs(r.events).includes(localize('$') + 13), 'Treasure Map: selling it pops "$13"', msgs(r.events));
}
{ // More Fluff's Recycling: skipping_booster returns {message = "+1 Tarot" / "+1 Planet"}
  start('POLISH_RECYCLE', {}, { mods: ALL });
  add('j_mf_recycling');
  toShop(); G.GAME.dollars = 100;
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  const r = act({ type: 'skip_booster' });
  ok(msgs(r.events).some((m) => m === localize('k_plus_tarot') || m === localize('k_plus_planet')), 'Recycling: skipping a pack pops "+1 Tarot/Planet"', msgs(r.events));
}
{ // ... and a Blueprint copying it shows the copy's popup too (the return carries the mod mark)
  start('POLISH_RECYCLE_BP', {}, { mods: ALL });
  add('j_blueprint'); add('j_mf_recycling');
  toShop(); G.GAME.dollars = 100;
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  const r = act({ type: 'skip_booster' });
  const n = msgs(r.events).filter((m) => m === localize('k_plus_tarot') || m === localize('k_plus_planet')).length;
  ok(n === 2 && G.consumeables.cards.length === 2, 'Blueprint + Recycling: two consumables, two popups', [n, G.consumeables.cards.length]);
}
{ // Pokermon's Pawniard: remove_playing_cards (The Hanged Man) returns {message = "X1.5 Mult"}
  start('POLISH_PAWN', {}, { mods: ALL });
  const j = add('j_poke_pawniard');
  const hm = add('c_hanged_man');
  const [k] = hand(['S_K']);
  const r = act({ type: 'use', id: hm.sort_id, targets: [k.sort_id] });
  ok(j.ability.extra.Xmult > 1 && msgs(r.events).some((m) => /^X/.test(m)), 'Pawniard: a destroyed face card pops its new X Mult', [j.ability.extra.Xmult, msgs(r.events)]);
}
{ // Pokermon's Dreepy: selling_self returns {message = "Value Up!"}
  start('POLISH_DREEPY', {}, { mods: ALL });
  add('j_poke_dreepy');
  const d = G.jokers.cards.find((c) => key(c) === 'j_poke_dreepy');
  const r = act({ type: 'sell', id: d.sort_id });
  ok(msgs(r.events).includes(localize('k_val_up')), 'Dreepy: selling it pops "Value Up!"', msgs(r.events));
}

// ------------------------------------------------------------------ 2. quantum enhancements
{ // the explicit flag: every center that answers check_enhancement in the original Lua declares it
  const answerers = ['j_poke_ferroseed', 'j_poke_ferrothorn', 'j_poke_shaymin_sky', 'j_poke_tinkaton', 'j_nacho_carbink'];
  const butterfly = Object.keys(P_CENTERS).find((k) => k.endsWith('butterfly_effect'));
  for (const k of answerers.concat(butterfly)) ok(P_CENTERS[k] && P_CENTERS[k].quantum_enhancements === true, 'quantum flag on ' + k);
  // ... and no registered mod center answers it without the flag (a calculate that reads check_enhancement directly)
  const missing = [];
  for (const m of Object.values(MODS)) for (const list of Object.values(m.content || {})) {
    if (!Array.isArray(list)) continue;
    for (const c of list) if (c && typeof c.calculate === 'function' && String(c.calculate).includes('check_enhancement') && !c.quantum_enhancements) missing.push(c.key);
  }
  ok(missing.length === 0, 'no unflagged check_enhancement answerer', missing);
}
{ // a center without the flag is never asked, whatever its source says
  start('POLISH_QFLAG', {}, { mods: ALL });
  add('j_poke_ferrothorn');
  const [w] = hand(['H_5'], { center: 'm_wild' });
  ok(quantum_enhancements(w).includes('m_steel'), 'Ferrothorn: a Wild card is also Steel');
  const c = P_CENTERS.j_poke_ferrothorn;
  delete c.quantum_enhancements;
  try { ok(quantum_enhancements(w).length === 0, 'without the flag, Ferrothorn is not asked'); } finally { c.quantum_enhancements = true; }
}
{ // Steel Joker counts quantum Steel cards (SMODS fixes.toml: SMODS.has_enhancement(v, 'm_steel'))
  start('POLISH_STEEL', {}, { mods: ALL });
  add('j_poke_ferrothorn');
  const sj = add('j_steel_joker');
  let n = 0;
  for (const c of G.playing_cards) if (n < 5 && c.area === G.deck) { c.set_ability(P_CENTERS.m_wild, null, true); n++; }
  const r = play(hand(['S_2']));
  ok(sj.ability.steel_tally === 5 && Math.abs(r.total.mult - 2) < 1e-9, 'Steel Joker: 5 quantum Steel cards -> X2', [sj.ability.steel_tally, r.total]);
}
{ // Golden Ticket pays for a quantum Gold card (Nacho's Carbink: rankless cards are Gold)
  start('POLISH_TICKET', {}, { mods: ALL });
  add('j_nacho_carbink');
  add('j_ticket');
  const d0 = G.GAME.dollars;
  play(hand(['S_A'], { center: 'm_stone' }));
  flush();
  ok(G.GAME.dollars - d0 === 4, 'Golden Ticket: a quantum Gold (Stone) card pays $4', G.GAME.dollars - d0);
}
{ // Glass Joker counts a quantum Glass card the Hanged Man destroys (Tinkaton: Steel cards are Glass)
  start('POLISH_GLASS', {}, { mods: ALL });
  add('j_poke_tinkaton');
  const gj = add('j_glass');
  const hm = add('c_hanged_man');
  const [s] = hand(['S_9'], { center: 'm_steel' });
  const r = act({ type: 'use', id: hm.sort_id, targets: [s.sort_id] });
  ok(Math.abs(gj.ability.x_mult - 1.75) < 1e-9, 'Glass Joker: +X0.75 for the quantum Glass card', gj.ability.x_mult);
  ok(r.events.some((e) => e.type === 'shatter'), 'the quantum Glass card shatters (SMODS.shatters)', r.events.map((e) => e.type).filter((t) => /shatter|dissolve/.test(t)));
}

// ------------------------------------------------------------------ 3. undata'd Pokermon jokers: one static path
{
  const ov = P_CENTERS.j_poke_overqwil, hq = P_CENTERS.j_poke_hisuian_qwilfish, jc = P_CENTERS.j_poke_jirachi_copy;
  ok(ov.config.extra.ptype === 'Dark' && hq.config.extra.ptype === 'Dark' && jc.config.extra.ptype === 'Metal', 'undata\'d jokers: ptype in config.extra like data.js jokers', [ov.config.extra, hq.config.extra]);
  const bad = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && c.mod === 'pokermon' && !ATLASES[c.atlas]).map((c) => c.key + ':' + c.atlas);
  ok(bad.length === 0, 'every Pokermon joker names a registered atlas', bad);
  ok(ov.atlas === 'poke_AtlasJokersBasicNatdex391' && ov.pos.x === 6 && ov.pos.y === 60, 'Overqwil: its Natdex sprite (PokemonSprites; the 3.9.1 sheet), like every other joker', [ov.atlas, ov.pos]);
  // Pokermon never shipped Hisuian Qwilfish art: Micatro's own card (real Hisuian sprite in Pokermon's
  // Dark-type frame) + a shiny twin, instead of the placeholder
  ok(hq.atlas === 'poke_hisuian_qwilfish' && hq.pos.x === 0 && hq.pos.y === 0 && ATLASES.poke_hisuian_qwilfish && /hisuian_qwilfish\.png$/.test(ATLASES.poke_hisuian_qwilfish.src)
    && ATLASES.poke_hisuian_qwilfishShiny && /hisuian_qwilfishShiny\.png$/.test(ATLASES.poke_hisuian_qwilfishShiny.src), 'Hisuian Qwilfish: its own card art (+ shiny), not the placeholder', [hq.atlas, hq.pos]);
  {
    const art = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../mods/pokermon/assets/2x/hisuian_qwilfish.png');
    if (fs.existsSync(art)) { // mod art is gitignored (deployed separately): check it when present
      const b = fs.readFileSync(art);
      ok(b.readUInt32BE(16) === 142 && b.readUInt32BE(20) === 190, 'Hisuian Qwilfish art is one 2x card cell (142x190)', [b.readUInt32BE(16), b.readUInt32BE(20)]);
    }
  }
  start('POLISH_QWIL', {}, { mods: ALL });
  const q = add('j_poke_hisuian_qwilfish');
  ok(is_type(q, 'Dark'), 'Hisuian Qwilfish is a Dark type in play');
}

// ------------------------------------------------------------------ 5. Homelatro rarities
{
  const P = RARITIES.find((r) => r.key === 'hmlt_player'), GT = RARITIES.find((r) => r.key === 'hmlt_godtier');
  ok(P.weight === 0.35 && GT.weight === 0.25 && P.badge_colour === '#53A3FF' && GT.badge_colour === '#FF6000', 'Homelatro rarities: Player 0.35 / God Tier 0.25 (Homelatro src/rarity.lua)', [P.weight, GT.weight]);
  start('POLISH_HMLT', {}, { mods: ALL });
  ok(P.get_weight(P) === 0.35 && GT.get_weight(GT) === 0, 'all Players alive: Player rolls, God Tier does not');
  G.GAME.pool_flags.thac_nekogloop_extinct = true;
  ok(GT.get_weight(GT) === 0.25, 'a Player went extinct: God Tier rolls');
  const kh = add('j_thac_hmlt_knightofheart');
  ok(GT.get_weight(GT) === 0, 'its God Tier held (no Showman): God Tier stops rolling');
  kh.remove(); flush();
  G.GAME.pool_flags.thac_autumnmood_extinct = true; G.GAME.pool_flags.thac__extinct = true;
  ok(P.get_weight(P) === 0, 'every Player extinct: Player stops rolling');
}

// ------------------------------------------------------------------ 6a. Xatu: Celestial packs (Pokermon 3.9.1 dropped the all-Planets patch)
{
  start('POLISH_XATU', {}, { mods: ['pokermon'] });
  add('j_poke_xatu');
  toShop(); G.GAME.dollars = 100;
  // open a Celestial pack from the shop slot
  G.shop_booster.cards[0].set_ability(P_CENTERS.p_celestial_normal_1, null, true);
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  flush();
  const got = G.pack_cards.cards.map(key);
  ok(got.length === 3 && got.every((k) => P_CENTER_POOLS.Planet.some((p) => p.key === k)), 'Xatu: a Celestial pack holds its normal 3 Planets, not every Planet (Pokermon 3.9.1)', got);
}

// ------------------------------------------------------------------ 6b. previous-evolution win stickers
{
  start('POLISH_FAMWIN', {}, { mods: ['pokermon'] });
  const ivy = add('j_poke_ivysaur');
  ok(family_win_keys(ivy).join() === 'j_poke_bulbasaur', 'Ivysaur also wins for Bulbasaur (not Venusaur)', family_win_keys(ivy));
  const vile = add('j_poke_vileplume');
  const vk = family_win_keys(vile);
  ok(vk.includes('j_poke_oddish') && vk.includes('j_poke_gloom') && !vk.includes('j_poke_bellossom'), 'Vileplume: Oddish + Gloom, not the other branch (Bellossom)', vk);
  // the run's win reports the stickers
  G.GAME.win_ante = 1;
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  const r = winRound();
  const win = r.events.find((e) => e.type === 'win');
  ok(win && win.jokers.includes('j_poke_ivysaur') && win.jokers.includes('j_poke_bulbasaur') && !win.jokers.includes('j_poke_venusaur') && win.stake === G.GAME.stake,
    "the win event lists each joker's key + its previous evolutions, with the stake", win);
}
{
  start('POLISH_FAMWIN_OFF', { previous_evo_stickers: false }, { mods: ['pokermon'] });
  const ivy = add('j_poke_ivysaur');
  ok(family_win_keys(ivy).length === 0, 'previous_evo_stickers off: no family stickers');
}
done();
