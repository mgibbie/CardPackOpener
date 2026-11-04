// pokemail.js — Crystal's `checkpokemail` (engine/pokemon/mail.asm CheckPokeMail).
//
// The Route 31 man asks for RANDY's KENYA: you pick a party POKeMON
// (SelectMonFromParty), and its MAIL must read the expected message byte for
// byte. The answer lands in the script var, which the script branches on:
//   POKEMAIL_WRONG_MAIL 0 · CORRECT 1 · REFUSED 2 (B) · NO_MAIL 3 · LAST_MON 4
// On CORRECT the POKeMON (and its MAIL) leaves the party, as RemoveMonFromPartyOrBox
// does. LAST_MON is CheckCurPartyMonFainted: every OTHER party mon has fainted.
import { startChoice, MULTI_B_PRESSED } from './choice.js';
import * as Story from './events.js';
import { cutscene } from './ow_core.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';

export const POKEMAIL = { WRONG_MAIL: 0, CORRECT: 1, REFUSED: 2, NO_MAIL: 3, LAST_MON: 4 };

// the answer for party slot i (pure: the caller removes the mon on CORRECT)
export function pokeMailVerdict(party, i, text) {
	const mon = party[i];
	if (!mon) return POKEMAIL.REFUSED;
	if (!/mail$/.test(mon.heldItem || '')) return POKEMAIL.NO_MAIL;   // ItemIsMail
	if ((mon.mail || '') !== text) return POKEMAIL.WRONG_MAIL;
	if (!party.some((m, j) => j !== i && m.curHP > 0)) return POKEMAIL.LAST_MON;
	return POKEMAIL.CORRECT;
}

export function checkPokeMail(text) {
	const party = S.party || [];
	const done = v => { Story.setVar('VAR_RESULT', v); cutscene.resume(); };
	if (!party.length) { Story.setVar('VAR_RESULT', POKEMAIL.REFUSED); return; }
	startChoice({
		options: [...party.map(m => m.nickname || m.name), 'CANCEL'], ignoreB: false, list: 'CHECK_POKEMAIL',
		promptText: 'Which POKeMON?',
		onPick: i => {
			if (i === MULTI_B_PRESSED || i >= party.length) return done(POKEMAIL.REFUSED);
			const v = pokeMailVerdict(party, i, text);
			if (v === POKEMAIL.CORRECT) { party.splice(i, 1); saveParty(S.party); }
			done(v);
		},
	});
	return 'wait';
}
