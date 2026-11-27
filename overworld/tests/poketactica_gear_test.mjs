// poketactica_gear_test.mjs — stage 1 of the Item World (owner, 2026-11-24; Plans/POKETACTICA_ITEM_WORLD_PLAN.md):
// a held item's LEVEL (1 to 100; its bonus grows up to threefold), its SLOTS (4, 8 at level 100) and the PLUSH
// GEMSTONES in them (+0.5% of a stat a level; combined to level up).
//   - gear.js: the numbers, the gemstones, an item's payload at a level
//   - the engine reads them (a figurine with no gear plays as before); a recipe's figurines keep them
//   - figcol.js: an item's state in the bag and on a figurine, gemstones in and out of slots, combining, two devices joined
// Pure: node only.   node overworld/tests/poketactica_gear_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip, battleStats } from '../../poketactica/js/figurine.js';
import { HELD, KIT, kindOf, goodName, heldOf } from '../../poketactica/js/goods.js';
import { ITEM_MAX_LEVEL, GEM_MAX_LEVEL, SLOTS_START, SLOTS_MAX, GEM_STATS, GEMS, GEM_PCT, LEVEL_PLAIN, kOf, slotsAt, gemStr, parseGem, gemName, gemSay, combineGems, cleanGear, gearOf, gemMults, heldAt, heldOfFig, heldTextAt } from '../../poketactica/js/gear.js';
import { cleanFig, cleanFigs, merge3Figs, newFigs, addFig, addGood, takeGood, goodsCount, itemGear, setItemGear, takeItem, addItem, holdItem, unholdItem, gemList, addGem, gearView, socketGem, unsocketGem, combineLoose, levelItem, sameFigs } from '../../poketactica/js/figcol.js';
import { slimFig, recipeOf, replayTo } from '../../poketactica/js/replay.js';
import { damageMods } from '../rules/modifiers.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const flat = (w = 8, h = 8, base = { x: 1, y: h - 2 }) => ({ w, h, height: Array(w * h).fill(0), base });
const fig = (sp, lv, moves, opt = {}) => {
	let f = makeFigurine(sp, lv, makeRng(opt.seed || sp + lv), data, { shinyRate: 0 });
	f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] };
	f = equip(f, moves);
	return { ...f, ...(opt.held ? { held: opt.held } : {}), ...(opt.gear ? { gear: opt.gear } : {}) };
};
const battle = (player, foes, { seed = 'g', map = flat() } = {}) => B.newBattle(seed, { map, player, enemy: foes.map(([f, x, y, ai]) => ({ fig: f, x, y, ai: ai || 'hold' })) }, data);
const go = (S, a) => B.act(S, a, data);
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ---------- the numbers
{
	A(ITEM_MAX_LEVEL === 100 && GEM_MAX_LEVEL === 100 && SLOTS_START === 4 && SLOTS_MAX === 8, 'an item levels to 100; 4 slots to start, 8 at most');
	A(kOf(1) === 1 && kOf(100) === 3 && near(kOf(50.5), kOf(50)) && kOf(0) === 1 && kOf(999) === 3 && kOf(50) > 1.98 && kOf(50) < 2, 'a level multiplies the bonus: 1 at level 1, 3 at level 100');
	A([1, 24, 25, 49, 50, 74, 75, 99, 100].map(slotsAt).join() === '4,4,5,5,6,6,7,7,8', 'a slot more at levels 25, 50, 75 and 100');
	A(GEM_STATS.join() === 'hp,atk,def,spa,spd,spe' && GEM_STATS.every((s) => GEMS[s] && /^Plush /.test(GEMS[s].name) && GEMS[s].stat) && new Set(GEM_STATS.map((s) => GEMS[s].name)).size === 6, 'six plush gemstones, one a stat, each with its own name');
	A(gemStr('atk', 12) === 'atk:12' && gemStr('atk', 999) === 'atk:100' && parseGem('atk:12').lv === 12 && parseGem('xyz:3') === null && parseGem('atk:0') === null && parseGem('atk:101') === null && parseGem(5) === null, 'a gemstone is a stat and a level 1 to 100');
	A(gemName('spe:40') === 'Plush Topaz Lv 40' && gemSay('spe:40') === '+20% Speed' && gemSay('atk:1') === '+0.5% Attack' && gemSay('hp:100') === '+50% HP' && GEM_PCT === 0.5, 'it gives half a percent of its stat a level: +50% at level 100');
	A(combineGems('atk:12', 'atk:30') === 'atk:42' && combineGems('atk:70', 'atk:70') === 'atk:100' && combineGems('atk:12', 'def:12') === null && combineGems('atk:12', 'junk') === null, 'two of one stat combine into one: their levels added, 100 at most');
	A(cleanGear({ lv: 1, gems: [] }) === null && cleanGear(null) === null && JSON.stringify(cleanGear({ lv: 30, gems: ['atk:5', 'bad', 'hp:2'] })) === '{"lv":30,"gems":["atk:5","hp:2"]}', 'an item\'s state: nothing to say at level 1 with no gemstones; junk is dropped');
	A(cleanGear({ lv: 1, gems: ['atk:1', 'atk:2', 'atk:3', 'atk:4', 'atk:5'] }).gems.length === 4 && cleanGear({ lv: 100, gems: Array(12).fill('hp:1') }).gems.length === 8 && cleanGear({ lv: 500, gems: [] }).lv === 100, 'no more gemstones than slots; no level over 100');
	const m = gemMults({ lv: 100, gems: Array(8).fill('atk:100') });
	A(m.atk === 5 && m.hp === 1 && near(gemMults({ gems: ['atk:10', 'atk:30', 'spe:2'] }).atk, 1.2) && near(gemMults({ gems: ['spe:2'] }).spe, 1.01), 'gemstones of one stat add up: eight at level 100 are +400%');
}

