// Bug review 2026-10-27 — Battlecards tester reports (instinctgauntlet).
//   1 Sword Coast clear     headline hard-coded "TIAMAT IS SLAIN!" — either rung-D boss can close a run
//   2 Captain America       "Battlecry: Give your OTHER creatures +1/+1" buffed itself (+17 cards, same shape)
//   3 mill event            Fel Reaver's mill emitted no `card`; the renderer threw and stranded the queue
//                           (+ Soul Rend's mill, + the Starship launchTransform 'transformed' event)
//   4 Sandman's Quicksand   "{T}: Freeze an enemy creature" froze the whole enemy row, locations included
//                           (+ Shocker, Sky Cycle, Doom's Time Platform, Trickster's Stratagem)
//   5 Ring of Courage       "Repeat for each enemy creature" never repeated (+ Blazing Power, Chum Bucket,
//                           Petting Zoo, Roaring Applause, Dark Skies, Bouncing Blade, Fly Off the Shelves)
//   6 Vanquish the Horde    already fixed by #826 (merged 11:02Z; the report was filed 09:06Z) — pinned here
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import * as Swordcoast from '../../swordcoast.js';

const warns = [];
const _warn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 6, attack: 1, health: 9, rarity: 'common' };
byId._bear = { id: '_bear', name: 'Bear', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._wall = { id: '_wall', name: 'Wall', type: 'creature', cost: 9, attack: 0, health: 60, rarity: 'common' };
byId._murloc = { id: '_murloc', name: 'Fish', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Murloc' };
byId._beast = { id: '_beast', name: 'Wolf', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Beast' };
byId._pirate = { id: '_pirate', name: 'Pirate', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', tribe: 'Pirate' };
byId._dragon = { id: '_dragon', name: 'Drake', type: 'creature', cost: 9, attack: 1, health: 1, rarity: 'common', tribe: 'Dragon' };
byId._spark = { id: '_spark', name: 'Spark', type: 'sorcery', cost: 0, rarity: 'common', effects: [] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh(seed = 1027) {
	const st = E.createGame(byId, seededRng(seed), null, 2, [{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.secrets = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; p.deck = Array(30).fill('_bear'); }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const putArt = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'artifact'; c.tapped = false; st.players[pi].artifacts.push(c); return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
// a location on the other side can respond at instant speed: everyone passes so the spell resolves
const settle = st => { for (let n = 0; n < 8 && st.priority != null; n++) E.resolveResponse(st, st.priority, null); };
const play = (st, pi, id, target) => { const c = give(st, pi, id); const r = E.playCard(st, pi, c.uid, target || null, null, null); settle(st); return { r, c }; };
const tc = c => ({ type: 'creature', uid: c.uid, player: c.controller });
const frozenNow = (st, c) => c.frozen === st.turnNumber;

// ---------- 1) Sword Coast clear headline names the foe actually beaten ----------
{
	const head = Swordcoast.clearHeadline;
	ok('Swordcoast.clearHeadline exists', typeof head === 'function');
	if (typeof head === 'function') {
		const a = head('Asmodeus the Archfiend');
		ok('lost to Tiamat, beat Asmodeus: the headline does not claim Tiamat was slain', !/TIAMAT/.test(a) && /ASMODEUS THE ARCHFIEND/.test(a) && /^12 WINS/.test(a), a);
		ok('a real final Tiamat win still reads TIAMAT IS SLAIN', head('Tiamat') === '12 WINS - TIAMAT IS SLAIN!', head('Tiamat'));
		ok('no recorded final foe: a generic clear line, no boss claim', !/TIAMAT|ASMODEUS/.test(head(null)), head(null));
	}
	ok('both rung-D bosses can close a run (so the boss is not fixed)', JSON.stringify(Swordcoast.enemyRosterFor(11).sort()) === JSON.stringify(['Asmodeus the Archfiend', 'Tiamat']), Swordcoast.enemyRosterFor(11));
	const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
	const fn = src.slice(src.indexOf('function swordCoastRunComplete'), src.indexOf('function swordCoastRunOver'));
	ok('swordCoastRunComplete builds its headline from run.enemy (no hard-coded Tiamat)', !fn.includes("'12 WINS - TIAMAT IS SLAIN!'") && /clearHeadline\(run\.enemy/.test(fn));
}

// ---------- 2) "your OTHER creatures" Battlecries skip the source ----------
{
	const st = fresh();
	const { c: cap } = play(st, 0, 'mv_cap_1');
	ok('Captain America on an empty board stays 4/6 (report: became 5/7)', cap.attack === 4 && cap.maxHealth === 6, `${cap.attack}/${cap.maxHealth}`);
	const st2 = fresh(); const bear = put(st2, 0, '_bear');
	const { c: cap2 } = play(st2, 0, 'mv_cap_1');
	ok('...with a friendly Bear: the Bear gets +1/+1, Captain does not', bear.attack === 3 && bear.maxHealth === 3 && cap2.attack === 4 && cap2.maxHealth === 6, `${bear.attack}/${bear.maxHealth} ${cap2.attack}/${cap2.maxHealth}`);
	const others = ['me_lo_sharkey', 'me_go_siege', 'me_ug_warmonger', 'me_ma_siegemaster', 'me_gg_foulhearted', 'me_az_siegemaster', 'me_tom_quickbeam', 'bant_sojourners', 'sc_bruenor_4', 'sc_mazzy_1', 'sc_mazzy_2', 'sc_e_gut_3', 'sc_e_grumgully_1', 'sc_e_targnar_15', 'ltr_boromir_warden', 'hoc_celeborn_wise', 'mv_e_lizard_1'];
	for (const id of others) {
		const s = fresh(); const b = put(s, 0, '_bear');
		const { c } = play(s, 0, id);
		const d = byId[id];
		ok(`${d.name}: "other creatures" Battlecry leaves itself at printed ${d.attack}/${d.health}`, c.attack === d.attack && c.maxHealth === d.health, `${c.attack}/${c.maxHealth}`);
		ok(`...and does buff the other creature`, b.attack + b.maxHealth > 4, `${b.attack}/${b.maxHealth}`);
	}
	// class guard: no creature whose text says "your other creatures" buffs friendly-creatures without excludeSelf
	const bad = raw.cards.filter(c => c.type === 'creature' && /\byour other creatures\b/i.test(c.description || '')
		&& [...(c.effects || []), ...(c.deathrattle || [])].some(e => e.type === 'buff' && e.target === 'friendly-creatures' && !e.excludeSelf));
	ok('no "your other creatures" buff still includes its source', bad.length === 0, bad.map(c => c.id));
}

// ---------- 3) mill events carry the milled card; the renderer survives a bad event ----------
{
	const st = fresh();
	st.players[1].deck = ['_ogre', '_bear', '_wall', '_murloc', '_beast', '_pirate', '_dragon'];
	put(st, 1, 'fel_reaver');
	st.events.length = 0;
	play(st, 0, 'mv_cap_1');
	const mills = st.events.filter(ev => ev.type === 'mill');
	ok('Fel Reaver: playing a card mills the opponent 3 (deck 7 -> 4, as reported)', st.players[1].deck.length === 4 && mills.length === 3, `${st.players[1].deck.length} ${mills.length}`);
	ok('...and every mill event names its card (game.js logs ev.card.name)', mills.length > 0 && mills.every(ev => ev.card && typeof ev.card.name === 'string'), JSON.stringify(mills));
	ok('...the names are the cards actually milled (top of deck)', mills.map(ev => ev.card?.name).join(',') === 'Drake,Pirate,Wolf', mills.map(ev => ev.card && ev.card.name));
	// Soul Rend: its per-kill mill emitted a bare {count} event, same crash
	const s2 = fresh(); put(s2, 1, '_bear'); put(s2, 1, '_bear'); s2.players[0].deck = ['_ogre', '_wall', '_beast'];
	s2.events.length = 0;
	E.execEffects(s2, 0, [{ type: 'damage-all-minions-mill-per-kill', value: 5 }], null, null);
	const m2 = s2.events.filter(ev => ev.type === 'mill');
	ok('Soul Rend-style mill: one named event per destroyed card', m2.length === 2 && m2.every(ev => ev.card && ev.card.name), JSON.stringify(m2));
	const src = fs.readFileSync(new URL('../../game.js', import.meta.url), 'utf8');
	const i0 = src.indexOf('function nextEvent()'); const body = src.slice(i0, src.indexOf('\nfunction ', i0 + 10));
	ok('nextEvent wraps the renderer in try/catch so one bad event cannot strand the queue', /try \{\s*switch \(ev\.type\)/.test(body) && /\} catch \(err\) \{[\s\S]*setTimeout\(nextEvent, delay\)/.test(body));
	ok("the 'mill' log line tolerates an event with no card", /milled \$\{ev\.card\?\.name/.test(body));
	// every emitter of an event whose renderer reads ev.card.* passes a card
	const g = src; const re = /case '([\w-]+)':/g; let m; const cases = []; while ((m = re.exec(g))) cases.push([m[1], m.index]);
	const readsCard = new Set(); for (let i = 0; i < cases.length; i++) { const b = g.slice(cases[i][1], cases[i + 1] ? cases[i + 1][1] : cases[i][1] + 3000); if (/ev\.card\.\w/.test(b)) readsCard.add(cases[i][0]); }
	const engDir = new URL('../../engine/', import.meta.url); const files = [];
	const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const u = new URL(f.name + (f.isDirectory() ? '/' : ''), d); if (f.isDirectory()) walk(u); else if (f.name.endsWith('.js')) files.push(u); } };
	walk(engDir);
	const missing = [];
	for (const f of files) fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
		const k = l.indexOf("emit(state, { type: '"); if (k < 0) return;
		const t = /type: '([\w-]+)'/.exec(l.slice(k))[1]; if (!readsCard.has(t)) return;
		if (!/\bcard\b/.test(l.slice(k).split('})')[0])) missing.push(`${f.pathname.split('/').pop()}:${i + 1} ${t}`);
	});
	ok('no engine emitter omits the card its renderer reads', missing.length === 0, missing);
}

// ---------- 4) singular freezes freeze ONE creature; never a location ----------
{
	const st = fresh(); st.current = 1;
	const qs = putArt(st, 1, 'mv_e_sandman_8');
	const a = put(st, 0, '_bear'), b = put(st, 0, '_ogre'), c = put(st, 0, '_wall'), loc = put(st, 0, 'mv_e_sandman_10');
	const spec = E.tapArtifactSpec(st, 1, qs.uid);
	ok("Sandman's Quicksand asks for a target", !!spec, JSON.stringify(spec));
	const legal = spec ? E.legalTargets(st, 1, spec).filter(t => t.type === 'creature').map(t => t.uid) : [];
	ok('...a location is not a legal target', !legal.includes(loc.uid) && legal.includes(a.uid), legal);
	E.tapArtifact(st, 1, qs.uid, tc(b));
	ok('...tapping freezes only the chosen creature (report: froze the whole row)', frozenNow(st, b) && !a.frozen && !c.frozen && !loc.frozen, [a, b, c, loc].map(x => x.frozen));
	for (const [id, path] of [['mv_e_shocker_8', 'tap'], ['mv_e_kang_8', 'tap'], ['mv_e_shocker_1', 'play']]) {
		const s = fresh(); s.current = 1;
		const x = put(s, 0, '_wall'), y = put(s, 0, '_wall'), l2 = put(s, 0, 'mv_e_sandman_10');
		if (path === 'tap') { const art = putArt(s, 1, id); E.tapArtifact(s, 1, art.uid, tc(x)); }
		else play(s, 1, id, tc(x));
		ok(`${byId[id].name}: damages and freezes the chosen creature only ("freeze it")`, x.damage > 0 && frozenNow(s, x) && !y.frozen && !l2.frozen, `${x.damage} ${x.frozen} ${y.frozen} ${l2.frozen}`);
	}
	const s5 = fresh(); s5.current = 1;
	const t5 = put(s5, 0, '_bear'), o1 = put(s5, 0, '_wall'), o2 = put(s5, 0, '_wall');
	play(s5, 1, 'mv_e_loki_6', tc(t5));
	const fz = [o1, o2].filter(x => frozenNow(s5, x)).length;
	ok("Trickster's Stratagem: bounces the target and freezes ONE creature", !s5.players[0].board.includes(t5) && fz === 1, fz);
	const s6 = fresh(); const w1 = put(s6, 1, '_wall'), w2 = put(s6, 1, '_bear'), l6 = put(s6, 1, 'mv_e_sandman_10');
	play(s6, 0, 'frost_nova');
	ok('Frost Nova (all enemy creatures) still freezes every creature, but not the location', frozenNow(s6, w1) && frozenNow(s6, w2) && !l6.frozen, l6.frozen);
	const bad = raw.cards.filter(d => /freeze an enemy creature|freeze it\b|freeze a creature/i.test((d.description || '') + ' ' + (d.tapAbility?.text || ''))
		&& !/\ball\b|\beach\b/i.test(d.description || '')
		&& JSON.stringify([d.effects, d.tapAbility, d.taps]).includes('"type":"freeze","target":"enemy-creatures"'));
	ok('no singular-freeze card still freezes every enemy creature', bad.length === 0, bad.map(d => d.id));
	// 2026-10-27c: Mysterio's Mirage ("At the start of your turn, freeze a RANDOM enemy creature") slipped
	// past this check twice over — the phrase had "random" in it, and the effect lived in `ongoing`, which
	// the scan above never read. This one reads the whole card, every zone of it.
	const bad2 = raw.cards.filter(d => /\bfreeze (a|an|one) (random )?(other )?(enemy )?(creature|minion|character)\b/i.test((d.description || '') + ' ' + (d.tapAbility?.text || ''))
		&& !/\b(all|each|every)\b/i.test(d.description || '')
		&& /"type":"freeze","target":"(enemy-creatures|all-others|friendly-others)"/.test(JSON.stringify(d)));
	ok('no singular or random-single freeze (any zone: effects, ongoing, taps, deathrattle) freezes a whole row', bad2.length === 0, bad2.map(d => d.id));
}

// ---------- 5) "Repeat for each ..." actually repeats ----------
{
	const st = fresh(); const t = put(st, 0, '_ogre');
	for (let i = 0; i < 10; i++) put(st, 1, '_bear');
	put(st, 1, 'mv_e_sandman_10'); // a location is not a creature
	const before = st.players[0].mana.cur;
	play(st, 0, 'ring_of_courage', tc(t));
	ok('Ring of Courage vs ten enemy creatures: +1/+1 then ten repeats = +11/+11', t.attack === 12 && t.maxHealth === 20, `${t.attack}/${t.maxHealth}`);
	ok('...for its 2 mana', before - st.players[0].mana.cur === 2);
	const s0 = fresh(); const t0 = put(s0, 0, '_ogre'); play(s0, 0, 'ring_of_courage', tc(t0));
	ok('...no enemies: just the base +1/+1', t0.attack === 2 && t0.maxHealth === 10);
}
{
	const st = fresh(); const t = put(st, 0, '_ogre'); put(st, 0, '_bear').damage = 1; st.players[0].life = 20;
	play(st, 0, 'blazing_power', tc(t));
	ok('Blazing Power: +1/+1, repeated for the damaged Bear and the damaged hero = +3/+3', t.attack === 4 && t.maxHealth === 12, `${t.attack}/${t.maxHealth}`);
}
{
	const st = fresh(); put(st, 0, '_murloc'); put(st, 0, '_murloc'); const h = give(st, 0, '_murloc');
	play(st, 0, 'chum_bucket');
	ok('Chum Bucket with 2 Murlocs in play: a hand Murloc gains +3/+3', h.attack === 4 && h.maxHealth === 4, `${h.attack}/${h.maxHealth}`);
}
{
	const st = fresh(); st.players[0].secrets = [{ id: 's1', name: 'S1' }, { id: 's2', name: 'S2' }];
	play(st, 0, 'petting_zoo');
	ok('Petting Zoo with 2 Secrets: three 3/3 Striders', st.players[0].board.filter(c => c.name === 'Strider').length === 3, st.players[0].board.length);
}
{
	const st = fresh(); put(st, 0, '_beast'); put(st, 0, '_pirate'); put(st, 0, '_beast');
	play(st, 0, 'roaring_applause');
	ok('Roaring Applause with Beasts + a Pirate: draws 1 + 2 types = 3', st.players[0].hand.length === 3, st.players[0].hand.length);
}
{
	const st = fresh(); const w = put(st, 1, '_wall'); give(st, 0, '_spark'); give(st, 0, '_spark'); give(st, 0, '_spark');
	play(st, 0, 'dark_skies');
	ok('Dark Skies holding 3 cards: 1 + 3 = 4 damage to the only creature (used to fizzle: unknown pool)', w.damage === 4, w.damage);
}
{
	const st = fresh(); const w = put(st, 1, '_wall'); const v = put(st, 1, '_ogre'); v.damage = 0;
	play(st, 0, 'bouncing_blade');
	const total = w.damage + v.damage;
	ok('Bouncing Blade: bounces until a creature dies (the 9-Health Ogre)', E.isDead(v) || !st.players[1].board.includes(v), `${w.damage} ${v.damage}`);
	ok('...and hit more than 3 times on this board', total >= 9, total);
}
{
	const st = fresh(); const w = put(st, 1, '_wall');
	give(st, 0, '_dragon'); give(st, 0, '_dragon'); give(st, 0, '_dragon');
	play(st, 0, 'fly_off_the_shelves');
	ok('Fly Off the Shelves holding 3 Dragons: 1 + 3 = 4 damage (used to cap at 2)', w.damage === 4, w.damage);
	const s2 = fresh(); const w2 = put(s2, 1, '_wall'); play(s2, 0, 'fly_off_the_shelves');
	ok('...holding none: 1', w2.damage === 1, w2.damage);
}

// ---------- 6) Vanquish the Horde (fixed by #826): no prompt, every enemy creature destroyed ----------
{
	const st = fresh();
	const foes = [put(st, 1, '_ogre'), put(st, 1, '_wall'), put(st, 1, '_bear')];
	const mine = put(st, 0, '_bear');
	st.players[0].mana = { cur: 7, max: 7, bonus: 0 };
	const card = give(st, 0, 'mv_treasure_vanquish_the_horde');
	ok('Vanquish the Horde asks for no target (played straight from hand)', E.targetSpec(st, 0, card) === null);
	E.playCard(st, 0, card.uid, null, null, null); E.sweepDeaths(st);
	ok('...7 -> 1 mana, as reported', st.players[0].mana.cur === 1, st.players[0].mana.cur);
	ok('...and all three enemy creatures are destroyed', foes.every(f => !st.players[1].board.includes(f)), st.players[1].board.map(c => c.name));
	ok('...yours survive', st.players[0].board.includes(mine));
}

console.warn = _warn;
for (const w of warns) if (/unhandled condition/.test(w)) { fail++; console.log('FAIL warn', w); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
