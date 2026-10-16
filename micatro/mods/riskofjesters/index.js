/**
 * Risk of Jesters (DVRP; Steamodded 0.9.x old API), rebuilt natively for Micatro. Source:
 * RiskofJesters.lua (the Card/Blind wraps), jokers.lua, vouchers.lua, blinds.lua,
 * localizations.lua (English) and lovely.toml (pack-size / description patches). Numbers, rules and
 * text are the mod's; keys are prefixed `roj` (j_roj_egocentrism, v_roj_3d_printer, bl_roj_loop).
 *
 *   11 jokers  Bustling Fungus, Snake Eyes, Lepton Daisy, Kjaro's Band, Substandard Duplicator,
 *              Happiest Mask, Benthic Bloom, Encrusted Key, Egocentrism, Eulogy Zero, Executive Card
 *   2 vouchers 3D Printer (+1 card in every Booster Pack), Mili-Tech Printer (+1 choice)
 *   4 blinds   The Loop, The Void, and the showdowns Glaucous Hammer and Tyrian Crab
 *   + the "Temporary" sticker (Substandard Duplicator's copies).
 *
 * The mod's Lua wraps become hooks (micatro/js/mods/registry.js HOOKS):
 *   Card:calculate_joker wrap (Temporary jokers break at end of round)  -> calculate_joker
 *   Card:add_to_deck wrap (joker_added context)                         -> add_to_deck
 *   Card:remove_from_deck wrap (any_card_destroyed context)             -> card_removed
 *   attention_text wrap on "Nope!" (wheel_failed context)               -> wheel_failed
 *   copy_card wrap (copies restart their counters)                      -> copy_card
 *   Card:set_cost wrap (Temporary sell value 0; Eulogy half price)      -> set_cost
 *   create_card_for_shop + CardArea:emplace wraps (Eulogy)              -> create_card + emplace
 *   lovely pack patches (3D / Mili-Tech Printer, Executive Card)        -> pack_size / pack_choices / booster_loc_vars
 *   Blind wraps (Loop, Hammer, Crab)                                    -> the mod-blind hooks (engine/blind.js)
 *   The Void (end_of_round in the calculate_joker wrap)                 -> end_round
 *
 * INTENDED-DESIGN FIXES (each tested in micatro/tests/mods/riskofjesters_test.mjs):
 *  1. Substandard Duplicator copied a joker every time it was UN-debuffed (Card:add_to_deck also
 *     runs with from_debuff when a debuff lifts — The Loop, Crimson Heart): only real gains count.
 *  2. Happiest Mask rolled whenever a joker was DEBUFFED (Card:remove_from_deck(from_debuff)):
 *     only cards actually leaving the game (Card:remove) count as destroyed.
 *  3. The Void's end-of-round wrap RETURNED instead of calling the joker's own calculation, so on
 *     The Void no joker's end-of-round effect ran (Mr. Bones couldn't save you; Benthic Bloom and
 *     Encrusted Key never fired on this Boss Blind). Jokers act normally; afterwards every joker's
 *     sell value is set to 0 — as a sell value (extra_value), so a later set_cost (Gift Card, Egg,
 *     an edition) can't silently restore the old price the way the Lua's bare sell_cost = 0 could.
 *  4. Snake Eyes scaled once more for each Blueprint/Brainstorm copying it (its wheel_failed branch
 *     has no `not context.blueprint`, unlike the mod's other scaling jokers): copies don't scale it.
 *  5. Encrusted Key (blueprint_compat) gave Blueprint (copying from the left) nothing — Blueprint
 *     destroyed the Key first — but gave Brainstorm a second tag and a second removal. A copy now
 *     always gives one extra Coupon Tag; only the Key's own trigger destroys it.
 *  6. Glaucous Hammer's `hammered` marks were never cleared, so a second Glaucous Hammer (endless)
 *     debuffed its new random half PLUS the old one: each fight marks a fresh half.
 *  Port note: Benthic Bloom compared `rarity <= 3`, which errors in Lua on a mod joker with a
 *  string rarity (Pokermon's Safari/Mega); here such jokers are explicitly not upgradable (JS
 *  would merely compare false, so this is guarded rather than a behaviour change).
 */
