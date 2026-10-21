// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0692_clauncher.lua: Clauncher, Clawitzer.
// 1.7.9: ON by default (config.lua clauncher = true; 1.6.4 shipped it off). Clauncher retriggers the first played and the
// first held card of each edition (played and held counted apart; reset after the hand and at each blind); Clawitzer every
// editioned card. In the pool while a deck card has any edition (1.6.4: Foil / Holo / Polychrome only).
import { G, P_CENTERS, defineNacho, type_tooltip, detailed, level_evo } from '../api.js';
import { con } from '../dip.js';

const FILE = 'src/pokemon/0692_clauncher.lua';

const not_edition = (card, e) => !card.edition || !card.edition[e];
function edition_tips(info_queue, card) {
  if (!detailed()) return;
  if (not_edition(card, 'polychrome')) info_queue.push(P_CENTERS.e_polychrome);
  if (not_edition(card, 'foil')) info_queue.push(P_CENTERS.e_foil);
  if (not_edition(card, 'holo')) info_queue.push(P_CENTERS.e_holo);
}
const in_pool = () => !!(G.playing_cards && G.playing_cards.some((p) => p.edition));
const edition_key = (e) => e.key || (e.type ? 'e_' + e.type : undefined);
/** (Lua `played_editions = {}` survives the data export as a list: an object keyed by edition here.) */
const table = (a, k) => { if (!a[k] || Array.isArray(a[k]) || typeof a[k] !== 'object') a[k] = {}; return a[k]; };

defineNacho({
  // Clauncher 692 (4 rounds to evolve)
  clauncher: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); edition_tips(info_queue, card); return { vars: [card.ability.extra.rounds] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (con.has_repeat_effect(context) && con.played_or_held(context) && context.other_card.edition) {
        const k = edition_key(context.other_card.edition);
        if (context.cardarea === G.play && !table(a, 'played_editions')[k]) {
          a.played_editions[k] = true;
          return { repetitions: a.retriggers };
        }
        if (context.cardarea === G.hand && !table(a, 'held_editions')[k]) {
          a.held_editions[k] = true;
          return { repetitions: a.retriggers };
        }
      }
      if ((context.joker_main || context.setting_blind) && !context.blueprint) {
        a.played_editions = {};
        a.held_editions = {};
      }
      return level_evo(self, card, context, 'j_nacho_clawitzer');
    },
    in_pool,
  },
  // Clawitzer 693
  clawitzer: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); edition_tips(info_queue, card); return { vars: [] }; },
    calculate(self, card, context) {
      if (con.has_repeat_effect(context) && con.played_or_held(context) && context.other_card.edition) return { repetitions: card.ability.extra.retriggers };
      return undefined;
    },
    in_pool,
  },
}, FILE);
