// Big-number scoring, built into the base game (owner decision 2026-10-16): EVERY run's chips,
// mult, hand score, round score, blind requirement and best hand go past 1.8e308 as Decimals
// (mantissa + exponent), up to 9.99e999; at 1e1000 and above a value becomes Infinity and shows
// "naneinf" (Balatro's overflow, moved from e308 to e1000).
//   node micatro/tests/bignum_test.mjs
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
import { G, number_format, get_blind_amount, add_joker } from '../js/engine/core.js';
import { newRun, act, STATES } from '../js/engine/run.js';
import { toView } from '../js/engine/view.js';
import { Session } from '../js/engine/session.js';
import { registerMod, ACTIVE } from '../js/mods/registry.js';
import * as B from '../js/engine/bignum.js';

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log('FAIL', m, x !== undefined ? String(x) : ''); } };
const big = (s) => B.from(s);
const eq = (a, b) => B.cmp(a, b) === 0;

// A test mod: two jokers handed out at the start of every run — X1e200 Mult, then ^4 Mult (Talisman's emult).
registerMod({
  id: 'bntest', name: 'BigNum Test', prefix: 'bn',
  content: {
    centers: [
      { key: 'j_bn_xbig', set: 'Joker', name: 'X Big', rarity: 4, cost: 1, pos: { x: 0, y: 0 }, config: {},
        calculate: (c, card, ctx) => (ctx.joker_main ? { Xmult_mod: 1e200, message: 'X1e200' } : undefined) },
      { key: 'j_bn_emult', set: 'Joker', name: 'Hyper', rarity: 4, cost: 1, pos: { x: 0, y: 0 }, config: {},
        calculate: (c, card, ctx) => (ctx.joker_main ? { emult: 4 } : undefined) },
    ],
  },
  hooks: {
    start_run() {
      for (const k of ['j_bn_xbig', 'j_bn_emult']) add_joker(k);
    },
  },
});

