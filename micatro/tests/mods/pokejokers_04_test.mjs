// Pokermon pokejokers_04 (Cloyster -> Staryu): every one of the 32 jokers fired through real
// plays (act), plus each line's evolution.
//   node micatro/tests/mods/pokejokers_04_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
// (probabilities.normal 0 reads as 1 in the engine, so "never" is a vanishing 1e-9)
const prob = (n) => { G.GAME.probabilities.normal = n; };
const cons = () => G.consumeables.cards.map(key);
const toShop = () => { act({ type: 'cash_out' }); };

const FILE_JOKERS = ['cloyster', 'gastly', 'haunter', 'gengar', 'mega_gengar', 'onix', 'drowzee', 'hypno', 'krabby', 'kingler', 'voltorb', 'electrode',
  'exeggcute', 'exeggutor', 'cubone', 'marowak', 'hitmonlee', 'hitmonchan', 'lickitung', 'koffing', 'weezing', 'rhyhorn', 'rhydon', 'chansey', 'tangela',
  'kangaskhan', 'mega_kangaskhan', 'horsea', 'seadra', 'goldeen', 'seaking', 'staryu'];
ok(FILE_JOKERS.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 32 pokejokers_04 jokers ported');
ok(STATUS.PORTED_FILES['pokemon/pokejokers_04.lua'].length === 32, 'defs: 32 from pokejokers_04.lua', STATUS.PORTED_FILES['pokemon/pokejokers_04.lua'].length);
// loc_vars run for every joker without throwing
{
  start('LOC4');
  let bad = [];
  for (const n of FILE_JOKERS) {
    const c = add('j_poke_' + n);
    try { const iq = []; c.config.center.loc_vars(c.config.center, iq, c); } catch (e) { bad.push(n + ': ' + e.message); }
    c.remove();
  }
  ok(bad.length === 0, 'loc_vars works for all 32', bad);
}

// ---------------------------------------------------------------- Cloyster
{
  start('CLOY');
  add('j_poke_cloyster');
  prob(1000);
  let r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(r.total.chips === 30 + 20 * 2, 'cloyster: 5 scoring cards each retriggered (odds forced)', r.total);
  prob(1e-9);
  r = play(hand(['S_2', 'H_3', 'D_4', 'C_5', 'S_6']));
  ok(r.total.chips === 30 + 20, 'cloyster: no retrigger when the roll fails', r.total);
  prob(1000);
  r = play(hand(['S_2', 'H_2', 'D_4', 'C_4']));
  ok(r.total.chips === 20 + 12, 'cloyster: nothing with only 4 scoring cards', r.total);
  ok(P_CENTERS.j_poke_cloyster.loc_vars(P_CENTERS.j_poke_cloyster, [], G.jokers.cards[0]).vars[2] === 1, 'cloyster tooltip: retriggers 1 additional time (Pokermon 3.9.1)');
}

// ---------------------------------------------------------------- Gastly line
{
  start('GASTLY');
  const j = add('j_poke_gastly');
  prob(1e-9);
  for (let i = 0; i < 3; i++) { winRound(); if (i < 2) nextRound(); }
  ok(key(j) === 'j_poke_haunter', 'gastly -> haunter after 3 rounds', key(j));
}
{
  start('GASTLY2');
  const other = add('j_joker');
  const g = add('j_poke_gastly');
  prob(1000);
  const w = winRound();
  ok(other.edition && other.edition.negative, 'gastly: a random other joker turns Negative at cash-out', other.edition);
  ok(g.gone && !G.jokers.cards.includes(g), 'gastly: self-destructs after licking');
  ok(statusMsgs(w.events).includes('Lick!'), 'gastly: "Lick!"', statusMsgs(w.events));
}
{
  // Pokermon 3.9.1: with no other joker to lick, Gastly does nothing (3.2.1 licked itself and still self-destructed).
  start('GASTLY3');
  const g = add('j_poke_gastly');
  prob(1000);
  winRound();
  ok(G.jokers.cards.includes(g) && !g.gone && !(g.edition && g.edition.negative), 'gastly: stays when there is no other joker (Pokermon 3.9.1)', [g.gone, g.edition]);
}
{
  start('HAUNT');
  const other = add('j_joker');
  const h = add('j_poke_haunter');
  prob(1e-9);
  winRound();
  ok(!other.edition && G.jokers.cards.includes(h), 'haunter: nothing when the 1/4 roll fails');
  nextRound();
  prob(1000);
  winRound();
  ok(other.edition && other.edition.negative && !G.jokers.cards.includes(h), 'haunter: licks + self-destructs', other.edition);
}
{
  start('HAUNT2');
  const other = add('j_joker');
  const h = add('j_poke_haunter');
  h.ability.extra.evolve = true; // Linking Cord
  prob(1000);
  winRound();
  ok(key(h) === 'j_poke_gengar' && G.jokers.cards.includes(h), 'haunter -> gengar with a Linking Cord (no lick once marked)', key(h));
  ok(!(other.edition && other.edition.negative), 'haunter marked to evolve does not lick');
}
{
  start('GENGAR');
  const g = add('j_poke_gengar');
  ok(g.ability.extra.gengar_rounds >= 2 && g.ability.extra.gengar_rounds <= 8, 'gengar: rolls its round count on creation', g.ability.extra.gengar_rounds);
  const other = add('j_joker');
  g.ability.extra.gengar_rounds = 2;
  let w = winRound();
  ok(g.ability.extra.gengar_rounds === 1 && statusMsgs(w.events).includes('Nasty Plot!') && !other.edition, 'gengar: Nasty Plot countdown', g.ability.extra);
  nextRound();
  w = winRound();
  ok(other.edition && other.edition.negative, 'gengar: turns a random other joker Negative when the count hits 0', other.edition);
  ok(g.ability.extra.trigger === false && g.ability.extra.gengar_rounds >= 2 && g.ability.extra.gengar_rounds <= 8, 'gengar: picks a new number', g.ability.extra);
  ok(G.jokers.cards.includes(g), 'gengar stays');
}
{
  start('MGENGAR');
  add('j_poke_mega_gengar');
  const before = G.GAME.tags.length;
  nextRound(); // selects the Big Blind
  ok(G.GAME.tags.length === before + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_negative', 'mega gengar: Negative Tag on a non-boss blind', G.GAME.tags.map((t) => t.key));
  winRound(); act({ type: 'cash_out' }); act({ type: 'next_round' });
  const n = G.GAME.tags.length;
  act({ type: 'select_blind' }); // the Boss
  ok(G.GAME.blind.get_type() === 'Boss' && G.GAME.tags.length === n, 'mega gengar: no tag on the Boss Blind', G.GAME.tags.map((t) => t.key));
}

// ---------------------------------------------------------------- Onix
{
  // Pokermon 3.9.1 (3.8.0 Onix line): each destroyed non-Stone card adds a Stone card to the deck.
  start('ONIX');
  const j = add('j_poke_onix');
  const stones = () => G.playing_cards.filter((c) => key(c) === 'm_stone').length;
  const [a] = hand(['S_A']);
  const [st] = hand(['S_K'], { center: 'm_stone' });
  const n0 = G.playing_cards.length, s0 = stones(), d0 = G.deck.cards.length;
  const hm = add('c_hanged_man');
  ok(act({ type: 'use', id: hm.sort_id, targets: [a.sort_id, st.sort_id] }).ok, 'use The Hanged Man on a plain card and a Stone card');
  G.E_MANAGER.flush();
  ok(!G.playing_cards.includes(a) && !G.playing_cards.includes(st), 'both cards destroyed');
  ok(stones() === s0 - 1 + 1 && G.playing_cards.length === n0 - 2 + 1 && G.deck.cards.length === d0 + 1,
    'onix: +1 Stone card in the deck for the destroyed non-Stone card only (Pokermon 3.9.1)', { s: stones() - s0, n: G.playing_cards.length - n0, d: G.deck.cards.length - d0 });
  let r = play(hand(['S_A']));
  ok(r.total.chips === 16, 'onix: no longer turns the first scored card to Stone (Pokermon 3.9.1)', r.total);
  // Blueprint copies it now (blueprint_compat, Pokermon 3.9.1)
  const bp = add('j_blueprint');
  G.jokers.cards.splice(G.jokers.cards.indexOf(bp), 1); G.jokers.cards.unshift(bp);
  const [b] = hand(['D_5']);
  const s1 = stones();
  const hm2 = add('c_hanged_man');
  act({ type: 'use', id: hm2.sort_id, targets: [b.sort_id] }); G.E_MANAGER.flush();
  ok(stones() === s1 + 2, 'onix + Blueprint: 2 Stone cards per destroyed card (Pokermon 3.9.1)', stones() - s1);
  j.ability.metal_sticker = true;
  winRound();
  ok(key(j) === 'j_poke_steelix', 'onix -> steelix with a Metal sticker', key(j));
}

// ---------------------------------------------------------------- Drowzee / Hypno
{
  start('DROW');
  const j = add('j_poke_drowzee');
  G.GAME.consumeable_usage.c_mercury = { count: 1, set: 'Planet', order: 1 };
  G.GAME.consumeable_usage.c_venus = { count: 3, set: 'Planet', order: 2 };
  G.GAME.consumeable_usage.c_fool = { count: 1, set: 'Tarot', order: 3 };
  let r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 1.4) < 1e-9 && j.ability.extra.planets_used === 2, 'drowzee: X0.2 per unique Planet used', r.total);
  for (const p of ['c_earth', 'c_mars', 'c_jupiter', 'c_saturn', 'c_uranus']) G.GAME.consumeable_usage[p] = { count: 1, set: 'Planet', order: 9 };
  winRound();
  ok(key(j) === 'j_poke_hypno', 'drowzee -> hypno at 7 planets', key(j));
  nextRound();
  r = play(hand(['S_A']));
  ok(Math.abs(r.total.mult - 2.75) < 1e-9, 'hypno: X0.25 per unique Planet (7 -> X2.75)', r.total);
}
{
  start('HYPNO');
  add('j_poke_hypno');
  ok(cons().includes('c_trance'), 'hypno: comes holding Trance', cons());
}

