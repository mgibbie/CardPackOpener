// The owner's Paradox content (Gen 9 batch 3, contentRev 78; "paradox, ancient and future need to be tags like safari. i want a pokeball
// card that gives you a paradox pokemon and an ancient pack type and a future pack type for paradox pokemon as well", 2026-11-03).
// Micatro's own (Pokermon 3.9.1 has none of it): the 20 Paradox jokers are in jokers/pokejokers_designs.js (rarity 'poke_paradox' — index.js
// registers it like Safari: weight 0, so never a shop roll — and an era, `poke_paradox` 'ancient' | 'future', its second pill). This file:
//   - the Paradox Ball (an Item, $4 like the Ultra Ball, pool weight 3 like the Great Ball, needs a Joker slot): a random Paradox joker of
//     either era (seeded, 'paradoxball'; the Poké Balls' pool rules: none you hold, unless Showman);
//   - the Ancient Pack and the Future Pack, each Normal ($4, choose 1 of 2; two art variants) / Jumbo ($6, 1 of 4) / Mega ($8, 2 of 4) like the
//     Buffoon Packs, shop weights 0.3 each Normal variant / 0.3 Jumbo / 0.075 Mega (half the Buffoon Packs': both eras together weigh one Buffoon): only that era's Paradox jokers, all different within a pack.
// Art (owner rule: composed, never a placeholder): tools/micatro/compose_pokermon_paradox_art.py -> assets/2x/paradox_ball.png (one Item card,
// the Ultra Ball card restyled) and paradox_packs.png (Ancient row: Normal x2, Jumbo, Mega; Future row the same).
import {
  G, P_CENTERS, defineConsumables, defineBoosters, play_sound, delay, set_spoon_item, create_random_poke_joker, smods_create_card,
  pseudorandom_element, pseudoseed, get_gen_allowed, pokemon_in_pool, cfg,
} from './api.js';
import { centerActive } from '../../js/mods/registry.js';
import { PARADOX_ERAS, PARADOX_COLOUR } from './jokers/pokejokers_designs.js';

const FILE = 'micatro/paradox';

/** Every registered Paradox joker of `era` ('ancient' | 'future' | null for both), in Pokédex order. */
export function paradox_keys(era) {
  return Object.values(P_CENTERS).filter((v) => v && v.set === 'Joker' && v.rarity === 'poke_paradox' && !v.unported && (!era || v.poke_paradox === era)).map((v) => v.key);
}
/** The ones a pack may offer now: active, their generation allowed, in the pool (pokemon_in_pool: not one you hold, unless Showman), not banned. */
export function paradox_pool(era, exclude = []) {
  return paradox_keys(era).filter((k) => {
    const v = P_CENTERS[k];
    return centerActive(v) && get_gen_allowed(v) && pokemon_in_pool(v) && !(G.GAME && G.GAME.banned_keys && G.GAME.banned_keys[k]) && !exclude.includes(k);
  });
}

// ----------------------------------------------------------------------------------------------- the Paradox Ball
defineConsumables({
  paradoxball: {
    key: 'paradoxball',
    name: 'paradoxball',
    set: 'Item',
    atlas: 'paradox_ball',
    pos: { x: 0, y: 0 },
    cost: 4,
    weight: 3,
    pokeball: true,
    config: {},
    unlocked: true,
    discovered: true,
    loc_vars(self, info_queue) { return { vars: [] }; },
    can_use(self, card) { return G.jokers.cards.length < G.jokers.config.card_limit; },
    use(self, card) {
      set_spoon_item(card);
      G.E_MANAGER.add_event(() => {
        play_sound('timpani');
        const _card = create_random_poke_joker('paradoxball', null, 'poke_paradox');
        _card.add_to_deck();
        G.jokers.emplace(_card);
      });
      delay(0.6);
    },
    // (in a pool only while some Paradox joker could come out of it: Gen 9 on; the pokeballs option is index.js's gate)
    in_pool() { return paradox_keys(null).some((k) => get_gen_allowed(P_CENTERS[k])); },
  },
}, FILE);

