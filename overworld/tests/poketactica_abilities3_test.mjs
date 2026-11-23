// poketactica_abilities3_test.mjs — the second batch of abilities carried into Poketactica (RULES_REV 8,
// poketactica/js/engine/abilities3.js). Each is played next to the same unit with no ability and the same dice. Many of
// these the abilities sweep cannot see (its foes have no ability, its ally does not act), so they are checked here.
//   node overworld/tests/poketactica_abilities3_test.mjs
import { loadData } from '../../tools/poketactica/sweep_moves.mjs';
import * as B from '../../poketactica/js/engine/battle.js';
import * as A3 from '../../poketactica/js/engine/abilities3.js';
import * as Geo from '../../poketactica/js/engine/geo.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const data = loadData();

const fig = (sp, lv, ability, tag = '') => ({ ...makeFigurine(sp, lv, makeRng(sp + tag), data, { id: sp + tag, shinyRate: 0 }), ability });
/**
 * A 7 x 7 board. me: the player's Machamp, to deploy at (3, 3). o.foe / o.foeAb: the foe at (3, 2). o.ally: [species, ability] beside it at (2, 3).
 * o.foe2: [species, ability] at (4, 2), beside the foe. -> S (units: 0 me, then the ally if any, then the foes)
 */
function scene(mine, o = {}) {
	const S = B.newBattle('ab8', { map: { w: 7, h: 7, height: Array(49).fill(0), base: { x: 3, y: 3 }, ground: Array(49).fill(null) }, noBonus: true, rev: o.rev || B.RULES_REV,
		player: [fig(o.me || 'machamp', 50, mine), ...(o.ally ? [fig(o.ally[0], 50, o.ally[1], 'a')] : [])],
		enemy: [{ fig: fig(o.foe || 'squirtle', 50, o.foeAb || null), x: 3, y: 2, ai: 'hold' }, ...(o.foe2 ? [{ fig: fig(o.foe2[0], 50, o.foe2[1], '2'), x: 4, y: 2, ai: 'hold' }] : [])] }, data);
	const U = { S, me: S.units[0], ally: o.ally ? S.units[1] : null, foe: S.units[o.ally ? 2 : 1], foe2: o.foe2 ? S.units[o.ally ? 3 : 2] : null };
	if (U.ally) { U.ally.x = 2; U.ally.y = 3; }
	if (o.before) o.before(U);
	B.act(S, { t: 'deploy', uid: U.me.uid }, data);
	S.rng = makeRng('same').state(); S.log.length = 0;
	return U;
}
/** me uses a move on the foe (or the foe on me). -> the HP it took off */
const hit = (U, id, back) => { const [u, v] = back ? [U.foe, U.me] : [U.me, U.foe], hp = v.hp; B.useMoveAt(U.S, u, { move: id, x: v.x, y: v.y }, data); return hp - v.hp; };
const dmg = (mine, id, o) => hit(scene(mine, o), id);

