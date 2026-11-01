// lorequest_cards_1101_test.mjs — three instinctgauntlet Sword Coast reports (2026-10-27/28):
//   1. bug:1793147473672 Knight-Captain "Battlecry: Deal 3 damage to any target. Honorable Kill:
//      this gains +3/+3." — an exact-lethal battlecry kill never paid the +3/+3: Honorable Kill was
//      checked only for combat and for spells, never for a creature's own Battlecry.
//   2. bug:1793157332947 Wand of Wonder "{T}: Deal 3 damage randomly split among enemies." dealt
//      three 3-damage hits (value 3 x count 3 = 9). `random-damage` is `count` hits of `value`, so
//      "N split" = value 1 x count N, as every Hearthstone split card already was. The same slip sat
//      on 8 more Lorequest cards + Doctor Octopus's hero power; all fixed to their printed totals
//      (and "split among enemy creatures" now only hits creatures).
//   3. bug:1793161531299 Staff of Renewal "Resurrect 7 creatures you control with the highest Cost"
//      raised one dead Augur six times off two deaths: the loop padded `count` with the last
//      candidate. Now one candidate per real death, never padded.
//   node battlecards/tests/regression/lorequest_cards_1101_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
import * as Multiverse from '../../multiverse.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId.t_kill = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId.t_ogre = { id: 't_ogre', name: 'Ogre', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', description: 'x' };
byId.t_wall = { id: 't_wall', name: 'Wall', type: 'creature', cost: 3, attack: 0, health: 30, rarity: 'common', description: 'x' };
function fresh(seed = 0.4) { const s = E.createGame(byId, typeof seed === 'function' ? seed : () => seed, null, 2); for (const p of s.players) { p.board = []; p.hand = []; p.deck = []; p.mana = { cur: 99, max: 99, bonus: 0 }; } s.current = 0; return s; }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { const c = give(s, pi, id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
const tgt = c => ({ type: 'creature', uid: c.uid, player: c.controller });
let pass = 0, fail = 0; const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ===== 1. Knight-Captain =====
function captainVs(setup) {
	const s = fresh();
	const foe = summon(s, 1, 't_ogre'); setup(foe);
	const kc = give(s, 0, 'knight_captain');
	ok('Knight-Captain plays', E.playCard(s, 0, kc.uid, tgt(foe)) !== false);
	const me = s.players[0].board.find(c => c.id === 'knight_captain');
	return { s, me, foeDead: !s.players[1].board.some(c => c.uid === foe.uid && !E.isDead(c)) };
}
{
	const r = captainVs(() => {});
	ok('an undamaged 3-health target dies to the battlecry', r.foeDead);
	ok('exact lethal from the battlecry: Captain is 6/6', r.me && r.me.attack === 6 && E.hp(r.me) === 6, r.me && `${r.me.attack}/${E.hp(r.me)}`);
}
{
	const r = captainVs(f => { f.maxHealth = 5; f.damage = 2; });
	ok('a damaged creature at 3 current health: exact kill, 6/6', r.foeDead && r.me.attack === 6 && E.hp(r.me) === 6, `${r.me.attack}/${E.hp(r.me)}`);
}
{
	const r = captainVs(f => { f.maxHealth = 2; });
	ok('overkill (2 health): dies, no buff', r.foeDead && r.me.attack === 3 && E.hp(r.me) === 3, `${r.me.attack}/${E.hp(r.me)}`);
}
{
	const r = captainVs(f => { f.maxHealth = 4; });
	ok('a 4-health target survives, no buff', !r.foeDead && r.me.attack === 3 && E.hp(r.me) === 3, `${r.me.attack}/${E.hp(r.me)}`);
}
{
	const s = fresh();
	const kc = give(s, 0, 'knight_captain');
	E.playCard(s, 0, kc.uid, { type: 'hero', player: 1 });
	const me = s.players[0].board.find(c => c.id === 'knight_captain');
	ok('a battlecry to the face is no Honorable Kill', me.attack === 3 && E.hp(me) === 3, `${me.attack}/${E.hp(me)}`);
}
{
	// combat exact kill still pays exactly once
	const s = fresh();
	const kc = summon(s, 0, 'knight_captain'); kc.sick = false;
	const foe = summon(s, 1, 't_wall'); foe.maxHealth = 3; // 0/3: the Captain survives the trade
	E.attack(s, 0, kc.uid, tgt(foe));
	ok('combat exact kill: +3/+3 once', kc.attack === 6 && E.hp(kc) === 6, `${kc.attack}/${E.hp(kc)}`);
}

// ===== 2. Wand of Wonder + the other "N damage split" cards =====
function tapWand(foes, rng) {
	const s = fresh(rng);
	const w = give(s, 0, 'sc_wulfgar_10');
	ok('Wand plays', E.playCard(s, 0, w.uid, null) !== false);
	const wand = s.players[0].artifacts.find(a => a.id === 'sc_wulfgar_10');
	const made = foes.map(id => summon(s, 1, id));
	const life0 = s.players[1].life, dmg0 = made.reduce((a, c) => a + c.damage, 0);
	ok('Wand taps', E.tapArtifact(s, 0, wand.uid) === true);
	ok('... once per untap', E.tapArtifact(s, 0, wand.uid) === false);
	return (life0 - s.players[1].life) + made.reduce((a, c) => a + c.damage, 0) - dmg0;
}
ok('Wand vs a lone hero: 3 damage total', tapWand([]) === 3, tapWand([]));
let r1 = 1; const lcg = () => ((r1 = (r1 * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 20; i++) { const t = tapWand(['t_wall'], lcg); if (t !== 3) { ok('Wand vs hero + creature: 3 total', false, t); break; } }
ok('Wand vs hero + creature: 3 total over 20 seeds', true);
{
	// a target that dies mid-resolution: the remaining hits go elsewhere; total still capped at 3
	let tot = 0; for (let i = 0; i < 20; i++) { const s = tapWand(['t_ogre'], lcg); tot = Math.max(tot, s); }
	ok('never more than 3 damage with a dying target', tot <= 3, tot);
}
const SPLIT = { sc_wulfgar_10: 3, sc_e_baeloth_1: 2, afr_delina_wildmage: 3, afr_magic_missile: 3, mv_ironman_6: 3, mv_e_ock_1: 4, mv_e_electro_1: 3, mv_e_shocker_5: 4, msc_grapeshot: 3 };
for (const [id, n] of Object.entries(SPLIT)) {
	const d = byId[id];
	const rd = (d.tapAbility ? d.tapAbility.effects : d.effects).filter(e => e.type === 'random-damage');
	const total = rd.reduce((a, e) => a + (e.value || 1) * (e.count || 1), 0);
	ok(`${d.name}: printed "${n} damage split" deals ${n} total`, total === n && new RegExp(`${n} damage (randomly )?split`).test(d.description), `${JSON.stringify(rd)} | ${d.description}`);
	if (/enemy creatures/.test(d.description)) ok(`${d.name}: "split among enemy creatures" never hits the hero`, rd.every(e => e.pool === 'enemy-creatures'));
}
{
	const ock = Multiverse.powerOf ? Multiverse.powerOf('Doctor Octopus') : null;
	const rd = ock?.effects?.filter(e => e.type === 'random-damage') || [];
	ok('Doctor Octopus Tentacle Barrage: "2 damage split" deals 2 total', rd.length && rd.reduce((a, e) => a + e.value * e.count, 0) === 2, JSON.stringify(ock));
}
// every card whose text says "N damage ... split" totals N (catches the next one)
for (const d of raw.cards) {
	const m = (d.tapAbility?.text || d.description || '').match(/Deal (\d+) damage (randomly )?split/);
	const rd = (d.tapAbility ? d.tapAbility.effects : d.effects || []).filter(e => e.type === 'random-damage' && !e.countByAttack && !e.perHandCard);
	if (!m || rd.length !== 1) continue;
	const total = (rd[0].value || 1) * (rd[0].count || 1);
	if (total !== +m[1]) ok(`${d.id}: "${m[0]}" deals ${m[1]} total`, false, JSON.stringify(rd[0]));
}

// ===== 3. Staff of Renewal =====
function staff(deadIds, boardIds = []) {
	const s = fresh();
	for (const id of deadIds) { const c = summon(s, 0, id); const k = give(s, 0, 't_kill'); E.playCard(s, 0, k.uid, tgt(c)); }
	ok('setup: the board is clear of the dead', s.players[0].board.length === 0, s.players[0].board.map(c => c.id));
	for (const id of boardIds) summon(s, 0, id);
	const st = give(s, 0, 'ulda_staff_of_renewal');
	E.playCard(s, 0, st.uid, null);
	return s.players[0].board.filter(c => !boardIds.includes(c.id) || c.keywords.includes('taunt'));
}
{
	const b = staff(['sc_e_safana_9', 'sc_wulfgar_1']);
	ok('two deaths: exactly two creatures return (the tester\'s case)', b.length === 2, b.map(c => c.id));
	ok('... highest Cost first, each once, all with Taunt', b[0]?.id === 'sc_wulfgar_1' && b[1]?.id === 'sc_e_safana_9' && b.every(c => c.keywords.includes('taunt')), b.map(c => c.id));
}
{
	const b = staff(['sc_e_safana_9']);
	ok('one death: one creature, not seven copies', b.length === 1, b.map(c => c.id));
}
{
	const b = staff(['sc_e_safana_9', 'sc_e_safana_9']);
	ok('the same card died twice: two real copies return', b.length === 2 && b.every(c => c.id === 'sc_e_safana_9'), b.map(c => c.id));
}
{
	const b = staff([]);
	ok('no deaths: nothing returns', b.length === 0, b.map(c => c.id));
}
{
	const nine = ['t_ogre', 't_ogre', 't_ogre', 'sc_wulfgar_1', 'sc_e_safana_9', 't_ogre', 't_ogre', 'sc_wulfgar_1', 't_ogre'];
	const b = staff(nine);
	ok('nine deaths: seven return, the two 5-costs among them', b.length === 7 && b.filter(c => c.id === 'sc_wulfgar_1').length === 2, b.map(c => c.id));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
