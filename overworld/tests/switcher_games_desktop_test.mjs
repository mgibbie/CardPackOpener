// switcher_games_desktop_test.mjs — the Games switcher from every game page, desktop
// (controls sweep B2): keyboard only and a fake controller open it, reach Home and
// launch another game. The driver: switcher_games_lib.mjs.
//
//   node overworld/tests/switcher_games_desktop_test.mjs
import { runViewport } from './switcher_games_lib.mjs';
process.exit(await runViewport('desktop') ? 1 : 0);
