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
import * as Settings from './settings.js';
import * as Badges from './badges.js';
import * as Quest from './quest.js';
import { EXTRA_DIVE } from './divelinks.js';
import * as Story from './events.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { statsFor, buildMon as battleBuildMon } from './battle.js';
import * as Frontier from './frontier.js';
import { getImage, drawOwMon } from './engine.js';
import * as BUI from './battleui.js';
import * as MP from '../battlecards/mpmode.js';
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
	objectiveEl.textContent = party ? ('NEXT: ' + Quest.objective(playerRegion())) : '';
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
trainers.spawnFlagged = (ev) => Quest.isDungeonFloor(playerRegion(), world.current.name)
	|| (ev && ev.script === 'Red' && Badges.isChampion('JOHTO') && Badges.count('JOHKANTO') >= 8);

function startTrainerBattle(t, foeParty, info) {
	for (const m of foeParty) Dex.markSeen(m.speciesId);
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
function badgeSliceFor(region) {
	if (region === 'KANTO' && playerRegion() === 'JOHTO' && /^MAP_JOHKANTO/.test(world.current.map.id || '')) return 'JOHKANTO';
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
	1: { money: 1500, items: [['greatball', 5]], label: '$1500 + 5 GREAT BALLS' },
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
	// RED at Mt Silver — the ultimate battle; not a gym/league, so handle it here
	if (script === 'Red') {
		const fresh = !Story.getFlag('beat_red');
		Story.setFlag('beat_red');
		if (fresh) syncOverworldAchievements();
		if (fresh && !(opts && opts.silent)) dialog.open('. . . . . . . . .\n\nRED says nothing, and turns back to the mountain.\n\nYou have bested the strongest trainer of all.');
		return;
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
		// did this badge push the SHARED tier up (i.e. was this the last region to clear it)?
		const tierUp = (earned && Quest.globalTier() > beforeTier) ? Quest.globalTier() : 0;
		refreshLevelCap(); // the cap is a function of the badges; keep the engine in step
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
};
const frontier = { active: false, streak: 0, cfg: null, runParty: null };
// heal a team IN MEMORY without persisting — used between Frontier bouts so the run
// party (which may be generated RENTALS) never overwrites the real saved party
function healTeam(team) {
	for (const m of (team || [])) { if (!m) continue; m.curHP = m.maxHP; m.status = null; for (const mv of m.moves || []) mv.pp = mv.maxPp; }
}
function facLevel(cfg) {
	const base = Math.min(100, Math.max(50, ...((party || []).filter(Boolean).map(m => m.level || 50))));
	if (cfg.level === 50) return 50;
	if (cfg.level === 'party+5') return Math.min(100, base + 5);
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
let loading = true;
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
// standalone Battle Factory mini-game (?factory=1 from the home page): rentals only,
// no save/party needed — and it must never write over a real overworld save
let factoryStandalone = false;
function savePos() {
	if (factoryStandalone) return; // the mini-game never persists position
	safeSave(POS_KEY, { map: world.current.name, x: player.tx, y: player.ty });
}
// Z in front of something: services, talk-to trainers (incl. gym leaders), signs
function interact() {
	if (player.moving || trainers.engaging) return;
	const [dx, dy] = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] }[player.facing];
	const fx = player.tx + dx, fy = player.ty + dy;
	// another player standing on the faced tile — challenge them or offer a trade
	if (MP_ON) { const who = ghostAt(fx, fy); if (who) { playerMenu.open = true; playerMenu.idx = 0; playerMenu.target = who; return; } }
	// item balls / berry trees / hidden items (facing tile, then standing tile)
	const found = items.interactAt(fx, fy) || items.interactAt(player.tx, player.ty);
	if (found) { dialog.open(found); return; }
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
	const svc = services.kindAt(fx, fy);
	if (svc === 'nurse') {
		dialog.open('Welcome to the POKEMON CENTER!\n\nWe restored your POKEMON\nto full health. See you again!', () => healParty(party));
		return;
	}
	if (svc === 'pc') { pcMenu.open = true; pcMenu.side = 0; pcMenu.idx = 0; return; }
	if (svc === 'shop') { shopMenu.open = true; shopMenu.idx = 0; shopMenu.mode = 'buy'; shopMenu.flash = null; return; }
	if (svc === 'ferry') { ferryMenu.open = true; ferryMenu.idx = 0; return; }
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
		if (+ev.x === fx && +ev.y === fy && signTexts[ev.script]) {
			// same normalizer NPC speech uses, so a sign never shows a raw "#"
			dialog.open(Story.normalizeText(signTexts[ev.script], cutsceneCtx()));
			return;
		}
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
		// ported story script for this NPC (dialogue/movement/flags)
		if (npc.ev && npc.ev.script && runScriptLabel(npc.ev.script, npc)) return;
	}
}

// canonical service buildings (talk to the NPC inside to use the service)
const DAYCARE_MAPS = new Set(['MAP_DAY_CARE', 'MAP_ROUTE5_POKEMON_DAY_CARE',
	'MAP_ROUTE117_POKEMON_DAY_CARE', 'MAP_FOUR_ISLAND_POKEMON_DAY_CARE']);
const NAMERATER_MAPS = new Set(['MAP_GOLDENROD_NAME_RATER', 'MAP_JOHKANTO_LAVENDER_NAME_RATER',
	'MAP_SLATEPORT_CITY_NAME_RATERS_HOUSE']);
const DELETER_MAPS = new Set(['MAP_MOVE_DELETERS_HOUSE', 'MAP_LILYCOVE_CITY_MOVE_DELETERS_HOUSE']);

