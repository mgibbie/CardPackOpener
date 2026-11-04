// Nidoran's names carry the gender signs: Nidoran♀ / Nidoran♂ (Pokermon writes "Nidoran F" / "Nidoran M" because Balatro's
// m6x11 has no ♀ / ♂; Micatro's m6x11plus draws both since tools/micatro/add_gender_glyphs.py — the owner: "get the symbols").
// Display text only: the keys (j_poke_nidoranf / j_poke_nidoranm) and so saves, replays and the mod pin are unchanged.
// Covers micatro/mods/pokermon/index.js (GENDER_SIGN_NAMES) and the design wiki's copy (designwiki/data/micatro_mods/pokermon.json).
//   node micatro/tests/mods/pokermon_gender_names_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { T, start, add, G, P_CENTERS } from './poke_helpers.mjs';
import { MODS } from '../../js/mods/registry.js';
import { describe, describeCenter } from '../../js/engine/describe.js';
import { toView } from '../../js/engine/view.js';

const { ok, done } = T();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const J = MODS.pokermon.content.loc.descriptions.Joker;
const WANT = { j_poke_nidoranf: 'Nidoran♀', j_poke_nidoranm: 'Nidoran♂' };

for (const [k, name] of Object.entries(WANT)) {
  ok(P_CENTERS[k] && P_CENTERS[k].set === 'Joker', `${k}: the key is unchanged (still registered)`, P_CENTERS[k] && P_CENTERS[k].set);
  ok(J[k] && J[k].name === name, `${k}: its loc name is ${name}`, J[k] && J[k].name);
  ok(J[k] && J[k].text && J[k].text.length >= 2, `${k}: its text is kept`, J[k] && J[k].text);
  ok(describeCenter(k).name === name, `${k}: the collection names it ${name}`, describeCenter(k).name);
  start('NIDONAME');
  const j = add(k);
  ok(describe(j).name === name, `${k}: an owned card's tooltip names it ${name}`, describe(j).name);
  const v = JSON.stringify(toView());
  ok(!/Nidoran [FM]\b/.test(v), `${k}: the board view never says "Nidoran F" / "Nidoran M"`);
}
// no Pokermon text anywhere still spells the gender out for want of the sign
const all = JSON.stringify(MODS.pokermon.content.loc);
ok(!/Nidoran [FM]\b|Nidoran-[FM]\b/.test(all), 'no "Nidoran F" / "Nidoran M" left in the mod\'s text');
ok(!/\b(Female|Male)\b/.test(all), 'no "Female" / "Male" in the mod\'s text (Burmy says ♀ / ♂)', (all.match(/.{40}\b(Female|Male)\b.{20}/) || [])[0]);
// the design wiki's copy (tools/micatro/gen_designwiki_mods.mjs) is regenerated
const wiki = fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro_mods/pokermon.json'), 'utf8');
ok(wiki.includes('"name":"Nidoran♀"') && wiki.includes('"name":"Nidoran♂"') && !/Nidoran [FM]\b/.test(wiki), 'the design wiki names them Nidoran♀ / Nidoran♂');
ok(wiki.includes('♀ into Wormadam, ♂ into Mothim') && !/Female into|Male into/.test(wiki), 'the design wiki\'s Burmy says ♀ / ♂');
done();
