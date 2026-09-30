// phone.js — the PHONE: one device in every region.
//
// Contacts are trainers who gave you their number, plus MOM and your region's
// PROFESSOR. They call now and then (a chat, "I'm stronger now, come battle me
// on ROUTE 38!", "I found you a present!"), you can call them from the START
// menu, and a trainer who asked for a rematch battles you with their next,
// stronger team when you talk to them.
//
// The data (overworld/phone_data.json, tools/gen_phone_data.mjs) comes from
// the decomps:
//   JOHTO  the 28 Crystal phone trainers: their own number-ask / rematch /
//          gift scripts (the transpile flattened them), every call line, their
//          rematch teams. Ready/gift state is Crystal's own ENGINE_* flags, so
//          the converted scripts read it directly.
//   HOENN  Emerald's Match Call trainers (gRematchTable): the scripts register
//          you (PhoneRegister, restored where register_matchcall was dropped);
//          rematches pick the next team tier.
//   KANTO  FireRed has no phone: the VS SEEKER's rematch trainers offer their
//          number after you beat them.
import * as Story from './events.js';
import * as Bag from './bag.js';
import * as Badges from './badges.js';
import { battle, cutscene, dialog, evolution, hud, trainers, world } from './ow_core.js';
import { S } from './ow_state.js';
import { safeLoad, safeSave } from './safestore.js';
import { buildMon as battleBuildMon } from './battle.js';
import { cutsceneCtx } from './ow_cutscenes.js';
import { playerRegion, startTrainerBattle } from './ow_progression.js';
import { sfx } from './sound.js';

const KEY = 'magepunk_phone_v1';
export const PHONE_CAP = 50;   // Crystal held 10; a three-region game needs more

// ---------- data ----------
let DATA = null;
const BY_KEY = new Map();      // 'JOHTO:DANA' -> contact
const BY_OBJECT = new Map();   // 'Route102:Route102_EventScript_Calvin' -> contact (HOENN/KANTO)
export async function loadPhoneData(getJSON) {
	if (DATA) return DATA;
	DATA = await getJSON('phone_data.json').catch(() => null);
	if (!DATA) { DATA = { johto: [], hoenn: [], kanto: [], scriptOverrides: {}, teams: {} }; return DATA; }
	for (const c of [...DATA.johto, ...DATA.hoenn, ...DATA.kanto]) {
		c.key = `${c.region}:${c.id}`;
		BY_KEY.set(c.key, c);
		for (const [stem, label] of Object.entries(c.labels || {})) BY_OBJECT.set(`${stem}:${label}`, c);
	}
	return DATA;
}
// the Crystal rematch teams the roster import never had (never overriding one it did)
export function mergePhoneTeams(teams) {
	if (!DATA || !teams) return;
	for (const [k, v] of Object.entries(DATA.teams || {})) if (!teams[k]) teams[k] = v;
}
// a map's scripts with the phone versions laid over them
export function phoneScriptOverrides(stem) { return (DATA && DATA.scriptOverrides && DATA.scriptOverrides[stem]) || {}; }
export const contactFor = key => BY_KEY.get(key) || null;
export function contactForTrainer(t) {
	const stem = world.current && world.current.name;
	return (t && t.ev && BY_OBJECT.get(`${stem}:${t.ev.script}`)) || null;
}

// ---------- state ----------
const blank = () => ({ has: false, contacts: [], ready: {}, gift: {}, tier: {}, steps: 0, lastCallAt: 0 });
let st = null;
const state = () => { if (!st) { st = Object.assign(blank(), safeLoad(KEY, {}) || {}); } return st; };
const save = () => safeSave(KEY, state());
export function _resetForTest() { st = null; }
export const hasPhone = () => !!state().has;
export const isRegistered = key => state().contacts.includes(key);

// the region's professor and home
const PROF = { JOHTO: 'PROF. ELM', KANTO: 'PROF. OAK', HOENN: 'PROF. BIRCH' };
function builtins() {
	const r = playerRegion() || 'KANTO';
	return [
		{ key: 'MOM', name: 'MOM', cls: '', place: 'HOME', builtin: true },
		{ key: 'PROF', name: PROF[r] || 'PROF. OAK', cls: '', place: 'LAB', builtin: true },
	];
}
// everyone in the phone: MOM, the professor, then trainers in the order you met them
export function phoneContacts() {
	return [...builtins(), ...state().contacts.map(k => BY_KEY.get(k)).filter(Boolean)];
}

