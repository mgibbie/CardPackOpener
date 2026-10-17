// magepunknews_micasurvivor_test.mjs — MicaSurvivor's launch shows up on Magepunk News.
//   1. builds a throwaway git repo: commit 1 is unrelated game work, commit 2 adds the port's
//      game files (M1), commit 3 adds micasurvivor/js/mica/account.js + the design wiki data (M3, the
//      launch on Magepunk), commit 4 touches the docs only; runs the REAL tools/gen-magepunknews.mjs
//      in it: exactly one 'micasurvivor' entry, on commit 3, with the blurb, the counts from
//      designwiki/data/micasurvivor.json and the Play / Design wiki links; commit 2 is a patch note
//   2. renders magepunknews/index.html against that feed in headless Chrome: the MicaSurvivor
//      filter, badge, tile art, counts, links; the header's Play MicaSurvivor button; no errors
//   node overworld/tests/magepunknews_micasurvivor_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8748;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- 1. generator over a synthetic history ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpnews-micasurvivor-'));
const g = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
g('init', '-q', '-b', 'main');
g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
put('tools/gen-magepunknews.mjs', fs.readFileSync(path.join(ROOT, 'tools/gen-magepunknews.mjs'), 'utf8'));
put('battlecards/cards.json', JSON.stringify({ cards: [] }));
put('overworld/foo.js', '1');
g('add', '-A'); g('commit', '-q', '-m', 'init');
put('micasurvivor/js/game.js', '// the port');
put('micasurvivor/js/mica/credits.js', '// credits');
g('add', '-A'); g('commit', '-q', '-m', 'MicaSurvivor M1: port PokéSurvivor');
put('micasurvivor/js/mica/account.js', '// accounts');
put('designwiki/data/micasurvivor.json', fs.readFileSync(path.join(ROOT, 'designwiki/data/micasurvivor.json'), 'utf8'));
g('add', '-A'); g('commit', '-q', '-m', 'MicaSurvivor M3: into Magepunk', '-m', 'Landing tile, Pewter Museum cabinet, accounts, leaderboard.\n\nCo-Authored-By: someone <x@y>');
put('README.md', 'docs');
g('add', '-A'); g('commit', '-q', '-m', 'docs only');
fs.mkdirSync(path.join(tmp, 'magepunknews'), { recursive: true });
const out = execFileSync(process.execPath, ['tools/gen-magepunknews.mjs'], { cwd: tmp, encoding: 'utf8' });
const news = JSON.parse(fs.readFileSync(path.join(tmp, 'magepunknews/news.json'), 'utf8'));
const ms = news.entries.filter(e => e.kind === 'micasurvivor');
A(ms.length === 1 && ms[0].title === 'MicaSurvivor M3: into Magepunk', 'one MicaSurvivor launch entry, on the commit that adds the accounts bridge', JSON.stringify(news.entries.map(e => [e.kind, e.title])));
const L = ms[0] && ms[0].micasurvivorLaunch;
const W = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micasurvivor.json'), 'utf8'));
A(L && L.play === '/micasurvivor/' && L.wiki === '/designwiki/#/micasurvivor' && /PokéSurvivor by JPTER78/.test(L.blurb) && /Pewter Museum/.test(L.blurb), 'the launch carries the blurb (credit, cabinet) and the Play / wiki links', JSON.stringify(L));
A(L && L.counts['Pokémon'] === W.counts.pokemon && L.counts.Moves === W.counts.moves && L.counts.Starters === W.counts.starters, 'its counts come from the design wiki data at that commit', JSON.stringify(L && L.counts));
A(ms[0] && /Landing tile/.test(ms[0].body) && !/Co-Authored-By/.test(ms[0].body), 'the commit body rides along as the details (trailers stripped)');
A(news.entries.some(e => e.kind === 'patch' && /M1: port/.test(e.title)), 'the earlier MicaSurvivor work is a patch note');
A(!news.entries.some(e => e.title === 'docs only'), 'unrelated commits stay out of the feed');
A(/MicaSurvivor launch/.test(out), 'the generator reports the launch', out.trim());

// ---------- 2. the page renders it ----------
const feedJson = JSON.stringify(news);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/magepunknews/news.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(feedJson); return; }
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1200, height: 900 });
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.goto(`http://localhost:${PORT}/magepunknews/`, { waitUntil: 'networkidle0' });
	await page.click('button[data-f="micasurvivor"]');
	const s = await page.evaluate(() => {
		const a = document.querySelector('article.micasurvivor');
		const img = a && a.querySelector('.ms-launch img');
		return {
			articles: document.querySelectorAll('article.micasurvivor').length, others: document.querySelectorAll('article:not(.micasurvivor)').length,
			badge: a ? a.querySelector('.badge').textContent : '', text: a ? a.textContent : '',
			img: img ? { src: img.getAttribute('src'), w: img.naturalWidth } : null,
			play: !!(a && a.querySelector('a[href="/micasurvivor/"]')), wiki: !!(a && a.querySelector('a[href="/designwiki/#/micasurvivor"]')),
			cta: !!document.querySelector('a.cta[href="/micasurvivor/"]'),
		};
	});
	A(s.articles === 1 && s.others === 0, 'the MicaSurvivor filter shows only the launch', JSON.stringify(s));
	A(/MicaSurvivor launch/.test(s.badge), 'badge: "MicaSurvivor launch"', s.badge);
	A(s.img && s.img.src === '/micasurvivor/icons/tile.png' && s.img.w === 96, 'the launch shows the tile art', JSON.stringify(s.img));
	A(new RegExp(W.counts.pokemon + '\\s*Pokémon').test(s.text) && /JPTER78/.test(s.text) && s.play && s.wiki, 'counts, the credit, Play + Design wiki links', s.text.slice(0, 300));
	A(s.cta, 'a Play MicaSurvivor button in the header');
	await page.click('button[data-f="all"]');
	A(await page.evaluate(() => document.querySelectorAll('article').length) === news.entries.length, 'All shows every entry');
	A(errors.length === 0, 'no page errors', errors.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: exception', e && e.stack);
} finally {
	if (browser) await browser.close();
	server.close();
	fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