import { registerMod, isActive } from '../../js/mods/registry.js';
import {
  G, localize, emit, card_eval_status_text, play_sound, pseudorandom, pseudoseed, pseudorandom_element,
  pseudoshuffle, create_card, copy_card, find_joker, get_blind_amount, number_format,
} from '../../js/engine/core.js';
import { Tag, add_tag } from '../../js/engine/tag.js';

const MOD_ID = 'riskofjesters';
const ART = '/micatro/mods/riskofjesters/assets/2x/';
const FILTER = 'FILTER';

// ------------------------------------------------------------------ helpers
const joker_ctx_end = (c) => c.end_of_round && !c.individual && !c.repetition;
/** Lua's "is in the joker row": G.jokers:remove_card(self); self:remove() inside an event (Encrusted / Temporary). */
function break_away(card) {
  G.E_MANAGER.add_event(() => {
    play_sound('tarot1');
    G.E_MANAGER.add_event(() => {
      emit('dissolve', { card: card.sort_id, reason: 'broken' });
      if (card.area) card.area.remove_card(card);
      card.remove();
    });
  });
}
/** Fire one of the mod's contexts at every joker (Blueprint/Brainstorm forward it), like the Lua loops. */
function fire(context, skip) {
  for (const v of G.jokers.cards.slice()) if (v !== skip) v.calculate_joker({ ...context });
}

// ------------------------------------------------------------------ jokers
const J = {};

J.egocentrism = {
  name: 'Egocentrism', order: 9, config: { extra: 40 }, rarity: 1, cost: 4, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq, card) {
    let count = 0;
    if (G.jokers && G.jokers.cards) for (const j of G.jokers.cards) if (j.ability.set === 'Joker' && j.ability.name === 'Egocentrism') count++;
    return { vars: [card.ability.extra, count * card.ability.extra] };
  },
  calculate(self, card, context) {
    if (context.setting_blind && !card.getting_sliced && !context.blueprint) {
      const convertables = [], egocentrisms = [];
      for (const v of G.jokers.cards) if (!v.getting_sliced) (v.ability.name === 'Egocentrism' ? egocentrisms : convertables).push(v);
      if (convertables.length > 0 && !(context.blueprint_card || card).getting_sliced) {
        const [joker] = pseudorandom_element(convertables, pseudoseed('egocentrism'));
        joker.getting_sliced = true;
        G.E_MANAGER.add_event(() => {
          const nw = copy_card(egocentrisms[0], null, null, null);
          card.juice_up();
          nw.set_edition(joker.edition, true);
          joker.start_dissolve();
          nw.add_to_deck();
          G.jokers.emplace(nw);
        });
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_converted_ex') });
      }
      return undefined;
    }
    if (context.joker_main) {
      let count = 0;
      for (const j of G.jokers.cards) if (j.ability.set === 'Joker' && j.ability.name === 'Egocentrism') count++;
      return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra * count] }), chip_mod: card.ability.extra * count };
    }
    return undefined;
  },
};

J.eulogy = {
  name: 'Eulogy Zero', order: 10, config: { extra: 2 }, rarity: 2, cost: 5, blueprint_compat: false, eternal_compat: true,
  loc_vars(self, iq, card) { return { vars: ['' + (G.GAME ? G.GAME.probabilities.normal : 1), card.ability.extra] }; },
  // (no calculate: the shop wraps below do the work)
};

