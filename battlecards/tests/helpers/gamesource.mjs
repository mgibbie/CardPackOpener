// gamesource.mjs — the text of "the old game.js", for tests that check source code.
//
// The game.js split moves sections into game_*.js modules (game_replays.js, game_lorequest.js, ...).
// A test that greps game.js for a piece of code would fail the moment that code moves, though
// nothing changed. Reading game.js plus every split-out game_*.js keeps those checks about WHAT
// the code does, not which file holds it. (The overworld's twin: overworld/tests/owsource.mjs.)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const BC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function gameSource() {
	const split = fs.readdirSync(BC).filter(f => /^game_.*\.js$/.test(f)).sort();
	return ['game.js', ...split].map(f => fs.readFileSync(path.join(BC, f), 'utf8')).join('\n');
}
