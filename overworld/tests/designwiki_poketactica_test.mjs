// designwiki_poketactica_test.mjs — the design wiki's Poketactica page (designwiki/app.js poketacticaView, #/poketactica):
// what every held item, ability and move does in each way the game fights. The page writes nothing by hand: its cells
// are the sweeps' tables (poketactica/data/*_sweep.json, each held to a fresh measurement by its own suite:
// poketactica_item_sweep_test, poketactica_ability_sweep_test, poketactica_sweep_test). This suite checks the page
// shows those tables faithfully, in headless Chrome: every row, the game's own names and texts, the counts in the
// headings, the search box and the "show" choice, the sidebar link, no console errors, and no horizontal overflow on a phone.
//   node overworld/tests/designwiki_poketactica_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { HELD, TD_IDLE } from '../../poketactica/js/goods.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 9583;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
const MOVES = J('poketactica/data/move_sweep.json'), ABIL = J('poketactica/data/ability_sweep.json'), CHECKED = J('poketactica/data/ability_sweep_checked.json'), ITEMS = J('poketactica/data/item_sweep.json');
const MV_CHECKED = J('poketactica/data/move_sweep_checked.json');
const WIKI_AB = J('designwiki/data/abilities.json'), WIKI_MV = J('designwiki/data/moves.json');

// ---------- 1. the tables the page reads ----------
A(Object.keys(ITEMS).length === Object.keys(HELD).length && Object.keys(ABIL).every((id) => WIKI_AB[id]) && Object.keys(MOVES).every((id) => WIKI_MV[id]), 'every swept item is the game\'s, and every swept ability and move has a wiki entry to name it');
const abDead = Object.keys(ABIL).filter((id) => !ABIL[id].filter((s) => s !== 'pp').length && !CHECKED.includes(id));
const mvState = (r, id) => { const own = MV_CHECKED.includes(id), t = (r.turn.did || []).length || own, m = (r.maze.did || []).length || own, d = r.td && r.td !== 'none'; return t && m && d ? 'works' : !t && !m && !d ? 'nothing' : 'partial'; };
const mvN = (st) => Object.keys(MOVES).filter((id) => mvState(MOVES[id], id) === st).length;

