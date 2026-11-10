// ow_leaveguard.js — what leaving the overworld through the site's Games switcher
// (site/switcher.js, controls sweep B2) costs, declared on window.mpLeaveGuard:
//   - a scripted cutscene: BLOCKED (the switcher doesn't open; finish the scene)
//   - a live PvP battle: ask first (it counts as a loss)
//   - a Battle Frontier / Trainer Hill challenge: ask first (the streak ends)
//   - a Game Corner game with coins on the table: ask first (the bet is spent)
//   - anything else is safe. A wild / trainer battle resumes on its own
//     (ow_battleresume.js snapshots it), so it needs no question.
// Whatever the state, leaving saves the player's position first (savePos only
// writes on a map change otherwise).
import { cutscene, pvp, world } from './ow_core.js';
import { frontier } from './ow_frontier.js';
import { savePos } from './ow_input.js';
import { S } from './ow_state.js';
import { slotsMenu } from './ow_minigames.js';
import { crystalSlots } from './ow_crystalslots.js';
import { vfMenu } from './ow_gamecorner.js';
import { cardFlip } from './minigames/cardflip/cardflip.js';

export function saveBeforeLeave() {
	if (S.loading || !world.current || window.__mapedit) return;   // (the owner's map editor: its own saves)
	try { savePos(); } catch (e) { console.warn('[leave] savePos failed', e); }
}

export function leaveGuard() {
	const beforeLeave = saveBeforeLeave;
	if (cutscene.blocking) return { state: 'block', message: 'Not during a cutscene — switch games once it ends.' };
	if (pvp.blocking) return { state: 'confirm', message: 'You\'re in a live battle. Leaving now counts as a loss.', beforeLeave };
	if (frontier.active) return { state: 'confirm', message: `Leaving ends your Battle Frontier challenge (streak ${frontier.streak || 0}).`, beforeLeave };
	if (S.hillRun) return { state: 'confirm', message: 'Leaving ends your Trainer Hill challenge.', beforeLeave };
	if (slotsMenu.open || crystalSlots.open || cardFlip.open || (vfMenu.open && vfMenu.game)) {
		return { state: 'confirm', message: 'Coins already bet are spent, and this round is lost.', beforeLeave };
	}
	return { state: 'safe', beforeLeave };
}

export function installLeaveGuard() {
	if (typeof window !== 'undefined') window.mpLeaveGuard = leaveGuard;
}
