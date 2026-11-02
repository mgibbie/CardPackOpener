// Tarots / Spectrals that act on "up to N" selected cards are usable with FEWER (at least 1), from the
// consumable slot and from an Arcana / Spectral pack — Balatro's Card:can_use_consumeable:
//   mod_num >= #G.hand.highlighted and #G.hand.highlighted >= (min_highlighted or 1)
// so The Magician / Empress / Hierophant / Hanged Man / Strength take 1-2, The Star / Moon / Sun / World 1-3,
// the one-card Tarots and Spectrals exactly 1, and Death (min_highlighted 2) exactly 2; more than the
// maximum is never allowed. A tester: "it forces you to select the listed amount when arcana cards you can do
// less than the listed amount for magician, hangman, all suits and bonus/mult enhances". Played through act()
// (the board's Use button sends { type: 'use', id, targets: the hand's selection }), vanilla and with the
// testers' mod set (Pokermon + Nacho + Pokermon+).
//   node micatro/tests/tarot_select_count_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, Card, add_joker, create_card } from '../js/engine/core.js';
import { newRun, act, STATES, STATE_NAMES } from '../js/engine/run.js';
import { loadMods } from '../js/mods/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL ' + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); } };

// [key, set, min, max]
const CASES = [
  ['c_magician', 'Tarot', 1, 2], ['c_empress', 'Tarot', 1, 2], ['c_heirophant', 'Tarot', 1, 2],
  ['c_hanged_man', 'Tarot', 1, 2], ['c_strength', 'Tarot', 1, 2],
  ['c_star', 'Tarot', 1, 3], ['c_moon', 'Tarot', 1, 3], ['c_sun', 'Tarot', 1, 3], ['c_world', 'Tarot', 1, 3],
  ['c_lovers', 'Tarot', 1, 1], ['c_chariot', 'Tarot', 1, 1], ['c_justice', 'Tarot', 1, 1], ['c_devil', 'Tarot', 1, 1], ['c_tower', 'Tarot', 1, 1],
  ['c_death', 'Tarot', 2, 2],
  ['c_aura', 'Spectral', 1, 1], ['c_cryptid', 'Spectral', 1, 1], ['c_talisman', 'Spectral', 1, 1], ['c_deja_vu', 'Spectral', 1, 1],
  ['c_trance', 'Spectral', 1, 1], ['c_medium', 'Spectral', 1, 1],
];

/** A run in its first round (the consumable slot) or in the shop with an Arcana / Spectral pack open. */
function setup(mods, where, set) {
  newRun({ seed: 'TAROTSEL', back: 'b_red', mods });
  G.E_MANAGER.flush();
  let r = act({ type: 'select_blind' });
  if (!r.ok) throw new Error('select_blind: ' + r.error);
  if (where === 'slot') { G.consumeables.config.card_limit = 10; return; }
  G.GAME.blind.chips = 1;
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  r = act({ type: 'play' });
  r = act({ type: 'cash_out' });
  if (G.STATE !== STATES.SHOP) throw new Error('expected SHOP, got ' + STATE_NAMES[G.STATE]);
  G.GAME.dollars = 500;
  for (const c of G.shop_booster.cards.slice()) c.remove();
  const b = new Card(P_CARDS.empty, P_CENTERS[set === 'Tarot' ? 'p_arcana_normal_1' : 'p_spectral_normal_1']);
  G.shop_booster.emplace(b);
  r = act({ type: 'buy', id: b.sort_id });
  G.E_MANAGER.flush();
  const want = set === 'Tarot' ? STATES.TAROT_PACK : STATES.SPECTRAL_PACK;
  if (!r.ok || G.STATE !== want) throw new Error('pack did not open: ' + (r.error || STATE_NAMES[G.STATE]));
}
/** Put `key` where it's used from -> the card. */
function place(key, set, where) {
  if (where === 'slot') { const c = add_joker(key); G.E_MANAGER.flush(); return c; }
  const old = G.pack_cards.cards[0];
  const c = create_card(set, G.pack_cards, null, null, true, true, key, null);
  old.remove();
  G.pack_cards.emplace(c);
  G.E_MANAGER.flush();
  return c;
}

async function pass_for(mods) {
  const tag = mods.length ? `[${mods.join('+')}]` : '[vanilla]';
  for (const [key, set, min, max] of CASES) {
    for (const where of ['slot', 'pack']) {
      for (let n = 0; n <= max + 1; n++) {
        setup(mods, where, set);
        const t = place(key, set, where);
        const targets = G.hand.cards.slice(0, n);
        const before = targets.map((c) => [c.config.center.key, c.base.suit, c.base.id, c.edition && c.edition.type, c.seal]);
        const deck = G.playing_cards.length;
        const r = act({ type: 'use', id: t.sort_id, targets: targets.map((c) => c.sort_id) });
        const allowed = n >= min && n <= max;
        ok(!!r.ok === allowed, `${tag} ${P_CENTERS[key].name} from the ${where}: ${n} selected -> ${allowed ? 'usable' : 'refused'}`, r.error);
        if (!r.ok || !allowed) continue;
        G.E_MANAGER.flush();
        if (where === 'pack') ok(G.STATE === STATES.SHOP, `${tag} ${P_CENTERS[key].name} from the pack (${n}): the pack closes`, STATE_NAMES[G.STATE]);
        // the effect lands on exactly the selected cards
        if (key === 'c_hanged_man') ok(G.playing_cards.length === deck - n, `${tag} The Hanged Man (${where}, ${n}): ${n} card(s) destroyed`, [deck, G.playing_cards.length]);
        else if (key === 'c_magician') ok(targets.every((c) => c.config.center.key === 'm_lucky'), `${tag} The Magician (${where}, ${n}): the selected card(s) became Lucky`);
        else if (key === 'c_empress') ok(targets.every((c) => c.config.center.key === 'm_mult'), `${tag} The Empress (${where}, ${n}): Mult`);
        else if (key === 'c_heirophant') ok(targets.every((c) => c.config.center.key === 'm_bonus'), `${tag} The Hierophant (${where}, ${n}): Bonus`);
        else if (key === 'c_star') ok(targets.every((c) => c.base.suit === 'Diamonds'), `${tag} The Star (${where}, ${n}): Diamonds`);
        else if (key === 'c_moon') ok(targets.every((c) => c.base.suit === 'Clubs'), `${tag} The Moon (${where}, ${n}): Clubs`);
        else if (key === 'c_sun') ok(targets.every((c) => c.base.suit === 'Hearts'), `${tag} The Sun (${where}, ${n}): Hearts`);
        else if (key === 'c_world') ok(targets.every((c) => c.base.suit === 'Spades'), `${tag} The World (${where}, ${n}): Spades`);
        else if (key === 'c_strength') ok(targets.every((c, i) => c.base.id !== before[i][2]), `${tag} Strength (${where}, ${n}): rank went up`);
      }
    }
  }
}

await pass_for([]);
const MODS = ['pokermon', 'nacho', 'pokermonplus'];
await loadMods(MODS);
await pass_for(MODS);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
