// The Pokermon generation filter in a MULTIPLAYER match (Micatro Multiplayer stage 7; the owner's ask 2026-11-08: the host
// of a Pokermon lobby filters generations, and no source offers either player a Pokémon of a generation that is off). The
// host's Pokermon options are the lobby's mod options, passed to both engines for the match (engine/pvp.js pvpMods); this
// runs pokermon_gen_filter_test.mjs's whole sweep (shop rolls + rerolls, Buffoon / Ancient packs, Balls, The Soul,
// attribute pools, get_random_poke_key, only-one-generation runs, the empty pool...) with every run a Balanced match under
// The Order — whose re-keyed streams (one joker queue per rarity, de-anted pools) must still ask the filter.
//   node micatro/tests/mods/pokermon_gen_filter_pvp_test.mjs
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(DIR, 'pokermon_gen_filter_test.mjs')], { encoding: 'utf8', timeout: 900000, env: { ...process.env, MICATRO_GENFILTER_PVP: '1' } });
process.stdout.write((r.stdout || '').split('\n').filter((l) => /FAIL/.test(l)).join('\n'));
const last = (r.stdout || '').trim().split('\n').pop();
console.log('\nin a Multiplayer match (Balanced, The Order): ' + last);
process.exit(r.status === 0 ? 0 : 1);
