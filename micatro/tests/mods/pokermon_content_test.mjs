// Pokermon non-joker content: every consumable (mart1/2/3, martz, zberryjuice, zmachine), both
// non-Pocket packs, the 4 vouchers, the 10 decks, the 6 tags, the Iridescent Hacker (was Chartreuse Chamber) boss, the Hazard /
// Flower enhancements and the Pink / Silver seals — each fired through real actions. (Batch 10's 3.9.1 additions — Seed,
// Miracle Seed, Heavy-Duty Boots, the Debris deck — are fired in pokermon_391_hazard_test.mjs.)
//   node micatro/tests/mods/pokermon_content_test.mjs
import { T, start, hand, add, play, winRound, nextRound, clearHand, statusMsgs, G, P_CENTERS, P_CARDS, act, STATES } from './poke_helpers.mjs';
import { P_BLINDS, P_TAGS, Card, get_new_boss, get_current_pool, create_card } from '../../js/engine/core.js';
import { newRun, pump } from '../../js/engine/run.js';
import { Tag, add_tag } from '../../js/engine/tag.js';
import { STATUS } from '../../mods/pokermon/index.js';
import * as P from '../../mods/pokermon/api.js';
import { determine_type } from '../../mods/pokermon/blinds/pokebossblind.js';

const { ok, done } = T();
const key = (c) => c.config.center.key;
const use = (c, targets, joker_targets) => act({ type: 'use', id: c.sort_id, targets: targets && targets.map((x) => x.sort_id), joker_targets: joker_targets && joker_targets.map((x) => x.sort_id) });
const consKeys = () => G.consumeables.cards.map(key);
const sel = (cards) => { act({ type: 'highlight', ids: cards.map((c) => c.sort_id) }); };
/** Put a pack in the shop and buy it (from the shop state). */
function buyPack(k) {
  const pack = new Card(P_CARDS.empty, P_CENTERS[k]);
  G.shop_booster.emplace(pack);
  G.GAME.dollars = 2000;
  return act({ type: 'buy', id: pack.sort_id });
}
function toShop() { winRound(); act({ type: 'cash_out' }); }

// ================================================================ registration
{
  const kinds = ['consumables', 'boosters', 'vouchers', 'backs', 'tags', 'blinds', 'seals', 'enhancements'];
  for (const k of kinds) ok(STATUS.UNPORTED[k].length === 0, k + ': nothing unported', STATUS.UNPORTED[k]);
  const files = STATUS.PORTED_FILES;
  ok(files['consumables/mart1.lua'].length === 23, 'mart1: 23 (all but Cryptid-only emergy)', files['consumables/mart1.lua'].length);
  ok(files['consumables/mart2.lua'].length === 19 && files['consumables/mart3.lua'].length === 5 && files['consumables/martz.lua'].length === 7, 'mart2 19 / mart3 5 / martz 7');
  ok(files['consumables/zberryjuice.lua'].length === 7 && files['consumables/zmachine.lua'].length === 5, 'zberryjuice 7 / zmachine 5');
  ok(files['boosters/packs1.lua'].length === 10 && files['vouchers/pokevouchers.lua'].length === 4 && files['backs/backs1.lua'].length === 11, 'packs 10 / vouchers 4 / backs 11 (+ the 3.9.1 Debris deck)');
  ok(files['tags/tags1.lua'].length === 6 && files['blinds/pokebossblind.lua'].length === 1 && files['seals/seals1.lua'].length === 2 && files['enhancements/enhancement1.lua'].length === 3, 'tags 6 / blind 1 / seals 2 / enhancements 3 (+ the 3.9.1 Seed)');
  ok(files['consumables/03_mart_items.lua'].join() === 'miracleseed' && files['consumables/04_mart_rare.lua'].join() === 'heavyboots', '3.9.1 Items: Miracle Seed, Heavy-Duty Boots');
}

// ================================================================ mart1 leftovers
{
  start('BIRD');
  const ch = add('j_poke_charmander');
  const be = add('c_poke_bird_energy');
  ok(use(be).ok && P.get_total_energy(ch) === P.energy_max && G.GAME.energies_used === 1, 'Bird Energy: fills the whole Energy limit', P.get_total_energy(ch));
  ok(!P_CENTERS.c_poke_bird_energy.in_pool(), 'Bird Energy never in a pool');
}
{
  start('OBIT');
  const [c] = hand(['S_5']);
  const ob = add('c_poke_obituary');
  ok(use(ob, [c]).ok && c.seal === 'poke_pink_seal', 'Obituary: Pink Seal', c.seal);
  const [d] = hand(['S_6']);
  const rv = add('c_poke_revenant');
  ok(!use(rv).ok, 'Revenant needs a selected card (vanilla max_highlighted rule)');
  ok(use(rv, [d]).ok && d.seal === 'poke_silver', 'Revenant: Silver Seal', d.seal);
}
{
  start('NIGHT');
  const ch = add('j_poke_charmander');
  const jk = add('j_joker');
  const nm = add('c_poke_nightmare');
  ok(!use(nm, null, [jk]).ok, 'Nightmare: not on a typeless joker');
  ok(use(nm, null, [ch]).ok && !G.jokers.cards.includes(ch), 'Nightmare destroys the selected Pokémon');
  const en = G.consumeables.cards.filter((c) => key(c) === 'c_poke_fire_energy');
  ok(en.length === 2 && en.every((c) => c.edition && c.edition.negative), '... and makes 2 Negative Fire Energies', consKeys());
}

