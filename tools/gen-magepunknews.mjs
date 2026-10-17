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
//
// Micatro (the poker roguelike at /micatro/) is tracked the same way: its card data
// lives in micatro/data/*.js (`export default {centers, blinds, tags, ...}`); jokers,
// consumables, vouchers, boosters, decks, tags and blinds that appear in a commit
// become a 'micatro' release entry (the commit that first adds the data is the launch).
//
// Micatro MODS (micatro/mods/<id>/, JS content packs) are tracked too: a commit touching a mod is
// snapshotted (its micatro/ tree, through a temporary git index — no checkout) and its mods are
// loaded headlessly by tools/micatro/dump_mod_items.mjs. A mod's first appearance is a mod release
// (per-set counts); later cards it gains are listed as new mod cards. Snapshots are cached by the
// micatro/ tree hash in the OS temp dir. Built-in features (big-number scoring, the deck editor,
// replays) get an entry on the commit that first adds their engine file.

import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const git = (...args) => execFileSync('git', args, { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });

// battlecards files that count as gameplay for patch notes (not art/UI chrome).
// Includes every run mode's data layer — duels/heist/tombs work often lands in
// those files alone, and used to be missed entirely.
const GAME_FILES = /^(battlecards\/(engine|keywords|game|ai|deck|packs|collection|dungeon|duels|heist|tombs|lorequest|middleearth|mpmode|cards\.json|classes\.json)|micatro\/(js\/(engine|mods)\/|js\/replays\.js|data\/|mods\/)|micasurvivor\/js\/|overworld\/[\w-]+\.js|tools\/(gen_frem_night|gen_johto_daynight|repair_fakemon|deploy_fakemon_trainers|gen_designwiki|gen_battlescale)\.mjs)/;

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

// ---- Micatro: every player-facing card in micatro/data/*.js at a commit ----
const MICATRO_SETS = { Joker: 'Joker', Tarot: 'Tarot', Planet: 'Planet', Spectral: 'Spectral', Voucher: 'Voucher', Booster: 'Booster', Back: 'Deck' };
const RARITY = { 1: 'common', 2: 'uncommon', 3: 'rare', 4: 'legendary' };
const micatroAt = sha => {
	const map = new Map();
	let files = [];
	try { files = git('ls-tree', '-r', '--name-only', sha, 'micatro/data/').split('\n').filter(f => /\.js$/.test(f)); } catch { return map; }
	for (const f of files) {
		let data;
		try {
			const raw = git('show', `${sha}:${f}`);
			const m = raw.match(/export\s+default\s+([\s\S]*?);?\s*$/);
			data = JSON.parse(m ? m[1] : raw);
		} catch { continue; } // not a JSON-shaped data module
		for (const [key, c] of Object.entries(data.centers || {})) {
			if (!c || !MICATRO_SETS[c.set] || c.wip || c.demo || c.omit) continue;
			map.set(key, { key, name: c.name, set: MICATRO_SETS[c.set], rarity: c.set === 'Joker' ? RARITY[c.rarity] || 'common' : null, cost: c.cost ?? null, pos: c.pos || null, soul: c.soul_pos || null });
		}
		for (const [key, b] of Object.entries(data.blinds || {})) if (b && b.boss) map.set(key, { key, name: b.name, set: 'Boss Blind', pos: b.pos || null, colour: b.boss_colour || null, showdown: !!b.boss.showdown });
		for (const [key, t] of Object.entries(data.tags || {})) if (t) map.set(key, { key, name: t.name, set: 'Tag', pos: t.pos || null });
	}
	return map;
};

