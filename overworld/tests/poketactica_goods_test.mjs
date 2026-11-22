// poketactica_goods_test.mjs — the owner's batch of 2026-11-21: EVOLUTION, HELD ITEMS, the camp SHOP's goods, SMARTER
// ENEMIES (and Heal Pulse / Floral Healing, which healed no one).
//   - goods.js: every held item's payload is the overworld's own (overworld/bag.js), every evolution item a species needs is sold
//   - evolve.js: real evolution levels, friendship from FRIEND_LEVEL, items; what the figurine keeps
//   - figcol.js: held / evo / goods survive cleaning and the two-device join (a used good stays gone; the evolved copy wins)
//   - engine: each held item OFF, then ON (and the forecast agrees); replays keep the items
//   - ai.js: KOs first, heals a hurt ally, a healer keeps out of reach, keeps its own side out of its blasts, obeys Choice
//     locks, and an enemy phase stays quick
// Pure: node only.   node overworld/tests/poketactica_goods_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip, battleStats } from '../../poketactica/js/figurine.js';
import { HELD, EVO, CANDY, kindOf, goodName, heldOf } from '../../poketactica/js/goods.js';
import { evolutionsOf, evoOptions, evolve, FRIEND_LEVEL, evolvesByLevelNow } from '../../poketactica/js/evolve.js';
import { cleanFig, cleanFigs, merge3Figs, addGood, takeGood, goodsCount, haveGood, newFigs, addFig } from '../../poketactica/js/figcol.js';
import { recipeOf } from '../../poketactica/js/replay.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const flat = (w = 8, h = 8, base = { x: 1, y: h - 2 }) => ({ w, h, height: Array(w * h).fill(0), base });
const fig = (sp, lv, moves, opt = {}) => {
	let f = makeFigurine(sp, lv, makeRng(opt.seed || sp + lv), data, { shinyRate: 0 });
	f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] };
	f = equip(f, moves);
	return opt.held ? { ...f, held: opt.held } : f;
};
const battle = (player, foes, { seed = 'g', map = flat() } = {}) => B.newBattle(seed, { map, player, enemy: foes.map(([f, x, y, ai]) => ({ fig: f, x, y, ai: ai || 'hold' })) }, data);
const go = (S, a) => B.act(S, a, data);
const evs = (S, t) => S.log.filter((e) => e.t === t);

// ---------- goods.js against the overworld
{
	const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
	const bad = [];
	for (const [id, h] of Object.entries(HELD)) {
		const m = bag.match(new RegExp('^\\s*' + id + ':\\s*\\{[^\\n]*?held:\\s*(\\{[^}]*\\})', 'm'));
		if (!m) { bad.push(id + ' (not in bag.js)'); continue; }
		const theirs = Function('return ' + m[1])();
		if (JSON.stringify(theirs) !== JSON.stringify(h.held)) bad.push(id + ' ' + m[1] + ' vs ' + JSON.stringify(h.held));
	}
	A(!bad.length, `every held item (${Object.keys(HELD).length}) carries the overworld's own payload (bag.js)`, bad.join(' | '));
	const need = new Set();
	for (const ex of Object.values(data.extra)) for (const e of (ex && ex.evos) || []) if (e.type === 'item' && data.species[e.target]) need.add(e.param);
	const missing = [...need].filter((id) => !EVO[id] && !HELD[id]);
	A(!missing.length, `every evolution item a species needs is a good (${need.size})`, missing.join(', '));
	A(Object.values({ ...HELD, ...EVO, ...CANDY }).every((g) => g.stars > 0 && g.name), 'every good has a name and a star price');
	A(kindOf('leftovers') === 'held' && kindOf('firestone') === 'evo' && kindOf('rarecandy') === 'candy' && kindOf('pokeball') === null, 'kindOf tells the kinds apart');
	A(goodName('linkingcord') === 'Linking Cord' && heldOf('lifeorb').lifeOrb === true && heldOf('nope') === null, 'names and payloads are looked up');
}

