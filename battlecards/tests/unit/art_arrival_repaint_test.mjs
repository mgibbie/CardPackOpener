// Loot / reward faces kept their procedural placeholder although the CDN has the art
// (bug:1793824346933 + clarification 1793825281689).
// DIAGNOSIS (the "never requested" evidence was performance.getEntriesByType('resource'),
// whose buffer stops recording at 250 entries, so it can't prove absence late in a run):
//  1. miniFace() — every run reward/loot screen — painted once, then redrew on two FIXED timers
//     (0.7s, 2.2s). An image that arrived later (9 cold-cache crops at once) never repainted.
//  2. artFor() refused (returned null without starting a load) while index.json was still in
//     flight, and the index's arrival broadcast nothing — a face painted that early stayed a
//     placeholder until something unrelated repainted it.
// FIX: miniFace subscribes to artListeners and repaints when ITS art (or '*') arrives, dropping
// the listener once the canvas leaves the page; artFor remembers early asks and onArtIndex
// starts those loads when the index lands (their onload broadcasts as usual).
// Both files import browser-only modules, so the functions are extracted and run on fakes.
import fs from 'fs';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };
const read = f => fs.readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function fnSrc(src, name) {
	const i = src.search(new RegExp(`(^|\\n)(export )?function ${name}\\(`));
	if (i < 0) return null;
	const end = src.indexOf('\n}\n', i);
	return src.slice(i, end + 3);
}

// ---- 1) miniFace repaints on art arrival, however late ----
{
	const game = read('../../game.js');
	const body = fnSrc(game, 'miniFace');
	ok('found miniFace', !!body);
	let draws = 0;
	const artListeners = new Set();
	const fakeCanvas = () => ({ width: 512, height: 716, style: {}, dataset: {}, isConnected: true, getContext: () => ({ clearRect() {}, drawImage() {} }) });
	const drawCardFace = () => { draws++; return fakeCanvas(); };
	const timers = [];
	const make = new Function('drawCardFace', 'attachTip', 'artListeners', 'setTimeout', body + '; return miniFace;');
	const miniFace = make(drawCardFace, () => {}, artListeners, (fn, ms) => timers.push({ fn, ms }));
	const c = miniFace({ id: 'sleepy_dragon', name: 'Sleepy Dragon' });
	const d0 = draws;
	for (const t of timers) t.fn(); // all the fixed timers elapse first...
	const dTimers = draws;
	for (const fn of [...artListeners]) fn('sleepy_dragon'); // ...then the image finally arrives
	ok('a late art arrival repaints the reward face', draws > dTimers, `draws ${d0} -> timers ${dTimers} -> arrival ${draws}`);
	const dArr = draws;
	for (const fn of [...artListeners]) fn('some_other_card');
	ok('another card\'s art does not repaint it', draws === dArr, draws);
	c.isConnected = false; // the loot screen closed
	for (const fn of [...artListeners]) fn('sleepy_dragon');
	ok('a closed screen stops listening', draws === dArr && artListeners.size === 0, `draws=${draws} listeners=${artListeners.size}`);
}

// ---- 2) art asked for before index.json arrived is loaded once it does ----
{
	const art = read('../../cardart.js');
	const artFor = fnSrc(art, 'artFor');
	const onIdx = fnSrc(art, 'onArtIndex');
	ok('found artFor + onArtIndex', !!artFor && !!onIdx);
	if (artFor && onIdx) {
		const loads = [];
		class FakeImage { set src(v) { loads.push(v); this._src = v; } get src() { return this._src; } }
		const make = new Function('Image', 'artUrl', 'withArtFallback', 'artListeners',
			'let artIndex = null; const artImgs = new Map(); const artAskedEarly = new Set();' + artFor + onIdx +
			'; return { artFor, onArtIndex };');
		const api = make(FakeImage, id => 'cdn/' + id + '.jpg', img => img, new Set());
		ok('before the index: no art yet', api.artFor('emrakul_aeon_torn') === null);
		api.onArtIndex(['emrakul_aeon_torn', 'sleepy_dragon']);
		ok('the index arrival starts the early-asked load', loads.includes('cdn/emrakul_aeon_torn.jpg'), JSON.stringify(loads));
		ok('and only for asked ids', !loads.includes('cdn/sleepy_dragon.jpg'), JSON.stringify(loads));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