// ================================================================ mart2
{
  start('SUN');
  const gloom = add('j_poke_gloom');
  const cs = hand(['S_5', 'H_9']);
  const sn = add('c_poke_sunstone');
  ok(use(sn, cs).ok, 'Sun Stone usable on 2 cards');
  ok(cs.every((c) => key(c) === 'm_wild' && c.base.suit === (c === cs[0] ? 'Spades' : 'Hearts')), 'Sun Stone: Wild, same suit', cs.map((c) => [key(c), c.base.value]));
  ok(gloom.ability.extra.evolve === 'sunstone', 'Sun Stone marks Gloom (Bellossom branch)', gloom.ability.extra.evolve);
  const sn2 = add('c_poke_sunstone');
  ok(!use(sn2, hand(['S_2', 'S_3', 'S_4'])).ok, 'Sun Stone: max 2 cards');
}
{
  start('WATER');
  const sh = add('j_poke_shellder');
  const [c] = hand(['S_7']);
  ok(use(add('c_poke_waterstone'), [c]).ok && key(c) === 'm_bonus' && sh.ability.extra.evolve === true, 'Water Stone: Bonus card + marks Shellder');
  ok(use(add('c_poke_waterstone'), [c]).ok && c.ability.perma_bonus === 37, 'Water Stone on a Bonus 7: +37 permanent chips (its total, max 50)', c.ability.perma_bonus);
  ok(use(add('c_poke_waterstone'), [c]).ok && c.ability.perma_bonus === 37 + 50, 'capped at +50', c.ability.perma_bonus);
}
{
  start('FIRE');
  const vp = add('j_poke_vulpix');
  const cs = hand(['S_2', 'S_3', 'S_4', 'S_5']);
  const n0 = G.playing_cards.length;
  ok(!use(add('c_poke_firestone'), cs.slice(0, 3)).ok, 'Fire Stone needs exactly 4');
  G.consumeables.cards.slice().forEach((c) => c.remove());
  ok(use(add('c_poke_firestone'), cs).ok, 'Fire Stone on 4');
  ok(G.playing_cards.length === n0 - 1 && cs.filter((c) => G.playing_cards.includes(c)).every((c) => key(c) === 'm_mult'), 'Fire Stone: 4 Mult cards, one destroyed', G.playing_cards.length - n0);
  ok(vp.ability.extra.evolve === true, 'Fire Stone marks Vulpix');
}
{
  start('LEAF');
  const wb = add('j_poke_weepinbell');
  const cs = hand(['S_2', 'S_3', 'S_4', 'S_5', 'H_6']);
  G.GAME.probabilities.normal = 3; // 1 in 3 -> 3 in 3
  ok(use(add('c_poke_leafstone')).ok && cs.every((c) => key(c) === 'm_lucky') && wb.ability.extra.evolve === true, 'Leaf Stone: hand -> Lucky (odds x3 = all), marks Weepinbell');
  G.GAME.probabilities.normal = 1;
}
{
  start('LINK');
  const kd = add('j_poke_kadabra');
  const cs = hand(['S_5', 'H_9']);
  ok(use(add('c_poke_linkcable'), cs).ok && cs[0].base.value === '6' && cs[1].base.value === '8' && kd.ability.extra.evolve === true, 'Link Cable: left +1 rank, right -1, marks Kadabra', cs.map((c) => c.base.value));
}
{
  start('LEFTOVERS');
  const j1 = add('j_joker'); const j2 = add('j_joker');
  const lo = add('c_poke_leftovers');
  const s0 = j2.sell_cost;
  ok(use(lo, null, [j2]).ok && j2.sell_cost === s0 + 2 && j1.ability.extra_value === 0, 'Leftovers: +$2 sell value on the selected joker', [s0, j2.sell_cost]);
  ok(G.consumeables.cards.includes(lo) && !lo.ability.extra.usable && !use(lo).ok, 'Leftovers stays (reusable) but once per round');
  winRound();
  ok(lo.ability.extra.usable, 'Leftovers resets at end of round');
}
{
  start('LEEK');
  const lk = add('c_poke_leek');
  G.GAME.probabilities.normal = 2;
  ok(use(lk).ok && lk.edition && (lk.edition.foil || lk.edition.holo || lk.edition.polychrome) && !lk.ability.extra.usable, 'Leek: gives itself an edition (odds x2 = sure)', lk.edition);
  G.GAME.probabilities.normal = 1;
  winRound();
  ok(!lk.edition && lk.ability.extra.usable, 'Leek: edition gone + reset at end of round');
  ok(!P_CENTERS.c_poke_leek.in_pool(), 'Leek never in a pool');
}
{
  start('CLUB');
  const tc = add('c_poke_thickclub');
  const [c] = hand(['D_4']);
  ok(use(tc, [c]).ok && c.ability.perma_bonus === 10 && !tc.ability.extra.usable && G.consumeables.cards.includes(tc), 'Thick Club: +10 chips, kept, used up this round');
}
{
  start('TERA');
  const ch = add('j_poke_charmander');
  const orb = add('c_poke_teraorb');
  ok(P.POKETYPES.includes(orb.ability.extra.change_to_type), 'Tera Orb rolls a type when created', orb.ability.extra.change_to_type);
  const before = orb.ability.extra.change_to_type;
  play(hand(['S_2']));
  ok(orb.ability.extra.change_to_type !== before, 'Tera Orb: new type every hand played', [before, orb.ability.extra.change_to_type]);
  orb.ability.extra.change_to_type = 'Fire';
  ok(P_CENTERS.c_poke_teraorb.get_pos(P_CENTERS.c_poke_teraorb, orb).x === 0 && P_CENTERS.c_poke_teraorb.get_pos(P_CENTERS.c_poke_teraorb, orb).y === 9, 'Tera Orb art follows its type');
  ok(use(orb).ok && P.type_sticker_applied(ch) === 'Fire' && P.get_total_energy(ch) === 1, 'Tera Orb (Fire) on a Fire Pokémon: Energize + Fire Tera', [P.type_sticker_applied(ch), P.get_total_energy(ch)]);
  const orb2 = add('c_poke_teraorb');
  orb2.ability.extra.change_to_type = 'Water';
  ok(use(orb2).ok && P.type_sticker_applied(ch) === 'Water' && P.get_total_energy(ch) === 1, 'Tera Orb (Water): Tera only');
}
{
  start('METAL');
  const jk = add('j_joker');
  const [c] = hand(['C_K']);
  const n0 = G.playing_cards.length;
  ok(!use(add('c_poke_metalcoat')).ok, 'Metal Coat needs 1 selected card');
  ok(use(G.consumeables.cards[0], [c]).ok && jk.ability.metal_sticker && G.playing_cards.length === n0 + 1, 'Metal Coat: Metal Tera on the joker + a copy');
  const cp = G.playing_cards[G.playing_cards.length - 1];
  ok(key(cp) === 'm_steel' && cp.base.value === 'King' && cp.area === G.hand, 'the copy is a Steel King in hand', [key(cp), cp.base.value]);
}
{
  start('DRAGON');
  const jk = add('j_joker');
  G.consumeables.config.card_limit = 5;
  const ds = add('c_poke_dragonscale');
  const r = use(ds);
  ok(r.ok && jk.ability.dragon_sticker && G.consumeables.cards.length === 3, 'Dragon Scale: Dragon Tera + 3 Items/Energies', consKeys());
  ok(G.consumeables.cards.every((c) => c.ability.set === 'Item' || c.ability.set === 'Energy'), 'all Items / Energies');
  ok(statusMsgs(r.events).includes(P.localize('poke_dragon_ex')), 'the Dragon! popup shows (intended-design fix)');
}
{
  start('KING');
  const pw = add('j_poke_poliwhirl');
  const [c] = hand(['H_3']);
  ok(use(add('c_poke_kingsrock'), [c]).ok && c.base.value === 'King' && c.base.suit === 'Hearts' && pw.ability.extra.evolve === 'kingsrock', "King's Rock: card -> King, marks Poliwhirl (Politoed branch)", pw.ability.extra.evolve);
}
{
  start('UPGRADE');
  const pg = add('j_poke_porygon');
  const cs = hand(['S_2', 'H_3']);
  ok(P_CENTERS.c_poke_upgrade.in_pool() && !P_CENTERS.c_poke_dubious_disc.in_pool(), 'Up-Grade in pool without Porygon2, Dubious Disc not');
  ok(use(add('c_poke_upgrade'), cs).ok && key(cs[0]) === key(cs[1]) && ['m_bonus', 'm_mult', 'm_wild', 'm_glass', 'm_steel', 'm_gold', 'm_lucky'].includes(key(cs[0])) && pg.ability.extra.evolve === true,
    'Up-Grade: both get the same enhancement, marks Porygon', key(cs[0]));
}
{
  start('DISC');
  const p2 = add('j_poke_porygon2');
  ok(!P_CENTERS.c_poke_upgrade.in_pool() && P_CENTERS.c_poke_dubious_disc.in_pool(), 'with Porygon2: Dubious Disc in pool, Up-Grade out');
  const cs = hand(['S_2', 'H_3', 'D_4', 'C_5']);
  ok(use(add('c_poke_dubious_disc')).ok && cs.every((c) => key(c) !== 'c_base' && P_CENTERS[key(c)].set === 'Enhanced') && p2.ability.extra.evolve === true, 'Dubious Disc: every held card enhanced, marks Porygon2', cs.map(key));
}
{
  start('ICE');
  const ee = add('j_poke_eevee');
  const cs = hand(['S_2', 'H_3']);
  const n0 = G.playing_cards.length;
  G.GAME.probabilities.normal = 4;
  ok(use(add('c_poke_icestone'), cs).ok && G.playing_cards.length === n0 - 2 && ee.ability.extra.evolve === 'icestone', 'Ice Stone: Glass, 1 in 4 (x4) shatters both, marks Eevee (Glaceon)', [G.playing_cards.length - n0, ee.ability.extra.evolve]);
  G.GAME.probabilities.normal = 1;
  const [c] = hand(['S_9']);
  ok(use(add('c_poke_icestone'), [c]).ok && key(c) === 'm_glass', 'Ice Stone: Glass card');
}
{
  start('SHINY');
  const tg = add('j_poke_togetic');
  const [c] = hand(['S_9'], { center: 'm_mult' });
  ok(use(add('c_poke_shinystone'), [c]).ok && c.edition && (c.edition.foil || c.edition.holo || c.edition.polychrome) && key(c) === 'c_base' && tg.ability.extra.evolve === true,
    'Shiny Stone: edition, enhancement removed, marks Togetic', [c.edition, key(c)]);
}
{
  start('SPOON');
  add('j_poke_charmander');
  const sp = add('c_poke_twisted_spoon');
  ok(!use(sp).ok, 'Twisted Spoon: nothing used yet');
  ok(use(add('c_poke_fire_energy')).ok && G.GAME.last_poke_item === 'c_poke_fire_energy', 'last Item/Energy remembered');
  ok(use(sp).ok && consKeys().includes('c_poke_fire_energy'), 'Twisted Spoon: creates the last one (Fire Energy)', consKeys());
  G.GAME.last_poke_item = 'c_poke_leftovers';
  ok(!add('c_poke_twisted_spoon').can_use_consumeable(), 'Twisted Spoon excludes the reusables');
}

