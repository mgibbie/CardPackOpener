// The owner's Glameow line (2026-10-28; jokers/pokejokers_designs.js "LINE: Glameow -> Purugly"; PORTING.md "The owner's Glameow line"):
//   Glameow 431 (Basic, Common $5, Colorless)     Fickle: a favourite suit, picked when first obtained and again at each end of round
//                                                 (the run's seeded RNG, Ancient Joker's pick: never the same suit twice running), shown
//                                                 on the tooltip; scored cards of it each give +5 Mult (Wild / Smeared through is_suit).
//                                                 Evolves after 5 rounds, but only with a free Joker slot: it waits, never pushing a joker out.
//   Purugly 432 (Stage 1, Safari $8, Colorless)   Thick Fat: -1 Joker slot while held (back when sold / destroyed; a Negative nets 0; a
//                                                 debuff keeps the cost, as vanilla keeps a Negative's slot). Fickle: X1.25 Mult per card.
//   Energy: Glameow's per-card `mult` (+40% of base), Purugly's per-card `Xmult_multi` (+5%), carried through evolution; the slot is fixed.
// Every ability is FIRED through real rounds with exact numbers; the favourite is checked through a Session's save / resume (replay).
//   node micatro/tests/mods/pokermon_glameow_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, nextRound, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { Session } from '../../js/engine/session.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';
import { playRun } from '../replay_bot.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const limit = () => G.jokers.config.card_limit;
const SUITS = ['Spades', 'Hearts', 'Clubs', 'Diamonds'];
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
function undebuff(j) { j.ability.debuff_sources = {}; j.set_debuff(false); return j; }
/** Play these hand cards (keys; `wild` ones are Wild Cards): -> the hand total. */
function playKeys(keys, wild = []) {
  clearHand();
  const cards = [...hand(keys), ...hand(wild, { center: 'm_wild' })];
  const t = play(cards).total; flush(); return t;
}
/** The favourite after each of n real rounds (won, cashed out, next blind selected). */
function trace(j, n) { const out = [j.ability.fav_suit]; for (let i = 0; i < n; i++) { nextRound(); flush(); out.push(j.ability.fav_suit); } return out; }
const sell = (j) => { const r = act({ type: 'sell', id: j.sort_id }); flush(); return r; };

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 34 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 34+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of ['glameow', 'purugly']) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /glameow|purugly/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Glameow / Purugly (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('GLAM0');
  const g = P_CENTERS.j_poke_glameow, p = P_CENTERS.j_poke_purugly;
  ok(g.rarity === 1 && g.cost === 5 && g.stage === 'Basic' && g.ptype === 'Colorless' && g.gen === 4 && g.config.extra.mult === 5 && g.config.extra.rounds === 5,
    'Glameow: Common $5, Basic, Colorless, Gen 4, +5 Mult per card, 5 rounds', [g.rarity, g.cost, g.stage, g.ptype, g.config.extra]);
  ok(p.rarity === 'poke_safari' && p.cost === 8 && p.stage === 'One' && p.ptype === 'Colorless' && p.config.extra.Xmult_multi === 1.25 && p.config.extra.slot_cost === 1,
    'Purugly: Safari $8, Stage 1, Colorless, X1.25 per card, -1 slot', [p.rarity, p.cost, p.stage, p.ptype, p.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_glameow');
  ok(i > 0 && keys[i - 1] === 'j_poke_honchkrow' && keys[i + 1] === 'j_poke_purugly' && keys[i + 2] === 'j_poke_chingling',
    'Pokédex order: Honchkrow (430), Glameow, Purugly, Chingling (433)', keys.slice(i - 1, i + 3));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('glameow') === 'glameow,purugly' && fam('purugly') === fam('glameow'), 'one family: Glameow -> Purugly', fam('glameow'));
  ok([[g, 20], [p, 22]].every(([c, x]) => c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === 28),
    'art: upstream 3.9.1\'s own cells (Natdex 20,28 / 22,28)', [g.atlas, g.pos, p.pos]);
  ok(pool_filter(g, 'Joker') === undefined && g.in_pool(g) !== false, 'Glameow can be rolled in the shop (Common)');
  ok('mult' in energy_values && 'Xmult_multi' in energy_values && !('slot_cost' in energy_values) && !('rounds' in energy_values),
    'Energy fields: mult and Xmult_multi (the slot cost and the timer are not)');
});

