// gen_forms.mjs — MicaSurvivor U3 (coverage sweep): generates micasurvivor/js/data/forms.js, the 58 REGIONAL FORMES
// (Alolan 18, Galarian 20 incl. Zen Galarian Darmanitan, Hisuian 16, Paldean 4) as entries of their own in G.DEX, and
// tools/micasurvivor/forms_sprites.json (what tools/micasurvivor/fetch_form_sprites.py fetches for them and for the Megas).
//   node tools/micasurvivor/gen_forms.mjs            (from the cached tools/micasurvivor/forms_pokeapi.json)
//   node tools/micasurvivor/gen_forms.mjs --fetch    (refresh the cache from PokéAPI + SpriteCollab's tracker first)
// Owner decisions (Plans/MICASURVIVOR_UNIFIED_PLAN.md, 2026-11-02):
//   the id      a forme's id is PokéAPI's form id (10091 Alolan Rattata ... 10253 Paldean Wooper), an INTEGER like every dex
//               number, so it flows unchanged through G.DEX_BY, the sprite paths (assets/pokemon/<id>/), save.owned, replays,
//               snapshots and the server (which takes 10001-10400 too). The Megas already use the same id space (10033-10325)
//   the entry   its own collection entry (unlocked when caught / pulled / evolved into; the overworld's 'raichu_alola' maps to
//               it, js/data/ow-species.js); types, base stats, height from PokéAPI; the game stats by fetch_pokedex.py's formula;
//               gen = its region's (Alola 7, Galar 8, Hisui 8, Paldea 9): the gacha banner it is pulled from
//   the line    `from` / `lv`: a forme evolves within its own line (Alolan Vulpix -> Alolan Ninetales at Vulpix's level; Galarian
//               Meowth -> Perrserker); a base species may branch into a forme (Pikachu -> Raichu or Alolan Raichu). The levels
//               are the League's own for the base species (js/expedition/league-data.js), so nothing here is invented
//   the family  G.FAMILY maps a forme to its base species' family root (Alolan Raichu: Pichu's), so the per-family upgrades and
//               the League member are the base line's
//   the art     ANIMATED SpriteCollab sheets (its "Alola" / "Galar" / "Hisui" / "Paldea" form folders); the overworld's static
//               battle fronts only where SpriteCollab has none (Galarian Stunfisk, Zen Galarian Darmanitan). The same file lists
//               the Megas' SpriteCollab folders (42 animated) and battle fronts (19 more); the other 32 draw their species' sheet
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const CACHE = path.join(ROOT, 'tools/micasurvivor/forms_pokeapi.json');
const OUT = path.join(ROOT, 'micasurvivor/js/data/forms.js');
const OUT_SPR = path.join(ROOT, 'tools/micasurvivor/forms_sprites.json');
const RE = /-(alola|galar|hisui|paldea)/;

// the line: [pre-evolution (a base dex or a forme id), or null: the forme starts its line]
const FROM = {
  10092: 10091, 10100: 25, 10102: 10101, 10104: 10103, 10106: 10105, 10108: 10107, 10110: 10109, 10111: 10110, 10113: 10112,
  10114: 102, 10115: 104, 10163: 10162, 10165: 10164, 10172: 10164, 10167: 109, 10168: 439, 10175: 10174, 10177: 10176, 10178: 10176,
  10230: 10229, 10232: 10231, 10233: 156, 10236: 502, 10237: 548, 10239: 10238, 10240: 627, 10241: 704, 10242: 10241, 10243: 712, 10244: 723
};
// base species reached FROM a forme (Galarian Meowth -> Perrserker ...): [forme, target]
const INTO = [[10161, 863], [10166, 865], [10168, 866], [10173, 864], [10175, 862], [10179, 867], [10234, 904], [10235, 903], [10253, 980]];
const REGION = { alola: { gen: 7, es: 'de Alola', en: 'Alolan' }, galar: { gen: 8, es: 'de Galar', en: 'Galarian' },
  hisui: { gen: 8, es: 'de Hisui', en: 'Hisuian' }, paldea: { gen: 9, es: 'de Paldea', en: 'Paldean' } };
const EXTRA = {   // the forms a region has more than one of
  'tauros-paldea-combat-breed': [' (raza Combatiente)', ' (Combat Breed)'], 'tauros-paldea-blaze-breed': [' (raza Ardiente)', ' (Blaze Breed)'],
  'tauros-paldea-aqua-breed': [' (raza Acuática)', ' (Aqua Breed)'], 'darmanitan-galar-zen': [' (modo Daruma)', ' (Zen Mode)']
};
// SpriteCollab's form folder names for each (tracker.json subgroups)
const COLLAB_NAME = { 'tauros-paldea-combat-breed': 'Paldea', 'tauros-paldea-blaze-breed': 'Paldea_Blaze', 'tauros-paldea-aqua-breed': 'Paldea_Aqua',
  'darmanitan-galar-zen': 'Galar_Zen' };

