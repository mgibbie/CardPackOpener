// battleui_helpers_test.mjs — the battle scene's pure presentation helpers
// (battleui.js had NO tests at all). Node-only: layout math, HP color
// thresholds, text wrap, and the type-color table the whole scene keys off.
//   node overworld/tests/battleui_helpers_test.mjs
import { layout, hpColor, wrap, monPanel, C, TYPE_COLORS, STATUS_BADGE } from '../battleui.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// layout: portrait vs landscape vs wide-short landscape phone
{
	const p = layout(720, 1280);
	A(p.portrait === true && p.compact === false, 'a tall canvas lays out portrait');
	A(p.barY === 1280 - p.barH && p.barH > 0, 'portrait: the bottom bar sits at the bottom', JSON.stringify(p));
	const d = layout(720, 480); // 1.5 aspect = the GBA frame on desktop
	A(d.portrait === false && d.compact === false, 'the 3:2 desktop frame is landscape, NOT compact');
	A(d.ubar === d.u, 'desktop keeps the bar at scene scale');
	const w = layout(920, 480); // aspect > 1.7 = a landscape phone freed from the frame
	A(w.compact === true && w.ubar > w.u, 'a wide-short canvas grows the bar for finger-sized buttons', `u=${w.u} ubar=${w.ubar}`);
}

// hp bar color: green above half, yellow to 20%, red below
A(hpColor(1) === C.hpGreen && hpColor(0.51) === C.hpGreen, 'HP above half draws green');
A(hpColor(0.5) === C.hpYellow && hpColor(0.21) === C.hpYellow, 'half down to 20% draws yellow');
A(hpColor(0.2) === C.hpRed && hpColor(0.01) === C.hpRed, '20% and below draws red');

// wrap: honest word wrapping under a measured width
{
	const ctx = { measureText: t => ({ width: t.length * 7 }) };
	A(JSON.stringify(wrap(ctx, 'a b c', 1000)) === JSON.stringify(['a b c']), 'wrap keeps a short line whole');
	const lines = wrap(ctx, 'one two three four', 7 * 8);
	A(lines.length > 1 && lines.join(' ') === 'one two three four', 'wrap splits without losing words', JSON.stringify(lines));
	A(JSON.stringify(wrap(ctx, 'supercalifragilistic', 7)) === JSON.stringify(['supercalifragilistic']),
		'a single over-wide word still lands on its own line');
}

// the color tables cover the full type chart + the standard statuses
{
	const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground',
		'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy'];
	A(TYPES.every(t => /^#[0-9a-f]{6}$/i.test(TYPE_COLORS[t] || '')), 'all 18 types have a color',
		TYPES.filter(t => !TYPE_COLORS[t]).join(','));
	A(['psn', 'brn', 'par', 'slp', 'frz'].every(s => STATUS_BADGE[s]), 'the five classic statuses have badges',
		['psn', 'brn', 'par', 'slp', 'frz'].filter(s => !STATUS_BADGE[s]).join(','));
}

// monPanel is self-contained: even if the caller left textAlign='center' /
// textBaseline='middle' (the PokéChess capture battle did), the mon name must
// still render left-aligned so it isn't clipped off the box's left edge.
{
	const rec = [];
	const target = {
		textAlign: 'center', textBaseline: 'middle', fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
		measureText: t => ({ width: String(t).length * 7 }),
		fillText: t => rec.push({ text: String(t), align: target.textAlign, baseline: target.textBaseline }),
		createLinearGradient: () => ({ addColorStop() { } }),
		createRadialGradient: () => ({ addColorStop() { } }),
	};
	const ctx = new Proxy(target, { get: (t, k) => (k in t ? t[k] : () => { }), set: (t, k, v) => { t[k] = v; return true; } });
	const mon = { name: 'SCRATCHBUN', gender: 'F', level: 5, types: ['Fire'], curHP: 20, maxHP: 20 };
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; // simulate the leaked caller state
	monPanel(ctx, mon, 14, 14, 272, 1, {});
	const nameDraw = rec.find(r => r.text.includes('SCRATCHBUN'));
	A(!!nameDraw, 'monPanel drew the mon name');
	A(nameDraw && nameDraw.align === 'left', 'the name is left-aligned regardless of the caller (no left-edge clip)', nameDraw && nameDraw.align);
	A(nameDraw && nameDraw.baseline === 'alphabetic', 'the name uses the alphabetic baseline the offsets assume', nameDraw && nameDraw.baseline);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
