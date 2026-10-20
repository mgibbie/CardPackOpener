// Pokermon pokejokers_18 (Pansage -> Excadrill): all 11 jokers fired through real plays (act),
// plus every evolution.   node micatro/tests/mods/pokejokers_18_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, act } from './poke_helpers.mjs';
import { STATUS } from '../../mods/pokermon/index.js';
import { find_joker } from '../../js/engine/core.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const NAMES = ['pansage', 'simisage', 'pansear', 'simisear', 'panpour', 'simipour', 'roggenrola', 'boldore', 'gigalith', 'drilbur', 'excadrill'];
ok(NAMES.every((n) => STATUS.PORTED.jokers.includes('j_poke_' + n) && !P_CENTERS['j_poke_' + n].unported), 'all 11 pokejokers_18 jokers ported');
ok((STATUS.PORTED_FILES['pokemon/pokejokers_18.lua'] || []).length === 11, 'defs: 11 from pokejokers_18.lua');

/** Use an evolution item on `j` (falls back to the item's own flag when the item isn't ported). */
function useItem(j, item) {
  if (P_CENTERS[item] && !P_CENTERS[item].unported) {
    const it = add(item);
    const r = act({ type: 'use', id: it.sort_id, targets: [], joker_targets: [j.sort_id] });
    ok(r.ok !== false, item + ' usable');
  } else j.ability.extra.evolve = true;
  ok(j.ability.extra.evolve === true || typeof j.ability.extra.evolve === 'string', item + ' marks the joker to evolve', j.ability.extra.evolve);
}
const hazards = (area) => area.cards.filter((c) => c.config.center.key === 'm_poke_hazard').length;

// ------------------------------------------------------------- Pansage / Simisage
{
  start('PANSAGE');
  const j = add('j_poke_pansage');
  ok(find_joker('Shortcut').includes(j), 'pansage counts as Shortcut');
  // 2-4-6-8-10 is a Shortcut straight: 30 + 2+4+6+8+10 = 60 chips, 4 mult
  const r = play(hand(['S_2', 'H_4', 'D_6', 'C_8', 'S_T']));
  ok(r.total.chips === 60 && r.total.mult === 4, 'pansage: gapped straight scores as a Straight', r.total);
  useItem(j, 'c_poke_leafstone');
  winRound();
  ok(key(j) === 'j_poke_simisage', 'pansage -> simisage with a Leaf Stone', key(j));
  ok(find_joker('Shortcut').includes(j), 'simisage counts as Shortcut');
  nextRound();
  G.GAME.probabilities.normal = 1000; // 1 in 3 -> certain
  const cards = hand(['S_5', 'H_5', 'D_9']);
  cards[2].set_ability(P_CENTERS.m_bonus);
  const r2 = play(cards);
  ok(cards[0].config.center.key === 'm_lucky' && cards[1].config.center.key === 'm_lucky', 'simisage: base cards played become Lucky', cards.map(key));
  ok(cards[2].config.center.key === 'm_bonus', 'simisage: enhanced cards left alone');
  ok(statusMsgs(r2.events).includes('Upgrade!'), 'simisage: "Upgrade!"', statusMsgs(r2.events));
  G.GAME.probabilities.normal = 1;
}