// ---------------------------------------------------------------- Krabby / Kingler
{
  start('KRAB');
  const j = add('j_poke_krabby');
  let r = play(hand(['S_K', 'H_K']));
  ok(r.total.chips === 10 + 20 + 40, 'krabby: +20 chips per scored face', r.total);
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_kingler', 'krabby -> kingler after 4 rounds', key(j));
  nextRound();
  const ks = hand(['S_K', 'H_K']);
  r = play(ks);
  ok(ks.every((c) => key(c) === 'm_bonus') && r.total.chips === 10 + 2 * (10 + 30 + 20), 'kingler: faces become Bonus, +20 each', r.total);
  ok(statusMsgs(r.events).includes('Surf!'), 'kingler: "Surf!"');
}

// ---------------------------------------------------------------- Voltorb / Electrode
{
  start('VOLT');
  const v = add('j_poke_voltorb');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1.75 && v.debuff && v.ability.fainted === G.GAME.round, 'voltorb: X1.75 then faints (debuffed)' + ' (Pokermon 3.9.1 data)', { t: r.total, d: v.debuff });
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'voltorb: fainted for the rest of the round', r.total);
  winRound(); nextRound();
  r = play(hand(['S_A']));
  ok(r.total.mult === 1.75, 'voltorb: back the next round', r.total);
}
{
  start('VOLT2');
  const v = add('j_poke_voltorb');
  add('j_joker');
  const r = play(hand(['S_A']));
  ok(r.total.mult === 5 && !v.debuff, 'voltorb: inert unless rightmost (volatile right)', r.total);
  // (a fainted Voltorb doesn't count down, so keep it covered while the rounds pass)
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(v) === 'j_poke_electrode', 'voltorb -> electrode after 4 rounds', key(v));
}
{
  start('ELEC');
  add('j_poke_electrode');
  const d0 = G.GAME.dollars;
  const r = play(hand(['S_A']));
  ok(r.total.mult === 2.25 && G.GAME.dollars === d0 + 3, 'electrode: X2.25 and $3, then faints' + ' (Pokermon 3.9.1 data)', { t: r.total, d: G.GAME.dollars - d0 });
}

