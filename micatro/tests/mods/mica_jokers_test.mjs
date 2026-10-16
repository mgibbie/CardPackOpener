// Tag Team / Smirkeo / AltaVista (micatro/mods/{tagteam,smirkeo,altavista}): each mod off ->
// nothing in the pools; on -> its joker fired through real act() plays (a tag / Tarot per Pair
// in the played cards, Stone cards excluded), describe() filled, AltaVista's fixes pinned.
//   node micatro/tests/mods/mica_jokers_test.mjs
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, P_CENTER_POOLS, add_joker, create_playing_card, create_card } from '../../js/engine/core.js';
import { newRun, act } from '../../js/engine/run.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { ATLASES } from '../../js/mods/registry.js';
import '../../mods/tagteam/index.js';
import '../../mods/smirkeo/index.js';
import '../../mods/altavista/index.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };
const flush = () => G.E_MANAGER.flush();
const MODS = { tagteam: 'j_snoresville_tag_team', smirkeo: 'j_smirkeo_micatro', altavista: 'j_micatro_altavista' };

function start(seed, mods) {
  newRun({ seed, back: 'b_red', mods });
  flush();
  act({ type: 'select_blind' });
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
}
const hand = (keys, center) => keys.map((k) => create_playing_card({ front: P_CARDS[k], center: P_CENTERS[center || 'c_base'] }, G.hand));
function play(cards) {
  G.GAME.chips = 0; G.GAME.blind.chips = 1e15;
  G.GAME.current_round.hands_left = Math.max(G.GAME.current_round.hands_left, 2);
  act({ type: 'highlight', ids: cards.map((c) => c.sort_id) });
  const r = act({ type: 'play' });
  for (const c of G.hand.cards.slice()) { G.hand.remove_card(c); G.deck.emplace(c); }
  return r;
}
const msgs = (r) => r.events.filter((e) => e.type === 'status' && e.message).map((e) => e.message);