// ---------- 2. the page ----------
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; }
try {
	for (const [name, vp] of [['desktop', { width: 1400, height: 900 }], ['phone', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
		const page = await browser.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		page.on('console', (m) => { if (m.type() === 'error' && !/favicon|404|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()); });
		await page.goto(`http://localhost:${PORT}/designwiki/#/poketactica`, { waitUntil: 'domcontentloaded' });
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('#pt-moves table tbody tr')), 30000), `${name}: the page renders`);
		const got = await page.evaluate(() => {
			const rows = (sel) => [...document.querySelectorAll(sel)].map((tr) => ({ id: tr.dataset.id, state: tr.dataset.state, cells: [...tr.children].map((td) => td.textContent.trim()) }));
			return {
				h1: document.querySelector('#content h1').textContent,
				sections: [...document.querySelectorAll('#content section')].map((s) => s.id),
				heads: Object.fromEntries([...document.querySelectorAll('#content section')].map((s) => [s.id, s.querySelector('h2').textContent + ' | ' + ((s.querySelector('.lp-tier-head p') || {}).textContent || '')])),
				items: rows('#pt-items tbody tr'), abilities: rows('#pt-abilities tbody tr'), moves: rows('#pt-moves tbody tr'),
				nav: [...document.querySelectorAll('#sidebar a')].filter((a) => a.getAttribute('href') === '#/poketactica').map((a) => ({ text: a.textContent, active: a.classList.contains('active') })),
				overflow: document.documentElement.scrollWidth - innerWidth,
			};
		});
		A(got.h1 === 'Poketactica' && ['pt-modes', 'pt-items', 'pt-abilities', 'pt-moves'].every((s) => got.sections.includes(s)), `${name}: every section is there (the three ways it fights, held items, abilities, moves)`, got.sections.join(','));
		// held items: the game's own name and text, and a cell per mode from the table
		const itemOk = got.items.every((r) => { const it = HELD[r.id], t = ITEMS[r.id]; return it && t && r.cells[0] === it.name && r.cells[1] === it.text && (r.cells[2] === 'Works') === !!t.turn.length && (r.cells[3] === 'Works') === !!t.maze.length && (r.cells[4] === 'Works') === !!t.td.length; });
		A(got.items.length === Object.keys(HELD).length && itemOk, `${name}: all ${Object.keys(HELD).length} held items, each with the game's own name and text and what the sweep measured in each mode`, JSON.stringify(got.items.filter((r) => !HELD[r.id]).slice(0, 3)));
		const idle = got.items.filter((r) => r.cells[4] === 'Nothing').map((r) => r.id).sort();
		A(JSON.stringify(idle) === JSON.stringify([...TD_IDLE].sort()) && got.heads['pt-items'].includes(idle.length + ' do nothing in Tower Defense') && got.items.every((r) => r.cells[2] === 'Works' && r.cells[3] === 'Works'), `${name}: the ${idle.length} that do nothing on a tower are the ones the game's held-item screen names; all work in battles and the maze`, idle.join(','));
		// abilities
		const abOk = got.abilities.every((r) => { const dead = abDead.includes(r.id); return ABIL[r.id] && r.cells[0] === WIKI_AB[r.id].name && (r.cells[2] === 'Nothing') === dead && r.state === (dead ? 'nothing' : 'works'); });
		A(got.abilities.length === Object.keys(ABIL).length && abOk, `${name}: all ${Object.keys(ABIL).length} abilities, named, each "Works" or "Nothing" as measured`, JSON.stringify(got.abilities.filter((r) => !ABIL[r.id]).slice(0, 3)));
		A(got.heads['pt-abilities'].includes((Object.keys(ABIL).length - abDead.length) + ' do something') && got.heads['pt-abilities'].includes(abDead.length + ' do nothing yet'), `${name}: the heading counts them (${Object.keys(ABIL).length - abDead.length} work, ${abDead.length} do nothing yet)`, got.heads['pt-abilities']);
		const by = Object.fromEntries(got.abilities.map((r) => [r.id, r.cells[2]]));
		A(/^Works: .*on landing/.test(by.intimidate) && /own test/.test(by.swiftswim) && by.prankster === 'Nothing' && /when it is struck/.test(by.sturdy), `${name}: Intimidate works on landing, Sturdy when struck, Swift Swim by its own test, Prankster nothing`, JSON.stringify([by.intimidate, by.swiftswim, by.prankster, by.sturdy]));
		// moves
		const mvOk = got.moves.every((r) => MOVES[r.id] && r.cells[0] === WIKI_MV[r.id].name && r.state === mvState(MOVES[r.id], r.id) && (r.cells[4] === 'Nothing') === (MOVES[r.id].td === 'none'));
		A(got.moves.length === Object.keys(MOVES).length && mvOk, `${name}: all ${Object.keys(MOVES).length} moves, named, each cell as measured`, JSON.stringify(got.moves.filter((r) => !MOVES[r.id]).slice(0, 3)));
		A(got.heads['pt-moves'].includes(mvN('works') + ' do something in all three') && got.heads['pt-moves'].includes(mvN('nothing') + ' do nothing anywhere yet'), `${name}: the heading counts them (${mvN('works')} everywhere, ${mvN('partial')} in some, ${mvN('nothing')} nowhere)`, got.heads['pt-moves']);
		{
			const mv = Object.fromEntries(got.moves.map((r) => [r.id, r.cells]));
			A(/own test/.test(mv.encore[2]) && mv.perishsong[2] === 'Nothing' && /costs HP/.test(mv.substitute[2]), `${name}: Encore works by its own test, Substitute costs HP, Perish Song nothing`, JSON.stringify([mv.encore[2], mv.perishsong[2], mv.substitute[2]]));
		}
		A(got.nav.length === 1 && got.nav[0].active, `${name}: the sidebar has its link, lit up`, JSON.stringify(got.nav));
		A(got.overflow <= 1, `${name}: no horizontal overflow`, String(got.overflow));
		if (name === 'desktop') {
			// the search box and the "show" choice
			const shown = () => page.evaluate(() => ({ n: [...document.querySelectorAll('#pt-abilities tbody tr')].filter((tr) => !tr.hidden).map((tr) => tr.dataset.id), count: document.querySelector('#pt-abilities .pt-wiki-bar span').textContent }));
			await page.type('#pt-abilities input[type=search]', 'swift');
			let v = await shown();
			A(v.n.includes('swiftswim') && v.n.length < 6 && v.count.startsWith(v.n.length + ' of '), `${name}: typing in the search box narrows the abilities`, JSON.stringify(v));
			await page.evaluate(() => { const q = document.querySelector('#pt-abilities input[type=search]'); q.value = ''; q.dispatchEvent(new Event('input')); });
			await page.select('#pt-abilities select', 'nothing');
			v = await shown();
			A(v.n.length === abDead.length && v.n.includes('prankster') && !v.n.includes('intimidate'), `${name}: "Does nothing yet" shows exactly those ${abDead.length}`, v.count);
			await page.select('#pt-items select', 'gap');
			const gap = await page.evaluate(() => [...document.querySelectorAll('#pt-items tbody tr')].filter((tr) => !tr.hidden).length);
			A(gap === TD_IDLE.length, `${name}: "Does nothing somewhere" shows the ${TD_IDLE.length} items idle on a tower`, String(gap));
			await page.evaluate(() => [...document.querySelectorAll('#content a')].find((a) => a.getAttribute('href') === '#pt-moves').click());
			await sleep(900);
			const j = await page.evaluate(() => ({ hash: location.hash, top: document.getElementById('pt-moves').getBoundingClientRect().top, h1: document.querySelector('#content h1').textContent }));
			A(j.hash === '#/poketactica' && j.h1 === 'Poketactica' && j.top < 400, `${name}: the "moves" link jumps down the page without leaving it`, JSON.stringify(j));
		}
		A(errors.length === 0, `${name}: no console errors`, errors.slice(0, 3).join(' | '));
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