J.bungus = {
  name: 'Bustling Fungus', order: 1, config: { extra: 5 }, rarity: 1, cost: 6, blueprint_compat: false, eternal_compat: true,
  loc_vars(self, iq, card) { iq.push({ key: 'e_foil', set: 'Edition', config: { extra: 50 } }); return { vars: [card.ability.extra, card.ability.bungus_rounds ?? 0] }; },
  set_ability(self, card) { card.ability.bungus_rounds = 0; },
  calculate(self, card, context) {
    if (joker_ctx_end(context) && !context.blueprint && !card.getting_sliced) {
      card.ability.bungus_rounds = card.ability.bungus_rounds + 1;
      if (card.ability.bungus_rounds === card.ability.extra) {
        G.E_MANAGER.add_event(() => {
          const pos = G.jokers.cards.indexOf(card);
          if (pos < 0) return; // (the Lua event would spin forever here)
          card.juice_up();
          G.E_MANAGER.add_event(() => {
            const l = G.jokers.cards[pos - 1], r = G.jokers.cards[pos + 1];
            if (l && !l.edition) l.set_edition({ foil: true }, true);
            if (r && !r.edition) r.set_edition({ foil: true }, true);
          });
        });
      }
      if (card.ability.bungus_rounds <= card.ability.extra) {
        return { message: card.ability.bungus_rounds < card.ability.extra ? card.ability.bungus_rounds + '/' + card.ability.extra : localize('k_active_ex'), colour: FILTER };
      }
    }
    return undefined;
  },
};

J.snake_eyes = {
  name: 'Snake Eyes', order: 2, config: { extra: { mult: 2, mult_mod: 6 } }, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq, card) { return { vars: [card.ability.extra.mult_mod, card.ability.extra.mult] }; },
  calculate(self, card, context) {
    if (context.wheel_failed) {
      if (context.blueprint) return undefined; // fix 4
      card.ability.extra.mult = card.ability.extra.mult + card.ability.extra.mult_mod;
      G.E_MANAGER.add_event(() => card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_upgrade_ex') }));
      return undefined;
    }
    if (context.joker_main) {
      return { message: localize({ type: 'variable', key: 'a_mult', vars: [card.ability.extra.mult] }), mult_mod: card.ability.extra.mult };
    }
    return undefined;
  },
};

J.daisy = {
  name: 'Lepton Daisy', order: 3, config: { extra: 50 }, rarity: 2, cost: 6, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq, card) { return { vars: [card.ability.extra] }; },
  calculate(self, card, context) {
    if (context.joker_main && context.cardarea === G.jokers) {
      let count = 0;
      for (const v of context.full_hand) if (v.debuff) count++;
      if (count > 0) return { message: localize({ type: 'variable', key: 'a_chips', vars: [card.ability.extra * count] }), chip_mod: card.ability.extra * count };
    }
    return undefined;
  },
};

J.kjaro = {
  name: "Kjaro's Band", order: 4, config: { extra: { Xmult: 4, required: 4 } }, rarity: 2, cost: 5, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq, card) {
    const r = { vars: [card.ability.extra.Xmult, card.ability.extra.required] };
    if (G.GAME && card.area && card.area === G.jokers) r.main_end = [card.ability.enabled ? localize('k_active') : localize('ph_kjaro_disabled')];
    return r;
  },
  set_ability(self, card) { card.ability.enabled = false; },
  calculate(self, card, context) {
    if (joker_ctx_end(context) && !context.blueprint && !(context.blueprint_card || card).getting_sliced) {
      // (the Lua hard-codes 4 — the same number as `required`)
      if (G.GAME.chips >= G.GAME.blind.chips * card.ability.extra.required) {
        card.ability.enabled = true;
        return { message: localize('k_active_ex'), colour: FILTER };
      }
      card.ability.enabled = false;
      return undefined;
    }
    if (context.joker_main && card.ability.enabled) {
      return { message: localize({ type: 'variable', key: 'a_xmult', vars: [card.ability.extra.Xmult] }), Xmult_mod: card.ability.extra.Xmult };
    }
    return undefined;
  },
};