// ------------------------------------------------------------------- Fickle: picked when obtained, each round, seeded, never twice running
sec('fickle', () => {
  start('GLAMF');
  const g = add('j_poke_glameow');
  ok(SUITS.includes(g.ability.fav_suit), 'a favourite is picked when first obtained', g.ability.fav_suit);
  ok(new RegExp('Favourite: \\{V:1\\}' + g.ability.fav_suit + '\\{').test(lines(g)) && describe(g).colours[0] === g.ability.fav_suit,
    'the tooltip shows it, in its suit\'s colour', [lines(g), describe(g).colours]);
  const t1 = trace(g, 4);
  ok(t1.every((s) => SUITS.includes(s)) && t1.every((s, k) => k === 0 || s !== t1[k - 1]), 'a new favourite each round, never the same twice running', t1);
  ok(new Set(t1).size >= 3, 'it moves around the suits', t1);
  start('GLAMF');
  const g2 = add('j_poke_glameow');
  const t2 = trace(g2, 4);
  ok(t2.join() === t1.join(), 'the same seed gives the same favourites, round for round', [t1, t2]);
  const others = ['GLAMF2', 'GLAMF3', 'GLAMF4'].map((s) => { start(s); return trace(add('j_poke_glameow'), 4).join(); });
  ok(others.some((t) => t !== t1.join()), 'other seeds give other favourites', others);
  // a shop / collection card (not obtained) has none yet, and never draws from the run's seed
  start('GLAMF5');
  const before = JSON.stringify(G.GAME.pseudorandom);
  const shopCard = describe({ config: { center: P_CENTERS.j_poke_glameow } });
  ok(JSON.stringify(G.GAME.pseudorandom) === before, 'describing the center (collection) draws nothing from the run\'s seed');
  void shopCard;
});

// ------------------------------------------------------------------- the favourite survives save / resume (the recipe replayed)
// A bot plays a real run (micatro/tests/replay_bot.mjs, the live Session path) from a custom deck that starts with Glameow: GLAMRES2
// reaches Purugly (8 rounds); in GLAMRES3 the bot fills every slot, so Glameow is still waiting after 9 rounds.
for (const [seed, bot, evolves] of [['GLAMRES2', 2, true], ['GLAMRES3', 1, false]]) sec('resume ' + seed, () => {
  const run = playRun({ seed, mods: ['pokermon'], customDeck: { name: 'Glam', jokers: [{ key: 'j_poke_glameow' }] } }, { seed: bot, maxSteps: 400 });
  const find = () => G.jokers.cards.find((j) => /glameow|purugly/.test(key(j)));
  const state = (j) => j && [key(j), j.ability.fav_suit, ex(j).rounds, limit(), G.jokers.cards.length].join();
  const liveJ = find(), live = state(liveJ);
  const recipe = JSON.parse(JSON.stringify(run.recipe)); // what localStorage keeps
  const cash = recipe.actions.map((a, k) => (a.type === 'cash_out' ? k + 1 : -1)).filter((k) => k > 0);
  ok(liveJ && cash.length >= 8, seed + ': the bot played 8+ rounds with the joker', [cash.length, live]);
  ok(evolves ? key(liveJ) === 'j_poke_purugly' && limit() === 4 : key(liveJ) === 'j_poke_glameow' && ex(liveJ).rounds === 0 && G.jokers.cards.length >= limit(),
    seed + (evolves ? ': it evolved, 4 Joker slots' : ': every slot full, Glameow still waiting at 0 rounds'), live);
  const favs = [], favs2 = [];
  for (const n of cash) {
    Session.fromRecipe({ ...recipe, actions: recipe.actions.slice(0, n) }); flush(); favs.push(find() && find().ability.fav_suit);
    Session.fromRecipe({ ...recipe, actions: recipe.actions.slice(0, n) }); flush(); favs2.push(find() && find().ability.fav_suit);
  }
  ok(favs.every((s) => SUITS.includes(s)) && favs.every((s, k) => k === 0 || s !== favs[k - 1]), seed + ': resumed after each round, a favourite, new each round', favs);
  ok(favs.join() === favs2.join(), seed + ': resuming twice gives the same favourites', [favs, favs2]);
  const s = Session.fromRecipe(recipe); flush();
  ok(!s.stoppedAt && state(find()) === live, seed + ': the full resume matches the live run (joker, favourite, rounds, slots, jokers)', [live, state(find())]);
});

