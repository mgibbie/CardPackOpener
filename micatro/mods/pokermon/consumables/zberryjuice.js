// Pokermon 3.2.1 — consumables/zberryjuice.lua: Berry Juice and its 6 flavours (Shuckle's
// gifts). None is ever in a pool; the plain Berry Juice is a display card with no use.
import {
  G, P_CENTERS, localize, play_sound, ease_dollars, level_up_hand, update_hand_text, card_eval_status_text,
  create_card, poll_edition, pseudorandom, pseudoseed, pseudorandom_element,
  defineConsumables, cfg, energy_max, energy_increase, type_sticker_applied, poke_convert_cards_to, can_increase_energy, energy_values,
  pseudorandom_probability, get_probability_vars, poke_evolve, mega_for, mega_juice_target,
} from '../api.js';
import { get_current_pool, P_SEALS } from '../../../js/engine/core.js';
import { HANDLIST } from '../../../js/engine/run.js';

const FILE = 'consumables/zberryjuice.lua';

/** pokermon.juice_list (set -> juice key), in the Lua's insertion order. */
export const juice_list = {
  Energy: 'c_poke_berry_juice_energy', Spectral: 'c_poke_berry_juice_spectral', Planet: 'c_poke_berry_juice_planet',
  Item: 'c_poke_berry_juice_item', Tarot: 'c_poke_berry_juice_tarot',
};

const has_room = () => G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit;

/** SMODS.poll_seal({guaranteed, key, mod, type_key, options}) — weighted seal roll (4% base rate). */
function poll_seal(args = {}) {
  let key = args.key || 'stdseal';
  const mod = args.mod || 1;
  const options = args.options || get_current_pool('Seal')[0];
  const type_key = args.type_key || key + 'type' + G.GAME.round_resets.ante;
  key = key + G.GAME.round_resets.ante;
  const avail = [];
  let total_weight = 0;
  for (const v of options) {
    if (v === 'UNAVAILABLE') continue;
    const o = typeof v === 'string' ? { key: v, weight: P_SEALS[v].weight ?? 5 } : { key: v.key, weight: v.weight };
    if (o.weight > 0) { avail.push(o); total_weight += o.weight; }
  }
  total_weight = total_weight + (total_weight / 4 * 96);
  let type_weight = 0;
  for (const v of avail) type_weight += v.weight;
  const seal_poll = pseudorandom(pseudoseed(key));
  if (seal_poll > 1 - (type_weight * mod / total_weight) || args.guaranteed) {
    const seal_type_poll = pseudorandom(pseudoseed(type_key));
    let weight_i = 0;
    for (const v of avail) {
      weight_i += v.weight;
      if (seal_type_poll > 1 - (weight_i / type_weight)) return v.key;
    }
  }
  return undefined;
}

const juice = (def) => ({ in_pool() { return false; }, ...def });

/**
 * OWNER HOUSE RULE (not the Lua): Berry Juice Energy targets like every other Energy card —
 * the picked joker if it can take it (a picked one that can't refuses the card), else the
 * LEFTMOST joker that can take it, skipping non-Pokémon and capped ones; none -> refused.
 * The Lua (zberryjuice.lua) takes the plain leftmost joker and only checks it is a Pokémon,
 * so a capped or non-Pokémon leftmost joker wasted it or blocked it.
 * "Can take it" = a Pokémon (ptype) energize() can grow (a stage or a Tera sticker, a field in
 * energy_values) that is under its Energy limit.
 */
const ENERGY_FIELDS = Object.keys(energy_values);
function juice_energy_ok(c) {
  const ex = c && c.ability && c.ability.extra;
  if (!ex || typeof ex !== 'object' || !ex.ptype) return false;
  if (!((c.config && c.config.center.stage) || type_sticker_applied(c))) return false;
  if (!ENERGY_FIELDS.some((f) => typeof ex[f] === 'number')) return false;
  return can_increase_energy(c);
}
function juice_energy_target() {
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1) return juice_energy_ok(G.jokers.highlighted[0]) ? G.jokers.highlighted[0] : undefined;
  return (G.jokers.cards || []).find(juice_energy_ok);
}

