// More Fluff 1.9.9999 — the exile zone and suspended cards (src/misc.lua FLUFF.exile_card / suspend_card /
// create_and_suspend_card, src/mod_calculate.lua, lovely/exile.toml), and what this batch uses them for:
//   - the Purple Deck: when a Blind is selected, a The Wheel of Fortune! (45° Rotarot) is made in exile,
//     suspended for 1 round — at the round's first hand it uses itself;
//   - Ultramarine Stake's Suspended sticker: using such a consumable exiles it for 2 rounds instead, then it uses
//     itself.
// G.mf_exile is a card area of its own (no limit) shown as a row while it holds cards (view.mod_areas). Cards there
// are out of play (removed from the deck). At the first hand of each round every suspended card counts a round
// down; at 0 a consumable tries to use itself — as it is, else on random hand cards (25 tries for each selection
// size from its max_highlighted down to 2) — and is destroyed if it can't; any other card comes back (a playing
// card to the hand, a joker to the joker row). Cards exiled "until the end of the round / ante" come back then.
// Pact jokers' exile_until links and the cascade / Spellchaser buy-from-exile come with their jokers / deck.
import { G, P_CENTERS, CardArea, create_card, pseudoshuffle, pseudoseed, card_eval_status_text, play_sound } from '../../js/engine/core.js';
import { use_card, end_consumeable, STATES } from '../../js/engine/run.js';

const PACK_STATES = [STATES.TAROT_PACK, STATES.PLANET_PACK, STATES.SPECTRAL_PACK, STATES.STANDARD_PACK, STATES.BUFFOON_PACK, STATES.MOD_PACK, STATES.MOD_PACK_HAND];
import LOC from './loc.js';

/** FLUFF.exile_card(card, percent, temp, func): out of its area and the deck, into exile. */
export function exile_card(card, temp, func) {
  if (card.mf_being_exiled) return;
  card.mf_being_exiled = true;
  if (temp === true) temp = 'mf_unexile_eor';
  if (temp === 'ante') temp = 'mf_unexile_eoa';
  if (card.area) card.area.remove_card(card);
  if (card.added_to_deck) card.remove_from_deck(false);
  G.mf_exile.emplace(card);
  card.mf_being_exiled = false;
  if (temp) card.ability[temp] = true;
  if (func) func(card);
  play_sound('card1', 0.65, 0.6);
}
/** FLUFF.suspend_card(card, rounds) */
export function suspend_card(card, rounds) {
  exile_card(card, false);
  card.ability.mf_suspended = { rounds };
}
/** FLUFF.create_and_suspend_card({key}, rounds): SMODS.add_card into exile, then suspended. */
export function create_and_suspend_card(key, rounds) {
  const card = create_card(null, G.mf_exile, null, null, null, null, key, undefined);
  card.add_to_deck();
  G.mf_exile.emplace(card);
  suspend_card(card, rounds);
  return card;
}

/** A suspended consumable's turn: use it (as it is, else on random hand cards), else destroy it. */
function use_suspended(card) {
  const try_use = () => {
    if (!card.can_use_consumeable(true, true)) return false;
    card.ability.mf_suspended = undefined;
    G.STATE = G.STATES.SELECTING_HAND; // (as the Lua: use_card returns to it)
    use_card(card);
    return true;
  };
  const old_su = G.GAME.STOP_USE;
  G.GAME.STOP_USE = 0;
  let used = try_use();
  if (!used) {
    let max_h = card.ability.max_highlighted || 5;
    if (max_h > G.hand.cards.length) max_h = G.hand.cards.length;
    while (max_h > 1 && !used) {
      for (let i = 0; i < 25; i++) {
        const temp = G.hand.cards.slice();
        pseudoshuffle(temp, pseudoseed('mf_use_suspend'));
        G.hand.unhighlight_all();
        for (let k = 0; k < max_h; k++) G.hand.add_to_highlighted(temp[k], true);
        used = try_use();
        if (used) break;
        G.hand.unhighlight_all();
      }
      max_h -= 1;
    }
  }
  G.GAME.STOP_USE = old_su;
  if (!used) {
    card.ability.mf_suspended = undefined;
    if (card.area) card.area.remove_card(card);
    card.start_dissolve();
  }
}