// ---- Micatro mods: every mod's player-facing items at a commit (see the header) ----
const DUMP = join(dirname(fileURLToPath(import.meta.url)), 'micatro/dump_mod_items.mjs');
const MOD_CACHE = join(tmpdir(), 'magepunknews-modcache-v1');
const modsAt = sha => {
	if (!existsSync(DUMP)) return null;
	let tree;
	try { tree = git('rev-parse', `${sha}:micatro`).trim(); } catch { return null; }
	const cached = join(MOD_CACHE, tree + '.json');
	try { return JSON.parse(readFileSync(cached, 'utf8')); } catch { }
	const tmp = mkdtempSync(join(tmpdir(), 'mpnews-snap-'));
	let out = null;
	try {
		const env = { ...process.env, GIT_INDEX_FILE: join(tmp, 'index') };
		execFileSync('git', ['read-tree', `--prefix=micatro/`, `${sha}:micatro`], { env, stdio: 'ignore' });
		execFileSync('git', ['checkout-index', '-a', `--prefix=${join(tmp, 'tree')}/`], { env, stdio: 'ignore' });
		out = JSON.parse(execFileSync(process.execPath, [DUMP, join(tmp, 'tree')], { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
		if (!out.error) { mkdirSync(MOD_CACHE, { recursive: true }); writeFileSync(cached, JSON.stringify(out)); }
	} catch { out = null; }
	finally { rmSync(tmp, { recursive: true, force: true }); }
	return out && !out.error ? out : null;
};
// Native Micatro features, announced on the commit that first adds their file.
const MICATRO_FEATURES = [
	{ file: 'micatro/js/engine/bignum.js', id: 'big-numbers', title: 'Big-number scoring', blurb: 'Scores go past Balatro’s naneinf, up to 9.99e999 — in every run.' },
	{ file: 'micatro/js/engine/customdeck.js', id: 'deck-editor', title: 'Deck editor', blurb: 'Build, share and play your own decks (New Run → Custom deck).' },
	{ file: 'micatro/js/replays.js', id: 'replays', title: 'Replays', blurb: 'Watch any finished run again, start to finish — and share the link.' },
];
const featureAt = {};
for (const ft of MICATRO_FEATURES) {
	let first = '';
	try { first = git('log', '--first-parent', '--reverse', '--diff-filter=A', '--format=%H', '--', ft.file).split('\n')[0].trim(); } catch { }
	if (first) (featureAt[first] ||= []).push({ id: ft.id, title: ft.title, blurb: ft.blurb, wiki: '/designwiki/#/micatro/' + ft.id });
}

// MicaSurvivor (the PokéSurvivor port, /micasurvivor/): its LAUNCH on Magepunk is the commit that
// first adds its accounts bridge (M3: the landing tile, the Pewter Museum cabinet, accounts and the
// leaderboard all arrive together). The counts come from the design wiki's generated reference
// (designwiki/data/micasurvivor.json, tools/micasurvivor/gen_designwiki.mjs) at that commit.
const MICASURVIVOR_LAUNCH_FILE = 'micasurvivor/js/mica/account.js';
let micasurvivorLaunchSha = '';
try { micasurvivorLaunchSha = git('log', '--first-parent', '--reverse', '--diff-filter=A', '--format=%H', '--', MICASURVIVOR_LAUNCH_FILE).split('\n')[0].trim(); } catch { }
const micasurvivorLaunchAt = sha => {
	let counts = {};
	try { counts = JSON.parse(git('show', `${sha}:designwiki/data/micasurvivor.json`)).counts || {}; } catch { }
	return {
		title: 'MicaSurvivor', play: '/micasurvivor/', wiki: '/designwiki/#/micasurvivor',
		blurb: 'Survive the Pokémon hordes with your partner — based on PokéSurvivor by JPTER78. Play it from the home page or the arcade cabinet in the Pewter Museum; logged-in players save to their Magepunk account and race for the best survival time on the leaderboard.',
		counts: { Pokémon: counts.pokemon || 0, Starters: counts.starters || 0, Moves: counts.moves || 0, 'Held items': counts.items || 0 },
	};
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
let prevMicatro = null;
let prevMods = null; // {id: Map(key -> item)}
const modAtlas = {};

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
	// Micatro: new cards since the previous Micatro commit (the first one is the launch)
	let micatroAdded = [], micatroLaunch = null;
	if (gameFiles.some(f => f.startsWith('micatro/data/'))) {
		const now = micatroAt(c.sha);
		if (prevMicatro === null) {
			try { prevMicatro = micatroAt(git('rev-parse', `${c.sha}^`).trim()); } catch { prevMicatro = new Map(); }
		}
		if (!prevMicatro.size && now.size) {
			micatroLaunch = {};
			for (const k of now.values()) micatroLaunch[k.set] = (micatroLaunch[k.set] || 0) + 1;
		} else micatroAdded = [...now.values()].filter(k => !prevMicatro.has(k.key));
		prevMicatro = now;
	}
	// Micatro mods: a mod's first appearance is its release; later commits list its new cards
	const micatroMods = [];
	if (gameFiles.some(f => f.startsWith('micatro/mods/') || f.startsWith('micatro/js/mods/'))) {
		const snap = modsAt(c.sha);
		if (snap) {
			if (prevMods === null) {
				prevMods = {};
				let parent = null;
				try { parent = modsAt(git('rev-parse', `${c.sha}^`).trim()); } catch { }
				for (const [id, m] of Object.entries((parent && parent.mods) || {})) prevMods[id] = new Map(m.items.map(i => [i.key, i]));
			}
			Object.assign(modAtlas, snap.atlases || {});
			for (const [id, m] of Object.entries(snap.mods)) {
				const before = prevMods[id];
				if (!before) {
					const counts = {};
					for (const i of m.items) counts[i.set] = (counts[i.set] || 0) + 1;
					micatroMods.push({ id, name: m.name, launch: counts, total: m.items.length });
				} else {
					const added = m.items.filter(i => !before.has(i.key));
					if (added.length) micatroMods.push({ id, name: m.name, added });
				}
				prevMods[id] = new Map(m.items.map(i => [i.key, i]));
			}
		}
	}
	const micatroFeatures = featureAt[c.sha] || [];
	const micasurvivorLaunch = micasurvivorLaunchSha && c.sha === micasurvivorLaunchSha ? micasurvivorLaunchAt(c.sha) : null;
	// tokens/uncollectibles ride along with releases but aren't "new cards" to
	// open — EXCEPT run-mode treasures (token-flagged by design, but they're
	// player-facing loot worth announcing)
	const collectible = added.filter(k => (k.collectible !== false && !k.token) || k.treasure);

	// strip the repo's commit-trailer noise from patch-note bodies
	const body = c.body
		.split('\n')
		.filter(ln => !/^(Co-Authored-By|Claude-Session):/i.test(ln))
		.join('\n').trim();

	entries.push({
		sha: c.sha.slice(0, 7),
		date: c.date,
		kind: collectible.length ? 'cards' : (micatroAdded.length || micatroLaunch || micatroMods.length || micatroFeatures.length) ? 'micatro' : micasurvivorLaunch ? 'micasurvivor' : 'patch',
		title: c.subject.replace(/^Battlecards:\s*/i, ''),
		body,
		cards: collectible.map(k => ({
			id: k.id, name: k.name, type: k.type || 'creature',
			class: k.cardClass || 'neutral', rarity: k.rarity || 'common', cost: k.cost ?? null,
			// WUBRG cards are class-neutral; their colors are the interesting label
			...(k.colors && k.colors.length ? { colors: k.colors } : {}),
		})),
		...(micatroAdded.length ? { micatro: micatroAdded } : {}),
		...(micatroLaunch ? { micatroLaunch } : {}),
		...(micatroMods.length ? { micatroMods } : {}),
		...(micatroFeatures.length ? { micatroFeatures } : {}),
		...(micasurvivorLaunch ? { micasurvivorLaunch } : {}),
	});
}

entries.reverse(); // newest first
const releases = entries.filter(e => e.kind === 'cards');
const totalNew = releases.reduce((n, e) => n + e.cards.length, 0);
// Micatro sprite atlases (2x): the news page cuts card thumbnails out of these.
const pngSize = f => { try { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch { return null; } };
const micatroAtlas = {};
for (const [set, file, cw, ch] of [['Joker', 'Jokers.png', 142, 190], ['Tarot', 'Tarots.png', 142, 190], ['Planet', 'Tarots.png', 142, 190], ['Spectral', 'Tarots.png', 142, 190], ['Voucher', 'Vouchers.png', 142, 190], ['Booster', 'boosters.png', 142, 190], ['Deck', 'Enhancers.png', 142, 190], ['Tag', 'tags.png', 68, 68], ['Boss Blind', 'BlindChips.png', 68, 68]]) {
	const f = 'micatro/assets/textures/' + file;
	const sz = existsSync(f) && pngSize(f);
	if (sz) micatroAtlas[set] = { src: '/' + f, cw, ch, w: sz.w, h: sz.h };
}
// mod atlases the feed's mod cards use, with their pixel size from the design wiki's mod index
// (designwiki/data/micatro_mods.json, generated where the gitignored mod art exists)
let wikiAtlases = {};
try { wikiAtlases = JSON.parse(readFileSync('designwiki/data/micatro_mods.json', 'utf8')).atlases || {}; } catch { }
const usedModAtlases = new Set();
for (const e of entries) for (const m of e.micatroMods || []) for (const i of m.added || []) if (i.atlas) usedModAtlases.add(i.atlas.slice(1));
for (const name of usedModAtlases) {
	const a = wikiAtlases[name] || modAtlas[name];
	if (a && a.w && a.h) micatroAtlas['@' + name] = { src: a.src, cw: a.cw, ch: a.ch, w: a.w, h: a.h };
}
const mReleases = entries.filter(e => e.kind === 'micatro');
const modReleases = entries.reduce((n, e) => n + (e.micatroMods || []).length, 0);
writeFileSync('magepunknews/news.json', JSON.stringify({ generated: git('log', '-1', '--format=%cs').trim(), micatroAtlas, entries }, null, '\t'));
console.log(`magepunknews/news.json: ${entries.length} entries (${releases.length} card releases, ${totalNew} new cards, ${mReleases.length} Micatro releases, ${modReleases} mod releases${micasurvivorLaunchSha ? ', MicaSurvivor launch' : ''})`);