const partyMenu = { open: false, idx: 0, summary: false, action: null };
const startMenu = { open: false, idx: 0 };
const questMenu = { open: false, idx: 0 }; // the main-quest log (read-only list)
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
const trainerCard = { open: false };
const townMap = { open: false, region: 0, idx: 0 };
const optionsMenu = { open: false, idx: 0 };
const OPTION_KEYS = ['textSpeed', 'sound', 'autoRun', 'dayNight', 'followers'];
function optionsKey(k) {
	if (k === 'ArrowUp') optionsMenu.idx = (optionsMenu.idx + OPTION_KEYS.length - 1) % OPTION_KEYS.length;
	if (k === 'ArrowDown') optionsMenu.idx = (optionsMenu.idx + 1) % OPTION_KEYS.length;
	if (k === 'ArrowLeft') Settings.cycle(OPTION_KEYS[optionsMenu.idx], -1);
	if (k === 'ArrowRight' || k === 'z' || k === 'Enter') Settings.cycle(OPTION_KEYS[optionsMenu.idx], 1);
	if (k === 'x' || k === 'Escape') optionsMenu.open = false;
}
const daycareMenu = { open: false, mode: 'main', idx: 0, flash: null };
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
function dexList() {
	if (dexMenu.list) return dexMenu.list;
	const sp = battle.data.species;
	// standard dex (positive nums) first, ascending; fakemon/custom (num <= 0)
	// after, ordered by magnitude so they group sensibly
	const key = n => (n > 0 ? n : 100000 + Math.abs(n || 99999));
	dexMenu.list = Object.keys(sp)
		.map(id => ({ id, num: sp[id].num || 9999, name: sp[id].name }))
		.sort((a, b) => key(a.num) - key(b.num) || a.name.localeCompare(b.name));
	return dexMenu.list;
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
	items.push('BAG', 'TOWN MAP', 'CARD', 'QUEST', 'SAVE', 'OPTION', 'EXIT');
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
		else if (it === 'POKeDEX') { dexMenu.open = true; dexMenu.idx = 0; dexMenu.detail = false; }
		else if (it === 'CARD') { trainerCard.open = true; }
		else if (it === 'QUEST') { questMenu.open = true; questMenu.idx = 0; }
		else if (it === 'TOWN MAP') { openTownMap(); }
		else if (it === 'SAVE') { saveParty(party); savePos(); dialog.open('Your journey has been saved.'); }
		else if (it === 'OPTION') { optionsMenu.open = true; optionsMenu.idx = 0; }
		else if (it === 'EXIT' && visiting) { leaveVisit(); }
		// EXIT just closes
	}
}

