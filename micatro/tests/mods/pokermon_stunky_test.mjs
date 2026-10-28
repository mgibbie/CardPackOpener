// The owner's Stunky line (2026-10-28; jokers/pokejokers_designs.js poison_gas; PORTING.md "The owner's Stunky line"):
//   Stunky 434 (Basic, Dark, Common $5)     Poison Gas: after each hand you play, the current Blind's score requirement drops by 4% of
//                                           its STARTING requirement. Evolves after 5 rounds.
//   Skuntank 435 (Stage 1, Dark, Safari $8) Toxic: after the nth hand of the round, n x 4% (4, 8, 12...: -24% after 3 hands, -40% after 4).
//   Rules: one record per Blind (G.GAME.poke_poison), shared by every copy: the starting requirement is captured on the round's first deal
//   (after The Wall's / Violet Vessel's own size, a Chicot-disabled Wall's half), and resets each Blind. All copies together take off at
//   most 75% of it, never below 1 chip. Copies stack additively; Blueprint copies the drop. It acts AFTER the win check: a hand that beat
//   the Blind gets nothing, and so does the round's final hand (no later hand to help). If the lowered requirement is at or below the
//   chips already scored, the Blind is won right after that hand (the engine's post-hand check, as when Chicot / Luchador disable a
//   Blind), before the next draw. Debuffed: nothing. Energy: poison_pct +20% of base (4 -> 4.8 / 5.6 / 6.4%).
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_stunky_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, act, STATES, state } from './poke_helpers.mjs';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = async (name, fn) => { try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const plain = (j) => describe(j).lines.join(' | ').replace(/\{[^}]*\}/g, '');
const LINE = ['stunky', 'skuntank'];
const req = () => +G.GAME.blind.chips;
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }
/** Play exactly these cards, the round's chips and hands left as they are (no helper resets). -> {events, msgs, drops}. */
function play(keys) {
  clearHand();
  const cs = hand(keys);
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const events = (r && r.events) || [];
  return {
    ok: r && r.ok, events,
    drops: events.filter((e) => e.type === 'blind' && e.action === 'chips').map((e) => +e.chips),
    msgs: events.filter((e) => e.type === 'status' && /%$/.test(e.message || '')).map((e) => [e.card, e.message]),
  };
}
// A High Card 2: 5 + 2 = 7 chips x 1 = 7 points.
const HC2 = ['S_2'];
/** A fresh Pokermon run on the Small Blind (300 at ante 1), with these jokers, plenty of hands, chips 0. */
function fresh(seed, jokers, { hands = 10, base } = {}) {
  start(seed);
  const js = jokers.map((k) => add(k.startsWith('j_') ? k : 'j_poke_' + k));
  G.GAME.current_round.hands_left = hands;
  G.GAME.chips = 0;
  if (base !== undefined) { G.GAME.blind.chips = base; G.GAME.poke_poison = undefined; } // (captured by the first drop)
  return js;
}
function endRound() { clearHand(); G.GAME.chips = G.GAME.blind.chips; play(HC2); }
function advance(boss = 'bl_wall') {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = boss;
  act({ type: 'select_blind' }); flush();
  clearHand();
}

