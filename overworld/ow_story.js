// ow_story.js — the story layer: map-script triggers and the ported decomp scripts (runScriptLabel / runSpecial), scripted battles, the Space Center multi battle, the Johto gift POKeMON, the Fork B campaign open, villain arcs and the recurring rival.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import { buildMon as battleBuildMon, statsFor } from './battle.js';
import { INIT_EVENTS } from './crystal_init_events.js';
import * as Daycare from './daycare.js';
import { getImage } from './engine.js';
import * as Story from './events.js';
import * as GymPuzzles from './gym_puzzles.js';
import { Journal } from './journal.js';
import { battle, cutscene, dialog, hud, npcs, player, trainers, world } from './ow_core.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { S } from './ow_state.js';
import { openUnownDex } from './ow_venues.js';
import { addCaught, createStarter, healParty, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { RIVAL_TIERS, rivalDue, rivalFlag } from './rivals.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import * as Trades from './trades.js';
import { BOSS_CLASSES } from './trainers.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { openRadio } from './ow_features.js';
import { startNpcTrade } from './ow_screens.js';
import {
	STARTERS, bossLevelFor, buildMonForGift, cutsceneCtx, dexMilestoneCheck, halfParty, inJohKanto,
	johkantoLeagueKind, moveToMap, notePostBattleFinished, onTrainerDefeated, openHalfParty,
	playerRegion, refreshFollower, refreshObjective, routeTrainerLevel, startCutscene, starterMenu,
	urlPinnedMap, warpTo, whiteOut,
} from './main.js';

// ---------- ported map-script triggers ----------
// resolve a script label (an NPC's `script`, a coord_event, a map trigger) and
// run it through the interpreter with the current map's strings
export function runScriptLabel(label, talker) {
	if (cutscene.blocking || !label) return false;
	// VAR_LAST_TALKED resolves to whoever this script was started ON. Recorded
	// here rather than in interact() so trainer talks and coord scripts set it too.
	if (talker) S.lastTalkedNpc = talker;
	syncScriptVars();   // VAR_FACING/VAR_WEEKDAY/VAR_PARTYCOUNT, fresh for this run
	// In-game trades are intercepted here, before the script runs. The Kanto and
	// Hoenn scripts exist but drive the trade through four `special` ops this
	// port never implemented; the Johto ones were dropped entirely at transpile
	// (Kyle is [faceplayer, end]), so there is no script to run at all. One flow
	// serves both -- see trades.js.
	const tr = Trades.forScript(world.current.name, label);
	if (tr) { startNpcTrade(tr, talker); return true; }
	// every std radio object (BillsHouseRadio, KurtsHouseRadio, ...) resolves to
	// the flavour-only Radio2Script; hijack them into the real tune-in menu. The
	// intro tutorial radios end in "RadioScript", so /Radio$/ leaves them alone.
	if (/Radio$/.test(label)) { openRadio(); return true; }
	// the Ruins of Alph research-center scientists open the Unown Dex report. The
	// full Crystal flow (VAR_UNOWNCOUNT/UnownPrinter) was inert; the scientists are
	// the reliably-reachable hook (Scientist1/2 are always visible).
	if (/^RuinsOfAlphResearchCenterScientist\d?Script$/.test(label)) { openUnownDex(); return true; }
	if (!S.mapScripts[label]) {
		// Crystal factors its common NPCs through `jumpstd`, which the transpiler
		// drops — so 237 bookshelves, signs and trash cans have no label at all.
		// Run the shared body instead of falling through to silence.
		const std = Story.crystalStd(label);
		if (!std) return false;
		cutscene.run({ [label]: std }, label, cutsceneCtx(talker, label), () => { saveParty(S.party); });
		return true;
	}
	// notePostBattleFinished: onDone fires only when the scene REACHES ITS END.
	// cutscene.stop() drops the scene without it, which is exactly the signal a
	// post-battle beat needs — an interrupted beat stays un-done and is retried.
	cutscene.run(S.mapScripts, label, cutsceneCtx(talker, label), () => { saveParty(S.party); notePostBattleFinished(); });
	return true;
}

// a scripted trainerbattle: build the foe party (canonical roster keyed by the
// running script label, else a class-pool team at the map's level), run it, and
// resume the cutscene with the outcome in VAR_RESULT (1 = won). A loss stops the
// script (the player blacked out) after healing.
export function startScriptedBattle(trainerId, scriptLabel, talker) {
	if (!S.party || !leadMon(S.party)) { Story.setVar('VAR_RESULT', 1); return 'skip'; }
	// canonical team by TRAINER_ id first (exact species/level/moves), then the
	// script-label roster, then a class-pool fallback at the map's level
	const tid = (trainerId || '').replace(/^TRAINER_/, '');
	const team = S.trainerTeams[tid];
	const roster = scriptLabel && trainers.data?.rosters?.[scriptLabel];
	let foeParty = [];
	let className = team?.class || roster?.class || 'Trainer';
	// Same rule as trainers.levelScale: in JohKanto a BOSS is levelled off you (ace
	// two above your strongest, the rest one), everything else scales relatively.
	const srcParty = team?.party?.length ? team.party : (roster?.party || []);
	const aceLv = Math.max(0, ...srcParty.map(e => e.l || 0));
	const foeLevel = (e) => {
		if (!inJohKanto() && !johkantoLeagueKind(scriptLabel) && !johkantoLeagueKind(trainerId)) return e.l;
		const lk = johkantoLeagueKind(scriptLabel) || johkantoLeagueKind(trainerId);
		if (lk) return bossLevelFor(lk, (e.l || 0) >= aceLv);
		if (BOSS_CLASSES.has(className)) return bossLevelFor('gym', (e.l || 0) >= aceLv);
		return routeTrainerLevel(e.l);
	};
	if (team?.party?.length) {
		foeParty = team.party.map(e => {
			const mon = battleBuildMon(e.s, foeLevel(e), battle.data);
			if (mon && e.moves?.length) {
				mon.moves = e.moves.map(id => {
					const mv = battle.data.moves[id];
					return mv ? { id, name: mv.name, pp: mv.pp, maxPp: mv.pp } : null;
				}).filter(Boolean);
				if (!mon.moves.length) mon.moves = [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }];
			}
			return mon;
		}).filter(Boolean);
	}
	if (!foeParty.length && roster?.party?.length) {
		foeParty = roster.party.map(e => battleBuildMon(e.s, foeLevel(e), battle.data)).filter(Boolean);
	}
	if (!foeParty.length) {
		const pool = trainers.data?.defaultPool || ['rattata', 'pidgey'];
		const base = trainers.data?.mapLevel?.[world.current.map.id] || 12;
		const n = 1 + Math.floor(Math.random() * 2);
		for (let i = 0; i < n; i++) {
			const mon = battleBuildMon(pool[Math.floor(Math.random() * pool.length)],
				Math.max(5, base + (Math.floor(Math.random() * 5) - 2)), battle.data);
			if (mon) foeParty.push(mon);
		}
	}
	if (!foeParty.length) { Story.setVar('VAR_RESULT', 1); return 'skip'; }
	const high = Math.max(5, ...foeParty.map(m => m.level));
	const info = {
		displayName: roster?.name ? `${className} ${roster.name}` : className,
		defeatText: '', money: high * 8,
		boss: BOSS_CLASSES.has(className), // gym leaders / E4 / champions via scripts
	};
	battle.endSpec = { kind: 'strainer', script: talker?.ev?.script || null };
	battle.startTrainer(S.party, foeParty, info, result => {
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			S.lastBattleOutcome = B_OUTCOME_WON;
			if (talker && trainers.list.includes(talker)) trainers.markDefeated(talker);
			saveParty(S.party);
			onTrainerDefeated(talker?.ev?.script, { silent: true }); // badge/crown; the script's own speech announces it
			cutscene.resume(); // continue the script (defeat text, post-battle)
		} else {
			// blacked out / fled: heal and abandon the rest of the script
			Story.setVar('VAR_RESULT', 0);
			S.lastBattleOutcome = B_OUTCOME_LOST;
			if (result === 'defeat') whiteOut();
			cutscene.stop();
		}
	});
	return 'wait';
}

