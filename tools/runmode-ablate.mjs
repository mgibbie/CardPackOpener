// runmode-ablate.mjs — which cards make a Lorequest enemy deck strong?
//
// Runs tools/runmode-sim.mjs once as a baseline, then once per distinct card in the given decks
// with that card made +3 mana (restricted to those decks), then once per enemy with its hero
// power +2 mana. A big jump in hero wins means the deck leans on that card. In the 2026-10-13
// passes this pointed at cheap early bodies (Taunting Kobold, Qutrub Forayer, ...) and a few hero
// powers (Queen Brahne's, Jenova's) far more than at burn or removal.
//
// Usage:
//   node tools/runmode-ablate.mjs --mode=finalfantasy --enemies="Queen Brahne|Garland, Royal Kidnapper"
//        [--rung=A] [--games=4] [--overrides=base.json]
// --overrides is the starting point each variant builds on (see runmode-sim.mjs). Slow on later
// rungs (long games): several minutes per card there.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : true]; }));
const TAGS = { finalfantasy: 'ffDeck', swordcoast: 'scDeck', middleearth: 'meDeck', lorequest: 'loreDeck', multiverse: 'mvDeck' };
const mode = args.mode, TAG = TAGS[mode];
if (!TAG || !args.enemies) { console.error('usage: --mode=<lorequest|middleearth|swordcoast|finalfantasy|multiverse> --enemies="A|B" [--rung=A] [--games=4] [--overrides=base.json]'); process.exit(2); }
const enemies = String(args.enemies).split('|');
const rung = args.rung || 'A', games = String(args.games || 4);
const cards = JSON.parse(fs.readFileSync(path.join(HERE, '../battlecards/cards.json'), 'utf8')).cards;
const strip = c => { for (const e of enemies) for (const p of [e + "'s ", e + "' ", e.split(',')[0] + "'s ", e.split(',')[0] + "' "]) if (c.name.startsWith(p)) return c.name.slice(p.length); return c.name; };
const names = [...new Set(cards.filter(c => enemies.includes(c[TAG])).map(strip))];
const base = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, 'utf8')) : {};
const tmp = path.join(os.tmpdir(), `runmode-ablate-${process.pid}.json`);

const wins = ov => {
	fs.writeFileSync(tmp, JSON.stringify({ ...ov, __decks: enemies }));
	const out = execFileSync(process.execPath, [path.join(HERE, 'runmode-sim.mjs'), `--mode=${mode}`, `--rung=${rung}`, `--games=${games}`, `--enemies=${args.enemies}`, `--overrides=${tmp}`],
		{ stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1e8 }).toString();
	return +(out.match(/"win":(\d+)/) || [0, 0])[1];
};
const b = wins(base);
console.log(`${mode} rung ${rung} ${args.enemies}: baseline hero wins ${b}`);
const rows = [];
for (const n of names) {
	const ov = structuredClone(base); ov[n] = { cost: ((ov[n] && ov[n].cost) || 0) + 3 };
	const d = wins(ov) - b; rows.push([d, `+3 mana: ${n}`]); console.log(`  ${String(d).padStart(4)}  +3 mana: ${n}`);
}
for (const e of enemies) {
	const ov = structuredClone(base); ov.__powers = { ...(ov.__powers || {}), [e]: { cost: ((ov.__powers?.[e]?.cost) || 0) + 2 } };
	const d = wins(ov) - b; rows.push([d, `hero power +2: ${e}`]); console.log(`  ${String(d).padStart(4)}  hero power +2: ${e}`);
}
try { fs.unlinkSync(tmp); } catch { /* temp file */ }
console.log('\nBIGGEST LEVERS:', rows.sort((x, y) => y[0] - x[0]).slice(0, 10).map(r => `${r[1]} (${r[0] > 0 ? '+' : ''}${r[0]})`).join('; '));
