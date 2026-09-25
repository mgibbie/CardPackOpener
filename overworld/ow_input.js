// ow_input.js — keyboard input: held-key tracking, the movement gates, the run button, and the item/repel helpers bound to input.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Bag from './bag.js';
import { Contest } from './contest.js';
import * as Story from './events.js';
import * as Frontier from './frontier.js';
import { arcade, battle, blockers, cutscene, dialog, hud, items, npcs, player, portals, services, trainers, world } from './ow_core.js';
import { baseDecoInteract, kurtTalk, secretSpotInteract, shoalDig, shoalHermitTalk } from './ow_features.js';
import { bikeShopTalk, glassBlowerTalk, silphDoorAt } from './ow_fieldmoves.js';
import { FACILITY_LOBBIES, frontier, startFacility } from './ow_frontier.js';
import { bagMenu, ferryMenu, menuBlocking, openBpShop, pcMenu, portalMenu, shopMenu } from './ow_menukeys.js';
import { hillGuardAt, hillPrizeTalk, hillReceptionTalk, startHillBattle } from './ow_minigames.js';
import { S } from './ow_state.js';
import { runScriptLabel } from './ow_story.js';
import { blendMenu, bugOfficerTalk, contestMenu, openRuinsPuzzle, trickEndTalk, trickMasterTalk, trickScrollFind } from './ow_venues.js';
import { healParty, saveParty } from './party.js';
import { safeSave, safeSaveStr } from './safestore.js';
import { sfx } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { fossilManiacTalk, fossilPick, fossilUnderpassTalk, generatorTalk, lastOutdoor, museumCuratorTalk, museumPaintTalk, noteHealPoint, ruinsWordTalk, startWildBattle } from './ow_places.js';
import { gcMenu } from './ow_gamecorner.js';
import { legendaryHere, startLegendaryBattle } from './ow_follower.js';
import { openDaycare, openMoveShop, openNameRater, openTownMap } from './ow_music.js';
import { DAYCARE_MAPS, DELETER_MAPS, MOM_SCRIPTS, NAMERATER_MAPS, ghostAt, momTalk, playerMenu } from './ow_menustate.js';
import {
	MP_ON, cutsceneCtx, gateReport, moveToMap, noteRejectedMove, scriptIsDisplayOnly, signTexts,
	warpTo,
} from './main.js';

// ---------- input ----------
// INPUT DIAGNOSTICS (temporary instrumentation): `?owlog=1` traces every
// movement event, listener attach, and lifecycle transition. See gateReport().
export const INPUT_TRACE = new URLSearchParams(location.search).has('owlog');
S.lastBlockedBy = '(boot)';
export function owlog(...a) { if (INPUT_TRACE) console.log('[owinput]', ...a); }
// The gate flags only explain a freeze the game KNOWS about. A subsystem that
// throws every frame freezes the player with every flag clear, so count how far
// down the tick we actually get.
export const tickStats = { frames: 0, playerUpdates: 0, reachedMoveBlock: 0, lastError: null, errors: 0 };
addEventListener('error', e => { tickStats.errors++; tickStats.lastError = String(e.message || e.error); });
addEventListener('unhandledrejection', e => { tickStats.errors++; tickStats.lastError = 'unhandled rejection: ' + String(e.reason && e.reason.message || e.reason); });
export const KEYMAP = {
	ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
	w: 'up', s: 'down', a: 'left', d: 'right',
};
export const heldKeys = [];
S.wasInBattle = false; // when a battle ends, flush held keys so we don't take a stray step out of it
S.runHeld = false; // Shift on keyboard, holding B on touch
// while typing in the chat box, keys belong to the input, not the game
export const typingInChat = () => document.activeElement && document.activeElement.tagName === 'INPUT';
addEventListener('keydown', e => {
	if (typingInChat()) { if (KEYMAP[e.key]) owlog('keydown IGNORED', e.key, 'reason=typingInChat'); return; }
	// while a menu/dialog/battle is open, arrows navigate options — don't also
	// queue overworld movement (that made the player walk while browsing menus)
	if (menuBlocking()) {
		if (KEYMAP[e.key]) { e.preventDefault(); noteRejectedMove(); if (INPUT_TRACE) owlog('keydown IGNORED', e.key, 'reason=' + gateReport().blockedBy); }
		return;
	}
	if (e.key === 'Shift') S.runHeld = true;
	const dir = KEYMAP[e.key];
	if (dir) {
		e.preventDefault();
		if (!heldKeys.includes(dir)) heldKeys.unshift(dir);
		owlog('keydown ACCEPTED', e.key, '->', dir, 'held=' + heldKeys.join('|'));
	}
});
addEventListener('keyup', e => {
	if (e.key === 'Shift') S.runHeld = false;
	const dir = KEYMAP[e.key];
	if (dir) {
		const i = heldKeys.indexOf(dir);
		if (i >= 0) heldKeys.splice(i, 1);
		owlog('keyup', e.key, '->', dir, 'held=' + heldKeys.join('|'));
	}
});
owlog('listeners attached: keydown/keyup (movement)');

