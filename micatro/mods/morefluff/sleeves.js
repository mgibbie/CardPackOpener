// MoreFluff 1.5.6 — its 4 CardSleeves sleeves (MoreFluff.lua, `if CardSleeves then`), as deck variants
// (engine/sleeve.js), each paired with its deck (`alt`, the Lua's get_current_deck_key() checks).
// With the paired sleeve, the Gros Michel / Blasphemous decks skip their own joker (MoreFluff's
// Back.apply_to_run wrap: `selected_sleeve ~= "sleeve_mf_..."`) — extras.js reads G.GAME.selected_sleeve.
import { G, create_card } from '../../js/engine/core.js';
import { ATLASES, MOD_LOC } from '../../js/mods/registry.js';
import { ART } from './util.js';

/** The sleeves' art (assets/2x/mf_sleeves.png: 73x95 cells, as MoreFluff registers it when CardSleeves is on). */
ATLASES.mf_sleeves = { src: ART + 'mf_sleeves.png', px: 73, py: 95, mod: 'morefluff' };

const MOD = 'morefluff', ATLAS = 'mf_sleeves';
const spawn = (key, n = 1, after) => G.E_MANAGER.add_event(() => {
  for (let i = 0; i < n; i++) {
    const card = create_card('Joker', G.jokers, null, null, null, null, key, null);
    card.add_to_deck();
    if (after) after(card);
    G.jokers.emplace(card);
  }
});
const sleeve = (key, name, x, def) => ({ key: 'sleeve_mf_' + key, name, pos: { x, y: 0 }, atlas: ATLAS, mod: MOD, config: {}, ...def });

export const SLEEVES = [
  sleeve('grosmichel', 'Gros Michel Sleeve', 0, {
    apply() { spawn('j_gros_michel'); },
    alt: { deck: 'b_mf_grosmichel', apply() { spawn('j_cavendish'); } },
  }),
  sleeve('philosophical', 'Philosophical Sleeve', 1, {
    // (alt too: 5 more Philosophical Jokers — with the deck's own 5, the alt text's "10")
    apply() { spawn('j_mf_philosophical', 5); },
    alt: { deck: 'b_mf_philosophical' },
  }),
  sleeve('rainbow', 'Rainbow Sleeve', 2, {
    config: { voucher: 'v_mf_paintroller', consumables: ['c_mf_white'] },
    alt: { deck: 'b_mf_rainbow', config: { voucher: 'v_mf_colourtheory' } },
  }),
  sleeve('blasphemy', 'Blasphemous Sleeve', 3, {
    apply() { spawn('j_mf_blasphemy', 1, (c) => { c.set_edition({ negative: true }); c.set_eternal(true); }); },
    alt: { deck: 'b_mf_blasphemy', apply() { spawn('j_mf_blasphemy', 1, (c) => { c.set_edition({ negative: true }); }); } },
  }),
];

/** The sleeves' texts (localization/en-us.lua descriptions.Sleeve; the mod's loc.js doesn't carry them). */
export const SLEEVE_LOC = {
  sleeve_mf_grosmichel: { name: 'Gros Michel Sleeve', text: ['Start run with {C:attention}Gros Michel'] },
  sleeve_mf_grosmichel_alt: { name: 'Gros Michel Sleeve', text: ['Start run with {C:attention}Cavendish'] },
  sleeve_mf_philosophical: { name: 'Philosophical Sleeve', text: ['Start run with 5', '{C:attention}Philosophical Jokers'] },
  sleeve_mf_philosophical_alt: { name: 'Philosophical Sleeve', text: ['Start run with 10', '{C:attention}Philosophical Jokers'] },
  sleeve_mf_rainbow: { name: 'Rainbow Sleeve', text: ['Start run with a {C:colourcard}White', '{C:colourcard}Colour{} card and the', '{C:tarot}Paint Roller{} Voucher'] },
  sleeve_mf_rainbow_alt: { name: 'Rainbow Sleeve', text: ['Start run with the', '{C:tarot}Colour Theory{} Voucher'] },
  sleeve_mf_blasphemy: { name: 'Blasphemous Sleeve', text: ['Start run with a {C:dark_edition}Negative{}', '{C:spectral}Eternal{} {C:attention}Blasphemy'] },
  sleeve_mf_blasphemy_alt: { name: 'Blasphemous Sleeve', text: ['Start run with a', '{C:dark_edition}Negative{} {C:attention}Blasphemy'] },
};

MOD_LOC.descriptions.Sleeve = Object.assign(MOD_LOC.descriptions.Sleeve || {}, SLEEVE_LOC);
