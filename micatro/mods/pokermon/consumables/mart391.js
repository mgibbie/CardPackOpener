// Pokermon 3.9.1 — the Items batch 10 adds (3.2.1's data.js has neither, so each definition carries its whole static data;
// index.js builds them after data.js's consumables):
//   consumables/03_mart_items.lua  Miracle Seed: 1 selected card becomes a Seed card.
//   consumables/04_mart_rare.lua   Heavy-Duty Boots (reusable held item): until the end of the round every Hazard card
//                                  probability is 0 (fix_probability, identifier 'hazard'); once per round.
// Spawning: 3.9.1 gives the "Soul items" (Leftovers 3, Heavy-Duty Boots 2, ...) object weights in the Item pool
// (optional_features.object_weights, on since batch 17): the Boots are an ordinary Item of weight 2 (batch 10 made them a hidden
// soul Item while object_weights was off: that deviation is gone), only while the Hazard layer is up (3.9.1 in_pool). Its
// floating sprite hiding while used is cosmetic.
import {
  G, P_CENTERS, localize, card_eval_status_text, defineConsumables, set_spoon_item, juice_flip, poke_unhighlight_cards,
  find_card, pseudoshuffle, pseudoseed, play_sound, poke_remove_card,
} from '../api.js';

const PACKS = () => [G.STATES.MOD_PACK, G.STATES.MOD_PACK_HAND, G.STATES.TAROT_PACK, G.STATES.SPECTRAL_PACK, G.STATES.PLANET_PACK, G.STATES.STANDARD_PACK];

defineConsumables({
  miracleseed: {
    key: 'miracleseed',
    set: 'Item',
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 2, y: 7 },
    artist: ['Emma', 'Catzzadilla'],
    cost: 4,
    config: { max_highlighted: 1, min_highlighted: 1 },
    unlocked: true,
    discovered: true,
    loc_vars(self, info_queue) { info_queue.push(P_CENTERS.m_poke_seed); return { vars: [self.config.max_highlighted] }; },
    use(self, card) {
      set_spoon_item(card);
      juice_flip(card);
      for (const c of G.hand.highlighted) c.set_ability(P_CENTERS.m_poke_seed, null, true);
      juice_flip(card, true);
      poke_unhighlight_cards();
    },
    in_pool() { return true; },
  },
}, 'consumables/03_mart_items.lua');

defineConsumables({
  heavyboots: {
    key: 'heavyboots',
    set: 'Item',
    helditem: true,
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 3, y: 7 },
    soul_pos: { x: 4, y: 7 },
    artist: [{ name: 'Emma', layer: 'soul' }, { name: 'Catzzadilla', layer: 'center' }],
    cost: 4,
    config: { extra: { usable: true, hazard_off: false } },
    unlocked: true,
    discovered: true,
    weight: 2, // (3.9.1: its pool weight under object_weights; see the header)
    loc_vars(self, info_queue) { info_queue.push({ set: 'Other', key: 'endless' }); return { vars: [] }; },
    can_use(self, card) {
      if (PACKS().includes(G.STATE) && G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit && card.area === G.pack_cards) return false;
      return card.ability.extra.usable;
    },
    use(self, card) {
      card.ability.extra.usable = false;
      card.ability.extra.hazard_off = true;
    },
    calculate(self, card, context) {
      if (context.fix_probability && card.ability.extra.hazard_off && context.identifier === 'hazard') return { numerator: 0 };
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
        // (queued: the held Hazard cards roll their end-of-round destroy first)
        G.E_MANAGER.add_event(() => { card.ability.extra.hazard_off = false; });
      }
      return undefined;
    },
    keep_on_use() { return true; },
    in_pool() { return !!(G.GAME.poke_hazard_level && G.GAME.poke_hazard_level > 0); },
  },
}, 'consumables/04_mart_rare.lua');

// Pokermon 3.9.1 consumables/05_mart_specific.lua: the Meteorite (new-jokers sub-batch 14, with Deoxys). A reusable Spectral held
// item: use it to destroy 1 random card left in the deck and turn the selected (else the leftmost) Deoxys into its forme. The
// forme cycles Attack -> Defense -> Speed -> Normal on every shop reroll; usable again at the end of the round. A hidden Planet
// soul card (soul_rate 0.2) while you have a Deoxys (3.9.1 in_pool); a pack may let you keep it (saveable: systems/rules.js
// can_reserve). Its floating sprite hiding while used is cosmetic.
const FORMES = ['Attack', 'Defense', 'Speed', 'Normal'];
/** pokermon.find_card(key, true) (3.9.1 pokeutils.lua): a lone highlighted card of an area, else the area's first match. */
function find_selected_or_first(key) {
  for (const area of [G.jokers, G.consumeables]) {
    if (!area) continue;
    if (area.highlighted && area.highlighted.length === 1) {
      if (area.highlighted[0].config.center.key === key) return area.highlighted[0];
    } else {
      for (const c of area.cards) if (c.config.center.key === key) return c;
    }
  }
  return undefined;
}
/**
 * The deck cards a Meteorite destroys now: 3.9.1's pick (the deck sorted, pseudoshuffled on 'meteor', the first `n`).
 * `peek`: the tooltip's "Will destroy" preview — the same pick with the run's RNG put back exactly as it was (the 'meteor'
 * stream, and any key The Order's shuffle touches), so hovering never changes a run, its replay or its resume.
 */
