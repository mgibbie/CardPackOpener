// Also hosts the base game's own content switches: `pages` turns Micatro's Pages off for the run.
// The original Jokers use their center keys as option keys. Options are part of
// the run recipe, so continuing and replaying a run retains the same choices.
import DATA from '../../data/balatro_data.js';
import { registerMod, opt } from '../../js/mods/registry.js';

export const BASE_JOKERS = Object.entries(DATA.centers)
  .filter(([, c]) => c.set === 'Joker')
  .sort((a, b) => (a[1].order || 0) - (b[1].order || 0));

export const JOKER_TOGGLE = registerMod({
  id: 'jokertoggle', name: 'Joker Toggle', version: '1.0', contentRev: 1,
  // `pages`: Micatro's Pages (engine/pages.js; base game from engine rev 2) — on unless switched off here. Listed first.
  options: {
    pages: { default: true, label: 'Pages (pick a Page before every Blind)' },
    ...Object.fromEntries(BASE_JOKERS.map(([key, center]) => [key, {
      default: true, label: (DATA.loc.descriptions.Joker[key] || {}).name || center.name || key,
    }])),
  },
  hooks: {
    init_game_object(game) {
      for (const [key] of BASE_JOKERS) if (opt('jokertoggle', key) === false) game.banned_keys[key] = true;
    },
  },
});