// ---------- evolution
{
	const ch15 = fig('charmander', 15, ['ember']), ch16 = { ...fig('charmander', 16, ['ember', 'scratch']), held: 'charcoal' };
	A(!evoOptions(ch15, data).some((o) => o.ready), 'Charmander Lv 15: not yet (it evolves at 16, its real level)');
	A(evoOptions(ch16, data).some((o) => o.ready && o.target === 'charmeleon' && o.how === 'level'), 'Charmander Lv 16: Charmeleon is ready');
	A(evolvesByLevelNow(ch16, data) && !evolvesByLevelNow(ch15, data), 'the results / squad flag (evolvesByLevelNow)');
	const e = evolve(ch16, 'charmeleon', data);
	A(e.species === 'charmeleon' && e.id === ch16.id && e.level === 16 && e.exp === ch16.exp && e.held === 'charcoal' && e.evo === 1, 'evolving keeps the id, level, EXP and held item; counts the evolution', e);
	A(JSON.stringify(e.equipped) === JSON.stringify(ch16.equipped) && ch16.pool.every((p) => e.pool.some((q) => q.id === p.id && q.lv === p.lv)), 'its equipped moves and the whole pool (with move levels) stay');
	const passed = data.species.charmeleon.learnset.filter(([l]) => l <= 16).map(([, id]) => id);
	A(passed.every((id) => e.pool.some((p) => p.id === id)), "the new species' moves it has already passed join the pool");
	const oldAbs = data.abilities.charmander, newAbs = data.abilities.charmeleon;
	A(e.ability === (newAbs[Math.max(0, oldAbs.indexOf(ch16.ability))] || newAbs[0]), 'the ability takes the same slot in the new species', [ch16.ability, e.ability]);
	let threw = false; try { evolve(ch16, 'blastoise', data); } catch { threw = true; }
	A(threw, 'a target that is not one of its evolutions is refused');
	const eevee = fig('eevee', 10, ['tackle']), ev20 = fig('eevee', FRIEND_LEVEL, ['tackle']);
	const opts = evoOptions(eevee, data, (id) => (id === 'firestone' ? 1 : 0));
	A(opts.find((o) => o.target === 'flareon').ready && !opts.find((o) => o.target === 'vaporeon').ready, 'Eevee: a Fire Stone opens Flareon, not Vaporeon');
	A(!opts.find((o) => o.target === 'espeon').ready && evoOptions(ev20, data).find((o) => o.target === 'espeon').ready && evoOptions(ev20, data).find((o) => o.target === 'umbreon').ready,
		`friendship evolutions open at Lv ${FRIEND_LEVEL} (Espeon and Umbreon both: the player picks)`);
	A(evolutionsOf('kadabra', data).some((o) => o.item === 'linkingcord' && o.target === 'alakazam'), 'Kadabra evolves with a Linking Cord (the trade evolutions)');
	A(evolutionsOf('tyrogue', data).length === 3, 'Tyrogue offers all three of its evolutions');
	A(evolutionsOf('charizard', data).length === 0, 'a final stage has none');
}

