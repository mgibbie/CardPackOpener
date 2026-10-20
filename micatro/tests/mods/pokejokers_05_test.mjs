// Pokermon pokejokers_05 (Starmie -> Mega Mewtwo Y): every one of the 36 jokers fired through
// real plays (act), plus each line's evolution (Eevee's 8 branches included). On the Pokermon 3.9.1 behaviour (batch 6).
//   node micatro/tests/mods/pokejokers_05_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act, STATES } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { mega_for } from '../../mods/pokermon/systems/items.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
// (probabilities.normal 0 reads as 1 in the engine, so "never" is a vanishing 1e-9)
const prob = (n) => { G.GAME.probabilities.normal = n; };
const cons = () => G.consumeables.cards.map(key);
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FILE_JOKERS = ['starmie', 'mrmime', 'scyther', 'jynx', 'electabuzz', 'magmar', 'pinsir', 'mega_pinsir', 'tauros', 'taurosh', 'magikarp', 'gyarados',
  'mega_gyarados', 'lapras', 'ditto', 'eevee', 'vaporeon', 'jolteon', 'flareon', 'porygon', 'omanyte', 'omastar', 'kabuto', 'kabutops', 'aerodactyl',
  'mega_aerodactyl', 'snorlax', 'articuno', 'zapdos', 'moltres', 'dratini', 'dragonair', 'dragonite', 'mewtwo', 'mega_mewtwo_x', 'mega_mewtwo_y'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 36 pokejokers_05 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_05.lua'].length === 36, 'defs: 36 from pokejokers_05.lua', STATUS.PORTED_FILES['pokemon/pokejokers_05.lua'].length);
{
  start('LOC5');
  const bad = [];
  for (const n of FILE_JOKERS) {
    const c = add('j_poke_' + n);
    try { c.config.center.loc_vars(c.config.center, [], c); } catch (e) { bad.push(n + ': ' + e.message); }
    c.remove(); G.E_MANAGER.flush();
  }
  ok(bad.length === 0, 'loc_vars works for all 36', bad);
}

// ---------------------------------------------------------------- Starmie / Mr. Mime
{
  start('STARMIE');
  add('j_poke_starmie');
  const d0 = G.GAME.dollars;
  const r = play(hand(['D_A', 'H_A']));
  ok(r.total.mult === 2 + 2 && G.GAME.dollars === d0 + 2, 'starmie: +2 Mult and $2 per scored Diamond', { t: r.total, d: G.GAME.dollars - d0 });
}
{
  start('MIME');
  add('j_poke_mrmime');
  hand(['S_K'], { center: 'm_steel' });
  let r = play(hand(['S_A']));
  ok(near(r.total.mult, Math.pow(1.5, 4)), 'mr. mime: leftmost held card retriggered 3 times', r.total);
  clearHand();
  hand(['S_Q']);
  hand(['S_K'], { center: 'm_steel' });
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.5), 'mr. mime: only the leftmost card, and only if it has an effect', r.total);
}

// ---------------------------------------------------------------- Scyther
{
  start('SCYTH');
  const s = add('j_poke_scyther');
  const victim = add('j_joker');
  nextRound();
  ok(!G.jokers.cards.includes(victim) && s.ability.extra.mult === 4 && !s.edition, 'scyther: slices the joker to its right (+4 Mult, no edition for a Common)', s.ability.extra);
  const rare = add('j_baron');
  nextRound();
  ok(!G.jokers.cards.includes(rare) && s.ability.extra.mult === 8 && s.edition && (s.edition.foil || s.edition.holo || s.edition.polychrome), 'scyther: a Rare gives it Foil/Holo/Polychrome', s.edition);
  const r = play(hand(['S_A']));
  ok(r.total.mult >= 9, 'scyther: +8 Mult scored', r.total);
  s.ability.metal_sticker = true;
  winRound();
  ok(key(s) === 'j_poke_scizor', 'scyther -> scizor with a Metal sticker', key(s));
}
{
  start('SCYTH2');
  const s = add('j_poke_scyther');
  s.ability.extra.evolve = true; // Hard Stone
  winRound();
  ok(key(s) === 'j_poke_kleavor', 'scyther -> kleavor with a Hard Stone', key(s));
}

