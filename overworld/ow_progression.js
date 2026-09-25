// ow_progression.js — progression: the sealed champions, badges + the Elite Four gate + the champion crown, cross-region tier rewards, the Grand Champion finale, the level curve and the level cap.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Story from './events.js';
import { Journal } from './journal.js';
import { battle, cutscene, dialog, evolution, hud, trainers, world } from './ow_core.js';
import { whiteOut } from './ow_places.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { startCutscene } from './ow_scaling.js';
import { S } from './ow_state.js';
import { runScriptLabel, syncStoryVars } from './ow_story.js';
import { healParty, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { mapWeatherNow } from './ow_follower.js';
import {
	moveToMap, refreshObjective, scriptIsDisplayOnly,
} from './main.js';

// ---------- the sealed champions ----------
// BLUE and WALLACE both ship with `script: "0x0"`, so Trainers.claims() never
// spawned them. Their battle lived only in an onFrame scene gated on VAR_TEMP_1
// — and checkOnFrame skips a value-0 entry whose var was never SET, while the
// only scripts that set VAR_TEMP_1 are the champion's own EnterRoom and the Hall
// of Fame. Chicken-and-egg: two of three regions could never be completed, which
// sealed the ENTIRE post-game (Battle Frontier, 9 legendaries, 4 ferry islands,
// the Grand Champion finale). Johto only worked because Lance's object carries a
// real script.
//
// Seeding VAR_TEMP_1 was the wrong lever: it is a decomp SCRATCH var, and arming
// it globally would wake unrelated scenes — most of Hoenn's dormant onFrame set
// is Battle Frontier state machinery that must stay inert. So instead we hand
// each object the roster script that already exists for it, which routes the
// fight through the ordinary trainer pipeline exactly like Lance.
const KANTO_STARTERS = ['bulbasaur', 'charmander', 'squirtle'];
// Kanto's champion is your rival, and his team is built to counter YOUR starter,
// so the roster comes in three variants. Saves made before the starter was
// recorded fall back to whichever Kanto starter the dex says you caught.
function kantoChampionScript() {
	const saved = localStorage.getItem('magepunk_starter');
	const id = KANTO_STARTERS.includes(saved) ? saved
		: KANTO_STARTERS.find(s => Dex.isCaught(s)) || KANTO_STARTERS[0];
	return 'PokemonLeague_ChampionsRoom_EventScript_Battle' + id[0].toUpperCase() + id.slice(1);
}
const SEALED_TRAINERS = {
	MAP_POKEMON_LEAGUE_CHAMPIONS_ROOM: { OBJ_EVENT_GFX_BLUE: kantoChampionScript },
	MAP_EVER_GRANDE_CITY_CHAMPIONS_ROOM: {
		OBJ_EVENT_GFX_WALLACE: () => 'EverGrandeCity_ChampionsRoom_EventScript_Wallace',
	},
};
trainers.repairScript = (ev, mapId) => {
	if (!ev || (ev.script && ev.script !== '0x0')) return; // never overwrite a real script
	const pick = SEALED_TRAINERS[mapId]?.[ev.graphics_id];
	if (pick) ev.script = pick();
};

export function startTrainerBattle(t, foeParty, info) {
	for (const m of foeParty) Dex.markSeen(m.speciesId);
	if (!info.weather) info.weather = mapWeatherNow();   // the route's own sky
	battle.endSpec = { kind: 'trainer', script: t?.ev?.script || null, money: info.money || 0 };
	battle.startTrainer(S.party, foeParty, info, result => {
		if (result === 'victory') {
			trainers.markDefeated(t);
			// the prize is paid by battle.awardPrize(), at the moment it is announced —
			// this used to be the ONLY path that paid, which is why scripted trainers,
			// villains and rivals all showed a prize and credited nothing
			saveParty(S.party);
			onTrainerDefeated(t.ev.script); // gym badge / champion crown (before evo so the badge dialog shows)
			evolution.check(S.party, battle.data);
			runPostBattleScript(t.ev.script, t);   // the beat Crystal keeps in <script>.Script
		} else if (result === 'defeat') {
			whiteOut();
		}
	});
}

// ---------- progression: badges, the Elite Four gate, the champion crown ----------
// HMs and the League gate by the player's chosen region; a badge is awarded for
// the region the beaten Gym Leader belongs to (from the battle-script name).
export function playerRegion() { return Badges.regionKey(localStorage.getItem('magepunk_region')); }

// a JOHTO save beating a crystal-Kanto (JohKanto) gym fills the post-game JOHKANTO
// badge slice (toward a 16-badge total + RED), NOT the standalone-Kanto game's badges
// JohKanto's gyms ARE Crystal's Kanto gyms, so their scripts map to KANTO badges
// in GYM_SCRIPT. Which slice a win actually counts for is decided by the MAP.
//
// This used to also require `playerRegion() === 'JOHTO'` — which records where you
// STARTED, not where you are. A Kanto or Hoenn starter who walked into JohKanto
// re-earned Kanto badges they already had, and `count('JOHKANTO')` stayed 0
// forever. That is not cosmetic: the postgame level cap above 100 is keyed on
// JohKanto's badge count, so for two starters in three the ladder to 255 could
// never begin. The map id is unambiguous on its own.
export function badgeSliceFor(region) {
	if (region === 'KANTO' && /^MAP_JOHKANTO/.test(world.current?.map?.id || '')) return 'JOHKANTO';
	return region;
}

// If `script` is an Elite Four/Champion battle and the player is short of that
// region's 8 badges, returns the block message; otherwise null (battle proceeds).
export function leagueGateMessage(script) {
	const info = Badges.scriptInfo(script);
	if (!info || (info.kind !== 'elite' && info.kind !== 'champion')) return null;
	const need = Badges.badgesUntilLeague(info.region);
	if (need <= 0) return null;
	return `The POKeMON LEAGUE is only open to trainers who\nhave earned all 8 badges.\n\nYou still need ${need} more.`;
}

// ---------- cross-region tier rewards ----------
// Clearing gym N in the LAST of the three regions advances the shared tier (globalTier);
// that milestone grants a scaling reward, once per tier. Items are all real bag.js ids.
export const TIER_REWARDS = {
	// the AMULET COIN lands at tier 1 on purpose: it doubles prize money, so it
	// has to arrive early to be worth anything. price: 0 means "not for sale"
	// here (same as the Master Ball and Lucky Egg), so a reward is its only route.
	1: { money: 1500, items: [['greatball', 5], ['amuletcoin', 1]], label: '$1500 + 5 GREAT BALLS + an AMULET COIN' },
	2: { money: 2000, items: [['hyperpotion', 5]], label: '$2000 + 5 HYPER POTIONS' },
	3: { money: 2500, items: [['rarecandy', 1]], label: '$2500 + a RARE CANDY' },
	4: { money: 3000, items: [['ultraball', 5]], label: '$3000 + 5 ULTRA BALLS' },
	5: { money: 3500, items: [['leftovers', 1]], label: '$3500 + LEFTOVERS' },
	6: { money: 4500, items: [['focussash', 1]], label: '$4500 + a FOCUS SASH' },
	7: { money: 6000, items: [['lifeorb', 1]], label: '$6000 + a LIFE ORB' },
	8: { money: 10000, items: [['rarecandy', 2], ['maxrevive', 3]], label: '$10000 + 2 RARE CANDIES + 3 MAX REVIVES' },
};
// grant the reward for a just-completed tier (once). Returns the reward label, or null.
export function grantTierReward(tier) {
	if (Story.getFlag('tier_reward_' + tier)) return null;
	Story.setFlag('tier_reward_' + tier);
	const r = TIER_REWARDS[tier];
	if (!r) return null;
	if (r.money) Bag.earn(r.money);
	for (const [id, n] of (r.items || [])) Bag.addItem(id, n);
	syncOverworldAchievements(); // the tier milestone feeds the profile achievements
	return r.label;
}
export function showTierRewardDialog(tier) {
	const lbl = grantTierReward(tier);
	// clearing a tier everywhere is exactly what lifts the level cap, so say so
	// here rather than letting the player discover it mid-battle
	const cap = refreshLevelCap();
	const capLine = `\n\nLEVEL CAP raised to Lv${cap}!`;
	if (lbl) dialog.open(`TIER ${tier} COMPLETE!\n\nEvery region has cleared its GYM ${tier} — the circuit opens up!\n\nReward: ${lbl}${capLine}`);
	else dialog.open(`TIER ${tier} COMPLETE!\n\nEvery region has cleared its GYM ${tier}.${capLine}`);
}

// ---------- Grand Champion finale ----------
// Becoming CHAMPION of all three shared regions is the top of the whole spine. Grant the
// capstone (once) and, when it happens live, play a finale cutscene.
export function grantGrandChampionReward() {
	if (Story.getFlag('grand_champion')) return false;
	Story.setFlag('grand_champion');
	Bag.earn(50000);
	Bag.addItem('rarecandy', 3);
	Bag.addItem('maxrevive', 3);
	Bag.addItem('goldtrophy', 1); Bag.registerName('goldtrophy', 'GOLD TROPHY');
	syncOverworldAchievements(); // surfaces the Grand Champion achievement on the profile
	return true;
}
export function grandChampionFinale(cb) {
	if (!grantGrandChampionReward()) { cb && cb(); return; } // already crowned — just continue
	const you = localStorage.getItem('magepunk_name') || 'You';
	startCutscene([
		{ op: 'say', text: '. . . . . . . . .' },
		{ op: 'say', text: 'CHAMPION of KANTO. CHAMPION of JOHTO. CHAMPION of HOENN.' },
		{ op: 'say', text: 'No trainer has ever held all three crowns at once — until now.' },
		{ op: 'say', text: `You are hereby named the GRAND CHAMPION of all three regions, ${you}!` },
		{ op: 'say', text: 'Received the GOLD TROPHY, 3 RARE CANDIES,\n3 MAX REVIVES, and $50000!' },
	], cb);
}

// ---------- level-curve tune (interleave) ----------
// Vanilla gym-leader levels differ a lot at the same badge index (e.g. tier-7 Blaine L47 vs
// Pryce L31). Under the cross-region interleave you face all three same-tier gyms at one
// party level, so the laggards play as trivial pushovers. Raise each shared-region gym
// leader's team to a per-tier FLOOR (shift the whole team up; never lowers) so same-tier
// gyms are comparable. Applied once to the loaded roster data → every build path sees it.
// JohKanto (the Gen-2 Kanto dupes) is excluded.
// index = tier (the (tier+1)th gym). Lives in badges.js because the level cap is
// read off the same numbers — see Badges.levelCap.
export const TIER_LEVEL_FLOOR = Badges.TIER_LEVEL_FLOOR;

// ---------- level cap ----------
// Capped at the tier you have cleared in EVERY region at once, so you cannot
// out-level the world by racing one region ahead. Recomputed rather than stored:
// it is a pure function of the badges you hold.
export function levelCapNow() { return Badges.levelCap(Quest.globalTier()); }
// keep the battle engine's clamp in step with the badges (boot + every badge)
export function refreshLevelCap() { battle.levelCap = levelCapNow(); return battle.levelCap; }
// which regions are holding the cap down, phrased for a dialog
export function levelCapHint() {
	const tier = Quest.globalTier();
	if (tier >= 8) return 'Every gym in all three regions is behind you — the cap is off.';
	const behind = Quest.laggingRegions().map(r => r[0] + r.slice(1).toLowerCase());
	const nth = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][tier];
	return `Beat the ${nth} gym in ${behind.join(' and ')} to raise it to Lv${Badges.nextLevelCap(tier)}.`;
}
export function applyGymLevelFloors() {
	const rosters = trainers.data && trainers.data.rosters;
	if (!rosters) return;
	for (const region of Quest.SHARED) {
		Quest.GYMS[region].forEach((g, tier) => {
			const floor = TIER_LEVEL_FLOOR[tier] || 0;
			const leader = g.leader.toUpperCase().replace(/\s+/g, ' ').trim();
			for (const key of Object.keys(rosters)) {
				const v = rosters[key];
				if (!v || !v.party || !v.party.length || !/Gym Leader/i.test(v.class || '')) continue;
				if (/johkanto/i.test(key)) continue; // exclude the Gen-2 Kanto leader dupes
				if ((v.name || '').toUpperCase().replace(/\s+/g, ' ').trim() !== leader) continue;
				const bump = floor - Math.max(...v.party.map(p => p.l | 0));
				if (bump > 0) for (const p of v.party) p.l = (p.l | 0) + bump;
			}
		});
	}
}