// ---------- the Mossdeep Space Center multi battle ----------
// pokeemerald battle_tower.c: Steven (partner) + you vs Maxie + Tabitha. The foe
// teams are the decomp's; the two leaders' mons interleave so each side of the
// double opens with one of each. Steven fights beside you with sStevenMons.
// EVs are the decomp's {HP, Atk, Def, Spe, SpA, SpD}, re-keyed.
const STEVEN_PARTNER = [
	{ s: 'metang', l: 42, nature: 'brave', evs: { atk: 252, def: 252, spa: 6 }, moves: ['lightscreen', 'psychic', 'reflect', 'metalclaw'] },
	{ s: 'skarmory', l: 43, nature: 'impish', evs: { hp: 252, spa: 6, spd: 252 }, moves: ['toxic', 'aerialace', 'protect', 'steelwing'] },
	{ s: 'aggron', l: 44, nature: 'adamant', evs: { atk: 252, spa: 252, spd: 6 }, moves: ['thunder', 'protect', 'solarbeam', 'dragonclaw'] },
];
function buildPartnerMon(e) {
	const mon = battleBuildMon(e.s, e.l, battle.data);
	if (!mon) return null;
	mon.ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };   // fixedIV = MAX_PER_STAT_IVS
	mon.nature = e.nature;
	mon.evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...e.evs };
	mon.stats = statsFor(battle.data.species[e.s], mon.ivs, mon.level, mon);
	mon.maxHP = mon.curHP = mon.stats.hp;
	mon.moves = giftMoves(e.moves);
	return mon;
}
// the picked mons (party indices, in pick order) while the multi battle is on
S.multiPicks = null;
const pickedView = picks => (picks || []).map(i => S.party[i]).filter(m => m && m.curHP > 0);
function startSpaceCenterBattle() {
	const build = tid => (S.trainerTeams[tid]?.party || []).map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
	const maxie = build('MAXIE_MOSSDEEP'), tabitha = build('TABITHA_MOSSDEEP');
	const foeParty = [];
	for (let i = 0; i < Math.max(maxie.length, tabitha.length); i++) {
		if (maxie[i]) foeParty.push(maxie[i]);
		if (tabitha[i]) foeParty.push(tabitha[i]);
	}
	const mine = S.multiPicks?.length ? pickedView(S.multiPicks) : (S.party || []).filter(m => m.curHP > 0).slice(0, 3);
	if (!foeParty.length || !mine.length) { Story.setVar('VAR_RESULT', 1); return; }
	const steven = STEVEN_PARTNER.map(buildPartnerMon).filter(Boolean);
	const info = { displayName: 'MAXIE & TABITHA', defeatText: '', money: 44 * 8 * 2, boss: true, double: true,
		partner: steven.length ? { name: 'STEVEN', party: steven } : null };
	battle.endSpec = { kind: 'spacecenter', picks: mine.map(m => S.party.indexOf(m)) };
	battle.startTrainer(mine, foeParty, info, result => {
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			S.lastBattleOutcome = B_OUTCOME_WON;
			saveParty(S.party);
			cutscene.resume();
		} else {
			// the script's own loss path is SetCB2WhiteOut; black out here instead
			// (the stopped script never reaches its LoadPlayerParty)
			S.multiPicks = null;
			Story.setVar('VAR_RESULT', 2);
			S.lastBattleOutcome = B_OUTCOME_LOST;
			if (result === 'defeat') whiteOut();
			cutscene.stop();
		}
	});
	return 'wait';
}

