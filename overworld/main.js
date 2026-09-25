// main.js — game loop, input, camera, warps, connection crossing.
import { World, Player, VIEW_W, VIEW_H, setViewSize, META } from './engine.js';
import { applySailFix } from './sail_fix.js';
import * as GymPuzzles from './gym_puzzles.js';
// the shared singletons (see ow_core.js)
import {
	screen, sctx, hud, world, player, npcs, encounters, battle, trainers, dialog, services,
	arcade, blockers, portals, evolution, items, pvp, factorySpec, cutscene,
} from './ow_core.js';
// the shared mutable state (see ow_state.js)
import { S } from './ow_state.js';
// ow_battleresume.js: ow_battleresume.js — leave-and-resume for battles: the periodic battle snapshot, and rebuilding the right battle ending from it after a reload.
import {
	persistBattle, resumeSavedBattle,
} from './ow_battleresume.js';
// ow_menustate.js: the menus' state objects, the service-map tables + MOM, and the water animation
import {
	MOM_SCRIPTS, OPTION_ACTIONS, OPTION_KEYS, THINGS_TO_DO, cardsMenu, deckSelect, dexMenu,
	drawWaterAnim, momTalk, optionsMenu, partyMenu, playerMenu, questMenu, runMenu, startMenu,
	todoRows, townMap, trade, trainerCard,
} from './ow_menustate.js';
// ow_music.js: background music, plus the DAY CARE / NAME RATER / move deleter / party-picker / town-map / options menus
import {
	battleThemeKey, bgmGame, daycareMenu, halfParty, moveShop, musicMap, nameRater, openDaycare,
	openMoveShop, openNameRater, openTownMap, optionsKey, syncMapBgm, tradeMenu,
} from './ow_music.js';
// ow_follower.js: ow_follower.js — the follower (your lead POKeMON walks behind you, HG/SS style) and ambient weather.
import {
	checkLegendaryTrigger, dexMilestoneCheck, drawFollower, followCache, followMini, followSheet,
	follower, legendariesHere, legendaryHere, mapWeatherNow, refreshFollower, setFollowerSpecies,
	startLegendaryBattle,
} from './ow_follower.js';
// ow_gamecorner.js: ow_gamecorner.js — the Johto GAME CORNER: Voltorb Flip, coins and the prize counter.
import {
	buildMonForGift, gcKey, gcMenu, vfKey, vfMenu,
} from './ow_gamecorner.js';
// ow_progression.js: ow_progression.js — progression: the sealed champions, badges + the Elite Four gate + the champion crown, cross-region tier rewards, the Grand Champion finale, the level curve and the level cap.
import {
	TIER_LEVEL_FLOOR, TIER_REWARDS, applyGymLevelFloors, badgeSliceFor, catchUpPostBattleScripts,
	grandChampionFinale, grantGrandChampionReward, grantTierReward, leagueGateMessage, levelCapHint,
	levelCapNow, onTrainerDefeated, playerRegion, refreshLevelCap, repairSaves, runPostBattleScript,
	showTierRewardDialog, startTrainerBattle,
} from './ow_progression.js';
// ow_places.js: ow_places.js — place-specific systems: blacking out and heal points, the SAFARI GAME, museum paintings, ruins words, fossils and New Mauville.
import {
	FOSSIL_MONS, MUSEUM_PAINTINGS, checkSafariGate, drawMuseum, endSafari, fossilManiacTalk,
	fossilPick, fossilUnderpassTalk, generatorTalk, healPoint, miscEvents, museumBackfill,
	museumCuratorTalk, museumPaintTalk, noteHealPoint, noteOutdoor, pickupCheck, ruinsWordTalk,
	safari, safariZoneOf, startWildBattle, whiteOut, wildBattleEnd,
} from './ow_places.js';
// ow_scaling.js: ow_scaling.js — postgame level scaling (JohKanto wilds/trainers relative to your lead) and alternate forms (form changes, form sprites).
import {
	bossLevelFor, cycleForm, formsOf, gymLevelFor, inJohKanto, johkantoLeagueKind,
	routeTrainerLevel, scaleLegendaryLevel, startCutscene, startScriptedWildBattle,
	wildEncounterLevel,
} from './ow_scaling.js';
// ow_input.js: ow_input.js — keyboard input: held-key tracking, the movement gates, the run button, and the item/repel helpers bound to input.
import {
	INPUT_TRACE, KEYMAP, POS_KEY, heldKeys, interact, owlog, repelWoreOff, savePos, setRepel,
	tickStats, typingInChat, useGadget,
} from './ow_input.js';
// ow_keybinds.js: ow_keybinds.js — remappable key bindings (load/save and the action lookup the input layer uses).
import {
	KEYBIND_KEY, KEY_ACTIONS, assignKeyBind, normKey, translateKey,
} from './ow_keybinds.js';
// ow_loop.js: ow_loop.js — the frame loop (tick: update + draw every frame, with the input and cutscene watchdogs) and the touch HUD.
import {
	initTouchHud, tick, touchHud,
} from './ow_loop.js';
// ow_screens.js: the START-menu screens and service counters (dex, friends, mail, quests, deck select, cards, run menu, in-game trades, DAY CARE, NAME RATER, move relearner)
import {
	dexAll, dexFilterLabel, dexKey, dexList, drawDeckSelect, drawNpcTrade, drawPlayerMenu,
	drawTrade, friendAction, friendsKey, friendsMenu, mailMenu, offerNickname, questKey,
	refreshFriendBadges, refreshFriends, relearnable, setNickname, startItems, startNpcTrade,
} from './ow_screens.js';
// ow_fieldmoves.js: ow_fieldmoves.js — field systems: the Mach Bike, Silph Co locked doors, the Route 113 glass workshop, Dive, and the HM field moves.
import {
	HM_FIELD, SILPH_DOORS, bikeShopTalk, diveTo, fieldMovesOf, glassBlowerTalk, openPartyAction,
	silphDoorAt, silphDoorsApply, toggleBike, useFieldMove,
} from './ow_fieldmoves.js';
// ow_legendaries.js: ow_legendaries.js — the static legendary encounters and the Hoenn legendary-awakening chain.
import {
	AWAKENING_SCENES, LEGENDARY_ENCOUNTERS, awState, checkAwakeningTrigger, drawAwakening,
	drawLegendary,
} from './ow_legendaries.js';
// ow_features.js: ow_features.js — Secret Bases, async friend trades (the escrowed mailbox), Shoal Cave tides, roaming legendaries and the Johto RADIO.
import {
	DECO_ITEMS, ROAMERS, ROAM_ROUTES, acceptTrade, baseDecoInteract, baseRoomFor, baseSpotKey,
	buenaText, claimTradeDeliveries, declineTrade, decoKey, decoMenu, drawBaseDeco, drawDecoMenu,
	drawRadio, drawSocial, enterBase, kurtTalk, luckyText, myBase, oakTalkText, openRadio,
	openTradeInbox, openTradeOffer, playerTID, radioKey, radioMenu, roamState, roamerEnd,
	roamerHere, roamersOnMapChange, saveMyBase, secretSpotInteract, sendTradeOffer, shoalDig,
	shoalFixup, shoalHermitTalk, shoalTide, shoalWarp, socialKey, socialMenu, startRoamerBattle,
	tidStr,
} from './ow_features.js';
// ow_render.js: ow_render.js — overworld rendering helpers: the map-editor view flag, camera, unlit-cave darkness, day/night tint, step ambience (grass rustle + footprints), the area-name banner and weather particles. The frame loop itself (tick) stays in main.js.
import {
	cameraPos, drawCaveDark, drawDayNightTint, drawStepFx, drawWeather, editView, mapIsUnlit,
	showAreaBanner, spawnStepFx, stepFx, weatherFx,
} from './ow_render.js';
// ow_story.js: ow_story.js — the story layer: map-script triggers and the ported decomp scripts (runScriptLabel / runSpecial), scripted battles, the Space Center multi battle, the Johto gift POKeMON, the Fork B campaign open, villain arcs and the recurring rival.
import {
	B_OUTCOME_CAUGHT, B_OUTCOME_LOST, B_OUTCOME_RAN, B_OUTCOME_WON, NEW_GAME_INTRO, PLOT_BLOCKED,
	PLOT_ONESHOT, STORY_SEED, afterRival, armStoryScenes, beginNewGame, checkCoordTrigger,
	checkIntroTrigger, checkOnFrame, checkRivalTrigger, checkVillainTrigger, completeVillainBeat,
	finishStarterPick, loadFiredPlot, markPlotFired, maybeIntroCutscene, openStarterPick,
	plotBlocked, runMapSetupScripts, runScriptLabel, runSpecial, seedCrystalEvents, seedStoryState,
	startIntroNarration, startRivalEncounter, startScriptedBattle, startVillainBattle,
	syncStoryVars,
} from './ow_story.js';
// ow_minigames.js: ow_minigames.js — Trainer Hill (the timed four-floor climb on Route 111) and the Game Corner slot machines.
import {
	HILL_FLOORS, drawSlots, hillGuardAt, hillGuardsLeft, hillPrepFloor, hillPrizeTalk,
	hillReceptionTalk, hillWarp, slotsKey, slotsMenu, startHillBattle,
} from './ow_minigames.js';
// ow_venues.js: ow_venues.js — the side venues: the Bug-Catching Contest, the Trick House, the Ruins of Alph sliding puzzles and UNOWN DEX, and Pokémon Contests (with the berry blender).
import {
	CONTEST_KEY, UNOWN_ORDER, allRuinsSolved, blendBerries, blendKey, blendMenu, bugContest,
	bugContestCatch, bugContestRoll, bugOfficerTalk, bugScore, contestKey, contestMenu,
	contestProgress, contestSpriteFor, drawBlend, drawContest, drawSlide, drawUnownDex,
	endBugContest, isBugDay, openRuinsPuzzle, openUnownDex, rollUnownLetter, slideKey, slideMenu,
	trickEndTalk, trickHouseOpenDoors, trickMasterTalk, trickScrollFind, trickState, trickWarp,
	unownDex, unownDexKey, unownIdFor,
} from './ow_venues.js';
// ow_menukeys.js: ow_menukeys.js — the menus' input layer: the key router (pressKey), menu gating (menuBlocking / canvasMenuOpen), and the key handlers for the bag, PC, shops, BP exchange, ferry, portals and starter picker.
import {
	BAG_POCKETS, FERRY_DESTS, bagEntries, bagMenu, bpShopKey, bpShopMenu, canLearn, canvasMenuOpen,
	drawBpShopMenu, ferryMenu, getBox, maybePortalTutorial, menuBlocking, openBpShop, pcMenu,
	portalMenu, pressKey, shareTrainerCard, shinyOwnedCount, shopMenu, tmMoveId, travelPortal,
} from './ow_menukeys.js';
// ow_frontier.js: ow_frontier.js — the Battle Frontier: the seven facilities, challenge runs and streaks, the Factory spectator publish, and the end-of-run flow.
import {
	FACILITY_LOBBIES, drawWatchingBadge, factorySnapshot, frontier, frontierWatchers, startFacility,
	startFrontierChallenge,
} from './ow_frontier.js';
// ow_saves.js: ow_saves.js — the overworld save: server-authoritative sync (hydrate/push/revision), achievements sync, gifts, and the OPTIONS save-data actions (export/import/backups).
import {
	OW_KEYS, claimGifts, hydrateOw, loadBackups, overworldSummary, owDirty, owFingerprint, owRev,
	owSnapshot, owSyncLog, pushOw, restoreBackup, runSaveAction, syncOverworldAchievements,
} from './ow_saves.js';
// ow_pvp.js: ow_pvp.js — live PvP battles, async (mailbox) matches, card-trade offers, and multiplayer presence & world-visiting.
import {
	checkRejoin, coLocated, drawFriendGhosts, drawMailMenu, enterAsyncMatch, enterMatch, ghosts,
	heartbeat, leaveVisit, mailAccept, mailKey, openMailbox, pendingChallengeTo, pollChallenges, pollHealth,
	pollPresence, prettyId, pvpParty, refreshMail, sendCardChallenge, sendChallenge,
	sendMailChallenge, shopStockNow, startTrade, tradeKey, visitWorld,
} from './ow_pvp.js';
// ow_menus.js: ow_menus.js — full-resolution canvas menus: party, bag, PC, dex, shops, options, town map...
import {
	anyMenuOpen, drawBagMenu, drawCardsMenu, drawDaycare, drawDexMenu, drawFerryMenu,
	drawFriendsMenu, drawHalfParty, drawMoveShop, drawNameRater, drawOptions, drawPartyMenu,
	drawPcMenu, drawPortalMenu, drawQuest, drawRunMenu, drawShopMenu, drawStartMenu,
	drawStarterMenu, drawTownMap, drawTrainerCard, drawVertical, menuChrome, menuTap, monRow,
	optionList,
} from './ow_menus.js';
import { NPCs } from './npcs.js';
import { Encounters, encounterChance } from './encounters.js';
import { Battle } from './battle.js';
import { Trainers, BOSS_CLASSES } from './trainers.js';
import { Dialog } from './dialog.js';
import { Services } from './services.js';
import { Arcade } from './arcade.js';
import { Blockers } from './blockers.js';
import { Portals, PORTAL_TOWNS } from './portals.js';
import { RIVAL_TIERS, rivalDue, rivalFlag } from './rivals.js';
import * as Bag from './bag.js';
import { getJSON } from './engine.js';
import { loadParty, saveParty, healParty, leadMon, addCaught, createStarter } from './party.js';
import { Evolution } from './evolution.js';
import { Items } from './items.js';
import * as Dex from './pokedex.js';
import * as Fly from './flydata.js';
import * as Clock from './clock.js';
import * as Daycare from './daycare.js';
import * as VFlip from './voltorbflip.js';
import { bgm, bgmNow, syncBgmVolume, sfx, cry } from './sound.js';
import { HEADBUTT_SETS, HEADBUTT_MAPS } from './headbutt_data.js';
import { POSTGAME_LEGENDS } from './legendaries_postgame.js';
import { INIT_EVENTS } from './crystal_init_events.js';
import * as Settings from './settings.js';
import * as Badges from './badges.js';
import * as Trades from './trades.js';
import * as Quest from './quest.js';
import { EXTRA_DIVE } from './divelinks.js';
import * as Story from './events.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { statsFor, buildMon as battleBuildMon } from './battle.js';
import * as Frontier from './frontier.js';
import { getImage, drawOwMon } from './engine.js';
import { loadItemIcons, itemIconFile, drawCategoryIcon } from './itemicon.js';
import * as BUI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import { Journal } from './journal.js';
import { badgeSprite, badgeGhost } from './badgeart.js';
import { Contest, CATS, RANKS } from './contest.js';
import * as Slide from './slidepuzzle.js';
import * as Slots from './slots.js';
import * as Savefile from './savefile.js';
import { OW_RESET_KEYS } from '../site/owreset.js';
import { Pvp } from './pvp.js';
import { FactorySpec } from './factoryspec.js';
import * as Chat from '../battlecards/chat.js';