// ---------------------------------------------------------------- Exeggcute / Exeggutor
{
  start('EGG');
  const j = add('j_poke_exeggcute');
  prob(1e-9);
  let r = play(hand(['H_A']));
  ok(r.total.mult === 3, 'exeggcute: +2 Mult per Heart', r.total);
  prob(1000);
  r = play(hand(['H_K']));
  ok(r.total.mult === 7, 'exeggcute: +6 on the 1/4 roll', r.total);
  r = play(hand(['S_K']));
  ok(r.total.mult === 1, 'exeggcute: Hearts only', r.total);
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_exeggutor', 'exeggcute -> exeggutor with a Leaf Stone', key(j));
  nextRound();
  prob(1e-9);
  r = play(hand(['H_A', 'D_A']));
  ok(r.total.mult === 2 + 2, 'exeggutor: +2 Mult per Heart', r.total);
  prob(1000);
  r = play(hand(['H_A', 'D_A']));
  ok(Math.abs(r.total.mult - 2 * 1.4) < 1e-9, 'exeggutor: X1.4 on the roll', r.total);
}

// ---------------------------------------------------------------- Cubone / Marowak
{
  start('CUBONE');
  const j = add('j_poke_cubone');
  ok(cons().includes('c_poke_thickclub'), 'cubone: comes holding a Thick Club', cons());
  let r = play(hand(['S_A']));
  // 1 consumable + the Thick Club counted again = 2 -> +10
  ok(r.total.mult === 11, 'cubone: +5 Mult per consumable (Thick Club double)', r.total);
  const pl = add('c_pluto');
  act({ type: 'use', id: pl.sort_id });
  ok(j.ability.extra.consumables_used === 1, 'cubone: counts consumables used', j.ability.extra.consumables_used);
  j.ability.extra.consumables_used = 20;
  winRound();
  ok(key(j) === 'j_poke_marowak', 'cubone -> marowak after 20 consumables', key(j));
  nextRound();
  r = play(hand(['S_A']));
  // High Card was levelled by the Pluto above (2 Mult)
  ok(Math.abs(r.total.mult - 2 * 1.8) < 1e-9, 'marowak: X(1 + 0.4 per consumable, Thick Club double)', r.total);
}
{
  start('MARO');
  const lim = G.consumeables.config.card_limit;
  const m = add('j_poke_marowak');
  ok(G.consumeables.config.card_limit === lim + 1, 'marowak: +1 consumable slot', G.consumeables.config.card_limit);
  m.remove_from_deck(); G.E_MANAGER.flush();
  ok(G.consumeables.config.card_limit === lim, 'marowak: slot removed with it', G.consumeables.config.card_limit);
}