// ---------- the collection: held, evo, goods
{
	const f = { ...fig('charmander', 16, ['ember']), held: 'charcoal', evo: 1 };
	const c = cleanFig(f);
	A(c.held === 'charcoal' && c.evo === 1, 'cleanFig keeps the held item and the evolution count');
	A(!('held' in cleanFig({ ...f, held: 'masterball' })) && !('held' in cleanFig({ ...f, held: 'firestone' })), 'only a real held item can be held');
	let col = addFig(newFigs(), f);
	col = addGood(addGood(addGood(col, 'leftovers', 'aaaa1'), 'leftovers', 'bbbb2'), 'firestone', 'cccc3');
	A(goodsCount(col).leftovers === 2 && haveGood(col, 'firestone') === 1, 'goods are counted', goodsCount(col));
	A(JSON.stringify(cleanFigs(col).items) === JSON.stringify(col.items), 'cleanFigs keeps the goods');
	A(Object.keys(cleanFigs({ ...col, items: { 'x-1234': 'leftovers', 'nope-1234': 'nope', 'leftovers-zz': 'leftovers' } }).items || {}).length === 0, 'bad goods are dropped');
	const used = takeGood(col, 'firestone');
	A(used && !haveGood(used, 'firestone') && takeGood(used, 'firestone') === null, 'a good is used up, and nothing is used when there is none');
	// two devices: one used the stone, the other bought a berry
	const base = col, mine = used, theirs = addGood(col, 'sitrusberry', 'dddd4');
	const m = merge3Figs(base, mine, theirs);
	A(!Object.values(m.items).includes('firestone') && Object.values(m.items).includes('sitrusberry') && goodsCount(m).leftovers === 2, 'joined: the used stone stays gone, the new berry stays', goodsCount(m));
	// one device evolved the figurine, the other levelled it
	const evolved = evolve(f, 'charmeleon', data), grown = { ...f, exp: f.exp + 50 };
	const j = merge3Figs(addFig(newFigs(), f), addFig(newFigs(), evolved), addFig(newFigs(), grown)).figs[f.id];
	A(j.species === 'charmeleon' && j.exp === grown.exp, 'joined: the evolved copy wins, and keeps the other side\'s EXP', j);
	const off = { ...f }; delete off.held;
	const k = merge3Figs(addFig(newFigs(), f), addFig(newFigs(), off), addFig(newFigs(), f)).figs[f.id];
	A(!k.held, 'joined: the side that took the item off wins');
}