J.duplicator = {
  name: 'Substandard Duplicator', order: 5, config: {}, rarity: 3, cost: 10, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq) { iq.push({ key: 'e_negative', set: 'Edition' }, { key: 'temporary', set: 'Other' }); return { vars: [] }; },
  calculate(self, card, context) {
    if (context.joker_added && !(context.blueprint_card || card).getting_sliced) {
      const who = context.blueprint_card || card;
      G.E_MANAGER.add_event(() => {
        const nw = copy_card(context.added, null, null, null);
        nw.ability.temporary = true;
        who.juice_up();
        nw.set_edition({ negative: true }, true);
        nw.set_eternal(false);
        nw.add_to_deck();
        G.jokers.emplace(nw);
        nw.set_cost();
      });
      card_eval_status_text(who, 'extra', null, null, null, { message: localize('k_duplicated_ex') });
    }
    return undefined;
  },
};

J.happiest_mask = {
  name: 'Happiest Mask', order: 6, config: { extra: 2 }, rarity: 3, cost: 9, blueprint_compat: true, eternal_compat: true,
  loc_vars(self, iq, card) { return { vars: ['' + (G.GAME ? G.GAME.probabilities.normal : 1), card.ability.extra] }; },
  calculate(self, card, context) {
    // RiskofJesters.lua flags sold / used cards (Card:sell_card / Card:use_consumeable wraps) so the
    // Mask can tell them from destroyed ones; the selling / using contexts reach the Mask first.
    if (context.selling_card || context.selling_self) { (context.card || card).ability.sold = true; return undefined; }
    if (context.using_consumeable) { if (context.consumeable && !context.consumeable.debuff) context.consumeable.ability.consumable_used = true; return undefined; }
    if (context.any_card_destroyed && pseudorandom('happiest') < G.GAME.probabilities.normal / card.ability.extra
      && G.consumeables.cards.length + G.GAME.consumeable_buffer < G.consumeables.config.card_limit
      && !(context.blueprint_card || card).getting_sliced) {
      G.GAME.consumeable_buffer = G.GAME.consumeable_buffer + 1;
      G.E_MANAGER.add_event(() => {
        const spectral = create_card('Spectral', G.consumeables, null, null, null, null, null, 'happiest');
        spectral.add_to_deck();
        G.consumeables.emplace(spectral);
        G.GAME.consumeable_buffer = 0;
      });
      card_eval_status_text(context.blueprint_card || card, 'extra', null, null, null, { message: localize('k_plus_spectral'), colour: 'Spectral' });
    }
    return undefined;
  },
};

J.benthic = {
  name: 'Benthic Bloom', order: 7, config: {}, rarity: 3, cost: 8, blueprint_compat: true, eternal_compat: true,
  calculate(self, card, context) {
    if (joker_ctx_end(context) && G.GAME.blind.boss && !(context.blueprint_card || card).getting_sliced) {
      const upgradables = [];
      for (const v of G.jokers.cards) {
        const r = v.config.center.rarity;
        if (v !== (context.blueprint_card || card) && !v.getting_sliced && typeof r === 'number' && r <= 3) upgradables.push(v); // (port note: string rarities)
      }
      if (upgradables.length > 0) {
        const [joker] = pseudorandom_element(upgradables, pseudoseed('benthic'));
        const rarity = joker.config.center.rarity;
        joker.getting_sliced = true;
        G.E_MANAGER.add_event(() => {
          (context.blueprint_card || card).juice_up();
          const nw = create_card('Joker', G.jokers, rarity === 3, rarity === 1 ? 0.9 : 1, null, null, null, 'benthic');
          nw.set_edition(joker.edition, true);
          joker.start_dissolve();
          nw.add_to_deck();
          G.jokers.emplace(nw);
        });
        return { message: localize('k_upgrade_ex') };
      }
    }
    return undefined;
  },
};

J.encrusted = {
  name: 'Encrusted Key', order: 8, config: {}, rarity: 1, cost: 5, blueprint_compat: true, eternal_compat: false,
  loc_vars(self, iq) { iq.push({ key: 'tag_coupon', set: 'Tag' }); return { vars: [localize({ type: 'name_text', set: 'Tag', key: 'tag_coupon' })] }; },
  calculate(self, card, context) {
    if (joker_ctx_end(context) && G.GAME.blind.boss && !(context.blueprint_card || card).getting_sliced) {
      if (context.blueprint) { // fix 5: a copy gives one extra Coupon Tag and leaves the Key alone
        G.E_MANAGER.add_event(() => { add_tag(new Tag('tag_coupon')); play_sound('generic1', 0.9, 0.8); play_sound('holo1', 1.2, 0.4); });
        return undefined;
      }
      card.getting_sliced = true;
      G.E_MANAGER.add_event(() => {
        add_tag(new Tag('tag_coupon'));
        play_sound('generic1', 0.9, 0.8);
        play_sound('holo1', 1.2, 0.4);
      });
      break_away(card);
    }
    return undefined;
  },
};

