// magepunknews_micatro_mods_test.mjs — Micatro MOD releases and new mod cards show up on Magepunk
// News automatically, like new Micatro cards do (tools/gen-magepunknews.mjs + micatro/dump_mod_items.mjs).
//   1. a throwaway git repo: commit 1 is unrelated; commit 2 adds micatro/ (engine, data, and two
//      mods: Milatro + Tag Team) — a launch entry with a release block per mod (per-set counts) and
//      the three built-in features (big numbers, deck editor, replays); commit 3 gives Tag Team a
//      brand-new joker — a 'micatro' entry listing exactly that card (name, set, rarity, cost, atlas,
//      pos); commit 4 only touches a mod's comments — no entry
//   2. renders magepunknews/index.html against that feed: badges, mod blocks, the feature cards,
//      the new card's chip (its mod atlas thumbnail, a link to its wiki card) and its hover text
//   node overworld/tests/magepunknews_micatro_mods_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8747;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- 1. generator over a synthetic history
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpnews-mods-'));
const g = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
const copyDir = (rel, skip = /[\\/]assets([\\/]|$)/) => {
	for (const f of fs.readdirSync(path.join(ROOT, rel), { recursive: true })) {
		const r = path.join(rel, String(f));
		if (skip.test(r) || fs.statSync(path.join(ROOT, r)).isDirectory()) continue;
		put(r, fs.readFileSync(path.join(ROOT, r)));
	}
};
g('init', '-q', '-b', 'main');
g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
put('tools/gen-magepunknews.mjs', fs.readFileSync(path.join(ROOT, 'tools/gen-magepunknews.mjs')));
put('tools/micatro/dump_mod_items.mjs', fs.readFileSync(path.join(ROOT, 'tools/micatro/dump_mod_items.mjs')));
put('battlecards/cards.json', JSON.stringify({ cards: [] }));
put('README.md', 'x');
g('add', '-A'); g('commit', '-q', '-m', 'init');
copyDir('micatro/js'); copyDir('micatro/data'); copyDir('micatro/mods/milatro'); copyDir('micatro/mods/tagteam');
g('add', '-A'); g('commit', '-q', '-m', 'Micatro with mods');
const TT = 'micatro/mods/tagteam/index.js';
const ttSrc = fs.readFileSync(path.join(tmp, TT), 'utf8');
put(TT, ttSrc + `\n// (test) a brand-new Tag Team joker\nimport { P_CENTERS as __P } from '../../js/engine/core.js';\nimport { ATLASES as __A } from '../../js/mods/registry.js';\n` +
	`__P.j_newsprobe_mod = { key: 'j_newsprobe_mod', set: 'Joker', mod: 'tagteam', name: 'Mod News Probe', rarity: 2, cost: 6, pos: { x: 0, y: 0 }, atlas: Object.keys(__A).find((k) => __A[k].mod === 'tagteam'), config: {} };\n`);