const api = async u => { for (let i = 0; i < 4; i++) { try { const r = await fetch(u); if (r.ok) return r.json(); } catch (e) { /* retry */ } } throw new Error('fetch ' + u); };
if (process.argv.includes('--fetch')) {
  const list = await api('https://pokeapi.co/api/v2/pokemon?limit=400&offset=1025');
  const forms = [];
  for (const r of list.results.filter(r => RE.test(r.name) && !/totem|cap|starter|gmax/.test(r.name))) {
    const p = await api(r.url), sp = +p.species.url.split('/').slice(-2)[0], s = await api(p.species.url);
    const en = (s.names.find(n => n.language.name === 'en') || {}).name || p.name;
    forms.push({ name: r.name, id: p.id, species: sp, en, types: p.types.map(t => t.type.name), stats: p.stats.map(x => x.base_stat),
      height: p.height, leg: !!(s.is_legendary || s.is_mythical) });
  }
  const tracker = await api('https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json');
  const R = ['Idle', 'Walk', 'Attack'], usable = v => R.some(k => Object.prototype.hasOwnProperty.call(v.sprite_files || {}, k));
  const shiny = v => !!(v.subgroups && v.subgroups['0001'] && Object.prototype.hasOwnProperty.call(v.subgroups['0001'].sprite_files || {}, 'Idle'));
  // every species' named form folders that have sheets: {dex: {name: {f, shiny}}}
  const collab = {};
  for (const [d, e] of Object.entries(tracker)) for (const [k, v] of Object.entries(e.subgroups || {}))
    if (v.name && usable(v)) (collab[+d] = collab[+d] || {})[v.name] = { f: k, shiny: shiny(v) };
  fs.writeFileSync(CACHE, JSON.stringify({ source: 'https://pokeapi.co/api/v2/pokemon/<id> (the -alola / -galar / -hisui / -paldea varieties); SpriteCollab tracker.json (form folders)',
    fetched: new Date().toISOString().slice(0, 10), forms, collab }, null, 1) + '\n');
  console.log('fetched ' + forms.length + ' regional formes');
}
const cache = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

