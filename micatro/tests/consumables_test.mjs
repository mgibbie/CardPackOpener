// Consumables / boosters / vouchers — port of card.lua use_consumeable, open,
// redeem and apply_to_run. Plain node: `node micatro/tests/consumables_test.mjs`.
import { newRun, act, G, STATES, STATE_NAMES } from '../js/engine/run.js';
import { P_CENTERS, P_CARDS, Card, add_joker, E_MANAGER } from '../js/engine/core.js';

let fails = 0, passes = 0;
function ok(cond, msg) {
  if (cond) { passes++; console.log('ok   ' + msg); } else { fails++; console.log('FAIL ' + msg); }
}

// ------------------------------------------------------------------ helpers
/** Fresh run, Small Blind selected, 8 cards in hand. */
function fresh(seed = 'TEST') {
  newRun({ seed, back: 'b_red' });
  const r = act({ type: 'select_blind' });
  if (!r.ok || G.STATE !== STATES.SELECTING_HAND) throw new Error('could not reach SELECTING_HAND: ' + r.error + ' ' + STATE_NAMES[G.STATE]);
  G.consumeables.config.card_limit = 10;
}
/** Put a consumable / joker in its slot (like Balatro's debug add). */
function give(key, edition) { const c = add_joker(key, edition); E_MANAGER.flush(); return c; }
const H = (i) => G.hand.cards[i];
const ids = (cards) => cards.map((c) => c.sort_id);
function use(card, targets) { return act({ type: 'use', id: card.sort_id, targets: targets ? ids(targets) : undefined }); }
/** Replace the rank/suit of a hand card (deterministic fixtures). */
function setCard(card, key) { card.set_base(P_CARDS[key]); }
function gotoShop(seed = 'SHOP') {
  fresh(seed);
  G.GAME.blind.chips = 1;
  let r = act({ type: 'highlight', ids: [H(0).sort_id] });
  r = act({ type: 'play' });
  if (!r.ok) throw new Error('play failed ' + r.error);
  if (G.STATE !== STATES.ROUND_EVAL) throw new Error('expected ROUND_EVAL, got ' + STATE_NAMES[G.STATE]);
  r = act({ type: 'cash_out' });
  if (G.STATE !== STATES.SHOP) throw new Error('expected SHOP, got ' + STATE_NAMES[G.STATE]);
  G.GAME.dollars = 500;
}
function shopItem(area, key) {
  for (const c of area.cards.slice()) c.remove();
  const c = new Card(P_CARDS.empty, P_CENTERS[key]);
  area.emplace(c);
  return c;
}

// ================================================================== TAROTS
// The Fool
fresh();
{
  const fool = give('c_fool');
  ok(!fool.can_use_consumeable(), 'The Fool: unusable with no last Tarot/Planet');
  const merc = give('c_mercury');
  ok(use(merc).ok, 'Mercury used');
  ok(G.GAME.last_tarot_planet === 'c_mercury', 'last_tarot_planet = c_mercury');
  ok(fool.can_use_consumeable(), 'The Fool usable after Mercury');
  ok(use(fool).ok, 'The Fool used');
  ok(G.consumeables.cards.some((c) => c.config.center.key === 'c_mercury'), 'The Fool created a Mercury');
  ok(G.GAME.last_tarot_planet === 'c_fool', 'last_tarot_planet becomes c_fool');
  ok(!G.consumeables.cards.includes(fool) && !G.play.cards.includes(fool), 'The Fool removed after use');
}

// Enhancement tarots
const ENH = [
  ['c_magician', 'm_lucky', 2], ['c_empress', 'm_mult', 2], ['c_heirophant', 'm_bonus', 2],
  ['c_lovers', 'm_wild', 1], ['c_chariot', 'm_steel', 1], ['c_justice', 'm_glass', 1],
  ['c_devil', 'm_gold', 1], ['c_tower', 'm_stone', 1],
];
for (const [key, enh, max] of ENH) {
  fresh();
  const t = give(key);
  const too_many = [];
  for (let i = 0; i <= max; i++) too_many.push(H(i));
  G.hand.unhighlight_all(); for (const c of too_many) G.hand.add_to_highlighted(c);
  ok(!t.can_use_consumeable(), `${P_CENTERS[key].name}: unusable with ${max + 1} selected`);
  G.hand.unhighlight_all();
  ok(!t.can_use_consumeable(), `${P_CENTERS[key].name}: unusable with nothing selected`);
  const targets = too_many.slice(0, max);
  const r = use(t, targets);
  ok(r.ok, `${P_CENTERS[key].name} used on ${max} card(s)`);
  ok(targets.every((c) => c.config.center.key === enh), `${P_CENTERS[key].name}: targets became ${enh}`);
  ok(targets.every((c) => c.facing === 'front'), `${P_CENTERS[key].name}: targets flipped back face-up`);
  ok(G.hand.highlighted.length === 0, `${P_CENTERS[key].name}: hand unhighlighted`);
  ok(G.STATE === STATES.SELECTING_HAND, `${P_CENTERS[key].name}: state restored`);
  ok(r.events.some((e) => e.type === 'flip'), `${P_CENTERS[key].name}: flip events emitted`);
}

