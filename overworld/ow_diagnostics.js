// ow_diagnostics.js — input diagnostics: openCanvasMenus() and gateReport(), which name every movement gate at once (?owlog=1 traces the rest). Split from main.js.
import { choiceMenu } from './choice.js';
import { phoneMenu } from './phone.js';
import { battle, cutscene, dialog, evolution, factorySpec, player, pvp, trainers, world } from './ow_core.js';
import { fade, fading } from './ow_fade.js';
import { decoMenu, radioMenu, socialMenu } from './ow_features.js';
import { gcMenu, vfMenu } from './ow_gamecorner.js';
import { heldKeys, tickStats, typingInChat } from './ow_input.js';
import { bagMenu, bpShopMenu, ferryMenu, menuBlocking, pcMenu, portalMenu, shopMenu } from './ow_menukeys.js';
import { cardsMenu, deckSelect, dexMenu, optionsMenu, partyMenu, playerMenu, questMenu, runMenu, startMenu, townMap, trade, trainerCard } from './ow_menustate.js';
import { slotsMenu } from './ow_minigames.js';
import { daycareMenu, halfParty, moveShop, nameRater, tradeMenu } from './ow_music.js';
import { editView } from './ow_render.js';
import { friendsMenu, mailMenu } from './ow_screens.js';
import { S } from './ow_state.js';
import { blendMenu, contestMenu, slideMenu, unownDex } from './ow_venues.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	dpadDir, rejectedMoves, starterMenu,
} from './main.js';

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
		tradeMenu, gcMenu, vfMenu, contestMenu, blendMenu, slideMenu, decoMenu, socialMenu, slotsMenu, phoneMenu, choiceMenu };
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