// ---------------------------------------------- evolution items on pokejokers_01 Pokémon
{
  start('EVO01');
  const pk = add('j_poke_pikachu');
  const nd = add('j_poke_nidorina');
  ok(use(add('c_poke_moonstone'), null, [nd]).ok && nd.ability.extra.evolve === true && !pk.ability.extra.evolve, 'Moon Stone on the selected Nidorina (no cards selected)');
  ok(use(add('c_poke_thunderstone'), null, [pk]).ok && pk.ability.extra.evolve === true, 'Thunder Stone on the selected Pikachu');
  winRound();
  ok(key(pk) === 'j_poke_raichu' && key(nd) === 'j_poke_nidoqueen', 'both evolve at end of round', [key(pk), key(nd)]);
}

// ================================================================ mart3
{
  start('PRISM');
  const fb = add('j_poke_feebas');
  const cs = hand(['S_2', 'H_3', 'H_4', 'D_5', 'C_6', 'C_7']);
  ok(use(add('c_poke_prismscale'), [cs[0]]).ok, 'Prism Scale usable');
  ok(cs.filter((c) => c.base.suit === 'Spades').length === 5 && fb.ability.extra.evolve === true, 'Prism Scale: 4 other held cards take its suit, marks Feebas', cs.map((c) => c.base.suit));
}
{
  start('DUSK');
  const j1 = add('j_joker'); const j2 = add('j_joker');
  const dk = add('c_poke_duskstone');
  ok(dk.ability.extra.round_on_add === G.GAME.round, 'Dusk Stone remembers the round it arrived');
  j1.ability.extra_value = 3; j1.set_cost();
  const s1 = j1.sell_cost, d0 = G.GAME.dollars;
  ok(use(dk).ok && G.GAME.dollars === d0 + 4 && j1.sell_cost === s1 - 1, 'Dusk Stone: $4 per Drainable joker, drains $1', [G.GAME.dollars - d0, s1, j1.sell_cost]);
  const dk2 = add('c_poke_duskstone');
  G.GAME.round = dk2.ability.extra.round_on_add + 3;
  const d1 = G.GAME.dollars, s2 = j1.sell_cost;
  ok(use(dk2).ok && G.GAME.dollars === d1 + 8 && j1.sell_cost === s2, 'after 3 rounds: $4 per joker, no drain', G.GAME.dollars - d1);
  const mk = add('j_poke_murkrow');
  ok(use(add('c_poke_duskstone')).ok && mk.ability.extra.evolve === true, 'Dusk Stone marks Murkrow');
}
{
  start('DAWN');
  const dn = add('c_poke_dawnstone');
  ok(!use(dn).ok, 'Dawn Stone: nothing until a hand is played');
  play(hand(['S_4', 'H_4']));
  ok(dn.ability.extra.hand_played === 'Pair', 'Dawn Stone remembers the first hand (Pair)');
  G.GAME.hands.Pair.mult = 30;
  const d0 = G.GAME.dollars;
  ok(use(dn).ok && G.GAME.dollars === d0 + 40, 'Dawn Stone: 2x Mult capped at $40', G.GAME.dollars - d0);
}
{
  start('HARD');
  add('j_poke_diglett'); add('j_poke_sandshrew');
  const [c] = hand(['S_9']);
  ok(use(add('c_poke_hardstone'), [c]).ok && key(c) === 'm_stone' && c.ability.perma_bonus === 20, 'Hard Stone: Stone + 10 chips per Earth joker', c.ability.perma_bonus);
}
{
  start('HEART');
  const cs = hand(['S_2', 'C_K']);
  cs[1].set_ability(P_CENTERS.m_glass);
  ok(!P_CENTERS.c_poke_heartscale.in_pool(), 'Heart Scale never in a pool');
  ok(use(add('c_poke_heartscale'), cs).ok, 'Heart Scale on 2 cards');
  ok(cs.every((c) => c.base.value === 'King' && c.base.suit === 'Hearts' && key(c) === 'm_glass'), 'Heart Scale: left becomes the right card, both Hearts', cs.map((c) => [c.base.value, c.base.suit, key(c)]));
}

