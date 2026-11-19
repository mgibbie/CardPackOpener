// pocketenhanced_deckstats_test.mjs — deck stats (owner's fourth improvement list, 2026-11-19: "Win rate for each deck
// and against each type, from match history, so you can see which deck to fix").
// pocketenhanced/js/save.js record/addResult (decks[name].vs, .form); main.js deckStatsMenu / deckStatsOne.
//   1. the record keeps, for each deck, the matches and wins against each Energy type the other side played, and the
//      last 10 results; a record kept before this change still reads (its totals, nothing against types yet)
//   2. the page: a won match and a lost one with the same deck: Match history > Deck stats shows the deck, 50%, 1 won of
//      2, its last results (W, L); choosing it shows the type it played against: 1 of 2
//   node overworld/tests/pocketenhanced_deckstats_test.mjs
import { makeAsserter, startServer, launch, sleep, waitFor } from './ow_controls_lib.mjs';

const R = makeAsserter(), A = R.A;
// ===== 1. the record (save.js, on a stand-in localStorage) =====
{
	const mem = new Map();
	globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
	const SV = await import('../../pocketenhanced/js/save.js');
	mem.set(SV.RECORD_KEY, JSON.stringify({ played: 3, won: 2, lost: 1, decks: { Old: { played: 3, won: 2 } } }));
	const old = SV.record().decks.Old;
	A(old && old.played === 3 && old.won === 2 && Object.keys(old.vs || {}).length === 0 && (old.form || '') === '', 'a record from before: its totals, nothing against types yet', old);
	SV.addResult({ result: 'won', deck: 'Fire Deck', energy: ['Fire'], vs: ['Water'] });
	SV.addResult({ result: 'lost', deck: 'Fire Deck', energy: ['Fire'], vs: ['Water', 'Water'] });
	SV.addResult({ result: 'won', deck: 'Fire Deck', energy: ['Fire'], vs: ['Grass', 'Lightning'] });
	const d = SV.record().decks['Fire Deck'];
	A(d && d.played === 3 && d.won === 2 && d.vs && d.vs.Water.p === 2 && d.vs.Water.w === 1 && d.vs.Grass.p === 1 && d.vs.Grass.w === 1 && d.vs.Lightning.p === 1 && d.form === 'WLW', 'each deck: matches and wins against each type (a type counted once a match), and its results in order', d);
	for (let i = 0; i < 12; i++) SV.addResult({ result: i % 3 ? 'lost' : 'drawn', deck: 'Fire Deck', vs: ['Water'] });
	A(SV.record().decks['Fire Deck'].form === 'LLDLLDLLDLL'.slice(-10), 'the last 10 results are kept', SV.record().decks['Fire Deck'].form);
	mem.set(SV.RECORD_KEY, JSON.stringify({ played: 1, won: 1, decks: { X: { played: 1, won: 1, vs: { Water: { p: 1, w: 9 }, '<b>': { p: 1, w: 1 } }, form: 'WQ' } } }));
	const bad = SV.record().decks.X;
	A(bad.vs.Water.w === 1 && !bad.vs['<b>'] && bad.form === '', 'junk in a kept record is cleaned (wins no more than matches, no odd type names or results)', bad);
	delete globalThis.localStorage;
}
// ===== 2. the page =====
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
	await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument(() => { if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
		localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
		localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true, guided: { tour: 1, draft: 1, event: 1, setrewards: 1, binder: 1, emblems: 1 } })); });
	await page.goto(`http://localhost:${port}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(500);
	const playTo = async (winner, seed) => page.evaluate(async (w, seed) => {
		const P = window.__pocket; P.fast && P.fast(true); P.start({ players: 2, seed });
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		for (let n = 0; n < 3000 && !P.state().over; n++) { const S = P.state();
			if (S.phase === 'main' && S.turn >= 3) { await P.act({ t: 'concede', seat: 1 - w }); continue; }
			const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 10)); }
		return { winner: P.state().over && P.state().over.winner, opp: P.recipe().config.players[1].energy }; }, winner, seed);
	const m1 = await playTo(0, 'ds1'); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	await page.evaluate(() => document.querySelector('.modal [data-k="leave"]').click()); await sleep(400);
	const m2 = await playTo(1, 'ds2'); await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 8000);
	await page.evaluate(() => document.querySelector('.modal [data-k="leave"]').click()); await sleep(400);
	A(m1.winner === 0 && m2.winner === 1, '(a won match, then a lost one)', [m1, m2]);
	const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pocket_record_v1')));
	const [name, d] = Object.entries(rec.decks)[0] || [];
	await page.evaluate(() => document.querySelector('[data-k="replays"]').click()); await sleep(400);
	await page.evaluate(() => document.querySelector('.modal:last-child [data-k="dstats"]').click()); await sleep(400);
	const row = await page.evaluate(() => [...document.querySelectorAll('.modal:last-child .pe-dstat')].map(e => e.textContent));
	A(!!name && row.length === 1 && row[0].includes(name) && /50%/.test(row[0]) && /1 won of 2/.test(row[0]) && /WL/.test(row[0]), `Deck stats: "${name}", 50%, 1 won of 2, last results W L`, { row, d });
	await page.evaluate(n => document.querySelector(`.modal:last-child [data-k="ds:${n}"]`).click(), name); await sleep(400);
	const one = await page.evaluate(() => [...document.querySelectorAll('.modal:last-child .pe-dstt tr')].map(e => e.textContent));
	const types = [...new Set([...m1.opp, ...m2.opp])];
	A(one.length === types.length + 1 && types.every(t => one.some(r => r.includes(t))) && one.slice(1).every(r => /of [12]/.test(r)), 'choosing it: each type it played against, with wins of matches', { one, types });
	A(!errors.length, 'no page errors', errors.slice(0, 3));
	await ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