// ---------- the engine: each held item off, then on
const fcast = (held, atk = ['machamp', 50, ['karatechop']], foe = ['snorlax', 60, ['tackle']], aim = [1, 5]) => {
	const S = battle([fig(atk[0], atk[1], atk[2], { held })], [[fig(...foe), aim[0], aim[1]]]);
	go(S, { t: 'deploy', uid: 'p0' });
	return { S, f: B.forecast(S, S.units[0], atk[2][0], aim[0], aim[1], data).targets[0] };
};
{
	const off = fcast(null).f, on = fcast('blackbelt').f;
	A(Math.abs(on.max / off.max - 1.2) < 0.03, 'Black Belt: Fighting moves x1.2 in the forecast', [off.max, on.max]);
	const band = fcast('choiceband').f, orb = fcast('lifeorb').f, belt = fcast('muscleband').f;
	A(Math.abs(band.max / off.max - 1.5) < 0.03 && Math.abs(orb.max / off.max - 1.3) < 0.03 && Math.abs(belt.max / off.max - 1.1) < 0.03, 'Choice Band x1.5, Life Orb x1.3, Muscle Band x1.1', [off.max, band.max, orb.max, belt.max]);
	const lens0 = fcast(null, ['machamp', 50, ['dynamicpunch']]).f, lens = fcast('widelens', ['machamp', 50, ['dynamicpunch']]).f;
	A(lens.hit > lens0.hit, 'Wide Lens: a higher hit chance', [lens0.hit, lens.hit]);
	const S = battle([fig('machamp', 50, ['dynamicpunch'])], [[fig('snorlax', 60, ['tackle'], { held: 'brightpowder' }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
	A(B.forecast(S, S.units[0], 'dynamicpunch', 1, 5, data).targets[0].hit < lens0.hit, 'BrightPowder: a lower hit chance against it');
}
// Choice lock / Assault Vest
{
	for (const held of [null, 'choiceband']) {
		const S = battle([fig('machamp', 50, ['karatechop', 'tackle'], { held })], [[fig('snorlax', 70, ['growl']), 1, 5]]);
		go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'end' });
		const r = go(S, { t: 'attack', uid: 'p0', move: 'tackle', x: 1, y: 5 });
		A(held ? !r.ok && /locked/.test(r.why) : r.ok, held ? 'Choice Band: locked into the first move it used' : 'no Choice item: any move next turn', r.why);
		if (held) A(go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }).ok, 'Choice Band: the locked move still works');
	}
	const S = battle([fig('machamp', 50, ['leer', 'karatechop'], { held: 'assaultvest' })], [[fig('snorlax', 60, ['tackle']), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
	const r = go(S, { t: 'attack', uid: 'p0', move: 'leer', x: 1, y: 6 });
	A(!r.ok && /Assault Vest/.test(r.why), 'Assault Vest: no status moves', r.why);
	const plain = battleStats(fig('machamp', 50, ['leer']), data);
	A(S.units[0].stats.spd === Math.floor(plain.spd * 1.5), 'Assault Vest: Sp. Def x1.5');
	const sc = battle([fig('machamp', 50, ['karatechop'], { held: 'choicescarf' })], []).units[0];
	A(sc.move === plain.move + 1 && sc.stats.spe === Math.floor(plain.spe * 1.5), 'Choice Scarf: +1 Move and Speed x1.5');
	const evi = battle([fig('charmander', 20, ['ember'], { held: 'eviolite' }), fig('charizard', 20, ['ember'], { held: 'eviolite' })], []);
	A(evi.units[0].stats.def === Math.floor(battleStats(fig('charmander', 20, ['ember']), data).def * 1.5) && evi.units[1].stats.def === battleStats(fig('charizard', 20, ['ember']), data).def, 'Eviolite: only while it can still evolve');
}
// Leftovers, Black Sludge
{
	for (const held of [null, 'leftovers', 'blacksludge']) {
		const S = battle([fig('machamp', 50, ['karatechop'], { held })], [[fig('snorlax', 60, ['tackle']), 6, 1]]);
		go(S, { t: 'deploy', uid: 'p0' }); const u = S.units[0]; u.hp = Math.floor(u.maxHP / 2); const hp0 = u.hp;
		go(S, { t: 'end' });
		const h = S.log.find((e) => e.t === 'held' && e.uid === 'p0');
		if (!held) A(!h && u.hp === hp0, 'no item: no heal at the end of the phase');
		else if (held === 'leftovers') A(h && u.hp === hp0 + Math.floor(u.maxHP / 16), 'Leftovers: 1/16 back at the end of its phase', [hp0, u.hp]);
		else A(h && u.hp === hp0 - Math.floor(u.maxHP / 8), 'Black Sludge: a non-Poison holder loses 1/8', [hp0, u.hp]);
	}
}
// Focus Sash, Sitrus, Lum / Cheri, White Herb, Weakness Policy, Rocky Helmet, Life Orb, Shell Bell, Lucky Egg, Leppa
{
	for (const held of [null, 'focussash']) {
		const S = battle([fig('machamp', 100, ['karatechop'])], [[fig('rattata', 5, ['tackle'], { held }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		const f = B.forecast(S, S.units[0], 'karatechop', 1, 5, data).targets[0];
		go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' });
		const v = S.units[1], hit = evs(S, 'hit')[0];
		if (!hit) { A(false, 'the hit landed (seed)'); continue; }
		A(held ? v.hp === 1 && f.sash && f.ko === 'no' && f.max === v.maxHP - 1 : v.hp === 0, held ? 'Focus Sash: hangs on with 1 HP, and the forecast said so' : 'no Sash: knocked out', [v.hp, f]);
	}
	{
		const S = battle([fig('pikachu', 30, ['thundershock'])], [[fig('snorlax', 40, ['tackle'], { held: 'sitrusberry' }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		const v = S.units[1]; v.hp = Math.floor(v.maxHP / 2) + 2;
		go(S, { t: 'attack', uid: 'p0', move: 'thundershock', x: 1, y: 5 }); go(S, { t: 'execute' });
		const hit = evs(S, 'hit')[0];
		A(hit && S.log.some((e) => e.t === 'held' && e.uid === v.uid && e.what === 'heal') && S.log.some((e) => e.t === 'heal' && e.uid === v.uid && e.n > 0), 'Sitrus Berry: heals once its HP falls to half');
	}
	for (const held of [null, 'cheriberry', 'lumberry']) {
		let done = false;
		for (let i = 0; i < 30 && !done; i++) {
			const S = battle([fig('pikachu', 30, ['thunderwave'])], [[fig('snorlax', 30, ['tackle'], { held }), 1, 5]], { seed: 'tw' + i }); go(S, { t: 'deploy', uid: 'p0' });
			go(S, { t: 'attack', uid: 'p0', move: 'thunderwave', x: 1, y: 5 }); go(S, { t: 'execute' });
			if (!S.log.some((e) => e.t === 'status')) continue;
			done = true;
			const v = S.units[1];
			A(held ? v.status === null && S.log.some((e) => e.t === 'cured') : v.status === 'par', held ? `${goodName(held)}: cures the paralysis at once` : 'no berry: paralysed');
		}
		if (!done) A(false, 'Thunder Wave landed in 30 seeds');
	}
	for (const held of [null, 'whiteherb']) {
		const S = battle([fig('machamp', 30, ['leer'])], [[fig('snorlax', 30, ['tackle'], { held }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		go(S, { t: 'attack', uid: 'p0', move: 'leer', x: 1, y: 6 }); go(S, { t: 'execute' });
		A(held ? S.units[1].boosts.def === 0 : S.units[1].boosts.def === -1, held ? 'White Herb: the lowered Defense comes back' : 'no herb: Defense -1', S.units[1].boosts);
	}
	for (const held of [null, 'weaknesspolicy']) {
		const S = battle([fig('machamp', 30, ['karatechop'])], [[fig('snorlax', 70, ['tackle'], { held }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' });
		if (!evs(S, 'hit').length) { A(false, 'hit landed'); continue; }
		A(held ? S.units[1].boosts.atk === 2 && S.units[1].boosts.spa === 2 : S.units[1].boosts.atk === 0, held ? 'Weakness Policy: +2 Attack and Sp. Atk after a super-effective hit' : 'no policy: no boost');
	}
	for (const [held, why, share] of [['rockyhelmet', 'rockyhelmet', 6]]) {
		const S = battle([fig('machamp', 30, ['karatechop'])], [[fig('snorlax', 70, ['tackle'], { held }), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' });
		const h = S.log.find((e) => e.t === 'hurt' && e.uid === 'p0' && e.why === why);
		A(h && h.n === Math.floor(S.units[0].maxHP / share), 'Rocky Helmet: a contact hit costs the attacker 1/6', h);
	}
	{
		const S = battle([fig('machamp', 30, ['karatechop'], { held: 'lifeorb' })], [[fig('snorlax', 70, ['tackle']), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' });
		const h = S.log.find((e) => e.t === 'hurt' && e.uid === 'p0' && e.why === 'lifeorb');
		A(h && h.n === Math.floor(S.units[0].maxHP / 10), 'Life Orb: each damaging attack costs 1/10 of its HP', h);
		const S2 = battle([fig('machamp', 30, ['karatechop'], { held: 'shellbell' })], [[fig('snorlax', 70, ['tackle']), 1, 5]]); go(S2, { t: 'deploy', uid: 'p0' });
		S2.units[0].hp = 10; go(S2, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S2, { t: 'execute' });
		const dealt = (evs(S2, 'hit')[0] || {}).dmg || 0;
		A(dealt > 0 && S2.log.some((e) => e.t === 'heal' && e.uid === 'p0' && e.n === Math.max(1, Math.floor(dealt / 8))), 'Shell Bell: heals 1/8 of what it dealt');
	}
	{
		const exp = (held) => { const S = battle([fig('machamp', 100, ['karatechop'], { held })], [[fig('rattata', 5, ['tackle']), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }); go(S, { t: 'execute' }); return S.exp.p0 || 0; };
		const a = exp(null), b = exp('luckyegg');
		A(a > 0 && b === Math.floor(a * 1.5) || Math.abs(b - a * 1.5) <= 1, 'Lucky Egg: 1.5x EXP from its KOs', [a, b]);
	}
	{
		const S = battle([fig('machamp', 30, ['karatechop'], { held: 'leppaberry' })], [[fig('snorlax', 70, ['tackle']), 1, 5]]); go(S, { t: 'deploy', uid: 'p0' });
		S.units[0].pp.karatechop = 1; go(S, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 });
		A(S.units[0].pp.karatechop === 10 && S.units[0].heldUsed, 'Leppa Berry: a move that runs dry gets 10 PP back, once');
	}
	{   // replays keep the held items (the recipe's slimmed figurines carry them)
		const p = [fig('machamp', 30, ['karatechop'], { held: 'lifeorb' })], e = [{ fig: fig('snorlax', 70, ['tackle'], { held: 'sitrusberry' }), x: 1, y: 5, ai: 'hold' }];
		const map = flat(), acts = [{ t: 'deploy', uid: 'p0' }, { t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 5 }, { t: 'end' }];
		const live = B.replay('rp', { map, player: p, enemy: e }, acts, data);
		const rec = recipeOf('rp', { map, player: p, enemy: e }, acts);
		const again = B.replay(rec.seed, rec.setup, rec.actions, data);
		A(rec.setup.player[0].held === 'lifeorb' && JSON.stringify(B.view(live)) === JSON.stringify(B.view(again)), 'a replay keeps the held items and plays the same');
	}
}
// Heal Pulse / Floral Healing heal the one aimed at (they healed no one)
{
	for (const mv of ['healpulse', 'floralhealing']) {
		const S = battle([fig('chansey', 40, [mv]), fig('machamp', 40, ['karatechop'])], [[fig('snorlax', 40, ['tackle']), 6, 0]], { map: flat(8, 8, { x: 1, y: 6 }) });
		go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 1, y: 4 }); go(S, { t: 'deploy', uid: 'p1' });
		const al = S.units[1]; al.hp = Math.floor(al.maxHP / 4);
		const r = go(S, { t: 'attack', uid: 'p0', move: mv, x: 1, y: 6 }); go(S, { t: 'execute' });
		A(r.ok && S.log.some((e) => e.t === 'heal' && e.uid === 'p1' && e.n === Math.floor(al.maxHP / 2)), `${data.moves[mv].name} heals the ally it is aimed at (half its HP)`, r.why);
	}
}

// ---------- the AI
const enemyPhase = (S) => { const n = S.log.length; go(S, { t: 'end' }); return S.log.slice(n).filter((e) => e.t === 'use' && e.uid[0] === 'e'); };
{   // a KO first: a weakened figurine over a fresh one
	const S = battle([fig('snorlax', 30, ['tackle']), fig('rattata', 30, ['tackle'])], [[fig('machamp', 30, ['karatechop']), 3, 3]], { map: flat(8, 8, { x: 3, y: 5 }) });
	go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 3, y: 4 }); go(S, { t: 'deploy', uid: 'p1' }); go(S, { t: 'move', uid: 'p1', x: 2, y: 3 });
	S.units[1].hp = 5;
	const use = enemyPhase(S)[0];
	A(use && use.x === 2 && use.y === 3, 'it goes for the knockout (the weakened Rattata, not the full Snorlax)', use);
}
{   // never a wasted hit on an immune target
	const S = battle([fig('gastly', 30, ['lick']), fig('rattata', 30, ['tackle'])], [[fig('snorlax', 30, ['bodyslam']), 3, 3]], { map: flat(8, 8, { x: 3, y: 5 }) });
	go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 3, y: 4 }); go(S, { t: 'deploy', uid: 'p1' }); go(S, { t: 'move', uid: 'p1', x: 2, y: 3 });
	S.units[1].hp = S.units[1].maxHP;
	const use = enemyPhase(S)[0];
	A(use && use.x === 2 && use.y === 3, 'a Normal move goes to the Rattata, never the Ghost', use);
}
{   // a healer heals its hurt ally (it couldn't before: status moves only ever went at foes)
	const S = battle([fig('snorlax', 30, ['tackle'])], [[fig('chansey', 30, ['healpulse', 'pound']), 3, 3], [fig('machamp', 30, ['karatechop']), 5, 3]], { map: flat(8, 8, { x: 3, y: 5 }) });
	go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 3, y: 4 });
	const mc = S.units.find((u) => u.species === 'machamp'); mc.hp = Math.floor(mc.maxHP * 0.3);
	const uses = enemyPhase(S), ch = uses.find((u) => u.uid === S.units.find((x) => x.species === 'chansey').uid);
	A(ch && ch.move === 'healpulse', 'the Chansey heals the hurt Machamp instead of attacking', uses);
}
{   // its own side out of its blast: Earthquake would hit the ally next to it
	const S = battle([fig('rattata', 30, ['tackle'])], [[fig('golem', 40, ['earthquake', 'rockthrow']), 3, 3, 'hold'], [fig('machamp', 30, ['karatechop']), 4, 3, 'hold']], { map: flat(8, 8, { x: 3, y: 5 }) });
	go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 3, y: 4 });
	const g = enemyPhase(S).find((u) => u.uid === S.units[1].uid);
	A(g && g.move !== 'earthquake', 'the Golem holds its Earthquake while its ally stands in it', g);
}
{   // a healer with no one to heal keeps out of the figurines' reach
	const S = battle([fig('machamp', 30, ['karatechop'])], [[fig('chansey', 30, ['healpulse']), 4, 1, 'aggro'], [fig('rattata', 30, ['tackle']), 6, 0, 'hold']], { map: flat(8, 8, { x: 1, y: 6 }) });
	go(S, { t: 'deploy', uid: 'p0' });
	const reach = new Set(B.threat(S, S.units[0], data).attack.map(([x, y]) => x + ',' + y));
	enemyPhase(S);
	const ch = S.units[1];
	A(!reach.has(ch.x + ',' + ch.y), 'the idle Chansey stays where the Machamp cannot strike', [ch.x, ch.y]);
}
{   // a Choice item's lock is obeyed (the AI never tries a locked move)
	const S = battle([fig('snorlax', 60, ['tackle'])], [[fig('machamp', 30, ['karatechop', 'tackle'], { held: 'choiceband' }), 3, 3]], { map: flat(8, 8, { x: 3, y: 5 }) });
	go(S, { t: 'deploy', uid: 'p0' }); go(S, { t: 'move', uid: 'p0', x: 3, y: 4 });
	const uses = [];
	for (let i = 0; i < 3 && !S.over; i++) uses.push(...enemyPhase(S));
	A(uses.length === 3 && new Set(uses.map((u) => u.move)).size === 1, 'a Choice Band foe uses the same move every turn', uses.map((u) => u.move));
}
{   // a full enemy phase stays quick (6 figurines, 8 foes on a 12x12 map)
	const map = flat(12, 12, { x: 1, y: 10 });
	const player = ['machamp', 'pikachu', 'snorlax', 'gengar', 'starmie', 'alakazam'].map((sp) => fig(sp, 40, (data.species[sp].learnset.filter(([l]) => l <= 40).slice(-4).map(([, id]) => id)).filter((id) => data.shapes[id])));
	const foes = ['golem', 'arcanine', 'gyarados', 'jolteon', 'chansey', 'machamp', 'nidoking', 'dragonite'].map((sp, i) => [fig(sp, 40, (data.species[sp].learnset.filter(([l]) => l <= 40).slice(-4).map(([, id]) => id)).filter((id) => data.shapes[id])), 4 + (i % 4) * 2, 1 + Math.floor(i / 4) * 2, 'aggro']);
	const S = battle(player, foes, { map });
	for (const u of S.units.filter((x) => x.side === 'p')) { go(S, { t: 'deploy', uid: u.uid }); const t = [...B.moveTiles(S, u).values()].find((q) => !B.unitAt(S, q.x, q.y) && !(q.x === map.base.x && q.y === map.base.y)); if (t) go(S, { t: 'move', uid: u.uid, x: t.x, y: t.y }); }
	const t0 = Date.now(); go(S, { t: 'end' }); const ms = Date.now() - t0;
	A(ms < 4000, `an enemy phase of 8 foes takes ${ms} ms (under 4 s)`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