// ================================================================ martz (wishes)
{
  start('WISH');
  const ji = add('j_poke_jirachi');
  ok(use(add('c_poke_fake_banker')).ok && key(ji) === 'j_poke_jirachi_banker', 'Banker wish', key(ji));
  start('WISH2');
  const j2 = add('j_poke_jirachi');
  ok(use(add('c_poke_fake_copy')).ok && key(j2) === 'j_poke_jirachi_invis', 'Copy wish -> jirachi_invis', key(j2));
  start('WISH3');
  const j3 = add('j_poke_jirachi');
  ok(use(add('c_poke_fake_masterball')).ok && P_CENTERS[key(j3)].stage === 'Legendary' && key(j3) !== 'j_poke_jirachi', 'Master Ball wish: a random Legendary', key(j3));
  const nothing = add('c_poke_fake_power');
  ok(use(nothing).ok, 'a wish without Jirachi does nothing');
  ok(['fake_banker', 'fake_booster', 'fake_power', 'fake_negging', 'fake_copy', 'fake_fixer', 'fake_masterball'].every((n) => !P_CENTERS['c_poke_' + n].in_pool()), 'wishes never in a pool');
}

// ================================================================ zberryjuice
{
  start('JUICE');
  const ch = add('j_poke_charmander');
  ok(!add('c_poke_berry_juice').can_use_consumeable(), 'plain Berry Juice: no use');
  G.consumeables.cards.slice().forEach((c) => c.remove());
  ok(use(add('c_poke_berry_juice_energy')).ok && P.get_total_energy(ch) === 1 && G.GAME.modifiers.no_interest, 'Energy juice: Energize + no interest this round');
  const [c] = hand(['S_8']);
  ok(use(add('c_poke_berry_juice_spectral'), [c]).ok && c.edition && c.seal, 'Spectral juice: edition + seal', [c.edition, c.seal]);
  G.GAME.hands.Flush.level = 3; G.GAME.hands.Flush.visible = true;
  ok(use(add('c_poke_berry_juice_planet')).ok && G.GAME.hands.Flush.level === 4, 'Planet juice: highest-level hand +1', G.GAME.hands.Flush.level);
  G.consumeables.config.card_limit = 6;
  G.GAME.probabilities.normal = 2;
  ok(use(add('c_poke_berry_juice_item')).ok && consKeys().filter((k) => k === 'c_poke_twisted_spoon').length === 2, 'Item juice: 2 Twisted Spoons (1 in 2, x2)', consKeys());
  G.GAME.probabilities.normal = 1;
  G.consumeables.cards.slice().forEach((x) => x.remove());
  const d0 = G.GAME.dollars;
  ok(use(add('c_poke_berry_juice_tarot')).ok && consKeys().includes('c_fool') && G.GAME.dollars === d0 + 5, 'Tarot juice: The Fool + $5');
  G.consumeables.cards.slice().forEach((x) => x.remove());
  ok(use(add('c_poke_berry_juice_mystery')).ok && G.consumeables.cards.length === 1 && /^c_poke_berry_juice_(energy|spectral|planet|item|tarot)$/.test(consKeys()[0]), 'Mystery juice: a random flavour', consKeys());
}

