// Pokermon+ 1.2.0 — src/pokemon/774_minior_line.lua: Minior (new).
// Shields up: X1.25 Mult for the first 2 hands of a Blind. Then the shell breaks (it stays broken for the Blind): its Core —
// one random enhancement rolled when it is made (Mult / Wild / Gold / Lucky / Glass / Bonus / Steel) — shows, and every
// Stone card is also that enhancement (a Steamodded quantum enhancement). At the cash out the shields come back up.
// The floating sprite is the shell or the Core's cell on Pokermon's Gen 7 sheet (index.js view_card, set_sprites).
// Micatro shapes: G.GAME.blind.in_blind is G.GAME.facing_blind; the cash-out `round_eval` context runs from the mod's
// evaluate_round hook (the engine has no joker round_eval context; it is the same moment).
import { G, localize, card_eval_status_text, get_target_card_enhancements, has_enhancement } from '../../../pokermon/api.js';

export const MINIOR_CORES = {
  mult: { x: 9, y: 3 }, wild: { x: 10, y: 3 }, gold: { x: 11, y: 3 }, lucky: { x: 0, y: 4 }, glass: { x: 1, y: 4 }, bonus: { x: 2, y: 4 }, steel: { x: 8, y: 3 },
};
export const MINIOR_SHELL = { x: 7, y: 3 };
/** The floating sprite for a Minior's state. */
export const minior_soul = (card) => {
  const a = card && card.ability && card.ability.extra;
  if (!a || typeof a !== 'object') return null;
  return a.shields ? MINIOR_SHELL : (MINIOR_CORES[a.form] || MINIOR_SHELL);
};
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function set_sprites(card) {
  const a = card.ability.extra;
  if (!a.shields) card_eval_status_text(card, 'extra', null, null, null, { message: localize('sonfive_shieldsdown_ex') });
}
/** The cash out: shields back up. */
export function minior_round_eval(card) {
  const a = card.ability.extra;
  if (!a.shields) { a.shields = true; a.hand_played = 0; set_sprites(card); }
}

export default {
  minior: {
    quantum_enhancements: true, // answers check_enhancement (core.js quantum_enhancements)
    loc_vars(self, info_queue, card) {
      const a = (card.ability && card.ability.extra) || self.config.extra;
      const key = !a.shields ? self.key + '_' + a.form : self.key;
      return { vars: [a.revealed ? cap(a.form) : '???', Math.max(2 - a.hand_played, 0), a.Xmult], colours: [a.revealed ? 'FILTER' : 'UI_TEXT_INACTIVE'], key };
    },
    set_ability(self, card, initial) { if (initial) self.set_core(self, card); },
    set_core(self, card) {
      card.ability.extra.form = get_target_card_enhancements('minior', 1)[0].slice(2); // (taking out 'm_' from the key)
    },
    calculate(self, card, context) {
      const a = card.ability.extra;
      const hands_played = a.hand_played;
      if (context.joker_main && hands_played < 2) return { xmult: a.Xmult };
      if (context.after && !context.blueprint && a.shields) a.hand_played = hands_played + 1;
      if (G.GAME.facing_blind && hands_played >= 2 && a.shields) {
        a.revealed = true;
        a.shields = false;
        set_sprites(card);
      }
      if (context.check_enhancement && hands_played >= 2 && has_enhancement(context.other_card, 'm_stone')) return { ['m_' + a.form]: true };
      return undefined;
    },
  },
};
