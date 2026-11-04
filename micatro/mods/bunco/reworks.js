// Bunco — its options (config.lua; the shipped defaults) that change base-game cards, only while Bunco is on:
//   gameplay_reworks (on)   The Lovers selects up to 2 cards; Luchador: sell for a Breaking Tag (instead of
//                           disabling the boss); Red Card: +3 Mult per SKIPPED CHOICE (x the picks left);
//                           Boss Tag: a free Blind Pack (instead of a boss reroll); D6 Tag: a free reroll in the
//                           next shop; The Wheel of Fortune / Aura can also give Glitter (Bunco.lua ~635-761 +
//                           lovely "Luchador / Red Card / Boss Tag Rework", "Glitter edition in poll_edition")
//   fixed_sprites (on)      Bunco's cleaned-up art for 14 vanilla jokers and 14 consumables (Bunco.lua ~465)
//   fixed_badges (off)      "Planet" (Pluto) / "Planet?" (Ceres, Eris, Bunco's planets) badges instead of
//                           "Dwarf Planet"
// The Lovers' change is to the shared center table, so `reset_run` sets it for every new run (1 = vanilla
// whenever Bunco or the option is off). The reworked descriptions come from Bunco's own text (j_bunc_luchador,
// j_bunc_red_card, c_bunc_wheel_of_fortune, c_bunc_aura); the two reworked tags keep the base tag text.
import { G, P_CENTERS, localize, math_random, play_sound, card_eval_status_text, calculate_reroll_cost } from '../../js/engine/core.js';

import { Tag, add_tag } from '../../js/engine/tag.js';
import { on, option } from './util.js';
import { open_free_pack } from './tags.js';
import { poll_options } from './vouchers.js';
import LOC from './loc.js';

const reworks = () => on() && !!option('gameplay_reworks');
const coordinate = (n) => ({ x: (n - 1) % 10, y: Math.floor((n - 1) / 10) });
const JOKER_SPRITES = ['j_juggler', 'j_drunkard', 'j_acrobat', 'j_credit_card', 'j_troubadour', 'j_even_steven', 'j_odd_todd', 'j_fibonacci', 'j_drivers_license', 'j_gift', 'j_flash', 'j_ramen', 'j_selzer', 'j_scholar'];
const CONS_SPRITES = ['c_fool', 'c_lovers', 'c_chariot', 'c_wheel_of_fortune', 'c_tower', 'c_moon', 'c_world', 'c_soul', 'c_ceres', 'c_mercury', 'c_uranus', 'c_pluto', 'c_incantation', 'c_black_hole'];
const fill = (text, vars) => text.map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));

export function reset_run() {
  // G.P_CENTERS.c_lovers.config.max_highlighted = 2 (vanilla 1)
  P_CENTERS.c_lovers.config.max_highlighted = reworks() ? 2 : 1;
}

export const hooks = {
  calculate_joker(card, context) {
    if (!reworks()) return undefined;
    const n = card.ability.name;
    if (n === 'Luchador') {
      if (card.debuff) return null;
      if (context.selling_self) {
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag('tag_bunc_breaking')); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4);
          // (5.4.8b "breaking tag now triggers when luchador sells": the immediate tags run, so a Breaking Tag gained
          // during a Boss Blind disables it now, as the vanilla Luchador would)
          G.E_MANAGER.add_event(() => { for (const t of G.GAME.tags.slice()) t.apply_to_run({ type: 'immediate' }); });
        });
      }
      return null;
    }
    if (n === 'Red Card' && context.skipping_booster) {
      if (card.debuff || context.blueprint) return null;
      card.ability.mult = card.ability.mult + card.ability.extra * G.GAME.pack_choices;
      const amt = card.ability.extra * G.GAME.pack_choices;
      G.E_MANAGER.add_event(() => card_eval_status_text(card, 'extra', null, null, null, { message: localize({ type: 'variable', key: 'a_mult', vars: [amt] }), colour: 'RED' }));
      return null;
    }
    return undefined;
  },
  apply_tag(tag, ctx) {
    if (!reworks()) return undefined;
    if (tag.name === 'Boss Tag') {
      if (ctx.type !== 'new_blind_choice') return null;
      tag.yep('+', 'Spectral', () => { open_free_pack('p_bunc_blind_' + math_random(4)); return true; });
      tag.triggered = true;
      return true;
    }
    if (tag.name === 'D6 Tag') {
      if (ctx.type !== 'shop_final_pass') return null;
      tag.yep('+', 'GREEN', () => true);
      G.GAME.current_round.free_rerolls = G.GAME.current_round.free_rerolls + 1;
      calculate_reroll_cost(true);
      tag.triggered = true;
      return true;
    }
    return undefined;
  },
  // The Wheel of Fortune / Aura roll Glitter too (SMODS's base-edition poll for those keys + e_bunc_glitter).
  poll_edition(key, mod, no_neg, guaranteed) {
    if (!reworks() || (key !== 'wheel_of_fortune' && key !== 'aura')) return undefined;
    return poll_options(key, mod, no_neg, guaranteed, ['e_negative', 'e_polychrome', 'e_holo', 'e_foil', 'e_bunc_glitter']);
  },
  describe(card, desc) {
    const k = card && card.config && card.config.center && card.config.center.key;
    if (!k) return;
    if (reworks()) {
      if (k === 'j_luchador') { desc.lines = LOC.descriptions.Joker.j_bunc_luchador.text.slice(); desc.info = [...(desc.info || []), { key: 'tag_bunc_breaking', name: LOC.descriptions.Tag.tag_bunc_breaking.name, lines: LOC.descriptions.Tag.tag_bunc_breaking.text }]; }
      if (k === 'j_red_card') desc.lines = fill(LOC.descriptions.Joker.j_bunc_red_card.text, [card.ability.extra, card.ability.mult]);
      if (k === 'c_wheel_of_fortune') desc.lines = fill(LOC.descriptions.Tarot.c_bunc_wheel_of_fortune.text, [G.GAME.probabilities.normal, card.ability.extra]);
      if (k === 'c_aura') desc.lines = LOC.descriptions.Spectral.c_bunc_aura.text.slice();
    }
    if (on() && option('fixed_badges') && desc.badges && desc.badges[0] && ['c_pluto', 'c_ceres', 'c_eris', 'c_bunc_quaoar', 'c_bunc_haumea', 'c_bunc_sedna', 'c_bunc_makemake'].includes(k)) {
      desc.badges[0] = { ...desc.badges[0], label: k === 'c_pluto' ? localize('k_planet') : localize('k_planet_q') };
    }
  },
  view_card(card, v) {
    if (!(on() && option('fixed_sprites'))) return;
    const k = card.config.center.key;
    let i = JOKER_SPRITES.indexOf(k);
    if (i >= 0) { v.atlas = 'bunco_resprites_jokers'; v.pos = coordinate(i + 1); return; }
    i = CONS_SPRITES.indexOf(k);
    if (i >= 0) { v.atlas = 'bunco_resprites_consumables'; v.pos = coordinate(i + 1); }
  },
};
export const centers = [];
