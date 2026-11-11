// Pokermon: a Mega Stone used straight from a pack still remembers its Mega (a tester, 2026-11-08: "Sold my mega stone but the
// Charizard is still mega" - Ghost Deck + Fire Sleeve run, Ante 7, a Polychrome Mega Charizard Y with 3 Energy).
//   - Root cause: a keep_on_use card used from a pack moves to the consumable slots afterwards (run.js use_card: add_to_deck + emplace),
//     and the stone's add_to_deck (meant for a NEW stone: "forget any Mega") wiped the used_on it had just set (and made it usable again).
//     The stone then no longer knew its Mega, so selling it reverted nothing.
//   - From rulesRev 110 (MEGASTONE_PACK_REV) that move keeps used_on / usable; a run recorded before r110 replays as recorded (fixture:
//     micatro/tests/fixtures/pokermon_megastone_pack_r109_recipe.json, the tester's run through the sale).
//   - Unchanged: the stone reserved / bought first, then used, reverts on sale (and after a save / resume), with an edition and Energy on
//     the Mega; a Mega Berry Juice Mega is permanent (no stone remembers it).
//   node micatro/tests/mods/pokermon_megastone_pack_test.mjs
import { readFileSync } from 'fs';
import { T, add, G, P_CENTERS, act } from './poke_helpers.mjs';
import { Card, P_CARDS } from '../../js/engine/core.js';
import { newRun, STATES } from '../../js/engine/run.js';
import { Session } from '../../js/engine/session.js';
import * as PINS from '../../js/mods/pins.js';
import * as P from '../../mods/pokermon/api.js';
const { MEGASTONE_PACK_REV, energy_increase } = P;
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const flush = () => G.E_MANAGER.flush();
const sec = (fn) => { try { fn(); } catch (e) { ok(false, 'threw: ' + String(e && e.stack).slice(0, 400)); } };
const MODS3 = ['pokermon', 'nacho', 'pokermonplus'];

/** Open a free Spectral Pack whose first card is a Mega Stone (test setup: placed, not rolled). */
function packWithStone() {
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS.p_spectral_normal_1);
  G.shop_booster.emplace(b);
  b.cost = 0; G.GAME.dollars = Math.max(G.GAME.dollars, 50);
  const r = act({ type: 'buy', id: b.sort_id }); flush();
  const first = G.pack_cards.cards[0];
  first.remove();
  const st = new Card(P_CARDS.empty, P_CENTERS.c_poke_megastone);
  G.pack_cards.emplace(st);
  return [r, st];
}
/** A Polychrome Charizard with 3 Fire Energy, rightmost (behind a Magmar), so a Mega Stone makes Mega Charizard Y. */
function charizard() {
  add('j_poke_magmar');
  const j = add('j_poke_charizard', 'polychrome');
  for (let i = 0; i < 3; i++) energy_increase(j, 'Fire');
  flush();
  return j;
}
const toShop = () => { G.STATE = STATES.SHOP; G.GAME.STOP_USE = 0; };

ok(Number.isInteger(MEGASTONE_PACK_REV) && PINS.rulesRev('pokermon') >= MEGASTONE_PACK_REV, 'the current rules include the pack fix (MEGASTONE_PACK_REV)', [MEGASTONE_PACK_REV, PINS.rulesRev('pokermon')]);

// ---------------------------------------------------- used straight from a pack, then sold
sec(() => {
  newRun({ seed: 'MSPACK', back: 'b_red', mods: MODS3, modOptions: { pokermon: {} } });
  toShop();
  const j = charizard();
  const [r, st] = packWithStone();
  ok(r.ok && G.pack_cards.cards.includes(st), 'a Spectral Pack opens with a Mega Stone in it', r.error);
  const u = act({ type: 'use', id: st.sort_id, joker_targets: [j.sort_id] }); flush();
  ok(u.ok && key(j) === 'j_poke_mega_charizard_y' && j.edition && j.edition.polychrome, 'used from the pack: Charizard Mega Evolves (Polychrome kept)', [u.error, key(j)]);
  ok(G.consumeables.cards.includes(st), 'the kept stone moves to the consumable slots');
  ok(st.ability.extra.used_on === j.unique_val, 'the stone still remembers its Mega after the move (used_on = the Mega\'s unique_val)', [st.ability.extra.used_on, j.unique_val]);
  ok(st.ability.extra.usable === false, 'and is spent until the end of the round (not made usable again by the move)', st.ability.extra.usable);
  if (G.STATE !== STATES.SHOP) { act({ type: 'skip_booster' }); flush(); }
  toShop();
  const sold = act({ type: 'sell', id: st.sort_id }); flush();
  ok(sold.ok && key(j) === 'j_poke_charizard', 'selling that stone reverts the Mega to Charizard', [sold.error, key(j)]);
  ok(key(j) === 'j_poke_charizard' && j.edition && j.edition.polychrome && (j.ability.extra.energy_count || 0) === 3, 'the reverted Charizard keeps its edition and Energy', [j.edition, j.ability.extra.energy_count]);
});

