// The owner's Starly line (2026-10-28; jokers/pokejokers_designs.js "LINE F8"; PORTING.md "The owner's Starly line"):
//   Starly 396 (Basic, Uncommon $6, Colorless)     Flock: +2 Mult for each Colorless Joker you have, itself included.
//                                                  Evolves after 4 rounds.
//   Staravia 397 (Stage 1, Safari $8, Colorless)   Flock: +4 Mult per Colorless Joker, itself included. Evolves after 5 rounds.
//   Staraptor 398 (Stage 2, Safari $10, Colorless) Brave Bird: X(1 + 0.5 per Colorless Joker, itself included).
//                                                  Recoil: each hand played loses $1 (never past the run's debt limit).
//   Counting: Pokermon's is_type (a Tera sticker counts; Castform counts only while Normal, its Colorless form); a debuffed joker
//   doesn't count (as Barboach; unlike Miltank's find_pokemon_type). Energy: the per-joker `mult` (+40% of base each) and
//   Staraptor's per-joker `Xmult_mod` (+20%); the $1 recoil is fixed. Energy carries through evolution.
// Every ability is FIRED through real hands with exact numbers.
//   node micatro/tests/mods/pokermon_starly_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, hand, add, play, clearHand, nextRound, G, P_CENTERS, act } from './poke_helpers.mjs';
import { create_playing_card, P_CARDS } from '../../js/engine/core.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { STATUS } from '../../mods/pokermon/index.js';
import { poke_get_family_list } from '../../mods/pokermon/systems/evolution.js';
import { increment_energy, energy_values } from '../../mods/pokermon/systems/energy.js';
import { apply_type_sticker } from '../../mods/pokermon/systems/types.js';
import { pool_filter } from '../../mods/pokermon/systems/pools.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 600)); } };
const ex = (j) => j.ability.extra;
const lines = (j) => describe(j).lines.join(' | ');
const LINE = ['starly', 'staravia', 'staraptor'];

/** A joker with no scoring effect of its own (Egg) given a Tera sticker: a pure "count". */
function tera(type) { const e = add('j_egg'); apply_type_sticker(e, type); return e; }
/** High Card of one 2 of Spades: 7 Chips, 1 Mult before the jokers. Returns the hand total; the money is settled. */
const high = () => { clearHand(); const t = play(hand(['S_2'])).total; flush(); return t; };
function debuff(j) { j.ability.debuff_sources = { test: true }; j.set_debuff(); return j; }