// Suit tarots
for (const [key, suit] of [['c_star', 'Diamonds'], ['c_moon', 'Clubs'], ['c_sun', 'Hearts'], ['c_world', 'Spades']]) {
  fresh();
  const t = give(key);
  const targets = [H(0), H(1), H(2)];
  ok(use(t, targets).ok, `${P_CENTERS[key].name} used on 3 cards`);
  ok(targets.every((c) => c.base.suit === suit), `${P_CENTERS[key].name}: targets became ${suit}`);
  ok(targets.every((c) => c.config.card.suit === suit), `${P_CENTERS[key].name}: front card swapped`);
}

// The High Priestess / The Emperor
for (const [key, set] of [['c_high_priestess', 'Planet'], ['c_emperor', 'Tarot']]) {
  fresh();
  G.consumeables.config.card_limit = 2;
  const t = give(key);
  ok(use(t).ok, `${P_CENTERS[key].name} used`);
  ok(G.consumeables.cards.length === 2 && G.consumeables.cards.every((c) => c.ability.set === set), `${P_CENTERS[key].name}: 2 ${set} cards created`);
  fresh();
  G.consumeables.config.card_limit = 2;
  const t2 = give(key); give('c_pluto');
  ok(use(t2).ok && G.consumeables.cards.length === 2, `${P_CENTERS[key].name}: only fills free slots (1 created)`);
  G.consumeables.config.card_limit = 1;
  const t3 = new Card(P_CARDS.empty, P_CENTERS[key]); G.pack_cards.emplace(t3);
  ok(!t3.can_use_consumeable(), `${P_CENTERS[key].name}: unusable from a pack with no free slot`);
}

// The Hermit
fresh();
{
  G.GAME.dollars = 4;
  ok(use(give('c_hermit')).ok && G.GAME.dollars === 8, 'The Hermit: $4 -> $8');
  G.GAME.dollars = 30;
  use(give('c_hermit'));
  ok(G.GAME.dollars === 50, 'The Hermit: capped at +$20 ($30 -> $50)');
  G.GAME.dollars = -3;
  use(give('c_hermit'));
  ok(G.GAME.dollars === -3, 'The Hermit: nothing when in debt');
}

// The Wheel of Fortune
fresh();
{
  const w = give('c_wheel_of_fortune');
  ok(!w.can_use_consumeable(), 'Wheel of Fortune: unusable with no editionless joker');
  const j = give('j_joker');
  ok(w.can_use_consumeable(), 'Wheel of Fortune: usable with an editionless joker');
  G.GAME.probabilities.normal = 4; // 4/4 -> guaranteed hit
  ok(use(w).ok, 'Wheel of Fortune used');
  ok(!!j.edition && !j.edition.negative, 'Wheel of Fortune: joker gained a non-negative edition (' + (j.edition && j.edition.type) + ')');
  G.GAME.probabilities.normal = 0; // never hits
  const j2 = give('j_joker');
  const r = use(give('c_wheel_of_fortune'));
  ok(r.ok && !j2.edition && r.events.some((e) => e.type === 'nope'), 'Wheel of Fortune: "Nope!" on a miss');
}

// Strength
fresh();
{
  setCard(H(0), 'H_K'); setCard(H(1), 'S_A');
  const a = H(0), b = H(1);
  ok(use(give('c_strength'), [a, b]).ok, 'Strength used');
  ok(a.base.value === 'Ace' && a.base.suit === 'Hearts', 'Strength: K of Hearts -> A of Hearts');
  ok(b.base.value === '2' && b.base.suit === 'Spades', 'Strength: A of Spades -> 2 of Spades');
  setCard(H(2), 'D_9');
  const c = H(2);
  use(give('c_strength'), [c]);
  ok(c.base.value === '10', 'Strength: 9 -> 10');
}

// The Hanged Man
fresh();
{
  const a = H(0), b = H(1), n = G.playing_cards.length;
  ok(use(give('c_hanged_man'), [a, b]).ok, 'The Hanged Man used');
  ok(!G.hand.cards.includes(a) && !G.hand.cards.includes(b), 'The Hanged Man: both cards left the hand');
  ok(G.playing_cards.length === n - 2, 'The Hanged Man: deck shrank by 2');
}

