// Þe Autumn Circus — BasicOddities.lua: 28 Oddities (AMM's consumable type; rarity 1-4) + Ritual Page (More Fluff
// cross-mod: only while morefluff is on too). Line-for-line ports; the numbers are data.js's (the mod's own).
// Skipped: the 25 Oddities that need mods Micatro doesn't ship (Ortalab: Pouch of Sand, Bag of Stardust, Lost
// Envelope, Stareater; Cryptid: Flashlight, Abstract Oddity, Glimmer Beyond, Bizarre Shard; Entropy: Corrupting
// Shard, Sack of Meat, Immaculate Prism, Fading Shadow, Viscera, Yellow Amulet, Experience Splitter; Revo's Vault:
// Pot of Honey; GrabBag: Bottle of Water, Groundwater; Aikoyori: Bag of Bricks, Charred Pouch; pta_saka: Unstable
// Concoction, Vial of Plasma; multi-mod: Gift of the Witch, Gift of the Lord, Chaos Harness) and the commented-out
// ones (Silica Packet, Narwhal Horn, Vote Sticker, CPU Memory, the enhancement potions).
//
// Port notes (Micatro equivalents, not behaviour changes):
//  - SMODS evaluates consumables like jokers in every context; Micatro's scoring loops give consumables joker_main
//    and end_of_round but not `after` / `repetition`, so the Oddities that use them get those here: `after` from the
//    hand_scored hook (the end of the hand, after the jokers' after), Energy Potion's retriggers through the
//    card_repetitions hook (every playing-card repetition check, as SMODS asks the consumable area).
//  - The Jollars' update() (sell value = face value, every frame) is the set_cost hook (sell_cost after each set_cost).
import {
  G, P_CENTERS, P_CARDS, P_CENTER_POOLS, Card, enhancement_pool, create_card, create_playing_card, poll_edition, pseudorandom, pseudoseed,
  pseudorandom_element, pseudoshuffle, card_eval_status_text, localize, juice_card, play_sound, ease_dollars, ease_hands_played,
  get_next_voucher_key,
} from '../../js/engine/core.js';
import { isActive } from '../../js/mods/registry.js';
import { juice_card_until, playing_card_joker_effects } from '../../js/engine/jokers.js';
import { AMM, consumable, poll_seal, force_draw_cards, change_base, RANKS } from './util.js';

const odd = (key, def) => consumable(key, { set: 'Oddity', ...def });
const Gstate = (s) => G.STATE === G.STATES[s];
const ext = (card) => card.ability.extra;

// ------------------------------------------------------------------ shared
/** money_function: earn the Jollar's face value (instantly, in an event). */
const money_use = (self, card) => { G.E_MANAGER.add_event(() => { play_sound('timpani'); juice_card(card); ease_dollars(Math.max(0, ext(card).dollars), true); }); };
const jollar = (key) => odd(key, {
  loc_vars: (s, iq, card) => ({ vars: [ext(card).dollars] }),
  use: money_use,
  can_use: () => true,
  // (only in packs: Steamodded opens every pack, base or mod, in SMODS_BOOSTER_OPENED)
  in_pool: () => ['MOD_PACK', 'MOD_PACK_HAND', 'TAROT_PACK', 'PLANET_PACK', 'SPECTRAL_PACK', 'STANDARD_PACK', 'BUFFOON_PACK'].some(Gstate),
  jollar: true,
});
/** chip_function: each selected card permanently gains +chips; then the hand is unselected. */
const chip_use = (self, card, area, copier) => {
  const used = copier || card;
  G.E_MANAGER.add_event(() => { play_sound('tarot1'); juice_card(used); });
  for (const c of G.hand.cards) {
    if (c.highlighted) {
      c.ability.perma_bonus = (c.ability.perma_bonus || 0) + ext(card).chips;
      G.E_MANAGER.add_event(() => { card_eval_status_text(c, 'extra', null, null, null, { message: localize('k_upgrade_ex'), colour: 'MULT' }); });
    }
  }
  G.E_MANAGER.add_event(() => { G.hand.unhighlight_all(); });
};
const chip = (key) => odd(key, { loc_vars: (s, iq, card) => ({ vars: [card.ability.max_highlighted, ext(card).chips] }), use: chip_use });
/** activate_oddity: ACTIVE! until it self-destructs. */
const activate = (self, card) => {
  ext(card).active = true;
  card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_thac_active'), colour: 'ORANGE' });
  juice_card_until(card, (v) => v.ability.extra.active === true, true);
};
const can_activate = (self, card) => Gstate('SELECTING_HAND') && !ext(card).active;
/** "Create N cards of an enhancement in your hand" (Box of Rocks / Calcium / Trick Deck). */
function make_hand_cards(card, pick, seed) {
  const cards = [];
  for (let i = 0; i < ext(card).cards; i++) {
    const cm = create_playing_card({ center: pick() }, G.hand);
    cm.set_edition(poll_edition(seed));
    cm.set_seal(poll_seal({ key: seed, mod: 10 }));
    cards.push(cm);
  }
  playing_card_joker_effects(cards);
}
/** graveyarder(card, enhancement, pseed): N cards of the enhancement straight into the graveyard. */
function graveyarder(card, enhancement, pseed) {
  for (let i = 0; i < ext(card).cards; i++) {
    const cm = create_playing_card({ center: P_CENTERS[enhancement] }, G.deck);
    cm.set_edition(poll_edition(pseed), true, true);
    cm.set_seal(poll_seal({ key: pseed, mod: 10 }), true, true);
    AMM.move_to_graveyard(cm);
  }
}
const self_destruct_after = (card, context) => {
  if (context.after && !context.blueprint) G.E_MANAGER.add_event(() => { card.start_dissolve(); });
};

