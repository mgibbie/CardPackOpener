// badge_gap_test.mjs — the guide points at the gym you're MISSING, not gym (count+1).
//
// 2026-10-02, Instinct's bug report: their Hoenn badges were stone, knuckle,
// dynamo, heat and FEATHER — five, with Norman's Balance missing. Every guide
// indexed GYMS[HOENN][5] by the count, so the HUD, the cross-region "ahead" line
// and the Town Map all sent them back to Winona (already beaten), never Norman.
// The next gym is now the FIRST gym in order whose badge is missing. Tier rules
// (gates, level caps) stay count-based.
//   1. Instinct's save shape: objective / ahead-line / short objective / quest log /
//      portal destination / gate message name NORMAN (PETALBURG), never WINONA
//   2. a contiguous save is unchanged (5 in order -> Winona is next)
//   3. the Town Map "owes" line uses the earliest missing badge
//
//   node overworld/tests/badge_gap_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// a browser-ish global storage for the real modules (safestore -> localStorage)
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
globalThis.window = globalThis.window || globalThis;
const imp = f => import(pathToFileURL(path.join(ROOT, 'overworld', f)).href);

function seed(badges) {
	store.clear();
	store.set('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
	store.set('magepunk_badges_v1', JSON.stringify({ badges, champion: {} }));
}

const Badges = await imp('badges.js');
const Story = await imp('events.js');
const Quest = await imp('quest.js');
const Portals = await imp('portals.js');
const reload = () => { Badges._reset?.(); Story.reloadStory?.(); };

// ===== 1. Instinct's save: Johto 6, Kanto 5, Hoenn 5 with Balance missing =====
seed({
	KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true },
	JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true },
	HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, feather: true },
});
reload();
A(Badges.count('HOENN') === 5 && Quest.globalTier() === 5, 'setup: Hoenn has 5 badges (Balance missing), world tier 5', JSON.stringify({ h: Badges.count('HOENN'), g: Quest.globalTier() }));
A(Quest.nextGymIndex?.('HOENN') === 4 && Quest.nextGym?.('HOENN')?.leader === 'NORMAN', '1. Hoenn\'s next gym is NORMAN (index 4), its earliest missing badge', JSON.stringify(Quest.nextGym?.('HOENN')));
const ahead = Quest.objective('JOHTO');
A(/NORMAN in PETALBURG/.test(ahead) && !/WINONA/.test(ahead), '1. Johto\'s "ahead" line sends you to NORMAN in PETALBURG, not Winona', ahead);
const hoennObj = Quest.objective('HOENN');
A(/NORMAN/.test(hoennObj) && /PETALBURG/.test(hoennObj) && !/WINONA/.test(hoennObj), '1. Hoenn\'s own objective names NORMAN in PETALBURG', hoennObj);
A(/PETALBURG/.test(Quest.shortObjective('HOENN')), '1. the Trainer Card short objective says PETALBURG', Quest.shortObjective('HOENN'));
const log = Quest.log('HOENN');
const rowOf = n => log.find(r => r.label.startsWith(n));
A(rowOf('NORMAN')?.state === 'current' && rowOf('WINONA')?.state === 'done', '1. the quest log marks NORMAN current and WINONA done', JSON.stringify([rowOf('NORMAN'), rowOf('WINONA')]));
const dests = Portals.destsFor('JOHTO', 5);
const hd = dests.find(d => d.region === 'HOENN');
A(hd && hd.town === 'PETALBURG CITY', '1. a Johto portal at tier 5 lands in PETALBURG (Norman), not Fortree', JSON.stringify(hd && hd.town));

// ===== 2. contiguous: unchanged =====
seed({
	KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true },
	JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true },
	HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, balance: true },
});
reload();
A(/WINONA in FORTREE/.test(Quest.objective('JOHTO')), '2. a contiguous Hoenn 5 still points at WINONA in FORTREE', Quest.objective('JOHTO'));
A(Portals.destsFor('JOHTO', 5).find(d => d.region === 'HOENN')?.town === 'FORTREE CITY', '2. ...and its portal still lands in Fortree');

// ===== 3. Town Map "owes" line =====
const menus = fs.readFileSync(path.join(ROOT, 'overworld', 'ow_menus.js'), 'utf8');
A(/const owed = Quest\.nextGym\(rkey\)/.test(menus) && /`Owes \$\{owed\.leader\} \(\$\{owed\.town\}\)`/.test(menus), '3. the Town Map "owes" line names the earliest missing badge (Quest.nextGym)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