// Death
fresh();
{
  setCard(H(0), 'C_3'); setCard(H(5), 'H_Q');
  const left = H(0), right = H(5);
  right.set_ability(P_CENTERS.m_glass);
  ok(!give('c_death').can_use_consumeable(), 'Death: unusable with nothing selected');
  G.hand.add_to_highlighted(left);
  ok(!G.consumeables.cards[0].can_use_consumeable(), 'Death: unusable with 1 selected (min 2)');
  G.hand.unhighlight_all();
  // selection order deliberately right-then-left: Death copies onto everything but the RIGHTMOST
  ok(use(G.consumeables.cards[0], [right, left]).ok, 'Death used');
  ok(left.base.value === 'Queen' && left.base.suit === 'Hearts' && left.config.center.key === 'm_glass', 'Death: left card became a copy of the rightmost');
  ok(right.base.value === 'Queen' && G.hand.cards.includes(right), 'Death: rightmost unchanged');
}

// Temperance
fresh();
{
  G.GAME.dollars = 0;
  const j = give('j_joker'); give('j_joker');
  const expected = j.sell_cost * 2;
  ok(use(give('c_temperance')).ok && G.GAME.dollars === expected, `Temperance: gained joker sell value $${expected}`);
  for (const c of G.jokers.cards) c.ability.extra_value = 40, c.set_cost();
  G.GAME.dollars = 0;
  use(give('c_temperance'));
  ok(G.GAME.dollars === 50, 'Temperance: capped at $50');
}

// Judgement
fresh();
{
  const n = G.jokers.cards.length;
  ok(use(give('c_judgement')).ok && G.jokers.cards.length === n + 1 && G.jokers.cards[n].ability.set === 'Joker', 'Judgement: created a joker');
  G.jokers.config.card_limit = G.jokers.cards.length;
  ok(!give('c_judgement').can_use_consumeable(), 'Judgement: unusable with full joker slots');
}

// ================================================================== PLANETS
const PLANETS = {
  c_pluto: 'High Card', c_mercury: 'Pair', c_uranus: 'Two Pair', c_venus: 'Three of a Kind', c_saturn: 'Straight',
  c_jupiter: 'Flush', c_earth: 'Full House', c_mars: 'Four of a Kind', c_neptune: 'Straight Flush',
  c_planet_x: 'Five of a Kind', c_ceres: 'Flush House', c_eris: 'Flush Five',
};
fresh();
for (const [key, hand] of Object.entries(PLANETS)) {
  const h = G.GAME.hands[hand];
  const lv = h.level, chips = h.chips, mult = h.mult;
  ok(use(give(key)).ok, `${P_CENTERS[key].name} used`);
  ok(h.level === lv + 1 && h.chips === chips + h.l_chips && h.mult === mult + h.l_mult, `${P_CENTERS[key].name}: ${hand} level ${lv} -> ${h.level}`);
}
ok(G.GAME.consumeable_usage_total.planet === 12, 'consumeable_usage_total.planet counts 12');
// Black Hole
{
  const before = Object.fromEntries(Object.entries(G.GAME.hands).map(([k, v]) => [k, v.level]));
  ok(use(give('c_black_hole')).ok, 'Black Hole used');
  ok(Object.entries(G.GAME.hands).every(([k, v]) => v.level === before[k] + 1), 'Black Hole: every hand +1 level');
}
// planets are usable outside a round too (shop)
gotoShop();
{
  const p = give('c_pluto');
  ok(p.can_use_consumeable(), 'Planet usable in the shop');
  ok(!give('c_magician').can_use_consumeable(), 'Magician unusable in the shop (no hand)');
}
// Negative consumable gives its slot back when used
fresh();
{
  G.consumeables.config.card_limit = 2;
  const p = give('c_pluto', 'negative');
  ok(G.consumeables.config.card_limit === 3, 'Negative consumable: +1 slot');
  use(p);
  ok(G.consumeables.config.card_limit === 2, 'Negative consumable: slot returned on use');
}