// ================================================================ zmachine (Rotom)
{
  start('ROTOM');
  ok(!P_CENTERS.c_poke_oven.in_pool(), 'appliances only with a Rotom');
  const rt = add('j_poke_rotom');
  ok(P_CENTERS.c_poke_oven.in_pool(), '... in pool with one');
  const d0 = G.GAME.current_round.discards_left;
  ok(use(add('c_poke_oven')).ok && key(rt) === 'j_poke_rotomh' && G.GAME.current_round.discards_left === d0 + 1, 'Oven: Heat Rotom + 1 discard', key(rt));
  ok(!use(add('c_poke_oven'), null, [rt]).ok, 'Oven not on a Heat Rotom');
  G.consumeables.cards.slice().forEach((x) => x.remove());
  const h0 = G.GAME.current_round.hands_left;
  ok(use(add('c_poke_washing_machine')).ok && key(rt) === 'j_poke_rotomw' && G.GAME.current_round.hands_left === h0 + 1, 'Washing Machine: +1 hand');
  G.consumeables.config.card_limit = 4;
  ok(use(add('c_poke_fridge')).ok && key(rt) === 'j_poke_rotomf' && G.consumeables.cards.length === 2, 'Fridge: 2 random consumables', consKeys());
  G.consumeables.cards.slice().forEach((x) => x.remove());
  ok(use(add('c_poke_fan')).ok && key(rt) === 'j_poke_rotomfan' && G.jokers.cards.length === 3 && G.jokers.cards.slice(1).every((j) => j.config.center.rarity === 1), 'Fan: 2 Common jokers', G.jokers.cards.map(key));
  const hs = G.hand.config.card_limit, n = G.hand.cards.length;
  ok(use(add('c_poke_lawn_mower'), null, [rt]).ok && key(rt) === 'j_poke_rotomm' && G.hand.config.card_limit === hs + 1 && G.hand.cards.length > n, 'Lawn Mower: +1 hand size and draws', [G.hand.config.card_limit - hs, G.hand.cards.length - n]);
}

// ================================================================ packs
{
  start('WISHPACK');
  toShop();
  ok(buyPack('p_poke_pokepack_wish_pack').ok && G.STATE === STATES.MOD_PACK && G.GAME.pack_choices === 1, 'Wish Pack opens (choose 1)');
  // (Pokermon 3.9.1, batch 10b: 3 different wishes of 5 — no Master Ball; 3.2.1 showed all 6 in order)
  const WISH5 = ['c_poke_fake_banker', 'c_poke_fake_booster', 'c_poke_fake_power', 'c_poke_fake_copy', 'c_poke_fake_fixer'];
  ok(G.pack_cards.cards.length === 3 && new Set(G.pack_cards.cards.map(key)).size === 3 && G.pack_cards.cards.every((c) => WISH5.includes(key(c))), 'Wish Pack: 3 different wishes of the 5', G.pack_cards.cards.map(key));
  ok(!act({ type: 'reserve', id: G.pack_cards.cards[0].sort_id }).ok, 'wishes cannot be saved');
}
{
  start('STARTER');
  toShop();
  ok(buyPack('p_poke_pokepack_starter_pack').ok && G.STATE === STATES.MOD_PACK && G.pack_cards.cards.length === 4, 'Starter Pack opens with 4 jokers');
  const ps = G.pack_cards.cards.map((c) => c.config.center);
  ok(ps[0].starter && ps[0].ptype === 'Grass' && ps[1].starter && ps[1].ptype === 'Fire' && ps[2].starter && ps[2].ptype === 'Water' && ['pikachu', 'eevee'].includes(ps[3].name), 'Grass / Fire / Water starter + Pikachu-or-Eevee', ps.map((c) => c.key));
  ok(G.pack_cards.cards.every((c) => !c.edition), 'no editions in the Starter Pack');
  ok(act({ type: 'use', id: G.pack_cards.cards[0].sort_id }).ok && G.jokers.cards.length === 1 && G.STATE === STATES.SHOP, 'pick one: it joins the jokers');
}