// Test Realm mode: ?mp=1 with a login token. The account backend owns the
// cards; friends, presence, and world-visiting all run through it.
// the overworld requires a login — bounce to the account door without one
MP.requireLogin();
export const MP_ON = MP.hasToken();
S.mpAccount = null;   // { username, friendCode, ... } once loaded
S.friends = [];       // last friends-poll result
S.visiting = null;    // when set: { username, sprite } — roaming a friend's world
let friendGhost = null; // a friend's live sprite while we visit their map

// Integer-scale the GBA screen to DEVICE pixels. The old fixed 3x canvas was
// CSS-stretched by a fractional factor on phones (720 -> 1146 device px on an
// iPhone), so nearest-neighbour doubled some pixel columns and not others and
// the grid visibly crawled while walking. An integer device-pixel scale keeps
// every game pixel the same size; it also sizes battle/menu text to the screen.
export let SCALE = 3;
// Portrait battles: battle/pvp scenes are vector-drawn at full canvas
// resolution, so while one is blocking on a portrait screen the canvas breaks
// out of the GBA 3:2 frame and fills the viewport (tick() flips this; the
// scene lays itself out for the tall aspect via battleui.layout). Without it a
// portrait phone letterboxed the whole battle into a ~220px-tall band with
// ~20px touch targets and left 70% of the screen black.
S.sceneTall = false;
export function fitCanvas() {
	const dpr = window.devicePixelRatio || 1;
	if (S.sceneTall) {
		const bdpr = Math.min(dpr, 2); // match the battlecards DPR cap — no visible gain past 2
		const cssW = innerWidth - 4;   // room for the canvas border
		const cssH = innerHeight - 68; // topbar clearance (flex-end pins the canvas to the bottom)
		const w = Math.round(cssW * bdpr), h = Math.round(cssH * bdpr);
		if (screen.width === w && screen.height === h) return;
		screen.width = w;
		screen.height = h;
		screen.style.width = cssW + 'px';
		screen.style.height = cssH + 'px';
		sctx.imageSmoothingEnabled = false;
		return;
	}
	const touch = document.body.classList.contains('touch');
	const barRoom = touch ? 8 : 56; // desktop keeps the caption bar visible
	// Portrait screens: the GBA 3:2 window left ~70% of a tall phone black.
	// Keep the 240px logical width (15 metatiles, same integer-scale rules) and
	// open the VERTICAL view to fill the space between the topbar and the touch
	// pad, capped at 2x GBA height. body.ow-tall top-anchors the canvas so the
	// budgeted space is actually where the canvas ends up.
	const portraitWorld = innerHeight > innerWidth;
	const availH = (portraitWorld
		? innerHeight - 54 - (touch ? 206 : barRoom)
		: innerHeight - barRoom) * dpr;
	const s = Math.max(2, Math.min(6, Math.floor(Math.min(
		(innerWidth * 0.98 * dpr) / 240,
		availH / 160,
	))));
	const vh = portraitWorld ? Math.max(160, Math.min(320, Math.floor(availH / s))) : 160;
	setViewSize(240, vh);
	document.body.classList.toggle('ow-tall', portraitWorld);
	if (frame.width !== VIEW_W || frame.height !== VIEW_H) {
		frame.width = VIEW_W;
		frame.height = VIEW_H;
		ctx.imageSmoothingEnabled = false; // resizing resets context state
	}
	if (s === SCALE && screen.width === VIEW_W * s && screen.height === VIEW_H * s) return;
	SCALE = s;
	screen.width = VIEW_W * s;
	screen.height = VIEW_H * s;
	screen.style.width = (VIEW_W * s / dpr) + 'px';
	screen.style.height = (VIEW_H * s / dpr) + 'px';
	sctx.imageSmoothingEnabled = false; // resizing resets context state
}
export const frame = document.createElement('canvas'); // native view-sized (240x160 landscape)
frame.width = VIEW_W; frame.height = VIEW_H;
export const ctx = frame.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
fitCanvas();
let fitT = null; // rotations/keyboard fire resize in bursts — settle first
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitCanvas, 120); });

const objectiveEl = document.getElementById('objective');
// keep the persistent on-screen objective in sync with the quest stage
export function refreshObjective() {
	if (!objectiveEl) return;
	// Once the HOME region is done, the POSTGAME arc takes the line. Every
	// objective surface used to key off the starting region forever, so the
	// entire postgame was silent: standing on Mt Silver, a Kanto starter read
	// "MEWTWO stirs in CERULEAN CAVE" and the 16-badge climb, RED and the
	// legendary hunt got no guidance at all.
	const pg = Quest.stage(playerRegion()) === Quest.DONE ? postgameObjective() : null;
	objectiveEl.textContent = S.party ? ('NEXT: ' + (pg || Quest.objective(playerRegion()))) : '';
}

// ---------- the postgame arc, as guidance ----------
// The content exists (JohKanto's 8 gyms, the Mt Silver league, 87+ placed
// legendaries); this is the layer that TELLS the player so. Lives here rather
// than quest.js because it reads the legendary registry, which is main's.
const JOHKANTO_GYMS = [
	['BROCK', 'PEWTER CITY'], ['MISTY', 'CERULEAN CITY'], ['LT. SURGE', 'VERMILION CITY'],
	['ERIKA', 'CELADON CITY'], ['JANINE', 'FUCHSIA CITY'], ['SABRINA', 'SAFFRON CITY'],
	['BLAINE', 'CINNABAR ISLAND'], ['BLUE', 'VIRIDIAN CITY'],
];
export function legendStats() {
	const species = [...new Set(Object.values(LEGENDARY_ENCOUNTERS).map(e => e.species))];
	return { caught: species.filter(s => Dex.isCaught(s)).length, total: species.length };
}
// one uncaught legend's lair, as a rumor — the hunt had NO structure: no
// counter, no hints, just blind flood-crawling three regions' dungeons
function legendRumor() {
	const entry = Object.entries(LEGENDARY_ENCOUNTERS).find(([, e]) => !Dex.isCaught(e.species));
	if (!entry) return null;
	const pretty = entry[0].replace(/^MAP_(JOHKANTO_)?/, '').replace(/_/g, ' ');
	return `Rumor places ${(battle.data?.species?.[entry[1].species]?.name || entry[1].species).toUpperCase()} in ${pretty}.`;
}
export function postgameObjective() {
	if (!Badges.isChampion('JOHTO')) return null;   // the postgame opens on the JOHTO crown
	const jk = Badges.count('JOHKANTO');
	if (!Story.getFlag('beat_red')) {
		if (jk >= 8) return 'All 16 badges! The silent trainer RED waits at the summit of MT SILVER.';
		return `The MAGNET TRAIN runs again — the KANTO of old awaits. ${8 - jk} of its GYMS remain. (Board at GOLDENROD.)`;
	}
	const { caught, total } = legendStats();
	if (caught >= total) return 'RED has fallen and every legend is caught. The world is yours to wander.';
	return `RED has fallen. ${total - caught} legendary POKeMON still hide in the deep places (${caught}/${total}). ${legendRumor() || ''}`;
}
// quest-log rows for the same arc (appended to the region log by drawQuest)
export function postgameLog() {
	if (!Badges.isChampion('JOHTO')) return [];
	const jk = Badges.count('JOHKANTO');
	const rows = JOHKANTO_GYMS.map(([leader, town], i) => ({
		label: `${leader} — ${town}`,
		state: i < jk ? 'done' : (i === jk ? 'current' : 'locked'),
	}));
	rows.push({ label: 'RED — MT SILVER', state: Story.getFlag('beat_red') ? 'done' : (jk >= 8 ? 'current' : 'locked') });
	const { caught, total } = legendStats();
	rows.push({ label: `LEGENDS — ${caught}/${total}`, state: caught >= total ? 'done' : (Story.getFlag('beat_red') ? 'current' : 'locked') });
	return rows;
}
export let signTexts = {};
// Ops that only DISPLAY. A script built from nothing else is faithfully
// represented by its extracted sign text, so the cheap dump is fine. Anything
// else — a branch, an item check, a flag, a special — has to actually RUN, or
// the sign text becomes a static answer to a question the script was meant to
// decide. See the bg_event loop in interact().
const SIGN_INERT_OPS = new Set(['lock', 'lockall', 'release', 'releaseall', 'faceplayer',
	'msg', 'waitmsg', 'closemsg', 'end', 'return', 'waitbutton', 'nop']);