J.executive_card = {
  name: 'Executive Card', order: 11, config: { extra: 6 }, rarity: 2, cost: 6, blueprint_compat: false, eternal_compat: true,
  loc_vars(self, iq, card) {
    const rem = card.ability.executive_remaining ?? card.ability.extra;
    return { vars: [card.ability.extra, localize({ type: 'variable', key: rem === 0 ? 'loyalty_active' : 'loyalty_inactive', vars: [rem] })] };
  },
  set_ability(self, card) { card.ability.executive_remaining = card.ability.extra; },
  calculate(self, card, context) {
    if (context.open_booster && !context.blueprint) { // after the pack is set up (pack_choices already read)
      card.ability.executive_remaining = card.ability.executive_remaining - 1;
      if (card.ability.executive_remaining === 0) {
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_active_ex'), colour: FILTER });
      } else if (card.ability.executive_remaining < 0) {
        card.ability.executive_remaining = card.ability.extra;
      } else {
        card_eval_status_text(card, 'extra', null, null, null, { message: card.ability.executive_remaining + '/' + card.ability.extra, colour: FILTER });
      }
    }
    return undefined;
  },
};

const SLUG_ATLAS = { egocentrism: 'j_egocentrism', eulogy: 'j_eulogy', bungus: 'j_bungus', snake_eyes: 'j_snake_eyes', daisy: 'j_daisy', kjaro: 'j_kjaro', duplicator: 'j_duplicator', happiest_mask: 'j_happiest_mask', benthic: 'j_benthic', encrusted: 'j_encrusted', executive_card: 'j_executive_card' };
const atlases = {};
const centers = [];
for (const [slug, j] of Object.entries(J).sort((a, b) => a[1].order - b[1].order)) {
  const file = SLUG_ATLAS[slug];
  atlases['roj_' + file] = { src: ART + file + '.png', px: 71, py: 95 };
  centers.push({ key: 'j_roj_' + slug, set: 'Joker', pos: { x: 0, y: 0 }, atlas: 'roj_' + file, perishable_compat: true, ...j, order: undefined });
}

// ------------------------------------------------------------------ vouchers
for (const [slug, v] of Object.entries({
  '3d_printer': { name: '3D Printer', order: 1, config: { extra: 1 }, cost: 10 },
  militech_printer: { name: 'Mili-Tech Printer', order: 2, config: { extra: 1 }, cost: 10, requires: ['v_roj_3d_printer'] },
})) {
  atlases['roj_v_' + slug] = { src: ART + 'v_' + slug + '.png', px: 71, py: 95 };
  centers.push({ key: 'v_roj_' + slug, set: 'Voucher', pos: { x: 0, y: 0 }, atlas: 'roj_v_' + slug, available: true,
    loc_vars: (self) => ({ vars: [self.config.extra] }), ...v, order: undefined });
}

