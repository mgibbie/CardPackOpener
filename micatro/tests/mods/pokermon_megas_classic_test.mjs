// The owner's Mega batch D (contentRev MEGA_D_REV; jokers/pokejokers_megas.js; PORTING.md "Mega batch D"): the 18 classic X/Y + ORAS Megas
// (Sceptile, Blaziken, Swampert, Sableye, Mawile, Aggron, Medicham, Manectric, Sharpedo, Banette, Absol, Glalie, Metagross, Latias, Latios,
// Rayquaza, Garchomp, Diancie) and Mega Salamence hooked up to Pokermon's Salamence. For EVERY one:
//   - a real Mega Stone (act 'use') Mega Evolves the base into it, and the next round the same stone reverts it;
//   - the banks cross both ways (shared banks as they are, a one-form bank kept for the other form);
//   - its effect, fired through real hands (and rounds, sales, consumables);
//   - Energy (the main number at the standard share, the fixed numbers stay; Energy carried through the Mega and back);
//   - save / resume (a run is its recipe) and the replay stepper; the art (every cell's type icon is the joker's type).
// Plus: Mega Absol guarantees every listed probability (Absol makes it 0); Mega Glalie's debt; Mega Salamence reachable; a run recorded before
// MEGA_D_REV replays unchanged (its Mega Stone still picks the joker it picked).
//   node micatro/tests/mods/pokermon_megas_classic_test.mjs
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { T, start, hand, add, clearHand, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { create_playing_card, probability_vars, get_current_pool } from '../../js/engine/core.js';
import { Session } from '../../js/engine/session.js';
import { MODS } from '../../js/mods/registry.js';
import * as PINS from '../../js/mods/pins.js';
import { describe } from '../../js/engine/describe.js';
import { increment_energy, energy_can_use } from '../../mods/pokermon/systems/energy.js';
import * as P from '../../mods/pokermon/api.js';
import * as DESIGNS from '../../mods/pokermon/jokers/pokejokers_designs.js';
import '../../mods/nacho/index.js';
import { ART } from './poke_art_helpers.mjs';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// (imported softly, so on a checkout without batch D the checks fail instead of the import)
const MEGAS = await import('../../mods/pokermon/jokers/pokejokers_megas.js').catch(() => ({}));
const REV = MEGAS.MEGA_D_REV || 84;
const key = (c) => c.config.center.key;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const flush = () => G.E_MANAGER.flush();
const ex = (j) => j.ability.extra;
const cr = () => G.GAME.current_round;
const sec = async (name, fn) => { if (process.env.MEGA_TRACE) console.log('--', name); try { await fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 700)); } };
const plain = (j) => describe(j).lines.join(' ').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
const BASES = ['sceptile', 'blaziken', 'swampert', 'sableye', 'mawile', 'aggron', 'medicham', 'manectric', 'sharpedo', 'banette', 'absol', 'glalie',
  'salamence', 'metagross', 'latias', 'latios', 'rayquaza', 'garchomp', 'diancie'];
const C = (n) => P_CENTERS['j_poke_' + n];

