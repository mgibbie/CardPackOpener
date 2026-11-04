// gen_ball_flags.mjs — the hide flags of every PLAIN pickup item ball.
//
// A pickup sets its ball's hide flag in the story (items.js interactAt), as the
// decomp's finditem/removeobject does. Saves from before that fix have the ball
// in the collected record but not the story flag (2026-10-04: Instinct's Secret
// Key, so Cinnabar Gym stayed locked). items.js healPickupFlags sets the flag on
// boot — but ONLY for plain pickup balls: a scripted ball's flag must never be
// set from the collected record. This lists them, using the game's own parser.
//
//   node tools/gen_ball_flags.mjs        -> overworld/ball_flags.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pickupBall } from '../overworld/ball_parse.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAPS = path.join(ROOT, 'overworld', 'data', 'maps');
const flags = new Set();
let balls = 0, scripted = 0;
for (const f of fs.readdirSync(MAPS).filter(f => f.endsWith('_map.json'))) {
	let m; try { m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8')); } catch (e) { continue; }
	const stem = f.replace(/_map\.json$/, '');
	for (const o of m.object_events || []) {
		const g = String(o.graphics_id || '');
		if (!g.includes('ITEM_BALL') && !g.includes('POKE_BALL')) continue;
		balls++;
		if (!pickupBall(o, !!m._crystal_tileset, stem)) { scripted++; continue; }
		if (o.flag && o.flag !== '0' && /^(FLAG_|EVENT_)/.test(o.flag)) flags.add(o.flag);
	}
	for (const b of m.bg_events || []) if (b.type === 'hidden_item' && b.flag && /^(FLAG_|EVENT_)/.test(b.flag)) flags.add(b.flag);
}
const out = { generated: 'tools/gen_ball_flags.mjs', flags: [...flags].sort() };
fs.writeFileSync(path.join(ROOT, 'overworld', 'ball_flags.json'), JSON.stringify(out));
console.log(`${balls} balls (${scripted} scripted, skipped); ${out.flags.length} pickup/hidden-item flags -> overworld/ball_flags.json`);
