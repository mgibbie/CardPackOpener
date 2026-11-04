/**
 * Behaviour registry for the Pokermon rebuild — the API the per-file ports use.
 *
 * Static data (names, positions, config numbers, rarity, cost, stage, ptype, gen,
 * item_req, ...) comes from data.js (extracted from the mod's own Lua); a port only
 * supplies BEHAVIOUR, keyed by the Pokermon `name` (the Lua local name, e.g. 'bulbasaur'):
 *
 *   defineJokers({
 *     bulbasaur: {
 *       loc_vars(self, info_queue, card) { return { vars: [...] }; },
 *       calculate(self, card, context) { ... },          // return the Lua table, or undefined
 *       add_to_deck(self, card, from_debuff) {},
 *       remove_from_deck(self, card, from_debuff) {},
 *       calc_dollar_bonus(self, card) {},                 // cash-out $
 *       update(self, card) {},                            // runs before every calculate
 *       set_ability(self, card, initial) {},
 *       in_pool(self) {},                                 // only honoured with custom_pool_func
 *       getMega(self, card) {},                           // branching megas
 *     },
 *   }, 'pokemon/pokejokers_01.lua');
 *
 * `self` is the center (so `self.config.evo_rqmt` reads the Lua config), `card` the Card.
 * Anything the data marks as a function ("__fn") but the port doesn't define simply
 * doesn't exist — a joker whose name has NO entry here is registered as `unported`
 * (inert, never in a pool) so a partially ported mod stays playable.
 *
 * defineConsumables / defineBoosters / defineVouchers / defineBacks / defineTags /
 * defineBlinds / defineSeals / defineEnhancements work the same way (consumables are
 * keyed by name too; boosters/vouchers/backs/tags/blinds/seals/enhancements by their
 * Lua `key`). Extra center fields (not functions) in a definition override the data.
 */
export const DEFS = {
  jokers: {}, consumables: {}, boosters: {}, vouchers: {}, backs: {}, tags: {}, blinds: {}, seals: {}, enhancements: {},
};
/** Lua source file -> list of names ported from it (for the status table / tests). */
export const PORTED_FILES = {};

function define(kind, map, file) {
  for (const [name, def] of Object.entries(map)) {
    if (DEFS[kind][name]) throw new Error(`pokermon: ${kind} '${name}' defined twice`);
    DEFS[kind][name] = { ...def, poke_file: file };
    if (file) (PORTED_FILES[file] = PORTED_FILES[file] || []).push(name);
  }
}

export const defineJokers = (map, file) => define('jokers', map, file);
export const defineConsumables = (map, file) => define('consumables', map, file);
export const defineBoosters = (map, file) => define('boosters', map, file);
export const defineVouchers = (map, file) => define('vouchers', map, file);
export const defineBacks = (map, file) => define('backs', map, file);
export const defineTags = (map, file) => define('tags', map, file);
export const defineBlinds = (map, file) => define('blinds', map, file);
export const defineSeals = (map, file) => define('seals', map, file);
export const defineEnhancements = (map, file) => define('enhancements', map, file);