/** First hand of a round: suspended cards count down; at 0 they come back / use themselves. */
function suspended_round() {
  const back = [];
  const uses = [];
  for (const card of G.mf_exile.cards.slice()) {
    const s = card.ability.mf_suspended;
    if (!s) continue;
    s.rounds -= 1;
    if (s.rounds > 0) { card_eval_status_text(card, 'extra', null, null, null, { message: s.rounds + '' }); continue; }
    if (card.ability.consumeable) uses.push(card);
    else back.push(card);
  }
  for (const card of uses) G.E_MANAGER.add_event(() => { if (card.area === G.mf_exile) use_suspended(card); });
  for (const card of back) {
    G.E_MANAGER.add_event(() => {
      card.ability.mf_suspended = undefined;
      G.mf_exile.remove_card(card);
      if (card.ability.set === 'Default' || card.ability.set === 'Enhanced') G.hand.emplace(card);
      else { G.jokers.emplace(card); if (!card.added_to_deck) card.add_to_deck(false); }
      play_sound('card1', 0.45, 0.6);
    });
  }
}

/** Ultramarine's Suspended sticker: the use exiles the card for 2 rounds instead (Card:use_consumeable wrap). */
function suspend_on_use(card) {
  if (!card.ability.mf_suspend_sticker || !card.ability.consumeable) return undefined;
  const from = card.area;
  card.ability.mf_suspend_sticker = false;
  suspend_card(card, 2);
  if (from === G.pack_cards && PACK_STATES.includes(G.STATE)) {
    if (G.GAME.pack_choices && G.GAME.pack_choices > 1) G.GAME.pack_choices -= 1;
    else end_consumeable();
  }
  return true;
}

export const hooks = {
  /** game.lua (FLUFF.custom_card_areas): the exile area. */
  start_run() {
    G.mf_exile = new CardArea('mf_exile', { card_limit: 9999, type: 'joker', highlighted_limit: 0 });
    G.areas.push(G.mf_exile);
  },
  /** (new_round = setting a blind) the Purple Deck's Wheel, and a fresh "first hand" for the suspended cards. */
  new_round() { G.GAME.mf_exile_first_hand = false; purple_deck_blind(); },
  calculate(ctx) {
    if (!G.mf_exile) return undefined;
    // (context.first_hand_drawn: the mod's own calculate only hears the hand_drawn context — its first one a round)
    if (ctx.hand_drawn && !G.GAME.mf_exile_first_hand && G.GAME.current_round.hands_played === 0 && G.GAME.current_round.discards_used === 0) {
      G.GAME.mf_exile_first_hand = true;
      suspended_round();
    }
    return undefined;
  },
  /** End of round: cards exiled until the end of the round (or, after a Boss, the ante) come back to the deck. */
  end_round() {
    if (!G.mf_exile) return;
    for (const card of G.mf_exile.cards.slice()) {
      const eor = card.ability.mf_unexile_eor, eoa = card.ability.mf_unexile_eoa && G.GAME.blind && G.GAME.blind.boss;
      if (!eor && !eoa) continue;
      card.ability.mf_unexile_eor = undefined;
      if (eoa) card.ability.mf_unexile_eoa = undefined;
      G.mf_exile.remove_card(card);
      G.deck.emplace(card);
    }
  },
  use_card_override: (card) => suspend_on_use(card),
  can_use_consumeable: (card) => (card.ability.mf_suspend_sticker ? true : undefined),
  view(view, cardView) {
    if (!(G.mf_exile && G.mf_exile.cards.length)) return;
    view.areas.mf_exile = G.mf_exile.cards.map((c) => cardView(c, true));
    view.mod_areas = (view.mod_areas || []).concat([{ key: 'mf_exile', label: 'Exile', limit: G.mf_exile.cards.length, buttons: [] }]);
  },
  describe(card, desc) {
    const s = card.ability && card.ability.mf_suspended;
    const d = LOC.descriptions.Other.mf_suspended_info;
    if (s && card.area === G.mf_exile && d) desc.info = [...(desc.info || []), { key: 'mf_suspended_info', name: d.name, lines: d.text.map((l) => l.replace('#1#', s.rounds || 1)) }];
  },
};
/** The Purple Deck (Back:calculate setting_blind): a 45° Wheel of Fortune, made in exile and suspended for 1 round. */
function purple_deck_blind() {
  if (G.GAME.selected_back_key !== 'b_mf_purple' || !P_CENTERS.c_mf_rot_wheel) return;
  create_and_suspend_card('c_mf_rot_wheel', 1);
}