// GIVE THE PHONE. Every region's intro ends with it (afterRival), and a save
// already past the intro gets it on load (grantPhoneIfDue). Emerald's scripts
// read FLAG_HAS_MATCH_CALL before they offer to register you.
export function givePhone() {
	const s = state();
	if (s.has) return false;
	s.has = true;
	save();
	Story.setFlag('FLAG_HAS_MATCH_CALL');
	return true;
}
export function grantPhoneIfDue() {
	if (hasPhone() || !Story.getFlag('intro_done') || !(S.party && S.party.length)) return false;
	givePhone();
	hud.textContent = 'You have a PHONE! Find it in the START menu.';
	return true;
}

export function register(key) {
	const s = state();
	if (!BY_KEY.has(key) || s.contacts.includes(key)) return 'known';
	if (s.contacts.length >= PHONE_CAP) return 'full';
	s.contacts.push(key);
	save();
	return 'ok';
}

// ---------- ready / gift: Crystal keeps them in its own ENGINE_* flags ----------
const isReady = c => c.readyFlag ? Story.getFlag(c.readyFlag) : !!state().ready[c.key];
function setReady(c, on) {
	if (c.readyFlag) { if (on) Story.setFlag(c.readyFlag); else Story.clearFlag(c.readyFlag); return; }
	const s = state(); if (on) s.ready[c.key] = 1; else delete s.ready[c.key]; save();
}
const hasGift = c => !!c.giftFlag && Story.getFlag(c.giftFlag);
// can this contact still offer a rematch?
function canRematch(c) {
	if (c.readyFlag) return true;
	return !!(c.rematchTeams && c.rematchTeams.length);
}

// ---------- text ----------
const say = t => Story.normalizeText(t, cutsceneCtx());
const leadName = c => {
	const tid = c.rematchTeams ? c.rematchTeams[0] : null;
	const sp = tid && S.trainerTeams[tid] && S.trainerTeams[tid].party[0] && S.trainerTeams[tid].party[0].s;
	return ((sp && battle.data && battle.data.species[sp] && battle.data.species[sp].name) || 'POKeMON').toUpperCase();
};
const fillT = (c, t) => t.replace(/\{NAME\}/g, c.name).replace(/\{PLACE\}/g, c.place || '').replace(/\{MON\}/g, leadName(c));
const pick = a => a[Math.floor(Math.random() * a.length)];
// Hoenn/Kanto have no authored call lines; these are written in the same voice
const CHAT = [
	'{NAME}: My {MON} and I have been training every single day!',
	'{NAME}: I battled a really tough trainer today. I still lost... but I learned a lot!',
	"{NAME}: How are your POKeMON doing? Mine can't sit still!",
	"{NAME}: I found a great spot to train on {PLACE}. You should come by sometime!",
];
const WANTS = "{NAME}: I've gotten a lot stronger since our battle!\n\nI'm on {PLACE}. Come battle me again!";
const REMIND = "{NAME}: Hey! Did you forget our rematch?\n\nI'm waiting for you on {PLACE}!";
const MOM_LINES = [
	"MOM: Hi, sweetie! Are you eating properly? Don't forget to rest your POKeMON at a POKeMON CENTER!",
	"MOM: Oh, hello! The house is so quiet without you. I'm proud of you, you know!",
	"MOM: Hi, honey! Your room is just as you left it. Call me anytime!",
];