// ---------------------------------------------------------------- Jynx
{
  start('JYNX');
  add('j_poke_jynx');
  const [t] = hand(['S_A']);
  const n0 = G.playing_cards.length;
  const cr = add('c_cryptid');
  act({ type: 'use', id: cr.sort_id, targets: [t.sort_id] });
  ok(G.playing_cards.length === n0 + 4, 'jynx: every playing card added is duplicated (Cryptid 2 -> 4)', G.playing_cards.length - n0);
  const hs = G.hand.config.card_limit;
  while (G.playing_cards.length < G.GAME.starting_deck_size + 12) hand(['H_2']);
  clearHand();
  nextRound();
  ok(G.hand.config.card_limit === hs + 2, 'jynx: +2 hand size for the round when the deck has 12+ extra cards', G.hand.config.card_limit);
  winRound(); act({ type: 'cash_out' });
  ok(G.hand.config.card_limit === hs, 'jynx: hand size bonus ends with the round', G.hand.config.card_limit);
}
{
  start('JYNX2');
  add('j_poke_jynx');
  const mareep = add('j_poke_mareep');
  const [t] = hand(['S_A']);
  const n0 = G.playing_cards.length;
  const cr = add('c_cryptid');
  act({ type: 'use', id: cr.sort_id, targets: [t.sort_id] });
  G.E_MANAGER.flush();
  ok(G.playing_cards.length === n0 + 4 && near(mareep.ability.extra.Xmult, 1.2), 'jynx: its copies are announced as added cards, so Mareep scales twice (Pokermon 3.9.1)', { n: G.playing_cards.length - n0, x: mareep.ability.extra.Xmult });
  ok(G.playing_cards.every((c) => !c.jynx), 'jynx: the copies\' mark clears after the announcement (Pokermon 3.9.1)');
}
{
  start('JYNX3');
  add('j_poke_jynx'); add('j_poke_jynx');
  const [t] = hand(['S_A']);
  const n0 = G.playing_cards.length;
  const cr = add('c_cryptid');
  act({ type: 'use', id: cr.sort_id, targets: [t.sort_id] });
  G.E_MANAGER.flush();
  ok(G.playing_cards.length === n0 + 6, 'jynx: two Jynx copy the 2 new cards once each, never each other\'s copies (Pokermon 3.9.1)', G.playing_cards.length - n0);
}

// ---------------------------------------------------------------- Electabuzz
{
  start('BUZZ');
  const e = add('j_poke_electabuzz');
  const sc0 = e.sell_cost;
  const j = add('j_joker');
  act({ type: 'sell', id: j.sort_id });
  G.E_MANAGER.flush();
  ok(e.sell_cost === sc0 + 2, 'electabuzz: +$2 sell value when a card is sold', [sc0, e.sell_cost]);
  winRound();
  ok(e.sell_cost === sc0 + 4, 'electabuzz: +$2 sell value at end of round', e.sell_cost);
  const row = G.GAME.round_eval.rows.find((x) => x.center === 'j_poke_electabuzz');
  ok(row && row.dollars === Math.ceil(e.sell_cost * 0.25), 'electabuzz: earns 25% of its sell value (rounded up)', row);
  act({ type: 'cash_out' });
  e.ability.extra.evolve = true;
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound();
  ok(key(e) === 'j_poke_electivire', 'electabuzz -> electivire with a Linking Cord', key(e));
}

