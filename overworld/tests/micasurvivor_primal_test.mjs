// micasurvivor_primal_test.mjs — Primal Kyogre and Primal Groudon are in MicaSurvivor, and work exactly like a Mega.
//
// 2026-11-03 forms audit: tools/micasurvivor/gen_megas.mjs read only PokéAPI's "-mega" varieties, and the two Primals are
// "-primal" (10077 / 10078), so they were never generated: no Lv-40 card for a Kyogre / Groudon, never a Mega elite or boss.
// Now they are rows of mega-data.js (kind: 'primal') and every Mega path takes them; only the name says "Primal".
//   0. the data: both rows, PokéAPI's real stats and types, the overworld battle front on disk (s12225 / s12257) and an
//      animated SpriteCollab sheet (sprites-meta.js)
//   1. G.Megas (the base runs): named "Primal Kyogre", drawable foes (so the Mega elites / bosses can roll them), the
//      Lv-40 level-up card for a Kyogre (not before), with the PRIMAL REVERSION tag; evolve() takes the Primal's types
//   2. G.ExpMega (the Expedition): the League's Kyogre / Groudon lines offer them, named "Primal Kyogre"
//   node overworld/tests/micasurvivor_primal_test.mjs
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const EN = {};
const ctx = {
	console,
	G: {
		I18n: { lang: 'en', add: o => Object.assign(EN, o), t: s => EN[s] || s, f: (s, ...v) => { let i = 0; return (EN[s] || s).replace(/\{x\}/g, () => v[i++]); } },
		U: { TYPE_NAME: new Proxy({}, { get: (o, k) => String(k) }), clamp: (x, a, b) => Math.max(a, Math.min(b, x)) },
		Sprites: { Animator: class { constructor(d) { this.dex = d; } loop() {} }, hasShiny: () => false, bodyRadius: () => 10, bodyHeight: () => 20, preload() {} },
	},
};
vm.createContext(ctx);
for (const f of ['js/data/pokedex.js', 'js/data/sprites-meta.js', 'js/expedition/league-data.js', 'js/data/mega-data.js', 'js/systems/forms.js', 'js/expedition/mega.js'])
	vm.runInContext(fs.readFileSync(path.join(ROOT, 'micasurvivor', f), 'utf8'), ctx, { filename: f });
const G = ctx.G;

// ---------- 0. the data ----------
const MD = G.EXP_MEGA_DATA;
const K = MD.find(e => e.id === 10077), Gr = MD.find(e => e.id === 10078);
A(K && K.sp === 382 && K.kind === 'primal' && JSON.stringify(K.types) === '["water"]' && JSON.stringify(K.base) === '[100,150,90,180,160,90]',
	'0. Primal Kyogre (10077): Water, 100/150/90/180/160/90', JSON.stringify(K));
A(Gr && Gr.sp === 383 && Gr.kind === 'primal' && JSON.stringify(Gr.types) === '["ground","fire"]' && JSON.stringify(Gr.base) === '[100,180,160,150,90,90]',
	'0. Primal Groudon (10078): Ground / Fire, 100/180/160/150/90/90', JSON.stringify(Gr));
A(MD.filter(e => e.kind === 'primal').length === 2 && MD.filter(e => e.kind !== 'primal').length === 93, '0. the 93 Megas are unchanged beside them');
A(K && K.spr === 's12225.png' && Gr && Gr.spr === 's12257.png' && [K, Gr].every(e => fs.existsSync(path.join(AROOT, 'overworld/data/pokemon', e.spr))),
	'0. each uses the overworld\'s own battle front (s12225 / s12257, on disk)');
A(G.SPRITE_META[10077] && G.SPRITE_META[10078] && !G.SPRITE_META[10077].al && !G.SPRITE_META[10078].al, '0. each has its own animated sheet row in sprites-meta.js (SpriteCollab "Primal")');
for (const id of [10077, 10078]) A(fs.existsSync(path.join(AROOT, 'micasurvivor/assets/pokemon', String(id), 'Idle.png')), `0. assets/pokemon/${id}/Idle.png exists`);

// ---------- 1. the base runs ----------
const M = G.Megas;
A(M.BY[10077] && G.I18n.t(M.BY[10077].name) === 'Primal Kyogre' && G.I18n.t(M.BY[10078].name) === 'Primal Groudon', '1. named "Primal Kyogre" / "Primal Groudon"', M.BY[10077] && G.I18n.t(M.BY[10077].name));
A(M.foes().includes(10077) && M.foes().includes(10078), '1. both are drawable foes: the Mega elites and bosses can roll them');
const kyo = { dex: 382, level: 40, maxHp: 200, hp: 200, baseSpd: 100, baseAtk: 1, mon: G.DEX_BY[382] };
A(M.baseCards(Object.assign({}, kyo, { level: 39 })) === null, '1. no card before Lv 40');
const cards = M.baseCards(kyo);
const pc = cards && cards.find(c => c.mega === 10077);
A(pc && pc.title.includes('Primal Kyogre') && pc.tag === 'PRIMAL REVERSION' && cards.some(c => c.key === 'mega:later'), '1. Lv 40: the Primal Kyogre card (PRIMAL REVERSION) and "Not yet"', JSON.stringify(cards && cards.map(c => [c.title, c.tag])));
const gro = Object.assign({}, kyo, { dex: 383, mon: G.DEX_BY[383] });
A(M.evolve(gro, 10078) && gro.mega === 10078 && JSON.stringify(gro.mon.types) === '["ground","fire"]', '1. Groudon takes it: Ground / Fire for the rest of the run');

// ---------- 2. the Expedition ----------
const X = G.ExpMega;
A(X.of(382).map(e => e.id).join() === '10077' && X.of(383).map(e => e.id).join() === '10078', '2. the League\'s Kyogre and Groudon offer their Primal');
A(X.nameOf(X.BY[10077]) === 'Primal Kyogre' && X.nameOf(X.BY[10034]) === 'Mega Charizard X', '2. named "Primal Kyogre" (and a Mega is still "Mega Charizard X")', X.nameOf(X.BY[10077]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
