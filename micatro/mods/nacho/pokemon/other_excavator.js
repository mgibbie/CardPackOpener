// Nacho's Pokermon Dip 1.7.9 — src/pokemon/other_excavator.lua: the Fossil Excavator (new in 1.7.9; a Pokermon "Other" joker,
// its own art: ../index.js nacho_excavator). After 2 Boss Blinds beaten, selling it makes a Fossil Tag (../items.js: a free
// Ancient Pack of fossil Pokémon). Not Eternal.
import { G, localize, play_sound, defineNacho, juice_card_until, main_eval } from '../api.js';
import { Tag, add_tag } from '../../../js/engine/tag.js';
import { defer } from '../dip.js';

const FILE = 'src/pokemon/other_excavator.lua';

defineNacho({
  excavator: {
    loc_vars(self, info_queue, card) { const a = card.ability.extra; return { vars: [a.boss_req, a.bosses_beat] }; },
    calculate(self, card, context) {
      const a = card.ability.extra;
      if (context.selling_self && a.bosses_beat >= a.boss_req && !context.blueprint) {
        defer(() => {
          add_tag(new Tag('tag_nacho_fossil_tag'));
          play_sound('generic1', 0.95, 0.8);
          play_sound('holo1', 1.25, 0.4);
        });
      }
      if (context.end_of_round && context.beat_boss && !context.game_over && main_eval(context) && !context.individual && !context.repetition && !context.blueprint) {
        a.bosses_beat = a.bosses_beat + 1;
        if (a.bosses_beat >= a.boss_req) juice_card_until(card, (c) => !c.removed, true);
        return { message: a.bosses_beat < a.boss_req ? a.bosses_beat + '/' + a.boss_req : localize('k_active_ex') };
      }
      return undefined;
    },
  },
}, FILE);