// ================================================================= SPECTRALS
// Familiar / Grim / Incantation
for (const [key, n, check] of [
  ['c_familiar', 3, (c) => c.is_face(true) || [11, 12, 13].includes(c.base.id)],
  ['c_grim', 2, (c) => c.base.id === 14],
  ['c_incantation', 4, (c) => c.base.id >= 2 && c.base.id <= 10],
]) {
  fresh();
  const before = G.hand.cards.slice(), deck = G.playing_cards.length;
  ok(use(give(key)).ok, `${P_CENTERS[key].name} used`);
  const added = G.hand.cards.filter((c) => !before.includes(c));
  ok(G.hand.cards.length === 8 - 1 + n, `${P_CENTERS[key].name}: hand 8 -1 +${n} = ${G.hand.cards.length}`);
  ok(added.length === n && added.every(check), `${P_CENTERS[key].name}: created the right ranks`);
  ok(added.every((c) => c.ability.set === 'Enhanced' && c.config.center.key !== 'm_stone'), `${P_CENTERS[key].name}: created cards are enhanced (never Stone)`);
  ok(G.playing_cards.length === deck - 1 + n, `${P_CENTERS[key].name}: deck size ${deck} -> ${G.playing_cards.length}`);
}
// Seals
for (const [key, seal] of [['c_talisman', 'Gold'], ['c_deja_vu', 'Red'], ['c_trance', 'Blue'], ['c_medium', 'Purple']]) {
  fresh();
  const t = H(3);
  ok(use(give(key), [t]).ok && t.seal === seal, `${P_CENTERS[key].name}: ${seal} seal applied`);
}
// Aura
fresh();
{
  const t = H(0);
  const a = give('c_aura');
  G.hand.add_to_highlighted(t); G.hand.add_to_highlighted(H(1));
  ok(!a.can_use_consumeable(), 'Aura: unusable with 2 selected');
  G.hand.unhighlight_all();
  ok(use(a, [t]).ok && t.edition && ['foil', 'holo', 'polychrome'].includes(t.edition.type), 'Aura: edition applied (' + (t.edition && t.edition.type) + ')');
  give('c_aura');
  G.hand.unhighlight_all(); G.hand.add_to_highlighted(t);
  ok(!G.consumeables.cards[0].can_use_consumeable(), 'Aura: unusable on a card that already has an edition');
}
// Wraith
fresh();
{
  G.GAME.dollars = 37;
  const n = G.jokers.cards.length;
  ok(use(give('c_wraith')).ok, 'Wraith used');
  ok(G.jokers.cards.length === n + 1 && G.jokers.cards[n].config.center.rarity === 3, 'Wraith: created a rare joker');
  ok(G.GAME.dollars === 0, 'Wraith: money set to $0');
}
// Sigil / Ouija
fresh();
{
  ok(use(give('c_sigil')).ok, 'Sigil used');
  const s = G.hand.cards[0].base.suit;
  ok(G.hand.cards.every((c) => c.base.suit === s), 'Sigil: every hand card is ' + s);
  const limit = G.hand.config.card_limit;
  ok(use(give('c_ouija')).ok, 'Ouija used');
  const v = G.hand.cards[0].base.value;
  ok(G.hand.cards.every((c) => c.base.value === v), 'Ouija: every hand card is rank ' + v);
  ok(G.hand.cards.every((c) => c.base.suit === s), 'Ouija: suits kept');
  ok(G.hand.config.card_limit === limit - 1, 'Ouija: -1 hand size');
}
// Ectoplasm
fresh();
{
  const e = give('c_ectoplasm');
  ok(!e.can_use_consumeable(), 'Ectoplasm: unusable without jokers');
  const j = give('j_joker');
  const limit = G.hand.config.card_limit, jl = G.jokers.config.card_limit;
  ok(use(e).ok, 'Ectoplasm used');
  ok(j.edition && j.edition.negative, 'Ectoplasm: joker became Negative');
  ok(G.jokers.config.card_limit === jl + 1, 'Ectoplasm: Negative gives +1 joker slot');
  ok(G.hand.config.card_limit === limit - 1 && G.GAME.ecto_minus === 2, 'Ectoplasm: -1 hand size, ecto_minus -> 2');
  give('j_joker');
  use(give('c_ectoplasm'));
  ok(G.hand.config.card_limit === limit - 3 && G.GAME.ecto_minus === 3, 'Ectoplasm (2nd): -2 hand size');
}
// Immolate
fresh();
{
  G.GAME.dollars = 0;
  const n = G.playing_cards.length;
  ok(use(give('c_immolate')).ok, 'Immolate used');
  ok(G.hand.cards.length === 3 && G.playing_cards.length === n - 5, 'Immolate: destroyed 5 hand cards');
  ok(G.GAME.dollars === 20, 'Immolate: +$20');
}
// Ankh
fresh();
{
  const a = give('j_joker'), b = give('j_greedy_joker');
  b.set_edition({ negative: true }, true, true);
  const e = give('j_lusty_joker'); e.set_eternal(true);
  const ankh = give('c_ankh');
  ok(ankh.can_use_consumeable(), 'Ankh usable with jokers');
  ok(use(ankh).ok, 'Ankh used');
  const names = G.jokers.cards.map((c) => c.ability.name);
  const copy = G.jokers.cards[G.jokers.cards.length - 1];
  ok(G.jokers.cards.includes(e), 'Ankh: eternal joker survives');
  const others = G.jokers.cards.filter((c) => c !== e && c !== copy);
  ok(copy.ability.name === e.ability.name ? others.length === 0 : (others.length === 1 && others[0].ability.name === copy.ability.name),
    'Ankh: only the chosen joker + its copy (+ eternals) remain (' + names.join(', ') + ')');
  ok([a, b].filter((c) => G.jokers.cards.includes(c)).length <= 1, 'Ankh: other non-eternal jokers destroyed');
  ok(!(copy.edition && copy.edition.negative), 'Ankh: copy never Negative');
  G.jokers.config.card_limit = G.jokers.cards.length;
  const ankh2 = give('c_ankh');
  const r = use(ankh2);
  ok(G.consumeables.cards.includes(ankh2) && r.events.some((x) => x.type === 'no_space'), 'Ankh: check_use blocks with full joker slots');
}
// Hex
fresh();
{
  give('j_joker'); give('j_greedy_joker');
  const e = give('j_lusty_joker'); e.set_eternal(true);
  ok(use(give('c_hex')).ok, 'Hex used');
  const poly = G.jokers.cards.filter((c) => c.edition && c.edition.polychrome);
  ok(poly.length === 1, 'Hex: one joker became Polychrome');
  ok(G.jokers.cards.length === (poly[0] === e ? 1 : 2) && G.jokers.cards.includes(e), 'Hex: other non-eternal jokers destroyed');
}
// Cryptid
fresh();
{
  setCard(H(2), 'S_7');
  const t = H(2); t.set_seal('Red', true);
  const n = G.playing_cards.length;
  ok(use(give('c_cryptid'), [t]).ok, 'Cryptid used');
  const copies = G.hand.cards.filter((c) => c !== t && c.base.value === '7' && c.base.suit === 'Spades' && c.seal === 'Red');
  ok(copies.length === 2 && G.playing_cards.length === n + 2, 'Cryptid: 2 copies added to hand + deck');
}
// The Soul
fresh();
{
  const n = G.jokers.cards.length;
  ok(use(give('c_soul')).ok && G.jokers.cards.length === n + 1 && G.jokers.cards[n].config.center.rarity === 4, 'The Soul: created a legendary joker');
}
// Spectral usage counter
ok(G.GAME.consumeable_usage_total.spectral === 1, 'consumeable_usage_total.spectral counts');

