// "Skitty does not work" (Pokermon testers, 2026-11): Skitty / Delcatty copy the joker to their right when it is of the round's
// type (G.GAME.current_round.cattype, rolled at each round's end from the held jokers' types: systems/rules.js reset_type). The copy
// itself worked; what the player saw did not:
//   - the tooltip's "{B:1,V:2}#1#{} Joker" (the round's type as a pill in its type colour) drew as WHITE text with no pill on the
//     white tooltip: the markup renderer ignored {B:n}, and the colour passed was a bare 'fire', which resolves to nothing (the
//     registered text colour is poke_fire). The type to put on Skitty's right was invisible.
//   - no "compatible" / "incompatible" line (3.9.1 loc_vars main_end: pokermon.ui.blueprint_compat), so nothing said it was copying.
// Kecleon and the Tera Orb draw the same type pill and had the same blank.
//   PLAY  a real run: Skitty + an owner-designed Fire joker (Tepig, jokers/pokejokers_designs.js) to its right. Round 1's type was
//         rolled before they were held (Grass): no copy. From round 2 the type is Fire (the only typed joker; Skitty excludes itself):
//         the played hand scores the copy. A Tera sticker moves the next roll to the new type, still copied. Delcatty: the copy with
//         +1 Energy. Moving the joker away: no copy.
//   TIP   the type pill renders in its type colour, and the compatible / incompatible line follows what it actually copies.
//   node micatro/tests/mods/pokermon_skitty_test.mjs
import { T, start, hand, add, play, nextRound, clearHand, G, act } from './poke_helpers.mjs';
import { describe } from '../../js/engine/describe.js';
import { markup } from '../../js/ui/markup.js';
import { apply_type_sticker, get_type, TYPE_COLOURS } from '../../mods/pokermon/systems/types.js';

const { ok, done } = T();
const near = (a, b) => Math.abs(a - b) < 1e-9;
const sec = (name, fn) => { try { fn(); } catch (e) { ok(false, name + ' threw: ' + String(e && e.stack).slice(0, 400)); } };
/** The first hand of a round: a Pair of Aces (Pair: 2 Mult; Tepig +4 on its first hand of the round). */
const pair = () => { clearHand(); return play(hand(['S_A', 'H_A'])); };
/** A card's tooltip as the player sees it: each line through the UI's markup with the description's colours. */
const tip = (card) => { const d = describe(card); return d.lines.map((l) => markup(l, d.colours)).join('\n'); };
/** The type pill: a span with the type's colour as its background around the type's name. */
const pill = (html, ptype) => new RegExp(`background:${TYPE_COLOURS[ptype.toLowerCase()]}[^>]*>${ptype}<`).test(html);
const compatible = (html) => /compatible/.test(html) && !/incompatible/.test(html);

// ------------------------------------------------------------------- Skitty in a real run
sec('skitty', () => {
  start('SKITTYPLAY', {}, { noBlind: true });
  ok(G.GAME.current_round.cattype === 'Grass', 'run start: the round\'s type is set (Grass, no typed joker held)', G.GAME.current_round.cattype);
  const sk = add('j_poke_skitty');
  const tepig = add('j_poke_tepig');
  act({ type: 'select_blind' });
  const r1 = pair();
  ok(r1.total.mult === 6, 'round 1 (rolled Grass before they were held): Tepig\'s +4, no copy', r1.total);
  ok(/incompatible/.test(tip(sk)), 'round 1: the tooltip says incompatible (Tepig is not Grass)');

  nextRound();
  ok(G.GAME.current_round.cattype === 'Fire', 'round 2: the type is Fire (Tepig\'s; Skitty excludes itself)', G.GAME.current_round.cattype);
  const r2 = pair();
  ok(r2.total.mult === 10, 'round 2: Skitty copies Tepig (+4 twice) in a played hand', r2.total);
  const t2 = tip(sk);
  ok(pill(t2, 'Fire'), 'tooltip: the round\'s type is a Fire pill (Fire red behind the name), not white on white', t2);
  ok(compatible(t2), 'tooltip: compatible (Tepig is Fire)', t2);

  // A Tera sticker: the next roll is the new type, still copied (get_type / is_type read the sticker).
  apply_type_sticker(tepig, 'Water');
  ok(get_type(tepig) === 'Water', 'Tera Water Tepig');
  nextRound();
  ok(G.GAME.current_round.cattype === 'Water', 'round 3: the type follows the Tera sticker', G.GAME.current_round.cattype);
  const r3 = pair();
  ok(r3.total.mult === 10, 'round 3: still copied (Tera Water)', r3.total);
  const t3 = tip(sk);
  ok(pill(t3, 'Water') && compatible(t3), 'tooltip: a Water pill, compatible', t3);

  // Moved to Skitty's left: nothing to copy, and the tooltip says so.
  G.jokers.cards.splice(G.jokers.cards.indexOf(tepig), 1);
  G.jokers.cards.unshift(tepig);
  ok(/incompatible/.test(tip(sk)), 'Tepig moved left: incompatible');
  nextRound();
  const r4 = pair();
  ok(G.GAME.current_round.cattype === 'Water' && r4.total.mult === 6, 'Tepig moved left: no copy (a round\'s first hand: +4 once)', r4.total);
});

// ------------------------------------------------------------------- Delcatty in a real run
sec('delcatty', () => {
  start('DELCATTYPLAY', {}, { noBlind: true });
  const dc = add('j_poke_delcatty');
  add('j_poke_tepig');
  act({ type: 'select_blind' });
  ok(pair().total.mult === 6, 'delcatty round 1 (Grass): no copy');
  nextRound();
  ok(G.GAME.current_round.cattype === 'Fire', 'delcatty round 2: Fire');
  const r = pair();
  // Tepig +4, and its copy with +1 Energy: 4 x 1.4 = 5.6
  ok(near(r.total.mult, 2 + 4 + 5.6), 'delcatty: copies Tepig with +1 Energy (+5.6) in a played hand', r.total);
  const t = tip(dc);
  ok(pill(t, 'Fire') && compatible(t), 'delcatty tooltip: a Fire pill, compatible', t);
});

// ------------------------------------------------------------------- the same pill: Kecleon, the Tera Orb, Lightning's black text
sec('kecleon', () => {
  start('KECLEONTIP');
  const k = add('j_poke_kecleon');
  add('j_poke_pikachu');
  act({ type: 'highlight', ids: [] });
  clearHand();
  play(hand(['S_2'])); // (Kecleon takes the type of the joker to its right as it calculates)
  const t = tip(k);
  ok(get_type(k) === 'Lightning' && pill(t, 'Lightning'), 'kecleon tooltip: a Lightning pill', t);
  ok(/background:#f8f800;color:#374244/.test(t), 'Lightning: black text on the yellow pill', t);
});
sec('teraorb', () => {
  start('TERAORBTIP');
  const orb = add('c_poke_teraorb');
  const ptype = orb.ability.extra.change_to_type;
  ok(pill(tip(orb), ptype), 'tera orb tooltip: its type as a pill', [ptype, tip(orb)]);
});

done();