// Called on any trainer victory. Gym Leaders award their badge; the Champion
// crowns you and rolls the Hall of Fame. Ordinary trainers do nothing here.
// A TRAINER'S POST-BATTLE BEAT LIVES IN A SEPARATE LABEL, AND NOTHING RAN IT.
//
// Crystal keeps what happens after you win in `<script>.Script`, alongside the
// trainer's own label. This port's plain battle path (startTrainerBattle, and
// the resume handler) only ever marked the trainer defeated — so every one of
// those beats was dead. Reported as "the last Slowpoke Well grunt's post-battle
// script never runs": beating him ends the battle and nothing else happens, so
// EVENT_CLEARED_SLOWPOKE_WELL is never set, Kurt never gives the Lure Ball, and
// Johto stops at Azalea. There is not even a `TrainerGruntM1` engage label for
// that grunt — only `TrainerGruntM1.Script` — which is why nothing reached it.
//
// 322 trainers carry a .Script; 35 do more than print text and 29 of those carry
// a story beat. Mostly the Johto phone-number registrations (Joey, Wade, Ralph
// and friends asking for your number), plus the Slowpoke Well, Sage Koji, and
// one item gift on Route 34.
//
// Display-only .Scripts are skipped: the defeat line is already shown from
// info.defeatText, and running them would just repeat it. Same classifier the
// sign_texts shadowing fix uses — a script earns the A press by doing something.
// DONE vs ATTEMPTS. Shipped as a plain "attempted" set, which burned a beat the
// moment anything interrupted it: a tester opened the TOWN MAP mid-scene, the
// watchdog stopped the cutscene 30s later, and the Slowpoke Well beat was marked
// forever with EVENT_CLEARED_SLOWPOKE_WELL still unset — the save had no path
// left to Bugsy. Marking on attempt bought loop-safety at the price of a
// permanent softlock, which is the wrong trade.
//
// So: `done` is written when the beat actually COMPLETES, and `tries` is the
// loop guard. A scene that dies partway is retried on the next map entry, and a
// beat that genuinely cannot run gives up after MAX_POSTBATTLE_TRIES.
const POSTBATTLE_KEY = 'magepunk_postbattle_v1';
const MAX_POSTBATTLE_TRIES = 3;
function postBattleStore() {
	try {
		const raw = JSON.parse(localStorage.getItem(POSTBATTLE_KEY) || '{}');
		// migrate the shipped array form: those keys were "attempted", and the ones
		// whose beat never landed deserve their retries back
		if (Array.isArray(raw)) return { done: [], tries: Object.fromEntries(raw.map(k => [k, 1])) };
		return { done: Array.isArray(raw.done) ? raw.done : [], tries: raw.tries && typeof raw.tries === 'object' ? raw.tries : {} };
	} catch (e) { return { done: [], tries: {} }; }
}
function postBattleSave(st) { safeSaveStr(POSTBATTLE_KEY, JSON.stringify(st)); }
function postBattleDone() { return new Set(postBattleStore().done); }
function markPostBattleTry(key) {
	if (!key) return 0;
	const st = postBattleStore();
	st.tries[key] = (st.tries[key] || 0) + 1;
	postBattleSave(st);
	return st.tries[key];
}
function markPostBattleDone(key) {
	if (!key) return;
	const st = postBattleStore();
	if (!st.done.includes(key)) st.done.push(key);
	postBattleSave(st);
}

