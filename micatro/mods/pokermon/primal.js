// Pokermon batch E, the Primal Reversions (the owner's "orb version yes", 2026-11-03; contentRev PRIMAL_REV). Micatro's own (Pokermon
// 3.9.1 draws the Primal cards but ships no Orb): Primal Kyogre / Primal Groudon are in jokers/pokejokers_designs.js (Legendary forms,
// never in a pool; they stand on their normal form's side of the weather trio). This file:
//   - the Blue Orb and the Red Orb (Items, $4 like the evolution stones and the Mega Stone; the Items' default pool weight): the selected
//     undebuffed Kyogre (Blue) / Groudon (Red), else the leftmost one, becomes its Primal FOR GOOD (the Mega Berry Juice's way, not the Mega
//     Stone's: nothing remembers it, nothing reverts it, and a Mega Stone's state is untouched). None to turn: the Orb can't be used. Energy,
//     edition and stickers carry over (poke_backend_evolve). Not an evolution (no `poke_evolved` context, as a Mega; the Randomizer
//     challenge never rerolls it).
//   - where they turn up: wherever Items do (the Pocket Packs' Item slots, ...), but each only while you hold its Legendary (Kyogre for the
//     Blue Orb, Groudon for the Red Orb; a debuffed one counts) and only on rules rev PRIMAL_REV (so a run recorded before it replays its
//     pools as recorded). And the Paradox packs: an Ancient Pack (Groudon, the sun) / a Future Pack (Kyogre, the sea) whose Orb is in the
//     pool offers it as its first card 1 time in 4 (its own seed, 'poke_<era>_orb', rolled only then). Saveable from any pack.
// Art (owner rule: composed, never a placeholder): tools/micatro/compose_pokermon_orb_art.py -> assets/2x/primal_orbs.png (the Water Stone /
// Fire Stone Item cards with a shaded orb carrying Kyogre's alpha / Groudon's omega, re-lettered BLUE ORB / RED ORB).
import { G, P_CENTERS, defineConsumables, play_sound, delay, poke_evolve, find_card, pseudorandom, pseudoseed } from './api.js';
import { rulesRev } from '../../js/mods/pins.js';
import { PRIMAL_REV } from './jokers/pokejokers_designs.js';

const FILE = 'micatro/primal';

/** The Orbs: key -> {species it turns, the Primal it makes, the Paradox era whose pack offers it}. */
export const ORBS = {
  c_poke_blueorb: { from: 'j_poke_kyogre', to: 'j_poke_primal_kyogre', era: 'future' },
  c_poke_redorb: { from: 'j_poke_groudon', to: 'j_poke_primal_groudon', era: 'ancient' },
};
/** The Orb's target: the highlighted joker if it is an undebuffed one of its species, else the leftmost such (the Mega Berry Juice's rule). */
export function orb_target(key) {
  const o = ORBS[key];
  if (!o || !(G.jokers && G.jokers.cards)) return undefined;
  const ok = (j) => j.config.center.key === o.from && !j.debuff && !j.removed;
  if (G.jokers.highlighted && G.jokers.highlighted.length === 1 && ok(G.jokers.highlighted[0])) return G.jokers.highlighted[0];
  return G.jokers.cards.find(ok);
}
/** In a pool: on PRIMAL_REV, while you hold the Orb's Legendary. */
export const orb_in_pool = (key) => rulesRev('pokermon') >= PRIMAL_REV && find_card(ORBS[key].from, true).length > 0;

function orb(key, x) {
  const name = key.slice(7);
  return {
    key: name,
    name,
    set: 'Item',
    atlas: 'primal_orbs',
    pos: { x, y: 0 },
    cost: 4,
    config: {},
    unlocked: true,
    discovered: true,
    saveable: true,
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS[ORBS[key].to]); return { vars: [] }; },
    can_use() { return !!orb_target(key); },
    use() {
      const target = orb_target(key);
      if (!target) return;
      G.E_MANAGER.add_event(() => { play_sound('timpani'); });
      poke_evolve(target, ORBS[key].to, false, 'Primal Reversion!', true);
      delay(0.6);
    },
    in_pool() { return orb_in_pool(key); },
  };
}
defineConsumables({ blueorb: orb('c_poke_blueorb', 0), redorb: orb('c_poke_redorb', 1) }, FILE);

/** An Ancient / Future Pack's first card (paradox.js): its era's Orb, 1 time in 4, while that Orb is in the pool (not banned). -> key | null */
export function primal_pack_orb(era) {
  const key = Object.keys(ORBS).find((k) => ORBS[k].era === era);
  if (!key || !P_CENTERS[key] || !orb_in_pool(key) || (G.GAME.banned_keys && G.GAME.banned_keys[key])) return null;
  return pseudorandom(pseudoseed('poke_' + era + '_orb')) > 0.75 ? key : null;
}

export const PRIMAL_LOC = {
  Item: {
    c_poke_blueorb: { name: 'Blue Orb', text: ['The selected or leftmost', '{C:attention}Kyogre{} becomes', '{C:attention}Primal Kyogre{} for good', '{C:inactive}(Found only while you', '{C:inactive}have a Kyogre)'] },
    c_poke_redorb: { name: 'Red Orb', text: ['The selected or leftmost', '{C:attention}Groudon{} becomes', '{C:attention}Primal Groudon{} for good', '{C:inactive}(Found only while you', '{C:inactive}have a Groudon)'] },
  },
};
