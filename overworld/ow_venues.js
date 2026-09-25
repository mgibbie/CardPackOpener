// ow_venues.js — the side venues: the Bug-Catching Contest, the Trick House, the Ruins of Alph sliding puzzles and UNOWN DEX, and Pokémon Contests (with the berry blender).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Bag from './bag.js';
import * as BUI from './battleui.js';
import { CATS, Contest, RANKS } from './contest.js';
import { getImage } from './engine.js';
import { Journal } from './journal.js';
import { battle, dialog, hud, sctx, world } from './ow_core.js';
import { menuChrome, monRow, optionList } from './ow_menus.js';
import { S } from './ow_state.js';
import { addCaught, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { safeLoad, safeSave } from './safestore.js';
import * as Slide from './slidepuzzle.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { dexMilestoneCheck } from './ow_follower.js';
import { syncMapBgm } from './ow_music.js';
import {
	warpTo,
} from './main.js';

// ---------- Bug-Catching Contest (National Park, Tue/Thu/Sat) ----------
// The classic: sign up with the gate officer, hunt the park with 20 SPORT
// BALLS, keep exactly ONE catch as your entry (swap any time), and get judged
// when you leave the park or run dry. Judged score = level + stats + species
// rarity, against the traditional contestant field. 1st SUN STONE, 2nd
// EVERSTONE, 3rd GOLD BERRY, everyone else a BERRY — and your entry is yours
// to keep either way.
const BUG_KEY = 'magepunk_bugcontest_v1';
export let bugContest = safeLoad(BUG_KEY, null) || { active: false, caught: null, date: '' };
function saveBugContest() { safeSave(BUG_KEY, bugContest); }
export const isBugDay = () => [2, 4, 6].includes(new Date().getDay()); // Tue/Thu/Sat
// the Crystal contest table, in spirit: commons, cocoons, and the two prizes
const BUG_TABLE = [
	{ id: 'caterpie', min: 7, max: 18, w: 20, score: 20 }, { id: 'weedle', min: 7, max: 18, w: 20, score: 20 },
	{ id: 'metapod', min: 9, max: 18, w: 10, score: 30 }, { id: 'kakuna', min: 9, max: 18, w: 10, score: 30 },
	{ id: 'paras', min: 10, max: 17, w: 10, score: 35 }, { id: 'venonat', min: 10, max: 16, w: 10, score: 40 },
	{ id: 'butterfree', min: 12, max: 15, w: 5, score: 60 }, { id: 'beedrill', min: 12, max: 15, w: 5, score: 60 },
	{ id: 'scyther', min: 13, max: 14, w: 5, score: 80 }, { id: 'pinsir', min: 13, max: 14, w: 5, score: 80 },
];
const BUG_SCORES = Object.fromEntries(BUG_TABLE.map(e => [e.id, e.score]));
export function bugContestRoll() {
	if (!bugContest.active || world.current?.map?.id !== 'MAP_NATIONAL_PARK') return null;
	if (Bag.count('sportball') <= 0) return null;
	if (Math.random() > 0.12) return null;
	const total = BUG_TABLE.reduce((s, e) => s + e.w, 0);
	let r = Math.random() * total;
	for (const e of BUG_TABLE) {
		r -= e.w;
		if (r <= 0) return { id: e.id, level: e.min + Math.floor(Math.random() * (e.max - e.min + 1)) };
	}
	return null;
}
export function bugScore(mon) {
	const stats = mon.stats || {};
	const tot = (mon.maxHP || 0) + (stats.atk || 0) + (stats.def || 0) + (stats.spa || 0) + (stats.spd || 0) + (stats.spe || 0);
	return (mon.level || 1) * 5 + Math.round(tot / 8) + (BUG_SCORES[mon.speciesId] ?? 30);
}
// a catch during the contest becomes (or challenges) the single kept entry —
// the party add waits for the judging. Returns true when it consumed the catch.
export function bugContestCatch(mon) {
	if (!bugContest.active || !mon) return false;
	Dex.markCaught(mon.speciesId); dexMilestoneCheck();
	const s = bugScore(mon);
	if (!bugContest.caught) {
		bugContest.caught = mon; saveBugContest();
		hud.textContent = `${mon.name} is your contest entry! (score ~${s})`;
		return true;
	}
	const old = bugContest.caught, os = bugScore(old);
	dialog.open(`You already caught ${old.name} (score ~${os}).\nSwap it for ${mon.name} (score ~${s})?\n\nZ = Keep NEW   X = Keep OLD`, declined => {
		if (declined !== 'x') { bugContest.caught = mon; saveBugContest(); hud.textContent = `${mon.name} is now your entry!`; }
	});
	return true;
}
export function bugOfficerTalk() {
	const today = new Date().toDateString();
	if (bugContest.active) {
		const n = Bag.count('sportball');
		dialog.open(`OFFICER: How goes the hunt? ${n} SPORT BALL${n === 1 ? '' : 'S'} left.\nYour entry: ${bugContest.caught ? bugContest.caught.name : 'none yet'}.\n\nFinish now?   Z = Finish   X = Keep hunting`, declined => {
			if (declined !== 'x') endBugContest();
		});
		return;
	}
	if (!isBugDay()) { dialog.open('OFFICER: The BUG-CATCHING CONTEST runs every\nTUESDAY, THURSDAY, and SATURDAY.\n\nSee you on a contest day!'); return; }
	if (bugContest.date === today) { dialog.open("OFFICER: Today's contest is already decided!\nCome back on the next contest day."); return; }
	if (!S.party.length) { dialog.open('OFFICER: You need a POKeMON to enter!'); return; }
	dialog.open('OFFICER: Welcome to the BUG-CATCHING CONTEST!\n\nCatch bugs in the park using 20 SPORT BALLS.\nYou keep ONE catch as your entry — you can swap it\nany time. Leave the park (or run dry) to be judged.\n\nEnter?   Z = Yes   X = No', declined => {
		if (declined === 'x') return;
		bugContest.active = true; bugContest.caught = null; bugContest.date = today; saveBugContest();
		Bag.addItem('sportball', 20);
		sfx('ui_select');
		hud.textContent = 'The BUG-CATCHING CONTEST is ON! Hunt the park!';
	});
}
export function endBugContest() {
	if (!bugContest.active) return;
	bugContest.active = false;
	for (let g = 0; g < 25 && Bag.count('sportball') > 0; g++) Bag.consume('sportball'); // leftovers go back
	const mon = bugContest.caught;
	bugContest.caught = null;
	saveBugContest();
	const mine = mon ? bugScore(mon) : 0;
	// the traditional contestant field turns in their own catches
	const rivals = ['DON', 'ED', 'NICK', 'WILLIAM', 'KIPP'].map(name => {
		const e = BUG_TABLE[Math.floor(Math.random() * BUG_TABLE.length)];
		const lv = e.min + Math.floor(Math.random() * (e.max - e.min + 1));
		return { name, score: e.score + lv * 5 + 15 + Math.floor(Math.random() * 40) };
	}).sort((a, b) => b.score - a.score);
	const place = mon ? 1 + rivals.filter(r => r.score > mine).length : 6;
	let prizeLine;
	if (!mon) {
		prizeLine = 'No entry this time — no prize!';
	} else {
		const prize = place === 1 ? 'sunstone' : place === 2 ? 'everstone' : place === 3 ? 'goldberry' : 'berry';
		Bag.addItem(prize, 1);
		const nth = place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : place + 'th';
		prizeLine = `You placed ${nth} and won a ${Bag.ITEMS[prize]?.name || prize.toUpperCase()}!`;
		const where = addCaught(S.party, mon);
		saveParty(S.party);
		prizeLine += `\n${mon.name} ${where === 'party' ? 'joined the party' : 'was sent to the box'}.`;
		if (place === 1) { Journal.add(`Won the Bug-Catching Contest with ${mon.name}!`); sfx('levelup'); }
	}
	dialog.open(`OFFICER: The results are in!\n\nYour entry scored ${mine}.\n${rivals.map(r => `${r.name}: ${r.score}`).join('   ')}\n\n${prizeLine}`);
}

// ---------- Trick House (Route 110) ----------
// Eight puzzle rooms behind one door: the entrance door always leads to the
// CURRENT puzzle, the maze exit stays sealed until the room's hidden SCROLL is
// found (it hides at the room's sign, where Emerald tucks it), and the man in
// the End room pays out and advances the house. Progress in
// magepunk_trickhouse_v1.
const TH_KEY = 'magepunk_trickhouse_v1';
export function trickState() { return safeLoad(TH_KEY, { stage: 0, scroll: false }); }
// Puzzles 2 and 3 shipped with their switch-door METATILES baked shut and no
// switch machinery behind them — a BFS over the collision grid proved both
// rooms untraversable. The doors stand open instead: collision cleared, the
// art and elevation kept (setMetatile would drop the elevation bits).
const TRICK_OPEN_DOORS = {
	Route110_TrickHousePuzzle2: [642, 648],
	Route110_TrickHousePuzzle3: [550, 557, 576, 577],
};
export function trickHouseOpenDoors(file) {
	const ids = TRICK_OPEN_DOORS[file];
	const lay = ids && world.current?.layout;
	if (!lay) return;
	const set = new Set(ids);
	for (let y = 0; y < lay.height; y++) {
		for (let x = 0; x < lay.width; x++) {
			const v = lay.map[y]?.[x] ?? 0;
			if (set.has(v & 0x3FF)) lay.map[y][x] = v & ~0x0C00; // metatile mask / collision mask
		}
	}
}
const TH_PRIZES = ['rarecandy', 'timerball', 'hardstone', 'smokeball', 'magnet', 'starpiece', 'ppmax', 'nugget'];
// warp overrides: 'blocked' bounces, an object redirects, null passes through
export function trickWarp(w) {
	const here = world.current?.name || '';
	if (/^Route110_TrickHousePuzzle/.test(here) && /TRICK_HOUSE_END$/.test(w.dest_map)) {
		if (!trickState().scroll) {
			dialog.open('The door is locked tight.\n\nA note: "Only one who holds the\nTRICK HOUSE SCROLL may pass!"');
			return 'blocked';
		}
		return null;
	}
	if (here === 'Route110_TrickHouseEntrance' && /TRICK_HOUSE_PUZZLE1$/.test(w.dest_map)) {
		const n = Math.min(trickState().stage, 7) + 1;
		return n === 1 ? null : { map: `MAP_ROUTE110_TRICK_HOUSE_PUZZLE${n}`, warp: '0' };
	}
	// leaving the End room goes home to the entrance, not back into Puzzle 1
	if (here === 'Route110_TrickHouseEnd' && /TRICK_HOUSE_PUZZLE1$/.test(w.dest_map)) {
		return { map: 'MAP_ROUTE110_TRICK_HOUSE_ENTRANCE', warp: '2' };
	}
	return null;
}
export function trickScrollFind() {
	const t = trickState();
	if (t.scroll) { dialog.open('Nothing else is hidden here.'); return; }
	t.scroll = true; safeSave(TH_KEY, t);
	sfx('item_get');
	dialog.open('Tucked behind the sign...\n\nYou found the TRICK HOUSE SCROLL!\nNow for the sealed door!');
}
export function trickMasterTalk() {
	const t = trickState();
	if (t.stage >= 8) { dialog.open('TRICK MASTER: You have conquered all EIGHT of my\npuzzles... You are the true Trick Master now.\nTake a bow!'); return; }
	dialog.open(`TRICK MASTER: Welcome to my TRICK HOUSE!\n\nPuzzle ${t.stage + 1} of 8 waits beyond that door.\nFind my hidden SCROLL in the maze — it opens\nthe way through. Then come find ME!\n\n(...And never mind my trick doors. They've been\nstuck open for years. Very embarrassing.)`);
}
export function trickEndTalk() {
	const t = trickState();
	if (!t.scroll) { dialog.open("TRICK MASTER: Hm? You slipped in without my\nSCROLL? Impossible! Go find it!"); return; }
	const stageDone = Math.min(t.stage, 7);
	const prize = TH_PRIZES[stageDone];
	Bag.addItem(prize, 1);
	t.stage = stageDone + 1; t.scroll = false; safeSave(TH_KEY, t);
	Journal.add(`Cleared Trick House puzzle ${stageDone + 1} of 8!`);
	sfx('levelup');
	const tail = t.stage >= 8 ? '\n\nThat was my LAST puzzle. You are magnificent!' : `\n\nCome back — puzzle ${t.stage + 1} will be ready!`;
	dialog.open(`TRICK MASTER: WHA-! You found me AND my scroll!\n\nHere — a ${Bag.ITEMS[prize]?.name || prize.toUpperCase()} for your cleverness.${tail}`,
		() => warpTo('MAP_ROUTE110_TRICK_HOUSE_ENTRANCE', '2'));
}

// ---------- Ruins of Alph sliding puzzles ----------
// The ancient replica wall in each of the four chambers is a 3×3 slide puzzle
// of that chamber's Pokémon. Solving one rumbles the floor open — down to the
// chamber's ITEM ROOM (real shipped item balls) — and is remembered in
// magepunk_ruins_v1.
const RUINS_KEY = 'magepunk_ruins_v1';
const RUINS_SPECIES = {
	MAP_RUINS_OF_ALPH_KABUTO_CHAMBER: 'kabuto',
	MAP_RUINS_OF_ALPH_OMANYTE_CHAMBER: 'omanyte',
	MAP_RUINS_OF_ALPH_AERODACTYL_CHAMBER: 'aerodactyl',
	MAP_RUINS_OF_ALPH_HO_OH_CHAMBER: 'hooh',
};
export const slideMenu = { open: false, board: null, species: null, mapId: null, moves: 0, done: false };
export function openRuinsPuzzle() {
	const mapId = world.current?.map?.id;
	const species = RUINS_SPECIES[mapId];
	if (!species) return;
	slideMenu.open = true;
	slideMenu.board = Slide.shuffle();
	slideMenu.species = species;
	slideMenu.mapId = mapId;
	slideMenu.moves = 0;
	slideMenu.done = false;
	contestSpriteFor(species); // warm the sprite the tiles are sliced from
	sfx('ui_select');
}
export function slideKey(k) {
	const s = slideMenu;
	if (s.done) return; // the solve sequence owns the exit
	if (k === 'x' || k === 'Escape') { s.open = false; return; }
	const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[k];
	if (!dir) return;
	if (Slide.move(s.board, dir)) { s.moves++; sfx('ui_select'); }
	if (Slide.solved(s.board)) {
		s.done = true;
		const st = safeLoad(RUINS_KEY, { solved: {} });
		const first = !st.solved[s.species];
		st.solved[s.species] = true;
		safeSave(RUINS_KEY, st);
		if (first) Journal.add(`Solved the ${s.species.toUpperCase()} puzzle in the Ruins of Alph!`);
		sfx('levelup');
		const itemRoom = s.mapId.replace('_CHAMBER', '_ITEM_ROOM');
		dialog.open('The tiles slide into place...\n\nThe ancient image is whole! The floor rumbles —\nand slides OPEN beneath you!', () => {
			slideMenu.open = false;
			warpTo(itemRoom, '0');
		});
	}
}
export function drawSlide(W, H) {
	const u = H / 480;
	const s = slideMenu;
	const sp = battle.data.species[s.species];
	menuChrome(W, H, u, 'ANCIENT PUZZLE', `Arrows slide the tiles.  Moves: ${s.moves}   X: step away`);
	const size = 260 * u, cell = size / Slide.SIZE;
	const gx = (W - size) / 2, gy = 96 * u;
	sctx.fillStyle = 'rgba(20,28,44,0.95)';
	BUI.rr(sctx, gx - 8 * u, gy - 8 * u, size + 16 * u, size + 16 * u, 10 * u); sctx.fill();
	const img = contestSpriteFor(s.species);
	for (let pos = 0; pos < 9; pos++) {
		const v = s.board[pos];
		if (v === 8) continue; // the blank
		const px = gx + (pos % 3) * cell, py = gy + Math.floor(pos / 3) * cell;
		sctx.fillStyle = BUI.C.btn;
		BUI.rr(sctx, px + 2 * u, py + 2 * u, cell - 4 * u, cell - 4 * u, 6 * u); sctx.fill();
		if (img) {
			sctx.imageSmoothingEnabled = false;
			const sw = img.width / 3, sh = img.height / 3;
			sctx.drawImage(img, (v % 3) * sw, Math.floor(v / 3) * sh, sw, sh, px + 4 * u, py + 4 * u, cell - 8 * u, cell - 8 * u);
		}
		sctx.fillStyle = 'rgba(255,255,255,0.55)';
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(String(v + 1), px + 7 * u, py + 15 * u);
	}
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`Restore the ancient image of ${(sp?.name || s.species).toUpperCase()}.`, gx - 8 * u, gy + size + 30 * u);
}