// ---------------------------------------------------------------- Magmar
{
  start('MAGMAR');
  const m = add('j_poke_magmar');
  const [c] = hand(['S_5']);
  hand(['S_6', 'S_7']);
  const n0 = G.playing_cards.length;
  act({ type: 'highlight', ids: [c.sort_id] });
  act({ type: 'discard' });
  ok(m.ability.extra.mult === 2 && G.playing_cards.length === n0 - 1 && !G.playing_cards.includes(c), 'magmar: first 1-card discard is destroyed, +2 Mult', { m: m.ability.extra.mult, n: G.playing_cards.length - n0 });
  clearHand();
  const [c2] = hand(['S_9']);
  act({ type: 'highlight', ids: [c2.sort_id] });
  act({ type: 'discard' });
  ok(m.ability.extra.mult === 2 && G.playing_cards.includes(c2), 'magmar: only the first discard', m.ability.extra.mult);
  clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'magmar: +2 Mult scored', r.total);
  m.ability.extra.evolve = true;
  winRound();
  ok(key(m) === 'j_poke_magmortar', 'magmar -> magmortar with a Linking Cord', key(m));
}
{
  start('MAGMAR2');
  add('j_blueprint');
  const m = add('j_poke_magmar');
  m.ability.extra.mult = 4;
  const r = play(hand(['S_A']));
  ok(P_CENTERS.j_poke_magmar.blueprint_compat === true && r.total.mult === 1 + 4 + 4, 'magmar: Blueprint copies its Mult (Pokermon 3.9.1)', r.total);
}

// ---------------------------------------------------------------- Pinsir / Mega Pinsir
{
  start('PINSIR');
  add('j_poke_pinsir');
  hand(['H_A']);
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'pinsir: X2 when a held card shares a scoring rank', r.total);
  clearHand();
  hand(['H_K']);
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'pinsir: nothing otherwise', r.total);
  G.jokers.cards[0].remove();
  add('j_poke_mega_pinsir');
  clearHand();
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 * 2 * 2, 'mega pinsir: X2 per scored unenhanced card', r.total);
  r = play(hand(['S_A', 'H_A'], { center: 'm_bonus' }));
  ok(r.total.mult === 2, 'mega pinsir: enhanced cards excluded', r.total);
}

// ---------------------------------------------------------------- Tauros / Tauros (Herd)
{
  start('TAUROS');
  add('j_poke_tauros');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1.75, 'tauros: X1.75 for each Tauros (itself)', r.total);
  add('j_poke_taurosh');
  r = play(hand(['S_A']));
  ok(near(r.total.mult, (1.75 + 6) * 1.75), 'tauros herd: +6 Mult, and Tauros gives X1.75 for it too', r.total);
  // Rerolls: 1 in 15 to add a Tauros (Herd) to the shop.
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  prob(1000);
  const n = G.shop_jokers.cards.length;
  act({ type: 'reroll_shop' });
  ok(G.shop_jokers.cards.some((c) => key(c) === 'j_poke_taurosh') && G.shop_jokers.cards.length === n + 1, 'tauros: reroll adds a Tauros (Herd) to the shop', G.shop_jokers.cards.map(key));
}

// ---------------------------------------------------------------- Magikarp / Gyarados
{
  start('KARP');
  const j = add('j_poke_magikarp');
  let r = play(hand(['S_A', 'H_K']));
  ok(r.total.chips === 5 + 11 + 10 + 1, 'magikarp: +1 chip, and every played card scores (Splash)', r.total);
  j.ability.extra.rounds = 1;
  winRound();
  ok(key(j) === 'j_poke_gyarados', 'magikarp -> gyarados', key(j));
  nextRound();
  r = play(hand(['S_A', 'H_K']));
  ok(r.total.mult === 2.5 && r.total.chips === 16, 'gyarados: X2.5 (no more Splash)', r.total);
}
{
  start('MGYARA');
  add('j_poke_mega_gyarados');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 3, 'mega gyarados: X3', r.total);
  nextRound(); nextRound(); // Big, Boss
  ok(G.GAME.blind.get_type() === 'Boss' && G.GAME.blind.disabled, 'mega gyarados: disables the Boss Blind when selected', G.GAME.blind.disabled);
}
{
  start('MGYARA2');
  nextRound(); nextRound();
  ok(!G.GAME.blind.disabled, 'boss active before');
  add('j_poke_mega_gyarados');
  ok(G.GAME.blind.disabled, 'mega gyarados: disables a Boss already in play when obtained');
}