// ---------------------------------------------------------------- Hitmonlee / Hitmonchan
{
  start('HITLEE');
  add('j_poke_hitmonlee');
  const cards = hand(['S_A']);
  G.GAME.starting_deck_size = G.playing_cards.length + 4;
  let r = play(cards);
  ok(Math.abs(r.total.mult - 1.6) < 1e-9, 'hitmonlee: X0.15 per card below the starting deck size', r.total);
  G.GAME.starting_deck_size = G.playing_cards.length - 4;
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'hitmonlee: nothing above it', r.total);
}
{
  start('HITCHAN');
  add('j_poke_hitmonchan');
  const cards = hand(['S_A']);
  G.GAME.starting_deck_size = G.playing_cards.length - 4;
  const r = play(cards);
  ok(Math.abs(r.total.mult - 1.6) < 1e-9, 'hitmonchan: X0.15 per card above the starting deck size', r.total);
}

// ---------------------------------------------------------------- Lickitung
{
  start('LICKI');
  const j = add('j_poke_lickitung');
  const r = play(hand(['S_J', 'H_J', 'D_J']));
  ok(r.total.chips === 30 + 30 && Math.abs(r.total.mult - 3 * 1.5 * 1.5) < 1e-9 && j.ability.extra.jacks_played === 2, 'lickitung: X1.5 for the first two Jacks', { t: r.total, j: j.ability.extra.jacks_played });
  j.ability.extra.jacks_played = 15;
  winRound();
  ok(key(j) === 'j_poke_lickilicky', 'lickitung -> lickilicky at 15 Jacks', key(j));
}