// ---------- an item's payload at a level
{
	A(Object.keys(HELD).every((id) => heldAt(id, 1) === HELD[id].held && heldAt(id, 0) === HELD[id].held), 'at level 1 an item is exactly what it was');
	A(heldAt('nope', 50) === null && heldAt(null, 50) === null, 'no item: nothing');
	const L = (id) => heldAt(id, 100);
	A(near(L('leftovers').endHealFrac, 3 / 16) && L('oranberry').berryHeal === 30 && near(L('sitrusberry').berryHealFrac, 0.75) && L('leppaberry').ppRestore === 30, 'level 100: Leftover Clay 3/16, Oran Bead 30 HP, Sitrus Bead 3/4, Leppa Bead 30 PP');
	A(near(L('brightpowder').evade, 0.7) && near(L('widelens').accBoost, 1.3) && near(L('luckyegg').expBoost, 2.5), 'Bright Glitter 30% harder to hit, Wide Loupe +30%, Lucky Capsule x2.5 EXP');
	A(L('charcoal').k === 3 && L('charcoal').typeBoost === 'Fire' && L('charcoal').lv === 100 && heldAt('charcoal', 50).k === kOf(50) && L('charcoal') === L('charcoal'), 'the bonuses the engine multiplies read the level\'s k');
	A(heldAt('sitrusberry', 100).berryHealFrac <= 1 && Object.keys(HELD).every((id) => { const a = heldAt(id, 100); return Object.keys(HELD[id].held).every((k) => k in a); }), 'nothing an item does is lost by levelling; a bead never heals more than everything');
	A(LEVEL_PLAIN.length === 0, 'no item is left whose level changes no number (battle rules 13 gave the ten plain ones theirs: poketactica_plain_items_test)', LEVEL_PLAIN);
	// the shared damage rules: no k is the overworld's item, bit for bit
	const mods = (uItem, extra = {}) => damageMods({ moveId: 'ember', type: 'Fire', category: 'Special', priority: 0, Pw: 40, phys: false, fx: {}, eff: 1, spread: false, uItem, user: { ab: null, types: ['Fire'], status: null, curHP: 100, maxHP: 100 }, target: { ab: null, curHP: 100, maxHP: 100 }, ...extra });
	let ok = true, why = '';
	try { const base = mods(null), plain = mods({ typeBoost: 'Fire' }), top = mods({ typeBoost: 'Fire', k: 3 }), r = (x) => x.mult / base.mult; ok = near(r(plain), 1.2, 1e-12) && near(r(top), 1.6, 1e-12); why = [r(plain), r(top)]; } catch (e) { ok = false; why = String(e); }
	A(ok, 'the shared damage rules: a type booster is x1.2 with no level, x1.6 at level 100', why);
	A(1 + 0.2 * 1 === 1.2 && 1 + 0.5 * 1 === 1.5 && 1 + 0.3 * 1 === 1.3 && 1 + 0.1 * 1 === 1.1, 'and with no level the multipliers are the very same numbers as before');
}

