// ow_sinnoh.js — the script specials SINNOH's source adds (src/sinnoh_specials.c, roamer.c in the Sinnoh source),
// and the scripted wild battles tools/stage_sinnoh.py carries through as one special each.
//
// runSinnohSpecial(name, set) is asked first by ow_story.js runSpecial for any `Sinnoh…` / `SnWild…` name. It
// returns 'wait' when it has started something the script must wait for, undefined when the name is not one it
// knows (runSpecial then answers as it does for any unknown special), and anything else when it is done.
import * as Story from './events.js';
import { battle } from './ow_core.js';
import { startScriptedWildBattle } from './ow_scaling.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import * as Dex from './pokedex.js';
import { safeLoad } from './safestore.js';

const days = () => Story.getVar('VAR_DAYS') | 0;
const party = () => (S.party || []).filter(Boolean);
const box = () => { const b = safeLoad('magepunk_box_v1', []); return Array.isArray(b) ? b.filter(Boolean) : []; };
const pick = list => list[Math.floor(Math.random() * list.length)];
const nameOf = id => (battle.data?.species?.[id]?.name || id || '').toUpperCase();
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
// the source's 32-bit hash of the day (it picks "today's" guests, leaders and tables with it)
const mul32 = (a, b) => Math.imul(a >>> 0, b >>> 0) >>> 0;
const lcg = seed => (mul32(seed, 1103515245) + 12345) >>> 0;

// HONEY TREES: slather one, come back another day, and something is on it
const HONEY_MONS = ['wurmple', 'wurmple', 'silcoon', 'cascoon', 'burmy', 'combee', 'combee', 'aipom', 'aipom', 'heracross', 'burmy', 'combee'];
let honeyPick = null;
export function honeyTreeMon() {
	honeyPick = { species: Math.floor(Math.random() * 100) === 0 ? 'munchlax' : pick(HONEY_MONS), level: 5 + Math.floor(Math.random() * 11) };
	Story.setStrVarText(1, nameOf(honeyPick.species));
	return honeyPick;
}

// ROAMERS the story lets loose (MESPRIT from its lake, CRESSELIA from Fullmoon Island, the birds after the
// League): ow_features.js ROAMERS has them, each waiting on the flag this sets
export const roamerFlag = id => 'sinnoh_roamer_' + id;

const AMITY = ['pikachu', 'clefairy', 'psyduck', 'togepi', 'shroomish', 'skitty', 'torchic', 'pachirisu', 'drifloon', 'buneary', 'happiny', 'jigglypuff',
	'turtwig', 'grotle', 'torterra', 'chimchar', 'monferno', 'infernape', 'piplup', 'prinplup', 'empoleon'];
const TROPHY = ['pikachu', 'clefairy', 'jigglypuff', 'meowth', 'chansey', 'ditto', 'eevee', 'porygon', 'pichu', 'cleffa', 'igglybuff', 'azurill', 'plusle', 'minun', 'castform', 'wynaut'];
const MARSH = ['bibarel', 'quagsire', 'wooper', 'skorupi', 'carnivine', 'croagunk', 'yanma', 'tangela', 'gulpin', 'kecleon', 'shroomish', 'arbok', 'exeggcute', 'toxicroak', 'drapion', 'staravia', 'roselia', 'marill'];
const ROTOM = ['rotom', 'rotomheat', 'rotomwash', 'rotomfrost', 'rotomfan', 'rotommow'];
const FOSSILS = ['ITEM_SKULL_FOSSIL', 'ITEM_ARMOR_FOSSIL'];
const BG_LEADERS = ['ROARK', 'GARDENIA', 'WAKE', 'MAYLENE', 'FANTINA', 'CANDICE', 'BYRON', 'VOLKNER'].map(n => 'FLAG_SN_HIDE_BG_' + n);
const BG_OTHERS = ['CHERYL', 'RILEY', 'MARLEY', 'BUCK', 'MIRA'].map(n => 'FLAG_SN_HIDE_BG_' + n);
const BG_MET = ['FLAG_HIDE_FOREST_CHERYL', 'FLAG_SN_RECEIVED_RIOLU_EGG', 'FLAG_SN_MARLEY_ESCORTED', 'FLAG_SN_BG_BUCK_LEFT', 'FLAG_SN_MIRA_ESCORTED'];

