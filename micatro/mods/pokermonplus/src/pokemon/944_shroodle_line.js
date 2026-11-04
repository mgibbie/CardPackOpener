// Pokermon+ 1.2.0 — src/pokemon/944_shroodle_line.lua: Shroodle, Grafaiai (new; the Nature system).
// Both have a Nature of 3 different random types (set_nature, seeds shroodle_1..3).
// Shroodle: a random tag when a Boss Blind is beaten (any tag but the Boss Tag; an Orbital Tag gets a random visible hand);
//   evolves after 3 tags triggered while it is held (Steamodded's tag_triggered context: functions.js).
// Grafaiai: a joker whose type is in its Nature also counts as the Nature's other types (functions.js grafaiai_is_type,
//   Pokermon IS_TYPE_RULES); a beaten Boss Blind gives the last tag used this run (G.GAME.last_tag) again.
// Micatro shape: the tag pick draws from the registered tags of the base game and the ACTIVE mods (in the Lua every loaded
// mod is active), in their registration order (the Lua's pairs() order is unspecified).
import { G, localize, pseudorandom_element, pseudoseed, scaling_evo, play_sound } from '../../../pokermon/api.js';
import { Tag, add_tag } from '../../../../js/engine/tag.js';
import { P_TAGS } from '../../../../js/engine/core.js';
import { isActive } from '../../../../js/mods/registry.js';
import { POKE_TYPES } from '../functions.js';

const boss_beaten = (context) => context.end_of_round && G.GAME.blind && G.GAME.blind.boss && !context.repetition && !context.individual;
const typeVars = (a) => a.targets.map((t) => t.type);

/** set_nature: the last (up to) 3 targets become distinct random types. */
function set_nature(card) {
  const targets = card.ability.extra.targets || [];
  const total = targets.length;
  const start = total - Math.min(3, total);
  const out = targets.slice(0, start);
  const used = new Set(out.map((t) => t.type));
  const pool = POKE_TYPES.filter((t) => !used.has(t));
  for (let i = start; i < total; i++) {
    if (!pool.length) break;
    const [choice] = pseudorandom_element(pool, pseudoseed('shroodle_' + (i + 1)));
    out[i] = { type: choice };
    pool.splice(pool.indexOf(choice), 1);
  }
  card.ability.extra.targets = out;
}

function random_tag() {
  const tags = Object.values(P_TAGS).filter((v) => v && v.key !== 'tag_boss' && (!v.mod || isActive(v.mod)));
  const [temp] = pseudorandom_element(tags, pseudoseed('shroodle'));
  const tag = new Tag(temp.key);
  if (tag.key === 'tag_orbital') {
    const hands = Object.keys(G.GAME.hands).filter((k) => G.GAME.hands[k].visible);
    tag.ability.orbital_hand = pseudorandom_element(hands, pseudoseed('shroodle'))[0];
  }
  add_tag(tag);
  play_sound('generic1', 0.9, 0.8);
  play_sound('holo1', 1.2, 0.4);
}

export default {
  shroodle: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      return { vars: [...typeVars(a), Math.max(0, self.config.evo_rqmt - a.count)] };
    },
    calculate(self, card, context) {
      if (context.tag_triggered) card.ability.extra.count = card.ability.extra.count + 1;
      if (boss_beaten(context)) G.E_MANAGER.add_event(random_tag);
      return scaling_evo(self, card, context, 'j_sonfive_grafaiai', card.ability.extra.count, self.config.evo_rqmt);
    },
    set_ability(self, card, initial) { if (initial) set_nature(card); },
  },
  grafaiai: {
    loc_vars(self, info_queue, card) {
      const a = card.ability.extra;
      const last = G.GAME && G.GAME.last_tag ? localize({ type: 'name_text', key: G.GAME.last_tag, set: 'Tag' }) : localize('k_none');
      return { vars: [...typeVars(a), last] };
    },
    calculate(self, card, context) {
      if (boss_beaten(context) && G.GAME.last_tag) {
        const key = G.GAME.last_tag;
        G.E_MANAGER.add_event(() => {
          add_tag(new Tag(key));
          play_sound('generic1', 0.9, 0.8);
          play_sound('holo1', 1.2, 0.4);
        });
      }
      return undefined;
    },
    set_ability(self, card, initial) { if (initial) set_nature(card); },
  },
};
export { set_nature };
