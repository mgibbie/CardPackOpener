// micasurvivor_pokedex_test.mjs — MicaSurvivor batch B1 "complete the Pokédex" (owner decision 2026-10-19,
// Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md: all 1025 canon Pokémon can appear as enemies in every mode).
// The game shipped with the 966 Pokémon that had Idle + Walk + Attack sheets on SpriteCollab. B1 adds the 17 of
// the missing 59 that SpriteCollab has usable sheets for (partial ones filled by the sprite generator's own
// FALLBACK table, four from an alternate-form folder); the other 42 have no sheet at all and wait for the owner's
// call on a fallback (PENDING_ART below). Checked:
//   - data: every dex 1..1025 is in G.DEX (with its sprite meta) or listed as pending art, never both; the 17 new
//     rows (gen, legendary flag, rarity by the generator's rule, Paradox rules), an ability each, credits
//   - sheets: every animation of every Pokémon in sprites-meta.js is on disk with the geometry the meta says
//     (13.5k files, PNG headers), and in the browser every sheet of the 17 new ones (normal + shiny) loads
//     with no 404 and its first frame decodes to real pixels
//   - spawning: each new non-legendary is a candidate of a tier (or a boss slot) of a normal run and really spawns,
//     forced into the run's cast through the test hooks, walking with its sheet drawn; the boss-eligible ones
//     come as bosses; each new legendary comes as the rift's legendary boss in its arena
//   - Lexicon: each new Pokémon's entry opens, with its English name
//   - English: the official English names (overworld/data/species_index.json when present)
// Screenshots (MICASURVIVOR_SHOTS=<dir>): new enemies on screen (Gen 5, Paradox), a legendary as the rift boss,
// and a new Pokémon's Lexicon entry.
// Batch B1b (owner's call: fallbacks from images we already have): 24 of the 42 (Gen 5–8) now have sheets made from
// their overworld follower sprites (tools/micasurvivor/follow_sprites.py, "src":"follow" in sprites-meta.js, in
// assets/pokemon/{dex}/follow/): the same data / sheet / spawn / Lexicon / English checks, plus: their rows (k, dm,
// 4 rows), drawn in a run at their neighbours' size (sampled pixels) and facing the way they walk (the Left row is
// the Right one mirrored), Zarude as a rift legendary boss. The 18 Gen 9 stay pending (PENDING_ART): their only
// SpriteCollab art is portraits with an opaque background, and they have no follower sprite.
// Screenshots: follower-based enemies next to SpriteCollab ones (b1b_*.png) and a Lexicon entry.
// Batch B1c (owner's call: their transparent battle sprites): the last 18 (Gen 9) have sheets made from the overworld
// battle sprites (tools/micasurvivor/battle_sprites.py, "src":"battle", in assets/pokemon/{dex}/battle/): all 1025 are
// in, none pending. The same data / sheet / spawn / Lexicon / English checks, plus: their rows (2 rows front / back, dm,
// fx, no shiny), drawn in a run with real pixels and mirrored when heading right (fx), Up showing the back, at their
// neighbours' size, Wo-Chien / Chien-Pao / Okidogi as rift legendary bosses. Screenshots: b1c_*.png.
//   MAGEPUNK_ASSET_ROOT=<checkout>: read the gitignored micasurvivor/assets/ and overworld/data/ from that checkout
//   (read only; a git worktree has neither), for the disk checks and the static server.
// Covers micasurvivor/js/data/pokedex.js, js/data/sprites-meta.js, js/data/enemies.js, js/systems/abilities.js,
// js/core/sprites.js, js/data/lang-en.js, micasurvivor/CREDITS.md, tools/micasurvivor/fetch_sprites.py,
// tools/micasurvivor/fetch_pokedex.py, tools/micasurvivor/follow_sprites.py, js/ui/ui.js, js/ui/minimap.js.
//   node overworld/tests/micasurvivor_pokedex_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MS = path.join(ROOT, 'micasurvivor');
// (B1c) the gitignored asset dirs, from another checkout when MAGEPUNK_ASSET_ROOT says so (read only)
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MSA = path.join(AROOT, 'micasurvivor');
const fromAssets = u => /^\/(micasurvivor\/assets|overworld\/data)\//.test(u);
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8795;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }

// ---- the batch: the 17 added, and the 42 SpriteCollab has no sheet for (pending the owner's call on a fallback)
const NEW = {
	593: 'Jellicent', 618: 'Stunfisk', 683: 'Aromatisse', 733: 'Toucannon', 865: 'Sirfetch\u2019d', 870: 'Falinks', 879: 'Copperajah',
	929: 'Dolliv', 945: 'Grafaiai', 948: 'Toedscool', 990: 'Iron Treads', 999: 'Gimmighoul', 1003: 'Ting-Lu', 1008: 'Miraidon',
	1020: 'Gouging Fire', 1021: 'Raging Bolt', 1025: 'Pecharunt',
};
const NEW_DEX = Object.keys(NEW).map(Number);
const NEW_LEG = [1003, 1008, 1025];
// ---- batch B1b: the 24 with a fallback sheet made from their overworld follower sprites
const FOLLOW = {
	514: 'Simisear', 516: 'Simipour', 520: 'Tranquill', 522: 'Blitzle', 523: 'Zebstrika', 538: 'Throh', 558: 'Crustle', 564: 'Tirtouga',
	565: 'Carracosta', 591: 'Amoonguss', 592: 'Frillish', 616: 'Shelmet', 626: 'Bouffalant', 668: 'Pyroar', 732: 'Trumbeak', 735: 'Gumshoos',
	756: 'Shiinotic', 765: 'Oranguru', 837: 'Rolycoly', 838: 'Carkol', 839: 'Coalossal', 866: 'Mr. Rime', 878: 'Cufant', 893: 'Zarude',
};
const FOLLOW_DEX = Object.keys(FOLLOW).map(Number);
const FOLLOW_LEG = [893];
// ---- batch B1c: the last 18 (Gen 9: no SpriteCollab sheet, no follower sprite), from their overworld battle sprites
const BATTLE = {
	931: 'Squawkabilly', 942: 'Maschiff', 943: 'Mabosstiff', 944: 'Shroodle', 947: 'Brambleghast', 949: 'Toedscruel', 950: 'Klawf',
	954: 'Rabsca', 956: 'Espathra', 962: 'Bombirdier', 973: 'Flamigo', 986: 'Brute Bonnet', 993: 'Iron Jugulis', 1001: 'Wo-Chien',
	1002: 'Chien-Pao', 1014: 'Okidogi', 1022: 'Iron Boulder', 1023: 'Iron Crown',
};
const BATTLE_DEX = Object.keys(BATTLE).map(Number);
const BATTLE_LEG = [1001, 1002, 1014];
// Nothing is pending since B1c (the 18 Gen 9 ones that were are BATTLE above)
export const PENDING_ART = [];
const GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
const genOf = d => GEN_END.findIndex(e => d <= e) + 1;

