// pocketenhanced_matchend_test.mjs — the end of a Pocket Enhanced match (pocketenhanced/js/main.js finish(),
// pocketenhanced/js/matchstats.js). Owner, 2026-11-18, of "a proper match end" on the improvement list: "yes to all".
//   0. matchStats on a log written by hand: attacks, damage and Knock Outs go to the card that made them; a Knock Out
//      nobody's attack made is the player's but no card's; a new turn ends an attack's credit
//   1. a whole match is played in the page (the game's own computer player on both seats): the end screen shows the
//      result and the stars, and "how it went": the numbers agree with the match's log counted independently here
//   2. "Your best card" is one of my deck's cards, with its Knock Outs, damage and attacks; pressing it reads it
//   3. today's missions are listed with their progress, and what this match added is marked
//   4. Rematch starts a new match with the same decks and rules and a new shuffle; New match is still there
//   node overworld/tests/pocketenhanced_matchend_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { matchStats } from '../../pocketenhanced/js/matchstats.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9598, SHOTS = process.env.POCKET_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };

// ===== 0. by hand =====
{
	const P = [{ name: "Red's Rival" }, { name: 'Blue' }];
	const log = [
		{ turn: 1, k: 'turn' },
		{ turn: 1, k: 'attack', seat: 0, msg: "Active A: Red's Rival's Charizard ex uses Slash on Blue's Active A." }, { turn: 1, k: 'damage', seat: 0, n: 60, msg: "Slash does 60 damage to Blue's Squirtle (Active A) [base 60]. (0/60 HP)" },
		{ turn: 1, k: 'attack', seat: 0, msg: "Active B: Red's Rival's Vulpix uses Tail Whip." },
		{ turn: 2, k: 'turn' },
		{ turn: 2, k: 'damage', seat: 0, n: 20, msg: "Burning does 20 damage to Blue's Wartortle (Active A). (60/80 HP)" },   // (an effect's damage in a later turn: the player's, no card's)
		{ turn: 2, k: 'attack', seat: 1, msg: "Active A: Blue's Squirtle uses Water Gun on Red's Rival's Active B." }, { turn: 2, k: 'damage', seat: 1, n: 30, msg: "Water Gun does 30 damage to Red's Rival's Vulpix (Active B). (0/50 HP)" }, { turn: 2, k: 'ko', seat: 0, msg: "Red's Rival's Vulpix is Knocked Out! Blue takes 1 point." },
		{ turn: 3, k: 'turn' },
		{ turn: 3, k: 'attack', seat: 0, msg: "Active A: Red's Rival's Charizard ex uses Crimson Storm on Blue's Active A." }, { turn: 3, k: 'damage', seat: 0, n: 200, msg: "Crimson Storm does 200 damage to Blue's Wartortle (Active A). (0/80 HP)" }, { turn: 3, k: 'ko', seat: 1, msg: "Blue's Wartortle is Knocked Out! Red's Rival takes 2 points." },
		{ turn: 4, k: 'turn' },
		{ turn: 4, k: 'ko', seat: 1, msg: "Blue's Squirtle is Knocked Out! Red's Rival takes 1 point." },   // (a Knock Out by poison between turns: hers, no card's)
		{ turn: 4, k: 'ko', seat: 1, msg: "Blue's Psyduck is Knocked Out! No one takes points for it." },   // (and one nobody scored)
		{ turn: 4, k: 'evolve', seat: 0 }, { turn: 4, k: 'damage', seat: 1, n: 97, msg: 'Rough Skin: Charizard ex takes 20 damage.' },   // (a counter: not damage dealt by an attack; its `n` is only the log line's number)
	];
	const s = matchStats(log, P), a = s.seats[0], b = s.seats[1];
	A(s.turns === 4 && a.attacks === 3 && a.damage === 280 && a.kos === 2 && a.lost === 1 && a.evolves === 1 && b.attacks === 1 && b.damage === 30 && b.kos === 1 && b.lost === 3, 'by hand: 4 turns; she attacked 3 times for 280 with 2 Knock Outs and lost 1; he attacked once for 30 with 1 Knock Out and lost 3 (one of them scored by nobody)', [s.turns, a, b]);
	A(a.mvp.name === 'Charizard ex' && a.mvp.kos === 1 && a.mvp.damage === 260 && a.mvp.attacks === 2 && a.cards[1].name === 'Vulpix' && a.cards[1].damage === 0 && b.mvp.name === 'Squirtle' && b.mvp.kos === 1, "the best card is Charizard ex (1 Knock Out, 260 damage, 2 attacks): the effect's 20 a turn later and the poison Knock Out are hers but no card's; a name with an apostrophe in it is read right", [a.cards, b.cards]);
	A(matchStats([], P).seats[0].mvp === null && matchStats(null, []).turns === 0, 'a match with no attacks has no best card');
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })));
	await page.goto(`http://localhost:${PORT}/pocketenhanced/`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(400);
	// ===== 1. a whole match =====
	const playOut = () => page.evaluate(async () => { const P = window.__pocket, { nextAction } = await import('/pocketenhanced/js/ai.js'); P.fast(true);
		for (let n = 0; n < 4000 && !P.state().over; n++) { const S = P.state(), seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find(p => !p.setup) || {}).seat : S.current; if (seat !== 0) { await new Promise(r => setTimeout(r, 10)); continue; }
			const banned = new Set(); for (let k = 0; k < 20; k++) { const a = nextAction(P.engine.view(S, 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); } await new Promise(r => setTimeout(r, 5)); }
		return !!P.state().over; });
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'end1' }));
	const over = await playOut();
	A(over && await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end')), 15000), 'a whole match is played to its end: the end screen opens');
	await sleep(500);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'matchend_1.png') }); }
	const got = await page.evaluate(() => { const P = window.__pocket, v = P.view(), log = v.log, n = k => +(document.querySelector(`[data-k="st-${k}"] b`) || { textContent: '-1' }).textContent.replace(/,/g, '');
		return { shown: { turns: n('turns'), kos: n('kos'), lost: n('lost'), damage: n('damage'), attacks: n('attacks') },
			counted: { turns: Math.max(...log.map(e => e.turn)), kos: log.filter(e => e.k === 'ko' && e.seat !== 0 && e.msg.includes(' ' + v.players[0].name + ' takes ')).length, lost: log.filter(e => e.k === 'ko' && e.seat === 0).length, damage: log.filter(e => e.k === 'damage' && e.seat === 0).reduce((a, e) => a + (+((/ does (\d+) damage to /.exec(e.msg) || [])[1]) || 0), 0), attacks: log.filter(e => e.k === 'attack' && e.seat === 0).length },
			note: (document.querySelector('.modal .pe-end .pe-note') || {}).textContent || '', title: ([...document.querySelectorAll('.modal .modal-title')].pop() || {}).textContent || '', earned: (document.querySelector('.pe-earned') || {}).textContent || '',
			mvp: (document.querySelector('[data-k="mvp"] .pe-mvptext') || {}).textContent || '', mvpName: (document.querySelector('[data-k="mvp"] .pe-mvptext b') || {}).textContent || '', deckNames: P.recipe().config.players[0].deck.map(id => P.engine.card ? P.engine.card(id).name : id),
			mis: [...document.querySelectorAll('[data-k="endmissions"] .pe-mis')].map(e => e.textContent.replace(/\s+/g, ' ').trim() + (e.classList.contains('up') ? ' [UP]' : '')), buttons: [...document.querySelectorAll('.modal:last-of-type .pe-list button')].map(b => b.dataset.k), focusFirst: (document.querySelector('.modal:last-of-type .b-again') || {}).dataset && document.querySelector('.modal:last-of-type .b-again').dataset.k, points: v.players.map(p => p.points), winner: v.over.winner }; });
	A(/wins|Nobody wins/.test(got.note) && /point/.test(got.note) && /You win!|Match over/.test(got.title) && /\+/.test(got.earned), 'it says who won and why, the points, and the stars earned', [got.note, got.title, got.earned]);
	A(JSON.stringify(got.shown) === JSON.stringify(got.counted) && got.shown.turns >= 3 && got.shown.attacks > 0 && got.shown.damage > 0 && (got.points[0] === 0 || got.shown.kos > 0), `"how it went": ${got.shown.turns} turns, ${got.shown.kos} Knock Outs, ${got.shown.lost} lost, ${got.shown.damage} damage, ${got.shown.attacks} attacks: each agrees with the match's log counted here`, [got.shown, got.counted]);
	// ===== 2. the best card =====
	const cardNames = await page.evaluate(async () => { const { CARDS } = await import('/pocketenhanced/js/data/cards.js'), P = window.__pocket; return P.recipe().config.players[0].deck.map(id => (CARDS.find(c => c.id === id) || {}).name); });
	A(/Your best card/.test(got.mvp) && cardNames.includes(got.mvpName) && /\d+ Knock Outs? · [\d,]+ damage · \d+ attacks?/.test(got.mvp), `"Your best card" is one from my deck (${got.mvpName}), with its Knock Outs, damage and attacks`, got.mvp);
	await page.evaluate(() => document.querySelector('[data-k="mvpcard"]').click()); await sleep(350);
	A(await page.evaluate(n => ((document.querySelector('.modal:last-of-type .pe-insp .big') || {}).textContent || '').replace(/\s+/g, '').includes(n.replace(/\s+/g, '')), got.mvpName), 'pressing it opens the card to read');
	await page.keyboard.press('Escape'); await sleep(250);
	// ===== 3. missions =====
	A(got.mis.length >= 1 && got.mis.every(t => /\d+ \/ \d+/.test(t)) && got.mis.some(t => /\[UP\]/.test(t) && /\+\d/.test(t)), "today's missions are listed with their progress, and the ones this match added to are marked with what it added", got.mis);
	// ===== 4. rematch =====
	A(got.buttons[0] === 'rematch' && got.buttons.includes('new') && got.buttons.includes('watch') && got.buttons.includes('leave') && got.focusFirst === 'rematch', 'the buttons: Rematch first (where a keyboard or controller starts), then New match, the replay, Menu', got.buttons);
	const cfg0 = await page.evaluate(() => { const c = window.__pocket.recipe().config; return { seed: c.seed, decks: c.players.map(p => p.deck.join()), names: c.players.map(p => p.name), opts: JSON.stringify(c.opts || null) }; });
	await page.evaluate(() => document.querySelector('.modal:last-of-type [data-k="rematch"]').click()); await sleep(600);
	const cfg1 = await page.evaluate(() => { const c = window.__pocket.recipe().config, v = window.__pocket.view(); return { seed: c.seed, decks: c.players.map(p => p.deck.join()), names: c.players.map(p => p.name), opts: JSON.stringify(c.opts || null), phase: v.phase, over: !!v.over, modals: document.querySelectorAll('.modal').length, points: v.players.map(p => p.points) }; });
	A(cfg1.phase === 'setup' && !cfg1.over && cfg1.modals === 0 && cfg1.seed !== cfg0.seed && JSON.stringify(cfg1.decks) === JSON.stringify(cfg0.decks) && JSON.stringify(cfg1.names) === JSON.stringify(cfg0.names) && cfg1.opts === cfg0.opts && cfg1.points.join() === '0,0', 'Rematch: a new match in setup, the same players, decks and rules, a new shuffle, 0 points each', [cfg0.seed, cfg1.seed, cfg1.phase]);
	// a singles match keeps its rule through a rematch
	await page.evaluate(() => window.__pocket.start({ players: 2, seed: 'end2', singles: true }));
	A(await playOut() && await waitFor(() => page.evaluate(() => !!document.querySelector('.modal .pe-end [data-k="st-turns"]')), 15000), '(a singles match played to its end)');
	await page.evaluate(() => document.querySelector('.modal:last-of-type [data-k="rematch"]').click()); await sleep(600);
	A(await page.evaluate(() => { const c = window.__pocket.recipe().config, v = window.__pocket.view(); return !!(c.opts && c.opts.singles) && v.singles === true && v.phase === 'setup'; }), 'its rematch is a singles match too');
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'matchend_2_rematch.png') });
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
