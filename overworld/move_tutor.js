// move_tutor.js — FireRed's move tutors teach (special ChooseMonForMoveTutor).
//
// 2026-10-05, Instinct: the Cinnabar Metronome tutor did nothing. Its map
// script jumps into pokefirered's shared move_tutors.inc, whose six goto-only
// tutors were never brought over (restored now through missing_labels_data.json),
// and every tutor — the ones that WERE present too — teaches through
// `special ChooseMonForMoveTutor`, which the engine never implemented, so no
// tutor could teach anything.
//
// The script sets VAR_0x8005 to the MOVETUTOR_* constant (left as its name, or
// its FireRed number), shows "Which POKeMON?", and calls this. We open a party
// pick (ABLE / NOT ABLE / LEARNED, like the party screen), then — at four moves —
// which move to forget, and answer VAR_RESULT = TRUE when a move was taught,
// FALSE when the player backed out; the script sets the one-use FLAG_TUTOR_*.
import { startChoice, MULTI_B_PRESSED } from './choice.js';
import * as Story from './events.js';
import { battle, cutscene, dialog } from './ow_core.js';
import { canLearn } from './ow_menukeys.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';

// pokefirered include/constants/moves.h MOVETUTOR_* order
const FRLG_TUTORS = ['megapunch', 'swordsdance', 'megakick', 'bodyslam', 'doubleedge', 'counter', 'seismictoss', 'mimic',
	'metronome', 'softboiled', 'dreameater', 'thunderwave', 'explosion', 'rockslide', 'substitute', 'frenzyplant', 'blastburn', 'hydrocannon'];

// VAR_0x8005 -> a move id: FireRed 'MOVETUTOR_SOFT_BOILED' or 9 -> 'softboiled';
// Emerald 'TUTOR_MOVE_FURY_CUTTER' -> 'furycutter' (the same special)
export function tutorMove(v) {
	if (typeof v === 'number' || /^\d+$/.test(String(v))) return FRLG_TUTORS[+v] || null;
	const m = /^(?:MOVE_?TUTOR|TUTOR_MOVE)_(.+)$/.exec(String(v || ''));
	return m ? m[1].toLowerCase().replace(/_/g, '') : null;
}

function finish(ok) {
	Story.setVar('VAR_RESULT', ok ? 1 : 0);
	cutscene.resume();
}

export function chooseMonForMoveTutor() {
	const mid = tutorMove(Story.getVar('VAR_0x8005'));
	const party = S.party || [];
	if (!mid || !battle.data?.moves?.[mid] || !party.length) { Story.setVar('VAR_RESULT', 0); return; }
	pickMon(mid);
	return 'wait';
}

function pickMon(mid) {
	const info = battle.data.moves[mid], party = S.party || [];
	const tag = m => m.moves.some(x => x.id === mid) ? ' (LEARNED)' : canLearn(m, mid) ? '' : ' (NOT ABLE)';
	startChoice({
		options: [...party.map(m => (m.nickname || m.name) + tag(m)), 'CANCEL'], ignoreB: false, list: 'MOVE_TUTOR',
		promptText: `Teach ${info.name} to which POKeMON?`,
		onPick: i => {
			if (i === MULTI_B_PRESSED || i >= party.length) return finish(false);
			const mon = party[i], name = mon.nickname || mon.name;
			if (mon.moves.some(x => x.id === mid)) return dialog.open(`${name} already knows ${info.name}.`, () => pickMon(mid));
			if (!canLearn(mon, mid)) return dialog.open(`${name} can't learn ${info.name}.`, () => pickMon(mid));
			if (mon.moves.length < 4) {
				mon.moves.push({ id: mid, name: info.name, pp: info.pp, maxPp: info.pp });
				saveParty(S.party);
				return dialog.open(`${name} learned ${info.name}!`, () => finish(true));
			}
			pickForget(mon, mid);
		},
	});
}

function pickForget(mon, mid) {
	const info = battle.data.moves[mid], name = mon.nickname || mon.name;
	startChoice({
		options: [...mon.moves.map(x => x.name), 'STOP LEARNING'], ignoreB: false, list: 'MOVE_TUTOR_FORGET',
		promptText: `${name} already knows four moves. Forget which move for ${info.name}?`,
		onPick: j => {
			if (j === MULTI_B_PRESSED || j >= mon.moves.length) return dialog.open(`${name} did not learn ${info.name}.`, () => pickMon(mid));
			const old = mon.moves[j];
			mon.moves[j] = { id: mid, name: info.name, pp: info.pp, maxPp: info.pp };
			saveParty(S.party);
			dialog.open(`1, 2, and... Poof!\n${name} forgot ${old.name}.\nAnd...\n${name} learned ${info.name}!`, () => finish(true));
		},
	});
}