// ---------- calls ----------
// what a contact says when YOU call them
function outgoingText(c) {
	if (c.key === 'MOM') return pick(MOM_LINES);
	if (c.key === 'PROF') {
		const obj = ((document.getElementById('objective') || {}).textContent || '').replace(/^NEXT:\s*/, '');
		const caught = (() => { try { return Object.values(JSON.parse(localStorage.getItem('magepunk_dex_v1') || '{}').caught || {}).length; } catch (e) { return 0; } })();
		return `${c.name}: Hello, {PLAYER}! How's your POKeDEX coming along?` + (caught ? ` ${caught} caught so far. Wonderful!` : '')
			+ (obj ? `\n\nYour next goal: ${obj}` : '');
	}
	const T = c.texts || {};
	if (canRematch(c) && isReady(c)) return fillT(c, T.reminder || REMIND);
	if (hasGift(c)) return fillT(c, T.comePickUp || T.foundItem || '');
	if (c.texts) return [T.answer, pick([...(T.chat || []), T.generic].filter(Boolean))].filter(Boolean).join('\n\n');
	return fillT(c, pick(CHAT));
}
// what a trainer says when THEY call — and it may start a rematch or a gift
function incomingText(c) {
	const T = c.texts || {};
	const greet = T.greet || '';
	if (canRematch(c) && !isReady(c) && !hasGift(c) && Math.random() < 1 / 3) {
		setReady(c, true);
		return [greet, fillT(c, T.wantsBattle || WANTS)].filter(Boolean).join('\n\n');
	}
	if (c.giftFlag && !hasGift(c) && !isReady(c) && Math.random() < 1 / 6) {
		Story.setFlag(c.giftFlag);
		return [greet, T.foundItem].filter(Boolean).join('\n\n');
	}
	if (c.texts) return [greet, pick([...(T.chat || []), T.generic].filter(Boolean))].filter(Boolean).join('\n\n');
	return fillT(c, pick(CHAT));
}
export function callContact(c) {
	if (!c) return;
	sfx('notice');
	dialog.open(say(`Calling ${c.name}...\n\n` + outgoingText(c)));
}
// INCOMING CALLS: at most one every few minutes, only while free to take it
const CALL_MIN_STEPS = 120, CALL_MIN_MS = 3 * 60 * 1000, CALL_CHANCE = 1 / 40;
export function phoneStep(busy) {
	const s = state();
	if (!s.has) return false;
	s.steps++;
	const trainerContacts = s.contacts.map(k => BY_KEY.get(k)).filter(Boolean);
	if (!trainerContacts.length || busy) return false;
	if (s.steps < CALL_MIN_STEPS || Date.now() - (s.lastCallAt || 0) < CALL_MIN_MS) return false;
	if (Math.random() >= CALL_CHANCE) return false;
	return ringFrom(pick(trainerContacts));
}
export function ringFrom(c) {
	const s = state();
	s.steps = 0; s.lastCallAt = Date.now(); save();
	sfx('notice');
	hud.textContent = `PHONE: ${c.name} is calling!`;
	dialog.open(say(`Ring ring... It's ${c.cls ? c.cls + ' ' : ''}${c.name}!\n\n` + incomingText(c)));
	return true;
}

// ---------- script specials (the converted Crystal scripts, Emerald's register) ----------
// returns undefined when the name is not a phone special
export function runPhoneSpecial(name, store, op) {
	const out = v => { if (store) Story.setVar(store, v); };
	switch (name) {
		case 'PhoneHasContact': out(isRegistered(op.contact) ? 1 : 0); return true;
		case 'PhoneRegister': {
			const r = hasPhone() ? register(op.contact) : 'no-phone';
			if (r === 'ok') hud.textContent = `Registered ${(BY_KEY.get(op.contact) || {}).name || 'a trainer'} in your PHONE.`;
			return true;
		}
		case 'PhoneAskNumber': {
			// Crystal's askforphonenumber: 0 = accepted, 1 = phone full, 2 = refused
			if (!hasPhone()) { out(2); return true; }
			if (isRegistered(op.contact)) { out(0); return true; }
			if (state().contacts.length >= PHONE_CAP) { out(1); return true; }
			dialog.open('Register the number?\n\nZ = Yes    X = No', k => {
				if (k === 'x') out(2);
				else { register(op.contact); out(0); }
				cutscene.resume();
			});
			return 'wait';
		}
		case 'PhoneGiveItem': {
			const id = Story.itemId(op.item);
			if (id) { Bag.addItem(id, 1); hud.textContent = `Received ${Bag.nameOf ? Bag.nameOf(id) : id}!`; }
			out(1);
			return true;
		}
		case 'PhoneHasMon': out((S.party || []).some(m => m.speciesId === op.species) ? 1 : 0); return true;
	}
	return undefined;
}