// ------------------------------------------------------------------ blinds
const blinds = [
  {
    key: 'bl_roj_loop', name: 'The Loop', dollars: 5, mult: 2, boss: { min: 1, max: 10 }, boss_colour: '#aadeed', debuff: {}, vars: [],
    drawn_to_hand(self, blind) {
      if (G.GAME.current_round.hands_played === 2 && G.jokers.cards[0]) {
        const jokers = [];
        for (const v of G.jokers.cards) { jokers.push(v); v.set_debuff(false); }
        const [card] = pseudorandom_element(jokers, pseudoseed('the_loop'));
        if (card) { card.set_debuff(true); card.juice_up(); blind.wiggle(); }
      }
    },
  },
  { key: 'bl_roj_void', name: 'The Void', dollars: 5, mult: 2, boss: { min: 1, max: 10 }, boss_colour: '#9e52b7', debuff: {}, vars: [] },
  {
    key: 'bl_roj_final_hammer', name: 'Glaucous Hammer', dollars: 8, mult: 2, boss: { showdown: true, min: 10, max: 10 }, boss_colour: '#6082b6', debuff: {}, vars: [1.05],
    set_blind(self, blind) {
      for (const v of G.playing_cards) v.ability.hammered = undefined; // fix 6
      const cards = G.playing_cards.slice();
      cards.sort((a, b) => (!a.playing_card || !b.playing_card ? 0 : a.playing_card - b.playing_card));
      pseudoshuffle(cards, pseudoseed('glaucous'));
      for (let i = 0; i < Math.floor(G.playing_cards.length * 0.5); i++) cards[i].ability.hammered = true;
      for (const v of G.playing_cards) blind.debuff_card(v);
    },
    debuff_card(self, blind, card) { return !!card.ability.hammered; },
  },
  {
    key: 'bl_roj_final_crab', name: 'Tyrian Crab', dollars: 8, mult: 2, boss: { showdown: true, min: 10, max: 10 }, boss_colour: '#cb75e3', debuff: {}, vars: [1.5],
    set_blind(self, blind) { blind.prepped = undefined; },
    press_play(self, blind) { blind.prepped = true; return undefined; },
    drawn_to_hand(self, blind) {
      if (blind.prepped) { ease_required_chips(blind, blind.chips * 1.5); blind.wiggle(); }
    },
    disable(self, blind) { ease_required_chips(blind, get_blind_amount(G.GAME.round_resets.ante) * blind.mult * G.GAME.starting_params.ante_scaling); },
  },
];
for (const b of blinds) {
  const file = 'bl_' + b.key.slice('bl_roj_'.length);
  atlases['roj_' + file] = { src: ART + file + '.png', px: 34, py: 34, frames: 21 };
  b.atlas = 'roj_' + file;
  b.pos = { x: 0, y: 0 };
}
/** RiskofJesters.lua ease_required_chips: the blind's target eases to floor(mod) (the ease's last step). */
function ease_required_chips(blind, mod) {
  blind.chips = Math.floor(mod || 0);
  blind.chip_text = number_format(blind.chips);
  emit('blind', { action: 'chips', key: blind.config.blind && blind.config.blind.key, name: blind.name, chips: blind.chips, chip_text: blind.chip_text });
}

