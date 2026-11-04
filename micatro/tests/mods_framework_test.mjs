// Mod framework: a tiny inline test mod exercises every seam the real mods use —
// on/off pools, joker calculate (short scoring keys), a new consumable type in the
// shop, a mod booster with its own generator, hooks (straight_min, find_joker_alias,
// is_face, splash, booster_limit), describe(), and that the run recipe replays
// with the same mods. With the mod OFF nothing of it may appear.
//   node micatro/tests/mods_framework_test.mjs
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, P_CENTERS, P_CARDS, P_CENTER_POOLS, P_JOKER_RARITY_POOLS, add_joker, create_playing_card, get_current_pool } from '../js/engine/core.js';
import { newRun, act, STATES, get_poker_hand_info } from '../js/engine/run.js';
import { registerMod, ACTIVE } from '../js/mods/registry.js';
import { describe, describeCenter } from '../js/engine/describe.js';
import { Session } from '../js/engine/session.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } };

registerMod({
  id: 'testmod', name: 'Test Mod', prefix: 'tm',
  options: { straight3: { default: true } },
  content: {
    consumable_types: [{ key: 'Gizmo', name: 'Gizmo', shop_rate: 1000, default: 'c_tm_wrench' }],
    rarities: [{ key: 'tm_hidden', name: 'Hidden', weight: 0 }],
    centers: [
      { key: 'j_tm_adder', set: 'Joker', name: 'Adder', rarity: 1, cost: 4, pos: { x: 0, y: 0 }, atlas: 'tm_atlas', config: { extra: { mult: 10, xm: 2 } },
        loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.mult, card.ability.extra.xm] }),
        calculate: (c, card, ctx) => {
          if (ctx.joker_main) return { mult: card.ability.extra.mult };
          if (ctx.individual && ctx.cardarea === G.play && ctx.other_card.get_id() === 14) return { xmult: card.ability.extra.xm, card };
        } },
      { key: 'j_tm_ghost', set: 'Joker', name: 'Ghost', rarity: 'tm_hidden', cost: 1, pos: { x: 1, y: 0 }, config: {} },
      { key: 'c_tm_wrench', set: 'Gizmo', name: 'Wrench', consumeable: true, cost: 3, pos: { x: 0, y: 0 }, config: {},
        can_use: () => true, use: () => { G.GAME.dollars += 7; } },
      { key: 'p_tm_box', set: 'Booster', name: 'Gizmo Box', kind: 'Gizmo', draw_hand: true, cost: 2, weight: 1000, pos: { x: 0, y: 0 }, config: { extra: 3, choose: 2 },
        create_card: () => ({ set: 'Gizmo', key_append: 'tmbox' }) },
    ],
    loc: { descriptions: { Joker: { j_tm_adder: { name: 'Adder', text: ['{C:mult}+#1#{} Mult, Aces give {X:mult,C:white}X#2#{}'] } }, Gizmo: { c_tm_wrench: { name: 'Wrench', text: ['Gain $7'] } } } },
    atlases: { tm_atlas: { src: '/micatro/mods/testmod/x.png', px: 71, py: 95 } },
  },
  hooks: {
    straight_min: (n) => 3,
    find_joker_alias: (name) => (name === 'Pareidolia' ? G.jokers.cards.filter((c) => c.config.center.key === 'j_tm_adder') : undefined),
    booster_limit: (n) => n + 1,
  },
});

// ---- OFF: nothing leaks
newRun({ seed: 'MODOFF', back: 'b_red' });
ok(ACTIVE.length === 0 && G.GAME.mods.length === 0, 'no mods active by default');
ok(!P_CENTER_POOLS.Joker.some((c) => c.mod) && !P_CENTER_POOLS.Gizmo && !P_CENTER_POOLS.Booster.some((c) => c.mod), 'mod content absent from pools when off');
ok(!P_JOKER_RARITY_POOLS[1].some((c) => c.mod), 'rarity pools vanilla only');
{
  const h = ['S_A', 'H_K', 'D_Q'].map((k) => create_playing_card({ front: P_CARDS[k] }, G.hand));
  ok(get_poker_hand_info(h).text !== 'Straight', 'straight_min hook inactive when off');
  ok(!G.hand.cards[1].is_face() === false, 'K is a face');
}
ok(G.GAME.shop.joker_max === 2, 'vanilla shop size');