export function scriptIsDisplayOnly(ops) {
	if (!Array.isArray(ops)) return true;
	for (const o of ops) if (o && o.op && !SIGN_INERT_OPS.has(o.op)) return false;
	return true;
}
S.trainerTeams = {}; // canonical TRAINER_id -> {class, party} (species/level/moves)
let commonStrings = {}; // cross-map / shared text labels (fallback for msg ops)
let sharedScripts = {}; // bodies the decomps keep outside the map files (see loadMapScripts)
S.party = null;

// starter picker (fresh saves): 3 regions x 3 starters
export const STARTERS = [
	{ region: 'KANTO', ids: ['bulbasaur', 'charmander', 'squirtle'] },
	{ region: 'JOHTO', ids: ['chikorita', 'cyndaquil', 'totodile'] },
	{ region: 'HOENN', ids: ['treecko', 'torchic', 'mudkip'] },
];
// fresh-save picker: 'region' phase (choose Kanto/Johto/Hoenn, NO starter yet),
// then 'pick' phase (choose the starter on-screen inside the region's lab).
export const starterMenu = { open: false, row: 0, col: 0, sprites: {}, phase: 'region', region: null };
export const urlPinnedMap = new URLSearchParams(location.search).has('map');
// May a NEW step begin this instant? Checked by the engine right after onArrive,
// so an encounter/trainer/dialog that arriving just triggered stops the walk
// instead of committing one more step into it. Same condition the tick uses to
// decide whether input moves the player at all, so the two cannot disagree.
player.canStep = () => !menuBlocking() && !trainers.engaging;
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty) || services.blocks(tx, ty) || arcade.blocks(tx, ty) || blockers.blocks(tx, ty) || portals.blocks(tx, ty) || items.occupied(tx, ty);

// Strength: shove a boulder one tile ahead if a party mon can use Strength and
// the destination is clear. Returns true when the boulder actually moved.
let strengthHinted = false;
player.pushBoulder = (bx, by, dx, dy) => {
	const obj = items.fieldObjAt(bx, by);
	if (!obj || obj.kind !== 'boulder') return false;
	// only shoves once STRENGTH has been used (from the party menu) on this map
	if (!S.strengthActive) {
		if (!strengthHinted) {
			strengthHinted = true;
			dialog.open("It's a hefty boulder — but it won't budge.\n\nSTRENGTH could get it moving.");
		}
		return false;
	}
	const tx = bx + dx, ty = by + dy;
	// the tile beyond must be open floor (not water, not blocked by anything)
	if (!world.isPassable(tx, ty) || world.isSurfable(tx, ty)) return false;
	if (player.blocked(tx, ty)) return false;
	items.moveFieldObj(obj, tx, ty);
	return true;
};

trainers.onEngage = t => {
	const script = t.ev.script;
	// the Elite Four / Champion won't battle until you hold all 8 region badges
	const gate = leagueGateMessage(script);
	if (gate) { dialog.open(gate); return; }
	// Play the authentic ported script for any ordinary trainer or Gym Leader —
	// the taunt / leader speech, the battle, and the post-battle lines (a Leader
	// also does the badge/TM ceremony + NPC state changes). A Gym Leader's badge
	// is recorded silently by the scripted-battle victory hook (the speech
	// announces it). The Elite Four + Champion stay on the plain gated path — their
	// decomp scripts warp room-to-room and roll credits (a later pass). If a script
	// body isn't loaded, fall through to the plain battle (+ badge toast for gyms).
	const role = Badges.scriptInfo(script);
	const isLeague = role && (role.kind === 'elite' || role.kind === 'champion');
	if (!isLeague && S.mapScripts[script] && runScriptLabel(script, t)) return;
	const { party: foeParty, info } = trainers.buildBattle(t, battle.data);
	const begin = () => startTrainerBattle(t, foeParty, info);
	if (info.introQuote) dialog.open(info.introQuote, begin);
	else begin();
};

// un-hide villain grunts while their beat is active + the current map is one of the
// beat's dungeon floors (they then route through the normal sight/battle pipeline)
// un-hide villain grunts during their beat, AND spawn RED atop MT SILVER once you hold
// all 16 badges (JOHTO Champion + the 8 JohKanto gyms) — the post-game crown
// JohKanto's trainers scale with its wilds — same rule, same reason (see
// routeTrainerLevel). Outside JohKanto this is the identity.
//
// GYM LEADERS are the exception: they are levelled off YOU, not off the roster,
// so whenever you walk into a JohKanto gym its leader is one level above your
// strongest and its ace is two. A relative scale cannot do that — the eight gyms
// would either bunch up under your lead or ramp past it depending on when you
// arrived, and the point of a postgame gym is that it is always just ahead.
trainers.levelScale = (l, o) => {
	const league = johkantoLeagueKind(o?.script);
	if (league) return bossLevelFor(league, !!o.ace) + (o.bump || 0);
	if (!inJohKanto()) return l;
	if (o?.boss) return bossLevelFor('gym', !!o.ace) + (o.bump || 0);
	return routeTrainerLevel(l) + (o?.bump || 0);
};
trainers.spawnFlagged = (ev) => Quest.isDungeonFloor(playerRegion(), world.current.name)
	// RED and the four elites below him appear together, once JohKanto's eight
	// badges are in — the mountain is the region's league, so it opens as one.
	|| (ev && /^(Red|SilverCaveElite)/.test(ev.script || '')
		&& Badges.isChampion('JOHTO') && Badges.count('JOHKANTO') >= 8);

evolution.onDone = () => saveParty(S.party);
evolution.onEvolved = (from, to) => Journal.add(`${from} evolved into ${to}!`);
S.loading = true;
// ---------- screen fade (warp/door transitions) ----------
// Warps used to hard-cut between maps. A short fade-to-black on the way out and
// a fade-in on the new map reads instantly more finished. The main tick BAILS
// while `loading` is true, so the fade animates in the loading=false windows on
// either side of the load: fadeTo(1) (out) → set loading + swap the map →
// fadeTo(0) (in). While a fade runs, `fading` freezes input via menuBlocking so
// no stray step slips through the black. Honors REDUCED_MOTION (instant cut).
export const REDUCED_MOTION_OW = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fade = { alpha: 0, target: 0 };
export const FADE_SPEED = 6; // alpha units/sec (~170ms each way)
export const fading = () => fade.alpha > 0.001 || fade.target > 0.001;
function fadeTo(target) {
	if (REDUCED_MOTION_OW) { fade.alpha = target; fade.target = target; return Promise.resolve(); }
	fade.target = target;
	return new Promise(res => {
		const check = () => {
			if (Math.abs(fade.alpha - fade.target) < 0.02) { fade.alpha = fade.target; res(); }
			else requestAnimationFrame(check);
		};
		check();
	});
}
// safety-net watchdogs (see tick): a map load that hangs/throws must never strand
// loading=true (the whole game loop bails on it), and a plot cutscene must never
// block forever with no player-facing UI. Both self-recover after a grace period.
S.loadWatchStart = null;    // rAF timestamp when `loading` first went true
S.cutsceneStall = 0; S.cutsceneWatchSig = '';   // WATCHDOG 2: game-seconds a cutscene has made no progress
S.strandedSince = null;   // WATCHDOG 4: rAF timestamp the player first looked boxed in
S.moveStarveT = 0;          // seconds a held direction has gone undelivered (WATCHDOG 3)
export const MOVE_STARVE_LIMIT = 3;  // long enough that no legitimate hitch trips it
// Movement input the DOOR turned away. The first version of WATCHDOG 3 armed
// only on heldKeys, which is circular: the gate that freezes the player is the
// same gate that stops heldKeys ever filling, so the watchdog could not see the
// freeze it was written for. Rejections are the evidence that someone is trying.
export let rejectedMoves = 0, lastRejectAt = 0; S.rejectStarveT = 0; S.moveStuckT = 0;
export const REJECT_STARVE_LIMIT = 8; // longer: a dialog legitimately turns arrows away
export function noteRejectedMove() { rejectedMoves++; lastRejectAt = performance.now(); }



// ---------- INPUT DIAGNOSTICS (temporary instrumentation) ----------
// Movement has two doors — the keydown/d-pad door (menuBlocking) and the tick's
// own gates — and the headless pumpPlayer hook bypasses BOTH, so "internal
// movement works but the player is frozen" tells you nothing about WHICH gate is
// stuck. gateReport() names every one of them at once. `?owlog=1` also traces
// every movement event, listener attach, and lifecycle transition to the console.
export function openCanvasMenus() {
	// built lazily: several of these are declared further down the file
	const m = { starterMenu, shopMenu, bagMenu, pcMenu, partyMenu, ferryMenu, portalMenu, bpShopMenu,
		trade, startMenu, playerMenu, deckSelect, radioMenu, unownDex, cardsMenu, runMenu, friendsMenu,
		dexMenu, trainerCard, townMap, daycareMenu, nameRater, halfParty, moveShop, optionsMenu, questMenu, mailMenu,
		tradeMenu, gcMenu, vfMenu, contestMenu, blendMenu, slideMenu, decoMenu, socialMenu, slotsMenu };
	return Object.keys(m).filter(k => m[k] && m[k].open);
}
// why the last movement input was accepted or ignored, plus every gate's live value
export function gateReport() {
	const menus = openCanvasMenus();
	const r = {
		// keydown/d-pad door
		typingInChat: typingInChat(),
		activeEl: document.activeElement ? document.activeElement.tagName + (document.activeElement.id ? '#' + document.activeElement.id : '') : null,
		dialog: !!dialog.blocking, evolution: !!evolution.blocking, cutscene: !!cutscene.blocking,
		battle: !!battle.blocking, battleActive: !!battle.active, pvp: !!pvp.blocking,
		factorySpec: !!factorySpec.blocking, canvasMenus: menus, fading: fading(),
		fade: { alpha: fade.alpha, target: fade.target },
		menuBlocking: menuBlocking(),
		// tick gates
		loading: S.loading, hasWorld: !!world.current, editView: !!editView.on,
		starterMenu: !!starterMenu.open, trainersEngaging: !!trainers.engaging,
		tickMoveGate: !(battle.blocking || pvp.blocking || factorySpec.blocking || dialog.blocking
			|| evolution.blocking || starterMenu.open || cutscene.blocking),
		// held-key / movement state
		heldKeys: heldKeys.slice(), dpadDir, runHeld: S.runHeld, wasInBattle: S.wasInBattle,
		rejectedMoves, moveStarveT: Math.round(S.moveStarveT * 100) / 100, rejectStarveT: Math.round(S.rejectStarveT * 100) / 100,
		playerMoving: !!player.moving, moveT: player.moveT, moveOutcome: player.moveOutcome, moveDist: player.moveDist,
		surfing: !!player.surfing, biking: !!player.biking, facing: player.facing,
		tx: player.tx, ty: player.ty, map: world.current ? world.current.name : null,
		tick: { ...tickStats },
	};
	r.blockedBy = r.typingInChat ? 'typingInChat'
		: r.dialog ? 'dialog' : r.evolution ? 'evolution' : r.cutscene ? 'cutscene'
		: r.battle ? 'battle' : r.pvp ? 'pvp' : r.factorySpec ? 'factorySpec'
		: menus.length ? 'canvasMenu:' + menus.join(',') : r.fading ? 'fading'
		: r.loading ? 'loading' : r.editView ? 'editView'
		: r.trainersEngaging ? 'trainers.engaging' : null;
	return r;
}

