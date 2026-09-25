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

function startTrainerBattle(t, foeParty, info) {
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
function badgeSliceFor(region) {
	if (region === 'KANTO' && /^MAP_JOHKANTO/.test(world.current?.map?.id || '')) return 'JOHKANTO';
	return region;
}

// If `script` is an Elite Four/Champion battle and the player is short of that
// region's 8 badges, returns the block message; otherwise null (battle proceeds).
function leagueGateMessage(script) {
	const info = Badges.scriptInfo(script);
	if (!info || (info.kind !== 'elite' && info.kind !== 'champion')) return null;
	const need = Badges.badgesUntilLeague(info.region);
	if (need <= 0) return null;
	return `The POKeMON LEAGUE is only open to trainers who\nhave earned all 8 badges.\n\nYou still need ${need} more.`;
}

// ---------- cross-region tier rewards ----------
// Clearing gym N in the LAST of the three regions advances the shared tier (globalTier);
// that milestone grants a scaling reward, once per tier. Items are all real bag.js ids.
const TIER_REWARDS = {
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
function grantTierReward(tier) {
	if (Story.getFlag('tier_reward_' + tier)) return null;
	Story.setFlag('tier_reward_' + tier);
	const r = TIER_REWARDS[tier];
	if (!r) return null;
	if (r.money) Bag.earn(r.money);
	for (const [id, n] of (r.items || [])) Bag.addItem(id, n);
	syncOverworldAchievements(); // the tier milestone feeds the profile achievements
	return r.label;
}
function showTierRewardDialog(tier) {
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
function grantGrandChampionReward() {
	if (Story.getFlag('grand_champion')) return false;
	Story.setFlag('grand_champion');
	Bag.earn(50000);
	Bag.addItem('rarecandy', 3);
	Bag.addItem('maxrevive', 3);
	Bag.addItem('goldtrophy', 1); Bag.registerName('goldtrophy', 'GOLD TROPHY');
	syncOverworldAchievements(); // surfaces the Grand Champion achievement on the profile
	return true;
}
function grandChampionFinale(cb) {
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
const TIER_LEVEL_FLOOR = Badges.TIER_LEVEL_FLOOR;

// ---------- level cap ----------
// Capped at the tier you have cleared in EVERY region at once, so you cannot
// out-level the world by racing one region ahead. Recomputed rather than stored:
// it is a pure function of the badges you hold.
export function levelCapNow() { return Badges.levelCap(Quest.globalTier()); }
// keep the battle engine's clamp in step with the badges (boot + every badge)
function refreshLevelCap() { battle.levelCap = levelCapNow(); return battle.levelCap; }
// which regions are holding the cap down, phrased for a dialog
function levelCapHint() {
	const tier = Quest.globalTier();
	if (tier >= 8) return 'Every gym in all three regions is behind you — the cap is off.';
	const behind = Quest.laggingRegions().map(r => r[0] + r.slice(1).toLowerCase());
	const nth = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'][tier];
	return `Beat the ${nth} gym in ${behind.join(' and ')} to raise it to Lv${Badges.nextLevelCap(tier)}.`;
}
function applyGymLevelFloors() {
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

function runPostBattleScript(script, t, keyOverride) {
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
function repairSaves() {
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


// ---------- water animation ----------
// The map renders ONCE into cached canvases, so water sat frozen in every
// region. This re-draws each visible surfable tile from that cache with a
// GB-style 1px horizontal wobble (4 phases, wrap-around slices) — the sea
// moves again without any new art. Drawn after the bottom layer and before
// the top, so bridges stay above the ripple.
const WATER_PHASE = [0, 1, 0, -1];
export function drawWaterAnim(ctx, camX, camY, forceOff) {
	const cur = world.current;
	const src = cur?.canvases?.bottom;
	const lay = cur?.layout;
	if (!src || !lay) return;
	const off = forceOff !== undefined ? forceOff : WATER_PHASE[Math.floor(performance.now() / 280) % 4];
	if (off === 0) return; // the cached frame IS phase zero
	const x0 = Math.max(0, Math.floor(camX / META)), y0 = Math.max(0, Math.floor(camY / META));
	const x1 = Math.min(lay.width - 1, x0 + Math.ceil(VIEW_W / META) + 1);
	const y1 = Math.min(lay.height - 1, y0 + Math.ceil(VIEW_H / META) + 1);
	for (let ty = y0; ty <= y1; ty++) {
		for (let tx = x0; tx <= x1; tx++) {
			if (!world.isSurfable(tx, ty)) continue;
			const sx = tx * META, sy = ty * META, dx = tx * META - camX, dy = ty * META - camY;
			if (off > 0) {
				ctx.drawImage(src, sx, sy, META - off, META, dx + off, dy, META - off, META);
				ctx.drawImage(src, sx + META - off, sy, off, META, dx, dy, off, META);
			} else {
				const o = -off;
				ctx.drawImage(src, sx + o, sy, META - o, META, dx, dy, META - o, META);
				ctx.drawImage(src, sx, sy, o, META, dx + META - o, dy, o, META);
			}
		}
	}
}

// MOM, in every region's player house: a warm word and a full heal
export const MOM_SCRIPTS = new Set(['MomScript', 'PalletTown_PlayersHouse_1F_EventScript_Mom', 'PlayersHouse_1F_EventScript_Mom']);
export function momTalk() {
	const hurt = (S.party || []).some(m => m && (m.curHP < m.maxHP || m.status || (m.moves || []).some(mv => mv.pp < mv.maxPp)));
	if (!hurt) {
		dialog.open('MOM: Oh, hi! Your POKeMON look happy\nand healthy to me. Off you go —\nand take care of each other!');
		return;
	}
	dialog.open('MOM: Welcome home! Goodness, you all look\nworn out. Let me look after your POKeMON\nfor a moment...\n\n. . . . .\n\nThere! Rested and raring to go!', () => {
		sfx('heal');
		healParty(S.party);
		saveParty(S.party);
		noteHealPoint();   // MOM's is a resting place too — wake up here if you black out
	});
}

// canonical service buildings (talk to the NPC inside to use the service)
export const DAYCARE_MAPS = new Set(['MAP_DAY_CARE', 'MAP_ROUTE5_POKEMON_DAY_CARE',
	'MAP_ROUTE117_POKEMON_DAY_CARE', 'MAP_FOUR_ISLAND_POKEMON_DAY_CARE']);
export const NAMERATER_MAPS = new Set(['MAP_GOLDENROD_NAME_RATER', 'MAP_JOHKANTO_LAVENDER_NAME_RATER',
	'MAP_SLATEPORT_CITY_NAME_RATERS_HOUSE']);
export const DELETER_MAPS = new Set(['MAP_MOVE_DELETERS_HOUSE', 'MAP_LILYCOVE_CITY_MOVE_DELETERS_HOUSE']);

export const partyMenu = { open: false, idx: 0, summary: false, action: null, swapFrom: null, moveSwap: null };
export const startMenu = { open: false, idx: 0 };
export const questMenu = { open: false, idx: 0, page: 0 }; // page 0 = quest log, 1 = THINGS TO DO
// THINGS TO DO — the discovery checklist (Batch 6). Whole subsystems shipped as
// reachable content that nothing ever pointed you at: contests, the Ruins, secret
// bases, the Frontier, apricorns, Dive... This surfaces them with a where-to-start
// hint and a live state ([x] done, [>] available now, [ ] locked/where-to-unlock).
// `done`/`avail` are optional predicates read at draw time; default avail = true.
export const THINGS_TO_DO = [
	{ label: 'BUG-CATCHING CONTEST', where: 'National Park gate (Johto) — Tue/Thu/Sat', avail: () => isBugDay() },
	{ label: 'POKeMON CONTESTS', where: 'Lilycove Contest Hall (Hoenn)', done: () => Object.values(contestProgress().ranks || {}).some(v => v > 0) },
	{ label: 'THE RUINS OF ALPH', where: 'Solve the sliding tile puzzles (Johto)', done: () => allRuinsSolved() },
	{ label: 'UNOWN DEX', where: 'Catch every Unown letter in the Ruins (Johto)', done: () => Dex.unownCount() >= 28 },
	{ label: 'APRICORNS & KURT', where: 'Pick apricorns on Routes 37/42, see Kurt in Azalea (Johto)' },
	{ label: 'THE RADIO', where: 'Tune in to a radio in any Johto house' },
	{ label: 'SECRET BASE', where: 'SECRET POWER on a tree, rock or cave wall (Hoenn)', done: () => !!myBase() },
	{ label: 'HEADBUTT TREES', where: 'Use HEADBUTT on a leafy tree for hidden POKeMON' },
	{ label: 'DIVE SPOTS', where: 'DIVE on deep water — Route 128 / Sootopolis (Hoenn)' },
	{ label: 'THE SAFARI ZONE', where: 'Fuchsia City (Kanto) / Route 121 (Hoenn)' },
	{ label: 'GAME CORNER', where: 'Voltorb Flip — Celadon / Goldenrod' },
	{ label: 'TRAINER HILL', where: 'Climb for the best time (Hoenn)' },
	{ label: 'SHOAL CAVE', where: 'Time the tides for shells & a Shell Bell (Hoenn)' },
	{ label: 'BATTLE FRONTIER', where: 'Battle facilities for BP (Hoenn)', done: () => Frontier.getBP() > 0 || Frontier.bestStreak() > 0 },
	{ label: 'ASYNC TRADES', where: 'Send & accept trade offers via the FRIENDS menu' },
];
export function todoRows() {
	return THINGS_TO_DO.map(t => {
		let mark = '[ ] ';
		try { mark = t.done?.() ? '[x] ' : (t.avail ? (t.avail() ? '[>] ' : '[ ] ') : '[>] '); } catch (e) { mark = '[>] '; }
		return `${mark}${t.label} — ${t.where}`;
	});
}
// walk-up-and-talk: press Z facing another player's sprite to challenge or trade
export const playerMenu = { open: false, idx: 0, target: null };
export const PLAYER_MENU_ITEMS = ['POKeMON BATTLE', 'MAIL BATTLE', 'CARD BATTLE', 'TRADE', 'CANCEL'];
// deck-selection phase before a card duel: pick which class deck to bring
export const deckSelect = { open: false, idx: 0, decks: [], onPick: null, prompt: '' };
// RuneScape-style two-party trade window
export const TRADE_CATS = ['CARDS', 'PACKS', 'POKeMON', 'ITEMS'];
export const trade = {
	open: false, id: null, role: null, them: 'PLAYER',   // role 'a' = requester, 'b' = accepter
	mine: null, theirs: null, myAccept: false, theirAccept: false,
	done: false, applied: false, cat: 0, idx: 0, rows: [], poll: null, status: '',
};
export const emptyOffer = () => ({ cards: {}, packs: 0, pokemon: [], items: [] });
// the username of a friend-ghost currently standing on tile (tx,ty), or null
export function ghostAt(tx, ty) {
	for (const [name, g] of ghosts) {
		if (Math.round(g.px / META) === tx && Math.round(g.py / META) === ty) return name;
	}
	return null;
}
export const cardsMenu = { open: false, idx: 0 };
export const runMenu = { open: false, idx: 0 };
export const dexMenu = { open: false, idx: 0, detail: false, list: null };
export const trainerCard = { open: false, page: 0 }; // page 0 = the card, 1 = the adventure JOURNAL
export const townMap = { open: false, region: 0, idx: 0 };
// mode 'backups' lists the server's automatic daily saves; list is fetched lazily
export const optionsMenu = { open: false, idx: 0, mode: 'main', list: null, flash: null, busy: false };
// battleAnim was in Settings.OPTIONS but never listed here — the setting existed
// with no way to reach it
export const OPTION_KEYS = ['textSpeed', 'bgmVol', 'sfxVol', 'autoRun', 'dayNight', 'followers', 'battleAnim'];
// rows below the settings: save-data actions, not cyclable values
export const OPTION_ACTIONS = [
	{ id: 'export', label: 'EXPORT SAVE', hint: 'Download your game as a file' },
	{ id: 'import', label: 'IMPORT SAVE', hint: 'Restore a downloaded save file' },
	{ id: 'backups', label: 'BACKUPS', hint: 'Restore an automatic daily backup' },
	{ id: 'controls', label: 'CONTROLS', hint: 'See every shortcut and rebind the single keys' },
];
// ---------- leave-and-resume for battles ----------
// Hitting the gear (or closing the tab) mid-battle used to vaporize the fight
// AND its ending — a rival or gym win that never landed its flags broke
// progression for good. The battle now persists like a dungeon run: a
// serializable snapshot (battle.snapshot) plus an endSpec tag naming which
// ending to rebuild, written every ~1.5s while a resumable battle runs and on
// pagehide, consumed at boot.
const BATTLE_SAVE_KEY = 'magepunk_battle_v1';
let battleSaveAt = 0, battleSaveDirty = false;
export function persistBattle() {
	const resumable = battle.blocking && battle.active && battle.endSpec && !pvp.blocking && !frontier.active;
	if (resumable) {
		const now = performance.now();
		if (now - battleSaveAt < 1500) return;
		battleSaveAt = now;   // even a failed attempt waits — a throwing snapshot must not spin every frame
		try {
			const snap = battle.snapshot();
			if (!snap) return;
			safeSave(BATTLE_SAVE_KEY, { v: 1, snap, end: battle.endSpec, map: world.current.name });
			saveParty(S.party);   // the party's mid-battle HP/PP must match the snapshot
			battleSaveDirty = true;
		} catch (e) { console.warn('[battle-save] snapshot failed', e); }
	} else if (battleSaveDirty && !battle.blocking) {
		battleSaveDirty = false;
		try { localStorage.removeItem(BATTLE_SAVE_KEY); } catch (e) { /* storage gone */ }
	}
}
addEventListener('pagehide', () => { battleSaveAt = 0; persistBattle(); });
addEventListener('beforeunload', () => { battleSaveAt = 0; persistBattle(); });

// rebuild the right battle-ending from its serialized tag. Everything here
// mirrors a live call site; anything unreconstructable degrades safely.
function resumeEndHandler(end, savedMap) {
	const kind = end?.kind || 'wild';
	if (kind === 'roamer' && end.roamer) return roamerEnd(end.roamer);
	if (kind === 'legendary') return result => {
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(S.party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			Story.setFlag(end.flag);
			syncOverworldAchievements();
		} else if (result === 'victory') {
			Story.setFlag(end.flag);
			evolution.check(S.party, battle.data);
		} else if (result === 'defeat') {
			whiteOut();
		} else saveParty(S.party);
	};
	if (kind === 'trainer') return result => {
		if (result === 'victory') {
			const t = trainers.list.find(x => x.ev?.script === end.script);
			if (t) trainers.markDefeated(t);
			// paid by battle.awardPrize() when the restored battle announces it, which
			// also picks up an AMULET COIN the pre-battle endSpec snapshot could not know about
			saveParty(S.party);
			if (end.script) onTrainerDefeated(end.script);
			evolution.check(S.party, battle.data);
			runPostBattleScript(end.script, t);    // ...and after a reload, too
		} else if (result === 'defeat') {
			whiteOut();
		}
	};
	if (kind === 'strainer') return result => {
		// the blocking cutscene is gone after a reload; land the flags, skip the speech
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			const t = trainers.list.find(x => x.ev?.script === end.script);
			if (t) trainers.markDefeated(t);
			saveParty(S.party);
			if (end.script) onTrainerDefeated(end.script, { silent: true });
		} else {
			Story.setVar('VAR_RESULT', 0);
			if (result === 'defeat') whiteOut();
		}
	};
	// the Space Center multi battle: its script is gone after a reload, so a win
	// replays the "defeated Maxie + Tabitha" scene itself (it sets the story state)
	if (kind === 'spacecenter') return result => {
		S.multiPicks = null;
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			S.lastBattleOutcome = B_OUTCOME_WON;
			saveParty(S.party);
			runScriptLabel('MossdeepCity_SpaceCenter_2F_EventScript_DefeatedMaxieTabitha');
		} else {
			Story.setVar('VAR_RESULT', 2);
			if (result === 'defeat') whiteOut();
		}
	};
	if (kind === 'villain') return result => {
		if (result === 'victory') {
			const beat = Quest.beatAt(end.region, savedMap);
			if (beat) completeVillainBeat(end.region, beat);
		} else { healParty(S.party); saveParty(S.party); }
	};
	if (kind === 'rivaltier') return result => {
		Story.setFlag(rivalFlag(end.tier));
		if (result !== 'victory') healParty(S.party);
		saveParty(S.party);
	};
	if (kind === 'rivalintro') return result => {
		if (result !== 'victory') healParty(S.party);
		saveParty(S.party);
		afterRival(end.region);
	};
	return result => wildBattleEnd(result, !!(safari.on && safariZoneOf(world.current?.map?.id)));
}

function resumeSavedBattle() {
	const saved = safeLoad(BATTLE_SAVE_KEY, null);
	if (!saved || !saved.snap || !S.party) return false;
	try { localStorage.removeItem(BATTLE_SAVE_KEY); } catch (e) {}   // consume: a crash must not loop
	const snap = saved.snap;
	const onEnd = resumeEndHandler(saved.end, saved.map);
	battle.endSpec = saved.end || { kind: 'wild' };
	battleSaveDirty = true;   // re-arms the tick, which re-saves while it runs
	// a multi battle ran on a VIEW of the party (the picked mons); resume on the same one
	const side = saved.end?.kind === 'spacecenter'
		? (saved.end.picks || []).map(i => S.party[i]).filter(Boolean)
		: S.party;
	if (snap.isTrainer) battle.startTrainer(side, snap.foes, snap.info, onEnd, { restore: snap });
	else battle.start(S.party, snap.foe.speciesId, snap.foe.level, onEnd, null,
		{ restore: snap, safari: snap.safari && safari.on ? safari : null });
	hud.textContent = 'Resuming the battle...';
	return true;
}

// ---------- background music ----------
// music_map.json: mapId -> bgm file key (tools/gen_bgm.mjs — the accurate
// per-map songs from Crystal/FireRed/Emerald). Loaded lazily; until it lands
// the world is simply quiet, exactly as it was before music existed.
//
// On top of the map track sit the OVERRIDES, watched every frame by bgmTick:
// battles pick the source game's battle theme (wild/trainer/gym/evil/rival/
// champion/legendary — Crystal even keeps its separate KANTO set for JohKanto
// and its night-wild variant), and surfing/biking play the field themes.
// When an override ends, the map track restarts from the top — exactly what
// the cartridges do.
let musicMap = null;
const BATTLE_THEMES = {
	crystal: {
		wild: 'crystal_MUSIC_JOHTO_WILD_BATTLE', wildNight: 'crystal_MUSIC_JOHTO_WILD_BATTLE_NIGHT',
		trainer: 'crystal_MUSIC_JOHTO_TRAINER_BATTLE', gym: 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE',
		kantoWild: 'crystal_MUSIC_KANTO_WILD_BATTLE', kantoTrainer: 'crystal_MUSIC_KANTO_TRAINER_BATTLE',
		kantoGym: 'crystal_MUSIC_KANTO_GYM_LEADER_BATTLE',
		// GSC's Elite Four ride the gym-leader theme; only the Champion differs
		elite: 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE',
		champion: 'crystal_MUSIC_CHAMPION_BATTLE', rival: 'crystal_MUSIC_RIVAL_BATTLE',
		evil: 'crystal_MUSIC_ROCKET_BATTLE', evilboss: 'crystal_MUSIC_ROCKET_BATTLE',
		legendary: 'crystal_MUSIC_SUICUNE_BATTLE', regi: 'crystal_MUSIC_SUICUNE_BATTLE',
		surf: 'crystal_MUSIC_SURF', bike: 'crystal_MUSIC_BICYCLE',
	},
	firered: {
		wild: 'firered_MUS_VS_WILD', trainer: 'firered_MUS_VS_TRAINER',
		gym: 'firered_MUS_VS_GYM_LEADER', elite: 'firered_MUS_VS_GYM_LEADER',
		champion: 'firered_MUS_VS_CHAMPION',
		// FR gives rockets and the mid-game rival plain trainer music — authentic
		rival: 'firered_MUS_VS_TRAINER', evil: 'firered_MUS_VS_TRAINER', evilboss: 'firered_MUS_VS_TRAINER',
		legendary: 'firered_MUS_VS_LEGEND', regi: 'firered_MUS_VS_LEGEND',
		surf: 'firered_MUS_SURF', bike: 'firered_MUS_CYCLING',
	},
	emerald: {
		wild: 'emerald_MUS_VS_WILD', trainer: 'emerald_MUS_VS_TRAINER',
		gym: 'emerald_MUS_VS_GYM_LEADER', elite: 'emerald_MUS_VS_ELITE_FOUR',
		champion: 'emerald_MUS_VS_CHAMPION', rival: 'emerald_MUS_VS_RIVAL',
		evil: 'emerald_MUS_VS_AQUA_MAGMA', evilboss: 'emerald_MUS_VS_AQUA_MAGMA_LEADER',
		legendary: 'emerald_MUS_VS_KYOGRE_GROUDON', regi: 'emerald_MUS_VS_REGI',
		surf: 'emerald_MUS_SURF', bike: 'emerald_MUS_CYCLING',
	},
};
// which game's soundtrack governs here: the map's own track says; a map with
// no music falls back to the region
function bgmGame() {
	const k = musicMap?.[world.current?.map?.id];
	if (k) return k.split('_')[0];
	const r = playerRegion();
	return r === 'KANTO' ? 'firered' : r === 'HOENN' ? 'emerald' : 'crystal';
}
function battleThemeKey(a) {
	const T = BATTLE_THEMES[bgmGame()] || BATTLE_THEMES.crystal;
	const jk = bgmGame() === 'crystal' && (world.current?.map?.id || '').startsWith('MAP_JOHKANTO');
	if (!a.isTrainer) {
		if (battle.themeHint === 'regi') return T.regi;
		if (battle.themeHint === 'legendary') return T.legendary;
		if (jk) return T.kantoWild;
		if (T.wildNight && Clock.phase() === 'night') return T.wildNight;
		return T.wild;
	}
	const n = a.info?.displayName || '';
	if (/Champion/i.test(n)) return T.champion;
	if (/Elite Four/i.test(n)) return T.elite;
	if (/Aqua Leader|Magma Leader|Giovanni/i.test(n)) return T.evilboss;
	if (/Rocket|Team Aqua|Team Magma|Aqua |Magma |Grunt/i.test(n)) return T.evil;
	if (/Rival/i.test(n)) return T.rival;
	if (/^(Gym )?Leader\b/i.test(n)) return jk ? T.kantoGym : T.gym;
	return jk ? T.kantoTrainer : T.trainer;
}
let bgmWant = null;
export function bgmTick() {
	if (!musicMap) return;
	let want;
	if (battle.blocking) {
		const a = battle.active;
		if (!a) return;                        // sprites still loading — hold the current track
		want = battleThemeKey(a);
	} else {
		battle.themeHint = null;               // any finished battle clears its hint
		const T = BATTLE_THEMES[bgmGame()];
		want = (contestMenu.open && contestMenu.st) ? 'emerald_MUS_CONTEST' // the stage theme carries the appeal round
			: S.radioTune ? S.radioTune                // a tuned-in radio takes over the room's music
			: player.surfing ? T?.surf
			: player.biking ? T?.bike
			: (musicMap[world.current?.map?.id] || null);
	}
	if (want !== bgmWant) { bgmWant = want; bgm(want); }
}
export function syncMapBgm() { bgmTick(); }
getJSON('data/music_map.json').then(m => { musicMap = m || {}; syncMapBgm(); }).catch(() => { musicMap = {}; });
getJSON('data/contest.json').then(d => Contest.init(d)).catch(() => Contest.init(null));

export function optionsKey(k) {
	const om = optionsMenu;
	if (om.mode === 'controls') {
		if (om.capture) return; // the raw keydown listener owns the capture
		const rows = KEY_ACTIONS.length + 2; // + RESET ALL + BACK
		if (k === 'ArrowUp') om.idx = (om.idx + rows - 1) % rows;
		if (k === 'ArrowDown') om.idx = (om.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { om.mode = 'main'; om.idx = OPTION_KEYS.length + 3; om.flash = null; return; }
		if (k !== 'z' && k !== 'Enter') return;
		if (om.idx === KEY_ACTIONS.length) { // RESET ALL
			S.keyBinds = {}; safeSave(KEYBIND_KEY, S.keyBinds);
			om.flash = 'Every key is back to its default.';
			sfx('ui_select');
			return;
		}
		if (om.idx > KEY_ACTIONS.length) { om.mode = 'main'; om.idx = OPTION_KEYS.length + 3; om.flash = null; return; }
		om.capture = KEY_ACTIONS[om.idx].id;
		om.flash = null;
		return;
	}
	if (om.mode === 'backups') {
		const rows = (om.list || []).length + 1; // + BACK
		if (k === 'ArrowUp') om.idx = (om.idx + rows - 1) % rows;
		if (k === 'ArrowDown') om.idx = (om.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { om.mode = 'main'; om.idx = 0; om.flash = null; }
		if (k === 'z' || k === 'Enter') {
			if (om.idx >= (om.list || []).length) { om.mode = 'main'; om.idx = 0; om.flash = null; }
			else restoreBackup(om.list[om.idx]);
		}
		return;
	}
	const total = OPTION_KEYS.length + OPTION_ACTIONS.length;
	if (k === 'ArrowUp') om.idx = (om.idx + total - 1) % total;
	if (k === 'ArrowDown') om.idx = (om.idx + 1) % total;
	const act = OPTION_ACTIONS[om.idx - OPTION_KEYS.length];
	if (act) {
		if (k === 'z' || k === 'Enter') runSaveAction(act.id);
	} else {
		if (k === 'ArrowLeft') { Settings.cycle(OPTION_KEYS[om.idx], -1); syncBgmVolume(); }
		if (k === 'ArrowRight' || k === 'z' || k === 'Enter') { Settings.cycle(OPTION_KEYS[om.idx], 1); syncBgmVolume(); }
	}
	if (k === 'x' || k === 'Escape') { om.open = false; om.flash = null; }
}
export const daycareMenu = { open: false, mode: 'main', idx: 0, flash: null };
// in-game NPC trade: the offer, then a party picker (see trades.js)
export const tradeMenu = { open: false, trade: null, idx: 0, flash: null, talker: null };
export const nameRater = { open: false, idx: 0 };
// ChooseHalfPartyForBattle: pick up to 3 for a multi battle, in order
export const halfParty = { open: false, idx: 0, picked: [], flash: null };
export const moveShop = { open: false, mode: 'main', idx: 0, mon: null, list: null, flash: null };

export function openDaycare() { daycareMenu.open = true; daycareMenu.mode = 'main'; daycareMenu.idx = 0; daycareMenu.flash = null; }
export function openNameRater() { nameRater.open = true; nameRater.idx = 0; }
// Runs UNDER the paused script (the special returns 'wait'); VAR_RESULT is 1 on
// confirm, 0 on cancel — the script loops back to its prompt on 0.
export const halfPartyNeed = () => Math.min(3, (S.party || []).filter(m => m.curHP > 0).length);
export function openHalfParty() {
	if (!halfPartyNeed()) { Story.setVar('VAR_RESULT', 0); return; }
	Object.assign(halfParty, { open: true, idx: 0, picked: [], flash: null });
	return 'wait';
}
function closeHalfParty(ok) {
	halfParty.open = false;
	Story.setVar('VAR_RESULT', ok ? 1 : 0);
	if (!ok) halfParty.picked = [];
	cutscene.resume();
}
export function halfPartyKey(k) {
	const n = S.party.length + 1;   // the mons, then BATTLE
	if (k === 'ArrowUp') halfParty.idx = (halfParty.idx + n - 1) % n;
	if (k === 'ArrowDown') halfParty.idx = (halfParty.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { closeHalfParty(false); return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (halfParty.idx === S.party.length) {
		const need = halfPartyNeed();
		if (halfParty.picked.length === need) closeHalfParty(true);
		else halfParty.flash = `Choose ${need} POKeMON.`;
		return;
	}
	const i = halfParty.idx, mon = S.party[i];
	const at = halfParty.picked.indexOf(i);
	if (at >= 0) { halfParty.picked.splice(at, 1); halfParty.flash = null; return; }
	if (!mon || mon.curHP <= 0) { halfParty.flash = `${mon?.name || 'It'} can't battle.`; return; }
	if (halfParty.picked.length >= halfPartyNeed()) { halfParty.flash = 'Three are already chosen.'; return; }
	halfParty.picked.push(i);
	halfParty.flash = null;
	if (halfParty.picked.length === halfPartyNeed()) halfParty.idx = S.party.length;   // hop to BATTLE
}
export function openMoveShop() { moveShop.open = true; moveShop.mode = 'main'; moveShop.idx = 0; moveShop.mon = null; moveShop.flash = null; }

// open the Town Map to the region of the current map (or the first visited one)
export function openTownMap() {
	townMap.open = true;
	townMap.idx = 0;
	townMap.flash = null;
	const here = world.current?.map?.id;
	const reg = Fly.REGION_OF[here] || 'kanto';
	townMap.region = Math.max(0, Fly.REGION_ORDER.indexOf(reg));
	// select the current town if we're standing on one
	const towns = Fly.FLY[Fly.REGION_ORDER[townMap.region]];
	const at = towns.findIndex(t => t.map === here);
	if (at >= 0) townMap.idx = at;
}

export function townKey(k) {
	const region = Fly.REGION_ORDER[townMap.region];
	const towns = Fly.FLY[region];
	if (k === 'ArrowLeft') { townMap.region = (townMap.region + Fly.REGION_ORDER.length - 1) % Fly.REGION_ORDER.length; townMap.idx = 0; return; }
	if (k === 'ArrowRight') { townMap.region = (townMap.region + 1) % Fly.REGION_ORDER.length; townMap.idx = 0; return; }
	if (k === 'ArrowUp') { townMap.idx = (townMap.idx + towns.length - 1) % towns.length; return; }
	if (k === 'ArrowDown') { townMap.idx = (townMap.idx + 1) % towns.length; return; }
	if (k === 'x' || k === 'Escape') { townMap.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const t = towns[townMap.idx];
		if (!hasFlyPoint(t.map)) { townMap.flash = "You haven't visited there yet."; return; }
		if (world.current?.map?.id === t.map) { townMap.flash = "You're already here!"; return; }
		townMap.open = false;
		dialog.open(`Fly to ${t.name}?`, (declined) => {
			if (declined !== 'x') flyTo(t.map, t.x, t.y);
		});
	}
}

// ---- daycare ----
// dynamic action list for the daycare front desk
export function daycareOptions() {
	const st = Daycare.get();
	const opts = [];
	st.slots.forEach((m, i) => {
		if (m) {
			const info = Daycare.withdrawInfo(i, battle.data, levelCapNow());
			// say when the cap, not the Day Care, is what stopped them growing
			const capNote = info.capped ? ' — LEVEL CAP' : '';
			opts.push({ label: `Take back ${m.name} (Lv${info.from}→${info.to}, $${info.cost})${capNote}`, act: 'withdraw', slot: i });
		}
	});
	if (Daycare.hasReadyEgg()) opts.push({ label: 'Collect the EGG!', act: 'egg' });
	if (Daycare.canDeposit() && S.party.length > 1) opts.push({ label: 'Leave a POKeMON', act: 'deposit' });
	opts.push({ label: 'See you later', act: 'leave' });
	return opts;
}
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


// ---------- follower (lead POKeMON walks behind you, HG/SS style) ----------
// 4x4 walk sheet from data/pokemon_follow/<id>.png: rows down/left/right/up,
// cols = walk frames. It trails onto whatever tile the player just vacated.
const followCache = new Map();
function followSheet(id) {
	if (!id) return null;
	// fakemon (negative dex numbers) have no dedicated follower sheet — always fall
	// back to the battle-sprite mini. Also cache-proofs the removed AI sheets: even
	// if a stale CDN copy of data/pokemon_follow/<fakemon>.png lingers, we never load it.
	if ((battle.data?.species?.[id]?.num || 0) < 0) { if (followCache.get(id) !== 'none') followCache.set(id, 'none'); return null; }
	if (!followCache.has(id)) {
		followCache.set(id, null);
		getImage(`data/pokemon_follow/${id}.png`).then(img => followCache.set(id, img)).catch(() => {
			// a FORM falls back to its base species' walk sheet
			// (aegislash_blade -> aegislash); 'none' marks the search exhausted
			const base = id.includes('_') ? id.split('_')[0] : null;
			if (base) getImage(`data/pokemon_follow/${base}.png`).then(img => followCache.set(id, img)).catch(() => followCache.set(id, 'none'));
			else followCache.set(id, 'none');
		});
	}
	const v = followCache.get(id);
	return v === 'none' ? null : v;
}
// 855 species (the Ransei fakemon + the newest dex) have no walk sheet at all:
// their battle sprite trots along as a bobbing mini instead of vanishing
const followMiniCache = new Map();
function followMini(id) {
	if (!followMiniCache.has(id)) {
		followMiniCache.set(id, null);
		const sp = battle.data.species[id];
		if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => followMiniCache.set(id, img)).catch(() => {});
	}
	return followMiniCache.get(id);
}
// a crisp, pre-shrunk mini for fakemon followers. A battle sprite is 64–256px; a
// single nearest-neighbour shrink to ~20px aliased it to mush. This box-downscales
// in halving steps at high quality (the standard way to shrink detailed art),
// caches the result canvas, and the follower draws it 1:1 — much cleaner.
const MINI_PX = 20; // a touch over a grid square (META 16) — more detail, still tile-ish
const miniCvCache = new Map();
function followMiniCanvas(id) {
	if (miniCvCache.has(id)) return miniCvCache.get(id);
	const src = followMini(id);
	if (!src || !src.width) return null;              // still loading — retry next frame (not cached)
	let cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height;
	let cx = cv.getContext('2d'); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
	cx.drawImage(src, 0, 0);
	while (Math.max(cv.width, cv.height) > MINI_PX * 2) {   // halve until within 2x of target
		const nw = Math.max(1, Math.round(cv.width / 2)), nh = Math.max(1, Math.round(cv.height / 2));
		const nc = document.createElement('canvas'); nc.width = nw; nc.height = nh;
		const ncx = nc.getContext('2d'); ncx.imageSmoothingEnabled = true; ncx.imageSmoothingQuality = 'high';
		ncx.drawImage(cv, 0, 0, nw, nh); cv = nc;
	}
	const s = MINI_PX / Math.max(cv.width, cv.height);
	const fw = Math.max(1, Math.round(cv.width * s)), fh = Math.max(1, Math.round(cv.height * s));
	const fc = document.createElement('canvas'); fc.width = fw; fc.height = fh;
	const fcx = fc.getContext('2d'); fcx.imageSmoothingEnabled = true; fcx.imageSmoothingQuality = 'high';
	fcx.drawImage(cv, 0, 0, fw, fh);
	// crisp it: the smooth shrink leaves a soft semi-transparent edge halo that
	// looks blurry once the frame is nearest-upscaled. Snap alpha to hard on/off so
	// the silhouette reads sharp (canvas is CORS-clean, so getImageData works).
	try {
		const im = fcx.getImageData(0, 0, fw, fh), d = im.data;
		for (let p = 3; p < d.length; p += 4) d[p] = d[p] >= 96 ? 255 : 0;
		fcx.putImageData(im, 0, 0);
	} catch (e) { /* tainted (no CORS) — keep the smooth version */ }
	miniCvCache.set(id, fc);
	return fc;
}
const FOLLOW_ROW = { down: 0, left: 1, right: 2, up: 3 };
export let follower = null;
let lastPlayerTile = null;
export function refreshFollower() {
	follower = null;
	lastPlayerTile = { x: player.tx, y: player.ty };
	if (!Settings.get('followers') || !S.party) return;
	const lead = S.party.find(m => m.curHP > 0) || S.party[0];
	if (!lead || !lead.speciesId) return;
	follower = { id: lead.speciesId, tx: player.tx, ty: player.ty, px: player.tx * META, py: player.ty * META,
		facing: player.facing, moving: false, from: null, to: null, t: 0, dur: 0.13, step: 0 };
}
// force a follower of ANY species, independent of the party — the owner
// follower-test tool must preview sprites even on a save with no party (which is
// why refreshFollower(), which builds from the party lead, made no follower).
function setFollowerSpecies(id) {
	if (!id) { follower = null; return; }
	follower = { id, tx: player.tx, ty: player.ty, px: player.tx * META, py: player.ty * META,
		facing: player.facing, moving: false, from: null, to: null, t: 0, dur: 0.13, step: 0 };
	lastPlayerTile = { x: player.tx, y: player.ty };
}
function stepFollower(tx, ty) {
	if (!follower) return;
	if (follower.tx === tx && follower.ty === ty) return;
	if (follower.moving) { follower.px = follower.to[0]; follower.py = follower.to[1]; follower.tx = Math.round(follower.px / META); follower.ty = Math.round(follower.py / META); }
	const dx = tx - follower.tx, dy = ty - follower.ty;
	follower.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
	follower.from = [follower.px, follower.py];
	follower.to = [tx * META, ty * META];
	follower.tx = tx; follower.ty = ty; follower.moving = true; follower.t = 0;
	follower.step ^= 1;
	// keep pace with a running/biking player
	follower.dur = player.biking ? 0.07 : player.run ? 0.08 : 0.13;
}
export function updateFollower(dt) {
	if (!Settings.get('followers')) { follower = null; return; }
	if (!follower) { if (S.party) refreshFollower(); return; }
	// the player moved onto a new tile — trail onto the one they left
	if (lastPlayerTile && (player.tx !== lastPlayerTile.x || player.ty !== lastPlayerTile.y)) {
		stepFollower(lastPlayerTile.x, lastPlayerTile.y);
		lastPlayerTile = { x: player.tx, y: player.ty };
	}
	if (follower.moving) {
		follower.t += dt / follower.dur;
		if (follower.t >= 1) { follower.px = follower.to[0]; follower.py = follower.to[1]; follower.moving = false; }
		else { follower.px = follower.from[0] + (follower.to[0] - follower.from[0]) * follower.t; follower.py = follower.from[1] + (follower.to[1] - follower.from[1]) * follower.t; }
	}
}
export function drawFollower(ctx, camX, camY) {
	if (!follower || player.surfing) return;
	const img = followSheet(follower.id);
	if (!img) {
		if (followCache.get(follower.id) !== 'none') return; // sheets still loading
		const mini = followMiniCanvas(follower.id);          // pre-shrunk, crisp (see followMiniCanvas)
		if (!mini) return;
		const w = mini.width, h = mini.height;               // already at final size — draw 1:1
		const bob = follower.moving && follower.step ? -1 : 0;
		const mx = Math.round(follower.px + META / 2 - w / 2 - camX);
		const my = Math.round(follower.py + META - h - camY + bob);
		ctx.imageSmoothingEnabled = false;
		if (follower.facing === 'right') {          // mirror the single sprite to face the way it's walking
			ctx.save();
			ctx.translate(mx + w, my); ctx.scale(-1, 1);
			ctx.drawImage(mini, 0, 0);
			ctx.restore();
		} else {
			ctx.drawImage(mini, mx, my);
		}
		return;
	}
	const fs = img.width / 4;                 // 4 columns
	const col = follower.moving ? (follower.step ? 1 : 3) : 0;
	const row = FOLLOW_ROW[follower.facing] ?? 0;
	const dw = 26, dh = 26;                    // a touch bigger than a tile
	const dx = Math.round(follower.px + META / 2 - dw / 2 - camX);
	const dy = Math.round(follower.py + META - dh - camY);
	ctx.drawImage(img, col * fs, row * fs, fs, fs, dx, dy, dw, dh);
}
// all un-caught, requirement-met legendaries on the current map (a map may hold
// several, e.g. the Tin Tower beasts — stored as an array)
export function legendariesHere() {
	const v = LEGENDARY_ENCOUNTERS[world.current.map.id];
	if (!v) return [];
	return (Array.isArray(v) ? v : [v]).filter(e => !Story.getFlag(e.flag) && (!e.requires || e.requires()));
}
export function legendaryHere() { return legendariesHere()[0] || null; } // the first (single-per-map back-compat)
export function startLegendaryBattle(e) {
	if (!S.party || !leadMon(S.party) || battle.blocking) return;
	Dex.markSeen(e.species);
	dialog.open(e.intro, () => {
		battle.themeHint = /^regi(rock|ce|steel)/.test(e.species) ? 'regi' : 'legendary';
		battle.endSpec = { kind: 'legendary', species: e.species, flag: e.flag };
		battle.start(S.party, e.species, scaleLegendaryLevel(e.level), result => {
			if (result === 'caught' && battle.lastCaught) {
				Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
				const where = addCaught(S.party, battle.lastCaught);
				hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
				offerNickname(battle.lastCaught);
				Story.setFlag(e.flag);
				syncOverworldAchievements(); // a legendary was CAUGHT (only catches count toward the sets)
			} else if (result === 'victory') {
				Story.setFlag(e.flag); // fainted it — it won't reappear (matches the games)
				evolution.check(S.party, battle.data);
			} else if (result === 'defeat') {
				whiteOut();
			} else {
				saveParty(S.party); // ran / fled: leave it catchable
			}
		});
	});
}
// on-arrive: standing on a legendary's tile starts that encounter
export function checkLegendaryTrigger() {
	const e = legendariesHere().find(x => player.tx === x.x && player.ty === x.y);
	if (e) { startLegendaryBattle(e); return true; }
	return false;
}

// the Ransei rift pool: imported fakemon (dex num <= 0) with usable learnsets
let riftPool = null;
function riftSpecies() {
	if (!riftPool) {
		riftPool = Object.entries(battle.data.species)
			.filter(([, s]) => (s.num || 0) <= 0 && s.learnset?.length)
			.map(([id]) => id);
	}
	return riftPool.length ? riftPool[Math.floor(Math.random() * riftPool.length)] : null;
}

// pokédex milestones: grant newly crossed rewards with a fanfare
export function dexMilestoneCheck() {
	const won = Dex.claimMilestones();
	if (won.length) {
		for (const m of won) Bag.addItem(m.item, m.count);
		dialog.open('POKeDEX MILESTONE!\n\n' + won.map(m => `${m.t} caught — you received ${m.label}!`).join('\n'));
	}
	// catching ALL the placed legendaries is its own summit — checked here
	// because every catch path already funnels through this function
	if (!Story.getFlag('all_legends_caught')) {
		const { caught, total } = legendStats();
		if (total > 0 && caught >= total) {
			Story.setFlag('all_legends_caught');
			Bag.addItem('legendcharm', 1); Bag.registerName('legendcharm', 'LEGEND CHARM');
			Bag.addItem('masterball', 3);
			if (!dialog.blocking) dialog.open(`Every legendary POKeMON — all ${total} — is yours.\n\nYou received the LEGEND CHARM and 3 MASTER BALLS!`);
			syncOverworldAchievements();
		}
	}
}

// ---------- ambient weather ----------
// The in-battle weather engine has been complete for ages; nothing ever handed
// it an ENVIRONMENTAL value, so Hoenn's desert and rainforest routes began every
// fight in clear skies. Endless (Infinity turns) — moves and abilities overwrite
// it with their own timed spells as usual. Emerald's canonical weather routes,
// plus hail on the Mt Silver climb (its Gen-4 identity).
const MAP_WEATHER = {
	MAP_ROUTE111: 'sandstorm',   // the Hoenn desert
	MAP_ROUTE113: 'ash',         // volcanic ashfall from Mt Chimney
	MAP_ROUTE119: 'rain',        // the rain belt
	MAP_ROUTE120: 'rain',
	MAP_ROUTE123: 'rain',
	MAP_SILVER_CAVE_OUTSIDE: 'hail',
};
export function mapWeatherNow() { return MAP_WEATHER[world.current?.map?.id] || null; }
// which visual battle STAGE this encounter happens on — the battle can't see the
// overworld, so we hand it a { terrain, night } derived from the current map.
// Terrain drives the backdrop + platform (battle.js drawStage/drawSide).
function battleStageNow() {
	let terrain = 'grass';
	const m = world.current?.map || {};
	const t = m.map_type || '', id = m.id || '';
	if (player.surfing) terrain = 'water';
	else if (t === 'MAP_TYPE_UNDERGROUND') terrain = 'cave';
	else if (t === 'MAP_TYPE_INDOOR') terrain = 'indoor';
	else if (/DESERT|SAND|BEACH/.test(id)) terrain = 'sand';
	else if (/FOREST|WOODS|ILEX/.test(id)) terrain = 'forest';
	else if (/CITY|TOWN/.test(id)) terrain = 'city';
	let night = false; try { night = Clock.phase() === 'night'; } catch (e) { /* clock optional */ }
	return { terrain, night };
}
battle.stageOf = battleStageNow; // battle.js reads this at start()/startTrainer()

// last position on an outdoor map — DIG's exit point. Updated on every map
// entry (refreshMapContent), so stepping into a cave remembers the doorstep.
// ---------- blacking out ----------
// Where you wake up after losing. Recorded at a POKeMON CENTER nurse (and at
// MOM's, which heals the same way), persisted so it survives a reload, and
// falling back to the region's home town for a save that has never healed.
const HEAL_KEY = 'magepunk_healpoint_v1';
export function noteHealPoint() {
	safeSave(HEAL_KEY, {
		map: world.current.name, x: player.tx, y: player.ty,
		name: world.current.map?.name || world.current.name,
	});
}
function healPoint() {
	const hp = safeLoad(HEAL_KEY, null);
	if (hp && hp.map) return hp;
	const home = Quest.START[playerRegion()];
	return home ? { map: home, x: null, y: null, name: home } : null;
}
// Losing every POKeMON: heal, pay the toll, and wake up at the last centre.
// ONE shared path — nine battle-end handlers each just called healParty() in
// place, which is why losing cost nothing and left you standing where you fell.
// Facility runs (Trainer Hill, the Frontier) deliberately do NOT come here: a
// facility loss ends the run, it does not black you out.
const WHITEOUT_MONEY_FRACTION = 2;   // you lose 1/this of your money (the Gen 1-2 rule)
export function whiteOut() {
	const lost = Math.floor(Bag.getMoney() / WHITEOUT_MONEY_FRACTION);
	if (lost > 0) Bag.spend(lost);
	healParty(S.party);
	saveParty(S.party);
	const hp = healPoint();
	const where = hp && hp.name ? hp.name : 'the last POKeMON CENTER';
	const lines = ['You have no POKeMON that can fight!', '', 'You scurried back to ' + where + '...'];
	if (lost > 0) lines.push('', 'You panicked and dropped $' + lost.toLocaleString() + '.');
	dialog.open(lines.join('\n'), () => {
		if (!hp) { hud.textContent = 'Party healed.'; return; }
		if (hp.x == null) moveToMap(hp.map); else moveToMap(hp.map, hp.x, hp.y);
	});
}

export let lastOutdoor = null;
function noteOutdoor() {
	const t = world.current?.map?.map_type || '';
	if (t !== 'MAP_TYPE_INDOOR' && t !== 'MAP_TYPE_UNDERGROUND' && !world.current?.map?.indoor) {
		lastOutdoor = { map: world.current.name, x: player.tx, y: player.ty };
	}
}

// PICKUP afield: after a wild win, an idle-handed Pickup mon may scoop something
// up — the classic free-items loop, previously battle-only ability text.
const PICKUP_TABLE = ['potion', 'superpotion', 'pokeball', 'greatball', 'ultraball',
	'oranberry', 'sitrusberry', 'revive', 'fullheal', 'rarecandy'];
function pickupCheck() {
	for (const mon of S.party || []) {
		if (!mon || mon.curHP <= 0 || mon.ability !== 'pickup' || mon.heldItem) continue;
		if (Math.random() >= 0.1) continue;
		const id = PICKUP_TABLE[Math.floor(Math.random() * PICKUP_TABLE.length)];
		mon.heldItem = id;
		hud.textContent = `${mon.name} picked up a ${Bag.ITEMS[id].name}!`;
		saveParty(S.party);
		break;    // one find per battle, like the cartridge
	}
}

// ---------- SAFARI GAME ----------
// The Safari Zones shipped as plain routes: normal battles, no fee, no balls,
// no step meter. Real safari rules now — pay at the door, 30 SAFARI BALLS,
// 600 steps, catch-only battles (battle.js safariBall/Bait/Rock). The session
// persists so a reload mid-game resumes it.
const SAFARI_ZONES = {
	// FireRed's four areas (NORTH was de-dup-renamed KANTO_) enter via Fuchsia
	MAP_SAFARI_ZONE_CENTER: 'fr', MAP_SAFARI_ZONE_EAST: 'fr',
	MAP_SAFARI_ZONE_WEST: 'fr', MAP_KANTO_SAFARI_ZONE_NORTH: 'fr',
	// Emerald's six areas enter via Route 121
	MAP_SAFARI_ZONE_NORTH: 'hoenn', MAP_SAFARI_ZONE_SOUTH: 'hoenn',
	MAP_SAFARI_ZONE_SOUTHWEST: 'hoenn', MAP_SAFARI_ZONE_SOUTHEAST: 'hoenn',
	MAP_SAFARI_ZONE_NORTHWEST: 'hoenn', MAP_SAFARI_ZONE_NORTHEAST: 'hoenn',
};
const SAFARI_GATES = { fr: 'MAP_FUCHSIA_CITY_SAFARI_ZONE_ENTRANCE', hoenn: 'MAP_ROUTE121_SAFARI_ZONE_ENTRANCE' };
const SAFARI_FEE = 500, SAFARI_BALLS = 30, SAFARI_STEPS = 600;
export let safari = safeLoad('magepunk_safari_v1', null) || { on: false, zone: null, balls: 0, steps: 0 };
export function safariZoneOf(mapId) { return SAFARI_ZONES[mapId] || null; }
export function saveSafari() { safeSave('magepunk_safari_v1', safari); }
export function endSafari(reason) {
	const zone = safari.zone;
	safari = { on: false, zone: null, balls: 0, steps: 0 };
	saveSafari();
	if (reason) dialog.open(reason, () => { if (zone) warpTo(SAFARI_GATES[zone], 0); });
}
// on every map entry: offer the game at the zone's doorstep, or end a running
// game the moment the player is neither in a play area nor a zone rest house
function checkSafariGate() {
	const id = world.current?.map?.id || '';
	const zone = safariZoneOf(id);
	if (zone && !safari.on) {
		if (cutscene.blocking || dialog.blocking) return;
		dialog.open(`PA: Welcome to the SAFARI GAME!\n$${SAFARI_FEE} buys ${SAFARI_BALLS} SAFARI BALLS and ${SAFARI_STEPS} steps.\n\nZ = Play    X = Walk back out`, key => {
			if (key === 'x') { warpTo(SAFARI_GATES[zone], 0); return; }
			if (!Bag.spend(SAFARI_FEE)) {
				dialog.open("PA: You can't afford the entry fee...", () => warpTo(SAFARI_GATES[zone], 0));
				return;
			}
			safari = { on: true, zone, balls: SAFARI_BALLS, steps: SAFARI_STEPS };
			saveSafari();
			hud.textContent = `SAFARI GAME start! ${SAFARI_BALLS} balls, ${SAFARI_STEPS} steps.`;
		});
	} else if (safari.on && !zone && !/REST_HOUSE|SECRET_HOUSE/.test(id)) {
		// walked out through a gate (or flew away): the game ends quietly
		endSafari(null);
		hud.textContent = 'PA: Thanks for playing the SAFARI GAME!';
	}
}

export function startWildBattle(pick, forceDouble) {
	if (!S.party || !leadMon(S.party)) return;
	// a wild Unown always rolled as the base "unown" (letter A) because no other
	// letter had a species entry. Now each letter is its own species, so pick one
	// at random — A..Z always, and ! / ? once every Ruins puzzle is solved.
	if (pick.id === 'unown') pick = { ...pick, id: rollUnownLetter() };
	// RANSEI RIFT (post-Champion): a slice of wild encounters tears open into
	// the imported fakemon — the only place they appear in the wild
	if (Math.random() < 0.05 && Badges.isChampion?.(playerRegion())) {
		const rift = riftSpecies();
		if (rift) {
			pick = { id: rift, level: pick.level };
			hud.textContent = 'The air crackles — a rift tears open!';
		}
	}
	// JohKanto scales its wilds to the party (wildEncounterLevel). The scaler is
	// region-guarded itself, so this is a no-op everywhere else.
	pick = { ...pick, level: wildEncounterLevel(pick.level) };
	Dex.markSeen(pick.id);
	// SAFARI GAME encounters run catch-only against the LIVE session object
	// (battle.js burns its balls in place); hordes never spawn there
	const inSafari = !!(safari.on && safariZoneOf(world.current.map.id));
	// a slice of grass encounters are horde-style double battles
	const second = !inSafari && (forceDouble || Math.random() < 0.1)
		&& S.party.filter(m => m.curHP > 0).length >= 2
		? encounters.pick(world.current.map.id) : null;
	if (second) Dex.markSeen(second.id);
	battle.endSpec = { kind: 'wild' };
	// special-ball context: how we ran into it (LURE BALL) + dex ownership (REPEAT BALL)
	const catchCtx = { method: pick.method || (player.surfing ? 'surf' : 'walk'), owns: id => Dex.isCaught(id) };
	battle.start(S.party, pick.id, pick.level, result => wildBattleEnd(result, inSafari),
		second, { weather: mapWeatherNow(), safari: inSafari ? safari : null, catchCtx });
}

// the standard wild-battle ending — shared by live battles and RESUMED ones
// (a battle abandoned by leaving the page reconstructs this from its endSpec)
function wildBattleEnd(result, inSafari) {
	if (result === 'defeat') {
		whiteOut();
	} else if (result === 'caught' && battle.lastCaught) {
		// during the Bug-Catching Contest the catch becomes the single kept
		// entry — it joins the party at the judging, not here
		if (!bugContestCatch(battle.lastCaught)) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(S.party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
		}
	} else {
		saveParty(S.party);
	}
	if (result === 'victory') { evolution.check(S.party, battle.data); pickupCheck(); }
	if (inSafari) {
		saveSafari();   // the battle burned balls on the shared session
		if (safari.balls <= 0) endSafari('PA: You are out of SAFARI BALLS! Your SAFARI GAME is over!');
	}
}

// ---------- museum paintings, ruins words, fossils, New Mauville ----------
// Small one-shot venue events, remembered together in magepunk_events_v1.
const EVENTS_KEY = 'magepunk_events_v1';
export function miscEvents() { return safeLoad(EVENTS_KEY, {}); }
export function saveMiscEvents(e) { safeSave(EVENTS_KEY, e); }

// LILYCOVE MUSEUM 2F — the contest capstone: winning a MASTER rank hangs
// your Pokémon's portrait in its category's frame (recorded at the win;
// older master ribbons on party mons backfill on sight).
const MUSEUM_PAINTINGS = {
	cool: [[2, 6], [3, 6]], beauty: [[10, 6], [11, 6]], cute: [[18, 6], [19, 6]],
	smart: [[6, 10], [7, 10]], tough: [[14, 10], [15, 10]],
};
function museumBackfill() {
	const p = contestProgress();
	p.paintings = p.paintings || {};
	let changed = false;
	for (const cat of CATS) {
		if (p.paintings[cat]) continue;
		const holder = (S.party || []).find(m => (m.ribbons || []).includes(`${cat}-master`));
		if (holder) { p.paintings[cat] = { species: holder.speciesId, name: holder.nickname || holder.name }; changed = true; }
	}
	if (changed) safeSave(CONTEST_KEY, p);
	return p.paintings;
}
export function museumPaintTalk(fx, fy) {
	const cat = Object.keys(MUSEUM_PAINTINGS).find(c => MUSEUM_PAINTINGS[c].some(([x, y]) => x === fx && y === fy));
	if (!cat) return;
	const paintings = museumBackfill();
	const art = paintings[cat];
	if (art) {
		const sp = battle.data.species[art.species];
		dialog.open(`"${art.name}" — a masterpiece portrait of the\n${cat.toUpperCase()} MASTER RANK champion.\n\nThe ${(sp?.name || art.species).toUpperCase()} seems to glow with pride.`);
	} else {
		dialog.open(`An empty frame, waiting.\n\nA small card reads: "Reserved for the next\n${cat.toUpperCase()} CONTEST MASTER RANK champion."`);
	}
}
export function museumCuratorTalk() {
	const n = Object.keys(museumBackfill()).length;
	dialog.open(n >= 5
		? 'CURATOR: All five frames filled... you have given\nthis gallery its golden age. Thank you!'
		: `CURATOR: This floor honors CONTEST champions.\n${n} of 5 frames hold a masterpiece so far.\n\nWin a MASTER RANK contest and the artist will\npaint your POKeMON for the gallery!`);
}
// the hung portraits, drawn over the 2F frames
export function drawMuseum(ctx, camX, camY) {
	if (world.current?.name !== 'LilycoveCity_LilycoveMuseum_2F') return;
	const paintings = contestProgress().paintings || {};
	for (const [cat, tiles] of Object.entries(MUSEUM_PAINTINGS)) {
		const art = paintings[cat];
		if (!art) continue;
		const img = contestSpriteFor(art.species);
		if (!img) continue;
		const [x0, y0] = tiles[0];
		const s = Math.min(26 / img.width, 26 / img.height);
		const w = img.width * s, h = img.height * s;
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(img, (x0 + 1) * META - w / 2 - camX, y0 * META - h + 10 - camY, w, h);
	}
}

// RUINS OF ALPH word rooms — the ancient inscriptions, plus a one-time find
const WORD_ROOMS = {
	RuinsOfAlphKabutoWordRoom: ['kabuto', '"THE SEA PARTED AND CARRIED OUR FRIENDS AWAY."'],
	RuinsOfAlphOmanyteWordRoom: ['omanyte', '"WE SPIRAL DOWN WHERE THE OLD TIDE SLEEPS."'],
	RuinsOfAlphAerodactylWordRoom: ['aerodactyl', '"ONCE THE SKY ITSELF THUNDERED WITH WINGS."'],
	RuinsOfAlphHoOhWordRoom: ['hooh', '"LIGHT DESCENDS ON WINGS OF SEVEN COLORS."'],
};
export function ruinsWordTalk() {
	const entry = WORD_ROOMS[world.current?.name];
	if (!entry) return;
	const [key, text] = entry;
	const ev = miscEvents();
	ev.words = ev.words || {};
	if (ev.words[key]) { dialog.open(`The ancient script crawls across the wall:\n\n${text}`); return; }
	ev.words[key] = 1;
	saveMiscEvents(ev);
	Bag.addItem('starpiece', 1);
	sfx('item_get');
	dialog.open(`The ancient script crawls across the wall:\n\n${text}\n\nSomething glitters in a crack below —\na STAR PIECE!`);
}

// MIRAGE TOWER: take ONE fossil and the other sinks with the tower's rumble —
// it resurfaces in the DESERT UNDERPASS. The FOSSIL MANIAC revives any fossil.
export function fossilPick(which) {
	const ev = miscEvents();
	if (ev.mirage) { dialog.open('Only crumbled sandstone remains here.'); return; }
	const id = which === 'root' ? 'rootfossil' : 'clawfossil';
	ev.mirage = which;
	saveMiscEvents(ev);
	Bag.addItem(id, 1);
	sfx('item_get');
	Journal.add(`Pried the ${Bag.ITEMS[id].name} from Mirage Tower!`);
	dialog.open(`You pried out the ${Bag.ITEMS[id].name}!\n\nThe tower GROANS — sand pours from the walls,\nand the other fossil sinks out of sight...`);
}
export function fossilUnderpassTalk() {
	const ev = miscEvents();
	if (!ev.mirage) { dialog.open('A fossil is embedded deep in the rock.\nIt won\'t budge... yet.'); return; }
	if (ev.underpass) { dialog.open('The rock face is bare now.'); return; }
	const id = ev.mirage === 'root' ? 'clawfossil' : 'rootfossil';
	ev.underpass = true;
	saveMiscEvents(ev);
	Bag.addItem(id, 1);
	sfx('item_get');
	dialog.open(`The fossil that sank with MIRAGE TOWER —\nwashed down into the underpass!\n\nYou found the ${Bag.ITEMS[id].name}!`);
}
const FOSSIL_MONS = { rootfossil: 'lileep', clawfossil: 'anorith', helixfossil: 'omanyte', domefossil: 'kabuto', oldamber: 'aerodactyl' };
export function fossilManiacTalk() {
	const held = Object.keys(FOSSIL_MONS).find(id => Bag.count(id) > 0);
	if (!held) {
		dialog.open('FOSSIL MANIAC: Fossils! FOSSILS! I can wake the\nold life sleeping inside one — bring me any\nfossil you dig up!');
		return;
	}
	const species = FOSSIL_MONS[held];
	const name = (battle.data.species[species]?.name || species).toUpperCase();
	dialog.open(`FOSSIL MANIAC: A ${Bag.ITEMS[held].name}!! May I?! The old\nlife inside still dreams — I can WAKE it!\n\nRevive it into ${name}?   Z = Yes   X = No`, d => {
		if (d === 'x') return;
		const mon = battleBuildMon(species, 20, battle.data);
		if (!mon) return;
		Bag.consume(held);
		Dex.markCaught(species); dexMilestoneCheck();
		const where = addCaught(S.party, mon);
		saveParty(S.party);
		sfx('levelup');
		Journal.add(`The Fossil Maniac revived ${name} from the ${Bag.ITEMS[held].name}!`);
		dialog.open(`The machine hums... a heartbeat!\n\n${name} was revived!${where === 'box' ? '\n(Sent to the box.)' : ''}`);
	});
}

// NEW MAUVILLE: the runaway generator, waiting for someone to throw the switch
export function generatorTalk() {
	const ev = miscEvents();
	if (ev.newmauville) { dialog.open('The generator sleeps. The hum is gone.'); return; }
	dialog.open('The generator WHIRS wildly — the whole floor\nvibrates. A heavy switch juts from the console.\n\nThrow it?   Z = Yes   X = No', d => {
		if (d === 'x') return;
		const ev2 = miscEvents();
		ev2.newmauville = true;
		saveMiscEvents(ev2);
		Bag.addItem('thunderstone', 1);
		sfx('levelup');
		Journal.add('Shut down the runaway New Mauville generator!');
		dialog.open('KA-CHUNK. The hum dies to a whisper.\n\nA voice crackles from the intercom:\n"WAHAHA! That racket\'s finally done! WATTSON\nowes you one — take what\'s in the console!"\n\nYou found a THUNDERSTONE!');
	});
}
// fossil markers: the pried spots draw a small ammonite swirl until taken
export function drawFossilSpots(ctx, camX, camY) {
	const here = world.current?.name;
	const ev = miscEvents();
	const spots = [];
	if (here === 'MirageTower_4F' && !ev.mirage) spots.push([5, 4], [7, 4]);
	if (here === 'DesertUnderpass' && ev.mirage && !ev.underpass) spots.push([132, 10]);
	for (const [tx, ty] of spots) {
		const x = tx * META - camX, y = ty * META - camY;
		ctx.fillStyle = '#c9b28a';
		ctx.fillRect(x + 3, y + 3, 10, 10);
		ctx.fillStyle = '#8a7350';
		ctx.fillRect(x + 5, y + 5, 6, 6);
		ctx.fillStyle = '#c9b28a';
		ctx.fillRect(x + 7, y + 7, 2, 2);
	}
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
// ---------- GAME CORNER (Voltorb Flip + coins + prizes) ----------
// The corners shipped as furniture: slot machines nobody could pull, clerks
// with mute scripts. The counter (services 'gamecorner' zone) now opens a hub:
// play VOLTORB FLIP for coins, buy coins for money, spend coins at the prize
// desk. Coins live in the COIN CASE (bag.js, capped 9,999) — the clerk hands
// you the case free on your first visit.
export const gcMenu = { open: false, mode: 'hub', idx: 0, flash: null };
export const vfMenu = { open: false, game: null, cur: 12, flash: null };
const GC_PRIZES = [
	{ mon: 'abra', cost: 180 }, { mon: 'clefairy', cost: 500 },
	{ mon: 'dratini', cost: 2800 }, { mon: 'scyther', cost: 5500 }, { mon: 'porygon', cost: 9999 },
	{ item: 'tmthunderbolt', cost: 4000 }, { item: 'tmicebeam', cost: 4000 }, { item: 'tmflamethrower', cost: 4000 },
];
function gcRows() {
	if (gcMenu.mode === 'hub') return ['PLAY VOLTORB FLIP', 'PLAY SLOTS', 'BUY COINS', 'PRIZE CORNER', 'Leave'];
	if (gcMenu.mode === 'coins') return ['50 COINS — $1,000', '500 COINS — $10,000', 'Back'];
	return GC_PRIZES.map(pz => {
		const name = pz.mon ? (battle.data.species[pz.mon]?.name?.toUpperCase() || pz.mon.toUpperCase()) : Bag.ITEMS[pz.item].name;
		return `${name} — ${pz.cost.toLocaleString()} COINS`;
	}).concat(['Back']);
}
export function gcKey(k) {
	const rows = gcRows();
	if (k === 'ArrowUp') gcMenu.idx = (gcMenu.idx + rows.length - 1) % rows.length;
	if (k === 'ArrowDown') gcMenu.idx = (gcMenu.idx + 1) % rows.length;
	if (k === 'x' || k === 'Escape') {
		if (gcMenu.mode === 'hub') gcMenu.open = false;
		else { gcMenu.mode = 'hub'; gcMenu.idx = 0; gcMenu.flash = null; }
		return;
	}
	if (k !== 'z' && k !== 'Enter') return;
	if (gcMenu.mode === 'hub') {
		if (gcMenu.idx === 0) { gcMenu.open = false; vfMenu.open = true; vfMenu.game = VFlip.newGame(1); vfMenu.cur = 12; vfMenu.flash = null; }
		else if (gcMenu.idx === 1) { gcMenu.open = false; slotsMenu.open = true; slotsMenu.game = null; slotsMenu.msg = null; }
		else if (gcMenu.idx === 2) { gcMenu.mode = 'coins'; gcMenu.idx = 0; gcMenu.flash = null; }
		else if (gcMenu.idx === 3) { gcMenu.mode = 'prizes'; gcMenu.idx = 0; gcMenu.flash = null; }
		else gcMenu.open = false;
	} else if (gcMenu.mode === 'coins') {
		const deal = [[50, 1000], [500, 10000]][gcMenu.idx];
		if (!deal) { gcMenu.mode = 'hub'; gcMenu.idx = 0; return; }
		if (Bag.getCoins() >= Bag.COIN_CAP) { sfx('ui_denied'); gcMenu.flash = 'Your COIN CASE is full!'; }
		else if (!Bag.spend(deal[1])) { sfx('ui_denied'); gcMenu.flash = 'Not enough money!'; }
		else { Bag.addCoins(deal[0]); sfx('money'); gcMenu.flash = `Bought ${deal[0]} coins!`; }
	} else {
		const pz = GC_PRIZES[gcMenu.idx];
		if (!pz) { gcMenu.mode = 'hub'; gcMenu.idx = 0; return; }
		if (!Bag.spendCoins(pz.cost)) { sfx('ui_denied'); gcMenu.flash = 'Not enough coins!'; return; }
		sfx('item_get');
		if (pz.item) { Bag.addItem(pz.item); gcMenu.flash = `${Bag.ITEMS[pz.item].name} is yours!`; }
		else {
			const mon = buildMonForGift(pz.mon, 25);
			if (!mon) { Bag.addCoins(pz.cost); gcMenu.flash = 'The prize desk is out of stock...'; return; }
			Dex.markSeen(pz.mon); Dex.markCaught(pz.mon); dexMilestoneCheck();
			const where = addCaught(S.party, mon);
			saveParty(S.party);
			gcMenu.flash = `${mon.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box!'}`;
		}
	}
}
export function vfKey(k) {
	const g = vfMenu.game;
	if (!g) { vfMenu.open = false; return; }
	if (g.phase !== 'play') {
		// round over: Z deals the next round at the earned level, X leaves
		if (k === 'z' || k === 'Enter') { vfMenu.game = VFlip.nextRound(g); vfMenu.cur = 12; vfMenu.flash = null; }
		if (k === 'x' || k === 'Escape') vfMenu.open = false;
		return;
	}
	if (k === 'ArrowUp') vfMenu.cur = (vfMenu.cur + 20) % 25;
	if (k === 'ArrowDown') vfMenu.cur = (vfMenu.cur + 5) % 25;
	if (k === 'ArrowLeft') vfMenu.cur = vfMenu.cur % 5 === 0 ? vfMenu.cur + 4 : vfMenu.cur - 1;
	if (k === 'ArrowRight') vfMenu.cur = vfMenu.cur % 5 === 4 ? vfMenu.cur - 4 : vfMenu.cur + 1;
	if (k === 'x' || k === 'Escape') { vfMenu.open = false; return; }   // forfeits the round score
	if (k === 'z' || k === 'Enter') {
		const r = VFlip.flip(g, vfMenu.cur);
		if (r === 'volt') vfMenu.flash = 'A VOLTORB! The round score is gone... Z = next round, X = leave.';
		else if (r === 'clear') {
			Bag.addCoins(g.coins);
			vfMenu.flash = `Cleared! Banked ${g.coins} coins. Z = level ${g.nextLevel}, X = leave.`;
		}
	}
}
export function drawGcMenu(W, H) {
	const title = gcMenu.mode === 'coins' ? 'COIN COUNTER' : gcMenu.mode === 'prizes' ? 'PRIZE CORNER' : 'GAME CORNER';
	const sub = `Coins: ${Bag.getCoins().toLocaleString()}   Money: $${Bag.getMoney().toLocaleString()}`;
	optionList(W, H, H / 480, title, sub, gcRows(), gcMenu.idx, 'gc:', gcMenu.flash);
}
export function drawVfMenu(W, H) {
	const u = H / 480;
	const g = vfMenu.game;
	if (!g) return;
	menuChrome(W, H, u, `VOLTORB FLIP — LEVEL ${g.level}`,
		vfMenu.flash || `Round: ${g.coins} coins   Case: ${Bag.getCoins().toLocaleString()}   Z flip · X quit`);
	const hint = VFlip.hints(g.board);
	const cell = 52 * u, gap = 6 * u;
	const gx = W / 2 - (cell * 6 + gap * 5) / 2, gy = 84 * u;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	for (let i = 0; i < 25; i++) {
		const cx = gx + (i % 5) * (cell + gap), cy = gy + Math.floor(i / 5) * (cell + gap);
		const t = g.board[i];
		const sel = vfMenu.cur === i && g.phase === 'play';
		sctx.fillStyle = t.flipped ? (t.v === 0 ? '#7a2030' : '#2c4a37') : (sel ? '#4a4a80' : '#333355');
		sctx.fillRect(cx, cy, cell, cell);
		if (sel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2; sctx.strokeRect(cx + 1, cy + 1, cell - 2, cell - 2); }
		if (t.flipped) {
			sctx.fillStyle = t.v === 0 ? '#ff8899' : '#cfe8d8';
			sctx.textAlign = 'center';
			sctx.fillText(t.v === 0 ? 'V!' : String(t.v), cx + cell / 2, cy + cell / 2 + 5 * u);
			sctx.textAlign = 'left';
		}
		S.menuUi.push({ id: 'vf:' + i, x: cx, y: cy, w: cell, h: cell, label: '' });
	}
	// hint chips: sum over Voltorb count — right of each row, below each column
	for (let i = 0; i < 5; i++) {
		for (const [hx, hy, h2] of [
			[gx + 5 * (cell + gap), gy + i * (cell + gap), hint.rows[i]],
			[gx + i * (cell + gap), gy + 5 * (cell + gap), hint.cols[i]],
		]) {
			sctx.fillStyle = '#20223a';
			sctx.fillRect(hx, hy, cell, cell);
			sctx.fillStyle = BUI.C.text;
			sctx.fillText(String(h2.sum), hx + 6 * u, hy + 20 * u);
			sctx.fillStyle = '#ff8899';
			sctx.fillText('V' + h2.volts, hx + 6 * u, hy + 44 * u);
		}
	}
}

export function buildMonForGift(species, level) {
	return battleBuildMon(species, level, battle.data);
}

// ---------- postgame level scaling ----------
// JOHKANTO is the postgame region. Its roster is authored for a team that has
// just won a League — Lv50-77 across the eight gym territories — but the cap now
// runs to 255, so without this the whole region turns into a formality the moment
// you out-level it, which is exactly the content the coverage work just filled.
//
// The scale is RELATIVE, not a flat "match the player": multiplying keeps the
// gym-order ramp intact, so Brock's territory stays easier than Blue's at every
// player level. And it only ever scales UP, capped by the level cap and by your
// own lead — the region can meet you, never outrun you.
const JOHKANTO_DESIGN_LEVEL = 60;   // the middle of the authored 50-77 band
// Read from the MAP, not the player's saved region: `magepunk_region` is which
// region you started in, and you can walk into JohKanto from either side.
// Unprefixed border maps (Seafoam, Cerulean Cave) are shared with Kanto and are
// deliberately left alone.
export function inJohKanto() { return /^MAP_JOHKANTO_/.test(world.current?.map?.id || ''); }
function partyLead() { return Math.max(1, ...((S.party || []).filter(Boolean).map(m => m.level || 1)), 1); }
// WILD ENCOUNTERS: a band below the route trainers.
//
// The old relative multiply had two faults. It CLAMPED AT YOUR LEAD, so once you
// were strong every territory from Erika's up pinned flat to the same number and
// the eight-territory ramp — the thing the whole postgame roster is organised
// around — disappeared exactly when the region was supposed to be at its
// hardest. And a wild mon at precisely your lead, on every step through the
// grass, is relentless in a way a route trainer every few screens is not.
//
// So the authored band maps onto a band under your lead, the same way the route
// trainers' does, just lower. That keeps Brock's routes easier than Blue's at
// every player level, and stacks the region into a readable ladder:
//
//   wild  lead-20..-5   ·   route trainer  lead-12..-2
//   gym   lead+1/+2     ·   elite  +2/+3   ·   champion  +3/+5
//
// 50 and 78 are the measured span of encounters_postgame.js, not a guess. The
// three JohKanto maps with no postgame roster (Celadon, Pallet, Route 12) hold
// authentic Crystal water tables down at Lv2 — those clamp to the bottom of the
// band, which is right: nothing in the endgame region should be a Lv2 Goldeen.
//
// Never DOWN, and deliberately not clamped by the level cap. The cap is keyed on
// badges in the three shared regions and says what you *should* be; your lead
// says what you *are*. Clamping to the cap made a Lv150 party fight Lv20 foes
// whenever the cap had not caught up, which is the opposite of the point.
const WILD_BAND = { lo: 50, hi: 78 };
const WILD_UNDER_LEAD = { weakest: 20, strongest: 5 };
function wildEncounterLevel(level) {
	if (!inJohKanto()) return level;   // guarded HERE, not at the call site
	const lead = partyLead();
	if (lead <= JOHKANTO_DESIGN_LEVEL) return level;
	const t = Math.max(0, Math.min(1, (level - WILD_BAND.lo) / (WILD_BAND.hi - WILD_BAND.lo)));
	const under = WILD_UNDER_LEAD.weakest + t * (WILD_UNDER_LEAD.strongest - WILD_UNDER_LEAD.weakest);
	return Math.max(level, Math.min(lead, Math.round(lead - under)));
}
// A legendary should never be a pushover, wherever it is: lift it toward your
// lead if you have outgrown it, but never past your lead and never DOWN, so
// Articuno at Lv50 is still a wall for a mid-game Kanto team.
function scaleLegendaryLevel(level) {
	const lead = partyLead();
	return Math.max(level, lead);
}
// A JOHKANTO gym leader is levelled off your strongest POKeMON: the team sits one
// level above it and the ace two. Walk in under-levelled and it is a close fight;
// come back at Lv200 and it is still a close fight. Clamped to MAX_LEVEL so the
// last gyms cannot ask for a level that cannot exist.
// ROUTE TRAINERS sit in a band just under your lead.
//
// The relative scale alone PRESERVES WEAKNESS. JohKanto's 94 route trainers are
// Crystal-era rosters authored Lv23-38, so multiplying by lead/60 puts them at
// Lv58-95 against a Lv150 party — half your level, which is not a fight, and the
// region is meant to be the hardest in the game.
//
// Their ORDERING is worth keeping (a Youngster should still be easier than an Ace
// Trainer), so the authored band is mapped onto a band under your lead rather than
// flattened to a single number. Measured, not guessed: 23 and 38 are the real min
// and max ace levels across those 94.
const ROUTE_BAND = { lo: 23, hi: 38 };
const ROUTE_UNDER_LEAD = { weakest: 12, strongest: 2 };
export function routeTrainerLevel(level) {
	if (!inJohKanto()) return level;   // guarded HERE, not at the call site
	const lead = partyLead();
	if (lead <= JOHKANTO_DESIGN_LEVEL) return level;
	const t = Math.max(0, Math.min(1, (level - ROUTE_BAND.lo) / (ROUTE_BAND.hi - ROUTE_BAND.lo)));
	const under = ROUTE_UNDER_LEAD.weakest + t * (ROUTE_UNDER_LEAD.strongest - ROUTE_UNDER_LEAD.weakest);
	return Math.max(level, Math.min(lead, Math.round(lead - under)));
}

// gym team / ace, then the league above it. The four elites and the Champion are
// a step up from a gym rather than the same fight again — that is the whole
// shape of a league — but they are the same rule, just further ahead.
const BOSS_OVER_LEAD = { gym: [1, 2], elite: [2, 3], champion: [3, 5] };
export function bossLevelFor(kind, isAce) {
	const [team, ace] = BOSS_OVER_LEAD[kind] || BOSS_OVER_LEAD.gym;
	return Math.min(Badges.MAX_LEVEL, partyLead() + (isAce ? ace : team));
}
// kept as the name the gym work used; a JohKanto gym is the `gym` row above
function gymLevelFor(isAce) { return bossLevelFor('gym', isAce); }
// Mt Silver is a JOHTO map, so inJohKanto() is false there — the league is
// recognised by its SCRIPT instead, which is also the only thing that can tell
// an elite from a champion.
export function johkantoLeagueKind(script) {
	const info = Badges.scriptInfo(script);
	return (info && info.region === 'JOHKANTO' && (info.kind === 'elite' || info.kind === 'champion'))
		? info.kind : null;
}

// ---------- alternate forms ----------
// A form shares its base species' DEX NUMBER — that is the only link the data
// has, since species_battle.json carries no baseSpecies/forme fields. Base first
// (the id without an underscore), then the forms in id order, so cycling is
// stable and always returns you to where you started.
let formIndex = null;
export function formsOf(speciesId) {
	if (!formIndex) {
		formIndex = new Map();
		const byNum = new Map();
		for (const [id, sp] of Object.entries(battle.data.species || {})) {
			if (id.startsWith('_') || !(sp?.num > 0)) continue;
			(byNum.get(sp.num) || byNum.set(sp.num, []).get(sp.num)).push(id);
		}
		for (const ids of byNum.values()) {
			if (ids.length < 2) continue;
			const base = ids.filter(i => !i.includes('_')).sort()[0];
			if (!base) continue;                                   // no plain base: not a form family
			const family = [base, ...ids.filter(i => i !== base).sort()];
			for (const id of family) formIndex.set(id, family);
		}
	}
	return formIndex.get(speciesId) || null;
}
// Turn a caught POKeMON into the next form its species has. Everything the mon
// earned — level, IVs, EVs, nature, friendship, nickname, moves — is ITS OWN and
// survives; only what the SPECIES decides is rebuilt.
export function cycleForm(mon) {
	const family = formsOf(mon.speciesId);
	if (!family || family.length < 2) return null;
	const next = family[(family.indexOf(mon.speciesId) + 1) % family.length];
	const sp = battle.data.species[next];
	if (!sp) return null;
	// a nickname is the player's, a species name is not — only replace the latter
	const oldName = (battle.data.species[mon.speciesId]?.name || '').toUpperCase();
	if (!mon.name || mon.name === oldName) mon.name = (sp.name || next).toUpperCase();
	mon.speciesId = next;
	mon.types = [...(sp.types || [])];
	mon.sprite = sp.sprite;
	mon.num = sp.num;
	const dmg = mon.maxHP - mon.curHP;
	mon.stats = statsFor(sp, mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, mon.level, mon);
	mon.maxHP = mon.stats.hp;
	mon.curHP = Math.max(1, mon.maxHP - dmg);   // keep the wound, not the number
	Dex.markSeen(next); Dex.markCaught(next);
	dexMilestoneCheck();
	return sp.name || next;
}
// A STATIC wild battle started BY A SCRIPT: the Snorlax asleep in the road, the
// Sudowoodo posing as a tree, the Voltorb disguised as a Rocket-base switch.
//
// Both transpilers dropped the battle itself and kept everything around it, so
// these scripts played out in full and never fought: FireRed's `setwildbattle` +
// `dowildbattle` vanished, and Crystal's `loadwildmon` + `startbattle` came
// through as a `trainerbattle` with an empty trainer id. On Route 12 that meant
// using the POKe FLUTE woke the Snorlax, hid it, and moved on — the species was
// catchable nowhere in the game as a result.
//
// Blocks the script like a trainer battle does, and records the real outcome so
// the script's own `GetBattleOutcome` branch works instead of always reading WON.
function startScriptedWildBattle(species, level) {
	if (!species || !battle.data?.species?.[species]) return 'skip';
	if (!S.party || !leadMon(S.party) || battle.blocking) return 'skip';
	Dex.markSeen(species);
	battle.endSpec = { kind: 'wild' };   // the blocking script is gone after a reload; a plain wild ending is safe
	battle.start(S.party, species, level, result => {
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(S.party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			S.lastBattleOutcome = B_OUTCOME_CAUGHT;
			Story.setVar('VAR_RESULT', B_OUTCOME_CAUGHT);
			cutscene.resume();
		} else if (result === 'victory') {
			S.lastBattleOutcome = B_OUTCOME_WON;
			Story.setVar('VAR_RESULT', B_OUTCOME_WON);
			evolution.check(S.party, battle.data);
			saveParty(S.party);
			cutscene.resume();
		} else if (result === 'defeat') {
			// blacked out: heal and abandon the rest of the script, as trainer
			// battles do. Note the static is GONE either way — the decomp scripts
			// set the object's hide flag before the battle, not after, so losing to
			// the Route 12 Snorlax costs you that Snorlax. That is what the original
			// does, and the second one on Route 16 is the game's own second chance.
			S.lastBattleOutcome = B_OUTCOME_LOST;
			Story.setVar('VAR_RESULT', B_OUTCOME_LOST);
			whiteOut();
			cutscene.stop();
		} else {
			// ran / it fled — the decomp scripts treat RAN the same as WON (the
			// encounter is over and the object goes away), so let the script run on
			S.lastBattleOutcome = B_OUTCOME_RAN;
			Story.setVar('VAR_RESULT', B_OUTCOME_RAN);
			saveParty(S.party);
			cutscene.resume();
		}
	});
	return 'wait';
}
export function startCutscene(steps, onDone) {
	if (cutscene.blocking) return;
	cutscene.start(steps, cutsceneCtx(), onDone);
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
