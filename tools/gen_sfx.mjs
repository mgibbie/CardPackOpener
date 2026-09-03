// gen_sfx.mjs — the little sounds, synthesized in the GB chip idiom.
//
// The game shipped with five battle SFX and nothing else: menus, doors,
// ledges, shops, level-ups — all mute. The originals are square-wave PSG
// sequences, so rather than scraping rips these are SYNTHESIZED: each sound
// is a short recipe of square-wave chirps and noise bursts (the same voices
// the Game Boy had), rendered by ffmpeg at 22kHz. Tuning lives in the SPECS
// table — tweak a frequency, rerun, redeploy.
//
//   node tools/gen_sfx.mjs             (list what would render)
//   node tools/gen_sfx.mjs --write     (render overworld/data/sounds/sfx/*.ogg)
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const WRITE = process.argv.includes('--write');
const OUT = path.resolve('overworld/data/sounds/sfx');

// segment kinds: sq = square-wave chirp f0->f1 over d seconds; ns = noise
// burst; gap = silence. vol is linear (squares are LOUD — keep them low).
const sq = (f0, f1, d, vol = 0.22) => ({ k: 'sq', f0, f1, d, vol });
const ns = (d, vol = 0.25) => ({ k: 'ns', d, vol });
const gap = d => ({ k: 'gap', d });
// note helper for the jingles
const N = { G4: 392, C5: 523, E5: 659, G5: 784, C6: 1047, E6: 1319, G6: 1568, C7: 2093 };

const SPECS = {
	// ---- menus ----
	ui_move: [sq(1000, 1000, 0.045)],                                  // cursor tick
	ui_select: [sq(880, 880, 0.04), sq(1320, 1320, 0.07)],             // confirm
	ui_cancel: [sq(520, 520, 0.07)],                                   // back out
	ui_denied: [sq(150, 138, 0.14, 0.3)],                              // can't do that
	ui_open: [sq(620, 620, 0.045), sq(940, 940, 0.06)],                // menu up
	text_tick: [sq(1100, 1100, 0.03, 0.14)],                           // dialog advance
	// ---- field ----
	bump: [ns(0.05, 0.4), sq(95, 70, 0.07, 0.35)],                     // wall thud
	ledge: [sq(950, 280, 0.16, 0.26)],                                 // hop chirp
	door: [sq(400, 900, 0.09), ns(0.05, 0.2)],                         // door / warp shoop
	pc_on: [sq(300, 1200, 0.16), sq(1400, 1400, 0.06)],                // storage boot
	notice: [sq(1250, 1250, 0.05), gap(0.03), sq(1250, 1250, 0.09)],   // trainer "!"
	// ---- jingles ----
	heal: [sq(N.C6, N.C6, 0.11), sq(N.E6, N.E6, 0.11), sq(N.G6, N.G6, 0.11), sq(N.C7, N.C7, 0.22)],
	money: [sq(1500, 1500, 0.03), gap(0.02), sq(1500, 1500, 0.03), sq(2100, 2100, 0.12)],
	item_get: [sq(N.E5, N.E5, 0.09), sq(N.G5, N.G5, 0.09), sq(N.C6, N.C6, 0.2)],
	levelup: [sq(N.C5, N.C5, 0.07), sq(N.E5, N.E5, 0.07), sq(N.G5, N.G5, 0.07), sq(N.C6, N.C6, 0.18)],
	// ---- battle little sounds ----
	stat_up: [sq(700, 900, 0.05), sq(900, 1150, 0.07)],
	stat_dn: [sq(900, 700, 0.05), sq(700, 500, 0.07)],
	faint: [sq(600, 80, 0.35, 0.28)],
	flee: [sq(1200, 400, 0.12), ns(0.05, 0.18)],
	// ---- fanfares: the big moments were single blips before ----
	// badge: a proud rising call with an answering flourish
	fanfare_badge: [sq(N.G5, N.G5, 0.09), sq(N.C6, N.C6, 0.09), sq(N.E6, N.E6, 0.09), sq(N.G6, N.G6, 0.16),
		gap(0.05), sq(N.E6, N.E6, 0.08), sq(N.G6, N.G6, 0.08), sq(N.C7, N.C7, 0.3)],
	// evolve: a slow swell that bursts into the new form
	fanfare_evolve: [sq(N.C5, N.E5, 0.16), sq(N.E5, N.G5, 0.16), sq(N.G5, N.C6, 0.16),
		gap(0.04), sq(N.C6, N.C6, 0.09), sq(N.E6, N.E6, 0.09), sq(N.G6, N.G6, 0.28)],
	// capture: the classic three-step gotcha roll
	fanfare_capture: [sq(N.C6, N.C6, 0.07), sq(N.G5, N.G5, 0.07), sq(N.E5, N.E5, 0.07), sq(N.C5, N.C5, 0.1),
		gap(0.05), sq(N.C5, N.C5, 0.06), sq(N.E5, N.E5, 0.06), sq(N.G5, N.G5, 0.06), sq(N.C6, N.C6, 0.24)],
};

function segSrc(seg) {
	if (seg.k === 'gap') return `aevalsrc=0:d=${seg.d}`;
	if (seg.k === 'ns') return `anoisesrc=d=${seg.d}:c=pink:a=${seg.vol}`;
	// linear chirp: phase = f0*t + (f1-f0)*t^2/(2d). ffmpeg's eval has no
	// sign(), so the square wave is 2*gt(sin,0)-1.
	const phase = seg.f0 === seg.f1
		? `${seg.f0}*t`
		: `${seg.f0}*t+${((seg.f1 - seg.f0) / (2 * seg.d)).toFixed(3)}*t*t`;
	return `aevalsrc=${seg.vol}*(2*gt(sin(2*PI*(${phase}))\\,0)-1):d=${seg.d}`;
}

const names = Object.keys(SPECS);
console.log(`${names.length} little sounds: ${names.join(', ')}`);
if (!WRITE) { console.log('\n(dry run — pass --write)'); process.exit(0); }

fs.mkdirSync(OUT, { recursive: true });
for (const [name, segs] of Object.entries(SPECS)) {
	const args = [];
	segs.forEach(s => args.push('-f', 'lavfi', '-i', segSrc(s)));
	// tiny per-segment fades kill the clicks; a final fade-out settles the tail
	const chains = segs.map((s, i) =>
		`[${i}]afade=t=in:d=0.004,afade=t=out:st=${Math.max(0, s.d - 0.012).toFixed(3)}:d=0.012[s${i}]`).join(';');
	const concat = segs.map((_, i) => `[s${i}]`).join('') + `concat=n=${segs.length}:v=0:a=1[outa]`;
	args.push('-filter_complex', `${chains};${concat}`, '-map', '[outa]',
		'-ar', '22050', '-ac', '1', '-c:a', 'libvorbis', '-q:a', '3', '-y', '-loglevel', 'error',
		path.join(OUT, name + '.ogg'));
	execFileSync('ffmpeg', args);
}
const total = names.reduce((s, n) => s + fs.statSync(path.join(OUT, n + '.ogg')).size, 0);
console.log(`rendered ${names.length} sounds (${(total / 1024).toFixed(0)} KB) — owdata deploys separately:`);
console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
