// switcher_games_landscape_test.mjs — the Games switcher from every game page, landscape
// (controls sweep B2): keyboard only and a fake controller open it, reach Home and
// launch another game; a tap on the page's ⚙️ opens it. The driver: switcher_games_lib.mjs.
//
//   node overworld/tests/switcher_games_landscape_test.mjs
import { runViewport } from './switcher_games_lib.mjs';
process.exit(await runViewport('landscape') ? 1 : 0);