// ---------- Johto gift POKeMON (pokecrystal engine/events) ----------
const giftMoves = ids => ids.map(id => battle.data.moves[id] && { id, name: battle.data.moves[id].name, pp: battle.data.moves[id].pp, maxPp: battle.data.moves[id].pp }).filter(Boolean);
function giveGift(mon) { Dex.markCaught(mon.speciesId); dexMilestoneCheck(); const to = addCaught(S.party, mon); saveParty(S.party); return to; }
// DRAGON SHRINE. The transpile dropped the script's `givepoke DRATINI, 15`, so this
// special gives the DRATINI as well as setting its moveset: EXTREMESPEED (a move it
// can't otherwise learn) for a flawless quiz, the plain Lv15 set otherwise.
function giveDratini() {
	const mon = buildMonForGift('dratini', 15);
	if (!mon) return;
	const wrong = Story.getFlag('EVENT_ANSWERED_DRAGON_MASTER_QUIZ_WRONG');
	mon.moves = giftMoves(wrong ? ['wrap', 'leer', 'thunderwave', 'twister'] : ['wrap', 'thunderwave', 'twister', 'extremespeed']);
	giveGift(mon);
}
// DAY-CARE MAN: the ODD EGG. data/events/odd_eggs.asm — seven babies, each with a
// fixed Dizzy Punch set and a separate (much likelier than wild) shiny entry.
const ODD_EGGS = [
	{ s: 'pichu', moves: ['thundershock', 'charm', 'dizzypunch'], p: [8, 1] },
	{ s: 'cleffa', moves: ['pound', 'charm', 'dizzypunch'], p: [16, 3] },
	{ s: 'igglybuff', moves: ['sing', 'charm', 'dizzypunch'], p: [16, 3] },
	{ s: 'smoochum', moves: ['pound', 'lick', 'dizzypunch'], p: [14, 2] },
	{ s: 'magby', moves: ['ember', 'dizzypunch'], p: [10, 2] },
	{ s: 'elekid', moves: ['quickattack', 'leer', 'dizzypunch'], p: [12, 2] },
	{ s: 'tyrogue', moves: ['tackle', 'dizzypunch'], p: [10, 1] },
];
function rollOddEgg(r = Math.random()) {
	let acc = 0, roll = r * 100;
	for (const e of ODD_EGGS) for (let shiny = 0; shiny < 2; shiny++) {
		acc += e.p[shiny];
		if (roll < acc) return { s: e.s, moves: e.moves, shiny: !!shiny };
	}
	return { s: 'pichu', moves: ODD_EGGS[0].moves, shiny: false };
}
function giveOddEgg() {
	const egg = rollOddEgg();
	if (Daycare.giftEgg(egg.s, { moves: egg.moves, shiny: egg.shiny })) {
		hud.textContent = 'You received an ODD EGG! It is at the DAY CARE — walk to hatch it.';
		return;
	}
	// the Day Care egg slot is busy with a bred egg: hand over the baby itself
	const mon = buildMonForGift(egg.s, 5);
	if (!mon) return;
	Daycare.applyPreset(mon, egg, battle.data);
	giveGift(mon);
}
// MANIA's SHUCKIE (engine/events/shuckle.asm). Lv15 SHUCKLE holding a BERRY, OT
// MANIA / ID 00518. Crystal refuses when the party is full (VAR_RESULT 0 routes
// the script to its "party full" line); the loan sets a once-a-day flag.
const MANIA_OT = { name: 'MANIA', id: 518 };
const localDay = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
function giveShuckle() {
	if ((S.party || []).length >= 6) return 0;
	const mon = buildMonForGift('shuckle', 15);
	if (!mon) return 0;
	mon.nickname = 'SHUCKIE';
	mon.heldItem = 'berry';
	mon.otName = MANIA_OT.name;
	mon.otId = MANIA_OT.id;
	giveGift(mon);
	Story.setFlag('ENGINE_GOT_SHUCKIE_TODAY');
	Story.setVar('VAR_MP_SHUCKIE_DAY', localDay());
	return 1;
}
// Crystal makes you pick a mon; here the SHUCKIE in the party is the one offered.
// 0 WRONG_MON (none with MANIA's OT) · 2 RETURNED · 3 HAPPY (friendship >= 150,
// Mania lets you keep it) · 4 FAINTED (it is fainted, or it is your last healthy mon)
function returnShuckie() {
	const i = (S.party || []).findIndex(m => m.speciesId === 'shuckle' && m.otName === MANIA_OT.name && (m.otId ?? MANIA_OT.id) === MANIA_OT.id);
	if (i < 0) return 0;
	const mon = S.party[i];
	if (mon.curHP <= 0 || !S.party.some((m, j) => j !== i && m.curHP > 0)) return 4;
	if ((mon.friend ?? 70) >= 150) return 3;
	if (mon.heldItem) Bag.addItem(mon.heldItem);
	S.party.splice(i, 1);
	saveParty(S.party);
	return 2;
}
// ENGINE_GOT_SHUCKIE_TODAY is one of Crystal's daily flags: it lapses at midnight
function expireDailyFlags() {
	if (Story.getFlag('ENGINE_GOT_SHUCKIE_TODAY') && Story.getVar('VAR_MP_SHUCKIE_DAY') !== localDay()) Story.clearFlag('ENGINE_GOT_SHUCKIE_TODAY');
}
// ON_TRANSITION runs silently on map entry (sets story vars, positions NPCs).
// It is setup only, so run the instant ops and bail at any waiting op — it must
// never block the game or pop dialogue.
// the grid/vars/rng a ported gym special works against
function puzzleWorld() {
	return {
		get: (x, y) => { const row = world.current?.layout?.map?.[y]; return row ? (row[x] ?? 0) & 0x3FF : 0; },
		set: (x, y, id, impassable) => world.setMetatile(x, y, id, !!impassable),
		getVar: v => Story.getVar(v) | 0,
		setVar: (v, n) => Story.setVar(v, n),
		rng: Math.random,
	};
}
// ON_LOAD: the decomp's map-setup script, run before ON_TRANSITION. It lays out
// puzzle tiles to match your progress. Only enabled for the maps whose puzzle
// mechanics are actually ported (GymPuzzles.ONLOAD_MAPS) — game-wide it is 124
// maps of never-executed setmetatile, some raising walls nothing here can lower.
function runMapOnLoad() {
	if (!GymPuzzles.ONLOAD_MAPS.has(world.current.name)) return;
	const meta = S.mapScripts.__map__;
	if (!meta || !meta.onLoad || !S.mapScripts[meta.onLoad] || cutscene.blocking) return;
	cutscene.run(S.mapScripts, meta.onLoad, cutsceneCtx(), () => {});
	if (cutscene.blocking) cutscene.stop(); // setup only
}
// THE DECOMP RUNS A MAP'S SETUP SCRIPTS BEFORE ITS OBJECTS SPAWN; THIS PORT RUNS
// THEM AFTER. So a setup script that clears an object's hide flag — Bill's Sea
// Cottage OnTransition brings Clefairy-Bill back that way — changed the flag but
// not the already-built object list: re-enter mid-event and there was no Bill to
// talk to, and the PC (keyed on a temp flag that had just cleared) refused. A
// softlock that only appeared once hideobj correctly persisted FLAG_HIDE_*.
//
// Rather than reorder map entry, re-check afterwards: if setup changed whether
// any object should be visible, reload the objects and run the setup scripts once
// more (they are setup-only and idempotent — positions they set, like Bill's
// setobjxy, need the rebuilt objects to land on).
export async function runMapSetupScripts(isBoot) {
	expireDailyFlags();
	const evs = world.current?.map?.object_events || [];
	const vis = () => evs.map(ev => Story.objectHiddenByFlag(ev) ? 1 : 0).join('');
	const before = vis();
	const run = () => {
		try { runMapOnLoad(); } catch (e) { console.warn('[plot] onLoad failed', e); if (cutscene.blocking) cutscene.stop(); }
		try { runMapTransition(); } catch (e) { console.warn('[plot] onTransition failed', e); if (cutscene.blocking) cutscene.stop(); }
	};
	run();
	if (vis() === before) return;
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	run();
}

function runMapTransition() {
	// SilphCo floors' OnLoad only erects the Card-Key door barriers (via setMetatile);
	// that puzzle is broken/unfun in this port and would wall the Giovanni crawl, so
	// skip it — the floors stay freely walkable.
	if (/^SilphCo_\d/.test(world.current.name)) return;
	const meta = S.mapScripts.__map__;
	if (!meta || !meta.onTransition || !S.mapScripts[meta.onTransition]) return;
	if (cutscene.blocking) return;
	cutscene.run(S.mapScripts, meta.onTransition, cutsceneCtx(), () => {});
	if (cutscene.blocking) cutscene.stop(); // hit a wait — setup only, don't block
}
// ON_FRAME table: if a scene var matches, auto-run that cutscene. Value-0
// entries are the "scene not started" default and must not fire from a blank
// save (story vars default to 0) — they only trigger once a script has set the
// var, which we track via an explicit presence check.
export function checkOnFrame() {
	const meta = S.mapScripts.__map__;
	if (!meta || !meta.onFrame || cutscene.blocking) return;
	for (const e of meta.onFrame) {
		if (e.value === 0 && !Story.hasVar(e.var)) continue;
		if (plotBlocked(e.label)) continue; // never runs here (see plotBlocked)
		if (Story.getVar(e.var) === e.value && S.mapScripts[e.label]) {
			runScriptLabel(e.label);
			return;
		}
	}
}
// coord_event trigger: stepping on a tile whose gating var matches its value
// fires the tile's ported script (Oak stopping you at the town edge, etc.)
// Some enabled plot coord-scenes don't advance their own scene var in this data,
// so they'd replay every time you re-step their trigger tile (a farmable rival
// rematch, a repeated greeting). Map each such trigger label to a shared scene
// key; once fired, the whole group is suppressed. (Scenes that DO self-advance —
// all the Hoenn set-pieces, and the self-EVENT-guarded Rocket cameras — aren't
// listed; they one-shot themselves.)
// Coord scripts that must NEVER run here. Used where the scene gates on a var
// OTHER regions also read (so seeding it would suppress unrelated content) —
// suppressing by label keeps the fix surgical.
export const PLOT_BLOCKED = new Set([
	// e-Reader visiting trainer: warps the player out and needs StartSpecialBattle
	'SevenIsland_House_Room2_EventScript_BattleVisitingTrainer',
	// link cable-club exit: no link play in this port, and it never self-advances
	'CableClub_EventScript_ExitMinigameRoom',
	// Sootopolis gym's ice puzzle: gated on the STEP COUNT, so at 0 it drops you
	// through the floor the moment you walk in
	'SootopolisCity_Gym_1F_EventScript_FallThroughIce',
]);
// The BATTLE FRONTIER / battle tents are reimplemented natively (frontier.js +
// factoryspec.js), but the decomp ships them as onFrame state machines gated on
// VAR_TEMP_* — which persist here. Left live, resuming a save inside one of
// those rooms would fire a challenge-flow script and warp the player. The whole
// family is inert; the native implementation owns these buildings.
export const plotBlocked = label => typeof label === 'string' && (PLOT_BLOCKED.has(label)
	|| label.startsWith('BattleFrontier_') || label.startsWith('TrainerHill_')
	|| /_BattleTent/.test(label));
