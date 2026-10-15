// Pokermon 3.2.1 — consumables/mart2.lua. PARTIAL: Moon Stone and Thunder Stone (the
// evolution items pokejokers_01 needs). Still unported: sunstone, waterstone, leafstone,
// firestone, linkcable, leftovers, leek, thickclub, teraorb, metalcoat, dragonscale,
// kingsrock, upgrade, dubious_disc, icestone, shinystone, twisted_spoon.
import {
  G, P_CENTERS, P_CARDS_LIST, localize, attention_text, play_sound, level_up_hand, update_hand_text,
  pseudorandom_element, pseudoseed, create_playing_card, playing_card_joker_effects, get_poker_hand_info,
  defineConsumables, set_spoon_item, is_evo_item_for, evo_item_use_total, highlighted_evo_item,
  pseudorandom_probability, get_probability_vars, poke_unhighlight_cards, poke_remove_card,
} from '../api.js';

const FILE = 'consumables/mart2.lua';
const joker_target_ok = (self) => G.jokers.highlighted && G.jokers.highlighted.length === 1 && is_evo_item_for(self, G.jokers.highlighted[0]);
const PACKS = () => [G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.PLANET_PACK, G.STATES.STANDARD_PACK];

defineConsumables({
  // Moon Stone: 1 in 2 to level up the highlighted hand's poker hand; evolves (e.g. Nidorina).
  moonstone: {
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'eitem' });
      let handtext = localize('poke_none');
      if (G.hand && G.hand.highlighted && G.hand.highlighted.length > 0) {
        handtext = localize(get_poker_hand_info(G.hand.highlighted).text, 'poker_hands') || localize('poke_none');
        if (G.hand.highlighted.some((v) => v.facing === 'back')) handtext = '????';
      }
      const [num, dem] = get_probability_vars(center, self.config.num, self.config.dem, 'moonstone');
      return { vars: [handtext, num, dem] };
    },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length >= self.config.min_highlighted);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted.length >= self.config.min_highlighted) {
        if (pseudorandom_probability(card, 'moonstone', self.config.num, self.config.dem, 'moonstone')) {
          const { text, disp_text } = get_poker_hand_info(G.hand.highlighted);
          level_up_hand(card, text);
          if (PACKS().includes(G.STATE)) update_hand_text({ nopulse: true, delay: 0.3 }, { mult: 0, chips: 0, level: '', handname: '' });
          else update_hand_text({ delay: 0.3 }, { handname: disp_text, level: G.GAME.hands[text].level, mult: G.GAME.hands[text].mult, chips: G.GAME.hands[text].chips });
        } else {
          G.E_MANAGER.add_event(() => { attention_text(localize('k_nope_ex')); play_sound('tarot2', 1, 0.4); card.juice_up(0.3, 0.5); });
        }
        poke_unhighlight_cards();
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },
  // Thunder Stone: destroy 1 selected card, add 2 Gold cards of its rank (hand + deck); evolves Pikachu.
  thunderstone: {
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'eitem' }); return { vars: [self.config.max_highlighted] }; },
    can_use(self, card) {
      if (joker_target_ok(self)) return true;
      return !!(G.hand.highlighted && G.hand.highlighted.length === 1);
    },
    use(self, card, area, copier) {
      set_spoon_item(card);
      if (G.hand.highlighted && G.hand.highlighted.length === 1) {
        const selected = G.hand.highlighted[0];
        const poss_cards = Object.values(P_CARDS_LIST()).filter((v) => v.value === selected.base.value);
        const cards_added = [];
        for (let i = 1; i <= 2; i++) {
          const to = i === 1 ? G.hand : G.deck;
          cards_added.push(create_playing_card({ front: pseudorandom_element(poss_cards, pseudoseed('thunderstone'))[0], center: P_CENTERS.m_gold }, to));
        }
        playing_card_joker_effects(cards_added);
        poke_remove_card(selected, card);
        evo_item_use_total(self, card, area, copier);
      } else {
        highlighted_evo_item(self, card, area, copier);
      }
    },
    in_pool() { return true; },
  },
}, FILE);