// ================= 1. data (no browser) =================
const G = {};
const ctx = vm.createContext({ G, console });
for (const f of ['js/data/pokedex.js', 'js/data/sprites-meta.js']) vm.runInContext(fs.readFileSync(path.join(MS, f), 'utf8'), ctx, { filename: f });
{
	const have = new Set(G.DEX.map(p => p.dex)), pend = new Set(PENDING_ART);
	const missing = [], both = [];
	for (let d = 1; d <= 1025; d++) { if (!have.has(d) && !pend.has(d)) missing.push(d); if (have.has(d) && pend.has(d)) both.push(d); }
	A(missing.length === 0 && both.length === 0 && G.DEX.length === 1025 && PENDING_ART.length === 0 && have.size === 1025,
		`every dex 1..1025 is in the game (${G.DEX.length}), none pending (${PENDING_ART.length})`, JSON.stringify({ missing: missing.slice(0, 10), both }));
	const noMeta = G.DEX.filter(p => !G.SPRITE_META[p.dex]).map(p => p.dex), orphan = Object.keys(G.SPRITE_META).map(Number).filter(d => !have.has(d));
	A(noMeta.length === 0 && orphan.length === 0, 'the Pokédex and sprites-meta.js list exactly the same Pokémon (fetch_pokedex.py follows fetch_sprites.py)', JSON.stringify({ noMeta, orphan }));
	A(NEW_DEX.every(d => have.has(d)) && BATTLE_DEX.every(d => have.has(d) && G.SPRITE_META[d]), 'the 17 new Pokémon of B1 and the 18 of B1c are in, with sprite meta');
	const rar = p => (p.leg || p.bst >= 580 ? 5 : p.bst >= 495 ? 4 : p.bst >= 410 ? 3 : p.bst >= 320 ? 2 : 1);
	const bad = NEW_DEX.map(d => G.DEX_BY[d]).filter(p => p.gen !== genOf(p.dex) || p.rarity !== rar(p) || !!p.leg !== NEW_LEG.includes(p.dex) || p.starter
		|| !(p.hp > 70 && p.spd > 78 && p.atk > 0.7) || !p.types.length);
	A(bad.length === 0, 'the 17 new rows: generation, rarity by the generator\'s BST rule, legendary flag (Ting-Lu, Miraidon, Pecharunt), not starters, game stats', JSON.stringify(bad));
	// Paradox Pokémon follow the existing Paradox rows: not legendary; the 570 ones rarity 4 (Iron Thorns), the 590 ones 5 (Walking Wake)
	const P = d => G.DEX_BY[d];
	A(!P(990).leg && P(990).rarity === P(995).rarity && !P(1020).leg && !P(1021).leg && P(1020).rarity === P(1009).rarity && P(1021).rarity === 5,
		'Paradox rules: Iron Treads like Iron Thorns (rarity 4, regular enemy), Gouging Fire / Raging Bolt like Walking Wake (rarity 5, boss-only, not legendary)');
	A(P(1003).leg && P(1008).leg && P(1025).leg && P(1008).rarity === 5, 'the new legendaries / mythical are flagged leg (rift arena / judgment / tower legend pools only)');
	A(['Ferrodada', 'Flamariete', 'Electrofuria'].every(n => G.DEX.some(p => p.name === n)), 'the Spanish names come from PokéAPI as for the other 966 (Ferrodada, Flamariete, Electrofuria)');
	const credits = fs.readFileSync(path.join(MS, 'CREDITS.md'), 'utf8');
	const rows = credits.split(/\r?\n/).filter(l => /^\| .* \| .* \| [\d, ]+ \|$/.test(l)).map(l => l.split('|')[3].split(',').map(x => +x.trim()));
	const uncredited = NEW_DEX.filter(d => !rows.some(r => r.includes(d)));
	A(uncredited.length === 0, 'every new sheet has its SpriteCollab artist(s) in CREDITS.md (CC BY-NC 4.0 attribution; the in-game Credits screen reads it)', JSON.stringify(uncredited));
	// one-frame Walk sheets (the partial ones the FALLBACK table filled from a one-frame Idle) are only new Pokémon
	const oneWalk = Object.entries(G.SPRITE_META).filter(([, m]) => m.a.Walk && m.a.Walk.n === 1).map(([d]) => +d);
	A(oneWalk.length === 8 + 18 && oneWalk.every(d => NEW_DEX.includes(d) || BATTLE_DEX.includes(d)) && BATTLE_DEX.every(d => oneWalk.includes(d)),
		'the one-frame Walk sheets (which get the walking hop) are all new ones (B1\'s 8 + B1c\'s 18), so the 966 draw as before', oneWalk.join(', '));

	// ---- B1b: the 24 follower-based rows
	const fol = Object.entries(G.SPRITE_META).filter(([, m]) => m.src === 'follow').map(([d]) => +d);
	const anySrc = Object.entries(G.SPRITE_META).filter(([, m]) => m.src).map(([d]) => +d);
	A(JSON.stringify(fol) === JSON.stringify(FOLLOW_DEX) && FOLLOW_DEX.every(d => G.DEX_BY[d]) && anySrc.length === 24 + 18,
		`exactly the 24 B1b Pokémon have a follower fallback row (src "follow") and a Pokédex row, the 18 of B1c a battle one; the other ${Object.keys(G.SPRITE_META).length - 42} are SpriteCollab's`, JSON.stringify(fol));
	const badRow = FOLLOW_DEX.filter(d => {
		const m = G.SPRITE_META[d], I = m.a.Idle, W = m.a.Walk;
		return !(m.k >= 1 && m.k <= 1.6) || JSON.stringify(m.dm) !== '[0,1,1,1,2,3,3,3]' || JSON.stringify(Object.keys(m.a)) !== '["Idle","Walk"]'
			|| I.r !== 4 || W.r !== 4 || I.n !== 1 || W.n !== 4 || I.w !== W.w || I.h !== W.h || I.ay !== W.ay || W.ay >= W.h || !(m.s >= 0 && m.s <= 2) || m.sh !== 1;
	});
	A(badRow.length === 0, 'each: Idle (1 frame) + Walk (4 frames), 4 rows mapped from the 8 directions by dm (diagonals take the side view), art scale k 1..1.6, a shiny (the pack\'s Followers shiny)', JSON.stringify(badRow));
	A(G.SPRITE_META[592].hv === 1 && FOLLOW_DEX.filter(d => G.SPRITE_META[d].hv).length === 1, 'Frillish floats like Jellicent; the other 23 walk (their families do)');
	const fbad = FOLLOW_DEX.map(d => G.DEX_BY[d]).filter(p => p.gen !== genOf(p.dex) || p.rarity !== rar(p) || !!p.leg !== FOLLOW_LEG.includes(p.dex) || p.starter
		|| !(p.hp > 70 && p.spd > 78 && p.atk > 0.7) || !p.types.length);
	A(fbad.length === 0 && G.DEX_BY[893].leg && G.DEX_BY[893].rarity === 5, 'the 24 rows: generation, rarity by the BST rule, Zarude mythical (leg), not starters, game stats', JSON.stringify(fbad));
	const sec = credits.split(/\r?\n/), at = sec.indexOf('## Sprites de respaldo (lote B1b)');
	const fRows = at < 0 ? [] : sec.slice(at).filter(l => /^\| PokemonZero2024/.test(l)).map(l => l.split('|')[2].split(',').map(x => +x.trim()));
	A(fRows.length === 2 && FOLLOW_DEX.every(d => fRows[0].includes(d) && fRows[1].includes(d)) && /Neo-Spriteman/.test(credits),
		'CREDITS.md credits the follower sprites (PokemonZero2024 Followers / Followers shiny, its credited overworld artist) for all 24', JSON.stringify(fRows.map(r => r.length)));
	A(rows.length > 100 && credits.includes('| CHUNSOFT | https://www.spike-chunsoft.com/ | 1, 2, 3,'), 'the SpriteCollab artist table is still there as it was');

	// ---- B1c: the 18 battle-sprite rows
	const bat = Object.entries(G.SPRITE_META).filter(([, m]) => m.src === 'battle').map(([d]) => +d);
	A(JSON.stringify(bat) === JSON.stringify(BATTLE_DEX) && BATTLE_DEX.every(d => G.DEX_BY[d]),
		'exactly the 18 B1c Pokémon have a battle-sprite fallback row (src "battle") and a Pokédex row', JSON.stringify(bat));
	const badB = BATTLE_DEX.filter(d => {
		const m = G.SPRITE_META[d], I = m.a.Idle, W = m.a.Walk;
		return m.k || m.sh || JSON.stringify(m.dm) !== '[0,0,0,0,1,0,0,0]' || JSON.stringify(m.fx) !== '[0,1,1,1,0,0,0,0]' || JSON.stringify(Object.keys(m.a)) !== '["Idle","Walk"]'
			|| I.r !== 2 || W.r !== 2 || I.n !== 1 || W.n !== 1 || JSON.stringify(I) !== JSON.stringify(W) || W.ay !== W.h - 3 || !(m.s >= 0 && m.s <= 2) || W.h < 14 || W.h > 48;
	});
	A(badB.length === 0, 'each: one-frame Idle = Walk, 2 rows (front / back), dm sends Up to the back and the rest to the front, fx mirrors every direction with a rightward part, no k (PMD pixel scale), no shiny (the battle set has none), feet 2 px under the anchor, 14-48 px tall', JSON.stringify(badB));
	A(JSON.stringify(BATTLE_DEX.filter(d => G.SPRITE_META[d].hv)) === '[954,962,993]', 'Rabsca, Bombirdier and Iron Jugulis float (airborne pictures); the other 15 walk');
	const bbad = BATTLE_DEX.map(d => G.DEX_BY[d]).filter(p => p.gen !== 9 || p.rarity !== rar(p) || !!p.leg !== BATTLE_LEG.includes(p.dex) || p.starter
		|| !(p.hp > 70 && p.spd > 78 && p.atk > 0.7) || !p.types.length);
	A(bbad.length === 0, 'the 18 rows: Gen 9, rarity by the BST rule, Wo-Chien / Chien-Pao / Okidogi legendary, not starters, game stats', JSON.stringify(bbad));
	A(!P(986).leg && !P(993).leg && P(986).rarity === P(995).rarity && P(993).rarity === P(995).rarity && !P(1022).leg && !P(1023).leg && P(1022).rarity === 5 && P(1023).rarity === 5,
		'Paradox rules: Brute Bonnet / Iron Jugulis like Iron Thorns (rarity 4), Iron Boulder / Iron Crown like Walking Wake (rarity 5, boss-only, not legendary)');
	const cAt = sec.indexOf('## Sprites de respaldo (lote B1c)');
	const cRows = cAt < 0 ? [] : sec.slice(cAt).filter(l => /^\| (Combate|Espalda)/.test(l)).map(l => l.split('|')[2].split(',').map(x => +x.trim()));
	A(cRows.length === 3 && BATTLE_DEX.every(d => cRows[0].includes(d) && (cRows[1].includes(d) !== cRows[2].includes(d))) && /PokeAPI\/sprites/.test(credits) && /Pokémon Showdown/.test(credits),
		'CREDITS.md credits the battle sprites for all 18: the fronts (overworld battle set, the Pokémon Showdown dex drawing) and each back once (PokemonZero2024 or PokeAPI/sprites)', JSON.stringify(cRows.map(r => r.length)));
}

