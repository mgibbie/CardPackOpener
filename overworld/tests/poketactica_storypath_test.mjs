// poketactica_storypath_test.mjs — STORY: A MAP SCREEN THAT IS A MAP (Plans/POKETACTICA_MODES_PLAN.md item S5). "The 22 as
// a path with what each one teaches, not a list." Every map has a short line saying what it teaches, and the Story screen
// draws all of them as one path.
// Pure: node only.   node overworld/tests/poketactica_storypath_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MAPS, TEACHES, teachOf, CHAPTERS } from '../../poketactica/js/campaign.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };

A(Object.keys(TEACHES).length === MAPS.length && MAPS.every((m) => TEACHES[m.id]), 'every one of the ' + MAPS.length + ' maps has a line saying what it teaches, and there is no line for a map that is not there', MAPS.filter((m) => !TEACHES[m.id]).map((m) => m.id));
A(MAPS.every((m) => teachOf(m.id).length >= 6 && teachOf(m.id).length <= 44 && !/\.$/.test(teachOf(m.id))), 'each is short enough for one stop on a phone (44 letters at most), with no full stop', MAPS.map((m) => teachOf(m.id)).filter((t) => t.length > 44));
A(MAPS.filter((m) => m.boss).every((m) => /^Boss: \w/.test(teachOf(m.id))) && MAPS.filter((m) => !m.boss).every((m) => !/^Boss/.test(teachOf(m.id))), 'a boss map names its boss; no other does');
A(new Set(MAPS.map((m) => teachOf(m.id))).size === MAPS.length && teachOf('nope') === '', 'no two maps teach the same thing in the same words');
A(/combo/i.test(teachOf('c1-2')) && /catch/i.test(teachOf('c1-4')) && /Geo/.test(teachOf('c2-1')), 'the lines match the maps (combos, catching, Geo Symbols)');
{
	const hub = fs.readFileSync(path.join(ROOT, 'poketactica/js/hub.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'poketactica/css/poketactica.css'), 'utf8');
	A(/const stops = MAPS\.map\(stop\);/.test(hub) && /class="ph-list ph-path bal-scroll"/.test(hub) && /focus: nTabs \+ Math\.max\(0, MAPS\.indexOf\(at\)\)/.test(hub), 'the Story screen draws ALL the maps as one path, and the focus starts on the map you are at');
	A(/<small class="ph-teach">\$\{open \? esc\(teachOf\(m\.id\)\) : 'clear the map before it'\}<\/small>/.test(hub), 'each stop says what it teaches; a map not yet open does not give it away');
	A(/class="ph-path-ch" data-ch="\$\{m\.chapter\}"/.test(hub) && CHAPTERS.length === 6, 'a chapter\'s name stands before its first stop');
	A(/go: \(\) => \(done \? replay\(m\) : team\(\{ kind: 'map', id: m\.id \}\)\)/.test(hub), 'a stop still opens its map (a cleared one: play again, or its hard set)');
	A(/\.ph-path \.ph-stop:nth-of-type\(even\) \{ margin-left: 22%; \}/.test(css) && /\.ph-path \.ph-stop::after/.test(css) && /\.ph-path \.ph-stop\.is-here/.test(css), 'drawn as a path: the stops lean left then right, a road joins them, and the one you are at is ringed');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
