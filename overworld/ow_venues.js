// ow_venues.js — the side venues: the Bug-Catching Contest, the Trick House, the Ruins of Alph sliding puzzles and UNOWN DEX, and Pokémon Contests.
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
import { sfx } from './sound.js';
import * as Story from './events.js';
import { ruinsPuzzleFlags } from './unown_puzzle.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { dexMilestoneCheck } from './ow_follower.js';
import { syncMapBgm } from './ow_music.js';
import { warpTo } from './ow_transitions.js';


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
// Leaving the park any way but a gate — Fly, Dig, an ESCAPE ROPE, Teleport — runs
// pokecrystal's Script_AbortBugContest (engine/events/overworld.asm): the day's
// contest is over, unjudged, and the entry is forfeited. Only walking out through a
// gate is judged (ow_fieldmoves.js). Called on every map load; before this a Fly to
// Goldenrod left the contest running, to be judged on the next visit to a gate.
const BUG_CONTEST_MAPS = /^MAP_(NATIONAL_PARK|ROUTE_3[56]_NATIONAL_PARK_GATE)$/;
export function bugContestLeftPark(mapId) {
	if (!bugContest.active || BUG_CONTEST_MAPS.test(mapId || '')) return;
	bugContest.active = false;
	bugContest.caught = null;
	saveBugContest();
	for (let g = 0; g < 25 && Bag.count('sportball') > 0; g++) Bag.consume('sportball');
	hud.textContent = 'You left the park, so the BUG-CATCHING CONTEST is over.';
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

// ---------- Ruins of Alph: legacy slide-puzzle progress ----------
// The replica walls used to deal a 3x3 slide puzzle of each chamber's Pokemon,
// remembered in magepunk_ruins_v1. Crystal's own UNOWN PUZZLE (unown_puzzle.js)
// replaced it; chambers solved the old way still count for the ! and ? Unown.
const RUINS_KEY = 'magepunk_ruins_v1';

// ---------- the UNOWN DEX (Ruins of Alph) ----------
// 28 letters, one species each (unown = A, then unown_b … unown_z, unown_exclaim,
// unown_question). Every catchable letter is recorded in pokedex.js; this shows
// the collection and gates the ! / ? forms behind solving all four puzzles — the
// classic reveal. The research-center scientists open this report.
export const UNOWN_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '!', '?'];
const UNOWN_ID = { A: 'unown', '!': 'unown_exclaim', '?': 'unown_question' };
export const unownIdFor = L => UNOWN_ID[L] || 'unown_' + L.toLowerCase();
// a chamber counts when either its (retired) slide puzzle or its Crystal UNOWN PUZZLE
// (EVENT_SOLVED_*_PUZZLE, unown_puzzle.js) is solved
export const allRuinsSolved = () => { const s = safeLoad(RUINS_KEY, { solved: {} }).solved || {}; const f = ruinsPuzzleFlags(); return ['kabuto', 'omanyte', 'aerodactyl', 'hooh'].every((k, i) => s[k] || Story.getFlag(f[i])); };
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
// The contest itself is contest_ui.js (the reception, the stage, the results) over
// contest_engine.js (pokeemerald's rules); the Berry Blender is minigames/blender/.
export { CONTEST_KEY, contestKey, contestMenu, contestProgress, contestSpriteFor, drawContest } from './contest_ui.js';
import { contestSpriteFor } from './contest_ui.js';

