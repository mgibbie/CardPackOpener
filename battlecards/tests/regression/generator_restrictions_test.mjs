// "Create a random ... Taunt creature" makes a TAUNT creature (bug:1794324790779 —
// instinctgauntlet, Final Fantasy Lorequest: Guard Duty made Fossil Dreadmaw, Archmage
// Kalec, Silvermoon Farstrider ... none with Taunt).
//
// DIAGNOSIS: Guard Duty's effects were three bare {type:'summon-random', cost:N}: the
// "Taunt" in its text never reached the engine, so it rolled ANY creature of that Cost.
// The same class (a generator whose text names a keyword / tribe / school / class / rune
// the effect data doesn't carry) was swept over every summon-random, conjure-random,
// discover, add-random-card and conjure-cost in cards.json and the run-mode hero powers:
//   guard_duty           "Taunt creature"                -> requireKeyword:'taunt' (+ fallback: grant it)
//   avant_gardening      "Discover a Deathrattle creature" -> requireKeyword:'deathrattle'
//   raid_negotiator      "Discover a Choose One card"     -> chooseOne:true, cardType:'any'
//   azsharan_scroll      "a Fire, Frost or Nature spell"  -> tribes (new discover filter)
//   crypt_map            "Discover a Frost Rune card"     -> requireRune:'frost' (new), death_knight
//   necrotic_mortician   "Discover an Unholy Rune card"   -> requireRune:'unholy'
//   keywarden_ivory      "a Dual Class spell"             -> dualClass:true (new)
//   soulburner_varia     "a random Shadow Priest spell"   -> cardClass:'priest'
//   sweetened_snowflurry "2 random Temporary Frost spells" -> makeTemporary:true
//   5 Heist/Tombs boss powers "Add a random spell" had cardType:'sorcery', which
//   conjure-random doesn't know, so they added ANY card -> cardType:'spell'.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';
import { BOSSES as HEIST_BOSSES } from '../../heist.js';
import { BOSSES as TOMBS_BOSSES } from '../../tombs.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };
const cards = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url), 'utf8')).cards;
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
const seeded = seed => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const quiet = fn => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return fn(); } finally { console.log = l; console.warn = w; } };

// run one effect list for player 0 and hand back the state
function fire(effects, { seed = 1, db = byId, source = null } = {}) {
	return quiet(() => {
		const state = E.createGame(db, seeded(seed), null, 2);
		for (const p of state.players) { p.hand = []; p.deck = []; p.board = []; }
		state.events = [];
		E.execEffects(state, 0, JSON.parse(JSON.stringify(effects)), null, source);
		return state;
	});
}
const offered = (effects, seeds = 12) => {
	const ids = [];
	for (let s = 1; s <= seeds; s++) { const st = fire(effects, { seed: s }); for (const q of st.pickQueue) ids.push(...q.ids); }
	return ids.map(id => byId[id]);
};
const conjured = (effects, seeds = 12) => {
	const out = [];
	for (let s = 1; s <= seeds; s++) out.push(...fire(effects, { seed: s }).players[0].hand);
	return out;
};

// ---- 1) Guard Duty: three Taunt creatures costing 6, 4 and 2 ----
{
	let all = [], costsOk = true;
	for (let seed = 1; seed <= 25; seed++) {
		const r = quiet(() => new Scenario(byId, { rng: seeded(seed) }).players(2).mana(0, 10).hand(0, ['guard_duty']).play(0, 'guard_duty').run());
		const board = r.state.players[0].board;
		all.push(...board);
		if (board.map(c => c.cost).join() !== '6,4,2') costsOk = false;
	}
	ok('Guard Duty summons a 6-, 4- and 2-Cost creature', costsOk);
	const noTaunt = all.filter(c => !c.keywords.includes('taunt'));
	ok('...and every one of them has Taunt (75 rolls)', all.length === 75 && noTaunt.length === 0, noTaunt.slice(0, 5).map(c => c.name).join(', '));
	ok('...printed Taunt, not granted (they are Taunt creatures)', all.every(c => (byId[c.id].keywords || []).includes('taunt')));
	ok('...and not always the same creature', new Set(all.map(c => c.id)).size > 10);
}

