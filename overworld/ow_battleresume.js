// ow_battleresume.js — leave-and-resume for battles: the periodic battle snapshot, and rebuilding the right battle ending from it after a reload.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Story from './events.js';
import { battle, evolution, hud, pvp, trainers, world } from './ow_core.js';
import { roamerEnd } from './ow_features.js';
import { dexMilestoneCheck } from './ow_follower.js';
import { frontier } from './ow_frontier.js';
import { safari, safariZoneOf, whiteOut, wildBattleEnd } from './ow_places.js';
import { onTrainerDefeated, runPostBattleScript } from './ow_progression.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { offerNickname } from './ow_screens.js';
import { S } from './ow_state.js';
import { B_OUTCOME_WON, afterRival, completeVillainBeat, runScriptLabel } from './ow_story.js';
import { addCaught, healParty, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { rivalFlag } from './rivals.js';
import { safeLoad, safeSave } from './safestore.js';

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

export function resumeSavedBattle() {
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