// ------------------------------------------------------------------- Glameow: +5 Mult per scored card of the favourite; Wild / Smeared count
sec('glameow mult', () => {
  start('GLAM1');
  const g = add('j_poke_glameow');
  g.ability.fav_suit = 'Hearts';
  let t = playKeys(['H_2']);
  ok(t.chips === 7 && near(t.mult, 1 + 5), 'High Card, a Heart (the favourite): +5 Mult', t);
  t = playKeys(['S_2']);
  ok(near(t.mult, 1), 'a Spade: nothing', t);
  t = playKeys(['H_5', 'S_5', 'H_9']);
  ok(t.chips === 20 && near(t.mult, 2 + 5), 'Pair of 5s (Heart + Spade) with an unscored Heart 9: only the scored Heart, +5', t);
  t = playKeys(['H_5'], ['S_5']);
  ok(near(t.mult, 2 + 10), 'a Wild Spade counts as a Heart: +10', t);
  t = playKeys(['H_4', 'H_7', 'H_9', 'H_J', 'H_K']);
  ok(near(t.mult, 4 + 25), 'a Heart Flush: five cards, +25', t);
  ok(/suit each give \{C:mult\}\+5\{\} Mult/.test(lines(g)), 'the text: scored cards of its favourite suit each give +5 Mult', lines(g));
  add('j_smeared');
  t = playKeys(['D_5', 'S_5']);
  ok(near(t.mult, 2 + 5), 'with Smeared Joker a Diamond counts as a Heart: +5', t);
  g.ability.fav_suit = 'Clubs';
  t = playKeys(['C_5', 'S_5']);
  ok(near(t.mult, 2 + 10), 'with Smeared Joker a Spade counts as a Club: +10', t);
  // Blueprint copies it
  start('GLAM1B');
  add('j_blueprint'); const g2 = add('j_poke_glameow'); g2.ability.fav_suit = 'Spades';
  t = playKeys(['S_2']);
  ok(near(t.mult, 1 + 10), 'Blueprint copies it: +5 twice', t);
});

// ------------------------------------------------------------------- Purugly: X1.25 Mult per scored card of the favourite
sec('purugly x', () => {
  start('GLAM2');
  const p = add('j_poke_purugly');
  ok(SUITS.includes(p.ability.fav_suit), 'Purugly obtained directly picks a favourite too', p.ability.fav_suit);
  p.ability.fav_suit = 'Diamonds';
  let t = playKeys(['D_5', 'S_5']);
  ok(t.chips === 20 && near(t.mult, 2 * 1.25), 'Pair (Diamond + Spade): X1.25 once', t);
  t = playKeys(['D_5'], ['S_5']);
  ok(near(t.mult, 2 * 1.25 * 1.25), 'with a Wild: X1.25 twice (X1.5625)', t);
  t = playKeys(['C_5', 'S_5']);
  ok(near(t.mult, 2), 'no Diamond: nothing', t);
  ok(/X1\.25 \{\} Mult/.test(lines(p)) && /Thick Fat:\{\} \{C:red\}-1\{\} Joker slot/.test(lines(p)) && /Favourite: \{V:1\}Diamonds/.test(lines(p)),
    'the text: Thick Fat -1 Joker slot; X1.25 per card; the favourite', lines(p));
  // it keeps picking each round
  const tr = trace(p, 3);
  ok(tr.every((s, k) => k === 0 || (SUITS.includes(s) && s !== tr[k - 1])), 'Purugly picks a new favourite each round', tr);
});