addEventListener('keydown', e => {
	if (typingInChat()) return;
	// the CONTROLS screen capturing a new binding owns the next raw key
	if (optionsMenu.open && optionsMenu.mode === 'controls' && optionsMenu.capture) {
		e.preventDefault();
		const r = assignKeyBind(optionsMenu.capture, e.key);
		optionsMenu.flash = r === 'bound' ? `Bound to ${normKey(e.key) === ' ' ? 'SPACE' : String(normKey(e.key)).toUpperCase()}.`
			: r === 'reserved' ? 'That key is reserved — pick another.' : null;
		if (r !== 'reserved') optionsMenu.capture = null;
		sfx(r === 'bound' ? 'ui_select' : 'ui_denied');
		return;
	}
	const k = translateKey(e.key);
	if (menuBlocking() || ['z', 'x', 'Enter', 'p', 'b', 'Escape'].includes(k) || KEYMAP[k] || k !== e.key) {
		if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
	}
	// Auto-repeat must never stand in for a SECOND press on a confirm/cancel key.
	// Holding A through battle text fired one keydown to advance the message and the
	// very next repeat landed on the menu that had just opened — selecting BAG with
	// no new press (reported repeatedly against Abe and Falkner). Arrows are left
	// repeating on purpose, so holding a direction still scrolls a long list.
	if (e.repeat && (k === 'z' || k === 'Enter' || k === 'x')) return;
	pressKey(k);
});

// ---------- touch controls ----------
// d-pad + A/B + PARTY/BAG buttons drive the same code paths as the keyboard
if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); fitCanvas(); } // re-fit: the touch pad reserves canvas room
const DPAD = { 't-up': 'up', 't-down': 'down', 't-left': 'left', 't-right': 'right' };
const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
// The d-pad used to setPointerCapture on the button you pressed, so a thumb
// sliding from UP onto LEFT kept firing UP — every change of direction needed a
// lift and a re-press. One tracked pointer plus a hit-test on move lets the
// thumb slide across the pad the way a real d-pad works.
let dpadPointer = null, dpadDir = null;
const dirUnder = (x, y) => DPAD[document.elementFromPoint(x, y)?.id] || null;
function setDpadDir(dir) {
	if (dir === dpadDir) return;
	if (dpadDir) { const i = heldKeys.indexOf(dpadDir); if (i >= 0) heldKeys.splice(i, 1); }
	dpadDir = dir;
	if (dir && !heldKeys.includes(dir)) heldKeys.unshift(dir);
}
for (const [id, dir] of Object.entries(DPAD)) {
	document.getElementById(id).addEventListener('pointerdown', e => {
		e.preventDefault();
		if (menuBlocking()) {  // menus want discrete presses
			noteRejectedMove();
			if (INPUT_TRACE) owlog('dpad IGNORED', dir, 'reason=' + gateReport().blockedBy);
			pressKey(ARROW[dir]);
			return;
		}
		dpadPointer = e.pointerId;
		setDpadDir(dir);
		owlog('dpad ACCEPTED', dir, 'held=' + heldKeys.join('|'));
	});
}
owlog('listeners attached: d-pad x' + Object.keys(DPAD).length);
addEventListener('pointermove', e => {
	if (dpadPointer === null || e.pointerId !== dpadPointer) return;
	if (menuBlocking()) { setDpadDir(null); return; }
	setDpadDir(dirUnder(e.clientX, e.clientY));   // null once the thumb leaves the pad
});
for (const ev of ['pointerup', 'pointercancel']) {
	addEventListener(ev, e => {
		if (dpadPointer === null || e.pointerId !== dpadPointer) return;
		setDpadDir(null);
		dpadPointer = null;
	});
}
for (const [id, key] of [['t-a', 'z'], ['t-b', 'x'], ['t-start', 'Enter'], ['t-party', 'p'], ['t-bag', 'b']]) {
	document.getElementById(id).addEventListener('pointerdown', e => { e.preventDefault(); pressKey(key); });
}
// holding B doubles as the run button while roaming
const tb = document.getElementById('t-b');
tb.addEventListener('pointerdown', () => { S.runHeld = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tb.addEventListener(ev, () => { S.runHeld = false; });

// tap/click on the game screen: battle buttons, or advancing dialogs
function screenPos(e) {
	const r = screen.getBoundingClientRect();
	return [(e.clientX - r.left) * (screen.width / r.width),
		(e.clientY - r.top) * (screen.height / r.height)];
}
screen.addEventListener('pointermove', e => {
	if (factorySpec.blocking) { factorySpec.hover(...screenPos(e)); return; }
	if (pvp.blocking) { pvp.hover(...screenPos(e)); return; }
	if (battle.blocking) { battle.hover(...screenPos(e)); return; }
	if (anyMenuOpen()) {
		const [x, y] = screenPos(e);
		S.menuHover = null;
		for (const b of S.menuUi) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) S.menuHover = b.id;
	}
});
// touch leaves the last pointermove hover latched on a button forever — clear
// it when the finger lifts so nothing stays falsely highlighted
const clearHovers = e => {
	if (e.pointerType === 'mouse') return; // a mouse keeps hovering after release
	if (battle.active) battle.active.hover = null;
	if (pvp.active) pvp.active.hover = null;
	S.menuHover = null;
};
screen.addEventListener('pointerup', clearHovers);
screen.addEventListener('pointercancel', clearHovers);
screen.addEventListener('pointerdown', e => {
	e.preventDefault();
	if (factorySpec.blocking) { factorySpec.tap(...screenPos(e)); return; }
	if (pvp.blocking) { pvp.tap(...screenPos(e)); return; }
	if (battle.blocking) { battle.tap(...screenPos(e)); return; }
	if (dialog.blocking || evolution.blocking) { pressKey('z'); return; }
	if (anyMenuOpen()) {
		const [x, y] = screenPos(e);
		for (const b of S.menuUi) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { menuTap(b.id); return; }
		}
	}
});

// ---------- map transitions ----------
// per-map ported scripts + resolved text (lazy-loaded, cached)
let mapStrings = {}; S.mapScripts = {};
const scriptCache = new Map();
async function loadMapScripts(stem) {
	S.mapScripts = {}; mapStrings = {};
	if (!stem) return;
	if (!scriptCache.has(stem)) {
		const scr = await getJSON(`data/scripts/${stem}.json`).catch(() => null);
		const str = await getJSON(`data/strings/${stem}.json`).catch(() => ({}));
		scriptCache.set(stem, { scr, str });
	}
	const c = scriptCache.get(stem);
	// Both decomps keep script bodies OUTSIDE the map file — in data/scripts/*.inc,
	// in event_scripts.s, and in another map's file when several maps share one
	// (every Silph Co floor points at one door script; the Dotted Hole's basements
	// at 1F's). The engine loads exactly ONE map's file, so all of that resolved to
	// nothing and the object was mute. sharedScripts is the recovered table — the
	// FireRed/Emerald counterpart of crystal_stds.js.
	//
	// Merged UNDER the map's own labels, so a map that defines a label keeps its
	// own version; the shared copy is only ever a fallback. Merging here rather
	// than at each call site means runScriptLabel, `goto` and `call` all resolve
	// through it without knowing it exists.
	S.mapScripts = applySailFix({ ...sharedScripts, ...(c.scr || {}) });
	mapStrings = c.str || {};
}

// fire-and-forget: warm the sprites a battle on THIS map would need (party
// back-sprites + the local encounter table's fronts) so a wild encounter
// doesn't stall on cold sprite fetches with the screen frozen. getImage
// memoizes, so battle start() finds these already resolved.
function warmBattleSprites() {
	try {
		const warm = f => { if (f) getImage(`data/pokemon/${f}`).catch(() => {}); };
		for (const m of S.party || []) if (m?.sprite) warm(m.sprite.replace(/\.(png|gif)$/, '-b.$1'));
		const groups = encounters.data?.[world.current?.map?.id] || {};
		const ids = new Set();
		for (const kind of ['land', 'water']) for (const s of groups[kind]?.slots || []) if (s.id != null) ids.add(s.id);
		let n = 0;
		for (const id of ids) { if (n++ >= 12) break; warm(battle.data?.species?.[id]?.sprite); }
	} catch { /* prefetch is best-effort */ }
}