// where you are, so a return visit resumes there (URL params still win)
export const POS_KEY = 'magepunk_pos_v1';
// REPEL steps remaining. Persisted so it survives a reload mid-cave, and read by
// the step handler + encounters.roll. Nothing read the repel items before this.
export const REPEL_KEY = 'magepunk_repel_v1';
export const REPEL_LAST_KEY = 'magepunk_repellast'; // which repel kind was last used, for the wear-off re-offer
S.repelSteps = Math.max(0, parseInt(localStorage.getItem(REPEL_KEY), 10) || 0);
export function setRepel(n) { S.repelSteps = Math.max(0, n | 0); safeSaveStr(REPEL_KEY, String(S.repelSteps)); }
// the gadget key-items (Escape Rope / Itemfinder / Town Map), inert since
// day one. Returns true when the id was one of them (handled or refused).
export function useGadget(id) {
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
export function repelWoreOff() {
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
S.factoryStandalone = false;
export function savePos() {
	if (S.factoryStandalone) return; // the mini-game never persists position
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
export function interact() {
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
	if (S.baseCtx && baseDecoInteract(fx, fy)) return;
	const svc = services.kindAt(fx, fy);
	if (svc === 'nurse') {
		dialog.open('Welcome to the POKEMON CENTER!\n\nWe restored your POKEMON\nto full health. See you again!', () => { sfx('heal'); healParty(S.party); noteHealPoint(); });
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
	// KURT IS A STORY NPC BEFORE HE IS A SERVICE.
	//
	// The services.js 'kurt' zone covers Kurt1's tile (3,2) with no gating, so the
	// native apricorn counter answered every A press and his map script never ran.
	// Kurt1 is the beat that sets EVENT_AZALEA_TOWN_SLOWPOKETAIL_ROCKET and walks
	// him out of the house — so the Slowpoke Well guard never left, and Azalea,
	// the well, the Lure Ball and Bugsy's gym chain were all unreachable. Reported
	// with a call stack showing kurtTalk() reached straight from interact(), with
	// runScriptLabel never called.
	//
	// Kurt1 itself branches on EVENT_KURT_GAVE_YOU_LURE_BALL before anything else,
	// which is precisely where the counter should take over — so gate on the same
	// flag and let the script own him until then. Checked per press rather than at
	// map load, so the counter works the moment he hands the ball over.
	//
	// This is deliberately narrow. An audit of every service zone found 93 sitting
	// on an NPC with a real script, and all but Kurt are the port's own native
	// implementations (nurses, marts, the contest lobby, the Trick House) where
	// shadowing the script is the whole point. Kurt is the only one whose script
	// carries a story beat: setflag + move + hideobj.
	if (svc === 'kurt' && Story.getFlag('EVENT_KURT_GAVE_YOU_LURE_BALL')) { kurtTalk(); return; }
	if (svc === 'trickmaster') { trickMasterTalk(); return; }
	if (svc === 'trickscroll') { trickScrollFind(); return; }
	if (svc === 'trickend') { trickEndTalk(); return; }
	if (svc === 'ruinspuzzle') { openRuinsPuzzle(); return; }
	if (svc === 'contest') {
		if (!S.party.length) { dialog.open('You need a POKeMON to enter a Contest!'); return; }
		if (!(Contest.data?.opponents || []).length) { dialog.open('The hall is still being prepared for the next Contest...'); return; }
		sfx('ui_select');
		contestMenu.open = true; contestMenu.mode = 'category'; contestMenu.idx = 0; contestMenu.flash = null;
		return;
	}
	if (svc === 'berryblend') {
		if (!S.party.length) { dialog.open('The BLEND MASTER: Bring a POKeMON and some berries, friend!'); return; }
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
	// arcade boxes: Route 1 launches PokéChess; Pallet Town's launches Pair of Pears
	const arc = arcade.kindAt(fx, fy);
	if (arc === 'pokechess') {
		dialog.open('Do you want to play\nPOKéCHESS?', (k) => {
			if (k !== 'x') { saveParty(S.party); savePos(); location.href = 'pokechess.html' + (MP_ON ? '?mp=1' : ''); }
		});
		return;
	}
	if (arc === 'pears') {
		dialog.open('Do you want to play a\nPAIR OF PEARS?', (k) => {
			if (k !== 'x') { saveParty(S.party); savePos(); location.href = '/pairofpears/?direct=1'; }
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
		const lab = ev.script && ev.script !== '0x0' ? ev.script : null;
		const scr = lab ? S.mapScripts[lab] : null;
		// THE SCRIPT WINS WHENEVER IT DOES MORE THAN PRINT A LINE.
		//
		// sign_texts.json is a TEXT DUMP: it holds the `msg` a script would have
		// shown. That is a faithful stand-in for a plain sign, and a lie for anything
		// that branches, takes an item or sets a flag. Checking it FIRST — and
		// returning — meant 373 scripted bg_events across the three regions never ran
		// at all: the Abandoned Ship door puzzles, the gym statues, and
		// Route25_SeaCottage_EventScript_Computer, whose Cell Separator sets
		// FLAG_HELPED_BILL_IN_SEA_COTTAGE and is the ONLY source of the S.S. Ticket.
		// Reported as "the PC only ever says 'TELEPORTER is displayed on the PC
		// monitor'" — which is precisely the fallback line the dump captured, served
		// in place of the script that was supposed to decide whether to show it.
		//
		// The other 1038 are genuinely display-only, and keep the cheaper dump.
		if (scr && !scriptIsDisplayOnly(scr)) {
			// These 373 have never executed for a player. If one throws, degrade to
			// the old behaviour rather than eating the A press.
			try {
				runScriptLabel(lab);
				// Some of these are minigame machinery — Game Corner card flip, the
				// Roulette tables, the Berry Blender — whose opcodes this port has no
				// implementation for, so the script runs and produces nothing at all.
				if (!dialog.blocking && !cutscene.blocking) dialog.open(signTexts[lab] ? Story.normalizeText(signTexts[lab], cutsceneCtx()) : '...');
				return;
			} catch (e) {
				console.warn('[bg_event] script failed, falling back to its sign text', lab, e);
			}
		}
		if (signTexts[lab]) {
			// same normalizer NPC speech uses, so a sign never shows a raw "#"
			dialog.open(Story.normalizeText(signTexts[lab], cutsceneCtx()));
			return;
		}
		// A scripted bg_event with no entry in sign_texts.json used to fall
		// straight through and say NOTHING — 381 of them across 84 maps, including
		// every department-store elevator button and every Game Corner machine.
		// The map's own script usually has the label; run it the same way an NPC's
		// script runs, and let runScriptLabel's own fallback handle a dead label
		// (it says "..." rather than freezing).
		if (scr) {
			runScriptLabel(lab);
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
		if (DAYCARE_MAPS.has(mid)) {
			// Crystal's Day-Care Man gives the ODD EGG the first time you talk to him;
			// the native service used to swallow that conversation, so it never came
			if (npc.ev?.script === 'DayCareManScript_Inside' && !Story.getFlag('EVENT_GOT_ODD_EGG')
				&& runScriptLabel(npc.ev.script, npc)) return;
			openDaycare(); return;
		}
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
