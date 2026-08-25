// gen-magepunknews.mjs — build magepunknews/news.json from git history.
//
// Walks every commit on the current branch that touches battlecards/, diffs
// battlecards/cards.json between parent and commit to find newly added cards,
// and records everything else touching the game as a patch note (using the
// commit message). Re-run after releasing cards or shipping gameplay changes:
//
//   node tools/gen-magepunknews.mjs && git add magepunknews/news.json
//
// Card entries carry id/name/class/rarity/type/cost so the news page can link
// each card to its designwiki page (/designwiki/#/cards/<id>).

import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';

const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });

// battlecards files that count as gameplay for patch notes (not art/UI chrome).
// Includes every run mode's data layer — duels/heist/tombs work often lands in
// those files alone, and used to be missed entirely.
const GAME_FILES = /^(battlecards\/(engine|keywords|game|ai|deck|packs|collection|dungeon|duels|heist|tombs|lorequest|middleearth|mpmode|cards\.json|classes\.json)|overworld\/[\w-]+\.js|tools\/(gen_frem_night|gen_johto_daynight|repair_fakemon|deploy_fakemon_trainers|gen_designwiki|gen_battlescale)\.mjs)/;

const cardsAt = sha => {
	try {
		const raw = git('show', `${sha}:battlecards/cards.json`);
		const data = JSON.parse(raw);
		const pool = data.cards || data || [];
		const map = new Map();
		for (const c of pool) if (c && c.id) map.set(c.id, c);
		return map;
	} catch { return new Map(); } // file didn't exist yet or wasn't valid JSON
};

// A shallow clone silently truncates the feed — the oldest releases just vanish,
// and the result looks plausible. Refuse to write a feed we know is incomplete.
// (CI checks out with fetch-depth: 0; locally, `git fetch --unshallow`.)
if (git('rev-parse', '--is-shallow-repository').trim() === 'true') {
	console.error('Refusing to build: shallow clone would drop the oldest history.\nRun `git fetch --unshallow` first.');
	process.exit(1);
}

// oldest → newest, first-parent only so merge commits don't double-count
const log = git('log', '--first-parent', '--reverse', '--format=%H%x1f%cs%x1f%s%x1f%b%x1e')
	.split('\x1e').map(s => s.trim()).filter(Boolean)
	.map(rec => { const [sha, date, subject, body] = rec.split('\x1f'); return { sha, date, subject, body: (body || '').trim() }; });

const entries = [];
let prevCards = null;

for (let c of log) {
	let files;
	try { files = git('show', '--first-parent', '--name-only', '--format=', c.sha).split('\n').filter(Boolean); }
	catch { continue; }
	const gameFiles = files.filter(f => GAME_FILES.test(f));
	if (!gameFiles.length) continue;
	// PR merge commits carry the PR title as the first body line — use it, so
	// work merged via PRs (and any cards it added) still lands in the feed
	if (/^Merge pull request/.test(c.subject)) {
		const prTitle = c.body.split('\n')[0].trim();
		if (!prTitle) continue;
		c = { ...c, subject: prTitle, body: c.body.split('\n').slice(1).join('\n').trim() };
	}

	let added = [];
	if (gameFiles.includes('battlecards/cards.json')) {
		const now = cardsAt(c.sha);
		if (prevCards === null) {
			// first reachable commit is the baseline, not a card release
			// (matters on truncated clones where the root has no parent)
			let parent = null;
			try { parent = cardsAt(git('rev-parse', `${c.sha}^`).trim()); } catch { }
			prevCards = parent && parent.size ? parent : now;
		}
		for (const [id, card] of now) if (!prevCards.has(id)) added.push(card);
		prevCards = now;
	}
	// tokens/uncollectibles ride along with releases but aren't "new cards" to open
	const collectible = added.filter(k => k.collectible !== false && !k.token);

	// strip the repo's commit-trailer noise from patch-note bodies
	const body = c.body
		.split('\n')
		.filter(ln => !/^(Co-Authored-By|Claude-Session):/i.test(ln))
		.join('\n').trim();

	entries.push({
		sha: c.sha.slice(0, 7),
		date: c.date,
		kind: collectible.length ? 'cards' : 'patch',
		title: c.subject.replace(/^Battlecards:\s*/i, ''),
		body,
		cards: collectible.map(k => ({
			id: k.id, name: k.name, type: k.type || 'creature',
			class: k.cardClass || 'neutral', rarity: k.rarity || 'common', cost: k.cost ?? null,
			// WUBRG cards are class-neutral; their colors are the interesting label
			...(k.colors && k.colors.length ? { colors: k.colors } : {}),
		})),
	});
}

entries.reverse(); // newest first
const releases = entries.filter(e => e.kind === 'cards');
const totalNew = releases.reduce((n, e) => n + e.cards.length, 0);
writeFileSync('magepunknews/news.json', JSON.stringify({ generated: git('log', '-1', '--format=%cs').trim(), entries }, null, '\t'));
console.log(`magepunknews/news.json: ${entries.length} entries (${releases.length} card releases, ${totalNew} new cards)`);
