// Nuzlocke + Monotype run badges (mods/pokermon/systems/runbadges.js): the shop-window rule, every way of
// gaining a joker (shop, pack, tag, Great Ball), evolution / destroy / sell, the Monotype type lock + Tera,
// the win's earned badges, seeded / challenge eligibility, non-Pokermon runs, and save/resume.
//   node micatro/tests/mods/runbadges_test.mjs
import { T, start, hand, add, winRound, clearHand, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { create_card } from '../../js/engine/core.js';
import { newRun } from '../../js/engine/run.js';
import { toView } from '../../js/engine/view.js';
import { Session } from '../../js/engine/session.js';
import { allChallenges } from '../../js/engine/challenge.js';
import { poke_evolve } from '../../mods/pokermon/systems/evolution.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { playRun } from '../replay_bot.mjs';

const { ok, done } = T();
const RB = () => G.GAME.run_badges;
const RV = () => toView().run_badges;
const badgeEvents = (r) => (r.events || []).filter((e) => e.type === 'run_badge');

/** An unseeded Pokermon run waiting at the first blind select (eligible for the badges). */
function fresh() {
  newRun({ back: 'b_red', mods: ['pokermon'] });
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