// ---------- the engine reads them
{
	const plain = fig('charizard', 80, ['flamethrower'], { held: 'charcoal' }), hot = { ...plain, gear: { lv: 100, gems: [] } };
	const dmg = (f) => { const S = battle([f], [[fig('snorlax', 60, ['tackle']), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' }); return B.forecast(S, S.units[0], 'flamethrower', 1, 5, data).targets[0].max; };
	const none = dmg(fig('charizard', 80, ['flamethrower'])), d1 = dmg(plain), d100 = dmg(hot);
	A(Math.abs(d1 / none - 1.2) < 0.04 && Math.abs(d100 / none - 1.6) < 0.04, 'in battle: a Charcoal Stick is x1.2 at level 1 and x1.6 at level 100', [none, d1, d100]);
	const u1 = B.makeUnit(plain, 'a', 'p', 0, 0, null, data), u100 = B.makeUnit(hot, 'b', 'p', 0, 0, null, data);
	A(u1.held === HELD.charcoal.held && u100.held.k === 3 && u100.heldId === 'charcoal', 'a unit holds its item at its level');
	// gemstones: the figurine's own stats
	const base = battleStats(plain, data), gem = battleStats({ ...plain, gear: { lv: 1, gems: ['atk:100', 'hp:20', 'spe:40', 'spe:40'] } }, data);
	A(gem.atk === Math.floor(base.atk * 1.5) && gem.maxHP === Math.floor(base.maxHP * 1.1) && gem.hp === gem.maxHP && gem.spe === Math.floor(base.spe * 1.4) && gem.def === base.def && gem.spa === base.spa, 'gemstones raise the stats they name: +50% Attack, +10% HP, +40% Speed', [base, gem]);
	A(JSON.stringify(battleStats({ ...plain, gear: { lv: 100, gems: [] } }, data)) === JSON.stringify(base), 'a level alone changes no stat');
	const noItem = fig('charizard', 80, ['flamethrower'], { gear: { lv: 1, gems: ['atk:100'] } });
	A(battleStats(noItem, data).atk === base.atk && gearOf(noItem) === null, 'gemstones with no held item are nothing: they live in an item');
	const ug = B.makeUnit({ ...plain, gear: { lv: 1, gems: ['atk:100', 'hp:100'] } }, 'c', 'p', 0, 0, null, data);
	A(ug.stats.atk === Math.floor(base.atk * 1.5) && ug.maxHP === Math.floor(base.maxHP * 1.5) && ug.hp === ug.maxHP, 'a unit on the board has them');
	// the items the engine multiplies itself
	const scarf = (lv) => B.makeUnit({ ...fig('pikachu', 30, ['quickattack'], { held: 'choicescarf' }), gear: { lv, gems: [] } }, 's', 'p', 0, 0, null, data);
	const bare = B.makeUnit(fig('pikachu', 30, ['quickattack']), 's', 'p', 0, 0, null, data);
	A(scarf(1).stats.spe === Math.floor(bare.stats.spe * 1.5) && scarf(100).stats.spe === Math.floor(bare.stats.spe * 2.5) && scarf(100).move === bare.move + 1, 'Choice Bandana: Speed x1.5, x2.5 at level 100 (one more Move either way)');
	const vest = (lv) => B.makeUnit({ ...fig('machamp', 30, ['karatechop'], { held: 'assaultvest' }), gear: { lv, gems: [] } }, 'v', 'p', 0, 0, null, data).stats.spd;
	A(vest(100) > vest(1) && vest(1) === Math.floor(B.makeUnit(fig('machamp', 30, ['karatechop']), 'v', 'p', 0, 0, null, data).stats.spd * 1.5), 'Assault Padding: Sp. Def x1.5, more at level 100');
	// Leftover Clay at the end of a phase
	const heal = (gear) => { const S = battle([fig('machamp', 50, ['karatechop'], { held: 'leftovers', gear })], [[fig('snorlax', 60, ['tackle']), 1, 0]]); go(S, { t: 'deploy', uid: 'p0' }); const u = S.units[0]; u.hp = 1; go(S, { t: 'end' }); return [u.hp - 1, u.maxHP]; };
	const [h1, mx] = heal(null), [h100] = heal({ lv: 100, gems: [] });
	A(h1 === Math.floor(mx / 16) && h100 === Math.floor(mx * 3 / 16), 'Leftover Clay: 1/16 at the end of its phase, 3/16 at level 100', [h1, h100, mx]);
	// a recipe keeps the gear, and replays to the same battle
	const g = { ...plain, gear: { lv: 77, gems: ['spa:30'] } };
	A(JSON.stringify(slimFig(g).gear) === '{"lv":77,"gems":["spa:30"]}' && !('gear' in slimFig(plain)) && !('gear' in slimFig({ ...plain, gear: { lv: 1, gems: [] } })), 'a recipe\'s figurine keeps its item\'s level and gemstones (and says nothing for a plain item)');
	const S = battle([g], [[fig('snorlax', 60, ['tackle']), 1, 5]], { seed: 'gear-replay' });
	const acts = [{ t: 'deploy', uid: 'p0' }, { t: 'attack', uid: 'p0', move: 'flamethrower', x: 1, y: 5 }, { t: 'execute' }];
	for (const a of acts) go(S, a);
	const rec = recipeOf('gear-replay', { map: flat(), player: [g], enemy: [{ fig: fig('snorlax', 60, ['tackle']), x: 1, y: 5, ai: 'hold' }] }, acts, { label: 't', won: false });
	const R = replayTo(rec, acts.length, data);
	A(rec.setup.player[0].gear.lv === 77 && R.units[1].hp === S.units[1].hp && R.units[0].stats.spa === S.units[0].stats.spa && S.units[0].held.lv === 77, 'and replays to the very same blow', [R.units[1].hp, S.units[1].hp]);
}

// ---------- the collection: an item's state in the bag and on a figurine
{
	A(kindOf('stitchingkit') === 'kit' && goodName('stitchingkit') === 'Stitching Kit' && KIT.stitchingkit.text && heldOf('stitchingkit') === null, 'the Stitching Kit is a good of its own kind');
	let c = addFig(newFigs(), { ...fig('charmander', 16, ['ember']), id: 'char-a' });
	c = addGood(addGood(addGood(c, 'charcoal', 'aaaa'), 'charcoal', 'bbbb'), 'leftovers', 'cccc');
	A(itemGear(c, 'charcoal-aaaa') === null && gearView(c, { uid: 'charcoal-aaaa' }).slots === 4 && gearView(c, { uid: 'nope-0000' }) === null && gearView(c, { fig: 'char-a' }) === null, 'a new item: level 1, four empty slots');
	c = levelItem(c, 'charcoal-aaaa', 30);
	A(itemGear(c, 'charcoal-aaaa').lv === 31 && gearView(c, { uid: 'charcoal-aaaa' }).slots === 5 && itemGear(c, 'charcoal-bbbb') === null, 'the Item World banks levels on THAT item; its twin stays level 1');
	A(levelItem(c, 'charcoal-aaaa', 500).gear['charcoal-aaaa'].lv === 100 && levelItem(c, 'nope-0000', 5) === c && levelItem(addGood(c, 'firestone', 'aaaa'), 'firestone-aaaa', 5).gear['firestone-aaaa'] === undefined, 'never past 100; only a held item levels (not an evolution item)');
	// gemstones in and out
	c = addGem(addGem(addGem(c, 'atk', 10, 'g1g1'), 'atk', 15, 'g2g2'), 'def', 3, 'g3g3');
	A(gemList(c).length === 3 && c.gems['gem-g1g1'] === 'atk:10' && addGem(c, 'xyz', 3, 'zzzz') === c && addGem(c, 'atk', 3, 'g1g1') === c, 'loose gemstones, each its own');
	let d = socketGem(c, { uid: 'charcoal-aaaa' }, 'gem-g1g1');
	A(d && !d.gems['gem-g1g1'] && JSON.stringify(itemGear(d, 'charcoal-aaaa').gems) === '["atk:10"]' && itemGear(d, 'charcoal-aaaa').lv === 31, 'a gemstone goes into a slot: out of the loose ones, into the item');
	A(socketGem(c, { uid: 'charcoal-aaaa' }, 'gem-nope') === null && socketGem(c, { uid: 'firestone-aaaa' }, 'gem-g1g1') === null, 'not a gemstone you have not; not into what is no held item');
	{ let f = c; for (const t of ['s1s1', 's2s2', 's3s3', 's4s4', 's5s5']) f = addGem(f, 'hp', 1, t); let n = 0; for (const t of ['s1s1', 's2s2', 's3s3', 's4s4']) { const r = socketGem(f, { uid: 'charcoal-bbbb' }, 'gem-' + t); if (r) { f = r; n++; } } A(n === 4 && socketGem(f, { uid: 'charcoal-bbbb' }, 'gem-s5s5') === null, 'a level 1 item takes four and no more'); }
	const back = unsocketGem(d, { uid: 'charcoal-aaaa' }, 0, 'backback');
	A(back && back.gems['gem-backback'] === 'atk:10' && itemGear(back, 'charcoal-aaaa').gems.length === 0 && unsocketGem(d, { uid: 'charcoal-aaaa' }, 3, 'x1x1') === null, 'and comes out again, loose');
	// held: the item's state goes onto the figurine, and comes back with it
	let e = holdItem(d, 'char-a', 'charcoal-aaaa', 'h1h1');
	A(e && e.figs['char-a'].held === 'charcoal' && e.figs['char-a'].gear.lv === 31 && e.figs['char-a'].gear.gems[0] === 'atk:10' && !e.items['charcoal-aaaa'] && !(e.gear || {})['charcoal-aaaa'], 'a figurine takes hold of THAT item: its level and gemstones go with it');
	A(gearView(e, { fig: 'char-a' }).lv === 31 && gearView(e, { fig: 'char-a' }).slots === 5, 'and the item is read where it is');
	const e2 = socketGem(e, { fig: 'char-a' }, 'gem-g3g3');
	A(e2 && e2.figs['char-a'].gear.gems.join() === 'atk:10,def:3' && battleStats(e2.figs['char-a'], data).atk > battleStats({ ...e2.figs['char-a'], gear: undefined }, data).atk, 'a gemstone can go into an item a figurine is holding; its stats rise');
	const sw = holdItem(e2, 'char-a', 'leftovers-cccc', 'swsw');
	A(sw && sw.figs['char-a'].held === 'leftovers' && !sw.figs['char-a'].gear && sw.items['charcoal-swsw'] === 'charcoal' && sw.gear['charcoal-swsw'].lv === 31 && sw.gear['charcoal-swsw'].gems.length === 2, 'swapped for another: the old item is back in the bag, level and gemstones kept; the new one is plain');
	const off = unholdItem(e2, 'char-a', 'offoff');
	A(off && !off.col.figs['char-a'].held && !off.col.figs['char-a'].gear && off.col.gear[off.uid].lv === 31 && off.uid === 'charcoal-offoff' && unholdItem(off.col, 'char-a', 'x') === null, 'taken off: back in the bag as it was');
	// the old way of taking a good never eats a levelled item while a plain one is there
	const t1 = takeGood(d, 'charcoal');
	A(t1.items['charcoal-aaaa'] && !t1.items['charcoal-bbbb'] && t1.gear['charcoal-aaaa'], 'taking "a Charcoal Stick" takes a plain one first');
	const t2 = takeGood(t1, 'charcoal');
	A(!t2.items || (!t2.items['charcoal-aaaa'] && !t2.gear), 'and the levelled one last, its state with it (no orphan left behind)', t2);
	const tk = takeItem(d, 'charcoal-aaaa'), ad = addItem(tk.col, tk.id, 'againagain', tk.gear);
	A(tk.gear.lv === 31 && !tk.col.items['charcoal-aaaa'] && ad.col.gear[ad.uid].lv === 31 && takeItem(d, 'nope') === null, 'an item taken by name keeps its state, and goes back with it');
	// combining
	A(combineLoose(c, 'gem-g1g1', 'gem-g2g2', 'cmb1') === null, 'combining needs a Stitching Kit');
	const k = addGood(c, 'stitchingkit', 'kit1');
	const cm = combineLoose(k, 'gem-g1g1', 'gem-g2g2', 'cmb1');
	A(cm && cm.gems['gem-cmb1'] === 'atk:25' && !cm.gems['gem-g1g1'] && !cm.gems['gem-g2g2'] && !goodsCount(cm).stitchingkit && gemList(cm).length === 2, 'two Plush Rubies (10 and 15) become one of level 25; the kit is used up');
	A(combineLoose(k, 'gem-g1g1', 'gem-g3g3', 'cmb2') === null && combineLoose(k, 'gem-g1g1', 'gem-g1g1', 'cmb3') === null && goodsCount(k).stitchingkit === 1, 'not two of different stats, not one with itself: the kit is kept');
	// cleaning (the server's copy) and joining two devices
	const dirty = { ...e2, gear: { ...(e2.gear || {}), 'charcoal-bbbb': { lv: 700, gems: ['atk:5', 'zzz'] }, 'nothere-0000': { lv: 9, gems: [] }, 'firestone-aaaa': { lv: 9, gems: [] } }, gems: { ...e2.gems, 'bad uid': 'atk:1', 'gem-okok': 'atk:999', 'gem-fine': 'spe:7' }, items: { ...e2.items, 'firestone-aaaa': 'firestone' } };
	const cl = cleanFigs(dirty);
	A(cl.gear['charcoal-bbbb'].lv === 100 && cl.gear['charcoal-bbbb'].gems.join() === 'atk:5' && !cl.gear['nothere-0000'] && !cl.gear['firestone-aaaa'] && !cl.gems['bad uid'] && !cl.gems['gem-okok'] && cl.gems['gem-fine'] === 'spe:7', 'cleaned: levels capped, junk gemstones dropped, a state only for a held item that is there');
	A(cl.figs['char-a'].gear.lv === 31 && cleanFig({ ...cl.figs['char-a'], held: undefined }).gear === undefined && cleanFig({ ...cl.figs['char-a'], gear: { lv: 1, gems: [] } }).gear === undefined, 'a figurine keeps its item\'s state only while it holds an item');
	A(sameFigs(cl, cleanFigs(cl)) && !sameFigs(cl, levelItem(cl, 'charcoal-bbbb', 0) === cl ? socketGem(cl, { uid: 'charcoal-bbbb' }, 'gem-fine') : cl), 'a change to an item\'s state or a gemstone is a change to the collection');
	// two devices: one levelled the item, the other did nothing
	const baseC = cleanFigs(d), mine = levelItem(baseC, 'charcoal-aaaa', 10), theirs = baseC;
	const j1 = merge3Figs(baseC, mine, theirs), j2 = merge3Figs(baseC, theirs, mine);
	A(j1.gear['charcoal-aaaa'].lv === 41 && j2.gear['charcoal-aaaa'].lv === 41, 'joined: the higher level wins, whichever side it is on');
	// one set a gemstone, the other did nothing: the gemstone is in the item and not loose
	const set = socketGem(baseC, { uid: 'charcoal-bbbb' }, 'gem-g2g2'), j3 = merge3Figs(baseC, set, baseC), j4 = merge3Figs(baseC, baseC, set);
	A(j3.gear['charcoal-bbbb'].gems.join() === 'atk:15' && !j3.gems['gem-g2g2'] && j4.gear['charcoal-bbbb'].gems.join() === 'atk:15' && !j4.gems['gem-g2g2'], 'joined: a gemstone set in a slot on one device is in the item, not loose again (never doubled)');
	// a figurine holding a levelled item, joined with an older copy of itself
	const heldC = cleanFigs(e), grown = { ...heldC, figs: { 'char-a': { ...heldC.figs['char-a'], gear: { lv: 60, gems: ['atk:10'] } } } };
	A(merge3Figs(heldC, grown, heldC).figs['char-a'].gear.lv === 60 && merge3Figs(heldC, heldC, grown).figs['char-a'].gear.lv === 60, 'joined: a held item\'s higher level wins');
	const offC = { ...heldC, figs: { 'char-a': (() => { const f = { ...heldC.figs['char-a'] }; delete f.held; delete f.gear; return f; })() } };
	A(!merge3Figs(heldC, offC, heldC).figs['char-a'].gear && !merge3Figs(heldC, offC, heldC).figs['char-a'].held, 'joined: an item taken off stays off, its state with it');
}

// ---------- an item's text at its level says the numbers the engine uses (improvement plan, item 3)
{
	A(Object.keys(HELD).every((id) => heldTextAt(id, 1) === HELD[id].text), 'level 1: every item\'s text is its own');
	A(heldTextAt('charcoal', 100) === 'Fire moves deal 1.6× damage.' && heldTextAt('charcoal', 34) === 'Fire moves deal ' + +(1 + 0.2 * kOf(34)).toFixed(2) + '× damage.', 'a type booster: 1.2× at level 1, 1.6× at level 100', [heldTextAt('charcoal', 100), heldTextAt('charcoal', 34)]);
	A(/18\.8% of its HP/.test(heldTextAt('leftovers', 100)) && /heals 30 HP/.test(heldTextAt('oranberry', 100)) && /2\.5× as hard/.test(heldTextAt('choiceband', 100)) && /30% chance/.test(heldTextAt('focusband', 100)) && /by 4 stages/.test(heldTextAt('weaknesspolicy', 100)) && /2\.5× EXP/.test(heldTextAt('luckyegg', 100)), 'the others, at level 100: Leftover Clay 18.8%, Oran Bead 30 HP, Choice Ribbon 2.5×, Focus Knot 30%, Weakness Warranty +4, Lucky Capsule 2.5×',
		['leftovers', 'oranberry', 'choiceband', 'focusband', 'weaknesspolicy', 'luckyegg'].map((id) => heldTextAt(id, 100)));
	// the text against the engine: the multiplier printed at a level is the one the shared damage rules use
	const mods2 = (uItem) => damageMods({ moveId: 'ember', type: 'Fire', category: 'Special', priority: 0, Pw: 40, phys: false, fx: {}, eff: 1, spread: false, uItem, user: { ab: null, types: ['Fire'], status: null, curHP: 100, maxHP: 100 }, target: { ab: null, curHP: 100, maxHP: 100 } });
	const said = (lv) => +/deal ([0-9.]+)× damage/.exec(heldTextAt('charcoal', lv))[1], real = (lv) => mods2(heldAt('charcoal', lv)).mult / mods2(null).mult;
	A([1, 2, 34, 50, 77, 100].every((lv) => Math.abs(said(lv) - real(lv)) < 0.006), 'and the engine agrees at levels 1, 2, 34, 50, 77 and 100', [1, 2, 34, 50, 77, 100].map((lv) => [said(lv), real(lv)]));
	A(Object.keys(HELD).filter((id) => !LEVEL_PLAIN.includes(id)).every((id) => heldTextAt(id, 100) !== HELD[id].text), 'every other item\'s text changes with its level', Object.keys(HELD).filter((id) => !LEVEL_PLAIN.includes(id) && heldTextAt(id, 100) === HELD[id].text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
