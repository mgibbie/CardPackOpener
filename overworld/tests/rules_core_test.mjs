// rules_core_test.mjs — overworld/rules/: the Pokémon rules shared by the overworld's battles and Poketactica (stage 1,
// owner 2026-11-20) load in plain node (no DOM), give the canonical numbers, and the seeded generator replays exactly.
// battle.js reads them (no copies left behind). Pure: node only.
//   node overworld/tests/rules_core_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as R from '../rules/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };

// the type chart
A(R.effectiveness('Fire', ['Grass']) === 2 && R.effectiveness('Fire', ['Grass', 'Steel']) === 4 && R.effectiveness('Fire', ['Water', 'Rock']) === 0.25, 'type chart: Fire 2x Grass, 4x Grass/Steel, 0.25x Water/Rock');
A(R.effectiveness('Normal', ['Ghost']) === 0 && R.effectiveness('Ground', ['Flying']) === 0 && R.effectiveness('Dragon', ['Fairy']) === 0, 'type chart immunities (Normal-Ghost, Ground-Flying, Dragon-Fairy)');
A(Object.keys(R.CHART).length === 18, '18 attacking types');
// stats
A(R.stageMult(0) === 1 && R.stageMult(2) === 2 && R.stageMult(6) === 4 && R.stageMult(-2) === 0.5 && R.stageMult(-6) === 0.25, 'stat stages: +2 = 2x, +6 = 4x, -2 = 0.5x, -6 = 0.25x');
A(R.calcStat(100, 0, 0, 50, false) === 105 && R.calcStat(100, 0, 0, 50, true) === 160 && R.calcStat(100, 31, 252, 100, false) === 299, 'the stat formula (base 100: 105 at L50; HP 160; max IVs/EVs at L100 299)');
A(Object.keys(R.NATURES).length === 25 && R.NATURE_NAMES.length === 25, '25 natures');
const st = R.statsFor({ baseStats: { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 } }, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, 5, { nature: 'modest' });
A(st.spa === Math.floor(R.calcStat(65, 0, 0, 5, false) * 1.1) && st.atk === Math.floor(R.calcStat(49, 0, 0, 5, false) * 0.9), 'statsFor applies a nature (+10% / -10%)');
// damage
A(R.baseDamage(50, 90, 100, 100) === 41 && R.baseDamage(100, 120, 300, 150) === 203, 'the base damage formula (L50 90-power even stats = 41; L100 120-power 300 vs 150 = 203)');
A(R.damageRoll(() => 0) === 0.85 && R.damageRoll(() => 0.999999) > 0.9999, 'the damage roll is 0.85-1.00');
// move and ability tables
A(R.SPREAD_MOVES.has('earthquake') && R.ALL_ADJACENT.has('surf') && R.PUNCH_MOVES.has('firepunch') && R.SOUND_MOVES.has('hypervoice'), 'the move families are there');
A(R.MOVE_FX && Object.keys(R.MOVE_FX).length > 400 && R.STAT_MOVES.swordsdance, 'MOVE_FX (400+ effects) and STAT_MOVES are there');
A(R.AB_ONHIT.infuriate && R.AB_ABSORB.voltabsorb && R.STATUS_IMMUNE_AB, 'the ability tables are there (incl. the custom Infuriate)');
// the seeded generator
const a = R.makeRng('poketactica'), b = R.makeRng('poketactica'), c = R.makeRng('other');
const sa = Array.from({ length: 50 }, a), sb = Array.from({ length: 50 }, b), sc = Array.from({ length: 50 }, c);
A(JSON.stringify(sa) === JSON.stringify(sb) && JSON.stringify(sa) !== JSON.stringify(sc), 'same seed, same numbers; another seed, others');
A(sa.every((x) => x >= 0 && x < 1), 'floats in [0, 1)');
const r1 = R.makeRng(7); r1(); r1(); const saved = r1.state(); const next3 = [r1(), r1(), r1()];
const r2 = R.makeRng(0).at(saved);
A(JSON.stringify([r2(), r2(), r2()]) === JSON.stringify(next3), 'state() / at() resume the sequence exactly (a saved game)');
const ints = Array.from({ length: 2000 }, () => a.int(6)); const hist = [0, 1, 2, 3, 4, 5].map((k) => ints.filter((x) => x === k).length);
A(hist.every((n) => n > 250 && n < 420), 'int(n) is spread evenly', JSON.stringify(hist));
// battle.js reads them: no copy of a moved table or of the formula is left in it
const B = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
A(/from '\.\/rules\/tables\.js'/.test(B) && /from '\.\/rules\/movefx\.js'/.test(B) && /from '\.\/rules\/stats\.js'/.test(B) && /from '\.\/rules\/damage\.js'/.test(B), 'battle.js imports the shared rules');
A(!/^(const|function) (CHART|MOVE_FX|STAT_MOVES|calcStat|stageMult|effectiveness|AB_ONHIT)\b/m.test(B), 'battle.js keeps no copy of the moved tables');
A(!/2 \* (user\.level|L|\(f\.level \|\| 50\)) \/ 5 \+ 2/.test(B), 'battle.js keeps no hand-written copy of the damage formula');
// no DOM, no state: nothing in rules/ touches window / document / localStorage / Math.random
for (const f of fs.readdirSync(path.join(ROOT, 'overworld/rules'))) {
	const t = fs.readFileSync(path.join(ROOT, 'overworld/rules', f), 'utf8').replace(/\/\/.*$/gm, '');
	A(!/\b(window|document|localStorage)\b|Math\.random/.test(t), `rules/${f} is pure (no DOM, storage or Math.random)`);
}