// the game's own tables
const ctx = { G: {}, console };
vm.createContext(ctx);
for (const f of ['micasurvivor/js/data/pokedex.js', 'micasurvivor/js/data/families.js', 'micasurvivor/js/expedition/league-data.js', 'micasurvivor/js/data/mega-data.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { DEX_BY, FAMILY, EXP_LEAGUE_DATA: L, EXP_MEGA_DATA: MEGA } = ctx.G;
const EVO = {};
for (const m of L.members) for (const [f, ts] of Object.entries(m.evo)) for (const [t, l] of ts) EVO[f + '>' + t] = l;
const idx = JSON.parse(fs.readFileSync(path.join(AROOT, 'overworld/data/species_index.json'), 'utf8'));

// fetch_pokedex.py's formulas (Python's round: half to even)
const pyRound = (x, n = 0) => { const k = 10 ** n, v = x * k, f = Math.floor(v), d = v - f; const r = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(v); return r / k; };
const rarity = (bst, leg) => (leg || bst >= 580 ? 5 : bst >= 495 ? 4 : bst >= 410 ? 3 : bst >= 320 ? 2 : 1);
const owId = slug => {
  const s = slug.replace(/-standard$/, '').replace(/-breed$/, '');
  for (const c of [s.replace(/-/g, '_'), s.replace(/^mr-mime/, 'mrmime').replace(/-/g, '_')]) if (idx[c]) return c;
  throw new Error('no overworld id for ' + slug);
};

const rows = [];
for (const f of cache.forms) {
  const reg = RE.exec(f.name)[1], R = REGION[reg], base = DEX_BY[f.species];
  if (!base) throw new Error('no species ' + f.species);
  const [hp, atk, def, spa, spd, spe] = f.stats, bst = f.stats.reduce((a, b) => a + b, 0);
  const ex = EXTRA[f.name] || ['', ''];
  const enBase = f.en;
  const from = FROM[f.id] || 0, fromBase = from > 10000 ? cache.forms.find(x => x.id === from).species : from;
  const lv = from ? EVO[fromBase + '>' + f.species] : 0;
  if (from && !lv) throw new Error(f.name + ': no League level for ' + fromBase + '>' + f.species);
  rows.push({
    dex: f.id, name: base.name + ' ' + R.es + ex[0], en: R.en + ' ' + enBase + ex[1], types: f.types,
    hp: pyRound(70 + hp * 0.45), spd: pyRound(78 + spe * 0.42), atk: pyRound(0.70 + Math.max(atk, spa) / 100 * 0.55, 2),
    rarity: rarity(bst, f.leg), bst, starter: false, gen: R.gen, ...(f.leg ? { leg: true } : {}),
    sp: f.species, form: reg, base: f.stats, ...(from ? { from, lv } : {}), ow: owId(f.name)
  });
}
rows.sort((a, b) => a.dex - b.dex);
if (rows.length !== 58) throw new Error('formes: ' + rows.length);
const into = INTO.map(([a, t]) => {
  const fa = rows.find(r => r.dex === a), lv = EVO[fa.sp + '>' + t];
  if (!lv) throw new Error('no League level ' + fa.sp + '>' + t);
  return [a, t, lv];
});

// ---------------- the sprites list (fetch_form_sprites.py) ----------------
const collabOf = (sp, name) => (cache.collab[sp] || {})[name] || null;
const spr = [];
for (const r of rows) {
  const f = cache.forms.find(x => x.id === r.dex);
  const c = collabOf(r.sp, COLLAB_NAME[f.name] || (r.form[0].toUpperCase() + r.form.slice(1)));
  const front = idx[r.ow].sprite;
  if (!c && !fs.existsSync(path.join(AROOT, 'overworld/data/pokemon', front))) throw new Error(f.name + ': neither a SpriteCollab sheet nor ' + front);
  spr.push({ id: r.dex, sp: r.sp, kind: 'form', ow: r.ow, collab: c ? String(r.sp).padStart(4, '0') + '/' + c.f : null, shiny: !!(c && c.shiny), front, height: f.height });
}
for (const m of MEGA) {
  const c = collabOf(m.sp, m.suf ? 'Mega_' + m.suf : 'Mega');
  spr.push({ id: m.id, sp: m.sp, kind: 'mega', collab: c ? String(m.sp).padStart(4, '0') + '/' + c.f : null, shiny: !!(c && c.shiny), front: m.spr, height: null });
}
fs.writeFileSync(OUT_SPR, JSON.stringify({ generated: 'tools/micasurvivor/gen_forms.mjs', list: spr }, null, 1) + '\n');

// ---------------- forms.js ----------------
const J = o => JSON.stringify(o);
const keep = r => { const o = { ...r }; delete o.en; delete o.ow; return o; };
const lines = [
  '/* ============ data/forms.js — GENERATED by tools/micasurvivor/gen_forms.mjs, do not edit by hand ============',
  ' * MicaSurvivor U3 (coverage sweep): the ' + rows.length + ' regional formes (PokéAPI\'s -alola / -galar / -hisui / -paldea varieties,',
  ' * fetched ' + cache.fetched + '), each an entry of its own in G.DEX (after the 1,025 species) and in the collection (save.owned).',
  ' *   dex   PokéAPI\'s form id (an integer, like every dex number: sprites assets/pokemon/<dex>/, saves, replays, the server)',
  ' *   sp    the species it is a form of · form its region · base [hp, atk, def, spa, spd, spe] (the League\'s stats)',
  ' *   from / lv   its pre-evolution (a dex or a forme id) and the level (the base species\' League level)',
  ' * The rest of the row is fetch_pokedex.py\'s (game stats from base stats, rarity, gen = the region\'s banner).',
  ' * G.FORM_INTO: [forme, base species, level]: a forme evolving into a species of its own (Galarian Meowth -> Perrserker).',
  ' * Loaded after pokedex.js, families.js and mega-data.js; js/systems/forms.js is the API (G.Forms, G.Megas).',
  ' */',
  'G.FORMS = [',
  ...rows.map(r => '  ' + J(keep(r)) + ','),
  '];',
  'G.FORM_INTO = ' + J(into) + ';',
  'G.FORM_EN = {',
  ...rows.map(r => '  ' + J(r.name) + ': ' + J(r.en) + ','),
  '};',
  '(() => {',
  '  for (const p of G.FORMS) { G.DEX.push(p); G.DEX_BY[p.dex] = p; if (G.FAMILY) G.FAMILY[p.dex] = G.FAMILY[p.sp] || p.sp; }',
  '  if (G.I18n && G.I18n.add) G.I18n.add(G.FORM_EN);',
  '})();',
  ''
];
fs.writeFileSync(OUT, lines.join('\r\n'));

// ---------------- the overworld ids (js/data/ow-species.js): a forme's id -> the forme ----------------
const owPath = path.join(ROOT, 'micasurvivor/js/data/ow-species.js');
console.log(`${rows.length} formes (${rows.filter(r => r.from).length} with a pre-evolution, ${into.length} evolving into a species); ` +
  `sprites: ${spr.filter(s => s.kind === 'form' && s.collab).length} formes animated, ${spr.filter(s => s.kind === 'form' && !s.collab).length} static; ` +
  `${spr.filter(s => s.kind === 'mega' && s.collab).length} Megas animated, ${spr.filter(s => s.kind === 'mega' && !s.collab && s.front).length} static, ${spr.filter(s => s.kind === 'mega' && !s.collab && !s.front).length} composed`);
console.log('(then: node tools/micasurvivor/gen_ow_species.mjs, which maps ' + owPath.replace(ROOT, '').slice(1) + "'s forme ids)");
