// game_rules_test.mjs — every game in the Games switcher follows the house rules (game_rules.mjs; what they mean and how
// to meet them: Plans/NEW_GAME_RULES.md): the Balatro / Micatro UI kit and its button sounds, keyboard + controller +
// touch through site/input.js and the switcher, stars as the currency, and live watching + replays + clips + bets. It
// reads the real registries (switcher ENTRIES, livewatch, the watch hub, replaylib, server/mp.mjs, server/bets.mjs MARK,
// LANES) and each game's own source, so a game added to the switcher without one of them fails here, naming what's missing.
// Pure: reads files, runs nothing.
//   node overworld/tests/game_rules_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GAMES } from './game_rules.mjs';
import { LANES } from './select-changed.mjs';
import { MARK } from '../../server/bets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };

// The ONLY waivers there will ever be: the games that predate the rules (2026-11-20), and only for these rules. A new
// game is never added here; a game that comes into line has its waiver removed (the test says so).
const WAIVABLE = Object.freeze({
	scoundrel: ['stars'], micatro: ['stars'], micasurvivor: ['stars'], pokechess: ['stars'], battlecards: ['stars'],
	overworld: ['stars', 'controls'], factory: ['stars', 'controls'],
});
const RULES = ['ui', 'controls', 'stars', 'watch', 'gate'];