// ------------------------------------------------------------------- pin, static data, order, pool, art, precedence
sec('pin', () => {
  ok(MODS.pokermon.contentRev >= 32 && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, 'Pokermon contentRev 32+', PINS.modPin('pokermon'));
  ok(PINS.LEGACY_MOD_VERSIONS.pokermon === '3.2.1+r1', 'LEGACY_MOD_VERSIONS untouched');
  for (const n of LINE) {
    ok(P_CENTERS['j_poke_' + n] && !P_CENTERS['j_poke_' + n].unported && STATUS.PORTED.jokers.includes('j_poke_' + n), n + ': registered and ported');
    ok((STATUS.PORTED_FILES['micatro/pokejokers_designs'] || []).includes(n), n + ': defined with the owner\'s designs (micatro/pokejokers_designs)');
  }
  // precedence: neither add-on has the line (their sources never mention it)
  const hits = [];
  const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (/\.(js|json|lua)$/.test(f.name) && /starly|staravia|staraptor/i.test(fs.readFileSync(p, 'utf8'))) hits.push(p); } };
  for (const m of ['nacho', 'pokermonplus']) walk(path.join(ROOT, 'mods', m));
  ok(hits.length === 0, 'neither Nacho nor Pokermon+ has Starly / Staravia / Staraptor (precedence: nothing to dedupe)', hits);
});
sec('static', () => {
  start('STAR0');
  const [s, v, r] = LINE.map((n) => P_CENTERS['j_poke_' + n]);
  ok(s.rarity === 2 && s.cost === 6 && s.stage === 'Basic' && s.ptype === 'Colorless' && s.gen === 4 && s.config.extra.mult === 2 && s.config.extra.rounds === 4,
    'Starly: Uncommon $6, Basic, Colorless, Gen 4, +2 Mult per joker, 4 rounds', [s.rarity, s.cost, s.stage, s.ptype, s.config.extra]);
  ok(v.rarity === 'poke_safari' && v.cost === 8 && v.stage === 'One' && v.ptype === 'Colorless' && v.config.extra.mult === 4 && v.config.extra.rounds === 5,
    'Staravia: Safari $8, Stage 1, Colorless, +4 per joker, 5 rounds', [v.rarity, v.cost, v.stage, v.config.extra]);
  ok(r.rarity === 'poke_safari' && r.cost === 10 && r.stage === 'Two' && r.ptype === 'Colorless' && r.config.extra.Xmult_mod === 0.5 && r.config.extra.recoil === 1,
    'Staraptor: Safari $10, Stage 2, Colorless, X0.5 per joker, $1 recoil', [r.rarity, r.cost, r.stage, r.config.extra]);
  const keys = MODS.pokermon.content.centers.filter((x) => x.set === 'Joker').map((x) => x.key);
  const i = keys.indexOf('j_poke_starly');
  ok(i > 0 && keys[i - 1] === 'j_poke_deoxys' && keys[i + 1] === 'j_poke_staravia' && keys[i + 2] === 'j_poke_staraptor' && keys[i + 3] === 'j_poke_bidoof',
    'Pokédex order: Deoxys (386), Starly, Staravia, Staraptor, Bidoof (399)', keys.slice(i - 1, i + 4));
  const fam = (n) => poke_get_family_list(n).map((x) => (typeof x === 'string' ? x : x.key || x.name)).join();
  ok(/starly.*staravia.*staraptor/.test(fam('starly')) && fam('starly') === fam('staraptor') && poke_get_family_list('starly').length === 3, 'one family: Starly -> Staravia -> Staraptor', fam('starly'));
  ok([[s, 10], [v, 12], [r, 14]].every(([c, x]) => c.atlas === 'poke_AtlasJokersBasicNatdex391' && c.pos.x === x && c.pos.y === 26),
    'art: upstream 3.9.1\'s own cells (Natdex 10,26 / 12,26 / 14,26: the Colorless frame)', [s.atlas, s.pos, v.pos, r.pos]);
  ok(pool_filter(s, 'Joker') === undefined && s.in_pool(s) !== false, 'Starly can be rolled in the shop (Uncommon)');
  ok('mult' in energy_values && 'Xmult_mod' in energy_values && !('recoil' in energy_values) && !('rounds' in energy_values),
    'Energy fields: mult and Xmult_mod (the recoil and the timer are not)');
});

