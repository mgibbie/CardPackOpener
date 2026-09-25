// ow_music.js — background music (the per-map BGM table, region/time/battle/event overrides, the BGM tick), plus the service-counter menus that followed it in main.js: DAY CARE, NAME RATER, move deleter, the multi-battle party picker, the town map and the options keys.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Clock from './clock.js';
import { Contest } from './contest.js';
import * as Daycare from './daycare.js';
import { getJSON } from './engine.js';
import * as Story from './events.js';
import * as Fly from './flydata.js';
import { battle, cutscene, dialog, player, world } from './ow_core.js';
import { KEYBIND_KEY, KEY_ACTIONS } from './ow_keybinds.js';
import { levelCapNow, playerRegion } from './ow_progression.js';
import { restoreBackup, runSaveAction } from './ow_saves.js';
import { S } from './ow_state.js';
import { contestMenu } from './ow_venues.js';
import { safeSave } from './safestore.js';
import * as Settings from './settings.js';
import { bgm, sfx, syncBgmVolume } from './sound.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { OPTION_ACTIONS, OPTION_KEYS, optionsMenu, townMap } from './ow_menustate.js';
import { flyTo, hasFlyPoint } from './ow_transitions.js';


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
export let musicMap = null;
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
export function bgmGame() {
	const k = musicMap?.[world.current?.map?.id];
	if (k) return k.split('_')[0];
	const r = playerRegion();
	return r === 'KANTO' ? 'firered' : r === 'HOENN' ? 'emerald' : 'crystal';
}
export function battleThemeKey(a) {
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
export function bgmTick() {
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
			: S.radioTune ? S.radioTune                // a tuned-in radio takes over the room's music
			: player.surfing ? T?.surf
			: player.biking ? T?.bike
			: (musicMap[world.current?.map?.id] || null);
	}
	if (want !== bgmWant) { bgmWant = want; bgm(want); }
}
export function syncMapBgm() { bgmTick(); }
getJSON('data/music_map.json').then(m => { musicMap = m || {}; syncMapBgm(); }).catch(() => { musicMap = {}; });
getJSON('data/contest.json').then(d => Contest.init(d)).catch(() => Contest.init(null));

export function optionsKey(k) {
	const om = optionsMenu;
	if (om.mode === 'controls') {
		if (om.capture) return; // the raw keydown listener owns the capture
		const rows = KEY_ACTIONS.length + 2; // + RESET ALL + BACK
		if (k === 'ArrowUp') om.idx = (om.idx + rows - 1) % rows;
		if (k === 'ArrowDown') om.idx = (om.idx + 1) % rows;
		if (k === 'x' || k === 'Escape') { om.mode = 'main'; om.idx = OPTION_KEYS.length + 3; om.flash = null; return; }
		if (k !== 'z' && k !== 'Enter') return;
		if (om.idx === KEY_ACTIONS.length) { // RESET ALL
			S.keyBinds = {}; safeSave(KEYBIND_KEY, S.keyBinds);
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
export const daycareMenu = { open: false, mode: 'main', idx: 0, flash: null };
// in-game NPC trade: the offer, then a party picker (see trades.js)
export const tradeMenu = { open: false, trade: null, idx: 0, flash: null, talker: null };
export const nameRater = { open: false, idx: 0 };
// ChooseHalfPartyForBattle: pick up to 3 for a multi battle, in order
export const halfParty = { open: false, idx: 0, picked: [], flash: null };
export const moveShop = { open: false, mode: 'main', idx: 0, mon: null, list: null, flash: null };

export function openDaycare() { daycareMenu.open = true; daycareMenu.mode = 'main'; daycareMenu.idx = 0; daycareMenu.flash = null; }
export function openNameRater() { nameRater.open = true; nameRater.idx = 0; }
// Runs UNDER the paused script (the special returns 'wait'); VAR_RESULT is 1 on
// confirm, 0 on cancel — the script loops back to its prompt on 0.
export const halfPartyNeed = () => Math.min(3, (S.party || []).filter(m => m.curHP > 0).length);
export function openHalfParty() {
	if (!halfPartyNeed()) { Story.setVar('VAR_RESULT', 0); return; }
	Object.assign(halfParty, { open: true, idx: 0, picked: [], flash: null });
	return 'wait';
}
function closeHalfParty(ok) {
	halfParty.open = false;
	Story.setVar('VAR_RESULT', ok ? 1 : 0);
	if (!ok) halfParty.picked = [];
	cutscene.resume();
}
export function halfPartyKey(k) {
	const n = S.party.length + 1;   // the mons, then BATTLE
	if (k === 'ArrowUp') halfParty.idx = (halfParty.idx + n - 1) % n;
	if (k === 'ArrowDown') halfParty.idx = (halfParty.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { closeHalfParty(false); return; }
	if (k !== 'z' && k !== 'Enter') return;
	if (halfParty.idx === S.party.length) {
		const need = halfPartyNeed();
		if (halfParty.picked.length === need) closeHalfParty(true);
		else halfParty.flash = `Choose ${need} POKeMON.`;
		return;
	}
	const i = halfParty.idx, mon = S.party[i];
	const at = halfParty.picked.indexOf(i);
	if (at >= 0) { halfParty.picked.splice(at, 1); halfParty.flash = null; return; }
	if (!mon || mon.curHP <= 0) { halfParty.flash = `${mon?.name || 'It'} can't battle.`; return; }
	if (halfParty.picked.length >= halfPartyNeed()) { halfParty.flash = 'Three are already chosen.'; return; }
	halfParty.picked.push(i);
	halfParty.flash = null;
	if (halfParty.picked.length === halfPartyNeed()) halfParty.idx = S.party.length;   // hop to BATTLE
}
export function openMoveShop() { moveShop.open = true; moveShop.mode = 'main'; moveShop.idx = 0; moveShop.mon = null; moveShop.flash = null; }

// open the Town Map to the region of the current map (or the first visited one)
export function openTownMap() {
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

export function townKey(k) {
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
export function daycareOptions() {
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
	if (Daycare.canDeposit() && S.party.length > 1) opts.push({ label: 'Leave a POKeMON', act: 'deposit' });
	opts.push({ label: 'See you later', act: 'leave' });
	return opts;
}