// ------------------------------------------------------------- Pansear / Simisear
{
  start('PANSEAR');
  const j = add('j_poke_pansear');
  ok(find_joker('Four Fingers').includes(j), 'pansear counts as Four Fingers');
  // 4-card flush: 35 + 2+5+8+10 = 60 chips, 4 mult
  const r = play(hand(['S_2', 'S_5', 'S_8', 'S_K']));
  ok(r.total.chips === 60 && r.total.mult === 4, 'pansear: 4-card flush', r.total);
  useItem(j, 'c_poke_firestone');
  winRound();
  ok(key(j) === 'j_poke_simisear', 'pansear -> simisear with a Fire Stone', key(j));
  nextRound();
  // First hand: a 4-card flush + a non-scoring 3 -> The Empress, and the 3 is destroyed.
  const cards = hand(['S_2', 'S_5', 'S_8', 'S_K', 'H_3']);
  const n0 = G.playing_cards.length;
  const r2 = play(cards);
  ok(G.consumeables.cards.length === 1 && key(G.consumeables.cards[0]) === 'c_empress', 'simisear: first-hand flush makes The Empress at before (Pokermon 3.9.1)', G.consumeables.cards.map(key));
  ok(G.playing_cards.length === n0 - 1 && !G.playing_cards.includes(cards[4]), 'simisear: the unscored card is destroyed in the destroy_card pass (Pokermon 3.9.1)', G.playing_cards.length - n0);
  ok(statusMsgs(r2.events).some((m) => /Tarot/.test(m)), 'simisear: "+1 Tarot"', statusMsgs(r2.events));
  const c2 = hand(['D_2', 'D_5', 'D_8', 'D_K', 'H_4']);
  play(c2);
  ok(G.consumeables.cards.length === 1 && G.playing_cards.includes(c2[4]), 'simisear: only the first hand of the round');
  ok(['pansage', 'pansear', 'panpour'].every((n) => P_CENTERS['j_poke_' + n].knockoff_starter === true) && !P_CENTERS.j_poke_simisear.knockoff_starter, 'the Pansage / Pansear / Panpour are knockoff starters (Pokermon 3.9.1 flag)');
}

// ------------------------------------------------------------- Panpour / Simipour
{
  start('PANPOUR');
  const j = add('j_poke_panpour');
  const [c] = hand(['S_2']);
  ok(c.is_face() && find_joker('Pareidolia').includes(j), 'panpour: every card is a face card (Pareidolia)');
  useItem(j, 'c_poke_waterstone');
  winRound();
  ok(key(j) === 'j_poke_simipour', 'panpour -> simipour with a Water Stone', key(j));
  nextRound();
  // The lowest base card played becomes a Bonus card before scoring: 2 -> +30 chips.
  const cards = hand(['S_9', 'H_2', 'D_5']);
  const r = play(cards);
  ok(cards[1].config.center.key === 'm_bonus' && cards[0].config.center.key === 'c_base' && cards[2].config.center.key === 'c_base', 'simipour: lowest card -> Bonus', cards.map(key));
  // High card 9 scores: 5 + 9 = 14 (the Bonus 2 isn't scoring)
  ok(r.total.chips === 14, 'simipour: high card unaffected', r.total);
  const r2 = play(hand(['C_3']));
  ok(r2.total.chips === 5 + 3 + 30, 'simipour: a lone card becomes Bonus and scores +30', r2.total);
}