// ----------------------------------------------------------------------------------------------- the Ancient / Future Packs
const SIZES = { normal: { extra: 2, choose: 1, cost: 4, weight: 0.3, label: '' }, jumbo: { extra: 4, choose: 1, cost: 6, weight: 0.3, label: 'Jumbo ' }, mega: { extra: 4, choose: 2, cost: 8, weight: 0.075, label: 'Mega ' } };
/** The packs' art cells (paradox_packs.png: row 0 Ancient, row 1 Future; Normal, Normal (alt), Jumbo, Mega). */
const CELL = { normal: 0, normal_2: 1, jumbo: 2, mega: 3 };
function pack(era, size, variant) {
  const S = SIZES[size], E = PARADOX_ERAS[era];
  const key = 'pokepack_' + era + '_' + variant;
  return {
    key,
    name: S.label + E.name + ' Pack',
    kind: E.name,
    atlas: 'paradox_packs',
    pos: { x: CELL[variant], y: era === 'ancient' ? 0 : 1 },
    config: { extra: S.extra, choose: S.choose },
    cost: S.cost,
    weight: S.weight,
    order: 6,
    draw_hand: false,
    unlocked: true,
    discovered: true,
    group_key: 'k_poke_' + era + '_pack',
    poke_paradox_pack: era,
    /** One of this era's Paradox jokers, all different within the pack (`paradox_offered`, on the pack card); if the pool runs dry (you
     *  hold nearly all of them), any of the era's. Seeded per era and slot: 'poke_<era>_pack'. */
    create_card(self, card, i) {
      if (!Array.isArray(card.ability.paradox_offered)) card.ability.paradox_offered = [];
      let pool = paradox_pool(era, card.ability.paradox_offered);
      if (!pool.length) pool = paradox_keys(era);
      const [k] = pseudorandom_element(pool, pseudoseed('poke_' + era + '_pack'));
      card.ability.paradox_offered.push(k);
      return smods_create_card({ set: 'Joker', area: G.pack_cards, key: k, skip_materialize: true });
    },
    loc_vars(self, info_queue, card) {
      const m = G.GAME.modifiers || {};
      return { vars: [card.config.center.config.choose + (m.booster_choice_mod || 0), card.ability.extra + (m.booster_size_mod || 0)] };
    },
    in_pool() { return paradox_keys(era).some((k) => get_gen_allowed(P_CENTERS[k])); },
  };
}
const PACKS = {};
for (const era of ['ancient', 'future']) {
  for (const [size, variants] of [['normal', ['normal', 'normal_2']], ['jumbo', ['jumbo']], ['mega', ['mega']]]) {
    for (const v of variants) { const p = pack(era, size, v); PACKS[p.key] = p; }
  }
}
defineBoosters(PACKS, FILE);
/** The pack screen's colours (the view hook, as Reverie's film packs): Ancient amber, Future steel blue. */
export const PACK_COLOURS = { ancient: { colour: '#7a4a1c', special: '#e0a040' }, future: { colour: '#1d5d75', special: '#7fe3ff' } };
export const paradox_pack_open = () => { const k = G.GAME && G.GAME.pack_center; const c = k && P_CENTERS[k]; return (c && c.poke_paradox_pack) || null; };

// ----------------------------------------------------------------------------------------------- text
const ERA_PILL = (era) => '{X:poke_' + era + ',C:white}' + PARADOX_ERAS[era].name + '{}';
const PACK_TEXT = (era) => ['Choose {C:attention}#1#{} of up to', '{C:attention}#2#{} ' + ERA_PILL(era) + ' Paradox', 'Joker cards'];
export const PARADOX_LOC = {
  Item: {
    c_poke_paradoxball: { name: 'Paradox Ball', text: ['Create a random', '{X:poke_paradox,C:white}Paradox{} Joker card', '{C:inactive}(Ancient or Future)', '{C:inactive}(Must have room)'] },
  },
  Other: Object.fromEntries(Object.values(PACKS).map((p) => ['p_poke_' + p.key, { name: p.name, text: PACK_TEXT(p.poke_paradox_pack) }])),
};
export const PARADOX_DICTIONARY = { k_poke_ancient_pack: 'Ancient Pack', k_poke_future_pack: 'Future Pack' };
export const PARADOX_LOC_COLOURS = { poke_paradox: PARADOX_COLOUR, poke_ancient: PARADOX_ERAS.ancient.colour, poke_future: PARADOX_ERAS.future.colour };
