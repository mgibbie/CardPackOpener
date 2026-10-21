// Nuzlocke + Monotype run badges (mods/pokermon/systems/runbadges.js): the shop-window rule, every way of
// gaining a joker (shop, pack, tag, Great Ball), evolution / destroy / sell, the Monotype type lock + Tera,
// the win's earned badges, seeded / challenge eligibility, non-Pokermon runs, and save/resume.
//   node micatro/tests/mods/runbadges_test.mjs
import { T, start, hand, add, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_card, copy_card } from '../../js/engine/core.js';
import { newRun, get_poker_hand_info } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { allChallenges } from '../../js/engine/challenge.js';
import { poke_evolve } from '../../mods/pokermon/systems/evolution.js';
import { apply_type_sticker, get_type } from '../../mods/pokermon/systems/types.js';
import { playRun } from '../replay_bot.mjs';
import '../../mods/nacho/index.js'; // (Mega Audino's Mystery Egg)

const { ok, done } = T();
const RB = () => G.GAME.run_badges;
const RV = () => toView().run_badges;
const badgeEvents = (r) => (r.events || []).filter((e) => e.type === 'run_badge');

/** An unseeded Pokermon run waiting at the first blind select (eligible for the badges). */
function fresh() {
  newRun({ seed: 'RBFRESH1', seeded: false, back: 'b_red', mods: ['pokermon'] }); // (a fixed seed, still unseeded: eligible)
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; // (as poke_helpers.start: a harmless boss)
}
/** Put a joker for sale in the shop and buy it -> the act result. */
function buy(key, tera) {
  const c = create_card('Joker', G.shop_jokers, null, null, null, null, key);
  if (tera) apply_type_sticker(c, tera); // (arrives already Tera'd: Luminous deck-style)
  G.shop_jokers.emplace(c);
  G.GAME.dollars = 1000;
  return act({ type: 'buy', id: c.sort_id });
}
/** From the blind select: play the blind, cash out -> the shop (a new window). */
function toShop() {
  if (G.STATE === STATES.BLIND_SELECT) { act({ type: 'select_blind' }); clearHand(); }
  winRound();
  act({ type: 'cash_out' });
}
/** From the shop: next round + its blind's shop. */
function nextShop() { act({ type: 'next_round' }); toShop(); }
const keyOf = (c) => c.config.center.key;
const joker = (k) => G.jokers.cards.find((c) => keyOf(c) === k);

// ======================================================== eligibility + basics
fresh();
ok(G.GAME.seeded === false && RV() && RV().eligible === true, 'an unseeded Pokermon run is eligible', RV());
ok(RB().nuz && RB().mono && RB().type === null && RB().ready === true, 'starts intact, no type, ready at the first blind select', RB());
start('SEEDED', {}, { noBlind: true });
ok(RV().eligible === false, 'a seeded run is not eligible (like the win stickers)');
newRun({ seed: 'VANILLA' });
ok(toView().run_badges === undefined && G.GAME.run_badges === undefined, 'a run without Pokermon has no run badges at all');

// ======================================================== Nuzlocke: one new joker per window
fresh();
toShop();
const w1 = RB().window;
let r = buy('j_poke_charmander');
ok(r.ok && RB().nuz && RB().window_gains === 1, 'buy 1 in a shop: still a Nuzlocke', RB());
ok(RB().type === null, 'Monotype does not lock on a buy (only at a blind start)', RB().type);
r = buy('j_poke_vulpix');
ok(!RB().nuz && /2nd new joker this shop/.test(RB().nuz_reason) && RB().window === w1, 'buy 2 in one shop: Nuzlocke broken', RB());
ok(badgeEvents(r).length === 1 && badgeEvents(r)[0].badge === 'nuz', 'the break emits one run_badge event (the toast)', badgeEvents(r));
ok(RB().mono, 'two Fire jokers: still Monotype');
ok(RV().nuz === false && RV().mono === true && RV().nuz_reason === RB().nuz_reason, 'the view carries the status + reason');

// one per window, over several windows
fresh();
toShop(); buy('j_poke_charmander');
nextShop(); buy('j_poke_vulpix');
nextShop(); buy('j_poke_growlithe');
ok(RB().nuz && RB().gains === 3 && RB().window_gains === 1, 'one joker in each of three shops: still a Nuzlocke', RB());

// a pack joker + a bought joker in one shop
fresh();
toShop();
{
  const p = create_card('Booster', G.shop_booster, null, null, null, null, 'p_buffoon_normal_1');
  G.shop_booster.emplace(p);
  G.GAME.dollars = 1000;
  act({ type: 'buy', id: p.sort_id });
  const pick = G.pack_cards.cards.find((c) => c.ability.set === 'Joker');
  ok(G.STATE === STATES.BUFFOON_PACK && pick, 'a Buffoon pack opened in the shop');
  act({ type: 'use', id: pick.sort_id });
  ok(RB().nuz && RB().window_gains === 1, 'a pack joker counts as the window\'s one', RB());
  if (G.STATE !== STATES.SHOP) act({ type: 'skip_booster' });
  buy('j_poke_charmander');
  ok(!RB().nuz, 'a pack joker + a bought joker in one shop: broken', RB());
}

// a tag joker counts (Top-up on a skip), and a Great Ball in the same window breaks it
fresh();
{
  G.jokers.config.card_limit = 1; // room for one: Top-up makes exactly one
  G.GAME.round_resets.blind_tags.Small = 'tag_top_up';
  act({ type: 'skip_blind' });
  ok(G.jokers.cards.length === 1 && RB().window_gains === 1 && RB().nuz, 'a Top-up tag joker counts as the window\'s one', [G.jokers.cards.length, RB()]);
  G.jokers.config.card_limit = 5;
  const ball = add('c_poke_greatball');
  r = act({ type: 'use', id: ball.sort_id });
  ok(r.ok && G.jokers.cards.length === 2, 'a Great Ball made a joker', r.error);
  ok(!RB().nuz && /2nd new joker/.test(RB().nuz_reason), 'tag joker + Great Ball joker in one window: broken', RB());
}