// ---------------------------------------------------------------- Koffing / Weezing (Pokermon 3.9.1: Volatile Left)
{
  start('KOFF');
  const k = add('j_poke_koffing');
  let r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 12 && k.debuff && k.ability.fainted === G.GAME.round, 'koffing: Volatile Left +12 Mult, then faints (Pokermon 3.9.1)', { t: r.total, d: k.debuff });
  r = play(hand(['S_A']));
  ok(r.total.mult === 1, 'koffing: fainted for the rest of the round (Pokermon 3.9.1)', r.total);
  start('KOFF1');
  add('j_joker');
  const j = add('j_poke_koffing');
  r = play(hand(['S_A']));
  ok(r.total.mult === 1 + 4 && !j.debuff, 'koffing: inert unless leftmost (Pokermon 3.9.1)', r.total);
  for (let i = 0; i < 2; i++) { winRound(); if (i < 1) nextRound(); }
  ok(key(j) === 'j_poke_weezing', 'koffing -> weezing after 2 rounds (Pokermon 3.9.1)', key(j));
  nextRound();
  G.jokers.cards.reverse(); // Weezing leftmost
  r = play(hand(['S_A']));
  ok(r.total.mult === (1 + 18) + 4 && j.debuff, 'weezing: Volatile Left +18 Mult, then faints (Pokermon 3.9.1)', { t: r.total, d: j.debuff });
}
{
  start('KOFF2');
  nextRound(); nextRound(); // Big, then the Boss
  const k = add('j_poke_koffing');
  const ch = G.GAME.blind.chips;
  act({ type: 'sell', id: k.sort_id });
  ok(G.GAME.blind.get_type() === 'Boss' && G.GAME.blind.chips === ch && !G.GAME.blind.disabled, 'koffing: selling no longer halves the Boss Blind (Pokermon 3.9.1)', [ch, G.GAME.blind.chips]);
  const w = add('j_poke_weezing');
  act({ type: 'sell', id: w.sort_id });
  // (The Wall's own disable() halves its size, as in vanilla; Weezing no longer halves it first.)
  ok(G.GAME.blind.chips === ch / 2 && G.GAME.blind.disabled, 'weezing: selling disables the Boss Blind, no halving (Pokermon 3.9.1)', [G.GAME.blind.name, G.GAME.blind.chips, G.GAME.blind.disabled]);
}

// ---------------------------------------------------------------- Rhyhorn / Rhydon
{
  start('RHY');
  const j = add('j_poke_rhyhorn');
  const [s] = hand(['S_A'], { center: 'm_stone' });
  const r = play([s]);
  ok(r.total.chips === 5 + 50 && s.ability.perma_bonus === 12, 'rhyhorn: scored Stone cards gain +12 chips permanently', { t: r.total, p: s.ability.perma_bonus });
  for (let i = 0; i < 4; i++) { winRound(); if (i < 3) nextRound(); }
  ok(key(j) === 'j_poke_rhydon', 'rhyhorn -> rhydon after 4 rounds', key(j));
  nextRound();
  const st = hand(['S_A', 'H_K'], { center: 'm_stone' });
  const r2 = play(st);
  // first Stone: 50, +16, retriggered 50+16; second Stone: 50, +16
  ok(r2.total.chips === 5 + 50 + 66 + 50 && st[0].ability.perma_bonus === 32 && st[1].ability.perma_bonus === 16, 'rhydon: +16 per Stone, first Stone retriggered', { t: r2.total, p: st.map((c) => c.ability.perma_bonus) });
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_rhyperior', 'rhydon -> rhyperior with a Linking Cord', key(j));
}