// ------------------------------------------------------------------ hooks
const used = (k) => !!(G.GAME && G.GAME.used_vouchers && G.GAME.used_vouchers[k]);
const hooks = {
  /** RoJ's Card:calculate_joker wrap: a Temporary joker breaks at end of round instead of acting. */
  calculate_joker(card, context) {
    if (card.ability.set === 'Joker' && joker_ctx_end(context) && card.ability.temporary) {
      card.getting_sliced = true;
      break_away(card);
      return { message: localize('k_broken_ex') };
    }
    return undefined;
  },
  /** The Void (fix 3): after the end-of-round pass, every joker's sell value becomes 0. */
  end_round() {
    const b = G.GAME.blind;
    if (!b || b.name !== 'The Void' || b.disabled) return;
    for (const j of G.jokers.cards) {
      if (j.ability.set !== 'Joker' || j.ability.temporary || j.getting_sliced) continue; // (not one already on its way out)
      j.set_cost();
      j.ability.extra_value = (j.ability.extra_value || 0) - j.sell_cost;
      j.set_cost();
      card_eval_status_text(j, 'extra', null, null, null, { message: localize('k_voided_ex') });
    }
    b.wiggle();
  },
  /** Card:add_to_deck wrap -> joker_added (fix 1: not when a debuff lifts). */
  add_to_deck(card, from_debuff) {
    if (from_debuff || card.ability.set !== 'Joker' || card.ability.temporary) return;
    fire({ joker_added: true, added: card }, card);
  },
  /** Card:remove_from_deck wrap -> any_card_destroyed (fix 2: only cards leaving the game). */
  card_removed(card) {
    if (!G.jokers) return;
    const a = card.ability || {};
    const used_up = a.consumable_used || (a.consumeable && !card.area); // use_card lifts a used consumable out first
    const flag = (card.added_to_deck && !used_up && !a.sold) || (G.playing_cards && card.playing_card);
    if (flag) fire({ any_card_destroyed: true, card }, card);
  },
  wheel_failed() { fire({ wheel_failed: true }); },
  copy_card(nw) {
    if (nw.ability.bungus_rounds !== undefined) nw.ability.bungus_rounds = 0;
    else if (nw.ability.enabled) nw.ability.enabled = false;
    else if (nw.ability.executive_remaining !== undefined) nw.ability.executive_remaining = nw.ability.extra;
  },
  set_cost(card) {
    if (card.ability.temporary) card.sell_cost = 0;
    else if (card.ability.eulogyed) {
      card.cost = Math.floor(card.cost * 0.5);
      card.sell_cost = Math.max(1, Math.floor(card.cost / 2)) + (card.ability.extra_value || 0);
    }
  },
  /** create_card_for_shop wrap: Eulogy Zero's roll (the shop's own cards, key_append 'sho'). */
  create_card(card, _type, area, key_append) {
    if (area !== G.shop_jokers || key_append !== 'sho') return;
    const eulogy = find_joker('Eulogy Zero');
    if (eulogy.length > 0 && pseudorandom('eulogy') < G.GAME.probabilities.normal / eulogy[0].ability.extra) card.ability.eulogyed = true;
  },
  /** CardArea:emplace wrap: a Eulogy card lands in the shop face down, at half price. */
  emplace(area, card) {
    if (area === G.shop_jokers && card.ability.eulogyed) { card.flip(); card.set_cost(); }
  },
  pack_size(n) { return used('v_roj_3d_printer') ? n + 1 : n; },
  pack_choices(n) {
    if (used('v_roj_militech_printer')) n = n + 1;
    for (const v of G.jokers.cards) {
      if (v.ability.name === 'Executive Card' && v.ability.executive_remaining === 0) { n = G.GAME.pack_size; break; }
    }
    return n;
  },
  booster_loc_vars(vars) {
    if (!used('v_roj_3d_printer') && !used('v_roj_militech_printer')) return undefined;
    const v = vars.slice();
    if (used('v_roj_3d_printer')) v[1] = v[1] + 1;
    if (used('v_roj_militech_printer')) v[0] = v[0] + 1;
    return v;
  },
  describe(card, desc) {
    if (!card.ability || !card.ability.temporary || !desc) return;
    if (Array.isArray(desc.badges)) desc.badges.push({ key: 'temporary', label: 'Temporary', colour: '#5f7377' });
    const d = LOC.descriptions.Other.temporary;
    (desc.info = desc.info || []).push({ key: 'temporary', name: d.name, lines: d.text.slice() });
  },
  view_card(card, v) {
    if (card.ability && card.ability.temporary) v.stickers = [...(v.stickers || []), 'temporary'];
  },
};