export async function refreshMapContent(label) {
	S.strengthActive = false; strengthHinted = false; // STRENGTH must be re-used per map
	trickHouseOpenDoors(label);
	shoalFixup(label);
	silphDoorsApply(label);
	hillPrepFloor(label); // must precede npcs.loadForMap — it injects the guards
	roamersOnMapChange();
	S.radioTune = null; // leaving the room switches the radio off; map track resumes
	if (!/^SecretBase_/.test(label || '')) S.baseCtx = null; // left the base

	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	arcade.loadForMap();
	blockers.loadForMap();
	portals.loadForMap();
	items.loadForMap();
	// the real games wipe the TEMP flag range on every map transition
	// (ClearTempFieldEventData); ours persists it, so do it here
	Story.clearTempFlags();
	noteOutdoor();
	await loadMapScripts(world.current.name);
	hud.textContent = world.current.map.name || label;
	// classic sliding area-name banner on entering a new OUTDOOR area (not buildings)
	if (world.current.map.map_type !== 'MAP_TYPE_INDOOR' && !world.current.map.indoor) showAreaBanner(world.current.map.name);
	// arriving on a Fly-destination map registers it so you can fly back later
	markFlyPoint(world.current.map.id);
	savePos();
	S.loading = false;
	refreshFollower();
	warmBattleSprites();
	// run this map's ON_TRANSITION script (story vars, scene setup), then check
	// for an ON_FRAME auto-cutscene now that the map is set up. Guard the ported
	// plot triggers: a throwing story script must not break map entry itself
	// (the map is already loaded + loading cleared above).
	await runMapSetupScripts(false);
	try { checkOnFrame(); } catch (e) { console.warn('[plot] onFrame failed', e); if (cutscene.blocking) cutscene.stop(); }
	// a post-battle beat that was won before the game could run it (see above)
	S.postBattleCatchUpArmed = true;   // fired by the tick once the screen is free (see there)
	// a partyless new-game player who has reached the region's lab: run the
	// professor greeting + on-screen starter pick (Fork B authentic open)
	try { checkIntroTrigger(); } catch (e) { console.warn('[intro] trigger failed', e); }
	// villain-arc boss confrontation on entering an evil-team location
	try { checkVillainTrigger(); } catch (e) { console.warn('[villain] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// the recurring cross-region rival intercepts you at the current tier's gym town
	try { checkRivalTrigger(); } catch (e) { console.warn('[rival] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// Hoenn legendary-awakening beats (post-climax): KYOGRE/GROUDON clash -> RAYQUAZA
	try { checkAwakeningTrigger(); } catch (e) { console.warn('[awakening] trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// the safari PA speaks the moment you cross into (or out of) the zone
	try { checkSafariGate(); } catch (e) { console.warn('[safari] gate check failed', e); }
	syncMapBgm();
	refreshObjective();
}

// visited Fly points (magepunk_flypoints); a town unlocks when you first stand on it
let flyPoints = null;
function loadFlyPoints() {
	if (flyPoints) return flyPoints;
	const fp = safeLoad('magepunk_flypoints', []);
	flyPoints = new Set(Array.isArray(fp) ? fp : []);
	return flyPoints;
}
function markFlyPoint(mapId) {
	if (!mapId || !Fly.REGION_OF[mapId]) return;
	const fp = loadFlyPoints();
	if (fp.has(mapId)) return;
	fp.add(mapId);
	safeSave('magepunk_flypoints', [...fp]);
}
export function hasFlyPoint(mapId) { return loadFlyPoints().has(mapId); }

// nearest walkable tile to a preferred spot (spiral search)
export function findLanding(px, py) {
	for (let r = 0; r < 14; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = px + dx, y = py + dy;
				if (world.isPassable(x, y) && !world.isSurfable(x, y)) return [x, y];
			}
		}
	}
	return [px, py];
}
// nearest SURFABLE (water) tile to a preferred spot — used when emerging into a
// lake whose underwater twin is a different size (Sootopolis), so the same-tile
// clamp wouldn't land on water
export function findSurfLanding(px, py) {
	for (let r = 0; r < 24; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
				const x = px + dx, y = py + dy;
				if (world.isSurfable(x, y)) return [x, y];
			}
		}
	}
	return [px, py];
}

// direct travel (region select, ferries): land near the map's center
// load-guard: on any load failure world.load leaves world.current on the old
// (valid) map — this.current is only reassigned after a full successful render —
// so the player just stays put. Clear loading + kill any wedged cutscene so the
// game never freezes on a bad warp/connection.
export function afterLoadError(where, err) {
	console.warn(`[load-guard] ${where} failed`, err);
	S.loading = false;
	if (cutscene.blocking) cutscene.stop();
	hud.textContent = "That area couldn't be loaded.";
}

export async function moveToMap(file, px, py) {
	await fadeTo(1);              // dip to black before the swap (fades in below)
	S.loading = true;
	try {
		await world.load(file);
		const cx = px ?? Math.floor(world.current.layout.width / 2);
		const cy = py ?? Math.floor(world.current.layout.height / 2);
		player.setTile(...findLanding(cx, cy));
		player.surfing = false;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('moveToMap ' + file, e); }
	fadeTo(0);                    // reveal the new map
}

export async function warpTo(mapId, destWarpId, destX, destY) {
	const file = world.fileFor(mapId);
	// An unresolvable destination used to just warn and return, leaving the player
	// standing on the warp tile. That is a SOFTLOCK wherever every exit is
	// unresolvable and there is no connection to walk out through — six elevators
	// (Silph Co, Rocket Hideout, Trainer Tower, Celadon/Lilycove dept stores,
	// Marine Cave) trapped you for good, since Fly is blocked indoors and Escape
	// Rope does nothing. backWarp() puts you back where you came from, and falls
	// back to the region's start town if even that is unknown.
	if (!file) {
		console.warn('unknown warp dest', mapId, '- returning the player instead of stranding them');
		await backWarp();
		return;
	}
	sfx('door');
	const source = { name: world.current.name, tx: player.tx, ty: player.ty };
	await fadeTo(1);             // dip to black as the door opens (fades in below)
	S.loading = true;
	try {
		await world.load(file);
		let idx = parseInt(destWarpId, 10);
		const lay = world.current.layout;
		const hasXY = Number.isInteger(destX) && Number.isInteger(destY) && destX >= 0 && destY >= 0
			&& destX < lay.width && destY < lay.height;
		// A scripted warp to a COORDINATE (the decomp's two-arg form) lands exactly
		// there. A door index wins when it names a real door; the coordinate is the
		// fallback — the decomp's own rule for its three-arg form.
		const w = (!isNaN(idx) && idx >= 0 && world.warps[idx]) || null;
		if (w) player.setTile(w.x, w.y);
		else if (hasXY) player.setTile(destX, destY);
		else if (world.warps[0]) player.setTile(world.warps[0].x, world.warps[0].y);
		else player.setTile(Math.floor(world.current.layout.width / 2), Math.floor(world.current.layout.height / 2));
		world.lastWarpSource = source;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('warpTo ' + mapId, e); }
	fadeTo(0);                   // reveal the destination
}

// Fly: warp straight to a town's landing tile (no warp-index lookup)
export async function flyTo(mapId, tx, ty) {
	const file = world.fileFor(mapId);
	if (!file) { console.warn('unknown fly dest', mapId); return; }
	S.loading = true;
	player.surfing = false;
	try {
		await world.load(file);
		const lay = world.current.layout;
		const cx = Math.min(Math.max(0, tx), lay.width - 1);
		const cy = Math.min(Math.max(0, ty), lay.height - 1);
		player.setTile(...findLanding(cx, cy));
		await refreshMapContent(file);
	} catch (e) { afterLoadError('flyTo ' + mapId, e); }
}

// A Crystal -1 warp means "put me back where I came from". The source is
// remembered in memory and now also persisted with the save position — but this
// must NEVER be able to do nothing, because the maps that use it (Pokecenter2F,
// the dept-store elevators, the Fast Ship) have no other way out. If the source
// is somehow missing, fall back to the region's start town: a big hop, but the
// alternative is being sealed in a room forever.
export async function backWarp() {
	// in-memory source first, then the one saved alongside the position (this is
	// what survives a reload)
	const src = world.lastWarpSource || safeLoad(POS_KEY, null)?.back || null;
	// src.name is a map FILE stem (what world.load takes) — not a MAP_ id, so it
	// must not be validated through fileFor(), which maps ids TO stems.
	if (src?.name) {
		S.loading = true;
		try {
			await world.load(src.name);
			player.setTile(src.tx, src.ty);
			await refreshMapContent(src.name);
			world.lastWarpSource = null; // spent
			return;
		} catch (e) { console.warn('backWarp ' + src.name + ' failed, using the fallback', e); }
	}
	// last resort — a failed or missing source must never leave the player sealed in
	hud.textContent = 'You found your own way out.';
	await moveToMap(Quest.START[playerRegion()] || 'PalletTown');
}



// ---------- cutscenes ----------
// find an on-map NPC by its object_event local_id (for scripted movement)
// THE SCRIPTS AND THE MAP DATA NAME THE SAME OBJECT DIFFERENTLY.
//
// A transpiled script says `hideobj KURTSHOUSE_KURT1` — the decomp's constant.
// The map's object_event carries local_id `KurtsHouse_SPRITE_KURT`. npcById was
// an exact match, so every one of those resolved to null and the op silently did
// nothing: 1224 references across the game, which is why Kurt kept standing in
// his house after walking out, and why story NPCs all over Johto never appeared,
// moved or left.
//
// Nothing here invents an object. If the map genuinely has no such object the
// answer is still null and the op stays the no-op it already was — which is the
// correct outcome for the ~300 references (AZALEATOWN_RIVAL and friends) whose
// object simply is not in this port's map data.
const normObjId = s => String(s == null ? '' : s).toUpperCase().replace(/_SPRITE_/g, '_').replace(/[^A-Z0-9]/g, '');
S.lastTalkedNpc = null;   // VAR_LAST_TALKED: literally "the object you just talked to"

function npcById(localId) {
	if (localId == null) return null;
	// Trainers are NOT in npcs.list — trainers.js owns them (npcs.js skips any
	// isTrainerEvent). A script that hides or moves a trainer is common: the four
	// Slowpoke Well grunts are trainers, and hiding them is what sets
	// EVENT_SLOWPOKE_WELL_ROCKETS and clears the Azalea gym doorway. Searching one
	// list found none of them.
	const list = [...(npcs.list || []), ...((trainers && trainers.list) || [])];
	// 1. the map's own id, which is what a correctly-named reference uses
	const exact = list.find(n => n.ev && n.ev.local_id === localId);
	if (exact) return exact;

	// 2. VAR_LAST_TALKED — 193 references, all of them "this one, the one in front
	//    of you". The decomp keeps it in a var; we keep it on the side.
	if (localId === 'VAR_LAST_TALKED') return S.lastTalkedNpc && list.includes(S.lastTalkedNpc) ? S.lastTalkedNpc : null;

	// 3. a raw object INDEX into the map's object_events (Battle Dome uses 0/2/4/6)
	if (typeof localId === 'number' || /^\d+$/.test(String(localId))) {
		const evs = world.current?.map?.object_events || [];
		const ev = evs[+localId];
		return (ev && list.find(n => n.ev === ev)) || null;
	}

	// 4. the decomp constant vs the map's local_id. Normalising both sides
	//    (upper-case, drop _SPRITE_, drop punctuation) reconciles 372 of them.
	const want = normObjId(localId);
	if (!want) return null;
	const same = list.filter(n => n.ev && normObjId(n.ev.local_id) === want);
	if (same.length) return same[0];

	// 5. a trailing index picks the Nth object sharing one local_id — KURTSHOUSE_KURT1
	//    and KURTSHOUSE_KURT2 are both `KurtsHouse_SPRITE_KURT`, in map order.
	//    Another 261. A bare stem with no index means the first.
	const m = want.match(/^(.*?)(\d+)$/);
	if (m) {
		const stem = list.filter(n => n.ev && normObjId(n.ev.local_id) === m[1]);
		const i = +m[2];
		// STRICT on the range. Every one of the 261 references this resolves today
		// is in range, so clamping would be dead code — and the only thing a clamp
		// could ever do is silently act on the WRONG NPC. Out of range stays null,
		// which is exactly the no-op these references already were.
		if (i >= 1 && i <= stem.length) return stem[i - 1];
	}
	return null;
}
// the bridge a running cutscene uses to touch the game
export function cutsceneCtx(talker, scriptLabel) {
	return {
		dialog, player, npcById, talker: talker || null,
		scriptLabel: scriptLabel || null,
		strings: mapStrings,
		common: commonStrings,
		playerName: (localStorage.getItem('magepunk_name') || 'PLAYER'),
		rivalName: (localStorage.getItem('magepunk_rival') || 'GARY'),
		giveItem: (id, n) => { Bag.addItem(id, n); Bag.registerName(id, (id || '').toUpperCase()); },
		takeItem: (id, n) => { Bag.consume(id); },
		// `checkitem` — the condition behind every item turn-in in the Crystal
		// scripts (the MACHINE PART, the LOST ITEM, the PASS, the BICYCLE check).
		hasItem: (id) => !!id && Bag.count(id) > 0,
		partyCount: () => (S.party || []).length,   // givemon reports party-vs-box into VAR_RESULT
		// Crystal's yes/no box, answered with the closing key the way every other
		// prompt in this port is (Z = yes, X = no), stored where the branch reads it.
		prompt: () => {
			dialog.open('Z = Yes    X = No', k => {
				Story.setVar('VAR_RESULT', k === 'x' ? 0 : 1);
				cutscene.resume();
			});
			return 'wait';
		},
		giveMon: (species, level) => {
			const mon = battle.data.species[species] && buildMonForGift(species, level);
			if (mon) { Dex.markCaught(species); dexMilestoneCheck(); addCaught(S.party, mon); saveParty(S.party); }
		},
		// Crystal's `giveegg`. Elm's aide hands over the TOGEPI EGG in the Violet
		// POKeMON CENTER; the op was dropped in transpile (along with the `scall`
		// body that announced it), so the aide's whole scene played and nothing
		// changed hands — TOGEPI and TOGETIC were obtainable nowhere.
		giveEgg: (species, level) => {
			if (!battle.data.species[species]) return;
			if (Daycare.giftEgg(species)) {
				hud.textContent = 'You received an EGG! It is at the DAY CARE — walk to hatch it.';
				return;
			}
			// the Day Care egg slot is busy with a bred egg; hand over the POKeMON
			// itself rather than dropping the gift on the floor
			const mon = buildMonForGift(species, level);
			if (mon) { Dex.markCaught(species); dexMilestoneCheck(); addCaught(S.party, mon); saveParty(S.party); }
		},
		healParty: () => healParty(S.party),
		warp: (mapId, warpId, x, y) => warpTo(mapId, warpId, x, y),
		// a ferry arrival lands on a tile, not a door (see sail_fix.js)
		warpXy: (mapId, x, y) => flyTo(mapId, x, y),
		setObjXy: (who, x, y) => { const n = npcById(who); if (n) { n.tx = x; n.ty = y; n.px = x * META; n.py = y * META; } },
		// Hiding an object SETS ITS OWN FLAG, in all three decomps — that is how the
		// hide survives a reload and how other maps learn about it. pokeemerald
		// RemoveObjectEventByLocalIdAndMap (src/event_object_movement.c:1389) does
		// FlagSet(GetObjectEventFlagIdByObjectEventId(...)) before removing the
		// object; Crystal's `disappear` does the same.
		//
		// This used to write EVENT_* (Crystal) flags only, on the stated belief that
		// FireRed/Emerald scripts set their FLAG_HIDE_* explicitly alongside
		// removeobject. That belief was wrong, and a playtester found the cost:
		// Wally, beaten outside the Mauville gym, hid for the rest of that visit and
		// then stood on the only tile south of the gym door on the next load — a
		// hard softlock for anyone without Fly. Every FR/E removeobject-only hide had
		// the same "comes back on reload" bug.
		//
		// SHOWING is not symmetric. Crystal's `appear` clears the flag; FR/E's
		// `addobject` does not (their scripts `clearflag` explicitly first), so only
		// Crystal's EVENT_* flags are cleared here. Decoration / secret-base objects
		// are driven by systems this port does not model and are left alone.
		hideObj: who => {
			const n = npcById(who); if (!n) return;
			n.hidden = true;
			const f = n.ev && n.ev.flag;
			if (f && f !== '0' && !/^FLAG_DECORATION_|^FLAG_HIDE_SECRET_BASE/.test(f)) Story.setFlag(f);
		},
		showObj: who => {
			const n = npcById(who); if (!n) return;
			n.hidden = false;
			const f = n.ev && n.ev.flag;
			if (f && /^EVENT_/.test(f)) Story.clearFlag(f);
		},
		setMetatile: (x, y, tile, impassable) => world.setMetatile(x, y, tile, impassable), // tile edits: not yet applied to the web layout
		startBattle: trainerId => startScriptedBattle(trainerId, scriptLabel, talker),
		wildBattle: (species, level) => startScriptedWildBattle(species, level),
		// a clerk's `openmart`: raise the standard shop counter and hold the script
		// until it closes (shopKey resumes the cutscene on exit)
		openMart: () => {
			shopMenu.open = true; shopMenu.idx = 0; shopMenu.mode = 'buy'; shopMenu.flash = null;
			shopMenu.fromScript = true;
			return 'wait';
		},
		special: (name, store) => runSpecial(name, store), // handlers write `store`; unknown -> 0
		hud: msg => { hud.textContent = msg; },
	};
}

initTouchHud();   // the touch HUD's observer, installed here where it always ran (see ow_loop.js)

// ---------- boot ----------
(async () => {
	hud.textContent = 'Loading…';
	// BEFORE any map loads: a map's onFrame scenes are checked the moment it
	// finishes loading, so newly-armed scenes must exist by then. ALL regions are
	// armed, not just the one you're standing in — the portals make every region
	// same-session reachable, and an unarmed foreign region greets a traveller
	// with its new-game scripts (Littleroot's truck intro, New Bark's no-starter
	// block, Pallet's grabbable lab starter balls). Arming only fills vars the
	// save has NEVER touched, so in-progress regions keep their story state.
	for (const r of Object.keys(STORY_SEED)) armStoryScenes(r);
	seedCrystalEvents();      // Crystal's own new-game event state (Misty is out, Blue is at Cinnabar)
	// Crystal one-shots the free-roam port can never reach: vanilla ends Route
	// 30's battling-kids scene when you hand ELM the MYSTERY EGG (ElmsLab.asm
	// sets EVENT_ROUTE_30_BATTLE to hide the four-sprite tableau and reveals
	// JOEY as a normal trainer) — an errand the authored intro skips, which left
	// the battle frozen on the road forever. Seed the post-errand state.
	// Unconditional + idempotent, AFTER seedCrystalEvents, so existing saves
	// (already past the crystal_events_seeded guard) heal too.
	Story.setFlag('EVENT_ROUTE_30_BATTLE');
	Story.clearFlag('EVENT_ROUTE_30_YOUNGSTER_JOEY');
	syncStoryVars();          // VAR_BADGES, for the Crystal scripts that read it
	await world.init();
	await player.init();
	await npcs.init();
	loadItemIcons();          // bag-menu item icons (index; sprites lazy-load per row)
	await encounters.init();
	await battle.init();
	// hand PvP a sprite->battleScale lookup (its mons come over the wire without a species
	// handle, but they carry the sprite filename, which maps 1:1 to the species)
	pvp.scaleBySprite = new Map(Object.values(battle.data.species).filter(s => s.sprite).map(s => [s.sprite, s.battleScale || 1]));
	// TMs the events hand out have no ITEMS entry of their own (tmMoveId resolves
	// them generically), so let the bag name them from the move they teach
	Bag.setMoveNamer(id => { const mid = tmMoveId(id); return mid ? battle.data.moves[mid]?.name : null; });
	await Trades.init();  // in-game NPC trade table (tools/gen_trades.mjs)
	await trainers.init();
	applyGymLevelFloors(); // even out same-tier gym difficulty across regions (interleave)
	refreshLevelCap();     // clamp growth to the tier cleared in EVERY region
	await services.init();
	await arcade.init();
	await blockers.init();
	await items.init();
	signTexts = await getJSON('data/sign_texts.json').catch(() => ({}));
	S.trainerTeams = await getJSON('data/trainer_teams.json').catch(() => ({}));
	commonStrings = await getJSON('data/strings/_common.json').catch(() => ({}));
	// the shared bodies, and the text they speak — an unstringed msg falls through
	// to printing its own label, so the two have to arrive together
	{
		const sh = await getJSON('data/shared_scripts.json').catch(() => null);
		if (sh) { sharedScripts = sh.scripts || {}; commonStrings = { ...(sh.strings || {}), ...commonStrings }; }
	}
	await hydrateOw(); // server-authoritative: refresh starter/region/position from D1 before reading them
	S.party = loadParty(battle.data);
	// standalone Battle Factory mini-game (?factory=1): no save/party needed (it
	// battles with rentals). Suppress the region picker; the post-boot hook warps to
	// the Factory and provisions a throwaway lead just before starting.
	S.factoryStandalone = new URLSearchParams(location.search).has('factory');
	if (S.party) { Dex.seedFrom([...S.party, ...getBox()]); dexMilestoneCheck(); }
	// "No party" is NOT the same as "new game". Fork B hands over no POKeMON until
	// you reach the professor's lab, so the whole stretch between choosing a region
	// and picking a starter is partyless — and keying the region picker on `!party`
	// alone re-asked the question on EVERY load in that window. Answering it a
	// second time rewrote `magepunk_region` and warped the player to a different
	// region's home town while the first region's story seed stayed put, so the lab
	// then offered that other region's starters. That is the "starters offered
	// multiple times" report.
	//
	// The real question is whether the game has BEGUN: beginNewGame writes the
	// region and seeds the story together, so requiring both is exact. A save with
	// a region but no seed (anything predating Fork B) still gets the picker, which
	// is the safe direction — it can always start, never gets stuck.
	const alreadyBegun = !!localStorage.getItem('magepunk_region') && Story.getFlag('story_seeded');
	if (!S.party && !S.factoryStandalone && !alreadyBegun) {
		// fresh save → region picker first (Fork B: no starter until the lab)
		starterMenu.open = true;
		starterMenu.phase = 'region';
		starterMenu.row = 0; starterMenu.col = 0; starterMenu.region = null;
		for (const row of STARTERS) {
			for (const id of row.ids) {
				const sp = battle.data.species[id];
				if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => { starterMenu.sprites[id] = img; }).catch(() => {});
			}
		}
	}
	const params = new URLSearchParams(location.search);
	// resume from the saved position unless the URL pins a map
	let saved = null;
	if (!params.has('map')) saved = safeLoad(POS_KEY, null);
	const startMap = params.get('map') || saved?.map || 'PalletTown';
	try { await world.load(startMap); } catch (e) { saved = null; await world.load('PalletTown'); }
	const sx = params.has('x') ? +params.get('x')
		: saved?.x ?? Math.floor(world.current.layout.width / 2);
	const sy = params.has('y') ? +params.get('y')
		: saved?.y ?? Math.floor(world.current.layout.height / 2);
	player.setTile(sx, sy);
	// resuming a save that stood on water means we were surfing
	if (world.isSurfable(sx, sy)) player.surfing = true;
	repairSaves();   // before the map's objects are read, so a repaired hide takes effect on THIS load
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	arcade.loadForMap();
	blockers.loadForMap();
	portals.loadForMap();
	items.loadForMap();
	// the real games wipe the TEMP flag range on every map transition
	// (ClearTempFieldEventData); ours persists it, so do it here
	Story.clearTempFlags();
	noteOutdoor();
	await loadMapScripts(world.current.name);
	S.postBattleCatchUpArmed = true;   // the boot path never ran the catch-up at all
	hud.textContent = world.current.map.name || startMap;
	markFlyPoint(world.current.map.id);
	S.loading = false;
	await runMapSetupScripts(true);
	// ...and the STARTING map's onFrame pass. moveToMap runs one on every later
	// entry, but boot loads the first map directly (world.load, not moveToMap),
	// so a scene waiting on the map you resume into would never fire.
	try { checkOnFrame(); } catch (e) { console.warn('[plot] boot onFrame failed', e); if (cutscene.blocking) cutscene.stop(); }
	// booting straight into a Safari Zone (reload mid-game, or a save standing
	// inside with no session) must speak the PA line too — boot bypasses
	// refreshMapContent, where the gate check normally lives
	try { checkSafariGate(); } catch (e) { console.warn('[safari] boot gate check failed', e); }
	syncMapBgm();
	refreshObjective(); // show the current quest objective on boot
	// a battle abandoned by leaving the page resumes exactly where it stood —
	// same foe, same HP, same field (like resuming a dungeon run)
	let battleResumed = false;
	try { battleResumed = resumeSavedBattle(); } catch (e) { console.warn('[battle-resume] failed', e); }
	// heal saves stranded before resume existed: a starter in hand but the
	// intro flags never landed (left mid-rival-battle), gating all progression
	if (!battleResumed && S.party && !Story.getFlag('intro_done')) {
		console.warn('[intro-heal] party without intro_done — completing the intro');
		afterRival(playerRegion());
	}
	// Resuming mid-intro — region chosen, starter not yet collected. The lab
	// trigger (checkIntroTrigger) still fires when they walk in, so the only gap is
	// a player who reloaded before hearing where to go. Replay the professor's
	// welcome for them; it self-terminates by setting `intro_started`, so anyone
	// who already heard it is left alone.
	if (!S.party && !S.factoryStandalone && alreadyBegun && !Story.getFlag('intro_started') && !cutscene.blocking) {
		startIntroNarration(playerRegion());
	}
	// headless test hook
	// test hook: drive the player straight, bypassing the game loop's input
	function freezeLoop(on) { S.loading = !!on; }
	function pumpPlayer(dir, run, ms) {
		return new Promise(res => {
			player.run = !!run;
			const t0 = performance.now();
			let last = t0;
			const startAxis = dir === 'up' || dir === 'down' ? player.ty : player.tx;
			const step = () => {
				const now = performance.now();
				player.update((now - last) / 1000, dir);
				last = now;
				if (now - t0 < ms) requestAnimationFrame(step);
				else { player.run = false; res(Math.abs((dir === 'up' || dir === 'down' ? player.ty : player.tx) - startAxis)); }
			};
			step();
		});
	}
	// Test Realm: load the account, greet the player, begin presence
	if (MP_ON) {
		S.mpAccount = MP.cachedState() || await MP.freshState();
		hud.textContent = `${world.current.map.name || startMap}  ·  ${S.mpAccount?.username || ''} (${S.mpAccount?.friendCode || '……'})`;
		// adaptive presence: ~450ms when someone shares the map (minimal
		// latency for side-by-side screens), ~1.8s when roaming alone
		// the 450ms cadence is only worth paying when someone is actually watching
		// this player move — co-located AND mid-step. Standing still next to a friend
		// is still just one beat every BEAT_FLOOR_MS.
		const beatLoop = () => (document.hidden ? Promise.resolve() : heartbeat())
			.finally(() => setTimeout(beatLoop, (coLocated() && player.moving) ? 450 : 1800));
		// POLL CADENCE. Every call is a Cloudflare function request, and the free plan
		// allows 100,000 a day. Presence used to poll every ~1.4s and challenges every
		// 2s whatever was happening: ~4,000 requests an hour per open tab, which ran
		// the quota out every evening and took logins and saves down with it. Now:
		//   * a hidden tab polls nothing (it only re-checks on a timer, no request);
		//   * presence is fast only while a friend shares the map or you're visiting,
		//     ~10s while a friend is online elsewhere, 30s when nobody is;
		//   * challenges poll every 10s, 2s only while waiting on a sent challenge;
		//   * failures back off (x2 per consecutive failure, up to 60s).
		const backoff = ms => Math.min(60_000, ms * 2 ** Math.min(pollHealth.fails, 5));
		const presDelay = () => document.hidden ? 30_000
			: coLocated() ? 400 : backoff(S.friends.some(f => f.online) ? 10_000 : 30_000);
		const presLoop = () => (document.hidden ? Promise.resolve() : pollPresence())
			.finally(() => setTimeout(presLoop, presDelay()));
		const chalLoop = () => (document.hidden ? Promise.resolve() : pollChallenges())
			.finally(() => setTimeout(chalLoop, document.hidden ? 30_000 : pendingChallengeTo ? 2000 : backoff(10_000)));
		beatLoop();
		presLoop();
		chalLoop();
		// back in view: catch up at once rather than waiting out a hidden-tab timer
		document.addEventListener('visibilitychange', () => { if (!document.hidden) { pollPresence(); pollChallenges(); heartbeat(true); } });
		refreshMail(); // seed the MAIL badge, then keep it fresh at a gentle cadence
		setInterval(() => { if (!document.hidden) refreshMail(); }, 45_000);   // hidden tabs poll nothing
		syncOverworldAchievements(); // backfill existing progress into the account for the achievements page
		// Grand Champion catch-up: a save already 3x champion before this shipped gets the
		// crown + capstone on load (silent — a cutscene mid-boot would be risky)
		if (Quest.SHARED.every(r => Badges.isChampion(r)) && !Story.getFlag('grand_champion')) {
			grantGrandChampionReward();
			hud.textContent = 'GRAND CHAMPION of all three regions! A GOLD TROPHY awaits in your BAG.';
		}
		claimGifts(); // anything the owner sent this account, applied on arrival
		claimTradeDeliveries(); // trade counterparts and returns come home, exactly once each
		// arriving from the standalone inbox: ?battle=<id> drops us straight into a
		// freshly-accepted match (no "rejoin?" prompt); ?watch=<id> enters a friend's
		// match read-only as a spectator (the server gates it to friends of a player)
		const qp = new URLSearchParams(location.search);
		const directBattle = qp.get('battle'), watchBattle = qp.get('watch'), watchFactory = qp.get('watchfactory');
		if (watchFactory) factorySpec.start(watchFactory, () => { if (window.history.length > 1) window.history.back(); else location.href = '/overworld/?mp=1'; });
		else if (watchBattle) enterMatch(watchBattle, true);
		else if (directBattle) enterMatch(directBattle, false);
		else checkRejoin();
	}
	window.__ow = { world, player, warpTo, moveToMap, npcs, encounters, battle, trainers, dialog, cutscene, evolution, items, tmMoveId, catchUpPostBattleScriptsForTest: catchUpPostBattleScripts, cutsceneCtxForTest: () => cutsceneCtx(), canLearn, pcMenu, get fade() { return fade; }, get weatherFx() { return weatherFx; }, get stepFx() { return stepFx; }, mapWeatherNow, get party() { return S.party; }, get menuUi() { return S.menuUi; }, menuTap, pumpPlayer, freezeLoop, startWildBattle, interact, gateReport, openCanvasMenus, whiteOut, noteHealPoint, healPoint,
		get owSync() { return owSyncLog; }, owSnapshot, owFingerprint, hydrateOw,
		pushOwForTest: () => pushOw(), owDirtyForTest: () => owDirty(), owRevForTest: () => owRev(),
		get startMenu() { return startMenu; }, get cardsMenu() { return cardsMenu; }, get runMenu() { return runMenu; }, get friendsMenu() { return friendsMenu; },
		get friends() { return S.friends; }, get visiting() { return S.visiting; }, refreshFriends, visitWorld, leaveVisit, heartbeat, pollPresence, get ghosts() { return ghosts; }, MP_ON,
		get pvp() { return pvp; }, pvpParty, sendChallenge, enterMatch, pollChallenges, get pending() { return pendingChallengeTo; },
		get mailMenu() { return mailMenu; }, get mailWaiting() { return S.mailWaiting; }, refreshMail, sendMailChallenge, mailAccept, enterAsyncMatch,
		Dex, get dexMenu() { return dexMenu; }, get trainerCard() { return trainerCard; }, get partyMenu() { return partyMenu; }, get shopMenu() { return shopMenu; }, get bagMenu() { return bagMenu; }, Bag,
		Fly, get townMap() { return townMap; }, openTownMap, flyTo, hasFlyPoint, markFlyPoint, Clock,
		Trades, get tradeMenu() { return tradeMenu; }, startNpcTrade,
		Daycare, get daycareMenu() { return daycareMenu; }, get nameRater() { return nameRater; }, get halfParty() { return halfParty; }, get moveShop() { return moveShop; },
		openDaycare, openNameRater, openMoveShop, setNickname, relearnable,
		Settings, get optionsMenu() { return optionsMenu; },
		Journal, Savefile, runSaveAction, loadBackups, restoreBackup, OPTION_ACTIONS, OPTION_KEYS, OW_KEYS, repelWoreOff, setRepel, drawOptions,
		Contest, get contestMenu() { return contestMenu; }, get blendMenu() { return blendMenu; }, contestKey, blendKey, drawContest, drawBlend, contestProgress, blendBerries,
		get bugContest() { return bugContest; }, bugOfficerTalk, bugContestCatch, bugContestRoll, bugScore, endBugContest, isBugDay,
		trickState, trickWarp, trickScrollFind, trickMasterTalk, trickEndTalk, Slide, get slideMenu() { return slideMenu; }, openRuinsPuzzle, slideKey, drawSlide,
		shoalTide, shoalWarp, shoalDig, shoalHermitTalk, kurtTalk, roamState, roamersOnMapChange, roamerHere, startRoamerBattle, roamerEnd, ROAMERS, ROAM_ROUTES,
		myBase, saveMyBase, baseSpotKey, baseRoomFor, secretSpotInteract, enterBase, baseDecoInteract, get baseCtx() { return S.baseCtx; }, set baseCtx(v) { S.baseCtx = v; },
		get decoMenu() { return decoMenu; }, decoKey, drawDecoMenu, drawBaseDeco, DECO_ITEMS,
		get socialMenu() { return socialMenu; }, socialKey, drawSocial, openTradeOffer, openTradeInbox, sendTradeOffer, acceptTrade, declineTrade, claimTradeDeliveries,
		friendsKey, drawFriendsMenu, refreshFriendBadges, friendAction,
		KEY_ACTIONS, get keyBinds() { return S.keyBinds; }, translateKey, assignKeyBind, optionsKey,
		Slots, get slotsMenu() { return slotsMenu; }, slotsKey, drawSlots,
		get hillRun() { return S.hillRun; }, set hillRun(v) { S.hillRun = v; }, hillReceptionTalk, hillPrizeTalk, hillWarp, hillPrepFloor, hillGuardAt, startHillBattle, hillGuardsLeft, HILL_FLOORS,
		miscEvents, museumBackfill, museumPaintTalk, museumCuratorTalk, drawMuseum, ruinsWordTalk, fossilPick, fossilUnderpassTalk, fossilManiacTalk, generatorTalk, MUSEUM_PAINTINGS, FOSSIL_MONS,
		useGadget, HM_FIELD, dexList, dexKey, HEADBUTT_MAPS, HEADBUTT_SETS,
		toggleBike, bikeShopTalk, glassBlowerTalk, silphDoorsApply, silphDoorAt, SILPH_DOORS, get fluteState() { return S.fluteState; }, set fluteState(v) { S.fluteState = v; },
		momTalk, MOM_SCRIPTS, drawWaterAnim,
		Story, get cutscene() { return cutscene; }, startCutscene, npcById, maybeIntroCutscene, starterMenu,
		runScriptLabel, checkCoordTrigger, checkOnFrame, cutsceneCtx, syncStoryVars, seedCrystalEvents,
		postgameObjective, postgameLog, legendStats, shopStockNow, services, pickupCheck, mapWeatherNow,
	get safariState() { return safari; }, checkSafariGate, endSafari,
	gcMenu, vfMenu, VFlip, gcKey, vfKey,
	bgmNow, syncMapBgm, battleThemeKey, bgmGame, get musicMap() { return musicMap; },
	persistBattle, resumeSavedBattle, wildBattleEnd, get mapScripts() { return S.mapScripts; }, get mapStrings() { return mapStrings; }, get signTexts() { return signTexts; },
		get trainerTeams() { return S.trainerTeams; }, seedStoryState, startScriptedBattle,
		checkLegendaryTrigger, startLegendaryBattle, LEGENDARY_ENCOUNTERS, legendaryHere, legendariesHere,
		toggleBike, diveTo, HM_FIELD, useFieldMove, openPartyAction, fieldMovesOf,
		Badges, onTrainerDefeated, leagueGateMessage, playerRegion, drawTrainerCard, TIER_REWARDS, grantTierReward,
		badgeSprite, badgeGhost,
		touchHud, startItems, get heldKeys() { return heldKeys; }, FERRY_DESTS, LEGENDARY_ENCOUNTERS,
		BAG_POCKETS, bagEntries, offerNickname, Settings, formsOf, cycleForm,
		inJohKanto, wildEncounterLevel, routeTrainerLevel, scaleLegendaryLevel, levelCapNow, gymLevelFor, badgeSliceFor, mapIsUnlit, useFieldMove,
		levelCapNow, levelCapHint, refreshLevelCap,
		// the map editor maps screen pixels back to tiles, so it needs the same
		// camera and logical view size the renderer uses
		cameraPos, viewSize: () => [VIEW_W, VIEW_H], editView,
		// load a map for editing. Reuses moveToMap (the tested load path, which
		// also refreshes NPCs/items) — the player it repositions is hidden and
		// frozen in edit mode, so it's only ever a bookmark.
		editLoadMap: file => moveToMap(file),
		grantTierReward, showTierRewardDialog, TIER_REWARDS, applyGymLevelFloors, TIER_LEVEL_FLOOR,
		grantGrandChampionReward, grandChampionFinale,
		Quest, get questMenu() { return questMenu; }, refreshObjective, drawQuest, drawTownMap, todoRows, THINGS_TO_DO, questKey, shinyOwnedCount, dexAll, dexFilterLabel, shareTrainerCard,
		checkVillainTrigger, startVillainBattle, completeVillainBeat,
		checkRivalTrigger, startRivalEncounter, RIVAL_TIERS, rivalDue,
	checkAwakeningTrigger, drawAwakening, AWAKENING_SCENES, awState, blockers,
		portals, get portalMenu() { return portalMenu; }, travelPortal, maybePortalTutorial, Quest_globalTier: Quest.globalTier,
	Frontier, get frontier() { return frontier; }, startFrontierChallenge, startFacility, FACILITY_LOBBIES,
	get bpShopMenu() { return bpShopMenu; }, openBpShop, bpShopKey,
	factorySnapshot, get factorySpec() { return factorySpec; }, get frontierWatchers() { return frontierWatchers; },
		overworldSummary, syncOverworldAchievements,
		beginNewGame, startIntroNarration, checkIntroTrigger, openStarterPick, finishStarterPick, NEW_GAME_INTRO,
		get starterMenu() { return starterMenu; }, drawStarterMenu,
		STORY_SEED, PLOT_ONESHOT, PLOT_BLOCKED, plotBlocked, get firedPlot() { return loadFiredPlot(); }, markPlotFired,
		openRadio, radioKey, drawRadio, get radioMenu() { return radioMenu; }, get radioTune() { return S.radioTune; }, playerTID, tidStr, oakTalkText, buenaText, luckyText,
		openUnownDex, unownDexKey, drawUnownDex, get unownDex() { return unownDex; }, rollUnownLetter, unownIdFor, allRuinsSolved, UNOWN_ORDER,
		refreshFollower, setFollowerSpecies, get follower() { return follower; }, followSheet, followMini, followCache, drawFollower };
	requestAnimationFrame(tick);
	// owner tooling: ?spritetune=1 mounts the battle-sprite tuning overlay for
	// the mgibbie account only — the username is verified SERVER-side (the
	// 'state' action derives it from the token), so a spoofed localStorage
	// state doesn't pass. Feedback goes through an on-screen toast, NOT the
	// hud — the hud line is display:none on touch devices, which made every
	// gate/mount failure look like "nothing happened" on phones.
	if (new URLSearchParams(location.search).has('spritetune')) {
		const note = t => {
			const d = document.createElement('div');
			d.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:300;max-width:88vw;'
				+ 'background:rgba(20,15,34,0.95);color:#ffd25f;border:1px solid #6a5f8a;border-radius:10px;'
				+ 'padding:10px 16px;font:13px "Segoe UI",sans-serif;text-align:center;';
			d.textContent = t;
			document.body.appendChild(d);
			setTimeout(() => d.remove(), 8000);
		};
		MP.call('state').then(r => {
			if ((r?.state?.username || '') !== 'mgibbie') { note('The Sprite Tuner is an owner tool.'); return; }
			return import('./spritetune.js').then(m => m.mount(window.__ow));
		}).catch(e => { console.warn('spritetune failed', e); note('Sprite Tuner failed to start: ' + String(e?.message || e).slice(0, 80) + ' — reload to retry'); });
	}
	// owner tooling: ?mapedit=1 mounts the tile editor. Same server-verified gate
	// as the sprite tuner — the module is only fetched once the token's username
	// checks out, so a spoofed localStorage state gets nothing.
	if (new URLSearchParams(location.search).has('mapedit')) {
		const note = t => {
			const d = document.createElement('div');
			d.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:300;max-width:88vw;'
				+ 'background:rgba(20,15,34,0.95);color:#ffd25f;border:1px solid #6a5f8a;border-radius:10px;'
				+ 'padding:10px 16px;font:13px "Segoe UI",sans-serif;text-align:center;';
			d.textContent = t;
			document.body.appendChild(d);
			setTimeout(() => d.remove(), 8000);
		};
		MP.call('state').then(r => {
			if ((r?.state?.username || '') !== 'mgibbie') { note('The Map Editor is an owner tool.'); return; }
			return import('./mapedit.js').then(m => { window.__mapedit = m.mount(window.__ow); });
		}).catch(e => { console.warn('mapedit failed', e); note('Map Editor failed to start: ' + String(e?.message || e).slice(0, 80) + ' — reload to retry'); });
	}
	// owner tooling: ?followtest=1 mounts the follower-sprite previewer (cycle the
	// trailing follower through the AI-generated walk sheets). Same server-verified
	// owner gate as the sprite tuner / map editor.
	if (new URLSearchParams(location.search).has('followtest')) {
		const note = t => {
			const d = document.createElement('div');
			d.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:300;max-width:88vw;'
				+ 'background:rgba(20,15,34,0.95);color:#ffd25f;border:1px solid #6a5f8a;border-radius:10px;'
				+ 'padding:10px 16px;font:13px "Segoe UI",sans-serif;text-align:center;';
			d.textContent = t;
			document.body.appendChild(d);
			setTimeout(() => d.remove(), 8000);
		};
		MP.call('state').then(r => {
			if ((r?.state?.username || '') !== 'mgibbie') { note('The Follower Test is an owner tool.'); return; }
			return import('./followtest.js').then(m => { window.__followtest = m.mount(window.__ow); });
		}).catch(e => { console.warn('followtest failed', e); note('Follower Test failed to start: ' + String(e?.message || e).slice(0, 80) + ' — reload to retry'); });
	}
	// The MAIL badge ("MAIL (2)") only counted after you opened the mailbox — the
	// one thing a your-move indicator must not require. Populate it at boot and
	// keep it fresh; play-by-mail is fully built and was just invisible.
	try { refreshMail(); setInterval(() => { if (!document.hidden) refreshMail(); }, 120000); } catch (e) { /* logged out */ }
	// keep the server copy of starter/region/position current (deduped ~every 10s + when you leave)
	try {
		// TIER 3 — 10s was chosen when a missed write meant lost progress. The
		// revision (#505/#506) removed that: local stays authoritative until the
		// server acknowledges, so a longer cadence costs nothing but staleness on
		// OTHER devices. The unload write still fires on pagehide/visibilitychange.
		setInterval(() => pushOw(), 30000);
		// keepalive lets the last write outlive the page: a plain fetch started in
		// pagehide is cancelled when the tab/app is torn down, which on mobile is the
		// normal way a session ends. Correctness no longer depends on it landing —
		// the revision keeps local authoritative until it does — but it shrinks the
		// window where ANOTHER device would see a stale copy.
		document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushOw({ keepalive: true }); });
		window.addEventListener('pagehide', () => pushOw({ keepalive: true }));
	} catch (e) { /* best-effort */ }
	// standalone mini-game: warp to the Battle Factory (moveToMap is the safe path)
	// and drop straight into a run
	if (S.factoryStandalone) {
		hud.textContent = 'BATTLE FACTORY';
		if (!S.party) S.party = Frontier.genTeam(battle.data, 50, 1); // throwaway lead (guards)
		moveToMap('BattleFrontier_BattleFactoryLobby').then(() => {
			dialog.open('BATTLE FACTORY\n\nYou’ll be lent a team of RENTAL POKeMON.\nWin battles back-to-back to earn BP!\n\nZ = Begin', () => startFacility('factory'));
		});
	}
})();