// a Great Ball's joker counts on its own; jokers gained during a blind are that window's
fresh();
act({ type: 'select_blind' }); clearHand();
{
  const ball = add('c_poke_greatball');
  act({ type: 'use', id: ball.sort_id });
  ok(RB().window_gains === 1 && RB().gains === 1 && RB().nuz, 'Great Ball during a blind: one new joker (its window\'s one)', RB());
  winRound(); act({ type: 'cash_out' });
  buy('j_poke_charmander');
  ok(!RB().nuz, '... so buying one in the shop after that blind is the 2nd in the window', RB());
}

// evolution is not a new joker
fresh();
toShop();
buy('j_poke_charmander');
{
  const c = joker('j_poke_charmander');
  poke_evolve(c, 'j_poke_charmeleon', true);
  G.E_MANAGER.flush();
  ok(keyOf(c) === 'j_poke_charmeleon' && G.jokers.cards.length === 1, 'Charmander evolved in place');
  ok(RB().nuz && RB().gains === 1 && RB().window_gains === 1, 'evolution is not a new joker', RB());
  // (a queued, animated evolution too)
  poke_evolve(c, 'j_poke_charizard');
  G.E_MANAGER.flush();
  ok(keyOf(c) === 'j_poke_charizard' && RB().nuz && RB().gains === 1, 'a queued evolution is not a new joker either', RB());
}

// selling breaks it; destroying doesn't
fresh();
toShop();
buy('j_poke_charmander');
{
  const c = joker('j_poke_charmander');
  nextShop();
  r = act({ type: 'sell', id: c.sort_id });
  ok(r.ok && !RB().nuz && RB().nuz_reason === 'sold Charmander', 'selling a joker breaks the Nuzlocke ("sold Charmander")', RB().nuz_reason);
  ok(badgeEvents(r).some((e) => e.badge === 'nuz' && e.reason === 'sold Charmander'), 'the sell emits the break event');
  ok(RB().mono, 'selling does not touch Monotype');
}
fresh();
toShop();
buy('j_poke_charmander');
{
  const c = joker('j_poke_charmander');
  const nm = add('c_poke_nightmare');
  r = act({ type: 'use', id: nm.sort_id, joker_targets: [c.sort_id] });
  ok(r.ok && !G.jokers.cards.includes(c), 'Nightmare destroyed the joker', r.error);
  ok(RB().nuz, 'a joker destroyed by Nightmare does not break the Nuzlocke', RB());
}
fresh();
toShop();
buy('j_ceremonial', 'Fire'); // (a Tera'd base joker has a type, so it is allowed)
nextShop();
buy('j_poke_charmander');
{
  const victim = joker('j_poke_charmander');
  act({ type: 'next_round' });
  act({ type: 'select_blind' }); // Ceremonial Dagger eats the joker to its right
  G.E_MANAGER.flush();
  ok(!G.jokers.cards.includes(victim), 'Ceremonial Dagger ate the joker to its right');
  ok(RB().nuz, 'a joker eaten by another does not break the Nuzlocke', RB());
}
fresh();
toShop();
buy('j_poke_charmander');
joker('j_poke_charmander').start_dissolve(); // (perishable expiry / fainting go this way)
ok(RB().nuz, 'start_dissolve (destroyed) is not a sell');

// ======================================================== Monotype (checked only when a blind starts)
const warns = (r) => (r.events || []).filter((e) => e.type === 'run_badge_warn');
fresh();
toShop(); r = buy('j_poke_squirtle');
ok(RB().type === null && RB().mono && joker('j_poke_squirtle').ability.rb_type === 'Water', 'buying a joker stores its gained type (Water) but locks nothing yet', [RB().type, joker('j_poke_squirtle').ability.rb_type]);
nextShop();
ok(RB().type === 'Water' && RB().mono, 'the first blind started with a joker locks the type (Water)', RB());
buy('j_poke_psyduck');
nextShop();
ok(RB().mono, 'another Water joker kept into a round: still Monotype');
// an off-type joker sold before the blind: intact
r = buy('j_poke_charmander');
ok(RB().mono && warns(r).length === 1 && /Sell off-type jokers/.test(warns(r)[0].text), 'buying an off-type joker does not break it; the shop warns once', warns(r));
ok(RV().mono_at_risk === true, 'the view flags the Monotype as at risk');
r = act({ type: 'reroll_shop' });
ok(warns(r).length === 0, '... once per shop (a reroll does not repeat it)');
r = act({ type: 'sell', id: joker('j_poke_charmander').sort_id });
ok(RB().mono && RV().mono_at_risk === false, 'sold before the blind: no longer at risk', RV());
ok(!RB().nuz, '(a sell still breaks the Nuzlocke, as intended)');
nextShop();
ok(RB().mono && RB().type === 'Water', 'off-type joker sold before the blind: Monotype intact', RB());
// kept into the round: broken at the blind start
fresh();
toShop(); buy('j_poke_squirtle');
nextShop(); buy('j_poke_charmander');
ok(RB().mono, 'an off-type joker in the row: not broken yet');
act({ type: 'next_round' });
r = act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Charmander (Fire) in a Water run', 'kept into the round: broken at the blind start', RB().mono_reason);
ok(badgeEvents(r).some((e) => e.badge === 'mono'), 'the Monotype break emits its event (the toast)');
// the first lock: every joker in the row must share one type
fresh();
toShop(); buy('j_poke_squirtle');
act({ type: 'next_round' });
{
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_charmander');
  c.add_to_deck(); G.jokers.emplace(c);
}
act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && /^started a round with Charmander \(Fire\) in a Water run$/.test(RB().mono_reason), 'two types in the row at the first lock: broken', RB().mono_reason);

