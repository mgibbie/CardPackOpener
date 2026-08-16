// badges_test.mjs — unit tests for the progression spine (overworld/badges.js).
// Pure node: badges.js only imports safestore.js (node-safe). We install an
// in-memory localStorage so persistence round-trips are exercised too.
//   run:  node overworld/tests/badges_test.mjs
const store = new Map();
globalThis.localStorage = {
	getItem: k => (store.has(k) ? store.get(k) : null),
	setItem: (k, v) => { store.set(k, String(v)); },
	removeItem: k => { store.delete(k); },
	clear: () => store.clear(),
};

const B = await import('../badges.js');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const reset = () => { store.clear(); B._reset(); };

// ---- region normalization ----
A(B.regionKey('kanto') === 'KANTO', 'regionKey lowercases -> KANTO');
A(B.regionKey('HOENN') === 'HOENN', 'regionKey passes through HOENN');
A(B.regionKey('') === 'KANTO', 'regionKey falls back to KANTO on junk');
A(B.regionKey(undefined) === 'KANTO', 'regionKey handles undefined');

// ---- scriptInfo mapping: gyms across all three regions ----
reset();
const gymCases = [
	['PewterCity_Gym_EventScript_Brock', 'KANTO', 'boulder'],
	['ViridianCity_Gym_EventScript_Giovanni', 'KANTO', 'earth'],
	['VioletGymFalknerScript', 'JOHTO', 'zephyr'],
	['BlackthornGymClairScript', 'JOHTO', 'rising'],
	['RustboroCity_Gym_EventScript_Roxanne', 'HOENN', 'stone'],
	['SootopolisCity_Gym_1F_EventScript_Juan', 'HOENN', 'rain'],
	['LavaridgeTown_Gym_1F_EventScript_Flannery', 'HOENN', 'heat'],
	['PetalburgCity_Gym_EventScript_NormanBattle', 'HOENN', 'balance'],
	['PewterGymBrockScript', 'KANTO', 'boulder'], // JohKanto crystal gym -> Kanto badge
];
for (const [script, region, id] of gymCases) {
	const info = B.scriptInfo(script);
	A(info && info.kind === 'gym' && info.region === region && info.id === id,
		`scriptInfo(${script}) -> gym ${region}/${id}`, JSON.stringify(info));
}

// every region has exactly 8 badges, each with a unique id + a name + leader
for (const r of ['KANTO', 'JOHTO', 'HOENN']) {
	const set = B.BADGES[r];
	A(set.length === 8, `${r} has 8 badges`);
	A(new Set(set.map(b => b.id)).size === 8, `${r} badge ids are unique`);
	A(set.every(b => b.name && b.leader), `${r} badges all have a name + leader`);
}

// every gym-leader script resolves to a real badge id in its region
for (const [script, [region, id]] of Object.entries(B.GYM_SCRIPT)) {
	A(B.BADGES[region].some(b => b.id === id), `GYM_SCRIPT ${script} -> valid ${region} badge`, id);
}

// ---- scriptInfo: Elite Four + Champion ----
A(B.scriptInfo('PokemonLeague_LoreleisRoom_EventScript_Battle')?.kind === 'elite', 'Lorelei = elite (Kanto)');
A(B.scriptInfo('PokemonLeague_ChampionsRoom_EventScript_BattleCharmander')?.kind === 'champion', 'Terry = champion (Kanto)');
A(B.scriptInfo('EverGrandeCity_ChampionsRoom_EventScript_Wallace')?.kind === 'champion', 'Wallace = champion (Hoenn)');
A(B.scriptInfo('LancesRoomLanceScript')?.kind === 'champion', 'Lance = champion (Johto)');
A(B.scriptInfo('KarenScript_Battle')?.kind === 'elite', 'Karen = elite (Johto)');
// every league script points at a real region
for (const [script, [region, role]] of Object.entries(B.LEAGUE_SCRIPT)) {
	A(['KANTO', 'JOHTO', 'HOENN'].includes(region) && ['elite', 'champion'].includes(role),
		`LEAGUE_SCRIPT ${script} well-formed`, `${region}/${role}`);
}

// ---- ordinary trainers / junk return null ----
A(B.scriptInfo('SomeRoute_EventScript_YoungsterJoey') === null, 'ordinary trainer -> null');
A(B.scriptInfo(undefined) === null, 'undefined script -> null');
A(B.scriptInfo('') === null, 'empty script -> null');

// ---- earn / has / count / persistence ----
reset();
A(B.count('KANTO') === 0, 'fresh account has 0 Kanto badges');
A(B.earn('KANTO', 'boulder') === true, 'earning a new badge returns true');
A(B.earn('KANTO', 'boulder') === false, 'earning the same badge again returns false');
A(B.has('KANTO', 'boulder') === true, 'has() reflects the earned badge');
A(B.count('KANTO') === 1, 'count() = 1 after one badge');
A(B.count('JOHTO') === 0, 'badges are per-region (Johto still 0)');
// persistence: reset the in-memory cache, reload from the fake store
B._reset();
A(B.has('KANTO', 'boulder') === true, 'earned badge survives a reload (persisted)');
A(B.count('KANTO') === 1, 'count survives a reload');

// list() carries the earned flag in order
const kl = B.list('KANTO');
A(kl.length === 8 && kl[0].id === 'boulder' && kl[0].earned === true && kl[1].earned === false,
	'list() is ordered with earned flags');

// ---- League gate math ----
reset();
A(B.badgesUntilLeague('HOENN') === 8, 'need 8 badges before the League (fresh)');
for (const b of B.BADGES.HOENN) B.earn('HOENN', b.id);
A(B.count('HOENN') === 8, 'all 8 Hoenn badges earned');
A(B.badgesUntilLeague('HOENN') === 0, 'League opens at 8 badges');

// ---- HM gate thresholds (canonical order per region) ----
A(B.hmReq('KANTO', 'flash') === 1 && B.hmReq('KANTO', 'surf') === 5, 'Kanto: flash=1, surf=5');
A(B.hmReq('KANTO', 'rocksmash') === 0, 'Kanto rock smash is ungated');
A(B.hmReq('HOENN', 'cut') === 1 && B.hmReq('HOENN', 'waterfall') === 8, 'Hoenn: cut=1, waterfall=8');
A(B.hmReq('JOHTO', 'cut') === 2 && B.hmReq('JOHTO', 'surf') === 4, 'Johto: cut=2, surf=4');
A(B.hmReq('KANTO', 'nonsense') === 0, 'unknown HM -> ungated (0)');

// ---- champion crown ----
reset();
A(B.isChampion('KANTO') === false, 'not champion by default');
A(B.crown('KANTO') === true, 'crowning returns true the first time');
A(B.crown('KANTO') === false, 'crowning again returns false');
A(B.isChampion('KANTO') === true, 'isChampion true after crown');
B._reset();
A(B.isChampion('KANTO') === true, 'champion status persists across reload');
A(B.isChampion('JOHTO') === false, 'champion is per-region');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