export const PLOT_ONESHOT = {
	MeetMomLeftScript: 'jo_mom', MeetMomRightScript: 'jo_mom',
	FirstStepIntoKantoLeftScene: 'jo_route27', FirstStepIntoKantoRightScene: 'jo_route27',
	ReleaseTheBeasts: 'jo_burnedtower',
	LanceHealsScript1: 'jo_lance_heal', LanceHealsScript2: 'jo_lance_heal',
	UndergroundRivalScene1: 'jo_goldenrod_rival', UndergroundRivalScene2: 'jo_goldenrod_rival',
	VictoryRoadRivalLeft: 'jo_victoryroad_rival', VictoryRoadRivalRight: 'jo_victoryroad_rival',
};
let firedPlot = null;
export function loadFiredPlot() {
	if (!firedPlot) { const f = safeLoad('magepunk_plot_fired', []); firedPlot = new Set(Array.isArray(f) ? f : []); }
	return firedPlot;
}
export function markPlotFired(key) { const s = loadFiredPlot(); if (!s.has(key)) { s.add(key); safeSave('magepunk_plot_fired', [...s]); } }

export function checkCoordTrigger() {
	const evs = world.current.map.coord_events || [];
	for (const e of evs) {
		if (+e.x !== player.tx || +e.y !== player.ty) continue;
		if (e.var && e.var !== '0' && Story.getVar(e.var) !== parseInt(e.var_value, 10)) continue;
		if (e.script && S.mapScripts[e.script]) {
			if (plotBlocked(e.script)) continue; // never runs here (see plotBlocked)
			const once = PLOT_ONESHOT[e.script];
			if (once) {
				if (loadFiredPlot().has(once)) continue; // this plot beat already played
				markPlotFired(once);                     // mark at fire-start (both trigger tiles share the key)
			}
			return runScriptLabel(e.script);
		}
	}
	return false;
}

