// Bunco — booster packs (Bunco.lua ~7931-8167 + lovely "Blind Cards 1/3-3/3", "Virtual pack deck alignment",
// the music_virtual SMODS.Sound):
//   Blind Pack x4 (8$, only with Disguise)   3 Blind cards — each a Boss Blind drawn like the ante's (get_new_boss);
//                                            "Select" one to make it this ante's Boss. 1 in 25 cards is instead
//                                            The Joker (a joker). One choice.
//   Virtual Pack x2 / Jumbo / Mega            the WHOLE deck is drawn to hand; pick 1 (Mega: 2) of 2 / 4 Polymino
//                                            cards, used at once on the hand (weights 0.07 / 0.05 / 0.03, x4
//                                            with Arcade Machine)
// A Blind card is a base card with ability.blind_card = {blind}; its "Select" is the `use` of a pack card
// (use_card_override). The renderer draws its blind chip (view_card -> blind_card).
import { G, P_CENTERS, P_CARDS, Card, get_new_boss, create_card, pseudorandom, find_joker, play_sound, emit, P_BLINDS } from '../../js/engine/core.js';
import { end_consumeable, STATES } from '../../js/engine/run.js';
import { describeBlind } from '../../js/engine/describe.js';
import { data_of, SEED } from './util.js';

const pack = (key, def) => {
  const d = data_of('boosters', key);
  return { cost: 4, ...d, set: 'Booster', name: key, kind: d.type, ...def };
};

/** Card:create_blind_card (Bunco.lua ~7933). */
export function create_blind_card() {
  if (P_CENTERS.j_bunc_the_joker && pseudorandom('the_joker' + SEED()) < 0.04 && !(G.GAME.used_jokers.j_bunc_the_joker && !find_joker('Showman').length)) {
    return create_card('Joker', G.pack_cards, null, null, true, true, 'j_bunc_the_joker', 'buf');
  }
  const card = new Card(P_CARDS.empty, P_CENTERS.c_base);
  const boss = get_new_boss();
  card.ability.blind_card = { blind: boss };
  return card;
}
const is_blind_card = (c) => !!(c && c.ability && c.ability.blind_card);
const open_kind = () => G.GAME.pack_center && P_CENTERS[G.GAME.pack_center] && P_CENTERS[G.GAME.pack_center].kind;
const PACK_STATES = () => [STATES.MOD_PACK, STATES.MOD_PACK_HAND];

export const centers = [
  ...[1, 2, 3, 4].map((i) => pack('p_bunc_blind_' + i, {
    loc_vars: (s) => ({ key: 'p_bunc_blind', set: 'Other', vars: [s.config.extra] }),
    create_card: () => create_blind_card(),
    in_pool: () => !!G.GAME.used_vouchers.v_bunc_disguise,
  })),
  ...['1', '2', 'jumbo', 'mega'].map((s) => pack('p_bunc_virtual_' + s, {
    draw_hand: true,
    loc_vars: (c) => ({ key: s === '1' || s === '2' ? 'p_bunc_virtual_normal' : c.key, set: 'Other', vars: [c.config.choose, c.config.extra] }),
    get_weight: (c) => c.weight * (G.GAME.used_vouchers.v_bunc_arcade_machine ? 4 : 1),
    create_card: () => ({ set: 'Polymino', area: G.pack_cards, skip_materialize: true, soulable: true, key_append: 'vir' }),
  })),
];

export const hooks = {
  // A Blind Pack always gives one choice (update_pack: G.GAME.pack_choices = 1).
  pack_choices: (n, booster) => (booster.config.center.kind === 'bunc_blind' ? 1 : n),
  // A Virtual Pack draws the whole deck (create_UIBox's draw loop).
  draw_hand_space: (n) => (G.STATE === STATES.MOD_PACK_HAND && open_kind() === 'bunc_virtual' ? G.deck.cards.length : n),
  // G.FUNCS.use_blind_card: the chosen blind becomes this ante's Boss; the pack closes.
  use_card_override(card) {
    if (!is_blind_card(card) || card.area !== G.pack_cards) return undefined;
    G.GAME.round_resets.blind_choices.Boss = card.ability.blind_card.blind;
    play_sound('other1');
    emit('boss_rerolled', { boss: card.ability.blind_card.blind, blind_card: true });
    G.pack_cards.remove_card(card);
    card.remove();
    end_consumeable();
    return true;
  },
  describe(card, desc) {
    if (!is_blind_card(card)) return;
    const d = describeBlind(card.ability.blind_card.blind);
    if (!d) return;
    desc.name = d.name; desc.set = 'Blind'; desc.lines = d.lines; desc.badges = [{ key: 'boss', label: 'Boss Blind' }];
    desc.blind_card = true;
  },
  view_card(card, v) {
    if (!is_blind_card(card)) return;
    const b = P_BLINDS[card.ability.blind_card.blind];
    v.blind_card = { key: b.key, atlas: b.atlas || null, pos: b.pos, colour: b.boss_colour, mod: b.mod || null };
    v.use_label = 'Select';
  },
  view(view) {
    if (!PACK_STATES().includes(G.STATE)) {
      if (G.STATE === STATES.MOD_PACK_HAND || G.STATE === STATES.MOD_PACK) return;
    }
    const k = open_kind();
    if (k === 'bunc_blind' && PACK_STATES().includes(G.STATE)) { view.pack_kind = 'Blind'; view.pack_colours = { colour: '#4d7796', special: '#c7d775' }; }
    if (k === 'bunc_virtual' && PACK_STATES().includes(G.STATE)) {
      view.pack_kind = 'Virtual'; view.pack_colours = { colour: '#50506a', special: '#7e9999' };
      view.music = 'bunc_music_virtual';
      view.bunc_virtual = true; // (the renderer lays the whole-deck hand out in suit rows)
    }
  },
};