// ---- 2) the fallback: no creature of that Cost has the keyword -> any creature of that Cost, given it ----
{
	const db = {
		plain3: { id: 'plain3', name: 'Plain Three', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', keywords: [] },
		plain5: { id: 'plain5', name: 'Plain Five', type: 'creature', cost: 5, attack: 5, health: 5, rarity: 'common', keywords: [] },
		taunt5: { id: 'taunt5', name: 'Taunt Five', type: 'creature', cost: 5, attack: 2, health: 7, rarity: 'common', keywords: ['taunt'] },
	};
	const st = fire([{ type: 'summon-random', cost: 3, requireKeyword: 'taunt' }], { db });
	const c = st.players[0].board[0];
	ok('fallback: a 3-Cost Taunt with no 3-Cost Taunt in the pool still summons the 3-Cost creature', c && c.id === 'plain3', c && c.id);
	ok('fallback: ...and gives it Taunt', c && c.keywords.includes('taunt'));
	const ids = new Set();
	for (let s = 1; s <= 20; s++) ids.add(fire([{ type: 'summon-random', cost: 5, requireKeyword: 'taunt' }], { db, seed: s }).players[0].board[0]?.id);
	ok('with a match in the pool the filter holds (only the real Taunt)', ids.size === 1 && ids.has('taunt5'), [...ids].join());
	// an unfiltered summon-random is untouched by the fallback
	const ids2 = new Set();
	for (let s = 1; s <= 30; s++) ids2.add(fire([{ type: 'summon-random', cost: 5 }], { db, seed: s }).players[0].board[0]?.id);
	ok('an unfiltered summon-random still rolls any creature of that Cost', ids2.has('plain5') && ids2.has('taunt5'));
}

// ---- 3) the rest of the class, as each card's effect actually runs ----
{
	const fx = id => byId[id].effects;
	const ag = offered(fx('avant_gardening'));
	ok('Avant-Gardening offers only Deathrattle creatures', ag.length > 0 && ag.every(d => d.type === 'creature' && (d.keywords || []).includes('deathrattle')), ag.filter(d => !(d.keywords || []).includes('deathrattle')).map(d => d.name).slice(0, 4).join());
	const rn = offered(fx('raid_negotiator'));
	ok('Raid Negotiator offers only Choose One cards', rn.length > 0 && rn.every(d => Array.isArray(d.choices) && d.choices.length), rn.filter(d => !d.choices).map(d => d.name).slice(0, 4).join());
	const az = offered(fx('azsharan_scroll'));
	ok('Azsharan Scroll offers only Fire, Frost or Nature spells', az.length > 0 && az.every(d => ['Fire', 'Frost', 'Nature'].some(t => (d.tribe || '').includes(t)) && d.type !== 'creature'), az.filter(d => !['Fire', 'Frost', 'Nature'].some(t => (d.tribe || '').includes(t))).map(d => d.name + ':' + d.tribe).slice(0, 4).join());
	const cm = offered(fx('crypt_map'));
	ok('Crypt Map offers only Frost Rune (Death Knight) cards', cm.length > 0 && cm.every(d => d.cardClass === 'death_knight' && d.runes?.frost > 0), cm.filter(d => !(d.runes?.frost > 0)).map(d => d.name).slice(0, 4).join());
	ok('...including Frost Rune creatures, not only Frost spells', cm.some(d => d.type === 'creature'));
	const nm = offered(fx('necrotic_mortician')[0].then);
	ok('Necrotic Mortician offers only Unholy Rune cards', nm.length > 0 && nm.every(d => d.cardClass === 'death_knight' && d.runes?.unholy > 0), nm.filter(d => !(d.runes?.unholy > 0)).map(d => d.name).slice(0, 4).join());
	const kw = offered(fx('keywarden_ivory'));
	ok('Keywarden Ivory offers only Dual Class spells', kw.length > 0 && kw.every(d => (d.cardClass || '').includes('__') && d.type !== 'creature'), kw.filter(d => !(d.cardClass || '').includes('__')).map(d => d.name).slice(0, 4).join());
	const sv = conjured(byId.soulburner_varia.ongoing.effects.filter(e => e.type === 'conjure-random'));
	ok('Soulburner Varia gets only Shadow PRIEST spells', sv.length > 0 && sv.every(c => c.cardClass === 'priest' && (c.tribe || '').includes('Shadow')), sv.filter(c => c.cardClass !== 'priest').map(c => c.name + ':' + c.cardClass).slice(0, 4).join());
	const sf = conjured(fx('sweetened_snowflurry'));
	ok('Sweetened Snowflurry gets Temporary Frost spells', sf.length > 0 && sf.every(c => c.temporary && (c.tribe || '').includes('Frost')));
}

// ---- 4) run-mode boss powers: "Add a random spell" adds a SPELL ----
{
	const powers = [...Object.values(HEIST_BOSSES), ...Object.values(TOMBS_BOSSES)].map(b => b.power).filter(p => p && /Add a random spell/.test(p.text || ''));
	ok(`found the "Add a random spell" boss powers (${powers.length})`, powers.length === 5);
	for (const p of powers) {
		const got = conjured(p.effects, 10);
		ok(`${p.name} adds only spells`, got.length > 0 && got.every(c => c.type !== 'creature' && c.type !== 'land' && c.type !== 'weapon'), got.filter(c => c.type === 'creature' || c.type === 'weapon').map(c => c.name + ':' + c.type).slice(0, 3).join());
	}
}

// ---- 5) the class stays fixed: every generator whose text names a keyword/tribe/school before
// its noun carries a matching filter (the audit that found the cards above) ----
{
	const GEN = new Set(['summon-random', 'conjure-random', 'discover', 'add-random-card', 'conjure-cost']);
	// reviewed and fine: the word is flavour, or the restriction is carried another way
	const ALLOWED = {
		barbtooth_wurm: 'Green = the Forest landSet pool', fools_gold: '"Golden" is cosmetic', war_cache: '"Warrior" = cardClass own',
		maestra_mask_merchant: 'Hero cards are not modelled; approximated as a Legendary from another class',
	};
	const flagged = [];
	for (const c of cards) {
		const effs = [];
		const walk = v => { if (Array.isArray(v)) return v.forEach(walk); if (v && typeof v === 'object') { if (GEN.has(v.type)) effs.push(v); Object.values(v).forEach(walk); } };
		for (const [k, v] of Object.entries(c)) if (k !== 'id') walk(v);
		if (!effs.length || ALLOWED[c.id]) continue;
		const fsx = JSON.stringify(effs).toLowerCase();
		const re = /(?:random|Discover (?:a|an|two|three|\d)) ((?:[\w'\-,()]+ ){0,6}?)(creatures?|minions?|cards?|spells?|weapons?|secrets?|Beasts?|Demons?|Dragons?|Murlocs?|Mechs?|Pirates?|Elementals?|Totems?|Undead|Nagas?|Draenei|Legendar(?:y|ies))\b/g;
		let m;
		while ((m = re.exec(c.description || ''))) {
			const ph = (m[1] + m[2]).trim();
			const words = ph.replace(/\(\d+\)|\d+-Cost|\d+/g, '').split(/[\s,()]+/).filter(w => /^[A-Z]/.test(w) && !['Cost', 'Mana', 'Legendary', 'Legendaries', 'Class', 'One', 'Rune'].includes(w));
			const special = { Dual: 'dualclass', Choose: 'chooseone' };
			const miss = words.filter(w => !fsx.includes(special[w] || w.toLowerCase().replace(/ies$/, 'y').replace(/s$/, '')));
			if (/Legendar/.test(ph) && !fsx.includes('legendary')) miss.push('Legendary');
			if (miss.length) flagged.push(`${c.id}: "${ph}" lacks ${miss.join(',')}`);
		}
	}
	ok('no generator names a restriction its effect data drops', flagged.length === 0, flagged.join(' | '));
	// and no unrelated summon-random gained a keyword filter
	const kwSummons = [];
	const walk = (v, id) => { if (Array.isArray(v)) return v.forEach(x => walk(x, id)); if (v && typeof v === 'object') { if (v.type === 'summon-random' && v.requireKeyword) kwSummons.push(id); Object.values(v).forEach(x => walk(x, id)); } };
	for (const c of cards) walk(c, c.id);
	ok('the keyword-filtered summon-randoms are exactly the ones whose text asks for it', [...new Set(kwSummons)].sort().join() === 'atlasaurus,guard_dog,guard_duty,obsidian_revenant,spiteful_chef', [...new Set(kwSummons)].sort().join());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