export function runPostBattleScript(script, t, keyOverride) {
	if (!script || cutscene.blocking) return false;
	const label = script + '.Script';
	const ops = S.mapScripts[label];
	if (!Array.isArray(ops) || scriptIsDisplayOnly(ops)) return false;
	const key = keyOverride || (t ? trainers.keyOf(t) : script);
	markPostBattleTry(key);                 // the loop guard, not the completion mark
	const ran = runScriptLabel(label, t || null);
	// Completion is what counts. cutscene.run's onDone fires only when the scene
	// reaches its end — a scene that is stopped partway never calls it, so the beat
	// stays un-done and the next map entry picks it up again.
	if (ran) postBattlePending = key;
	return ran;
}
// set while a post-battle beat is on screen; cleared by the cutscene finishing
let postBattlePending = null;
// ARMED ON MAP ENTRY, FIRED WHEN IDLE. The catch-up used to run once, at the
// instant of map entry, and give up if anything else was on screen — an
// onTransition/onFrame scene, a slow load. It also was not on the boot path at
// all, so the first entry after a page load never ran it (reported: "it ran on
// the second entry"). Now map entry just arms it, and the tick fires it the
// first frame nothing else owns the screen.
S.postBattleCatchUpArmed = false;

// ONE-TIME REPAIRS for saves written while a bug was live. Each entry is a
// condition that proves the story already moved past a beat, and the flags that
// beat should have left behind. Applied at boot; idempotent, so no marker needed.
const SAVE_REPAIRS = [
	// hideobj persisted only EVENT_* flags until 2026-09-23, so Wally and his
	// uncle reappeared outside the Mauville gym after being beaten — Wally on the
	// only tile south of the door. The beat's own hides are the missing flags.
	{ when: 'FLAG_DEFEATED_WALLY_MAUVILLE', set: ['FLAG_HIDE_MAUVILLE_CITY_WALLY', 'FLAG_HIDE_MAUVILLE_CITY_WALLYS_UNCLE'] },
];
export function repairSaves() {
	for (const r of SAVE_REPAIRS) {
		if (!Story.getFlag(r.when)) continue;
		for (const f of r.set) if (!Story.getFlag(f)) { Story.setFlag(f); console.warn('[save-repair]', r.when, '->', f); }
	}
}
// The watchdog stopping a beat is the ENVIRONMENT failing, not the beat — on a
// slow device it used to happen every run. Charging that as a try would still
// burn the beat after three reloads, so a watchdog kill hands the try back.
export function refundPostBattleTry() {
	if (!postBattlePending) return;
	const st = postBattleStore();
	if (st.tries[postBattlePending] > 0) st.tries[postBattlePending]--;
	postBattleSave(st);
	postBattlePending = null;
}
export function notePostBattleFinished() {
	if (postBattlePending) { markPostBattleDone(postBattlePending); postBattlePending = null; }
}