export const centers = [
  jollar('one_jollar'), jollar('two_jollar'), jollar('five_jollar'), jollar('ten_jollar'), jollar('twenty_jollar'),
  chip('green_chip'), chip('yellow_chip'), chip('red_blue_chip'), chip('purple_chip'), chip('power_chip'),
  odd('pot_of_joker', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).cards] }),
    use(self, card) { force_draw_cards(ext(card).cards); },
    can_use: () => G.hand.cards.length > 1 && G.deck.cards.length > 1,
  }),
  odd('jimbobread_man', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).hands] }),
    keep_on_use: () => true,
    use(self, card, area, copier) {
      const used = copier || card;
      if (!copier) {
        G.E_MANAGER.add_event(() => {
          play_sound('cardFan2');
          juice_card(used);
          card.set_ability(P_CENTERS.c_thac_jimbobread_man_half);
          ease_hands_played(ext(card).hands);
        });
      }
    },
    can_use: () => Gstate('SELECTING_HAND'),
  }),
  odd('jimbobread_man_half', {
    in_pool: () => false,
    loc_vars: (s, iq, card) => ({ vars: [ext(card).hands] }),
    use(self, card) { ease_hands_played(ext(card).hands); },
    can_use: () => Gstate('SELECTING_HAND'),
  }),
  odd('cultist_potion', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).Xmult, ext(card).Xmult_curr] }),
    use(self, card) {
      ext(card).active = true;
      card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_thac_cawcaw'), colour: 'BLUE' });
      juice_card_until(card, (v) => v.ability.extra.active === true, true);
    },
    can_use: can_activate,
    keep_on_use: () => true,
    calculate(self, card, context) {
      if (!ext(card).active) return undefined;
      if (context.joker_main) {
        if (!context.blueprint) ext(card).Xmult_curr = ext(card).Xmult_curr + ext(card).Xmult;
        if (ext(card).Xmult_curr < 1) return undefined;
        return { xmult: ext(card).Xmult_curr };
      }
      if (context.end_of_round && context.main_eval && !context.blueprint) card.start_dissolve();
      return undefined;
    },
  }),
  odd('fire_potion', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).mult] }),
    use: activate, can_use: can_activate, keep_on_use: () => true,
    calculate(self, card, context) {
      if (!ext(card).active) return undefined;
      if (context.joker_main) return { mult: ext(card).mult };
      self_destruct_after(card, context);
      return undefined;
    },
  }),
  odd('snecko_potion', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).cards] }),
    use(self, card, area, copier) {
      const used = copier || card;
      force_draw_cards(ext(card).cards);
      G.E_MANAGER.add_event(() => {
        G.E_MANAGER.add_event(() => { play_sound('tarot1'); juice_card(used); });
        for (let i = 0; i < G.hand.cards.length; i++) G.E_MANAGER.add_event(() => { const c = G.hand.cards[i]; if (c) c.flip(); });
        for (let i = 0; i < G.hand.cards.length; i++) {
          G.E_MANAGER.add_event(() => {
            const c = G.hand.cards[i];
            if (c) change_base(c, null, pseudorandom_element(RANKS, pseudoseed('snecko'))[0]);
          });
        }
        for (let i = 0; i < G.hand.cards.length; i++) G.E_MANAGER.add_event(() => { const c = G.hand.cards[i]; if (c) c.flip(); });
      });
    },
    can_use: () => G.hand.cards.length > 1 && G.deck.cards.length > 1,
  }),
  odd('energy_potion', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).retriggers, ext(card).retriggers === 1 ? '' : 's'] }),
    use: activate, can_use: can_activate, keep_on_use: () => true,
    calculate(self, card, context) {
      if (!ext(card).active) return undefined;
      if (context.repetition) return { repetitions: ext(card).retriggers, message: localize('k_again_ex'), colour: 'ORANGE', card };
      self_destruct_after(card, context);
      return undefined;
    },
  }),
  odd('estradiol', {
    loc_vars: () => ({ vars: [] }),
    use(self, card) {
      if (G.hand.cards.length > 1) for (const c of G.hand.cards.slice()) G.E_MANAGER.add_event(() => c.flip());
      for (let i = 0; i < G.playing_cards.length; i++) {
        G.E_MANAGER.add_event(() => {
          const c = G.playing_cards[i];
          if (c && ext(card).targets.includes(c.base.value)) change_base(c, null, ext(card).effect);
        });
      }
      if (G.hand.cards.length > 1) for (const c of G.hand.cards.slice()) G.E_MANAGER.add_event(() => c.flip());
    },
    can_use: () => true,
  }),
  odd('faded_voucher', {
    loc_vars: (s, iq, card) => ({ vars: [ext(card).vouchers === 1 ? 'a' : Math.floor(ext(card).vouchers), ext(card).vouchers === 1 ? '' : 's'] }),
    use() {
      const voucher_key = get_next_voucher_key(true);
      const nc = create_card('Voucher', G.play, null, null, null, null, voucher_key);
      nc.cost = 0;
      nc.from_tag = true;
      nc.redeem();
      G.E_MANAGER.add_event(() => { if (nc.area) nc.area.remove_card(nc); nc.start_dissolve(); });
    },
    can_use: () => true,
  }),
  odd('empty_bottle', {
    loc_vars(s, iq) { iq.push({ key: 'bottle', set: 'Other' }); return { vars: [s.config.max_highlighted] }; },
    use() {
      const sel = G.hand.highlighted[0];
      sel.bottle = true;
      juice_card(sel);
    },
    can_use: () => G.hand.highlighted.length === 1 && !G.hand.highlighted[0].bottle,
  }),
  odd('trick_deck', {
    loc_vars(s, iq, card) {
      for (const k of trick_centers()) iq.push(P_CENTERS[k]);
      return { vars: [ext(card).cards] };
    },
    use(self, card) { make_hand_cards(card, () => P_CENTERS[pseudorandom_element(trick_centers(), pseudoseed('trick_deck'))[0]], 'trick_deck'); },
    can_use: () => G.hand.cards.length > 1,
  }),
  odd('box_of_rocks', {
    loc_vars(s, iq, card) { iq.push(P_CENTERS.m_stone); return { vars: [ext(card).cards] }; },
    use(self, card) { make_hand_cards(card, () => P_CENTERS.m_stone, 'box_of_rocks'); },
    can_use: () => G.hand.cards.length > 1,
  }),
  odd('calcium', {
    loc_vars(s, iq, card) { iq.push(P_CENTERS.m_thac_bone); return { vars: [ext(card).cards] }; },
    use(self, card) { make_hand_cards(card, () => P_CENTERS.m_thac_bone, 'calcium'); },
    can_use: () => G.hand.cards.length > 1,
  }),
  odd('scrap_metal', {
    loc_vars(s, iq, card) {
      iq.push(P_CENTERS.m_steel, P_CENTERS.m_gold);
      if (isActive('morefluff') && P_CENTERS.m_mf_brass) iq.push(P_CENTERS.m_mf_brass);
      iq.push({ key: 'graveyard', set: 'Other' });
      return { vars: [ext(card).cards] };
    },
    use(self, card) {
      for (let i = 0; i < ext(card).cards; i++) {
        const centers = [P_CENTERS.m_steel, P_CENTERS.m_gold];
        if (isActive('morefluff') && P_CENTERS.m_mf_brass) centers.push(P_CENTERS.m_mf_brass);
        const cm = create_playing_card({ center: pseudorandom_element(centers, pseudoseed('scrap_metal'))[0] }, G.deck);
        cm.set_edition(poll_edition('scrap_metal'), true, true);
        cm.set_seal(poll_seal({ key: 'scrap_metal', mod: 10 }), true, true);
        AMM.move_to_graveyard(cm);
      }
    },
    can_use: () => true,
  }),
  odd('fossil', {
    loc_vars(s, iq, card) { iq.push(P_CENTERS[ext(card).enh]); return { vars: [ext(card).cards] }; },
    use(self, card) { graveyarder(card, ext(card).enh, self.key); },
    can_use: () => true,
  }),
  odd('ritual_page', {
    loc_vars(s, iq, card) { iq.push(P_CENTERS[ext(card).enh]); iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [ext(card).cards] }; },
    use(self, card) { graveyarder(card, ext(card).enh, self.key); },
    can_use: () => true,
  }),
  odd('gift_of_the_knight', {
    loc_vars(s, iq, card) { iq.push(P_CENTERS.e_polychrome); iq.push({ key: 'thac_heart_aspect', set: 'Aspect' }); return { vars: [ext(card).cards] }; },
    use() {
      let enhancement = P_CENTERS.c_base;
      if (pseudorandom(pseudoseed('gift_of_the_knight')) < 0.5) enhancement = pseudorandom_element(enhancement_pool())[0];
      const cm = create_playing_card({ front: P_CARDS.H_3, center: enhancement }, G.hand);
      cm.set_edition({ polychrome: true });
      cm.set_seal(poll_seal({ key: 'gift_of_the_knight', mod: 10 }));
      AMM.set_aspect(cm, 'thac_heart');
      playing_card_joker_effects([cm]);
    },
    can_use: () => G.hand.cards.length > 1,
  }),
  odd('dance_with_the_dead', {
    loc_vars(s, iq) { iq.push({ key: 'graveyard', set: 'Other' }); return { vars: [] }; },
    use() {
      const rember = G.hand.cards.length;
      for (let i = G.hand.cards.length - 1; i >= 0; i--) {
        const c = G.hand.cards[i];
        G.E_MANAGER.add_event(() => { AMM.move_to_graveyard(c); });
      }
      G.E_MANAGER.add_event(() => {
        const gy_ = G.graveyard.slice();
        pseudoshuffle(gy_, pseudoseed('dance_with_the_dead'));
        for (let i = Math.min(gy_.length, rember) - 1; i >= 0; i--) {
          const c = gy_[i];
          G.E_MANAGER.add_event(() => { AMM.move_from_graveyard(c); });
        }
      });
    },
    can_use: () => G.hand.cards.length > 1,
  }),
  odd('memorial_ticket', {
    loc_vars(s, iq, card) {
      iq.push({ key: 'graveyard', set: 'Other' });
      return { vars: [ext(card).dollars, ext(card).max_dollars, Math.min(ext(card).max_dollars, ext(card).dollars * AMM.GRAVEYARD.count_cards())] };
    },
    use(self, card) {
      G.E_MANAGER.add_event(() => {
        play_sound('timpani');
        juice_card(card);
        ease_dollars(Math.max(0, Math.min(ext(card).max_dollars, ext(card).dollars * AMM.GRAVEYARD.count_cards())), true);
      });
    },
    can_use: () => true,
  }),
].filter(Boolean);