// ---------------------------------------------------------------- Lapras
{
  start('LAPRAS', {}, { noBlind: true });
  const l = add('j_poke_lapras');
  G.GAME.round_resets.free_rerolls = 1;
  G.GAME.current_round.free_rerolls = 0;
  act({ type: 'skip_blind' });
  G.E_MANAGER.flush();
  ok(G.GAME.current_round.free_rerolls === 1, 'lapras: the skip shop resets its free rerolls (Pokermon 3.9.1)', G.GAME.current_round.free_rerolls);
  G.GAME.round_resets.free_rerolls = 0;
  ok(G.STATE === STATES.SHOP && G.GAME.lapras_skip === true && G.shop_jokers.cards.length > 0, 'lapras: skipping a blind visits the shop', G.STATE);
  act({ type: 'next_round' });
  ok(G.GAME.lapras_skip === undefined && G.STATE === STATES.BLIND_SELECT && G.GAME.blind_on_deck === 'Big', 'lapras: back to the next blind after the shop', [G.STATE, G.GAME.blind_on_deck]);
  act({ type: 'select_blind' }); clearHand();
  const r = play(hand(['S_A']));
  ok(r.total.chips === 16 + 25 && l.ability.extra.chips === 25, 'lapras: +25 chips per blind skipped', r.total);
}

// ---------------------------------------------------------------- Ditto
{
  start('DITTO');
  ok(P_CENTERS.j_poke_ditto.in_pool(P_CENTERS.j_poke_ditto) === true, 'ditto in pool without a Perishable joker');
  const j = add('j_joker');
  const d = add('j_poke_ditto');
  j.ability.perishable = true;
  ok(P_CENTERS.j_poke_ditto.in_pool(P_CENTERS.j_poke_ditto) === false, 'ditto: out of pool with a Perishable joker');
  const sh = add('j_ring_master');
  ok(P_CENTERS.j_poke_ditto.in_pool(P_CENTERS.j_poke_ditto) === true, 'ditto: Showman keeps it in pool even with a Perishable joker (Pokermon 3.9.1)');
  sh.remove(); G.E_MANAGER.flush();
  j.ability.perishable = undefined;
  winRound(); act({ type: 'cash_out' });
  const w = act({ type: 'next_round' });
  ok(key(d) === 'j_joker' && d.ability.perishable === true && d.ability.colorless_sticker === true, 'ditto: transforms into the leftmost joker, Perishable + Colorless', [key(d), d.ability.perishable, d.ability.colorless_sticker]);
  ok(statusMsgs(w.events).includes('Transformed!'), 'ditto: "Transformed!"', statusMsgs(w.events));
}