g('add', '-A'); g('commit', '-q', '-m', 'Tag Team: a new joker');
put(TT, fs.readFileSync(path.join(tmp, TT), 'utf8') + '\n// just a comment\n');
g('add', '-A'); g('commit', '-q', '-m', 'Tag Team: comment only');
fs.mkdirSync(path.join(tmp, 'magepunknews'), { recursive: true });
execFileSync(process.execPath, ['tools/gen-magepunknews.mjs'], { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
const news = JSON.parse(fs.readFileSync(path.join(tmp, 'magepunknews/news.json'), 'utf8'));
const byTitle = t => news.entries.find(e => e.title === t);
const launch = byTitle('Micatro with mods');
const mods = (launch && launch.micatroMods) || [];
const mil = mods.find(m => m.id === 'milatro'), tt = mods.find(m => m.id === 'tagteam');
A(launch && launch.kind === 'micatro', 'the commit that adds the mods is a Micatro entry', JSON.stringify(news.entries.map(e => [e.kind, e.title])));
A(mil && mil.launch && mil.launch.Joker === 30 && mil.total === 30 && mil.name === 'Milatro', 'Milatro release: 30 Jokers', JSON.stringify(mil));
A(tt && tt.launch && tt.launch.Joker === 1, 'Tag Team release: 1 Joker', JSON.stringify(tt));
A(mods.length === 2, 'only the mods in the tree are released (the rest of the manifest is absent there)', mods.map(m => m.id).join(','));
const feats = (launch && launch.micatroFeatures || []).map(f => f.id).sort().join();
A(feats === 'big-numbers,deck-editor,replays', 'the built-in features are announced with the files that add them', feats);
const rel = byTitle('Tag Team: a new joker');
const added = rel && rel.micatroMods && rel.micatroMods.length === 1 && rel.micatroMods[0].added;
const probe = added && added[0];
A(rel && rel.kind === 'micatro' && added && added.length === 1, 'the new mod joker is a Micatro release listing exactly 1 card', JSON.stringify(rel && rel.micatroMods));
A(probe && probe.key === 'j_newsprobe_mod' && probe.name === 'Mod News Probe' && probe.set === 'Joker' && probe.rarity === 'uncommon' && probe.cost === 6 && probe.pos.x === 0 && /^@/.test(probe.atlas || ''), 'new mod card: name/set/rarity/cost/atlas/pos', JSON.stringify(probe));
A(!byTitle('Tag Team: comment only') || byTitle('Tag Team: comment only').kind === 'patch', 'a mod change that adds no card is not a release');
A(!rel || !rel.micatroFeatures, 'features are announced once');

// ---------- 2. the page
const feedJson = JSON.stringify({ ...news, micatroAtlas: { ...news.micatroAtlas, [probe ? probe.atlas : '@x']: { src: '/micatro/assets/textures/Jokers.png', cw: 142, ch: 190, w: 1420, h: 3040 } } });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const modJson = JSON.stringify({ id: 'tagteam', sections: [{ id: 'jokers', items: [{ key: 'j_newsprobe_mod', name: 'Mod News Probe', lines: ['Probe text {C:mult}+4{} Mult'] }] }] });
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/magepunknews/news.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(feedJson); return; }
	if (u === '/designwiki/data/micatro_mods/tagteam.json') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(modJson); return; }
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
	await page.click('button[data-f="micatro"]');
	const s = await page.evaluate(() => ({
		badges: [...document.querySelectorAll('.badge.micatro')].map(b => b.textContent),
		blocks: [...document.querySelectorAll('.mc-mod h3')].map(h => h.textContent),
		feats: [...document.querySelectorAll('.mc-feature')].map(f => f.dataset.feature + '|' + f.querySelector('a').getAttribute('href')),
		launchText: [...document.querySelectorAll('.mc-mod .mc-launch')].map(x => x.textContent).join(' / '),
		chip: (() => { const c = document.querySelector('a.mc-chip[data-mc="j_newsprobe_mod"]'); if (!c) return null; const t = c.querySelector('.mc-thumb'); return { href: c.getAttribute('href'), text: c.textContent, bg: t.style.backgroundImage }; })(),
	}));
	A(s.badges.some(b => /1 new Micatro mod card/.test(b)), 'badge: "1 new Micatro mod card"', JSON.stringify(s.badges));
	A(s.blocks.some(b => /^Milatro$/.test(b)) && s.blocks.some(b => /^Tag Team: 1 new card$/.test(b)), 'a block per mod: the release and the new card', JSON.stringify(s.blocks));
	A(/30\s*Jokers/.test(s.launchText), 'mod release shows its per-set counts', s.launchText);
	A(s.feats.length === 3 && s.feats.every(f => /\|\/designwiki\/#\/micatro\/(big-numbers|deck-editor|replays)$/.test(f)), 'the three feature cards link to their wiki pages', JSON.stringify(s.feats));
	A(s.chip && s.chip.href === '/designwiki/#/micatro/mod/tagteam?item=j_newsprobe_mod' && /Jokers\.png/.test(s.chip.bg) && /Mod News Probe/.test(s.chip.text), 'new mod card chip: atlas thumbnail + link to its card on the mod page', JSON.stringify(s.chip));
	await page.hover('a.mc-chip[data-mc="j_newsprobe_mod"]');
	await page.waitForFunction(() => /Probe text/.test(document.getElementById('mc-tip').textContent), { timeout: 5000 }).catch(() => { });
	const tip = await page.evaluate(() => { const t = document.getElementById('mc-tip'); return { shown: getComputedStyle(t).display === 'block', text: t.textContent, big: (t.querySelector('.big') || {}).offsetWidth }; });
	A(tip.shown && /Mod News Probe/.test(tip.text) && /Probe text \+4 Mult/.test(tip.text) && tip.big === 142, 'hover: the card text from the mod’s wiki file + the big sprite', JSON.stringify(tip));
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
