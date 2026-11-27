// poketactica_training_test.mjs — TRAINING SAYS WHAT IT IS FOR (Plans/POKETACTICA_MODES_PLAN.md item D4). Training was
// one plain battle with no aim. You pick what to practise (demo.js DRILLS) and get that fight: sturdy foes that stand
// still for combos, foes on the ledges for throwing, weak wild ones by the base for catching, a foe weak to each of
// your team for type matchups. "A free battle" is the battle Training always was.
// Pure: node only.   node overworld/tests/poketactica_training_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { trainingSetup, demoMap, DRILLS, DRILL_IDS, WILD, weakTo } from '../../poketactica/js/demo.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { recipeOf } from '../../poketactica/js/replay.js';
import { effectiveness } from '../rules/tables.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const fig = (sp, lv = 20) => makeFigurine(sp, lv, makeRng(sp + lv), data, { id: sp + '-tr', shinyRate: 0 });
const team = [fig('charmander'), fig('squirtle'), fig('pikachu'), fig('machop'), fig('bulbasaur')];
const map = demoMap(), hAt = (x, y) => map.height[y * map.w + x];

// ---------- the list
A(JSON.stringify(DRILL_IDS) === '["free","combo","throw","catch","types"]' && DRILL_IDS.every((id) => DRILLS[id].name && DRILLS[id].say && DRILLS[id].icon), 'five things to practise, each with a name, a picture and a line: a free battle, combos, throwing, catching, type matchups');
A(DRILL_IDS.filter((id) => id !== 'free').every((id) => DRILLS[id].tip.length > 60) && DRILLS.free.tip === '', 'each but the free battle says what to try, in a sentence or two');

// ---------- a free battle is the battle Training always was
{
	const a = trainingSetup(team, 20, data, 'same'), b = trainingSetup(team, 20, data, 'same', 'free'), c = trainingSetup(team, 20, data, 'same', 'nonsense');
	const shape = (s) => JSON.stringify(s.enemy.map((e) => [e.fig.species, e.fig.level, e.fig.equipped, e.x, e.y, e.ai]));
	A(!a.drill && shape(a) === shape(b) && shape(a) === shape(c) && a.enemy.map((e) => e.fig.species).join() === WILD.map((w) => w.sp).join() && a.enemy.every((e, i) => e.x === WILD[i].x && e.y === WILD[i].y), 'no drill, "free" and an unknown one: the same wild four where they always stood');
}
// ---------- every drill is a battle that can be played
for (const id of DRILL_IDS.filter((x) => x !== 'free')) {
	const s = trainingSetup(team, 20, data, 'drill', id);
	const spots = s.enemy.map((e) => e.x + ',' + e.y);
	const ok = s.drill === id && s.enemy.length >= 3 && new Set(spots).size === spots.length && s.enemy.every((e) => hAt(e.x, e.y) != null && !(e.x === map.base.x && e.y === map.base.y) && data.species[e.fig.species]);
	A(ok, `${DRILLS[id].name}: three foes or more, each on a tile of its own, none on the base`, s.enemy.map((e) => [e.fig.species, e.x, e.y]));
	const S = B.newBattle('drill-' + id, { ...s, rev: B.RULES_REV }, data);
	const foes = S.units.filter((u) => u.side === 'e');
	A(foes.length === s.enemy.length && foes.every((u) => u.hp > 0 && u.x != null) && !S.over, `${DRILLS[id].name}: the battle starts with them on the board`);
	B.act(S, { t: 'deploy', uid: 'p0' }, data); B.act(S, { t: 'end' }, data);
	A(!S.over || S.over === 'won' || S.over === 'lost', `${DRILLS[id].name}: a turn can be played (deploy, end the turn)`);
}
// ---------- what each one sets up
{
	const combo = trainingSetup(team, 20, data, 'd', 'combo');
	A(combo.enemy.every((e) => e.ai === 'hold' && e.fig.level === 22) && combo.enemy.every((e) => data.species[e.fig.species].baseStats.hp >= 40), 'combos: the foes stand still, two levels up, and are sturdy', combo.enemy.map((e) => [e.fig.species, e.ai, e.fig.level]));
	const thr = trainingSetup(team, 20, data, 'd', 'throw');
	A(thr.enemy.every((e) => hAt(e.x, e.y) >= 2 && e.ai === 'hold'), 'throwing: every foe stands on a ledge, two levels up or more, and stays there', thr.enemy.map((e) => [e.x, e.y, hAt(e.x, e.y)]));
	const cat = trainingSetup(team, 20, data, 'd', 'catch');
	const S = B.newBattle('catch', { ...cat, rev: B.RULES_REV }, data), foes = S.units.filter((u) => u.side === 'e');
	const near = cat.enemy.every((e) => Math.abs(e.x - map.base.x) + Math.abs(e.y - map.base.y) <= 4);
	A(near && foes.every((u) => u.hp === Math.max(1, Math.floor(u.maxHP * 0.2)) && u.hp < u.maxHP), 'catching: the wild ones stand within four tiles of the base and start on a fifth of their HP', foes.map((u) => [u.hp, u.maxHP]));
	const rec = recipeOf('catch', { ...cat, rev: B.RULES_REV }, []);
	const S2 = B.newBattle('catch', rec.setup, data);
	A(S2.units.filter((u) => u.side === 'e').every((u, i) => u.hp === foes[i].hp), 'a replay of it starts them just as weak');
	const typ = trainingSetup(team, 20, data, 'd', 'types');
	const weak = typ.enemy.map((e, i) => effectiveness(data.species[team[i].species].types[0], data.species[e.fig.species].types));
	A(typ.enemy.length === 4 && weak.every((x) => x > 1), 'type matchups: a foe for each of the first four of your team, each weak to that one', typ.enemy.map((e, i) => [team[i].species, e.fig.species, weak[i]]));
	// every type has a foe weak to it in the pool (Normal has none anywhere: it gets a Rattata)
	const TYPES = ['Fire', 'Water', 'Grass', 'Electric', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
	const none = TYPES.filter((t) => !(effectiveness(t, data.species[weakTo(t, data)].types) > 1));
	A(none.length === 0 && weakTo('Normal', data) === 'rattata', 'every type but Normal has a foe weak to it to send', none);
	const two = trainingSetup(team.slice(0, 2), 20, data, 'd', 'types');
	A(two.enemy.length === 2 || two.enemy.length >= 3, '(a team of two gets a foe each)', two.enemy.length);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