// Stage 4 — reconcile the sandbox start with the linear story. The web player
// gets a starter via the region picker, so the decomp scene vars that gate the
// "you have no Pokemon yet" intro must be advanced past their trigger state or
// the early cutscenes (Oak stopping you at the town edge) block a player who's
// already ready. Seeded once on a new game for the chosen region.
export const STORY_SEED = {
	KANTO: {
		vars: {
			// player already has a starter -> skip PalletTown's "can't go out"
			// block (0) and the pokedex-rating auto-scene (2); 1 is neither.
			// The lab's own scene var (VAR_MAP_SCENE_PALLET_TOWN_PROFESSOR_OAKS_LAB)
			// is intentionally left at its default 0: that value skips both the
			// ChooseStarter (1) and NationalDex (7) onFrame scenes, so a
			// starter-holding region-picker walks into a normal, non-scripted lab.
			VAR_MAP_SCENE_PALLET_TOWN_OAK: 1,
			// FireRed drives its plot from NPC scripts + flags, and its set-pieces
			// are `onFrame` scenes rather than the coord_events Hoenn/Johto use.
			// checkOnFrame deliberately ignores a value-0 scene until its var has
			// been SET (so a fresh save isn't ambushed by every scene at once) —
			// which left Kanto's beats dormant forever. Seeding a var to 0 ARMS
			// its scene. The safe, self-advancing set-pieces below are now on:
			//   VIRIDIAN_CITY_MART — Oak's Parcel handed over by the clerk;
			//   ONE_ISLAND_POKEMON_CENTER — meeting Celio (Tri-Pass + Town Map);
			//   TWO_ISLAND_JOYFUL_GAME_CORNER — the Lostelle rescue opens;
			//   FOUR_ISLAND / SIX_ISLAND_POKEMON_CENTER — the rival cameos.
			// Each is dialogue/choreography that ends by advancing its own var, so
			// it plays once and never repeats, and none warps or edits tiles.
			VAR_MAP_SCENE_VIRIDIAN_CITY_MART: 0,
			VAR_MAP_SCENE_ONE_ISLAND_POKEMON_CENTER_1F: 0,
			VAR_MAP_SCENE_TWO_ISLAND_JOYFUL_GAME_CORNER: 0,
			VAR_MAP_SCENE_FOUR_ISLAND: 0,
			VAR_MAP_SCENE_SIX_ISLAND_POKEMON_CENTER_1F: 0,
			// LEFT DORMANT (never armed): LOST_CAVE_ROOM10 fires on entry and WARPS
			// you out to Resort Gorgeous, so the room could never be explored (the
			// Selphy rescue still resolves through the Two Island scene above).
			// SEVEN_ISLAND_HOUSE_ROOM2 (e-Reader trainer: warp + StartSpecialBattle,
			// which this engine has no path for) and the CABLE_CLUB link-room exit
			// (no link play, never self-advances) gate on SHARED vars other regions
			// also read, so they're suppressed by label in PLOT_BLOCKED instead.
			VAR_MAP_SCENE_FIVE_ISLAND_LOST_CAVE_ROOM10: 1,
		},
		flags: [
			'FLAG_ADVENTURE_STARTED',
			'FLAG_GOT_FIRST_POKEMON',
			// the intro-scene Oak on the Pallet path (script 0x0 — he only exists
			// for FR's escort cutscene). The old entry had the flag's words in the
			// wrong order, so he stood there mute forever.
			'FLAG_HIDE_OAK_IN_PALLET_TOWN',
			// FR's table starter balls parse as GRABBABLE item balls (their
			// scripts resolve through parseBallScript) — the pick is menu-based
			// here, so the physical balls must go
			'FLAG_HIDE_BULBASAUR_BALL', 'FLAG_HIDE_SQUIRTLE_BALL', 'FLAG_HIDE_CHARMANDER_BALL',
			// the two Pokedex props on the lab counter (our intro hands the dex
			// over without physical props; unhidden they rendered as people)
			'FLAG_HIDE_POKEDEX',
		],
	},
	HOENN: {
		vars: {
			// past the moving-truck intro (1/2) and Birch's edge block + bag scene
			// (coord triggers gate on 0/1/3), so a starter-holder can explore
			VAR_LITTLEROOT_INTRO_STATE: 4,
			VAR_LITTLEROOT_TOWN_STATE: 4,
			// Emerald gates story cutscenes on per-map/route state vars (vanilla start
			// 0). The DEEPER PLOT is now selectively ON: the seven SAFE set-pieces below
			// are NO LONGER rested, so they cold-fire as authentic one-shots — each
			// self-advances its own state var at the end, so it plays once and never
			// repeats, touches only its own NPCs (showobj/hideobj), and never warps or
			// edits tiles: the Route 110 & 119 rival ambushes, the Petalburg Woods Aqua
			// grunt (VAR_PETALBURG_WOODS_STATE), Scott's cameo, Steven on Route 118, the
			// Route 121 Aqua move-out, and Wally's Victory Road battle.
			//   [ENABLED: VAR_SCOTT_PETALBURG_ENCOUNTER, VAR_PETALBURG_WOODS_STATE,
			//    VAR_ROUTE110_STATE, VAR_ROUTE118_STATE, VAR_ROUTE119_STATE,
			//    VAR_ROUTE121_STATE, VAR_VICTORY_ROAD_1F_STATE]
			// These six stay rested — each would strand or corrupt a free-roam save:
			// OLDALE re-fires a permanent west-exit block; PETALBURG re-fires a control-
			// seizing gym escort; METEOR_FALLS & MT_PYRE flip cross-map hide-flags
			// (deleting content elsewhere) + MT_PYRE gives a key item; SEAFLOOR_CAVERN
			// WARPS the player to Route 128; SKY_PILLAR hides the Rayquaza object the
			// player came to catch. The legendaries are still catchable via
			// LEGENDARY_ENCOUNTERS (a real battle on their tile), decoupled from these
			// awakening scenes.
			// ARMED (the Kanto pass's discovery applied here): Emerald also ships a
			// few set-pieces as `onFrame` scenes, which checkOnFrame ignores until
			// their var is SET — so these sat dormant forever. Seeding to 0 arms
			// them. All three are dialogue/choreography that self-advance, take no
			// warp and edit no tiles:
			//   DEVON_CORP_3F — meeting the Devon President (hands over the LETTER);
			//   LILYCOVE_MUSEUM_2F — the exhibit-hall tour;
			//   SS_TIDAL_SCOTT — Scott's cameo in the ferry corridor.
			// NOT armed: VAR_SS_TIDAL_STATE (the ferry-ride state machine — this
			// port has its own ferry), VAR_ELITE_4_STATE (shared across the E4
			// sequence the native flow owns), VAR_ICE_STEP_COUNT (Sootopolis gym —
			// blocked by label instead, since 0 means "drop through the floor now"),
			// and the whole Battle Frontier / battle-tent family (see plotBlocked).
			VAR_DEVON_CORP_3F_STATE: 0,
			VAR_LILYCOVE_MUSEUM_2F_STATE: 0,
			VAR_SS_TIDAL_SCOTT_STATE: 0,
			VAR_OLDALE_TOWN_STATE: 1,
			VAR_PETALBURG_CITY_STATE: 1,
			VAR_METEOR_FALLS_STATE: 1,
			VAR_MT_PYRE_STATE: 1,
			VAR_SEAFLOOR_CAVERN_STATE: 1,
			VAR_SKY_PILLAR_RAYQUAZA_CRY_DONE: 1,
		},
		flags: ['FLAG_ADVENTURE_STARTED', 'FLAG_GOT_FIRST_POKEMON',
			// Emerald's opening-scene actors and props (managed by cutscenes this
			// port replaces with its own intro): the lab's scene-rival (drawn as
			// Birch's identical twin), the bag-scene starter balls (three stacked
			// on one tile), the moving trucks, and the outdoor scene copies of
			// Mom / Birch / the rival / the mover
			'FLAG_HIDE_LITTLEROOT_TOWN_BIRCHS_LAB_RIVAL',
			'FLAG_HIDE_LITTLEROOT_TOWN_BIRCHS_LAB_POKEBALL_CYNDAQUIL',
			'FLAG_HIDE_LITTLEROOT_TOWN_BIRCHS_LAB_POKEBALL_TOTODILE',
			'FLAG_HIDE_LITTLEROOT_TOWN_BIRCHS_LAB_POKEBALL_CHIKORITA',
			'FLAG_HIDE_LITTLEROOT_TOWN_RIVAL',
			'FLAG_HIDE_LITTLEROOT_TOWN_BIRCH',
			'FLAG_HIDE_LITTLEROOT_TOWN_BRENDANS_HOUSE_TRUCK',
			'FLAG_HIDE_LITTLEROOT_TOWN_MAYS_HOUSE_TRUCK',
			'FLAG_HIDE_LITTLEROOT_TOWN_MOM_OUTSIDE',
			'FLAG_HIDE_LITTLEROOT_TOWN_FAT_MAN',
		],
	},
	JOHTO: {
		// Crystal gates its story coord_events on a per-map scene var VAR_SCENE_<Map>
		// (vanilla start 0). The DEEPER PLOT is now selectively ON: the maps NOT listed
		// below are no longer rested, so their scene-0 coord_events cold-fire. Enabled
		// (all safe — dialogue/battle/flavor, no player-warp, no tile edits):
		//   Mom's greeting (PlayersHouse1F), the Route 27 fisher, the Burned Tower
		//   legendary-beasts awakening, the Team Rocket HQ security cameras + floor
		//   traps → grunt battles (B1F, each self-guarded by its own EVENT flag), the
		//   B2F Lance heal (its boss/lock coord_events sit at value 1/2 and stay
		//   dormant while the var rests at 0), the Goldenrod Underground + Victory Road
		//   RIVAL ambushes, and the Indigo Plateau rival (self-guards / no-ops for a
		//   fresh save). The scenes lacking a self-advance are made one-shot via
		//   PLOT_ONESHOT below so they don't re-fire on tile re-entry.
		// These stay rested — each strands or corrupts a free-roam save: NewBarkTown
		// (no-starter block), Route32 & MahoganyTown & Olivine & SproutTower3F &
		// WiseTriosRoom & MagnetTrain (force-move the player / linear gates),
		// Olivine/Vermilion PORTS & FastShip (warp the player onto the S.S. Aqua),
		// RadioTower5F (hands a key item), Ecruteak TinTower entrance (a sage NPC that
		// slides over to block the stairs — would gate Ho-Oh in free-roam).
		vars: {
			VAR_SCENE_NewBarkTown: 1,
			VAR_SCENE_Route32: 2,
			VAR_SCENE_MahoganyTown: 1,
			VAR_SCENE_OlivineCity: 1,
			VAR_SCENE_OlivinePort: 1,
			VAR_SCENE_VermilionPort: 1,
			VAR_SCENE_FastShipB1F: 1,
			VAR_SCENE_SproutTower3F: 1,
			VAR_SCENE_EcruteakTinTowerEntrance: 1,
			VAR_SCENE_WiseTriosRoom: 1,
			VAR_SCENE_RadioTower5F: 2,
			VAR_SCENE_GoldenrodMagnetTrainStation: 1,
		},
		flags: ['FLAG_ADVENTURE_STARTED', 'FLAG_GOT_FIRST_POKEMON'],
	},
};
// Arm any seed var this save has NEVER set. Idempotent and non-destructive: a
// var the playthrough already touched keeps its value, so this only fills in
// scenes added to STORY_SEED after the save was created (a fresh game is a
// no-op — seedStoryState just set them all). Without it, saves made before a
// scene was armed would never see it, since `story_seeded` is already set.
export function armStoryScenes(region) {
	const seed = STORY_SEED[region];
	if (!seed) return;
	for (const [k, v] of Object.entries(seed.vars || {})) if (!Story.hasVar(k)) Story.setVar(k, v);
	// flags too (idempotent): saves made before a hide-flag joined the seed
	// keep their mute scene-actors otherwise (the Pallet-path Oak, for one)
	for (const f of seed.flags || []) Story.setFlag(f);
}

// Crystal's scripts read VAR_BADGES straight out of the save — the Victory Road
// gate officer turns you back below eight, and several NPCs change their line on
// it. NOTHING in this port ever wrote that var, so it read 0 forever. Restoring
// the gate's trigger without this would have SEALED VICTORY ROAD: the only road
// to the Johto League, and half the Johto<->Gen-2-Kanto link.
//
// Johto's eight, deliberately: the gate is the Johto League's front door and the
// decomp compares against NUM_JOHTO_BADGES. `badgeSliceFor` already awards JOHTO
// badges for Johto's gyms whichever region you started in.
export function syncStoryVars() {
	Story.setVar('VAR_BADGES', Badges.count('JOHTO'));
}

