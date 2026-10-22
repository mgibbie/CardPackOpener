// ow_battleresume.js — leave-and-resume for battles: the periodic battle snapshot, and rebuilding the right battle ending from it after a reload.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Story from './events.js';
import { battle, cutscene, evolution, hud, pvp, trainers, world } from './ow_core.js';
import { roamerEnd } from './ow_features.js';
import { dexMilestoneCheck } from './ow_follower.js';
import { frontier } from './ow_frontier.js';
import { safari, safariZoneOf, whiteOut, wildBattleEnd } from './ow_places.js';
import { onTrainerDefeated, runPostBattleScript } from './ow_progression.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { offerNickname } from './ow_screens.js';
import { S } from './ow_state.js';
import { staticBattleOutcome } from './ow_scaling.js';
import { cutsceneCtx, npcById } from './ow_cutscenes.js';
import { B_OUTCOME_WON, afterRival, completeVillainBeat, runScriptLabel } from './ow_story.js';
import { addCaught, healParty, saveParty } from './party.js';
import * as Dex from './pokedex.js';
import * as Quest from './quest.js';
import { rivalFlag } from './rivals.js';
import { safeLoad, safeSave } from './safestore.js';
import { isTabPaused } from './tab_lock.js';

// ---------- leave-and-resume for battles ----------
// Hitting the gear (or closing the tab) mid-battle used to vaporize the fight
// AND its ending — a rival or gym win that never landed its flags broke
// progression for good. The battle now persists like a dungeon run: a
// serializable snapshot (battle.snapshot) plus an endSpec tag naming which
// ending to rebuild, written every ~1.5s while a resumable battle runs and on
// pagehide, consumed at boot.
export const BATTLE_SAVE_KEY = 'magepunk_battle_v1';
// The id of the last battle that ENDED on this device. A snapshot carrying it is
// a finished battle, whoever wrote it, and is never resumed.
export const BATTLE_ENDED_KEY = 'magepunk_battle_ended_v1';
// A finished battle must never come back. 2026-10-15 (Instinct): ran from a wild
// CONIFUR ("Got away safely!"), saved, reloaded — and the same battle resumed,
// same HP, same stat stages; magepunk_battle_v1 still held it after the escape.
// The battle's own tab clears the key the frame the battle ends, so something
// else wrote it back: a SECOND tab. tab_lock pauses an older tab, but it only
// blocked the synced save keys — not this one — so a paused tab still in that
// battle went on writing its snapshot every 1.5s, and again on pagehide when it
// was closed or reloaded. Now: a paused tab never touches the snapshot (and the
// lock blocks the key outright); every battle carries an id, and the id of a
// battle that ended is remembered, so a stale copy of it is refused at boot; a
// battle whose outcome is already decided (the escape roll succeeded, the ball
// held, the result is on screen) is saved AS decided and resumes into its
// ending, never back into the fight.
let battleSaveAt = 0;
let tracked = null;        // the battle.active being persisted
let trackedId = null;      // ...and its id
let resumeId = null;       // the id a resumed battle carries over
let decidedSaved = false;  // the decided record for `tracked` is written
const newBattleId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function markEnded(id) {
	if (!id) return;
	try { localStorage.setItem(BATTLE_ENDED_KEY, id); } catch (e) { /* storage gone */ }
}
function stripMon(m) {
	if (!m) return null;
	const seen = new WeakSet();
	return JSON.parse(JSON.stringify(m, (k, v) => {
		if (typeof v === 'function') return undefined;
		if (v && typeof v === 'object') { if (seen.has(v)) return undefined; seen.add(v); }
		return v;
	}));
}
export function persistBattle() {
	if (isTabPaused()) return;   // another tab owns the game: its battle, its snapshot
	const a = battle.active;
	const resumable = battle.blocking && a && battle.endSpec && !pvp.blocking && !frontier.active;
	if (resumable && a !== tracked) {
		tracked = a; trackedId = resumeId || newBattleId(); resumeId = null; decidedSaved = false;
	}
	if (resumable) {
		// the outcome is settled but its ending has not run yet: record THAT
		const decided = a.phase === 'done' ? a.result : a.caughtMon ? 'caught' : a.decided || null;
		if (decided) {
			if (decidedSaved) return;
			decidedSaved = true;
			try {
				safeSave(BATTLE_SAVE_KEY, { v: 1, id: trackedId, decided, caught: decided === 'caught' ? stripMon(a.caughtMon) : null, end: battle.endSpec, map: world.current.name });
				saveParty(S.party);
			} catch (e) { console.warn('[battle-save] decided record failed', e); }
			return;
		}
		const now = performance.now();
		if (now - battleSaveAt < 1500) return;
		battleSaveAt = now;   // even a failed attempt waits — a throwing snapshot must not spin every frame
		try {
			const snap = battle.snapshot();
			if (!snap) return;
			safeSave(BATTLE_SAVE_KEY, { v: 1, id: trackedId, snap, end: battle.endSpec, map: world.current.name });
			saveParty(S.party);   // the party's mid-battle HP/PP must match the snapshot
		} catch (e) { console.warn('[battle-save] snapshot failed', e); }
	} else if (tracked && !battle.blocking) {
		// every ending (won, lost, ran, caught, fled, forfeited, doubles, partner,
		// static, legendary) comes through here: the battle is gone, so is its save
		markEnded(trackedId);
		tracked = null; trackedId = null; decidedSaved = false;
		try { localStorage.removeItem(BATTLE_SAVE_KEY); } catch (e) { /* storage gone */ }
	}
}
// a saved battle that can no longer be fought: the foe side is down, or yours is
function snapshotOver(snap) {
	if (!snap || !snap.foe) return true;
	const foesUp = snap.isTrainer ? (snap.foes || []).some(f => f && f.curHP > 0) : snap.foe.curHP > 0 || (snap.foeAlly?.curHP > 0);
	const mineUp = (S.party || []).some(m => m && m.curHP > 0 && !m.egg);
	return !foesUp || !mineUp;
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
	// a STATIC wild battle (an object's script: Power Plant's ELECTRODE, the
	// Snorlax in the road): finish its result as the live one does, then run the
	// rest of its script from the op after the battle — the fought flag and the
	// object's removal live there. Only on the map it started on.
	if (kind === 'static') return result => {
		// VAR_LAST_TALKED again: the object the script was started from (by index).
		// Before the outcome: a CAUGHT static removes VAR_LAST_TALKED right there.
		const talker = end.obj != null && end.map === world.current?.name ? npcById(end.obj) : null;
		if (talker) S.lastTalkedNpc = talker;
		if (!staticBattleOutcome(result, end.legendFlag || null)) return;
		if (cutscene.blocking || !end.frames || end.map !== world.current?.name) { saveParty(S.party); return; }
		const ok = cutscene.runFrom(S.mapScripts, end.frames, cutsceneCtx(talker, end.frames[0].label), () => { saveParty(S.party); });
		if (!ok) saveParty(S.party);
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
	if (!saved || !S.party) return false;
	try { localStorage.removeItem(BATTLE_SAVE_KEY); } catch (e) {}   // consume: a crash must not loop
	// a battle that already ENDED here (a stale copy written back by another tab)
	let ended = null; try { ended = localStorage.getItem(BATTLE_ENDED_KEY); } catch (e) {}
	if (saved.id && saved.id === ended) { console.warn('[battle-resume] refused: that battle already ended', saved.id); return false; }
	const onEnd = resumeEndHandler(saved.end, saved.map);
	// decided before the page went away: land its ending, don't refight it
	if (saved.decided) {
		battle.lastCaught = saved.decided === 'caught' ? saved.caught || null : null;
		battle.endSpec = null;
		markEnded(saved.id);
		const result = saved.decided === 'caught' && !saved.caught ? 'escaped' : saved.decided;
		try { onEnd(result); } catch (e) { console.warn('[battle-resume] decided ending failed', e); }
		return true;
	}
	if (!saved.snap) return false;
	if (snapshotOver(saved.snap)) { console.warn('[battle-resume] refused: the saved battle is already over'); markEnded(saved.id); return false; }
	const snap = saved.snap;
	resumeId = saved.id || null;   // the resumed battle keeps its id
	battle.endSpec = saved.end || { kind: 'wild' };
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
