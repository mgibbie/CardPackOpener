// crossregion_test.mjs — the cross-region badge-thirds gate (quest.js globalTier).
// Pure node (no browser): badges.js/events.js degrade to in-memory when there's no
// localStorage, so we can set arbitrary badge counts and assert the gate + objective.
//   node overworld/tests/crossregion_test.mjs
import * as Q from '../quest.js';
import * as Badges from '../badges.js';
import * as Story from '../events.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

Story.setFlag('intro_done'); // past the starter intro so stage()/objective() are real
// set exact badge counts per shared region by earning the first n gym badges of each
function setBadges(k, j, h) {
	Badges._reset();
	const earn = (region, n) => Badges.list(region).slice(0, n).forEach(b => Badges.earn(region, b.id));
	earn('KANTO', k); earn('JOHTO', j); earn('HOENN', h);
}

// --- globalTier is the min across the three shared regions ---
setBadges(0, 0, 0); A(Q.globalTier() === 0, 'globalTier 0 at a fresh start');
setBadges(1, 0, 0); A(Q.globalTier() === 0, 'globalTier stays 0 when only KANTO has a badge (others lag)');
setBadges(3, 2, 1); A(Q.globalTier() === 1, 'globalTier = the minimum region (3/2/1 -> 1)');

// --- the corridor gate keys on globalTier, not the local region count ---
setBadges(1, 0, 0);
const cer1 = Q.blocked('KANTO', 'CeruleanCity', 'PewterCity'); // Cerulean needs 1
A(cer1 && cer1.need === 1, 'CeruleanCity (need 1) is BLOCKED when KANTO=1 but JOHTO/HOENN=0', JSON.stringify(cer1));
A(cer1 && /VIOLET CITY/.test(cer1.msg) && /RUSTBORO CITY/.test(cer1.msg), 'the block message names the lagging regions’ same-tier towns', cer1 && cer1.msg.replace(/\n/g, ' '));

setBadges(1, 1, 1);
A(Q.blocked('KANTO', 'CeruleanCity', 'PewterCity') === null, 'CeruleanCity is ALLOWED once gym 1 is cleared in all three regions');
const ver = Q.blocked('KANTO', 'VermilionCity', 'CeruleanCity'); // Vermilion needs 2
A(ver && ver.need === 2, 'the next tier (VermilionCity, need 2) is still blocked at globalTier 1');

setBadges(2, 2, 2);
A(Q.blocked('KANTO', 'VermilionCity', 'CeruleanCity') === null, 'VermilionCity opens once gym 2 is cleared everywhere');

// --- gym-DOOR gates follow the same rule (gym k+1 door needs globalTier k). Use
// Viridian (gym 8, an early-reachable / un-town-gated town) so the gym-door gate — not
// a town corridor gate — is what's being exercised. ---
setBadges(1, 1, 1);
A(Q.blocked('KANTO', 'CeruleanCity_Gym', 'CeruleanCity') === null, 'gym 2 door open at globalTier 1');
A(Q.blocked('KANTO', 'ViridianCity_Gym', 'ViridianCity') !== null, 'gym 8 door (Viridian) sealed at globalTier 1');
setBadges(7, 7, 7);
A(Q.blocked('KANTO', 'ViridianCity_Gym', 'ViridianCity') === null, 'gym 8 door opens once globalTier reaches 7');

// --- retreat / lateral is never blocked (strand-safety), independent of globalTier ---
setBadges(0, 0, 0);
A(Q.blocked('KANTO', 'CeruleanCity', 'Route4') === null, 'lateral move (Route4 need1 -> Cerulean need1) is never blocked');
A(Q.blocked('KANTO', 'CeruleanCity', 'PewterCity') !== null, 'the same forward move from a shallower map IS blocked');

// --- the objective explains the interleave when a region races ahead ---
setBadges(1, 0, 0);
const obj = Q.objective('KANTO');
A(/ahead/i.test(obj) && /PORTAL/.test(obj) && /FALKNER/.test(obj) && /ROXANNE/.test(obj),
	'KANTO objective tells you to beat gym 1 in the lagging regions via the PORTAL', obj);
A(/VIOLET CITY/.test(Q.objective('JOHTO')) || /FALKNER/.test(Q.objective('JOHTO')),
	'a region AT the floor gets its normal "go beat your gym" objective', Q.objective('JOHTO'));
A(/GYM 1/.test(Q.shortObjective('KANTO')) || /Portal/.test(Q.shortObjective('KANTO')),
	'shortObjective flags the waiting state', Q.shortObjective('KANTO'));

// --- the LEAGUE waits on all three regions too ---
setBadges(8, 7, 7);
A(Q.blocked('KANTO', 'Route23', 'ViridianCity') !== null, 'the KANTO League approach (need 8) is sealed while others are at 7');
A(/ahead/i.test(Q.objective('KANTO')), 'a fully-badged region is told to finish the others before the League', Q.objective('KANTO'));
setBadges(8, 8, 8);
A(Q.blocked('KANTO', 'Route23', 'ViridianCity') === null, 'the League opens once every region has all 8');

// --- JohKanto (Gen-2 Kanto) is EXCLUDED: its badges don't feed globalTier, its maps aren't gated ---
setBadges(1, 1, 1);
Badges.list('JOHKANTO').slice(0, 3).forEach(b => Badges.earn('JOHKANTO', b.id));
A(Q.globalTier() === 1, 'earning JohKanto badges does NOT change globalTier');
A(Q.blocked('JOHTO', 'JohKantoPewterCity', 'NewBarkTown') === null, 'a JohKanto map is ungated by the cross-region gate');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