// ------------------------------------------------------------------- pin, static data, order, family, precedence
await sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 42 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 42+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /stunky|skuntank/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Stunky / Skuntank (precedence: nothing to dedupe)', hits);
});
await sec('static', () => {
  start('STUNKY0');
  const [s, k] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(s && s.rarity === 1 && s.cost === 5 && s.stage === 'Basic' && s.ptype === 'Dark' && s.gen === 4 && s.config.extra.poison_pct === 4 && s.config.extra.rounds === 5 && s.blueprint_compat,
    'Stunky: Common $5, Basic, Dark, Gen 4, 4%, 5 rounds, Blueprint-compatible', s && [s.rarity, s.cost, s.stage, s.ptype, s.config.extra]);
  ok(k && k.rarity === 'poke_safari' && k.cost === 8 && k.stage === 'One' && k.ptype === 'Dark' && k.config.extra.poison_pct === 4 && !('rounds' in k.config.extra) && k.blueprint_compat,
    'Skuntank: Safari $8, Stage 1, Dark, 4% step, no evolution', k && [k.rarity, k.cost, k.stage, k.ptype, k.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_stunky');
  ok(i > 0 && keys[i - 1] === 'j_poke_chingling' && keys[i + 1] === 'j_poke_skuntank' && keys[i + 2] === 'j_poke_bronzor',
    'Pokédex order: Chingling (433), Stunky, Skuntank, Bronzor (436)', keys.slice(i - 1, i + 3));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(fam('stunky') === 'stunky,skuntank' && fam('skuntank') === fam('stunky'), 'one family: Stunky, Skuntank', fam('stunky'));
  ok(s && s.atlas === 'poke_AtlasJokersBasicNatdex391' && s.pos.x === 26 && s.pos.y === 28 && k.atlas === s.atlas && k.pos.x === 28 && k.pos.y === 28,
    'art: upstream 3.9.1\'s own cells (Natdex {26,28} / {28,28}; nothing to deploy)', s && [s.atlas, s.pos, k.pos]);
  ok(s && pool_filter(s, 'Joker') === undefined && s.in_pool(s) !== false, 'Stunky can be rolled in the shop (Common)');
  ok(near(energy_values.poison_pct, 0.2) && !('rounds' in energy_values), 'Energy field poison_pct: +20% of base per Energy');
});

// ------------------------------------------------------------------- Stunky: -4% after each hand, never helping the hand that scored
await sec('stunky', () => {
  const [s] = fresh('STK1', ['stunky']);
  ok(req() === 300, 'the Small Blind asks 300', req());
  let r = play(HC2);
  ok(G.GAME.chips === 7 && req() === 288 && state() === 'SELECTING_HAND', 'after hand 1 (7 points): requirement 300 -> 288 (-12, 4% of 300)', [G.GAME.chips, req(), state()]);
  ok(r.drops.join() === '288' && r.msgs.length === 1 && r.msgs[0][0] === s.sort_id && r.msgs[0][1] === '-4%', 'one "-4%" on Stunky, one requirement change event', r);
  // the drop comes after the hand's chips are in (the engine's chips event first)
  const iChips = r.events.findIndex((e) => e.type === 'chips'), iDrop = r.events.findIndex((e) => e.type === 'blind' && e.action === 'chips');
  ok(iChips >= 0 && iDrop > iChips, 'the drop follows the hand\'s scoring (after its chips are added)', [iChips, iDrop]);
  play(HC2); play(HC2);
  ok(req() === 264 && G.GAME.chips === 21, 'after 3 hands: 264 (-12 each, always 4% of the START, not of the lowered one)', req());
  // the hand that scored is judged against the requirement as it was: a hand that reaches it wins, Stunky gives nothing
  fresh('STK2', ['stunky'], { hands: 4 });
  G.GAME.chips = 293;
  r = play(HC2);
  ok(G.GAME.chips === 300 && state() === 'ROUND_EVAL' && r.drops.length === 0 && r.msgs.length === 0, 'a hand that reaches 300 wins as usual; Poison Gas does nothing after it', [G.GAME.chips, state(), r.drops]);
  // the round's final hand: no drop, so it can never turn a short final hand into a win
  fresh('STK3', ['stunky'], { hands: 1 });
  G.GAME.chips = 285;
  r = play(HC2);
  ok(G.GAME.chips === 292 && r.drops.length === 0 && req() === 300 && state() === 'GAME_OVER', 'the final hand (292 of 300; 4% off would be 288): no drop, the run is lost', [G.GAME.chips, req(), state()]);
  // debuffed: nothing
  const [d] = fresh('STK4', ['stunky']);
  debuff(d);
  r = play(HC2);
  ok(req() === 300 && r.drops.length === 0 && r.msgs.length === 0, 'a debuffed Stunky does nothing', [req(), r.drops]);
});

// ------------------------------------------------------------------- won between hands: the lowered requirement already met
await sec('between hands', () => {
  fresh('STKW', ['stunky'], { hands: 4 });
  G.GAME.chips = 285;
  const hl = G.GAME.current_round.hands_left;
  const r = play(HC2);
  ok(G.GAME.chips === 292 && r.drops.join() === '288', 'hand 1 scores 292 of 300 (not a win), then 300 -> 288', [G.GAME.chips, r.drops]);
  ok(state() === 'ROUND_EVAL' && G.GAME.current_round.hands_left === hl - 1, 'the Blind is won right then (292 >= 288): no draw, no extra hand spent', [state(), G.GAME.current_round.hands_left]);
  const rows = (G.GAME.round_eval && G.GAME.round_eval.rows) || [];
  const b1 = rows.find((x) => x.name === 'blind1');
  ok(!b1 || !b1.saved, 'it is a real win (paid the Blind reward, not a Mr. Bones save)', b1);
  act({ type: 'cash_out' });
  ok(state() === 'SHOP', 'and cashes out to the shop', state());
});

// ------------------------------------------------------------------- Skuntank: n x 4%, the cap, never below 1 chip
await sec('skuntank', () => {
  const [k] = fresh('SKU1', ['skuntank'], { hands: 10 });
  const seen = [];
  for (let n = 1; n <= 4; n++) { const r = play(HC2); seen.push([req(), r.msgs.map((m) => m[1]).join()]); }
  ok(JSON.stringify(seen) === JSON.stringify([[288, '-4%'], [264, '-8%'], [228, '-12%'], [180, '-16%']]),
    'after hands 1-4: -4% / -8% / -12% / -16% of 300 (12 / 24 / 36 / 48): 288, 264, 228, 180 (-40% by the end of hand 4)', seen);
  ok(/this Blind: -40%/.test(plain(k)) && /next hand: -20%/.test(plain(k)), 'its tooltip: this Blind -40%, next hand -20%', plain(k));
  play(HC2);
  ok(req() === 120, 'hand 5: -20% (60): 120 (-60%)', req());
  const r = play(HC2);
  ok(req() === 75 && r.drops.join() === '75', 'hand 6 would be -24% (72): capped at -75% of the start in all (only 45 more): 75', [req(), r.drops]);
  const r7 = play(HC2);
  ok(req() === 75 && r7.drops.length === 0 && r7.msgs.length === 0, 'at the cap: nothing more', req());
  // never below 1 chip (another effect already took the requirement down)
  fresh('SKU2', ['skuntank'], { base: 1000 });
  play(HC2);
  ok(req() === 960, 'base 1000: -40', req());
  G.GAME.blind.chips = 20; G.GAME.chips = 0;
  const rm = play(HC2);
  ok(rm.drops.join() === '1' && state() === 'ROUND_EVAL', 'never below 1 chip: another effect left 20, hand 2\'s -80 stops at 1 (not -60); 7 scored >= 1, won', [rm.drops, state()]);
});

// ------------------------------------------------------------------- the reset at the next Blind
await sec('reset', () => {
  const [s] = fresh('STKR', ['stunky']);
  play(HC2); play(HC2);
  ok(req() === 276 && /this Blind: -8%/.test(plain(s)), 'Small Blind: 276 (-8%)', req());
  endRound();
  ok(state() === 'ROUND_EVAL', 'won', state());
  advance();
  ok(req() === 450 && G.GAME.poke_poison && G.GAME.poke_poison.round === G.GAME.round && +G.GAME.poke_poison.base === 450 && +G.GAME.poke_poison.cut === 0,
    'the Big Blind starts at its full 450, a fresh record captured on its first deal', [req(), G.GAME.poke_poison]);
  ok(/this Blind: -0%/.test(plain(s)), 'the tooltip resets to -0%', plain(s));
  G.GAME.current_round.hands_left = 10; G.GAME.chips = 0;
  const [k] = [add('j_poke_skuntank')];
  play(HC2);
  ok(req() === 450 - 18 - 18, 'Big Blind hand 1: Stunky 4% + Skuntank 1 x 4% of 450 (18 + 18): 414; Skuntank\'s count restarts at 1', req());
  play(HC2);
  ok(req() === 414 - 18 - 36, 'hand 2: Stunky 4% + Skuntank 8%: 360', req());
  void k;
});

// ------------------------------------------------------------------- Boss Blinds that set the requirement
await sec('boss', () => {
  for (const [boss, want, step] of [['bl_wall', 1200, 48], ['bl_final_vessel', 1800, 72]]) {
    start('STKB' + boss);
    add('j_poke_stunky');
    endRound(); advance(boss); endRound(); advance(boss);
    ok(G.GAME.blind.config.blind.key === boss && req() === want, `${boss}: the Boss asks ${want}`, [G.GAME.blind.config.blind.key, req()]);
    ok(G.GAME.poke_poison && +G.GAME.poke_poison.base === want, `${boss}: its starting requirement captured on the first deal (${want})`, G.GAME.poke_poison);
    G.GAME.current_round.hands_left = 10; G.GAME.chips = 0;
    play(HC2); play(HC2);
    ok(req() === want - 2 * step, `${boss}: -${step} a hand (4% of ${want}): ${want - 2 * step}`, req());
  }
  // a Wall that Chicot disables: the real start is half (600)
  start('STKBC');
  add('j_poke_stunky'); add('j_chicot');
  endRound(); advance(); endRound(); advance('bl_wall');
  ok(G.GAME.blind.disabled && req() === 600 && +G.GAME.poke_poison.base === 600, 'The Wall disabled by Chicot: starts at 600, the captured base', [req(), G.GAME.poke_poison]);
  G.GAME.current_round.hands_left = 10; G.GAME.chips = 0;
  play(HC2);
  ok(req() === 576, '-24 (4% of 600)', req());
});

// ------------------------------------------------------------------- the HUD (the view) and the event the board draws
await sec('hud', () => {
  fresh('STKH', ['skuntank']);
  const s = new Session();
  s.start({ seed: 'STKHUD', customDeck: { name: 'Skunk', mods: ['pokermon'], jokers: [{ key: 'j_poke_skuntank' }] } });
  s.act({ type: 'select_blind' }); flush();
  ok(s.view().blind && +s.view().blind.chips === 300, 'the HUD asks 300', s.view().blind);
  const ids = G.hand.cards.slice(0, 1).map((c) => c.sort_id);
  s.act({ type: 'highlight', ids });
  const r = s.act({ type: 'play' });
  const ev = r.events.find((e) => e.type === 'blind' && e.action === 'chips');
  ok(ev && +ev.chips === 288 && ev.chip_text === '288', 'the play\'s events carry the new requirement (the board sets "Score at least" from it)', ev);
  ok(+s.view().blind.chips === 288 && G.GAME.blind.chip_text === '288', 'the view (HUD "Score at least") reads 288', [s.view().blind.chips, G.GAME.blind.chip_text]);
  const src = fs.readFileSync(path.join(ROOT, 'js/ui/board.js'), 'utf8');
  ok(/ev\.action === 'chips'[^\n]*bTarget\.textContent = fmt\(ev\.chips\)/.test(src), 'board.js draws a mid-round requirement change on the HUD at that moment');
});

// ------------------------------------------------------------------- resume / replay: the lowered requirement is rebuilt exactly
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'STKRES', customDeck: { name: 'Skunk', mods: ['pokermon'], jokers: [{ key: 'j_poke_skuntank' }, { key: 'j_poke_stunky' }] } });
  s.act({ type: 'select_blind' }); flush();
  for (let h = 0; h < 2; h++) { s.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); s.act({ type: 'play' }); flush(); }
  const was = { req: req(), chips: +G.GAME.chips, cut: +G.GAME.poke_poison.cut, base: +G.GAME.poke_poison.base, hp: G.GAME.current_round.hands_played };
  ok(was.base === 300 && was.req === 300 - (12 + 12) - (12 + 24) && was.hp === 2, 'two hands in: Skuntank 4% + 8%, Stunky 4% + 4%: 240', was);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  const now = { req: req(), chips: +G.GAME.chips, cut: +G.GAME.poke_poison.cut, base: +G.GAME.poke_poison.base, hp: G.GAME.current_round.hands_played };
  ok(!r.stoppedAt && JSON.stringify(now) === JSON.stringify(was), 'resumed mid-Blind: the same lowered requirement, record and score', [was, now]);
  ok(+r.view().blind.chips === was.req, 'and its HUD shows it', r.view().blind);
  r.act({ type: 'highlight', ids: G.hand.cards.slice(0, 1).map((c) => c.sort_id) }); r.act({ type: 'play' }); flush();
  ok(req() === was.req - 36 - 12, 'the resumed run keeps counting: hand 3, Skuntank 12% + Stunky 4%: 192', req());
});

