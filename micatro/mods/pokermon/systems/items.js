/**
 * Items, Megas and held items — native rebuild of the item half of Pokermon's
 * functions/pokefunctions.lua (evo_item_use, highlighted_evo_item, is_evo_item_for,
 * evo_item_use_total, generate_pickup_item_key, create_holding_item,
 * poke_create_treasure) and the Megastone rules (consumables/mart1.lua megastone):
 *
 *   - An evolution item marks ONE joker that needs it (the highlighted joker first,
 *     else the leftmost) with ability.extra.evolve; the joker evolves at end of round
 *     through item_evo().
 *   - Megastone (Spectral, keep_on_use): mega-evolves a joker that has `megas`, or
 *     reverts a mega to its base form; once per round (usable resets at end of round);
 *     remembers `used_on` so only one mega exists per stone; selling/losing the stone
 *     devolves its mega. Charizard/Mewtwo pick X/Y by position (getMega).
 *   - Held items (Leftovers, Leek, ...) are keep_on_use consumables: the engine's
 *     keep_on_use seam keeps them in the consumable slots after use.
 */
import { G, P_CENTERS, card_eval_status_text, localize, pseudorandom, pseudoseed, pseudorandom_element, create_card } from '../../../js/engine/core.js';
import { juice_card_until } from '../../../js/engine/jokers.js';
import { find_card, any, add_card } from './utils.js';
import { poke_evolve, get_previous_evo } from './evolution.js';
import { ease_poke_dollars } from './energy.js';

const isTable = (x) => x !== null && typeof x === 'object';

/** Does item `self` evolve joker `card` (and it isn't already marked)? */
export function is_evo_item_for(self, card) {
  if (!card.ability || !isTable(card.ability.extra) || card.ability.extra.evolve) return false;
  const req = card.ability.extra.item_req;
  if (Array.isArray(req)) { for (const item of req) if (item === self.name) return true; }
  return req === self.name;
}

function mark(v, evolve) {
  v.ability.extra.evolve = evolve;
  juice_card_until(v, (c) => c.ability.extra.evolve, true);
}

/** Mark the first joker (left to right) this item evolves. -> true / the item name / false. */
export function evo_item_use(self, card, area, copier) {
  let applied = false, evolve = false;
  for (const v of G.jokers.cards) {
    if (applied) break;
    const ex = v.ability && v.ability.extra;
    if (!isTable(ex) || ex.evolve) continue;
    if (!Array.isArray(ex.item_req) && ex.item_req === self.name) evolve = true;
    else if (Array.isArray(ex.item_req)) for (const p of ex.item_req) if (p === self.name) evolve = p;
    if (evolve) { mark(v, evolve); applied = true; }
  }
  return evolve;
}

export function highlighted_evo_item(self, card, area, copier) {
  let evolve = false;
  if (!G.jokers.highlighted || G.jokers.highlighted.length !== 1) return false;
  const choice = G.jokers.highlighted[0];
  const ex = choice.ability && choice.ability.extra;
  if (isTable(ex) && !ex.evolve) {
    if (!Array.isArray(ex.item_req) && ex.item_req === self.name) evolve = true;
    else if (Array.isArray(ex.item_req)) for (const p of ex.item_req) if (p === self.name) evolve = p;
  }
  if (evolve) mark(choice, evolve);
  return evolve;
}

export function evo_item_use_total(self, card, area, copier) {
  let evolve;
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1) evolve = highlighted_evo_item(self, card, area, copier);
  if (!evolve) evolve = evo_item_use(self, card, area, copier);
  return evolve;
}

// ------------------------------------------------------------- held items
/** Pickup-style reward: nothing 34%, an evolution item someone needs 25%, Leftovers 20%, Twisted Spoon 20%, Transformation 1%. */
export function generate_pickup_item_key(seed) {
  let item_key = 'c_poke_transformation';
  const chance = pseudorandom(seed);
  if (chance < 0.34) item_key = undefined;
  else if (chance < 0.59) item_key = 'evo';
  else if (chance < 0.79) item_key = 'c_poke_leftovers';
  else if (chance < 0.99) item_key = 'c_poke_twisted_spoon';
  if (item_key === 'evo') {
    const keys = [];
    for (const v of G.jokers.cards) {
      const req = v.config.center.item_req;
      if (req) keys.push('c_poke_' + (Array.isArray(req) ? pseudorandom_element(req, pseudoseed(seed))[0] : req));
    }
    item_key = keys.length ? pseudorandom_element(keys, pseudoseed(seed))[0] : undefined;
  }
  return item_key;
}

export function create_holding_item(key, edition, has_evolved) {
  if ((G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit || (edition && edition.negative)) && !has_evolved) {
    const _card = create_card('Item', G.consumeables, null, null, null, null, key);
    if (edition) _card.set_edition(edition, true);
    _card.add_to_deck();
    G.consumeables.emplace(_card);
    card_eval_status_text(_card, 'extra', null, null, null, { message: localize('poke_plus_pokeitem'), colour: 'item' });
  }
}

