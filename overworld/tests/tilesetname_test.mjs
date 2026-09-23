// tilesetname_test.mjs — a tileset's asset name must match the exported file.
//
// Reported: "S.S. Anne interiors render black. Layout SSAnne_1F_Corridor_Layout,
// secondary gTileset_SSAnne = null, 0 opaque pixels. magepunk-owdata
// /tilesets/s_s_anne_tiles.png 404s; /tilesets/ss_anne_tiles.png is 200."
//
// CAUSE. engine.js mangle() put an underscore before EVERY capital, so a RUN of
// capitals came apart: gTileset_SSAnne -> s_s_anne, while the exported file is
// ss_anne. The fetch 404'd, side() swallowed the failed image load, and the whole
// deck rendered black with only sprites drawn — no console error to follow. It
// blocks the Kanto story, since the S.S. Anne is where HM01 Cut comes from.
//
// FIX: a standard camel->snake that only splits where a capital run ENDS.
//
// The guard below is the audit the report asked for: it walks every tileset the
// layouts reference and checks the two rules against each other, so a name that
// the old rule got right cannot silently change.
//
//   node overworld/tests/tilesetname_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OW = path.resolve(HERE, '..');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the shipped rule, read out of engine.js so this cannot drift from the source
const src = fs.readFileSync(path.join(OW, 'engine.js'), 'utf8');
const body = src.slice(src.indexOf('function mangle('), src.indexOf('const tilesetPng'));
A(/\(\[A-Z\]\+\)\(\[A-Z\]\[a-z\]\)/.test(body), 'mangle splits a run of capitals at its end');
A(!/replace\(\/\(\[A-Z\]\)\/g/.test(body), 'and no longer splits before every capital');

const mangle = new Function('tilesetName', body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')));

// ---------- the reported case ----------
A(mangle('gTileset_SSAnne') === 'ss_anne', 'gTileset_SSAnne -> ss_anne', mangle('gTileset_SSAnne'));

// ---------- the shapes that already worked must be untouched ----------
for (const [input, want] of [
	['gTileset_General', 'general'],
	['gTileset_PetalburgWoods', 'petalburg_woods'],
	['gTileset_BattleFrontierOutsideWest', 'battle_frontier_outside_west'],
]) A(mangle(input) === want, `${input} -> ${want}`, mangle(input));

// ---------- the whole-game audit ----------
{
	const oldRule = n => {
		n = n.replace('gTileset_', '');
		n = n.replace(/([A-Z])/g, c => '_' + c.toLowerCase());
		n = n.replace(/(\d+)/g, d => '_' + d);
		return n.replace(/^_/, '').replace(/__/g, '_');
	};
	const names = new Set();
	for (const f of fs.readdirSync(path.join(OW, 'data/layouts'))) {
		let l;
		try { l = JSON.parse(fs.readFileSync(path.join(OW, 'data/layouts', f), 'utf8')); } catch (e) { continue; }
		for (const k of ['primary_tileset', 'secondary_tileset', 'tileset_primary', 'tileset_secondary']) if (l[k]) names.add(l[k]);
	}
	A(names.size > 150, 'the audit found the game\'s tilesets', String(names.size));
	const changed = [...names].filter(n => oldRule(n) !== mangle(n)).sort();
	// Exactly two may differ: the bug, and a NULL placeholder that resolves to
	// nothing under either rule. Anything else means this quietly moved a name
	// that was already correct.
	A(changed.length === 2, 'only the broken names changed', JSON.stringify(changed));
	A(changed.includes('gTileset_SSAnne'), 'and SSAnne is one of them', JSON.stringify(changed));
	// no name may come out with a stray separator
	const bad = [...names].map(mangle).filter(s => /^_|_$|__/.test(s));
	A(bad.length === 0, 'no mangled name has a stray underscore', JSON.stringify(bad.slice(0, 3)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