// ------------------------------------------------------------------- Flock: exact Mult for 1-4 Colorless jokers; debuffed don't count
sec('flock', () => {
  start('STAR1');
  const s = add('j_poke_starly');
  ok(/Currently \{C:attention\}1\{C:inactive\}: \{C:mult\}\+2\{/.test(lines(s)), 'alone (the shop card): (Currently 1: +2 Mult)', lines(s));
  let t = high();
  ok(t.chips === 7 && near(t.mult, 1 + 2), '1 (Starly alone, itself included): +2 Mult', t);
  tera('Colorless');
  t = high();
  ok(near(t.mult, 1 + 4), '2 (+ a Colorless-Tera Egg: a Tera sticker counts): +4 Mult', t);
  const mil = add('j_poke_miltank'); // Colorless, money at end of round only
  t = high();
  ok(near(t.mult, 1 + 6), '3 (+ Miltank, Colorless): +6 Mult', t);
  const eg = tera('Colorless');
  t = high();
  ok(near(t.mult, 1 + 8), '4: +8 Mult', t);
  ok(/Currently \{C:attention\}4\{C:inactive\}: \{C:mult\}\+8\{/.test(lines(s)), 'the tooltip shows the count (4) and the Mult (+8)', lines(s));
  add('j_poke_charmander'); add('j_joker'); // a Fire joker and a vanilla joker don't count (Joker +4 Mult of its own)
  t = high();
  ok(near(t.mult, 1 + 8 + 4), 'a Fire joker and a type-less vanilla Joker don\'t count: still +8 (and Joker\'s +4)', t);
  debuff(mil); debuff(eg);
  t = high();
  ok(near(t.mult, 1 + 4 + 4), 'two debuffed Colorless jokers don\'t count: +4', t);
  ok(/Currently \{C:attention\}2\{C:inactive\}: \{C:mult\}\+4\{/.test(lines(s)), 'the tooltip follows (2, +4)', lines(s));

  start('STAR1V');
  const v = add('j_poke_staravia');
  const mults = [];
  for (let n = 1; n <= 4; n++) { if (n > 1) tera('Colorless'); mults.push(high().mult - 1); }
  ok(mults.join() === '4,8,12,16', 'Staravia with 1 / 2 / 3 / 4 Colorless jokers: +4 / +8 / +12 / +16 Mult', mults);
  ok(/Currently \{C:attention\}4\{C:inactive\}: \{C:mult\}\+16\{/.test(lines(v)), 'Staravia\'s tooltip: (Currently 4: +16 Mult)', lines(v));
  // a Tera sticker of another type takes a Colorless joker out of the count
  const st = add('j_poke_miltank'); apply_type_sticker(st, 'Fire');
  ok(near(high().mult - 1, 16), 'a Colorless joker with a Fire Tera sticker is no longer Colorless: still +16');
});

// ------------------------------------------------------------------- Brave Bird: exact X for 1-4 Colorless jokers
sec('brave bird', () => {
  start('STAR2');
  const r = add('j_poke_staraptor');
  ok(/Currently \{C:attention\}1\{C:inactive\}: \{X:mult,C:white\} X1\.5 /.test(lines(r)), 'alone: (Currently 1: X1.5 Mult)', lines(r));
  const xs = [];
  for (let n = 1; n <= 4; n++) { if (n > 1) tera('Colorless'); xs.push(high().mult); }
  ok(xs.join() === '1.5,2,2.5,3', 'Staraptor with 1 / 2 / 3 / 4 Colorless jokers: X1.5 / X2 / X2.5 / X3', xs);
  ok(/Currently \{C:attention\}4\{C:inactive\}: \{X:mult,C:white\} X3 /.test(lines(r)), 'the tooltip: (Currently 4: X3 Mult)', lines(r));
  debuff(tera('Colorless'));
  ok(near(high().mult, 3), 'a debuffed fifth Colorless joker doesn\'t count: still X3');
  // Blueprint copies the X Mult (not the recoil)
  start('STAR2B');
  add('j_blueprint'); add('j_poke_staraptor');
  G.GAME.dollars = 10;
  const t = high();
  ok(near(t.mult, 1.5 * 1.5) && G.GAME.dollars === 9, 'Blueprint copies Brave Bird (X1.5 twice: Blueprint is no Colorless joker) but not the Recoil ($10 -> $9)', [t.mult, G.GAME.dollars]);
});

// ------------------------------------------------------------------- Castform counts only while Normal (its Colorless form)
function stackDeck(specs) {
  for (const c of G.deck.cards.slice()) { G.deck.remove_card(c); G.discard.emplace(c); }
  for (const s of specs) create_playing_card({ front: P_CARDS[s], center: P_CENTERS.c_base }, G.deck);
}
sec('castform', () => {
  for (const [name, deal, form, extra] of [
    ['Normal', ['H_2', 'D_3', 'C_4', 'C_5', 'S_6', 'S_7', 'H_8', 'C_9'], 'normal', 10], // red 3, clubs 3, spades 2: a tie
    ['Sunny', ['H_2', 'D_3', 'H_4', 'C_5', 'C_6', 'S_7', 'S_8', 'D_9'], 'sunny', 0],
    ['Rainy', ['C_2', 'C_3', 'C_4', 'H_5', 'S_6', 'D_7', 'S_8', 'C_9'], 'rainy', 0],
    ['Snowy', ['S_2', 'S_3', 'S_4', 'H_5', 'C_6', 'D_7', 'C_8', 'S_9'], 'snowy', 0],
  ]) {
    start('STARCF' + name, {}, { noBlind: true });
    add('j_poke_starly'); const cf = add('j_poke_castform');
    stackDeck(deal);
    act({ type: 'select_blind' }); flush();
    ok(ex(cf).form === form, `Castform is ${name} this round`, [ex(cf).form, ex(cf).ptype]);
    const t = high(); // a lone Spade 2: no Heart / Diamond / Club scored, no Spade left in hand
    const want = form === 'normal' ? 2 : 1;
    ok(near(t.mult, 1 + 2 * want + extra), `${name} Castform: ${want === 2 ? 'counts (+4, and its own +10)' : 'doesn\'t count (+2)'}`, t);
  }
  // in the shop (Normal again) it counts
  start('STARCF2');
  const s = add('j_poke_starly'); add('j_poke_castform');
  ok(/Currently \{C:attention\}2\{C:inactive\}/.test(lines(s)), 'Castform out of a round (Normal) counts in the tooltip: 2', lines(s));
});

// ------------------------------------------------------------------- Recoil: $1 per hand played, within the debt limit
sec('recoil', () => {
  start('STAR3');
  const r = add('j_poke_staraptor');
  G.GAME.dollars = 5;
  high();
  ok(G.GAME.dollars === 4, 'one hand played: $5 -> $4', G.GAME.dollars);
  high(); high();
  ok(G.GAME.dollars === 2, 'two more hands: $2', G.GAME.dollars);
  clearHand(); act({ type: 'highlight', ids: hand(['S_3']).map((c) => c.sort_id) }); act({ type: 'discard' }); flush();
  ok(G.GAME.dollars === 2, 'a discard costs nothing', G.GAME.dollars);
  G.GAME.dollars = 0;
  const t = high();
  ok(G.GAME.dollars === 0 && near(t.mult, 1.5), 'at $0 (no debt allowed): no loss, Brave Bird still scores X1.5', [G.GAME.dollars, t.mult]);
  add('j_credit_card'); // vanilla: you can go up to -$20 in debt
  ok(G.GAME.bankrupt_at === -20, 'Credit Card: the debt limit is -$20', G.GAME.bankrupt_at);
  high();
  ok(G.GAME.dollars === -1, 'with Credit Card the recoil goes into debt: -$1', G.GAME.dollars);
  G.GAME.dollars = -20;
  high();
  ok(G.GAME.dollars === -20, 'never past the limit: -$20 stays -$20', G.GAME.dollars);
  debuff(r); G.GAME.dollars = 5;
  high();
  ok(G.GAME.dollars === 5, 'a debuffed Staraptor has no recoil', G.GAME.dollars);
  ok(/Recoil:\{\} lose \{C:money\}\$1\{\} each/.test(lines(r)), 'the text: Recoil: lose $1 each hand played', lines(r));
  // Starly / Staravia have no recoil
  start('STAR3B'); add('j_poke_starly'); add('j_poke_staravia'); G.GAME.dollars = 5; high();
  ok(G.GAME.dollars === 5, 'Starly and Staravia cost nothing', G.GAME.dollars);
});

// ------------------------------------------------------------------- evolution after 4 and 5 rounds, Energy carried
sec('evolution', () => {
  start('STAREVO');
  const s = add('j_poke_starly');
  ok(/Evolves after \{C:attention,s:0\.8\}4/.test(lines(s)), 'Starly\'s footer: (Evolves after 4 rounds)', lines(s));
  increment_energy(s, 'Colorless');
  ok(ex(s).energy_count === 1 && near(ex(s).mult, 2.8), '1 Colorless Energy on Starly: +2.8 per joker', ex(s));
  for (let r = 1; r <= 3; r++) { nextRound(); flush(); }
  ok(key(s) === 'j_poke_starly' && ex(s).rounds === 1, 'after 3 rounds: still Starly (1 round left)', [key(s), ex(s).rounds]);
  nextRound(); flush();
  ok(key(s) === 'j_poke_staravia' && ex(s).rounds === 5 && near(ex(s).mult, 5.6) && ex(s).energy_count === 1, 'after the 4th round: Staravia, its Energy re-applied (+5.6 per joker), 5 rounds to go', [key(s), ex(s)]);
  ok(/Evolves after \{C:attention,s:0\.8\}5/.test(lines(s)), 'Staravia\'s footer: (Evolves after 5 rounds)', lines(s));
  ok(near(high().mult, 1 + 5.6), 'energized Staravia alone: +5.6 Mult');
  for (let r = 1; r <= 4; r++) { nextRound(); flush(); }
  ok(key(s) === 'j_poke_staravia' && ex(s).rounds === 1, 'after 4 more rounds: still Staravia', [key(s), ex(s).rounds]);
  nextRound(); flush();
  ok(key(s) === 'j_poke_staraptor' && near(ex(s).Xmult_mod, 0.6) && ex(s).recoil === 1 && ex(s).energy_count === 1,
    'after the 5th: Staraptor, Energy carried (X0.6 per joker), the recoil still $1', [key(s), ex(s)]);
  ok(near(high().mult, 1.6), 'energized Staraptor alone: X1.6');
});

// ------------------------------------------------------------------- Energy: +40% of the base Mult, +20% of the base X per joker
sec('energy', () => {
  start('STAREN');
  const s = add('j_poke_starly'); tera('Colorless');
  for (let i = 0; i < 3; i++) increment_energy(s, 'Colorless');
  ok(ex(s).energy_count === 3 && near(ex(s).mult, 4.4) && ex(s).rounds === 4, '3 Energy: Starly +4.4 per joker (2 x 2.2), the timer untouched', ex(s));
  ok(near(high().mult, 1 + 8.8), 'with 2 Colorless jokers: +8.8 Mult');
  ok(/\+4\.4\{\}/.test(lines(s)) && /\+8\.8\{/.test(lines(s)), 'the tooltip shows +4.4 and the total +8.8', lines(s));
  start('STAREN2');
  const v = add('j_poke_staravia');
  increment_energy(v, 'Colorless'); increment_energy(v, 'Colorless');
  ok(near(ex(v).mult, 7.2), '2 Energy: Staravia +7.2 per joker (4 x 1.8)', ex(v));
  start('STAREN3');
  const r = add('j_poke_staraptor'); tera('Colorless'); tera('Colorless');
  for (let i = 0; i < 3; i++) increment_energy(r, 'Colorless');
  ok(near(ex(r).Xmult_mod, 0.8) && ex(r).recoil === 1, '3 Energy: Staraptor X0.8 per joker; the recoil stays $1', ex(r));
  G.GAME.dollars = 4;
  const t = high();
  ok(near(t.mult, 1 + 0.8 * 3) && G.GAME.dollars === 3, 'with 3 Colorless jokers: X3.4, and $1 recoil', [t.mult, G.GAME.dollars]);
  ok(/X0\.8 \{\} for each/.test(lines(r)) && /X3\.4 /.test(lines(r)), 'the tooltip shows X0.8 and the current X3.4', lines(r));
});

// ------------------------------------------------------------------- vanilla untouched
sec('vanilla', () => {
  start('STARVAN');
  add('j_joker');
  G.GAME.dollars = 4;
  const t = high();
  ok(t.chips === 7 && near(t.mult, 5) && G.GAME.dollars === 4, 'a run without the line plays as before', [t, G.GAME.dollars]);
});

done();