// ================================================================ vouchers
function buyVoucher(k) {
  const v = new Card(P_CARDS.empty, P_CENTERS[k]);
  v.shop_voucher = true;
  G.shop_vouchers.emplace(v);
  G.GAME.dollars = 2000;
  return act({ type: 'buy', id: v.sort_id });
}
{
  start('VOUCH');
  toShop();
  ok(get_current_pool('Voucher')[0].includes('v_poke_energysearch') && !get_current_pool('Voucher')[0].includes('v_poke_energyresearch'), 'Energy Research requires Energy Search');
  ok(buyVoucher('v_poke_energysearch').ok && G.GAME.energy_plus === 2, 'Energy Search: +2 Energy limit', G.GAME.energy_plus);
  ok(buyVoucher('v_poke_energyresearch').ok && G.GAME.energy_plus === 5, 'Energy Research: +3 more', G.GAME.energy_plus);
  const ch = add('j_poke_charmander');
  for (let i = 0; i < 12; i++) P.energy_increase(ch, 'Fire');
  ok(P.get_total_energy(ch) === P.energy_max + 5, 'the limit rises by 5', P.get_total_energy(ch));
  ok(buyVoucher('v_poke_goodrod').ok && G.GAME.extra_pocket_picks === 1, 'Good Rod');
  ok(buyPack('p_poke_pokepack_normal_1').ok && G.pack_cards.cards.length === 5, 'Good Rod: Pocket Pack has 5 cards', G.pack_cards.cards.length);
  act({ type: 'skip_booster' });
  ok(!act({ type: 'reserve', id: (buyPack('p_arcana_normal_1'), G.pack_cards.cards[0].sort_id) }).ok, 'without Super Rod an Arcana card cannot be saved');
  act({ type: 'skip_booster' });
  ok(buyVoucher('v_poke_superrod').ok && G.GAME.poke_save_all === true, 'Super Rod');
  buyPack('p_arcana_normal_1');
  const t = G.pack_cards.cards[0];
  ok(act({ type: 'reserve', id: t.sort_id }).ok && t.area === G.consumeables, 'Super Rod: an Arcana card can be saved (the Save button)', t.area && t.area.name);
  start('UNLIM', { unlimited_energy: true }, { noBlind: true });
  ok(!P_CENTERS.v_poke_energysearch.in_pool() && P_CENTERS.v_poke_goodrod.in_pool === undefined, 'unlimited_energy: no Energy vouchers');
}

// ================================================================ decks
const deckRun = (back, seed, opts = {}) => { newRun({ seed, back, mods: ['pokermon'], modOptions: { pokermon: opts } }); };
{
  deckRun('b_poke_pokemondeck', 'D1');
  ok(G.GAME.used_vouchers.v_poke_goodrod && G.GAME.extra_pocket_picks === 1 && consKeys().join() === 'c_poke_pokeball', 'Trainer Deck: Good Rod + a Poké Ball', consKeys());
  ok(P_CENTERS.b_poke_pokemondeck.poke_option === 'pokeballs' && P_CENTERS.b_poke_obituarydeck.poke_option === 'pokemon_legacy', 'option-gated decks are flagged');
  deckRun('b_poke_luminousdeck', 'D2');
  ok(G.GAME.modifiers.apply_type, 'Luminous: apply_type');
  const j = create_card('Joker', G.jokers, null, null, null, null, 'j_poke_charmander');
  ok(P.type_sticker_applied(j), 'Luminous: created jokers get a Tera type', P.type_sticker_applied(j));
  deckRun('b_poke_obituarydeck', 'D3', { pokemon_legacy: true });
  ok(G.playing_cards.length === 52 && G.playing_cards.every((c) => c.seal === 'poke_pink_seal'), 'Obituary: every card has a Pink Seal');
  deckRun('b_poke_revenantdeck', 'D4', { pokemon_legacy: true });
  ok(G.playing_cards.every((c) => c.seal === 'poke_silver') && P_CENTERS.b_poke_revenantdeck.name === 'revenantdeck', 'Revenant: every card has a Silver Seal');
  deckRun('b_poke_telekineticdeck', 'D5');
  ok(G.GAME.used_vouchers.v_crystal_ball && G.consumeables.config.card_limit === 3 && consKeys().join() === 'c_poke_twisted_spoon,c_poke_twisted_spoon', 'Telekinetic: Crystal Ball + 2 Twisted Spoons', consKeys());
  deckRun('b_poke_ampeddeck', 'D6');
  ok(G.GAME.energy_plus === 2 && consKeys().join() === 'c_poke_double_rainbow_energy', 'Amped: Energy Search + Double Rainbow Energy', [G.GAME.energy_plus, consKeys()]);
  deckRun('b_poke_futuredeck', 'D7');
  ok(G.GAME.scry_amount === 4, 'Future: +4 Foresight (scry)', G.GAME.scry_amount);
  deckRun('b_poke_stadiumdeck', 'D8');
  const enh = G.playing_cards.filter((c) => key(c) !== 'c_base').map(key).sort();
  ok(G.playing_cards.length === 60 && G.GAME.starting_deck_size === 60 && enh.join() === 'm_bonus,m_glass,m_gold,m_lucky,m_mult,m_steel,m_stone,m_wild', 'Stadium: +8 enhanced cards (one of each)', [G.playing_cards.length, enh]);
  ok(G.deck.cards.length === 60, 'the 8 are in the deck');
  deckRun('b_poke_megadeck', 'D9');
  ok(G.GAME.used_vouchers.v_reroll_surplus && G.GAME.used_vouchers.v_reroll_glut && consKeys().join() === 'c_poke_megastone' && G.GAME.shop.joker_max === 1, 'Mega: Reroll vouchers + Megastone + 1 shop slot', [consKeys(), G.GAME.shop.joker_max]);
  ok(G.GAME.round_resets.reroll_cost === 1, 'Mega: rerolls cost $1', G.GAME.round_resets.reroll_cost);
}
{
  deckRun('b_poke_vendingdeck', 'D10');
  G.FORCE_BOSS = 'bl_wall'; G.GAME.round_resets.blind_choices.Boss = 'bl_wall';
  for (let i = 0; i < 2; i++) { act({ type: 'select_blind' }); clearHand(); nextRound(); clearHand(); }
  // now in the ante-1 boss
  ok(G.GAME.blind.boss, 'reached the boss');
  const tags0 = G.GAME.tags.length;
  winRound();
  ok(G.GAME.tags.length === tags0 + 1 && G.GAME.tags[G.GAME.tags.length - 1].key === 'tag_voucher', 'Vending: a Voucher Tag after the odd (ante 1) boss', G.GAME.tags.map((t) => t.key));
}

