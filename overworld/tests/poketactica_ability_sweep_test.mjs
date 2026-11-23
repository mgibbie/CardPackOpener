// poketactica_ability_sweep_test.mjs — THE ABILITIES SWEEP, pinned (owner, 2026-11-23: every ability checked). The table in
// poketactica/data/ability_sweep.json says, for each of the 318 abilities a species can have, in which scenes it changes
// anything next to the same unit with no ability and the same dice (tools/poketactica/sweep_abilities.mjs: entering,
// attacking, defending, the end of the phase, auras, knockouts). This suite runs the sweep again and holds the table to
// it: an ability that stops working (or starts) fails here until the table is rewritten on purpose
// (`node tools/poketactica/sweep_abilities.mjs --write`). Pure: node only.
//   node overworld/tests/poketactica_ability_sweep_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sweepAbilities, deadAbilities } from '../../tools/poketactica/sweep_abilities.mjs';
import { loadData, mazeRun } from '../../tools/poketactica/sweep_moves.mjs';
import * as MM from '../../poketactica/js/mm/turn.js';
import * as B from '../../poketactica/js/engine/battle.js';
import * as A2 from '../../poketactica/js/engine/abilities2.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import * as FX from '../../poketactica/js/engine/statusfx.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = loadData();
const TABLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'poketactica/data/ability_sweep.json'), 'utf8'));
const DEAD_MAX = 121;   // (never more; when abilities are fixed the table is rewritten and this number moves down)

const R = sweepAbilities(data), ids = Object.keys(R), dead = deadAbilities(R);
const every = [...new Set(Object.values(data.abilities).flatMap((v) => (Array.isArray(v) ? v : [])))];
A(ids.length === every.length && ids.length === Object.keys(TABLE).length && ids.length >= 318, `every ability a species can have is in the table (${ids.length})`);
const off = ids.filter((id) => JSON.stringify(R[id]) !== JSON.stringify(TABLE[id]));
A(!off.length, 'each ability shows in the scenes the table says it does', off.slice(0, 12).map((id) => `${id}: now ${JSON.stringify(R[id])}, table ${JSON.stringify(TABLE[id])}`));
A(dead.length <= DEAD_MAX, `the abilities that change nothing: ${dead.length} of ${ids.length} (never more than ${DEAD_MAX})`, dead.length);
// the ones the engine has had from the start keep working, each where it should
const want = { intimidate: 'enter', drought: 'enter', drizzle: 'enter', electricsurge: 'enter', static: 'defend', flamebody: 'defend', roughskin: 'defend', levitate: 'stats', pressure: 'aura', friendguard: 'aura', victorystar: 'aura',
	arenatrap: 'aura', shadowtag: 'aura', lightningrod: 'aura', stormdrain: 'aura', guts: 'attack', technician: 'attack', adaptability: 'attack', thickfat: 'defend', voltabsorb: 'defend', waterabsorb: 'defend', flashfire: 'defend', immunity: 'defend', limber: 'defend', insomnia: 'defend' };
const lost = Object.entries(want).filter(([id, scene]) => !(R[id] || []).includes(scene)).map(([id, scene]) => id + ' (' + scene + ')');
A(!lost.length, `${Object.keys(want).length} abilities the engine has always had still show where they should (Intimidate on entering, Static when struck, Guts when attacking ...)`, lost);

