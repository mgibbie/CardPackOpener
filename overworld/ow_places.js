// ow_places.js — place-specific systems: blacking out and heal points, the SAFARI GAME, museum paintings, ruins words, fossils and New Mauville.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import { buildMon as battleBuildMon } from './battle.js';
import { CATS } from './contest.js';
import { META } from './engine.js';
import { Journal } from './journal.js';
import { battle, cutscene, dialog, encounters, evolution, hud, player, world } from './ow_core.js';
import { wildEncounterLevel } from './ow_scaling.js';
import { offerNickname } from './ow_screens.js';
import { S } from './ow_state.js';
import { CONTEST_KEY, bugContestCatch, contestProgress, contestSpriteFor, rollUnownLetter } from './ow_venues.js';
import { addCaught, healParty, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { safeLoad, safeSave } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { playerRegion } from './ow_progression.js';
import { dexMilestoneCheck, mapWeatherNow, riftSpecies } from './ow_follower.js';
import {
	moveToMap, warpTo,
} from './main.js';

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
export function healPoint() {
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
export function noteOutdoor() {
	const t = world.current?.map?.map_type || '';
	if (t !== 'MAP_TYPE_INDOOR' && t !== 'MAP_TYPE_UNDERGROUND' && !world.current?.map?.indoor) {
		lastOutdoor = { map: world.current.name, x: player.tx, y: player.ty };
	}
}

// PICKUP afield: after a wild win, an idle-handed Pickup mon may scoop something
// up — the classic free-items loop, previously battle-only ability text.
const PICKUP_TABLE = ['potion', 'superpotion', 'pokeball', 'greatball', 'ultraball',
	'oranberry', 'sitrusberry', 'revive', 'fullheal', 'rarecandy'];
export function pickupCheck() {
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
export function checkSafariGate() {
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
export function wildBattleEnd(result, inSafari) {
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
export const MUSEUM_PAINTINGS = {
	cool: [[2, 6], [3, 6]], beauty: [[10, 6], [11, 6]], cute: [[18, 6], [19, 6]],
	smart: [[6, 10], [7, 10]], tough: [[14, 10], [15, 10]],
};
export function museumBackfill() {
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
export const FOSSIL_MONS = { rootfossil: 'lileep', clawfossil: 'anorith', helixfossil: 'omanyte', domefossil: 'kabuto', oldamber: 'aerodactyl' };
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