// ================================================================= BOOSTERS
function openPack(key) {
  const b = shopItem(G.shop_booster, key);
  const d = G.GAME.dollars, cost = b.cost;
  const r = act({ type: 'buy', id: b.sort_id });
  return { r, b, cost, spent: d - G.GAME.dollars };
}
// Arcana
gotoShop();
{
  const { r, b, cost, spent } = openPack('p_arcana_normal_1');
  ok(r.ok && G.STATE === STATES.TAROT_PACK, 'Arcana Pack: state TAROT_PACK');
  ok(spent === cost && cost > 0, `Arcana Pack: charged $${cost}`);
  ok(G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.ability.set === 'Tarot' || c.ability.set === 'Spectral'), 'Arcana Pack: 3 Tarot cards');
  ok(G.GAME.pack_size === 3 && G.GAME.pack_choices === 1, 'Arcana Pack: pack_size 3 / choose 1');
  ok(G.hand.cards.length === G.hand.config.card_limit, 'Arcana Pack: hand drawn for targets');
  ok(b.removed && !G.shop_booster.cards.includes(b) && !G.play.cards.includes(b), 'Arcana Pack: booster card exploded/removed');
  ok(r.events.some((e) => e.type === 'pack_opened') && r.events.some((e) => e.type === 'explode'), 'Arcana Pack: pack_opened + explode emitted');
  // pick a usable tarot (select the first two hand cards as targets)
  let picked = false;
  for (const c of G.pack_cards.cards.slice()) {
    G.hand.unhighlight_all(); G.hand.add_to_highlighted(G.hand.cards[0]);
    if (c.can_use_consumeable()) { picked = use(c, [G.hand.cards[0]]).ok; break; }
  }
  if (picked) {
    ok(G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0 && G.hand.cards.length === 0, 'Arcana Pack: pick closes pack, hand back to deck, back to SHOP');
  } else {
    ok(act({ type: 'skip_booster' }).ok && G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0, 'Arcana Pack: skip closes pack');
  }
  ok(G.GAME.PACK_INTERRUPT == null, 'Arcana Pack: PACK_INTERRUPT cleared');
}
// Celestial (normal + mega choices)
gotoShop();
{
  const { r } = openPack('p_celestial_normal_1');
  ok(r.ok && G.STATE === STATES.PLANET_PACK && G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.ability.set === 'Planet'), 'Celestial Pack: 3 planets, PLANET_PACK');
  ok(G.hand.cards.length === 0, 'Celestial Pack: no hand drawn');
  const p = G.pack_cards.cards[0], ht = p.ability.consumeable.hand_type, lv = G.GAME.hands[ht].level;
  ok(use(p).ok && G.GAME.hands[ht].level === lv + 1, 'Celestial Pack: picked planet levels ' + ht);
  ok(G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0, 'Celestial Pack: closes after 1 pick');
  openPack('p_celestial_mega_1');
  ok(G.GAME.pack_choices === 2 && G.pack_cards.cards.length === 5, 'Mega Celestial: 5 cards, choose 2');
  use(G.pack_cards.cards[0]);
  ok(G.STATE === STATES.PLANET_PACK && G.GAME.pack_choices === 1 && G.pack_cards.cards.length === 4, 'Mega Celestial: still open after 1st pick');
  use(G.pack_cards.cards[0]);
  ok(G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0, 'Mega Celestial: closes after 2nd pick');
}
// Telescope
gotoShop();
{
  G.GAME.used_vouchers.v_telescope = true;
  G.GAME.hands['Flush'].played = 9; G.GAME.hands['Flush'].visible = true;
  openPack('p_celestial_jumbo_1');
  ok(G.pack_cards.cards.length === 5 && G.pack_cards.cards[0].config.center.key === 'c_jupiter', 'Telescope: first Celestial card is the most-played hand\'s planet (Jupiter)');
  act({ type: 'skip_booster' });
}
// Spectral
gotoShop();
{
  const { r } = openPack('p_spectral_normal_1');
  ok(r.ok && G.STATE === STATES.SPECTRAL_PACK && G.pack_cards.cards.length === 2 && G.pack_cards.cards.every((c) => c.ability.set === 'Spectral'), 'Spectral Pack: 2 spectrals, SPECTRAL_PACK');
  ok(G.hand.cards.length > 0, 'Spectral Pack: hand drawn');
  ok(act({ type: 'skip_booster' }).ok && G.STATE === STATES.SHOP && G.hand.cards.length === 0, 'Spectral Pack: skip returns to SHOP, hand back to deck');
}
// Standard
gotoShop();
{
  const n = G.playing_cards.length;
  const { r } = openPack('p_standard_normal_1');
  ok(r.ok && G.STATE === STATES.STANDARD_PACK && G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.ability.set === 'Default' || c.ability.set === 'Enhanced'), 'Standard Pack: 3 playing cards');
  const pick = G.pack_cards.cards[0];
  ok(use(pick).ok, 'Standard Pack: pick');
  ok(G.deck.cards.includes(pick) && G.playing_cards.includes(pick) && G.playing_cards.length === n + 1, 'Standard Pack: picked card joins the deck');
  ok(G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0, 'Standard Pack: closes');
}
// Buffoon
gotoShop();
{
  const n = G.jokers.cards.length;
  const { r } = openPack('p_buffoon_normal_1');
  ok(r.ok && G.STATE === STATES.BUFFOON_PACK && G.pack_cards.cards.length === 2 && G.pack_cards.cards.every((c) => c.ability.set === 'Joker'), 'Buffoon Pack: 2 jokers');
  const pick = G.pack_cards.cards[1];
  ok(use(pick).ok && G.jokers.cards.includes(pick) && G.jokers.cards.length === n + 1, 'Buffoon Pack: picked joker added');
  ok(G.STATE === STATES.SHOP && G.pack_cards.cards.length === 0, 'Buffoon Pack: closes');
  openPack('p_buffoon_mega_1');
  ok(G.pack_cards.cards.length === 4 && G.GAME.pack_choices === 2, 'Mega Buffoon: 4 jokers, choose 2');
  act({ type: 'skip_booster' });
  ok(G.STATE === STATES.SHOP, 'Mega Buffoon: skip closes');
}
// Omen Globe
gotoShop();
{
  G.GAME.used_vouchers.v_omen_globe = true;
  let spectral = 0, tarot = 0;
  for (let i = 0; i < 10; i++) {
    openPack('p_arcana_mega_1');
    for (const c of G.pack_cards.cards) { if (c.ability.set === 'Spectral') spectral++; else if (c.ability.set === 'Tarot') tarot++; }
    act({ type: 'skip_booster' });
  }
  ok(spectral > 0 && tarot > 0, `Omen Globe: Arcana packs contain Spectral cards (${spectral} spectral / ${tarot} tarot)`);
  G.GAME.used_vouchers.v_omen_globe = undefined;
  spectral = 0;
  for (let i = 0; i < 6; i++) {
    openPack('p_arcana_mega_1');
    for (const c of G.pack_cards.cards) if (c.ability.set === 'Spectral') spectral++;
    act({ type: 'skip_booster' });
  }
  ok(spectral === 0, 'No Omen Globe: Arcana packs are Tarot-only');
}
// Inflation modifier
gotoShop();
{
  G.GAME.modifiers.inflation = true;
  openPack('p_buffoon_normal_1');
  ok(G.GAME.inflation === 1, 'open(): inflation modifier ticks');
  act({ type: 'skip_booster' });
}

