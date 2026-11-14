// tools/micasurvivor/type_balance.mjs — Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, step A5, by calculation:
//   node tools/micasurvivor/type_balance.mjs
// the average multiplier on what a starter deals and takes, over every enemy species,
// under the softened chart (before 2026-11-13), the games' chart alone (#1193), and with the owner's calls (#1200).
import path from 'path';
import { pathToFileURL } from 'url';
import { fileURLToPath } from 'url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const { loadG } = await import(pathToFileURL(path.join(ROOT, 'overworld/tests/m3d_data.mjs')).href);
const G = loadG(), T = G.Types, C = T.CHART;
const raw = (a, d) => { const row = C[a]; let m = 1; for (const t of d) if (row && row[t] != null) m *= row[t]; return m; };
const S = { 2: 1.6, 0.5: 0.6, 0: 0.3 };
const soft = (a, d) => { const row = C[a]; let m = 1; for (const t of d) if (row && row[t] != null) m *= S[row[t]]; return Math.max(0.3, Math.min(2.4, m)); };
const foes = G.DEX.filter((p) => p.types && p.types.length && !p.starter);
const starters = G.DEX.filter((p) => p.starter);
const rows = [];
for (const p of starters) {
	const types = [...new Set(G.Moves.poolFor(p).map((id) => G.Moves.BY_ID[id.id || id]).filter((m) => m && m.kind !== 'buff' && m.type).map((m) => m.type))];
	const deal = { soft: 0, chart: 0, calls: 0 }, take = { soft: 0, chart: 0, calls: 0 }; let walled = 0, struggle = 0;
	for (const e of foes) {
		// dealt: the mean over the types of its damaging moves (all four fire)
		let a = 0, b = 0, c = 0; const noAns = types.every((t) => T.mult(t, e.types, e.dex) === 0);
		for (const t of types) { a += soft(t, e.types); b += raw(t, e.types); const m = T.mult(t, e.types, e.dex); c += (noAns ? T.STRUGGLE : m) * (p.types.includes(t) ? T.STAB : 1); if (m === 0) walled++; }
		deal.soft += a / types.length; deal.chart += b / types.length; deal.calls += c / types.length; if (noAns) struggle++;
		// taken: the enemy attacks with its first type
		const at = e.types[0]; take.soft += soft(at, p.types); take.chart += raw(at, p.types); take.calls += T.multIn(at, p.types);
	}
	const n = foes.length;
	rows.push({ name: p.name, types: p.types.join('/'), pool: types.join('/'), deal: [deal.soft / n, deal.chart / n, deal.calls / n], take: [take.soft / n, take.chart / n, take.calls / n], walled: walled / (n * types.length), struggle: struggle / n });
}
const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length, pc = (x) => (x >= 1 ? '+' : '') + ((x - 1) * 100).toFixed(0) + '%';
console.log(`${starters.length} starters against ${foes.length} enemy species`);
console.log(`dealt, average multiplier:  soft ${avg((r) => r.deal[0]).toFixed(2)}   chart ${avg((r) => r.deal[1]).toFixed(2)}   calls ${avg((r) => r.deal[2]).toFixed(2)}   (calls vs soft ${pc(avg((r) => r.deal[2]) / avg((r) => r.deal[0]))})`);
console.log(`taken, average multiplier:  soft ${avg((r) => r.take[0]).toFixed(2)}   chart ${avg((r) => r.take[1]).toFixed(2)}   calls ${avg((r) => r.take[2]).toFixed(2)}   (calls vs soft ${pc(avg((r) => r.take[2]) / avg((r) => r.take[0]))})`);
console.log(`a move does nothing to the enemy: ${(avg((r) => r.walled) * 100).toFixed(1)}% of move-enemy pairs; Struggle (no move works): ${(avg((r) => r.struggle) * 100).toFixed(2)}% of enemies`);
const by = (f) => rows.slice().sort((a, b) => f(b) - f(a));
const show = (r) => `  ${r.name.padEnd(12)} ${r.types.padEnd(16)} moves ${r.pool.padEnd(24)} dealt ${r.deal[0].toFixed(2)} -> ${r.deal[2].toFixed(2)} (${pc(r.deal[2] / r.deal[0])})   taken ${r.take[0].toFixed(2)} -> ${r.take[2].toFixed(2)} (${pc(r.take[2] / r.take[0])})`;
console.log('gains most (dealt):'); for (const r of by((r) => r.deal[2] / r.deal[0]).slice(0, 5)) console.log(show(r));
console.log('gains least (dealt):'); for (const r of by((r) => -r.deal[2] / r.deal[0]).slice(0, 5)) console.log(show(r));
console.log('takes most more:'); for (const r of by((r) => r.take[2] / r.take[0]).slice(0, 4)) console.log(show(r));
console.log('takes most less:'); for (const r of by((r) => -r.take[2] / r.take[0]).slice(0, 4)) console.log(show(r));