// ---------- the UNOWN DEX (Ruins of Alph) ----------
// 28 letters, one species each (unown = A, then unown_b … unown_z, unown_exclaim,
// unown_question). Every catchable letter is recorded in pokedex.js; this shows
// the collection and gates the ! / ? forms behind solving all four puzzles — the
// classic reveal. The research-center scientists open this report.
export const UNOWN_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '!', '?'];
const UNOWN_ID = { A: 'unown', '!': 'unown_exclaim', '?': 'unown_question' };
export const unownIdFor = L => UNOWN_ID[L] || 'unown_' + L.toLowerCase();
export const allRuinsSolved = () => { const s = safeLoad(RUINS_KEY, { solved: {} }).solved || {}; return ['kabuto', 'omanyte', 'aerodactyl', 'hooh'].every(k => s[k]); };
// the letters available in the wild right now: A..Z always, ! and ? once every
// chamber puzzle is solved
export function rollUnownLetter() {
	const letters = UNOWN_ORDER.slice(0, allRuinsSolved() ? 28 : 26);
	return unownIdFor(letters[Math.floor(Math.random() * letters.length)]);
}
export const unownDex = { open: false };
export function openUnownDex() { unownDex.open = true; sfx('ui_open'); }
export function unownDexKey(k) { if (['x', 'Escape', 'z', 'Enter'].includes(k)) unownDex.open = false; }
export function drawUnownDex(W, H) {
	const u = H / 480;
	const got = Dex.unownCount();
	const secret = allRuinsSolved();
	menuChrome(W, H, u, 'UNOWN DEX', `Letters recorded: ${got}/28.   ${secret ? 'The ! and ? forms have appeared!' : 'Solve all four Ruins puzzles to reveal ! and ?.'}   X: close`);
	const cols = 7, gx = (W - cols * 54 * u) / 2 + 6 * u, gy = 96 * u;
	UNOWN_ORDER.forEach((L, i) => {
		const cx = gx + (i % cols) * 54 * u, cy = gy + Math.floor(i / cols) * 66 * u;
		const caught = Dex.isUnownCaught(L);
		sctx.fillStyle = caught ? 'rgba(72,120,196,0.9)' : 'rgba(30,40,60,0.85)';
		BUI.rr(sctx, cx, cy, 48 * u, 56 * u, 6 * u); sctx.fill();
		sctx.strokeStyle = caught ? BUI.C.accent : 'rgba(255,255,255,0.15)'; sctx.lineWidth = 2;
		BUI.rr(sctx, cx, cy, 48 * u, 56 * u, 6 * u); sctx.stroke();
		const img = caught ? contestSpriteFor(unownIdFor(L)) : null;
		if (img) {
			sctx.imageSmoothingEnabled = false;
			sctx.drawImage(img, cx + 6 * u, cy + 4 * u, 36 * u, 36 * u);
		} else {
			sctx.fillStyle = caught ? '#fff' : 'rgba(255,255,255,0.25)';
			sctx.font = `${Math.round(26 * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText(caught ? L : '?', cx + 24 * u, cy + 30 * u);
			sctx.textAlign = 'left';
		}
		sctx.fillStyle = caught ? '#fff' : 'rgba(255,255,255,0.3)';
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.textAlign = 'center';
		sctx.fillText(L, cx + 24 * u, cy + 52 * u);
		sctx.textAlign = 'left';
	});
}

// ---------- Pokémon Contests (Lilycove Contest Hall) ----------
// The engine lives in contest.js (data harvested from pokeemerald by
// tools/gen_contest.mjs into data/contest.json). This is the UI: the reception
// counter runs category -> rank -> entrant -> the five-turn appeal scene, and
// the Berry Blender corner feeds berries into condition. Rank progress
// persists per category (magepunk_contest_v1); the RIBBON lands on the
// winning Pokémon itself and shows on its summary.
export const CONTEST_KEY = 'magepunk_contest_v1';
export const contestMenu = { open: false, mode: 'category', idx: 0, category: null, rank: 0, st: null, entries: null, sprites: {}, flash: null, awarded: false, purse: 0 };
export const blendMenu = { open: false, mode: 'pickmon', idx: 0, mon: null, flash: null };
export function contestProgress() { return safeLoad(CONTEST_KEY, { ranks: { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0 } }); }
export function contestSpriteFor(speciesId) {
	if (!(speciesId in contestMenu.sprites)) {
		contestMenu.sprites[speciesId] = null;
		const sp = battle.data.species[speciesId];
		if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => { contestMenu.sprites[speciesId] = img; }).catch(() => {});
	}
	return contestMenu.sprites[speciesId];
}
function contestRows() {
	const p = contestProgress();
	if (contestMenu.mode === 'category') {
		return CATS.map(c => {
			const r = Math.min(p.ranks[c] ?? 0, 3);
			return `${c.toUpperCase()} CONTEST — ${(p.ranks[c] ?? 0) >= 4 ? 'all ranks cleared!' : RANKS[r] + ' RANK open'}`;
		}).concat(['Leave']);
	}
	const unlocked = Math.min(p.ranks[contestMenu.category] ?? 0, 3);
	return RANKS.map((r, i) => i < unlocked ? `${r} RANK — cleared` : i === unlocked ? `${r} RANK` : `${r} RANK — locked`).concat(['Back']);
}
// the win pays out exactly once, on the transition into the results screen
function contestFinish() {
	const m = contestMenu, st = m.st;
	m.mode = 'results';
	if (!st.placements[0].me || m.awarded) return;
	m.awarded = true;
	const p = contestProgress();
	if ((p.ranks[st.category] ?? 0) <= st.rank) { p.ranks[st.category] = st.rank + 1; safeSave(CONTEST_KEY, p); }
	const mon = st.cs[0].mon;
	const ribbon = `${st.category}-${RANKS[st.rank].toLowerCase()}`;
	mon.ribbons = mon.ribbons || [];
	if (!mon.ribbons.includes(ribbon)) mon.ribbons.push(ribbon);
	m.purse = [500, 1000, 2000, 3000][st.rank] || 500;
	Bag.earn(m.purse);
	Journal.add(`Won the ${RANKS[st.rank]} ${st.category.toUpperCase()} Contest with ${st.cs[0].name}!`);
	// a MASTER rank win commissions the museum portrait
	if (st.rank === 3) {
		const pp = contestProgress();
		pp.paintings = pp.paintings || {};
		pp.paintings[st.category] = { species: mon.speciesId, name: st.cs[0].name };
		safeSave(CONTEST_KEY, pp);
		Journal.add(`${st.cs[0].name}'s portrait now hangs in the Lilycove Museum!`);
	}
	sfx('levelup');
	saveParty(S.party);
}
export function contestKey(k) {
	const m = contestMenu;
	if (m.mode === 'scene') {
		if (m.entries) {
			if (k === 'z' || k === 'Enter') { m.entries = null; if (m.st.done) contestFinish(); }
			return;
		}
		const n = m.st.cs[0].moves.length;
		if (k === 'ArrowUp' && m.idx >= 2) m.idx -= 2;
		if (k === 'ArrowDown' && m.idx + 2 < n) m.idx += 2;
		if (k === 'ArrowLeft' && m.idx % 2 === 1) m.idx--;
		if (k === 'ArrowRight' && m.idx % 2 === 0 && m.idx + 1 < n) m.idx++;
		if (k === 'z' || k === 'Enter') {
			const me = m.st.cs[0];
			m.entries = Contest.playTurn(m.st, me.lockout ? null : me.moves[m.idx]);
			sfx('ui_select');
		}
		return;
	}
	if (m.mode === 'results') {
		if (k === 'z' || k === 'Enter' || k === 'x' || k === 'Escape') { m.open = false; m.st = null; syncMapBgm(); }
		return;
	}
	if (m.mode === 'pickmon') {
		if (k === 'ArrowUp') m.idx = (m.idx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % S.party.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'rank'; m.idx = 0; m.flash = null; return; }
		if ((k === 'z' || k === 'Enter') && S.party[m.idx]) {
			m.awarded = false; m.purse = 0;
			m.st = Contest.start({ category: m.category, rank: m.rank, mon: S.party[m.idx], battleTypes: id => battle.data.moves[id]?.type });
			for (const c of m.st.cs) contestSpriteFor(c.species);
			m.mode = 'scene'; m.idx = 0; m.entries = null;
			syncMapBgm(); // the stage theme takes over
			sfx('ui_select');
		}
		return;
	}
	const rows = contestRows();
	if (k === 'ArrowUp') m.idx = (m.idx + rows.length - 1) % rows.length;
	if (k === 'ArrowDown') m.idx = (m.idx + 1) % rows.length;
	if (k === 'x' || k === 'Escape') {
		if (m.mode === 'category') m.open = false;
		else { m.mode = 'category'; m.idx = 0; }
		m.flash = null;
		return;
	}
	if (k !== 'z' && k !== 'Enter') return;
	if (m.mode === 'category') {
		if (m.idx >= CATS.length) { m.open = false; return; }
		m.category = CATS[m.idx]; m.mode = 'rank'; m.idx = 0; m.flash = null;
	} else if (m.mode === 'rank') {
		if (m.idx >= RANKS.length) { m.mode = 'category'; m.idx = 0; return; }
		const unlocked = Math.min(contestProgress().ranks[m.category] ?? 0, 3);
		if (m.idx > unlocked) { sfx('ui_denied'); m.flash = `Win the ${RANKS[unlocked]} RANK first!`; return; }
		m.rank = m.idx; m.mode = 'pickmon'; m.idx = 0; m.flash = null;
	}
}
// the berries in the bag that the blender knows a flavor for
export function blendBerries() {
	return Object.keys(Contest.data?.berries || {}).filter(id => Bag.ITEMS[id] && Bag.count(id) > 0).map(id => [id, Bag.count(id)]);
}
export function blendKey(k) {
	const b = blendMenu;
	if (b.mode === 'pickmon') {
		if (k === 'ArrowUp') b.idx = (b.idx + S.party.length - 1) % S.party.length;
		if (k === 'ArrowDown') b.idx = (b.idx + 1) % S.party.length;
		if (k === 'x' || k === 'Escape') { b.open = false; return; }
		if ((k === 'z' || k === 'Enter') && S.party[b.idx]) { b.mon = S.party[b.idx]; b.mode = 'feed'; b.idx = 0; b.flash = null; }
		return;
	}
	const list = blendBerries();
	const rows = list.length + 1; // + Done
	if (k === 'ArrowUp') b.idx = (b.idx + rows - 1) % rows;
	if (k === 'ArrowDown') b.idx = (b.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { b.mode = 'pickmon'; b.idx = 0; b.flash = null; return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (b.idx >= list.length) { b.mode = 'pickmon'; b.idx = 0; return; }
	const [id] = list[b.idx];
	const r = Contest.feed(b.mon, id);
	if (!r) { sfx('ui_denied'); b.flash = `${b.mon.name} can't eat another bite! (sheen is full)`; return; }
	Bag.consume(id);
	sfx('heal');
	const g = Object.entries(r.gains).map(([c, v]) => `${c.toUpperCase()} +${v}`).join('  ') || 'no rise';
	b.flash = `${g}   SHEEN ${r.sheen}/255`;
	saveParty(S.party); // condition lives on the mon
	b.idx = Math.min(b.idx, blendBerries().length); // ate the last of a kind -> stay in range
}
export function drawContest(W, H) {
	const u = H / 480;
	const m = contestMenu;
	if (m.mode === 'category') { optionList(W, H, u, 'CONTEST RECEPTION', 'Which Contest would you like to enter?', contestRows(), m.idx, 'ct:', m.flash); return; }
	if (m.mode === 'rank') { optionList(W, H, u, `${m.category.toUpperCase()} CONTEST`, 'Which rank?', contestRows(), m.idx, 'ctr:', m.flash); return; }
	if (m.mode === 'pickmon') {
		menuChrome(W, H, u, `${m.category.toUpperCase()} CONTEST — ${RANKS[m.rank]} RANK`, 'Which POKeMON will perform?');
		S.party.forEach((mo, i) => monRow('ctm:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, m.idx === i, u));
		return;
	}
	const st = m.st;
	if (!st) { m.open = false; return; }
	if (m.mode === 'results') {
		menuChrome(W, H, u, 'JUDGING!', `${st.category.toUpperCase()} CONTEST — ${RANKS[st.rank]} RANK`);
		st.placements.forEach((c, i) => {
			const y = (100 + i * 64) * u;
			const img = contestSpriteFor(c.species);
			if (img) { sctx.imageSmoothingEnabled = false; const s = Math.min(48 * u / img.width, 48 * u / img.height); sctx.drawImage(img, 64 * u, y - 24 * u, img.width * s, img.height * s); }
			sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
			sctx.fillStyle = i === 0 ? '#ffd27a' : c.me ? BUI.C.accent : BUI.C.text;
			sctx.fillText(`${i + 1}.  ${c.name}${c.trainer ? '  (' + c.trainer + ')' : '  (YOU)'}`, 124 * u, y);
			sctx.textAlign = 'right';
			sctx.fillText(`${c.score} pts`, W - 48 * u, y);
			sctx.textAlign = 'left';
		});
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillStyle = st.placements[0].me ? '#ffd27a' : BUI.C.dim;
		sctx.fillText(st.placements[0].me
			? `${st.cs[0].name} won the ${st.category.toUpperCase()} ${RANKS[st.rank]} RIBBON!  (+$${m.purse})`
			: 'So close! Blend some berries and try again.', 40 * u, H - 40 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText('Z: done', 40 * u, H - 18 * u);
		return;
	}
	// the appeal scene
	menuChrome(W, H, u, `${st.category.toUpperCase()} CONTEST — ${RANKS[st.rank]} RANK`,
		`Appeal ${Math.min(st.turn + (m.entries ? 0 : 1), 5)}/5    Crowd: ${'♥'.repeat(st.crowd)}${'—'.repeat(Math.max(0, 5 - st.crowd))}`);
	st.cs.forEach((c, i) => {
		const y = (92 + i * 42) * u;
		const img = contestSpriteFor(c.species);
		if (img) { sctx.imageSmoothingEnabled = false; const s = Math.min(36 * u / img.width, 36 * u / img.height); sctx.drawImage(img, 28 * u, y - 20 * u, img.width * s, img.height * s); }
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillStyle = c.me ? BUI.C.accent : BUI.C.text;
		sctx.fillText(`${c.name}${c.trainer ? '  (' + c.trainer + ')' : '  (YOU)'}${c.lockout ? '  *spent*' : ''}`, 76 * u, y);
		sctx.textAlign = 'right';
		sctx.fillStyle = '#ff7d9c';
		sctx.fillText(`${c.total}♥`, W - 36 * u, y);
		sctx.textAlign = 'left';
	});
	if (m.entries) {
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		m.entries.forEach((e, i) => {
			const y = (278 + i * 24) * u;
			sctx.fillStyle = e.me ? BUI.C.accent : BUI.C.text;
			const mv = e.move ? (battle.data.moves[e.move]?.name || e.move) : null;
			sctx.fillText((mv ? `${e.who} used ${mv}!  +${e.hearts}♥  ` : `${e.who} `) + e.notes.join(' '), 32 * u, y, W - 220 * u);
		});
		const b = { id: 'ct-next', x: W - 184 * u, y: H - 60 * u, w: 152 * u, h: 44 * u, label: st.done ? 'RESULTS' : 'NEXT', center: true };
		S.menuUi.push(b);
		BUI.button(sctx, b, true, u);
		return;
	}
	const me = st.cs[0];
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(me.lockout ? `${me.name} is too spent to appeal — pass the turn.` : 'Choose a move to appeal with:', 28 * u, 268 * u);
	if (me.lockout) {
		const b = { id: 'ctmv:0', x: 24 * u, y: 280 * u, w: W - 48 * u, h: 46 * u, label: 'PASS', center: true };
		S.menuUi.push(b); BUI.button(sctx, b, true, u);
		return;
	}
	const bw = (W - 64 * u) / 2;
	me.moves.forEach((id, i) => {
		const mi = Contest.moveInfo(id, battle.data.moves[id]?.type);
		const prev = me.lastMove ? Contest.moveInfo(me.lastMove, battle.data.moves[me.lastMove]?.type) : null;
		const combo = prev?.starter && (mi.combos || []).includes(prev.starter);
		const name = battle.data.moves[id]?.name || id;
		const b = {
			id: 'ctmv:' + i, x: 24 * u + (i % 2) * (bw + 16 * u), y: (280 + Math.floor(i / 2) * 56) * u, w: bw, h: 46 * u,
			label: `${name}  [${mi.cat.toUpperCase().slice(0, 2)} ♥${mi.appeal}${mi.jam ? ' J' + mi.jam : ''}${combo ? ' COMBO!' : ''}]`, center: false,
		};
		S.menuUi.push(b);
		BUI.button(sctx, b, m.idx === i, u);
	});
}
export function drawBlend(W, H) {
	const u = H / 480;
	const b = blendMenu;
	if (b.mode === 'pickmon') {
		menuChrome(W, H, u, 'BERRY BLENDER', 'Whose condition shall we raise?');
		S.party.forEach((mo, i) => monRow('bb:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, b.idx === i, u));
		return;
	}
	const c = Contest.cond(b.mon);
	menuChrome(W, H, u, `BERRY BLENDER — ${b.mon.name}`, 'Flavor raises its category; smoothness fills SHEEN.');
	const barW = W * 0.32;
	CATS.forEach((cat, i) => {
		const y = (96 + i * 30) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(cat.toUpperCase(), 32 * u, y);
		BUI.bar(sctx, 110 * u, y - 11 * u, barW, 13 * u, Math.min(1, c[cat] / 255), BUI.C.accent, 4 * u);
		sctx.fillStyle = BUI.C.text;
		sctx.fillText(String(c[cat]), 118 * u + barW, y);
	});
	const sy = (96 + 5 * 30 + 8) * u;
	sctx.fillStyle = BUI.C.dim;
	sctx.fillText('SHEEN', 32 * u, sy);
	BUI.bar(sctx, 110 * u, sy - 11 * u, barW, 13 * u, Math.min(1, c.sheen / 255), '#c9a24a', 4 * u);
	sctx.fillStyle = BUI.C.text;
	sctx.fillText(`${c.sheen}/255`, 118 * u + barW, sy);
	// the berry shelf
	const list = blendBerries();
	const rows = list.map(([id, n]) => `${Bag.ITEMS[id].name}  x${n}`).concat(['Done']);
	const start = Math.max(0, Math.min(b.idx - 3, rows.length - 7));
	rows.slice(start, start + 7).forEach((label, i) => {
		const idx = start + i;
		const bid = 'bbf:' + idx;
		const btn = { id: bid, x: W * 0.55, y: (88 + i * 48) * u, w: W * 0.41, h: 42 * u, label, center: false };
		S.menuUi.push(btn);
		BUI.button(sctx, btn, S.menuHover === bid || b.idx === idx, u);
	});
	if (!list.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText('No berries in the bag — they grow on routes!', W * 0.55, 100 * u);
	}
	if (b.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(b.flash, 32 * u, H - 18 * u);
	}
}

