// BETMMA art layout: every per-card PNG of the bundle (2x, 142x190) packed into ONE atlas sheet
// micatro/mods/betmma/assets/2x/betmma.png by tools/micatro/pack_betmma_atlas.mjs. Cells are laid out
// row-major, COLS per row, in this order: the 82 vouchers, the 11 jokers, the 3 voucher packs.
export const COLS = 10;
export const VOUCHERS = [
  'oversupply', 'oversupply_plus', 'gold_coin', 'gold_bar', 'abstract_art', 'mondrian', 'round_up', 'round_up_plus',
  'event_horizon', 'engulfer', 'target', 'bulls_eye', 'voucher_bundle', 'voucher_bulk', 'skip', 'skipper', 'scrawl',
  'scribble', 'reserve_area', 'reserve_area_plus', 'overkill', 'big_blast', '3d_boosters', '4d_boosters', 'b1g50', 'b1g1',
  'collector', 'connoisseur', 'flipped_card', 'double_flipped_card', 'prologue', 'epilogue', 'bonus_plus', 'mult_plus',
  'omnicard', 'bulletproof', 'cash_clutch', 'inflation', 'eternity', 'half_life', 'debt_burden', 'bobby_pin', 'stow',
  'stash', 'undying', 'reincarnate', 'bargain_aisle', 'clearance_aisle', 'rich_boss', 'richer_boss', 'gravity_assist',
  'gravitational_wave', 'garbage_bag', 'handbag', 'echo_wall', 'echo_chamber', 'laminator', 'eliminator',
  // fusion vouchers
  'gold_round_up', 'overshopping', 'reroll_cut', 'vanish_magic', 'darkness', 'double_planet', 'trash_picker',
  'money_target', 'art_gallery', 'b1ginf', 'slate', 'gilded_glider', 'mirror', 'real_random', '4d_vouchers',
  'recycle_area', 'chaos', 'heat_death', 'deep_roots', 'solar_system', 'forbidden_area', 'voucher_tycoon',
  'cryptozoology', 'reroll_aisle',
];
export const JOKERS = [
  'jjookkeerr', 'ascension', 'hasty', 'errorr', 'piggy_bank', 'housing_choice', 'jimbow', 'gameplay_update',
  'flying_cards', 'friends_of_jimbo', 'balatro_mobile',
];
export const PACKS = ['voucher_pack', 'uncommon_voucher_pack', 'fusion_voucher_pack'];

/** -> {vouchers: {id: pos}, jokers: {id: pos}, packs: {id: pos}, rows} */
export function layout() {
  let n = 0;
  const place = () => { const p = { x: n % COLS, y: Math.floor(n / COLS) }; n++; return p; };
  const out = { vouchers: {}, jokers: {}, packs: {} };
  for (const v of VOUCHERS) out.vouchers[v] = place();
  for (const j of JOKERS) out.jokers[j] = place();
  for (const p of PACKS) out.packs[p] = place();
  out.rows = Math.ceil(n / COLS);
  return out;
}