// ---------- the type a move has
{
	const plain = dmg(null, 'tackle', { foe: 'dratini' }), pix = dmg('pixilate', 'tackle', { foe: 'dratini' }), old = dmg('pixilate', 'tackle', { foe: 'dratini', rev: 7 });
	A(pix > plain * 2 && old === plain, 'Pixilate: Tackle is a Fairy move, super effective on a Dragon (and a battle recorded under rev 7 replays without it)', [plain, pix, old]);
	A(dmg(null, 'thunderbolt', { foe: 'sandshrew' }) === 0 && dmg('normalize', 'thunderbolt', { foe: 'sandshrew' }) > 0, 'Normalize: Thunderbolt is a Normal move, so it reaches a Ground type');
	A(dmg('liquidvoice', 'hypervoice', { foe: 'charmander' }) > dmg(null, 'hypervoice', { foe: 'charmander' }) * 1.5, 'Liquid Voice: Hyper Voice is a Water move');
	const U = scene('protean'); hit(U, 'thunderpunch');
	A(JSON.stringify(U.me.types) === '["Electric"]' && U.S.log.some((e) => e.t === 'retype'), 'Protean: it becomes the type of the move it uses', U.me.types);
}
// ---------- ignoring what the target has
{
	A(dmg(null, 'earthquake', { foeAb: 'levitate' }) === 0 && dmg('moldbreaker', 'earthquake', { foeAb: 'levitate' }) > 0 && dmg('teravolt', 'earthquake', { foeAb: 'levitate' }) > 0, 'Mold Breaker and Teravolt: Earthquake reaches a Levitate target');
	const U = scene('turboblaze', { foeAb: 'sturdy' }); U.me.stats = { ...U.me.stats, atk: 99999 }; hit(U, 'tackle');
	A(U.foe.hp === 0, 'Turboblaze: Sturdy does not hold');
	const wall = (ab) => { const U = scene(ab); U.foe.boosts.def = 6; return hit(U, 'tackle'); };
	A(wall('unaware') > wall(null) * 2.5, 'Unaware: the target\'s raised Defense does not count', [wall('unaware'), wall(null)]);
	const strong = (ab) => { const U = scene(ab); U.foe.boosts.atk = 6; return hit(U, 'tackle', true); };
	A(strong('unaware') * 2.5 < strong(null), 'Unaware: nor does the attacker\'s raised Attack against it');
	const U2 = scene('unseenfist'); U2.foe.guard = true; const U3 = scene(null); U3.foe.guard = true;
	A(hit(U2, 'tackle') > 0 && hit(U3, 'tackle') === 0, 'Unseen Fist: a contact move goes through Protect');
}
// ---------- the weather and the field around an attack
{
	const rain = (ab, w) => { const U = scene(ab); if (w) U.S.field.weather = { kind: 'rain', turns: 5 }; return hit(U, 'watergun'); };
	A(rain(null, true) > rain(null, false) && rain('airlock', true) === rain(null, false) && rain('cloudnine', true) === rain(null, false), 'Air Lock and Cloud Nine: the rain does nothing', [rain(null, true), rain('airlock', true), rain(null, false)]);
	const dark = dmg('darkaura', 'crunch'), broken = dmg('darkaura', 'crunch', { foeAb: 'aurabreak' }), none = dmg(null, 'crunch');
	A(dark > none && broken < none, 'Dark Aura raises a Dark move; Aura Break near turns that into a loss', [none, dark, broken]);
	const ruinA = dmg(null, 'tackle', { ally: ['eevee', 'swordofruin'] }), ruin0 = dmg(null, 'tackle', { ally: ['eevee', null] });
	A(ruinA > ruin0, 'Sword of Ruin near the target: physical moves hit it harder', [ruin0, ruinA]);
	A(dmg(null, 'tackle', { foe2: ['squirtle', 'tabletsofruin'] }) < dmg(null, 'tackle', { foe2: ['squirtle', null] }), 'Tablets of Ruin near the attacker: its physical moves are weaker');
	const bat = dmg(null, 'thunderbolt', { ally: ['eevee', 'battery'] }), bat0 = dmg(null, 'thunderbolt', { ally: ['eevee', null] }), batP = dmg(null, 'tackle', { ally: ['eevee', 'battery'] }), spot = dmg(null, 'tackle', { ally: ['eevee', 'powerspot'] });
	A(bat > bat0 && batP === dmg(null, 'tackle', { ally: ['eevee', null] }) && spot > batP, 'Battery beside it: its special moves are stronger; Power Spot: all of them', [bat0, bat, batP, spot]);
	A(dmg('plus', 'thunderbolt', { ally: ['eevee', 'minus'] }) > dmg('plus', 'thunderbolt', { ally: ['eevee', null] }), 'Plus beside a Minus: Sp. Atk 1.5×');
	const lost = (ab) => { const U = scene(ab, { ally: ['eevee', null] }); U.ally.hp = 0; return hit(U, 'tackle'); };
	A(lost('supremeoverlord') > lost(null), 'Supreme Overlord: stronger for each fallen ally');
	const sun = { ability: 'flowergift', stats: {}, side: 'p', x: 3, y: 3, hp: 1 }, SS = { units: [sun] };
	A(A3.atkMult(SS, sun, true, 'sun', null) === 1.5 && A3.atkMult(SS, sun, true, 'rain', null) === 1 && A3.defMult(SS, sun, false, 'sun', null) === 1.5, 'Flower Gift: Attack and Sp. Def 1.5× in the sun');
	const para = (ab, stats) => ({ ability: ab, stats, side: 'p', x: 0, y: 0, hp: 1 });
	A(A3.atkMult({ units: [] }, para('protosynthesis', { atk: 200, def: 1, spa: 1, spd: 1, spe: 1 }), true, 'sun', null) === 1.3 && A3.speedMult(para('quarkdrive', { atk: 1, def: 1, spa: 1, spd: 1, spe: 200 }), null, 'electric') === 1.5
		&& A3.speedMult(para('quarkdrive', { atk: 1, def: 1, spa: 1, spd: 1, spe: 200 }), null, null) === 1, 'Protosynthesis in the sun, Quark Drive on Electric Terrain: the best stat rises');
	A(A3.speedMult({ ability: 'surgesurfer', stats: {} }, null, 'electric') === 2 && A3.speedMult({ ability: 'unburden', heldUsed: true, stats: {} }, null, null) === 2 && A3.speedMult({ ability: 'unburden', stats: {} }, null, null) === 1, 'Surge Surfer on Electric Terrain and Unburden with its item used up: Speed doubles');
	const odds = (ab) => { const U = scene(null, { foeAb: ab }); U.foe.confused = 3; return B.forecast(U.S, U.me, 'tackle', 3, 2, data).targets[0].hit; };
	A(odds('tangledfeet') < odds(null), 'Tangled Feet: harder to hit while confused', [odds('tangledfeet'), odds(null)]);
}
// ---------- moves it will not take
{
	A(dmg(null, 'quickattack', { foeAb: 'queenlymajesty' }) === 0 && dmg(null, 'tackle', { foeAb: 'queenlymajesty' }) > 0 && dmg(null, 'quickattack', { foeAb: 'dazzling' }) === 0 && dmg(null, 'quickattack', { foeAb: 'armortail' }) === 0, 'Queenly Majesty, Dazzling, Armor Tail: a priority move does not land');
	A(dmg(null, 'quickattack', { foe2: ['squirtle', 'dazzling'] }) === 0 && dmg('moldbreaker', 'quickattack', { foeAb: 'dazzling' }) > 0, 'nor on the ally beside the holder; Mold Breaker gets through');
	const U = scene(null, { ally: ['eevee', 'telepathy'] });
	A(A3.refuses(U.S, U.me, U.ally, { category: 'Physical' }, false).ab === 'telepathy' && !A3.refuses(U.S, U.me, U.foe, { category: 'Physical' }, false), 'Telepathy: an ally\'s move does not hurt it');
	const G = scene(null, { foeAb: 'goodasgold' }); hit(G, 'growl');
	A(G.foe.boosts.atk === 0 && G.S.log.some((e) => e.t === 'immune'), 'Good as Gold: a status move does nothing to it');
	const O = scene(null, { foeAb: 'overcoat' }), P = scene(null); hit(O, 'stunspore'); hit(P, 'stunspore');
	A(O.foe.status == null && P.foe.status === 'par', 'Overcoat: powder moves do not stick');
	const M = scene(null, { foeAb: 'magicbounce' }); hit(M, 'growl');
	A(M.foe.boosts.atk === 0 && M.me.boosts.atk === -1, 'Magic Bounce: Growl comes back at its user');
	const L = scene('stalwart', { foe: 'charmander', foe2: ['squirtle', 'lightningrod'] }), N = scene(null, { foe: 'charmander', foe2: ['squirtle', 'lightningrod'] });
	A(hit(L, 'thunderbolt') > 0 && hit(N, 'thunderbolt') === 0, 'Stalwart: Lightning Rod does not draw its move away');
}
// ---------- when it is struck
{
	const D = scene(null, { foeAb: 'disguise' }), first = hit(D, 'tackle'), second = hit(D, 'tackle');
	A(first === Math.floor(D.foe.maxHP / 8) && second > first, 'Disguise: the first hit costs it an eighth of its HP and no more', [first, second]);
	const I = scene(null, { foeAb: 'iceface' });
	A(hit(I, 'tackle') === 0 && hit(I, 'tackle') > 0, 'Ice Face: the first physical hit does nothing');
	const C = scene(null, { foe: 'snorlax', foeAb: 'colorchange' }); hit(C, 'thunderpunch');
	A(JSON.stringify(C.foe.types) === '["Electric"]', 'Color Change: it becomes the type that struck it');
	const T = scene(null, { foeAb: 'cottondown' }); hit(T, 'tackle');
	A(T.me.boosts.spe === -1, 'Cotton Down: whoever is near slows down');
	const W = scene(null, { foeAb: 'sandspit' }); hit(W, 'tackle');
	A(W.S.field.weather && W.S.field.weather.kind === 'sand', 'Sand Spit: a sandstorm rises');
	const G = scene(null, { foeAb: 'seedsower' }); hit(G, 'tackle');
	A(Geo.terrainAt(G.S, 3, 2) === 'grassy', 'Seed Sower: grass grows around it');
	const Mu = scene('guts', { foeAb: 'mummy' }); hit(Mu, 'tackle');
	A(Mu.me.ability === 'mummy', 'Mummy: a contact hit makes the attacker a Mummy too');
	const Lr = scene('longreach', { foeAb: 'mummy' }); hit(Lr, 'tackle');
	A(Lr.me.ability === 'longreach', 'Long Reach touches no one');
	const Ws = scene('guts', { foeAb: 'wanderingspirit' }); hit(Ws, 'tackle');
	A(Ws.me.ability === 'wanderingspirit' && Ws.foe.ability === 'guts', 'Wandering Spirit: the two swap abilities');
	const In = scene(null, { foeAb: 'innardsout' }); In.foe.hp = 30; const before = In.me.hp; hit(In, 'tackle');
	A(In.foe.hp === 0 && In.me.hp === before - 30, 'Innards Out: felled, it deals back the HP it had left');
	const Oo = scene(null, { foeAb: 'liquidooze' }); Oo.me.hp = 60; hit(Oo, 'drainpunch');
	A(Oo.me.hp < 60, 'Liquid Ooze: draining it hurts instead of healing', Oo.me.hp);
	const Sy = scene(null, { foeAb: 'synchronize' }); hit(Sy, 'thunderwave');
	A(Sy.foe.status === 'par' && Sy.me.status === 'par', 'Synchronize: the paralysis goes back to whoever gave it');
	A(A3.sleepTurns({ ability: 'earlybird' }, 3) === 1 && A3.sleepTurns({ ability: null }, 3) === 3, 'Early Bird: it sleeps half as long');
	const Ma = scene(null, { foeAb: 'mirrorarmor' }); hit(Ma, 'growl');
	A(Ma.foe.boosts.atk === 0 && Ma.me.boosts.atk === -1, 'Mirror Armor: the drop goes back');
	const Sh = scene(null, { foe2: ['squirtle', 'soulheart'] }); Sh.foe.hp = 1; hit(Sh, 'tackle');
	A(Sh.foe2.boosts.spa === 1, 'Soul-Heart: +1 Sp. Atk when anyone faints');
	let chained = 0, never = 0;
	for (let i = 0; i < 30; i++) { const X = scene('toxicchain'), Y = scene(null); X.S.rng = Y.S.rng = makeRng('tc' + i).state(); hit(X, 'tackle'); hit(Y, 'tackle'); if (X.foe.status === 'psn') chained++; if (Y.foe.status) never++; }
	A(chained >= 3 && chained <= 20 && never === 0, 'Toxic Chain: its hits poison about 3 times in 10', chained);
}
// ---------- landing on the board
{
	A(scene('intrepidsword').me.boosts.atk === 1 && scene('dauntlessshield').me.boosts.def === 1 && scene('intrepidsword', { rev: 7 }).me.boosts.atk === 0, 'Intrepid Sword: +1 Attack on landing; Dauntless Shield: +1 Defense');
	const dl = scene('download').me.boosts;
	A(dl.atk + dl.spa === 1, 'Download: +1 to Attack or Sp. Atk, whichever the nearest foe guards less');
	A(scene('trace', { foeAb: 'sturdy' }).me.ability === 'sturdy', 'Trace: it takes the ability of a foe beside it');
	A(scene('intimidate', { foeAb: 'guarddog' }).foe.boosts.atk === 1, 'Guard Dog: Intimidate raises its Attack instead');
	const H = scene('hospitality', { ally: ['eevee', null], before: (U) => { U.ally.hp = 10; } });
	A(H.ally.hp === 10 + Math.floor(H.ally.maxHP / 4), 'Hospitality: the ally beside it is healed a quarter');
	A(scene('curiousmedicine', { ally: ['eevee', null], before: (U) => { U.ally.boosts.atk = -2; } }).ally.boosts.atk === 0, 'Curious Medicine: the ally\'s stat changes are cleared');
	A(scene('costar', { ally: ['eevee', null], before: (U) => { U.ally.boosts.atk = 2; } }).me.boosts.atk === 2, 'Costar: it copies the ally\'s stat changes');
	A(!scene('screencleaner', { before: (U) => { U.foe.fx = { reflect: 5 }; } }).foe.fx.reflect, 'Screen Cleaner: Reflect comes down');
}
// ---------- berries and the end of a turn
{
	const eat = (ab, foeAb) => { const U = scene(null, { foe: 'snorlax', foeAb: ab }); if (foeAb) U.me.ability = foeAb; U.foe.held = { berryHealFrac: 0.25 }; U.foe.hp = Math.floor(U.foe.maxHP / 2) + 5; hit(U, 'tackle'); return { U, got: U.S.log.filter((e) => e.t === 'heal' && e.uid === U.foe.uid).reduce((a, e) => a + e.n, 0) }; };
	const plain = eat(null), ripe = eat('ripen'), pouch = eat('cheekpouch'), nervous = eat(null, 'unnerve');
	A(plain.got === Math.floor(plain.U.foe.maxHP / 4) && ripe.got === plain.got * 2 && pouch.got === plain.got + Math.floor(pouch.U.foe.maxHP / 3), 'Ripen doubles a berry; Cheek Pouch mends a third on top', [plain.got, ripe.got, pouch.got]);
	A(nervous.got === 0 && !nervous.U.foe.heldUsed, 'Unnerve near: it cannot eat its berry');
	const Hv = scene('harvest'); Hv.me.held = { berryHealFrac: 0.25 }; Hv.me.heldUsed = true; Hv.S.field.weather = { kind: 'sun', turns: 5 }; B.act(Hv.S, { t: 'end' }, data);
	A(Hv.me.heldUsed === false, 'Harvest: in the sun its berry grows back at the end of its turn');
	const Bd = scene('baddreams'); Bd.foe.status = 'slp'; Bd.foe.sleepTurns = 9; const hp = Bd.foe.hp; B.act(Bd.S, { t: 'end' }, data);
	A(hp - Bd.foe.hp === Math.floor(Bd.foe.maxHP / 8), 'Bad Dreams: a sleeping foe near it loses an eighth');
	let cured = 0; const h = { ev() {}, cure() { cured++; } };
	A3.phaseEnd({ ability: 'naturalcure', status: 'par' }, null, () => 0.1, h); A3.phaseEnd({ ability: 'naturalcure', status: 'par' }, null, () => 0.9, h);
	A(cured === 1, 'Natural Cure: a 1 in 3 chance to shake a status at the end of its turn');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
