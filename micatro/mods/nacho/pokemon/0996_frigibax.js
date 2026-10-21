// Nacho's Pokermon Dip 1.7.9 — src/pokemon/0996_frigibax.lua: Frigibax, Arctibax, Baxcalibur, Mega Baxcalibur (new in 1.7.9).
// Thermal Exchange: the first (Arctibax: two) scoring cards that give Mult become Foil, under PkmnDip.RNG_protect (Foil polls
// of Lucky cards must not move the RNG); a Five of a Kind turns the held cards Foil. Frigibax evolves with 9 Foil cards in the
// deck, Arctibax with 18. Baxcalibur: every scoring card with Mult becomes Foil; in a Five of a Kind scoring cards give
// X(1 + 0.03 x Foil cards in the deck); has a Mega. Mega Baxcalibur: scoring Foil cards give X(1 + 0.05 x Foil cards), but it
// faints for the hand (debuffed) when no scoring card gives Mult. (1.7.9-5, commit 904ae39: Mega Baxcalibur no longer lists
// itself as a Mega — a Mega Stone reverts it.) A card's "Mult": Card:get_chip_mult + get_chip_h_mult (PkmnDip.calc.get_mult;
// a Lucky card rolls its 1 in 5 there — hence the RNG protection).
import { G, P_CENTERS, play_sound, defineNacho, type_tooltip, main_eval } from '../api.js';
import { calc, con, defer, edition_evo, faint, RNG_protect } from '../dip.js';

const FILE = 'src/pokemon/0996_frigibax.lua';

const set_foil = (c) => c.set_edition({ foil: true }, true, true);
const foil_sound = () => { const f = P_CENTERS.e_foil && P_CENTERS.e_foil.sound; if (f) play_sound(f.sound || f, f.per, f.vol); };
const has_mult = (c) => calc.get_mult(c) > 0;
function thermal_exchange(cards, n) {
  for (const c of cards) if (has_mult(c) && n > 0) { set_foil(c); n = n - 1; }
  if (n === 0) defer(foil_sound);
}
const foils = () => (G.playing_cards ? G.playing_cards.filter((c) => con.is_foil(c)).length : 0);
const deck_data = (card) => (G.playing_cards ? '[' + foils() + '/' + card.ability.evo_rqmt + '] ' : card.ability.evo_rqmt + ' ');
function young(card, context, n) {
  if (context.before) {
    if (context.scoring_name === 'Five of a Kind') { for (const c of G.hand.cards) set_foil(c); defer(foil_sound); }
    RNG_protect(() => thermal_exchange(context.scoring_hand, n));
  }
}

defineNacho({
  // Frigibax 996
  frigibax: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [deck_data(card)] }; },
    calculate(self, card, context) {
      young(card, context, 1);
      return edition_evo(self, card, context, 'j_nacho_arctibax', 'foil', null, card.ability.evo_rqmt);
    },
  },
  // Arctibax 997
  arctibax: {
    loc_vars(self, info_queue, card) { type_tooltip(self, info_queue, card); return { vars: [deck_data(card)] }; },
    calculate(self, card, context) {
      young(card, context, 2);
      return edition_evo(self, card, context, 'j_nacho_baxcalibur', 'foil', null, card.ability.evo_rqmt);
    },
  },
  // Baxcalibur 998
  baxcalibur: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.Xmult_multi, 1 + a.Xmult_multi * foils()] };
    },
    calculate(self, card, context) {
      if (context.before && main_eval(context) && !context.blueprint) {
        RNG_protect(() => { for (const c of context.scoring_hand) thermal_exchange([c], 1); });
      }
      if (context.individual && context.cardarea === G.play && context.scoring_name === 'Five of a Kind') {
        return { Xmult: 1 + card.ability.extra.Xmult_multi * foils() };
      }
      return undefined;
    },
  },
  // Mega Baxcalibur 998-1
  mega_baxcalibur: {
    loc_vars(self, info_queue, card) {
      type_tooltip(self, info_queue, card);
      const a = card.ability.extra;
      return { vars: [a.Xmult_multi, 1 + a.Xmult_multi * foils()] };
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.before && main_eval(context)) {
        RNG_protect(() => {
          if (context.scoring_hand.some((c) => calc.get_mult(c) > 0)) return;
          a.no_score = true;
          faint(card);
        });
      }
      if (context.individual && context.cardarea === G.play && !a.no_score && con.is_foil(context.other_card)) {
        return { Xmult: 1 + a.Xmult_multi * foils() };
      }
      if (context.after && !context.blueprint) a.no_score = undefined;
      return undefined;
    },
  },
}, FILE);
