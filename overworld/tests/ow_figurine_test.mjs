// ow_figurine_test.mjs — Poketactica FIGURINES found in the overworld (stage 5; owner, 2026-11-20): a wild catch
// gives its figurine 1 time in 10; a gym leader beaten for the first time gives their ace's figurine; any other trainer
// 1 time in 20 gives one of their team's. The figurine lands in the collection on the device, with a Journal line and a
// note for Poketactica. And the hooks are where the game really passes: the catch (battle.js) and the trainer win
// (ow_progression.js, the first-gym check made BEFORE the badge is awarded). Node only.
//   node overworld/tests/ow_figurine_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 300) : '')); } };

// a pretend browser storage (the Journal and the figurine collection both use it)
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const OF = await import('../ow_figurine.js');
const SV = await import('../../poketactica/js/figsave.js');
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json') };
const mon = (speciesId, level) => ({ speciesId, level });
const collection = () => Object.values(SV.figs().figs);

// ---- a wild catch: 1 in 10
A(OF.CATCH_FIG_CHANCE === 0.1 && OF.TRAINER_FIG_CHANCE === 0.05, 'the odds: 1 in 10 on a catch, 1 in 20 from a trainer (owner)');
A(OF.figCatch(mon('pidgey', 7), data, () => 0.5) === null && collection().length === 0, 'a catch that misses the 1 in 10 gives nothing');
const f1 = await OF.figCatch(mon('pidgey', 7), data, () => 0.05);
A(f1 && f1.species === 'pidgey' && f1.level === 7 && f1.from === 'catch' && collection().some((f) => f.id === f1.id), 'a catch inside the 1 in 10 gives that Pokémon\'s figurine, at its level, into the collection', f1 && { s: f1.species, l: f1.level });
A(data.abilities.pidgey.includes(f1.ability) && f1.equipped.length >= 1 && !('ivs' in f1), 'it is a real figurine (its species\' ability, moves, no IVs)');
const journal = JSON.parse(localStorage.getItem('magepunk_journal_v1') || '[]');
A(JSON.stringify(journal).includes('Poketactica figurine: Pidgey'), 'a Journal line says so');
A(SV.takeFound().includes(f1.id), 'and Poketactica is left a note to show it');
let hits = 0; const r = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
for (let i = 0; i < 400; i++) if (OF.figCatch(mon('rattata', 3), data, r)) hits++;
A(hits > 20 && hits < 65, `about 1 catch in 10 over 400 (${hits})`);

// ---- trainers and gyms
const gymTeam = [mon('geodude', 12), mon('onix', 14), mon('geodude', 11)];
const g = await OF.figTrainer(gymTeam, data, true, () => 0.99);
A(g && g.species === 'onix' && g.level === 14 && g.from === 'gym', 'a gym leader beaten for the first time: their ace\'s figurine (the highest level), whatever the roll');
A(OF.figTrainer(gymTeam, data, false, () => 0.5) === null, 'a trainer outside the 1 in 20 gives nothing');
const t = await OF.figTrainer(gymTeam, data, false, () => 0.01);
A(t && ['geodude', 'onix'].includes(t.species) && t.from === 'trainer', 'a trainer inside the 1 in 20 gives one of their team\'s figurines');
A(OF.figTrainer([], data, true) === null, 'no team, nothing');

// ---- the hooks are where the game passes
const battle = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
A(/if \(a\.caughtMon\) pocketCatch\(a\.caughtMon\);[^\n]*\n\s*if \(a\.caughtMon\) figCatch\(a\.caughtMon, this\.data\);/.test(battle), 'battle.js: every wild catch rolls for its figurine (beside the Pocket card roll)');
const prog = fs.readFileSync(path.join(ROOT, 'overworld/ow_progression.js'), 'utf8');
const i1 = prog.indexOf('firstGym = !!(gi && gi.kind === \'gym\' && !Badges.has('), i2 = prog.indexOf('onTrainerDefeated(t.ev.script);', i1), i3 = prog.indexOf('figTrainer(foeParty, battle.data, firstGym);', i2);
A(i1 > 0 && i2 > i1 && i3 > i2, 'ow_progression.js: a trainer win rolls for a figurine; "first gym win" is read BEFORE the badge is awarded');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
