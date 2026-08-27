// lorequest_unlocks_test.mjs — the character-progression tables + derivation:
// 3 starters, one core per completed run, bosses gated behind the full core
// roster + per-character win-streak feats. The name-validation asserts are the
// important ones — a typo in a table would silently make a character
// unreachable.
import * as Lorequest from '../../lorequest.js';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const { PLANESWALKERS, BOSSES, STARTERS, CORE_UNLOCK_ORDER, BOSS_UNLOCKS, unlockedCharacters } = Lorequest;

// ---- table integrity ----
ok('3 starters, all real planeswalkers', STARTERS.length === 3 && STARTERS.every(c => PLANESWALKERS.includes(c)));
ok('starters + core order = the full 16, no dupes',
	new Set([...STARTERS, ...CORE_UNLOCK_ORDER]).size === PLANESWALKERS.length
	&& [...STARTERS, ...CORE_UNLOCK_ORDER].every(c => PLANESWALKERS.includes(c)));
ok('every boss has an unlock entry', BOSSES.every(b => BOSS_UNLOCKS[b]), BOSSES.filter(b => !BOSS_UNLOCKS[b]));
ok('no unlock entry for a non-boss', Object.keys(BOSS_UNLOCKS).every(b => BOSSES.includes(b)));
ok('every unlock links a real planeswalker with a streak >= 2',
	Object.values(BOSS_UNLOCKS).every(([pw, n]) => PLANESWALKERS.includes(pw) && n >= 2));

// ---- derivation ----
ok('free play (no stats) = the full roster', unlockedCharacters(null).length === PLANESWALKERS.length + BOSSES.length);
ok('a fresh account has exactly the starters', unlockedCharacters({}).join(',') === STARTERS.join(','));
ok('5 runs = 8 cores', unlockedCharacters({ modes: { lorequest: { runs: 5 } } }).length === 8);
const allCores = { modes: { lorequest: { runs: 13 } } };
ok('13 runs = all 16 cores, zero bosses without feats', unlockedCharacters(allCores).length === 16);
const withFeat = { ...allCores, chars: { 'lorequest|Ob Nixilis': { best: 2 } } };
const u1 = unlockedCharacters(withFeat);
ok('Ob Nixilis 2-streak unlocks Gix', u1.includes('Gix'));
ok('...but not Lolth (needs 3)', !u1.includes('Lolth'));
const u2 = unlockedCharacters({ ...allCores, chars: { 'lorequest|Ob Nixilis': { best: 3 } } });
ok('a 3-streak unlocks Lolth too', u2.includes('Gix') && u2.includes('Lolth'));
// bosses stay locked until EVERY core is unlocked, even with the feat done
const early = unlockedCharacters({ modes: { lorequest: { runs: 2 } }, chars: { 'lorequest|Ob Nixilis': { best: 5 } } });
ok('boss feats do nothing before the core roster completes', !early.includes('Gix'));

// ---- the four sibling modes: table integrity + derivation, same rules ----
const ME = await import('../../middleearth.js');
const SC = await import('../../swordcoast.js');
const FF = await import('../../finalfantasy.js');
const MV = await import('../../multiverse.js');
for (const [key, M] of [['middleearth', ME], ['swordcoast', SC], ['finalfantasy', FF], ['multiverse', MV]]) {
	const { HEROES, ENEMIES, STARTERS: ST, CORE_UNLOCK_ORDER: ORD, ENEMY_UNLOCKS: EU, unlockedCharacters: uc } = M;
	ok(`${key}: 3 starters, all real heroes`, ST.length === 3 && ST.every(c => HEROES.includes(c)));
	ok(`${key}: starters + order = all ${HEROES.length} heroes, no dupes`,
		new Set([...ST, ...ORD]).size === HEROES.length && [...ST, ...ORD].every(c => HEROES.includes(c)));
	ok(`${key}: every enemy has an unlock entry`, ENEMIES.every(e => EU[e]), ENEMIES.filter(e => !EU[e]));
	ok(`${key}: no entry for a non-enemy`, Object.keys(EU).every(e => ENEMIES.includes(e)));
	ok(`${key}: every unlock links a real hero, streak >= 2`,
		Object.values(EU).every(([h, n]) => HEROES.includes(h) && n >= 2));
	ok(`${key}: free play = full roster`, uc(null).length === HEROES.length + ENEMIES.length);
	ok(`${key}: fresh account = the starters`, uc({}).join(',') === ST.join(','));
	const allCores = { modes: { [key]: { runs: ORD.length } } };
	ok(`${key}: ${ORD.length} runs = all cores, no enemies`, uc(allCores).length === HEROES.length);
	const [someEnemy, [linkedHero, need]] = Object.entries(EU)[0];
	const withFeat = { ...allCores, chars: { [key + '|' + linkedHero]: { best: need } } };
	ok(`${key}: the feat unlocks its enemy`, uc(withFeat).includes(someEnemy));
	ok(`${key}: feats do nothing before the cores complete`,
		!uc({ modes: { [key]: { runs: 1 } }, chars: { [key + '|' + linkedHero]: { best: 9 } } }).includes(someEnemy));
}

// ---- the offer helper ----
const offer = Lorequest.offerFrom(['a', 'b', 'c', 'd'], () => 0.5, 3);
ok('offerFrom gives 3 distinct picks', new Set(offer).size === 3);
ok('offerFrom caps at the pool size', Lorequest.offerFrom(['a'], Math.random, 3).length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