// ---------------------------------------------------------------- Eevee + eeveelutions
{
  start('EEVEE');
  const eevee = add('j_poke_eevee');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4, 'eevee: +4 Mult per Joker that can evolve, itself included (Pokermon 3.9.1)', r.total);
  const bulba = add('j_poke_bulbasaur');
  add('j_joker'); add('j_poke_vaporeon'); add('j_poke_mega_venusaur');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 * 2 + 4, 'eevee: Bulbasaur counts; a plain Joker, a final stage and a Mega don\'t (Pokermon 3.9.1)', r.total);
  ok(eevee.config.center.loc_vars(eevee.config.center, [], eevee).vars.join() === '4,8', 'eevee: text shows +4 per and the current +8 (Pokermon 3.9.1)', eevee.config.center.loc_vars(eevee.config.center, [], eevee).vars);
  bulba.remove(); G.E_MANAGER.flush();
  for (const c of G.jokers.cards.slice()) if (c !== eevee) { c.remove(); G.E_MANAGER.flush(); }
  const branches = { waterstone: 'vaporeon', thunderstone: 'jolteon', firestone: 'flareon', sunstone: 'espeon', moonstone: 'umbreon', leafstone: 'leafeon', icestone: 'glaceon', shinystone: 'sylveon' };
  G.jokers.config.card_limit = 20;
  const ev = {};
  for (const stone of Object.keys(branches)) { const e = add('j_poke_eevee'); e.ability.extra.evolve = stone; ev[stone] = e; }
  winRound();
  ok(Object.entries(branches).every(([s, n]) => key(ev[s]) === 'j_poke_' + n), 'eevee: each stone picks its eeveelution', Object.fromEntries(Object.entries(ev).map(([s, e]) => [s, key(e)])));
}
{
  start('VAPOR');
  add('j_poke_vaporeon');
  const [a] = hand(['S_A']);
  play([a]);
  ok(!a.ability.perma_bonus, 'vaporeon: nothing without a scoring Bonus card (Pokermon 3.9.1)', a.ability.perma_bonus);
  const [b] = hand(['S_K'], { center: 'm_bonus' });
  const [c] = hand(['H_K']);
  play([b, c]);
  ok(b.ability.perma_bonus === 4 && c.ability.perma_bonus === 4, 'vaporeon: a scoring Bonus card gives every card in the hand +4 Chips permanently (Pokermon 3.9.1)', [b.ability.perma_bonus, c.ability.perma_bonus]);
  const [d, e] = hand(['S_Q', 'H_Q'], { center: 'm_bonus' });
  const [f] = hand(['D_Q']);
  play([d, e, f]);
  ok(d.ability.perma_bonus === 8 && f.ability.perma_bonus === 8, 'vaporeon: once per scoring Bonus card (Pokermon 3.9.1)', [d.ability.perma_bonus, f.ability.perma_bonus]);
}
{
  start('JOLT');
  add('j_poke_jolteon');
  const [g] = hand(['S_A'], { center: 'm_gold' });
  hand(['S_K']);
  const d0 = G.GAME.dollars;
  act({ type: 'highlight', ids: [g.sort_id] });
  act({ type: 'discard' });
  ok(G.GAME.dollars === d0 + 5, 'jolteon: $5 per discarded Gold card', G.GAME.dollars - d0);
  const [k] = G.hand.cards.filter((c) => key(c) === 'c_base');
  const d1 = G.GAME.dollars;
  act({ type: 'highlight', ids: [k.sort_id] });
  act({ type: 'discard' });
  ok(G.GAME.dollars === d1, 'jolteon: nothing for other cards', G.GAME.dollars - d1);
  const [g2] = hand(['H_A'], { center: 'm_gold' });
  g2.debuff = true;
  const d2 = G.GAME.dollars;
  act({ type: 'highlight', ids: [g2.sort_id] });
  const w = act({ type: 'discard' });
  ok(G.GAME.dollars === d2 && statusMsgs(w.events).includes('Debuffed'), 'jolteon: a debuffed Gold card pays nothing (Pokermon 3.9.1)', { d: G.GAME.dollars - d2, m: statusMsgs(w.events) });
}
{
  start('FLARE');
  add('j_poke_flareon');
  hand(['S_K', 'S_Q'], { center: 'm_mult' });
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'flareon: Mult cards held do nothing (Pokermon 3.9.1)', r.total);
  clearHand();
  r = play(hand(['S_A', 'H_A', 'D_A'], { center: 'm_mult' }));
  // Three of a Kind (3 Mult): +4, then +4 X2, then +4 X2 — the last 2 Mult cards
  ok(r.total.mult === ((3 + 4 + 4) * 2 + 4) * 2, 'flareon: the last 2 scoring Mult cards give X2 (Pokermon 3.9.1)', r.total);
}

// ---------------------------------------------------------------- Porygon
{
  start('PORY');
  const ep = G.GAME.energy_plus || 0;
  const p = add('j_poke_porygon');
  ok(G.GAME.energy_plus === ep + 1, 'porygon: +1 Energy limit', G.GAME.energy_plus);
  winRound(); act({ type: 'cash_out' });
  G.GAME.dollars = 100;
  act({ type: 'buy', id: G.shop_booster.cards[0].sort_id });
  ok(G.consumeables.cards.some((c) => c.ability.set === 'Energy'), 'porygon: opening a booster creates an Energy card', cons());
  act({ type: 'skip_booster' });
  p.ability.extra.evolve = true;
  act({ type: 'next_round' }); act({ type: 'select_blind' }); clearHand();
  winRound();
  // Porygon's +1 is removed with it; Porygon2 (pokejokers_08) brings its own +2 when ported.
  const ep2 = P_CENTERS.j_poke_porygon2.add_to_deck ? 2 : 0;
  ok(key(p) === 'j_poke_porygon2' && G.GAME.energy_plus === ep + ep2, 'porygon -> porygon2 with an Upgrade (energy limit handed over)', [key(p), G.GAME.energy_plus]);
}

