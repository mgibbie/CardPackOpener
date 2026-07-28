// tests/tools/effect-census.mjs — static census of the effect system.
//
// Reports, from engine.js source + cards.json data:
//   1. effect types handled by the execEffects if-chain
//   2. effect types handled by the runSecretEffects switch
//   3. TWINS: types implemented in both dispatchers (drift risk)
//   4. DUPLICATE case labels inside the switch (dead second bodies)
//   5. effect types used in card data with NO handler anywhere (silent no-ops)
//   6. handler types never referenced by any card data (candidates: composed-
//      effect-only types, or dead code — listed for human review, not deletion)
//
// Usage:  node battlecards/tests/tools/effect-census.mjs [--json]
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../../engine/core.js', import.meta.url), 'utf8');
const cards = JSON.parse(readFileSync(new URL('../../cards.json', import.meta.url), 'utf8'));
const lines = src.split('\n');

// ---- locate function bodies by top-level "function name(" boundaries ----
function fnRange(name) {
	const start = lines.findIndex(l => l.startsWith(`function ${name}(`) || l.startsWith(`export function ${name}(`));
	if (start < 0) return null;
	let end = lines.length;
	for (let i = start + 1; i < lines.length; i++) {
		if (/^(export )?function [a-zA-Z_$]/.test(lines[i])) { end = i; break; }
	}
	return [start, end];
}

function collect(range, regex) {
	const out = [];
	if (!range) return out;
	for (let i = range[0]; i < range[1]; i++) {
		for (const m of lines[i].matchAll(regex)) out.push({ type: m[1], line: i + 1 });
	}
	return out;
}