/** Trick Deck's non-material enhancements (+ More Fluff's when it's on). */
function trick_centers() {
  const c = ['m_bonus', 'm_mult', 'm_wild', 'm_lucky'];
  if (isActive('morefluff')) for (const k of ['m_mf_monus', 'm_mf_cult', 'm_mf_styled', 'm_mf_teal']) if (P_CENTERS[k]) c.push(k);
  c.push('m_thac_star', 'm_thac_soulbound');
  return c;
}

const oddities_owned = () => (G.consumeables ? G.consumeables.cards.filter((c) => c.config.center.mod === 'autumncircus' && c.ability.set === 'Oddity' && c.config.center.calculate && !c.debuff) : []);
export const hooks = {
  /** SMODS's `after` context for the Oddities in the consumable slots (Fire / Energy Potion self-destruct). */
  hand_scored(chips, mult, ctx) {
    for (const c of oddities_owned()) c.calculate_joker({ cardarea: G.consumeables, ...ctx, after: true });
  },
  /** SMODS asks the consumable area for playing-card repetitions too (an ACTIVE Energy Potion). */
  card_repetitions(card, context) {
    const out = [];
    for (const c of oddities_owned()) {
      const r = c.calculate_joker({ ...context, other_card: card, repetition: true, cardarea: context.cardarea });
      if (r && r.repetitions) out.push({ ...r, card: c });
    }
    return out.length ? out : undefined;
  },
  /** money_update: a Jollar sells for its face value. */
  set_cost(card) {
    const c = card.config.center;
    if (c.jollar && c.mod === 'autumncircus' && card.ability.extra) card.sell_cost = card.ability.extra.dollars;
  },
};
