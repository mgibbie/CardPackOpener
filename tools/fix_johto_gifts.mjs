// fix_johto_gifts.mjs — restore the Mania's House script the transpile flattened.
//
// pokecrystal maps/ManiasHouse.asm is one script with local labels
// (.alreadyhaveshuckie, .returnshuckie, .partyfull, .refused, .wrong, ...). The
// transpile emitted every one of them INTO ManiaScript itself and never defined
// the labels, so each `goto ManiaScript.x` dangled (events.js treats that as a
// no-op) and fell into the next op. With GiveShuckle now real that would hand out
// a SHUCKIE on every visit. It also dropped `iffalse .partyfull` after GiveShuckle
// and every `ifequal SHUCKIE_*` after ReturnShuckie.
//
// Post-pass over the emitted JSON (idempotent — it rewrites the labels whole).
//
//   node tools/fix_johto_gifts.mjs            (dry run)
//   node tools/fix_johto_gifts.mjs --write
import fs from 'fs';

const WRITE = process.argv.includes('--write');
const F = 'overworld/data/scripts/ManiasHouse.json';
const msg = text => ({ op: 'msg', text });
const end = { op: 'end' };
const go = (cond, label) => ({ op: 'branch', kind: 'goto', cond, label: `ManiaScript.${label}` });
const res = value => ({ var: 'VAR_RESULT', cmp: 'eq', value });

const LABELS = {
	ManiaScript: [
		{ op: 'faceplayer' },
		go({ flag: 'EVENT_MANIA_TOOK_SHUCKIE_OR_LET_YOU_KEEP_HIM', state: true }, 'default_postevent'),
		go({ flag: 'EVENT_GOT_SHUCKIE', state: true }, 'alreadyhaveshuckie'),
		msg('ManiaText_AskLookAfterShuckle'),
		{ op: 'prompt' },
		go(res(0), 'refusetotakeshuckie'),
		{ op: 'special', name: 'GiveShuckle' },
		go(res(0), 'partyfull'),
		msg('ManiaText_TakeCareOfShuckle'),
		msg('ManiaText_GotShuckle'),
		{ op: 'setflag', flag: 'EVENT_GOT_SHUCKIE' },
		end,
	],
	'ManiaScript.alreadyhaveshuckie': [
		go({ flag: 'ENGINE_GOT_SHUCKIE_TODAY', state: false }, 'returnshuckie'),
		msg('ManiaText_TakeCareOfShuckle'),
		end,
	],
	// Crystal's .partyfull has no `end`: it falls through into .refused
	'ManiaScript.partyfull': [msg('ManiaText_PartyFull'), msg('ManiaText_SameAsBeingRobbed'), end],
	'ManiaScript.refusetotakeshuckie': [msg('ManiaText_IfHeComesBack'), end],
	'ManiaScript.returnshuckie': [
		msg('ManiaText_CanIHaveMyMonBack'),
		{ op: 'prompt' },
		go(res(0), 'refused'),
		{ op: 'special', name: 'ReturnShuckie' },
		go(res(0), 'wrong'),        // SHUCKIE_WRONG_MON
		go(res(1), 'refused'),      // SHUCKIE_REFUSED
		go(res(3), 'superhappy'),   // SHUCKIE_HAPPY
		go(res(4), 'default_postevent'), // SHUCKIE_FAINTED (Crystal's own wrong-text bug, kept)
		msg('ManiaText_ThankYou'),  // SHUCKIE_RETURNED
		{ op: 'setflag', flag: 'EVENT_MANIA_TOOK_SHUCKIE_OR_LET_YOU_KEEP_HIM' },
		end,
	],
	'ManiaScript.wrong': [msg('ManiaText_ShuckleNotThere'), end],
	'ManiaScript.superhappy': [
		msg('ManiaText_ShuckleLikesYou'),
		{ op: 'setflag', flag: 'EVENT_MANIA_TOOK_SHUCKIE_OR_LET_YOU_KEEP_HIM' },
		end,
	],
	'ManiaScript.refused': [msg('ManiaText_SameAsBeingRobbed'), end],
	'ManiaScript.default_postevent': [msg('ManiaText_HappinessSpeech'), end],
};

const prog = JSON.parse(fs.readFileSync(F, 'utf8'));
let changed = 0;
for (const [k, v] of Object.entries(LABELS)) {
	if (JSON.stringify(prog[k]) !== JSON.stringify(v)) { prog[k] = v; changed++; }
}
console.log(`ManiasHouse: ${changed} label(s) ${WRITE ? 'rewritten' : 'would change'}`);
if (WRITE && changed) fs.writeFileSync(F, JSON.stringify(prog));
if (!WRITE) console.log('(dry run — pass --write to apply)');