// RECOVERY, for saves that won the battle before any of this existed.
//
// The reporter's save has all four Slowpoke Well grunts beaten and the beat
// unrun, and a beaten trainer cannot be talked to again — trainers.js drops them
// from collision so they can't wall a corridor, so you walk straight over the
// tile. Without this they would be stuck at Azalea for good.
//
// Keyed on an explicit "this beat has been attempted" marker rather than
// inferring from the script's own flags. Inference looked tempting and is wrong:
// most of these scripts are the Johto phone registrations, whose setflag sits
// inside a branch you can decline — so "its flag is unset" is a permanent state
// for a script that DID run, and the catch-up would re-fire on every single map
// entry forever.
// Every trainer on this map, INCLUDING the hidden ones, keyed exactly as
// trainers.keyOf keyed them when they were beaten.
//
// The catch-up used to walk trainers.list — which drops any trainer whose object
// flag hides it. A post-battle beat typically hides its own grunts first thing
// (the Slowpoke Well beat's opening hideobjs set EVENT_SLOWPOKE_WELL_ROCKETS), so
// a beat cut short after that point could never be caught up again: the trainer
// it belongs to had vanished from the only list the catch-up looked at. Keys are
// recomputed over the whole map because the duplicate-sprite suffix ("@5,2")
// depends on how many trainers share a sprite — which changes once some are
// hidden, and would otherwise stop matching the defeated key already saved.
function allTrainersOnMap() {
	const map = world.current?.map;
	if (!map) return [];
	const evs = (map.object_events || []).filter(ev => trainers.claims(ev));
	const n = new Map();
	for (const ev of evs) { const b = trainers.baseKeyOf({ ev }); n.set(b, (n.get(b) || 0) + 1); }
	return evs.map(ev => {
		const b = trainers.baseKeyOf({ ev });
		const key = n.get(b) > 1 ? `${map.id}:${b}@${ev.x},${ev.y}` : `${map.id}:${b}`;
		return { t: trainers.list.find(x => x.ev === ev) || { ev, tx: +ev.x, ty: +ev.y }, key };
	});
}