// ---------------------------------------------------------------- Decimal unit
newRun({ seed: 'BIGUNIT', back: 'b_red' });
ok(ACTIVE.length === 0 && B.bigOn(), 'big numbers are on in a vanilla run (base game, not a mod)');
{
  const a = B.mul(1e200, 1e250);
  ok(B.isBig(a) && a.m === 1 && a.e === 450, 'overflowing product becomes a Decimal 1e450', JSON.stringify(a));
  ok(number_format(a) === '1.000e450' && String(a) === '1.000e450', 'Balatro-style formatting 1.000e450', number_format(a));
  ok(number_format(B.mul(1.2345e300, 1e150)) === '1.235e450', 'formatting rounds the mantissa to 3 places', number_format(B.mul(1.2345e300, 1e150)));
  ok(number_format(B.mul(9.9996e300, 1e100)) === '1.000e401', 'a mantissa rounding to 10 carries into the exponent', number_format(B.mul(9.9996e300, 1e100)));
  ok(eq(B.add(a, a), big('2e450')), '1e450 + 1e450 = 2e450');
  ok(eq(B.add(a, 12345), a), 'adding a small number to a huge one is absorbed');
  ok(B.sub(a, a) === 0 && typeof B.sub(a, a) === 'number', 'x - x = 0 (a plain number again)');
  ok(B.div(a, 1e100) === 1e350 / 1 || B.isBig(B.div(a, 1e100)), '1e450 / 1e100 stays big (1e350)');
  ok(B.div(a, 1e300) === 1e150, 'dropping back under 1e308 returns a plain number', B.div(a, 1e300));
  ok(eq(B.pow(big('1e300'), 3), big('1e900')), '(1e300)^3 = 1e900');
  ok(eq(B.pow(10, 999), big('1e999')) && B.isBig(B.pow(10, 999)), '10^999 via an overflowing Math.pow');
  ok(number_format(B.mul(big('9.99e999'), 1)) === '9.990e999', '9.99e999 is the top of the scale', number_format(B.mul(big('9.99e999'), 1)));
  ok(B.pow(2, 10) === 1024 && B.mul(3, 4) === 12 && B.add(0.1, 0.2) === 0.1 + 0.2, 'in-range ops are plain JS arithmetic, bit for bit');
  ok(B.gt(a, 1e308) && B.gt(a, Number.MAX_VALUE) && B.lt(1e308, a) && B.gte(a, a) && !B.gt(a, a), 'comparisons across numbers and Decimals');
  ok(B.gt(B.pow(a, 2), a) && B.lt(B.neg(a), 0) && B.lt(B.neg(B.pow(a, 2)), B.neg(a)), 'comparisons by exponent, sign-aware');
  ok(B.gt(Infinity, a) && B.lt(a, Infinity) && !B.gt(NaN, a) && !B.lt(NaN, a), 'Infinity outranks every Decimal; NaN compares false');
  ok(B.beats(a, big('9.99e449')) && !B.beats(big('9.99e449'), a) && B.beats(a, 300), 'beats(): the blind check');
  ok(B.floor(a) === a && B.floor(2.7) === 2, 'floor');
  ok(eq(B.min(a, B.pow(a, 2)), a) && eq(B.max(a, 5), a), 'min / max');
  // serialisation
  const j = JSON.stringify({ s: a });
  ok(j === '{"s":"1e450"}', 'JSON form is the "<m>e<e>" string', j);
  const p = big('1.2345678901234567e450');
  ok(eq(B.from(JSON.parse(JSON.stringify(p))), p) && B.from(JSON.parse(JSON.stringify(p))).m === p.m, 'JSON round-trip keeps the full mantissa');
  ok(B.from('123') === 123 && B.from(5) === 5 && B.from('1e10') === 1e10, 'from() keeps plain numbers plain');
  // the cap: 1e1000 and above is Infinity -> "naneinf"
  ok(B.pow(10, 1000) === Infinity && B.pow(a, 3) === Infinity && B.pow(10, 1e43) === Infinity, '10^1000, (1e450)^3, 10^1e43 are Infinity');
  ok(B.mul(big('9.99e999'), 2) === Infinity && B.add(big('9.99e999'), big('9.99e999')) === Infinity, 'overflowing 9.99e999 -> Infinity');
  ok(B.neg(B.mul(big('9e999'), 10)) === -Infinity, 'negative overflow -> -Infinity');
  ok(number_format(B.pow(10, 1000)) === 'naneinf', 'Infinity shows naneinf');
  ok(B.from('1e1000') === Infinity && B.from('9.99e999').e === 999, 'from() caps too');
  ok(B.beats(Infinity, Infinity) === false, "inf - inf >= 0 is false (Balatro's naneinf blind)");
  ok(B.toNumber(a) === Infinity && +a === Infinity && a > 1e308, 'valueOf: plain arithmetic on a Decimal degrades to inf (mods never throw)');
}