// ------------------------------------------------------------------- Energy
await sec('energy', () => {
  const [s] = fresh('STKE', ['stunky'], { base: 1000 });
  const got = [];
  for (let n = 0; n < 3; n++) { increment_energy(s, 'Dark'); got.push(ex(s).poison_pct); }
  ok(got.every((v, i) => near(v, [4.8, 5.6, 6.4][i])) && ex(s).energy_count === 3, 'Dark Energy: 4% -> 4.8 / 5.6 / 6.4%', got);
  let r = play(HC2);
  ok(req() === 936 && r.msgs.length === 1 && r.msgs[0][1] === '-6.4%', 'a 3-Energy Stunky: -6.4% of 1000 (64): 936', [req(), r.msgs]);
  ok(/drops by 6\.4%/.test(plain(s)), 'its tooltip: 6.4%', plain(s));
  const [c] = fresh('STKC', ['stunky'], { base: 1000 });
  increment_energy(c, 'Colorless');
  ok(near(ex(c).poison_pct, 4.4), 'a mismatched Colorless Energy: half (4.4%)', ex(c).poison_pct);
  const [k] = fresh('SKUE', ['skuntank'], { base: 1000 });
  increment_energy(k, 'Dark'); increment_energy(k, 'Dark');
  play(HC2); r = play(HC2);
  ok(req() === 1000 - 56 - 112 && r.msgs[0][1] === '-11.2%', 'a 2-Energy Skuntank: 5.6%, then 11.2% (56 + 112): 832', [req(), r.msgs]);
  ok(/5\.6%, then 11\.2%, then 16\.8%/.test(plain(k)), 'its tooltip counts in 5.6% steps', plain(k));
  // carried through evolution
  start('STKEV');
  const e = add('j_poke_stunky');
  increment_energy(e, 'Dark');
  for (let r5 = 1; r5 <= 5; r5++) { endRound(); if (r5 < 5) advance(); }
  ok(key(e) === 'j_poke_skuntank' && ex(e).energy_count === 1 && near(ex(e).poison_pct, 4.8), 'after 5 rounds a 1-Energy Stunky becomes a 1-Energy Skuntank (4.8% step)', [key(e), ex(e)]);
});