// ------------------------------------------------------------------ localization (en)
const LOC = {
  descriptions: {
    Joker: {
      j_roj_egocentrism: { name: 'Egocentrism', text: ['{C:chips}+#1#{} Chips for each', '{C:attention}Egocentrism{}. Convert a', 'random {C:attention}Joker{} into {C:attention}Egocentrism', 'when {C:attention}Blind{} is selected', '{C:inactive}(Currently {C:chips}+#2#{C:inactive} Chips)'] },
      j_roj_eulogy: { name: 'Eulogy Zero', text: ['{C:attention}Shop{} cards have {C:green}#1# in #2#', 'chance of being {C:attention}half', '{C:attention}price{} and {C:attention}flipped'] },
      j_roj_snake_eyes: { name: 'Snake Eyes', text: ['Gains {C:mult}+#1#{} Mult if', '{C:tarot}The Wheel of Fortune{} fails', '{C:inactive}(Currently {C:red}+#2#{C:inactive} Mult)'] },
      j_roj_bungus: { name: 'Bustling Fungus', text: ['After {C:attention}#1#{} rounds, add', '{C:dark_edition}Foil{} to base edition', 'Jokers on both sides', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      j_roj_benthic: { name: 'Benthic Bloom', text: ['Upgrade {C:attention}1{} random {C:attention}Joker{}', 'into {C:attention}Joker{} of the next', '{C:attention}higher rarity{} when', '{C:attention}Boss Blind{} is defeated'] },
      j_roj_encrusted: { name: 'Encrusted Key', text: ['After defeating the', '{C:attention}Boss Blind{}, this card', 'is destroyed and gain', 'a {C:attention}#1#'] },
      j_roj_kjaro: { name: "Kjaro's Band", text: ['{X:mult,C:white} X#1# {} Mult if Chips', 'scored in last round', 'were more than {C:attention}X#2#', 'of required Chips'] },
      j_roj_daisy: { name: 'Lepton Daisy', text: ['{C:chips}+#1#{} Chips for each', '{C:attention}debuffed{} card', 'in played hand'] },
      j_roj_duplicator: { name: 'Substandard Duplicator', text: ['When gain a {C:attention}Joker{},', 'create a {C:dark_edition}Negative', '{C:dark_edition}Temporary{} copy of it'] },
      j_roj_happiest_mask: { name: 'Happiest Mask', text: ['{C:green}#1# in #2#{} chance to create', 'a random {C:spectral}Spectral{} card', 'when any card is destroyed', '{C:inactive}(Must have room)'] },
      j_roj_executive_card: { name: 'Executive Card', text: ['After opening', '{C:attention}#1# Booster Packs{},', 'can choose all cards', 'from next one', '{C:inactive}#2#'] },
    },
    Blind: {
      bl_roj_loop: { name: 'The Loop', text: ['Random Joker disabled', 'after playing 2 hands'] },
      bl_roj_void: { name: 'The Void', text: ["Set all Jokers' sell", 'value to 0 when defeated'] },
      bl_roj_final_hammer: { name: 'Glaucous Hammer', text: ['Start with random half', 'of the deck debuffed'] },
      bl_roj_final_crab: { name: 'Tyrian Crab', text: ['X1.5 required Chips', 'after each hand played'] },
    },
    Voucher: {
      v_roj_3d_printer: { name: '3D Printer', text: ['All {C:attention}Booster Packs', 'have {C:attention}1{} more option'] },
      v_roj_militech_printer: { name: 'Mili-Tech Printer', text: ['Can choose {C:attention}1{} more', 'card from all', '{C:attention}Booster Packs'] },
    },
    Other: {
      temporary: { name: 'Temporary', text: ['Gets destroyed at', 'end of round and', 'has no sell value'] },
    },
  },
  misc: {
    dictionary: { k_broken_ex: 'Broken!', k_converted_ex: 'Converted!', k_voided_ex: 'Voided!', ph_kjaro_disabled: 'not enough chips' },
    labels: { temporary: 'Temporary' },
  },
};

export const RISKOFJESTERS = registerMod({
  id: MOD_ID,
  name: 'Risk of Jesters',
  prefix: 'roj',
  version: '1.0.0',
  by: 'DVRP (rebuilt for Micatro)',
  badge_colour: '#6d60ab',
  description: 'Risk of Rain-themed jokers, vouchers (3D/Mili-Tech Printers) and blinds, in a vanilla style.',
  content: {
    centers,
    blinds,
    stickers: [{ key: 'temporary', badge_colour: '#5f7377', label: 'Temporary' }],
    atlases,
    loc: LOC,
  },
  hooks,
});

export const STATUS = { jokers: centers.filter((c) => c.set === 'Joker').map((c) => c.key), vouchers: centers.filter((c) => c.set === 'Voucher').map((c) => c.key), blinds: blinds.map((b) => b.key), active: () => isActive(MOD_ID) };