// Dispatch-position matches only: `if (e.type === 'x')` / `} else if (e.type === 'x' ...)`
// at the start of a (trimmed) line. Comparisons buried in expressions (lifesteal
// pre-checks, filter callbacks) are NOT dispatch branches and are excluded.
function collectChain(range) {
	const out = [];
	if (!range) return out;
	for (let i = range[0]; i < range[1]; i++) {
		// dispatch branches sit at exactly two tabs; deeper matches are inner
		// refinements within a branch (e.g. `if (e.type === 'conjure')` inside
		// the 'conjure'||'conjure-named' branch) and must not count.
		if (!/^\t\t(} else )?if \(e\.type === '/.test(lines[i])) continue;
		const t = lines[i].trim();
		const types = [...t.matchAll(/e\.type === '([a-z0-9A-Z_-]+)'/g)].map(m => m[1]);
		// a branch guarded by extra conditions is not a plain duplicate — mark it
		const guarded = /&&|\|\| e\.[a-z]/i.test(t.replace(/\|\| e\.type/g, ''));
		for (const type of types) out.push({ type, line: i + 1, guarded });
	}
	return out;
}
const chainHits = collectChain(fnRange('execEffects'));
const switchHits = collect(fnRange('runSecretEffects'), /case '([a-z0-9A-Z_-]+)':/g);

const chainTypes = new Set(chainHits.map(h => h.type));
const switchTypes = new Set(switchHits.map(h => h.type));

// duplicate case labels (second body is dead)
const switchCounts = {};
for (const h of switchHits) (switchCounts[h.type] = switchCounts[h.type] || []).push(h.line);
const dupCases = Object.entries(switchCounts).filter(([, ls]) => ls.length > 1);

// duplicate chain branches: a later UNGUARDED branch for a type whose earlier
// branch is also unguarded can never run. Guarded earlier branches (e.g.
// `e.type === 'discover' && e.heroPower`) make later ones legitimate.
const chainCounts = {};
for (const h of chainHits) (chainCounts[h.type] = chainCounts[h.type] || []).push(h);
const dupChain = Object.entries(chainCounts)
	.filter(([, hs]) => hs.length > 1 && hs.filter(h => !h.guarded).length > 1)
	.map(([t, hs]) => [t, hs.map(h => h.line + (h.guarded ? ' (guarded)' : ''))]);

const twins = [...switchTypes].filter(t => chainTypes.has(t)).sort();

// ---- effect types used by card DATA ----
// Effects live in arrays under these keys (including nested then/else/options…).
const EFFECT_KEYS = new Set(['effects', 'deathrattle', 'then', 'else', 'onDraw',
	'launch', 'awaken', 'combo', 'bounceTrigger', 'startOfGame', 'reward', 'chaos', 'options']);
const dataTypes = new Map(); // type -> usage count
function walk(node, underEffectKey) {
	if (Array.isArray(node)) { for (const x of node) walk(x, underEffectKey); return; }
	if (!node || typeof node !== 'object') return;
	if (underEffectKey && typeof node.type === 'string') {
		dataTypes.set(node.type, (dataTypes.get(node.type) || 0) + 1);
	}
	for (const [k, v] of Object.entries(node)) {
		if (k === 'ongoing' || k === 'ongoings' || k === 'swiftdraw' || k === 'outcast' ||
			k === 'power' || k === 'adventure' || k === 'sac' || k === 'kicker' ||
			k === 'choices' || k === 'taps' || k === 'quest' || k === 'spellDamageRedirect') {
			walk(v, false);                     // containers holding an `effects` array inside
		} else {
			walk(v, EFFECT_KEYS.has(k));
		}
	}
}
walk(cards.cards, false);

// registry-migrated types (PR 13+): registered in engine/effects/registry.js
const regSrc = readFileSync(new URL('../../engine/effects/registry.js', import.meta.url), 'utf8');
const registryTypes = new Set([...regSrc.matchAll(/register(?:Trigger)?\('([^']+)'/g)].map(m => m[1]));
const handled = new Set([...chainTypes, ...switchTypes, ...registryTypes]);
const unhandled = [...dataTypes.keys()].filter(t => !handled.has(t)).sort();
const unusedHandlers = [...handled].filter(t => !dataTypes.has(t)).sort();

const report = {
	chainBranches: chainHits.length,
	chainDistinctTypes: chainTypes.size,
	registryTypes: registryTypes.size,
	switchCases: switchHits.length,
	switchDistinctTypes: switchTypes.size,
	totalDistinctHandledTypes: handled.size,
	dataDistinctTypes: dataTypes.size,
	twins,
	twinCount: twins.length,
	duplicateSwitchCases: Object.fromEntries(dupCases),
	duplicateChainBranches: Object.fromEntries(dupChain),
	dataTypesWithoutHandler: unhandled,
	handlerTypesUnusedByData: unusedHandlers,
};

if (process.argv.includes('--json')) {
	console.log(JSON.stringify(report, null, 2));
} else {
	console.log('=== Battlecards effect census ===');
	console.log(`execEffects chain:        ${report.chainBranches} branches / ${report.chainDistinctTypes} distinct types`);
	console.log(`runSecretEffects switch:  ${report.switchCases} cases / ${report.switchDistinctTypes} distinct types`);
	console.log(`total handled types:      ${report.totalDistinctHandledTypes}`);
	console.log(`types used by card data:  ${report.dataDistinctTypes}`);
	console.log(`\nTWINS (in both dispatchers, drift risk): ${twins.length}`);
	for (const t of twins) console.log(`  - ${t}`);
	console.log(`\nDUPLICATE switch cases (dead second body): ${dupCases.length}`);
	for (const [t, ls] of dupCases) console.log(`  - '${t}' at lines ${ls.join(', ')}`);
	console.log(`\nDUPLICATE chain branches (dead later branch): ${dupChain.length}`);
	for (const [t, ls] of dupChain) console.log(`  - '${t}' at lines ${ls.join(', ')}`);
	console.log(`\nDATA types with NO handler (silent no-ops!): ${unhandled.length}`);
	for (const t of unhandled) console.log(`  - ${t} (used ${dataTypes.get(t)}x)`);
	console.log(`\nHandler types never used by card data (review; may be composed-only): ${unusedHandlers.length}`);
	console.log('  ' + unusedHandlers.join(', '));
}
process.exit(unhandled.length ? 2 : 0); // non-zero when silent no-ops exist