// ---------------------------------------------------------------- Omanyte / Omastar
{
  start('OMANYTE');
  const j = add('j_poke_omanyte');
  const d0 = G.GAME.dollars;
  play(hand(['S_3', 'H_3', 'D_3']));
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards[0].ability.set === 'Tarot' && G.consumeables.cards[1].ability.set === 'Item', 'omanyte: three 3s -> Tarot + Item', cons());
  ok(G.GAME.dollars === d0 + 2 && j.ability.extra.third_times === 1, 'omanyte: two+ 3s -> $2; third level counted', { d: G.GAME.dollars - d0, t: j.ability.extra.third_times });
  j.ability.extra.third_times = 5;
  winRound();
  ok(key(j) === 'j_poke_omastar', 'omanyte -> omastar after 5 triple-3 hands', key(j));
}
{
  start('OMASTAR');
  const j = add('j_poke_omastar');
  const d0 = G.GAME.dollars, nt = G.GAME.tags.length;
  play(hand(['S_3', 'H_3', 'D_3', 'C_3']));
  ok(G.consumeables.cards.length === 2 && G.GAME.dollars === d0 + 4, 'omastar: Tarot + Item, $4', { c: cons(), d: G.GAME.dollars - d0 });
  ok(G.GAME.tags.length === nt + 1 && ['tag_handy', 'tag_garbage', 'tag_investment', 'tag_economy', 'tag_d_six'].includes(G.GAME.tags[nt].key) && j.ability.extra.tag_created === true, 'omastar: four 3s -> a tag', G.GAME.tags.map((t) => t.key));
  play(hand(['S_3', 'H_3', 'D_3', 'C_3']));
  ok(G.GAME.tags.length === nt + 1, 'omastar: one tag per round');
  winRound();
  ok(j.ability.extra.tag_created === undefined, 'omastar: tag resets at end of round');
}

// ---------------------------------------------------------------- Kabuto / Kabutops
{
  start('KABUTO');
  const j = add('j_poke_kabuto');
  const twos = hand(['S_2', 'H_2', 'D_2']);
  let r = play(twos);
  ok(r.total.chips === 30 + 6 + 50 + 50 && twos.every((c) => c.ability.perma_bonus === 5) && j.ability.extra.third_times === 1, 'kabuto: 1+ 3 -> +50, 2+ -> 2s +5 perma, 3+ -> +50', { t: r.total, p: twos.map((c) => c.ability.perma_bonus) });
  r = play(hand(['S_2']));
  ok(r.total.chips === 5 + 2 + 50, 'kabuto: one 2 -> +50 chips', r.total);
  j.ability.extra.third_times = 5;
  winRound();
  ok(key(j) === 'j_poke_kabutops', 'kabuto -> kabutops after 5', key(j));
  nextRound();
  const four = hand(['S_2', 'H_2', 'D_2', 'C_2']);
  r = play(four);
  // each 2 scores twice (4+ -> retrigger): 2, then 2+5; perma +5 per pass
  ok(r.total.chips === 60 + 4 * (2 + 7) + 70 + 70 && four.every((c) => c.ability.perma_bonus === 10), 'kabutops: +70/+70, perma +5, four 2s retriggered', { t: r.total, p: four.map((c) => c.ability.perma_bonus) });
}