// ---------------------------------------------------------------- a vanilla run past 1e308
newRun({ seed: 'VANILLA1', back: 'b_red' });
ok(B.isBig(B.mul(1e200, 1e200)) && B.isBig(B.add(Number.MAX_VALUE, Number.MAX_VALUE)) && B.isBig(B.pow(10, 400)), 'vanilla ops go past 1e308 as Decimals');
let bigAnte = 0, infAnte = 0;
for (let a = 9; a < 2000 && !infAnte; a++) {
  const x = get_blind_amount(a);
  if (!bigAnte && B.isBig(x)) bigAnte = a;
  if (x === Infinity) infAnte = a;
}
ok(bigAnte > 9 && infAnte > bigAnte, 'vanilla endless blinds: big past 1e308, Infinity only past 9.99e999', `${bigAnte} ${infAnte}`);
ok(B.isBig(get_blind_amount(infAnte - 1)) && get_blind_amount(infAnte - 1).e <= 999, 'the last finite blind is under 1e1000', String(get_blind_amount(infAnte - 1)));
{
  act({ type: 'select_blind' });
  const hc = G.GAME.hands['High Card'];
  hc.chips = 1e300; hc.mult = 1e300;
  const card = G.hand.cards[0];
  act({ type: 'highlight', ids: [card.sort_id] });
  const r = act({ type: 'play' });
  const tot = r.events.find((e) => e.type === 'hand_total');
  ok(tot && B.isBig(tot.total) && tot.total.e === 600, 'vanilla hand total goes to 1e600', tot && String(tot.total));
  ok(B.isBig(G.GAME.stats.best_hand) && number_format(G.GAME.stats.best_hand) === '1.000e600', 'vanilla best hand shows 1.000e600', number_format(G.GAME.stats.best_hand));
  ok(B.isBig(G.GAME.chips) && number_format(G.GAME.chips) === '1.000e600', 'vanilla round score 1.000e600');
  const v = JSON.parse(JSON.stringify(toView()));
  ok(v.chips === '1e600' && v.stats.best_hand === '1e600', 'vanilla view carries the big values as strings', v.chips);
}
// past the cap: naneinf
{
  newRun({ seed: 'VANILLA2', back: 'b_red' });
  act({ type: 'select_blind' });
  const hc = G.GAME.hands['High Card'];
  hc.chips = big('1e500'); hc.mult = big('1e500');
  act({ type: 'highlight', ids: [G.hand.cards[0].sort_id] });
  const r = act({ type: 'play' });
  const tot = r.events.find((e) => e.type === 'hand_total');
  ok(tot && tot.total === Infinity, 'a 1e1000 hand overflows to Infinity', tot && String(tot.total));
  ok(G.GAME.chips === Infinity && number_format(G.GAME.chips) === 'naneinf', 'round score past the cap is naneinf');
  ok(G.GAME.stats.best_hand === Infinity && number_format(G.GAME.stats.best_hand) === 'naneinf', 'best hand past the cap is naneinf');
  const v = JSON.parse(JSON.stringify(toView()));
  ok(v.chips === null && v.stats.best_hand === null, 'Infinity serialises as before (null)');
}

// ---------------------------------------------------------------- a modded run to 1e800 (X1e200 then ^4)
const s1 = new Session();
s1.start({ seed: 'BIGRUN1', back: 'b_red', stake: 1, mods: ['bntest'] });
ok(G.jokers.cards.map((c) => c.config.center.key).join() === 'j_bn_xbig,j_bn_emult', 'the test jokers are in play');
s1.act({ type: 'select_blind' });
const need = G.GAME.blind.chips;
const card = G.hand.cards[0];
s1.act({ type: 'highlight', ids: [card.sort_id] });
const r1 = act({ type: 'play' }); // (through the engine to see the events; recorded below)
s1.recipe.actions.push({ type: 'play' });
const tot1 = r1.events.find((e) => e.type === 'hand_total');
ok(tot1 && B.isBig(tot1.total) && B.gt(tot1.total, 1e308), 'the hand scores past 1e308', tot1 && String(tot1.total));
ok(tot1 && B.gt(tot1.total, big('1e800')) && B.lt(tot1.total, big('1e1000')), 'the hand scores past 1e800 (X1e200 then ^4 Mult)', tot1 && String(tot1.total));
ok(tot1 && B.isBig(tot1.mult) && tot1.mult.e === 800 && typeof tot1.chips === 'number', 'mult (1e200)^4 = 1e800; chips stay a plain number', tot1 && String(tot1.mult));
ok(tot1 && eq(tot1.total, B.floor(B.mul(tot1.chips, tot1.mult))), 'total = floor(chips x mult)');
ok(B.isBig(G.GAME.chips) && eq(G.GAME.chips, tot1.total), 'the round score holds the big total');
ok(B.isBig(G.GAME.stats.best_hand) && eq(G.GAME.stats.best_hand, tot1.total), 'best hand records the big total');
ok(B.isBig(G.GAME.round_scores.hand.amt), 'round_scores.hand records it too');
ok(G.STATE === STATES.ROUND_EVAL && G.GAME.round_eval && G.GAME.round_eval.rows[0].dollars > 0 && !G.GAME.round_eval.rows[0].saved, 'the big score beats the blind (round won, blind reward paid)', G.STATE);
ok(r1.events.some((e) => e.type === 'status' && /\^4 Mult/.test(e.message || '')), 'the ^Mult popup shows');
ok(number_format(G.GAME.chips).match(/^\d\.\d{3}e80\d$/), 'round score formats like 1.234e801', number_format(G.GAME.chips));
ok(typeof need === 'number' && need === 300, 'ante 1 blind is still a plain 300');