// ------------------------------------------------------------------- Thick Fat: -1 slot, restored on sell / destroy; Negative nets 0
sec('slots', () => {
  start('GLAM3');
  ok(limit() === 5, 'Red Deck: 5 Joker slots');
  const p = add('j_poke_purugly');
  ok(limit() === 4, 'a Purugly: 4 slots', limit());
  ok(sell(p).ok && limit() === 5 && !G.jokers.cards.includes(p), 'sold: 5 slots again', limit());
  const p2 = add('j_poke_purugly');
  ok(limit() === 4, 'another: 4', limit());
  p2.start_dissolve(); flush();
  ok(limit() === 5, 'destroyed: 5 again', limit());
  const n = add('j_poke_purugly', 'negative');
  ok(n.edition && n.edition.negative && limit() === 5, 'a Negative Purugly nets 0: still 5', limit());
  ok(sell(n).ok && limit() === 5, 'sold: still 5', limit());
  const a = add('j_poke_purugly'), b = add('j_poke_purugly');
  ok(limit() === 3, 'two Purugly: 3 slots', limit());
  // a debuff keeps the cost (as a Negative keeps its slot); lifting it doesn't charge twice; selling a debuffed one refunds
  debuff(a);
  ok(a.debuff && limit() === 3, 'debuffed: the cost stays (3)', limit());
  undebuff(a);
  ok(!a.debuff && limit() === 3, 'undebuffed: still 3 (never charged twice)', limit());
  debuff(a);
  ok(sell(a).ok && limit() === 4, 'a debuffed Purugly sold: its slot comes back (4)', limit());
  debuff(b); b.start_dissolve(); flush();
  ok(limit() === 5, 'a debuffed Purugly destroyed: 5', limit());
  const dn = add('j_poke_purugly', 'negative');
  debuff(dn); sell(dn);
  ok(limit() === 5, 'a debuffed Negative Purugly sold: still 5', limit());
  // Glameow costs nothing
  const g = add('j_poke_glameow');
  ok(limit() === 5, 'Glameow takes no extra slot', limit());
  sell(g);
});

// ------------------------------------------------------------------- evolution: after 5 rounds, waiting for a free slot
sec('evolution', () => {
  start('GLAMEVO');
  const g = add('j_poke_glameow');
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test(lines(g)) && /Needs a free Joker slot to evolve/.test(lines(g)), 'footer: (Evolves after 5 rounds) (Needs a free Joker slot to evolve)', lines(g));
  for (let r = 1; r <= 4; r++) { nextRound(); flush(); }
  ok(key(g) === 'j_poke_glameow' && ex(g).rounds === 1, 'after 4 rounds: still Glameow (1 round left)', [key(g), ex(g).rounds]);
  const fav = g.ability.fav_suit;
  nextRound(); flush();
  ok(key(g) === 'j_poke_purugly' && limit() === 4, 'after the 5th round (a free slot): Purugly, and 4 Joker slots', [key(g), limit()]);
  ok(SUITS.includes(g.ability.fav_suit) && g.ability.fav_suit !== fav, 'it carries a favourite through (the end-of-round pick)', [fav, g.ability.fav_suit]);
  ok(sell(g).ok && limit() === 5, 'the evolved Purugly sold: 5 slots', limit());

  // full slots: it waits, then evolves at the next end of round with a free slot
  start('GLAMWAIT');
  const w = add('j_poke_glameow');
  const eggs = [1, 2, 3, 4].map(() => add('j_egg'));
  ok(G.jokers.cards.length === 5 && limit() === 5, 'five jokers in five slots');
  ex(w).rounds = 1;
  nextRound(); flush();
  ok(key(w) === 'j_poke_glameow' && ex(w).rounds === 0 && G.jokers.cards.length === 5 && limit() === 5, 'its countdown ends with no free slot: it waits (no joker pushed out)', [key(w), ex(w).rounds, G.jokers.cards.length, limit()]);
  nextRound(); flush();
  ok(key(w) === 'j_poke_glameow' && G.jokers.cards.length === 5, 'still full: still waiting', [key(w), G.jokers.cards.length]);
  ok(sell(eggs[0]).ok && G.jokers.cards.length === 4, 'a joker sold: a free slot');
  ok(key(w) === 'j_poke_glameow', 'it doesn\'t evolve mid-round (only at end of round)');
  nextRound(); flush();
  ok(key(w) === 'j_poke_purugly' && limit() === 4 && G.jokers.cards.length === 4, 'the next end of round: Purugly, 4 jokers in 4 slots', [key(w), limit(), G.jokers.cards.length]);

  // two Glameows ready, one free slot: only one evolves
  start('GLAMTWO');
  const a = add('j_poke_glameow'), b = add('j_poke_glameow'); add('j_egg'); add('j_egg');
  ex(a).rounds = 1; ex(b).rounds = 1;
  nextRound(); flush();
  const evolved = [a, b].filter((j) => key(j) === 'j_poke_purugly').length;
  ok(evolved === 1 && limit() === 4 && G.jokers.cards.length === 4, 'two ready with one free slot: one evolves, the other waits (4 jokers, 4 slots)', [key(a), key(b), limit(), G.jokers.cards.length]);
  ok((G.GAME.joker_buffer || 0) === 0, 'the slot reservation is released', G.GAME.joker_buffer);

  // a Negative Glameow: its own +1 stays, the -1 lands; it still needs a free slot
  start('GLAMNEG');
  const ng = add('j_poke_glameow', 'negative'); [1, 2, 3, 4].forEach(() => add('j_egg'));
  ok(limit() === 6 && G.jokers.cards.length === 5, 'a Negative Glameow + 4: 5 jokers, 6 slots');
  ex(ng).rounds = 1;
  nextRound(); flush();
  ok(key(ng) === 'j_poke_purugly' && limit() === 5 && G.jokers.cards.length === 5, 'evolves (a slot was free): a Negative Purugly, 5 in 5 (it nets 0)', [key(ng), limit()]);
});