// ---------------------------------------------------------------- Aerodactyl / Mega Aerodactyl
{
  start('AERO');
  const j = add('j_poke_aerodactyl');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2, 'aerodactyl: one Ace -> X2', r.total);
  r = play(hand(['S_A', 'H_A']));
  ok(r.total.mult === 2 * 2.5 && j.ability.extra.Xmult === 2.5, 'aerodactyl: two Aces -> +X0.5 (this round)', r.total);
  prob(1e-9);
  const three = hand(['S_A', 'H_A', 'D_A']);
  r = play(three);
  ok(key(three[0]) === 'm_glass' && j.ability.extra.Xmult === 3, 'aerodactyl: three Aces -> first base Ace becomes Glass', { k: three.map(key), x: j.ability.extra.Xmult });
  r = play(hand(['S_A', 'H_A', 'D_A', 'C_A']));
  ok(j.ability.extra.Xmult === 7, 'aerodactyl: four Aces -> +0.5 then double', j.ability.extra.Xmult);
  const w = winRound();
  ok(j.ability.extra.Xmult === 2 && statusMsgs(w.events).includes('Reset'), 'aerodactyl: resets to Xmult1 at end of round (Pokermon 3.9.1)', j.ability.extra.Xmult);
}
{
  start('MAERO');
  add('j_poke_mega_aerodactyl');
  prob(1e-9);
  const aces = hand(['S_A', 'H_A']);
  let r = play(aces);
  ok(r.total.mult === 2 * 2 * 2 && G.playing_cards.includes(aces[0]), 'mega aerodactyl: each Ace X(1 per Ace)', r.total);
  prob(1000);
  const aces2 = hand(['S_A', 'H_A', 'S_K']);
  r = play(aces2);
  ok(!G.playing_cards.includes(aces2[0]) && !G.playing_cards.includes(aces2[1]), 'mega aerodactyl: Aces destroyed on the roll', aces2.map((c) => G.playing_cards.includes(c)));
}

// ---------------------------------------------------------------- Snorlax
{
  start('SNORLAX');
  const j = add('j_poke_snorlax');
  ok(cons().includes('c_poke_leftovers'), 'snorlax: comes holding Leftovers', cons());
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'snorlax: X1 does nothing', r.total);
  winRound();
  ok(near(j.ability.extra.Xmult, 1.2), 'snorlax: +X0.2 per Leftovers each round', j.ability.extra.Xmult);
  nextRound();
  r = play(hand(['S_A']));
  ok(near(r.total.mult, 1.2), 'snorlax: X1.2 scored', r.total);
}

// ---------------------------------------------------------------- Legendary birds
{
  start('ARTI');
  add('j_poke_articuno');
  const cards = hand(['S_A', 'H_A']);
  const r = play(cards);
  ok(cards[0].edition && cards[0].edition.foil && ['Gold', 'Red', 'Blue', 'Purple'].includes(cards[0].seal) && !cards[1].edition, 'articuno: first scoring card gets Foil + a seal', [cards[0].edition, cards[0].seal]);
  ok(r.total.chips >= 10 + 22 + 50, 'articuno: the Foil scores', r.total);
}
{
  start('ZAPDOS');
  add('j_poke_zapdos');
  G.GAME.dollars = 11;
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, 1 + 0.08 * 5), 'zapdos: X0.08 per $2', r.total);
}
{
  start('MOLTRES');
  add('j_poke_moltres');
  const lv = G.GAME.hands.Pair.level;
  const pair = hand(['S_9', 'H_9']);
  act({ type: 'highlight', ids: pair.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.GAME.hands.Pair.level === lv + 3, 'moltres: first discarded hand +3 levels', G.GAME.hands.Pair.level);
  clearHand();
  const p2 = hand(['S_8', 'H_8']);
  act({ type: 'highlight', ids: p2.map((c) => c.sort_id) });
  act({ type: 'discard' });
  ok(G.GAME.hands.Pair.level === lv + 3, 'moltres: only the first discard', G.GAME.hands.Pair.level);
}

// ---------------------------------------------------------------- Dratini line
{
  start('DRAT');
  const j = add('j_poke_dratini');
  let r = play(hand(['S_A', 'H_A', 'D_A']));
  ok(j.ability.extra.mult === 1 && r.total.mult === 3 + 1, 'dratini: +1 Mult per hand of 3 or fewer cards', r.total);
  play(hand(['S_2', 'H_2', 'D_2', 'C_2']));
  ok(j.ability.extra.mult === 1, 'dratini: not for 4 cards');
  j.ability.extra.mult = 15;
  winRound(hand(['S_2', 'H_3', 'D_4', 'C_6']));
  ok(key(j) === 'j_poke_dragonair' && j.ability.extra.mult === 15, 'dratini -> dragonair at 15 (kept)', j.ability.extra);
  nextRound();
  r = play(hand(['S_A', 'H_A']));
  ok(j.ability.extra.mult === 17 && r.total.mult === 2 + 17, 'dragonair: +2 per hand of 2 or fewer', r.total);
  j.ability.extra.mult = 55;
  winRound(hand(['S_2', 'H_3', 'D_4']));
  ok(key(j) === 'j_poke_dragonite' && j.ability.extra.mult === 55, 'dragonair -> dragonite at 55', j.ability.extra);
  nextRound();
  r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 6 && r.total.mult === 1 + 55, 'dragonite: +55 Mult, a lone card retriggered 5 times', r.total);
}