// ---- off: none of the three
start('MICAOFF', []);
for (const [id, key] of Object.entries(MODS)) ok(!P_CENTER_POOLS.Joker.includes(P_CENTERS[key]), `off: ${id} joker not pooled`);
// each mod alone only adds its own
for (const [id, key] of Object.entries(MODS)) {
  start('MICA1' + id, [id]);
  const mine = P_CENTER_POOLS.Joker.filter((c) => Object.values(MODS).includes(c.key)).map((c) => c.key);
  ok(mine.length === 1 && mine[0] === key, `${id} on alone: only its joker pooled`, mine);
  const c = P_CENTERS[key];
  ok(c.rarity === 2 && c.cost === 8 && c.blueprint_compat && c.eternal_compat && ATLASES[key] && ATLASES[key].src === `/micatro/mods/${id}/assets/2x/${key}.png`, `${id}: Uncommon $8, blueprint/eternal compat, own 2x atlas`);
  const d = describeCenter(key);
  ok(d.lines.length === 3 && !d.lines.join(' ').match(/#\d+#/) && d.lines[1].includes('Pair'), `${id}: description`, d);
}

// ---- Tag Team / Smirkeo: a tag per Pair in the played cards
for (const [id, tag, msg] of [['tagteam', 'tag_double', 'Double Tag!'], ['smirkeo', 'tag_negative', 'Negative Tag!']]) {
  start('MICA' + id, [id]);
  const j = add_joker(MODS[id]); flush();
  ok(describe(j).name === (id === 'tagteam' ? 'Tag Team' : 'Smirkeo'), `${id}: name`);
  const tags = () => G.GAME.tags.filter((t) => t.key === tag).length;
  let r = play(hand(['S_5', 'H_5']));
  ok(tags() === 1 && msgs(r).includes(msg), `${id}: Pair -> 1 tag`, tags());
  play(hand(['S_5', 'H_5', 'S_9', 'H_9']));
  ok(tags() === 3, `${id}: Two Pair -> 2 more`, tags());
  play(hand(['S_5', 'H_5', 'D_5', 'C_5']));
  ok(tags() === 5, `${id}: Four of a Kind = 2 pairs`, tags());
  play(hand(['S_5', 'H_5', 'D_5', 'S_9', 'H_9']));
  ok(tags() === 7, `${id}: Full House = 2 pairs (3 of a rank counts once)`, tags());
  play(hand(['S_5', 'S_9']));
  ok(tags() === 7, `${id}: no Pair -> nothing`);
  play([...hand(['S_5']), ...hand(['H_5'], 'm_stone')]);
  ok(tags() === 7, `${id}: Stone cards never pair`);
  play(hand(['S_A', 'H_A', 'S_2', 'S_3', 'S_4']));
  ok(tags() === 8, `${id}: unscored cards count (played cards, like the Lua's full_hand)`, tags());
  // Blueprint copies it
  add_joker('j_blueprint'); flush();
  G.jokers.cards.unshift(G.jokers.cards.pop()); // Blueprint left of the joker
  play(hand(['S_7', 'H_7']));
  ok(tags() === 10, `${id}: Blueprint doubles it`, tags());
}

// ---- AltaVista: a Tarot per Pair (+ fixes)
{
  start('MICAALTA', ['altavista']);
  const j = add_joker(MODS.altavista); flush();
  const tarots = () => G.consumeables.cards.filter((c) => c.ability.set === 'Tarot').length;
  const r = play(hand(['S_5', 'H_5']));
  ok(tarots() === 1 && msgs(r).includes('Tarot Card!'), 'AltaVista: Pair -> a Tarot', tarots());
  G.consumeables.cards[0].remove();
  play(hand(['S_5', 'H_5', 'S_9', 'H_9']));
  ok(tarots() === 2, 'AltaVista: Two Pair -> 2 Tarots', tarots());
  // Fix 1: the Lua created past the slot limit (2 consumable slots) — here the room check holds.
  play(hand(['S_5', 'H_5', 'S_9', 'H_9']));
  ok(G.consumeables.cards.length === 2, 'fix 1: no Tarot past the consumable slots', G.consumeables.cards.length);
  G.consumeables.cards[0].remove();
  play(hand(['S_5', 'H_5', 'S_9', 'H_9']));
  ok(G.consumeables.cards.length === 2 && G.GAME.consumeable_buffer === 0, 'fix 1: fills the one free slot, buffer reset', [G.consumeables.cards.length, G.GAME.consumeable_buffer]);
  for (const c of G.consumeables.cards.slice()) c.remove();
  play(hand(['S_5', 'H_5', 'D_5', 'S_9', 'H_9']));
  ok(tarots() === 2, 'AltaVista: Full House = 2 Tarots');
  for (const c of G.consumeables.cards.slice()) c.remove();
  play([...hand(['S_5']), ...hand(['H_5'], 'm_stone')]);
  ok(tarots() === 0, 'AltaVista: Stone cards never pair');
  // Fix 2: the text's malformed {C:attention,'Tarot'} markup is Balatro's Tarot colour.
  const d = describe(j);
  ok(d.name === 'AltaVista' && d.lines[0] === 'Gain a {C:tarot}Tarot Card{}', 'fix 2: {C:tarot} markup', d.lines);
  void create_card;
}

// ---- all three together
{
  start('MICAALL', ['tagteam', 'smirkeo', 'altavista']);
  for (const k of Object.values(MODS)) add_joker(k);
  flush();
  play(hand(['S_5', 'H_5']));
  // Tag Team's Double Tag lands first, then copies Smirkeo's Negative Tag (vanilla Double Tag).
  ok(G.GAME.tags.map((t) => t.key).join() === 'tag_negative,tag_negative' && G.consumeables.cards.length === 1, 'all three on: Double Tag doubles the Negative Tag, + a Tarot', G.GAME.tags.map((t) => t.key));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