defineConsumables({
  berry_juice: juice({ loc_vars() {} }),

  // Energy: Energize the selected / leftmost valid Pokémon (owner house rule above; and lose interest
  // this round, like Double Rainbow).
  berry_juice_energy: juice({
    loc_vars(self, info_queue) {
      info_queue.push({ set: 'Other', key: 'energize' });
      return { vars: [cfg('unlimited_energy') ? localize('poke_unlimited_energy') : energy_max + (G.GAME.energy_plus || 0)] };
    },
    can_use() { return !!juice_energy_target(); },
    use() {
      const choice = juice_energy_target();
      if (!choice) return;
      play_sound('poke_energy_use', 1, 0.5);
      if (choice.config && choice.config.center.stage && !type_sticker_applied(choice)) energy_increase(choice, choice.ability.extra.ptype);
      else if (type_sticker_applied(choice)) energy_increase(choice, type_sticker_applied(choice));
      if (!G.GAME.modifiers.no_interest) {
        G.GAME.modifiers.reset_no_interest = true;
        G.GAME.modifiers.no_interest = true;
      }
    },
  }),

  // Spectral: 1 selected card gets a random Foil/Holo/Polychrome edition and a random seal.
  // (No can_use in the Lua: the vanilla max_highlighted = 1 rule applies.)
  berry_juice_spectral: juice({
    loc_vars(self, info_queue) {
      info_queue.push(P_CENTERS.e_foil); info_queue.push(P_CENTERS.e_holo); info_queue.push(P_CENTERS.e_polychrome);
      return { vars: [self.config.max_highlighted] };
    },
    use() {
      const target = G.hand.highlighted[0];
      const args = { edition: poll_edition('aura', null, true, true), seal: poll_seal({ guaranteed: true }) };
      poke_convert_cards_to(target, args, null, true);
    },
  }),

  // Planet: level up your highest-level poker hand.
  berry_juice_planet: juice({
    loc_vars() {},
    can_use() { return true; },
    use(self, card) {
      // Lua: table.sort(visible hands, level desc) over pairs() — unordered, unstable. Ties go to
      // the first in Balatro's hand order here (deterministic).
      let upgrade_handname;
      for (const k of HANDLIST) {
        const v = G.GAME.hands[k];
        if (v.visible && (upgrade_handname === undefined || v.level > G.GAME.hands[upgrade_handname].level)) upgrade_handname = k;
      }
      const h = G.GAME.hands[upgrade_handname];
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') });
      update_hand_text({ sound: 'button', volume: 0.7, pitch: 0.8, delay: 0.3 }, { handname: localize(upgrade_handname, 'poker_hands'), chips: h.chips, mult: h.mult, level: h.level });
      level_up_hand(card, upgrade_handname);
      update_hand_text({ sound: 'button', volume: 0.7, pitch: 1.1, delay: 0 }, { mult: 0, chips: 0, handname: '', level: '' });
    },
  }),

  // Item: create a Twisted Spoon (1 in 2: two).
  berry_juice_item: juice({
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Item', key: 'c_poke_twisted_spoon', poke_add_desc: true });
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'berry_juice_item');
      return { vars: [num, dem] };
    },
    can_use() { return true; },
    use(self, card) {
      let max = 1;
      if (pseudorandom_probability(card, 'berry_juice_item', self.config.num, self.config.dem, 'berry_juice_item')) max = max + 1;
      for (let i = 1; i <= max; i++) {
        if (has_room()) {
          const _card = create_card('Item', G.consumeables, null, null, null, null, 'c_poke_twisted_spoon');
          _card.add_to_deck();
          G.consumeables.emplace(_card);
        }
      }
    },
  }),

  // Tarot: create The Fool and earn $5.
  berry_juice_tarot: juice({
    loc_vars(self, info_queue) { info_queue.push({ set: 'Tarot', key: 'c_fool' }); return { vars: [self.config.money] }; },
    can_use() { return true; },
    use(self) {
      if (has_room()) {
        const _card = create_card('Tarot', G.consumeables, null, null, null, null, 'c_fool');
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
      ease_dollars(self.config.money);
    },
  }),

  // Mystery: create a random flavoured Berry Juice.
  berry_juice_mystery: juice({
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS.c_poke_berry_juice); },
    can_use() { return true; },
    use() {
      if (has_room()) {
        const key = pseudorandom_element(Object.values(juice_list), pseudoseed('berry'))[0];
        const _card = create_card('Item', G.consumeables, null, null, null, null, key);
        _card.add_to_deck();
        G.consumeables.emplace(_card);
      }
    },
  }),
}, FILE);

// Mega Berry Juice (Pokermon 3.9.1 consumables/06_mart_berry.lua; batch 16): what Shuckle squeezes out of a Mega Stone.
// Mega Evolves the selected (else the leftmost) joker that has a Mega, for good: no Mega Stone remembers it. Never in a pool.
// 3.2.1's data.js has no such card, so the definition carries its whole static data (index.js builds it after data.js's).
// (The Lua's can_use calls get_mega, which rolls the X / Y seed for a middle Charizard / Mewtwo / Raichu: ours only checks
// that a target exists, so the seed is rolled once, on use.)
defineConsumables({
  berry_juice_mega: juice({
    key: 'berry_juice_mega',
    name: 'berry_juice_mega',
    set: 'Item',
    artist: ['Sonfive', 'Emma'],
    berry_juice: true,
    poke_multi_item: true,
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 7, y: 7 },
    cost: 12,
    config: {},
    unlocked: true,
    discovered: true,
    no_collection: true,
    loc_vars() { return { vars: [] }; },
    can_use() { return !!(G.jokers && G.jokers.cards.length > 0 && mega_juice_target()); },
    use() {
      const target = mega_juice_target();
      if (target) poke_evolve(target, mega_for(target));
    },
  }),
}, 'consumables/06_mart_berry.lua');