// ------------------------------------------------------------------- copies stack, Blueprint copies
await sec('copies', () => {
  fresh('STK2X', ['stunky', 'stunky']);
  let r = play(HC2);
  ok(req() === 276 && r.msgs.length === 2, 'two Stunkys: -4% each (24): 276', [req(), r.msgs]);
  const [bp, s] = fresh('STKBP', ['j_blueprint', 'stunky']);
  r = play(HC2);
  ok(req() === 276 && r.msgs.length === 2 && r.msgs.some((m) => m[0] === bp.sort_id) && r.msgs.some((m) => m[0] === s.sort_id), 'Blueprint copies the drop: -4% from each, its own "-4%"', [req(), r.msgs]);
  const [bk, k] = fresh('SKUBP', ['j_blueprint', 'skuntank']);
  play(HC2); r = play(HC2);
  ok(req() === 300 - 24 - 48 && r.msgs.every((m) => m[1] === '-8%') && r.msgs.length === 2, 'Blueprint on Skuntank: 2 x 4% then 2 x 8%: 228', [req(), r.msgs]);
  void bk; void k;
  // the cap is shared by all copies
  fresh('SKU2X', ['skuntank', 'skuntank']);
  const seen = [];
  for (let n = 0; n < 4; n++) { play(HC2); seen.push(req()); }
  ok(JSON.stringify(seen) === JSON.stringify([276, 228, 156, 75]), 'two Skuntanks: -8% / -16% / -24%, then the shared -75% cap (75)', seen);
});

// ------------------------------------------------------------------- text
await sec('text', () => {
  const J = MODS.pokermon.content.loc.descriptions.Joker;
  ok(J.j_poke_stunky && J.j_poke_skuntank, 'the texts');
  const [s, k] = fresh('STKTXT', ['stunky', 'skuntank']);
  let d = plain(s);
  ok(/Poison Gas: after each \| hand you play, the Blind's \| requirement drops by 4% \| of its starting requirement/.test(d) && /Never the hand that scored/.test(d)
    && /reach it and the Blind is won/.test(d) && /Max -75% a Blind; this Blind: -0%/.test(d) && /Evolves after 5 rounds/.test(d), 'Stunky\'s text', d);
  d = plain(k);
  ok(/Toxic: after your nth \| hand this round, the Blind's \| requirement drops by n x 4%/.test(d) && /4%, then 8%, then 12%/.test(d) && /next hand: -4%/.test(d), 'Skuntank\'s text', d);
});

done();
