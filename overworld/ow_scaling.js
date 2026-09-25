// ow_scaling.js — postgame level scaling (JohKanto wilds/trainers relative to your lead) and alternate forms (form changes, form sprites).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import { statsFor } from './battle.js';
import * as Story from './events.js';
import { battle, cutscene, evolution, hud, world } from './ow_core.js';
import { offerNickname } from './ow_screens.js';
import { S } from './ow_state.js';
import { B_OUTCOME_CAUGHT, B_OUTCOME_LOST, B_OUTCOME_RAN, B_OUTCOME_WON } from './ow_story.js';
import { addCaught, leadMon, saveParty } from './party.js';
import * as Dex from './pokedex.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import { whiteOut } from './ow_places.js';
import { dexMilestoneCheck } from './ow_follower.js';
import {
	cutsceneCtx,
} from './main.js';

// ---------- postgame level scaling ----------
// JOHKANTO is the postgame region. Its roster is authored for a team that has
// just won a League — Lv50-77 across the eight gym territories — but the cap now
// runs to 255, so without this the whole region turns into a formality the moment
// you out-level it, which is exactly the content the coverage work just filled.
//
// The scale is RELATIVE, not a flat "match the player": multiplying keeps the
// gym-order ramp intact, so Brock's territory stays easier than Blue's at every
// player level. And it only ever scales UP, capped by the level cap and by your
// own lead — the region can meet you, never outrun you.
const JOHKANTO_DESIGN_LEVEL = 60;   // the middle of the authored 50-77 band
// Read from the MAP, not the player's saved region: `magepunk_region` is which
// region you started in, and you can walk into JohKanto from either side.
// Unprefixed border maps (Seafoam, Cerulean Cave) are shared with Kanto and are
// deliberately left alone.
export function inJohKanto() { return /^MAP_JOHKANTO_/.test(world.current?.map?.id || ''); }
function partyLead() { return Math.max(1, ...((S.party || []).filter(Boolean).map(m => m.level || 1)), 1); }
// WILD ENCOUNTERS: a band below the route trainers.
//
// The old relative multiply had two faults. It CLAMPED AT YOUR LEAD, so once you
// were strong every territory from Erika's up pinned flat to the same number and
// the eight-territory ramp — the thing the whole postgame roster is organised
// around — disappeared exactly when the region was supposed to be at its
// hardest. And a wild mon at precisely your lead, on every step through the
// grass, is relentless in a way a route trainer every few screens is not.
//
// So the authored band maps onto a band under your lead, the same way the route
// trainers' does, just lower. That keeps Brock's routes easier than Blue's at
// every player level, and stacks the region into a readable ladder:
//
//   wild  lead-20..-5   ·   route trainer  lead-12..-2
//   gym   lead+1/+2     ·   elite  +2/+3   ·   champion  +3/+5
//
// 50 and 78 are the measured span of encounters_postgame.js, not a guess. The
// three JohKanto maps with no postgame roster (Celadon, Pallet, Route 12) hold
// authentic Crystal water tables down at Lv2 — those clamp to the bottom of the
// band, which is right: nothing in the endgame region should be a Lv2 Goldeen.
//
// Never DOWN, and deliberately not clamped by the level cap. The cap is keyed on
// badges in the three shared regions and says what you *should* be; your lead
// says what you *are*. Clamping to the cap made a Lv150 party fight Lv20 foes
// whenever the cap had not caught up, which is the opposite of the point.
const WILD_BAND = { lo: 50, hi: 78 };
const WILD_UNDER_LEAD = { weakest: 20, strongest: 5 };
export function wildEncounterLevel(level) {
	if (!inJohKanto()) return level;   // guarded HERE, not at the call site
	const lead = partyLead();
	if (lead <= JOHKANTO_DESIGN_LEVEL) return level;
	const t = Math.max(0, Math.min(1, (level - WILD_BAND.lo) / (WILD_BAND.hi - WILD_BAND.lo)));
	const under = WILD_UNDER_LEAD.weakest + t * (WILD_UNDER_LEAD.strongest - WILD_UNDER_LEAD.weakest);
	return Math.max(level, Math.min(lead, Math.round(lead - under)));
}
// A legendary should never be a pushover, wherever it is: lift it toward your
// lead if you have outgrown it, but never past your lead and never DOWN, so
// Articuno at Lv50 is still a wall for a mid-game Kanto team.
export function scaleLegendaryLevel(level) {
	const lead = partyLead();
	return Math.max(level, lead);
}
// A JOHKANTO gym leader is levelled off your strongest POKeMON: the team sits one
// level above it and the ace two. Walk in under-levelled and it is a close fight;
// come back at Lv200 and it is still a close fight. Clamped to MAX_LEVEL so the
// last gyms cannot ask for a level that cannot exist.
// ROUTE TRAINERS sit in a band just under your lead.
//
// The relative scale alone PRESERVES WEAKNESS. JohKanto's 94 route trainers are
// Crystal-era rosters authored Lv23-38, so multiplying by lead/60 puts them at
// Lv58-95 against a Lv150 party — half your level, which is not a fight, and the
// region is meant to be the hardest in the game.
//
// Their ORDERING is worth keeping (a Youngster should still be easier than an Ace
// Trainer), so the authored band is mapped onto a band under your lead rather than
// flattened to a single number. Measured, not guessed: 23 and 38 are the real min
// and max ace levels across those 94.
const ROUTE_BAND = { lo: 23, hi: 38 };
const ROUTE_UNDER_LEAD = { weakest: 12, strongest: 2 };
export function routeTrainerLevel(level) {
	if (!inJohKanto()) return level;   // guarded HERE, not at the call site
	const lead = partyLead();
	if (lead <= JOHKANTO_DESIGN_LEVEL) return level;
	const t = Math.max(0, Math.min(1, (level - ROUTE_BAND.lo) / (ROUTE_BAND.hi - ROUTE_BAND.lo)));
	const under = ROUTE_UNDER_LEAD.weakest + t * (ROUTE_UNDER_LEAD.strongest - ROUTE_UNDER_LEAD.weakest);
	return Math.max(level, Math.min(lead, Math.round(lead - under)));
}