export function runSinnohSpecial(name, set) {
	// --- the scripted wild battles (SnWild__<SPECIES>__<LEVEL>) and a honey tree's ---
	let m = /^SnWild__([A-Z0-9_]+)__(\d+)$/.exec(name);
	if (m) return startScriptedWildBattle(norm(m[1]), +m[2]) === 'wait' ? 'wait' : null;
	if (name === 'SnWildHoney') { const h = honeyPick || honeyTreeMon(); honeyPick = null; return startScriptedWildBattle(h.species, h.level) === 'wait' ? 'wait' : null; }
	m = /^SinnohAddRoamer__([A-Z0-9_]+)__(\d+)$/.exec(name);
	if (m) { Story.setFlag(roamerFlag(norm(m[1]))); return null; }
	switch (name) {
		case 'SinnohHoneyTreeMon': honeyTreeMon(); return null;
		case 'SinnohHoneyReady': set(days() !== (Story.getVar('VAR_SN_HONEY_DAY') | 0) ? 1 : 0); return null;
		case 'SinnohHoneySlather': Story.setVar('VAR_SN_HONEY_DAY', days()); return null;
		case 'SinnohDayOfWeek': set(days() % 7); return null;
		case 'SinnohRestaurantVariant': set(days() % 3); return null;
		case 'SinnohMaidTarget': { const t = 5 + (mul32(days() + 3, 2654435761) >>> 28) % 5; set(t); Story.setStrVarText(1, String(t)); return null; }
		case 'SinnohBattlegroundMsgSet': Story.setVar('VAR_TEMP_4', (mul32(days() + 7, 2654435761) >>> 20) & 1); return null;
		case 'SinnohAddBattleTurns': { const v = (Story.getVar('VAR_0x8005') | 0) + (S.lastBattleTurns | 0); Story.setVar('VAR_0x8005', v); Story.setStrVarText(2, String(v)); return null; }
		case 'SinnohCountAllMons': set(party().length + box().length); return null;
		case 'SinnohPartyHasRotom': set(party().some(p => !p.egg && ROTOM.includes(p.speciesId)) ? 1 : 0); return null;
		case 'SinnohLeadMonIsCute': { const lead = party().find(p => !p.egg && p.curHP > 0); set(lead && AMITY.includes(lead.speciesId) ? 1 : 0); return null; }
		case 'SinnohPartyMaxRibbons': set(Math.max(0, ...party().map(p => (p.ribbons || []).length | 0))); return null;
		case 'SinnohUnownFormsCount': set(Dex.unownCount()); return null;
		case 'SinnohSpaTreatment': { const lead = party()[0]; if (lead) { lead.friend = Math.min(255, (lead.friend ?? 70) + 30); saveParty(S.party); Story.setStrVarText(1, (lead.nickname || lead.name || '').toUpperCase()); } return null; }
		// (the script copies VAR_RESULT and gives that item: a var may hold an ITEM_ symbol, events.js itemId)
		case 'SinnohRandomFossil': Story.setVar('VAR_RESULT', pick(Story.getVar('VAR_0x8004') ? [...FOSSILS, 'ITEM_HELIX_FOSSIL', 'ITEM_DOME_FOSSIL', 'ITEM_OLD_AMBER', 'ITEM_ROOT_FOSSIL', 'ITEM_CLAW_FOSSIL'] : FOSSILS)); return null;
		case 'SinnohMarshBinoculars': Story.setStrVarText(1, nameOf(MARSH[(days() * 5 + Math.floor(Math.random() * 3)) % MARSH.length])); return null;
		case 'SinnohNewsPressPick': { const seen = Object.keys(battle.data?.species || {}).filter(id => Dex.isSeen && Dex.isSeen(id)); Story.setStrVarText(1, nameOf(seen.length ? seen[(days() * 7 + 3) % seen.length] : 'bidoof')); return null; }
		case 'SinnohTrophyGardenPick': {
			Story.setFlag('FLAG_DAILY_SN_TROPHY');
			const sp = TROPHY[(days() * 3 + 1) % TROPHY.length];   // (one a day, as the source's daily flag makes it)
			S.sinnohTrophyMon = sp; Story.setStrVarText(1, nameOf(sp)); return null;
		}
		case 'SinnohBattlegroundSelect': {
			// who is in the Battleground today: 3 of the 8 leaders, and one of the others you have met
			BG_MET.forEach((f, i) => { if (!Story.getFlag(f)) Story.setFlag(BG_OTHERS[i]); });
			let seed = mul32(days() + 1, 2654435761), picked = 0;
			for (let i = 0; i < 3; i++) { seed = lcg(seed); let k = (seed >>> 16) % BG_LEADERS.length; while (picked & (1 << k)) k = (k + 1) % BG_LEADERS.length; picked |= 1 << k; }
			BG_LEADERS.forEach((f, i) => { if (!(picked & (1 << i))) Story.setFlag(f); });
			const open = BG_OTHERS.map((f, i) => (Story.getFlag(f) ? -1 : i)).filter(i => i >= 0);
			if (open.length) { seed = lcg(seed); const keep = open[(seed >>> 16) % open.length]; BG_OTHERS.forEach((f, i) => { if (i !== keep) Story.setFlag(f); }); }
			return null;
		}
		// the opening's and the tutorial's (neither is played here: you arrive with a party)
		case 'SinnohLoadCounterpartMon': case 'SinnohStartCatchTutorial': return null;
		default: return undefined;
	}
}