// ======================================================== Monotype is checked when the round BEGINS (owner rule 2026-10-21)
// After every blind-select effect: the setting_blind loop, blind_calculate and their queued destroys (tester Jack: his
// Scyther sliced a non-Pokémon joker at blind select, yet Monotype broke on it — the check ran before the slice).
const ids = () => G.jokers.cards.map((c) => c.sort_id);
fresh();
toShop(); buy('j_poke_bulbasaur');
nextShop();
ok(RB().type === 'Grass' && RB().mono, '(slice) Bulbasaur locks Grass', RB());
buy('j_poke_scyther');
r = buy('j_joker'); // (Bulbasaur, Scyther, Joker: Scyther slices the Joker at the next blind select)
ok(G.jokers.cards.map(keyOf).join(',') === 'j_poke_bulbasaur,j_poke_scyther,j_joker', '(slice) the row: Bulbasaur, Scyther, Joker', G.jokers.cards.map(keyOf));
ok(warns(r).length === 0 && RV().mono_at_risk === false, '(slice) a joker Scyther will slice is not warned about / not at risk', [warns(r), RV().mono_at_risk]);
{
  const [b, sc, jk] = ids();
  r = act({ type: 'reorder', area: 'jokers', ids: [b, jk, sc] });
  ok(r.ok && RV().mono_at_risk === true && warns(r).length === 1, "(slice) moved out of Scyther's reach: at risk, and the shop warns", [r.error, RV().mono_at_risk, warns(r)]);
  act({ type: 'reorder', area: 'jokers', ids: [b, sc, jk] });
  ok(RV().mono_at_risk === false, "(slice) moved back to Scyther's right: no longer at risk", RV().mono_at_risk);
}
{
  const victim = joker('j_joker');
  act({ type: 'next_round' });
  r = act({ type: 'select_blind' });
  ok(r.ok && !G.jokers.cards.includes(victim) && G.jokers.cards.length === 2, '(slice) Scyther sliced the Joker at blind select', G.jokers.cards.map(keyOf));
  ok(RB().mono && RB().type === 'Grass' && RB().mono_reason === '', "(slice) a joker destroyed at blind select does not break Monotype (Jack's Grass run)", RB());
  ok(!badgeEvents(r).some((e) => e.badge === 'mono'), '(slice) no Monotype break event', badgeEvents(r));
  ok(RB().checked_window === RB().window, '(slice) the round was checked (its first hand was dealt)', RB());
  clearHand(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(RB().mono && RB().type === 'Grass', '(slice) ... and the next round is still Monotype (Grass)', RB());
}
// Ceremonial Dagger (a Grass Tera) slicing an off-type Pokémon at blind select: intact too
fresh();
toShop(); buy('j_poke_oddish');
nextShop(); buy('j_ceremonial', 'Grass');
r = buy('j_poke_charmander');
ok(warns(r).length === 0 && RV().mono_at_risk === false, '(dagger) Charmander right of the Dagger: not at risk');
act({ type: 'next_round' }); act({ type: 'select_blind' });
ok(!joker('j_poke_charmander') && RB().mono && RB().type === 'Grass', '(dagger) the Dagger ate Charmander at blind select: Monotype intact', [G.jokers.cards.map(keyOf), RB()]);
// an Eternal joker can't be sliced: still at risk, and kept into the round it breaks Monotype
fresh();
toShop(); buy('j_poke_bulbasaur');
nextShop(); buy('j_poke_scyther');
buy('j_joker'); joker('j_joker').set_eternal(true);
ok(RV().mono_at_risk === true, '(eternal) an Eternal joker right of Scyther is still at risk', RV().mono_at_risk);
act({ type: 'next_round' }); act({ type: 'select_blind' });
ok(joker('j_joker') && !RB().mono && RB().mono_reason === 'started a round with Joker (no type)', '(eternal) Scyther spared it: Monotype broken', RB().mono_reason);
// a joker CREATED at blind select (Riff-raff's Commons) is in the row when the round begins: checked that round
fresh();
toShop(); buy('j_poke_bulbasaur');
nextShop(); buy('j_riff_raff', 'Grass'); // (a Grass Tera'd Riff-raff: itself it matches)
G.jokers.config.card_limit = 3; // (room for exactly one Common)
act({ type: 'next_round' });
ok(RB().mono && RB().type === 'Grass' && RV().mono_at_risk === false, '(riff-raff) Bulbasaur + Grass Riff-raff: intact, not at risk before the blind', RB());
{
  const before = new Set(G.jokers.cards);
  r = act({ type: 'select_blind' });
  const made = G.jokers.cards.filter((c) => !before.has(c));
  const off = made.find((c) => c.ability.rb_type !== 'Grass' && c.ability.rb_type !== 'any');
  ok(r.ok && made.length === 1 && off, '(riff-raff) Riff-raff made one off-type Common at blind select: ' + made.map(keyOf), made.map((c) => [keyOf(c), c.ability.rb_type]));
  ok(!RB().mono && /^started a round with .+ in a Grass run$|^started a round with .+ (no type)$/.test(RB().mono_reason), '(riff-raff) the Common made at blind select breaks Monotype in that same round: ' + RB().mono_reason, RB());
  ok(badgeEvents(r).some((e) => e.badge === 'mono'), '(riff-raff) the break is in the select_blind action (the toast)', badgeEvents(r));
}
// once per round: a joker gained after the first deal (mid-round) waits for the next round
fresh();
toShop(); buy('j_poke_bulbasaur');
nextShop();
act({ type: 'next_round' }); act({ type: 'select_blind' });
{
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_charmander');
  c.add_to_deck(); G.jokers.emplace(c);
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  r = act({ type: 'discard' }); // (a discard draws again: DRAW_TO_HAND, but not the round's first deal)
  ok(r.ok && G.STATE === STATES.SELECTING_HAND && RB().mono, '(once) an off-type joker gained mid-round + a later draw: not checked until the next round', [r.error, RB()]);
  clearHand(); winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' }); act({ type: 'select_blind' });
  ok(!RB().mono && RB().mono_reason === 'started a round with Charmander (Fire) in a Grass run', '(once) ... kept into the next round: broken then', RB().mono_reason);
}

// non-Pokémon jokers: the Nuzlocke breaks on gaining one; the Monotype only if it's kept into a round
fresh();
toShop(); r = buy('j_joker');
ok(!RB().nuz && RB().nuz_reason === 'gained a non-Pokémon joker (Joker)', 'gaining a non-Pokémon joker breaks the Nuzlocke at once', RB());
ok(RB().mono && warns(r).length === 1, '... but not the Monotype (a warning instead)', RB());
act({ type: 'next_round' });
act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Joker (no type)', 'a non-Pokémon joker kept into a round breaks the Monotype', RB().mono_reason);
fresh();
toShop(); buy('j_joker');
act({ type: 'sell', id: joker('j_joker').sort_id });
nextShop(); buy('j_poke_charmander');
nextShop();
ok(RB().mono && RB().type === 'Fire', 'a non-Pokémon joker sold before the blind: Monotype intact (Fire)', RB());
// a non-Pokémon joker made by a card mid-round (Judgement / Riff-raff style) breaks the Nuzlocke at once
fresh();
act({ type: 'select_blind' }); clearHand();
{
  const c = create_card('Joker', G.jokers, null, null, null, null, 'j_mime');
  c.add_to_deck(); G.jokers.emplace(c);
  ok(!RB().nuz && /non-Pokémon joker \(Mime\)/.test(RB().nuz_reason) && RB().mono, 'a created non-Pokémon joker (any means) breaks the Nuzlocke; the Monotype waits for the next blind', RB());
}

// evolution into ANOTHER type doesn't break Monotype: a joker counts as the type it had when gained
fresh();
toShop(); buy('j_poke_ursaring');
nextShop();
ok(RB().type === 'Colorless', 'Ursaring locks Colorless');
{
  const c = joker('j_poke_ursaring');
  poke_evolve(c, 'j_poke_ursaluna', true);
  G.E_MANAGER.flush();
  ok(keyOf(c) === 'j_poke_ursaluna' && c.ability.rb_type === 'Colorless', 'Ursaring -> Ursaluna (Earth): it keeps its gained type (Colorless)', c.ability.rb_type);
  buy('j_poke_teddiursa');
  nextShop();
  ok(RB().mono && RB().type === 'Colorless' && RB().nuz, 'Ursaluna (now Earth) starts the next round: Monotype intact', RB());
  buy('j_poke_sandshrew');
  act({ type: 'next_round' });
  act({ type: 'select_blind' }); clearHand();
  ok(!RB().mono && RB().mono_reason === 'started a round with Sandshrew (Earth) in a Colorless run', 'but an Earth joker GAINED and kept breaks it (the lock never moved)', RB().mono_reason);
}

fresh();
toShop(); buy('j_poke_charmander');
nextShop();
apply_type_sticker(joker('j_poke_charmander'), 'Water'); // a later Tera change
buy('j_poke_growlithe');
nextShop();
ok(RB().mono && RB().type === 'Fire', 'a later Tera type change does not break Monotype (or move the lock)', RB());
// a joker that arrives already Tera'd counts as its Tera type
{
  const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_squirtle');
  apply_type_sticker(c, 'Fire');
  G.shop_jokers.emplace(c);
  G.GAME.dollars = 1000;
  act({ type: 'buy', id: c.sort_id });
  nextShop();
  ok(RB().mono && c.ability.rb_type === 'Fire', 'a Squirtle with a Fire Tera sticker counts as Fire (its type when gained)', RB());
}

// ---- owner rule 2026-10-19 (tester Kyle, a Dragon run): a joker MATCHES the run's type by its gained type OR its
// current type (a Tera sticker included); a copy (Ankh, Invisible Joker) inherits its source's gained type
/** Use Ankh on the joker row (one joker in it: that one is copied) -> [act result, the new copy]. */
function ankh() {
  const before = G.jokers.cards.slice();
  const a = add('c_ankh');
  const res = act({ type: 'use', id: a.sort_id });
  G.E_MANAGER.flush();
  return [res, G.jokers.cards.find((c) => !before.includes(c))];
}
/** A Dragon-locked run in the shop: Dratini bought, a round started with it. */
function dragonRun() {
  fresh();
  toShop(); buy('j_poke_dratini');
  nextShop();
  ok(RB().type === 'Dragon' && RB().mono, 'Dratini locks Dragon', RB());
}
// (a) a Dark joker gained, then Tera'd to Dragon: it counts as Dragon (its current type)
dragonRun();
buy('j_poke_sneasel');
{
  const c = joker('j_poke_sneasel');
  ok(c.ability.rb_type === 'Dark', '(a) Sneasel was gained Dark', c.ability.rb_type);
  apply_type_sticker(c, 'Dragon');
  ok(RV().mono_at_risk === false, '(a) Tera\'d to Dragon: no longer at risk', RV());
  nextShop();
  ok(RB().mono && RB().type === 'Dragon', '(a) a Dark joker Tera\'d to Dragon starts a Dragon round: Monotype intact', RB());
}
// (b) an Ankh copy of a Tera-Dragon joker keeps its Tera and counts as Dragon
dragonRun();
buy('j_poke_sneasel');
apply_type_sticker(joker('j_poke_sneasel'), 'Dragon');
joker('j_poke_dratini').start_dissolve(); G.E_MANAGER.flush(); // (only the Sneasel left: Ankh copies it)
nextShop();
{
  const src = joker('j_poke_sneasel');
  const [res, cp] = ankh();
  ok(res.ok && cp && keyOf(cp) === 'j_poke_sneasel' && G.jokers.cards.length === 2, '(b) Ankh copied the Sneasel', res.error);
  ok(cp && cp.ability.dragon_sticker === true && cp.ability.dark_sticker === false && cp.ability.extra.ptype === 'Dragon', '(b) the copy keeps the Dragon Tera sticker (copy_card copies the ability)', cp && [cp.ability.dragon_sticker, cp.ability.extra.ptype]);
  ok(cp && cp.ability.rb_type === src.ability.rb_type, '(b) the copy inherits its source\'s gained type', cp && [cp.ability.rb_type, src.ability.rb_type]);
  ok(RV().mono_at_risk === false, '(b) the copy is not at risk');
  nextShop();
  ok(RB().mono && RB().type === 'Dragon', '(b) an Ankh copy of a Tera-Dragon joker: Monotype intact', RB());
}
// (b2) Kyle's screenshot: a Dragonite Tera'd Dark, copied by Ankh, the original re-Tera'd Earth: both still Dragon (gained)
fresh();
toShop(); buy('j_poke_dragonite');
nextShop();
{
  const src = joker('j_poke_dragonite');
  apply_type_sticker(src, 'Dark');
  const [res, cp] = ankh();
  ok(res.ok && cp && cp.ability.dark_sticker === true, '(b2) the copy keeps the source\'s Dark Tera exactly', res.error);
  apply_type_sticker(src, 'Earth');
  ok(src.ability.earth_sticker && cp && !cp.ability.earth_sticker && cp.ability.dark_sticker, '(b2) original Earth Tera, copy Dark Tera');
  ok(cp && cp.ability.rb_type === 'Dragon', '(b2) the copy inherits the gained type Dragon (not its Tera at copy time)', cp && cp.ability.rb_type);
  nextShop();
  ok(RB().mono && RB().type === 'Dragon', '(b2) two Dragonites with Earth / Dark Teras start a Dragon round: Monotype intact', RB());
}
// (c) evolution into another type stays safe (Ursaring -> Ursaluna above); so does an off-type Tera on an on-type joker
dragonRun();
apply_type_sticker(joker('j_poke_dratini'), 'Fire');
nextShop();
ok(RB().mono, '(c) a Dragon joker Tera\'d Fire still matches by its gained type', RB());
// (d) an off-type joker with no matching Tera breaks it (an off-type Tera doesn't help)
dragonRun();
buy('j_poke_sneasel');
apply_type_sticker(joker('j_poke_sneasel'), 'Fire');
ok(RV().mono_at_risk === true, '(d) a Dark joker Tera\'d Fire in a Dragon run is at risk');
act({ type: 'next_round' });
act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Sneasel (Dark/Fire) in a Dragon run', '(d) off-type both ways: broken', RB().mono_reason);
// (e) a non-Pokémon joker still breaks it
dragonRun();
buy('j_joker');
act({ type: 'next_round' });
act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Joker (no type)', '(e) a non-Pokémon joker kept into a round: broken', RB().mono_reason);
// (f) the first lock, jokers matching by different routes
fresh();
toShop(); buy('j_poke_sneasel'); // (gained Dark ...)
apply_type_sticker(joker('j_poke_sneasel'), 'Dragon'); // (... now Dragon)
act({ type: 'next_round' });
{ const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_dratini'); c.add_to_deck(); G.jokers.emplace(c); }
act({ type: 'select_blind' }); clearHand();
ok(RB().mono && RB().type === 'Dragon', '(f) Sneasel (gained Dark, Tera Dragon) + Dratini: the one shared type, Dragon, locks', RB());
fresh();
toShop(); buy('j_poke_sneasel');
apply_type_sticker(joker('j_poke_sneasel'), 'Dragon');
nextShop();
ok(RB().mono && RB().type === 'Dark', '(f) a lone joker matching two types locks its gained type (Dark)', RB());
fresh();
toShop(); buy('j_poke_sneasel');
apply_type_sticker(joker('j_poke_sneasel'), 'Fire'); // Dark / Fire
act({ type: 'next_round' });
{ const c = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_squirtle'); c.add_to_deck(); G.jokers.emplace(c); apply_type_sticker(c, 'Grass'); } // Water / Grass
act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Squirtle (Water/Grass) in a Dark run', '(f) no type shared by the row at the first lock: broken', RB().mono_reason);
// (g) a resumed recipe (Kyle's Continue): a Dragonite Tera'd off-type + its Ankh copy, saved mid-shop, re-simulated
{
  const bestHand = () => {
    const cards = G.hand.cards; let best = null, bs = -1; const n = Math.min(cards.length, 10);
    for (let mask = 1; mask < (1 << n); mask++) {
      let bits = 0; for (let m = mask; m; m &= m - 1) bits++;
      if (bits > 5) continue;
      const sel = cards.filter((_, i) => mask & (1 << i));
      const info = get_poker_hand_info(sel); if (info.text === 'NULL') continue;
      const h = G.GAME.hands[info.text];
      const sc = (h.chips + info.scoring_hand.reduce((a, c) => a + c.get_chip_bonus(), 0)) * h.mult;
      if (sc > bs) { bs = sc; best = sel; }
    }
    return best.map((c) => c.sort_id);
  };
  let s = null, tera = null;
  for (let i = 0; i < 30 && !s; i++) {
    const t = new Session();
    t.start({ customDeck: { name: 'Kyle', mods: ['pokermon'], jokers: [{ key: 'j_poke_dragonite' }], consumables: [{ key: 'c_poke_teraorb' }, { key: 'c_ankh' }] } });
    const orb = G.consumeables.cards.find((c) => keyOf(c) === 'c_poke_teraorb');
    if (orb && orb.ability.extra.change_to_type !== 'Dragon') { s = t; tera = orb.ability.extra.change_to_type; }
  }
  ok(s && G.jokers.cards.length === 1, '(g) a run with Dragonite and a non-Dragon Tera Orb (' + tera + ')');
  const orb = G.consumeables.cards.find((c) => keyOf(c) === 'c_poke_teraorb');
  ok(s.act({ type: 'use', id: orb.sort_id }).ok && get_type(G.jokers.cards[0]) === tera, '(g) Tera Orb: Dragonite is now ' + tera, get_type(G.jokers.cards[0]));
  ok(s.act({ type: 'select_blind' }).ok && RB().type === 'Dragon' && RB().mono, '(g) Dragonite (gained Dragon) locks Dragon at the first blind', RB());
  const ak = G.consumeables.cards.find((c) => keyOf(c) === 'c_ankh');
  ok(s.act({ type: 'use', id: ak.sort_id }).ok && G.jokers.cards.length === 2, '(g) Ankh copied it mid-round');
  const cp = G.jokers.cards[1];
  ok(cp && get_type(cp) === tera && cp.ability.rb_type === 'Dragon', '(g) the copy: ' + tera + ' Tera, gained type Dragon', cp && [get_type(cp), cp.ability.rb_type]);
  for (let i = 0; i < 8 && G.STATE === STATES.SELECTING_HAND; i++) { s.act({ type: 'highlight', ids: bestHand() }); s.act({ type: 'play' }); }
  ok(G.STATE === STATES.ROUND_EVAL && s.act({ type: 'cash_out' }).ok && G.STATE === STATES.SHOP, '(g) the blind won by played hands, cashed out: in the shop', G.STATE);
  const live = JSON.stringify(RB());
  ok(RB().mono && RV().mono_at_risk === false, '(g) live, in the shop: Monotype intact, not at risk', RB());
  Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(JSON.stringify(RB()) === live && RB().mono && G.STATE === STATES.SHOP && G.jokers.cards.length === 2, '(g) resumed (fromRecipe) in the shop: Monotype intact', [live, JSON.stringify(RB())]);
  ok(act({ type: 'next_round' }).ok && act({ type: 'select_blind' }).ok, '(g) the resumed run starts the next blind');
  ok(RB().mono && RB().type === 'Dragon', '(g) ... with Monotype still intact (Dragon)', RB());
}

// ======================================================== made by a Pokémon (owner rule 2026-10-21)
// A joker MADE BY A POKÉMON JOKER'S OWN EFFECT is not the player's gain (no Nuzlocke window use, no non-Pokémon break),
// and one without a type counts as its maker's type for the Monotype (tester Jack's Grass run: his Tropius's Gros
// Michel broke both). Jokers made by non-Pokémon effects (Riff-raff, consumables, tags) are unchanged.
const newJokers = (before) => G.jokers.cards.filter((c) => !before.has(c));
/** Tropius's end-of-round banana in a Grass run (Tropius + Bulbasaur) -> the banana (or null). */
function tropiusBanana() {
  fresh();
  toShop(); buy('j_poke_tropius');
  nextShop(); buy('j_poke_bulbasaur');
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  ok(RB().type === 'Grass' && RB().mono && RB().nuz, '(tropius) Tropius + Bulbasaur: a Grass run, both intact', RB());
  joker('j_poke_tropius').ability.extra.active = true;
  const before = new Set(G.jokers.cards), gains = RB().gains, wg = RB().window_gains;
  winRound();
  const made = newJokers(before);
  ok(made.length === 1 && ['j_gros_michel', 'j_cavendish'].includes(keyOf(made[0])), '(tropius) Tropius made a banana at end of round: ' + made.map(keyOf), made.map(keyOf));
  ok(RB().nuz && RB().gains === gains && RB().window_gains === wg, '(tropius) the banana is not a Nuzlocke gain: intact, window unchanged', RB());
  return made[0] || null;
}
{
  const b = tropiusBanana();
  ok(b && b.ability.rb_type === 'Grass' && b.ability.rb_made_by === 'j_poke_tropius', '(tropius) the banana is gained as Grass, made by Tropius', b && [b.ability.rb_type, b.ability.rb_made_by]);
  act({ type: 'cash_out' });
  ok(RV().mono_at_risk === false, '(tropius) in the shop: Monotype not at risk', RV());
  nextShop();
  ok(joker(keyOf(b)) && RB().mono && RB().type === 'Grass' && RB().nuz, '(tropius) the next round begins with the banana: Grass Monotype + Nuzlocke intact', RB());
  // a copy of the banana the player makes (Ankh-style): a new joker for the Nuzlocke, Grass by the copy rule
  const wg = RB().window_gains;
  const cp = copy_card(b); cp.add_to_deck(); G.jokers.emplace(cp);
  ok(cp.ability.rb_type === 'Grass' && cp.ability.rb_made_by === undefined && RB().window_gains === wg + 1 && RB().nuz, '(tropius) a copy of the banana: Grass (copy rule), a gain, not a non-Pokémon one', [cp.ability.rb_type, cp.ability.rb_made_by, RB()]);
}
// a BOUGHT Gros Michel still breaks both
fresh();
toShop(); buy('j_poke_tropius');
joker('j_poke_tropius').ability.extra.active = false; // (no banana of its own this time)
nextShop();
{
  const before = new Set(G.jokers.cards);
  buy('j_gros_michel');
  const gm = newJokers(before)[0];
  ok(!RB().nuz && RB().nuz_reason === 'gained a non-Pokémon joker (Gros Michel)', '(bought banana) a bought Gros Michel breaks the Nuzlocke', RB());
  ok(gm && keyOf(gm) === 'j_gros_michel' && gm.ability.rb_type === 'none' && gm.ability.rb_made_by === undefined, '(bought banana) ... and is gained typeless', gm && gm.ability);
}
act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
ok(!RB().mono && RB().mono_reason === 'started a round with Gros Michel (no type)', '(bought banana) ... and the Monotype at the next round', RB().mono_reason);
// a Riff-raff Common (a non-Pokémon joker's effect, even a Grass Tera'd one's) is still a gain and breaks the Monotype
fresh();
toShop(); buy('j_poke_bulbasaur');
nextShop(); buy('j_riff_raff', 'Grass');
G.jokers.config.card_limit = 3;
act({ type: 'next_round' });
{
  const before = new Set(G.jokers.cards);
  act({ type: 'select_blind' });
  const made = newJokers(before);
  ok(made.length === 1 && made[0].ability.rb_made_by === undefined && made[0].ability.rb_type !== 'Grass', '(riff-raff) its Common is not Pokémon-made: ' + made.map((c) => keyOf(c) + ':' + c.ability.rb_type), made.map((c) => c.ability));
  ok(RB().window_gains === 1 && RB().gains === 3, '(riff-raff) the Common is a Nuzlocke gain (the window one)', RB());
  ok(!RB().mono, '(riff-raff) ... and the Monotype that round', RB().mono_reason);
}
// a Pokémon-made joker survives save / resume with its tag (a Session run: only real actions replay)
{
  let s = null, b = null;
  for (let i = 0; i < 20 && !b; i++) {
    s = new Session();
    s.start({ customDeck: { name: 'Banana', mods: ['pokermon'], jokers: [{ key: 'j_poke_tropius' }] } });
    s.act({ type: 'select_blind' });
    for (let k = 0; k < 8 && G.STATE === STATES.SELECTING_HAND; k++) {
      // (the best hand by brute force: a Small Blind of ante 1 falls to it)
      const cards = G.hand.cards; let best = null, bs = -1; const n = Math.min(cards.length, 10);
      for (let mask = 1; mask < (1 << n); mask++) {
        let bits = 0; for (let m = mask; m; m &= m - 1) bits++;
        if (bits > 5) continue;
        const sel = cards.filter((_, j) => mask & (1 << j));
        const info = get_poker_hand_info(sel); if (info.text === 'NULL') continue;
        const h = G.GAME.hands[info.text];
        const sc = (h.chips + info.scoring_hand.reduce((a, c) => a + c.get_chip_bonus(), 0)) * h.mult;
        if (sc > bs) { bs = sc; best = sel; }
      }
      s.act({ type: 'highlight', ids: best.map((c) => c.sort_id) }); s.act({ type: 'play' });
    }
    b = G.STATE === STATES.ROUND_EVAL ? G.jokers.cards.find((c) => c.ability.rb_made_by === 'j_poke_tropius') : null;
  }
  ok(b && b.ability.rb_type === 'Grass' && RB().nuz, '(resume) a Session run: Tropius made a Grass banana at end of round', b && b.ability);
  if (b) {
    const live = JSON.stringify(RB()), key = keyOf(b);
    Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
    const b2 = G.jokers.cards.find((c) => keyOf(c) === key);
    ok(b2 && b2.ability.rb_type === 'Grass' && b2.ability.rb_made_by === 'j_poke_tropius' && JSON.stringify(RB()) === live, '(resume) resumed (fromRecipe): the banana keeps Grass + made by Tropius, same badge state', [b2 && b2.ability, live, JSON.stringify(RB())]);
    const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe)));
    st.seek(st.total);
    ok(st.view().run_badges.nuz === true && st.view().run_badges.mono === true, '(resume) the replay shows both intact', st.view().run_badges);
  }
}
// the other Pokémon creators: each one's effect fired the way the game does (calculate_joker / its dollar bonus), and
// the events it queued run
/** In a fresh run's shop with `extra` + the maker in the row: fire(maker) until it makes a joker -> the jokers made. */
function makeWith(makerKey, fire, extra = [], mods) {
  if (mods) { newRun({ seed: 'RBFRESH1', seeded: false, back: 'b_red', mods }); G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall'; } else fresh();
  toShop();
  for (const k of [...extra, makerKey]) { const c = create_card('Joker', G.jokers, null, null, null, null, k); c.add_to_deck(); G.jokers.emplace(c); }
  G.jokers.config.card_limit = 8;
  RB().nuz = true; RB().nuz_reason = ''; RB().window_gains = 0; // (the setup's own gains don't matter here)
  const maker = joker(makerKey), before = new Set(G.jokers.cards), gains = RB().gains;
  for (let i = 0; i < 300 && !newJokers(before).length; i++) { fire(maker); G.E_MANAGER.flush(); }
  const made = newJokers(before);
  const mt = maker.ability.rb_type;
  ok(made.length > 0, `(made by) ${makerKey} made ${made.map(keyOf).join(', ')}`);
  for (const c of made) {
    const own = c.ability.extra && typeof c.ability.extra === 'object' && c.ability.extra.ptype;
    ok(c.ability.rb_made_by === makerKey, `(made by) ${keyOf(c)} is tagged made by ${makerKey}`, c.ability.rb_made_by);
    if (!own && makerKey !== 'j_poke_mewtwo') ok(c.ability.rb_type === mt, `(made by) typeless ${keyOf(c)} is gained as its maker's ${mt}`, c.ability.rb_type);
  }
  ok(RB().nuz && RB().window_gains === 0 && RB().gains === gains, `(made by) ${makerKey}'s jokers: no Nuzlocke gain`, RB());
  return made;
}
makeWith('j_poke_delibird', (m) => m.calculate_dollar_bonus()); // (its Gift Card: a 15% roll of the dollar bonus)
makeWith('j_poke_mew', (m) => { m.ability.extra.percent = 100; m.calculate_joker({ ending_shop: true }); });
{
  const made = makeWith('j_poke_corsola', (m) => m.calculate_joker({ setting_blind: true }));
  ok(made.every((c) => get_type(c) === 'Water' && c.ability.rb_type === 'Water'), '(made by) Corsola\'s Pokémon keeps its own type (Water)', made.map((c) => c.ability.rb_type));
}
makeWith('j_poke_dragapult', (m) => m.calculate_joker({ cardarea: G.jokers, scoring_hand: [], joker_main: true, poker_hands: { 'Straight Flush': [[]] } }));
{
  const made = makeWith('j_poke_mewtwo', (m) => { G.GAME.blind.boss = true; m.calculate_joker({ end_of_round: true }); }, ['j_poke_bulbasaur']);
  ok(made.length === 1 && keyOf(made[0]) === 'j_poke_bulbasaur' && made[0].ability.rb_type === 'Grass', '(made by) Mewtwo\'s copy keeps its source\'s type (the copy rule)', made.map((c) => c.ability.rb_type));
}
makeWith('j_nacho_mega_audino', (m) => m.calculate_joker({ end_of_round: true, game_over: false }), [], ['pokermon', 'nacho']);
// a Tropius banana by a Blueprint copy is still Tropius's effect
{
  const made = makeWith('j_poke_tropius', (m) => {
    m.ability.extra.active = true;
    joker('j_blueprint').calculate_joker({ end_of_round: true, main_eval: true });
  }, ['j_blueprint']);
  ok(made.length >= 1 && made.every((c) => c.ability.rb_type === 'Grass'), '(made by) a Blueprint-copied Tropius banana: Grass', made.map((c) => c.ability.rb_type));
}

// ======================================================== the win
/** Play the ante-8 Small, Big and Boss (forced wins). */
function winRun() {
  G.GAME.round_resets.ante = G.GAME.win_ante;
  let won = null;
  for (let i = 0; i < 3 && !G.GAME.won; i++) {
    if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
    act({ type: 'select_blind' }); clearHand();
    G.GAME.chips = G.GAME.blind.chips;
    const res = act({ type: 'highlight', ids: hand(['S_2']).map((c) => c.sort_id) }) && act({ type: 'play' });
    won = won || (res.events || []).find((e) => e.type === 'win');
    if (!G.GAME.won) act({ type: 'cash_out' });
  }
  return won;
}
fresh();
toShop(); buy('j_poke_charmander');
act({ type: 'next_round' });
{
  const win = winRun();
  ok(win && G.GAME.won, 'the run was won');
  const v = RV();
  ok(v.won && v.earned && v.earned.nuz === true && v.earned.mono === 'Fire', 'a win records both badges (Nuzlocke + Monotype: Fire)', v);
  ok(win && win.jokers && win.jokers.includes('j_poke_charmander'), 'the win event still lists the jokers (for the stickers)');
  // frozen after the win: Endless can't lose them
  act({ type: 'cash_out' });
  act({ type: 'endless' });
  const c = joker('j_poke_charmander');
  act({ type: 'sell', id: c.sort_id });
  ok(RB().nuz && RV().earned.nuz, 'after the win the badges are frozen (a sell in Endless changes nothing)', RB());
}
fresh();
toShop(); buy('j_poke_charmander'); buy('j_joker');
act({ type: 'next_round' });
winRun();
ok(RV().earned && RV().earned.nuz === false && RV().earned.mono === null, 'a broken run wins no badges', RV().earned);
fresh();
act({ type: 'select_blind' }); clearHand(); winRound(); act({ type: 'cash_out' });
act({ type: 'next_round' });
winRun();
ok(RV().earned && RV().earned.nuz === true && RV().earned.mono === null, 'no jokers at all: a Nuzlocke, but no Monotype (no type locked)', RV().earned);
start('SEEDWIN', {}, { noBlind: true });
toShop(); buy('j_poke_charmander');
act({ type: 'next_round' });
winRun();
ok(G.GAME.won && RV().eligible === false && RV().earned === undefined, 'a seeded run\'s win earns nothing', RV());
{
  const ch = allChallenges().find((c) => !c.mod);
  newRun({ challenge: ch.id, mods: ['pokermon'] });
  ok(G.GAME.challenge && RV() && RV().eligible === false, 'a challenge run is not eligible: ' + ch.id, RV());
}

// ======================================================== starting jokers + save / resume
{
  const s = new Session();
  s.start({ customDeck: { name: 'Two Types', mods: ['pokermon'], jokers: [{ key: 'j_poke_charmander' }, { key: 'j_poke_squirtle' }] } });
  ok(G.jokers.cards.length === 2 && RB().gains === 2 && RB().window_gains === 0, 'starting jokers don\'t use the first window\'s one', RB());
  ok(RB().nuz && RB().mono, 'two starting types: nothing broken before the first blind', RB());
  ok(s.act({ type: 'select_blind' }).ok && !RB().mono && RB().mono_reason === 'started a round with Squirtle (Water) in a Fire run', 'starting jokers are type-checked at the first blind start', RB());
  const id = G.jokers.cards[0].sort_id;
  ok(s.act({ type: 'sell', id }).ok && !RB().nuz, 'sold a starting joker: broken');
  const live = JSON.stringify(RB());
  Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(JSON.stringify(RB()) === live, 'a resumed run (rebuilt from its recipe) keeps the badge state', [live, JSON.stringify(RB())]);
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe)));
  st.seek(0);
  ok(st.view().run_badges.nuz === true, 'a replay at the start shows the Nuzlocke intact...');
  st.seek(st.total);
  ok(st.view().run_badges.nuz === false && st.view().run_badges.nuz_reason === 'sold Charmander', '... and broken after the sell, as it was');
}
// eligibility survives a resume (bug 2026-10-19, jfost711: every recipe carries a seed, and a resumed run read it
// as a typed one -> "seeded": its win earned no stickers / badges / record); a typed seed stays seeded
{
  const s = new Session();
  s.start({ back: 'b_red', mods: ['pokermon'] });
  ok(s.recipe.seeded === undefined && G.GAME.seeded === false && RV().eligible === true, 'a random-seed run: not seeded, eligible');
  Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe)));
  ok(G.GAME.seeded === false && RV().eligible === true, 'resumed (fromRecipe): still not seeded, still eligible', RV());
  const st = Session.stepper(JSON.parse(JSON.stringify(s.recipe)));
  ok(G.GAME.seeded === false && st.view().run_badges.eligible === true, 'a replay of it: eligible too');
  const t = new Session();
  t.start({ seed: 'TYPED1', back: 'b_red', mods: ['pokermon'] });
  ok(t.recipe.seeded === true && RV().eligible === false, 'a typed seed: recipe.seeded, not eligible');
  Session.fromRecipe(JSON.parse(JSON.stringify(t.recipe)));
  ok(G.GAME.seeded === true && RV().eligible === false, 'resumed: still seeded');
}
// a bot-played Pokermon run: the resumed state matches the live one
let botGains = 0;
for (const seed of [3, 7, 11]) {
  const run = playRun({ seed: 'RBBOT' + seed, mods: ['pokermon'] }, { seed, maxSteps: 400 });
  const live = JSON.stringify(RB());
  Session.fromRecipe(run.recipe);
  botGains += RB().gains;
  ok(JSON.stringify(RB()) === live, 'bot run ' + seed + ': the resumed state matches the live one ' + live, JSON.stringify(RB()));
}
ok(botGains > 0, 'the bot runs gained jokers', botGains);

// ======================================================== the win stickers' categories (ui/progress.js winCategories)
{
  const { winCategories } = await import('../../js/ui/progress.js');
  ok(JSON.stringify(winCategories(null, false)) === '["win"]', 'a vanilla win: only the plain win category (no Pikachu)');
  ok(JSON.stringify(winCategories({ nuz: false, mono: null }, true)) === '["win","poke"]', 'a Pokermon win with both badges broken: win + poke (Pikachu)');
  ok(JSON.stringify(winCategories({ nuz: true, mono: null }, true)) === '["win","poke","nuz"]', 'a Nuzlocke win: win + poke + nuz');
  ok(JSON.stringify(winCategories({ nuz: true, mono: 'Fire' }, true)) === '["win","poke","nuz","mono","both"]', 'Nuzlocke + Monotype: every category');
}

done();