// ------------------------------------------------------------------- Energy: +40% of +5 per card, +5% of X1.25 per card, carried
sec('energy', () => {
  start('GLAMEN');
  const g = add('j_poke_glameow'); g.ability.fav_suit = 'Spades';
  const ms = [];
  for (let i = 0; i < 3; i++) { increment_energy(g, 'Colorless'); ms.push(ex(g).mult); }
  ok(near(ms[0], 7) && near(ms[1], 9) && near(ms[2], 11) && ex(g).rounds === 5, '1 / 2 / 3 Colorless Energy: +7 / +9 / +11 per card, the timer untouched', ms);
  let t = playKeys(['S_5', 'C_5']);
  ok(near(t.mult, 2 + 11), 'energized x3: a scored Spade +11', t);
  ok(/\{C:mult\}\+11\{\} Mult/.test(lines(g)), 'the tooltip shows +11', lines(g));
  start('GLAMEN2');
  const p = add('j_poke_purugly'); p.ability.fav_suit = 'Hearts';
  const xs = [];
  for (let i = 0; i < 3; i++) { increment_energy(p, 'Colorless'); xs.push(ex(p).Xmult_multi); }
  ok(near(xs[0], 1.3125) && near(xs[1], 1.375) && near(xs[2], 1.4375) && ex(p).slot_cost === 1 && limit() === 4, '1 / 2 / 3 Energy: X1.3125 / X1.375 / X1.4375 per card; the slot cost stays 1', [xs, ex(p).slot_cost, limit()]);
  t = playKeys(['H_5', 'S_5']);
  ok(near(t.mult, 2 * 1.4375), 'energized x3: a scored Heart X1.4375', t);
  // carried through evolution
  start('GLAMEN3');
  const e = add('j_poke_glameow');
  increment_energy(e, 'Colorless'); increment_energy(e, 'Colorless');
  ex(e).rounds = 1;
  nextRound(); flush();
  ok(key(e) === 'j_poke_purugly' && ex(e).energy_count === 2 && near(ex(e).Xmult_multi, 1.375) && ex(e).slot_cost === 1 && limit() === 4,
    'Glameow with 2 Energy evolves: Purugly X1.375 per card (Energy re-applied), still -1 slot', [key(e), ex(e)]);
});

// ------------------------------------------------------------------- vanilla untouched
sec('vanilla', () => {
  start('GLAMVAN');
  add('j_joker');
  const t = playKeys(['H_2']);
  ok(t.chips === 7 && near(t.mult, 5) && limit() === 5, 'a run without the line plays as before', [t, limit()]);
});

done();