/** Drilbur-line treasure: money, evolution stones, or (rarely) a Megastone. */
export function poke_create_treasure(card, seed, megastone) {
  const treasure = pseudorandom(pseudoseed(seed));
  let money = 0, stone_max = 0, mega = false;
  if (treasure > 0.70) stone_max = 1;
  else if (treasure > 0.40) money = 5;
  else if (treasure > 0.20) stone_max = 2;
  else if (treasure > 0.05) money = 10;
  else if ((megastone && treasure > 0.01) || !megastone) money = 20;
  else mega = true;
  if (money > 0) ease_poke_dollars(card, seed, money);
  for (let i = 1; i <= stone_max; i++) {
    if (G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
      G.E_MANAGER.add_event(() => {
        const stones = ['moonstone', 'sunstone', 'waterstone', 'leafstone', 'firestone', 'thunderstone', 'shinystone', 'dawnstone', 'duskstone'];
        const avail = stones.filter((s) => !any(find_card('c_poke_' + s)));
        let stone_key = pseudorandom_element(avail, pseudoseed('evostone_drill'))[0];
        if (stone_key) stone_key = 'c_poke_' + stone_key;
        add_card({ set: 'Item', key: stone_key });
        G.GAME.consumeable_buffer = 0;
      });
    }
  }
  if (mega && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit) {
    G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
    G.E_MANAGER.add_event(() => { add_card({ set: 'Spectral', key: 'c_poke_megastone' }); G.GAME.consumeable_buffer = 0; });
  }
}

// ---------------------------------------------------------------- megas
/** A joker the Megastone may target (has megas, or is a mega), skipping debuffed would-be megas. */
const megaTarget = (poke) => (poke.config.center.megas || poke.config.center.rarity === 'poke_mega') && !(poke.debuff && poke.config.center.megas);

export function megastone_target() {
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1 && megaTarget(G.jokers.highlighted[0])) return G.jokers.highlighted[0];
  for (const poke of G.jokers.cards) if (megaTarget(poke)) return poke;
  return undefined;
}

/** Which mega a joker becomes (getMega: Charizard X leftmost / Y rightmost / random in between). */
export function mega_for(target) {
  const c = target.config.center;
  let mega = c.megas[0];
  if (c.megas.length > 1) {
    if (c.getMega) mega = c.getMega(c, target);
    else mega = pseudorandom_element(c.megas, pseudoseed('megastone_' + c.name))[0];
  }
  return 'j_' + (c.poke_custom_prefix || 'poke') + '_' + mega;
}

/** Leftmost = first mega, rightmost = second, middle = random (Charizard / Mewtwo). */
export function getMega_by_position(self, card) {
  let mega;
  G.jokers.cards.forEach((v, i) => {
    if (card === v && i === 0) mega = self.megas[0];
    else if (card === v && i === G.jokers.cards.length - 1 && mega === undefined) mega = self.megas[1];
  });
  if (!mega) mega = pseudorandom_element(self.megas, pseudoseed('megastone_' + self.name))[0];
  return mega;
}

/** Megastone.use: mega-evolve (or revert) the target. */
export function megastone_use(stone) {
  const target = megastone_target();
  if (!target) return;
  let forced_key;
  if (target.config.center.megas) {
    forced_key = mega_for(target);
    stone.ability.extra.used_on = forced_key;
  } else {
    forced_key = get_previous_evo(target, true);
    stone.ability.extra.used_on = undefined;
  }
  stone.ability.extra.usable = false;
  poke_evolve(target, forced_key);
}

export function megastone_can_use(stone) {
  const PACK = [G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.PLANET_PACK, G.STATES.STANDARD_PACK];
  if (PACK.includes(G.STATE) && G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit && stone.area === G.pack_cards) return false;
  if (stone.area === G.shop_jokers) return false;
  if (!(G.jokers && G.jokers.cards) || G.jokers.cards.length === 0) return false;
  if (!stone.ability.extra.usable) return false;
  const target = megastone_target();
  if (!target) return false;
  if (stone.ability.extra.used_on && target.config.center.key !== stone.ability.extra.used_on && any(find_card(stone.ability.extra.used_on))) return false;
  return true;
}

/** Losing the Megastone devolves the mega it made. */
export function megastone_remove_from_deck(stone) {
  const used_on = stone.ability.extra.used_on;
  if (used_on && any(find_card(used_on))) {
    for (const v of G.jokers.cards) {
      if (v.config.center.key === used_on) { poke_evolve(v, get_previous_evo(v, true)); break; }
    }
  }
}

export function megastone_in_pool() {
  if (G.jokers && G.jokers.cards) for (const poke of G.jokers.cards) if (poke.config.center.megas) return true;
  return false;
}