// ---- rules/modifiers.js: accuracy, the damage modifier stack, crits, one hit (stage 1 part 2)
{
	const acc = (o) => R.accuracyOf({ moveId: 'tackle', acc: 100, category: 'Physical', type: 'Normal', userTypes: ['Normal'], ...o });
	A(acc({}).hitChance === 100 && acc({ accStage: 2 }).hitChance === 200 && acc({ evaStage: 2 }).hitChance === 50, 'accuracy: base, +2 accuracy, +2 evasion');
	A(acc({ moveId: 'thunder', acc: 70, weather: 'rain' }).hitChance === 999 && acc({ moveId: 'thunder', acc: 70, weather: 'sun' }).hitChance === 50, 'Thunder never misses in rain, 50% in sun');
	A(acc({ userAb: 'noguard', acc: 50 }).hitChance === 999 && acc({ userAb: 'sunbeam', type: 'Fire', acc: 50 }).hitChance === 999, 'No Guard and Sunbeam (Fire) never miss');
	A(Math.abs(acc({ targetAb: 'sandveil', weather: 'sand' }).hitChance - 80) < 1e-9 && acc({ moveId: 'aerialace' }).neverMiss && acc({ moveId: 'toxic', userTypes: ['Poison'] }).neverMiss, 'Sand Veil in sand; never-miss moves; Toxic from a Poison type');
	const base = { moveId: 'tackle', type: 'Normal', category: 'Physical', Pw: 80, phys: true, fx: {}, eff: 1, user: { ab: null, types: ['Normal'], curHP: 100, maxHP: 100 }, target: { ab: null, curHP: 100, maxHP: 100 } };
	const dm = (o, u = {}, t = {}) => R.damageMods({ ...base, ...o, user: { ...base.user, ...u }, target: { ...base.target, ...t } }).mult;
	A(dm({}) === 1, 'no modifiers: 1x');
	A(dm({ type: 'Water', weatherRaw: 'rain' }) === 1.5 && dm({ type: 'Fire', weatherRaw: 'rain' }) === 0.5 && dm({ type: 'Fire', weatherRaw: 'sun' }) === 1.5, 'rain / sun scale Water and Fire');
	A(dm({ type: 'Electric', terrain: 'electric' }) === 1.3 && dm({ type: 'Dragon', terrain: 'misty' }) === 0.5, 'terrains');
	A(dm({ Pw: 60 }, { ab: 'technician' }) === 1.5 && dm({ Pw: 61 }, { ab: 'technician' }) === 1, 'Technician: 60 power or less');
	A(dm({ type: 'Grass' }, { ab: 'overgrow', curHP: 33 }) === 1.5 && dm({ type: 'Grass' }, { ab: 'overgrow', curHP: 34 }) === 1, 'Overgrow at a third of HP or less');
	A(dm({}, {}, { ab: 'multiscale' }) === 0.5 && dm({}, {}, { ab: 'multiscale', curHP: 99 }) === 1, 'Multiscale only at full HP');
	A(dm({ spread: true }) === 0.75 && dm({ uItem: { lifeOrb: true } }) === 1.3 && dm({ eff: 2, uItem: { expertBelt: true } }) === 1.2, 'spread 0.75x, Life Orb, Expert Belt (super-effective only)');
	A(dm({ type: 'Fairy', fieldAbs: ['fairyaura'] }) === 4 / 3 && dm({ type: 'Fairy', fieldAbs: ['fairyaura', 'aurabreak'] }) === 0.75, 'auras and Aura Break');
	A(dm({ double: true, allyAb: 'powerspot' }) === 1.3 && dm({ double: true, targetAllyFriendGuard: true }) === 0.75 && dm({ double: false, allyAb: 'powerspot' }) === 1, 'doubles allies: Power Spot, Friend Guard (doubles only)');
	const ch = R.damageMods({ ...base, type: 'Electric', user: { ...base.user, chargedUp: true } });
	A(ch.mult === 2 && ch.usedCharge, 'Charge doubles an Electric hit and is spent');
	A(R.critChanceOf({}) === 1 / 16 && R.critChanceOf({ moveId: 'slash' }) === 1 / 8 && R.critChanceOf({ moveId: 'frostbreath' }) === 1 && R.critChanceOf({ moveId: 'frostbreath', blocked: true }) === 0, 'crit odds: 1/16, high-crit 1/8, always-crit, blocked');
	A(R.critMultOf('sniper') === 2.5 && R.critMultOf(null) === 2, 'crits 2x, Sniper 2.5x');
	A(R.hitDamage(100, { crit: true, critMult: 2, stab: 1.5, eff: 2, screened: 0.5, envMult: 1, roll: 1 }) === 300 && R.hitDamage(1, { stab: 1, eff: 0.25, screened: 1, envMult: 1, roll: 0.85 }) === 1, 'one hit: the product, never below 1');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
