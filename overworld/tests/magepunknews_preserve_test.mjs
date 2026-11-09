// magepunknews_preserve_test.mjs — re-running tools/gen-magepunknews.mjs (the weekly "Refresh Magepunk
// News" workflow) must never undo hand curation of magepunknews/news.json. The 2026-11-09 bot refresh
// (084442c4) rebuilt the feed from history and erased the hand-written Mega card lists (PR #1026 restored them).
//   1. a throwaway git repo with a short Battlecards history (a card release, a patch, a merged PR);
//      the feed already holds the REAL shipped news.json entries plus curated versions of this history's
//      entries (edited title/body, a hand-added card, a hand-written entry for a PR's branch commit)
//   2. a new release lands; the REAL generator runs: every existing entry is still there, unchanged and
//      in order; only the new release is added (at the top); the merged PR is not duplicated
//   3. a second run is a no-op (the file is byte-identical)
//   node overworld/tests/magepunknews_preserve_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mpnews-keep-'));
const g = (...args) => execFileSync('git', args, { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true }); fs.writeFileSync(path.join(tmp, rel), text); };
const card = (id, name) => ({ id, name, type: 'creature', cardClass: 'mage', rarity: 'common', cost: 2 });
const cards = list => put('battlecards/cards.json', JSON.stringify({ cards: list }));
const commit = msg => { g('add', '-A'); g('commit', '-q', '-m', msg); return g('rev-parse', 'HEAD').trim(); };
const gen = () => execFileSync(process.execPath, ['tools/gen-magepunknews.mjs'], { cwd: tmp, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const NEWS = path.join(tmp, 'magepunknews/news.json');
const read = () => JSON.parse(fs.readFileSync(NEWS, 'utf8'));

try {
	g('init', '-q', '-b', 'main');
	g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('config', 'core.autocrlf', 'false');
	put('tools/gen-magepunknews.mjs', fs.readFileSync(path.join(ROOT, 'tools/gen-magepunknews.mjs')));
	cards([]); put('README.md', 'x');
	commit('init');
	cards([card('alpha', 'Alpha')]); const alpha = commit('Battlecards: add Alpha');
	put('battlecards/engine.js', '// tweak'); commit('Battlecards: engine tweak');
	g('checkout', '-q', '-b', 'feat/gamma');
	cards([card('alpha', 'Alpha'), card('gamma', 'Gamma')]); const gammaBranch = commit('Battlecards: add Gamma');
	g('checkout', '-q', 'main');
	g('merge', '-q', '--no-ff', 'feat/gamma', '-m', 'Merge pull request #1 from x/feat-gamma\n\nBattlecards: add Gamma (PR)');

	// the feed as curators left it: the shipped feed's real entries, plus this history curated by hand
	const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'magepunknews/news.json'), 'utf8'));
	const curated = [
		{ sha: gammaBranch.slice(0, 7), date: '2026-11-05', kind: 'cards', title: 'Gamma, hand-written', body: 'curated body', cards: [{ id: 'gamma', name: 'Gamma', type: 'creature', class: 'mage', rarity: 'common', cost: 2 }], micatroMods: [{ id: 'pokermon', name: 'Pokermon', added: [{ key: 'j_poke_mega_x', name: 'Mega X' }] }] },
		{ sha: alpha.slice(0, 7), date: '2026-11-01', kind: 'cards', title: 'Alpha (curated title)', body: 'Curated body.', cards: [{ id: 'alpha', name: 'Alpha', type: 'creature', class: 'mage', rarity: 'common', cost: 2 }, { id: 'hand', name: 'Hand-added', type: 'spell', class: 'neutral', rarity: 'rare', cost: 1 }] },
	];
	const before = { generated: '2026-11-05', micatroAtlas: { '@curated_atlas': { src: '/x.png', cw: 142, ch: 190, w: 142, h: 190 } }, entries: [...curated, ...shipped.entries] };
	put('magepunknews/news.json', JSON.stringify(before, null, '\t'));
	commit('Curate news');

	// 2. a new release lands; the weekly refresh runs
	cards([card('alpha', 'Alpha'), card('gamma', 'Gamma'), card('beta', 'Beta')]); const beta = commit('Battlecards: add Beta');
	try { gen(); } catch (e) { A(false, 'generator runs', String(e.stderr || e.message).slice(0, 300)); }
	const after = read();
	const existingAfter = after.entries.filter(e => e.sha !== beta.slice(0, 7) && e.title !== 'engine tweak');
	A(after.entries.length >= before.entries.length, 'no existing entry is dropped', `${before.entries.length} -> ${after.entries.length}`);
	const lost = before.entries.filter((e, i) => JSON.stringify(existingAfter[i]) !== JSON.stringify(e));
	A(lost.length === 0, `every existing entry is kept unchanged and in order (${before.entries.length} entries)`, lost.slice(0, 3).map(e => e.sha + ' ' + e.title).join(' | '));
	const top = after.entries[0];
	A(top && top.sha === beta.slice(0, 7) && top.cards.map(c => c.id).join() === 'beta', 'the new release is added at the top with its card', JSON.stringify(top).slice(0, 200));
	A(!after.entries.some(e => /add Gamma \(PR\)/.test(e.title)), 'the merged PR is not duplicated next to its hand-written entry');
	A(after.entries.filter(e => e.title === 'engine tweak').length === 1, 'an uncovered older commit is added once');
	A(after.micatroAtlas['@curated_atlas']?.src === '/x.png', 'curated atlases are kept');

	// 3. a re-run changes nothing
	const once = fs.readFileSync(NEWS, 'utf8');
	try { gen(); } catch (e) { A(false, 'generator re-runs', String(e.stderr || e.message).slice(0, 300)); }
	A(fs.readFileSync(NEWS, 'utf8') === once, 'a second run is a no-op');
} finally {
	fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
