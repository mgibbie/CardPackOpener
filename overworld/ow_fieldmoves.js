// ow_fieldmoves.js — field systems: the Mach Bike, Silph Co locked doors, the Route 113 glass workshop, Dive, and the HM field moves.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Daycare from './daycare.js';
import { EXTRA_DIVE } from './divelinks.js';
import { encounterChance } from './encounters.js';
import { META } from './engine.js';
import * as Story from './events.js';
import { HEADBUTT_MAPS, HEADBUTT_SETS } from './headbutt_data.js';
import { Journal } from './journal.js';
import { battle, blockers, cutscene, dialog, encounters, hud, items, player, trainers, world } from './ow_core.js';
import { roamerHere, shoalWarp, startRoamerBattle } from './ow_features.js';
import { checkAwakeningTrigger } from './ow_legendaries.js';
import { maybePortalTutorial } from './ow_menukeys.js';
import { hillWarp } from './ow_minigames.js';
import { spawnStepFx } from './ow_render.js';
import { S } from './ow_state.js';
import { checkCoordTrigger, checkOnFrame } from './ow_story.js';
import { bugContest, bugContestRoll, endBugContest, trickWarp } from './ow_venues.js';
import { saveParty } from './party.js';
import * as Quest from './quest.js';
import { safeLoad, safeSave, safeSaveStr } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { REPEL_KEY, repelWoreOff, savePos } from './ow_input.js';
import {
	afterLoadError, backWarp, checkLegendaryTrigger, endSafari, findLanding, findSurfLanding,
	lastOutdoor, miscEvents, moveToMap, openTownMap, partyMenu, playerRegion, refreshMapContent,
	safari, safariZoneOf, saveMiscEvents, saveSafari, startWildBattle, warpTo,
} from './main.js';

