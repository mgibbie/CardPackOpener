// magepunknews_micatro_test.mjs — new Micatro cards show up on Magepunk News.
//   1. builds a throwaway git repo: commit 1 adds micatro/data/balatro_data.js (the
//      launch), commit 2 adds a brand-new joker + a tag, commit 3 is unrelated; runs the
//      REAL tools/gen-magepunknews.mjs in it and checks the feed: one launch entry with
//      per-set counts, one 'micatro' release listing exactly the two new cards (name,
//      set, rarity, cost, sprite pos), and no entry for the unrelated commit
//   2. renders magepunknews/index.html against that feed in headless Chrome: Micatro
//      filter, launch counts, chips with atlas thumbnails, hover tooltip, no errors
//   node overworld/tests/magepunknews_micatro_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8745;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- 1. generator over a synthetic history ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpnews-micatro-'));
const g = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
g('init', '-q', '-b', 'main');
g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
put('tools/gen-magepunknews.mjs', fs.readFileSync(path.join(ROOT, 'tools/gen-magepunknews.mjs'), 'utf8'));
put('battlecards/cards.json', JSON.stringify({ cards: [] }));
put('README.md', 'x');
g('add', '-A'); g('commit', '-q', '-m', 'init');
const realData = fs.readFileSync(path.join(ROOT, 'micatro/data/balatro_data.js'), 'utf8');
put('micatro/data/balatro_data.js', realData);
g('add', '-A'); g('commit', '-q', '-m', 'Micatro: launch');
const data = JSON.parse(realData.replace(/^[\s\S]*?export\s+default\s+/, '').replace(/;\s*$/, ''));
data.centers.j_newsprobe = { order: 999, name: 'News Probe', set: 'Joker', rarity: 2, cost: 7, pos: { x: 3, y: 4 }, config: {}, effect: '' };
data.tags.tag_newsprobe = { name: 'Probe Tag', set: 'Tag', order: 99, pos: { x: 1, y: 2 }, config: {} };
put('micatro/data/balatro_data.js', '// GENERATED\nexport default ' + JSON.stringify(data) + ';\n');
g('add', '-A'); g('commit', '-q', '-m', 'Micatro: News Probe joker + Probe Tag');
put('README.md', 'y');
g('add', '-A'); g('commit', '-q', '-m', 'docs only');
fs.mkdirSync(path.join(tmp, 'magepunknews'), { recursive: true });
execFileSync(process.execPath, ['tools/gen-magepunknews.mjs'], { cwd: tmp, encoding: 'utf8' });
const news = JSON.parse(fs.readFileSync(path.join(tmp, 'magepunknews/news.json'), 'utf8'));
const mc = news.entries.filter((e) => e.kind === 'micatro');
A(mc.length === 2, 'two Micatro entries (launch + release)', JSON.stringify(news.entries.map((e) => [e.kind, e.title])));
const launch = mc.find((e) => e.micatroLaunch);
A(launch && launch.title === 'Micatro: launch' && launch.micatroLaunch.Joker === 150 && launch.micatroLaunch.Tarot === 22 && launch.micatroLaunch['Boss Blind'] === 28, 'launch entry carries per-set counts', JSON.stringify(launch && launch.micatroLaunch));
const rel = mc.find((e) => e.micatro);
const probe = rel && rel.micatro.find((c) => c.key === 'j_newsprobe');
A(rel && rel.micatro.length === 2, 'the release lists exactly the 2 new cards', JSON.stringify(rel && rel.micatro));
A(probe && probe.name === 'News Probe' && probe.set === 'Joker' && probe.rarity === 'uncommon' && probe.cost === 7 && probe.pos.x === 3 && probe.pos.y === 4, 'new joker: name/set/rarity/cost/pos', JSON.stringify(probe));
A(rel && rel.micatro.some((c) => c.key === 'tag_newsprobe' && c.set === 'Tag'), 'new tag listed too');
A(!news.entries.some((e) => e.title === 'docs only'), 'unrelated commits stay out of the feed');
A(news.entries[0].title === 'Micatro: News Probe joker + Probe Tag', 'newest first');

// ---------- 2. the page renders the feed ----------
const feedJson = JSON.stringify({ ...news, micatroAtlas: { Joker: { src: '/micatro/assets/textures/Jokers.png', cw: 142, ch: 190, w: 1420, h: 1520 }, Tag: { src: '/micatro/assets/textures/tags.png', cw: 68, ch: 68, w: 408, h: 340 } } });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/magepunknews/news.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(feedJson); return; }
	if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1200, height: 900 });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto(`http://localhost:${PORT}/magepunknews/`, { waitUntil: 'networkidle0' });
	await page.click('button[data-f="micatro"]');
	const s = await page.evaluate(() => ({
		articles: document.querySelectorAll('article.micatro').length,
		others: document.querySelectorAll('article:not(.micatro)').length,
		badges: [...document.querySelectorAll('.badge.micatro')].map((b) => b.textContent),
		launch: (document.querySelector('.mc-launch') || {}).textContent || '',
		chip: (() => { const c = document.querySelector('a.mc-chip[data-mc="j_newsprobe"]'); if (!c) return null; const t = c.querySelector('.mc-thumb'); return { href: c.getAttribute('href'), text: c.textContent, bg: t.style.backgroundImage, pos: t.style.backgroundPosition }; })(),
		cta: !!document.querySelector('a.cta[href="/micatro/"]'),
	}));
	A(s.articles === 2 && s.others === 0, 'Micatro filter shows only the 2 Micatro entries', JSON.stringify(s));
	A(s.badges.some((b) => /Micatro launch/.test(b)) && s.badges.some((b) => /2 new Micatro cards/.test(b)), 'badges: launch + "2 new Micatro cards"', JSON.stringify(s.badges));
	A(/150\s*Jokers/.test(s.launch) && /28\s*Boss Blinds/.test(s.launch), 'launch shows per-set counts', s.launch);
	// thumbnail 28px wide → scale 28/142; pos (3,4) → -3*28, -4*190*28/142
	A(s.chip && /Jokers\.png/.test(s.chip.bg) && (([x, y]) => Math.abs(x + 3 * 28) < 0.01 && Math.abs(y + 4 * 190 * 28 / 142) < 0.01)(s.chip.pos.split(' ').map(parseFloat)) && s.chip.href === '/designwiki/#/micatro/jokers' && /News Probe/.test(s.chip.text), 'joker chip: atlas thumbnail at its pos + wiki link', JSON.stringify(s.chip));
	A(s.cta, 'Play Micatro button in the header');
	await page.hover('a.mc-chip[data-mc="j_newsprobe"]');
	await page.waitForFunction(() => getComputedStyle(document.getElementById('mc-tip')).display === 'block', { timeout: 5000 }).catch(() => {});
	const tip = await page.evaluate(() => { const t = document.getElementById('mc-tip'); return { shown: getComputedStyle(t).display === 'block', text: t.textContent }; });
	A(tip.shown && /News Probe/.test(tip.text) && /Uncommon Joker/.test(tip.text), 'hover shows the card tooltip', JSON.stringify(tip));
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