// ---------------------------------------------------------------- Chansey
{
  start('CHANS');
  const j = add('j_poke_chansey');
  prob(1000);
  const lucky = hand(['S_A', 'H_A', 'D_A'], { center: 'm_lucky' });
  const n0 = G.playing_cards.length;
  play(lucky);
  ok(j.ability.extra.triggers === 2 && G.playing_cards.length === n0 + 2, 'chansey: copies the first 2 Lucky triggers into the deck', { t: j.ability.extra.triggers, n: G.playing_cards.length - n0 });
  ok(G.hand.cards.filter((c) => key(c) === 'm_lucky').length === 2, 'chansey: copies drawn to hand', G.hand.cards.map(key));
  prob(1);
  clearHand();
  winRound();
  ok(j.ability.extra.triggers === 0, 'chansey: resets each round', j.ability.extra.triggers);
  nextRound();
  for (const c of G.playing_cards.slice(0, Math.ceil(G.playing_cards.length / 4))) c.set_ability(P_CENTERS.m_lucky, null, true);
  winRound();
  ok(key(j) === 'j_poke_blissey', 'chansey -> blissey at 25% Lucky cards', key(j));
}

// ---------------------------------------------------------------- Tangela
{
  start('TANG');
  const j = add('j_poke_tangela');
  prob(1000);
  const d0 = G.GAME.dollars;
  let r = play(hand(['S_A'], { center: 'm_wild' }));
  ok(r.total.chips === 5 + 11 + 50 && r.total.mult === 11 && G.GAME.dollars === d0 + 3, 'tangela: All! (+10 Mult, +50 chips, $3) on the roll', { t: r.total, d: G.GAME.dollars - d0 });
  prob(1e-9);
  const d1 = G.GAME.dollars;
  r = play(hand(['S_K'], { center: 'm_wild' }));
  const got = [r.total.mult === 11 && r.total.chips === 15, r.total.chips === 65 && r.total.mult === 1, G.GAME.dollars === d1 + 3 && r.total.chips === 15];
  ok(got.filter(Boolean).length === 1, 'tangela: otherwise exactly one of Mult / Chips / Money', { t: r.total, d: G.GAME.dollars - d1 });
  ok(j.ability.extra.wilds_scored === 2, 'tangela: counts Wild cards scored', j.ability.extra.wilds_scored);
  j.ability.extra.wilds_scored = 10;
  winRound();
  ok(key(j) === 'j_poke_tangrowth', 'tangela -> tangrowth at 10 Wilds', key(j));
}

// ---------------------------------------------------------------- Kangaskhan
{
  start('KANGA');
  const lim = G.consumeables.config.card_limit, cap = G.GAME.interest_cap;
  const k = add('j_poke_kangaskhan');
  ok(G.consumeables.config.card_limit === lim + 2 && G.GAME.interest_cap === cap, 'kangaskhan: +2 consumable slots, no interest cap drawback (Pokermon 3.9.1)', [G.consumeables.config.card_limit, G.GAME.interest_cap]);
  act({ type: 'sell', id: k.sort_id });
  G.E_MANAGER.flush();
  ok(G.consumeables.config.card_limit === lim && G.GAME.interest_cap === cap, 'kangaskhan: restored when sold', [G.consumeables.config.card_limit, G.GAME.interest_cap]);
}
{
  start('MKANGA');
  const k = add('j_poke_mega_kangaskhan');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 2, 'mega kangaskhan: retriggers every played card', r.total);
  for (const p of ['c_pluto', 'c_mercury']) { const c = add(p); act({ type: 'use', id: c.sort_id }); }
  ok(k.ability.extra.consumeables_used === 2, 'mega kangaskhan: counts consumables used', k.ability.extra.consumeables_used);
  const n = G.GAME.tags.length;
  winRound();
  ok(G.GAME.tags.length === n + 1 && G.GAME.tags[n].key === 'tag_double' && k.ability.extra.consumeables_used === 0, 'mega kangaskhan: Double Tag after 2 consumables, counter reset', G.GAME.tags.map((t) => t.key));
  nextRound();
  const n2 = G.GAME.tags.length;
  winRound();
  ok(G.GAME.tags.length === n2, 'mega kangaskhan: no tag without 2 consumables');
}
{
  // Pokermon 3.9.1: Blueprint copies Mega Kangaskhan's retriggers, but not its consumable count.
  start('MKANGA2');
  const bp = add('j_blueprint');
  const k = add('j_poke_mega_kangaskhan');
  ok(G.jokers.cards[0] === bp, 'blueprint left of mega kangaskhan');
  const r = play(hand(['S_A']));
  ok(r.total.chips === 5 + 11 * 3, 'mega kangaskhan + Blueprint: every played card retriggered twice (Pokermon 3.9.1)', r.total);
  const c = add('c_pluto'); act({ type: 'use', id: c.sort_id });
  ok(k.ability.extra.consumeables_used === 1, 'mega kangaskhan + Blueprint: one consumable counts once (Pokermon 3.9.1)', k.ability.extra.consumeables_used);
}

