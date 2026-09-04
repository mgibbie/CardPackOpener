// main.js — game loop, input, camera, warps, connection crossing.
import { World, Player, VIEW_W, VIEW_H, setViewSize, META } from './engine.js';
import { NPCs } from './npcs.js';
import { Encounters } from './encounters.js';
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
import * as BUI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
import { Journal } from './journal.js';
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
const MP_ON = MP.hasToken();
let mpAccount = null;   // { username, friendCode, ... } once loaded
let friends = [];       // last friends-poll result
let visiting = null;    // when set: { username, sprite } — roaming a friend's world
let friendGhost = null; // a friend's live sprite while we visit their map

// Integer-scale the GBA screen to DEVICE pixels. The old fixed 3x canvas was
// CSS-stretched by a fractional factor on phones (720 -> 1146 device px on an
// iPhone), so nearest-neighbour doubled some pixel columns and not others and
// the grid visibly crawled while walking. An integer device-pixel scale keeps
// every game pixel the same size; it also sizes battle/menu text to the screen.
let SCALE = 3;
// Portrait battles: battle/pvp scenes are vector-drawn at full canvas
// resolution, so while one is blocking on a portrait screen the canvas breaks
// out of the GBA 3:2 frame and fills the viewport (tick() flips this; the
// scene lays itself out for the tall aspect via battleui.layout). Without it a
// portrait phone letterboxed the whole battle into a ~220px-tall band with
// ~20px touch targets and left 70% of the screen black.
let sceneTall = false;
const screen = document.getElementById('screen');
const sctx = screen.getContext('2d', { alpha: false }); // fully repainted opaque every frame
function fitCanvas() {
	const dpr = window.devicePixelRatio || 1;
	if (sceneTall) {
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
const frame = document.createElement('canvas'); // native view-sized (240x160 landscape)
frame.width = VIEW_W; frame.height = VIEW_H;
const ctx = frame.getContext('2d', { alpha: false });
ctx.imageSmoothingEnabled = false;
fitCanvas();
let fitT = null; // rotations/keyboard fire resize in bursts — settle first
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(fitCanvas, 120); });

const hud = document.getElementById('hud');
const objectiveEl = document.getElementById('objective');
// keep the persistent on-screen objective in sync with the quest stage
function refreshObjective() {
	if (!objectiveEl) return;
	// Once the HOME region is done, the POSTGAME arc takes the line. Every
	// objective surface used to key off the starting region forever, so the
	// entire postgame was silent: standing on Mt Silver, a Kanto starter read
	// "MEWTWO stirs in CERULEAN CAVE" and the 16-badge climb, RED and the
	// legendary hunt got no guidance at all.
	const pg = Quest.stage(playerRegion()) === Quest.DONE ? postgameObjective() : null;
	objectiveEl.textContent = party ? ('NEXT: ' + (pg || Quest.objective(playerRegion()))) : '';
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
function legendStats() {
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
function postgameObjective() {
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
function postgameLog() {
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
const world = new World();
const player = new Player(world);
const npcs = new NPCs(world, player);
const encounters = new Encounters();
const battle = new Battle();
const trainers = new Trainers(world, player);
const dialog = new Dialog();
const services = new Services(world);
const arcade = new Arcade(world);
const blockers = new Blockers(world);
const portals = new Portals(world);
const evolution = new Evolution();
const items = new Items(world);
const pvp = new Pvp();
const factorySpec = new FactorySpec();
const cutscene = new Story.Cutscene();
let signTexts = {};
let trainerTeams = {}; // canonical TRAINER_id -> {class, party} (species/level/moves)
let commonStrings = {}; // cross-map / shared text labels (fallback for msg ops)
let sharedScripts = {}; // bodies the decomps keep outside the map files (see loadMapScripts)
let party = null;

// starter picker (fresh saves): 3 regions x 3 starters
const STARTERS = [
	{ region: 'KANTO', ids: ['bulbasaur', 'charmander', 'squirtle'] },
	{ region: 'JOHTO', ids: ['chikorita', 'cyndaquil', 'totodile'] },
	{ region: 'HOENN', ids: ['treecko', 'torchic', 'mudkip'] },
];
// fresh-save picker: 'region' phase (choose Kanto/Johto/Hoenn, NO starter yet),
// then 'pick' phase (choose the starter on-screen inside the region's lab).
const starterMenu = { open: false, row: 0, col: 0, sprites: {}, phase: 'region', region: null };
const urlPinnedMap = new URLSearchParams(location.search).has('map');
player.blocked = (tx, ty) => npcs.npcBlocks(tx, ty) || trainers.occupied(tx, ty) || services.blocks(tx, ty) || arcade.blocks(tx, ty) || blockers.blocks(tx, ty) || portals.blocks(tx, ty) || items.occupied(tx, ty);

// Strength: shove a boulder one tile ahead if a party mon can use Strength and
// the destination is clear. Returns true when the boulder actually moved.
let strengthHinted = false;
player.pushBoulder = (bx, by, dx, dy) => {
	const obj = items.fieldObjAt(bx, by);
	if (!obj || obj.kind !== 'boulder') return false;
	// only shoves once STRENGTH has been used (from the party menu) on this map
	if (!strengthActive) {
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
	if (!isLeague && mapScripts[script] && runScriptLabel(script, t)) return;
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
	battle.startTrainer(party, foeParty, info, result => {
		if (result === 'victory') {
			trainers.markDefeated(t);
			safeSaveStr('magepunk_money', (parseInt(localStorage.getItem('magepunk_money'), 10) || 0) + info.money);
			saveParty(party);
			onTrainerDefeated(t.ev.script); // gym badge / champion crown (before evo so the badge dialog shows)
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		}
	});
}

// ---------- progression: badges, the Elite Four gate, the champion crown ----------
// HMs and the League gate by the player's chosen region; a badge is awarded for
// the region the beaten Gym Leader belongs to (from the battle-script name).
function playerRegion() { return Badges.regionKey(localStorage.getItem('magepunk_region')); }

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
function levelCapNow() { return Badges.levelCap(Quest.globalTier()); }
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
function onTrainerDefeated(script, opts) {
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
			if (fresh) recordHallOfFame(info.region, party);
			healParty(party); saveParty(party);
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
// ---------- BATTLE FRONTIER (7 facilities) ----------
// Each facility is a variation on a shared streak/BP core (see FACILITIES in
// frontier.js): heal-or-endurance, endless-or-fixed-rounds, your-team-or-rentals.
// Lobby reception counters (attendant tiles) that start each facility's challenge:
// `tiles` = the reception counter that starts the challenge; `bp` = a side attendant
// (a real lobby NPC's tile) who runs the BP EXCHANGE.
const FACILITY_LOBBIES = {
	MAP_BATTLE_FRONTIER_BATTLE_TOWER_LOBBY:   { facility: 'tower',   tiles: [[6, 5], [10, 5], [14, 5], [18, 5]], bp: [[23, 5]] },
	MAP_BATTLE_FRONTIER_BATTLE_DOME_LOBBY:    { facility: 'dome',    tiles: [[5, 10], [17, 10]], bp: [[1, 11]] },
	MAP_BATTLE_FRONTIER_BATTLE_FACTORY_LOBBY: { facility: 'factory', tiles: [[4, 7], [14, 7]], bp: [[3, 11]] },
	MAP_BATTLE_FRONTIER_BATTLE_PALACE_LOBBY:  { facility: 'palace',  tiles: [[5, 6], [19, 6]], bp: [[18, 10]] },
	MAP_BATTLE_FRONTIER_BATTLE_ARENA_LOBBY:   { facility: 'arena',   tiles: [[7, 7]], bp: [[2, 10]] },
	MAP_BATTLE_FRONTIER_BATTLE_PIKE_LOBBY:    { facility: 'pike',    tiles: [[5, 5]], bp: [[10, 9]] },
	MAP_BATTLE_FRONTIER_BATTLE_PYRAMID_LOBBY: { facility: 'pyramid', tiles: [[7, 12]], bp: [[2, 15]] },
	// the three Battle Tents — each lobby's Attendant stands at (6,5). No `bp`
	// row: the BP EXCHANGE stays a Frontier facility, the tents only pay it out.
	MAP_SLATEPORT_CITY_BATTLE_TENT_LOBBY:  { facility: 'slateporttent',  tiles: [[6, 5]] },
	MAP_VERDANTURF_TOWN_BATTLE_TENT_LOBBY: { facility: 'verdanturftent', tiles: [[6, 5]] },
	MAP_FALLARBOR_TOWN_BATTLE_TENT_LOBBY:  { facility: 'fallarbortent',  tiles: [[6, 5]] },
};
const frontier = { active: false, streak: 0, cfg: null, runParty: null };
// heal a team IN MEMORY without persisting — used between Frontier bouts so the run
// party (which may be generated RENTALS) never overwrites the real saved party
function healTeam(team) {
	for (const m of (team || [])) { if (!m) continue; m.curHP = m.maxHP; m.status = null; for (const mv of m.moves || []) mv.pp = mv.maxPp; }
}
function facLevel(cfg) {
	const base = Math.min(Badges.MAX_LEVEL, Math.max(50, ...((party || []).filter(Boolean).map(m => m.level || 50))));
	if (cfg.level === 50) return 50;
	if (cfg.level === 'party+5') return Math.min(Badges.MAX_LEVEL, base + 5);
	return base;
}
// ---- spectate broadcast: publish a board snapshot of the run so friends can watch ----
let frontierSeq = 0, frontierLastSnap = '', frontierPubTimer = null, frontierWatchers = 0;
function factorySnapshot() {
	if (!frontier.active) return null;
	const base = { facility: frontier.cfg?.name || '', streak: frontier.streak, bp: Frontier.getBP() };
	const a = battle.active;
	if (!a || !a.me || !a.foe) return { ...base, waiting: true };
	const mon = m => m ? { name: m.name, level: m.level, species: m.speciesId, curHP: m.curHP, maxHP: m.maxHP, status: m.status || null, types: m.types || [] } : null;
	const team = arr => (arr || []).map(m => ({ curHP: m.curHP, maxHP: m.maxHP }));
	return { ...base, me: mon(a.me), foe: mon(a.foe), meBoosts: a.meBoosts, foeBoosts: a.foeBoosts, meTeam: team(a.party), foeTeam: team(a.foes), msg: a.msg || '' };
}
function frontierPublish(over) {
	if (!MP_ON) return;
	const snap = over ? null : factorySnapshot();
	const s = JSON.stringify(snap);
	if (s !== frontierLastSnap) { frontierLastSnap = s; frontierSeq++; }
	MP.call('publish-factory', { snapshot: snap, label: frontier.cfg?.name || 'BATTLE FRONTIER', seq: frontierSeq, over: !!over })
		.then(d => { if (d && typeof d.watchers === 'number') frontierWatchers = d.watchers; })
		.catch(() => { });
}
function startFrontierPublish() {
	if (!MP_ON || frontierPubTimer) return;
	frontierWatchers = 0;
	const uname = mpAccount?.username; // runner + spectators share the run's chat room
	if (uname && !Chat.active()) Chat.mount({ room: 'u:' + uname, canPost: true });
	const tick = () => { frontierPublish(false); frontierPubTimer = frontier.active ? setTimeout(tick, 1200) : null; };
	tick();
}
function stopFrontierPublish() {
	if (frontierPubTimer) { clearTimeout(frontierPubTimer); frontierPubTimer = null; }
	frontierPublish(true); // final "run over" push so watchers see it end promptly
	frontierWatchers = 0;
	if (Chat.active()) Chat.unmount();
}
// a "N watching" badge on the runner's own screen while friends are spectating
function drawWatchingBadge(W, H) {
	const u = H / 480;
	const label = `\u{1F441} ${frontierWatchers} watching`;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.textAlign = 'left';
	const w = sctx.measureText(label).width + 20 * u, h = 26 * u, x = W - w - 12 * u, y = 12 * u;
	sctx.fillStyle = 'rgba(20,30,50,0.82)';
	BUI.rr(sctx, x, y, w, h, 8 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 1.5;
	BUI.rr(sctx, x, y, w, h, 8 * u); sctx.stroke();
	sctx.fillStyle = BUI.C.text;
	sctx.fillText(label, x + 10 * u, y + 18 * u);
}

function startFacility(id) {
	const cfg = Frontier.FACILITIES[id];
	if (!cfg || !party || !leadMon(party) || frontier.active || battle.blocking) return;
	const runParty = cfg.rental ? Frontier.genTeam(battle.data, facLevel(cfg), cfg.size) : party;
	if (cfg.rental && !runParty.length) { dialog.open('No rental POKeMON are available right now.'); return; }
	frontier.active = true; frontier.streak = 0; frontier.cfg = cfg; frontier.id = id; frontier.runParty = runParty;
	startFrontierPublish();
	const intro = cfg.rental ? `The ${cfg.name} challenge begins!\n\nYou’ll battle with a set of RENTAL POKeMON.`
		: cfg.heal ? `The ${cfg.name} challenge begins!\n\nBattle on — and don’t lose!`
			: `The ${cfg.name} challenge begins!\n\nNo healing between bouts — endure!`;
	dialog.open(intro, frontierNext);
}
// backward-compatible alias (the Battle Tower)
function startFrontierChallenge() { startFacility('tower'); }
function frontierNext() {
	if (!frontier.active) return;
	const cfg = frontier.cfg;
	// Pike: some steps are a lucky room (free BP, no battle)
	if (cfg.rooms && Math.random() < 0.22) {
		Frontier.addBP(1);
		dialog.open('A hidden chamber! You pocket 1 BP and press deeper.', frontierNext);
		return;
	}
	if (cfg.heal) healTeam(frontier.runParty); // in-memory (rentals must not be saved)
	// at streak 7 / 21, the facility's FRONTIER BRAIN challenges you (a tougher team)
	const round = frontier.streak + 1;
	const tier = Frontier.brainTier(round);
	const brain = tier ? Frontier.BRAINS[frontier.id] : null;
	const foe = Frontier.genTeam(battle.data, facLevel(cfg) + (tier ? 8 : 0), cfg.size);
	if (!foe.length) { endFacility(); return; }
	for (const m of foe) Dex.markSeen(m.speciesId);
	const info = { displayName: brain ? brain.name : 'FRONTIER TRAINER', defeatText: '', money: 0, boss: !!brain };
	if (brain) dialog.open(`The ${cfg.name} BRAIN, ${brain.title} ${brain.name}, blocks your path!`, () => runFrontierBattle(foe, info, tier, brain));
	else runFrontierBattle(foe, info, null, null);
}
function runFrontierBattle(foe, info, tier, brain) {
	const cfg = frontier.cfg;
	battle.endSpec = null;   // frontier runs have their own state machine — never snapshot these
	battle.startTrainer(frontier.runParty, foe, info, result => {
		if (result !== 'victory') { endFacility(); return; }
		frontier.streak++; Frontier.addBP(cfg.bpWin); Frontier.recordStreak(frontier.streak);
		if (!cfg.rental) saveParty(party);
		const cont = () => {
			if (Number.isFinite(cfg.rounds)) {
				if (frontier.streak >= cfg.rounds) { Frontier.addBP(cfg.bonus || 0); completeFacility(); }
				else dialog.open(`${cfg.unit || 'Round'} ${frontier.streak} won!  (+${cfg.bpWin} BP)`, frontierNext); // fixed run auto-continues
			} else {
				dialog.open(`Win streak: ${frontier.streak}!  (+${cfg.bpWin} BP)\n\nBattle on?   Z = Continue   X = Rest`, declined => {
					if (declined === 'x') endFacility(); else frontierNext();
				});
			}
		};
		if (brain) {
			Frontier.addBP(10); Frontier.earnSymbol(frontier.id, tier);
			syncOverworldAchievements(); // a Frontier Brain fell — a new symbol to surface
			dialog.open(`Incredible — you defeated ${brain.name}!\n\nYou earned the ${tier.toUpperCase()} SYMBOL!   (+10 BP)`, cont);
		} else cont();
	});
}
function completeFacility() {
	const cfg = frontier.cfg;
	frontier.active = false; frontier.streak = 0; stopFrontierPublish();
	if (factoryStandalone) healTeam(party); else healParty(party); // heal+save only for a real save
	frontierEndDialog(`You conquered the ${cfg.name}!\n\nAll ${cfg.rounds} rounds won — bonus +${cfg.bonus || 0} BP!\nTotal BP: ${Frontier.getBP()}`);
}
function endFacility() {
	const cfg = frontier.cfg, s = frontier.streak;
	frontier.active = false; frontier.streak = 0; stopFrontierPublish();
	if (factoryStandalone) healTeam(party); else healParty(party);
	frontierEndDialog(`Your ${cfg ? cfg.name : 'FRONTIER'} challenge ends.\n\nStreak this run: ${s}   (best: ${Frontier.bestStreak()})\nTotal BP: ${Frontier.getBP()}`);
}
// at run end: offer the BP EXCHANGE (spend what you just earned), then — in the
// standalone mini-game — offer another run instead of dropping to the overworld
function frontierEndDialog(msg) {
	const playAgain = () => { if (factoryStandalone) dialog.open('Play again?   Z = Yes   X = No', d => { if (d !== 'x') startFacility('factory'); }); };
	dialog.open(msg + '\n\nSpend BP now?   Z = BP SHOP   X = Leave', declined => {
		if (declined !== 'x') openBpShop(playAgain); else playAgain();
	});
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
evolution.onDone = () => saveParty(party);
evolution.onEvolved = (from, to) => Journal.add(`${from} evolved into ${to}!`);
let loading = true;
// ---------- screen fade (warp/door transitions) ----------
// Warps used to hard-cut between maps. A short fade-to-black on the way out and
// a fade-in on the new map reads instantly more finished. The main tick BAILS
// while `loading` is true, so the fade animates in the loading=false windows on
// either side of the load: fadeTo(1) (out) → set loading + swap the map →
// fadeTo(0) (in). While a fade runs, `fading` freezes input via menuBlocking so
// no stray step slips through the black. Honors REDUCED_MOTION (instant cut).
const REDUCED_MOTION_OW = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const fade = { alpha: 0, target: 0 };
const FADE_SPEED = 6; // alpha units/sec (~170ms each way)
const fading = () => fade.alpha > 0.001 || fade.target > 0.001;
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
let loadWatchStart = null;    // rAF timestamp when `loading` first went true
let cutsceneWatchStart = null; // rAF timestamp a cutscene first looked stuck

// ---------- input ----------
const KEYMAP = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
	w: 'up', s: 'down', a: 'left', d: 'right',
};
const heldKeys = [];
let wasInBattle = false; // when a battle ends, flush held keys so we don't take a stray step out of it
let runHeld = false; // Shift on keyboard, holding B on touch
// while typing in the chat box, keys belong to the input, not the game
const typingInChat = () => document.activeElement && document.activeElement.tagName === 'INPUT';
addEventListener('keydown', e => {
	if (typingInChat()) return;
	// while a menu/dialog/battle is open, arrows navigate options — don't also
	// queue overworld movement (that made the player walk while browsing menus)
	if (menuBlocking()) { if (KEYMAP[e.key]) e.preventDefault(); return; }
	if (e.key === 'Shift') runHeld = true;
	const dir = KEYMAP[e.key];
	if (dir) {
		e.preventDefault();
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
	}
});
addEventListener('keyup', e => {
	if (e.key === 'Shift') runHeld = false;
	const dir = KEYMAP[e.key];
	if (dir) {
		const i = heldKeys.indexOf(dir);
		if (i >= 0) heldKeys.splice(i, 1);
	}
});

// where you are, so a return visit resumes there (URL params still win)
const POS_KEY = 'magepunk_pos_v1';
// REPEL steps remaining. Persisted so it survives a reload mid-cave, and read by
// the step handler + encounters.roll. Nothing read the repel items before this.
const REPEL_KEY = 'magepunk_repel_v1';
const REPEL_LAST_KEY = 'magepunk_repellast'; // which repel kind was last used, for the wear-off re-offer
let repelSteps = Math.max(0, parseInt(localStorage.getItem(REPEL_KEY), 10) || 0);
function setRepel(n) { repelSteps = Math.max(0, n | 0); safeSaveStr(REPEL_KEY, String(repelSteps)); }
// the gadget key-items (Escape Rope / Itemfinder / Town Map), inert since
// day one. Returns true when the id was one of them (handled or refused).
function useGadget(id) {
	if (id === 'escaperope') {
		if ((world.current?.map?.map_type || '') !== 'MAP_TYPE_UNDERGROUND' || !lastOutdoor) {
			bagMenu.flash = 'Nothing to escape from here.';
			return true;
		}
		Bag.consume(id);
		bagMenu.open = false;
		dialog.open('You climbed the ESCAPE ROPE\nback to the open air!', () => moveToMap(lastOutdoor.map, lastOutdoor.x, lastOutdoor.y));
		return true;
	}
	if (id === 'itemfinder') {
		const hidden = items.balls.filter(b => b.hidden);
		if (!hidden.length) { sfx('ui_denied'); bagMenu.flash = 'The ITEMFINDER stays silent. Nothing buried here.'; return true; }
		let best = hidden[0], bd = Infinity;
		for (const b of hidden) { const d = Math.abs(b.tx - player.tx) + Math.abs(b.ty - player.ty); if (d < bd) { bd = d; best = b; } }
		const dx = best.tx - player.tx, dy = best.ty - player.ty;
		sfx('notice');
		bagMenu.flash = bd === 0 ? "BEEP BEEP BEEP! It's right under you!"
			: `BEEP! Something is buried to the ${[dy < 0 ? 'north' : dy > 0 ? 'south' : '', dx > 0 ? 'east' : dx < 0 ? 'west' : ''].filter(Boolean).join('-')}${bd <= 6 ? ' — close by!' : '.'}`;
		return true;
	}
	if (id === 'townmap') { bagMenu.open = false; openTownMap(); return true; }
	return false;
}

// the gen-5 nicety: when a repel runs out and the bag holds another of the same
// kind, offer it on the spot instead of making the player dig through the bag
function repelWoreOff() {
	const id = localStorage.getItem(REPEL_LAST_KEY);
	const item = id && Bag.ITEMS[id];
	if (!item || item.kind !== 'repel' || Bag.count(id) < 1) {
		hud.textContent = 'REPEL\'s effect wore off...';
		return;
	}
	dialog.open(`REPEL's effect wore off...\nUse another ${item.name}? (${Bag.count(id)} left)\n\nZ = Yes   X = No`, declined => {
		if (declined === 'x') return;
		Bag.consume(id);
		setRepel(item.steps || 100);
		hud.textContent = `${item.name} is working again. (${item.steps} steps)`;
	});
}
// standalone Battle Factory mini-game (?factory=1 from the home page): rentals only,
// no save/party needed — and it must never write over a real overworld save
let factoryStandalone = false;
function savePos() {
	if (factoryStandalone) return; // the mini-game never persists position
	if (window.__followTest) return; // the follower-test arena must never become your saved position
	// `back` rides along because a few Crystal maps leave by a -1 "return to
	// where you came from" warp (Pokecenter2F, the dept-store elevators, the Fast
	// Ship). That source lived only in memory, so reloading inside one of them
	// left backWarp() with nothing to go back TO and the exit silently did
	// nothing — you were sealed in. See backWarp's fallback for the second net.
	safeSave(POS_KEY, {
		map: world.current.name, x: player.tx, y: player.ty,
		back: world.lastWarpSource || null,
	});
}
// Z in front of something: services, talk-to trainers (incl. gym leaders), signs
function interact() {
	if (player.moving || trainers.engaging) return;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
	// another player standing on the faced tile — challenge them or offer a trade
	if (MP_ON) { const who = ghostAt(fx, fy); if (who) { playerMenu.open = true; playerMenu.idx = 0; playerMenu.target = who; return; } }
	// a disguised VOLTORB "item ball" springs its ambush
	const amb = items.ambushAt(fx, fy);
	if (amb) {
		items.takeAmbush(amb);
		dialog.open("It's not an item — the ball has EYES!\n\nVOLTORB attacked!", () => startWildBattle({ id: amb.ambush, level: 25 }));
		return;
	}
	// item balls / berry trees / hidden items (facing tile, then standing tile)
	const found = items.interactAt(fx, fy) || items.interactAt(player.tx, player.ty);
	if (found) { sfx('item_get'); dialog.open(found); return; }
	// field obstacles: point the player at the right HM (used from the party menu)
	const fo = items.fieldObjAt(fx, fy);
	if (fo) {
		dialog.open(fo.kind === 'rock' ? 'A rugged rock blocks the way.\n\nROCK SMASH could break it apart.'
			: fo.kind === 'boulder' ? "It's a hefty boulder.\n\nSTRENGTH could push it aside."
			: 'A leafy tree grows here.\n\nCUT could clear a path through it.');
		return;
	}
	// a static legendary on the faced tile — walk up and challenge it
	const leg = legendaryHere();
	if (leg && fx === leg.x && fy === leg.y) { startLegendaryBattle(leg); return; }
	// a Silph Co shutter with no CARD KEY in the bag
	if (silphDoorAt(fx, fy) && !Bag.count('cardkey')) {
		dialog.open('A heavy security shutter bars the way.\nThe card reader blinks RED.\n\nIt wants a CARD KEY.');
		return;
	}
	// a SECRET BASE spot in the rock/tree/shrub face (Emerald's behaviors survive
	// in the layouts, so all ~70 real spots work), or decorating inside your own
	{
		const bb = world.behaviorAt(fx, fy);
		if (bb >= 0x90 && bb <= 0x9D) { secretSpotInteract(fx, fy, bb); return; }
	}
	// a HILL GUARD blocking a Trainer Hill floor
	{
		const hg = hillGuardAt(fx, fy);
		if (hg) { startHillBattle(hg.key, hg.i); return; }
	}
	if (baseCtx && baseDecoInteract(fx, fy)) return;
	const svc = services.kindAt(fx, fy);
	if (svc === 'nurse') {
		dialog.open('Welcome to the POKEMON CENTER!\n\nWe restored your POKEMON\nto full health. See you again!', () => { sfx('heal'); healParty(party); });
		return;
	}
	if (svc === 'pc') { sfx('pc_on'); pcMenu.open = true; pcMenu.side = 0; pcMenu.idx = 0; return; }
	if (svc === 'shop') { shopMenu.open = true; shopMenu.idx = 0; shopMenu.mode = 'buy'; shopMenu.flash = null; return; }
	if (svc === 'ferry') { ferryMenu.open = true; ferryMenu.idx = 0; return; }
	if (svc === 'bugcontest') { bugOfficerTalk(); return; }
	if (svc === 'bikeshop') { bikeShopTalk(); return; }
	if (svc === 'glassblower') { glassBlowerTalk(); return; }
	if (svc === 'museumpaint') { museumPaintTalk(fx, fy); return; }
	if (svc === 'museumcurator') { museumCuratorTalk(); return; }
	if (svc === 'ruinsword') { ruinsWordTalk(); return; }
	if (svc === 'fossilroot') { fossilPick('root'); return; }
	if (svc === 'fossilclaw') { fossilPick('claw'); return; }
	if (svc === 'fossilunder') { fossilUnderpassTalk(); return; }
	if (svc === 'fossilmaniac') { fossilManiacTalk(); return; }
	if (svc === 'generator') { generatorTalk(); return; }
	if (svc === 'trainerhill') { hillReceptionTalk(); return; }
	if (svc === 'hillprize') { hillPrizeTalk(); return; }
	if (svc === 'hillelevator') {
		dialog.open('ATTENDANT: Riding down to the entrance!\n\nZ = Ride   X = Stay', d => { if (d !== 'x') warpTo('MAP_TRAINER_HILL_ENTRANCE', '2'); });
		return;
	}
	if (svc === 'shoalspot') { shoalDig(); return; }
	if (svc === 'shoalhermit') { shoalHermitTalk(); return; }
	if (svc === 'kurt') { kurtTalk(); return; }
	if (svc === 'trickmaster') { trickMasterTalk(); return; }
	if (svc === 'trickscroll') { trickScrollFind(); return; }
	if (svc === 'trickend') { trickEndTalk(); return; }
	if (svc === 'ruinspuzzle') { openRuinsPuzzle(); return; }
	if (svc === 'contest') {
		if (!party.length) { dialog.open('You need a POKeMON to enter a Contest!'); return; }
		if (!(Contest.data?.opponents || []).length) { dialog.open('The hall is still being prepared for the next Contest...'); return; }
		sfx('ui_select');
		contestMenu.open = true; contestMenu.mode = 'category'; contestMenu.idx = 0; contestMenu.flash = null;
		return;
	}
	if (svc === 'berryblend') {
		if (!party.length) { dialog.open('The BLEND MASTER: Bring a POKeMON and some berries, friend!'); return; }
		sfx('ui_select');
		blendMenu.open = true; blendMenu.mode = 'pickmon'; blendMenu.idx = 0; blendMenu.flash = null;
		return;
	}
	if (svc === 'gamecorner') {
		const openHub = () => { gcMenu.open = true; gcMenu.mode = 'hub'; gcMenu.idx = 0; gcMenu.flash = null; };
		if (!Bag.count('coincase')) {
			Bag.addItem('coincase');
			dialog.open('Welcome to the GAME CORNER!\n\nFirst visit? Here — a COIN CASE,\non the house!', openHub);
		} else openHub();
		return;
	}
	// arcade boxes: Route 1 launches PokéChess; Pallet Town's is a placeholder
	const arc = arcade.kindAt(fx, fy);
	if (arc === 'pokechess') {
		dialog.open('Do you want to play\nPOKéCHESS?', (k) => {
			if (k !== 'x') { saveParty(party); savePos(); location.href = 'pokechess.html' + (MP_ON ? '?mp=1' : ''); }
		});
		return;
	}
	if (arc === 'pears') {
		dialog.open('Do you want to play a\nPAIR OF PEARS?', (k) => {
			if (k !== 'x') { saveParty(party); savePos(); location.href = '/pairofpears/?direct=1'; }
		});
		return;
	}
	// BATTLE FRONTIER reception counter — start that facility's challenge
	const lobby = FACILITY_LOBBIES[world.current.map.id];
	if (lobby && !frontier.active && lobby.tiles.some(([x, y]) => x === fx && y === fy)) {
		const cfg = Frontier.FACILITIES[lobby.facility];
		dialog.open(`Welcome to the ${cfg.name}!\n\nBattle for BP — you have ${Frontier.getBP()} BP.\n\nTake the challenge?   Z = Yes   X = No`, declined => {
			if (declined !== 'x') startFacility(lobby.facility);
		});
		return;
	}
	if (lobby && !frontier.active && lobby.bp && lobby.bp.some(([x, y]) => x === fx && y === fy)) {
		dialog.open(`BP EXCHANGE\n\nWelcome! You have ${Frontier.getBP()} BP to spend.\n\nZ = Shop   X = Leave`, declined => {
			if (declined !== 'x') openBpShop(null);
		});
		return;
	}
	// inter-region PORTAL pad — open the destination menu (fly to another region's
	// same-tier gym town). Also try the tile the player stands on (pads render beside
	// the PC, so you'll usually be facing or on one).
	const portal = portals.at(fx, fy) || portals.at(player.tx, player.ty);
	if (portal) { portalMenu.open = true; portalMenu.idx = 0; portalMenu.dests = portal.dests; portalMenu.town = null; return; }
	// authentic progression obstacle: a giver hands over its key item; a blocker
	// (guard / SNORLAX / grunt) turns you back with its themed line
	if (blockers.giverAt(fx, fy)) { const m = blockers.grantAt(fx, fy); if (m) dialog.open(m); return; }
	const blk = blockers.kindAt(fx, fy);
	if (blk) { dialog.open(blk.msg); return; }
	// water's edge: SURF carries you across (used from the party menu)
	if (!player.surfing && world.isSurfable(fx, fy)) {
		dialog.open('The water is a deep blue...\n\nSURF would carry you across.');
		return;
	}
	const t = trainers.trainerAt(fx, fy);
	if (t) {
		if (trainers.isDefeated(t)) {
			const { info } = trainers.buildBattle(t, battle.data);
			dialog.open(info.defeatText);
		} else {
			trainers.talkTo(t, player.facing);
		}
		return;
	}
	for (const ev of world.current.map.bg_events || []) {
		if (+ev.x !== fx || +ev.y !== fy) continue;
		if (signTexts[ev.script]) {
			// same normalizer NPC speech uses, so a sign never shows a raw "#"
			dialog.open(Story.normalizeText(signTexts[ev.script], cutsceneCtx()));
			return;
		}
		// A scripted bg_event with no entry in sign_texts.json used to fall
		// straight through and say NOTHING — 381 of them across 84 maps, including
		// every department-store elevator button and every Game Corner machine.
		// The map's own script usually has the label; run it the same way an NPC's
		// script runs, and let runScriptLabel's own fallback handle a dead label
		// (it says "..." rather than freezing).
		if (ev.script && ev.script !== '0x0' && mapScripts[ev.script]) {
			runScriptLabel(ev.script);
			// Some of these are minigame machinery — Game Corner card flip, the
			// Roulette tables, the Berry Blender — whose opcodes this port has no
			// implementation for, so the script runs and produces nothing at all.
			if (!dialog.blocking && !cutscene.blocking) dialog.open('...');
			return;
		}
		// Neither text nor a script label. Say "..." rather than nothing, which is
		// exactly what an NPC with an unresolvable script already does: pressing A
		// must always acknowledge that something is there.
		if (ev.script && ev.script !== '0x0') { dialog.open('...'); return; }
	}
	// face-to-face NPC: have them turn toward the player
	const npc = npcs.list.find(n => n.tx === fx && n.ty === fy);
	if (npc) {
		npc.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[player.facing];
		// single-purpose service buildings: talking to the attendant runs it
		const mid = world.current.map.id;
		if (DAYCARE_MAPS.has(mid)) { openDaycare(); return; }
		if (NAMERATER_MAPS.has(mid)) { openNameRater(); return; }
		if (DELETER_MAPS.has(mid)) { openMoveShop(); return; }
		// MOM heals the party in all three games — the op that does it never
		// survived the transpile, so she chatted without tucking anyone in.
		// (During the intro her original script still runs its story beats.)
		if (npc.ev && MOM_SCRIPTS.has(npc.ev.script) && Story.getFlag('intro_done')) { momTalk(); return; }
		// ported story script for this NPC (dialogue/movement/flags)
		if (npc.ev && npc.ev.script && runScriptLabel(npc.ev.script, npc)) return;
	}
}

// ---------- water animation ----------
// The map renders ONCE into cached canvases, so water sat frozen in every
// region. This re-draws each visible surfable tile from that cache with a
// GB-style 1px horizontal wobble (4 phases, wrap-around slices) — the sea
// moves again without any new art. Drawn after the bottom layer and before
// the top, so bridges stay above the ripple.
const WATER_PHASE = [0, 1, 0, -1];
function drawWaterAnim(ctx, camX, camY, forceOff) {
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
const MOM_SCRIPTS = new Set(['MomScript', 'PalletTown_PlayersHouse_1F_EventScript_Mom', 'PlayersHouse_1F_EventScript_Mom']);
function momTalk() {
	const hurt = (party || []).some(m => m && (m.curHP < m.maxHP || m.status || (m.moves || []).some(mv => mv.pp < mv.maxPp)));
	if (!hurt) {
		dialog.open('MOM: Oh, hi! Your POKeMON look happy\nand healthy to me. Off you go —\nand take care of each other!');
		return;
	}
	dialog.open('MOM: Welcome home! Goodness, you all look\nworn out. Let me look after your POKeMON\nfor a moment...\n\n. . . . .\n\nThere! Rested and raring to go!', () => {
		sfx('heal');
		healParty(party);
		saveParty(party);
	});
}

// canonical service buildings (talk to the NPC inside to use the service)
const DAYCARE_MAPS = new Set(['MAP_DAY_CARE', 'MAP_ROUTE5_POKEMON_DAY_CARE',
	'MAP_ROUTE117_POKEMON_DAY_CARE', 'MAP_FOUR_ISLAND_POKEMON_DAY_CARE']);
const NAMERATER_MAPS = new Set(['MAP_GOLDENROD_NAME_RATER', 'MAP_JOHKANTO_LAVENDER_NAME_RATER',
	'MAP_SLATEPORT_CITY_NAME_RATERS_HOUSE']);
const DELETER_MAPS = new Set(['MAP_MOVE_DELETERS_HOUSE', 'MAP_LILYCOVE_CITY_MOVE_DELETERS_HOUSE']);

const partyMenu = { open: false, idx: 0, summary: false, action: null, swapFrom: null };
const startMenu = { open: false, idx: 0 };
const questMenu = { open: false, idx: 0, page: 0 }; // page 0 = quest log, 1 = THINGS TO DO
// THINGS TO DO — the discovery checklist (Batch 6). Whole subsystems shipped as
// reachable content that nothing ever pointed you at: contests, the Ruins, secret
// bases, the Frontier, apricorns, Dive... This surfaces them with a where-to-start
// hint and a live state ([x] done, [>] available now, [ ] locked/where-to-unlock).
// `done`/`avail` are optional predicates read at draw time; default avail = true.
const THINGS_TO_DO = [
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
function todoRows() {
	return THINGS_TO_DO.map(t => {
		let mark = '[ ] ';
		try { mark = t.done?.() ? '[x] ' : (t.avail ? (t.avail() ? '[>] ' : '[ ] ') : '[>] '); } catch (e) { mark = '[>] '; }
		return `${mark}${t.label} — ${t.where}`;
	});
}
// walk-up-and-talk: press Z facing another player's sprite to challenge or trade
const playerMenu = { open: false, idx: 0, target: null };
const PLAYER_MENU_ITEMS = ['POKeMON BATTLE', 'MAIL BATTLE', 'CARD BATTLE', 'TRADE', 'CANCEL'];
// deck-selection phase before a card duel: pick which class deck to bring
const deckSelect = { open: false, idx: 0, decks: [], onPick: null, prompt: '' };
// RuneScape-style two-party trade window
const TRADE_CATS = ['CARDS', 'PACKS', 'POKeMON', 'ITEMS'];
const trade = {
	open: false, id: null, role: null, them: 'PLAYER',   // role 'a' = requester, 'b' = accepter
	mine: null, theirs: null, myAccept: false, theirAccept: false,
	done: false, applied: false, cat: 0, idx: 0, rows: [], poll: null, status: '',
};
const emptyOffer = () => ({ cards: {}, packs: 0, pokemon: [], items: [] });
// the username of a friend-ghost currently standing on tile (tx,ty), or null
function ghostAt(tx, ty) {
	for (const [name, g] of ghosts) {
		if (Math.round(g.px / META) === tx && Math.round(g.py / META) === ty) return name;
	}
	return null;
}
const cardsMenu = { open: false, idx: 0 };
const runMenu = { open: false, idx: 0 };
const dexMenu = { open: false, idx: 0, detail: false, list: null };
const trainerCard = { open: false, page: 0 }; // page 0 = the card, 1 = the adventure JOURNAL
const townMap = { open: false, region: 0, idx: 0 };
// mode 'backups' lists the server's automatic daily saves; list is fetched lazily
const optionsMenu = { open: false, idx: 0, mode: 'main', list: null, flash: null, busy: false };
// battleAnim was in Settings.OPTIONS but never listed here — the setting existed
// with no way to reach it
const OPTION_KEYS = ['textSpeed', 'bgmVol', 'sfxVol', 'autoRun', 'dayNight', 'followers', 'battleAnim'];
// rows below the settings: save-data actions, not cyclable values
const OPTION_ACTIONS = [
	{ id: 'export', label: 'EXPORT SAVE', hint: 'Download your game as a file' },
	{ id: 'import', label: 'IMPORT SAVE', hint: 'Restore a downloaded save file' },
	{ id: 'backups', label: 'BACKUPS', hint: 'Restore an automatic daily backup' },
	{ id: 'controls', label: 'CONTROLS', hint: 'See every shortcut and rebind the single keys' },
];
// ---------- key bindings ----------
// The single-key shortcuts (S to swap move slots, F to search the PC, C for
// the bike, R to re-throw a ball...) were undiscoverable and unmovable. The
// CONTROLS screen lists every one and lets each be rebound; a custom key
// TRANSLATES to the action's default at the input door, so the defaults keep
// working alongside (forgiving, not exclusive). Device preference, like the
// volume sliders — spared by the owner reset.
const KEYBIND_KEY = 'magepunk_keys_v1';
const KEY_ACTIONS = [
	{ id: 'confirm', label: 'CONFIRM / INTERACT', def: 'z' },
	{ id: 'cancel', label: 'CANCEL / BACK', def: 'x' },
	{ id: 'menu', label: 'MAIN MENU', def: 'Enter' },
	{ id: 'party', label: 'PARTY', def: 'p' },
	{ id: 'bag', label: 'BAG', def: 'b' },
	{ id: 'bike', label: 'BIKE ON/OFF', def: 'c' },
	{ id: 'find', label: 'FIND (PC BOX SEARCH)', def: 'f' },
	{ id: 'swap', label: 'SWAP MOVE SLOTS (BATTLE)', def: 's' },
	{ id: 'rethrow', label: 'RE-THROW BALL (BATTLE)', def: 'r' },
];
let keyBinds = safeLoad(KEYBIND_KEY, {}); // action id -> custom key
// keys that may never be rebound over: movement, the defaults, system keys
const KEY_RESERVED = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd',
	'z', 'x', 'enter', 'p', 'b', 'c', 'f', 'r', 'escape', 'm', ' ']);
const normKey = k => (k && k.length === 1 ? k.toLowerCase() : k);
function translateKey(k) {
	const kk = normKey(k);
	for (const a of KEY_ACTIONS) if (keyBinds[a.id] && keyBinds[a.id] === kk) return a.def;
	return k;
}
function assignKeyBind(actionId, rawKey) {
	const kk = normKey(rawKey);
	if (kk && kk.toLowerCase() === 'escape') return 'cancelled';
	if (!kk || kk.length > 12 || KEY_RESERVED.has(kk.toLowerCase())) return 'reserved';
	for (const a of KEY_ACTIONS) if (keyBinds[a.id] === kk && a.id !== actionId) delete keyBinds[a.id];
	keyBinds[actionId] = kk;
	safeSave(KEYBIND_KEY, keyBinds);
	return 'bound';
}
// ---------- leave-and-resume for battles ----------
// Hitting the gear (or closing the tab) mid-battle used to vaporize the fight
// AND its ending — a rival or gym win that never landed its flags broke
// progression for good. The battle now persists like a dungeon run: a
// serializable snapshot (battle.snapshot) plus an endSpec tag naming which
// ending to rebuild, written every ~1.5s while a resumable battle runs and on
// pagehide, consumed at boot.
const BATTLE_SAVE_KEY = 'magepunk_battle_v1';
let battleSaveAt = 0, battleSaveDirty = false;
function persistBattle() {
	const resumable = battle.blocking && battle.active && battle.endSpec && !pvp.blocking && !frontier.active;
	if (resumable) {
		const now = performance.now();
		if (now - battleSaveAt < 1500) return;
		battleSaveAt = now;   // even a failed attempt waits — a throwing snapshot must not spin every frame
		try {
			const snap = battle.snapshot();
			if (!snap) return;
			safeSave(BATTLE_SAVE_KEY, { v: 1, snap, end: battle.endSpec, map: world.current.name });
			saveParty(party);   // the party's mid-battle HP/PP must match the snapshot
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
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			Story.setFlag(end.flag);
			syncOverworldAchievements();
		} else if (result === 'victory') {
			Story.setFlag(end.flag);
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		} else saveParty(party);
	};
	if (kind === 'trainer') return result => {
		if (result === 'victory') {
			const t = trainers.list.find(x => x.ev?.script === end.script);
			if (t) trainers.markDefeated(t);
			Bag.earn(end.money || 0);
			saveParty(party);
			if (end.script) onTrainerDefeated(end.script);
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		}
	};
	if (kind === 'strainer') return result => {
		// the blocking cutscene is gone after a reload; land the flags, skip the speech
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			const t = trainers.list.find(x => x.ev?.script === end.script);
			if (t) trainers.markDefeated(t);
			saveParty(party);
			if (end.script) onTrainerDefeated(end.script, { silent: true });
		} else {
			Story.setVar('VAR_RESULT', 0);
			if (result === 'defeat') healParty(party);
		}
	};
	if (kind === 'villain') return result => {
		if (result === 'victory') {
			const beat = Quest.beatAt(end.region, savedMap);
			if (beat) completeVillainBeat(end.region, beat);
		} else { healParty(party); saveParty(party); }
	};
	if (kind === 'rivaltier') return result => {
		Story.setFlag(rivalFlag(end.tier));
		if (result !== 'victory') healParty(party);
		saveParty(party);
	};
	if (kind === 'rivalintro') return result => {
		if (result !== 'victory') healParty(party);
		saveParty(party);
		afterRival(end.region);
	};
	return result => wildBattleEnd(result, !!(safari.on && safariZoneOf(world.current?.map?.id)));
}

function resumeSavedBattle() {
	const saved = safeLoad(BATTLE_SAVE_KEY, null);
	if (!saved || !saved.snap || !party) return false;
	try { localStorage.removeItem(BATTLE_SAVE_KEY); } catch (e) {}   // consume: a crash must not loop
	const snap = saved.snap;
	const onEnd = resumeEndHandler(saved.end, saved.map);
	battle.endSpec = saved.end || { kind: 'wild' };
	battleSaveDirty = true;   // re-arms the tick, which re-saves while it runs
	if (snap.isTrainer) battle.startTrainer(party, snap.foes, snap.info, onEnd, { restore: snap });
	else battle.start(party, snap.foe.speciesId, snap.foe.level, onEnd, null,
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
function bgmTick() {
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
			: radioTune ? radioTune                // a tuned-in radio takes over the room's music
			: player.surfing ? T?.surf
			: player.biking ? T?.bike
			: (musicMap[world.current?.map?.id] || null);
	}
	if (want !== bgmWant) { bgmWant = want; bgm(want); }
}
function syncMapBgm() { bgmTick(); }
getJSON('data/music_map.json').then(m => { musicMap = m || {}; syncMapBgm(); }).catch(() => { musicMap = {}; });
getJSON('data/contest.json').then(d => Contest.init(d)).catch(() => Contest.init(null));

function optionsKey(k) {
	const om = optionsMenu;
	if (om.mode === 'controls') {
		if (om.capture) return; // the raw keydown listener owns the capture
		const rows = KEY_ACTIONS.length + 2; // + RESET ALL + BACK
		if (k === 'ArrowUp') om.idx = (om.idx + rows - 1) % rows;
		if (k === 'ArrowDown') om.idx = (om.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { om.mode = 'main'; om.idx = OPTION_KEYS.length + 3; om.flash = null; return; }
		if (k !== 'z' && k !== 'Enter') return;
		if (om.idx === KEY_ACTIONS.length) { // RESET ALL
			keyBinds = {}; safeSave(KEYBIND_KEY, keyBinds);
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
const daycareMenu = { open: false, mode: 'main', idx: 0, flash: null };
// in-game NPC trade: the offer, then a party picker (see trades.js)
const tradeMenu = { open: false, trade: null, idx: 0, flash: null, talker: null };
const nameRater = { open: false, idx: 0 };
const moveShop = { open: false, mode: 'main', idx: 0, mon: null, list: null, flash: null };

function openDaycare() { daycareMenu.open = true; daycareMenu.mode = 'main'; daycareMenu.idx = 0; daycareMenu.flash = null; }
function openNameRater() { nameRater.open = true; nameRater.idx = 0; }
function openMoveShop() { moveShop.open = true; moveShop.mode = 'main'; moveShop.idx = 0; moveShop.mon = null; moveShop.flash = null; }

// open the Town Map to the region of the current map (or the first visited one)
function openTownMap() {
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

function townKey(k) {
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
function daycareOptions() {
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
	if (Daycare.canDeposit() && party.length > 1) opts.push({ label: 'Leave a POKeMON', act: 'deposit' });
	opts.push({ label: 'See you later', act: 'leave' });
	return opts;
}
// ---------- in-game NPC trades ----------
// One flow for both dialects (see trades.js for why they broke differently).
// Offer -> pick a party POKeMON -> it must be the species they asked for -> swap.
const monName = id => (battle.data?.species?.[id]?.name || id || '').toUpperCase();
function startNpcTrade(trade, talker) {
	if (!party || !party.length) return;
	if (Story.getFlag(Trades.flagFor(trade.key))) {
		dialog.open(`How's ${trade.nickname || monName(trade.give)} doing?\n\nI'm glad we traded.`);
		return;
	}
	dialog.open(`I have a ${monName(trade.give)}.\n\nWould you trade me your ${monName(trade.want)} for it?`, () => {
		tradeMenu.open = true; tradeMenu.trade = trade; tradeMenu.idx = 0;
		tradeMenu.flash = null; tradeMenu.talker = talker || null;
	});
}
function npcTradeKey(k) {
	const t = tradeMenu.trade;
	if (k === 'ArrowUp') tradeMenu.idx = (tradeMenu.idx + party.length - 1) % party.length;
	if (k === 'ArrowDown') tradeMenu.idx = (tradeMenu.idx + 1) % party.length;
	if (k === 'x' || k === 'Escape') { tradeMenu.open = false; dialog.open('Oh… well, maybe another time.'); return; }
	if (k !== 'z' && k !== 'Enter') return;
	const given = party[tradeMenu.idx];
	if (!given || !t) return;
	if (given.speciesId !== t.want) {
		tradeMenu.flash = `That's not a ${monName(t.want)}!`;
		return;
	}
	// your last POKeMON would leave you with an empty party mid-overworld
	if (party.length <= 1) { tradeMenu.flash = "That's your only POKeMON!"; return; }
	const got = Trades.buildTraded(t, given, battle.data, battleBuildMon);
	if (!got) { tradeMenu.flash = 'Something went wrong…'; return; }
	party.splice(tradeMenu.idx, 1);
	party.push(got);
	saveParty(party);
	Dex.markSeen(got.speciesId); Dex.markCaught(got.speciesId); dexMilestoneCheck();
	Story.setFlag(Trades.flagFor(t.key));
	tradeMenu.open = false;
	dialog.open(`You traded your ${monName(t.want)} for ${got.name}!\n\nThanks — take good care of it!`);
	hud.textContent = `Traded ${monName(t.want)} for ${got.name} (Lv${got.level}).`;
}
function drawNpcTrade(W, H) {
	const u = H / 480;
	const t = tradeMenu.trade;
	menuChrome(W, H, u, 'TRADE', t ? `Which POKeMON will you give for ${monName(t.give)}?` : '');
	party.forEach((m, i) => monRow('trade:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, tradeMenu.idx === i, u));
	if (tradeMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(tradeMenu.flash, 24 * u, H - 18 * u);
	}
}

function daycareKey(k) {
	if (daycareMenu.mode === 'deposit') {
		const cands = party.filter((m, i) => i > 0 || party.length > 1); // keep at least one
		if (k === 'ArrowUp') daycareMenu.idx = (daycareMenu.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') daycareMenu.idx = (daycareMenu.idx + 1) % party.length;
		if (k === 'x' || k === 'Escape') { daycareMenu.mode = 'main'; daycareMenu.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			if (party.length <= 1) { daycareMenu.flash = "You can't leave your last POKeMON!"; return; }
			const mon = party[daycareMenu.idx];
			if (!mon || !Daycare.canDeposit()) return;
			party.splice(daycareMenu.idx, 1);
			Daycare.deposit(mon);
			saveParty(party);
			daycareMenu.flash = `Left ${mon.name} at the Day Care.`;
			daycareMenu.mode = 'main'; daycareMenu.idx = 0;
		}
		return;
	}
	const opts = daycareOptions();
	if (k === 'ArrowUp') daycareMenu.idx = (daycareMenu.idx + opts.length - 1) % opts.length;
	if (k === 'ArrowDown') daycareMenu.idx = (daycareMenu.idx + 1) % opts.length;
	if (k === 'x' || k === 'Escape') { daycareMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const o = opts[daycareMenu.idx];
		if (!o) return;
		if (o.act === 'leave') { daycareMenu.open = false; return; }
		if (o.act === 'deposit') { daycareMenu.mode = 'deposit'; daycareMenu.idx = 0; daycareMenu.flash = null; return; }
		if (o.act === 'withdraw') {
			const info = Daycare.withdrawInfo(o.slot, battle.data, levelCapNow());
			if (!Bag.spend(info.cost)) { daycareMenu.flash = "You don't have enough money!"; return; }
			const mon = Daycare.withdraw(o.slot, battle.data, levelCapNow());
			const where = addCaught(party, mon);
			daycareMenu.flash = `Got ${mon.name} back! ${where === 'box' ? '(sent to the box)' : ''}`;
			saveParty(party);
			daycareMenu.idx = 0;
		}
		if (o.act === 'egg') {
			const baby = Daycare.collectEgg(battle.data, canLearn); // egg moves filter through TM/level-up compat
			if (baby) {
				Dex.markCaught(baby.speciesId); dexMilestoneCheck();
				const where = addCaught(party, baby);
				Journal.add(`The EGG hatched into ${baby.name}!`);
				daycareMenu.flash = `The EGG hatched into ${baby.name}! ${where === 'box' ? '(sent to the box)' : ''}`;
			}
			daycareMenu.idx = 0;
		}
	}
}

// ---- name rater ----
function nameRaterKey(k) {
	if (k === 'ArrowUp') nameRater.idx = (nameRater.idx + party.length - 1) % party.length;
	if (k === 'ArrowDown') nameRater.idx = (nameRater.idx + 1) % party.length;
	if (k === 'x' || k === 'Escape') { nameRater.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const mon = party[nameRater.idx];
		if (mon) promptRename(mon);
	}
}
// A caught POKeMON could only ever be named by walking to the NAME RATER —
// setNickname existed and nothing but that NPC ever called it. Ask at the moment
// of capture, which is when you actually care and when the games ask.
function offerNickname(mon) {
	if (!mon) return;
	Journal.add(`Caught ${mon.name} (Lv${mon.level})`); // every catch path funnels through here
	dialog.open(`Give a nickname to ${mon.name}?\n\nZ = Yes   X = No`, declined => {
		if (declined !== 'x') promptRename(mon);
	});
}
// rename via the browser prompt (headless-safe: no prompt -> unchanged)
function promptRename(mon) {
	const speciesName = battle.data.species[mon.speciesId]?.name?.toUpperCase() || mon.name;
	let name = null;
	try { name = typeof prompt === 'function' ? prompt(`New name for ${mon.name}? (blank = ${speciesName})`, mon.name) : null; } catch (e) {}
	if (name == null) return;
	setNickname(mon, name);
}
function setNickname(mon, name) {
	const clean = String(name).trim().slice(0, 12);
	const speciesName = battle.data.species[mon.speciesId]?.name?.toUpperCase() || mon.name;
	mon.name = clean || speciesName;
	saveParty(party);
	nameRater.open = false;
}

// ---- move deleter / reminder ----
function relearnable(mon) {
	const sp = battle.data.species[mon.speciesId];
	const known = new Set(mon.moves.map(m => m.id));
	const seen = new Set();
	const out = [];
	for (const [lv, id] of (sp?.learnset || [])) {
		if (lv <= mon.level && !known.has(id) && !seen.has(id) && battle.data.moves[id]) {
			seen.add(id); out.push(id);
		}
	}
	return out;
}
function moveShopKey(k) {
	const m = moveShop;
	if (m.mode === 'main') {
		if (k === 'ArrowUp') m.idx = (m.idx + 1) % 2;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % 2;
		if (k === 'x' || k === 'Escape') { m.open = false; return; }
		if (k === 'z' || k === 'Enter') { m.mode = m.idx === 0 ? 'pick-delete' : 'pick-relearn'; m.idx = 0; }
		return;
	}
	if (m.mode === 'pick-delete' || m.mode === 'pick-relearn') {
		if (k === 'ArrowUp') m.idx = (m.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % party.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'main'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			m.mon = party[m.idx];
			if (m.mode === 'pick-delete') { m.mode = 'delete-move'; m.idx = 0; }
			else { m.list = relearnable(m.mon); m.mode = 'relearn-move'; m.idx = 0; if (!m.list.length) m.flash = `${m.mon.name} has no moves to recall.`; }
		}
		return;
	}
	if (m.mode === 'delete-move') {
		const moves = m.mon.moves;
		if (k === 'ArrowUp') m.idx = (m.idx + moves.length - 1) % moves.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % moves.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'pick-delete'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			if (moves.length <= 1) { m.flash = "It can't forget its only move!"; return; }
			const gone = moves.splice(m.idx, 1)[0];
			saveParty(party);
			m.flash = `${m.mon.name} forgot ${gone.name}.`;
			m.mode = 'main'; m.idx = 0;
		}
		return;
	}
	if (m.mode === 'relearn-move') {
		const list = m.list || [];
		if (!list.length) { if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') { m.mode = 'main'; m.idx = 0; } return; }
		if (k === 'ArrowUp') m.idx = (m.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % list.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'pick-relearn'; m.idx = 0; return; }
		if (k === 'z' || k === 'Enter') {
			const id = list[m.idx];
			const info = battle.data.moves[id];
			if (m.mon.moves.length < 4) {
				m.mon.moves.push({ id, name: info.name, pp: info.pp, maxPp: info.pp });
				saveParty(party);
				m.flash = `${m.mon.name} recalled ${info.name}!`;
				m.mode = 'main'; m.idx = 0;
			} else {
				bagMenu.forget = { itemId: null, mid: id, mon: m.mon, idx: 0, keepItem: true };
				bagMenu.open = true; bagMenu.picking = false;
				m.open = false;
			}
		}
		return;
	}
}

// full species list for the Pokédex, sorted by dex number (built once)
// dex filters (Batch 6): narrow the 1,751-entry national list by type, region,
// and caught-status — the completionist lens. Cycled by T/R/F in dexKey.
const DEX_TYPES = ['ALL', 'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
const DEX_REGIONS = [['ALL', () => true], ['KANTO', n => n >= 1 && n <= 151], ['JOHTO', n => n >= 152 && n <= 251], ['HOENN', n => n >= 252 && n <= 386], ['OTHER', n => n > 386 || n < 1]];
const DEX_CAUGHT = ['ALL', 'OWNED', 'SEEN', 'MISSING'];
const DEX_GRID_COLS = 12; // the LIVING DEX completion grid
function dexAll() {
	if (dexMenu._all) return dexMenu._all;
	const sp = battle.data.species;
	// standard dex (positive nums) first, ascending; fakemon/custom (num <= 0)
	// after, ordered by magnitude so they group sensibly
	const key = n => (n > 0 ? n : 100000 + Math.abs(n || 99999));
	dexMenu._all = Object.keys(sp)
		.map(id => ({ id, num: sp[id].num || 9999, name: sp[id].name, types: sp[id].types || [] }))
		.sort((a, b) => key(a.num) - key(b.num) || a.name.localeCompare(b.name));
	return dexMenu._all;
}
function dexList() {
	const t = DEX_TYPES[dexMenu.typeI || 0];
	const inRegion = DEX_REGIONS[dexMenu.regionI || 0][1];
	const cf = DEX_CAUGHT[dexMenu.caughtI || 0];
	if (!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI)) return dexAll(); // unfiltered: the full list
	return dexAll().filter(e => {
		if (t !== 'ALL' && !e.types.includes(t)) return false;
		if (!inRegion(e.num)) return false;
		if (cf !== 'ALL') {
			const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
			if (cf === 'OWNED' && !caught) return false;
			if (cf === 'SEEN' && !(seen && !caught)) return false;
			if (cf === 'MISSING' && caught) return false;
		}
		return true;
	});
}
function dexFilterLabel() {
	return `${DEX_TYPES[dexMenu.typeI || 0]} · ${DEX_REGIONS[dexMenu.regionI || 0][0]} · ${DEX_CAUGHT[dexMenu.caughtI || 0]}`;
}
const friendsMenu = { open: false, idx: 0 };
// MAIL BATTLES: correspondence Pokémon matches (server-authoritative, played a
// turn at a time whenever each side gets around to it — see async-act in mp.mjs)
const mailMenu = { open: false, idx: 0, rows: [], loading: false };
let mailWaiting = 0; // matches waiting on ME, shown as a badge on the START menu

// the FireRed-style START menu (items depend on Test Realm mode)
function startItems() {
	const items = ['POKeDEX', 'POKeMON', 'CARDS'];
	if (MP_ON) items.push('FRIENDS', mailWaiting > 0 ? `MAIL (${mailWaiting})` : 'MAIL');
	// BIKE had exactly ONE trigger in the whole game — the `c` key. There is no
	// touch button for it and bike items are kind:'key', which the bag doesn't
	// action, so a phone player could never mount up — and cracked floors are
	// gated on player.biking, which made SKY PILLAR literally impassable on a
	// phone. Hidden while surfing, where toggleBike refuses anyway.
	items.push('BAG', 'TOWN MAP', 'PC');
	if (!player.surfing) items.push(player.biking ? 'ON FOOT' : 'BIKE');
	items.push('CARD', 'QUEST', 'SAVE', 'OPTION', 'EXIT');
	return items;
}
const cardsItems = () => MP_ON
	? ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'CHALLENGE FRIEND', 'BACK']
	: ['GALLERY', 'DECK BUILDER', 'PACKS', 'DUNGEON RUN', 'BACK'];
// DUNGEON RUN opens a submenu of the three run modes
const runModeItems = () => ['OG DUNGEON RUN', 'DALARAN HEIST', 'TOMBS OF TERROR', 'DUELS', 'BACK'];
const CARD_URLS = {
	'GALLERY': 'viewer.html', 'DECK BUILDER': 'deck.html', 'PACKS': 'packs.html',
	'OG DUNGEON RUN': '?dungeon=1', 'DALARAN HEIST': '?heist=1', 'TOMBS OF TERROR': '?tombs=1', 'DUELS': '?duels=1',
};
function openCardPage(label) {
	const q = MP_ON ? (label === 'DUNGEON RUN' ? '&mp=1' : '?mp=1') : '';
	const path = CARD_URLS[label];
	location.href = '/battlecards/' + (path.startsWith('?') ? path + (MP_ON ? '&mp=1' : '') : path + (MP_ON ? '?mp=1' : ''));
}

function startKey(k) {
	const items = startItems();
	if (k === 'ArrowUp') startMenu.idx = (startMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') startMenu.idx = (startMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape' || k === 'Enter') { startMenu.open = false; return; }
	if (k === 'z') {
		const it = items[startMenu.idx];
		startMenu.open = false;
		if (it === 'POKeMON') { partyMenu.open = true; partyMenu.idx = 0; partyMenu.summary = false; }
		else if (it === 'BAG') { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.flash = null; }
		else if (it === 'CARDS') { cardsMenu.open = true; cardsMenu.idx = 0; }
		else if (it === 'FRIENDS') { openFriends(); }
		else if (it.startsWith('MAIL')) { openMailbox(); }
		else if (it === 'POKeDEX') { dexMenu.open = true; dexMenu.idx = 0; dexMenu.detail = false; dexMenu.grid = false; }
		else if (it === 'CARD') { trainerCard.open = true; trainerCard.page = 0; }
		else if (it === 'QUEST') { questMenu.open = true; questMenu.idx = 0; questMenu.page = 0; }
		else if (it === 'TOWN MAP') { openTownMap(); }
		else if (it === 'BIKE' || it === 'ON FOOT') { toggleBike(); }
		// the PC was reachable ONLY at a CENTER counter, yet a catch on a full
		// party silently goes to a box you then could not open
		else if (it === 'PC') { pcMenu.open = true; }
		else if (it === 'SAVE') { saveParty(party); savePos(); dialog.open('Your journey has been saved.'); }
		else if (it === 'OPTION') { optionsMenu.open = true; optionsMenu.idx = 0; optionsMenu.mode = 'main'; optionsMenu.flash = null; optionsMenu.busy = false; }
		else if (it === 'EXIT' && visiting) { leaveVisit(); }
		// EXIT just closes
	}
}

function questKey(k) {
	// ◄ ► flips between the quest LOG (page 0) and the THINGS TO DO checklist (1)
	if (k === 'ArrowLeft' || k === 'ArrowRight') { questMenu.page = 1 - questMenu.page; questMenu.idx = 0; return; }
	const n = questMenu.page === 1 ? THINGS_TO_DO.length : Quest.log(playerRegion()).length;
	if (k === 'ArrowUp') questMenu.idx = (questMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') questMenu.idx = (questMenu.idx + 1) % n;
	if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') questMenu.open = false;
}

function playerMenuKey(k) {
	const items = PLAYER_MENU_ITEMS;
	if (k === 'ArrowUp') playerMenu.idx = (playerMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') playerMenu.idx = (playerMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { playerMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const it = items[playerMenu.idx];
		const who = playerMenu.target;
		playerMenu.open = false;
		if (!who) return;
		const f = friends.find(fr => fr.username === who) || { username: who };
		if (it === 'POKeMON BATTLE') sendChallenge(f);
		else if (it === 'MAIL BATTLE') sendMailChallenge(f);
		else if (it === 'CARD BATTLE') sendCardChallenge(f);
		else if (it === 'TRADE') startTrade(f);
		// CANCEL just closes
	}
}
function drawPlayerMenu(W, H) {
	drawVertical(W, H, H / 480, playerMenu.target || 'PLAYER',
		'Challenge them or offer a trade.', PLAYER_MENU_ITEMS, playerMenu.idx, 'player');
}
// the deck-selection phase: list the account's class decks (10+ cards) and call
// onPick({ classId, count, deck }). Auto-picks when there's only one option.
async function openDeckSelect(prompt, onPick) {
	let st; try { st = await MP.freshState(); } catch (e) { st = MP.cachedState(); }
	const decks = ((st && st.decks) || [])
		.filter(d => d && Array.isArray(d.cards) && d.cards.length >= 40)
		.map(d => ({ classId: d.classId, count: d.cards.length, deck: d.cards, name: d.name, id: d.id, commander: d.commander || null, companion: d.companion || null }));
	if (!decks.length) { dialog.open('You have no decks :('); return; }
	if (decks.length === 1) { onPick(decks[0]); return; }
	deckSelect.open = true; deckSelect.idx = 0; deckSelect.decks = decks;
	deckSelect.onPick = onPick; deckSelect.prompt = prompt || 'Choose your deck';
}
function deckSelectKey(k) {
	const n = deckSelect.decks.length;
	if (k === 'ArrowUp') deckSelect.idx = (deckSelect.idx + n - 1) % n;
	if (k === 'ArrowDown') deckSelect.idx = (deckSelect.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { deckSelect.open = false; deckSelect.onPick = null; return; }
	if (k === 'z' || k === 'Enter') {
		const picked = deckSelect.decks[deckSelect.idx], cb = deckSelect.onPick;
		deckSelect.open = false; deckSelect.onPick = null;
		if (cb && picked) cb(picked);
	}
}
function drawDeckSelect(W, H) {
	const labels = deckSelect.decks.map(d => `${(d.name || d.classId).toUpperCase()}  ·  ${d.classId.replace(/_/g, ' ')} (${d.count})`);
	drawVertical(W, H, H / 480, 'SELECT DECK', deckSelect.prompt, labels, deckSelect.idx, 'deck');
}
function offerLines(o) {
	const out = [];
	if (!o) return out;
	for (const [id, n] of Object.entries(o.cards || {})) out.push(`${prettyId(id)} x${n}`);
	if (o.packs) out.push(`Card Pack x${o.packs}`);
	for (const m of (o.pokemon || [])) out.push(`${m.name} Lv.${m.level}`);
	for (const it of (o.items || [])) out.push(`${Bag.nameOf(it.id)} x${it.count}`);
	return out;
}
function drawTrade(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'TRADE — ' + trade.them, trade.status || '', false);
	sctx.textAlign = 'left';
	const panel = (x, title, offer, accepted) => {
		sctx.font = `bold ${11 * u}px monospace`;
		sctx.fillStyle = accepted ? '#7CFC7C' : '#fff';
		sctx.fillText(title + (accepted ? '  ✓' : ''), x, 70 * u);
		sctx.font = `${9 * u}px monospace`;
		const lines = offerLines(offer);
		let y = 86 * u;
		if (!lines.length) { sctx.fillStyle = '#888'; sctx.fillText('(nothing)', x, y); }
		else for (const ln of lines.slice(0, 8)) { sctx.fillStyle = '#dfe3ee'; sctx.fillText(ln, x, y); y += 13 * u; }
	};
	panel(24 * u, 'YOUR OFFER', trade.mine, trade.myAccept);
	panel(W / 2 + 12 * u, `${trade.them}'S OFFER`, trade.theirs, trade.theirAccept);
	// category tabs + hint
	sctx.font = `bold ${9 * u}px monospace`;
	TRADE_CATS.forEach((c, i) => { sctx.fillStyle = i === trade.cat ? '#ffd25f' : '#8892a8'; sctx.fillText(c, (24 + i * 66) * u, 208 * u); });
	sctx.fillStyle = '#8892a8'; sctx.font = `${7 * u}px monospace`;
	sctx.fillText('< > category   up/down move   Z add / X remove', 24 * u, 222 * u);
	// inventory + action rows
	const rows = trade.rows, listTop = 236 * u, rowH = 19 * u;
	const maxRows = Math.max(1, Math.floor((H - listTop - 10 * u) / rowH));
	const start = Math.max(0, Math.min(trade.idx - (maxRows >> 1), Math.max(0, rows.length - maxRows)));
	for (let vi = 0; vi < Math.min(maxRows, rows.length); vi++) {
		const i = start + vi, r = rows[i]; if (!r) break;
		const y = listTop + vi * rowH, sel = i === trade.idx, bx = 24 * u, bw = W - 48 * u;
		if (sel) { sctx.fillStyle = 'rgba(255,210,95,0.22)'; sctx.fillRect(bx, y, bw, rowH - 3 * u); }
		sctx.fillStyle = r.kind === 'cancel' ? '#ff8a8a' : r.kind === 'accept' ? '#7CFC7C' : '#fff';
		sctx.font = `${9 * u}px monospace`;
		let lab = r.label;
		if (r.owned != null) lab += `   x${r.owned}` + (r.off ? `  → offering ${r.off}` : '');
		else if (r.off) lab += '  (offered)';
		sctx.fillText(lab, bx + 8 * u, y + 13 * u);
		menuUi.push({ id: 'trade:' + i, x: bx, y, w: bw, h: rowH - 3 * u, label: '' });
	}
}

function dexKey(k) {
	const list = dexList();
	if (dexMenu.detail) {
		if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
		// 1,366 cries shipped and the dex never played one — Z gives it a voice
		if (k === 'z' || k === 'Enter') { const e = list[dexMenu.idx]; if (e && Dex.isSeen(e.id)) cry(e.id); }
		if (k === 'x' || k === 'Escape') dexMenu.detail = false;
		return;
	}
	// T / R / F cycle the type, region and caught-status filters
	if (k === 't' || k === 'r' || k === 'f') {
		if (k === 't') dexMenu.typeI = ((dexMenu.typeI || 0) + 1) % DEX_TYPES.length;
		if (k === 'r') dexMenu.regionI = ((dexMenu.regionI || 0) + 1) % DEX_REGIONS.length;
		if (k === 'f') dexMenu.caughtI = ((dexMenu.caughtI || 0) + 1) % DEX_CAUGHT.length;
		dexMenu.idx = 0;
		return;
	}
	// G toggles the LIVING DEX grid (a visual completion wall) vs the list
	if (k === 'g') { dexMenu.grid = !dexMenu.grid; return; }
	if (!list.length) { if (k === 'x' || k === 'Escape') dexMenu.open = false; return; }
	// the grid steps a full row (DEX_GRID_COLS) up/down; the list steps a page of 9
	const rowStep = dexMenu.grid ? DEX_GRID_COLS : 9;
	if (dexMenu.grid) {
		if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - 1);
		if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + 1);
		if (k === 'ArrowUp') dexMenu.idx = Math.max(0, dexMenu.idx - rowStep);
		if (k === 'ArrowDown') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + rowStep);
	} else {
		if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
		if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
		if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - rowStep);
		if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + rowStep);
	}
	if (k === 'z' || k === 'Enter') { const e = list[dexMenu.idx]; if (e && Dex.isSeen(e.id)) dexMenu.detail = true; }
	if (k === 'x' || k === 'Escape') dexMenu.open = false;
}

function cardsKey(k) {
	const items = cardsItems();
	if (k === 'ArrowUp') cardsMenu.idx = (cardsMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') cardsMenu.idx = (cardsMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { cardsMenu.open = false; return; }
	if (k === 'z') {
		const it = items[cardsMenu.idx];
		if (it === 'BACK') { cardsMenu.open = false; startMenu.open = true; return; }
		if (it === 'CHALLENGE FRIEND') { cardsMenu.open = false; openFriends('card'); return; }
		if (it === 'DUNGEON RUN') { cardsMenu.open = false; runMenu.open = true; runMenu.idx = 0; return; }
		saveParty(party); savePos();
		openCardPage(it);
	}
}

// the run-mode submenu: OG Dungeon Run / Dalaran Heist / Tombs of Terror
function runKey(k) {
	const items = runModeItems();
	if (k === 'ArrowUp') runMenu.idx = (runMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') runMenu.idx = (runMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { runMenu.open = false; cardsMenu.open = true; return; }
	if (k === 'z') {
		const it = items[runMenu.idx];
		if (it === 'BACK') { runMenu.open = false; cardsMenu.open = true; return; }
		saveParty(party); savePos();
		openCardPage(it);
	}
}

// ---- friends ----
const friendsChallenge = { mode: null }; // null | 'card' | 'pokemon'
async function openFriends(challengeType) {
	friendsChallenge.mode = challengeType || null;
	friendsMenu.open = true;
	friendsMenu.idx = 0;
	friendsMenu.badges = null;
	refreshFriendBadges(); // the inbox row fills in as the counts land
	await refreshFriends();
}
// pending battle challenges + trade offers, surfaced as the INBOX badge —
// async PvP existed but nothing TOLD you a challenge was waiting
async function refreshFriendBadges() {
	if (!MP_ON) { friendsMenu.badges = { ch: 0, tr: 0 }; return; }
	try {
		const [c, t] = await Promise.all([MP.call('challenges'), MP.call('trade-list')]);
		friendsMenu.badges = { ch: (c?.challenges || []).length, tr: (t?.trades || []).length };
	} catch (e) { friendsMenu.badges = { ch: 0, tr: 0 }; }
}
async function refreshFriends() {
	if (!MP_ON) return;
	const data = await MP.call('friends');
	if (data.friends) { friends = data.friends; if (mpAccount) mpAccount.friendCode = data.friendCode; }
}
function friendsKey(k) {
	// rows: [Add friend] [Inbox] then each friend
	const rows = 2 + friends.length;
	if (k === 'ArrowUp') friendsMenu.idx = (friendsMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') friendsMenu.idx = (friendsMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { friendsMenu.open = false; return; }
	if (k === 'z') {
		if (friendsMenu.idx === 0) { promptAddFriend(); return; }
		if (friendsMenu.idx === 1) { friendsMenu.open = false; openTradeInbox(); return; }
		const f = friends[friendsMenu.idx - 2];
		if (!f) return;
		friendAction(f);
	}
}
async function promptAddFriend() {
	const code = (prompt('Enter your friend\'s 6-letter code:') || '').toUpperCase().trim();
	if (!/^[A-Z]{6}$/.test(code)) { if (code) dialog.open('That is not a valid 6-letter friend code.'); return; }
	const data = await MP.call('add-friend', { code });
	if (data.error) { dialog.open(data.error); return; }
	await refreshFriends();
	dialog.open(`Added ${data.added} as a friend!`);
}
function friendAction(f) {
	if (friendsChallenge.mode === 'card') {
		friendsMenu.open = false; friendsChallenge.mode = null;
		if (!f.online) { dialog.open(`${f.username} is offline right now.`); return; }
		sendCardChallenge(f);
		return;
	}
	if (!f.online) {
		// offline is exactly when the ASYNC options matter
		friendsMenu.open = false;
		dialog.open(`${f.username} is offline right now.\n\nZ = Offer a POKeMON trade   X = Cancel`, declined => {
			if (declined !== 'x') openTradeOffer(f);
		});
		return;
	}
	friendsMenu.open = false;
	// battling friend → offer to spectate; otherwise a challenge/visit choice
	if ((f.status || '').startsWith('battling:')) {
		const matchId = f.status.slice('battling:'.length);
		dialog.open(`${f.username} is in a battle!\n\nPress Z to SPECTATE, X to cancel.`, (declined) => {
			if (declined !== 'x') enterMatch(matchId, true);
		});
		return;
	}
	// friend is in a card game → offer to watch it (navigates to Battlecards)
	if ((f.status || '').startsWith('card:')) {
		const mode = f.status.slice('card:'.length);
		const what = mode === 'dungeon' ? 'dungeon run' : 'card battle';
		dialog.open(`${f.username} is in a ${what}!  Z=Watch  X=Cancel`, (declined) => {
			if (declined !== 'x') location.href = '/battlecards/?spectate=' + encodeURIComponent(f.username) + '&mp=1';
		});
		return;
	}
	if ((f.status || '').startsWith('factory:')) {
		const label = f.status.slice('factory:'.length) || 'BATTLE FRONTIER';
		dialog.open(`${f.username} is in the ${label}!\n\nZ = Watch   X = Cancel`, (declined) => {
			if (declined !== 'x') location.href = '/overworld/?watchfactory=' + encodeURIComponent(f.username) + '&mp=1';
		});
		return;
	}
	dialog.open(`${f.username}:  Z=Battle challenge  X=More…`, (declined) => {
		if (declined !== 'x') { sendChallenge(f); return; }
		dialog.open(`${f.username}:  Z=Visit world  X=Offer a trade`, (d2) => {
			if (d2 === 'x') openTradeOffer(f);
			else visitWorld(f);
		});
	});
}
// ---------- BP EXCHANGE (spend Battle Frontier points) ----------
const bpShopMenu = { open: false, idx: 0, onClose: null };
function bpItemName(id) { return (Bag.ITEMS[id]?.name || id).toUpperCase(); }
function openBpShop(onClose) { bpShopMenu.open = true; bpShopMenu.idx = 0; bpShopMenu.onClose = onClose || null; }
function closeBpShop() { bpShopMenu.open = false; const cb = bpShopMenu.onClose; bpShopMenu.onClose = null; if (cb) cb(); }
function bpShopKey(k) {
	const items = Frontier.BP_SHOP;
	if (k === 'ArrowUp') bpShopMenu.idx = (bpShopMenu.idx + items.length - 1) % items.length;
	if (k === 'ArrowDown') bpShopMenu.idx = (bpShopMenu.idx + 1) % items.length;
	if (k === 'x' || k === 'Escape') { closeBpShop(); return; }
	if (k === 'z' || k === 'Enter') {
		const it = items[bpShopMenu.idx];
		if (Frontier.getBP() < it.cost) { dialog.open(`Not enough BP.\n\n${bpItemName(it.id)} costs ${it.cost} BP;\nyou have ${Frontier.getBP()}.`); return; }
		Frontier.spendBP(it.cost); Bag.addItem(it.id); Bag.registerName(it.id, bpItemName(it.id));
		dialog.open(`You exchanged BP for a ${bpItemName(it.id)}!\n\nBP remaining: ${Frontier.getBP()}.`);
	}
}
function drawBpShopMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'BP EXCHANGE', `You have ${Frontier.getBP()} BP.    (X to leave)`);
	Frontier.BP_SHOP.forEach((it, i) => {
		const bid = 'bp:' + i;
		const b = { id: bid, x: 24 * u, y: (80 + i * 40) * u, w: W - 48 * u, h: 34 * u,
			label: `${bpItemName(it.id)}   —   ${it.cost} BP`, center: true, kbSel: bpShopMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || bpShopMenu.idx === i, u);
	});
}
const ferryMenu = { open: false, idx: 0 };
const FERRY_DESTS = [
	{ label: 'Vermilion Harbor (Kanto)', file: 'SSAnne_Exterior' },
	{ label: 'Olivine Port (Johto)', file: 'OlivinePort' },
	{ label: 'Slateport Harbor (Hoenn)', file: 'SlateportCity_Harbor' },
	// post-game island routes — a champion's SEAGALLOP / EON ferry to the orphaned lairs
	{ label: 'Sevii Islands (Seagallop)', file: 'OneIsland', requires: () => Badges.isChampion('KANTO') },
	{ label: 'Southern Island (Eon)', file: 'SouthernIsland_Exterior', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Birth Island', file: 'BirthIsland_Exterior', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Faraway Island', file: 'FarawayIsland_Entrance', requires: () => Badges.isChampion('HOENN') },
	{ label: 'Battle Frontier', file: 'BattleFrontier_OutsideWest', requires: () => Badges.isChampion('HOENN') },
	// NAVEL ROCK — 22 connected maps that had no inbound edge from anywhere, so
	// the whole island was unreachable. It is Kanto's answer to Hoenn's event
	// islands: a long climb to HO-OH at the top and a long descent to LUGIA at
	// the bottom. FRLG gives it no wild encounters either — the emptiness of the
	// climb is the design, the legendary is the payoff.
	{ label: 'Navel Rock (Seagallop)', file: 'NavelRock_Harbor', requires: () => Badges.isChampion('KANTO') },
	// S.S. TIDAL — three maps wired to each other and to nothing else. This port
	// has its own ferry, so the decomp's boarding state machine stays blocked and
	// you simply walk aboard. regionparity_test asserts Scott's cameo is armed in
	// the corridor; until now that was a map nobody could stand on.
	{ label: 'S.S. Tidal (Hoenn liner)', file: 'SSTidalCorridor' },
];
function ferryKey(k) {
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name && (!d.requires || d.requires()));
	if (k === 'ArrowUp') ferryMenu.idx = (ferryMenu.idx + dests.length - 1) % dests.length;
	if (k === 'ArrowDown') ferryMenu.idx = (ferryMenu.idx + 1) % dests.length;
	if (k === 'x' || k === 'Escape') ferryMenu.open = false;
	if (k === 'z' || k === 'Enter') {
		const dest = dests[ferryMenu.idx];
		ferryMenu.open = false;
		moveToMap(dest.file).then(() => dialog.open(`The ferry sets sail...\n\nWelcome to ${dest.label}!`));
	}
}
// inter-region PORTAL destination menu (opened from a portal pad). dests = the two
// other shared regions' same-tier gym towns (portals.js destsFor); + a Cancel row.
const portalMenu = { open: false, idx: 0, dests: [], town: null };
function portalKey(k) {
	const n = portalMenu.dests.length + 1; // + Cancel
	if (k === 'ArrowUp') portalMenu.idx = (portalMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') portalMenu.idx = (portalMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { portalMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		if (portalMenu.idx >= portalMenu.dests.length) { portalMenu.open = false; return; } // Cancel
		const d = portalMenu.dests[portalMenu.idx];
		portalMenu.open = false;
		travelPortal(d);
	}
}
// step through: flip the current region so all region logic tracks you, then fly to the
// destination town's PC-front landing (right beside that town's own portal pad). flyTo's
// refreshMapContent re-registers the Fly point + reloads content under the new region.
function travelPortal(d) {
	safeSaveStr('magepunk_region', d.regionLower);
	flyTo(d.mapId, d.x, d.y).then(() => { refreshObjective(); dialog.open(`You step through the PORTAL...\n\nWelcome to ${d.town}!`); });
}
// one-time teaching moment: the FIRST time a cross-region tier wall turns the player
// back, explain the badge-thirds rule + point them at the PORTAL. Villain seals and
// the pre-starter bounce don't count — only a real tier gate (qb.need > 0).
function maybePortalTutorial(qb) {
	if (!qb || qb.villain || !(qb.need > 0) || Story.getFlag('tut_portal_seen')) return;
	Story.setFlag('tut_portal_seen');
	dialog.open('The way ahead is sealed!\n\n'
		+ 'GYM badges now come in THIRDS — you must beat this tier’s GYM in ALL THREE regions before the next one opens anywhere.\n\n'
		+ 'Look for the glowing PORTAL pad beside any GYM town’s POKeMON CENTER. It flies you to the other regions’ same-tier GYM towns. Beat their GYMS, then come back to advance!');
}
const shopMenu = { open: false, idx: 0, mode: 'buy', fromScript: false };
// items the mart will buy back (must have a price); sell yields half
function sellList() {
	return Object.entries(Bag.getBag())
		.filter(([id, n]) => n > 0 && Bag.ITEMS[id]?.price > 0)
		.map(([id, n]) => ({ id, n }));
}
const sellPrice = id => Math.floor((Bag.ITEMS[id]?.price || 0) / 2);
const bagMenu = { open: false, idx: 0, picking: false, pickIdx: 0, pocket: 0 };
// POCKETS. The bag was one flat list of up to 305 items in raw insertion order,
// seven rows at a time — balls, potions, TMs, berries, mints, vitamins and key
// items in a single undifferentiated column, and only TWO rows in a portrait
// battle. Every item already carries a `kind`, so the tabs cost nothing to key
// off; the ordering within a pocket is alphabetical rather than "whatever you
// picked up first".
const BAG_POCKETS = [
	{ id: 'all', label: 'ALL', test: () => true },
	{ id: 'ball', label: 'BALLS', test: it => it?.kind === 'ball' },
	{ id: 'heal', label: 'MEDICINE', test: it => ['heal', 'revive', 'cure', 'ether'].includes(it?.kind) },
	{ id: 'berry', label: 'BERRIES', test: (it, id) => /berry$/.test(id) },
	{ id: 'held', label: 'HELD', test: (it, id) => it?.kind === 'held' && !/berry$/.test(id) },
	{ id: 'tm', label: 'TMs', test: (it, id) => it?.kind === 'tm' || !!tmMoveId(id) },
	{ id: 'key', label: 'KEY', test: it => ['key', 'charm', 'seeker', 'rod', 'form'].includes(it?.kind) },
	{ id: 'misc', label: 'OTHER', test: it => !it || ['misc', 'sell', 'candy', 'vitamin', 'mint', 'capsule', 'stone'].includes(it.kind) },
];
function bagEntries() {
	const p = BAG_POCKETS[bagMenu.pocket] || BAG_POCKETS[0];
	return Object.entries(Bag.getBag())
		.filter(([id, n]) => n > 0 && p.test(Bag.ITEMS[id], id))
		.sort((a, b) => Bag.nameOf(a[0]).localeCompare(Bag.nameOf(b[0])));
}
// side 0 = party (deposit), 1 = box (withdraw). Storage stays ONE flat array
// (trade/dex read it whole); the 8 "boxes" are 30-slot pages over it.
const PC_BOXES = 8, PC_BOX_CAP = 30;
const PC_SORTS = ['dex', 'level', 'shiny', 'name'];
const pcMenu = { open: false, side: 0, idx: 0, box: 0, sort: 'dex', confirm: null, releaseMode: false, flash: null, filter: null };

// the search view: real storage indices whose mon matches the query. A query is
// a name/species fragment, an exact type, or the word "shiny" — enough to find
// one mon in 1,700 without paging 60 boxes.
function pcMatches(box, q) {
	const out = [];
	box.forEach((m, i) => {
		const hit = q === 'shiny' ? !!m.shiny
			: (m.name || '').toLowerCase().includes(q) || (m.speciesId || '').includes(q)
				|| (m.types || []).some(t => t.toLowerCase() === q);
		if (hit) out.push(i);
	});
	return out;
}
// prompt-based like promptRename: headless-safe (no prompt -> filter unchanged)
function pcPromptSearch() {
	if (typeof prompt !== 'function') return;
	const q = prompt('Search storage: name, species, a type, or "shiny". Leave empty to clear.', pcMenu.filter || '');
	if (q == null) return;
	pcMenu.filter = q.trim().toLowerCase() || null;
	pcMenu.side = pcMenu.filter ? 1 : pcMenu.side;
	pcMenu.idx = 0;
	pcMenu.flash = pcMenu.filter ? `Searching for "${pcMenu.filter}".` : 'Search cleared.';
}

function getBox() {
	const b = safeLoad('magepunk_box_v1', []);
	return Array.isArray(b) ? b : [];
}
function setBox(box) {
	safeSave('magepunk_box_v1', box);
}
// total shinies owned across the party and PC boxes (Trainer Card, Batch 6c)
function shinyOwnedCount() {
	return (party || []).filter(m => m?.shiny).length + getBox().filter(m => m?.shiny).length;
}
// snapshot the current frame (the Trainer Card is up) → PNG, then share it via the
// Web Share API when available, else save it as a download. Mirrors battlecards'
// deck/replay sharing. Returns the data URL (for tests). (Batch 6 follow-up)
async function shareTrainerCard() {
	let url;
	try { url = screen.toDataURL('image/png'); } catch (e) { return null; }
	const name = localStorage.getItem('magepunk_name') || 'TRAINER';
	const fname = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-trainer-card.png`;
	try {
		const blob = await (await fetch(url)).blob();
		const file = new File([blob], fname, { type: 'image/png' });
		if (navigator.canShare && navigator.canShare({ files: [file] })) {
			await navigator.share({ files: [file], title: 'Trainer Card', text: `${name}'s Magepunk trainer card` });
			hud.textContent = 'Shared your Trainer Card!';
			return url;
		}
	} catch (e) { /* share unavailable or cancelled → save instead */ }
	try {
		const a = document.createElement('a');
		a.href = url; a.download = fname;
		document.body.appendChild(a); a.click(); a.remove();
		hud.textContent = 'Saved your Trainer Card as an image.';
	} catch (e) { /* no-op */ }
	return url;
}

function shopKey(k) {
	// TAB / left-right flips between BUY and SELL
	if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
		shopMenu.mode = shopMenu.mode === 'buy' ? 'sell' : 'buy';
		shopMenu.idx = 0;
		return;
	}
	const list = shopMenu.mode === 'buy' ? shopStockNow() : sellList();
	const n = Math.max(1, list.length);
	if (k === 'ArrowUp') shopMenu.idx = (shopMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') shopMenu.idx = (shopMenu.idx + 1) % n;
	if (k === 'z' || k === 'Enter') {
		if (shopMenu.mode === 'buy') {
			const id = shopStockNow()[shopMenu.idx];
			const bought = Bag.buy(id);
			sfx(bought ? 'money' : 'ui_denied');
			shopMenu.flash = bought ? `Bought ${Bag.ITEMS[id].name}!` : 'Not enough money!';
		} else {
			const entry = sellList()[shopMenu.idx];
			if (entry) {
				const gain = sellPrice(entry.id);
				Bag.consume(entry.id);
				Bag.earn(gain);
				sfx('money');
				shopMenu.flash = `Sold ${Bag.ITEMS[entry.id].name} for $${gain}.`;
				const after = sellList();
				if (shopMenu.idx >= after.length) shopMenu.idx = Math.max(0, after.length - 1);
			}
		}
	}
	if (k === 'x' || k === 'Escape') {
		shopMenu.open = false;
		// a script-opened mart (clerk `openmart`) resumes its script on close
		if (shopMenu.fromScript) { shopMenu.fromScript = false; cutscene.resume(); }
	}
}

function useRareCandy(mon) {
	// a RARE CANDY can't buy its way past the cap either
	if (mon.level >= levelCapNow() || mon.level >= Badges.MAX_LEVEL || mon.curHP <= 0) return false;
	mon.level++;
	mon.exp = Math.max(mon.exp ?? 0, Badges.expForLevel(mon.level));
	const sp = battle.data.species[mon.speciesId];
	const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
	const oldMax = mon.maxHP;
	mon.stats = statsFor(sp, ivs, mon.level, mon);
	mon.maxHP = mon.stats.hp;
	mon.curHP = Math.min(mon.maxHP, mon.curHP + (mon.maxHP - oldMax));
	saveParty(party);
	evolution.check(party, battle.data);
	return true;
}

// Gen3 TM/HM numbering -> move id; Crystal-style ids embed the move name
// (tmraindance). Teaching consumes the TM.
const GEN3_TM = [null, 'focuspunch', 'dragonclaw', 'waterpulse', 'calmmind', 'roar', 'toxic',
	'hail', 'bulkup', 'bulletseed', 'hiddenpower', 'sunnyday', 'taunt', 'icebeam', 'blizzard',
	'hyperbeam', 'lightscreen', 'protect', 'raindance', 'gigadrain', 'safeguard', 'frustration',
	'solarbeam', 'irontail', 'thunderbolt', 'thunder', 'earthquake', 'return', 'dig', 'psychic',
	'shadowball', 'brickbreak', 'doubleteam', 'reflect', 'shockwave', 'flamethrower', 'sludgebomb',
	'sandstorm', 'fireblast', 'rocktomb', 'aerialace', 'torment', 'facade', 'secretpower', 'rest',
	'attract', 'thief', 'steelwing', 'skillswap', 'snatch', 'overheat'];
const GEN3_HM = [null, 'cut', 'fly', 'surf', 'strength', 'flash', 'rocksmash', 'waterfall', 'dive'];
function tmMoveId(id) {
	let m = /^tm(\d+)$/.exec(id);
	if (m) return GEN3_TM[+m[1]] || null;
	m = /^hm(\d+)$/.exec(id);
	if (m) return GEN3_HM[+m[1]] || null;
	m = /^tm([a-z0-9]+)$/.exec(id);
	if (m && battle.data.moves[m[1]]) return m[1];
	// ...and the same for a NAMED HM. Crystal's item balls hold `hmwaterfall`,
	// which only had the numbered `hm(\d+)` branch to fall through and so taught
	// nothing.
	m = /^hm([a-z]+)$/.exec(id);
	if (m && battle.data.moves[m[1]]) return m[1];
	m = /^tm\d+([a-z][a-z0-9]*)$/.exec(id); // decomp pickups: ITEM_TM24_THUNDERBOLT -> tm24thunderbolt
	if (m && battle.data.moves[m[1]]) return m[1];
	return null;
}
// species Showdown's dex knows at all — fakemon outside it use a type fallback
let _tmKnown = null;
const tmKnown = () => _tmKnown || (_tmKnown = new Set(battle.data.tmLearn?.__species || []));
function canLearn(mon, mid) {
	if (battle.data.extra?.[mon.speciesId]?.learn?.includes(mid)) return true;
	if ((battle.data.species[mon.speciesId]?.learnset || []).some(([, id2]) => id2 === mid)) return true;
	// machine/tutor compatibility (tm_learnsets.json) — the whole point of TMs
	const learners = battle.data.tmLearn?.[mid];
	if (Array.isArray(learners)) {
		if (learners.includes(mon.speciesId)) return true;
		// fakemon the dex data has never heard of: allow same-type + Normal machines
		if (!tmKnown().has(mon.speciesId)) {
			const t = battle.data.moves[mid]?.type;
			return t === 'Normal' || (battle.data.species[mon.speciesId]?.types || []).includes(t);
		}
	}
	return false;
}

// fishing: cast a rod from the bag while facing water. Rod tiers read the
// classic Gen3 slot bands of the map's fishing table (0-1 / 2-4 / 5-9).
function castRod(id, item) {
	bagMenu.open = false;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
	if (!world.isSurfable(fx, fy)) {
		dialog.open('No good — you need to face the water to fish.');
		return;
	}
	// 60% the fish bites; the rod tier decides which slot band you can hook (encounters.fish)
	const hit = Math.random() <= 0.6 ? encounters.fish(world.current.map.id, item.tier) : null;
	if (!hit) { dialog.open(`You cast the ${item.name}...\n\nNot even a nibble.`); return; }
	dialog.open(`You cast the ${item.name}...\n\nOh! A bite!`, () => startWildBattle(hit));
}

function bagKey(k) {
	const entries = bagEntries();
	// forgetting a move to make room for a TM
	if (bagMenu.forget) {
		const f = bagMenu.forget;
		if (k === 'ArrowUp') f.idx = (f.idx + 3) % 4;
		if (k === 'ArrowDown') f.idx = (f.idx + 1) % 4;
		if (k === 'x' || k === 'Escape') { bagMenu.forget = null; bagMenu.picking = false; }
		if (k === 'z' || k === 'Enter') {
			const info = battle.data.moves[f.mid];
			const old = f.mon.moves[f.idx];
			f.mon.moves[f.idx] = { id: f.mid, name: info.name, pp: info.pp, maxPp: info.pp };
			if (f.itemId && !f.keepItem) Bag.consume(f.itemId);
			saveParty(party);
			bagMenu.flash = `Forgot ${old.name}, learned ${info.name}!`;
			bagMenu.forget = null;
			bagMenu.picking = false;
		}
		return;
	}
	if (bagMenu.picking) {
		if (k === 'ArrowUp') bagMenu.pickIdx = (bagMenu.pickIdx + party.length - 1) % party.length;
		if (k === 'ArrowDown') bagMenu.pickIdx = (bagMenu.pickIdx + 1) % party.length;
		if (k === 'x' || k === 'Escape') bagMenu.picking = false;
		if (k === 'z' || k === 'Enter') {
			const [id] = entries[bagMenu.idx] || [];
			const item = Bag.ITEMS[id];
			const mon = party[bagMenu.pickIdx];
			if (mon) {
				if (item && item.kind === 'heal' && mon.curHP > 0 && (mon.curHP < mon.maxHP || (item.cures && mon.status))) {
					Bag.consume(id);
					mon.curHP = Math.min(mon.maxHP, mon.curHP + item.amount);
					if (item.cures) mon.status = null; // FULL RESTORE clears status too
					saveParty(party);
					bagMenu.picking = false;
				} else if (item?.kind === 'cure') {
					// ANTIDOTE and friends bite only on the status they treat;
					// FULL HEAL on any of them.
					const AILMENT = { psn: 'poisoned', par: 'paralyzed', slp: 'asleep', brn: 'burned', frz: 'frozen' };
					if (!mon.status || mon.curHP <= 0) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else if (item.cures !== 'any' && mon.status !== item.cures) bagMenu.flash = `${mon.name} isn't ${AILMENT[item.cures] || 'affected'}.`;
					else {
						Bag.consume(id);
						mon.status = null;
						saveParty(party);
						bagMenu.flash = `${mon.name} was cured!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'revive' && mon.curHP <= 0) {
					Bag.consume(id);
					mon.curHP = Math.floor(mon.maxHP / 2);
					mon.status = null;
					saveParty(party);
					bagMenu.picking = false;
				} else if (item?.kind === 'form') {
					// cycles rather than opening a submenu: keep using it and you walk
					// the whole family and come back to the base, which is also how you
					// undo it. The PRISM is never consumed — it is a dex tool.
					const family = formsOf(mon.speciesId);
					if (!family || family.length < 2) {
						bagMenu.flash = `${mon.name} has no other form.`;
					} else {
						const became = cycleForm(mon);
						saveParty(party);
						bagMenu.flash = became ? `${mon.name} shifted into ${became.toUpperCase()}!` : `Nothing happened.`;
					}
				} else if (item?.kind === 'candy' && useRareCandy(mon)) {
					Bag.consume(id);
					bagMenu.picking = false;
				} else if (item?.kind === 'candy' && mon.level >= levelCapNow() && mon.level < Badges.MAX_LEVEL) {
					// say why, instead of the candy silently doing nothing
					bagMenu.flash = `${mon.name} is at the LEVEL CAP (Lv${levelCapNow()}).`;
				} else if (item?.kind === 'vitamin') {
					mon.evs = mon.evs || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
					const total = Object.values(mon.evs).reduce((a, b) => a + b, 0);
					if (mon.evs[item.stat] >= 252 || total >= 510) {
						bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					} else {
						Bag.consume(id);
						mon.evs[item.stat] = Math.min(252, mon.evs[item.stat] + Math.min(10, 510 - total));
						const sp = battle.data.species[mon.speciesId];
						const ivs = mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
						const oldMax = mon.maxHP;
						mon.stats = statsFor(sp, ivs, mon.level, mon);
						mon.maxHP = mon.stats.hp;
						mon.curHP = Math.min(mon.maxHP, mon.curHP + Math.max(0, mon.maxHP - oldMax));
						saveParty(party);
						bagMenu.flash = `${mon.name}'s ${item.name} raised its stats!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'mint') {
					// overwrite the battle nature and recompute (the vitamin recipe)
					if (mon.nature === item.nature) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else {
						Bag.consume(id);
						mon.nature = item.nature;
						const sp = battle.data.species[mon.speciesId];
						const dmg = mon.maxHP - mon.curHP;
						mon.stats = statsFor(sp, mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, mon.level, mon);
						mon.maxHP = mon.stats.hp;
						mon.curHP = Math.max(1, mon.maxHP - dmg);
						saveParty(party);
						bagMenu.flash = `${mon.name} became ${item.nature.toUpperCase()} natured!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'capsule') {
					// cycle to the species' next listed ability
					const opts = battle.data.abilities?.[mon.speciesId] || [];
					if (opts.length < 2) bagMenu.flash = `It won't have any effect on ${mon.name}.`;
					else {
						Bag.consume(id);
						mon.ability = opts[(Math.max(0, opts.indexOf(mon.ability)) + 1) % opts.length];
						saveParty(party);
						bagMenu.flash = `${mon.name}'s ability became ${String(mon.ability).toUpperCase()}!`;
						bagMenu.picking = false;
					}
				} else if (item?.kind === 'ether' && mon.curHP > 0 && mon.moves.some(m => m.pp < m.maxPp)) {
					Bag.consume(id);
					for (const mv of mon.moves) mv.pp = Math.min(mv.maxPp, mv.pp + item.amount);
					saveParty(party);
					bagMenu.picking = false;
				} else if ((item?.kind === 'stone' || item?.kind === 'held') && mon.curHP > 0
					&& (battle.data.extra?.[mon.speciesId]?.evos || [])
						.some(e => e.type === 'item' && e.param === id && battle.data.species[e.target])) {
					// an evolution item the selected species responds to
					const evo = battle.data.extra[mon.speciesId].evos
						.find(e => e.type === 'item' && e.param === id && battle.data.species[e.target]);
					Bag.consume(id);
					bagMenu.picking = false;
					bagMenu.open = false;
					evolution.evolveNow(mon, evo.target, battle.data);
				} else if (item?.kind === 'held') {
					// give the item; anything already held returns to the bag
					Bag.consume(id);
					if (mon.heldItem) Bag.addItem(mon.heldItem);
					mon.heldItem = id;
					saveParty(party);
					bagMenu.picking = false;
				} else if (item?.kind === 'stone') {
					bagMenu.flash = `It won't have any effect on ${mon.name}.`;
				} else if (tmMoveId(id)) {
					const mid = tmMoveId(id);
					const info = battle.data.moves[mid];
					if (!info) bagMenu.flash = 'The disc is blank...';
					else if (mon.moves.some(mv => mv.id === mid)) bagMenu.flash = `${mon.name} already knows ${info.name}!`;
					else if (!canLearn(mon, mid)) bagMenu.flash = `${mon.name} can't learn ${info.name}.`;
					else if (mon.moves.length < 4) {
						mon.moves.push({ id: mid, name: info.name, pp: info.pp, maxPp: info.pp });
						if (!['hm', 'tm'].includes(Bag.ITEMS[id]?.kind)) Bag.consume(id); // HMs + mart TMs are reusable
						saveParty(party);
						bagMenu.flash = `${mon.name} learned ${info.name}!`;
						bagMenu.picking = false;
					} else {
						bagMenu.forget = { itemId: id, mid, mon, idx: 0, keepItem: ['hm', 'tm'].includes(Bag.ITEMS[id]?.kind) };
					}
				}
			}
		}
		return;
	}
	if (k === 'ArrowUp' && entries.length) bagMenu.idx = (bagMenu.idx + entries.length - 1) % entries.length;
	if (k === 'ArrowDown' && entries.length) bagMenu.idx = (bagMenu.idx + 1) % entries.length;
	// left/right change pocket (they did nothing here before)
	if (k === 'ArrowLeft' || k === 'ArrowRight') {
		const d = k === 'ArrowLeft' ? BAG_POCKETS.length - 1 : 1;
		bagMenu.pocket = (bagMenu.pocket + d) % BAG_POCKETS.length;
		bagMenu.idx = 0;
	}
	if (k === 'x' || k === 'Escape' || k === 'b') bagMenu.open = false;
	if ((k === 'z' || k === 'Enter') && entries.length) {
		const [id] = entries[bagMenu.idx];
		const item = Bag.ITEMS[id];
		if (item?.kind === 'rod') { castRod(id, item); return; }
		if (item?.kind === 'repel') {
			if (repelSteps > 0) { bagMenu.flash = 'A REPEL is already working.'; return; }
			Bag.consume(id);
			setRepel(item.steps || 100);
			safeSaveStr(REPEL_LAST_KEY, id); // the wear-off prompt re-offers this same kind
			bagMenu.flash = `${item.name} will keep weak POKeMON away for ${item.steps} steps.`;
			return;
		}
		// the three gadget key-items, inert since day one
		if (useGadget(id)) return;
		// the glass flutes: reusable, 250 steps of melody
		if (item?.kind === 'flute') {
			fluteState = { mode: item.mode, steps: item.steps || 250 };
			saveFlute();
			sfx('ui_select');
			bagMenu.flash = item.mode === 'black'
				? `${item.name}: a hush falls — wild POKeMON keep away for ${item.steps} steps.`
				: `${item.name}: a bright trill — wild POKeMON stir for ${item.steps} steps!`;
			return;
		}
		if (item?.kind === 'seeker') {
			// VS SEEKER: re-arm this map's beaten trainers at badge-scaled levels
			const region = playerRegion();
			const tier = Badges.count(region) + (Badges.isChampion?.(region) ? 4 : 0);
			const armed = trainers.rearmMap(tier);
			bagMenu.flash = armed
				? `VS SEEKER: ${armed} trainer${armed === 1 ? '' : 's'} on this map want${armed === 1 ? 's' : ''} a rematch!`
				: 'No defeated trainers respond around here.';
			return;
		}
		if (['heal', 'revive', 'candy', 'ether', 'held', 'stone', 'vitamin', 'mint', 'capsule'].includes(item?.kind) || tmMoveId(id)) {
			bagMenu.picking = true;
			bagMenu.pickIdx = 0;
		}
	}
}

// sort the whole storage (the box pages are windows onto the sorted list)
function pcSortStorage(mode) {
	const box = getBox();
	const dex = (a, b) => Math.abs(a.num || 999) - Math.abs(b.num || 999);
	const key = {
		dex,
		level: (a, b) => b.level - a.level,
		shiny: (a, b) => (b.shiny ? 1 : 0) - (a.shiny ? 1 : 0) || dex(a, b),
		name: (a, b) => a.name.localeCompare(b.name),
	}[mode] || dex;
	box.sort(key);
	setBox(box);
}

function pcKey(k) {
	const box = getBox();
	const pageStart = pcMenu.box * PC_BOX_CAP;
	// with a search active the box side is the hit list across ALL boxes; the
	// view carries real storage indices so withdraw/release cut the right mon
	const viewIdx = pcMenu.filter != null ? pcMatches(box, pcMenu.filter) : null;
	const page = viewIdx ? viewIdx.map(i => box[i]) : box.slice(pageStart, pageStart + PC_BOX_CAP);
	const realIdx = i => (viewIdx ? viewIdx[i] : pageStart + i);
	const list = pcMenu.side === 0 ? party : page;
	// release confirm: Z lets it go, X keeps it (confirm holds the REAL index)
	if (pcMenu.confirm != null) {
		if (k === 'z' || k === 'Enter') {
			const gone = box[pcMenu.confirm];
			if (gone) {
				box.splice(pcMenu.confirm, 1);
				setBox(box);
				pcMenu.flash = `${gone.name} was released. Bye-bye, ${gone.name}!`;
			}
			pcMenu.confirm = null;
			pcMenu.idx = 0;
		} else if (k === 'x' || k === 'Escape' || k === 'r') pcMenu.confirm = null;
		return;
	}
	if (k === 'f') { pcPromptSearch(); return; }
	if (k === 'Tab') { pcMenu.side ^= 1; pcMenu.idx = 0; return; }
	if (k === 'ArrowLeft' || k === 'ArrowRight') {
		if (pcMenu.side === 0) { pcMenu.side = 1; pcMenu.idx = 0; }
		else if (viewIdx) { // paging makes no sense inside a search — leave it first
			pcMenu.filter = null;
			pcMenu.idx = 0;
			pcMenu.flash = 'Search cleared.';
		} else { // page through the boxes
			pcMenu.box = (pcMenu.box + (k === 'ArrowRight' ? 1 : PC_BOXES - 1)) % PC_BOXES;
			pcMenu.idx = 0;
		}
		return;
	}
	if (k === 'ArrowUp' && list.length) pcMenu.idx = (pcMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown' && list.length) pcMenu.idx = (pcMenu.idx + 1) % list.length;
	if (k === 'x' || k === 'Escape') { pcMenu.open = false; pcMenu.flash = null; pcMenu.releaseMode = false; pcMenu.filter = null; }
	if (k === 'r' && pcMenu.side === 1 && page[pcMenu.idx]) { pcMenu.confirm = realIdx(pcMenu.idx); return; }
	if (k === 's') {
		pcMenu.sort = PC_SORTS[(PC_SORTS.indexOf(pcMenu.sort) + 1) % PC_SORTS.length];
		pcSortStorage(pcMenu.sort);
		pcMenu.flash = `Sorted storage by ${pcMenu.sort.toUpperCase()}.`;
		return;
	}
	if ((k === 'z' || k === 'Enter') && list.length) {
		if (pcMenu.side === 0) {
			if (party.length <= 1) return; // never deposit the last mon
			if (box.length >= PC_BOXES * PC_BOX_CAP) { pcMenu.flash = 'The storage system is full!'; return; }
			const [m] = party.splice(pcMenu.idx, 1);
			// deposit into the viewed box while it has room, else the first free slot
			box.splice(page.length < PC_BOX_CAP ? pageStart + page.length : box.length, 0, m);
			setBox(box);
			saveParty(party);
		} else {
			if (party.length >= 6 || !page[pcMenu.idx]) return;
			const [m] = box.splice(realIdx(pcMenu.idx), 1);
			party.push(m);
			setBox(box);
			saveParty(party);
		}
		pcMenu.idx = 0;
	}
}

function starterKey(k) {
	if (starterMenu.phase === 'pick') {
		// locked to the chosen region's trio; ←/→ pick among its 3 starters
		if (k === 'ArrowLeft') starterMenu.col = (starterMenu.col + 2) % 3;
		if (k === 'ArrowRight') starterMenu.col = (starterMenu.col + 1) % 3;
		if (k === 'z' || k === 'Enter') {
			const region = starterMenu.region, col = starterMenu.col;
			starterMenu.open = false;
			finishStarterPick(region, col);
		}
		return;
	}
	// phase 'region': ↑/↓ choose the region you'll begin in (no starter yet — you
	// pick that on-screen once the intro walks you into the professor's lab)
	if (k === 'ArrowUp') starterMenu.row = (starterMenu.row + 2) % 3;
	if (k === 'ArrowDown') starterMenu.row = (starterMenu.row + 1) % 3;
	if (k === 'z' || k === 'Enter') {
		const region = STARTERS[starterMenu.row].region;
		starterMenu.open = false;
		beginNewGame(region);
	}
}

// one entry point for keyboard AND the virtual touch buttons
function pressKey(k) {
	// the little sounds: every open menu ticks, confirms and cancels audibly —
	// one hook covers all of them; battle and dialog beep from their own paths
	if (!dialog.blocking && !battle.blocking && !cutscene.blocking && canvasMenuOpen()) {
		if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) sfx('ui_move');
		else if (k === 'z' || k === 'Enter') sfx('ui_select');
		else if (k === 'x' || k === 'Escape') sfx('ui_cancel');
	}
	if (starterMenu.open) { starterKey(k); return; }
	if (dialog.blocking) { if (k === 'z' || k === 'Enter' || k === 'x') sfx('text_tick'); dialog.key(k); return; }
	// a clerk's `openmart` parks its cutscene in a wait WHILE the counter is up,
	// so the shop must keep taking input — otherwise the player can neither buy
	// nor close it and the script never resumes
	if (shopMenu.open && shopMenu.fromScript) { shopKey(k); return; }
	if (cutscene.blocking) return; // a running cutscene swallows all other input
	if (evolution.blocking) { evolution.key(k); return; }
	if (battle.blocking) { battle.key(k); return; }
	if (pvp.blocking) { pvp.key(k); return; }
	if (factorySpec.blocking) { factorySpec.key(k); return; }
	if (trade.open) { tradeKey(k); return; }
	if (playerMenu.open) { playerMenuKey(k); return; }
	if (deckSelect.open) { deckSelectKey(k); return; }
	if (radioMenu.open) { radioKey(k); return; }
	if (unownDex.open) { unownDexKey(k); return; }
	if (startMenu.open) { startKey(k); return; }
	if (cardsMenu.open) { cardsKey(k); return; }
	if (runMenu.open) { runKey(k); return; }
	if (friendsMenu.open) { friendsKey(k); return; }
	if (mailMenu.open) { mailKey(k); return; }
	if (ferryMenu.open) { ferryKey(k); return; }
	if (portalMenu.open) { portalKey(k); return; }
	if (bpShopMenu.open) { bpShopKey(k); return; }
	if (shopMenu.open) { shopKey(k); return; }
	if (bagMenu.open) { bagKey(k); return; }
	if (pcMenu.open) { pcKey(k); return; }
	if (vfMenu.open) { vfKey(k); return; }
	if (gcMenu.open) { gcKey(k); return; }
	if (contestMenu.open) { contestKey(k); return; }
	if (blendMenu.open) { blendKey(k); return; }
	if (slideMenu.open) { slideKey(k); return; }
	if (decoMenu.open) { decoKey(k); return; }
	if (socialMenu.open) { socialKey(k); return; }
	if (slotsMenu.open) { slotsKey(k); return; }
	if (dexMenu.open) { dexKey(k); return; }
	if (townMap.open) { townKey(k); return; }
	if (tradeMenu.open) { npcTradeKey(k); return; }
	if (daycareMenu.open) { daycareKey(k); return; }
	if (nameRater.open) { nameRaterKey(k); return; }
	if (moveShop.open) { moveShopKey(k); return; }
	if (optionsMenu.open) { optionsKey(k); return; }
	if (questMenu.open) { questKey(k); return; }
	if (trainerCard.open) {
		if (k === 'ArrowLeft' || k === 'ArrowRight') { trainerCard.page = 1 - trainerCard.page; return; }
		if (k === 's') { shareTrainerCard(); return; } // snapshot -> share/save
		if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') trainerCard.open = false;
		return;
	}
	if (partyMenu.open) {
		// the per-POKeMON action menu (field moves / summary / switch)
		if (partyMenu.action) {
			const a = partyMenu.action;
			if (k === 'ArrowUp') a.idx = (a.idx + a.options.length - 1) % a.options.length;
			if (k === 'ArrowDown') a.idx = (a.idx + 1) % a.options.length;
			if (k === 'x' || k === 'Escape') { partyMenu.action = null; return; }
			if (k === 'z' || k === 'Enter') {
				const opt = a.options[a.idx];
				if (opt.kind === 'field') useFieldMove(opt.hm, a.mon);
				else if (opt.kind === 'summary') { partyMenu.action = null; partyMenu.summary = true; }
				else if (opt.kind === 'switch') {
					// SWITCH used to only ever promote to lead — there was no way to move
					// slot 5 to slot 3, or to demote the lead. Now it arms a swap and the
					// SECOND pick completes it.
					partyMenu.swapFrom = a.monIdx;
					partyMenu.action = null;
				} else partyMenu.action = null; // cancel
			}
			return;
		}
		if (partyMenu.summary) {
			// summary view: up/down cycles party members, X closes
			if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
			if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
			if (k === 'x' || k === 'Escape') partyMenu.summary = false;
			return;
		}
		if (k === 'ArrowUp') partyMenu.idx = (partyMenu.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') partyMenu.idx = (partyMenu.idx + 1) % party.length;
		if (k === 'z' || k === 'Enter') {
			if (partyMenu.swapFrom != null && partyMenu.swapFrom !== partyMenu.idx) {
				const i = partyMenu.swapFrom, j = partyMenu.idx;
				[party[i], party[j]] = [party[j], party[i]];
				saveParty(party); refreshFollower();
				partyMenu.swapFrom = null;
			} else if (partyMenu.swapFrom === partyMenu.idx) {
				partyMenu.swapFrom = null;                 // tapping the same slot cancels
			} else openPartyAction(partyMenu.idx);        // choose an action for this mon
		}
		if (k === 'x' || k === 'p' || k === 'Escape') { if (partyMenu.swapFrom != null) partyMenu.swapFrom = null; else partyMenu.open = false; }
		return;
	}
	if ((k === 'Enter' || k === 'm') && !loading) { sfx('ui_open'); startMenu.open = true; startMenu.idx = 0; return; }
	if (k === 'p' && !loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (k === 'b' && !loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.flash = null; return; }
	if (k === 'c' && !loading) { toggleBike(); return; }
	if (k === 'z' && !loading) interact();
}
// any menu that consumes direction presses instead of walking
// just the full-res canvas menus (the SW x MH band) — no dialogs/battles/scenes
const canvasMenuOpen = () => starterMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || partyMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open
	|| trade.open || startMenu.open || playerMenu.open || deckSelect.open || radioMenu.open || unownDex.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open
	|| daycareMenu.open || nameRater.open || moveShop.open || optionsMenu.open || questMenu.open || mailMenu.open
	|| tradeMenu.open || gcMenu.open || vfMenu.open || contestMenu.open || blendMenu.open || slideMenu.open || decoMenu.open || socialMenu.open || slotsMenu.open;
const menuBlocking = () => dialog.blocking || evolution.blocking || cutscene.blocking
	|| battle.blocking || pvp.blocking || factorySpec.blocking || canvasMenuOpen() || fading();

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
		if (menuBlocking()) { pressKey(ARROW[dir]); return; }  // menus want discrete presses
		dpadPointer = e.pointerId;
		setDpadDir(dir);
	});
}
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
tb.addEventListener('pointerdown', () => { runHeld = true; });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) tb.addEventListener(ev, () => { runHeld = false; });

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
		menuHover = null;
		for (const b of menuUi) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) menuHover = b.id;
	}
});
// touch leaves the last pointermove hover latched on a button forever — clear
// it when the finger lifts so nothing stays falsely highlighted
const clearHovers = e => {
	if (e.pointerType === 'mouse') return; // a mouse keeps hovering after release
	if (battle.active) battle.active.hover = null;
	if (pvp.active) pvp.active.hover = null;
	menuHover = null;
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
		for (const b of menuUi) {
			if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { menuTap(b.id); return; }
		}
	}
});

// ---------- map transitions ----------
// per-map ported scripts + resolved text (lazy-loaded, cached)
let mapScripts = {}, mapStrings = {};
const scriptCache = new Map();
async function loadMapScripts(stem) {
	mapScripts = {}; mapStrings = {};
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
	mapScripts = { ...sharedScripts, ...(c.scr || {}) };
	mapStrings = c.str || {};
}

// fire-and-forget: warm the sprites a battle on THIS map would need (party
// back-sprites + the local encounter table's fronts) so a wild encounter
// doesn't stall on cold sprite fetches with the screen frozen. getImage
// memoizes, so battle start() finds these already resolved.
function warmBattleSprites() {
	try {
		const warm = f => { if (f) getImage(`data/pokemon/${f}`).catch(() => {}); };
		for (const m of party || []) if (m?.sprite) warm(m.sprite.replace(/\.(png|gif)$/, '-b.$1'));
		const groups = encounters.data?.[world.current?.map?.id] || {};
		const ids = new Set();
		for (const kind of ['land', 'water']) for (const s of groups[kind]?.slots || []) if (s.id != null) ids.add(s.id);
		let n = 0;
		for (const id of ids) { if (n++ >= 12) break; warm(battle.data?.species?.[id]?.sprite); }
	} catch { /* prefetch is best-effort */ }
}

async function refreshMapContent(label) {
	strengthActive = false; strengthHinted = false; // STRENGTH must be re-used per map
	trickHouseOpenDoors(label);
	shoalFixup(label);
	silphDoorsApply(label);
	hillPrepFloor(label); // must precede npcs.loadForMap — it injects the guards
	roamersOnMapChange();
	radioTune = null; // leaving the room switches the radio off; map track resumes
	if (!/^SecretBase_/.test(label || '')) baseCtx = null; // left the base

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
	// arriving on a Fly-destination map registers it so you can fly back later
	markFlyPoint(world.current.map.id);
	savePos();
	loading = false;
	refreshFollower();
	warmBattleSprites();
	// run this map's ON_TRANSITION script (story vars, scene setup), then check
	// for an ON_FRAME auto-cutscene now that the map is set up. Guard the ported
	// plot triggers: a throwing story script must not break map entry itself
	// (the map is already loaded + loading cleared above).
	try { runMapTransition(); } catch (e) { console.warn('[plot] onTransition failed', e); if (cutscene.blocking) cutscene.stop(); }
	try { checkOnFrame(); } catch (e) { console.warn('[plot] onFrame failed', e); if (cutscene.blocking) cutscene.stop(); }
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
function hasFlyPoint(mapId) { return loadFlyPoints().has(mapId); }

// nearest walkable tile to a preferred spot (spiral search)
function findLanding(px, py) {
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
function findSurfLanding(px, py) {
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
function afterLoadError(where, err) {
	console.warn(`[load-guard] ${where} failed`, err);
	loading = false;
	if (cutscene.blocking) cutscene.stop();
	hud.textContent = "That area couldn't be loaded.";
}

async function moveToMap(file, px, py) {
	await fadeTo(1);              // dip to black before the swap (fades in below)
	loading = true;
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

async function warpTo(mapId, destWarpId) {
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
	loading = true;
	try {
		await world.load(file);
		let idx = parseInt(destWarpId, 10);
		if (isNaN(idx) || idx < 0) idx = 0;
		const w = world.warps[idx] || world.warps[0];
		if (w) player.setTile(w.x, w.y);
		else player.setTile(Math.floor(world.current.layout.width / 2), Math.floor(world.current.layout.height / 2));
		world.lastWarpSource = source;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('warpTo ' + mapId, e); }
	fadeTo(0);                   // reveal the destination
}

// Fly: warp straight to a town's landing tile (no warp-index lookup)
async function flyTo(mapId, tx, ty) {
	const file = world.fileFor(mapId);
	if (!file) { console.warn('unknown fly dest', mapId); return; }
	loading = true;
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
async function backWarp() {
	// in-memory source first, then the one saved alongside the position (this is
	// what survives a reload)
	const src = world.lastWarpSource || safeLoad(POS_KEY, null)?.back || null;
	// src.name is a map FILE stem (what world.load takes) — not a MAP_ id, so it
	// must not be validated through fileFor(), which maps ids TO stems.
	if (src?.name) {
		loading = true;
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

// ---------- Mach Bike ----------
// A free field toggle: faster movement, and the only way across Sky Pillar's
// cracked floors (engine gates those on player.biking). You can't bike on the
// water, so surfing dismounts it.
const BIKES = ['bicycle', 'machbike', 'acrobike'];
function toggleBike() {
	if (loading || player.moving || player.surfing) return;
	// you need to OWN a bike now (getting off always works) — the shops in
	// Goldenrod, Mauville, and Cerulean hand out free promotional ones
	if (!player.biking && !BIKES.some(b => Bag.count(b) > 0)) {
		hud.textContent = "You don't own a BIKE! The shops in GOLDENROD, MAUVILLE, and CERULEAN are running promos.";
		return;
	}
	player.biking = !player.biking;
	const name = Bag.count('machbike') ? 'MACH BIKE' : Bag.count('acrobike') ? 'ACRO BIKE' : 'BICYCLE';
	hud.textContent = player.biking ? `You got on the ${name}!` : `You got off the ${name}.`;
}
// the bike-shop promo: your first bike, on the house
const BIKE_SHOP_STOCK = {
	MAP_GOLDENROD_BIKE_SHOP: ['bicycle', 'GOLDENROD CYCLES'],
	MAP_MAUVILLE_CITY_BIKE_SHOP: ['machbike', "RYDEL'S CYCLES"],
	MAP_CERULEAN_CITY_BIKE_SHOP: ['bicycle', 'the CERULEAN BIKE SHOP'],
};
function bikeShopTalk() {
	const stock = BIKE_SHOP_STOCK[world.current?.map?.id];
	if (!stock) return;
	const [bike, shopName] = stock;
	if (BIKES.some(b => Bag.count(b) > 0)) {
		dialog.open(`CLERK: Enjoying the ride? Press C out on the\nroad any time — and tell your friends about\n${shopName}!`);
		return;
	}
	dialog.open(`CLERK: Welcome to ${shopName}!\n\nIt's your lucky day — our grand promotion!\nA free ${Bag.ITEMS[bike].name} for every new rider!\n\nTake it?   Z = Yes   X = No`, d => {
		if (d === 'x') return;
		Bag.addItem(bike, 1);
		sfx('item_get');
		Journal.add(`Got a free ${Bag.ITEMS[bike].name} from ${shopName}!`);
		dialog.open(`You received the ${Bag.ITEMS[bike].name}!\n\nPress C outdoors to ride it.`);
	});
}

// ---------- Silph Co locked doors ----------
// FireRed closes these with ON_LOAD scripts our port never ran, so every
// shutter stood open and the CARD KEY (a real item ball on 5F) opened
// nothing. The barrier tiles are harvested from silphco_doors.inc: without
// the key they lock (collision set in place, art untouched); with it, the
// floor's shutters slide open. The 5F key sits OUTSIDE its floor's shutters,
// so the climb can never strand.
const SILPH_DOORS = {
	SilphCo_2F: [[5, 8], [6, 8], [5, 9], [6, 9], [5, 15], [6, 15], [5, 16], [6, 16]],
	SilphCo_3F: [[9, 11], [10, 11], [9, 12], [10, 12], [9, 13], [10, 13], [20, 11], [21, 11], [20, 12], [21, 12], [20, 13], [21, 13]],
	SilphCo_4F: [[3, 16], [4, 16], [3, 17], [4, 17], [14, 11], [15, 11], [14, 12], [15, 12]],
	SilphCo_5F: [[7, 17], [8, 17], [7, 18], [8, 18], [7, 19], [8, 19], [18, 12], [19, 12], [18, 13], [19, 13], [18, 14], [19, 14]],
	SilphCo_7F: [[11, 8], [12, 8], [11, 9], [12, 9], [24, 7], [25, 7], [24, 8], [25, 8], [25, 13], [26, 13], [25, 14], [26, 14]],
	SilphCo_9F: [[2, 9], [3, 9], [2, 10], [3, 10], [2, 11], [3, 11], [12, 15], [13, 15], [12, 16], [13, 16], [12, 17], [13, 17], [21, 6], [22, 6], [21, 7], [22, 7], [21, 12], [22, 12], [21, 13], [22, 13]],
};
let silphNoted = false;
function silphDoorsApply(label) {
	const doors = SILPH_DOORS[label];
	const lay = doors && world.current?.layout;
	if (!lay) return;
	const lock = Bag.count('cardkey') === 0;
	for (const [x, y] of doors) {
		if (!lay.map[y]) continue;
		const v = lay.map[y][x] ?? 0;
		lay.map[y][x] = lock ? (v | 0x0C00) : (v & ~0x0C00); // collision bits only
	}
	if (!lock && !silphNoted) { silphNoted = true; hud.textContent = 'Your CARD KEY hums — the floor shutters slide open.'; }
}
function silphDoorAt(fx, fy) {
	const doors = SILPH_DOORS[world.current?.name];
	return !!doors && doors.some(([x, y]) => x === fx && y === fy);
}

// ---------- the Route 113 glass workshop ----------
// The SOOT SACK fills as you walk ashy grass (MB_ASHGRASS survives in the
// layout attributes, same machinery as the secret-base spots); the
// glassblower trades the ash for his blown-glass flutes.
const GLASS_WARES = [['blueflute', 250], ['whiteflute', 500], ['blackflute', 1000]];
function glassBlowerTalk() {
	const ev = miscEvents();
	if (!ev.sootsack) {
		ev.sootsack = true;
		saveMiscEvents(ev);
		Bag.addItem('sootsack', 1);
		sfx('item_get');
		dialog.open("GLASSBLOWER: I shape VOLCANIC ASH into glass!\n\nTake this SOOT SACK — walk the ashy grass out\non ROUTE 113 and it fills itself. Bring me ash\nand I'll blow you something special!");
		return;
	}
	const ash = ev.ash || 0;
	const wares = GLASS_WARES.filter(([id]) => !Bag.count(id));
	if (!wares.length) { dialog.open('GLASSBLOWER: You own my whole catalog!\nMay every note ring true.'); return; }
	const affordable = wares.filter(([, cost]) => ash >= cost);
	if (!affordable.length) {
		dialog.open(`GLASSBLOWER: Your sack holds ${ash} ash.\nMy next piece, the ${Bag.ITEMS[wares[0][0]].name}, needs ${wares[0][1]}.\nKeep walking that soot!`);
		return;
	}
	const [id, cost] = affordable[affordable.length - 1]; // the finest piece you can afford
	dialog.open(`GLASSBLOWER: ${ash} ash! Enough for a ${Bag.ITEMS[id].name}\n(${cost} ash). Shall I fire up the kiln?\n\nZ = Yes   X = Not yet`, d => {
		if (d === 'x') return;
		const ev2 = miscEvents();
		if ((ev2.ash || 0) < cost) return;
		ev2.ash -= cost;
		saveMiscEvents(ev2);
		Bag.addItem(id, 1);
		sfx('levelup');
		Journal.add(`The glassblower blew a ${Bag.ITEMS[id].name} from ${cost} ash!`);
		dialog.open(`The kiln ROARS... glass spins and sings...\n\nYou received the ${Bag.ITEMS[id].name}!`);
	});
}
// the reusable field flutes: 250 steps of louder (white) or hushed (black) grass
const FLUTE_KEY = 'magepunk_flute_v1';
let fluteState = safeLoad(FLUTE_KEY, null) || { mode: null, steps: 0 };
function saveFlute() { safeSave(FLUTE_KEY, fluteState); }

// ---------- Dive ----------
// Dive/emerge are overlay map connections (same footprint, offset 0): plunging
// swaps the surface map for its underwater twin at the same tile, surfacing does
// the reverse. Dive needs a Water-type in the party (same gate as Surf).
// the dive/emerge connection for the current map: the map's own, else a code-level
// link restored in divelinks.js (maps served read-only from owdata)
function diveConn(kind) {
	return (world.current.map.connections || []).find(x => x.direction === kind)
		|| EXTRA_DIVE[world.current.name]?.[kind] || null;
}
async function diveTo(kind) { // 'dive' (down) | 'emerge' (up)
	const c = diveConn(kind);
	if (!c) return false;
	const file = world.fileFor(c.map);
	if (!file) return false;
	loading = true;
	const src = { name: world.current.name, tx: player.tx, ty: player.ty };
	try {
		await world.load(file);
		const lay = world.current.layout;
		if (c.x != null && c.y != null) {
			// explicit landing (size-mismatched twins, e.g. Sootopolis): snap to a
			// valid tile near it and set surfing from what we actually land on
			const [lx, ly] = kind === 'emerge' ? findSurfLanding(c.x, c.y) : findLanding(c.x, c.y);
			player.setTile(lx, ly);
			player.surfing = world.isSurfable(lx, ly);
		} else {
			// same-footprint twin: keep the exact tile, surface -> water / dive -> seabed
			player.setTile(Math.min(player.tx, lay.width - 1), Math.min(player.ty, lay.height - 1));
			player.surfing = kind === 'emerge';
		}
		player.biking = false;
		world.lastWarpSource = src;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('diveTo ' + file, e); return false; }
	return true;
}
// ---------- HM field moves ----------
// Faithful trigger: from the PARTY menu you pick a POKeMON that KNOWS the move
// and choose it — and it only does anything where the move applies. Each `use()`
// acts if the current tile/facing is valid, otherwise says why. STRENGTH stays
// "active" for the map so boulders can then be shoved (reset on every map load).
let strengthActive = false;
function facingTile() {
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	return [player.tx + dx, player.ty + dy, dx, dy];
}
// SOFTBOILED / MILK DRINK afield: the user gives a fifth of its health to the
// most-injured OTHER party member. (The cartridge lets you pick the target; with
// no picker in the field-move flow, "whoever needs it most" is the honest cut.)
function fieldHealTransfer(user, label) {
	const cost = Math.floor(user.maxHP / 5);
	if (user.curHP <= cost) { dialog.open(`${user.name} is too weak to share its health!`); return; }
	const target = (party || []).filter(m => m && m !== user && m.curHP > 0 && m.curHP < m.maxHP)
		.sort((a, b) => (a.curHP / a.maxHP) - (b.curHP / b.maxHP))[0];
	if (!target) { dialog.open('No one needs it right now.'); return; }
	user.curHP -= cost;
	target.curHP = Math.min(target.maxHP, target.curHP + cost);
	saveParty(party);
	dialog.open(`${user.name} used ${label}!\n\n${target.name} recovered ${cost} HP.`);
}

const HM_FIELD = {
	// ---- field-utility moves (not HMs — no badge gate; hmReq returns 0) ----
	// Crystal's tree-shaking classic, the last missing encounter modality.
	// Face something solid (a tree, as far as a route cares), slam it, and the
	// harvested treemon tables answer — 10% of shakes read the RARE table,
	// where HERACROSS lives.
	headbutt: { name: 'HEADBUTT', use() {
		const set = HEADBUTT_MAPS[world.current?.name];
		if (!set || !HEADBUTT_SETS[set]) { dialog.open('No sturdy trees around here would\nanswer a HEADBUTT.'); return; }
		const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
		if (world.isPassable(player.tx + dx, player.ty + dy)) { dialog.open('Face a tree first — THEN slam it!'); return; }
		const table = HEADBUTT_SETS[set][Math.random() < 0.1 ? 'rare' : 'common'];
		if (Math.random() < 0.2 || !table.length) { dialog.open('You slammed into the tree...\n\nNothing came out but leaves.'); return; }
		let r = Math.random() * table.reduce((s, e) => s + e[0], 0), pick = table[table.length - 1];
		for (const e of table) { r -= e[0]; if (r <= 0) { pick = e; break; } }
		dialog.open('You slammed into the tree!\n\nSomething dropped out!', () => startWildBattle({ id: pick[1], level: pick[2] }));
	} },
	sweetscent: { name: 'SWEET SCENT', use() {
		const pick = encounters.pick(world.current.map.id, player.surfing ? 'water' : 'land');
		if (!pick) { dialog.open('The sweet scent drifted away...\n\nNothing came.'); return; }
		dialog.open('A sweet scent fills the air!', () => startWildBattle(pick));
	} },
	teleport: { name: 'TELEPORT', use() {
		// the classic warp-out. This port has no "last Pokemon Center" record, so
		// it goes to the region's home town — stated plainly rather than pretended.
		const home = Quest.START[playerRegion()];
		if (!home || world.current.name === home) { dialog.open("It won't work here."); return; }
		dialog.open('You were whisked away home!', () => moveToMap(home));
	} },
	dig: { name: 'DIG', use() {
		const t = world.current?.map?.map_type || '';
		if (t !== 'MAP_TYPE_UNDERGROUND') { dialog.open('DIG can only tunnel out of caves.'); return; }
		if (!lastOutdoor) { dialog.open("It won't work here."); return; }
		dialog.open('You tunneled back to the surface!', () => moveToMap(lastOutdoor.map, lastOutdoor.x, lastOutdoor.y));
	} },
	softboiled: { name: 'SOFTBOILED', use(mon) {
		fieldHealTransfer(mon, 'SOFTBOILED');
	} },
	milkdrink: { name: 'MILK DRINK', use(mon) {
		fieldHealTransfer(mon, 'MILK DRINK');
	} },
	cut: { name: 'CUT', use() {
		const [fx, fy] = facingTile();
		const o = items.fieldObjAt(fx, fy);
		if (o && o.kind === 'cut') { dialog.open('The tree was CUT down!', () => items.removeFieldObj(o)); return; }
		dialog.open("There's nothing here to CUT.");
	} },
	rocksmash: { name: 'ROCK SMASH', use() {
		const [fx, fy] = facingTile();
		const o = items.fieldObjAt(fx, fy);
		if (o && o.kind === 'rock') {
			dialog.open('The rock was smashed to bits!', () => {
				items.removeFieldObj(o);
				const grp = encounters.data[world.current.map.id]?.rock_smash;
				if (grp && Math.random() * 100 < grp.rate) { const pick = encounters.pick(world.current.map.id, 'rock_smash'); if (pick) startWildBattle(pick); }
			});
			return;
		}
		dialog.open("There's no rock here to SMASH.");
	} },
	strength: { name: 'STRENGTH', use() {
		const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => items.fieldObjAt(player.tx + dx, player.ty + dy)?.kind === 'boulder');
		if (!near) { dialog.open("There's nothing here to use STRENGTH on."); return; }
		strengthActive = true;
		dialog.open('STRENGTH made it possible to move boulders!');
	} },
	surf: { name: 'SURF', use() {
		if (player.surfing) { dialog.open("You're already on the water."); return; }
		const [fx, fy] = facingTile();
		if (world.isSurfable(fx, fy)) {
			dialog.open('You surfed out onto the water!', () => { player.surfing = true; player.biking = false; player.beginMove(fx, fy, META, true); });
			return;
		}
		dialog.open("You can't SURF here.");
	} },
	waterfall: { name: 'WATERFALL', use() {
		const [fx, fy, dx, dy] = facingTile();
		if (player.surfing && world.behaviorAt(fx, fy) === 0x13) { // MB_WATERFALL
			let nx = fx, ny = fy;
			while (world.behaviorAt(nx + dx, ny + dy) === 0x13) { nx += dx; ny += dy; }
			const lx = nx + dx, ly = ny + dy;
			if (world.isSurfable(lx, ly) || world.isPassable(lx, ly)) { dialog.open('You climbed the WATERFALL!', () => player.setTile(lx, ly)); return; }
		}
		dialog.open("You can't use WATERFALL here.");
	} },
	dive: { name: 'DIVE', use() {
		// The Emerald->web tileset flattens all sea to one ocean behavior, so a
		// "valid dive spot" is a map that offers a dive/emerge overlay (map data or
		// a code-restored link like Sootopolis).
		if (diveConn('emerge')) { diveTo('emerge'); return; }
		if (diveConn('dive')) {
			if (!player.surfing) { dialog.open('You need to be out on the water to DIVE.'); return; }
			diveTo('dive'); return;
		}
		dialog.open("You can't DIVE here — the water isn't deep enough.");
	} },
	flash: { name: 'FLASH', use() {
		if (world.current.map.requires_flash) { Story.setFlag('flash_' + world.current.map.id); dialog.open('FLASH lit up the surroundings!'); return; }
		dialog.open("It's not dark enough to need FLASH.");
	} },
	fly: { name: 'FLY', use() {
		if (world.current.map.map_type === 'MAP_TYPE_INDOOR') { dialog.open("You can't FLY indoors."); return; }
		openTownMap();
	} },
};
function fieldMovesOf(mon) { return (mon?.moves || []).filter(mv => HM_FIELD[mv.id]); }
function useFieldMove(hmId, mon) {
	partyMenu.open = false; partyMenu.action = null; partyMenu.summary = false;
	// badge gate: an HM can't be used outside battle until you've earned enough of
	// your region's badges (canonical order). The move is still usable in battle.
	// the region you are STANDING in, not the one you started in — see
	// Badges.regionOfMap. HM_GATE.JOHKANTO was unreachable before this.
	const region = Badges.regionOfMap(world.current?.map?.id, playerRegion());
	const req = Badges.hmReq(region, hmId);
	if (req > Badges.count(region)) {
		const gb = Badges.list(region)[req - 1];
		dialog.open(`Sorry! A new POKeMON LEAGUE rule\nprevents using ${HM_FIELD[hmId]?.name || hmId.toUpperCase()} outside of battle\nuntil you have the ${gb ? gb.name : 'right badge'}.`);
		return;
	}
	HM_FIELD[hmId]?.use(mon);
}
// build the little action menu shown when you pick a party member
function openPartyAction(idx) {
	const mon = party[idx];
	if (!mon) return;
	const opts = fieldMovesOf(mon).map(mv => ({ label: HM_FIELD[mv.id].name, kind: 'field', hm: mv.id }));
	opts.push({ label: 'SUMMARY', kind: 'summary' });
	if (party.length > 1) opts.push({ label: 'SWITCH', kind: 'switch' });
	opts.push({ label: 'CANCEL', kind: 'cancel' });
	partyMenu.action = { mon, monIdx: idx, options: opts, idx: 0 };
}

// re-anchor when the player has walked into a connected map
async function crossConnection(hit) {
	loading = true;
	const { conn, lx, ly } = hit;
	try {
		await world.load(conn.name);
		player.setTile(lx, ly);
		await refreshMapContent(conn.name);
	} catch (e) { afterLoadError('crossConnection ' + conn.name, e); }
}

// nudge the player toward the bike when a cracked floor stops them
player.onBlockedCracked = () => { hud.textContent = 'The floor here is cracked and unstable — a bike could carry you across (press C).'; };
player.onHop = () => sfx('ledge');
// ONE bump handler: the wall thud (throttled — tryMove fires every held frame)
// plus the authentic blocker line (guard / SNORLAX / grunt) when one is there
let bumpCooldown = 0;
player.onBump = (tx, ty) => {
	const now = performance.now();
	if (now > bumpCooldown) { bumpCooldown = now + 350; sfx('bump'); }
	if (dialog.blocking || !party) return;
	const m = blockers.messageAt(tx, ty);
	if (m) dialog.open(m);
};

player.onArrive = () => {
	// each completed step accrues Day Care EXP and incubates any egg
	// FLAME BODY / MAGMA ARMOR halve the steps an egg needs — previously
	// battle-only text on 20-odd species
	Daycare.step(battle.data, () => { hud.textContent = 'The Day Care egg is ready to hatch!'; },
		(party || []).some(m => m && m.curHP > 0 && (m.ability === 'flamebody' || m.ability === 'magmaarmor')) ? 2 : 1);
	// warp tile?
	const w = world.warpAt(player.tx, player.ty);
	if (!w) savePos();
	if (w) {
		const dest = parseInt(w.dest_warp_id, 10);
		if (dest === -1) { backWarp(); return; } // backward warp — never gated
		// TRICK HOUSE doors: the maze exit wants the scroll, the entrance door
		// leads to the CURRENT puzzle, and the End room lets out at the entrance
		const th = trickWarp(w);
		if (th === 'blocked') return;
		if (th) { warpTo(th.map, th.warp); return; }
		// SHOAL CAVE tides: high water floods the deep rooms, swaps the inner room
		const sh = shoalWarp(w);
		if (sh === 'blocked') return;
		if (sh) { warpTo(sh.map, sh.warp); return; }
		// TRAINER HILL: no climb without a run, no stairs past standing guards
		if (hillWarp(w) === 'blocked') return;
		// leaving the park mid-Bug-Contest means the judging happens at the gate
		if (bugContest.active && /NATIONAL_PARK_GATE/.test(w.dest_map)) {
			warpTo(w.dest_map, w.dest_warp_id);
			setTimeout(() => endBugContest(), 700);
			return;
		}
		// strict-corridor / gym-door gate: block entering a map the current stage
		// hasn't unlocked (the player stays on the door tile)
		const destFile = world.fileFor(w.dest_map);
		const qb = destFile ? Quest.blocked(playerRegion(), destFile, world.current.name) : null;
		if (qb) { maybePortalTutorial(qb); return; } // silent strand backstop — the physical blocker shows the reason
		warpTo(w.dest_map, w.dest_warp_id);
		return;
	}
	// crossed into a connection?
	const lay = world.current.layout;
	const outside = player.tx < 0 || player.tx >= lay.width || player.ty < 0 || player.ty >= lay.height;
	if (outside) {
		const hit = world.connectionAt(player.tx, player.ty);
		if (hit) {
			// no POKeMON yet (new-game intro): don't wander onto wild routes — bounce
			// back into town and point the player at the lab
			if (!party) {
				player.setTile(Math.max(0, Math.min(player.tx, lay.width - 1)), Math.max(0, Math.min(player.ty, lay.height - 1)));
				dialog.open("It's not safe to go out without a POKeMON!\n\nVisit the POKeMON LAB and get your first partner.");
				return;
			}
			// strict-corridor gate: block crossing into an area this quest stage hasn't
			// unlocked yet — bounce the player back inside (backtracking is never gated)
			const qb = Quest.blocked(playerRegion(), hit.conn.name, world.current.name);
			if (qb) {
				// silent strand backstop — a physical blocker on the near side shows the reason
				maybePortalTutorial(qb);
				player.setTile(Math.max(0, Math.min(player.tx, lay.width - 1)), Math.max(0, Math.min(player.ty, lay.height - 1)));
				return;
			}
			crossConnection(hit); return;
		}
	}
	// a coord_event trigger on this tile (var-gated) runs its ported story script.
	// Guard it: a throwing plot script must not break stepping onto the tile.
	try {
		if (!cutscene.blocking && checkCoordTrigger()) return;
		if (!cutscene.blocking) checkOnFrame();
	} catch (e) { console.warn('[plot] coord/onFrame trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// a due awakening beat on this map (e.g. WALLACE's pointer right after the clash)
	try { if (!cutscene.blocking) checkAwakeningTrigger(); } catch (e) { console.warn('[awakening] step trigger failed', e); if (cutscene.blocking) cutscene.stop(); }
	// a static legendary sitting on this tile
	if (!cutscene.blocking && !battle.blocking && checkLegendaryTrigger()) return;
	// trainer sight lines take priority over grass
	if (!battle.blocking && trainers.checkSight(player.tx, player.ty)) { sfx('notice'); return; }
	// SAFARI GAME: every step in the zone burns the meter, and the step that
	// empties it ends the game on the spot (no encounter on the way out)
	if (safari.on && safariZoneOf(world.current.map.id)) {
		safari.steps--;
		saveSafari();
		if (safari.steps <= 0) { endSafari('PA: Ding-dong! Your SAFARI GAME is over!'); return; }
		if (safari.steps === 50) hud.textContent = 'PA: Only 50 steps left in your SAFARI GAME!';
	}
	// REPEL burns a step, and announces the moment it runs out (that message is
	// the whole reason the item feels responsive)
	if (repelSteps > 0) {
		repelSteps--;
		safeSaveStr(REPEL_KEY, String(repelSteps));
		if (repelSteps === 0) repelWoreOff();
	}
	// the SOOT SACK drinks the ashy grass underfoot (MB_ASHGRASS = 0x24)
	if (Bag.count('sootsack') > 0 && world.behaviorAt(player.tx, player.ty) === 0x24) {
		const ev = miscEvents();
		ev.ash = (ev.ash || 0) + 1;
		if (ev.ash % 50 === 0) hud.textContent = `The SOOT SACK swallows more ash... (${ev.ash})`;
		saveMiscEvents(ev);
	}
	// a playing flute fades with the steps
	if (fluteState.steps > 0) {
		fluteState.steps--;
		if (fluteState.steps === 0) { fluteState.mode = null; hud.textContent = "The flute's melody faded away."; }
		saveFlute();
	}
	// ambient step fx: rustle the grass / print the sand under the new tile
	spawnStepFx();
	// wild encounter?
	if (!battle.blocking) {
		// guard: this runs inside the rAF step loop, where a throw is silent and
		// kills movement outright — `party` is not guaranteed to be populated yet
		const lead = Array.isArray(party) ? party.find(m => m && m.curHP > 0) : null;
		// CLEANSE TAG: held by the LEAD, it wards off a third of would-be
		// encounters. A ¥1000 buyable whose payload nothing read until now.
		if (Bag.ITEMS[lead?.heldItem]?.held?.cleanseTag && Math.random() < 1 / 3) return;
		// the Bug-Catching Contest swaps in its own bug table while it runs;
		// the BLACK FLUTE hushes normal encounters, the WHITE one doubles them
		const repelLv = repelSteps > 0 ? (lead?.level || 0) : 0;
		const rollOnce = () => encounters.roll(world.current.map.id, world, player.tx, player.ty, player.surfing, repelLv);
		const pick = bugContestRoll()
			|| (fluteState.mode === 'black' && fluteState.steps > 0 ? null
				: rollOnce() || (fluteState.mode === 'white' && fluteState.steps > 0 ? rollOnce() : null));
		if (pick) {
			// a roamer on this route takes over half of the encounters here
			const roam = roamerHere();
			if (roam && Math.random() < 0.5) { startRoamerBattle(roam); return; }
			startWildBattle(pick);
		}
	}
};

// ---------- static legendary encounters ----------
// The decomp triggers these through an awakening cutscene + a legendary-battle
// special the web engine doesn't run (and the overworld legendary sprites aren't
// in the build), so a region-picker could never actually catch them. Instead we
// place a catchable wild encounter on the legendary's tile: walk onto it (or
// face it and interact) and a real battle starts — you can throw balls and keep
// it. A caught/defeated flag stops it re-triggering. The plot awakening scenes
// stay seeded off (they assume story state and lead to no catch); this is the
// catch itself, decoupled from them.
const HAND_PLACED_LEGENDS = {
	// Hoenn weather trio (decoupled from the awakening plot)
	MAP_SKY_PILLAR_TOP:  { species: 'rayquaza', dex: 384, level: 70, x: 14, y: 6,  flag: 'legend_caught_rayquaza', intro: 'A colossal POKeMON coils in the air above you...' },
	MAP_MARINE_CAVE_END: { species: 'kyogre',   dex: 382, level: 70, x: 9,  y: 22, flag: 'legend_caught_kyogre',   intro: 'The water heaves — something immense stirs in the depths...' },
	MAP_TERRA_CAVE_END:  { species: 'groudon',  dex: 383, level: 70, x: 17, y: 26, flag: 'legend_caught_groudon',  intro: 'The ground blazes with heat as a huge form rises...' },
	// the three REGI — sealed in their chambers, they stir only for the HOENN CHAMPION
	MAP_DESERT_RUINS: { species: 'regirock', dex: 377, level: 40, x: 8, y: 7, flag: 'legend_caught_regirock',
		requires: () => Badges.isChampion('HOENN'), intro: 'A golem of ancient stone stands sealed here — REGIROCK awakens.' },
	MAP_ISLAND_CAVE: { species: 'regice', dex: 378, level: 40, x: 8, y: 7, flag: 'legend_caught_regice',
		requires: () => Badges.isChampion('HOENN'), intro: 'The cave breathes freezing air — REGICE emerges from the ice.' },
	MAP_ANCIENT_TOMB: { species: 'registeel', dex: 379, level: 40, x: 8, y: 7, flag: 'legend_caught_registeel',
		requires: () => Badges.isChampion('HOENN'), intro: 'A body of tempered steel unseals itself — REGISTEEL awakens.' },
	// event-island legendaries (reached by the post-game EON/SEAGALLOP ferry, champion-gated)
	// The EON DUO, both on their island. Emerald gives you one and roams the other,
	// and we have no roamer — so LATIAS was reachable nowhere at all (the script
	// route is `BattleSetup_StartLatiBattle`, one of the 427 specials with no
	// handler). Two eon dragons on one island is the liberty that makes the pair
	// completable; they take separate flags, so it is still one of each.
	MAP_SOUTHERN_ISLAND_INTERIOR: [
		{ species: 'latios', dex: 381, level: 50, x: 13, y: 12, flag: 'legend_caught_latios',
			requires: () => Badges.isChampion('HOENN'), intro: 'A blue eon POKeMON drifts amid the leaves — LATIOS regards you keenly.' },
		{ species: 'latias', dex: 380, level: 50, x: 11, y: 12, flag: 'legend_caught_latias',
			requires: () => Badges.isChampion('HOENN'), intro: 'A red eon POKeMON watches from the branches — LATIAS reveals herself.' },
	],
	MAP_BIRTH_ISLAND_EXTERIOR: { species: 'deoxys', dex: 386, level: 60, x: 15, y: 3, flag: 'legend_caught_deoxys',
		requires: () => Badges.isChampion('HOENN'), intro: 'The strange triangle pulses — DEOXYS materializes from deep space.' },
	MAP_FARAWAY_ISLAND_INTERIOR: { species: 'mew', dex: 151, level: 30, x: 13, y: 17, flag: 'legend_caught_mew',
		requires: () => Badges.isChampion('HOENN'), intro: 'Something playful darts through the grass... MEW appears!' },
	// Kanto birds — catchable in their lairs (no gate)
	MAP_SEAFOAM_ISLANDS_B4F: { species: 'articuno', dex: 144, level: 50, x: 9, y: 2, flag: 'legend_caught_articuno', intro: 'A freezing gale howls through the cavern — ARTICUNO descends!' },
	MAP_POWER_PLANT:         { species: 'zapdos',   dex: 145, level: 50, x: 5, y: 11, flag: 'legend_caught_zapdos',  intro: 'The air crackles with electricity — ZAPDOS spreads its wings!' },
	MAP_MT_EMBER_SUMMIT:     { species: 'moltres',  dex: 146, level: 50, x: 9, y: 6, flag: 'legend_caught_moltres',  intro: 'The summit blazes — MOLTRES erupts from the flames!' },
	// Mewtwo — only in the depths of Cerulean Cave once you are the KANTO CHAMPION
	MAP_CERULEAN_CAVE_B1F: { species: 'mewtwo', dex: 150, level: 70, x: 7, y: 12, flag: 'legend_caught_mewtwo',
		requires: () => Badges.isChampion('KANTO'), intro: 'A cold, immense psychic presence fills the cave... MEWTWO awaits.' },
	// Johto tower duo — answer to their WINGS (a key-item hunt; wings granted on becoming CHAMPION)
	MAP_TIN_TOWER_ROOF: { species: 'hooh', dex: 250, level: 60, x: 9, y: 5, flag: 'legend_caught_hooh',
		requires: () => Bag.count('rainbowwing') > 0, intro: 'Rainbow light spills across the tower — HO-OH answers the RAINBOW WING!' },
	MAP_WHIRL_ISLAND_LUGIA_CHAMBER: { species: 'lugia', dex: 249, level: 60, x: 9, y: 5, flag: 'legend_caught_lugia',
		requires: () => Bag.count('silverwing') > 0, intro: 'The sea roars in the depths — LUGIA rises, drawn by the SILVER WING!' },
	// NAVEL ROCK — the same duo, reached the KANTO way. Deliberately the SAME
	// flags as the Tin Tower / Whirl Islands entries above, so a save still gets
	// exactly one HO-OH and one LUGIA: this is a second route to them, not a
	// second copy. Johto asks for the WINGS, Kanto asks you to be its Champion.
	MAP_NAVEL_ROCK_TOP: { species: 'hooh', dex: 250, level: 70, x: 12, y: 4, flag: 'legend_caught_hooh',
		requires: () => Badges.isChampion('KANTO'), intro: 'Light floods the peak — HO-OH descends over NAVEL ROCK!' },
	MAP_NAVEL_ROCK_BOTTOM: { species: 'lugia', dex: 249, level: 70, x: 11, y: 13, flag: 'legend_caught_lugia',
		requires: () => Badges.isChampion('KANTO'), intro: 'The cavern floods with sound — LUGIA rises from the deep!' },
	// CELEBI. Johto's signature mascot did not exist ANYWHERE in this codebase —
	// zero hits, despite shipping in the species table with a sprite. Crystal
	// gates it behind the GS Ball, an item this port has no equivalent for, so it
	// waits at the Ilex Forest shrine for the region's CHAMPION instead. That also
	// gives Johto a second post-game beat; it previously had only Mt Silver.
	MAP_ILEX_FOREST: { species: 'celebi', dex: 251, level: 60, x: 4, y: 19, flag: 'legend_caught_celebi',
		requires: () => Badges.isChampion('JOHTO'),
		intro: 'The shrine hums, and the forest folds around a small green shape — CELEBI!' },
	// JOHKANTO had NO legendaries at all, while Hoenn has 9, Johto 5 and Kanto 4.
	// Its Power Plant is the one bird lair the region actually owns (Seafoam and
	// Cerulean Cave are unprefixed border maps). Same flag as Kanto's ZAPDOS, so
	// this is a second route to the bird rather than a second bird.
	MAP_JOHKANTO_POWER_PLANT: { species: 'zapdos', dex: 145, level: 50, x: 16, y: 4, flag: 'legend_caught_zapdos',
		intro: 'The generators scream — ZAPDOS bursts from the machinery!' },
	// The three legendary beasts — once you've woken them at the Burned Tower they can
	// be confronted at the top of Tin Tower (a map can hold several: an array).
	MAP_TIN_TOWER_1F: [
		{ species: 'raikou', dex: 243, level: 40, x: 7, y: 9, flag: 'legend_caught_raikou',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'Thunder cracks — RAIKOU bares its fangs!' },
		{ species: 'suicune', dex: 245, level: 40, x: 9, y: 9, flag: 'legend_caught_suicune',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'The north wind stirs — SUICUNE regards you with clear eyes.' },
		{ species: 'entei', dex: 244, level: 40, x: 12, y: 9, flag: 'legend_caught_entei',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'A volcanic roar — ENTEI blocks your path!' },
	],
};
// ...plus the 87 that had no home anywhere, one at the bottom of each of 87
// dungeons (legendaries_postgame.js, generated). The hand-placed table wins on a
// collision, but the generator skips any map named above so there are none.
const LEGENDARY_ENCOUNTERS = { ...POSTGAME_LEGENDS, ...HAND_PLACED_LEGENDS };
// a Pokemon's overworld sprite, loaded on demand from data/pokemon_ow/<id>.png
const owMonCache = new Map();
function owMonSprite(id) {
	if (!id) return null;
	if (!owMonCache.has(id)) {
		owMonCache.set(id, null);
		// Fall back to the BATTLE sprite when there is no overworld one. 28 of the
		// placed legendaries are gen-9 Paradox/Ruin species with no pokemon_ow art,
		// and drawLegendary simply skipped them — leaving an invisible tile that
		// starts a legendary battle when you walk onto it, which reads as a bug
		// rather than as a secret.
		getImage(`data/pokemon_ow/${id}.png`)
			.catch(() => {
				const sp = battle.data?.species?.[id]?.sprite;
				return sp ? getImage(`data/pokemon/${sp}`) : Promise.reject(new Error('no sprite'));
			})
			.then(img => owMonCache.set(id, img))
			.catch(() => {});
	}
	return owMonCache.get(id);
}
function drawLegendary(ctx, camX, camY) {
	for (const e of legendariesHere()) {
		const img = owMonSprite(e.species);
		if (!img) continue;
		const cx = e.x * META + META / 2, by = e.y * META + META; // bottom-centre on the tile
		drawOwMon(ctx, img, cx, by, camX, camY);
	}
}

// ---------- Hoenn legendary-awakening chain ----------
// After the Team Aqua climax (villain_hoenn_climax), the roused weather trio tear
// HOENN apart until RAYQUAZA is woken to calm them. The decomp drives this through
// camera/weather/battle `special` ops + flag-gated story objects, all of which are
// inert or never spawned in this port — so the literal scripts would play as
// invisible state changes. Instead a self-contained director advances its OWN state
// var (keeping the decomp scene vars dormant, so their onFrame scenes never fire)
// and RENDERS the beats: KYOGRE & GROUDON clash over SOOTOPOLIS on their real decomp
// tiles, then RAYQUAZA descends to still them. The catch itself is untouched — it
// stays a real battle on each legendary's lair tile via LEGENDARY_ENCOUNTERS.
const AW_VAR = 'VAR_HOENN_AWAKENING'; // 0 ready -> 6 resolved
function awState() { return Story.getVar(AW_VAR); }
function awActive() { return Story.getFlag('villain_hoenn_climax') && awState() < 6; }
// a scripted actor's real decomp position, read live from the map's object_events
function awObjPos(re) {
	const o = (world.current.map.object_events || []).find(e => re.test(e.graphics_id || ''));
	return o ? { x: +o.x, y: +o.y } : null;
}
const AWAKENING_SCENES = [
	{ map: 'Route128', when: aw => aw === 0, next: 1, lines: [
		'The sea churns violently off ROUTE 128. ARCHIE stares into the raging water, the BLUE ORB dark and cold in his fist.',
		'ARCHIE: What have I done...? KYOGRE won’t heed me! The sea itself is rising to swallow everything!',
		'MAXIE: Your precious KYOGRE has doomed us all, ARCHIE!',
		'STEVEN: Enough! The two POKeMON have gone berserk — drought and downpour tearing at each other. We must reach SOOTOPOLIS before HOENN drowns.',
	] },
	{ map: 'SootopolisCity', when: aw => aw < 2, next: 2, lines: [
		'You surface into SOOTOPOLIS to chaos. Above the crater lake, KYOGRE and GROUDON are locked in an ancient fury.',
		'Torrents of rain and searing heat collide over the city — the sky itself is at war.',
		'STEVEN: Their power only feeds on the clash! No trainer can stop them now... only a greater force could.',
		'WALLACE: There is one — the serpent that rules the skies above them both. RAYQUAZA.',
	] },
	{ map: 'SootopolisCity', when: aw => aw === 2, next: 3, lines: [
		'WALLACE: RAYQUAZA slumbers atop the SKY PILLAR, far to the east beyond PACIFIDLOG.',
		'WALLACE: Only it can quell KYOGRE and GROUDON. Go — wake the guardian of the sky, before SOOTOPOLIS is lost!',
	] },
	{ map: 'SkyPillar_Outside', when: aw => aw === 3, next: 4, door: true, lines: [
		'WALLACE stands before the SKY PILLAR’s sealed door, waiting for you.',
		'WALLACE: I’ve opened the way. Climb to the summit — RAYQUAZA waits at the very top. Hurry!',
	] },
	{ map: 'SkyPillar_Top', when: aw => aw === 4, next: 5, lines: [
		'At the pillar’s summit an immense green POKeMON coils in the thin air. RAYQUAZA.',
		'Your presence stirs it. RAYQUAZA’s eyes snap open — it uncoils and hurtles skyward, streaking west toward SOOTOPOLIS!',
	] },
	{ map: 'SootopolisCity', when: aw => aw === 5, next: 6, resolve: true, lines: [
		'RAYQUAZA descends through the storm in a spiral of light.',
		'Its roar shakes the heavens. KYOGRE and GROUDON freeze — then, cowed, sink back into the depths from which they rose.',
		'The rain stills. The blistering heat fades. RAYQUAZA gives a final cry and vanishes into the clouds.',
		'STEVEN: It’s over... HOENN is safe. The three still linger in the wild, though — seek them out, if you dare.',
	] },
];
// map-entry / per-step hook: play the next awakening beat if one is due here
function checkAwakeningTrigger() {
	if (!party || !leadMon(party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	if (!Story.getFlag('villain_hoenn_climax') || playerRegion() !== 'HOENN') return;
	const aw = awState();
	const scene = AWAKENING_SCENES.find(s => s.map === world.current.name && s.when(aw));
	if (!scene) return;
	startCutscene(scene.lines.map(text => ({ op: 'say', text })), () => {
		if (scene.door) { // make the SKY PILLAR door walkable (decomp opens it via an OnLoad the port never runs)
			const lay = world.current?.layout;
			if (lay?.map?.[4]) world.setMetatile(14, 4, lay.map[4][14], false);
			if (lay?.map?.[5]) world.setMetatile(14, 5, lay.map[5][14], false);
		}
		Story.setVar(AW_VAR, scene.next);
		if (scene.resolve) { Story.clearFlag('FLAG_SYS_WEATHER_CTRL'); Story.clearFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS'); }
	});
}
// render the clashing legendaries over SOOTOPOLIS during the crisis (real decomp tiles)
function drawAwakening(ctx, camX, camY) {
	if (world.current.name !== 'SootopolisCity' || !awActive()) return;
	const put = (species, pos) => {
		if (!pos) return;
		const img = owMonSprite(species);
		if (!img) return;
		const cx = pos.x * META + META / 2, by = pos.y * META + META;
		drawOwMon(ctx, img, cx, by, camX, camY);
	};
	put('groudon', awObjPos(/GROUDON/));
	put('kyogre', awObjPos(/KYOGRE/));
	if (awState() === 5) put('rayquaza', awObjPos(/RAYQUAZA/)); // descends to calm them
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
const FOLLOW_ROW = { down: 0, left: 1, right: 2, up: 3 };
let follower = null;
let lastPlayerTile = null;
function refreshFollower() {
	follower = null;
	lastPlayerTile = { x: player.tx, y: player.ty };
	if (!Settings.get('followers') || !party) return;
	const lead = party.find(m => m.curHP > 0) || party[0];
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
function updateFollower(dt) {
	if (!Settings.get('followers')) { follower = null; return; }
	if (!follower) { if (party) refreshFollower(); return; }
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
function drawFollower(ctx, camX, camY) {
	if (!follower || player.surfing) return;
	const img = followSheet(follower.id);
	if (!img) {
		if (followCache.get(follower.id) !== 'none') return; // sheets still loading
		const mini = followMini(follower.id);
		if (!mini) return;
		const s = Math.min(20 / mini.width, 20 / mini.height);
		const w = Math.max(1, Math.round(mini.width * s)), h = Math.max(1, Math.round(mini.height * s));
		const bob = follower.moving && follower.step ? -1 : 0;
		const mx = Math.round(follower.px + META / 2 - w / 2 - camX);
		const my = Math.round(follower.py + META - h - camY + bob);
		ctx.imageSmoothingEnabled = false;
		if (follower.facing === 'right') {          // mirror the single sprite to face the way it's walking
			ctx.save();
			ctx.translate(mx + w, my); ctx.scale(-1, 1);
			ctx.drawImage(mini, 0, 0, w, h);
			ctx.restore();
		} else {
			ctx.drawImage(mini, mx, my, w, h);
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
function legendariesHere() {
	const v = LEGENDARY_ENCOUNTERS[world.current.map.id];
	if (!v) return [];
	return (Array.isArray(v) ? v : [v]).filter(e => !Story.getFlag(e.flag) && (!e.requires || e.requires()));
}
function legendaryHere() { return legendariesHere()[0] || null; } // the first (single-per-map back-compat)
function startLegendaryBattle(e) {
	if (!party || !leadMon(party) || battle.blocking) return;
	Dex.markSeen(e.species);
	dialog.open(e.intro, () => {
		battle.themeHint = /^regi(rock|ce|steel)/.test(e.species) ? 'regi' : 'legendary';
		battle.endSpec = { kind: 'legendary', species: e.species, flag: e.flag };
		battle.start(party, e.species, scaleLegendaryLevel(e.level), result => {
			if (result === 'caught' && battle.lastCaught) {
				Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
				const where = addCaught(party, battle.lastCaught);
				hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
				offerNickname(battle.lastCaught);
				Story.setFlag(e.flag);
				syncOverworldAchievements(); // a legendary was CAUGHT (only catches count toward the sets)
			} else if (result === 'victory') {
				Story.setFlag(e.flag); // fainted it — it won't reappear (matches the games)
				evolution.check(party, battle.data);
			} else if (result === 'defeat') {
				healParty(party);
				hud.textContent = (world.current.map.name || '') + ' — party healed';
			} else {
				saveParty(party); // ran / fled: leave it catchable
			}
		});
	});
}
// on-arrive: standing on a legendary's tile starts that encounter
function checkLegendaryTrigger() {
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
function dexMilestoneCheck() {
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
function mapWeatherNow() { return MAP_WEATHER[world.current?.map?.id] || null; }

// last position on an outdoor map — DIG's exit point. Updated on every map
// entry (refreshMapContent), so stepping into a cave remembers the doorstep.
let lastOutdoor = null;
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
	for (const mon of party || []) {
		if (!mon || mon.curHP <= 0 || mon.ability !== 'pickup' || mon.heldItem) continue;
		if (Math.random() >= 0.1) continue;
		const id = PICKUP_TABLE[Math.floor(Math.random() * PICKUP_TABLE.length)];
		mon.heldItem = id;
		hud.textContent = `${mon.name} picked up a ${Bag.ITEMS[id].name}!`;
		saveParty(party);
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
let safari = safeLoad('magepunk_safari_v1', null) || { on: false, zone: null, balls: 0, steps: 0 };
function safariZoneOf(mapId) { return SAFARI_ZONES[mapId] || null; }
function saveSafari() { safeSave('magepunk_safari_v1', safari); }
function endSafari(reason) {
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

function startWildBattle(pick, forceDouble) {
	if (!party || !leadMon(party)) return;
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
		&& party.filter(m => m.curHP > 0).length >= 2
		? encounters.pick(world.current.map.id) : null;
	if (second) Dex.markSeen(second.id);
	battle.endSpec = { kind: 'wild' };
	battle.start(party, pick.id, pick.level, result => wildBattleEnd(result, inSafari),
		second, { weather: mapWeatherNow(), safari: inSafari ? safari : null });
}

// the standard wild-battle ending — shared by live battles and RESUMED ones
// (a battle abandoned by leaving the page reconstructs this from its endSpec)
function wildBattleEnd(result, inSafari) {
	if (result === 'defeat') {
		healParty(party);
		hud.textContent = (world.current.map.name || '') + ' — party healed';
	} else if (result === 'caught' && battle.lastCaught) {
		// during the Bug-Catching Contest the catch becomes the single kept
		// entry — it joins the party at the judging, not here
		if (!bugContestCatch(battle.lastCaught)) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
		}
	} else {
		saveParty(party);
	}
	if (result === 'victory') { evolution.check(party, battle.data); pickupCheck(); }
	if (inSafari) {
		saveSafari();   // the battle burned balls on the shared session
		if (safari.balls <= 0) endSafari('PA: You are out of SAFARI BALLS! Your SAFARI GAME is over!');
	}
}

// ---------- museum paintings, ruins words, fossils, New Mauville ----------
// Small one-shot venue events, remembered together in magepunk_events_v1.
const EVENTS_KEY = 'magepunk_events_v1';
function miscEvents() { return safeLoad(EVENTS_KEY, {}); }
function saveMiscEvents(e) { safeSave(EVENTS_KEY, e); }

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
		const holder = (party || []).find(m => (m.ribbons || []).includes(`${cat}-master`));
		if (holder) { p.paintings[cat] = { species: holder.speciesId, name: holder.nickname || holder.name }; changed = true; }
	}
	if (changed) safeSave(CONTEST_KEY, p);
	return p.paintings;
}
function museumPaintTalk(fx, fy) {
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
function museumCuratorTalk() {
	const n = Object.keys(museumBackfill()).length;
	dialog.open(n >= 5
		? 'CURATOR: All five frames filled... you have given\nthis gallery its golden age. Thank you!'
		: `CURATOR: This floor honors CONTEST champions.\n${n} of 5 frames hold a masterpiece so far.\n\nWin a MASTER RANK contest and the artist will\npaint your POKeMON for the gallery!`);
}
// the hung portraits, drawn over the 2F frames
function drawMuseum(ctx, camX, camY) {
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
function ruinsWordTalk() {
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
function fossilPick(which) {
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
function fossilUnderpassTalk() {
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
function fossilManiacTalk() {
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
		const where = addCaught(party, mon);
		saveParty(party);
		sfx('levelup');
		Journal.add(`The Fossil Maniac revived ${name} from the ${Bag.ITEMS[held].name}!`);
		dialog.open(`The machine hums... a heartbeat!\n\n${name} was revived!${where === 'box' ? '\n(Sent to the box.)' : ''}`);
	});
}

// NEW MAUVILLE: the runaway generator, waiting for someone to throw the switch
function generatorTalk() {
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
function drawFossilSpots(ctx, camX, camY) {
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

// ---------- Trainer Hill (Hoenn, Route 111) ----------
// The timed four-floor gauntlet: sign up at the reception desk, the clock
// starts, and each floor spawns two HILL GUARDS (Emerald loads its trainers
// dynamically — the shipped floors carry none, so they're injected at floor
// load onto scanned-passable tiles). Both guards must fall before the stairs
// up unseal. The gentleman on the roof pays by your time; the elevator rides
// down. The run lives in memory (leaving voids it); only the BEST time
// persists (magepunk_trainerhill_v1).
const HILL_KEY = 'magepunk_trainerhill_v1';
let hillRun = null; // { start, beatenSet: {'1F:0':true}, guards: {'1F': [[x,y],[x,y]]} }
const HILL_FLOORS = { TrainerHill_1F: '1F', TrainerHill_2F: '2F', TrainerHill_3F: '3F', TrainerHill_4F: '4F' };
const HILL_NEXT = { TrainerHill_1F: 'MAP_TRAINER_HILL_2F', TrainerHill_2F: 'MAP_TRAINER_HILL_3F', TrainerHill_3F: 'MAP_TRAINER_HILL_4F', TrainerHill_4F: 'MAP_TRAINER_HILL_ROOF' };
const HILL_GFX = {
	'1F': ['OBJ_EVENT_GFX_CAMPER', 'OBJ_EVENT_GFX_PICNICKER'],
	'2F': ['OBJ_EVENT_GFX_BUG_CATCHER', 'OBJ_EVENT_GFX_LASS'],
	'3F': ['OBJ_EVENT_GFX_BLACK_BELT', 'OBJ_EVENT_GFX_HIKER'],
	'4F': ['OBJ_EVENT_GFX_GENTLEMAN', 'OBJ_EVENT_GFX_PSYCHIC_M'],
};
const HILL_THEMES = {
	'1F': ['pidgeotto', 'raticate', 'furret', 'dodrio'],
	'2F': ['beedrill', 'butterfree', 'ariados', 'ledian'],
	'3F': ['machoke', 'graveler', 'hitmonchan', 'sudowoodo'],
	'4F': ['skarmory', 'dragonair', 'magneton', 'lairon'],
};
const hillElapsed = () => hillRun ? Math.floor((Date.now() - hillRun.start) / 1000) : 0;
const hillTimeStr = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function hillGuardsLeft(key) {
	return (hillRun?.guards?.[key] || [[], []]).filter((_, i) => !hillRun.beatenSet[`${key}:${i}`]).length;
}
// inject this floor's unbeaten guards as real NPC objects before npcs load
function hillPrepFloor(label) {
	const key = HILL_FLOORS[label];
	if (!key) return;
	const map = world.current?.map;
	if (!map) return;
	map.object_events = (map.object_events || []).filter(o => !o._hill); // clear stale injections
	if (!hillRun) return;
	if (!hillRun.guards[key]) {
		// two deterministic interior spots: scan outward from the centerline at
		// one-third and two-thirds height for plain passable floor
		const lay = world.current.layout;
		const spots = [];
		for (const fy of [Math.floor(lay.height / 3), Math.floor((lay.height * 2) / 3)]) {
			let placed = false;
			for (let dx = 0; dx < lay.width && !placed; dx++) {
				const x = Math.floor(lay.width / 2) + (dx % 2 ? -1 : 1) * Math.ceil(dx / 2);
				for (const y of [fy, fy + 1, fy - 1]) {
					if (x > 0 && y > 1 && x < lay.width - 1 && y < lay.height - 1
						&& world.isPassable(x, y) && !world.warpAt(x, y) && !spots.some(([sx, sy]) => sx === x && sy === y)) {
						spots.push([x, y]); placed = true; break;
					}
				}
			}
		}
		hillRun.guards[key] = spots;
	}
	hillRun.guards[key].forEach(([x, y], i) => {
		if (hillRun.beatenSet[`${key}:${i}`]) return;
		map.object_events.push({ _hill: `${key}:${i}`, graphics_id: HILL_GFX[key][i] || 'OBJ_EVENT_GFX_CAMPER', x, y, script: '0x0' });
	});
	hud.textContent = `TRAINER HILL ${key} — ${hillTimeStr(hillElapsed())} on the clock`;
}
function hillGuardAt(fx, fy) {
	const key = HILL_FLOORS[world.current?.name];
	if (!key || !hillRun) return null;
	const i = (hillRun.guards[key] || []).findIndex(([x, y], gi) => x === fx && y === fy && !hillRun.beatenSet[`${key}:${gi}`]);
	return i >= 0 ? { key, i } : null;
}
function startHillBattle(key, idx) {
	const lead = leadMon(party);
	const lv = Math.max(20, Math.min(255, lead?.level || 20));
	const pool = HILL_THEMES[key];
	const foes = [0, 1].map(() => battleBuildMon(pool[Math.floor(Math.random() * pool.length)], lv, battle.data)).filter(Boolean);
	if (!foes.length) return;
	battle.endSpec = null; // leaving mid-bout voids the run anyway (it's in-memory)
	battle.startTrainer(party, foes, { displayName: `HILL GUARD ${key}-${idx + 1}` }, result => {
		if (result === 'victory') {
			hillRun.beatenSet[`${key}:${idx}`] = true;
			Bag.earn(lv * 40);
			const [gx, gy] = hillRun.guards[key][idx];
			const n = npcs.list.find(o => o.tx === gx && o.ty === gy);
			if (n) n.hidden = true;
			const left = hillGuardsLeft(key);
			hud.textContent = left ? `Guard down! ${left} more holds this floor. (${hillTimeStr(hillElapsed())})`
				: `Floor ${key} cleared — the stairs are open! (${hillTimeStr(hillElapsed())})`;
			saveParty(party);
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			hillRun = null;
			healParty(party);
			hud.textContent = 'The Trainer Hill challenge ends — party healed.';
		}
	});
}
// warp gates: no wandering upstairs without a run, no stairs past unbeaten guards
function hillWarp(w) {
	const here = world.current?.name || '';
	if (here === 'TrainerHill_Entrance' && w.dest_map === 'MAP_TRAINER_HILL_1F' && !hillRun) {
		dialog.open('The attendant stops you.\n\n"Sign up at the reception desk first —\nthe HILL runs on the clock!"');
		return 'blocked';
	}
	if (HILL_FLOORS[here] && w.dest_map === HILL_NEXT[here] && hillRun && hillGuardsLeft(HILL_FLOORS[here]) > 0) {
		dialog.open(`The way up is barred!\n\n${hillGuardsLeft(HILL_FLOORS[here])} HILL GUARD${hillGuardsLeft(HILL_FLOORS[here]) === 1 ? '' : 'S'} on this floor still\nstand${hillGuardsLeft(HILL_FLOORS[here]) === 1 ? 's' : ''} undefeated.`);
		return 'blocked';
	}
	return null;
}
function hillReceptionTalk() {
	const best = safeLoad(HILL_KEY, {})?.best;
	if (hillRun) {
		dialog.open(`RECEPTION: You're ${hillTimeStr(hillElapsed())} in, climbing well!\n\nRetire from the challenge?   Z = Retire   X = Keep going`, d => {
			if (d !== 'x') { hillRun = null; hud.textContent = 'You retired from the Trainer Hill challenge.'; }
		});
		return;
	}
	if (!party.length) { dialog.open('RECEPTION: You need POKeMON to take the HILL!'); return; }
	dialog.open(`RECEPTION: Welcome to TRAINER HILL!\n\nFour floors, two HILL GUARDS each, and the\nclock runs until the roof. Prizes by your time!${best ? `\nYour best: ${hillTimeStr(best)}.` : ''}\n\nTake the challenge?   Z = Yes   X = No`, d => {
		if (d === 'x') return;
		hillRun = { start: Date.now(), beatenSet: {}, guards: {} };
		sfx('ui_select');
		hud.textContent = 'The clock is running — up the HILL!';
	});
}
function hillPrizeTalk() {
	if (!hillRun) { dialog.open('GENTLEMAN: Magnificent view, no? Take the\nchallenge from the entrance to earn it properly!'); return; }
	const secs = hillElapsed();
	const prize = secs <= 480 ? 'ppmax' : secs <= 720 ? 'rarecandy' : secs <= 960 ? 'starpiece' : 'nugget';
	Bag.addItem(prize, 1);
	const st = safeLoad(HILL_KEY, {});
	const isBest = !st.best || secs < st.best;
	if (isBest) { st.best = secs; safeSave(HILL_KEY, st); }
	if (!st.cleared) { st.cleared = true; safeSave(HILL_KEY, st); Journal.add(`Conquered Trainer Hill in ${hillTimeStr(secs)}!`); }
	hillRun = null;
	sfx('levelup');
	dialog.open(`GENTLEMAN: All eight guards, in ${hillTimeStr(secs)}!${isBest ? '\nA NEW PERSONAL BEST!' : ''}\n\nHere — a ${Bag.ITEMS[prize].name} for your climb.\nThe elevator will take you down.`);
}

// ---------- Game Corner slots ----------
// Voltorb Flip carried the coin loop alone; the classic skill-stop three-reel
// slots (slots.js, pure logic) now spins beside it. Left/Right sets the bet
// (1-3 coins), Z spins and then freezes each reel in turn; payout is the
// middle row times the bet.
const slotsMenu = { open: false, game: null, bet: 1, msg: null, lastTick: 0 };
function slotsKey(k) {
	const s = slotsMenu;
	if (k === 'x' || k === 'Escape') {
		if (!s.game || s.game.done) { s.open = false; gcMenu.open = true; return; }
		return; // no walking away mid-spin
	}
	if (!s.game || s.game.done) {
		if (k === 'ArrowLeft') { s.bet = Math.max(1, s.bet - 1); sfx('ui_move'); return; }
		if (k === 'ArrowRight') { s.bet = Math.min(3, s.bet + 1); sfx('ui_move'); return; }
	}
	if (k !== 'z' && k !== 'Enter') return;
	if (!s.game || s.game.done) {
		if (Bag.getCoins() < s.bet) { sfx('ui_denied'); s.msg = 'Not enough coins!'; return; }
		Bag.spendCoins(s.bet);
		s.game = Slots.newGame();
		s.msg = null;
		sfx('ui_select');
		return;
	}
	sfx('ui_select');
	Slots.stopNext(s.game);
	if (s.game.done) {
		const win = Slots.payout(s.game) * s.bet;
		if (win > 0) {
			Bag.addCoins(win);
			sfx(win >= 50 ? 'levelup' : 'money');
			s.msg = `${Slots.row(s.game).join(' · ').toUpperCase()} — won ${win} coins!`;
		} else {
			s.msg = 'No luck this spin...';
		}
	}
}
const SLOT_ART = {
	seven: ['7', '#ff5d5d'], bar: ['BAR', '#ffd75e'], pika: ['PIKA', '#f7d02c'],
	psy: ['PSY', '#e8b34a'], cherry: ['CHR', '#ff7d9c'], berry: ['BRY', '#6be08a'],
};
function drawSlots(W, H) {
	const u = H / 480;
	const s = slotsMenu;
	menuChrome(W, H, u, 'SLOTS', s.game && !s.game.done ? 'Z: stop the next reel!' : '◄►: bet 1-3   Z: spin   X: back');
	// spin: the reels advance on a frame clock
	if (s.game && !s.game.done) {
		const now = performance.now();
		if (now - s.lastTick > 85) { Slots.tick(s.game); s.lastTick = now; }
	}
	const cw = 92 * u, ch = 64 * u, gx = (W - cw * 3 - 24 * u) / 2, gy = 120 * u;
	for (let off = -1; off <= 1; off++) {
		const syms = s.game ? Slots.row(s.game, off) : ['seven', 'seven', 'seven'];
		syms.forEach((sym, i) => {
			const x = gx + i * (cw + 12 * u), y = gy + (off + 1) * ch;
			sctx.fillStyle = off === 0 ? 'rgba(40,70,110,0.95)' : 'rgba(22,36,60,0.85)';
			BUI.rr(sctx, x, y, cw, ch - 6 * u, 8 * u); sctx.fill();
			if (off === 0) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3; BUI.rr(sctx, x + 1, y + 1, cw - 2, ch - 8 * u, 8 * u); sctx.stroke(); }
			const [label, color] = SLOT_ART[sym] || [sym, '#fff'];
			sctx.fillStyle = off === 0 ? color : 'rgba(255,255,255,0.35)';
			sctx.font = `${Math.round((off === 0 ? 26 : 20) * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText(label, x + cw / 2, y + ch / 2 + 8 * u);
			sctx.textAlign = 'left';
		});
	}
	// reel state pips
	if (s.game) {
		s.game.stopped.forEach((st, i) => {
			sctx.fillStyle = st ? BUI.C.accent : BUI.C.dim;
			sctx.beginPath();
			sctx.arc(gx + i * (cw + 12 * u) + cw / 2, gy + 3 * ch + 14 * u, 5 * u, 0, Math.PI * 2);
			sctx.fill();
		});
	}
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
	sctx.fillText(`BET: ${s.bet}   COINS: ${Bag.getCoins()}`, 40 * u, 96 * u);
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
	sctx.fillText('7×3=100  BAR×3=50  PIKA×3=20  PSY×3=10  BRY×3=8  CHR×3=6  CHR×2=2  (× bet)', 40 * u, H - 34 * u);
	if (s.msg) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(s.msg, 40 * u, H - 14 * u);
	}
}

// ---------- Secret Bases ----------
// Every one of Emerald's REAL base spots survives in the shipped layouts as a
// metatile behavior (0x90-0x9D: red/brown/yellow/blue cave, tree, shrub), so
// detection is mechanical — no hand-placed zones, all ~70 spots work. One base
// per player: claim a spot, decorate it, and FRIENDS who walk up to your spot
// can step inside and see your handiwork (D1: base-save/base-get/base-dir).
const BASE_KEY = 'magepunk_base_v1';
const DECO_ITEMS = [
	{ id: 'plant', name: 'POTTED PLANT' }, { id: 'table', name: 'WOOD TABLE' },
	{ id: 'cushion', name: 'CUSHION' }, { id: 'mat', name: 'SPIN MAT' },
	{ id: 'lamp', name: 'GLOW LAMP' }, { id: 'rock', name: 'PRETTY ROCK' },
	{ id: 'doll', name: 'POKe DOLL' }, { id: 'banner', name: 'BANNER' },
];
const DECO_CAP = 16;
function myBase() { return safeLoad(BASE_KEY, null); }
function saveMyBase(b) { safeSave(BASE_KEY, b); if (MP_ON) { try { MP.call('base-save', { spot: b.spot, deco: b.deco || [] }).catch(() => {}); } catch (e) {} } }
// spot key: map file + the LEFT tile of a tree pair, so both halves agree
function baseSpotKey(fx, fy, behavior) {
	const x = behavior === 0x9C ? fx - 1 : fx;
	return `${world.current?.name}:${x},${fy}`;
}
// whose base is on this spot? friends' claims are cached briefly
let baseDir = null, baseDirAt = 0;
async function fetchBaseDir() {
	if (!MP_ON) return {};
	if (baseDir && Date.now() - baseDirAt < 60000) return baseDir;
	try { baseDir = (await MP.call('base-dir'))?.dir || {}; baseDirAt = Date.now(); } catch (e) { baseDir = baseDir || {}; }
	return baseDir;
}
// the live base room context (whose deco to draw, whether you may edit)
let baseCtx = null;
function baseRoomFor(spotKey, behavior) {
	const SNAKE = { 0x90: 'RED_CAVE', 0x92: 'BROWN_CAVE', 0x94: 'YELLOW_CAVE', 0x96: 'TREE', 0x98: 'SHRUB', 0x9A: 'BLUE_CAVE', 0x9C: 'TREE' };
	let h = 0;
	for (const c of spotKey) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `MAP_SECRET_BASE_${SNAKE[behavior & ~1] || 'RED_CAVE'}${(h % 4) + 1}`;
}
async function enterBase(spotKey, behavior, owner) {
	const mine = owner == null;
	let deco = [];
	if (mine) deco = myBase()?.deco || [];
	else {
		try { deco = ((await MP.call('base-get', { user: owner }))?.base?.deco) || []; } catch (e) {}
	}
	baseCtx = { mine, owner: owner || null, deco, spot: spotKey };
	await warpTo(baseRoomFor(spotKey, behavior), '0');
	hud.textContent = mine ? 'Your SECRET BASE. Press Z on open floor to decorate!' : `${(owner || '').toUpperCase()}'s SECRET BASE!`;
}
function secretSpotInteract(fx, fy, behavior) {
	const key = baseSpotKey(fx, fy, behavior);
	const mine = myBase();
	if (mine?.spot === key) {
		dialog.open('Your SECRET BASE!\n\nStep inside?   Z = Yes   X = No', d => { if (d !== 'x') enterBase(key, behavior, null); });
		return;
	}
	fetchBaseDir().then(dir => {
		const owner = dir[key];
		if (owner && owner !== (mpAccount?.username || '')) {
			dialog.open(`This is ${owner.toUpperCase()}'s SECRET BASE!\n\nPeek inside?   Z = Yes   X = No`, d => { if (d !== 'x') enterBase(key, behavior, owner); });
			return;
		}
		const q = mine
			? `A perfect hollow for a SECRET BASE!\n\nMove your base HERE? Your decorations\ncome along.   Z = Yes   X = No`
			: 'A perfect hollow for a SECRET BASE!\n\nMake this your base?   Z = Yes   X = No';
		dialog.open(q, d => {
			if (d === 'x') return;
			const b = { spot: key, behavior, deco: mine?.deco || [] };
			saveMyBase(b);
			baseDir = null; // the directory changed
			Journal.add('Claimed a SECRET BASE!');
			sfx('levelup');
			enterBase(key, behavior, null);
		});
	});
}
// inside your own base, Z on open floor decorates; Z on a decoration removes it
const decoMenu = { open: false, idx: 0, tx: 0, ty: 0 };
function baseDecoInteract(fx, fy) {
	if (!baseCtx) return false;
	const d = (baseCtx.deco || []).find(x => x.x === fx && x.y === fy);
	if (d) {
		if (!baseCtx.mine) { dialog.open(`A lovely ${DECO_ITEMS.find(i => i.id === d.id)?.name || d.id}.`); return true; }
		dialog.open(`Put the ${DECO_ITEMS.find(i => i.id === d.id)?.name || d.id} away?\n\nZ = Yes   X = No`, k => {
			if (k === 'x') return;
			baseCtx.deco = baseCtx.deco.filter(x => x !== d);
			const b = myBase(); if (b) { b.deco = baseCtx.deco; saveMyBase(b); }
		});
		return true;
	}
	if (!baseCtx.mine) return false;
	if (!world.isPassable(fx, fy) || world.warpAt(fx, fy)) return false;
	decoMenu.open = true; decoMenu.idx = 0; decoMenu.tx = fx; decoMenu.ty = fy;
	sfx('ui_select');
	return true;
}
function decoKey(k) {
	const rows = DECO_ITEMS.length + 1;
	if (k === 'ArrowUp') decoMenu.idx = (decoMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') decoMenu.idx = (decoMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { decoMenu.open = false; return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (decoMenu.idx >= DECO_ITEMS.length) { decoMenu.open = false; return; }
	if ((baseCtx?.deco || []).length >= DECO_CAP) { dialog.open(`The base is full! (${DECO_CAP} decorations max.)`); decoMenu.open = false; return; }
	const it = DECO_ITEMS[decoMenu.idx];
	baseCtx.deco.push({ id: it.id, x: decoMenu.tx, y: decoMenu.ty });
	const b = myBase(); if (b) { b.deco = baseCtx.deco; saveMyBase(b); }
	sfx('item_get');
	decoMenu.open = false;
}
function drawDecoMenu(W, H) {
	const u = H / 480;
	optionList(W, H, u, 'DECORATE', `Place what here? (${(baseCtx?.deco || []).length}/${DECO_CAP} placed)`,
		DECO_ITEMS.map(i => i.name).concat(['Never mind']), decoMenu.idx, 'deco:', null);
}
// chunky 16px pixel decorations, drawn in code (no art assets needed)
function drawDecoSprite(ctx, id, px, py) {
	const P = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(px + x, py + y, w, h); };
	switch (id) {
		case 'plant': P(5, 9, 6, 6, '#8a5a2b'); P(4, 3, 8, 7, '#2e8b3a'); P(6, 1, 4, 4, '#46c455'); break;
		case 'table': P(2, 5, 12, 7, '#8a5a2b'); P(3, 4, 10, 3, '#c98d4a'); break;
		case 'cushion': P(3, 6, 10, 7, '#c23b4e'); P(5, 4, 6, 4, '#e26b7c'); break;
		case 'mat': P(2, 3, 12, 11, '#2c5f9e'); P(5, 6, 6, 5, '#5b8fd0'); break;
		case 'lamp': P(7, 8, 2, 7, '#666'); P(4, 2, 8, 7, '#ffd75e'); break;
		case 'rock': P(4, 7, 9, 7, '#8d99a6'); P(6, 5, 5, 4, '#b7c2cc'); break;
		case 'doll': P(4, 6, 8, 8, '#e87ca0'); P(5, 2, 6, 6, '#f7a8c4'); break;
		case 'banner': P(3, 2, 10, 10, '#7a4bd0'); P(5, 4, 6, 3, '#ffd75e'); P(3, 12, 10, 2, '#4a2a86'); break;
		default: P(4, 4, 8, 8, '#999');
	}
}
function drawBaseDeco(ctx, camX, camY) {
	if (!baseCtx || !/^SecretBase_/.test(world.current?.name || '')) return;
	for (const d of baseCtx.deco || []) drawDecoSprite(ctx, d.id, d.x * META - camX, d.y * META - camY);
}

// ---------- async friend trades (mailbox, escrowed) ----------
// Offer a party POKeMON to a friend whether they're online or not: the mon is
// escrowed out of your save the moment the offer sends. They accept with a
// counterpart (which lands in your world as an exactly-once delivery, like a
// gift) or decline (yours comes home the same way).
const socialMenu = { open: false, mode: 'offermon', friend: null, trades: null, trade: null, idx: 0, flash: null };
function monLine(m) { return `${m.nickname || m.name} Lv${m.level}`; }
function openTradeOffer(f) {
	if (!party || party.length < 2) { dialog.open('You need at least two POKeMON to offer one.'); return; }
	socialMenu.open = true; socialMenu.mode = 'offermon'; socialMenu.friend = f; socialMenu.idx = 0; socialMenu.flash = null;
}
async function openTradeInbox() {
	socialMenu.open = true; socialMenu.mode = 'inbox'; socialMenu.idx = 0; socialMenu.trades = null; socialMenu.flash = null;
	try { socialMenu.trades = (await MP.call('trade-list'))?.trades || []; } catch (e) { socialMenu.trades = []; socialMenu.flash = 'Could not reach the server.'; }
}
async function sendTradeOffer(f, monIdx) {
	const mon = party[monIdx];
	if (!mon || party.length < 2) return;
	party.splice(monIdx, 1); // escrow: it leaves the save before the offer sends
	saveParty(party);
	socialMenu.open = false;
	try {
		const r = await MP.call('trade-offer', { to: f.username, mon });
		if (r?.error) throw new Error(r.error);
		Journal.add(`Offered ${monLine(mon)} to ${f.username} in a trade`);
		dialog.open(`Your trade offer is on its way!\n\n${monLine(mon)} will wait with ${f.username}\nuntil they accept or decline.`);
	} catch (e) {
		addCaught(party, mon); saveParty(party); // the escrow comes straight home
		dialog.open('The offer could not be sent — ' + (e?.message || 'no connection') + '.\nYour POKeMON is back safe.');
	}
}
async function acceptTrade(trade, monIdx) {
	const mine = party[monIdx];
	if (!mine || party.length < 2) return;
	party.splice(monIdx, 1);
	saveParty(party);
	socialMenu.open = false;
	try {
		const r = await MP.call('trade-accept', { id: trade.id, mon: mine });
		if (r?.error) throw new Error(r.error);
		const got = r.mon;
		Dex.markCaught(got.speciesId); dexMilestoneCheck();
		const where = addCaught(party, got);
		saveParty(party);
		Journal.add(`Traded ${monLine(mine)} to ${trade.from} for ${monLine(got)}!`);
		sfx('levelup');
		dialog.open(`Trade complete!\n\n${monLine(got)} arrived from ${trade.from}${where === 'box' ? ' (sent to the box)' : ''}.\nTake good care of it!`);
	} catch (e) {
		addCaught(party, mine); saveParty(party);
		dialog.open('The trade fell through — ' + (e?.message || 'no connection') + '.\nYour POKeMON is back safe.');
	}
}
async function declineTrade(trade) {
	socialMenu.open = false;
	try { await MP.call('trade-decline', { id: trade.id }); dialog.open(`You declined ${trade.from}'s offer.\nTheir POKeMON is on its way home.`); }
	catch (e) { dialog.open('Could not decline right now — try again later.'); }
}
// on boot: accepted/declined counterparts come home, exactly once each
async function claimTradeDeliveries() {
	if (!MP_ON) return;
	let list = [];
	try { list = (await MP.call('trade-deliveries'))?.deliveries || []; } catch (e) { return; }
	for (const d of list) {
		let got = null;
		try { got = (await MP.call('trade-claim', { id: d.id }))?.delivery; } catch (e) { continue; }
		if (!got?.mon) continue;
		Dex.markCaught(got.mon.speciesId); dexMilestoneCheck();
		const where = addCaught(party, got.mon);
		saveParty(party);
		if (got.returned) {
			dialog.open(`${monLine(got.mon)} came home —\n${got.from} declined the trade.${where === 'box' ? '\n(Sent to the box.)' : ''}`);
		} else {
			Journal.add(`${got.from} accepted the trade — ${monLine(got.mon)} arrived!`);
			dialog.open(`${got.from} accepted your trade!\n\n${monLine(got.mon)} is yours now${where === 'box' ? ' (sent to the box)' : ''}.`);
		}
	}
}
function socialKey(k) {
	const s = socialMenu;
	if (s.mode === 'inbox') {
		const list = s.trades || [];
		const rows = list.length + 1;
		if (k === 'ArrowUp') s.idx = (s.idx + rows - 1) % rows;
		if (k === 'ArrowDown') s.idx = (s.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { s.open = false; return; }
		if (k !== 'z' && k !== 'Enter') return;
		if (s.idx >= list.length) { s.open = false; return; }
		const t = list[s.idx];
		dialog.open(`${t.from} offers ${monLine(t.mon)}!\n\nZ = Accept (pick your POKeMON)\nX = Decline (sends theirs home)`, d => {
			if (d === 'x') { declineTrade(t); return; }
			if (!party || party.length < 2) { dialog.open('You need at least two POKeMON to trade one.'); return; }
			s.mode = 'acceptmon'; s.trade = t; s.idx = 0;
		});
		return;
	}
	// offermon / acceptmon: a party row picker
	if (k === 'ArrowUp') s.idx = (s.idx + party.length - 1) % party.length;
	if (k === 'ArrowDown') s.idx = (s.idx + 1) % party.length;
	if (k === 'x' || k === 'Escape') { s.open = false; return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (!party[s.idx]) return;
	if (s.mode === 'offermon') {
		const f = s.friend, mon = party[s.idx];
		dialog.open(`Offer ${monLine(mon)} to ${f.username}?\n\nIt leaves your party until they answer.\nZ = Yes   X = No`, d => { if (d !== 'x') sendTradeOffer(f, s.idx); });
	} else if (s.mode === 'acceptmon') {
		const t = s.trade, mine = party[s.idx];
		dialog.open(`Trade YOUR ${monLine(mine)} for\n${t.from}'s ${monLine(t.mon)}?\n\nZ = Trade!   X = No`, d => { if (d !== 'x') acceptTrade(t, s.idx); });
	}
}
function drawSocial(W, H) {
	const u = H / 480;
	const s = socialMenu;
	if (s.mode === 'inbox') {
		const list = s.trades;
		const rows = list == null ? ['(loading…)'] : list.map(t => `${t.from} offers ${monLine(t.mon)}`).concat(['Back']);
		optionList(W, H, u, 'TRADE OFFERS', 'Z: answer an offer', rows, s.idx, 'soc:', s.flash);
		return;
	}
	menuChrome(W, H, u, s.mode === 'offermon' ? `OFFER A TRADE — to ${s.friend?.username}` : `TRADE WITH ${s.trade?.from}`,
		s.mode === 'offermon' ? 'Which POKeMON do you offer?' : `Their ${s.trade ? monLine(s.trade.mon) : ''} — pick yours to send.`);
	party.forEach((mo, i) => monRow('socm:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, s.idx === i, u));
}

// ---------- Shoal Cave tides ----------
// The Clock drives Emerald's real rhythm: LOW tide 3-9 and 15-21, HIGH tide
// otherwise. At high tide the Inner Room swaps to its shipped high-tide layout
// (flooded — Surf country) and the deeper rooms (Stairs/Lower/Ice) are
// underwater outright. The high-tide map shipped as a layout-only shell (no
// warps, even in the decomp — events live on the low map), so its warps are
// injected at load and arrival is re-placed by hand. SHOAL SALT × 4 and SHOAL
// SHELL × 4 hide at the classic dig spots (once per save — no respawn timers),
// and the hermit at the entrance trades 4 + 4 for his SHELL BELL.
const SHOAL_KEY = 'magepunk_shoal_v1';
const shoalTide = () => { const h = Clock.hour(); return (h >= 3 && h < 9) || (h >= 15 && h < 21) ? 'low' : 'high'; };
// which dig spot yields what, by map:x,y (the decomp's ShoalSalt1-4/ShoalShell1-4)
const SHOAL_ITEM_AT = {
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:31,8': 'shoalsalt', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:14,26': 'shoalsalt',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,20': 'shoalshell', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,10': 'shoalshell',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:6,9': 'shoalshell', 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:16,13': 'shoalshell',
	'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM:18,2': 'shoalsalt', 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM:11,11': 'shoalsalt',
};
// the low Inner Room's warp list, mirrored into the high-tide shell at load
const SHOAL_INNER_WARPS = [
	{ x: 34, y: 29, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '1' },
	{ x: 38, y: 15, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '0' },
	{ x: 42, y: 4, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '1' },
	{ x: 19, y: 14, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '0' },
	{ x: 15, y: 19, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '1' },
	{ x: 30, y: 25, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM', dest_warp_id: '2' },
	{ x: 14, y: 33, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '2' },
	{ x: 40, y: 33, dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM', dest_warp_id: '3' },
];
let shoalArrival = null; // set by shoalWarp: where to stand after the shell map loads
// warp overrides: high tide floods the deep rooms and swaps the Inner Room
function shoalWarp(w) {
	if (shoalTide() === 'low') return null;
	if (/SHOAL_CAVE_LOW_TIDE_(STAIRS|LOWER|ICE)_ROOM$/.test(w.dest_map)) {
		dialog.open('Seawater surges through the passage!\n\nThe way down is underwater until the tide\ngoes out. (Low tide: 3-9 and 15-21.)');
		return 'blocked';
	}
	// only the ENTRANCE door swaps you into the flooded room — climbing back UP
	// from a deep room lands in the low layout as a grace (no stranding)
	if (w.dest_map === 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM' && world.current?.name === 'ShoalCave_LowTideEntranceRoom') {
		const idx = Math.max(0, parseInt(w.dest_warp_id, 10) || 0);
		shoalArrival = [SHOAL_INNER_WARPS[idx]?.x ?? 34, SHOAL_INNER_WARPS[idx]?.y ?? 29];
		return { map: 'MAP_SHOAL_CAVE_HIGH_TIDE_INNER_ROOM', warp: w.dest_warp_id };
	}
	return null;
}
function shoalFixup(label) {
	if (label !== 'ShoalCave_HighTideInnerRoom') { shoalArrival = null; return; }
	for (const wv of SHOAL_INNER_WARPS) {
		if (!world.warps.some(x => x.x === wv.x && x.y === wv.y)) world.warps.push({ ...wv });
	}
	if (shoalArrival) { player.setTile(shoalArrival[0], shoalArrival[1]); shoalArrival = null; }
}
function shoalDig() {
	const key = `${world.current?.map?.id}:${player.tx + ((({ down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] })[player.facing] || [0, 0])[0])},${player.ty + ((({ down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] })[player.facing] || [0, 0])[1])}`;
	const item = SHOAL_ITEM_AT[key];
	if (!item) { dialog.open('Just wet cave rock.'); return; }
	const st = safeLoad(SHOAL_KEY, { taken: {} });
	if (st.taken[key]) { dialog.open('You already dug everything out of this spot.'); return; }
	st.taken[key] = 1;
	safeSave(SHOAL_KEY, st);
	Bag.addItem(item, 1);
	sfx('item_get');
	dialog.open(`Buried in the ${item === 'shoalsalt' ? 'briny sand' : 'shallows'}...\n\nYou dug up a ${Bag.ITEMS[item].name}!`);
}
function shoalHermitTalk() {
	const salt = Bag.count('shoalsalt'), shell = Bag.count('shoalshell');
	if (salt >= 4 && shell >= 4) {
		dialog.open(`HERMIT: Ooh! ${salt} SHOAL SALT and ${shell} SHOAL SHELL!\nWith 4 of each I can craft my masterpiece.\n\nShall I?   Z = Yes   X = No`, declined => {
			if (declined === 'x') return;
			for (let i = 0; i < 4; i++) { Bag.consume('shoalsalt'); Bag.consume('shoalshell'); }
			Bag.addItem('shellbell', 1);
			sfx('levelup');
			Journal.add('The hermit crafted a SHELL BELL from shoal salt and shells!');
			dialog.open('HERMIT: Grind the salt, polish the shells...\n\nDone! Here — a SHELL BELL! The holder drains\na little life from every hit it lands.');
		});
		return;
	}
	dialog.open(`HERMIT: I craft SHELL BELLS from what this cave\nhides — 4 SHOAL SALT and 4 SHOAL SHELL.\n(You carry ${salt} salt, ${shell} shell.)\n\nSalt lies deep — low tide only. Shells sit in\nthe inner cavern. Dig at the sparkling spots!`);
}
function kurtTalk() {
	const held = Object.keys(Bag.ITEMS).filter(id => Bag.ITEMS[id].kind === 'apricorn' && Bag.count(id) > 0);
	if (!held.length) {
		dialog.open('KURT: I turn APRICORNS into POKe BALLS — my own\nhandiwork, better than store-bought!\n\nAPRICORNS grow on the trees along ROUTE 37\nand ROUTE 42. Bring me any color!');
		return;
	}
	const id = held[0];
	const ball = Bag.ITEMS[id].ball;
	dialog.open(`KURT: Ah, a ${Bag.ITEMS[id].name}! I can craft that into\na ${Bag.ITEMS[ball].name}. (You have ${Bag.count(id)}.)\n\nShall I?   Z = Yes   X = No`, declined => {
		if (declined === 'x') return;
		Bag.consume(id);
		Bag.addItem(ball, 1);
		sfx('levelup');
		dialog.open(`KURT: Hrmph... rrgh... THERE!\n\nOne ${Bag.ITEMS[ball].name}, made the old way!\nBring me more APRICORNS any time.`);
	});
}

// ---------- roaming legendaries ----------
// RAIKOU and ENTEI prowl Johto's routes, LATIOS and LATIAS Hoenn's, once that
// region holds 4 badges. They hop to a new route every map change; on their
// route they can take over a wild encounter — flee-prone (Mean Look holds
// them) and their wounds persist between meetings, the classic chase. Fainting
// one loses it for the save, like the old games.
const ROAM_KEY = 'magepunk_roamers_v1';
const ROAMERS = {
	raikou: { region: 'JOHTO', level: 40 },
	entei: { region: 'JOHTO', level: 40 },
	latios: { region: 'HOENN', level: 40 },
	latias: { region: 'HOENN', level: 40 },
};
const ROAM_ROUTES = {
	JOHTO: ['Route29', 'Route30', 'Route31', 'Route32', 'Route33', 'Route34', 'Route35', 'Route36', 'Route37', 'Route38', 'Route39', 'Route42', 'Route43', 'Route44', 'Route45', 'Route46'],
	HOENN: ['Route110', 'Route111', 'Route112', 'Route113', 'Route114', 'Route115', 'Route116', 'Route117', 'Route118', 'Route119', 'Route120', 'Route121'],
};
function roamState() { return safeLoad(ROAM_KEY, {}); }
function saveRoam(st) { safeSave(ROAM_KEY, st); }
// every map change, each active roamer bolts to a random route of its region
function roamersOnMapChange() {
	const st = roamState();
	let changed = false;
	for (const [key, cfg] of Object.entries(ROAMERS)) {
		if (st[key]?.down) continue;
		if ((Badges.count(cfg.region) || 0) < 4) continue;
		const pool = ROAM_ROUTES[cfg.region];
		if (!st[key]) {
			st[key] = { map: pool[Math.floor(Math.random() * pool.length)], hp: null, seen: false };
			Journal.add(`Rumors spread of a strange POKeMON roaming ${cfg.region}...`);
			hud.textContent = `Rumors tell of something powerful roaming ${cfg.region}'s routes...`;
			changed = true;
		} else {
			st[key].map = pool[Math.floor(Math.random() * pool.length)];
			changed = true;
		}
	}
	if (changed) saveRoam(st);
}
const roamerHere = () => Object.keys(ROAMERS).find(k => {
	const st = roamState()[k];
	return st && !st.down && st.map === world.current?.name;
}) || null;
function roamerEnd(key) {
	return result => {
		const st = roamState();
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			st[key] = { down: true }; saveRoam(st);
			syncOverworldAchievements();
		} else if (result === 'victory') {
			st[key] = { down: true }; saveRoam(st); // fainted — gone for this save, like the classics
			hud.textContent = 'The roaming POKeMON fainted... it will not be seen again.';
			evolution.check(party, battle.data);
		} else if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		} else {
			// it bolted (or you ran): its wounds travel with it
			if (st[key] && !st[key].down) {
				st[key].hp = battle.lastFoe?.curHP ?? st[key].hp;
				st[key].status = battle.lastFoe?.status || null;
				saveRoam(st);
			}
			saveParty(party);
		}
	};
}
function startRoamerBattle(key) {
	if (!party || !leadMon(party) || battle.blocking) return;
	const st = roamState();
	Dex.markSeen(key);
	if (st[key]) { st[key].seen = true; saveRoam(st); }
	battle.themeHint = 'legendary';
	battle.endSpec = { kind: 'roamer', roamer: key };
	battle.start(party, key, ROAMERS[key].level, roamerEnd(key), null,
		{ roamer: { hp: st[key]?.hp ?? null, status: st[key]?.status || null } });
}

// ---------- the Johto RADIO ----------
// Every radio object used to print one static "cheerful march" line. Tune in for
// real: four channels — POKeMON MUSIC (swaps the BGM), OAK'S PKMN TALK (reports
// where the roaming legendaries were last seen), BUENA'S PASSWORD (a daily
// Blue-Point draw with a prize ladder) and the LUCKY CHANNEL (a daily lottery
// against your Trainer ID). Driven as a stateful canvas menu (the gcMenu/shopMenu
// pattern), intercepted in runScriptLabel before the std body would run.
const RADIO_CHANNELS = ['POKeMON MUSIC', "OAK'S PKMN TALK", "BUENA'S PASSWORD", 'LUCKY CHANNEL', 'TURN IT OFF'];
// Crystal's radio-only tunes weren't ported, so real, present city themes stand
// in as "stations" (each key is confirmed live in music_map.json).
const RADIO_STATIONS = [
	{ name: 'POKeMON MARCH', key: 'crystal_MUSIC_GOLDENROD_CITY' },
	{ name: 'POKeMON LULLABY', key: 'crystal_MUSIC_POKEMON_CENTER' },
	{ name: 'UNOWN RADIO', key: 'crystal_MUSIC_ECRUTEAK_CITY' },
];
let radioTune = null;   // BGM override while a music channel plays; cleared on map change
const radioMenu = { open: false, idx: 0, station: 0 };
// deterministic 32-bit FNV-1a — daily draws hash the date so a channel can't be
// re-rolled by tuning in twice
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

// a stable 5-digit Trainer ID. Derived from the account name (identical across
// devices when signed in), else a once-seeded local id. Zero-padded at display.
function playerTID() {
	const name = (MP.cachedState?.() || {}).username || localStorage.getItem('magepunk_name') || '';
	if (name) return hashStr(name) % 100000;
	let tid = parseInt(localStorage.getItem('magepunk_tid') || '0', 10);
	if (!tid) { tid = 1 + Math.floor(Math.random() * 99998); safeSaveStr('magepunk_tid', String(tid)); }
	return tid % 100000;
}
const tidStr = () => String(playerTID()).padStart(5, '0');

function openRadio() { radioMenu.open = true; radioMenu.idx = 0; sfx('ui_open'); }

// POKeMON MUSIC: cycle to the next station and take over the BGM until you leave
function playRadioStation() {
	const s = RADIO_STATIONS[radioMenu.station % RADIO_STATIONS.length];
	radioMenu.station++;
	radioTune = s.key; bgmTick();   // apply the override immediately
	return `The RADIO tunes to POKeMON MUSIC.  ♪ Now playing: ${s.name} ♪`;
}

// OAK'S PKMN TALK: the roaming-legendary sighting report. The roamer system
// already moves Raikou/Entei/Latios/Latias each map change but nothing announced
// where — this is that missing readout.
function oakTalkText() {
	const st = roamState();
	const sightings = [];
	for (const key of Object.keys(ROAMERS)) {
		const r = st[key];
		if (!r || r.down || !r.map) continue;
		const nm = (battle.data?.species?.[key]?.name || key).toUpperCase();
		sightings.push(`${nm} near ${r.map.replace(/^Route/, 'ROUTE ')}`);
	}
	if (!sightings.length) return "PROF. OAK'S PKMN TALK: ...and remember, different POKeMON appear by day and by night! Keep exploring, and you'll fill that POKeDEX.";
	return 'PROF. OAK\'S PKMN TALK: We have sighting reports! ' + sightings.join('.  ') + '.  Go get \'em!';
}

// BUENA'S PASSWORD: one tune-in per day earns a Blue Point; crossing a threshold
// on the ladder hands a prize (once each). The daily password itself is flavour.
const BUENA_KEY = 'magepunk_buena_v1';
const BUENA_WORDS = ['LAPRAS', 'PIKACHU', 'MACHOP', 'EEVEE', 'ODDISH', 'SLOWPOKE', 'DIGLETT', 'PIDGEY', 'GEODUDE', 'GENGAR', 'ONIX', 'ABRA', 'MAGIKARP', 'DITTO'];
const BUENA_PRIZES = [ // Blue-Point balance -> a one-time prize when you reach it
	{ at: 3, item: 'pokeball', n: 5 }, { at: 7, item: 'ultraball', n: 3 },
	{ at: 15, item: 'ppup', n: 1 }, { at: 25, item: 'rarecandy', n: 1 }, { at: 40, item: 'maxrevive', n: 2 },
];
function buenaText() {
	const st = safeLoad(BUENA_KEY, { date: '', points: 0, claimed: 0 });
	const today = new Date().toDateString();
	const word = BUENA_WORDS[hashStr(today) % BUENA_WORDS.length];
	if (st.date === today) return `BUENA'S PASSWORD: Today's password is still "${word}"! You've already tuned in today. (Blue Points: ${st.points})`;
	st.date = today; st.points = (st.points || 0) + 1;
	let msg = `BUENA'S PASSWORD: Today's password is "${word}"! Thanks for listening — +1 Blue Point! (Total: ${st.points})`;
	for (const p of BUENA_PRIZES) {
		if (st.points >= p.at && (st.claimed || 0) < p.at) {
			st.claimed = p.at; Bag.addItem(p.item, p.n);
			msg += `  ★ ${p.at} points reached! BUENA sends you ${p.n}x ${(Bag.ITEMS[p.item]?.name || p.item)}!`;
			break;
		}
	}
	safeSave(BUENA_KEY, st);
	return msg;
}

// LUCKY CHANNEL: the daily Lucky Number Show. Today's number is fixed per date;
// the more trailing digits it shares with your Trainer ID, the bigger the prize.
const LOTTO_KEY = 'magepunk_lottery_v1';
const LOTTO_PRIZES = { 5: ['masterball', 1, 'the GRAND PRIZE — a MASTER BALL'], 4: ['ppup', 1, '2nd prize — a PP UP'], 3: ['rarecandy', 1, '3rd prize — a RARE CANDY'], 2: ['ultraball', 2, '4th prize — 2 ULTRA BALLS'] };
function luckyText() {
	const st = safeLoad(LOTTO_KEY, { date: '' });
	const today = new Date().toDateString();
	const tid = tidStr();
	if (st.date === today) return `LUCKY CHANNEL: Today's drawing is over! Please come back tomorrow. (Your ID: ${tid})`;
	st.date = today; safeSave(LOTTO_KEY, st);
	const draw = String(hashStr('lotto:' + today) % 100000).padStart(5, '0');
	let match = 0; for (let i = 1; i <= 5; i++) { if (draw.slice(-i) === tid.slice(-i)) match = i; else break; }
	if (match >= 2) { const [item, n, label] = LOTTO_PRIZES[match]; Bag.addItem(item, n); return `LUCKY CHANNEL: Today's Lucky Number is ${draw}! Your ID ${tid} matches the last ${match} digits — you win ${label}!`; }
	return `LUCKY CHANNEL: Today's Lucky Number is ${draw}. Your ID is ${tid}. No match today — better luck tomorrow!`;
}

function radioKey(k) {
	const n = RADIO_CHANNELS.length;
	if (k === 'ArrowUp') { radioMenu.idx = (radioMenu.idx + n - 1) % n; return; }
	if (k === 'ArrowDown') { radioMenu.idx = (radioMenu.idx + 1) % n; return; }
	if (k === 'x' || k === 'Escape') { radioMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const ch = radioMenu.idx;
		if (ch === 4) { radioTune = null; bgmTick(); radioMenu.open = false; return; } // TURN IT OFF
		const text = ch === 0 ? playRadioStation() : ch === 1 ? oakTalkText() : ch === 2 ? buenaText() : luckyText();
		radioMenu.open = false;                      // hand off to the dialog...
		dialog.open(text, () => { radioMenu.open = true; }); // ...then reopen so you can keep tuning
	}
}
function drawRadio(W, H) {
	drawVertical(W, H, H / 480, 'RADIO', 'Tune in — up/down pick, Z listen, X off.', RADIO_CHANNELS, radioMenu.idx, 'radio');
}

// ---------- Bug-Catching Contest (National Park, Tue/Thu/Sat) ----------
// The classic: sign up with the gate officer, hunt the park with 20 SPORT
// BALLS, keep exactly ONE catch as your entry (swap any time), and get judged
// when you leave the park or run dry. Judged score = level + stats + species
// rarity, against the traditional contestant field. 1st SUN STONE, 2nd
// EVERSTONE, 3rd GOLD BERRY, everyone else a BERRY — and your entry is yours
// to keep either way.
const BUG_KEY = 'magepunk_bugcontest_v1';
let bugContest = safeLoad(BUG_KEY, null) || { active: false, caught: null, date: '' };
function saveBugContest() { safeSave(BUG_KEY, bugContest); }
const isBugDay = () => [2, 4, 6].includes(new Date().getDay()); // Tue/Thu/Sat
// the Crystal contest table, in spirit: commons, cocoons, and the two prizes
const BUG_TABLE = [
	{ id: 'caterpie', min: 7, max: 18, w: 20, score: 20 }, { id: 'weedle', min: 7, max: 18, w: 20, score: 20 },
	{ id: 'metapod', min: 9, max: 18, w: 10, score: 30 }, { id: 'kakuna', min: 9, max: 18, w: 10, score: 30 },
	{ id: 'paras', min: 10, max: 17, w: 10, score: 35 }, { id: 'venonat', min: 10, max: 16, w: 10, score: 40 },
	{ id: 'butterfree', min: 12, max: 15, w: 5, score: 60 }, { id: 'beedrill', min: 12, max: 15, w: 5, score: 60 },
	{ id: 'scyther', min: 13, max: 14, w: 5, score: 80 }, { id: 'pinsir', min: 13, max: 14, w: 5, score: 80 },
];
const BUG_SCORES = Object.fromEntries(BUG_TABLE.map(e => [e.id, e.score]));
function bugContestRoll() {
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
function bugScore(mon) {
	const stats = mon.stats || {};
	const tot = (mon.maxHP || 0) + (stats.atk || 0) + (stats.def || 0) + (stats.spa || 0) + (stats.spd || 0) + (stats.spe || 0);
	return (mon.level || 1) * 5 + Math.round(tot / 8) + (BUG_SCORES[mon.speciesId] ?? 30);
}
// a catch during the contest becomes (or challenges) the single kept entry —
// the party add waits for the judging. Returns true when it consumed the catch.
function bugContestCatch(mon) {
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
function bugOfficerTalk() {
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
	if (!party.length) { dialog.open('OFFICER: You need a POKeMON to enter!'); return; }
	dialog.open('OFFICER: Welcome to the BUG-CATCHING CONTEST!\n\nCatch bugs in the park using 20 SPORT BALLS.\nYou keep ONE catch as your entry — you can swap it\nany time. Leave the park (or run dry) to be judged.\n\nEnter?   Z = Yes   X = No', declined => {
		if (declined === 'x') return;
		bugContest.active = true; bugContest.caught = null; bugContest.date = today; saveBugContest();
		Bag.addItem('sportball', 20);
		sfx('ui_select');
		hud.textContent = 'The BUG-CATCHING CONTEST is ON! Hunt the park!';
	});
}
function endBugContest() {
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
		const where = addCaught(party, mon);
		saveParty(party);
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
function trickState() { return safeLoad(TH_KEY, { stage: 0, scroll: false }); }
// Puzzles 2 and 3 shipped with their switch-door METATILES baked shut and no
// switch machinery behind them — a BFS over the collision grid proved both
// rooms untraversable. The doors stand open instead: collision cleared, the
// art and elevation kept (setMetatile would drop the elevation bits).
const TRICK_OPEN_DOORS = {
	Route110_TrickHousePuzzle2: [642, 648],
	Route110_TrickHousePuzzle3: [550, 557, 576, 577],
};
function trickHouseOpenDoors(file) {
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
function trickWarp(w) {
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
function trickScrollFind() {
	const t = trickState();
	if (t.scroll) { dialog.open('Nothing else is hidden here.'); return; }
	t.scroll = true; safeSave(TH_KEY, t);
	sfx('item_get');
	dialog.open('Tucked behind the sign...\n\nYou found the TRICK HOUSE SCROLL!\nNow for the sealed door!');
}
function trickMasterTalk() {
	const t = trickState();
	if (t.stage >= 8) { dialog.open('TRICK MASTER: You have conquered all EIGHT of my\npuzzles... You are the true Trick Master now.\nTake a bow!'); return; }
	dialog.open(`TRICK MASTER: Welcome to my TRICK HOUSE!\n\nPuzzle ${t.stage + 1} of 8 waits beyond that door.\nFind my hidden SCROLL in the maze — it opens\nthe way through. Then come find ME!\n\n(...And never mind my trick doors. They've been\nstuck open for years. Very embarrassing.)`);
}
function trickEndTalk() {
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
const slideMenu = { open: false, board: null, species: null, mapId: null, moves: 0, done: false };
function openRuinsPuzzle() {
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
function slideKey(k) {
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
function drawSlide(W, H) {
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
const UNOWN_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '!', '?'];
const UNOWN_ID = { A: 'unown', '!': 'unown_exclaim', '?': 'unown_question' };
const unownIdFor = L => UNOWN_ID[L] || 'unown_' + L.toLowerCase();
const allRuinsSolved = () => { const s = safeLoad(RUINS_KEY, { solved: {} }).solved || {}; return ['kabuto', 'omanyte', 'aerodactyl', 'hooh'].every(k => s[k]); };
// the letters available in the wild right now: A..Z always, ! and ? once every
// chamber puzzle is solved
function rollUnownLetter() {
	const letters = UNOWN_ORDER.slice(0, allRuinsSolved() ? 28 : 26);
	return unownIdFor(letters[Math.floor(Math.random() * letters.length)]);
}
const unownDex = { open: false };
function openUnownDex() { unownDex.open = true; sfx('ui_open'); }
function unownDexKey(k) { if (['x', 'Escape', 'z', 'Enter'].includes(k)) unownDex.open = false; }
function drawUnownDex(W, H) {
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
const CONTEST_KEY = 'magepunk_contest_v1';
const contestMenu = { open: false, mode: 'category', idx: 0, category: null, rank: 0, st: null, entries: null, sprites: {}, flash: null, awarded: false, purse: 0 };
const blendMenu = { open: false, mode: 'pickmon', idx: 0, mon: null, flash: null };
function contestProgress() { return safeLoad(CONTEST_KEY, { ranks: { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0 } }); }
function contestSpriteFor(speciesId) {
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
	saveParty(party);
}
function contestKey(k) {
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
		if (k === 'ArrowUp') m.idx = (m.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') m.idx = (m.idx + 1) % party.length;
		if (k === 'x' || k === 'Escape') { m.mode = 'rank'; m.idx = 0; m.flash = null; return; }
		if ((k === 'z' || k === 'Enter') && party[m.idx]) {
			m.awarded = false; m.purse = 0;
			m.st = Contest.start({ category: m.category, rank: m.rank, mon: party[m.idx], battleTypes: id => battle.data.moves[id]?.type });
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
function blendBerries() {
	return Object.keys(Contest.data?.berries || {}).filter(id => Bag.ITEMS[id] && Bag.count(id) > 0).map(id => [id, Bag.count(id)]);
}
function blendKey(k) {
	const b = blendMenu;
	if (b.mode === 'pickmon') {
		if (k === 'ArrowUp') b.idx = (b.idx + party.length - 1) % party.length;
		if (k === 'ArrowDown') b.idx = (b.idx + 1) % party.length;
		if (k === 'x' || k === 'Escape') { b.open = false; return; }
		if ((k === 'z' || k === 'Enter') && party[b.idx]) { b.mon = party[b.idx]; b.mode = 'feed'; b.idx = 0; b.flash = null; }
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
	saveParty(party); // condition lives on the mon
	b.idx = Math.min(b.idx, blendBerries().length); // ate the last of a kind -> stay in range
}
function drawContest(W, H) {
	const u = H / 480;
	const m = contestMenu;
	if (m.mode === 'category') { optionList(W, H, u, 'CONTEST RECEPTION', 'Which Contest would you like to enter?', contestRows(), m.idx, 'ct:', m.flash); return; }
	if (m.mode === 'rank') { optionList(W, H, u, `${m.category.toUpperCase()} CONTEST`, 'Which rank?', contestRows(), m.idx, 'ctr:', m.flash); return; }
	if (m.mode === 'pickmon') {
		menuChrome(W, H, u, `${m.category.toUpperCase()} CONTEST — ${RANKS[m.rank]} RANK`, 'Which POKeMON will perform?');
		party.forEach((mo, i) => monRow('ctm:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, m.idx === i, u));
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
		menuUi.push(b);
		BUI.button(sctx, b, true, u);
		return;
	}
	const me = st.cs[0];
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(me.lockout ? `${me.name} is too spent to appeal — pass the turn.` : 'Choose a move to appeal with:', 28 * u, 268 * u);
	if (me.lockout) {
		const b = { id: 'ctmv:0', x: 24 * u, y: 280 * u, w: W - 48 * u, h: 46 * u, label: 'PASS', center: true };
		menuUi.push(b); BUI.button(sctx, b, true, u);
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
		menuUi.push(b);
		BUI.button(sctx, b, m.idx === i, u);
	});
}
function drawBlend(W, H) {
	const u = H / 480;
	const b = blendMenu;
	if (b.mode === 'pickmon') {
		menuChrome(W, H, u, 'BERRY BLENDER', 'Whose condition shall we raise?');
		party.forEach((mo, i) => monRow('bb:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, b.idx === i, u));
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
		menuUi.push(btn);
		BUI.button(sctx, btn, menuHover === bid || b.idx === idx, u);
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

// ---------- cutscenes ----------
// find an on-map NPC by its object_event local_id (for scripted movement)
function npcById(localId) {
	return npcs.list.find(n => n.ev && n.ev.local_id === localId) || null;
}
// the bridge a running cutscene uses to touch the game
function cutsceneCtx(talker, scriptLabel) {
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
		partyCount: () => (party || []).length,   // givemon reports party-vs-box into VAR_RESULT
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
			if (mon) { Dex.markCaught(species); dexMilestoneCheck(); addCaught(party, mon); saveParty(party); }
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
			if (mon) { Dex.markCaught(species); dexMilestoneCheck(); addCaught(party, mon); saveParty(party); }
		},
		healParty: () => healParty(party),
		warp: (mapId, warpId) => warpTo(mapId, warpId),
		setObjXy: (who, x, y) => { const n = npcById(who); if (n) { n.tx = x; n.ty = y; n.px = x * META; n.py = y * META; } },
		hideObj: who => { const n = npcById(who); if (n) n.hidden = true; },
		showObj: who => { const n = npcById(who); if (n) n.hidden = false; },
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
const gcMenu = { open: false, mode: 'hub', idx: 0, flash: null };
const vfMenu = { open: false, game: null, cur: 12, flash: null };
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
function gcKey(k) {
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
			const where = addCaught(party, mon);
			saveParty(party);
			gcMenu.flash = `${mon.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box!'}`;
		}
	}
}
function vfKey(k) {
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
function drawGcMenu(W, H) {
	const title = gcMenu.mode === 'coins' ? 'COIN COUNTER' : gcMenu.mode === 'prizes' ? 'PRIZE CORNER' : 'GAME CORNER';
	const sub = `Coins: ${Bag.getCoins().toLocaleString()}   Money: $${Bag.getMoney().toLocaleString()}`;
	optionList(W, H, H / 480, title, sub, gcRows(), gcMenu.idx, 'gc:', gcMenu.flash);
}
function drawVfMenu(W, H) {
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
		menuUi.push({ id: 'vf:' + i, x: cx, y: cy, w: cell, h: cell, label: '' });
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

function buildMonForGift(species, level) {
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
function inJohKanto() { return /^MAP_JOHKANTO_/.test(world.current?.map?.id || ''); }
function partyLead() { return Math.max(1, ...((party || []).filter(Boolean).map(m => m.level || 1)), 1); }
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
function routeTrainerLevel(level) {
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
function bossLevelFor(kind, isAce) {
	const [team, ace] = BOSS_OVER_LEAD[kind] || BOSS_OVER_LEAD.gym;
	return Math.min(Badges.MAX_LEVEL, partyLead() + (isAce ? ace : team));
}
// kept as the name the gym work used; a JohKanto gym is the `gym` row above
function gymLevelFor(isAce) { return bossLevelFor('gym', isAce); }
// Mt Silver is a JOHTO map, so inJohKanto() is false there — the league is
// recognised by its SCRIPT instead, which is also the only thing that can tell
// an elite from a champion.
function johkantoLeagueKind(script) {
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
function formsOf(speciesId) {
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
function cycleForm(mon) {
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
	if (!party || !leadMon(party) || battle.blocking) return 'skip';
	Dex.markSeen(species);
	battle.endSpec = { kind: 'wild' };   // the blocking script is gone after a reload; a plain wild ending is safe
	battle.start(party, species, level, result => {
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			lastBattleOutcome = B_OUTCOME_CAUGHT;
			Story.setVar('VAR_RESULT', B_OUTCOME_CAUGHT);
			cutscene.resume();
		} else if (result === 'victory') {
			lastBattleOutcome = B_OUTCOME_WON;
			Story.setVar('VAR_RESULT', B_OUTCOME_WON);
			evolution.check(party, battle.data);
			saveParty(party);
			cutscene.resume();
		} else if (result === 'defeat') {
			// blacked out: heal and abandon the rest of the script, as trainer
			// battles do. Note the static is GONE either way — the decomp scripts
			// set the object's hide flag before the battle, not after, so losing to
			// the Route 12 Snorlax costs you that Snorlax. That is what the original
			// does, and the second one on Route 16 is the game's own second chance.
			lastBattleOutcome = B_OUTCOME_LOST;
			Story.setVar('VAR_RESULT', B_OUTCOME_LOST);
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
			cutscene.stop();
		} else {
			// ran / it fled — the decomp scripts treat RAN the same as WON (the
			// encounter is over and the object goes away), so let the script run on
			lastBattleOutcome = B_OUTCOME_RAN;
			Story.setVar('VAR_RESULT', B_OUTCOME_RAN);
			saveParty(party);
			cutscene.resume();
		}
	});
	return 'wait';
}
function startCutscene(steps, onDone) {
	if (cutscene.blocking) return;
	cutscene.start(steps, cutsceneCtx(), onDone);
}

// ---------- ported map-script triggers ----------
// resolve a script label (an NPC's `script`, a coord_event, a map trigger) and
// run it through the interpreter with the current map's strings
function runScriptLabel(label, talker) {
	if (cutscene.blocking || !label) return false;
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
	if (!mapScripts[label]) {
		// Crystal factors its common NPCs through `jumpstd`, which the transpiler
		// drops — so 237 bookshelves, signs and trash cans have no label at all.
		// Run the shared body instead of falling through to silence.
		const std = Story.crystalStd(label);
		if (!std) return false;
		cutscene.run({ [label]: std }, label, cutsceneCtx(talker, label), () => { saveParty(party); });
		return true;
	}
	cutscene.run(mapScripts, label, cutsceneCtx(talker, label), () => { saveParty(party); });
	return true;
}

// a scripted trainerbattle: build the foe party (canonical roster keyed by the
// running script label, else a class-pool team at the map's level), run it, and
// resume the cutscene with the outcome in VAR_RESULT (1 = won). A loss stops the
// script (the player blacked out) after healing.
function startScriptedBattle(trainerId, scriptLabel, talker) {
	if (!party || !leadMon(party)) { Story.setVar('VAR_RESULT', 1); return 'skip'; }
	// canonical team by TRAINER_ id first (exact species/level/moves), then the
	// script-label roster, then a class-pool fallback at the map's level
	const tid = (trainerId || '').replace(/^TRAINER_/, '');
	const team = trainerTeams[tid];
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
	battle.startTrainer(party, foeParty, info, result => {
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			lastBattleOutcome = B_OUTCOME_WON;
			if (talker && trainers.list.includes(talker)) trainers.markDefeated(talker);
			saveParty(party);
			onTrainerDefeated(talker?.ev?.script, { silent: true }); // badge/crown; the script's own speech announces it
			cutscene.resume(); // continue the script (defeat text, post-battle)
		} else {
			// blacked out / fled: heal and abandon the rest of the script
			Story.setVar('VAR_RESULT', 0);
			lastBattleOutcome = B_OUTCOME_LOST;
			if (result === 'defeat') { healParty(party); hud.textContent = (world.current.map.name || '') + ' — party healed'; }
			cutscene.stop();
		}
	});
	return 'wait';
}
// ON_TRANSITION runs silently on map entry (sets story vars, positions NPCs).
// It is setup only, so run the instant ops and bail at any waiting op — it must
// never block the game or pop dialogue.
function runMapTransition() {
	// SilphCo floors' OnLoad only erects the Card-Key door barriers (via setMetatile);
	// that puzzle is broken/unfun in this port and would wall the Giovanni crawl, so
	// skip it — the floors stay freely walkable.
	if (/^SilphCo_\d/.test(world.current.name)) return;
	const meta = mapScripts.__map__;
	if (!meta || !meta.onTransition || !mapScripts[meta.onTransition]) return;
	if (cutscene.blocking) return;
	cutscene.run(mapScripts, meta.onTransition, cutsceneCtx(), () => {});
	if (cutscene.blocking) cutscene.stop(); // hit a wait — setup only, don't block
}
// ON_FRAME table: if a scene var matches, auto-run that cutscene. Value-0
// entries are the "scene not started" default and must not fire from a blank
// save (story vars default to 0) — they only trigger once a script has set the
// var, which we track via an explicit presence check.
function checkOnFrame() {
	const meta = mapScripts.__map__;
	if (!meta || !meta.onFrame || cutscene.blocking) return;
	for (const e of meta.onFrame) {
		if (e.value === 0 && !Story.hasVar(e.var)) continue;
		if (plotBlocked(e.label)) continue; // never runs here (see plotBlocked)
		if (Story.getVar(e.var) === e.value && mapScripts[e.label]) {
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
const PLOT_BLOCKED = new Set([
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
const plotBlocked = label => typeof label === 'string' && (PLOT_BLOCKED.has(label)
	|| label.startsWith('BattleFrontier_') || label.startsWith('TrainerHill_')
	|| /_BattleTent/.test(label));
const PLOT_ONESHOT = {
	MeetMomLeftScript: 'jo_mom', MeetMomRightScript: 'jo_mom',
	FirstStepIntoKantoLeftScene: 'jo_route27', FirstStepIntoKantoRightScene: 'jo_route27',
	ReleaseTheBeasts: 'jo_burnedtower',
	LanceHealsScript1: 'jo_lance_heal', LanceHealsScript2: 'jo_lance_heal',
	UndergroundRivalScene1: 'jo_goldenrod_rival', UndergroundRivalScene2: 'jo_goldenrod_rival',
	VictoryRoadRivalLeft: 'jo_victoryroad_rival', VictoryRoadRivalRight: 'jo_victoryroad_rival',
};
let firedPlot = null;
function loadFiredPlot() {
	if (!firedPlot) { const f = safeLoad('magepunk_plot_fired', []); firedPlot = new Set(Array.isArray(f) ? f : []); }
	return firedPlot;
}
function markPlotFired(key) { const s = loadFiredPlot(); if (!s.has(key)) { s.add(key); safeSave('magepunk_plot_fired', [...s]); } }

function checkCoordTrigger() {
	const evs = world.current.map.coord_events || [];
	for (const e of evs) {
		if (+e.x !== player.tx || +e.y !== player.ty) continue;
		if (e.var && e.var !== '0' && Story.getVar(e.var) !== parseInt(e.var_value, 10)) continue;
		if (e.script && mapScripts[e.script]) {
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
const STORY_SEED = {
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
function armStoryScenes(region) {
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
function syncStoryVars() {
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
	Story.setVar('VAR_PARTYCOUNT', (party || []).length);
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
function seedCrystalEvents() {
	if (Story.getFlag('crystal_events_seeded')) return;
	for (const e of INIT_EVENTS) Story.setFlag(e);
	Story.setFlag('crystal_events_seeded');
}

function seedStoryState(region) {
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
const B_OUTCOME_WON = 1, B_OUTCOME_LOST = 2, B_OUTCOME_RAN = 4, B_OUTCOME_CAUGHT = 7;
// What the last script-driven battle actually did. `GetBattleOutcome` used to
// answer WON unconditionally, on the assumption that scripted battles were
// skipped entirely; now that static wild battles really run, the scripts that
// branch on the outcome deserve the truth.
let lastBattleOutcome = B_OUTCOME_WON;
function runSpecial(name, store) {
	// query specials write their result to the given store var, or VAR_RESULT by
	// the decomp convention when a plain `special` (no store) is used
	const set = v => Story.setVar(store || 'VAR_RESULT', v | 0);
	const living = () => (party || []).filter(m => m.curHP > 0);
	switch (name) {
		// --- action specials ---
		case 'HealPlayerParty': healParty(party); return;
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
		case 'GetBattleOutcome': return set(lastBattleOutcome); // a real static battle records its own; otherwise WON
		case 'CalculatePlayerPartyCount': return set((party || []).length);
		case 'GetPlayerPartyCountForOverworld': return set((party || []).length);
		case 'IsNationalPokedexEnabled': return set(1);
		case 'GetPokedexCount': case 'GetHoennPokedexCount': case 'GetKantoPokedexCount':
			return set(Dex.counts().caught);
		case 'GetLeadMonFriendship': case 'GetLeadMonFriendshipScore':
			return set(living()[0] ? (living()[0].friend ?? 70) : 0);
		case 'GetFirstFreePartySlot': return set(Math.min((party || []).length, 6));
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
const NEW_GAME_INTRO = {
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
function beginNewGame(region) {
	party = null;
	seedStoryState(region);                       // full plot-suppression seed + HM kit (no starter yet)
	safeSaveStr('magepunk_region', region);
	const cfg = NEW_GAME_INTRO[region];
	if (!cfg) { openStarterPick(region); return; } // safety net: region without an authored intro
	if (!localStorage.getItem('magepunk_rival')) safeSaveStr('magepunk_rival', cfg.rival);
	const go = !urlPinnedMap && world.current.name !== cfg.home ? moveToMap(cfg.home) : Promise.resolve();
	go.then(() => startIntroNarration(region));
}

function startIntroNarration(region) {
	const cfg = NEW_GAME_INTRO[region];
	if (!cfg) return;
	startCutscene(cfg.intro.map(text => ({ op: 'say', text })).concat([{ op: 'setflag', flag: 'intro_started' }]));
}

// fired from refreshMapContent after every map load: a partyless player who has
// walked into the region's lab gets the professor greeting + the starter picker.
function checkIntroTrigger() {
	// a starter pick left open across a map change (anything that moves the
	// player while it's up) must not float over the town — close it; it will
	// reopen the moment they're back in the lab
	if (starterMenu.open && starterMenu.phase === 'pick') {
		const cfg0 = NEW_GAME_INTRO[playerRegion()];
		if (cfg0 && world.current.name !== cfg0.lab) starterMenu.open = false;
	}
	if (party || Story.getFlag('intro_done') || cutscene.blocking || dialog.blocking || starterMenu.open) return;
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
function checkVillainTrigger() {
	if (!party || !leadMon(party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	if (!Story.getFlag('intro_done')) return;
	const region = playerRegion();
	const beat = Quest.beatAt(region, world.current.name);
	if (!beat) return;
	startCutscene(beat.intro.map(text => ({ op: 'say', text })), () => startVillainBattle(region, beat));
}
function startVillainBattle(region, beat) {
	const foe = beat.team.map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
	if (!foe.length || !party || !leadMon(party)) { completeVillainBeat(region, beat); return; }
	for (const m of foe) Dex.markSeen(m.speciesId);
	const info = { displayName: beat.boss, defeatText: '', money: Math.max(...foe.map(m => m.level)) * 12, boss: true };
	battle.endSpec = { kind: 'villain', region };
	battle.startTrainer(party, foe, info, result => {
		if (result === 'victory') { completeVillainBeat(region, beat); }
		else { healParty(party); saveParty(party); hud.textContent = (world.current.map.name || '') + ' — party healed'; }
	});
}

// ---------- recurring cross-region rival ----------
// Your home-region rival is climbing all three regions too (rivals.js); they intercept you
// once per tier at that tier's gym town, in whichever region you reach first. On-arrive,
// one-shot per tier (flag set win or lose so it never walls you). Threads the region-hopping.
function checkRivalTrigger() {
	if (!party || !leadMon(party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	const tier = rivalDue(world.current.map.id);
	if (tier == null) return;
	startRivalEncounter(tier);
}
function startRivalEncounter(tier) {
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
		battle.startTrainer(party, foe, info, result => {
			Story.setFlag(rivalFlag(tier)); // one-shot per tier, win or lose
			saveParty(party);
			if (result === 'victory') startCutscene([{ op: 'say', text: `${name}: Tch — you got me. But I'll take the next region first. See you out there!` }]);
			else { healParty(party); startCutscene([{ op: 'say', text: `${name}: Ha! Told you I was ahead. Go train and catch up!` }]); }
		});
	});
}
function completeVillainBeat(region, beat) {
	Story.setFlag(beat.doneFlag);
	saveParty(party);
	refreshObjective();
	syncOverworldAchievements(); // a villain arc just closed — surface it on the profile
	// the beat is done -> isDungeonFloor now false -> despawn the grunts on this map
	trainers.loadForMap().then(() => { npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev)); }).catch(() => {});
	startCutscene(beat.outro.map(text => ({ op: 'say', text })));
}

// ---------- overworld achievements sync ----------
// The Profile achievements page derives its tiles from the account state (server), but
// overworld progress (badges / championships / Frontier symbols / caught legendaries /
// villain arcs / Pokedex) lives only in localStorage. This bridges the two: a compact
// summary is pushed to the account on boot (backfilling existing progress) and after
// each milestone, so those accomplishments unlock achievement tiles. localStorage stays
// the source of truth; the account copy is derived. No-op when logged out.
function overworldSummary() {
	const REGS = ['KANTO', 'JOHTO', 'HOENN'];
	const badges = { JOHKANTO: Badges.count('JOHKANTO') };
	const champ = {};
	for (const r of REGS) { badges[r] = Badges.count(r); champ[r] = Badges.isChampion(r); }
	// caught legendaries: species the Dex records as CAUGHT — not the legend_caught_*
	// flag, which is also set when a legendary is defeated (main.js: catch vs victory)
	const roster = new Set();
	for (const v of Object.values(LEGENDARY_ENCOUNTERS))
		for (const e of (Array.isArray(v) ? v : [v])) roster.add(e.species);
	const legends = [...roster].filter(s => Dex.isCaught(s));
	const villains = ['villain_kanto_hideout', 'villain_kanto_silph', 'villain_johto_slowpoke',
		'villain_johto_hq', 'villain_hoenn_hideout', 'villain_hoenn_climax'].filter(f => Story.getFlag(f));
	return {
		badges, champ,
		symbols: Frontier.getSymbols(),
		legends,
		villains,
		beatRed: !!Story.getFlag('beat_red'),
		awakening: awState() >= 6, // the Hoenn weather crisis was resolved (RAYQUAZA calmed the trio)
		grandChampion: !!Story.getFlag('grand_champion'), // Champion of all three shared regions
		dexCaught: Dex.counts().caught,
		bp: Frontier.getBP(),
		bestStreak: Frontier.bestStreak(),
	};
}
function syncOverworldAchievements() {
	if (!MP_ON) return;
	try { MP.call('overworld-sync', { ow: overworldSummary() }).catch(() => {}); } catch (e) {}
}
// ---------- server-authoritative overworld save (Phase 2) ----------
// The raw save strings persist to the server (D1, ow:<user>) so a logged-in player gets the same,
// current game everywhere. The server is authoritative on boot (hydrateOw overwrites the local
// cache); a deduped push keeps it current. This used to cover only nine keys (party/region/
// position/boxes/money...), which meant story flags, badges, the bag, and the dex silently did NOT
// follow you across devices — and the server's automatic daily backups could only protect a
// fraction of the game. Now the whole canonical inventory syncs, except the live mid-battle
// snapshot: it changes every battle action (churn), and a stale copy resuming on another device
// after the fight already ended locally would replay a finished battle.
const OW_KEYS = OW_RESET_KEYS.filter(k => k !== 'magepunk_battle_v1');
function owSnapshot() {
	const o = {}; for (const k of OW_KEYS) { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} } return o;
}
let _lastOwJson = '';
function pushOw() {
	if (!MP_ON) return;
	const ow = owSnapshot(); const json = JSON.stringify(ow);
	if (json === _lastOwJson || json === '{}') return; // unchanged / nothing to save
	_lastOwJson = json;
	try { MP.call('ow-save', { ow }).catch(() => {}); } catch (e) {}
}
// ---------- gifts ----------
// A gift is a server-side PROMISE of items — this is the client half that turns
// a claimed gift into real inventory. gift-claim marks it spent and returns the
// payload in one step, so a retry can never pay out twice; the bag write
// happens immediately after, with no await in between. (The bag itself now
// syncs via OW_KEYS, but the exactly-once claim is what stops double payouts.)
async function claimGifts() {
	if (!MP_ON) return;
	let gifts = [];
	try { gifts = (await MP.call('gift-list'))?.gifts || []; } catch (e) { return; }
	for (const g of gifts) {
		let payload = null;
		try { payload = (await MP.call('gift-claim', { id: g.id }))?.gift; } catch (e) { continue; }
		if (!payload) continue;
		const got = [];
		for (const [id, n] of Object.entries(payload.items || {})) {
			if (!Bag.ITEMS[id] && !/^(tm|hm)/.test(id)) continue; // an id this build doesn't know
			Bag.addItem(id, n);
			got.push(`${Bag.nameOf(id)} x${n}`);
		}
		const lines = [payload.title, payload.body, got.length ? '\nYou received:\n' + got.join('\n') : '']
			.filter(Boolean).join('\n');
		dialog.open(lines);
		hud.textContent = payload.title;
	}
}

async function hydrateOw() {
	if (!MP_ON) return;
	try {
		const r = await MP.call('ow-load');
		const ow = r && r.ow && r.ow.ow; // ow-load returns { ow: { ow:<snapshot>, updated_at } }
		if (ow && typeof ow === 'object') {
			let changed = false;
			for (const k of OW_KEYS) {
				try {
					if (ow[k] != null && localStorage.getItem(k) !== ow[k]) { localStorage.setItem(k, ow[k]); changed = true; }
				} catch (e) {}
			}
			_lastOwJson = JSON.stringify(owSnapshot()); // don't immediately re-push what we just pulled
			// Story/Bag/Badges/Dex read their strings at IMPORT time, so a hydration
			// that actually changed something must reload once — otherwise a stale
			// in-memory module would quietly save itself back over the fresh data.
			// The sessionStorage latch stops a reload loop when a write can't stick.
			if (changed && !sessionStorage.getItem('mp_ow_hydrated')) {
				sessionStorage.setItem('mp_ow_hydrated', '1');
				location.reload();
				return;
			}
			if (!changed) { try { sessionStorage.removeItem('mp_ow_hydrated'); } catch (e) {} }
		}
	} catch (e) { /* offline / logged out -> keep the localStorage cache */ }
}

// ---------- save data actions (OPTIONS menu) ----------
// Export/import move the whole game as a file; SERVER BACKUPS restores one of
// the automatic daily snapshots D1 keeps. An import or restore must update the
// server copy BEFORE reloading — hydrateOw is authoritative on boot, so a stale
// server blob would quietly re-impose the game that was just replaced.
function runSaveAction(id) {
	const om = optionsMenu;
	if (om.busy) return;
	if (id === 'export') {
		try {
			const n = Savefile.exportSave();
			om.flash = `Saved ${n} items to a file. Keep it somewhere safe!`;
		} catch (e) { om.flash = 'Export failed: ' + (e?.message || e); }
		return;
	}
	if (id === 'import') { doImportSave(); return; }
	if (id === 'backups') {
		om.mode = 'backups'; om.idx = 0; om.list = null; om.flash = null;
		loadBackups();
		return;
	}
	if (id === 'controls') { om.mode = 'controls'; om.idx = 0; om.capture = null; om.flash = null; return; }
}
async function doImportSave() {
	const om = optionsMenu;
	const picked = await Savefile.pickSaveFile();
	if (!picked) return;
	let parsed;
	try { parsed = Savefile.parseSave(picked.text); } catch (e) { om.flash = e?.message || String(e); return; }
	const when = parsed.exported_at ? parsed.exported_at.slice(0, 10) : 'an unknown date';
	if (!confirm(`Replace your CURRENT game with the save from ${when}?\n(${picked.name})\n\nEverything you have now will be overwritten.`)) return;
	om.busy = true;
	Savefile.applySave(parsed.keys);
	if (MP_ON) {
		try { await MP.call('ow-save', { ow: owSnapshot() }); }
		catch (e) { alert('The save was restored locally, but the SERVER copy could not be updated.\nIf you are online next load, the old game may come back — try importing again then.'); }
	}
	location.reload();
}
async function loadBackups() {
	const om = optionsMenu;
	if (!MP_ON) { om.list = []; om.flash = 'Backups need a logged-in account.'; return; }
	try { om.list = ((await MP.call('ow-history'))?.backups) || []; }
	catch (e) { om.list = []; om.flash = 'Could not reach the server.'; }
	if (om.list.length === 0 && !om.flash) om.flash = 'No backups yet — they appear after a day of play.';
}
async function restoreBackup(b) {
	const om = optionsMenu;
	if (!b || om.busy) return;
	const label = b.slot === 'undo' ? 'the UNDO slot (your game before the last restore)' : `the automatic backup from ${b.slot}`;
	if (!confirm(`Restore ${label}?\n\nYour current game is stashed in the UNDO slot first, so this can be reversed.`)) return;
	om.busy = true;
	let r = null;
	try { r = await MP.call('ow-restore', { slot: b.slot }); } catch (e) {}
	if (!r || !r.ow) { om.busy = false; om.flash = 'Restore failed — the backup may be gone.'; loadBackups(); return; }
	// same discipline as a file import: clear, then lay the snapshot down
	for (const k of OW_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
	for (const [k, v] of Object.entries(r.ow)) { try { if (typeof v === 'string') localStorage.setItem(k, v); } catch (e) {} }
	location.reload();
}

// open the on-screen starter picker locked to one region's trio
function openStarterPick(region) {
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
function finishStarterPick(region, col) {
	const idx = Math.max(0, STARTERS.findIndex(r => r.region === region));
	const id = STARTERS[idx].ids[col];
	safeSaveStr('magepunk_starter', id); // Kanto's champion roster is chosen by it
	party = createStarter(id, battle.data);
	Journal.add(`Began the adventure in ${region} with ${(party[0]?.name || id).toUpperCase()}`);
	Dex.markCaught(id);
	Dex.seedFrom(party);
	refreshFollower();
	const cfg = NEW_GAME_INTRO[region];
	const name = (party[0].nickname || party[0].name || id).toUpperCase();
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
	if (!foe.length || !party || !leadMon(party)) { afterRival(region); return; }
	Dex.markSeen(rivalId);
	const info = { displayName: `RIVAL ${rivalName}`, defeatText: '', money: 40, boss: true };
	battle.endSpec = { kind: 'rivalintro', region };
	battle.startTrainer(party, foe, info, result => {
		if (result !== 'victory') healParty(party);   // the plot continues win or lose
		saveParty(party);
		afterRival(region);
	});
}

function afterRival(region) {
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
function maybeIntroCutscene() {
	if (Story.getFlag('intro_done') || party) return;
	startIntroNarration(playerRegion());
}

// ---------- map-editor view ----------
// ?mapedit=1 turns the game into a plain map viewer: the camera stops following
// the player, the player and the follower stop drawing, and movement input is
// frozen so nothing warps or trips an encounter under the editor. Entities stay
// drawable behind a toggle — they're map data you often want to see while
// editing. Inert unless the (owner-gated) editor mounts and sets it.
const editView = { on: false, cam: null, entities: true };

// ---------- camera ----------
function cameraPos() {
	// the editor pans its own camera; the map is the subject, not the player
	if (editView.on && editView.cam) return [Math.round(editView.cam[0]), Math.round(editView.cam[1])];
	// center on player sprite (feet tile center), GBA-style; no bounds clamp
	const cx = Math.round(player.px + META / 2 - VIEW_W / 2);
	const cy = Math.round(player.py + META / 2 - VIEW_H / 2 - 8);
	return [cx, cy];
}

// day/night colour wash over the world (not menus/HUD). Keyed to the in-game
// hour with smooth dawn/dusk ramps; indoor maps stay untinted.
// ---------- unlit caves ----------
// FLASH had nothing to do. `HM_FIELD.flash` checked `map.requires_flash`, set a
// `flash_<map>` story flag — and NOTHING ANYWHERE read that flag, so even on the
// two Kanto maps that carried the field the cave was never dark. Crystal's
// thirteen PALETTE_DARK maps (Rock Tunnel among them, which is why Gen-2 Kanto
// hands you the HM at all) had no field at all.
//
// A dark map draws black except a small window around the player, until FLASH is
// used there. Generous enough to walk by, tight enough that you want the HM.
const DARK_RADIUS = 44, DARK_FADE = 26;
function mapIsUnlit() {
	const m = world.current?.map;
	return !!(m?.requires_flash && !Story.getFlag('flash_' + m.id));
}
function drawCaveDark(ctx, camX, camY) {
	if (editView.on || !mapIsUnlit()) return;
	const cx = Math.round(player.px + META / 2 - camX);
	const cy = Math.round(player.py + META / 2 - camY);
	ctx.save();
	// everything outside the sight radius is solid dark...
	ctx.fillStyle = 'rgba(0,0,0,0.94)';
	ctx.beginPath();
	ctx.rect(0, 0, VIEW_W, VIEW_H);
	ctx.arc(cx, cy, DARK_RADIUS, 0, Math.PI * 2);
	ctx.fill('evenodd');
	// ...and the rim fades in, so the edge of sight is soft rather than a cut circle
	const g = ctx.createRadialGradient(cx, cy, Math.max(0, DARK_RADIUS - DARK_FADE), cx, cy, DARK_RADIUS);
	g.addColorStop(0, 'rgba(0,0,0,0)');
	g.addColorStop(1, 'rgba(0,0,0,0.94)');
	ctx.fillStyle = g;
	ctx.beginPath();
	ctx.arc(cx, cy, DARK_RADIUS, 0, Math.PI * 2);
	ctx.fill();
	ctx.restore();
}

function drawDayNightTint(context) {
	if (!Settings.get('dayNight')) return;
	if (world.current?.map?.map_type === 'MAP_TYPE_INDOOR' || world.current?.map?.indoor) return;
	const h = Clock.frac() * 24;
	// piecewise [color, alpha] control points across the day, lerped between
	const pts = [
		[0, [12, 18, 54], 0.42],   // deep night
		[5, [12, 18, 54], 0.42],   // pre-dawn
		[7, [80, 60, 70], 0.20],   // dawn (warm)
		[9, [255, 255, 255], 0.0], // full morning
		[17, [255, 255, 255], 0.0],// day
		[19, [90, 55, 60], 0.22],  // dusk (warm)
		[21, [12, 18, 54], 0.42],  // night falls
		[24, [12, 18, 54], 0.42],
	];
	let a = pts[0], b = pts[pts.length - 1];
	for (let i = 0; i < pts.length - 1; i++) {
		if (h >= pts[i][0] && h <= pts[i + 1][0]) { a = pts[i]; b = pts[i + 1]; break; }
	}
	const t = b[0] === a[0] ? 0 : (h - a[0]) / (b[0] - a[0]);
	const lerp = (x, y) => x + (y - x) * t;
	const col = [Math.round(lerp(a[1][0], b[1][0])), Math.round(lerp(a[1][1], b[1][1])), Math.round(lerp(a[1][2], b[1][2]))];
	const alpha = lerp(a[2], b[2]);
	if (alpha <= 0.01) return;
	context.save();
	context.globalCompositeOperation = 'multiply';
	context.globalAlpha = alpha;
	context.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
	context.fillRect(0, 0, VIEW_W, VIEW_H);
	context.restore();
}

// ---------- step ambience: grass rustle + sand/ash footprints ----------
// Static grass was the giveaway that this is a port. onArrive spawns a one-shot
// rustle when you step into tall/long grass, and a fading footprint pair when
// you step in deep sand / ashy grass. Purely cosmetic, screen-decay by real
// time, camera-relative, capped, REDUCED_MOTION-silent.
const stepFx = []; // { kind:'rustle'|'print', tx, ty, born, facing }
const MB_DEEP_SAND = 0x0c, MB_ASHGRASS = 0x24; // desert floor (Route 111) + ashy grass (Route 113)
function spawnStepFx() {
	if (REDUCED_MOTION_OW || !world.current) return;
	const b = world.behaviorAt(player.tx, player.ty);
	const now = performance.now();
	if (world.isTallGrass(player.tx, player.ty)) stepFx.push({ kind: 'rustle', tx: player.tx, ty: player.ty, born: now });
	else if (b === MB_DEEP_SAND || b === MB_ASHGRASS) stepFx.push({ kind: 'print', tx: player.tx, ty: player.ty, born: now, facing: player.facing });
	if (stepFx.length > 40) stepFx.splice(0, stepFx.length - 40);
}
// footprints go down with the ground (under sprites); rustle goes over feet.
function drawStepFx(ctx, camX, camY, kind) {
	const now = performance.now();
	for (let i = stepFx.length - 1; i >= 0; i--) {
		const f = stepFx[i];
		const life = f.kind === 'print' ? 4500 : 260;
		const t = (now - f.born) / life;
		if (t >= 1) { if (kind === 'rustle') stepFx.splice(i, 1); continue; } // one pass owns removal
		if (f.kind !== kind) continue;
		const bx = f.tx * META - camX, by = f.ty * META - camY, cx = bx + META / 2, cy = by + META / 2;
		if (f.kind === 'print') {
			ctx.save();
			ctx.globalAlpha = 0.4 * (1 - t);
			ctx.fillStyle = '#5a4a34';
			const off = { down: [-3, 2], up: [3, -2], left: [2, 3], right: [-2, 3] }[f.facing] || [0, 3];
			ctx.fillRect(Math.round(cx - 3 + off[0]), Math.round(cy + off[1]), 2, 3);
			ctx.fillRect(Math.round(cx + 1 + off[0]), Math.round(cy + off[1]), 2, 3);
			ctx.restore();
		} else { // rustle: a quick low puff of pale-green flecks
			const k = Math.sin(Math.min(1, t) * Math.PI); // 0→1→0
			ctx.save();
			ctx.globalAlpha = 0.8 * k;
			ctx.fillStyle = '#e6ffcf';
			const spread = 3 + k * 5;
			for (const dx of [-spread, -1, spread]) ctx.fillRect(Math.round(cx + dx), Math.round(cy + 6 - k * 3), 2, 2);
			ctx.strokeStyle = `rgba(120,180,90,${0.7 * k})`;
			ctx.lineWidth = 1;
			ctx.beginPath(); ctx.moveTo(cx - spread, cy + 7); ctx.lineTo(cx, cy + 7 - k * 4); ctx.lineTo(cx + spread, cy + 7); ctx.stroke();
			ctx.restore();
		}
	}
}

// ---------- overworld weather ----------
// MAP_WEATHER only ever fed BATTLE weather; the route itself showed clear sky.
// A full-screen particle layer (rain/sandstorm/hail/ash) drawn on the GBA frame
// keyed off mapWeatherNow() gives the weather routes their sky. Particles live
// in screen space (they blanket the viewport, not the world), so no camera math.
// REDUCED_MOTION draws the colour wash only, no motion.
const weatherFx = { type: null, parts: [], last: 0 };
const WEATHER_SPEC = {
	// n: particle count · tint [r,g,b,a] multiply wash · per-particle draw+move
	rain: { n: 90, tint: [70, 90, 130, 0.16], vx: -60, vy: 620, len: 9, draw(ctx, p) { ctx.strokeStyle = 'rgba(170,200,255,0.55)'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 1.4, p.y - p.spec.len); ctx.stroke(); } },
	sandstorm: { n: 130, tint: [150, 120, 70, 0.30], vx: 340, vy: 40, len: 7, draw(ctx, p) { ctx.strokeStyle = `rgba(214,188,130,${p.a})`; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.spec.len, p.y - 1); ctx.stroke(); } },
	hail: { n: 70, tint: [150, 170, 200, 0.16], vx: -20, vy: 200, len: 0, draw(ctx, p) { ctx.fillStyle = 'rgba(230,240,255,0.85)'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); } },
	ash: { n: 60, tint: [90, 80, 78, 0.20], vx: 12, vy: 55, len: 0, draw(ctx, p) { ctx.fillStyle = `rgba(120,110,108,${p.a})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); } },
};
function spawnWeatherPart(spec, anywhere) {
	return {
		x: Math.random() * (VIEW_W + 40) - 20,
		y: anywhere ? Math.random() * VIEW_H : -Math.random() * 20,
		a: 0.35 + Math.random() * 0.5,
		vj: 0.6 + Math.random() * 0.8, // per-particle speed jitter
		spec,
	};
}
function drawWeather(ctx) {
	const type = (Settings.get('weather') && !world.current?.map?.indoor
		&& world.current?.map?.map_type !== 'MAP_TYPE_INDOOR') ? mapWeatherNow() : null;
	if (!type || !WEATHER_SPEC[type]) { weatherFx.type = null; weatherFx.parts.length = 0; return; }
	const spec = WEATHER_SPEC[type];
	if (weatherFx.type !== type) {
		weatherFx.type = type;
		weatherFx.parts = Array.from({ length: spec.n }, () => spawnWeatherPart(spec, true));
	}
	// colour wash (multiply) — the sky's mood, drawn even under REDUCED_MOTION
	ctx.save();
	ctx.globalCompositeOperation = 'multiply';
	ctx.globalAlpha = spec.tint[3];
	ctx.fillStyle = `rgb(${spec.tint[0]},${spec.tint[1]},${spec.tint[2]})`;
	ctx.fillRect(0, 0, VIEW_W, VIEW_H);
	ctx.restore();
	if (REDUCED_MOTION_OW) return;
	const now = performance.now();
	const dt = Math.min((now - weatherFx.last) / 1000, 0.05);
	weatherFx.last = now;
	ctx.save();
	ctx.lineWidth = 1;
	for (const p of weatherFx.parts) {
		p.x += spec.vx * p.vj * dt;
		p.y += spec.vy * p.vj * dt;
		if (p.y > VIEW_H + 12 || p.x < -24 || p.x > VIEW_W + 24) Object.assign(p, spawnWeatherPart(spec, false));
		spec.draw(ctx, p);
	}
	ctx.restore();
}

// ---------- loop ----------
let last = performance.now();
let playAccum = 0;
function tick(now) {
	requestAnimationFrame(tick);
	const dt = Math.min((now - last) / 1000, 0.05);
	last = now;
	// advance the warp fade before any `loading` bail so it keeps animating in the
	// loading=false windows on either side of a map swap (it sits at full black
	// during the load itself, when the loop bails and the screen is frozen anyway)
	if (fade.alpha !== fade.target) {
		const d = FADE_SPEED * dt;
		fade.alpha = fade.alpha < fade.target ? Math.min(fade.target, fade.alpha + d) : Math.max(fade.target, fade.alpha - d);
	}
	// battle/pvp on a portrait screen OR any touch screen: swap the canvas
	// between the GBA frame and full-screen (see fitCanvas); the touch d-pad
	// hides too — battles are entirely tap-driven. Landscape phones get the
	// full-width canvas + the scaled bar from battleui.layout (aspect > 1.7).
	const tallNow = (battle.blocking || pvp.blocking)
		&& (innerHeight > innerWidth || document.body.classList.contains('touch'));
	if (tallNow !== sceneTall) {
		sceneTall = tallNow;
		document.body.classList.toggle('scene-tall', sceneTall);
		fitCanvas();
	}
	// WATCHDOG 1 — a stuck load freezes everything (the loop bails on `loading`).
	// If a map load hangs (never resolves) or a handler after it wedged, recover.
	if (loading) {
		if (loadWatchStart == null) loadWatchStart = now;
		else if (now - loadWatchStart > 12000) { loadWatchStart = null; loading = false; if (cutscene.blocking) cutscene.stop(); hud.textContent = 'Recovered from a stuck load.'; }
	} else loadWatchStart = null;
	if (loading || !world.current) return;
	// WATCHDOG 2 — a plot cutscene that blocks with NO player-facing UI (no dialog,
	// battle, evolution, or menu) for a long stretch is genuinely wedged, not just
	// waiting on the player — force-stop it rather than freeze the map.
	if (cutscene.blocking && !dialog.blocking && !battle.blocking && !pvp.blocking && !evolution.blocking && !starterMenu.open) {
		if (cutsceneWatchStart == null) cutsceneWatchStart = now;
		else if (now - cutsceneWatchStart > 30000) { cutsceneWatchStart = null; cutscene.stop(); hud.textContent = 'A scene timed out.'; }
	} else cutsceneWatchStart = null;

	// accumulate playtime (whole seconds, throttled writes) for the Trainer Card
	playAccum += dt;
	if (playAccum >= 5) {
		const s = (parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0) + Math.floor(playAccum);
		safeSaveStr('magepunk_playtime', s);
		playAccum -= Math.floor(playAccum);
	}

	battle.update(dt);
	bgmTick();
	persistBattle();
	pvp.update(dt);
	factorySpec.update(dt);
	evolution.update(dt);
	dialog.update(dt);
	cutscene.update(dt);
	// the moment combat ends, drop any key still held from before it — otherwise
	// the player takes one stray step straight out of the battle
	const inBattleNow = battle.blocking || pvp.blocking;
	if (wasInBattle && !inBattleNow) heldKeys.length = 0;
	wasInBattle = inBattleNow;
	if (!battle.blocking && !pvp.blocking && !factorySpec.blocking && !dialog.blocking && !evolution.blocking && !starterMenu.open && !cutscene.blocking) {
		// The starter hand-over is the one trigger that MUST NOT be missed — without
		// it you have no POKeMON and no way to get one. Every other trigger fires on
		// map entry only, which is fine for them, but it means walking into the lab
		// while ANY cutscene is still playing skipped this one for good: the guard
		// returned early and nothing ever re-asked. Retry it here instead. It is
		// four boolean checks and becomes a permanent no-op the moment you have a
		// party, so it costs nothing for the rest of the game.
		if (!party) { try { checkIntroTrigger(); } catch (e) { console.warn('[intro] retry failed', e); } }
		trainers.update(dt);
		player.run = runHeld || Settings.get('autoRun');
		// any open menu freezes the player even if a key was held as it opened
		const moveDir = (menuBlocking() || editView.on) ? null : (heldKeys[0] || null);
		if (!trainers.engaging) player.update(dt, moveDir);
		npcs.update(dt);
		updateFollower(dt);
	}

	// battle/pvp/factory screens repaint every pixel of the canvas themselves —
	// rendering the whole overworld underneath them was pure discarded work
	// (two map blits + every NPC/item/portal + a full-canvas upscale, per frame)
	const overlayOwnsFrame = battle.blocking || pvp.blocking || factorySpec.blocking;
	if (!overlayOwnsFrame) {
		const [camX, camY] = cameraPos();
		ctx.clearRect(0, 0, VIEW_W, VIEW_H);
		world.drawLayer(ctx, 'bottom', camX, camY);
		if (!editView.on) drawWaterAnim(ctx, camX, camY); // the sea moves (editor stays exact)
		if (!editView.on) drawStepFx(ctx, camX, camY, 'print'); // footprints lie on the ground
		services.draw(ctx, camX, camY);
		arcade.draw(ctx, camX, camY);
		items.draw(ctx, camX, camY);
		drawBaseDeco(ctx, camX, camY);
		drawMuseum(ctx, camX, camY);
		drawFossilSpots(ctx, camX, camY);
		drawLegendary(ctx, camX, camY);
		drawAwakening(ctx, camX, camY);
		portals.draw(ctx, camX, camY); // ground pads render under blockers/entities
		blockers.draw(ctx, camX, camY);
		// sprites in y order so overlaps stack correctly. In the editor the player
		// and follower are never drawn — you're looking at the map itself.
		const sprites = editView.on
			? (editView.entities ? [...npcs.list, ...trainers.list] : [])
			: [...npcs.list, ...trainers.list, player];
		if (!editView.on && follower && !player.surfing) sprites.push({ py: follower.py, draw: drawFollower });
		sprites.sort((a, b) => a.py - b.py);
		for (const s of sprites) s.draw(ctx, camX, camY);
		if (!editView.on) drawStepFx(ctx, camX, camY, 'rustle'); // grass springs up around the feet (owns fx cleanup)
		if (!editView.on) drawFriendGhosts(ctx, camX, camY);
		world.drawLayer(ctx, 'top', camX, camY);
		drawCaveDark(ctx, camX, camY);
		drawDayNightTint(ctx);
		drawWeather(ctx); // rain/sand/hail/ash over the world, under the day-night mood
		evolution.draw(ctx);

		sctx.drawImage(frame, 0, 0, VIEW_W * SCALE, VIEW_H * SCALE);
	}
	// battle, menus, and dialogs all render at full canvas resolution
	const SW = screen.width, SH = screen.height;
	// The full-res menus lay themselves out for the 3:2 frame (unit = H/480
	// with columns spanning ~720 units). On the tall portrait canvas that unit
	// would blow past the right edge, so menus get a 3:2 band across the top of
	// the canvas instead — identical geometry to the pre-tall portrait canvas;
	// the live world stays visible beneath. Dialogs keep the full height (they
	// bottom-anchor near the thumbs and are width-capped — dialog.drawHi).
	const MH = Math.min(SH, Math.round(SW / 1.5));
	if (battle.blocking) {
		battle.draw(sctx, SW, SH);
	} else if (pvp.blocking) {
		pvp.draw(sctx, SW, SH);
	} else if (factorySpec.blocking) {
		factorySpec.draw(sctx, SW, SH);
	} else {
		// extend the menus' dim backdrop over the world below the band, and hide
		// the side MENU/PARTY/BAG buttons that would overlap the band's corner
		document.body.classList.toggle('ow-menu', canvasMenuOpen());
		if (canvasMenuOpen() && SH > MH) {
			sctx.fillStyle = 'rgba(10,8,18,0.82)';
			sctx.fillRect(0, MH, SW, SH - MH);
		}
		if (partyMenu.open) drawPartyMenu(SW, MH);
		else if (shopMenu.open) drawShopMenu(SW, MH);
		else if (bagMenu.open) drawBagMenu(SW, MH);
		else if (pcMenu.open) drawPcMenu(SW, MH);
		else if (vfMenu.open) drawVfMenu(SW, MH);
		else if (gcMenu.open) drawGcMenu(SW, MH);
		else if (contestMenu.open) drawContest(SW, MH);
		else if (blendMenu.open) drawBlend(SW, MH);
		else if (slideMenu.open) drawSlide(SW, MH);
		else if (decoMenu.open) drawDecoMenu(SW, MH);
		else if (socialMenu.open) drawSocial(SW, MH);
		else if (slotsMenu.open) drawSlots(SW, MH);
		else if (dexMenu.open) drawDexMenu(SW, MH);
		else if (townMap.open) drawTownMap(SW, MH);
		else if (tradeMenu.open) drawNpcTrade(SW, MH);
		else if (daycareMenu.open) drawDaycare(SW, MH);
		else if (nameRater.open) drawNameRater(SW, MH);
		else if (moveShop.open) drawMoveShop(SW, MH);
		else if (optionsMenu.open) drawOptions(SW, MH);
		else if (questMenu.open) drawQuest(SW, MH);
		else if (trainerCard.open) drawTrainerCard(SW, MH);
		else if (starterMenu.open) drawStarterMenu(SW, MH);
		else if (ferryMenu.open) drawFerryMenu(SW, MH);
		else if (portalMenu.open) drawPortalMenu(SW, MH);
		else if (bpShopMenu.open) drawBpShopMenu(SW, MH);
		else if (trade.open) drawTrade(SW, MH);
		else if (playerMenu.open) drawPlayerMenu(SW, MH);
		else if (deckSelect.open) drawDeckSelect(SW, MH);
		else if (radioMenu.open) drawRadio(SW, MH);
		else if (unownDex.open) drawUnownDex(SW, MH);
		else if (startMenu.open) drawStartMenu(SW, MH);
		else if (cardsMenu.open) drawCardsMenu(SW, MH);
		else if (runMenu.open) drawRunMenu(SW, MH);
		else if (friendsMenu.open) drawFriendsMenu(SW, MH);
		else if (mailMenu.open) drawMailMenu(SW, MH);
		if (!evolution.blocking) dialog.drawHi(sctx, SW, SH);
	}
	// while your run is being spectated, show a live "N watching" badge on top
	if (frontier.active && frontierWatchers > 0) drawWatchingBadge(SW, SH);
	drawTouchHud(SW, SH);
	// warp fade sits ON TOP of everything (world, menus, HUD) so the whole screen
	// dips to black between maps
	if (fade.alpha > 0.001) {
		sctx.save();
		sctx.globalAlpha = Math.min(1, fade.alpha);
		sctx.fillStyle = '#000';
		sctx.fillRect(0, 0, SW, SH);
		sctx.restore();
	}
}

// ---------- the touch HUD ----------
// `body.touch #bar { display: none }` hides #hud AND #objective, and EVERY thing
// the overworld tells a roaming player goes through hud.textContent: the map name
// on arrival, "party healed", "X was sent to the BOX", the egg-ready notice, the
// rift warning, stuck-load recovery. On a phone all of it was invisible — a
// caught POKeMON silently vanished into storage. The quest objective was hidden
// too, so the "where do I go next" system existed and could not be read.
//
// Rather than touch the ~15 call sites, a MutationObserver mirrors those two DOM
// nodes onto the canvas. Anything that writes the bar keeps working unchanged.
const touchHud = { msg: '', until: 0, objective: '' };
if (document.body.classList.contains('touch')) {
	const hudEl = document.getElementById('hud'), objEl = document.getElementById('objective');
	const obs = new MutationObserver(() => {
		const t = (hudEl.textContent || '').trim();
		if (t && t !== touchHud.msg) { touchHud.msg = t; touchHud.until = performance.now() + 4200; }
		touchHud.objective = (objEl.textContent || '').trim();
	});
	for (const el of [hudEl, objEl]) obs.observe(el, { childList: true, characterData: true, subtree: true });
	touchHud.objective = (objEl.textContent || '').trim();
}
function drawTouchHud(SW, SH) {
	if (!document.body.classList.contains('touch')) return;
	if (menuBlocking()) return;                       // never over a menu or a battle
	const now = performance.now();
	const rows = [];
	if (touchHud.objective) rows.push(['#9d8fd4', touchHud.objective]);
	if (touchHud.msg && now < touchHud.until) rows.push(['#ffffff', touchHud.msg]);
	if (!rows.length) return;
	const pad = Math.round(SW * 0.02), fs = Math.max(11, Math.round(SW / 34));
	sctx.save();
	sctx.font = `${fs}px system-ui, sans-serif`;
	sctx.textBaseline = 'top';
	const w = Math.min(SW - pad * 2, Math.max(...rows.map(r => sctx.measureText(r[1]).width)) + pad * 2);
	const h = rows.length * (fs + 4) + pad;
	// Sit UNDER the world frame when the canvas is taller than it (landscape
	// tablets), where the desktop bar would be. On a portrait phone the frame
	// fills the canvas, so it overlays the top-left instead — left-anchored and
	// width-capped so it never reaches the MENU/PARTY/BAG buttons on the right.
	const below = VIEW_H * SCALE + pad;
	const y = (below + h + pad <= SH) ? below : pad;
	sctx.fillStyle = 'rgba(10,8,18,0.78)';
	sctx.fillRect(pad, y, w, h);
	sctx.strokeStyle = 'rgba(157,143,212,0.5)';
	sctx.strokeRect(pad + 0.5, y + 0.5, w, h);
	rows.forEach((r, i) => {
		sctx.fillStyle = r[0];
		sctx.fillText(r[1], pad * 2, y + i * (fs + 4) + 4, w - pad * 2);
	});
	sctx.restore();
}

// ---------- full-resolution menus (battleui components + pixel font) ----------
let menuUi = [];   // tappable rects rebuilt each draw: {id, x, y, w, h}
let menuHover = null;
const iconCache = new Map();
function iconOf(mon) {
	if (!mon.sprite) return null;
	if (!iconCache.has(mon.sprite)) {
		iconCache.set(mon.sprite, null);
		getImage(`data/pokemon/${mon.sprite}`).then(img => iconCache.set(mon.sprite, img)).catch(() => {});
	}
	return iconCache.get(mon.sprite);
}

// lazily-loaded town-map region art (keyed by file path)
const townImgCache = new Map();
function townImg(file) {
	if (!file) return null;
	if (!townImgCache.has(file)) {
		townImgCache.set(file, null);
		getImage(`data/${file}`).then(img => townImgCache.set(file, img)).catch(() => {});
	}
	return townImgCache.get(file);
}

function menuChrome(W, H, u, title, sub, closable = true) {
	menuUi = [];
	sctx.fillStyle = 'rgba(10,8,18,0.82)';
	sctx.fillRect(0, 0, W, H);
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(24 * u)}px m6x11plus, monospace`;
	sctx.fillText(title, 24 * u, 40 * u);
	if (sub) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(sub, 24 * u, 60 * u);
	}
	if (!closable) return;
	const close = { id: 'close', x: W - 106 * u, y: 16 * u, w: 90 * u, h: 36 * u, label: 'CLOSE', center: true };
	menuUi.push(close);
	BUI.button(sctx, close, menuHover === 'close', u);
}

// a tappable mon row: sprite icon, name, level, status, HP bar + numbers
function monRow(id, x, y, w, h, mon, selected, u, note) {
	const b = { id, x, y, w, h };
	menuUi.push(b);
	sctx.fillStyle = selected || menuHover === id ? BUI.C.btnHover : BUI.C.btn;
	BUI.rr(sctx, x, y, w, h, 8 * u); sctx.fill();
	sctx.strokeStyle = selected ? BUI.C.accent : BUI.C.panelBorder;
	sctx.lineWidth = selected ? 3 : 2;
	BUI.rr(sctx, x + 1, y + 1, w - 2, h - 2, 8 * u); sctx.stroke();
	const img = iconOf(mon);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = (h - 8 * u) / img.height;
		sctx.drawImage(img, x + 8 * u, y + 4 * u, img.width * s, img.height * s);
	}
	sctx.fillStyle = mon.curHP > 0 ? BUI.C.text : BUI.C.faint;
	sctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
	sctx.fillText(mon.name, x + h + 6 * u, y + 22 * u);
	if (mon.shiny) { // gold star on the party row
		sctx.fillStyle = '#e8b84a';
		sctx.fillText('★', x + h + 8 * u + sctx.measureText(mon.name).width, y + 22 * u);
		sctx.fillStyle = mon.curHP > 0 ? BUI.C.text : BUI.C.faint;
	}
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`Lv${mon.level}`, x + h + 6 * u, y + h - 10 * u);
	if (mon.status) {
		BUI.badge(sctx, x + h + 52 * u, y + h - 24 * u, 34 * u, 16 * u,
			BUI.STATUS_BADGE[mon.status] || '#999', mon.status.toUpperCase(),
			`${Math.round(11 * u)}px m6x11plus, monospace`);
	}
	const barW = w * 0.34;
	const frac = Math.max(0, mon.curHP / mon.maxHP);
	BUI.bar(sctx, x + w - barW - 84 * u, y + h / 2 - 5 * u, barW, 10 * u, frac, BUI.hpColor(frac), 4 * u);
	sctx.fillStyle = BUI.C.text;
	sctx.textAlign = 'right';
	sctx.fillText(`${mon.curHP}/${mon.maxHP}`, x + w - 12 * u, y + h / 2 + 5 * u);
	sctx.textAlign = 'left';
	if (note) {
		sctx.fillStyle = BUI.C.accent;
		sctx.textAlign = 'right';
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(note, x + w - 12 * u, y + 16 * u);
		sctx.textAlign = 'left';
	}
}

function drawPartyMenu(W, H) {
	const u = H / 480;
	if (partyMenu.summary) { drawSummary(W, H, u); return; }
	const act = partyMenu.action;
	menuChrome(W, H, u, 'PARTY', partyMenu.swapFrom != null
		? `Swapping ${party[partyMenu.swapFrom]?.name || ''} — pick the slot to swap it with (X cancels).`
		: act ? `Choose an action for ${act.mon.name}.` : 'Choose a POKEMON, then an action (field moves it knows, SUMMARY, SWITCH).');
	party.forEach((m, i) => {
		const note = (i === 0 ? 'LEAD ' : '') + (m.heldItem ? Bag.ITEMS[m.heldItem]?.name || m.heldItem : '');
		monRow('party:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u - (m.heldItem && !act ? 74 * u : 0), 56 * u, m,
			(act ? act.monIdx : partyMenu.idx) === i, u, note.trim());
		if (m.heldItem && !act) {
			const b = { id: 'take:' + i, x: W - 24 * u - 68 * u, y: (76 + i * 62) * u, w: 68 * u, h: 56 * u,
				label: 'TAKE', center: true };
			menuUi.push(b);
			BUI.button(sctx, b, menuHover === b.id, u);
		}
	});
	if (act) {
		const bw = 168 * u, bh = 40 * u, gap = 8 * u, x = W - bw - 28 * u;
		let y = (76 + act.monIdx * 62) * u;
		const total = act.options.length * (bh + gap);
		if (y + total > H - 12 * u) y = Math.max(70 * u, H - 12 * u - total);
		act.options.forEach((opt, i) => {
			const b = { id: 'pact:' + i, x, y: y + i * (bh + gap), w: bw, h: bh, label: opt.label, center: true };
			menuUi.push(b);
			BUI.button(sctx, b, act.idx === i || menuHover === b.id, u);
		});
	}
}

const STAT_LABEL = { hp: 'HP', atk: 'ATTACK', def: 'DEFENSE', spa: 'SP. ATK', spd: 'SP. DEF', spe: 'SPEED' };

// full-page summary for one party member: portrait, stats, moves
function drawSummary(W, H, u) {
	const m = party[partyMenu.idx];
	if (!m) { partyMenu.summary = false; return; }
	menuChrome(W, H, u, m.name, `Lv${m.level}   ${m.gender === 'M' ? '♂' : m.gender === 'F' ? '♀' : ''}   #${String(Math.abs(m.num || 0)).padStart(3, '0')}`);
	// portrait + types on the left
	const img = iconOf(m);
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(160 * u / img.width, 160 * u / img.height);
		sctx.drawImage(img, 40 * u, 90 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	m.types.forEach((t, i) => {
		const bw = 74 * u;
		BUI.badge(sctx, 40 * u + i * (bw + 8 * u), 258 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText(`ABILITY: ${(m.ability || '—').toUpperCase()}`, 40 * u, 302 * u);
	sctx.fillText(`ITEM: ${m.heldItem ? (Bag.ITEMS[m.heldItem]?.name || m.heldItem) : '—'}`, 40 * u, 322 * u);
	sctx.fillText(`NATURE: ${(m.nature || '—').toUpperCase()}   FRIEND: ${m.friend ?? 70}`, 40 * u, 342 * u);
	// contest life: the ribbon case + condition, once either exists
	if (m.ribbons?.length) {
		sctx.fillStyle = '#ffd27a';
		sctx.fillText(`RIBBONS (${m.ribbons.length}): ${m.ribbons.slice(0, 3).join(', ').toUpperCase()}${m.ribbons.length > 3 ? '…' : ''}`, 40 * u, 382 * u);
		sctx.fillStyle = BUI.C.dim;
	}
	if (m.contest && (m.contest.sheen || CATS.some(c => m.contest[c]))) {
		sctx.fillText(`CONTEST: CO ${m.contest.cool} BE ${m.contest.beauty} CU ${m.contest.cute} SM ${m.contest.smart} TO ${m.contest.tough}  SHEEN ${m.contest.sheen}`,
			40 * u, m.ribbons?.length ? 402 * u : 382 * u);
	}
	// the stat judge: IV potential in words (shiny star rides the name line)
	{
		const ivs = m.ivs || {};
		const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
		const tot = keys.reduce((s, k) => s + (ivs[k] || 0), 0);
		const best = keys.reduce((a, k) => (ivs[k] || 0) > (ivs[a] || 0) ? k : a, 'hp');
		const overall = tot >= 151 ? 'OUTSTANDING' : tot >= 121 ? 'SUPERIOR' : tot >= 91 ? 'ABOVE AVERAGE' : 'DECENT';
		const bv = ivs[best] || 0;
		const bestWord = bv >= 31 ? "CAN'T BE BEAT" : bv >= 26 ? 'FANTASTIC' : bv >= 16 ? 'PRETTY GOOD' : 'SO-SO';
		sctx.fillText(`JUDGE: ${overall} — best ${STAT_LABEL[best]} (${bestWord})`, 40 * u, 362 * u);
	}
	// stat bars on the right
	const sx = W * 0.42, sw = W * 0.5;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (96 + i * 34) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = st === 'hp' ? m.maxHP : m.stats[st];
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		// raw IV / EV. The screen showed a verbal "judge" and nothing else, and EVs
		// — which the game does award — appeared literally nowhere.
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(10 * u)}px m6x11plus, monospace`;
		sctx.fillText(`IV ${m.ivs?.[st] ?? '?'}  EV ${m.evs?.[st] ?? 0}`, sx + 104 * u, y - 12 * u);
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		const frac = Math.max(0.05, Math.min(1, v / 200));
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 108 * u, 12 * u, frac, BUI.C.accent, 4 * u);
	});
	// moves along the bottom
	const my = 320 * u;
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText('MOVES', sx, my - 8 * u);
	m.moves.forEach((mv, i) => {
		const info = battle.data.moves[mv.id] || {};
		const y = my + i * 30 * u;
		const bw = (sw) / 2 - 8 * u;
		const bx = sx + (i % 2) * (bw + 12 * u);
		const yy = my + Math.floor(i / 2) * 34 * u;
		sctx.fillStyle = BUI.C.btn;
		BUI.rr(sctx, bx, yy, bw, 28 * u, 6 * u); sctx.fill();
		const tc = BUI.TYPE_COLORS[info.type] || '#888';
		sctx.fillStyle = tc;
		sctx.fillRect(bx, yy, 4 * u, 28 * u);
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText(mv.name, bx + 12 * u, yy + 13 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		const pw = info.power ? `${info.power}` : '—';
		const ac = (info.acc == null || info.acc === true) ? '—' : `${info.acc}`;
		sctx.fillText(`${(info.type || '').toUpperCase()}  PW ${pw}  AC ${ac}  PP ${mv.pp}/${mv.maxPp}`, bx + 12 * u, yy + 25 * u);
	});
	// nav hint / lead button
	const lead = { id: 'summary-lead', x: 40 * u, y: H - 52 * u, w: 200 * u, h: 40 * u,
		label: partyMenu.idx === 0 ? 'IS LEAD' : 'MAKE LEAD', center: true };
	menuUi.push(lead);
	BUI.button(sctx, lead, menuHover === lead.id, u);
}

// LIVING DEX — the completion wall: the whole (filtered) roster as an icon grid,
// owned bright, seen dim, missing a silhouette. A visual sibling of the list.
function drawDexGrid(W, H, u, list) {
	const c = Dex.counts();
	const filtered = !!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI);
	menuChrome(W, H, u, 'LIVING DEX', filtered
		? `${dexFilterLabel()} · ${list.length} shown   —   G list, T/R/F filter`
		: `${c.caught} owned · ${c.seen} seen   —   G list, T/R/F filter, Z details`);
	if (!list.length) {
		sctx.fillStyle = BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('No POKeMON match this filter.', 40 * u, 140 * u);
		return;
	}
	const cols = DEX_GRID_COLS;
	const marginX = 24 * u, top = 74 * u;
	const cell = Math.floor((W - marginX * 2) / cols);
	const visRows = Math.max(1, Math.floor((H - top - 16 * u) / cell));
	const totalRows = Math.ceil(list.length / cols);
	const curRow = Math.floor(dexMenu.idx / cols);
	const startRow = Math.max(0, Math.min(curRow - Math.floor(visRows / 2), totalRows - visRows));
	const startI = Math.max(0, startRow * cols);
	for (let i = startI; i < Math.min(list.length, startI + visRows * cols); i++) {
		const e = list[i];
		const gx = marginX + (i % cols) * cell, gy = top + (Math.floor(i / cols) - startRow) * cell;
		const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
		const sel = dexMenu.idx === i, bid = 'dex:' + i;
		menuUi.push({ id: bid, x: gx, y: gy, w: cell, h: cell }); // tap → menuTap sets idx + opens detail
		sctx.fillStyle = sel || menuHover === bid ? BUI.C.btnHover : 'rgba(255,255,255,0.04)';
		BUI.rr(sctx, gx + 1 * u, gy + 1 * u, cell - 2 * u, cell - 2 * u, 4 * u); sctx.fill();
		if (sel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2; BUI.rr(sctx, gx + 1 * u, gy + 1 * u, cell - 2 * u, cell - 2 * u, 4 * u); sctx.stroke(); }
		if (seen) {
			const img = iconOf({ sprite: battle.data.species[e.id]?.sprite });
			if (img) {
				sctx.imageSmoothingEnabled = false;
				sctx.globalAlpha = caught ? 1 : 0.4; // seen-not-owned dims
				const s = Math.min((cell - 6 * u) / img.width, (cell - 6 * u) / img.height);
				sctx.drawImage(img, gx + (cell - img.width * s) / 2, gy + (cell - img.height * s) / 2, img.width * s, img.height * s);
				sctx.globalAlpha = 1;
			}
			if (caught) { sctx.fillStyle = BUI.C.accent; sctx.beginPath(); sctx.arc(gx + cell - 8 * u, gy + 8 * u, 3 * u, 0, Math.PI * 2); sctx.fill(); }
		} else {
			sctx.fillStyle = 'rgba(255,255,255,0.16)';
			sctx.font = `${Math.round(cell * 0.42)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText('?', gx + cell / 2, gy + cell * 0.66);
			sctx.textAlign = 'left';
		}
	}
}
function drawDexMenu(W, H) {
	const u = H / 480;
	const list = dexList();
	const c = Dex.counts();
	if (dexMenu.detail) { drawDexDetail(W, H, u, list[dexMenu.idx]); return; }
	if (dexMenu.grid) { drawDexGrid(W, H, u, list); return; }
	const filtered = !!(dexMenu.typeI || dexMenu.regionI || dexMenu.caughtI);
	menuChrome(W, H, u, 'POKeDEX', filtered
		? `${dexFilterLabel()} · ${list.length} shown   —   T/R/F filter, G grid`
		: `Seen ${c.seen}   Caught ${c.caught}   —   T/R/F filter, G grid, Z details`);
	if (!list.length) {
		sctx.fillStyle = BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('No POKeMON match this filter.', 40 * u, 140 * u);
		return;
	}
	const rows = 9;
	const start = Math.max(0, Math.min(dexMenu.idx - 4, list.length - rows));
	list.slice(start, start + rows).forEach((e, i) => {
		const idx = start + i;
		const seen = Dex.isSeen(e.id), caught = Dex.isCaught(e.id);
		const bid = 'dex:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 40) * u, w: W - 48 * u, h: 34 * u };
		menuUi.push(b);
		sctx.fillStyle = dexMenu.idx === idx || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 6 * u); sctx.fill();
		sctx.strokeStyle = dexMenu.idx === idx ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = dexMenu.idx === idx ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(`#${String(Math.abs(e.num)).padStart(3, '0')}`, b.x + 12 * u, b.y + 22 * u);
		sctx.fillStyle = seen ? BUI.C.text : BUI.C.faint;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText(seen ? e.name.toUpperCase() : '----------', b.x + 70 * u, b.y + 22 * u);
		if (caught) {
			sctx.fillStyle = BUI.C.accent;
			sctx.textAlign = 'right';
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			sctx.fillText('● OWNED', b.x + b.w - 14 * u, b.y + 22 * u);
			sctx.textAlign = 'left';
		}
	});
}

function drawDexDetail(W, H, u, e) {
	if (!e) { dexMenu.detail = false; return; }
	const sp = battle.data.species[e.id];
	const caught = Dex.isCaught(e.id);
	menuChrome(W, H, u, sp.name.toUpperCase(), `#${String(Math.abs(e.num)).padStart(3, '0')}   ${caught ? 'OWNED' : 'SEEN'}`);
	const img = iconOf({ sprite: sp.sprite });
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min(180 * u / img.width, 180 * u / img.height);
		sctx.drawImage(img, 50 * u, 100 * u, img.width * s, img.height * s);
	}
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	(sp.types || []).forEach((t, i) => {
		const bw = 76 * u;
		BUI.badge(sctx, 50 * u + i * (bw + 8 * u), 290 * u, bw, 22 * u,
			BUI.TYPE_COLORS[t] || '#888', t.toUpperCase(), `${Math.round(12 * u)}px m6x11plus, monospace`);
	});
	const sx = W * 0.5, sw = W * 0.42;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	['hp', 'atk', 'def', 'spa', 'spd', 'spe'].forEach((st, i) => {
		const y = (110 + i * 36) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(STAT_LABEL[st], sx, y);
		const v = sp.baseStats[st] || 0;
		sctx.fillStyle = BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(String(v), sx + 96 * u, y);
		sctx.textAlign = 'left';
		BUI.bar(sctx, sx + 108 * u, y - 11 * u, sw - 40 * u, 12 * u, Math.min(1, v / 200), BUI.C.accent, 4 * u);
	});
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillText('Z: hear its cry   ▲▼: browse   X: back', 40 * u, H - 16 * u);
}

// simple playtime accumulator (seconds), persisted; region stored on starter pick
function playtimeStr() {
	const s = parseInt(localStorage.getItem('magepunk_playtime'), 10) || 0;
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
	return `${h}:${String(m).padStart(2, '0')}`;
}
function drawTownMap(W, H) {
	const u = H / 480;
	const region = Fly.REGION_ORDER[townMap.region];
	const towns = Fly.FLY[region];
	const sel = towns[townMap.idx];
	menuChrome(W, H, u, 'TOWN MAP', 'Arrows: ◄► region  ▲▼ town   Z: fly   X: close');
	// region tabs
	Fly.REGION_ORDER.forEach((r, i) => {
		const bid = 'townreg:' + i;
		const b = { id: bid, x: (24 + i * 150) * u, y: 62 * u, w: 142 * u, h: 30 * u,
			label: Fly.REGION_LABEL[r], center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || townMap.region === i, u);
	});
	// map panel: dots at normalized grid positions
	const grid = Fly.GRID[region];
	const px = 40 * u, py = 108 * u, pw = W - 320 * u, ph = H - 168 * u;
	sctx.fillStyle = 'rgba(24,40,60,0.9)';
	BUI.rr(sctx, px, py, pw, ph, 10 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.panelBorder; sctx.lineWidth = 2;
	BUI.rr(sctx, px + 1, py + 1, pw - 2, ph - 2, 10 * u); sctx.stroke();
	const pad = 22 * u;
	// draw the region art (Kanto/Johto) letterboxed inside the panel; dots then
	// sit on the image's baked city markers. Hoenn has no art -> grid dot map.
	const meta = Fly.IMG[region];
	const art = meta && townImg(meta.file);
	let imgRect = null;
	if (art) {
		const scale = Math.min((pw - pad) / meta.w, (ph - pad) / meta.h);
		const dw = meta.w * scale, dh = meta.h * scale;
		const ix = px + (pw - dw) / 2, iy = py + (ph - dh) / 2;
		sctx.imageSmoothingEnabled = false;
		sctx.drawImage(art, ix, iy, dw, dh);
		imgRect = { ix, iy, dw, dh };
	}
	const dotAt = t => {
		if (imgRect) {
			const mp = Fly.markerPx(region, t.map);
			if (mp) return [imgRect.ix + (mp[0] / meta.w) * imgRect.dw, imgRect.iy + (mp[1] / meta.h) * imgRect.dh];
		}
		const g = Fly.POS[t.map] || [grid.w / 2, grid.h / 2];
		return [px + pad + (g[0] + 0.5) / grid.w * (pw - pad * 2),
			py + pad + (g[1] + 0.5) / grid.h * (ph - pad * 2)];
	};
	towns.forEach((t, i) => {
		const [dx, dy] = dotAt(t);
		const visited = hasFlyPoint(t.map);
		const isSel = townMap.idx === i;
		const bid = 'town:' + i;
		menuUi.push({ id: bid, x: dx - 12 * u, y: dy - 12 * u, w: 24 * u, h: 24 * u });
		if (isSel) {
			sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2;
			sctx.beginPath(); sctx.arc(dx, dy, 9 * u, 0, Math.PI * 2); sctx.stroke();
		}
		sctx.fillStyle = visited ? (isSel ? BUI.C.accent : '#e0554d') : 'rgba(217,230,242,0.35)';
		sctx.beginPath(); sctx.arc(dx, dy, 4.5 * u, 0, Math.PI * 2); sctx.fill();
	});
	// selected town name + fly status on the right rail
	const rx = W - 258 * u, ry = 108 * u;
	sctx.fillStyle = 'rgba(24,40,60,0.9)';
	BUI.rr(sctx, rx, ry, 234 * u, ph, 10 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.panelBorder; sctx.lineWidth = 2;
	BUI.rr(sctx, rx + 1, ry + 1, 232 * u, ph - 2, 10 * u); sctx.stroke();
	const visited = hasFlyPoint(sel.map);
	sctx.fillStyle = BUI.C.text;
	sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
	sctx.fillText(sel.name, rx + 18 * u, ry + 36 * u);
	sctx.fillStyle = visited ? BUI.C.accent : BUI.C.dim;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.fillText(visited ? 'Visited — Z to fly' : 'Not yet visited', rx + 18 * u, ry + 62 * u);
	// cross-region progress: the shared world tier, this region's gyms, and whether it still
	// owes the current tier's gym; plus a GYM tag if the selected town is a gym town.
	const rkey = { kanto: 'KANTO', johto: 'JOHTO', hoenn: 'HOENN' }[region];
	let ty = ry + 100 * u;
	sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = BUI.C.dim;
	sctx.fillText(`WORLD GYM TIER ${Quest.globalTier()}/8`, rx + 18 * u, ty); ty += 22 * u;
	if (rkey) {
		const owes = Quest.laggingRegions().includes(rkey);
		sctx.fillStyle = BUI.C.text;
		sctx.fillText(`${Fly.REGION_LABEL[region]}: ${Badges.count(rkey)}/8 gyms`, rx + 18 * u, ty); ty += 20 * u;
		if (owes && Quest.globalTier() < 8) {
			sctx.fillStyle = '#ffd27a';
			sctx.fillText(`Owes GYM ${Quest.globalTier() + 1} here`, rx + 18 * u, ty); ty += 20 * u;
		}
	} else {
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText('(post-game region)', rx + 18 * u, ty); ty += 20 * u;
	}
	const gt = PORTAL_TOWNS[sel.map];
	if (gt) {
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(`GYM ${gt.tier + 1}: ${Quest.GYMS[gt.region][gt.tier].leader}`, rx + 18 * u, ty);
	}
	if (visited) {
		const b = { id: 'townfly', x: rx + 18 * u, y: ry + ph - 56 * u, w: 198 * u, h: 40 * u, label: 'FLY HERE', center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === 'townfly', u);
	}
	// roamer tracker: once you've MET a roamer, the map tracks its current route
	{
		const st = roamState();
		const lines = Object.entries(ROAMERS)
			.filter(([k, cfg]) => st[k] && !st[k].down && st[k].seen)
			.map(([k, cfg]) => `${(battle.data.species[k]?.name || k).toUpperCase()} roams ${st[k].map.replace(/^Route/, 'ROUTE ')} (${cfg.region})`);
		if (lines.length) {
			sctx.fillStyle = '#ffd27a';
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			lines.slice(0, 2).forEach((t, i) => sctx.fillText(t, 40 * u, H - (40 + i * 18) * u));
		}
	}
	if (townMap.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(townMap.flash, 40 * u, H - 20 * u);
	}
}

function drawTrainerCard(W, H) {
	const u = H / 480;
	// page 1 — the ADVENTURE JOURNAL: the newest entries of the rolling log
	if (trainerCard.page === 1) {
		menuChrome(W, H, u, 'ADVENTURE JOURNAL', '◄ ► card   X: close');
		const list = Journal.list();
		const cardX = 60 * u, cardY = 84 * u, cardW = W - 120 * u, cardH = H - 170 * u;
		sctx.fillStyle = 'rgba(30,54,92,0.9)';
		BUI.rr(sctx, cardX, cardY, cardW, cardH, 16 * u); sctx.fill();
		sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3;
		BUI.rr(sctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 16 * u); sctx.stroke();
		if (!list.length) {
			sctx.fillStyle = BUI.C.dim;
			sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
			sctx.fillText('Nothing yet — badges, catches, and evolutions land here.', cardX + 24 * u, cardY + 40 * u);
		}
		const rows = Math.floor((cardH - 40 * u) / (26 * u));
		list.slice(0, rows).forEach((e, i) => {
			const y = cardY + (30 + i * 26) * u;
			sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
			sctx.fillStyle = BUI.C.dim;
			sctx.fillText(Journal.when(e), cardX + 20 * u, y);
			sctx.fillStyle = BUI.C.text;
			sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
			sctx.fillText(e.text, cardX + 92 * u, y);
		});
		return;
	}
	menuChrome(W, H, u, 'TRAINER CARD', 'Your journey so far.   ◄ ► journal   ·   S share');
	const c = Dex.counts();
	const name = localStorage.getItem('magepunk_name') || 'PLAYER';
	const region = localStorage.getItem('magepunk_region') || '—';
	const money = Bag.getMoney();
	const cardX = 60 * u, cardY = 90 * u, cardW = W - 120 * u, cardH = H - 190 * u;
	sctx.fillStyle = 'rgba(30,54,92,0.9)';
	BUI.rr(sctx, cardX, cardY, cardW, cardH, 16 * u); sctx.fill();
	sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 3;
	BUI.rr(sctx, cardX + 1, cardY + 1, cardW - 2, cardH - 2, 16 * u); sctx.stroke();
	const rk = Badges.regionKey(region);
	const gTier = Quest.globalTier();
	const laggers = Quest.laggingRegions();
	const allChamp = Quest.SHARED.every(r => Badges.isChampion(r));
	// LEFT COLUMN — stats (values right-align to the column split)
		// shiny count (party + PC boxes) + Battle Frontier progress (Batch 6c)
		const shinyCount = shinyOwnedCount();
		const frBP = Frontier.getBP(), frSym = Object.keys(Frontier.getSymbols()).length;
	const lines = [
		['NAME', name],
		['ID No.', tidStr()],
		['REGION', region],
		['GYM TIER', allChamp ? `${gTier}/8  GRAND CHAMP` : `${gTier}/8`],
		['LEVEL CAP', gTier >= 8 ? 'NONE' : `Lv${levelCapNow()}`],
		['OBJECTIVE', Quest.shortObjective(rk)],
		['MONEY', `$${money}`],
		['TIME', `${Clock.label()} (${Clock.phaseLabel()})`],
		['POKeDEX', `${c.seen} seen / ${c.caught} own`],
		['SHINIES', `${shinyCount} ★`],
		['FRONTIER', `${frBP} BP · ${frSym} sym`],
		['PARTY', `${party.length}/6`],
		['PLAYTIME', playtimeStr()],
	];
	const midX = cardX + cardW * 0.54;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	lines.forEach(([k, v], i) => {
		const y = cardY + (34 + i * 26) * u;
		sctx.fillStyle = BUI.C.dim;
		sctx.fillText(k, cardX + 28 * u, y);
		sctx.fillStyle = (k === 'GYM TIER' && gTier > 0) || k === 'LEVEL CAP' ? BUI.C.accent : BUI.C.text;
		sctx.textAlign = 'right';
		sctx.fillText(v, midX, y);
		sctx.textAlign = 'left';
	});
	// RIGHT COLUMN — the cross-region TIER tracker: one row of 8 pips per shared region
	// (fill = earned). The current tier's pip is ringed on the regions that still OWE this
	// tier's gym, so you can see at a glance who's holding the world back.
	const rX = cardX + cardW * 0.57;
	sctx.fillStyle = BUI.C.accent;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillText(`GYM TIER ${gTier}/8`, rX, cardY + 30 * u);
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
	// the tier tracker and the level cap are the same fact seen twice, so spell
	// out what clearing this row buys you
	sctx.fillText(gTier >= 8 ? 'all cleared — no level cap' : `beat each in all 3 regions  ->  Lv${Badges.nextLevelCap(gTier)} cap`,
		rX, cardY + 46 * u);
	const rowLbl = { KANTO: 'KAN', JOHTO: 'JOH', HOENN: 'HOE' };
	const pipAreaX = rX + 44 * u, pipAreaW = (cardX + cardW - 24 * u) - pipAreaX, pgap = pipAreaW / 8, pipR = 6 * u;
	Quest.SHARED.forEach((r, ri) => {
		const ry = cardY + (72 + ri * 26) * u;
		const owes = laggers.includes(r), champ = Badges.isChampion(r), list = Badges.list(r);
		sctx.fillStyle = owes ? BUI.C.text : BUI.C.dim;
		sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
		sctx.fillText(rowLbl[r] + (champ ? '*' : ''), rX, ry + 4 * u);
		for (let i = 0; i < 8; i++) {
			const px = pipAreaX + pgap * i + pgap / 2;
			sctx.beginPath();
			sctx.arc(px, ry, pipR, 0, Math.PI * 2);
			sctx.fillStyle = list[i].earned ? BUI.C.accent : 'rgba(255,255,255,0.12)';
			sctx.fill();
			if (i === gTier && owes && gTier < 8) { sctx.strokeStyle = '#ffd27a'; sctx.lineWidth = 2; sctx.stroke(); } // the tier they owe
			else if (list[i].earned) { sctx.strokeStyle = '#fff'; sctx.lineWidth = 1; sctx.stroke(); }
		}
	});
	// THE POSTGAME ROW — JohKanto's own eight, plus RED and the legend count.
	// The card tracked the three shared regions and stopped; the sixteen-badge
	// climb and the hunt had no progress surface at all.
	if (Badges.isChampion('JOHTO')) {
		const ry = cardY + (72 + 3 * 26) * u;
		const jkList = Badges.list('JOHKANTO');
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
		sctx.fillText('OLD' + (Story.getFlag('beat_red') ? '*' : ''), rX, ry + 4 * u);
		for (let i = 0; i < 8; i++) {
			const px = pipAreaX + pgap * i + pgap / 2;
			sctx.beginPath();
			sctx.arc(px, ry, pipR, 0, Math.PI * 2);
			sctx.fillStyle = jkList[i].earned ? '#c9a24a' : 'rgba(255,255,255,0.12)';
			sctx.fill();
			if (jkList[i].earned) { sctx.strokeStyle = '#fff'; sctx.lineWidth = 1; sctx.stroke(); }
		}
		const { caught, total } = legendStats();
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText(`LEGENDS ${caught}/${total}`, rX, ry + 20 * u);
	}
	// FRONTIER SYMBOLS — a compact row of diamonds (gold/silver) under the tier tracker
	const symbols = Frontier.getSymbols();
	const facOrder = [['tower', 'TO'], ['dome', 'DO'], ['factory', 'FA'], ['palace', 'PA'], ['arena', 'AR'], ['pike', 'PI'], ['pyramid', 'PY']];
	if (facOrder.some(([id]) => symbols[id])) {
		const symY = cardY + 172 * u, r = 8 * u, rW = (cardX + cardW - 24 * u) - rX;
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		sctx.fillText('FRONTIER SYMBOLS', rX, symY - 14 * u);
		const sgap = rW / 7;
		facOrder.forEach(([id, code], i) => {
			const sx = rX + sgap * i + sgap / 2, tier = symbols[id];
			sctx.beginPath();
			sctx.moveTo(sx, symY - r); sctx.lineTo(sx + r, symY); sctx.lineTo(sx, symY + r); sctx.lineTo(sx - r, symY); sctx.closePath();
			sctx.fillStyle = tier === 'gold' ? '#f5c542' : tier === 'silver' ? '#c9d2dc' : 'rgba(255,255,255,0.12)';
			sctx.fill();
			if (tier) { sctx.strokeStyle = '#fff'; sctx.lineWidth = 1.2; sctx.stroke(); }
			sctx.fillStyle = tier ? '#16273f' : BUI.C.dim;
			sctx.font = `${Math.round(9 * u)}px m6x11plus, monospace`;
			sctx.textAlign = 'center';
			sctx.fillText(code, sx, symY + 3 * u);
			sctx.textAlign = 'left';
		});
	}
}

// a simple scrollable option-list menu (label rows + optional flash)
function optionList(W, H, u, title, sub, rows, sel, idPrefix, flash) {
	menuChrome(W, H, u, title, sub);
	const start = Math.max(0, Math.min(sel - 3, rows.length - 8));
	rows.slice(start, start + 8).forEach((label, i) => {
		const idx = start + i;
		const bid = idPrefix + idx;
		const b = { id: bid, x: 24 * u, y: (84 + i * 50) * u, w: W - 48 * u, h: 44 * u, label, center: false };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || sel === idx, u);
	});
	if (flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(flash, 24 * u, H - 18 * u);
	}
}

function drawDaycare(W, H) {
	const u = H / 480;
	const st = Daycare.get();
	if (daycareMenu.mode === 'deposit') {
		menuChrome(W, H, u, 'DAY CARE', 'Which POKeMON should we look after?');
		party.forEach((m, i) => monRow('dcdep:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, daycareMenu.idx === i, u));
		if (daycareMenu.flash) { sctx.fillStyle = BUI.C.accent; sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; sctx.fillText(daycareMenu.flash, 24 * u, H - 18 * u); }
		return;
	}
	const inCare = st.slots.filter(Boolean).map(m => `${m.name} Lv${m.level}`).join(', ') || 'nobody right now';
	const eggLine = Daycare.hasReadyEgg() ? '  •  An EGG is ready!' : (Daycare.eggPending() ? '  •  An EGG is on the way…' : '');
	const opts = daycareOptions();
	optionList(W, H, u, 'DAY CARE', `Looking after: ${inCare}${eggLine}`, opts.map(o => o.label), daycareMenu.idx, 'dc:', daycareMenu.flash);
}

function drawNameRater(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'NAME RATER', 'Whose nickname shall I judge?');
	party.forEach((m, i) => monRow('nr:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, m, nameRater.idx === i, u));
}

function drawOptions(W, H) {
	const u = H / 480;
	if (optionsMenu.mode === 'controls') {
		const rows = KEY_ACTIONS.map(a => {
			const cur = keyBinds[a.id];
			const shown = (cur || a.def) === ' ' ? 'SPACE' : (cur || a.def).toUpperCase();
			return optionsMenu.capture === a.id ? `${a.label}   >>> PRESS A KEY (Esc cancels)` : `${a.label}   —   ${shown}${cur ? '' : '  (default)'}`;
		}).concat(['RESET ALL TO DEFAULTS', 'Back']);
		optionList(W, H, u, 'CONTROLS', 'Every shortcut, rebindable. Arrows + WASD always move.', rows, optionsMenu.idx, 'ctl:', optionsMenu.flash);
		return;
	}
	if (optionsMenu.mode === 'backups') {
		const list = optionsMenu.list;
		const rows = list == null ? ['(loading…)'] : [
			...list.map(b => (b.slot === 'undo' ? 'UNDO — before the last restore' : b.slot)
				+ `   (${Math.max(1, Math.round((b.bytes || 0) / 1024))} KB)`),
			'BACK',
		];
		optionList(W, H, u, 'SERVER BACKUPS', 'One automatic save kept per day, plus UNDO.  Z: restore', rows, optionsMenu.idx, 'bkp:', optionsMenu.flash);
		return;
	}
	menuChrome(W, H, u, 'OPTIONS', 'Arrows: ▲▼ pick   ◄► change   X: close');
	OPTION_KEYS.forEach((key, i) => {
		const o = Settings.OPTIONS[key];
		const sel = optionsMenu.idx === i;
		const bid = 'opt:' + i;
		const b = { id: bid, x: 40 * u, y: (84 + i * 46) * u, w: W - 80 * u, h: 40 * u };
		menuUi.push(b);
		sctx.fillStyle = sel || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 8 * u); sctx.fill();
		sctx.strokeStyle = sel ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = sel ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 8 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
		sctx.fillText(o.label, b.x + 20 * u, b.y + 27 * u);
		// value with ◄ ► chevrons
		const val = Settings.displayValue(key);
		sctx.textAlign = 'right';
		sctx.fillStyle = BUI.C.accent;
		sctx.fillText(val, b.x + b.w - 44 * u, b.y + 27 * u);
		sctx.fillStyle = sel ? BUI.C.text : BUI.C.dim;
		sctx.fillText('◄', b.x + b.w - 132 * u, b.y + 27 * u);
		sctx.fillText('►', b.x + b.w - 20 * u, b.y + 27 * u);
		sctx.textAlign = 'left';
	});
	// SAVE DATA + CONTROLS — four action buttons in one row under the settings
	const actY = (84 + OPTION_KEYS.length * 46 + 8) * u;
	OPTION_ACTIONS.forEach((a, i) => {
		const idx = OPTION_KEYS.length + i;
		const bw = (W - 80 * u - 24 * u) / 4;
		const bid = 'optact:' + i;
		const b = { id: bid, x: 40 * u + i * (bw + 8 * u), y: actY, w: bw, h: 44 * u, label: a.label, center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || optionsMenu.idx === idx, u);
	});
	// hint for the selected action (or a flash from the last one), else the default footer
	const act = OPTION_ACTIONS[optionsMenu.idx - OPTION_KEYS.length];
	sctx.fillStyle = optionsMenu.flash ? BUI.C.accent : BUI.C.dim;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.fillText(optionsMenu.flash || (act ? act.hint + '.' : 'Changes save automatically.'), 40 * u, H - 12 * u);
}

function drawMoveShop(W, H) {
	const u = H / 480;
	const m = moveShop;
	if (m.mode === 'main') {
		optionList(W, H, u, 'MOVE SERVICES', 'I can make a POKeMON forget or recall a move.',
			['Forget a move', 'Recall a move'], m.idx, 'ms:', m.flash);
		return;
	}
	if (m.mode === 'pick-delete' || m.mode === 'pick-relearn') {
		menuChrome(W, H, u, 'MOVE SERVICES', m.mode === 'pick-delete' ? 'Which POKeMON forgets a move?' : 'Which POKeMON recalls a move?');
		party.forEach((mo, i) => monRow('mspick:' + i, 24 * u, (76 + i * 62) * u, W - 48 * u, 56 * u, mo, m.idx === i, u));
		if (m.flash) { sctx.fillStyle = BUI.C.accent; sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`; sctx.fillText(m.flash, 24 * u, H - 18 * u); }
		return;
	}
	if (m.mode === 'delete-move') {
		const labels = m.mon.moves.map(mv => { const info = battle.data.moves[mv.id] || {}; return `${mv.name}  [${(info.type || '').toUpperCase()}]`; });
		optionList(W, H, u, `${m.mon.name} — forget which move?`, 'It needs to keep at least one move.', labels, m.idx, 'msdel:', m.flash);
		return;
	}
	if (m.mode === 'relearn-move') {
		const list = m.list || [];
		const labels = list.length ? list.map(id => { const info = battle.data.moves[id] || {}; return `${info.name}  [${(info.type || '').toUpperCase()}]`; }) : ['(no moves to recall)'];
		optionList(W, H, u, `${m.mon.name} — recall which move?`, 'Level-up moves it has learned before.', labels, m.idx, 'msrel:', m.flash);
		return;
	}
}

// draw one starter tile (sprite + name in a rounded, type-tinted frame)
function drawStarterCell(id, x, y, cw, ch, sel, bid, u) {
	const sp = battle.data.species[id];
	const tc = BUI.TYPE_COLORS[sp?.types?.[0]] || '#888';
	sctx.fillStyle = sel || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
	BUI.rr(sctx, x, y, cw, ch, 10 * u); sctx.fill();
	sctx.strokeStyle = sel || menuHover === bid ? tc : BUI.C.panelBorder;
	sctx.lineWidth = sel ? 4 : 2;
	BUI.rr(sctx, x + 1, y + 1, cw - 2, ch - 2, 10 * u); sctx.stroke();
	const img = starterMenu.sprites[id];
	if (img) {
		sctx.imageSmoothingEnabled = false;
		const s = Math.min((cw - 30 * u) / img.width, (ch - 44 * u) / img.height);
		sctx.drawImage(img, x + (cw - img.width * s) / 2, y + 6 * u, img.width * s, img.height * s);
	}
	sctx.fillStyle = sel ? tc : BUI.C.text;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.textAlign = 'center';
	sctx.fillText((sp?.name || id).toUpperCase(), x + cw / 2, y + ch - 10 * u);
	sctx.textAlign = 'left';
}
function drawStarterMenu(W, H) {
	const u = H / 480;
	if (starterMenu.phase === 'pick') {
		const region = starterMenu.region || STARTERS[starterMenu.row]?.region || 'KANTO';
		const row = STARTERS.find(r => r.region === region) || STARTERS[0];
		menuChrome(W, H, u, 'CHOOSE YOUR FIRST POKEMON', `${region} — use ◄ ► then A to choose your partner.`, false);
		const cw = 150 * u, ch = 150 * u, y = 150 * u;
		row.ids.forEach((id, c) => {
			const x = (70 + c * 165) * u;
			const bid = `starterpick:${c}`;
			menuUi.push({ id: bid, x, y, w: cw, h: ch });
			drawStarterCell(id, x, y, cw, ch, starterMenu.col === c, bid, u);
		});
		return;
	}
	// phase 'region': REGION cards only. The old screen was a 3x3 grid of the
	// nine starters, which read as "pick your starter" — but the starter is
	// chosen later, on-screen in the professor's lab, so showing them here
	// promised a choice this screen doesn't make.
	menuChrome(W, H, u, 'CHOOSE YOUR REGION', 'Pick where your journey begins. Your first POKeMON waits in the lab.', false);
	STARTERS.forEach((row, r) => {
		const y = (84 + r * 128) * u, ch = 112 * u;
		const rowSel = starterMenu.row === r;
		const bid = `region:${r}`;
		const b = { id: bid, x: 30 * u, y, w: W - 60 * u, h: ch };
		menuUi.push(b);
		sctx.fillStyle = rowSel || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 10 * u); sctx.fill();
		if (rowSel) { sctx.strokeStyle = BUI.C.accent; sctx.lineWidth = 2.5 * u; BUI.rr(sctx, b.x, b.y, b.w, b.h, 10 * u); sctx.stroke(); }
		const cfg = NEW_GAME_INTRO[row.region] || {};
		sctx.fillStyle = rowSel ? BUI.C.accent : BUI.C.text;
		sctx.font = `${Math.round(30 * u)}px m6x11plus, monospace`;
		sctx.fillText(row.region, b.x + 26 * u, y + 46 * u);
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${cfg.prof || ''} awaits in ${(cfg.home || '').replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase()}`, b.x + 26 * u, y + 74 * u);
		sctx.fillText({ KANTO: 'The classic journey — FireRed', JOHTO: 'The golden road — Crystal', HOENN: 'Land and sea — Emerald' }[row.region] || '', b.x + 26 * u, y + 96 * u);
	});
}

function drawShopMenu(W, H) {
	const u = H / 480;
	const selling = shopMenu.mode === 'sell';
	menuChrome(W, H, u, 'POKE MART', `Money: $${Bag.getMoney()} — ${selling ? 'tap to sell (half price)' : 'tap to buy'}`);
	// BUY / SELL tabs
	['buy', 'sell'].forEach((m, i) => {
		const bid = 'shopmode:' + m;
		const b = { id: bid, x: (24 + i * 130) * u, y: 62 * u, w: 120 * u, h: 30 * u, label: m.toUpperCase(), center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || shopMenu.mode === m, u);
	});
	const rows = selling ? sellList() : shopStockNow().map(id => ({ id }));
	if (!rows.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('Nothing to sell.', 24 * u, 140 * u);
	}
	const start = Math.max(0, Math.min(shopMenu.idx - 3, rows.length - 7));
	rows.slice(start, start + 7).forEach((row, i) => {
		const idx = start + i;
		const it = Bag.ITEMS[row.id];
		const bid = (selling ? 'sell:' : 'buy:') + idx;
		const price = selling ? sellPrice(row.id) : it.price;
		const b = { id: bid, x: 24 * u, y: (104 + i * 48) * u, w: W - 118 * u, h: 42 * u,
			label: it.name, sub: selling ? `have ${row.n}` : `have ${Bag.count(row.id)}`,
			right: `$${price}`, kbSel: shopMenu.idx === idx };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || shopMenu.idx === idx, u);
	});
	for (const [id, label, y] of [['shopscroll:-1', '▲', 104], ['shopscroll:1', '▼', 320]]) {
		const b = { id, x: W - 86 * u, y: y * u, w: 62 * u, h: 130 * u, label, center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === id, u);
	}
	if (shopMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(shopMenu.flash, 24 * u, H - 20 * u);
	}
}

function drawBagMenu(W, H) {
	const u = H / 480;
	const pocket = BAG_POCKETS[bagMenu.pocket] || BAG_POCKETS[0];
	menuChrome(W, H, u, `BAG — ${pocket.label}`,
		`Money: $${Bag.getMoney()} — ←/→ pocket · tap an item, then who to use it on`);
	const entries = bagEntries();
	if (!entries.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(16 * u)}px m6x11plus, monospace`;
		sctx.fillText('The bag is empty.', 24 * u, 100 * u);
	}
	const colW = bagMenu.picking ? W * 0.44 : W - 48 * u;
	const start = Math.max(0, Math.min(bagMenu.idx - 3, entries.length - 7));
	entries.slice(start, start + 7).forEach(([id, n], i) => {
		const idx = start + i;
		const bid = 'item:' + idx;
		const b = { id: bid, x: 24 * u, y: (76 + i * 52) * u, w: colW, h: 46 * u,
			label: Bag.nameOf(id), right: `x${n}` };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || (bagMenu.idx === idx && !bagMenu.picking), u);
	});
	if (bagMenu.forget) {
		const f = bagMenu.forget;
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(`${f.mon.name}: forget which move?`, W * 0.5, 70 * u);
		f.mon.moves.forEach((mv, i) => {
			const bid = 'forget:' + i;
			const b = { id: bid, x: W * 0.5, y: (76 + i * 52) * u, w: W * 0.47, h: 46 * u,
				label: mv.name, right: `${mv.pp}/${mv.maxPp}` };
			menuUi.push(b);
			BUI.button(sctx, b, menuHover === bid || f.idx === i, u);
		});
	} else if (bagMenu.picking) {
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText('Use on:', W * 0.5, 70 * u);
		party.forEach((m, i) => {
			monRow('use:' + i, W * 0.5, (76 + i * 54) * u, W * 0.47, 48 * u, m, bagMenu.pickIdx === i, u);
		});
	}
	if (bagMenu.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.fillText(bagMenu.flash, 24 * u, H - 24 * u);
	}
}

function drawPcMenu(W, H) {
	const u = H / 480;
	const box = getBox();
	const pageStart = pcMenu.box * PC_BOX_CAP;
	const viewIdx = pcMenu.filter != null ? pcMatches(box, pcMenu.filter) : null;
	const page = viewIdx ? viewIdx.map(i => box[i]) : box.slice(pageStart, pageStart + PC_BOX_CAP);
	menuChrome(W, H, u, 'POKEMON STORAGE',
		pcMenu.confirm != null ? `Release ${box[pcMenu.confirm]?.name}? Z releases — X keeps it.`
			: pcMenu.releaseMode ? 'RELEASE MODE: tap a boxed Pokémon to let it go.'
			: pcMenu.flash || 'Z moves · ←/→ change box · R release · S sort · F search.');
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = pcMenu.side === 0 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText('PARTY', 24 * u, 78 * u);
	sctx.fillStyle = pcMenu.side === 1 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText(viewIdx
		? `SEARCH "${pcMenu.filter}" — ${page.length} found of ${box.length}`
		: `BOX ${pcMenu.box + 1}/${PC_BOXES} (${page.length}/${PC_BOX_CAP} · ${box.length} total)`, W * 0.52, 78 * u);
	// tappable controls: box paging + sort + release mode; confirm gets its own pair
	const navBtns = pcMenu.confirm != null
		? [['pcnav:yes', 'RELEASE', W * 0.52, 100 * u], ['pcnav:no', 'KEEP', W * 0.52 + 110 * u, 76 * u]]
		: [
			['pcnav:prev', '<', W * 0.465, 24 * u],
			['pcnav:next', '>', W - 40 * u, 24 * u],
			['pcnav:sort', 'SORT', 24 * u, 60 * u],
			['pcnav:rel', pcMenu.releaseMode ? 'DONE' : 'RELEASE', 96 * u, 90 * u],
			['pcnav:find', pcMenu.filter ? 'CLEAR' : 'FIND', 198 * u, 70 * u],
		];
	for (const [bid, label, x, w] of navBtns) {
		const b = { id: bid, x, y: 62 * u, w, h: 22 * u, label, center: true };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid, u);
	}
	if (pcMenu.confirm != null) return; // the confirm banner + buttons say it all
	party.forEach((m, i) => {
		monRow('pcp:' + i, 24 * u, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 0 && pcMenu.idx === i, u);
	});
	const start = Math.max(0, Math.min((pcMenu.side === 1 ? pcMenu.idx : 0) - 3, page.length - 7));
	page.slice(start, start + 7).forEach((m, i) => {
		const idx = start + i;
		monRow('pcb:' + idx, W * 0.52, (88 + i * 54) * u, W * 0.44, 48 * u, m,
			pcMenu.side === 1 && pcMenu.idx === idx, u);
	});
}

function drawFerryMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'FERRY', 'All aboard! Where to, sailor?');
	const dests = FERRY_DESTS.filter(d => d.file !== world.current.name);
	dests.forEach((d, i) => {
		const bid = 'sail:' + i;
		const b = { id: bid, x: 24 * u, y: (90 + i * 64) * u, w: W - 48 * u, h: 56 * u,
			label: d.label, big: true, center: true, kbSel: ferryMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || ferryMenu.idx === i, u);
	});
}

function drawPortalMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'PORTAL', 'The pad hums. Where to, traveler?');
	const rows = portalMenu.dests.map(d => `${d.town}  (${d.region})`).concat(['Cancel']);
	rows.forEach((label, i) => {
		const bid = 'portal:' + i;
		const b = { id: bid, x: 24 * u, y: (90 + i * 64) * u, w: W - 48 * u, h: 56 * u,
			label, big: true, center: true, kbSel: portalMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || portalMenu.idx === i, u);
	});
}

// a compact vertical list menu (Start / Cards); returns tappable rows
function drawVertical(W, H, u, title, sub, items, idx, idPrefix) {
	menuChrome(W, H, u, title, sub, title !== 'MENU');
	const bw = Math.min(W - 48 * u, 360 * u);
	items.forEach((lab, i) => {
		const bid = idPrefix + ':' + i;
		const b = { id: bid, x: W - bw - 24 * u, y: (80 + i * 46) * u, w: bw, h: 40 * u,
			label: lab, center: true, kbSel: idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === bid || idx === i, u);
	});
}
function drawStartMenu(W, H) {
	drawVertical(W, H, H / 480, 'MENU', 'Press START/Enter to close.', startItems(), startMenu.idx, 'start');
}
function drawQuest(W, H) {
	const rk = playerRegion();
	if (questMenu.page === 1) {
		// THINGS TO DO — the discovery checklist
		const rows = todoRows();
		const left = rows.filter(r => r.startsWith('[ ]') || r.startsWith('[>]')).length;
		optionList(W, H, H / 480, 'THINGS TO DO', `◄ ► quest log   ·   ${THINGS_TO_DO.length - left} explored, ${left} to discover`, rows, questMenu.idx, 'todo:', null);
		return;
	}
	const mark = r => (r.state === 'done' ? '[x] ' : r.state === 'current' ? '[>] ' : '[ ] ') + r.label;
	// the postgame arc appends below the region log — the log used to end at the
	// League row while sixteen more badges, RED and the legendary hunt existed
	const pg = postgameLog();
	const rows = Quest.log(rk).map(mark).concat(pg.length ? ['— THE OLD KANTO —', ...pg.map(mark)] : []);
	const next = (Quest.stage(rk) === Quest.DONE && postgameObjective()) || Quest.objective(rk);
	// the title carries the SHARED gym tier (all three regions must clear each tier); the
	// subtitle's objective already spells out the cross-region "who's behind" when relevant
	optionList(W, H, H / 480, `${rk} — GYM TIER ${Quest.globalTier()}/8`, 'NEXT: ' + next + '   ·   ◄ ► things to do', rows, questMenu.idx, 'quest:', null);
}
function drawCardsMenu(W, H) {
	drawVertical(W, H, H / 480, 'CARDS', 'Your collection, decks, packs, and battles.', cardsItems(), cardsMenu.idx, 'cards');
}
function drawRunMenu(W, H) {
	drawVertical(W, H, H / 480, 'DUNGEON RUN', 'Pick a run mode.', runModeItems(), runMenu.idx, 'run');
}
function drawFriendsMenu(W, H) {
	const u = H / 480;
	const sub = friendsChallenge.mode ? 'Choose a friend to challenge.'
		: `Your code: ${mpAccount?.friendCode || '……'} — add friends and visit their world.`;
	menuChrome(W, H, u, 'FRIENDS', sub);
	// row 0: add friend; row 1: the inbox (challenges + trade offers waiting)
	const bd = friendsMenu.badges;
	const waiting = bd ? bd.ch + bd.tr : 0;
	const rows = [
		{ id: 'friend:0', label: '+ ADD FRIEND BY CODE', sub: '' },
		{
			id: 'friend:1',
			label: `INBOX${waiting ? `  (${waiting}!)` : ''}`,
			sub: bd == null ? 'checking…' : waiting
				? [bd.ch ? `${bd.ch} battle challenge${bd.ch === 1 ? '' : 's'}` : '', bd.tr ? `${bd.tr} trade offer${bd.tr === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')
				: 'no challenges or trade offers waiting',
		},
	];
	friends.forEach((f, i) => rows.push({
		id: 'friend:' + (i + 2),
		label: f.username + (f.online ? '  ●' : '  ○'),
		sub: f.online ? (friendsChallenge.mode ? 'tap to challenge' : `in ${f.map || 'their world'} — tap to visit`) : 'offline — tap to offer a trade',
		online: f.online,
	}));
	rows.forEach((r, i) => {
		const b = { id: r.id, x: 24 * u, y: (78 + i * 52) * u, w: W - 48 * u, h: 46 * u,
			label: r.label, sub: r.sub, kbSel: friendsMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === r.id || friendsMenu.idx === i, u);
	});
	if (!friends.length) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText('No friends yet — share your code!', 24 * u, (78 + 60) * u);
	}
}

// taps route into the same state + key logic the keyboard uses
function menuTap(id) {
	const [kind, a, b2] = id.split(':');
	if (kind === 'close') { pressKey('Escape'); pressKey('x'); return; }
	if (kind === 'party') { if (!partyMenu.action) { partyMenu.idx = +a; pressKey('z'); } return; }
	if (kind === 'pact') { if (partyMenu.action) { partyMenu.action.idx = +a; pressKey('z'); } return; }
	if (kind === 'take') {
		const mon = party[+a];
		if (mon?.heldItem) {
			Bag.addItem(mon.heldItem);
			mon.heldItem = null;
			saveParty(party);
		}
		return;
	}
	if (kind === 'region') { starterMenu.row = +a; pressKey('z'); return; }
	if (kind === 'starterpick') { starterMenu.col = +a; pressKey('z'); return; }
	if (kind === 'buy' || kind === 'sell') { shopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'shopmode') { if (shopMenu.mode !== a) { shopMenu.mode = a; shopMenu.idx = 0; } return; }
	if (kind === 'shopscroll') { pressKey(+a > 0 ? 'ArrowDown' : 'ArrowUp'); return; }
	if (kind === 'sail') { ferryMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'portal') { portalMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'bp') { bpShopMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'item') { bagMenu.idx = +a; bagMenu.picking = false; bagMenu.forget = null; pressKey('z'); return; }
	if (kind === 'use') { bagMenu.pickIdx = +a; pressKey('z'); return; }
	if (kind === 'forget') { if (bagMenu.forget) bagMenu.forget.idx = +a; pressKey('z'); return; }
	if (kind === 'mail') { mailMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'pcp') { pcMenu.side = 0; pcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'gc') { gcMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'vf') { if (vfMenu.game?.phase === 'play') vfMenu.cur = +a; pressKey('z'); return; }
	if (kind === 'pcb') {
		pcMenu.side = 1;
		pcMenu.idx = +a;
		pressKey(pcMenu.releaseMode ? 'r' : 'z'); // release mode arms the confirm instead of withdrawing
		return;
	}
	if (kind === 'pcnav') {
		if (a === 'yes') { pressKey('z'); return; }
		if (a === 'no') { pressKey('x'); return; }
		if (a === 'sort') { pressKey('s'); return; }
		if (a === 'rel') { pcMenu.releaseMode = !pcMenu.releaseMode; return; }
		if (a === 'find') {
			// tapping CLEAR drops the filter without a prompt; FIND asks for one
			if (pcMenu.filter) { pcMenu.filter = null; pcMenu.idx = 0; pcMenu.flash = 'Search cleared.'; }
			else pressKey('f');
			return;
		}
		pcMenu.side = 1;
		pressKey(a === 'prev' ? 'ArrowLeft' : 'ArrowRight');
		return;
	}
	if (kind === 'start') { startMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'trade') { trade.idx = +a; pressKey('z'); return; }
	if (kind === 'player') { playerMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'deck') { deckSelect.idx = +a; pressKey('z'); return; }
	if (kind === 'cards') { cardsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'run') { runMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'friend') { friendsMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'deco') { decoMenu.idx = +a; decoKey('z'); return; }
	if (kind === 'soc' || kind === 'socm') { socialMenu.idx = +a; socialKey('z'); return; }
	if (kind === 'dex') { dexMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'summary-lead') {
		if (partyMenu.summary && partyMenu.idx > 0) { const [m] = party.splice(partyMenu.idx, 1); party.unshift(m); partyMenu.idx = 0; saveParty(party); }
		return;
	}
	if (kind === 'townreg') { townMap.region = +a; townMap.idx = 0; townMap.flash = null; return; }
	if (kind === 'town') { townMap.idx = +a; townMap.flash = null; return; }
	if (kind === 'townfly') { pressKey('z'); return; }
	if (kind === 'dc') { daycareMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'dcdep') { daycareMenu.idx = +a; pressKey('z'); return; }
	if (kind === 'nr') { nameRater.idx = +a; pressKey('z'); return; }
	if (kind === 'ms') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'mspick') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'msdel') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'msrel') { moveShop.idx = +a; pressKey('z'); return; }
	if (kind === 'ct' || kind === 'ctr' || kind === 'ctm' || kind === 'ctmv') { contestMenu.idx = +a; contestKey('z'); return; }
	if (kind === 'ct-next') { contestKey('z'); return; }
	if (kind === 'bb' || kind === 'bbf') { blendMenu.idx = +a; blendKey('z'); return; }
	if (kind === 'opt') { optionsMenu.idx = +a; Settings.cycle(OPTION_KEYS[+a], 1); syncBgmVolume(); return; }
	if (kind === 'optact') { optionsMenu.idx = OPTION_KEYS.length + (+a); runSaveAction(OPTION_ACTIONS[+a]?.id); return; }
	if (kind === 'ctl') { optionsMenu.idx = +a; optionsKey('z'); return; }
	if (kind === 'bkp') {
		const i = +a;
		if (i >= (optionsMenu.list || []).length) { optionsMenu.mode = 'main'; optionsMenu.idx = 0; optionsMenu.flash = null; }
		else restoreBackup(optionsMenu.list[i]);
		return;
	}
}
const anyMenuOpen = () => partyMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || starterMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open || startMenu.open || playerMenu.open || deckSelect.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open || daycareMenu.open || nameRater.open || moveShop.open || optionsMenu.open || questMenu.open || tradeMenu.open;

// ---------- live PvP battles ----------
// build a self-contained party snapshot the PvP engine can resolve without
// any of our client-only data (move power/type/category baked in)
function pvpParty() {
	if (!party || !battle.data) return [];
	return party.filter(m => m.curHP > 0).slice(0, 6).map(m => ({
		speciesId: m.speciesId, name: m.name, level: m.level, types: m.types, sprite: m.sprite,
		weightkg: battle.data.species[m.speciesId]?.weightkg || 50, // Low Kick family
		stats: { ...m.stats }, maxHP: m.maxHP, curHP: m.curHP, status: m.status || null,
		moves: m.moves.map(mv => {
			const info = battle.data.moves[mv.id] || {};
			return { id: mv.id, name: mv.name, pp: mv.pp, maxPp: mv.maxPp,
				type: info.type || 'Normal', power: info.power || 0,
				category: info.category || 'Status', acc: info.acc ?? 100, priority: info.priority || 0 };
		}),
	}));
}
// my card deck + class for a live card duel (from the account's saved decks)
async function cardParty() {
	let st;
	try { st = await MP.freshState(); } catch (e) { st = MP.cachedState(); }
	if (!st || !st.decks) return null;
	const saved = localStorage.getItem('magepunk_class_v1') || '';
	const list = Array.isArray(st.decks) ? st.decks : [];
	const valid = list.filter(d => d && Array.isArray(d.cards) && d.cards.length >= 40);
	if (!valid.length) return null;
	const pick = valid.find(d => d.classId === saved) || valid[0];
	return { deck: pick.cards, classId: pick.classId };
}
const goCardDuel = id => { location.href = '/battlecards/?cardpvp=' + encodeURIComponent(id) + '&mp=1'; };

// on boot, offer to rejoin a battle left in progress (e.g. after a refresh).
// Declining forfeits so the opponent isn't left waiting out the abandon timer.
async function checkRejoin() {
	if (!MP_ON) return;
	let data;
	try { data = await MP.call('my-current-match'); } catch (e) { return; }
	if (!data || !data.match) return;
	const { id, type } = data.match;
	const what = type === 'card' ? 'card duel' : 'POKeMON battle';
	dialog.open(`You left a ${what} in progress.  Z=Rejoin  X=Forfeit`, (declined) => {
		if (declined === 'x') { MP.call('leave-match', { id, type }).catch(() => {}); return; }
		if (type === 'card') goCardDuel(id);
		else enterMatch(id, false);
	});
}

// THE PREMIUM COUNTER: the league Centers' clerk sells the high-end goods once
// the JOHTO crown opens the postgame — the money sink JohKanto's outsized
// payouts never had. STATIC stock by design: the dailies system was
// deliberately skipped (standing user call), so no restock timers here.
const PREMIUM_STOCK = ['rarecandy', 'maxpotion', 'maxrevive', 'abilitycapsule',
	'adamantmint', 'modestmint', 'jollymint', 'timidmint', 'carefulmint'];
const PREMIUM_MAPS = new Set(['MAP_INDIGO_PLATEAU_POKECENTER_1F', 'MAP_SILVER_CAVE_POKECENTER_1F']);
function shopStockNow() {
	return PREMIUM_MAPS.has(world.current?.map?.id) && Badges.isChampion('JOHTO')
		? [...Bag.SHOP_STOCK, ...PREMIUM_STOCK] : Bag.SHOP_STOCK;
}

// ---- mail battles (correspondence Pokémon) ----
async function refreshMail() {
	if (!MP_ON) return null;
	try {
		const d = await MP.call('async-list');
		const rows = (d.matches || []).filter(m => m.game === 'pokemon');
		mailWaiting = rows.filter(m => m.yourTurn || m.yourInvite).length;
		mailMenu.rows = rows;
		return rows;
	} catch (e) { return null; }
}
async function openMailbox() {
	mailMenu.open = true; mailMenu.idx = 0; mailMenu.loading = true;
	await refreshMail();
	mailMenu.loading = false;
}
async function sendMailChallenge(f) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const r = await MP.call('async-create', { to: f.username, game: 'pokemon', party: snap })
		.catch(e => ({ error: e.message || 'could not send' }));
	if (r.error) { dialog.open(r.error); return; }
	await refreshMail();
	dialog.open(`Mail battle sent to ${f.username}!\n\nThey can answer whenever — check MAIL for their reply.`);
}
async function mailAccept(row) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const r = await MP.call('async-accept', { id: row.id, party: snap })
		.catch(e => ({ error: e.message || 'could not accept' }));
	if (r.error) { dialog.open(r.error); return; }
	await refreshMail();
	enterAsyncMatch(row.id);
}
// open a correspondence match in the normal PvP view (async mode)
async function enterAsyncMatch(id) {
	const d = await MP.call('async-get', { id }).catch(() => null);
	if (!d || d.error || !d.match?.pk) { dialog.open('That mail battle is not ready yet.'); return; }
	mailMenu.open = false;
	await pvp.start(id, d.match.pk, d.you, false, () => { refreshMail(); }, { async: true });
}
function mailKey(k) {
	const rows = mailMenu.rows;
	const n = rows.length + 1; // + CLOSE
	if (k === 'ArrowUp') mailMenu.idx = (mailMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') mailMenu.idx = (mailMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { mailMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		if (mailMenu.idx >= rows.length) { mailMenu.open = false; return; }
		const row = rows[mailMenu.idx];
		if (!row) return;
		if (row.yourInvite) { mailAccept(row); return; }
		if (row.status === 'invited') { dialog.open(`Waiting for ${row.players.find(p => p !== mpAccount?.username)} to accept.`); return; }
		enterAsyncMatch(row.id);
	}
}
function drawMailMenu(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'MAIL BATTLES', mailMenu.loading ? 'Checking the mailbox…'
		: mailWaiting ? `${mailWaiting} waiting on you.` : 'Battle a turn at a time — no need to both be online.');
	const me = mpAccount?.username;
	const rows = mailMenu.rows.map((m, i) => {
		const opp = m.players.find(p => p !== me) || '?';
		const sub = m.status === 'over'
			? (m.winner == null ? 'cancelled' : m.winner === me ? 'you won!' : `${opp} won`)
			: m.yourInvite ? 'they challenged you — tap to accept'
			: m.status === 'invited' ? 'waiting for them to accept'
			: m.yourTurn ? `YOUR MOVE — turn ${m.turnNumber}`
			: `waiting on ${opp} — turn ${m.turnNumber}`;
		return { id: 'mail:' + i, label: `vs ${opp}`, sub };
	});
	rows.push({ id: 'mail:' + mailMenu.rows.length, label: 'CLOSE', sub: '' });
	if (!mailMenu.rows.length && !mailMenu.loading) {
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
		sctx.fillText('No mail battles — challenge a friend with MAIL BATTLE.', 24 * u, 300 * u);
	}
	rows.forEach((r, i) => {
		const b = { id: r.id, x: 24 * u, y: (78 + i * 52) * u, w: W - 48 * u, h: 46 * u,
			label: r.label, sub: r.sub, kbSel: mailMenu.idx === i };
		menuUi.push(b);
		BUI.button(sctx, b, menuHover === r.id || mailMenu.idx === i, u);
	});
}

let pendingChallengeTo = null; // username we challenged, polling for accept
async function sendChallenge(f) {
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	await MP.call('challenge', { to: f.username, battleType: 'pokemon', party: snap });
	pendingChallengeTo = f.username;
	dialog.open(`Challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
}
async function sendCardChallenge(f) {
	// deck-selection phase: pick which deck to bring, then send the challenge
	openDeckSelect('Pick a deck to battle with', async (picked) => {
		await MP.call('challenge', { to: f.username, battleType: 'card',
			party: { deck: picked.deck, classId: picked.classId, commander: picked.commander || null, companion: picked.companion || null } });
		pendingChallengeTo = f.username;
		dialog.open(`Card battle challenge sent to ${f.username}!\n\nWaiting for them to accept…`);
	});
}
// ---- trade: request → the other player accepts → both offer/lock/confirm ----
async function startTrade(f) {
	try { await MP.call('challenge', { to: f.username, battleType: 'trade' }); }
	catch (e) { dialog.open('Could not send a trade request.'); return; }
	dialog.open(`Trade request sent to ${f.username}!\n\nWaiting for them to accept…`);
	const t0 = Date.now();
	const wait = setInterval(async () => {
		if (Date.now() - t0 > 60000 || trade.open) { clearInterval(wait); return; }
		try {
			const r = await MP.call('trade-mine');
			if (r && r.tradeId) { clearInterval(wait); openTradeWindow(r.tradeId, 'a', f.username); }
		} catch (e) {}
	}, 1200);
}
function openTradeWindow(id, role, them) {
	Object.assign(trade, {
		open: true, id, role, them: them || 'PLAYER', mine: emptyOffer(), theirs: emptyOffer(),
		myAccept: false, theirAccept: false, done: false, applied: false, cat: 0, idx: 0,
		status: 'Add items with Z. Press ACCEPT when ready.',
	});
	rebuildTradeRows();
	if (trade.poll) clearInterval(trade.poll);
	trade.poll = setInterval(tradePoll, 800);
}
function closeTrade() {
	if (trade.poll) clearInterval(trade.poll);
	trade.poll = null; trade.open = false; trade.id = null;
}
async function cancelTrade() {
	const id = trade.id;
	closeTrade();
	if (id) { try { await MP.call('trade-cancel', { id }); } catch (e) {} }
}
async function toggleAccept() {
	trade.myAccept = !trade.myAccept;
	try { const r = await MP.call('trade-lock', { id: trade.id, accepted: trade.myAccept }); if (r.trade) ingestTrade(r.trade); }
	catch (e) {}
}
// build the browsable inventory rows for the current category, plus offer/accept/cancel rows
function rebuildTradeRows() {
	const cat = TRADE_CATS[trade.cat], rows = [];
	if (cat === 'CARDS') {
		const coll = (MP.cachedState() || {}).collection || {};
		for (const [id, n] of Object.entries(coll)) {
			const off = trade.mine.cards[id] || 0;
			if (n > 0 || off) rows.push({ kind: 'card', id, label: prettyId(id), owned: n, off });
		}
		rows.sort((a, b) => a.label.localeCompare(b.label));
	} else if (cat === 'PACKS') {
		const st = MP.cachedState() || {};
		rows.push({ kind: 'pack', id: 'pack', label: 'Card Pack', owned: st.packs || 0, off: trade.mine.packs });
	} else if (cat === 'POKeMON') {
		party.forEach((m, i) => rows.push({ kind: 'mon', src: 'party:' + i, label: `${m.name} Lv.${m.level}`, mon: m,
			off: trade.mine.pokemon.some(o => o._src === 'party:' + i) ? 1 : 0 }));
		getBox().forEach((m, i) => rows.push({ kind: 'mon', src: 'box:' + i, label: `${m.name} Lv.${m.level} (box)`, mon: m,
			off: trade.mine.pokemon.some(o => o._src === 'box:' + i) ? 1 : 0 }));
	} else if (cat === 'ITEMS') {
		const bag = Bag.getBag();
		for (const [id, n] of Object.entries(bag)) {
			const off = (trade.mine.items.find(it => it.id === id) || {}).count || 0;
			if (n > 0 || off) rows.push({ kind: 'item', id, label: Bag.nameOf(id), owned: n, off });
		}
	}
	rows.push({ kind: 'accept', label: trade.myAccept ? '✓ ACCEPTED (Z to unaccept)' : 'ACCEPT OFFER' });
	rows.push({ kind: 'cancel', label: 'CANCEL TRADE' });
	trade.rows = rows;
	if (trade.idx >= rows.length) trade.idx = Math.max(0, rows.length - 1);
}
function offerAdd(r) {
	if (r.kind === 'card') { if ((trade.mine.cards[r.id] || 0) < r.owned) trade.mine.cards[r.id] = (trade.mine.cards[r.id] || 0) + 1; }
	else if (r.kind === 'pack') { if (trade.mine.packs < r.owned) trade.mine.packs++; }
	else if (r.kind === 'mon') {
		if (r.off) trade.mine.pokemon = trade.mine.pokemon.filter(o => o._src !== r.src);
		else { const snap = JSON.parse(JSON.stringify(r.mon)); snap._src = r.src; trade.mine.pokemon.push(snap); }
	} else if (r.kind === 'item') {
		const it = trade.mine.items.find(i => i.id === r.id);
		if ((it?.count || 0) < r.owned) { if (it) it.count++; else trade.mine.items.push({ id: r.id, count: 1 }); }
	} else return;
	afterOfferChange();
}
function offerRemove(r) {
	if (r.kind === 'card' && trade.mine.cards[r.id]) { if (--trade.mine.cards[r.id] <= 0) delete trade.mine.cards[r.id]; }
	else if (r.kind === 'pack' && trade.mine.packs > 0) trade.mine.packs--;
	else if (r.kind === 'mon' && r.off) trade.mine.pokemon = trade.mine.pokemon.filter(o => o._src !== r.src);
	else if (r.kind === 'item') { const it = trade.mine.items.find(i => i.id === r.id); if (it && --it.count <= 0) trade.mine.items = trade.mine.items.filter(i => i.id !== r.id); }
	else return;
	afterOfferChange();
}
function afterOfferChange() {
	trade.myAccept = false; trade.theirAccept = false; // any change unlocks both
	rebuildTradeRows();
	MP.call('trade-offer', { id: trade.id, offer: trade.mine }).then(r => r.trade && ingestTrade(r.trade)).catch(() => {});
}
async function tradePoll() {
	if (!trade.open || !trade.id) return;
	try {
		const r = await MP.call('trade-poll', { id: trade.id });
		if (r.gone) { trade.status = 'Trade ended.'; setTimeout(closeTrade, 900); return; }
		if (r.trade) ingestTrade(r.trade);
	} catch (e) {}
}
function ingestTrade(t) {
	if (!t) return;
	trade.theirs = trade.role === 'a' ? t.offerB : t.offerA;
	trade.myAccept = trade.role === 'a' ? t.acceptA : t.acceptB;
	trade.theirAccept = trade.role === 'a' ? t.acceptB : t.acceptA;
	if (t.cancelled) { trade.status = 'The other player cancelled.'; setTimeout(closeTrade, 1200); return; }
	if (t.done && !trade.applied) { trade.applied = true; trade.done = true; applyTradeSwap(t); trade.status = 'Trade complete!'; if (trade.poll) { clearInterval(trade.poll); trade.poll = null; } }
	else if (!t.done) trade.status = trade.theirAccept ? 'They accepted — you accept to seal it.' : (trade.myAccept ? 'Waiting for them to accept…' : 'Add items, then ACCEPT.');
	rebuildTradeRows();
}
// apply my half of a completed swap: cards/packs were moved server-side (just
// refresh), Pokemon and bag items are local so I remove what I gave + add what I got
function applyTradeSwap(t) {
	const gave = trade.role === 'a' ? t.offerA : t.offerB;
	const got = trade.role === 'a' ? t.offerB : t.offerA;
	const partyRm = new Set(), boxRm = new Set();
	for (const m of (gave.pokemon || [])) {
		const [z, i] = String(m._src || '').split(':');
		if (z === 'party') partyRm.add(+i); else if (z === 'box') boxRm.add(+i);
	}
	for (let i = party.length - 1; i >= 0; i--) if (partyRm.has(i)) party.splice(i, 1);
	if (boxRm.size) setBox(getBox().filter((_, i) => !boxRm.has(i)));
	if (got.pokemon && got.pokemon.length) {
		const nb = getBox();
		for (const m of got.pokemon) { const c = { ...m }; delete c._src; nb.push(c); }
		setBox(nb);
	}
	for (const it of (gave.items || [])) for (let n = 0; n < (it.count | 0); n++) Bag.consume(it.id);
	for (const it of (got.items || [])) Bag.addItem(it.id, it.count | 0);
	saveParty(party);
	MP.freshState().catch(() => {}); // pull the updated card collection / packs
}
function tradeKey(k) {
	if (trade.done) { if (k === 'z' || k === 'x' || k === 'Enter' || k === 'Escape') closeTrade(); return; }
	const rows = trade.rows; if (!rows.length) return;
	if (k === 'ArrowUp') trade.idx = (trade.idx + rows.length - 1) % rows.length;
	else if (k === 'ArrowDown') trade.idx = (trade.idx + 1) % rows.length;
	else if (k === 'ArrowLeft') { trade.cat = (trade.cat + TRADE_CATS.length - 1) % TRADE_CATS.length; trade.idx = 0; rebuildTradeRows(); }
	else if (k === 'ArrowRight') { trade.cat = (trade.cat + 1) % TRADE_CATS.length; trade.idx = 0; rebuildTradeRows(); }
	else if (k === 'z' || k === 'Enter') {
		const r = rows[trade.idx]; if (!r) return;
		if (r.kind === 'accept') toggleAccept();
		else if (r.kind === 'cancel') cancelTrade();
		else offerAdd(r);
	} else if (k === 'x' || k === 'Escape') {
		const r = rows[trade.idx];
		if (r && (r.kind === 'card' || r.kind === 'pack' || r.kind === 'mon' || r.kind === 'item')) offerRemove(r);
		else cancelTrade();
	}
}
const prettyId = id => String(id).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
async function pollChallenges() {
	if (!MP_ON || pvp.blocking) return;
	// did a friend accept our challenge?
	if (pendingChallengeTo) {
		try {
			const mm = await MP.call('my-match');
			if (mm.matchId) {
				pendingChallengeTo = null;
				if (mm.type === 'card') { goCardDuel(mm.matchId); return; }
				enterMatch(mm.matchId, false); return;
			}
		} catch (e) {}
	}
	if (anyMenuOpen() || battle.blocking) return;
	// fetch the freshest incoming challenge every tick
	let ch = null;
	try { const data = await MP.call('challenges'); ch = (data.challenges || [])[0] || null; }
	catch (e) { return; }
	if (incomingChallenge) {
		// a challenge dialog is already up — refresh it if the pending challenge
		// changed type or sender (e.g. they switched a POKeMON challenge to a
		// card one), so we can never accept the wrong kind of battle
		if (ch && (ch.from !== incomingChallenge.from || ch.type !== incomingChallenge.type)
			&& !deckSelect.open && !trade.open) { incomingChallenge = ch; showIncoming(ch); }
		return;
	}
	if (ch && !dialog.blocking && !deckSelect.open && !trade.open) { incomingChallenge = ch; showIncoming(ch); }
}
let incomingChallenge = null;
function showIncoming(ch) {
	const label = ch.type === 'trade' ? `${ch.from} wants to TRADE!`
		: ch.type === 'card' ? `${ch.from} challenges you to a CARD battle!`
		: `${ch.from} challenges you to a POKeMON battle!`;
	dialog.open(`${label}  Z=Accept  X=Decline`, async (declined) => {
		const c = incomingChallenge; incomingChallenge = null;
		if (!c) return;
		if (declined === 'x') { await MP.call('decline-challenge', { from: c.from }); return; }
		await acceptChallengeFrom(c.from);
	});
}
// Accept whatever <from> is actually offering RIGHT NOW. We re-read the stored
// challenge type instead of trusting the (possibly stale) dialog, so a challenge
// that changed type between display and accept still launches the correct battle.
async function acceptChallengeFrom(from) {
	let type;
	try {
		const data = await MP.call('challenges');
		const cur = (data.challenges || []).find(c => c.from === from);
		if (!cur) { dialog.open('That challenge is no longer available.'); return; }
		type = cur.type;
	} catch (e) { dialog.open('Could not reach the server.'); return; }
	if (type === 'trade') {
		try { const r = await MP.call('trade-accept', { from }); if (r && r.tradeId) openTradeWindow(r.tradeId, 'b', from); else dialog.open((r && r.error) || 'Trade could not start.'); }
		catch (e) { dialog.open('Trade could not start.'); }
		return;
	}
	if (type === 'card') {
		// deck-selection phase before accepting the duel
		openDeckSelect('Pick a deck to battle with', async (picked) => {
			const data = await MP.call('accept-challenge', { from, battleType: 'card',
				party: { deck: picked.deck, classId: picked.classId, commander: picked.commander || null, companion: picked.companion || null } });
			if (data.error) { dialog.open(data.error); return; }
			goCardDuel(data.matchId);
		});
		return;
	}
	// pokemon
	const snap = pvpParty();
	if (!snap.length) { dialog.open('Your POKeMON need to be healthy to battle!'); return; }
	const data = await MP.call('accept-challenge', { from, party: snap });
	if (data.error) { dialog.open(data.error); return; }
	if (data.cardmatch) { goCardDuel(data.matchId); return; } // backend says it's a card duel
	enterMatch(data.matchId, false, data.match, sideOfMe(data.match));
}
function sideOfMe(match) {
	return match.sides.findIndex(sd => sd.name === (mpAccount?.username));
}
async function enterMatch(matchId, spectator, matchObj, side) {
	let match = matchObj;
	if (!match) {
		const data = await MP.call('match', { id: matchId });
		if (data.error) { dialog.open(data.error); return; }
		match = data.match; side = data.side;
	}
	if (side == null) side = sideOfMe(match);
	// live PvP is non-persistent (link-battle style): the battle runs on a party
	// snapshot, so damage/fainting never carries back to your overworld team.
	await pvp.start(matchId, match, side, spectator, () => { heartbeat(); });
	// tell friends I'm battling (so they can spectate)
	if (MP_ON) MP.call('heartbeat', { map: world.current.name, x: player.tx, y: player.ty, facing: player.facing, status: 'battling:' + matchId, region: world.current.map.name || '' });
}

// ---------- multiplayer presence & visiting ----------
let friendSprite = null; // green_normal.png, loaded lazily for friend ghosts
getImage('data/sprites/green_normal.png').then(img => { friendSprite = img; }).catch(() => {});
// every friend currently standing on my map, rendered as a live ghost
const ghosts = new Map(); // username -> { tx, ty, facing, px, py }

// broadcast my position; fast when co-located so neighbours see me move
async function heartbeat() {
	if (!MP_ON || loading) return;
	try {
		await MP.call('heartbeat', {
			map: world.current.name, x: player.tx, y: player.ty,
			facing: player.facing,
			status: pvp.blocking ? 'battling:' + (pvp.active?.matchId || '')
				: frontier.active ? 'factory:' + (frontier.cfg?.name || 'BATTLE FRONTIER')
					: visiting ? 'visiting:' + visiting.username : 'roaming',
			region: frontier.active ? (frontier.cfg?.name || '') : (world.current.map.name || ''),
		});
	} catch (e) {}
}

// load a friend's current map at their position and follow them live
async function visitWorld(f) {
	const data = await MP.call('presence', { username: f.username });
	const p = data.presence;
	if (!p || !p.map) { dialog.open(`${f.username} isn't roaming right now.`); return; }
	const file = world.fileFor(p.map) || p.map;
	visiting = { username: f.username };
	await moveToMap(file, p.x, p.y);
	heartbeat();
	dialog.open(`You warped into ${f.username}'s world!\n\nPress START and pick EXIT to return home.`);
}
async function leaveVisit() {
	visiting = null;
	ghosts.clear();
	const home = safeLoad(POS_KEY, null);
	await moveToMap(home?.map ? (world.fileFor(home.map) || home.map) : 'PalletTown', home?.x, home?.y);
}

// one poll of every friend's presence: update ghosts for those on my map,
// follow a visited friend across maps, drop friends who left
async function pollPresence() {
	if (!MP_ON || pvp.blocking) return;
	try {
		const data = await MP.call('friends');
		if (data.friends) friends = data.friends;
		const here = new Set();
		for (const f of friends) {
			if (visiting && f.username === visiting.username) {
				if (!f.online) { dialog.open(`${visiting.username} went offline. Returning home…`); await leaveVisit(); return; }
				const theirFile = world.fileFor(f.map) || f.map;
				if (f.map && theirFile !== world.current.name && !loading) { await moveToMap(theirFile, f.x, f.y); }
			}
			if (f.online && f.map === world.current.name) {
				here.add(f.username);
				let g = ghosts.get(f.username);
				if (!g) g = { px: f.x * META, py: f.y * META, path: [], facing: f.facing || 'down', missed: 0 };
				g.missed = 0;
				g.facingReported = f.facing || 'down';
				// waypoint queue: append each newly-reported tile; the draw loop walks
				// the ghost along the queue at a constant speed instead of snapping
				const last = g.path.length ? g.path[g.path.length - 1] : { x: Math.round(g.px / META), y: Math.round(g.py / META) };
				if (f.x !== last.x || f.y !== last.y) {
					g.path.push({ x: f.x, y: f.y });
					if (g.path.length > 6) g.path.splice(0, g.path.length - 6); // too far behind: skip ahead
				}
				ghosts.set(f.username, g);
			}
		}
		// grace period: one missed poll can be a warp/heartbeat gap — deleting
		// instantly made ghosts flicker ("glimpsed him every few frames")
		for (const [u, g] of ghosts) {
			if (!here.has(u) && ++g.missed >= 3) ghosts.delete(u);
		}
	} catch (e) {}
}

// true when someone is (or could be) sharing my screen — drives fast polling
function coLocated() {
	return ghosts.size > 0 || !!visiting
		|| friends.some(f => f.online && (f.map === world.current.name || (f.status || '').startsWith('visiting:')));
}

// draw every friend ghost on my map, walking it along its waypoint queue at a
// constant speed (like a real player) instead of ease-snapping to the last tile
let ghostClock = 0;
function drawFriendGhosts(ctx, camX, camY) {
	if (!friendSprite || !ghosts.size) return;
	const now = performance.now();
	const dt = ghostClock ? Math.min((now - ghostClock) / 1000, 0.1) : 0.016;
	ghostClock = now;
	for (const [name, g] of ghosts) {
		// catch-up speed scales with backlog: walk pace when current, run pace when
		// 2+ tiles behind, so a sprinting friend stays smooth instead of teleporting
		const speed = 120 * (g.path.length >= 2 ? 1.9 : 1.15);
		let budget = speed * dt;
		let moving = false;
		while (budget > 0 && g.path.length) {
			const wp = g.path[0];
			const dx = wp.x * META - g.px, dy = wp.y * META - g.py;
			const dist = Math.hypot(dx, dy);
			if (dist <= budget) { g.px = wp.x * META; g.py = wp.y * META; g.path.shift(); budget -= dist; }
			else {
				g.px += (dx / dist) * budget; g.py += (dy / dist) * budget; budget = 0;
			}
			// face the way we're travelling; fall back to the reported facing at rest
			g.facing = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
			moving = true;
		}
		if (!moving) g.facing = g.facingReported || g.facing || 'down';
		const bob = moving && Math.floor(now / 150) % 2 ? -1 : 0; // subtle step bob
		const mirror = g.facing === 'right';
		const frameX = { down: 0, up: 1, left: 2, right: 2 }[g.facing] * 16;
		ctx.save();
		const x = Math.round(g.px - camX), y = Math.round(g.py - 16 - camY + bob);
		if (mirror) { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.globalAlpha = 0.92;
		ctx.drawImage(friendSprite, frameX, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
		ctx.fillStyle = '#fff';
		ctx.font = '6px monospace';
		ctx.textAlign = 'center';
		ctx.fillText(name.slice(0, 8), Math.round(g.px - camX) + 8, Math.round(g.py - 18 - camY));
		ctx.textAlign = 'left';
	}
}

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
	trainerTeams = await getJSON('data/trainer_teams.json').catch(() => ({}));
	commonStrings = await getJSON('data/strings/_common.json').catch(() => ({}));
	// the shared bodies, and the text they speak — an unstringed msg falls through
	// to printing its own label, so the two have to arrive together
	{
		const sh = await getJSON('data/shared_scripts.json').catch(() => null);
		if (sh) { sharedScripts = sh.scripts || {}; commonStrings = { ...(sh.strings || {}), ...commonStrings }; }
	}
	await hydrateOw(); // server-authoritative: refresh starter/region/position from D1 before reading them
	party = loadParty(battle.data);
	// standalone Battle Factory mini-game (?factory=1): no save/party needed (it
	// battles with rentals). Suppress the region picker; the post-boot hook warps to
	// the Factory and provisions a throwaway lead just before starting.
	factoryStandalone = new URLSearchParams(location.search).has('factory');
	if (party) { Dex.seedFrom([...party, ...getBox()]); dexMilestoneCheck(); }
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
	if (!party && !factoryStandalone && !alreadyBegun) {
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
	hud.textContent = world.current.map.name || startMap;
	markFlyPoint(world.current.map.id);
	loading = false;
	runMapTransition();
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
	if (!battleResumed && party && !Story.getFlag('intro_done')) {
		console.warn('[intro-heal] party without intro_done — completing the intro');
		afterRival(playerRegion());
	}
	// Resuming mid-intro — region chosen, starter not yet collected. The lab
	// trigger (checkIntroTrigger) still fires when they walk in, so the only gap is
	// a player who reloaded before hearing where to go. Replay the professor's
	// welcome for them; it self-terminates by setting `intro_started`, so anyone
	// who already heard it is left alone.
	if (!party && !factoryStandalone && alreadyBegun && !Story.getFlag('intro_started') && !cutscene.blocking) {
		startIntroNarration(playerRegion());
	}
	// headless test hook
	// test hook: drive the player straight, bypassing the game loop's input
	function freezeLoop(on) { loading = !!on; }
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
		mpAccount = MP.cachedState() || await MP.freshState();
		hud.textContent = `${world.current.map.name || startMap}  ·  ${mpAccount?.username || ''} (${mpAccount?.friendCode || '……'})`;
		// adaptive presence: ~450ms when someone shares the map (minimal
		// latency for side-by-side screens), ~1.8s when roaming alone
		const beatLoop = () => heartbeat().finally(() => setTimeout(beatLoop, coLocated() ? 450 : 1800));
		const presLoop = () => pollPresence().finally(() => setTimeout(presLoop, coLocated() ? 400 : 1400));
		beatLoop();
		presLoop();
		setInterval(pollChallenges, 2000);
		refreshMail(); // seed the MAIL badge, then keep it fresh at a gentle cadence
		setInterval(refreshMail, 45_000);
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
		if (watchFactory) factorySpec.start(watchFactory, () => { if (history.length > 1) history.back(); else location.href = '/overworld/?mp=1'; });
		else if (watchBattle) enterMatch(watchBattle, true);
		else if (directBattle) enterMatch(directBattle, false);
		else checkRejoin();
	}
	window.__ow = { world, player, warpTo, moveToMap, npcs, encounters, battle, trainers, dialog, evolution, items, tmMoveId, canLearn, pcMenu, get fade() { return fade; }, get weatherFx() { return weatherFx; }, get stepFx() { return stepFx; }, mapWeatherNow, get party() { return party; }, get menuUi() { return menuUi; }, menuTap, pumpPlayer, freezeLoop, startWildBattle, interact,
		get startMenu() { return startMenu; }, get cardsMenu() { return cardsMenu; }, get runMenu() { return runMenu; }, get friendsMenu() { return friendsMenu; },
		get friends() { return friends; }, get visiting() { return visiting; }, refreshFriends, visitWorld, leaveVisit, heartbeat, pollPresence, get ghosts() { return ghosts; }, MP_ON,
		get pvp() { return pvp; }, pvpParty, sendChallenge, enterMatch, pollChallenges, get pending() { return pendingChallengeTo; },
		get mailMenu() { return mailMenu; }, get mailWaiting() { return mailWaiting; }, refreshMail, sendMailChallenge, mailAccept, enterAsyncMatch,
		Dex, get dexMenu() { return dexMenu; }, get trainerCard() { return trainerCard; }, get partyMenu() { return partyMenu; }, get shopMenu() { return shopMenu; }, get bagMenu() { return bagMenu; }, Bag,
		Fly, get townMap() { return townMap; }, openTownMap, flyTo, hasFlyPoint, markFlyPoint, Clock,
		Trades, get tradeMenu() { return tradeMenu; }, startNpcTrade,
		Daycare, get daycareMenu() { return daycareMenu; }, get nameRater() { return nameRater; }, get moveShop() { return moveShop; },
		openDaycare, openNameRater, openMoveShop, setNickname, relearnable,
		Settings, get optionsMenu() { return optionsMenu; },
		Journal, Savefile, runSaveAction, loadBackups, restoreBackup, OPTION_ACTIONS, OPTION_KEYS, OW_KEYS, repelWoreOff, setRepel, drawOptions,
		Contest, get contestMenu() { return contestMenu; }, get blendMenu() { return blendMenu; }, contestKey, blendKey, drawContest, drawBlend, contestProgress, blendBerries,
		get bugContest() { return bugContest; }, bugOfficerTalk, bugContestCatch, bugContestRoll, bugScore, endBugContest, isBugDay,
		trickState, trickWarp, trickScrollFind, trickMasterTalk, trickEndTalk, Slide, get slideMenu() { return slideMenu; }, openRuinsPuzzle, slideKey, drawSlide,
		shoalTide, shoalWarp, shoalDig, shoalHermitTalk, kurtTalk, roamState, roamersOnMapChange, roamerHere, startRoamerBattle, roamerEnd, ROAMERS, ROAM_ROUTES,
		myBase, saveMyBase, baseSpotKey, baseRoomFor, secretSpotInteract, enterBase, baseDecoInteract, get baseCtx() { return baseCtx; }, set baseCtx(v) { baseCtx = v; },
		get decoMenu() { return decoMenu; }, decoKey, drawDecoMenu, drawBaseDeco, DECO_ITEMS,
		get socialMenu() { return socialMenu; }, socialKey, drawSocial, openTradeOffer, openTradeInbox, sendTradeOffer, acceptTrade, declineTrade, claimTradeDeliveries,
		friendsKey, drawFriendsMenu, refreshFriendBadges, friendAction,
		KEY_ACTIONS, get keyBinds() { return keyBinds; }, translateKey, assignKeyBind, optionsKey,
		Slots, get slotsMenu() { return slotsMenu; }, slotsKey, drawSlots,
		get hillRun() { return hillRun; }, set hillRun(v) { hillRun = v; }, hillReceptionTalk, hillPrizeTalk, hillWarp, hillPrepFloor, hillGuardAt, startHillBattle, hillGuardsLeft, HILL_FLOORS,
		miscEvents, museumBackfill, museumPaintTalk, museumCuratorTalk, drawMuseum, ruinsWordTalk, fossilPick, fossilUnderpassTalk, fossilManiacTalk, generatorTalk, MUSEUM_PAINTINGS, FOSSIL_MONS,
		useGadget, HM_FIELD, dexList, dexKey, HEADBUTT_MAPS, HEADBUTT_SETS,
		toggleBike, bikeShopTalk, glassBlowerTalk, silphDoorsApply, silphDoorAt, SILPH_DOORS, get fluteState() { return fluteState; }, set fluteState(v) { fluteState = v; },
		momTalk, MOM_SCRIPTS, drawWaterAnim,
		Story, get cutscene() { return cutscene; }, startCutscene, npcById, maybeIntroCutscene, starterMenu,
		runScriptLabel, checkCoordTrigger, checkOnFrame, cutsceneCtx, syncStoryVars, seedCrystalEvents,
		postgameObjective, postgameLog, legendStats, shopStockNow, services, pickupCheck, mapWeatherNow,
	get safariState() { return safari; }, checkSafariGate, endSafari,
	gcMenu, vfMenu, VFlip, gcKey, vfKey,
	bgmNow, syncMapBgm, battleThemeKey, bgmGame, get musicMap() { return musicMap; },
	persistBattle, resumeSavedBattle, wildBattleEnd, get mapScripts() { return mapScripts; }, get mapStrings() { return mapStrings; }, get signTexts() { return signTexts; },
		get trainerTeams() { return trainerTeams; }, seedStoryState, startScriptedBattle,
		checkLegendaryTrigger, startLegendaryBattle, LEGENDARY_ENCOUNTERS, legendaryHere, legendariesHere,
		toggleBike, diveTo, HM_FIELD, useFieldMove, openPartyAction, fieldMovesOf,
		Badges, onTrainerDefeated, leagueGateMessage, playerRegion, drawTrainerCard, TIER_REWARDS, grantTierReward,
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
		openRadio, radioKey, drawRadio, get radioMenu() { return radioMenu; }, get radioTune() { return radioTune; }, playerTID, tidStr, oakTalkText, buenaText, luckyText,
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
	try { refreshMail(); setInterval(refreshMail, 120000); } catch (e) { /* logged out */ }
	// keep the server copy of starter/region/position current (deduped ~every 10s + when you leave)
	try {
		setInterval(pushOw, 10000);
		document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pushOw(); });
		window.addEventListener('pagehide', pushOw);
	} catch (e) { /* best-effort */ }
	// standalone mini-game: warp to the Battle Factory (moveToMap is the safe path)
	// and drop straight into a run
	if (factoryStandalone) {
		hud.textContent = 'BATTLE FACTORY';
		if (!party) party = Frontier.genTeam(battle.data, 50, 1); // throwaway lead (guards)
		moveToMap('BattleFrontier_BattleFactoryLobby').then(() => {
			dialog.open('BATTLE FACTORY\n\nYou’ll be lent a team of RENTAL POKeMON.\nWin battles back-to-back to earn BP!\n\nZ = Begin', () => startFacility('factory'));
		});
	}
})();