// view: JSON-safe big values of a sane size
{
  const v = toView();
  ok(typeof v.chips === 'string' && typeof v.stats.best_hand === 'string', 'toView carries big values as strings', typeof v.chips);
  const w = JSON.parse(JSON.stringify(v));
  ok(eq(B.from(w.chips), G.GAME.chips) && eq(B.from(w.stats.best_hand), G.GAME.stats.best_hand), 'view JSON round-trips the big values exactly');
  ok(w.chips.length <= 32, 'a big value is a short string', w.chips);
  const evs = JSON.parse(JSON.stringify(r1.events));
  const te = evs.find((e) => e.type === 'hand_total');
  ok(typeof te.total === 'string' && eq(B.from(te.total), tot1.total), 'scoring events serialise the big total too (spectators)');
}

// replay determinism: the recipe rebuilds the same run (same big numbers)
{
  const view1 = JSON.stringify(toView());
  const s2 = Session.fromRecipe(JSON.parse(JSON.stringify(s1.recipe)));
  ok(s2.recipe.actions.length === s1.recipe.actions.length, 'every recorded action replays', s2.recipe.actions.length);
  ok(JSON.stringify(toView()) === view1, 'replay reproduces the identical view (big score included)');
  ok(B.isBig(G.GAME.chips) && eq(G.GAME.chips, tot1.total), 'replayed round score is the same Decimal');
}

// endless antes: the blind requirement keeps growing past 1e308
{
  newRun({ seed: 'BIGANTE', back: 'b_red', mods: ['bntest'] });
  const at = get_blind_amount(bigAnte), before = get_blind_amount(bigAnte - 1), after = get_blind_amount(bigAnte + 5);
  ok(B.isBig(at) && B.gt(at, before) && B.gt(after, at), 'blind amounts past the old overflow ante are growing Decimals', `${before} ${String(at)} ${String(after)}`);
  ok(Math.round(at.m * 10) === at.m * 10, 'a big blind amount keeps 2 significant digits (like the vanilla rounding)', at.m);
  G.GAME.round_resets.ante = bigAnte + 5;
  const v = JSON.parse(JSON.stringify(toView()));
  ok(typeof v.choices.Small.chips === 'string' && eq(B.from(v.choices.Small.chips), after), 'the blind choices carry the big requirement', v.choices.Small.chips);
  act({ type: 'select_blind' });
  ok(B.isBig(G.GAME.blind.chips) && /e\d+$/.test(G.GAME.blind.chip_text), 'the live blind requirement is big + formatted', G.GAME.blind.chip_text);
  const vv = JSON.parse(JSON.stringify(toView()));
  ok(typeof vv.blind.chips === 'string' && eq(B.from(vv.blind.chips), G.GAME.blind.chips), 'view.blind.chips is its JSON string');
  // a ^4 hand vs that
  const c = G.hand.cards[0];
  act({ type: 'highlight', ids: [c.sort_id] });
  act({ type: 'play' });
  const won = B.beats(G.GAME.chips, G.GAME.blind.chips);
  ok(won === B.gt(G.GAME.chips, G.GAME.blind.chips) || eq(G.GAME.chips, G.GAME.blind.chips), 'beats() agrees with the comparison');
  ok(G.STATE === STATES.ROUND_EVAL || G.STATE === STATES.SELECTING_HAND, 'the run carries on with big blinds', G.STATE);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
