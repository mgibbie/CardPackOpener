// gen_designwiki.mjs — designwiki/data/micasurvivor.json, the design wiki's MicaSurvivor reference
// (designwiki/app.js micasurvivor*View), generated from the game's own data files:
//   micasurvivor/js/data/{pokedex,starters,moves,items,upgrades}.js (+ lang-en.js for the English
//   names: the game is written in Spanish and translated on the fly, js/core/i18n.js).
// The scripts are loaded in a sandbox with a stub browser; nothing is copied by hand.
//   node tools/micasurvivor/gen_designwiki.mjs           (write)
//   node tools/micasurvivor/gen_designwiki.mjs --check   (exit 1 if the file is out of date)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const JS = path.join(ROOT, 'micasurvivor/js');
const OUT = path.join(ROOT, 'designwiki/data/micasurvivor.json');

export function build() {
	const store = { micasurvivor_lang: 'en' };
	const noop = () => {};
	const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, setAttribute: noop, getContext: () => null });
	const sandbox = {
		console, Math, JSON, Date, Object, Array, Set, Map, Number, String, RegExp, Promise, Symbol, Infinity, NaN, isFinite, parseInt, parseFloat,
		localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
		location: { pathname: '/micasurvivor/', search: '', hostname: 'localhost', protocol: 'http:' },
		navigator: { language: 'en', languages: ['en'] },
		document: { documentElement: {}, createElement: el, getElementById: () => null, querySelectorAll: () => [], addEventListener: noop, fonts: null },
		CanvasRenderingContext2D: function () {}, Image: function () {}, addEventListener: noop, setTimeout, clearTimeout,
	};
	sandbox.CanvasRenderingContext2D.prototype = { fillText: noop, strokeText: noop, measureText: noop };
	sandbox.window = sandbox;
	sandbox.confirm = noop; sandbox.alert = noop;
	vm.createContext(sandbox);
	for (const f of ['core/util.js', 'core/i18n.js', 'data/lang-en.js', 'data/pokedex.js', 'data/types.js', 'data/moves.js', 'data/starters.js', 'data/items.js', 'data/upgrades.js']) {
		vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
	}
	const G = sandbox.G;
	const T = s => G.I18n.t(s);
	if (G.I18n.lang !== 'en') throw new Error('i18n did not switch to English');
	const name = d => (G.DEX_BY[d] || {}).name || '#' + d;

	const moves = G.Moves.ALL.map(m => {
		const evo = G.Moves.EVO[m.id];
		return {
			id: m.id, name: T(m.name), type: m.type, kind: m.kind, desc: T(m.desc),
			cd: m.cd ?? null, dmg: m.dmg ?? null, maxLvl: m.maxLvl,
			...(evo ? { evo: { name: T(evo[0]), needs: T(G.Moves.NEED_NAME[evo[1]] || evo[1]) } } : {}),
		};
	});
	const starters = G.STARTERS.map(s => ({
		dex: s.dex, name: name(s.dex), types: (G.DEX_BY[s.dex] || {}).types || [],
		start: T((G.Moves.BY_ID[s.start] || {}).name || s.start),
	}));
	const items = G.Items.LIST.map(i => ({ id: i.id, name: T(i.name), desc: T(i.desc) }));
	const upgrades = G.Upgrades.LIST.map(u => ({ id: u.id, name: T(u.name), unit: T(u.unit), max: u.max }));
	const pokemon = G.DEX.map(p => [p.dex, p.name, p.types, p.rarity, p.gen, p.leg ? 1 : 0]);
	return {
		source: 'micasurvivor/js/data (tools/micasurvivor/gen_designwiki.mjs)',
		counts: { pokemon: pokemon.length, legendaries: pokemon.filter(p => p[5]).length, starters: starters.length, moves: moves.length, items: items.length, upgrades: upgrades.length },
		starters, moves, items, upgrades, pokemon,
	};
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const text = JSON.stringify(build()) + '\n';
	if (process.argv.includes('--check')) {
		const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
		if (cur !== text) { console.error('designwiki/data/micasurvivor.json is out of date: node tools/micasurvivor/gen_designwiki.mjs'); process.exit(1); }
		console.log('designwiki/data/micasurvivor.json is up to date');
	} else {
		fs.writeFileSync(OUT, text);
		const d = JSON.parse(text);
		console.log(`designwiki/data/micasurvivor.json: ${JSON.stringify(d.counts)} (${text.length} bytes)`);
	}
}
