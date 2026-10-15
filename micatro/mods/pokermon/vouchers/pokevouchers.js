// Pokermon 3.2.1 — vouchers/pokevouchers.lua: Energy Search (+2 Energy limit) -> Energy Research
// (+3 more), Good Rod (+1 card in every booster pack — the lovely "Resize Booster Pack" patch,
// see systems/rules.js pack_size) -> Super Rod (cards in every pack but the Wish Pack can be saved
// to the consumable slots: the engine's 'reserve' action, allowed by rules.js can_reserve).
// unredeem is kept for parity (Micatro never un-redeems a voucher).
import { G, defineVouchers, cfg } from '../api.js';

const FILE = 'vouchers/pokevouchers.lua';

defineVouchers({
  energysearch: {
    loc_vars() { return { vars: [] }; },
    redeem() { G.GAME.energy_plus = G.GAME.energy_plus !== undefined ? G.GAME.energy_plus + 2 : 2; },
    unredeem() { G.GAME.energy_plus = G.GAME.energy_plus !== undefined ? G.GAME.energy_plus - 2 : 0; },
    in_pool() { return !cfg('unlimited_energy'); },
  },
  energyresearch: {
    loc_vars() { return { vars: [] }; },
    redeem() { G.GAME.energy_plus = G.GAME.energy_plus !== undefined ? G.GAME.energy_plus + 3 : 3; },
    unredeem() { G.GAME.energy_plus = G.GAME.energy_plus !== undefined ? G.GAME.energy_plus - 3 : 0; },
    in_pool() { return !cfg('unlimited_energy'); },
  },
  goodrod: {
    loc_vars() { return { vars: [] }; },
    redeem() { G.GAME.extra_pocket_picks = G.GAME.extra_pocket_picks !== undefined ? G.GAME.extra_pocket_picks + 1 : 1; },
    unredeem() { G.GAME.extra_pocket_picks = G.GAME.extra_pocket_picks !== undefined ? G.GAME.extra_pocket_picks - 1 : 0; },
  },
  superrod: {
    loc_vars() { return { vars: [] }; },
    redeem() { if (!G.GAME.poke_save_all) G.GAME.poke_save_all = true; },
    unredeem() { if (G.GAME.poke_save_all) G.GAME.poke_save_all = false; },
  },
}, FILE);
