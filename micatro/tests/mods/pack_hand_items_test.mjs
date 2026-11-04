// pack_hand_items_test.mjs — every consumable that targets selected hand cards can be used from INSIDE a
// hand-dealing pack (vanilla Arcana / Spectral, and every mod's draw_hand pack: Pokermon's Pocket packs,
// Bunco's Virtual, MoreFluff's Rotarot, Sylvie's themed packs, AutumnCircus' Option Select), against the
// dealt hand, opened from the shop, exactly as in a round. Real Balatro deals your hand for these packs so
// The Magician (or Pokermon's Moon Stone) works there; a tester reported a Pocket-pack item they "couldn't
// get to work in the shop".
// For each mod (and vanilla): every consumable is checked in the consumable slots during a round (the
// baseline: which selection sizes 0..5 it accepts) and then in each hand-dealing pack with the same hand;
// a hand-targeting one (refused with nothing picked, accepted with some) must accept the same selections in
// the pack and its Use action must go through. Covers micatro/js/engine/consumables.js (can_use_consumeable,
// Card:open), run.js ('highlight' / 'use' in packs) and the mods' consumables + boosters.
//   node micatro/tests/mods/pack_hand_items_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, create_card, create_playing_card } from '../../js/engine/core.js';
import { newRun, act, STATES, STATE_NAMES } from '../../js/engine/run.js';
import { loadMods, AVAILABLE, withRequirements } from '../../js/mods/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const flush = () => G.E_MANAGER.flush();
const HAND_PACKS = [STATES.TAROT_PACK, STATES.SPECTRAL_PACK, STATES.MOD_PACK_HAND];
const FIXED = ['S_A', 'S_K', 'S_Q', 'H_A', 'H_K', 'D_7', 'D_7', 'C_2'];

function fixedHand() {
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  G.hand.highlighted.length = 0;
  for (const k of FIXED) create_playing_card({ front: P_CARDS[k], center: P_CENTERS.c_base }, G.hand);
}
function startRound(mods, seed) {
  newRun({ seed, back: 'b_red', mods });
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  flush();
  return act({ type: 'select_blind' }).ok && G.STATE === STATES.SELECTING_HAND;
}
function toShop() {
  fixedHand();
  G.GAME.blind.chips = 1;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  act({ type: 'play' });
  for (let i = 0; i < 5 && G.STATE !== STATES.ROUND_EVAL; i++) flush();
  if (G.STATE !== STATES.ROUND_EVAL) return false;
  act({ type: 'cash_out' });
  return G.STATE === STATES.SHOP;
}
function openPack(key) {
  G.GAME.dollars = 1000;
  const p = create_card('Booster', G.shop_booster, null, null, null, null, key);
  G.shop_booster.emplace(p); flush();
  const r = act({ type: 'buy', id: p.sort_id });
  return r.ok && HAND_PACKS.includes(G.STATE);
}
const place = (key, area) => { const c = create_card(P_CENTERS[key].set, area, null, null, true, true, key, 'phi'); area.emplace(c); flush(); return c; };
/** can_use with the first k fixed hand cards picked, k = 0..5 -> '011000' */
function usable(c) {
  let s = '';
  for (let k = 0; k <= 5; k++) {
    G.hand.unhighlight_all();
    act({ type: 'highlight', ids: G.hand.cards.slice(0, k).map((x) => x.sort_id) });
    let u; try { u = c.can_use_consumeable() ? '1' : '0'; } catch (e) { u = 'E'; }
    s += u;
  }
  G.hand.unhighlight_all();
  return s;
}
const isConsumable = (cc) => cc && cc.key && cc.key.startsWith('c_') && cc.set !== 'Booster' && (cc.consumeable || ['Tarot', 'Spectral', 'Planet'].includes(cc.set) || cc.mod);