// ---------- the first batch of abilities carried over (RULES_REV 7, engine/abilities2.js)
{
	const shown = ['hugepower', 'purepower', 'marvelscale', 'shellarmor', 'battlearmor', 'merciless', 'rockhead', 'magicguard', 'clearbody', 'whitesmoke', 'fullmetalbody', 'hypercutter', 'bigpecks', 'contrary', 'simple', 'defiant', 'competitive',
		'owntempo', 'angerpoint', 'weakarmor', 'stamina', 'justified', 'rattled', 'watercompaction', 'steamengine', 'berserk', 'angershell', 'gooey', 'tanglinghair', 'poisontouch', 'moxie', 'chillingneigh', 'asone', 'grimneigh', 'beastboost',
		'speedboost', 'moody', 'shedskin', 'icebody', 'raindish', 'regenerator', 'poisonheal', 'sturdy', 'skilllink', 'serenegrace', 'shielddust', 'aftermath'];
	const not = shown.filter((id) => !R[id].length);
	A(!not.length, `${shown.length} abilities that changed nothing now show in the sweep (Huge Power, Sturdy, Moxie, Speed Boost, Clear Body ...)`, not);

	const fig = (sp, lv, ability) => ({ ...makeFigurine(sp, lv, makeRng(sp), data, { id: sp, shinyRate: 0 }), ability });
	const duel = (mine, theirs, rev = B.RULES_REV, foe = 'squirtle') => { const S = B.newBattle('ab7', { map: { w: 5, h: 5, height: Array(25).fill(0), base: { x: 2, y: 2 } }, noBonus: true, rev, player: [fig('machamp', 50, mine)], enemy: [{ fig: fig(foe, 50, theirs), x: 2, y: 1, ai: 'hold' }] }, data); return S; };
	const land = (S) => { B.act(S, { t: 'deploy', uid: S.units[0].uid }, data); return S; };
	const hitBy = (S, by, id) => { const u = S.units[by], v = S.units[1 - by]; const hp = v.hp; B.useMoveAt(S, u, { move: id, x: v.x, y: v.y }, data); return hp - v.hp; };
	const same = (S) => { S.rng = makeRng('same').state(); return S; };
	{
		const plain = hitBy(same(land(duel(null, null))), 0, 'tackle'), huge = hitBy(same(land(duel('hugepower', null))), 0, 'tackle'), old = hitBy(same(land(duel('hugepower', null, 6))), 0, 'tackle');
		A(huge > plain * 1.7 && old === plain, 'Huge Power doubles physical Attack (and a battle recorded under rev 6 replays without it)', [plain, huge, old]);
		const S = land(duel(null, 'sturdy')); S.units[0].stats = { ...S.units[0].stats, atk: 99999 }; hitBy(S, 0, 'tackle');
		A(S.units[1].hp === 1, 'Sturdy: a blow that would fell it from full HP leaves 1');
		hitBy(S, 0, 'tackle'); A(S.units[1].hp === 0, 'but not a second time');
	}
	{
		const S = land(duel(null, 'clearbody')), v = S.units[1];
		B.useMoveAt(S, S.units[0], { move: 'growl', x: 2, y: 1 }, data);
		A(v.boosts.atk === 0, 'Clear Body: a foe cannot lower its stats');
		const D = land(duel(null, 'defiant')); B.useMoveAt(D, D.units[0], { move: 'growl', x: 2, y: 1 }, data);
		A(D.units[1].boosts.atk === 1, 'Defiant: lowered by a foe (-1), its Attack then rises 2', D.units[1].boosts);
		const C = land(duel(null, 'contrary')); B.useMoveAt(C, C.units[0], { move: 'growl', x: 2, y: 1 }, data);
		A(C.units[1].boosts.atk === 1, 'Contrary turns a drop into a rise');
		const K = land(duel(null, 'keeneye')); B.useMoveAt(K, K.units[0], { move: 'sandattack', x: 2, y: 1 }, data);
		A(K.units[1].boosts.acc === 0, 'Keen Eye: its accuracy cannot be lowered');
		A(JSON.stringify(A2.statChange({ ability: 'simple', side: 'p' }, { atk: 1 }, null).changes) === '{"atk":2}' && A2.statChange({ ability: 'hypercutter', side: 'p' }, { atk: -1, def: -1 }, { side: 'e' }).changes.def === -1, 'Simple doubles a change; Hyper Cutter keeps Attack only');
	}
	{
		const I = land(duel('intimidate', null)), N = land(duel('intimidate', 'innerfocus')), O = land(duel('intimidate', 'innerfocus', 6));
		A(I.units[1].boosts.atk === -1 && N.units[1].boosts.atk === 0 && O.units[1].boosts.atk === -1, 'Inner Focus is not Intimidated (it was, under rev 6)', [I.units[1].boosts.atk, N.units[1].boosts.atk, O.units[1].boosts.atk]);
		A(A2.shrugsIntimidate({ ability: 'oblivious' }) && A2.shrugsIntimidate({ ability: 'scrappy' }) && A2.shrugsIntimidate({ ability: 'owntempo' }) && !A2.shrugsIntimidate({ ability: 'keeneye' }), 'nor are Oblivious, Scrappy or Own Tempo');
	}
	{
		A(A2.speedMult({ ability: 'swiftswim' }, 'rain') === 2 && A2.speedMult({ ability: 'swiftswim' }, 'sun') === 1 && A2.speedMult({ ability: 'chlorophyll' }, 'sun') === 2 && A2.speedMult({ ability: 'sandrush' }, 'sand') === 2 && A2.speedMult({ ability: 'slushrush' }, 'hail') === 2
			&& A2.speedMult({ ability: 'quickfeet', status: 'par' }, null) === 1.5 && A2.speedMult({ ability: 'quickfeet' }, null) === 1, 'Swift Swim, Chlorophyll, Sand Rush, Slush Rush: Speed doubles in their weather; Quick Feet: 1.5× with a status');
		// (on the grid Speed is accuracy and evasion: a Swift Swim target is harder to hit in rain)
		const chance = (ab, weather) => { const S = land(duel(null, ab)); if (weather) S.field.weather = { kind: weather, turns: 5 }; S.units[0].stats = { ...S.units[0].stats, spe: 100 }; S.units[1].stats = { ...S.units[1].stats, spe: 90 }; return B.forecast(S, S.units[0], 'tackle', 2, 1, data).targets[0].hit; };
		A(chance('swiftswim', 'rain') < chance('swiftswim', null) && chance(null, 'rain') === chance(null, null), 'a Swift Swim target is harder to hit in the rain', [chance('swiftswim', 'rain'), chance('swiftswim', null)]);
	}
	{
		const S = land(duel('hydration', null)), u = S.units[0];
		u.status = 'par'; S.field.weather = { kind: 'rain', turns: 5 }; B.act(S, { t: 'end' }, data);
		A(u.status === null, 'Hydration: cured at the end of its turn in the rain');
		const P = land(duel('poisonheal', null)), pu = P.units[0]; pu.status = 'psn'; pu.hp = 50; B.act(P, { t: 'end' }, data);
		A(pu.hp >= 50 + Math.floor(pu.maxHP / 8) - 60 && pu.hp !== 50 - Math.floor(pu.maxHP / 8), 'Poison Heal: poison mends instead of biting', pu.hp);
		const M = land(duel('magicguard', null)), mu = M.units[0]; mu.status = 'brn'; const hp = mu.hp; M.units[1].ai = 'hold'; M.units[1].x = 4; M.units[1].y = 0; B.act(M, { t: 'end' }, data);
		A(mu.hp === hp, 'Magic Guard: a burn does not hurt it');
		const K = land(duel('moxie', null)); K.units[1].hp = 1; hitBy(K, 0, 'tackle');
		A(K.units[0].boosts.atk === 1, 'Moxie: +1 Attack for a knockout');
		const F = land(duel('infiltrator', null)), G = land(duel(null, null));
		for (const X of [F, G]) X.units[1].fx = { reflect: 5 };
		A(hitBy(same(F), 0, 'tackle') > hitBy(same(G), 0, 'tackle') * 1.6, 'Infiltrator goes through Reflect');
	}
}

