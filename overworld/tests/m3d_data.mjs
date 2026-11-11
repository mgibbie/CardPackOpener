// m3d_data.mjs — for the MicaSurvivor 3D node tests: the 2D game's own data (moves, types, enemies, species, sprite
// sizes), loaded from its plain scripts into a sandbox, as micasurvivor/m3d/combat.js reads it in the browser.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../micasurvivor/js');
export const DATA_SCRIPTS = ['core/util.js', 'data/pokedex.js', 'data/sprites-meta.js', 'core/sprites.js', 'data/moves.js', 'data/types.js', 'data/enemies.js', 'expedition/moves.js'];

/** The game's global `G`, with the data scripts run. */
export function loadG() {
	const ctx = { console, Math, performance, setTimeout, clearTimeout };
	ctx.window = ctx; ctx.globalThis = ctx; ctx.G = {};
	ctx.document = { addEventListener() { }, createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, documentElement: { style: {} } };
	ctx.localStorage = { getItem: () => null, setItem() { } }; ctx.navigator = { userAgent: 'node' }; ctx.addEventListener = () => { };
	ctx.location = { search: '', hostname: 'localhost', href: '' };
	vm.createContext(ctx);
	// (expedition/moves.js registers its English texts with the game's translation table: a stand-in is enough here)
	ctx.G.I18n = { lang: 'en', add() { }, t: (s) => s, f: (s) => s };
	for (const f of DATA_SCRIPTS) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
	return ctx.G;
}
