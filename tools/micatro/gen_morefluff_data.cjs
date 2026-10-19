// More Fluff 1.9.9999 (the rewrite) -> micatro/mods/morefluff/data.js + loc.js.
// Runs tools/micatro/extract_mod_data.cjs on the mod's own Lua (every SMODS.* call it makes), on exactly the
// joker files src/jokers.lua loads (FLUFF.joker_pool + FLUFF.hidden_joker_pool — the folder also holds unloaded
// old versions that reuse keys), then groups the captured items for the port. Behaviour is ported by hand.
//   NODE_PATH=<dir containing fengari> node tools/micatro/gen_morefluff_data.cjs <MoreFluff checkout at tag 1.9.9999>
// (a checkout of the tag: `git -C MoreFluff archive 1.9.9999 | tar -x -C <dir>`)
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const MOD = process.argv[2];
if (!MOD) { console.error('usage: node tools/micatro/gen_morefluff_data.cjs <MoreFluff 1.9.9999 dir>'); process.exit(1); }
const VERSION = '1.9.9999';
const OUT = path.join(__dirname, '../../micatro/mods/morefluff');

// ---- the joker lists (collection order), from src/jokers.lua
const jl = fs.readFileSync(path.join(MOD, 'src/jokers.lua'), 'utf8').replace(/--[^\n]*/g, '');
const list = (name) => {
  const m = new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\n\\}').exec(jl);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((s) => !s.startsWith('crossmod/'));
};
const active = list('FLUFF.joker_pool'), hidden = list('FLUFF.hidden_joker_pool');

const spec = {
  files: { all: ['src/tetr_stuff.lua', 'src/rarities.lua', 'src/attributes.lua', 'src/planeswalker.lua', 'src/prepared.lua', 'src/sliver_abilities.lua',
    ...[...active, ...hidden].map((s) => `src/jokers/${s}.lua`),
    'src/colours.lua', 'src/modifiers.lua', 'src/rotarots.lua', 'src/decks.lua', 'src/superboss.lua', 'src/stakes.lua'] },
  loc: 'localization/default.lua',
};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mfgen-'));
fs.writeFileSync(path.join(tmp, 'spec.json'), JSON.stringify(spec));
execFileSync(process.execPath, [path.join(__dirname, 'extract_mod_data.cjs'), MOD, path.join(tmp, 'raw.js'), path.join(tmp, 'spec.json')], { stdio: 'inherit', env: process.env });
const RAW = new Function(fs.readFileSync(path.join(tmp, 'raw.js'), 'utf8').replace(/^\/\/.*\n/, '').replace('export default ', 'return '))();
if (RAW.errors.length) { console.error('extract errors:', RAW.errors); process.exit(1); }

/** Static fields only: functions ("__fn"), stubs and the extractor's bookkeeping are dropped. */
function clean(v) {
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') {
    if (v.__stub) return undefined;
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === '__kind' || k === 'loc_txt' || x === '__fn' || x === '__cycle') continue;
      const c = clean(x);
      if (c !== undefined) o[k] = c;
    }
    return o;
  }
  return v;
}
const fns = (v) => Object.entries(v).filter(([, x]) => x === '__fn').map(([k]) => k).sort();
const by = (kind) => RAW.captured.filter((c) => c.__kind === kind);
const item = (c) => { const o = clean(c); const f = fns(c); if (f.length) o.fns = f; return o; };

const jokers = {};
for (const c of by('Joker')) {
  const key = 'j_mf_' + c.key;
  if (jokers[key]) continue;
  jokers[key] = { ...item(c), key, atlas: c.atlas || null };
}
const DATA = {
  version: VERSION,
  pools: { active: active.map((s) => 'j_mf_' + s), hidden: hidden.map((s) => 'j_mf_' + s) },
  jokers,
  consumables: by('Consumable').map(item),
  boosters: by('Booster').map(item),
  tags: by('Tag').map(item),
  vouchers: by('Voucher').map(item),
  enhancements: by('Enhancement').map(item),
  editions: by('Edition').map(item),
  blinds: by('Blind').map(item),
  backs: by('Back').map(item),
  stakes: by('Stake').map(item),
  stickers: by('Sticker').map(item),
  rarities: by('Rarity').map(item),
  consumable_types: by('ConsumableType').map(item),
  attributes: by('Attribute').map((c) => c.key),
};
const missing = [...active, ...hidden].filter((s) => !jokers['j_mf_' + s]);
if (missing.length) { console.error('jokers without data:', missing); process.exit(1); }

const head = (what) => `// GENERATED from More Fluff ${VERSION} (notmario & contributors) ${what} by tools/micatro/gen_morefluff_data.cjs\n// (via tools/micatro/extract_mod_data.cjs) — static data only. Behaviour is ported by hand. Do not edit.\n`;
fs.writeFileSync(path.join(OUT, 'data.js'), head('src/**/*.lua') + 'export default ' + JSON.stringify(DATA, null, 1) + ';\n');
fs.writeFileSync(path.join(OUT, 'loc.js'), head('localization/default.lua (the mod\'s own English text, unchanged)') + 'export default ' + JSON.stringify(RAW.loc, null, 1) + ';\n');
console.log(`data.js: ${Object.keys(jokers).length} jokers (${active.length} active, ${hidden.length} hidden), ${DATA.consumables.length} consumables, ${DATA.boosters.length} packs, ${DATA.stakes.length} stakes; loc.js written`);
fs.rmSync(tmp, { recursive: true, force: true });
