// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0459_snover.lua: Snover, Abomasnow, Mega Abomasnow (new in 1.7.9).
// Snover: scored Glass cards earn $2; the first Glass card that breaks each round turns a random unenhanced deck card into Glass
// ("Ice Shard!"); evolves with 1/8 of the deck Glass. Abomasnow: $3, and EVERY broken Glass card turns one unenhanced deck card
// into Foil Glass; has a Mega. Mega Abomasnow (Water): each broken Glass card earns $20.
import { G, P_CENTERS, localize, card_eval_status_text, pseudorandom_element, pseudoshuffle, pseudoseed, defineNacho, type_tooltip, detailed, deck_enhance_evo, ease_poke_dollars, poke_convert_cards_to } from '../api.js';
import { con, utils } from '../dip.js';

const FILE = 'src/pokemon/0459_snover.lua';

const glass_tip = (info_queue) => { if (detailed()) info_queue.push(P_CENTERS.m_glass); };
const shattered = (context) => utils.filter(context.removed || [], (v) => v.shattered).length;
const ice_shard = (card) => card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_ice_shard_ex') });
function glass_dollars(card, context, seed) {
  if (context.individual && context.cardarea === G.play && con.is_glass(context.other_card)) {
    return { dollars: ease_poke_dollars(card, seed, card.ability.extra.money_mod, true), card };
  }
  return undefined;
}

defineNacho({
  // Snover 459
  snover: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      glass_tip(info_queue);
      let deck_data = '';
      if (G.playing_cards) {
        const n = G.playing_cards.filter((v) => con.is_glass(v)).length;
        deck_data = '[' + n + '/' + Math.ceil(G.playing_cards.length / 8) + '] ';
      }
      return { vars: [card.ability.extra.money_mod, deck_data] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.remove_playing_cards && !a.triggered && shattered(context) > 0) {
        const target = pseudorandom_element(utils.filter(G.deck.cards, con.is_base), pseudoseed('snover'))[0];
        if (target) poke_convert_cards_to(target, { mod_conv: 'm_glass' }, true, true);
        ice_shard(card);
        a.triggered = true;
      }
      const r = glass_dollars(card, context, 'snover');
      if (r) return r;
      if (context.end_of_round) a.triggered = false;
      return deck_enhance_evo(self, card, context, 'j_nacho_abomasnow', 'Glass', 0.125);
    },
  },
  // Abomasnow 460
  abomasnow: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tip(info_queue); return { vars: [card.ability.extra.money_mod] }; },
    calculate(self, card, context) {
      if (context.remove_playing_cards) {
        const n = shattered(context);
        if (n > 0) {
          const viable = utils.filter(G.deck.cards, con.is_base);
          pseudoshuffle(viable, pseudoseed('abomasnow'));
          const targets = viable.slice(0, n);
          if (targets.length) poke_convert_cards_to(targets, { mod_conv: 'm_glass', edition: 'e_foil' }, true, true);
          ice_shard(card);
        }
      }
      return glass_dollars(card, context, 'snover');
    },
  },
  // Mega Abomasnow 460-1
  mega_abomasnow: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); glass_tip(info_queue); return { vars: [card.ability.extra.money_mod] }; },
    calculate(self, card, context) {
      if (context.remove_playing_cards) {
        const n = shattered(context);
        if (n > 0) return { dollars: ease_poke_dollars(card, 'snover', card.ability.extra.money_mod * n, true), card };
      }
      return undefined;
    },
  },
}, FILE);