// ================================================================ tags
{
  start('TAGS', {}, { noBlind: true });
  const pt = new Tag('tag_poke_pocket_tag'); add_tag(pt);
  ok(pt.apply_to_run({ type: 'new_blind_choice' }) === true, 'Pocket Tag fires on new_blind_choice');
  pump();
  ok(G.STATE === STATES.MOD_PACK_HAND && /^p_poke_pokepack_mega_[12]$/.test(G.GAME.pack_center) && G.pack_cards.cards.length === 6 && G.GAME.pack_choices === 2, 'Pocket Tag: a free Mega Pocket Pack', [G.GAME.pack_center, G.pack_cards.cards.length]);
  ok(!G.GAME.tags.includes(pt), 'the tag is used up');
  act({ type: 'skip_booster' });
}
{
  start('TAGS2');
  toShop();
  const st = new Tag('tag_poke_shiny_tag'); add_tag(st);
  const jk = G.shop_jokers.cards.find((c) => c.ability.set === 'Joker') || (() => { const c = create_card('Joker', G.shop_jokers, null, null, null, null, 'j_poke_caterpie'); G.shop_jokers.emplace(c); return c; })();
  jk.set_edition(null, true, true);
  st.apply_to_run({ type: 'store_joker_modify', card: jk });
  G.E_MANAGER.flush();
  ok(jk.edition && jk.edition.poke_shiny && jk.cost === 0, 'Shiny Tag: a Shiny, free shop joker', [jk.edition, jk.cost]);
  const s1 = new Tag('tag_poke_stage_one_tag'); add_tag(s1);
  const c1 = s1.apply_to_run({ type: 'store_joker_create', area: G.shop_jokers });
  G.shop_jokers.emplace(c1);
  G.E_MANAGER.flush();
  ok(c1 && c1.config.center.stage === 'One' && c1.cost === 0, 'Stage One Tag: a free Stage 1 Pokémon', c1 && key(c1));
  const sf = new Tag('tag_poke_safari_tag'); add_tag(sf);
  const c2 = sf.apply_to_run({ type: 'store_joker_create', area: G.shop_jokers });
  G.shop_jokers.emplace(c2);
  G.E_MANAGER.flush();
  ok(c2 && c2.config.center.rarity === 'poke_safari' && c2.cost === 0, 'Safari Tag: a free Safari Pokémon', c2 && key(c2));
  ok(P_TAGS.tag_poke_stage_one_tag.min_ante === 2 && P_TAGS.tag_poke_safari_tag.min_ante === 3 && P_TAGS.tag_poke_shiny_tag.min_ante === 3, 'min antes');
}
{
  start('JTAG', {}, { noBlind: true });
  const jt = new Tag('tag_poke_jirachi_tag'); add_tag(jt);
  ok(!P_TAGS.tag_poke_jirachi_tag.in_pool(), 'Jirachi Tag never in a pool');
  jt.apply_to_run({ type: 'new_blind_choice' });
  G.E_MANAGER.flush();
  ok(!G.GAME.tags.includes(jt) && G.STATE === STATES.BLIND_SELECT, 'Jirachi Tag without Jirachi: just removed');
  add('j_poke_jirachi');
  const jt2 = new Tag('tag_poke_jirachi_tag'); add_tag(jt2);
  ok(jt2.apply_to_run({ type: 'new_blind_choice' }) === true, 'Jirachi Tag fires');
  pump();
  ok(G.GAME.pack_center === 'p_poke_pokepack_wish_pack' && G.pack_cards.cards.length === 3 && !G.GAME.tags.includes(jt2), 'with Jirachi: the Wish Pack opens (3 wishes)', G.GAME.pack_center);
  const FORM = { c_poke_fake_banker: 'j_poke_jirachi_banker', c_poke_fake_booster: 'j_poke_jirachi_booster', c_poke_fake_power: 'j_poke_jirachi_power', c_poke_fake_copy: 'j_poke_jirachi_invis', c_poke_fake_fixer: 'j_poke_jirachi_fixer' };
  const picked = key(G.pack_cards.cards[0]);
  ok(act({ type: 'use', id: G.pack_cards.cards[0].sort_id }).ok && key(G.jokers.cards[0]) === FORM[picked], 'pick a wish: Jirachi transforms', [picked, key(G.jokers.cards[0])]);
}
{
  start('STAG', {}, { noBlind: true });
  ok(P_TAGS.tag_poke_starter_tag.in_pool() === true, 'Starter Tag in the pool (intended-design fix: Lua returned nil)');
  ok(get_current_pool('Tag')[0].includes('tag_poke_starter_tag') === false, 'but only from ante 2 (min_ante)');
  G.GAME.round_resets.ante = 2;
  ok(get_current_pool('Tag')[0].includes('tag_poke_starter_tag'), 'ante 2: Starter Tag can appear');
  const t = new Tag('tag_poke_starter_tag'); add_tag(t);
  t.apply_to_run({ type: 'new_blind_choice' });
  pump();
  ok(G.GAME.pack_center === 'p_poke_pokepack_starter_pack' && G.pack_cards.cards.length === 4, 'Starter Tag: a free Starter Pack', G.GAME.pack_center);
}