// ---------------------------------------------------- reserved / held first, then used: unchanged (and after save / resume)
sec(() => {
  newRun({ seed: 'MSHELD', back: 'b_red', mods: MODS3, modOptions: { pokermon: {} } });
  toShop();
  const j = charizard();
  const st = add('c_poke_megastone');
  act({ type: 'use', id: st.sort_id, joker_targets: [j.sort_id] }); flush();
  ok(key(j) === 'j_poke_mega_charizard_y' && st.ability.extra.used_on === j.unique_val, 'a held stone: Mega Charizard Y, remembered');
  act({ type: 'sell', id: st.sort_id }); flush();
  ok(key(j) === 'j_poke_charizard', 'a held stone sold: the Mega reverts');
});

// ---------------------------------------------------- the Mega Berry Juice: permanent (no stone remembers it)
sec(() => {
  newRun({ seed: 'MSJUICE', back: 'b_red', mods: MODS3, modOptions: { pokermon: {} } });
  toShop();
  const j = charizard();
  const juice = add('c_poke_berry_juice_mega');
  const u = act({ type: 'use', id: juice.sort_id, joker_targets: [j.sort_id] }); flush();
  ok(u.ok && /^j_poke_mega_charizard_/.test(key(j)), 'Mega Berry Juice: Charizard Mega Evolves', [u.error, key(j)]);
  const st = add('c_poke_megastone');
  ok(st.ability.extra.used_on === undefined, 'a new stone remembers nothing');
  act({ type: 'sell', id: st.sort_id }); flush();
  ok(/^j_poke_mega_charizard_/.test(key(j)), 'selling an unrelated stone leaves the Berry Juice Mega a Mega', key(j));
});

// ---------------------------------------------------- the tester's run (recorded on r109): replays as recorded; on current rules it reverts
sec(() => {
  const FIX = JSON.parse(readFileSync(new URL('../fixtures/pokermon_megastone_pack_r109_recipe.json', import.meta.url), 'utf8'));
  const last = FIX.actions[FIX.actions.length - 1], used = FIX.actions[FIX.actions.length - 2];
  ok(FIX.modVersions.pokermon === '3.9.1+r109' && last.type === 'sell' && used.type === 'use' && used.id === last.id,
    'the fixture: recorded on 3.9.1+r109, ends using a pack Mega Stone and selling it', [FIX.modVersions.pokermon, used, last]);
  // the recorded run: the stone forgot its Mega, so the sale left Mega Charizard Y (never retroactive)
  const s = Session.fromRecipe(JSON.parse(JSON.stringify(FIX))); flush();
  const zard = () => G.jokers.cards.find((c) => /charizard/.test(key(c)));
  ok(!s.stoppedAt && s.recipe.actions.length === FIX.actions.length, 'the r109 recipe replays to the end', s.stoppedAt);
  ok(zard() && key(zard()) === 'j_poke_mega_charizard_y' && zard().edition && zard().edition.polychrome, 'r109 rules: the sold stone leaves the Polychrome Mega Charizard Y (as recorded)', zard() && key(zard()));
  // the same moves on current rules (as if recorded today): the stone keeps its Mega through the pack move, and the sale reverts it
  const asNew = { ...JSON.parse(JSON.stringify(FIX)), modVersions: { ...FIX.modVersions, pokermon: PINS.modPin('pokermon') } };
  const s2 = Session.fromRecipe(asNew); flush();
  ok(!s2.stoppedAt && zard() && key(zard()) === 'j_poke_charizard', 'current rules: the same sale reverts it to Charizard', [s2.stoppedAt, zard() && key(zard())]);
  // save / resume: the current-rules recipe up to the use, resumed, then the sale played live
  const upToUse = { ...asNew, actions: asNew.actions.slice(0, -1) };
  const s3 = Session.fromRecipe(JSON.parse(JSON.stringify(upToUse))); flush();
  const stone = G.consumeables.cards.find((c) => key(c) === 'c_poke_megastone');
  ok(stone && zard() && stone.ability.extra.used_on === zard().unique_val && key(zard()) === 'j_poke_mega_charizard_y', 'resumed after the pack use: the stone remembers the Mega', stone && stone.ability.extra);
  const r = s3.act(last); flush();
  ok(r.ok && key(zard()) === 'j_poke_charizard', 'resumed, then sold: the Mega reverts', [r.error, zard() && key(zard())]);
  const s4 = Session.fromRecipe(JSON.parse(JSON.stringify(s3.recipe))); flush();
  ok(!s4.stoppedAt && key(zard()) === 'j_poke_charizard', 'and that resumed recipe replays to Charizard', s4.stoppedAt);
});

done();
