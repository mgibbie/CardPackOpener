// ow_frontier.js — the Battle Frontier: the seven facilities, challenge runs and streaks, the Factory spectator publish, and the end-of-run flow.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Chat from '../battlecards/chat.js';
import * as MP from '../battlecards/mpmode.js';
import * as Badges from './badges.js';
import * as BUI from './battleui.js';
import * as Frontier from './frontier.js';
import { battle, dialog, sctx } from './ow_core.js';
import { syncOverworldAchievements } from './ow_saves.js';
import { S } from './ow_state.js';
import { healParty, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { openBpShop } from './ow_menukeys.js';
import {
	MP_ON, factoryStandalone,
} from './main.js';

// ---------- BATTLE FRONTIER (7 facilities) ----------
// Each facility is a variation on a shared streak/BP core (see FACILITIES in
// frontier.js): heal-or-endurance, endless-or-fixed-rounds, your-team-or-rentals.
// Lobby reception counters (attendant tiles) that start each facility's challenge:
// `tiles` = the reception counter that starts the challenge; `bp` = a side attendant
// (a real lobby NPC's tile) who runs the BP EXCHANGE.
export const FACILITY_LOBBIES = {
	MAP_BATTLE_FRONTIER_BATTLE_TOWER_LOBBY:   { facility: 'tower',   tiles: [[6, 5], [10, 5], [14, 5], [18, 5]], bp: [[23, 5]] },
	MAP_BATTLE_FRONTIER_BATTLE_DOME_LOBBY:    { facility: 'dome',    tiles: [[5, 10], [17, 10]], bp: [[1, 11]] },
	MAP_BATTLE_FRONTIER_BATTLE_FACTORY_LOBBY: { facility: 'factory', tiles: [[4, 7], [14, 7]], bp: [[3, 11]] },
	MAP_BATTLE_FRONTIER_BATTLE_PALACE_LOBBY:  { facility: 'palace',  tiles: [[5, 6], [19, 6]], bp: [[18, 10]] },
	MAP_BATTLE_FRONTIER_BATTLE_ARENA_LOBBY:   { facility: 'arena',   tiles: [[7, 7]], bp: [[2, 10]] },
	MAP_BATTLE_FRONTIER_BATTLE_PIKE_LOBBY:    { facility: 'pike',    tiles: [[5, 5]], bp: [[10, 9]] },
	MAP_BATTLE_FRONTIER_BATTLE_PYRAMID_LOBBY: { facility: 'pyramid', tiles: [[7, 12]], bp: [[2, 15]] },
	// the three Battle Tents — each lobby's Attendant stands at (6,5). No `bp`
	// row: the BP EXCHANGE stays a Frontier facility, the tents only pay it out.
	MAP_SLATEPORT_CITY_BATTLE_TENT_LOBBY:  { facility: 'slateporttent',  tiles: [[6, 5]] },
	MAP_VERDANTURF_TOWN_BATTLE_TENT_LOBBY: { facility: 'verdanturftent', tiles: [[6, 5]] },
	MAP_FALLARBOR_TOWN_BATTLE_TENT_LOBBY:  { facility: 'fallarbortent',  tiles: [[6, 5]] },
};
export const frontier = { active: false, streak: 0, cfg: null, runParty: null };
// heal a team IN MEMORY without persisting — used between Frontier bouts so the run
// party (which may be generated RENTALS) never overwrites the real saved party
function healTeam(team) {
	for (const m of (team || [])) { if (!m) continue; m.curHP = m.maxHP; m.status = null; for (const mv of m.moves || []) mv.pp = mv.maxPp; }
}
function facLevel(cfg) {
	const base = Math.min(Badges.MAX_LEVEL, Math.max(50, ...((S.party || []).filter(Boolean).map(m => m.level || 50))));
	if (cfg.level === 50) return 50;
	if (cfg.level === 'party+5') return Math.min(Badges.MAX_LEVEL, base + 5);
	return base;
}
// ---- spectate broadcast: publish a board snapshot of the run so friends can watch ----
export let frontierSeq = 0, frontierLastSnap = '', frontierPubTimer = null, frontierWatchers = 0;
export function factorySnapshot() {
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
	const uname = S.mpAccount?.username; // runner + spectators share the run's chat room
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
export function drawWatchingBadge(W, H) {
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

export function startFacility(id) {
	const cfg = Frontier.FACILITIES[id];
	if (!cfg || !S.party || !leadMon(S.party) || frontier.active || battle.blocking) return;
	const runParty = cfg.rental ? Frontier.genTeam(battle.data, facLevel(cfg), cfg.size) : S.party;
	if (cfg.rental && !runParty.length) { dialog.open('No rental POKeMON are available right now.'); return; }
	frontier.active = true; frontier.streak = 0; frontier.cfg = cfg; frontier.id = id; frontier.runParty = runParty;
	startFrontierPublish();
	const intro = cfg.rental ? `The ${cfg.name} challenge begins!\n\nYou’ll battle with a set of RENTAL POKeMON.`
		: cfg.heal ? `The ${cfg.name} challenge begins!\n\nBattle on — and don’t lose!`
			: `The ${cfg.name} challenge begins!\n\nNo healing between bouts — endure!`;
	dialog.open(intro, frontierNext);
}
// backward-compatible alias (the Battle Tower)
export function startFrontierChallenge() { startFacility('tower'); }
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
	battle.endSpec = null;   // frontier runs have their own state machine — never snapshot these
	battle.startTrainer(frontier.runParty, foe, info, result => {
		if (result !== 'victory') { endFacility(); return; }
		frontier.streak++; Frontier.addBP(cfg.bpWin); Frontier.recordStreak(frontier.streak);
		if (!cfg.rental) saveParty(S.party);
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
	if (factoryStandalone) healTeam(S.party); else healParty(S.party); // heal+save only for a real save
	frontierEndDialog(`You conquered the ${cfg.name}!\n\nAll ${cfg.rounds} rounds won — bonus +${cfg.bonus || 0} BP!\nTotal BP: ${Frontier.getBP()}`);
}
function endFacility() {
	const cfg = frontier.cfg, s = frontier.streak;
	frontier.active = false; frontier.streak = 0; stopFrontierPublish();
	if (factoryStandalone) healTeam(S.party); else healParty(S.party);
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