function cards(list) { return list.map((k) => (Array.isArray(k) ? hand([k[0]], { center: k[1] })[0] : hand([k])[0])); }
/** Play `list` (never the round's last hand) -> {mult, chips, money, cards}. */
function play(list, { left, keepHand } = {}) {
  if (!keepHand) clearHand();
  const cs = cards(list);
  G.GAME.chips = 0;
  if (+G.GAME.blind.chips < 1e15) G.GAME.blind.chips = 1e15;
  if (left !== undefined) cr().hands_left = left;
  else if (cr().hands_left < 2) cr().hands_left = 2;
  const $0 = G.GAME.dollars;
  act({ type: 'highlight', ids: cs.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  flush();
  const total = ((r && r.events) || []).find((e) => e.type === 'hand_total') || {};
  return { total, mult: Number(total.mult), chips: Number(total.chips), money: G.GAME.dollars - $0, cards: cs };
}
function endRound() {
  clearHand(); const c = cards(['S_2']);
  G.GAME.chips = G.GAME.blind.chips;
  if (cr().hands_left < 2) cr().hands_left = 2;
  act({ type: 'highlight', ids: c.map((x) => x.sort_id) }); act({ type: 'play' }); flush();
}
function advance() {
  if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
  if (G.STATE === STATES.SHOP) act({ type: 'next_round' });
  G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  act({ type: 'select_blind' }); flush();
  clearHand();
}
const round = () => { endRound(); flush(); advance(); };
const useOn = (item, joker) => { const u = act({ type: 'use', id: item.sort_id, joker_targets: joker ? [joker.sort_id] : undefined }); flush(); return u; };
/** A base through a real Mega Stone -> [the card (now the Mega), the stone]. */
function megaOf(base, prep) {
  const j = add('j_poke_' + base);
  if (prep) prep(j);
  const st = add('c_poke_megastone');
  useOn(st, j);
  return [j, st];
}
/** The next round, the same stone reverts it. */
function revert(j, st) { round(); useOn(st, j); return j; }
const onDeck = (k, center) => {
  const c = create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.deck);
  G.deck.cards.splice(G.deck.cards.indexOf(c), 1);
  G.deck.cards.push(c);
  return c;
};

// ------------------------------------------------------------------- registry
await sec('registry', () => {
  ok(MODS.pokermon.contentRev >= REV && PINS.modPin('pokermon') === '3.9.1+r' + MODS.pokermon.contentRev, `Pokermon contentRev ${REV}+`, PINS.modPin('pokermon'));
  const L = MODS.pokermon.content.loc.descriptions.Joker;
  const keys = MODS.pokermon.content.centers.filter((c) => c.set === 'Joker').map((c) => c.key);
  for (const b of BASES) {
    const m = C('mega_' + b);
    ok(m && m.rarity === 'poke_mega' && m.stage === 'Mega' && m.cost === 12 && m.ptype === C(b).ptype && m.gen === C(b).gen, `mega_${b}: Mega rarity / stage / $12, ${C(b).ptype}, Gen ${C(b).gen} (its base's)`, m && [m.rarity, m.stage, m.cost, m.ptype, m.gen]);
    ok(JSON.stringify(C(b).megas) === JSON.stringify(['mega_' + b]), `${b} lists mega_${b} (the Mega Stone's target)`, C(b).megas);
    ok(keys.indexOf('j_poke_mega_' + b) === keys.indexOf('j_poke_' + b) + 1, `mega_${b} follows ${b} (Pokédex order)`);
    const e = L['j_poke_mega_' + b];
    start('MDT' + b);
    const card = add('j_poke_mega_' + b);
    const lv = m.loc_vars(m, [], card) || {};
    const used = [...new Set((e.text.join(' ').match(/#(\d+)#/g) || []).map((s) => +s.slice(1, -1)))];
    ok(e && e.name === 'Mega ' + L['j_poke_' + b].name && used.every((i) => { const v = (lv.vars || [])[i - 1]; return v !== undefined && v !== null && !Number.isNaN(v); }),
      `mega_${b}: "${e && e.name}" + every #n# filled`, lv.vars);
    ok(P.poke_get_family_list(b).includes('mega_' + b) || P.poke_get_family_list(b).some((y) => y && y.key === 'mega_' + b), `mega_${b} is in ${b}'s family`, P.poke_get_family_list(b));
  }
  // never in a pool; the Mega Stone rolls with any of the bases
  start('MDPOOL');
  const pool = [0.1, 0.8, 0.99].flatMap((r) => get_current_pool('Joker', r)[0]).concat(get_current_pool('Joker', null, true)[0]);
  ok(!BASES.some((b) => pool.includes('j_poke_mega_' + b)), 'no batch D Mega in any shop rarity pool or the Legendary pool');
  ok(!P.megastone_in_pool(), 'no Mega Stone without a Mega-capable joker');
  add('j_poke_absol');
  ok(P.megastone_in_pool(), 'the Mega Stone can roll while Absol is held');
  ok(P_CENTERS.j_nacho_mega_salamence && P.precedence_key('j_nacho_mega_salamence') === 'j_poke_mega_salamence', 'Nacho\'s legacy Mega Salamence is a duplicate of Pokermon\'s now (precedence)', P.precedence_key('j_nacho_mega_salamence'));
});

// ------------------------------------------------------------------- every base: Mega Stone in, out, the banks
await sec('stone in and out', () => {
  for (const b of BASES) {
    start('MDIO' + b);
    const [j, st] = megaOf(b);
    ok(key(j) === 'j_poke_mega_' + b && st.ability.extra.used_on === j.unique_val, `${b} -> Mega ${b} through a Mega Stone`, key(j));
    revert(j, st);
    ok(key(j) === 'j_poke_' + b && st.ability.extra.used_on === undefined, `the next round, the stone reverts it to ${b}`, key(j));
  }
});

await sec('banks carried both ways', () => {
  // Aggron's eaten X rides along on Mega Aggron and is back when it reverts
  start('MDBAGG');
  let [j, st] = megaOf('aggron', (a) => { ex(a).Xmult = 2.2; ex(a).eaten = 3; });
  ok(near(ex(j).poke_kept.Xmult, 2.2) && /X2\.2 is kept/.test(plain(j)), 'Mega Aggron keeps Aggron\'s X2.2 (shown on the card)', [ex(j).poke_kept, plain(j)]);
  revert(j, st);
  ok(near(ex(j).Xmult, 2.2) && ex(j).eaten === 3, 'reverted: Aggron is X2.2 again (3 eaten)', [ex(j).Xmult, ex(j).eaten]);
  // Banette: its +Mult rides on the Mega; the Mega's own X is kept on the card when it reverts, and back on the next Mega Evolution
  start('MDBBAN');
  [j, st] = megaOf('banette', (a) => { ex(a).mult = 9; });
  for (let i = 0; i < 2; i++) { const s = add('j_joker'); act({ type: 'sell', id: s.sort_id }); flush(); }
  ok(near(ex(j).banette_Xmult, 1.5) && ex(j).poke_kept.mult === 9, 'Mega Banette: 2 Jokers sold -> X1.5; Banette\'s +9 Mult kept', [ex(j).banette_Xmult, ex(j).poke_kept]);
  revert(j, st);
  ok(ex(j).mult === 9 && near(ex(j).poke_kept.banette_Xmult, 1.5), 'reverted: Banette +9 Mult, the Mega\'s X1.5 kept on the card', [ex(j).mult, ex(j).poke_kept]);
  round(); useOn(st, j);
  ok(key(j) === 'j_poke_mega_banette' && near(ex(j).banette_Xmult, 1.5) && ex(j).poke_kept.mult === 9, 'Mega again: X1.5 is back', [key(j), ex(j).banette_Xmult]);
  // shared banks: Garchomp's Bite, the Eon duo's and Rayquaza's X, Sableye's round X
  for (const [b, f, mf, v] of [['garchomp', 'bite_mult', 'bite_mult', 14], ['latias', 'eon_Xmult', 'eon_Xmult', 1.6], ['latios', 'eon_Xmult', 'eon_Xmult', 1.75],
    ['rayquaza', 'ascent_Xmult', 'ascent_Xmult', 2.4], ['sableye', 'Xmult', 'deplete_Xmult', 1.5]]) {
    start('MDBS' + b);
    [j, st] = megaOf(b, (a) => { ex(a)[f] = v; });
    ok(near(ex(j)[mf], v), `Mega ${b} keeps ${b}'s ${f} (${v})`, ex(j)[mf]);
    ex(j)[mf] = v + 0.5;
    revert(j, st);
    ok(b === 'sableye' || near(ex(j)[f], v + 0.5), `reverted: ${b} has the Mega's ${f} (${v + 0.5})`, ex(j)[f]);
  }
  // the starters' Nature crosses (the Treecko line's targets)
  start('MDBNAT');
  [j, st] = megaOf('sceptile', (a) => { ex(a).targets = [{ id: 2, value: '2' }, { id: 7, value: '7' }, { id: 9, value: '9' }]; });
  ok(ex(j).targets.map((t) => t.id).join() === '2,7,9' && /Nature: \(2, 7, 9\)/.test(plain(j)), 'Mega Sceptile keeps Sceptile\'s Nature (2, 7, 9)', plain(j));
});

// ------------------------------------------------------------------- the effects, in real hands
await sec('mega sceptile / blaziken / swampert', () => {
  start('MDSC');
  const h0 = G.hand.config.card_limit;
  let [j] = megaOf('sceptile');
  ok(G.hand.config.card_limit === h0 + 1, 'Mega Sceptile: +1 hand size (Sceptile\'s +1 handed over)', [h0, G.hand.config.card_limit]);
  ex(j).targets = [{ id: 14, value: 'Ace' }, { id: 13, value: 'King' }, { id: 12, value: 'Queen' }];
  let r = play(['S_A']);
  ok(near(r.mult, 1.25) && r.money === 3, 'Mega Sceptile: a scored Nature Ace earns $3 and gives X1.25', [r.total, r.money]);
  r = play(['S_5']);
  ok(near(r.mult, 1) && r.money === 0, '... a 5 (not Nature): nothing', [r.total, r.money]);
  start('MDBL');
  const d0 = G.GAME.round_resets.discards;
  [j] = megaOf('blaziken');
  ok(G.GAME.round_resets.discards === d0 + 1, 'Mega Blaziken: +1 discard', [d0, G.GAME.round_resets.discards]);
  ex(j).targets = [{ id: 14, value: 'Ace' }, { id: 13, value: 'King' }, { id: 12, value: 'Queen' }];
  r = play(['S_A', 'H_A']);
  ok(near(r.mult, 2 * 1.5 * 1.5), 'Mega Blaziken, Speed Boost: a Pair of Nature Aces X1.5 each (2 x 1.5 x 1.5)', r.total);
  start('MDSW');
  const hb = G.GAME.round_resets.hands;
  [j] = megaOf('swampert');
  ok(G.GAME.round_resets.hands === hb + 2, 'Mega Swampert: +2 hands (instead of +1)', [hb, G.GAME.round_resets.hands]);
  ex(j).targets = [{ id: 14, value: 'Ace' }, { id: 13, value: 'King' }, { id: 12, value: 'Queen' }];
  r = play(['S_K']);
  ok(r.chips === 5 + 10 + 100, 'Mega Swampert, Swift Swim: a scored Nature King +100 Chips', r.total);
});

await sec('mega sableye', () => {
  start('MDSA');
  const [j] = megaOf('sableye');
  // the deck's only Glass card, drawn by a discard: Glass depleted
  for (const c of G.deck.cards) if (P.has_enhancement(c, 'm_glass')) c.set_ability(P_CENTERS.c_base, null, true);
  onDeck('S_9', 'm_glass');
  clearHand();
  const d = hand(['H_3']);
  act({ type: 'highlight', ids: d.map((c) => c.sort_id) }); act({ type: 'discard' }); flush();
  ok(near(ex(j).deplete_Xmult, 1.5) && ex(j).enhancements.m_glass, 'Mega Sableye: Glass depleted (its last card drawn) -> X1.5', [ex(j).deplete_Xmult, ex(j).enhancements]);
  let r = play(['S_5']);
  ok(near(r.mult, 1.5), 'it scores X1.5', r.total);
  round();
  r = play(['S_5']);
  ok(near(ex(j).deplete_Xmult, 1.5) && near(r.mult, 1.5), 'never resets: X1.5 the next round (Sableye resets)', [ex(j).deplete_Xmult, r.total]);
});

await sec('mega mawile / aggron / medicham', () => {
  start('MDMA');
  megaOf('mawile');
  let r = play([['S_A', 'm_steel']]);
  ok(near(r.mult, 2), 'Mega Mawile, Huge Power: a scored Steel card X2', r.total);
  r = play(['S_A']);
  ok(near(r.mult, 1), '... a plain card: nothing', r.total);
  start('MDAG');
  megaOf('aggron');
  r = play([['S_A', 'm_stone']]);
  const stone = r.cards[0];
  ok(near(r.mult, 1.5) && r.chips === 5 + 50 && G.playing_cards.includes(stone), 'Mega Aggron, Filter: a scored Stone card X1.5 and NOT destroyed', [r.total, G.playing_cards.includes(stone)]);
  r = play([['S_K', 'm_gold'], ['H_K', 'm_steel']]);
  ok(near(r.mult, 2 * 1.5 * 1.5) && r.cards.every((c) => G.playing_cards.includes(c)), '... a Gold + Steel Pair X1.5 each, both kept', r.total);
  start('MDAGB');
  add('j_poke_aggron');
  r = play([['S_A', 'm_stone']]);
  ok(!G.playing_cards.includes(r.cards[0]), '(Aggron itself destroys the Stone card)');
  start('MDME');
  megaOf('medicham');
  r = play(['S_5']);
  ok(near(r.mult, 1), 'Mega Medicham: with discards left, nothing', r.total);
  cr().discards_left = 0;
  r = play(['S_5']);
  ok(near(r.mult, 4), 'Mega Medicham, Pure Power: X4 with 0 discards remaining', r.total);
});

await sec('mega manectric / sharpedo / metagross', () => {
  start('MDMN');
  megaOf('manectric');
  const r = play([['S_K', 'm_gold'], ['H_K', 'm_gold']]);
  ok(r.money === 8, 'Mega Manectric: each scored Gold card earns $4 ($8)', r.money);
  ok(r.cards.every((c) => G.hand.cards.includes(c)), '... and EVERY one is back in hand after scoring', r.cards.map((c) => G.hand.cards.includes(c)));
  start('MDMNB');
  add('j_poke_manectric');
  const rb = play([['S_K', 'm_gold'], ['H_K', 'm_gold']]);
  ok(rb.cards.filter((c) => G.hand.cards.includes(c)).length === 1, '(Manectric returns only the first)');
  start('MDSH');
  const [sh] = megaOf('sharpedo');
  const victim = add('j_joker');
  const m = G.jokers.cards; m.splice(m.indexOf(victim), 1); m.splice(m.indexOf(sh) + 1, 0, victim);
  round();
  ok(G.jokers.cards.includes(victim), 'Mega Sharpedo: selecting a Blind destroys no Joker (the one to its right stays)');
  let p = play(['S_9', 'H_9']);
  ok(near(p.mult, 2 + 4) && G.jokers.cards.includes(victim), '... a first Pair: no X (the Joker adds +4)', p.total);
  p = play(['S_8', 'H_8']);
  ok(near(p.mult, 2 * 4 + 4), 'Mega Sharpedo, Strong Jaw: the Pair again this round X4 (2 x 4, then the Joker +4)', p.total);
  start('MDMG');
  megaOf('metagross');
  p = play(['S_5', 'H_5', 'D_5', 'C_5']);
  ok(near(p.mult, 7 * 16), 'Mega Metagross, Tough Claws: Four of a Kind, each card X2 (7 x 2^4)', p.total);
  p = play(['S_5', 'H_5', 'D_5']);
  ok(near(p.mult, 3), '... a Three of a Kind: nothing', p.total);
});

await sec('mega banette', () => {
  start('MDBN');
  const slots0 = G.jokers.config.card_limit, hands0 = G.GAME.round_resets.hands;
  const b = add('j_poke_banette');
  ok(G.jokers.config.card_limit === slots0 + 1 && G.GAME.round_resets.hands === hands0 - 1, 'Banette: +1 slot, -1 hand');
  const st = add('c_poke_megastone'); useOn(st, b);
  ok(G.jokers.config.card_limit === slots0 + 2 && G.GAME.round_resets.hands === hands0, 'Mega Banette: +2 Joker slots, the hand back', [G.jokers.config.card_limit - slots0, G.GAME.round_resets.hands - hands0]);
  for (let i = 0; i < 3; i++) { const s = add('j_joker'); act({ type: 'sell', id: s.sort_id }); flush(); }
  const r = play(['S_5']);
  ok(near(ex(b).banette_Xmult, 1.75) && near(r.mult, 1.75), 'Mega Banette: 3 Jokers sold -> X1.75', [ex(b).banette_Xmult, r.total]);
});

await sec('mega absol vs absol', () => {
  start('MDAB');
  const a = add('j_poke_absol');
  ok(JSON.stringify(probability_vars(null, 1, 6, 'test')) === '[0,6]', 'Absol: a listed 1 in 6 is 0 in 6', probability_vars(null, 1, 6, 'test'));
  let r = play([['S_A', 'm_lucky']]);
  ok(near(r.mult, 2) && r.money === 0, 'Absol: a Lucky card never triggers (X2 only)', [r.total, r.money]);
  const st = add('c_poke_megastone'); useOn(st, a);
  ok(key(a) === 'j_poke_mega_absol', 'Absol -> Mega Absol');
  ok(JSON.stringify(probability_vars(null, 1, 6, 'test')) === '[6,6]' && JSON.stringify(probability_vars(null, 1, 15, 'lucky_money')) === '[15,15]', 'Mega Absol: 1 in 6 -> 6 in 6 (guaranteed)', probability_vars(null, 1, 6, 'test'));
  r = play([['S_A', 'm_lucky']]);
  ok(near(r.mult, (1 + 20) * 1.5) && r.money === 20, 'Mega Absol, Magic Bounce: a Lucky card always gives +20 Mult and $20; X1.5', [r.total, r.money]);
  ok(/6 in 6/.test(plain(a)), 'its text shows the guarantee', plain(a));
});

await sec('mega glalie debt', () => {
  start('MDGL');
  const b0 = G.GAME.bankrupt_at;
  const g = add('j_poke_glalie');
  ok(G.GAME.bankrupt_at === b0 - 20, 'Glalie: debt to -$20');
  const st = add('c_poke_megastone'); useOn(st, g);
  ok(G.GAME.bankrupt_at === b0 - 50, 'Mega Glalie: debt to -$50 (instead of -$20)', G.GAME.bankrupt_at);
  G.GAME.dollars = -30;
  const r = play(['S_5']);
  ok(near(r.mult, 4), 'Mega Glalie, Refrigerate: $30 of debt -> X1 + 30 x 0.1 = X4', r.total);
  G.GAME.dollars = 10;
  ok(near(play(['S_5']).mult, 1), '... no debt: X1');
  G.GAME.dollars = -30;
  endRound();
  ok(G.GAME.dollars === -30, 'Mega Glalie keeps the debt at end of round (Glalie sets $0)', G.GAME.dollars);
  start('MDGLB'); add('j_poke_glalie'); G.GAME.dollars = -15; endRound();
  ok(G.GAME.dollars === 0, '(Glalie: back to $0)', G.GAME.dollars);
});

await sec('mega salamence reachable', () => {
  start('MDSL');
  const s = add('j_poke_salamence');
  ok(P.megastone_target(undefined) === s, 'Salamence is a Mega Stone target now (it had none)');
  const st = add('c_poke_megastone'); useOn(st, s);
  ok(key(s) === 'j_poke_mega_salamence', 'Salamence -> Mega Salamence (Pokermon\'s)', key(s));
  G.GAME.hands.Straight.played = 3;
  const r = play(['S_5']);
  ok(near(r.mult, 1 + 30), 'Mega Salamence, Aerilate: +10 Mult per Straight played this run (3 -> +30)', r.total);
  revert(s, st);
  ok(key(s) === 'j_poke_salamence', '... and back to Salamence');
});

await sec('mega latias / latios', () => {
  for (const [b, own, other] of [['latias', 'c_hermit', 'c_pluto'], ['latios', 'c_pluto', 'c_hermit']]) {
    start('MDLA' + b);
    const [j] = megaOf(b);
    const t = add(own); useOn(t);
    ok(near(ex(j).eon_Xmult, 1.3), `Mega ${b}: its own kind used -> X1.3`, ex(j).eon_Xmult);
    const p = add(other); useOn(p);
    ok(near(ex(j).eon_Xmult, 1.45), `... the other kind, half (Soul Dew): X1.45`, ex(j).eon_Xmult);
    const r = play(['S_5']);
    ok(near(r.mult, G.GAME.hands['High Card'].mult * 1.45), '... scores X1.45', r.total);
  }
});

await sec('mega rayquaza', () => {
  start('MDRQ');
  const h0 = G.GAME.round_resets.hands, d0 = G.GAME.round_resets.discards;
  const [j] = megaOf('rayquaza');
  ok(G.GAME.round_resets.hands === h0 + 2 && G.GAME.round_resets.discards === d0 + 2, 'Mega Rayquaza, Delta Stream: +2 hands and +2 discards', [G.GAME.round_resets.hands - h0, G.GAME.round_resets.discards - d0]);
  const r = play(['H_2', 'H_5', 'H_7', 'H_9', 'H_K']);
  ok(near(ex(j).ascent_Xmult, 1.4) && near(r.mult, 4 * 1.4), 'Dragon Ascent: a Flush -> X1.4 (+0.4)', [ex(j).ascent_Xmult, r.total]);
  add('j_poke_kyogre'); add('j_poke_groudon');
  round();
  ok(DESIGNS.primal_read().rayquaza === true && DESIGNS.primal_read().winner === null && DESIGNS.castform_lock() === null, 'Mega Rayquaza calms Kyogre and Groudon (no Primal Clash)', DESIGNS.primal_read());
});

await sec('mega garchomp / diancie', () => {
  start('MDGA');
  const [j] = megaOf('garchomp', (a) => { ex(a).bite_mult = 6; });
  clearHand();
  hand(['S_3', 'H_3'], { center: 'm_gold' });
  const r = play(['S_5'], { keepHand: true });
  ok(near(r.mult, (1 + 6) * 3), 'Mega Garchomp, Sand Force: 2 Gold cards held X3, and the +6 Bite Mult', r.total);
  void j;
  start('MDDI');
  megaOf('diancie');
  const diamonds = () => G.playing_cards.filter((c) => c.is_suit('Diamonds', true)).length;
  const n0 = diamonds();
  round();
  ok(diamonds() === n0 + 1, 'Mega Diancie keeps Diamond Storm: a deck card became a Diamond at the Blind', [n0, diamonds()]);
  const p = play(['D_9', 'D_9']);
  ok(p.money === 4 && near(p.mult, 2 * 1.5 * 1.5), 'Mega Diancie: each scored Diamond $2 and X1.5', [p.money, p.total]);
});

// ------------------------------------------------------------------- Energy
await sec('energy', () => {
  const steps = (n, fields, type, fixed = {}) => {
    start('MDEN' + n);
    const j = add('j_poke_mega_' + n);
    const got = {};
    for (let i = 0; i < 3; i++) { increment_energy(j, type); for (const [f] of fields) (got[f] || (got[f] = [])).push(Math.round(ex(j)[f] * 1e9) / 1e9); }
    for (const [f, want] of fields) ok(got[f].every((v, i) => near(v, want[i])), `Mega ${n} + 3 ${type} Energy: ${f} ${want.join(' / ')}`, got[f]);
    for (const [f, v] of Object.entries(fixed)) ok(ex(j)[f] === v, `Mega ${n}: ${f} stays ${v}`, ex(j)[f]);
    return j;
  };
  steps('sceptile', [['Xmult_multi', [1.3125, 1.375, 1.4375]]], 'Grass', { nature_money: 3, h_size: 1 });
  steps('blaziken', [['Xmult_multi', [1.575, 1.65, 1.725]]], 'Fire', { d_size: 1 });
  steps('swampert', [['chip_mod', [120, 140, 160]]], 'Water', { hands: 2 });
  steps('sableye', [['Xmult_mod', [0.6, 0.7, 0.8]]], 'Dark', { deplete_Xmult: 1 });
  steps('mawile', [['Xmult_multi', [2.1, 2.2, 2.3]]], 'Metal');
  steps('aggron', [['Xmult_multi', [1.575, 1.65, 1.725]]], 'Metal');
  steps('medicham', [['Xmult', [4.8, 5.6, 6.4]]], 'Fighting', { d_remaining: 0 });
  steps('sharpedo', [['Xmult', [4.8, 5.6, 6.4]]], 'Water');
  steps('banette', [['Xmult_mod', [0.3, 0.35, 0.4]]], 'Psychic', { card_limit: 2, banette_Xmult: 1 });
  steps('absol', [['Xmult', [1.8, 2.1, 2.4]]], 'Dark');
  steps('glalie', [['Xmult_mod', [0.12, 0.14, 0.16]]], 'Water', { debt: 50 });
  steps('salamence', [['mult_mod', [12, 14, 16]]], 'Dragon');
  steps('metagross', [['Xmult_multi', [2.1, 2.2, 2.3]]], 'Metal');
  steps('latias', [['Xmult_mod', [0.36, 0.42, 0.48]]], 'Psychic', { eon_Xmult: 1 });
  steps('latios', [['Xmult_mod', [0.36, 0.42, 0.48]]], 'Psychic', { eon_Xmult: 1 });
  steps('rayquaza', [['Xmult_mod', [0.48, 0.56, 0.64]]], 'Dragon', { hands: 2, d_size: 2, ascent_Xmult: 1 });
  steps('garchomp', [['Xmult_mod', [1.2, 1.4, 1.6]]], 'Dragon', { bite_mult: 0 });
  steps('diancie', [['Xmult_multi', [1.575, 1.65, 1.725]]], 'Fairy', { diamond_money: 2 });
  start('MDENmanectric');
  const mn = add('j_poke_mega_manectric');
  ok(C('mega_manectric').poke_no_energy_field === true && energy_can_use({ etype: 'Lightning' }, null) !== mn, 'Mega Manectric: Energy-inert (its $4 is fixed)');
  // Energy carries through the Mega and back, re-applied to each form's base
  start('MDENC');
  const s = add('j_poke_sceptile');
  increment_energy(s, 'Grass'); increment_energy(s, 'Grass');
  const st = add('c_poke_megastone'); useOn(st, s);
  ok(key(s) === 'j_poke_mega_sceptile' && ex(s).energy_count === 2 && near(ex(s).Xmult_multi, 1.375), 'Sceptile with 2 Energy -> Mega Sceptile with 2 (X1.375)', [ex(s).energy_count, ex(s).Xmult_multi]);
  revert(s, st);
  ok(key(s) === 'j_poke_sceptile' && ex(s).energy_count === 2, '... and back with 2', ex(s).energy_count);
});

// ------------------------------------------------------------------- save / resume, the replay stepper
await sec('resume', () => {
  const s = new Session();
  s.start({ seed: 'MDRESUME', customDeck: { name: 'MegaD', mods: ['pokermon'], params: { joker_slots: 10, consumable_slots: 8 },
    jokers: [{ key: 'j_poke_latias' }, { key: 'j_poke_aggron' }, { key: 'j_poke_glalie' }],
    consumables: [{ key: 'c_hermit' }, { key: 'c_poke_megastone' }, { key: 'c_poke_megastone' }] } });
  flush();
  const must = (a) => { const r = s.act(a); flush(); if (!r.ok) throw new Error(JSON.stringify(a) + ': ' + r.error); return r; };
  must({ type: 'select_blind' });
  const find = (k) => G.consumeables.cards.find((c) => key(c) === k);
  must({ type: 'use', id: find('c_hermit').sort_id, targets: [] });
  const lat = G.jokers.cards[0], agg = G.jokers.cards[1];
  const stones = G.consumeables.cards.filter((c) => key(c) === 'c_poke_megastone');
  must({ type: 'use', id: stones[0].sort_id, joker_targets: [lat.sort_id] });
  must({ type: 'use', id: stones[1].sort_id, joker_targets: [agg.sort_id] });
  must({ type: 'highlight', ids: G.hand.cards.slice(0, 5).map((c) => c.sort_id) });
  must({ type: 'play' });
  const snap = () => JSON.stringify([G.jokers.cards.map(key), ex(G.jokers.cards[0]).eon_Xmult, ex(G.jokers.cards[0]).energy_count, ex(G.jokers.cards[1]).poke_kept,
    G.consumeables.cards.map((c) => [key(c), c.ability.extra && c.ability.extra.used_on]), G.GAME.chips, G.GAME.dollars, G.jokers.config.card_limit]);
  const live = snap();
  ok(key(lat) === 'j_poke_mega_latias' && near(ex(lat).eon_Xmult, 1.15) && key(agg) === 'j_poke_mega_aggron', 'live: Latias banked a Tarot (X1.15), then Mega Latias + Mega Aggron', live);
  const r = Session.fromRecipe(JSON.parse(JSON.stringify(s.recipe))); flush();
  ok(!r.stoppedAt && snap() === live, 'resumed: the Megas, their banks, the stones exactly', [r.stoppedAt, snap(), live]);
  const stp = Session.stepper(JSON.parse(JSON.stringify(s.recipe))); stp.seek(stp.total);
  ok(!stp.error && snap() === live, 'the replay stepper too', snap());
});

// ------------------------------------------------------------------- a run recorded before MEGA_D_REV replays unchanged
await sec('old rev', () => {
  const s = new Session();
  s.start({ seed: 'MDOLD', customDeck: { name: 'MegaOld', mods: ['pokermon'], params: { joker_slots: 6, consumable_slots: 4 },
    jokers: [{ key: 'j_poke_absol' }, { key: 'j_poke_venusaur' }], consumables: [{ key: 'c_poke_megastone' }] } });
  flush();
  s.act({ type: 'select_blind' }); flush();
  const st = G.consumeables.cards.find((c) => key(c) === 'c_poke_megastone');
  s.act({ type: 'use', id: st.sort_id, targets: [] }); flush();
  ok(G.jokers.cards.map(key).join() === 'j_poke_mega_absol,j_poke_venusaur', `on r${REV}: the leftmost Mega-capable joker is Absol -> Mega Absol`, G.jokers.cards.map(key));
  const old = JSON.parse(JSON.stringify(s.recipe));
  old.modVersions = { ...old.modVersions, pokermon: '3.9.1+r' + (REV - 1) };
  const r = Session.fromRecipe(old, { repin: true }); flush();
  ok(!r.stoppedAt && G.jokers.cards.map(key).join() === 'j_poke_absol,j_poke_mega_venusaur',
    `the same moves recorded on r${REV - 1}: Absol has no Mega there, the stone takes Venusaur (as recorded)`, [r.stoppedAt, G.jokers.cards.map(key)]);
  ok(PINS.RULES.pins === null && C('absol').megas && C('absol').megas[0] === 'mega_absol', 'live play is back on the current rules');
  PINS.RULES.pins = { pokermon: '3.9.1+r' + (REV - 1) };
  try {
    ok(BASES.every((b) => C(b).megas === undefined) && !P.poke_get_family_list('absol').includes('mega_absol'), `on r${REV - 1}: no base lists a batch D Mega, none is in a family`);
  } finally { PINS.RULES.pins = null; }
});

// ------------------------------------------------------------------- the art
if (ART) {
  await sec('cell types', async () => {
    const AT = await import(pathToFileURL(path.join(ROOT, '..', 'tools/micatro/pokermon_art_type.mjs')).href);
    const jokers = Object.values(P_CENTERS).filter((c) => c && c.set === 'Joker' && c.mod === 'pokermon')
      .map((c) => ({ name: c.name, mod: c.mod, ptype: c.ptype, stage: c.stage, ...(c.poke_sprite391 ? { design: true } : {}) }));
    const typer = await AT.loadArtTyper({ assets: path.join(ART, 'Basic Series'), jokers });
    for (const b of BASES) {
      const c = C('mega_' + b), sheet = c.atlas.replace(/^poke_AtlasJokersBasic/, '').replace(/391$/, '');
      const r = typer.typeOfEntry({ atlas: 'AtlasJokersBasic' + sheet, pos: [c.pos.x, c.pos.y] });
      ok(r && r.ptype === c.ptype, `mega_${b}'s cell ${sheet} {${c.pos.x},${c.pos.y}} shows ${c.ptype}`, r);
      ok(c.soul_pos && c.soul_pos.x === c.pos.x + 1 && c.soul_pos.y === c.pos.y, `mega_${b}: its soul is the cell beside it`, c.soul_pos);
    }
  });
} else console.log('(Pokermon art not on disk: the cell type checks are skipped; set MICATRO_MAIN)');

done();