// Vars the scripts READ but nothing here ever WROTE, so every branch on them
// compared against 0 and took the same arm forever. Refreshed immediately before
// a script runs, because two of the three change as you walk around.
//
// VAR_FACING gates the choreography in 122 scripts — which way an NPC should walk
// to reach you, which side Eusine steps to. The encoding matches
// script_constants.js and is OURS: the decomps disagree (Crystal's UP is 1,
// Emerald's DIR_SOUTH is also 1), and since those symbols are only ever compared
// against this var, it only has to agree with itself.
//
// VAR_WEEKDAY drives 83 branches, all Crystal: the Day-of-Week siblings who each
// appear on their own day, the Goldenrod move tutor (Wednesday and Saturday), the
// Dragon's Den rival (Tuesday and Thursday), the Sunday-only dept store floor.
// GSC read the cartridge's real-time clock for this, so the real date is the
// faithful source — "come back on Saturday" means what it says.
const FACING_VALUE = { down: 1, up: 2, left: 3, right: 4 };
function syncScriptVars() {
	Story.setVar('VAR_FACING', FACING_VALUE[player?.facing] || 1);
	Story.setVar('VAR_WEEKDAY', new Date().getDay());          // SUNDAY = 0 .. SATURDAY = 6
	Story.setVar('VAR_PARTYCOUNT', (S.party || []).length);
	Story.setVar('VAR_UNOWNCOUNT', Dex.unownCount());          // lights up the Ruins research-center branches
}

// pokecrystal runs InitializeEventsScript before a new save's first step, and now
// that object visibility reads the event flag for real (objectHiddenByFlag), this
// is what stops the entire Crystal cast walking on at once: it keeps MISTY at the
// Cerulean Cape instead of standing in her gym on day one, BLUE off the Viridian
// Gym floor until you meet him at Cinnabar, and HO-OH off the Tin Tower roof.
//
// Applied to every save whatever region it started in — the past timeline is
// reachable from anywhere, so a Kanto starter walking into Johto needs the same
// starting state. Guarded so it runs exactly once.
//
// Safe for saves made before this shipped: the events it re-sets all gate objects
// that were UNCONDITIONALLY invisible until now, so no playthrough can have made
// meaningful progress against them.
export function seedCrystalEvents() {
	if (Story.getFlag('crystal_events_seeded')) return;
	for (const e of INIT_EVENTS) Story.setFlag(e);
	Story.setFlag('crystal_events_seeded');
}

export function seedStoryState(region) {
	if (Story.getFlag('story_seeded')) return;
	const seed = STORY_SEED[region];
	if (seed) {
		for (const [k, v] of Object.entries(seed.vars || {})) Story.setVar(k, v);
		for (const f of seed.flags || []) Story.setFlag(f);
	}
	// the OTHER regions' seeds too: the portals put all three regions in play
	// from gym one, and a traveller must not be ambushed by a foreign region's
	// new-game scripts (vars the chosen region's seed just set are untouched)
	for (const r of Object.keys(STORY_SEED)) if (r !== region) armStoryScenes(r);
	// the 8 HMs come in the bag (reusable) — teach them to compatible POKeMON and
	// use the field move from the party menu wherever it applies
	for (let i = 1; i <= 8; i++) Bag.addItem('hm' + i);
	Story.setFlag('story_seeded');
}

// special-command dispatch. Store-writing specials set `store` (a VAR_*) to a
// computed value the following branch reads; action specials just do the thing.
// Unknown store-specials default to 0 so branches take the "nothing happened"
// path deterministically rather than reading a stale var.
export const B_OUTCOME_WON = 1, B_OUTCOME_LOST = 2, B_OUTCOME_RAN = 4, B_OUTCOME_CAUGHT = 7;
// What the last script-driven battle actually did. `GetBattleOutcome` used to
// answer WON unconditionally, on the assumption that scripted battles were
// skipped entirely; now that static wild battles really run, the scripts that
// branch on the outcome deserve the truth.
S.lastBattleOutcome = B_OUTCOME_WON;
export function runSpecial(name, store) {
	// query specials write their result to the given store var, or VAR_RESULT by
	// the decomp convention when a plain `special` (no store) is used
	const set = v => Story.setVar(store || 'VAR_RESULT', v | 0);
	const living = () => (S.party || []).filter(m => m.curHP > 0);
	switch (name) {
		// --- action specials ---
		// Crystal names it HealParty; FireRed/Emerald name it HealPlayerParty. Only the
		// latter was handled, so every Crystal "your party is healed" moment (10, incl.
		// the end of the Slowpoke Well beat) silently healed nobody. Found by the audit.
		case 'HealPlayerParty': case 'HealParty': healParty(S.party); return;
		// gym puzzles, ported from field_specials.c (see gym_puzzles.js)
		case 'SetVermilionTrashCans': GymPuzzles.setVermilionTrashCans(puzzleWorld()); return;
		case 'MauvilleGymPressSwitch': GymPuzzles.mauvilleGymPressSwitch(puzzleWorld()); return;
		case 'MauvilleGymSetDefaultBarriers': GymPuzzles.mauvilleGymSetDefaultBarriers(puzzleWorld()); return;
		case 'MauvilleGymDeactivatePuzzle': GymPuzzles.mauvilleGymDeactivatePuzzle(puzzleWorld()); return;
		// --- the Mossdeep Space Center multi battle (Emerald main story) ---
		// Unported, no battle ran and VAR_RESULT never read 1, so the script fell
		// through to SetCB2WhiteOut every time — and before that, ChooseHalfParty
		// answering 0 looped the player back to Steven's prompt forever. There is no
		// AI partner yet (Plans/AI_PARTNER_PLAN.md), so the player fields their own
		// two leads against Maxie + Tabitha as a double battle.
		// The saved party is never cut down: the picks are a VIEW handed to the battle
		// (same mon objects, so damage lands on the real ones) and Load just drops it.
		case 'SavePlayerParty': return;
		case 'ChooseHalfPartyForBattle': return openHalfParty();
		case 'ReducePlayerPartyToSelectedMons': S.multiPicks = halfParty.picked.slice(); return;
		case 'LoadPlayerParty': S.multiPicks = null; return;
		case 'DoSpecialTrainerBattle':
			if (String(Story.getVar('VAR_0x8004')) === 'SPECIAL_BATTLE_STEVEN') return startSpaceCenterBattle();
			return;
		// --- Johto gift POKeMON (pokecrystal engine/events) ---
		case 'GiveDratini': giveDratini(); return;
		case 'GiveOddEgg': giveOddEgg(); return;
		case 'GiveShuckle': return set(giveShuckle());
		case 'ReturnShuckie': return set(returnShuckie());
		case 'UnownPrinter': openUnownDex(); return; // the research-center "print my letters" report
		case 'MagnetTrain': { // the GOLDENROD <-> SAFFRON (JohKanto) crossing
			const here = world.current.map.id;
			const dest = here === 'MAP_GOLDENROD_MAGNET_TRAIN_STATION'
				? 'MAP_JOHKANTO_SAFFRON_MAGNET_TRAIN_STATION' : 'MAP_GOLDENROD_MAGNET_TRAIN_STATION';
			warpTo(dest, 0);
			return;
		}
		case 'SetSeenMon': case 'SetSeenMon2': return; // dex-see: numeric species, skipped
		case 'DrawWholeMapView': case 'ShakeScreen': case 'SpawnCameraObject':
		case 'RemoveCameraObject': case 'DisableMsgBoxWalkaway':
		case 'QuestLog_CutRecording': return; // cosmetic / system

		// --- store-writing queries (a following branch reads `store`) ---
		case 'GetBattleOutcome': return set(S.lastBattleOutcome); // a real static battle records its own; otherwise WON
		case 'CalculatePlayerPartyCount': return set((S.party || []).length);
		case 'GetPlayerPartyCountForOverworld': return set((S.party || []).length);
		case 'IsNationalPokedexEnabled': return set(1);
		case 'GetPokedexCount': case 'GetHoennPokedexCount': case 'GetKantoPokedexCount':
			return set(Dex.counts().caught);
		case 'GetLeadMonFriendship': case 'GetLeadMonFriendshipScore':
			return set(living()[0] ? (living()[0].friend ?? 70) : 0);
		case 'GetFirstFreePartySlot': return set(Math.min((S.party || []).length, 6));
		case 'CountPartyAliveNonEggMonsExcept': case 'CalculatePlayerPartyCountMinusEgg':
			return set(living().length);
		case 'GetPartyMonSpecies': case 'ChoosePartyMon': case 'ScriptGetPartyMonSpecies':
			return set(0); // party-slot pickers: default to the lead / no selection
		case 'DoesPlayerPartyContainSpecies': case 'PlayerPartyContainsSpeciesWithPlayerID':
			return set(0); // numeric species check: can't map reliably -> "no"
		case 'IsSelectedMonEgg': return set(0);
		case 'GetDaycareState': case 'GetNumLevelsGainedFromDaycare': return set(0);
		default:
			// any other store-special resolves to the deterministic default path
			if (store) set(0);
			return;
	}
}