// ---- the registries, as the site has them
const keysOf = (src, name) => {
	const m = src.match(new RegExp('(?:const|let)\\s+' + name + '\\s*=\\s*(?:Object\\.freeze\\()?\\{([\\s\\S]*?)\\}'));
	return m ? [...m[1].matchAll(/(?:^|[,{\s])'?([A-Za-z0-9_]+)'?\s*:/g)].map((x) => x[1]) : [];
};
const switcherSrc = read('site/switcher.js');
const entriesBlock = switcherSrc.slice(switcherSrc.indexOf('export const ENTRIES'), switcherSrc.indexOf('];', switcherSrc.indexOf('export const ENTRIES')));
const ENTRIES = [...entriesBlock.matchAll(/\{\s*id:\s*'([^']+)'[^\n]*/g)].map((m) => ({ id: m[1], extra: /extra:\s*true/.test(m[0]) }));
const SWITCHER_GAMES = ENTRIES.filter((e) => !e.extra && e.id !== 'home').map((e) => e.id);
const pagesSrc = read('overworld/tests/switcher_games_lib.mjs');
const SWITCHER_TESTED = [...pagesSrc.slice(pagesSrc.indexOf('export const PAGES')).matchAll(/\{\s*id:\s*'([^']+)'/g)].map((m) => m[1]);
const watchSrc = read('watch/watch.js'), KIND_NAME = keysOf(watchSrc, 'KIND_NAME'), KIND_ICON = keysOf(watchSrc, 'KIND_ICON');
const livewatchSrc = read('site/livewatch.js');
const replaySrc = read('site/replaylib.js'), GAME_NAME = keysOf(replaySrc, 'GAME_NAME'), GAME_ICON = keysOf(replaySrc, 'GAME_ICON');
const mpSrc = read('server/mp.mjs'), SOLO_LIVE = keysOf(mpSrc, 'SOLO_LIVE');

// ---- a game's own source: its folders' .js/.mjs/.html (not tests, data or art)
const SKIP = /(^|\/)(tests|data|art|assets|node_modules|vendor|lib|og)(\/|$)/;
const corpusCache = new Map();
function corpus(srcs) {
	const key = srcs.join('|');
	if (corpusCache.has(key)) return corpusCache.get(key);
	let out = '';
	const walk = (rel) => {
		const abs = path.join(ROOT, rel);
		if (!fs.existsSync(abs)) return;
		if (fs.statSync(abs).isFile()) { if (/\.(m?js|html)$/.test(rel)) out += '\n' + fs.readFileSync(abs, 'utf8'); return; }
		for (const d of fs.readdirSync(abs)) { const r = rel.replace(/\/$/, '') + '/' + d; if (!SKIP.test(r) && !out_.some((x) => (r + '/').startsWith(x))) walk(r); }
	};
	const out_ = srcs.filter((s) => s.startsWith('!')).map((s) => s.slice(1).replace(/\/?$/, '/'));
	for (const s of srcs) if (!s.startsWith('!')) walk(s);
	corpusCache.set(key, out);
	return out;
}

// does the source call site/stars.js's own fn (not another earn(), e.g. the overworld's Bag.earn for Pokémon money)?
function starsCalls(src, fn) {
	for (const m of src.matchAll(/import\s+(\*\s+as\s+(\w+)|\{([^}]*)\})\s+from\s+['"][^'"]*site\/stars\.js['"]/g)) {
		if (m[2] && new RegExp('\\b' + m[2] + '\\.' + fn + '\\s*\\(').test(src)) return true;
		if (m[3]) for (const part of m[3].split(',')) { const [name, as] = part.trim().split(/\s+as\s+/); if (name === fn && new RegExp('\\b' + (as || name) + '\\s*\\(').test(src)) return true; }
	}
	return false;
}

// ---- each rule: a list of [ok, what's missing]
function check(g) {
	const html = fs.existsSync(path.join(ROOT, g.page)) ? read(g.page) : '';
	const src = corpus(g.src) + '\n' + html;
	const lane = LANES.find((l) => l.name === g.lane);
	const solo = (g.publish.match(/^publish-(\w+)$/) || [])[1];
	return {
		ui: [
			[/site\/ui\/balatro\.css|(^|["'\/])css\/micatro\.css/.test(html), `${g.page} loads the kit (site/ui/balatro.css, or micatro/css/micatro.css which imports it)`],
			[/ui\/sfx\.js|\/sound\.js['"]/.test(src), 'its buttons use the kit\'s sounds (site/ui/sfx.js, or Micatro\'s js/ui/sound.js)'],
		],
		controls: [
			[/site\/input\.js/.test(src) && /startInput\s*\(/.test(src), 'it reads keyboard + controller through site/input.js startInput({..., pad: true})'],
			[/site\/(topbar|switcher)\.js/.test(html), `${g.page} loads the Games switcher (site/topbar.js, or site/switcher.js)`],
			[SWITCHER_TESTED.includes(g.id), 'switcher_games_lib.mjs PAGES boots it (switcher + ⚙️ in all three viewports)'],
		],
		stars: [
			[starsCalls(src, 'earn') && starsCalls(src, 'sync'), 'it pays stars: site/stars.js earn(n) then sync(call)'],
		],
		watch: [
			[src.includes(`'${g.publish}'`) || (solo && src.includes(`publish-${solo}`)), `it publishes a live run (${g.publish})`],
			[mpSrc.includes(`'${g.publish}'`) || SOLO_LIVE.includes(solo), `server/mp.mjs takes ${g.publish} (SOLO_LIVE, or its own case)`],
			[new RegExp(`kind === '${g.kind}'`).test(livewatchSrc), `site/livewatch.js watchHref sends a viewer to it (kind '${g.kind}')`],
			[KIND_NAME.includes(g.kind) && KIND_ICON.includes(g.kind), `watch/watch.js KIND_NAME + KIND_ICON name it ('${g.kind}')`],
			[GAME_NAME.includes(g.replay) && GAME_ICON.includes(g.replay) && replaySrc.includes(`case '${g.replay}':`), `site/replaylib.js lists its replays (GAME_NAME, GAME_ICON, replayHref '${g.replay}')`],
			[/site\/clip\.js/.test(src), 'its replay viewer offers clip links (site/clip.js)'],
			[Object.prototype.hasOwnProperty.call(MARK, g.bets), `server/bets.mjs MARK has '${g.bets}' (when betting closes)`],
			[/\bbet\s*:|site\/bets\.js|ow_bets/.test(src), 'its publish reports the bet (startPublisher(..., { bet }) or site/bets.js)'],
		],
		gate: [
			[!!lane, `select-changed.mjs LANES has a '${g.lane}' row`],
			[!lane || lane.name === 'overworld' || lane.paths.test(g.page), `the '${g.lane}' lane's paths cover ${g.page}`],
		],
	};
}

// ---- 1. the manifest and the switcher list the same games
A(SWITCHER_GAMES.length >= 9, `the switcher's games: ${SWITCHER_GAMES.join(', ')}`);
for (const id of SWITCHER_GAMES) A(GAMES.some((g) => g.id === id), `${id}: has a row in game_rules.mjs (every game in the switcher follows the rules)`);
for (const g of GAMES) A(SWITCHER_GAMES.includes(g.id), `${g.id}: is in the Games switcher (site/switcher.js ENTRIES)`);
A(new Set(GAMES.map((g) => g.id)).size === GAMES.length, 'no game is listed twice');

// ---- 2. every rule, every game
for (const g of GAMES) {
	const waive = g.waive || {};
	for (const r of Object.keys(waive)) A(RULES.includes(r) && (WAIVABLE[g.id] || []).includes(r), `${g.id}: its '${r}' waiver is one of the frozen ones (a new game follows every rule)`);
	const res = check(g);
	for (const r of RULES) {
		const misses = res[r].filter(([ok]) => !ok).map(([, m]) => m);
		if (waive[r]) A(misses.length > 0, `${g.id}: ${r} is waived (${waive[r]})`, 'it now follows this rule: remove the waiver from game_rules.mjs and WAIVABLE');
		else for (const [ok, m] of res[r]) A(ok, `${g.id} ${r}: ${m}`);
	}
}

// ---- 3. the test can tell: a game with nothing wired in fails every rule
{
	const res = check({ id: 'nogame', page: 'nogame/index.html', src: ['nogame/'], kind: 'nogame', publish: 'publish-nogame', replay: 'nogame', bets: 'nogame', lane: 'nogame' });
	A(RULES.every((r) => res[r].some(([ok]) => !ok)), 'an unwired game fails every rule (the checks are not vacuous)');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