export function catchUpPostBattleScripts() {
	if (cutscene.blocking || dialog.blocking || battle.blocking) return;
	const st = postBattleStore();
	const done = new Set(st.done);
	for (const { t, key } of allTrainersOnMap()) {
		const script = t.ev && t.ev.script;
		if (!script || !trainers.defeated.has(key)) continue;
		if (done.has(key)) continue;
		if ((st.tries[key] || 0) >= MAX_POSTBATTLE_TRIES) continue;   // give up, don't loop
		const ops = S.mapScripts[script + '.Script'];
		if (!Array.isArray(ops) || scriptIsDisplayOnly(ops)) continue;
		if (runPostBattleScript(script, t, key)) return;   // at most one per map entry
		markPostBattleTry(key);                            // unrunnable right now: burn a try
	}
}

export function onTrainerDefeated(script, opts) {
	// RED at Mt Silver. He keeps his own silence rather than a synthetic toast, but
	// he is JOHKANTO's CHAMPION and no longer returns early — the league path below
	// is what calls Badges.crown(), and the level cap's last step to 255 is gated on
	// exactly that crown. Returning here left the ladder stuck at 240 forever.
	if (script === 'Red') {
		const fresh = !Story.getFlag('beat_red');
		Story.setFlag('beat_red');
		if (fresh) {
			Journal.add('Defeated RED at the summit of MT SILVER');
			syncOverworldAchievements();
			// the CAPSTONE. The hardest fight in the game (lead+3/+5, up to Lv255)
			// used to pay a flag and silence, while the Grand Champion got $50k and
			// a trophy — the reward ladder ended before the summit it pointed at.
			Bag.earn(100000);
			Bag.addItem('rarecandy', 10);
			Bag.addItem('redscap', 1); Bag.registerName('redscap', "RED'S CAP");
		}
		if (fresh && !(opts && opts.silent)) dialog.open('. . . . . . . . .\n\nRED says nothing, and turns back to the mountain.\n\nHe leaves his CAP at your feet.\nYou have bested the strongest trainer of all.\n\n(Received $100000, 10 RARE CANDIES, and RED\'S CAP!)');
		opts = { ...(opts || {}), silent: true };   // his silence IS the speech
	}
	const info = Badges.scriptInfo(script);
	if (!info) return;
	// a scripted battle plays the leader's own authentic speech (which already
	// announces the badge), so record it silently and skip the synthetic toast
	const silent = !!(opts && opts.silent);
	if (info.kind === 'gym') {
		const slice = badgeSliceFor(info.region);
		const beforeTier = Quest.globalTier();
		const earned = Badges.earn(slice, info.id);
		if (earned) { Journal.add(`Earned the ${info.name}`); sfx('fanfare_badge'); }
		// did this badge push the SHARED tier up (i.e. was this the last region to clear it)?
		const tierUp = (earned && Quest.globalTier() > beforeTier) ? Quest.globalTier() : 0;
		refreshLevelCap(); // the cap is a function of the badges; keep the engine in step
		syncStoryVars();   // ...and so is VAR_BADGES, which the Victory Road gate reads
		if (earned && !silent) {
			const n = Badges.count(slice);
			dialog.open(slice === 'JOHKANTO'
				? `You earned the ${info.name}!\n\nKANTO badges: ${n}/8`
					+ (n >= 8 ? '\n\nAll 16 badges! They say the strongest\ntrainer waits atop MT SILVER...' : '')
				: `You earned the ${info.name}!\n\nBadges: ${n}/8`
					+ (n >= 8 ? '\n\nWith all 8 badges, the POKeMON LEAGUE\nnow awaits beyond Victory Road!' : ''),
				tierUp ? () => showTierRewardDialog(tierUp) : undefined); // chain the tier reward after the badge toast
		} else if (tierUp) {
			// scripted (silent) win: grant quietly with a HUD line
			const lbl = grantTierReward(tierUp);
			if (lbl) hud.textContent = `TIER ${tierUp} cleared in every region!  ${lbl}`;
		}
	} else if (info.kind === 'champion') {
		const fresh = Badges.crown(info.region);
		if (fresh) Journal.add(`Became the ${info.region} Champion!`);
		// becoming JOHTO Champion opens the legendary-bird tower hunt (the HO-OH/LUGIA
		// wings) and restores the power that lets the MAGNET TRAIN run to KANTO
		if (info.region === 'JOHTO') {
			Story.setFlag('EVENT_RESTORED_POWER_TO_KANTO');
			if (fresh) {
				Bag.addItem('rainbowwing'); Bag.registerName('rainbowwing', 'RAINBOW WING');
				Bag.addItem('silverwing'); Bag.registerName('silverwing', 'SILVER WING');
			}
		}
		// record the team, heal, and warp home — otherwise the player is stranded in the
		// Champion's Room (the decomp room-warp + credits roll was never ported). This is
		// what makes the post-game reachable at all.
		const finish = () => {
			if (fresh) recordHallOfFame(info.region, S.party);
			healParty(S.party); saveParty(S.party);
			const home = Quest.START[info.region];
			const goHome = () => { if (home) moveToMap(home); refreshObjective(); syncOverworldAchievements(); };
			// the third League just fell -> the GRAND CHAMPION finale, then warp home
			if (Quest.SHARED.every(r => Badges.isChampion(r))) grandChampionFinale(goHome);
			else goHome();
		};
		if (!silent) {
			const region = info.region.charAt(0) + info.region.slice(1).toLowerCase();
			dialog.open(`You defeated the CHAMPION!\n\n. . .\n\nYou and your POKeMON are the new\n${region} CHAMPION!`,
				() => dialog.open('*  HALL OF FAME  *\n\nYour team is recorded for all time.'
					+ (fresh ? '' : '\n\n(You have cleared this League before.)'), finish));
		} else finish();
		return; // finish() calls refreshObjective when the Hall of Fame closes
	}
	refreshObjective(); // the quest stage just advanced
	syncOverworldAchievements(); // a gym badge (and maybe a full 8/16-badge circuit) may have unlocked
}

// snapshot the winning team into the Hall of Fame log (magepunk_hof)
function recordHallOfFame(region, roster) {
	try {
		const hof = safeLoad('magepunk_hof', []);
		const team = (roster || []).filter(Boolean).map(m => ({ species: m.speciesId, name: m.name, level: m.level }));
		hof.push({ region, date: Date.now(), team });
		safeSave('magepunk_hof', hof.slice(-20)); // keep the last 20 clears
	} catch { }
}