// gym team / ace, then the league above it. The four elites and the Champion are
// a step up from a gym rather than the same fight again — that is the whole
// shape of a league — but they are the same rule, just further ahead.
const BOSS_OVER_LEAD = { gym: [1, 2], elite: [2, 3], champion: [3, 5] };
export function bossLevelFor(kind, isAce) {
	const [team, ace] = BOSS_OVER_LEAD[kind] || BOSS_OVER_LEAD.gym;
	return Math.min(Badges.MAX_LEVEL, partyLead() + (isAce ? ace : team));
}
// kept as the name the gym work used; a JohKanto gym is the `gym` row above
export function gymLevelFor(isAce) { return bossLevelFor('gym', isAce); }
// Mt Silver is a JOHTO map, so inJohKanto() is false there — the league is
// recognised by its SCRIPT instead, which is also the only thing that can tell
// an elite from a champion.
export function johkantoLeagueKind(script) {
	const info = Badges.scriptInfo(script);
	return (info && info.region === 'JOHKANTO' && (info.kind === 'elite' || info.kind === 'champion'))
		? info.kind : null;
}

// ---------- alternate forms ----------
// A form shares its base species' DEX NUMBER — that is the only link the data
// has, since species_battle.json carries no baseSpecies/forme fields. Base first
// (the id without an underscore), then the forms in id order, so cycling is
// stable and always returns you to where you started.
let formIndex = null;
export function formsOf(speciesId) {
	if (!formIndex) {
		formIndex = new Map();
		const byNum = new Map();
		for (const [id, sp] of Object.entries(battle.data.species || {})) {
			if (id.startsWith('_') || !(sp?.num > 0)) continue;
			(byNum.get(sp.num) || byNum.set(sp.num, []).get(sp.num)).push(id);
		}
		for (const ids of byNum.values()) {
			if (ids.length < 2) continue;
			const base = ids.filter(i => !i.includes('_')).sort()[0];
			if (!base) continue;                                   // no plain base: not a form family
			const family = [base, ...ids.filter(i => i !== base).sort()];
			for (const id of family) formIndex.set(id, family);
		}
	}
	return formIndex.get(speciesId) || null;
}
// Turn a caught POKeMON into the next form its species has. Everything the mon
// earned — level, IVs, EVs, nature, friendship, nickname, moves — is ITS OWN and
// survives; only what the SPECIES decides is rebuilt.
export function cycleForm(mon) {
	const family = formsOf(mon.speciesId);
	if (!family || family.length < 2) return null;
	const next = family[(family.indexOf(mon.speciesId) + 1) % family.length];
	const sp = battle.data.species[next];
	if (!sp) return null;
	// a nickname is the player's, a species name is not — only replace the latter
	const oldName = (battle.data.species[mon.speciesId]?.name || '').toUpperCase();
	if (!mon.name || mon.name === oldName) mon.name = (sp.name || next).toUpperCase();
	mon.speciesId = next;
	mon.types = [...(sp.types || [])];
	mon.sprite = sp.sprite;
	mon.num = sp.num;
	const dmg = mon.maxHP - mon.curHP;
	mon.stats = statsFor(sp, mon.ivs || { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, mon.level, mon);
	mon.maxHP = mon.stats.hp;
	mon.curHP = Math.max(1, mon.maxHP - dmg);   // keep the wound, not the number
	Dex.markSeen(next); Dex.markCaught(next);
	dexMilestoneCheck();
	return sp.name || next;
}
// A STATIC wild battle started BY A SCRIPT: the Snorlax asleep in the road, the
// Sudowoodo posing as a tree, the Voltorb disguised as a Rocket-base switch.
//
// Both transpilers dropped the battle itself and kept everything around it, so
// these scripts played out in full and never fought: FireRed's `setwildbattle` +
// `dowildbattle` vanished, and Crystal's `loadwildmon` + `startbattle` came
// through as a `trainerbattle` with an empty trainer id. On Route 12 that meant
// using the POKe FLUTE woke the Snorlax, hid it, and moved on — the species was
// catchable nowhere in the game as a result.
//
// Blocks the script like a trainer battle does, and records the real outcome so
// the script's own `GetBattleOutcome` branch works instead of always reading WON.
export function startScriptedWildBattle(species, level) {
	if (!species || !battle.data?.species?.[species]) return 'skip';
	if (!S.party || !leadMon(S.party) || battle.blocking) return 'skip';
	Dex.markSeen(species);
	battle.endSpec = { kind: 'wild' };   // the blocking script is gone after a reload; a plain wild ending is safe
	battle.start(S.party, species, level, result => {
		if (result === 'caught' && battle.lastCaught) {
			Dex.markCaught(battle.lastCaught.speciesId); dexMilestoneCheck();
			const where = addCaught(S.party, battle.lastCaught);
			hud.textContent = `${battle.lastCaught.name} ${where === 'party' ? 'joined the party!' : 'was sent to the box'}`;
			offerNickname(battle.lastCaught);
			S.lastBattleOutcome = B_OUTCOME_CAUGHT;
			Story.setVar('VAR_RESULT', B_OUTCOME_CAUGHT);
			cutscene.resume();
		} else if (result === 'victory') {
			S.lastBattleOutcome = B_OUTCOME_WON;
			Story.setVar('VAR_RESULT', B_OUTCOME_WON);
			evolution.check(S.party, battle.data);
			saveParty(S.party);
			cutscene.resume();
		} else if (result === 'defeat') {
			// blacked out: heal and abandon the rest of the script, as trainer
			// battles do. Note the static is GONE either way — the decomp scripts
			// set the object's hide flag before the battle, not after, so losing to
			// the Route 12 Snorlax costs you that Snorlax. That is what the original
			// does, and the second one on Route 16 is the game's own second chance.
			S.lastBattleOutcome = B_OUTCOME_LOST;
			Story.setVar('VAR_RESULT', B_OUTCOME_LOST);
			whiteOut();
			cutscene.stop();
		} else {
			// ran / it fled — the decomp scripts treat RAN the same as WON (the
			// encounter is over and the object goes away), so let the script run on
			S.lastBattleOutcome = B_OUTCOME_RAN;
			Story.setVar('VAR_RESULT', B_OUTCOME_RAN);
			saveParty(S.party);
			cutscene.resume();
		}
	});
	return 'wait';
}
export function startCutscene(steps, onDone) {
	if (cutscene.blocking) return;
	cutscene.start(steps, cutsceneCtx(), onDone);
}