// ================================================================= VOUCHERS
function redeem(key) {
  gotoShop('V' + key);
  const v = shopItem(G.shop_vouchers, key);
  v.shop_voucher = true;
  const snap = {
    joker_max: G.GAME.shop.joker_max, shop_jokers: G.shop_jokers.cards.length,
    cons: G.consumeables.config.card_limit, jokers: G.jokers.config.card_limit, hand: G.hand.config.card_limit,
    hands: G.GAME.round_resets.hands, hands_left: G.GAME.current_round.hands_left,
    discards: G.GAME.round_resets.discards, discards_left: G.GAME.current_round.discards_left,
    rr: G.GAME.round_resets.reroll_cost, cr: G.GAME.current_round.reroll_cost,
    ante: G.GAME.round_resets.ante, blind_ante: G.GAME.round_resets.blind_ante,
    dollars: G.GAME.dollars, cost: v.cost,
    jcost: G.shop_jokers.cards[0] && G.shop_jokers.cards[0].cost,
  };
  const r = act({ type: 'buy', id: v.sort_id });
  if (!r.ok) throw new Error('redeem failed ' + key + ': ' + r.error);
  ok(G.GAME.used_vouchers[key] === true && G.GAME.dollars === snap.dollars - snap.cost && !G.shop_vouchers.cards.includes(v),
    `${P_CENTERS[key].name}: redeemed, $${snap.cost} charged`);
  return snap;
}
const VCHECK = {
  v_overstock_norm: (s) => G.GAME.shop.joker_max === s.joker_max + 1 && G.shop_jokers.cards.length === s.shop_jokers + 1,
  v_overstock_plus: (s) => G.GAME.shop.joker_max === s.joker_max + 1 && G.shop_jokers.cards.length === s.shop_jokers + 1,
  v_clearance_sale: (s) => G.GAME.discount_percent === 25 && (!s.jcost || G.shop_jokers.cards[0].cost < s.jcost),
  v_liquidation: (s) => G.GAME.discount_percent === 50 && (!s.jcost || G.shop_jokers.cards[0].cost < s.jcost),
  v_hone: () => G.GAME.edition_rate === 2,
  v_glow_up: () => G.GAME.edition_rate === 4,
  v_reroll_surplus: (s) => G.GAME.round_resets.reroll_cost === s.rr - 2 && G.GAME.current_round.reroll_cost === Math.max(0, s.cr - 2),
  v_reroll_glut: (s) => G.GAME.round_resets.reroll_cost === s.rr - 2 && G.GAME.current_round.reroll_cost === Math.max(0, s.cr - 2),
  v_crystal_ball: (s) => G.consumeables.config.card_limit === s.cons + 1,
  v_omen_globe: () => true,
  v_telescope: () => true,
  v_observatory: () => true,
  v_grabber: (s) => G.GAME.round_resets.hands === s.hands + 1 && G.GAME.current_round.hands_left === s.hands_left + 1,
  v_nacho_tong: (s) => G.GAME.round_resets.hands === s.hands + 1 && G.GAME.current_round.hands_left === s.hands_left + 1,
  v_wasteful: (s) => G.GAME.round_resets.discards === s.discards + 1 && G.GAME.current_round.discards_left === s.discards_left + 1,
  v_recyclomancy: (s) => G.GAME.round_resets.discards === s.discards + 1 && G.GAME.current_round.discards_left === s.discards_left + 1,
  v_tarot_merchant: () => Math.abs(G.GAME.tarot_rate - 9.6) < 1e-9,
  v_tarot_tycoon: () => G.GAME.tarot_rate === 32,
  v_planet_merchant: () => Math.abs(G.GAME.planet_rate - 9.6) < 1e-9,
  v_planet_tycoon: () => G.GAME.planet_rate === 32,
  v_seed_money: () => G.GAME.interest_cap === 50,
  v_money_tree: () => G.GAME.interest_cap === 100,
  v_blank: () => true,
  v_antimatter: (s) => G.jokers.config.card_limit === s.jokers + 1,
  v_magic_trick: () => G.GAME.playing_card_rate === 4,
  v_illusion: () => G.GAME.playing_card_rate === 4,
  v_hieroglyph: (s) => G.GAME.round_resets.ante === s.ante - 1 && G.GAME.round_resets.blind_ante === s.blind_ante - 1 && G.GAME.round_resets.hands === s.hands - 1 && G.GAME.current_round.hands_left === s.hands_left - 1,
  v_petroglyph: (s) => G.GAME.round_resets.ante === s.ante - 1 && G.GAME.round_resets.blind_ante === s.blind_ante - 1 && G.GAME.round_resets.discards === s.discards - 1 && G.GAME.current_round.discards_left === s.discards_left - 1,
  v_directors_cut: () => true,
  v_retcon: () => true,
  v_paint_brush: (s) => G.hand.config.card_limit === s.hand + 1,
  v_palette: (s) => G.hand.config.card_limit === s.hand + 1,
};
for (const v of Object.values(P_CENTERS).filter((c) => c.set === 'Voucher').map((c) => c.key)) {
  const chk = VCHECK[v];
  ok(!!chk, `${v}: has a test`);
  if (!chk) continue;
  const s = redeem(v);
  ok(chk(s), `${P_CENTERS[v].name}: apply_to_run effect`);
}
// voucher removed from the round's offer
gotoShop('VOFFER');
{
  const v = G.shop_vouchers.cards[0];
  if (v) {
    act({ type: 'buy', id: v.sort_id });
    ok(G.GAME.current_round.voucher == null, 'redeem(): clears G.GAME.current_round.voucher');
  }
}
// static Card.apply_to_run(nil, center) — backs/tags
fresh();
{
  const c = G.consumeables.config.card_limit;
  Card.apply_to_run(null, P_CENTERS.v_crystal_ball); E_MANAGER.flush();
  ok(G.consumeables.config.card_limit === c + 1, 'Card.apply_to_run(null, Crystal Ball) works without a card');
  const rr = G.GAME.round_resets.reroll_cost;
  Card.apply_to_run(null, P_CENTERS.v_reroll_surplus); E_MANAGER.flush();
  ok(G.GAME.round_resets.reroll_cost === rr - 2, 'Card.apply_to_run(null, Reroll Surplus) uses center extra (no crash)');
  Card.apply_to_run(null, P_CENTERS.v_tarot_merchant); E_MANAGER.flush();
  ok(Math.abs(G.GAME.tarot_rate - 9.6) < 1e-9, 'Card.apply_to_run(null, Tarot Merchant)');
  Card.apply_to_run(P_CENTERS.v_seed_money); E_MANAGER.flush();
  ok(G.GAME.interest_cap === 50, 'Card.apply_to_run(center) one-argument form');
}
// decks that start with vouchers (back.js -> Card.apply_to_run)
newRun({ seed: 'ZOD', back: 'b_zodiac' });
ok(Math.abs(G.GAME.tarot_rate - 9.6) < 1e-9 && Math.abs(G.GAME.planet_rate - 9.6) < 1e-9 && G.GAME.shop.joker_max === 3,
  'Zodiac Deck: Tarot Merchant + Planet Merchant + Overstock applied');
newRun({ seed: 'MAG', back: 'b_magic' });
ok(G.consumeables.config.card_limit === 3 && G.GAME.used_vouchers.v_crystal_ball, 'Magic Deck: Crystal Ball applied (3 consumable slots)');

// ============================================================ determinism
function trace(seed) {
  gotoShop(seed);
  openPack('p_arcana_mega_1');
  const a = G.pack_cards.cards.map((c) => c.config.center.key).join(',');
  act({ type: 'skip_booster' });
  openPack('p_standard_mega_1');
  const b = G.pack_cards.cards.map((c) => c.config.card.key + c.config.center.key + (c.seal || '') + (c.edition ? c.edition.type : '')).join(',');
  return a + '|' + b;
}
ok(trace('DET') === trace('DET'), 'packs are deterministic per seed');

console.log(`\n${passes} passed, ${fails} failed`);
if (fails) process.exit(1);