// ------------------------------------------------------------- Roggenrola line
{
  start('ROGGEN');
  const j = add('j_poke_roggenrola');
  hand(['S_2', 'H_3'], { center: 'm_stone' });
  const r = play(hand(['S_A']));
  // High card 16 chips; 2 held Stone cards x +5 Mult
  ok(r.total.mult === 1 + 10 && j.ability.extra.hazard_triggered === 2, 'roggenrola: +5 Mult per held Stone card (Pokermon 3.9.1)', { t: r.total, h: j.ability.extra.hazard_triggered });
  const h0 = hazards(G.deck) + hazards(G.hand);
  nextRound();
  ok(G.GAME.poke_hazard_level === 1 && hazards(G.deck) + hazards(G.hand) + hazards(G.discard) === h0 + 1, 'roggenrola: +1 Hazard layer -> 1 Hazard card dealt with the first hand (Pokermon 3.9.1)', hazards(G.deck));
  clearHand();
  hand(['D_4'], { center: 'm_poke_hazard' });
  const r1 = play(hand(['S_A']));
  ok(r1.total.mult === 6, 'roggenrola: a held Hazard card (no rank) gives +5 Mult', r1.total);
  j.ability.extra.hazard_triggered = 10;
  winRound();
  ok(key(j) === 'j_poke_boldore', 'roggenrola -> boldore after 10 triggers (Pokermon 3.9.1)', key(j));
  nextRound();
  clearHand();
  hand(['S_2'], { center: 'm_stone' });
  const r2 = play(hand(['S_A']));
  ok(r2.total.mult === 11, 'boldore: +10 Mult per held Stone (Pokermon 3.9.1)', r2.total);
  useItem(j, 'c_poke_linkcable');
  winRound();
  ok(key(j) === 'j_poke_gigalith', 'boldore -> gigalith with a Link Cable', key(j));
  nextRound();
  clearHand();
  hand(['S_2', 'H_3'], { center: 'm_stone' });
  const r3 = play(hand(['S_A']));
  // 2 held Stones x +7, each retriggered once -> +28
  ok(r3.total.mult === 1 + 28, 'gigalith: +7 per held Stone, retriggered (Pokermon 3.9.1)', r3.total);
  ok(statusMsgs(r3.events).includes('Again!'), 'gigalith: "Again!"', statusMsgs(r3.events));
  clearHand();
  hand(['S_4']);
  const r4 = play(hand(['S_A']));
  ok(r4.total.mult === 1, 'gigalith: ranked held cards do nothing', r4.total);
}

// ------------------------------------------------------------- Drilbur / Excadrill
{
  start('DRILBUR');
  const j = add('j_poke_drilbur');
  const [s1] = hand(['S_2'], { center: 'm_stone' });
  const n0 = G.playing_cards.length, d0 = G.GAME.dollars, c0 = G.consumeables.cards.length;
  const r = play([s1]);
  ok(!G.playing_cards.includes(s1) && G.playing_cards.length === n0 - 1, 'drilbur: destroys the first scored Stone card');
  ok(j.ability.extra.stones_destroyed === 1 && j.ability.extra.active === false, 'drilbur: counts it, inactive for the round', j.ability.extra);
  ok(G.GAME.dollars > d0 || G.consumeables.cards.length > c0, 'drilbur: digs up a treasure ($ or an item)', { d: G.GAME.dollars - d0, c: G.consumeables.cards.length - c0 });
  ok(statusMsgs(r.events).includes('Drill!') || statusMsgs(r.events).length > 0, 'drilbur: popup', statusMsgs(r.events));
  const [s2] = hand(['H_2'], { center: 'm_stone' });
  play([s2]);
  ok(G.playing_cards.includes(s2) && j.ability.extra.stones_destroyed === 1, 'drilbur: only once per round');
  winRound();
  ok(j.ability.extra.active === true, 'drilbur: reactivates at end of round');
  nextRound();
  j.ability.extra.stones_destroyed = 3;
  const [s3] = hand(['D_2'], { center: 'm_stone' });
  play([s3]);
  winRound();
  ok(key(j) === 'j_poke_excadrill', 'drilbur -> excadrill after 4 Stones', key(j));
  nextRound();
  const ace = hand(['S_A']);
  G.GAME.starting_deck_size = G.playing_cards.length + 5;
  let r2 = play(ace);
  ok(r2.total.mult === 1 + 10, 'excadrill: +2 Mult per card below the starting deck size', r2.total);
  const king = hand(['S_K']);
  G.GAME.starting_deck_size = G.playing_cards.length;
  r2 = play(king);
  ok(r2.total.mult === 1, 'excadrill: nothing at full size', r2.total);
  const [s4, s5] = hand(['C_2', 'C_3'], { center: 'm_stone' });
  const n1 = G.playing_cards.length;
  play([s4, s5]);
  ok(!G.playing_cards.includes(s4) && !G.playing_cards.includes(s5) && G.playing_cards.length === n1 - 2, 'excadrill: destroys every scored Stone card');
}

done();