// ================================================================ the Chartreuse Chamber boss (bl_poke_cgoose; Pokermon 3.9.1: Iridescent Hacker, bl_poke_iridescent_hacker)
{
  start('GOOSE', {}, { noBlind: true });
  const gb = P_BLINDS.bl_poke_iridescent_hacker;
  ok(gb.boss.showdown && gb.mult === 2 && gb.dollars === 8, 'Iridescent Hacker (was Chartreuse Chamber): showdown boss, x2, $8');
  G.FORCE_BOSS = undefined;
  G.GAME.round_resets.ante = 8;
  for (const k of Object.keys(G.GAME.bosses_used)) G.GAME.bosses_used[k] = k === 'bl_poke_iridescent_hacker' ? 0 : 99;
  ok(get_new_boss() === 'bl_poke_iridescent_hacker', 'eligible at ante 8');
  G.GAME.round_resets.ante = 1;
  const ts = new Set();
  for (let i = 0; i < 40; i++) { const t = determine_type(); ok(t.length >= 1 && t.length <= 3 && t.every((x) => P.POKETYPES.includes(x)), 'determine_type: 1-3 types', t); t.forEach((x) => ts.add(x)); }
  ok(ts.size > 3, 'types vary');
  // Fight it.
  G.FORCE_BOSS = 'bl_poke_iridescent_hacker';
  G.GAME.round_resets.blind_choices.Boss = 'bl_poke_iridescent_hacker';
  const ch = add('j_poke_charmander');
  const sq = add('j_poke_squirtle');
  const jk = add('j_joker');
  P.apply_type_sticker(jk, 'Grass');
  act({ type: 'select_blind' }); clearHand(); nextRound(); clearHand(); nextRound();
  ok(G.GAME.blind.config.blind.key === 'bl_poke_iridescent_hacker' && Array.isArray(G.GAME.blind.poke_ptypes), 'goose fight: types picked at set_blind', G.GAME.blind.poke_ptypes);
  const pt = () => G.GAME.blind.poke_ptypes;
  const want = (c) => pt().includes(c === jk ? 'Grass' : c.ability.extra.ptype);
  ok([ch, sq, jk].every((c) => !!c.debuff === want(c)), 'first draw: jokers of the goose types are debuffed', [pt(), ch.debuff, sq.debuff, jk.debuff]);
  for (let i = 0; i < 4; i++) {
    const before = pt();
    play(hand(['S_2']));
    ok(pt() !== before && [ch, sq, jk].every((c) => !!c.debuff === want(c)), 'after each hand: new types, debuffs follow', [pt(), ch.debuff, sq.debuff, jk.debuff]);
  }
  G.GAME.blind.disable();
  G.E_MANAGER.flush();
  ok([ch, sq, jk].every((c) => !c.debuff), 'disabled: every joker restored');
}

// ================================================================ enhancements
{
  start('HAZARD');
  const [hz] = hand(['S_A'], { center: 'm_poke_hazard' });
  const pair = hand(['H_7', 'D_7']);
  ok(hz.get_id() < 0 && !hz.is_suit('Spades') && hz.get_chip_bonus() === 0 && !P_CENTERS.m_poke_hazard.in_pool(), 'Hazard: no rank, no suit, no chips, never in a pool');
  const r = play([...pair, hz]);
  const sh = r.events.find((e) => e.type === 'scoring_hand');
  ok(sh && sh.cards.includes(hz.sort_id) && r.total.chips === 10 + 14, 'Hazard always scores (in the scoring hand, adds no chips)', [sh && sh.cards.length, r.total]);
  clearHand();
  const hzs = hand(['S_2', 'S_3', 'S_4'], { center: 'm_poke_hazard' });
  G.GAME.probabilities.normal = 3;
  winRound(hand(['H_9']));
  ok(hzs.every((c) => !G.playing_cards.includes(c)), 'Hazards held at end of round: 1 in 3 (x3) destroyed (Pokermon 3.9.1)');
  G.GAME.probabilities.normal = 1;
}
{
  start('FLOWER');
  const [fl] = hand(['H_2'], { center: 'm_poke_flower' });
  const others = hand(['S_3', 'D_4', 'C_5', 'S_6']);
  const r = play([fl, ...others]);
  ok(r.total.mult === 4 * 2 && r.events.some((e) => e.type === 'status' && e.card === fl.sort_id && e.eval_type === 'x_mult' && e.amt === 2), 'Flower: X2 Mult with 4 suits (Straight) (Pokermon 3.9.1)', r.total);
  clearHand();
  const [fl2] = hand(['H_2'], { center: 'm_poke_flower' });
  const r2 = play([fl2, ...hand(['H_3', 'D_4', 'C_5', 'H_6'])]);
  ok(r2.total.mult === 4, 'Flower: nothing with 3 suits', r2.total);
  ok(!P_CENTERS.m_poke_flower.in_pool(), 'Flower never in a pool');
}

// ================================================================ seals
{
  start('PINK');
  add('j_poke_charmander');
  const [c] = hand(['S_K']);
  c.set_seal('poke_pink_seal', true);
  const r = play([c]);
  ok(consKeys().join() === 'c_poke_fire_energy' && statusMsgs(r.events).includes(P.localize('poke_plus_energy')), 'Pink Seal (first hand): an Energy matching a joker', consKeys());
  clearHand();
  const [d] = hand(['S_Q']); d.set_seal('poke_pink_seal', true);
  play([d]);
  ok(G.consumeables.cards.length === 1, 'Pink Seal: only on the first hand');
}
{
  start('PINK2');
  const [c] = hand(['S_K']); c.set_seal('poke_pink_seal', true);
  play([c]);
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Energy', 'Pink Seal without Pokémon: a random Energy', consKeys());
}
{
  start('SILVER');
  const ramen = add('j_ramen');
  const [s] = hand(['D_9']); s.set_seal('poke_silver', true);
  const played = hand(['S_2']);
  const disc0 = G.GAME.round_scores.cards_discarded.amt;
  play(played);
  ok(G.consumeables.cards.length === 1 && G.consumeables.cards[0].ability.set === 'Item', 'Silver Seal held: creates an Item', consKeys());
  ok(s.area === G.discard && G.GAME.round_scores.cards_discarded.amt === disc0 + 1, 'Silver Seal: the card is discarded', s.area && s.area.name);
  ok(Math.abs(ramen.ability.x_mult - 1.99) < 1e-9, 'jokers see the discard (Ramen -0.01)', ramen.ability.x_mult);
  ok(s.ability.discarded && !G.hand.cards.includes(s), 'only once');
}

done();
