// subvar_fix.js — the `subvar`s the script transpile turned into `addvar`s, flipped back.
//
// Magepunk66's transpile writes `subvar V, N` as `addvar V, -N` — right for a
// number, but a SYMBOL (a price, another variable) can't be negated, so it came
// out as `addvar V, SYMBOL`: an add. The Glass Workshop's flutes and furniture
// would have GIVEN their ash price instead of taking it (2026-10-05).
// tools/gen_subvar_fix.mjs lines each label's symbolic addvar/subvar up with the
// decomp and records which converted `addvar`s were really subvars, as "the k-th
// symbolic addvar in label L" (with its variable and operand, checked here), so
// other overlays splicing ops into the same label can't shift it.
let FLIPS = {};
export async function loadSubvarFixData(getJSON) {
	FLIPS = ((await getJSON('subvar_fix_data.json').catch(() => null)) || {}).flips || {};
}
const isNum = v => typeof v === 'number' || /^-?(0x[0-9a-fA-F]+|\d+)$/.test(String(v).trim());
// returns scripts with the recorded addvars turned into subvars (labels copied, never mutated)
export function applySubvarFix(scripts) {
	let out = scripts;
	for (const [label, list] of Object.entries(FLIPS)) {
		const ops = scripts && scripts[label];
		if (!Array.isArray(ops)) continue;
		let k = -1, changed = null;
		ops.forEach((o, i) => {
			if (!o || o.op !== 'addvar' || isNum(o.value)) return;
			k++;
			const f = list.find(x => x.k === k);
			if (f && f.var === o.var && String(o.value) === f.value) { (changed = changed || [...ops])[i] = { ...o, op: 'subvar' }; }
		});
		if (changed) { if (out === scripts) out = { ...scripts }; out[label] = changed; }
	}
	return out;
}