// ---- ON
newRun({ seed: 'MODON', back: 'b_red', mods: ['testmod'] });
ok(ACTIVE.join() === 'testmod' && G.GAME.mods.join() === 'testmod', 'mod active for this run');
ok(P_CENTER_POOLS.Joker.some((c) => c.key === 'j_tm_adder') && P_CENTER_POOLS.Gizmo && P_CENTER_POOLS.Gizmo.length === 1, 'mod joker + new consumable type pooled');
ok(P_JOKER_RARITY_POOLS.tm_hidden && P_JOKER_RARITY_POOLS.tm_hidden.length === 1 && !P_JOKER_RARITY_POOLS[1].some((c) => c.key === 'j_tm_ghost'), 'custom rarity has its own pool');
ok(G.GAME.gizmo_rate === 1000, 'consumable type shop rate on the game object');
ok(G.GAME.mod_options.testmod.straight3 === true, 'mod option defaults');

// joker calculate with short keys
act({ type: 'select_blind' });
for (const c of G.hand.cards.slice()) c.remove();
const j = add_joker('j_tm_adder');
G.E_MANAGER.flush();
const ace = create_playing_card({ front: P_CARDS.S_A }, G.hand);
G.GAME.chips = 0;
act({ type: 'highlight', ids: [ace.sort_id] });
const r = act({ type: 'play' });
const tot = r.events.find((e) => e.type === 'hand_total');
// High card 5 chips + Ace 11 = 16; mult 1 → Ace scores x2 (individual) → 2; joker_main +10 → 12; 16*12=192
ok(tot && tot.chips === 16 && tot.mult === 12 && tot.total === 192, 'mod joker: individual xmult then joker_main +mult', tot);
ok(r.events.some((e) => e.type === 'status' && /\+10 Mult/.test(e.message || '')), 'auto popup text for short keys');

// hooks
{
  const h = ['S_A', 'H_K', 'D_Q'].map((k) => create_playing_card({ front: P_CARDS[k] }));
  ok(get_poker_hand_info(h).text === 'Straight', 'straight_min hook: 3-card straight');
  ok(h[0].is_face() === true, 'find_joker_alias: joker counts as Pareidolia (Ace is a face)');
  for (const c of h) c.remove();
}

// describe
const d = describe(j);
ok(d.name === 'Adder' && d.lines[0].includes('+10') && d.lines[0].includes('X2') && d.badges.some((b) => b.key === 'mod' && b.label === 'Test Mod'), 'describe uses mod loc + loc_vars + mod badge', d);
ok(describeCenter('j_tm_adder').lines[0].includes('+10'), 'describeCenter for a mod center');

// shop: Gizmo consumables + extra booster slot; mod booster opens with its generator
G.GAME.chips = G.GAME.blind.chips;
act({ type: 'highlight', ids: [G.hand.cards[0] ? G.hand.cards[0].sort_id : ace.sort_id] });
while (G.STATE === STATES.SELECTING_HAND && G.hand.cards.length) { act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] }); act({ type: 'play' }); }
if (G.STATE === STATES.ROUND_EVAL) act({ type: 'cash_out' });
ok(G.STATE === STATES.SHOP, 'reached the shop', G.STATE);
ok(G.shop_booster.cards.length === 3, 'booster_limit hook: 3 booster slots', G.shop_booster.cards.length);
ok(G.shop_jokers.cards.some((c) => c.ability.set === 'Gizmo'), 'new consumable type appears in the shop');
const box = G.shop_booster.cards.find((c) => c.config.center.key === 'p_tm_box');
ok(!!box, 'mod booster in the shop (weight 1000)');
if (box) {
  G.GAME.dollars = 100;
  ok(act({ type: 'buy', id: box.sort_id }).ok, 'buy mod booster');
  ok(G.STATE === STATES.MOD_PACK_HAND && G.pack_cards.cards.length === 3 && G.pack_cards.cards.every((c) => c.config.center.key === 'c_tm_wrench'), 'mod pack: draw_hand state + generator', { s: G.STATE, n: G.pack_cards.cards.length });
  ok(G.hand.cards.length > 0, 'hand drawn for a draw_hand pack');
  ok(G.GAME.pack_choices === 2, 'pack choices from config');
  const before = G.GAME.dollars;
  ok(act({ type: 'use', id: G.pack_cards.cards[0].sort_id }).ok && G.GAME.dollars === before + 7, 'mod consumable use()');
  ok(act({ type: 'use', id: G.pack_cards.cards[0].sort_id }).ok && G.STATE === STATES.SHOP, 'second pick closes the pack', G.STATE);
}

// recipe replay keeps the mods
const s = new Session();
s.start({ seed: 'MODREC', mods: ['testmod'] });
s.act({ type: 'select_blind' });
const rec = JSON.parse(JSON.stringify(s.recipe));
ok(rec.mods.join() === 'testmod', 'recipe records mods');
newRun({ seed: 'X' });
ok(ACTIVE.length === 0, 'a plain run turns mods off again');
Session.fromRecipe(rec);
ok(ACTIVE.join() === 'testmod' && G.GAME.mods.join() === 'testmod', 'replaying the recipe re-enables the mods');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