// ---------- Fork B: the authentic campaign open ----------
// A brand-new game no longer hands you a starter up front. You choose a REGION,
// begin with NO POKeMON, hear the professor's welcome, then walk to the lab and
// pick your first partner ON-SCREEN, battle your rival, and receive the POKeDEX.
// The ported plot cutscenes stay seeded off (STORY_SEED) — this hand-authored
// intro is code-driven (a lab-entry trigger + a custom picker), so it never
// depends on the fragile decomp NPC-walk choreography, and it grants the starter
// itself (the transpiled scripts can't: Johto's givepoke was dropped and Hoenn's
// is buried in a native ChooseStarter special).
export const NEW_GAME_INTRO = {
	KANTO: {
		home: 'PalletTown', lab: 'PalletTown_ProfessorOaksLab', prof: 'PROF. OAK', rival: 'GARY',
		intro: [
			'PROF. OAK: Hello there!\nWelcome to the world of POKeMON!',
			'PROF. OAK: My name is OAK.\nPeople call me the POKeMON PROF.',
			'PROF. OAK: This world is inhabited by creatures called POKeMON.\nFor some people, POKeMON are pets. Others use them for battle.',
			"PROF. OAK: I run a LAB right here in PALLET TOWN.\nCome and see me — I have a POKeMON for you!",
		],
		labGreeting: [
			'PROF. OAK: Ah, there you are!\nA young trainer needs a POKeMON of their own.',
			'PROF. OAK: Here — three POKeMON are waiting.\nGo on, choose the one you like best!',
		],
		sendoff: 'PROF. OAK: Now, go! Your very own POKeMON legend is about to unfold!\nA world of dreams and adventures awaits!',
	},
	JOHTO: {
		home: 'NewBarkTown', lab: 'ElmsLab', prof: 'ELM', rival: 'SILVER',
		intro: [
			"MOM: Oh, you're up!\nPROF. ELM next door was looking for you.",
			"MOM: He said something about a POKeMON for you.\nWhy don't you go see him at his LAB?",
			'ELM is the POKeMON PROF. here in NEW BARK TOWN.\nHead to his LAB to get your first partner!',
		],
		labGreeting: [
			"PROF. ELM: Oh good, you're here!\nI've been waiting for you.",
			"PROF. ELM: I have three POKeMON here for my research.\nYou can have one — go ahead and choose!",
		],
		sendoff: 'PROF. ELM: Take good care of it!\nAnd come back soon — I have an errand to ask of you.',
	},
	HOENN: {
		home: 'LittlerootTown', lab: 'LittlerootTown_ProfessorBirchsLab', prof: 'PROF. BIRCH', rival: 'BRENDAN',
		intro: [
			'PROF. BIRCH lives right next door, and studies POKeMON in the wild.',
			"He left word that he's expecting you at his LAB.",
			'Head to the POKeMON LAB in LITTLEROOT TOWN\nto receive your very first POKeMON!',
		],
		labGreeting: [
			'PROF. BIRCH: Welcome, welcome!\nSo you want to be a POKeMON trainer?',
			'PROF. BIRCH: Then take a look — three POKeMON, right here.\nChoose whichever one you like!',
		],
		sendoff: "PROF. BIRCH: Splendid!\nThe wild world of POKeMON is yours to explore now. Off you go!",
	},
};

// Confirm the region, seed the plot-suppression state (+ the reusable HM kit), set
// the rival's name, drop the partyless player into the home town, and roll the
// professor's welcome. The starter is granted later, on-screen, inside the lab.
export function beginNewGame(region) {
	S.party = null;
	seedStoryState(region);                       // full plot-suppression seed + HM kit (no starter yet)
	safeSaveStr('magepunk_region', region);
	const cfg = NEW_GAME_INTRO[region];
	if (!cfg) { openStarterPick(region); return; } // safety net: region without an authored intro
	if (!localStorage.getItem('magepunk_rival')) safeSaveStr('magepunk_rival', cfg.rival);
	const go = !urlPinnedMap && world.current.name !== cfg.home ? moveToMap(cfg.home) : Promise.resolve();
	go.then(() => startIntroNarration(region));
}

export function startIntroNarration(region) {
	const cfg = NEW_GAME_INTRO[region];
	if (!cfg) return;
	startCutscene(cfg.intro.map(text => ({ op: 'say', text })).concat([{ op: 'setflag', flag: 'intro_started' }]));
}

// fired from refreshMapContent after every map load: a partyless player who has
// walked into the region's lab gets the professor greeting + the starter picker.
export function checkIntroTrigger() {
	// a starter pick left open across a map change (anything that moves the
	// player while it's up) must not float over the town — close it; it will
	// reopen the moment they're back in the lab
	if (starterMenu.open && starterMenu.phase === 'pick') {
		const cfg0 = NEW_GAME_INTRO[playerRegion()];
		if (cfg0 && world.current.name !== cfg0.lab) starterMenu.open = false;
	}
	if (S.party || Story.getFlag('intro_done') || cutscene.blocking || dialog.blocking || starterMenu.open) return;
	const cfg = NEW_GAME_INTRO[playerRegion()];
	if (!cfg || world.current.name !== cfg.lab) return;
	// The professor speaks ONCE. This runs from the frame loop (so a reload
	// mid-intro can't strand a partyless player), which means any abnormal
	// close of the picker used to re-fire the whole greeting — and a greeting
	// cutscene's remaining lines would trail the player out the door and play
	// over the town. With the flag, a replay just (re)opens the picker, and
	// only ever here in the lab.
	if (Story.getFlag('intro_greeted')) { openStarterPick(playerRegion()); return; }
	Story.setFlag('intro_greeted');
	startCutscene(cfg.labGreeting.map(text => ({ op: 'say', text })), () => openStarterPick(playerRegion()));
}