// ---------- Mach Bike ----------
// A free field toggle: faster movement, and the only way across Sky Pillar's
// cracked floors (engine gates those on player.biking). You can't bike on the
// water, so surfing dismounts it.
const BIKES = ['bicycle', 'machbike', 'acrobike'];
export function toggleBike() {
	if (S.loading || player.moving || player.surfing) return;
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
export function bikeShopTalk() {
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
export const SILPH_DOORS = {
	SilphCo_2F: [[5, 8], [6, 8], [5, 9], [6, 9], [5, 15], [6, 15], [5, 16], [6, 16]],
	SilphCo_3F: [[9, 11], [10, 11], [9, 12], [10, 12], [9, 13], [10, 13], [20, 11], [21, 11], [20, 12], [21, 12], [20, 13], [21, 13]],
	SilphCo_4F: [[3, 16], [4, 16], [3, 17], [4, 17], [14, 11], [15, 11], [14, 12], [15, 12]],
	SilphCo_5F: [[7, 17], [8, 17], [7, 18], [8, 18], [7, 19], [8, 19], [18, 12], [19, 12], [18, 13], [19, 13], [18, 14], [19, 14]],
	SilphCo_7F: [[11, 8], [12, 8], [11, 9], [12, 9], [24, 7], [25, 7], [24, 8], [25, 8], [25, 13], [26, 13], [25, 14], [26, 14]],
	SilphCo_9F: [[2, 9], [3, 9], [2, 10], [3, 10], [2, 11], [3, 11], [12, 15], [13, 15], [12, 16], [13, 16], [12, 17], [13, 17], [21, 6], [22, 6], [21, 7], [22, 7], [21, 12], [22, 12], [21, 13], [22, 13]],
};
let silphNoted = false;
export function silphDoorsApply(label) {
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
export function silphDoorAt(fx, fy) {
	const doors = SILPH_DOORS[world.current?.name];
	return !!doors && doors.some(([x, y]) => x === fx && y === fy);
}

// ---------- the Route 113 glass workshop ----------
// The SOOT SACK fills as you walk ashy grass (MB_ASHGRASS survives in the
// layout attributes, same machinery as the secret-base spots); the
// glassblower trades the ash for his blown-glass flutes.
const GLASS_WARES = [['blueflute', 250], ['whiteflute', 500], ['blackflute', 1000]];
export function glassBlowerTalk() {
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
S.fluteState = safeLoad(FLUTE_KEY, null) || { mode: null, steps: 0 };
export function saveFlute() { safeSave(FLUTE_KEY, S.fluteState); }

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
export async function diveTo(kind) { // 'dive' (down) | 'emerge' (up)
	const c = diveConn(kind);
	if (!c) return false;
	const file = world.fileFor(c.map);
	if (!file) return false;
	S.loading = true;
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
S.strengthActive = false;
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
	const target = (S.party || []).filter(m => m && m !== user && m.curHP > 0 && m.curHP < m.maxHP)
		.sort((a, b) => (a.curHP / a.maxHP) - (b.curHP / b.maxHP))[0];
	if (!target) { dialog.open('No one needs it right now.'); return; }
	user.curHP -= cost;
	target.curHP = Math.min(target.maxHP, target.curHP + cost);
	saveParty(S.party);
	dialog.open(`${user.name} used ${label}!\n\n${target.name} recovered ${cost} HP.`);
}

export const HM_FIELD = {
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
				if (grp && Math.random() < encounterChance(world.current.map.id, grp.rate)) { const pick = encounters.pick(world.current.map.id, 'rock_smash'); if (pick) startWildBattle(pick); }
			});
			return;
		}
		dialog.open("There's no rock here to SMASH.");
	} },
	strength: { name: 'STRENGTH', use() {
		const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => items.fieldObjAt(player.tx + dx, player.ty + dy)?.kind === 'boulder');
		if (!near) { dialog.open("There's nothing here to use STRENGTH on."); return; }
		S.strengthActive = true;
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
export function fieldMovesOf(mon) { return (mon?.moves || []).filter(mv => HM_FIELD[mv.id]); }
export function useFieldMove(hmId, mon) {
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
export function openPartyAction(idx) {
	const mon = S.party[idx];
	if (!mon) return;
	const opts = fieldMovesOf(mon).map(mv => ({ label: HM_FIELD[mv.id].name, kind: 'field', hm: mv.id }));
	opts.push({ label: 'SUMMARY', kind: 'summary' });
	if (S.party.length > 1) opts.push({ label: 'SWITCH', kind: 'switch' });
	opts.push({ label: 'CANCEL', kind: 'cancel' });
	partyMenu.action = { mon, monIdx: idx, options: opts, idx: 0 };
}

// re-anchor when the player has walked into a connected map
async function crossConnection(hit) {
	S.loading = true;
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
	if (dialog.blocking || !S.party) return;
	const m = blockers.messageAt(tx, ty);
	if (m) dialog.open(m);
};

player.onArrive = () => {
	// each completed step accrues Day Care EXP and incubates any egg
	// FLAME BODY / MAGMA ARMOR halve the steps an egg needs — previously
	// battle-only text on 20-odd species
	Daycare.step(battle.data, () => { hud.textContent = 'The Day Care egg is ready to hatch!'; },
		(S.party || []).some(m => m && m.curHP > 0 && (m.ability === 'flamebody' || m.ability === 'magmaarmor')) ? 2 : 1);
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
		// Leaving a POKeMON CENTER is never gated: you must always be able to step back
		// out into the town you're standing in. (A portal could drop you in a town above
		// your shared tier; the badge gate then trapped you INSIDE its PC — you'd walk in
		// and never get out. This also frees any save already stuck that way.)
		const leavingPC = /poke\w*center/i.test(world.current.map?.id || world.current.name || '');
		const qb = (destFile && !leavingPC) ? Quest.blocked(playerRegion(), destFile, world.current.name) : null;
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
			if (!S.party) {
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
	if (S.repelSteps > 0) {
		S.repelSteps--;
		safeSaveStr(REPEL_KEY, String(S.repelSteps));
		if (S.repelSteps === 0) repelWoreOff();
	}
	// the SOOT SACK drinks the ashy grass underfoot (MB_ASHGRASS = 0x24)
	if (Bag.count('sootsack') > 0 && world.behaviorAt(player.tx, player.ty) === 0x24) {
		const ev = miscEvents();
		ev.ash = (ev.ash || 0) + 1;
		if (ev.ash % 50 === 0) hud.textContent = `The SOOT SACK swallows more ash... (${ev.ash})`;
		saveMiscEvents(ev);
	}
	// a playing flute fades with the steps
	if (S.fluteState.steps > 0) {
		S.fluteState.steps--;
		if (S.fluteState.steps === 0) { S.fluteState.mode = null; hud.textContent = "The flute's melody faded away."; }
		saveFlute();
	}
	// ambient step fx: rustle the grass / print the sand under the new tile
	spawnStepFx();
	// wild encounter?
	if (!battle.blocking) {
		// guard: this runs inside the rAF step loop, where a throw is silent and
		// kills movement outright — `party` is not guaranteed to be populated yet
		const lead = Array.isArray(S.party) ? S.party.find(m => m && m.curHP > 0) : null;
		// CLEANSE TAG: held by the LEAD, it wards off a third of would-be
		// encounters. A ¥1000 buyable whose payload nothing read until now.
		if (Bag.ITEMS[lead?.heldItem]?.held?.cleanseTag && Math.random() < 1 / 3) return;
		// the Bug-Catching Contest swaps in its own bug table while it runs;
		// the BLACK FLUTE hushes normal encounters, the WHITE one doubles them
		const repelLv = S.repelSteps > 0 ? (lead?.level || 0) : 0;
		const rollOnce = () => encounters.roll(world.current.map.id, world, player.tx, player.ty, player.surfing, repelLv);
		const pick = bugContestRoll()
			|| (S.fluteState.mode === 'black' && S.fluteState.steps > 0 ? null
				: rollOnce() || (S.fluteState.mode === 'white' && S.fluteState.steps > 0 ? rollOnce() : null));
		if (pick) {
			// a roamer on this route takes over half of the encounters here
			const roam = roamerHere();
			if (roam && Math.random() < 0.5) { startRoamerBattle(roam); return; }
			startWildBattle(pick);
		}
	}
};