// ---------- HOENN / KANTO trainers: registration and rematches ----------
const text = (base, ...suffixes) => {
	for (const sfx2 of suffixes) { const t = S.mapStrings && S.mapStrings[base + sfx2]; if (t) return t; }
	return null;
};
// after the FIRST battle with a plain-path (roster) trainer: offer the number
export function phoneAfterVictory(t, info) {
	const c = contactForTrainer(t);
	if (!c || c.region === 'JOHTO') return;
	if (info && info.phoneRematch) {
		const s = state();
		s.tier[c.key] = (s.tier[c.key] || 0) + 1;
		save();
		setReady(c, false);
		return;
	}
	if (!hasPhone() || isRegistered(c.key)) return;
	whenIdle(() => offerNumber(c));
}
function offerNumber(c) {
	const line = text(c.textBase, 'RegisterShort', 'Register')
		|| `${c.name}: You're really strong! Here, take my number. Let's battle again sometime!`;
	dialog.open(say(line), () => {
		if (register(c.key) === 'ok') dialog.open(say(`{PLAYER} registered ${c.name}'s number.`));
	});
}
// talking to a BEATEN Hoenn/Kanto phone trainer; true if handled
export function phoneTalkDefeated(t) {
	const c = contactForTrainer(t);
	if (!c || c.region === 'JOHTO') return false;
	if (isRegistered(c.key) && isReady(c) && c.rematchTeams && c.rematchTeams.length) { startRematch(t, c); return true; }
	if (hasPhone() && !isRegistered(c.key)) { offerNumber(c); return true; }
	const post = text(c.textBase, 'PostBattle');
	if (post) { dialog.open(say(post)); return true; }
	return false;
}
// the next team: one tier per rematch, and never further than the region's badges allow
export function rematchTeamFor(c) {
	const teams = c.rematchTeams || [];
	if (!teams.length) return null;
	const done = state().tier[c.key] || 0;
	const allowed = Math.floor(Badges.count(c.region) / 2);
	return teams[Math.min(done, allowed, teams.length - 1)];
}
function startRematch(t, c) {
	const tid = rematchTeamFor(c);
	const team = tid && S.trainerTeams[tid];
	const foe = ((team && team.party) || []).map(e => battleBuildMon(e.s, e.l, battle.data)).filter(Boolean);
	if (!foe.length) { setReady(c, false); return; }
	const { info } = trainers.buildBattle(t, battle.data);
	info.phoneRematch = c.key;
	const intro = text(c.textBase, 'RematchIntro');
	const beaten = text(c.textBase, 'RematchDefeat', 'RematchDefeated', 'Defeat', 'Defeated');
	if (beaten) info.defeatText = say(beaten);
	const go = () => startTrainerBattle(t, foe, info);
	if (intro) dialog.open(say(intro), go); else go();
}
function whenIdle(fn, tries = 150) {
	const free = () => !dialog.blocking && !battle.blocking && !cutscene.blocking && !evolution.blocking;
	if (free()) { fn(); return; }
	if (tries <= 0) return;
	setTimeout(() => whenIdle(fn, tries - 1), 200);
}

// ---------- the PHONE menu (START -> PHONE) ----------
export const phoneMenu = { open: false, idx: 0 };
export function openPhoneMenu() { phoneMenu.open = true; phoneMenu.idx = 0; }
export function phoneKey(k) {
	const list = phoneContacts();
	const n = list.length + 1;   // + Close
	if (k === 'ArrowUp') phoneMenu.idx = (phoneMenu.idx + n - 1) % n;
	if (k === 'ArrowDown') phoneMenu.idx = (phoneMenu.idx + 1) % n;
	if (k === 'x' || k === 'Escape') { phoneMenu.open = false; return; }
	if (k === 'z' || k === 'Enter') {
		const c = list[phoneMenu.idx];
		phoneMenu.open = false;
		if (c) callContact(c);
	}
}
export function phoneMenuRows() {
	return phoneContacts().map(c => `${c.cls ? c.cls + ' ' : ''}${c.name}${c.place ? '  -  ' + c.place : ''}${!c.builtin && canRematch(c) && isReady(c) ? '  (!)' : ''}`).concat(['Close']);
}