// ---------------------------------------------------------------- Mewtwo + megas
{
  start('MEWTWO');
  const joker = add('j_joker');
  const m = add('j_poke_mewtwo');
  nextRound(); nextRound(); // the Boss
  winRound();
  const copy = G.jokers.cards.find((c) => key(c) === 'j_joker');
  ok(!G.jokers.cards.includes(joker) && copy && copy !== joker && copy.edition && copy.edition.polychrome, 'mewtwo: boss beaten -> Polychrome copy of the leftmost, original destroyed', G.jokers.cards.map((c) => [key(c), c.edition]));
  ok(G.jokers.cards.includes(m), 'mewtwo stays');
  nextRound();
  const r = play(hand(['S_A']));
  ok(near(r.total.mult, (1 + 4) * 1.2 * 1.5), 'mewtwo: Polychrome jokers give X1.2', r.total);
  // getMega: leftmost X, rightmost Y
  G.jokers.cards.sort((a, b) => (a === m ? -1 : b === m ? 1 : 0));
  ok(mega_for(m) === 'j_poke_mega_mewtwo_x', 'mewtwo: leftmost -> Mega Mewtwo X');
  G.jokers.cards.sort((a, b) => (a === m ? 1 : b === m ? -1 : 0));
  ok(mega_for(m) === 'j_poke_mega_mewtwo_y', 'mewtwo: rightmost -> Mega Mewtwo Y');
}
{
  start('MEWTWO2');
  const joker = add('j_joker');
  add('j_poke_mewtwo');
  nextRound(); nextRound();
  joker.getting_sliced = true;
  winRound();
  ok(G.jokers.cards.filter((c) => key(c) === 'j_joker').length === 1 && G.jokers.cards.includes(joker), 'mewtwo: skips a leftmost Joker that is already being destroyed (Pokermon 3.9.1)', G.jokers.cards.map(key));
}
{
  start('MEWTWOX');
  add('j_poke_mega_mewtwo_x');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 2.5, 'mega mewtwo X: X2.5 per joker (itself)', r.total);
  add('j_joker');
  r = play(hand(['S_A']));
  // itself first (X2.5), then the Joker (+4, X2.5)
  ok(near(r.total.mult, (2.5 + 4) * 2.5), 'mega mewtwo X: X2.5 for every joker', r.total);
}
{
  start('MEWTWOY');
  const d = add('j_poke_dratini');
  add('j_poke_mega_mewtwo_y');
  winRound(); act({ type: 'cash_out' });
  act({ type: 'next_round' });
  ok(d.ability.extra.energy_count === 2, 'mega mewtwo Y: energizes the leftmost joker twice at end of shop', d.ability.extra.energy_count);
  act({ type: 'select_blind' }); clearHand();
  const ep = G.GAME.energy_plus || 0;
  winRound(); nextRound(); winRound(); // Big, then Boss... (Big win first)
  ok((G.GAME.energy_plus || 0) === ep + 1, 'mega mewtwo Y: +1 Energy limit when the Boss is beaten', [ep, G.GAME.energy_plus]);
}

done();