const runs = [[null, []], ...AVAILABLE.map((m) => [m.id, withRequirements([m.id])])];
const found = {};
for (const [id, mods] of runs) {
  if (mods.length) await loadMods(mods);
  const tag = id || 'vanilla';
  if (!startRound(mods, 'PACKHAND' + tag)) { ok(false, tag + ': reached a round'); continue; }
  const vanilla = Object.values(P_CENTERS).filter((cc) => !cc.mod && isConsumable(cc) && ['Tarot', 'Spectral'].includes(cc.set)).map((cc) => cc.key);
  const own = id ? Object.values(P_CENTERS).filter((cc) => cc.mod === id && isConsumable(cc)).map((cc) => cc.key) : [];
  // the hand-dealing packs and what may be in them (a superset: vanilla Tarot/Spectral + the mod's consumables)
  const packs = [];
  const ownTS = own.filter((k) => ['Tarot', 'Spectral'].includes(P_CENTERS[k].set));
  if (!id) packs.push(['p_arcana_normal_1', vanilla], ['p_spectral_normal_1', vanilla.filter((k) => P_CENTERS[k].set === 'Spectral')]);
  else if (ownTS.length) packs.push(['p_arcana_normal_1', ownTS], ['p_spectral_normal_1', ownTS.filter((k) => P_CENTERS[k].set === 'Spectral')]);
  for (const b of Object.values(P_CENTERS)) if (id && b.set === 'Booster' && b.mod === id && b.draw_hand) packs.push([b.key, [...vanilla, ...own]]);
  if (!packs.length) continue;
  // baseline: in the consumable slots during a round, same hand
  const base = {};
  for (const key of new Set(packs.flatMap((p) => p[1]))) {
    fixedHand();
    let c; try { c = place(key, G.consumeables); } catch (e) { continue; }
    base[key] = usable(c);
    c.remove(); flush();
  }
  const handTargeting = (s) => s && s[0] === '0' && s.slice(1).includes('1');
  if (!toShop()) { ok(false, tag + ': reached the shop'); continue; }
  for (const [pk, keys] of packs) {
    const targets = keys.filter((k) => handTargeting(base[k]));
    if (!targets.length) continue;
    let opened = openPack(pk);
    ok(opened && G.hand.cards.length > 0, `${tag}: ${pk} opens from the shop as a hand-dealing pack and deals the hand`, { state: STATE_NAMES[G.STATE], hand: G.hand.cards.length });
    if (!opened) continue;
    for (const key of targets) {
      if (!HAND_PACKS.includes(G.STATE)) {
        // the last use closed the pack (or moved on): back to a shop and open it again
        if (G.STATE !== STATES.SHOP && !(startRound(mods, 'PACKHAND' + tag + key) && toShop())) { ok(false, `${tag}: back to the shop before ${key}`); break; }
        if (!openPack(pk)) { ok(false, `${tag}: reopen ${pk}`); break; }
      }
      fixedHand();
      // (an empty consumable row: Pokermon's held items — Thick Club, Metal Coat… — are kept on use and, as in
      // Pokermon, refuse to be used from a pack while the slots are full; earlier uses here fill them)
      for (const x of G.consumeables.cards.slice()) x.remove();
      flush();
      G.GAME.pack_choices = 99;
      const c = place(key, G.pack_cards);
      const inPack = usable(c);
      ok(inPack === base[key], `${tag}: ${key} accepts the same hand selections inside ${pk} as in a round`, { round: base[key], pack: inPack, state: STATE_NAMES[G.STATE] });
      const k = base[key].indexOf('1');
      let r; try { r = act({ type: 'use', id: c.sort_id, targets: G.hand.cards.slice(0, k).map((x) => x.sort_id) }); } catch (e) { r = { ok: false, error: 'threw ' + e.message }; }
      flush();
      ok(r.ok && c.area !== G.pack_cards, `${tag}: ${key} is used from inside ${pk} on ${k} picked hand card(s)`, r.error);
      (found[pk] = found[pk] || []).push(key);
    }
    if (HAND_PACKS.includes(G.STATE)) act({ type: 'skip_booster' });
  }
}
const total = Object.values(found).reduce((n, l) => n + l.length, 0);
console.log(`hand-targeting consumables checked inside packs: ${total} (pack: count) ` + Object.entries(found).map(([p, l]) => `${p}:${l.length}`).join(' '));
ok(total >= 150 && (found.p_poke_pokepack_normal_1 || []).includes('c_poke_moonstone') && (found.p_arcana_normal_1 || []).includes('c_magician'),
  'the sweep covered Moon Stone in a Pocket pack, The Magician in an Arcana pack and the other mods\' packs', found);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