// ---------- the end-of-turn abilities at the maze's pace (MM_RULES_REV 6): every 10th turn of the unit's own
{
	const run = (ability, rev) => { const S = mazeRun(data), L = MM.leaderOf(S); for (let i = S.units.length - 1; i >= 0; i--) if (S.units[i].side !== 'p') S.units.splice(i, 1); L.ability = ability; if (rev) S.rev = rev; return { S, L }; };
	const wait = (S, n) => { for (let i = 0; i < n; i++) MM.act(S, { t: 'pass' }, data); };
	{
		const { S, L } = run('speedboost'); wait(S, 9); const before = L.boosts.spe; wait(S, 2);
		A(before === 0 && L.boosts.spe === 1, 'Speed Boost in the maze: +1 Speed every 10th turn of its own', [before, L.boosts.spe]);
		const old = run('speedboost', 5); wait(old.S, 12);
		A(old.L.boosts.spe === 0, 'a maze run recorded under its rev 5 replays without it');
	}
	{
		const { S, L } = run('poisonheal'); L.status = 'psn'; L.hp = 20; wait(S, 22);
		const plain = run(null); plain.L.status = 'psn'; plain.L.hp = 20; wait(plain.S, 22);
		A(L.hp >= 20 + Math.floor(L.maxHP / 8) && plain.L.hp < 20, 'Poison Heal in the maze: poison mends it, where it bites anyone else', [L.hp, plain.L.hp]);
		const mg = run('magicguard'); mg.L.status = 'brn'; mg.L.hp = 20; wait(mg.S, 45);
		A(mg.L.hp >= 20, 'Magic Guard in the maze: a burn does not bite', mg.L.hp);
	}
}

// ---------- an ability that fires is NAMED on screen (it popped "Ability gone", the words for a move taking an ability away)
{
	const names = data.abilities._names, say = FX.abilitySay || (() => ({}));
	const S = B.newBattle('pop', { map: { w: 9, h: 9, height: Array(81).fill(0), base: { x: 4, y: 5 }, ground: Array(81).fill(null) }, rev: B.RULES_REV, noBonus: true,
		player: [{ ...makeFigurine('mew', 50, makeRng('p'), data, { id: 'p', shinyRate: 0 }), ability: 'intimidate' }],
		enemy: [{ fig: { ...makeFigurine('squirtle', 50, makeRng('e'), data, { id: 'e', shinyRate: 0 }), ability: null }, x: 4, y: 4, ai: 'hold' }] }, data);
	B.act(S, { t: 'deploy', uid: S.units[0].uid }, data);
	const e = S.log.find((x) => x.t === 'ability');
	A(e && e.ab === 'intimidate' && say(e, names).pop === 'Intimidate!' && say(e, names).line === "'s Intimidate", 'Intimidate firing pops its name, not "Ability gone"', e && say(e, names));
	A(say({ t: 'ability', uid: 'x', ability: null }, names).pop === 'Ability gone' && say({ t: 'ability', uid: 'x', ability: 'insomnia' }, names).pop === 'Ability changed', 'an ability a move took away or changed still says so');
	const src = ['main.js', 'mmmode.js'].map((f) => fs.readFileSync(path.join(ROOT, 'poketactica/js', f), 'utf8'));
	A(src.every((t) => t.includes('abilitySay(e,') && !t.includes("'Ability gone'")), 'the battle and the maze both show it through abilitySay');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