function questKey(k) {
	const n = Quest.log(playerRegion()).length;
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
		if (k === 'x' || k === 'Escape') dexMenu.detail = false;
		return;
	}
	if (k === 'ArrowUp') dexMenu.idx = (dexMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown') dexMenu.idx = (dexMenu.idx + 1) % list.length;
	if (k === 'ArrowLeft') dexMenu.idx = Math.max(0, dexMenu.idx - 9);
	if (k === 'ArrowRight') dexMenu.idx = Math.min(list.length - 1, dexMenu.idx + 9);
	if (k === 'z' || k === 'Enter') { if (Dex.isSeen(list[dexMenu.idx].id)) dexMenu.detail = true; }
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
	await refreshFriends();
}
async function refreshFriends() {
	if (!MP_ON) return;
	const data = await MP.call('friends');
	if (data.friends) { friends = data.friends; if (mpAccount) mpAccount.friendCode = data.friendCode; }
}
function friendsKey(k) {
	// rows: [Add friend] then each friend
	const rows = friendsMenu.mode = 1 + friends.length;
	if (k === 'ArrowUp') friendsMenu.idx = (friendsMenu.idx + rows - 1) % rows;
	if (k === 'ArrowDown') friendsMenu.idx = (friendsMenu.idx + 1) % rows;
	if (k === 'x' || k === 'Escape') { friendsMenu.open = false; return; }
	if (k === 'z') {
		if (friendsMenu.idx === 0) { promptAddFriend(); return; }
		const f = friends[friendsMenu.idx - 1];
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
	if (!f.online) { dialog.open(`${f.username} is offline right now.`); return; }
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
	dialog.open(`${f.username}:  Z=Battle challenge  X=Visit world`, (declined) => {
		if (declined === 'x') visitWorld(f);
		else sendChallenge(f);
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
const bagMenu = { open: false, idx: 0, picking: false, pickIdx: 0 };
// side 0 = party (deposit), 1 = box (withdraw). Storage stays ONE flat array
// (trade/dex read it whole); the 8 "boxes" are 30-slot pages over it.
const PC_BOXES = 8, PC_BOX_CAP = 30;
const PC_SORTS = ['dex', 'level', 'shiny', 'name'];
const pcMenu = { open: false, side: 0, idx: 0, box: 0, sort: 'dex', confirm: null, releaseMode: false, flash: null };

function getBox() {
	const b = safeLoad('magepunk_box_v1', []);
	return Array.isArray(b) ? b : [];
}
function setBox(box) {
	safeSave('magepunk_box_v1', box);
}

function shopKey(k) {
	// TAB / left-right flips between BUY and SELL
	if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
		shopMenu.mode = shopMenu.mode === 'buy' ? 'sell' : 'buy';
		shopMenu.idx = 0;
		return;
	}
	const list = shopMenu.mode === 'buy' ? Bag.SHOP_STOCK : sellList();
	const n = Math.max(1, list.length);
	if (k === 'ArrowUp') shopMenu.idx = (shopMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') shopMenu.idx = (shopMenu.idx + 1) % n;
	if (k === 'z' || k === 'Enter') {
		if (shopMenu.mode === 'buy') {
			const id = Bag.SHOP_STOCK[shopMenu.idx];
			shopMenu.flash = Bag.buy(id) ? `Bought ${Bag.ITEMS[id].name}!` : 'Not enough money!';
		} else {
			const entry = sellList()[shopMenu.idx];
			if (entry) {
				const gain = sellPrice(entry.id);
				Bag.consume(entry.id);
				Bag.earn(gain);
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
	if (mon.level >= levelCapNow() || mon.level >= 100 || mon.curHP <= 0) return false;
	mon.level++;
	mon.exp = Math.max(mon.exp ?? 0, mon.level ** 3);
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
	const entries = Object.entries(Bag.getBag()).filter(([, n]) => n > 0);
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
				} else if (item?.kind === 'candy' && useRareCandy(mon)) {
					Bag.consume(id);
					bagMenu.picking = false;
				} else if (item?.kind === 'candy' && mon.level >= levelCapNow() && mon.level < 100) {
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
	if (k === 'x' || k === 'Escape' || k === 'b') bagMenu.open = false;
	if ((k === 'z' || k === 'Enter') && entries.length) {
		const [id] = entries[bagMenu.idx];
		const item = Bag.ITEMS[id];
		if (item?.kind === 'rod') { castRod(id, item); return; }
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
	const page = box.slice(pageStart, pageStart + PC_BOX_CAP);
	const list = pcMenu.side === 0 ? party : page;
	// release confirm: Z lets it go, X keeps it
	if (pcMenu.confirm != null) {
		if (k === 'z' || k === 'Enter') {
			const gone = box[pageStart + pcMenu.confirm];
			if (gone) {
				box.splice(pageStart + pcMenu.confirm, 1);
				setBox(box);
				pcMenu.flash = `${gone.name} was released. Bye-bye, ${gone.name}!`;
			}
			pcMenu.confirm = null;
			pcMenu.idx = 0;
		} else if (k === 'x' || k === 'Escape' || k === 'r') pcMenu.confirm = null;
		return;
	}
	if (k === 'Tab') { pcMenu.side ^= 1; pcMenu.idx = 0; return; }
	if (k === 'ArrowLeft' || k === 'ArrowRight') {
		if (pcMenu.side === 0) { pcMenu.side = 1; pcMenu.idx = 0; }
		else { // page through the boxes
			pcMenu.box = (pcMenu.box + (k === 'ArrowRight' ? 1 : PC_BOXES - 1)) % PC_BOXES;
			pcMenu.idx = 0;
		}
		return;
	}
	if (k === 'ArrowUp' && list.length) pcMenu.idx = (pcMenu.idx + list.length - 1) % list.length;
	if (k === 'ArrowDown' && list.length) pcMenu.idx = (pcMenu.idx + 1) % list.length;
	if (k === 'x' || k === 'Escape') { pcMenu.open = false; pcMenu.flash = null; pcMenu.releaseMode = false; }
	if (k === 'r' && pcMenu.side === 1 && page[pcMenu.idx]) { pcMenu.confirm = pcMenu.idx; return; }
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
			const [m] = box.splice(pageStart + pcMenu.idx, 1);
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
	if (k === 'ArrowLeft') starterMenu.col = (starterMenu.col + 2) % 3;
	if (k === 'ArrowRight') starterMenu.col = (starterMenu.col + 1) % 3;
	if (k === 'z' || k === 'Enter') {
		const region = STARTERS[starterMenu.row].region;
		starterMenu.open = false;
		beginNewGame(region);
	}
}

// one entry point for keyboard AND the virtual touch buttons
function pressKey(k) {
	if (starterMenu.open) { starterKey(k); return; }
	if (dialog.blocking) { dialog.key(k); return; }
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
	if (dexMenu.open) { dexKey(k); return; }
	if (townMap.open) { townKey(k); return; }
	if (daycareMenu.open) { daycareKey(k); return; }
	if (nameRater.open) { nameRaterKey(k); return; }
	if (moveShop.open) { moveShopKey(k); return; }
	if (optionsMenu.open) { optionsKey(k); return; }
	if (questMenu.open) { questKey(k); return; }
	if (trainerCard.open) { if (k === 'x' || k === 'z' || k === 'Escape' || k === 'Enter') trainerCard.open = false; return; }
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
					const [m] = party.splice(a.monIdx, 1);
					party.unshift(m); partyMenu.idx = 0; saveParty(party); partyMenu.action = null;
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
		if (k === 'z' || k === 'Enter') openPartyAction(partyMenu.idx); // choose an action for this mon
		if (k === 'x' || k === 'p' || k === 'Escape') partyMenu.open = false;
		return;
	}
	if ((k === 'Enter' || k === 'm') && !loading) { startMenu.open = true; startMenu.idx = 0; return; }
	if (k === 'p' && !loading) { partyMenu.open = true; partyMenu.idx = 0; return; }
	if (k === 'b' && !loading) { bagMenu.open = true; bagMenu.idx = 0; bagMenu.picking = false; bagMenu.forget = null; bagMenu.flash = null; return; }
	if (k === 'c' && !loading) { toggleBike(); return; }
	if (k === 'z' && !loading) interact();
}
// any menu that consumes direction presses instead of walking
// just the full-res canvas menus (the SW x MH band) — no dialogs/battles/scenes
const canvasMenuOpen = () => starterMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || partyMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open
	|| trade.open || startMenu.open || playerMenu.open || deckSelect.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open
	|| daycareMenu.open || nameRater.open || moveShop.open || optionsMenu.open || questMenu.open || mailMenu.open;
const menuBlocking = () => dialog.blocking || evolution.blocking || cutscene.blocking
	|| battle.blocking || pvp.blocking || factorySpec.blocking || canvasMenuOpen();

addEventListener('keydown', e => {
	if (typingInChat()) return;
	if (menuBlocking() || ['z', 'x', 'Enter', 'p', 'b', 'Escape'].includes(e.key) || KEYMAP[e.key]) {
		if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
	}
	pressKey(e.key);
});

// ---------- touch controls ----------
// d-pad + A/B + PARTY/BAG buttons drive the same code paths as the keyboard
if (matchMedia('(pointer: coarse)').matches) { document.body.classList.add('touch'); fitCanvas(); } // re-fit: the touch pad reserves canvas room
const DPAD = { 't-up': 'up', 't-down': 'down', 't-left': 'left', 't-right': 'right' };
const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
for (const [id, dir] of Object.entries(DPAD)) {
	const el = document.getElementById(id);
	el.addEventListener('pointerdown', e => {
		e.preventDefault();
		try { el.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
		if (menuBlocking()) { pressKey(ARROW[dir]); return; }
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
	});
	const release = () => { const i = heldKeys.indexOf(dir); if (i >= 0) heldKeys.splice(i, 1); };
	el.addEventListener('pointerup', release);
	el.addEventListener('pointercancel', release);
	el.addEventListener('lostpointercapture', release);
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
	mapScripts = c.scr || {}; mapStrings = c.str || {};
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
	await npcs.loadForMap();
	await trainers.loadForMap();
	npcs.list = npcs.list.filter(n => !trainers.list.some(t => t.ev === n.ev));
	services.loadForMap();
	arcade.loadForMap();
	blockers.loadForMap();
	portals.loadForMap();
	items.loadForMap();
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
	loading = true;
	try {
		await world.load(file);
		const cx = px ?? Math.floor(world.current.layout.width / 2);
		const cy = py ?? Math.floor(world.current.layout.height / 2);
		player.setTile(...findLanding(cx, cy));
		player.surfing = false;
		await refreshMapContent(file);
	} catch (e) { afterLoadError('moveToMap ' + file, e); }
}

async function warpTo(mapId, destWarpId) {
	const file = world.fileFor(mapId);
	if (!file) { console.warn('unknown warp dest', mapId); return; }
	loading = true;
	const source = { name: world.current.name, tx: player.tx, ty: player.ty };
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

async function backWarp() {
	const src = world.lastWarpSource;
	if (!src) return;
	loading = true;
	try {
		await world.load(src.name);
		player.setTile(src.tx, src.ty);
		await refreshMapContent(src.name);
	} catch (e) { afterLoadError('backWarp ' + src.name, e); }
}

// ---------- Mach Bike ----------
// A free field toggle: faster movement, and the only way across Sky Pillar's
// cracked floors (engine gates those on player.biking). You can't bike on the
// water, so surfing dismounts it.
function toggleBike() {
	if (loading || player.moving || player.surfing) return;
	player.biking = !player.biking;
	hud.textContent = player.biking ? 'You got on the MACH BIKE!' : 'You got off the MACH BIKE.';
}

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
const HM_FIELD = {
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
	const region = playerRegion();
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
	if (idx > 0) opts.push({ label: 'SWITCH', kind: 'switch' });
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
// walking into an authentic blocker (guard / SNORLAX / grunt) shows its themed line
player.onBump = (tx, ty) => { if (dialog.blocking || !party) return; const m = blockers.messageAt(tx, ty); if (m) dialog.open(m); };

player.onArrive = () => {
	// each completed step accrues Day Care EXP and incubates any egg
	Daycare.step(battle.data, () => { hud.textContent = 'The Day Care egg is ready to hatch!'; });
	// warp tile?
	const w = world.warpAt(player.tx, player.ty);
	if (!w) savePos();
	if (w) {
		const dest = parseInt(w.dest_warp_id, 10);
		if (dest === -1) { backWarp(); return; } // backward warp — never gated
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
	if (!battle.blocking && trainers.checkSight(player.tx, player.ty)) return;
	// wild encounter?
	if (!battle.blocking) {
		const pick = encounters.roll(world.current.map.id, world, player.tx, player.ty, player.surfing);
		if (pick) startWildBattle(pick);
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
const LEGENDARY_ENCOUNTERS = {
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
	MAP_SOUTHERN_ISLAND_INTERIOR: { species: 'latios', dex: 381, level: 50, x: 13, y: 12, flag: 'legend_caught_latios',
		requires: () => Badges.isChampion('HOENN'), intro: 'A blue eon POKeMON drifts amid the leaves — LATIOS regards you keenly.' },
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
// a Pokemon's overworld sprite, loaded on demand from data/pokemon_ow/<id>.png
const owMonCache = new Map();
function owMonSprite(id) {
	if (!id) return null;
	if (!owMonCache.has(id)) {
		owMonCache.set(id, null);
		getImage(`data/pokemon_ow/${id}.png`).then(img => owMonCache.set(id, img)).catch(() => {});
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
	if (!followCache.has(id)) {
		followCache.set(id, null);
		getImage(`data/pokemon_follow/${id}.png`).then(img => followCache.set(id, img)).catch(() => {});
	}
	return followCache.get(id);
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
	if (!img) return;
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
		battle.start(party, e.species, e.level, result => {
			if (result === 'caught' && battle.lastCaught) {
				Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
				const where = addCaught(party, battle.lastCaught);
				hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
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
	if (!won.length) return;
	for (const m of won) Bag.addItem(m.item, m.count);
	dialog.open('POKeDEX MILESTONE!\n\n' + won.map(m => `${m.t} caught — you received ${m.label}!`).join('\n'));
}

function startWildBattle(pick, forceDouble) {
	if (!party || !leadMon(party)) return;
	// RANSEI RIFT (post-Champion): a slice of wild encounters tears open into
	// the imported fakemon — the only place they appear in the wild
	if (Math.random() < 0.05 && Badges.isChampion?.(playerRegion())) {
		const rift = riftSpecies();
		if (rift) {
			pick = { id: rift, level: pick.level };
			hud.textContent = 'The air crackles — a rift tears open!';
		}
	}
	Dex.markSeen(pick.id);
	// a slice of grass encounters are horde-style double battles
	const second = (forceDouble || Math.random() < 0.1)
		&& party.filter(m => m.curHP > 0).length >= 2
		? encounters.pick(world.current.map.id) : null;
	if (second) Dex.markSeen(second.id);
	battle.start(party, pick.id, pick.level, result => {
		if (result === 'defeat') {
			healParty(party);
			hud.textContent = (world.current.map.name || '') + ' — party healed';
		} else if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
		} else {
			saveParty(party);
		}
		if (result === 'victory') evolution.check(party, battle.data);
	}, second);
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
		giveMon: (species, level) => {
			const mon = battle.data.species[species] && buildMonForGift(species, level);
			if (mon) { Dex.markCaught(species); dexMilestoneCheck(); addCaught(party, mon); saveParty(party); }
		},
		healParty: () => healParty(party),
		warp: (mapId, warpId) => warpTo(mapId, warpId),
		setObjXy: (who, x, y) => { const n = npcById(who); if (n) { n.tx = x; n.ty = y; n.px = x * META; n.py = y * META; } },
		hideObj: who => { const n = npcById(who); if (n) n.hidden = true; },
		showObj: who => { const n = npcById(who); if (n) n.hidden = false; },
		setMetatile: (x, y, tile, impassable) => world.setMetatile(x, y, tile, impassable), // tile edits: not yet applied to the web layout
		startBattle: trainerId => startScriptedBattle(trainerId, scriptLabel, talker),
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
function buildMonForGift(species, level) {
	return battleBuildMon(species, level, battle.data);
}
function startCutscene(steps, onDone) {
	if (cutscene.blocking) return;
	cutscene.start(steps, cutsceneCtx(), onDone);
}

// ---------- ported map-script triggers ----------
// resolve a script label (an NPC's `script`, a coord_event, a map trigger) and
// run it through the interpreter with the current map's strings
function runScriptLabel(label, talker) {
	if (cutscene.blocking || !label || !mapScripts[label]) return false;
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
	if (team?.party?.length) {
		foeParty = team.party.map(e => {
			const mon = battleBuildMon(e.s, e.l, battle.data);
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
		foeParty = roster.party.map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
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
	battle.startTrainer(party, foeParty, info, result => {
		if (result === 'victory') {
			Story.setVar('VAR_RESULT', 1);
			if (talker && trainers.list.includes(talker)) trainers.markDefeated(talker);
			saveParty(party);
			onTrainerDefeated(talker?.ev?.script, { silent: true }); // badge/crown; the script's own speech announces it
			cutscene.resume(); // continue the script (defeat text, post-battle)
		} else {
			// blacked out / fled: heal and abandon the rest of the script
			Story.setVar('VAR_RESULT', 0);
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
			'FLAG_HIDE_PALLET_TOWN_OAK', // Oak is in his lab, not blocking the road
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
		flags: ['FLAG_ADVENTURE_STARTED', 'FLAG_GOT_FIRST_POKEMON'],
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
}

function seedStoryState(region) {
	if (Story.getFlag('story_seeded')) return;
	const seed = STORY_SEED[region];
	if (seed) {
		for (const [k, v] of Object.entries(seed.vars || {})) Story.setVar(k, v);
		for (const f of seed.flags || []) Story.setFlag(f);
	}
	// the 8 HMs come in the bag (reusable) — teach them to compatible POKeMON and
	// use the field move from the party menu wherever it applies
	for (let i = 1; i <= 8; i++) Bag.addItem('hm' + i);
	Story.setFlag('story_seeded');
}

// special-command dispatch. Store-writing specials set `store` (a VAR_*) to a
// computed value the following branch reads; action specials just do the thing.
// Unknown store-specials default to 0 so branches take the "nothing happened"
// path deterministically rather than reading a stale var.
const B_OUTCOME_WON = 1;
function runSpecial(name, store) {
	// query specials write their result to the given store var, or VAR_RESULT by
	// the decomp convention when a plain `special` (no store) is used
	const set = v => Story.setVar(store || 'VAR_RESULT', v | 0);
	const living = () => (party || []).filter(m => m.curHP > 0);
	switch (name) {
		// --- action specials ---
		case 'HealPlayerParty': healParty(party); return;
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
		case 'GetBattleOutcome': return set(B_OUTCOME_WON); // scripted battles skipped -> treat as won
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
	if (party || Story.getFlag('intro_done') || cutscene.blocking || starterMenu.open) return;
	const cfg = NEW_GAME_INTRO[playerRegion()];
	if (cfg && world.current.name === cfg.lab) {
		startCutscene(cfg.labGreeting.map(text => ({ op: 'say', text })), () => openStarterPick(playerRegion()));
	}
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
// Which starter you picked, which region you're on, your position/boxes/money — these lived only in
// localStorage, so a different device/browser saw stale data. Persist the raw save strings to the
// server (D1, ow:<user>) so a logged-in player gets the same, current game everywhere. The server is
// authoritative on boot (hydrateOw overwrites the local cache); a deduped push keeps it current.
const OW_KEYS = ['magepunk_party_v1', 'magepunk_region', POS_KEY, 'magepunk_box_v1', 'magepunk_rival', 'magepunk_name', 'magepunk_money', 'magepunk_playtime'];
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
async function hydrateOw() {
	if (!MP_ON) return;
	try {
		const r = await MP.call('ow-load');
		const ow = r && r.ow && r.ow.ow; // ow-load returns { ow: { ow:<snapshot>, updated_at } }
		if (ow && typeof ow === 'object') {
			for (const k of OW_KEYS) { try { if (ow[k] != null) localStorage.setItem(k, ow[k]); } catch (e) {} }
			_lastOwJson = JSON.stringify(owSnapshot()); // don't immediately re-push what we just pulled
		}
	} catch (e) { /* offline / logged out -> keep the localStorage cache */ }
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
	party = createStarter(id, battle.data);
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
		{ op: 'say', text: `${prof}: You must earn each tier's badge in ALL THREE regions before the next GYM will admit you anywhere.` },
		{ op: 'say', text: `${prof}: A PORTAL by every GYM town's POKeMON CENTER carries you between the regions — and you won't be climbing alone. Off you go!` },
	]);
}

// kept for the debug hook / older callers: nudge a partyless save into the intro
function maybeIntroCutscene() {
	if (Story.getFlag('intro_done') || party) return;
	startIntroNarration(playerRegion());
}

// ---------- camera ----------
function cameraPos() {
	// center on player sprite (feet tile center), GBA-style; no bounds clamp
	const cx = Math.round(player.px + META / 2 - VIEW_W / 2);
	const cy = Math.round(player.py + META / 2 - VIEW_H / 2 - 8);
	return [cx, cy];
}

// day/night colour wash over the world (not menus/HUD). Keyed to the in-game
// hour with smooth dawn/dusk ramps; indoor maps stay untinted.
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

// ---------- loop ----------
let last = performance.now();
let playAccum = 0;
function tick(now) {
	requestAnimationFrame(tick);
	const dt = Math.min((now - last) / 1000, 0.05);
	last = now;
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
		trainers.update(dt);
		player.run = runHeld || Settings.get('autoRun');
		// any open menu freezes the player even if a key was held as it opened
		const moveDir = menuBlocking() ? null : (heldKeys[0] || null);
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
		services.draw(ctx, camX, camY);
		arcade.draw(ctx, camX, camY);
		items.draw(ctx, camX, camY);
		drawLegendary(ctx, camX, camY);
		drawAwakening(ctx, camX, camY);
		portals.draw(ctx, camX, camY); // ground pads render under blockers/entities
		blockers.draw(ctx, camX, camY);
		// sprites in y order so overlaps stack correctly
		const sprites = [...npcs.list, ...trainers.list, player];
		if (follower && !player.surfing) sprites.push({ py: follower.py, draw: drawFollower });
		sprites.sort((a, b) => a.py - b.py);
		for (const s of sprites) s.draw(ctx, camX, camY);
		drawFriendGhosts(ctx, camX, camY);
		world.drawLayer(ctx, 'top', camX, camY);
		drawDayNightTint(ctx);
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
		else if (dexMenu.open) drawDexMenu(SW, MH);
		else if (townMap.open) drawTownMap(SW, MH);
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
		else if (startMenu.open) drawStartMenu(SW, MH);
		else if (cardsMenu.open) drawCardsMenu(SW, MH);
		else if (runMenu.open) drawRunMenu(SW, MH);
		else if (friendsMenu.open) drawFriendsMenu(SW, MH);
		else if (mailMenu.open) drawMailMenu(SW, MH);
		if (!evolution.blocking) dialog.drawHi(sctx, SW, SH);
	}
	// while your run is being spectated, show a live "N watching" badge on top
	if (frontier.active && frontierWatchers > 0) drawWatchingBadge(SW, SH);
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
	menuChrome(W, H, u, 'PARTY', act ? `Choose an action for ${act.mon.name}.` : 'Choose a POKEMON, then an action (field moves it knows, SUMMARY, SWITCH).');
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
		sctx.fillText(`${(info.type || '').toUpperCase()}  PP ${mv.pp}/${mv.maxPp}`, bx + 12 * u, yy + 25 * u);
	});
	// nav hint / lead button
	const lead = { id: 'summary-lead', x: 40 * u, y: H - 52 * u, w: 200 * u, h: 40 * u,
		label: partyMenu.idx === 0 ? 'IS LEAD' : 'MAKE LEAD', center: true };
	menuUi.push(lead);
	BUI.button(sctx, lead, menuHover === lead.id, u);
}

function drawDexMenu(W, H) {
	const u = H / 480;
	const list = dexList();
	const c = Dex.counts();
	if (dexMenu.detail) { drawDexDetail(W, H, u, list[dexMenu.idx]); return; }
	menuChrome(W, H, u, 'POKeDEX', `Seen ${c.seen}   Caught ${c.caught}   —   tap a seen entry for details`);
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
	if (townMap.flash) {
		sctx.fillStyle = BUI.C.accent;
		sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
		sctx.fillText(townMap.flash, 40 * u, H - 20 * u);
	}
}

function drawTrainerCard(W, H) {
	const u = H / 480;
	menuChrome(W, H, u, 'TRAINER CARD', 'Your journey so far.');
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
	const lines = [
		['NAME', name],
		['REGION', region],
		['GYM TIER', allChamp ? `${gTier}/8  GRAND CHAMP` : `${gTier}/8`],
		['LEVEL CAP', gTier >= 8 ? 'NONE' : `Lv${levelCapNow()}`],
		['OBJECTIVE', Quest.shortObjective(rk)],
		['MONEY', `$${money}`],
		['TIME', `${Clock.label()} (${Clock.phaseLabel()})`],
		['POKeDEX SEEN', String(c.seen)],
		['POKeDEX OWNED', String(c.caught)],
		['PARTY', `${party.length}/6`],
		['PLAYTIME', playtimeStr()],
	];
	const midX = cardX + cardW * 0.54;
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	lines.forEach(([k, v], i) => {
		const y = cardY + (34 + i * 28) * u;
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
	menuChrome(W, H, u, 'OPTIONS', 'Arrows: ▲▼ pick   ◄► change   X: close');
	OPTION_KEYS.forEach((key, i) => {
		const o = Settings.OPTIONS[key];
		const sel = optionsMenu.idx === i;
		const bid = 'opt:' + i;
		const b = { id: bid, x: 40 * u, y: (96 + i * 62) * u, w: W - 80 * u, h: 52 * u };
		menuUi.push(b);
		sctx.fillStyle = sel || menuHover === bid ? BUI.C.btnHover : BUI.C.btn;
		BUI.rr(sctx, b.x, b.y, b.w, b.h, 8 * u); sctx.fill();
		sctx.strokeStyle = sel ? BUI.C.accent : BUI.C.panelBorder;
		sctx.lineWidth = sel ? 3 : 1;
		BUI.rr(sctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 8 * u); sctx.stroke();
		sctx.fillStyle = BUI.C.text;
		sctx.font = `${Math.round(18 * u)}px m6x11plus, monospace`;
		sctx.fillText(o.label, b.x + 20 * u, b.y + 32 * u);
		// value with ◄ ► chevrons
		const val = Settings.displayValue(key);
		sctx.textAlign = 'right';
		sctx.fillStyle = BUI.C.accent;
		sctx.fillText(val, b.x + b.w - 44 * u, b.y + 32 * u);
		sctx.fillStyle = sel ? BUI.C.text : BUI.C.dim;
		sctx.fillText('◄', b.x + b.w - 132 * u, b.y + 32 * u);
		sctx.fillText('►', b.x + b.w - 20 * u, b.y + 32 * u);
		sctx.textAlign = 'left';
	});
	// live preview line so text-speed changes are visible
	sctx.fillStyle = BUI.C.dim;
	sctx.font = `${Math.round(14 * u)}px m6x11plus, monospace`;
	sctx.fillText('Changes save automatically.', 40 * u, H - 24 * u);
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
	// phase 'region': choose where the journey begins — each card previews the trio
	menuChrome(W, H, u, 'CHOOSE YOUR REGION', 'Pick where your journey begins. You will choose a starter in the lab.', false);
	const cw = 150 * u, ch = 118 * u;
	STARTERS.forEach((row, r) => {
		const y = (78 + r * 130) * u;
		const rowSel = starterMenu.row === r;
		const bid = `region:${r}`;
		// a full-row hit target so a tap anywhere on the card selects that region
		menuUi.push({ id: bid, x: 30 * u, y, w: W - 60 * u, h: ch });
		sctx.fillStyle = BUI.C.dim;
		sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		sctx.save();
		sctx.translate(38 * u, y + ch / 2);
		sctx.rotate(-Math.PI / 2);
		sctx.textAlign = 'center';
		sctx.fillStyle = rowSel ? BUI.C.accent : BUI.C.dim;
		sctx.fillText(row.region, 0, 0);
		sctx.restore();
		row.ids.forEach((id, c) => {
			const x = (70 + c * 165) * u;
			drawStarterCell(id, x, y, cw, ch, rowSel, bid, u);
		});
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
	const rows = selling ? sellList() : Bag.SHOP_STOCK.map(id => ({ id }));
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
	menuChrome(W, H, u, 'BAG', `Money: $${Bag.getMoney()} — tap an item, then who to use it on`);
	const entries = Object.entries(Bag.getBag()).filter(([, n]) => n > 0);
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
	const page = box.slice(pageStart, pageStart + PC_BOX_CAP);
	menuChrome(W, H, u, 'POKEMON STORAGE',
		pcMenu.confirm != null ? `Release ${page[pcMenu.confirm]?.name}? Z releases — X keeps it.`
			: pcMenu.releaseMode ? 'RELEASE MODE: tap a boxed Pokémon to let it go.'
			: pcMenu.flash || 'Z moves · ←/→ change box · R release · S sort.');
	sctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
	sctx.fillStyle = pcMenu.side === 0 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText('PARTY', 24 * u, 78 * u);
	sctx.fillStyle = pcMenu.side === 1 ? BUI.C.accent : BUI.C.dim;
	sctx.fillText(`BOX ${pcMenu.box + 1}/${PC_BOXES} (${page.length}/${PC_BOX_CAP} · ${box.length} total)`, W * 0.52, 78 * u);
	// tappable controls: box paging + sort + release mode; confirm gets its own pair
	const navBtns = pcMenu.confirm != null
		? [['pcnav:yes', 'RELEASE', W * 0.52, 100 * u], ['pcnav:no', 'KEEP', W * 0.52 + 110 * u, 76 * u]]
		: [
			['pcnav:prev', '<', W * 0.465, 24 * u],
			['pcnav:next', '>', W - 40 * u, 24 * u],
			['pcnav:sort', 'SORT', 24 * u, 60 * u],
			['pcnav:rel', pcMenu.releaseMode ? 'DONE' : 'RELEASE', 96 * u, 90 * u],
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
	const rows = Quest.log(rk).map(r => (r.state === 'done' ? '[x] ' : r.state === 'current' ? '[>] ' : '[ ] ') + r.label);
	// the title carries the SHARED gym tier (all three regions must clear each tier); the
	// subtitle's objective already spells out the cross-region "who's behind" when relevant
	optionList(W, H, H / 480, `${rk} — GYM TIER ${Quest.globalTier()}/8`, 'NEXT: ' + Quest.objective(rk), rows, questMenu.idx, 'quest:', null);
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
	// row 0: add friend
	const rows = [{ id: 'friend:0', label: '+ ADD FRIEND BY CODE', sub: '' }];
	friends.forEach((f, i) => rows.push({
		id: 'friend:' + (i + 1),
		label: f.username + (f.online ? '  ●' : '  ○'),
		sub: f.online ? (friendsChallenge.mode ? 'tap to challenge' : `in ${f.map || 'their world'} — tap to visit`) : 'offline',
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
	if (kind === 'opt') { optionsMenu.idx = +a; Settings.cycle(OPTION_KEYS[+a], 1); return; }
}
const anyMenuOpen = () => partyMenu.open || shopMenu.open || bagMenu.open || pcMenu.open || starterMenu.open || ferryMenu.open || portalMenu.open || bpShopMenu.open || startMenu.open || playerMenu.open || deckSelect.open || cardsMenu.open || runMenu.open || friendsMenu.open || dexMenu.open || trainerCard.open || townMap.open || daycareMenu.open || nameRater.open || moveShop.open || optionsMenu.open || questMenu.open;

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
	// finishes loading, so newly-armed scenes must exist by then
	armStoryScenes(playerRegion());
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
	await hydrateOw(); // server-authoritative: refresh starter/region/position from D1 before reading them
	party = loadParty(battle.data);
	// standalone Battle Factory mini-game (?factory=1): no save/party needed (it
	// battles with rentals). Suppress the region picker; the post-boot hook warps to
	// the Factory and provisions a throwaway lead just before starting.
	factoryStandalone = new URLSearchParams(location.search).has('factory');
	if (party) { Dex.seedFrom([...party, ...getBox()]); dexMilestoneCheck(); }
	if (!party && !factoryStandalone) {
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
	await loadMapScripts(world.current.name);
	hud.textContent = world.current.map.name || startMap;
	markFlyPoint(world.current.map.id);
	loading = false;
	runMapTransition();
	// ...and the STARTING map's onFrame pass. moveToMap runs one on every later
	// entry, but boot loads the first map directly (world.load, not moveToMap),
	// so a scene waiting on the map you resume into would never fire.
	try { checkOnFrame(); } catch (e) { console.warn('[plot] boot onFrame failed', e); if (cutscene.blocking) cutscene.stop(); }
	refreshObjective(); // show the current quest objective on boot
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
	window.__ow = { world, player, warpTo, moveToMap, npcs, encounters, battle, trainers, dialog, evolution, items, tmMoveId, canLearn, pcMenu, get party() { return party; }, get menuUi() { return menuUi; }, menuTap, pumpPlayer, freezeLoop, startWildBattle, interact,
		get startMenu() { return startMenu; }, get cardsMenu() { return cardsMenu; }, get runMenu() { return runMenu; }, get friendsMenu() { return friendsMenu; },
		get friends() { return friends; }, get visiting() { return visiting; }, refreshFriends, visitWorld, leaveVisit, heartbeat, pollPresence, get ghosts() { return ghosts; }, MP_ON,
		get pvp() { return pvp; }, pvpParty, sendChallenge, enterMatch, pollChallenges, get pending() { return pendingChallengeTo; },
		get mailMenu() { return mailMenu; }, get mailWaiting() { return mailWaiting; }, refreshMail, sendMailChallenge, mailAccept, enterAsyncMatch,
		Dex, get dexMenu() { return dexMenu; }, get trainerCard() { return trainerCard; }, get partyMenu() { return partyMenu; }, get shopMenu() { return shopMenu; }, get bagMenu() { return bagMenu; }, Bag,
		Fly, get townMap() { return townMap; }, openTownMap, flyTo, hasFlyPoint, markFlyPoint, Clock,
		Daycare, get daycareMenu() { return daycareMenu; }, get nameRater() { return nameRater; }, get moveShop() { return moveShop; },
		openDaycare, openNameRater, openMoveShop, setNickname, relearnable,
		Settings, get optionsMenu() { return optionsMenu; },
		Story, get cutscene() { return cutscene; }, startCutscene, npcById, maybeIntroCutscene,
		runScriptLabel, checkCoordTrigger, checkOnFrame, cutsceneCtx, get mapScripts() { return mapScripts; }, get mapStrings() { return mapStrings; }, get signTexts() { return signTexts; },
		get trainerTeams() { return trainerTeams; }, seedStoryState, startScriptedBattle,
		checkLegendaryTrigger, startLegendaryBattle, LEGENDARY_ENCOUNTERS, legendaryHere, legendariesHere,
		toggleBike, diveTo, HM_FIELD, useFieldMove, openPartyAction, fieldMovesOf,
		Badges, onTrainerDefeated, leagueGateMessage, playerRegion, drawTrainerCard,
		levelCapNow, levelCapHint, refreshLevelCap,
		// the map editor maps screen pixels back to tiles, so it needs the same
		// camera and logical view size the renderer uses
		cameraPos, viewSize: () => [VIEW_W, VIEW_H],
		grantTierReward, showTierRewardDialog, TIER_REWARDS, applyGymLevelFloors, TIER_LEVEL_FLOOR,
		grantGrandChampionReward, grandChampionFinale,
		Quest, get questMenu() { return questMenu; }, refreshObjective, drawQuest, drawTownMap,
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
		refreshFollower, get follower() { return follower; } };
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