// ---------------------------------------------------------------- Horsea / Seadra
{
  start('HORSEA');
  const j = add('j_poke_horsea');
  let r = play(hand(['S_6', 'H_6']));
  ok(j.ability.extra.mult === 2 && r.total.mult === 2 + 2, 'horsea: +1 Mult per scored 6', { m: j.ability.extra.mult, t: r.total });
  j.ability.extra.mult = 12;
  winRound();
  ok(key(j) === 'j_poke_seadra' && j.ability.extra.mult === 12, 'horsea -> seadra at 12 Mult (kept)', j.ability.extra);
  nextRound();
  hand(['H_K']);
  r = play(hand(['S_6']));
  ok(j.ability.extra.mult === 14 && r.total.mult === 15, 'seadra: +2 per scored 6 with a King held', { m: j.ability.extra.mult, t: r.total });
  clearHand();
  r = play(hand(['S_6']));
  ok(j.ability.extra.mult === 15 && r.total.mult === 16, 'seadra: +1 without a King', { m: j.ability.extra.mult, t: r.total });
  j.ability.dragon_sticker = true;
  winRound();
  ok(key(j) === 'j_poke_kingdra', 'seadra -> kingdra with a Dragon sticker', key(j));
}

// ---------------------------------------------------------------- Goldeen / Seaking
{
  start('GOLD0');
  hand(['S_K'], { center: 'm_gold' });
  let d0 = G.GAME.dollars;
  winRound(hand(['S_2']));
  const base = G.GAME.dollars - d0;
  start('GOLD');
  const j = add('j_poke_goldeen');
  hand(['S_K'], { center: 'm_gold' });
  d0 = G.GAME.dollars;
  winRound(hand(['S_2']));
  ok(base === 3 && G.GAME.dollars - d0 === 6, 'goldeen: held Gold card retriggered at end of round ($3 -> $6)', [base, G.GAME.dollars - d0]);
  for (let i = 0; i < 4; i++) { nextRound(); winRound(); }
  ok(key(j) === 'j_poke_seaking', 'goldeen -> seaking after 5 rounds', key(j));
  nextRound();
  hand(['S_K'], { center: 'm_gold' });
  d0 = G.GAME.dollars;
  winRound(hand(['S_2']));
  ok(G.GAME.dollars - d0 === 9, 'seaking: 2 retriggers ($9)', G.GAME.dollars - d0);
}

// ---------------------------------------------------------------- Staryu
{
  start('STARYU');
  const j = add('j_poke_staryu');
  const d0 = G.GAME.dollars;
  const r = play(hand(['D_A', 'S_A']));
  ok(r.total.mult === 2 + 1 && G.GAME.dollars === d0 + 1, 'staryu: +1 Mult and $1 per scored Diamond', { t: r.total, d: G.GAME.dollars - d0 });
  j.ability.extra.evolve = true;
  winRound();
  ok(key(j) === 'j_poke_starmie', 'staryu -> starmie with a Water Stone', key(j));
}

done();