// ================= 2. every sheet on disk: present, PNG, the meta's geometry =================
const ASSETS = fs.existsSync(path.join(MSA, 'assets/pokemon/1'));
function pngSize(file) {
	const b = fs.readFileSync(file);
	if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.toString('ascii', 12, 16) !== 'IHDR') return null;
	return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), buf: b };
}
if (!ASSETS) console.log('note: micasurvivor/assets/pokemon is missing locally — the sheet checks are skipped (run with the assets present)');
else {
	let files = 0; const bad = [];
	for (const [d, m] of Object.entries(G.SPRITE_META)) {
		const check = (anim, g, shiny) => {
			const f = path.join(MSA, 'assets/pokemon', d, m.src || '', shiny ? 's' : '', anim + '.png');
			if (!fs.existsSync(f)) { bad.push(`${d}/${shiny ? 's/' : ''}${anim} missing`); return; }
			files++;
			const s = pngSize(f);
			if (!s) { bad.push(`${d}/${anim} not a PNG`); return; }
			if (Math.floor(s.h / g.h) !== g.r || Math.floor(s.w / g.w) < g.n || g.d.length !== g.n) bad.push(`${d}/${shiny ? 's/' : ''}${anim} ${s.w}x${s.h} vs ${g.w}x${g.h} n${g.n} r${g.r}`);
		};
		for (const [anim, g] of Object.entries(m.a)) check(anim, g, false);
		if (m.sh) for (const anim of Object.keys(m.a)) if (!(m.sm || []).includes(anim)) check(anim, (m.sa && m.sa[anim]) || m.a[anim], true);
	}
	A(bad.length === 0 && files > 13000, `every sheet of the ${Object.keys(G.SPRITE_META).length} Pokémon is on disk with its meta's geometry (${files} PNGs, normal + shiny)`, JSON.stringify(bad.slice(0, 10)));
	// the 17 new: the whole image data inflates (a broken download would not)
	const broken = [];
	for (const d of [...NEW_DEX, ...FOLLOW_DEX, ...BATTLE_DEX]) {
		const dir = path.join(MSA, 'assets/pokemon', String(d), G.SPRITE_META[d].src || '');
		for (const f of [...fs.readdirSync(dir).filter(x => x.endsWith('.png')), ...(fs.existsSync(path.join(dir, 's')) ? fs.readdirSync(path.join(dir, 's')).map(x => 's/' + x) : [])]) {
			const s = pngSize(path.join(dir, f));
			const idat = []; let o = 8;
			while (o < s.buf.length) { const len = s.buf.readUInt32BE(o), t = s.buf.toString('ascii', o + 4, o + 8); if (t === 'IDAT') idat.push(s.buf.subarray(o + 8, o + 8 + len)); o += 12 + len; }
			try { if (!zlib.inflateSync(Buffer.concat(idat)).length) broken.push(d + '/' + f); } catch { broken.push(d + '/' + f); }
		}
	}
	A(broken.length === 0, 'every PNG of the 17 new Pokémon, the 24 follower-based ones and the 18 battle-based ones inflates completely', JSON.stringify(broken));
	const fFiles = FOLLOW_DEX.reduce((n, d) => n + ['Idle', 'Walk', 's/Idle', 's/Walk'].filter(a => fs.existsSync(path.join(MSA, 'assets/pokemon', String(d), 'follow', a + '.png'))).length, 0);
	A(fFiles === 96 && FOLLOW_DEX.every(d => !fs.existsSync(path.join(MSA, 'assets/pokemon', String(d), 'Idle.png'))), `the 24 fallback sets are in {dex}/follow/ (${fFiles} files), leaving {dex}/ free for a real sheet later`);
	// B1c: exactly Idle + Walk in {dex}/battle/, nothing else in {dex}/ (a real or follower sheet goes in later beside it)
	const bDirs = BATTLE_DEX.map(d => [d, fs.readdirSync(path.join(MSA, 'assets/pokemon', String(d))).join(), fs.readdirSync(path.join(MSA, 'assets/pokemon', String(d), 'battle')).sort().join()]);
	const bBad = bDirs.filter(([, top, inner]) => top !== 'battle' || inner !== 'Idle.png,Walk.png');
	A(bBad.length === 0, `the 18 battle-based sets are in {dex}/battle/ (${bDirs.length * 2} files: Idle + Walk), leaving {dex}/ and {dex}/follow/ free`, JSON.stringify(bBad));
}

// ================= 3+. in the browser =================
const ROW = { rev: 0, save: null };
const notFound = [];
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = '';
		req.on('data', c => { raw += c; });
		req.on('end', () => {
			let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
			let out = {}, status = 200;
			if (body.action === 'micasurvivor-save-get') out = { rev: ROW.rev, save: ROW.save };
			else if (body.action === 'micasurvivor-save-put') {
				if (body.rev === ROW.rev) { ROW.rev++; ROW.save = JSON.parse(JSON.stringify(body.save)); out = { ok: true, rev: ROW.rev }; }
				else { status = 409; out = { error: 'stale', rev: ROW.rev, save: ROW.save }; }
			}
			res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(out));
		});
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(fromAssets(f) ? AROOT : ROOT, f), (e, d) => {
		if (e) { notFound.push(u); res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const BEFORE = () => {
	localStorage.setItem('magepunk_mp_token_v1', 'pokedex-test-token');
	localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'pokedextester' }));
};