function meteor_pick(n, peek) {
  if (peek && (!G.deck || !G.deck.cards.length)) return [];
  const pr = G.GAME.pseudorandom;
  const snap = peek ? { ...pr } : null;
  try {
    const temp_deck = G.deck.cards.slice();
    temp_deck.sort((a, b) => (!a.playing_card || !b.playing_card ? 0 : a.playing_card - b.playing_card));
    pseudoshuffle(temp_deck, pseudoseed('meteor'));
    return temp_deck.slice(0, n);
  } finally {
    if (snap) { for (const k of Object.keys(pr)) if (!(k in snap)) delete pr[k]; Object.assign(pr, snap); }
  }
}
/** "7 of Hearts", "Ace of Spades (Glass Card)", "Stone Card". */
function meteor_card_name(c) {
  const center = c.config && c.config.center;
  const enh = center && center.key !== 'c_base' ? (center.name || center.key) : '';
  if (center && center.key === 'm_stone') return 'Stone Card';
  const base = c.base && c.base.value && c.base.suit ? c.base.value + ' of ' + c.base.suit : 'a card';
  return enh ? base + ' (' + enh + ')' : base;
}
defineConsumables({
  meteorite: {
    key: 'meteorite',
    set: 'Spectral',
    saveable: true,
    helditem: true,
    artist: ['Currently a placeholder!', 'Want your art here?', 'Join the Discord!'],
    config: { extra: { destroy: 1, forme: 'Normal', usable: true } },
    atlas: 'AtlasConsumablesBasic',
    pos: { x: 5, y: 7 },
    soul_pos: { x: 6, y: 7 },
    cost: 3,
    unlocked: true,
    discovered: true,
    hidden: true,
    soul_set: 'Planet',
    soul_rate: 0.2,
    no_collection: true,
    loc_vars(self, info_queue, center) {
      info_queue.push({ set: 'Other', key: 'endless' });
      const extra = (center && center.ability && center.ability.extra) || self.config.extra;
      const forme = extra.forme || self.config.extra.forme;
      // (once per round: "Ready" / "Used this round" — index.js appends the line; text only, no rules change)
      const ready = extra.usable !== false;
      const r = { vars: [localize('poke_' + forme.toLowerCase() + '_forme'), ready ? 'Ready' : 'Used this round'], colours: [ready ? 'green' : 'red'] };
      // A held / offered Meteorite in a run names the deck card it would destroy now (the seeded pick, peeked: no RNG used)
      if (center && center.area && G.GAME && G.deck && G.deck.cards.length) {
        const next = meteor_pick(extra.destroy || 1, true);
        if (next.length) r.main_end = ['{C:inactive}Will destroy: {C:attention}' + next.map(meteor_card_name).join(', ') + '{}'];
      }
      return r;
    },
    use(self, card) {
      card.ability.extra.usable = false;
      const destroyed_cards = meteor_pick(card.ability.extra.destroy, false);
      G.E_MANAGER.add_event(() => { play_sound('tarot1'); card.juice_up(0.3, 0.5); });
      // (SMODS.destroy_cards on playing cards: marked, dissolved, remove_playing_cards)
      for (const c of destroyed_cards) poke_remove_card(c, card);

      let deoxys = find_selected_or_first('j_poke_deoxys');
      if (!deoxys) deoxys = find_card('j_poke_deoxys')[0];
      if (deoxys) {
        const curr_index = FORMES.indexOf(card.ability.extra.forme) + 1;
        if (deoxys.ability.extra.form !== curr_index) {
          deoxys.ability.extra.form = curr_index;
          // (pokermon.do_evolution_anim + set_sprites: the forme's floating sprite is ui.js face())
          G.E_MANAGER.add_event(() => {
            card_eval_status_text(deoxys, 'extra', null, null, null, { message: localize('poke_transform_success'), colour: 'FILTER' });
          });
        }
      }
    },
    calculate(self, card, context) {
      if (context.reroll_shop) {
        const i = FORMES.indexOf(card.ability.extra.forme);
        card.ability.extra.forme = FORMES[(i + 1) % FORMES.length];
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('poke_' + card.ability.extra.forme.toLowerCase() + '_forme') });
      }
      if (context.end_of_round && !card.ability.extra.usable) {
        card.ability.extra.usable = true;
        card_eval_status_text(card, 'extra', null, null, null, { message: localize('k_reset') });
      }
      return undefined;
    },
    can_use(self, card) {
      if (PACKS().includes(G.STATE) && G.consumeables.cards.length + G.GAME.consumeable_buffer >= G.consumeables.config.card_limit && card.area === G.pack_cards) return false;
      return !!(G.deck && G.deck.cards.length > 0 && card.ability.extra.usable);
    },
    keep_on_use() { return true; },
    in_pool() { return find_card('j_poke_deoxys').length > 0; },
  },
}, 'consumables/05_mart_specific.lua');