// ---------- villain arcs ----------
// Entering a villain beat's location (beat active + undone) plays the boss speech
// then the battle. A win sets the beat's doneFlag (which opens the gated gym /
// League); a loss heals in place so you can leave and re-enter to retry. The
// villain NPCs from the map data are all flag-skipped, so this code-triggered
// encounter is the whole fight (see quest.js VILLAIN_BEATS).
export function checkVillainTrigger() {
	if (!S.party || !leadMon(S.party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	if (!Story.getFlag('intro_done')) return;
	const region = playerRegion();
	const beat = Quest.beatAt(region, world.current.name);
	if (!beat) return;
	startCutscene(beat.intro.map(text => ({ op: 'say', text })), () => startVillainBattle(region, beat));
}
export function startVillainBattle(region, beat) {
	const foe = beat.team.map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
	if (!foe.length || !S.party || !leadMon(S.party)) { completeVillainBeat(region, beat); return; }
	for (const m of foe) Dex.markSeen(m.speciesId);
	const info = { displayName: beat.boss, defeatText: '', money: Math.max(...foe.map(m => m.level)) * 12, boss: true };
	battle.endSpec = { kind: 'villain', region };
	battle.startTrainer(S.party, foe, info, result => {
		if (result === 'victory') { completeVillainBeat(region, beat); }
		else if (result === 'defeat') whiteOut();
		else { healParty(S.party); saveParty(S.party); }   // fled/forced out: not a blackout
	});
}

// ---------- recurring cross-region rival ----------
// Your home-region rival is climbing all three regions too (rivals.js); they intercept you
// once per tier at that tier's gym town, in whichever region you reach first. On-arrive,
// one-shot per tier (flag set win or lose so it never walls you). Threads the region-hopping.
export function checkRivalTrigger() {
	if (!S.party || !leadMon(S.party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	const tier = rivalDue(world.current.map.id);
	if (tier == null) return;
	startRivalEncounter(tier);
}
export function startRivalEncounter(tier) {
	const name = localStorage.getItem('magepunk_rival') || 'RIVAL';
	const you = localStorage.getItem('magepunk_name') || 'PLAYER';
	const foe = (RIVAL_TIERS[tier] || []).map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
	if (!foe.length) { Story.setFlag(rivalFlag(tier)); return; }
	for (const m of foe) Dex.markSeen(m.speciesId);
	const intro = [
		`${name} is here!`,
		`${name}: ${you}! Small world — or should I say small WORLDS?`,
		`${name}: We're both chasing every GYM in all three regions. Let's see who's really ahead — battle me!`,
	];
	startCutscene(intro.map(text => ({ op: 'say', text })), () => {
		const info = { displayName: `RIVAL ${name}`, defeatText: '', money: (tier + 1) * 40, boss: true };
		battle.endSpec = { kind: 'rivaltier', tier };
		battle.startTrainer(S.party, foe, info, result => {
			Story.setFlag(rivalFlag(tier)); // one-shot per tier, win or lose
			saveParty(S.party);
			if (result === 'victory') startCutscene([{ op: 'say', text: `${name}: Tch — you got me. But I'll take the next region first. See you out there!` }]);
			else { healParty(S.party); startCutscene([{ op: 'say', text: `${name}: Ha! Told you I was ahead. Go train and catch up!` }]); }
		});
	});
}
export function completeVillainBeat(region, beat) {
	Story.setFlag(beat.doneFlag);
	saveParty(S.party);
	refreshObjective();
	syncOverworldAchievements(); // a villain arc just closed — surface it on the profile
	// the beat is done -> isDungeonFloor now false -> despawn the grunts on this map
	trainers.loadForMap().then(() => { npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev)); }).catch(() => {});
	startCutscene(beat.outro.map(text => ({ op: 'say', text })));
}


// open the on-screen starter picker locked to one region's trio
export function openStarterPick(region) {
	const idx = Math.max(0, STARTERS.findIndex(r => r.region === region));
	starterMenu.phase = 'pick';
	starterMenu.region = region;
	starterMenu.row = idx;
	starterMenu.col = 0;
	starterMenu.open = true;
	for (const id of STARTERS[idx].ids) {
		if (starterMenu.sprites[id]) continue;
		const sp = battle.data.species[id];
		if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => { starterMenu.sprites[id] = img; }).catch(() => {});
	}
}

// the player chose starter `col` of `region`: create it, seed the Dex, then run
// the rival challenge → rival battle → Pokedex handoff.
export function finishStarterPick(region, col) {
	const idx = Math.max(0, STARTERS.findIndex(r => r.region === region));
	const id = STARTERS[idx].ids[col];
	safeSaveStr('magepunk_starter', id); // Kanto's champion roster is chosen by it
	S.party = createStarter(id, battle.data);
	Journal.add(`Began the adventure in ${region} with ${(S.party[0]?.name || id).toUpperCase()}`);
	Dex.markCaught(id);
	Dex.seedFrom(S.party);
	refreshFollower();
	const cfg = NEW_GAME_INTRO[region];
	const name = (S.party[0].nickname || S.party[0].name || id).toUpperCase();
	if (!cfg) { Story.setFlag('intro_done'); Story.setFlag('FLAG_GOT_FIRST_POKEMON'); dialog.open(`You chose ${name}!`); return; }
	dialog.open(`${cfg.prof}: So, you want ${name}?\nA fine choice — take good care of it!`, () => rivalScene(region, col));
}

function rivalScene(region, playerCol) {
	const cfg = NEW_GAME_INTRO[region];
	const idx = Math.max(0, STARTERS.findIndex(r => r.region === region));
	const rivalCol = (playerCol + 1) % 3;         // the starter with the type edge on yours
	const rivalId = STARTERS[idx].ids[rivalCol];
	const rivalName = localStorage.getItem('magepunk_rival') || cfg.rival;
	startCutscene([
		{ op: 'say', text: `${rivalName}: Then I'll take this one!` },
		{ op: 'say', text: `${rivalName}: My POKeMON beats yours. Let's settle it — right here, right now!` },
	], () => startRivalBattle(region, rivalId, rivalName));
}

function startRivalBattle(region, rivalId, rivalName) {
	const foe = [battleBuildMon(rivalId, 5, battle.data)].filter(Boolean);
	if (!foe.length || !S.party || !leadMon(S.party)) { afterRival(region); return; }
	Dex.markSeen(rivalId);
	const info = { displayName: `RIVAL ${rivalName}`, defeatText: '', money: 40, boss: true };
	battle.endSpec = { kind: 'rivalintro', region };
	battle.startTrainer(S.party, foe, info, result => {
		if (result !== 'victory') healParty(S.party);   // the plot continues win or lose
		saveParty(S.party);
		afterRival(region);
	});
}

export function afterRival(region) {
	const cfg = NEW_GAME_INTRO[region];
	Story.setFlag('intro_done');
	Story.setFlag('FLAG_GOT_FIRST_POKEMON');
	Story.setFlag('FLAG_SYS_POKEDEX_GET');
	refreshObjective(); // intro over — the gym-1 objective is now live
	const prof = cfg ? cfg.prof : 'PROF. OAK';
	const sendoff = cfg ? cfg.sendoff : 'Your adventure begins now!';
	startCutscene([
		{ op: 'say', text: `${prof}: Wait — take this with you.\nIt's the POKeDEX! It records every POKeMON you meet.` },
		{ op: 'hud', text: 'Received the POKeDEX!' },
		{ op: 'say', text: sendoff },
		// the tri-region premise — why the journey spans all three regions, and the portal + rival
		{ op: 'say', text: `${prof}: One thing you should know: the GYMS of KANTO, JOHTO, and HOENN are linked now.` },
		{ op: 'say', text: `${prof}: You must earn each tier's BADGE SHARD in ALL THREE regions — in any order you like — before the next GYM will admit you anywhere.` },
		{ op: 'say', text: `${prof}: A PORTAL by every GYM town's POKeMON CENTER carries you between the regions — and you won't be climbing alone. Off you go!` },
	]);
}

// kept for the debug hook / older callers: nudge a partyless save into the intro
export function maybeIntroCutscene() {
	if (Story.getFlag('intro_done') || S.party) return;
	startIntroNarration(playerRegion());
}