const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
	await page.evaluateOnNewDocument(BEFORE);
	page.on('pageerror', e => errors.push('pageerr: ' + e.message));
	page.on('console', m => { if (m.type() === 'error' && !/status of (404|409)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
	const E = (fn, ...a) => page.evaluate(fn, ...a);
	const visible = (id) => E(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
	const shot = async (name) => {
		if (!SHOTS) return;
		await E(() => { document.querySelectorAll('#ach-pop, .toast').forEach(e => { e.style.display = 'none'; }); if (G.Game.state !== 'ui') G.Spawner.say('', 0); });
		await sleep(120); fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) });
	};

	await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => E(() => document.getElementById('boot').classList.contains('hidden') && G.Pad && G.Pad.ready && !!G.LexiconUI), 30000), 'boots (logged in to a stubbed Magepunk account)', errors.slice(0, 3).join(' | '));
	await sleep(300); if (await visible('tap-start')) await page.click('#tap-start');
	await waitFor(() => visible('scr-test'), 10000);
	for (let i = 0; i < 40 && await visible('scr-test'); i++) { await E(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(100); }
	await waitFor(() => visible('scr-result'), 8000);
	await page.click('#res-ok');
	A(await waitFor(() => visible('scr-menu'), 10000), 'main menu');
	A(await E(() => G.I18n.lang) === 'en', 'English mode');

	// ---- English names and abilities
	{
		const ALL = { ...NEW, ...FOLLOW, ...BATTLE };
		const r = await E(NEW => Object.keys(NEW).map(d => { const p = G.DEX_BY[d]; return [+d, p && G.I18n.t(p.name), G.Abilities.BY_DEX[d] || null, !!(G.Abilities.FX[G.Abilities.BY_DEX[d]])]; }), ALL);
		const wrong = r.filter(([d, en]) => en !== ALL[d]);
		A(wrong.length === 0 && r.length === 59, 'the 17 + 24 + 18 show their official English names (Iron Treads, Gouging Fire, Raging Bolt, Sirfetch\u2019d, Mr. Rime, Brute Bonnet, Iron Jugulis, Iron Boulder, Iron Crown...)', JSON.stringify(wrong));
		const idxFile = path.join(AROOT, 'overworld/data/species_index.json');
		if (fs.existsSync(idxFile)) {
			const idx = JSON.parse(fs.readFileSync(idxFile, 'utf8')), official = {};
			for (const [k, v] of Object.entries(idx)) if (v.num > 0 && !k.includes('_') && !official[v.num]) official[v.num] = v.name.replace(/\\u([0-9a-f]{4})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
			const off = r.filter(([d, en]) => official[d] !== en);
			A(off.length === 0, 'and they match overworld/data/species_index.json', JSON.stringify(off.map(([d, en]) => [d, en, official[d]])));
		}
		const noAb = r.filter(x => !x[2] || !x[3]);
		A(noAb.length === 0, 'each new Pokémon (B1, B1b and B1c) has a defined ability (abilities.js BY_DEX)', JSON.stringify(noAb));
		const fam = await E(() => [[514, 513], [592, 593], [591, 590], [878, 879], [732, 733], [866, 122]].map(([d, f]) => G.Abilities.BY_DEX[d] === G.Abilities.BY_DEX[f]));
		A(fam.every(Boolean), 'B1b abilities follow B1\'s rule: the family\'s where the table has it (Simisear/Pansear, Frillish/Jellicent, Cufant/Copperajah, Mr. Rime/Mr. Mime...)', JSON.stringify(fam));
		const famC = await E(() => [[944, 945], [947, 946], [949, 948], [954, 953], [956, 955], [986, 984], [993, 994], [1001, 1003], [1002, 1004], [1014, 1025], [1022, 1020], [1023, 1021]].map(([d, f]) => G.Abilities.BY_DEX[d] === G.Abilities.BY_DEX[f]));
		A(famC.every(Boolean), 'B1c abilities by the same rule: Shroodle / Brambleghast / Toedscruel / Rabsca / Espathra their family\'s, the Paradox and the Treasures of Ruin like theirs, Okidogi like Pecharunt', JSON.stringify(famC));
		const wild = await E(() => G.I18n.t('¡{x} salvaje apareció!'.replace('{x}', G.DEX_BY[990].name)));
		A(wild === 'A wild Iron Treads appeared!', `the wild-encounter notice uses the English name ("${wild}")`);
	}

	// ---- every sheet of the 17 loads in the browser and its first frame has pixels
	if (ASSETS) {
		const r = await E(async (NEW_DEX) => {
			const out = { n: 0, bad: [] };
			const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
			for (const d of NEW_DEX) {
				const m = G.SPRITE_META[d];
				const sets = [[false, m.a]];
				if (m.sh) sets.push([true, m.a]);
				for (const [shiny, anims] of sets) for (const anim of Object.keys(anims)) {
					if (shiny && (m.sm || []).includes(anim)) continue;
					const g = G.Sprites.animMeta(d, anim, shiny);
					const img = new Image(); img.src = `assets/pokemon/${d}/${shiny ? 's/' : ''}${anim}.png`;
					try { await img.decode(); } catch { out.bad.push(d + '/' + (shiny ? 's/' : '') + anim + ' failed'); continue; }
					cv.width = g.w; cv.height = g.h; x.clearRect(0, 0, g.w, g.h); x.drawImage(img, 0, 0, g.w, g.h, 0, 0, g.w, g.h);
					const px = x.getImageData(0, 0, g.w, g.h).data; let on = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) on++;
					if (!on || img.naturalWidth < g.w * g.n || img.naturalHeight < g.h * g.r) out.bad.push(d + '/' + anim + ' empty/short'); else out.n++;
				}
			}
			return out;
		}, NEW_DEX);
		A(r.bad.length === 0 && r.n >= 17 * 7 + 16 * 7, `every sheet of the 17 new Pokémon loads in the browser and its first frame decodes to pixels (${r.n} sheets, normal + shiny)`, JSON.stringify(r.bad.slice(0, 8)));
		// B1b: through the game's own loader (G.Sprites.sheet picks {dex}/follow/), every row of every frame has pixels
		const f = await E(async (FOLLOW_DEX) => {
			const out = { n: 0, bad: [], srcs: new Set() };
			const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
			for (const d of FOLLOW_DEX) for (const shiny of [false, true]) for (const anim of ['Idle', 'Walk']) {
				const s = G.Sprites.sheet(d, anim, shiny), g = G.Sprites.animMeta(d, anim, shiny);
				out.srcs.add(s.src.replace(/\d+/, 'N'));
				try { await s.img.decode(); } catch { out.bad.push(d + '/' + anim + (shiny ? '/s' : '') + ' failed'); continue; }
				for (let row = 0; row < g.r; row++) for (let fr = 0; fr < g.n; fr++) {
					cv.width = g.w; cv.height = g.h; x.clearRect(0, 0, g.w, g.h); x.drawImage(s.img, fr * g.w, row * g.h, g.w, g.h, 0, 0, g.w, g.h);
					const px = x.getImageData(0, 0, g.w, g.h).data; let on = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 40) on++;
					if (on < 20) out.bad.push(`${d}/${anim}${shiny ? '/s' : ''} row ${row} frame ${fr}: ${on}px`);
				}
				out.n++;
			}
			out.srcs = [...out.srcs].sort();
			return out;
		}, FOLLOW_DEX);
		A(f.bad.length === 0 && f.n === 96 && JSON.stringify(f.srcs) === '["assets/pokemon/N/follow/Idle.png","assets/pokemon/N/follow/Walk.png","assets/pokemon/N/follow/s/Idle.png","assets/pokemon/N/follow/s/Walk.png"]',
			`the 24 fallback sets load through G.Sprites.sheet from {dex}/follow/ (normal + shiny) and every row and frame decodes to pixels (${f.n} sheets)`, JSON.stringify({ bad: f.bad.slice(0, 6), srcs: f.srcs }));
		// B1c: the same for the 18 battle-based ones ({dex}/battle/, no shiny: a shiny request gets the normal sheet)
		const b = await E(async (BATTLE_DEX) => {
			const out = { n: 0, bad: [], srcs: new Set(), shiny: [] };
			const cv = document.createElement('canvas'), x = cv.getContext('2d', { willReadFrequently: true });
			for (const d of BATTLE_DEX) {
				if (G.Sprites.hasShiny(d) || new G.Sprites.Animator(d, 1, true).shiny) out.shiny.push(d);
				for (const anim of ['Idle', 'Walk']) {
					const s = G.Sprites.sheet(d, anim, false), g = G.Sprites.animMeta(d, anim, false);
					out.srcs.add(s.src.replace(/\d+/, 'N'));
					try { await s.img.decode(); } catch { out.bad.push(d + '/' + anim + ' failed'); continue; }
					if (s.img.naturalWidth !== g.w * g.n || s.img.naturalHeight !== g.h * g.r) out.bad.push(`${d}/${anim} ${s.img.naturalWidth}x${s.img.naturalHeight}`);
					for (let row = 0; row < g.r; row++) {
						cv.width = g.w; cv.height = g.h; x.clearRect(0, 0, g.w, g.h); x.drawImage(s.img, 0, row * g.h, g.w, g.h, 0, 0, g.w, g.h);
						const px = x.getImageData(0, 0, g.w, g.h).data; let on = 0, low = -1;
						for (let i = 3; i < px.length; i += 4) if (px[i] > 40) { on++; low = Math.max(low, ((i - 3) / 4 / g.w) | 0); }
						// real pixels, standing on the ground line (the lowest opaque row is the cell's last: feet 2 px under the anchor)
						if (on < 40 || low !== g.h - 1) out.bad.push(`${d}/${anim} row ${row}: ${on}px, lowest row ${low} of ${g.h}`);
					}
					out.n++;
				}
			}
			out.srcs = [...out.srcs].sort();
			return out;
		}, BATTLE_DEX);
		A(b.bad.length === 0 && b.n === 36 && JSON.stringify(b.srcs) === '["assets/pokemon/N/battle/Idle.png","assets/pokemon/N/battle/Walk.png"]',
			`the 18 battle-based sets load through G.Sprites.sheet from {dex}/battle/ and both rows (front, back) decode to real pixels standing on the ground line (${b.n} sheets)`, JSON.stringify({ bad: b.bad.slice(0, 6), srcs: b.srcs }));
		A(b.shiny.length === 0, 'none of them claims a shiny (the battle set has none): a shiny enemy of theirs draws the normal sheet', JSON.stringify(b.shiny));
	}

	// ---- a normal run: each new non-legendary is a real candidate, and really spawns
	await E(() => {
		window.__T = {
			withRandom(v, fn) { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } },
			start(mode = 'normal') {
				G.Game.startRun(null, mode);
				if (G.Game.state === 'playing') G.Game.togglePause();
				G.UI.hideAll();
				const pl = G.Game.player; pl.invuln = 1e9; G.EnemyMgr.clear();
				return G.Game.mode;
			},
			/** rolls the run's cast with `dex` forced in (the cast picks go through G.U.pickN / G.U.pick) */
			rollWith(dex) {
				const U = G.U, pn = U.pickN, pk = U.pick;
				U.pickN = (arr, n) => { const r = pn(arr, n); const i = arr.findIndex(p => p && p.dex === dex); if (i >= 0 && n > 0 && !r.includes(arr[i])) r[0] = arr[i]; return r; };
				U.pick = (arr) => arr.find(p => p && p.dex === dex) || pk(arr);
				try { return G.Enemies.rollRun(); } finally { U.pickN = pn; U.pick = pk; }
			},
			/** spawns one enemy of that def through the real spawner */
			spawnDef(def, t) {
				const bag = G.Enemies.bagAt, free = G.World.isFree;
				G.Enemies.bagAt = () => [def]; G.World.isFree = () => true;
				try { return G.Spawner.spawnOne(G.Game.player, t); } finally { G.Enemies.bagAt = bag; G.World.isFree = free; }
			},
		};
	});
	A(await E(() => __T.start('normal')) === 'normal', 'a normal run starts');
	const SPAWN_CHECK = (NEW_DEX, NEW_LEG) => {
			const out = [];
			const T = G.Enemies.TIERS;
			for (const d of NEW_DEX) {
				if (NEW_LEG.includes(d)) continue;
				const p = G.DEX_BY[d];
				const tiers = T.map((t, i) => (G.Enemies.candidates(t).includes(p) ? i : -1)).filter(i => i >= 0);
				const row = { d, tiers, boss: false, spawned: false, cast: false, beh: null };
				if (tiers.length) {
					const { cast } = __T.rollWith(d);
					const ti = tiers[0], def = cast[ti].list.find(e => e.dex === d);
					row.cast = !!def;
					if (def) {
						row.beh = def.behavior;
						G.EnemyMgr.clear();
						const e = __T.spawnDef(def, T[ti].from + 5);
						row.spawned = !!(e && e.dex === d && G.EnemyMgr.all().includes(e) && e.hp > 0);
						// it is in the run's bag at its tier's time (the normal spawn path)
						row.inBag = G.Enemies.bagAt(T[ti].from + 5, '').some(x => x.dex === d);
					}
				}
				// the boss-eligible ones (BST in a boss slot, not legendary) come as bosses
				const slots = G.Enemies.BOSS_SLOTS.filter(s => p.bst >= s.bst[0] && p.bst <= s.bst[1]);
				if (slots.length) {
					const { bosses } = __T.rollWith(d);
					const b = bosses.find(x => x.dex === d);
					row.boss = !!b;
					if (b) { G.EnemyMgr.clear(); const e = G.Spawner.spawnBoss(G.Game.player, b.at, b); row.bossSpawned = !!(e && e.boss && e.dex === d); }
				}
				out.push(row);
			}
			G.EnemyMgr.clear();
			G.Enemies.rollRun();
			return out;
	};
	{
		const r = await E(SPAWN_CHECK, NEW_DEX, NEW_LEG);
		const reg = r.filter(x => x.tiers.length), bossOnly = r.filter(x => !x.tiers.length);
		A(reg.length === 12 && reg.every(x => x.cast && x.inBag && x.spawned), `the ${reg.length} new regular enemies are tier candidates of a normal run, join its cast through the hooks, sit in its spawn bag and really spawn`, JSON.stringify(r));
		A(bossOnly.map(x => x.d).join() === '1020,1021' && bossOnly.every(x => x.boss && x.bossSpawned), 'Gouging Fire and Raging Bolt (rarity 5, not legendary) are boss-only, like Walking Wake: they come as a normal run\'s bosses', JSON.stringify(bossOnly));
		const asBoss = r.filter(x => x.boss).map(x => x.d);
		A([865, 879, 990, 1020, 1021].every(d => asBoss.includes(d)) && r.filter(x => x.boss).every(x => x.bossSpawned), `the boss-eligible new ones spawn as bosses (${asBoss.join(', ')})`);
		const beh = Object.fromEntries(r.map(x => [x.d, x.beh]));
		A(beh[683] === 'healer' && beh[879] === 'tank' && beh[990] === 'zoner', 'roles fit: Aromatisse heals (its Healer ability), Copperajah tanks, Iron Treads lays zones', JSON.stringify(beh));
	}
	// B1b: the 23 follower-based non-legendaries the same way
	{
		const r = await E(SPAWN_CHECK, FOLLOW_DEX, FOLLOW_LEG);
		const reg = r.filter(x => x.tiers.length);
		A(r.length === 23 && reg.length === 23 && reg.every(x => x.cast && x.inBag && x.spawned), `the ${reg.length} follower-based regular enemies are tier candidates of a normal run, join its cast through the hooks, sit in its spawn bag and really spawn`, JSON.stringify(r.filter(x => !(x.cast && x.inBag && x.spawned))));
		const asBoss = r.filter(x => x.boss);
		A(asBoss.length >= 5 && asBoss.every(x => x.bossSpawned), `the boss-eligible ones spawn as bosses (${asBoss.map(x => x.d).join(', ')})`, JSON.stringify(asBoss));
		const beh = Object.fromEntries(r.map(x => [x.d, x.beh]));
		A(beh[866] === 'shielder', 'Mr. Rime shields its allies like Mr. Mime and Mime Jr.', JSON.stringify(beh));
	}
	// B1c: the 15 battle-based non-legendaries the same way
	{
		const r = await E(SPAWN_CHECK, BATTLE_DEX, BATTLE_LEG);
		const reg = r.filter(x => x.tiers.length), bossOnly = r.filter(x => !x.tiers.length);
		A(r.length === 15 && reg.length === 13 && reg.every(x => x.cast && x.inBag && x.spawned), `the ${reg.length} battle-based regular enemies are tier candidates of a normal run, join its cast through the hooks, sit in its spawn bag and really spawn`, JSON.stringify(r.filter(x => !(x.cast && x.inBag && x.spawned))));
		A(bossOnly.map(x => x.d).join() === '1022,1023' && bossOnly.every(x => x.boss && x.bossSpawned), 'Iron Boulder and Iron Crown (rarity 5, not legendary) are boss-only like Walking Wake: they come as a normal run\'s bosses', JSON.stringify(bossOnly));
		const asBoss = r.filter(x => x.boss);
		A([986, 993, 1022, 1023].every(d => asBoss.some(x => x.d === d)) && asBoss.every(x => x.bossSpawned), `the boss-eligible ones spawn as bosses (${asBoss.map(x => x.d).join(', ')})`, JSON.stringify(asBoss));
	}

	// ---- drawn on screen: several new enemies around the player, walking with their own sheets
	{
		const r = await E(async (NEW_DEX, NEW_LEG) => {
			G.Spawner.update = () => {}; G.Events.update = () => {};   // no other enemies / events while we look
			G.EnemyMgr.clear();
			const pl = G.Game.player, list = NEW_DEX.filter(d => !NEW_LEG.includes(d));
			const es = list.map((d, i) => {
				const p = G.DEX_BY[d], a = (i / list.length) * Math.PI * 2;
				const def = { dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 18, dmg: 0, xp: 1 };
				const e = new G.Enemy(def, pl.x + Math.cos(a) * 230, pl.y + Math.sin(a) * 150, { hp: 1, spd: 1, dmg: 1 });
				G.EnemyMgr.add(e); return e;
			});
			await G.Sprites.preload(list, 8000);
			if (G.Game.state !== 'playing') G.Game.togglePause();
			await new Promise(res => setTimeout(res, 900));
			const out = es.map(e => {
				const cur = e.anim.cur, s = G.Sprites.sheet(e.dex, cur, e.anim.shiny);
				return { d: e.dex, cur, base: e.anim.base, ready: !!(s && s.ready), alive: G.EnemyMgr.all().includes(e) };
			});
			return out;
		}, NEW_DEX, NEW_LEG);
		const bad = r.filter(x => !x.ready || !x.alive || x.base !== 'Walk');
		A(bad.length === 0, `the ${r.length} new enemies walk on screen with their own sheets loaded (no fallback ball)`, JSON.stringify(bad));
		await shot('b1_new_enemies.png');
		// close-ups: a Gen 5 one (Jellicent / Stunfisk) and the Paradox ones (Iron Treads, Gouging Fire, Raging Bolt)
		for (const [name, ids] of [['b1_gen5_jellicent_stunfisk.png', [593, 618]], ['b1_paradox_irontreads_gougingfire_ragingbolt.png', [990, 1020, 1021]]]) {
			await E(ids => {
				G.EnemyMgr.clear(); const pl = G.Game.player;
				ids.forEach((d, i) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 10, dmg: 0, xp: 1 }, pl.x - 160 + i * 160, pl.y - 110, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); });
			}, ids);
			await sleep(700);
			await shot(name);
		}
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.EnemyMgr.clear(); });
	}

	// ---- B1b: follower-based enemies drawn in a run: real pixels, their neighbours' size, facing the way they walk
	{
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
		await E(() => __T.start('normal'));
		const r = await E(async () => {
			G.Spawner.update = () => {}; G.Events.update = () => {};
			G.EnemyMgr.clear();
			const pl = G.Game.player;
			const mk = (d, x, y) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 14, dmg: 0, xp: 1 }, x, y, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); return e; };
			await G.Sprites.preload([514, 515, 513, 731, 732, 733, 878, 879, 839, 892], 8000);
			// one Simisear left of the player (walks right), one right of it (walks left)
			const L = mk(514, pl.x - 300, pl.y), R = mk(514, pl.x + 300, pl.y);
			G.Game.togglePause(); await new Promise(res => setTimeout(res, 700)); G.Game.togglePause();
			// the facing the chase code gives them (dirFromAngle towards the player): set from where they stand, so trees on
			// their path (the pathing steers round them) don't make the check depend on the map
			for (const e of [L, R]) { e.x = pl.x + (e === L ? -200 : 200); e.y = pl.y; e.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - e.y, pl.x - e.x)); }
			const snap = (e, full) => {
				const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240;
				const x = cv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false;
				if (full) { x.translate(120 - e.x, 200 - e.y); e.draw(x); } else { const f = e.anim.frame; e.anim.frame = 0; e.anim.draw(x, 120, 200); e.anim.frame = f; }
				const d = x.getImageData(0, 0, 240, 240).data, m = new Uint8Array(240 * 240);
				let on = 0, y0 = 240, y1 = -1;
				for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] > 200) { m[i] = 1; on++; const y = (i / 240) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
				return { on, h: y1 - y0 + 1, m };
			};
			const iou = (a, b, flip) => { let i = 0, u = 0; for (let y = 0; y < 240; y++) for (let x = 0; x < 240; x++) { const p = a[y * 240 + x], q = b[y * 240 + (flip ? 239 - x : x)]; if (p && q) i++; if (p || q) u++; } return u ? i / u : 0; };
			const fl = snap(L, true), fr = snap(R, true);
			const sl = snap(L), sr = snap(R);
			const wm = G.Sprites.animMeta(514, 'Walk');
			const out = { dirL: L.anim.dir, dirR: R.anim.dir, rowL: G.Sprites.rowOf(514, L.anim.dir, wm), rowR: G.Sprites.rowOf(514, R.anim.dir, wm),
				base: L.anim.base, onL: fl.on, onR: fr.on, mirror: +iou(sl.m, sr.m, true).toFixed(2), same: +iou(sl.m, sr.m, false).toFixed(2) };
			// size: drawn height (frame 0, facing down) next to its SpriteCollab neighbours
			const H = {};
			for (const d of [513, 514, 515, 731, 732, 733, 878, 879, 839, 892]) { const e = mk(d, pl.x, pl.y - 400); e.anim.dir = 0; e.anim.loop('Walk'); H[d] = snap(e).h; }
			out.H = H;
			G.EnemyMgr.clear();
			return out;
		});
		A(r.base === 'Walk' && r.onL > 150 && r.onR > 150, `a follower-based enemy (Simisear) walks in a run and is drawn with real pixels (${r.onL} / ${r.onR} opaque px)`, JSON.stringify(r));
		A([1, 2, 3].includes(r.dirL) && [5, 6, 7].includes(r.dirR) && r.rowL === 1 && r.rowR === 3, `it faces the way it walks: heading right it uses the sheet's Right row, heading left the Left row (dirs ${r.dirL} / ${r.dirR})`, JSON.stringify(r));
		A(r.mirror > 0.6 && r.mirror > r.same + 0.1, `facing flips: the left-walking one is the right-walking one mirrored (overlap mirrored ${r.mirror} vs as is ${r.same})`, JSON.stringify(r));
		const H = r.H, near = (a, b) => H[a] >= H[b] * 0.8 && H[a] <= H[b] * 1.25;
		A(near(514, 515) && H[732] > H[731] && H[732] <= H[733] * 1.15 && H[878] < H[879] && H[839] > H[514],
			`drawn at their neighbours' size: Simisear ~ Simisage (${H[514]} / ${H[515]} px), Trumbeak between Pikipek and Toucannon (${H[731]} < ${H[732]} ~ ${H[733]}), Cufant under Copperajah (${H[878]} < ${H[879]}), Coalossal bigger than Simisear`, JSON.stringify(H));
		if (SHOTS) {
			// close-ups: follower-based ones next to their SpriteCollab neighbours, walking
			for (const [name, ids] of [['b1b_simisear_simipour_vs_simisage_pansear.png', [513, 514, 515, 516]], ['b1b_pikipek_trumbeak_toucannon.png', [731, 732, 733]],
				['b1b_cufant_copperajah_coalossal_zarude.png', [878, 879, 839, 893]], ['b1b_frillish_jellicent_mrrime_mrmime.png', [592, 593, 866, 122]]]) {
				await E(async ids => {
					G.EnemyMgr.clear(); const pl = G.Game.player;
					await G.Sprites.preload(ids, 8000);
					ids.forEach((d, i) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 8, dmg: 0, xp: 1 }, pl.x - 180 + i * 120, pl.y - 90, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); });
					if (G.Game.state !== 'playing') G.Game.togglePause();
				}, ids);
				await sleep(700);
				await shot(name);
				await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
			}
			// a crowd of all 24 around the player
			await E(async FOLLOW_DEX => {
				G.EnemyMgr.clear(); const pl = G.Game.player;
				await G.Sprites.preload(FOLLOW_DEX, 8000);
				FOLLOW_DEX.forEach((d, i) => { const p = G.DEX_BY[d], a = (i / FOLLOW_DEX.length) * Math.PI * 2; G.EnemyMgr.add(new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 14, dmg: 0, xp: 1 }, pl.x + Math.cos(a) * 250, pl.y + Math.sin(a) * 160, { hp: 1, spd: 1, dmg: 1 })); });
				if (G.Game.state !== 'playing') G.Game.togglePause();
			}, FOLLOW_DEX);
			await sleep(900);
			await shot('b1b_all_24_follower_enemies.png');
			await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.EnemyMgr.clear(); });
		}
	}

	// ---- B1c: battle-based enemies drawn in a run: real pixels, mirrored when heading right, the back heading up, their neighbours' size
	{
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
		await E(() => __T.start('normal'));
		const SIZE = [941, 942, 943, 944, 945, 946, 947, 948, 949, 953, 954, 955, 956, 1003, 1001, 1002, 1004, 1020, 1022, 1021, 1023, 950, 962, 973, 931, 986, 993, 1014, 1006, 1010];
		const r = await E(async (SIZE) => {
			G.Spawner.update = () => {}; G.Events.update = () => {};
			G.EnemyMgr.clear();
			const pl = G.Game.player;
			const mk = (d, x, y) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 14, dmg: 0, xp: 1 }, x, y, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); return e; };
			await G.Sprites.preload(SIZE, 8000);
			// one Maschiff left of the player (walks right), one right of it (walks left), one below it (walks up)
			const L = mk(942, pl.x - 300, pl.y), R = mk(942, pl.x + 300, pl.y), U = mk(942, pl.x, pl.y + 300);
			G.Game.togglePause(); await new Promise(res => setTimeout(res, 700)); G.Game.togglePause();
			const walkDirs = [L.anim.dir, R.anim.dir, U.anim.dir], walkBase = L.anim.base;
			for (const e of [L, R, U]) { e.x = pl.x + (e === L ? -200 : e === R ? 200 : 0); e.y = pl.y + (e === U ? 200 : 0); e.anim.dir = G.Sprites.dirFromAngle(Math.atan2(pl.y - e.y, pl.x - e.x)); }
			const snap = (e, full) => {
				const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240;
				const x = cv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = false;
				if (full) { x.translate(120 - e.x, 200 - e.y); e.draw(x); } else { const f = e.anim.frame, c = e.anim.clock; e.anim.frame = 0; e.anim.clock = 0; e.anim.draw(x, 120, 200); e.anim.frame = f; e.anim.clock = c; }
				const d = x.getImageData(0, 0, 240, 240).data, m = new Uint8Array(240 * 240);
				let on = 0, y0 = 240, y1 = -1, x0 = 240, x1 = -1;
				for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] > 200) { m[i] = 1; on++; const y = (i / 240) | 0, xx = i % 240; if (y < y0) y0 = y; if (y > y1) y1 = y; if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; }
				return { on, h: y1 - y0 + 1, w: x1 - x0 + 1, cx: (x0 + x1) / 2, bottom: y1, m };
			};
			// mirrored about x = 120 (the anchor column): compare a with b flipped around the anchor
			const iou = (a, b, flip) => { let i = 0, u = 0; for (let y = 0; y < 240; y++) for (let x = 1; x < 240; x++) { const p = a[y * 240 + x], q = b[y * 240 + (flip ? 240 - x : x)]; if (p && q) i++; if (p || q) u++; } return u ? i / u : 0; };
			const fl = snap(L, true), fr = snap(R, true), fu = snap(U, true);
			const sl = snap(L), sr = snap(R), su = snap(U);
			const wm = G.Sprites.animMeta(942, 'Walk');
			const out = { walkDirs, walkBase, dirL: L.anim.dir, dirR: R.anim.dir, dirU: U.anim.dir, rowL: G.Sprites.rowOf(942, L.anim.dir, wm), rowR: G.Sprites.rowOf(942, R.anim.dir, wm), rowU: G.Sprites.rowOf(942, U.anim.dir, wm),
				flipL: G.Sprites.flipOf(942, L.anim.dir), flipR: G.Sprites.flipOf(942, R.anim.dir), flipU: G.Sprites.flipOf(942, U.anim.dir),
				onL: fl.on, onR: fr.on, onU: fu.on, mirror: +iou(sl.m, sr.m, true).toFixed(2), same: +iou(sl.m, sr.m, false).toFixed(2), back: +iou(sl.m, su.m, false).toFixed(2),
				cxL: sl.cx, cxR: sr.cx, botL: sl.bottom, botR: sr.bottom };
			// a one-frame Walk hops while it walks (B1's bob): drawn at two clock values, the picture moves up
			{ const e = L, c = e.anim.clock; e.anim.loop('Walk'); const at = t => { e.anim.clock = t; const s = snap(e, true); return s.bottom; }; out.hop = [at(0), at(Math.PI / 18)]; e.anim.clock = c; }
			// the hurt flash: white pixels
			{ const cv = document.createElement('canvas'); cv.width = 240; cv.height = 240; const x = cv.getContext('2d', { willReadFrequently: true }); L.anim.draw(x, 120, 200, { flash: true });
				const d = x.getImageData(0, 0, 240, 240).data; let w = 0, on = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { on++; if (d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250) w++; } out.flash = on ? +(w / on).toFixed(2) : 0; }
			const H = {};
			for (const d of SIZE) { const e = mk(d, pl.x, pl.y - 400); e.anim.dir = 0; e.anim.loop('Walk'); H[d] = snap(e).h; }
			out.H = H;
			G.EnemyMgr.clear();
			return out;
		}, SIZE);
		console.log('    B1c drawn heights: ' + JSON.stringify(r.H));
		A(r.walkBase === 'Walk' && r.onL > 150 && r.onR > 150 && r.onU > 150, `a battle-based enemy (Maschiff) walks in a run and is drawn with real pixels (${r.onL} / ${r.onR} / ${r.onU} opaque px)`, JSON.stringify(r));
		A([1, 2, 3].includes(r.dirL) && [5, 6, 7].includes(r.dirR) && r.dirU === 4 && r.rowL === 0 && r.rowR === 0 && r.rowU === 1 && r.flipL && !r.flipR && !r.flipU,
			`it faces the way it walks: heading right the front mirrored, heading left the front as drawn, heading up the back (dirs ${r.dirL} / ${r.dirR} / ${r.dirU})`, JSON.stringify(r));
		A(r.mirror > 0.9 && r.mirror > r.same + 0.1 && Math.abs((r.cxL - 120) + (r.cxR - 120)) <= 1.5 && r.botL === r.botR, `facing flips around its anchor: the right-walking one is the left-walking one mirrored (overlap ${r.mirror} vs as is ${r.same}), on the same ground line`, JSON.stringify(r));
		A(r.back < 0.8, `heading up it shows a different picture, the back (overlap with the front ${r.back})`, JSON.stringify(r));
		A(r.hop[1] < r.hop[0], `walking, the one-frame sheet hops (B1's bob: bottom row ${r.hop[0]} -> ${r.hop[1]})`, JSON.stringify(r.hop));
		A(r.flash > 0.95, `the hurt flash draws it white (${r.flash})`);
		const H = r.H, near = (a, b) => H[a] >= H[b] * 0.8 && H[a] <= H[b] * 1.25;
		A(H[942] < H[943] && H[944] < H[945] && H[946] < H[947] && H[948] < H[949] && H[953] < H[954] && H[955] < H[956],
			`drawn at their families' size: Maschiff < Mabosstiff (${H[942]} < ${H[943]}), Shroodle < Grafaiai (${H[944]} < ${H[945]}), Bramblin < Brambleghast (${H[946]} < ${H[947]}), Toedscool < Toedscruel (${H[948]} < ${H[949]}), Rellor < Rabsca (${H[953]} < ${H[954]}), Flittle < Espathra (${H[955]} < ${H[956]})`, JSON.stringify(H));
		// real heights: Chi-Yu 0.4 m < Wo-Chien 1.5 < Chien-Pao 1.9 < Ting-Lu 2.7; Iron Boulder 1.5, Iron Crown 1.6, Okidogi 1.8 ~ Iron Valiant 1.4,
		// all far under Gouging Fire 3.5 / Raging Bolt 5.2
		A(H[1004] < H[1001] && H[1001] < H[1003] && H[1002] < H[1003] && H[1014] < H[1003] && [1001, 1002, 1014, 1022, 1023].every(d => near(d, 1006)) && near(1022, 1010)
			&& Math.max(H[1022], H[1023]) < Math.min(H[1020], H[1021]),
			`the legendaries and Paradox among their kin, by real height: Chi-Yu < Wo-Chien < Ting-Lu (${H[1004]} < ${H[1001]} < ${H[1003]}), Wo-Chien / Chien-Pao / Okidogi / Iron Boulder / Iron Crown ~ Iron Valiant (${H[1001]} / ${H[1002]} / ${H[1014]} / ${H[1022]} / ${H[1023]} ~ ${H[1006]}), Iron Boulder ~ Iron Leaves (${H[1022]} / ${H[1010]}), under Gouging Fire / Raging Bolt (${H[1020]} / ${H[1021]})`, JSON.stringify(H));
		if (SHOTS) {
			for (const [name, ids] of [['b1c_maschiff_mabosstiff_vs_lechonk_oinkologne.png', [915, 942, 943, 916]], ['b1c_shroodle_grafaiai_bramblin_brambleghast.png', [944, 945, 946, 947]],
				['b1c_toedscool_toedscruel_rellor_rabsca_flittle_espathra.png', [948, 949, 953, 954, 955, 956]], ['b1c_paradox_brutebonnet_ironjugulis_ironboulder_ironcrown_vs_gougingfire.png', [986, 993, 1020, 1022, 1023]],
				['b1c_ruin_wochien_chienpao_tinglu_chiyu_okidogi.png', [1001, 1002, 1003, 1004, 1014]], ['b1c_squawkabilly_klawf_bombirdier_flamigo.png', [931, 950, 962, 973]]]) {
				await E(async ids => {
					G.EnemyMgr.clear(); const pl = G.Game.player;
					await G.Sprites.preload(ids, 8000);
					ids.forEach((d, i) => { const p = G.DEX_BY[d]; const e = new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 8, dmg: 0, xp: 1 }, pl.x - 60 * ids.length + i * 120 + 60, pl.y - 100, { hp: 1, spd: 1, dmg: 1 }); G.EnemyMgr.add(e); });
					if (G.Game.state !== 'playing') G.Game.togglePause();
				}, ids);
				await sleep(700);
				await shot(name);
				await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
			}
			// a crowd of all 18 around the player, walking in from every side (so every facing shows)
			await E(async BATTLE_DEX => {
				G.EnemyMgr.clear(); const pl = G.Game.player;
				await G.Sprites.preload(BATTLE_DEX, 8000);
				BATTLE_DEX.forEach((d, i) => { const p = G.DEX_BY[d], a = (i / BATTLE_DEX.length) * Math.PI * 2; G.EnemyMgr.add(new G.Enemy({ dex: d, name: p.name, behavior: 'chase', hp: 500, spd: 14, dmg: 0, xp: 1 }, pl.x + Math.cos(a) * 250, pl.y + Math.sin(a) * 160, { hp: 1, spd: 1, dmg: 1 })); });
				if (G.Game.state !== 'playing') G.Game.togglePause();
			}, BATTLE_DEX);
			await sleep(900);
			await shot('b1c_all_18_battle_enemies.png');
			await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.EnemyMgr.clear(); });
		}
	}

	// ---- each new legendary is the rift's legendary boss in its arena (a fresh run each; Miraidon last, for the screenshot)
	{
		const all = [];
		const LEG_SHOT = { 1008: 'b1_legendary_miraidon_rift_boss.png', 1001: 'b1c_legendary_wochien_rift_boss.png', 1014: 'b1c_legendary_okidogi_rift_boss.png' };
		for (const d of [1003, 1025, 893, 1002, 1001, 1014, 1008]) {
			await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); });
			await E(() => __T.start('normal'));
			all.push(await E(async d => {
				G.Spawner.update = () => {}; G.Events.update = () => {};
				const pool = G.DEX.filter(p => p.leg && G.SPRITE_META[p.dex]);
				// only this one may be drawn: the others' leg flag is off for the draw
				const off = pool.filter(p => p.dex !== d); off.forEach(p => { p.leg = false; });
				try { G.EnemyMgr.clear(); G.Rift.debugArena(); } finally { off.forEach(p => { p.leg = true; }); }
				const e = G.EnemyMgr.all().find(x => x.legend);
				const out = { d, inPool: pool.some(p => p.dex === d), arena: G.Rift.inArena, legend: !!e, dex: e && e.dex, boss: !!(e && e.boss), type: G.Rift.arena && G.Rift.arena.type, types: G.DEX_BY[d].types };
				if (e) {
					await G.Sprites.preload([d], 8000);
					G.Game.togglePause(); await new Promise(res => setTimeout(res, 900)); G.Game.togglePause();
					const s = G.Sprites.sheet(d, e.anim.cur, e.anim.shiny); out.drawn = !!(s && s.ready) && G.EnemyMgr.all().includes(e);
				}
				return out;
			}, d));
			if (SHOTS && LEG_SHOT[d]) { await E(() => { const e = G.EnemyMgr.all().find(x => x.legend), pl = G.Game.player; if (e) { pl.x = e.x; pl.y = e.y + 70; } if (G.Game.state !== 'playing') G.Game.togglePause(); }); await sleep(600); await shot(LEG_SHOT[d]); await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); }); }
		}
		const bad = all.filter(x => !x.inPool || !x.arena || !x.legend || x.dex !== x.d || !x.boss || !x.types.includes(x.type));
		A(all.length === 7 && bad.length === 0, 'Ting-Lu, Miraidon, Pecharunt, (B1b) Zarude and (B1c) Wo-Chien, Chien-Pao, Okidogi are in the rift\'s legendary pool and each comes as the arena\'s legendary boss (an arena of one of its types)', JSON.stringify(all));
		A(all.every(x => x.drawn), 'each is drawn in the arena with its own sheets (Miraidon: Low-Power Mode; Ting-Lu: the full "Temp" sheet; Zarude: its follower sheet; the Treasure of Ruin and Okidogi: their battle sheets)', JSON.stringify(all.map(x => [x.d, x.drawn])));
		const ach = await E(legs => legs.map(d => !!G.AchDefs.LIST.find(a => a.dex === d)), [...NEW_LEG, ...FOLLOW_LEG, ...BATTLE_LEG]);
		A(ach.every(Boolean), 'each new legendary (Zarude, Wo-Chien, Chien-Pao, Okidogi too) gets its "defeat" achievement like the others (achievements.js)', JSON.stringify(ach));
		const pools = await E(legs => ({ judg: legs.every(d => G.DEX.filter(p => p.leg && p.dex !== 493 && G.SPRITE_META[p.dex]).some(p => p.dex === d)), total: G.AchDefs.LIST.length }), BATTLE_LEG);
		A(pools.judg && pools.total === 230, `they are in the legend pools the Judgment and the Tower draw from (leg + sprite meta), and the achievements are 230 (227 + 3)`, JSON.stringify(pools));
	}

	// ---- the Lexicon: each new Pokémon's entry opens, in English
	{
		await E(() => { if (G.Game.state === 'playing') G.Game.togglePause(); G.Game.quit(); G.UI.hideAll(); G.MenuUI.open(); });
		await sleep(300);
		// (one of them owned, so its entry shows the sprite rather than the silhouette)
		await E(() => { G.DB.save.owned[1020] = { at: Date.now(), from: 'gacha' }; G.DB.save.owned[839] = { at: Date.now(), from: 'gacha' }; G.DB.save.owned[1001] = { at: Date.now(), from: 'gacha' }; G.DB.save.owned[986] = { at: Date.now(), from: 'gacha' }; G.LexiconUI.open('p'); }); await sleep(250);
		const res = [];
		const ALL = { ...NEW, ...FOLLOW, ...BATTLE };
		for (const d of [...NEW_DEX, ...FOLLOW_DEX, ...BATTLE_DEX]) {
			const g = G.DEX_BY[d].gen;
			await E(g => { const b = document.querySelector(`#lex-body .lex-gens [data-gen="${g}"]`); if (b) b.click(); }, g); await sleep(120);
			res.push(await E(async d => {
				const c = document.querySelector(`#lex-body .lex-card[data-lex="p:${d}"]`);
				if (!c) return { d, card: false };
				c.click(); await new Promise(r => setTimeout(r, 30));
				const pop = document.getElementById('lexpop-body'), shown = !document.getElementById('scr-lexpop').classList.contains('hidden');
				const out = { d, card: true, shown, key: pop.dataset.key, h: pop.querySelector('h2') && pop.querySelector('h2').textContent.trim(), text: pop.innerText };
				return out;
			}, d));
			if (d === 1020) await shot('b1_lexicon_gouging_fire.png');
			if (d === 839) await shot('b1b_lexicon_coalossal.png');
			if (d === 1001) await shot('b1c_lexicon_wochien.png');
			if (d === 986) await shot('b1c_lexicon_brutebonnet.png');
			await E(() => { const b = document.getElementById('lexpop-close'); if (b) b.click(); });
		}
		const bad = res.filter(x => !x.card || !x.shown || x.key !== 'p:' + x.d || x.h !== ALL[x.d] || !/Ability/.test(x.text) || /[¡¿ñ]|Habilidad|Rareza/.test(x.text));
		A(bad.length === 0 && res.length === 59, 'the Lexicon entry of each of the 17 + 24 + 18 opens, titled with its English name, in English', JSON.stringify(bad.slice(0, 4).map(x => [x.d, x.card, x.shown, x.key, x.h])));
		const cnt = await E(() => { const L = G.LexiconUI, g0 = L.gen; let n = 0; for (let g = 1; g <= 9; g++) { L.gen = g; n += L.entries('p').length; } L.gen = g0; return n; });
		A(cnt === 1025, `the Lexicon lists all ${cnt} Pokémon`);
	}

	const missing = notFound.filter(u => !(u.startsWith('/micasurvivor/assets/') && !ASSETS));
	A(missing.length === 0, 'no 404s', missing.slice(0, 5).join(' | '));
	A(errors.length === 0, 'no console errors', errors.slice(0, 5).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: crashed: ' + (e && e.stack || e));
	console.log(errors.slice(0, 5).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
