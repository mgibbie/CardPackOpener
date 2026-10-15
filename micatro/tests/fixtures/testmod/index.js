// A tiny mod for the browser tests of the Mods UI (overworld/tests/micatro_mods_ui_test.mjs).
// Not in AVAILABLE: the test injects its manifest entry (window.__micatroExtraMods).
//   - "Adder": a joker drawn from this folder's atlas (magenta cell) with a floating
//     soul layer (cyan square), X1000 Mult so any hand clears a blind
//   - "Ghost": a joker whose atlas isn't registered -> the UI's placeholder card
//   - a "Gizmo" consumable type (badge/pack colours) + "Wrench" (gain $7)
//   - "Gizmo Box": a draw_hand mod pack (MOD_PACK_HAND) that always shows in the shop
//   - options: starter (bool: start with Adder + Ghost), flavor (choice)
// atlas.png: 3 cells of 142x190 (2x of 71x95): magenta | transparent + cyan square | yellow.
import { registerMod, opt } from '../../../js/mods/registry.js';
import { G, add_joker } from '../../../js/engine/core.js';

const BASE = new URL('./', import.meta.url).pathname;

registerMod({
  id: 'tmui', name: 'UI Test Mod', prefix: 'tmui', badge_colour: '#8a2be2',
  options: {
    starter: { default: true, label: 'Start with Adder' },
    flavor: { default: 'mild', label: 'Flavor', choices: ['mild', 'hot'] },
  },
  content: {
    atlases: { tmui_cards: { src: BASE + 'atlas.png', px: 71, py: 95 } },
    consumable_types: [{ key: 'Gizmo', name: 'Gizmo', shop_rate: 4, default: 'c_tmui_wrench', primary_colour: '#2e8b57', secondary_colour: '#ff8c00' }],
    centers: [
      { key: 'j_tmui_adder', set: 'Joker', name: 'Adder', rarity: 1, cost: 4, atlas: 'tmui_cards', pos: { x: 0, y: 0 }, soul_pos: { x: 1, y: 0 },
        config: { extra: { xm: 1000 } },
        loc_vars: (c, iq, card) => ({ vars: [card.ability.extra.xm] }),
        calculate: (c, card, ctx) => { if (ctx.joker_main) return { xmult: card.ability.extra.xm }; } },
      { key: 'j_tmui_ghost', set: 'Joker', name: 'Ghost', rarity: 1, cost: 1, atlas: 'tmui_unregistered', pos: { x: 0, y: 0 }, config: {} },
      { key: 'c_tmui_wrench', set: 'Gizmo', name: 'Wrench', consumeable: true, cost: 3, atlas: 'tmui_cards', pos: { x: 2, y: 0 }, config: {},
        can_use: () => true, use: () => { G.GAME.dollars += 7; } },
      { key: 'p_tmui_box', set: 'Booster', name: 'Gizmo Box', kind: 'Gizmo', draw_hand: true, cost: 2, weight: 100000, atlas: 'tmui_cards', pos: { x: 2, y: 0 },
        config: { extra: 3, choose: 1 }, create_card: () => ({ set: 'Gizmo', key_append: 'tmuibox' }) },
    ],
    loc: {
      descriptions: {
        Joker: { j_tmui_adder: { name: 'Adder', text: ['{X:mult,C:white} X#1# {} Mult'] }, j_tmui_ghost: { name: 'Ghost', text: ['Does nothing'] } },
        Gizmo: { c_tmui_wrench: { name: 'Wrench', text: ['Gain {C:money}$7'] } },
        Booster: { p_tmui_box: { name: 'Gizmo Box', text: ['Choose {C:attention}1{} of 3 Gizmos'] } },
      },
    },
  },
  hooks: {
    start_run: () => { if (opt('tmui', 'starter')) { add_joker('j_tmui_adder'); add_joker('j_tmui_ghost'); } },
  },
});
