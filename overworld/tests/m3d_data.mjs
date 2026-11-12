// m3d_data.mjs — for the MicaSurvivor 3D node tests: the 2D game's own data (moves, types, enemies, species, sprite
// sizes), loaded from its plain scripts into a sandbox, as micasurvivor/m3d/combat.js reads it in the browser.
import vm from 'vm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../micasurvivor/js');
export const DATA_SCRIPTS = ['core/util.js', 'data/pokedex.js', 'data/sprites-meta.js', 'core/sprites.js', 'data/moves.js', 'data/types.js', 'data/enemies.js', 'systems/weather.js', 'systems/abilities.js', 'data/items.js', 'data/mega-data.js', 'data/forms.js', 'systems/forms.js', 'expedition/moves.js', "expedition/terrain.js", "expedition/tiers.js", "expedition/classic.js", "expedition/items.js", "expedition/levelups.js", "expedition/league-data.js", "expedition/league.js", "expedition/mega.js", "expedition/economy.js", "expedition/capture.js", "expedition/survival.js", "expedition/reactions.js", "systems/zmoves.js", "expedition/ultimates.js"];

/** The game's global `G`, with the data scripts run. */
export function loadG(extra = [], o = {}) {   // (o.localStorage: a store of the test's own; o.pre(G): before the scripts run)
	const ctx = { console, Math, performance, setTimeout, clearTimeout };
	ctx.window = ctx; ctx.globalThis = ctx; ctx.G = {};
	ctx.document = { addEventListener() { }, createElement: () => ({ getContext: () => null, style: {} }), getElementById: () => null, documentElement: { style: {} }, head: { appendChild() { } } };
	ctx.localStorage = o.localStorage || { getItem: () => null, setItem() { } }; ctx.crypto = globalThis.crypto; ctx.Date = Date; ctx.JSON = JSON; ctx.navigator = { userAgent: 'node' }; ctx.addEventListener = () => { };
	ctx.location = { search: '', hostname: 'localhost', href: '' };
	vm.createContext(ctx);
	// (expedition/moves.js registers its English texts with the game's translation table: a stand-in is enough here)
	ctx.G.I18n = { lang: 'en', en: {}, add(o) { Object.assign(this.en, o); }, t: (s) => s, f: (s) => s };
	if (o.pre) o.pre(ctx.G);
	for (const f of DATA_SCRIPTS.concat(extra)) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
	return ctx.G;
}
