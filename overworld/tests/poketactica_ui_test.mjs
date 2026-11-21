// poketactica_ui_test.mjs — the camp's arrow keys (poketactica/js/nav.js): the focus moves to the nearest button the way
// the arrow points on screen, the same in a grid of cards, a row of tabs and a column of buttons.
//   node overworld/tests/poketactica_ui_test.mjs
import { spatialNext } from '../../poketactica/js/nav.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };

// a 3 x 2 grid of 100 x 120 cards, 10 apart, under a wide button (index 6) on the top right
const grid = [];
for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) grid.push({ x: c * 110, y: 60 + r * 130, w: 100, h: 120 });
grid.push({ x: 200, y: 0, w: 140, h: 40 });
A(spatialNext(grid, 0, 'right') === 1 && spatialNext(grid, 1, 'right') === 2, '→ goes to the next card in the row');
A(spatialNext(grid, 2, 'right') === 2, '→ at the row\'s end stays put');
A(spatialNext(grid, 1, 'down') === 4 && spatialNext(grid, 4, 'up') === 1, '↓ / ↑ go to the card in the same column');
A(spatialNext(grid, 3, 'left') === 3 && spatialNext(grid, 3, 'down') === 3, 'nothing that way: the focus stays');
A(spatialNext(grid, 2, 'up') === 6 && spatialNext(grid, 0, 'up') === 6, '↑ from the top row reaches the button above');
A(spatialNext(grid, 6, 'down') === 2, '↓ from the button goes to the card under it');
// a column of buttons
const col = [0, 1, 2, 3].map((i) => ({ x: 0, y: i * 60, w: 300, h: 50 }));
A(spatialNext(col, 0, 'down') === 1 && spatialNext(col, 3, 'up') === 2 && spatialNext(col, 3, 'down') === 3, 'a column: ↓ / ↑ step one button');
// a row of tabs of different widths, wrapped onto two lines
const tabs = [{ x: 0, y: 0, w: 180, h: 40 }, { x: 190, y: 0, w: 160, h: 40 }, { x: 40, y: 50, w: 200, h: 40 }];
A(spatialNext(tabs, 0, 'right') === 1 && spatialNext(tabs, 1, 'down') === 2 && spatialNext(tabs, 2, 'up') === 0, 'wrapped tabs: → along the line, ↓ / ↑ to the overlapping tab');
// hidden buttons (no size) are skipped; an empty list
A(spatialNext([{ x: 0, y: 0, w: 10, h: 10 }, { x: 20, y: 0, w: 0, h: 0 }, { x: 40, y: 0, w: 10, h: 10 }], 0, 'right') === 2, 'a hidden button (no size) is skipped');
A(spatialNext([], 0, 'down') === -1, 'no buttons: -1');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
