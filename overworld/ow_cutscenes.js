// / ow_cutscenes.js — cutscenes: the script-runner context (cutsceneCtx) and NPC lookup by local id (split from main.js).
import * as Bag from './bag.js';
import * as Daycare from './daycare.js';
import { META } from './engine.js';
import * as Story from './events.js';
import { battle, cutscene, dialog, hud, npcs, player, trainers, world } from './ow_core.js';
import { dexMilestoneCheck } from './ow_follower.js';
import { buildMonForGift } from './ow_gamecorner.js';
import { shopMenu } from './ow_menukeys.js';
import { startScriptedWildBattle } from './ow_scaling.js';
import { S } from './ow_state.js';
import { runSpecial, startScriptedBattle } from './ow_story.js';
import { flyTo, warpTo } from './ow_transitions.js';
import { addCaught, healParty, saveParty } from './party.js';
import * as Dex from './pokedex.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	commonStrings,
} from './main.js';

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

export function npcById(localId) {
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
		strings: S.mapStrings,
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
		special: (name, store, op) => runSpecial(name, store, op), // handlers write `store`; unknown -> 0
		hud: msg => { hud.textContent = msg; },
	};
}
