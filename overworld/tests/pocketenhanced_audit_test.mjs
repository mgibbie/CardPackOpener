// Pocket Enhanced: the audit by play (tools/pocket_audit_attacks.mjs) as a gate. Every different attack of every Pokémon
// card is used on a plain table, three seeds each: the engine never fails, no card is gained or lost, an attack with no
// effect does its printed damage, and every number in a card's rules text is in its structured effect.
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra)); } };

let out = null, raw = '';
try { raw = execFileSync(process.execPath, [fileURLToPath(new URL('../../tools/pocket_audit_attacks.mjs', import.meta.url)), '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }); } catch (e) { raw = String(e.stdout || ''); }
try { out = JSON.parse(raw); } catch (e) { out = null; }
A(!!out, 'the audit runs and reports', raw.slice(0, 300));
if (out) {
	A(out.attacks >= 2333, `every different attack is tried (${out.attacks})`, out.attacks);
	A(out.THROW.length === 0, 'the engine never fails on an attack', out.THROW.slice(0, 5));
	A(out['NO-ATTACK'].length === 0, 'an attack the engine takes either happens or says why it did not', out['NO-ATTACK'].slice(0, 5));
	A(out.BASE.length === 0, 'an attack with no effect does its printed damage', out.BASE.slice(0, 5));
	A(out.STATE.length === 0, 'after every attack the table still adds up: no card gained or lost, no impossible damage or points', out.STATE.slice(0, 5));
	A(out.TEXT.length === 0, "every number in a card's rules text (attacks, Abilities, Trainers) is in its structured effect", out.TEXT.slice(0, 5));
	// what the plain table cannot use, by name: each needs Pokémon the table does not have (a new entry here is a new card to look at)
	const refused = Object.values(out.REFUSED).flat().map(x => x.replace(/^\S+ /, '')).sort();
	A(refused.join(' | ') === 'Decidueye ex: Pierce the Pain | Mandibuzz: Blindside | Mesprit: Supreme Blast | Regigigas: Giga Turbo' && out.ok === out.attacks - 4, 'all but four attacks are used; those four need a table of their own (a damaged target, named Pokémon on the Bench)', refused);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
